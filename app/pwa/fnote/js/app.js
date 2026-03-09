import { initTheme } from './theme.js';
import { onRoute, init as initRouter } from './router.js';
import { renderHome } from './home.js';
import { renderEditor, flushSave } from './editor.js';
import { openSettings } from './settings.js';
import { getUsername, setUsername, sanitizeUsername, isValidUsername, clearUsername, getRecentUsernames, removeRecentUsername } from './auth.js';
import { initSync, syncFromCloud } from './store.js';
import { modalConfirm } from './modal.js';

const viewLogin  = document.getElementById('view-login');
const viewHome   = document.getElementById('view-home');
const viewEditor = document.getElementById('view-editor');
const syncDot    = document.getElementById('sync-dot');

let currentView     = null;
let currentParentId = null;

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

  // ── User chip + popup ────────────────────────────────────────────────────
  const btnUser       = document.getElementById('btn-user');
  const userPopup     = document.getElementById('user-popup');
  const userLogoutBtn = document.getElementById('user-logout-btn');

  btnUser.textContent = `@${username}`;
  btnUser.title       = `@${username}`;
  btnUser.hidden      = false;

  // Build / rebuild the recent-users section of the popup
  function renderUserPopup() {
    document.getElementById('user-popup-name').textContent = `@${username}`;
    const recentsEl = document.getElementById('user-popup-recents');
    recentsEl.innerHTML = '';

    const others = getRecentUsernames().filter(u => u !== username);
    if (others.length === 0) return;

    const label = document.createElement('div');
    label.className = 'user-popup-recents-label';
    label.textContent = 'Switch to';
    recentsEl.appendChild(label);

    others.forEach(name => {
      const row = document.createElement('div');
      row.className = 'user-popup-recent-item';

      const nameBtn = document.createElement('button');
      nameBtn.className = 'user-popup-recent-name';
      nameBtn.textContent = `@${name}`;
      nameBtn.addEventListener('click', () => {
        setUsername(name);   // also adds to recents list
        location.reload();
      });

      const rmBtn = document.createElement('button');
      rmBtn.className = 'user-popup-recent-rm';
      rmBtn.textContent = '×';
      rmBtn.title = `Remove @${name} from history`;
      rmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeRecentUsername(name);
        renderUserPopup();
      });

      row.appendChild(nameBtn);
      row.appendChild(rmBtn);
      recentsEl.appendChild(row);
    });
  }

  btnUser.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = userPopup.hidden;
    userPopup.hidden = !opening;
    if (opening) renderUserPopup();  // refresh list each time it opens
  });

  userLogoutBtn.addEventListener('click', async () => {
    userPopup.hidden = true;
    const ok = await modalConfirm(
      'Your notes are saved to the cloud and will be here when you log back in.',
      'Switch User?'
    );
    if (ok) { clearUsername(); location.reload(); }
  });

  // Close popup when clicking anywhere else
  document.addEventListener('click', () => { userPopup.hidden = true; });
  userPopup.addEventListener('click', (e) => e.stopPropagation());

  initRouter();

  // Background sync — update the dot and re-render home if it was visible
  setSyncDot('syncing');
  syncFromCloud().then(() => {
    setSyncDot('synced');
    if (currentView === 'home') renderHome(currentParentId);
    // Fade dot back to neutral after 2 s
    setTimeout(() => setSyncDot(''), 2000);
  }).catch(() => {
    setSyncDot('error');
    setTimeout(() => setSyncDot(''), 3000);
  });

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

// ─── Entry point ─────────────────────────────────────────────────────────────

const username = getUsername();
if (username) {
  initApp(username);
} else {
  initLogin();
}
