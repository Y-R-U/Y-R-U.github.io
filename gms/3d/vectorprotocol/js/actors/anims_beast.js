// 'beast' rig (D21 quadruped: wolves, later big cats / boars). Same 23 bones, laid out horizontally:
// pelvis = hips, spine/chest run forward (+z), neck/head forward; front legs = clav->upArm->foreArm->hand (hanging down,
// IK'd with armIK), back legs = thigh->shin->foot (legIK); aux0 = tail (dims.parents { aux0: 'pelvis' }), aux1 = jaw (on head).
import * as THREE from 'three';
import { LIB } from './anims.js';

const PI = Math.PI, TAU = PI * 2;
const _t = new THREE.Vector3();

// planted foot homes in root space: [x, z] for FL, FR, BL, BR
function homes(ctx) {
  const D = ctx.D, fz = D.frontZ ?? 0.5, fx = D.footX ?? 0.13, bx = D.hipX * 1.05;
  return { FL: [fx, fz], FR: [-fx, fz], BL: [bx, -0.02], BR: [-bx, -0.02] };
}
function feet(P, ctx, F) {
  const L = LIB, D = ctx.D;
  L.armIK(P, ctx, 'L', _t.set(F.FL[0], F.FL[1], F.FL[2]), -0.15);
  L.armIK(P, ctx, 'R', _t.set(F.FR[0], F.FR[1], F.FR[2]), -0.15);
  L.legIK(P, ctx, 'L', F.BL[0], F.BL[1], F.BL[2], 0);
  L.legIK(P, ctx, 'R', F.BR[0], F.BR[1], F.BR[2], 0);
  // paws stay flat: counter the summed leg pitch on the hand bones
  for (const s of ['L', 'R']) {
    const i = L.BI['upArm' + s] * 3, f = L.BI['foreArm' + s] * 3, h = L.BI['hand' + s] * 3;
    P[h] = -(P[i] + P[f] + P[L.BI.spine * 3] + P[L.BI.chest * 3] + P[0]);
  }
}
function base(P, ctx, t, k = {}) {
  const L = LIB, st = ctx.st, H = homes(ctx), y = ctx.D.ankle;
  const br = Math.sin(t * 2.2);
  L.pel(P, 0, (k.dy || 0) + br * 0.006, k.dz || 0);
  L.R(P, 'pelvis', k.pitch || 0, 0, k.roll || 0);
  L.R(P, 'spine', 0.02 * br + (k.spine || 0), 0, 0);
  L.R(P, 'chest', -0.02 * br + (k.chest || 0), 0, 0);
  L.R(P, 'neck', -0.25 + (k.neck || 0) + st.gp * 0.4, st.gy * 0.6, 0);
  L.R(P, 'head', 0.2 + (k.head || 0) + st.gp * 0.3, st.gy * 0.4, st.tilt);
  L.R(P, 'aux0', 0.5 + (k.tail || 0) + Math.sin(t * 1.7) * 0.06, Math.sin(t * 2.6) * 0.35 * (k.wag ?? 1), 0);
  L.R(P, 'aux1', k.jaw || 0, 0, 0);
  const f = (s, dz = 0, dy = 0) => [H[s][0], y + dy, H[s][1] + dz];
  return { FL: f('FL', k.fz || 0), FR: f('FR', k.fz || 0), BL: f('BL', k.bz || 0), BR: f('BR', k.bz || 0) };
}

export function beastLoop(name, P, ctx, t) {
  const L = LIB;
  if (name === 'advance') {
    const m = ctx.move, d = m.stride, duty = 0.55, ph = m.phase;
    const F = base(P, ctx, t, { dy: -0.01 + 0.015 * Math.sin(TAU * 2 * ph), neck: 0.1, wag: 0.4 });
    const order = { FL: 0, BR: 0, FR: 0.5, BL: 0.5 };
    for (const k of ['FL', 'FR', 'BL', 'BR']) {
      const p = (ph + order[k]) % 1;
      let z, y = 0;
      if (p < duty) z = d / 2 - d * (p / duty);
      else { const u = (p - duty) / (1 - duty); z = -d / 2 + d * L.smooth(u); y = 0.1 * Math.sin(PI * u); }
      F[k][2] += z; F[k][1] += y;
    }
    feet(P, ctx, F);
    return;
  }
  if (name === 'victory') {
    // howl: sit back on the haunches, head up
    const k = L.smooth(Math.min(1, t / 0.6)), w = Math.max(0, Math.sin(t * 0.9));
    const F = base(P, ctx, t, { dy: -0.18 * k, pitch: -0.35 * k, neck: -0.6 * k, head: -0.5 * k - 0.15 * w, jaw: 0.35 * w, tail: 0.3 * k });
    feet(P, ctx, F);
    return;
  }
  feet(P, ctx, base(P, ctx, t));
}

