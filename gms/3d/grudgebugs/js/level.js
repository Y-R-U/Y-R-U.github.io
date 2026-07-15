// GRUDGE BUGS — arenas. Narrow-ridge layout generation, themed skies and
// abysses (pond/sink/jam/coals), destructible grass-topped earth ridges
// (worms-style ground: dirt strata, charred crater faces, tufts, hanging
// roots) re-meshed from physics solidSpans after every bite, oversized
// background props that sell the "you are 6 mm tall" joke, and the Sandwich.

import * as THREE from 'three';
import { PHYS, THEMES } from './config.js';
import { solidSpans, posAt } from './physics.js';
import { mat } from './bugs.js';
import { lerp } from './utils.js';

const T = THREE;

// terrain noise keyed on absolute ledge position — re-meshing after a bite
// must NOT reshuffle the untouched dirt, so never key on span-relative s
const tn = (a, b, c = 0) => {
  const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

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
function gradientTex(top, bottom) {
  const c = document.createElement('canvas'); c.width = 2; c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#' + top.toString(16).padStart(6, '0'));
  gr.addColorStop(1, '#' + bottom.toString(16).padStart(6, '0'));
  g.fillStyle = gr; g.fillRect(0, 0, 2, 128);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

// ---------------- earth ridge meshes ----------------
// cross-section of a ridge, closed ring (x × halfWidth, y>0 as-is, y<0 × depth)
const PROFILE = [
  { x: 0.00, y: -1.00, c: 'deep' },
  { x: -0.52, y: -0.80, c: 'deep' },
  { x: -0.88, y: -0.46, c: 'dirt2' },
  { x: -1.02, y: -0.18, c: 'dirt' },
  { x: -1.14, y: -0.045, c: 'grass2' },   // grass lip overhangs the dirt
  { x: -0.60, y: 0.045, c: 'grass' },
  { x: 0.00, y: 0.07, c: 'grass' },
  { x: 0.60, y: 0.045, c: 'grass' },
  { x: 1.14, y: -0.045, c: 'grass2' },
  { x: 1.02, y: -0.18, c: 'dirt' },
  { x: 0.88, y: -0.46, c: 'dirt2' },
  { x: 0.52, y: -0.80, c: 'deep' },
];

export function buildLedgeMesh(L, theme) {
  const g = new T.Group();
  const terra = theme.terra;
  const terraMat = new T.MeshStandardMaterial({
    vertexColors: true, roughness: 0.96, metalness: 0, flatShading: true, side: T.DoubleSide,
  });
  const col = new T.Color();
  const P = PROFILE.length;

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
        col.setHex(terra[pt.c]).multiplyScalar(0.86 + 0.26 * tn(L.i, qs, k + 77));
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

// grass tufts, pebbles and flowers on top; roots dangling underneath.
// All placed on the global grid too, so surviving scenery stays put.
function decorateSpan(g, L, a, b, terra) {
  for (let s = Math.ceil((a + 0.45) / 0.9) * 0.9; s < b - 0.45; s += 0.9) {
    const r = tn(L.i, s * 1.7, 5);
    const at = posAt(L, s);
    const side = { x: at.dir.z, z: -at.dir.x };
    const off = (tn(L.i, s * 1.7, 6) - 0.5) * 1.3 * L.w;
    const px = at.pos.x + side.x * off, pz = at.pos.z + side.z * off;
    if (r < 0.4) {                                     // grass tuft
      for (let i = 0; i < 3; i++) {
        const h = 0.14 + tn(L.i, s, 10 + i) * 0.18;
        const blade = new T.Mesh(new T.ConeGeometry(0.035, h, 4),
          mat(i % 2 ? terra.grass2 : terra.grass, { flat: true }));
        blade.position.set(px + (tn(L.i, s, 20 + i) - 0.5) * 0.16, at.pos.y + h / 2 + 0.02,
          pz + (tn(L.i, s, 30 + i) - 0.5) * 0.16);
        blade.rotation.z = (tn(L.i, s, 40 + i) - 0.5) * 0.7;
        g.add(blade);
      }
    } else if (r < 0.55) {                             // pebble
      const p = new T.Mesh(new T.SphereGeometry(0.07 + tn(L.i, s, 11) * 0.07, 5, 4),
        mat(0x97907f, { flat: true, rough: 1 }));
      p.position.set(px, at.pos.y + 0.05, pz);
      p.scale.y = 0.65;
      p.rotation.y = tn(L.i, s, 12) * 3;
      g.add(p);
    } else if (r < 0.62) {                             // tiny flower
      const stem = new T.Mesh(new T.CylinderGeometry(0.012, 0.018, 0.22, 4), mat(terra.grass2));
      stem.position.set(px, at.pos.y + 0.13, pz);
      g.add(stem);
      const petalC = [0xf2e28a, 0xf2a4b0, 0xf5f2e8][Math.floor(tn(L.i, s, 13) * 3)];
      for (let i = 0; i < 4; i++) {
        const pet = new T.Mesh(new T.SphereGeometry(0.035, 5, 4), mat(petalC, { flat: true }));
        const ang = (i / 4) * Math.PI * 2;
        pet.position.set(px + Math.cos(ang) * 0.05, at.pos.y + 0.25, pz + Math.sin(ang) * 0.05);
        g.add(pet);
      }
      const core = new T.Mesh(new T.SphereGeometry(0.028, 5, 4), mat(0xd9a514, { flat: true }));
      core.position.set(px, at.pos.y + 0.26, pz);
      g.add(core);
    }
  }
  // hanging roots
  for (let s = Math.ceil((a + 0.6) / 2.3) * 2.3; s < b - 0.6; s += 2.3) {
    if (tn(L.i, s, 50) > 0.45) continue;
    const at = posAt(L, s);
    const side = { x: at.dir.z, z: -at.dir.x };
    const off = (tn(L.i, s, 51) - 0.5) * 0.9 * L.w;
    const len = 0.5 + tn(L.i, s, 52) * 0.9;
    const root = new T.Mesh(new T.CylinderGeometry(0.012, 0.05, len, 5), mat(terra.root, { rough: 1 }));
    root.position.set(at.pos.x + side.x * off, at.pos.y - PHYS.ledgeThick * 0.8 - len / 2, at.pos.z + side.z * off);
    root.rotation.z = (tn(L.i, s, 53) - 0.5) * 0.5;
    g.add(root);
  }
}

// ---------------- big silly props ----------------
function makeFlower(rng) {
  const g = new T.Group();
  const h = 9 + rng() * 7;
  const stem = new T.Mesh(new T.CylinderGeometry(0.25, 0.4, h, 8), mat(0x4a7d3a));
  stem.position.y = h / 2;
  const head = new T.Group(); head.position.y = h;
  const core = new T.Mesh(new T.SphereGeometry(1, 12, 10), mat(0x7a5a20));
  const petalC = [0xf2d13d, 0xf28a9a, 0xffffff, 0xc48af0][Math.floor(rng() * 4)];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const p = new T.Mesh(new T.SphereGeometry(0.9, 8, 6), mat(petalC));
    p.scale.set(1, 0.3, 1.7);
    p.position.set(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7);
    p.rotation.y = -a + Math.PI / 2;
    head.add(p);
  }
  head.add(core);
  head.rotation.x = 0.4 + rng() * 0.4;
  g.add(stem, head);
  return g;
}
function makeGrass(rng) {
  const g = new T.Group();
  for (let i = 0; i < 5; i++) {
    const h = 3 + rng() * 4;
    const blade = new T.Mesh(new T.ConeGeometry(0.35, h, 5), mat(0x5d9c46));
    blade.position.set((rng() - 0.5) * 2, h / 2, (rng() - 0.5) * 2);
    blade.rotation.z = (rng() - 0.5) * 0.35;
    g.add(blade);
  }
  return g;
}
function makeMug() {
  const g = new T.Group();
  const body = new T.Mesh(new T.CylinderGeometry(3.2, 3, 7.5, 20, 1, true), mat(0xd94f4f, { side: T.DoubleSide }));
  body.position.y = 3.75;
  const handle = new T.Mesh(new T.TorusGeometry(2, 0.5, 8, 16, Math.PI), mat(0xd94f4f));
  handle.position.set(3.4, 4, 0); handle.rotation.z = -Math.PI / 2;
  const coffee = new T.Mesh(new T.CircleGeometry(3, 20), mat(0x3a2415));
  coffee.rotation.x = -Math.PI / 2; coffee.position.y = 7;
  g.add(body, handle, coffee);
  return g;
}
function makeFork() {
  const g = new T.Group();
  const handle = new T.Mesh(new T.BoxGeometry(1, 12, 0.5), mat(0xb9c2cc, { metal: 0.8, rough: 0.3 }));
  handle.position.y = 6;
  for (let i = 0; i < 4; i++) {
    const tine = new T.Mesh(new T.BoxGeometry(0.22, 3.4, 0.4), mat(0xb9c2cc, { metal: 0.8, rough: 0.3 }));
    tine.position.set(-0.75 + i * 0.5, 13.4, 0);
    g.add(tine);
  }
  const neck = new T.Mesh(new T.BoxGeometry(1.7, 1.2, 0.45), mat(0xb9c2cc, { metal: 0.8, rough: 0.3 }));
  neck.position.y = 12.2;
  g.add(handle, neck);
  return g;
}
function makeBottle(color) {
  const g = new T.Group();
  const body = new T.Mesh(new T.CylinderGeometry(2.2, 2.4, 9, 14), mat(color, { rough: 0.4 }));
  body.position.y = 4.5;
  const neck = new T.Mesh(new T.CylinderGeometry(0.8, 1.6, 3, 12), mat(color, { rough: 0.4 }));
  neck.position.y = 10.4;
  const cap = new T.Mesh(new T.CylinderGeometry(0.9, 0.9, 1, 12), mat(0xf5f0e6));
  cap.position.y = 12.2;
  g.add(body, neck, cap);
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
    scene.fog = new T.Fog(th.fog, 26, 78);

    // lights
    this.hemi = new T.HemisphereLight(th.sky[0], 0x5a4630, 0.9);   // warm dirt bounce
    this.sun = new T.DirectionalLight(th.sun, th.id === 'kitchen' ? 1.0 : 1.5);
    this.sun.position.set(10, 18, 6);
    if (!opts.lite) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(1024, 1024);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -22; c.right = c.top = 22; c.far = 60;
      this.sun.shadow.bias = -0.002;
    }
    this.group.add(this.hemi, this.sun, this.sun.target);

    // the abyss below
    const groundCol = { pond: 0x3f7d8c, sink: 0x4a5560, jam: 0xa8202f, coals: 0x2a1512 }[th.ground];
    this.ground = new T.Mesh(new T.PlaneGeometry(240, 240, 24, 24),
      new T.MeshStandardMaterial({
        color: groundCol, roughness: th.ground === 'jam' ? 0.25 : 0.45, metalness: 0.05,
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
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(m => m.geometry?.dispose?.());
    this.scene.background = null;
    this.scene.fog = null;
  }
}
