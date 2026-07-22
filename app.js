/* ============================================================
   PumpPro - app.js
   Complete Petrol Pump Management Logic
   Data saves to: f:\PUMP\data.json  via local server
   ============================================================ */

// =====================
// STATE / DATA
// =====================
let state = {
  pumpInfo: { name: 'My Petrol Pump', owner: '', address: '', gst: '', contact: '' },
  rates: { Petrol: 96.72, Diesel: 89.62 },
  tanks: [],      // [{id, name, fuel, capacity, stock}]
  nozzles: [],    // [{id, name, fuel, tankId}]
  shifts: [],     // [{id, date, shift, nozzles:[...], tanks:[...], cash:{...}, remarks, savedAt}]
  supplies: [],   // [{id, date, tankId, qty, bill, supplier, remark}]
  githubSettings: { enabled: false, owner: '', repo: '', token: '' }
};

let currentShift = 'day';
let isShiftUnlocked = false;
const SERVER_URL = 'http://localhost:3131'; // Local Node.js server
let serverOnline = false;

// =====================
// INIT
// =====================
document.addEventListener('DOMContentLoaded', async () => {
  showServerStatus('checking');
  await loadFromServer();
  initClock();
  initDates();
  renderSettingsForms();
  loadShiftIfExists();
  updateDashboard();
  loadTankStock();
  showPage('dashboard', document.querySelector('.nav-item'));

  // ── AUTO-SAVE every 1 second ──────────────────────────
  setInterval(async () => {
    await saveToStorage();
    updateLastSaved();
  }, 1000);
});

let lastSavedAt = null;

function updateLastSaved() {
  lastSavedAt = new Date();
  let el = document.getElementById('lastSavedBadge');
  if (!el) {
    el = document.createElement('div');
    el.id = 'lastSavedBadge';
    el.style.cssText = 'font-size:10px;color:var(--text3);white-space:nowrap';
    const topRight = document.querySelector('.topbar-right');
    if (topRight) topRight.appendChild(el);
  }
  const h = String(lastSavedAt.getHours()).padStart(2,'0');
  const m = String(lastSavedAt.getMinutes()).padStart(2,'0');
  const s = String(lastSavedAt.getSeconds()).padStart(2,'0');
  el.textContent = `💾 Saved ${h}:${m}:${s}`;
}

// =====================
// SERVER SAVE / LOAD
// Data file: f:\PUMP\data.json
// =====================

function showServerStatus(status) {
  // Inject status badge into topbar if not exists
  let badge = document.getElementById('serverStatusBadge');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'serverStatusBadge';
    badge.style.cssText = 'padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:0.5px;white-space:nowrap';
    const topRight = document.querySelector('.topbar-right');
    if (topRight) topRight.prepend(badge);
  }
  if (status === 'online') {
    badge.textContent = '🟢 PC Save';
    badge.style.background = 'rgba(45,212,164,0.15)';
    badge.style.border = '1px solid rgba(45,212,164,0.4)';
    badge.style.color = '#2dd4a4';
  } else if (status === 'offline') {
    badge.textContent = '🔴 Server Offline';
    badge.style.background = 'rgba(255,77,77,0.15)';
    badge.style.border = '1px solid rgba(255,77,77,0.4)';
    badge.style.color = '#ff4d4d';
  } else {
    badge.textContent = '🟡 Connecting...';
    badge.style.background = 'rgba(245,166,35,0.15)';
    badge.style.border = '1px solid rgba(245,166,35,0.4)';
    badge.style.color = '#f5a623';
  }
}

async function saveToStorage(isSyncImmediate = false) {
  // Always save to localStorage as instant fallback
  localStorage.setItem('pumppro_data', JSON.stringify(state));
  updateLastSaved(); // show timestamp immediately

  // Save to PC file via server
  try {
    const res = await fetch(`${SERVER_URL}/api/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    if (res.ok) {
      serverOnline = true;
      showServerStatus('online');
      updateLastSaved();
      
      // If immediate sync requested and enabled, trigger GitHub auto-upload
      if (isSyncImmediate && state.githubSettings && state.githubSettings.enabled) {
        triggerManualGHSync();
      }
    } else {
      throw new Error('Save failed');
    }
  } catch (e) {
    serverOnline = false;
    showServerStatus('offline');
    // Data is still in localStorage — not lost
    console.warn('Server offline, data in localStorage only.');
  }
}

async function loadFromServer() {
  // 1. Try loading from PC local server
  try {
    const res = await fetch(`${SERVER_URL}/api/load`);
    if (res.ok) {
      const raw = await res.text();
      const loaded = JSON.parse(raw);
      if (loaded && Object.keys(loaded).length > 0) {
        state = { ...state, ...loaded };
        localStorage.setItem('pumppro_data', JSON.stringify(state)); // sync to localStorage too
        serverOnline = true;
        showServerStatus('online');
        console.log('✅ Data loaded from PC file (data.json)');
        return;
      }
    }
  } catch (e) {
    console.warn('Local server not reachable, trying hosted file...');
  }

  // 2. Fallback: try loading from the hosted path (e.g. GitHub Pages './data.json')
  try {
    const res = await fetch('./data.json?t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const raw = await res.text();
      const loaded = JSON.parse(raw);
      if (loaded && Object.keys(loaded).length > 0) {
        state = { ...state, ...loaded };
        localStorage.setItem('pumppro_data', JSON.stringify(state)); // sync to localStorage too
        serverOnline = false;
        showServerStatus('offline');
        console.log('📦 Data loaded from hosted GitHub Pages (data.json)');
        return;
      }
    }
  } catch (e) {
    console.warn('Hosted data.json not reachable, trying localStorage...');
  }

  // 3. Fallback: load from localStorage
  const raw = localStorage.getItem('pumppro_data');
  if (raw) {
    try {
      const loaded = JSON.parse(raw);
      state = { ...state, ...loaded };
      console.log('📦 Data loaded from browser localStorage (fallback)');
    } catch(e) {}
  }

  // Ensure GitHub settings are initialized
  if (!state.githubSettings) {
    state.githubSettings = { enabled: false, owner: '', repo: '', token: '' };
  }

  serverOnline = false;
  showServerStatus('offline');
}

// Keep old name as alias for compatibility
function loadFromStorage() { /* replaced by loadFromServer */ }

// =====================
// CLOCK & DATE
// =====================
function initClock() {
  function tick() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2,'0');
    const m = String(now.getMinutes()).padStart(2,'0');
    const s = String(now.getSeconds()).padStart(2,'0');
    document.getElementById('liveClock').textContent = `${h}:${m}:${s}`;

    const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const dateStr = `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
    document.getElementById('liveDate').textContent = dateStr;
    document.getElementById('topDate').textContent = dateStr;

    // Auto shift detection
    const hr = now.getHours();
    if (hr >= 6 && hr < 18) {
      document.getElementById('shiftTag').textContent = '🌞 Day Shift';
    } else {
      document.getElementById('shiftTag').textContent = '🌙 Night Shift';
    }
  }
  tick();
  setInterval(tick, 1000);
}

function initDates() {
  const today = todayStr();
  const expected = getExpectedNextShift();
  const defaultDate = expected ? expected.date : today;
  const defaultShift = expected ? expected.shift : 'day';

  setVal('entryDate', defaultDate);
  selectShift(defaultShift);

  setVal('tankFrom', monthStart());
  setVal('tankTo', today);
  setVal('nozFrom', monthStart());
  setVal('nozTo', today);
  setVal('dailyDate', today);
  setVal('dailyFrom', monthStart());
  setVal('dailyTo', today);
  setVal('supDate', today);
  setVal('dsrMonth', today.slice(0, 7)); // e.g. "2026-07"
}

function todayStr() {
  return new Date().toISOString().slice(0,10);
}
function getNextDayStr(dateStr) {
  if (!dateStr) return todayStr();
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + 1);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getExpectedNextShift() {
  if (!state.shifts || state.shifts.length === 0) return null;

  const sorted = [...state.shifts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.shift === b.shift) return 0;
    return a.shift === 'day' ? -1 : 1;
  });

  const latest = sorted[sorted.length - 1];
  if (!latest) return null;

  if (latest.shift === 'day') {
    return { date: latest.date, shift: 'night' };
  } else {
    return { date: getNextDayStr(latest.date), shift: 'day' };
  }
}

function monthStart() {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().slice(0,10);
}
function fmtDate(str) {
  if (!str) return '';
  const [y,m,d] = str.split('-');
  return `${d}/${m}/${y}`;
}
function fmtNum(n, dec=2) {
  return Number(n || 0).toFixed(dec);
}
function fmtRs(n) { return '₹ ' + fmtNum(n); }
function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// =====================
// PAGE NAVIGATION
// =====================
function showPage(pageId, el) {
  if (pageId === 'settings') {
    const password = prompt("Enter Password to access Settings:");
    if (password !== 'PRANAV@6442') {
      if (password !== null) {
        showToast('❌ Incorrect Password! Access Denied.', 'error');
      }
      return;
    }
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + pageId);
  if (page) page.classList.add('active');
  if (el) el.classList.add('active');

  const titles = {
    'dashboard':    'Dashboard',
    'shift-entry':  'Shift Entry',
    'tank-stock':   'Tank Stock',
    'nozzle-report':'Nozzle Report',
    'daily-report': 'Daily Report',
    'dsr-report':   'DSR Report',
    'settings':     'Settings',
  };
  document.getElementById('pageHeading').textContent = titles[pageId] || pageId;

  if (pageId === 'dashboard')    updateDashboard();
  if (pageId === 'tank-stock')   loadTankStock();
  if (pageId === 'shift-entry')  { renderNozzleEntryTable(); renderTankDipArea(); }
  if (pageId === 'dsr-report')   loadDSRReport();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

// =====================
// SHIFT SELECTION
// =====================
function selectShift(sh) {
  currentShift = sh;
  document.getElementById('btnDay').classList.toggle('active', sh === 'day');
  document.getElementById('btnNight').classList.toggle('active', sh === 'night');
  loadShiftIfExists();
}

function loadShiftIfExists() {
  const date = document.getElementById('entryDate').value;
  if (!date) return;

  const existing = state.shifts.find(s => s.date === date && s.shift === currentShift);
  isShiftUnlocked = false; 

  if (existing) {
    state.nozzles.forEach((nz, i) => {
      const nzData = existing.nozzles.find(n => n.nozzleId === nz.id);
      if (nzData) {
        setVal(`nz_open_${i}`, nzData.opening);
        setVal(`nz_close_${i}`, nzData.closing);
        setVal(`nz_testing_${i}`, nzData.testing);
      } else {
        setVal(`nz_open_${i}`, '');
        setVal(`nz_close_${i}`, '');
        setVal(`nz_testing_${i}`, '');
      }
      calcNozzleRow(i);
    });

    state.tanks.forEach((tank, i) => {
      const tData = existing.tanks.find(t => t.tankId === tank.id);
      if (tData) {
        setVal(`dip_${i}`, (tData.closingStock !== null && tData.closingStock !== undefined) ? tData.closingStock : '');
        setVal(`purch_${i}`, tData.purchaseQty || '');
      } else {
        setVal(`dip_${i}`, '');
        setVal(`purch_${i}`, '');
      }
    });

    setVal('inCash', existing.cash.cash || '');
    setVal('inCard', existing.cash.card || '');
    setVal('inUPI', existing.cash.upi || '');
    setVal('inExtraPower', existing.cash.extraPower || '');
    setVal('inCredit', existing.cash.credit || '');

    for (let i = 1; i <= 7; i++) {
      const item = existing.cash.otherItems && existing.cash.otherItems[i - 1];
      if (item) {
        setVal(`otherName${i}`, item.name);
        setVal(`otherAmt${i}`, item.amount);
      } else {
        setVal(`otherName${i}`, '');
        setVal(`otherAmt${i}`, '');
      }
    }

    setVal('shiftRemarks', existing.remarks || '');
    
    updateNozzleTotals();
    recalcCash();
    lockShiftForm(true);
  } else {
    renderNozzleEntryTable();
    renderTankDipArea();
    clearFormInputsOnly();
    lockShiftForm(false);
  }
}

function lockShiftForm(locked) {
  const badge = document.getElementById('shiftLockStatus');
  if (badge) badge.style.display = (locked && !isShiftUnlocked) ? 'flex' : 'none';

  const inputs = document.querySelectorAll('#page-shift-entry input, #page-shift-entry textarea');
  inputs.forEach(inp => {
    if (inp.id === 'entryRatePetrol' || inp.id === 'entryRateDiesel' || inp.id === 'entryDate') return;
    if (inp.type === 'button' || inp.tagName === 'BUTTON') return;

    if (locked && !isShiftUnlocked) {
      inp.setAttribute('disabled', 'true');
      inp.style.opacity = '0.6';
    } else {
      inp.removeAttribute('disabled');
      inp.style.opacity = '';
    }
  });

  const saveBtn = document.querySelector('#page-shift-entry .btn-save');
  if (saveBtn) {
    if (locked && !isShiftUnlocked) {
      saveBtn.setAttribute('disabled', 'true');
      saveBtn.style.opacity = '0.5';
      saveBtn.style.cursor = 'not-allowed';
      saveBtn.textContent = '🔒 Shift Locked';
    } else {
      saveBtn.removeAttribute('disabled');
      saveBtn.style.opacity = '';
      saveBtn.style.cursor = '';
      saveBtn.textContent = '💾 Save Shift Entry';
    }
  }
}

function promptUnlockShift() {
  const password = prompt("Enter Password to edit this shift:");
  if (password === 'PRANAV@6442') {
    isShiftUnlocked = true;
    lockShiftForm(false);
    showToast('🔓 Shift unlocked! You can now make changes and save.', 'success');
  } else if (password !== null) {
    showToast('❌ Incorrect Password! Lock remains.', 'error');
  }
}

function clearFormInputsOnly() {
  setVal('inCash', '');
  setVal('inCard', '');
  setVal('inUPI', '');
  setVal('inExtraPower', '');
  setVal('inCredit', '');
  for (let i = 1; i <= 7; i++) {
    setVal(`otherName${i}`, '');
    setVal(`otherAmt${i}`, '');
  }
  const subEl = document.getElementById('otherSubtotal');
  if (subEl) subEl.textContent = '₹ 0';
  setVal('shiftRemarks', '');
  document.getElementById('cashTotalDisplay').textContent = fmtRs(0);
  document.getElementById('cashSalesDisplay').textContent = fmtRs(0);
  document.getElementById('cashDiffDisplay').textContent  = fmtRs(0);
}

// =====================
// NOZZLE ENTRY TABLE
// =====================
function renderNozzleEntryTable() {
  const tbody = document.getElementById('nozzleEntryBody');
  if (!state.nozzles.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-msg">⚙️ Configure Nozzles in Settings first.</td></tr>`;
    return;
  }

  // Pre-fill rates from global rates
  setVal('entryRatePetrol', state.rates.Petrol || 0);
  setVal('entryRateDiesel', state.rates.Diesel || 0);

  // Pre-fill from last saved shift for same nozzle
  const prevShift = getLastShiftEntry();

  tbody.innerHTML = state.nozzles.map((nz, i) => {
    const prevClose = prevShift ? getLastClose(prevShift, nz.id) : 0;
    const isLocked = prevClose > 0;
    const rate = state.rates[nz.fuel] || 0;
    return `
    <tr id="nzRow${i}">
      <td><strong>${nz.name}</strong></td>
      <td><span class="fuel-${nz.fuel.toLowerCase()}-tag">${nz.fuel}</span></td>
      <td>
        <div style="display:flex; align-items:center; position:relative; width:100%;">
          <input type="number" class="inp-reading" id="nz_open_${i}"
            value="${prevClose || ''}" placeholder="0"
            oninput="calcNozzleRow(${i})" step="1"
            style="width:100%; ${isLocked ? 'background:rgba(255,255,255,0.03); color:var(--text3); border-color:transparent; padding-right:28px;' : ''}"
            ${isLocked ? 'readonly' : ''} />
          ${isLocked ? `<button type="button" id="nz_unlock_btn_${i}" onclick="unlockOpeningField(${i})" style="position:absolute; right:8px; background:none; border:none; cursor:pointer; font-size:12px; opacity:0.6; padding:4px;" title="Unlock to edit opening reading">🔒</button>` : ''}
        </div>
      </td>
      <td>
        <input type="number" class="inp-reading" id="nz_close_${i}"
          placeholder="0"
          oninput="calcNozzleRow(${i})" step="1" />
      </td>
      <td>
        <input type="number" class="inp-reading" id="nz_testing_${i}"
          placeholder="0" style="width:70px"
          oninput="calcNozzleRow(${i})" step="1" />
      </td>
      <td><span class="sale-val" id="nz_sale_${i}">0 L</span></td>
      <td><span id="nz_rate_${i}">${fmtNum(rate)}</span></td>
      <td><span class="sale-amt" id="nz_amt_${i}">₹ 0.00</span></td>
    </tr>`;
  }).join('');

  updateNozzleTotals();
}

function unlockOpeningField(i) {
  const password = prompt("Enter Password to edit opening reading:");
  if (password === 'PRANAV@6442') {
    const el = document.getElementById(`nz_open_${i}`);
    const btn = document.getElementById(`nz_unlock_btn_${i}`);
    if (el) {
      el.removeAttribute('readonly');
      el.style.background = '';
      el.style.color = '';
      el.style.borderColor = '';
      el.style.paddingRight = '';
      el.focus();
    }
    if (btn) {
      btn.remove(); // Remove the lock button once unlocked
    }
    showToast('🔓 Opening reading unlocked for editing.', 'success');
  } else if (password !== null) {
    showToast('❌ Incorrect Password! Lock remains.', 'error');
  }
}

function getLastShiftEntry() {
  const dateVal = document.getElementById('entryDate')?.value;
  if (!dateVal) return null;

  // Sort shifts chronologically: date first, then shift ('day' comes before 'night')
  const sorted = [...state.shifts].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.shift.localeCompare(b.shift);
  });

  let prev = null;
  for (const s of sorted) {
    if (s.date > dateVal) break;
    if (s.date === dateVal) {
      if (currentShift === 'day') {
        // Day shift can only read from previous night shift
        break;
      }
      if (currentShift === 'night' && s.shift === 'night') {
        // Night shift can read from same day's Day shift, but not Night shift
        break;
      }
    }
    prev = s;
  }
  return prev;
}

