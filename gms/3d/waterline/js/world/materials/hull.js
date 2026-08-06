// Hull kit — C3. Surfaces: plate deck turret rail rust boot marker.
//
// The hull map is a UNIQUE unwrap, not a tile: u runs bow→stern, v carries height above the
// waterline mirrored about v=0.5 (port below, starboard above). That is what lets one texture hold
// the boot topping, the plating rows, the dazzle camo and the rust streaks with no repetition
// anywhere, and it is why hull maps are ClampToEdge rather than bake.js's default Repeat.
//
// Paint colour lives in the bake and `color` stays white — a dark hex in both squares the albedo
// and ACES maps anything under ~0.012 linear to exactly zero. metalness stays low for the same
// family of reason: painted steel has a diffuse term, near-pure metal does not.

import * as THREE from 'three';
import { surface, texSize, trackAniso } from '../textures/bake.js';
import { fields, clamp, smoothstep, lerp, hexRgb, mixRgb, rng } from '../textures/noise.js';
import { track } from '../../engine/budget.js';

export const WATERLINE_V = 0.42;      // where y=0 sits in the hull map's height band

const KIT_SKIN = {
  destroyer: { base: '#79838f', camoA: '#a3adb8', camoB: '#4a5665', seed: 811, rows: 11 },
  cruiser: { base: '#727d8a', camoA: '#98a3af', camoB: '#464f5c', seed: 1279, rows: 14 },
  battleship: { base: '#6d7783', camoA: '#8f99a5', camoB: '#434c58', seed: 2477, rows: 17 },
};

// bake.js puts roughness in the albedo's alpha; reading it is one fetch and most of why painted
// steel reads as a substance instead of a flat diffuse fill.
//
// `amb` is the reason the shadows were illegible and it is the load-bearing number in this file.
// Measured on the pass-2 deck: ambient+env carried 111 of 143 luma and the sun carried 32, so a
// cast shadow could only ever be a 20% dip — and ACES compresses that to nothing at the level the
// deck sits at. Scaling the two INDIRECT terms leaves the sun untouched, so lit and shadowed
// separate. It has to be done here rather than with envMapIntensity because the hemisphere light
// is C1's and carries about half of it.
// One shared uniform, not a baked constant: a sunlit noon shot wants the sun to carry the ship and
// an overcast one has no sun to carry it with, so the right value is per scenario.
const AMB = { value: 0.46 };
export function setShipAmbient(k) { AMB.value = k; }

// Anti-fouling faces down and the sun never reaches it, so the strip of hull that survives the
// waterline clip lit only by the sky measured luma 6 against a sea at 60-140. This is its floor.
const UNDER = { value: 0.55 };

function shipSurface(m, { lo = 0.62, hi = 1.28, spec = 0.72, clipQ = 0 } = {}) {
  m.onBeforeCompile = sh => {
    sh.uniforms.uAmbK = AMB;
    sh.uniforms.uUnderAmb = UNDER;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uAmbK;\nuniform float uUnderAmb;')
      .replace('#include <roughnessmap_fragment>',
        `float roughnessFactor = roughness * mix( ${lo.toFixed(2)}, ${hi.toFixed(2)}, diffuseColor.a );
         diffuseColor.a = 1.0;`)
      .replace('#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
         irradiance *= uAmbK;
         iblIrradiance *= uAmbK;
         radiance *= mix( 1.0, ${spec.toFixed(3)}, uAmbK );`);
    if (clipQ > 0) {
      // v is mirrored about 0.5 and WATERLINE_V is where y=0 lands in it, so this band coordinate
      // is "height above the keel as a fraction of the whole side" and is the same number on a
      // destroyer and a battleship. Below the clip the hull is never meant to be seen — the sea
      // renders on a polar grid whose triangles are 30 m across at 450 m, so it can sit metres
      // under the wave the ship is floated on and expose the whole underbody (E4a).
      sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>',
        `float hullQ = abs( vMapUv.y - 0.5 ) * 2.0;
         if ( hullQ < ${clipQ.toFixed(3)} ) discard;
         #include <map_fragment>`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>',
        `#include <lights_fragment_end>
         reflectedLight.indirectDiffuse += diffuseColor.rgb * uUnderAmb
           * ( 1.0 - smoothstep( ${clipQ.toFixed(3)}, ${(clipQ + 0.06).toFixed(3)}, hullQ ) );`);
    }
  };
  m.customProgramCacheKey = () => `waterlineHullSurf${lo}_${hi}_${spec}_${clipQ}`;
  return m;
}

