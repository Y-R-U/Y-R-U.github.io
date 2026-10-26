import * as THREE from 'three';
import { monotone } from './geom.js';
import { WINDOWS, DOOR, FIN, WING } from './spec.js';

// Atlas regions as canvas fractions (y from the top). Side regions map (station, height); plan regions (span, station).
export const REG = {
  fusL: { x0: 0, x1: 1, y0: 0, y1: 0.25, s0: -0.05, s1: 8.35, h0: 0.35, h1: 2.15, flip: false },
  fusR: { x0: 0, x1: 1, y0: 0.25, y1: 0.5, s0: -0.05, s1: 8.35, h0: 0.35, h1: 2.15, flip: true },
  finL: { x0: 0, x1: 0.5, y0: 0.5, y1: 0.66, s0: 5.2, s1: 8.4, h0: 1.3, h1: 2.8, flip: false },
  finR: { x0: 0.5, x1: 1, y0: 0.5, y1: 0.66, s0: 5.2, s1: 8.4, h0: 1.3, h1: 2.8, flip: true },
  wingT: { x0: 0, x1: 1, y0: 0.66, y1: 0.82, a0: -5.7, a1: 5.7, s0: 2.05, s1: 3.9, flip: false },
  wingB: { x0: 0, x1: 1, y0: 0.82, y1: 0.98, a0: -5.7, a1: 5.7, s0: 2.05, s1: 3.9, flip: true },
};
const SW = ['primary', 'secondary', 'accent', 'white', 'dark', 'metal', 'primaryDark', 'black'];

export function uvSide(r, s, h) {
  let fx = (s - r.s0) / (r.s1 - r.s0);
  if (r.flip) fx = 1 - fx;
  fx = Math.min(0.999, Math.max(0.001, fx));
  const fy = Math.min(0.999, Math.max(0.001, (r.h1 - h) / (r.h1 - r.h0)));
  return [r.x0 + fx * (r.x1 - r.x0), 1 - (r.y0 + fy * (r.y1 - r.y0))];
}
export function uvPlan(r, x, s) {
  let fx = (x - r.a0) / (r.a1 - r.a0);
  if (r.flip) fx = 1 - fx;
  fx = Math.min(0.999, Math.max(0.001, fx));
  const fy = Math.min(0.999, Math.max(0.001, (s - r.s0) / (r.s1 - r.s0)));
  return [r.x0 + fx * (r.x1 - r.x0), 1 - (r.y0 + fy * (r.y1 - r.y0))];
}
export function uvSwatch(name) {
  const i = SW.indexOf(name);
  return [(i + 0.5) / SW.length, 1 - 0.99];
}

const lum = (hex) => {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
};
const contrast = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
function pick(bg, prefs, min = 3) {
  for (const p of prefs) if (contrast(p, bg) >= min) return p;
  return contrast('#ffffff', bg) > contrast('#14171c', bg) ? '#ffffff' : '#14171c';
}
const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

// cheat line centre height along the fuselage
const stripeC = monotone([0.2, 0.9, 1.6, 2.4, 3.9, 4.6, 5.4, 6.4, 7.3, 8.4], [1.24, 1.27, 1.31, 1.36, 1.38, 1.43, 1.49, 1.51, 1.505, 1.5]);
const stripeW = monotone([0.2, 3.9, 6.0, 8.4], [0.15, 0.15, 0.11, 0.07]);

