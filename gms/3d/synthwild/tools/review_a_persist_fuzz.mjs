// Review R1 (client): random edits → (unload/reload) → serialize → JSON → deserialize; every sub must match.
// node tools/review_a_persist_fuzz.mjs [iterations]
import { World } from '../js/world/world.js';
import { BLOCKS } from '../js/data/blocks.js';

const N = +(process.argv[2] || 6);
let seedR = 12345;
const rnd = () => ((seedR = (seedR * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const mats = BLOCKS.filter((b) => b && b.id).map((b) => b.id);
const R = 20; // metres around the origin, spans 4 chunks
let bad = 0;

function snap(w) {
  const out = new Uint8Array((2 * R * 4) * (2 * R * 4) * 60 * 4);
  let o = 0;
  for (let sy = 30 * 4; sy < 90 * 4; sy++) for (let sz = -R * 4; sz < R * 4; sz++) for (let sx = -R * 4; sx < R * 4; sx++) out[o++] = w.getSub(sx, sy, sz);
  return out;
}

for (let it = 0; it < N; it++) {
  const w = new World({ seed: 'fuzz' + it, sync: true });
  w.ensureArea(0, 0, 2);
  for (let e = 0; e < 120; e++) {
    const x = ri(-R * 4, R * 4 - 40), y = ri(30 * 4, 85 * 4), z = ri(-R * 4, R * 4 - 40);
    const s = [ri(1, 24), ri(1, 24), ri(1, 24)];
    const mode = ['fill', 'hollow', 'shell', 'replace'][ri(0, 3)];
    const mat = rnd() < 0.3 ? 0 : mats[ri(0, mats.length - 1)];
    w.setBox([x, y, z], [x + s[0], y + s[1], z + s[2]], mat, mode, { wall: ri(1, 4) });
    if (e === 60) { w.update(5000, 5000, 2); w.ensureArea(5000, 5000, 1); w.update(0, 0, 2); w.ensureArea(0, 0, 2); } // unload, reload
  }
  w.finishLight();
  const a = snap(w);
  const save = JSON.parse(JSON.stringify(w.serialize()));
  const w2 = World.deserialize(save, { sync: true });
  w2.ensureArea(0, 0, 2);
  const b = snap(w2);
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  const resave = JSON.stringify(w2.serialize()) === JSON.stringify(save);
  console.log(`iter ${it}: ${Object.keys(save.sections).length} sections, sub diffs ${diff}, re-serialize identical ${resave}`);
  if (diff || !resave) bad++;
}
console.log(bad ? `FAIL ${bad}/${N}` : `PASS ${N}/${N}`);
