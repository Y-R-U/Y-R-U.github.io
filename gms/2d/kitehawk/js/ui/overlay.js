/**
 * The fixed-screen-size overlay — P7 deliverables 2, 3, 4 and 8.
 *
 * Everything here is positioned from a WORLD point and drawn at a SCREEN size,
 * which is DESIGN §2.9a's rule stated as code: "any HUD element whose job is to
 * survive zoom-out is drawn at a fixed screen size and positioned from a world
 * point. Anything drawn in world units is allowed to become illegible."
 *
 * Nothing in this file reads `cam.zoom`. It reads screen positions, which the
 * renderer has already computed, so gate H4 holds by construction rather than by
 * discipline — the only zoom-aware behaviour is that fewer contacts are
 * off-screen when the camera has widened, which is ART §10's stated exception.
 *
 * The models are pure and take a `toScreen(wx, wy, out)` callback, so
 * `tools/hudcheck.mjs` measures H8 without a renderer.
 */

import { METRICS, TIMING } from './layout.js';
import { INK, mark, label, font } from './theme.js';
import { M_PER_WU } from '../core/math.js';
import { GUNS } from '../sim/weapons.js';

/** SI metres per world unit — imported, never re-typed. D72's whole lesson. */
const M = M_PER_WU;

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
/** Isolation switches for the harness only. No shipped path ever sets one. */
export const ISO = { noRange: false, noCone: false };

/* ------------------------------------------------- edge threat chevrons --- */

/**
 * ARCHITECTURE §4.2 mitigation 2, and the answer to portrait's 462 wu of width.
 *
 * A contact outside the viewport HORIZONTALLY gets an arrow on the edge it left
 * by, sized by distance, coloured by closure rate, with an above/below tick.
 *
 * **If more than three are live, merge the nearest three and drop the rest**
 * (ART §10 / H8). Two survivors closer together on the edge than
 * `CHEV_MERGE_PX` collapse into one carrying a count, because two arrows 8 px
 * apart read as one fat arrow anyway.
 */
export function chevronModel(contacts, screen, toScreen, out = null) {
  const list = out || [];
  list.length = 0;
  const s = { x: 0, y: 0 };
  const cand = [];

  for (let i = 0; i < contacts.length; i++) {
    const c = contacts[i];
    toScreen(c.x, c.y, s);
    const off = s.x < screen.x ? -1 : s.x > screen.x + screen.w ? 1 : 0;
    if (!off) continue;
    cand.push({
      id: c.id, side: c.side, kind: c.kind, dist: c.dist, closing: c.closing || 0,
      edge: off,
      y: Math.max(screen.y + METRICS.CHEV_INSET, Math.min(screen.y + screen.h - METRICS.CHEV_INSET, s.y)),
      above: s.y < screen.y, below: s.y > screen.y + screen.h,
      n: 1,
    });
  }

  cand.sort((a, b) => a.dist - b.dist);
  const keep = cand.slice(0, METRICS.CHEV_MAX);

  for (const k of keep) {
    const hit = list.find((m) => m.edge === k.edge && Math.abs(m.y - k.y) < METRICS.CHEV_MERGE_PX);
    if (hit) { hit.n++; if (k.dist < hit.dist) { hit.dist = k.dist; hit.closing = k.closing; } }
    else list.push(k);
  }
  return list;
}

const chevLen = (dist, range) =>
  METRICS.CHEV_LEN_MAX - (METRICS.CHEV_LEN_MAX - METRICS.CHEV_LEN_MIN) * Math.min(1, dist / range);

