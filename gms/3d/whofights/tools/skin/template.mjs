#!/usr/bin/env node
// Emits the two template images from tools/skin/layout.mjs, so both regenerate the moment the rig
// changes shape.
//
//   art/skin/uv_guide.png   labelled, colour-coded. For a human, and as a test texture: apply it
//                           to the dummy and a wrong island is obvious in one render.
//   art/skin/pose_ref.png   the same projection with nothing written on it — a shaded grey
//                           mannequin, front left, back right. THIS is what Flux is given.
//
//   node tools/skin/template.mjs

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Canvas } from './raster.mjs';
import { ATLAS, PARTS, PANEL, REGIONS, SCALE, faces, px } from './layout.mjs';

// A blank egg loses to "do not change the outline" and comes back a blank grey mask (SKIN.md §7),
// so the front head gets a relief: a brow, a nose and a jaw as light and shadow only. Deltas on the
// grey the rig already shaded, never marks — an eye or a mouth here would be a face every character
// then inherits, and the point is an anchor, not a portrait.
const RELIEF = [
  // [delta, y centre, y sigma, u shape]  — u is −1…1 across the head, negative is the lit side.
  [+22, 1.688, 0.016, u => plateau(u, 0.55)],                       // brow ridge
  [-26, 1.656, 0.018, u => bump(Math.abs(u), 0.42, 0.26)],          // the two sockets under it
  [+24, 1.645, 0.042, u => bump(u, -0.06, 0.085)],                  // nose, lit side
  [-22, 1.645, 0.042, u => bump(u, 0.10, 0.085)],                   // nose, shadow side
  [-16, 1.598, 0.012, u => plateau(u, 0.20)],                       // under the tip
  [+10, 1.630, 0.030, u => bump(u, -0.62, 0.18) + 0.5 * bump(u, 0.62, 0.18)],  // cheekbones
  [-18, 1.548, 0.024, u => bump(Math.abs(u), 0.64, 0.22)],          // jaw, back to the ear
  [+14, 1.556, 0.020, u => plateau(u, 0.28)],                       // chin
  [-20, 1.518, 0.014, u => plateau(u, 0.45)],                       // under the chin
];

const bump = (v, c, s) => Math.exp(-((v - c) ** 2) / (2 * s * s));
const plateau = (v, half) => Math.exp(-((v / half) ** 4));

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = resolve(ROOT, 'art/skin');

const PART_COLOUR = {
  head: [232, 196, 120], torso: [122, 178, 210], armR: [176, 208, 132], armL: [176, 208, 132],
  legR: [206, 148, 176], legL: [206, 148, 176], footR: [150, 150, 176], footL: [150, 150, 176],
};

// Both panels come from the same rig, so one scanline walk over the parts draws either of them.
// `shade` gets a −1…1 across the part's width, which is what makes the pose reference read as a
// rounded body rather than a paper cut-out.
function scanParts(cv, back, shade) {
  const order = ['legR', 'legL', 'footR', 'footL', 'torso', 'armR', 'armL', 'head'];
  const all = [];
  for (const part of PARTS) {
    for (const flip of part.mirror ? [1, -1] : [1]) {
      all.push({ id: flip === 1 ? part.id : part.mirror, base: part.id,
        sections: part.sections.map(s => ({ ...s, x: s.x * flip })) });
    }
  }
  all.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  for (const p of all) {
    const ys = p.sections.map(s => s.y);
    const lo = Math.min(...ys), hi = Math.max(...ys);
    const rowTop = Math.floor(PANEL.feetRow - hi * SCALE);
    const rowBot = Math.ceil(PANEL.feetRow - lo * SCALE);
    for (let row = rowTop; row <= rowBot; row++) {
      const y = (PANEL.feetRow - row) / SCALE;
      const s = sectionAt(p.sections, y);
      if (!s) continue;
      const [xa] = px(s.x - s.w / 2, y, back);
      const [xb] = px(s.x + s.w / 2, y, back);
      const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb);
      for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
        const t = ((x + 0.5) - (x0 + x1) / 2) / Math.max(1, (x1 - x0) / 2);
        if (Math.abs(t) > 1.02) continue;
        cv.px(x, row, shade(p, t, y, back));
      }
    }
  }
}

