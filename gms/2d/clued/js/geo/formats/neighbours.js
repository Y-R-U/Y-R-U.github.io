import { register, collect, pick, shuffle } from '../../formats/registry.js?v=202610100510';
import { geo, countryIds, isPlayable, REGIONS, createMap, frame, message, button, isKids, cname, theName, byLevel, refFor, supportsGeo, bboxUnion, plural } from './common.js?v=202610100510';
import { makeProjection, projectedBox, haversineKm } from '../proj.js?v=202610100510';
import { regionFor } from '../regions.js?v=202610100510';

// Borders that surprise people, explained on the reveal.
const NOTES = {
  'FRA-BRA': 'France borders Brazil and Suriname through French Guiana.', 'FRA-SUR': 'France borders Brazil and Suriname through French Guiana.',
  'ESP-MAR': "Spain's cities of Ceuta and Melilla border Morocco.", 'RUS-POL': "Russia's Kaliningrad region borders Poland and Lithuania.",
  'RUS-LTU': "Russia's Kaliningrad region borders Poland and Lithuania.", 'AZE-TUR': "Azerbaijan's Nakhchivan exclave borders Turkey.",
  'GBR-IRL': 'The United Kingdom borders Ireland in Northern Ireland.', 'DNK-DEU': 'Denmark’s only land border is with Germany.',
};
const note = (a, b) => NOTES[`${a}-${b}`] || NOTES[`${b}-${a}`];
// Overseas borders are never options (a trick either way); disputed places are never asked, offered or counted.
const OVERSEAS = new Set(['BRA-FRA', 'FRA-SUR', 'ESP-MAR']);
export const DISPUTED = new Set(['PSE', 'XKX', 'TWN', 'ESH']);
const pairKey = (a, b) => [a, b].sort().join('-');
const nbAll = iso => geo.countries[iso]?.nb || [];
const nbOf = iso => nbAll(iso).filter(n => isPlayable(n));
// Neighbours that may appear as options.
export const shownNb = iso => nbOf(iso).filter(n => !DISPUTED.has(n) && !OVERSEAS.has(pairKey(iso, n))).sort();
const subjectOK = iso => isPlayable(iso) && !DISPUTED.has(iso);
// Every real neighbour bar disputed places; "pick all" needs this to be the whole list.
export const fullNb = iso => nbOf(iso).filter(n => !DISPUTED.has(n)).sort();
const hasDisputed = iso => nbAll(iso).some(n => DISPUTED.has(n));
// "How many?" only where the count is uncontroversial: no disputed or overseas borders.
export const countable = iso => subjectOK(iso) && nbOf(iso).length >= 1 && nbAll(iso).every(n => !DISPUTED.has(n) && !OVERSEAS.has(pairKey(iso, n)));
export const PICK_RANGE = { 1: [1, 99], 2: [2, 99], 3: [2, 4] };
const OPTIONS = 6;
const COUNT_MAX = { 1: 5, 2: 8, 3: 99 };

const FRANCE = [-5.2, 41.3, 9.6, 51.1];   // metropolitan France (its mb reaches French Guiana)
// Smallest map view that holds the country and all its neighbours.
export function viewFor(iso, extra = []) {
  // others are clipped to 20° around the country, so France's French Guiana doesn't drag a Spain view across the Atlantic
  const me = geo.countries[iso].mb, M = 20;
  const clip = b => [Math.max(b[0], me[0] - M), Math.max(b[1], me[1] - M), Math.min(b[2], me[2] + M), Math.min(b[3], me[3] + M)];
  const mbOf = id => (id === 'FRA' && geo.countries[iso].c !== 'SA' ? FRANCE : geo.countries[id].mb);
  const box = bboxUnion([me, ...[...nbOf(iso), ...extra].map(id => clip(mbOf(id))).filter(b => b[0] <= b[2] && b[1] <= b[3])]);
  for (const k of [geo.countries[iso].c, ...(geo.countries[iso].cs || []), 'mideast']) {
    const r = REGIONS[k]; if (!r?.file) continue;
    const f = r.frame, span = Math.max(f[2] - f[0], f[3] - f[1]);
    if (box[0] >= f[0] - span * 0.3 && box[2] <= f[2] + span * 0.3 && box[1] >= f[1] - span * 0.5 && box[3] <= f[3] + span * 0.5) return { region: k, box };
  }
  return { region: 'world', box };
}

