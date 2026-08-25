/**
 * The HUD grid — ARCHITECTURE §4.1: named slots resolved from `VIEW_PROFILE`,
 * in normalised units, with the safe-area insets applied.
 *
 * THIS IS THE ONLY FILE IN `js/ui/` THAT MAY CONTAIN A NUMBER.
 * §4.1: "a HUD widget that contains a literal pixel offset is a bug", and gate
 * H1 greps for exactly that. Every scalar any other ui module needs — a stroke
 * weight, a font size, a radius, a duration, a range — is named here and
 * imported. If you find yourself typing a number in `hud.js`, it belongs in
 * `METRICS` with a name that says what it is.
 *
 * Nothing here reads `view.mode`. Orientation arrives as `view.profile`, which
 * is the one table that knows (§4.1). A mode branch anywhere else is a bug.
 *
 * Pure: node imports this to check the tape and the slots without a browser.
 */

import { VIEW_PROFILE, slotRect } from '../core/viewprofile.js';
import { GROUND_WU, CEILING_WU } from '../core/bands.js';
import { CARD_MAX_CHARS } from '../core/content.js';

/* ------------------------------------------------------------------ px --- */

/**
 * Every pixel scalar in the HUD. Grouped by the element that owns it.
 *
 * `*_FRAC` values are fractions of the safe playfield, not of the window: the
 * safe area is what the player can actually see on a notched phone, and a
 * fraction of the window puts the coaming under the home indicator.
 */
