// GRUMPY BUGS — arenas. Narrow-ridge layout generation, themed skies and
// abysses (pond/sink/jam/coals), destructible grass-topped earth ridges
// (worms-style ground: dirt strata, charred crater faces, tufts, hanging
// roots) re-meshed from physics solidSpans after every bite, oversized
// background props that sell the "you are 6 mm tall" joke, and the Sandwich.

import * as THREE from 'three';
import { PHYS, THEMES } from './config.js';
import { solidSpans, posAt } from './physics.js';
import { mat } from './bugs.js';
import { lerp } from './utils.js';
import { lightRig, buildEnv } from './render.js';

const T = THREE;

// terrain noise keyed on absolute ledge position — re-meshing after a bite
// must NOT reshuffle the untouched dirt, so never key on span-relative s
const tn = (a, b, c = 0) => {
  const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return s - Math.floor(s);
};
// smooth band noise along a ledge — the big patches of lighter/darker grass.
// Keyed on absolute s like everything else, so bites don't reshuffle it.
const band = (li, s, freq, ph = 0) =>
  0.5 + 0.5 * (Math.sin(s * freq + li * 2.1 + ph) * 0.6 + Math.sin(s * freq * 2.7 + li * 5.3 + ph) * 0.4);

// ---------------- layout generation (pure data) ----------------
// returns ledgeDefs: [{pts:[{x,y,z}...], w?}]
export function generateLayout(rng, { size = 3 } = {}) {
  const defs = [];
  const yaw = rng() * Math.PI;
  const dir = { x: Math.sin(yaw), z: Math.cos(yaw) };
  const perp = { x: dir.z, z: -dir.x };
  const line = (cx, cz, y, d, len) => ({
    pts: [
      { x: cx - d.x * len / 2, y, z: cz - d.z * len / 2 },
      { x: cx + d.x * len / 2, y, z: cz + d.z * len / 2 },
    ],
  });
  // main deck through the middle
  const mainLen = 14 + size * 3 + rng() * 4;
  const mainY = 1.4 + rng() * 0.8;
  defs.push(line(0, 0, mainY, dir, mainLen));
  // satellites: parallel shelves above/below + a crosser + islands
  const nSat = 2 + size + Math.floor(rng() * 2);
  for (let i = 0; i < nSat; i++) {
    const kind = rng();
    if (kind < 0.4) {                       // parallel shelf
      const off = (rng() < 0.5 ? -1 : 1) * (2.4 + rng() * 3.4);
      const y = Math.max(0.35, mainY + (rng() - 0.45) * 2.6);
      const len = 6 + rng() * 7;
      const slide = (rng() - 0.5) * mainLen * 0.5;
      defs.push(line(perp.x * off + dir.x * slide, perp.z * off + dir.z * slide, y, dir, len));
    } else if (kind < 0.7) {                // crossing bar
      const y = Math.max(0.4, mainY + (rng() - 0.35) * 2.2);
      const slide = (rng() - 0.5) * mainLen * 0.6;
      const len = 7 + rng() * 6;
      defs.push(line(dir.x * slide, dir.z * slide, y, perp, len));
    } else {                                // L-shaped balcony
      const off = (rng() < 0.5 ? -1 : 1) * (3 + rng() * 3);
      const slide = (rng() - 0.5) * mainLen * 0.55;
      const y = Math.max(0.4, mainY + (rng() - 0.3) * 2.4);
      const l1 = 4 + rng() * 4, l2 = 3.5 + rng() * 3.5;
      const ax = perp.x * off + dir.x * slide, az = perp.z * off + dir.z * slide;
      defs.push({
        pts: [
          { x: ax - dir.x * l1 / 2, y, z: az - dir.z * l1 / 2 },
          { x: ax + dir.x * l1 / 2, y, z: az + dir.z * l1 / 2 },
          { x: ax + dir.x * l1 / 2 - perp.x * l2 * Math.sign(off), y, z: az + dir.z * l1 / 2 - perp.z * l2 * Math.sign(off) },
        ],
      });
    }
  }
  return defs.map(d => organicify(d, rng));
}

// resample the straight art-lines into wobbly mountain-ridge polylines:
// gentle height undulation + sideways meander. Endpoints stay put so the
// layout's spacing guarantees hold.
function organicify(def, rng) {
  const pts = def.pts;
  const out = [{ ...pts[0] }];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 2.0));
    for (let k = 1; k <= n; k++)
      out.push({ x: lerp(a.x, b.x, k / n), y: lerp(a.y, b.y, k / n), z: lerp(a.z, b.z, k / n) });
  }
  const ph1 = rng() * 9, ph2 = rng() * 9;
  const amp = 0.26 + rng() * 0.28, mea = 0.22 + rng() * 0.28;
  let acc = 0;
  for (let i = 1; i < out.length - 1; i++) {
    const p = out[i], q = out[i - 1];
    const dx = p.x - q.x, dz = p.z - q.z, seg = Math.hypot(dx, dz) || 1;
    acc += seg;
    p.x += (dz / seg) * Math.sin(acc * 0.42 + ph2) * mea;
    p.z += (-dx / seg) * Math.sin(acc * 0.42 + ph2) * mea;
    p.y = Math.max(0.35, p.y + Math.sin(acc * 0.5 + ph1) * amp + Math.sin(acc * 1.35 + ph2) * amp * 0.35);
  }
  return { ...def, pts: out };
}

