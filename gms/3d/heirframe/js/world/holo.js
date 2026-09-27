import * as THREE from 'three';
import { makeCanvas, canvasTexture } from './textures.js';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

function bg(x, w, h, top = '#0b2a52', bot = '#041224') {
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, top); g.addColorStop(1, bot);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(120,200,255,0.07)'; x.lineWidth = 1;
  for (let i = 0; i < w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); }
  for (let i = 0; i < h; i += 32) { x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
}
function glowText(x, text, px, py, size, weight = 300, spacing = 6, color = '#e8f6ff', align = 'left') {
  x.font = `${weight} ${size}px ${FONT}`;
  x.textAlign = align; x.textBaseline = 'alphabetic';
  try { x.letterSpacing = `${spacing}px`; } catch (e) { /* older canvas */ }
  x.shadowColor = 'rgba(120,210,255,0.9)'; x.shadowBlur = size * 0.35;
  x.fillStyle = color; x.fillText(text, px, py);
  x.shadowBlur = 0;
}
function emblem(x, cx, cy, r) {
  x.save(); x.strokeStyle = 'rgba(170,230,255,0.9)'; x.lineWidth = r * 0.05;
  x.shadowColor = '#7fd4ff'; x.shadowBlur = r * 0.3;
  x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
  x.lineWidth = r * 0.03; x.beginPath(); x.arc(cx, cy, r * 0.72, 0, 7); x.stroke();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3); x.lineTo(cx + Math.cos(a) * r * 0.95, cy + Math.sin(a) * r * 0.95); x.stroke(); }
  x.beginPath(); x.arc(cx, cy, r * 0.22, 0, 7); x.fillStyle = 'rgba(200,240,255,0.9)'; x.fill();
  x.restore();
}
function face(x, cx, cy, s) {
  // stylised serene profile facing right, built from curves
  x.save();
  const g = x.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 1.3);
  g.addColorStop(0, 'rgba(230,248,255,0.95)'); g.addColorStop(0.6, 'rgba(140,205,250,0.7)'); g.addColorStop(1, 'rgba(40,110,190,0.0)');
  x.fillStyle = g;
  x.beginPath();
  x.moveTo(cx - s * 0.55, cy - s * 0.95);
  x.bezierCurveTo(cx + s * 0.1, cy - s * 1.25, cx + s * 0.55, cy - s * 0.9, cx + s * 0.55, cy - s * 0.35);
  x.lineTo(cx + s * 0.72, cy - s * 0.05); x.lineTo(cx + s * 0.56, cy + s * 0.05);
  x.quadraticCurveTo(cx + s * 0.62, cy + s * 0.22, cx + s * 0.5, cy + s * 0.28);
  x.quadraticCurveTo(cx + s * 0.55, cy + s * 0.42, cx + s * 0.4, cy + s * 0.55);
  x.quadraticCurveTo(cx + s * 0.2, cy + s * 0.72, cx, cy + s * 0.68);
  x.lineTo(cx - s * 0.05, cy + s * 1.2); x.lineTo(cx - s * 0.6, cy + s * 1.2);
  x.bezierCurveTo(cx - s * 0.75, cy + s * 0.4, cx - s * 0.95, cy - s * 0.6, cx - s * 0.55, cy - s * 0.95);
  x.fill();
  x.strokeStyle = 'rgba(210,240,255,0.5)'; x.lineWidth = 2;
  for (let i = 0; i < 9; i++) { x.beginPath(); x.arc(cx - s * 0.2, cy - s * 0.2, s * (0.35 + i * 0.07), -1.2, 0.2); x.stroke(); }
  x.restore();
}
function ui(x, w, h, R) {
  x.fillStyle = 'rgba(150,220,255,0.55)';
  for (let i = 0; i < 26; i++) x.fillRect(R() * w, R() * h, 20 + R() * 90, 2);
  x.strokeStyle = 'rgba(150,220,255,0.35)'; x.lineWidth = 2;
  x.strokeRect(12, 12, w - 24, h - 24);
}
const rngLite = (s) => () => (s = (s * 16807) % 2147483647) / 2147483647;
function aureliaAd(x, w, h) {
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#2a1a04'); g.addColorStop(0.55, '#120a02'); g.addColorStop(1, '#040302');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const sh = x.createRadialGradient(300, 230, 20, 300, 230, 330); sh.addColorStop(0, 'rgba(255,200,110,0.35)'); sh.addColorStop(1, 'rgba(255,200,110,0)');
  x.fillStyle = sh; x.fillRect(0, 0, w, h);
  // gold robot bust: head, neck, shoulders, chest plates, lit optics
  const gold = (y0, y1) => { const q = x.createLinearGradient(180, y0, 420, y1); q.addColorStop(0, '#fff0b8'); q.addColorStop(0.35, '#f2c25a'); q.addColorStop(0.7, '#8a5a12'); q.addColorStop(1, '#f7d27a'); return q; };
  x.fillStyle = gold(60, 460);
  x.beginPath(); x.ellipse(300, 170, 78, 96, 0, 0, 7); x.fill();
  x.fillRect(272, 250, 56, 50);
  x.beginPath(); x.moveTo(120, 470); x.quadraticCurveTo(140, 320, 230, 300); x.lineTo(370, 300); x.quadraticCurveTo(460, 320, 480, 470); x.closePath(); x.fill();
  x.strokeStyle = 'rgba(40,22,2,0.8)'; x.lineWidth = 3;
  x.beginPath(); x.moveTo(300, 305); x.lineTo(300, 470); x.moveTo(230, 330); x.quadraticCurveTo(300, 380, 370, 330); x.stroke();
  x.beginPath(); x.moveTo(236, 150); x.quadraticCurveTo(300, 128, 364, 150); x.stroke();
  x.fillStyle = '#0a0602'; x.fillRect(244, 150, 112, 26);
  x.shadowColor = '#7fe0ff'; x.shadowBlur = 18; x.fillStyle = '#bff0ff';
  x.fillRect(258, 158, 34, 9); x.fillRect(308, 158, 34, 9); x.shadowBlur = 0;
  x.fillStyle = 'rgba(255,250,230,0.85)'; x.beginPath(); x.ellipse(262, 110, 12, 30, -0.5, 0, 7); x.fill();
  glowText(x, 'AURELIA', 560, 200, 88, 300, 14, '#fff1cf');
  glowText(x, 'THE GOLD STANDARD', 564, 262, 30, 400, 8, '#ffd889');
  x.fillStyle = 'rgba(255,210,120,0.8)'; x.fillRect(566, 292, 340, 3);
  glowText(x, 'SERIES VI FRAMES • NOW IN HALCYON', 564, 336, 20, 400, 5, '#ffe6b8');
}
function skylineAd(x, w, h) {
  const sky = x.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, '#0b3a78'); sky.addColorStop(0.55, '#6fb4ee'); sky.addColorStop(0.8, '#ffd8a0'); sky.addColorStop(1, '#ff9a50');
  x.fillStyle = sky; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,245,225,0.9)'; x.beginPath(); x.arc(760, 120, 46, 0, 7); x.fill();
  const R = rngLite(23);
  for (let layer = 0; layer < 3; layer++) {
    const base = h * (0.62 + layer * 0.12), col = ['#5a86b8', '#2e5480', '#10243e'][layer];
    x.fillStyle = col;
    for (let bx = -10; bx < w; bx += 18 + R() * 40) {
      const bw = 14 + R() * 34, bh = (60 + R() * 220) * (1.2 - layer * 0.3);
      x.fillRect(bx, base - bh, bw, bh + 200);
      if (R() < 0.35) { x.beginPath(); x.moveTo(bx, base - bh); x.lineTo(bx + bw / 2, base - bh - 30 - R() * 50); x.lineTo(bx + bw, base - bh); x.fill(); }
      if (layer === 2) { x.fillStyle = 'rgba(255,215,150,0.8)'; for (let k = 0; k < 6; k++) x.fillRect(bx + 3 + R() * (bw - 6), base - bh + 8 + R() * bh, 3, 3); x.fillStyle = col; }
    }
  }
  x.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 9; i++) { const cx = 60 + R() * 900, cy = 60 + R() * 170; x.beginPath(); x.ellipse(cx, cy, 9, 2.5, 0, 0, 7); x.fill(); }
  const shade = x.createLinearGradient(0, 0, w, 0); shade.addColorStop(0, 'rgba(3,12,30,0.75)'); shade.addColorStop(0.55, 'rgba(3,12,30,0)');
  x.fillStyle = shade; x.fillRect(0, 0, w, h);
  glowText(x, 'LIVE ABOVE', 60, 150, 64, 300, 10, '#f2fbff');
  glowText(x, 'THE CLOUDS', 60, 222, 64, 300, 10, '#f2fbff');
  glowText(x, 'SKYLINE RESIDENCES • HALCYON', 62, 272, 22, 400, 5, '#bfe8ff');
}

