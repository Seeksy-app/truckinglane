const VPS_URL = 'http://187.77.217.123:3098';
const TRIGGER_KEY = 'tl-trigger-7b747d391801b8e5f55b4542';
const SUPABASE_URL = 'https://vjgakkomhphvdbwjjwiv.supabase.co';
const SYNC_INTERVAL_MINUTES = 30;

/** Trucker Tools → same agency as extension Aljex sync */
const TRUCKERTOOLS_AGENCY_ID = '25127efb-6eef-412a-a5d0-3d8242988323';
const TRUCKERTOOLS_ALARM = 'truckertools-nearby';
const TRUCKERTOOLS_ADVANTAGE_ID = 'oc6bt2hs';
const TRUCKERTOOLS_USERNAME = 'andrew@podlogix.co';

// Supabase anon key for TruckingLanes
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ2Fra29taHBodmRid2pqd2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTIzNjMsImV4cCI6MjA4MjA2ODM2M30.mQRJK5Bj04P-hxwIWkVxG7lXiXI4daMs59UuxU2w1Ow';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.clear('cookie-sync');
  chrome.alarms.create('auto-sync', { periodInMinutes: SYNC_INTERVAL_MINUTES });
  chrome.alarms.create(TRUCKERTOOLS_ALARM, { periodInMinutes: 30 });
  // chrome.alarms.create('cookie-sync', { periodInMinutes: 25 });
  runFullSync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'auto-sync') runFullSync();
  if (alarm.name === TRUCKERTOOLS_ALARM) pollTruckerToolsNearby();
  // if (alarm.name === 'cookie-sync') syncCookiesOnly();
});

// ── WATCH FOR BIG 500 CSV DOWNLOADS ──────────────────────
chrome.downloads.onChanged.addListener(async (delta) => {
  if (delta.state?.current !== 'complete') return;
  
  try {
    const [item] = await chrome.downloads.search({ id: delta.id });
    if (!item) return;
    
    const filename = (item.filename || '').toLowerCase();
    const url = item.url || '';
    
    console.log('TruckingLane: Download detected:', filename, url.substring(0, 60));
    
    // Must be a CSV or XLS file
    if (!filename.match(/\.(csv|xls|xlsx)$/)) return;
    
    // Must have an Aljex tab open
    const aljexTabs = await chrome.tabs.query({ url: 'https://dandl.aljex.com/*' });
    if (aljexTabs.length === 0) return;
    
    console.log('TruckingLane: Aljex CSV download detected! Uploading Big 500...');
    await uploadBig500(item, aljexTabs[0]);
  } catch(err) {
    console.log('Download watcher error:', err.message);
  }
});

