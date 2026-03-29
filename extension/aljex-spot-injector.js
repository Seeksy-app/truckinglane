/**
 * Aljex spot form autofill — runs on https://dandl.aljex.com/route.php*
 */

/** Aljex CustID by loads.template_type (no customer_name column). */
const TEMPLATE_TO_CUST_ID = {
  adelphia_xlsx: "133755",
  vms_email: "144472",
  oldcastle_gsheet: "282899",
  century_xlsx: "103744",
};

const TEMPLATE_TO_DISPLAY = {
  adelphia_xlsx: "ADELPHIA METALS",
  vms_email: "VMS",
  oldcastle_gsheet: "OLDCASTLE",
  century_xlsx: "CENTURY ENTERPRISES",
};

function custIdForLoad(load) {
  const tt = (load.template_type || "").trim();
  const id = TEMPLATE_TO_CUST_ID[tt];
  const display = TEMPLATE_TO_DISPLAY[tt];
  if (!id || !display) {
    console.warn("[Aljex injector] No CustID / display for template_type:", tt);
    return null;
  }
  return { id, display };
}

function mapTrailerToFld50(raw) {
  const u = (raw || "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!u) return "FLATBED";
  if (u.includes("FLATBED OR STEPDECK")) return "FLATBED OR STEPDECK";
  if (u.includes("FLATBED W TARPS")) return "FLATBED W TARPS";
  if (/^(F|FT)\s*48$/.test(u) || /^(F|FT)\s*53$/.test(u) || /^F\s*40$/.test(u)) return "FLATBED";
  if (/^VR\s*53$|^V\s*53$/.test(u)) return "VAN";
  if (u.includes("HOP 53") || (u.includes("HOPPER") && u.includes("53"))) return "HOPPER";
  if (u.includes("VAN")) return "VAN";
  if (u.includes("FLAT") || u === "FLATBED") return "FLATBED";
  return "FLATBED";
}

function toMMDDYY(shipDate) {
  if (!shipDate) return "";
  const iso = String(shipDate).slice(0, 10);
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return "";
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  const yy = String(dt.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function fmtMoney(n) {
  if (n == null || n === "") return "";
  const x = Number(n);
  if (Number.isNaN(x)) return "";
  return String(Math.round(x * 100) / 100);
}

function scrapeSpotNumber() {
  const inp = document.querySelector('input[name="fld101"]');
  if (inp?.value?.trim()) return inp.value.trim();
  const m = document.body.innerText.match(/Spot\s*#\s*(\d+)/i);
  return m ? m[1].trim() : "";
}

function setInput(name, value) {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function runFill(load) {
  const cust = custIdForLoad(load);
  if (!cust) {
    console.warn("[Aljex injector] Unknown customer for Aljex CustID mapping", load);
    chrome.runtime.sendMessage({
      type: "ALJEX_ABORT",
      reason: "unknown_template_type",
    });
    return;
  }

  setInput("fld2", toMMDDYY(load.ship_date));
  setInput("fld1", cust.display);

  const hid = document.querySelector('input[name="CustID"]');
  if (hid) {
    hid.value = cust.id;
    hid.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const pcity = document.getElementById("pcity");
  if (pcity) {
    pcity.value = load.pickup_city || "";
    pcity.dispatchEvent(new Event("input", { bubbles: true }));
  } else setInput("fld3", load.pickup_city || "");

  const pstate = document.getElementById("pstate");
  if (pstate) {
    pstate.value = (load.pickup_state || "").toUpperCase();
    pstate.dispatchEvent(new Event("change", { bubbles: true }));
  } else setInput("fld33", (load.pickup_state || "").toUpperCase());

  const ccity = document.getElementById("ccity");
  if (ccity) {
    ccity.value = load.dest_city || "";
    ccity.dispatchEvent(new Event("input", { bubbles: true }));
  } else setInput("fld4", load.dest_city || "");

  const cstate = document.getElementById("cstate");
  if (cstate) {
    cstate.value = (load.dest_state || "").toUpperCase();
    cstate.dispatchEvent(new Event("change", { bubbles: true }));
  } else setInput("fld34", (load.dest_state || "").toUpperCase());

  const equip = mapTrailerToFld50(load.trailer_type);
  const sel = document.querySelector('select[name="fld50"]');
  if (sel) {
    let opt = Array.from(sel.options).find((o) => o.value === equip);
    if (!opt) opt = Array.from(sel.options).find((o) => o.text.trim().toUpperCase() === equip);
    if (opt) {
      sel.value = opt.value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  const w = load.weight_lbs != null ? String(Math.round(Number(load.weight_lbs))) : "";
  setInput("fld6", w);
  setInput("fld30", load.commodity || "");

  const inv = fmtMoney(load.customer_invoice_total);
  const tgt = fmtMoney(load.target_pay);
  setInput("fld10", inv);
  setInput("fld75", tgt);
  setInput("custlh", inv);
  setInput("carrlh", tgt);

  const notes = document.querySelector('textarea[name="notes"]');
  if (notes) {
    notes.value = `Auto-imported from email. Load ID: ${load.load_number || load.id}`;
    notes.dispatchEvent(new Event("input", { bubbles: true }));
  }

  setTimeout(() => {
    const save =
      document.querySelector('input[value="Save"]') || document.querySelector('button[value="Save"]');
    if (save) save.click();
    else console.warn("[Aljex injector] Save control not found");
  }, 800);
}

(async function main() {
  const { pending_aljex_submit } = await chrome.storage.local.get("pending_aljex_submit");
  if (!pending_aljex_submit?.load?.id) return;

  const load = pending_aljex_submit.load;
  const spot = scrapeSpotNumber();

  if (spot) {
    await chrome.runtime.sendMessage({
      type: "ALJEX_SPOT_CAPTURED",
      loadId: load.id,
      spotNumber: spot,
    });
    return;
  }

  const isNewUrl = /[?&]what=new\b/.test(location.href);
  if (!isNewUrl) return;

  const attempts = Number(pending_aljex_submit.attempts || 0);
  if (attempts >= 3) {
    await chrome.runtime.sendMessage({ type: "ALJEX_ABORT", reason: "max_fill_attempts" });
    return;
  }

  await chrome.storage.local.set({
    pending_aljex_submit: { ...pending_aljex_submit, attempts: attempts + 1 },
  });

  runFill(load);
})();
