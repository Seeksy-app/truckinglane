#!/usr/bin/env python3
import csv, json, urllib.request, re, sys, io

SUPABASE_URL = "https://vjgakkomhphvdbwjjwiv.supabase.co"
AGENCY_ID = "25127efb-6eef-412a-a5d0-3d8242988323"
env = open("/root/.truckinglane-dat.env").read()
sk = re.search(r"SUPABASE_SERVICE_ROLE_KEY=(\S+)", env)
SERVICE_KEY = sk.group(1)


def compute_target_max_pay(is_per_ton: bool, rate: float, customer_total: float) -> tuple[float, float]:
    """Universal TL carrier pay (keep in sync with supabase/functions/_shared/targetPay.ts)."""
    if is_per_ton:
        if rate <= 0:
            return 0.0, 0.0
        return round(max(0.0, rate - 10), 2), round(max(0.0, rate - 5), 2)
    base = rate if rate > 0 else customer_total
    if base <= 0:
        return 0.0, 0.0
    return round(base * 0.8, 2), round(base * 0.85, 2)


def parse_num(val):
    try:
        return float(str(val).replace(",","").strip())
    except:
        return 0.0

csv_text = sys.stdin.read()
all_parsed = []
batch_pro_numbers = set()
open_count = 0
archived_status_count = 0
reader = csv.reader(io.StringIO(csv_text))
headers = next(reader)

for row in reader:
    if len(row) < 132:
        continue
    pro_num = row[1].strip()
    if not pro_num or not pro_num.isdigit():
        continue
    batch_pro_numbers.add(pro_num)
    status = row[13].strip().lower()

    rate = parse_num(row[294]) if len(row) > 294 else 0
    miles = parse_num(row[48])
    weight_lbs = parse_num(row[43])
    
    # Determine if per-ton rate (small numbers like 60, 70, 80, 100)
    # vs flat rate (large numbers like 1800, 4000, 7200)
    is_per_ton = rate > 0 and rate < 500
    
    if is_per_ton:
        # Weight col 43: if < 500 it's already in tons, if > 500 it's lbs
        if weight_lbs > 500:
            tons = weight_lbs / 2000.0
        elif weight_lbs > 1:
            tons = weight_lbs  # already in tons
        else:
            tons = 20.0  # default 20 tons (40,000 lbs / 2000)
        if weight_lbs <= 1:
            weight_lbs = tons * 2000  # store estimated lbs
        customer_total = rate * tons
    else:
        # Flat rate - use as-is
        customer_total = rate

    target_pay, max_pay = compute_target_max_pay(is_per_ton, rate, customer_total)

    is_open = status == "open"
    is_archived_by_status = status in ("covered", "delivered")
    if is_open:
        open_count += 1
    elif is_archived_by_status:
        archived_status_count += 1

    all_parsed.append({
        "agency_id": AGENCY_ID,
        "template_type": "aljex_big500",
        "load_number": pro_num,
        "dispatch_status": "open" if is_open else ("archived" if is_archived_by_status else "open"),
        "status": "open",
        "ship_date": row[15].strip() or None,
        "pickup_city": row[31].strip(),
        "pickup_state": row[32].strip(),
        "pickup_zip": row[33].strip() or None,
        "dest_city": row[35].strip(),
        "dest_state": row[36].strip(),
        "dest_zip": row[37].strip() or None,
        "commodity": row[42].strip(),
        "weight_lbs": weight_lbs if weight_lbs > 0 else None,
        "miles": miles if miles > 0 else None,
        "is_per_ton": is_per_ton,
        "customer_invoice_total": round(customer_total, 2),
        "target_pay": target_pay,
        "max_pay": max_pay,
        "rate_raw": str(rate),
        "is_active": is_open if is_open or is_archived_by_status else True,
        "source_row": json.dumps({
            "customer": row[4].strip(),
            "rate_per_unit": rate,
            "is_per_ton": is_per_ton,
            "parsed_from": "big500_csv"
        })
    })

by_num = {}
for l in all_parsed:
    by_num[l["load_number"]] = l
safe_loads = list(by_num.values())
dupes_dropped = len(all_parsed) - len(safe_loads)