async function uploadBig500(downloadItem, aljexTab) {
  try {
    console.log('TruckingLane: Uploading Big 500 to VPS...');
    
    // Re-fetch the CSV from original URL using Aljex tab credentials
    let csvText = null;
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId: aljexTab.id },
        func: async (url) => {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) return null;
            return await r.text();
          } catch(e) { return null; }
        },
        args: [downloadItem.url]
      });
      csvText = results[0]?.result;
    } catch(e) {
      console.log('Script inject failed:', e.message);
    }
    
    if (!csvText) {
      console.log('TruckingLane: Could not read CSV - URL may have expired');
      return;
    }
    
    console.log(`TruckingLane: Got CSV, ${csvText.length} chars, uploading...`);
    
    const res = await fetch(`${VPS_URL}/upload-big500`, {
      method: 'POST',
      headers: {
        'X-TL-Trigger-Key': TRIGGER_KEY,
        'Content-Type': 'text/plain'
      },
      body: csvText
    });
    
    const result = await res.json();
    console.log('TruckingLane: Big 500 upload result:', result.output);
    
    // Update status
    await chrome.storage.local.set({
      lastBig500Sync: new Date().toISOString(),
      lastBig500Status: result.output
    });
    
  } catch(err) {
    console.log('Big 500 upload error:', err.message);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'truckertools-intercepted') {
    handleTruckerToolsIntercepted(msg)
      .then((r) =>
        sendResponse({
          ok: true,
          status: r?.vpsStatus ?? null,
          loadsCount: r?.loadsCount ?? 0,
        })
      )
      .catch((e) => sendResponse({ ok: false, error: e?.message || String(e) }));
    return true;
  }
  if (msg.action === 'sync-now') {
    runFullSync()
      .then(() => triggerAljexSpotInjector().catch(e => console.log('Spot injector error:', e.message)))
      .then(() => sendResponse({ success: true }));
    return true;
  }
  if (msg.action === 'get-unsubmitted-loads') {
    fetch(`${VPS_URL}/get-unsubmitted-loads`, {
      method: 'POST',
      headers: {
        'X-TL-Trigger-Key': TRIGGER_KEY,
        'Content-Type': 'application/json',
      },
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || `HTTP ${res.status}`);
        }
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          throw new Error('Invalid JSON from /get-unsubmitted-loads');
        }
        sendResponse({ success: true, ...(data || {}) });
      })
      .catch((e) => sendResponse({ success: false, error: e.message || String(e) }));
    return true;
  }
  if (msg.action === 'mark-aljex-submitted') {
    fetch(`${VPS_URL}/mark-aljex-submitted`, {
      method: 'POST',
      headers: {
        'X-TL-Trigger-Key': TRIGGER_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        load_id: msg.load_id,
        aljex_spot_number: msg.aljex_spot_number ?? null,
      }),
    })
      .then(async (res) => {
        const text = await res.text();
        if (!res.ok) {
          throw new Error(text || `HTTP ${res.status}`);
        }
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch {
          data = {};
        }
        sendResponse({ success: true, ...(data || {}) });
      })
      .catch((e) => sendResponse({ success: false, error: e.message || String(e) }));
    return true;
  }
  if (msg.action === 'get-status') {
    chrome.storage.local.get(['lastSync', 'lastStatus', 'aljexOk', 'datOk', 'loadsScraped'], sendResponse);
    return true;
  }
  if (msg.action === 'push-to-aljex') {
    triggerAljexSpotInjector()
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
    return true;
  }
});

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (msg?.action === 'push-to-aljex') {
    triggerAljexSpotInjector()
      .then(() => sendResponse({ success: true }))
      .catch((e) => sendResponse({ success: false, error: e?.message || String(e) }));
    return true;
  }
});

// ── FULL SYNC: cookies + scrape loads + DAT token ─────────────
async function runFullSync() {
  const results = { aljex: false, dat: false, loads: 0, timestamp: new Date().toISOString() };

  const [aljexResult, datResult] = await Promise.allSettled([
    syncAljexWithScrape(),
    syncDatToken()
  ]);
  
  // Also trigger Big 500 export
  // triggerBig500Export().catch(e => console.log('Big 500 trigger error:', e.message));
  triggerAljexSpotInjector().catch(e => console.log('Spot injector error:', e.message));

  if (aljexResult.status === 'fulfilled') {
    results.aljex = aljexResult.value.ok;
    results.loads = aljexResult.value.loads || 0;
  }
  results.dat = datResult.status === 'fulfilled' && datResult.value;

  const status = `Aljex: ${results.aljex ? 'OK' : 'FAIL'} (${results.loads} loads)  DAT: ${results.dat ? 'OK' : 'FAIL'}`;
  await chrome.storage.local.set({
    lastSync: results.timestamp,
    lastStatus: status,
    aljexOk: results.aljex,
    datOk: results.dat,
    loadsScraped: results.loads
  });

  console.log('Sync complete:', status);
  return results;
}

