// Shared bits for the map formats: geo index (loaded before any format generates), layout, views, flags.
import { loadIndex, geo, countryIds, regionMembers, isPlayable } from '../data.js?v=202610100431';
import { REGIONS, STATE_VIEWS, CONTINENTS } from '../regions.js?v=202610100431';
import { createMap } from '../map.js?v=202610100431';

await loadIndex();   // ~75 KB; generate() is synchronous and needs it

export { geo, countryIds, regionMembers, isPlayable, REGIONS, STATE_VIEWS, CONTINENTS, createMap };

const base = new URL('../../../data/geo/', import.meta.url);
let flagsP = null;
export const loadFlags = () => (flagsP ||= fetch(new URL('flags.json', base), { cache: 'no-cache' }).then(r => r.json()).catch(() => ({})));
export let FLAGS = {};
loadFlags().then(f => { FLAGS = f; });

export const REGION_CHOICES = ['world', 'EU', 'AS', 'AF', 'NA', 'SA', 'OC', 'caribbean', 'mideast'];
export const REGION_LABELS = ['World', 'Europe', 'Asia', 'Africa', 'N. America', 'S. America', 'Oceania', 'Caribbean', 'Middle East'];
export const STATE_CHOICES = ['any', ...Object.keys(STATE_VIEWS)];
export const STATE_LABELS = ['Any country', ...Object.keys(STATE_VIEWS).map(iso => geo.countries[iso]?.n || iso)];

export const isKids = (q, api) => !!(api?.kids ?? q?.data?.kids ?? (typeof document !== 'undefined' && document.body.classList.contains('kids-on')));
export const cname = id => geo.countries[id]?.n || id;
// Names that take "the" mid-sentence ("Tap the Netherlands").
const THE = new Set(['USA', 'GBR', 'NLD', 'PHL', 'BHS', 'GMB', 'CAF', 'DOM', 'MDV', 'MHL', 'SLB', 'COM', 'SYC', 'ARE', 'COD', 'COG', 'VAT', 'CZE_', 'FRO', 'CYM', 'VGB', 'VIR', 'TCA', 'FLK', 'UMI', 'IOA']);
export const theName = id => (THE.has(id) ? 'the ' : '') + cname(id);

// Region file whose clip box contains the country (the build pads frames by 0.5/0.9 of their span).
function clipOf(key) {
  const f = REGIONS[key].frame, span = Math.max(f[2] - f[0], f[3] - f[1]);
  return [f[0] - span * 0.5, f[1] - span * 0.9, f[2] + span * 0.5, f[3] + span * 0.9];
}
const inside = (bb, c) => bb[0] >= c[0] && bb[2] <= c[2] && bb[1] >= c[1] && bb[3] <= c[3];
export function regionForCountry(iso, { states = false } = {}) {
  if (states && STATE_VIEWS[iso]) return iso;
  const c = geo.countries[iso];
  if (!c) return 'world';
  const span = c.mb[2] - c.mb[0];
  if (span > 45) return 'world';
  const order = [c.c, ...(c.cs || []), 'caribbean', 'mideast'];
  for (const k of order) if (REGIONS[k]?.file && inside(c.mb, clipOf(k)) && inFrame(c.lp, REGIONS[k].frame)) return k;
  return 'world';
}
const inFrame = (p, f) => p && p[0] >= f[0] && p[0] <= f[2] && p[1] >= f[1] && p[1] <= f[3];

export function bboxUnion(list) {
  const b = list.filter(Boolean);
  if (!b.length) return null;
  return [Math.min(...b.map(x => x[0])), Math.min(...b.map(x => x[1])), Math.max(...b.map(x => x[2])), Math.max(...b.map(x => x[3]))];
}

// Country difficulty for the requested level; 0 = mixed.
export function byLevel(ids, difficulty, getD = id => geo.countries[id]?.d || 2, min = 6) {
  if (!difficulty) return ids;
  const bands = difficulty === 1 ? [[1], [1, 2]] : difficulty === 2 ? [[1, 2], [1, 2, 3]] : [[3, 2], [1, 2, 3]];
  for (const b of bands) { const l = ids.filter(id => b.includes(getD(id))); if (l.length >= min) return l; }
  return ids;
}

