/* SUNDERFALL UI — resources, boss bar, toasts, screen states.
 *
 * The focus bar is the one that has to teach without a tutorial. Three devices do that job:
 *
 *   1. a notch on the bar at slot 1's cost — you can see whether your manual spell is affordable
 *      before you press it, and the stretch below the notch goes red when it is not;
 *   2. bites — when an auto-cast spends focus, a school-coloured chunk is torn out of the bar at
 *      the point it was spent and shrinks away, so you watch slots 2–5 eating your bar;
 *   3. a net-rate readout, +12 when regenerating and a red −n when the autos out-spend you.
 */

import {
  C, A, mix, schoolOf, gradH, gradR, rr, slab, hex, txt, measure, numStr, glow,
  FONT_D, clamp01, easeOutCubic,
} from './theme.js';

const TAU = Math.PI * 2;

/* ---- focus "bites" ---------------------------------------------------- */

const BITE = 10;
const bites = { n: 0, a: new Float32Array(BITE), b: new Float32Array(BITE), t: new Float32Array(BITE), col: new Array(BITE) };

export function addBite(fromFrac, toFrac, col) {
  const i = bites.n < BITE ? bites.n++ : 0;
  bites.a[i] = toFrac; bites.b[i] = fromFrac; bites.t[i] = 0.55; bites.col[i] = col;
}

function updateBites(dt) {
  for (let i = bites.n - 1; i >= 0; i--) {
    bites.t[i] -= dt;
    if (bites.t[i] <= 0) {
      const j = --bites.n;
      bites.a[i] = bites.a[j]; bites.b[i] = bites.b[j]; bites.t[i] = bites.t[j]; bites.col[i] = bites.col[j];
    }
  }
}

/* ---- shapes ----------------------------------------------------------- */

function barTrack(c, x, y, w, h, skew) {
  slab(c, x, y, w, h, skew);
  c.fillStyle = A('#05050a', 0.88);
  c.fill();
  c.strokeStyle = A(C.void, 0.9);
  c.lineWidth = 2;
  c.stroke();
  c.strokeStyle = A(C.brass, 0.22);
  c.lineWidth = 1;
  c.stroke();
}

/* ---- contrast wash ----------------------------------------------------- *
 * The backdrops are painted and often bright. Without a wash under the HUD the bars sit on
 * whatever happens to be behind them and legibility becomes luck. Two soft elliptical darkenings
 * — one under the resource cluster, one under the cast arc — cost nothing and make the HUD
 * readable over any scene. They are deliberately soft-edged: a hard panel would read as a toolbar.
 */
export function drawWash(c, L) {
  const ell = (x, y, rx, ry, a) => {
    c.save();
    c.translate(x, y);
    c.scale(rx / ry, 1);
    c.fillStyle = gradR(c, 'wash' + (ry | 0) + (a * 100 | 0), 0, 0, 0, ry,
      [0, A('#030306', a), 0.55, A('#030306', a * 0.62), 1, A('#030306', 0)]);
    c.fillRect(-ry, -ry, ry * 2, ry * 2);
    c.restore();
  };
  const portrait = L.mode === 'portrait';
  ell(L.crest.x + (portrait ? 90 : 140), L.crest.y - 4, portrait ? 320 : 450, portrait ? 145 : 165, 0.78);
  const c0 = L.circles[0];
  ell(c0.x - (portrait ? 46 : 120), c0.y + 8, portrait ? 235 : 360, portrait ? 210 : 150, 0.62);
}

/* ---- the resource cluster --------------------------------------------- */