// spaced spawn points: [{li, s}] — round-robin across ledges, away from ends
export function pickSpawns(ledges, count, rng) {
  const cands = [];
  for (const L of ledges) {
    const n = Math.max(2, Math.floor(L.len / 3));
    for (let i = 0; i < n; i++) {
      const s = 1.2 + (L.len - 2.4) * ((i + 0.5) / n) + (rng() - 0.5) * 0.8;
      if (s > 1 && s < L.len - 1) cands.push({ li: L.i, s, p: posAt(L, s).pos });
    }
  }
  // greedy farthest-point pick
  const out = [];
  let cur = cands[Math.floor(rng() * cands.length)];
  out.push(cur);
  while (out.length < count && cands.length) {
    let best = null, bestD = -1;
    for (const c of cands) {
      let dMin = 1e9;
      for (const o of out) dMin = Math.min(dMin, Math.hypot(c.p.x - o.p.x, c.p.y - o.p.y, c.p.z - o.p.z));
      if (dMin > bestD) { bestD = dMin; best = c; }
    }
    if (!best || bestD < 1.0) break;
    out.push(best);
  }
  while (out.length < count) out.push(cands[Math.floor(rng() * cands.length)]);
  return out.map(c => ({ li: c.li, s: c.s }));
}

// ---------------- sky ----------------
// Four stops, not two: a deeper zenith and a bright band just above the
// horizon is what makes a flat gradient read as sky rather than as wallpaper.
function gradientTex(top, bottom) {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const g = c.getContext('2d');
  const hi = new T.Color(top).multiplyScalar(0.82).getHexString();
  const mid = new T.Color(top).lerp(new T.Color(bottom), 0.55).getHexString();
  const gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0.00, '#' + hi);
  gr.addColorStop(0.34, '#' + top.toString(16).padStart(6, '0'));
  gr.addColorStop(0.72, '#' + mid);
  gr.addColorStop(1.00, '#' + bottom.toString(16).padStart(6, '0'));
  g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

// Lumpy unlit clouds parked on a far ring. Unlit because a lit cloud at this
// distance just reads as a grey blob on whichever side the sun isn't.
function makeClouds(rng, theme) {
  const g = new T.Group();
  const base = new T.Color(theme.sky[1]).lerp(new T.Color(0xffffff), theme.id === 'kitchen' ? 0.12 : 0.6);
  const shadeC = base.clone().multiplyScalar(0.86);
  for (let i = 0; i < 9; i++) {
    const cloud = new T.Group();
    const puffs = 4 + Math.floor(rng() * 4);
    for (let k = 0; k < puffs; k++) {
      const r = 3.2 + rng() * 3.4;
      const p = new T.Mesh(new T.SphereGeometry(r, 8, 6),
        new T.MeshBasicMaterial({ color: k % 3 === 2 ? shadeC : base, transparent: true, opacity: 0.9, fog: false }));
      p.position.set((k - puffs / 2) * 4.2 + rng() * 2, rng() * 2.2, rng() * 3 - 1.5);
      p.scale.set(1, 0.55 + rng() * 0.2, 0.8);
      cloud.add(p);
    }
    const a = (i / 9) * Math.PI * 2 + rng() * 0.6;
    const dist = 92 + rng() * 40;
    cloud.position.set(Math.cos(a) * dist, 26 + rng() * 26, Math.sin(a) * dist);
    cloud.rotation.y = -a + Math.PI / 2;
    cloud.scale.setScalar(0.8 + rng() * 0.8);
    g.add(cloud);
  }
  return g;
}

// ---------------- earth ridge meshes ----------------
// cross-section of a ridge, closed ring (x × halfWidth, y>0 as-is, y<0 × depth)
// `soil` marks a point as underground: those get the strata treatment, the
// grass points get the patchy two-tone treatment.
const PROFILE = [
  { x: 0.00, y: -1.00, c: 'deep' },
  { x: -0.46, y: -0.86, c: 'deep' },
  { x: -0.80, y: -0.60, c: 'deep' },
  { x: -0.94, y: -0.40, c: 'dirt2' },
  { x: -1.03, y: -0.25, c: 'dirt2' },
  { x: -1.08, y: -0.13, c: 'dirt' },
  { x: -1.16, y: -0.04, c: 'grass2' },   // grass lip overhangs the dirt
  { x: -0.88, y: 0.035, c: 'grass2' },
  { x: -0.52, y: 0.062, c: 'grass' },
  { x: -0.18, y: 0.075, c: 'grass' },
  { x: 0.18, y: 0.075, c: 'grass' },
  { x: 0.52, y: 0.062, c: 'grass' },
  { x: 0.88, y: 0.035, c: 'grass2' },
  { x: 1.16, y: -0.04, c: 'grass2' },
  { x: 1.08, y: -0.13, c: 'dirt' },
  { x: 1.03, y: -0.25, c: 'dirt2' },
  { x: 0.94, y: -0.40, c: 'dirt2' },
  { x: 0.80, y: -0.60, c: 'deep' },
  { x: 0.46, y: -0.86, c: 'deep' },
];

