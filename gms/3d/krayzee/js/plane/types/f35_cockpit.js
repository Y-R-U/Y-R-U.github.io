import * as THREE from 'three';
import { Builder, srgb, lerp } from '../geom.js';
import { createInstruments } from '../instruments.js';
import { pbrMaterial, RM, M4, rod, canvasTexture } from './kit.js';
import { HOLE, surfY } from './f35.js';

// F-35-ish single-seat cockpit: tub, ejection seat, side consoles, one big glass panoramic display (canvas) with four
// live dials from the shared instrument atlas, glareshield, a gold HUD frame with a conformal pitch ladder.
// Build frame as in f35.js (y up from the ground, z = station aft of the radome tip).
export const SEAT = { x: 0, y: 2.38, s: 4.78 };
export const STICK = [0.35, 2.5, 4.5];
export const THROTTLE = { x: -0.35, y: 2.5, s: 4.62, travel: 0.14 };
export const throttleKnob = (th) => [THROTTLE.x, THROTTLE.y + 0.14, THROTTLE.s - THROTTLE.travel * th];
// panel: bottom edge centre, tilted back; local x right, local y up the panel face
const PANEL = { y: 2.4, s: 3.5, w: 0.84, h: 0.36, tilt: -0.34 };
const GAUGES = { asi: [-0.33, 0.185, 0.1], ai: [-0.19, 0.185, 0.15], alt: [-0.05, 0.185, 0.1], dg: [0.335, 0.125, 0.1] };
const HUD = { s: 3.58, y0: 2.81, y1: 2.975, hw: 0.105, tilt: 0.26 };
const FLOOR = 2.02;
const D2R = Math.PI / 180;

const CC = {
  tub: srgb('#3a3e44'), tubDark: srgb('#272a2f'), console: srgb('#2c2f34'), seat: srgb('#2d3036'), cushion: srgb('#4a4436'),
  black: srgb('#0d0e10'), gold: srgb('#d4a743'), yellow: srgb('#e8c21a'), red: srgb('#b3202e'), grip: srgb('#1b1c1f'), metal: srgb('#8a8f95'),
};

