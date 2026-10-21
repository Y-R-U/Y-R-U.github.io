import * as THREE from 'three';
import { WINDOWS, DOOR } from './spec.js';

// Interior atlas. uv [0,0] lands on a plain white patch, so untextured interior parts keep their vertex colour.
//   top half: side walls in (station, height)  ·  bottom-right: headliner (x, station)
//   bottom-left: seat leather (0..0.25) and carpet (0.25..0.5)
const W0 = 1.55, W1 = 4.35, Y0 = 0.62, Y1 = 2.02;
export const uvWall = (s, y) => [(s - W0) / (W1 - W0), 0.5 + ((y - Y0) / (Y1 - Y0)) * 0.5];
export const uvHead = (x, s) => [0.5 + ((x + 0.62) / 1.24) * 0.5, ((s - 2.05) / 1.95) * 0.5];
export const uvCarpet = (x, s) => [0.25 + ((x + 0.6) / 1.2) * 0.25, 0.01 + ((s - 1.55) / 2.8) * 0.48];
export const uvSeat = (u, v) => [0.004 + u * 0.242, 0.13 + v * 0.36];

function noise(g, x, y, w, h, n, a, dark = true, size = 1) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = dark ? `rgba(0,0,0,${Math.random() * a})` : `rgba(255,255,255,${Math.random() * a})`;
    g.fillRect(x + Math.random() * w, y + Math.random() * h, size, size);
  }
}

