// getMaterial(paletteId, surface) and the textures behind it. Everything is procedural and
// generated once at boot; nothing is fetched.
//
// One shared plate/greeble set serves every palette — a faction is a tint and a set of accent
// colours, not its own texture. That is what keeps texMB flat as factions are added.

import * as THREE from 'three';
import { track, untrack } from '../engine/budget.js';
import { palette } from './palettes.js';

const SURFACES = ['hull', 'hullDark', 'panel', 'trim', 'window', 'strip', 'glass',
  'rock', 'ore', 'ice', 'beam', 'engine', 'decal'];

const cache = new Map();
const built = [];
let tex = null;
let envIntensity = 0.85;
let windowGlow = 2.4;
let stripPower = 3.0;
let beamPower = 1.5;
let wear = 1;
let texRes = 512;
let aniso = 4;

export const allSurfaces = () => SURFACES.slice();

export function getMaterial(paletteId, surface) {
  const key = `${paletteId}:${surface}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (!tex) buildTextures();
  const m = make(palette(paletteId), surface);
  m.name = key;
  cache.set(key, m);
  built.push(m);
  return m;
}

// A kit may clone a cached material to give it its own uniforms. Handing the clone back here
// keeps it inside envPower and the texture rebuild.
export function adopt(m) {
  built.push(m);
  m.envMapIntensity = envIntensity * (m.userData.envMul ?? 1);
  return m;
}

const decals = new Map();

export function getDecal(text, { w = 512, h = 128, weight = 700 } = {}) {
  const hit = decals.get(text);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.clearRect(0, 0, w, h);
  x.fillStyle = '#fff';
  x.font = `${weight} ${Math.round(h * 0.62)}px Helvetica, Arial, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, w / 2, h * 0.54);
  // the paint is worn, not printed: knock holes in the alpha with the same fbm the plates use
  const im = x.getImageData(0, 0, w, h), d = im.data;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const o = (j * w + i) * 4;
      if (!d[o + 3]) continue;
      const n = fbm2(i * 0.09, j * 0.09, 3) + 0.35 * fbm2(i * 0.4, j * 0.4, 2);
      d[o + 3] = Math.round(d[o + 3] * Math.max(0, Math.min(1, (n - 0.42) * 4.5)));
    }
  }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  track(t, { w, h, label: `decal "${text}"` });
  decals.set(text, t);
  return t;
}

// Up to four painted strings stacked in one 512² sheet, so a hull's whole decal set is one
// texture and one draw call. Row i occupies v in [i/4, (i+1)/4).
export function getDecalSheet(texts) {
  const key = texts.join('|');
  const hit = decals.get(key);
  if (hit) return hit;
  const N = 512, rows = 4, rh = N / rows;
  const c = document.createElement('canvas');
  c.width = N; c.height = N;
  const x = c.getContext('2d');
  x.clearRect(0, 0, N, N);
  x.fillStyle = '#fff';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  texts.slice(0, rows).forEach((t, i) => {
    x.font = `700 ${Math.round(rh * 0.6)}px Helvetica, Arial, sans-serif`;
    x.fillText(t, N / 2, i * rh + rh * 0.54);
  });
  const im = x.getImageData(0, 0, N, N), d = im.data;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const o = (j * N + i) * 4;
      if (!d[o + 3]) continue;
      const n = fbm2(i * 0.09, j * 0.09, 3) + 0.35 * fbm2(i * 0.4, j * 0.4, 2);
      d[o + 3] = Math.round(d[o + 3] * Math.max(0, Math.min(1, (n - 0.42) * 4.5)));
    }
  }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  track(t, { w: N, h: N, label: `decal sheet ${key}` });
  decals.set(key, t);
  return t;
}

export function setEnvIntensity(v) {
  envIntensity = v;
  for (const m of built) if ('envMapIntensity' in m) m.envMapIntensity = v * (m.userData.envMul ?? 1);
}

export function registerMaterialKnobs(q) {
  const G = 'Materials';
  q.register({ key: 'texCap', label: 'Texture size', type: 'select', options: [256, 512, 1024, 2048], group: G },
    v => { const r = Math.min(512, +v); if (r !== texRes) { texRes = r; rebuildTextures(); } });
  q.register({ key: 'aniso', label: 'Anisotropy', type: 'select', options: [1, 2, 4, 8, 16], group: G },
    v => { aniso = +v; if (tex) for (const t of Object.values(tex)) t.anisotropy = aniso; });
  q.register({ key: 'windowGlow', label: 'Window glow', type: 'range', min: 0, max: 10, step: 0.05, default: 2.4, group: G },
    v => { windowGlow = v; for (const m of built) if (m.userData.surface === 'window') m.emissiveIntensity = v; });
  q.register({ key: 'stripPower', label: 'Strip lights', type: 'range', min: 0, max: 8, step: 0.05, default: 3.0, group: G },
    v => { stripPower = v; retint('strip'); });
  q.register({ key: 'beamPower', label: 'Beam / engine', type: 'range', min: 0, max: 8, step: 0.05, default: 1.5, group: G },
    v => { beamPower = v; retint('beam'); retint('engine'); });
  // guarded: usePreset re-applies every knob, and an unguarded rebuild here baked and tracked
  // a second full texture set on every preset change
  q.register({ key: 'wear', label: 'Surface wear', type: 'range', min: 0, max: 2, step: 0.02, default: 1, group: G },
    v => { if (v === wear) return; wear = v; if (tex) rebuildTextures(); });
}

