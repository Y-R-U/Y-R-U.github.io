// Course features placed along the track at distance `s` (negative = from the end), lateral `u`
// (metres, + = left). Each builder adds colliders / kinematic bodies and returns a descriptor the
// game skins with the theme: { type, p, basis: [X, Y, Z] (local axes in world), opts, ... }.
import { MAT, WALL_T } from '../engine/constants.js';
import { kinematicBody } from '../engine/physics.js';
import { v3 } from './frames.js';

const Y = [0, 1, 0];
const PATCHES = new Set(['sand', 'ice', 'boost', 'sticky']);
export const SAIL_X = 0.018;   // blade sail offset from the spar (matches the contract)

// s of the main-track frame nearest to [x, z] (authoring helper: features can say at: [x, z]).
export function nearestS(frames, [x, z]) {
  let best = Infinity, s = 0;
  for (const f of frames) { if (f.loop || f.tube) continue; const d = (f.p[0] - x) ** 2 + (f.p[2] - z) ** 2; if (d < best) { best = d; s = f.s; } }
  return s;
}

export function buildFeature(ft, ctx) {
  if (ft.at) ft = { ...ft, s: nearestS(ctx.frames, ft.at) };
  const F = PATCHES.has(ft.type) ? null : ctx.frameAt(ft.s ?? 0);
  if (PATCHES.has(ft.type)) return { type: ft.type };
  const fn = BUILDERS[ft.type];
  if (!fn) throw new Error('unknown feature ' + ft.type);
  return fn(ft, F, ctx);
}

const BUILDERS = {
  // Windmill: a tower across the fairway with a tunnel at ground level; blades turn in front of it
  // (on the tee side) and block the tunnel mouth part of the time.
  windmill(ft, F, { col, kinematics }) {
    const hw = F.w / 2;
    const gap = ft.gap ?? 0.34, gapH = ft.gapH ?? 0.24, height = ft.height ?? 1.2;
    const hub = ft.hub ?? 0.64, count = ft.blades ?? 4, bladeW = ft.bladeW ?? 0.2;
    const omega = ft.omega ?? 1.1, phase = ft.phase ?? 0;
    const towerR = ft.towerR ?? hw + WALL_T + 0.04;
    const L = hub - 0.018;                         // blade tip clears the floor by 18 mm
    // Tower collider: its front face sits just behind the blade plane, so there is no slot between
    // the blades and the tower where a ball could get trapped; the back follows the round tower.
    const front = towerR + 0.02, rear = towerR * 0.85;
    const depth = (front + rear) / 2, mid = (rear - front) / 2;   // along F.f
    const outer = hw + WALL_T + 0.02;
    for (const sg of [1, -1]) {
      const half = (outer - gap / 2) / 2;
      const c = v3.mad(v3.mad(v3.mad(F.p, F.l, sg * (gap / 2 + half)), F.u, height / 2), F.f, mid);
      col.box(c, F.l, F.u, F.f, [half, height / 2, depth], MAT.WALL, null, 'xXYzZ');
    }
    const cc = v3.mad(v3.mad(F.p, F.u, (gapH + height) / 2), F.f, mid);
    col.box(cc, F.l, F.u, F.f, [gap / 2, (height - gapH) / 2, depth], MAT.WALL, null, 'xXyYzZ');
    // rotor: local frame X = right, Y = up, Z = toward the tee (contract: rotor faces +Z)
    const back = v3.mul(F.f, -1), right = v3.mul(F.l, -1);
    const pivot = v3.mad(v3.mad(F.p, F.u, hub), back, towerR + 0.05);
    // Blade k at rotor angle 0 points along +Y rotated by 2*pi*k/count about Z; its spar is on
    // the radial line and its sail spans local x in [SAIL_X, SAIL_X + bladeW] (THEME_CONTRACT).
    const r0 = 0.06, x0 = -0.015, x1 = SAIL_X + bladeW + 0.01;
    for (let k = 0; k < count; k++) {
      kinematics.push(kinematicBody({
        pivot, axis: back, omega, phase: phase + (2 * Math.PI * k) / count,
        basis: [right, Y, back], mat: MAT.BLADE,
        shapes: [{ kind: 'box', c: [(x0 + x1) / 2, (r0 + L) / 2, 0], h: [(x1 - x0) / 2, (L - r0) / 2, 0.022] }],
      }));
    }
    return {
      type: 'windmill', p: F.p, basis: [right, Y, back], omega, phase,
      opts: { towerRadius: towerR, towerHeight: height, hubHeight: hub, bladeCount: count, bladeLength: L, bladeWidth: bladeW, gapWidth: gap, gapHeight: gapH },
    };
  },

  // Round bumper post (bouncy).
  bumper(ft, F, { kinematics }) {
    const r = ft.r ?? 0.1, h = ft.h ?? 0.16;
    const p = v3.mad(F.p, F.l, ft.u ?? 0);
    kinematics.push(kinematicBody({ pivot: p, mat: MAT.BUMPER, shapes: [{ kind: 'cyl', c: [0, h / 2, 0], r, hh: h / 2 }] }));
    return { type: 'bumper', p, basis: [v3.mul(F.l, -1), Y, v3.mul(F.f, -1)], opts: { radius: r, height: h } };
  },

  // Moving block: slides side to side across the fairway, a pure function of time.
  // u = centre offset, amp = half travel (m), period (s), size [w, h, d].
  mover(ft, F, { kinematics }) {
    const [w, h, d] = ft.size ?? [0.36, 0.16, 0.16];
    const p = v3.mad(F.p, F.l, ft.u ?? 0);
    const slide = { dir: F.l, amp: ft.amp ?? 0.4, omega: (2 * Math.PI) / (ft.period ?? 3), phase: ft.phase ?? 0 };
    const basis = [v3.mul(F.l, -1), Y, v3.mul(F.f, -1)];
    kinematics.push(kinematicBody({ pivot: p, basis, mat: MAT.WALL, slide, shapes: [{ kind: 'box', c: [0, h / 2, 0], h: [w / 2, h / 2, d / 2] }] }));
    return { type: 'mover', p, basis, slide, opts: { width: w, height: h, depth: d } };
  },

  // Static block (a rock / hedge / divider on the fairway). size [w, h, d] along (across, up, along).
  block(ft, F, { col, G }) {
    const [w, h, d] = ft.size ?? [0.4, 0.14, 0.4];
    const c = v3.mad(v3.mad(F.p, F.l, ft.u ?? 0), F.u, h / 2);
    const g = k => (k === 'Y' ? G('wallTop') : k === 'y' ? null : G('wall'));
    col.box(c, F.l, F.u, F.f, [w / 2, h / 2, d / 2], MAT.WALL, g, 'xXYzZ');
    return { type: 'block', p: F.p };
  },

  // Collectible crystal (no physics; the game checks distance).
  pickup(ft, F) {
    const p = v3.mad(v3.mad(F.p, F.l, ft.u ?? 0), F.u, 0.1);
    return { type: 'pickup', p, basis: [v3.mul(F.l, -1), Y, v3.mul(F.f, -1)], opts: {} };
  },
};
