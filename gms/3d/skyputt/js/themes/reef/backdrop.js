// Sunken Reef theme — backdrop set pieces: a sunken sailing ship listing on the seabed (a planked hull
// with a weed line and barnacles, deck, stern cabin with faintly glowing windows, a standing foremast
// with a tattered sail, the mainmast snapped off, a bowsprit and a lantern still glowing), an old
// ruined temple on a stepped plinth (fluted columns, some broken, an architrave and pediment, a
// half-buried statue head, an arch, glowing sea-lamps) and small reef outcrops with corals, kelp,
// clams, amphorae, anemones or fallen columns. Merged into buckets by the caller.
import * as THREE from 'three';
import { rng, mat, noise3 } from './util.js';
import { roundIsland, spikes } from './island.js';
import { anemone, clam, amphora, brokenColumn, fallenDrum, lanternPost, barrel, anchorProp, chest, brainCoral, tubeSponges, starfish, COLORS } from './props.js';

const put = (b, key, geo, color, M, local, keepUv = false) => b.add(key === 'coral' ? 'vc' : key, geo, color, local ? M.clone().multiply(local) : M, keepUv);

/** Planked hull geometry (vertex coloured, no uv), bow toward +x, keel at y = 0, deck edge at y = H. */
function hullGeometry(L, W, H, hi) {
  const NS = hi ? 28 : 16, NJ = hi ? 12 : 8;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color(), wood = new THREE.Color(COLORS.wood), wood2 = new THREE.Color(COLORS.wood2),
    weed = new THREE.Color(0x4a6a3a), barn = new THREE.Color(0xc8c0b0), dark = new THREE.Color(0x2a2218);
  const half = (t) => W / 2 * Math.min(1, (1 - t) * 3.2) * Math.min(1, 0.72 + t * 3) + 0.05;
  const sheer = (t) => H + Math.pow(Math.abs(t - 0.45) * 2, 2) * H * 0.25;
  for (let i = 0; i <= NS; i++) {
    const t = i / NS, x = -L / 2 + t * L, w = half(t), top = sheer(t);
    for (let j = 0; j <= NJ; j++) {
      const th = j / NJ * Math.PI;
      const s = Math.sin(th);
      const y = top - (top - 0) * Math.pow(s, 0.6) * (1 - 0.15 * Math.pow(Math.abs(t - 0.5) * 2, 3));
      const z = Math.cos(th) * w * (0.85 + 0.15 * s);
      pos.push(x, y, z);
      const plank = (Math.floor(y / 0.35) % 2) ? 1 : 0.86;
      c.copy(wood).lerp(wood2, noise3(x * 0.4, y * 3, z)).multiplyScalar(plank);
      if (y < H * 0.45) c.lerp(weed, 0.55 * (1 - y / (H * 0.45)) + 0.2);
      if (noise3(x * 1.7, y * 1.7, z * 1.7 + 4) > 0.72) c.copy(barn);
      if (z > 0 && Math.abs(x + L * 0.08) < L * 0.09 && y > H * 0.3 && y < H * 0.75) c.copy(dark);   // the breach
      col.push(c.r, c.g, c.b);
    }
  }
  const R = NJ + 1;
  for (let i = 0; i < NS; i++) for (let j = 0; j < NJ; j++) {
    const a = i * R + j, b2 = a + R;
    idx.push(a, a + 1, b2, a + 1, b2 + 1, b2);
  }
  // transom (flat stern)
  const base = pos.length / 3;
  pos.push(-L / 2, H * 0.6, 0); col.push(wood2.r, wood2.g, wood2.b);
  for (let j = 0; j < NJ; j++) idx.push(base, j + 1, j);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = g.toNonIndexed(); g.dispose();
  return { geometry: out, half, sheer };
}

/**
 * Sunken ship at local origin (keel on y = 0), bow toward +x, ~22 m long. M places it (already listing).
 * Returns { glows: [{p (world), w, color, a}], bubbles: [Vector3 (world)] }.
 */