function panelCanvas(quality) {
  const W = quality === 'low' ? 512 : 1024, H = Math.round(W * (PANEL.h / PANEL.w));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const k = W / PANEL.w;
  g.setTransform(k, 0, 0, -k, (PANEL.w / 2) * k, PANEL.h * k);
  g.fillStyle = '#07090c'; g.fillRect(-0.5, -0.1, 1, 0.6);
  const txt = (s, x, y, size, colr = '#7fe0a0', align = 'center', weight = '700', fam = "'Helvetica Neue', Arial, sans-serif") => {
    g.save(); g.translate(x, y); g.scale(1 / 1000, -1 / 1000);
    g.font = `${weight} ${size * 1000}px ${fam}`; g.fillStyle = colr; g.textAlign = align; g.textBaseline = 'middle';
    g.fillText(s, 0, 0); g.restore();
  };
  const rr = (x0, y0, x1, y1, r, fill, stroke) => { g.beginPath(); g.roundRect(x0, y0, x1 - x0, y1 - y0, r); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 0.003; g.stroke(); } };
  // two big glass windows
  rr(-0.41, 0.07, -0.006, 0.33, 0.01, '#0a1420', '#3d4a58');
  rr(0.006, 0.07, 0.41, 0.33, 0.01, '#0a1420', '#3d4a58');
  // left: flight window, labels under the live dials
  txt('FLIGHT', -0.4, 0.315, 0.014, '#9fd7ff', 'left');
  for (const [k, l] of [['asi', 'SPEED'], ['ai', 'ATTITUDE'], ['alt', 'ALTITUDE']]) { const [x, y, d] = GAUGES[k]; g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, d / 2 + 0.004, 0, 7); g.fill(); txt(l, x, y - d / 2 - 0.016, 0.0105, '#9fd7ff'); }
  txt('G 1.0   AOA 4.2', -0.21, 0.085, 0.011, '#7fe0a0');
  // right: the royal estate moving map
  g.save(); g.beginPath(); g.roundRect(0.012, 0.076, 0.392, 0.248, 0.008); g.clip();
  g.fillStyle = '#1f3d22'; g.fillRect(0, 0, 0.42, 0.34);
  g.fillStyle = '#2b5230';
  for (const [x, y, w, h] of [[0.04, 0.2, 0.09, 0.06], [0.16, 0.24, 0.12, 0.05], [0.07, 0.1, 0.08, 0.05], [0.25, 0.12, 0.06, 0.07]]) g.fillRect(x, y, w, h);
  g.strokeStyle = '#3f86c9'; g.lineWidth = 0.008; g.beginPath(); g.moveTo(0.0, 0.27); g.bezierCurveTo(0.12, 0.22, 0.2, 0.31, 0.42, 0.18); g.stroke();
  g.strokeStyle = '#c9b48a'; g.lineWidth = 0.003; g.beginPath(); g.moveTo(0.02, 0.09); g.lineTo(0.2, 0.2); g.lineTo(0.4, 0.26); g.moveTo(0.2, 0.2); g.lineTo(0.22, 0.33); g.stroke();
  // castle + "you are here"
  g.fillStyle = '#d4a743';
  g.fillRect(0.185, 0.2, 0.04, 0.025); for (const x of [0.185, 0.198, 0.211]) g.fillRect(x, 0.225, 0.008, 0.008);
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0.14, 0.17); g.lineTo(0.13, 0.145); g.lineTo(0.15, 0.145); g.closePath(); g.fill();
  g.restore();
  txt('ROYAL ESTATE 1:50K', 0.02, 0.315, 0.012, '#9fd7ff', 'left');
  txt('YOU (YOUR MAJESTY)', 0.14, 0.13, 0.0095, '#ffffff');
  txt('STEALTH: MODEST', 0.02, 0.1, 0.011, '#7fe0a0', 'left');
  txt('TEA: 2 CUPS', 0.15, 0.1, 0.011, '#7fe0a0', 'left');
  txt('CORGI: SECURE', 0.02, 0.085, 0.011, '#ffcf6a', 'left');
  // soft keys + warrant
  const keys = ['MAP', 'ENG', 'FUEL', 'HOVER', 'TEA', 'WAVE'];
  keys.forEach((s, i) => { const x = -0.38 + i * 0.152; rr(x - 0.05, 0.012, x + 0.05, 0.05, 0.004, '#121820', '#2f3a46'); txt(s, x, 0.031, 0.013, '#9fd7ff'); });
  txt("HIS MAJESTY'S PANORAMIC DISPLAY  -  BY ROYAL WARRANT", 0, 0.346, 0.0115, '#d4a743', 'center', 'italic 700', "Georgia, 'Times New Roman', serif");
  return canvasTexture(c);
}

