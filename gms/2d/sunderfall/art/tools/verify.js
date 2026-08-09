// Sanity-check game/assets/atlas.json against the files on disk.
//   node verify.js
const fs = require('fs');
const path = require('path');
const { readPNG, readImage } = require('./img.js');

const ASSETS = path.resolve(__dirname, '..', '..', 'game', 'assets');
const man = JSON.parse(fs.readFileSync(path.join(ASSETS, 'atlas.json')));
const errors = [], warn = [];

for (const [name, a] of Object.entries(man.atlases)) {
  const p = path.join(ASSETS, a.image);
  if (!fs.existsSync(p)) { errors.push(`atlas ${name}: missing ${a.image}`); continue; }
  const im = readImage(p);
  if (im.w !== a.w || im.h !== a.h) errors.push(`atlas ${name}: declared ${a.w}x${a.h}, file is ${im.w}x${im.h}`);
  for (const [id, f] of Object.entries(a.frames)) {
    if (f.x < 0 || f.y < 0 || f.x + f.w > im.w || f.y + f.h > im.h)
      errors.push(`frame ${name}/${id} out of bounds`);
    if (f.ax < 0 || f.ax > f.w || f.ay < 0 || f.ay > f.h)
      warn.push(`frame ${name}/${id} anchor outside the frame (${f.ax},${f.ay} in ${f.w}x${f.h})`);
  }
}

const has = (atlas, id) => man.atlases[atlas] && man.atlases[atlas].frames[id];
for (const [id, m] of Object.entries(man.materials)) {
  for (const s of m.states) if (!has('props', s)) errors.push(`material ${id}: no props frame "${s}"`);
  if (m.settled && !has('props', m.settled)) errors.push(`material ${id}: no props frame "${m.settled}"`);
  for (const d of m.debris) if (!has('debris', d)) errors.push(`material ${id}: no debris frame "${d}"`);
  if (m.debris.length < 6) warn.push(`material ${id}: only ${m.debris.length} debris chunks`);
}
for (const [id, c] of Object.entries(man.composites || {}))
  for (const p of c.parts) if (!man.materials[p.id]) errors.push(`composite ${id}: unknown part "${p.id}"`);

for (const [kind, t] of Object.entries(man.terrain)) {
  for (const r of t.run) if (!has('terrain', r)) errors.push(`terrain ${kind}: no frame "${r}"`);
  for (const k of [t.capL, t.capR, t.wall, ...Object.values(t.ledge)])
    if (!has('terrain', k)) errors.push(`terrain ${kind}: no frame "${k}"`);
}
for (const d of man.decals) if (!has('terrain', d)) errors.push(`decal "${d}" not in the terrain atlas`);

for (const [loc, rec] of Object.entries(man.backgrounds)) {
  const kinds = rec.bands.map(b => b.id.split('_').pop());
  for (const need of ['sky', 'far', 'mid', 'near', 'fg'])
    if (!kinds.includes(need)) errors.push(`location ${loc}: no "${need}" band`);
  for (const b of rec.bands) {
    const p = path.join(ASSETS, b.image);
    if (!fs.existsSync(p)) { errors.push(`band ${b.id}: missing ${b.image}`); continue; }
    const im = readImage(p);
    if (im.w !== b.w || im.h !== b.h) errors.push(`band ${b.id}: declared ${b.w}x${b.h}, file is ${im.w}x${im.h}`);
  }
}

let bytes = 0;
const walk = d => { for (const f of fs.readdirSync(d, { withFileTypes: true })) {
  const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else bytes += fs.statSync(p).size; } };
walk(ASSETS);
const mb = bytes / 1048576;
if (mb > 12) errors.push(`payload ${mb.toFixed(2)} MB exceeds the 12 MB budget`);

warn.forEach(w => console.log('warn: ' + w));
errors.forEach(e => console.log('ERROR: ' + e));
console.log(`payload ${mb.toFixed(2)} MB, ${errors.length} errors, ${warn.length} warnings`);
process.exit(errors.length ? 1 : 0);