function sectionAt(sections, y) {
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i], b = sections[i + 1];
    const [lo, hi] = a.y < b.y ? [a, b] : [b, a];
    if (y < lo.y - 1e-6 || y > hi.y + 1e-6) continue;
    const t = (y - lo.y) / Math.max(1e-6, hi.y - lo.y);
    return { x: lo.x + (hi.x - lo.x) * t, w: lo.w + (hi.w - lo.w) * t, d: lo.d + (hi.d - lo.d) * t };
  }
  return null;
}

// ---------------------------------------------------------------- pose reference

export function poseRef({ relief = true } = {}) {
  const cv = new Canvas(ATLAS.w, ATLAS.h, [255, 255, 255, 255]);
  const lit = (t, back) => {
    // Key from the upper front-left of the sheet; the back panel is mirrored, so the light is too,
    // or the two halves come back lit from opposite sides and Flux paints two different characters.
    const n = Math.max(0, Math.min(1, (t * (back ? 1 : -1) + 1) / 2));
    const round = Math.sqrt(Math.max(0, 1 - t * t));
    return 118 + 88 * (0.35 + 0.65 * n) * (0.45 + 0.55 * round);
  };
  scanParts(cv, false, (p, t) => { const g = lit(t, false) | 0; return [g, g, g + 4]; });
  scanParts(cv, true, (p, t) => { const g = lit(t, true) | 0; return [g, g, g + 4]; });
  if (relief) faceRelief(cv);
  return cv;
}

// Front panel only — the back of a head has no features, and painting them there would ask Flux for
// a second face. Bounded to the head's own sections above the jaw, so it can never reach the neck.
export const FACE_BAND = [1.505, 1.720];

function faceRelief(cv) {
  const head = PARTS.find(p => p.id === 'head');
  const [lo, hi] = FACE_BAND;
  for (let row = Math.floor(PANEL.feetRow - hi * SCALE); row <= Math.ceil(PANEL.feetRow - lo * SCALE); row++) {
    const y = (PANEL.feetRow - row) / SCALE;
    const s = sectionAt(head.sections, y);
    if (!s) continue;
    const halfW = (s.w / 2) * SCALE;
    const [cx] = px(0, y, false);
    for (let x = Math.floor(cx - halfW); x <= Math.ceil(cx + halfW); x++) {
      const u = ((x + 0.5) - cx) / halfW;
      if (Math.abs(u) > 1) continue;
      let d = 0;
      for (const [amp, yc, ys, fu] of RELIEF) d += amp * Math.exp(-((y - yc) ** 2) / (2 * ys * ys)) * fu(u);
      // Fade to nothing at the silhouette, or the relief spills into the folded side strips.
      d *= Math.max(0, 1 - Math.abs(u) ** 6);
      if (Math.abs(d) < 0.5) continue;
      const i = (row * cv.w + x) * 4;
      if (cv.d[i] > 250 && cv.d[i + 1] > 250) continue;
      const g = Math.max(92, Math.min(236, cv.d[i] + d)) | 0;
      cv.px(x, row, [g, g, g + 4]);
    }
  }
}

// ---------------------------------------------------------------- labelled guide

