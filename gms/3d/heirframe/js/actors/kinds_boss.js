import * as THREE from '../../../../lib/three/0.180.0/three.module.js';
import { mat, glow } from './materials.js';
import { ringH, rod } from './shapes.js';
import { buildHeavy, ENFORCER_DIMS } from './kinds_frames.js';

const PI = Math.PI;

// ================= Big Kettle (Oskar Brann): an enforcer frame hauling a riveted boiler =================
export const KETTLE_DIMS = {
  ...Object.fromEntries(Object.entries(ENFORCER_DIMS).map(([k, v]) => [k, typeof v === 'number' ? v * 1.08 : v])),
  aux0: [0, 0.16, -0.44],
};

let gaugeT = null;
function gaugeTex() {
  if (gaugeT) return gaugeT;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f3eee2'; g.beginPath(); g.arc(64, 64, 62, 0, 7); g.fill();
  g.strokeStyle = '#c02010'; g.lineWidth = 10; g.beginPath(); g.arc(64, 64, 48, PI * 0.05, PI * 0.45); g.stroke();
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 3;
  for (let i = 0; i <= 10; i++) { const a = PI * 0.75 + i / 10 * PI * 1.5; g.beginPath(); g.moveTo(64 + Math.cos(a) * 44, 64 + Math.sin(a) * 44); g.lineTo(64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); g.stroke(); }
  g.lineWidth = 5; g.strokeStyle = '#111'; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(PI * 0.2) * 46, 64 + Math.sin(PI * 0.2) * 46); g.stroke();
  g.fillStyle = '#111'; g.beginPath(); g.arc(64, 64, 7, 0, 7); g.fill();
  g.strokeStyle = '#3a2a10'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 61, 0, 7); g.stroke();
  gaugeT = new THREE.CanvasTexture(c); gaugeT.colorSpace = THREE.SRGBColorSpace; gaugeT.anisotropy = 4;
  return gaugeT;
}

export function buildKettle(b, o) {
  const far = b.far;
  buildHeavy(b, { ...o, tier: 1, enforcer: true });
  // boiler on the back: copper tank, brass bands, a firebox glowing through a grille
  b.add(b.lathe([[0, -0.36], [0.15, -0.35], [0.22, -0.3], [0.235, -0.2], [0.235, 0.2], [0.21, 0.3], [0.13, 0.37], [0, 0.39]], 28), 'aux0', 'boiler');
  for (const y of [-0.24, -0.02, 0.2]) b.add(ringH(b, 0.24, 0.016, 28), 'aux0', 'trim', [0, y, 0]);
  if (!far) for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2; b.add(b.sph(6, 4), 'aux0', 'mech', [Math.sin(a) * 0.245, 0.09, Math.cos(a) * 0.245], [0, 0, 0], 0.012); }
  b.add(b.rbox(0.16, 0.12, 0.04, 0.01), 'aux0', 'glow', [0, -0.18, -0.225]);
  for (let i = 0; i < 4; i++) b.add(b.box(0.012, 0.13, 0.02), 'aux0', 'mech', [-0.06 + i * 0.04, -0.18, -0.245]);
  b.add(b.rbox(0.2, 0.03, 0.06, 0.01), 'aux0', 'trim', [0, -0.1, -0.235]);
  // chimney + whistle
  b.add(b.cyl(0.05, 0.062, 0.36, 12), 'aux0', 'mech', [0.1, 0.52, -0.06]);
  b.add(ringH(b, 0.066, 0.016, 16), 'aux0', 'trim', [0.1, 0.7, -0.06]);
  b.add(ringH(b, 0.04, 0.01, 12), 'aux0', 'glow', [0.1, 0.705, -0.06]);
  b.add(b.cyl(0.018, 0.022, 0.13, 8), 'aux0', 'trim', [-0.11, 0.45, 0.02]);
  b.add(b.sph(8, 6), 'aux0', 'trim', [-0.11, 0.52, 0.02], [0, 0, 0], [0.028, 0.02, 0.028]);
  // steam vents curling over both shoulders (sockets ventL/ventR sit at the outlets)
  b.sym(rod(b, [0.15, 0.26, 0.08], [0.25, 0.52, 0.14], 0.026, 8), 'aux0', 'mech');
  b.sym(b.cyl(0.04, 0.03, 0.06, 10), 'aux0', 'trim', [0.255, 0.55, 0.145], [0.2, 0, -0.35]);
  // pressure gauges: two on the boiler shoulders (read from the overhead camera), one on the chest
  for (const sx of [1, -1]) {
    const p = [0.14 * sx, 0.32, 0.1], r = [0.25, 0, -0.55 * sx];
    b.add(b.cyl(0.07, 0.07, 0.014, 20), 'aux0', 'gauge', p, r);
    b.add(b.tor(0.072, 0.013, 20, 6).rotateX(PI / 2), 'aux0', 'trim', p, r);
  }
  b.add(b.cyl(0.055, 0.055, 0.012, 20), 'chest', 'gauge', [0.13, 0.25, 0.2], [PI / 2 - 0.25, 0, 0]);
  b.add(b.tor(0.057, 0.011, 20, 6), 'chest', 'trim', [0.13, 0.25, 0.2], [-0.25, 0, 0]);
  // brass knuckles and a bowler hat (he's a gangster who thinks he's a comedian)
  b.sym(b.rbox(0.17, 0.05, 0.17, 0.015), 'hand', 'trim', [0, -0.03, 0.01]);
  b.add(b.cyl(0.17, 0.17, 0.014, 24), 'head', 'mech', [0, 0.185, 0.01], [0.08, 0, 0.1]);
  b.add(b.lathe([[0, 0.3], [0.09, 0.29], [0.105, 0.24], [0.11, 0.19], [0, 0.19]], 20), 'head', 'mech', [0.01, 0, 0.01], [0.08, 0, 0.1]);
  b.add(b.cyl(0.112, 0.112, 0.022, 20, true), 'head', 'trim', [0.018, 0.2, 0.016], [0.08, 0, 0.1]);
}

export function kettleMats() {
  return {
    body: mat('kettle_body', { color: 0x8f959e, metal: 1, rough: 0.2, coat: 0.3 }),
    trim: mat('kettle_brass', { color: 0xdaa546, metal: 1, rough: 0.24 }),
    mech: mat('kettle_mech', { color: 0x141518, metal: 0.8, rough: 0.4 }),
    boiler: mat('kettle_boiler', { color: 0xc27744, metal: 1, rough: 0.3, coat: 0.4 }),
    gauge: mat('kettle_gauge', { color: 0xffffff, metal: 0, rough: 0.2, map: gaugeTex(), emissive: 0xffffff, ei: 0.35, emap: gaugeTex() }),
    glow: glow('kettle_fire', 0xff6418, 4),
    eye: glow('kettle_eye', 0xffa030, 4),
  };
}