export function buildShip(b, M, hi) {
  const r = rng(707);
  const L = 22, W = 6.4, H = 4.2;
  const glows = [], bubbles = [];
  const Wp = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M);
  const hull = hullGeometry(L, W, H, hi);
  hull.geometry.applyMatrix4(M);
  b.addRaw('wood', hull.geometry);
  // deck planks (one box per station band)
  const NS = hi ? 10 : 6;
  for (let i = 0; i < NS; i++) {
    const t = (i + 0.5) / NS, x = -L / 2 + t * L, w = hull.half(t) * 1.9, y = hull.sheer(t) - 0.35;
    put(b, 'wood', new THREE.BoxGeometry(L / NS * 1.02, 0.18, w), i % 2 ? COLORS.wood3 : COLORS.wood, M, mat(x, y, 0));
  }
  // rail posts along both sides
  if (hi) for (let i = 1; i < 14; i++) {
    const t = i / 14, x = -L / 2 + t * L, w = hull.half(t), y = hull.sheer(t);
    for (const s of [-1, 1]) put(b, 'wood', new THREE.BoxGeometry(0.14, 0.7, 0.14), COLORS.wood2, M, mat(x, y + 0.3, s * w * 0.95));
  }
  // stern cabin with windows
  put(b, 'wood', new THREE.BoxGeometry(4.4, 2.4, 4.6), COLORS.wood2, M, mat(-L / 2 + 2.6, H + 1.0, 0));
  put(b, 'wood', new THREE.BoxGeometry(5.0, 0.3, 5.2), COLORS.wood3, M, mat(-L / 2 + 2.6, H + 2.3, 0, 0, 0, 0.04));
  for (const z of [-1.2, 0, 1.2]) put(b, 'win', new THREE.BoxGeometry(0.1, 0.6, 0.5), null, M, mat(-L / 2 + 0.35, H + 1.1, z));
  for (const x of [-L / 2 + 1.6, -L / 2 + 3.4]) put(b, 'win', new THREE.BoxGeometry(0.6, 0.5, 0.1), null, M, mat(x, H + 1.2, 2.32));
  glows.push({ p: Wp(-L / 2 + 0.2, H + 1.1, 0), w: 4, color: [0.5, 1, 0.9], a: 0.25 });
  // foremast standing, with a yard and a tattered sail; the mainmast snapped off
  const fx = L * 0.22;
  put(b, 'wood', new THREE.CylinderGeometry(0.16, 0.24, 13, 7), COLORS.wood2, M, mat(fx, H + 6.2, 0));
  put(b, 'wood', new THREE.CylinderGeometry(0.1, 0.12, 7, 6), COLORS.wood2, M, mat(fx, H + 10.5, 0, Math.PI / 2, 0, 0.05));
  put(b, 'wood', new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), COLORS.wood3, M, mat(fx, H + 12.4, 0));   // crow's nest
  {
    const sail = new THREE.PlaneGeometry(6.2, 5, 8, 6);
    const p = sail.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      p.setZ(i, Math.sin((y + 2.5) / 5 * Math.PI) * 0.7 + (noise3(x, y, 9) - 0.5) * 0.5);
      if (y < -1.6 && noise3(x * 1.3, 0, 3) > 0.45) p.setY(i, y + 1.2 * noise3(x * 2, 1, 4));   // torn hem
    }
    put(b, 'cloth', sail, 0xb8b090, M, mat(fx + 0.3, H + 7.8, 0, 0, Math.PI / 2, 0));
  }
  put(b, 'wood', new THREE.CylinderGeometry(0.2, 0.28, 3.4, 7), COLORS.wood2, M, mat(-L * 0.08, H + 1.5, 0, 0.1, 0, 0.12));
  put(b, 'wood', new THREE.CylinderGeometry(0.17, 0.2, 9, 7), COLORS.wood2, M, mat(-L * 0.08 - 3.8, H + 0.2, 3.5, 0.6, 0.3, 1.25));   // the broken top, fallen over the side
  // bowsprit and a figurehead lump
  put(b, 'wood', new THREE.CylinderGeometry(0.1, 0.18, 7, 6), COLORS.wood2, M, mat(L / 2 + 2.2, H + 1.4, 0, 0, 0, -1.2));
  // a lantern hanging at the stern, still glowing
  const lp = lanternPost(b, M.clone().multiply(mat(-L / 2 + 0.6, H + 2.4, 2.0)), 1.6, !hi);
  glows.push({ p: Wp(-L / 2 + 0.6 + lp.x, H + 2.4 + lp.y, 2.0), w: 2.6, color: [0.6, 1, 0.85], a: 0.55 });
  // barrels, an anchor and a chest spilled on the sand beside it
  barrel(b, M.clone().multiply(mat(3, 0, W * 0.7, 0, 0.4, 0)), 1.1, true, !hi);
  barrel(b, M.clone().multiply(mat(4.6, 0, W * 0.8, 0, -0.3, 0)), 1.0, false, !hi);
  anchorProp(b, M.clone().multiply(mat(L / 2 - 1, 0, -W * 0.72, 0, 0.6, 0)), 3.2);
  const cg = chest(b, M.clone().multiply(mat(-2, 0, W * 0.85, 0, 0.5, 0)), 1.2);
  glows.push({ p: Wp(-2, cg.y, W * 0.85), w: 1.8, color: [1, 0.85, 0.4], a: 0.45 });
  for (let i = 0; i < 4; i++) bubbles.push(Wp(-L * 0.08 + (r() - 0.5) * 3, H + 1.5, (r() - 0.5) * 2));
  bubbles.push(Wp(-L / 2 + 2.6, H + 2.5, 0));
  return { glows, bubbles };
}

