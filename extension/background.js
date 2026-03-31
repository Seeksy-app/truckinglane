const VPS_URL = 'http://187.77.217.123:3098';
const TRIGGER_KEY = 'tl-trigger-7b747d391801b8e5f55b4542';
const SUPABASE_URL = 'https://vjgakkomhphvdbwjjwiv.supabase.co';
const SYNC_INTERVAL_MINUTES = 30;

// Supabase anon key for TruckingLanes
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ2Fra29taHBodmRid2pqd2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTIzNjMsImV4cCI6MjA4MjA2ODM2M30.mQRJK5Bj04P-hxwIWkVxG7lXiXI4daMs59UuxU2w1Ow';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('auto-sync', { periodInMinutes: SYNC_INTERVAL_MINUTES });
  chrome.alarms.create('cookie-sync', { periodInMinutes: 25 });
  runFullSync();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'auto-sync') runFullSync();
  if (alarm.name === 'cookie-sync') syncCookiesOnly();
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
        'x-trigger-key': TRIGGER_KEY,
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
  if (msg.action === 'sync-now') {
    runFullSync().then(() => sendResponse({ success: true }));
    return true;
  }
  if (msg.action === 'get-status') {
    chrome.storage.local.get(['lastSync', 'lastStatus', 'aljexOk', 'datOk', 'loadsScraped'], sendResponse);
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
  triggerBig500Export().catch(e => console.log('Big 500 trigger error:', e.message));

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

// ── SYNC COOKIES ONLY (every 25 min) ──────────────────────────
async function syncCookiesOnly() {
  await syncAljexCookie();
  await syncDatToken();
}

// ── ALJEX: SYNC COOKIE + SCRAPE LOADS ─────────────────────────
async function syncAljexWithScrape() {
  // First sync the cookie to VPS
  await syncAljexCookie();

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
        dispatch_status: status.toLowerCase() === 'open' ? 'available' : status.toLowerCase(),
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
        dispatch_status: 'available',
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
        headers: { 'x-trigger-key': TRIGGER_KEY, 'Content-Type': 'text/plain' },
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
        'x-trigger-key': TRIGGER_KEY,
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
      headers: { 'x-trigger-key': TRIGGER_KEY, 'Content-Type': 'application/json' },
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
            headers: { 'x-trigger-key': TRIGGER_KEY, 'Content-Type': 'application/json' },
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
        headers: { 'x-trigger-key': TRIGGER_KEY, 'Content-Type': 'application/json' },
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