export const METRICS = Object.freeze({
  /* --- the contrast rule, ART §10, stated once ------------------------- */
  OUTLINE_W: 2,             // the 2 px dark outline, offset 0,0 — an outline, not a shadow
  INNER_W: 1,               // the 1 px light inner edge, for mid-luminance fills only
  HAIRLINE: 1,

  /* --- type ------------------------------------------------------------ */
  FONT_MIN: 15,             // DESIGN §9.3: minimum on-screen text size, logical px
  FONT_LABEL: 15,           // band names, STRESS, the card
  FONT_SMALL: 15,           // numerals on the tape
  FONT_BANNER: 17,          // the <=3-word objective
  TRACK_LABEL: 1.2,         // letter-spacing, px — a stencil face needs air

  /* --- the altitude tape ----------------------------------------------- */
  TAPE_GUTTER: 6,           // from the safe edge to the tape body
  TAPE_TOP_FRAC: 0.22,      // starts below the radio card band
  TAPE_BOT_PAD: 10,         // clear of the coaming
  TAPE_BAND_LINE: 1,        // the boundary rule between two bands
  TAPE_LABEL_DX: 5,         // band name, from the tape's inner edge
  TAPE_MARK_W: 13,          // the player's brass chevron, half-width
  TAPE_MARK_H: 7,
  TAPE_PIP_R: 4,            // an off-screen threat or crate pip
  TAPE_PIP_DX: 4,           // pips ride just outside the tape body
  TAPE_ENERGY_W: 9,         // the energy chevron (DESIGN §2.7) — where you could zoom to
  TAPE_CONCORD_H: 12,       // the Concord Line, drawn ABOVE the playable column
  TAPE_CONCORD_DASH: 3,
  TAPE_WINDOW_W: 3,         // the bracket showing what the viewport currently holds
  TAPE_ICON_R: 3,           // each band's signature mark

  /* --- edge chevrons ---------------------------------------------------- */
  CHEV_MAX: 3,              // ART §10 / H8: merge the nearest three, drop the rest
  CHEV_INSET: 12,           // from the safe edge to the chevron's tip
  CHEV_LEN_MIN: 10,         // far contact
  CHEV_LEN_MAX: 22,         // near contact
  CHEV_HALF: 7,             // half-height of the arrow
  CHEV_TICK: 6,             // the above/below tick
  CHEV_MERGE_PX: 26,        // two chevrons closer than this on the edge become one
  CHEV_COUNT_DX: 9,

  /* --- the fixed-screen-size overlay ------------------------------------ */
  BRACKET_LEN: 9,           // one arm of the converging threat bracket
  BRACKET_GAP_MAX: 16,      // it converges from this gap...
  BRACKET_GAP_MIN: 3,       // ...to this, over BRACKET_LEAD seconds
  BRACKET_W: 2,
  BRACKET_STEPS: 6,       // forward substeps when predicting a firing solution
  BRACKET_CONE_K: 1.6,    // the WARNING cone, as a multiple of the enemy's FIRING cone
  GLYPH_R: 4,               // hostile chevron tab / friendly roundel dot
  GLYPH_DY: 14,             // above the sprite
  TYPE_GLYPH_DY: 26,        // §2.9a's 10 px type glyph, above the allegiance glyph
  LEAD_R: 6,                // the lead pip
  LEAD_W: 2,
  CRATE_PIP_R: 7,
  CRATE_PIP_W: 2,
  PREDICT_DASH: 5,          // the dashed predicted-impact line
  PREDICT_MAX: 190,         // ...capped, so it hints a direction rather than
                            //    drawing a chord across the whole painting
  LABEL_PAD: 3,             // collision padding when a tape label is suppressed

  /* --- the coaming ------------------------------------------------------ */
  COAM_FRAC: 0.14,          // ART §10: the bottom 14% of the portrait frame
  COAM_PAD: 10,
  ARC_R: 46,                // the speed arc
  ARC_W: 5,
  ARC_NEEDLE: 40,
  ARC_GHOST_W: 2,           // the ghost energy needle
  ARC_TICK: 5,
  ARC_TICKS: 10,            // major graduations across the arc
  ARC_VMAX: 100,            // m/s at the top of the arc — nothing flies faster than this
  ARC_DIVE_M: 150,          // the ghost needle spends one portrait screen of sky
  BELT_H: 12,               // the ammo belt
  BELT_TICK_W: 3,
  BELT_GAP: 2,
  BELT_TICKS: 24,
  BELT_LOW_FRAC: 0.2,       // below this the remaining ticks take the act accent
  ENG_W: 34,                // the engine gauge
  ENG_H: 8,
  STRESS_W: 46,
  STRESS_H: 6,

  /* --- the radio card, the banner, the special -------------------------- */
  CARD_PAD_X: 14,
  CARD_PAD_Y: 8,
  CARD_RULE: 2,             // the speaker's colour, as a rule down the leading edge
  // §7.5, hard — a wrapped radio line eats two lines of sky. The VALUE lives in
  // js/core/content.js so js/data/validate.js can refuse the same line this
  // refuses to draw, without js/data importing js/ui (P9 REQUEST-8).
  CARD_MAX_CHARS,
  BANNER_Y_FRAC: 0.022,
  BANNER_H: 22,
  WIND_W: 60,               // DESIGN §2.7
  WIND_H: 18,
  WIND_ARROW: 9,
  SPECIAL_RING_W: 3,
  SPECIAL_PAD: 6,

  /* --- the stick -------------------------------------------------------- */
  STICK_RING_W: 2,
  STICK_THUMB_R: 15,
  STICK_TRACK_W: 1,
  THUMB_DISC: 165,          // H11: a 44 mm thumb contact, in css px
});

/** Slots §4.1's profile does not already carry. Normalised to the safe playfield. */
/**
 * The only slot §4.1's profile does not carry is the top row, and it is derived
 * from the profile's own `radioCard` rather than authored — see `resolveLayout`.
 */
export const SLOTS = Object.freeze({});

