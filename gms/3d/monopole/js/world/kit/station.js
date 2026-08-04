// stationModule() and station(). A station is the one place a company game actually lives, so
// the kit is built for the two things the reference plates do: many identical bays with one hero
// element breaking the run, and emissive window/dock texels at a density no hull can reach.
//
// Module origin is its dock face — the face a ship approaches, at z = 0, approached from −Z, with
// the body extending toward +Z. Station origin is the hub centre and the spine runs along X.
//
// Draw calls, not triangles, are the budget here: every module in a station bakes to one merged
// geometry per material and every slot in the dock row clones that buffer into a shared bucket,
// so a whole station is seven calls whatever mix of module types the row uses.

import * as THREE from 'three';
import { getMaterial, adopt } from '../materials.js';
import { palette } from '../palettes.js';
import { box, cyl, ring, paint, mergeAll, rnd } from './geom.js';

const M4 = new THREE.Matrix4();
const EU = new THREE.Euler();

const BUCKETS = ['hull', 'dark', 'panel', 'trim', 'win', 'strip', 'glow'];
const SURFACE = { hull: 'hull', dark: 'hullDark', panel: 'panel', trim: 'trim', win: 'window', strip: 'strip' };
const emptyBuckets = () => Object.fromEntries(BUCKETS.map(k => [k, []]));

// The plate's whole value story is near-white deck plate against near-black structure. Ours ran
// every bucket inside one stop of every other, which is what "flat tan" was.
const TINT = {
  hull: [1.42, 1.38, 1.30],
  dark: [0.11, 0.12, 0.16],
  panel: [0.40, 0.41, 0.47],
  trim: [0.95, 0.80, 0.62],
};

const MATS = new Map();
const GLOWS = [];
let glowPower = 1.6;
let detail = 1;

// A station is thousands of axis-aligned boxes under one key. Without these two terms every face
// of every box lands within a few percent of every other face and the whole thing reads as one
// extruded lump: world-space roughness break-up separates coplanar neighbours, and the normal
// tilt gives a deck, a wall and a soffit three different values before the light is even applied.
const SB = {
  uRough: { value: 0.30 }, uPlane: { value: 0.45 },
  uPanel: { value: 0.42 }, uDirt: { value: 0.55 },
};

const SNOISE = `
float sh31(vec3 p){ p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419)); p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float svn(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sh31(i), sh31(i + vec3(1,0,0)), f.x), mix(sh31(i + vec3(0,1,0)), sh31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sh31(i + vec3(0,0,1)), sh31(i + vec3(1,0,1)), f.x), mix(sh31(i + vec3(0,1,1)), sh31(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;

function breakUp(m) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uSRough = SB.uRough;
    sh.uniforms.uSPlane = SB.uPlane;
    sh.uniforms.uSPanel = SB.uPanel;
    sh.uniforms.uSDirt = SB.uDirt;
    sh.vertexShader = `varying vec3 vSP; varying vec3 vSN;\n` + sh.vertexShader.replace(
      '#include <worldpos_vertex>',
      `#include <worldpos_vertex>
       vSP = (modelMatrix * vec4(transformed, 1.0)).xyz;
       vSN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = `varying vec3 vSP; varying vec3 vSN;
      uniform float uSRough, uSPlane, uSPanel, uSDirt;
      ${SNOISE}\n` + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `#include <roughnessmap_fragment>
       {
         vec3 pn = vSP * 0.021;
         float rn = svn(pn) * 0.6 + svn(pn * 5.1 + 7.0) * 0.4;
         roughnessFactor = clamp(roughnessFactor + uSRough * (rn - 0.5) * 2.6
           + uSPanel * (sh31(floor(vSP / 6.5)) - 0.5) * 0.9, 0.20, 0.90);
       }`);
    // The tiling plate map is one noise at one scale on every panel of every module, which is
    // the fastest read of programmer art there is. These are hard-edged world-space blocks at
    // two sizes, so identical modules placed at different x get different cladding, plus a very
    // low-frequency soot gradient that runs across module boundaries.
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <map_fragment>',
      `#include <map_fragment>
       diffuseColor.rgb *= 1.0 + uSPlane * (normalize(vSN).y * 0.62 - abs(normalize(vSN).x) * 0.20);
       {
         float b1 = sh31(floor(vSP / 6.5));
         float b2 = sh31(floor(vSP / 21.0) + 3.7);
         float b3 = sh31(floor(vSP / 61.0) + 11.3);
         diffuseColor.rgb *= 1.0 + uSPanel * ((b1 - 0.5) * 0.34 + (b2 - 0.5) * 0.66 + (b3 - 0.5) * 0.42);
         float soot = svn(vSP * 0.0062) * 0.65 + svn(vSP * 0.019 + 4.0) * 0.35;
         diffuseColor.rgb *= 1.0 - uSDirt * smoothstep(0.44, 0.86, soot) * 0.62;
         diffuseColor.rgb *= 1.0 - uSDirt * 0.22 * clamp(-normalize(vSN).y, 0.0, 1.0);
       }`);
  };
  m.customProgramCacheKey = () => 'stationbreak2';
  return m;
}

function smat(paletteId, bucket) {
  const key = `${paletteId}:${bucket}`;
  const hit = MATS.get(key);
  if (hit) return hit;
  let m;
  if (bucket === 'glow') {
    m = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: true });
    m.userData = { palette: paletteId, surface: 'stationGlow' };
    m.color.setScalar(glowPower);
    GLOWS.push(m);
  } else {
    const src = getMaterial(paletteId, SURFACE[bucket]);
    if (bucket === 'win' || bucket === 'strip') { MATS.set(key, src); return src; }
    m = src.clone();
    m.userData = { ...src.userData };
    m.vertexColors = true;
    m.color.multiply(new THREE.Color(...TINT[bucket]));
    if (m.normalMap) m.normalScale.set(0.6, 0.6);
    breakUp(m);
    adopt(m);
  }
  m.name = `station:${key}`;
  MATS.set(key, m);
  return m;
}

// ── emissive detail ──────────────────────────────────────────────────────────

const FACE = {
  '+z': { rot: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], n: [0, 0, 1] },
  '-z': { rot: [0, Math.PI, 0], u: [-1, 0, 0], v: [0, 1, 0], n: [0, 0, -1] },
  '+x': { rot: [0, Math.PI / 2, 0], u: [0, 0, -1], v: [0, 1, 0], n: [1, 0, 0] },
  '-x': { rot: [0, -Math.PI / 2, 0], u: [0, 0, 1], v: [0, 1, 0], n: [-1, 0, 0] },
  '+y': { rot: [-Math.PI / 2, 0, 0], u: [1, 0, 0], v: [0, 0, -1], n: [0, 1, 0] },
};

// A pane is one quad on one cell of the 16×16 atlas. The atlas already carries mixed brightness,
// a cool minority and ~28 % dark cells, so picking a cell varies size, brightness and colour
// temperature at once — which is the whole reason a thousand of these do not read as a pattern.
function windowGrid(out, R, { face, x, y, z, w, h, cols, rows, fill = 0.62, skip = 0.2, off = 0.08 }) {
  const F = FACE[face];
  const cw = w / cols, ch = h / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (R() < skip) continue;
      const pw = cw * fill * (0.7 + 0.5 * R());
      const ph = ch * fill * (0.6 + 0.5 * R());
      const g = new THREE.PlaneGeometry(pw, ph);
      const uv = g.attributes.uv;
      const cx = Math.floor(R() * 16), cy = Math.floor(R() * 16);
      for (let k = 0; k < 4; k++) uv.setXY(k, (cx + uv.getX(k)) / 16, (cy + uv.getY(k)) / 16);
      paint(g, 1);
      g.applyMatrix4(M4.makeRotationFromEuler(EU.set(...F.rot)));
      const du = (i + 0.5 - cols / 2) * cw, dv = (j + 0.5 - rows / 2) * ch;
      g.applyMatrix4(M4.makeTranslation(
        x + F.u[0] * du + F.v[0] * dv + F.n[0] * off,
        y + F.u[1] * du + F.v[1] * dv + F.n[1] * off,
        z + F.u[2] * du + F.v[2] * dv + F.n[2] * off));
      out.push(g);
    }
  }
}