export function drawResources(c, L, st, env) {
  const now = env.now;
  const portrait = L.mode === 'portrait';

  /* --- crest: lifestone + level + xp ring --- */
  const cx = L.crest.x, cy = L.crest.y, cr = L.crest.r;
  const xr = L.xpRing.r;

  c.save();
  c.translate(cx, cy);
  // shadow so the crest reads over a bright backdrop
  c.fillStyle = gradR(c, 'crestsh' + (xr | 0), 0, 0, xr * 0.4, xr * 2.1,
    [0, A(C.void, 0.7), 1, A(C.void, 0)]);
  c.fillRect(-xr * 2, -xr * 2, xr * 4, xr * 4);

  // xp ring
  c.beginPath(); c.arc(0, 0, xr, 0, TAU);
  c.lineWidth = 4.5; c.strokeStyle = A('#05050a', 0.95); c.stroke();
  c.lineWidth = 3; c.strokeStyle = A(C.brass, 0.28); c.stroke();
  const xf = clamp01(st.xpNext > 0 ? st.xp / st.xpNext : 0);
  if (xf > 0.001) {
    c.beginPath(); c.arc(0, 0, xr, -Math.PI / 2, -Math.PI / 2 + xf * TAU);
    c.lineWidth = 3; c.strokeStyle = C.gold; c.stroke();
    const ha = -Math.PI / 2 + xf * TAU;
    glow(c, Math.cos(ha) * xr, Math.sin(ha) * xr, 8, C.gold, 0.75);
  }

  // crest plate
  hex(c, 0, 0, cr, false);
  c.fillStyle = gradR(c, 'crestp' + (cr | 0), 0, -cr * 0.4, 0, cr * 1.4,
    [0, '#1b1926', 0.6, '#0c0b12', 1, '#050508']);
  c.fill();
  c.lineWidth = 2.4; c.strokeStyle = A(C.void, 0.9); c.stroke();
  c.lineWidth = 1.1; c.strokeStyle = A(C.brass, 0.55); c.stroke();

  // the lifestone itself, glowing behind the numeral
  const beat = 0.72 + Math.sin(now * 1.7) * 0.12 + Math.sin(now * 4.3) * 0.05;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.globalAlpha = beat * (st.hp / st.maxHp * 0.6 + 0.4);
  c.fillStyle = gradR(c, 'lifestone' + (cr | 0), 0, 0, 0, cr * 0.95,
    [0, A(C.emberL, 0.85), 0.45, A(C.ember, 0.35), 1, A(C.ember, 0)]);
  c.fillRect(-cr, -cr, cr * 2, cr * 2);
  c.restore();
  c.lineWidth = 1; c.strokeStyle = A('#1a0d06', 0.8);   // the crack through it
  c.beginPath();
  c.moveTo(-cr * 0.45, -cr * 0.30); c.lineTo(-cr * 0.10, cr * 0.05);
  c.lineTo(-cr * 0.24, cr * 0.30); c.stroke();

  txt(c, numStr(st.level), 0, cr * 0.04, cr * 1.02, C.goldL,
    { align: 'center', base: 'middle', family: FONT_D, weight: 700, shadow: 0.9 });
  c.restore();

  /* --- health --- */
  const hpR = L.hp;
  const skew = Math.max(4, hpR.h * 0.42);
  barTrack(c, hpR.x, hpR.y, hpR.w, hpR.h, skew);
  const hf = clamp01(st.hp / st.maxHp);
  const gf = clamp01(st.hpGhost / st.maxHp);

  c.save();
  slab(c, hpR.x, hpR.y, hpR.w, hpR.h, skew);
  c.clip();
  if (gf > hf) {                                  // delayed-damage ghost
    c.fillStyle = A(C.emberL, 0.35 + Math.sin(now * 14) * 0.08);
    c.fillRect(hpR.x + hpR.w * hf, hpR.y, hpR.w * (gf - hf), hpR.h);
  }
  if (hf > 0) {
    c.fillStyle = gradH(c, 'hpfill' + (hpR.x | 0) + (hpR.w | 0), hpR.x, hpR.x + hpR.w,
      [0, '#7d1226', 0.35, C.blood, 0.85, '#ff5a3c', 1, C.emberL]);
    c.fillRect(hpR.x, hpR.y, hpR.w * hf, hpR.h);
    c.fillStyle = A('#ffffff', 0.16);
    c.fillRect(hpR.x, hpR.y, hpR.w * hf, hpR.h * 0.34);
    c.fillStyle = A(C.emberL, 0.9);               // hot leading edge
    c.fillRect(hpR.x + hpR.w * hf - 2, hpR.y, 2, hpR.h);
  }
  const seg = st.maxHp > 0 ? Math.max(1, Math.round(st.maxHp / 25)) : 4;
  c.fillStyle = A(C.void, 0.55);
  for (let i = 1; i < seg; i++) c.fillRect(hpR.x + (hpR.w * i) / seg, hpR.y, 1, hpR.h);
  c.restore();

  if (hf < 0.3) {                                  // low health tell
    const p = 0.3 + Math.sin(now * 6) * 0.25;
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.globalAlpha = p * (1 - hf / 0.3);
    slab(c, hpR.x - 3, hpR.y - 3, hpR.w + 6, hpR.h + 6, skew);
    c.strokeStyle = C.blood; c.lineWidth = 2; c.stroke();
    c.restore();
  }

  const hpTxt = numStr(Math.ceil(st.hp)) + ' / ' + numStr(st.maxHp);
  txt(c, hpTxt, hpR.x + hpR.w + 9, hpR.y + hpR.h * 0.5 + 0.5, portrait ? 10 : 11.5,
    hf < 0.3 ? C.blood : A(C.ink, 0.8), { base: 'middle', weight: 700, track: 0.6, shadow: 0.85 });

  /* --- focus --- */
  const fR = L.focus;
  const fskew = Math.max(3, fR.h * 0.5);
  barTrack(c, fR.x, fR.y, fR.w, fR.h, fskew);
  const ff = clamp01(st.focus / st.maxFocus);
  const cost1 = st.slots[0].spell ? (st.slots[0].spell.cost || 0) : 0;
  const costFrac = clamp01(cost1 / st.maxFocus);
  const short = cost1 > 0 && st.focus < cost1;

  c.save();
  slab(c, fR.x, fR.y, fR.w, fR.h, fskew);
  c.clip();
  if (short) {                                     // the unaffordable stretch, in red
    c.fillStyle = A(C.bloodD, 0.75);
    c.fillRect(fR.x, fR.y, fR.w * costFrac, fR.h);
  }
  if (ff > 0) {
    c.fillStyle = gradH(c, 'ffill' + (fR.x | 0) + (fR.w | 0), fR.x, fR.x + fR.w,
      [0, '#12485e', 0.5, '#2f9cc4', 1, C.arc]);
    c.fillRect(fR.x, fR.y, fR.w * ff, fR.h);
    c.fillStyle = A('#ffffff', 0.18);
    c.fillRect(fR.x, fR.y, fR.w * ff, fR.h * 0.4);
  }
  for (let i = 0; i < bites.n; i++) {              // auto-casts eating the bar
    const k = bites.t[i] / 0.55;
    const x0 = fR.x + fR.w * bites.a[i], x1 = fR.x + fR.w * bites.b[i];
    c.globalAlpha = k;
    c.fillStyle = bites.col[i];
    c.fillRect(x0, fR.y, (x1 - x0) * k, fR.h);
    c.globalAlpha = 1;
  }
  if (st.focusHoldUntil > st.simTime) {             // regen paused after a manual cast
    c.fillStyle = A(C.gold, 0.10 + Math.sin(now * 18) * 0.05);
    c.fillRect(fR.x, fR.y, fR.w, fR.h);
  }
  c.restore();

  if (cost1 > 0) {                                  // the cost notch
    const nx = fR.x + fR.w * costFrac;
    c.fillStyle = short ? C.blood : A(C.goldL, 0.95);
    c.fillRect(nx - 1, fR.y - 3, 2, fR.h + 6);
    c.beginPath();
    c.moveTo(nx - 3.5, fR.y - 4); c.lineTo(nx + 3.5, fR.y - 4); c.lineTo(nx, fR.y + 0.5);
    c.closePath();
    c.fill();
  }

  // drain pips: one per auto slot that is spending, width = its share of the pool, school-coloured
  let px = fR.x;
  let anyPip = false;
  for (let i = 1; i < 5; i++) {
    const s = st.slots[i];
    if (!s.spell || st.level < s.unlockLevel) continue;
    anyPip = true;
    const sc = schoolOf(s.spell.school);
    const wdt = Math.max(7, fR.w * ((s.spell.cost || 0) / st.maxFocus));
    const fresh = clamp01(1 - (now - s.castAt) / 0.5);
    c.fillStyle = A(C.void, 0.8);
    c.fillRect(px - 1, fR.y + fR.h + 3, wdt + 0.5, 5);
    c.fillStyle = A(sc.css, 0.42 + fresh * 0.58);
    c.fillRect(px, fR.y + fR.h + 4, wdt - 2, 3);
    px += wdt + 2;
  }
  if (anyPip) {
    txt(c, 'AUTO', px + 6, fR.y + fR.h + 6.5, 7.5, A(C.dim, 0.75),
      { base: 'middle', track: 1.6, weight: 700 });
  }

  const net = (st.focusHoldUntil > st.simTime ? 0 : st.focusRegen) - st.focusDrain;
  const rateTxt = (net >= 0 ? '+' : '−') + Math.abs(net).toFixed(net % 1 ? 1 : 0);
  const fTxt = numStr(Math.floor(st.focus));
  const fx = fR.x + fR.w + 9;
  txt(c, fTxt, fx, fR.y + fR.h * 0.5 + 0.5, portrait ? 10 : 11.5, A(C.arc, 0.9),
    { base: 'middle', weight: 700, track: 0.6, shadow: 0.85 });
  const fw = measure(c, fTxt, portrait ? 10 : 11.5, { weight: 700, track: 0.6 });
  txt(c, rateTxt, fx + fw + 6, fR.y + fR.h * 0.5 + 0.5, portrait ? 9 : 10,
    net < 0 ? C.blood : A(C.arcD, 1), { base: 'middle', weight: 700, track: 0.4, shadow: 0.8 });

  updateBites(env.dt);
}

