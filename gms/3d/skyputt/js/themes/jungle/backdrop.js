// Jungle Temple theme — backdrop set pieces (merged into Buckets; low segment counts, they sit 25-90 m
// away): a stepped pyramid with a stair, a shrine and a gold roof comb, overgrown with bushes; a
// waterfall gorge (two cliffs, the fall between them, mist at its foot); giant rainforest trees with
// lumpy canopy crowns; small ruin terraces with props.
// Builders return world-space { glows, flames, lianas: [{ p, len }], mists: [p], falls: [geometry] }.
import * as THREE from 'three';
import { mat, rng, fbm3, paint } from './util.js';
import { roundIsland, spikes, ROCK } from './island.js';
import { COLORS as K, stele, brazier, idol, brokenColumn, urns, bush, banana, fern, leafQuad } from './props.js';

const W = (M, v) => v.clone().applyMatrix4(M);
const res = () => ({ glows: [], flames: [], lianas: [], mists: [], falls: [] });

/** A lumpy canopy crown blob (vc, flat shaded look from icosahedron detail 0/1). */
function crown(b, M, R, col, hi) {
  const g = new THREE.IcosahedronGeometry(R, hi ? 1 : 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 0.8 + fbm3(x / R * 1.5 + M.elements[12], y / R * 1.5, z / R * 1.5, 2) * 0.45;
    p.setXYZ(i, x * k, y * k * 0.62, z * k);
  }
  b.add('stone', g, col, M);
}

/**
 * A giant rainforest tree at M (base at y = 0, down in the mist): a tall trunk, a few branches and
 * canopy crowns. Returns liana anchors under the branches.
 */
export function bigTree(b, M, H, hi, seed = 1) {
  const r = rng(seed), out = res();
  const tr = H * 0.035;
  b.add('vc', new THREE.CylinderGeometry(tr * 0.7, tr * 1.15, H, hi ? 8 : 6), 0x6a5a44, M.clone().multiply(mat(0, H / 2, 0)));
  const nb = hi ? 4 : 3;
  for (let i = 0; i < nb; i++) {
    const a = i / nb * Math.PI * 2 + r() * 0.8, y = H * (0.72 + r() * 0.2), L = H * (0.18 + r() * 0.1);
    const dir = new THREE.Vector3(Math.sin(a), 0.45, Math.cos(a)).normalize();
    const mid = new THREE.Vector3(0, y, 0).addScaledVector(dir, L / 2);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    b.add('vc', new THREE.CylinderGeometry(tr * 0.25, tr * 0.45, L, 5), 0x6a5a44, M.clone().multiply(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1))));
    const tip = new THREE.Vector3(0, y, 0).addScaledVector(dir, L);
    crown(b, M.clone().multiply(mat(tip.x, tip.y + H * 0.04, tip.z)), H * (0.14 + r() * 0.06), [0x2e5a2a, 0x3a6a30, 0x2a4e26][i % 3], hi);
    for (let k = 0; k < (hi ? 3 : 2); k++) {
      const t = 0.4 + k * 0.25, ap = new THREE.Vector3(0, y, 0).addScaledVector(dir, L * t);
      out.lianas.push({ p: W(M, ap), len: H * (0.2 + r() * 0.25) });
    }
  }
  crown(b, M.clone().multiply(mat(0, H * 1.02, 0)), H * 0.2, 0x34622c, hi);
  return out;
}