// A quad whose vertex colour carries both hue and falloff, so one opaque draw gives a hot mouth
// and a soft edge. Additive over a lit surface would show that surface's plating straight through.
function glowQuad(w, h, face, x, y, z, col, power, fall = 2.0) {
  const g = new THREE.PlaneGeometry(w, h, 4, 4);
  const p = g.attributes.position, n = p.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const du = Math.abs(p.getX(i)) / (w * 0.5), dv = Math.abs(p.getY(i)) / (h * 0.5);
    const v = power * (0.10 + 0.90 * Math.max(0, 1 - Math.max(du, dv)) ** fall);
    c[i * 3] = col.r * v; c[i * 3 + 1] = col.g * v; c[i * 3 + 2] = col.b * v;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  const F = FACE[face];
  g.applyMatrix4(M4.makeRotationFromEuler(EU.set(...F.rot)));
  g.applyMatrix4(M4.makeTranslation(x, y, z));
  return g;
}

// dead-regular pitch: a viewer reads an evenly spaced lit row as dock lights and sizes the
// structure off it, which is the cheapest scale cue available
function dockLights(out, { axis, from, to, pitch, x, y, z, size = 0.34 }) {
  for (let t = from; t <= to; t += pitch) {
    const p = [x, y, z];
    p[axis] += t;
    out.push(box(size, size, size, p[0], p[1], p[2]));
  }
}

// The plate's fourth and finest density band: navigation points, a metre across, far too small
// to model but bright enough that bloom turns each into a coloured dot. They ride the glow
// bucket, whose material colour is a scalar, so the hue has to live in the vertex colour.
const NAV = { red: [1.0, 0.13, 0.07], amber: [1.0, 0.55, 0.12], cyan: [0.35, 0.82, 1.0], white: [0.9, 0.95, 1.0] };

function navPoints(out, hue, pts, size = 1.4, power = 1.1) {
  for (const [x, y, z] of pts) {
    const g = new THREE.BoxGeometry(size, size, size);
    paint(g, [hue[0] * power, hue[1] * power, hue[2] * power]);
    g.applyMatrix4(M4.makeTranslation(x, y, z));
    out.push(g);
  }
}

function navRun(out, hue, { axis, from, to, pitch, x, y, z, size = 1.2, power = 1.0 }) {
  const pts = [];
  for (let t = from; t <= to; t += pitch) { const p = [x, y, z]; p[axis] += t; pts.push(p); }
  navPoints(out, hue, pts, size, power);
}

// ── modules ──────────────────────────────────────────────────────────────────

const BAY_D = 54;

