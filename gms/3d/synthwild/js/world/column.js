// Generate + overlay saved edits + light one chunk column. Shared by the worker and the sync path.
import { lightColumn } from './light.js';
import { decodeSection } from './persist.js';
import { packSubs } from './section.js';

// mods: { [sy]: base64 section } or null
export function buildColumn(terrain, cx, cz, mods) {
  const t0 = now();
  const g = terrain.genColumn(cx, cz);
  const t1 = now();
  const cells = g.cells;
  const modSubs = [];
  if (mods) for (const k in mods) {
    const sy = +k, d = decodeSection(mods[k]);
    cells.set(d.cells, sy * 4096);
    modSubs[sy] = d.subs;
  }
  const light = new Uint8Array(cells.length);
  lightColumn(cells, light, (i, ix) => modSubs[i >> 12][ix]);
  const secs = [], transfer = [g.heights.buffer, g.waters.buffer, g.biomes.buffer];
  for (let sy = 0; sy < 8; sy++) {
    const c = cells.slice(sy * 4096, sy * 4096 + 4096), l = light.slice(sy * 4096, sy * 4096 + 4096);
    const modified = !!modSubs[sy];
    if (!modified) {
      let empty = true;
      for (let i = 0; i < 4096 && empty; i++) if (c[i] !== 0 || l[i] !== 0xf0) empty = false;
      if (empty) { secs.push(null); continue; }
    }
    let subs = new Uint8Array(0);
    if (modified) {
      const p = packSubs({ cells: c, subs: modSubs[sy] });
      c.set(p.cells); subs = p.subs;
    }
    secs.push({ sy, cells: c, light: l, subs, modified });
    transfer.push(c.buffer, l.buffer, subs.buffer);
  }
  return {
    msg: { cx, cz, secs, heights: g.heights, waters: g.waters, biomes: g.biomes, genMs: t1 - t0, totalMs: now() - t0 },
    transfer,
  };
}

function now() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