/** The stepped pyramid. M = placement (local Y up, its stair facing local +Z). ~26 m wide, ~20 m tall. */
export function buildPyramid(b, M, hi) {
  const out = res();
  const tiers = hi ? 7 : 5, W0 = 26, H0 = 20, th = H0 * 0.78 / tiers;
  for (let i = 0; i < tiers; i++) {
    const w = W0 * (1 - i / tiers * 0.72);
    const y = i * th;
    b.add('stone', new THREE.BoxGeometry(w, th * 0.92, w), i % 2 ? K.stone2 : K.stone, M.clone().multiply(mat(0, y + th * 0.46, 0)));
    b.add('stone', new THREE.BoxGeometry(w + 0.4, th * 0.1, w + 0.4), ROCK.moss, M.clone().multiply(mat(0, y + th * 0.95, 0)));
    // overgrowth: crowns on the tier corners
    if (i < tiers - 1) for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if ((i + sx + sz * 2) % 3 === 0) crown(b, M.clone().multiply(mat(sx * w * 0.42, y + th * 1.05, sz * w * 0.42)), th * 0.9, 0x3a6a30, false);
    }
  }
  // the stair up the front
  const topY = tiers * th, topW = W0 * (1 - (tiers - 1) / tiers * 0.72);
  const sLen = Math.hypot(topY, (W0 - topW) / 2);
  const ang = Math.atan2(topY, (W0 - topW) / 2);
  b.add('stone', new THREE.BoxGeometry(4.2, 1.2, sLen), K.stone2, M.clone().multiply(mat(0, topY / 2, (W0 + topW) / 4 + 0.4, ang - 0, 0, 0)).multiply(mat(0, 0, 0, 0, 0, 0)));
  for (const sx of [-1, 1]) b.add('stone', new THREE.BoxGeometry(0.6, 1.8, sLen), K.dark, M.clone().multiply(mat(sx * 2.4, topY / 2, (W0 + topW) / 4 + 0.4, ang, 0, 0)));
  // the shrine on top: a block with a dark doorway and a gold roof comb
  const sh = M.clone().multiply(mat(0, topY, 0));
  b.add('stone', new THREE.BoxGeometry(topW * 0.7, 3.6, topW * 0.6), K.stone, sh.clone().multiply(mat(0, 1.8, 0)));
  b.add('stone', new THREE.BoxGeometry(1.6, 2.4, 0.3), 0x2a2a24, sh.clone().multiply(mat(0, 1.2, topW * 0.3)));
  b.add('gold', new THREE.BoxGeometry(topW * 0.74, 0.5, topW * 0.64), K.gold, sh.clone().multiply(mat(0, 3.85, 0)));
  b.add('gold', new THREE.BoxGeometry(topW * 0.4, 2.4, 0.5), K.gold, sh.clone().multiply(mat(0, 5.2, 0)));
  for (const sx of [-1, 1]) {
    const fp = sh.clone().multiply(mat(sx * topW * 0.28, 0, topW * 0.32));
    const tip = brazier(b, fp.clone().multiply(mat(0, 0, 0, 0, 0, 0, 3)), 0.4, !hi);
    out.flames.push(W(fp.clone().multiply(mat(0, 0, 0, 0, 0, 0, 3)), tip));
  }
  out.glows.push({ p: W(sh, new THREE.Vector3(0, 1.2, topW * 0.32)), w: 3, color: [1, 0.7, 0.3], a: 0.25 });
  // lianas down the front tiers
  for (let i = 0; i < (hi ? 6 : 3); i++) out.lianas.push({ p: W(M, new THREE.Vector3((i - 2.5) * 3.2, th * (2 + (i % 3)), W0 * 0.3)), len: th * 1.5 });
  return out;
}

/** A tall cliff block (rock mesh): a lumpy prism, earth / moss coloured. */
function cliff(rocks, M, w, h, d, seed, hi) {
  const g = new THREE.BoxGeometry(w, h, d, hi ? 4 : 2, hi ? 6 : 3, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = fbm3(x * 0.15 + seed, y * 0.12, z * 0.15, 3) - 0.5;
    p.setXYZ(i, x * (1 + n * 0.5), y, z + n * d * 0.4);
  }
  g.translate(0, h / 2, 0);
  const pg = paint(g, ROCK.earth2, M, true);
  rocks.push(pg);
  return pg;
}

