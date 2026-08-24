/**
 * The ONE table that knows about orientation-dependent numbers.
 * Copied verbatim from ARCHITECTURE §4.1 — the numbers are not re-derived here
 * and must not be tuned here without a DECISIONS entry.
 *
 * A system or HUD widget that reads `view.mode` directly is a bug. If something
 * needs a mode branch it needs a new field in this table, and a line in
 * docs/P2_NOTES.md saying why.
 *
 * `playfield` is the ONE field that is not ARCHITECTURE §4.1 verbatim. It was
 * added under D100 because §4.1's anchors are fractions of the frame while the
 * coaming owns the bottom 14% of the same frame, and the two are incompatible:
 * over a 94 s mission the aeroplane sat inside the coaming and off the right
 * edge. See docs/CAMFIX_NOTES.md.
 */

export const VIEW_PROFILE = {
  portrait: {
    worldH: 1000,               // world units visible vertically at zoom 1.00
    anchorX: 0.34,              // aircraft sits 34% from the left edge
    anchorY: 0.62,              // 62% down: 620 wu (93 m) of sky above, 380 wu below
    anchorYClimb: 0.78,         // eased to when climbing faster than 30 wu/s
    anchorYDive: 0.30,
    anchorYThreatAbove: 0.75,   // a committed diving attacker forces this (§4.4 P2)
    // Both terms were sized for the other orientation and BOTH are now the same
    // fraction of their own frame as landscape's are of theirs.
    //   leadSeconds 0.55 -> 0.27 (D108). 0.55 s at 280 wu/s cruise led the frame
    //     154 wu = 33% of this 462 wu frame; landscape's 0.70 s leads 196 wu =
    //     16% of its 1212. 0.27 s is that same 16%. THIS is the term that was
    //     making the playfield clamp discard lead on 67.9% of ticks.
    //   leadMax 240 -> 162 (D106) = 35% of 462, as landscape's 420 is of 1212.
    //     At 0.27 s it no longer binds in level flight at all — only in a dive
    //     past ~600 wu/s, which is the case a cap is for.
    leadSeconds: 0.27, leadMax: 162,

    // --- the PLAYFIELD (D100). The fraction of the frame the HUD owns nothing
    // permanent in. Every anchor above is a fraction of THIS, not of the frame,
    // and camera.js keeps the aeroplane's own box inside it.
    //   bottom 0.86 = 1 - ART §10's COAM_FRAC 0.14, exactly
    //   left   0.11 = the altitude tape's gutter, (6 + 34) / 390 = 0.103
    //   top    0.05 = under the objective / wind row, 40.6 / 844 = 0.048
    //   right       = `specialSlot.x`, assigned below rather than copied
    playfield: { top: 0.05, right: 0, bottom: 0.86, left: 0.11 },

    // --- zoom anchors. 1.00 = combat framing. Below 1.00 shows MORE world.
    zoomCombat:    1.00,        // the reference. visible 1000 x 462 wu = 150 x 69 m
    zoomIntimate:  1.22,        // alone, slow, landing, story beat. 820 x 379 wu = 123 x 57 m
    zoomWide:      0.78,        // HARD auto floor. 1282 x 592 wu = 192 x 89 m
    zoomEstablish: 0.62,        // CINEMATIC ONLY, outside the auto clamp (§4.3.4)
    zoomFill: 0.85,             // the framing box may fill at most 85% of the frame

    // --- slew, asymmetric. units of zoom per second.
    zoomOutRate: 1.10,          // 1.22 -> 0.78 in 0.40 s
    zoomInRate:  0.22,          // 0.78 -> 1.22 in 2.00 s
    zoomOutK: 9.0, zoomInK: 1.8, // exponential approach constants, 1/s

    // --- hysteresis
    zoomInMargin: 1.18,         // only tighten if the frame is 18% roomier than needed
    zoomInDwell:  0.90,         // ...and has been for this long, continuously
    zoomDeadband: 0.02,         // ignore smaller corrections entirely
    zoomLockRange: 1400,        // 210 m. never tighten past zoomCombat*1.05 with a hostile this
                                //   near, and a hostile inside it is trackable (§4.4 P2)

    hud: 'portrait',
    stickZone:   { x: 0.00, y: 0.45, w: 1.00, h: 0.55 },
    specialSlot: { x: 0.72, y: 0.30, w: 0.24, h: 0.12 },
    altTape:     { side: 'left',  w: 34 },
    radioCard:   { x: 0.00, y: 0.06, w: 1.00, h: 0.14 },   // top third, non-blocking
  },
  landscape: {
    worldH: 560,
    anchorX: 0.30, anchorY: 0.55, anchorYClimb: 0.70, anchorYDive: 0.34,
    anchorYThreatAbove: 0.66,
    leadSeconds: 0.70, leadMax: 420,

    // bottom 0.86 = the same COAM_FRAC 0.14; the coaming is split into two
    // corners here but the band it occupies is the same one. left / top clear
    // the radio card's corner; right is `specialSlot.x` (which is inboard of
    // the tape at 808 / 844 = 0.957), assigned below.
    playfield: { top: 0.06, right: 0, bottom: 0.86, left: 0.03 },

    zoomCombat: 1.00, zoomIntimate: 1.22, zoomWide: 0.78, zoomEstablish: 0.42,
    zoomFill: 0.85,
    zoomOutRate: 1.10, zoomInRate: 0.22, zoomOutK: 9.0, zoomInK: 1.8,
    zoomInMargin: 1.18, zoomInDwell: 0.90, zoomDeadband: 0.02, zoomLockRange: 1400,

    hud: 'landscape',
    stickZone:   { x: 0.00, y: 0.30, w: 0.46, h: 0.70 },   // handedness-mirrored
    specialSlot: { x: 0.82, y: 0.62, w: 0.14, h: 0.22 },
    altTape:     { side: 'right', w: 30 },
    radioCard:   { x: 0.02, y: 0.06, w: 0.42, h: 0.16 },   // top-left, non-blocking
  },
};

