/* SUNDERFALL UI — the visual language.
 *
 * One palette, one type scale, one set of canvas primitives. Everything the HUD draws goes through
 * here so the cast circles, the bars and the card screens read as the same object.
 *
 * Colour discipline (matches the art direction): near-black grounds, ONE warm accent (ember/gold)
 * and ONE cool accent (arc-cyan) against teal shadow. Anything else is a school tint and is only
 * ever used inside that school's own element.
 */

export const C = {
  void:   '#06060a',
  panel:  '#0d0d15',
  panel2: '#151422',
  ink:    '#ece7f5',
  dim:    '#8b869d',
  faint:  '#4c4a5c',
  ember:  '#ff7a2f',
  emberL: '#ffb066',
  gold:   '#ffc24d',
  goldL:  '#ffe1a3',
  arc:    '#6fe3ff',
  arcD:   '#1d5f78',
  blood:  '#d0344a',
  bloodD: '#5a1220',
  teal:   '#16303a',
  brass:  '#b78a4a',
  brassL: '#e8c489',
  bone:   '#d8cfc0',
  poison: '#9ede5a',
};

export const SCHOOL = {
  fire:  { name: 'Fire',  css: '#ff8a3d', deep: '#4a1c08' },
  storm: { name: 'Storm', css: '#7fd9ff', deep: '#0d2f44' },
  earth: { name: 'Earth', css: '#d0a961', deep: '#3a2c12' },
  decay: { name: 'Decay', css: '#9ede5a', deep: '#1e3410' },
  void:  { name: 'Void',  css: '#b57cff', deep: '#2a1348' },
  life:  { name: 'Life',  css: '#ff90b2', deep: '#43121f' },
};
export const NEUTRAL_SCHOOL = { name: '—', css: C.brass, deep: '#241c10' };
export const schoolOf = (s) => (s && SCHOOL[s]) || NEUTRAL_SCHOOL;

export const FONT_UI = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", system-ui, sans-serif';
export const FONT_D  = 'ui-serif, Georgia, "Iowan Old Style", "Times New Roman", serif';

/* ---- easing ---------------------------------------------------------- */

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const easeOut = (t) => 1 - (1 - t) * (1 - t);
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
export const easeOutBack = (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
/** Overshoot-and-settle, for anything that should feel struck rather than tweened. */
export const punch = (t, freq = 3.4, decay = 5.5) =>
  Math.sin(t * Math.PI * freq) * Math.exp(-t * decay);

/* ---- colour ---------------------------------------------------------- */

const _rgba = new Map();
/** `#rrggbb` + alpha -> cached rgba() string. Never allocates twice for the same pair. */
export function A(hex, a) {
  const k = hex + (a * 1000 | 0);
  let v = _rgba.get(k);
  if (v === undefined) {
    const n = parseInt(hex.slice(1), 16);
    v = 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    _rgba.set(k, v);
  }
  return v;
}

const _mix = new Map();
export function mix(h1, h2, t) {
  const k = h1 + h2 + (t * 100 | 0);
  let v = _mix.get(k);
  if (v === undefined) {
    const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
    const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
    const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
    const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
    v = '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
    _mix.set(k, v);
  }
  return v;
}

/* ---- gradients ------------------------------------------------------- *
 * Creating a CanvasGradient allocates, so they are cached per context and dropped on resize.
 */

const _grads = new WeakMap();
export function clearGrads(c) { _grads.delete(c); }

export function gradV(c, key, y0, y1, stops) {
  let m = _grads.get(c);
  if (!m) { m = new Map(); _grads.set(c, m); }
  let g = m.get(key);
  if (!g) {
    g = c.createLinearGradient(0, y0, 0, y1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    m.set(key, g);
  }
  return g;
}

export function gradH(c, key, x0, x1, stops) {
  let m = _grads.get(c);
  if (!m) { m = new Map(); _grads.set(c, m); }
  let g = m.get(key);
  if (!g) {
    g = c.createLinearGradient(x0, 0, x1, 0);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    m.set(key, g);
  }
  return g;
}

export function gradR(c, key, x, y, r0, r1, stops) {
  let m = _grads.get(c);
  if (!m) { m = new Map(); _grads.set(c, m); }
  let g = m.get(key);
  if (!g) {
    g = c.createRadialGradient(x, y, r0, x, y, r1);
    for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
    m.set(key, g);
  }
  return g;
}

/* ---- shapes ---------------------------------------------------------- */

export function rr(c, x, y, w, h, r) {
  const k = Math.min(r, w * 0.5, h * 0.5);
  c.beginPath();
  c.moveTo(x + k, y);
  c.lineTo(x + w - k, y);
  c.arcTo(x + w, y, x + w, y + k, k);
  c.lineTo(x + w, y + h - k);
  c.arcTo(x + w, y + h, x + w - k, y + h, k);
  c.lineTo(x + k, y + h);
  c.arcTo(x, y + h, x, y + h - k, k);
  c.lineTo(x, y + k);
  c.arcTo(x, y, x + k, y, k);
  c.closePath();
}

/** A bar slab with a sheared right end — reads as forged rather than as a progress bar. */
export function slab(c, x, y, w, h, skew) {
  c.beginPath();
  c.moveTo(x + skew, y);
  c.lineTo(x + w, y);
  c.lineTo(x + w - skew, y + h);
  c.lineTo(x, y + h);
  c.closePath();
}

/** Six-sided crest plate. */
export function hex(c, x, y, r, flat) {
  c.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + (flat ? 0 : Math.PI / 6);
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath();
}

export function diamond(c, x, y, r) {
  c.beginPath();
  c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y);
  c.closePath();
}

/**
 * The house panel: near-black glass with a lit top rim and a dark base, plus a hairline brass edge.
 * Everything framed in the HUD uses this so nothing looks bolted on.
 */
export function plate(c, x, y, w, h, r, opt) {
  const tint = (opt && opt.tint) || null;
  const alpha = (opt && opt.alpha) != null ? opt.alpha : 0.86;
  rr(c, x, y, w, h, r);
  c.fillStyle = gradV(c, 'plate' + (y | 0) + '_' + (h | 0) + (tint || ''), y, y + h,
    tint
      ? [0, A(tint, 0.20 * alpha), 0.45, A(C.panel, alpha), 1, A(C.void, alpha)]
      : [0, A(C.panel2, alpha), 0.55, A(C.panel, alpha), 1, A(C.void, alpha)]);
  c.fill();
  c.strokeStyle = A(C.void, 0.9);
  c.lineWidth = 2;
  c.stroke();
  rr(c, x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1));
  c.strokeStyle = A(tint || C.brass, 0.30);
  c.lineWidth = 1;
  c.stroke();
}