/** Everything time-shaped. §7.5's card duration is the load-bearing one. */
export const TIMING = Object.freeze({
  CARD_BASE: 1.1,           // seconds
  CARD_CPS: 13.5,           // ~160 wpm
  CARD_MIN: 1.6,
  CARD_MAX: 7.0,
  CARD_FADE: 0.22,
  BRACKET_LEAD: 0.5,        // DESIGN §3.6 rule 1: 0.5 s of warning, always
  BRACKET_HOLD: 0.45,       // ...and it must be CONTINUOUSLY up for that long
  PIP_FADE: 0.18,
  CREST_PULSE: 0.7,         // Hz — the crate pulse, DESIGN §2.7's colour law
  PREDICT_SECS: 400,        // how far `field.predict` integrates a crate's fall
});

/**
 * Ranges, in world units, that the HUD asks the world about. They are NOT
 * re-declared numbers: `PIP_RANGE_WU` is the camera's own `zoomLockRange`,
 * imported rather than copied, because D72 cost a whole gate to a harness that
 * kept a second copy of a renderer constant and let it drift.
 *
 * P8c: this was a frozen module constant reading `VIEW_PROFILE.portrait`
 * BY NAME, in both orientations — the same class of bug the paragraph above
 * warns about, one line under it. Harmless while both profiles carry 1400, and
 * a silent portrait dependency the moment D120's derived admission radius is
 * per-profile. It is now a function of the profile and `resolveLayout` attaches
 * the result as `L.ranges`.
 */
export const rangesFor = (profile) => ({
  PIP_RANGE_WU: profile.zoomLockRange,
  CHEV_RANGE_WU: profile.zoomLockRange * 2,
});

/**
 * The `?hudbug=framepip` break-switch's window — "a pip derived from the FRAME".
 * It lives HERE, with the other absolute metrics, because H1 forbids px literals
 * anywhere else and because there were two copies of it: the harness's was
 * repaired and `js/ui/hud.js`'s was not, which is a break-switch that goes red in
 * the test and stays green in the browser (P8c).
 *
 * It was a flat `CHEV_MERGE_PX` 26 tape-px. The tape is 53.0 px per 1,000 wu in
 * portrait and 24.0 in landscape, so 26 px is 490 wu of column in portrait and
 * 1,083 wu in landscape — nearly TWICE landscape's whole frame. A substitute
 * WIDER than the frame warns EARLIER than the frame, so H7 cannot tell it from
 * the tape and the switch stays green. A break-switch that cannot go red in the
 * primary orientation is worse than none.
 *
 * So: the same fraction of each profile's own column. Portrait is the reference
 * and reproduces its shipped 26.00 px exactly.
 */
const TAPE_SPAN_WU = GROUND_WU - CEILING_WU;
const REF_W = 390, REF_H = 844;
// Memoised on first use, not at module scope: `resolveLayout` and the helpers
// it closes over are declared below this point.
let FRAMEPIP_FRAC = 0;
export function framePipWindowPx(view, tapeRect) {
  if (!FRAMEPIP_FRAC) {
    const P = VIEW_PROFILE.portrait;
    const ref = { mode: 'portrait', w: REF_W, h: REF_H, dpr: 2, profile: P, worldH: P.worldH,
                  worldW: REF_W / (REF_H / P.worldH), scale: REF_H / P.worldH,
                  safe: { top: 0, right: 0, bottom: 0, left: 0 } };
    FRAMEPIP_FRAC = METRICS.CHEV_MERGE_PX / (resolveLayout(ref).tape.h / TAPE_SPAN_WU) / P.worldH;
  }
  return FRAMEPIP_FRAC * view.worldH * (tapeRect.h / TAPE_SPAN_WU);
}

/* -------------------------------------------------------------- resolve --- */

const rect = (x, y, w, h) => ({ x, y, w, h });
const tmp = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Resolve every named slot for the current view. Returns css-px rects with the
 * origin at the top-left of the WINDOW (the safe inset is already inside them),
 * plus `elements`, the flat list gates H2/H4/H5 walk.
 *
 * `out` is reused across frames. It is the caller's object and nobody else
 * retains it — D85's shared-buffer defect appeared twice in one phase, both
 * times because somebody kept the reference.
 */
