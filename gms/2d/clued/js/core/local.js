// Local focus: a game-level setting { cc: ISO3, level: 'off'|'more'|'most'|'all', live } that makes a share of each
// round about one country (docs/notes/LOCAL.md). Tags come from data/local/tags.json (tools/local_tags.mjs);
// in-country geography from data/local/geo.json (js/core/localgeo.js). Pure helpers + loaders; spec.js applies it.
import { dataUrl } from './packs.js?v=202610171109';
import { rngFrom, shuffle } from './rng.js?v=202610171109';
import { getSettings, setSettings } from './store.js?v=202610171109';

export const LEVELS = [['off', 'Off', 0], ['more', 'More', 0.25], ['most', 'Most', 0.6], ['all', 'ALL', 1]];
export const SHARE = Object.fromEntries(LEVELS.map(([k, , s]) => [k, s]));
export const levelLabel = k => LEVELS.find(l => l[0] === k)?.[1] || 'Off';

const G = globalThis.__cluedLocal || (globalThis.__cluedLocal = { tags: null, geo: null, places: null, names: null, p: {} });
const getJSON = (path, key) => (G.p[key] ||= fetch(dataUrl(path), { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
  .then(v => { G[key] = v; if (!v) delete G.p[key]; return v; }));
export const loadTags = () => getJSON('data/local/tags.json', 'tags');
export const loadLocalGeo = () => getJSON('data/local/geo.json', 'geo');
export const loadPlaces = () => getJSON('data/local/places.json', 'places');
export const loadNames = () => getJSON('data/geo/countries.json', 'names');
export const countryName = cc => G.names?.[cc]?.n || cc;
export const hasHomeGeo = cc => !!G.geo?.countries?.[cc];
// Every country a player can pick: sovereign states + a few well-known territories, A–Z.
const PICKABLE_TERRITORIES = new Set(['HKG', 'PRI', 'GRL', 'MAC']);
export async function countryList() {
  const c = await loadNames() || {};
  return Object.entries(c).filter(([cc, v]) => v.k === 's' || v.k === 'p' || PICKABLE_TERRITORIES.has(cc))
    .map(([cc, v]) => ({ cc, name: v.n })).sort((a, b) => a.name.localeCompare(b.name));
}

// The device's country from its time zone, then its language region. No location prompt.
export function detectCountry(places = G.places, env = globalThis) {
  if (!places) return null;
  let tz = '', langs = [];
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
  try { langs = [...(env.navigator?.languages || []), env.navigator?.language].filter(Boolean); } catch (e) {}
  const a2 = places.tz[tz] || langs.map(l => /[-_]([A-Z]{2})\b/.exec(l)?.[1]).find(r => r && places.iso2[r]);
  return (a2 && places.iso2[a2]) || null;
}

// Settings (or a host's choice) → a full setting. Missing cc = the detected one; live defaults on only at home.
export function resolveLocal(raw, detected = detectCountry()) {
  const level = raw?.level in SHARE ? raw.level : 'off';
  const cc = (typeof raw?.cc === 'string' && /^[A-Z]{3}$/.test(raw.cc) && raw.cc) || detected || null;
  const live = typeof raw?.live === 'boolean' ? raw.live : !!cc && cc === detected;
  return { cc, level, live };
}
// The player's own setting (Settings › Local focus), used by solo, party and the pub quiz. settings.local keeps only
// what the player chose ({ level, cc?, live? }), so an unpicked country keeps following the device.
export const mySetting = () => resolveLocal(getSettings().local);
export function saveMySetting(l, detected = detectCountry()) {
  const out = { level: l.level };
  if (l.cc && l.cc !== detected) out.cc = l.cc;
  if (l.live !== (!!l.cc && l.cc === detected)) out.live = !!l.live;
  setSettings({ local: out });
  return mySetting();
}
export const isOn = l => !!(l && l.cc && SHARE[l.level] > 0);
// The compact form a spec / room / saved set carries (undefined = off).
export const specLocal = l => (isOn(l) ? { cc: l.cc, level: l.level, live: !!l.live } : undefined);
export const localLabel = l => (isOn(l) ? `📍 ${countryName(l.cc)} focus · ${levelLabel(l.level)}` : '📍 Local focus: off');
export const targetOf = (count, level) => Math.min(count, Math.round(count * (SHARE[level] || 0)));

/* ---------------------------------------------------------------- tags */
const tagsOf = (packId, key) => {
  const p = G.tags?.packs?.[String(packId).split('~')[0]];
  const t = key.startsWith('q:') ? p?.q?.[key.slice(2)] : p?.i?.[key];
  return t == null ? [] : [].concat(t);
};
export const packHasLocal = (packId, cc) => { const p = G.tags?.packs?.[String(packId).split('~')[0]]; return !!p && [...Object.values(p.i), ...Object.values(p.q)].some(t => t === cc || (Array.isArray(t) && t.includes(cc))); };
export const itemLocal = (pack, it, cc) => tagsOf(pack.id, it.id).includes(cc);
export const questionLocal = (pack, q, cc) => tagsOf(pack.id, `q:${q.id}`).includes(cc);
const refLocal = (ref, cc) => {
  const s = String(ref || ''), i = s.indexOf('/');
  return i > 0 && tagsOf(s.slice(0, i), s.slice(i + 1)).includes(cc);
};
// Formats about every ref (learn/mastery.js ALL_REFS + odd/chain): local when at least half the refs are.
const ALL_REFS = new Set(['order', 'hilo', 'match', 'sort', 'connect', 'odd', 'chain', 'pickall']);
export function isLocalQ(q, cc) {
  if (!q || !cc) return false;
  if (q.data?.local) return q.data.local === cc;
  if (q.data?.kind === 'state' && q.data.region === cc) return true;
  const refs = (q.refs || []).filter(r => typeof r === 'string');
  if (!refs.length) return q.format === 'map-click' && q.answer === cc;
  if (ALL_REFS.has(q.format) && refs.length > 1) return refs.filter(r => refLocal(r, cc)).length * 2 >= refs.length;
  return refLocal(refs[0], cc);
}

/* ---------------------------------------------------------------- pack views */
const easier = d => Math.max(1, (d || 2) - 1);
// "I live here": items and questions about the focus country are rated one step easier (hard → medium → easy).
export function easeView(pack, cc) {
  const ease = (x, local) => (local && x.kids !== false && x.facts?.kids !== false ? { ...x, difficulty: easier(x.difficulty) } : x);
  return { ...pack, items: (pack.items || []).map(it => ease(it, itemLocal(pack, it, cc))), questions: (pack.questions || []).map(q => ease(q, questionLocal(pack, q, cc))) };
}
// A pack view centred on the focus country: its local items and questions, plus other items as wrong-answer fodder
// (lookalikes first). Formats then pick subjects mostly from the local ones; isLocalQ keeps only those.
export function localView(pack, cc, rng) {
  const items = pack.items || [];
  const local = items.filter(it => itemLocal(pack, it, cc));
  const qs = (pack.questions || []).filter(q => questionLocal(pack, q, cc));
  if (!local.length && !qs.length) return null;
  const ids = new Set(local.map(it => it.id));
  const look = new Set(local.flatMap(it => it.lookalikes || []));
  const others = items.filter(it => !ids.has(it.id));
  const pad = [...others.filter(it => look.has(it.id)), ...shuffle(rng, others.filter(it => !look.has(it.id)))].slice(0, Math.max(12, local.length * 2));
  return { ...pack, items: local.length ? [...local, ...pad] : [], questions: qs };
}

/* ---------------------------------------------------------------- a round */
// Mixes a round to its local share. full = the normal generate() list, more = extra local candidates (local views,
// in-country questions). Returns { list (count first, spares after), local: n in the first count, pool }.
export function mixRound({ full, more = [], count, level, cc, seed, key = () => '', rank = null }) {
  const target = targetOf(count, level);
  const seen = new Set(), keys = new Set(), local = [], normal = [];
  for (const [q, extra] of [...full.map(q => [q, false]), ...more.map(q => [q, true])]) {
    if (!q || seen.has(q.id)) continue;
    const loc = isLocalQ(q, cc), k = key(q);
    if ((extra && !loc) || (k && keys.has(k))) continue;   // a local view's padding items are only there as wrong answers
    seen.add(q.id);
    if (k) keys.add(k);
    (loc ? local : normal).push(q);
  }
  const rng = rngFrom(`${seed}:local`);
  const L = rank ? rank(shuffle(rng, local)) : shuffle(rng, local), N = normal;   // rank: FRESH, unseen first
  const takeL = Math.min(target, L.length);
  const takeN = Math.min(count - takeL, N.length);
  const extraL = Math.min(L.length - takeL, count - takeL - takeN);   // a short normal pool tops up with local, never repeats
  const head = shuffle(rng, [...L.slice(0, takeL + extraL), ...N.slice(0, takeN)]);
  head.forEach(q => { if (isLocalQ(q, cc)) q.loc = 1; });
  const tail = [...L.slice(takeL + extraL), ...N.slice(takeN)];
  return { list: [...head, ...tail], local: takeL + extraL, target, pool: L.length };
}
