// Pub quiz: 4–8 rounds of different formats/themes, one double-points joker per player, builder or "surprise me".
import { playSpec } from './session.js?v=202610071327';
import { makeSpec, supportedPackIds } from '../core/spec.js?v=202610071327';
import { handoff } from './handoff.js?v=202610071327';
import { playersEditor } from './party.js?v=202610071327';
import { defineScreen, go, back, header } from '../ui/app.js?v=202610071327';
import { h, esc, fmtNum } from '../ui/kit.js?v=202610071327';
import { popup, toast } from '../ui/popup.js?v=202610071327';
import { listFormats, getFormat, defaultOpts } from '../formats/registry.js?v=202610071327';
import { getIndex } from '../core/packs.js?v=202610071327';
import { getSettings, read, write, getFavs } from '../core/store.js?v=202610071327';
import { cleanFav, favKey } from '../ui/favmodel.js?v=202610071327';
import { optionsPanel } from '../ui/setup.js?v=202610071327';
import { rngFrom, pick, shuffle, randomSeed } from '../core/rng.js?v=202610071327';
import { sfx } from '../ui/fx.js?v=202610071327';

const KEY = 'clued.pubquiz';
const MAX_ROUNDS = 8;
let S = null;
function state() {
  if (S) return S;
  const saved = read(KEY) || {};
  S = { rounds: saved.rounds || [], players: saved.players || [{ name: 'Team 1' }], jokers: {} };
  return S;
}
const save = () => write(KEY, { rounds: S.rounds, players: S.players });

const packsLabel = packs => {
  if (packs === 'all' || !packs?.length) return 'All themes';
  const idx = getIndex();
  const names = packs.map(id => idx.packs[id]?.title).filter(Boolean);
  return names.length > 2 ? `${names.slice(0, 2).join(', ')} +${names.length - 2}` : names.join(', ');
};
const roundTitle = r => r.title || `${getFormat(r.format)?.title || r.format}`;
const usable = (kids) => listFormats().filter(f => !f.hidden && supportedPackIds(f, getIndex(), { kids }).length);

// The first round of each format uses one of the player's saved favourites for it, if any (packs, options, difficulty).
// A round's own preset options (Picture round = pictures) win, and the final keeps its difficulty.
function withFavs(rounds, rng, kids, idx) {
  const done = new Set();
  return rounds.map(r => {
    const fmt = getFormat(r.format);
    if (!fmt || done.has(r.format) || r.title === 'The final') return r;
    done.add(r.format);
    const saved = getFavs(favKey(fmt, kids)).filter(Boolean);
    if (!saved.length) return r;
    const c = cleanFav(pick(rng, saved), fmt, idx, { kids });
    if (!c) return r;
    const out = { ...r, opts: { ...r.opts, ...c.opts, ...(r.preset || {}) }, fav: true };
    if (!fmt.packless && Array.isArray(c.packs)) out.packs = c.packs;
    if (!kids && c.difficulty != null) out.difficulty = c.difficulty;
    if (Array.isArray(out.packs) && out.packs === c.packs && /: /.test(r.title || '')) out.title = fmt.title; // "Science: Odd one out" no longer fits the fav's packs
    return out;
  });
}

export function surprise(seed = randomSeed(), kids = false) {
  const rounds = surpriseBase(seed, kids);
  return withFavs(rounds, rngFrom(`pubfav:${seed}`), kids, getIndex()).map(({ preset, ...r }) => r);
}

function surpriseBase(seed, kids) {
  const rng = rngFrom(`pub:${seed}`);
  const idx = getIndex();
  const fmts = usable(kids);
  const has = id => fmts.some(f => f.id === id);
  const tagged = t => fmts.filter(f => (f.tags || []).includes(t));
  const rounds = [];
  if (kids) {
    if (has('mc')) rounds.push({ format: 'mc', opts: { source: 'pictures', answers: 3 }, title: 'Picture round' });
    if (has('tf')) rounds.push({ format: 'tf', title: 'True or false?' });
    const kf = shuffle(rng, fmts.filter(f => f.kids && !['mc', 'tf'].includes(f.id)));
    for (const f of kf.slice(0, 2)) rounds.push({ format: f.id, title: f.title });
    while (rounds.length < 4 && has('mc')) rounds.push({ format: 'mc', opts: { answers: 3 }, title: rounds.length === 3 ? 'The final' : 'Mixed bag' });
    return rounds.slice(0, 4).map(r => ({ packs: 'all', count: 5, difficulty: 1, ...r, preset: r.opts, opts: { ...defaultOpts(getFormat(r.format)), ...(r.opts || {}) } }));
  }
  if (has('mc')) rounds.push({ format: 'mc', opts: { source: 'pictures' }, title: 'Picture round' });
  const music = tagged('music')[0]; if (music) rounds.push({ format: music.id, title: 'Music round' });
  const map = tagged('map'); if (map.length) rounds.push({ format: pick(rng, map).id, title: 'Map round' });
  const pool = shuffle(rng, fmts.filter(f => !rounds.some(r => r.format === f.id)));
  const themes = shuffle(rng, idx.themes);
  for (const f of pool) {
    if (rounds.length >= 5) break;
    const t = themes.find(th => th.packs.some(id => supportedPackIds(f, idx).includes(id)));
    const packs = t ? t.packs.filter(id => supportedPackIds(f, idx).includes(id)) : 'all';
    rounds.push({ format: f.id, packs, title: t ? `${t.title}: ${f.title}` : f.title });
  }
  while (rounds.length < 5 && has('mc')) {
    const t = themes[rounds.length % Math.max(1, themes.length)];
    rounds.push({ format: 'mc', packs: t ? t.packs : 'all', title: t ? `${t.title}` : 'General knowledge' });
  }
  if (has('mc')) rounds.push({ format: 'mc', difficulty: 3, count: 5, title: 'The final' });
  return rounds.map(r => ({ packs: 'all', count: 6, difficulty: 0, ...r, preset: r.opts, opts: { ...defaultOpts(getFormat(r.format)), ...(r.opts || {}) } }));
}