/**
 * Ruined temple at local origin facing +z (~18 m wide), standing on y = 0.
 * Returns { glows: [{p (world), w, color, a}], bubbles: [Vector3] }.
 */
export function buildTemple(b, M, hi) {
  const r = rng(909);
  const glows = [], bubbles = [];
  const Wp = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(M);
  const S1 = COLORS.stone, S2 = COLORS.stone2, S3 = COLORS.stone3;
  // stepped plinth
  for (let i = 0; i < 3; i++) put(b, 'stone', new THREE.BoxGeometry(18 - i * 1.4, 0.7, 11 - i * 1.4), i % 2 ? S2 : S1, M, mat(0, 0.35 + i * 0.7, 0));
  const top = 2.1;
  // two rows of columns: front row intact under the pediment, side columns broken at varied heights
  const colH = 7.5, cr = 0.55, seg = hi ? 12 : 8;
  const fluted = (h) => {
    const g = new THREE.CylinderGeometry(cr * 0.9, cr, h, seg * 2, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = Math.atan2(p.getZ(i), p.getX(i)), k = 1 - 0.05 * (0.5 + 0.5 * Math.cos(a * seg));
      p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
    }
    return g;
  };
  const xs = [-6, -3.6, -1.2, 1.2, 3.6, 6];
  for (const [z, front] of [[3.6, true], [-3.0, false]]) {
    xs.forEach((x, k) => {
      if (!front && (k === 1 || k === 4)) {   // fallen: drums lying in front of the plinth
        if (hi) fallenDrum(b, M.clone().multiply(mat(x + 1.2, 0, z - 4.6 + k * 0.4, 0, 0.6 + k, 0)), 1.6, !hi);
        return;
      }
      const h = front ? colH : colH * (0.35 + r() * 0.55);
      put(b, 'stone', new THREE.BoxGeometry(1.5, 0.35, 1.5), S2, M, mat(x, top + 0.17, z));
      const g = fluted(h);
      if (!front) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setY(i, p.getY(i) - r() * 0.8); }
      put(b, 'stone', g, k % 2 ? S1 : S2, M, mat(x, top + 0.35 + h / 2, z));
      if (front) put(b, 'stone', new THREE.BoxGeometry(1.4, 0.4, 1.4), S1, M, mat(x, top + 0.35 + h + 0.2, z));
      // moss bands
      put(b, 'coral', new THREE.CylinderGeometry(cr * 1.02, cr * 1.04, 0.5, seg), COLORS.moss, M, mat(x, top + 0.6, z));
    });
  }
  // architrave and pediment over the front row
  const yA = top + 0.35 + colH + 0.4;
  put(b, 'stone', new THREE.BoxGeometry(13.6, 0.9, 1.7), S2, M, mat(0, yA + 0.45, 3.6));
  put(b, 'stone', new THREE.BoxGeometry(14.2, 0.3, 2.0), S1, M, mat(0, yA + 1.05, 3.6));
  {
    const sh = new THREE.Shape();
    sh.moveTo(-7.1, 0); sh.lineTo(7.1, 0); sh.lineTo(0, 2.6); sh.closePath();
    const tri = new THREE.ExtrudeGeometry(sh, { depth: 1.6, bevelEnabled: false });
    tri.translate(0, 0, -0.8);
    put(b, 'stone', tri, S1, M, mat(0, yA + 1.2, 3.6, 0, 0, 0.04));
  }
  // a broken architrave block leaning on the back columns, and an arch to the side
  put(b, 'stone', new THREE.BoxGeometry(5, 0.8, 1.4), S3, M, mat(-2.6, top + 4.2, -3.0, 0, 0.1, 0.35));
  {
    const ax = 11.5, az = 1.0, ah = 4.6, aw = 2.4;
    for (const s of [-1, 1]) put(b, 'stone', new THREE.BoxGeometry(1.1, ah, 1.2), S2, M, mat(ax + s * aw, ah / 2, az));
    const arc = new THREE.TorusGeometry(aw, 0.55, 4, hi ? 12 : 8, Math.PI);
    put(b, 'stone', arc, S1, M, mat(ax, ah, az, 0, 0, 0));
    put(b, 'stone', new THREE.BoxGeometry(0.9, 0.9, 1.3), S3, M, mat(ax, ah + aw, az));
  }
  // statue head half buried in the sand in front
  {
    const hx = -9.5, hz = 6.5;
    put(b, 'stone', new THREE.SphereGeometry(1.6, hi ? 12 : 8, hi ? 8 : 6), S2, M, mat(hx, 0.6, hz, 0.35, 0.6, 0.25, [0.9, 1.1, 1]));
    put(b, 'stone', new THREE.BoxGeometry(0.35, 0.8, 0.6), S2, M, mat(hx + 0.6, 0.8, hz + 1.3, 0.35, 0.6, 0.25));
    put(b, 'coral', new THREE.SphereGeometry(0.6, 6, 4), COLORS.moss, M, mat(hx - 0.3, 2.0, hz - 0.2, 0, 0, 0, [1.6, 0.4, 1.4]));
  }
  // sea-lamps: glowing orbs in bronze bowls on the plinth corners
  for (const [x, z] of [[-7.6, 4.4], [7.6, 4.4], [-7.6, -4.0], [7.6, -4.0]]) {
    put(b, 'stone', new THREE.CylinderGeometry(0.35, 0.45, 1.6, 8), S2, M, mat(x, top + 0.8, z));
    put(b, 'metal', new THREE.CylinderGeometry(0.6, 0.3, 0.4, 10, 1, true), COLORS.bronze, M, mat(x, top + 1.8, z));
    put(b, 'glow', new THREE.SphereGeometry(0.38, 10, 6), 0x9ff8f0, M, mat(x, top + 2.0, z));
    glows.push({ p: Wp(x, top + 2.1, z), w: 3.4, color: [0.45, 1, 0.9], a: 0.5 });
  }
  // anemones and clams on the steps
  for (let i = 0; i < (hi ? 6 : 3); i++) {
    const x = -8 + r() * 16, z = 4.8 + r() * 0.8;
    const L2 = mat(x, 0.7 * (1 + (i % 2)), z + (i % 2 ? -0.7 : 0));
    const g = anemone(b, M.clone().multiply(L2), 0.9 + r() * 0.5, i, !hi);
    glows.push({ p: g.applyMatrix4(L2).applyMatrix4(M), w: 1.6, color: i % 3 === 1 ? [0.5, 1, 0.9] : [1, 0.5, 0.8], a: 0.4 });
  }
  const cp = clam(b, M.clone().multiply(mat(5.5, 0, 6.8, 0, -0.4, 0)), 1.8, !hi);
  glows.push({ p: Wp(5.5, cp.y, 6.8 + cp.z), w: 1.4, color: [0.9, 0.95, 1], a: 0.55 });
  amphora(b, M.clone().multiply(mat(-4.5, 0, 7.0, 0, 0.3, 0)), 1.4, true, !hi);
  amphora(b, M.clone().multiply(mat(-3.4, 0, 6.6, 0, 1.0, 0)), 1.3, false, !hi);
  bubbles.push(Wp(0, yA + 3.6, 3.6), Wp(-2.6, top + 5, -3.0));
  return { glows, bubbles };
}