export const HOLO_ART = {
  brighter() {
    const w = 1024, h = 512, c = makeCanvas(w, h), x = c.getContext('2d'); const R = rngLite(7);
    bg(x, w, h); ui(x, w, h, R);
    face(x, 300, 250, 210);
    glowText(x, 'A BRIGHTER', 560, 190, 72, 300, 10);
    glowText(x, 'FUTURE', 560, 280, 72, 300, 10);
    glowText(x, 'TOGETHER', 560, 370, 72, 300, 10);
    x.fillStyle = 'rgba(160,225,255,0.7)'; x.fillRect(562, 400, 300, 3);
    glowText(x, 'CONCORD CIVIC TRUST', 562, 440, 22, 400, 6, '#9fd8ff');
    return c;
  },
  harmony() {
    const w = 512, h = 1024, c = makeCanvas(w, h), x = c.getContext('2d'); const R = rngLite(3);
    bg(x, w, h, '#0e3868', '#06203e');
    glowText(x, 'HARMONY', w / 2, 110, 64, 400, 8, '#eaf8ff', 'center');
    glowText(x, 'THROUGH UNITY', w / 2, 170, 34, 300, 8, '#bfe8ff', 'center');
    emblem(x, w / 2, 380, 130);
    // landscape vignette: layered ranges with snow, a treeline, and a still lake mirroring them
    const X0 = 30, X1 = w - 30, Y0 = 560, HZ = 820, Y1 = 990;
    x.save(); x.beginPath(); x.rect(X0, Y0, X1 - X0, Y1 - Y0); x.clip();
    const sky = x.createLinearGradient(0, Y0, 0, HZ); sky.addColorStop(0, '#5aa6ee'); sky.addColorStop(1, '#d8eeff');
    x.fillStyle = sky; x.fillRect(X0, Y0, X1 - X0, HZ - Y0);
    const ridge = (base, amp, seed, cols, snow) => {
      const r = rngLite(seed), pts = [];
      for (let i = 0; i <= 9; i++) pts.push([X0 + i * (X1 - X0) / 9 + (i % 9 ? (r() - 0.5) * 30 : 0), base - amp * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.9 + seed)) * (0.6 + 0.4 * r()))]);
      const g = x.createLinearGradient(0, base - amp, 0, base); g.addColorStop(0, cols[0]); g.addColorStop(1, cols[1]);
      const path = () => { x.beginPath(); x.moveTo(X0, base); for (const [px, py] of pts) x.lineTo(px, py); x.lineTo(X1, base); x.closePath(); };
      path(); x.fillStyle = g; x.fill();
      if (snow) { x.save(); path(); x.clip(); x.fillStyle = 'rgba(245,250,255,0.92)'; for (const [px, py] of pts) { x.beginPath(); x.moveTo(px - 40, py + 48); x.lineTo(px, py); x.lineTo(px + 34, py + 40); x.closePath(); x.fill(); } x.restore(); }
    };
    ridge(HZ, 230, 3, ['#8fb4d8', '#6f93b8'], true);
    ridge(HZ, 150, 7, ['#5f86a8', '#3f6a78'], true);
    ridge(HZ, 60, 11, ['#2f6a4a', '#23503a'], false);
    // lake: the scene above, flipped and darkened, with ripple lines
    x.save(); x.translate(0, HZ * 2); x.scale(1, -1); x.globalAlpha = 0.55; x.drawImage(c, X0, Y0, X1 - X0, HZ - Y0, X0, Y0, X1 - X0, HZ - Y0); x.restore();
    const lake = x.createLinearGradient(0, HZ, 0, Y1); lake.addColorStop(0, 'rgba(40,110,170,0.35)'); lake.addColorStop(1, 'rgba(10,50,100,0.8)');
    x.fillStyle = lake; x.fillRect(X0, HZ, X1 - X0, Y1 - HZ);
    x.strokeStyle = 'rgba(255,255,255,0.28)'; x.lineWidth = 2;
    for (let i = 0; i < 16; i++) { const y = HZ + 12 + i * 10; x.beginPath(); x.moveTo(X0 + 20 + R() * 180, y); x.lineTo(X0 + 140 + R() * 260, y); x.stroke(); }
    x.restore();
    ui(x, w, h, R);
    return c;
  },
  ad(title, sub, seed = 1, hue = '#0b2a52') {
    const w = 512, h = 512, c = makeCanvas(w, h), x = c.getContext('2d'); const R = rngLite(seed);
    bg(x, w, h, hue, '#030d1c'); ui(x, w, h, R);
    emblem(x, w / 2, 190, 95);
    glowText(x, title, w / 2, 370, 54, 400, 10, '#eaf8ff', 'center');
    glowText(x, sub, w / 2, 425, 22, 300, 5, '#9fd8ff', 'center');
    return c;
  },
  // Harmony's face, eyes open and looking straight out: the billboard takeover (world.billboards.show('harmony_face')).
  watching(w = 1024, h = 512, line = 'HARMONY IS WATCHING') {
    const c = makeCanvas(w, h), x = c.getContext('2d'); const R = rngLite(19);
    bg(x, w, h, '#0c3a70', '#020a18'); ui(x, w, h, R);
    const s = Math.min(w, h) * 0.36, cx = w / 2, cy = h * 0.47;
    x.save();
    const g = x.createRadialGradient(cx, cy, s * 0.1, cx, cy, s * 1.4);
    g.addColorStop(0, 'rgba(235,250,255,0.95)'); g.addColorStop(0.55, 'rgba(140,205,250,0.75)'); g.addColorStop(1, 'rgba(30,90,170,0)');
    x.fillStyle = g;
    x.beginPath(); x.ellipse(cx, cy, s * 0.62, s * 0.86, 0, 0, 7); x.fill();
    x.fillRect(cx - s * 0.3, cy + s * 0.6, s * 0.6, s * 0.6);
    x.strokeStyle = 'rgba(210,240,255,0.45)'; x.lineWidth = 2;
    for (let i = 0; i < 7; i++) { x.beginPath(); x.ellipse(cx, cy, s * (0.68 + i * 0.07), s * (0.92 + i * 0.07), 0, 3.6, 5.8); x.stroke(); }
    for (const ex of [-1, 1]) {
      const px = cx + ex * s * 0.24, py = cy - s * 0.08;
      x.fillStyle = 'rgba(4,20,44,0.9)'; x.beginPath(); x.ellipse(px, py, s * 0.13, s * 0.055, 0, 0, 7); x.fill();
      x.shadowColor = '#9fe4ff'; x.shadowBlur = s * 0.12;
      x.fillStyle = '#dff6ff'; x.beginPath(); x.arc(px, py, s * 0.035, 0, 7); x.fill();
      x.shadowBlur = 0;
    }
    x.strokeStyle = 'rgba(4,20,44,0.6)'; x.lineWidth = s * 0.02;
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx - s * 0.03, cy + s * 0.22); x.lineTo(cx + s * 0.04, cy + s * 0.24); x.stroke();
    x.beginPath(); x.moveTo(cx - s * 0.12, cy + s * 0.42); x.quadraticCurveTo(cx, cy + s * 0.46, cx + s * 0.12, cy + s * 0.42); x.stroke();
    x.restore();
    let big = h * 0.08;
    x.font = `400 ${big}px ${FONT}`;
    const tw = x.measureText(line).width + line.length * big * 0.25;
    if (tw > w * 0.9) big *= w * 0.9 / tw;
    glowText(x, line, cx, h * 0.93, big, 400, big * 0.25, '#eaf8ff', 'center');
    return c;
  },
  // Portrait ad posters packed side by side (one texture, one draw for every street totem).
  posters() {
    const pw = 512, ph = 1024, list = ['brighter', 'harmony', 'hireframe', 'concord'];
    const c = makeCanvas(pw * list.length, ph), x = c.getContext('2d');
    list.forEach((k, i) => {
      x.save(); x.translate(i * pw, 0); x.beginPath(); x.rect(0, 0, pw, ph); x.clip();
      const R = rngLite(31 + i);
      if (k === 'brighter') {
        bg(x, pw, ph, '#0d3a6e', '#041426'); ui(x, pw, ph, R);
        face(x, 200, 420, 250);
        glowText(x, 'A BRIGHTER', pw / 2, 760, 58, 300, 8, '#eaf8ff', 'center');
        glowText(x, 'FUTURE', pw / 2, 830, 58, 300, 8, '#eaf8ff', 'center');
        glowText(x, 'TOGETHER', pw / 2, 900, 58, 300, 8, '#eaf8ff', 'center');
      } else if (k === 'harmony') {
        x.drawImage(HOLO_ART.harmony(), 0, 0, pw, ph);
      } else if (k === 'hireframe') {
        bg(x, pw, ph, '#4a2a08', '#120802'); ui(x, pw, ph, R);
        x.fillStyle = 'rgba(255,170,60,0.9)'; x.shadowColor = '#ffae40'; x.shadowBlur = 30;
        const bx = pw / 2, by = 300;
        x.fillRect(bx - 60, by - 150, 120, 90); x.fillRect(bx - 90, by - 50, 180, 170); x.fillRect(bx - 130, by - 40, 34, 150); x.fillRect(bx + 96, by - 40, 34, 150);
        x.fillRect(bx - 70, by + 130, 50, 180); x.fillRect(bx + 20, by + 130, 50, 180);
        x.fillStyle = '#1a0c02'; x.fillRect(bx - 40, by - 120, 80, 22); x.shadowBlur = 0;
        glowText(x, 'HIREFRAME', pw / 2, 740, 64, 600, 6, '#ffe2b0', 'center');
        glowText(x, 'RENT A BODY TODAY', pw / 2, 800, 28, 400, 5, '#ffc070', 'center');
        glowText(x, 'FROM 4 ₵ / HOUR', pw / 2, 880, 40, 300, 5, '#ffe9c8', 'center');
      } else {
        bg(x, pw, ph, '#0b2a52', '#030d1c'); ui(x, pw, ph, R);
        emblem(x, pw / 2, 360, 150);
        glowText(x, 'CONCORD', pw / 2, 700, 70, 400, 10, '#eaf8ff', 'center');
        glowText(x, 'YOUR PLACE', pw / 2, 790, 36, 300, 8, '#bfe8ff', 'center');
        glowText(x, 'IS PREPARED', pw / 2, 840, 36, 300, 8, '#bfe8ff', 'center');
      }
      x.restore();
    });
    return { canvas: c, count: list.length, keys: list };
  },
  // Landscape ad: emblem (or Harmony's profile) on the left, title + subline on the right.
  wide(title, sub, seed = 1, hue = '#0b2a52', faceArt = false) {
    const w = 1024, h = 512, c = makeCanvas(w, h), x = c.getContext('2d'); const R = rngLite(seed);
    bg(x, w, h, hue, '#030d1c'); ui(x, w, h, R);
    if (faceArt) face(x, 250, 250, 190); else emblem(x, 250, 250, 150);
    let size = 84;
    x.font = `400 ${size}px ${FONT}`;
    while (x.measureText(title).width + title.length * 10 > 560 && size > 40) { size -= 4; x.font = `400 ${size}px ${FONT}`; }
    glowText(x, title, 480, 250, size, 400, 10, '#eaf8ff');
    x.fillStyle = 'rgba(160,225,255,0.7)'; x.fillRect(482, 285, 360, 3);
    glowText(x, sub, 482, 335, 28, 300, 6, '#9fd8ff');
    return c;
  },
  // Big-board ad reel: `frames` 1024x512 ads stacked top to bottom + a 1024x64 news ticker strip at the bottom.
  // createHoloMaterial(canvas, { reel: { frames } }) cycles them with a wipe and scrolls the ticker (no redraws).
  reel(first = 'brighter', scale = 1, ticker = 'HALCYON CIVIC NEWS  •  TRANSIT RELAYS ON SCHEDULE  •  AIR QUALITY 99.2%  •  HARMONY INDEX ▲ 0.4  •  NEW AURELIA FRAMES IN STORE  •  ') {
    const W = 1024, H = 512, TH = 64, list = [first, 'aurelia', 'skyline', first === 'brighter' ? 'harmony' : 'brighter'];
    const c = makeCanvas(W, H * list.length + TH), x = c.getContext('2d');
    list.forEach((k, i) => {
      x.save(); x.translate(0, i * H); x.beginPath(); x.rect(0, 0, W, H); x.clip();
      if (typeof k !== 'string') x.drawImage(k, 0, 0, W, H);
      else if (k === 'brighter') x.drawImage(HOLO_ART.brighter(), 0, 0);
      else if (k === 'harmony') x.drawImage(HOLO_ART.wide('HARMONY', 'ONE CITY • ONE MIND', 12, '#0c3a70', true), 0, 0);
      else if (k === 'aurelia') aureliaAd(x, W, H);
      else skylineAd(x, W, H);
      // ticker band backing (the shader scrolls the strip into it)
      x.fillStyle = 'rgba(2,10,24,0.85)'; x.fillRect(0, H * 0.9, W, H * 0.1);
      x.fillStyle = 'rgba(140,215,255,0.8)'; x.fillRect(0, H * 0.9, W, 2);
      x.restore();
    });
    x.save(); x.translate(0, H * list.length);
    x.fillStyle = '#030d1c'; x.fillRect(0, 0, W, TH);
    let size = 34; x.font = `500 ${size}px ${FONT}`;
    let t = ticker; while (x.measureText(t + ticker).width < W) t += ticker;
    const tw = x.measureText(t).width;
    x.setTransform(W / tw, 0, 0, 1, 0, H * list.length);
    glowText(x, t, 0, TH * 0.7, size, 500, 0, '#dff4ff');
    x.restore();
    let out = c;
    if (scale < 1) { out = makeCanvas(W * scale, c.height * scale); out.getContext('2d').drawImage(c, 0, 0, out.width, out.height); }
    return { canvas: out, frames: list.length, tick: TH / c.height };
  },
  // Shop fascia names stacked in rows (one texture, one mesh for a whole street of signs).
  signAtlas(names, w = 1024, rowH = 128) {
    const c = makeCanvas(w, rowH * names.length), x = c.getContext('2d');
    names.forEach(([text, col], i) => {
      x.save(); x.translate(0, i * rowH);
      x.fillStyle = '#03101f'; x.fillRect(0, 0, w, rowH);
      x.fillStyle = col || '#9fe4ff'; x.fillRect(0, rowH - 6, w, 3);
      glowText(x, text, w / 2, rowH * 0.7, rowH * 0.5, 400, 14, '#eaf8ff', 'center');
      x.restore();
    });
    return { canvas: c, rows: names.length };
  },
  sign(text, w = 1024, h = 160) {
    const c = makeCanvas(w, h), x = c.getContext('2d');
    x.fillStyle = '#041a33'; x.fillRect(0, 0, w, h);
    glowText(x, text, w / 2, h * 0.68, h * 0.45, 400, 12, '#eaf8ff', 'center');
    return c;
  },
};

