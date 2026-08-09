/**
 * Segmented rig — the procedural animation substrate every enemy is drawn from.
 *
 * There is no character art in the atlas, so a creature is a short list of bones
 * (parent, attach offset, length, width, shape) posed by a function each frame and
 * drawn as rotated quads/ellipses. That buys squash-and-stretch, secondary motion,
 * damage reactions and dismemberment for free, which spritesheets would not.
 *
 * Bone maths runs in an UNFLIPPED local frame and is mirrored on the way out, so a
 * pose function never has to think about facing.
 */

import { LAYER } from '../gfx/renderer.js';

const MAX_BONES = 40;

/* ---------------------------------------------------------------- silhouette */

let SIL = false;
/** Flat-black readability mode. If a creature is unreadable here, it is not finished. */
export function setSilhouette(v) { SIL = !!v; }
export function silhouette() { return SIL; }

const SIL_COL = [0.012, 0.012, 0.018];

/* -------------------------------------------------------------------- shapes */

const SH_BAR = 0, SH_BLOB = 1, SH_DISC = 2, SH_STREAK = 3;
const SHAPES = { bar: SH_BAR, blob: SH_BLOB, disc: SH_DISC, streak: SH_STREAK };

/**
 * Compile a part list into flat arrays once, at module load.
 *
 * part = { n:'name', p:'parentName'|-1, ax, ay, len, w, h, sh, col:[r,g,b],
 *          a:1, add:false, tell:0, layer, glow:0, rel:0 }
 *
 * `rest`/`ang` are ABSOLUTE world angles (0 = forward, +PI/2 = down) unless the
 * part sets `rel:1`, in which case they are relative to the parent bone.
 *
 * A part with len > 0 spans from its origin along its own angle (size len x w).
 * A part with len === 0 is centred on its origin (size w x h).
 */
export function buildRig(parts) {
  const n = parts.length;
  if (n > MAX_BONES) throw new Error(`rig: ${n} bones exceeds ${MAX_BONES}`);
  const tpl = {
    n,
    name: new Array(n),
    index: Object.create(null),
    p: new Int8Array(n),
    ax: new Float32Array(n), ay: new Float32Array(n),
    len: new Float32Array(n), w: new Float32Array(n), h: new Float32Array(n),
    rest: new Float32Array(n),
    sh: new Uint8Array(n),
    col: new Float32Array(n * 3),
    alpha: new Float32Array(n),
    add: new Uint8Array(n),
    tell: new Float32Array(n),
    glow: new Float32Array(n),
    layer: new Int8Array(n),
    gib: new Uint8Array(n),
    rel: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) {
    const q = parts[i];
    tpl.name[i] = q.n;
    tpl.index[q.n] = i;
    tpl.p[i] = q.p === undefined || q.p === -1 ? -1 : tpl.index[q.p];
    if (tpl.p[i] >= i) throw new Error(`rig: part ${q.n} references a later parent`);
    tpl.ax[i] = q.ax || 0; tpl.ay[i] = q.ay || 0;
    tpl.len[i] = q.len || 0;
    tpl.w[i] = q.w || 4;
    tpl.h[i] = q.h === undefined ? (q.w || 4) : q.h;
    tpl.rest[i] = q.rest || 0;
    tpl.sh[i] = SHAPES[q.sh] === undefined ? SH_BLOB : SHAPES[q.sh];
    const c = q.col || [0.3, 0.3, 0.32];
    tpl.col[i * 3] = c[0]; tpl.col[i * 3 + 1] = c[1]; tpl.col[i * 3 + 2] = c[2];
    tpl.alpha[i] = q.a === undefined ? 1 : q.a;
    tpl.add[i] = q.add ? 1 : 0;
    tpl.tell[i] = q.tell || 0;
    tpl.glow[i] = q.glow || 0;
    tpl.layer[i] = q.layer === undefined ? -1 : q.layer;
    tpl.gib[i] = q.gib === undefined ? 1 : (q.gib ? 1 : 0);
    // Angles are ABSOLUTE by default: a pose function says "this arm points down"
    // and means it, whatever the torso is doing. `rel` opts a bone into inheriting
    // its parent's rotation, which is what joint bends and trailing chains want.
    tpl.rel[i] = q.rel ? 1 : 0;
  }
  return tpl;
}

/* ---------------------------------------------------------------- rig instances */

const pools = new Map();   // tpl -> free list

function newRig(tpl) {
  const n = tpl.n;
  return {
    tpl,
    ang: new Float32Array(n),
    lenS: new Float32Array(n),
    widS: new Float32Array(n),
    hide: new Uint8Array(n),
    aMul: new Float32Array(n),
    px: new Float32Array(n), py: new Float32Array(n), la: new Float32Array(n),
    sx: 1, sy: 1, ox: 0, oy: 0, rot: 0, tilt: 0,
  };
}

