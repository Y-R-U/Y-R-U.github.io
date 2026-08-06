// Table kit — C2. Surfaces: glass bezel peg pegHit pegMiss gridline.
//
// `glass` is the plot surface itself and is the only interesting one. It is baked as a channel
// map — R = printed markings, G = large-scale mottle, B = fine grain — and recoloured in the
// shader, so the same texture is a cold holographic plot under the bridge lamps and warm lit
// paper under the chart lamp. Two looks, one bake.

import * as THREE from 'three';
import { texSize } from '../textures/bake.js';
import { fields, clamp, smoothstep, rng } from '../textures/noise.js';
import { track } from '../../engine/budget.js';

export const LOOKS = {
  holo: { paper: '#08171f', ink: '#3fbcd2', paperGlow: 0.22, inkGlow: 1.30 },
  chart: { paper: '#c08c4e', ink: '#2a1a0e', paperGlow: 0.10, inkGlow: 0.02 },
};

const uniforms = {
  uPaper: { value: new THREE.Color(LOOKS.holo.paper) },
  uInk: { value: new THREE.Color(LOOKS.holo.ink) },
  uGlow: { value: new THREE.Vector2(LOOKS.holo.paperGlow, LOOKS.holo.inkGlow) },
};

export function setChartLook(name) {
  const L = LOOKS[name] || LOOKS.holo;
  uniforms.uPaper.value.set(L.paper);
  uniforms.uInk.value.set(L.ink);
  uniforms.uGlow.value.set(L.paperGlow, L.inkGlow);
}

let chart = null;