export function buildLedgeMesh(L, theme) {
  const g = new T.Group();
  const terra = theme.terra;
  const terraMat = new T.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0, flatShading: true, side: T.DoubleSide,
  });
  const col = new T.Color();
  const P = PROFILE.length;
  // stretched grass palette — see the colour block below
  const LUSH = new T.Color(terra.grass2).lerp(new T.Color(0x27591f), 0.42);
  const DRY = new T.Color(terra.grass).lerp(new T.Color(0xd6c96b), 0.5);
  const WORN = new T.Color(terra.dirt).lerp(new T.Color(terra.grass2), 0.35);

  for (const [a, b] of solidSpans(L)) {
    // ring stations on a GLOBAL grid so bites don't reshape surviving dirt
    const step = 0.6;
    const stations = [a];
    for (let s = Math.ceil(a / step) * step; s < b - 0.15; s += step)
      if (s > a + 0.15) stations.push(s);
    stations.push(b);

    const bitStart = a > 0.05, bitEnd = b < L.len - 0.05;
    const pos = [], color = [], idx = [];
    const rings = [];

    for (const s of stations) {
      const at = posAt(L, s);
      const side = { x: at.dir.z, z: -at.dir.x };
      const qs = Math.round(s * 5) / 5;                     // stable noise key
      const depth = PHYS.ledgeThick * (0.8 + tn(L.i, qs, 99) * 0.5);
      // char blend near blown-out edges
      const dEdge = Math.min(bitStart ? s - a : 9, bitEnd ? b - s : 9);
      const charK = dEdge < 0.28 ? 0.8 : dEdge < 0.8 ? 0.35 : 0;
      // big slow patches of richer / drier grass, plus a per-face grain
      const patch = band(L.i, s, 0.55);
      const dry = band(L.i, s, 0.23, 2.7);
      const ring = [];
      for (let k = 0; k < P; k++) {
        const pt = PROFILE[k];
        const top = pt.y >= 0;
        const jx = (tn(L.i, qs, k) - 0.5) * (top ? 0.14 : 0.3);
        const jy = (tn(L.i, qs, k + 40) - 0.5) * (top ? 0.04 : 0.24);
        const lx = (pt.x + jx) * L.w;
        const ly = top ? pt.y + jy : pt.y * depth + jy;
        ring.push(pos.length / 3);
        pos.push(at.pos.x + side.x * lx, at.pos.y + ly, at.pos.z + side.z * lx);

        col.setHex(terra[pt.c]);
        if (pt.c === 'grass' || pt.c === 'grass2') {
          // Lush in the hollows, sun-bleached on the crowns, worn to bare dirt
          // out at the lip. grass↔grass2 alone is too small an interval to see
          // from the play camera, so the palette is stretched past both ends.
          col.lerp(LUSH, patch * 0.8);
          col.lerp(DRY, dry * 0.6 * band(L.i, s, 1.7, k * 2.2));
          col.lerp(WORN, Math.max(0, Math.abs(pt.x) - 0.6) * 0.95);
          col.multiplyScalar(0.84 + 0.34 * tn(L.i, qs, k + 77) + patch * 0.14);
        } else {
          // strata: each band gets its own tone and a coarser grain, and the
          // belly darkens with depth so the ridge doesn't look like a cutout
          col.lerp(new T.Color(terra.deep), Math.min(1, -pt.y * 0.95));
          col.lerp(new T.Color(terra.dirt), band(L.i, s, 1.3, k * 4) * 0.3);
          col.multiplyScalar(0.72 + 0.42 * tn(L.i, qs, k + 77) + band(L.i, s, 0.9, k) * 0.16);
        }
        if (charK) col.lerp(new T.Color(terra.char), charK);
        color.push(col.r, col.g, col.b);
      }
      rings.push({ ring, s, at, depth });
    }
    // skin between rings
    for (let i = 0; i < rings.length - 1; i++) {
      const r0 = rings[i].ring, r1 = rings[i + 1].ring;
      for (let k = 0; k < P; k++) {
        const k2 = (k + 1) % P;
        idx.push(r0[k], r0[k2], r1[k], r0[k2], r1[k2], r1[k]);
      }
    }
    // end caps: charred crater face at bites, bare soil at natural ends
    for (const [ri, bitten] of [[0, bitStart], [rings.length - 1, bitEnd]]) {
      const r = rings[ri];
      const ci = pos.length / 3;
      pos.push(r.at.pos.x, r.at.pos.y - r.depth * 0.45, r.at.pos.z);
      col.setHex(bitten ? terra.char : terra.dirt2).multiplyScalar(bitten ? 1 : 0.8);
      color.push(col.r, col.g, col.b);
      for (let k = 0; k < P; k++) idx.push(r.ring[k], r.ring[(k + 1) % P], ci);
    }

    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(color, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, terraMat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);

    decorateSpan(g, L, a, b, terra);
  }
  return g;
}

