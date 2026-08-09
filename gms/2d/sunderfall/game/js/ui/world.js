/* SUNDERFALL UI — things anchored to world positions: damage numbers and speech bubbles.
 *
 * Both are pooled. Damage numbers allocate nothing after boot: the pool is flat typed arrays and
 * the digit strings come out of theme.numStr's cache.
 *
 * Speech bubbles reuse the data shape from `story/script.js` (SPEAKER + BEATS), so a story beat can
 * be handed straight to `say()`: {who, text, dur, anchor|x|y}. Speaker style drives the bubble:
 * 'sharp' is Rook — hard angular panel, cold ink, clipped typing; 'shaky' is Vayne — a trembling
 * outline on parchment, lit from inside.
 */

import { C, A, txt, measure, numStr, clamp01, easeOutCubic, easeOutBack, FONT_UI, FONT_D } from './theme.js';

const TAU = Math.PI * 2;

/* ---- damage numbers ---------------------------------------------------- */

export const DMG = { NORMAL: 0, CRIT: 1, HEAL: 2, FOCUS: 3, PLAYER: 4, BREAK: 5 };
const DMG_COL = ['#ffd9a8', C.gold, '#7de08a', C.arc, C.blood, C.brassL];
const DMG_SIZE = [17, 27, 17, 15, 22, 15];

const CAP = 192;
const dn = {
  n: 0,
  x: new Float32Array(CAP), y: new Float32Array(CAP),
  vx: new Float32Array(CAP), vy: new Float32Array(CAP),
  l: new Float32Array(CAP), lm: new Float32Array(CAP),
  v: new Float32Array(CAP), k: new Uint8Array(CAP),
  s: new Float32Array(CAP), seed: new Float32Array(CAP),
};

export function pushDamage(x, y, value, kind) {
  const i = dn.n < CAP ? dn.n++ : (Math.random() * CAP) | 0;   // pool full: recycle, never grow
  const k = kind | 0;
  dn.x[i] = x; dn.y[i] = y;
  dn.vx[i] = (Math.random() - 0.5) * 90;
  dn.vy[i] = k === DMG.PLAYER ? 30 : -190 - Math.random() * 70;
  dn.l[i] = dn.lm[i] = k === DMG.CRIT ? 1.15 : 0.85;
  dn.v[i] = value; dn.k[i] = k;
  dn.s[i] = k === DMG.CRIT ? 1.25 : 1;
  dn.seed[i] = Math.random() * 10;
}

export function updateDamage(dt) {
  for (let i = dn.n - 1; i >= 0; i--) {
    dn.l[i] -= dt;
    if (dn.l[i] <= 0) {
      const j = --dn.n;
      dn.x[i] = dn.x[j]; dn.y[i] = dn.y[j]; dn.vx[i] = dn.vx[j]; dn.vy[i] = dn.vy[j];
      dn.l[i] = dn.l[j]; dn.lm[i] = dn.lm[j]; dn.v[i] = dn.v[j]; dn.k[i] = dn.k[j];
      dn.s[i] = dn.s[j]; dn.seed[i] = dn.seed[j];
      continue;
    }
    dn.x[i] += dn.vx[i] * dt;
    dn.y[i] += dn.vy[i] * dt;
    dn.vy[i] += 520 * dt;
    dn.vx[i] *= 1 - 1.6 * dt;
  }
}

export function clearDamage() { dn.n = 0; }
export function damageCount() { return dn.n; }

