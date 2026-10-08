// The stats screen: headline tiles, breakdowns, topics, daily calendar, recent games, plain-language glossary.
import { h, fmtNum } from './kit.js?v=202610081215';
import { defineScreen, header, go } from './app.js?v=202610081215';
import { getSettings } from '../core/store.js?v=202610081215';
import { statsView, resetStats, acc, MODE_INFO, DAILY_BITS } from '../core/stats.js?v=202610081215';
import { getIndex, THEMES } from '../core/packs.js?v=202610081215';
import { getFormat } from '../formats/registry.js?v=202610081215';
import { kidsProgress } from './stickers.js?v=202610081215';
import { nameOf } from './statsline.js?v=202610081215';
import { BUILD } from '../build.js?v=202610081215';

function ensureCss() {
  if (document.getElementById('stats-css')) return;
  document.head.append(Object.assign(document.createElement('link'), { id: 'stats-css', rel: 'stylesheet', href: new URL(`../../css/stats.css?v=${BUILD}`, import.meta.url).href }));
}

const DIFF = ['Mixed', 'Easy', 'Medium', 'Hard'];
const DAILY_NAMES = { main: 'Daily', kids: 'Kids Daily', map: 'Daily map', music: 'Daily music' };
const iconOf = (id, kind) => (kind === 'mode' ? MODE_INFO[id]?.[0] : kind === 'format' ? getFormat(id)?.icon
  : kind === 'theme' ? THEMES.find(t => t.id === id)?.icon : getIndex()?.packs?.[id]?.icon) || '❓';
const titleOf = (id, kind) => (kind === 'mode' ? MODE_INFO[id]?.[1] || id : nameOf(id, kind));
const plural = (n, w) => `${fmtNum(n)} ${w}${n === 1 ? '' : 's'}`;

export function duration(secs) {
  if (secs < 60) return `${Math.round(secs)}s`;
  if (secs < 3600) return `${Math.round(secs / 60)} min`;
  const hrs = Math.floor(secs / 3600), min = Math.round((secs % 3600) / 60);
  return min ? `${hrs}h ${min}m` : `${hrs}h`;
}
const ordinal = n => `${n}${(n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
function when(t) {
  const d = new Date(t * 1000), now = new Date();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  if (d.toDateString() === new Date(now - 864e5).toDateString()) return `Yesterday ${time}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
}

const bar = pct => h('span.st-bar', { style: { '--w': `${pct}%` }, 'aria-hidden': 'true' }, h('i'));

function tile(icon, value, label, help, cls = '') {
  return h('div.st-tile', { class: cls }, h('span.st-ico', {}, icon), h('b.st-val', {}, value), h('span.st-lbl', {}, label), h('small.st-help', {}, help));
}

const GLOSSARY = [
  ['Games played', 'Every finished game on this device and any device you sign in on: solo, daily, pub quiz, party, duel, online rooms and challenges. Quitting part-way doesn’t count. Flashcard sessions are counted separately.'],
  ['Accuracy', 'Right answers ÷ questions answered, across all games. Skipped questions don’t count; running out of time counts as wrong. In party games and pub quizzes on one phone, only Player 1’s answers are yours, so put yourself first.'],
  ['Best streak', 'The most correct answers in a row in a single game.'],
  ['Daily streak', 'Days in a row you played any daily challenge (days end at midnight UTC). Today counts once you’ve played; until then the streak runs to yesterday.'],
  ['Online wins', 'Online rooms you finished 1st in against at least one other player. A podium is a top-three finish in a room of three or more.'],
  ['Time played', 'Time from the first question to the results screen, added up. It started counting when detailed stats arrived, so older games aren’t in it.'],
  ['Points', 'Game points: 100 per right answer plus a speed bonus when the timer is on, plus the streak bonus.'],
  ['Earlier games', 'Games played before detailed stats existed (or on an older version of Clued). They count towards the totals but have no breakdown.'],
  ['Duels', 'Count as games and wins, but not towards accuracy: a duel point means you were first, not just right.'],
];

