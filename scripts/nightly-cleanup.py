#!/usr/bin/env python3
"""
Nightly cleanup (run at midnight via cron on VPS).

- Never deletes loads — archives only.
- Century loads (template_type Century or century_xlsx) with dispatch_status != archived:
  roll ship_date +1 day, purge_date = last day of that month, dat_posted_at = NULL.
- All other non-archived loads: dispatch_status = archived, is_active = FALSE.

Logs: "Nightly cleanup: X archived, Y Century loads date-rolled"

Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (or /root/.truckinglane-dat.env with SUPABASE_SERVICE_ROLE_KEY=...)
"""

from __future__ import annotations

import calendar
import os
import re
import sys
from datetime import date, datetime, timedelta
from typing import Any

import requests

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://vjgakkomhphvdbwjjwiv.supabase.co").rstrip("/")


def _load_service_key() -> str:
    k = (os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    if k:
        return k
    env_path = "/root/.truckinglane-dat.env"
    if os.path.isfile(env_path):
        with open(env_path, encoding="utf-8") as f:
            m = re.search(r"SUPABASE_SERVICE_ROLE_KEY=(\S+)", f.read())
            if m:
                return m.group(1).strip()
    return ""


def _headers() -> dict[str, str]:
    sk = _load_service_key()
    return {
        "apikey": sk,
        "Authorization": f"Bearer {sk}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


CENTURY_TYPES = {"Century", "century_xlsx"}


def _parse_date(s: str | None) -> date | None:
    if not s:
        return None
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _last_day_of_month(d: date) -> date:
    _, last = calendar.monthrange(d.year, d.month)
    return date(d.year, d.month, last)


def _fetch_all_rows(url: str, headers: dict[str, str], params: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    page = 1000
    while True:
        p = {**params, "limit": page, "offset": offset}
        r = requests.get(url, headers=headers, params=p, timeout=120)
        r.raise_for_status()
        batch = r.json()
        if not isinstance(batch, list):
            break
        rows.extend(batch)
        if len(batch) < page:
            break
        offset += page
    return rows


def main() -> int:
    sk = _load_service_key()
    if not sk:
        print("Missing SUPABASE_SERVICE_ROLE_KEY", file=sys.stderr)
        return 1

    headers = _headers()
    base = f"{SUPABASE_URL}/rest/v1/loads"

    # --- Century date roll ---
    century_rows = _fetch_all_rows(
        base,
        headers,
        {
            "select": "id,ship_date",
            "template_type": "in.(Century,century_xlsx)",
            "dispatch_status": "neq.archived",
        },
    )

    rolled = 0
    for row in century_rows:
        rid = row.get("id")
        sd = _parse_date(row.get("ship_date"))
        if not rid or not sd:
            continue
        new_ship = sd + timedelta(days=1)
        new_purge = _last_day_of_month(new_ship)
        patch = {
            "ship_date": new_ship.isoformat(),
            "purge_date": new_purge.isoformat(),
            "dat_posted_at": None,
        }
        r = requests.patch(f"{base}?id=eq.{rid}", headers=headers, json=patch, timeout=60)
        r.raise_for_status()
        rolled += 1

    # --- Archive everything else that is not archived (excludes Century family) ---
    candidates = _fetch_all_rows(
        base,
        headers,
        {
            "select": "id,template_type",
            "dispatch_status": "neq.archived",
        },
    )
    to_archive = [
        str(r["id"])
        for r in candidates
        if (r.get("template_type") or "") not in CENTURY_TYPES
    ]

    archived = 0
    # PostgREST URL length limits — chunk UUIDs
    chunk_size = 80
    for i in range(0, len(to_archive), chunk_size):
        chunk = to_archive[i : i + chunk_size]
        in_list = "(" + ",".join(chunk) + ")"
        r = requests.patch(
            f"{base}?id=in.{in_list}",
            headers=headers,
            json={"dispatch_status": "archived", "is_active": False},
            timeout=120,
        )
        r.raise_for_status()
        archived += len(chunk)

    print(f"Nightly cleanup: {archived} archived, {rolled} Century loads date-rolled")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