/* ---- text ------------------------------------------------------------ */

const _fontCache = new Map();
function fontStr(weight, size, family) {
  const k = weight + '|' + size + '|' + family;
  let v = _fontCache.get(k);
  if (!v) { v = weight + ' ' + size + 'px ' + family; _fontCache.set(k, v); }
  return v;
}

const NO_TRACK = '0px';
/**
 * txt(c, str, x, y, size, color, opts)
 * opts: {weight, family, align, base, track, caps, glow, shadow, alpha}
 * Kept positional on the hot arguments so the HUD can call it without building an options object.
 */
export function txt(c, s, x, y, size, color, o) {
  const weight = (o && o.weight) || 600;
  const fam = (o && o.family) || FONT_UI;
  c.font = fontStr(weight, size, fam);
  c.textAlign = (o && o.align) || 'left';
  c.textBaseline = (o && o.base) || 'alphabetic';
  if (c.letterSpacing !== undefined) c.letterSpacing = (o && o.track) ? o.track + 'px' : NO_TRACK;
  const str = (o && o.caps) ? s.toUpperCase() : s;
  if (o && o.shadow) {
    c.fillStyle = A(C.void, o.shadow);
    c.fillText(str, x, y + 1.5);
  }
  if (o && o.glow) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = o.glow;
    c.fillStyle = color;
    c.fillText(str, x, y);
    c.fillText(str, x, y);
    c.restore();
  }
  c.globalAlpha = (o && o.alpha) != null ? o.alpha : 1;
  c.fillStyle = color;
  c.fillText(str, x, y);
  c.globalAlpha = 1;
  if (c.letterSpacing !== undefined) c.letterSpacing = NO_TRACK;
}

export function measure(c, s, size, o) {
  c.font = fontStr((o && o.weight) || 600, size, (o && o.family) || FONT_UI);
  if (c.letterSpacing !== undefined) c.letterSpacing = (o && o.track) ? o.track + 'px' : NO_TRACK;
  const w = c.measureText((o && o.caps) ? s.toUpperCase() : s).width;
  if (c.letterSpacing !== undefined) c.letterSpacing = NO_TRACK;
  return w;
}

/* Integer strings, cached — damage numbers must not allocate on spawn either. */
const _nums = [];
export function numStr(n) {
  const i = n | 0;
  if (i >= 0 && i < 10000) {
    let v = _nums[i];
    if (v === undefined) { v = String(i); _nums[i] = v; }
    return v;
  }
  return String(i);
}

/** Additive soft glow blob. Cheaper and softer than shadowBlur, which is death in a hot loop. */
export function glow(c, x, y, r, color, alpha) {
  if (alpha <= 0.001) return;
  const g = gradR(c, 'glow' + color + (r | 0), 0, 0, 0, r, [0, A(color, 1), 0.45, A(color, 0.35), 1, A(color, 0)]);
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.fillStyle = g;
  c.fillRect(-r, -r, r * 2, r * 2);
  c.restore();
}