export function drawChevrons(g, model, screen, range) {
  for (const c of model) {
    const x = c.edge < 0 ? screen.x + METRICS.CHEV_INSET : screen.x + screen.w - METRICS.CHEV_INSET;
    const dir = c.edge;                                  // the arrow points OFF screen
    const len = chevLen(c.dist, range);
    // closure rate is the colour channel; allegiance is the shape channel
    const hot = c.closing > 0;
    const col = c.kind === 'crate' ? INK.crate : c.side === 1 ? INK.friendly : hot ? INK.hostileHot : INK.hostile;
    const a = INK.tapeMarkA * (1 - Math.min(1, c.dist / range)) + INK.stickA;

    mark(g, (p) => {
      p.moveTo(x + dir * len, c.y);
      p.lineTo(x, c.y - METRICS.CHEV_HALF);
      p.lineTo(x, c.y + METRICS.CHEV_HALF);
      p.closePath();
    }, { col, a: Math.min(1, a), w: METRICS.HAIRLINE, fill: true });

    // the above/below tick — DESIGN §2.7's requirement, and the half of the
    // chevron that tells you whether to climb or dive
    if (c.above || c.below) {
      const ty = c.above ? c.y - METRICS.CHEV_HALF - METRICS.CHEV_TICK : c.y + METRICS.CHEV_HALF + METRICS.CHEV_TICK;
      mark(g, (p) => {
        p.moveTo(x - METRICS.CHEV_TICK * 0.5, ty + (c.above ? METRICS.CHEV_TICK * 0.5 : -METRICS.CHEV_TICK * 0.5));
        p.lineTo(x, ty);
        p.lineTo(x + METRICS.CHEV_TICK * 0.5, ty + (c.above ? METRICS.CHEV_TICK * 0.5 : -METRICS.CHEV_TICK * 0.5));
      }, { col, a: Math.min(1, a), w: METRICS.HAIRLINE });
    }

    if (c.n > 1) {
      g.font = font(METRICS.FONT_SMALL);
      label(g, String(c.n), x - dir * METRICS.CHEV_COUNT_DX, c.y,
            { col, align: c.edge < 0 ? 'left' : 'right' });
    }
  }
}

/* ----------------------------------------------------- threat brackets --- */

/**
 * DESIGN §2.7: "a converging red bracket 0.5 s before any enemy with a firing
 * solution opens fire", and §3.6 rule 1 calls it the single most important
 * readability feature in the game.
 *
 * It is drawn over the ENEMY, never over the player — ART §10 forbids any
 * element on top of the aeroplane at any time, and "which one of them is about
 * to shoot" is the question the player actually has.
 *
 * The solution is PREDICTED, not sampled: both aircraft are extrapolated at
 * constant velocity and the shooter's heading at its current pitch rate, and the
 * first instant inside `fireCone` and inside range is the warning time. That is
 * a genuine 0.5 s of lead. Sampling the shooter's live `shootingAt` would give
 * zero lead, which is the same "warning that arrives with the bullets" failure
 * the whole feature exists to prevent.
 */
