import { meshSection } from './mesher_core.js';

let table = null;
self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'table') { table = msg.table; return; }
  if (msg.type !== 'mesh' || !table) return;
  let res;
  try { res = meshSection(msg.payload, table); }
  catch (err) { self.postMessage({ type: 'error', id: msg.id, key: msg.key, gen: msg.gen, error: String(err && err.stack || err) }); return; }
  const transfer = [];
  for (const k of ['opaque', 'cutout', 'water']) {
    const g = res[k];
    if (g) transfer.push(g.pos.buffer, g.uv.buffer, g.data.buffer, g.index.buffer);
  }
  self.postMessage({ type: 'mesh', id: msg.id, key: msg.key, gen: msg.gen, version: msg.version, res }, transfer);
};
