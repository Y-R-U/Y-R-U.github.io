// node tools/sculpt/bake.mjs  → writes js/actors/garfield_mesh.js (3 LODs, skin weights, tone, belly morph)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { evalSculpt } from '../../js/actors/shared/sdf.js';
import { sdfMesh, smoothAttr, neighbours, project, relax } from '../../js/actors/shared/surfacenets.js';
import { decimate } from '../../js/actors/shared/decimate.js';
import { BONES, BONE_INDEX } from '../../js/actors/garfield_rig.js';
import { build, paint, BOUNDS } from './garfield_sculpt.js';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../../js/actors/garfield_mesh.js');
const FINE_H = +(process.env.FINE_H || 0.006);
const LODS = { high: 14000, medium: 7000, low: 3600 };

const prims = build({ fat: 0 });
const fatPrims = build({ fat: 1 });
const paints = paint();
const f = (p) => evalSculpt(prims, p);
const fFat = (p) => evalSculpt(fatPrims, p);
const NB = BONES.length;
const LEGS = new Set(['shoulderL','elbowL','pawL','shoulderR','elbowR','pawR','thighL','shinL','footL','thighR','shinR','footR']);
const LIMB = new Set(['pawL','pawR','footL','footR','tail0','tail1','tail2','tail3','tail4','tail5','earL','earR','jaw']);

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
  const h = 0.012 * Math.sqrt(14000 / target);
  const nv = m.pos.length / 3;
  const pos = m.pos, idx = m.idx;
  fixOrient(pos, idx);
  const nrm = new Float32Array(nv * 3);
  const W = new Float32Array(nv * NB);
  const tone = new Float32Array(nv * 3);
  const dist = new Float32Array(prims.length);
  const p = [0, 0, 0];
  for (let v = 0; v < nv; v++) {
    p[0] = pos[v * 3]; p[1] = pos[v * 3 + 1]; p[2] = pos[v * 3 + 2];
    const g = grad(f, p);
    nrm.set(g, v * 3);
    evalSculpt(prims, p, dist);
    let dmin = 1e9;
    for (let i = 0; i < dist.length; i++) dmin = Math.min(dmin, dist[i]);
    for (let i = 0; i < dist.length; i++) {
      const w = Math.exp(-(dist[i] - dmin) / 0.01);
      if (w > 1e-3) W[v * NB + BONE_INDEX[prims[i].bone]] += w;
    }
    for (const pv of paints) {
      const d = pv.d(p);
      const a = Math.min(1, Math.max(0, (0.012 - d) / 0.024));
      tone[v * 3 + pv.ch] = Math.max(tone[v * 3 + pv.ch], a * a * (3 - 2 * a));
    }
  }
  // normalise then diffuse weights over the surface for soft joints
  const norm = () => { for (let v = 0; v < nv; v++) { let s = 0; for (let b = 0; b < NB; b++) s += W[v * NB + b]; for (let b = 0; b < NB; b++) W[v * NB + b] /= s || 1; } };
  norm();
  smoothAttr(W, NB, m.nb, 0.5, Math.round(0.03 / h));
  norm();
  for (let v = 0; v < nv; v++) { let l = 0; for (let b = 0; b < NB; b++) if (LEGS.has(BONES[b][0])) l += W[v * NB + b]; tone[v * 3 + 2] = l; }
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
  // belly morph: push each vertex out along its normal onto the fat surface
  const dpos = new Float32Array(nv * 3), dn = new Float32Array(nv * 3);
  const amt = new Float32Array(nv);
  for (let v = 0; v < nv; v++) {
    p[0] = pos[v * 3]; p[1] = pos[v * 3 + 1]; p[2] = pos[v * 3 + 2];
    if (fFat(p) >= 0) continue;
    const n = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    let lo = 0, hi = 0.3;
    for (let it = 0; it < 24; it++) { const mid = (lo + hi) / 2; if (fFat([p[0] + n[0] * mid, p[1] + n[1] * mid, p[2] + n[2] * mid]) < 0) lo = mid; else hi = mid; }
    let limb = 0;
    for (let b = 0; b < NB; b++) if (LIMB.has(BONES[b][0])) limb += W[v * NB + b];
    const up = Math.min(1, Math.max(0, (0.39 - p[1]) / 0.1));
    amt[v] = lo * Math.max(0, 1 - limb * 1.5) * up * up * (3 - 2 * up);
    dpos[v * 3] = n[0]; dpos[v * 3 + 1] = n[1]; dpos[v * 3 + 2] = n[2];
  }
  smoothAttr(amt, 1, m.nb, 0.5, Math.round(0.05 / h));
  for (let v = 0; v < nv; v++) {
    const a = amt[v];
    let dx = nrm[v * 3] * a, dy = nrm[v * 3 + 1] * a, dz = nrm[v * 3 + 2] * a;
    // keep the belly off the floor
    const ny = pos[v * 3 + 1] + dy;
    if (ny < 0.012) dy += 0.012 - ny;
    dpos[v * 3] = dx; dpos[v * 3 + 1] = dy; dpos[v * 3 + 2] = dz;
    if (a > 1e-4) {
      const g = grad(fFat, [pos[v * 3] + dx, pos[v * 3 + 1] + dy, pos[v * 3 + 2] + dz]);
      const k = Math.min(1, a / 0.01);
      for (let c = 0; c < 3; c++) dn[v * 3 + c] = (g[c] - nrm[v * 3 + c]) * k;
    }
  }
  console.log(`target=${target}: ${nv} verts, ${idx.length / 3} tris, ${(Date.now() - t0) / 1000}s`);
  return { nv, nrm, pos, idx, skinI, skinW, tone, dpos, dn };
}

const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');
const QMIN = BOUNDS.min.map((v) => v - 0.2), QR = 1.6;
function enc(L) {
  const q = new Int16Array(L.nv * 3);
  for (let i = 0; i < q.length; i++) q[i] = Math.round(((L.pos[i] - QMIN[i % 3]) / QR) * 65535 - 32768);
  const qn = (a) => { const o = new Int8Array(a.length); for (let i = 0; i < a.length; i++) o[i] = Math.max(-127, Math.min(127, Math.round(a[i] * 127))); return o; };
  const qd = new Int16Array(L.nv * 3);
  for (let i = 0; i < qd.length; i++) qd[i] = Math.round(L.dpos[i] / 0.4 * 32767);
  const tn = new Uint8Array(L.nv * 3);
  for (let i = 0; i < tn.length; i++) tn[i] = Math.round(L.tone[i] * 255);
  return { nv: L.nv, ni: L.idx.length, pos: b64(q), nrm: b64(qn(L.nrm)), idx: b64(L.nv < 65536 ? Uint16Array.from(L.idx) : L.idx), si: b64(L.skinI), sw: b64(L.skinW), tone: b64(tn), dpos: b64(qd), dn: b64(qn(L.dn)) };
}

const out = { bones: BONES.map((b) => b[0]), qmin: QMIN, qr: QR, dscale: 0.4, lods: {} };
for (const [name, t] of Object.entries(LODS)) out.lods[name] = enc(bakeLod(t));
writeFileSync(OUT, '// generated by tools/sculpt/bake.mjs — do not edit\nexport const MESH = ' + JSON.stringify(out) + ';\n');
console.log('wrote', OUT);