// Grass tufts, pebbles, clover and flowers on top; a bladed fringe along both
// edges (which is what breaks the hard polygon silhouette — the single biggest
// thing separating "ground" from "extruded ribbon"); rocks embedded in the
// dirt face; roots dangling underneath. All placed on the same global grid, so
// surviving scenery stays put across a bite.
function decorateSpan(g, L, a, b, terra) {
  // --- edge fringe: short blades leaning out over both lips.
  // The lean has to happen in the LEDGE's frame, not the world's — a blade
  // tilted about world Z on a ridge running east-west sticks out sideways
  // through the cliff face instead of hanging over the drop. So each blade
  // lives inside a holder yawed to the ledge, where local +X is the outward
  // side and local +Z runs along the ridge.
  for (let s = Math.ceil((a + 0.2) / 0.34) * 0.34; s < b - 0.2; s += 0.34) {
    const at = posAt(L, s);
    const side = { x: at.dir.z, z: -at.dir.x };
    const yaw = Math.atan2(at.dir.x, at.dir.z);
    for (const dir of [-1, 1]) {
      if (tn(L.i, s, dir > 0 ? 60 : 61) > 0.72) continue;
      const off = dir * (1.02 + tn(L.i, s, 62) * 0.12) * L.w;
      const h = 0.13 + tn(L.i, s, 63) * 0.16;
      const holder = new T.Group();
      holder.position.set(at.pos.x + side.x * off, at.pos.y + h * 0.3 - 0.03, at.pos.z + side.z * off);
      holder.rotation.y = yaw;
      const blade = new T.Mesh(new T.ConeGeometry(0.03, h, 4),
        mat(tn(L.i, s, 64) > 0.5 ? terra.grass2 : terra.grass, { flat: true, rough: 0.9 }));
      // negative Z-rotation tips +Y toward +X, so the sign is flipped from dir
      blade.rotation.set((tn(L.i, s, 65) - 0.5) * 0.35, 0, -dir * (0.45 + tn(L.i, s, 67) * 0.4));
      blade.castShadow = true;
      holder.add(blade);
      g.add(holder);
    }
  }

  // --- rocks in the dirt face, poking out of the strata
  for (let s = Math.ceil((a + 0.5) / 1.6) * 1.6; s < b - 0.5; s += 1.6) {
    if (tn(L.i, s, 70) > 0.5) continue;
    const at = posAt(L, s);
    const side = { x: at.dir.z, z: -at.dir.x };
    const dir = tn(L.i, s, 71) > 0.5 ? 1 : -1;
    const depth = -(0.2 + tn(L.i, s, 72) * 0.5) * PHYS.ledgeThick;
    const rock = new T.Mesh(new T.DodecahedronGeometry(0.09 + tn(L.i, s, 73) * 0.09, 0),
      mat(0x8b8577, { flat: true, rough: 1 }));
    rock.position.set(at.pos.x + side.x * dir * 0.95 * L.w, at.pos.y + depth,
      at.pos.z + side.z * dir * 0.95 * L.w);
    rock.rotation.set(tn(L.i, s, 74) * 3, tn(L.i, s, 75) * 3, tn(L.i, s, 76) * 3);
    rock.scale.set(1, 0.75, 0.9);
    rock.castShadow = true; rock.receiveShadow = true;
    g.add(rock);
  }

  // --- things growing on top
  for (let s = Math.ceil((a + 0.45) / 0.62) * 0.62; s < b - 0.45; s += 0.62) {
    const r = tn(L.i, s * 1.7, 5);
    const at = posAt(L, s);
    const side = { x: at.dir.z, z: -at.dir.x };
    const off = (tn(L.i, s * 1.7, 6) - 0.5) * 1.3 * L.w;
    const px = at.pos.x + side.x * off, pz = at.pos.z + side.z * off;
    if (r < 0.44) {                                    // grass tuft
      const n = 3 + Math.floor(tn(L.i, s, 9) * 3);
      for (let i = 0; i < n; i++) {
        const h = 0.14 + tn(L.i, s, 10 + i) * 0.2;
        const blade = new T.Mesh(new T.ConeGeometry(0.032, h, 4),
          mat(i % 2 ? terra.grass2 : terra.grass, { flat: true, rough: 0.9 }));
        blade.position.set(px + (tn(L.i, s, 20 + i) - 0.5) * 0.18, at.pos.y + h / 2 + 0.02,
          pz + (tn(L.i, s, 30 + i) - 0.5) * 0.18);
        blade.rotation.set((tn(L.i, s, 45 + i) - 0.5) * 0.5, tn(L.i, s, 46 + i) * 3,
          (tn(L.i, s, 40 + i) - 0.5) * 0.8);
        blade.castShadow = true;
        g.add(blade);
      }
    } else if (r < 0.58) {                             // pebble
      const p = new T.Mesh(new T.DodecahedronGeometry(0.06 + tn(L.i, s, 11) * 0.06, 0),
        mat(0x97907f, { flat: true, rough: 1 }));
      p.position.set(px, at.pos.y + 0.04, pz);
      p.scale.y = 0.55;
      p.rotation.set(tn(L.i, s, 14) * 3, tn(L.i, s, 12) * 3, tn(L.i, s, 15) * 3);
      p.castShadow = true; p.receiveShadow = true;
      g.add(p);
    } else if (r < 0.68) {                             // clover patch
      for (let i = 0; i < 3; i++) {
        const ang = i * 2.1 + tn(L.i, s, 16) * 6;
        const leaf = new T.Mesh(new T.CircleGeometry(0.055, 6), mat(terra.grass, { flat: true, rough: 0.85, side: T.DoubleSide }));
        leaf.position.set(px + Math.cos(ang) * 0.06, at.pos.y + 0.03 + i * 0.004, pz + Math.sin(ang) * 0.06);
        leaf.rotation.set(-Math.PI / 2 + 0.2, 0, ang);
        g.add(leaf);
      }
    } else if (r < 0.75) {                             // tiny flower
      const stem = new T.Mesh(new T.CylinderGeometry(0.012, 0.018, 0.22, 4), mat(terra.grass2, { rough: 0.9 }));
      stem.position.set(px, at.pos.y + 0.13, pz);
      g.add(stem);
      const petalC = [0xf2e28a, 0xf2a4b0, 0xf5f2e8, 0xc8a4f0][Math.floor(tn(L.i, s, 13) * 4)];
      for (let i = 0; i < 5; i++) {
        const pet = new T.Mesh(new T.SphereGeometry(0.035, 5, 4), mat(petalC, { flat: true, rough: 0.75 }));
        const ang = (i / 5) * Math.PI * 2;
        pet.position.set(px + Math.cos(ang) * 0.05, at.pos.y + 0.25, pz + Math.sin(ang) * 0.05);
        pet.scale.set(1.2, 0.55, 1.2);
        g.add(pet);
      }
      const core = new T.Mesh(new T.SphereGeometry(0.028, 5, 4), mat(0xd9a514, { flat: true, rough: 0.7 }));
      core.position.set(px, at.pos.y + 0.26, pz);
      g.add(core);
    } else if (r < 0.79) {                             // mushroom
      const stalk = new T.Mesh(new T.CylinderGeometry(0.022, 0.03, 0.11, 6), mat(0xe8e0cf, { rough: 0.9 }));
      stalk.position.set(px, at.pos.y + 0.055, pz);
      const cap = new T.Mesh(new T.SphereGeometry(0.062, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55),
        mat(tn(L.i, s, 17) > 0.5 ? 0xb5462f : 0xa5764a, { rough: 0.8 }));
      cap.position.set(px, at.pos.y + 0.105, pz);
      cap.scale.y = 0.8;
      cap.castShadow = true;
      g.add(stalk, cap);
    }
  }

  // --- hanging roots
  for (let s = Math.ceil((a + 0.6) / 1.7) * 1.7; s < b - 0.6; s += 1.7) {
    if (tn(L.i, s, 50) > 0.55) continue;
    const at = posAt(L, s);
    const side = { x: at.dir.z, z: -at.dir.x };
    const off = (tn(L.i, s, 51) - 0.5) * 1.3 * L.w;
    const len = 0.4 + tn(L.i, s, 52) * 1.0;
    const root = new T.Mesh(new T.CylinderGeometry(0.01, 0.045, len, 5), mat(terra.root, { rough: 1 }));
    root.position.set(at.pos.x + side.x * off, at.pos.y - PHYS.ledgeThick * 0.75 - len / 2, at.pos.z + side.z * off);
    root.rotation.set((tn(L.i, s, 54) - 0.5) * 0.4, 0, (tn(L.i, s, 53) - 0.5) * 0.6);
    g.add(root);
    // a thinner offshoot
    if (tn(L.i, s, 55) > 0.5) {
      const twig = new T.Mesh(new T.CylinderGeometry(0.006, 0.016, len * 0.55, 4), mat(terra.root, { rough: 1 }));
      twig.position.set(root.position.x + 0.09, root.position.y + len * 0.1, root.position.z + 0.05);
      twig.rotation.z = -0.5;
      g.add(twig);
    }
  }
}

