import { injectCss, setSoundSink, toast as showToast } from './dom.js';
import { createLoading } from './loading.js';
import { createMenu } from './menu.js';
import { createSettings } from './settings.js';
import { createProfile } from './profile.js';
import { mountKrayzeeAccount, setAccountVisible } from './account.js';
import { setCareer as useCareer, rankProgress } from './career.js';
import { hasProfile, loadProfile, loadSettings, liveryOf } from './store.js';

let hooks = {};
let root = null, loading = null, menu = null, settings = null, profile = null;
let state = 'loading', pendingPlay = null, quitting = false;

const SOON = {
  story: ['Story mode', 'The Royal Aero Club is still drafting the scandal. Coming soon.'],
  online: ['Online rooms', 'Rival peers are still polishing their monocles. Coming soon.'],
};

function syncAccount() {
  const popup = settings?.pop.isOpen ? 'settings' : profile?.pop.isOpen ? 'profile' : null;
  setAccountVisible(popup === 'settings' || (state !== 'game' && popup !== 'profile'));
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
    onQuit: () => { quitting = true; settings.pop.close(); quitting = false; showMenu(); hooks.onQuit?.(); },
    onClose: () => { syncAccount(); if (state === 'game' && !quitting) hooks.onResume?.(); },
  });
  profile = createProfile(root, {
    onSave: (p) => {
      menu.setProfile(p);
      hooks.onProfile?.(getProfile());
      const go = pendingPlay;
      pendingPlay = null;
      if (go) play(go);
    },
    onClose: (saved) => { if (!saved) pendingPlay = null; syncAccount(); },
  });
  menu.setProfile(loadProfile());
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (settings.pop.isOpen) settings.pop.close();
    else if (profile.pop.isOpen && profile.pop.closable) profile.pop.close();
    else if (state === 'game') openSettings();
  });
  mountKrayzeeAccount(() => state === 'menu' && !settings.pop.isOpen && !profile.pop.isOpen).then(syncAccount);
  syncAccount();
}

function play(mode) {
  if (!hasProfile()) { pendingPlay = mode; openProfile({ first: true }); return; }
  enterGameplay();
  hooks.onPlay?.(mode);
}

function menuAction(a) {
  if (a === 'free') play('free');
  else if (SOON[a]) showToast(root, ...SOON[a]);
  else if (a === 'profile' || a === 'hangar') openProfile();
  else if (a === 'settings') openSettings();
}

export function initUI(h) {
  hooks = h || {};
  if (hooks.career) useCareer(hooks.career);
  setSoundSink((kind) => hooks.onSound?.(kind));
  ensureRoot();
}

export function setLoading(fraction, label) {
  ensureRoot();
  loading?.set(fraction, label);
}

export function showMenu() {
  ensureRoot();
  const fromLoading = state === 'loading';
  state = 'menu';
  if (loading) { loading.set(1); loading.hide(); loading = null; }
  if (settings.pop.isOpen) settings.pop.close();
  menu.setProfile(loadProfile());
  menu.show(true);
  syncAccount();
  if (fromLoading && !hasProfile()) setTimeout(() => { if (state === 'menu' && !profile.pop.isOpen) openProfile({ first: true }); }, 1100);
}

export function enterGameplay() {
  ensureRoot();
  state = 'game';
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
    voice: p.voice, registration: p.registration, rank: p.rank, display: p.display, flightTitle: p.flightTitle, rankTitle: p.rankTitle };
}

export function setCareer(c) { useCareer(c); refreshProfile(); }
export function refreshProfile() { if (menu) menu.setProfile(loadProfile()); }
export function getRankProgress() { return rankProgress(loadProfile().gender); }

export function getLivery() { return liveryOf(loadProfile()); }

export function getSettings() { return loadSettings(); }

export function getUIState() {
  return { state, settings: !!settings?.pop.isOpen, profile: !!profile?.pop.isOpen, firstRun: !hasProfile() };
}