const MODULES = {
  // The repeated unit. Its top is a pale deck split by a dark slot with an emissive line in it,
  // its ±X walls carry the deckhouses a camera looking down the spine actually sees, and its
  // dock face is a lit mouth.
  bay(g, R, p) {
    const W = 38, H = 17, D = BAY_D, hw = W / 2;
    const warm = new THREE.Color(p.strip);

    g.dark.push(box(W, 2.0, D, 0, -H / 2, D / 2, 0, 0, 0, 0.55));
    g.dark.push(box(W, 1.4, D * 0.92, 0, H / 2 - 4.2, D / 2, 0, 0, 0, 0.4));
    for (const s of [-1, 1]) {
      g.panel.push(box(3.0, H, D, s * (hw - 1.5), 0, D / 2, 0, 0, 0, 0.7));
      g.dark.push(box(1.2, H * 0.7, D * 0.96, s * (hw - 3.2), -1.5, D / 2, 0, 0, 0, 0.42));
    }

    // pale deck plates either side of a dark slot — the value break that makes the run read.
    // The hot line down each plate edge is 8500_06's own trick: the containers are separated by
    // orange slot lights, not by shadow, so the run stays legible at thumbnail size.
    for (const s of [-1, 1]) {
      g.hull.push(box(W * 0.40, 1.6, D * 0.90, s * W * 0.29, H / 2 + 0.8, D / 2, 0, 0, 0, 1.0));
      g.hull.push(box(W * 0.40, 0.5, D * 0.30, s * W * 0.29, H / 2 + 1.8, D * 0.30, 0, 0, 0, 1.0));
      g.trim.push(box(W * 0.35, 0.30, 1.1, s * W * 0.29, H / 2 + 1.7, D * 0.10));
      g.dark.push(box(W * 0.46, 1.9, D * 0.94, s * W * 0.29, H / 2 + 0.6, D / 2, 0, 0, 0, 0.3));
      for (const e of [-1, 1]) {
        g.strip.push(box(0.5, 0.30, D * 0.86, s * W * 0.29 + e * W * 0.205, H / 2 + 1.55, D / 2));
      }
    }
    g.dark.push(box(W * 0.22, 2.2, D * 0.88, 0, H / 2 - 0.3, D / 2, 0, 0, 0, 0.30));
    g.strip.push(box(W * 0.13, 0.22, D * 0.80, 0, H / 2 - 0.6, D / 2));
    g.strip.push(box(W * 0.13, 0.22, D * 0.80, 0, H / 2 + 0.55, D / 2));

    // cross ribs at a fixed pitch, the second scale cue
    for (let i = 0; i < 7; i++) {
      const z = D * (0.08 + i * 0.135);
      g.dark.push(box(W * 0.98, 0.9, 1.3, 0, H / 2 + 1.2, z, 0, 0, 0, 0.6));
      if (i % 2 === 0) g.trim.push(box(W * 0.30, 0.22, 0.8, s01(R) * W * 0.29, H / 2 + 1.75, z));
    }

    // deckhouses: their ±X walls are what a camera looking down the spine sees, so this is where
    // the window density has to go
    for (const [dz, w, h, d] of [[0.30, W * 0.30, 6.0, 9.0], [0.62, W * 0.24, 4.4, 7.0], [0.86, W * 0.34, 3.0, 5.5]]) {
      const s = R() < 0.5 ? -1 : 1;
      const x = s * W * 0.27, z = D * dz;
      g.panel.push(box(w, h, d, x, H / 2 + 1.6 + h / 2, z, 0, 0, 0, 0.9));
      g.hull.push(box(w * 1.05, 0.5, d * 1.05, x, H / 2 + 1.6 + h, z, 0, 0, 0, 1.0));
      for (const f of ['+x', '-x']) {
        windowGrid(g.win, R, { face: f, x: x + (f === '+x' ? w / 2 : -w / 2), y: H / 2 + 1.6 + h / 2, z,
          w: d * 0.8, h: h * 0.66, cols: Math.max(2, Math.round(4 * detail)), rows: 3, skip: 0.24 });
      }
      windowGrid(g.win, R, { face: '+z', x, y: H / 2 + 1.6 + h / 2, z: z + d / 2,
        w: w * 0.7, h: h * 0.6, cols: 3, rows: 2, skip: 0.3 });
    }

    // the dock mouth: a collar standing proud of the face and a lit wall behind it
    const mw = W * 0.52, mh = H * 0.48;
    for (const [w, h, x, y] of [[mw + 4, 2.2, 0, mh / 2 + 1.1], [mw + 4, 2.2, 0, -mh / 2 - 1.1],
      [2.2, mh, -mw / 2 - 1.1, 0], [2.2, mh, mw / 2 + 1.1, 0]]) {
      g.panel.push(box(w, h, 3.0, x, y, 1.5, 0, 0, 0, 0.8));
    }
    g.trim.push(box(mw + 8.4, 0.30, 0.9, 0, mh / 2 + 2.3, 3.1));
    g.dark.push(box(mw + 8, mh + 4, 1.0, 0, 0, 0.6, 0, 0, 0, 0.25));
    // A third of the row is shut. One identical lit rectangle on every bay is the loudest repeat
    // on the station, and a closed door is also the only thing that puts a dark hole in the run.
    const open = R();
    if (open < 0.34) {
      g.panel.push(box(mw, mh, 0.8, 0, 0, -0.5, 0, 0, 0, 0.55));
      for (let i = -2; i <= 2; i++) g.dark.push(box(mw * 0.98, 0.5, 0.7, 0, i * mh * 0.19, -1.0, 0, 0, 0, 0.3));
      g.trim.push(box(mw * 0.9, 0.24, 0.5, 0, -mh * 0.42, -1.1));
      navPoints(g.glow, NAV.red, [[0, mh * 0.40, -1.2]], 1.1, 1.2);
    } else {
      g.glow.push(glowQuad(mw, mh, '-z', 0, 0, -0.2, warm, 0.30 + 0.34 * open, 2.3));
      // a lit rectangle with nothing in front of it is a flat orange decal; the gate bars are
      // what turn it into a mouth with something inside
      for (const y of [-mh * 0.30, mh * 0.30]) g.dark.push(box(mw * 1.02, 0.6, 0.6, 0, y, -0.75, 0, 0, 0, 0.2));
      for (const x of [-mw * 0.30, mw * 0.06, mw * 0.34]) g.dark.push(box(0.7, mh * 1.02, 0.6, x, 0, -0.75, 0, 0, 0, 0.2));
      g.panel.push(box(mw * 0.36, mh * 0.30, 1.2, -mw * 0.16, -mh * 0.28, -1.1, 0, 0, 0, 0.5));
    }
    navPoints(g.glow, NAV.red, [[-(mw / 2 + 2.4), mh / 2 + 2.4, 0.4], [mw / 2 + 2.4, mh / 2 + 2.4, 0.4]], 1.2, 1.2);
    navPoints(g.glow, NAV.cyan, [[0, -mh / 2 - 2.6, 0.4]], 1.0, 1.0);

    // flank windows on the bay body, low on the wall
    for (const f of ['+x', '-x']) {
      windowGrid(g.win, R, { face: f, x: (f === '+x' ? hw : -hw) + (f === '+x' ? 0.1 : -0.1), y: -2.5, z: D * 0.55,
        w: D * 0.6, h: 6, cols: Math.max(3, Math.round(8 * detail)), rows: 3, skip: 0.3 });
    }

    dockLights(g.strip, { axis: 2, from: 3, to: D - 3, pitch: 4, x: -hw - 0.4, y: H / 2 + 1.2, z: 0 });
    dockLights(g.strip, { axis: 2, from: 3, to: D - 3, pitch: 4, x: hw + 0.4, y: H / 2 + 1.2, z: 0 });
    dockLights(g.strip, { axis: 2, from: 5, to: D - 5, pitch: 5, x: -W * 0.10, y: H / 2 + 1.9, z: 0 });
    dockLights(g.strip, { axis: 2, from: 5, to: D - 5, pitch: 5, x: W * 0.10, y: H / 2 + 1.9, z: 0 });

    if (detail > 0.4) {
      for (let i = 0; i < Math.round(14 * detail); i++) {
        const s = R() < 0.5 ? -1 : 1;
        g.panel.push(box(1.2 + 3.4 * R(), 0.5 + 1.6 * R() ** 2, 1.2 + 4.0 * R(),
          s * (W * 0.12 + R() * W * 0.34), H / 2 + 2.0, D * (0.06 + 0.88 * R()), 0, 0, 0, 0.85));
      }
    }
  },

  // Tanks, stacks and a hot separator core. Its silhouette is round where everything else is
  // square, which is what stops the station reading as one material.
  refinery(g, R, p) {
    const warm = new THREE.Color(p.engine);
    g.dark.push(box(60, 8, 74, 0, -22, 40, 0, 0, 0, 0.5));
    for (const [x, z, r, h] of [[-19, 26, 11, 44], [10, 24, 13, 52], [-14, 58, 9, 34], [16, 60, 10, 38]]) {
      g.panel.push(cyl(r, r, h, 18, x, h / 2 - 18, z, 0, 0, 0.85));
      g.trim.push(cyl(r * 1.06, r * 1.06, 1.1, 18, x, h - 20, z));
      g.trim.push(cyl(r * 1.06, r * 1.06, 1.1, 18, x, -12, z));
      g.dark.push(cyl(r * 0.35, r * 0.55, 7, 12, x, h - 14, z, 0, 0, 0.7));
      dockLights(g.strip, { axis: 1, from: -14, to: h - 22, pitch: 7, x: x + r + 0.3, y: 0, z });
    }
    g.dark.push(cyl(6, 6, 62, 14, -3, 6, 42, Math.PI / 2, 0, 0.6));
    for (const [x, y] of [[-24, 18], [22, 26]]) {
      g.panel.push(box(14, 10, 16, x, y, 46, 0, 0, 0, 0.9));
      windowGrid(g.win, R, { face: '-z', x, y, z: 38, w: 10, h: 6, cols: 5, rows: 3, skip: 0.25 });
      windowGrid(g.win, R, { face: '+x', x: x + 7, y, z: 46, w: 12, h: 6, cols: 5, rows: 3, skip: 0.3 });
    }
    g.glow.push(glowQuad(16, 16, '-z', 0, -6, 3, warm, 1.3, 2.4));
    g.dark.push(box(26, 26, 5, 0, -6, 6, 0, 0, 0, 0.3));
    for (const s of [-1, 1]) g.trim.push(box(2.0, 34, 2.0, s * 26, 0, 12));
  },

  // A rack of induction coils on a spine. The repeated rings give a second, finer repetition
  // than the bays, at a different frequency.
  coilline(g, R, p) {
    const warm = new THREE.Color(p.accent);
    g.dark.push(cyl(4.5, 4.5, 150, 12, 0, 0, 78, Math.PI / 2, 0, 0.6));
    g.panel.push(box(26, 3.5, 150, 0, -12, 78, 0, 0, 0, 0.75));
    for (let i = 0; i < 10; i++) {
      const z = 12 + i * 14.5;
      g.panel.push(ring(9.5, 2.0, 14, 0, 0, z, 0, 0.9));
      g.trim.push(ring(11.6, 0.5, 14, 0, 0, z, 0));
      g.glow.push(glowQuad(15, 15, '-z', 0, 0, z - 2.4, warm, 0.5, 3.0));
      g.dark.push(box(3, 12, 2.2, 0, -8, z, 0, 0, 0, 0.5));
      if (i % 3 === 0) windowGrid(g.win, R, { face: '+x', x: 13, y: -11, z, w: 10, h: 3, cols: 4, rows: 2, skip: 0.2 });
    }
    g.panel.push(box(22, 16, 14, 0, 0, 4, 0, 0, 0, 0.9));
    g.trim.push(box(23, 0.4, 1.0, 0, 8.4, 4));
    windowGrid(g.win, R, { face: '-z', x: 0, y: 0, z: -3.2, w: 16, h: 10, cols: 6, rows: 4, skip: 0.22 });
    dockLights(g.strip, { axis: 2, from: 10, to: 148, pitch: 8, x: 13.5, y: -13, z: 0 });
    dockLights(g.strip, { axis: 2, from: 10, to: 148, pitch: 8, x: -13.5, y: -13, z: 0 });
  },

  // The hub: a drum lying along the module's depth axis, ringed with window bands. Round, huge,
  // and the only thing on the station with a curved horizon.
  hub(g, R, p) {
    const r = 42, L = 84, zc = 42;
    g.panel.push(cyl(r, r, L, 34, 0, 0, zc, Math.PI / 2, 0, 0.95));
    for (const z of [zc - 22, zc + 22]) g.dark.push(cyl(r * 1.03, r * 1.03, 7, 34, 0, 0, z, Math.PI / 2, 0, 0.5));
    for (const z of [zc - 34, zc + 34]) g.trim.push(cyl(r * 1.06, r * 1.06, 1.4, 34, 0, 0, z, Math.PI / 2, 0));
    g.panel.push(cyl(r * 0.62, r * 0.72, 10, 24, 0, 0, -3, Math.PI / 2, 0, 0.8));
    g.dark.push(cyl(r * 0.34, r * 0.34, 30, 16, 0, 0, zc + L * 0.5 + 14, Math.PI / 2, 0, 0.6));
    // seen end-on the drum is a plain disc and reads as a moon; the cap ribs and the hub boss are
    // what stop that at the one angle a station shot is most likely to catch it
    for (const [ze, s] of [[zc - L * 0.5 - 0.6, -1], [zc + L * 0.5 + 0.6, 1]]) {
      g.dark.push(cyl(r * 0.86, r * 0.86, 2.0, 30, 0, 0, ze + s * 0.8, Math.PI / 2, 0, 0.5));
      g.panel.push(cyl(r * 0.40, r * 0.46, 5.0, 20, 0, 0, ze + s * 2.6, Math.PI / 2, 0, 0.85));
      g.trim.push(cyl(r * 0.16, r * 0.16, 6.0, 12, 0, 0, ze + s * 4.0, Math.PI / 2, 0));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        g.dark.push(box(1.6, r * 0.9, 2.2, Math.sin(a) * r * 0.48, Math.cos(a) * r * 0.48, ze + s * 1.4, 0, 0, -a, 0.45));
        // a smooth circle in silhouette reads as a moon, whatever is drawn on its face
        if (i % 2 === 0) {
          g.panel.push(box(7, 5, 9, Math.sin(a) * r * 1.02, Math.cos(a) * r * 1.02, ze - s * 5, 0, 0, -a, 0.8));
          g.dark.push(box(2.0, 2.0, 16, Math.sin(a) * r * 1.10, Math.cos(a) * r * 1.10, ze - s * 10, 0, 0, 0, 0.45));
        }
      }
      navRun(g.glow, NAV.red, { axis: 0, from: -r * 0.9, to: r * 0.9, pitch: r * 0.45,
        x: 0, y: 0, z: ze + s * 1.2, size: 1.2, power: 1.1 });
    }

    // three window bands round the drum: the densest emissive run on the station, and the only
    // curved row of lights in the frame
    for (const z of [zc - 32, zc - 22, zc - 8, zc + 6, zc + 20, zc + 32]) {
      const n = 96;
      for (let i = 0; i < n; i++) {
        if (R() < 0.32) continue;
        const a = (i / n) * Math.PI * 2;
        const q = new THREE.PlaneGeometry(1.5, 0.95);
        const uv = q.attributes.uv;
        const cx = Math.floor(R() * 16), cy = Math.floor(R() * 16);
        for (let k = 0; k < 4; k++) uv.setXY(k, (cx + uv.getX(k)) / 16, (cy + uv.getY(k)) / 16);
        paint(q, 1);
        const nrm = new THREE.Vector3(Math.sin(a), Math.cos(a), 0);
        const up = new THREE.Vector3(0, 0, 1);
        const rt = new THREE.Vector3().crossVectors(up, nrm);
        q.applyMatrix4(new THREE.Matrix4().makeBasis(rt, up, nrm)
          .setPosition(nrm.x * (r + 0.3), nrm.y * (r + 0.3), z));
        g.win.push(q);
      }
    }

    for (const s of [-1, 1]) {
      g.panel.push(box(16, 26, 16, s * 30, r * 0.72, zc, 0, 0, s * 0.2, 0.9));
      windowGrid(g.win, R, { face: '+y', x: s * 30, y: r * 0.72 + 13.1, z: zc, w: 12, h: 12, cols: 4, rows: 4, skip: 0.3 });
    }
    g.panel.push(box(20, 34, 22, 0, r + 12, zc, 0, 0, 0, 0.92));
    g.trim.push(box(21, 0.5, 23, 0, r + 29, zc));
    for (const f of ['+x', '-x', '+z', '-z']) {
      windowGrid(g.win, R, { face: f, x: f === '+x' ? 10.1 : f === '-x' ? -10.1 : 0, y: r + 14,
        z: f === '+z' ? zc + 11.1 : f === '-z' ? zc - 11.1 : zc, w: f === '+x' || f === '-x' ? 18 : 15, h: 22,
        cols: 5, rows: 6, skip: 0.24 });
    }
    g.trim.push(box(0.7, 26, 0.7, 4, r + 42, zc));
    g.strip.push(box(1.1, 1.1, 1.1, 4, r + 55, zc));
    dockLights(g.strip, { axis: 2, from: -34, to: 34, pitch: 8, x: 0, y: r + 0.6, z: zc });
  },

  // The break in the run. One mass that owns the frame, in the faction accent, with an emissive
  // edge line — 8500_06 is twenty grey bays and one orange spine, and the orange spine is the shot.
  spine(g, R, p) {
    const L = 320, sl = L / 9, hot = new THREE.Color(p.strip);
    // An accent-coloured extruded box has one normal per side, so however hard the key hits it
    // the whole flank comes back at one value and reads as a wall. The section is chamfered
    // instead: belly, lower chine, flank, upper chine and pale deck are five faces at five
    // angles, which is where the value range on the plate's hero actually comes from.
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const w = 42 * (0.30 + 0.70 * Math.sin(Math.min(1, t * 1.15) * Math.PI) ** 0.55) + 5;
      const h = 21 * (0.34 + 0.66 * Math.sin(Math.min(1, t * 1.1) * Math.PI) ** 0.6) + 3;
      const z = L * (t * 0.98 + 0.02);
      g.dark.push(box(w * 0.80, h * 0.52, sl, 0, -h * 0.36, z, 0, 0, 0, 0.42));
      g.panel.push(box(w * 0.86, h * 0.90, sl * 0.99, 0, 0, z, 0, 0, 0, 0.9));
      for (const s of [-1, 1]) {
        const c = h * 0.34;
        g.trim.push(box(c, c, sl, s * (w * 0.44 - c * 0.18), -h * 0.26, z, 0, 0, s * 0.80, 0.7));
        g.trim.push(box(w * 0.10, h * 0.44, sl, s * w * 0.46, h * 0.02, z, 0, 0, 0, 0.95));
        g.trim.push(box(c, c, sl, s * (w * 0.42 - c * 0.18), h * 0.30, z, 0, 0, -s * 0.72, 1.0));
        g.dark.push(box(w * 0.11, h * 0.06, sl * 0.94, s * w * 0.47, h * 0.20, z, 0, 0, 0, 0.3));
        if (i % 3 === 1) g.panel.push(box(3.0, 2.4, sl * 0.44, s * w * 0.46, -h * 0.02, z, 0, 0, 0, 0.75));
      }
      g.hull.push(box(w * 0.66, h * 0.14, sl * 0.96, 0, h * 0.48, z, 0, 0, 0, 1.0));
      g.dark.push(box(w * 0.30, h * 0.30, sl * 0.86, 0, h * 0.66, z, 0, 0, 0, 0.5));
      g.hull.push(box(w * 0.18, h * 0.10, sl * 0.72, 0, h * 0.84, z, 0, 0, 0, 1.0));
      if (i % 2 === 0) g.dark.push(box(w * 0.94, 1.2, 2.4, 0, h * 0.56, z, 0, 0, 0, 0.4));
      navPoints(g.glow, NAV.red, [[0, h * 0.90 + 1.0, z]], 1.3, 1.2);
    }
    for (const s of [-1, 1]) {
      g.strip.push(box(1.1, 1.1, L * 0.86, s * 18, 4.6, L * 0.5));
      g.panel.push(box(5.5, 2.6, L * 0.30, s * 22, -5.5, L * 0.62, 0, 0, s * 0.25, 0.75));
    }
    g.dark.push(box(34, 16, 30, 0, -3, L * 0.06, 0, 0, 0, 0.45));
    g.glow.push(glowQuad(26, 12, '-z', 0, -3, L * 0.06 - 15.2, hot, 1.6, 1.6));
    g.panel.push(box(18, 26, 38, 0, 16, L * 0.74, 0, 0, 0, 0.95));
    for (const f of ['+x', '-x']) {
      windowGrid(g.win, R, { face: f, x: f === '+x' ? 9.1 : -9.1, y: 16, z: L * 0.74,
        w: 30, h: 18, cols: 8, rows: 5, skip: 0.2 });
    }
    g.trim.push(box(0.6, 26, 0.6, 3, 42, L * 0.74));
    dockLights(g.strip, { axis: 2, from: 12, to: L - 12, pitch: 7, x: 0, y: 12.5, z: 0 });
  },

  // Ribbed radiators. Two flat wings out of a boom, combed at a pitch four times finer than the
  // bay ribs — the plate's surfaces run smooth spine → radiators → rail clutter → nav points, and
  // this is the second of those four densities. Flat wings are also the only non-boxy silhouette
  // in the row.
  radiator(g, R, p) {
    const D = 50, warm = new THREE.Color(p.strip);
    g.panel.push(box(17, 12, 13, 0, 0, 7.5, 0, 0, 0, 0.85));
    g.dark.push(box(19.5, 2.6, 2.2, 0, 7.2, 7.5, 0, 0, 0, 0.5));
    g.dark.push(box(4.6, 4.0, D, 0, 0, D / 2, 0, 0, 0, 0.42));
    g.trim.push(box(14, 0.30, 1.0, 0, 6.6, 3.2));
    g.glow.push(glowQuad(9, 6, '-z', 0, -1, -0.2, warm, 0.55, 2.2));
    windowGrid(g.win, R, { face: '-z', x: 0, y: 2.5, z: 0.9, w: 11, h: 5, cols: 4, rows: 2, skip: 0.28 });

    const fins = Math.max(6, Math.round(15 * detail));
    for (const s of [-1, 1]) {
      const tilt = s * 0.30, cx = s * 16.5;
      for (const z of [14.5, D - 7.5]) g.dark.push(box(31, 1.2, 2.2, cx, 3.0, z, 0, 0, tilt, 0.4));
      for (let i = 0; i < fins; i++) {
        const z = 15.5 + i * ((D - 24) / (fins - 1));
        g.panel.push(box(29.5, 0.5, 1.35, cx, 3.0, z, 0, 0, tilt, 0.95));
      }
      g.dark.push(box(2.0, 2.0, D - 22, cx * 0.30, 3.0, D / 2, 0, 0, 0, 0.45));
      const tx = cx + s * 14.6 * Math.cos(tilt), ty = 3.0 + 14.6 * Math.abs(Math.sin(tilt));
      navPoints(g.glow, NAV.red, [[tx, ty, 15.5], [tx, ty, D - 8.5]], 1.3, 1.2);
    }
    dockLights(g.strip, { axis: 2, from: 14, to: D - 8, pitch: 6, x: 0, y: 5.4, z: 0 });
  },

  // Rail clutter: a deck with running rails, a travelling crane and a yard of containers at three
  // sizes and three tints. The plate's mid-frequency band, and the only place a warm cargo colour
  // gets to sit next to the pale cladding.
  gantry(g, R, p) {
    const D = 54, W = 36, warm = new THREE.Color(p.strip);
    g.dark.push(box(W, 1.8, D, 0, -6.5, D / 2, 0, 0, 0, 0.5));
    g.panel.push(box(W * 0.86, 1.0, D * 0.9, 0, -5.4, D / 2, 0, 0, 0, 0.72));
    for (const s of [-1, 1]) {
      g.dark.push(box(1.0, 1.0, D * 0.94, s * W * 0.34, -4.6, D / 2, 0, 0, 0, 0.4));
      g.dark.push(box(1.6, 5.0, 1.6, s * W * 0.46, -4.0, 6, 0, 0, 0, 0.45));
      navRun(g.glow, NAV.amber, { axis: 2, from: 6, to: D - 6, pitch: 9, x: s * W * 0.47, y: -3.0, z: 0, size: 1.0, power: 0.9 });
    }

    const stacks = Math.max(6, Math.round(16 * detail));
    const buckets = ['hull', 'panel', 'trim', 'dark'];
    for (let i = 0; i < stacks; i++) {
      const cw = 5.5 + 4.5 * R(), ch = 3.0 + 2.4 * R() ** 2, cd = 7 + 8 * R();
      const x = (R() - 0.5) * W * 0.66, z = 6 + R() * (D - 14);
      const lay = Math.floor(R() * 3);
      for (let k = 0; k <= lay; k++) {
        const b = buckets[Math.floor(R() * (k ? 3 : 4))];
        g[b].push(box(cw, ch, cd, x + (R() - 0.5) * 1.2, -5.0 + ch * (k + 0.5), z, 0, 0, 0, 0.9 - 0.12 * k));
        if (R() < 0.4) g.trim.push(box(cw * 0.8, 0.22, 0.7, x, -5.0 + ch * (k + 1) - 0.4, z - cd * 0.5 - 0.1));
      }
    }

    // the crane: a bridge on two legs, the one thing on the row that is obviously a machine
    const cz = D * (0.34 + 0.3 * R());
    for (const s of [-1, 1]) g.dark.push(box(2.2, 20, 2.2, s * W * 0.38, 4, cz, 0, 0, 0, 0.45));
    g.panel.push(box(W + 8, 2.4, 3.4, 0, 14.4, cz, 0, 0, 0, 0.85));
    g.dark.push(box(W + 9, 0.8, 1.0, 0, 12.9, cz, 0, 0, 0, 0.4));
    g.panel.push(box(4.4, 3.6, 4.4, W * 0.16, 12.0, cz, 0, 0, 0, 0.8));
    g.dark.push(box(0.7, 9, 0.7, W * 0.16, 7.0, cz, 0, 0, 0, 0.4));
    g.dark.push(box(4.0, 1.6, 4.0, W * 0.16, 2.2, cz, 0, 0, 0, 0.45));
    windowGrid(g.win, R, { face: '-z', x: W * 0.16, y: 12.0, z: cz - 2.3, w: 3.0, h: 2.2, cols: 2, rows: 1, skip: 0.1 });
    navPoints(g.glow, NAV.red, [[-W * 0.5 - 4.6, 15.8, cz], [W * 0.5 + 4.6, 15.8, cz]], 1.4, 1.3);

    for (let i = 0; i < Math.round(7 * detail); i++) {
      g.dark.push(cyl(1.6 + R(), 1.6 + R(), 4 + 4 * R(), 10,
        (R() - 0.5) * W * 0.7, -3.4, 6 + R() * (D - 12), 0, 0, 0.7));
    }
    g.glow.push(glowQuad(11, 5, '-z', 0, -3, -0.2, warm, 0.5, 2.4));
  },

  // Tankage. Round where the row is square, and the cradles and catwalk give it a third rhythm
  // between the radiator comb and the bay ribs.
  tankage(g, R, p) {
    const D = 58;
    g.dark.push(box(34, 2.0, D, 0, -11, D / 2, 0, 0, 0, 0.5));
    for (const [x, y, r, L, z0] of [[-9, 1, 9.5, 34, 12], [10, 0, 8.0, 40, 10], [0, 15, 6.2, 26, 22]]) {
      g.panel.push(cyl(r, r, L, 16, x, y, z0 + L / 2, Math.PI / 2, 0, 0.95));
      g.panel.push(cyl(r * 0.55, r * 0.9, 3.2, 14, x, y, z0 - 1.4, Math.PI / 2, 0, 0.8));
      for (let i = 0; i <= 4; i++) {
        g.dark.push(cyl(r * 1.05, r * 1.05, 0.9, 16, x, y, z0 + (L * i) / 4, Math.PI / 2, 0, 0.45));
      }
      for (const s of [-1, 1]) g.dark.push(box(1.6, r + 9, 1.6, x + s * r * 0.8, y - r * 0.5 - 4, z0 + L * 0.5, 0, 0, 0, 0.4));
      navRun(g.glow, NAV.red, { axis: 2, from: z0 + 3, to: z0 + L - 3, pitch: 11, x, y: y + r + 0.9, z: 0, size: 1.1, power: 1.1 });
    }
    g.panel.push(box(15, 9, 12, 0, -4, 6.5, 0, 0, 0, 0.9));
    windowGrid(g.win, R, { face: '-z', x: 0, y: -4, z: 0.4, w: 10, h: 5, cols: 4, rows: 2, skip: 0.25 });
    g.dark.push(box(24, 1.2, 2.0, 0, -9.4, 4.0, 0, 0, 0, 0.45));
    // catwalk with a handrail at a fixed pitch — a known-small thing to size the tanks against
    for (const s of [-1, 1]) {
      g.dark.push(box(3.4, 0.6, D * 0.82, s * 16, -8.4, D / 2, 0, 0, 0, 0.55));
      for (let z = 10; z < D - 6; z += 3.4) g.dark.push(box(0.35, 2.2, 0.35, s * 17.4, -7.2, z, 0, 0, 0, 0.4));
      g.trim.push(box(0.4, 0.4, D * 0.8, s * 17.4, -6.1, D / 2));
      dockLights(g.strip, { axis: 2, from: 8, to: D - 6, pitch: 7, x: s * 16, y: -7.9, z: 0 });
    }
    for (let i = 0; i < Math.round(6 * detail); i++) {
      g.dark.push(box(1.0, 1.0, 8 + 12 * R(), (R() - 0.5) * 26, -10 + R() * 22, 12 + R() * (D - 24), 0, 0, 0, 0.4));
    }
  },

  // A lattice mast. Every other module on the row is horizontal; this is the vertical break, and
  // its dishes and strobes are the smallest recognisable objects on the station.
  mast(g, R, p) {
    const H = 108, r = 3.4;
    g.dark.push(box(20, 4.0, 22, 0, -2, 11, 0, 0, 0, 0.5));
    g.panel.push(box(13, 7, 12, 0, 2.5, 10, 0, 0, 0, 0.85));
    windowGrid(g.win, R, { face: '-z', x: 0, y: 2.5, z: 3.9, w: 8, h: 4, cols: 3, rows: 2, skip: 0.25 });
    for (const [dx, dz] of [[r, r], [r, -r], [-r, r], [-r, -r]]) {
      g.dark.push(box(1.1, H, 1.1, dx, H / 2 + 5, 11 + dz, 0, 0, 0, 0.45));
    }
    const rungs = Math.max(6, Math.round(14 * detail));
    for (let i = 0; i <= rungs; i++) {
      const y = 6 + (H - 4) * (i / rungs);
      g.dark.push(box(r * 2 + 1.1, 0.7, 0.7, 0, y, 11 + r, 0, 0, 0, 0.4));
      g.dark.push(box(r * 2 + 1.1, 0.7, 0.7, 0, y, 11 - r, 0, 0, 0, 0.4));
      g.dark.push(box(0.7, 0.7, r * 2, r, y, 11, 0, 0, 0, 0.4));
      g.dark.push(box(0.7, 0.7, r * 2, -r, y, 11, 0, 0, 0, 0.4));
      if (i < rungs) {
        const seg = (H - 4) / rungs, a = Math.atan2(r * 2, seg) * (i % 2 ? 1 : -1);
        g.dark.push(box(0.6, Math.hypot(seg, r * 2), 0.6, r, y + seg / 2, 11, a, 0, 0, 0.35));
        g.dark.push(box(0.6, Math.hypot(seg, r * 2), 0.6, -r, y + seg / 2, 11, -a, 0, 0, 0.35));
      }
    }
    for (const [y, rr, s] of [[34, 5.2, 1], [58, 3.9, -1], [80, 4.5, 1]]) {
      // panel-bright and face-on to the key a dish reads as a golf ball; these want to be dark
      g.dark.push(cyl(rr, rr * 0.22, 2.6, 14, s * (r + rr * 0.8), y, 11, 0, s * 1.15, 0.55));
      g.dark.push(box(0.7, 0.7, 4.0, s * (r + rr * 0.4), y, 11, 0, 0, 0, 0.4));
    }
    g.trim.push(box(1.2, 12, 1.2, 0, H + 12, 11));
    navPoints(g.glow, NAV.red, [[0, H + 19, 11], [0, H + 6, 11]], 1.5, 1.5);
    navRun(g.glow, NAV.red, { axis: 1, from: 12, to: H, pitch: 26, x: -r - 0.9, y: 0, z: 11 + r, size: 1.1, power: 1.1 });
  },

  // A tapered spire. Its only job is to be the near, dark, off-frame layer in a haze shot.
  pylon(g, R, p) {
    const H = 300;
    for (let i = 0; i < 10; i++) {
      const t = i / 9;
      const w = 30 * (1 - t * 0.72);
      g.panel.push(box(w, H / 10, w * 0.8, 0, H * t + H / 20, 20, 0, 0, 0, 0.9 - 0.1 * (i % 2)));
      g.dark.push(box(w * 1.06, 1.6, w * 0.86, 0, H * t + H / 10, 20, 0, 0, 0, 0.4));
      if (i % 2 === 0) {
        windowGrid(g.win, R, { face: '-z', x: 0, y: H * t + H / 20, z: 20 - w * 0.4 - 0.2,
          w: w * 0.7, h: H / 14, cols: 4, rows: 5, skip: 0.28 });
        g.trim.push(box(w * 1.1, 0.4, 1.0, 0, H * t + H / 20, 20 - w * 0.42));
      }
    }
    g.dark.push(box(40, 14, 34, 0, 6, 20, 0, 0, 0, 0.35));
    g.strip.push(box(1.4, 1.4, 1.4, 0, H + 6, 20));
    dockLights(g.strip, { axis: 1, from: 20, to: H - 20, pitch: 22, x: 12, y: 0, z: 4 });
  },
};