function clampWrap(set) {
  for (const t of Object.values(set)) {
    if (t?.isTexture) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; }
  }
  return set;
}

// Rows jittered off their nominal pitch, then the nearest one wins. An exactly periodic seam
// lattice is the most-cited defect on this project; the jitter is the whole point of the array.
function jitterRows(n, seed, spread = 0.34) {
  const r = rng(seed);
  const out = [];
  for (let i = 1; i < n; i++) out.push((i + (r() - 0.5) * spread) / n);
  return out;
}

function nearestRow(rows, q) {
  let d = 1;
  for (let i = 0; i < rows.length; i++) { const x = Math.abs(q - rows[i]); if (x < d) d = x; }
  return d;
}

function hullSkin({ base, camoA, camoB, seed, rows }) {
  return S => {
    const f = fields();
    const rgba = new Uint8ClampedArray(S * S * 4);
    const height = new Float32Array(S * S);
    const cBase = hexRgb(base), cA = hexRgb(camoA), cB = hexRgb(camoB);
    const cBoot = hexRgb('#43272a'), cAnti = hexRgb('#2d1b1c'), cScum = hexRgb('#8f9086');
    const cRust = hexRgb('#7d4626');
    const rowsAt = jitterRows(rows, seed);
    const buttR = rng(seed + 17);
    const butts = Array.from({ length: rows * 3 }, () => buttR());
    const out = [0, 0, 0], tmp = [0, 0, 0];
    const WL = WATERLINE_V;

    for (let y = 0; y < S; y++) {
      const v = (y + 0.5) / S;
      const side = v < 0.5 ? 0 : 1;
      const q = Math.abs(v - 0.5) * 2;                 // 0 keel → 1 deck edge
      const so = side * 4.31;                          // the two sides get different camo
      for (let x = 0; x < S; x++) {
        const u = (x + 0.5) / S;

        // dazzle camo: two domain-warped blob fields at different scales, so the panels are
        // irregular in size as well as in position
        const w = f.warp.at(u * 1.7 + so, q * 0.8 + so * 0.3) - 0.5;
        const mA = f.coarse.at(u * 2.3 + w * 0.5 + so, q * 0.9 + w * 0.4);
        const mB = f.coarse.at(u * 4.7 - w * 0.4 + so * 2.1, q * 1.7 + w * 0.2);
        const kA = smoothstep(0.50, 0.56, mA);
        const kB = smoothstep(0.56, 0.60, mB) * (1 - kA);

        mixRgb(cBase, cA, kA, out);
        mixRgb(out, cB, kB, out);

        // plating: a jittered row every ~1/rows of the height band, with butt joints in u
        const dRow = nearestRow(rowsAt, q);
        const row = 1 - smoothstep(0, 0.006, dRow);
        const bi = Math.floor(q * rows) * 3;
        const bu = Math.abs(((u + butts[bi % butts.length]) * (4 + (bi % 3))) % 1 - 0.5);
        const butt = (1 - smoothstep(0, 0.010, bu)) * smoothstep(0.09, 0.03, dRow);
        const seam = Math.max(row, butt * 0.8);

        // rust weeps downward from a scupper line high on the side, thinning as it falls
        const src = f.fine.at(u * 9.3 + so * 3, 0.3 + so);
        const streak = clamp(src * 2.4 - 1.25, 0, 1)
          * smoothstep(0.96, 0.62, q) * smoothstep(WL - 0.02, WL + 0.16, q)
          * (0.45 + 0.55 * f.grain.at(u * 14 + so, q * 3));
        mixRgb(out, cRust, streak * 0.55, out);

        // boot topping, and the scum line that sits on it. Below the waterline the paint is a
        // different colour AND a different finish — wet anti-fouling is glossy.
        const under = smoothstep(WL + 0.012, WL - 0.012, q);
        mixRgb(cBoot, cAnti, smoothstep(0.30, 0.02, q), tmp);
        mixRgb(out, tmp, under, out);
        const scum = (1 - smoothstep(0, 0.030, Math.abs(q - WL - 0.018)))
          * clamp(f.grain.at(u * 6 + so, 0.7) * 1.8 - 0.5, 0, 1);
        mixRgb(out, cScum, scum * 0.5, out);

        // a slow vertical value ramp so a 90 m flank is never one flat tone
        const grad = 1 + (q - 0.5) * 0.16 + (f.coarse.at(u * 0.8 + so, 0.5) - 0.5) * 0.10;
        const shade = grad * (1 - seam * 0.40) * (1 - streak * 0.10);

        const i = (y * S + x) * 4;
        rgba[i] = out[0] * shade;
        rgba[i + 1] = out[1] * shade;
        rgba[i + 2] = out[2] * shade;
        rgba[i + 3] = clamp(0.62 + streak * 0.30 - under * 0.34 + (f.grain.at(u * 5, q * 5) - 0.5) * 0.2, 0.08, 1) * 255;
        height[y * S + x] = (f.grain.at(u * 6, q * 6) - 0.5) * 0.10 - seam * 0.75 + streak * 0.12
          + (f.coarse.at(u * 3 + so, q * 2) - 0.5) * 0.22;
      }
    }
    return { rgba, height, strength: 1.5 };
  };
}

