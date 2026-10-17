// Local focus UI: the compact "📍 Japan focus · Most" chip + its editor popup, the per-round local line (with the
// Keep / Change warning when a round can't reach its share), the rounds total, and the picker's per-pack counts.
import { h } from './kit.js?v=202610170746';
import { popup } from './popup.js?v=202610170746';
import {
  LEVELS, SHARE, isOn, specLocal, localLabel, levelLabel, countryName, countryList, detectCountry, loadPlaces, loadNames, loadTags, loadLocalGeo,
  hasHomeGeo, packHasLocal, easeView, localView, isLocalQ, targetOf,
} from '../core/local.js?v=202610170746';
import { buildQuestions, makeSpec, kidsView } from '../core/spec.js?v=202610170746';
import { loadPack } from '../core/packs.js?v=202610170746';
import { rngFrom } from '../core/rng.js?v=202610170746';
import { defaultOpts } from '../formats/registry.js?v=202610170746';
import { homeQuestions, HOME_FORMATS, HOME_PACKS } from '../core/localgeo.js?v=202610170746';
import { loadIndex as loadGeoIndex, geo as GEO } from '../geo/data.js?v=202610170746';

export const localReady = Promise.all([loadPlaces(), loadNames(), loadTags(), loadLocalGeo()]).catch(() => null);

const CSS = `
.loc-chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-height: 40px; padding: 6px 12px; border: var(--line) solid var(--ink);
  border-radius: 999px; background: #fff6dc; font: inherit; font-weight: 800; font-size: 14px; color: var(--ink); box-shadow: var(--shadow-sm); text-align: left; }
.loc-chip.off { background: var(--card, #fff); color: var(--ink-2); }
.loc-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.loc-chip:active { transform: translateY(2px); box-shadow: 0 1px 0 var(--ink); }
.loc-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 0 0 10px; }
.loc-bar .loc-line { margin-top: 0; }
.loc-bar .loc-line.short { flex-basis: 100%; }
.loc-bar .rounds-sum { margin: 0; }
.loc-line { font-size: 13px; font-weight: 800; color: var(--ink-2); margin-top: 4px; }
.loc-line.short { color: #9a4b00; }
.loc-line .loc-acts { display: flex; gap: 4px; margin-top: 6px; flex-wrap: wrap; }
.loc-line .loc-acts .btn { width: auto; min-height: 34px; padding: 3px 8px; font-size: 12.5px; letter-spacing: 0; }
.round-card.loc-short { background: #fff1d6; }
.loc-pop .opt { margin-bottom: 12px; }
.loc-pop .loc-country { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
.loc-pop .loc-country b { font-size: 18px; }
.loc-pop small.muted { display: block; margin-top: 4px; }
.loc-list { display: flex; flex-direction: column; gap: 6px; max-height: 46vh; overflow-y: auto; margin-top: 8px; }
.loc-list button { text-align: left; min-height: 44px; padding: 8px 12px; border: 2px solid var(--ink); border-radius: 12px; background: var(--card, #fff); font: inherit; font-weight: 700; color: var(--ink); }
.loc-list button.det { background: #fff6dc; }
.pk .pk-loc { margin-left: auto; font-size: 12.5px; font-weight: 800; color: var(--ink-2); white-space: nowrap; }
`;
function ensureCss() {
  if (typeof document === 'undefined' || document.getElementById('local-css')) return;
  document.head.append(h('style', { id: 'local-css' }, CSS));
}

/* ---------------------------------------------------------------- editor */
async function pickCountry(body, current) {
  const det = detectCountry();
  const list = await countryList();
  const input = h('input.field', { type: 'search', placeholder: 'Search countries', 'aria-label': 'Search countries', autocomplete: 'off' });
  const box = h('div.loc-list');
  return new Promise(resolve => {
    const draw = () => {
      const f = input.value.trim().toLowerCase();
      const rows = list.filter(c => !f || c.name.toLowerCase().includes(f));
      if (!f && det) rows.unshift({ cc: det, name: countryName(det), det: true });
      box.replaceChildren(...rows.slice(0, 260).map(c => h('button', { type: 'button', class: c.det ? 'det' : (c.cc === current ? 'det' : ''), dataset: { cc: c.cc }, onclick: () => resolve(c.cc) },
        c.det ? `📍 ${c.name} (this device)` : c.name, hasHomeGeo(c.cc) ? ' 🏙️' : '')));
    };
    input.addEventListener('input', draw);
    draw();
    body.replaceChildren(input, h('p.muted.tiny', { style: { margin: '6px 0 0' } }, '🏙️ = cities and states questions too'), box,
      h('button.btn.small', { type: 'button', style: { marginTop: '10px' }, onclick: () => resolve(null) }, 'Back'));
    setTimeout(() => input.focus(), 60);
  });
}