export function acquireRig(tpl) {
  let free = pools.get(tpl);
  if (!free) { free = []; pools.set(tpl, free); }
  const r = free.pop() || newRig(tpl);
  resetRig(r);
  return r;
}

export function releaseRig(r) {
  if (!r) return;
  const free = pools.get(r.tpl);
  if (free && free.length < 64) free.push(r);
}

export function resetRig(r) {
  const n = r.tpl.n;
  for (let i = 0; i < n; i++) {
    r.ang[i] = r.tpl.rest[i];
    r.lenS[i] = 1; r.widS[i] = 1; r.aMul[i] = 1; r.hide[i] = 0;
  }
  r.sx = 1; r.sy = 1; r.ox = 0; r.oy = 0; r.rot = 0; r.tilt = 0;
}

/** Index of a named bone, so pose code reads like anatomy and not like array maths. */
export function bone(rig, name) {
  const i = rig.tpl.index[name];
  if (i === undefined) throw new Error(`rig: no bone "${name}"`);
  return i;
}

/** Convenience setter used all over the pose functions. */
export function setAng(rig, name, a) { rig.ang[rig.tpl.index[name]] = a; }

/* -------------------------------------------------------------------- solving */

export function solveRig(r) {
  const t = r.tpl, n = t.n;
  const px = r.px, py = r.py, la = r.la;
  for (let i = 0; i < n; i++) {
    const p = t.p[i];
    if (p < 0) {
      px[i] = t.ax[i] + r.ox;
      py[i] = t.ay[i] + r.oy;
      la[i] = r.rot + r.ang[i];
    } else {
      const pa = la[p], c = Math.cos(pa), s = Math.sin(pa);
      px[i] = px[p] + t.ax[i] * c - t.ay[i] * s;
      py[i] = py[p] + t.ax[i] * s + t.ay[i] * c;
      la[i] = t.rel[i] ? pa + r.ang[i] : r.rot + r.ang[i];
    }
  }
}

/** World position of a bone's tip — attack hitboxes and FX anchors hang off this. */
export function boneTip(r, i, e, out) {
  const t = r.tpl;
  const len = t.len[i] * r.lenS[i];
  const lx = (r.px[i] + Math.cos(r.la[i]) * len) * r.sx;
  const ly = (r.py[i] + Math.sin(r.la[i]) * len) * r.sy;
  out.x = e.x + e.faceX * lx;
  out.y = e.y + ly;
  return out;
}

export function boneOrigin(r, i, e, out) {
  out.x = e.x + e.faceX * r.px[i] * r.sx;
  out.y = e.y + r.py[i] * r.sy;
  return out;
}

/* -------------------------------------------------------------------- painting */

const paint = {
  flash: 0, tellK: 0, tr: 1, tg: 1, tb: 1,
  alpha: 1, dim: 1, tintR: 1, tintG: 1, tintB: 1,
};

/**
 * Per-entity colour state for one draw. `d` is the enemy's data block; the fields
 * it reads are optional so the boss and gibs can share the same painter.
 */
export function beginPaint(e, d) {
  paint.flash = e ? (e.hitFlash || 0) : 0;
  paint.tellK = d && d.tellK ? d.tellK : 0;
  const tc = d && d.tellCol;
  paint.tr = tc ? tc[0] : 1; paint.tg = tc ? tc[1] : 0.6; paint.tb = tc ? tc[2] : 0.2;
  paint.alpha = d && d.alpha !== undefined ? d.alpha : 1;
  paint.dim = d && d.dim !== undefined ? d.dim : 1;
  const ti = d && d.tint;
  paint.tintR = ti ? ti[0] : 1; paint.tintG = ti ? ti[1] : 1; paint.tintB = ti ? ti[2] : 1;
  return paint;
}

/* -------------------------------------------------------------------- drawing */

/**
 * Draw a solved rig. `e` supplies world position and facing; interpolation is the
 * caller's job (pass a proxy with lerped x/y if you want it).
 */