// Wood planking fore-and-aft over a steel forecastle and quarterdeck. The plank pitch is jittered
// and every plank gets its own tone, so the deck never reads as a printed stripe pattern.
function deckSkin({ seed = 6151 } = {}) {
  return S => {
    const f = fields();
    const rgba = new Uint8ClampedArray(S * S * 4);
    const height = new Float32Array(S * S);
    const wood = hexRgb('#93764f'), woodD = hexRgb('#6b543a'), caulk = hexRgb('#2a2320');
    const steel = hexRgb('#616a74');
    const PL = 46;                                   // planks across the beam
    const rowsAt = jitterRows(PL, seed, 0.5);
    const tone = Array.from({ length: PL + 1 }, (_, i) => rng(seed + i * 31)());
    const out = [0, 0, 0];

    for (let y = 0; y < S; y++) {
      const v = (y + 0.5) / S;
      let pi = 0;
      while (pi < rowsAt.length && rowsAt[pi] < v) pi++;
      const edge = Math.min(pi ? v - rowsAt[pi - 1] : v, (pi < rowsAt.length ? rowsAt[pi] : 1) - v);
      for (let x = 0; x < S; x++) {
        const u = (x + 0.5) / S;
        // forecastle and quarterdeck are steel, the waist is wood, and the join is ragged
        const nz = f.coarse.at(u * 3, v * 3);
        const isSteel = clamp(smoothstep(0.19, 0.11, u) + smoothstep(0.83, 0.92, u) + (nz - 0.5) * 0.25, 0, 1);

        const grain = f.fine.at(u * 26 + pi * 0.7, v * 2);
        mixRgb(wood, woodD, tone[pi] * 0.75 + grain * 0.35, out);
        const caulkK = 1 - smoothstep(0, 0.0016, edge);
        // butt joint every few metres, offset per plank
        const bj = Math.abs(((u + tone[pi]) * (5 + (pi % 4))) % 1 - 0.5);
        const joint = 1 - smoothstep(0, 0.004, bj);
        mixRgb(out, caulk, Math.max(caulkK, joint * 0.7), out);
        mixRgb(out, steel, isSteel, out);

        const wear = clamp(f.coarse.at(u * 1.6, v * 1.6) * 1.7 - 0.55, 0, 1);
        const scuff = clamp(f.grain.at(u * 11, v * 11) * 1.6 - 0.85, 0, 1);
        const shade = 1 + wear * 0.16 - scuff * 0.18 + (grain - 0.5) * 0.12;

        const i = (y * S + x) * 4;
        rgba[i] = out[0] * shade;
        rgba[i + 1] = out[1] * shade;
        rgba[i + 2] = out[2] * shade;
        rgba[i + 3] = clamp(0.80 - wear * 0.22 - isSteel * 0.12 + scuff * 0.14, 0.1, 1) * 255;
        height[y * S + x] = -caulkK * 0.7 - joint * 0.3 + (grain - 0.5) * 0.12 - isSteel * 0.05;
      }
    }
    return { rgba, height, strength: 1.3 };
  };
}

