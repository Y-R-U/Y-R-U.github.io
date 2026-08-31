// Poses are joint angles, not point positions — far fewer numbers and they interpolate cleanly.
// Angle 0 points straight DOWN; +PI/2 points forward (+x when facing right); PI points up.

import { P, BONE, NPTS } from './ragdoll.js';

const D = (a) => [Math.sin(a), Math.cos(a)];

/** t torso lean, h head tilt, s* shoulder, e* elbow, hl/hr hip, kl/kr knee, rot whole body. */
export function pose(o) {
  return {
    t: o.t || 0, h: o.h || 0,
    sl: o.sl || 0, el: o.el || 0, sr: o.sr || 0, er: o.er || 0,
    hl: o.hl || 0, kl: o.kl || 0, hr: o.hr || 0, kr: o.kr || 0,
    rot: o.rot || 0, crouch: o.crouch || 0,
  };
}

const scratch = Array.from({ length: NPTS }, () => [0, 0]);

/** Forward kinematics -> 11 local offsets from the pelvis, mirrored for facing. */
export function fk(p, facing, scale, out = scratch) {
  const S = scale;
  const spine = BONE.spine * S * (1 - p.crouch * 0.22);
  const thigh = BONE.thigh * S, shin = BONE.shin * S;
  const ua = BONE.upperArm * S, fa = BONE.foreArm * S;

  const [tsx, tcy] = D(p.t);
  const nx = tsx * spine, ny = -tcy * spine;
  const [hsx, hcy] = D(p.t + p.h);
  const hx = nx + hsx * BONE.skull * S, hy = ny - hcy * BONE.skull * S;

  const arm = (sh, el) => {
    const [ax, ay] = D(sh + p.t);
    const ex = nx + ax * ua, ey = ny + ay * ua;
    const [bx, by] = D(sh + p.t + el);
    return [ex, ey, ex + bx * fa, ey + by * fa];
  };
  const leg = (hip, knee) => {
    const [ax, ay] = D(hip);
    const kx = ax * thigh, ky = ay * thigh;
    const [bx, by] = D(hip + knee);
    return [kx, ky, kx + bx * shin, ky + by * shin];
  };

  const [elx, ely, hlx, hly] = arm(p.sl, p.el);
  const [erx, ery, hrx, hry] = arm(p.sr, p.er);
  const [klx, kly, flx, fly] = leg(p.hl, p.kl);
  const [krx, kry, frx, fry] = leg(p.hr, p.kr);

  out[P.PELVIS][0] = 0;   out[P.PELVIS][1] = 0;
  out[P.NECK][0] = nx;    out[P.NECK][1] = ny;
  out[P.HEAD][0] = hx;    out[P.HEAD][1] = hy;
  out[P.ELBOW_L][0] = elx; out[P.ELBOW_L][1] = ely;
  out[P.HAND_L][0] = hlx;  out[P.HAND_L][1] = hly;
  out[P.ELBOW_R][0] = erx; out[P.ELBOW_R][1] = ery;
  out[P.HAND_R][0] = hrx;  out[P.HAND_R][1] = hry;
  out[P.KNEE_L][0] = klx;  out[P.KNEE_L][1] = kly;
  out[P.FOOT_L][0] = flx;  out[P.FOOT_L][1] = fly;
  out[P.KNEE_R][0] = krx;  out[P.KNEE_R][1] = kry;
  out[P.FOOT_R][0] = frx;  out[P.FOOT_R][1] = fry;

  if (p.rot) {
    const c = Math.cos(p.rot), s = Math.sin(p.rot);
    for (let i = 0; i < NPTS; i++) {
      const x = out[i][0], y = out[i][1];
      out[i][0] = x * c - y * s;
      out[i][1] = x * s + y * c;
    }
  }
  if (facing < 0) for (let i = 0; i < NPTS; i++) out[i][0] = -out[i][0];
  return out;
}

export function lerpPose(a, b, u, out = {}) {
  for (const k in a) out[k] = a[k] + (b[k] - a[k]) * u;
  return out;
}

