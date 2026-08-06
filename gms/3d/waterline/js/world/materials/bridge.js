// Bridge kit — C2. Surfaces: panel glass trim seat floor screen.
//
// Everything is baked here rather than in textures/surfaces.js so the bridge owns its own look
// end to end. Two procedural surfaces (painted bulkhead, deck plate) plus one instrument atlas
// that every glowing screen in the room samples from — that atlas is why fifty distinct displays
// cost one draw call.

import * as THREE from 'three';
import { surface, texSize } from '../textures/bake.js';
import { fields, clamp, smoothstep, hexRgb, mixRgb, rng } from '../textures/noise.js';
import { track } from '../../engine/budget.js';
import { glassTexture } from '../bridgeKit.js';

export const ATLAS_TILES = 8;

// distance to the nearest seam, as 0..1 darkness
function seam(t, pitch, width) {
  const p = (t % pitch + pitch) % pitch / pitch;
  return 1 - smoothstep(0, width, Math.min(p, 1 - p));
}

// Painted bulkhead: welded plates, a rivet row down each seam, soot gathering high and grime
// gathering low so a flat wall still has a gradient across it.
function bulkhead({ colour = '#39424b', pitch = 0.29, dirt = 0.5 } = {}) {
  return S => {
    const f = fields();
    const rgba = new Uint8ClampedArray(S * S * 4);
    const height = new Float32Array(S * S);
    const base = hexRgb(colour);
    const grimy = base.map(c => c * 0.55 + 8);
    const out = [0, 0, 0];

    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        // At u*3 this read as stucco rather than as paint on steel. Eight times coarser and it is
        // a blotchy finish, which is what the plates have.
        const grain = f.grain.at(u * 0.38, v * 0.38);
        const blotch = f.coarse.at(u, v);
        const sv = seam(v, pitch, 0.03), su = seam(u, pitch * 1.6, 0.02);
        const sm = Math.max(sv, su);

        // Rivets: a bead every 1/22 of the tile along each seam. Deliberately near-invisible in the
        // albedo and shallow in the height — on any bevel strip narrower than about three pixels
        // this row aliases into a run of evenly spaced hard dashes, and that stipple was the single
        // most identifiable unfinished signal in the set.
        const rivU = Math.abs(((u * 22) % 1) - 0.5);
        const rivV = Math.abs(((v * 22) % 1) - 0.5);
        const rivet = Math.max(sv * (1 - smoothstep(0.26, 0.46, rivU)), su * (1 - smoothstep(0.26, 0.46, rivV)));

        const soot = clamp(blotch * 1.4 - 0.35, 0, 1) * dirt;
        mixRgb(base, grimy, soot, out);
        const shade = 1 - sm * 0.34 + rivet * 0.05 + (grain - 0.5) * 0.16;
        const i = (y * S + x) * 4;
        rgba[i] = out[0] * shade;
        rgba[i + 1] = out[1] * shade;
        rgba[i + 2] = out[2] * shade;
        rgba[i + 3] = clamp(0.6 + (grain - 0.5) * 0.3 - soot * 0.15, 0.1, 1) * 255;
        height[y * S + x] = grain * 0.18 - sm * 0.55 + rivet * 0.30;
      }
    }
    return { rgba, height, strength: 1.6 };
  };
}

