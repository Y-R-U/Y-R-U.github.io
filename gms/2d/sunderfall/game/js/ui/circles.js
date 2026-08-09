/* SUNDERFALL UI — the five cast circles.
 *
 * The one piece of HUD the player actually looks at, so it gets the most work:
 *
 *   locked   an etched empty socket with the level it opens at — coming, not absent
 *   empty    a socket with an assign rune
 *   cooling  a dark sweep over the disc AND a school-coloured arc filling the ring
 *   starved  the disc fills with cyan like a glass filling with focus; cost goes red
 *   ready    school-coloured ring, a slow breathing halo, and a one-shot flare the instant
 *            it comes off cooldown — readiness has to be felt, not read
 *   cast     the disc is struck (overshoot punch), a ring throws off, sparks fly
 *
 * Slot 1 is heavier-framed, larger, and shows its press. Slots 2–5 carry a second outer ring,
 * which is the "this one runs itself" tell.
 */

import {
  C, A, mix, schoolOf, gradR, rr, diamond, txt, numStr, FONT_D,
  clamp01, easeOut, easeOutCubic, punch,
} from './theme.js';
import { FALLBACK_ICONS, genericIcon } from './icons.js';

const TAU = Math.PI * 2;

/* ---- icon bitmap cache ------------------------------------------------ *
 * `icon(c2d, size)` is called once per (spell, size, dpr) into a padded offscreen canvas, then the
 * alpha bounding box is measured so the result can be re-centred. That makes us immune to whether
 * the spell author drew into (0,0)-(size,size) or around the origin.
 */

const iconCache = new Map();

