import * as THREE from 'three';
import { Builder, sweepRings, circle, srgb, lerp } from './geom.js';
import { WINDOWS, PANEL, EYE } from './spec.js';
import { fusSec, ringPoint, fusHalfWidth } from './exterior.js';
import { createInstruments, GAUGES } from './instruments.js';

const COL = {
  lining: srgb('#a9a397'), liningUp: srgb('#7d7a74'), liningDark: srgb('#77726a'), carpet: srgb('#3a3c41'), head: srgb('#cdc8bd'),
  glare: srgb('#141517'), seat: srgb('#6d5440'), seatDark: srgb('#4a3a2e'), frame: srgb('#2a2b2e'),
  black: srgb('#0e0f11'), chrome: srgb('#c9ced3'), white: srgb('#eeeeea'), red: srgb('#c0262b'),
  bezel: srgb('#18191b'), shaft: srgb('#7f8388'), trim: srgb('#4a4945'), knob: srgb('#151617'), panel: srgb('#2b2d31'), grey: srgb('#55585e'), amber: srgb('#d38a1a'),
};

const FLOOR = 0.7, FRONT = 1.62, REAR = 4.3, HEAD = 1.94;
const floorY = (s) => Math.max(FLOOR, fusSec(s).yb + 0.09);

// gauge layout on the panel, metres (x, y, diameter)
export const GAUGE_POS = {
  asi: [-0.37, 1.335, 0.083], ai: [-0.27, 1.335, 0.083], alt: [-0.17, 1.335, 0.083],
  tc: [-0.37, 1.232, 0.083], dg: [-0.27, 1.232, 0.083], vsi: [-0.17, 1.232, 0.083],
  tach: [-0.17, 1.128, 0.074], fuel: [0.33, 1.34, 0.066],
};
const STATIC_GAUGES = [
  ['cdi', -0.07, 1.335, 0.083], ['adf', -0.07, 1.232, 0.083], ['clock', -0.465, 1.335, 0.06], ['suction', -0.465, 1.24, 0.06],
  ['oil', 0.42, 1.34, 0.066], ['egt', 0.33, 1.25, 0.066], ['amps', 0.42, 1.25, 0.066],
];
const SWITCHES = ['FUEL PUMP', 'BEACON', 'LAND', 'TAXI', 'NAV', 'STROBE', 'PITOT HT'];

function pillow(B, m, w, h, d, color, n = 4.5) {
  const b = new Builder(), R = [], K = 12, N = 20;
  for (let k = 0; k <= K; k++) {
    const t = -1 + (2 * k) / K;
    const f = Math.max(0.02, (1 - Math.abs(t) ** n) ** (1 / n));
    R.push(circle(N, 1).map(([cx, cy]) => {
      const ex = Math.sign(cx) * Math.abs(cx) ** (2 / n), ey = Math.sign(cy) * Math.abs(cy) ** (2 / n);
      return [ex * (w / 2) * f, ey * (h / 2) * f, t * d / 2];
    }));
  }
  b.loft(R, { color });
  B.addGeo(b.build(), m, [0, 0], color);
}