function getLastClose(shift, nozzleId) {
  const nz = shift.nozzles.find(n => n.nozzleId === nozzleId);
  return nz ? nz.closing : 0;
}

function calcNozzleRow(i) {
  const open    = parseFloat(document.getElementById(`nz_open_${i}`)?.value) || 0;
  const close   = parseFloat(document.getElementById(`nz_close_${i}`)?.value) || 0;
  const testing = parseFloat(document.getElementById(`nz_testing_${i}`)?.value) || 0;
  const sale    = Math.max(0, close - open - testing);  // exact decimal
  const nz      = state.nozzles[i];
  const rate    = state.rates[nz.fuel] || 0;
  const amt     = sale * rate;

  document.getElementById(`nz_sale_${i}`).textContent = fmtNum(sale, 2) + ' L';  // decimal display
  document.getElementById(`nz_amt_${i}`).textContent  = fmtRs(amt);
  document.getElementById(`nz_rate_${i}`).textContent = fmtNum(rate);

  updateNozzleTotals();
  recalcCash();
}

function updateNozzleTotals() {
  let totalL = 0, totalRs = 0;
  state.nozzles.forEach((nz, i) => {
    const open    = parseFloat(document.getElementById(`nz_open_${i}`)?.value) || 0;
    const close   = parseFloat(document.getElementById(`nz_close_${i}`)?.value) || 0;
    const testing = parseFloat(document.getElementById(`nz_testing_${i}`)?.value) || 0;
    const sale    = Math.max(0, close - open - testing);
    const rate    = state.rates[nz.fuel] || 0;
    totalL  += sale;
    totalRs += sale * rate;
  });
  document.getElementById('entryTotalL').textContent  = fmtNum(totalL, 2) + ' L';  // decimal total
  document.getElementById('entryTotalRs').textContent = fmtRs(totalRs);
}

function getNozzleTotalAmt() {
  let total = 0;
  state.nozzles.forEach((nz, i) => {
    const open    = parseFloat(document.getElementById(`nz_open_${i}`)?.value) || 0;
    const close   = parseFloat(document.getElementById(`nz_close_${i}`)?.value) || 0;
    const testing = parseFloat(document.getElementById(`nz_testing_${i}`)?.value) || 0;
    const sale    = Math.max(0, close - open - testing);
    const rate    = state.rates[nz.fuel] || 0;
    total += sale * rate;
  });
  return total;
}

function updateRatesFromEntry() {
  state.rates.Petrol = parseFloat(document.getElementById('entryRatePetrol').value) || 0;
  state.rates.Diesel = parseFloat(document.getElementById('entryRateDiesel').value) || 0;
  
  // Recalculate all nozzle row displays
  state.nozzles.forEach((nz, i) => {
    const rate = state.rates[nz.fuel] || 0;
    const rateEl = document.getElementById(`nz_rate_${i}`);
    if (rateEl) rateEl.textContent = fmtNum(rate);
    
    // Trigger calcNozzleRow to update sale amount
    calcNozzleRow(i);
  });
  
  // Save updated rates to settings storage instantly
  saveToStorage();
}

// =====================
// TANK DIP AREA
// =====================
function renderTankDipArea() {
  const area = document.getElementById('tankDipArea');
  if (!state.tanks.length) {
    area.innerHTML = `<div class="empty-msg">No tanks configured. Go to Settings.</div>`;
    return;
  }
  area.innerHTML = state.tanks.map((tank, i) => `
    <div class="tank-dip-item" style="display:flex; flex-direction:column; gap:8px; border-bottom:1px solid rgba(255,255,255,0.04); padding:12px 0;">
      <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
        <div class="tank-dip-label">
          <strong>${tank.name}</strong>
          <span class="tank-dip-fuel fuel-${tank.fuel.toLowerCase()}-tag" style="margin-left:8px; font-size:10px;">${tank.fuel}</span>
        </div>
        <div style="font-size:11px; color:var(--text3);">Cap: ${fmtNum(tank.capacity || 0, 0)} L</div>
      </div>
      <div style="display:flex; gap:12px; width:100%;">
        <div style="flex:1; display:flex; flex-direction:column; gap:3px;">
          <label style="font-size:10px; color:var(--text3); font-weight:600;">🛢️ CLOSING DIP (L)</label>
          <input type="number" class="inp-reading" style="width:100%; text-align:center;" id="dip_${i}"
            placeholder="Closing Dip (L)" step="0.01" />
        </div>
        <div style="flex:1; display:flex; flex-direction:column; gap:3px;">
          <label style="font-size:10px; color:var(--success); font-weight:600;">➕ PURCHASE (L)</label>
          <input type="number" class="inp-reading" style="width:100%; text-align:center; border-color:rgba(45,212,164,0.25);" id="purch_${i}"
            placeholder="0" step="1" />
        </div>
      </div>
    </div>
  `).join('');
}

// =====================
// CASH RECALC
// =====================
function getOtherItemsTotal() {
  let total = 0;
  for (let i = 1; i <= 7; i++) {
    total += parseFloat(document.getElementById(`otherAmt${i}`)?.value) || 0;
  }
  return total;
}

function recalcCash() {
  const cash       = parseFloat(document.getElementById('inCash')?.value)       || 0;
  const card       = parseFloat(document.getElementById('inCard')?.value)       || 0;
  const upi        = parseFloat(document.getElementById('inUPI')?.value)        || 0;
  const extraPower = parseFloat(document.getElementById('inExtraPower')?.value) || 0;
  const credit     = parseFloat(document.getElementById('inCredit')?.value)     || 0;
  const other      = getOtherItemsTotal();
  const total      = cash + card + upi + extraPower + credit + other;
  const sales      = getNozzleTotalAmt();
  const diff       = total - sales;

  // Update other subtotal badge
  const subEl = document.getElementById('otherSubtotal');
  if (subEl) subEl.textContent = fmtRs(other);

  document.getElementById('cashTotalDisplay').textContent = fmtRs(total);
  document.getElementById('cashSalesDisplay').textContent = fmtRs(sales);
  const diffEl = document.getElementById('cashDiffDisplay');
  diffEl.textContent = (diff >= 0 ? '+' : '') + fmtRs(diff);
  diffEl.style.color = diff === 0 ? 'var(--text3)' : diff > 0 ? 'var(--success)' : 'var(--danger)';
}

// =====================
// SAVE SHIFT
// =====================
function saveShift() {
  const date = document.getElementById('entryDate').value;
  if (!date) { showToast('Please select a date.', 'error'); return; }
  if (!state.nozzles.length) { showToast('Configure nozzles first in Settings.', 'error'); return; }

  // Check closing > opening
  let hasReading = false;
  const nozzleData = state.nozzles.map((nz, i) => {
    const open    = parseFloat(document.getElementById(`nz_open_${i}`)?.value) || 0;
    const close   = parseFloat(document.getElementById(`nz_close_${i}`)?.value) || 0;
    const testing = parseFloat(document.getElementById(`nz_testing_${i}`)?.value) || 0;
    const sale    = Math.max(0, close - open - testing);
    const rate    = state.rates[nz.fuel] || 0;
    if (close > 0) hasReading = true;
    return {
      nozzleId: nz.id,
      nozzleName: nz.name,
      fuel: nz.fuel,
      tankId: nz.tankId,
      opening: open,
      closing: close,
      testing,
      sale,
      rate,
      amount: sale * rate,
    };
  });

  if (!hasReading) { showToast('Enter at least one nozzle closing reading.', 'error'); return; }

  // Tank dip readings and purchases
  const tankData = state.tanks.map((tank, i) => {
    const dipVal = parseFloat(document.getElementById(`dip_${i}`)?.value) || null;
    const purchVal = parseFloat(document.getElementById(`purch_${i}`)?.value) || 0;
    return { tankId: tank.id, tankName: tank.name, fuel: tank.fuel, closingStock: dipVal, purchaseQty: purchVal };
  });

  // Cash + Card + UPI + ExtraPower + Credit + 7 Other Items
  const cash       = parseFloat(document.getElementById('inCash')?.value)       || 0;
  const card       = parseFloat(document.getElementById('inCard')?.value)       || 0;
  const upi        = parseFloat(document.getElementById('inUPI')?.value)        || 0;
  const extraPower = parseFloat(document.getElementById('inExtraPower')?.value) || 0;
  const credit     = parseFloat(document.getElementById('inCredit')?.value)     || 0;

  // Collect all 7 other items
  const otherItems = [];
  for (let i = 1; i <= 7; i++) {
    const name = document.getElementById(`otherName${i}`)?.value.trim() || '';
    const amt  = parseFloat(document.getElementById(`otherAmt${i}`)?.value) || 0;
    if (name || amt) otherItems.push({ name: name || `Item ${i}`, amount: amt });
  }
  const otherTotal = otherItems.reduce((s, o) => s + o.amount, 0);

  const totalCollection = cash + card + upi + extraPower + credit + otherTotal;
  const totalSales = nozzleData.reduce((s,n) => s + n.amount, 0);
  const diff = totalCollection - totalSales;

  const shiftEntry = {
    id: Date.now(),
    date,
    shift: currentShift,
    nozzles: nozzleData,
    tanks: tankData,
    cash: { cash, card, upi, extraPower, credit, otherItems, otherTotal, totalCollection, totalSales, diff },
    remarks: document.getElementById('shiftRemarks').value,
    savedAt: Date.now(),
  };

  // 1. Record supply entries automatically if purchaseQty > 0
  tankData.forEach((td, i) => {
    const tank = state.tanks.find(t => t.id === td.tankId);
    if (tank && td.purchaseQty > 0) {
      // Push supply entry automatically to persist in supply history & DSR
      state.supplies.push({
        id: Date.now() + i,
        date,
        tankId: tank.id,
        qty: td.purchaseQty,
        bill: 'SHIFT_ENTRY',
        supplier: 'Self/Shift Entry',
        remark: `Received in ${currentShift === 'day' ? 'Day' : 'Night'} shift`
      });
    }
  });

  const existingIdx = state.shifts.findIndex(s => s.date === date && s.shift === currentShift);
  if (existingIdx !== -1) {
    if (!isShiftUnlocked) {
      showToast('🔒 This shift is locked. Unlock it first with password.', 'error');
      return;
    }
    // Overwrite existing shift
    state.shifts[existingIdx] = shiftEntry;
    showToast('✅ Shift entry updated successfully!', 'success');
  } else {
    // ── Shift Sequence Check for New Shift ──────────────────
    const expected = getExpectedNextShift();
    if (expected) {
      const isNext = (date === expected.date && currentShift === expected.shift);
      if (!isNext) {
        const expShiftLabel = expected.shift === 'day' ? 'DAY (🌞)' : 'NIGHT (🌙)';
        const reqShiftLabel = currentShift === 'day' ? 'DAY (🌞)' : 'NIGHT (🌙)';
        const pwd = prompt(`⚠️ SHIFT SEQUENCE MISMATCH!\n\nNext expected shift in sequence is:\n👉 ${fmtDate(expected.date)} - ${expShiftLabel}\n\nYou selected:\n👉 ${fmtDate(date)} - ${reqShiftLabel}\n\nTo skip ${fmtDate(expected.date)} (${expected.shift.toUpperCase()}) and save this shift anyway, enter Password (PRANAV@6442):`);
        
        if (pwd === 'PRANAV@6442') {
          showToast('🔓 Sequence override authorized with password.', 'info');
        } else {
          if (pwd !== null) {
            showToast('❌ Incorrect Password! Cannot skip expected shift sequence.', 'error');
          } else {
            showToast('ℹ️ Save cancelled to maintain shift sequence.', 'info');
          }
          return;
        }
      }
    }

    // Save new shift
    state.shifts.push(shiftEntry);
    showToast('✅ Shift saved successfully!', 'success');
  }

  saveToStorage(true);
  updateDashboard();
  clearEntry();
}