const s01 = R => (R() < 0.5 ? -1 : 1);

export const allStationModules = () => Object.keys(MODULES);

function buildBuckets(moduleId, paletteId, seed) {
  const g = emptyBuckets();
  const R = rnd((0x51ed | 0) + seed * 2654435761 + moduleId.length * 7919);
  (MODULES[moduleId] || MODULES.bay)(g, R, palette(paletteId));
  return g;
}

// A module baked to one merged geometry per bucket, cached by id/palette/seed/detail. Cloning a
// baked buffer and applying a matrix costs a memcpy, so a row of twenty different modules merges
// into the same seven meshes an instanced row of one module used to need — which is what makes
// module vocabulary free in draw calls.
const BAKED = new Map();

function bakedModule(moduleId, paletteId, seed) {
  const key = `${moduleId}:${paletteId}:${seed}:${detail}`;
  let hit = BAKED.get(key);
  if (hit) return hit;
  const g = buildBuckets(moduleId, paletteId, seed);
  hit = {};
  for (const k of BUCKETS) hit[k] = mergeAll(g[k]);
  BAKED.set(key, hit);
  return hit;
}

function placeBaked(out, moduleId, paletteId, seed, m) {
  const b = bakedModule(moduleId, paletteId, seed);
  for (const k of BUCKETS) if (b[k]) out[k].push(b[k].clone().applyMatrix4(m));
}