// Deck: welded plates and a rolled grain. The tread-stud lattice this used to carry read as
// wallpaper at any distance — all deck wear now comes from a single non-repeating overlay in
// bridgeKit.deckWearTexture(), which is why there is no regular structure left in here.
function deckPlate({ colour = '#2b3036' } = {}) {
  return S => {
    const f = fields();
    const rgba = new Uint8ClampedArray(S * S * 4);
    const height = new Float32Array(S * S);
    const base = hexRgb(colour);
    const worn = base.map(c => c * 1.5 + 14);
    const out = [0, 0, 0];

    for (let y = 0; y < S; y++) {
      const v = y / S;
      for (let x = 0; x < S; x++) {
        const u = x / S;
        const grain = f.fine.at(u * 2, v * 2);
        const roll = f.warp.at(u * 0.6, v * 5.0);              // rolled sheet, stretched along x
        const sm = Math.max(seam(v, 0.5, 0.010), seam(u, 0.5, 0.010)) * 0.85
          + seam(v, 0.1667, 0.006) * 0.25;                     // a lighter intermediate joint
        const pit = clamp(f.grain.at(u * 9, v * 9) * 1.9 - 1.15, 0, 1);

        const wear = clamp(f.coarse.at(u * 0.7, v * 0.7) * 1.6 - 0.5, 0, 1);
        mixRgb(base, worn, wear * 0.42, out);
        const shade = 1 - sm * 0.55 + (grain - 0.5) * 0.13 + (roll - 0.5) * 0.10 - pit * 0.28;
        const i = (y * S + x) * 4;
        rgba[i] = out[0] * shade;
        rgba[i + 1] = out[1] * shade;
        rgba[i + 2] = out[2] * shade;
        rgba[i + 3] = clamp(0.78 - wear * 0.34 + (grain - 0.5) * 0.22 + pit * 0.15, 0.1, 1) * 255;
        height[y * S + x] = grain * 0.16 + (roll - 0.5) * 0.2 - sm * 0.9 - pit * 0.5;
      }
    }
    return { rgba, height, strength: 1.5 };
  };
}

// ── instrument atlas ────────────────────────────────────────────────────────────────────────
// 8×8 monochrome faces on black. Colour comes from the InstancedMesh's per-instance colour, so
// one 1024² texture covers every display in the room and a tile can be any hue at any brightness.

let atlas = null;

export function screenAtlas() {
  if (atlas) return atlas;
  const S = texSize(1024);
  const T = S / ATLAS_TILES;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, S, S);

  const r = rng(4177);
  for (let ty = 0; ty < ATLAS_TILES; ty++) {
    for (let tx = 0; tx < ATLAS_TILES; tx++) {
      g.save();
      g.translate(tx * T, ty * T);
      g.beginPath();
      g.rect(0, 0, T, T);
      g.clip();
      drawFace(g, T, (ty * ATLAS_TILES + tx) % 16, r);
      screenGlass(g, T);
      g.restore();
    }
  }

  atlas = new THREE.CanvasTexture(cv);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.minFilter = THREE.LinearMipmapLinearFilter;
  atlas.magFilter = THREE.LinearFilter;
  atlas.generateMipmaps = true;
  atlas.needsUpdate = true;
  track(atlas, { w: S, h: S, fmt: 'rgba', mips: true, label: 'bridge:screens' });
  return atlas;
}

// Scanlines, a corner falloff and a dark inner lip. A CRT is not a flat colour field, and the lip
// is what reads as a bezel once the quad is 40 px on screen.
function screenGlass(g, T) {
  g.globalCompositeOperation = 'multiply';
  const step = Math.max(2, Math.round(T / 34));
  g.fillStyle = 'rgba(0,0,0,0.30)';
  for (let y = 0; y < T; y += step) g.fillRect(0, y, T, Math.max(1, step * 0.42));

  const grd = g.createRadialGradient(T * 0.5, T * 0.45, T * 0.18, T * 0.5, T * 0.5, T * 0.72);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(1, 'rgba(120,120,120,1)');
  g.fillStyle = grd;
  g.fillRect(0, 0, T, T);

  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.lineWidth = Math.max(2, T / 22);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, T - g.lineWidth, T - g.lineWidth);

  // one soft diagonal — a screen behind glass always carries a reflection of the compartment
  g.globalCompositeOperation = 'lighter';
  const sh = g.createLinearGradient(0, T * 0.9, T * 0.55, 0);
  sh.addColorStop(0, 'rgba(255,255,255,0)');
  sh.addColorStop(0.55, 'rgba(255,255,255,0.055)');
  sh.addColorStop(0.72, 'rgba(255,255,255,0)');
  g.fillStyle = sh;
  g.fillRect(0, 0, T, T);
  g.globalCompositeOperation = 'source-over';
}