// On-screen size (CSS px) of each neighbour once the kids view has flown to the country, in a W×H map box.
// Mirrors map.js: padding 12, flyTo pad 0.08, never zoomed out past the region's home fit. Equal-area projections,
// so sqrt(area) gives the side of an equal-sized square.
export const KIDS_BOX = [340, 300];   // smaller than the kids map at 384×854, 854×384 and 1280×800
export const KIDS_MIN = { side: 22, thin: 14 };
const U = 1000;
export function tapSizes(iso, [W, H] = KIDS_BOX) {
  const { region, box } = viewFor(iso);
  const reg = regionFor(region), proj = makeProjection(reg);
  const fit = b => Math.min((W - 24) / ((b[2] - b[0]) * U), (H - 24) / ((b[3] - b[1]) * U));
  const home = fit(projectedBox(proj, reg.frame));
  const k = Math.max(home, Math.min(home * 30, fit(projectedBox(proj, box, 6)) / 1.16));
  return nbOf(iso).map(n => {
    const c = geo.countries[n], b = projectedBox(proj, c.mb, 6);
    return { id: n, w: (b[2] - b[0]) * U * k, h: (b[3] - b[1]) * U * k, side: Math.sqrt(c.a || 0) / 6371 * U * k };
  });
}
export const kidsOK = iso => subjectOK(iso) && nbOf(iso).length >= 1 && nbOf(iso).length === shownNb(iso).length
  && tapSizes(iso).every(s => s.side >= KIDS_MIN.side && Math.min(s.w, s.h) >= KIDS_MIN.thin);

// Non-neighbours from the same part of the world, nearest first; hard rounds lead with neighbours-of-neighbours.
export function decoysFor(rng, iso, n, level) {
  const me = geo.countries[iso], conts = new Set([me.c, ...(me.cs || [])]);
  const near = new Set(nbAll(iso));
  const dist = id => haversineKm(me.lp, geo.countries[id].lp);
  const all = countryIds().filter(id => id !== iso && !near.has(id) && !DISPUTED.has(id) && !nbAll(id).includes(iso) && geo.countries[id].a >= 500)
    .sort((a, b) => dist(a) - dist(b) || (a < b ? -1 : 1));
  const byDist = all.filter(id => conts.has(geo.countries[id].c) || geo.countries[id].cs?.some(c => conts.has(c)));
  let pool;
  if (level === 3) {
    const second = new Set(fullNb(iso).flatMap(nbAll));
    pool = [...byDist.filter(id => second.has(id)).slice(0, 8), ...byDist.slice(0, 10)];
  } else pool = level === 2 ? byDist.slice(0, 12) : byDist.slice(3, 18);
  pool = [...new Set(pool)];
  const out = shuffle(rng, pool).slice(0, n);
  // small continents (Brazil borders nearly all of South America): top up with the nearest others
  for (const id of [...byDist, ...all]) if (out.length < n && !out.includes(id)) out.push(id);
  return out.length === n ? out : null;
}

function notesFor(iso) {
  const out = [...new Set(nbOf(iso).map(n => note(iso, n)).filter(Boolean))];
  const disp = nbOf(iso).filter(n => DISPUTED.has(n));
  if (disp.length) out.push(`It also borders ${list(disp.map(theName))}, whose status is disputed.`);
  return out;
}
const RULE = 'Counting land borders with independent countries.';

