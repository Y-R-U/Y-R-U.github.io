// canvastex.js — every piece of 2D art in the game is drawn here, seeded.
// Billboards, street signs, posters (math-art), book covers, shop signs.

import * as THREE from 'three';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function toTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const MONO = 'ui-monospace, Menlo, Consolas, monospace';
const SANS = 'system-ui, -apple-system, sans-serif';
const SERIF = 'Georgia, "Times New Roman", serif';

function fontFor(kind, px, weight = 700) {
  const fam = kind === 'mono' ? MONO : kind === 'serif' ? SERIF : SANS;
  return `${kind === 'serif' ? 'italic ' : ''}${weight} ${px}px ${fam}`;
}

// Draw \n-separated lines centred at (x, y), auto-shrinking to fit maxW.
function drawLines(ctx, text, x, y, px, maxW, lineGap = 1.15) {
  const lines = String(text).split('\n');
  for (const line of lines) {
    let size = px;
    ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
    while (ctx.measureText(line).width > maxW && size > 10) {
      size -= 2;
      ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
    }
    ctx.fillText(line, x, y);
    y += px * lineGap;
    ctx.font = ctx.font.replace(/\d+px/, `${px}px`);
  }
  return y;
}

const hx = (n) => '#' + n.toString(16).padStart(6, '0');

// ── billboards ───────────────────────────────────────────────────────────────
export function billboardCanvas(msg, famName, hue, rand, w = 512, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const dark = rand.chance(0.5);
  const bg = ctx.createLinearGradient(0, 0, w, h);
  if (dark) {
    bg.addColorStop(0, `hsl(${hue},45%,12%)`); bg.addColorStop(1, `hsl(${hue + 40},50%,20%)`);
  } else {
    bg.addColorStop(0, `hsl(${hue},60%,88%)`); bg.addColorStop(1, `hsl(${hue + 30},55%,72%)`);
  }
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  // accent stripe
  ctx.fillStyle = `hsl(${(hue + 180) % 360},80%,${dark ? 60 : 40}%)`;
  ctx.fillRect(0, h - 14, w, 14);
  // main copy
  ctx.fillStyle = dark ? '#f2ede4' : '#1a1520';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lines = msg.split('\n');
  const big = 54, small = 30;
  ctx.font = fontFor('sans', big, 800);
  let y = h / 2 - ((lines.length - 1) * 40) / 2;
  lines.forEach((line, i) => {
    const px = i === 0 ? big : small;
    ctx.font = fontFor(i === 0 ? 'sans' : 'serif', px, i === 0 ? 800 : 400);
    let size = px;
    while (ctx.measureText(line).width > w - 50 && size > 12) {
      size -= 2; ctx.font = ctx.font.replace(/\d+px/, `${size}px`);
    }
    ctx.fillText(line, w / 2, y);
    y += i === 0 ? 56 : 38;
  });
  // family tag
  ctx.font = fontFor('mono', 15, 400);
  ctx.textAlign = 'right';
  ctx.fillStyle = dark ? 'rgba(240,235,225,.55)' : 'rgba(20,15,30,.5)';
  ctx.fillText(famName.toUpperCase(), w - 12, h - 30);
  ctx.strokeStyle = dark ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.3)';
  ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
  return c;
}