// ── Pose library ───────────────────────────────────────────────────────────
export const POSE = {
  guard:   pose({ t: 0.12, h: -0.08, sl: 0.95, el: 2.45, sr: 1.25, er: 2.15, hl: -0.28, kl: 0.36, hr: 0.30, kr: 0.10 }),
  guardB:  pose({ t: 0.16, h: -0.04, sl: 1.02, el: 2.35, sr: 1.32, er: 2.05, hl: -0.26, kl: 0.30, hr: 0.28, kr: 0.14 }),
  block:   pose({ t: 0.02, h: 0.16, sl: 1.55, el: 2.30, sr: 1.70, er: 2.25, hl: -0.20, kl: 0.44, hr: 0.22, kr: 0.30, crouch: 0.25 }),

  walkA:   pose({ t: 0.16, h: -0.05, sl: 0.55, el: 1.85, sr: 1.45, er: 1.70, hl: -0.52, kl: 0.62, hr: 0.54, kr: 0.14 }),
  walkB:   pose({ t: 0.14, h: -0.05, sl: 1.00, el: 2.00, sr: 1.10, er: 1.90, hl: -0.10, kl: 0.30, hr: 0.16, kr: 0.42 }),
  walkC:   pose({ t: 0.16, h: -0.05, sl: 1.45, el: 1.70, sr: 0.55, er: 1.85, hl: 0.54, kl: 0.14, hr: -0.52, kr: 0.62 }),
  walkD:   pose({ t: 0.14, h: -0.05, sl: 1.10, el: 1.90, sr: 1.00, er: 2.00, hl: 0.16, kl: 0.42, hr: -0.10, kr: 0.30 }),

  runA:    pose({ t: 0.42, h: -0.22, sl: 0.20, el: 2.20, sr: 2.05, er: 1.95, hl: -0.80, kl: 1.05, hr: 0.86, kr: 0.20 }),
  runB:    pose({ t: 0.40, h: -0.20, sl: 1.10, el: 2.10, sr: 1.10, er: 2.10, hl: -0.16, kl: 0.40, hr: 0.30, kr: 0.80 }),
  runC:    pose({ t: 0.42, h: -0.22, sl: 2.05, el: 1.95, sr: 0.20, er: 2.20, hl: 0.86, kl: 0.20, hr: -0.80, kr: 1.05 }),
  runD:    pose({ t: 0.40, h: -0.20, sl: 1.10, el: 2.10, sr: 1.10, er: 2.10, hl: 0.30, kl: 0.80, hr: -0.16, kr: 0.40 }),

  jumpUp:  pose({ t: 0.10, h: -0.16, sl: 2.55, el: 0.70, sr: 2.70, er: 0.55, hl: -0.50, kl: 1.25, hr: 0.42, kr: 1.05 }),
  jumpFall:pose({ t: -0.06, h: 0.10, sl: 2.20, el: 1.05, sr: 2.35, er: 0.90, hl: -0.34, kl: 0.55, hr: 0.50, kr: 0.35 }),
  land:    pose({ t: 0.30, h: 0.10, sl: 0.70, el: 2.10, sr: 0.90, er: 2.00, hl: -0.40, kl: 0.95, hr: 0.44, kr: 0.85, crouch: 0.45 }),

  jabWind: pose({ t: 0.06, h: -0.06, sl: 0.90, el: 2.50, sr: 0.95, er: 2.55, hl: -0.30, kl: 0.38, hr: 0.32, kr: 0.10 }),
  jabHit:  pose({ t: 0.24, h: -0.02, sl: 0.85, el: 2.40, sr: 1.62, er: 0.02, hl: -0.36, kl: 0.42, hr: 0.42, kr: 0.06 }),
  jabBack: pose({ t: 0.14, h: -0.06, sl: 0.92, el: 2.45, sr: 1.35, er: 1.60, hl: -0.30, kl: 0.36, hr: 0.32, kr: 0.10 }),

  hookWind:pose({ t: -0.10, h: -0.10, sl: 0.60, el: 2.60, sr: -0.35, er: 2.70, hl: -0.24, kl: 0.34, hr: 0.26, kr: 0.14 }),
  hookHit: pose({ t: 0.30, h: 0.04, sl: 1.30, el: 1.80, sr: 1.75, er: 0.30, hl: -0.40, kl: 0.46, hr: 0.48, kr: 0.04 }),
  hookBack:pose({ t: 0.12, h: -0.04, sl: 1.00, el: 2.30, sr: 1.30, er: 1.70, hl: -0.30, kl: 0.36, hr: 0.32, kr: 0.12 }),

  kickWind:pose({ t: -0.14, h: -0.08, sl: 0.70, el: 2.30, sr: 1.10, er: 2.40, hl: -0.20, kl: 0.30, hr: 0.72, kr: 1.35, crouch: 0.12 }),
  kickHit: pose({ t: -0.30, h: 0.06, sl: 1.90, el: 1.30, sr: 0.40, er: 2.10, hl: -0.18, kl: 0.18, hr: 1.52, kr: 0.06 }),
  kickBack:pose({ t: -0.06, h: 0.00, sl: 1.10, el: 2.10, sr: 0.90, er: 2.20, hl: -0.24, kl: 0.32, hr: 0.66, kr: 0.70 }),

  powWind: pose({ t: -0.34, h: -0.26, sl: 0.40, el: 2.20, sr: -0.85, er: 2.05, hl: -0.46, kl: 0.66, hr: 0.30, kr: 0.30, crouch: 0.22 }),
  powHit:  pose({ t: 0.52, h: 0.22, sl: 1.20, el: 1.60, sr: 2.42, er: 0.06, hl: -0.56, kl: 0.52, hr: 0.62, kr: 0.10 }),
  powBack: pose({ t: 0.30, h: 0.10, sl: 1.00, el: 2.10, sr: 1.55, er: 1.20, hl: -0.34, kl: 0.40, hr: 0.38, kr: 0.14 }),

  riseWind:pose({ t: 0.36, h: 0.20, sl: 0.75, el: 2.40, sr: 0.30, er: 2.75, hl: -0.34, kl: 0.86, hr: 0.34, kr: 0.72, crouch: 0.42 }),
  riseHit: pose({ t: -0.26, h: -0.30, sl: 1.10, el: 2.00, sr: 3.00, er: 0.10, hl: -0.26, kl: 0.10, hr: 0.28, kr: 0.06 }),
  riseBack:pose({ t: -0.06, h: -0.10, sl: 1.00, el: 2.20, sr: 2.30, er: 0.90, hl: -0.28, kl: 0.30, hr: 0.30, kr: 0.12 }),

  slamWind:pose({ t: -0.20, h: -0.24, sl: 2.75, el: 0.35, sr: 2.85, er: 0.25, hl: -0.36, kl: 0.60, hr: 0.34, kr: 0.50 }),
  slamHit: pose({ t: 0.62, h: 0.34, sl: 0.55, el: 0.30, sr: 0.62, er: 0.22, hl: -0.52, kl: 1.05, hr: 0.50, kr: 0.95, crouch: 0.5 }),
  slamBack:pose({ t: 0.34, h: 0.16, sl: 0.80, el: 1.40, sr: 0.86, er: 1.30, hl: -0.42, kl: 0.72, hr: 0.42, kr: 0.62, crouch: 0.24 }),

  dashPose:pose({ t: 0.86, h: -0.55, sl: -0.55, el: 0.35, sr: 1.95, er: 0.10, hl: -0.72, kl: 0.95, hr: 0.62, kr: 0.30 }),

  flipTuck:pose({ t: 0.20, h: 0.10, sl: 1.70, el: 1.90, sr: 1.80, er: 1.85, hl: -0.20, kl: 1.90, hr: 0.24, kr: 1.75, crouch: 0.3 }),
  flipKick:pose({ t: 0.05, h: -0.05, sl: 2.20, el: 0.90, sr: 2.30, er: 0.80, hl: -0.30, kl: 0.20, hr: 1.35, kr: 0.10 }),

  tossWind:pose({ t: -0.24, h: -0.14, sl: 0.80, el: 2.30, sr: -0.60, er: 2.45, hl: -0.30, kl: 0.40, hr: 0.28, kr: 0.16 }),
  tossHit: pose({ t: 0.30, h: 0.06, sl: 1.05, el: 2.10, sr: 2.55, er: 0.35, hl: -0.40, kl: 0.44, hr: 0.44, kr: 0.08 }),

  hurt:    pose({ t: -0.42, h: 0.34, sl: 1.90, el: 1.30, sr: 2.05, er: 1.20, hl: -0.16, kl: 0.24, hr: 0.36, kr: 0.42 }),
  taunt:   pose({ t: -0.10, h: -0.20, sl: 2.85, el: 0.60, sr: 0.65, er: 2.30, hl: -0.22, kl: 0.28, hr: 0.26, kr: 0.16 }),
  victory: pose({ t: -0.14, h: -0.26, sl: 3.05, el: 0.20, sr: 3.15, er: 0.15, hl: -0.30, kl: 0.20, hr: 0.32, kr: 0.14 }),
  bow:     pose({ t: 1.05, h: 0.30, sl: 0.30, el: 0.20, sr: 0.35, er: 0.15, hl: -0.16, kl: 0.20, hr: 0.18, kr: 0.16 }),
};