async function triggerAljexSpotInjector() {
  const res = await fetch(`${VPS_URL}/get-unsubmitted-loads`, {
    method: 'POST',
    headers: {
      'X-TL-Trigger-Key': TRIGGER_KEY,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text || `get-unsubmitted-loads HTTP ${res.status}`);
  }
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Invalid JSON from /get-unsubmitted-loads');
  }
  const loads = Array.isArray(data.loads) ? data.loads : [];

  if (loads.length === 0) {
    console.log('[aljex-spot] No unsubmitted loads');
    return;
  }

  const tabs = await chrome.tabs.query({ url: 'https://dandl.aljex.com/*' });
  if (tabs.length === 0) {
    console.log('[aljex-spot] No Aljex tab open — cannot push loads');
    return;
  }

  const tabId = tabs[0].id;
  const payload = { type: 'PUSH_LOADS', loads };
  chrome.tabs.sendMessage(tabId, payload, () => {
    if (chrome.runtime.lastError) {
      console.warn('[aljex-spot] sendMessage to Aljex tab:', chrome.runtime.lastError.message);
    }
  });
}

// ── SYNC COOKIES ONLY (every 25 min) ──────────────────────────
async function syncCookiesOnly() {
  // await syncAljexCookie();
  await syncDatToken();
}

// ── ALJEX: SYNC COOKIE + SCRAPE LOADS ─────────────────────────
async function syncAljexWithScrape() {
  // First sync the cookie to VPS
  // await syncAljexCookie();

  // Then scrape loads from the authenticated tab
  try {
    // Find route.php tab specifically for scraping
    let tabs = await chrome.tabs.query({ url: 'https://dandl.aljex.com/route.php*' });
    if (tabs.length === 0) {
      tabs = await chrome.tabs.query({ url: 'https://dandl.aljex.com/*' });
    }
    
    if (tabs.length === 0) {
      console.log('No Aljex tab open - cannot scrape loads');
      return { ok: false, loads: 0 };
    }

    // Inject scraper into the Aljex tab
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      func: scrapeAljexLoads
    });

    const loads = results[0]?.result || [];
    console.log(`Scraped ${loads.length} loads from Aljex`);

    if (loads.length > 0) {
      await pushLoadsToSupabase(loads);
    }

    return { ok: true, loads: loads.length };
  } catch (err) {
    console.log('Aljex scrape error:', err.message);
    return { ok: false, loads: 0 };
  }
}