function retint(surface) {
  for (const m of built) {
    if (m.userData.surface !== surface) continue;
    const p = palette(m.userData.palette);
    const power = surface === 'strip' ? stripPower : beamPower;
    m.color.set(p[surface === 'strip' ? 'strip' : surface]).multiplyScalar(power);
  }
}

function make(p, surface) {
  const ud = { palette: p.id, surface };
  const std = o => Object.assign(new THREE.MeshStandardMaterial(o), { userData: ud });

  switch (surface) {
    case 'hull': return finish(std({
      color: p.hull, map: tex.plateAlb, normalMap: tex.plateNrm,
      roughnessMap: tex.plateAux, metalnessMap: tex.plateAux,
      metalness: p.metal, roughness: p.rough,
    }));
    case 'hullDark': return finish(std({
      color: p.hullDark, map: tex.plateAlb, normalMap: tex.plateNrm,
      roughnessMap: tex.plateAux, metalnessMap: tex.plateAux,
      metalness: p.metal * 0.9, roughness: Math.min(1, p.rough + 0.12),
    }));
    case 'panel': return finish(std({
      color: p.panel, map: tex.plateAlb, normalMap: tex.plateNrm,
      roughnessMap: tex.plateAux, metalnessMap: tex.plateAux,
      metalness: p.metal, roughness: Math.min(1, p.rough + 0.06),
    }));
    case 'trim': return finish(std({
      color: p.trim, map: tex.plateAlb, normalMap: tex.plateNrm,
      roughnessMap: tex.plateAux,
      metalness: 0.35, roughness: 0.62,
    }));
    case 'window': {
      const m = std({
        color: '#04070b', emissive: '#ffffff', emissiveMap: tex.windows,
        emissiveIntensity: windowGlow, metalness: 0.1, roughness: 0.3,
      });
      m.emissive.set(p.window);
      return finish(m, 0.4);
    }
    case 'strip': {
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.strip).multiplyScalar(stripPower) });
      m.userData = ud;
      return m;
    }
    case 'glass': return finish(std({
      color: p.glass, metalness: 0.15, roughness: 0.07,
    }), 1.8);
    // no roughnessMap: driving roughness off the rock's own albedo turns every dark patch into
    // a mirror, and a belt lit by one hard key then reads as wet stone with gold highlights
    case 'rock': return finish(std({
      color: '#a09689', map: tex.rockAlb, normalMap: tex.rockNrm,
      metalness: 0.04, roughness: 0.95,
    }), 0.5);
    case 'ore': {
      const m = std({
        color: '#5d554c', map: tex.rockAlb, normalMap: tex.rockNrm,
        emissive: p.accent, emissiveMap: tex.veins, emissiveIntensity: 1.5,
        metalness: 0.12, roughness: 0.88,
      });
      return finish(m, 0.5);
    }
    case 'ice': return finish(std({
      color: '#9fc0d2', map: tex.rockAlb, normalMap: tex.rockNrm,
      metalness: 0.0, roughness: 0.22,
    }), 1.5);
    case 'beam': case 'engine': {
      const m = new THREE.MeshBasicMaterial({
        color: new THREE.Color(p[surface]).multiplyScalar(beamPower),
        blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
        side: THREE.DoubleSide, fog: false,
      });
      m.userData = ud;
      return m;
    }
    case 'decal': {
      const m = std({
        color: p.accent, transparent: true, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
        metalness: 0.1, roughness: 0.75,
      });
      return finish(m, 0.4);
    }
    default: return finish(std({ color: p.hull, metalness: p.metal, roughness: p.rough }));
  }
}

function finish(m, envMul = 1) {
  m.userData.envMul = envMul;
  m.envMapIntensity = envIntensity * envMul;
  if (m.normalMap) m.normalScale.set(1, 1);
  return m;
}

function rebuildTextures() {
  if (tex) for (const t of Object.values(tex)) { untrack(t); t.dispose(); }
  tex = null;
  buildTextures();
  for (const m of built) {
    const s = m.userData.surface;
    const fresh = make(palette(m.userData.palette), s);
    for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap']) m[k] = fresh[k];
    m.needsUpdate = true;
    fresh.dispose();
  }
}

