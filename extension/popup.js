function updateUI(data) {
  const aljexEl = document.getElementById('aljex-status');
  const datEl = document.getElementById('dat-status');
  const lastSyncEl = document.getElementById('last-sync');
  const loadsEl = document.getElementById('loads-count');
  const noteEl = document.getElementById('tab-note');

  aljexEl.textContent = data.aljexOk === true ? 'Connected' : data.aljexOk === false ? 'Log into Aljex' : 'Not synced';
  aljexEl.style.color = data.aljexOk === true ? '#4ade80' : data.aljexOk === false ? '#f87171' : '#fbbf24';

  datEl.textContent = data.datOk === true ? 'Connected' : data.datOk === false ? 'Open DAT tab' : 'Not synced';
  datEl.style.color = data.datOk === true ? '#4ade80' : data.datOk === false ? '#f87171' : '#fbbf24';

  loadsEl.textContent = data.loadsScraped != null ? `${data.loadsScraped} loads` : '-';

  if (data.lastSync) {
    lastSyncEl.textContent = 'Last sync: ' + new Date(data.lastSync).toLocaleTimeString();
  } else {
    lastSyncEl.textContent = 'Not synced yet';
  }

  // Check if Aljex tab is open
  chrome.tabs.query({ url: 'https://dandl.aljex.com/*' }, (tabs) => {
    if (tabs.length === 0) {
      noteEl.textContent = 'Open Aljex tab to enable load scraping';
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
    }, 3000);
  });
});