function clearEntry() {
  isShiftUnlocked = false;
  lockShiftForm(false);

  renderNozzleEntryTable();
  renderTankDipArea();
  setVal('inCash', ''); 
  setVal('inCard', ''); 
  setVal('inUPI', ''); 
  setVal('inExtraPower', ''); 
  setVal('inCredit', '');
  // Clear all 7 other items
  for (let i = 1; i <= 7; i++) {
    setVal(`otherName${i}`, '');
    setVal(`otherAmt${i}`, '');
  }
  const subEl = document.getElementById('otherSubtotal');
  if (subEl) subEl.textContent = '₹ 0';
  setVal('shiftRemarks', '');
  document.getElementById('cashTotalDisplay').textContent = fmtRs(0);
  document.getElementById('cashSalesDisplay').textContent = fmtRs(0);
  document.getElementById('cashDiffDisplay').textContent  = fmtRs(0);
}

// =====================
// DASHBOARD
// =====================
function updateDashboard() {
  const today = todayStr();
  const todayShifts = state.shifts.filter(s => s.date === today);

  let petrolL = 0, petrolRs = 0, dieselL = 0, dieselRs = 0, totalRs = 0, diff = 0;

  todayShifts.forEach(s => {
    s.nozzles.forEach(n => {
      if (n.fuel === 'Petrol') { petrolL += n.sale; petrolRs += n.amount; }
      if (n.fuel === 'Diesel') { dieselL += n.sale; dieselRs += n.amount; }
    });
    totalRs += s.cash.totalCollection;
    diff    += s.cash.diff;
  });

  document.getElementById('dc-petrol-l').textContent  = fmtNum(petrolL) + ' L';
  document.getElementById('dc-petrol-rs').textContent = fmtRs(petrolRs);
  document.getElementById('dc-diesel-l').textContent  = fmtNum(dieselL) + ' L';
  document.getElementById('dc-diesel-rs').textContent = fmtRs(dieselRs);
  document.getElementById('dc-total-rs').textContent  = fmtRs(totalRs);
  document.getElementById('dc-shifts').textContent    = todayShifts.length + ' shifts recorded';
  document.getElementById('dc-diff').textContent      = (diff >= 0 ? '+' : '') + fmtRs(diff);
  document.getElementById('dc-diff').className        = 'sc-val ' + (diff === 0 ? '' : diff > 0 ? 'green-val' : 'red-val');

  renderDashTanks();
  renderDashRecentShifts();
  updateSidebarPumpName();
}

function updateSidebarPumpName() {
  const el = document.getElementById('sidebarPumpName');
  if (el) el.textContent = state.pumpInfo.name || 'Petrol Pump';
}

function getTankCurrentStock(tankId) {
  const tank = state.tanks.find(t => t.id === tankId);
  if (!tank) return 0;
  
  const initial = tank.stock || 0;
  const supply = state.supplies.filter(s => s.tankId === tankId).reduce((sum, s) => sum + s.qty, 0);
  
  // Sales (ignoring decimals)
  let sales = 0;
  state.shifts.forEach(s => {
    s.nozzles.filter(n => n.tankId === tankId).forEach(n => {
      const integerSale = Math.max(0, Math.floor(n.closing) - Math.floor(n.opening) - (n.testing || 0));
      sales += integerSale;
    });
  });
  
  // Check if manual dipping was entered
  let mostRecentDipDate = null;
  let mostRecentDipVal = null;
  
  const sortedShifts = [...state.shifts].sort((a,b) => b.date.localeCompare(a.date) || b.shift.localeCompare(a.shift));
  for (let s of sortedShifts) {
    const tData = s.tanks.find(t => t.tankId === tankId);
    if (tData && tData.closingStock !== null && tData.closingStock !== undefined) {
      mostRecentDipDate = s.date;
      mostRecentDipVal = tData.closingStock;
      break;
    }
  }
  
  if (mostRecentDipDate !== null) {
    // Current stock = last dip val + subsequent supplies - subsequent sales
    const strictSupplies = state.supplies.filter(s => s.tankId === tankId && s.date > mostRecentDipDate)
                                        .reduce((sum, s) => sum + s.qty, 0);
    let strictSales = 0;
    state.shifts.filter(s => s.date > mostRecentDipDate).forEach(s => {
      s.nozzles.filter(n => n.tankId === tankId).forEach(n => {
        const integerSale = Math.max(0, Math.floor(n.closing) - Math.floor(n.opening) - (n.testing || 0));
        strictSales += integerSale;
      });
    });
    
    return Math.max(0, mostRecentDipVal + strictSupplies - strictSales);
  }
  
  return Math.max(0, initial + supply - sales);
}

function renderDashTanks() {
  const el = document.getElementById('dashTankStatus');
  if (!state.tanks.length) {
    el.innerHTML = `<div class="empty-msg">⚙️ Go to Settings → Configure Tanks first.</div>`;
    return;
  }
  el.innerHTML = state.tanks.map(tank => {
    const curStock = getTankCurrentStock(tank.id);
    const pct = tank.capacity > 0 ? Math.min(100, (curStock / tank.capacity) * 100) : 0;
    const cls = tank.fuel === 'Petrol' ? 'fuel-petrol' : 'fuel-diesel';
    return `
    <div class="tank-status-item">
      <div class="tank-label">
        <span class="fuel-${tank.fuel.toLowerCase()}-tag">${tank.fuel}</span>
        <div style="font-size:12px;color:var(--text2)">${tank.name}</div>
      </div>
      <div class="tank-progress-wrap ${cls}">
        <div class="tank-progress-bar">
          <div class="tank-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="tank-stock-pct">${fmtNum(pct, 1)}% full</div>
      </div>
      <div>
        <div class="tank-stock-val fuel-${tank.fuel.toLowerCase()}-tag">${fmtNum(curStock, 0)} L</div>
        <div class="tank-stock-pct">of ${fmtNum(tank.capacity || 0, 0)} L</div>
      </div>
    </div>`;
  }).join('');
}

function renderDashRecentShifts() {
  const el = document.getElementById('dashRecentShifts');
  const recent = [...state.shifts].sort((a,b) => b.savedAt - a.savedAt).slice(0,8);
  if (!recent.length) {
    el.innerHTML = `<div class="empty-msg">No shifts recorded yet. Start with Shift Entry.</div>`;
    return;
  }
  el.innerHTML = recent.map(s => {
    const totalL = s.nozzles.reduce((sum, n) => sum + n.sale, 0);
    const diff = s.cash.diff;
    const diffCls = diff === 0 ? 'diff-zero' : diff > 0 ? 'diff-pos' : 'diff-neg';
    const diffStr = (diff >= 0 ? '+' : '') + fmtRs(diff);
    return `
    <div class="shift-item">
      <span class="shift-badge ${s.shift === 'day' ? 'badge-day' : 'badge-night'}">
        ${s.shift === 'day' ? '🌞 Day' : '🌙 Night'}
      </span>
      <div class="shift-info">
        <div class="shift-info-date">${fmtDate(s.date)}</div>
        <div class="shift-info-amt">${fmtRs(s.cash.totalSales)} &nbsp;·&nbsp; ${fmtNum(totalL)} L</div>
      </div>
      <span class="shift-diff ${diffCls}">${diffStr}</span>
    </div>`;
  }).join('');
}

