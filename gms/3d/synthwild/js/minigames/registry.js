// Mini-game registry. A game module's default export (or `pick`) is:
//   { id, name, icon, blurb, minutes, variants?: [{id,label}], build(arena), start(mg), update(dt), end() }
// arena = { ctx, world, origin:{x,y,z}, variant }   mg = { ctx, arena, hud, level, variant, finish(result) }
// result = { won, stars 0..3, title, text, score?, best?: { value, label, lower?: bool } }
export const GAMES = [
  { id: 'parkour', load: () => import('./games/parkour.js') },
  { id: 'floorfall', load: () => import('./games/floorfall.js') },
  { id: 'treasure', load: () => import('./games/treasure.js') },
  { id: 'ctf', load: () => import('./games/ctf.js') },
  { id: 'hideseek', load: () => import('./games/hideseek.js') },
  { id: 'hideseek-seek', load: () => import('./games/hideseek.js'), pick: 'seekGame' },
  { id: 'siege', load: () => import('./games/siege.js') },
];

const cache = new Map();

export async function loadGame(id) {
  if (cache.has(id)) return cache.get(id);
  const e = GAMES.find((g) => g.id === id);
  if (!e) return null;
  try {
    const m = await e.load();
    const def = m[e.pick || 'default'] || null;
    if (def) def.id = def.id || id;
    cache.set(id, def);
    return def;
  } catch (err) {
    if (!/Failed to fetch|Importing a module|404|error loading/i.test(String(err?.message))) console.warn('[minigames]', id, err);
    cache.set(id, null);
    return null;
  }
}

// Every game whose module is present, in registry order.
export async function listGames() {
  const defs = await Promise.all(GAMES.map((g) => loadGame(g.id)));
  return defs.map((d, i) => d && { ...d, id: GAMES[i].id, def: d }).filter(Boolean);
}

// Personal bests: localStorage 'synthwild.mg' = { [id or id:variant]: { stars, value, label, plays, won } }
const KEY = 'synthwild.mg';
export function bests() { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } }
export function bestFor(key) { return bests()[key] || null; }
export function recordResult(key, r) {
  const all = bests();
  const old = all[key] || { stars: 0, plays: 0, won: 0 };
  const cur = { ...old, plays: (old.plays || 0) + 1, won: (old.won || 0) + (r.won ? 1 : 0), stars: Math.max(old.stars || 0, r.stars || 0) };
  let newBest = false;
  if (r.best && Number.isFinite(r.best.value)) {
    const better = old.value == null || (r.best.lower ? r.best.value < old.value : r.best.value > old.value);
    if (better) { cur.value = r.best.value; cur.label = r.best.label; cur.lower = !!r.best.lower; newBest = old.value != null || r.won; }
  } else if ((r.stars || 0) > (old.stars || 0) && old.plays) newBest = true;
  all[key] = cur;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch {}
  return { newBest, best: cur };
}