// The wall quote, painted large — appears on one billboard per world.
export function quoteBillboardCanvas(quote, hue, w = 512, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = `hsl(${hue},20%,10%)`; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = `hsl(${hue},60%,55%)`; ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  ctx.fillStyle = '#efe9dc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  // wrap
  ctx.font = fontFor('serif', 30, 400);
  const words = quote.t.split(' ');
  const lines = []; let cur = '';
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd;
    if (ctx.measureText(test).width > w - 70 && cur) { lines.push(cur); cur = wd; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  let y = h / 2 - ((lines.length - 1) * 34) / 2 - (quote.by ? 10 : 0);
  for (const line of lines) { ctx.fillText(line, w / 2, y); y += 34; }
  if (quote.by) {
    ctx.font = fontFor('mono', 16, 400);
    ctx.fillStyle = `hsl(${hue},60%,65%)`;
    ctx.fillText('— ' + quote.by, w / 2, y + 12);
  }
  return c;
}

// ── street signs ─────────────────────────────────────────────────────────────
export function signCanvas(msg, theme, w = 256, h = 128) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const { hue, dark, fam } = theme;
  ctx.fillStyle = dark ? `hsl(${hue},35%,16%)` : `hsl(${hue},45%,82%)`;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = dark ? `hsl(${hue},60%,60%)` : `hsl(${hue},50%,25%)`;
  ctx.lineWidth = 5; ctx.strokeRect(5, 5, w - 10, h - 10);
  ctx.fillStyle = dark ? '#f0ead9' : `hsl(${hue},55%,16%)`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const kind = fam.font === 'mono' ? 'mono' : fam.font === 'serif' ? 'serif' : 'sans';
  const lines = msg.split('\n');
  const px = lines.length > 1 ? 26 : 32;
  ctx.font = fontFor(kind, px, fam.font === 'bold' ? 800 : 600);
  let y = h / 2 - ((lines.length - 1) * px * 1.2) / 2;
  drawLines(ctx, msg, w / 2, y, px, w - 26, 1.2);
  return c;
}

