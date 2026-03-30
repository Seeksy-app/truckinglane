#!/usr/bin/env python3
"""
Big 500 CSV → Supabase loads upsert (template_type aljex_big500).

Column indices (0-based) for city/state (facility names are 31 and 35 — do not use as city):
  32 = pickup city
  33 = pickup state
  36 = dest city
  37 = dest state

Profit:
  - Per-ton: target_pay = (rate_raw - 10) * tons, tons = weight_lbs / 2000
  - Flat: target_pay = customer_invoice_total * 0.80

dispatch_status: "open" if CSV status is open, else "covered" (never "available").
On upsert, if the row already has dispatch_status = 'open' in DB, it is preserved.

Environment:
  TL_AGENCY_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
  DRY_RUN=1 — print JSON lines only
  Optional column overrides: BIG500_COL_RATE, BIG500_COL_WEIGHT, BIG500_COL_STATUS,
    BIG500_COL_PRO, BIG500_COL_CODE (Code column index for T/F per-ton), etc.

Usage:
  DRY_RUN=1 python3 parse-big500.py /tmp/big500-today.csv
  python3 parse-big500.py /tmp/big500-today.csv
"""

from __future__ import annotations

import csv
import json
import os
import sys
from typing import Any
from urllib.parse import quote

import requests

COL_PICKUP_CITY = 32
COL_PICKUP_STATE = 33
COL_DEST_CITY = 36
COL_DEST_STATE = 37

COL_RATE = int(os.environ.get("BIG500_COL_RATE", "20"))
COL_WEIGHT = int(os.environ.get("BIG500_COL_WEIGHT", "18"))
COL_LOAD_STATUS = int(os.environ.get("BIG500_COL_STATUS", "8"))
COL_PRO = int(os.environ.get("BIG500_COL_PRO", "0"))
COL_CODE = int(os.environ.get("BIG500_COL_CODE", "-1"))

MIN_COLS = 38


def _parse_float(s: str) -> float:
    if not s:
        return 0.0
    cleaned = "".join(c for c in str(s) if c.isdigit() or c in ".-")
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


def _row_get(row: list[str], idx: int) -> str:
    if idx < 0 or idx >= len(row):
        return ""
    return (row[idx] or "").strip()


def _pad(row: list[str], n: int) -> list[str]:
    row = list(row)
    while len(row) < n:
        row.append("")
    return row


def _is_per_ton_row(row: list[str]) -> bool:
    if COL_CODE >= 0 and COL_CODE < len(row):
        v = (row[COL_CODE] or "").strip().upper()
        return v == "T"
    return False


def dispatch_status_from_status(status_raw: str) -> str:
    s = (status_raw or "").strip().lower()
    return "open" if s == "open" else "covered"


def compute_target_pay(
    is_per_ton: bool,
    rate_raw: float,
    weight_lbs: float,
    customer_invoice_total: float,
) -> int:
    if is_per_ton:
        tons = weight_lbs / 2000.0 if weight_lbs else 0.0
        if tons <= 0 or rate_raw <= 0:
            return 0
        return int(round((rate_raw - 10.0) * tons))
    return int(round(customer_invoice_total * 0.80))


def compute_invoice_total(
    is_per_ton: bool, rate_raw: float, weight_lbs: float
) -> float:
    if not is_per_ton:
        return round(rate_raw, 2) if rate_raw > 0 else 0.0
    tons = weight_lbs / 2000.0 if weight_lbs else 0.0
    return round(rate_raw * tons, 2) if tons > 0 and rate_raw > 0 else 0.0