// The plot surface: mottled stock with a printed graticule, depth contours, a rose and a few
// pencilled bearing lines. Deliberately NOT the playing grid — that is real geometry in table.js
// so it stays aligned on a non-square board.
function chartTexture() {
  if (chart) return chart;
  const S = texSize(1024);
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const r = rng(9311);

  const f = fields();
  const img = g.createImageData(S, S);
  const p = img.data;
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const w = f.warp.at(u * 0.8, v * 0.8) - 0.5;
      const mottle = clamp(0.35 + f.coarse.at(u * 0.9 + w * 0.15, v * 0.9 + w * 0.15) * 1.1
        + (f.fine.at(u * 2.2, v * 2.2) - 0.5) * 0.3, 0, 1);
      // corners sit darker than the middle: the surface is lit from a lamp over its centre, and a
      // uniform sheet is the flattest thing a critic can see
      const dx = u - 0.5, dy = v - 0.5;
      const fall = 1 - smoothstep(0.16, 0.62, Math.sqrt(dx * dx + dy * dy)) * 0.55;
      const i = (y * S + x) * 4;
      p[i] = 0;
      p[i + 1] = mottle * fall * 255;
      p[i + 2] = clamp(0.5 + (f.grain.at(u * 1.6, v * 1.6) - 0.5) * 0.7, 0, 1) * 255;
      p[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);

  // Markings go into R only, so they never disturb the mottle underneath.
  g.globalCompositeOperation = 'lighter';
  const ink = a => `rgba(${Math.round(a * 255)},0,0,1)`;
  const px = t => t * S;

  g.lineWidth = Math.max(1, S / 900);
  g.strokeStyle = ink(0.10);
  for (let i = 1; i < 40; i++) {
    g.beginPath(); g.moveTo(px(i / 40), 0); g.lineTo(px(i / 40), S); g.stroke();
    g.beginPath(); g.moveTo(0, px(i / 40)); g.lineTo(S, px(i / 40)); g.stroke();
  }
  g.lineWidth = Math.max(1.5, S / 400);
  g.strokeStyle = ink(0.24);
  for (let i = 1; i < 8; i++) {
    g.beginPath(); g.moveTo(px(i / 8), 0); g.lineTo(px(i / 8), S); g.stroke();
    g.beginPath(); g.moveTo(0, px(i / 8)); g.lineTo(S, px(i / 8)); g.stroke();
  }

  g.strokeStyle = ink(0.6);
  g.lineWidth = Math.max(2, S / 260);
  g.strokeRect(px(0.028), px(0.028), px(0.944), px(0.944));
  g.lineWidth = Math.max(1, S / 700);
  for (let i = 0; i <= 80; i++) {
    const t = px(0.028 + 0.944 * i / 80), L = px(i % 5 === 0 ? 0.019 : 0.010);
    g.beginPath(); g.moveTo(t, px(0.028)); g.lineTo(t, px(0.028) + L); g.stroke();
    g.beginPath(); g.moveTo(t, px(0.972)); g.lineTo(t, px(0.972) - L); g.stroke();
    g.beginPath(); g.moveTo(px(0.028), t); g.lineTo(px(0.028) + L, t); g.stroke();
    g.beginPath(); g.moveTo(px(0.972), t); g.lineTo(px(0.972) - L, t); g.stroke();
  }

  g.strokeStyle = ink(0.5);
  g.lineWidth = Math.max(1.5, S / 500);
  for (let c = 0; c < 5; c++) {
    const cx = 0.2 + r() * 0.6, cy = 0.2 + r() * 0.6, rad = 0.05 + c * 0.035 + r() * 0.03;
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = i / 48 * Math.PI * 2;
      const k = rad * (1 + Math.sin(a * 3 + c) * 0.24 + Math.sin(a * 5 + c * 2) * 0.12);
      const X = px(cx + Math.cos(a) * k), Y = px(cy + Math.sin(a) * k * 0.75);
      i ? g.lineTo(X, Y) : g.moveTo(X, Y);
    }
    g.closePath(); g.stroke();
  }

  const rx = px(0.815), ry = px(0.79), rr = px(0.115);
  g.strokeStyle = ink(0.55); g.lineWidth = Math.max(1.5, S / 600);
  g.beginPath(); g.arc(rx, ry, rr, 0, 7); g.stroke();
  g.beginPath(); g.arc(rx, ry, rr * 0.78, 0, 7); g.stroke();
  for (let i = 0; i < 32; i++) {
    const a = i / 32 * Math.PI * 2, L = i % 4 === 0 ? 0.22 : 0.1;
    g.beginPath();
    g.moveTo(rx + Math.cos(a) * rr * (1 - L), ry + Math.sin(a) * rr * (1 - L));
    g.lineTo(rx + Math.cos(a) * rr, ry + Math.sin(a) * rr);
    g.stroke();
  }
  g.strokeStyle = ink(0.75); g.lineWidth = Math.max(2, S / 400);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2;
    g.beginPath(); g.moveTo(rx, ry);
    g.lineTo(rx + Math.cos(a) * rr * (i % 2 ? 0.45 : 0.72), ry + Math.sin(a) * rr * (i % 2 ? 0.45 : 0.72));
    g.stroke();
  }

  g.strokeStyle = ink(0.85); g.lineWidth = Math.max(1.5, S / 620);
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI, x0 = r(), y0 = r();
    g.beginPath();
    g.moveTo(px(x0 - Math.cos(a)), px(y0 - Math.sin(a)));
    g.lineTo(px(x0 + Math.cos(a)), px(y0 + Math.sin(a)));
    g.stroke();
  }

  // A coastline down one edge with a hatched foreshore, and a field of depth soundings. Without
  // print detail at this scale the surface is an orange plane with a grid on it.
  g.strokeStyle = ink(0.9);
  g.lineWidth = Math.max(2, S / 340);
  const coast = [];
  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    coast.push([0.045 + Math.sin(t * 7.1) * 0.030 + Math.sin(t * 2.3) * 0.055 + t * 0.06, t]);
  }
  g.beginPath();
  coast.forEach(([x, y], i) => (i ? g.lineTo(px(x), px(y)) : g.moveTo(px(x), px(y))));
  g.stroke();
  g.lineWidth = Math.max(1, S / 800);
  g.strokeStyle = ink(0.45);
  for (let i = 1; i < coast.length; i += 1) {
    const [x, y] = coast[i];
    g.beginPath(); g.moveTo(px(x), px(y)); g.lineTo(px(x - 0.022), px(y - 0.006)); g.stroke();
  }
  g.strokeStyle = ink(0.34);
  g.lineWidth = Math.max(1, S / 700);
  for (const off of [0.05, 0.11]) {
    g.beginPath();
    coast.forEach(([x, y], i) => (i ? g.lineTo(px(x + off), px(y)) : g.moveTo(px(x + off), px(y))));
    g.stroke();
  }

  g.font = `${Math.round(S / 52)}px monospace`;
  g.textAlign = 'center';
  for (let i = 0; i < 82; i++) {
    const x = 0.10 + r() * 0.86, y = 0.05 + r() * 0.90;
    const d = Math.round(3 + r() * 96);
    g.fillStyle = ink(0.42 + r() * 0.22);
    g.fillText(String(d), px(x), px(y));
  }

  // Fold creases — two verticals and one horizontal, printed faintly and echoed in the height map.
  g.strokeStyle = ink(0.16);
  g.lineWidth = Math.max(1.5, S / 420);
  for (const x of [0.335, 0.668]) { g.beginPath(); g.moveTo(px(x), 0); g.lineTo(px(x), S); g.stroke(); }
  g.beginPath(); g.moveTo(0, px(0.502)); g.lineTo(S, px(0.502)); g.stroke();

  chart = new THREE.CanvasTexture(cv);
  chart.colorSpace = THREE.NoColorSpace;
  chart.wrapS = chart.wrapT = THREE.ClampToEdgeWrapping;
  chart.minFilter = THREE.LinearMipmapLinearFilter;
  chart.generateMipmaps = true;
  chart.needsUpdate = true;
  track(chart, { w: S, h: S, fmt: 'rgba', mips: true, label: 'table:chart' });
  return chart;
}