function panelCanvas(quality) {
  const W = quality === 'low' ? 1024 : 2048, H = W / 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const kx = W / (PANEL.x1 - PANEL.x0), ky = H / (PANEL.y1 - PANEL.y0);
  g.setTransform(kx, 0, 0, -ky, -PANEL.x0 * kx, PANEL.y1 * ky);
  const FONT = "'Helvetica Neue', Roboto, Arial, sans-serif";
  const txt = (s, x, y, size, col = '#e9e9e4', align = 'center', weight = '600') => {
    g.save(); g.translate(x, y); g.scale(1 / 1000, -1 / 1000);
    g.font = `${weight} ${size * 1000}px ${FONT}`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle';
    g.fillText(s, 0, 0); g.restore();
  };
  const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); };
  // base: painted panel with subtle vertical gradient
  const bg = g.createLinearGradient(0, PANEL.y1, 0, PANEL.y0);
  bg.addColorStop(0, '#2c2f34'); bg.addColorStop(1, '#25272b');
  g.fillStyle = bg; g.fillRect(PANEL.x0, PANEL.y0, PANEL.x1 - PANEL.x0, PANEL.y1 - PANEL.y0);
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.0025;
  g.beginPath(); g.moveTo(-0.115, PANEL.y0); g.lineTo(-0.115, 1.43); g.moveTo(0.265, PANEL.y0); g.lineTo(0.265, 1.43); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.05)';
  g.beginPath(); g.moveTo(-0.112, PANEL.y0); g.lineTo(-0.112, 1.43); g.moveTo(0.268, PANEL.y0); g.lineTo(0.268, 1.43); g.stroke();
  // gauge holes + screws
  const hole = (x, y, d) => {
    g.fillStyle = '#060607'; g.beginPath(); g.arc(x, y, d / 2 + 0.004, 0, 7); g.fill();
    g.fillStyle = '#4b4e53';
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g.beginPath(); g.arc(x + sx * d * 0.46, y + sy * d * 0.46, 0.0028, 0, 7); g.fill(); }
  };
  for (const [x, y, d] of Object.values(GAUGE_POS)) hole(x, y, d);
  for (const [, x, y, d] of STATIC_GAUGES) hole(x, y, d);
  // static gauges
  const dial = (kind, x, y, d) => {
    const r = d / 2;
    g.save(); g.translate(x, y); g.scale(r, r);
    g.fillStyle = '#0d0e10'; g.beginPath(); g.arc(0, 0, 1, 0, 7); g.fill();
    g.strokeStyle = '#eee'; g.lineWidth = 0.04;
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 0.92, Math.sin(a) * 0.92); g.lineTo(Math.cos(a) * 0.76, Math.sin(a) * 0.76); g.stroke(); }
    g.lineWidth = 0.07; g.lineCap = 'round';
    if (kind === 'cdi' || kind === 'adf') {
      g.strokeStyle = '#ddd'; g.lineWidth = 0.03; g.beginPath(); g.arc(0, 0, 0.62, 0, 7); g.stroke();
      for (const k of [-0.4, -0.2, 0.2, 0.4]) { g.fillStyle = '#ddd'; g.beginPath(); g.arc(k, 0, 0.035, 0, 7); g.fill(); }
      g.strokeStyle = kind === 'cdi' ? '#f2f2ee' : '#f2c21b'; g.lineWidth = 0.06;
      g.beginPath(); if (kind === 'cdi') { g.moveTo(0.08, 0.6); g.lineTo(0.08, -0.6); } else { g.moveTo(-0.3, -0.5); g.lineTo(0.3, 0.5); } g.stroke();
      if (kind === 'cdi') { g.fillStyle = '#fff'; g.fillRect(-0.15, 0.62, 0.3, 0.12); }
    } else {
      g.strokeStyle = '#f2f2ee';
      const a = { clock: 2.2, suction: 0.9, oil: 1.4, egt: 1.0, amps: 1.6 }[kind] || 1;
      if (kind === 'oil' || kind === 'egt' || kind === 'amps') { g.strokeStyle = '#1fa64a'; g.lineWidth = 0.12; g.beginPath(); g.arc(0, 0, 0.82, -2.2, -0.9); g.stroke(); g.strokeStyle = '#f2f2ee'; g.lineWidth = 0.07; }
      g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 0.75, -Math.sin(a) * 0.75); g.stroke();
      if (kind === 'clock') { g.beginPath(); g.moveTo(0, 0); g.lineTo(0.35, 0.3); g.stroke(); }
    }
    g.restore();
    const name = { cdi: 'NAV 1', adf: 'ADF', clock: 'CLOCK', suction: 'SUCTION', oil: 'OIL', egt: 'EGT', amps: 'AMPS' }[kind];
    txt(name, x, y - r - 0.009, 0.0075, '#c9c9c3');
  };
  for (const [k, x, y, d] of STATIC_GAUGES) dial(k, x, y, d);
  // labels for dynamic gauges below them
  txt('FUEL QTY', GAUGE_POS.fuel[0], GAUGE_POS.fuel[1] - 0.042, 0.0075, '#c9c9c3');
  // annunciators
  rr(-0.45, 1.395, 0.33, 0.026, 0.003, '#111214');
  ['LOW FUEL', 'OIL PRESS', 'LOW VAC', 'VOLTS'].forEach((s, i) => { rr(-0.443 + i * 0.081, 1.4, 0.074, 0.016, 0.002, i === 2 ? '#3a2a10' : '#2a1414'); txt(s, -0.406 + i * 0.081, 1.408, 0.0065, '#6b5a4a'); });
  // radio stack
  const rs = { x: 0.04, w: 0.2 };
  rr(rs.x - 0.006, 1.03, rs.w + 0.012, 0.4, 0.004, '#141518');
  const box = (y, h, draw) => {
    rr(rs.x, y, rs.w, h, 0.003, '#1f2124');
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 0.0012; g.beginPath(); g.roundRect(rs.x, y, rs.w, h, 0.003); g.stroke();
    draw(y, h);
  };
  const lcd = (x, y, w, h, s, col) => { rr(x, y, w, h, 0.002, '#050607'); txt(s, x + w / 2, y + h / 2, h * 0.62, col, 'center', '500'); };
  const knobs = (y, h, xs) => { for (const x of xs) { g.fillStyle = '#0c0c0d'; g.beginPath(); g.arc(x, y + h / 2, 0.009, 0, 7); g.fill(); g.fillStyle = '#3a3c40'; g.beginPath(); g.arc(x, y + h / 2, 0.005, 0, 7); g.fill(); } };
  box(1.395, 0.03, (y, h) => { for (let i = 0; i < 9; i++) { rr(rs.x + 0.012 + i * 0.02, y + 0.008, 0.014, 0.014, 0.002, i % 3 === 0 ? '#3b3e44' : '#2a2c30'); } });
  box(1.27, 0.118, (y, h) => {
    rr(rs.x + 0.044, y + 0.012, 0.112, 0.094, 0.002, '#050607');
    const sx = rs.x + 0.046, sy = y + 0.014;
    g.save(); g.beginPath(); g.rect(sx, sy, 0.108, 0.09); g.clip();
    const mg = g.createLinearGradient(sx, sy, sx, sy + 0.09); mg.addColorStop(0, '#0b2a13'); mg.addColorStop(1, '#173b1d'); g.fillStyle = mg; g.fillRect(sx, sy, 0.108, 0.09);
    g.strokeStyle = '#5ec4e6'; g.lineWidth = 0.0014; g.beginPath(); g.moveTo(sx + 0.01, sy + 0.02); g.bezierCurveTo(sx + 0.04, sy + 0.05, sx + 0.07, sy + 0.03, sx + 0.1, sy + 0.08); g.stroke();
    g.strokeStyle = '#d14fd1'; g.lineWidth = 0.002; g.beginPath(); g.moveTo(sx + 0.054, sy + 0.045); g.lineTo(sx + 0.09, sy + 0.085); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(sx + 0.054, sy + 0.05); g.lineTo(sx + 0.05, sy + 0.04); g.lineTo(sx + 0.058, sy + 0.04); g.fill();
    g.restore();
    lcd(rs.x + 0.005, y + 0.085, 0.036, 0.016, '122.80', '#3bdc6a'); lcd(rs.x + 0.005, y + 0.06, 0.036, 0.016, '118.30', '#3bdc6a');
    lcd(rs.x + 0.005, y + 0.035, 0.036, 0.016, '110.50', '#3bdc6a');
    knobs(y, 0.03, [rs.x + 0.023, rs.x + 0.177]); knobs(y + 0.03, 0.03, [rs.x + 0.177]);
    txt('GPS 430', rs.x + 0.177, y + 0.105, 0.0065, '#aaa');
  });
  box(1.205, 0.058, (y) => { lcd(rs.x + 0.012, y + 0.02, 0.07, 0.022, '121.50', '#f0a020'); lcd(rs.x + 0.1, y + 0.02, 0.07, 0.022, '109.20', '#f0a020'); knobs(y, 0.058, [rs.x + 0.185]); txt('NAV/COM 2', rs.x + 0.05, y + 0.049, 0.0065, '#aaa'); });
  box(1.155, 0.045, (y) => { lcd(rs.x + 0.06, y + 0.012, 0.08, 0.02, '7000  ALT', '#f0a020'); knobs(y, 0.045, [rs.x + 0.02, rs.x + 0.18]); txt('XPDR', rs.x + 0.03, y + 0.037, 0.0065, '#aaa'); });
  box(1.11, 0.04, (y) => { lcd(rs.x + 0.06, y + 0.01, 0.07, 0.02, 'ADF 352', '#f0a020'); knobs(y, 0.04, [rs.x + 0.18]); });
  box(1.04, 0.064, (y) => { txt('KRAYZEE AVIONICS', rs.x + 0.1, y + 0.04, 0.008, '#8c8f94'); txt('NO RULES · ALL FUN', rs.x + 0.1, y + 0.022, 0.0065, '#6c6f74'); });
  // switch row + labels
  const swX = (i) => -0.44 + i * 0.033;
  txt('MASTER', -0.48, 1.045, 0.0062, '#ddd');
  SWITCHES.forEach((s, i) => txt(s, swX(i) + 0.033, 1.045, 0.0055, '#ddd'));
  txt('MAGNETOS', -0.48, 1.12, 0.0062, '#ddd');
  txt('OFF R L BOTH START', -0.48, 1.08, 0.0042, '#bbb');
  // throttle quadrant labels
  txt('THROTTLE', 0.0, 0.982, 0.0062, '#ddd'); txt('MIXTURE', 0.075, 0.982, 0.0062, '#ddd'); txt('CARB HT', -0.075, 0.982, 0.0058, '#ddd');
  txt('FLAPS', 0.15, 1.1, 0.0062, '#ddd');
  ['0°', '10°', '20°', '30°'].forEach((s, i) => txt(s, 0.172, 1.085 - i * 0.017, 0.0052, '#ddd', 'left'));
  // circuit breakers
  for (let i = 0; i < 12; i++) { const x = 0.29 + (i % 6) * 0.034, y = i < 6 ? 1.06 : 1.0; g.fillStyle = '#0b0b0c'; g.beginPath(); g.arc(x, y, 0.0065, 0, 7); g.fill(); g.fillStyle = '#d8d8d2'; g.beginPath(); g.arc(x, y, 0.0035, 0, 7); g.fill(); }
  txt('CIRCUIT BREAKERS', 0.375, 1.085, 0.0058, '#ccc');
  // glovebox + placards
  g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 0.002; g.beginPath(); g.roundRect(0.29, 1.12, 0.21, 0.07, 0.008); g.stroke();
  rr(0.37, 1.16, 0.05, 0.008, 0.003, '#111');
  rr(0.29, 1.405, 0.2, 0.024, 0.003, '#c9c2a8'); txt('MANEUVERS: ALL OF THEM', 0.39, 1.417, 0.0068, '#2a2a2a', 'center', '700');
  rr(-0.52, 0.968, 0.07, 0.018, 0.002, '#b8b19a'); txt('C172-K', -0.485, 0.977, 0.007, '#222', 'center', '700');
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function buildCockpit({ quality, mats }) {
  const high = quality !== 'low';
  const group = new THREE.Group();
  group.name = 'cockpit';
  const B = new Builder();
  const inset = 0.03;

  // ---- side linings: window band with exact holes, plus curved lower band ----
  const outline = [[FRONT, 1.0], [REAR, 1.0], [REAR, 1.75], [4.05, 1.8], [3.75, HEAD], [2.16, HEAD], [1.68, 1.465], [FRONT, 1.445]];
  const resample = (pts, step, closed = true) => {
    const r = [];
    const n = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / step));
      for (let j = 0; j < k; j++) r.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
    }
    return r;
  };
  const shape = new THREE.Shape(resample(outline, 0.12).map(([s, y]) => new THREE.Vector2(s, y)));
  for (const k of ['door', 'rear']) shape.holes.push(new THREE.Path(resample(WINDOWS[k], 0.1).map(([s, y]) => new THREE.Vector2(s, y))));
  for (const sg of [-1, 1]) {
    const geo = new THREE.ShapeGeometry(shape);
    const P = geo.attributes.position;
    const b = new Builder();
    for (let i = 0; i < P.count; i++) {
      const s = P.getX(i), y = P.getY(i);
      const x = sg * (fusHalfWidth(s, y) - inset);
      b.v([x, y, s], [-sg, 0, 0], [0, 0], y > 1.46 ? COL.liningUp : COL.lining);
    }
    for (let i = 0; i < geo.index.count; i += 3) {
      const a = geo.index.getX(i), c = geo.index.getX(i + 1), d = geo.index.getX(i + 2);
      // ShapeGeometry is CCW in (s,y); facing inward flips with side
      if (sg > 0) b.t(a, c, d); else b.t(a, d, c);
    }
    geo.dispose();
    B.append(b);
    // lower band down to the floor, following the skin
    const rings = [];
    for (let s = FRONT; s <= REAR + 1e-6; s += high ? 0.1 : 0.2) {
      const r = [];
      for (let k = 0; k <= 6; k++) {
        const y = lerp(1.0, floorY(s), k / 6);
        r.push([sg * Math.max(0.05, fusHalfWidth(s, y) - inset), y, s]);
      }
      rings.push(r);
    }
    B.loft(rings, { closed: false, out: (p) => [-p[0], 0, 0], color: COL.liningDark });
    // armrest + door handle + pocket
    pillow(B, new THREE.Matrix4().setPosition(sg * (fusHalfWidth(2.45, 1.2) - inset - 0.04), 1.22, 2.42), 0.08, 0.05, 0.5, COL.liningDark, 3);
    pillow(B, new THREE.Matrix4().setPosition(sg * (fusHalfWidth(3.5, 1.2) - inset - 0.03), 1.18, 3.5), 0.06, 0.045, 0.4, COL.liningDark, 3);
    B.addGeo(new THREE.BoxGeometry(0.02, 0.025, 0.11), new THREE.Matrix4().setPosition(sg * (fusHalfWidth(2.8, 1.33) - inset - 0.015), 1.33, 2.8), [0, 0], COL.chrome);
    // window frames (soft trim) around door and rear windows
    for (const k of ['door', 'rear']) {
      const pts = resample(WINDOWS[k], 0.05);
      pts.push(pts[0]);
      const path = pts.map(([s, y]) => [sg * (fusHalfWidth(s, y) - inset - 0.004), y, s]);
      const prof = [[-0.006, -0.012], [0.006, -0.012], [0.006, 0.012], [-0.006, 0.012]];
      B.loft(sweepRings(path, prof, { upHint: [sg, 0, 0] }), { color: COL.trim });
    }
  }
  // A-pillar trim (windscreen edge)
  for (const sg of [-1, 1]) {
    const path = [];
    for (let k = 0; k <= 8; k++) { const t = k / 8; const s = lerp(1.69, 2.15, t), y = lerp(1.47, 1.945, t); path.push([sg * (fusHalfWidth(s, y) - inset - 0.01), y, s]); }
    B.loft(sweepRings(path, circle(8, 0.016, 0.012), { upHint: [sg, 0, 0] }), { color: COL.trim, capStart: true, capEnd: true });
  }

  // ---- floor, headliner, firewall, rear bulkhead ----
  {
    const fl = [];
    for (let s = FRONT; s <= REAR + 1e-6; s += 0.15) {
      const fy = floorY(s), w = Math.max(0.05, fusHalfWidth(s, fy + 0.005) - inset);
      fl.push([[-w, fy, s], [0, fy, s], [w, fy, s]]);
    }
    B.loft(fl, { closed: false, out: () => [0, 1, 0], color: COL.carpet });
    const hl = [];
    for (let s = 2.13; s <= 3.9; s += high ? 0.0885 : 0.177) {
      const sec = fusSec(s), r = [];
      const N = high ? 16 : 8;
      for (let j = -N; j <= N; j++) {
        const p = ringPoint(sec, s, (j / N) * 0.78, 0.035);
        r.push([p[0], Math.min(p[1], 1.985), s]);
      }
      hl.push(r);
    }
    B.loft(hl, { closed: false, out: () => [0, -1, 0], color: COL.head });
    // firewall / footwell
    const section = (sAt, y0, y1, flip, color) => {
      const sec = fusSec(sAt), pts = [];
      for (let k = 0; k < 48; k++) {
        const p = ringPoint(sec, sAt, (k / 48) * Math.PI * 2, inset);
        if (p[1] <= y1) pts.push(p);
      }
      const cx = 0, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      B.loft([pts, pts.map(() => [cx, cy, sAt])], { closed: true, out: () => [0, 0, flip], color });
    };
    section(FRONT, FLOOR - 0.05, PANEL.y0 + 0.01, 1, COL.liningDark);
    const kick = new THREE.PlaneGeometry(1.04, 0.14);
    B.addGeo(kick, new THREE.Matrix4().makeRotationX(-0.6).setPosition(0, PANEL.y0 - 0.05, PANEL.s - 0.06), [0, 0], COL.frame);
    // rear bulkhead (baggage wall)
    section(REAR, 0.0, 1.72, -1, COL.liningDark);
    const shelf = new THREE.PlaneGeometry(0.8, 0.5);
    B.addGeo(shelf, new THREE.Matrix4().makeRotationX(-Math.PI / 2).setPosition(0, 1.72, 4.05), [0, 0], COL.carpet);
  }

  // ---- panel, glareshield, pedestal ----
  const panelTex = panelCanvas(quality);
  const panelMat = new THREE.MeshStandardMaterial({ map: panelTex, roughness: 0.72, metalness: 0.05 });
  const panelGeo = new THREE.PlaneGeometry(PANEL.x1 - PANEL.x0, PANEL.y1 - PANEL.y0);
  panelGeo.translate(0, (PANEL.y0 + PANEL.y1) / 2, PANEL.s);
  const panelMesh = new THREE.Mesh(panelGeo, panelMat);
  panelMesh.name = 'panel';
  panelMesh.receiveShadow = true;
  {
    const prof = [[1.797, 1.443], [1.804, 1.452], [1.8, 1.462], [1.785, 1.468], [1.5, 1.5], [1.5, 1.44]];
    const R = [];
    for (const f of [-1, -0.94, 0.94, 1]) R.push(prof.map(([s, y]) => [f * (fusHalfWidth(s, y) - 0.035), y - (Math.abs(f) === 1 ? 0.006 : 0), s]));
    B.loft(R, { color: COL.glare, capStart: true, capEnd: true });
    const ped = new THREE.BoxGeometry(0.13, 0.26, 0.24);
    B.addGeo(ped, new THREE.Matrix4().setPosition(0, FLOOR + 0.13, 1.88), [0, 0], COL.frame);
    const trimW = new THREE.CylinderGeometry(0.06, 0.06, 0.018, 24);
    B.addGeo(trimW, new THREE.Matrix4().makeRotationZ(Math.PI / 2).setPosition(0, FLOOR + 0.25, 2.0), [0, 0], COL.black);
    B.addGeo(new THREE.BoxGeometry(0.004, 0.02, 0.006), new THREE.Matrix4().setPosition(0.01, FLOOR + 0.31, 2.0), [0, 0], COL.white);
    const sel = new THREE.CylinderGeometry(0.05, 0.05, 0.01, 20);
    B.addGeo(sel, new THREE.Matrix4().setPosition(0, FLOOR + 0.03, 2.2), [0, 0], COL.red);
    B.addGeo(new THREE.BoxGeometry(0.02, 0.025, 0.09), new THREE.Matrix4().setPosition(0, FLOOR + 0.05, 2.2), [0, 0], COL.white);
  }
  // bezels + knobs on the panel
  {
    const ring = (x, y, d) => {
      const tor = new THREE.TorusGeometry(d / 2 + 0.003, 0.004, 6, high ? 32 : 18);
      B.addGeo(tor, new THREE.Matrix4().setPosition(x, y, PANEL.s + 0.003), [0, 0], COL.bezel);
    };
    for (const [x, y, d] of Object.values(GAUGE_POS)) ring(x, y, d);
    for (const [, x, y, d] of STATIC_GAUGES) ring(x, y, d);
    const knob = (x, y, r = 0.008, l = 0.014, col = COL.knob) => {
      const k = new THREE.CylinderGeometry(r, r * 1.08, l, 12);
      B.addGeo(k, new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, y, PANEL.s + l / 2), [0, 0], col);
    };
    for (const [n, dx, dy] of [['alt', -0.034, -0.034], ['dg', -0.034, -0.034], ['dg', 0.034, -0.034], ['ai', 0, -0.046], ['cdi', -0.034, -0.034], ['adf', -0.034, -0.034], ['clock', 0.024, -0.024]]) {
      const p = GAUGE_POS[n] || STATIC_GAUGES.find((g) => g[0] === n).slice(1);
      knob(p[0] + dx, p[1] + dy, 0.006, 0.012);
    }
    for (const [x, y] of [[0.063, 1.285], [0.217, 1.285], [0.217, 1.315], [0.225, 1.234], [0.06, 1.177], [0.22, 1.177], [0.22, 1.13]]) knob(x, y, 0.0075, 0.016);
    // master (red split rocker), magneto key, rocker switches
    for (const dx of [-0.007, 0.007]) B.addGeo(new THREE.BoxGeometry(0.012, 0.022, 0.012), new THREE.Matrix4().makeRotationX(-0.25).setPosition(-0.48 + dx, 1.025, PANEL.s + 0.006), [0, 0], COL.red);
    knob(-0.48, 1.1, 0.012, 0.012, COL.black);
    B.addGeo(new THREE.BoxGeometry(0.004, 0.018, 0.012), new THREE.Matrix4().setPosition(-0.48, 1.1, PANEL.s + 0.016), [0, 0], COL.chrome);
    SWITCHES.forEach((s, i) => B.addGeo(new THREE.BoxGeometry(0.011, 0.02, 0.01), new THREE.Matrix4().makeRotationX(i % 3 === 0 ? 0.3 : -0.3).setPosition(-0.44 + i * 0.033 + 0.033, 1.025, PANEL.s + 0.005), [0, 0], COL.white));
    // carb heat, mixture (fixed, out a little), flap lever
    for (const [x, col, out] of [[-0.075, COL.black, 0.025], [0.075, COL.red, 0.012]]) {
      B.addGeo(new THREE.CylinderGeometry(0.004, 0.004, out + 0.02, 8), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, 1.0, PANEL.s + (out + 0.02) / 2), [0, 0], COL.chrome);
      B.addGeo(new THREE.CylinderGeometry(0.013, 0.013, 0.014, 16), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(x, 1.0, PANEL.s + out + 0.02), [0, 0], col);
    }
    B.addGeo(new THREE.BoxGeometry(0.03, 0.008, 0.03), new THREE.Matrix4().setPosition(0.15, 1.065, PANEL.s + 0.015), [0, 0], COL.white);
    // compass at the top of the windscreen
    B.addGeo(new THREE.BoxGeometry(0.06, 0.05, 0.05), new THREE.Matrix4().setPosition(0, 1.905, 2.15), [0, 0], COL.black);
    B.addGeo(new THREE.PlaneGeometry(0.04, 0.022), new THREE.Matrix4().setPosition(0, 1.905, 2.176), [0, 0], srgb('#e8e2cf'));
    // sun visors
    for (const sg of [-1, 1]) pillow(B, new THREE.Matrix4().makeRotationX(-0.25).setPosition(sg * 0.25, 1.955, 2.25), 0.36, 0.012, 0.15, COL.head, 4);
  }

  // ---- seats ----
  const seat = (x, s, w) => {
    pillow(B, new THREE.Matrix4().makeRotationX(-0.08).setPosition(x, 1.0, s), w, 0.11, 0.48, COL.seat);
    pillow(B, new THREE.Matrix4().makeRotationX(0.22).setPosition(x, 1.33, s + 0.27), w, 0.56, 0.11, COL.seat);
    pillow(B, new THREE.Matrix4().makeRotationX(0.22).setPosition(x, 1.68, s + 0.36), w * 0.62, 0.16, 0.08, COL.seatDark);
    B.addGeo(new THREE.BoxGeometry(w * 0.55, 0.2, 0.34), new THREE.Matrix4().setPosition(x * 0.9, floorY(s) + 0.1, s), [0, 0], COL.frame);
  };
  seat(-0.27, 2.75, 0.44);
  seat(0.27, 2.75, 0.44);
  pillow(B, new THREE.Matrix4().makeRotationX(-0.08).setPosition(0, 0.96, 3.6), 0.9, 0.12, 0.46, COL.seat);
  pillow(B, new THREE.Matrix4().makeRotationX(0.18).setPosition(0, 1.3, 3.9), 0.86, 0.55, 0.12, COL.seat);
  B.addGeo(new THREE.BoxGeometry(0.7, 0.17, 0.4), new THREE.Matrix4().setPosition(0, floorY(3.6) + 0.085, 3.6), [0, 0], COL.frame);

  // ---- moving parts ----
  const yokes = [];
  for (const x of [-0.27, 0.27]) {
    const yg = new THREE.Group();
    yg.position.set(x, 1.075, PANEL.s);
    const y = new Builder();
    y.addGeo(new THREE.CylinderGeometry(0.0105, 0.0105, 0.3, 12), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, 0.12), [0, 0], COL.shaft);
    y.addGeo(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 16), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, 0.01), [0, 0], COL.black);
    pillow(y, new THREE.Matrix4().setPosition(0, -0.005, 0.27), 0.085, 0.06, 0.04, COL.black, 3);
    y.addGeo(new THREE.PlaneGeometry(0.05, 0.03), new THREE.Matrix4().setPosition(0, -0.002, 0.291), [0, 0], srgb('#7a7f86'));
    const horn = [];
    for (let k = 0; k <= 16; k++) {
      const t = -1 + (2 * k) / 16, a = Math.abs(t);
      const px = t * 0.15, py = -0.03 + 0.03 * a * a + (a > 0.8 ? (a - 0.8) * 0.55 : 0);
      horn.push([px * (a > 0.9 ? 0.96 : 1), py, 0.27 + 0.01 * a]);
    }
    y.loft(sweepRings(horn, circle(10, 0.014), { upHint: [0, 0, 1], scale: (i, n) => (i < 3 || i > n - 4 ? 1.35 : 1) }), { color: COL.black, capStart: true, capEnd: true });
    const m1 = new THREE.Mesh(y.build(), mats.interior);
    m1.castShadow = true;
    yg.add(m1);
    group.add(yg);
    yokes.push(yg);
  }
  const throttle = new THREE.Group();
  throttle.position.set(0, 1.0, PANEL.s);
  {
    const t = new Builder();
    t.addGeo(new THREE.CylinderGeometry(0.0045, 0.0045, 0.09, 8), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, -0.03), [0, 0], COL.chrome);
    t.addGeo(new THREE.CylinderGeometry(0.017, 0.016, 0.02, 18), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, 0.02), [0, 0], COL.black);
    t.addGeo(new THREE.SphereGeometry(0.017, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, 0, 0.03), [0, 0], COL.black);
    throttle.add(new THREE.Mesh(t.build(), mats.interiorMetal));
  }
  group.add(throttle);
  const pedals = { L: new THREE.Group(), R: new THREE.Group() };
  for (const [side, dx] of [['L', -0.09], ['R', 0.09]]) {
    const p = new Builder();
    for (const x0 of [-0.27, 0.27]) {
      p.addGeo(new THREE.BoxGeometry(0.075, 0.12, 0.012), new THREE.Matrix4().makeRotationX(-0.55).setPosition(x0 + dx, FLOOR + 0.17, 1.86), [0, 0], COL.grey);
      p.addGeo(new THREE.BoxGeometry(0.06, 0.03, 0.014), new THREE.Matrix4().makeRotationX(-0.55).setPosition(x0 + dx, FLOOR + 0.24, 1.83), [0, 0], COL.black);
      p.addGeo(new THREE.CylinderGeometry(0.008, 0.008, 0.22, 8), new THREE.Matrix4().makeRotationX(0.5).setPosition(x0 + dx, FLOOR + 0.15, 1.78), [0, 0], COL.frame);
    }
    pedals[side].add(new THREE.Mesh(p.build(), mats.interiorMetal));
    group.add(pedals[side]);
  }

  const interior = new THREE.Mesh(B.build(), mats.interior);
  interior.name = 'interior';
  interior.receiveShadow = true;
  interior.castShadow = high;
  group.add(interior, panelMesh);

  // ---- live gauges: one quad per dial, one shared canvas texture ----
  const inst = createInstruments({ quality });
  const gq = new Builder();
  for (const k of GAUGES) {
    const [x, y, d] = GAUGE_POS[k], [u0, v0, u1, v1] = inst.cells[k];
    const r = d / 2, z = PANEL.s + 0.0015;
    const a = gq.v([x - r, y - r, z], [0, 0, 1], [u0, v0]), b = gq.v([x + r, y - r, z], [0, 0, 1], [u1, v0]);
    const c = gq.v([x + r, y + r, z], [0, 0, 1], [u1, v1]), e = gq.v([x - r, y + r, z], [0, 0, 1], [u0, v1]);
    gq.t(a, b, c); gq.t(a, c, e);
  }
  const gaugeMat = new THREE.MeshStandardMaterial({ map: inst.texture, emissiveMap: inst.texture, emissive: 0xffffff, emissiveIntensity: 0.3, roughness: 0.25, metalness: 0, alphaTest: 0.5, transparent: false });
  // round dials on square quads: cut the corners with an alpha mask
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

  function update(dt, cur) {
    for (const y of yokes) {
      y.rotation.z = -cur.aileron * 0.75;
      y.position.z = PANEL.s - 0.035 + cur.elevator * 0.06;
    }
    throttle.position.z = PANEL.s + 0.012 + (1 - cur.throttle) * 0.055;
    pedals.L.position.z = cur.rudder * 0.045;
    pedals.R.position.z = -cur.rudder * 0.045;
    inst.update(dt);
  }

  return {
    group, yokes, throttle, pedals, instruments: inst, update, eyeHint: EYE,
    dispose() { panelTex.dispose(); panelMat.dispose(); gaugeMat.alphaMap.dispose(); gaugeMat.dispose(); inst.dispose(); },
  };
}