function buildIcon(spell, size, dpr) {
  const pad = Math.ceil(size * 0.75);
  const side = Math.ceil((size + pad * 2) * dpr);
  const cv = document.createElement('canvas');
  cv.width = cv.height = side;
  const c = cv.getContext('2d');
  c.scale(dpr, dpr);
  c.translate(pad, pad);
  const fn = (spell && typeof spell.icon === 'function' && spell.icon)
    || FALLBACK_ICONS[spell && spell.id] || genericIcon;
  try { fn(c, size); } catch (e) { console.warn('[ui] spell icon threw for', spell && spell.id, e); }

  let bx = 0, by = 0, bw = side, bh = side;
  try {
    const d = c.getImageData(0, 0, side, side).data;
    let x0 = side, y0 = side, x1 = -1, y1 = -1;
    for (let y = 0; y < side; y++) {
      const row = y * side * 4;
      for (let x = 0; x < side; x++) {
        if (d[row + x * 4 + 3] > 8) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    if (x1 >= x0) { bx = x0; by = y0; bw = x1 - x0 + 1; bh = y1 - y0 + 1; }
  } catch { /* tainted canvas is impossible here, but never let it kill the HUD */ }

  return { cv, bx, by, bw, bh };
}

export function getIcon(spell, size, dpr) {
  const key = (spell && spell.id ? spell.id : '?') + '@' + (size | 0) + 'x' + dpr;
  let ic = iconCache.get(key);
  if (!ic) { ic = buildIcon(spell, size, dpr); iconCache.set(key, ic); }
  return ic;
}

export function clearIconCache() { iconCache.clear(); }

/** Blit a cached icon centred on (x,y), fitted to `size`. */
function drawIcon(c, ic, x, y, size, alpha) {
  if (!ic || ic.bw <= 0) return;
  const k = size / Math.max(ic.bw, ic.bh);
  const w = ic.bw * k, h = ic.bh * k;
  c.globalAlpha = alpha;
  c.drawImage(ic.cv, ic.bx, ic.by, ic.bw, ic.bh, x - w * 0.5, y - h * 0.5, w, h);
  c.globalAlpha = 1;
}

/** Blit a spell's icon centred on (x,y) of any 2D context — used by the DOM card/tile canvases. */
export function blitIcon(c, spell, x, y, size, dpr, alpha) {
  drawIcon(c, getIcon(spell, Math.round(size), dpr || 1), x, y, size, alpha == null ? 1 : alpha);
}

/* ---- spark pool ------------------------------------------------------- */

const SPARK = 96;
const sp = {
  n: 0,
  x: new Float32Array(SPARK), y: new Float32Array(SPARK),
  vx: new Float32Array(SPARK), vy: new Float32Array(SPARK),
  l: new Float32Array(SPARK), lm: new Float32Array(SPARK),
  s: new Float32Array(SPARK), col: new Array(SPARK),
};

function spark(x, y, vx, vy, life, size, col) {
  if (sp.n >= SPARK) return;
  const i = sp.n++;
  sp.x[i] = x; sp.y[i] = y; sp.vx[i] = vx; sp.vy[i] = vy;
  sp.l[i] = sp.lm[i] = life; sp.s[i] = size; sp.col[i] = col;
}

function updateSparks(dt) {
  for (let i = sp.n - 1; i >= 0; i--) {
    sp.l[i] -= dt;
    if (sp.l[i] <= 0) {
      const j = --sp.n;
      sp.x[i] = sp.x[j]; sp.y[i] = sp.y[j]; sp.vx[i] = sp.vx[j]; sp.vy[i] = sp.vy[j];
      sp.l[i] = sp.l[j]; sp.lm[i] = sp.lm[j]; sp.s[i] = sp.s[j]; sp.col[i] = sp.col[j];
      continue;
    }
    sp.x[i] += sp.vx[i] * dt; sp.y[i] += sp.vy[i] * dt;
    sp.vy[i] += 260 * dt;
    sp.vx[i] *= 1 - 2.2 * dt; sp.vy[i] *= 1 - 1.1 * dt;
  }
}

function drawSparks(c) {
  if (!sp.n) return;
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < sp.n; i++) {
    const k = sp.l[i] / sp.lm[i];
    const s = sp.s[i] * (0.35 + k * 0.65);
    c.globalAlpha = k * k;
    c.fillStyle = sp.col[i];
    c.beginPath(); c.arc(sp.x[i], sp.y[i], s, 0, TAU); c.fill();
  }
  c.restore();
  c.globalAlpha = 1;
}

/* ---- drawing ---------------------------------------------------------- */

function shade(c, r, alpha) {
  const g = gradR(c, 'cshade' + (r | 0), 0, 0, r * 0.35, r,
    [0, A(C.void, alpha), 1, A(C.void, 0)]);
  c.fillStyle = g;
  c.fillRect(-r, -r, r * 2, r * 2);
}

function ringArc(c, r, from, to, width, style) {
  c.beginPath();
  c.arc(0, 0, r, from, to);
  c.lineWidth = width;
  c.strokeStyle = style;
  c.stroke();
}

/**
 * @param {CanvasRenderingContext2D} c
 * @param {object} slot   state slot
 * @param {object} geo    layout circle {x,y,r}
 * @param {object} env    {now, focus, dpr, touch, level, keyHint}
 */
export function drawCircle(c, slot, geo, env) {
  const now = env.now;
  const spell = slot.spell;
  const sc = schoolOf(spell && spell.school);
  const locked = env.level < slot.unlockLevel;
  const cost = spell ? (spell.cost || 0) : 0;
  const cooling = slot.cdMax > 0 && slot.cd > 0;
  const reserved = !!spell && !cooling && slot.blocked === 'reserved';
  const starved = !!spell && !cooling && !reserved && env.focus < cost;
  const ready = !!spell && !cooling && !starved && !reserved;

  const tCast = now - slot.castAt;
  const tReady = now - slot.readyAt;
  const tDeny = now - slot.denyAt;

  let r = geo.r;
  let sx = 0, sy = 0;
  if (tCast >= 0 && tCast < 0.42) r *= 1 + punch(tCast / 0.42, 1.1, 4.2) * 0.11;
  if (tDeny >= 0 && tDeny < 0.34) sx = Math.sin(tDeny * 62) * (1 - tDeny / 0.34) * 4;
  if (slot.pressed) r *= 0.955;

  c.save();
  c.translate(geo.x + sx, geo.y + sy);

  /* ground shadow so the circle sits on the scene instead of floating on it */
  shade(c, r * 2.05, 0.62);

  /* ---- locked socket ---- */
  if (locked) {
    const soon = env.level >= slot.unlockLevel - 1;
    c.beginPath(); c.arc(0, 0, r * 0.9, 0, TAU);
    c.fillStyle = A(C.void, 0.72); c.fill();
    c.save();
    c.setLineDash([r * 0.17, r * 0.13]);
    ringArc(c, r, 0, TAU, 2, A(soon ? C.brass : C.faint, soon ? 0.75 : 0.5));
    c.restore();
    /* keyhole rune, with the unlock level inside the socket rather than below it —
       below collides with the neighbouring circle on the portrait arc */
    const kr = r * 0.19;
    c.beginPath(); c.arc(0, -r * 0.28, kr * 0.62, 0, TAU);
    c.moveTo(-kr * 0.34, -r * 0.28 + kr * 0.5); c.lineTo(-kr * 0.5, -r * 0.28 + kr * 1.7);
    c.lineTo(kr * 0.5, -r * 0.28 + kr * 1.7); c.lineTo(kr * 0.34, -r * 0.28 + kr * 0.5);
    c.closePath();
    c.fillStyle = A(soon ? C.brass : C.faint, soon ? 0.6 : 0.42); c.fill();
    txt(c, 'LV', 0, r * 0.16, r * 0.2, A(soon ? C.gold : C.dim, soon ? 0.8 : 0.5),
      { align: 'center', base: 'middle', track: 1.6, weight: 700 });
    txt(c, numStr(slot.unlockLevel), 0, r * 0.44, r * 0.42, A(soon ? C.gold : C.dim, soon ? 1 : 0.7),
      { align: 'center', base: 'middle', weight: 700, family: FONT_D });
    if (soon) {
      const b = 0.35 + Math.sin(now * 2.6) * 0.2;
      ringArc(c, r + 3, 0, TAU, 1, A(C.gold, b * 0.5));
    }
    c.restore();
    return;
  }

  /* ---- disc ---- */
  const dr = r * 0.9;
  c.beginPath(); c.arc(0, 0, dr, 0, TAU);
  c.fillStyle = gradR(c, 'cdisc' + sc.css + (dr | 0), 0, -dr * 0.3, dr * 0.1, dr * 1.25,
    [0, mix(sc.deep, '#1a1826', 0.45), 0.6, '#0c0b13', 1, '#050509']);
  c.fill();

  /* focus level, drawn as liquid inside the glass — the starvation tell */
  if (starved && cost > 0) {
    const lv = clamp01(env.focus / cost);
    const yTop = dr - lv * dr * 2;
    c.save();
    c.beginPath(); c.arc(0, 0, dr, 0, TAU); c.clip();
    c.fillStyle = A(C.arc, 0.14);
    c.fillRect(-dr, yTop, dr * 2, dr * 2);
    c.fillStyle = A(C.arc, 0.5);
    c.fillRect(-dr, yTop, dr * 2, 1.4);
    c.restore();
  }

  /* ---- icon ---- */
  if (spell) {
    const isize = r * (slot.i === 0 ? 1.02 : 1.0);
    const ic = getIcon(spell, Math.round(isize * 1.6), env.dpr);
    // no ctx.filter here on purpose — it forces a compositing layer every frame
    let ia = 1;
    if (cooling) ia = 0.42;
    else if (starved) ia = 0.4;
    drawIcon(c, ic, 0, -r * 0.06, isize, ia);
    if (tCast >= 0 && tCast < 0.22) {          // white strike on the icon
      c.save();
      c.globalCompositeOperation = 'lighter';
      drawIcon(c, ic, 0, -r * 0.06, isize, (1 - tCast / 0.22) * 0.9);
      c.restore();
    }
  } else {
    /* empty but unlocked — an invitation */
    const b = 0.45 + Math.sin(now * 2.2) * 0.16;
    c.lineWidth = 2.4; c.strokeStyle = A(C.brass, b);
    c.beginPath();
    c.moveTo(-r * 0.26, 0); c.lineTo(r * 0.26, 0);
    c.moveTo(0, -r * 0.26); c.lineTo(0, r * 0.26);
    c.stroke();
    txt(c, env.touch ? 'TAP' : 'SET', 0, r * 0.56, r * 0.24, A(C.dim, 0.85),
      { align: 'center', base: 'middle', track: 1.6, weight: 700 });
  }

  /* ---- cooldown sweep ---- */
  if (cooling) {
    const frac = clamp01(slot.cd / slot.cdMax);
    const a0 = -Math.PI / 2;
    const a1 = a0 + frac * TAU;
    c.beginPath();
    c.moveTo(0, 0); c.arc(0, 0, dr, a0, a1); c.closePath();
    c.fillStyle = A(C.void, 0.66); c.fill();
    c.beginPath();
    c.moveTo(0, 0); c.lineTo(Math.cos(a1) * dr, Math.sin(a1) * dr);
    c.lineWidth = 1.6; c.strokeStyle = A(sc.css, 0.55); c.stroke();
    if (slot.cd > 0.9) {
      txt(c, slot.cd.toFixed(slot.cd < 10 ? 1 : 0), 0, r * 0.04, r * 0.46, A(C.ink, 0.86),
        { align: 'center', base: 'middle', family: FONT_D, weight: 600 });
    }
  }

  /* ---- rings ---- */
  const isAuto = slot.i > 0;
  const ringW = slot.i === 0 ? 3.4 : 2.6;
  ringArc(c, r, 0, TAU, ringW + 2.4, A(C.void, 0.85));           // dark seat
  if (ready) {
    const breathe = 0.78 + Math.sin(now * 2.4 + slot.i) * 0.22;
    ringArc(c, r, 0, TAU, ringW, A(sc.css, 0.95));
    ringArc(c, r + ringW * 0.6, 0, TAU, 1, A(mix(sc.css, '#ffffff', 0.5), 0.35 * breathe));
    const g = gradR(c, 'chalo' + sc.css + (r | 0), 0, 0, r * 0.86, r * 1.55,
      [0, A(sc.css, 0), 0.55, A(sc.css, 0.26), 1, A(sc.css, 0)]);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = 0.55 + breathe * 0.4;
    c.fillStyle = g;
    c.fillRect(-r * 1.6, -r * 1.6, r * 3.2, r * 3.2);
    c.restore();
  } else if (reserved) {
    // spells/system.js is holding focus back so slot 1 can still fire — a different problem from
    // "you are out of focus", and the player has to be able to tell them apart
    ringArc(c, r, 0, TAU, ringW, A(C.gold, 0.55 + Math.sin(now * 4) * 0.15));
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.32;
      c.beginPath();
      c.moveTo(Math.cos(a) * (r + 4), Math.sin(a) * (r + 4));
      c.lineTo(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8));
      c.lineWidth = 1.6; c.strokeStyle = A(C.gold, 0.7); c.stroke();
    }
  } else if (starved) {
    ringArc(c, r, 0, TAU, ringW, A(C.arcD, 0.9));
    const lv = cost > 0 ? clamp01(env.focus / cost) : 1;
    ringArc(c, r, -Math.PI / 2, -Math.PI / 2 + lv * TAU, ringW, A(C.arc, 0.8));
  } else {
    ringArc(c, r, 0, TAU, ringW, A(C.brass, 0.35));
    const done = 1 - clamp01(slot.cd / (slot.cdMax || 1));
    ringArc(c, r, -Math.PI / 2, -Math.PI / 2 + done * TAU, ringW, A(sc.css, 0.85));
  }
  if (isAuto) ringArc(c, r + ringW * 1.9, 0, TAU, 1, A(C.brass, ready ? 0.45 : 0.22));
  if (slot.i === 0) {                                  // heavier frame: four corner ticks
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * 0.25 + i * Math.PI * 0.5;
      const ca = Math.cos(a), sa = Math.sin(a);
      c.beginPath();
      c.moveTo(ca * (r + 3), sa * (r + 3));
      c.lineTo(ca * (r + 8), sa * (r + 8));
      c.lineWidth = 2; c.strokeStyle = A(ready ? sc.css : C.brass, 0.7);
      c.stroke();
    }
  }

  /* ---- one-shot flares ---- */
  if (tReady >= 0 && tReady < 0.5) {
    const k = tReady / 0.5, e = easeOutCubic(k);
    ringArc(c, r + e * 16, 0, TAU, 3 * (1 - e), A(mix(sc.css, '#ffffff', 0.6), 0.9 * (1 - e)));
  }
  if (tCast >= 0 && tCast < 0.5) {
    const k = tCast / 0.5, e = easeOutCubic(k);
    ringArc(c, r + e * 34, 0, TAU, 4.5 * (1 - e), A(mix(sc.css, '#ffffff', 0.35), 0.8 * (1 - e)));
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = (1 - k) * 0.5;
    c.fillStyle = gradR(c, 'cflash' + sc.css + (r | 0), 0, 0, 0, r * 1.7,
      [0, A(sc.css, 0.9), 1, A(sc.css, 0)]);
    c.fillRect(-r * 1.8, -r * 1.8, r * 3.6, r * 3.6);
    c.restore();
  }
  if (tDeny >= 0 && tDeny < 0.34) {
    ringArc(c, r, 0, TAU, 3, A(C.blood, (1 - tDeny / 0.34) * 0.9));
  }

  /* ---- rank pips, jewelled along the bottom arc ---- */
  if (spell) {
    const levels = spell.levels || 5;
    const pr = r + (slot.i === 0 ? 8.5 : 7);
    const step = 26, start = 90 + step * (levels - 1) * 0.5;
    for (let i = 0; i < levels; i++) {
      const a = (start - i * step) * Math.PI / 180;
      const px = Math.cos(a) * pr, py = Math.sin(a) * pr;
      const on = i < slot.rank;
      const sz = (slot.i === 0 ? 3.6 : 3.0) * (on ? 1.12 : 0.86);
      diamond(c, px, py, sz + 1.4);
      c.fillStyle = A(C.void, 0.9); c.fill();
      diamond(c, px, py, sz);
      c.fillStyle = on ? mix(sc.css, '#ffffff', 0.25) : A(C.faint, 0.75);
      c.fill();
      if (on) {
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.5;
        diamond(c, px, py, sz * 1.9);
        c.fillStyle = A(sc.css, 0.35); c.fill();
        c.restore();
      }
    }
  }

  /* ---- cost, inside the glass ---- */
  if (spell && cost > 0) {
    const pulse = starved ? 0.7 + Math.sin(now * 7) * 0.3 : 1;
    txt(c, numStr(cost), 0, r * 0.52, r * (slot.i === 0 ? 0.34 : 0.36),
      starved ? A(C.blood, pulse) : reserved ? A(C.gold, 0.85) : A(C.arc, 0.85),
      { align: 'center', base: 'middle', weight: 700, track: 0.4 });
  }

  /* ---- slot badge ---- */
  const bs = slot.i === 0 ? 15 : 13;
  const bx = -r * 0.72, by = -r * 0.72;
  rr(c, bx - bs * 0.5, by - bs * 0.5, bs, bs, 3.5);
  c.fillStyle = A(C.void, 0.88); c.fill();
  c.lineWidth = 1; c.strokeStyle = A(ready ? sc.css : C.faint, 0.7); c.stroke();
  txt(c, numStr(slot.i + 1), bx, by + 0.5, bs * 0.62, ready ? A(C.ink, 0.95) : A(C.dim, 0.9),
    { align: 'center', base: 'middle', weight: 800 });

  c.restore();
}

/** Circle-local FX the HUD drives. */
export const circleFx = {
  onCast(slot, geo, spell) {
    const sc = schoolOf(spell && spell.school);
    const col = mix(sc.css, '#ffffff', 0.3);
    const n = slot.i === 0 ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.random() * 0.5;
      const sp0 = 90 + Math.random() * 190;
      spark(geo.x + Math.cos(a) * geo.r * 0.8, geo.y + Math.sin(a) * geo.r * 0.8,
        Math.cos(a) * sp0, Math.sin(a) * sp0 - 40,
        0.34 + Math.random() * 0.4, 1.4 + Math.random() * 2.2, col);
    }
  },
  onReady(slot, geo, spell) {
    const sc = schoolOf(spell && spell.school);
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
      spark(geo.x + Math.cos(a) * geo.r, geo.y + Math.sin(a) * geo.r,
        Math.cos(a) * 40, Math.sin(a) * 40 - 30, 0.5, 1.6, A(sc.css, 1));
    }
  },
  update: updateSparks,
  draw: drawSparks,
};

export { easeOut };