function drawFace(g, T, kind, r) {
  const px = v => v * T;
  g.lineWidth = Math.max(1, T / 90);
  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  const dim = a => `rgba(255,255,255,${a})`;

  // every face gets a faint backlit wash so a dark screen still reads as glass, not a hole
  g.fillStyle = dim(0.15);
  g.fillRect(px(0.04), px(0.04), px(0.92), px(0.92));
  g.fillStyle = '#fff';

  if (kind === 0) {                                   // PPI radar
    const cx = px(0.5), cy = px(0.5);
    for (let i = 1; i <= 3; i++) {
      g.strokeStyle = dim(0.35);
      g.beginPath(); g.arc(cx, cy, px(0.14 * i), 0, 7); g.stroke();
    }
    g.strokeStyle = dim(0.25);
    for (let a = 0; a < 8; a++) {
      g.beginPath(); g.moveTo(cx, cy);
      g.lineTo(cx + Math.cos(a * 0.785) * px(0.44), cy + Math.sin(a * 0.785) * px(0.44));
      g.stroke();
    }
    const sw = r() * 6.28;
    const grad = g.createLinearGradient(cx, cy, cx + Math.cos(sw) * px(0.44), cy + Math.sin(sw) * px(0.44));
    grad.addColorStop(0, dim(0.9)); grad.addColorStop(1, dim(0));
    g.strokeStyle = grad; g.lineWidth = Math.max(1.5, T / 40);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(sw) * px(0.44), cy + Math.sin(sw) * px(0.44)); g.stroke();
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28, d = px(0.08 + r() * 0.34);
      g.fillStyle = dim(0.5 + r() * 0.5);
      g.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d, px(0.03), px(0.03));
    }
  } else if (kind === 1) {                            // bar meters
    for (let i = 0; i < 6; i++) {
      const h = 0.12 + r() * 0.66;
      g.fillStyle = dim(0.22);
      g.fillRect(px(0.1 + i * 0.135), px(0.12), px(0.09), px(0.76));
      g.fillStyle = dim(0.85);
      g.fillRect(px(0.1 + i * 0.135), px(0.88 - h * 0.76), px(0.09), px(h * 0.76));
    }
  } else if (kind === 2) {                            // waveform trace
    g.strokeStyle = dim(0.2);
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(px(0.06), px(i * 0.25)); g.lineTo(px(0.94), px(i * 0.25)); g.stroke(); }
    g.strokeStyle = dim(0.95); g.lineWidth = Math.max(1.5, T / 55);
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const y = 0.5 + Math.sin(u * 14 + r() * 0.1) * 0.16 * (0.4 + r() * 0.6);
      i ? g.lineTo(px(0.06 + u * 0.88), px(y)) : g.moveTo(px(0.06), px(y));
    }
    g.stroke();
  } else if (kind === 3) {                            // chart / plan view
    g.strokeStyle = dim(0.18);
    for (let i = 1; i < 8; i++) {
      g.beginPath(); g.moveTo(px(i / 8), 0); g.lineTo(px(i / 8), T); g.stroke();
      g.beginPath(); g.moveTo(0, px(i / 8)); g.lineTo(T, px(i / 8)); g.stroke();
    }
    g.strokeStyle = dim(0.8); g.lineWidth = Math.max(1.5, T / 60);
    g.beginPath();
    let x = 0.12, y = 0.3 + r() * 0.3;
    g.moveTo(px(x), px(y));
    for (let i = 0; i < 6; i++) { x += 0.14; y += (r() - 0.5) * 0.28; g.lineTo(px(x), px(clamp(y, 0.1, 0.9))); }
    g.stroke();
  } else if (kind === 4) {                            // text block
    for (let i = 0; i < 9; i++) {
      g.fillStyle = dim(i === 0 ? 0.9 : 0.34 + r() * 0.3);
      g.fillRect(px(0.09), px(0.1 + i * 0.09), px((0.25 + r() * 0.6) * 0.86), px(0.045));
    }
  } else if (kind === 5) {                            // gauge dial
    const cx = px(0.5), cy = px(0.56);
    g.strokeStyle = dim(0.5); g.lineWidth = Math.max(1.5, T / 45);
    g.beginPath(); g.arc(cx, cy, px(0.36), Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.strokeStyle = dim(0.3);
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (1.15 + 0.7 * i / 10);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * px(0.28), cy + Math.sin(a) * px(0.28));
      g.lineTo(cx + Math.cos(a) * px(0.36), cy + Math.sin(a) * px(0.36));
      g.stroke();
    }
    const a = Math.PI * (1.15 + 0.7 * r());
    g.strokeStyle = dim(1); g.lineWidth = Math.max(2, T / 34);
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * px(0.31), cy + Math.sin(a) * px(0.31)); g.stroke();
  } else if (kind === 6) {                            // lamp / switch bank
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 5; x++) {
        g.fillStyle = dim(r() < 0.45 ? 0.95 : 0.12);
        g.beginPath(); g.arc(px(0.16 + x * 0.17), px(0.24 + y * 0.26), px(0.045), 0, 7); g.fill();
      }
    }
  } else if (kind === 7) {                            // seven-segment readout
    g.fillStyle = dim(0.1);
    g.fillRect(px(0.06), px(0.3), px(0.88), px(0.4));
    for (let i = 0; i < 4; i++) {
      const bx = 0.12 + i * 0.2;
      for (const [dx, dy, w, h] of [[0, 0, 0.12, 0.022], [0, 0.16, 0.12, 0.022], [0, 0.32, 0.12, 0.022],
        [0, 0, 0.022, 0.17], [0.1, 0, 0.022, 0.17], [0, 0.17, 0.022, 0.17], [0.1, 0.17, 0.022, 0.17]]) {
        g.fillStyle = dim(r() < 0.7 ? 0.95 : 0.08);
        g.fillRect(px(bx + dx), px(0.33 + dy), px(w), px(h));
      }
    }
  } else if (kind === 8) {                            // horizon / attitude
    g.fillStyle = dim(0.28);
    g.fillRect(px(0.06), px(0.5), px(0.88), px(0.44));
    g.strokeStyle = dim(0.9); g.lineWidth = Math.max(2, T / 40);
    g.beginPath(); g.moveTo(px(0.06), px(0.5)); g.lineTo(px(0.94), px(0.5)); g.stroke();
    g.beginPath(); g.moveTo(px(0.34), px(0.5)); g.lineTo(px(0.5), px(0.62)); g.lineTo(px(0.66), px(0.5)); g.stroke();
  } else if (kind === 9) {                            // contact list
    g.fillStyle = dim(0.8); g.fillRect(px(0.08), px(0.1), px(0.84), px(0.05));
    for (let i = 0; i < 6; i++) {
      g.fillStyle = dim(0.3);
      g.fillRect(px(0.08), px(0.22 + i * 0.12), px(0.3), px(0.05));
      g.fillStyle = dim(0.65);
      g.fillRect(px(0.44), px(0.22 + i * 0.12), px(0.14 + r() * 0.34), px(0.05));
    }
  } else if (kind === 10) {                           // standby: a banner, a rule and the lamp
    g.fillStyle = dim(0.24);
    g.fillRect(px(0.14), px(0.40), px(0.72), px(0.11));
    g.fillStyle = dim(0.13);
    g.fillRect(px(0.22), px(0.56), px(0.56), px(0.05));
    g.strokeStyle = dim(0.18); g.lineWidth = Math.max(1, T / 80);
    g.beginPath(); g.moveTo(px(0.08), px(0.30)); g.lineTo(px(0.92), px(0.30)); g.stroke();
    g.fillStyle = dim(0.7);
    g.beginPath(); g.arc(px(0.86), px(0.86), px(0.035), 0, 7); g.fill();
  } else if (kind === 12) {                           // compass rose / gyro repeater
    const cx = px(0.5), cy = px(0.5);
    g.strokeStyle = dim(0.45); g.lineWidth = Math.max(1.5, T / 60);
    g.beginPath(); g.arc(cx, cy, px(0.40), 0, 7); g.stroke();
    g.beginPath(); g.arc(cx, cy, px(0.30), 0, 7); g.stroke();
    for (let i = 0; i < 36; i++) {
      const a = i * Math.PI / 18, big = i % 9 === 0;
      g.strokeStyle = dim(big ? 0.9 : 0.3);
      g.lineWidth = big ? Math.max(2, T / 44) : Math.max(1, T / 90);
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * px(big ? 0.30 : 0.35), cy + Math.sin(a) * px(big ? 0.30 : 0.35));
      g.lineTo(cx + Math.cos(a) * px(0.40), cy + Math.sin(a) * px(0.40));
      g.stroke();
    }
    const hd = r() * 6.28;
    g.strokeStyle = dim(1); g.lineWidth = Math.max(2, T / 30);
    g.beginPath(); g.moveTo(cx - Math.cos(hd) * px(0.10), cy - Math.sin(hd) * px(0.10));
    g.lineTo(cx + Math.cos(hd) * px(0.26), cy + Math.sin(hd) * px(0.26)); g.stroke();
    g.fillStyle = dim(0.85);
    g.fillRect(px(0.36), px(0.03), px(0.28), px(0.10));
  } else if (kind === 13) {                           // hazard-striped alarm panel
    g.save();
    g.beginPath(); g.rect(px(0.06), px(0.06), px(0.88), px(0.34)); g.clip();
    for (let i = -8; i < 16; i++) {
      g.fillStyle = dim(i % 2 ? 0.62 : 0.10);
      g.save(); g.translate(px(i * 0.11), 0); g.rotate(0.5);
      g.fillRect(0, px(-0.3), px(0.075), px(1.2));
      g.restore();
    }
    g.restore();
    for (let i = 0; i < 3; i++) {
      g.fillStyle = dim(r() < 0.4 ? 0.95 : 0.14);
      g.beginPath(); g.arc(px(0.24 + i * 0.26), px(0.62), px(0.062), 0, 7); g.fill();
      g.strokeStyle = dim(0.3); g.lineWidth = Math.max(1, T / 80);
      g.beginPath(); g.arc(px(0.24 + i * 0.26), px(0.62), px(0.082), 0, 7); g.stroke();
    }
    g.fillStyle = dim(0.30);
    g.fillRect(px(0.14), px(0.82), px(0.72), px(0.07));
  } else if (kind === 14) {                           // switch matrix with individual lamps
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < 6; x++) {
        g.fillStyle = dim(0.09);
        g.fillRect(px(0.07 + x * 0.147), px(0.10 + y * 0.215), px(0.118), px(0.17));
        g.fillStyle = dim(r() < 0.38 ? 0.9 : 0.16);
        g.fillRect(px(0.095 + x * 0.147), px(0.125 + y * 0.215), px(0.082), px(0.052));
        g.fillStyle = dim(0.24);
        g.fillRect(px(0.088 + x * 0.147), px(0.215 + y * 0.215), px(0.096), px(0.030));
      }
    }
  } else if (kind === 15) {                           // echo sounder / strip chart
    g.strokeStyle = dim(0.16); g.lineWidth = Math.max(1, T / 100);
    for (let i = 1; i < 10; i++) {
      g.beginPath(); g.moveTo(px(0.06), px(i / 10)); g.lineTo(px(0.94), px(i / 10)); g.stroke();
    }
    g.strokeStyle = dim(0.85); g.lineWidth = Math.max(1.5, T / 70);
    g.beginPath();
    let d = 0.42;
    for (let i = 0; i <= 48; i++) {
      d = clamp(d + (r() - 0.5) * 0.09, 0.18, 0.86);
      const x = px(0.06 + (i / 48) * 0.88);
      i ? g.lineTo(x, px(d)) : g.moveTo(x, px(d));
    }
    g.stroke();
    g.fillStyle = dim(0.22);
    g.fillRect(px(0.06), px(0.86), px(0.88), px(0.09));
    g.fillStyle = dim(0.8);
    g.fillRect(px(0.09), px(0.885), px(0.16), px(0.04));
  } else {                                            // grid map with a track
    g.strokeStyle = dim(0.22);
    for (let i = 1; i < 5; i++) {
      g.beginPath(); g.moveTo(px(i / 5), 0); g.lineTo(px(i / 5), T); g.stroke();
      g.beginPath(); g.moveTo(0, px(i / 5)); g.lineTo(T, px(i / 5)); g.stroke();
    }
    g.strokeStyle = dim(0.9); g.lineWidth = Math.max(1.5, T / 55);
    g.beginPath(); g.arc(px(0.5), px(0.5), px(0.3), 0, 7); g.stroke();
    g.fillStyle = dim(1);
    for (let i = 0; i < 4; i++) g.fillRect(px(0.15 + r() * 0.7), px(0.15 + r() * 0.7), px(0.04), px(0.04));
  }
}