function meshesFrom(g, paletteId, grp) {
  for (const k of BUCKETS) {
    const m = mergeAll(g[k]);
    if (!m) continue;
    grp.add(new THREE.Mesh(m, smat(paletteId, k)));
  }
  return grp;
}

export function stationModule(moduleId, { palette: paletteId = 'ferrous', seed = 0 } = {}) {
  const grp = new THREE.Group();
  grp.name = `module:${moduleId}`;
  meshesFrom(buildBuckets(moduleId, paletteId, seed), paletteId, grp);
  grp.userData.moduleId = moduleId;
  return grp;
}

// ── stations ─────────────────────────────────────────────────────────────────
//
// bays: laid out in two columns either side of the spine, dock faces outward. Everything else is
// placed once. `at` is [x, y, z, rotY].

// nominal depth along +Z, so a slot's strut knows how far out to reach
const MOD_D = { bay: 54, radiator: 50, gantry: 54, tankage: 58, mast: 30, refinery: 74, coilline: 150, hub: 84, spine: 320, pylon: 300 };

const STATIONS = {
  ledger: {
    palette: 'ferrous',
    bays: { n: 24, x0: 80, pitch: 40, z: 66 },
    truss: { from: 20, to: 560, r: 9 },
    // an 11-long cycle over 20 alternating-column slots, so neither column repeats a rhythm
    row: ['bay', 'radiator', 'bay', 'gantry', 'tankage', 'bay', 'radiator', 'bay', 'mast', 'gantry', 'bay'],
    parts: [
      ['hub', [0, 0, -42, 0]],
      ['refinery', [-104, 0, 0, Math.PI / 2]],
      ['coilline', [530, 0, 0, Math.PI / 2]],
      ['spine', [326, 30, -6, Math.PI / 2]],
      ['mast', [300, 26, -8, Math.PI / 2]],
      ['radiator', [64, -46, 8, Math.PI / 2]],
    ],
    masts: [[196, -40, 10, 40], [396, -40, 10, 40]],
    swaps: { 8: { module: 'refinery', scale: 0.8, dy: -16 }, 15: { module: 'refinery', scale: 0.62, dy: -8 } },
  },
  drayyard: {
    palette: 'corvain',
    bays: { n: 14, x0: 92, pitch: 42, z: 66 },
    truss: { from: 26, to: 380, r: 8 },
    row: ['bay', 'gantry', 'radiator', 'bay', 'mast', 'tankage', 'bay'],
    parts: [
      ['hub', [0, 0, -42, 0]],
      ['coilline', [-56, 30, 0, Math.PI / 2]],
      ['pylon', [250, -230, 150, Math.PI]],
      ['refinery', [336, 46, -160, 0]],
      ['spine', [120, 40, 150, Math.PI / 2]],
    ],
    masts: [[170, 150, 8, 32], [320, 150, 8, 32]],
    swaps: { 5: { module: 'refinery', scale: 0.72, dy: -14 } },
  },
};