function guide() {
  const cv = new Canvas(ATLAS.w, ATLAS.h, [22, 26, 34, 255]);
  const ink = [242, 246, 252], dim = [96, 108, 126];

  cv.rect(0, 0, ATLAS.w, 1, dim);
  for (let y = 0; y < ATLAS.h; y += 2) cv.px(PANEL.split, y, dim);

  const tint = (p, t, y, back) => {
    const c = PART_COLOUR[p.id] || [180, 180, 180];
    const k = (back ? 0.62 : 1) * (0.72 + 0.28 * Math.sqrt(Math.max(0, 1 - t * t)));
    return [c[0] * k, c[1] * k, c[2] * k];
  };
  scanParts(cv, false, tint);
  scanParts(cv, true, tint);

  // Every quad's UV outline, so the seams are visible as seams and not inferred from the fill.
  for (const f of faces()) {
    const pts = f.uv.map(([u, v]) => [u * ATLAS.w, (1 - v) * ATLAS.h]);
    cv.poly(pts, f.kind === 'front' || f.kind === 'back' ? [10, 12, 16] : [255, 90, 90], 1, 0.55);
  }

  cv.text('FRONT  (LEFT HALF)', PANEL.frontCx, 16, ink, 3, 'centre');
  cv.text('BACK  (RIGHT HALF)', PANEL.backCx, 16, ink, 3, 'centre');
  cv.text('WHO FIGHTS DUMMY UV  1024 X 1024  ORTHO FRONT/BACK', 12, ATLAS.h - 22, dim, 2);
  cv.text('RED EDGES ARE FOLDED SIDE STRIPS - THEY REUSE THE PIXELS BESIDE THEM', 12, ATLAS.h - 44, dim, 2);

  for (const r of REGIONS) {
    const [x, y] = px(r.at[0], r.at[1], r.panel === 'back');
    cv.text(r.label, x, y - 7, [16, 18, 22], 2, 'centre');
    cv.text(r.label, x - 1, y - 8, ink, 2, 'centre');
  }

  // Orientation marks: an up arrow beside each panel, and two eye dots at the height a face lands.
  for (const back of [false, true]) {
    const cx = back ? PANEL.backCx : PANEL.frontCx;
    const ax = cx + 208;
    cv.line([ax, 210], [ax, 130], ink, 3);
    cv.line([ax, 130], [ax - 9, 146], ink, 3);
    cv.line([ax, 130], [ax + 9, 146], ink, 3);
    cv.text('UP', ax, 214, ink, 2, 'centre');
  }
  const eyeY = PANEL.feetRow - 1.665 * SCALE;
  for (const dx of [-0.043, 0.043]) {
    const [ex] = px(dx, 1.665, false);
    cv.fill([[ex - 7, eyeY - 4], [ex + 7, eyeY - 4], [ex + 7, eyeY + 4], [ex - 7, eyeY + 4]], [20, 20, 24]);
  }

  // A metre scale down the far left, so the sheet says how big the thing is.
  for (let m = 0; m <= 18; m++) {
    const y = PANEL.feetRow - (m / 10) * SCALE;
    const long = m % 5 === 0;
    cv.line([4, y], [long ? 22 : 12, y], long ? ink : dim, 1);
    if (long) cv.text((m / 10).toFixed(1), 26, y - 7, dim, 2);
  }
  return cv;
}

// Flux2's edit mode encodes the reference at full resolution, and a 1024² reference costs ~8x the
// time of the same job with a 512² one for no visible gain — the mannequin has no detail to lose.
// 512 is what the tools default to; the full-size copy is kept for comparison.
function half(cv) {
  const out = new Canvas(cv.w / 2 | 0, cv.h / 2 | 0, [255, 255, 255, 255]);
  for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    let r = 0, g = 0, b = 0;
    for (const [dy, dx] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
      const i = ((y * 2 + dy) * cv.w + x * 2 + dx) * 4;
      r += cv.d[i]; g += cv.d[i + 1]; b += cv.d[i + 2];
    }
    out.px(x, y, [r / 4, g / 4, b / 4]);
  }
  return out;
}

// Guarded, so a test can import poseRef() without the module writing three PNGs as a side effect.
if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(OUT, { recursive: true });
  const pose = poseRef();
  writeFileSync(resolve(OUT, 'pose_ref_1024.png'), pose.png());
  writeFileSync(resolve(OUT, 'pose_ref.png'), half(pose).png());
  writeFileSync(resolve(OUT, 'uv_guide.png'), guide().png());
  console.log(`wrote art/skin/pose_ref.png (512), pose_ref_1024.png and uv_guide.png  (${faces().length} quads / ${faces().length * 2} tris)`);
}