function ladderCanvas(quality) {
  const W = quality === 'low' ? 128 : 256, H = W * 8;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = Math.max(1.5, W / 110);
  g.font = `700 ${Math.round(W / 13)}px 'Helvetica Neue', Arial, sans-serif`; g.textBaseline = 'middle';
  const y = (deg) => H / 2 - (deg / 180) * H;
  for (let d = -85; d <= 85; d += 5) {
    const yy = y(d);
    if (d === 0) { g.beginPath(); g.moveTo(W * 0.06, yy); g.lineTo(W * 0.4, yy); g.moveTo(W * 0.6, yy); g.lineTo(W * 0.94, yy); g.stroke(); continue; }
    g.setLineDash(d < 0 ? [W * 0.03, W * 0.02] : []);
    g.beginPath(); g.moveTo(W * 0.2, yy); g.lineTo(W * 0.4, yy); g.moveTo(W * 0.6, yy); g.lineTo(W * 0.8, yy);
    const tick = d > 0 ? W * 0.025 : -W * 0.025;
    g.moveTo(W * 0.2, yy); g.lineTo(W * 0.2, yy + tick); g.moveTo(W * 0.8, yy); g.lineTo(W * 0.8, yy + tick);
    g.stroke(); g.setLineDash([]);
    if (d % 10 === 0) { g.textAlign = 'right'; g.fillText(String(Math.abs(d)), W * 0.185, yy); g.textAlign = 'left'; g.fillText(String(Math.abs(d)), W * 0.815, yy); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.center.set(0.5, 0.5);
  return t;
}

// fixed HUD symbology: waterline, flight-path marker, bank scale, speed/altitude boxes, heading (redrawn at <= 5 Hz)
function hudFixed(quality) {
  const S = quality === 'low' ? 128 : 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  let key = '';
  function draw(spd, alt, hdg) {
    const k = `${spd}|${alt}|${hdg}`;
    if (k === key) return;
    key = k;
    g.setTransform(S, 0, 0, S, 0, 0);
    g.fillStyle = '#000'; g.fillRect(0, 0, 1, 1);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 0.008; g.lineJoin = 'round';
    // waterline "W"
    g.beginPath(); g.moveTo(0.4, 0.42); g.lineTo(0.45, 0.42); g.lineTo(0.475, 0.46); g.lineTo(0.5, 0.42); g.lineTo(0.525, 0.46); g.lineTo(0.55, 0.42); g.lineTo(0.6, 0.42); g.stroke();
    // flight path marker
    g.beginPath(); g.arc(0.5, 0.5, 0.025, 0, 7); g.moveTo(0.475, 0.5); g.lineTo(0.43, 0.5); g.moveTo(0.525, 0.5); g.lineTo(0.57, 0.5); g.moveTo(0.5, 0.475); g.lineTo(0.5, 0.45); g.stroke();
    // bank scale
    g.beginPath(); g.arc(0.5, 0.5, 0.36, Math.PI * 0.62, Math.PI * 0.38, true); g.stroke();
    for (const a of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) { const r = a * Math.PI / 180 + Math.PI / 2, l = a % 30 === 0 ? 0.04 : 0.02; g.beginPath(); g.moveTo(0.5 + Math.cos(r) * 0.36, 0.5 + Math.sin(r) * 0.36); g.lineTo(0.5 + Math.cos(r) * (0.36 + l), 0.5 + Math.sin(r) * (0.36 + l)); g.stroke(); }
    // speed and altitude boxes
    g.font = "700 0.055px 'Helvetica Neue', Arial, sans-serif"; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.strokeRect(0.06, 0.45, 0.17, 0.08); g.fillText(String(spd), 0.145, 0.492);
    g.strokeRect(0.75, 0.45, 0.2, 0.08); g.fillText(String(alt), 0.85, 0.492);
    g.font = "700 0.04px 'Helvetica Neue', Arial, sans-serif";
    g.fillText('KT', 0.145, 0.57); g.fillText('FT', 0.85, 0.57);
    // heading box + crown
    g.strokeRect(0.43, 0.04, 0.14, 0.07); g.font = "700 0.05px 'Helvetica Neue', Arial, sans-serif"; g.fillText(String(hdg).padStart(3, '0'), 0.5, 0.077);
    g.font = "italic 700 0.04px Georgia, serif"; g.fillText('HRH', 0.5, 0.93);
    tex.needsUpdate = true;
  }
  draw(0, 0, 0);
  return { tex, draw };
}

export function buildF35Cockpit(quality, mats, ctx) {
  const high = quality === 'high';
  const n = (k) => Math.max(6, Math.round(k * (high ? 1 : 0.6)));
  const group = new THREE.Group();
  const B = new Builder();
  const cpMat = pbrMaterial('f35-cockpit');
  cpMat.side = THREE.DoubleSide;

  // ---- tub: U-section walls from the canopy sill down to the floor, closed at both ends ----
  {
    const H = HOLE.cockpit, K = n(16), rings = [];
    for (let k = 0; k <= K; k++) {
      const s = lerp(H.s0 - 0.02, H.s1 + 0.02, k / K), w = H.hw(s) + 0.02, top = surfY(s, w) - 0.005;
      const r = [[w, top, s], [w, FLOOR + 0.1, s], [w - 0.05, FLOOR, s], [-w + 0.05, FLOOR, s], [-w, FLOOR + 0.1, s], [-w, top, s]];
      rings.push(r);
    }
    B.loft(rings, { closed: false, out: (p) => [-p[0], -(p[1] - 2.4), 0], color: (p) => (p[1] < FLOOR + 0.02 ? CC.tubDark : CC.tub), uv: () => RM.paint, capStart: true, capEnd: true });
  }
  // side consoles
  for (const sg of [-1, 1]) {
    B.addGeo(new THREE.BoxGeometry(0.14, 0.46, 1.25), M4(sg * 0.335, FLOOR + 0.23, 4.7), RM.plastic, CC.console);
    if (high) for (let i = 0; i < 5; i++) B.addGeo(new THREE.BoxGeometry(0.1, 0.006, 0.12), M4(sg * 0.335, FLOOR + 0.463, 4.25 + i * 0.2), RM.plastic, i % 2 ? CC.black : CC.metal);
  }
  // ejection seat: pan, cushion, tilted back, headrest, side rails, yellow-and-black firing handle
  {
    const S = SEAT;
    B.addGeo(new THREE.BoxGeometry(0.46, 0.1, 0.48), M4(0, S.y - 0.1, S.s - 0.06), RM.plastic, CC.seat);
    B.addGeo(new THREE.BoxGeometry(0.4, 0.05, 0.42), M4(0, S.y - 0.03, S.s - 0.07), RM.cloth, CC.cushion);
    const back = new THREE.Matrix4().compose(new THREE.Vector3(0, S.y + 0.38, S.s + 0.23), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, 0, 0)), new THREE.Vector3(1, 1, 1));
    B.addGeo(new THREE.BoxGeometry(0.44, 0.82, 0.1), back, RM.plastic, CC.seat);
    B.addGeo(new THREE.BoxGeometry(0.38, 0.6, 0.04), back.clone().multiply(new THREE.Matrix4().makeTranslation(0, -0.05, -0.06)), RM.cloth, CC.cushion);
    B.addGeo(new THREE.BoxGeometry(0.3, 0.2, 0.14), M4(0, S.y + 0.86, S.s + 0.37, 1, 1, 1, -0.2, 0, 0), RM.plastic, CC.seat);
    for (const sg of [-1, 1]) B.addGeo(new THREE.BoxGeometry(0.04, 1.0, 0.06), M4(sg * 0.24, S.y + 0.36, S.s + 0.3, 1, 1, 1, -0.2, 0, 0), RM.steel, CC.metal);
    B.addGeo(new THREE.TorusGeometry(0.055, 0.012, n(6), n(14), Math.PI), M4(0, S.y - 0.06, S.s - 0.31, 1, 1, 1, 0, 0, 0), RM.plastic, CC.yellow);
  }
  // panel bezel + glareshield + gold HUD frame
  const pm = new THREE.Matrix4().compose(new THREE.Vector3(0, PANEL.y, PANEL.s), new THREE.Quaternion().setFromEuler(new THREE.Euler(PANEL.tilt, 0, 0)), new THREE.Vector3(1, 1, 1));
  B.addGeo(new THREE.BoxGeometry(PANEL.w + 0.04, PANEL.h + 0.04, 0.05), pm.clone().multiply(new THREE.Matrix4().makeTranslation(0, PANEL.h / 2, -0.03)), RM.plastic, CC.black);
  B.addGeo(new THREE.BoxGeometry(PANEL.w + 0.02, 0.3, 0.3), M4(0, PANEL.y - 0.15, PANEL.s - 0.14), RM.black, CC.black);
  const gsY = PANEL.y + PANEL.h * Math.cos(PANEL.tilt) + 0.02, gsS = PANEL.s + PANEL.h * Math.sin(PANEL.tilt);
  B.addGeo(new THREE.BoxGeometry(PANEL.w + 0.02, 0.035, 0.3), M4(0, gsY, gsS + 0.11, 1, 1, 1, -0.08, 0, 0), RM.leather, CC.tubDark);
  B.addGeo(new THREE.CylinderGeometry(0.022, 0.022, PANEL.w + 0.02, n(10)), M4(0, gsY - 0.005, gsS + 0.255, 1, 1, 1, 0, 0, Math.PI / 2), RM.leather, CC.tubDark);
  {
    const ht = HUD.tilt, top = [0, HUD.y1, HUD.s + (HUD.y1 - HUD.y0) * Math.tan(ht)];
    for (const sg of [-1, 1]) rod(B, [sg * (HUD.hw + 0.012), gsY + 0.01, HUD.s - 0.02], [sg * (HUD.hw + 0.012), top[1] + 0.01, top[2]], 0.007, 6, RM.goldSatin, CC.gold);
    rod(B, [-(HUD.hw + 0.012), top[1] + 0.012, top[2]], [HUD.hw + 0.012, top[1] + 0.012, top[2]], 0.007, 6, RM.goldSatin, CC.gold);
    B.addGeo(new THREE.BoxGeometry(2 * HUD.hw + 0.05, 0.03, 0.09), M4(0, gsY + 0.02, HUD.s - 0.03), RM.plastic, CC.black);
  }
  const tub = new THREE.Mesh(B.build(), cpMat);
  tub.name = 'cockpit-tub'; tub.receiveShadow = true;
  group.add(tub);

  // ---- panoramic display + live dials ----
  const panelTex = panelCanvas(quality);
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, emissiveMap: panelTex, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.18, metalness: 0 });
  const board = new THREE.Group();
  board.position.set(0, PANEL.y, PANEL.s); board.rotation.x = PANEL.tilt;
  const pg = new THREE.PlaneGeometry(PANEL.w, PANEL.h); pg.translate(0, PANEL.h / 2, 0.001);
  const panelMesh = new THREE.Mesh(pg, panelMat);
  panelMesh.name = 'panel';
  board.add(panelMesh);
  const inst = createInstruments({ quality });
  const gq = new Builder();
  for (const [k, [x, y, d]] of Object.entries(GAUGES)) {
    const [u0, v0, u1, v1] = inst.cells[k], r = d / 2, z = 0.004;
    const a = gq.v([x - r, y - r, z], [0, 0, 1], [u0, v0]), b = gq.v([x + r, y - r, z], [0, 0, 1], [u1, v0]);
    const c = gq.v([x + r, y + r, z], [0, 0, 1], [u1, v1]), dd = gq.v([x - r, y + r, z], [0, 0, 1], [u0, v1]);
    gq.t(a, b, c); gq.t(a, c, dd);
  }
  const gaugeMat = new THREE.MeshStandardMaterial({ map: inst.texture, emissiveMap: inst.texture, emissive: 0xffffff, emissiveIntensity: 0.45, roughness: 0.2, metalness: 0, alphaTest: 0.5 });
  {
    const m = document.createElement('canvas'); m.width = 256; m.height = 128;
    const mg = m.getContext('2d'); mg.fillStyle = '#000'; mg.fillRect(0, 0, 256, 128); mg.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { mg.beginPath(); mg.arc(32 + i * 64, 32 + j * 64, 31.5, 0, 7); mg.fill(); }
    gaugeMat.alphaMap = new THREE.CanvasTexture(m);
  }
  const gauges = new THREE.Mesh(gq.build(), gaugeMat);
  gauges.name = 'gauges';
  board.add(gauges);
  inst.attach?.(gauges);
  group.add(board);

  // ---- HUD: conformal pitch ladder (uv-scrolled + rotated, no redraw) and the fixed symbology ----
  const ladder = ladderCanvas(quality);
  const fixed = hudFixed(quality);
  const hudGeo = () => {
    const g = new THREE.PlaneGeometry(2 * HUD.hw, HUD.y1 - HUD.y0);
    g.rotateX(-HUD.tilt);
    g.translate(0, (HUD.y0 + HUD.y1) / 2, HUD.s + ((HUD.y1 - HUD.y0) / 2) * Math.tan(HUD.tilt));
    return g;
  };
  const hm = (map, opacity) => new THREE.MeshBasicMaterial({ map, color: 0x6dff9a, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const ladderMat = hm(ladder, 0.85), fixedMat = hm(fixed.tex, 0.9);
  const hudL = new THREE.Mesh(hudGeo(), ladderMat), hudF = new THREE.Mesh(hudGeo(), fixedMat);
  hudL.name = 'hud-ladder'; hudF.name = 'hud-fixed'; hudL.renderOrder = hudF.renderOrder = 6;
  // the visible slice of the ladder: the HUD glass subtends ~8.4 deg from the eye
  const hudSpanDeg = 2 * Math.atan((HUD.y1 - HUD.y0) / 2 / (SEAT.s - HUD.s - 0.08)) / D2R;
  ladder.repeat.set(1, hudSpanDeg / 180);
  group.add(hudL, hudF);
  const hud = { pitch: 0, roll: 0, tp: 0, tr: 0, spd: 0, alt: 0, hdg: 0, acc: 1 };
  hudF.onBeforeRender = () => { if (hud.acc < 0.2) return; hud.acc = 0; fixed.draw(Math.round(hud.spd), Math.round(hud.alt / 10) * 10, Math.round(hud.hdg) % 360); };

  // ---- sidestick (on the rig's stick pivot) + throttle inceptor ----
  const sb = new Builder();
  sb.addGeo(new THREE.CylinderGeometry(0.035, 0.045, 0.04, n(12)), M4(0, 0.0, 0), RM.rubber, CC.black);
  sb.addGeo(new THREE.CylinderGeometry(0.016, 0.02, 0.07, n(10)), M4(0, 0.04, 0), RM.steel, CC.metal);
  sb.addGeo(new THREE.CylinderGeometry(0.022, 0.026, 0.1, n(10)), M4(0, 0.11, 0.005, 1, 1, 1.2, 0.15, 0, 0), RM.rubber, CC.grip);
  sb.addGeo(new THREE.BoxGeometry(0.012, 0.025, 0.012), M4(0, 0.1, -0.025), RM.plastic, CC.red);
  sb.addGeo(new THREE.SphereGeometry(0.012, 8, 6), M4(0, 0.165, 0.005), RM.gold, CC.gold);
  const stickMesh = new THREE.Mesh(sb.build(), cpMat);
  stickMesh.name = 'stick';
  ctx.stick.add(stickMesh);
  const throttle = new THREE.Group();
  throttle.position.set(THROTTLE.x, THROTTLE.y, THROTTLE.s);
  {
    const tb = new Builder();
    tb.addGeo(new THREE.BoxGeometry(0.03, 0.1, 0.05), M4(0, 0.05, 0), RM.steel, CC.metal);
    tb.addGeo(new THREE.BoxGeometry(0.05, 0.06, 0.09), M4(0, 0.13, 0.0, 1, 1, 1, 0.1, 0, 0), RM.rubber, CC.grip);
    tb.addGeo(new THREE.SphereGeometry(0.01, 8, 6), M4(0.02, 0.16, -0.03), RM.gold, CC.gold);
    throttle.add(new THREE.Mesh(tb.build(), cpMat));
  }
  group.add(throttle);
  const detail = [gauges, hudL, hudF, stickMesh, throttle];
  const instruments = {
    set(s) {
      inst.set(s);
      if (typeof s.pitch === 'number') hud.tp = s.pitch;
      if (typeof s.roll === 'number') hud.tr = s.roll;
      if (typeof s.airspeed === 'number') hud.spd = s.airspeed;
      if (typeof s.altitude === 'number') hud.alt = s.altitude;
      if (typeof s.heading === 'number') hud.hdg = ((s.heading % 360) + 360) % 360;
    },
  };
  function setNight(k) {
    k = Math.max(0, Math.min(1, k));
    panelMat.emissiveIntensity = 0.55 + 0.45 * k;
    gaugeMat.emissiveIntensity = 0.45 + 0.6 * k;
    ladderMat.opacity = 0.85 - 0.35 * k; fixedMat.opacity = 0.9 - 0.35 * k;
  }
  return {
    group, instruments, setNight,
    setDetail(on) { for (const o of detail) o.visible = on; },
    update(dt, cur) {
      throttle.position.z = THROTTLE.s - THROTTLE.travel * cur.throttle;
      inst.update(dt);
      const e = 1 - Math.exp(-dt * 10);
      hud.pitch += (hud.tp - hud.pitch) * e; hud.roll += (hud.tr - hud.roll) * e; hud.acc += dt;
      ladder.offset.set(0, hud.pitch / Math.PI);
      ladder.rotation = hud.roll;
    },
    dispose() {
      panelTex.dispose(); panelMat.dispose(); gaugeMat.alphaMap.dispose(); gaugeMat.dispose(); cpMat.dispose(); inst.dispose();
      ladder.dispose(); fixed.tex.dispose(); ladderMat.dispose(); fixedMat.dispose(); stickMesh.geometry.dispose(); stickMesh.removeFromParent();
    },
  };
}
