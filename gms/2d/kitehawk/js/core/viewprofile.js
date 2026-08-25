/**
 * The ONE table that knows about orientation-dependent numbers.
 * Copied verbatim from ARCHITECTURE §4.1 — the numbers are not re-derived here
 * and must not be tuned here without a DECISIONS entry.
 *
 * A system or HUD widget that reads `view.mode` directly is a bug. If something
 * needs a mode branch it needs a new field in this table, and a line in
 * docs/P2_NOTES.md saying why.
 *
 * TWO fields here are not ARCHITECTURE §4.1 verbatim, and each has a decision:
 *
 *   `playfield` (D100) — §4.1's anchors are fractions of the frame while the
 *     coaming owns the bottom 14% of the same frame, and the two are
 *     incompatible: over a 94 s mission the aeroplane sat inside the coaming and
 *     off the right edge. See docs/CAMFIX_NOTES.md.
 *   `admitWu` (D129) — the framing box's admission radius, split out of
 *     `zoomLockRange` by D120 and made PER PROFILE here for the reason D104
 *     made `playfield` per-mode: the right value genuinely differs. See below.
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
                                //   near. NOT the framing box's admission radius — see admitWu.

    /**
     * THE FRAMING BOX'S ADMISSION RADIUS (D120, per-profile under D129).
     *
     * A hostile is a framing SUBJECT if the camera must already have him in
     * frame by the time he can shoot. Whether he is merely TRACKABLE is the
     * altitude tape's and the edge chevrons' job (§4.2) — conflating the two in
     * one 1400 wu constant made `boxW` a restatement of the radius (p90 935.6 wu
     * against a 585 wu pivot signal) and failed P0 in both orientations.
     *
     *     admit = gunRange + closing_p90 * t_widen
     *           = 440 + 618 * 0.400 = 687.4 wu  ->  700 wu
     *
     *   gunRange    440 wu, §4.3.5
     *   closing_p90 618 wu/s, p90 of the closing rate on the ticks where the
     *               admission rule's own `closing > closingWu 120` holds —
     *               13,969 of 52,016 engaged ticks over 16 duels (D115)
     *   t_widen     0.400 s, measured off camera.js driving zoomIntimate to the
     *               clamp floor; the zoomOutRate cap binds, (1.22-0.78)/1.10
     *
     * It is decisive HERE and only here: portrait P0 goes -0.3615 FAIL to
     * +0.1583 PASS. Landscape's is a different number for a measured reason —
     * see the assignment below the table.
     */
    admitWu: 700,

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
    // leadSeconds 0.70 -> 0.39 (P8c). D108 fitted this as a fraction of frame
    // WIDTH and applied it to `leadY` as well; landscape's frame is 0.56x as
    // tall as portrait's, so the vertical lead outran its own headroom on 28%
    // of engaged ticks and the aeroplane sat pinned against the playfield edge
    // in every dive — D106's "pinned against the bound" defect, on the other
    // axis. Derived, not fitted: a lead above `headroom / |v|` is discarded by
    // the clamp and buys nothing, so
    //   leadSeconds <= min over axes of ( headroom_axis / v_axis,p90 )
    //   x 255.22/404 = 0.631   climb 108.32/237 = 0.457   DIVE 124.90/317 = 0.394
    // p90 over engaged ticks is the gate's own percentile (§4.4.2 P0). Rounded
    // DOWN because it is an upper bound. tools/p8clead.mjs is the derivation.
    // The x budget is 1.6x the dive budget and is left unspent — see P8C_NOTES
    // REQUEST-3, which asks for the per-axis pair this scalar cannot express.
    leadSeconds: 0.39, leadMax: 420,

    // bottom 0.86 = the same COAM_FRAC 0.14; the coaming is split into two
    // corners here but the band it occupies is the same one. left clears the
    // radio card's corner; right is `specialSlot.x` (which is inboard of the
    // tape at 808 / 844 = 0.957), assigned below.
    //   top 0.06 -> 0.12 (P8c). 0.06 was NOT portrait's derivation carried: it
    //     was a DIFFERENT rule — it cleared the radio card's TOP (it is exactly
    //     `radioCard.y`), where portrait's clears the objective row's BOTTOM.
    //     The card is non-blocking; the banner is not, and in landscape
    //     `resolveLayout` puts the row BESIDE the card at the card's own y, so
    //     the banner sat inside the playfield and the camera put the aeroplane
    //     under it on 23.9% of frames. Portrait's rule, applied here:
    //       top >= (banner row bottom) / H = radioCard.y + BANNER_H / H
    //                                      = 0.06 + 22 / 390 = 0.1164 -> 0.12
    //     which is the same rounding-up-to-2dp that turns portrait's 40.57/844
    //     = 0.0481 into 0.05.
    playfield: { top: 0.12, right: 0, bottom: 0.86, left: 0.03 },

    // zoomWide 0.78 -> 0.74 (D128). P0's window is `containH - zoomWide` and
    // landscape's ceiling is pinned at 0.8137 by the 585 wu dive recovery, so
    // the floor is the ONLY term that widens it: 0.0337 -> 0.0737 against a
    // 0.06 bar. The cost lands on P3, which the enemy hull buys back
    // (MIN_ENEMY_HULL_WU, D128) — the two move in opposite directions and were
    // solved together (D127). Guarded by tools/p3guard.mjs.
    zoomCombat: 1.00, zoomIntimate: 1.22, zoomWide: 0.74, zoomEstablish: 0.42,
    zoomFill: 0.85,
    zoomOutRate: 1.10, zoomInRate: 0.22, zoomOutK: 9.0, zoomInK: 1.8,
    zoomInMargin: 1.18, zoomInDwell: 0.90, zoomDeadband: 0.02, zoomLockRange: 1400,
    admitWu: 0,                 // = zoomLockRange (D129), assigned below rather than copied

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

