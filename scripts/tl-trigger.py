#!/usr/bin/env python3
"""
TruckingLanes trigger service — add this route to the copy deployed at /root/scripts/tl-trigger.py
or run standalone (see bottom).

Oldcastle loads: NOT handled here. There is no openclaw-upload route on this service — Oldcastle
imports only via Supabase Edge Function sync-google-loads (Google Sheet xlsx fetch). OpenClaw
upload to that function is disabled in-repo.

Environment:
  TL_TRIGGER_KEY        Shared secret (must match extension header)
  SUPABASE_URL          https://vjgakkomhphvdbwjjwiv.supabase.co
  SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SERVICE_KEY   Service role key (never expose to clients)
  DAT_BEARER_TOKEN      Optional; DAT freight API bearer (or DAT_TOKEN_FILE, default /root/.dat_bearer_token)
  SIMPLETEXTING_API_KEY     Optional env override; SimpleTexting messages + contacts API
  SIMPLETEXTING_CONTACTS_URL  Optional; default https://api-app2.simpletexting.com/v2/api/contacts
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import subprocess
import sys
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from urllib.parse import quote

try:
    from flask import Flask, jsonify, request
except ImportError:
    print("Install Flask: pip install flask requests", file=sys.stderr)
    raise

import requests

app = Flask(__name__)

TL_TRIGGER_KEY = os.environ.get("TL_TRIGGER_KEY", "tl-trigger-7b747d391801b8e5f55b4542")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://vjgakkomhphvdbwjjwiv.supabase.co").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get(
    "SUPABASE_SERVICE_KEY", ""
)
SIMPLETEXTING_API_KEY = os.environ.get(
    "SIMPLETEXTING_API_KEY",
    "a1637fca1a5131f4c85e499221ff47d1",
).strip()
SIMPLETEXTING_MESSAGES_URL = os.environ.get(
    "SIMPLETEXTING_MESSAGES_URL",
    "https://api-app2.simpletexting.com/v2/api/messages",
).rstrip("/")
SIMPLETEXTING_CONTACTS_URL = os.environ.get(
    "SIMPLETEXTING_CONTACTS_URL",
    "https://api-app2.simpletexting.com/v2/api/contacts",
).rstrip("/")

# Full key set for /insert-aljex-loads so PostgREST upsert rows share identical columns.
_ALJEX_LOAD_UPSERT_TEMPLATE = {
    "agency_id": None,
    "template_type": None,
    "load_number": None,
    "dispatch_status": "open",
    "status": None,
    "pickup_city": None,
    "pickup_state": None,
    "pickup_zip": None,
    "dest_city": None,
    "dest_state": None,
    "dest_zip": None,
    "ship_date": None,
    "commodity": None,
    "weight_lbs": None,
    "miles": None,
    "is_per_ton": False,
    "customer_invoice_total": 0,
    "target_pay": 0,
    "max_pay": 0,
    "target_commission": 0,
    "max_commission": 0,
    "commission_target_pct": 0,
    "commission_max_pct": 0,
    "rate_raw": None,
    "is_active": True,
    "trailer_type": None,
    "trailer_footage": None,
    "source_row": None,
    "pickup_location_raw": None,
    "dest_location_raw": None,
    "delivery_date": None,
}


def _normalize_aljex_load_row(load: dict) -> dict:
    out = dict(_ALJEX_LOAD_UPSERT_TEMPLATE)
    for k, v in load.items():
        if k in out:
            out[k] = v
    # Default new inserts to open; legacy clients may still send "available".
    ds = out.get("dispatch_status")
    if ds in (None, "", "available"):
        out["dispatch_status"] = "open"
    return out


def _tt_str(v) -> str | None:
    if v is None:
        return None
    t = str(v).strip()
    return t or None


def _truckertools_api_raw_from_row(row: dict) -> dict | None:
    """API row is nested in source_row JSON as { "raw": { originCity, ... } }."""
    if str(row.get("template_type") or "") != "truckertools":
        return None
    sr = row.get("source_row")
    if not isinstance(sr, str):
        return None
    try:
        outer = json.loads(sr)
    except json.JSONDecodeError:
        return None
    if not isinstance(outer, dict):
        return None
    raw = outer.get("raw")
    return raw if isinstance(raw, dict) else None


def _target_max_pay_universal(is_per_ton: bool, rate_raw: float | None, customer_invoice_total: float) -> tuple[float, float]:
    """Flat: COALESCE(rate_raw, invoice)*0.80/0.85; per-ton: rate-10 / rate-5. Matches _shared/targetPay.ts."""
    if is_per_ton:
        r = float(rate_raw or 0)
        if r <= 0:
            return 0.0, 0.0
        return round(max(0.0, r - 10), 2), round(max(0.0, r - 5), 2)
    inv = float(customer_invoice_total or 0)
    r = float(rate_raw or 0)
    base = r if r > 0 else inv
    if base <= 0:
        return 0.0, 0.0
    return round(base * 0.8, 2), round(base * 0.85, 2)


def _remap_truckertools_load_from_api(row: dict) -> dict:
    """
    Map Trucker Tools API item (nested in source_row.raw) to Supabase `loads` columns.
    API keys -> columns (never delivery_* / rate / weight on loads):
      originCity -> pickup_city
      originState -> pickup_state
      destinationCity -> dest_city
      destinationState -> dest_state
      pickupDate -> ship_date
      equipmentType -> trailer_type
      weight -> weight_lbs
      offerRate -> rate_raw AND customer_invoice_total; pay fields via _target_max_pay_universal (flat).
    """
    raw = _truckertools_api_raw_from_row(row)
    if not raw:
        return row
    out = dict(row)
    # Wrong column names (never use on loads): strip if a client sent them
    for bad in ("delivery_city", "delivery_state", "rate", "weight"):
        out.pop(bad, None)

    if "originCity" in raw:
        out["pickup_city"] = _tt_str(raw.get("originCity"))
    if "originState" in raw:
        ps = _tt_str(raw.get("originState"))
        out["pickup_state"] = ps[:8] if ps else None
    if "destinationCity" in raw:
        out["dest_city"] = _tt_str(raw.get("destinationCity"))
    if "destinationState" in raw:
        ds = _tt_str(raw.get("destinationState"))
        out["dest_state"] = ds[:8] if ds else None
    if "pickupDate" in raw and raw.get("pickupDate") is not None:
        pd = raw.get("pickupDate")
        out["ship_date"] = str(pd).strip() or None
    if "equipmentType" in raw:
        out["trailer_type"] = _tt_str(raw.get("equipmentType"))
    if "weight" in raw:
        wf = _coerce_float(raw.get("weight"))
        if wf is not None:
            out["weight_lbs"] = int(wf) if wf == int(wf) else wf
    if "miles" in raw:
        mf = _coerce_float(raw.get("miles"))
        if mf is not None:
            out["miles"] = int(mf) if mf == int(mf) else mf

    rate = _coerce_float(raw.get("offerRate")) if "offerRate" in raw else None
    if rate is not None:
        is_pt = bool(out.get("is_per_ton"))
        target_pay, max_pay = _target_max_pay_universal(is_pt, rate, rate)
        out["target_pay"] = target_pay
        out["max_pay"] = max_pay
        out["target_commission"] = round(rate - target_pay, 2)
        out["max_commission"] = round(rate - max_pay, 2)
        out["rate_raw"] = rate
        out["customer_invoice_total"] = rate
        out["commission_target_pct"] = 0.2
        out["commission_max_pct"] = 0.15

    pco, pso = out.get("pickup_city"), out.get("pickup_state")
    if pco or pso:
        out["pickup_location_raw"] = ", ".join(x for x in (pco, pso) if x) or None
    dco, dso = out.get("dest_city"), out.get("dest_state")
    if dco or dso:
        out["dest_location_raw"] = ", ".join(x for x in (dco, dso) if x) or None
    return out

DAT_SEARCH_URL = "https://freight.api.dat.com/search/v2/loads"
_DAT_LANE_CACHE: dict[str, tuple[float, dict]] = {}
_DAT_LANE_CACHE_LOCK = threading.Lock()
_DAT_LANE_CACHE_TTL_SEC = 30 * 60


def _read_dat_bearer_token() -> str | None:
    tok = (os.environ.get("DAT_BEARER_TOKEN") or "").strip()
    if tok:
        return tok
    path = (os.environ.get("DAT_TOKEN_FILE") or "/root/.dat_bearer_token").strip()
    try:
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as f:
                t = f.read().strip()
                return t or None
    except OSError:
        pass
    return None


def _coerce_float(x) -> float | None:
    if x is None:
        return None
    try:
        if isinstance(x, (int, float)):
            return float(x)
        return float(str(x).replace(",", "").replace("$", "").strip())
    except (TypeError, ValueError):
        return None


def _first_load_list(d: dict) -> list:
    if not isinstance(d, dict):
        return []
    for key in ("loads", "searchResults", "results", "matches", "items"):
        v = d.get(key)
        if isinstance(v, list) and v and isinstance(v[0], dict):
            return v
    sr = d.get("searchResult")
    if isinstance(sr, dict):
        for key in ("loads", "results", "items", "matches"):
            v = sr.get(key)
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v
    inner = d.get("data")
    if isinstance(inner, dict):
        for key in ("loads", "results", "items", "matches"):
            v = inner.get(key)
            if isinstance(v, list) and v and isinstance(v[0], dict):
                return v
    return []


def _human_age_label(posted) -> str:
    if posted is None:
        return "—"
    try:
        if isinstance(posted, (int, float)):
            ts = float(posted)
            if ts > 1e12:
                ts /= 1000.0
            dt = datetime.fromtimestamp(ts, tz=timezone.utc)
        else:
            raw = str(posted).strip()
            if raw.isdigit() and len(raw) >= 12:
                dt = datetime.fromtimestamp(int(raw) / 1000.0, tz=timezone.utc)
            else:
                dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        delta = datetime.now(timezone.utc) - dt
        mins = max(0, int(delta.total_seconds() // 60))
        if mins < 90:
            return f"{mins}m ago"
        hrs = mins // 60
        if hrs < 72:
            return f"{hrs}h ago"
        return f"{hrs // 24}d ago"
    except Exception:
        return str(posted)[:24]


def _extract_posting(item: dict) -> dict | None:
    rate = None
    for k in ("totalRate", "rate", "customerRate", "allInRate", "linehaulRate", "offerRate"):
        if k in item:
            rate = _coerce_float(item.get(k))
            if rate is not None:
                break
    if rate is None and isinstance(item.get("rate"), dict):
        rdict = item["rate"]
        rate = _coerce_float(rdict.get("amount") or rdict.get("value"))
    miles = None
    for k in ("tripMiles", "miles", "distance", "trip_miles"):
        if k in item:
            miles = _coerce_float(item.get(k))
            if miles is not None:
                break
    company = "—"
    pi = item.get("posterInfo") or item.get("poster") or item.get("broker")
    if isinstance(pi, dict):
        for k in ("companyName", "name", "legalName"):
            v = pi.get(k)
            if isinstance(v, str) and v.strip():
                company = v.strip()[:120]
                break
    if company == "—":
        for k in ("companyName", "brokerName", "posterName"):
            v = item.get(k)
            if isinstance(v, str) and v.strip():
                company = v.strip()[:120]
                break
    posted = (
        item.get("postedAt")
        or item.get("posted")
        or item.get("postingTime")
        or item.get("createTime")
        or item.get("createdAt")
    )
    age_label = _human_age_label(posted)
    if rate is None:
        return None
    return {
        "rate": rate,
        "miles": miles,
        "company": company,
        "age_label": age_label,
    }


def _parse_dat_search_response(dat_json: dict) -> tuple[list[dict], float | None]:
    raw_list = _first_load_list(dat_json)
    postings: list[dict] = []
    for item in raw_list:
        if not isinstance(item, dict):
            continue
        row = _extract_posting(item)
        if row:
            postings.append(row)
        if len(postings) >= 5:
            break
    rates = [p["rate"] for p in postings if p.get("rate") is not None]
    avg = sum(rates) / len(rates) if rates else None
    return postings, avg


def require_trigger_key() -> tuple[bool, tuple]:
    got = request.headers.get("X-TL-Trigger-Key") or request.headers.get("tl-trigger-key")
    if not TL_TRIGGER_KEY or got != TL_TRIGGER_KEY:
        return False, (jsonify({"error": "Unauthorized"}), 401)
    if not SERVICE_KEY:
        return False, (jsonify({"error": "Server misconfigured: missing SUPABASE_SERVICE_ROLE_KEY"}), 500)
    return True, ()


def _supabase_headers(*, json_body: bool = False) -> dict:
    h = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Accept": "application/json",
    }
    if json_body:
        h["Content-Type"] = "application/json"
    return h


def _normalize_sms_phone(raw: str | int | float | None) -> str:
    """E.164-style key for matching (digits + leading +). US 10-digit -> +1XXXXXXXXXX."""
    if raw is None:
        return ""
    if isinstance(raw, float):
        if not raw.is_integer():
            return ""
        raw = int(raw)
    if isinstance(raw, int):
        s = str(raw)
    else:
        s = str(raw).strip()
    digits = re.sub(r"\D", "", s)
    if not digits:
        return ""
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    return "+" + digits


def _simpletexting_send(contact_phone: str | int | float | None, message: str) -> tuple[bool, str]:
    if not SIMPLETEXTING_API_KEY:
        return False, "SIMPLETEXTING_API_KEY not configured"
    phone = _normalize_sms_phone(contact_phone)
    if not phone:
        return False, "invalid or empty phone for SMS"
    print(f"[SMS-SEND] phone={phone}", flush=True)
    payload = {"contactPhone": phone, "text": message}
    try:
        r = requests.post(
            SIMPLETEXTING_MESSAGES_URL,
            headers={
                "Authorization": f"Bearer {SIMPLETEXTING_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
    except requests.RequestException as e:
        return False, str(e)
    if r.status_code not in (200, 201, 202):
        return False, (r.text or r.reason or str(r.status_code))[:500]
    return True, ""


def _simpletexting_contact_create_silent(phone_norm: str) -> None:
    """POST contact create/upsert; failures are ignored (does not block SMS)."""
    if not SIMPLETEXTING_API_KEY or not phone_norm:
        return
    try:
        requests.post(
            SIMPLETEXTING_CONTACTS_URL,
            headers={
                "Authorization": f"Bearer {SIMPLETEXTING_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "contactPhone": phone_norm,
                "firstName": "Driver",
                "lastName": "",
                "comment": "TruckingLane auto-added",
            },
            timeout=20,
        )
    except requests.RequestException:
        pass


def _simpletexting_contact_patch_mc_silent(
    phone_norm: str, company_name: str | None, mc_number: str | None
) -> None:
    """PATCH contact with company + MC comment; failures ignored."""
    if not SIMPLETEXTING_API_KEY or not phone_norm or not mc_number:
        return
    fn = (company_name or "").strip()
    path_seg = quote(phone_norm, safe="")
    try:
        requests.patch(
            f"{SIMPLETEXTING_CONTACTS_URL}/{path_seg}",
            headers={
                "Authorization": f"Bearer {SIMPLETEXTING_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "firstName": fn,
                "comment": f"MC# {mc_number}",
            },
            timeout=20,
        )
    except requests.RequestException:
        pass


def _sms_fmt_field(val, fallback: str = "—") -> str:
    if val is None:
        return fallback
    if isinstance(val, bool):
        return str(val)
    if isinstance(val, (int, float)):
        if isinstance(val, float) and val == int(val):
            return str(int(val))
        return str(val)
    t = str(val).strip()
    return t if t else fallback


def _parse_mc_and_company_from_sms(text: str) -> tuple[str | None, str | None]:
    """
    MC# = first run of digits; company = remainder stripped (e.g. '123456 Appleton Trucking').
    """
    m = re.search(r"\d+", text or "")
    if not m:
        return None, None
    mc = m.group(0)
    company = (text[m.end() :] or "").strip()
    return mc, company if company else None


def _parse_inbound_sms_request() -> tuple[str, str]:
    """Best-effort phone + body from JSON, form, or nested webhook payloads."""
    flat: dict = {}

    if request.is_json:
        j = request.get_json(silent=True)
        if isinstance(j, dict):
            flat.update(j)

    if request.form:
        flat.update(request.form.to_dict())

    for nk in ("data", "payload", "message", "event", "body", "values"):
        sub = flat.get(nk)
        if isinstance(sub, dict):
            for k, v in sub.items():
                flat.setdefault(k, v)

    phone = (
        flat.get("contactPhone")
        or flat.get("phone")
        or flat.get("from")
        or flat.get("From")
        or flat.get("mobile")
        or flat.get("msisdn")
        or flat.get("sender")
    )
    text = flat.get("text") or flat.get("message") or flat.get("body") or flat.get("Message") or ""
    return str(phone or "").strip(), str(text or "").strip()


def _fetch_load_agency_id(load_id: str) -> str | None:
    lid = (load_id or "").strip()
    if not lid or not SERVICE_KEY:
        return None
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/loads",
            headers=_supabase_headers(),
            params={"id": f"eq.{lid}", "select": "agency_id"},
            timeout=15,
        )
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    rows = r.json() or []
    if not rows:
        return None
    aid = rows[0].get("agency_id")
    return str(aid).strip() if aid else None


def _caller_phone_matches_norm(caller_phone: str, phone_norm: str) -> bool:
    if not phone_norm:
        return False
    cn = _normalize_sms_phone(str(caller_phone or ""))
    return bool(cn and cn == phone_norm)


def _find_lead_id_for_sms(agency_id: str, phone_norm: str) -> str | None:
    if not agency_id or not phone_norm or not SERVICE_KEY:
        return None
    try:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/leads",
            headers=_supabase_headers(),
            params={
                "agency_id": f"eq.{agency_id}",
                "select": "id,caller_phone,created_at",
                "order": "created_at.desc",
                "limit": "200",
            },
            timeout=20,
        )
    except requests.RequestException:
        return None
    if r.status_code != 200:
        return None
    for row in r.json() or []:
        if _caller_phone_matches_norm(str(row.get("caller_phone") or ""), phone_norm):
            lid = str(row.get("id") or "").strip()
            return lid or None
    return None


def _lead_sms_insert(lead_id: str, direction: str, body: str) -> None:
    if not lead_id or direction not in ("inbound", "outbound") or not SERVICE_KEY:
        return
    text = (body or "")[:16000]
    if not text.strip():
        return
    try:
        requests.post(
            f"{SUPABASE_URL}/rest/v1/lead_sms_messages",
            headers={**_supabase_headers(json_body=True), "Prefer": "return=minimal"},
            json={"lead_id": lead_id, "direction": direction, "body": text},
            timeout=15,
        )
    except requests.RequestException:
        pass


def _log_sms_exchange_for_lead(
    lead_id: str | None, inbound_body: str, outbound_body: str
) -> None:
    if not lead_id:
        return
    _lead_sms_insert(lead_id, "inbound", inbound_body)
    if (outbound_body or "").strip():
        _lead_sms_insert(lead_id, "outbound", outbound_body)


def _sms_context_fetch(phone_norm: str) -> dict | None:
    if not phone_norm or not SERVICE_KEY:
        return None
    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/tl_sms_booking_context",
        headers=_supabase_headers(),
        params={"phone_norm": f"eq.{phone_norm}", "select": "phone_norm,load_id,stage,updated_at"},
        timeout=15,
    )
    if r.status_code != 200:
        return None
    rows = r.json()
    if not rows:
        return None
    row = rows[0]
    return row if isinstance(row, dict) else None


def _sms_context_upsert(phone_norm: str, load_id: str, stage: str) -> bool:
    body = {
        "phone_norm": phone_norm,
        "load_id": load_id,
        "stage": stage,
    }
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/tl_sms_booking_context",
        headers={
            **_supabase_headers(json_body=True),
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        json=body,
        timeout=15,
    )
    return r.status_code in (200, 201, 204)


def _sms_context_patch_stage(phone_norm: str, stage: str) -> bool:
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/tl_sms_booking_context",
        headers={**_supabase_headers(json_body=True), "Prefer": "return=minimal"},
        params={"phone_norm": f"eq.{phone_norm}"},
        json={"stage": stage, "updated_at": datetime.now(timezone.utc).isoformat()},
        timeout=15,
    )
    return r.status_code in (200, 204)


def _sms_context_delete(phone_norm: str) -> None:
    requests.delete(
        f"{SUPABASE_URL}/rest/v1/tl_sms_booking_context",
        headers={**_supabase_headers(), "Prefer": "return=minimal"},
        params={"phone_norm": f"eq.{phone_norm}"},
        timeout=15,
    )


def _set_env_var_in_file(path: str, key: str, value: str) -> None:
    line = f"{key}={value}"
    existing: list[str] = []
    try:
        if os.path.isfile(path):
            with open(path, encoding="utf-8") as f:
                existing = f.read().splitlines()
    except OSError:
        existing = []

    replaced = False
    out: list[str] = []
    for l in existing:
        if l.startswith(f"{key}="):
            out.append(line)
            replaced = True
        else:
            out.append(l)
    if not replaced:
        out.append(line)

    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(out).rstrip() + "\n")


@app.get("/health")
def health():
    return jsonify({"ok": True})


def _fetch_existing_load_numbers(aid: str, template_type: str, load_numbers: list[str]) -> set[str]:
    if not load_numbers or not SERVICE_KEY:
        return set()
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Accept": "application/json",
    }
    found: set[str] = set()
    for i in range(0, len(load_numbers), 120):
        chunk = load_numbers[i : i + 120]
        in_list = ",".join(f'"{str(n).replace(chr(34), "")}"' for n in chunk)
        params = {
            "select": "load_number",
            "agency_id": f"eq.{aid}",
            "template_type": f"eq.{template_type}",
            "load_number": f"in.({in_list})",
        }
        r = requests.get(f"{SUPABASE_URL}/rest/v1/loads", headers=headers, params=params, timeout=60)
        if r.status_code != 200:
            print(f"[insert-aljex-loads] prefetch error {r.status_code}: {(r.text or '')[:300]}")
            continue
        for row in r.json() or []:
            ln = row.get("load_number")
            if ln is not None:
                found.add(str(ln))
    return found


# Display names for load_activity_logs / admin UI (raw_headers.source)
_INSERT_LOG_SOURCE_BY_TEMPLATE: dict[str, str] = {
    "truckertools": "Trucker Tools Sync",
    "aljex_spot": "Aljex Spot Sync",
    "aljex_big500": "Big 500 Import",
    "aljex_flat": "Aljex Flat Sync",
    "adelphia_xlsx": "Adelphia Import",
    "vms_email": "VMS Import",
    "oldcastle_gsheet": "Oldcastle Sync",
    "century_xlsx": "Century Import",
    "Century": "Century Import",
}


def _insert_email_import_log(
    agency_id: str,
    template_type: str,
    imported_count: int,
    new_c: int,
    updated_c: int,
    dupes_c: int,
    *,
    supports_removal: bool = False,
    removed_c: int = 0,
    sender_email: str = "vps@insert-aljex-loads",
) -> None:
    if not SERVICE_KEY:
        return
    raw_headers: dict = {
        "template_type": template_type,
        "source": _INSERT_LOG_SOURCE_BY_TEMPLATE.get(
            template_type, f"Extension sync ({template_type})"
        ),
        "new": new_c,
        "updated": updated_c,
        "dupes_dropped": dupes_c,
        "duplicates_removed": dupes_c,
        "supports_removal": supports_removal,
    }
    if supports_removal and removed_c > 0:
        raw_headers["removed"] = removed_c
        raw_headers["archived"] = removed_c
    body = {
        "agency_id": agency_id,
        "sender_email": sender_email,
        "subject": f"Import sync ({template_type})",
        "status": "success",
        "imported_count": imported_count,
        "raw_headers": raw_headers,
    }
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/email_import_logs",
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        json=body,
        timeout=30,
    )
    if r.status_code not in (200, 201):
        print(f"[insert-aljex-loads] email_import_logs insert failed: {r.status_code} {(r.text or '')[:500]}")


@app.post("/insert-aljex-loads")
def insert_aljex_loads():
    ok, err = require_trigger_key()
    if not ok:
        return err

    body = request.get_json(silent=True) or {}
    loads = body.get("loads")
    if not isinstance(loads, list):
        return jsonify({"error": "loads array required"}), 400
    if len(loads) == 0:
        now_iso = datetime.now(timezone.utc).isoformat()
        return jsonify(
            {
                "ok": True,
                "success": True,
                "new": 0,
                "updated": 0,
                "dupes_dropped": 0,
                "count": 0,
                "updated_at": now_iso,
            }
        )

    # Trucker Tools: raw extension row before column whitelist (journalctl -u tl-trigger -f)
    tt_rows = [
        r
        for r in loads
        if isinstance(r, dict) and str(r.get("template_type") or "") == "truckertools"
    ]
    if tt_rows:
        print("[TT DEBUG] First load:", json.dumps(tt_rows[0], indent=2))

    normalized: list[dict] = []
    for row in loads:
        if not isinstance(row, dict):
            return jsonify({"error": "each load must be a JSON object"}), 400
        row = _remap_truckertools_load_from_api(row)
        normalized.append(_normalize_aljex_load_row(row))

    triple_counts: dict[tuple[str, str, str], int] = defaultdict(int)
    triple_last: dict[tuple[str, str, str], dict] = {}
    for row in normalized:
        aid = row.get("agency_id")
        tt = row.get("template_type")
        ln = row.get("load_number")
        if aid is None or tt is None or ln is None:
            return jsonify({"error": "each load needs agency_id, template_type, load_number"}), 400
        key = (str(aid), str(tt), str(ln))
        triple_counts[key] += 1
        triple_last[key] = row
    deduped = list(triple_last.values())
    dupes_total = len(normalized) - len(deduped)

    dupes_by_pair: dict[tuple[str, str], int] = defaultdict(int)
    for (aid, tt, _ln), c in triple_counts.items():
        if c > 1:
            dupes_by_pair[(aid, tt)] += c - 1

    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in deduped:
        groups[(str(row["agency_id"]), str(row["template_type"]))].append(row)

    log_payloads: list[tuple[str, str, int, int, int, int]] = []
    total_new = 0
    total_updated = 0
    for (aid, tt), grp in groups.items():
        nums = [str(r["load_number"]) for r in grp]
        ex = _fetch_existing_load_numbers(aid, tt, nums)
        new_c = sum(1 for n in nums if n not in ex)
        upd_c = len(nums) - new_c
        total_new += new_c
        total_updated += upd_c
        dc = dupes_by_pair.get((aid, tt), 0)
        log_payloads.append((aid, tt, len(grp), new_c, upd_c, dc))

    # POST upsert: ON CONFLICT (agency_id, template_type, load_number) — unique key
    # loads_agency_id_template_type_load_number_key (not UNIQUE(load_number) alone).
    loads_url = (
        f"{SUPABASE_URL}/rest/v1/loads"
        "?on_conflict=agency_id,template_type,load_number"
    )
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    r = requests.post(loads_url, json=deduped, headers=headers, timeout=120)
    if r.status_code not in (200, 201, 204):
        return jsonify({"error": r.text or r.reason, "status": r.status_code}), 502

    for aid, tt, ic, new_c, upd_c, dc in log_payloads:
        _insert_email_import_log(aid, tt, ic, new_c, upd_c, dc, supports_removal=False)

    return jsonify(
        {
            "ok": True,
            "success": True,
            "new": total_new,
            "updated": total_updated,
            "dupes_dropped": dupes_total,
            "count": len(deduped),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    )


@app.post("/insert-truckertools-loads")
def insert_truckertools_loads():
    """
    Trucker Tools extension: POST JSON { "loads": [ ... ] }.
    Rows are sent as-is (no _ALJEX_LOAD_UPSERT_TEMPLATE / _normalize_aljex_load_row).
    Each load must have agency_id, load_number, template_type == truckertools.
    Upsert: ON CONFLICT (agency_id, template_type, load_number).
    """
    ok, err = require_trigger_key()
    if not ok:
        return err

    body = request.get_json(silent=True) or {}
    loads = body.get("loads")
    if not isinstance(loads, list):
        return jsonify({"error": "loads array required"}), 400
    if len(loads) == 0:
        now_iso = datetime.now(timezone.utc).isoformat()
        return jsonify(
            {
                "ok": True,
                "success": True,
                "new": 0,
                "updated": 0,
                "dupes_dropped": 0,
                "count": 0,
                "updated_at": now_iso,
            }
        )

    rows: list[dict] = []
    for row in loads:
        if not isinstance(row, dict):
            return jsonify({"error": "each load must be a JSON object"}), 400
        if str(row.get("template_type") or "") != "truckertools":
            return jsonify({"error": "each load must have template_type truckertools"}), 400
        aid = row.get("agency_id")
        ln = row.get("load_number")
        if aid is None or ln is None:
            return jsonify({"error": "each load needs agency_id, load_number"}), 400
        rows.append(dict(row))

    triple_counts: dict[tuple[str, str, str], int] = defaultdict(int)
    triple_last: dict[tuple[str, str, str], dict] = {}
    for row in rows:
        key = (str(row["agency_id"]), str(row["template_type"]), str(row["load_number"]))
        triple_counts[key] += 1
        triple_last[key] = row
    deduped = list(triple_last.values())
    dupes_total = len(rows) - len(deduped)

    dupes_by_pair: dict[tuple[str, str], int] = defaultdict(int)
    for (aid, tt, _ln), c in triple_counts.items():
        if c > 1:
            dupes_by_pair[(aid, tt)] += c - 1

    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in deduped:
        groups[(str(row["agency_id"]), str(row["template_type"]))].append(row)

    log_payloads: list[tuple[str, str, int, int, int, int]] = []
    total_new = 0
    total_updated = 0
    for (aid, tt), grp in groups.items():
        nums = [str(r["load_number"]) for r in grp]
        ex = _fetch_existing_load_numbers(aid, tt, nums)
        new_c = sum(1 for n in nums if n not in ex)
        upd_c = len(nums) - new_c
        total_new += new_c
        total_updated += upd_c
        dc = dupes_by_pair.get((aid, tt), 0)
        log_payloads.append((aid, tt, len(grp), new_c, upd_c, dc))

    loads_url = (
        f"{SUPABASE_URL}/rest/v1/loads"
        "?on_conflict=agency_id,template_type,load_number"
    )
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    r = requests.post(loads_url, json=deduped, headers=headers, timeout=120)
    if r.status_code not in (200, 201, 204):
        return jsonify({"error": r.text or r.reason, "status": r.status_code}), 502

    for aid, tt, ic, new_c, upd_c, dc in log_payloads:
        _insert_email_import_log(
            aid,
            tt,
            ic,
            new_c,
            upd_c,
            dc,
            supports_removal=False,
            sender_email="vps@insert-truckertools-loads",
        )

    return jsonify(
        {
            "ok": True,
            "success": True,
            "new": total_new,
            "updated": total_updated,
            "dupes_dropped": dupes_total,
            "count": len(deduped),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    )


@app.post("/update-aljex-cookie")
def update_aljex_cookie():
    ok, err = require_trigger_key()
    if not ok:
        return err

    body = request.get_json(silent=True) or {}
    cookie = str(body.get("cookie") or "").strip()
    full_cookie_string = str(body.get("fullCookieString") or "").strip()
    cookies = body.get("cookies") or []
    if not cookie and not full_cookie_string:
        return jsonify({"error": "cookie or fullCookieString required"}), 400

    env_path = "/root/.truckinglane-dat.env"
    _set_env_var_in_file(env_path, "ALJEX_COOKIE", cookie or full_cookie_string)

    try:
        with open("/root/.aljex-cookies.json", "w", encoding="utf-8") as f:
            json.dump(cookies, f, ensure_ascii=False)
    except OSError as e:
        return jsonify({"error": f"failed to write /root/.aljex-cookies.json: {e}"}), 500

    return jsonify({"success": True, "updated": datetime.now(timezone.utc).isoformat()})


@app.post("/update-dat-token")
def update_dat_token():
    ok, err = require_trigger_key()
    if not ok:
        return err

    body = request.get_json(silent=True) or {}
    token = str(body.get("token") or "").strip()
    if not token:
        return jsonify({"error": "token required"}), 400

    _set_env_var_in_file("/root/.truckinglane-dat.env", "DAT_BEARER_TOKEN", token)
    return jsonify({"success": True, "updated": datetime.now(timezone.utc).isoformat()})


@app.post("/update-dat-cookies")
def update_dat_cookies():
    ok, err = require_trigger_key()
    if not ok:
        return err

    body = request.get_json(silent=True) or {}
    cookies = str(body.get("cookies") or "").strip()
    if not cookies:
        return jsonify({"error": "cookies required"}), 400

    _set_env_var_in_file("/root/.truckinglane-dat.env", "DAT_COOKIES", cookies)
    return jsonify({"success": True, "updated": datetime.now(timezone.utc).isoformat()})


@app.post("/get-unsubmitted-loads")
def get_unsubmitted_loads():
    ok, err = require_trigger_key()
    if not ok:
        return err

    url = (
        f"{SUPABASE_URL}/rest/v1/loads"
        "?select=id,load_number,template_type,dispatch_status,ship_date,pickup_city,pickup_state,dest_city,dest_state,"
        "weight_lbs,trailer_type,customer_invoice_total,source_row,aljex_submitted,aljex_spot_number"
        "&agency_id=eq.25127efb-6eef-412a-a5d0-3d8242988323"
        "&template_type=in.(adelphia_xlsx,vms_email,oldcastle_gsheet,Century)"
        "&or=(aljex_submitted.is.null,aljex_submitted.eq.false)"
        "&or=(dispatch_status.eq.available,dispatch_status.eq.open)"
        "&limit=100"
    )
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Accept": "application/json",
    }
    r = requests.get(url, headers=headers, timeout=30)
    if r.status_code != 200:
        return jsonify({"error": r.text or r.reason, "status": r.status_code}), 502
    rows = r.json() if r.text else []
    return jsonify({"success": True, "loads": rows})


@app.post("/mark-aljex-submitted")
def mark_aljex_submitted():
    ok, err = require_trigger_key()
    if not ok:
        return err

    body = request.get_json(silent=True) or {}
    load_id = body.get("load_id")
    spot = body.get("aljex_spot_number")
    if not load_id:
        return jsonify({"error": "load_id required"}), 400

    spot_str = str(spot).strip() if spot is not None else None
    now_iso = datetime.now(timezone.utc).isoformat()

    url = f"{SUPABASE_URL}/rest/v1/loads?id=eq.{load_id}"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    payload = {
        "aljex_submitted": True,
        "aljex_submitted_at": now_iso,
    }
    if spot_str:
        payload["aljex_spot_number"] = spot_str

    r = requests.patch(url, json=payload, headers=headers, timeout=30)
    if r.status_code not in (200, 204):
        return jsonify({"error": r.text or r.reason, "status": r.status_code}), 502

    return jsonify({"success": True})


@app.post("/upload-big500")
def upload_big500():
    """Receive raw Big 500 CSV from the browser extension; run parse-big500.py and upsert loads."""
    ok, err = require_trigger_key()
    if not ok:
        return err

    if request.is_json:
        body = request.get_json(silent=True) or {}
        raw = body.get("csv") or ""
        if not isinstance(raw, str):
            raw = ""
    else:
        raw = (request.get_data() or b"").decode("utf-8", errors="replace")

    raw = raw.strip()
    if len(raw) < 10:
        return jsonify({"error": "body too short or empty"}), 400

    script = os.environ.get("PARSE_BIG500_SCRIPT", "").strip()
    if not script:
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parse-big500.py")
    if not os.path.isfile(script):
        return jsonify({"error": f"parse script not found: {script}"}), 500

    env = os.environ.copy()
    proc = subprocess.run(
        [sys.executable, script],
        input=raw,
        capture_output=True,
        text=True,
        timeout=600,
        env=env,
    )
    if proc.returncode != 0:
        err_out = (proc.stderr or proc.stdout or "").strip() or "parse-big500 failed"
        return jsonify({"error": err_out[-8000:]}), 502
    out = (proc.stdout or "").strip()
    return jsonify({"success": True, "message": out[-4000:] if out else "ok"})


@app.post("/dat-lane-rates")
def dat_lane_rates():
    """DAT load board search (demo): same-lane market postings. Cached 30 min per lane."""
    ok, err = require_trigger_key()
    if not ok:
        return err

    body = request.get_json(silent=True) or {}
    pickup_city = (body.get("pickup_city") or "").strip()
    pickup_state = (body.get("pickup_state") or "").strip()
    dest_city = (body.get("dest_city") or "").strip()
    dest_state = (body.get("dest_state") or "").strip()
    equipment = (body.get("equipment") or "F").strip().upper()[:1] or "F"
    if equipment not in ("F", "V", "R", "T", "C"):
        equipment = "F"

    if not (pickup_city and pickup_state and dest_city and dest_state):
        return jsonify({"ok": False, "error": "pickup_city, pickup_state, dest_city, dest_state required"}), 400

    cache_key = hashlib.sha256(
        json.dumps(
            {
                "o": pickup_city.upper(),
                "os": pickup_state.upper()[:2],
                "d": dest_city.upper(),
                "ds": dest_state.upper()[:2],
                "e": equipment,
            },
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()

    now = time.time()
    with _DAT_LANE_CACHE_LOCK:
        hit = _DAT_LANE_CACHE.get(cache_key)
        if hit and hit[0] > now:
            payload = dict(hit[1])
            payload["cached"] = True
            return jsonify(payload)

    token = _read_dat_bearer_token()
    if not token:
        return jsonify(
            {
                "ok": False,
                "unavailable": True,
                "error": "DAT bearer token not configured on server (DAT_BEARER_TOKEN or DAT_TOKEN_FILE)",
            }
        )

    payload_req = {
        "origin": {
            "city": pickup_city.upper(),
            "stateProv": pickup_state.upper()[:2],
            "circle": {"miles": 50},
        },
        "destination": {
            "city": dest_city.upper(),
            "stateProv": dest_state.upper()[:2],
            "circle": {"miles": 50},
        },
        "equipmentType": equipment,
        "includePostingDetails": True,
    }

    try:
        r = requests.post(
            DAT_SEARCH_URL,
            json=payload_req,
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout=45,
        )
    except requests.RequestException as e:
        return jsonify({"ok": False, "unavailable": True, "error": f"DAT request failed: {e}"})

    try:
        dat_json = r.json()
    except ValueError:
        return jsonify(
            {
                "ok": False,
                "unavailable": True,
                "error": f"DAT returned non-JSON (HTTP {r.status_code})",
            }
        )

    if r.status_code >= 400:
        msg = dat_json if isinstance(dat_json, dict) else {}
        detail = msg.get("message") or msg.get("error") or msg.get("detail") or r.text[:400]
        return jsonify(
            {
                "ok": False,
                "unavailable": True,
                "error": f"DAT API {r.status_code}: {detail}",
            }
        )

    postings, avg = _parse_dat_search_response(dat_json if isinstance(dat_json, dict) else {})
    out = {
        "ok": True,
        "cached": False,
        "average_rate": avg,
        "postings": postings,
    }
    with _DAT_LANE_CACHE_LOCK:
        _DAT_LANE_CACHE[cache_key] = (now + _DAT_LANE_CACHE_TTL_SEC, dict(out))
    return jsonify(out)


@app.post("/send-sms")
def send_sms():
    """Send load offer SMS (SimpleTexting). Body JSON: { "phone", "load_id" }. Requires X-TL-Trigger-Key."""
    ok, err = require_trigger_key()
    if not ok:
        return err
    if not SIMPLETEXTING_API_KEY:
        return jsonify({"error": "SIMPLETEXTING_API_KEY not configured"}), 500

    body = request.get_json(silent=True) or {}
    phone = str(body.get("phone") or "").strip()
    load_id = str(body.get("load_id") or "").strip()
    if not phone or not load_id:
        return jsonify({"error": "phone and load_id required"}), 400

    r = requests.get(
        f"{SUPABASE_URL}/rest/v1/loads",
        headers=_supabase_headers(),
        params={
            "id": f"eq.{load_id}",
            "select": ",".join(
                [
                    "id",
                    "agency_id",
                    "load_number",
                    "pickup_city",
                    "pickup_state",
                    "dest_city",
                    "dest_state",
                    "trailer_type",
                    "weight_lbs",
                    "ship_date",
                    "target_pay",
                ]
            ),
        },
        timeout=30,
    )
    if r.status_code != 200:
        return jsonify({"error": r.text or "load fetch failed", "status": r.status_code}), 502
    rows = r.json() or []
    if not rows:
        return jsonify({"error": "load not found"}), 404
    row = rows[0]

    ln = _sms_fmt_field(row.get("load_number"))
    sms_message = (
        "D&L Transport\n"
        f"Load #{ln}\n"
        f"{_sms_fmt_field(row.get('pickup_city'))}, {_sms_fmt_field(row.get('pickup_state'))} → "
        f"{_sms_fmt_field(row.get('dest_city'))}, {_sms_fmt_field(row.get('dest_state'))}\n"
        f"{_sms_fmt_field(row.get('trailer_type'))} | {_sms_fmt_field(row.get('weight_lbs'))} lbs\n"
        f"Ship: {_sms_fmt_field(row.get('ship_date'))}\n"
        f"Rate: ${_sms_fmt_field(row.get('target_pay'))}\n"
        "Reply BOOK to claim."
    )

    ok_send, send_err = _simpletexting_send(phone, sms_message)
    if not ok_send:
        return jsonify({"error": send_err}), 502

    pnorm = _normalize_sms_phone(phone)
    if pnorm:
        _simpletexting_contact_create_silent(pnorm)
        _sms_context_upsert(pnorm, load_id, "offered")

    aid = row.get("agency_id")
    if aid and pnorm:
        lid = _find_lead_id_for_sms(str(aid).strip(), pnorm)
        if lid:
            _lead_sms_insert(lid, "outbound", sms_message)

    return jsonify({"ok": True})


@app.post("/notify-sms")
def notify_sms():
    """Send arbitrary SMS (SimpleTexting). Body JSON: { \"phone\", \"text\" }. Requires X-TL-Trigger-Key."""
    ok, err = require_trigger_key()
    if not ok:
        return err
    if not SIMPLETEXTING_API_KEY:
        return jsonify({"error": "SIMPLETEXTING_API_KEY not configured"}), 500

    body = request.get_json(silent=True) or {}
    phone = body.get("phone")
    text = str(body.get("text") or "").strip()
    if phone is None or not text:
        return jsonify({"error": "phone and text required"}), 400

    ok_send, send_err = _simpletexting_send(phone, text)
    if not ok_send:
        return jsonify({"error": send_err}), 502
    return jsonify({"ok": True})


@app.post("/sms-inbound")
def sms_inbound():
    """
    SimpleTexting inbound webhook (no TL trigger key). Parses phone + body; sends replies via API.
    """
    j = request.get_json(silent=True) or {}
    _values = j.get("values")
    _values_d = _values if isinstance(_values, dict) else {}
    msg_type = j.get("type") or _values_d.get("type") or ""
    if msg_type == "OUTGOING_MESSAGE":
        return jsonify({"ok": True, "skipped": "outgoing"}), 200

    print(f"[SMS-INBOUND] payload: {request.get_data(as_text=True)}", flush=True)
    if not SERVICE_KEY:
        return jsonify({"error": "Server misconfigured"}), 500

    phone_raw, text_body = _parse_inbound_sms_request()
    phone_norm = _normalize_sms_phone(phone_raw)
    reply_to = phone_raw.strip() if phone_raw.strip() else phone_norm

    if not text_body.strip():
        return "", 200
    if not reply_to or not re.sub(r"\D", "", reply_to):
        return "", 200

    ctx = _sms_context_fetch(phone_norm) if phone_norm else None
    upper_msg = text_body.upper()

    if "BOOK" in upper_msg:
        if ctx and str(ctx.get("stage")) == "offered":
            _sms_context_patch_stage(phone_norm, "awaiting_mc")
        reply = "Got it! What is your MC# and company name?"
        if not ctx:
            reply = "We don't have an active load offer for this number. Contact dispatch for a new link."
        lead_for_thread: str | None = None
        if ctx:
            lid_load = str(ctx.get("load_id") or "").strip()
            ag = _fetch_load_agency_id(lid_load) if lid_load else None
            if ag and phone_norm:
                lead_for_thread = _find_lead_id_for_sms(ag, phone_norm)
        _simpletexting_send(reply_to, reply)
        _log_sms_exchange_for_lead(lead_for_thread, text_body, reply)
        return "", 200

    if any(ch.isdigit() for ch in text_body) and ctx:
        lid = str(ctx.get("load_id") or "").strip()
        mc, company = _parse_mc_and_company_from_sms(text_body)
        patch: dict = {
            "sms_book_status": "pending_review",
            "booked_by_phone": phone_norm,
        }
        if mc is not None:
            patch["booked_by_mc"] = mc
            patch["booked_by_company"] = company
        pr = requests.patch(
            f"{SUPABASE_URL}/rest/v1/loads",
            headers={**_supabase_headers(json_body=True), "Prefer": "return=minimal"},
            params={"id": f"eq.{lid}"},
            json=patch,
            timeout=30,
        )
        if pr.status_code in (200, 204):
            _sms_context_delete(phone_norm)
            reply = "A dispatcher will call you shortly!"
        else:
            reply = "Thanks — we couldn't save your booking. Please call dispatch."
        ag = _fetch_load_agency_id(lid)
        lead_for_thread = (
            _find_lead_id_for_sms(ag, phone_norm) if ag and phone_norm else None
        )
        if mc is not None and phone_norm:
            co = company if company is not None else ""
            _simpletexting_contact_patch_mc_silent(phone_norm, co, mc)
        _simpletexting_send(reply_to, reply)
        _log_sms_exchange_for_lead(lead_for_thread, text_body, reply)
        return "", 200

    return "", 200


def main():
    port = int(os.environ.get("TL_TRIGGER_PORT", "3098"))
    app.run(host="0.0.0.0", port=port, threaded=True)


if __name__ == "__main__":
    main()