async function pickFormat(kids) {
  const grid = h('div.tiles');
  const fmts = usable(kids);
  return popup({
    title: 'Pick a format for this round',
    body: (() => {
      for (const f of fmts) grid.append(h('button.tile', { type: 'button', dataset: { format: f.id }, onclick: () => grid.closest('.pop')._close(f.id) },
        h('span.t-ico', {}, f.icon), h('span.t-title', {}, f.title)));
      return grid;
    })(),
    actions: [{ label: 'Cancel', value: null }],
  });
}

defineScreen('pubquiz', el => {
  const s = state();
  const kids = !!getSettings().kids;
  el.append(header('Pub quiz'));
  el.append(h('p.muted.center', { style: { marginTop: '0', marginBottom: '12px' } }, 'Build 4–8 rounds or let us surprise you. Each player gets one joker: double points on the round they choose.'));
  const top = h('div.row', { style: { justifyContent: 'center' } },
    h('button.btn.sun', { type: 'button', dataset: { act: 'surprise' }, onclick: () => { s.rounds = surprise(randomSeed(), kids); s.jokers = {}; save(); sfx('reveal'); draw(); } }, '🎲 Surprise me'),
    h('button.btn', { type: 'button', dataset: { act: 'kids-preset' }, onclick: () => { s.rounds = surprise(randomSeed(), true); s.jokers = {}; save(); draw(); } }, '🧸 Kids quiz'));
  const list = h('div.rounds');
  const playersBox = h('div.panel');
  el.append(top, h('div.sec-title', {}, 'Rounds'), list, h('div.sec-title', {}, 'Players or teams'), playersBox);
  const ed = playersEditor(playersBox, s.players, { min: 1, max: 8, kidsToggle: false });
  playersBox.addEventListener('input', () => { s.players = ed.players(); save(); drawJokers(); });
  playersBox.addEventListener('click', () => setTimeout(() => { s.players = ed.players(); save(); draw(); }, 0));

  function drawJokers() {
    list.querySelectorAll('.jokers').forEach(box => {
      const ri = +box.dataset.r;
      box.innerHTML = '';
      s.players.forEach((p, pi) => {
        const on = s.jokers[pi] === ri;
        const b = h('button.joker', { type: 'button', class: on ? 'on' : '', title: 'Double points for this player on this round' }, `🃏 ${p.name || `Player ${pi + 1}`}`);
        b.addEventListener('click', e => { e.stopPropagation(); s.jokers[pi] = on ? undefined : ri; drawJokers(); });
        box.append(b);
      });
    });
  }
  function draw() {
    list.innerHTML = '';
    s.rounds.forEach((r, i) => {
      const f = getFormat(r.format);
      list.append(h('div.round-card', { dataset: { round: String(i) } },
        h('span.r-ico', {}, f?.icon || '❓'),
        h('div', {}, h('div.r-t', {}, `${i + 1}. ${roundTitle(r)}`, r.fav ? h('span.r-fav', { title: 'From your favourites' }, ' ♥') : null), h('div.r-s', {}, `${r.count} questions · ${packsLabel(r.packs)}${f ? '' : ' · format missing'}`), h('div.jokers', { dataset: { r: String(i) } })),
        h('div.row', { style: { gap: '6px' } },
          h('button.icon-btn', { type: 'button', 'aria-label': 'Edit round', onclick: () => go('pqround', { idx: i, format: r.format }) }, '✎'),
          h('button.icon-btn', { type: 'button', 'aria-label': 'Remove round', onclick: () => { s.rounds.splice(i, 1); s.jokers = {}; save(); draw(); } }, '✕'))));
    });
    if (s.rounds.length < MAX_ROUNDS) {
      list.append(h('button.btn.wide', { type: 'button', dataset: { act: 'add-round' }, onclick: async () => { const id = await pickFormat(kids); if (id) go('pqround', { idx: -1, format: id }); } }, '+ Add round'));
    }
    if (!s.rounds.length) list.prepend(h('p.muted.center', {}, 'No rounds yet. Tap Surprise me for an instant quiz.'));
    drawJokers();
  }
  draw();
  el.append(h('div.start-bar', {}, h('button.btn.go.big.wide', {
    type: 'button', dataset: { act: 'start' }, onclick: () => {
      s.players = ed.players(); save();
      const ok = s.rounds.filter(r => getFormat(r.format));
      if (ok.length < 1) { toast('Add at least one round'); return; }
      if (ok.length < 4) toast('Tip: a proper pub quiz has 4+ rounds');
      startQuiz(ok, s.players, { ...s.jokers }, kids);
    },
  }, 'Start the quiz')));
}, { pester: true });