export function createHoloMaterial(canvas, { bright = 2.4, alpha = 0.92, tint = [0.8, 0.95, 1.1], time, cols = 1, side = THREE.DoubleSide, reel = null } = {}) {
  const tex = canvasTexture(canvas);
  tex.anisotropy = 4;
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      map: { value: null }, map2: { value: null }, uMix: { value: 0 }, uCols: { value: cols },
      uBright: { value: bright }, uAlpha: { value: alpha }, uTint: { value: new THREE.Vector3(...tint) }, uTime: { value: 0 },
      uReel: { value: new THREE.Vector4(reel?.frames || 1, reel?.hold || 7, reel?.phase || 0, reel?.tick || 0) },
    }]),
    vertexShader: /* glsl */`
      varying vec2 vUv;
      attribute float aPhase;
      varying float vPhase;
      #include <fog_pars_vertex>
      void main() {
        vUv = uv; vPhase = aPhase;
        vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D map, map2; uniform float uBright, uAlpha, uTime, uMix, uCols; uniform vec3 uTint;
      uniform vec4 uReel;
      varying vec2 vUv;
      varying float vPhase;
      #include <fog_pars_fragment>
      void main() {
        vec2 uv = vUv;
        float glitch = step(0.985, fract(sin(floor(uTime * 3.0) * 91.7) * 43758.5)) * step(abs(uv.y - fract(uTime * 0.37)), 0.03);
        uv.x += glitch * 0.01;
        vec3 c;
        #ifdef REEL
        {
          // frame f holds, then the next one wipes in from the top; the bottom 10% scrolls the news strip
          float fh = ( 1.0 - uReel.w ) / uReel.x, tt = uTime / uReel.y + uReel.z + vPhase;
          float f = mod( floor( tt ), uReel.x ), k = fract( tt ), wp = smoothstep( 0.9, 1.0, k ) * 1.1;
          float nx = step( 1.0 - vUv.y, wp );
          vec2 ra = vec2( uv.x, 1.0 - ( f + 1.0 - uv.y ) * fh ), rb = vec2( uv.x, 1.0 - ( mod( f + 1.0, uReel.x ) + 1.0 - uv.y ) * fh );
          c = mix( texture2D( map, ra ).rgb, texture2D( map, rb ).rgb, nx ) + vec3( 0.4, 0.75, 1.0 ) * smoothstep( 0.025, 0.0, abs( 1.0 - vUv.y - wp ) ) * step( wp, 1.0 ) * step( 0.001, wp );
          if ( vUv.y < 0.085 && vUv.y > 0.012 ) c = texture2D( map, vec2( fract( uv.x + uTime * 0.035 ), uReel.w * ( vUv.y - 0.012 ) / 0.073 ) ).rgb;
        }
        #else
        c = texture2D( map, uv ).rgb;
        #endif
        if ( uMix > 0.001 ) {
          // the takeover rolls in as a bright wipe from the top
          float w = smoothstep( uMix * 1.2 - 0.2, uMix * 1.2, 1.0 - vUv.y );
          c = mix( c, texture2D( map2, vec2( fract( vUv.x * uCols - 1e-4 ), vUv.y ) ).rgb, 1.0 - w ) + vec3( 0.5, 0.8, 1.0 ) * smoothstep( 0.04, 0.0, abs( 1.0 - vUv.y - uMix * 1.2 + 0.1 ) ) * step( uMix, 0.99 );
        }
        float scan = 0.86 + 0.14 * sin( vUv.y * 700.0 - uTime * 5.0 );
        float band = 1.0 + 0.35 * smoothstep( 0.06, 0.0, abs( fract( vUv.y * 0.6 - uTime * 0.07 ) - 0.5 ) );
        float ex = fract( vUv.x * uCols - 1e-4 );
        float edge = smoothstep( 0.0, 0.015, ex ) * smoothstep( 1.0, 0.985, ex ) * smoothstep( 0.0, 0.02, vUv.y ) * smoothstep( 1.0, 0.98, vUv.y );
        vec3 col = c * uTint * uBright * scan * band;
        float l = dot( c, vec3( 0.3, 0.5, 0.2 ) );
        gl_FragColor = vec4( col, uAlpha * edge * mix( 0.55, 1.0, smoothstep( 0.05, 0.4, l ) ) );
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, side, fog: true,
  });
  if (reel) m.defines = { REEL: '' };
  m.uniforms.map.value = tex;
  m.uniforms.map2.value = tex;
  if (time) m.uniforms.uTime = time;
  return m;
}

// Billboards that can be taken over (story beats). Each registers its material + pixel aspect.
export function registerBillboard(ctx, material, w, h) {
  (ctx.billboards ||= []).push({ mat: material, w, h });
}

// world.billboards.show('harmony_face', { line, duration, fade }) → every registered billboard wipes to Harmony's face.
// show('default') (or show(null)) wipes back. `duration` (s) auto-restores. Returns the number of billboards switched.
export function createBillboards(ctx) {
  const cache = new Map();
  let target = 0, mix = 0, speed = 1, timer = 0, key = 'default';
  const art = (b, line) => {
    const k = `${b.w}x${b.h}|${line}`;
    if (!cache.has(k)) cache.set(k, canvasTexture(HOLO_ART.watching(b.w, b.h, line)));
    return cache.get(k);
  };
  ctx.updaters.push((dt) => {
    if (timer > 0 && (timer -= dt) <= 0) { target = 0; key = 'default'; }
    if (mix === target) return;
    mix = target > mix ? Math.min(target, mix + dt * speed) : Math.max(target, mix - dt * speed);
    for (const b of ctx.billboards) b.mat.uniforms.uMix.value = mix;
  });
  return {
    keys: ['default', 'harmony_face'],
    get current() { return key; },
    get list() { return ctx.billboards; },
    show(k = 'default', { line = 'HARMONY IS WATCHING', duration = 0, fade = 1.2 } = {}) {
      speed = 1 / Math.max(0.05, fade);
      timer = duration;
      if (!k || k === 'default') { target = 0; key = 'default'; return ctx.billboards.length; }
      for (const b of ctx.billboards) b.mat.uniforms.map2.value = art(b, line);
      target = 1; key = k;
      return ctx.billboards.length;
    },
  };
}

// A screen readable from both sides at any camera yaw: front-only material + a back copy turned 180°.
export function twoSided(mesh) {
  mesh.material.side = THREE.FrontSide;
  const back = mesh.clone();
  back.rotation.y += Math.PI;
  mesh.parent?.add(back);
  return back;
}

// Floating signs that turn (about Y) to face the camera, so the free camera never reads them mirrored.
export function faceCamera(ctx, mesh) { (ctx.faceCam ||= []).push(mesh); }

// Holo ad screens stuck to tower faces around the play area: rays from `origins` find flat, facing glass 25–120 m away.
// Every screen is one quad of a single merged mesh on a shared half-res ad reel (one draw call, per-screen phase).
export function addTowerAds(ctx, origins, { count = 8, seed = 3, first = 'aurelia', mats = ['facade', 'facadeWarm'] } = {}) {
  const targets = [];
  ctx.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && mats.includes(o.material?.name)) targets.push(o); });
  if (!targets.length) return null;
  ctx.scene.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(), R = rngLite(seed * 7919 + 1), dir = new THREE.Vector3(), o = new THREE.Vector3();
  const hitAt = (p, d) => { ray.set(p, d); ray.far = 140; return ray.intersectObjects(targets, false)[0]; };
  const placed = [], pos = [], uv = [], ph = [], idx = [];
  for (let t = 0; t < count * 30 && placed.length < count; t++) {
    const [ox, oz] = origins[t % origins.length];
    const a = R() * Math.PI * 2, y = 14 + R() * 30;
    o.set(ox, y, oz); dir.set(Math.sin(a), (R() - 0.5) * 0.15, Math.cos(a)).normalize();
    const h = hitAt(o, dir);
    if (!h || h.distance < 25 || !h.face) continue;
    const n = h.face.normal.clone().transformDirection(h.object.matrixWorld);
    if (Math.abs(n.y) > 0.05 || n.dot(dir) > -0.75) continue;
    const w = 9 + R() * 7, hh = w / 2;
    const right = new THREE.Vector3(n.z, 0, -n.x).normalize(), c = h.point.clone().addScaledVector(n, 0.35);
    if (placed.some((q) => q.distanceTo(c) < w * 1.4)) continue;
    // all four corners must sit on the same wall
    let ok = true;
    for (const [sx, sy] of [[-0.55, -0.55], [0.55, -0.55], [0.55, 0.55], [-0.55, 0.55]]) {
      const p0 = c.clone().addScaledVector(right, sx * w).add(new THREE.Vector3(0, sy * hh, 0)).addScaledVector(n, 3);
      const q = hitAt(p0, n.clone().negate());
      if (!q || Math.abs(q.distance - 3.35) > 0.25) { ok = false; break; }
    }
    if (!ok) continue;
    placed.push(c);
    const k = pos.length / 3, phase = R() * 4;
    for (const [sx, sy, u, v] of [[-0.5, -0.5, 0, 0], [0.5, -0.5, 1, 0], [0.5, 0.5, 1, 1], [-0.5, 0.5, 0, 1]]) {
      const p = c.clone().addScaledVector(right, sx * w).add(new THREE.Vector3(0, sy * hh, 0));
      pos.push(p.x, p.y, p.z); uv.push(u, v); ph.push(phase);
    }
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  if (!placed.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
  g.setIndex(idx); g.computeBoundingSphere();
  const r = HOLO_ART.reel(first, 0.5);
  const mesh = new THREE.Mesh(g, createHoloMaterial(r.canvas, { bright: 2.1, alpha: 0.94, time: ctx.time, side: THREE.FrontSide, reel: { ...r, hold: 8 } }));
  mesh.name = 'towerAds';
  ctx.scene.add(mesh);
  registerBillboard(ctx, mesh.material, 1024, 512);
  ctx.stats.towerAds = placed.length;
  return mesh;
}