// ── surfaces ────────────────────────────────────────────────────────────────────────────────

// The room must be lit by the practicals that are visibly in the frame, not by the sky's IBL —
// with envMapIntensity at 1 a 7 m deck is the same brightness at the far bulkhead as it is under
// the glowing table, which is the single loudest tell in the whole component. Scenarios set this.
// Each surface gets its own share of it, because the sky is not equally visible from all of them:
// a deck's upper hemisphere is deckhead, not sky, and at an equal share the floor comes out as the
// brightest, flattest thing in a dusk shot.
const lit = new Set();
let envI = 0.30;
export function setEnvIntensity(v) {
  envI = v;
  for (const m of lit) { m.envMapIntensity = v * (m.userData.envShare ?? 1); m.needsUpdate = true; }
}

// bake.js puts roughness in the albedo's alpha. Reading it costs nothing extra and it is most of
// why painted steel reads as a substance rather than as a flat diffuse fill.
function roughFromAlpha(m, lo = 0.62, hi = 1.28) {
  m.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <roughnessmap_fragment>',
      `float roughnessFactor = roughness * mix( ${lo.toFixed(2)}, ${hi.toFixed(2)}, diffuseColor.a );
       diffuseColor.a = 1.0;`);
  };
  m.customProgramCacheKey = () => `waterlineRoughA${lo}_${hi}`;
  return m;
}