// ---------------- big silly props ----------------
// These sit on the skyline behind the fog, so what matters is the silhouette
// and one or two details that survive at distance — not fine modelling nobody
// will ever get close to.
function makeFlower(rng) {
  const g = new T.Group();
  const h = 9 + rng() * 7;
  const stem = new T.Mesh(new T.CylinderGeometry(0.25, 0.45, h, 8), mat(0x4a7d3a, { rough: 0.85 }));
  stem.position.y = h / 2;
  stem.rotation.z = (rng() - 0.5) * 0.12;
  g.add(stem);
  for (let i = 0; i < 2; i++) {                 // a couple of leaves up the stalk
    const leaf = new T.Mesh(new T.SphereGeometry(1.5, 8, 6), mat(0x5d9c46, { rough: 0.85 }));
    leaf.scale.set(1.6, 0.18, 0.7);
    const a = rng() * 6.3;
    leaf.position.set(Math.cos(a) * 1.4, h * (0.35 + i * 0.28), Math.sin(a) * 1.4);
    leaf.rotation.set(0, -a, 0.4);
    g.add(leaf);
  }
  const head = new T.Group(); head.position.y = h;
  const core = new T.Mesh(new T.SphereGeometry(1, 12, 10), mat(0x7a5a20, { rough: 0.95, flat: true }));
  core.scale.y = 0.7;
  const petalC = [0xf2d13d, 0xf28a9a, 0xfaf6ec, 0xc48af0][Math.floor(rng() * 4)];
  const petalDark = new T.Color(petalC).multiplyScalar(0.82).getHex();
  for (let ring = 0; ring < 2; ring++) {        // two offset rings of petals
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + ring * 0.39;
      const rad = 1.75 - ring * 0.35;
      const p = new T.Mesh(new T.SphereGeometry(0.9, 8, 6), mat(ring ? petalDark : petalC, { rough: 0.75 }));
      p.scale.set(1, 0.26, rad);
      p.position.set(Math.cos(a) * rad, -ring * 0.22, Math.sin(a) * rad);
      p.rotation.set(0, -a + Math.PI / 2, ring ? -0.18 : 0);
      head.add(p);
    }
  }
  head.add(core);
  head.rotation.set(0.4 + rng() * 0.4, rng() * 6.3, 0);
  g.add(head);
  return g;
}
function makeGrass(rng) {
  const g = new T.Group();
  for (let i = 0; i < 7; i++) {
    const h = 3 + rng() * 5;
    // a curved blade instead of a spike — two pieces with a kink at the fold
    const blade = new T.Group();
    const lower = new T.Mesh(new T.CylinderGeometry(0.16, 0.4, h * 0.6, 5), mat(0x5d9c46, { rough: 0.9 }));
    lower.position.y = h * 0.3;
    const upper = new T.Mesh(new T.ConeGeometry(0.16, h * 0.5, 5), mat(0x74b356, { rough: 0.9 }));
    upper.position.set(0, h * 0.62, h * 0.14);
    upper.rotation.x = 0.55;
    blade.add(lower, upper);
    blade.position.set((rng() - 0.5) * 3, 0, (rng() - 0.5) * 3);
    blade.rotation.set(0, rng() * 6.3, (rng() - 0.5) * 0.4);
    g.add(blade);
  }
  return g;
}
function makeMug() {
  const g = new T.Group();
  const glaze = { rough: 0.22, metal: 0.05 };
  const body = new T.Mesh(new T.CylinderGeometry(3.2, 3, 7.5, 22, 1, true),
    mat(0xd94f4f, { ...glaze, side: T.DoubleSide }));
  body.position.y = 3.75;
  const rim = new T.Mesh(new T.TorusGeometry(3.2, 0.16, 8, 24), mat(0xf0eae0, glaze));
  rim.position.y = 7.5; rim.rotation.x = Math.PI / 2;
  const stripe = new T.Mesh(new T.CylinderGeometry(3.13, 3.1, 1.1, 22, 1, true),
    mat(0xf0eae0, { ...glaze, side: T.DoubleSide }));
  stripe.position.y = 5.4;
  const handle = new T.Mesh(new T.TorusGeometry(2, 0.55, 10, 20, Math.PI * 1.15), mat(0xd94f4f, glaze));
  handle.position.set(3.3, 4, 0); handle.rotation.set(0, 0, -Math.PI / 2 - 0.4);
  const coffee = new T.Mesh(new T.CircleGeometry(3.05, 22), mat(0x2e1c10, { rough: 0.12, metal: 0.2 }));
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = 6.6;
  const crema = new T.Mesh(new T.TorusGeometry(2.5, 0.35, 6, 20), mat(0x8a6236, { rough: 0.6 }));
  crema.position.y = 6.62; crema.rotation.x = Math.PI / 2;
  g.add(body, rim, stripe, handle, coffee, crema);
  return g;
}
function makeFork() {
  const g = new T.Group();
  const steel = { metal: 0.85, rough: 0.22 };
  const handle = new T.Mesh(new T.BoxGeometry(1, 12, 0.5), mat(0xb9c2cc, steel));
  handle.position.y = 6;
  const flare = new T.Mesh(new T.BoxGeometry(1.5, 2.4, 0.55), mat(0xb9c2cc, steel));
  flare.position.y = 0.9;
  for (let i = 0; i < 4; i++) {
    const tine = new T.Mesh(new T.BoxGeometry(0.22, 3.4, 0.4), mat(0xb9c2cc, steel));
    tine.position.set(-0.75 + i * 0.5, 13.4, 0);
    const tip = new T.Mesh(new T.ConeGeometry(0.16, 0.6, 4), mat(0xd6dee6, steel));
    tip.position.set(-0.75 + i * 0.5, 15.3, 0);
    g.add(tine, tip);
  }
  const neck = new T.Mesh(new T.BoxGeometry(1.7, 1.2, 0.45), mat(0xb9c2cc, steel));
  neck.position.y = 12.2;
  g.add(handle, flare, neck);
  return g;
}
function makeBottle(color) {
  const g = new T.Group();
  const glass = { rough: 0.12, metal: 0.15, opacity: 0.88 };
  const body = new T.Mesh(new T.CylinderGeometry(2.2, 2.4, 9, 18), mat(color, glass));
  body.position.y = 4.5;
  const shoulder = new T.Mesh(new T.CylinderGeometry(1.2, 2.2, 1.8, 18), mat(color, glass));
  shoulder.position.y = 9.9;
  const neck = new T.Mesh(new T.CylinderGeometry(0.85, 1.2, 2.2, 14), mat(color, glass));
  neck.position.y = 11.6;
  const lip = new T.Mesh(new T.TorusGeometry(0.9, 0.16, 6, 14), mat(color, glass));
  lip.position.y = 12.6; lip.rotation.x = Math.PI / 2;
  const cap = new T.Mesh(new T.CylinderGeometry(0.95, 0.95, 1, 14), mat(0xf5f0e6, { rough: 0.5 }));
  cap.position.y = 13.2;
  // a paper label — a bare cylinder this big just reads as a pillar
  const label = new T.Mesh(new T.CylinderGeometry(2.26, 2.32, 4, 18, 1, true),
    mat(0xf2ead6, { rough: 0.9, side: T.DoubleSide }));
  label.position.y = 4.2;
  g.add(body, shoulder, neck, lip, cap, label);
  return g;
}