/* ---- boss bar ---------------------------------------------------------- */

export function drawBoss(c, L, boss, env) {
  if (!boss || boss.show <= 0) return;
  const now = env.now;
  const R = L.boss;
  const intro = clamp01(boss.show);
  const e = easeOutCubic(intro);
  const w = R.w * e;
  const x = R.x + (R.w - w) * 0.5;
  const y = R.y + (1 - e) * -12;
  const hit = clamp01(1 - (now - (boss.hitAt || -9)) / 0.18);

  c.save();
  c.globalAlpha = e;
  const sx = hit > 0 ? Math.sin(now * 90) * hit * 2.5 : 0;
  c.translate(sx, 0);

  const mid = x + w * 0.5;
  txt(c, boss.name || 'THE SEAM', mid, y - (boss.subtitle ? 24 : 11), L.mode === 'portrait' ? 13 : 17, C.bone,
    { align: 'center', base: 'alphabetic', family: FONT_D, weight: 700, track: 4, caps: true, shadow: 1 });
  if (boss.subtitle) {
    txt(c, boss.subtitle, mid, y - 10, 8.5, A(C.dim, 0.95),
      { align: 'center', track: 3, caps: true, weight: 600, shadow: 0.8 });
  }

  // iron wings at each end
  for (const dir of WING) {
    const ex = dir < 0 ? x : x + w;
    c.beginPath();
    c.moveTo(ex, y - 3); c.lineTo(ex + dir * 14, y + R.h * 0.5); c.lineTo(ex, y + R.h + 3);
    c.closePath();
    c.fillStyle = A(C.brass, 0.5); c.fill();
    c.strokeStyle = A(C.void, 0.9); c.lineWidth = 1.5; c.stroke();
  }

  rr(c, x - 2, y - 2, w + 4, R.h + 4, 3);
  c.fillStyle = A('#05050a', 0.9); c.fill();
  c.strokeStyle = A(C.brass, 0.4); c.lineWidth = 1; c.stroke();

  const hf = clamp01(boss.hp / boss.maxHp);
  const gf = clamp01((boss.ghost != null ? boss.ghost : boss.hp) / boss.maxHp);
  c.save();
  rr(c, x, y, w, R.h, 2);
  c.clip();
  if (gf > hf) {
    c.fillStyle = A(C.emberL, 0.4);
    c.fillRect(x + w * hf, y, w * (gf - hf), R.h);
  }
  c.fillStyle = gradH(c, 'bossfill' + (x | 0) + (w | 0), x, x + w,
    [0, '#4d0a18', 0.4, '#a51f33', 0.8, '#e0452f', 1, C.gold]);
  c.fillRect(x, y, w * hf, R.h);
  c.fillStyle = A('#ffffff', 0.14);
  c.fillRect(x, y, w * hf, R.h * 0.35);
  if (hit > 0) {
    c.fillStyle = A('#ffffff', hit * 0.55);
    c.fillRect(x, y, w * hf, R.h);
  }
  c.restore();

  const phases = boss.phases || DEFAULT_PHASES;
  for (let i = 0; i < phases.length; i++) {
    const px = x + w * phases[i];
    c.fillStyle = A(C.bone, hf > phases[i] ? 0.75 : 0.25);
    c.fillRect(px - 1, y, 2, R.h);
  }

  txt(c, Math.ceil(hf * 100) + '%', x + w - 6, y + R.h * 0.5 + 0.5, 9.5, A(C.ink, 0.85),
    { align: 'right', base: 'middle', weight: 700, track: 0.5, shadow: 0.9 });
  c.restore();
  c.globalAlpha = 1;
}
const WING = [-1, 1];
const DEFAULT_PHASES = [0.33, 0.66];

