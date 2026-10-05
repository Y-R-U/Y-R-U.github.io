import { h } from './kit.js?v=202610050139';
import { defineScreen, go } from './app.js?v=202610050139';
import { getSettings, setSettings, getStats, dailyDone, todayUTC } from '../core/store.js?v=202610050139';
import { kidsProgress } from './stickers.js?v=202610050139';
import { sfx } from './fx.js?v=202610050139';
import { loadNet } from './net.js?v=202610050139';
import { toolButtons } from './toggles.js?v=202610050139';

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

const MODES = [
  ['pubquiz', '🍻', 'Pub quiz', 'Rounds, jokers, glory'],
  ['party', '🎉', 'Party', 'Pass the phone, 2–8'],
  ['online', '🌐', 'Online', 'Play friends by link'],
  ['learn', '📖', 'Learn', 'Field guides & flashcards'],
  ['survival', '❤️', 'Survival', 'Three lives'],
  ['blitz', '⚡', 'Blitz', '60 seconds, go!'],
  ['ladder', '🪜', 'Ladder', '15 rungs to the top'],
  ['duel', '⚔️', 'Duel', 'Two players, one phone'],
];
const KID_MODES = ['pubquiz', 'party', 'learn', 'survival', 'duel', 'online'];

defineScreen('home', el => {
  const s = getSettings();
  const kids = !!s.kids;
  applyKids(kids);
  const st = getStats();
  const kidSwitch = h('input', { type: 'checkbox', 'aria-label': 'Kids mode' });
  kidSwitch.checked = kids;
  kidSwitch.addEventListener('change', () => { setSettings({ kids: kidSwitch.checked }); sfx('button'); go('home', {}, { replace: true }); });

  const daily = h('button.daily-card', { type: 'button', onclick: () => go('daily') },
    h('div', {}, h('h2', {}, kids ? 'Kids Daily' : 'Daily challenge'),
      h('p', {}, dailyDone(undefined, kids ? 'kids' : 'main') ? 'Done today ✓ tap to see your result' : `Today's 10 questions, same for everyone`)),
    dailyDone(undefined, kids ? 'kids' : 'main') ? h('span.d-badge', {}, '✅') : calBadge());

  const modes = MODES.filter(m => !kids || KID_MODES.includes(m[0]));
  const tiles = h('div.tiles', {}, ...modes.map(([id, ico, title, blurb]) =>
    h('button.tile', { type: 'button', dataset: { mode: id }, onclick: () => openMode(id) },
      h('span.t-ico', {}, ico), h('span.t-title', {}, title), h('span.t-blurb', {}, blurb))));

  let extra = null;
  if (kids) {
    const kp = kidsProgress();
    extra = h('div.panel.center', { style: { marginTop: '14px' } },
      h('div', { html: `<b>⭐ ${kp.stars} stars</b> · ${kp.have} sticker${kp.have === 1 ? '' : 's'} · ${kp.next} more star${kp.next === 1 ? '' : 's'} to the next` }),
      h('div.sticker-shelf', {}, ...kp.stickers.slice(0, Math.max(8, kp.have + 4)).map((x, i) => h('span.sticker', { class: i < kp.have ? '' : 'locked' }, x))));
  }

  el.append(...[
    h('div.home-top', {}, logo(), h('div.tools', {}, ...toolButtons(),
      h('button.icon-btn', { type: 'button', 'aria-label': 'Settings', onclick: () => go('settings') }, '⚙️'))),
    h('p.tagline', {}, kids ? 'Big pictures, no rush, stickers to win!' : 'Trivia for curious minds.'),
    h('label.kids-toggle', {}, h('span.k-ico', {}, '🧸'),
      h('span.k-txt', {}, 'Kids mode', h('small', {}, kids ? 'On: easy picture questions, read aloud' : 'Easy picture questions, read aloud, no timer')),
      h('span.switch', {}, kidSwitch, h('i'))),
    h('div.home-grid', {},
      h('div', {}, daily,
        h('div.play-btn', {}, h('button.btn.primary.big', { type: 'button', dataset: { mode: 'quick' }, onclick: () => go('formats', { structure: 'quick' }) },
          h('span.wobble', {}, '▶'), ' Play'))),
      h('div', {}, tiles)),
    extra,
    st.games ? h('div.stats-line', { html: `${st.games} games · ${st.correct}/${st.answered} right · best streak ${st.bestStreak}` }) : null,
    h('div.home-foot', {},
      h('button.btn.ghost.small', { type: 'button', onclick: () => go('settings') }, 'Settings'),
      h('button.btn.ghost.small', { type: 'button', onclick: () => go('credits') }, 'Credits')),
  ].filter(Boolean));
}, { pester: true });

export function openMode(id) {
  sfx('button');
  if (id === 'survival' || id === 'blitz' || id === 'duel') return go('formats', { structure: id });
  if (id === 'ladder') return go('setup', { structure: 'ladder', format: 'mc' });
  if (id === 'online') return loadNet().then(net => (net?.openOnline ? net.openOnline(window.__cluedCtx) : go('online-soon')));
  return go(id);
}
