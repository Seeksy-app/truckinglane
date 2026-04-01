#!/usr/bin/env python3
import csv, json, urllib.request, re, sys, io

SUPABASE_URL = "https://vjgakkomhphvdbwjjwiv.supabase.co"
AGENCY_ID = "25127efb-6eef-412a-a5d0-3d8242988323"
MARGIN = 0.20  # 20% margin target

env = open("/root/.truckinglane-dat.env").read()
sk = re.search(r"SUPABASE_SERVICE_ROLE_KEY=(\S+)", env)
SERVICE_KEY = sk.group(1)

def parse_num(val):
    try:
        return float(str(val).replace(",","").strip())
    except:
        return 0.0

csv_text = sys.stdin.read()
loads = []
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
    benchmark = parse_num(row[131])  # Aljex benchmark carrier rate
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

    # Target carrier pay = revenue minus margin
    target_pay = customer_total * (1 - MARGIN)
    # For per-ton loads, benchmark is also per-ton - convert to total first
    if benchmark > 0 and is_per_ton:
        benchmark_total = benchmark * tons
        target_pay = min(target_pay, benchmark_total)
    elif benchmark > 0 and not is_per_ton:
        target_pay = min(target_pay, benchmark)

    is_open = status == "open"
    is_archived_by_status = status in ("covered", "delivered")
    if is_open:
        open_count += 1
    elif is_archived_by_status:
        archived_status_count += 1

    loads.append({
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
        "target_pay": round(target_pay, 2),
        "max_pay": round(target_pay * 1.05, 2),  # 5% flex above target
        "rate_raw": str(rate),
        "is_active": is_open if is_open or is_archived_by_status else True,
        "source_row": json.dumps({
            "customer": row[4].strip(),
            "rate_per_unit": rate,
            "is_per_ton": is_per_ton,
            "parsed_from": "big500_csv"
        })
    })

print(f"Parsed {len(loads)} loads", flush=True)
for l in loads[:5]:
    ton_str = f"(${l['rate_raw']}/ton x {l['weight_lbs']/2000 if l['weight_lbs'] else 20:.0f}t)" if l['is_per_ton'] else ""
    print(f"  {l['load_number']}: {l['pickup_city']} {l['pickup_state']} -> {l['dest_city']} {l['dest_state']} | Rev: ${l['customer_invoice_total']:.0f} {ton_str} | Target: ${l['target_pay']:.0f}")

data = json.dumps(loads).encode()
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
    print(f"SUCCESS - pushed {len(loads)} loads to Supabase")
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