// Popup editor. Resolves the new setting { cc, level, live } or null (cancelled).
export async function editLocal(cur) {
  ensureCss();
  await localReady;
  const det = detectCountry();
  const v = { cc: cur?.cc || det || null, level: cur?.level || 'off', live: cur?.live ?? (!!cur?.cc && cur.cc === det) };
  const body = h('div.loc-pop');
  const draw = () => {
    const live = h('input', { type: 'checkbox', 'aria-label': 'I live here or know it well', dataset: { act: 'loc-live' } });
    live.checked = !!v.live;
    live.addEventListener('change', () => { v.live = live.checked; });
    body.replaceChildren(
      h('div.opt', {}, h('div.opt-label', {}, 'Country'),
        h('div.loc-country', {}, h('b', { dataset: { loc: 'country' } }, v.cc ? countryName(v.cc) : 'Pick a country'),
          h('button.btn.small', { type: 'button', dataset: { act: 'loc-country' }, onclick: async () => {
            const cc = await pickCountry(body, v.cc);
            if (cc && cc !== v.cc) { v.cc = cc; v.live = cc === det; if (v.level === 'off') v.level = 'more'; }
            draw();
          } }, 'Change')),
        v.cc && hasHomeGeo(v.cc) ? h('small.muted', {}, '🏙️ Includes its states and cities.') : null),
      h('div.opt', { dataset: { opt: 'loc-level' } }, h('div.opt-label', {}, 'How much'),
        h('div.chips', {}, ...LEVELS.map(([k, label]) => h('button.chip', { type: 'button', class: v.level === k ? 'on' : '', dataset: { v: k },
          onclick: e => { v.level = k; e.currentTarget.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c.dataset.v === k)); } }, label))),
        h('small.muted', {}, 'Per round: More ≈ 1 in 4 questions, Most ≈ 6 in 10, ALL = every one it can.')),
      h('div.opt-row', {}, h('span.lbl', {}, 'I live here / know it well', h('small', {}, 'Questions about this country count as easier. Nothing else changes.')), h('span.switch', {}, live, h('i'))),
      h('p.muted.tiny', { style: { margin: '6px 0 0' } }, 'The game maker decides: everyone in a game gets the same questions.'));
  };
  draw();
  const ok = await popup({ title: '📍 Local focus', body, cls: 'rp-pop', actions: [{ label: 'Cancel', value: false }, { label: 'Done', value: true, primary: true }] });
  if (!ok) return null;
  return { cc: v.cc, level: v.cc ? v.level : 'off', live: !!v.live };
}

// The compact chip. get() → current setting, set(next) stores it (and may return the stored form).
export function localChip(get, set, onChange = () => {}) {
  ensureCss();
  const btn = h('button.loc-chip', { type: 'button', dataset: { act: 'local' } });
  const draw = () => {
    const l = get();
    btn.classList.toggle('off', !isOn(l));
    btn.replaceChildren(h('span', {}, isOn(l) ? `${localLabel(l)}${l.live ? ' · 🏠' : ''}` : '📍 Local focus: Off'));
    btn.title = isOn(l) ? `${localLabel(l)}${l.live ? ' (I live here)' : ''}` : 'Make questions about one country more likely';
  };
  btn.addEventListener('click', async () => {
    const next = await editLocal(get());
    if (!next) return;
    set(next);
    draw();
    onChange(get());
  });
  localReady.then(draw);
  draw();
  return Object.assign(btn, { redraw: draw });
}