export function drawRig(R, r, e, layerBase) {
  const t = r.tpl, n = t.n;
  const flip = e.faceX < 0 ? -1 : 1;
  const ex = e.x, ey = e.y;
  const sx = r.sx, sy = r.sy;
  const base = layerBase === undefined ? LAYER.ACTORS : layerBase;

  for (let i = 0; i < n; i++) {
    if (r.hide[i]) continue;
    const add = t.add[i] === 1;
    if (SIL && add) continue;             // glow is not silhouette

    const a = t.alpha[i] * r.aMul[i] * paint.alpha;
    if (a <= 0.004) continue;

    const la = r.la[i];
    const ca = Math.cos(la), sa = Math.sin(la);
    const len = t.len[i] * r.lenS[i];
    const wid = t.w[i] * r.widS[i];

    let lcx, lcy, sw, sh;
    if (len > 0) {
      lcx = r.px[i] + ca * len * 0.5;
      lcy = r.py[i] + sa * len * 0.5;
      sw = len * (Math.abs(ca) * sx + Math.abs(sa) * sy);
      sh = wid * (Math.abs(sa) * sx + Math.abs(ca) * sy);
    } else {
      lcx = r.px[i]; lcy = r.py[i];
      sw = wid * (Math.abs(ca) * sx + Math.abs(sa) * sy);
      sh = t.h[i] * r.widS[i] * (Math.abs(sa) * sx + Math.abs(ca) * sy);
    }

    const x = ex + flip * lcx * sx;
    const y = ey + lcy * sy;
    const rot = flip > 0 ? la : Math.PI - la;

    let cr, cg, cb;
    if (SIL) {
      cr = SIL_COL[0]; cg = SIL_COL[1]; cb = SIL_COL[2];
    } else {
      const k = t.tell[i] * paint.tellK;
      cr = t.col[i * 3] * (1 - k) + paint.tr * k;
      cg = t.col[i * 3 + 1] * (1 - k) + paint.tg * k;
      cb = t.col[i * 3 + 2] * (1 - k) + paint.tb * k;
      const f = paint.flash * 0.85;
      cr = (cr * (1 - f) + f) * paint.dim * paint.tintR;
      cg = (cg * (1 - f) + f) * paint.dim * paint.tintG;
      cb = (cb * (1 - f) + f) * paint.dim * paint.tintB;
    }

    const layer = t.layer[i] < 0 ? base : t.layer[i];
    const tex = t.sh[i] === SH_BAR ? R.white
      : t.sh[i] === SH_DISC ? R.disc
        : t.sh[i] === SH_STREAK ? R.streak : R.blob;
    R.spriteRaw(tex, 0, 0, 1, 1, x, y, sw, sh, rot, cr, cg, cb, a, layer, add, 1);
  }
}

/**
 * Emissive pass: bones flagged `glow` throw an additive halo and, above a
 * threshold, a real light. Kept separate so silhouette mode can skip it whole.
 */
export function glowRig(R, r, e, gain) {
  if (SIL) return;
  const t = r.tpl, n = t.n;
  const flip = e.faceX < 0 ? -1 : 1;
  const k = gain === undefined ? 1 : gain;
  for (let i = 0; i < n; i++) {
    const g = t.glow[i];
    if (g <= 0 || r.hide[i]) continue;
    const amt = g * k * (0.55 + paint.tellK * 0.85);
    if (amt < 0.02) continue;
    const x = e.x + flip * (r.px[i] + Math.cos(r.la[i]) * t.len[i] * 0.5) * r.sx;
    const y = e.y + (r.py[i] + Math.sin(r.la[i]) * t.len[i] * 0.5) * r.sy;
    // the halo takes the PART's colour, not the tell colour — an eye glows its own
    // colour until the tell drags it, which is what `tell` on the part is for
    const kk = t.tell[i] * paint.tellK;
    const gr = t.col[i * 3] * (1 - kk) + paint.tr * kk;
    const gg = t.col[i * 3 + 1] * (1 - kk) + paint.tg * kk;
    const gb = t.col[i * 3 + 2] * (1 - kk) + paint.tb * kk;
    const s = (Math.max(t.w[i], t.len[i]) + 6) * (1.5 + amt);
    R.spriteRaw(R.blob, 0, 0, 1, 1, x, y, s, s, 0,
      gr, gg, gb, Math.min(0.6, amt * 0.5), LAYER.FX, true, 1);
    if (g >= 0.3) {
      R.light({ x, y, radius: s * 2.2, r: gr, g: gg, b: gb, intensity: amt * 0.8, flicker: 0.12 });
    }
  }
}

/* ------------------------------------------------------------------- utilities */

/** Chain of trailing segments (tendrils, cloaks, tails) with per-segment lag. */
export function wobbleChain(rig, names, t, amp, freq, phase, lag) {
  for (let i = 0; i < names.length; i++) {
    const idx = rig.tpl.index[names[i]];
    if (idx === undefined) continue;
    rig.ang[idx] = rig.tpl.rest[idx] +
      Math.sin(t * freq - i * lag + phase) * amp * (0.45 + i * 0.28);
  }
}

/** Two-bone IK in the rig's local frame. Returns the two absolute angles via out. */
const _ik = { a: 0, b: 0 };
export function ik2(l1, l2, dx, dy, bendSign) {
  let d = Math.hypot(dx, dy);
  const max = (l1 + l2) * 0.999;
  if (d > max) d = max;
  if (d < 1e-4) d = 1e-4;
  const base = Math.atan2(dy, dx);
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA))) * (bendSign || 1);
  const cosB = (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2);
  const b = Math.PI - Math.acos(Math.max(-1, Math.min(1, cosB)));
  _ik.a = base - a;
  _ik.b = b * (bendSign || 1);
  return _ik;
}

export { LAYER };