/** The waterfall gorge: two cliffs with trees on top, the fall between them, mist at its foot. */
export function buildGorge(b, rocks, M, hi) {
  const out = res();
  const H = 34, gapW = 7;
  for (const s of [-1, 1]) {
    cliff(rocks, M.clone().multiply(mat(s * (gapW / 2 + 5), -20, 0, 0, s * 0.15, 0)), 10, H + (s > 0 ? 4 : 0), 9, 40 + s, hi);
    for (let k = 0; k < 3; k++) crown(b, M.clone().multiply(mat(s * (gapW / 2 + 2 + k * 3), H - 20 + (s > 0 ? 4 : 0), (k - 1) * 2.5)), 3 + k * 0.6, [0x2e5a2a, 0x3a6a30, 0x2a4e26][k], hi);
  }
  // the back wall the fall pours over
  cliff(rocks, M.clone().multiply(mat(0, -20, -4)), gapW + 4, H - 4, 4, 47, hi);
  // the fall: a tall strip (one quad column, uv along the drop), bowed outward a little
  const fall = new THREE.PlaneGeometry(gapW * 0.6, H - 2, 1, 8);
  const fp = fall.attributes.position;
  for (let i = 0; i < fp.count; i++) { const y = fp.getY(i) / (H - 2) + 0.5; fp.setZ(i, Math.sin(y * Math.PI) * 0.6 + (1 - y) * 1.5); }
  fall.translate(0, (H - 2) / 2 - 22, -1.6);
  fall.applyMatrix4(M);
  out.falls.push(fall);
  for (let i = 0; i < (hi ? 10 : 5); i++) out.mists.push(W(M, new THREE.Vector3((i % 5 - 2) * 1.6, -21 + (i % 3) * 1.5, -0.5 + (i % 2) * 1.5)));
  for (let i = 0; i < (hi ? 5 : 3); i++) out.lianas.push({ p: W(M, new THREE.Vector3((i % 2 ? 1 : -1) * (gapW / 2 + 0.6), H - 21 - i * 2, 4)), len: 5 + i });
  return out;
}

/**
 * A small ruin terrace floating in the haze with a set of props. `basis` = view rotation (Matrix4).
 * Adds its rock to `rocks`. kind: 'stelae' | 'shrine' | 'columns' | 'garden' | 'idol'.
 */
export function buildRuin(b, rocks, basis, p, R, D, kind, seed, hi) {
  const r = rng(seed), out = res();
  const { geometry } = roundIsland(R, D, seed, hi, hi ? 12 : 8);
  const IM = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z).multiply(basis);
  geometry.applyMatrix4(IM);
  rocks.push(geometry);
  const sp = [];
  spikes(sp, 0, -D * 0.5, 0, R, D, hi ? 2 : 1, seed + 1);
  for (const g of sp) { g.applyMatrix4(IM); rocks.push(g); }
  const s = R / 2.5;
  const Pm = (x, z, yaw = 0, k = s) => IM.clone().multiply(mat(x * R, -0.03, z * R, 0, yaw, 0, k));
  if (kind === 'stelae') {
    for (let i = 0; i < 3; i++) stele(b, Pm(-0.5 + i * 0.5, 0.1 * (i - 1), r() * 0.4, s * 3), 0.6);
    fern(b, Pm(0.5, 0.4, 0, s * 3), 0.3, !hi);
  } else if (kind === 'shrine') {
    const M2 = Pm(0, 0, 0, s * 3);
    out.flames.push(W(M2, brazier(b, M2, 0.36, !hi)));
    banana(b, Pm(0.45, -0.3, 0, s * 3), 0.7, !hi);
  } else if (kind === 'columns') {
    for (let i = 0; i < 3; i++) brokenColumn(b, Pm(Math.cos(i * 2.1) * 0.5, Math.sin(i * 2.1) * 0.5, r() * 6, s * 3), 0.5 + r() * 0.2, !hi);
  } else if (kind === 'idol') {
    idol(b, Pm(0, 0, 0, s * 4), 0.35);
    urns(b, Pm(0.5, 0.2, 0, s * 3), 0.22, 2, !hi);
  } else {
    for (let i = 0; i < 3; i++) bush(b, Pm((r() - 0.5) * 1.1, (r() - 0.5) * 1.1, r() * 6, s * 3), 0.4, !hi);
    banana(b, Pm(0, 0, 0, s * 3), 0.8, !hi);
  }
  // roots and vines hang under every terrace
  for (let i = 0; i < (hi ? 3 : 2); i++) { const a = r() * Math.PI * 2; out.lianas.push({ p: W(IM, new THREE.Vector3(Math.cos(a) * R * 0.95, -0.2, Math.sin(a) * R * 0.95)), len: D * (0.5 + r() * 0.5) }); }
  return out;
}
void leafQuad;