/**
 * D129 — LANDSCAPE ADMITS EVERYTHING IT CAN TRACK, and that is a measurement.
 *
 * Portrait's 700 wu is derived above and it is worth what it costs there. In
 * landscape the same radius buys NOTHING and costs the quantity the pivot was
 * decided on:
 *
 *   landscape P0 in-clamp at admit 440 / 585 / 700 / 935 / 1400
 *     = 0.0737 at EVERY ONE of them, to four decimals
 *
 * because landscape's containment is HEIGHT-bound — the ceiling is pinned at
 * 0.8137 by the 585 wu dive recovery while the width term runs 1.10 to 2.46 and
 * never binds (D124). Landscape's 0.0337 -> 0.0737 came entirely from D128's
 * clamp floor, not from the admission radius. Meanwhile narrowing it to 700
 * costs 0.53 s of in-frame warning (P2 median 1.23 -> 0.70 s), which is the
 * number D121/D123 pivoted on.
 *
 * So landscape admits at its full lock range: DERIVED from `zoomLockRange`
 * rather than copied, so that separating the two jobs further cannot silently
 * re-merge them — the same reason `playfield.right` is assigned from
 * `specialSlot.x` above.
 */
VIEW_PROFILE.landscape.admitWu = VIEW_PROFILE.landscape.zoomLockRange;

/**
 * Stick radius, css px. R-12: DESIGN §2.2's 0.208, keeping the ported floor.
 *
 * P8c — the fraction is now taken of the STICK ZONE's shorter side, not of
 * `view.w`. `view.w` is the SHORT edge in portrait and the LONG edge in
 * landscape, so landscape's radius came out 175.55 px inside a 273 px-tall
 * zone: the thumb reached 39.7% of full nose-down deflection before running out
 * of zone, and H12 read BETTER for it because a clamped thumb travels less
 * (P8b §8.2, the fifth believable-wrong metric on this project).
 *
 * DESIGN's 0.208 was a fraction of a portrait canvas whose stick zone IS the
 * full width and the short side, so `min(zone.w, zone.h)` reproduces portrait
 * EXACTLY — 0.208 x 390 = 81.12 px, unchanged to the digit. That is the whole
 * argument for this form: it is portrait-neutral by construction, and it is the
 * fix `P2_NOTES` §R-12 wrote and P7's T8 did not make.
 */
export const STICK_R_FRAC = 0.208;
export const STICK_R_MIN = 36;
const _stickZone = { x: 0, y: 0, w: 0, h: 0 };
export const stickRadius = (view) => {
  const z = slotRect(view.profile.stickZone, view, _stickZone);
  return Math.max(STICK_R_MIN, Math.min(z.w, z.h) * STICK_R_FRAC);
};

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