function pickQ(rng, iso, level, packs) {
  const shown = level === 3 ? fullNb(iso) : shownNb(iso);
  const need = level === 3 ? shown.length : level === 2 ? Math.min(shown.length, 2 + (rng() < 0.5 ? 1 : 0)) : 1;
  const right = level === 3 ? shown : shuffle(rng, shown).slice(0, need);
  const wrong = decoysFor(rng, iso, OPTIONS - need, level);
  if (!wrong) return null;
  const opts = shuffle(rng, [...right, ...wrong]);
  const all = fullNb(iso);
  return {
    format: 'neighbours', id: `neighbours:pick:${iso}:${need}`,
    prompt: level === 3 ? `Pick ${need === 2 ? 'both' : `all ${need}`} countries that border ${theName(iso)}` : need === 1 ? `Which of these borders ${theName(iso)}?` : `Which ${need} of these border ${theName(iso)}?`,
    options: opts.map(id => ({ text: cname(id), iso: id })), answer: opts.map((id, i) => (right.includes(id) ? i : -1)).filter(i => i >= 0),
    answerText: right.map(cname).join(', '),
    explain: [`${cap(theName(iso))} borders ${list(all.map(theName))}.`, ...notesFor(iso)].join(' '),
    refs: refFor(packs, iso),
    data: { kind: 'pick', iso, need, level, all, disputed: nbOf(iso).filter(n => DISPUTED.has(n)), decoys: wrong, ...viewFor(iso, wrong) },
  };
}

function countQ(rng, iso, level, packs) {
  const all = nbOf(iso).sort(), n = all.length;
  const near = [-3, -2, -1, 1, 2, 3].map(d => n + d).filter(x => x >= 1);
  const others = shuffle(rng, near).sort((a, b) => Math.abs(a - n) - Math.abs(b - n)).slice(0, 3);
  const opts = [n, ...others].sort((a, b) => a - b);
  return {
    format: 'neighbours', id: `neighbours:count:${iso}`, prompt: `How many countries does ${theName(iso)} border?`,
    options: opts.map(x => ({ text: String(x) })), answer: opts.indexOf(n), answerText: String(n),
    explain: [`${cap(theName(iso))} borders ${plural(n, 'country').replace('countrys', 'countries')}: ${list(all.map(theName))}.`, RULE, ...notesFor(iso)].join(' '),
    refs: refFor(packs, iso),
    data: { kind: 'count', iso, level, all, ...viewFor(iso) },
  };
}

function tapQ(iso, packs, { kids, level, mistakes }) {
  const nb = kids ? shownNb(iso) : nbOf(iso).sort();
  return {
    format: 'neighbours', id: `neighbours:${kids ? 'tap1' : 'map'}:${iso}`,
    prompt: kids ? `Tap a country that borders ${theName(iso)}` : `Tap every country that borders ${theName(iso)}`,
    answer: nb, answerText: nb.map(cname).join(', '), refs: refFor(packs, iso),
    explain: notesFor(iso).join(' ') || undefined,
    data: { kind: kids ? 'tap1' : 'map', iso, ...viewFor(iso), kids, level, mistakes: kids ? 1 : mistakes },
  };
}

// One question of a given kind about a given country (dev harness and tests).
export function makeQuestion(kind, iso, level, rng, packs = []) {
  return kind === 'pick' ? pickQ(rng, iso, level, packs) : kind === 'count' ? countQ(rng, iso, level, packs) : tapQ(iso, packs, { kids: kind === 'tap1', level, mistakes: 3 });
}

export const pools = {};
export function poolFor(kind, level) {
  const key = kind + level;
  if (pools[key]) return pools[key];
  const ids = countryIds().filter(subjectOK);
  let p;
  if (kind === 'pick') { const [lo, hi] = PICK_RANGE[level]; p = ids.filter(id => { const n = (level === 3 ? fullNb : shownNb)(id).length; return n >= lo && n <= hi && !(level === 3 && hasDisputed(id)); }); }
  else if (kind === 'count') p = ids.filter(id => countable(id) && nbOf(id).length <= COUNT_MAX[level]);
  else if (kind === 'tap1') return (pools[key] = ids.filter(id => kidsOK(id) && geo.countries[id].d <= 2));
  else { const max = level === 1 ? 6 : level === 2 ? 9 : 15; p = ids.filter(id => { const n = nbOf(id).length; return n >= 2 && n <= max && (level >= 3 || id !== 'FRA'); }); }
  return (pools[key] = byLevel(p, level, undefined, kind === 'tap1' ? 4 : 10));
}

