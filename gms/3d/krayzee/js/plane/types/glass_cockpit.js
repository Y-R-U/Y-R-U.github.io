import * as THREE from 'three';
import { Builder, srgb, lerp, clamp } from '../geom.js';
import { pbrMaterial, RM, M4, rod, canvasTexture, noiseFill, fan } from './kit.js';
import { secPt, secR, secHalfWidth } from './jetkit.js';
import { createAviator } from './aviator.js';

// Shared airliner / transport flight deck for the big types (jumbo, herc). Parametric on the type's fuselage section
// function, so the inner shell follows the real skin and the windows are real holes in it: the exterior skin is
// single-sided, so from the seat you look straight out through them. Build frame (x right, y up, z = station aft).
// P = { sec, eye, floorY, shell: { s0, s1, inset, holes: [[s0, s1, t0, t1]] (right side, mirrored), nt },
//       panel: { s, y0, y1, tilt }, glare: { y, depth }, seats: [xL, xR], seatS, yoke: { s, y },
//       pedestal: { s0, s1, w, y }, overhead: { s0, s1, y }, levers, aft, label, n1(rpm) }

const COL = {
  wall: srgb('#7c858c'), wallDark: srgb('#5b636a'), wallLight: srgb('#9aa2a8'), carpet: srgb('#3d1660'), black: srgb('#111214'),
  panel: srgb('#3c4247'), glare: srgb('#1c1e21'), velvet: srgb('#5a1f8a'), velvetDark: srgb('#3a1060'), gold: srgb('#d6a740'),
  steel: srgb('#8e949a'), chrome: srgb('#cfd3d7'), lever: srgb('#2a2c30'), knob: srgb('#e8e6df'), sheep: srgb('#efe8da'),
  rubber: srgb('#1a1b1d'), cream: srgb('#e9e2cf'), porcelain: srgb('#f6f3ec'), tea: srgb('#6b3a14'), red: srgb('#b3202e'),
};

// ---------- static panel art (one atlas) ----------
const AT = { main: [0, 0, 1, 0.34], mcp: [0, 0.34, 1, 0.42], over: [0, 0.42, 0.6, 1], ped: [0.6, 0.42, 1, 1] };
function panelAtlas(quality, P) {
  const S = quality === 'low' ? 512 : 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const rect = (r) => [r[0] * S, r[1] * S, (r[2] - r[0]) * S, (r[3] - r[1]) * S];
  const txt = (s, x, y, size, col = '#e8e8e2', align = 'center') => { g.font = `700 ${Math.round(size)}px 'Helvetica Neue', Arial, sans-serif`; g.fillStyle = col; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y); };
  // main panel (u: -W..W across, v: y0..y1 up; canvas y down)
  {
    const [x0, y0, w, h] = rect(AT.main);
    g.fillStyle = '#41474d'; g.fillRect(x0, y0, w, h);
    noiseFill(g, x0, y0, w, h, 4000 * S / 1024, 0.05, true);
    // display bezels: same layout as the display quads (displayLayout)
    for (const d of displayLayout(P)) {
      const cx = x0 + (d.u + 1) / 2 * w, cy = y0 + (1 - d.v) * h;
      const hx = (d.size / 2) * w / (2 * P._W), hy = (d.size / 2) * h / (P.panel.y1 - P.panel.y0);
      g.fillStyle = '#16181b'; g.fillRect(cx - hx * 1.16, cy - hy * 1.16, hx * 2.32, hy * 2.36);
      g.fillStyle = '#2b2f33';
      for (let i = 0; i < 5; i++) g.fillRect(cx - hx * 1.05 + i * hx * 0.46, cy + hy * 1.2, hx * 0.3, hy * 0.08);
    }
    // standby instruments + gear lever + clock, labels
    g.fillStyle = '#0d0e10';
    for (const u of [-0.12, 0.12]) { g.beginPath(); g.arc(x0 + (u + 1) / 2 * w, y0 + h * 0.2, h * 0.07, 0, 7); g.fill(); }
    g.fillStyle = '#c9ccd0'; g.fillRect(x0 + w * 0.53, y0 + h * 0.62, w * 0.012, h * 0.2);
    g.fillStyle = '#e8e6df'; g.beginPath(); g.arc(x0 + w * 0.536, y0 + h * 0.6, h * 0.035, 0, 7); g.fill();
    txt('GEAR', x0 + w * 0.536, y0 + h * 0.88, h * 0.045, '#e8e8e2');
    txt(P.label || 'ROYAL', x0 + w * 0.5, y0 + h * 0.06, h * 0.05, '#d6a740');
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 3 ? '#2a2e33' : '#1d2024'; g.fillRect(x0 + w * (0.03 + i * 0.012), y0 + h * 0.9, w * 0.008, h * 0.05); g.fillRect(x0 + w * (0.86 + i * 0.012), y0 + h * 0.9, w * 0.008, h * 0.05); }
  }
  // glareshield mode control panel
  {
    const [x0, y0, w, h] = rect(AT.mcp);
    g.fillStyle = '#2f3438'; g.fillRect(x0, y0, w, h);
    g.fillStyle = '#4a5056'; g.fillRect(x0 + w * 0.25, y0 + h * 0.08, w * 0.5, h * 0.84);
    const win = (u, label, val) => {
      g.fillStyle = '#060708'; g.fillRect(x0 + w * u, y0 + h * 0.38, w * 0.05, h * 0.32);
      txt(val, x0 + w * (u + 0.025), y0 + h * 0.55, h * 0.26, '#ffb21e');
      txt(label, x0 + w * (u + 0.025), y0 + h * 0.2, h * 0.16, '#e8e8e2');
    };
    win(0.29, 'IAS/MACH', '250'); win(0.38, 'HDG', '090'); win(0.47, 'V/S', '+0000'); win(0.56, 'ALT', '10000'); win(0.66, 'TEA', 'HOT');
    for (let i = 0; i < 14; i++) { g.fillStyle = '#d9dcd5'; g.fillRect(x0 + w * (0.27 + i * 0.033), y0 + h * 0.78, w * 0.02, h * 0.1); }
    txt('BY ROYAL WARRANT', x0 + w * 0.12, y0 + h * 0.5, h * 0.22, '#d6a740');
    txt('NO LOOPS', x0 + w * 0.88, y0 + h * 0.5, h * 0.22, '#d6a740');
  }
  // overhead panel: rows of switches and annunciators
  {
    const [x0, y0, w, h] = rect(AT.over);
    g.fillStyle = '#4b5258'; g.fillRect(x0, y0, w, h);
    for (let r = 0; r < 9; r++) {
      const yy = y0 + h * (0.06 + r * 0.105);
      g.fillStyle = '#d0d3d0'; g.fillRect(x0 + w * 0.04, yy - h * 0.012, w * 0.92, h * 0.004);
      for (let k = 0; k < 10; k++) {
        const xx = x0 + w * (0.08 + k * 0.088);
        if ((r + k) % 4 === 0) { g.fillStyle = ['#2b2f33', '#d4b000', '#1f3f1f', '#3a1d1d'][(r * 3 + k) % 4]; g.fillRect(xx - w * 0.03, yy, w * 0.06, h * 0.05); }
        else { g.fillStyle = '#121315'; g.beginPath(); g.arc(xx, yy + h * 0.03, w * 0.012, 0, 7); g.fill(); g.fillStyle = '#e6e6e0'; g.fillRect(xx - w * 0.004, yy + h * 0.008, w * 0.008, h * 0.03); }
      }
    }
    txt('ROYAL ELECTRICS', x0 + w * 0.5, y0 + h * 0.985, h * 0.022, '#d6a740');
  }
  // pedestal top: two CDUs, radio heads, trim wheel slots
  {
    const [x0, y0, w, h] = rect(AT.ped);
    g.fillStyle = '#3e4449'; g.fillRect(x0, y0, w, h);
    for (const u of [0.05, 0.53]) {
      g.fillStyle = '#16181b'; g.fillRect(x0 + w * u, y0 + h * 0.35, w * 0.42, h * 0.3);
      g.fillStyle = '#0b1d10'; g.fillRect(x0 + w * (u + 0.04), y0 + h * 0.37, w * 0.34, h * 0.1);
      txt('GOD SAVE', x0 + w * (u + 0.21), y0 + h * 0.4, h * 0.022, '#6af08a');
      txt('THE PILOT', x0 + w * (u + 0.21), y0 + h * 0.44, h * 0.022, '#6af08a');
      for (let k = 0; k < 24; k++) { g.fillStyle = '#c9ccd0'; g.fillRect(x0 + w * (u + 0.04 + (k % 6) * 0.058), y0 + h * (0.5 + Math.floor(k / 6) * 0.035), w * 0.04, h * 0.022); }
    }
    for (let r = 0; r < 4; r++) { g.fillStyle = '#16181b'; g.fillRect(x0 + w * 0.08, y0 + h * (0.7 + r * 0.07), w * 0.84, h * 0.05); g.fillStyle = '#ffb21e'; txt(['118.30', '121.50', 'VHF 3', 'ROYAL'][r], x0 + w * 0.3, y0 + h * (0.725 + r * 0.07), h * 0.025, '#ffb21e'); }
    g.fillStyle = '#16181b'; g.fillRect(x0 + w * 0.1, y0 + h * 0.03, w * 0.8, h * 0.28);
  }
  return canvasTexture(c, { aniso: 4 });
}