// =====================
// TANK STOCK
// =====================
function openSupplyModal() {
  const sel = document.getElementById('supTank');
  sel.innerHTML = state.tanks.length
    ? state.tanks.map(t => `<option value="${t.id}">${t.name} (${t.fuel})</option>`).join('')
    : '<option value="">No tanks configured</option>';
  setVal('supDate', todayStr());
  document.getElementById('supplyModal').style.display = 'flex';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function saveSupply() {
  const date     = document.getElementById('supDate').value;
  const tankId   = parseInt(document.getElementById('supTank').value);
  const qty      = parseFloat(document.getElementById('supQty').value) || 0;
  const bill     = document.getElementById('supBill').value;
  const supplier = document.getElementById('supSupplier').value;
  const remark   = document.getElementById('supRemark').value;

  if (!date || !qty) { showToast('Enter date and quantity.', 'error'); return; }

  state.supplies.push({ id: Date.now(), date, tankId, qty, bill, supplier, remark });
  saveToStorage(true);
  closeModal('supplyModal');
  showToast('✅ Fuel supply saved!', 'success');
  loadTankStock();
}

function loadTankStock() {
  const from = document.getElementById('tankFrom')?.value || '';
  const to   = document.getElementById('tankTo')?.value   || '';

  // Supply history
  let supplies = state.supplies;
  if (from) supplies = supplies.filter(s => s.date >= from);
  if (to)   supplies = supplies.filter(s => s.date <= to);

  const supBody = document.getElementById('supplyHistoryBody');
  if (!supplies.length) {
    supBody.innerHTML = `<tr><td colspan="7" class="empty-msg">No supply records found.</td></tr>`;
  } else {
    supBody.innerHTML = supplies
      .sort((a,b) => b.date.localeCompare(a.date))
      .map(s => {
        const tank = state.tanks.find(t => t.id === s.tankId);
        return `
        <tr>
          <td>${fmtDate(s.date)}</td>
          <td>${tank ? tank.name : '—'}</td>
          <td><span class="fuel-${tank ? tank.fuel.toLowerCase() : ''}-tag">${tank ? tank.fuel : '—'}</span></td>
          <td class="green-val">${fmtNum(s.qty)} L</td>
          <td>${s.bill || '—'}</td>
          <td>${s.remark || '—'}</td>
          <td><button class="btn-sm-del" onclick="deleteSupply(${s.id})">🗑️</button></td>
        </tr>`;
      }).join('');
  }

  // Tank summary: per date per tank
  const summaryRows = buildTankSummary(from, to);
  const sumBody = document.getElementById('tankSummaryBody');
  if (!summaryRows.length) {
    sumBody.innerHTML = `<tr><td colspan="8" class="empty-msg">No data found.</td></tr>`;
  } else {
    sumBody.innerHTML = summaryRows.map(r => {
      const diffCls = r.diff >= 0 ? 'green-val' : 'red-val';
      return `
      <tr>
        <td>${fmtDate(r.date)}</td>
        <td>${r.tankName}</td>
        <td><span class="fuel-${r.fuel.toLowerCase()}-tag">${r.fuel}</span></td>
        <td>${fmtNum(r.opening)} L</td>
        <td class="green-val">${fmtNum(r.supply)} L</td>
        <td class="red-val">${fmtNum(r.sales)} L</td>
        <td>${fmtNum(r.closing)} L</td>
        <td class="${diffCls}">${r.diff >= 0 ? '+' : ''}${fmtNum(r.diff)} L</td>
      </tr>`;
    }).join('');
  }
}

function buildTankSummary(from, to) {
  // 1. Collect all unique dates with activity
  const dateSet = new Set();
  state.shifts.forEach(s => dateSet.add(s.date));
  state.supplies.forEach(s => dateSet.add(s.date));
  const allDates = [...dateSet].sort();

  // 2. Compute total sales and supplies for each tank across all time
  const totalSalesByTank = {};
  const totalSupplyByTank = {};
  state.tanks.forEach(t => {
    totalSalesByTank[t.id] = 0;
    totalSupplyByTank[t.id] = 0;
  });

  state.shifts.forEach(s => {
    s.nozzles.forEach(n => {
      if (totalSalesByTank[n.tankId] !== undefined) {
        const integerSale = Math.max(0, Math.floor(n.closing) - Math.floor(n.opening) - (n.testing || 0));
        totalSalesByTank[n.tankId] += integerSale;
      }
    });
  });

  state.supplies.forEach(s => {
    if (totalSupplyByTank[s.tankId] !== undefined) {
      totalSupplyByTank[s.tankId] += s.qty;
    }
  });

  // 3. Initialize running stock for each tank to its configured initial stock
  const runningStocks = {};
  state.tanks.forEach(t => {
    runningStocks[t.id] = t.stock || 0;
  });

  // 4. Calculate day-by-day details
  const dailyDetails = [];

  allDates.forEach(date => {
    state.tanks.forEach(tank => {
      const open = runningStocks[tank.id];
      
      // Sales on this date (decimals ignored)
      let sales = 0;
      state.shifts.filter(s => s.date === date).forEach(s => {
        s.nozzles.filter(n => n.tankId === tank.id).forEach(n => {
          const integerSale = Math.max(0, Math.floor(n.closing) - Math.floor(n.opening) - (n.testing || 0));
          sales += integerSale;
        });
      });

      // Supply on this date
      const supply = state.supplies.filter(s => s.date === date && s.tankId === tank.id)
                                   .reduce((sum, s) => sum + s.qty, 0);

      // Check if dipping closing stock was entered
      let dipVal = null;
      const dayShifts = state.shifts.filter(s => s.date === date);
      if (dayShifts.length) {
        const sortedShifts = [...dayShifts].sort((a, b) => a.shift.localeCompare(b.shift));
        const lastShift = sortedShifts[sortedShifts.length - 1];
        const tData = lastShift.tanks.find(t => t.tankId === tank.id);
        if (tData && tData.closingStock !== null && tData.closingStock !== undefined) {
          dipVal = tData.closingStock;
        }
      }

      const calculatedClosing = open + supply - sales;
      const closing = dipVal !== null ? dipVal : calculatedClosing;
      const diff = closing - calculatedClosing;

      // Update running stock for next day
      runningStocks[tank.id] = closing;

      dailyDetails.push({
        date,
        tankId: tank.id,
        tankName: tank.name,
        fuel: tank.fuel,
        opening: Math.max(0, open),
        supply,
        sales,
        closing: Math.max(0, closing),
        diff
      });
    });
  });

  // 5. Filter by range
  let filtered = dailyDetails;
  if (from) filtered = filtered.filter(row => row.date >= from);
  if (to)   filtered = filtered.filter(row => row.date <= to);

  return filtered.sort((a, b) => b.date.localeCompare(a.date) || a.tankName.localeCompare(b.tankName));
}

function deleteSupply(id) {
  if (!confirm('Delete this supply record?')) return;
  state.supplies = state.supplies.filter(s => s.id !== id);
  saveToStorage(true);
  loadTankStock();
  showToast('Supply record deleted.', 'info');
}

// =====================
// NOZZLE REPORT
// =====================
function loadNozzleReport() {
  const from      = document.getElementById('nozFrom').value;
  const to        = document.getElementById('nozTo').value;
  const fuelFilt  = document.getElementById('nozFuelFilter').value;
  const shiftFilt = document.getElementById('nozShiftFilter').value;

  let rows = [];
  state.shifts
    .filter(s => (!from || s.date >= from) && (!to || s.date <= to))
    .filter(s => shiftFilt === 'all' || s.shift === shiftFilt)
    .sort((a,b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift))
    .forEach(s => {
      s.nozzles
        .filter(n => fuelFilt === 'all' || n.fuel === fuelFilt)
        .forEach(n => {
          rows.push({ ...n, date: s.date, shift: s.shift });
        });
    });

  const tbody = document.getElementById('nozzleRptBody');
  const foot  = document.getElementById('nozRptFoot');
  const totDiv= document.getElementById('nozReportTotals');

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-msg">No data found for selected filters.</td></tr>`;
    foot.style.display = 'none';
    totDiv.innerHTML = '';
    return;
  }

  let totalL = 0, totalRs = 0;
  tbody.innerHTML = rows.map(r => {
    totalL  += r.sale;
    totalRs += r.amount;
    return `
    <tr>
      <td>${fmtDate(r.date)}</td>
      <td><span class="shift-badge ${r.shift === 'day' ? 'badge-day' : 'badge-night'}">${r.shift === 'day' ? '🌞 Day' : '🌙 Night'}</span></td>
      <td><strong>${r.nozzleName}</strong></td>
      <td><span class="fuel-${r.fuel.toLowerCase()}-tag">${r.fuel}</span></td>
      <td>${fmtNum(r.opening)}</td>
      <td>${fmtNum(r.closing)}</td>
      <td class="green-val"><strong>${fmtNum(r.sale)} L</strong></td>
      <td>${fmtNum(r.rate)}</td>
      <td class="sale-amt"><strong>${fmtRs(r.amount)}</strong></td>
    </tr>`;
  }).join('');

  foot.style.display = '';
  document.getElementById('nozRptTotalL').innerHTML  = `<strong class="green-val">${fmtNum(totalL)} L</strong>`;
  document.getElementById('nozRptTotalRs').innerHTML = `<strong class="sale-amt">${fmtRs(totalRs)}</strong>`;

  // Totals by fuel
  const byFuel = {};
  rows.forEach(r => {
    if (!byFuel[r.fuel]) byFuel[r.fuel] = { l: 0, rs: 0 };
    byFuel[r.fuel].l  += r.sale;
    byFuel[r.fuel].rs += r.amount;
  });
  totDiv.innerHTML = Object.entries(byFuel).map(([fuel, v]) => `
    <div class="rpt-total-item">
      ${fuel}: <span>${fmtNum(v.l)} L</span> = <span>${fmtRs(v.rs)}</span>
    </div>`).join('');
}

// =====================
// DAILY REPORT
// =====================
function loadDailyReport() {
  const date = document.getElementById('dailyDate').value;
  if (!date) return;
  const shifts = state.shifts.filter(s => s.date === date).sort((a,b) => a.shift.localeCompare(b.shift));
  renderDailyReport(date, shifts, 'dailyReportContent');
}

function loadDailyRange() {
  const from = document.getElementById('dailyFrom').value;
  const to   = document.getElementById('dailyTo').value;
  if (!from || !to) { showToast('Select from and to dates.', 'error'); return; }

  const dates = [];
  let cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0,10));
    cur.setDate(cur.getDate() + 1);
  }

  const container = document.getElementById('dailyReportContent');
  container.innerHTML = '';

  let hasAny = false;
  dates.forEach(date => {
    const shifts = state.shifts.filter(s => s.date === date);
    if (shifts.length) {
      hasAny = true;
      const div = document.createElement('div');
      div.id = 'dr_' + date;
      container.appendChild(div);
      renderDailyReport(date, shifts.sort((a,b) => a.shift.localeCompare(b.shift)), 'dr_' + date);
    }
  });

  if (!hasAny) {
    container.innerHTML = `<div class="card"><div class="empty-msg">No data found for the selected date range.</div></div>`;
  }
}

// =====================
// DSR REPORT (Daily Sales Register)
// =====================
function getNozzleReadingOnDate(nzId, dateStr, type='opening') {
  const dayShifts = state.shifts.filter(s => s.date === dateStr);
  if (dayShifts.length) {
    const sorted = [...dayShifts].sort((a, b) => a.shift.localeCompare(b.shift)); // day shift first
    const firstShift = sorted[0];
    const nz = firstShift.nozzles.find(n => n.nozzleId === nzId);
    if (nz) return nz.opening;
  }
  
  // No shifts on dateStr. Look back.
  const prevShifts = state.shifts.filter(s => s.date < dateStr);
  if (prevShifts.length) {
    const sortedPrev = [...prevShifts].sort((a, b) => b.date.localeCompare(a.date) || b.shift.localeCompare(a.shift)); // most recent first
    for (let s of sortedPrev) {
      const nz = s.nozzles.find(n => n.nozzleId === nzId);
      if (nz) return nz.closing; // closing of most recent shift becomes opening of this day
    }
  }
  
  return 0;
}

function getDSRData(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  
  const pNozzles = state.nozzles.filter(n => n.fuel === 'Petrol').sort((a,b) => a.name.localeCompare(b.name));
  const dNozzles = state.nozzles.filter(n => n.fuel === 'Diesel').sort((a,b) => a.name.localeCompare(b.name));
  
  // Find earliest activity date to start running stock calculation
  let startDateStr = `${year}-${String(month).padStart(2,'0')}-01`;
  if (state.shifts.length) {
    const sortedAllShifts = [...state.shifts].sort((a, b) => a.date.localeCompare(b.date));
    if (sortedAllShifts[0].date < startDateStr) {
      startDateStr = sortedAllShifts[0].date;
    }
  }
  
  const datesList = [];
  let cur = new Date(startDateStr);
  const endLimit = new Date(year, month - 1, daysInMonth);
  while (cur <= endLimit) {
    datesList.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  
  let runningPetrolStock = 0;
  let runningDieselStock = 0;
  
  const dailyHistory = {};
  
  datesList.forEach((dStr, idx) => {
    // Supplies
    const pPurch = state.supplies
      .filter(s => s.date === dStr && state.tanks.find(t => t.id === s.tankId)?.fuel === 'Petrol')
      .reduce((sum, s) => sum + s.qty, 0);
    const dPurch = state.supplies
      .filter(s => s.date === dStr && state.tanks.find(t => t.id === s.tankId)?.fuel === 'Diesel')
      .reduce((sum, s) => sum + s.qty, 0);
      
    // Sales and testing (DSR report ignores decimals)
    let pSale = 0, pTest = 0;
    let dSale = 0, dTest = 0;
    
    const dayShifts = state.shifts.filter(s => s.date === dStr);
    dayShifts.forEach(s => {
      s.nozzles.forEach(n => {
        // Ignore decimal points on readings: Math.floor(close) - Math.floor(open) - testing
        const integerSale = Math.max(0, Math.floor(n.closing) - Math.floor(n.opening) - (n.testing || 0));
        if (n.fuel === 'Petrol') {
          pSale += integerSale;
          pTest += n.testing || 0;
        } else {
          dSale += integerSale;
          dTest += n.testing || 0;
        }
      });
    });
    
    // Dipping closing stock
    let pDip = null;
    let dDip = null;
    if (dayShifts.length) {
      const sortedShifts = [...dayShifts].sort((a, b) => a.shift.localeCompare(b.shift));
      const lastShift = sortedShifts[sortedShifts.length - 1];
      
      let pDips = lastShift.tanks.filter(t => t.fuel === 'Petrol' && t.closingStock !== null && t.closingStock !== undefined);
      if (pDips.length) pDip = pDips.reduce((sum, t) => sum + t.closingStock, 0);
      
      let dDips = lastShift.tanks.filter(t => t.fuel === 'Diesel' && t.closingStock !== null && t.closingStock !== undefined);
      if (dDips.length) dDip = dDips.reduce((sum, t) => sum + t.closingStock, 0);
    }
    
    if (idx === 0) {
      // First day Ever init
      let initialPetrol = state.tanks.filter(t => t.fuel === 'Petrol').reduce((sum, t) => sum + t.stock, 0);
      let initialDiesel = state.tanks.filter(t => t.fuel === 'Diesel').reduce((sum, t) => sum + t.stock, 0);
      
      if (pDip !== null) initialPetrol = pDip - pPurch + pSale;
      if (dDip !== null) initialDiesel = dDip - dPurch + dSale;
      
      runningPetrolStock = initialPetrol;
      runningDieselStock = initialDiesel;
    }
    
    const pOpen = runningPetrolStock;
    const dOpen = runningDieselStock;
    const pTotal = pOpen + pPurch;
    const dTotal = dOpen + dPurch;
    const pClose = pDip !== null ? pDip : Math.max(0, pTotal - pSale);
    const dClose = dDip !== null ? dDip : Math.max(0, dTotal - dSale);
    
    runningPetrolStock = pClose;
    runningDieselStock = dClose;
    
    dailyHistory[dStr] = {
      Petrol: { open: pOpen, purchase: pPurch, total: pTotal, sale: pSale, testing: pTest, dip: pDip, closing: pClose },
      Diesel: { open: dOpen, purchase: dPurch, total: dTotal, sale: dSale, testing: dTest, dip: dDip, closing: dClose }
    };
  });
  
  const rows = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const hist = dailyHistory[dStr] || {
      Petrol: { open: 0, purchase: 0, total: 0, sale: 0, testing: 0, dip: null, closing: 0 },
      Diesel: { open: 0, purchase: 0, total: 0, sale: 0, testing: 0, dip: null, closing: 0 }
    };
    
    const pReadings = pNozzles.map(nz => Math.floor(getNozzleReadingOnDate(nz.id, dStr, 'opening')));
    const dReadings = dNozzles.map(nz => Math.floor(getNozzleReadingOnDate(nz.id, dStr, 'opening')));
    
    rows.push({
      date: dStr,
      Petrol: { ...hist.Petrol, readings: pReadings },
      Diesel: { ...hist.Diesel, readings: dReadings }
    });
  }
  
  return { rows, pNozzles, dNozzles };
}

function loadDSRReport() {
  const dsrMonth = document.getElementById('dsrMonth').value;
  if (!dsrMonth) { showToast('Please select a month.', 'error'); return; }
  const [year, month] = dsrMonth.split('-');
  const dsrData = getDSRData(parseInt(year), parseInt(month));
  
  // Set pump header info for printing
  const n1 = document.getElementById('printPumpNameDSR');
  const a1 = document.getElementById('printPumpAddrDSR');
  if (n1) n1.textContent = state.pumpInfo.name;
  if (a1) a1.textContent = state.pumpInfo.address;
  
  renderDSRTables(dsrData);
}