export function resolveLayout(view, out = null, o = null) {
  const P = view.profile || VIEW_PROFILE.portrait;
  const s = view.safe || { top: 0, right: 0, bottom: 0, left: 0 };
  const L = out || {};

  const px = s.left, py = s.top;
  const pw = Math.max(1, view.w - s.left - s.right);
  const ph = Math.max(1, view.h - s.top - s.bottom);
  L.play = rect(px, py, pw, ph);
  L.hud = P.hud;
  L.ranges = rangesFor(P);

  /* --- coaming. One strip in portrait, two corners in landscape (ART §10) */
  const coamH = ph * METRICS.COAM_FRAC;
  const coamY = py + ph - coamH;
  const split = P.hud !== 'portrait';
  const coamW = split ? pw * (SPLIT_FRAC) : pw;
  L.coaming = rect(px, coamY, coamW, coamH);
  L.coaming2 = split ? rect(px + pw - coamW, coamY, coamW, coamH) : null;

  const inner = split ? L.coaming2 : L.coaming;
  L.arc = {
    cx: L.coaming.x + METRICS.COAM_PAD + METRICS.ARC_R,
    cy: L.coaming.y + coamH - METRICS.COAM_PAD,
    r: METRICS.ARC_R,
  };
  L.arcBox = rect(L.arc.cx - METRICS.ARC_R, L.arc.cy - METRICS.ARC_R,
                  METRICS.ARC_R * 2, METRICS.ARC_R);

  L.engine = rect(inner.x + inner.w - METRICS.COAM_PAD - METRICS.ENG_W,
                  inner.y + inner.h - METRICS.COAM_PAD - METRICS.ENG_H,
                  METRICS.ENG_W, METRICS.ENG_H);
  L.stress = rect(inner.x + inner.w - METRICS.COAM_PAD - METRICS.STRESS_W,
                  L.engine.y - METRICS.COAM_PAD - METRICS.STRESS_H,
                  METRICS.STRESS_W, METRICS.STRESS_H);

  const beltX = split ? inner.x + METRICS.COAM_PAD
                      : L.arcBox.x + L.arcBox.w + METRICS.COAM_PAD;
  L.belt = rect(beltX, inner.y + METRICS.COAM_PAD,
                Math.max(METRICS.BELT_TICK_W, L.stress.x - METRICS.COAM_PAD - beltX),
                METRICS.BELT_H);

  /* --- the altitude tape. Width and side come from the profile ---------- */
  /**
   * `o.side` is an explicit CALLER override and exists for one reason: ART §10
   * ("pinned to the RIGHT screen edge"), DESIGN §2.7 ("right edge, 26 px") and
   * ARCHITECTURE §4.1 (`portrait.altTape.side: 'left'`) disagree, and the
   * profile's own `anchorX 0.34` plus a rightward velocity lead puts the
   * aeroplane at x ~ 9 px, directly on top of a left-hand tape. Gate H5 reads
   * 100% of frames occluded. The profile still wins by default; the override is
   * how P7 and P8 measure both without a widget reading `view.mode`. See
   * P7_NOTES REQUEST-1.
   */
  const tw = P.altTape.w;
  const left = (o && o.side ? o.side : P.altTape.side) === 'left';
  const tapeTop = py + ph * METRICS.TAPE_TOP_FRAC;
  L.tape = rect(left ? px + METRICS.TAPE_GUTTER : px + pw - METRICS.TAPE_GUTTER - tw,
                tapeTop, tw, Math.max(tw, coamY - METRICS.TAPE_BOT_PAD - tapeTop));
  L.tape.side = left ? 'left' : 'right';
  // labels hang toward the middle of the screen, never off the edge
  L.tape.labelX = left ? L.tape.x + tw + METRICS.TAPE_LABEL_DX
                       : L.tape.x - METRICS.TAPE_LABEL_DX;
  L.tape.labelAlign = left ? 'left' : 'right';
  L.tape.pipX = left ? L.tape.x - METRICS.TAPE_PIP_DX : L.tape.x + tw + METRICS.TAPE_PIP_DX;

  /* --- profile slots ---------------------------------------------------- */
  slotRect(P.radioCard, view, tmp);
  L.card = rect(tmp.x, tmp.y, tmp.w, tmp.h);
  slotRect(P.specialSlot, view, tmp);
  L.special = rect(tmp.x, tmp.y, tmp.w, tmp.h);
  L.special.cx = tmp.x + tmp.w * 0.5;
  L.special.cy = tmp.y + tmp.h * 0.5;
  L.special.r = Math.min(tmp.w, tmp.h) * 0.5 - METRICS.SPECIAL_PAD;
  slotRect(P.stickZone, view, tmp);
  L.stickZone = rect(tmp.x, tmp.y, tmp.w, tmp.h);
  /**
   * The objective banner and the wind share ONE top row, and where that row
   * goes is derived from the card's own slot rather than from the orientation.
   * If the card leaves a tall enough gap above it, the row sits in that gap
   * (portrait: 32 px of gap, so it does). If it does not, the row sits beside
   * the card, in the width the card is not using (landscape: the card is 0.42
   * of the width and starts 23 px down, so a 17 px banner above it overlapped —
   * caught by H2b, which the P7 brief does not have).
   */
  const rowY = py + ph * METRICS.BANNER_Y_FRAC;
  const gap = L.card.y - rowY - METRICS.LABEL_PAD;
  let row;
  if (gap >= METRICS.FONT_BANNER) {
    row = rect(px, rowY, pw, Math.min(METRICS.BANNER_H, gap));
  } else {
    const x0 = L.card.x + L.card.w + METRICS.LABEL_PAD;
    row = rect(x0, L.card.y, Math.max(METRICS.WIND_W, px + pw - x0), Math.min(METRICS.BANNER_H, L.card.h));
  }
  L.wind = rect(row.x + row.w - METRICS.WIND_W, row.y, METRICS.WIND_W, row.h);
  const bw = Math.max(METRICS.WIND_W, L.wind.x - METRICS.LABEL_PAD - row.x);
  L.banner = rect(row.x + (row.w - METRICS.WIND_W - METRICS.LABEL_PAD - bw) * 0.5, row.y, bw, row.h);

  /* --- the flat list the gates walk ------------------------------------- */
  const els = L.elements || (L.elements = []);
  els.length = 0;
  els.push({ id: 'tape', ...L.tape });
  els.push({ id: 'coaming', ...L.coaming });
  if (L.coaming2) els.push({ id: 'coaming2', ...L.coaming2 });
  els.push({ id: 'arc', ...L.arcBox });
  els.push({ id: 'belt', ...L.belt });
  els.push({ id: 'engine', ...L.engine });
  els.push({ id: 'stress', ...L.stress });
  els.push({ id: 'card', ...L.card });
  // the ELEMENT is the drawn ring; `L.special` stays the profile slot because
  // that is the touch target and H2 checks it against the profile
  els.push({ id: 'special', x: L.special.cx - L.special.r - METRICS.SPECIAL_RING_W,
             y: L.special.cy - L.special.r - METRICS.SPECIAL_RING_W,
             w: (L.special.r + METRICS.SPECIAL_RING_W) * 2,
             h: (L.special.r + METRICS.SPECIAL_RING_W) * 2 });
  els.push({ id: 'banner', ...L.banner });
  els.push({ id: 'wind', ...L.wind });
  return L;
}

/** ART §10: in landscape the coaming splits into two bottom corners. */
const SPLIT_FRAC = 0.34;

/** Does `r` sit inside the safe playfield? Gate H2. */
export const insideSafe = (r, L) =>
  r.x >= L.play.x - 0.5 && r.y >= L.play.y - 0.5 &&
  r.x + r.w <= L.play.x + L.play.w + 0.5 &&
  r.y + r.h <= L.play.y + L.play.h + 0.5;

export const overlaps = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