export function makeSandwich(scale = 1) {
  const g = new T.Group();
  const bread = mat(0xe8c98a, { rough: 0.9 });
  const crust = mat(0xa9762f, { rough: 0.95 });
  const slab = (y) => {
    const s = new T.Group();
    const core = new T.Mesh(new T.BoxGeometry(7.6, 1.1, 7.6), bread); core.position.y = y;
    const rim = new T.Mesh(new T.BoxGeometry(8, 1.2, 8), crust); rim.position.y = y; rim.scale.set(1, 0.92, 1);
    s.add(rim, core);
    return s;
  };
  g.add(slab(0.6));
  // lettuce ruffle
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const leaf = new T.Mesh(new T.SphereGeometry(1.1, 8, 6), mat(0x84c14b));
    leaf.scale.set(1.4, 0.35, 1);
    leaf.position.set(Math.cos(a) * 3.7, 1.45, Math.sin(a) * 3.7);
    leaf.rotation.y = -a;
    g.add(leaf);
  }
  const ham = new T.Mesh(new T.CylinderGeometry(4, 4, 0.5, 20), mat(0xe89aa2));
  ham.position.y = 1.9;
  const cheese = new T.Mesh(new T.BoxGeometry(8.4, 0.28, 8.4), mat(0xf7c948));
  cheese.position.y = 2.35; cheese.rotation.y = 0.35;
  for (let i = 0; i < 3; i++) {
    const tom = new T.Mesh(new T.CylinderGeometry(1.5, 1.5, 0.4, 14), mat(0xd94436));
    tom.position.set(-2 + i * 2, 2.75, (i - 1) * 1.5);
    g.add(tom);
  }
  g.add(ham, cheese, slab(3.6));
  g.scale.setScalar(scale);
  g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return g;
}

