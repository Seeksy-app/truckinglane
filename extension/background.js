// Trucking Lane — background: AI leads + Aljex spot auto-submit queue.
// Big 500: when Aljex generates a CSV at /ptmp/*.csv, we fetch with session cookies and POST to VPS /upload-big500.

const SUPABASE_URL = "https://vjgakkomhphvdbwjjwiv.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ2Fra29taHBodmRid2pqd2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTIzNjMsImV4cCI6MjA4MjA2ODM2M30.mQRJK5Bj04P-hxwIWkVxG7lXiXI4daMs59UuxU2w1Ow";

const ALJEX_NEW_SPOT_URL = "https://dandl.aljex.com/route.php?fpweb_fn=spot&what=new";
const TL_TRIGGER_BASE = "http://187.77.217.123:3098";
const TL_TRIGGER_KEY = "tl-trigger-7b747d391801b8e5f55b4542";

const CHECK_INTERVAL_SECONDS = 30;
const ALJEX_POLL_MINUTES = 5;

/** Aljex Reports export → async CSV at random /ptmp/*.csv URL */
const BIG500_URL_FILTER = ["https://dandl.aljex.com/ptmp/*"];
const BIG500_DEDUPE_MS = 15000;
const big500RecentUrls = new Map();

function pruneBig500Dedupe() {
  const now = Date.now();
  for (const [u, t] of big500RecentUrls) {
    if (now - t > BIG500_DEDUPE_MS) big500RecentUrls.delete(u);
  }
}

function shouldProcessBig500Url(url) {
  try {
    const u = new URL(url);
    if (!u.pathname.startsWith("/ptmp/") || !u.pathname.toLowerCase().endsWith(".csv")) return false;
  } catch {
    return false;
  }
  pruneBig500Dedupe();
  const now = Date.now();
  const last = big500RecentUrls.get(url);
  if (last != null && now - last < BIG500_DEDUPE_MS) return false;
  big500RecentUrls.set(url, now);
  return true;
}

async function buildCookieHeaderForUrl(url) {
  try {
    const cookies = await chrome.cookies.getAll({ url });
    if (!cookies?.length) return "";
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  } catch (e) {
    console.warn("[TruckingLane/Big500] cookies", e);
    return "";
  }
}

async function fetchBig500Csv(url) {
  const cookieHeader = await buildCookieHeaderForUrl(url);
  const res = await fetch(url, {
    method: "GET",
    credentials: "omit",
    headers: cookieHeader ? { Cookie: cookieHeader } : {},
  });
  if (!res.ok) throw new Error(`CSV GET ${res.status}`);
  return await res.text();
}

async function postBig500ToTrigger(csvText) {
  const res = await fetch(`${TL_TRIGGER_BASE}/upload-big500`, {
    method: "POST",
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "X-TL-Trigger-Key": TL_TRIGGER_KEY,
    },
    body: csvText,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function handleBig500Completed(details) {
  if (details.statusCode !== 200) return;
  const url = details.url;
  if (!shouldProcessBig500Url(url)) return;

  try {
    console.log("[TruckingLane/Big500] detected", url);
    const csv = await fetchBig500Csv(url);
    if (!csv || csv.length < 10) {
      console.warn("[TruckingLane/Big500] empty CSV");
      return;
    }
    await postBig500ToTrigger(csv);
    await chrome.storage.local.set({
      big500_last_sync: {
        at: new Date().toISOString(),
        ok: true,
        url,
      },
    });
    console.log("[TruckingLane/Big500] synced to VPS");
  } catch (e) {
    console.error("[TruckingLane/Big500]", e);
    await chrome.storage.local.set({
      big500_last_sync: {
        at: new Date().toISOString(),
        ok: false,
        error: String(e?.message || e),
        url,
      },
    });
  }
}

if (chrome.webRequest?.onCompleted) {
  chrome.webRequest.onCompleted.addListener(
    (details) => {
      void handleBig500Completed(details);
    },
    { urls: BIG500_URL_FILTER },
    []
  );
}

chrome.alarms.create("checkNewLeads", { periodInMinutes: Math.max(CHECK_INTERVAL_SECONDS / 60, 1) });
chrome.alarms.create("aljexSpotPoll", { periodInMinutes: ALJEX_POLL_MINUTES });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkNewLeads") checkForNewLeads();
  if (alarm.name === "aljexSpotPoll") pollAljexSubmitQueue();
});

/** PostgREST loads poll for Aljex spot queue — not yet submitted; no dispatch_status filter. */
function buildAljexLoadsPollUrl() {
  const q = [
    "template_type=in.(adelphia_xlsx,vms_email,oldcastle_gsheet,century_xlsx)",
    "aljex_submitted=eq.false",
    "select=*",
    "limit=1",
  ].join("&");
  return `${SUPABASE_URL}/rest/v1/loads?${q}`;
}

async function pollAljexSubmitQueue() {
  try {
    const { accessToken } = await chrome.storage.local.get(["accessToken"]);
    if (!accessToken) {
      console.log("[TruckingLane/Aljex] No access token; skip spot queue poll");
      return;
    }

    const { aljex_workflow_open, pending_aljex_submit } = await chrome.storage.local.get([
      "aljex_workflow_open",
      "pending_aljex_submit",
    ]);
    if (aljex_workflow_open || pending_aljex_submit?.load) {
      return;
    }

    const url = buildAljexLoadsPollUrl();

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      if (response.status === 401) await chrome.storage.local.remove(["accessToken"]);
      console.error("[TruckingLane/Aljex] loads query failed", response.status);
      return;
    }

    const rows = await response.json();
    const load = rows[0];
    if (!load) return;

    await chrome.storage.local.set({
      pending_aljex_submit: { load, attempts: 0 },
      aljex_workflow_open: true,
    });

    chrome.tabs.create({ url: ALJEX_NEW_SPOT_URL }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        chrome.storage.local.set({ aljex_workflow_open: false });
        chrome.storage.local.remove(["pending_aljex_submit"]);
        return;
      }
      if (tab?.id != null) chrome.storage.local.set({ aljex_spot_tab_id: tab.id });
    });
  } catch (e) {
    console.error("[TruckingLane/Aljex] poll error", e);
  }
}

