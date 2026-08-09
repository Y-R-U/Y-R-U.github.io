/* Comic speech bubbles.
 *
 * Drawn on a 2D overlay canvas above the GL scene: outlines are noise-perturbed so nothing reads
 * as a vector rounded-rect, the tail is part of the same path (no seam), text types in per glyph,
 * and each speaker gets its own hand: Rook's bubble is hard and angular with cold ink, Vayne's
 * trembles and is lit from inside by embers.
 */

import { makeRng, fbm2, sat, clamp, ease, smoothstep } from './util.js';

const css = (c, a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

const FONT = `'Avenir Next','Trebuchet MS','Segoe UI Semibold',system-ui,-apple-system,sans-serif`;

export class Bubbles {
  constructor() {
    this.live = [];        // {beat, spk, t0, seed, layout, anchor:{x,y}, dead}
    this.fs = 20;
  }

  metrics(w, h) {
    const fs = clamp(Math.min(w, h) * 0.0335, 17.5, 30);
    return { fs, maxW: Math.min(w - fs * 3.2, fs * 16.5), pad: fs * 0.72, lh: fs * 1.30 };
  }

  layout(g, text, m) {
    g.font = `600 ${m.fs}px ${FONT}`;
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const wd of words) {
      const test = cur ? cur + ' ' + wd : wd;
      if (g.measureText(test).width > m.maxW && cur) { lines.push(cur); cur = wd; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    let wMax = 0;
    for (const l of lines) wMax = Math.max(wMax, g.measureText(l).width);
    let n = 0;
    const idx = lines.map((l) => { const s = n; n += l.length + 1; return s; });
    return { lines, idx, chars: n, w: wMax + m.pad * 2, h: lines.length * m.lh + m.pad * 1.65 };
  }

  /* beats: [{beat, age, sx, sy}] — sx/sy is the mouth in css pixels */
  render(g, W, H, now, active) {
    const m = this.metrics(W, H);
    g.save();
    g.textBaseline = 'alphabetic';
    for (const a of active) {
      const spk = a.spk;
      if (!a.layout || a.layout.fs !== m.fs) { a.layout = this.layout(g, a.beat.text, m); a.layout.fs = m.fs; }
      const L = a.layout;
      const life = a.beat.dur;
      const inK = ease.outBack(sat(a.age / 0.19));
      const outK = 1 - sat((a.age - (life - 0.22)) / 0.22);
      if (outK <= 0) continue;
      const alpha = sat(a.age / 0.10) * outK;
      const scale = 0.72 + 0.28 * inK;

      // place the box above the mouth, then keep it inside the frame
      const pad = m.fs * 0.9;
      let bx = a.sx - L.w / 2 + Math.sign(a.beat.ax || 0) * L.w * 0.22;
      let by = a.sy - L.h - m.fs * 1.5;
      bx = clamp(bx, pad, W - L.w - pad);
      by = clamp(by, pad, H - L.h - pad * 2);

      const tipX = clamp(a.sx, bx + L.w * 0.16, bx + L.w * 0.84);
      const tipY = a.sy;
      const below = tipY < by;

      g.save();
      g.translate(bx + L.w / 2, by + L.h * (below ? 0.1 : 0.9));
      g.scale(scale, scale);
      g.translate(-(bx + L.w / 2), -(by + L.h * (below ? 0.1 : 0.9)));
      g.globalAlpha = alpha;

      const tremble = spk.jitter > 0 ? Math.sin(now * 7.3 + a.seed) * 0.6 + Math.sin(now * 2.9 + a.seed * 2) * 0.5 : 0;
      const pts = outline(bx, by, L.w, L.h, spk.style, a.seed, spk.jitter * (0.7 + Math.abs(tremble) * 0.5), m.fs);
      withTail(pts, tipX, tipY, below, m.fs);

      if (spk.glow > 0) {
        const gr = g.createRadialGradient(bx + L.w / 2, by + L.h / 2, 0, bx + L.w / 2, by + L.h / 2, L.w * 0.85);
        gr.addColorStop(0, css(spk.edge, 0.28 * alpha));
        gr.addColorStop(1, css(spk.edge, 0));
        g.fillStyle = gr;
        g.fillRect(bx - L.w, by - L.h, L.w * 3, L.h * 3);
      }

      tracePath(g, pts, spk.style !== 'sharp');
      g.fillStyle = css(spk.fill, 0.93);
      g.fill();

      // inner warm bounce so the fill is not flat
      g.save(); g.clip();
      const ig = g.createLinearGradient(bx, by, bx, by + L.h);
      ig.addColorStop(0, css(spk.edge, spk.glow ? 0.20 : 0.10));
      ig.addColorStop(1, css(spk.edge, 0));
      g.fillStyle = ig; g.fillRect(bx - 10, by - 10, L.w + 20, L.h + 20);
      g.restore();

      tracePath(g, pts, spk.style !== 'sharp');
      g.lineJoin = spk.style === 'sharp' ? 'miter' : 'round';
      g.lineWidth = m.fs * (spk.style === 'sharp' ? 0.115 : 0.135);
      if (spk.glow > 0) { g.shadowColor = css(spk.edge, 0.9); g.shadowBlur = m.fs * 0.9; }
      g.strokeStyle = css(spk.edge, 0.95);
      g.stroke();
      g.shadowBlur = 0;
      // a second, offset line: the double-inked look of hand lettering
      g.lineWidth = m.fs * 0.05;
      g.strokeStyle = css(spk.edge, 0.35);
      g.save(); g.translate(m.fs * 0.06, m.fs * 0.07); g.stroke(); g.restore();

      // ── text
      const reveal = a.age * spk.cps;
      g.font = `600 ${m.fs}px ${FONT}`;
      g.textAlign = 'left';
      for (let li = 0; li < L.lines.length; li++) {
        const line = L.lines[li];
        const lw = g.measureText(line).width;
        let x = bx + L.w / 2 - lw / 2;
        const y = by + m.pad * 0.95 + m.lh * (li + 0.78);
        for (let ci = 0; ci < line.length; ci++) {
          const gi = L.idx[li] + ci;
          const k = sat(reveal - gi);
          if (k <= 0) break;
          const ch = line[ci];
          const cw = g.measureText(ch).width;
          const pop = 1 - Math.pow(1 - k, 3);
          const wob = spk.jitter > 0 ? Math.sin(now * 5.1 + gi * 1.7) * m.fs * 0.045 : 0;
          g.save();
          g.translate(x + cw / 2, y + wob + (1 - pop) * m.fs * 0.35);
          g.scale(0.86 + 0.14 * pop, 0.86 + 0.14 * pop);
          g.globalAlpha = alpha * (0.25 + 0.75 * pop);
          if (spk.glow > 0) { g.shadowColor = css(spk.edge, 0.8); g.shadowBlur = m.fs * 0.5; }
          g.fillStyle = css(spk.ink, 1);
          g.fillText(ch, -cw / 2, 0);
          g.restore();
          x += cw;
        }
      }
      g.restore();
    }
    g.restore();
  }
}

/* ── path construction ────────────────────────────────────────────────────── */

function outline(x, y, w, h, style, seed, jitter, fs) {
  const r = style === 'sharp' ? fs * 0.28 : fs * 0.85;
  const pts = [];
  const seg = style === 'sharp' ? 5 : 8;
  const corner = (cx, cy, a0, a1) => {
    const n = style === 'sharp' ? 2 : 5;
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  const edge = (x0, y0, x1, y1) => {
    for (let i = 1; i < seg; i++) pts.push([x0 + (x1 - x0) * (i / seg), y0 + (y1 - y0) * (i / seg)]);
  };
  corner(x + r, y + r, Math.PI, Math.PI * 1.5);
  edge(x + r, y, x + w - r, y);
  corner(x + w - r, y + r, Math.PI * 1.5, Math.PI * 2);
  edge(x + w, y + r, x + w, y + h - r);
  corner(x + w - r, y + h - r, 0, Math.PI * 0.5);
  edge(x + w - r, y + h, x + r, y + h);
  corner(x + r, y + h - r, Math.PI * 0.5, Math.PI);
  edge(x, y + h - r, x, y + r);

  const cx = x + w / 2, cy = y + h / 2;
  const amp = jitter + (style === 'sharp' ? fs * 0.028 : fs * 0.045);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const nx = p[0] - cx, ny = p[1] - cy;
    const d = Math.hypot(nx, ny) || 1;
    const n = fbm2(i * 0.33 + seed, seed * 1.7, 3) - 0.5;
    p[0] += (nx / d) * n * amp * 2;
    p[1] += (ny / d) * n * amp * 2;
  }
  return pts;
}

function withTail(pts, tipX, tipY, below, fs) {
  // find the outline point closest to the tip and splice a wedge out to it
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i][0] - tipX, dy = pts[i][1] - tipY;
    const d = dx * dx + dy * dy * 0.35;
    if (d < bd) { bd = d; best = i; }
  }
  const span = 2;
  const a = pts[(best - span + pts.length) % pts.length];
  const b = pts[(best + span) % pts.length];
  const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const kink = [mid[0] + (tipX - mid[0]) * 0.55 + fs * 0.35, mid[1] + (tipY - mid[1]) * 0.55];
  const ins = [kink, [tipX, tipY]];
  if (best - span < 0 || best + span >= pts.length) {
    pts.push(...ins);
  } else {
    pts.splice(best - span + 1, span * 2 - 1, ...ins);
  }
  return pts;
}

function tracePath(g, pts, smooth) {
  g.beginPath();
  if (!smooth) {
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    return;
  }
  const n = pts.length;
  const mid = (i, j) => [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2];
  let m0 = mid(n - 1, 0);
  g.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) {
    const m1 = mid(i, (i + 1) % n);
    g.quadraticCurveTo(pts[i][0], pts[i][1], m1[0], m1[1]);
  }
  g.closePath();
}
