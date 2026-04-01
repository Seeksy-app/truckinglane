#!/usr/bin/env python3
"""
TruckingLanes trigger service — add this route to the copy deployed at /root/scripts/tl-trigger.py
or run standalone (see bottom).

Environment:
  TL_TRIGGER_KEY        Shared secret (must match extension header)
  SUPABASE_URL          https://vjgakkomhphvdbwjjwiv.supabase.co
  SUPABASE_SERVICE_ROLE_KEY   Service role key (never expose to clients)
  DAT_BEARER_TOKEN      Optional; DAT freight API bearer (or DAT_TOKEN_FILE, default /root/.dat_bearer_token)
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone

try:
    from flask import Flask, jsonify, request
except ImportError:
    print("Install Flask: pip install flask requests", file=sys.stderr)
    raise

import requests

app = Flask(__name__)

TL_TRIGGER_KEY = os.environ.get("TL_TRIGGER_KEY", "tl-trigger-7b747d391801b8e5f55b4542")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://vjgakkomhphvdbwjjwiv.supabase.co").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

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
        return jsonify({"success": True, "count": 0, "updated": datetime.now(timezone.utc).isoformat()})

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
        normalized.append(_normalize_aljex_load_row(row))
    loads = normalized

    url = f"{SUPABASE_URL}/rest/v1/loads?on_conflict=load_number,template_type,agency_id"
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,missing=default",
    }
    r = requests.post(url, json=loads, headers=headers, timeout=60)
    if r.status_code not in (200, 201):
        return jsonify({"error": r.text or r.reason, "status": r.status_code}), 502

    return jsonify(
        {
            "success": True,
            "count": len(loads),
            "updated": datetime.now(timezone.utc).isoformat(),
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


def main():
    port = int(os.environ.get("TL_TRIGGER_PORT", "3098"))
    app.run(host="0.0.0.0", port=port, threaded=True)


if __name__ == "__main__":
    main()
