// node tools/sculpt/bake_odie.mjs → js/actors/odie_mesh.js (3 LODs, skin weights, tone). Same pipeline as bake.mjs.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evalSculpt } from '../../js/actors/shared/sdf.js';
import { sdfMesh, smoothAttr, neighbours, project } from '../../js/actors/shared/surfacenets.js';
import { decimate } from '../../js/actors/shared/decimate.js';
import { BONES, BONE_INDEX } from '../../js/actors/odie_rig.js';
import { build, paint, BOUNDS } from './odie_sculpt.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../js/actors/odie_mesh.js');
const FINE_H = +(process.env.FINE_H || 0.0045);
const LODS = { high: 11500, medium: 6000, low: 3200 };

const prims = build();
const paints = paint();
const f = (p) => evalSculpt(prims, p);
const NB = BONES.length;
const BLACK = new Set(['earL0', 'earL1', 'earR0', 'earR1']);
const PINK = new Set(['tongue0', 'tongue1', 'tongue2']);

function grad(fn, p, e = 0.0004) {
  const gx = fn([p[0] + e, p[1], p[2]]) - fn([p[0] - e, p[1], p[2]]);
  const gy = fn([p[0], p[1] + e, p[2]]) - fn([p[0], p[1] - e, p[2]]);
  const gz = fn([p[0], p[1], p[2] + e]) - fn([p[0], p[1], p[2] - e]);
  const l = Math.hypot(gx, gy, gz) || 1;
  return [gx / l, gy / l, gz / l];
}
function fixOrient(pos, idx) {
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const cen = [(pos[a] + pos[b] + pos[c]) / 3, (pos[a + 1] + pos[b + 1] + pos[c + 1]) / 3, (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3];
    const g = grad(f, cen);
    if (nx * g[0] + ny * g[1] + nz * g[2] < 0) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  }
}

let FINE = null;
function bakeLod(target) {
  const t0 = Date.now();
  if (!FINE) { FINE = sdfMesh(f, BOUNDS.min, BOUNDS.max, FINE_H, { relaxIters: 3 }); fixOrient(FINE.pos, FINE.idx); console.log('fine', FINE.idx.length / 3, 'tris'); }
  const d = decimate(FINE.pos, FINE.idx, target);
  const m = { pos: d.pos, idx: d.idx };
  m.nb = neighbours(m.pos.length / 3, m.idx);
  project(f, m.pos, 3);
  const h = 0.011 * Math.sqrt(11500 / target);
  const nv = m.pos.length / 3, pos = m.pos, idx = m.idx;
  fixOrient(pos, idx);
  const nrm = new Float32Array(nv * 3), W = new Float32Array(nv * NB), tone = new Float32Array(nv * 3);
  const dist = new Float32Array(prims.length), p = [0, 0, 0];
  for (let v = 0; v < nv; v++) {
    p[0] = pos[v * 3]; p[1] = pos[v * 3 + 1]; p[2] = pos[v * 3 + 2];
    nrm.set(grad(f, p), v * 3);
    evalSculpt(prims, p, dist);
    let dmin = 1e9;
    for (let i = 0; i < dist.length; i++) dmin = Math.min(dmin, dist[i]);
    for (let i = 0; i < dist.length; i++) {
      const w = Math.exp(-(dist[i] - dmin) / 0.008);
      if (w > 1e-3) W[v * NB + BONE_INDEX[prims[i].bone]] += w;
    }
    for (const pv of paints) {
      const a = Math.min(1, Math.max(0, (0.01 - pv.d(p)) / 0.02));
      tone[v * 3 + pv.ch] = Math.max(tone[v * 3 + pv.ch], a * a * (3 - 2 * a));
    }
  }
  const norm = () => { for (let v = 0; v < nv; v++) { let s = 0; for (let b = 0; b < NB; b++) s += W[v * NB + b]; for (let b = 0; b < NB; b++) W[v * NB + b] /= s || 1; } };
  norm();
  // colour from the raw (pre-diffusion) ownership: crisp black ears/tail, pink tongue
  for (let v = 0; v < nv; v++) {
    let k = 0, pk = 0;
    for (let b = 0; b < NB; b++) { if (BLACK.has(BONES[b][0])) k += W[v * NB + b]; if (PINK.has(BONES[b][0])) pk += W[v * NB + b]; }
    tone[v * 3] = Math.max(tone[v * 3], Math.min(1, k * 1.6)); tone[v * 3 + 1] = Math.max(tone[v * 3 + 1], Math.min(1, pk * 1.6));
  }
  smoothAttr(W, NB, m.nb, 0.5, Math.round(0.025 / h));
  norm();
  smoothAttr(tone, 3, m.nb, 0.5, 1);
  const skinI = new Uint8Array(nv * 4), skinW = new Uint8Array(nv * 4);
  for (let v = 0; v < nv; v++) {
    const order = [...Array(NB).keys()].sort((a, b) => W[v * NB + b] - W[v * NB + a]).slice(0, 4);
    let s = 0; for (const b of order) s += W[v * NB + b];
    let acc = 0;
    order.forEach((b, k) => {
      skinI[v * 4 + k] = b;
      const q = k === 3 ? 255 - acc : Math.round(W[v * NB + b] / s * 255);
      skinW[v * 4 + k] = Math.max(0, q); acc += q;
    });
  }
  console.log(`target=${target}: ${nv} verts, ${idx.length / 3} tris, ${(Date.now() - t0) / 1000}s`);
  return { nv, nrm, pos, idx, skinI, skinW, tone };
}

const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');
const QMIN = BOUNDS.min.map((v) => v - 0.2), QR = 1.6;
function enc(L) {
  const q = new Int16Array(L.nv * 3);
  for (let i = 0; i < q.length; i++) q[i] = Math.round(((L.pos[i] - QMIN[i % 3]) / QR) * 65535 - 32768);
  const qn = (a) => { const o = new Int8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.max(-127, Math.min(127, Math.round(a[i] * 127))); return o; };
  const tn = new Uint8Array(L.nv * 3);
  for (let i = 0; i < tn.length; i++) tn[i] = Math.round(L.tone[i] * 255);
  return { nv: L.nv, ni: L.idx.length, pos: b64(q), nrm: b64(qn(L.nrm)), idx: b64(Uint16Array.from(L.idx)), si: b64(L.skinI), sw: b64(L.skinW), tone: b64(tn) };
}
const out = { bones: BONES.map((b) => b[0]), qmin: QMIN, qr: QR, lods: {} };
for (const [name, t] of Object.entries(LODS)) out.lods[name] = enc(bakeLod(t));
writeFileSync(OUT, '// generated by tools/sculpt/bake_odie.mjs — do not edit\nexport const MESH = ' + JSON.stringify(out) + ';\n');
console.log('wrote', OUT);