export default register({
  id: 'neighbours', title: 'Neighbours', icon: '🤝', blurb: 'Which countries border it?', tags: ['map'],
  options: [
    { key: 'ask', label: 'Questions', type: 'choice', values: ['mix', 'pick', 'count', 'map'], labels: ['Mix', 'Pick the neighbours', 'How many?', 'Tap on the map'], default: 'mix' },
    { key: 'mistakes', label: 'Wrong taps allowed (map)', type: 'choice', values: [1, 3, 5], default: 3 },
  ],
  supports: supportsGeo, packless: true,
  timeScale: q => (q.data?.kind === 'pick' ? 1.6 : q.data?.kind === 'map' ? 2 : 1),
  generate({ rng, packs = [], count, opts = {}, difficulty = 0, avoid, kids: kidsArg }) {
    const kids = !!(opts.kids || kidsArg), level = kids ? 1 : difficulty || 0;
    const ask = opts.ask || 'mix';
    return collect(count, () => {
      if (kids) return tapQ(pick(rng, poolFor('tap1', 1)), packs, { kids, level: 1 });
      const lv = level || 1 + Math.floor(rng() * 3);
      const kind = ask === 'mix' ? (rng() < 0.65 ? 'pick' : 'count') : ask;
      const iso = pick(rng, poolFor(kind, lv));
      if (kind === 'pick') return pickQ(rng, iso, lv, packs);
      if (kind === 'count') return countQ(rng, iso, lv, packs);
      return tapQ(iso, packs, { level: lv, mistakes: +opts.mistakes || 3 });
    }, avoid);
  },
  render(el, q, api) {
    const kind = q.data.kind;
    return kind === 'pick' || kind === 'count' ? renderChoice(el, q, api) : renderMap(el, q, api);
  },
});

const CSS = `
.nbq .gmq-mapwrap.nbq-off{display:none}
.nbq.nbq-pre .gmq-side{flex:1 1 auto;display:flex;flex-direction:column;justify-content:center;gap:14px}
.nbq-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}
.nbq-grid.n4{grid-template-columns:repeat(4,1fr)}
.nbq-opt{min-height:52px;padding:8px 10px;border:2px solid rgba(0,0,0,.18);border-radius:14px;background:#fff;color:#222;font:inherit;font-weight:700;cursor:pointer;line-height:1.15;overflow-wrap:anywhere}
.nbq-grid.n4 .nbq-opt{font-size:1.35em}
.nbq-opt[aria-pressed=true]{background:var(--gm-sel,#79aef7);border-color:#2f5fb3;color:#fff}
.nbq-opt:disabled{cursor:default}
.nbq-opt.ok{background:var(--ok,#2f8f57);border-color:#21733f;color:#fff}
.nbq-opt.miss{border:3px dashed var(--ok,#2f8f57);background:#e9f7ee;color:#1d5a35}
.nbq-opt.bad{background:var(--bad,#c4473a);border-color:#8f2418;color:#fff}
.nbq-opt.dim{opacity:.45}
.nbq:not(.nbq-pre) .nbq-grid{gap:6px}.nbq:not(.nbq-pre) .nbq-opt{min-height:38px;padding:4px 8px;font-size:.92em}
.nbq-hint{width:100%;text-align:center;font-weight:600;opacity:.75}
@media (orientation:landscape) and (max-height:520px){.nbq-opt{min-height:40px;padding:6px 8px}.nbq-grid{gap:6px}}
`;
function injectCSS() {
  if (document.getElementById('nbq-style')) return;
  const s = document.createElement('style'); s.id = 'nbq-style'; s.textContent = CSS; document.head.append(s);
}