export function threatModel(player, hostiles, out = null, o = null) {
  const lead = (o && o.lead) || TIMING.BRACKET_LEAD;
  const hold = o && o.hold !== undefined ? o.hold : TIMING.BRACKET_HOLD;
  const state = o && o.state;
  const coneK = o && o.coneK !== undefined ? o.coneK : METRICS.BRACKET_CONE_K;
  const dt = (o && o.dt) || 0;
  const list = out || [];
  list.length = 0;
  if (!player || !player.alive) return list;
  const pf = player.flight;
  for (let i = 0; i < hostiles.length; i++) {
    const e = hostiles[i];
    if (!e.alive || e.dead || !e.gun || e.side === player.side) continue;
    const f = e.flight;
    /**
     * The warning cone is WIDER than the firing cone, and it has to be. Measured
     * at fire minus 0.5 s the attacker's aim error is 11.0 deg against an 11 deg
     * fire cone — it is already tracking you and simply not in range yet, and
     * the error oscillates across the boundary. A warning gated on the same
     * threshold as the trigger arrives WITH the trigger by construction; the
     * median continuous warning measured 0.300 s at every lookahead from 0.5 s
     * to 1.0 s and at every hysteresis hold from 0 to 0.7 s, which is what a
     * term that is not the binding one looks like.
     */
    const cone = (e.gun.fireCone || GUNS.coneHalf) * coneK;
    const range = (e.gun.tier && e.gun.tier.range) || GUNS.rangeEff;

    /**
     * Linearise the AIMING ERROR, not the heading.
     *
     * The first version extrapolated the shooter's heading as `theta + q*t` and
     * asked whether the player fell inside the cone. Measured, that delivers a
     * flat 0.28-0.30 s of warning no matter how far ahead it looks (0.5 s, 0.9,
     * 1.2 — all the same), because over a long horizon `q` sweeps the predicted
     * nose right past the target: a turning attacker arrives on the solution
     * faster than any straight-line heading prediction says it will.
     *
     * What actually matters is the error between the nose and the bearing, and
     * its rate is exactly (bearing rate - turn rate). Bearing rate has a closed
     * form, so this is one line and it is right for the whole window.
     */
    const dx0 = pf.sx - f.sx, dy0 = pf.sy - f.sy;
    const d0 = Math.hypot(dx0, dy0) || 1e-6;
    const rvx = pf.svx - f.svx, rvy = pf.svy - f.svy;
    const bearingRate = (dx0 * rvy - dy0 * rvx) / (d0 * d0);
    const err0 = wrapPi(Math.atan2(dy0, dx0) - f.theta);
    const errRate = bearingRate - f.q;

    /**
     * The two conditions are checked over the window but NOT required at the
     * same instant, and that is a measured decision rather than a convenience.
     * Requiring "in range AND in cone at the same predicted tk" delivers 0.283 s
     * of warning; range entry alone is predictable 0.55 s out and cone
     * satisfaction 2.03 s out, and they only coincide late because a linear
     * error model drifts. The condition that matches what the player needs to
     * know is "he is tracking you, and he is about to be in range".
     */
    let t = -1, pointed = ISO.noCone;
    for (let k = 0; k <= METRICS.BRACKET_STEPS; k++) {
      const tk = lead * (k / METRICS.BRACKET_STEPS);
      if (!pointed && Math.abs(err0 + errRate * tk) <= cone) pointed = true;
      if (!pointed) continue;
      const dx = dx0 + rvx * tk, dy = dy0 + rvy * tk;
      if (!ISO.noRange && Math.hypot(dx, dy) > range) continue;
      t = tk; break;
    }
    /**
     * HYSTERESIS, and it is the difference between the feature working and the
     * feature existing. Without it the raw condition flickers and the median
     * CONTINUOUS warning before the first round is 0.300 s at every lookahead
     * from 0.5 s to 1.0 s — looking further ahead buys nothing, because what is
     * short is not the prediction but the time the bracket stays up. Once
     * raised, it is held for `BRACKET_HOLD` after the condition last held.
     */
    if (state) {
      const prev = state.get(e.id) || 0;
      if (t >= 0) state.set(e.id, hold);
      else if (prev > 0) { state.set(e.id, prev - dt); t = 0; }
      if (t < 0) { state.delete(e.id); continue; }
    } else if (t < 0) continue;
    list.push({ id: e.id, ent: e, t, live: e.shootingAt === player.id });
  }
  return list;
}

export function drawBrackets(g, model, toScreen, hullPx) {
  const s = { x: 0, y: 0 };
  for (const b of model) {
    const f = b.ent.flight;
    toScreen(f.sx / M, f.sy / M, s);
    const k = 1 - Math.min(1, b.t / TIMING.BRACKET_LEAD);       // 0 far out, 1 at the trigger
    const gap = METRICS.BRACKET_GAP_MAX + (METRICS.BRACKET_GAP_MIN - METRICS.BRACKET_GAP_MAX) * k;
    const r = hullPx * 0.5 + gap;
    const L = METRICS.BRACKET_LEN;
    const col = b.live ? INK.hostileHot : INK.danger;
    for (const [sx, sy] of CORNERS) {
      mark(g, (p) => {
        p.moveTo(s.x + sx * r, s.y + sy * (r - L));
        p.lineTo(s.x + sx * r, s.y + sy * r);
        p.lineTo(s.x + sx * (r - L), s.y + sy * r);
      }, { col, a: INK.tapeMarkA, w: METRICS.BRACKET_W, cap: 'butt' });
    }
  }
}

/* ------------------------------- allegiance glyphs, lead pip, crate pips --- */

