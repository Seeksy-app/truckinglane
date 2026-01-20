// Trucking Lane - AI Lead Notifications Background Service Worker

const SUPABASE_URL = 'https://vjgakkomhphvdbwjjwiv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ2Fra29taHBodmRid2pqd2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTIzNjMsImV4cCI6MjA4MjA2ODM2M30.mQRJK5Bj04P-hxwIWkVxG7lXiXI4daMs59UuxU2w1Ow';

// Check for new leads every 30 seconds
const CHECK_INTERVAL_SECONDS = 30;

// Initialize alarm for periodic checks
chrome.alarms.create('checkNewLeads', {
  periodInMinutes: CHECK_INTERVAL_SECONDS / 60
});

// Listen for alarm
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkNewLeads') {
    await checkForNewLeads();
  }
});

// Check for new leads
async function checkForNewLeads() {
  try {
    const { accessToken, lastCheckTime } = await chrome.storage.local.get(['accessToken', 'lastCheckTime']);
    
    if (!accessToken) {
      console.log('[TruckingLane] No access token, skipping check');
      return;
    }

    const checkTime = lastCheckTime || new Date(Date.now() - 60000).toISOString();
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/leads?status=eq.pending&created_at=gt.${checkTime}&select=id,caller_phone,caller_name,caller_company,created_at,is_high_intent`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      if (response.status === 401) {
        console.log('[TruckingLane] Token expired, clearing...');
        await chrome.storage.local.remove(['accessToken']);
      }
      return;
    }

    const leads = await response.json();
    
    // Update last check time
    await chrome.storage.local.set({ lastCheckTime: new Date().toISOString() });
    
    // Show notification for each new lead
    for (const lead of leads) {
      await showLeadNotification(lead);
    }

    // Update badge with pending lead count
    await updateBadge();
    
  } catch (error) {
    console.error('[TruckingLane] Error checking leads:', error);
  }
}

// Show notification for a new lead
async function showLeadNotification(lead) {
  const title = lead.is_high_intent ? '🔥 High Intent AI Lead!' : '📞 New AI Lead';
  const callerInfo = lead.caller_name || lead.caller_company || 'Unknown Caller';
  
  chrome.notifications.create(`lead-${lead.id}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: `${callerInfo}\n${formatPhoneNumber(lead.caller_phone)}`,
    priority: lead.is_high_intent ? 2 : 1,
    requireInteraction: lead.is_high_intent
  });
}

// Format phone number for display
function formatPhoneNumber(phone) {
  if (!phone) return 'No phone';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  } else if (cleaned.length === 11 && cleaned[0] === '1') {
    return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

// Get today's date at midnight UTC for filtering
function getTodayMidnightUTC() {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return midnight.toISOString();
}

// Update extension badge with pending lead count (today only)
async function updateBadge() {
  try {
    const { accessToken } = await chrome.storage.local.get(['accessToken']);
    
    if (!accessToken) {
      chrome.action.setBadgeText({ text: '' });
      return;
    }

    const todayStart = getTodayMidnightUTC();
    
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/leads?status=eq.pending&created_at=gte.${todayStart}&select=id`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'Prefer': 'count=exact'
        }
      }
    );

    if (response.ok) {
      const count = response.headers.get('content-range')?.split('/')[1] || '0';
      const countNum = parseInt(count, 10);
      
      chrome.action.setBadgeText({ text: countNum > 0 ? countNum.toString() : '' });
      chrome.action.setBadgeBackgroundColor({ color: '#f97316' });
    }
  } catch (error) {
    console.error('[TruckingLane] Error updating badge:', error);
  }
}

// Handle notification click - open the dashboard
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId.startsWith('lead-')) {
    const leadId = notificationId.replace('lead-', '');
    chrome.tabs.create({ url: `https://truckinglane.com/leads/${leadId}` });
  }
  chrome.notifications.clear(notificationId);
});

// Initial check on install/update
chrome.runtime.onInstalled.addListener(() => {
  console.log('[TruckingLane] Extension installed/updated');
  updateBadge();
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'LOGIN') {
    chrome.storage.local.set({ 
      accessToken: message.accessToken,
      lastCheckTime: new Date().toISOString()
    }).then(() => {
      checkForNewLeads();
      updateBadge();
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === 'LOGOUT') {
    chrome.storage.local.remove(['accessToken', 'lastCheckTime']).then(() => {
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (message.type === 'CHECK_NOW') {
    checkForNewLeads().then(() => sendResponse({ success: true }));
    return true;
  }
});
