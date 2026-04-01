// TEMPORARILY DISABLED - injector paused
// Set INJECTOR_ENABLED to true to re-enable
const INJECTOR_ENABLED = false;
if (!INJECTOR_ENABLED) { /* injector disabled */ } else {
/**
 * Aljex Spot auto-submit — content script on https://dandl.aljex.com/*
 * Loads only arrive via background → tab message { type: "PUSH_LOADS", loads }.
 */

/** When true: fill form only, do not click Save; process a single load. */
const DRY_RUN = true;

const SUBMIT_DELAY_MS = 3000;

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

function log(...args) {
  console.log("[aljex-spot]", ...args);
}

function warn(...args) {
  console.warn("[aljex-spot]", ...args);
}

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

function setInputBySelectors(selectors, value, fieldLabel) {
  for (const s of selectors) {
    const el = document.querySelector(s);
    log(`field "${fieldLabel}": selector "${s}" →`, el ? "FOUND" : "miss");
    if (el) {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      log(`field "${fieldLabel}": assigned value`, String(value).slice(0, 80));
      return true;
    }
  }
  warn(`field "${fieldLabel}": NO matching element for selectors`, selectors);
  return false;
}

function setSelectByText(selectors, wantedText, fieldLabel) {
  const want = String(wantedText || "").trim().toUpperCase();
  if (!want) {
    warn(`select "${fieldLabel}": empty wanted text`);
    return false;
  }
  for (const s of selectors) {
    const sel = document.querySelector(s);
    log(`select "${fieldLabel}": selector "${s}" →`, sel && sel.options ? "FOUND" : "miss");
    if (!sel || !sel.options) continue;
    const opt = Array.from(sel.options).find(
      (o) => o.text.trim().toUpperCase() === want || o.value.trim().toUpperCase() === want
    );
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      log(`select "${fieldLabel}": set to`, wantedText);
      return true;
    }
  }
  warn(`select "${fieldLabel}": no option matched`, wantedText, "selectors:", selectors);
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
  const bad = txt.includes("sign in") || txt.includes("password") || txt.includes("login");
  log("isLoggedIntoAljex:", !bad);
  return !bad;
}

function isAddSpotPage() {
  const ok = /[?&]fpweb_fn=spot\b/i.test(location.href) && /[?&]what=new\b/i.test(location.href);
  log("isAddSpotPage:", ok, location.href);
  return ok;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** True when Add Spot form fields are present (URL-independent). */
function hasAddSpotFormFields() {
  let nameHasSpot = false;
  for (const inp of document.querySelectorAll("input[name]")) {
    if ((inp.getAttribute("name") || "").toLowerCase().includes("spot")) {
      nameHasSpot = true;
      break;
    }
  }
  const hasCore =
    !!document.querySelector('input[name="fld2"]') &&
    !!document.querySelector('input[name="fld1"]');
  const ok = nameHasSpot || hasCore;
  log("hasAddSpotFormFields:", ok, { nameHasSpot, hasCore });
  return ok;
}

function isReadyForAddSpotFill() {
  return isAddSpotPage() || hasAddSpotFormFields();
}

function findShipmentsNavControl() {
  const scopes = document.querySelectorAll(
    "nav a, nav button, nav span, header a, header button, .menu a, .menu button, [class*='menu'] a, [class*='nav'] a, [id*='menu'] a, [id*='nav'] a, [class*='Menu'] a"
  );
  for (const el of scopes) {
    if (!el.offsetParent) continue;
    const t = el.textContent.replace(/\s+/g, " ").trim();
    if (t === "Shipments" || /^Shipments(\s|$)/i.test(t)) {
      log("findShipmentsNavControl: found", el.tagName, t);
      return el;
    }
  }
  const broad = document.querySelectorAll("a, button, span");
  for (const el of broad) {
    if (!el.offsetParent) continue;
    const t = el.textContent.replace(/\s+/g, " ").trim();
    if (t === "Shipments") {
      log("findShipmentsNavControl: found (broad)", el.tagName);
      return el;
    }
  }
  warn("findShipmentsNavControl: not found");
  return null;
}

function findAddSpotLoadMenuItem() {
  const scopes = document.querySelectorAll(
    "a, button, span, li, td, div[role='menuitem'], div[onclick]"
  );
  for (const el of scopes) {
    if (!el.offsetParent) continue;
    const t = el.textContent.replace(/\s+/g, " ").trim();
    if (/^Add Spot Load$/i.test(t) || t === "Add Spot Load") {
      log("findAddSpotLoadMenuItem: exact match", el.tagName);
      return el;
    }
  }
  for (const el of scopes) {
    if (!el.offsetParent) continue;
    const t = el.textContent.replace(/\s+/g, " ").trim();
    if (/Add Spot Load/i.test(t) && t.length < 48) {
      log("findAddSpotLoadMenuItem: loose match", el.tagName, t.slice(0, 40));
      return el;
    }
  }
  warn("findAddSpotLoadMenuItem: not found");
  return null;
}

async function waitForAddSpotFormReady(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (hasAddSpotFormFields()) return true;
    await sleep(150);
  }
  return false;
}