// Superstructure and turret steel. Tiles, so its seams get jitter from a hash rather than from an
// array — an exact grid here reads as wallpaper the moment two blocks sit side by side.
function steelSkin({ colour = '#79838e', pitch = 0.24, dirt = 0.45, seed = 907 } = {}) {
  return S => {
    const f = fields();
    const rgba = new Uint8ClampedArray(S * S * 4);
    const height = new Float32Array(S * S);
    const base = hexRgb(colour);
    const grime = base.map(c => c * 0.6 + 6);
    const r = rng(seed);
    const jitU = Array.from({ length: 5 }, () => (r() - 0.5) * 0.6);
    const jitV = Array.from({ length: 4 }, () => (r() - 0.5) * 0.6);
    const out = [0, 0, 0];

    const seamAt = (t, jit) => {
      const n = jit.length;
      let d = 1;
      for (let i = 0; i < n; i++) {
        const p = (i + 0.5 + jit[i]) / n;
        d = Math.min(d, Math.abs(((t - p) % 1 + 1.5) % 1 - 0.5));
      }
      return 1 - smoothstep(0, 0.008, d);
    };

    for (let y = 0; y < S; y++) {
      const v = (y + 0.5) / S;
      for (let x = 0; x < S; x++) {
        const u = (x + 0.5) / S;
        const grain = f.grain.at(u * 0.5, v * 0.5);
        const blotch = f.coarse.at(u * 1.3, v * 1.3);
        const sm = Math.max(seamAt(v / pitch * 0.24, jitV), seamAt(u / pitch * 0.24, jitU));
        const soot = clamp(blotch * 1.5 - 0.45, 0, 1) * dirt;

        mixRgb(base, grime, soot, out);
        const shade = 1 - sm * 0.10 + (grain - 0.5) * 0.22 + (blotch - 0.5) * 0.20;
        const i = (y * S + x) * 4;
        rgba[i] = out[0] * shade;
        rgba[i + 1] = out[1] * shade;
        rgba[i + 2] = out[2] * shade;
        rgba[i + 3] = clamp(0.58 + (grain - 0.5) * 0.32 - soot * 0.12, 0.08, 1) * 255;
        height[y * S + x] = grain * 0.14 - sm * 0.4 + (blotch - 0.5) * 0.2;
      }
    }
    return { rgba, height, strength: 1.5 };
  };
}

// ── canvas textures ─────────────────────────────────────────────────────────────────────────

let railTex = null;
// Guard rails as an alpha strip rather than as tubes. Three 40 mm wires at 90 m are far under a
// pixel; modelled they stipple into dashes, mipped they fade to the soft grey line the plates show.
export function railTexture() {
  if (railTex) return railTex;
  const W = texSize(256), H = Math.max(16, W / 8);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  const lw = Math.max(1, H / 12);
  for (const t of [0.10, 0.44, 0.76]) g.fillRect(0, t * H, W, lw * (t === 0.10 ? 1.4 : 0.8));
  const r = rng(5501);
  for (let i = 0; i < 8; i++) {
    const x = (i + 0.5 + (r() - 0.5) * 0.25) / 8 * W;
    g.fillRect(x, 0.08 * H, lw * 1.2, H * 0.88);
  }
  railTex = new THREE.CanvasTexture(cv);
  railTex.wrapS = THREE.RepeatWrapping;
  railTex.wrapT = THREE.ClampToEdgeWrapping;
  railTex.needsUpdate = true;
  trackAniso(railTex);
  track(railTex, { w: W, h: H, fmt: 'rgba', mips: true, label: 'hull:rail' });
  return railTex;
}

