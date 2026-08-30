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

function poseRef() {
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
  return cv;
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

mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, 'pose_ref.png'), poseRef().png());
writeFileSync(resolve(OUT, 'uv_guide.png'), guide().png());
console.log(`wrote art/skin/pose_ref.png and art/skin/uv_guide.png  (${faces().length} quads / ${faces().length * 2} tris)`);