// ── procedural textures ──────────────────────────────────────────────────────

const hash2 = (x, y) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  let fx = x - xi, fy = y - yi;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}

function fbm2(x, y, oct) {
  let s = 0, a = 0.5;
  for (let i = 0; i < oct; i++) { s += a * noise2(x, y); x *= 2.03; y *= 2.03; a *= 0.5; }
  return s;
}

const rngFrom = seed => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

function dataTex(buf, w, h, srgb) {
  const t = new THREE.DataTexture(buf, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.LinearSRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Recursive rectangle split, which is what a hull plate layout actually is: a few big panels
// broken down into progressively smaller ones, never a uniform grid.
function plateField(N, seed) {
  const rnd = rngFrom(seed);
  const val = new Float32Array(N * N);
  const edge = new Float32Array(N * N);
  const rects = [];
  const split = (x, y, w, h, depth) => {
    if (depth <= 0 || (w < 26 && h < 26) || (depth < 5 && rnd() < 0.2)) { rects.push([x, y, w, h]); return; }
    if (w >= h) { const c = Math.max(10, Math.round(w * (0.32 + 0.36 * rnd()))); split(x, y, c, h, depth - 1); split(x + c, y, w - c, h, depth - 1); }
    else { const c = Math.max(10, Math.round(h * (0.32 + 0.36 * rnd()))); split(x, y, w, c, depth - 1); split(x, y + c, w, h - c, depth - 1); }
  };
  split(0, 0, N, N, 8);

  for (const [x, y, w, h] of rects) {
    const v = 0.94 + 0.10 * rnd();
    const g = rnd() < 0.22 ? 0.88 : 1;                 // a few plates read as a different alloy
    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        const k = j * N + i;
        val[k] = v * g;
        const dx = Math.min(i - x, x + w - 1 - i), dy = Math.min(j - y, y + h - 1 - j);
        const d = Math.min(dx, dy);
        edge[k] = d < 1 ? 1 : d < 2.5 ? 0.55 : 0;
      }
    }
    // rivet line along the long side of the bigger plates
    if (w > 40 && h > 40 && rnd() < 0.7) {
      const step = 9 + Math.floor(rnd() * 6);
      for (let i = x + 5; i < x + w - 4; i += step) {
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const k = (y + 4 + dj) * N + (i + di);
          if (k >= 0 && k < N * N) edge[k] = Math.max(edge[k], 0.7 - 0.25 * (Math.abs(di) + Math.abs(dj)));
        }
      }
    }
  }
  return { val, edge, rects };
}

function buildTextures() {
  const N = texRes;
  const S = N / 512;
  const { val, edge } = plateField(N, 20260804);

  const alb = new Uint8Array(N * N * 4);
  const aux = new Uint8Array(N * N * 4);
  const hgt = new Float32Array(N * N);

  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i;
      const u = i / S, v = j / S;
      const grime = fbm2(u * 0.045, v * 0.045, 4);
      const fine = fbm2(u * 0.42, v * 0.42, 3);
      // long along v, which on the ship kit is the hull's length. Long along u ran the streaks
      // *across* the hull and the plating read as corrugated iron.
      const streak = fbm2(u * 0.34, v * 0.05, 3);
      const e = edge[k];

      let a = val[k] * (0.86 + 0.22 * grime) * (0.95 + 0.10 * fine);
      a *= 1 - 0.18 * e;                                       // grooves read dark
      a *= 1 - wear * 0.22 * Math.max(0, streak - 0.55);       // rust / soot runs
      a = Math.max(0.03, Math.min(1, a));

      let rough = 0.55 + 0.42 * (1 - val[k]) + 0.30 * (grime - 0.5) + 0.35 * e
        + wear * 0.30 * Math.max(0, streak - 0.5);
      rough = Math.max(0.06, Math.min(1, rough));

      let metal = 1 - 0.55 * e - wear * 0.45 * Math.max(0, streak - 0.52) - 0.2 * Math.max(0, grime - 0.62);
      metal = Math.max(0, Math.min(1, metal));

      const ao = 1 - 0.7 * e;
      hgt[k] = (1 - e) * 0.75 + fine * 0.18 + grime * 0.07;

      const o = k * 4;
      const g8 = Math.round(a * 255);
      alb[o] = g8; alb[o + 1] = g8; alb[o + 2] = g8; alb[o + 3] = 255;
      aux[o] = Math.round(ao * 255);
      aux[o + 1] = Math.round(rough * 255);
      aux[o + 2] = Math.round(metal * 255);
      aux[o + 3] = 255;
    }
  }

  const nrm = normalFrom(hgt, N, 2.0);

  const rock = rockTextures(Math.max(256, N >> 1));
  const windows = windowAtlas(256);
  const veins = veinAtlas(256);

  tex = {
    plateAlb: dataTex(alb, N, N, true),
    plateAux: dataTex(aux, N, N, false),
    plateNrm: dataTex(nrm, N, N, false),
    rockAlb: rock.alb, rockNrm: rock.nrm,
    windows, veins,
  };

  const mb = (w, h) => ({ w, h, mips: true });
  track(tex.plateAlb, { ...mb(N, N), label: 'plate albedo' });
  track(tex.plateAux, { ...mb(N, N), label: 'plate ao/rough/metal' });
  track(tex.plateNrm, { ...mb(N, N), label: 'plate normal' });
  track(tex.rockAlb, { ...mb(rock.n, rock.n), label: 'rock albedo' });
  track(tex.rockNrm, { ...mb(rock.n, rock.n), label: 'rock normal' });
  track(tex.windows, { ...mb(256, 256), label: 'window atlas' });
  track(tex.veins, { ...mb(256, 256), label: 'ore veins' });
}

