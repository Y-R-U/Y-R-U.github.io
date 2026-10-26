import { injectCss, setSoundSink, toast as showToast } from './dom.js';
import { createLoading } from './loading.js';
import { createMenu } from './menu.js';
import { createSettings } from './settings.js';
import { createProfile } from './profile.js';
import { mountKrayzeeAccount, setAccountVisible } from './account.js';
import { setCareer as useCareer, rankProgress, career } from './career.js';
import { hasProfile, loadProfile, loadSettings, liveryOf } from './store.js';
import { aircraftLock, HANGAR } from './aircraft.js';

let hooks = {};
let root = null, loading = null, menu = null, settings = null, profile = null;
let state = 'loading', pendingPlay = null, quitting = false, onlineOn = false, lobbyOpen = false;

const SOON = {
  story: ['Story mode', 'The Royal Aero Club is still drafting the scandal. Coming soon.'],
  online: ['Online rooms', 'Rival peers are still polishing their monocles. Coming soon.'],
};

function syncAccount() {
  const popup = settings?.pop.isOpen ? 'settings' : profile?.pop.isOpen ? 'profile' : null;
  if (menu) menu.node.inert = !!popup || lobbyOpen; // PLAYTEST_2 B10: nothing under a popup or the lobby takes taps or focus
  setAccountVisible(popup === 'settings' || (state !== 'game' && !lobbyOpen && popup !== 'profile'));
}

function ensureRoot() {
  if (root) return;
  injectCss();
  root = document.createElement('div');
  root.id = 'kz-ui';
  document.body.append(root);
  loading = createLoading(root);
  menu = createMenu(root, menuAction);
  settings = createSettings(root, {
    onChange: (s) => hooks.onSettings?.(s),
    onTitle: () => { refreshProfile(); hooks.onProfile?.(getProfile()); },
    onResume: () => settings.pop.close(),
    onQuit: () => { const go = () => { quitting = true; settings.pop.close(); quitting = false; showMenu(); hooks.onQuit?.(); }; hooks.confirmQuit ? hooks.confirmQuit(go) : go(); },
    onClose: () => { syncAccount(); if (state === 'game' && !quitting) hooks.onResume?.(); },
  });
  profile = createProfile(root, {
    onSave: (p) => {
      paintPilot();
      hooks.onProfile?.(getProfile());
      const go = pendingPlay;
      pendingPlay = null;
      if (go === 'online') goOnline();
      else if (go) play(go);
    },
    onClose: (saved) => { if (!saved) pendingPlay = null; syncAccount(); },
    onAircraft: () => hooks.onSettings?.(loadSettings()),
  });
  paintPilot();
  import('./tasks.js').then((m) => m.mountTasks(root)).catch((e) => console.warn('[krayzee] tasks', e)); // TASKS (D34)
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (settings.pop.isOpen) settings.pop.close();
    else if (profile.pop.isOpen && profile.pop.closable) profile.pop.close();
    else if (state === 'game') openSettings();
  });
  mountKrayzeeAccount(() => state === 'menu' && !lobbyOpen && !settings.pop.isOpen && !profile.pop.isOpen).then(syncAccount);
  syncAccount();
}

function play(mode) {
  if (!hasProfile()) { pendingPlay = mode; openProfile({ first: true }); return; }
  enterGameplay();
  if (mode === 'story') hooks.onStory();
  else hooks.onPlay?.(mode);
}

// Online stays on the menu: GAMEPLAY's lobby overlay (z 40) covers it and calls showMenu() when it closes.
function goOnline() {
  if (!onlineOn || !hooks.onOnline) { showToast(root, ...SOON.online); return; }
  if (!hasProfile()) { pendingPlay = 'online'; openProfile({ first: true }); return; }
  lobbyOpen = true;
  syncAccount();
  hooks.onOnline();
}

function menuAction(a) {
  if (a === 'free') play('free');
  else if (a === 'story' && hooks.onStory) play('story');
  else if (a === 'intro' && hooks.onIntro) { enterGameplay(); hooks.onIntro(); }
  else if (a === 'online') goOnline();
  else if (SOON[a]) showToast(root, ...SOON[a]);
  else if (a === 'profile' || a === 'hangar') openProfile();
  else if (a === 'settings') openSettings();
}

export function initUI(h) {
  hooks = h || {};
  if (hooks.career) useCareer(hooks.career);
  setSoundSink((kind) => hooks.onSound?.(kind));
  ensureRoot();
  menu.setSoon('story', !hooks.onStory);
  menu.setIntro(!!hooks.onIntro);
}

export function setOnlineAvailable(on) {
  onlineOn = !!on;
  ensureRoot();
  menu.setSoon('online', !onlineOn);
}

export function setLoading(fraction, label) {
  ensureRoot();
  loading?.set(fraction, label);
}

export function showMenu() {
  ensureRoot();
  const fromLoading = state === 'loading';
  state = 'menu';
  lobbyOpen = false;
  if (loading) { loading.set(1); loading.hide(); loading = null; }
  if (settings.pop.isOpen) settings.pop.close();
  paintPilot();
  menu.show(true);
  syncAccount();
  if (fromLoading && !hasProfile()) setTimeout(() => { if (state === 'menu' && !profile.pop.isOpen) openProfile({ first: true }); }, 1100);
}

export function enterGameplay() {
  ensureRoot();
  state = 'game';
  lobbyOpen = false;
  if (loading) { loading.hide(); loading = null; }
  menu.show(false);
  if (settings.pop.isOpen) { quitting = true; settings.pop.close(); quitting = false; }
  if (profile.pop.isOpen) { profile.pop.closable = true; profile.pop.close(); }
  syncAccount();
}

export function openSettings() {
  ensureRoot();
  settings.open(state === 'game');
  syncAccount();
}

export function openProfile(opts) {
  ensureRoot();
  profile.open(opts);
  syncAccount();
}

export function toast(title, text, ms) { ensureRoot(); showToast(root, title, text, ms); }

export function getProfile() {
  const p = loadProfile();
  return { name: p.name, title: p.title, gender: p.gender, company: p.company, primary: p.primary, secondary: p.secondary, accent: p.accent,
    voice: p.voice, favourites: p.favourites.slice(), registration: p.registration, rank: p.rank, display: p.display, flightTitle: p.flightTitle, rankTitle: p.rankTitle };
}

export function setCareer(c) { useCareer(c); refreshProfile(); }
export function refreshProfile() { if (menu) paintPilot(); }
// No saved profile yet: a neutral "New pilot" card, never the default Baron Dirk (PLAYTEST_2 B10).
function paintPilot() { menu.setProfile(loadProfile(), !hasProfile()); }
export function getRankProgress() { return rankProgress(loadProfile().gender); }

// DESIGN §2: the Royal Bathtub's taps turn gold at Emperor.
export function getLivery() { return { ...liveryOf(loadProfile()), goldTaps: career().emperorEarned }; }

// Hangar unlocks (data/aircraft.js unlockRank; 'story' = campaign finished). Free Flight should only fly unlocked types.
export function aircraftUnlocked(type) { return HANGAR.includes(type) && !aircraftLock(type, loadProfile().gender); }
export function aircraftLockText(type) { return aircraftLock(type, loadProfile().gender)?.text || ''; }

export function getSettings() { return loadSettings(); }

export function getUIState() {
  return { state, lobby: lobbyOpen, online: onlineOn, settings: !!settings?.pop.isOpen, profile: !!profile?.pop.isOpen, firstRun: !hasProfile() };
}