function renderDSRTables(dsrData) {
  const { rows, pNozzles, dNozzles } = dsrData;
  const container = document.getElementById('dsrContainer');
  if (!container) return;

  const maxDate = state.shifts.length 
    ? [...state.shifts].sort((a,b) => b.date.localeCompare(a.date))[0].date 
    : '';
  
  let nextDate = '';
  if (maxDate) {
    const d = new Date(maxDate);
    d.setDate(d.getDate() + 1);
    nextDate = d.toISOString().slice(0, 10);
  }
  
  const pSaleTotal = rows.reduce((s, r) => s + (state.shifts.some(sh => sh.date === r.date) ? r.Petrol.sale : 0), 0);
  const pTestingTotal = rows.reduce((s, r) => s + (state.shifts.some(sh => sh.date === r.date) ? r.Petrol.testing : 0), 0);
  const dSaleTotal = rows.reduce((s, r) => s + (state.shifts.some(sh => sh.date === r.date) ? r.Diesel.sale : 0), 0);
  const dTestingTotal = rows.reduce((s, r) => s + (state.shifts.some(sh => sh.date === r.date) ? r.Diesel.testing : 0), 0);
  
  let html = `
    <!-- Petrol DSR -->
    <div class="dsr-col">
      <div class="dsr-title petrol-title">🔴 Petrol DSR</div>
      <div class="tbl-scroll">
        <table class="dsr-table">
          <thead>
            <tr>
              <th rowspan="2">Date</th>
              <th rowspan="2">Open</th>
              <th rowspan="2">Purch.</th>
              <th rowspan="2">Total</th>
              <th colspan="${pNozzles.length || 1}">Nozzles</th>
              <th rowspan="2">Testing</th>
              <th rowspan="2">Sale</th>
            </tr>
            <tr>
              ${pNozzles.length ? pNozzles.map(nz => `<th>${nz.name}</th>`).join('') : '<th>—</th>'}
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const isFuture = maxDate && r.date > nextDate;
              const hasShiftsOnDate = state.shifts.some(s => s.date === r.date);
              
              const openVal = isFuture ? '' : Math.floor(r.Petrol.open);
              const purchVal = (isFuture || r.Petrol.purchase === 0) ? '' : Math.floor(r.Petrol.purchase);
              const totalVal = isFuture ? '' : Math.floor(r.Petrol.total);
              
              const readingsHtml = pNozzles.length 
                ? r.Petrol.readings.map((read, idx) => `<td>${(isFuture || read === 0) ? '' : read}</td>`).join('') 
                : '<td>—</td>';
                
              const testVal = (isFuture || r.Petrol.testing === 0 || !hasShiftsOnDate) ? '' : r.Petrol.testing;
              const saleVal = (isFuture || !hasShiftsOnDate) ? '' : Math.floor(r.Petrol.sale);

              return `
              <tr>
                <td><strong>${r.date.slice(-2)}</strong></td>
                <td>${openVal}</td>
                <td class="green-val">${purchVal}</td>
                <td>${totalVal}</td>
                ${readingsHtml}
                <td class="red-val">${testVal}</td>
                <td class="green-val"><strong>${saleVal}</strong></td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr class="tfoot-row">
              <td colspan="4">TOTAL SALE</td>
              <td colspan="${pNozzles.length || 1}">—</td>
              <td class="red-val">${pTestingTotal}</td>
              <td class="green-val">${Math.floor(pSaleTotal)} L</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Diesel DSR -->
    <div class="dsr-col">
      <div class="dsr-title diesel-title">🟡 Diesel DSR</div>
      <div class="tbl-scroll">
        <table class="dsr-table">
          <thead>
            <tr>
              <th rowspan="2">Date</th>
              <th rowspan="2">Open</th>
              <th rowspan="2">Purch.</th>
              <th rowspan="2">Total</th>
              <th colspan="${dNozzles.length || 1}">Nozzles</th>
              <th rowspan="2">Testing</th>
              <th rowspan="2">Sale</th>
            </tr>
            <tr>
              ${dNozzles.length ? dNozzles.map(nz => `<th>${nz.name}</th>`).join('') : '<th>—</th>'}
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => {
              const isFuture = maxDate && r.date > nextDate;
              const hasShiftsOnDate = state.shifts.some(s => s.date === r.date);
              
              const openVal = isFuture ? '' : Math.floor(r.Diesel.open);
              const purchVal = (isFuture || r.Diesel.purchase === 0) ? '' : Math.floor(r.Diesel.purchase);
              const totalVal = isFuture ? '' : Math.floor(r.Diesel.total);
              
              const readingsHtml = dNozzles.length 
                ? r.Diesel.readings.map((read, idx) => `<td>${(isFuture || read === 0) ? '' : read}</td>`).join('') 
                : '<td>—</td>';
                
              const testVal = (isFuture || r.Diesel.testing === 0 || !hasShiftsOnDate) ? '' : r.Diesel.testing;
              const saleVal = (isFuture || !hasShiftsOnDate) ? '' : Math.floor(r.Diesel.sale);

              return `
              <tr>
                <td><strong>${r.date.slice(-2)}</strong></td>
                <td>${openVal}</td>
                <td class="green-val">${purchVal}</td>
                <td>${totalVal}</td>
                ${readingsHtml}
                <td class="red-val">${testVal}</td>
                <td class="green-val"><strong>${saleVal}</strong></td>
              </tr>`;
            }).join('')}
          </tbody>
          <tfoot>
            <tr class="tfoot-row">
              <td colspan="4">TOTAL SALE</td>
              <td colspan="${dNozzles.length || 1}">—</td>
              <td class="red-val">${dTestingTotal}</td>
              <td class="green-val">${Math.floor(dSaleTotal)} L</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

function exportDSRCSV() {
  const dsrMonth = document.getElementById('dsrMonth').value;
  if (!dsrMonth) { showToast('Please select a month.', 'error'); return; }
  const [year, month] = dsrMonth.split('-');
  const { rows, pNozzles, dNozzles } = getDSRData(parseInt(year), parseInt(month));

  const maxDate = state.shifts.length 
    ? [...state.shifts].sort((a,b) => b.date.localeCompare(a.date))[0].date 
    : '';
  
  let nextDate = '';
  if (maxDate) {
    const d = new Date(maxDate);
    d.setDate(d.getDate() + 1);
    nextDate = d.toISOString().slice(0, 10);
  }
  
  let csv = 'DAILY SALES REGISTER (DSR) - ' + dsrMonth + '\r\n\r\n';
  
  // PETROL Table
  csv += 'PETROL DSR\r\n';
  csv += 'DATE,OPEN,PURCHASE,TOTAL,' + pNozzles.map(nz => nz.name).join(',') + ',TESTING,SALE\r\n';
  rows.forEach(r => {
    const isFuture = maxDate && r.date > nextDate;
    const hasShiftsOnDate = state.shifts.some(s => s.date === r.date);
    
    const openVal = isFuture ? '' : Math.floor(r.Petrol.open);
    const purchVal = (isFuture || r.Petrol.purchase === 0) ? '' : Math.floor(r.Petrol.purchase);
    const totalVal = isFuture ? '' : Math.floor(r.Petrol.total);
    const readings = pNozzles.map((nz, idx) => (isFuture || r.Petrol.readings[idx] === 0) ? '' : r.Petrol.readings[idx]).join(',');
    const testVal = (isFuture || r.Petrol.testing === 0 || !hasShiftsOnDate) ? '' : r.Petrol.testing;
    const saleVal = (isFuture || !hasShiftsOnDate) ? '' : Math.floor(r.Petrol.sale);

    csv += `${fmtDate(r.date)},${openVal},${purchVal},${totalVal},${readings},${testVal},${saleVal}\r\n`;
  });
  const pSaleTotal = rows.reduce((s, r) => s + (state.shifts.some(sh => sh.date === r.date) ? r.Petrol.sale : 0), 0);
  csv += `TOTAL SALE,,,,,,,,${Math.floor(pSaleTotal)}\r\n\r\n`;
  
  // DIESEL Table
  csv += 'DIESEL DSR\r\n';
  csv += 'DATE,OPEN,PURCHASE,TOTAL,' + dNozzles.map(nz => nz.name).join(',') + ',TESTING,SALE\r\n';
  rows.forEach(r => {
    const isFuture = maxDate && r.date > nextDate;
    const hasShiftsOnDate = state.shifts.some(s => s.date === r.date);
    
    const openVal = isFuture ? '' : Math.floor(r.Diesel.open);
    const purchVal = (isFuture || r.Diesel.purchase === 0) ? '' : Math.floor(r.Diesel.purchase);
    const totalVal = isFuture ? '' : Math.floor(r.Diesel.total);
    const readings = dNozzles.map((nz, idx) => (isFuture || r.Diesel.readings[idx] === 0) ? '' : r.Diesel.readings[idx]).join(',');
    const testVal = (isFuture || r.Diesel.testing === 0 || !hasShiftsOnDate) ? '' : r.Diesel.testing;
    const saleVal = (isFuture || !hasShiftsOnDate) ? '' : Math.floor(r.Diesel.sale);

    csv += `${fmtDate(r.date)},${openVal},${purchVal},${totalVal},${readings},${testVal},${saleVal}\r\n`;
  });
  const dSaleTotal = rows.reduce((s, r) => s + (state.shifts.some(sh => sh.date === r.date) ? r.Diesel.sale : 0), 0);
  csv += `TOTAL SALE,,,,,,,,,${Math.floor(dSaleTotal)}\r\n`;
  
  // Download CSV
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DSR_Report_${dsrMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 DSR CSV exported successfully!', 'success');
}


function renderDailyReport(date, shifts, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!shifts.length) {
    container.innerHTML = `<div class="card"><div class="empty-msg">📅 No entries found for ${fmtDate(date)}.</div></div>`;
    return;
  }

  let allNozzles = [];
  let totalPetrolL = 0, totalPetrolRs = 0, totalDieselL = 0, totalDieselRs = 0;
  let totalCash = 0, totalCard = 0, totalUPI = 0, totalExtraPower = 0, totalCredit = 0, totalOtherAmt = 0;
  let allOtherItems = [];  // collect all named items across shifts
  let totalCollection = 0, totalSales = 0, totalDiff = 0;

  shifts.forEach(s => {
    s.nozzles.forEach(n => {
      allNozzles.push({ ...n, shift: s.shift });
      if (n.fuel === 'Petrol') { totalPetrolL += n.sale; totalPetrolRs += n.amount; }
      if (n.fuel === 'Diesel') { totalDieselL += n.sale; totalDieselRs += n.amount; }
    });
    totalCash       += s.cash.cash       || 0;
    totalCard       += s.cash.card       || 0;
    totalUPI        += s.cash.upi        || 0;
    totalExtraPower += s.cash.extraPower || 0;
    totalCredit     += s.cash.credit     || 0;
    // Support both old (other) and new (otherItems) format
    if (s.cash.otherItems && Array.isArray(s.cash.otherItems)) {
      s.cash.otherItems.forEach(oi => {
        allOtherItems.push({ ...oi, shift: s.shift });
        totalOtherAmt += oi.amount;
      });
    } else if (s.cash.other) {
      totalOtherAmt += s.cash.other;
      allOtherItems.push({ name: 'Other', amount: s.cash.other, shift: s.shift });
    }
    totalCollection += s.cash.totalCollection || 0;
    totalSales      += s.cash.totalSales      || 0;
    totalDiff       += s.cash.diff            || 0;
  });

  const diffCls = totalDiff === 0 ? 'var(--text3)' : totalDiff > 0 ? 'var(--success)' : 'var(--danger)';

  let html = `
  <div class="card daily-report-wrap" style="margin-bottom:20px">
    <div class="card-hdr" style="background:rgba(79,141,255,0.08)">
      <h2>📅 Daily Report — ${fmtDate(date)}</h2>
      <span class="card-hint">${shifts.length} shift(s) recorded</span>
    </div>

    <!-- Summary Grid -->
    <div class="daily-section-title">📊 Day Summary</div>
    <div class="daily-summary-grid">
      <div class="daily-sum-item">
        <div class="daily-sum-label">🔴 Petrol Sales</div>
        <div class="daily-sum-val" style="color:var(--petrol)">${fmtNum(totalPetrolL)} L</div>
        <div style="font-size:12px;color:var(--text2)">${fmtRs(totalPetrolRs)}</div>
      </div>
      <div class="daily-sum-item">
        <div class="daily-sum-label">🟡 Diesel Sales</div>
        <div class="daily-sum-val" style="color:var(--diesel)">${fmtNum(totalDieselL)} L</div>
        <div style="font-size:12px;color:var(--text2)">${fmtRs(totalDieselRs)}</div>
      </div>
      <div class="daily-sum-item">
        <div class="daily-sum-label">⛽ Total Sales (L)</div>
        <div class="daily-sum-val" style="color:var(--green)">${fmtNum(totalPetrolL + totalDieselL)} L</div>
      </div>
      <div class="daily-sum-item">
        <div class="daily-sum-label">💰 Total Sales (₹)</div>
        <div class="daily-sum-val" style="color:var(--green)">${fmtRs(totalSales)}</div>
      </div>
      <div class="daily-sum-item">
        <div class="daily-sum-label">🏦 Total Collection</div>
        <div class="daily-sum-val" style="color:var(--accent)">${fmtRs(totalCollection)}</div>
      </div>
      <div class="daily-sum-item">
        <div class="daily-sum-label">⚖️ +/- Difference</div>
        <div class="daily-sum-val" style="color:${diffCls}">${totalDiff >= 0 ? '+' : ''}${fmtRs(totalDiff)}</div>
      </div>
    </div>

    <!-- Shift-wise nozzle details -->
    <div class="daily-section-title">⛽ Nozzle-wise Sales (Shift Detail)</div>
    <div class="tbl-scroll" style="padding:0 0 8px">
      <table class="pump-table">
        <thead>
          <tr>
            <th>Shift</th>
            <th>Nozzle</th>
            <th>Fuel</th>
            <th>Opening</th>
            <th>Closing</th>
            <th>Sale (L)</th>
            <th>Rate (₹)</th>
            <th>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${allNozzles.map(n => `
          <tr>
            <td><span class="shift-badge ${n.shift === 'day' ? 'badge-day' : 'badge-night'}">${n.shift === 'day' ? '🌞 Day' : '🌙 Night'}</span></td>
            <td><strong>${n.nozzleName}</strong></td>
            <td><span class="fuel-${n.fuel.toLowerCase()}-tag">${n.fuel}</span></td>
            <td>${fmtNum(n.opening)}</td>
            <td>${fmtNum(n.closing)}</td>
            <td class="green-val"><strong>${fmtNum(n.sale)} L</strong></td>
            <td>${fmtNum(n.rate)}</td>
            <td class="sale-amt"><strong>${fmtRs(n.amount)}</strong></td>
          </tr>`).join('')}
        </tbody>
        <tfoot>
          <tr class="tfoot-row">
            <td colspan="5"><strong>TOTAL</strong></td>
            <td><strong class="green-val">${fmtNum(totalPetrolL + totalDieselL)} L</strong></td>
            <td>—</td>
            <td><strong class="sale-amt">${fmtRs(totalSales)}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <!-- Cash Collection -->
    <div class="daily-section-title">💰 Cash Collection</div>
    <div class="daily-summary-grid">
      <div class="daily-sum-item">
        <div class="daily-sum-label">💵 Cash</div>
        <div class="daily-sum-val" style="color:var(--text)">${fmtRs(totalCash)}</div>
      </div>
      <div class="daily-sum-item">
        <div class="daily-sum-label">💳 Card</div>
        <div class="daily-sum-val" style="color:var(--text)">${fmtRs(totalCard)}</div>
      </div>
      <div class="daily-sum-item">
        <div class="daily-sum-label">📱 UPI</div>
        <div class="daily-sum-val" style="color:var(--text)">${fmtRs(totalUPI)}</div>
      </div>
      <div class="daily-sum-item">
        <div class="daily-sum-label">⚡ ExtraPower Card</div>
        <div class="daily-sum-val" style="color:var(--text)">${fmtRs(totalExtraPower)}</div>
      </div>
      <div class="daily-sum-item">
        <div class="daily-sum-label">📒 Credit / Party</div>
        <div class="daily-sum-val" style="color:var(--text)">${fmtRs(totalCredit)}</div>
      </div>
      ${allOtherItems.length ? allOtherItems.map(oi => `
      <div class="daily-sum-item">
        <div class="daily-sum-label">📋 ${oi.name}</div>
        <div class="daily-sum-val" style="color:var(--purple)">${fmtRs(oi.amount)}</div>
      </div>`).join('') : ''}
      ${totalOtherAmt > 0 ? `
      <div class="daily-sum-item">
        <div class="daily-sum-label">📋 Other Total</div>
        <div class="daily-sum-val" style="color:var(--purple)">${fmtRs(totalOtherAmt)}</div>
      </div>` : ''}
      <div class="daily-sum-item">
        <div class="daily-sum-label">💰 Total Collection</div>
        <div class="daily-sum-val" style="color:var(--accent)">${fmtRs(totalCollection)}</div>
      </div>
      <div class="daily-sum-item">
        <div class="daily-sum-label">⚖️ +/- Difference</div>
        <div class="daily-sum-val" style="color:${diffCls}">${totalDiff >= 0 ? '+' : ''}${fmtRs(totalDiff)}</div>
      </div>
    </div>

    <!-- Remarks per shift -->
    ${shifts.some(s => s.remarks) ? `
    <div class="daily-section-title">📝 Remarks</div>
    <div style="padding:12px 20px 16px">
      ${shifts.filter(s => s.remarks).map(s => `
      <div style="margin-bottom:8px;padding:10px 14px;background:rgba(255,255,255,0.03);border-radius:8px;border-left:3px solid var(--accent)">
        <span class="shift-badge ${s.shift === 'day' ? 'badge-day' : 'badge-night'}" style="margin-right:8px">${s.shift === 'day' ? '🌞 Day' : '🌙 Night'}</span>
        ${s.remarks}
      </div>`).join('')}
    </div>` : ''}
  </div>`;

  container.innerHTML = html;
}