/* ---- toasts ------------------------------------------------------------ */

const TOASTC = {
  shard: C.gold, spell: C.arc, heal: '#7de08a', gold: C.gold,
  info: C.ink, warn: C.ember, break: C.brass,
};

/**
 * Trim to width with an ellipsis. The panel clamps to `L.toast.w`, so without
 * this a long line simply ran on under the value badge and the two overprinted
 * each other — which is what "Jump again in mid-air…" did on a 390px portrait.
 */
const TOAST_TXT = { weight: 600 };
function fitText(c, text, size, opt, maxw) {
  if (maxw <= 0 || measure(c, text, size, opt) <= maxw) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (measure(c, text.slice(0, mid) + '…', size, opt) <= maxw) lo = mid; else hi = mid - 1;
  }
  return text.slice(0, lo).replace(/\s+$/, '') + '…';
}

export function drawToasts(c, L, list, env) {
  if (!list.length) return;
  const portrait = L.mode === 'portrait';
  const hgt = portrait ? 28 : 32;
  const gap = 6;
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const age = env.now - t.at;
    if (age < 0) continue;
    const inK = clamp01(age / 0.28);
    const outK = clamp01((t.life - age) / 0.35);
    const a = easeOutCubic(inK) * clamp01(outK);
    if (a <= 0.001) continue;
    const slide = (1 - easeOutCubic(inK)) * -26;
    const y = L.toast.y + L.toast.dir * i * (hgt + gap) - (L.toast.dir < 0 ? hgt : 0);
    const col = TOASTC[t.kind] || C.ink;
    const tsize = portrait ? 11 : 12;
    const vw = t.value ? measure(c, t.value, portrait ? 12 : 13, { weight: 800, track: 0.5 }) + 10 : 0;
    const label = fitText(c, t.text, tsize, TOAST_TXT, L.toast.w - 44 - vw);
    const lw = measure(c, label, tsize, TOAST_TXT);
    const w = Math.min(L.toast.w, 44 + lw + vw);

    c.save();
    c.globalAlpha = a;
    c.translate(L.toast.x + slide, y);
    rr(c, 0, 0, w, hgt, 5);
    c.fillStyle = A('#0a0a12', 0.88); c.fill();
    c.strokeStyle = A(C.void, 0.9); c.lineWidth = 2; c.stroke();
    c.strokeStyle = A(col, 0.42); c.lineWidth = 1; c.stroke();
    // left accent
    c.fillStyle = col;
    c.fillRect(0, 3, 2.5, hgt - 6);
    glow(c, 16, hgt * 0.5, 12, col, 0.5);
    c.beginPath(); c.arc(16, hgt * 0.5, 4.5, 0, TAU);
    c.fillStyle = col; c.fill();
    txt(c, label, 28, hgt * 0.5 + 0.5, tsize, A(C.ink, 0.95), { base: 'middle', weight: 600 });
    if (t.value) {
      txt(c, t.value, w - 9, hgt * 0.5 + 0.5, portrait ? 12 : 13, col,
        { base: 'middle', align: 'right', weight: 800, track: 0.5 });
    }
    c.restore();
  }
  c.globalAlpha = 1;
}