// Paper tooth plus the three fold creases, as a normal map. Under a hard tungsten downlight the
// tooth is what carries the sheen across the sheet; without it the paper is a coloured plane.
let chartN = null;
function chartNormal() {
  if (chartN) return chartN;
  const S = texSize(512);
  const f = fields();
  const h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const tooth = (f.grain.at(u * 5, v * 5) - 0.5) * 0.30 + (f.fine.at(u * 2.4, v * 2.4) - 0.5) * 0.22;
      let crease = 0;
      for (const cx of [0.335, 0.668]) crease += Math.exp(-Math.pow((u - cx) / 0.006, 2));
      crease += Math.exp(-Math.pow((v - 0.502) / 0.006, 2));
      h[y * S + x] = tooth - crease * 1.9;
    }
  }
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const img = new ImageData(S, S);
  const p = img.data;
  const k = 3.2;
  for (let y = 0; y < S; y++) {
    const yU = (y - 1 + S) % S, yD = (y + 1) % S;
    for (let x = 0; x < S; x++) {
      const xL = (x - 1 + S) % S, xR = (x + 1) % S;
      const nx = (h[y * S + xL] - h[y * S + xR]) * k;
      const ny = (h[yD * S + x] - h[yU * S + x]) * k;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * S + x) * 4;
      p[i] = (nx * inv * 0.5 + 0.5) * 255;
      p[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      p[i + 2] = (inv * 0.5 + 0.5) * 255;
      p[i + 3] = 255;
    }
  }
  cv.getContext('2d').putImageData(img, 0, 0);
  chartN = new THREE.CanvasTexture(cv);
  chartN.colorSpace = THREE.NoColorSpace;
  chartN.generateMipmaps = true;
  chartN.minFilter = THREE.LinearMipmapLinearFilter;
  chartN.needsUpdate = true;
  track(chartN, { w: S, h: S, fmt: 'rgba', mips: true, label: 'table:chartNormal' });
  return chartN;
}

// Prop materials for the chart clutter. Deliberately outside SURFACES — that list belongs to
// materials/index.js, which is frozen, and these are private to the table.
const props = new Map();
const PROPS = {
  brass: { color: 0xb08a4a, roughness: 0.34, metalness: 0.85 },
  dark: { color: 0x1e2228, roughness: 0.62, metalness: 0.20 },
  plastic: { color: 0xc2c5c9, roughness: 0.26, metalness: 0.02 },
  paper: { color: 0xcfc7b4, roughness: 0.78, metalness: 0.0 },
  enamel: { color: 0xe8e6e0, roughness: 0.22, metalness: 0.03, two: true },
  pencil: { color: 0xc08a2a, roughness: 0.55, metalness: 0.05 },
};
export function prop(name) {
  if (!props.has(name)) {
    const { two, ...d } = PROPS[name] || PROPS.dark;
    // shadowSide matters here: a DoubleSide material defaults to writing its FRONT faces into the
    // shadow map, so a 7 mm ruler shadows its own lit top face and renders solid black.
    const m = new THREE.MeshStandardMaterial({
      ...d, side: two ? THREE.DoubleSide : THREE.FrontSide, shadowSide: THREE.BackSide,
    });
    m.name = `table:${name}`;
    props.set(name, m);
  }
  return props.get(name);
}

