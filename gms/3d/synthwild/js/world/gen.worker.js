// Module worker: terrain generation + column light. Message in: { seed, cx, cz, mods }.
import { makeTerrain } from './terrain.js';
import { buildColumn } from './column.js';

let terrain = null, seed = null;
self.onmessage = (e) => {
  const d = e.data;
  if (!terrain || d.seed !== seed) { seed = d.seed; terrain = makeTerrain(seed); }
  const { msg, transfer } = buildColumn(terrain, d.cx, d.cz, d.mods);
  self.postMessage(msg, transfer);
};