let collarTex = null;
// The hull/water contact. v = 0 is against the plating and v = 1 is outboard; the innermost band
// is DARK — the hull's own shadow on the water — and only then does it go to foam. Without that
// dark band a foam collar is a bright ring and the hull still reads as a decal on the surface.
export function collarTexture() {
  if (collarTex) return collarTex;
  const S = texSize(256);
  const f = fields();
  const px = new Uint8Array(S * S * 4);
  const dark = hexRgb('#1e2a33');
  const white = [255, 254, 250];
  const out = [0, 0, 0];
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    const contact = Math.pow(1 - Math.min(1, v / 0.24), 2.0);
    const band = Math.pow(1 - v, 1.6) * smoothstep(0.02, 0.20, v);
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const w = f.warp.at(u * 2.6, v * 1.2) - 0.5;
      const n = f.fine.at(u * 5.2 + w * 0.6, v * 2.6 + w * 0.5);
      const c = f.coarse.at(u * 1.7, v * 0.9);
      const lace = clamp(n * 1.8 - 0.44, 0, 1) * clamp(c * 1.9 - 0.30, 0, 1);
      mixRgb(dark, white, clamp(smoothstep(0.06, 0.30, v) + lace * 0.7, 0, 1), out);
      const lit = 0.76 + 0.24 * n;
      const i = (y * S + x) * 4;
      px[i] = out[0] * lit; px[i + 1] = out[1] * lit; px[i + 2] = out[2] * lit;
      px[i + 3] = clamp(contact * 0.58 + band * (0.26 + lace * 2.5), 0, 1) * 255;
    }
  }
  collarTex = new THREE.DataTexture(px, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  collarTex.colorSpace = THREE.SRGBColorSpace;
  collarTex.wrapS = THREE.RepeatWrapping;
  collarTex.wrapT = THREE.ClampToEdgeWrapping;
  collarTex.minFilter = THREE.LinearMipmapLinearFilter;
  collarTex.generateMipmaps = true;
  collarTex.needsUpdate = true;
  trackAniso(collarTex);
  track(collarTex, { w: S, h: S, fmt: 'rgba', mips: true, label: 'hull:collar' });
  return collarTex;
}

let aoTex = null;
// Contact shadow under anything standing on the deck. Square-ish falloff rather than radial: a
// deckhouse casts a shadow shaped like its own footprint, and a circle under a box is a giveaway.
export function contactTexture() {
  if (aoTex) return aoTex;
  const S = 64;
  const px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    const v = Math.abs((y + 0.5) / S * 2 - 1);
    for (let x = 0; x < S; x++) {
      const u = Math.abs((x + 0.5) / S * 2 - 1);
      // the plateau is the footprint; the falloff outside it is the penumbra
      const d = clamp((Math.max(u, v) - 0.42) / 0.58, 0, 1);
      const a = Math.pow(1 - d, 2.4) * (0.55 + 0.45 * Math.pow(1 - Math.max(u, v), 0.5));
      const i = (y * S + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 255;
      px[i + 3] = clamp(a, 0, 1) * 255;
    }
  }
  aoTex = new THREE.DataTexture(px, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  aoTex.colorSpace = THREE.SRGBColorSpace;
  aoTex.minFilter = THREE.LinearMipmapLinearFilter;
  aoTex.generateMipmaps = true;
  aoTex.needsUpdate = true;
  track(aoTex, { w: S, h: S, fmt: 'rgba', mips: true, label: 'hull:contact' });
  return aoTex;
}

export function contactMaterial() {
  return getOne('hull:contact', () => new THREE.MeshBasicMaterial({
    map: contactTexture(), color: 0x1b242c, transparent: true, opacity: 0.62,
    depthWrite: false, fog: true,
  }));
}

// Crew. Not steel: at 30 m the one thing that says "this is 200 metres long" is a figure whose
// height a viewer already knows, and it has to separate from the plating it stands on.
export function crewMaterial() {
  return getOne('hull:crew', () => new THREE.MeshStandardMaterial({
    color: 0x4a5361, roughness: 0.88, metalness: 0.02,
  }));
}

let skirtTex = null;
// The band that clings to the plating itself. v runs bottom→top with the waterline at 0.44, so the
// foam is densest exactly where the hull cuts the sea and the plating goes wet-dark just under it.
// Its whole job is to be OPAQUE at that line: the 1 px dashed seam it hides is a depth stipple
// between two surfaces that intersect, and nothing but coverage removes that.
export function skirtTexture() {
  if (skirtTex) return skirtTex;
  const S = texSize(256);
  const f = fields();
  const px = new Uint8Array(S * S * 4);
  const wet = hexRgb('#182028');
  const white = [255, 253, 249];
  const out = [0, 0, 0];
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    const band = Math.exp(-Math.pow((v - 0.42) / 0.30, 2));
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const w = f.warp.at(u * 3.4, v * 1.1) - 0.5;
      const n = f.fine.at(u * 6.5 + w * 0.7, v * 2.0 + w * 0.4);
      const c = f.coarse.at(u * 2.2, v * 0.8);
      const lace = clamp(n * 1.9 - 0.48, 0, 1) * clamp(c * 2.0 - 0.34, 0, 1);
      const wash = clamp(smoothstep(0.20, 0.46, v) * 1.15 + lace * 0.8, 0, 1);
      mixRgb(wet, white, wash, out);
      const lit = 0.74 + 0.26 * n;
      const i = (y * S + x) * 4;
      px[i] = out[0] * lit; px[i + 1] = out[1] * lit; px[i + 2] = out[2] * lit;
      px[i + 3] = clamp(band * (0.60 + lace * 2.2), 0, 0.94) * 255;
    }
  }
  skirtTex = new THREE.DataTexture(px, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  skirtTex.colorSpace = THREE.SRGBColorSpace;
  skirtTex.wrapS = THREE.RepeatWrapping;
  skirtTex.wrapT = THREE.ClampToEdgeWrapping;
  skirtTex.minFilter = THREE.LinearMipmapLinearFilter;
  skirtTex.generateMipmaps = true;
  skirtTex.needsUpdate = true;
  trackAniso(skirtTex);
  track(skirtTex, { w: S, h: S, fmt: 'rgba', mips: true, label: 'hull:skirt' });
  return skirtTex;
}