/** frames: [poseName, seconds]. hit: frame index whose start fires the hitbox. */
export const ANIM = {
  guard:  { loop: true,  frames: [['guard', 0.9], ['guardB', 0.9]] },
  walk:   { loop: true,  frames: [['walkA', 0.14], ['walkB', 0.13], ['walkC', 0.14], ['walkD', 0.13]] },
  run:    { loop: true,  frames: [['runA', 0.10], ['runB', 0.09], ['runC', 0.10], ['runD', 0.09]] },
  jump:   { loop: false, frames: [['jumpUp', 0.30]], hold: 'jumpUp' },
  fall:   { loop: false, frames: [['jumpFall', 0.30]], hold: 'jumpFall' },
  land:   { loop: false, frames: [['land', 0.13], ['guard', 0.10]] },
  block:  { loop: false, frames: [['block', 0.2]], hold: 'block' },
  hurt:   { loop: false, frames: [['hurt', 0.22], ['guard', 0.14]] },
  taunt:  { loop: false, frames: [['taunt', 0.5], ['guard', 0.25]] },
  victory:{ loop: true,  frames: [['victory', 0.6], ['taunt', 0.6]] },
  bow:    { loop: false, frames: [['bow', 0.6], ['guard', 0.4]] },

  jab:    { frames: [['jabWind', 0.07], ['jabHit', 0.09], ['jabBack', 0.14]], hit: 1 },
  hook:   { frames: [['hookWind', 0.11], ['hookHit', 0.10], ['hookBack', 0.19]], hit: 1 },
  kick:   { frames: [['kickWind', 0.13], ['kickHit', 0.12], ['kickBack', 0.22]], hit: 1 },
  power:  { frames: [['powWind', 0.20], ['powHit', 0.12], ['powBack', 0.28]], hit: 1 },
  rise:   { frames: [['riseWind', 0.14], ['riseHit', 0.12], ['riseBack', 0.26]], hit: 1 },
  slam:   { frames: [['slamWind', 0.17], ['slamHit', 0.10], ['slamBack', 0.30]], hit: 1 },
  toss:   { frames: [['tossWind', 0.15], ['tossHit', 0.14], ['guard', 0.16]], hit: 1 },
  dash:   { frames: [['dashPose', 0.26], ['guard', 0.14]], hit: 0 },
  flip:   { frames: [['flipTuck', 0.16], ['flipKick', 0.20], ['flipTuck', 0.16], ['land', 0.12]], hit: 1 },
};

const _a = pose({}), _b = pose({});

/** Sample an animation at time t -> interpolated pose + which frame we are in. */
export function sample(name, t, spin = 0) {
  const A = ANIM[name] || ANIM.guard;
  const F = A.frames;
  let total = 0;
  for (const f of F) total += f[1];
  let time = t;
  if (A.loop) time = total > 0 ? t % total : 0;
  else if (time > total) {
    const hold = A.hold ? POSE[A.hold] : POSE[F[F.length - 1][0]];
    return { p: spin ? { ...hold, rot: hold.rot + spin } : hold, frame: F.length - 1, done: true };
  }
  let i = 0, acc = 0;
  while (i < F.length - 1 && time > acc + F[i][1]) { acc += F[i][1]; i++; }
  const u = F[i][1] > 0 ? Math.min(1, (time - acc) / F[i][1]) : 1;
  const cur = POSE[F[i][0]];
  const nxt = POSE[F[Math.min(F.length - 1, i + 1)][0]];
  const out = lerpPose(cur, nxt, u * u * (3 - 2 * u), _a);
  if (spin) out.rot = (out.rot || 0) + spin;
  return { p: out, frame: i, done: false, u };
}
