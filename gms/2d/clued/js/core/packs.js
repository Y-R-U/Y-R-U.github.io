import { BUILD } from '../build.js?v=202610201048';

export const THEMES = [
  { id: 'animals', title: 'Animals', icon: '🐾' }, { id: 'nature', title: 'Nature', icon: '🌿' },
  { id: 'geography', title: 'Geography', icon: '🌍' }, { id: 'screen', title: 'Screen', icon: '🎬' },
  { id: 'music', title: 'Music', icon: '🎵' }, { id: 'books', title: 'Books & words', icon: '📚' },
  { id: 'genres', title: 'Genres', icon: '🎭' }, { id: 'people', title: 'People', icon: '🧑' }, { id: 'science', title: 'Science', icon: '🔬' },
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

// Virtual packs (tools/build_index.mjs builds the same views for caps):
//   { of, tag }    general~science: the base pack's questions tagged with that theme
//   { of, group }  people~music: the base pack's items of one group and the questions about them
//   { merge: [] }  people~all: several people packs mixed, with the shared facts only (field says acting, directing …)
//   { of, genre }  movies~scifi: the base pack's items of one genre (data/genres.json) and the questions about them
//   { parts: [] }  genre~scifi: every { of, genre } view of that genre; spec.js plays the parts as separate packs, so a
//                  question's wrong answers always come from its own pack (a film question never offers a book)
const ERA = y => (y == null ? undefined : y < 500 ? 'ancient world' : y < 1500 ? 'Middle Ages' : y < 1800 ? '1500s to 1700s' : y < 1900 ? '1800s' : '1900s or later');
const MERGE_FIELD = { actors: 'acting', directors: 'film directing' };
export function virtualView(id, v, bases, info = {}) {
  const base = bases[0];
  if (v.genre) return genreView(id, base, info);
  if (v.parts) return { id, title: info.title, icon: info.icon, theme: 'genres', parts: bases, items: bases.flatMap(p => p.items || []), questions: bases.flatMap(p => p.questions || []) };
  if (v.tag) return { ...base, id, title: info.title || base.title, theme: v.tag, questions: (base.questions || []).filter(q => (q.tags || []).includes(v.tag)) };
  if (v.group) {
    const items = (base.items || []).filter(it => it.group === v.group);
    const ids = new Set(items.map(it => `${base.id}/${it.id}`));
    return { ...base, id, title: info.title || base.title, icon: info.icon || base.icon, items, questions: (base.questions || []).filter(q => (q.refs || []).some(r => ids.has(r))) };
  }
  const seen = new Set(), items = [], questions = [];
  for (const p of bases) {
    for (const it of p.items || []) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      const f = it.facts || {}, field = f.field || MERGE_FIELD[p.id];
      items.push({ ...it, group: field || it.group, facts: { born: f.born, died: f.died, nationality: f.nationality, era: ERA(f.born), field } });
    }
    questions.push(...(p.questions || []));
  }
  const people = bases.find(p => p.id === 'people') || base;
  return { ...people, id, title: info.title || people.title, icon: info.icon || people.icon, theme: people.theme, items, questions, factsMeta: people.factsMeta };
}
// info.genreIds: the base items in this genre. In kids mode a genre only plays family films, shows and books (kids flag
// or a kids pack); info.adult: never for kids at all
function genreView(id, base, info) {
  const keep = new Set(info.genreIds || []);
  const forKids = it => !info.adult && (base.kids || it.kids === true || it.facts?.kids === true);
  const items = (base.items || []).filter(it => keep.has(it.id)).map(it => (forKids(it) ? it : { ...it, kids: false }));
  const refs = new Map(items.map(it => [`${base.id}/${it.id}`, it.kids !== false]));
  const questions = (base.questions || []).filter(q => refs.has((q.refs || [])[0])).map(q => (refs.get(q.refs[0]) ? q : { ...q, kids: false }));
  return { ...base, id, base: base.id, title: info.title || base.title, items, questions, fakes: [], ...(info.adult ? { kids: false, kidsSafe: false } : {}) };
}
let genresP = null;
export const loadGenres = () => (genresP ||= getJSON(dataUrl(`data/genres.json?v=${BUILD}&b=${G.index?.build || ''}`)).catch(() => (genresP = null, { packs: {} })));
async function loadVirtual(id, v) {
  let info = G.index?.packs?.[id] || {};
  if (v.genre) info = { ...info, genreIds: (await loadGenres()).packs?.[v.of]?.[v.genre] || [], adult: info.kidsSafe === false };
  const bases = await Promise.all((v.parts || v.merge || [v.of]).map(loadPack));
  const pack = virtualView(id, v, bases, info);
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