// Persistent user preference (save.settings.zoomBias). NOT a per-moment control.
export const ZOOM_BIAS = { tight: +0.10, normal: 0.00, wide: -0.08 };

/* --- P2 additions, and D100's `playfield`. Everything above this line is
       §4.1 verbatim except that one field. -------------------------------- */

/**
 * The playfield's right edge IS the special's left edge, DERIVED rather than
 * copied. The special is the one permanent widget that sits inside the column
 * instead of in a band at an edge, so it is the one the camera cannot dodge by
 * clamping a rectangle unless the rectangle stops there — it was the last 49
 * frames of H5 once the coaming and the tape were clear. Written this way so
 * that moving the special moves the camera's bound with it: a copied 0.72 would
 * go stale silently and H5 would fail for a reason nobody would connect to it.
 */
for (const P of Object.values(VIEW_PROFILE)) P.playfield.right = P.specialSlot.x;

/** Stick radius, css px. R-12: DESIGN §2.2's 0.208-of-width, keeping the ported floor. */
export const STICK_R_FRAC = 0.208;
export const STICK_R_MIN = 36;
export const stickRadius = (viewW) => Math.max(STICK_R_MIN, viewW * STICK_R_FRAC);

/** Resolve a normalised profile rect to css px, safe-area insets applied. */
export function slotRect(rect, view, out) {
  const s = view.safe || { top: 0, right: 0, bottom: 0, left: 0 };
  const x0 = s.left, y0 = s.top;
  const w = Math.max(1, view.w - s.left - s.right);
  const h = Math.max(1, view.h - s.top - s.bottom);
  const o = out || {};
  o.x = x0 + rect.x * w;
  o.y = y0 + rect.y * h;
  o.w = rect.w * w;
  o.h = rect.h * h;
  return o;
}