// ── INJECTED INTO ALJEX TAB ───────────────────────────────────
function scrapeAljexLoads() {
  const loads = [];
  try {
    // Status is in the TD class attribute, not textContent
    const statusCells = document.querySelectorAll('td.OPEN, td.COVERED');
    console.log('TruckingLane: found ' + statusCells.length + ' OPEN/COVERED cells');
    
    for (const statusCell of statusCells) {
      const row = statusCell.parentElement;
      const cells = row.querySelectorAll('td');
      if (cells.length < 10) continue;
      
      const status = statusCell.className.trim();
      
      // Pro# is in oncontextmenu attr: document.domatch.pro.value='1810965'
      const ctxAttr = statusCell.getAttribute('oncontextmenu') || '';
      const proMatch = ctxAttr.match(/pro\.value='(\d+)'/);
      if (!proMatch) continue;
      const proNum = proMatch[1];
      
      // Parse origin: col 3 format "AL CITY NAME(phone)"
      const originRaw = cells[3]?.textContent?.trim() || '';
      const originState = originRaw.substring(0, 2).trim();
      const originCity = originRaw.substring(2).split('(')[0].trim();
      
      // Parse dest: col 4 format "WI CITY NAME(phone)"  
      const destRaw = cells[4]?.textContent?.trim() || '';
      const destState = destRaw.substring(0, 2).trim();
      const destCity = destRaw.substring(2).split('(')[0].trim();
      
      // Customer: col 2, strip phone
      const customerRaw = cells[2]?.textContent?.trim() || '';
      const customer = customerRaw.split('(')[0].trim();
      
      // Parse weight - strip non-numeric
      const weightRaw = cells[12]?.textContent?.trim() || '';
      const weightNum = parseFloat(weightRaw.replace(/[^0-9.]/g, '')) || null;

      const load = {
        template_type: 'aljex_big500',
        load_number: proNum,
        dispatch_status: status.toLowerCase() === 'open' ? 'open' : status.toLowerCase(),
        pickup_city: originCity,
        pickup_state: originState,
        pickup_location_raw: cells[3]?.textContent?.trim() || '',
        dest_city: destCity,
        dest_state: destState,
        dest_location_raw: cells[4]?.textContent?.trim() || '',
        ship_date: cells[6]?.textContent?.trim() || null,
        trailer_type: cells[11]?.textContent?.trim() || '',
        weight_lbs: weightNum,
        is_active: true,
        status: 'open',
        source_row: JSON.stringify({customer, scraped_from: 'chrome_extension', scraped_at: new Date().toISOString()})
      };
      
      loads.push(load);
    }
    // ── SPOT LOADS (bottom section - has rates visible) ──────
    const spotRows = document.querySelectorAll('table tr');
    let spotSection = false;
    for (const row of spotRows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 8) continue;
      
      // Detect spot loads section by looking for numeric spot# in col 0
      const spotNum = cells[0]?.textContent?.trim();
      if (!spotNum || !/^\d{7,}$/.test(spotNum)) continue;
      
      // Skip header rows
      const customer = cells[1]?.textContent?.trim();
      if (!customer || customer === 'Customer') continue;
      
      const originRaw = cells[4]?.textContent?.trim() || '';
      const destRaw = cells[5]?.textContent?.trim() || '';
      const customerRate = cells[11]?.textContent?.trim() || '';
      const carrierRate = cells[12]?.textContent?.trim() || '';
      
      // Only include if has a real rate
      if (!customerRate || customerRate === '.00' || customerRate === '0.00') continue;

      // Parse origin - format "ST CITY NAME" 
      const originState = originRaw.substring(0, 2).trim();
      const originCity = originRaw.substring(2).trim();
      const destState = destRaw.substring(0, 2).trim();
      const destCity = destRaw.substring(2).trim();

      const weightRaw = cells[6]?.textContent?.trim() || '';
      const weightNum = parseFloat(weightRaw.replace(/[^0-9.]/g, '')) || null;
      const rateNum = parseFloat(customerRate.replace(/[^0-9.]/g, '')) || 0;
      const carrierNum = parseFloat(carrierRate.replace(/[^0-9.]/g, '')) || 0;

      loads.push({
        template_type: 'aljex_spot',
        load_number: spotNum,
        dispatch_status: 'open',
        status: 'open',
        customer_invoice_total: rateNum,
        target_pay: carrierNum,
        max_pay: carrierNum,
        pickup_city: originCity,
        pickup_state: originState,
        pickup_location_raw: originRaw,
        dest_city: destCity,
        dest_state: destState,
        dest_location_raw: destRaw,
        weight_lbs: weightNum,
        trailer_type: cells[7]?.textContent?.trim() || '',
        ship_date: cells[9]?.textContent?.trim() || null,
        delivery_date: cells[10]?.textContent?.trim() || null,
        is_active: true,
        source_row: JSON.stringify({
          customer,
          scraped_from: 'chrome_extension',
          scraped_at: new Date().toISOString()
        })
      });
    }

    console.log('TruckingLane: scraped ' + loads.length + ' loads successfully');
  } catch(err) {
    console.log('Scrape error:', err.message);
  }
  return loads;
}