// display quads on the main panel: u -1..1 across, v 0..1 up, size in metres
function displayLayout(P) {
  const W = P._W, s = P.dispSize ?? 0.2, kx = (x) => x / W;
  const xs = P.dispX ?? [-0.9, -0.6, 0, 0.6, 0.9];
  return [
    { cell: 'pfd', u: kx(xs[0]), v: 0.55, size: s }, { cell: 'nd', u: kx(xs[1]), v: 0.55, size: s },
    { cell: 'eicas', u: kx(xs[2]), v: 0.62, size: s }, { cell: 'stat', u: kx(xs[2]), v: 0.24, size: s * 0.9 },
    { cell: 'nd', u: kx(xs[3]), v: 0.55, size: s }, { cell: 'pfd', u: kx(xs[4]), v: 0.55, size: s },
  ];
}

// ---------- live glass displays (4 cells in one texture, per-cell uploads like instruments.js) ----------
const CELLS = ['pfd', 'nd', 'eicas', 'stat'];
export function createGlassDisplays(quality, P = {}) {
  const C = quality === 'low' ? 256 : 384;
  const canvas = document.createElement('canvas'); canvas.width = C * 4; canvas.height = C;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4;
  const cells = {};
  CELLS.forEach((k, i) => { cells[k] = [i / 4, 0, (i + 1) / 4, 1]; });
  const target = { airspeed: 0, altitude: 0, vsi: 0, heading: 0, pitch: 0, roll: 0, rpm: 0, slip: 0, flaps: 0, gear: 1, fuelL: 0.8, fuelR: 0.76 };
  const shown = { ...target };
  const cellC = {}; for (const k of CELLS) { cellC[k] = document.createElement('canvas'); cellC[k].width = cellC[k].height = C; }
  const n1 = P.n1 || ((r) => clamp(r / 33, 0, 104));
  const font = (px, w = 700) => `${w} ${Math.round(px * C)}px 'Helvetica Neue', Arial, sans-serif`;

  function pfd(g) {
    const v = shown, cx = C * 0.5, cy = C * 0.47, k = C * 0.011; // px per degree
    g.save(); g.beginPath(); g.rect(C * 0.2, C * 0.12, C * 0.6, C * 0.66); g.clip();
    g.translate(cx, cy); g.rotate(-v.roll); g.translate(0, (v.pitch * 180 / Math.PI) * k);
    g.fillStyle = '#2f7fd6'; g.fillRect(-C, -C * 2, C * 2, C * 2);
    g.fillStyle = '#8a5a2b'; g.fillRect(-C, 0, C * 2, C * 2);
    g.strokeStyle = '#fff'; g.lineWidth = C * 0.006; g.beginPath(); g.moveTo(-C, 0); g.lineTo(C, 0); g.stroke();
    g.fillStyle = '#fff'; g.font = font(0.035);
    for (let d = -30; d <= 30; d += 5) { if (!d) continue; const y = -d * k, w = d % 10 ? C * 0.05 : C * 0.11; g.fillRect(-w, y - 1, w * 2, Math.max(1, C * 0.004)); if (!(d % 10)) { g.textAlign = 'left'; g.fillText(String(Math.abs(d)), w + 3, y + C * 0.012); } }
    g.restore();
    // aircraft symbol
    g.fillStyle = '#ffd400'; g.fillRect(cx - C * 0.17, cy - 2, C * 0.11, C * 0.016); g.fillRect(cx + C * 0.06, cy - 2, C * 0.11, C * 0.016); g.fillRect(cx - 3, cy - 3, 6, 6);
    // roll pointer arc
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, C * 0.27, -Math.PI * 0.83, -Math.PI * 0.17); g.stroke();
    g.save(); g.translate(cx, cy); g.rotate(-v.roll); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -C * 0.27); g.lineTo(-C * 0.02, -C * 0.24); g.lineTo(C * 0.02, -C * 0.24); g.fill(); g.restore();
    // speed + altitude tapes
    const tape = (x, val, step, fmt) => {
      g.fillStyle = 'rgba(70,75,82,0.9)'; g.fillRect(x, C * 0.12, C * 0.15, C * 0.66);
      g.fillStyle = '#fff'; g.font = font(0.04); g.textAlign = 'center';
      for (let i = -4; i <= 4; i++) { const t = Math.round(val / step) * step + i * step, y = cy - (t - val) / step * C * 0.075; if (y > C * 0.14 && y < C * 0.77) g.fillText(fmt(t), x + C * 0.075, y + C * 0.014); }
      g.fillStyle = '#000'; g.fillRect(x - 2, cy - C * 0.04, C * 0.15 + 4, C * 0.08); g.strokeStyle = '#fff'; g.strokeRect(x - 2, cy - C * 0.04, C * 0.15 + 4, C * 0.08);
      g.fillStyle = '#fff'; g.font = font(0.05); g.fillText(fmt(val), x + C * 0.075, cy + C * 0.018);
    };
    tape(C * 0.03, Math.max(0, v.airspeed), 10, (t) => String(Math.max(0, Math.round(t))));
    tape(C * 0.82, v.altitude, 100, (t) => String(Math.round(t)));
    // heading strip + modes
    g.fillStyle = 'rgba(70,75,82,0.9)'; g.fillRect(C * 0.2, C * 0.82, C * 0.6, C * 0.13);
    g.fillStyle = '#fff'; g.font = font(0.04); g.textAlign = 'center';
    for (let i = -3; i <= 3; i++) { const hd = Math.round(v.heading / 10) * 10 + i * 10, x = cx + (hd - v.heading) * C * 0.009; if (x > C * 0.22 && x < C * 0.78) g.fillText(String(((hd % 360) + 360) % 360 / 10 | 0), x, C * 0.9); }
    g.fillStyle = '#ff40ff'; g.fillRect(cx - 1, C * 0.82, 3, C * 0.04);
    g.fillStyle = '#5bff6a'; g.font = font(0.04); g.fillText('SPD', C * 0.3, C * 0.06); g.fillText('ROYAL', C * 0.5, C * 0.06); g.fillText('ALT', C * 0.7, C * 0.06);
  }
  function nd(g) {
    const v = shown, cx = C * 0.5, cy = C * 0.8, R = C * 0.62;
    g.fillStyle = '#000'; g.fillRect(0, 0, C, C);
    g.save(); g.translate(cx, cy); g.rotate(-v.heading * Math.PI / 180);
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, R, 0, 7); g.stroke();
    g.font = font(0.045); g.fillStyle = '#fff'; g.textAlign = 'center';
    for (let d = 0; d < 360; d += 10) { g.save(); g.rotate(d * Math.PI / 180); g.fillRect(-1, -R, 2, d % 30 ? C * 0.02 : C * 0.04); if (!(d % 30)) g.fillText(String(d / 10), 0, -R + C * 0.08); g.restore(); }
    g.restore();
    g.strokeStyle = '#7a7a7a'; g.setLineDash([4, 6]); g.beginPath(); g.arc(cx, cy, R * 0.5, Math.PI, 0); g.stroke(); g.setLineDash([]);
    // magenta route to the palace
    g.strokeStyle = '#ff40ff'; g.lineWidth = 3; g.beginPath();
    const off = Math.sin((v.heading - 90) * Math.PI / 180) * C * 0.2;
    g.moveTo(cx, cy); g.lineTo(cx - off, cy - C * 0.35); g.lineTo(cx - off * 1.8 + C * 0.12, cy - C * 0.7); g.stroke();
    g.fillStyle = '#ff40ff'; g.font = font(0.04); g.textAlign = 'left'; g.fillText('PALCE', cx - off * 1.8 + C * 0.15, cy - C * 0.7);
    g.fillStyle = '#3ad0ff'; g.fillText('CRWN1', cx - off + 6, cy - C * 0.35);
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx, cy - C * 0.04); g.lineTo(cx - C * 0.025, cy + C * 0.03); g.lineTo(cx + C * 0.025, cy + C * 0.03); g.fill();
    g.fillStyle = '#5bff6a'; g.textAlign = 'left'; g.font = font(0.04); g.fillText(`GS ${Math.round(v.airspeed)}`, C * 0.04, C * 0.07);
    g.textAlign = 'right'; g.fillText(`HDG ${String(Math.round(((v.heading % 360) + 360) % 360)).padStart(3, '0')}`, C * 0.96, C * 0.07);
  }
  function eicas(g) {
    const v = shown, n = n1(v.rpm);
    g.fillStyle = '#000'; g.fillRect(0, 0, C, C);
    for (let i = 0; i < 4; i++) {
      const cx = C * (0.14 + i * 0.24), cy = C * 0.22, r = C * 0.09, f = clamp(n / 110, 0, 1);
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r, Math.PI, Math.PI * 1.85); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, Math.PI, Math.PI + f * Math.PI * 0.85); g.fill();
      g.strokeStyle = '#fff'; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(Math.PI + f * Math.PI * 0.85) * r, cy + Math.sin(Math.PI + f * Math.PI * 0.85) * r); g.stroke();
      g.fillStyle = '#fff'; g.font = font(0.05); g.textAlign = 'center'; g.fillText(n.toFixed(1), cx, cy + C * 0.06);
      // EGT bar
      g.fillStyle = '#333'; g.fillRect(cx - C * 0.02, C * 0.42, C * 0.04, C * 0.2);
      g.fillStyle = n > 98 ? '#ffb21e' : '#fff'; const hgt = C * 0.2 * clamp(0.25 + n / 140, 0, 1); g.fillRect(cx - C * 0.02, C * 0.62 - hgt, C * 0.04, hgt);
    }
    g.fillStyle = '#3ad0ff'; g.font = font(0.045); g.textAlign = 'left';
    g.fillText('N1', C * 0.02, C * 0.08); g.fillText('EGT', C * 0.02, C * 0.5);
    g.fillStyle = '#fff'; g.fillText(`FUEL ${Math.round(((v.fuelL || 0) + (v.fuelR || 0)) * 80)}.0`, C * 0.04, C * 0.74);
    g.fillStyle = '#5bff6a'; g.fillText(`FLAPS ${Math.round((v.flaps || 0) * 30)}`, C * 0.56, C * 0.74);
    g.fillStyle = '#ffb21e'; g.fillText('CORGI ON BOARD', C * 0.04, C * 0.88);
  }
  function stat(g) {
    const v = shown, down = (v.gear ?? 1) > 0.98, up = (v.gear ?? 1) < 0.02;
    g.fillStyle = '#000'; g.fillRect(0, 0, C, C);
    g.font = font(0.06); g.textAlign = 'center';
    g.strokeStyle = down ? '#5bff6a' : up ? '#fff' : '#ffb21e'; g.lineWidth = 3;
    g.strokeRect(C * 0.22, C * 0.1, C * 0.56, C * 0.16);
    g.fillStyle = g.strokeStyle; g.fillText(down ? 'GEAR DOWN' : up ? 'GEAR UP' : 'GEAR IN TRANSIT', C * 0.5, C * 0.2);
    g.font = font(0.048); g.fillStyle = '#5bff6a'; g.textAlign = 'left';
    const lines = ['TEA ........ HOT', 'CROWN ... SECURE', 'CARPET .... RED', 'DOORS ..... SHUT'];
    lines.forEach((s, i) => g.fillText(s, C * 0.1, C * (0.42 + i * 0.12)));
    g.fillStyle = '#3ad0ff'; g.fillText(`RPM ${Math.round(v.rpm)}`, C * 0.1, C * 0.92);
  }
  const DRAW = { pfd, nd, eicas, stat };
  const R = Math.round;
  const KEY = {
    pfd: (v) => [R(v.airspeed), R(v.altitude / 10), R(v.heading), R(v.pitch * 400), R(v.roll * 400)],
    nd: (v) => [R(v.heading), R(v.airspeed / 5)], eicas: (v) => [R(n1(v.rpm) * 2), R(v.flaps * 30), R(((v.fuelL || 0) + (v.fuelR || 0)) * 40)],
    stat: (v) => [R((v.gear ?? 1) * 20), R(v.rpm / 20)],
  };
  const keys = {}, dirty = new Set(CELLS);
  function drawCell(k) {
    const g = cellC[k].getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#000'; g.fillRect(0, 0, C, C);
    DRAW[k](g);
    ctx.drawImage(cellC[k], CELLS.indexOf(k) * C, 0);
  }
  function set(s) { for (const k of Object.keys(target)) if (typeof s[k] === 'number' && Number.isFinite(s[k])) target[k] = s[k]; }
  let acc = 1, tick = 0, attached = false;
  function update(dt) {
    const e = (r) => 1 - Math.exp(-dt * r);
    for (const k of ['airspeed', 'altitude', 'vsi', 'rpm', 'pitch', 'roll', 'flaps', 'gear']) shown[k] += (target[k] - shown[k]) * e(8);
    let dh = target.heading - shown.heading; dh = ((dh + 540) % 360) - 180;
    shown.heading = (shown.heading + dh * e(9) + 360) % 360;
    shown.fuelL = target.fuelL; shown.fuelR = target.fuelR;
    acc += dt;
    if (!attached) flush(null);
  }
  const SLOW = new Set(['nd', 'eicas', 'stat']);
  function attach(mesh) { attached = true; mesh.onBeforeRender = (r) => flush(r); }
  function flush(renderer) {
    if (acc < 0.066) return;
    acc = 0; tick++;
    for (const k of CELLS) {
      if (tick % 3 && SLOW.has(k)) continue;
      const nk = KEY[k](shown), ok = keys[k];
      if (ok && nk.every((v, i) => v === ok[i])) continue;
      keys[k] = nk; dirty.add(k);
    }
    if (!dirty.size) return;
    for (const k of dirty) drawCell(k);
    const props = renderer?.properties.get(texture);
    if (!props?.__webglTexture || props.__version !== texture.version) { texture.needsUpdate = true; dirty.clear(); return; }
    const gl = renderer.getContext();
    renderer.state.bindTexture(gl.TEXTURE_2D, props.__webglTexture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, texture.flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, texture.premultiplyAlpha);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    for (const k of dirty) gl.texSubImage2D(gl.TEXTURE_2D, 0, CELLS.indexOf(k) * C, 0, gl.RGBA, gl.UNSIGNED_BYTE, cellC[k]);
    if (texture.generateMipmaps) gl.generateMipmap(gl.TEXTURE_2D);
    dirty.clear();
  }
  for (const k of CELLS) drawCell(k);
  dirty.clear();
  texture.needsUpdate = true;
  return { canvas, texture, cells, set, update, attach, flush, shown, dispose() { texture.dispose(); } };
}