/* ---------------------------------------------------------------- round plans */
const plans = new Map();
// How many questions of this round can be local, from a real build of it: { count, target, local, pool }.
export function planRound(r, local, { kids = false, count = r.count || 10 } = {}) {
  if (!isOn(local)) return Promise.resolve(null);
  const key = JSON.stringify([r.format, r.packs, count, r.opts || {}, r.difficulty || 0, specLocal(local), kids]);
  if (!plans.has(key)) {
    plans.set(key, (async () => {
      await localReady;
      const spec = makeSpec('plan', [{ format: r.format, packs: r.packs, count, opts: { ...(r.opts || {}), ...(kids ? { kids: true } : {}) }, difficulty: kids ? 1 : (r.difficulty || 0) }],
        `plan:${key.length}`, { kids, local: specLocal(local) });
      const report = [];
      try { await buildQuestions(spec, { report, sparesRatio: 0 }); } catch (e) { return { count, target: targetOf(count, local.level), local: 0, pool: 0, error: true }; }
      const row = report[0] || {};
      return { count, target: row.target ?? targetOf(count, local.level), local: row.local || 0, pool: row.pool || 0 };
    })());
    if (plans.size > 200) plans.delete(plans.keys().next().value);
  }
  return plans.get(key);
}

// Line under a round card: "📍 6 of 10 local", or the warning with Keep / Change round. card gets .loc-short.
export function localLine(r, local, { kids = false, count, onKeep, onChange } = {}) {
  ensureCss();
  if (!isOn(local)) return null;
  const el = h('div.loc-line', { dataset: { loc: 'line' } }, '📍 …');
  planRound(r, local, { kids, count }).then(p => {
    if (!p) { el.remove(); return; }
    const short = p.local < p.target;
    el.classList.toggle('short', short && !r.localOk);
    el.dataset.local = String(p.local);
    el.dataset.count = String(p.count);
    el.replaceChildren(short ? `📍 only ${p.local} of ${p.count} local: the rest will be normal questions` : `📍 ${p.local} of ${p.count} local`);
    if (short && !r.localOk && (onKeep || onChange)) {
      el.closest('.round-card')?.classList.add('loc-short');
      const stop = fn => e => { e.stopPropagation(); fn(); };
      el.append(h('div.loc-acts', {},
        onKeep ? h('button.btn.small', { type: 'button', dataset: { act: 'loc-keep' }, onclick: stop(onKeep) }, 'Keep') : null,
        onChange ? h('button.btn.small', { type: 'button', dataset: { act: 'loc-change' }, onclick: stop(onChange) }, 'Change round') : null));
    }
  });
  return el;
}

// "📍 38 of 50 local" for a round list, into el (cleared when the focus is off).
export async function localTotal(el, rounds, local, { kids = false, mult = 1, prefix = '' } = {}) {
  const tok = el._tok = {};
  if (!isOn(local)) { el.textContent = ''; return; }
  el.textContent = `${prefix}📍 …`;
  const ps = await Promise.all(rounds.map(r => planRound(r, local, { kids, count: (r.count || 10) * mult })));
  if (el._tok !== tok) return;
  const n = ps.reduce((a, p) => a + (p?.local || 0), 0), of = ps.reduce((a, p) => a + (p?.count || 0), 0);
  el.textContent = `${prefix}📍 ${n} of ${of} local`;
  el.dataset.local = String(n);
}

/* ---------------------------------------------------------------- picker counts */
const counts = new Map();
// Local questions this pack can give this format in this mode (its real local pool, capped at 60).
export function packLocalCount(fmt, id, local, { kids = false } = {}) {
  if (!isOn(local) || fmt.packless) return Promise.resolve(0);
  const key = JSON.stringify([fmt.id, id, specLocal(local), kids]);
  if (!counts.has(key)) counts.set(key, (async () => {
    await localReady;
    const home = HOME_FORMATS.has(fmt.id) && HOME_PACKS.has(id);
    if (!packHasLocal(id, local.cc) && !home) return 0;
    let pack = await loadPack(id);
    if (local.live) pack = easeView(pack, local.cc);
    if (kids) pack = kidsView(pack);
    const rng = rngFrom(`count:${key}`);
    const v = localView(pack, local.cc, rng);
    const seen = new Set();
    try {
      if (v) for (const q of fmt.generate({ rng, packs: [v], count: 60, opts: defaultOpts(fmt), difficulty: kids ? 1 : 0, kids }) || []) if (isLocalQ(q, local.cc)) seen.add(q.id);
    } catch (e) {}
    if (home) {
      await loadGeoIndex().catch(() => null);
      for (const q of homeQuestions({ rng, cc: local.cc, format: fmt.id, count: 60, kids, live: local.live, geo: (await loadLocalGeo()), states: GEO.states, cname: countryName(local.cc) })) seen.add(q.id);
    }
    return Math.min(60, seen.size);
  })());
  return counts.get(key);
}
export { isOn, specLocal, SHARE, levelLabel };