// ── PUSH LOADS TO SUPABASE ────────────────────────────────────
// ── AUTO-TRIGGER BIG 500 EXPORT ──────────────────────────
async function triggerBig500Export() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://dandl.aljex.com/*' });
    if (tabs.length === 0) return;
    
    const tab = tabs[0];
    
    // POST directly to route.php with Big Export 500 params
    const today = new Date();
    const shipDate = (today.getMonth()+1).toString().padStart(2,'0') + '/' + 
                     today.getDate().toString().padStart(2,'0') + '/' + 
                     String(today.getFullYear()).slice(-2);
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: async (shipDate) => {
        try {
          // Get auth tokens from existing form
          const mainForm = document.querySelector('form#route, form[name="route"]');
          if (!mainForm) return { url: null, error: 'no main form' };
          
          const qual = mainForm.querySelector('[name="qual"]')?.value || 'xie56jks';
          const name = mainForm.querySelector('[name="name"]')?.value || 'dandl51';
          const c_tok = mainForm.querySelector('[name="c_tok"]')?.value || '';
          const ctlrec = mainForm.querySelector('[name="ctlrec"]')?.value || '';
          const sys = mainForm.querySelector('[name="sys"]')?.value || '3a';
          
          const params = new URLSearchParams({
            qual, name, c_tok, sys, ctlrec,
            prcnam: 'actvrept',
            webprint: 'actvrept',
            type: 'validate',
            option: 'reports',
            rpt: '230',
            rptname: 'Big Export 500',
            group: 'excel',
            fld28: shipDate,  // Ship Date from
            fld37: 'Y',       // Covered
            fld61: 'Y',
            fld62: 'Y',
            oname: 'noname',
            ctlval: '', recno: '', pro: '', jobnam: '', addcar: '',
            trailers: '', what: '', select: '', qualifier: 'dandl'
          });
          
          const resp = await fetch('https://dandl.aljex.com/route.php', {
            method: 'POST',
            body: params,
            credentials: 'include'
          });
          
          const html = await resp.text();
          
          // Look for ptmp URL in response
          const match = html.match(/href="(\/ptmp\/[^"]+\.csv)"/);
          if (match) {
            return { url: 'https://dandl.aljex.com' + match[1], method: 'direct_post' };
          }
          
          // Also check for full URL
          const match2 = html.match(/href="(https?:\/\/[^"]*\/ptmp\/[^"]+\.csv)"/);
          if (match2) {
            return { url: match2[1], method: 'direct_post_full' };
          }
          
          return { url: null, method: 'posted_no_url', snippet: html.substring(0, 300) };
        } catch(e) {
          return { url: null, error: e.message };
        }
      },
      args: [shipDate]
    });
    
    const result = results[0]?.result;
    console.log('TruckingLane: Big 500 trigger result:', JSON.stringify(result));
    
    if (result?.url) {
      // Fetch CSV from inside the Aljex tab (needs auth cookies)
      const csvResults = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (url) => {
          try {
            const r = await fetch(url, { credentials: 'include' });
            if (!r.ok) return null;
            return await r.text();
          } catch(e) { return null; }
        },
        args: [result.url]
      });
      
      const csvText = csvResults[0]?.result;
      if (!csvText) {
        console.log('TruckingLane: Could not fetch Big 500 CSV - URL expired, will get fresh one next sync');
        return;
      }
      
      console.log(`TruckingLane: Auto Big 500 CSV fetched, ${csvText.length} chars`);
      
      const vpsResp = await fetch(`${VPS_URL}/upload-big500`, {
        method: 'POST',
        headers: { 'X-TL-Trigger-Key': TRIGGER_KEY, 'Content-Type': 'text/plain' },
        body: csvText
      });
      const vpsResult = await vpsResp.json();
      console.log('TruckingLane: Auto Big 500 uploaded:', vpsResult.output?.substring(0, 100));
    }
  } catch(err) {
    console.log('triggerBig500Export error:', err.message);
  }
}

