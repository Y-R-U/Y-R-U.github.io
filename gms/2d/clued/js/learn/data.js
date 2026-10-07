// Pack access for Learn: game packs via the shell loader, music packs (data/music/) via our own small cache.
import { getIndex, loadPack, THEMES, dataUrl } from '../core/packs.js?v=202610071327';
import { factText } from '../formats/registry.js?v=202610071327';
import { getSettings } from '../core/store.js?v=202610071327';
import { BUILD } from '../build.js?v=202610071327';

export const MUSIC_PACKS = ['anthems', 'instruments', 'classical-piano', 'classical-recordings', 'nursery-rhymes', 'pd-melodies',
  'kids-film-tv', 'screen-themes', 'music-artists', 'one-hit-wonders', 'hits-1960s', 'hits-1970s', 'hits-1980s', 'hits-1990s',
  'hits-2000s', 'hits-2010s', 'hits-2020s'];

const music = new Map();
export function loadMusic(id) {
  if (!music.has(id)) {
    const p = fetch(dataUrl(`data/music/${id}.json?v=${BUILD}`), { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error(`${r.status} ${id}`); return r.json(); })
      .then(pk => { pk.id = pk.id || id; return pk; });
    p.catch(() => music.delete(id));
    music.set(id, p);
  }
  return music.get(id);
}

export const kidsOn = () => !!getSettings().kids;

export function packList() {
  const idx = getIndex();
  const ids = Object.keys(idx?.packs || {});
  // lane I: virtual general~<theme> slices and question-only packs have no items to learn
  const real = ids.filter(id => !id.startsWith('_') && !idx.packs[id].virtual && idx.packs[id].items > 0);
  return (real.length ? real : ids).map(id => ({ id, ...idx.packs[id] }));
}

// Themes with their packs, in THEMES order. kids: only kids packs and packs with enough easy items.
export function themeTree({ kids = kidsOn(), need = null } = {}) {
  const packs = packList().filter(p => !kids || p.kidsSafe !== false).filter(p => !need || need(p));
  return THEMES.map(t => ({ ...t, packs: packs.filter(p => p.theme === t.id).sort((a, b) => a.title.localeCompare(b.title)) }))
    .filter(t => t.packs.length);
}

// Kids view of an item list, matching the shell's rule (A.md "Kids mode, for free").
export function kidsItems(pack) {
  if (pack.kidsSafe === false) return [];
  return (pack.items || []).filter(it => pack.kids || it.difficulty === 1 || it.facts?.kids === true);
}

export const itemsFor = (pack, kids = kidsOn()) => (kids ? kidsItems(pack) : pack.items || []);
export const refOf = (pack, item) => `${pack.id}/${item.id}`;

export async function getPack(id) {
  if (MUSIC_PACKS.includes(id) && !getIndex()?.packs?.[id]) return loadMusic(id);
  return loadPack(id);
}

export async function itemByRef(ref) {
  const [pid, iid] = String(ref).split('/');
  try {
    const pack = await getPack(pid);
    const item = pack?.items?.find(it => it.id === iid);
    return item ? { pack, item, ref } : null;
  } catch (e) { return null; }
}

export const thumb = item => item?.media?.img?.[0] || null;
export const hasAudio = item => !!item?.media?.audio?.length;

export function factRows(pack, item) {
  const rows = [];
  for (const [k, m] of Object.entries(pack.factsMeta || {})) {
    const v = item.facts?.[k];
    if (v == null || v === '' || k === 'kids') continue;
    rows.push({ key: k, label: m.label || k, text: factText(m, v), meta: m, value: v });
  }
  return rows;
}

// Values of a cat fact may be arrays or comma lists when the fact is non-exclusive.
export function catValues(meta, v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String);
  if (meta?.exclusive === false && typeof v === 'string') return v.split(/\s*,\s*/).filter(Boolean);
  return [String(v)];
}

export const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
