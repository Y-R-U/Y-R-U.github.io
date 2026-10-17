import { h } from './kit.js?v=202610171247';
import { defineScreen, go, header } from './app.js?v=202610171247';
import { getSettings, setSettings, dailyDone, todayUTC } from '../core/store.js?v=202610171247';
import { kidsProgress } from './stickers.js?v=202610171247';
import { sfx } from './fx.js?v=202610171247';
import { toast } from './popup.js?v=202610171247';
import { loadNet } from './net.js?v=202610171247';
import { toolButtons } from './toggles.js?v=202610171247';
import { statsLine } from './statsline.js?v=202610171247';
import { BUILD } from '../build.js?v=202610171247';

export const logo = (sm = false) => h('div.logo', { class: sm ? 'sm' : '', 'aria-label': 'Clued' },
  h('span.lens', {}, '?'), ...'lued'.split('').map(c => h('span.l', {}, c)));

// the daily rolls over at midnight UTC, so the badge shows the UTC date too
function calBadge(d = new Date(`${todayUTC()}T12:00:00Z`)) {
  return h('span.d-badge.cal', { 'aria-hidden': 'true' },
    h('b', {}, d.toLocaleString('en', { month: 'short', timeZone: 'UTC' }).toUpperCase()), h('i', {}, String(d.getUTCDate())));
}

export function applyKids(on) {
  document.body.classList.toggle('kids-on', !!on);
}

// Home shows four hubs; Solo and Together open their own page of modes.
const HUBS = [
  ['solo', '🎯', 'Solo', 'Quick game, survival, blitz, ladder'],
  ['together', '🎉', 'Together', 'Same room: party, duel, pub quiz'],
  ['online', '🌐', 'Online', 'Play friends anywhere'],
  ['learn', '📖', 'Learn', 'Field guides & flashcards'],
];
const HUB_MODES = {
  solo: { title: 'Solo', modes: [
    ['quick', '▶️', 'Quick game', 'Pick a question type and go'],
    ['survival', '❤️', 'Survival', 'Three lives'],
    ['blitz', '⚡', 'Blitz', '60 seconds, go!'],
    ['ladder', '🪜', 'Ladder', '15 rungs to the top'],
  ] },
  together: { title: 'Together', modes: [
    ['party', '🎉', 'Party', 'Pass the phone, 2–8'],
    ['duel', '⚔️', 'Duel', 'Two players, one phone'],
    ['pubquiz', '🍻', 'Pub quiz', 'Rounds, jokers, glory'],
  ] },
};
const KID_MODES = ['quick', 'party', 'survival', 'duel', 'pubquiz'];

const tile = ([id, ico, title, blurb]) => h('button.tile', { type: 'button', dataset: { mode: id }, onclick: () => openMode(id) },
  h('span.t-ico', {}, ico), h('span.t-title', {}, title), h('span.t-blurb', {}, blurb));

const EYE_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.2M6.3 6.3C4 7.8 2.6 10 2 12c1 2.5 5 7 10 7 1.7 0 3.3-.5 4.6-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