export const allStations = () => Object.keys(STATIONS);

// The spine truss: longerons plus frames plus diagonals. About 120 boxes, all merged, and it is
// the leading line every station shot runs the camera down.
function truss(g, { from, to, r }) {
  const L = to - from, mid = (from + to) / 2;
  for (const [dy, dz] of [[r, r], [r, -r], [-r, r], [-r, -r]]) {
    g.dark.push(box(L, 1.8, 1.8, mid, dy, dz, 0, 0, 0, 0.65));
  }
  const n = Math.max(4, Math.round(L / 18));
  for (let i = 0; i <= n; i++) {
    const x = from + (L * i) / n;
    g.dark.push(box(1.3, r * 2 + 1.8, 1.3, x, 0, r, 0, 0, 0, 0.5));
    g.dark.push(box(1.3, r * 2 + 1.8, 1.3, x, 0, -r, 0, 0, 0, 0.5));
    g.dark.push(box(1.3, 1.3, r * 2, x, r, 0, 0, 0, 0, 0.5));
    g.dark.push(box(1.3, 1.3, r * 2, x, -r, 0, 0, 0, 0, 0.5));
    if (i % 2 === 0) g.strip.push(box(0.5, 0.5, 0.5, x, r + 1.3, 0));
  }
  const seg = L / n;
  for (let i = 0; i < n; i++) {
    const x = from + seg * (i + 0.5);
    const a = Math.atan2(r * 2, seg) * (i % 2 ? 1 : -1);
    g.dark.push(box(Math.hypot(seg, r * 2), 0.9, 0.9, x, 0, r, 0, 0, a, 0.45));
    g.dark.push(box(Math.hypot(seg, r * 2), 0.9, 0.9, x, 0, -r, 0, 0, -a, 0.45));
  }
  // A bare lattice between two columns of bays reads as a rack of separate objects. The spine
  // deck is what makes the row one mass, which is the single thing 8500_06's barge has that a
  // truss-and-modules layout does not.
  const DW = 34;
  g.panel.push(box(L, 1.8, DW, mid, r + 2.2, 0, 0, 0, 0, 0.75));
  g.hull.push(box(L * 0.995, 0.7, DW * 0.42, mid, r + 3.3, -DW * 0.26, 0, 0, 0, 1.0));
  g.hull.push(box(L * 0.995, 0.7, DW * 0.42, mid, r + 3.3, DW * 0.26, 0, 0, 0, 1.0));
  g.dark.push(box(L, 1.1, DW * 0.13, mid, r + 3.5, 0, 0, 0, 0, 0.3));
  g.strip.push(box(L * 0.98, 0.24, DW * 0.05, mid, r + 3.9, 0));
  const RD = rnd(0x77a1);
  for (let x = from + 4; x < to; x += 11) {
    g.dark.push(box(1.4, 1.1, DW * 1.02, x, r + 3.4, 0, 0, 0, 0, 0.45));
    if (RD() < 0.55) {
      const w = 2.4 + 5 * RD(), h = 1.0 + 3.4 * RD() ** 2, d = 2.4 + 6 * RD();
      g[RD() < 0.3 ? 'hull' : 'panel'].push(box(w, h, d, x + 3, r + 3.6 + h / 2,
        (RD() - 0.5) * DW * 0.8, 0, 0, 0, 0.85));
    }
    if (RD() < 0.2) g.trim.push(box(3.0, 0.22, 0.8, x + 2, r + 3.7, (RD() - 0.5) * DW * 0.7));
  }
  for (const s of [-1, 1]) {
    g.dark.push(box(L, 2.0, 1.6, mid, r + 2.0, s * DW * 0.5, 0, 0, 0, 0.4));
    dockLights(g.strip, { axis: 0, from, to, pitch: 9, x: 0, y: r + 3.6, z: s * DW * 0.52, size: 0.5 });
  }
  for (let x = from + 6; x < to; x += 12) g.strip.push(box(0.6, 0.4, 0.6, x, r + 4.6, 0));
}

