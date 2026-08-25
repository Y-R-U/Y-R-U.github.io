/**
 * Author-time content limits.
 *
 * These are caps on what a human may WRITE, checked when a level or script
 * loads, and they are read from two directions that must never disagree:
 * `js/data/validate.js` refuses the content, and `js/ui/` refuses to draw it.
 *
 * They live in `js/core/` because that is the only place both may import from.
 * `js/data/validate.js` previously reached into `js/ui/layout.js` for this one
 * number — safe (layout.js is pure) but the wrong DIRECTION — and the only
 * alternative was a second copy of `44`, which is the defect the validator
 * exists to prevent (D131, and sky.js's FG_OCCLUDE_MUL before it).
 *
 * Pure by construction: data only.
 */

/**
 * ARCHITECTURE §7.5, hard. A `kind: "radio"` line over this fails the LOAD, in
 * the console and in the debug overlay, at author time rather than play time —
 * `fillText` does not wrap, and a wrapped radio line in a portrait top-third
 * band eats two lines of sky.
 */
export const CARD_MAX_CHARS = 44;
