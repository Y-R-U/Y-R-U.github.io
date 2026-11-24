// A6 (STAIRS) the Jumbo's boarding moment. Stopped on a stand, the player's Jumbo gets its airstair rolled up, the L1
// door opens, the carpet unrolls and the King, a footman with the royal trunk and a corgi scurry up and in; the door
// shuts and the stairs roll away (≈ 6 s, never touches the controls). Moving off at any point sends them away at once.
// AI Jumbos parked on a stand just show the stairs. The state machine is pure (js/world/stairs.js, tools/stairs-sim.mjs).
import * as THREE from 'three';
import { Builder, col } from './util.js';
import { STAIRS, newStairs, stairsStep, nearStand } from './stairs.js';

// ---------------- visuals ----------------
let mat = null;
function figure(kind) {
  const b = new Builder();
  const cyl = (r0, r1, h, y, c, x = 0, z = 0) => b.geo(new THREE.CylinderGeometry(r0, r1, h, 8), new THREE.Matrix4().makeTranslation(x, y, z), c);
  const ball = (r, x, y, z, c) => b.geo(new THREE.SphereGeometry(r, 8, 6), new THREE.Matrix4().makeTranslation(x, y, z), c);
  const SKIN = col('#e8b896'), GOLD = col('#e2ac2c'), WHITE = col('#f4f2ea');
  if (kind === 'king') {
    cyl(0.18, 0.42, 1.25, 0.62, col('#5a1f7a'));           // robe
    cyl(0.2, 0.2, 0.12, 1.2, WHITE);                       // ermine collar
    ball(0.17, 0, 1.42, 0, SKIN);
    cyl(0.15, 0.13, 0.2, 1.62, GOLD);                      // the crown, slightly too big
    ball(0.04, 0, 1.76, 0, col('#c3102a'));
    b.box(0, 0.06, 0.38, 0.5, 0.04, 0.6, col('#5a1f7a'));  // train
  } else if (kind === 'footman') {
    b.box(0.12, 0.42, 0, 0.12, 0.84, 0.16, WHITE); b.box(-0.12, 0.42, 0, 0.12, 0.84, 0.16, WHITE);
    b.box(0, 1.1, 0, 0.44, 0.6, 0.26, col('#b3141f'));
    ball(0.15, 0, 1.55, 0, SKIN);
    cyl(0.14, 0.14, 0.3, 1.82, col('#18181c'));
    b.box(0, 1.55, -0.32, 0.9, 0.55, 0.45, col('#6b4a2a')); // the royal trunk, carried overhead
    b.box(0, 1.55, -0.32, 0.92, 0.08, 0.47, GOLD);
  } else {
    b.box(0, 0.26, 0, 0.26, 0.24, 0.6, col('#d4842c'));     // corgi
    b.box(0, 0.22, -0.22, 0.24, 0.2, 0.14, WHITE);
    b.box(0, 0.38, -0.36, 0.2, 0.18, 0.2, col('#d4842c'));
    b.box(0.06, 0.5, -0.38, 0.05, 0.1, 0.04, col('#d4842c')); b.box(-0.06, 0.5, -0.38, 0.05, 0.1, 0.04, col('#d4842c'));
    for (const [x, z] of [[0.09, 0.2], [-0.09, 0.2], [0.09, -0.2], [-0.09, -0.2]]) b.box(x, 0.07, z, 0.07, 0.14, 0.07, WHITE);
  }
  const m = new THREE.Mesh(b.build(), mat);
  m.name = `boarding-${kind}`; m.castShadow = true;
  return m;
}

function buildProps(stairs) {
  mat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 });
  const A = stairs.userData.anchor, host = stairs.parent;
  const g = new THREE.Group(); g.name = 'boarding';
  const dark = new Builder(), panel = new Builder();
  dark.box(0, 0, 0, 0.05, 1.9, 1.04, col('#0d1014'));
  panel.box(0, 0.975, 0.54, 0.08, 1.95, 1.08, col('#f3efe6'));
  panel.box(-0.045, 0.975, 0.54, 0.02, 1.9, 0.07, col('#e2ac2c'));
  const hole = new THREE.Mesh(dark.build(), mat); hole.position.set(A.door[0] - 0.03, A.door[1] + 0.97, A.door[2]);
  const pivot = new THREE.Object3D(); pivot.position.set(A.door[0] - 0.06, A.door[1], A.door[2] - 0.54);
  const door = new THREE.Mesh(panel.build(), mat); pivot.add(door);
  g.add(hole, pivot);
  host.add(g);
  const crowd = ['corgi', 'king', 'footman'].map((k) => { const m = figure(k); m.scale.setScalar(1.2); stairs.add(m); return m; });
  // path in the stairs' frame: along the carpet, up onto the stair truck, up the steps, in at the door
  const F = A.foot, T = A.top, D = A.door, onSteps = F[0] + (1.3 / T[1]) * (T[0] - F[0]);
  const pts = [[F[0] - 5, 0.03, F[2]], [F[0] - 1.5, 0.03, F[2]], [F[0] - 1.1, 1.25, F[2]], [onSteps, 1.35, F[2]], [T[0], T[1] + 0.05, T[2]], [D[0] - 0.1, D[1] + 0.05, D[2]]];
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]));
  const len = seg.reduce((a, b) => a + b, 0);
  return { g, hole, pivot, crowd, pts, seg, len };
}