export function station(stationId, { palette: paletteId, seed = 0 } = {}) {
  const spec = STATIONS[stationId] || STATIONS.ledger;
  const pid = paletteId || spec.palette;
  const grp = new THREE.Group();
  grp.name = `station:${stationId}`;

  const fixed = emptyBuckets();
  truss(fixed, spec.truss);
  for (const [id, [x, y, z, ry]] of spec.parts) {
    placeBaked(fixed, id, pid, seed + id.length * 13, new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1)));
  }
  // The dock row. One module repeated at constant spacing cannot be lit into looking bespoke, so
  // the slots run a cycle of different module types, and on top of that carry ragged dock lines,
  // height and depth scale, a little yaw and dropped bays. Width never varies — the x pitch has
  // 6 m of slack.
  const { n, x0, pitch, z } = spec.bays;
  const r = spec.truss.r;
  const swaps = spec.swaps || {};
  const row = spec.row || ['bay'];
  const RB = rnd((0x2c9f | 0) + (seed + 7) * 2654435761);
  const slots = [];
  for (let i = 0; i < n; i++) {
    const col = i % 2 ? 1 : -1;
    const sw = swaps[i];
    // a swapped module is wider and deeper than a bay, so its same-column neighbours stand down
    if (!sw && (swaps[i - 2] || swaps[i + 2])) continue;
    if (!sw && RB() < 0.10) continue;
    const e = sw || row[i % row.length];
    const mod = sw ? sw.module : (typeof e === 'string' ? e : e.m);
    const tall = mod === 'mast';
    slots.push({
      i, col, mod,
      scale: sw?.scale ?? (typeof e === 'string' ? 1 : e.s ?? 1),
      x: x0 + Math.floor(i / 2) * pitch + (RB() - 0.5) * 5,
      y: (RB() - 0.5) * (tall ? 5 : 13) + (sw?.dy ?? (typeof e === 'string' ? 0 : e.dy ?? 0)),
      z: col * (z + (RB() - 0.5) * 20),
      ry: (col > 0 ? Math.PI : 0) + (RB() - 0.5) * 0.22,
      sy: mod === 'bay' ? 0.80 + 0.42 * RB() : 1,
      sz: mod === 'bay' ? 0.82 + 0.28 * RB() : 1,
    });
  }

  // struts from the truss out to each slot's inner end, so nothing floats
  for (const s of slots) {
    const gap = Math.max(3, Math.abs(s.z) - (MOD_D[s.mod] ?? BAY_D) * s.scale * s.sz - r);
    const zc = s.col * (r + gap * 0.5);
    for (const [dx, dy] of [[-7, 5], [7, 5], [0, -6]]) {
      fixed.dark.push(box(1.8, 1.8, gap + 3, s.x + dx, dy + s.y * 0.4, zc, 0, 0, 0, 0.5));
    }
    fixed.panel.push(box(20, 1.6, gap + 2, s.x, 7.5 + s.y * 0.4, zc, 0, 0, 0, 0.7));
  }
  for (const [x, mz, y0, y1] of spec.masts || []) {
    fixed.dark.push(box(3.0, y1 - y0, 3.0, x, (y0 + y1) / 2, mz, 0, 0, 0, 0.5));
    fixed.panel.push(box(8, 1.4, 8, x, y1, mz, 0, 0, 0, 0.8));
    fixed.dark.push(box(2.0, 1.6, Math.abs(mz) + 8, x, y0 + 1, mz * 0.5, 0, 0, 0, 0.45));
    navPoints(fixed.glow, NAV.red, [[x, y1 + 2.2, mz]], 1.4, 1.3);
  }
  // dock face outward: the −z column keeps the module's own +Z, the +z column is turned about.
  // Three baked seeds per module id is enough that no two neighbours share a greeble layout
  // without paying for eighteen separate merges.
  for (const s of slots) {
    placeBaked(fixed, s.mod, pid, seed + (s.i % 3) * 101, new THREE.Matrix4().compose(
      new THREE.Vector3(s.x, s.y, s.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s.ry, 0)),
      new THREE.Vector3(s.scale, s.scale * s.sy, s.scale * s.sz)));
  }
  navRun(fixed.glow, NAV.red, { axis: 0, from: spec.truss.from, to: spec.truss.to, pitch: 46,
    x: 0, y: r + 5.0, z: 0, size: 1.3, power: 1.2 });
  meshesFrom(fixed, pid, grp);

  grp.userData.stationId = stationId;
  grp.userData.bays = slots.length;
  return grp;
}

