// Jon's keyed clips. Angles in degrees (euler XYZ, parent frame), pos = hips offset in metres.
// Conventions: thigh -x = leg forward, shin +x = knee bend, spine/chest +x = lean forward,
// uarm -x = arm forward/up, uarmL +z = arm out to the side, farm -x = elbow bend, head +x = nod down.
import { S, compileClip, writeKey, REST, CI, CH, POS } from './jon_anim.js';
const writeKeyObj = (pose) => Object.fromEntries(CH.map((n, i) => [n, [pose[i * 3], pose[i * 3 + 1], pose[i * 3 + 2]]]));

// Seating convention (matches props' chair.seat): for seated clips Jon's root sits at the chair SEAT SURFACE
// centre (y≈0.46 world), facing the table (+Z). The chair carries him when it tips/bounces.
// sit_down starts, and stand_up ends, standing on the floor SEAT.front m in front of the seat: after stand_up
// resolves, move the root to that floor point (j.seatFloorPoint()) — the pose already compensates.
export const SEAT = { h: 0.46, front: 0.36 };
export const STAND = (x = 0, y = 0, z = 0) => [x, y - SEAT.h, z + SEAT.front];
export const SIT = {
  pos: [0, -0.85, -0.05], hips: [0, 0, 0], spine: [6, 0, 0], chest: [2, 0, 0], neck: [-4, 0, 0], head: [0, 0, 0],
  ...S({ thighL: [-80, 0, 4], shinL: [84, 0, 0], footL: [-4, 0, 0], uarmL: [-18, 0, 12], farmL: [-62, 0, 0], handL: [10, 0, 0] }),
};
export const SIT_BASE = writeKey(REST.slice(), SIT);

// props' chair.fallBack(): teeter 0.35 s, fall 0.45 s ease-in to ~79°, crash+settle 0.3 s. Jon rides the seat;
// angle() is only used by tools/jon.html's stand-in chair.
export const CHAIR_FALL = {
  pivot: [0, 0, -0.2], dur: 2.2, teeterEnd: 0.35, impact: 0.8,
  angle(t) {
    if (t < 0.35) return 6 * Math.sin(t / 0.35 * Math.PI * 2) * (0.5 + t / 0.7);
    if (t < 0.8) { const u = (t - 0.35) / 0.45; return 79 * u * u; }
    const u = t - 0.8;
    return 79 - 8 * Math.exp(-u * 8) * Math.abs(Math.sin(u * 14));
  },
};