function breakdown(v) {
  const kinds = [['mode', 'Mode', v.modes], ['format', 'Game type', v.formats], ['theme', 'Theme', v.themes], ['pack', 'Topic', v.packs]];
  const sorts = [['g', 'Most played'], ['acc', 'Accuracy'], ['p', 'Points']];
  let kind = 'mode', sort = 'g';
  try { const s = JSON.parse(localStorage.getItem('clued.statsView') || '{}'); if (kinds.some(k => k[0] === s.kind)) kind = s.kind; if (sorts.some(k => k[0] === s.sort)) sort = s.sort; } catch (e) {}
  const kindChips = h('div.chips.st-seg', { role: 'tablist' });
  const sortChips = h('div.chips.st-sort');
  const list = h('div.st-rows');
  const draw = () => {
    try { localStorage.setItem('clued.statsView', JSON.stringify({ kind, sort })); } catch (e) {}
    kindChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.kind === kind));
    sortChips.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.sort === sort));
    const rows = [...kinds.find(k => k[0] === kind)[2]].filter(r => r.q || r.g);
    rows.sort((a, b) => (b[sort] - a[sort]) || (b.g - a.g));
    list.replaceChildren();
    if (kind === 'mode' && v.earlier) rows.push({ id: '_earlier', g: v.earlier.g, q: v.earlier.q, c: v.earlier.c, acc: acc(v.earlier.c, v.earlier.q), p: 0 });
    if (!rows.length) list.append(h('p.muted.tiny', {}, 'Nothing here yet.'));
    for (const r of rows) {
      const early = r.id === '_earlier';
      const duel = kind === 'mode' && r.id === 'duel';
      const bits = [plural(r.g, 'game')];
      if (r.q && !duel) bits.push(`${fmtNum(r.c)}/${fmtNum(r.q)} right`);
      if (r.p) bits.push(`${fmtNum(r.p)} pts`);
      if (kind === 'mode' && r.best) bits.push(`best ${fmtNum(r.best)}`);
      if (kind === 'mode' && r.wins) bits.push(`${plural(r.wins, 'win')}`);
      list.append(h('div.st-row', { dataset: { id: r.id } },
        h('span.st-ri', {}, early ? '🕰️' : iconOf(r.id, kind)),
        h('div.st-rm', {}, h('div.st-rn', {}, early ? 'Earlier games' : titleOf(r.id, kind), early ? h('small', {}, ' (before detailed stats)') : null),
          h('div.st-rs', {}, bits.join(' · '))),
        r.q && !duel ? h('div.st-ra', {}, bar(r.acc), h('b', {}, `${r.acc}%`)) : h('div.st-ra'),
      ));
    }
  };
  for (const [k, label] of kinds) kindChips.append(h('button.chip', { type: 'button', dataset: { kind: k }, onclick: () => { kind = k; draw(); } }, label));
  for (const [k, label] of sorts) sortChips.append(h('button.chip.small', { type: 'button', dataset: { sort: k }, onclick: () => { sort = k; draw(); } }, label));
  draw();
  return h('section.panel.st-break', {}, h('h2.st-h', {}, 'Breakdown'), kindChips, h('div.st-sortrow', {}, h('span.muted.tiny', {}, 'Sort:'), sortChips), list);
}

function topics(v) {
  if (!v.strongest.length) return h('section.panel.st-topics', {}, h('h2.st-h', {}, 'Strongest and weakest topics'),
    h('p.muted.tiny', {}, 'Answer a few more questions on a topic (about 8) and it shows up here.'));
  const item = r => h('li', {}, h('span.st-ri', {}, iconOf(r.id, 'pack')), h('span.st-tn', {}, titleOf(r.id, 'pack')), bar(r.acc), h('b', {}, `${r.acc}%`), h('small.muted', {}, `${r.c}/${r.q}`));
  return h('section.panel.st-topics', {}, h('h2.st-h', {}, 'Strongest and weakest topics'),
    h('div.st-tcols', {},
      h('div', {}, h('h3', {}, '💪 Strongest'), h('ul', {}, ...v.strongest.map(item))),
      v.weakest.length ? h('div', {}, h('h3', {}, '📚 Room to grow'), h('ul', {}, ...v.weakest.map(item))) : null));
}