// Ranks a country's states by area: biggest third = 1, middle = 2, smallest = 3.
export function stateDifficulty(iso) {
  const s = geo.states[iso]?.s || {};
  const ids = Object.keys(s).sort((a, b) => s[b].a - s[a].a);
  const out = {};
  ids.forEach((id, i) => { out[id] = i < ids.length / 3 ? 1 : i < ids.length * 2 / 3 ? 2 : 3; });
  return out;
}

const CSS = `
.gmq{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:8px;min-height:0}
.gmq-side{display:contents}
.gmq-top{order:0}.gmq-mapwrap{order:1}.gmq-foot{order:2}
.gmq-top{flex:0 0 auto;display:flex;align-items:center;gap:10px;justify-content:center;padding:2px 4px 0}
.gmq-top{flex-wrap:wrap}.gmq-top .q-prompt{margin:0;text-align:center}
.gmq-sub{flex:0 0 auto;width:100%;text-align:center;opacity:.7;font-weight:600;margin-top:-4px}
.kids .gmq-flag,.kids-on .gmq-flag{height:84px}
.gmq-flag{height:54px;width:auto;border-radius:4px;box-shadow:0 1px 5px rgba(0,0,0,.25);background:#fff}
.gmq-mapwrap{flex:1 1 auto;position:relative;min-height:180px;border-radius:16px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.gmq-map{position:absolute;inset:0}
.gmq-foot{flex:0 0 auto;display:flex;flex-wrap:wrap;gap:8px;justify-content:center;align-items:center;min-height:0}
.gmq-foot:empty{display:none}
.gmq-msg{font-weight:600;text-align:center;width:100%;line-height:1.3}
.gmq-msg.ok{color:var(--ok,#2f8f57)}.gmq-msg.bad{color:var(--bad,#c4473a)}
.gmq-btn{min-height:48px;padding:10px 18px;border:0;border-radius:14px;font:inherit;font-weight:700;cursor:pointer;background:var(--accent,#3d6fe0);color:#fff}
.gmq-btn.ghost{background:rgba(127,127,127,.18);color:inherit}
.gmq-btn:disabled{opacity:.45;cursor:default}
.gmq-big{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:100%}
.gmq-big.n3{grid-template-columns:1fr}
.gmq-big button{min-height:58px;border:0;border-radius:16px;font:inherit;font-size:1.1em;font-weight:800;color:#222;cursor:pointer;box-shadow:0 3px 0 rgba(0,0,0,.18);display:flex;align-items:center;justify-content:center;gap:8px;padding:8px}
.gmq-big button:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.18)}
.gmq-big button.ok{outline:4px solid var(--ok,#2f8f57)}.gmq-big button.bad{opacity:.5;text-decoration:line-through}
.gmq-big button:disabled{cursor:default}
.gmq-count{font-weight:700;opacity:.8}
.gmq-reveal{display:flex;align-items:center;gap:10px;justify-content:center;width:100%}
.gmq-reveal img{height:40px;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.kids .gmq-top .q-prompt,.kids-on .gmq-top .q-prompt{font-size:1.45em}
@media (orientation:landscape) and (max-height:520px){
 .gmq{flex-direction:row;gap:10px}
 .gmq-side{order:2;flex:0 0 38%;display:flex;flex-direction:column;justify-content:center;gap:10px;min-width:0;overflow:auto;padding:4px max(10px,env(safe-area-inset-right)) 4px 4px}
 .play.revealed .gmq-big button:not(.ok):not(.bad){display:none}
 .gmq-mapwrap{order:1;min-height:0}
 .gmq-top{flex-direction:column}
 .gmq-big{grid-template-columns:1fr 1fr;gap:6px}
 .gmq-big button{min-height:42px;font-size:1em;box-shadow:0 2px 0 rgba(0,0,0,.18)}
 .gmq-top .q-prompt{font-size:1.1rem}
 .gmq-reveal img{height:28px}
}
@media (orientation:landscape) and (min-height:521px) and (min-width:900px){
 .gmq{flex-direction:row;gap:16px}
 .gmq-side{order:2;flex:0 0 340px;display:flex;flex-direction:column;justify-content:center;gap:14px;padding-right:16px}
 .gmq-mapwrap{order:1}
 .gmq-top{flex-direction:column}
}
`;
function injectCSS() {
  if (document.getElementById('gmq-style')) return;
  const s = document.createElement('style'); s.id = 'gmq-style'; s.textContent = CSS; document.head.append(s);
}

