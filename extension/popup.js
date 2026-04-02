function fmtTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return '—';
  }
}

function connLabel(ok) {
  if (ok === true) return 'Connected';
  if (ok === false) return 'Disconnected';
  return 'Not synced';
}

function connColor(ok) {
  if (ok === true) return '#4ade80';
  if (ok === false) return '#f87171';
  return '#fbbf24';
}

function updateUI(data) {
  const aljexEl = document.getElementById('aljex-status');
  const datEl = document.getElementById('dat-status');
  const noteEl = document.getElementById('tab-note');

  aljexEl.textContent = data.aljexOk === true ? 'Connected' : data.aljexOk === false ? 'Log into Aljex' : 'Not synced';
  aljexEl.style.color = data.aljexOk === true ? '#4ade80' : data.aljexOk === false ? '#f87171' : '#fbbf24';

  datEl.textContent = data.datOk === true ? 'Connected' : data.datOk === false ? 'Open DAT tab' : 'Not synced';
  datEl.style.color = data.datOk === true ? '#4ade80' : data.datOk === false ? '#f87171' : '#fbbf24';

  const big500Conn = document.getElementById('big500-conn');
  const big500Detail = document.getElementById('big500-detail');
  const b500Ok = data.lastBig500Ok === true;
  big500Conn.textContent = connLabel(data.lastBig500Sync ? b500Ok : null);
  big500Conn.style.color = connColor(data.lastBig500Sync ? b500Ok : null);
  const nB5 = data.lastBig500LoadsCount;
  const b5Parts = [`Last download: ${fmtTime(data.lastBig500Sync)}`];
  if (nB5 != null && nB5 !== '') b5Parts.push(`${nB5} loads`);
  big500Detail.textContent = b5Parts.join(' · ');

  const spotConn = document.getElementById('spot-conn');
  const spotDetail = document.getElementById('spot-detail');
  const spotOk = data.spotScrapeOk === true;
  spotConn.textContent = connLabel(data.lastSpotScrapeAt != null ? spotOk : null);
  spotConn.style.color = connColor(data.lastSpotScrapeAt != null ? spotOk : null);
  const nSpot = data.spotLoadsCount;
  const spotParts = [`Last sync: ${fmtTime(data.lastSpotScrapeAt)}`];
  if (nSpot != null && nSpot !== '') spotParts.push(`${nSpot} spot loads`);
  spotDetail.textContent = spotParts.join(' · ');

  const ttConn = document.getElementById('tt-conn');
  const ttDetail = document.getElementById('tt-detail');
  // TT: Connected if a token was captured (refreshes when the site loads); avoid "Disconnected" for expired tokens.
  if (data.truckerToolsHasToken === true) {
    ttConn.textContent = 'Connected';
    ttConn.style.color = '#4ade80';
  } else {
    ttConn.textContent = 'Not synced';
    ttConn.style.color = '#fbbf24';
  }
  const nTt = data.truckerToolsLoadsCount;
  const ttParts = [`Last sync: ${fmtTime(data.lastTruckerToolsSync)}`];
  if (nTt != null && nTt !== '') ttParts.push(`${nTt} loads`);
  ttDetail.textContent = ttParts.join(' · ');

  chrome.tabs.query({ url: 'https://dandl.aljex.com/*' }, (tabs) => {
    if (tabs.length === 0) {
      noteEl.textContent = 'Open Aljex tab to enable load scraping';
      noteEl.style.color = '#fbbf24';
    } else {
      noteEl.textContent = 'Aljex tab open - loads will auto-scrape';
      noteEl.style.color = '#4ade80';
    }
  });
}

chrome.runtime.sendMessage({ action: 'get-status' }, updateUI);

document.getElementById('sync-btn').addEventListener('click', () => {
  const btn = document.getElementById('sync-btn');
  btn.disabled = true;
  btn.textContent = 'Syncing...';
  chrome.runtime.sendMessage({ action: 'sync-now' }, () => {
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: 'get-status' }, (data) => {
        updateUI(data);
        btn.disabled = false;
        btn.textContent = 'Sync Now';
      });
    }, 5500);
  });
});