// ---------- the flight deck ----------
export function buildGlassCockpit(quality, mats, ctx, P) {
  const high = quality === 'high';
  const n = (k) => Math.max(6, Math.round(k * (high ? 1 : 0.6)));
  const sec = P.sec, SH = P.shell;
  const group = new THREE.Group();
  group.name = 'glass-cockpit';
  const B = new Builder();
  const cpMat = pbrMaterial('glass-cockpit');
  const hw = (s, y, inset = SH.inset) => Math.max(0.05, secHalfWidth(sec(s), y) - inset);

  // inner shell with the windows cut out (grid knots on every window edge)
  {
    const holes = [];
    for (const h of SH.holes) { holes.push(h); holes.push([h[0], h[1], 2 * Math.PI - h[3], 2 * Math.PI - h[2]]); }
    const ss = new Set([SH.s0, SH.s1]), ts = new Set();
    for (let s = SH.s0; s < SH.s1; s += high ? 0.2 : 0.32) ss.add(+s.toFixed(3));
    const NT = SH.nt ?? 64;
    for (let j = 0; j <= NT; j++) ts.add(+((j / NT) * Math.PI * 2).toFixed(5));
    for (const h of holes) { ss.add(h[0]); ss.add(h[1]); ts.add(+h[2].toFixed(5)); ts.add(+h[3].toFixed(5)); }
    const S = [...ss].filter((s) => s >= SH.s0 && s <= SH.s1).sort((a, b) => a - b), Tt = [...ts].sort((a, b) => a - b);
    const P3 = (s, t) => secPt(sec(s), t, SH.inset);
    const inHole = (s, t) => holes.some((h) => s > h[0] && s < h[1] && t > h[2] && t < h[3]);
    const col = (p) => (p[1] < P.floorY ? COL.black : p[1] > (P.eye.y + 0.55) ? COL.wallLight : COL.wall);
    const idx = [];
    for (let i = 0; i < S.length; i++) {
      idx[i] = [];
      for (let j = 0; j < Tt.length; j++) {
        const s = S[i], t = Tt[j], p = P3(s, t);
        const a = P3(s + 0.01, t), b = P3(s, t + 0.01);
        const du = [a[0] - p[0], a[1] - p[1], a[2] - p[2]], dv = [b[0] - p[0], b[1] - p[1], b[2] - p[2]];
        let nn = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
        const radial = [p[0], p[1] - sec(s).yc, 0];
        if (nn[0] * radial[0] + nn[1] * radial[1] > 0) nn = nn.map((v) => -v);
        const l = Math.hypot(...nn) || 1;
        idx[i][j] = B.v(p, nn.map((v) => v / l), RM.cloth, col(p));
      }
    }
    for (let i = 0; i < S.length - 1; i++) for (let j = 0; j < Tt.length - 1; j++) {
      if (inHole((S[i] + S[i + 1]) / 2, (Tt[j] + Tt[j + 1]) / 2)) continue;
      const a = idx[i][j], b = idx[i + 1][j], c = idx[i + 1][j + 1], d = idx[i][j + 1];
      B.t(a, c, b); B.t(a, d, c);
    }
    // window frames: a dark rubber reveal round each hole
    for (const h of holes) {
      const ring = [], K = 6;
      for (let k = 0; k < K; k++) ring.push([lerp(h[0], h[1], k / K), h[2]]);
      for (let k = 0; k < K; k++) ring.push([h[1], lerp(h[2], h[3], k / K)]);
      for (let k = 0; k < K; k++) ring.push([lerp(h[1], h[0], k / K), h[3]]);
      for (let k = 0; k < K; k++) ring.push([h[0], lerp(h[3], h[2], k / K)]);
      const inner = ring.map(([s, t]) => secPt(sec(s), t, SH.inset + 0.005)), outer = ring.map(([s, t]) => secPt(sec(s), t, SH.inset - 0.06));
      const c3 = secPt(sec((h[0] + h[1]) / 2), (h[2] + h[3]) / 2, SH.inset);
      B.loft([outer, inner], { color: COL.rubber, uv: () => RM.rubber, out: (p) => [c3[0] - p[0], c3[1] - p[1], c3[2] - p[2]] });
    }
    // forward bulkhead + aft wall
    for (const [s, dir] of [[SH.s0, 1], [SH.s1, -1]]) {
      const ring = []; for (let j = 0; j < 48; j++) ring.push(secPt(sec(s), (j / 48) * Math.PI * 2, SH.inset));
      fan(B, ring, [0, 0, dir], RM.cloth, dir > 0 ? COL.black : COL.wallDark);
    }
    // aft wall door with a gold crown sign
    B.addGeo(new THREE.BoxGeometry(0.8, 1.9, 0.04), M4(0.45, P.floorY + 0.96, SH.s1 - 0.03), RM.paint, COL.wallLight);
    B.addGeo(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), M4(0.15, P.floorY + 1.0, SH.s1 - 0.07, 1, 1, 1, 0, 0, Math.PI / 2), RM.chrome, COL.chrome);
    B.addGeo(new THREE.BoxGeometry(0.22, 0.12, 0.02), M4(0.45, P.floorY + 1.72, SH.s1 - 0.06), RM.gold, COL.gold);
  }
  // floor (purple royal carpet)
  {
    const rows = [];
    for (let s = SH.s0 + 0.2; s <= SH.s1 + 1e-6; s += 0.3) { const w = hw(s, P.floorY + 0.02); rows.push([[-w, P.floorY, s], [w, P.floorY, s]]); }
    B.loft(rows, { closed: false, out: () => [0, 1, 0], color: COL.carpet, uv: () => RM.cloth });
  }
  // glareshield deck from the nose to the panel, with a hood over the displays
  const PS = P.panel.s, Y1 = P.panel.y1, Y0 = P.panel.y0, GY = P.glare.y, GD = P.glare.depth;
  {
    const rows = [];
    for (let s = SH.s0 + 0.02; s <= PS + GD + 1e-6; s += 0.15) {
      const top = Math.min(GY, secPt(sec(s), 0, SH.inset + 0.06)[1]);
      const w = Math.min(hw(s, top - 0.02, SH.inset + 0.03), hw(PS, GY - 0.02, SH.inset + 0.03));
      const lip = s > PS + GD - 0.07;
      rows.push([[-w, top - (lip ? 0.1 : 0.06), s], [-w, top, s], [w, top, s], [w, top - (lip ? 0.1 : 0.06), s]]);
    }
    B.loft(rows, { closed: false, out: () => [0, 1, 0], color: COL.glare, uv: () => [0.85, 0] });
    const w = hw(PS, GY - 0.02, SH.inset + 0.03);
    B.addGeo(new THREE.BoxGeometry(2 * w, GY - Y1 + 0.02, 0.04), M4(0, (GY + Y1) / 2, PS + GD - 0.02), RM.paint, COL.panel);
    // a little gold crown on the glareshield centre (the royal compass)
    B.addGeo(new THREE.CylinderGeometry(0.06, 0.055, 0.05, n(12), 1, true), M4(0, GY + 0.025, PS + 0.15), RM.gold, COL.gold);
    B.addGeo(new THREE.SphereGeometry(0.052, n(10), 4, 0, Math.PI * 2, 0, Math.PI / 2), M4(0, GY + 0.04, PS + 0.15, 1, 0.6, 1), RM.cloth, COL.red);
  }
  // pedestal, side consoles, rudder pedals
  {
    const pd = P.pedestal, h = pd.y - P.floorY;
    B.addGeo(new THREE.BoxGeometry(pd.w, h, pd.s1 - pd.s0), M4(0, P.floorY + h / 2, (pd.s0 + pd.s1) / 2), RM.paint, COL.panel);
    // the panel's lower centre stack down to the pedestal
    B.addGeo(new THREE.BoxGeometry(pd.w + 0.1, Y0 - P.floorY, 0.3), M4(0, (Y0 + P.floorY) / 2, PS + 0.12), RM.paint, COL.panel);
    for (const sg of [-1, 1]) {
      const sx = sg * (hw(P.seatS, P.floorY + 0.5) - 0.18);
      B.addGeo(new THREE.BoxGeometry(0.26, 0.55, 1.1), M4(sx, P.floorY + 0.28, P.seatS - 0.3), RM.paint, COL.wallDark);
      for (const dx of [-0.11, 0.11]) B.addGeo(new THREE.BoxGeometry(0.08, 0.2, 0.03), M4(P.seats[sg < 0 ? 0 : 1] + dx, P.floorY + 0.2, PS + 0.42, 1, 1, 1, -0.5, 0, 0), RM.rubber, COL.black);
    }
    // the panel's under-skirt so you never see under it
    const w = hw(PS, Y0, SH.inset + 0.02);
    B.addGeo(new THREE.BoxGeometry(2 * w, Y0 - P.floorY, 0.04), M4(0, (Y0 + P.floorY) / 2, PS - 0.03), RM.paint, COL.wallDark);
  }
  // seats: purple velvet with gold piping and a sheepskin
  for (const sx of P.seats) {
    const sy = P.floorY, ss = P.seatS;
    B.addGeo(new THREE.CylinderGeometry(0.06, 0.08, 0.3, n(10)), M4(sx, sy + 0.15, ss), RM.steel, COL.steel);
    B.addGeo(new THREE.BoxGeometry(0.52, 0.12, 0.5), M4(sx, sy + 0.38, ss - 0.06), RM.cloth, COL.velvet);
    B.addGeo(new THREE.BoxGeometry(0.5, 0.82, 0.13), M4(sx, sy + 0.86, ss + 0.24, 1, 1, 1, -0.16, 0, 0), RM.cloth, COL.velvet);
    B.addGeo(new THREE.BoxGeometry(0.3, 0.2, 0.12), M4(sx, sy + 1.36, ss + 0.33, 1, 1, 1, -0.16, 0, 0), RM.cloth, COL.velvetDark);
    for (const dx of [-0.27, 0.27]) {
      B.addGeo(new THREE.BoxGeometry(0.07, 0.06, 0.42), M4(sx + dx, sy + 0.6, ss - 0.02), RM.leather, COL.velvetDark);
      B.addGeo(new THREE.BoxGeometry(0.012, 0.8, 0.012), M4(sx + dx * 0.93, sy + 0.86, ss + 0.17, 1, 1, 1, -0.16, 0, 0), RM.gold, COL.gold);
    }
  }
  // royal tea on the right console
  {
    const tx = P.seats[1] + 0.45 * Math.sign(P.seats[1] || 1), ty = P.floorY + 0.57, tz = P.seatS - 0.55;
    const tw = hw(P.seatS - 0.55, ty) - 0.22;
    const x = Math.min(tx, tw);
    B.addGeo(new THREE.CylinderGeometry(0.075, 0.07, 0.012, n(14)), M4(x, ty, tz), RM.enamel, COL.porcelain);
    B.addGeo(new THREE.CylinderGeometry(0.045, 0.035, 0.07, n(12), 1, true), M4(x, ty + 0.04, tz), RM.enamel, COL.porcelain);
    B.addGeo(new THREE.CylinderGeometry(0.041, 0.041, 0.004, n(12)), M4(x, ty + 0.065, tz), RM.water, COL.tea);
    B.addGeo(new THREE.TorusGeometry(0.02, 0.006, 4, 10), M4(x + 0.05, ty + 0.045, tz), RM.enamel, COL.porcelain);
    B.addGeo(new THREE.TorusGeometry(0.045, 0.004, 4, n(14)), M4(x, ty + 0.074, tz, 1, 1, 1, Math.PI / 2, 0, 0), RM.gold, COL.gold);
  }
  const structure = new THREE.Mesh(B.build(), cpMat);
  structure.name = 'cockpit-shell'; structure.receiveShadow = true;
  group.add(structure);

  // textured faces: main panel, MCP strip, overhead, pedestal top
  const W = hw(PS, (Y0 + Y1) / 2, SH.inset + 0.03);
  P._W = W;
  const tex = panelAtlas(quality, P);
  const tb = new Builder();
  const quad = (pts, uvs) => { const nn = [0, 0, 1]; const base = tb.count; pts.forEach((p, i) => tb.v(p, nn, uvs[i])); tb.t(base, base + 1, base + 2); tb.t(base, base + 2, base + 3); };
  const uvR = (r, u, v) => [lerp(r[0], r[2], u), 1 - lerp(r[1], r[3], 1 - v)];
  {
    // main panel: outline follows the skin at each height; leaned back by `tilt`
    const K = 6, tilt = P.panel.tilt ?? 0.12, rows = [];
    for (let k = 0; k <= K; k++) {
      const y = lerp(Y0, Y1, k / K), w = hw(PS, y, SH.inset + 0.03), s = PS - (y - Y0) * Math.tan(tilt);
      rows.push([[-w, y, s], [w, y, s]]);
    }
    for (let k = 0; k < K; k++) {
      const [a, b] = rows[k], [d, c] = rows[k + 1];
      const uv = (p) => uvR(AT.main, (p[0] / W + 1) / 2, (p[1] - Y0) / (Y1 - Y0));
      quad([a, b, c, d], [uv(a), uv(b), uv(c), uv(d)]);
    }
    // MCP on the glareshield's aft face
    const mw = W * 0.98, ms = PS + GD + 0.002;
    quad([[-mw, GY - 0.1, ms], [mw, GY - 0.1, ms], [mw, GY - 0.005, ms], [-mw, GY - 0.005, ms]], [uvR(AT.mcp, 0, 0), uvR(AT.mcp, 1, 0), uvR(AT.mcp, 1, 1), uvR(AT.mcp, 0, 1)]);
    // pedestal top
    const pd = P.pedestal, pw = pd.w / 2 - 0.01;
    quad([[-pw, pd.y + 0.002, pd.s1], [pw, pd.y + 0.002, pd.s1], [pw, pd.y + 0.002, pd.s0 + 0.2], [-pw, pd.y + 0.002, pd.s0 + 0.2]], [uvR(AT.ped, 0, 1), uvR(AT.ped, 1, 1), uvR(AT.ped, 1, 0), uvR(AT.ped, 0, 0)]);
  }
  // overhead panel slab following the ceiling
  const OH = P.overhead;
  if (OH) {
    const rows = [], tr = [];
    const ceil = (s) => secPt(sec(s), 0, SH.inset)[1];
    for (let k = 0; k <= 5; k++) {
      const s = lerp(OH.s0, OH.s1, k / 5), y = Math.min(OH.y, ceil(s) - 0.06) - (OH.dip ?? 0.16) * (1 - k / 5) ** 2, w = OH.w ?? 0.5;
      rows.push([[-w, y, s], [w, y, s]]);
      tr.push([[-w, y, s], [-w, ceil(s) + 0.05, s], [w, ceil(s) + 0.05, s], [w, y, s]]);
    }
    for (let k = 0; k < 5; k++) {
      const [a, b] = rows[k], [d, c] = rows[k + 1];
      const uv = (p, kk) => uvR(AT.over, (p[0] / (OH.w ?? 0.5) + 1) / 2, 1 - kk / 5);
      const base = tb.count, nn = [0, -1, 0];
      tb.v(a, nn, uv(a, k)); tb.v(b, nn, uv(b, k)); tb.v(c, nn, uv(c, k + 1)); tb.v(d, nn, uv(d, k + 1));
      tb.t(base, base + 1, base + 2); tb.t(base, base + 2, base + 3);
    }
    const sb = new Builder();
    sb.loft(tr, { closed: false, out: () => [0, -1, 0], color: COL.panel, uv: () => RM.paint });
    structure.geometry.dispose();
    B.append(sb);
    structure.geometry = B.build();
  }
  const panelMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.1, emissiveMap: tex, emissive: 0x000000, emissiveIntensity: 0 });
  const panelMesh = new THREE.Mesh(tb.build(), panelMat);
  panelMesh.name = 'panel';
  group.add(panelMesh);

  // live displays
  const inst = createGlassDisplays(quality, P);
  const db = new Builder();
  {
    const tilt = P.panel.tilt ?? 0.12;
    for (const d of displayLayout(P)) {
      const [u0, v0, u1, v1] = inst.cells[d.cell], r = d.size / 2;
      const x = d.u * W, y = lerp(Y0, Y1, d.v), s = PS - (y - Y0) * Math.tan(tilt) + 0.004;
      const dy = Math.cos(tilt) * r, dz = Math.sin(tilt) * r;
      const nn = [0, Math.sin(tilt), Math.cos(tilt)];
      const a = db.v([x - r, y - dy, s + dz], nn, [u0, v0]), b = db.v([x + r, y - dy, s + dz], nn, [u1, v0]);
      const c = db.v([x + r, y + dy, s - dz], nn, [u1, v1]), e = db.v([x - r, y + dy, s - dz], nn, [u0, v1]);
      db.t(a, b, c); db.t(a, c, e);
    }
  }
  const dispMat = new THREE.MeshBasicMaterial({ map: inst.texture, color: 0xdedede });
  const displays = new THREE.Mesh(db.build(), dispMat);
  displays.name = 'gauges';
  group.add(displays);
  inst.attach(displays);

  // thrust levers (+ flap lever, speed brake) on the pedestal
  const levers = new THREE.Group();
  levers.position.set(0, P.pedestal.y, P.pedestal.s0 + 0.35);
  {
    const lb = new Builder(), N = P.levers || 4;
    for (let i = 0; i < N; i++) {
      const x = lerp(-0.1, 0.1, N > 1 ? i / (N - 1) : 0.5);
      rod(lb, [x, 0, 0], [x, 0.15, 0], 0.007, 6, RM.steel, COL.steel);
      lb.addGeo(new THREE.BoxGeometry(0.03, 0.025, 0.04), M4(x, 0.16, 0), RM.plastic, COL.lever);
    }
    lb.addGeo(new THREE.BoxGeometry(0.22, 0.018, 0.015), M4(0, 0.15, 0.02), RM.gold, COL.gold);
    levers.add(new THREE.Mesh(lb.build(), cpMat));
  }
  group.add(levers);
  const flapLever = new THREE.Group();
  flapLever.position.set(0.18, P.pedestal.y, P.pedestal.s0 + 0.5);
  {
    const fb = new Builder();
    rod(fb, [0, 0, 0], [0, 0.1, 0], 0.006, 6, RM.steel, COL.steel);
    fb.addGeo(new THREE.BoxGeometry(0.035, 0.02, 0.03), M4(0, 0.105, 0), RM.plastic, COL.knob);
    flapLever.add(new THREE.Mesh(fb.build(), cpMat));
  }
  group.add(flapLever);

  // yokes: the captain's rides the rig's stick pivot (the pilot's hands follow it); the F/O's copies it
  const yokeGeo = () => {
    const yb = new Builder();
    rod(yb, [0, 0, 0.02], [0, -(P.yoke.y - P.floorY) + 0.05, 0.06], 0.035, n(8), RM.paint, COL.panel);
    yb.addGeo(new THREE.CylinderGeometry(0.045, 0.045, 0.06, n(12)), M4(0, 0, 0, 1, 1, 1, Math.PI / 2, 0, 0), RM.plastic, COL.lever);
    rod(yb, [-0.15, 0.0, -0.01], [0.15, 0.0, -0.01], 0.018, n(8), RM.plastic, COL.lever);
    for (const sg of [-1, 1]) {
      rod(yb, [sg * 0.15, 0.0, -0.01], [sg * 0.17, 0.09, -0.02], 0.02, n(8), RM.leather, COL.lever);
      yb.addGeo(new THREE.BoxGeometry(0.015, 0.02, 0.02), M4(sg * 0.17, 0.1, -0.03), RM.gold, COL.gold);
    }
    yb.addGeo(new THREE.BoxGeometry(0.07, 0.04, 0.01), M4(0, 0.02, -0.04), RM.gold, COL.gold);
    return yb.build();
  };
  const yokeC = new THREE.Mesh(yokeGeo(), cpMat); yokeC.name = 'yoke';
  ctx.stick.add(yokeC);
  const yokeF = new THREE.Mesh(yokeGeo(), cpMat); yokeF.name = 'yoke-fo';
  group.add(yokeF);

  function setNight(nn) {
    nn = clamp(nn, 0, 1);
    panelMat.emissive.setRGB(0.9, 0.8, 0.6);
    panelMat.emissiveIntensity = nn * 0.35;
    dispMat.color.setScalar(0.87 - nn * 0.25);
  }
  function setDetail(on) { group.visible = on; yokeC.visible = on; ctx.inside = on; }
  function update(dt, cur, ctl) {
    levers.rotation.x = (0.5 - cur.throttle) * 0.9;
    flapLever.rotation.x = -0.15 + cur.flaps * 0.6;
    const st = ctx.stick;
    yokeF.position.set(P.seats[1], st.position.y, st.position.z);
    yokeF.rotation.copy(st.rotation);
    inst.set({ gear: ctx.gearShown ?? 1, flaps: cur.flaps });
    inst.update(dt);
  }
  return {
    group, instruments: inst, update, setNight, setDetail,
    dispose() { tex.dispose(); panelMat.dispose(); dispMat.dispose(); cpMat.dispose(); inst.dispose(); yokeC.geometry.dispose(); yokeC.removeFromParent(); },
  };
}

// The royal captain in the left seat, both hands on the yoke horns. Only drawn from inside (the glass is opaque).
export function glassPilot(quality, cfg, ctx, P) {
  const seat = { x: P.seats[0], y: P.eye.y - 0.62, s: P.eye.s - 0.03 };
  const _v = new THREE.Vector3();
  const av = createAviator({
    quality, cfg, seat, outfit: 'flyer', gripLocal: [0.16, 0.06, -0.02], elbowOut: 0.35, passengers: [],
    leftHand: (cur, c) => { c.stick.updateMatrix(); return _v.set(-0.16, 0.06, -0.02).applyMatrix4(c.stick.matrix).toArray(); },
  });
  const still = { stick: null, airspeed: 0, rpm: 0 };
  return {
    get mesh() { return av.mesh; },
    update(dt, cur, c) { av.mesh.visible = !!ctx.inside; if (!ctx.inside) return; still.stick = c.stick; av.update(dt, cur, still); },
    setHideBody: (v) => av.setHideBody(v),
    setConfig: (o) => av.setConfig(o),
    get config() { return av.config; },
    dispose: () => av.dispose(),
  };
}