function markTexture(label, draw) {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.strokeStyle = g.fillStyle = '#fff';
  g.lineCap = 'round';
  draw(g, S);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  track(t, { w: S, h: S, fmt: 'rgba', mips: true, label });
  return t;
}

export function make(name, quality) {
  const aniso = quality?.get?.('aniso') ?? 4;

  if (name === 'glass') {
    const tex = chartTexture();
    tex.anisotropy = aniso;
    const nrm = chartNormal();
    nrm.anisotropy = aniso;
    const m = new THREE.MeshStandardMaterial({
      map: tex, normalMap: nrm, normalScale: new THREE.Vector2(0.32, 0.32),
      color: 0xffffff, roughness: 0.52, metalness: 0.0,
      emissive: 0xffffff, emissiveIntensity: 1,
    });
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uniforms);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>',
          '#include <common>\nuniform vec3 uPaper;\nuniform vec3 uInk;\nuniform vec2 uGlow;\nvec3 chartInk;')
        .replace('#include <map_fragment>', `
          vec3 ch = texture2D( map, vMapUv ).rgb;
          vec3 paper = uPaper * ( 0.55 + 1.05 * ch.g ) * ( 0.9 + 0.2 * ch.b );
          chartInk = mix( paper, uInk, clamp( ch.r, 0.0, 1.0 ) );
          diffuseColor.rgb *= chartInk;`)
        .replace('#include <emissivemap_fragment>',
          'totalEmissiveRadiance = chartInk * mix( uGlow.x, uGlow.y, clamp( texture2D( map, vMapUv ).r, 0.0, 1.0 ) );');
    };
    m.customProgramCacheKey = () => 'waterlineChart';
    return m;
  }

  if (name === 'bezel') {
    // Not near-pure metal. Metalness 0.78 leaves almost no diffuse term, so in a compartment with
    // no environment to reflect the table's own frame rendered solid black 5 cm under the
    // brightest surface in the room.
    return new THREE.MeshStandardMaterial({ color: 0x6b727c, roughness: 0.44, metalness: 0.35 });
  }

  if (name === 'peg') {
    // One instanced mesh carries every marker, and the per-instance colour has to reach the
    // EMISSIVE term or a hit peg is a dull red cylinder in a dark room. instanceColor only ever
    // reaches the albedo, so markers carry their own `aGlow` attribute — see table.js's setGlow.
    const m = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.36, metalness: 0.3, emissive: 0xffffff, emissiveIntensity: 1,
    });
    m.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nvarying vec3 vGlow;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGlow;')
        .replace('#include <emissivemap_fragment>',
          'totalEmissiveRadiance = vGlow;\ndiffuseColor.rgb *= 0.095 + 0.22 * vGlow;');
    };
    m.customProgramCacheKey = () => 'waterlinePeg';
    return m;
  }

  if (name === 'pegHit') {
    const tex = markTexture('table:hitMark', (g, S) => {
      g.lineWidth = S / 16;
      const c = S / 2, a = S * 0.16, b = S * 0.40;
      for (const [dx, dy] of [[1, 1], [1, -1]]) {
        g.beginPath(); g.moveTo(c - b * dx, c - b * dy); g.lineTo(c + b * dx, c + b * dy); g.stroke();
      }
      g.lineWidth = S / 22;
      g.beginPath(); g.arc(c, c, a, 0, 7); g.stroke();
    });
    return new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
  }

  if (name === 'pegMiss') {
    const tex = markTexture('table:missMark', (g, S) => {
      g.lineWidth = S / 20;
      g.beginPath(); g.arc(S / 2, S / 2, S * 0.30, 0, 7); g.stroke();
      g.globalAlpha = 0.5;
      g.beginPath(); g.arc(S / 2, S / 2, S * 0.09, 0, 7); g.fill();
    });
    return new THREE.MeshBasicMaterial({
      map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
  }

  if (name === 'gridline') {
    return new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 1, depthWrite: false,
      blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
      forceSinglePass: true,
    });
  }

  return null;
}