def row_to_record(row: list[str], agency_id: str) -> dict[str, Any] | None:
    row = _pad(row, max(MIN_COLS, COL_CODE + 1, COL_RATE + 1, COL_WEIGHT + 1))
    load_number = _row_get(row, COL_PRO) or _row_get(row, 0)
    if not load_number:
        return None

    pickup_city = _row_get(row, COL_PICKUP_CITY)
    pickup_state = _row_get(row, COL_PICKUP_STATE)
    dest_city = _row_get(row, COL_DEST_CITY)
    dest_state = _row_get(row, COL_DEST_STATE)

    rate_raw = _parse_float(_row_get(row, COL_RATE))
    weight_lbs = _parse_float(_row_get(row, COL_WEIGHT))
    status_raw = _row_get(row, COL_LOAD_STATUS)
    is_per_ton = _is_per_ton_row(row)

    customer_invoice_total = compute_invoice_total(is_per_ton, rate_raw, weight_lbs)
    target_pay = compute_target_pay(
        is_per_ton, rate_raw, weight_lbs, customer_invoice_total
    )
    dispatch_status = dispatch_status_from_status(status_raw)

    target_commission = (
        int(round(customer_invoice_total * 0.20)) if customer_invoice_total else 0
    )
    max_pay = int(round(customer_invoice_total * 0.85)) if customer_invoice_total else 0
    max_commission = (
        int(round(customer_invoice_total * 0.15)) if customer_invoice_total else 0
    )

    return {
        "agency_id": agency_id,
        "template_type": "aljex_big500",
        "load_number": load_number,
        "pickup_city": pickup_city or None,
        "pickup_state": pickup_state or None,
        "dest_city": dest_city or None,
        "dest_state": dest_state or None,
        "pickup_location_raw": ", ".join(
            x for x in (pickup_city, pickup_state) if x
        )
        or None,
        "dest_location_raw": ", ".join(x for x in (dest_city, dest_state) if x)
        or None,
        "weight_lbs": int(weight_lbs) if weight_lbs else None,
        "rate_raw": rate_raw if rate_raw else None,
        "is_per_ton": is_per_ton,
        "customer_invoice_total": customer_invoice_total,
        "target_pay": target_pay,
        "target_commission": target_commission,
        "max_pay": max_pay,
        "max_commission": max_commission,
        "status": "open",
        "dispatch_status": dispatch_status,
        "is_active": True,
    }


def fetch_existing_dispatch(
    supabase_url: str,
    service_key: str,
    agency_id: str,
    load_number: str,
) -> str | None:
    supabase_url = supabase_url.rstrip("/")
    headers = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
    }
    enc_ln = quote(load_number, safe="")
    url = (
        f"{supabase_url}/rest/v1/loads"
        f"?agency_id=eq.{agency_id}&load_number=eq.{enc_ln}&select=dispatch_status&limit=1"
    )
    r = requests.get(url, headers=headers, timeout=30)
    if r.status_code != 200:
        return None
    data = r.json()
    if not data:
        return None
    return data[0].get("dispatch_status")


def upsert_loads(
    path: str,
    agency_id: str,
    supabase_url: str,
    service_key: str,
    dry_run: bool,
) -> None:
    supabase_url = supabase_url.rstrip("/")
    headers_json = {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }

    with open(path, newline="", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        rows = list(reader)

    if not rows:
        print("No rows", file=sys.stderr)
        sys.exit(1)

    # Assume first row is header (Big 500 export)
    data_rows = rows[1:] if len(rows) > 1 else rows

    count = 0
    for row in data_rows:
        if not row or not any((c or "").strip() for c in row):
            continue
        rec = row_to_record(row, agency_id)
        if not rec:
            continue
        count += 1

        if not dry_run:
            existing = fetch_existing_dispatch(
                supabase_url, service_key, agency_id, str(rec["load_number"])
            )
            if existing == "open":
                rec["dispatch_status"] = "open"

        if dry_run:
            print(json.dumps(rec, default=str))
            continue

        r = requests.post(
            f"{supabase_url}/rest/v1/loads",
            headers={**headers_json, "Prefer": "resolution=merge-duplicates"},
            params={"on_conflict": "agency_id,load_number"},
            json=rec,
            timeout=60,
        )
        if r.status_code not in (200, 201, 204):
            print(f"Upsert failed {r.status_code}: {r.text}", file=sys.stderr)
            sys.exit(1)

    print(f"Processed {count} rows" + (" (dry run)" if dry_run else ""))


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        sys.exit(2)

    path = sys.argv[1]
    agency_id = os.environ.get("TL_AGENCY_ID", "").strip()
    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    dry_run = os.environ.get("DRY_RUN", "").strip() in ("1", "true", "yes")

    if not dry_run and (not agency_id or not supabase_url or not service_key):
        print(
            "Set TL_AGENCY_ID, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY or use DRY_RUN=1",
            file=sys.stderr,
        )
        sys.exit(1)

    upsert_loads(path, agency_id, supabase_url, service_key, dry_run)


if __name__ == "__main__":
    main()