// =====================
// SETTINGS
// =====================
function savePumpInfo() {
  state.pumpInfo = {
    name:    document.getElementById('setPumpName').value || 'My Petrol Pump',
    owner:   document.getElementById('setOwner').value,
    address: document.getElementById('setAddress').value,
    gst:     document.getElementById('setGST').value,
    contact: document.getElementById('setContact').value,
  };
  saveToStorage(true);
  updateSidebarPumpName();
  showToast('✅ Pump info saved!', 'success');
}

function saveRates() {
  state.rates.Petrol = parseFloat(document.getElementById('setRatePetrol').value) || 0;
  state.rates.Diesel = parseFloat(document.getElementById('setRateDiesel').value) || 0;
  saveToStorage(true);
  showToast('✅ Fuel rates saved!', 'success');
}

function renderSettingsForms() {
  // Pump Info
  setVal('setPumpName', state.pumpInfo.name);
  setVal('setOwner',    state.pumpInfo.owner);
  setVal('setAddress',  state.pumpInfo.address);
  setVal('setGST',      state.pumpInfo.gst);
  setVal('setContact',  state.pumpInfo.contact);
  // Rates
  setVal('setRatePetrol', state.rates.Petrol);
  setVal('setRateDiesel', state.rates.Diesel);
  
  // GitHub Settings
  if (state.githubSettings) {
    document.getElementById('setGHSyncEnabled').checked = state.githubSettings.enabled || false;
    setVal('setGHUsername', state.githubSettings.owner || '');
    setVal('setGHRepo',     state.githubSettings.repo || '');
    setVal('setGHToken',    state.githubSettings.token || '');
  }

  // Tanks & Nozzles
  renderTankConfigTable();
  renderNozzleConfigTable();
}

function saveGitHubSettings() {
  state.githubSettings = {
    enabled: document.getElementById('setGHSyncEnabled').checked,
    owner:   document.getElementById('setGHUsername').value.trim(),
    repo:    document.getElementById('setGHRepo').value.trim(),
    token:   document.getElementById('setGHToken').value.trim()
  };
  saveToStorage(true);
  showToast('✅ GitHub Sync settings saved!', 'success');
  
  if (state.githubSettings.enabled) {
    triggerManualGHSync();
  }
}

async function triggerManualGHSync() {
  if (!state.githubSettings.owner || !state.githubSettings.repo || !state.githubSettings.token) {
    showToast('❌ Please fill in GitHub details first.', 'error');
    return;
  }

  showToast('📡 Connecting to GitHub...', 'info');

  try {
    const res = await fetch(`${SERVER_URL}/api/github-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });

    if (res.ok) {
      showToast('🚀 GitHub Auto-Sync Successful!', 'success');
    } else {
      const data = await res.json();
      showToast(`❌ Sync Failed: ${data.error || 'Check details'}`, 'error');
    }
  } catch (e) {
    showToast('❌ Local server offline. Sync only works on PC!', 'error');
  }
}

// --- Tank Config ---
function addTankRow(tank) {
  const tbody = document.getElementById('tankConfigBody');
  const id = tank ? tank.id : Date.now();
  const tr = document.createElement('tr');
  tr.id = 'tank_row_' + id;
  tr.innerHTML = `
    <td><input type="text" class="inp-text" style="width:90px" id="tn_no_${id}" value="${tank ? tank.name.replace(/\D/g,'') || '' : ''}" placeholder="T1" /></td>
    <td>
      <select class="inp-select" id="tn_fuel_${id}">
        <option value="Petrol" ${(!tank || tank.fuel === 'Petrol') ? 'selected' : ''}>🔴 Petrol</option>
        <option value="Diesel" ${(tank && tank.fuel === 'Diesel') ? 'selected' : ''}>🟡 Diesel</option>
      </select>
    </td>
    <td><input type="number" class="inp-num" style="width:100px" id="tn_cap_${id}" value="${tank ? tank.capacity : ''}" placeholder="10000" /></td>
    <td><input type="number" class="inp-num" style="width:100px" id="tn_stk_${id}" value="${tank ? tank.stock : ''}" placeholder="0" /></td>
    <td><button class="btn-sm-del" onclick="removeTankRow(${id})">🗑️</button></td>
  `;
  tbody.appendChild(tr);
}

function removeTankRow(id) {
  const el = document.getElementById('tank_row_' + id);
  if (el) el.remove();
}

function renderTankConfigTable() {
  document.getElementById('tankConfigBody').innerHTML = '';
  state.tanks.forEach(t => addTankRow(t));
}

function saveTankConfig() {
  const tbody = document.getElementById('tankConfigBody');
  const rows  = tbody.querySelectorAll('tr[id^="tank_row_"]');
  const tanks = [];
  rows.forEach(tr => {
    const idStr = tr.id.replace('tank_row_', '');
    const id    = parseInt(idStr);
    const no    = document.getElementById(`tn_no_${idStr}`)?.value.trim() || '';
    const fuel  = document.getElementById(`tn_fuel_${idStr}`)?.value || 'Petrol';
    const cap   = parseFloat(document.getElementById(`tn_cap_${idStr}`)?.value) || 0;
    const stk   = parseFloat(document.getElementById(`tn_stk_${idStr}`)?.value) || 0;
    if (no) tanks.push({ id, name: `Tank ${no}`, fuel, capacity: cap, stock: stk });
  });
  state.tanks = tanks;
  saveToStorage(true);
  renderTankDipArea();
  updateDashboard();
  showToast(`✅ ${tanks.length} tanks saved!`, 'success');
}

// --- Nozzle Config ---
function addNozzleRow(nozzle) {
  const tbody = document.getElementById('nozzleConfigBody');
  const id    = nozzle ? nozzle.id : Date.now();
  const tr    = document.createElement('tr');
  tr.id = 'noz_row_' + id;
  const tankOptions = state.tanks.map(t =>
    `<option value="${t.id}" ${nozzle && nozzle.tankId === t.id ? 'selected' : ''}>${t.name} (${t.fuel})</option>`
  ).join('');
  tr.innerHTML = `
    <td><input type="text" class="inp-text" style="width:80px" id="nz_no_${id}" value="${nozzle ? nozzle.name.replace(/\D/g,'') : ''}" placeholder="1" /></td>
    <td><input type="text" class="inp-text" style="width:120px" id="nz_nm_${id}" value="${nozzle ? nozzle.name : ''}" placeholder="Nozzle 1" /></td>
    <td>
      <select class="inp-select" id="nz_fuel_${id}" onchange="updateNozzleRowTank(${id})">
        <option value="Petrol" ${(!nozzle || nozzle.fuel === 'Petrol') ? 'selected' : ''}>🔴 Petrol</option>
        <option value="Diesel" ${(nozzle && nozzle.fuel === 'Diesel') ? 'selected' : ''}>🟡 Diesel</option>
      </select>
    </td>
    <td>
      <select class="inp-select" id="nz_tank_${id}">
        <option value="">—</option>
        ${tankOptions}
      </select>
    </td>
    <td><button class="btn-sm-del" onclick="removeNozzleRow(${id})">🗑️</button></td>
  `;
  tbody.appendChild(tr);
}

function removeNozzleRow(id) {
  const el = document.getElementById('noz_row_' + id);
  if (el) el.remove();
}

function renderNozzleConfigTable() {
  document.getElementById('nozzleConfigBody').innerHTML = '';
  state.nozzles.forEach(n => addNozzleRow(n));
}

function updateNozzleRowTank(id) {
  const fuel = document.getElementById(`nz_fuel_${id}`)?.value;
  const sel  = document.getElementById(`nz_tank_${id}`);
  if (!sel) return;
  const matching = state.tanks.filter(t => t.fuel === fuel);
  sel.innerHTML = '<option value="">—</option>' +
    matching.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}

function saveNozzleConfig() {
  const tbody = document.getElementById('nozzleConfigBody');
  const rows  = tbody.querySelectorAll('tr[id^="noz_row_"]');
  const nozzles = [];
  rows.forEach(tr => {
    const idStr  = tr.id.replace('noz_row_', '');
    const id     = parseInt(idStr);
    const name   = document.getElementById(`nz_nm_${idStr}`)?.value.trim() || '';
    const fuel   = document.getElementById(`nz_fuel_${idStr}`)?.value || 'Petrol';
    const tankId = parseInt(document.getElementById(`nz_tank_${idStr}`)?.value) || null;
    if (name) nozzles.push({ id, name, fuel, tankId });
  });
  state.nozzles = nozzles;
  saveToStorage(true);
  renderNozzleEntryTable();
  showToast(`✅ ${nozzles.length} nozzles saved!`, 'success');
}

// =====================
// DATA EXPORT / IMPORT
// =====================
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `pumppro_backup_${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📤 Data exported!', 'success');
}

function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const imported = JSON.parse(ev.target.result);
      if (confirm('This will REPLACE all current data. Continue?')) {
        state = imported;
        saveToStorage(true);
        renderSettingsForms();
        renderNozzleEntryTable();
        renderTankDipArea();
        updateDashboard();
        showToast('📥 Data imported successfully!', 'success');
      }
    } catch {
      showToast('❌ Invalid file format.', 'error');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function clearAllData() {
  if (confirm('⚠️ This will delete ALL data permanently. Are you sure?')) {
    if (confirm('Second confirmation: DELETE everything?')) {
      localStorage.removeItem('pumppro_data');
      location.reload();
    }
  }
}

// =====================
// PRINT
// =====================
function printSection(sectionId) {
  const el = document.getElementById(sectionId);
  if (!el) { window.print(); return; }

  // Set pump header
  const n1 = document.getElementById('printPumpName2');
  const a1 = document.getElementById('printPumpAddr2');
  if (n1) n1.textContent = state.pumpInfo.name;
  if (a1) a1.textContent = state.pumpInfo.address;

  const isDsr = sectionId === 'dsrReportPrint';

  const printWin = window.open('', '_blank');
  printWin.document.write(`
    <html><head>
      <title>${state.pumpInfo.name} - Report</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; margin: 15px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: center; }
        th { background: #f0f0f0; font-size: 10px; text-transform: uppercase; }
        .card { border: 1px solid #ddd; border-radius: 6px; margin-bottom: 16px; overflow: hidden; }
        .card-hdr { background: #f8f8f8; padding: 8px 12px; font-weight: bold; border-bottom: 1px solid #ddd; display:flex; justify-content:space-between; align-items:center; }
        .daily-summary-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; padding: 12px; }
        .daily-sum-item { border: 1px solid #ddd; border-radius: 5px; padding: 8px; text-align: center; }
        .daily-sum-label { font-size: 9px; color: #666; text-transform: uppercase; }
        .daily-sum-val { font-size: 15px; font-weight: bold; }
        .daily-section-title { font-weight: bold; font-size: 11px; padding: 8px 12px; border-bottom: 1px solid #eee; background: #fafafa; text-transform: uppercase; }
        .tfoot-row td { background: #f0f0f0; font-weight: bold; }
        .rpt-topbar, .btn-print, .btn-ghost, .btn-save, .btn-primary, .filter-row, .pdf-btn-group { display: none !important; }
        h2 { margin: 0 0 4px; font-size: 18px; }
        h3 { margin: 0; font-size: 14px; color: #555; }
        .print-header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 12px; }
        
        /* DSR print specifics */
        .dsr-split-layout { display: flex; flex-direction: row; gap: 15px; width: 100%; }
        .dsr-col { flex: 1; min-width: 0; border: 1px solid #ccc; border-radius: 4px; overflow: hidden; }
        .dsr-table { width: 100%; border-collapse: collapse; font-size: 9px; }
        .dsr-table th, .dsr-table td { padding: 4px 3px; text-align: center; border: 1px solid #ccc; }
        .dsr-title { font-weight: bold; font-size: 11px; padding: 6px; text-align: center; border-bottom: 1px solid #ccc; }
        .dsr-title.petrol-title { background: #ffebeb; color: #cc0000; }
        .dsr-title.diesel-title { background: #fff8eb; color: #b38600; }
      </style>
      ${isDsr ? '<style>@page { size: landscape; margin: 10mm; }</style>' : ''}
    </head><body>
      <div class="print-header">
        <h2>${state.pumpInfo.name}</h2>
        <p>${state.pumpInfo.address}</p>
        <h3>Report — Printed: ${new Date().toLocaleString('en-IN')}</h3>
      </div>
      ${el.innerHTML}
    </body></html>
  `);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); }, 400);
}