// ── posters: seeded math-art (the br8t lineage) ──────────────────────────────
export function posterCanvas(set, rand, uuid, w = 256, h = 320) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const { hue, inverted, fam } = set;
  const bgL = inverted ? 88 : 12, fgL = inverted ? 18 : 78;
  const bg = `hsl(${hue},${inverted ? 15 : 30}%,${bgL}%)`;
  const fg = `hsl(${(hue + 30) % 360},70%,${fgL}%)`;
  const fg2 = `hsl(${(hue + 170) % 360},70%,${fgL - 8}%)`;
  ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.42;
  ctx.lineWidth = 1.5;

  switch (fam.style) {
    case 'lissajous': {
      const a = rand.int(2, 5), b = rand.int(3, 7), ph = rand.float() * Math.PI;
      ctx.strokeStyle = fg; ctx.beginPath();
      for (let i = 0; i <= 600; i++) {
        const t = i / 600 * Math.PI * 2;
        const x = cx + Math.sin(a * t + ph) * w * 0.36;
        const y = cy + Math.sin(b * t) * h * 0.30;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.4; ctx.strokeStyle = fg2; ctx.beginPath();
      for (let i = 0; i <= 600; i++) {
        const t = i / 600 * Math.PI * 2;
        ctx[i ? 'lineTo' : 'moveTo'](cx + Math.sin((a + 1) * t) * w * 0.36, cy + Math.sin(b * t + ph) * h * 0.30);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
      break;
    }
    case 'moire': {
      const n = rand.int(24, 40), off = rand.range(4, 14);
      for (let k = 0; k < 2; k++) {
        ctx.strokeStyle = k ? fg2 : fg; ctx.globalAlpha = 0.55;
        for (let i = 1; i < n; i++) {
          ctx.beginPath();
          ctx.arc(cx + (k ? off : -off), cy + (k ? off * 0.4 : 0), i * (w * 0.42 / n), 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'voronoi': {
      const seeds = [];
      for (let i = 0; i < 20; i++) seeds.push([rand.float() * w, rand.float() * h * 0.8, rand.float()]);
      const step = 4;
      for (let y = 0; y < h * 0.8; y += step) for (let x = 0; x < w; x += step) {
        let bd = 1e9, bi = 0;
        for (let i = 0; i < seeds.length; i++) {
          const dx = x - seeds[i][0], dy = y - seeds[i][1], d = dx * dx + dy * dy;
          if (d < bd) { bd = d; bi = i; }
        }
        ctx.fillStyle = `hsl(${(hue + seeds[bi][2] * 90) % 360},55%,${bgL + (fgL - bgL) * (0.25 + seeds[bi][2] * 0.6)}%)`;
        ctx.fillRect(x, y, step, step);
      }
      break;
    }
    case 'spiral': {
      const n = 320, ga = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const r = Math.sqrt(i / n) * w * 0.42, th = i * ga;
        const s = 1.5 + (i / n) * 4;
        ctx.fillStyle = i % 3 ? fg : fg2;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(th) * r, cy + Math.sin(th) * r * 0.9, s, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'rays': {
      const n = rand.int(16, 30);
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = a0 + Math.PI / n;
        ctx.fillStyle = i % 2 ? fg : bg;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, w * 0.55, a0, a1); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = fg2; ctx.beginPath(); ctx.arc(cx, cy, w * 0.1, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'grid': {
      ctx.strokeStyle = fg;
      const hor = cy;
      for (let i = 0; i <= 12; i++) { // perspective floor
        const t = i / 12, y = hor + t * t * (h * 0.5);
        ctx.globalAlpha = 0.25 + t * 0.7;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let i = -8; i <= 8; i++) {
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.moveTo(cx + i * 14, hor); ctx.lineTo(cx + i * 60, h); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = fg2; ctx.beginPath(); ctx.arc(cx, hor - h * 0.14, w * 0.13, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'noise': {
      const g = 8;
      for (let y = 0; y < h * 0.8; y += g) for (let x = 0; x < w; x += g) {
        const v = rand.float();
        if (v > 0.55) {
          ctx.fillStyle = v > 0.85 ? fg2 : fg;
          ctx.globalAlpha = (v - 0.55) * 1.6;
          ctx.fillRect(x, y, g - 1, g - 1);
        }
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'glyphs': {
      const AL = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      ctx.font = fontFor('mono', 22, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      let k = 0;
      for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
        const ch = (row * 8 + col) < 32 && uuid ? uuid[row * 8 + col] : AL[rand.int(0, 61)];
        const hot = uuid && (row * 8 + col) < 32 && rand.chance(0.2);
        ctx.fillStyle = hot ? fg2 : fg;
        ctx.globalAlpha = hot ? 1 : 0.35 + rand.float() * 0.5;
        ctx.fillText(ch, 24 + col * (w - 48) / 7, 30 + row * (h * 0.75 - 40) / 7);
        k++;
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'circles': {
      const n = 5;
      for (let i = 0; i < n; i++) { // moon phases row + big halo
        const x = w * (0.15 + 0.175 * i), r = w * 0.07;
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(x, h * 0.2, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = bg; ctx.beginPath();
        ctx.arc(x + r * (i / (n - 1) * 2 - 1), h * 0.2, r * 0.92, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = fg2; ctx.lineWidth = 3;
      for (let i = 0; i < 4; i++) {
        ctx.globalAlpha = 1 - i * 0.22;
        ctx.beginPath(); ctx.arc(cx, cy + h * 0.08, w * 0.14 + i * 13, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      break;
    }
    case 'mountain': {
      for (let layer = 0; layer < 4; layer++) {
        const base = h * (0.35 + layer * 0.13);
        ctx.fillStyle = `hsl(${(hue + layer * 12) % 360},45%,${inverted ? 70 - layer * 12 : 22 + layer * 13}%)`;
        ctx.beginPath(); ctx.moveTo(0, h);
        let ph = rand.float() * 9;
        for (let x = 0; x <= w; x += 8) {
          const y = base + Math.sin(x * 0.02 + ph) * 18 + Math.sin(x * 0.05 + ph * 2) * 9;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = fg2; ctx.beginPath(); ctx.arc(w * 0.72, h * 0.18, w * 0.09, 0, Math.PI * 2); ctx.fill();
      break;
    }
  }
  // caption word
  const word = fam.words[rand.int(0, fam.words.length - 1)];
  ctx.fillStyle = inverted ? '#141018' : '#f0ead9';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = fontFor('sans', 30, 800);
  let size = 30;
  while (ctx.measureText(word).width > w - 30 && size > 12) { size -= 2; ctx.font = fontFor('sans', size, 800); }
  ctx.fillText(word, cx, h * 0.90);
  ctx.strokeStyle = inverted ? 'rgba(0,0,0,.5)' : 'rgba(255,255,255,.35)';
  ctx.lineWidth = 3; ctx.strokeRect(4, 4, w - 8, h - 8);
  return c;
}

// ── inspirational poster: big word, small subline, geometric sunrise ─────────
export function inspoPosterCanvas(entry, hue, rand, w = 256, h = 320) {
  const [word, sub] = entry;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#0c0e14'; ctx.fillRect(0, 0, w, h);
  // image field: horizon, sun, rays or peak (classic motivational framing)
  const fy = h * 0.56;
  const g = ctx.createLinearGradient(0, 20, 0, fy);
  g.addColorStop(0, `hsl(${hue},55%,14%)`); g.addColorStop(1, `hsl(${(hue + 30) % 360},65%,34%)`);
  ctx.fillStyle = g; ctx.fillRect(18, 20, w - 36, fy - 20);
  const cx = w / 2, sy = fy - 24;
  ctx.fillStyle = `hsl(${(hue + 45) % 360},85%,62%)`;
  ctx.beginPath(); ctx.arc(cx, sy, 26, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = `hsla(${(hue + 45) % 360},85%,62%,0.5)`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 34, sy + Math.sin(a) * 34);
    ctx.lineTo(cx + Math.cos(a) * (44 + (i % 2) * 8), sy + Math.sin(a) * (44 + (i % 2) * 8));
    ctx.stroke();
  }
  if (rand.chance(0.5)) { // mountain silhouette in front of the sun
    ctx.fillStyle = 'rgba(10,10,18,0.85)';
    ctx.beginPath(); ctx.moveTo(18, fy);
    ctx.lineTo(w * 0.38, fy - 40); ctx.lineTo(w * 0.52, fy - 12);
    ctx.lineTo(w * 0.68, fy - 52); ctx.lineTo(w - 18, fy);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(10,10,18,1)'; ctx.fillRect(18, fy - 4, w - 36, 4);
  // the word
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f0ead9';
  let size = 34;
  ctx.font = fontFor('serif', size, 700);
  while (ctx.measureText(word).width > w - 44 && size > 14) { size -= 2; ctx.font = fontFor('serif', size, 700); }
  ctx.fillText(word, cx, h * 0.72);
  ctx.font = fontFor('sans', 13, 400);
  ctx.fillStyle = `hsl(${(hue + 45) % 360},45%,62%)`;
  let ssize = 13;
  while (ctx.measureText(sub).width > w - 36 && ssize > 8) { ssize -= 1; ctx.font = fontFor('sans', ssize, 400); }
  ctx.fillText(sub, cx, h * 0.82);
  ctx.strokeStyle = 'rgba(240,234,217,0.35)'; ctx.lineWidth = 2;
  ctx.strokeRect(10, 10, w - 20, h - 20);
  return c;
}

// ── city data board: live date/time + this world's (seeded) temperature ──────
// Draws in place so the world can refresh it every few seconds.
export function drawDataBoard(canvas, spec, tempC) {
  const w = canvas.width, h = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#08090c'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#2a3038'; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
  const now = new Date();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = fontFor('mono', 64, 700);
  ctx.fillStyle = '#ffb830';
  ctx.shadowColor = '#ffb830'; ctx.shadowBlur = 12;
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const blink = now.getSeconds() % 2 ? ':' : ' ';
  ctx.fillText(`${hh}${blink}${mm}`, w * 0.30, h * 0.40);
  ctx.font = fontFor('mono', 52, 700);
  ctx.fillText(`${tempC}°C`, w * 0.74, h * 0.40);
  ctx.shadowBlur = 0;
  ctx.font = fontFor('mono', 24, 400);
  ctx.fillStyle = '#7a8894';
  ctx.fillText(now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase(), w * 0.30, h * 0.78);
  ctx.fillText(spec.weather.name.toUpperCase(), w * 0.74, h * 0.78);
  return canvas;
}

// ── framed wall quote (room) ─────────────────────────────────────────────────
export function quoteFrameCanvas(quote, hue, w = 512, h = 256) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f5efe2'; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = `hsl(${hue},35%,35%)`; ctx.lineWidth = 10; ctx.strokeRect(8, 8, w - 16, h - 16);
  ctx.strokeStyle = `hsl(${hue},35%,60%)`; ctx.lineWidth = 2; ctx.strokeRect(20, 20, w - 40, h - 40);
  ctx.fillStyle = '#2a2320'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = fontFor('serif', 28, 400);
  const words = quote.t.split(' ');
  const lines = []; let cur = '';
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd;
    if (ctx.measureText(test).width > w - 90 && cur) { lines.push(cur); cur = wd; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  let y = h / 2 - ((lines.length - 1) * 32) / 2 - (quote.by ? 12 : 0);
  for (const line of lines) { ctx.fillText(line, w / 2, y); y += 32; }
  if (quote.by) {
    ctx.font = fontFor('mono', 15, 400);
    ctx.fillStyle = `hsl(${hue},45%,38%)`;
    ctx.fillText('— ' + quote.by, w / 2, y + 14);
  }
  return c;
}

// ── book cover ───────────────────────────────────────────────────────────────
export function bookCoverCanvas(book, hue, rand, w = 128, h = 192) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = `hsl(${hue},50%,${20 + rand.int(0, 30)}%)`; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = `hsl(${(hue + 40) % 360},60%,70%)`;
  ctx.fillRect(0, 0, 8, h); // spine edge
  // little emblem
  ctx.beginPath(); ctx.arc(w / 2, h * 0.68, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = `hsl(${(hue + 40) % 360},60%,70%)`; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(w / 2, h * 0.68, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#f2ecdd'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = fontFor('serif', 15, 400);
  // wrap title
  const words = book.t.split(' ');
  const lines = []; let cur = '';
  for (const wd of words) {
    const test = cur ? cur + ' ' + wd : wd;
    if (ctx.measureText(test).width > w - 24 && cur) { lines.push(cur); cur = wd; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  let y = 34;
  for (const line of lines.slice(0, 5)) { ctx.fillText(line, w / 2 + 4, y); y += 18; }
  ctx.font = fontFor('mono', 10, 400);
  ctx.fillText(book.by, w / 2 + 4, h - 16);
  return c;
}

// ── shopfront sign ───────────────────────────────────────────────────────────
export function shopCanvas(name, theme, w = 256, h = 64) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const { hue, neon } = theme;
  ctx.fillStyle = neon ? '#100c14' : `hsl(${hue},35%,80%)`;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = fontFor(neon ? 'mono' : 'sans', 28, 800);
  let size = 28;
  while (ctx.measureText(name).width > w - 20 && size > 10) { size -= 2; ctx.font = fontFor(neon ? 'mono' : 'sans', size, 800); }
  if (neon) {
    ctx.shadowColor = `hsl(${hue},95%,65%)`; ctx.shadowBlur = 14;
    ctx.fillStyle = `hsl(${hue},95%,75%)`;
  } else {
    ctx.fillStyle = `hsl(${hue},55%,22%)`;
  }
  ctx.fillText(name, w / 2, h / 2 + 1);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = neon ? `hsl(${hue},80%,45%)` : 'rgba(0,0,0,.35)';
  ctx.lineWidth = 3; ctx.strokeRect(2, 2, w - 4, h - 4);
  return c;
}

// vertical banner sign: letters stacked down a building edge
export function verticalSignCanvas(name, hue, neon, w = 96, h = 448) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = neon ? '#0c0a12' : `hsl(${hue},30%,78%)`;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = neon ? `hsl(${hue},85%,50%)` : 'rgba(0,0,0,.4)';
  ctx.lineWidth = 4; ctx.strokeRect(3, 3, w - 6, h - 6);
  const letters = name.replace(/[^A-Za-z0-9&]/g, '').toUpperCase().slice(0, 9).split('');
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const step = (h - 40) / Math.max(letters.length, 1);
  ctx.font = fontFor('sans', Math.min(52, step * 0.8), 800);
  if (neon) {
    ctx.shadowColor = `hsl(${hue},95%,65%)`; ctx.shadowBlur = 14;
    ctx.fillStyle = `hsl(${hue},95%,78%)`;
  } else {
    ctx.fillStyle = `hsl(${hue},55%,22%)`;
  }
  letters.forEach((ch, i) => ctx.fillText(ch, w / 2, 26 + step * (i + 0.5)));
  ctx.shadowBlur = 0;
  return c;
}

// soft radial sprite (glows, mist, beams)
export function softSprite(size = 64, inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  return c;
}

// single glyph sprite (matrix rain)
export function glyphSprite(ch, color) {
  const c = makeCanvas(32, 32);
  const ctx = c.getContext('2d');
  ctx.font = `700 26px ${MONO}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 6;
  ctx.fillStyle = color;
  ctx.fillText(ch, 16, 17);
  return c;
}

// window-view: the city you're in, seen from the room, as a painted skyline
export function windowViewCanvas(spec, rand, w = 512, h = 384) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const sky = spec.sky;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, hx(sky.top)); g.addColorStop(0.55, hx(sky.mid)); g.addColorStop(1, hx(sky.hor));
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const night = spec.time.dayness < 0.35;
  // sun / moon
  const sx = w * (0.2 + rand.float() * 0.6), sy = h * (0.18 + (1 - Math.max(0, spec.time.el)) * 0.3);
  ctx.fillStyle = night ? '#e8e6da' : hx(sky.sun);
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = night ? 12 : 30;
  ctx.beginPath(); ctx.arc(sx, sy, night ? 14 : 20, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  if (night && sky.stars > 0.2) {
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 60 * sky.stars; i++) {
      ctx.globalAlpha = 0.3 + rand.float() * 0.7;
      ctx.fillRect(rand.float() * w, rand.float() * h * 0.5, 1.5, 1.5);
    }
    ctx.globalAlpha = 1;
  }
  // skyline silhouettes, two depths
  for (let layer = 0; layer < 2; layer++) {
    const baseY = h * (0.62 + layer * 0.12);
    ctx.fillStyle = layer === 0 ? 'rgba(20,18,30,.55)' : 'rgba(12,10,20,.9)';
    let x = -10;
    while (x < w) {
      const bw = 20 + rand.float() * 50;
      const bh = 30 + rand.float() * h * (0.28 - layer * 0.08);
      ctx.fillRect(x, baseY - bh, bw, bh + h);
      // lit windows
      if (night || rand.chance(0.3)) {
        ctx.fillStyle = `hsla(${45 + rand.float() * 20},90%,70%,.9)`;
        const cols = Math.floor(bw / 8), rows = Math.floor(bh / 10);
        for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) {
          if (rand.chance(spec.lights.density * 0.8)) ctx.fillRect(x + 3 + col * 8, baseY - bh + 4 + r * 10, 3, 4);
        }
        ctx.fillStyle = layer === 0 ? 'rgba(20,18,30,.55)' : 'rgba(12,10,20,.9)';
      }
      x += bw + 4 + rand.float() * 14;
    }
  }
  return c;
}