// forceSinglePass on every transparent DoubleSide material on this project: three renders those
// twice per frame (BackSide then FrontSide) unless it is set, and for a sheet each triangle passes
// exactly one of the two cull tests — so the second submission draws nothing and costs a draw call.
export function skirtMaterial() {
  return getOne('hull:skirtMat', () => new THREE.MeshBasicMaterial({
    map: skirtTexture(), color: 0xffffff, transparent: true,
    depthWrite: false, side: THREE.DoubleSide, fog: true, forceSinglePass: true,
  }));
}

export function collarMaterial() {
  return getOne('hull:collarMat', () => new THREE.MeshBasicMaterial({
    map: collarTexture(), color: 0xffffff, transparent: true, opacity: 1.0,
    depthWrite: false, side: THREE.DoubleSide, fog: true, forceSinglePass: true,
  }));
}

let foamTex = null;
// Wake foam. u tiles along the wake, v runs ACROSS it and carries the falloff, so the strip is
// dense against the hull and laces out to nothing outboard without needing per-vertex alpha.
// A uniform lace tiled over the strip is what made the first wake read as a floating grey sheet.
export function foamTexture() {
  if (foamTex) return foamTex;
  const S = texSize(256);
  const f = fields();
  const px = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    const v = (y + 0.5) / S;
    // The inner texel rows fade IN rather than starting at full: at v=0 this strip's edge lands on
    // the hull silhouette and draws a hard 1 px line. The collar mesh owns the hull contact now.
    const across = smoothstep(0, 0.13, v) * Math.pow(1 - v, 1.5);
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S;
      const w = f.warp.at(u * 3.1, v * 1.4) - 0.5;
      const n = f.fine.at(u * 4 + w * 0.5, v * 2.2 + w * 0.5);
      const c = f.coarse.at(u * 2.0, v * 1.1);
      const lace = clamp(n * 1.7 - 0.42, 0, 1) * clamp(c * 1.9 - 0.35, 0, 1);
      const i = (y * S + x) * 4;
      const lit = 0.80 + 0.20 * n;
      px[i] = 255 * lit; px[i + 1] = 254 * lit; px[i + 2] = 250 * lit;
      px[i + 3] = clamp(across * (0.35 + lace * 2.2), 0, 1) * 255;
    }
  }
  foamTex = new THREE.DataTexture(px, S, S, THREE.RGBAFormat, THREE.UnsignedByteType);
  foamTex.colorSpace = THREE.SRGBColorSpace;
  foamTex.wrapS = THREE.RepeatWrapping;
  foamTex.wrapT = THREE.ClampToEdgeWrapping;
  foamTex.minFilter = THREE.LinearMipmapLinearFilter;
  foamTex.generateMipmaps = true;
  foamTex.needsUpdate = true;
  trackAniso(foamTex);
  track(foamTex, { w: S, h: S, fmt: 'rgba', mips: true, label: 'hull:foam' });
  return foamTex;
}

// ── the kits ────────────────────────────────────────────────────────────────────────────────

const perKit = new Map();