// =====================
// TOAST
// =====================
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 3000);
}

// =====================================================================
// PDF GENERATION
// =====================================================================

// ── Shared PDF header ─────────────────────────────────────────────────
function pdfHeader(doc, title, subtitle) {
  const pumpName = state.pumpInfo.name    || 'Petrol Pump';
  const address  = state.pumpInfo.address || '';
  const contact  = state.pumpInfo.contact || '';
  const gst      = state.pumpInfo.gst     || '';
  const W = doc.internal.pageSize.getWidth();

  // Top gradient bar
  doc.setFillColor(22, 35, 80);
  doc.rect(0, 0, W, 30, 'F');

  // Pump name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(pumpName, W / 2, 12, { align: 'center' });

  // Address / contact line
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 200, 255);
  let sub = [address, contact ? 'Ph: ' + contact : '', gst ? 'GST: ' + gst : ''].filter(Boolean).join('  |  ');
  if (sub) doc.text(sub, W / 2, 20, { align: 'center' });

  // Report title bar
  doc.setFillColor(240, 244, 255);
  doc.rect(0, 30, W, 12, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(22, 35, 80);
  doc.text(title, 14, 38);
  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 140);
    doc.text(subtitle, W - 14, 38, { align: 'right' });
  }

  // Thin accent line
  doc.setDrawColor(79, 141, 255);
  doc.setLineWidth(0.5);
  doc.line(0, 42, W, 42);

  return 48; // Y position after header
}

// ── Section heading inside PDF ────────────────────────────────────────
function pdfSection(doc, y, text) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(230, 237, 255);
  doc.rect(10, y, W - 20, 8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(22, 35, 80);
  doc.text(text, 14, y + 5.5);
  return y + 10;
}

// ── Summary box (key-value grid) ─────────────────────────────────────
function pdfSummaryBox(doc, y, items, cols = 3) {
  const W   = doc.internal.pageSize.getWidth();
  const bw  = (W - 20) / cols;
  const bh  = 14;
  doc.setFontSize(8);

  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x   = 10 + col * bw;
    const by  = y + row * (bh + 2);

    doc.setFillColor(248, 250, 255);
    doc.setDrawColor(200, 210, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, by, bw - 2, bh, 1, 1, 'FD');

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 110, 150);
    doc.text(item.label, x + 3, by + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(item.color ? item.color[0] : 22, item.color ? item.color[1] : 35, item.color ? item.color[2] : 80);
    doc.setFontSize(10);
    doc.text(item.value, x + 3, by + 11);
    doc.setFontSize(8);
    doc.setTextColor(22, 35, 80);
  });

  const rows = Math.ceil(items.length / cols);
  return y + rows * (bh + 2) + 4;
}

// ── Helper to calculate tank stocks chronologically up to a specific shift ──
function getShiftTankStocks(shift) {
  const sortedShifts = [...state.shifts].sort((a,b) => {
    const dComp = a.date.localeCompare(b.date);
    if (dComp !== 0) return dComp;
    return a.shift.localeCompare(b.shift);
  });

  const running = {};
  state.tanks.forEach(t => {
    running[t.id] = t.stock || 0;
  });

  let targetStocks = null;
  for (let s of sortedShifts) {
    const shiftStocks = {};
    state.tanks.forEach(tank => {
      const open = running[tank.id];
      
      const tData = s.tanks ? s.tanks.find(t => t.tankId === tank.id) : null;
      const purchase = tData ? (tData.purchaseQty || 0) : 0;

      let sales = 0;
      s.nozzles.filter(n => n.tankId === tank.id).forEach(n => {
        sales += Math.max(0, Math.floor(n.closing) - Math.floor(n.opening) - (n.testing || 0));
      });

      const calculatedClosing = open + purchase - sales;
      const physicalDip = tData ? tData.closingStock : null;
      const closing = physicalDip !== null && physicalDip !== undefined ? physicalDip : calculatedClosing;
      const diff = closing - calculatedClosing;

      running[tank.id] = closing;

      shiftStocks[tank.id] = { open, purchase, sales, closing, diff };
    });

    if (s.id === shift.id) {
      targetStocks = shiftStocks;
      break;
    }
  }
  return targetStocks;
}

// ══════════════════════════════════════════════════════════════════════
// 1. SHIFT-WISE PDF  (Nozzle + Tank Stock + Cash)
// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// 1. SHIFT-WISE PDF  (Nozzle + Tank Stock + Cash)
// ══════════════════════════════════════════════════════════════════════
function generateShiftPDF() {
  const date = document.getElementById('dailyDate').value;
  if (!date) { showToast('Select a date first.', 'error'); return; }

  const shifts = state.shifts.filter(s => s.date === date).sort((a, b) => a.shift.localeCompare(b.shift));
  if (!shifts.length) { showToast('No shift data for selected date.', 'error'); return; }

  // Check jsPDF available
  if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    showToast('PDF library not loaded. Open via START_PUMPPRO.bat.', 'error'); return;
  }
  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();

  const printedOn = new Date().toLocaleString('en-IN');
  let y = pdfHeader(doc, 'SHIFT-WISE REPORT', `Date: ${fmtDate(date)}  |  Printed: ${printedOn}`);

  // PDF specific currency formatter to avoid character encoding issues with Indian Rupee symbol
  const fmtRsPDF = (val) => 'Rs. ' + fmtNum(val);

  // ── Aggregate totals across all shifts ──────────────────────────────
  let grandPetrolL = 0, grandDieselL = 0, grandSalesRs = 0, grandCollection = 0, grandDiff = 0;
  shifts.forEach(s => {
    s.nozzles.forEach(n => {
      if (n.fuel === 'Petrol') grandPetrolL += n.sale;
      if (n.fuel === 'Diesel') grandDieselL += n.sale;
      grandSalesRs += n.amount;
    });
    grandCollection += s.cash.totalCollection || 0;
    grandDiff       += s.cash.diff || 0;
  });

  // Day Summary boxes
  y = pdfSection(doc, y, 'DAY SUMMARY');
  y = pdfSummaryBox(doc, y, [
    { label: 'Petrol Sales',      value: fmtNum(grandPetrolL) + ' L',  color: [200, 50, 50] },
    { label: 'Diesel Sales',      value: fmtNum(grandDieselL) + ' L',  color: [180, 120, 0] },
    { label: 'Total Sales (L)',   value: fmtNum(grandPetrolL + grandDieselL) + ' L', color: [0, 130, 80] },
    { label: 'Total Sales (Rs)', value: fmtRsPDF(grandSalesRs),   color: [0, 130, 80] },
    { label: 'Total Collection', value: fmtRsPDF(grandCollection), color: [30, 80, 200] },
    { label: '+/- Difference',   value: (grandDiff >= 0 ? '+' : '') + fmtRsPDF(grandDiff),
      color: grandDiff >= 0 ? [0, 130, 80] : [200, 50, 50] },
  ], 3);

  // ── Each shift ───────────────────────────────────────────────────────
  shifts.forEach(shift => {
    const shiftLabel = shift.shift === 'day' ? 'DAY SHIFT (6AM - 6PM)' : 'NIGHT SHIFT (6PM - 6AM)';
    y += 4;
    y = pdfSection(doc, y, `${shiftLabel} - NOZZLE READINGS`);

    // Nozzle table with decimal values (no thousands comma formatting)
    const nzHead = [['Nozzle', 'Fuel', 'Opening', 'Closing', 'Sale (L)', 'Rate (Rs)', 'Amount (Rs)']];
    const nzRows = shift.nozzles.map(n => [
      n.nozzleName, n.fuel,
      fmtNum(n.opening, 2), fmtNum(n.closing, 2),
      fmtNum(n.sale, 2),
      fmtNum(n.rate, 2), fmtRsPDF(n.amount),
    ]);

    // Totals row
    const shiftTotalL  = shift.nozzles.reduce((s, n) => s + n.sale, 0);
    const shiftTotalRs = shift.nozzles.reduce((s, n) => s + n.amount, 0);
    nzRows.push(['', '', '', 'TOTAL', fmtNum(shiftTotalL, 2), '', fmtRsPDF(shiftTotalRs)]);

    doc.autoTable({
      startY: y,
      head: nzHead,
      body: nzRows,
      theme: 'grid',
      styles: { fontSize: 8, cellPadding: 2.5, textColor: [30, 30, 60] },
      headStyles: { fillColor: [22, 35, 80], textColor: 255, fontStyle: 'bold', fontSize: 8 },
      alternateRowStyles: { fillColor: [248, 250, 255] },
      foot: [],
      didDrawRow: (data) => {
        // Bold last row (total)
        if (data.row.index === nzRows.length - 1) {
          data.row.cells && Object.values(data.row.cells).forEach(cell => {
            if (cell.raw !== '') {
              doc.setFont('helvetica', 'bold');
            }
          });
        }
      },
      margin: { left: 10, right: 10 },
    });
    y = doc.lastAutoTable.finalY + 4;

    // Tank Stock for this shift (Full details included!)
    const shiftStocks = getShiftTankStocks(shift);
    if (shiftStocks) {
      y = pdfSection(doc, y, 'TANK STOCK SUMMARY');
      const tkHead = [['Tank', 'Fuel', 'Opening (L)', 'Purchase/Supply (L)', 'Sales (L)', 'Closing Stock (L)', '+/- Diff']];
      const tkRows = state.tanks.map(tank => {
        const ts = shiftStocks[tank.id] || { open: 0, purchase: 0, sales: 0, closing: 0, diff: 0 };
        const diffSign = ts.diff >= 0 ? '+' : '';
        return [
          tank.name,
          tank.fuel,
          fmtNum(ts.open, 0),
          fmtNum(ts.purchase, 0),
          fmtNum(ts.sales, 0),
          fmtNum(ts.closing, 0),
          diffSign + fmtNum(ts.diff, 0)
        ];
      });

      doc.autoTable({
        startY: y,
        head: tkHead,
        body: tkRows,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5, textColor: [30, 30, 60] },
        headStyles: { fillColor: [40, 80, 160], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [248, 250, 255] },
        margin: { left: 10, right: 10 },
      });
      y = doc.lastAutoTable.finalY + 4;
    }

    // Cash Collection for this shift
    y = pdfSection(doc, y, 'CASH COLLECTION');
    const cashItems = [
      { label: 'Cash',           value: fmtRsPDF(shift.cash.cash   || 0) },
      { label: 'Card',           value: fmtRsPDF(shift.cash.card   || 0) },
      { label: 'UPI',            value: fmtRsPDF(shift.cash.upi    || 0) },
      { label: 'ExtraPower Card',value: fmtRsPDF(shift.cash.extraPower || 0) },
      { label: 'Credit / Party', value: fmtRsPDF(shift.cash.credit || 0) },
    ];
    // Add named other items
    if (shift.cash.otherItems && shift.cash.otherItems.length) {
      shift.cash.otherItems.forEach(oi => {
        cashItems.push({ label: oi.name, value: fmtRsPDF(oi.amount) });
      });
    } else if (shift.cash.other) {
      cashItems.push({ label: 'Other', value: fmtRsPDF(shift.cash.other) });
    }
    cashItems.push({ label: 'Total Collection', value: fmtRsPDF(shift.cash.totalCollection || 0), bold: true });
    cashItems.push({ label: 'Total Sales',       value: fmtRsPDF(shift.cash.totalSales      || 0), bold: true });
    const diff = shift.cash.diff || 0;
    cashItems.push({ label: '+/- Difference', value: (diff >= 0 ? '+' : '') + fmtRsPDF(diff), bold: true,
      color: diff >= 0 ? [0, 130, 80] : [200, 50, 50] });

    doc.autoTable({
      startY: y,
      body: cashItems.map(ci => [ci.label, ci.value]),
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 2.5, textColor: [30, 30, 60] },
      columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right', fontStyle: 'bold' } },
      alternateRowStyles: { fillColor: [248, 250, 255] },
      margin: { left: 10, right: 10 },
    });
    y = doc.lastAutoTable.finalY + 4;

    // Remarks
    if (shift.remarks) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(100, 100, 140);
      doc.text('Remarks: ' + shift.remarks, 14, y);
      y += 6;
    }

    // Force a new page for each shift so Day Shift is on Page 1 and Night Shift is on Page 2
    if (shifts.indexOf(shift) < shifts.length - 1) {
      doc.addPage();
      y = pdfHeader(doc, 'SHIFT-WISE REPORT', `Date: ${fmtDate(date)}  |  Printed: ${printedOn}`);
    }
  });

  // ── Page numbers ─────────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 180);
    doc.text(`Page ${p} of ${totalPages}  |  ${state.pumpInfo.name}  |  Generated: ${printedOn}`,
      W / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }

  doc.save(`ShiftReport_${date}.pdf`);
  showToast('📄 Shift-wise PDF downloaded!', 'success');
}

