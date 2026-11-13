// Results → a 1080×1350 image card: native share where the browser can share files, else a download.
import { CONFIG } from '../config.js';

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');

export function drawCard({ title, sub, mode, rows, me, stats }) {
  const W = 1080, H = 1350, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#2c3c86'); bg.addColorStop(1, '#10173a');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.textAlign = 'center';
  const font = (w, px) => `${w} ${px}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`;
  const stroke = (t, x, y, fill, px, w = 900) => { g.font = font(w, px); g.lineWidth = px * 0.12; g.strokeStyle = '#10173a'; g.lineJoin = 'round'; g.strokeText(t, x, y); g.fillStyle = fill; g.fillText(t, x, y); };
  stroke('THRONG', W / 2, 170, '#ffd23a', 140);
  if (mode !== 'classic') { g.font = font(800, 40); g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(CONFIG.MODES[mode].name.toUpperCase(), W / 2, 245); }
  stroke(title, W / 2, 360, '#fff', title.length > 14 ? 84 : 110);
  g.font = font(800, 44); g.fillStyle = 'rgba(255,255,255,.85)'; g.fillText(sub, W / 2, 430);
  let y = 520;
  rows.slice(0, 8).forEach((r, i) => {
    const mine = r.index === me;
    g.fillStyle = mine ? hex(r.color) : 'rgba(255,255,255,.08)';
    g.beginPath(); g.roundRect(110, y, W - 220, 74, 22); g.fill();
    g.textAlign = 'left'; g.font = font(900, 40); g.fillStyle = '#fff';
    g.fillText(String(i + 1), 140, y + 51);
    g.fillStyle = mine ? '#fff' : hex(r.color); g.beginPath(); g.arc(215, y + 37, 15, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.font = font(800, 38); g.fillText(r.name.slice(0, 16), 250, y + 50);
    g.textAlign = 'right'; g.font = font(900, 40); g.fillText(String(r.value), W - 140, y + 51);
    g.textAlign = 'center';
    y += 86;
  });
  g.font = font(800, 38); g.fillStyle = '#ffd23a';
  g.fillText(stats, W / 2, H - 120);
  g.font = font(700, 32); g.fillStyle = 'rgba(255,255,255,.6)';
  g.fillText('games.br8t.com · THRONG', W / 2, H - 60);
  return cv;
}

export async function shareCard(opts) {
  const cv = drawCard(opts);
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  if (!blob) return 'failed';
  const file = new File([blob], 'throng-result.png', { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'THRONG', text: `${opts.title} in THRONG` });
      return 'shared';
    }
  } catch (e) { if (e && e.name === 'AbortError') return 'cancelled'; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'throng-result.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}