export function beastAction(name, P, u, ctx) {
  const L = LIB, kf = L.kf;
  let F;
  switch (name) {
    case 'attack': {
      // pounce-bite (impact 0.5): coil, spring forward, bite, recover
      const coil = kf(u, [[0, 0], [0.3, 1], [0.42, 0], [1, 0]]), lunge = kf(u, [[0, 0], [0.32, 0], [0.48, 1], [0.7, 0.8], [1, 0]]);
      F = base(P, ctx, ctx.t, { dy: -0.12 * coil + 0.12 * lunge, dz: -0.08 * coil + 0.38 * lunge, pitch: 0.12 * coil - 0.1 * lunge,
        neck: 0.25 * coil - 0.1 * lunge, head: 0.2 * lunge, jaw: kf(u, [[0, 0], [0.4, 0.7], [0.5, 0.05], [0.6, 0.3], [1, 0]]), wag: 0.2, fz: 0.32 * lunge });
      break;
    }
    case 'attack_alt': {
      // claw rake with the left fore paw (impact 0.5)
      F = base(P, ctx, ctx.t, { dy: -0.04, roll: -0.08, neck: 0.15, jaw: 0.3 * kf(u, [[0, 0], [0.45, 1], [1, 0]]) });
      feet(P, ctx, F);
      const r = kf(u, [[0, 0], [0.35, 1], [0.5, -0.4], [0.7, -0.3], [1, 0]]);
      L.R(P, 'upArmL', -1.2 * Math.max(0, r) + 0.4 * Math.min(0, r), 0, 0.2);
      L.R(P, 'foreArmL', -0.9 * Math.max(0, r), 0, 0);
      return;
    }
    case 'cast': {
      F = base(P, ctx, ctx.t, { dy: -0.1, pitch: -0.2, neck: -0.5 * kf(u, [[0, 0], [0.5, 1], [1, 0]]), head: -0.4 * kf(u, [[0, 0], [0.5, 1], [1, 0]]), jaw: 0.5 * kf(u, [[0, 0], [0.5, 1], [0.8, 0.6], [1, 0]]) });
      break;
    }
    case 'overdrive': {
      // big leap: crouch, airborne arc, land hard (impact 0.68), shake off
      const crouch = kf(u, [[0, 0], [0.25, 1], [0.32, 0], [0.68, 1.1], [0.85, 0.3], [1, 0]]), air = kf(u, [[0, 0], [0.3, 0], [0.48, 1], [0.66, 0], [1, 0]]);
      F = base(P, ctx, ctx.t, { dy: -0.16 * crouch + 0.9 * air, dz: 0.5 * air, pitch: 0.25 * crouch - 0.3 * air, neck: 0.3 * crouch, jaw: 0.6 * kf(u, [[0, 0], [0.6, 0], [0.7, 1], [0.9, 0]]), wag: 0 });
      feet(P, ctx, F);
      if (air > 0.05) for (const s of ['L', 'R']) { L.A(P, 'thigh' + s, 0.6 * air, 0, 0); L.A(P, 'shin' + s, 0.8 * air, 0, 0); L.A(P, 'upArm' + s, -0.7 * air, 0, 0); L.A(P, 'foreArm' + s, 0.6 * air, 0, 0); }
      return;
    }
    case 'hit': {
      const k = kf(u, [[0, 0], [0.12, 1], [1, 0]]), d = ctx.st.hitDir;
      F = base(P, ctx, ctx.t, { dz: -0.1 * k, roll: 0.12 * k * d, neck: -0.2 * k, head: -0.2 * k, jaw: 0.4 * k });
      break;
    }
    case 'die': {
      const fall = kf(u, [[0, 0], [0.2, 0.15], [0.55, 1], [0.65, 0.93], [1, 1]]);
      const D = ctx.D;
      F = base(P, ctx, ctx.t * (1 - u), { dy: -(D.pelvisY - 0.2) * fall, roll: 1.35 * fall, neck: 0.2 * fall, head: 0.3 * fall, tail: -0.5 * fall, wag: 1 - fall, jaw: 0.3 * fall });
      feet(P, ctx, F);
      if (fall > 0.3) for (const s of ['L', 'R']) { L.R(P, 'thigh' + s, -0.3 * fall, 0, 0.3 * fall); L.R(P, 'shin' + s, 0.5, 0, 0); L.R(P, 'upArm' + s, -0.4 * fall, 0, 0.3 * fall); L.R(P, 'foreArm' + s, 0.2, 0, 0); }
      return;
    }
    case 'deploy': {
      const land = kf(u, [[0, 0], [0.32, 0], [0.4, 1], [0.7, 0.3], [1, 0]]);
      F = base(P, ctx, ctx.t, { dy: -0.18 * land, pitch: 0.1 * land, neck: 0.3 * land, head: kf(u, [[0, 0.3], [0.7, 0.3], [0.85, -0.3], [1, 0]]) });
      break;
    }
    default:
      F = base(P, ctx, ctx.t);
  }
  feet(P, ctx, F);
}