/* ---- full-screen states ------------------------------------------------ */

export function drawScreenFx(c, L, fx, st, env) {
  const now = env.now;
  // hurt flash from the edges
  if (fx.hurt > 0.001) {
    const g = gradR(c, 'hurtvig' + (L.w | 0) + (L.h | 0), L.w * 0.5, L.h * 0.5,
      Math.min(L.w, L.h) * 0.25, Math.max(L.w, L.h) * 0.72,
      [0, A(C.blood, 0), 0.62, A(C.blood, 0.28), 1, A(C.blood, 0.75)]);
    c.globalAlpha = fx.hurt;
    c.fillStyle = g;
    c.fillRect(0, 0, L.w, L.h);
    c.globalAlpha = 1;
  }
  // chronic low health
  const hf = st.hp / st.maxHp;
  if (hf < 0.32) {
    const p = (1 - hf / 0.32) * (0.16 + Math.sin(now * 4.4) * 0.09);
    const g = gradR(c, 'lowvig' + (L.w | 0) + (L.h | 0), L.w * 0.5, L.h * 0.5,
      Math.min(L.w, L.h) * 0.3, Math.max(L.w, L.h) * 0.7,
      [0, A('#3a0008', 0), 1, A('#8c0016', 0.9)]);
    c.globalAlpha = clamp01(p);
    c.fillStyle = g;
    c.fillRect(0, 0, L.w, L.h);
    c.globalAlpha = 1;
  }
  // focus spent — a brief cool rim, so a manual cast is felt at the edge of vision too
  if (fx.spend > 0.001) {
    const g = gradR(c, 'spendvig' + (L.w | 0) + (L.h | 0), L.w * 0.5, L.h * 0.5,
      Math.min(L.w, L.h) * 0.4, Math.max(L.w, L.h) * 0.7,
      [0, A(C.arc, 0), 1, A(C.arc, 0.5)]);
    c.globalAlpha = fx.spend * 0.5;
    c.fillStyle = g;
    c.fillRect(0, 0, L.w, L.h);
    c.globalAlpha = 1;
  }
}

