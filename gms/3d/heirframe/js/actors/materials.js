import * as THREE from '../../../../lib/three/0.180.0/three.module.js';

const cache = new Map();
let lowQ = false;
export function setMaterialQuality(q) { lowQ = q === 'low'; }

function once(key, make) {
  const k = key + (lowQ ? '|lo' : '');
  if (!cache.has(k)) cache.set(k, make());
  return cache.get(k);
}

// metal/paint/gloss factory. o: {color, metal, rough, coat, coatRough, emissive, ei, map, emap, sheen}
export function mat(key, o) {
  return once(key, () => {
    const phys = !lowQ && (o.coat || o.iri);
    const M = phys ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    const m = new M({
      color: o.color ?? 0xffffff, metalness: o.metal ?? 0, roughness: o.rough ?? 0.5,
      envMapIntensity: o.env ?? 1,
    });
    if (phys) {
      m.clearcoat = o.coat || 0; m.clearcoatRoughness = o.coatRough ?? 0.06;
      if (o.iri) { m.iridescence = o.iri; m.iridescenceIOR = 1.6; }
    }
    if (o.emissive !== undefined) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.ei ?? 1; }
    if (o.map) m.map = o.map;
    if (o.emap) m.emissiveMap = o.emap;
    if (o.rmap) m.roughnessMap = o.rmap;
    m.name = key;
    return m;
  });
}

export function glow(key, color, ei = 2.5) {
  return once('glow:' + key + ei, () => {
    const m = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: ei, roughness: 0.3, metalness: 0 });
    m.userData.baseEI = ei;
    m.name = 'glow:' + key;
    return m;
  });
}

export const flashMat = () => once('flash', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));