async function pushLoadsToSupabase(loads) {
  // Send to VPS which uses service role key to bypass RLS
  try {
    const res = await fetch(`${VPS_URL}/insert-aljex-loads`, {
      method: 'POST',
      headers: {
        'X-TL-Trigger-Key': TRIGGER_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ loads })
    });
    const text = await res.text();
    console.log(`VPS insert status: ${res.status} response: ${text.substring(0, 200)}`);
  } catch (err) {
    console.log('VPS insert error:', err.message);
  }
}

// ── SYNC ALJEX COOKIE TO VPS ──────────────────────────────────
async function syncAljexCookie() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: 'dandl.aljex.com' });
    if (cookies.length === 0) return false;

    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    const ssoCookie = cookies.find(c => c.name === 'aljex_sso_dandl');
    const primaryCookie = ssoCookie ? ssoCookie.value : cookieString;

    const response = await fetch(`${VPS_URL}/update-aljex-cookie`, {
      method: 'POST',
      headers: { 'X-TL-Trigger-Key': TRIGGER_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cookie: primaryCookie,
        fullCookieString: cookieString,
        cookies: cookies.map(c => ({ name: c.name, value: c.value, domain: c.domain })),
        timestamp: new Date().toISOString()
      })
    });
    return response.ok;
  } catch (err) {
    console.log('Cookie sync error:', err.message);
    return false;
  }
}

// ── SYNC DAT TOKEN ────────────────────────────────────────────
async function syncDatToken() {
  try {
    const tabs = await chrome.tabs.query({ url: 'https://one.dat.com/*' });
    if (tabs.length > 0) {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            for (let i = 0; i < localStorage.length; i++) {
              const val = localStorage.getItem(localStorage.key(i));
              if (val && val.startsWith('eyJ') && val.length > 100) return val;
            }
            for (let i = 0; i < sessionStorage.length; i++) {
              const val = sessionStorage.getItem(sessionStorage.key(i));
              if (val && val.startsWith('eyJ') && val.length > 100) return val;
            }
            return null;
          }
        });
        const token = results[0]?.result;
        if (token) {
          const res = await fetch(`${VPS_URL}/update-dat-token`, {
            method: 'POST',
            headers: { 'X-TL-Trigger-Key': TRIGGER_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ token })
          });
          if (res.ok) return true;
        }
      } catch (e) { console.log('DAT inject failed:', e.message); }
    }

    const datCookies = await chrome.cookies.getAll({ domain: 'one.dat.com' });
    if (datCookies.length > 0) {
      const cookieString = datCookies.map(c => `${c.name}=${c.value}`).join('; ');
      const res = await fetch(`${VPS_URL}/update-dat-cookies`, {
        method: 'POST',
        headers: { 'X-TL-Trigger-Key': TRIGGER_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cookies: cookieString })
      });
      return res.ok;
    }
    return false;
  } catch (err) {
    console.log('DAT sync error:', err.message);
    return false;
  }
}

// ── TRUCKER TOOLS: getNearbyLoadsV5 intercept + scheduled replay ─────────