const _pt = { x: 0, y: 0 };
export function drawDamage(c, toScreen, scale, now) {
  for (let i = 0; i < dn.n; i++) {
    const k = dn.l[i] / dn.lm[i];
    const kind = dn.k[i];
    toScreen(dn.x[i], dn.y[i], _pt);
    const pop = dn.lm[i] - dn.l[i] < 0.12 ? easeOutBack(clamp01((dn.lm[i] - dn.l[i]) / 0.12)) : 1;
    const size = DMG_SIZE[kind] * dn.s[i] * scale * pop;
    const a = k > 0.6 ? 1 : k / 0.6;
    const col = DMG_COL[kind];
    const s = numStr(dn.v[i]);
    c.save();
    c.translate(_pt.x, _pt.y);
    if (kind === DMG.CRIT) c.rotate(Math.sin(now * 9 + dn.seed[i]) * 0.05 - 0.06);
    c.globalAlpha = a;
    c.lineJoin = 'round';
    c.font = (kind === DMG.CRIT ? '800 ' : '700 ') + size.toFixed(1) + 'px ' + (kind === DMG.CRIT ? FONT_D : FONT_UI);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = Math.max(2.5, size * 0.22);
    c.strokeStyle = A(C.void, 0.9);
    c.strokeText(s, 0, 0);
    c.fillStyle = col;
    c.fillText(s, 0, 0);
    if (kind === DMG.CRIT) {
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = a * 0.5 * (1 - k);
      c.fillText(s, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.globalAlpha = a;
      const half = c.measureText(s).width * 0.5;      // measured before the font changes
      c.font = '800 ' + (size * 0.55).toFixed(1) + 'px ' + FONT_UI;
      c.textAlign = 'left';
      c.strokeText('!', half + size * 0.1, -size * 0.14);
      c.fillText('!', half + size * 0.1, -size * 0.14);
    }
    c.restore();
  }
  c.globalAlpha = 1;
}

/* ---- speech bubbles ----------------------------------------------------- */

const rgbCache = new Map();
function rgb(arr, fallback) {
  if (!arr) return fallback;
  const k = arr[0] + ',' + arr[1] + ',' + arr[2];
  let v = rgbCache.get(k);
  if (!v) {
    v = 'rgb(' + Math.round(arr[0] * 255) + ',' + Math.round(arr[1] * 255) + ',' + Math.round(arr[2] * 255) + ')';
    rgbCache.set(k, v);
  }
  return v;
}

const DEFAULT_SPEAKER = {
  name: '', style: 'sharp', cps: 30, jitter: 0, glow: 0,
  ink: [0.92, 0.90, 0.98], fill: [0.06, 0.06, 0.10], edge: [0.62, 0.66, 0.84],
};

export function createBubbles(speakers) {
  const live = [];
  const MAXW = 250;

  function wrap(c, text, size, maxw) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (let i = 0; i < words.length; i++) {
      const t = cur ? cur + ' ' + words[i] : words[i];
      if (measure(c, t, size, WRAP_OPT) > maxw && cur) { lines.push(cur); cur = words[i]; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  return {
    live,
    /**
     * say({who, text, dur, x, y, anchor}) — x/y are WORLD coordinates. `anchor` may be a function
     * returning {x,y} in world space, which is re-read every frame so a bubble tracks a moving actor.
     */
    say(b) {
      const sp = (speakers && speakers[b.who]) || DEFAULT_SPEAKER;
      const o = {
        who: b.who, text: b.text || '', sp,
        dur: b.dur != null ? b.dur : Math.max(1.4, (b.text || '').length / (sp.cps || 26) + 1.1),
        t: 0, x: b.x || 0, y: b.y || 0, anchor: b.anchor || null,
        ax: b.ax || 0, ay: b.ay != null ? b.ay : -120,
        lines: null, w: 0, h: 0, seed: Math.random() * 100,
        size: b.size || 15,
      };
      if (live.length >= 3) live.shift();
      live.push(o);
      return o;
    },
    clear() { live.length = 0; },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        live[i].t += dt;
        if (live[i].t > live[i].dur + 0.45) live.splice(i, 1);
      }
    },
    draw(c, toScreen, L, now) {
      for (let i = 0; i < live.length; i++) {
        const b = live[i];
        if (!b.lines) {
          b.lines = wrap(c, b.text, b.size, MAXW);
          b.w = 0;
          for (const ln of b.lines) b.w = Math.max(b.w, measure(c, ln, b.size, WRAP_OPT));
          b.w += 26;
          b.h = b.lines.length * (b.size * 1.32) + 20;
        }
        const src = b.anchor ? b.anchor() : b;
        toScreen(src.x, src.y, _pt);
        const tipX = _pt.x, tipY = _pt.y;
        let bx = tipX + b.ax, by = tipY + b.ay;

        // keep it on screen; the tail stretches instead of the bubble leaving the frame
        const cl = L.bubbleClamp;
        bx = Math.min(Math.max(bx, cl.x + b.w * 0.5), cl.x + cl.w - b.w * 0.5);
        by = Math.min(Math.max(by, cl.y + b.h * 0.5), cl.y + cl.h - b.h * 0.5);

        const inK = clamp01(b.t / 0.22);
        const outK = clamp01((b.dur + 0.45 - b.t) / 0.4);
        const s = easeOutBack(inK) * (0.75 + 0.25 * outK);
        const alpha = clamp01(inK * 2) * outK;
        const shake = b.sp.jitter || 0;

        c.save();
        c.globalAlpha = alpha;
        c.translate(bx, by);
        c.scale(s, s);

        const w2 = b.w * 0.5, h2 = b.h * 0.5;
        const fill = rgb(b.sp.fill, '#0a0a12');
        const edge = rgb(b.sp.edge, C.brass);
        const ink = rgb(b.sp.ink, C.ink);
        const sharp = b.sp.style === 'sharp';

        // tail first, so the body's stroke covers its join
        const tx = (tipX - bx) / s, ty = (tipY - by) / s;
        const tl = Math.hypot(tx, ty) || 1;
        const nxp = -ty / tl, nyp = tx / tl;
        c.beginPath();
        c.moveTo(nxp * 11, nyp * 11 + h2 * 0.2);
        c.lineTo(tx * 0.94, ty * 0.94);
        c.lineTo(-nxp * 11, -nyp * 11 + h2 * 0.2);
        c.closePath();
        c.fillStyle = fill; c.fill();
        c.lineWidth = 2.4; c.strokeStyle = edge; c.stroke();

        // body
        c.beginPath();
        if (sharp) {
          const cut = 9;
          c.moveTo(-w2 + cut, -h2); c.lineTo(w2, -h2); c.lineTo(w2, h2 - cut);
          c.lineTo(w2 - cut, h2); c.lineTo(-w2, h2); c.lineTo(-w2, -h2 + cut);
          c.closePath();
        } else {
          const seg = 28;
          for (let k = 0; k <= seg; k++) {
            const a = (k / seg) * TAU;
            const rx = w2 * (1 + Math.sin(a * 3 + b.seed) * 0.012);
            const ry = h2 * (1 + Math.cos(a * 4 + b.seed) * 0.02);
            const j = shake ? Math.sin(now * 13 + k * 1.7 + b.seed) * shake : 0;
            const px = Math.cos(a) * (rx + j), py = Math.sin(a) * (ry + j);
            if (k === 0) c.moveTo(px, py); else c.lineTo(px, py);
          }
          c.closePath();
        }
        c.fillStyle = fill; c.fill();
        if (b.sp.glow) {
          c.save();
          c.globalCompositeOperation = 'lighter';
          c.globalAlpha = alpha * 0.22 * b.sp.glow;
          c.fillStyle = edge; c.fill();
          c.restore();
        }
        c.lineWidth = 3.2; c.strokeStyle = A(C.void, 0.75); c.stroke();
        c.lineWidth = 1.8; c.strokeStyle = edge; c.stroke();

        // name tag
        if (b.sp.name) {
          txt(c, b.sp.name, -w2 + 12, -h2 - 6, 9, edge,
            { weight: 700, track: 2.2, caps: true, shadow: 1 });
        }

        // typed text
        const cps = b.sp.cps || 30;
        let budget = Math.floor(b.t * cps);
        const lh = b.size * 1.32;
        let ly = -h2 + 12 + lh * 0.5;
        for (let k = 0; k < b.lines.length; k++) {
          const ln = b.lines[k];
          if (budget <= 0) break;
          const shown = budget >= ln.length ? ln : ln.slice(0, budget);
          budget -= ln.length;
          txt(c, shown, -w2 + 13, ly, b.size, ink,
            { base: 'middle', weight: sharp ? 650 : 600, family: sharp ? FONT_UI : FONT_D });
          ly += lh;
        }
        c.restore();
      }
      c.globalAlpha = 1;
    },
  };
}

const WRAP_OPT = { weight: 620 };