export function buildClips() {
  const C = {};
  const add = (name, def) => { C[name] = compileClip({ name, ...def }); };
  const sitB = { base: SIT_BASE };

  // ---------------- seated ----------------
  add('sit', {
    ...sitB, dur: 3.2, loop: true, hold: true, keys: [
      [0, {}], [1.6, { chest: [4, 0, 0], head: [2, 3, 0] }], [3.2, {}],
    ],
  });
  // sitting down from standing (walks to the seat point, then lowers backwards)
  add('sit_down', {
    ...sitB, dur: 1.0, hold: true, keys: [
      [0, { ...writeKeyObj(REST), pos: STAND() }],
      [0.3, { pos: STAND(0, -0.12, -0.1), spine: [18, 0, 0], chest: [10, 0, 0], ...S({ thighL: [-30, 0, 3], shinL: [45, 0, 0], footL: [-15, 0, 0], uarmL: [-30, 0, 15], farmL: [-30, 0, 0] }) }],
      [0.62, { ...SIT, pos: [0, -0.86, -0.04], spine: [12, 0, 0] }],
      [0.8, { pos: [0, -0.845, -0.05], spine: [4, 0, 0] }],
      [1.0, SIT],
    ],
  });
  add('sit_eat', {
    ...sitB, dur: 2.4, loop: true, hold: true,
    face: [[0, 'happy']], props: [[0, 'fork']],
    keys: [
      [0, { uarmR: [-28, 0, -6], farmR: [-62, 0, 0], handR: [20, 0, 0] }],
      [0.35, { uarmR: [-30, 0, -4], farmR: [-58, 0, 0], handR: [35, 0, 0], head: [8, 0, 0] }],          // stab
      [0.75, { uarmR: [-30, 0, 8], farmR: [-140, 40, 0], handR: [-30, 0, 0], head: [-4, 0, 0], chest: [6, 0, 0] }], // to mouth
      [0.95, { uarmR: [-28, 0, 8], farmR: [-142, 40, 0], head: [-2, 0, 0] }],
      [1.3, { uarmR: [-26, 0, 0], farmR: [-110, 20, 0], head: [2, 0, 0], chest: [3, 0, 0] }],                                 // chew
      [1.8, { uarmR: [-26, 0, -8], farmR: [-70, 0, 0], handR: [18, 0, 0], head: [4, 3, 0] }],
      [2.4, { uarmR: [-28, 0, -6], farmR: [-62, 0, 0], handR: [20, 0, 0], head: [0, 0, 0] }],
    ],
    ev: { bite: 0.9 },
  });
  C.sit_eat.talkWindow = [0.95, 1.8];
  add('stand_up', {
    ...sitB, dur: 1.0, keys: [
      [0, {}],
      [0.3, { spine: [28, 0, 0], chest: [14, 0, 0], neck: [-14, 0, 0], ...S({ uarmL: [-10, 0, 25], farmL: [-40, 0, 0] }) }],
      [0.62, { pos: STAND(0, -0.1, -0.08), spine: [16, 0, 0], chest: [6, 0, 0], ...S({ thighL: [-26, 0, 2], shinL: [36, 0, 0], footL: [-10, 0, 0] }) }],
      [0.82, { pos: STAND(0, 0.01, 0), spine: [-2, 0, 0], chest: [-2, 0, 0], neck: [0, 0, 0], ...S({ thighL: [0, 0, 1], shinL: [2, 0, 0], footL: [-2, 0, 0], uarmL: [2, 0, 9], farmL: [-12, 0, 0] }) }],
      [1.0, { pos: STAND(), spine: [2, 0, 0], chest: [0, 0, 0], ...S({ uarmL: [2, 0, 7], farmL: [-10, 0, 0] }) }],
    ],
  });
  C.stand_up.hold = true;

  add('fall_back_chair', {
    ...sitB, dur: CHAIR_FALL.dur, hold: true,
    face: [[0, 'shock'], [0.82, 'pain'], [1.35, 'dizzy']],
    keys: [
      [0, {}],
      [0.12, { ...S({ uarmL: [-60, 0, 40], farmL: [-40, 0, 0], fingL: [0, 0, 10] }), head: [-10, 0, 0] }],
      [0.28, { ...S({ uarmL: [-80, 0, 55], farmL: [-30, 0, 0] }), ...S({ thighL: [-95, 0, 8], shinL: [60, 0, 0] }) }],
      [0.5, { ...S({ uarmL: [-150, 0, 40], farmL: [-20, 0, 0] }), thighL: [-110, 0, 10], thighR: [-90, 0, -12], shinL: [40, 0, 0], shinR: [80, 0, 0], head: [-20, 0, 0] }],
      [0.7, { ...S({ uarmL: [-130, 0, 70] }), thighL: [-95, 0, 10], thighR: [-120, 0, -10], shinL: [80, 0, 0], shinR: [30, 0, 0] }],
      [0.82, { ...S({ uarmL: [-100, 0, 80], farmL: [-10, 0, 0] }), ...S({ thighL: [-100, 0, 12], shinL: [50, 0, 0] }), head: [15, 0, 0] }],
      [0.95, { ...S({ thighL: [-125, 0, 14], shinL: [20, 0, 0], footL: [20, 0, 0] }), head: [-5, 0, 0] }],
      [1.3, { ...S({ uarmL: [-95, 0, 85], farmL: [-20, 0, 0] }), thighL: [-112, 0, 18], thighR: [-118, 0, -14], shinL: [45, 0, 0], shinR: [35, 0, 0], head: [5, 20, 0] }],
      [1.8, { thighL: [-118, 0, 15], thighR: [-110, 0, -18], shinL: [30, 0, 0], shinR: [50, 0, 0], head: [5, -15, 0] }],
      [2.4, { thighL: [-112, 0, 16], thighR: [-114, 0, -16], shinL: [40, 0, 0], shinR: [40, 0, 0], head: [6, 0, 0] }],
    ],
    ev: { fall: CHAIR_FALL.teeterEnd, impact: CHAIR_FALL.impact },
  });

  add('stunned_shake', {
    ...sitB, dur: 1.6, loop: true, hold: true, face: [[0, 'dizzy']],
    keys: [
      [0, { head: [8, 0, 10], ...S({ uarmL: [-5, 0, 22], farmL: [-20, 0, 0] }), spine: [-2, 0, 0], chest: [-4, 0, 0] }],
      [0.4, { head: [4, 12, -6] }], [0.8, { head: [8, 0, -12] }], [1.2, { head: [4, -12, 6] }], [1.6, { head: [8, 0, 10] }],
    ],
    post(t, p) {
      const j = Math.sin(t * 90) * 1.6;
      p[CI.chest + 2] += j; p[CI.head + 2] += j * 1.5; p[CI.farmL] += j * 2; p[CI.farmR] -= j * 2; p[POS] += j * 0.002;
    },
  });

  // ---------------- reactions ----------------
  add('hop_leg', {
    dur: 0.56, loop: true, loopFrom: 0.3, face: [[0, 'pain']],
    keys: [
      [0, { pos: [0, -0.06, 0], spine: [20, 0, 0], ...S({ uarmL: [-20, 0, 10] }) }],
      // grab right shin, lift it; hop on left
      [0.3, { pos: [0, -0.02, 0], spine: [30, 0, 0], chest: [14, 0, 0], neck: [-10, 0, 0], head: [10, 0, 0],
        thighR: [-75, 0, -6], shinR: [95, 0, 0], footR: [20, 0, 0],
        thighL: [-12, 0, 2], shinL: [22, 0, 0], footL: [-10, 0, 0],
        uarmL: [-55, 0, -14], farmL: [-40, 0, 0], handL: [-10, 0, 0], fingL: [0, 0, -50], fing2L: [0, 0, -40],
        uarmR: [-48, 0, 8], farmR: [-52, 0, 0], handR: [-10, 0, 0], fingR: [0, 0, 50], fing2R: [0, 0, 40] }],
      [0.43, { pos: [0, 0.12, 0], thighL: [-6, 0, 2], shinL: [10, 0, 0], footL: [25, 0, 0], head: [4, 0, -6], chest: [10, 0, -3] }],
      [0.56, { pos: [0, -0.02, 0], thighL: [-12, 0, 2], shinL: [22, 0, 0], footL: [-10, 0, 0], head: [10, 0, 0], chest: [14, 0, 0] }],
    ],
    post(t, p) { if (t > 0.3) { const ph = (t - 0.3) / 0.26; p[CI.hips + 1] += 10 * Math.sin(ph * Math.PI * 2); } },
  });

  add('cover_face', {
    dur: 1.0, loop: true, loopFrom: 0.4, face: [[0, 'pain']],
    keys: [
      [0, {}],
      [0.12, { pos: [0, 0.02, -0.03], spine: [-10, 0, 0], head: [-18, 0, 0], ...S({ uarmL: [-30, 0, 30], farmL: [-60, 0, 0] }) }],
      [0.4, { pos: [0, -0.06, -0.02], spine: [12, 0, 0], chest: [8, 0, 0], neck: [4, 0, 0], head: [4, 0, 0],
        ...S({ uarmL: [-75, 0, -18], farmL: [-118, 0, 0], handL: [0, 0, -15], fingL: [0, 0, -8], fing2L: [0, 0, -6], thighL: [-6, 0, 2], shinL: [14, 0, 0] }) }],
      [0.6, { head: [6, 14, 0], chest: [8, 6, 0] }],
      [0.8, { head: [6, -14, 0], chest: [8, -6, 0] }],
      [1.0, { head: [4, 0, 0], chest: [8, 0, 0] }],
    ],
  });

  add('cover_butt', {
    dur: 1.3, face: [[0, 'shock'], [0.6, 'pain']],
    keys: [
      [0, {}],
      [0.1, { pos: [0, -0.05, 0], spine: [8, 0, 0], ...S({ shinL: [20, 0, 0], thighL: [-8, 0, 0] }) }],
      [0.3, { pos: [0, 0.22, 0.03], spine: [-18, 0, 0], chest: [-10, 0, 0], head: [-14, 0, 0],
        ...S({ uarmL: [38, -80, 34], farmL: [-55, 0, 0], handL: [0, 0, 20], thighL: [-4, 0, 3], shinL: [30, 0, 0], footL: [30, 0, 0] }) }],
      [0.52, { pos: [0, -0.04, 0.02], spine: [-8, 0, 0], ...S({ uarmL: [36, -80, 33], farmL: [-56, 0, 0], thighL: [-14, 0, 3], shinL: [24, 0, 0], footL: [-8, 0, 0] }) }],
      [0.75, { pos: [0, 0.03, 0.0], hips: [0, 0, 6], head: [-6, -20, 0] }],
      [1.0, { pos: [0, -0.01, 0], hips: [0, 0, -6], head: [-6, 20, 0] }],
      [1.3, { pos: [0, 0, 0], hips: [0, 0, 0], head: [0, 0, 0], spine: [0, 0, 0], chest: [0, 0, 0], ...S({ uarmL: [2, 0, 7], farmL: [-10, 0, 0], handL: [0, 0, 0], thighL: [0, 0, 1], shinL: [2, 0, 0], footL: [-2, 0, 0] }) }],
    ],
  });

  add('throw_newspaper', {
    dur: 1.35, face: [[0, 'angry'], [0.62, 'talk'], [1.1, 'angry']],
    props: [[0.3, 'newspaper', { conjure: true }], [0.68, null, { throw: true }]],
    keys: [
      [0, {}],
      [0.2, { spine: [4, 0, 0], uarmR: [-30, 0, -55], farmR: [-30, 0, 0], handR: [0, 0, 20], fingR: [0, 0, -20], head: [0, -20, 0] }],
      [0.3, { uarmR: [-50, 0, -75], farmR: [-20, 0, 0], fingR: [0, 0, 40], head: [0, -30, 0] }],   // flourish: paper appears
      [0.52, { pos: [0, -0.02, -0.04], spine: [-14, 25, 0], chest: [-8, 20, 0], head: [-4, -20, 0],
        uarmR: [-165, 0, -25], farmR: [-70, 0, 0], handR: [20, 0, 0], fingR: [0, 0, 50], fing2R: [0, 0, 40],
        uarmL: [-60, 0, 30], farmL: [-20, 0, 0], thighL: [-20, 0, 2], shinL: [10, 0, 0] }],
      [0.68, { pos: [0, -0.06, 0.06], spine: [22, -18, 0], chest: [14, -12, 0], head: [-8, 10, 0],
        uarmR: [-95, 0, -10], farmR: [-10, 0, 0], handR: [-20, 0, 0],
        uarmL: [20, 0, 20], farmL: [-40, 0, 0], thighL: [-32, 0, 2], shinL: [26, 0, 0], thighR: [16, 0, -2], shinR: [14, 0, 0] }],
      [0.85, { spine: [30, -24, 0], chest: [16, -14, 0], uarmR: [-30, 20, 15], farmR: [-15, 0, 0], handR: [-10, 0, 0], fingR: [0, 0, 0], fing2R: [0, 0, 0] }],
      [1.35, { pos: [0, 0, 0], spine: [2, 0, 0], chest: [0, 0, 0], head: [0, 0, 0], ...S({ uarmL: [2, 0, 7], farmL: [-10, 0, 0], handL: [0, 0, 0], fingL: [0, 0, -14], fing2L: [0, 0, -12], thighL: [0, 0, 1], shinL: [2, 0, 0] }) }],
    ],
    ev: { release: 0.68 },
  });

  add('whack', {
    dur: 1.5, face: [[0, 'angry'], [0.5, 'talk'], [0.95, 'angry']],
    props: [[0, 'rolled']],
    keys: [
      [0, { uarmR: [-40, 0, -10], farmR: [-60, 0, 0] }],
      [0.4, { pos: [0, 0.02, -0.03], spine: [-12, 0, 0], chest: [-8, 0, 0], head: [8, 0, 0],
        uarmR: [-175, 0, -5], farmR: [-80, 0, 0], handR: [30, 0, 0], uarmL: [-30, 0, 30], farmL: [-30, 0, 0],
        ...S({ footL: [8, 0, 0] }) }],
      [0.5, { pos: [0, -0.2, 0.06], spine: [38, 0, 0], chest: [28, 0, 0], neck: [-18, 0, 0], head: [-6, 0, 0],
        uarmR: [-45, 0, -4], farmR: [-5, 0, 0], handR: [-10, 0, 0], uarmL: [10, 0, 40], farmL: [-50, 0, 0],
        ...S({ thighL: [-34, 0, 4], shinL: [50, 0, 0], footL: [-16, 0, 0] }) }],
      [0.56, { pos: [0, -0.22, 0.07], spine: [42, 0, 0], uarmR: [-35, 0, -4], handR: [-14, 0, 0] }],
      [0.85, { pos: [0, -0.18, 0.05], spine: [36, 0, 0], uarmR: [-45, 0, -4], handR: [-6, 0, 0] }],
      [1.5, { pos: [0, 0, 0], spine: [2, 0, 0], chest: [0, 0, 0], neck: [-2, 0, 0], head: [2, 0, 0],
        uarmR: [-30, 0, -8], farmR: [-50, 0, 0], handR: [0, 0, 0], uarmL: [2, 0, 7], farmL: [-10, 0, 0],
        ...S({ thighL: [0, 0, 1], shinL: [2, 0, 0], footL: [-2, 0, 0] }) }],
    ],
    ev: { hit: 0.52 },
  });

  add('slip_faceplant', {
    dur: 1.5, hold: true, face: [[0, 'shock'], [0.9, 'pain'], [1.25, 'dizzy']],
    keys: [
      [0, {}],
      [0.15, { pos: [0, -0.04, 0], thighR: [30, 0, -4], shinR: [20, 0, 0], thighL: [-20, 0, 6], ...S({ uarmL: [-60, 0, 50], farmL: [-20, 0, 0] }), head: [-12, 0, 0] }],
      [0.3, { pos: [0, 0.04, 0.08], hips: [20, 0, 0], thighR: [50, 0, -6], thighL: [30, 0, 10], shinL: [40, 0, 0], shinR: [10, 0, 0],
        uarmL: [-150, 0, 60], uarmR: [-30, 0, -90], farmL: [-30, 0, 0], farmR: [-50, 0, 0], head: [-20, 0, 0] }],
      [0.5, { pos: [0, -0.3, 0.3], hips: [55, 0, 0], thighR: [10, 0, -6], thighL: [5, 0, 8], shinL: [30, 0, 0], shinR: [50, 0, 0],
        uarmL: [-170, 0, 30], uarmR: [-150, 0, -40], head: [-30, 0, 0] }],
      [0.7, { pos: [0, -0.8, 0.44], hips: [86, 0, 0], ...S({ thighL: [2, 0, 6], shinL: [30, 0, 0], footL: [30, 0, 0] }), spine: [0, 0, 0], chest: [0, 0, 0],
        ...S({ uarmL: [-175, 0, 20], farmL: [-10, 0, 0] }), head: [-30, 0, 0], neck: [-10, 0, 0] }],
      [0.78, { pos: [0, -0.86, 0.46], hips: [92, 0, 0], ...S({ thighL: [0, 0, 8], shinL: [70, 0, 0], footL: [10, 0, 0] }), head: [-25, 0, 0] }],
      [0.95, { ...S({ shinL: [90, 0, 0] }) }],
      [1.15, { pos: [0, -0.86, 0.46], hips: [90, 0, 0], ...S({ shinL: [6, 0, 0], footL: [40, 0, 0], uarmL: [-170, 0, 30], farmL: [-5, 0, 0] }), head: [-20, 0, 6] }],
      [1.5, { ...S({ shinL: [3, 0, 0], footL: [50, 0, 0] }), head: [-18, 0, 10] }],
    ],
    ev: { impact: 0.76 },
  });
  add('lie_still', {
    base: C.slip_faceplant.ck[C.slip_faceplant.ck.length - 1].v, dur: 3, loop: true, hold: true, face: [[0, 'closed']],
    keys: [[0, {}], [1.5, { chest: [2, 0, 0], head: [-17, 0, 10] }], [2.7, { footR: [40, 0, 0] }], [2.85, { footR: [55, 0, 0] }], [3, {}]],
  });

  // ---------------- house actions ----------------
  add('pound_door', {
    dur: 0.62, loop: true, loopFrom: 0.2, face: [[0, 'angry']], talk: true,
    keys: [
      [0, {}],
      [0.2, { pos: [0, 0, 0.02], spine: [8, 0, 0], head: [-6, 0, 0], ...S({ fingL: [0, 0, -80], fing2L: [0, 0, -80], thumbL: [0, 0, -30] }),
        uarmL: [-130, 0, 10], farmL: [-30, 0, 0], uarmR: [-95, 0, -14], farmR: [-70, 0, 0] }],
      [0.36, { uarmL: [-100, 0, 14], farmL: [-50, 0, 0], uarmR: [-135, 0, -10], farmR: [-25, 0, 0], chest: [4, 6, 0], head: [-2, 0, 0] }],
      [0.5, { uarmL: [-135, 0, 10], farmL: [-25, 0, 0], uarmR: [-100, 0, -14], farmR: [-50, 0, 0], chest: [4, -6, 0], head: [-6, 0, 0] }],
      [0.62, { uarmL: [-130, 0, 10], farmL: [-30, 0, 0], uarmR: [-95, 0, -14], farmR: [-70, 0, 0], chest: [0, 0, 0] }],
    ],
    ev: { thumpL: 0.36, thumpR: 0.5 },
  });

  add('give_bowl', {
    dur: 2.2, face: [[0, 'happy']],
    props: [[0, 'bowl']],
    keys: [
      [0, { ...S({ uarmL: [-40, 0, -5], farmL: [-60, 0, 0], handL: [0, 0, 0] }), fingL: [0, 0, -30] }],
      [0.5, { pos: [0, -0.08, 0], spine: [20, 0, 0], chest: [10, 0, 0], ...S({ thighL: [-20, 0, 3], shinL: [30, 0, 0], footL: [-10, 0, 0], handL: [-30, 0, 0] }) }],
      [1.0, { pos: [0, -0.47, -0.1], spine: [52, 0, 0], chest: [22, 0, 0], neck: [-38, 0, 0], head: [10, 0, 0],
        ...S({ thighL: [-90, 0, 14], shinL: [115, 0, 0], footL: [-25, 0, 0], uarmL: [-80, 0, 0], farmL: [-15, 0, 0], handL: [-45, 0, 0] }) }],
      [1.2, { pos: [0, -0.49, -0.1] }],
      [1.45, { pos: [0, -0.4, -0.08], ...S({ uarmL: [-30, 0, 10], farmL: [-40, 0, 0], handL: [10, 0, 0] }), head: [6, 0, -6] }],
      [1.85, { pos: [0, -0.02, 0], spine: [6, 0, 0], chest: [2, 0, 0], neck: [-4, 0, 0], head: [10, 0, 0],
        ...S({ thighL: [-4, 0, 1], shinL: [6, 0, 0], footL: [-2, 0, 0], uarmL: [0, 0, 8], farmL: [-15, 0, 0], handL: [0, 0, 0] }) }],
      [2.2, { pos: [0, 0, 0], spine: [2, 0, 0], neck: [-2, 0, 0], head: [6, 0, 0], ...S({ thighL: [0, 0, 1], shinL: [2, 0, 0], uarmL: [2, 0, 7], farmL: [-10, 0, 0], fingL: [0, 0, -14] }) }],
    ],
    ev: { place: 1.2 },
  });
  C.give_bowl.props.push([1.2, null]);

  // generic "bend down and pick something up" (newspaper, plate): right hand reaches the floor ~0.6 s; NO props
  add('pick_up', {
    dur: 1.2, face: [[0, 'neutral']],
    keys: [
      [0, {}],
      [0.3, { pos: [0, -0.1, 0], spine: [24, 0, 0], chest: [10, 0, 0], ...S({ thighL: [-24, 0, 3], shinL: [34, 0, 0], footL: [-10, 0, 0] }),
        uarmR: [-40, 0, -4], farmR: [-20, 0, 0] }],
      [0.6, { pos: [0, -0.44, -0.1], spine: [50, 0, 0], chest: [20, 0, 0], neck: [-34, 0, 0], head: [12, 0, 0],
        ...S({ thighL: [-86, 0, 14], shinL: [110, 0, 0], footL: [-24, 0, 0] }),
        uarmR: [-82, 0, -2], farmR: [-12, 0, 0], handR: [-40, 0, 0], fingR: [0, 0, 50],
        uarmL: [-30, 0, 14], farmL: [-50, 0, 0] }],
      [0.72, { pos: [0, -0.45, -0.1], fingR: [0, 0, 70] }],
      [1.0, { pos: [0, -0.08, 0], spine: [12, 0, 0], chest: [4, 0, 0], neck: [-6, 0, 0], head: [6, 0, 0],
        ...S({ thighL: [-10, 0, 2], shinL: [14, 0, 0], footL: [-4, 0, 0] }), uarmR: [-40, 0, -6], farmR: [-55, 0, 0], handR: [0, 0, 0], fingR: [0, 0, 20], uarmL: [-4, 0, 8], farmL: [-12, 0, 0] }],
      [1.2, { pos: [0, 0, 0], spine: [2, 0, 0], chest: [0, 0, 0], neck: [-2, 0, 0], head: [4, 0, 0],
        ...S({ thighL: [0, 0, 1], shinL: [2, 0, 0], footL: [0, 0, 0], uarmL: [2, 0, 7], farmL: [-10, 0, 0], handL: [0, 0, 0], fingL: [0, 0, -14] }) }],
    ],
    ev: { grab: 0.65 },
  });

  add('serve', {
    dur: 2.2, face: [[0, 'happy']], props: [[0, 'spoon']],
    keys: [
      [0, { uarmR: [-35, 0, -10], farmR: [-60, 0, 0] }],
      [0.4, { spine: [16, 0, 0], chest: [8, -8, 0], head: [16, -10, 0], uarmR: [-52, 10, -2], farmR: [-40, 0, 0], handR: [30, 0, 0] }],     // into the pan
      [0.7, { uarmR: [-48, 10, -2], farmR: [-46, 0, 0], handR: [40, 0, 0] }],                                                             // scoop
      [1.0, { spine: [12, 0, 0], chest: [6, 10, 0], head: [16, 12, 0], uarmR: [-50, -25, -12], farmR: [-60, 0, 0], handR: [10, 0, 0] }],   // lift across
      [1.3, { uarmR: [-48, -30, -10], farmR: [-46, 0, 0], handR: [-25, 0, -20] }],                                                        // flip onto plate
      [1.45, { handR: [-5, 0, -10] }], [1.6, { handR: [-25, 0, -20] }],                                                                  // tap tap
      [2.2, { spine: [2, 0, 0], chest: [0, 0, 0], head: [2, 0, 0], uarmR: [-30, 0, -8], farmR: [-50, 0, 0], handR: [0, 0, 0] }],
    ],
    ev: { scoop: 0.7, drop: 1.3 },
  });

  add('open_fridge', {
    dur: 1.6, face: [[0, 'neutral'], [1.0, 'happy']],
    keys: [
      [0, {}],
      [0.4, { spine: [6, 0, 0], uarmR: [-62, 0, -4], farmR: [-28, 0, 0], handR: [0, 0, 0], fingR: [0, 0, 60], fing2R: [0, 0, 50] }],
      [0.55, { uarmR: [-64, 0, -6], farmR: [-30, 0, 0] }],
      [1.0, { pos: [0, 0, -0.04], spine: [0, -10, 0], chest: [-4, -14, 0], uarmR: [-55, -20, -60], farmR: [-20, 0, 0], head: [6, 20, 0] }],
      [1.6, { pos: [0, 0, 0.0], spine: [10, 0, 0], chest: [6, 0, 0], head: [12, 0, 0], uarmR: [-50, -15, -60], farmR: [-15, 0, 0] }],
    ],
    ev: { open: 0.55 },
  });
  add('put_in_fridge', {
    dur: 1.8, face: [[0, 'neutral']], props: [[0, 'pan']],
    keys: [
      [0, { ...S({ uarmL: [-38, 0, -2], farmL: [-58, 0, 0] }) }],
      [0.6, { pos: [0, -0.04, 0.02], spine: [18, 0, 0], chest: [8, 0, 0], ...S({ uarmL: [-72, 0, -2], farmL: [-30, 0, 0], thighL: [-6, 0, 2], shinL: [12, 0, 0] }) }],
      [0.9, { pos: [0, -0.05, 0.04], spine: [22, 0, 0], ...S({ uarmL: [-80, 0, -2], farmL: [-20, 0, 0] }) }],
      [1.2, { pos: [0, 0, 0], spine: [4, 0, 0], ...S({ uarmL: [-30, 0, 8], farmL: [-30, 0, 0], thighL: [0, 0, 1], shinL: [2, 0, 0] }) }],
      [1.5, { head: [4, 0, 0] }],
      [1.8, { spine: [2, 0, 0], chest: [0, 0, 0], ...S({ uarmL: [-5, 0, 7], farmL: [-10, 0, 0] }) }],
    ],
    ev: { place: 0.9 },
  });
  C.put_in_fridge.props.push([0.9, null]);

  add('close_window', {
    dur: 2.4, face: [[0, 'shock'], [0.5, 'angry'], [1.5, 'sad']],
    keys: [
      [0, {}],
      [0.4, { spine: [-4, 0, 0], head: [-14, 0, 0], ...S({ uarmL: [-150, 0, 6], farmL: [-25, 0, 0], handL: [-20, 0, 0], fingL: [0, 0, -10] }) }],
      [0.6, { pos: [0, 0.03, 0], ...S({ uarmL: [-165, 0, 4], farmL: [-10, 0, 0], footL: [12, 0, 0] }), head: [-18, 0, 0] }],
      [0.95, { pos: [0, -0.04, 0], ...S({ uarmL: [-120, 0, 8], farmL: [-35, 0, 0], footL: [0, 0, 0] }), spine: [8, 0, 0], head: [-6, 0, 0] }],
      [1.1, { pos: [0, -0.06, 0], ...S({ uarmL: [-110, 0, 8] }) }],
      // brrr: hug self and shiver
      [1.45, { pos: [0, -0.04, 0], spine: [12, 0, 0], chest: [6, 0, 0], neck: [6, 0, 0],
        ...S({ uarmL: [-35, -80, -5], farmL: [-110, 0, 0], handL: [0, 0, -10] }) }],
      [2.4, { pos: [0, -0.04, 0] }],
    ],
    ev: { close: 0.95 },
    post(t, p) { if (t > 1.4) { const j = Math.sin(t * 80) * 1.5; p[CI.chest + 2] += j; p[CI.head + 2] += j; p[CI.uarmL + 2] += j; p[CI.uarmR + 2] += j; } },
  });

  add('investigate', {
    dur: 3.6, loop: true, face: [[0, 'neutral']],
    keys: [
      [0, { ...S({ uarmL: [10, 0, 45], farmL: [-95, -90, 0], handL: [0, 0, 0] }), spine: [6, 0, 0] }],
      [0.6, { head: [6, 40, 0], chest: [4, 12, 0], spine: [8, 6, 0] }],
      [1.2, { head: [8, 40, 0] }],
      [1.8, { head: [6, -40, 0], chest: [4, -12, 0], spine: [8, -6, 0] }],
      [2.4, { head: [10, -40, 0] }],
      [3.0, { head: [16, 0, 8], chest: [10, 0, 0], spine: [12, 0, 0] }],
      [3.6, { head: [0, 0, 0], chest: [0, 0, 0], spine: [6, 0, 0] }],
    ],
  });
  add('scratch_head', {
    dur: 2.0, face: [[0, 'sad']],
    keys: [
      [0, {}],
      [0.35, { uarmR: [-140, 0, -75], farmR: [-110, 30, 0], handR: [-20, 0, 0], head: [6, 0, 10] }],
      [0.5, { farmR: [-120, 30, 0] }], [0.65, { farmR: [-102, 30, 0] }], [0.8, { farmR: [-120, 30, 0] }], [0.95, { farmR: [-102, 30, 0] }], [1.1, { farmR: [-120, 30, 0] }],
      [1.5, { uarmR: [-140, 0, -75], farmR: [-110, 30, 0], head: [4, 0, 14] }],
      [2.0, { uarmR: [2, 0, -7], farmR: [-10, 0, 0], handR: [0, 0, 0], head: [2, 0, 0] }],
    ],
  });
  add('sigh', {
    dur: 2.2, face: [[0, 'sad']],
    keys: [
      [0, {}],
      [0.6, { pos: [0, 0.01, 0], chest: [-6, 0, 0], head: [-10, 0, 0], ...S({ clavL: [0, 0, 6], uarmL: [0, 0, 4] }) }],
      [1.3, { pos: [0, -0.02, 0], spine: [10, 0, 0], chest: [10, 0, 0], head: [20, 0, 0], ...S({ clavL: [0, 0, -4], uarmL: [4, 0, 4], farmL: [-4, 0, 0] }) }],
      [2.2, { pos: [0, 0, 0], spine: [2, 0, 0], chest: [0, 0, 0], head: [2, 0, 0], ...S({ clavL: [0, 0, 0], uarmL: [2, 0, 7], farmL: [-10, 0, 0] }) }],
    ],
  });

  // ---------------- upper-body overlays (walkable) ----------------
  add('carry', {
    dur: 1, loop: true, mask: 'upper',
    keys: [[0, { ...S({ uarmL: [-30, 0, -4], farmL: [-70, 0, 0], handL: [0, 0, 0] }), chest: [-4, 0, 0] }], [1, {}]],
  });
  add('talk', {
    dur: 3.2, loop: true, mask: 'upper', talk: true, face: [[0, 'talk']],
    keys: [
      [0, {}],
      [0.5, { uarmR: [-30, 0, -14], farmR: [-70, 40, 0], handR: [-10, 0, 0], head: [-4, 6, 0] }],
      [1.1, { uarmR: [-25, 0, -24], farmR: [-60, 60, 0], head: [2, -4, 4] }],
      [1.7, { uarmR: [-10, 0, -10], farmR: [-30, 0, 0], uarmL: [-32, 0, 16], farmL: [-75, -40, 0], head: [-2, 4, -3] }],
      [2.5, { uarmL: [-20, 0, 24], farmL: [-50, -50, 0], head: [2, 0, 0] }],
      [3.2, {}],
    ],
  });
  add('talk_angry', {
    dur: 2.4, loop: true, mask: 'upper', talk: true, face: [[0, 'angry']],
    keys: [
      [0, {}],
      [0.3, { chest: [8, 0, 0], head: [-8, 0, 0], uarmR: [-75, 0, -6], farmR: [-30, 0, 0], fingR: [0, 0, 0], handR: [-10, 0, 0], uarmL: [10, 0, 45], farmL: [-95, -90, 0] }],
      [0.5, { uarmR: [-70, 0, -6], farmR: [-38, 0, 0] }], [0.7, { uarmR: [-78, 0, -6], farmR: [-26, 0, 0] }], [0.9, { uarmR: [-70, 0, -6], farmR: [-38, 0, 0] }],
      [1.4, { uarmR: [-40, 0, -30], farmR: [-60, 0, 0], head: [-4, 10, 0] }],
      [1.9, { uarmR: [-75, 0, -6], farmR: [-30, 0, 0], head: [-8, -6, 0] }],
      [2.4, {}],
    ],
  });
  return C;
}

// rotate the whole body about a floor pivot (in Jon root space) by `deg` around X
function rotateAbout(p, pivot, deg) {
  const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  const hy = 0.98 + p[POS + 1] - pivot[1], hz = p[POS + 2] - pivot[2];
  p[POS + 1] = hy * c - hz * s + pivot[1] - 0.98;
  p[POS + 2] = hy * s + hz * c + pivot[2];
  p[CI.hips] += deg;
}