defineScreen('pqround', (el, { idx = -1, format }) => {
  const s = state();
  const fmt = getFormat(format);
  const kids = !!getSettings().kids;
  const cur = idx >= 0 ? s.rounds[idx] : null;
  el.append(header(idx >= 0 ? `Round ${idx + 1}` : 'New round'));
  if (!fmt) { el.append(h('p.panel', {}, 'Format missing')); return; }
  const titleIn = h('input.field', { type: 'text', value: cur?.title || '', placeholder: `Round name (optional): ${fmt.title}`, maxlength: 40, style: { display: 'block' } });
  el.append(h('div.setup-head', {}, h('span.fh-ico', {}, fmt.icon), h('div', {}, h('h2', {}, fmt.title), h('p', {}, fmt.blurb || ''))), titleIn);
  const body = h('div', { style: { marginTop: '12px' } });
  el.append(body);
  const panel = optionsPanel(body, fmt, { kids, showTimer: false, last: cur ? { packs: cur.packs, count: cur.count, opts: cur.opts, difficulty: cur.difficulty } : { count: 6 } });
  el.append(h('div.start-bar', {}, h('button.btn.go.big.wide', {
    type: 'button', dataset: { act: 'save-round' }, onclick: () => {
      const v = panel.value();
      const r = { format: fmt.id, packs: v.packs, count: v.count, opts: v.opts, difficulty: v.difficulty, title: titleIn.value.trim() || undefined };
      if (idx >= 0) s.rounds[idx] = r; else s.rounds.push(r);
      save();
      back();
    },
  }, idx >= 0 ? 'Save round' : 'Add round')));
});

function startQuiz(rounds, players, jokers, kids) {
  const n = players.length;
  const spec = makeSpec('pubquiz', rounds.map(r => ({ format: r.format, packs: r.packs, count: r.count * n, opts: r.opts, difficulty: r.difficulty })), randomSeed(), { kids });
  const pos = [];
  playSpec(spec, {
    title: 'Pub quiz', players, replay: () => startQuiz(rounds, players, jokers, kids),
    cfg: questions => {
      const roundStart = {};
      questions.forEach((q, i) => { if (roundStart[q.round] == null) roundStart[q.round] = i; pos[i] = i - roundStart[q.round]; });
      const roundLen = r => questions.filter(q => q.round === r).length;
      let lastRound = -1;
      return {
        players, timer: kids ? 0 : getSettings().timerSec,
        playerOf: i => (pos[i] || 0) % n,
        multiplier: (i, q) => (jokers[(pos[i] || 0) % n] === q.round ? 2 : 1),
        label: (i, q) => `Round ${(q?.round ?? 0) + 1} · ${Math.floor((pos[i] || 0) / n) + 1}/${Math.ceil(roundLen(q?.round ?? 0) / n)}`,
        before: async (i, q, st) => {
          const host = document.querySelector('.scr-play');
          if (q.round !== lastRound) {
            lastRound = q.round;
            const r = rounds[q.round];
            const jk = players.filter((p, pi) => jokers[pi] === q.round).map(p => p.name);
            const board = i ? [...st.players].sort((a, b) => b.score - a.score).map(p => `${esc(p.name)} ${fmtNum(p.score)}`).join(' · ') : '';
            await handoff(host, {
              kicker: `Round ${q.round + 1} of ${rounds.length}`, name: roundTitle(r), icon: getFormat(r.format)?.icon || '❓',
              sub: [jk.length ? `<span class="ri-joker">🃏 Joker: ${jk.map(esc).join(', ')}</span>` : '', board].filter(Boolean).join('<br><br>'),
              button: 'Start round',
            });
          }
          if (n > 1) {
            const p = st.players[(pos[i] || 0) % n];
            await handoff(host, { name: p.name, sub: `${fmtNum(p.score)} pts${jokers[(pos[i] || 0) % n] === q.round ? ' · 🃏 double points!' : ''}` });
          }
        },
      };
    },
  });
}

export default { id: 'pubquiz', title: 'Pub quiz', icon: '🍻', blurb: 'Rounds and jokers', start: () => go('pubquiz'), surprise };