function calendar(v) {
  const kinds = Object.entries(DAILY_BITS);
  const cells = v.calendar.map(d => {
    const done = kinds.filter(([, b]) => d.mask & b).map(([k]) => k);
    const dt = new Date(`${d.day}T12:00:00Z`);
    return h('div.st-day', { class: done.length ? 'on' : '', title: `${d.day}${done.length ? ': ' + done.map(k => DAILY_NAMES[k]).join(', ') : ''}` },
      h('small', {}, dt.toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' })), h('b', {}, dt.getUTCDate()),
      h('span.st-dots', {}, ...done.map(k => h('i', { class: `k-${k}` }))));
  });
  return h('section.panel.st-cal', {}, h('h2.st-h', {}, 'Daily challenges'),
    h('p.muted.tiny', {}, `Last 4 weeks · ${v.dailyStreak ? `${v.dailyStreak}-day streak` : 'no streak running'} · ${plural(v.dailyDays, 'day')} played in total`),
    h('div.st-days', {}, ...cells),
    h('div.st-key', {}, ...kinds.map(([k]) => h('span', {}, h('i', { class: `k-${k}` }), DAILY_NAMES[k]))));
}

function gameTitle(e) {
  if (e.m === 'daily') return DAILY_NAMES[e.dk] || 'Daily';
  if (e.m === 'study') return `Flashcards${e.sm ? ` · ${e.sm === 'mc' ? 'Multiple choice' : 'Flip'}` : ''}`;
  const f = e.f?.length === 1 ? getFormat(e.f[0])?.title : null;
  return `${MODE_INFO[e.m]?.[1] || e.m}${f && !['study'].includes(e.m) ? ` · ${f}` : ''}`;
}

function recent(v, kidsView) {
  const box = h('div.st-recent');
  const all = v.recent.filter(e => !kidsView || e.k);
  let shown = 12;
  const draw = () => {
    box.replaceChildren();
    for (const e of all.slice(0, shown)) {
      const det = h('div.st-gd', { hidden: true });
      const facts = [];
      if (e.f?.length) facts.push(['Game types', e.f.map(f => getFormat(f)?.title || f).join(', ')]);
      if (e.pk?.length) facts.push(['Topics', e.pk.map(p => titleOf(p, 'pack')).join(', ')]);
      else if (e.th?.length) facts.push(['Themes', e.th.map(t => titleOf(t, 'theme')).join(', ')]);
      if (e.m === 'study') facts.push(['Cards', `${e.c} of ${e.q} ${e.sm === 'mc' ? 'answered right' : 'remembered'}`], ...(e.sm ? [['Study mode', e.sm === 'mc' ? 'Multiple choice' : 'Flip cards']] : []));
      else if (e.x) facts.push(['Points', `${e.c} (first right answers)`]);
      else facts.push(['Right', `${e.c} of ${e.q} (${acc(e.c, e.q)}%)`]);
      if (e.p != null && !e.x) facts.push(['Points', fmtNum(e.p)]);
      if (e.s) facts.push(['Best streak', String(e.s)]);
      if (e.n > 1) facts.push(['Finished', `${ordinal(e.pl)} of ${e.n}${e.m === 'online' ? (e.v === 'p2p' ? ' (device-hosted room)' : ' (online room)') : ''}`]);
      if (e.d) facts.push(['Difficulty', DIFF[e.d]]);
      if (e.k) facts.push(['Kids mode', 'On']);
      if (e.r) facts.push(['Note', 'Replay: only the first daily of the day is scored']);
      if (e.du) facts.push(['Time', duration(e.du)]);
      facts.push(['Played', new Date(e.t * 1000).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })]);
      det.append(h('dl', {}, ...facts.flatMap(([k, x]) => [h('dt', {}, k), h('dd', {}, x)])));
      const right = e.m === 'study' ? `${e.c}/${e.q} 🧠` : e.k ? `${e.c} ⭐` : e.x ? `${e.c} pts` : `${e.c}/${e.q}`;
      const row = h('button.st-g', { type: 'button', 'aria-expanded': 'false', onclick: () => {
        det.hidden = !det.hidden; row.setAttribute('aria-expanded', String(!det.hidden)); row.classList.toggle('open', !det.hidden);
      } },
        h('span.st-ri', {}, MODE_INFO[e.m]?.[0] || '❓'),
        h('span.st-gm', {}, h('span.st-gt', {}, gameTitle(e)), h('small', {}, [when(e.t), e.n > 1 ? `${ordinal(e.pl)} of ${e.n}` : '', e.p && !e.k && !e.x ? `${fmtNum(e.p)} pts` : ''].filter(Boolean).join(' · '))),
        h('b.st-gr', {}, right), h('span.st-caret', {}, '›'));
      box.append(h('div.st-gw', {}, row, det));
    }
    if (all.length > shown) box.append(h('button.btn.small.wide', { type: 'button', dataset: { act: 'more' }, onclick: () => { shown += 24; draw(); } }, `Show more (${all.length - shown} older)`));
  };
  draw();
  if (kidsView && !all.length) return null;
  return h('section.panel.st-rec', {}, h('h2.st-h', {}, 'Recent games'), all.length ? h('p.muted.tiny', {}, `Your last ${all.length} games are kept. Tap one for details.`) : h('p.muted.tiny', {}, 'Games you finish from now on show up here.'), box);
}