async function navigateToAddSpotViaMenu() {
  log("navigateToAddSpotViaMenu: start");
  if (isReadyForAddSpotFill()) {
    log("navigateToAddSpotViaMenu: already ready");
    return;
  }

  const shipEl = findShipmentsNavControl();
  if (!shipEl) {
    throw new Error("Shipments menu control not found");
  }
  log("navigateToAddSpotViaMenu: clicking Shipments");
  shipEl.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  shipEl.click();
  await sleep(500);

  const addEl = findAddSpotLoadMenuItem();
  if (!addEl) {
    throw new Error("Add Spot Load menu item not found");
  }
  log("navigateToAddSpotViaMenu: clicking Add Spot Load");
  addEl.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  addEl.click();

  const ready = await waitForAddSpotFormReady(15000);
  if (!ready) {
    throw new Error("Add Spot form did not appear after menu navigation");
  }
  log("navigateToAddSpotViaMenu: form detected");
}

function formValuesFromLoad(load) {
  const src = parseSourceRow(load.source_row);
  const isCentury = load.template_type === "century_xlsx";
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
      century_xlsx: "CENTURY ENTERPRISES",
    }[load.template_type] || "CENTURY ENTERPRISES");
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
  log("fillAddSpotForm: starting field assignments");
  setInputBySelectors(['input[name="fld2"]'], v.shipDate, "ship (fld2)");
  setInputBySelectors(['input[name="fld8"]', 'input[name="fld11"]', 'input[name="purge_date"]'], v.purgeDate, "purge");
  setInputBySelectors(['input[name="fld1"]'], v.customer, "customer (fld1)");
  setInputBySelectors(['input[name="fld3"]', "#pcity"], v.originCity, "origin city");
  setInputBySelectors(['input[name="fld33"]', "#pstate"], v.originState, "origin state");
  setInputBySelectors(['input[name="fld4"]', "#ccity"], v.destCity, "dest city");
  setInputBySelectors(['input[name="fld34"]', "#cstate"], v.destState, "dest state");
  setInputBySelectors(['input[name="fld6"]'], v.weight, "weight");
  setInputBySelectors(['input[name="fld10"]', 'input[name="custlh"]'], v.customerRate, "customer rate");
  setInputBySelectors(['input[name="custlh"]'], v.customerRate, "custlh");
  setSelectByText(['select[name="fld50"]'], v.equip, "equipment fld50");

  setSelectByText(['select[name="fld74"]', 'select[name="customer_rate_type"]'], FIXED_SELECT_VALUES.customerRateType, "customer rate type");
  setSelectByText(['select[name="fld_loadboard"]', 'select[name="load_boards"]'], FIXED_SELECT_VALUES.loadBoards, "load boards");
  setSelectByText(['select[name="fld_mode"]', 'select[name="mode"]'], FIXED_SELECT_VALUES.mode, "mode");
  setSelectByText(['select[name="fld_createdby"]', 'select[name="created_by"]'], FIXED_SELECT_VALUES.createdBy, "created by");
  setSelectByText(['select[name="fld_office"]', 'select[name="office"]'], FIXED_SELECT_VALUES.office, "office");
  setSelectByText(['select[name="fld_disp"]', 'select[name="assigned_disp"]'], FIXED_SELECT_VALUES.assignedDisp, "assigned disp");
  setSelectByText(['select[name="fld_salesrep"]', 'select[name="sales_rep"]'], FIXED_SELECT_VALUES.salesRep, "sales rep");
  log("fillAddSpotForm: done");
}