async function postMarkAljexSubmitted(loadId, spotNumber) {
  const res = await fetch(`${TL_TRIGGER_BASE}/mark-aljex-submitted`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-TL-Trigger-Key": TL_TRIGGER_KEY,
    },
    body: JSON.stringify({ load_id: loadId, aljex_spot_number: String(spotNumber).trim() }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `HTTP ${res.status}`);
  }
}

async function releaseAljexWorkflow() {
  await chrome.storage.local.set({
    aljex_workflow_open: false,
    aljex_spot_tab_id: null,
  });
}

async function handleSpotCaptured(loadId, spotNumber) {
  await postMarkAljexSubmitted(loadId, spotNumber);
  await chrome.storage.local.remove(["pending_aljex_submit"]);
  await releaseAljexWorkflow();
  setTimeout(() => pollAljexSubmitQueue(), 2500);
}

async function handleAljexAbort(reason) {
  console.warn("[TruckingLane/Aljex] abort:", reason);
  await chrome.storage.local.remove(["pending_aljex_submit"]);
  await releaseAljexWorkflow();
}

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(["aljex_spot_tab_id"], (s) => {
    if (s.aljex_spot_tab_id === tabId) {
      chrome.storage.local.set({ aljex_workflow_open: false, aljex_spot_tab_id: null });
    }
  });
});

// ----- Leads (existing) -----

async function checkForNewLeads() {
  try {
    const { accessToken, lastCheckTime } = await chrome.storage.local.get(["accessToken", "lastCheckTime"]);

    if (!accessToken) {
      console.log("[TruckingLane] No access token, skipping check");
      return;
    }

    const checkTime = lastCheckTime || new Date(Date.now() - 60000).toISOString();

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/leads?status=eq.pending&created_at=gt.${checkTime}&select=id,caller_phone,caller_name,caller_company,created_at,is_high_intent`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        console.log("[TruckingLane] Token expired, clearing...");
        await chrome.storage.local.remove(["accessToken"]);
      }
      return;
    }

    const leads = await response.json();

    await chrome.storage.local.set({ lastCheckTime: new Date().toISOString() });

    for (const lead of leads) {
      await showLeadNotification(lead);
    }

    await updateBadge();
  } catch (error) {
    console.error("[TruckingLane] Error checking leads:", error);
  }
}

async function showLeadNotification(lead) {
  const title = lead.is_high_intent ? "🔥 High Intent AI Lead!" : "📞 New AI Lead";
  const callerInfo = lead.caller_name || lead.caller_company || "Unknown Caller";

  chrome.notifications.create(`lead-${lead.id}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title: title,
    message: `${callerInfo}\n${formatPhoneNumber(lead.caller_phone)}`,
    priority: lead.is_high_intent ? 2 : 1,
    requireInteraction: lead.is_high_intent,
  });
}

function formatPhoneNumber(phone) {
  if (!phone) return "No phone";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === "1") {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

function getTodayMidnightUTC() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return midnight.toISOString();
}

async function updateBadge() {
  try {
    const { accessToken } = await chrome.storage.local.get(["accessToken"]);

    if (!accessToken) {
      chrome.action.setBadgeText({ text: "" });
      return;
    }

    const todayStart = getTodayMidnightUTC();

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/leads?status=eq.pending&created_at=gte.${todayStart}&select=id`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          Prefer: "count=exact",
        },
      }
    );

    if (response.ok) {
      const count = response.headers.get("content-range")?.split("/")[1] || "0";
      const countNum = parseInt(count, 10);

      chrome.action.setBadgeText({ text: countNum > 0 ? countNum.toString() : "" });
      chrome.action.setBadgeBackgroundColor({ color: "#f97316" });
    }
  } catch (error) {
    console.error("[TruckingLane] Error updating badge:", error);
  }
}

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith("lead-")) {
    const leadId = notificationId.replace("lead-", "");
    chrome.tabs.create({ url: `https://truckinglane.com/leads/${leadId}` });
  }
  chrome.notifications.clear(notificationId);
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("[TruckingLane] Extension installed/updated");
  updateBadge();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOGIN") {
    chrome.storage.local
      .set({
        accessToken: message.accessToken,
        lastCheckTime: new Date().toISOString(),
      })
      .then(() => {
        checkForNewLeads();
        updateBadge();
        pollAljexSubmitQueue();
        sendResponse({ success: true });
      });
    return true;
  }

  if (message.type === "LOGOUT") {
    chrome.storage.local.remove(["accessToken", "lastCheckTime"]).then(() => {
      chrome.action.setBadgeText({ text: "" });
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "CHECK_NOW") {
    checkForNewLeads().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.type === "ALJEX_SPOT_CAPTURED") {
    handleSpotCaptured(message.loadId, message.spotNumber)
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
    return true;
  }

  if (message.type === "ALJEX_ABORT") {
    handleAljexAbort(message.reason).then(() => sendResponse({ ok: true }));
    return true;
  }
});