// ---------------- the arena view ----------------
export class ArenaView {
  constructor(scene, themeId, ledges, rng, opts = {}) {
    this.scene = scene;
    this.theme = THEMES.find(t => t.id === themeId) || THEMES[0];
    this.terra = this.theme.terra;
    this.ledges = ledges;
    this.group = new T.Group();
    this.ledgeGroups = new Map();
    scene.add(this.group);

    const th = this.theme;
    scene.background = gradientTex(th.sky[0], th.sky[1]);
    scene.fog = new T.Fog(th.fog, 30, 96);
    this.clouds = makeClouds(rng, th);
    this.group.add(this.clouds);

    // lights + environment probe (see js/render.js — one rig for game, gallery
    // and cutscenes so a prop never looks different depending on who built it)
    const rig = lightRig(th, { lite: opts.lite });
    this.hemi = rig.hemi; this.sun = rig.sun; this.rim = rig.rim;
    this.group.add(...rig.lights);
    if (opts.renderer) {
      this.env = buildEnv(opts.renderer, th);
      scene.environment = this.env;
    }

    // the abyss below
    const groundCol = { pond: 0x3f7d8c, sink: 0x4a5560, jam: 0xa8202f, coals: 0x2a1512 }[th.ground];
    // A dead-flat plate 6 m below everything reads as coloured paper. Rolling
    // the vertices gives the surface something for the specular to break on,
    // and vertex colours darken it toward the horizon so it has depth.
    const gGeo = new T.PlaneGeometry(240, 240, 40, 40);
    {
      const p = gGeo.attributes.position, gc = [];
      const c0 = new T.Color(groundCol), c1 = new T.Color(groundCol).multiplyScalar(0.42);
      const c = new T.Color();
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        p.setZ(i, Math.sin(x * 0.16 + y * 0.09) * 0.16 + Math.sin(x * 0.05 - y * 0.23) * 0.22);
        const d = Math.min(1, Math.hypot(x, y) / 90);
        c.copy(c0).lerp(c1, d * d);
        gc.push(c.r, c.g, c.b);
      }
      gGeo.setAttribute('color', new T.Float32BufferAttribute(gc, 3));
      gGeo.computeVertexNormals();
    }
    this.ground = new T.Mesh(gGeo,
      new T.MeshStandardMaterial({
        vertexColors: true, roughness: th.ground === 'jam' ? 0.18 : 0.35,
        metalness: th.ground === 'coals' ? 0 : 0.15,
        transparent: true, opacity: 0.94,
        emissive: th.ground === 'coals' ? 0xd94e18 : 0x000000,
        emissiveIntensity: th.ground === 'coals' ? 0.5 : 0,
      }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = PHYS.killY + 0.4;
    this.group.add(this.ground);
    this.groundWavePhase = rng() * 10;
    if (th.ground === 'coals') {
      for (let i = 0; i < 26; i++) {
        const coal = new T.Mesh(new T.SphereGeometry(1 + rng() * 1.6, 7, 6),
          mat(0x33201a, { emissive: 0xff6a20, emissiveIntensity: 0.35, flat: true }));
        coal.position.set((rng() - 0.5) * 60, PHYS.killY + 0.5, (rng() - 0.5) * 60);
        coal.scale.y = 0.5;
        this.group.add(coal);
      }
    }
    if (th.ground === 'pond') {
      for (let i = 0; i < 8; i++) {
        const pad = new T.Mesh(new T.CircleGeometry(1.6 + rng() * 1.8, 18, rng() * 6, 5.6), mat(0x5da24f));
        pad.rotation.x = -Math.PI / 2;
        pad.position.set((rng() - 0.5) * 50, PHYS.killY + 0.46, (rng() - 0.5) * 50);
        this.group.add(pad);
      }
    }

    // oversized background props on a ring
    const propsFor = {
      garden: () => [makeFlower(rng), makeFlower(rng), makeGrass(rng), makeGrass(rng), makeGrass(rng), makeFlower(rng)],
      kitchen: () => [makeMug(), makeFork(), makeBottle(0x3a7d44), makeFork()],
      picnic: () => [makeBottle(0xc4342a), makeMug(), makeGrass(rng), makeFlower(rng), makeGrass(rng)],
      bbq: () => [makeFork(), makeBottle(0xc4342a), makeBottle(0x8a5a2a), makeGrass(rng)],
    }[th.id]();
    propsFor.forEach((prop, i) => {
      const a = (i / propsFor.length) * Math.PI * 2 + rng() * 0.8;
      const r = 17 + rng() * 12;
      prop.position.set(Math.cos(a) * r, PHYS.killY + 0.4, Math.sin(a) * r);
      prop.rotation.y = rng() * Math.PI * 2;
      this.group.add(prop);
    });
    if (opts.sandwich) {
      this.sandwich = makeSandwich(opts.sandwich);
      this.sandwich.position.set(opts.sandwichPos?.x ?? 0, PHYS.killY + 0.4, opts.sandwichPos?.z ?? -14);
      this.group.add(this.sandwich);
    }

    // plank meshes
    for (const L of ledges) this.refreshLedge(L);
  }

  refreshLedge(L) {
    const old = this.ledgeGroups.get(L.i);
    if (old) { this.group.remove(old); old.traverse(m => m.geometry?.dispose?.()); }
    const g = buildLedgeMesh(L, this.theme);
    this.ledgeGroups.set(L.i, g);
    this.group.add(g);
    L.dirty = false;
  }

  refreshDirty() { for (const L of this.ledges) if (L.dirty) this.refreshLedge(L); }

  // jam tide rising in sudden death
  setGroundY(y) { this.ground.position.y = y + 0.4; }

  update(dt, t) {
    // lazy water bob
    this.ground.position.y += Math.sin(t * 1.2 + this.groundWavePhase) * 0.0006;
    if (this.theme.ground === 'jam') this.ground.rotation.z = Math.sin(t * 0.1) * 0.002;
    if (this.clouds) this.clouds.rotation.y += dt * 0.004;   // barely-there drift
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(m => m.geometry?.dispose?.());
    this.scene.background = null;
    this.scene.fog = null;
    if (this.env) { this.scene.environment = null; this.env.dispose(); this.env = null; }
  }
}