// ── haze ─────────────────────────────────────────────────────────────────────
//
// A slab of medium between a near module layer and a far one. Exponential fog alone cannot do
// this: fog is a function of distance from the camera, and what 1840080_04 does is put a finite
// wall of lit dust *between* two objects so the far one loses its blacks and the near one keeps
// them. That single trick is most of the depth in the plate.

const HAZE = { power: 1, soft: 0.42 };
const HAZE_MATS = [];

export function hazeSlab({ w = 1400, h = 800, color = '#d4501f', opacity = 0.5, glow = 0.25 } = {}) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide,
    uniforms: {
      uCol: { value: new THREE.Color(color).convertSRGBToLinear() },
      uOp: { value: opacity }, uSoft: { value: HAZE.soft },
      uPower: { value: HAZE.power }, uGlow: { value: glow },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uCol;
      uniform float uOp, uSoft, uPower, uGlow;
      void main(){
        vec2 d = abs(vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(1.0 - uSoft, 1.0, d.x)) * (1.0 - smoothstep(1.0 - uSoft, 1.0, d.y));
        a *= mix(0.55, 1.0, 1.0 - vUv.y);
        gl_FragColor = vec4(uCol * (1.0 + uGlow * a), a * uOp * uPower);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  HAZE_MATS.push(m);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.renderOrder = 5;
  mesh.name = 'haze';
  return mesh;
}

export function registerStationKnobs(q) {
  const G = 'Station';
  q.register({ key: 'dockGlow', label: 'Dock mouth glow', type: 'range', min: 0, max: 6, step: 0.05, default: 1.6, group: G },
    v => { glowPower = v; for (const m of GLOWS) m.color.setScalar(v); });
  q.register({ key: 'stationRough', label: 'Roughness break-up', type: 'range', min: 0, max: 0.6, step: 0.01, default: 0.30, group: G },
    v => { SB.uRough.value = v; });
  q.register({ key: 'stationPlane', label: 'Plane value separation', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45, group: G },
    v => { SB.uPlane.value = v; });
  q.register({ key: 'stationPanel', label: 'Cladding panel break', type: 'range', min: 0, max: 1.2, step: 0.01, default: 0.42, group: G },
    v => { SB.uPanel.value = v; });
  q.register({ key: 'stationDirt', label: 'Cladding soot', type: 'range', min: 0, max: 1.2, step: 0.01, default: 0.55, group: G },
    v => { SB.uDirt.value = v; });
  q.register({ key: 'hazePower', label: 'Haze slab', type: 'range', min: 0, max: 2.5, step: 0.02, default: 1, group: G },
    v => { HAZE.power = v; for (const m of HAZE_MATS) m.uniforms.uPower.value = v; });
  q.register({ key: 'hazeSoft', label: 'Haze slab edge', type: 'range', min: 0.05, max: 1, step: 0.01, default: 0.42, group: G },
    v => { HAZE.soft = v; for (const m of HAZE_MATS) m.uniforms.uSoft.value = v; });
  // build-time: greeble and window counts. A station already in the scene keeps what it was
  // built with; re-run the showroom entry to see a change.
  q.register({ key: 'stationDetail', label: 'Module detail (rebuild)', type: 'range', min: 0, max: 1.5, step: 0.05, default: 1, group: G },
    v => { if (v === detail) return; detail = v; for (const b of BAKED.values()) for (const g of Object.values(b)) g?.dispose(); BAKED.clear(); });
}