// ══════════════════════════════════════════════════════════════════════
// 2. DAILY SALES SUMMARY PDF  (Date-wise clean summary)
// ══════════════════════════════════════════════════════════════════════
function generateDailySalesPDF() {
  const from = document.getElementById('dailyFrom').value || document.getElementById('dailyDate').value;
  const to   = document.getElementById('dailyTo').value   || document.getElementById('dailyDate').value;
  if (!from) { showToast('Select a date or date range first.', 'error'); return; }

  if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    showToast('PDF library not loaded. Open via START_PUMPPRO.bat.', 'error'); return;
  }
  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const printedOn = new Date().toLocaleString('en-IN');

  let y = pdfHeader(doc,
    'DAILY SALES SUMMARY REPORT',
    `Period: ${fmtDate(from)} to ${fmtDate(to)}  |  Printed: ${printedOn}`
  );

  // PDF specific currency formatter
  const fmtRsPDF = (val) => 'Rs. ' + fmtNum(val);

  // ── Build date-wise summary ─────────────────────────────────────────
  const dates = [];
  let cur = new Date(from);
  const end = new Date(to);
  while (cur <= end) { dates.push(cur.toISOString().slice(0, 10)); cur.setDate(cur.getDate() + 1); }

  const tableHead = [[
    'Date', 'Shift', 'Petrol (L)', 'Petrol (Rs)',
    'Diesel (L)', 'Diesel (Rs)', 'Total Sales (Rs)', 'Collection (Rs)', '+/- (Rs)'
  ]];
  const tableRows = [];

  let grandPL = 0, grandPRs = 0, grandDL = 0, grandDRs = 0;
  let grandSales = 0, grandColl = 0, grandDiff = 0;

  dates.forEach(date => {
    const dayShifts = state.shifts.filter(s => s.date === date).sort((a, b) => a.shift.localeCompare(b.shift));
    if (!dayShifts.length) return;

    dayShifts.forEach(s => {
      let pL = 0, pRs = 0, dL = 0, dRs = 0;
      s.nozzles.forEach(n => {
        if (n.fuel === 'Petrol') { pL += n.sale;  pRs += n.amount; }
        if (n.fuel === 'Diesel') { dL += n.sale;  dRs += n.amount; }
      });
      const salesRs = s.cash.totalSales      || 0;
      const collRs  = s.cash.totalCollection || 0;
      const diffRs  = s.cash.diff            || 0;

      grandPL   += pL;  grandPRs  += pRs;
      grandDL   += dL;  grandDRs  += dRs;
      grandSales += salesRs; grandColl += collRs; grandDiff += diffRs;

      tableRows.push([
        fmtDate(date),
        s.shift === 'day' ? 'Day' : 'Night',
        fmtNum(pL), fmtRsPDF(pRs),
        fmtNum(dL), fmtRsPDF(dRs),
        fmtRsPDF(salesRs), fmtRsPDF(collRs),
        (diffRs >= 0 ? '+' : '') + fmtRsPDF(diffRs),
      ]);
    });
  });

  if (!tableRows.length) {
    showToast('No data for selected date range.', 'error'); return;
  }

  // Grand total row
  tableRows.push([
    'TOTAL', '—',
    fmtNum(grandPL), fmtRsPDF(grandPRs),
    fmtNum(grandDL), fmtRsPDF(grandDRs),
    fmtRsPDF(grandSales), fmtRsPDF(grandColl),
    (grandDiff >= 0 ? '+' : '') + fmtRsPDF(grandDiff),
  ]);

  doc.autoTable({
    startY: y,
    head: tableHead,
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [30, 30, 60], overflow: 'linebreak' },
    headStyles: { fillColor: [22, 35, 80], textColor: 255, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 255] },
    // Bold + colour last (grand total) row
    didParseCell: (data) => {
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [220, 230, 255];
        data.cell.styles.textColor = [22, 35, 80];
      }
      // Colour difference column
      if (data.column.index === 8 && data.row.section === 'body') {
        const v = data.cell.raw || '';
        data.cell.styles.textColor = v.startsWith('+') ? [0, 130, 80] : v.startsWith('-') ? [200, 50, 50] : [60, 60, 100];
      }
      // Colour shift column
      if (data.column.index === 1 && data.row.section === 'body') {
        data.cell.styles.textColor = data.cell.raw === 'Day' ? [180, 120, 0] : [80, 60, 180];
      }
    },
    margin: { left: 10, right: 10 },
  });

  y = doc.lastAutoTable.finalY + 8;

  // Grand summary boxes
  y = pdfSection(doc, y, 'GRAND TOTAL SUMMARY');
  y = pdfSummaryBox(doc, y, [
    { label: 'Total Petrol Sold',  value: grandPL + ' L',      color: [200, 50, 50] },
    { label: 'Petrol Revenue',     value: fmtRsPDF(grandPRs),     color: [200, 50, 50] },
    { label: 'Total Diesel Sold',  value: grandDL + ' L',      color: [180, 120, 0] },
    { label: 'Diesel Revenue',     value: fmtRsPDF(grandDRs),     color: [180, 120, 0] },
    { label: 'Total Sales',        value: fmtRsPDF(grandSales),   color: [0, 130, 80] },
    { label: 'Total Collection',   value: fmtRsPDF(grandColl),    color: [30, 80, 200] },
    { label: '+/- Net Difference', value: (grandDiff >= 0 ? '+' : '') + fmtRsPDF(grandDiff),
      color: grandDiff >= 0 ? [0, 130, 80] : [200, 50, 50] },
  ], 3);

  // Page numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 180);
    doc.text(`Page ${p} of ${totalPages}  |  ${state.pumpInfo.name}  |  Generated: ${printedOn}`,
      W / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }

  doc.save(`DailySalesReport_${from}_to_${to}.pdf`);
  showToast('📊 Daily Sales PDF downloaded!', 'success');
}

function generateOtherItemsPDF() {
  const from = document.getElementById('dailyFrom').value || document.getElementById('dailyDate').value;
  const to   = document.getElementById('dailyTo').value   || document.getElementById('dailyDate').value;
  if (!from) { showToast('Select a date or date range first.', 'error'); return; }

  if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    showToast('PDF library not loaded. Open via START_PUMPPRO.bat.', 'error'); return;
  }
  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const printedOn = new Date().toLocaleString('en-IN');

  let y = pdfHeader(doc, 'OTHER ITEMS REPORT (EXPENSE / INCOME)', `Period: ${fmtDate(from)} to ${fmtDate(to)}  |  Printed: ${printedOn}`);

  // Fetch all shifts in date range
  const rangeShifts = state.shifts
    .filter(s => s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift));

  const tableHead = [['Date', 'Shift', 'Item / Expense / Income Name', 'Amount (Rs.)']];
  const tableRows = [];
  let grandTotal = 0;

  rangeShifts.forEach(s => {
    const shiftLabel = s.shift === 'day' ? 'Day' : 'Night';
    
    // Modern format: list of other items
    if (s.cash.otherItems && s.cash.otherItems.length) {
      s.cash.otherItems.forEach(oi => {
        const amt = parseFloat(oi.amount) || 0;
        if (oi.name.trim() !== '' && amt > 0) {
          tableRows.push([
            fmtDate(s.date),
            shiftLabel,
            oi.name,
            'Rs. ' + fmtNum(amt)
          ]);
          grandTotal += amt;
        }
      });
    } else if (s.cash.other && parseFloat(s.cash.other) > 0) {
      // Legacy format
      const amt = parseFloat(s.cash.other);
      tableRows.push([
        fmtDate(s.date),
        shiftLabel,
        'Other',
        'Rs. ' + fmtNum(amt)
      ]);
      grandTotal += amt;
    }
  });

  if (!tableRows.length) {
    showToast('No other items (expense/income) found for selected period.', 'info');
    return;
  }

  // Add Grand Total row
  tableRows.push([
    'TOTAL',
    '',
    '',
    'Rs. ' + fmtNum(grandTotal)
  ]);

  doc.autoTable({
    startY: y,
    head: tableHead,
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 2.5, textColor: [30, 30, 60] },
    headStyles: { fillColor: [142, 68, 173], textColor: 255, fontStyle: 'bold', fontSize: 8.5 }, // Purple theme
    alternateRowStyles: { fillColor: [250, 243, 253] },
    didParseCell: (data) => {
      // Bold grand total row
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [243, 229, 245];
        data.cell.styles.textColor = [142, 68, 173];
      }
    },
    margin: { left: 15, right: 15 },
  });

  // Page numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 180);
    doc.text(`Page ${p} of ${totalPages}  |  ${state.pumpInfo.name}  |  Generated: ${printedOn}`,
      W / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }

  doc.save(`OtherItemsReport_${from}_to_${to}.pdf`);
  showToast('📄 Other Items PDF downloaded!', 'success');
}

function generateCollectionPDF() {
  const from = document.getElementById('dailyFrom').value || document.getElementById('dailyDate').value;
  const to   = document.getElementById('dailyTo').value   || document.getElementById('dailyDate').value;
  if (!from) { showToast('Select a date or date range first.', 'error'); return; }

  if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    showToast('PDF library not loaded. Open via START_PUMPPRO.bat.', 'error'); return;
  }
  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const printedOn = new Date().toLocaleString('en-IN');

  let y = pdfHeader(doc, 'CASH COLLECTION BREAKDOWN REPORT', `Period: ${fmtDate(from)} to ${fmtDate(to)}  |  Printed: ${printedOn}`);

  // Fetch shifts in date range
  const rangeShifts = state.shifts
    .filter(s => s.date >= from && s.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.shift.localeCompare(b.shift));

  const tableHead = [['Date', 'Shift', 'Cash (Rs.)', 'Card (Rs.)', 'UPI (Rs.)', 'ExtraPower', 'Credit/Party', 'Other', 'Total (Rs.)']];
  const tableRows = [];

  let grandCash = 0, grandCard = 0, grandUPI = 0, grandEP = 0, grandCredit = 0, grandOther = 0, grandTotal = 0;

  rangeShifts.forEach(s => {
    const shiftLabel = s.shift === 'day' ? 'Day' : 'Night';
    const cash = parseFloat(s.cash.cash) || 0;
    const card = parseFloat(s.cash.card) || 0;
    const upi = parseFloat(s.cash.upi) || 0;
    const extraPower = parseFloat(s.cash.extraPower) || 0;
    const credit = parseFloat(s.cash.credit) || 0;
    const other = parseFloat(s.cash.otherTotal || s.cash.other) || 0;
    const total = parseFloat(s.cash.totalCollection) || 0;

    tableRows.push([
      fmtDate(s.date),
      shiftLabel,
      fmtNum(cash, 2),
      fmtNum(card, 2),
      fmtNum(upi, 2),
      fmtNum(extraPower, 2),
      fmtNum(credit, 2),
      fmtNum(other, 2),
      fmtNum(total, 2)
    ]);

    grandCash += cash;
    grandCard += card;
    grandUPI += upi;
    grandEP += extraPower;
    grandCredit += credit;
    grandOther += other;
    grandTotal += total;
  });

  if (!tableRows.length) {
    showToast('No shift records found for selected period.', 'info');
    return;
  }

  // Add Grand Total row
  tableRows.push([
    'TOTAL',
    '',
    fmtNum(grandCash, 2),
    fmtNum(grandCard, 2),
    fmtNum(grandUPI, 2),
    fmtNum(grandEP, 2),
    fmtNum(grandCredit, 2),
    fmtNum(grandOther, 2),
    fmtNum(grandTotal, 2)
  ]);

  doc.autoTable({
    startY: y,
    head: tableHead,
    body: tableRows,
    theme: 'grid',
    styles: { fontSize: 7.5, cellPadding: 2.2, textColor: [30, 30, 60] },
    headStyles: { fillColor: [26, 188, 156], textColor: 255, fontStyle: 'bold', fontSize: 8 }, // Teal theme
    alternateRowStyles: { fillColor: [240, 252, 249] },
    didParseCell: (data) => {
      // Bold grand total row
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [209, 242, 235];
        data.cell.styles.textColor = [22, 100, 85];
      }
    },
    margin: { left: 10, right: 10 },
  });

  // Page numbers
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 180);
    doc.text(`Page ${p} of ${totalPages}  |  ${state.pumpInfo.name}  |  Generated: ${printedOn}`,
      W / 2, doc.internal.pageSize.getHeight() - 6, { align: 'center' });
  }

  doc.save(`CollectionReport_${from}_to_${to}.pdf`);
  showToast('📄 Collection PDF downloaded!', 'success');
}
