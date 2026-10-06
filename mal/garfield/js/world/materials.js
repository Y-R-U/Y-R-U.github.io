import * as THREE from '../../vendor/three/three.module.js';

// Procedural canvas textures. UVs from houseBuild are in metres, so `size` = metres covered by one texture tile.

let maxAniso = 4;
const cache = new Map();

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function canvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return [c, c.getContext('2d')];
}

function tex(c, size, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / size, 1 / size);
  t.anisotropy = maxAniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function noise(ctx, n, amt, seed = 1, scale = 1) {
  const r = rng(seed);
  const img = ctx.getImageData(0, 0, n, n);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (r() - 0.5) * amt * scale;
    d[i] += v; d[i + 1] += v; d[i + 2] += v;
  }
  ctx.putImageData(img, 0, 0);
}

function blotches(ctx, n, count, rad, alpha, seed, col = '0,0,0') {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    const x = r() * n, y = r() * n, rr = rad * (0.5 + r());
    const g = ctx.createRadialGradient(x, y, 0, x, y, rr);
    g.addColorStop(0, `rgba(${col},${alpha * r()})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      ctx.save(); ctx.translate(ox, oy); ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2); ctx.restore();
    }
  }
}

function woodGrain(ctx, x, y, w, h, base, seed, vertical = false) {
  const r = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(x, y, w, h);
  const len = vertical ? h : w, wid = vertical ? w : h;
  for (let i = 0; i < wid * 0.9; i++) {
    const off = r() * wid;
    ctx.strokeStyle = `rgba(${r() < 0.5 ? '60,30,10' : '255,230,190'},${0.025 + r() * 0.05})`;
    ctx.lineWidth = 0.5 + r() * 1.5;
    ctx.beginPath();
    const amp = 1 + r() * 3, f = 0.005 + r() * 0.02, ph = r() * 6;
    for (let t = 0; t <= len; t += 6) {
      const o = off + Math.sin(t * f + ph) * amp;
      if (vertical) (t ? ctx.lineTo(x + o, y + t) : ctx.moveTo(x + o, y + t));
      else (t ? ctx.lineTo(x + t, y + o) : ctx.moveTo(x + t, y + o));
    }
    ctx.stroke();
  }
  if (r() < 0.5) {
    const kx = x + r() * w, ky = y + r() * h;
    ctx.fillStyle = 'rgba(70,35,10,0.25)';
    ctx.beginPath(); ctx.ellipse(kx, ky, vertical ? 3 : 8, vertical ? 8 : 3, 0, 0, 7); ctx.fill();
  }
}

const builders = {
  woodFloor() {
    const n = 1024, [c, ctx] = canvas(n), r = rng(7);
    const rows = 10, ph = n / rows;
    const tones = ['#a0683f', '#a86f45', '#9a633c', '#a46b43', '#9e673f', '#ad7449'];
    for (let row = 0; row < rows; row++) {
      let x = -r() * 400;
      while (x < n) {
        const len = 520 + r() * 600;
        woodGrain(ctx, x, row * ph, len, ph, tones[(r() * tones.length) | 0], (r() * 1e6) | 0);
        if (x + len > n) woodGrain(ctx, x - n, row * ph, len, ph, tones[(r() * tones.length) | 0], (r() * 1e6) | 0);
        ctx.fillStyle = 'rgba(50,25,10,0.55)';
        ctx.fillRect(Math.max(0, x + len - 2), row * ph, 2, ph);
        x += len;
      }
      ctx.fillStyle = 'rgba(45,22,8,0.6)';
      ctx.fillRect(0, row * ph, n, 2);
      ctx.fillStyle = 'rgba(255,220,180,0.10)';
      ctx.fillRect(0, row * ph + 2, n, 2);
    }
    return tex(c, 2.2);
  },
  wood() {
    const n = 512, [c, ctx] = canvas(n);
    woodGrain(ctx, 0, 0, n, n, '#ece2d6', 3);
    noise(ctx, n, 6, 2);
    return tex(c, 0.8);
  },
  paint() {
    const n = 256, [c, ctx] = canvas(n);
    ctx.fillStyle = '#f6f6f6'; ctx.fillRect(0, 0, n, n);
    blotches(ctx, n, 30, 40, 0.015, 11);
    noise(ctx, n, 5, 3);
    return tex(c, 0.9);
  },
  fabric() {
    const n = 256, [c, ctx] = canvas(n);
    ctx.fillStyle = '#ececec'; ctx.fillRect(0, 0, n, n);
    for (let i = 0; i < n; i += 2) {
      ctx.fillStyle = `rgba(0,0,0,${i % 4 ? 0.05 : 0.09})`;
      ctx.fillRect(0, i, n, 1);
      ctx.fillStyle = `rgba(255,255,255,${i % 4 ? 0.05 : 0.08})`;
      ctx.fillRect(i, 0, 1, n);
    }
    blotches(ctx, n, 30, 30, 0.05, 4);
    noise(ctx, n, 16, 5);
    return tex(c, 0.25);
  },
  wallpaperLiving() {
    const n = 512, [c, ctx] = canvas(n);
    ctx.fillStyle = '#efdcb4'; ctx.fillRect(0, 0, n, n);
    for (let x = 0; x < n; x += 64) {
      ctx.fillStyle = 'rgba(205,160,95,0.09)'; ctx.fillRect(x, 0, 22, n);
    }
    const motif = (x, y, s) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.strokeStyle = 'rgba(120,140,90,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 26); ctx.quadraticCurveTo(-10, 6, 0, -14); ctx.stroke();
      ctx.fillStyle = 'rgba(120,145,90,0.35)';
      ctx.beginPath(); ctx.ellipse(-9, 10, 8, 4, -0.6, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(8, 2, 8, 4, 0.6, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(200,110,80,0.42)';
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2;
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * 7, -18 + Math.sin(a) * 7, 6, 4, a, 0, 7); ctx.fill();
      }
      ctx.fillStyle = 'rgba(240,190,80,0.6)';
      ctx.beginPath(); ctx.arc(0, -18, 4, 0, 7); ctx.fill();
      ctx.restore();
    };
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      motif(x * 128 + (y % 2) * 64 + 32, y * 128 + 64, 1);
      if (x * 128 + (y % 2) * 64 + 32 > n - 40) motif(x * 128 + (y % 2) * 64 + 32 - n, y * 128 + 64, 1);
    }
    noise(ctx, n, 8, 9);
    return tex(c, 0.75);
  },
  wainscot() {
    const n = 512, [c, ctx] = canvas(n);
    ctx.fillStyle = '#c9d2b0'; ctx.fillRect(0, 0, n, n);
    ctx.strokeStyle = 'rgba(70,80,50,0.35)'; ctx.lineWidth = 6;
    ctx.strokeRect(40, 70, n - 80, n - 140);
    ctx.strokeStyle = 'rgba(255,255,240,0.5)'; ctx.lineWidth = 3;
    ctx.strokeRect(46, 76, n - 92, n - 152);
    blotches(ctx, n, 20, 50, 0.04, 21);
    noise(ctx, n, 6, 22);
    const t = tex(c, 0.7);
    t.repeat.set(1 / 0.7, 1 / 0.9);
    return t;
  },
  kitchenWall() {
    const n = 256, [c, ctx] = canvas(n);
    ctx.fillStyle = '#f4caa2'; ctx.fillRect(0, 0, n, n);
    blotches(ctx, n, 40, 40, 0.04, 31, '150,90,40');
    noise(ctx, n, 7, 32);
    return tex(c, 1.0);
  },
  tile() {
    const n = 512, [c, ctx] = canvas(n), r = rng(41);
    ctx.fillStyle = '#d8d0bf'; ctx.fillRect(0, 0, n, n);
    const th = n / 8, tw = n / 4;
    for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) {
      const ox = x * tw + (y % 2) * tw / 2;
      const l = 238 + r() * 14;
      ctx.fillStyle = `rgb(${l},${l - 4},${l - 14})`;
      ctx.fillRect(ox + 3, y * th + 3, tw - 6, th - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(ox + 5, y * th + 5, tw - 10, 3);
    }
    return tex(c, 0.6);
  },
  checker() {
    const n = 512, [c, ctx] = canvas(n);
    const s = n / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#7a5844' : '#e4d4b6';
      ctx.fillRect(x * s, y * s, s, s);
    }
    ctx.strokeStyle = 'rgba(80,50,30,0.35)'; ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(i * s, 0); ctx.lineTo(i * s, n); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i * s); ctx.lineTo(n, i * s); ctx.stroke();
    }
    blotches(ctx, n, 30, 50, 0.06, 51, '90,60,30');
    noise(ctx, n, 10, 52);
    return tex(c, 1.2);
  },
  bedroomWall() {
    const n = 512, [c, ctx] = canvas(n);
    ctx.fillStyle = '#c2bea2'; ctx.fillRect(0, 0, n, n);
    blotches(ctx, n, 30, 50, 0.04, 62, '90,80,50');
    ctx.fillStyle = 'rgba(255,250,230,0.22)';
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const cx = x * 64 + (y % 2) * 32 + 16, cy = y * 64 + 32;
      ctx.beginPath(); ctx.moveTo(cx, cy - 7); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, cy + 7); ctx.lineTo(cx - 5, cy); ctx.fill();
    }
    noise(ctx, n, 7, 61);
    return tex(c, 0.8);
  },
  carpet() {
    const n = 256, [c, ctx] = canvas(n);
    ctx.fillStyle = '#cdb8a0'; ctx.fillRect(0, 0, n, n);
    blotches(ctx, n, 40, 25, 0.025, 71);
    noise(ctx, n, 22, 72);
    return tex(c, 0.6);
  },
  rugLiving() {
    const w = 1024, h = 768, c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'), r = rng(83);
    ctx.fillStyle = '#efe0c0'; ctx.fillRect(0, 0, w, h);
    const fr = 22;
    for (let x = 0; x < w; x += 6) { ctx.fillStyle = 'rgba(200,180,140,0.9)'; ctx.fillRect(x, 0, 3, fr); ctx.fillRect(x, h - fr, 3, fr); }
    ctx.clearRect(0, 0, w, 4); ctx.clearRect(0, h - 4, w, 4);
    const inset = (d, col) => { ctx.fillStyle = col; ctx.fillRect(d, fr + d - 10, w - 2 * d, h - 2 * (fr + d - 10)); };
    inset(10, '#7a2a22'); inset(28, '#d9a35a'); inset(36, '#5a2a3a'); inset(64, '#d9a35a'); inset(72, '#a8382c');
    for (let i = 0; i < 26; i++) {
      const x = 60 + i * (w - 120) / 25;
      ctx.fillStyle = i % 2 ? '#e8c58c' : '#3f5a6a';
      ctx.beginPath(); ctx.moveTo(x, fr + 42); ctx.lineTo(x + 10, fr + 50); ctx.lineTo(x, fr + 58); ctx.lineTo(x - 10, fr + 50); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, h - fr - 42); ctx.lineTo(x + 10, h - fr - 50); ctx.lineTo(x, h - fr - 58); ctx.lineTo(x - 10, h - fr - 50); ctx.fill();
    }
    const cx = w / 2, cy = h / 2;
    const dia = (rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - rx, cy); ctx.lineTo(cx, cy - ry); ctx.lineTo(cx + rx, cy); ctx.lineTo(cx, cy + ry); ctx.fill(); };
    dia(300, 230, '#e8c58c'); dia(270, 205, '#3f5a6a'); dia(220, 165, '#c9a06a'); dia(170, 125, '#7a2a22'); dia(110, 82, '#e8c58c'); dia(60, 45, '#a8382c');
    for (let k = 0; k < 4; k++) {
      ctx.save(); ctx.translate(k % 2 ? w - 140 : 140, k < 2 ? 150 : h - 150);
      ctx.fillStyle = '#3f5a6a'; ctx.beginPath(); ctx.arc(0, 0, 44, 0, 7); ctx.fill();
      ctx.fillStyle = '#e8c58c'; ctx.beginPath(); ctx.arc(0, 0, 26, 0, 7); ctx.fill();
      ctx.restore();
    }
    for (let i = 0; i < 400; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '255,230,180' : '60,20,10'},0.12)`; ctx.fillRect(100 + r() * (w - 200), 100 + r() * (h - 200), 6, 3); }
    noise(ctx, w, 22, 84);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    return t;
  },
  rugBed() {
    const n = 512, [c, ctx] = canvas(n);
    ctx.fillStyle = '#9a4a3a'; ctx.fillRect(0, 0, n, n);
    ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 14; ctx.strokeRect(24, 24, n - 48, n - 48);
    ctx.lineWidth = 5; ctx.strokeRect(54, 54, n - 108, n - 108);
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#d8a64e' : '#5d7f9a';
      ctx.beginPath(); ctx.arc(110 + i * 58, 110 + j * 58, 9, 0, 7); ctx.fill();
    }
    noise(ctx, n, 26, 91);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    return t;
  },
  siding() {
    const n = 512, [c, ctx] = canvas(n);
    ctx.fillStyle = '#f0f0f0'; ctx.fillRect(0, 0, n, n);
    for (let y = 0; y < n; y += 64) {
      const g = ctx.createLinearGradient(0, y, 0, y + 64);
      g.addColorStop(0, 'rgba(0,0,0,0.18)'); g.addColorStop(0.15, 'rgba(0,0,0,0)');
      g.addColorStop(0.9, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.1)');
      ctx.fillStyle = g; ctx.fillRect(0, y, n, 64);
    }
    noise(ctx, n, 8, 101);
    return tex(c, 1.2);
  },
  shingles() {
    const n = 512, [c, ctx] = canvas(n), r = rng(111);
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 0, n, n);
    const rows = 8, h = n / rows, w = n / 6;
    for (let y = 0; y < rows; y++) for (let x = -1; x < 7; x++) {
      const l = 180 + r() * 60;
      ctx.fillStyle = `rgb(${l},${l},${l})`;
      ctx.fillRect(x * w + (y % 2) * w / 2 + 2, y * h, w - 4, h - 3);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x * w + (y % 2) * w / 2 + 2, y * h + h - 8, w - 4, 5);
    }
    noise(ctx, n, 18, 112);
    return tex(c, 1.4);
  },
  grass() {
    const n = 512, [c, ctx] = canvas(n), r = rng(121);
    ctx.fillStyle = '#c4d8a4'; ctx.fillRect(0, 0, n, n);
    blotches(ctx, n, 50, 70, 0.08, 122, '40,70,10');
    blotches(ctx, n, 25, 50, 0.06, 123, '255,240,180');
    for (let i = 0; i < 9000; i++) {
      const x = r() * n, y = r() * n;
      ctx.strokeStyle = r() < 0.5 ? 'rgba(60,90,20,0.25)' : 'rgba(250,255,200,0.2)';
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 3, y - 4 - r() * 4); ctx.stroke();
    }
    return tex(c, 5);
  },
  asphalt() {
    const n = 256, [c, ctx] = canvas(n);
    ctx.fillStyle = '#d0d0d0'; ctx.fillRect(0, 0, n, n);
    blotches(ctx, n, 40, 40, 0.08, 131);
    noise(ctx, n, 40, 132);
    return tex(c, 3);
  },
  concrete() {
    const n = 256, [c, ctx] = canvas(n);
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, n, n);
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(0, 0, n, 3); ctx.fillRect(0, 0, 3, n);
    blotches(ctx, n, 30, 40, 0.06, 141);
    noise(ctx, n, 18, 142);
    return tex(c, 1.5);
  },
  art() {
    const n = 1024, [c, ctx] = canvas(n), cw = n / 4, ch = n / 2, r = rng(201);
    const cell = (i, fn) => { ctx.save(); ctx.translate((i % 4) * cw, ((i / 4) | 0) * ch); ctx.beginPath(); ctx.rect(0, 0, cw, ch); ctx.clip(); fn(); ctx.restore(); };
    const sky = (a, b2) => { const g = ctx.createLinearGradient(0, 0, 0, ch); g.addColorStop(0, a); g.addColorStop(1, b2); ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch); };
    const hill = (y, col, amp, f) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, ch); for (let x = 0; x <= cw; x += 8) ctx.lineTo(x, y + Math.sin(x * f + y) * amp); ctx.lineTo(cw, ch); ctx.fill(); };
    cell(0, () => { sky('#f6c27a', '#f08a5d'); ctx.fillStyle = '#ffe9a8'; ctx.beginPath(); ctx.arc(cw * 0.7, ch * 0.45, 40, 0, 7); ctx.fill(); hill(ch * 0.55, '#9b6a8e', 30, 0.02); hill(ch * 0.7, '#6c4f7a', 20, 0.03); });
    cell(1, () => { ctx.fillStyle = '#f3e7cf'; ctx.fillRect(0, 0, cw, ch); ctx.fillStyle = '#d8c6a4'; ctx.fillRect(0, ch * 0.62, cw, ch);
      ctx.fillStyle = '#5d8fb0'; ctx.beginPath(); ctx.moveTo(cw * 0.35, ch * 0.62); ctx.lineTo(cw * 0.65, ch * 0.62); ctx.lineTo(cw * 0.6, ch * 0.4); ctx.lineTo(cw * 0.4, ch * 0.4); ctx.fill();
      for (let i = 0; i < 7; i++) { ctx.fillStyle = ['#e0543c', '#f2b234', '#f08aa0', '#ffffff'][i % 4]; ctx.beginPath(); ctx.arc(cw * (0.36 + r() * 0.28), ch * (0.2 + r() * 0.18), 22 + r() * 10, 0, 7); ctx.fill(); }
      ctx.strokeStyle = '#4c7a3a'; ctx.lineWidth = 4; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(cw * 0.5, ch * 0.42); ctx.lineTo(cw * (0.38 + i * 0.06), ch * 0.3); ctx.stroke(); } });
    cell(2, () => { sky('#9fd0e8', '#e6f4f8'); ctx.fillStyle = '#3d6e9a'; ctx.fillRect(0, ch * 0.62, cw, ch); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cw * 0.5, ch * 0.2); ctx.lineTo(cw * 0.5, ch * 0.56); ctx.lineTo(cw * 0.75, ch * 0.56); ctx.fill(); ctx.fillStyle = '#d2513e'; ctx.fillRect(cw * 0.3, ch * 0.57, cw * 0.45, 20); });
    cell(3, () => { ctx.fillStyle = '#f6e3a6'; ctx.fillRect(0, 0, cw, ch); ctx.fillStyle = '#c9563e'; ctx.fillRect(cw * 0.2, ch * 0.42, cw * 0.6, ch * 0.22); ctx.fillStyle = '#f2c24a'; ctx.fillRect(cw * 0.2, ch * 0.38, cw * 0.6, ch * 0.06); ctx.fillStyle = '#e8dcc0'; ctx.fillRect(cw * 0.2, ch * 0.5, cw * 0.6, ch * 0.04); ctx.fillStyle = '#7a4a2a'; ctx.fillRect(cw * 0.15, ch * 0.64, cw * 0.7, 14); });
    cell(4, () => { sky('#2c3e6b', '#f2a65a'); ctx.fillStyle = '#fff4c8'; for (let i = 0; i < 40; i++) ctx.fillRect(r() * cw, r() * ch * 0.4, 3, 3); hill(ch * 0.66, '#24304d', 24, 0.015); ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(cw * 0.3, ch * 0.3, 30, 0, 7); ctx.fill(); });
    cell(5, () => { ctx.fillStyle = '#e9dcc0'; ctx.fillRect(0, 0, cw, ch); ctx.fillStyle = '#e8891c'; ctx.beginPath(); ctx.ellipse(cw / 2, ch * 0.62, 70, 55, 0, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(cw / 2, ch * 0.4, 50, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cw / 2 - 45, ch * 0.33); ctx.lineTo(cw / 2 - 30, ch * 0.22); ctx.lineTo(cw / 2 - 15, ch * 0.32); ctx.moveTo(cw / 2 + 45, ch * 0.33); ctx.lineTo(cw / 2 + 30, ch * 0.22); ctx.lineTo(cw / 2 + 15, ch * 0.32); ctx.fill();
      ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 5; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cw / 2 + s * 70, ch * 0.6); ctx.lineTo(cw / 2 + s * 40, ch * 0.62); ctx.stroke(); } ctx.fillStyle = '#c9a271'; ctx.fillRect(0, ch * 0.82, cw, ch); });
    cell(6, () => { sky('#bfe0c9', '#f5f0d8'); for (let i = 0; i < 4; i++) { ctx.fillStyle = ['#e0543c', '#f2b234', '#5d8fb0', '#8db06a'][i]; ctx.beginPath(); ctx.arc(cw * (0.25 + (i % 2) * 0.5), ch * (0.3 + (i >> 1) * 0.4), 50, 0, 7); ctx.fill(); } });
    cell(7, () => { ctx.fillStyle = '#fff6e0'; ctx.fillRect(0, 0, cw, ch); ctx.fillStyle = '#c9563e'; ctx.font = 'bold 54px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('Home', cw / 2, ch * 0.45); ctx.fillText('Sweet', cw / 2, ch * 0.6); ctx.fillText('Home', cw / 2, ch * 0.75); ctx.strokeStyle = '#5d8fb0'; ctx.lineWidth = 8; ctx.strokeRect(20, 20, cw - 40, ch - 40); });
    noise(ctx, n, 10, 202);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    return t;
  },
  rugBraid() {
    const n = 512, [c, ctx] = canvas(n);
    const cols = ['#a8664a', '#c49a6a', '#8f8a68', '#b8805a', '#c8aa80'];
    const bands = 22, bw = (n / 2) / bands;
    for (let i = 0; i < bands; i++) {
      const rad = n / 2 - i * bw;
      ctx.fillStyle = cols[(i * 2 + (i >> 2)) % cols.length];
      ctx.beginPath(); ctx.arc(n / 2, n / 2, rad, 0, 7); ctx.fill();
      // braid texture: short slanted strokes around the band
      const k = Math.max(12, Math.floor(rad * 0.5));
      ctx.lineWidth = 2;
      for (let j = 0; j < k; j++) {
        const t = j / k * Math.PI * 2, rm = rad - bw / 2;
        const x = n / 2 + Math.cos(t) * rm, y = n / 2 + Math.sin(t) * rm;
        ctx.strokeStyle = j % 2 ? 'rgba(60,30,15,0.28)' : 'rgba(255,235,200,0.22)';
        ctx.beginPath(); ctx.moveTo(x - Math.cos(t + 0.9) * bw * 0.45, y - Math.sin(t + 0.9) * bw * 0.45); ctx.lineTo(x + Math.cos(t + 0.9) * bw * 0.45, y + Math.sin(t + 0.9) * bw * 0.45); ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath(); ctx.arc(n / 2, n / 2, n / 2 - 2, 0, 7); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    noise(ctx, n, 30, 301);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    return t;
  },
  brick() {
    const n = 512, [c, ctx] = canvas(n), r = rng(151);
    ctx.fillStyle = '#e8dcd0'; ctx.fillRect(0, 0, n, n);
    const bh = n / 16, bw = n / 4;
    for (let y = 0; y < 16; y++) for (let x = -1; x < 5; x++) {
      const l = 0.85 + r() * 0.3;
      ctx.fillStyle = `rgb(${Math.min(255, 200 * l) | 0},${(120 * l) | 0},${(100 * l) | 0})`;
      ctx.fillRect(x * bw + (y % 2) * bw / 2 + 3, y * bh + 3, bw - 6, bh - 6);
    }
    noise(ctx, n, 16, 152);
    return tex(c, 1.0);
  },
  blob() {
    const n = 128, [c, ctx] = canvas(n);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, n, n);
    const g = ctx.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#d0d0d0'); g.addColorStop(0.8, '#555'); g.addColorStop(1, '#000');
    ctx.fillStyle = g; ctx.fillRect(0, 0, n, n);
    const t = new THREE.CanvasTexture(c);
    return t;
  },
};

export function texture(name) {
  if (!cache.has(name)) cache.set(name, builders[name]());
  return cache.get(name);
}

const mats = new Map();

// Material keys are what houseBuild buckets/merges geometry by.
const defs = {
  woodFloor: () => ({ map: texture('woodFloor'), roughness: 0.55, color: 0xffffff }),
  wood: () => ({ map: texture('wood'), roughness: 0.6 }),
  woodGloss: () => ({ map: texture('wood'), roughness: 0.32 }),
  paint: () => ({ map: texture('paint'), roughness: 0.85 }),
  ceiling: () => ({ map: texture('paint'), roughness: 0.95, emissive: 0x7a5a42, emissiveIntensity: 0.45 }),
  gloss: () => ({ map: texture('paint'), roughness: 0.28 }),
  fabric: () => ({ map: texture('fabric'), roughness: 1.0, sheen: true }),
  metal: () => ({ roughness: 0.3, metalness: 0.85 }),
  ceramic: () => ({ roughness: 0.18 }),
  wallpaperLiving: () => ({ map: texture('wallpaperLiving'), roughness: 0.9 }),
  wainscot: () => ({ map: texture('wainscot'), roughness: 0.7 }),
  kitchenWall: () => ({ map: texture('kitchenWall'), roughness: 0.85 }),
  tile: () => ({ map: texture('tile'), roughness: 0.25 }),
  checker: () => ({ map: texture('checker'), roughness: 0.35 }),
  bedroomWall: () => ({ map: texture('bedroomWall'), roughness: 0.9 }),
  carpet: () => ({ map: texture('carpet'), roughness: 1.0 }),
  rugLiving: () => ({ map: texture('rugLiving'), roughness: 1.0, transparent: true, alphaTest: 0.5 }),
  rugBraid: () => ({ map: texture('rugBraid'), roughness: 1.0, transparent: true, alphaTest: 0.5 }),
  rugBed: () => ({ map: texture('rugBed'), roughness: 1.0 }),
  siding: () => ({ map: texture('siding'), roughness: 0.8 }),
  shingles: () => ({ map: texture('shingles'), roughness: 0.95 }),
  grass: () => ({ map: texture('grass'), roughness: 1.0, color: 0x908c84 }),
  asphalt: () => ({ map: texture('asphalt'), roughness: 0.95 }),
  concrete: () => ({ map: texture('concrete'), roughness: 0.9 }),
  leaf: () => ({ map: texture('fabric'), roughness: 0.85 }),
  brick: () => ({ map: texture('brick'), roughness: 0.9 }),
  art: () => ({ map: texture('art'), roughness: 0.6 }),
  glass: () => ({ roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false, envMapIntensity: 1.5 }),
  // dusk-tinted window panes: the yard behind them is lit by the interior key, this pulls it toward evening
  windowGlass: () => ({ color: 0x4a5a90, noVC: true, roughness: 0.05, transparent: true, opacity: 0.4, depthWrite: false, envMapIntensity: 1.5 }),
  glowWarm: () => ({ emissive: 0xffc77a, emissiveIntensity: 1.6, roughness: 0.9, noVC: true, color: 0xffe3b8 }),
  shadeGlow: () => ({ color: 0xf6e2b0, emissive: 0xffb860, emissiveIntensity: 0.75, roughness: 0.45 }),
  glowShade: () => ({ emissive: 0xffb060, emissiveIntensity: 0.55, roughness: 0.9, side: THREE.DoubleSide }),
  glowWindow: () => ({ emissive: 0xffc070, emissiveIntensity: 1.3, roughness: 0.6, noVC: true, color: 0x553311 }),
  screen: () => ({ emissive: 0x6f9fb0, emissiveIntensity: 0.6, roughness: 0.15, noVC: true, color: 0x223038 }),
  blob: () => ({ basic: true }),
};

export function material(key) {
  if (mats.has(key)) return mats.get(key);
  const d = defs[key]();
  let m;
  if (d.basic) {
    m = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: texture('blob'), transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  } else {
    const opts = { color: d.color ?? 0xffffff, roughness: d.roughness, metalness: d.metalness ?? 0, vertexColors: !d.noVC };
    for (const k of ['map', 'transparent', 'opacity', 'depthWrite', 'alphaTest', 'emissive', 'emissiveIntensity', 'side', 'envMapIntensity']) if (d[k] !== undefined) opts[k] = d[k];
    if (d.sheen) {
      m = new THREE.MeshPhysicalMaterial({ ...opts, sheen: 0.6, sheenRoughness: 0.8, sheenColor: new THREE.Color(0xfff0dd) });
    } else m = new THREE.MeshStandardMaterial(opts);
  }
  m.name = key;
  mats.set(key, m);
  return m;
}

export function initMaterials(renderer, quality) {
  maxAniso = Math.min(quality === 'low' ? 2 : 8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
}