function ttPickNumber(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    const n = parseFloat(String(v).replace(/[$,]/g, ''));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function ttStr(x) {
  if (x == null) return '';
  return String(x).trim();
}

function extractTruckerToolsLoadsArray(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return [];
  /** API shape { meta, data: Load[] } */
  if (
    Array.isArray(json.data) &&
    json.data.length > 0 &&
    typeof json.data[0] === 'object'
  ) {
    return json.data;
  }
  const keys = [
    'loads',
    'nearbyLoads',
    'nearby_loads',
    'searchResults',
    'results',
    'matches',
    'items',
    'getNearbyLoadsV5',
  ];
  for (const k of keys) {
    const v = json[k];
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return v;
  }
  if (json.data && typeof json.data === 'object') {
    for (const k of keys) {
      const v = json.data[k];
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return v;
    }
    const gql = json.data.getNearbyLoadsV5;
    if (Array.isArray(gql) && gql.length > 0 && typeof gql[0] === 'object') return gql;
    if (gql && typeof gql === 'object') {
      for (const k of keys) {
        const v = gql[k];
        if (Array.isArray(v) && v.length > 0 && typeof v[0] === 'object') return v;
      }
    }
  }
  for (const k of Object.keys(json)) {
    const v = json[k];
    if (
      Array.isArray(v) &&
      v.length > 0 &&
      typeof v[0] === 'object' &&
      (k.toLowerCase().includes('load') || k.toLowerCase().includes('nearby'))
    ) {
      return v;
    }
  }
  return [];
}

function mapTruckerToolsLoad(raw, idx) {
  /** getNearbyLoadsV5 flat shape: originCity, destinationCity, offerRate, equipmentType, … */
  const origins = Array.isArray(raw.origins) ? raw.origins : raw.origin ? [raw.origin] : [];
  const o0 = origins[0] || {};
  const dests = Array.isArray(raw.destinations) ? raw.destinations : [];
  const d0 = dests[0] || {};

  const pickup_city_f = ttStr(
    raw.originCity || o0.city || o0.cityName || o0.locality || o0.name
  );
  const pickup_state = ttStr(
    raw.originState || o0.state || o0.stateCode || o0.region
  ).slice(0, 8);

  const dest_city_f = ttStr(
    raw.destinationCity || d0.city || d0.cityName || d0.locality || d0.name
  );
  const dest_state = ttStr(
    raw.destinationState || d0.state || d0.stateCode || d0.region
  ).slice(0, 8);

  const ship_raw =
    raw.pickupDate ??
    raw.pickupDateFrom ??
    raw.pickup_date ??
    raw.pickupFrom ??
    null;
  const ship_date = ship_raw != null ? ttStr(ship_raw) : null;

  const trailer_type = ttStr(
    raw.equipmentType ||
      raw.truckType ||
      raw.equipment ||
      raw.trailerType ||
      raw.trailer_type
  );

  const weight_lbs = ttPickNumber(
    raw.weight,
    raw.weightLbs,
    raw.weight_lbs,
    raw.totalWeight
  );
  const rate = ttPickNumber(
    raw.offerRate,
    raw.rate,
    raw.totalRate,
    raw.customerRate,
    raw.linehaul,
    raw.lineHaul,
    raw.rateAmount,
    raw.brokerRate,
    raw.pay,
    raw.carrierPay,
    raw.totalPay
  );
  const miles_tt = ttPickNumber(raw.miles);

  const target_pay =
    rate != null && Number.isFinite(rate) ? Math.round(rate * 0.8) : 0;
  const max_pay =
    rate != null && Number.isFinite(rate) ? Math.round(rate * 0.85) : 0;
  const target_commission =
    rate != null && Number.isFinite(rate) ? Math.round(rate - target_pay) : 0;
  const max_commission =
    rate != null && Number.isFinite(rate) ? Math.round(rate - max_pay) : 0;

  const id =
    raw.id ??
    raw.loadId ??
    raw.shipmentId ??
    raw.uuid ??
    raw.referenceId ??
    raw.referenceNumber ??
    `gen-${idx}-${Date.now()}`;

  const load_number = `TT-${String(id).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)}`;

  return {
    agency_id: TRUCKERTOOLS_AGENCY_ID,
    template_type: 'truckertools',
    load_number,
    dispatch_status: 'open',
    status: 'open',
    pickup_city: pickup_city_f || null,
    pickup_state: pickup_state || null,
    pickup_location_raw:
      pickup_city_f && pickup_state
        ? `${pickup_city_f}, ${pickup_state}`
        : pickup_city_f || null,
    dest_city: dest_city_f || null,
    dest_state: dest_state || null,
    dest_location_raw:
      dest_city_f && dest_state
        ? `${dest_city_f}, ${dest_state}`
        : dest_city_f || null,
    ship_date,
    trailer_type: trailer_type || null,
    weight_lbs,
    miles: miles_tt != null ? miles_tt : undefined,
    rate_raw: rate,
    customer_invoice_total: rate != null ? rate : 0,
    target_pay,
    max_pay,
    target_commission,
    max_commission,
    commission_target_pct: rate != null && Number.isFinite(rate) ? 0.2 : 0,
    commission_max_pct: rate != null && Number.isFinite(rate) ? 0.15 : 0,
    is_per_ton: false,
    is_active: true,
    source_row: JSON.stringify({
      truckertools: true,
      scraped_at: new Date().toISOString(),
      raw,
    }),
  };
}

function mapTruckerToolsResponseToLoads(json) {
  const rows = extractTruckerToolsLoadsArray(json);
  return rows.map((r, i) => mapTruckerToolsLoad(r, i));
}

async function pushTruckerToolsLoadsToVps(loads) {
  if (!loads || loads.length === 0) return null;
  const res = await fetch(`${VPS_URL}/insert-aljex-loads`, {
    method: 'POST',
    headers: {
      'X-TL-Trigger-Key': TRIGGER_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ loads }),
  });
  const text = await res.text();
  console.log(`[truckertools] VPS insert: ${res.status} ${text.slice(0, 200)}`);
  return res.status;
}