export function createLivery({ quality = 'high', holes = true } = {}) {
  const S = quality === 'low' ? 1024 : 2048;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = quality === 'low' ? 4 : 8;
  texture.generateMipmaps = true;

  const mask = document.createElement('canvas');
  mask.width = mask.height = 512;
  const roughTex = new THREE.CanvasTexture(mask);

  const side = (r) => {
    const kx = (S * (r.x1 - r.x0)) / (r.s1 - r.s0), ky = (S * (r.y1 - r.y0)) / (r.h1 - r.h0);
    return r.flip
      ? { a: -kx, d: -ky, e: S * r.x0 + r.s1 * kx, f: S * r.y0 + r.h1 * ky, kx, ky, flip: true }
      : { a: kx, d: -ky, e: S * r.x0 - r.s0 * kx, f: S * r.y0 + r.h1 * ky, kx, ky, flip: false };
  };
  const plan = (r) => {
    const kx = (S * (r.x1 - r.x0)) / (r.a1 - r.a0), ky = (S * (r.y1 - r.y0)) / (r.s1 - r.s0);
    return r.flip
      ? { a: -kx, d: ky, e: S * r.x0 + r.a1 * kx, f: S * r.y0 - r.s0 * ky, kx, ky, flip: true }
      : { a: kx, d: ky, e: S * r.x0 - r.a0 * kx, f: S * r.y0 - r.s0 * ky, kx, ky, flip: false };
  };
  const region = (c, r, T, fn) => {
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath();
    c.rect(Math.floor(r.x0 * S), Math.floor(r.y0 * S), Math.ceil((r.x1 - r.x0) * S), Math.ceil((r.y1 - r.y0) * S));
    c.clip();
    c.setTransform(T.a, 0, 0, T.d, T.e, T.f);
    fn(c, T);
    c.restore();
  };
  const poly = (c, pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };

  // Text laid out in metres inside a box (cx, cy centre, w x h), never mirrored, optional slope.
  function text(c, T, str, cx, cy, w, h, { font = 'italic 800', fill = '#fff', stroke = null, slope = 0, plan: isPlan = false, lines = 1 } = {}) {
    if (!str) return;
    const family = "100px 'Helvetica Neue', 'Segoe UI', Roboto, Arial, sans-serif";
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.font = `${font} ${family}`;
    let rows = [str];
    if (lines > 1 && str.includes(' ') && str.length > 7) {
      let best = null;
      const words = str.split(' ');
      for (let k = 1; k < words.length; k++) {
        const a = words.slice(0, k).join(' '), b = words.slice(k).join(' ');
        const m = Math.max(c.measureText(a).width, c.measureText(b).width);
        if (!best || m < best.m) best = { m, rows: [a, b] };
      }
      const single = c.measureText(str).width;
      const emSingle = Math.min(h / 0.74, w / (single / 100));
      const emDouble = Math.min(h / (0.74 * 2 + 0.3), w / (best.m / 100));
      if (emDouble > emSingle * 1.15) rows = best.rows;
    }
    const widest = Math.max(...rows.map((r) => c.measureText(r).width));
    const cap = 0.72;
    const em = Math.min(h / (cap * rows.length + 0.3 * (rows.length - 1)), w / (widest / 100));
    const px = T.a * cx + T.e, py = T.d * cy + T.f;
    c.translate(px, py);
    c.scale(T.kx, T.ky);
    if (slope) c.rotate(isPlan ? slope : (T.flip ? slope : -slope));
    c.scale(em / 100, em / 100);
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.lineJoin = 'round';
    const lh = (cap + 0.3) * 100;
    rows.forEach((r, i) => {
      const y = cap * 50 + (i - (rows.length - 1) / 2) * lh;
      if (stroke) { c.strokeStyle = stroke; c.lineWidth = 9; c.strokeText(r, 0, y); }
      c.fillStyle = fill;
      c.fillText(r, 0, y);
    });
    c.restore();
  }

  function stripeBand(c, s0, s1, off, wk) {
    c.beginPath();
    const N = 60;
    for (let i = 0; i <= N; i++) { const s = s0 + ((s1 - s0) * i) / N; c.lineTo(s, stripeC(s) + off + stripeW(s) * wk[0]); }
    for (let i = N; i >= 0; i--) { const s = s0 + ((s1 - s0) * i) / N; c.lineTo(s, stripeC(s) + off + stripeW(s) * wk[1]); }
    c.closePath();
  }

  function paintSide(c, T, L, isHoles) {
    const { primary, secondary, accent } = L;
    c.fillStyle = primary;
    c.fillRect(-1, 0, 10, 3);
    // belly: subtle darker band reads as a separate lower panel
    c.fillStyle = shade(primary, 0.93);
    c.beginPath(); c.moveTo(-1, 0); for (let s = -0.2; s <= 8.5; s += 0.1) c.lineTo(s, 0.86 + Math.max(0, s - 3.6) * 0.105); c.lineTo(9, 0); c.closePath(); c.fill();
    // cheat line + accent pinstripes
    c.fillStyle = secondary; stripeBand(c, 0.15, 8.5, 0, [-0.5, 0.5]); c.fill();
    c.fillStyle = accent; stripeBand(c, 0.15, 8.5, 0, [0.62, 0.86]); c.fill();
    c.fillStyle = accent; stripeBand(c, 0.15, 8.5, 0, [-0.66, -0.58]); c.fill();
    // grime + skin laps + rivet rows (subtle, real airframes have them)
    const gg = c.createLinearGradient(0, 0.62, 0, 0.92);
    gg.addColorStop(0, 'rgba(30,26,22,0.16)'); gg.addColorStop(1, 'rgba(30,26,22,0)');
    c.fillStyle = gg; c.beginPath(); c.moveTo(1.35, 0.5); c.lineTo(1.4, 0.8); c.quadraticCurveTo(2.6, 0.86, 4.6, 0.98); c.lineTo(4.6, 0.5); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(10,12,16,0.13)'; c.lineWidth = 0.006;
    c.setLineDash([0.008, 0.03]);
    for (const st of [4.55, 5.15, 5.75, 6.35, 6.95]) { c.beginPath(); c.moveTo(st, 0.8); c.lineTo(st + 0.03, 1.95); c.stroke(); }
    c.beginPath(); for (let st = 4.0; st <= 8; st += 0.1) c.lineTo(st, 1.62 - (st - 4) * 0.035); c.stroke();
    c.setLineDash([]);
    // panel lines: cowl seam, door, oil door, baggage door
    c.strokeStyle = 'rgba(10,12,16,0.55)';
    c.lineWidth = 0.008;
    c.beginPath(); c.moveTo(1.45, 0.6); c.lineTo(1.45, 1.53); c.stroke();
    c.beginPath(); c.moveTo(0.42, 1.0); c.quadraticCurveTo(0.9, 0.96, 1.45, 0.98); c.stroke();
    poly(c, DOOR); c.stroke();
    c.beginPath(); c.roundRect(3.97, 0.98, 0.33, 0.3, 0.04); c.stroke();
    c.fillStyle = 'rgba(20,22,26,0.7)';
    c.beginPath(); c.roundRect(2.72, 1.27, 0.12, 0.03, 0.01); c.fill();
    c.beginPath(); c.roundRect(4.2, 1.1, 0.06, 0.02, 0.008); c.fill();
    // cowl louvres / fasteners
    c.fillStyle = 'rgba(10,12,16,0.5)';
    for (let i = 0; i < 6; i++) { c.beginPath(); c.arc(0.55 + i * 0.17, 1.43, 0.008, 0, 7); c.fill(); }
    for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(1.42, 0.8 + i * 0.2, 0.007, 0, 7); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,0.6)';
    c.beginPath(); c.ellipse(1.2, 0.74, 0.09, 0.025, 0, 0, 7); c.fill();
    c.fillStyle = 'rgba(8,9,11,0.85)'; c.fillRect(1.3, 0.62, 0.13, 0.05);
    // windows: rubber surround, then a hole (or painted glass at low quality)
    for (const k of ['windscreen', 'door', 'rear', 'back']) {
      c.strokeStyle = 'rgba(14,16,20,0.95)'; c.lineWidth = 0.05; c.lineJoin = 'round';
      poly(c, WINDOWS[k]); c.stroke();
    }
    for (const k of ['windscreen', 'door', 'rear', 'back']) {
      poly(c, WINDOWS[k]);
      if (isHoles) { c.save(); c.globalCompositeOperation = 'destination-out'; c.fillStyle = '#000'; c.fill(); c.restore(); }
      else {
        const g = c.createLinearGradient(0, 2.0, 0, 1.45);
        g.addColorStop(0, '#5d7288'); g.addColorStop(0.45, '#222c36'); g.addColorStop(1, '#10151b');
        c.fillStyle = g; c.fill();
      }
    }
    const nameBg = primary;
    const nameCol = pick(nameBg, [secondary, accent], 3);
    text(c, T, L.display, 2.05, 1.07, 2.75, 0.24, { fill: nameCol, stroke: contrast(accent, nameCol) > 1.6 && accent !== nameBg ? accent : null, slope: 0.035 });
    const regCol = pick(primary, ['#15181d', secondary], 4.2);
    text(c, T, L.registration, 5.2, 1.255, 1.45, 0.2, { font: '700', fill: regCol, slope: 0.12 });
  }

  function paintFin(c, T, L) {
    const { primary, secondary, accent } = L;
    c.fillStyle = secondary; c.fillRect(5, 1, 4, 2);
    // lower swoosh in primary, with accent edge
    const curve = (k) => { c.beginPath(); c.moveTo(5, 0.5); c.lineTo(5, 1.62 + k); c.bezierCurveTo(6.6, 1.62 + k, 7.6, 1.74 + k, 8.6, 1.98 + k); c.lineTo(8.6, 0.5); c.closePath(); };
    c.fillStyle = accent; curve(0.085); c.fill();
    c.fillStyle = primary; curve(0.045); c.fill();
    const col = pick(secondary, [primary, accent, '#ffffff'], 3);
    const lerpLe = (y) => FIN.leBase + ((y - FIN.base) / (FIN.top - FIN.base)) * (FIN.leTop - FIN.leBase);
    const y0 = 2.06, y1 = 2.6, le = lerpLe((y0 + y1) / 2) + 0.06;
    text(c, T, L.display, (le + 8.22) / 2 + 0.02, (y0 + y1) / 2, 8.22 - le - 0.04, y1 - y0, { fill: col, lines: 2 });
  }

  function paintWing(c, T, L, top) {
    const { primary, secondary, accent } = L;
    c.fillStyle = primary; c.fillRect(-6, 1.5, 12, 3);
    // tips + fuel caps + walkway-free top; registration on the right wing top and under the left wing
    c.fillStyle = secondary;
    c.fillRect(WING.tipX - 0.32, 1.5, 2, 3); c.fillRect(-WING.tipX + 0.32 - 2, 1.5, 2, 3);
    c.fillStyle = accent;
    c.fillRect(WING.tipX - 0.38, 1.5, 0.05, 3); c.fillRect(-WING.tipX + 0.33, 1.5, 0.05, 3);
    c.strokeStyle = 'rgba(10,12,16,0.09)'; c.lineWidth = 0.006;
    c.setLineDash([0.008, 0.028]);
    for (let x = 0.75; x < 5.3; x += 0.31) for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * x, 2.0); c.lineTo(sx * x, 3.82); c.stroke(); }
    for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 0.6, 2.55); c.lineTo(sx * 5.3, 2.62); c.stroke(); }
    c.setLineDash([]);
    c.strokeStyle = 'rgba(10,12,16,0.45)'; c.lineWidth = 0.008;
    for (const sx of [-1, 1]) {
      c.beginPath(); c.moveTo(sx * 0.6, 3.4); c.lineTo(sx * WING.flap[1], 3.4); c.stroke();
      c.beginPath(); c.moveTo(sx * 3.0, 3.42); c.lineTo(sx * 5.12, 3.42); c.stroke();
      if (top) { c.fillStyle = 'rgba(30,32,36,0.85)'; c.beginPath(); c.arc(sx * 1.55, 2.62, 0.035, 0, 7); c.fill(); }
    }
    const regCol = pick(primary, ['#15181d', secondary], 4.2);
    // right wing top (x>0) / left wing bottom (x<0): both centred mid-panel
    const cx = top ? 2.75 : -2.75;
    text(c, T, L.registration, cx, 2.92, 3.6, 0.82, { font: '700', fill: regCol, plan: true });
  }

  function paintSwatches(c, L) {
    const cols = { primary: L.primary, secondary: L.secondary, accent: L.accent, white: '#f2f2ee', dark: '#202328', metal: '#9aa0a6', primaryDark: shade(L.primary, 0.8), black: '#0b0c0e' };
    const w = S / SW.length;
    SW.forEach((k, i) => { c.fillStyle = cols[k]; c.fillRect(i * w, S * 0.98, w, S * 0.02); });
  }

  function draw(L) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, S, S);
    region(ctx, REG.fusL, side(REG.fusL), (c, T) => paintSide(c, T, L, holes));
    region(ctx, REG.fusR, side(REG.fusR), (c, T) => paintSide(c, T, L, holes));
    region(ctx, REG.finL, side(REG.finL), (c, T) => paintFin(c, T, L));
    region(ctx, REG.finR, side(REG.finR), (c, T) => paintFin(c, T, L));
    region(ctx, REG.wingT, plan(REG.wingT), (c, T) => paintWing(c, T, L, true));
    region(ctx, REG.wingB, plan(REG.wingB), (c, T) => paintWing(c, T, L, false));
    paintSwatches(ctx, L);
    texture.needsUpdate = true;
  }

  // roughness mask (G channel): glossy painted windows when there are no holes
  {
    const m = mask.getContext('2d'), k = 512 / S;
    m.fillStyle = 'rgb(0,128,0)'; m.fillRect(0, 0, 512, 512);
    for (const r of [REG.fusL, REG.fusR]) {
      const T = side(r);
      m.save(); m.setTransform(T.a * k, 0, 0, T.d * k, T.e * k, T.f * k);
      m.fillStyle = 'rgb(0,18,0)';
      for (const w of Object.values(WINDOWS)) { poly(m, w); m.fill(); }
      m.restore();
    }
    m.fillStyle = 'rgb(0,200,0)'; m.fillRect(0, 512 * 0.98, 512, 512 * 0.02);
    m.fillStyle = 'rgb(0,240,0)'; m.fillRect(512 * 4 / 8, 512 * 0.98, 512 / 8, 512 * 0.02);
    m.fillRect(512 * 7 / 8, 512 * 0.98, 512 / 8, 512 * 0.02);
    roughTex.needsUpdate = true;
  }

  return { canvas, texture, roughTex, draw, dispose() { texture.dispose(); roughTex.dispose(); } };
}

export function normalizeLivery(l = {}) {
  const display = String(l.display || l.company || l.name || 'KRAYZEE').trim().slice(0, 14) || 'KRAYZEE';
  return {
    display,
    registration: String(l.registration || 'K-RAZY').toUpperCase().slice(0, 8),
    primary: l.primary || '#f4f1ea',
    secondary: l.secondary || '#1f4fa8',
    accent: l.accent || '#e8b21c',
  };
}

// JETMODELS-A: fixed royal palette for the big types (jumbo, herc). Their liveries paint these over the player's own
// primary/secondary/accent, so a Royal Jumbo always reads purple-and-gold whatever the player picked.
export const ROYAL = {
  purple: '#4a1d78', purpleDark: '#2c0f4c', purpleLight: '#7448a8', gold: '#d6a740', goldLight: '#f3d47c', goldDark: '#94691e',
  cream: '#f4efe3', wingGrey: '#b9bdc3', belly: '#c9ccd0', crimson: '#a3162a',
  military: '#5e6a58', militaryDark: '#414a3d', militaryLight: '#7d8a73', militaryGrey: '#8c9191',
};
