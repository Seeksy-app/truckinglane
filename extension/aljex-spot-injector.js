/**
 * Aljex Spot auto-submit content script.
 * Runs on https://dandl.aljex.com/route.php*
 *
 * Fetches candidate loads from VPS /get-unsubmitted-loads every 30 minutes,
 * fills Add Spot form, saves, scrapes Spot #, and calls /mark-aljex-submitted.
 */

const VPS_BASE = "http://187.77.217.123:3098";
const TRIGGER_KEY = "tl-trigger-7b747d391801b8e5f55b4542";
const POLL_EVERY_MS = 30 * 60 * 1000;
const SUBMIT_DELAY_MS = 3000;
const ADD_SPOT_URL = "https://dandl.aljex.com/route.php?fpweb_fn=spot&what=new";

const FIXED_SELECT_VALUES = {
  mode: "Brokerage",
  loadBoards: "Yes",
  createdBy: "DANDLSA3",
  office: "SA",
  assignedDisp: "DANDLSA",
  salesRep: "SA3",
  customerRateType: "Flat",
};

let running = false;

function nowDate() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function fmtMMDDYY(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function plusDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function parseISODate(s) {
  if (!s) return null;
  const d = new Date(String(s).slice(0, 10));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseSourceRow(sourceRow) {
  if (!sourceRow) return {};
  if (typeof sourceRow === "object") return sourceRow || {};
  try {
    return JSON.parse(String(sourceRow));
  } catch {
    return {};
  }
}

function parseEmailReceivedDate(src) {
  const candidates = [
    src.email_received_at,
    src.received_at,
    src.received_date,
    src.email_date,
    src.imported_at,
    src.created_at,
  ];
  for (const c of candidates) {
    const d = parseISODate(c);
    if (d) return d;
  }
  return null;
}

function equipmentToAljex(raw) {
  const v = String(raw || "").toUpperCase().trim();
  if (!v) return "FLATBED";
  if (v.startsWith("V")) return "VAN";
  if (v.startsWith("F")) return "FLATBED";
  return "FLATBED";
}

function setInputBySelectors(selectors, value) {
  for (const s of selectors) {
    const el = document.querySelector(s);
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }
  return false;
}

function setSelectByText(selectors, wantedText) {
  const want = String(wantedText || "").trim().toUpperCase();
  if (!want) return false;
  for (const s of selectors) {
    const sel = document.querySelector(s);
    if (!sel || !sel.options) continue;
    const opt = Array.from(sel.options).find(
      (o) => o.text.trim().toUpperCase() === want || o.value.trim().toUpperCase() === want
    );
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    }
  }
  return false;
}

function scrapeSpotNumber() {
  const fld = document.querySelector('input[name="fld101"]');
  if (fld?.value?.trim()) return fld.value.trim();
  const m = (document.body.innerText || "").match(/Spot\s*#\s*(\d+)/i);
  return m ? m[1].trim() : "";
}

function isLoggedIntoAljex() {
  const txt = (document.body.innerText || "").toLowerCase();
  return !(txt.includes("sign in") || txt.includes("password") || txt.includes("login"));
}

function isAddSpotPage() {
  return /[?&]fpweb_fn=spot\b/i.test(location.href) && /[?&]what=new\b/i.test(location.href);
}

async function fetchUnsubmittedLoads() {
  const res = await fetch(`${VPS_BASE}/get-unsubmitted-loads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TL-Trigger-Key": TRIGGER_KEY,
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `get-unsubmitted-loads failed (${res.status})`);
  }
  const payload = await res.json();
  return Array.isArray(payload.loads) ? payload.loads : [];
}

function formValuesFromLoad(load) {
  const src = parseSourceRow(load.source_row);
  const isCentury = load.template_type === "Century";
  const shipD = isCentury
    ? plusDays(parseEmailReceivedDate(src) || nowDate(), 1)
    : nowDate();
  const purgeD = isCentury ? endOfMonth(shipD) : plusDays(shipD, 1);
  const customer =
    String(src.customer || src.customer_name || src.Customer || "").trim() ||
    ({
      adelphia_xlsx: "ADELPHIA METALS",
      vms_email: "VMS",
      oldcastle_gsheet: "OLDCASTLE",
      Century: "CENTURY",
    }[load.template_type] || "CENTURY");
  let rate = Number(load.customer_invoice_total || 0);
  if (isCentury && (!rate || Number.isNaN(rate))) rate = 0;
  return {
    shipDate: fmtMMDDYY(shipD),
    purgeDate: fmtMMDDYY(purgeD),
    customer,
    originCity: load.pickup_city || "",
    originState: String(load.pickup_state || "").toUpperCase(),
    destCity: load.dest_city || "",
    destState: String(load.dest_state || "").toUpperCase(),
    weight: String(
      isCentury
        ? (Math.round(Number(load.weight_lbs || 1)) || 1)
        : (Math.round(Number(load.weight_lbs || 48000)) || 48000)
    ),
    equip: equipmentToAljex(load.trailer_type),
    customerRate: String(Math.round(rate * 100) / 100),
  };
}

function fillAddSpotForm(v) {
  setInputBySelectors(['input[name="fld2"]'], v.shipDate);
  setInputBySelectors(['input[name="fld8"]', 'input[name="fld11"]', 'input[name="purge_date"]'], v.purgeDate);
  setInputBySelectors(['input[name="fld1"]'], v.customer);
  setInputBySelectors(['input[name="fld3"]', "#pcity"], v.originCity);
  setInputBySelectors(['input[name="fld33"]', "#pstate"], v.originState);
  setInputBySelectors(['input[name="fld4"]', "#ccity"], v.destCity);
  setInputBySelectors(['input[name="fld34"]', "#cstate"], v.destState);
  setInputBySelectors(['input[name="fld6"]'], v.weight);
  setInputBySelectors(['input[name="fld10"]', 'input[name="custlh"]'], v.customerRate);
  setInputBySelectors(['input[name="custlh"]'], v.customerRate);
  setSelectByText(['select[name="fld50"]'], v.equip);

  setSelectByText(['select[name="fld74"]', 'select[name="customer_rate_type"]'], FIXED_SELECT_VALUES.customerRateType);
  setSelectByText(['select[name="fld_loadboard"]', 'select[name="load_boards"]'], FIXED_SELECT_VALUES.loadBoards);
  setSelectByText(['select[name="fld_mode"]', 'select[name="mode"]'], FIXED_SELECT_VALUES.mode);
  setSelectByText(['select[name="fld_createdby"]', 'select[name="created_by"]'], FIXED_SELECT_VALUES.createdBy);
  setSelectByText(['select[name="fld_office"]', 'select[name="office"]'], FIXED_SELECT_VALUES.office);
  setSelectByText(['select[name="fld_disp"]', 'select[name="assigned_disp"]'], FIXED_SELECT_VALUES.assignedDisp);
  setSelectByText(['select[name="fld_salesrep"]', 'select[name="sales_rep"]'], FIXED_SELECT_VALUES.salesRep);
}

function clickSave() {
  const save =
    document.querySelector('input[value="Save"]') ||
    document.querySelector('button[value="Save"]') ||
    document.querySelector('input[name="save"]');
  if (!save) return false;
  save.click();
  return true;
}

async function markSubmitted(loadId, spotNumber) {
  const res = await fetch(`${VPS_BASE}/mark-aljex-submitted`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TL-Trigger-Key": TRIGGER_KEY,
    },
    body: JSON.stringify({ load_id: loadId, aljex_spot_number: spotNumber || null }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `mark-aljex-submitted failed (${res.status})`);
  }
}

async function submitOne(load) {
  if (load.aljex_spot_number) {
    return { status: "skipped", reason: "already_has_spot_number" };
  }

  if (!isAddSpotPage()) {
    window.location.href = ADD_SPOT_URL;
    await new Promise((r) => setTimeout(r, 1800));
  }
  if (!isAddSpotPage()) throw new Error("Unable to reach Add Spot page");

  const vals = formValuesFromLoad(load);
  fillAddSpotForm(vals);
  if (!clickSave()) throw new Error("Save button not found");

  await new Promise((r) => setTimeout(r, 2500));
  const spot = scrapeSpotNumber();
  await markSubmitted(load.id, spot || null);
  return { status: "submitted", spot: spot || null };
}

async function runCycle() {
  if (running) return;
  running = true;
  let cycleSubmitted = 0;
  let cycleSkipped = 0;
  let cycleFailed = 0;
  try {
    if (!isLoggedIntoAljex()) return;

    const rows = await fetchUnsubmittedLoads();
    if (!rows.length) {
      console.log("[aljex-spot] No unsubmitted loads");
      return;
    }

    for (const load of rows) {
      try {
        const res = await submitOne(load);
        if (res.status === "skipped") {
          cycleSkipped += 1;
          continue;
        }
        cycleSubmitted += 1;
      } catch (e) {
        cycleFailed += 1;
        console.warn(`[aljex-spot] Failed ${load.load_number || load.id}:`, e);
      }
      await new Promise((r) => setTimeout(r, SUBMIT_DELAY_MS));
    }
  } catch (e) {
    console.warn("[aljex-spot] Cycle error:", e);
  } finally {
    running = false;
    console.log(`[aljex-spot] Summary: ${cycleSubmitted} submitted, ${cycleSkipped} skipped, ${cycleFailed} failed`);
  }
}

if (/^https:\/\/dandl\.aljex\.com\/route\.php/i.test(location.href)) {
  runCycle();
  setInterval(runCycle, POLL_EVERY_MS);
}