async function handleTruckerToolsIntercepted(msg) {
  const url = msg.url || '';
  const authorization = msg.authorization || null;
  const json = msg.json;

  const toStore = {};
  if (url) toStore.truckertools_nearby_url = url;
  if (authorization) toStore.truckertools_token = authorization;
  if (Object.keys(toStore).length > 0) {
    await chrome.storage.local.set(toStore);
  }

  const { truckertools_logged_sample: alreadyLogged } = await chrome.storage.local.get([
    'truckertools_logged_sample',
  ]);
  if (!alreadyLogged && json != null) {
    console.log(
      '[truckertools] first intercepted getNearbyLoadsV5 response (inspect field names):',
      JSON.stringify(json, null, 2)
    );
    await chrome.storage.local.set({ truckertools_logged_sample: true });
  }

  const loads = mapTruckerToolsResponseToLoads(json);
  let vpsStatus = null;
  if (loads.length > 0) {
    vpsStatus = await pushTruckerToolsLoadsToVps(loads);
  }
  return { vpsStatus, loadsCount: loads.length };
}

function buildTruckerToolsNearbyPayload() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    type: 'GET_NEARBY_LOADS',
    advantageId: TRUCKERTOOLS_ADVANTAGE_ID,
    authenticated: true,
    brokerIds: [],
    destinations: [],
    origins: [{ type: 'address', country: 'United States', latitude: 37.09024 }],
    perPage: 750,
    pickupDateFrom: today,
    showLTL: false,
    truckTypes: [],
    username: TRUCKERTOOLS_USERNAME,
  };
}

function normalizeAuthHeader(token) {
  const t = String(token || '').trim();
  if (!t) return null;
  if (/^bearer\s+/i.test(t)) return t;
  return `Bearer ${t}`;
}

async function pollTruckerToolsNearby() {
  const { truckertools_token, truckertools_nearby_url } = await chrome.storage.local.get([
    'truckertools_token',
    'truckertools_nearby_url',
  ]);
  if (!truckertools_token || !truckertools_nearby_url) {
    return;
  }

  const auth = normalizeAuthHeader(truckertools_token);
  if (!auth) return;

  try {
    const res = await fetch(truckertools_nearby_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: auth,
      },
      body: JSON.stringify(buildTruckerToolsNearbyPayload()),
    });

    if (res.status === 401 || res.status === 403) {
      return;
    }
    if (!res.ok) {
      return;
    }

    let json;
    try {
      json = await res.json();
    } catch {
      return;
    }

    const loads = mapTruckerToolsResponseToLoads(json);
    if (loads.length > 0) {
      await pushTruckerToolsLoadsToVps(loads);
    }
  } catch {
    /* skip silently until next visit or alarm */
  }
}