defineScreen('home', el => {
  const s = getSettings();
  const kids = !!s.kids;
  applyKids(kids);
  const kidSwitch = h('input', { type: 'checkbox', 'aria-label': 'Kids mode' });
  kidSwitch.checked = kids;
  kidSwitch.addEventListener('change', () => { setSettings({ kids: kidSwitch.checked }); sfx('button'); go('home', {}, { replace: true }); });

  const daily = h('button.daily-card', { type: 'button', onclick: () => go('daily') },
    h('div', {}, h('h2', {}, kids ? 'Kids Daily' : 'Daily challenge'),
      h('p', {}, dailyDone(undefined, kids ? 'kids' : 'main') ? 'Done today ✓ tap to see your result' : `Today's 10 questions, same for everyone`)),
    dailyDone(undefined, kids ? 'kids' : 'main') ? h('span.d-badge', {}, '✅') : calBadge());

  const tiles = h('div.tiles.hubs', {}, ...HUBS.map(tile));
  import(`../net/api.js?v=${BUILD}`).then(m => m.rooms.listPublic()).then(d => {
    const n = d?.rooms?.length, t = tiles.querySelector('[data-mode="online"]');
    if (n && t) t.append(h('span.t-live', { title: `${n} public game${n === 1 ? '' : 's'} open` }, `🟢 ${n} live`));
  }).catch(() => {});

  let extra = null;
  if (kids) {
    const kp = kidsProgress();
    extra = h('div.panel.center', { style: { marginTop: '14px' } },
      h('div', { html: `<b>⭐ ${kp.stars} stars</b> · ${kp.have} sticker${kp.have === 1 ? '' : 's'} · ${kp.next} more star${kp.next === 1 ? '' : 's'} to the next` }),
      h('div.sticker-shelf', {}, ...kp.stickers.slice(0, Math.max(8, kp.have + 4)).map((x, i) => h('span.sticker', { class: i < kp.have ? '' : 'locked' }, x))));
  }

  // A small eye-off chip on the card's corner hides it from home; Settings → Home page brings it back.
  const hideable = (node, key, what) => s[key] === false ? null : h('div.hideable', {}, node,
    h('button.hide-chip', { type: 'button', 'aria-label': `Hide ${what} from the home page`, title: `Hide ${what}`, dataset: { hide: key }, html: EYE_OFF, onclick: () => {
      setSettings({ [key]: false });
      sfx('button');
      toast(`${what[0].toUpperCase() + what.slice(1)} hidden. Turn it back on in Settings.`, 3200);
      go('home', {}, { replace: true });
    } }));

  el.append(...[
    h('div.home-top', {}, logo(), h('div.tools', {}, ...toolButtons(),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Settings', onclick: () => go('settings') }, '⚙️'))),
    h('p.tagline', {}, kids ? 'Big pictures, no rush, stickers to win!' : 'Trivia for curious minds.'),
    /^(games\.br8t\.com|localhost|127\.|192\.168\.)/.test(location.hostname) ? null
      : h('a.home-move', { href: 'https://games.br8t.com/gms/2d/clued/' }, 'Sign-in and online play work best on games.br8t.com →'),
    hideable(h('label.kids-toggle', {}, h('span.k-ico', {}, '🧸'),
      h('span.k-txt', {}, 'Kids mode', h('small', {}, kids ? 'On: easy picture questions, read aloud' : 'Easy picture questions, read aloud, no timer')),
      h('span.switch', {}, kidSwitch, h('i'))), 'homeKids', 'the kids mode switch'),
    h('div.home-grid', {},
      hideable(daily, 'homeDaily', 'the daily challenge'),
      tiles),
    extra,
    statsLine(kids),
    h('div.home-foot', {},
      h('button.btn.ghost.small', { type: 'button', onclick: () => go('settings') }, 'Settings'),
      h('button.btn.ghost.small', { type: 'button', dataset: { act: 'stats-foot' }, onclick: () => go('stats') }, 'Stats'),
      h('button.btn.ghost.small', { type: 'button', onclick: () => go('credits') }, 'Credits')),
  ].filter(Boolean));
}, { pester: true });

for (const [hub, { title, modes }] of Object.entries(HUB_MODES)) defineScreen(hub, el => {
  const kids = !!getSettings().kids;
  el.append(header(title), h('div.tiles', {}, ...modes.filter(m => !kids || KID_MODES.includes(m[0])).map(tile)));
});

export function openMode(id) {
  sfx('button');
  if (id === 'quick') return go('formats', { structure: 'quick' });
  if (id === 'survival' || id === 'blitz' || id === 'duel') return go('formats', { structure: id });
  if (id === 'ladder') return go('setup', { structure: 'ladder', format: 'mc' });
  if (id === 'online') return loadNet().then(net => (net?.openOnline ? net.openOnline(window.__cluedCtx) : go('online-soon')));
  return go(id);
}