function renderChoice(el, q, api) {
  injectCSS();
  const kids = isKids(q, api), d = q.data, multi = d.kind === 'pick';
  const ui = frame(el, { prompt: q.prompt });
  ui.root.classList.add('nbq', 'nbq-pre');
  const wrap = ui.mapEl.parentNode; wrap.classList.add('nbq-off');
  const need = multi ? d.need : 1, right = new Set(multi ? q.answer : [q.answer]);
  const sel = new Set();
  let done = false, map = null;
  const hint = document.createElement('div'); hint.className = 'nbq-hint';
  const grid = document.createElement('div'); grid.className = 'nbq-grid' + (q.options.length === 4 ? ' n4' : '');
  const btns = q.options.map((o, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'nbq-opt'; b.textContent = o.text;
    if (multi) b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => tapOpt(i));
    grid.append(b);
    return b;
  });
  const check = multi && need > 1 ? button('Check', 'gmq-btn', () => finish()) : null;
  ui.foot.append(...[multi && need > 1 ? hint : null, grid, check].filter(Boolean));
  const draw = () => {
    if (!check) return;
    const left = need - sel.size;
    hint.textContent = `Exactly ${need} of these ${q.options.length} do · ${sel.size} picked`;
    check.disabled = left !== 0;
    check.textContent = left > 0 ? `Pick ${left} more` : 'Check';
  };
  draw();
  function tapOpt(i) {
    if (done || btns[i].disabled) return;
    if (!multi || need === 1) { sel.add(i); return finish(); }
    if (sel.has(i)) sel.delete(i); else if (sel.size < need) sel.add(i); else return;
    btns[i].setAttribute('aria-pressed', String(sel.has(i)));
    draw();
  }
  function finish(timeout) {
    if (done) return;
    done = true;
    check?.remove(); hint.remove();
    const hits = [...sel].filter(i => right.has(i)).length;
    btns.forEach((b, i) => {
      b.disabled = true; b.removeAttribute('aria-pressed');
      b.classList.add(right.has(i) ? (sel.has(i) ? 'ok' : 'miss') : sel.has(i) ? 'bad' : 'dim');
    });
    const correct = hits === need && sel.size === need;
    const frac = hits / need;
    const subj = cap(theName(d.iso));
    const msg = multi
      ? (correct ? (need === 1 ? `Correct, ${q.answerText}.` : `All ${need} right!`) : `${hits} of ${need} right. The neighbours are in green.`)
      : correct ? `Correct, ${q.answerText}.` : `${subj} borders ${q.answerText} ${q.answerText === '1' ? 'country' : 'countries'}.`;
    message(ui.foot, msg, correct ? true : frac >= 0.5 ? null : false);
    showMap();
    if (!timeout) api.answer({ correct, partial: multi && !correct && hits > 0, points: multi && !correct ? Math.round(100 * frac) : undefined, given: multi ? [...sel].sort() : [...sel][0], detail: multi ? { found: hits, of: need } : undefined });
  }
  function showMap() {
    wrap.classList.remove('nbq-off');
    ui.root.classList.remove('nbq-pre');
    map = createMap(ui.mapEl, { region: d.region, target: 'none', interactive: true, dots: false, dotFor: [d.iso, ...d.all, ...(d.decoys || [])] });
    map.ready.then(() => {
      map.setLocked(true);
      map.setState(d.iso, 'hint');
      map.label(d.iso, cname(d.iso), { size: 14 });
      for (const n of d.all) { map.setState(n, 'correct'); map.label(n, cname(n), { size: 11 }); }
      for (const n of d.disputed || []) map.setState(n, 'soft');
      for (const n of d.decoys || []) { map.setState(n, 'wrong'); map.label(n, cname(n), { size: 11 }); }
      map.flyTo(d.box, { pad: 0.06, maxZoom: 30, duration: 400 });
    });
  }
  return {
    get map() { return map; },
    destroy: () => map?.destroy(),
    timeout() { finish(true); },
    eliminate(k = 2) {
      const wrong = btns.map((b, i) => i).filter(i => !right.has(i) && !btns[i].disabled && !sel.has(i));
      for (const i of shuffle(Math.random, wrong).slice(0, Math.min(k, wrong.length - 1))) { btns[i].disabled = true; btns[i].classList.add('dim'); }
    },
    choose(x) {
      sel.clear();
      if (x === 'correct') right.forEach(i => sel.add(i));
      else { const w = btns.map((b, i) => i).filter(i => !right.has(i)); for (let i = 0; i < need; i++) sel.add(w[i]); }
      finish();
    },
  };
}