export function createTrimTexture(quality) {
  const S = quality === 'low' ? 512 : 1024, k = S / 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, S, S);

  // ---- side walls ----
  const px = (s) => ((s - W0) / (W1 - W0)) * S, py = (y) => ((Y1 - y) / (Y1 - Y0)) * (S / 2);
  const poly = (pts) => { g.beginPath(); pts.forEach(([s, y], i) => (i ? g.lineTo(px(s), py(y)) : g.moveTo(px(s), py(y)))); g.closePath(); };
  const rect = (s0, y0, s1, y1, r) => { g.beginPath(); g.roundRect(px(s0), py(y1), px(s1) - px(s0), py(y0) - py(y1), r * k); };
  g.save();
  g.beginPath(); g.rect(0, 0, S, S / 2); g.clip();
  g.fillStyle = '#c9bfae'; g.fillRect(0, 0, S, S / 2);
  // window band: slightly darker, cooler moulded plastic
  const gb = g.createLinearGradient(0, py(2.0), 0, py(1.38));
  gb.addColorStop(0, '#a79e90'); gb.addColorStop(1, '#bdb3a2');
  g.fillStyle = gb; g.fillRect(0, 0, S, py(1.42));
  noise(g, 0, 0, S, S / 2, 9000 * k * k, 0.06);
  noise(g, 0, 0, S, S / 2, 5000 * k * k, 0.05, false);
  // fabric inserts on the door and the rear sidewall
  const insert = (s0, y0, s1, y1) => {
    g.save();
    g.shadowColor = 'rgba(40,30,20,0.45)'; g.shadowBlur = 6 * k; g.shadowOffsetY = 2 * k;
    rect(s0, y0, s1, y1, 10); g.fillStyle = '#8c7b66'; g.fill();
    g.restore();
    g.save(); rect(s0, y0, s1, y1, 10); g.clip();
    for (let y = py(y1); y < py(y0); y += 3 * k) { g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.05})`; g.fillRect(px(s0), y, px(s1) - px(s0), 1.2 * k); }
    noise(g, px(s0), py(y1), px(s1) - px(s0), py(y0) - py(y1), 4000 * k * k, 0.12);
    noise(g, px(s0), py(y1), px(s1) - px(s0), py(y0) - py(y1), 2000 * k * k, 0.08, false);
    // horizontal pleats
    for (let y = y0 + 0.07; y < y1 - 0.03; y += 0.07) {
      g.fillStyle = 'rgba(30,20,10,0.25)'; g.fillRect(px(s0), py(y) - 1 * k, px(s1) - px(s0), 2 * k);
      g.fillStyle = 'rgba(255,240,220,0.08)'; g.fillRect(px(s0), py(y) + 1 * k, px(s1) - px(s0), 2 * k);
    }
    g.restore();
    g.setLineDash([3 * k, 2.5 * k]); g.strokeStyle = 'rgba(235,222,200,0.55)'; g.lineWidth = 1.1 * k;
    g.beginPath(); g.roundRect(px(s0) + 5 * k, py(y1) + 5 * k, px(s1) - px(s0) - 10 * k, py(y0) - py(y1) - 10 * k, 7 * k); g.stroke();
    g.setLineDash([]);
  };
  insert(1.9, 0.84, 2.86, 1.4);
  insert(3.08, 0.84, 4.12, 1.4);
  // map pocket: elastic top edge, dark mouth, soft bulge
  {
    const s0 = 1.98, s1 = 2.66, y0 = 0.79, y1 = 1.02;
    g.save(); g.shadowColor = 'rgba(20,12,6,0.55)'; g.shadowBlur = 8 * k; g.shadowOffsetY = 3 * k;
    rect(s0, y0, s1, y1, 8); g.fillStyle = '#6f604f'; g.fill(); g.restore();
    const pg = g.createLinearGradient(0, py(y1), 0, py(y0));
    pg.addColorStop(0, '#2a221b'); pg.addColorStop(0.18, '#5e5143'); pg.addColorStop(1, '#75665a');
    rect(s0, y0, s1, y1, 8); g.fillStyle = pg; g.fill();
    g.fillStyle = '#9a8a77'; g.fillRect(px(s0) + 4 * k, py(y1) + 2 * k, px(s1) - px(s0) - 8 * k, 4 * k);
    g.setLineDash([2.5 * k, 2 * k]); g.strokeStyle = 'rgba(230,215,190,0.45)'; g.lineWidth = 1 * k;
    g.beginPath(); g.moveTo(px(s0) + 6 * k, py(y1) + 9 * k); g.lineTo(px(s1) - 6 * k, py(y1) + 9 * k); g.stroke(); g.setLineDash([]);
    // a folded chart sticking out
    g.fillStyle = '#e8dfc8'; g.beginPath(); g.moveTo(px(2.08), py(1.02)); g.lineTo(px(2.12), py(1.07)); g.lineTo(px(2.3), py(1.065)); g.lineTo(px(2.3), py(1.02)); g.fill();
    g.fillStyle = 'rgba(60,110,170,0.6)'; g.fillRect(px(2.14), py(1.06), px(2.27) - px(2.14), 2 * k);
  }
  // armrest shadows
  for (const [s0, s1, y] of [[2.12, 2.74, 1.18], [3.25, 3.78, 1.15]]) {
    const sg = g.createLinearGradient(0, py(y), 0, py(y - 0.12));
    sg.addColorStop(0, 'rgba(40,28,16,0.45)'); sg.addColorStop(1, 'rgba(40,28,16,0)');
    g.fillStyle = sg; rect(s0, y - 0.12, s1, y, 20); g.fill();
  }
  // door shut line + hinges
  g.lineJoin = 'round';
  g.strokeStyle = 'rgba(25,20,15,0.85)'; g.lineWidth = 2.6 * k; poly(DOOR); g.stroke();
  g.strokeStyle = 'rgba(255,245,230,0.22)'; g.lineWidth = 1 * k; g.save(); g.translate(1.5 * k, 1.5 * k); poly(DOOR); g.stroke(); g.restore();
  // panel seams
  g.strokeStyle = 'rgba(40,32,24,0.5)'; g.lineWidth = 1.4 * k;
  for (const [s0, y0, s1, y1] of [[2.97, 0.72, 2.97, 1.48], [1.62, 1.44, 1.74, 1.44], [2.97, 1.43, 4.3, 1.43], [3.0, 0.76, 4.3, 0.76]]) { g.beginPath(); g.moveTo(px(s0), py(y0)); g.lineTo(px(s1), py(y1)); g.stroke(); }
  // window reveals: rubber seal + soft occlusion
  for (const kk of ['door', 'rear']) {
    g.save(); g.filter = `blur(${6 * k}px)`; g.strokeStyle = 'rgba(30,22,14,0.55)'; g.lineWidth = 16 * k; poly(WINDOWS[kk]); g.stroke(); g.restore();
    g.strokeStyle = '#1b1c1e'; g.lineWidth = 7 * k; poly(WINDOWS[kk]); g.stroke();
  }
  // kick panel vent + screws
  g.fillStyle = '#4a443c'; g.beginPath(); g.arc(px(1.69), py(0.95), 13 * k, 0, 7); g.fill();
  g.strokeStyle = '#2a2622'; g.lineWidth = 1.5 * k;
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(px(1.69) - 10 * k, py(0.95) + i * 4 * k); g.lineTo(px(1.69) + 10 * k, py(0.95) + i * 4 * k); g.stroke(); }
  g.fillStyle = 'rgba(30,26,22,0.6)';
  for (const [s, y] of [[1.66, 1.38], [1.66, 0.82], [2.92, 1.38], [3.04, 1.38], [4.2, 1.38], [3.04, 0.8], [4.2, 0.8]]) { g.beginPath(); g.arc(px(s), py(y), 1.8 * k, 0, 7); g.fill(); }
  // ambient occlusion: floor, firewall and baggage wall
  const ao = (x0, y0, x1, y1, a) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, `rgba(20,14,8,${a})`); gr.addColorStop(1, 'rgba(20,14,8,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S / 2); };
  ao(0, py(0.68), 0, py(0.92), 0.55);
  ao(px(1.62), 0, px(1.86), 0, 0.4);
  ao(px(4.32), 0, px(4.05), 0, 0.35);
  ao(0, py(1.99), 0, py(1.86), 0.3);
  g.restore();

  // ---- headliner (x, s) ----
  const hx = (x) => S / 2 + ((x + 0.62) / 1.24) * (S / 2), hy = (s) => S - ((s - 2.05) / 1.95) * (S / 2);
  g.save();
  g.beginPath(); g.rect(S / 2, S / 2, S / 2, S / 2); g.clip();
  g.fillStyle = '#d9d1c2'; g.fillRect(S / 2, S / 2, S / 2, S / 2);
  noise(g, S / 2, S / 2, S / 2, S / 2, 6000 * k * k, 0.07);
  g.fillStyle = 'rgba(80,70,60,0.18)';
  for (let x = S / 2 + 2; x < S; x += 5 * k) for (let y = S / 2 + 2; y < S; y += 5 * k) g.fillRect(x + ((y / (5 * k)) % 2) * 2.5 * k, y, 1.1 * k, 1.1 * k);
  // transverse bows: soft puffed panels between seams
  for (let s = 2.15; s < 4.0; s += 0.26) {
    const y = hy(s);
    const sg = g.createLinearGradient(0, y - 12 * k, 0, y + 12 * k);
    sg.addColorStop(0, 'rgba(60,50,40,0)'); sg.addColorStop(0.5, 'rgba(60,50,40,0.35)'); sg.addColorStop(1, 'rgba(60,50,40,0)');
    g.fillStyle = sg; g.fillRect(S / 2, y - 12 * k, S / 2, 24 * k);
    g.fillStyle = 'rgba(40,34,28,0.55)'; g.fillRect(S / 2, y - 1 * k, S / 2, 1.6 * k);
  }
  const ex = g.createLinearGradient(hx(-0.62), 0, hx(-0.38), 0);
  ex.addColorStop(0, 'rgba(40,30,20,0.45)'); ex.addColorStop(1, 'rgba(40,30,20,0)');
  g.fillStyle = ex; g.fillRect(S / 2, S / 2, S / 2, S / 2);
  const ex2 = g.createLinearGradient(hx(0.62), 0, hx(0.38), 0);
  ex2.addColorStop(0, 'rgba(40,30,20,0.45)'); ex2.addColorStop(1, 'rgba(40,30,20,0)');
  g.fillStyle = ex2; g.fillRect(S / 2, S / 2, S / 2, S / 2);
  g.restore();

  // ---- seat leather (unit square, v up) ----
  const sx = (u) => (0.004 + u * 0.242) * S, sy = (v) => S - (0.13 + v * 0.36) * S;
  g.save();
  g.beginPath(); g.rect(sx(0), sy(1), sx(1) - sx(0), sy(0) - sy(1)); g.clip();
  g.fillStyle = '#d7b28a'; g.fillRect(0, sy(1), S / 4, sy(0) - sy(1));
  noise(g, 0, sy(1), S / 4, sy(0) - sy(1), 5000 * k * k, 0.1);
  noise(g, 0, sy(1), S / 4, sy(0) - sy(1), 2500 * k * k, 0.08, false, 2 * k);
  // centre insert with pleats, bolsters either side
  const ix0 = sx(0.24), ix1 = sx(0.76);
  g.fillStyle = 'rgba(70,40,15,0.12)'; g.fillRect(ix0, sy(1), ix1 - ix0, sy(0) - sy(1));
  for (let v = 0.06; v < 1; v += 0.088) {
    const y = sy(v);
    const pg = g.createLinearGradient(0, y - 7 * k, 0, y + 3 * k);
    pg.addColorStop(0, 'rgba(255,240,220,0.0)'); pg.addColorStop(0.75, 'rgba(255,240,220,0.18)'); pg.addColorStop(0.8, 'rgba(60,30,10,0.55)'); pg.addColorStop(1, 'rgba(60,30,10,0)');
    g.fillStyle = pg; g.fillRect(ix0, y - 7 * k, ix1 - ix0, 10 * k);
  }
  g.strokeStyle = 'rgba(60,32,12,0.6)'; g.lineWidth = 2 * k;
  for (const x of [ix0, ix1]) { g.beginPath(); g.moveTo(x, sy(1)); g.lineTo(x, sy(0)); g.stroke(); }
  g.setLineDash([2.5 * k, 2 * k]); g.strokeStyle = 'rgba(250,236,210,0.5)'; g.lineWidth = 1 * k;
  for (const x of [ix0 - 4 * k, ix1 + 4 * k]) { g.beginPath(); g.moveTo(x, sy(1)); g.lineTo(x, sy(0)); g.stroke(); }
  g.setLineDash([]);
  g.restore();

  // ---- carpet ----
  g.save();
  g.beginPath(); g.rect(S / 4, S / 2, S / 4, S / 2); g.clip();
  g.fillStyle = '#5b5048'; g.fillRect(S / 4, S / 2, S / 4, S / 2);
  noise(g, S / 4, S / 2, S / 4, S / 2, 14000 * k * k, 0.3, true, 1.5 * k);
  noise(g, S / 4, S / 2, S / 4, S / 2, 8000 * k * k, 0.12, false, 1.5 * k);
  g.restore();

  // white patch for uv [0,0]
  g.fillStyle = '#fff'; g.fillRect(0, S - 64 * k, 64 * k, 64 * k);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