/** Small reef outcrop. kind: 'corals' | 'kelp' | 'clams' | 'amphorae' | 'anemones' | 'columns'. Returns glows. */
export function buildIsle(b, rocks, M0, lp, R, D, kind, seed, hi, kelpPts) {
  const r = rng(seed);
  const M = new THREE.Matrix4().makeTranslation(lp.x, lp.y, lp.z).multiply(M0);
  const { geometry, L } = roundIsland(R, D, seed, hi);
  geometry.applyMatrix4(M);
  rocks.push(geometry);
  const sp = []; spikes(sp, 0, -L * 1.5, 0, R, D, hi ? 4 : 2, seed + 1);
  for (const g of sp) { g.applyMatrix4(M); rocks.push(g); }
  const glows = [];
  const W = (v) => v.clone().applyMatrix4(M);
  const at = (rad, ry = null) => { const a = r() * Math.PI * 2, d = R * rad * (0.3 + r() * 0.7); return mat(Math.cos(a) * d, 0, Math.sin(a) * d, 0, ry ?? r() * 6.28, 0); };
  const add = (L2) => M.clone().multiply(L2);
  const CC = [0xff7a8a, 0xffa050, 0xc080e0, 0xf0d060];
  if (kind === 'corals') for (let i = 0; i < (hi ? 3 : 2); i++) brainCoral(b, add(at(0.6)), R * (0.18 + r() * 0.12), CC[i % 4], !hi);
  if (kind === 'clams') { const Lx = at(0.4); const p = clam(b, add(Lx), R * 0.5, !hi); glows.push({ p: W(p.applyMatrix4(Lx)), w: R * 0.4, color: [0.9, 0.95, 1], a: 0.5 }); }
  if (kind === 'amphorae') for (let i = 0; i < 3; i++) amphora(b, add(at(0.6)), R * 0.3, i === 1, !hi);
  if (kind === 'anemones') for (let i = 0; i < (hi ? 4 : 2); i++) {
    const Lx = at(0.6); const g = anemone(b, add(Lx), R * 0.22, i, !hi);
    glows.push({ p: W(g.applyMatrix4(Lx)), w: R * 0.45, color: i % 3 === 1 ? [0.5, 1, 0.9] : [1, 0.5, 0.8], a: 0.45 });
  }
  if (kind === 'columns') { brokenColumn(b, add(at(0.3)), R * 0.9, r, !hi); fallenDrum(b, add(at(0.6)), R * 0.35, !hi); }
  if (kind === 'kelp' && kelpPts) for (let i = 0; i < (hi ? 6 : 3); i++) { const p = W(new THREE.Vector3(0, 0, 0).applyMatrix4(at(0.7))); kelpPts.push({ x: p.x, y: p.y, z: p.z, h: R * (0.8 + r() * 0.9) }); }
  if (kind !== 'corals') brainCoral(b, add(at(0.85)), R * (0.12 + r() * 0.08), CC[(seed >> 2) % 4], !hi);
  if (hi) tubeSponges(b, add(at(0.8)), R * 0.3, r, 3, [0xb070c0, 0xe0a050, 0xff7a9a][seed % 3]);
  if (hi && kind !== 'anemones') starfish(b, add(at(0.7)), R * 0.1, r() < 0.5 ? COLORS.star : COLORS.star2);
  return glows;
}
