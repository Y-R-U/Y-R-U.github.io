// Chapter Two levels, Free Play 2 and the arena (docs/LEVELS2.md). Keys match core/game.js levelInfo().
export { playStory } from './story.js';
const mods = {};
const load = async (key, path) => { try { mods[key] = (await import(path)).default; } catch (e) { if (!/Failed to fetch|Importing a module script failed/.test(e.message)) console.error('[ch2]', key, e); } };
await Promise.all([
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => load('c2:' + n, `./c2_${String(n).padStart(2, '0')}.js`)),
  load('fp2', '../freeplay2.js'),
  load('arena', '../arena.js'),
]);
export const ch2Levels = Object.fromEntries(Object.entries(mods).filter(([, v]) => v));