function resetBox(after) {
  const confirmRow = h('div.st-confirm', { hidden: true },
    h('p', {}, 'Clear all your stats and game history? This also clears them on every device you sign in on. Kids stickers and today’s daily results are kept.'),
    h('div.row', {},
      h('button.btn.danger.small', { type: 'button', dataset: { act: 'reset-yes' }, onclick: () => { resetStats(); after(); } }, 'Yes, reset'),
      h('button.btn.small', { type: 'button', onclick: () => { confirmRow.hidden = true; btn.hidden = false; } }, 'Cancel')));
  const btn = h('button.btn.ghost.small', { type: 'button', dataset: { act: 'reset' }, onclick: () => { btn.hidden = true; confirmRow.hidden = false; } }, 'Reset stats');
  return h('div.st-reset', {}, btn, confirmRow);
}

function glossary() {
  return h('details.panel.st-gloss', {}, h('summary', {}, h('span', {}, 'What do these numbers mean?')),
    h('dl', {}, ...GLOSSARY.flatMap(([k, x]) => [h('dt', {}, k), h('dd', {}, x)])));
}

function grownUp(el, v) {
  const tiles = h('div.st-tiles', {},
    tile('🎮', fmtNum(v.games), 'Games played', 'Every finished game, all modes'),
    tile('🎯', v.answered ? `${v.acc}%` : '–', 'Accuracy', v.answered ? `${fmtNum(v.correct)} of ${fmtNum(v.answered)} right` : 'No answers yet'),
    tile('🔥', String(v.bestStreak), 'Best streak', 'Most right in a row in one game'),
    tile('✅', String(v.dailyStreak), 'Daily streak', v.dailyStreak === 1 ? 'Day in a row' : 'Days in a row'),
    tile('🏆', String(v.wins), 'Online wins', v.onlineGames ? `${plural(v.podiums, 'podium')} · ${plural(v.onlineGames, 'room')}` : 'No online rooms yet'),
    tile('⏱️', v.secs ? duration(v.secs) : '–', 'Time played', v.since ? `Since ${new Date(v.since * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Counts from now on'));
  el.append(h('p.muted.tiny.st-intro', {}, 'Everything you’ve played in Clued, from every mode. Synced with your account when you’re signed in.'), tiles);
  const left = h('div.st-col', {}, breakdown(v), recent(v, false));
  const right = h('div.st-col', {}, topics(v), calendar(v));
  const grid = h('div.st-grid', {}, left, right);
  if (v.study.sessions) {
    right.append(h('section.panel.st-study', {}, h('h2.st-h', {}, '📖 Flashcards'),
      h('p', {}, `${plural(v.study.sessions, 'session')} · ${fmtNum(v.study.right)} of ${fmtNum(v.study.cards)} cards remembered (${acc(v.study.right, v.study.cards)}%)${v.study.secs ? ` · ${duration(v.study.secs)}` : ''}`),
      h('p.muted.tiny', {}, 'Study sessions from Learn. They don’t change your game stats.')));
  }
  el.append(grid, glossary());
}

function kidsPage(el, v, redraw) {
  const kp = kidsProgress();
  el.append(h('div.panel.st-kids', {},
    h('div.st-kstar', {}, '⭐', h('b', {}, String(kp.stars)), h('span', {}, 'stars')),
    h('p', {}, kp.have ? `You have ${plural(kp.have, 'sticker')}! ${kp.next} more star${kp.next === 1 ? '' : 's'} for the next one.` : `${kp.next} more star${kp.next === 1 ? '' : 's'} for your first sticker!`),
    h('div.sticker-shelf', {}, ...kp.stickers.slice(0, Math.max(8, kp.have + 4)).map((x, i) => h('span.sticker', { class: i < kp.have ? '' : 'locked' }, x)))));
  el.append(h('div.st-tiles.kids', {},
    tile('🎈', String(v.kidsGames || v.games), 'Games played', 'Well done!'),
    tile('🔥', String(v.bestStreak), 'Right in a row', 'Your best ever'),
    tile('✅', String(v.dailyStreak), 'Daily days', 'Days in a row')));
  if (v.kidsThemes.length) {
    el.append(h('section.panel.st-kfav', {}, h('h2.st-h', {}, 'Your favourite topics'),
      h('div.st-kfavs', {}, ...v.kidsThemes.slice(0, 3).map((t, i) => h('div.st-kf', {}, h('span', {}, ['🥇', '🥈', '🥉'][i]), h('b', {}, `${iconOf(t.id, 'theme')} ${titleOf(t.id, 'theme')}`), h('small', {}, plural(t.g, 'game')))))));
  }
  const rec = recent(v, true);
  if (rec) el.append(rec);
  const more = h('button.btn.small', { type: 'button', dataset: { act: 'grown' }, onclick: () => { more.remove(); const box = h('div.st-grown'); el.append(box); grownUp(box, v); box.scrollIntoView({ behavior: 'smooth' }); } }, 'Grown-up stats ›');
  el.append(h('div.center.st-more', {}, more));
}

defineScreen('stats', el => {
  ensureCss();
  const draw = () => {
    el.replaceChildren();
    const kids = !!getSettings().kids;
    el.append(header(kids ? 'My stars' : 'Your stats'));
    const v = statsView();
    if (v.empty && !v.kidsStars) {
      el.append(h('div.panel.st-empty.center', {}, h('div', { style: { fontSize: '56px' } }, '📊'), h('h2', {}, 'No games yet'),
        h('p.muted', {}, 'Finish a game in any mode and your stats show up here: accuracy, streaks, favourite topics and more.'),
        h('button.btn.primary', { type: 'button', onclick: () => go('formats', { structure: 'quick' }) }, '▶ Play a game')));
      return;
    }
    if (kids) kidsPage(el, v, draw); else grownUp(el, v);
    el.append(resetBox(draw));
  };
  draw();
}, { pester: true });
