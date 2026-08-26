// The DOM screen router. main.js calls createUI() once; every screen is mount/unmount only.

import { bindPrefs } from './prefs.js';
import { closePopup } from './widgets.js';
import { clear as clearHitRects } from './hitrects.js';
import { resetHud } from './hud.js';

import * as title from './screens/title.js';
import * as modeselect from './screens/modeselect.js';
import * as levelselect from './screens/levelselect.js';
import * as brief from './screens/brief.js';
import * as hangar from './screens/hangar.js';
import * as results from './screens/results.js';
import * as pause from './screens/pause.js';
import * as settings from './screens/settings.js';

const SCREENS = { title, modeselect, levelselect, brief, hangar, results, pause, settings };

const FALLBACK_MODES = [
  { id: 'story', name: 'Story', blurb: '100 missions, five acts. The campaign.', icon: 'bomb' },
  { id: 'survival', name: 'Survival', blurb: 'Endless waves. How long can you stay up?', icon: 'cluster' },
  { id: 'timeattack', name: 'Time Attack', blurb: 'Beat the clock on a mission you have already flown.', icon: 'rocket' },
  { id: 'bossrush', name: 'Boss Rush', blurb: 'Every boss, back to back, one life.', icon: 'spike' },
  { id: 'event', name: 'Special Event', blurb: 'A rotating weekly with its own rules and rewards.', icon: 'nuke', event: true },
];

/** Loads DESIGN's tables plus any that do not exist yet, so UI never hard-codes a list. */
export async function loadGameData(override) {
  const out = { MODES: FALLBACK_MODES };
  const optional = [
    ['../data/planes.js', (m) => { out.PLANES = m.PLANES; out.UPGRADES = m.UPGRADES; }],
    ['../data/weapons.js', (m) => { out.WEAPONS = m.WEAPONS; }],
    ['../data/levels.js', (m) => { out.LEVELS = m.LEVELS; }],
    ['../data/enemies.js', (m) => { out.ENEMIES = m.ENEMIES; }],
    ['../data/tuning.js', (m) => { out.CAM = m.CAM; out.COMBAT = m.COMBAT; out.ECON = m.ECON; out.PHYS = m.PHYS; }],
    ['../data/modes.js', (m) => { out.MODES = buildModes(m); out.modesRaw = m; }],
    ['../data/story.js', (m) => { out.STORY = m; }],
    ['../data/economy.js', (m) => { out.ECONOMY = m; }],
    ['../data/acts.js', (m) => { out.ACTS = m.ACTS; }],
    ['../data/music.js', (m) => { out.MUSIC = m.MUSIC; out.pickTrack = m.pickTrack; out.pairedTrack = m.pairedTrack; }],
  ];
  for (const [path, take] of optional) {
    try { take(await import(/* @vite-ignore */ path)); } catch { /* not written yet — fine */ }
  }
  out.PLANES = out.PLANES || [];
  out.UPGRADES = out.UPGRADES || [];
  out.WEAPONS = out.WEAPONS || {};
  out.LEVELS = out.LEVELS || [];
  out.MUSIC = out.MUSIC || [];
  return Object.assign(out, override || {});
}

const MODE_ICON = { survival: 'cluster', timeattack: 'rocket', bossrush: 'spike', event: 'nuke' };
const MODE_BLURB = {
  survival: 'Endless waves over one arena. How long can you stay up?',
  timeattack: 'Any mission you have beaten, against the clock. Gold, silver or nothing.',
  bossrush: 'All five bosses, back to back, half health between them.',
};

/**
 * data/modes.js exports MODES as an object of rule tables, not a menu. The menu is
 * assembled here so a new mode row appears without touching modeselect.js.
 */
function buildModes(m) {
  const out = [{ id: 'story', name: 'Story', blurb: '100 missions, five acts. The campaign.', icon: 'bomb' }];
  const table = m && m.MODES;
  const rows = Array.isArray(table) ? table : Object.values(table || {});
  for (const r of rows) {
    if (!r || !r.id || r.id === 'story') continue;
    out.push({ id: r.id, name: r.name || r.id, blurb: r.blurb || MODE_BLURB[r.id] || '', icon: r.icon || MODE_ICON[r.id] || 'bomb', def: r });
  }
  if (m && typeof m.getWeeklyEvent === 'function') {
    try {
      const ev = m.getWeeklyEvent();
      if (ev) out.push({ id: 'event', name: ev.name, blurb: ev.desc || '', icon: MODE_ICON.event, event: true, def: ev, endsIn: 'SUNDAY' });
    } catch { /* a bad date should never cost us the menu */ }
  }
  return out;
}

export async function createUI(opts) {
  const root = opts.root || document.getElementById('ui');
  const save = opts.save || {};
  const audio = opts.audio || {};
  const data = await loadGameData(opts.data);
  bindPrefs(save, audio);

  let currentName = null, current = null;
  const stack = [];

  const ctx = {
    save, data, audio,
    args: {},
    start: opts.start || (() => {}),
    resume: opts.resume || (() => {}),
    quit: opts.quit || (() => {}),
    go, back, refresh,
  };

  function unmountCurrent() {
    closePopup();
    // a stale rect from the previous screen would silently swallow a steering touch
    clearHitRects();
    if (current && typeof current.unmount === 'function') {
      try { current.unmount(); } catch (e) { console.warn('[ui] unmount', currentName, e); }
    }
    root.textContent = '';
    current = null;
  }

  function go(name, args) {
    const mod = SCREENS[name];
    if (!mod) { console.warn('[ui] no screen', name); return; }
    if (currentName && currentName !== name) stack.push(currentName);
    unmountCurrent();
    currentName = name;
    current = mod;
    ctx.args = args || {};
    root.dataset.screen = name;
    const host = document.createElement('div');
    host.className = 'screen s-' + name;
    root.appendChild(host);
    mod.mount(host, ctx, ctx.args);
    requestAnimationFrame(() => host.classList.add('in'));
    return host;
  }

  function back() {
    const prev = stack.pop() || 'title';
    const keep = stack.slice();
    go(prev);
    stack.length = 0;
    stack.push(...keep);
  }

  /** Re-mount the current screen in place — used after a purchase changes the model. */
  function refresh() {
    if (currentName) {
      const keep = stack.slice();
      go(currentName, ctx.args);
      stack.length = 0;
      stack.push(...keep);
    }
  }

  ctx.hide = () => { root.classList.add('hidden'); };
  ctx.show = () => { root.classList.remove('hidden'); };
  // handing control back to the flying: drop the menu, and let the HUD re-register its rects
  ctx.close = () => {
    unmountCurrent();
    currentName = null;
    root.removeAttribute('data-screen');
    resetHud();
  };
  ctx.screenName = () => currentName;

  return ctx;
}

export { SCREENS, FALLBACK_MODES };