def fetch_existing_load_numbers(load_numbers):
    if not load_numbers:
        return set()
    found = set()
    for i in range(0, len(load_numbers), 120):
        chunk = load_numbers[i : i + 120]
        in_list = ",".join(f'"{str(n).replace(chr(34), "")}"' for n in chunk)
        url = (
            f"{SUPABASE_URL}/rest/v1/loads?select=load_number"
            f"&agency_id=eq.{AGENCY_ID}&template_type=eq.aljex_big500&load_number=in.({in_list})"
        )
        req = urllib.request.Request(
            url,
            headers={"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"},
            method="GET",
        )
        try:
            resp = urllib.request.urlopen(req, timeout=30)
            for row in json.loads(resp.read().decode() or "[]"):
                ln = row.get("load_number")
                if ln is not None:
                    found.add(str(ln))
        except urllib.error.HTTPError as e:
            print(f"ERROR prefetch: {e.code} {e.read().decode()[:200]}", flush=True)
    return found

nums = [str(l["load_number"]) for l in safe_loads]
existing = fetch_existing_load_numbers(nums)
new_count = sum(1 for n in nums if n not in existing)
updated_count = len(nums) - new_count

print(f"Parsed {len(all_parsed)} rows, {len(safe_loads)} unique loads ({dupes_dropped} dupes dropped)", flush=True)
for l in safe_loads[:5]:
    ton_str = f"(${l['rate_raw']}/ton x {l['weight_lbs']/2000 if l['weight_lbs'] else 20:.0f}t)" if l['is_per_ton'] else ""
    print(f"  {l['load_number']}: {l['pickup_city']} {l['pickup_state']} -> {l['dest_city']} {l['dest_state']} | Rev: ${l['customer_invoice_total']:.0f} {ton_str} | Target: ${l['target_pay']:.0f}")

data = json.dumps(safe_loads).encode()
req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/loads?on_conflict=load_number,template_type,agency_id",
    data=data,
    headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    },
    method="POST"
)
try:
    resp = urllib.request.urlopen(req, timeout=30)
    print(f"SUCCESS - pushed {len(safe_loads)} loads to Supabase")
except urllib.error.HTTPError as e:
    print(f"ERROR: {e.code} {e.read().decode()[:300]}")
    sys.exit(1)

# Sweep previously open rows not present in this CSV batch -> archived/inactive
swept_count = 0
available_req = urllib.request.Request(
    f"{SUPABASE_URL}/rest/v1/loads?agency_id=eq.{AGENCY_ID}&template_type=eq.aljex_big500&dispatch_status=eq.open&select=id,load_number",
    headers={
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
    },
    method="GET"
)
try:
    avail_resp = urllib.request.urlopen(available_req, timeout=30)
    available_rows = json.loads(avail_resp.read().decode() or "[]")
except urllib.error.HTTPError as e:
    print(f"ERROR sweep query: {e.code} {e.read().decode()[:300]}")
    available_rows = []

for r in available_rows:
    ln = str(r.get("load_number", "")).strip()
    if ln and ln not in batch_pro_numbers:
        patch_req = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/loads?id=eq.{r['id']}",
            data=json.dumps({
                "dispatch_status": "archived",
                "is_active": False
            }).encode(),
            headers={
                "apikey": SERVICE_KEY,
                "Authorization": f"Bearer {SERVICE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal"
            },
            method="PATCH"
        )
        try:
            urllib.request.urlopen(patch_req, timeout=30)
            swept_count += 1
        except urllib.error.HTTPError as e:
            print(f"ERROR sweep patch for {ln}: {e.code} {e.read().decode()[:200]}")

print(f"Archive sweep archived {swept_count} loads", flush=True)
print(f"Summary: {open_count} open, {archived_status_count} archived via status, {swept_count} archived via sweep", flush=True)

log_body = {
    "agency_id": AGENCY_ID,
    "sender_email": "big500-sync@vps.truckinglane.com",
    "subject": "Big 500 Import",
    "status": "success",
    "imported_count": len(safe_loads),
    "raw_headers": {
        "template_type": "aljex_big500",
        "source": "Big 500 Import",
        "new": new_count,
        "updated": updated_count,
        "dupes_dropped": dupes_dropped,
        "duplicates_removed": dupes_dropped,
        "supports_removal": True,
        "removed": swept_count,
        "archived": swept_count,
    },
}
try:
    log_req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/email_import_logs",
        data=json.dumps(log_body).encode(),
        headers={
            "apikey": SERVICE_KEY,
            "Authorization": f"Bearer {SERVICE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    urllib.request.urlopen(log_req, timeout=30)
    print("Logged Big 500 import to email_import_logs", flush=True)
except urllib.error.HTTPError as e:
    print(f"WARN email_import_logs: {e.code} {e.read().decode()[:200]}", flush=True)
