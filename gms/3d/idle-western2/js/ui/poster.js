import { el } from './dom.js?v=20261004c';
import { fmtCash, fmtNum } from '../state/format.js?v=20261004c';

// W16 Wanted Poster postcard: your hat, moustache, bounty and joke stats, drawn on a 2D canvas and saved as a PNG.
const W = 1200, H = 1650;
const INK = '#2b1a10', PAPER = '#efdcb4';

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function paper(g, r) {
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(110, 70, 30, ${0.02 + r() * 0.05})`;
    g.beginPath();
    g.arc(r() * W, r() * H, 2 + r() * 26, 0, Math.PI * 2);
    g.fill();
  }
  const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
  v.addColorStop(0, 'rgba(120,70,20,0)');
  v.addColorStop(1, 'rgba(90,45,10,0.45)');
  g.fillStyle = v;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#7a5530';
  for (const [x, y] of [[60, 60], [W - 60, 60], [60, H - 60], [W - 60, H - 60]]) { g.beginPath(); g.arc(x, y, 14, 0, 7); g.fill(); }
}

function face(g, cx, cy, { hatScale = 1, moustache = 'handlebar', specs = 'none' }) {
  g.save();
  g.lineWidth = 10;
  g.strokeStyle = INK;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  g.fillStyle = '#e8c49a';
  g.beginPath(); g.ellipse(cx, cy, 175, 205, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#d9a477';
  g.beginPath(); g.ellipse(cx, cy + 25, 58, 70, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = INK;
  for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 72, cy - 45, 13, 0, 7); g.fill(); g.beginPath(); g.moveTo(cx + s * 40, cy - 92); g.lineTo(cx + s * 108, cy - 80 + (s > 0 ? -6 : 6)); g.stroke(); }
  if (specs && specs !== 'none') {
    g.lineWidth = 7;
    if (specs.includes('monocle')) { g.beginPath(); g.arc(cx + 72, cy - 45, 34, 0, 7); g.stroke(); g.beginPath(); g.moveTo(cx + 104, cy - 35); g.quadraticCurveTo(cx + 140, cy + 60, cx + 120, cy + 140); g.stroke(); }
    else if (specs.includes('eyepatch')) { g.beginPath(); g.ellipse(cx - 72, cy - 45, 40, 32, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(cx - 170, cy - 110); g.lineTo(cx + 160, cy - 30); g.stroke(); }
    else { for (const s of [-1, 1]) { g.beginPath(); g.arc(cx + s * 72, cy - 45, 36, 0, 7); g.stroke(); } g.beginPath(); g.moveTo(cx - 36, cy - 45); g.lineTo(cx + 36, cy - 45); g.stroke(); }
    g.lineWidth = 10;
  }
  g.fillStyle = '#4a2a14';
  g.beginPath();
  const my = cy + 95;
  if (moustache === 'walrus') { g.ellipse(cx, my + 10, 120, 45, 0, 0, Math.PI * 2); }
  else if (moustache === 'pencil') { g.rect(cx - 70, my, 140, 12); }
  else if (moustache === 'horseshoe') { g.rect(cx - 95, my - 5, 190, 26); g.rect(cx - 95, my, 26, 110); g.rect(cx + 69, my, 26, 110); }
  else if (moustache === 'mutton chops') { g.ellipse(cx - 150, cy + 50, 40, 100, 0.2, 0, 7); g.ellipse(cx + 150, cy + 50, 40, 100, -0.2, 0, 7); g.rect(cx - 80, my, 160, 20); }
  else if (moustache === 'imperial') { g.moveTo(cx, my); g.quadraticCurveTo(cx - 140, my - 10, cx - 170, my - 90); g.quadraticCurveTo(cx - 100, my + 30, cx, my + 30); g.quadraticCurveTo(cx + 100, my + 30, cx + 170, my - 90); g.quadraticCurveTo(cx + 140, my - 10, cx, my); }
  else if (moustache === 'painted-on') { g.fillStyle = '#111'; g.moveTo(cx - 90, my + 18); g.quadraticCurveTo(cx, my - 20, cx + 90, my + 18); g.lineTo(cx + 80, my + 26); g.quadraticCurveTo(cx, my, cx - 80, my + 26); }
  else { g.moveTo(cx, my); g.quadraticCurveTo(cx - 120, my - 30, cx - 150, my + 30); g.quadraticCurveTo(cx - 90, my + 40, cx, my + 25); g.quadraticCurveTo(cx + 90, my + 40, cx + 150, my + 30); g.quadraticCurveTo(cx + 120, my - 30, cx, my); }
  g.fill();
  const s = Math.max(0.7, Math.min(2.6, hatScale));
  const brimW = 210 * s, crownW = 125 * Math.min(1.7, s), crownH = 120 * Math.min(2, 0.7 + s * 0.45), by = cy - 170;
  g.fillStyle = '#6b4224';
  g.beginPath();
  g.moveTo(cx - crownW, by);
  g.quadraticCurveTo(cx - crownW * 1.05, by - crownH, cx - crownW * 0.3, by - crownH * 1.05);
  g.quadraticCurveTo(cx, by - crownH * 0.8, cx + crownW * 0.3, by - crownH * 1.05);
  g.quadraticCurveTo(cx + crownW * 1.05, by - crownH, cx + crownW, by);
  g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#8a5a30';
  g.beginPath(); g.ellipse(cx, by + 6, brimW, 34 + 8 * s, 0, 0, Math.PI * 2); g.fill(); g.stroke();
  g.fillStyle = '#b5483a';
  g.fillRect(cx - crownW * 0.98, by - 34, crownW * 1.96, 26);
  g.restore();
}

function center(g, text, y, font, color = INK, maxW = W - 160) {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = 'center';
  let t = text;
  while (g.measureText(t).width > maxW && t.length > 4) t = t.slice(0, -2) + '…';
  g.fillText(t, W / 2, y);
}

export async function composePoster({ name, hatName, hatScale, disguise, bounty, allTime, stats, gen }) {
  try { await Promise.all([document.fonts.load('120px Rye'), document.fonts.load('700 40px Bitter')]); } catch {}
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  paper(g, rng(Math.floor(allTime % 1e9) + gen * 77));
  g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(70, 70, W - 140, H - 140);
  g.lineWidth = 2; g.strokeRect(86, 86, W - 172, H - 172);
  center(g, 'WANTED', 290, '200px Rye');
  center(g, 'DEAD OR ALIVE · PREFERABLY CONFUSED', 360, '700 38px Bitter', '#6b4a33');
  g.save();
  g.fillStyle = 'rgba(255,248,230,0.5)';
  g.fillRect(250, 410, 700, 640);
  g.strokeStyle = INK; g.lineWidth = 6; g.strokeRect(250, 410, 700, 640);
  g.beginPath(); g.rect(256, 416, 688, 628); g.clip();
  face(g, W / 2, 800, { hatScale, moustache: disguise?.moustache, specs: disguise?.specs });
  g.restore();
  center(g, (name || 'The Stranger').toUpperCase(), 1150, '96px Rye');
  center(g, `Last seen in a ${hatName || 'hat'}`, 1205, 'italic 600 36px Bitter', '#6b4a33');
  center(g, 'REWARD', 1300, '60px Rye', '#7a2a1f');
  center(g, bounty > 0 ? `💀 ${fmtNum(bounty)} BOUNTY · ${fmtCash(allTime)}` : fmtCash(allTime), 1375, '800 60px Bitter', '#7a2a1f');
  g.font = '700 34px Bitter';
  g.fillStyle = INK;
  const st = [`Ejected: ${fmtNum(stats.ejects || 0)}`, `Duels won: ${fmtNum(Math.max(0, (stats.duels || 0) - (stats.duelBoot || 0)))}`, 'Baths taken: 0'];
  center(g, st.join('  ·  '), 1460, '700 34px Bitter');
  center(g, `Shot own boot: ${fmtNum(stats.duelBoot || 0)}  ·  Pianos played: ${fmtNum(stats.pianoTaps || 0)}`, 1510, '700 30px Bitter', '#6b4a33');
  center(g, `Dribble Creek · Identity No. ${gen} · Idle Western 2`, 1570, 'italic 600 26px Bitter', '#7a5530');
  return c;
}

export async function savePoster(canvas, name, toast) {
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) return false;
  const file = typeof File === 'function' ? new File([blob], name, { type: 'image/png' }) : null;
  if (file && navigator.canShare?.({ files: [file] }) && matchMedia('(pointer:coarse)').matches) {
    try { await navigator.share({ files: [file], title: 'WANTED' }); return true; } catch (e) { if (e?.name === 'AbortError') return false; }
  }
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  toast?.('🖼️ Poster saved');
  return true;
}