function renderMap(el, q, api) {
  const kids = isKids(q, api), one = q.data.kind === 'tap1';
  const ui = frame(el, { prompt: q.prompt });
  const need = new Set(q.answer), found = new Set(), wrong = new Set();
  const counter = document.createElement('span'); counter.className = 'gmq-count';
  const doneBtn = one ? null : button("I'm done", 'gmq-btn ghost', () => finish());
  if (!one) ui.foot.append(counter, doneBtn);
  const draw = () => { counter.textContent = `${found.size} of ${need.size} found` + (wrong.size ? ` · ${plural(wrong.size, 'miss')}`.replace('misss', 'misses') : ''); };
  draw();
  let done = false;
  const map = createMap(ui.mapEl, {
    region: q.data.region, target: 'countries', bigTargets: kids || q.data.level === 1, dots: !one,
    members: null, playable: id => isPlayable(id) && id !== q.data.iso,
    onTap(hit) {
      if (done || !hit.id || !hit.playable || found.has(hit.id) || wrong.has(hit.id)) return;
      if (need.has(hit.id)) { found.add(hit.id); map.setState(hit.id, 'correct'); api.sfx?.('correct'); }
      else { wrong.add(hit.id); map.setState(hit.id, 'wrong'); api.sfx?.('wrong'); }
      map.label(hit.id, cname(hit.id), { size: 12 });
      draw();
      if (one || found.size === need.size || wrong.size >= q.data.mistakes) finish();
    },
  });
  map.ready.then(() => {
    map.setState(q.data.iso, 'hint');
    map.label(q.data.iso, cname(q.data.iso), { size: 14 });
    map.flyTo(q.data.box, { pad: 0.08, maxZoom: 30, duration: 500 });
  });
  function finish(timeout) {
    if (done) return;
    done = true;
    map.setLocked(true);
    doneBtn?.remove();
    for (const id of need) if (!found.has(id)) { map.setState(id, 'target'); map.label(id, cname(id), { size: 12 }); }
    if (one) {
      const correct = found.size === 1;
      const msg = correct ? (kids ? `Yes! ${cname([...found][0])} is a neighbour! 🎉` : 'Correct!') : `${kids ? 'Good try! ' : ''}The neighbours are in yellow.`;
      message(ui.foot, msg, correct);
      if (!timeout) api.answer({ correct, given: [...found, ...wrong][0] ?? null });
      return;
    }
    const frac = Math.max(0, (found.size - wrong.size * 0.5) / need.size);
    const correct = found.size === need.size && wrong.size === 0;
    const msg = correct ? (kids ? `You found them all! 🎉` : `All ${need.size} found!`)
      : `${found.size} of ${need.size} found${need.size - found.size ? `; the missing ones are in yellow` : ''}.`;
    message(ui.foot, msg, correct ? true : frac >= 0.5 ? null : false);
    draw();
    if (!timeout) api.answer({ correct, partial: !correct && frac > 0, points: correct ? undefined : Math.round(100 * frac), given: [...found, ...wrong], detail: { found: found.size, of: need.size, wrong: wrong.size } });
  }
  return {
    map, destroy: () => map.destroy(),
    timeout() { finish(true); },
    choose(x) {
      map.ready.then(() => {
        if (x === 'correct') { if (one) found.add(q.answer[0]); else q.answer.forEach(id => found.add(id)); }
        else if (one) wrong.add('?');
        finish();
      });
    },
  };
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const list = a => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
