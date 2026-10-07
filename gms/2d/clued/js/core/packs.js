import { BUILD } from '../build.js?v=202610071629';

export const THEMES = [
  { id: 'animals', title: 'Animals', icon: '🐾' }, { id: 'nature', title: 'Nature', icon: '🌿' },
  { id: 'geography', title: 'Geography', icon: '🌍' }, { id: 'screen', title: 'Screen', icon: '🎬' },
  { id: 'music', title: 'Music', icon: '🎵' }, { id: 'books', title: 'Books & words', icon: '📚' },
  { id: 'people', title: 'People', icon: '🧑' }, { id: 'science', title: 'Science', icon: '🔬' },
  { id: 'art', title: 'Art', icon: '🎨' }, { id: 'history', title: 'History', icon: '🏛️' },
  { id: 'sport', title: 'Sport', icon: '⚽' }, { id: 'food', title: 'Food & drink', icon: '🍕' },
  { id: 'general', title: 'General knowledge', icon: '💡' }, { id: 'kids', title: 'Kids', icon: '🧸' },
];

// Used only when data/index.json is missing and the server gives no directory listing.
const DEV_PACKS = ['_dev', 'snakes', 'spiders', 'sharks', 'birds', 'dogs', 'cats', 'dinosaurs', 'mammals',
  'trees', 'flowers', 'mushrooms', 'gemstones', 'elements', 'space', 'body', 'food', 'countries', 'flags',
  'capitals', 'landmarks', 'movies', 'books', 'quotes', 'people', 'paintings', 'history', 'sport', 'general', 'kids'];

const G = globalThis.__cluedPacks || (globalThis.__cluedPacks = { index: null, indexP: null, packs: new Map(), loading: new Map() });

const base = new URL('../../', import.meta.url);
export const dataUrl = p => new URL(p, base).href;

async function getJSON(url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

export function computeCaps(pack) {
  const items = pack.items || [];
  const facts = {};
  for (const [k, m] of Object.entries(pack.factsMeta || {})) {
    if (items.some(it => it.facts && it.facts[k] != null)) facts[k] = m.type;
  }
  const qkinds = {};
  for (const q of pack.questions || []) qkinds[q.kind || 'mc'] = (qkinds[q.kind || 'mc'] || 0) + 1;
  return {
    img: items.filter(it => it.media?.img?.length).length,
    audio: items.filter(it => it.media?.audio?.length).length,
    clues: items.filter(it => (it.clues || []).length >= 5).length,
    facts,
    groups: new Set(items.map(it => it.group).filter(Boolean)).size,
    lookalikes: items.filter(it => it.lookalikes?.length).length,
    fakes: (pack.fakes || []).length,
    quotes: (pack.questions || []).filter(q => q.kind === 'quote').length + items.filter(it => it.quote || it.quotes?.length || it.facts?.quote || it.firstLine).length,
    multi: Object.entries(pack.factsMeta || {}).filter(([, m]) => m.type === 'cat' && m.exclusive === false).map(([k]) => k),
    qkinds,
  };
}

export const summarize = pack => ({
  title: pack.title, theme: pack.theme || 'general', icon: pack.icon || '❓', kids: !!pack.kids,
  items: (pack.items || []).length, questions: (pack.questions || []).length, notice: pack.notice,
  caps: computeCaps(pack),
});

async function listDir(dir) {
  try {
    const r = await fetch(dataUrl(`data/${dir}/`), { cache: 'no-cache' });
    if (!r.ok) return [];
    const html = await r.text();
    return [...html.matchAll(/href="([^"/]+)\.json"/g)].map(m => `${dir}/${decodeURIComponent(m[1])}.json`);
  } catch (e) { return []; }
}

async function devIndex() {
  let paths = [...await listDir('packs'), ...await listDir('music')];
  if (!paths.length) paths = DEV_PACKS.map(id => `packs/${id}.json`);
  const packs = {};
  await Promise.all(paths.map(async path => {
    try {
      const p = await getJSON(dataUrl(`data/${path}?v=${BUILD}`));
      if (!p || !p.id) return;
      G.packs.set(p.id, p);
      packs[p.id] = { ...summarize(p), path };
    } catch (e) { /* missing pack */ }
  }));
  return buildIndexShape(packs, 'dev');
}

function buildIndexShape(packs, build) {
  const themes = THEMES.map(t => ({ ...t, packs: Object.keys(packs).filter(id => packs[id].theme === t.id).sort() }))
    .filter(t => t.packs.length);
  return { build, themes, packs, dev: true };
}

export function loadIndex(force = false) {
  if (G.indexP && !force) return G.indexP;
  G.indexP = (async () => {
    let idx;
    try {
      idx = await getJSON(dataUrl(`data/index.json?v=${BUILD}&t=${Date.now()}`));
      if (!idx || !idx.packs || !Object.keys(idx.packs).length) throw new Error('empty index');
      const titles = Object.fromEntries(THEMES.map(t => [t.id, t]));
      idx.themes = (idx.themes || []).map(t => ({ ...titles[t.id], ...t }));
    } catch (e) {
      idx = await devIndex();
    }
    for (const [id, p] of Object.entries(idx.packs)) p.id = id;
    G.index = idx;
    return idx;
  })();
  return G.indexP;
}

export const getIndex = () => G.index;
export const packInfo = id => G.index?.packs?.[id] || null;
export const allPackIds = () => Object.keys(G.index?.packs || {});

// general~science: the base pack's questions tagged with that theme (see tools/build_index.mjs)
async function loadVirtual(id, v) {
  const base = await loadPack(v.of);
  const info = G.index?.packs?.[id] || {};
  const pack = { ...base, id, title: info.title || base.title, theme: v.tag, questions: (base.questions || []).filter(q => (q.tags || []).includes(v.tag)) };
  G.packs.set(id, pack);
  return pack;
}

export function loadPack(id) {
  if (G.packs.has(id)) return Promise.resolve(G.packs.get(id));
  if (G.loading.has(id)) return G.loading.get(id);
  const v = G.index?.packs?.[id]?.virtual;
  if (v) { const p = loadVirtual(id, v).finally(() => G.loading.delete(id)); G.loading.set(id, p); return p; }
  const p = getJSON(dataUrl(`data/${G.index?.packs?.[id]?.path || `packs/${id}.json`}?v=${BUILD}&b=${G.index?.build || ''}`)).then(pack => {
    G.packs.set(id, pack);
    G.loading.delete(id);
    return pack;
  }, e => { G.loading.delete(id); throw e; });
  G.loading.set(id, p);
  return p;
}

export async function loadPacks(ids) {
  const out = await Promise.allSettled(ids.map(loadPack));
  return out.filter(r => r.status === 'fulfilled').map(r => r.value);
}

export const loadedPacks = () => [...G.packs.values()];

export function itemByRef(ref) {
  const [pid, iid] = String(ref).split('/');
  return G.packs.get(pid)?.items?.find(it => it.id === iid) || null;
}