// One material per hull kit, because each carries its own unique unwrap. Ships of the same kit
// vary through length, fittings and heading instead.
export function hullMaterial(kitId) {
  if (perKit.has(kitId)) return perKit.get(kitId);
  const skin = KIT_SKIN[kitId] || KIT_SKIN.cruiser;
  const s = clampWrap(surface(`hull:${kitId}`, 512, hullSkin(skin)));
  const m = shipSurface(new THREE.MeshStandardMaterial({
    map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(0.75, 0.75),
    color: 0xffffff, roughness: 0.62, metalness: 0.14, envMapIntensity: 1.20,
    vertexColors: true,
  }), { lo: 0.60, hi: 1.30, clipQ: WATERLINE_V - 0.012 });
  m.name = `hull:${kitId}`;
  perKit.set(kitId, m);
  return m;
}

export function windowMaterial() {
  return getOne('hull:window', () => new THREE.MeshStandardMaterial({
    color: 0x1b242c, roughness: 0.16, metalness: 0.10, envMapIntensity: 1.4,
  }));
}

// A matte, almost featureless kit for vessels 1.5 km out. Their pixels are ~2 across; a baked map
// there is texture memory spent on something the fog is about to average away anyway.
//
// The colour is deliberately LIGHTER than the near hull's. A distant vessel that renders darker
// than the haze it stands in is the single loudest reason a frame reads as a diorama rather than
// as an ocean, and linear fog alone does not get there: at 2.6 km it is only ~55% of the way to
// the fog colour, so a dark hull is still visibly dark. The extra `aerial` term is a second,
// squared handover so the far end of the convoy converges on the haze instead of stopping short.
export function distantMaterial() {
  return getOne('hull:distant', () => {
    const m = new THREE.MeshStandardMaterial({
      color: 0xa4b0bc, roughness: 0.94, metalness: 0.0, vertexColors: true,
    });
    m.onBeforeCompile = sh => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `
        #include <fog_fragment>
        #ifdef USE_FOG
          float aerial = smoothstep( fogNear, fogFar, vFogDepth );
          gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, pow( aerial, 1.4 ) * 0.92 );
        #endif`);
    };
    m.customProgramCacheKey = () => 'waterlineDistantAerial';
    return m;
  });
}

const singles = new Map();
function getOne(key, make) {
  if (!singles.has(key)) singles.set(key, make());
  return singles.get(key);
}

export function make(name, quality) {
  const aniso = quality?.get?.('aniso') ?? 4;

  if (name === 'plate') return hullMaterial('cruiser');

  if (name === 'deck') {
    const s = clampWrap(surface('hull:deck', 512, deckSkin()));
    s.map.anisotropy = s.normalMap.anisotropy = aniso;
    return shipSurface(new THREE.MeshStandardMaterial({
      map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(0.7, 0.7),
      color: 0xffffff, roughness: 0.76, metalness: 0.06, envMapIntensity: 1.05,
      vertexColors: true,
    }), { lo: 0.66, hi: 1.24 });
  }

  if (name === 'turret') {
    const s = surface('hull:steel', 512, steelSkin({ colour: '#79838e', dirt: 0.42 }));
    return shipSurface(new THREE.MeshStandardMaterial({
      map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(0.8, 0.8),
      color: 0xffffff, roughness: 0.60, metalness: 0.16, envMapIntensity: 1.20,
      vertexColors: true,
    }), { lo: 0.62, hi: 1.26 });
  }

  if (name === 'rust') {
    const s = surface('hull:rusted', 512, steelSkin({ colour: '#6a4f3c', dirt: 0.8, pitch: 0.19, seed: 4409 }));
    return shipSurface(new THREE.MeshStandardMaterial({
      map: s.map, normalMap: s.normalMap, color: 0xffffff, roughness: 0.9, metalness: 0.04,
    }));
  }

  if (name === 'boot') {
    return new THREE.MeshStandardMaterial({ color: 0x4a2e2c, roughness: 0.28, metalness: 0.12 });
  }

  if (name === 'rail') {
    const t = railTexture();
    t.anisotropy = aniso;
    return new THREE.MeshStandardMaterial({
      color: 0x8b939c, roughness: 0.6, metalness: 0.2,
      alphaMap: t, transparent: true, alphaTest: 0.38, side: THREE.DoubleSide,
      forceSinglePass: true,
    });
  }

  if (name === 'marker') {
    return new THREE.MeshBasicMaterial({
      color: 0xff3a20, transparent: true, opacity: 0.85, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false,
    });
  }

  return null;
}