// ---- canvas textures ----
function canvas(w, h, draw) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export const scuffTex = () => once('tex:scuff', () => canvas(512, 512, (g, w, h) => {
  const r = rng(7);
  g.fillStyle = '#b9bcbf'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2500; i++) {
    const v = 150 + r() * 80 | 0;
    g.fillStyle = `rgba(${v},${v},${v + 3},${0.15 + r() * 0.2})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3);
  }
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = r() < 0.6 ? `rgba(60,58,55,${0.25 + r() * 0.4})` : `rgba(235,235,235,${0.3 + r() * 0.4})`;
    g.lineWidth = 0.6 + r() * 1.6;
    g.beginPath();
    let x = r() * w, y = r() * h; g.moveTo(x, y);
    const a = r() * 6.28, L = 10 + r() * 70;
    for (let k = 0; k < 4; k++) { x += Math.cos(a + (r() - 0.5) * 0.6) * L / 4; y += Math.sin(a + (r() - 0.5) * 0.6) * L / 4; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 18; i++) {
    const x = r() * w, y = r() * h, R = 10 + r() * 40;
    const gr = g.createRadialGradient(x, y, 0, x, y, R);
    gr.addColorStop(0, `rgba(70,60,45,${0.2 + r() * 0.25})`); gr.addColorStop(1, 'rgba(70,60,45,0)');
    g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
  }
}));

export const orangeTex = () => once('tex:orange', () => canvas(256, 256, (g, w, h) => {
  const r = rng(11);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(90,90,95,${0.3 + r() * 0.5})`;
    const x = r() * w, y = r() * h;
    g.beginPath(); g.ellipse(x, y, 1 + r() * 6, 0.5 + r() * 2, r() * 3, 0, 6.28); g.fill();
  }
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(80,70,60,${0.2 + r() * 0.3})`; g.lineWidth = 0.8;
    g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 10); g.stroke();
  }
}));

// Atlas: chest plate [0,.5,.5,1], back plate [.5,.5,1,1], hazard [0,.25,.5,.5], number [.5,0,.75,.5], tape [.75,0,1,.5], barcode [0,0,.5,.25]
export const DECAL = {
  chest: [0, 0.5, 0.5, 1], back: [0.5, 0.5, 1, 1], hazard: [0, 0.25, 0.5, 0.5],
  num: [0.5, 0, 0.75, 0.5], tape: [0.75, 0, 1, 0.5], barcode: [0, 0, 0.5, 0.25],
};
export const decalTex = () => once('tex:decal', () => canvas(1024, 512, (g) => {
  const r = rng(3);
  // chest plate
  g.fillStyle = '#e9e6de'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#ff6a13'; g.fillRect(0, 0, 512, 64);
  g.fillStyle = '#1b1b1d'; g.font = 'bold 50px Arial, Helvetica, sans-serif'; g.textBaseline = 'middle';
  g.fillText('HIREFRAME', 24, 34);
  g.font = 'bold 92px Arial, Helvetica, sans-serif'; g.fillText('R-1', 24, 138);
  g.font = 'bold 26px Arial, Helvetica, sans-serif'; g.fillText('UNIT 0417 · BASIC', 24, 212);
  g.fillStyle = '#ff6a13'; g.beginPath(); g.arc(420, 140, 56, 0, 6.28); g.fill();
  g.fillStyle = '#e9e6de'; g.font = 'bold 44px Arial, Helvetica, sans-serif'; g.fillText('$', 404, 142);
  // back plate
  g.fillStyle = '#ff6a13'; g.fillRect(512, 0, 512, 256);
  g.fillStyle = '#1b1b1d'; g.font = 'bold 44px Arial, Helvetica, sans-serif';
  g.fillText('RENT BY THE HOUR', 540, 60);
  g.font = 'bold 30px Arial, Helvetica, sans-serif';
  g.fillText('HIREFRAME DEPOT 12', 540, 120);
  g.fillText('IF FOUND RETURN TO', 540, 170); g.fillText('NEAREST DEPOT', 540, 210);
  // hazard stripes
  g.save(); g.beginPath(); g.rect(0, 256, 512, 128); g.clip();
  g.fillStyle = '#ffb000'; g.fillRect(0, 256, 512, 128);
  g.fillStyle = '#18181a';
  for (let x = -128; x < 640; x += 64) { g.beginPath(); g.moveTo(x, 384); g.lineTo(x + 32, 384); g.lineTo(x + 160, 256); g.lineTo(x + 128, 256); g.fill(); }
  g.restore();
  // shoulder number
  g.fillStyle = '#ff6a13'; g.fillRect(512, 256, 256, 256);
  g.fillStyle = '#1b1b1d'; g.font = 'bold 150px Arial, Helvetica, sans-serif'; g.textAlign = 'center';
  g.fillText('17', 640, 390); g.textAlign = 'left';
  // duct tape
  g.fillStyle = '#9ea2a4'; g.fillRect(768, 256, 256, 256);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.18})`; g.fillRect(768, 256 + r() * 256, 256, 1); }
  // barcode strip
  g.fillStyle = '#e9e6de'; g.fillRect(0, 384, 512, 128);
  g.fillStyle = '#1b1b1d';
  for (let x = 20; x < 490; x += 3 + (r() * 7 | 0)) g.fillRect(x, 398, 1 + (r() * 4 | 0), 80);
  g.font = 'bold 18px Arial, Helvetica, sans-serif'; g.fillText('HF-R1-0417-0099', 24, 500);
  // grime over everything
  for (let i = 0; i < 1400; i++) {
    g.fillStyle = `rgba(60,50,40,${r() * 0.12})`;
    g.fillRect(r() * 1024, r() * 512, 1 + r() * 4, 1 + r() * 4);
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(240,240,240,${0.2 + r() * 0.4})`; g.lineWidth = 1;
    const x = r() * 1024, y = r() * 512; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 12); g.stroke();
  }
}));

export const visorTex = () => once('tex:visor', () => canvas(256, 128, (g, w, h) => {
  const r = rng(5);
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#ffcf7a'); gr.addColorStop(0.5, '#ff9a2a'); gr.addColorStop(1, '#b85a10');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  // crack: dark fracture lines with bright chipped edges
  const crack = (x, y, a, len, width, depth) => {
    g.strokeStyle = '#150a02'; g.lineWidth = width; g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < 6; i++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * len / 6; y += Math.sin(a) * len / 6; g.lineTo(x, y); }
    g.stroke();
    if (depth > 0) for (let i = 0; i < 2; i++) crack(x, y, a + (r() - 0.5) * 2, len * 0.5, width * 0.6, depth - 1);
  };
  crack(178, 30, 2.4, 70, 2.4, 2); crack(178, 30, 0.4, 50, 2, 1); crack(178, 30, -1.2, 30, 1.6, 1);
  g.fillStyle = '#1a0c03'; g.beginPath(); g.arc(178, 30, 5, 0, 6.28); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(150, 0, 70, h); // dead pixel block around impact
}));

export const lensTex = () => once('tex:lens', () => canvas(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, '#ffffff'); gr.addColorStop(0.3, '#777777');
  gr.addColorStop(0.55, '#333333'); gr.addColorStop(0.62, '#aaaaaa'); gr.addColorStop(0.7, '#222222'); gr.addColorStop(1, '#000000');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
}));

// Livery presets for the `paint` param. Slots not named keep the kind's own material.
export const PAINTS = {
  gold: { body: { color: 0xf2b64c, metal: 1, rough: 0.2, coat: 0.5 }, trim: { color: 0x1a1a1d, metal: 1, rough: 0.22 } },
  chrome: { body: { color: 0xf3f5f8, metal: 1, rough: 0.07 }, trim: { color: 0xb8bcc2, metal: 1, rough: 0.28 } },
  black: { body: { color: 0x08090b, metal: 0.55, rough: 0.28, coat: 1 }, trim: { color: 0xd9a441, metal: 1, rough: 0.22 } },
  rental: { body: { color: 0x8a8d90, metal: 0.35, rough: 0.6 }, trim: { color: 0xff6a13, metal: 0.1, rough: 0.5 } },
  syndicate: { body: { color: 0x3a1420, metal: 0.6, rough: 0.35, coat: 0.6 }, trim: { color: 0xd4a017, metal: 0.9, rough: 0.3 }, glow: 0xff3aa8, eye: 0xff4fb4 },
  concord: { body: { color: 0xeef1f5, metal: 0.1, rough: 0.25, coat: 1 }, trim: { color: 0x1b2a4a, metal: 0.6, rough: 0.35 }, glow: 0x3aa0ff, eye: 0x7cc4ff },
  rebel: { body: { color: 0x4a5236, metal: 0.3, rough: 0.55 }, trim: { color: 0xc26a2c, metal: 0.4, rough: 0.5 }, glow: 0x9dff4a, eye: 0xb8ff6a },
  rust: { body: { color: 0x7a4a2a, metal: 0.5, rough: 0.7 }, trim: { color: 0x9a9064, metal: 0.4, rough: 0.6 }, glow: 0xff7a1a, eye: 0xff5a1a },
};

// paint: preset name, or { body, trim, mech: {color, metal, rough, coat} | hex, glow, eye: hex }
export function applyPaint(M, paint) {
  if (!paint) return M;
  const p = typeof paint === 'string' ? PAINTS[paint] : paint;
  if (!p) return M;
  const out = { ...M };
  for (const slot of ['body', 'trim', 'mech']) {
    if (p[slot] === undefined || !M[slot]) continue;
    const def = typeof p[slot] === 'object' ? p[slot] : { color: p[slot], metal: M[slot].metalness, rough: M[slot].roughness, coat: M[slot].clearcoat };
    out[slot] = mat('paint:' + JSON.stringify(def), def);
  }
  for (const slot of ['glow', 'eye']) {
    if (p[slot] === undefined || !M[slot]) continue;
    out[slot] = glow('paint:' + slot + p[slot], p[slot], M[slot].userData.baseEI ?? M[slot].emissiveIntensity);
  }
  return out;
}