function clickSave() {
  const save =
    document.querySelector('input[value="Save"]') ||
    document.querySelector('button[value="Save"]') ||
    document.querySelector('input[name="save"]');
  log("clickSave: Save control", save ? save.tagName : "NOT FOUND");
  if (!save) return false;
  save.click();
  return true;
}

async function markSubmitted(loadId, spotNumber) {
  const payload = await chrome.runtime.sendMessage({
    action: "mark-aljex-submitted",
    load_id: loadId,
    aljex_spot_number: spotNumber || null,
  });
  if (!payload?.success) {
    throw new Error(payload?.error || "mark-aljex-submitted failed");
  }
}

async function submitOne(load) {
  log("submitOne: load", load?.load_number || load?.id, "DRY_RUN=", DRY_RUN);

  if (load.aljex_spot_number) {
    log("submitOne: skipped — already has aljex_spot_number");
    return { status: "skipped", reason: "already_has_spot_number" };
  }

  if (!isReadyForAddSpotFill()) {
    log("submitOne: opening Add Spot via Shipments → Add Spot Load (menu clicks)");
    await navigateToAddSpotViaMenu();
  }
  if (!isReadyForAddSpotFill()) {
    warn("submitOne: Add Spot form not available after menu navigation");
    throw new Error("Unable to reach Add Spot page");
  }

  const vals = formValuesFromLoad(load);
  log("submitOne: computed form values", vals);
  fillAddSpotForm(vals);

  if (DRY_RUN) {
    log("submitOne: DRY_RUN — skipping Save click and mark-aljex-submitted");
    return { status: "dry_run" };
  }

  if (!clickSave()) {
    warn("submitOne: Save button not found — abort");
    throw new Error("Save button not found");
  }

  await new Promise((r) => setTimeout(r, 2500));
  const spot = scrapeSpotNumber();
  log("submitOne: scraped spot #", spot || "(empty)");
  await markSubmitted(load.id, spot || null);
  return { status: "submitted", spot: spot || null };
}

function pickLoads(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (DRY_RUN) {
    log("DRY_RUN: processing first load only (of", rows.length, ")");
    return rows.slice(0, 1);
  }
  return rows;
}

async function runCycle(rows) {
  if (running) {
    warn("runCycle: already running — skip");
    return;
  }
  if (rows === undefined || !Array.isArray(rows) || rows.length === 0) {
    log("no loads provided");
    return;
  }
  const batch = pickLoads(rows);

  running = true;
  let cycleSubmitted = 0;
  let cycleSkipped = 0;
  let cycleFailed = 0;
  try {
    if (!isLoggedIntoAljex()) {
      warn("runCycle: not logged in — abort");
      return;
    }

    for (const load of batch) {
      try {
        const res = await submitOne(load);
        if (res.status === "skipped") {
          cycleSkipped += 1;
          continue;
        }
        if (res.status === "dry_run") {
          log("runCycle: dry run complete for one load");
          break;
        }
        cycleSubmitted += 1;
      } catch (e) {
        cycleFailed += 1;
        warn(`runCycle: failed load ${load.load_number || load.id}:`, e);
      }
      if (!DRY_RUN) {
        await new Promise((r) => setTimeout(r, SUBMIT_DELAY_MS));
      }
    }
  } catch (e) {
    warn("runCycle: error", e);
  } finally {
    running = false;
    log(
      `Summary: ${cycleSubmitted} submitted, ${cycleSkipped} skipped, ${cycleFailed} failed, DRY_RUN=${DRY_RUN}`
    );
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type !== "PUSH_LOADS") {
    return false;
  }

  log("Message received", {
    type: msg.type,
    loadCount: Array.isArray(msg.loads) ? msg.loads.length : 0,
    pageUrl: location.href,
  });

  runCycle(msg.loads)
    .then(() => sendResponse({ ok: true }))
    .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
  return true;
});
}
