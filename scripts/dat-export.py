#!/usr/bin/env python3
"""
DAT bulk CSV helpers — keep in sync with src/lib/datExport.ts (mapLoadToDAT).

Deploy copy to VPS: /root/scripts/dat-export.py

- Contact Method* = "primary phone" (not the phone number).
- Weight (lbs)* defaults to 1 when weight is null, 0, or missing.
- Equipment* = normalize_dat_equipment_code (FSD/FSB/FT→F, VR/CN→V, prefix F/V/R, else F).
"""

from __future__ import annotations

import csv
import io
import json
import sys
from datetime import datetime, timezone
from typing import Any

DAT_CONTACT_METHOD = "primary phone"


def dat_export_weight_lbs(weight_lbs: Any) -> str:
    """DAT requires a weight; use 1 when missing or zero."""
    if weight_lbs is None:
        return "1"
    try:
        n = float(weight_lbs)
    except (TypeError, ValueError):
        return "1"
    if n <= 0 or n != n:  # NaN
        return "1"
    return str(int(round(n)))


def clean_state(state: Any) -> str:
    if not state:
        return ""
    return str(state).split("/")[0].strip()


def parse_city_state_from_dot_embedded(city_raw: Any, state_raw: Any) -> tuple[str, str]:
    """If city looks like IVYLAND.PA and state is empty, split city + 2-letter state."""
    city = ("" if city_raw is None else str(city_raw)).strip()
    state = ("" if state_raw is None else str(state_raw)).strip()
    if city and not state:
        idx = city.rfind(".")
        if idx > 0 and idx < len(city) - 1:
            suffix = city[idx + 1 :].strip()
            if len(suffix) == 2 and suffix.isalpha():
                return city[:idx].strip(), suffix.upper()
    return city, state


def destination_resolved_for_dat(load: dict[str, Any]) -> tuple[str, str]:
    c, s = parse_city_state_from_dot_embedded(load.get("dest_city"), load.get("dest_state"))
    return c, clean_state(s)


def is_exportable_load(load: dict[str, Any]) -> bool:
    """Match datExport.ts isExportableLoad."""
    pc = (load.get("pickup_city") or "").upper().strip()
    if pc.startswith("PICK UP") or pc.startswith("NOTE") or pc.startswith("***"):
        return False
    if not (load.get("pickup_city") or "").strip() and not (load.get("dest_city") or "").strip():
        return False
    dc, ds = destination_resolved_for_dat(load)
    if not dc.strip() or not ds.strip():
        return False
    return True


def normalize_dat_equipment_code(raw: Any) -> str:
    """Normalize to DAT-valid F / V / R; empty or unknown → F. Keep in sync with datExport.ts."""
    s = ("" if raw is None else str(raw)).strip().upper()
    if not s:
        return "F"
    exact = {
        "FSD": "F",
        "FSB": "F",
        "FT": "F",
        "VR": "V",
        "CN": "V",
    }
    if s in exact:
        return exact[s]
    c0 = s[0]
    if c0 == "F":
        return "F"
    if c0 == "V":
        return "V"
    if c0 == "R":
        return "R"
    return "F"


def map_load_to_dat_row(load: dict[str, Any]) -> dict[str, str]:
    """Mirror of mapLoadToDAT in datExport.ts (subset used on VPS)."""
    now = datetime.now(timezone.utc)
    current_date = f"{now.month}/{now.day}/{now.year}"

    trailer_footage = load.get("trailer_footage")
    length_value = str(trailer_footage) if trailer_footage else "48"

    trailer = (load.get("trailer_type") or "").strip()
    trailer_l = trailer.lower()
    tt = load.get("template_type") or ""
    raw_equip = ""
    if not trailer:
        if tt in ("adelphia_xlsx", "vms_email", "oldcastle_gsheet"):
            raw_equip = "F"
    elif "van" in trailer_l or "dry" in trailer_l:
        raw_equip = "V"
    elif "reefer" in trailer_l or "refriger" in trailer_l:
        raw_equip = "R"
    elif "flat" in trailer_l or "step" in trailer_l:
        raw_equip = "F"
    elif "tanker" in trailer_l:
        raw_equip = "T"
    elif "hopper" in trailer_l:
        raw_equip = "HB"
    elif "lowboy" in trailer_l:
        raw_equip = "LB"
    elif "double" in trailer_l:
        raw_equip = "DD"
    elif "container" in trailer_l:
        raw_equip = "C"
    else:
        raw_equip = trailer

    equip = normalize_dat_equipment_code(raw_equip)

    w = dat_export_weight_lbs(load.get("weight_lbs"))

    ocity, ostate = parse_city_state_from_dot_embedded(
        load.get("pickup_city"), load.get("pickup_state")
    )
    dcity, dstate = destination_resolved_for_dat(load)

    return {
        "Pickup Earliest*": current_date,
        "Pickup Latest": current_date,
        "Length (ft)*": length_value,
        "Weight (lbs)*": w,
        "Full/Partial*": "Full",
        "Equipment*": equip,
        "Use Private Network*": "no",
        "Private Network Rate": "",
        "Allow Private Network Booking": "no",
        "Allow Private Network Bidding": "no",
        "Use DAT Loadboard*": "yes",
        "DAT Loadboard Rate": "",
        "Allow DAT Loadboard Booking": "no",
        "Use Extended Network": "no",
        "Contact Method*": DAT_CONTACT_METHOD,
        "Origin City*": ocity,
        "Origin State*": clean_state(ostate),
        "Origin Postal Code": "",
        "Destination City*": dcity,
        "Destination State*": dstate,
        "Destination Postal Code": "",
        "Comment": "",
        "Commodity": "",
        "Reference ID": "",
    }


DAT_COLUMNS = [
    "Pickup Earliest*",
    "Pickup Latest",
    "Length (ft)*",
    "Weight (lbs)*",
    "Full/Partial*",
    "Equipment*",
    "Use Private Network*",
    "Private Network Rate",
    "Allow Private Network Booking",
    "Allow Private Network Bidding",
    "Use DAT Loadboard*",
    "DAT Loadboard Rate",
    "Allow DAT Loadboard Booking",
    "Use Extended Network",
    "Contact Method*",
    "Origin City*",
    "Origin State*",
    "Origin Postal Code",
    "Destination City*",
    "Destination State*",
    "Destination Postal Code",
    "Comment",
    "Commodity",
    "Reference ID",
]


def _escape_field(s: str) -> str:
    if any(c in s for c in ',"\n'):
        return '"' + s.replace('"', '""') + '"'
    return s


def generate_dat_csv(loads: list[dict[str, Any]]) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=list(DAT_COLUMNS), extrasaction="ignore")
    w.writeheader()
    for load in loads:
        if not is_exportable_load(load):
            continue
        row = map_load_to_dat_row(load)
        w.writerow({k: row.get(k, "") for k in DAT_COLUMNS})
    return buf.getvalue()


def main() -> None:
    """Read JSON array of load objects from stdin; write DAT CSV to stdout."""
    data = sys.stdin.read()
    if not data.strip():
        print("Usage: echo '[{...}]' | python3 dat-export.py", file=sys.stderr)
        sys.exit(2)
    loads = json.loads(data)
    if not isinstance(loads, list):
        loads = [loads]
    sys.stdout.write(generate_dat_csv(loads))


if __name__ == "__main__":
    main()
