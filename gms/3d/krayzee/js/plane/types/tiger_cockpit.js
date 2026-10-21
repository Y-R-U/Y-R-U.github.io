import * as THREE from 'three';
import { Builder, srgb, sweepRings, circle } from '../geom.js';
import { createInstruments } from '../instruments.js';
import { pbrMaterial, RM, M4, rod, fan, canvasTexture, noiseFill } from './kit.js';
import { fus, fusPt, fusHalfWidth } from './tiger.js';

// Rear (pilot's) cockpit of the Tiger Moth: black plywood panel with brass-bezelled period gauges, P-type compass,
// stick, left-wall throttle quadrant, rudder bar. Build frame (see tiger.js).
const PS = 2.93, PY0 = 1.36, PX = 0.37, PTOP = 1.8;
const GAUGES = { asi: [-0.215, 1.67, 0.084], tc: [-0.072, 1.68, 0.084], alt: [0.072, 1.68, 0.084], tach: [0.215, 1.67, 0.084] };
const DIALS = [['oil', -0.075, 1.52, 0.052], ['clock', 0.075, 1.52, 0.048]];
export const THROTTLE = { x: -0.335, y: 1.2, s: 3.18, len: 0.15 };
export const throttleKnob = (th) => { const a = (0.5 - th) * 0.95; return [THROTTLE.x + 0.03, THROTTLE.y + Math.cos(a) * THROTTLE.len, THROTTLE.s + Math.sin(a) * THROTTLE.len]; };

function panelCanvas(quality) {
  const W = quality === 'low' ? 512 : 1024, H = W * ((PTOP - PY0) / (2 * PX));
  const c = document.createElement('canvas'); c.width = W; c.height = Math.round(H);
  const g = c.getContext('2d');
  const kx = W / (2 * PX), ky = c.height / (PTOP - PY0);
  g.setTransform(kx, 0, 0, -ky, PX * kx, PTOP * ky);
  // black-painted plywood with grain showing through the worn paint
  g.fillStyle = '#1b1a18'; g.fillRect(-PX, PY0, 2 * PX, PTOP - PY0);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 160; i++) { g.strokeStyle = `rgba(${90 + Math.random() * 40},${60 + Math.random() * 20},30,${0.03 + Math.random() * 0.04})`; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); const y = Math.random() * c.height; g.moveTo(0, y); g.bezierCurveTo(W * 0.3, y + 6 * Math.sin(i), W * 0.6, y - 5, W, y + 3); g.stroke(); }
  noiseFill(g, 0, 0, W, c.height, 5000 * (W / 1024), 0.12, false);
  g.restore();
  const txt = (s, x, y, size, col = '#e6dcc0', weight = '700') => {
    g.save(); g.translate(x, y); g.scale(1 / 1000, -1 / 1000);
    g.font = `${weight} ${size * 1000}px Georgia, 'Times New Roman', serif`; g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(s, 0, 0); g.restore();
  };
  const hole = (x, y, d) => {
    g.fillStyle = '#050505'; g.beginPath(); g.arc(x, y, d / 2 + 0.006, 0, 7); g.fill();
    g.fillStyle = '#8a6a32';
    for (const a of [0.8, 2.4, 3.9, 5.5]) { g.beginPath(); g.arc(x + Math.cos(a) * (d / 2 + 0.013), y + Math.sin(a) * (d / 2 + 0.013), 0.0035, 0, 7); g.fill(); }
  };
  for (const [x, y, d] of Object.values(GAUGES)) hole(x, y, d);
  for (const [, x, y, d] of DIALS) hole(x, y, d);
  for (const [k, label] of [['asi', 'AIR SPEED'], ['tc', 'TURN & SLIP'], ['alt', 'ALTIMETER'], ['tach', 'R.P.M.']]) txt(label, GAUGES[k][0], GAUGES[k][1] - GAUGES[k][2] / 2 - 0.026, 0.0115);
  txt('OIL', DIALS[0][1], DIALS[0][2] - 0.04, 0.01);
  // static dials: oil pressure and an eight-day clock
  const dial = (kind, x, y, d) => {
    const r = d / 2;
    g.save(); g.translate(x, y); g.scale(r, r);
    g.fillStyle = kind === 'clock' ? '#e9e1c9' : '#0f0f0f'; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill();
    g.strokeStyle = kind === 'clock' ? '#222' : '#eee'; g.lineWidth = 0.06;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 0.9, Math.sin(a) * 0.9); g.lineTo(Math.cos(a) * 0.72, Math.sin(a) * 0.72); g.stroke(); }
    g.lineWidth = 0.09; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(kind === 'clock' ? 1.2 : 0.6) * 0.7, Math.sin(kind === 'clock' ? 1.2 : 0.6) * 0.7); g.stroke();
    if (kind === 'clock') { g.beginPath(); g.moveTo(0, 0); g.lineTo(-0.35, -0.3); g.stroke(); }
    g.restore();
  };
  for (const [k, x, y, d] of DIALS) dial(k, x, y, d);
  // magneto switches, placards
  g.fillStyle = '#c9a75a'; g.beginPath(); g.roundRect(-0.27, 1.49, 0.09, 0.05, 0.005); g.fill();
  g.fillStyle = '#211f1b'; g.beginPath(); g.roundRect(-0.265, 1.495, 0.08, 0.04, 0.004); g.fill();
  txt('MAGS', -0.225, 1.555, 0.0095);
  txt('1     2', -0.225, 1.48, 0.008);
  g.fillStyle = '#d8ccab'; g.beginPath(); g.roundRect(-0.13, 1.4, 0.26, 0.04, 0.004); g.fill();
  txt('BY ROYAL WARRANT', 0, 1.428, 0.0105, '#2a2418');
  txt('NO LOOPS WITHOUT A HAT', 0, 1.411, 0.0085, '#2a2418', '600');
  g.fillStyle = '#d8ccab'; g.beginPath(); g.roundRect(0.17, 1.5, 0.11, 0.032, 0.003); g.fill();
  txt('FUEL: LOOK UP', 0.225, 1.516, 0.0082, '#2a2418');
  g.fillStyle = '#d8ccab'; g.beginPath(); g.roundRect(-0.06, 1.745, 0.12, 0.028, 0.003); g.fill();
  txt('DH 82A  ·  K', 0, 1.759, 0.0095, '#2a2418');
  return canvasTexture(c);
}