function track_(m, share = 1) {
  lit.add(m);
  m.userData.envShare = share;
  m.envMapIntensity = envI * share;
  return m;
}

export function make(name, quality) {
  const aniso = quality?.get?.('aniso') ?? 4;

  // The map is baked in sRGB at the paint's own colour and `color` multiplies it, so a dark hex in
  // BOTH places squares the albedo: #2b3036 twice is 0.0006 linear, a surface no amount of light
  // can lift off zero. The paint colour lives in the bake; `color` stays white.
  if (name === 'panel') {
    const s = surface('bridge:panel', 512, bulkhead({ colour: '#636b75', pitch: 0.29, dirt: 0.55 }));
    return track_(roughFromAlpha(new THREE.MeshStandardMaterial({
      map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(0.85, 0.85),
      color: 0xffffff, roughness: 0.55, metalness: 0.18,
    })), 0.80);
  }

  if (name === 'floor') {
    const s = surface('bridge:deck', 512, deckPlate({ colour: '#2d3339' }));
    return track_(roughFromAlpha(new THREE.MeshStandardMaterial({
      map: s.map, normalMap: s.normalMap, normalScale: new THREE.Vector2(0.9, 0.9),
      color: 0xffffff, roughness: 0.62, metalness: 0.16,
    }), 0.68, 1.22), 0.30);
  }

  if (name === 'trim') {
    return track_(new THREE.MeshStandardMaterial({ color: 0x8d949d, roughness: 0.38, metalness: 0.52 }));
  }

  if (name === 'seat') {
    return track_(new THREE.MeshStandardMaterial({ color: 0x4a5058, roughness: 0.66, metalness: 0.12 }), 0.85);
  }

  if (name === 'glass') {
    // The window is a sheet of nothing with a sheen and the compartment's own reflection on it.
    // Additive so it can only ever lift the exterior a little — a subtractive tint here is what
    // turns a lit sea into a grey wall.
    return new THREE.MeshBasicMaterial({
      color: 0x3a4f68, map: glassTexture(), transparent: true, opacity: 0.55, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      forceSinglePass: true,
    });
  }

  if (name === 'screen') {
    const tex = screenAtlas();
    tex.anisotropy = aniso;
    const m = new THREE.MeshBasicMaterial({ map: tex, toneMapped: true, fog: false });
    // Per-instance atlas tile. Without this every display in the room is the same face and the
    // wall reads as wallpaper, which is the single loudest "this is a game" tell in the plates.
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec2 aTile;\nvarying vec2 vTile;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\nvTile = aTile;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vTile;')
        .replace('#include <map_fragment>',
          `#ifdef USE_MAP
             diffuseColor *= texture2D( map, vMapUv * ${(1 / ATLAS_TILES).toFixed(6)} + vTile );
           #endif`);
    };
    m.customProgramCacheKey = () => 'bridgeScreenAtlas';
    return m;
  }

  return null;
}