/**
 * DESIGN §9.3 / P7 deliverable 8: colour is never the only channel. Hostiles
 * carry a chevron TAB, friendlies a roundel DOT, both at fixed screen size so
 * they survive the zoom-out that eats the silhouette.
 */
export function drawGlyphs(g, contacts, toScreen) {
  const s = { x: 0, y: 0 };
  for (const c of contacts) {
    toScreen(c.x, c.y, s);
    const hostile = c.side !== 1;
    const y = s.y - METRICS.GLYPH_DY;
    mark(g, (p) => {
      if (hostile) {
        p.moveTo(s.x - METRICS.GLYPH_R, y + METRICS.GLYPH_R);
        p.lineTo(s.x, y - METRICS.GLYPH_R);
        p.lineTo(s.x + METRICS.GLYPH_R, y + METRICS.GLYPH_R);
        p.closePath();
      } else {
        p.arc(s.x, y, METRICS.GLYPH_R, 0, Math.PI * 2);
      }
    }, { col: hostile ? INK.hostile : INK.friendly, a: INK.glassA, w: METRICS.HAIRLINE, fill: true });

    // §2.9a: a type glyph, at fixed screen size, only for the ones worth naming
    if (c.mark) {
      g.font = font(METRICS.FONT_SMALL);
      label(g, c.mark, s.x, s.y - METRICS.TYPE_GLYPH_DY, { col: INK.warn, align: 'center' });
    }
  }
}

/**
 * DESIGN §2.6's lead pip. It shows truth; it does not aim. Filled means the
 * solution is inside the cone — that fill is the whole gunnery tutorial.
 */
export function drawLeadPip(g, lead, toScreen, inCone) {
  if (!lead) return;
  const s = { x: 0, y: 0 };
  toScreen(lead.x / M, lead.y / M, s);
  mark(g, (p) => p.arc(s.x, s.y, METRICS.LEAD_R, 0, Math.PI * 2),
       { col: INK.bright, a: INK.glassA, w: METRICS.LEAD_W, fill: !!inCone });
}

/**
 * The crate marker (P6_NOTES §13.1): a gold canopy pip at fixed screen size and,
 * when the assist is on, the dashed predicted-impact line. The prediction comes
 * from `field.predict()` — the same integration the sim and the AI use. There is
 * no second one, and there must not be.
 */
export function drawCratePips(g, crates, toScreen) {
  const s = { x: 0, y: 0 }, e = { x: 0, y: 0 };
  for (const c of crates) {
    toScreen(c.x, c.y, s);
    mark(g, (p) => {
      p.arc(s.x, s.y, METRICS.CRATE_PIP_R, Math.PI, Math.PI * 2);
      p.closePath();
    }, { col: c.enemySide ? INK.hostile : INK.crate, a: INK.glassA, w: METRICS.CRATE_PIP_W });
    if (c.mark) {
      g.font = font(METRICS.FONT_SMALL);
      label(g, c.mark, s.x, s.y + METRICS.CRATE_PIP_R + METRICS.FONT_SMALL * 0.5, { col: INK.crate, align: 'center' });
    }
    if (c.impact) {
      toScreen(c.impact.x, c.impact.y, e);
      /**
       * CAPPED. Drawn to the true impact point the dashed line is a chord right
       * across the frame — the crate is a kilometre up and the impact is off the
       * bottom of the screen — and it reads as the loudest thing in the picture,
       * over a painting, which is exactly what ART §10 forbids. Capped it says
       * "that way, that far" and gets out of the way. The number it encodes is
       * unchanged: the direction is the real prediction from `field.predict`.
       */
      const dx = e.x - s.x, dy = e.y - s.y, d = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, METRICS.PREDICT_MAX / d);
      g.setLineDash([METRICS.PREDICT_DASH, METRICS.PREDICT_DASH]);
      mark(g, (p) => { p.moveTo(s.x, s.y); p.lineTo(s.x + dx * k, s.y + dy * k); },
           { col: INK.crate, a: INK.stickA, w: METRICS.HAIRLINE, outlineA: INK.stickA });
      g.setLineDash([]);
    }
  }
}
