import { initTheme } from './theme.js';
import { onRoute, init as initRouter } from './router.js';
import { renderHome } from './home.js';
import { renderEditor, flushSave } from './editor.js';
import { openSettings } from './settings.js';
import { getUsername, setUsername, sanitizeUsername, isValidUsername } from './auth.js';
import { initSync, syncFromCloud } from './store.js';

const viewLogin  = document.getElementById('view-login');
const viewHome   = document.getElementById('view-home');
const viewEditor = document.getElementById('view-editor');
const syncDot    = document.getElementById('sync-dot');
const cardGrid   = document.getElementById('card-grid');

let currentView     = null;
let currentParentId = null;
let _lastSyncTime   = 0;
const SYNC_COOLDOWN  = 5000; // ms — minimum gap between auto-syncs

// ─── View switching ───────────────────────────────────────────────────────────

function showView(name) {
  if (currentView === 'editor' && name !== 'editor') {
    flushSave();
  }
  viewLogin .classList.toggle('active', name === 'login');
  viewHome  .classList.toggle('active', name === 'home');
  viewEditor.classList.toggle('active', name === 'editor');
  currentView = name;
}

// ─── Sync dot helpers ─────────────────────────────────────────────────────────

function setSyncDot(state) {
  if (!syncDot) return;
  syncDot.className = 'sync-dot' + (state ? ` ${state}` : '');
}

// ─── Main app (post-login) ────────────────────────────────────────────────────

function initApp(username) {
  initSync(username);
  initTheme();

  onRoute(({ name, params }) => {
    if (name === 'home') {
      currentParentId = null;
      showView('home');
      renderHome(null);
    } else if (name === 'folder') {
      currentParentId = params[0];
      showView('home');
      renderHome(params[0]);
    } else if (name === 'note') {
      showView('editor');
      renderEditor(params[0]);
    }
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    openSettings(username, () => renderHome(currentParentId));
  });

  initRouter();

  // ── Shared sync helper (used by initial load, visibility, and pull-to-refresh)
  async function doSync() {
    const now = Date.now();
    if (now - _lastSyncTime < SYNC_COOLDOWN) return;
    _lastSyncTime = now;

    setSyncDot('syncing');
    try {
      await syncFromCloud();
      setSyncDot('synced');
      if (currentView === 'home') renderHome(currentParentId);
      setTimeout(() => setSyncDot(''), 2000);
    } catch {
      setSyncDot('error');
      setTimeout(() => setSyncDot(''), 3000);
    }
  }

  // Initial sync on load
  doSync();

  // ── Sync when app regains focus (tab switch, phone wake, etc.) ──
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') doSync();
  });

  // ── Pull-to-refresh on the card grid ──
  initPullToRefresh(cardGrid, doSync);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
}

// ─── Login flow ───────────────────────────────────────────────────────────────

function initLogin() {
  showView('login');

  const usernameInput = document.getElementById('login-username');
  const loginBtn      = document.getElementById('login-btn');
  const errorEl       = document.getElementById('login-error');

  usernameInput.addEventListener('input', () => {
    const raw       = usernameInput.value;
    const sanitized = sanitizeUsername(raw);
    const valid     = isValidUsername(sanitized);
    const hasInput  = raw.length > 0;

    usernameInput.classList.toggle('valid',   valid && hasInput);
    usernameInput.classList.toggle('invalid', !valid && hasInput);
    loginBtn.disabled = !valid;
    errorEl.textContent = '';
  });

  usernameInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !loginBtn.disabled) loginBtn.click();
  });

  loginBtn.addEventListener('click', () => {
    const sanitized = sanitizeUsername(usernameInput.value);
    if (!isValidUsername(sanitized)) {
      errorEl.textContent = 'Use 2–30 letters, numbers, hyphens, or underscores';
      return;
    }
    setUsername(sanitized);
    initApp(sanitized);
  });

  // Auto-focus after animation
  setTimeout(() => usernameInput.focus(), 300);
}

// ─── Pull-to-refresh ──────────────────────────────────────────────────────────

function initPullToRefresh(scrollEl, onRefresh) {
  const THRESHOLD = 80;   // px pull distance to trigger
  let startY   = 0;
  let pulling  = false;
  let indicator = null;

  // Lazily create the indicator element
  function getIndicator() {
    if (!indicator) {
      indicator = document.getElementById('pull-indicator');
    }
    return indicator;
  }

  scrollEl.addEventListener('touchstart', (e) => {
    if (scrollEl.scrollTop > 0) return; // only when scrolled to top
    startY  = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  scrollEl.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - startY;
    if (dy < 0) { pulling = false; return; }

    const el = getIndicator();
    const progress = Math.min(dy / THRESHOLD, 1);
    el.style.opacity = progress;
    el.style.transform = `translateX(-50%) translateY(${Math.min(dy * 0.4, 50)}px) rotate(${progress * 360}deg)`;
    el.classList.toggle('ready', progress >= 1);
  }, { passive: true });

  scrollEl.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;

    const el = getIndicator();
    const isReady = el.classList.contains('ready');
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(0)';
    el.classList.remove('ready');

    if (isReady) onRefresh();
  }, { passive: true });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const username = getUsername();
if (username) {
  initApp(username);
} else {
  initLogin();
}
