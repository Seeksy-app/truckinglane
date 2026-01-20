// Trucking Lane - Popup Script

const SUPABASE_URL = 'https://vjgakkomhphvdbwjjwiv.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqZ2Fra29taHBodmRid2pqd2l2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0OTIzNjMsImV4cCI6MjA4MjA2ODM2M30.mQRJK5Bj04P-hxwIWkVxG7lXiXI4daMs59UuxU2w1Ow';

document.addEventListener('DOMContentLoaded', async () => {
  const loggedOutEl = document.getElementById('loggedOut');
  const loggedInEl = document.getElementById('loggedIn');
  const loginForm = document.getElementById('loginForm');
  const errorEl = document.getElementById('error');
  const pendingCountEl = document.getElementById('pendingCount');
  
  // Check if already logged in
  const { accessToken } = await chrome.storage.local.get(['accessToken']);
  
  if (accessToken) {
    showLoggedInState();
    await fetchPendingCount();
  }
  
  function showLoggedInState() {
    loggedOutEl.classList.add('hidden');
    loggedInEl.classList.remove('hidden');
  }
  
  function showLoggedOutState() {
    loggedInEl.classList.add('hidden');
    loggedOutEl.classList.remove('hidden');
  }
  
  function showError(message) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
  
  function hideError() {
    errorEl.classList.add('hidden');
  }
  
  // Get today's date at midnight UTC for filtering
  function getTodayMidnightUTC() {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return midnight.toISOString();
  }
  
  async function fetchPendingCount() {
    try {
      const { accessToken } = await chrome.storage.local.get(['accessToken']);
      
      if (!accessToken) return;
      
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
        pendingCountEl.textContent = count;
      }
    } catch (error) {
      console.error('Error fetching count:', error);
    }
  }
  
  // Login form submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();
    
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error_description || data.msg || 'Login failed');
      }
      
      // Save token and notify background
      await chrome.runtime.sendMessage({
        type: 'LOGIN',
        accessToken: data.access_token
      });
      
      showLoggedInState();
      await fetchPendingCount();
      
    } catch (error) {
      showError(error.message);
    }
  });
  
  // Logout button
  document.getElementById('logout').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'LOGOUT' });
    showLoggedOutState();
  });
  
  // Check now button
  document.getElementById('checkNow').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'CHECK_NOW' });
    await fetchPendingCount();
  });
  
  // Open dashboard button
  document.getElementById('openDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://truckinglane.com/dashboard' });
  });
});
