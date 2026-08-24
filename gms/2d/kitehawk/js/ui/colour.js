/**
 * sRGB, luminance and WCAG contrast. A codec, not a widget.
 *
 * It lives in its own file for one reason: gate H1 forbids a pixel number
 * anywhere in `js/ui/` outside `layout.js`, and a hex parser is unavoidably full
 * of 255s and 16s that are radices and byte masks rather than offsets. Splitting
 * it out keeps H1 mechanically strict over every file that can DRAW, instead of
 * softening the rule with an allowlist of syntax. This file imports nothing from
 * `layout.js`, never touches a canvas context, and `hudcheck.mjs` asserts both.
 *
 * `tools/hudcheck.mjs` measures H3 by importing these functions. It does not
 * keep its own copy of the contrast formula (D72).
 */

const HEX = /^#?([0-9a-f]{6})$/i;

export function srgb(hex) {
  const m = HEX.exec(String(hex).trim());
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const hex = (c) =>
  '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

const chan = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };

/** WCAG relative luminance of an sRGB triple. */
export const lum = (c) => 0.2126 * chan(c[0]) + 0.7152 * chan(c[1]) + 0.0722 * chan(c[2]);

/** WCAG contrast ratio, 1..21. */
export function contrast(a, b) {
  const la = lum(a), lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** src over dst at alpha a. */
export const composite = (src, dst, a) => [
  src[0] * a + dst[0] * (1 - a), src[1] * a + dst[1] * (1 - a), src[2] * a + dst[2] * (1 - a),
];

/** A hex plus an alpha, as a 2d-context colour string. */
export function rgba(h, a) {
  const c = srgb(h);
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}

/** Lerp two hexes in sRGB. Good enough for a 34 px strip. */
export const mixHex = (a, b, t) => {
  const A = srgb(a), B = srgb(b);
  return hex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
};