function placeOnPath(P, m, u, t) {
  if (u <= 0 || u >= 1) { m.visible = false; return; }
  let d = u * P.len, i = 0;
  while (i < P.seg.length - 1 && d > P.seg[i]) d -= P.seg[i++];
  const a = P.pts[i], b = P.pts[i + 1], k = d / P.seg[i];
  m.visible = true;
  m.position.set(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + Math.abs(Math.sin(t * 14)) * 0.06, a[2] + (b[2] - a[2]) * k);
  m.rotation.y = Math.atan2(b[0] - a[0], b[2] - a[2]) + Math.PI;
  m.scale.setScalar(1.2 * Math.min(1, u / 0.06, (1 - u) / 0.04));
}

export function createBoarding() {
  const H = { st: newStairs(), props: null, rig: null, moments: 0, ai: new Map(), last: null };
  const reset = () => { if (H.props) { H.props.g.removeFromParent(); for (const m of H.props.crowd) m.removeFromParent(); } H.props = null; H.st = newStairs(); };

  // traffic: TRAFFIC's entity list; stands: layout.STANDS; ctx: { audio, flash }
  H.update = (dt, traffic = [], stands = [], ctx = {}) => {
    for (const e of traffic) {
      if (e.rig?.type !== 'jumbo' || !e.rig._ext?.stairs) continue;
      const ac = e.ac, stairs = e.rig._ext.stairs;
      const inp = { onGround: ac.onGround, gs: ac.gs ?? 0, crashed: ac.crashed, atStand: nearStand(stands, ac.pos.x, ac.pos.z) };
      if (!e.player) {
        // AI: static stairs once parked a while (one draw call, carpet included)
        const k = inp.onGround && !inp.crashed && inp.atStand && inp.gs < STAIRS.moveGs ? (H.ai.get(e) || 0) + dt : 0;
        H.ai.set(e, k);
        e.rig.setStairs(k > STAIRS.aiStopFor);
        continue;
      }
      if (H.rig !== e.rig) { reset(); H.rig = e.rig; }
      const was = H.st.phase, o = stairsStep(H.st, inp, dt);
      if (o.visible && !H.props && stairs.userData.anchor) H.props = buildProps(stairs);
      e.rig.setStairs(o.visible);
      stairs.position.x = -(1 - o.stairs) * 7;
      const carpet = stairs.getObjectByName('carpet');
      if (carpet) carpet.scale.x = Math.max(0.001, o.carpet);
      const P = H.props;
      if (P) {
        P.g.visible = o.door > 0.001;
        P.pivot.rotation.y = -2.6 * o.door;
        P.crowd.forEach((m, i) => placeOnPath(P, m, o.parade < 0 ? -1 : (o.parade * 1.32 - i * 0.16), H.st.t));
      }
      const pos = e.rig.root.position;
      if (H.st.phase !== was) {
        H.last = { phase: H.st.phase, gs: inp.gs };
        const a = ctx.audio;
        try {
          if (H.st.phase === 'roll' || H.st.phase === 'away') a?.playRampWhine?.({ position: [pos.x, pos.y - 3, pos.z], pitch: 0.6, dur: 0.9, gain: 0.35 });
          if (H.st.phase === 'parade') { H.moments++; a?.playFanfare?.({ position: [pos.x, pos.y, pos.z] }); ctx.flash?.('THE KING BOARDS · MIND THE CORGI'); }
        } catch (er) { /* sound is optional */ }
      }
    }
    if (H.rig && !traffic.some((e) => e.player && e.rig === H.rig)) { reset(); H.rig = null; }
    for (const e of H.ai.keys()) if (!traffic.includes(e)) H.ai.delete(e);
  };
  Object.defineProperty(H, 'state', { get: () => ({ phase: H.st.phase, ...H.st.out, moments: H.moments, ai: [...H.ai.values()].filter((k) => k > STAIRS.aiStopFor).length }) });
  return H;
}