function normalFrom(h, N, strength) {
  const out = new Uint8Array(N * N * 4);
  const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const dx = (at(i + 1, j) - at(i - 1, j)) * strength;
      const dy = (at(i, j + 1) - at(i, j - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const o = (j * N + i) * 4;
      out[o] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

function rockTextures(N) {
  const alb = new Uint8Array(N * N * 4);
  const hgt = new Float32Array(N * N);
  const S = N / 256;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i, u = i / S, v = j / S;
      const big = fbm2(u * 0.035, v * 0.035, 4);
      const crat = 1 - Math.abs(fbm2(u * 0.11, v * 0.11, 3) * 2 - 1);
      const grit = fbm2(u * 0.55, v * 0.55, 3);
      const a = Math.max(0.05, Math.min(1, 0.42 + 0.5 * big - 0.28 * crat * crat + 0.18 * (grit - 0.5)));
      hgt[k] = big * 0.6 + crat * crat * 0.3 + grit * 0.12;
      const o = k * 4, g8 = Math.round(a * 255);
      alb[o] = g8; alb[o + 1] = g8; alb[o + 2] = g8; alb[o + 3] = 255;
    }
  }
  return { alb: dataTex(alb, N, N, true), nrm: dataTex(normalFrom(hgt, N, 4.5), N, N, false), n: N };
}

// A grid of lit rectangles at mixed brightness, a few dark. Sampled by the station kit at
// whatever density a module wants; it never illuminates anything.
function windowAtlas(N) {
  const buf = new Uint8Array(N * N * 4);
  const rnd = rngFrom(771133);
  const cols = 16, cell = N / cols;
  for (let cy = 0; cy < cols; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const on = rnd();
      if (on < 0.28) continue;
      const lit = on < 0.5 ? 0.22 + 0.3 * rnd() : 0.6 + 0.4 * rnd();
      const w = Math.max(1, Math.round(cell * (0.25 + 0.5 * rnd())));
      const h = Math.max(1, Math.round(cell * (0.18 + 0.42 * rnd())));
      const x0 = Math.round(cx * cell + (cell - w) * 0.5);
      const y0 = Math.round(cy * cell + (cell - h) * 0.5);
      const cool = rnd() < 0.18;
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          // a lit pane is not flat — the near edge is always brighter
          const f = lit * (0.65 + 0.35 * (1 - j / h)) * (0.85 + 0.3 * rnd());
          const o = ((y0 + j) * N + x0 + i) * 4;
          buf[o] = Math.round(255 * Math.min(1, f * (cool ? 0.72 : 1)));
          buf[o + 1] = Math.round(255 * Math.min(1, f * (cool ? 0.86 : 0.86)));
          buf[o + 2] = Math.round(255 * Math.min(1, f * (cool ? 1 : 0.62)));
          buf[o + 3] = 255;
        }
      }
    }
  }
  return dataTex(buf, N, N, true);
}

function veinAtlas(N) {
  const buf = new Uint8Array(N * N * 4);
  const S = N / 256;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const u = i / S, v = j / S;
      const r = 1 - Math.abs(fbm2(u * 0.06 + 40, v * 0.06 + 40, 4) * 2 - 1);
      const m = Math.max(0, r - 0.78) / 0.22;
      const o = (j * N + i) * 4, g8 = Math.round(Math.min(1, m * m) * 255);
      buf[o] = g8; buf[o + 1] = g8; buf[o + 2] = g8; buf[o + 3] = 255;
    }
  }
  return dataTex(buf, N, N, true);
}

export function disposeAll() {
  for (const m of built) m.dispose();
  built.length = 0; cache.clear();
  if (tex) for (const t of Object.values(tex)) { untrack(t); t.dispose(); }
  tex = null;
}
