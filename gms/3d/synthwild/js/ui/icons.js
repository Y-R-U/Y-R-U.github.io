// Item icons drawn procedurally to small canvases, cached as data URLs.
// Blocks: an isometric cube from the block's tile colours. Other items: a glyph by kind.
let TILES = null, BLOCKS = null;
import('../data/blocks.js').then((m) => { TILES = m.TILES; BLOCKS = m.BLOCKS; cache.clear(); }).catch(() => {});

const SZ = 64;
const cache = new Map();
const rgb = (c, k = 1) => `rgb(${(c[0] * 255 * k) | 0},${(c[1] * 255 * k) | 0},${(c[2] * 255 * k) | 0})`;
const hex2 = (h) => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const shade = (c, k) => c.map((v) => Math.max(0, Math.min(1, v * k)));

function face(g, pts, fill, accent, pattern, seed) {
  g.save();
  g.beginPath(); g.moveTo(...pts[0]); for (const p of pts.slice(1)) g.lineTo(...p); g.closePath();
  g.fillStyle = fill; g.fill();
  g.clip();
  if (accent) {
    g.strokeStyle = accent; g.fillStyle = accent; g.lineWidth = 1.6; g.globalAlpha = 0.55;
    const [a, b, , d] = pts;
    const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    let s = seed;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    if (pattern === 'lattice' || pattern === 'hex' || pattern === 'grid') {
      for (let t = 0.25; t < 1; t += 0.25) {
        g.beginPath(); g.moveTo(...lerp(a, b, t)); g.lineTo(...lerp(d, [d[0] + b[0] - a[0], d[1] + b[1] - a[1]], t)); g.stroke();
        g.beginPath(); g.moveTo(...lerp(a, d, t)); g.lineTo(...lerp(b, [b[0] + d[0] - a[0], b[1] + d[1] - a[1]], t)); g.stroke();
      }
    } else if (pattern === 'veins' || pattern === 'circuit' || pattern === 'vine') {
      for (let i = 0; i < 3; i++) {
        const u = r(), v = r();
        const p = [a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v];
        g.beginPath(); g.moveTo(...p); g.lineTo(p[0] + (r() - 0.5) * 22, p[1] + (r() - 0.5) * 14); g.stroke();
      }
    } else {
      for (let i = 0; i < 14; i++) {
        const u = r(), v = r();
        const p = [a[0] + (b[0] - a[0]) * u + (d[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (d[1] - a[1]) * v];
        g.fillRect(p[0], p[1], 2.5, 2.5);
      }
    }
  }
  g.restore();
}

function cube(g, item) {
  const b = BLOCKS?.[item.block];
  const tt = b && TILES ? TILES[b.tile.top] : null, ts = b && TILES ? TILES[b.tile.side] : null;
  const top = tt ? hex2(tt.base) : shade(item.color, 1.15);
  const side = ts ? hex2(ts.base) : item.color;
  const accTop = tt ? rgb(hex2(tt.accent)) : rgb(shade(item.color, 1.4));
  const accSide = ts ? rgb(hex2(ts.accent)) : rgb(shade(item.color, 0.7));
  const lip = ts?.lip?.color ? hex2(ts.lip.color) : null;
  const cx = 32, s = 22, hh = s * 0.58;
  const T = [cx, 32 - hh - s * 0.5], L = [cx - s, 32 - s * 0.5], R = [cx + s, 32 - s * 0.5], C = [cx, 32 - s * 0.5 + hh];
  const BL = [L[0], L[1] + s], BR = [R[0], R[1] + s], BC = [C[0], C[1] + s];
  face(g, [T, R, C, L], rgb(top, 1.05), accTop, tt?.pattern, 7 + item.id);
  face(g, [L, C, BC, BL], rgb(side, 0.82), accSide, ts?.pattern, 11 + item.id);
  face(g, [C, R, BR, BC], rgb(side, 0.62), accSide, ts?.pattern, 13 + item.id);
  if (lip) {
    g.fillStyle = rgb(lip, 0.85);
    g.beginPath(); g.moveTo(...L); g.lineTo(...C); g.lineTo(C[0], C[1] + 5); g.lineTo(L[0], L[1] + 5); g.fill();
    g.fillStyle = rgb(lip, 0.65);
    g.beginPath(); g.moveTo(...C); g.lineTo(...R); g.lineTo(R[0], R[1] + 5); g.lineTo(C[0], C[1] + 5); g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(...T); g.lineTo(...R); g.lineTo(...BR); g.lineTo(...BC); g.lineTo(...BL); g.lineTo(...L); g.closePath(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.beginPath(); g.moveTo(...L); g.lineTo(...C); g.lineTo(...R); g.moveTo(...C); g.lineTo(...BC); g.stroke();
  const glow = item.glow || b?.emissive || 0;
  if (glow > 0.3) { g.globalCompositeOperation = 'lighter'; g.fillStyle = `rgba(120,255,230,${0.18 * glow})`; g.fillRect(0, 0, SZ, SZ); g.globalCompositeOperation = 'source-over'; }
}

function glyph(g, item) {
  const c = item.color || [0.7, 0.7, 0.7];
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (item.kind === 'food') {
    const gr = g.createRadialGradient(26, 26, 3, 32, 34, 20);
    gr.addColorStop(0, rgb(shade(c, 1.4))); gr.addColorStop(1, rgb(c, 0.75));
    g.fillStyle = gr; g.beginPath(); g.ellipse(32, 35, 17, 15, 0, 0, 7); g.fill();
    g.strokeStyle = '#3f8a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 21); g.quadraticCurveTo(36, 13, 42, 13); g.stroke();
  } else if (item.kind === 'tool') {
    const ty = item.tool.type;
    g.strokeStyle = '#5a4630'; g.lineWidth = 5; g.beginPath(); g.moveTo(18, 48); g.lineTo(40, 26); g.stroke();
    g.strokeStyle = '#8fefff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(20, 44); g.lineTo(36, 28); g.stroke();
    g.fillStyle = rgb(c); g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.2;
    g.beginPath();
    if (ty === 'cutter') { g.moveTo(26, 16); g.quadraticCurveTo(44, 14, 52, 30); g.lineTo(46, 30); g.quadraticCurveTo(40, 22, 30, 22); }
    else if (ty === 'saw') { g.moveTo(36, 16); g.lineTo(52, 22); g.lineTo(48, 36); g.lineTo(36, 30); }
    else if (ty === 'scoop') { g.ellipse(46, 20, 9, 12, 0.8, 0, 7); }
    else { g.moveTo(36, 30); g.lineTo(54, 8); g.lineTo(56, 10); g.lineTo(40, 34); }
    g.closePath(); g.fill(); g.stroke();
    if (item.tool.tier === 'qubit') { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(80,240,255,.25)'; g.fill(); g.globalCompositeOperation = 'source-over'; }
  } else {
    const gr = g.createLinearGradient(16, 14, 48, 50);
    gr.addColorStop(0, rgb(shade(c, 1.5))); gr.addColorStop(1, rgb(c, 0.7));
    g.fillStyle = gr; g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.2;
    g.beginPath();
    if (/rod|wire/.test(item.key)) { g.moveTo(18, 44); g.lineTo(42, 16); g.lineTo(47, 21); g.lineTo(23, 49); }
    else if (/ingot/.test(item.key)) { g.moveTo(14, 40); g.lineTo(26, 28); g.lineTo(50, 28); g.lineTo(50, 36); g.lineTo(38, 48); g.lineTo(14, 48); }
    else { g.moveTo(32, 12); g.lineTo(48, 26); g.lineTo(42, 50); g.lineTo(22, 50); g.lineTo(16, 26); }
    g.closePath(); g.fill(); g.stroke();
    if (item.glow) { g.shadowColor = rgb(c); g.shadowBlur = 10; g.fill(); }
  }
}

export function iconURL(item) {
  if (!item) return '';
  const key = item.id;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas');
  cv.width = cv.height = SZ;
  const g = cv.getContext('2d');
  try { if (item.kind === 'block' || item.block) cube(g, item); else glyph(g, item); } catch (e) { console.warn('[icon]', e); }
  const url = cv.toDataURL();
  cache.set(key, url);
  return url;
}

const FR = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
// 18.25 -> "18¼"; odd 64ths fall back to one decimal.
export function fmtCount(v) {
  const n = v.count, f = Math.round((v.frac || 0) * 64) / 64;
  if (!f) return n >= 10000 ? Math.floor(n / 1000) + 'k' : String(n);
  if (FR[f]) return (n || '') + FR[f];
  return (n + f).toFixed(1);
}