/* ---- the level-up moment (canvas half; the DOM half is in overlays.js) --- */

export function drawLevelBurst(c, L, b, env) {
  if (b.t <= 0) return;
  const k = 1 - b.t / b.max;
  const e = easeOutCubic(k);
  const cx = b.x != null ? b.x : L.w * 0.5;
  const cy = b.y != null ? b.y : L.h * 0.5;
  c.save();
  c.globalCompositeOperation = 'lighter';
  const r = 40 + e * Math.max(L.w, L.h) * 0.55;
  c.globalAlpha = (1 - e) * 0.85;
  c.lineWidth = 26 * (1 - e) + 1;
  c.strokeStyle = A(C.gold, 0.5);
  c.beginPath(); c.arc(cx, cy, r, 0, TAU); c.stroke();
  c.lineWidth = 3 * (1 - e) + 0.5;
  c.strokeStyle = A(C.goldL, 0.9);
  c.beginPath(); c.arc(cx, cy, r * 1.02, 0, TAU); c.stroke();
  // rising motes
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + b.seed;
    const d = 30 + e * 220 * (0.5 + ((i * 37) % 10) / 12);
    const yy = cy + Math.sin(a) * d * 0.5 - e * 90;
    c.globalAlpha = (1 - e) * 0.8;
    c.fillStyle = i % 3 ? C.gold : C.emberL;
    c.beginPath(); c.arc(cx + Math.cos(a) * d, yy, 2.4 * (1 - e) + 0.6, 0, TAU); c.fill();
  }
  c.restore();
  c.globalAlpha = 1;
}