const COL = {
  steel: srgb('#5b5f63'), black: srgb('#0f1012'), brass: srgb('#c99d48'), leather: srgb('#4a2b18'), wood: srgb('#5d3018'),
  red: srgb('#9c1b1b'), card: srgb('#e3d9bd'), glass: srgb('#20262a'),
};

export function buildTigerCockpit(quality, mats, ctx) {
  const high = quality === 'high';
  const n = (k) => Math.max(6, Math.round(k * (high ? 1 : 0.6)));
  const group = new THREE.Group();
  group.name = 'tiger-cockpit';
  const B = new Builder();

  // panel board (textured) with an arched top under the coaming
  const panelTex = panelCanvas(quality);
  const sec = fus(PS), outline = [];
  for (let k = 0; k <= 4; k++) { const y = PY0 + (sec.yw - PY0) * (k / 4); outline.push([fusHalfWidth(PS, y) - 0.02, y, PS]); }
  for (let k = 1; k < 16; k++) outline.push(fusPt(sec, PS, Math.PI / 2 - (Math.PI * k) / 16, 0.025));
  for (let k = 4; k >= 0; k--) { const y = PY0 + (sec.yw - PY0) * (k / 4); outline.push([-(fusHalfWidth(PS, y) - 0.02), y, PS]); }
  const pb = new Builder();
  fan(pb, outline, [0, 0, 1], (p) => [(p[0] + PX) / (2 * PX), (p[1] - PY0) / (PTOP - PY0)]);
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.55, metalness: 0, emissive: 0x000000, emissiveMap: panelTex, emissiveIntensity: 0 });
  const panel = new THREE.Mesh(pb.build(), panelMat);
  panel.name = 'panel';
  group.add(panel);
  // brass bezels
  for (const [x, y, d] of [...Object.values(GAUGES), ...DIALS.map(([, x, y, d]) => [x, y, d])]) {
    B.addGeo(new THREE.TorusGeometry(d / 2 + 0.004, 0.0055, n(6), n(24)), M4(x, y, PS + 0.004), RM.brass, COL.brass);
    if (high) for (const a of [0.8, 2.4, 3.9, 5.5]) B.addGeo(new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 6), M4(x + Math.cos(a) * (d / 2 + 0.013), y + Math.sin(a) * (d / 2 + 0.013), PS + 0.003, 1, 1, 1, Math.PI / 2, 0, 0), RM.brass, COL.brass);
  }
  // mag toggles
  for (const dx of [-0.245, -0.205]) B.addGeo(new THREE.CylinderGeometry(0.003, 0.004, 0.03, 6), M4(dx, 1.52, PS + 0.016, 1, 1, 1, Math.PI / 2 - 0.4, 0, 0), RM.chrome, srgb('#d6d9dc'));
  // P-type compass on the floor under the panel
  B.addGeo(new THREE.CylinderGeometry(0.075, 0.06, 0.07, n(20)), M4(0, 1.27, 3.0), RM.black, COL.black);
  B.addGeo(new THREE.SphereGeometry(0.068, n(18), n(8), 0, Math.PI * 2, 0, Math.PI / 2), M4(0, 1.305, 3.0, 1, 0.45, 1), RM.glass, COL.glass);
  B.addGeo(new THREE.TorusGeometry(0.07, 0.006, 6, n(20)), M4(0, 1.306, 3.0, 1, 1, 1, Math.PI / 2, 0, 0), RM.brass, COL.brass);
  if (high) for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; B.addGeo(new THREE.BoxGeometry(0.004, 0.002, 0.03), M4(Math.cos(a) * 0.04, 1.31, 3.0 + Math.sin(a) * 0.04, 1, 1, 1, 0, a, 0), RM.paint, COL.card); }
  rod(B, [0, 1.235, 3.0], [0, 1.0, 3.0], 0.012, 8, RM.black, COL.black);
  // throttle quadrant on the left wall
  B.addGeo(new THREE.BoxGeometry(0.02, 0.05, 0.22), M4(THROTTLE.x, THROTTLE.y + 0.08, THROTTLE.s), RM.brass, COL.brass);
  B.addGeo(new THREE.BoxGeometry(0.012, 0.012, 0.18), M4(THROTTLE.x + 0.011, THROTTLE.y + 0.105, THROTTLE.s), RM.black, COL.black);
  // trim lever + cable runs, seat harness hint
  B.addGeo(new THREE.BoxGeometry(0.018, 0.04, 0.12), M4(-0.33, 1.13, 3.38), RM.brass, COL.brass);
  rod(B, [-0.33, 1.15, 3.36], [-0.3, 1.22, 3.3], 0.005, 6, RM.black, COL.black);
  const cpMat = pbrMaterial('tiger-cockpit');
  const interior = new THREE.Mesh(B.build(), cpMat);
  interior.name = 'cockpit-detail'; interior.receiveShadow = true;
  group.add(interior);

  // live gauges (shared C172 instrument atlas, four of its dials)
  const inst = createInstruments({ quality });
  const gq = new Builder();
  for (const [k, [x, y, d]] of Object.entries(GAUGES)) {
    const [u0, v0, u1, v1] = inst.cells[k], r = d / 2, z = PS + 0.0015;
    const a = gq.v([x - r, y - r, z], [0, 0, 1], [u0, v0]), b = gq.v([x + r, y - r, z], [0, 0, 1], [u1, v0]);
    const c = gq.v([x + r, y + r, z], [0, 0, 1], [u1, v1]), e = gq.v([x - r, y + r, z], [0, 0, 1], [u0, v1]);
    gq.t(a, b, c); gq.t(a, c, e);
  }
  const gaugeMat = new THREE.MeshStandardMaterial({ map: inst.texture, emissiveMap: inst.texture, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.2, metalness: 0, alphaTest: 0.5 });
  {
    const m = document.createElement('canvas'); m.width = 256; m.height = 128;
    const mg = m.getContext('2d');
    mg.fillStyle = '#000'; mg.fillRect(0, 0, 256, 128); mg.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { mg.beginPath(); mg.arc(32 + i * 64, 32 + j * 64, 31.5, 0, 7); mg.fill(); }
    gaugeMat.alphaMap = new THREE.CanvasTexture(m);
  }
  const gauges = new THREE.Mesh(gq.build(), gaugeMat);
  gauges.name = 'gauges';
  group.add(gauges);
  inst.attach?.(gauges);

  // stick (child of the rig's stick pivot so the pilot's hand follows it)
  const sb = new Builder();
  sb.addGeo(new THREE.ConeGeometry(0.06, 0.09, n(12), 1, true), M4(0, 0.045, 0), RM.leatherWorn, COL.leather);
  sb.addGeo(new THREE.CylinderGeometry(0.011, 0.013, 0.38, n(8)), M4(0, 0.2, 0), RM.steel, COL.steel);
  sb.addGeo(new THREE.CylinderGeometry(0.02, 0.019, 0.11, n(12)), M4(0, 0.43, 0), RM.rubber, COL.black);
  sb.addGeo(new THREE.SphereGeometry(0.02, n(10), n(6)), M4(0, 0.485, 0), RM.rubber, COL.black);
  if (high) sb.addGeo(new THREE.BoxGeometry(0.012, 0.03, 0.018), M4(0, 0.44, -0.024), RM.brass, COL.brass);
  const stickMesh = new THREE.Mesh(sb.build(), cpMat);
  stickMesh.name = 'stick';
  ctx.stick.add(stickMesh);

  const throttle = new THREE.Group();
  throttle.position.set(THROTTLE.x + 0.03, THROTTLE.y, THROTTLE.s);
  {
    const tb = new Builder();
    tb.addGeo(new THREE.BoxGeometry(0.01, THROTTLE.len, 0.016), M4(0, THROTTLE.len / 2, 0), RM.steel, COL.steel);
    tb.addGeo(new THREE.SphereGeometry(0.019, n(10), n(8)), M4(0, THROTTLE.len, 0, 1, 0.8, 1.2), RM.varnish, COL.wood);
    throttle.add(new THREE.Mesh(tb.build(), cpMat));
  }
  group.add(throttle);
  const rudderBar = new THREE.Group();
  rudderBar.position.set(0, 1.02, 2.68);
  {
    const rb = new Builder();
    rb.addGeo(new THREE.BoxGeometry(0.46, 0.025, 0.035), M4(0, 0, 0), RM.steel, COL.steel);
    for (const sg of [-1, 1]) {
      rb.addGeo(new THREE.BoxGeometry(0.09, 0.06, 0.012), M4(sg * 0.19, 0.035, -0.02, 1, 1, 1, -0.3, 0, 0), RM.steel, COL.steel);
      rb.addGeo(new THREE.TorusGeometry(0.04, 0.005, 4, 10, Math.PI), M4(sg * 0.19, 0.06, 0.0, 1, 1, 1, 0, 0, 0), RM.leather, COL.leather);
    }
    rb.addGeo(new THREE.CylinderGeometry(0.02, 0.02, 0.05, 10), M4(0, -0.03, 0), RM.steel, COL.steel);
    rudderBar.add(new THREE.Mesh(rb.build(), cpMat));
  }
  group.add(rudderBar);

  function setNight(nn) {
    nn = Math.max(0, Math.min(1, nn));
    gaugeMat.emissiveIntensity = 0.25 + nn * 0.8;
    gaugeMat.emissive.setRGB(1, 1 - nn * 0.1, 1 - nn * 0.25);
    panelMat.emissive.setRGB(0.5, 0.42, 0.3);
    panelMat.emissiveIntensity = nn * 0.25;
  }
  // open cockpit: the dials stay visible from outside
  const detail = [throttle, rudderBar];
  function setDetail(on) { for (const o of detail) o.visible = on; }
  function update(dt, cur) {
    throttle.rotation.x = (0.5 - cur.throttle) * 0.95;
    rudderBar.rotation.y = cur.rudder * 0.22;
    inst.update(dt);
  }
  return {
    group, instruments: inst, update, setNight, setDetail,
    dispose() { panelTex.dispose(); panelMat.dispose(); gaugeMat.alphaMap.dispose(); gaugeMat.dispose(); cpMat.dispose(); inst.dispose(); stickMesh.geometry.dispose(); stickMesh.removeFromParent(); },
  };
}