// Standard map question layout. Returns slots; the map container is .gmq-map.
export function frame(el, { prompt, flag = null }) {
  injectCSS();
  el.innerHTML = '';
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  if (!el.style.minHeight) el.style.minHeight = '60vh';
  const root = div('gmq'), side = div('gmq-side'), top = div('gmq-top'), wrap = div('gmq-mapwrap'), mapEl = div('gmq-map'), foot = div('gmq-foot');
  const promptEl = document.createElement('h2'); promptEl.className = 'q-prompt'; promptEl.textContent = prompt;
  if (flag) { const img = document.createElement('img'); img.className = 'gmq-flag'; img.src = flag.src; img.alt = 'Flag'; img.referrerPolicy = 'no-referrer'; top.append(img); }
  top.append(promptEl);
  wrap.append(mapEl);
  // portrait: shrink the map box to the map (min 300 px, which kids tap targets are sized for) instead of ocean bands
  wrap.addEventListener('gm-fit', e => {
    const tall = matchMedia('(orientation: portrait)').matches;
    wrap.style.maxHeight = tall ? `${Math.max(300, Math.ceil(e.detail.h))}px` : '';
  });
  side.append(top, foot);
  root.append(side, wrap);
  el.append(root);
  return { root, top, promptEl, mapEl, foot, side };
}
export function div(cls, text) { const d = document.createElement('div'); d.className = cls; if (text != null) d.textContent = text; return d; }
export function button(label, cls = 'gmq-btn', onClick) {
  const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.innerHTML = label;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
export function message(foot, text, ok) {
  let m = foot.querySelector('.gmq-msg');
  if (!m) { m = div('gmq-msg'); foot.prepend(m); }
  m.className = 'gmq-msg ' + (ok === true ? 'ok' : ok === false ? 'bad' : '');
  m.textContent = text;
  return m;
}
export function revealCard(iso, kids) {
  const f = FLAGS[iso];
  const c = geo.countries[iso];
  const box = div('gmq-reveal');
  if (f && kids) { const img = document.createElement('img'); img.src = f.src; img.alt = ''; img.referrerPolicy = 'no-referrer'; box.append(img); }
  const t = document.createElement('span'); t.textContent = c ? `${c.n} · ${CONTINENTS[c.c] || ''}` : iso;
  box.append(t);
  return box;
}

export const KIND_WORD = { country: 'country', state: 'state' };
export const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const fmtKm = km => km < 10 ? km.toFixed(1) + ' km' : Math.round(km).toLocaleString('en-GB') + ' km';

// Mastery refs into C2's `countries` pack when it is loaded (item id may be the ISO3 code or carry it in facts).
export function refFor(packs, iso) {
  for (const p of packs || []) {
    if (p.id !== 'countries') continue;
    const it = (p.items || []).find(x => x.id === iso || x.id === iso.toLowerCase() || x.iso3 === iso || x.facts?.iso3 === iso);
    if (it) return [`${p.id}/${it.id}`];
  }
  return [];
}
// Map formats bring their own geo data; any geography pack can host them.
export const supportsGeo = info => (info?.theme === 'geography' || info?.theme === 'kids' ? true : 'Map rounds use the geography packs');
