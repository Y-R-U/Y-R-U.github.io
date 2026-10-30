// Sci-fi Rook: "Bastion". An armoured defence turret: an octagonal landing plinth with a
// light channel, eight curved armour panels over a dark core (the gaps are the panel
// lines; four of them carry vertical light strips), glowing sensor slits, a faceted
// overhanging collar with a recessed light band, and a ring of six emitter blocks
// (glowing emitter pads on top) around a dark reactor well with a dim core.
// Overhead read: a ring of six bright dashes around a dark well = battlements.
import { hsLathe, prep, assemble } from './common.js';

const TAU = Math.PI * 2;

export function rook(THREE, kit, { color }) {
  const parts = [];

  // ---- octagonal plinth ----
  parts.push(hsLathe(THREE, color, [
    [0, 0, 'dark'], [0.312, 0, 'dark'], [0.338, 0.022, 'shade'], [0.338, 0.058, 'body'],
    [0.318, 0.078, 'trim'], [0.298, 0.078, 'body'],
    [0.298, 0.068, 'dark'], [0.294, 0.066, 'line'], [0.266, 0.066, 'line'], [0.262, 0.068, 'line'], [0.262, 0.08, 'dark'],
    [0.25, 0.086, 'deck'], [0, 0.086, 'deck'],
  ], { seg: 8, flat: true, phiStart: Math.PI / 8 }));

  // ---- dark core behind the armour panels ----
  parts.push(hsLathe(THREE, color, [[0.218, 0.086, 'dark'], [0.218, 0.47, 'dark']], { seg: 24 }));

  // ---- eight armour panels (gaps between them are the vertical panel lines) ----
  const NP = 8, gap = 0.075, span = TAU / NP;
  const panel = [
    [0.218, 0.086, 'dark'],
    [0.244, 0.086, 'dark'], [0.256, 0.098, 'shade'],
    [0.256, 0.205, 'body'],
    [0.248, 0.211, 'dark'], [0.248, 0.224, 'dark'], [0.256, 0.23, 'dark'],     // horizontal panel groove
    [0.25, 0.42, 'body'],
    [0.242, 0.432, 'trim'], [0.218, 0.432, 'trim'],
  ];
  for (let i = 0; i < NP; i++) {
    parts.push(hsLathe(THREE, color, panel, { seg: 5, phiStart: i * span + gap / 2, phiLength: span - gap, closed: true, caps: true }));
  }
  // light strips in four of the gaps (front/back/sides after the 22.5° offset -> diagonals)
  for (let i = 0; i < NP; i += 2) {
    const a = i * span;
    const s = prep(THREE, new THREE.BoxGeometry(0.018, 0.25, 0.02), color, 'line');
    kit.place(s, { x: Math.sin(a) * 0.232, y: 0.29, z: Math.cos(a) * 0.232, ry: a });
    parts.push(s);
  }
  // sensor slits on the four other panels (centred on the panel)
  for (let i = 1; i < NP; i += 2) {
    const c = i * span + span / 2;
    for (const [dy, w] of [[0.355, 0.075], [0.152, 0.05]]) {
      const s = prep(THREE, kit.bevelBox(w, 0.02, 0.016, 0.005), color, dy > 0.3 ? 'lineHi' : 'line');
      kit.place(s, { x: Math.sin(c) * 0.252, y: dy, z: Math.cos(c) * 0.252, ry: c });
      parts.push(s);
    }
  }

  // ---- faceted collar: under-lip chamfer, recessed light band, deck ----
  parts.push(hsLathe(THREE, color, [
    [0.218, 0.428, 'dark'], [0.248, 0.428, 'shade'],
    [0.305, 0.49, 'shade'], [0.31, 0.5, 'trim'],
    [0.31, 0.512, 'body'], [0.302, 0.516, 'dark'], [0.3, 0.518, 'line'], [0.3, 0.532, 'line'], [0.302, 0.534, 'line'], [0.31, 0.538, 'dark'],
    [0.31, 0.552, 'body'], [0.296, 0.566, 'trim'], [0.2, 0.566, 'deck'],
    [0.2, 0.556, 'well'], [0.176, 0.556, 'well'], [0.176, 0.49, 'well'], [0, 0.49, 'well'],
  ], { seg: 16, flat: true, phiStart: TAU / 32 }));
  // reactor core: a dim glowing dome at the bottom of the well
  {
    const core = prep(THREE, new THREE.SphereGeometry(0.05, 14, 6, 0, TAU, 0, Math.PI / 2), color, 'lineLo');
    kit.place(core, { y: 0.49, sy: 0.6 });
    parts.push(core);
    const ring = hsLathe(THREE, color, [[0.11, 0.491, 'deck'], [0.11, 0.498, 'deck'], [0.09, 0.498, 'trim'], [0.09, 0.491, 'trim']], { seg: 16, flat: true });
    parts.push(ring);
  }

  // ---- six emitter blocks (the battlements) ----
  const NM = 6, mspan = TAU / NM, mfill = 0.6;
  const block = [
    [0.19, 0.566, 'shade'], [0.288, 0.566, 'dark'],
    [0.288, 0.69, 'body'], [0.272, 0.712, 'trim'],
    [0.252, 0.712, 'trim'], [0.248, 0.706, 'dark'], [0.208, 0.706, 'dark'], [0.204, 0.712, 'dark'],   // emitter recess
    [0.198, 0.712, 'trim'], [0.19, 0.702, 'trim'],
  ];
  for (let i = 0; i < NM; i++) {
    const a0 = i * mspan + mspan * (1 - mfill) / 2;
    parts.push(hsLathe(THREE, color, block, { seg: 6, phiStart: a0, phiLength: mspan * mfill, closed: true, caps: true }));
    // emitter pad glowing in the recess
    const pad = [[0.206, 0.706, 'lineHi'], [0.25, 0.706, 'lineHi'], [0.25, 0.71, 'lineHi'], [0.206, 0.71, 'lineHi']];
    parts.push(hsLathe(THREE, color, pad, { seg: 5, phiStart: a0 + 0.06, phiLength: mspan * mfill - 0.12, closed: true, caps: true }));
    // vertical light-line down the outer face
    const ac = a0 + mspan * mfill / 2;
    const l = prep(THREE, new THREE.BoxGeometry(0.014, 0.09, 0.008), color, 'line');
    kit.place(l, { x: Math.sin(ac) * 0.288, y: 0.632, z: Math.cos(ac) * 0.288, ry: ac });
    parts.push(l);
  }

  // a slim sensor mast on the rear block (toward model +x = the opponent), glowing tip
  {
    const ac = mspan * 1.5 + 0.0;  // centre of block 1
    const x = Math.sin(ac) * 0.24, z = Math.cos(ac) * 0.24;
    parts.push(prep(THREE, kit.place(new THREE.CylinderGeometry(0.008, 0.012, 0.13, 6), { x, y: 0.775, z }), color, 'trim'));
    parts.push(prep(THREE, kit.place(new THREE.SphereGeometry(0.017, 8, 6), { x, y: 0.845, z }), color, 'lineHi'));
  }

  return assemble(kit, color, parts);
}
