// Chapter Two clips shared by every human (Jon, Lyman, delivery man). Same conventions as jon_clips.js:
// thigh -x = leg forward, shin +x = knee bend, spine/chest +x = lean forward, uarm -x = arm forward/up,
// uarmL +z = arm out to the side, farm -x = elbow bend, head +x = nod down. S() mirrors L onto R.
import { S, compileClip, writeKey, REST, CI, POS } from './jon_anim.js';
import { SIT, SIT_BASE, STAND } from './jon_clips.js';

const ARMS_REST = S({ uarmL: [2, 0, 7], farmL: [-10, 0, 0], handL: [0, 0, 0], fingL: [0, 0, -14], fing2L: [0, 0, -12], thumbL: [0, 0, -5] });
const LEGS_REST = S({ thighL: [0, 0, 1], shinL: [2, 0, 0], footL: [-2, 0, 0], toeL: [0, 0, 0] });
const TORSO_REST = { pos: [0, 0, 0], hips: [0, 0, 0], spine: [2, 0, 0], chest: [0, 0, 0], neck: [-2, 0, 0], head: [2, 0, 0] };
const BACK = { ...TORSO_REST, ...ARMS_REST, ...LEGS_REST };
// sofa: slouched back into the cushions, legs out a little
const SLOUCH = {
  pos: [0, -0.86, -0.08], hips: [-10, 0, 0], spine: [-6, 0, 0], chest: [-4, 0, 0], neck: [6, 0, 0], head: [6, 0, 0],
  ...S({ thighL: [-72, 0, 6], shinL: [70, 0, 0], footL: [-6, 0, 0], uarmL: [-12, 0, 16], farmL: [-50, 0, 0], handL: [10, 0, 0] }),
};
const SLOUCH_BASE = writeKey(REST.slice(), SLOUCH);

export function addHumanClips(C) {
  const add = (name, def) => { C[name] = compileClip({ name, ...def }); };
  const sitB = { base: SIT_BASE };

  // ---------------- seated ----------------
  add('watch_tv', {
    base: SLOUCH_BASE, dur: 4.8, loop: true, hold: true, face: [[0, 'happy']],
    keys: [
      [0, {}],
      [1.4, { head: [4, 6, 3] }],
      [2.2, { head: [2, 4, 0], chest: [-6, 0, 0] }],
      // chuckle at the telly
      [2.5, { chest: [-9, 0, 0], head: [-4, 4, 0], pos: [0, -0.85, -0.08] }],
      [2.7, { chest: [-5, 0, 0], head: [4, 4, 0], pos: [0, -0.86, -0.08] }],
      [2.9, { chest: [-9, 0, 0], head: [-4, 4, 0], pos: [0, -0.85, -0.08] }],
      [3.2, { chest: [-4, 0, 0], head: [6, 0, 0], pos: [0, -0.86, -0.08] }],
      [4.8, {}],
    ],
  });
  add('eat_soup', {
    ...sitB, dur: 2.6, loop: true, hold: true, face: [[0, 'happy']], props: [[0, 'spoon']],
    keys: [
      [0, { uarmR: [-28, 0, -6], farmR: [-62, 0, 0], handR: [20, 0, 0], head: [6, 0, 0] }],
      [0.45, { uarmR: [-24, 0, 2], farmR: [-55, 0, 0], handR: [40, 0, -10], head: [14, 0, 0], chest: [8, 0, 0] }],     // dip
      [0.8, { uarmR: [-30, 0, 4], farmR: [-60, 0, 0], handR: [10, 0, 0] }],
      [1.15, { uarmR: [-32, 0, 10], farmR: [-138, 40, 0], handR: [-20, 0, 0], head: [-2, 0, 0], chest: [10, 0, 0] }],  // to mouth
      [1.45, { uarmR: [-32, 0, 10], farmR: [-140, 40, 0], head: [-8, 0, 0], chest: [6, 0, 0] }],                       // slurp
      [1.9, { uarmR: [-26, 0, -4], farmR: [-80, 10, 0], handR: [15, 0, 0], head: [2, 6, 0], chest: [3, 0, 0] }],
      [2.6, { uarmR: [-28, 0, -6], farmR: [-62, 0, 0], handR: [20, 0, 0], head: [6, 0, 0] }],
    ],
    ev: { slurp: 1.3 },
  });
  C.eat_soup.talkWindow = [1.9, 2.5];
  add('drink_coffee', {
    base: SLOUCH_BASE, dur: 3.6, loop: true, hold: true, face: [[0, 'neutral']], props: [[0, 'mug']],
    keys: [
      [0, { uarmR: [-30, 0, -8], farmR: [-75, 20, 0], handR: [0, 0, 0] }],
      [0.6, { uarmR: [-36, 0, 6], farmR: [-128, 40, 0], handR: [-25, 0, 0], head: [-4, 0, 0] }],
      [1.0, { uarmR: [-38, 0, 8], farmR: [-138, 40, 0], handR: [-40, 0, 0], head: [-14, 0, 0] }],   // sip
      [1.5, { uarmR: [-36, 0, 6], farmR: [-128, 40, 0], handR: [-25, 0, 0], head: [-4, 0, 0] }],
      [2.1, { uarmR: [-30, 0, -8], farmR: [-75, 20, 0], handR: [0, 0, 0], head: [6, 0, 0] }],
      [3.6, {}],
    ],
    ev: { sip: 1.0 },
  });
  // seated jolt (Odie yips): the mug hand jerks forward and up
  add('spill', {
    base: SLOUCH_BASE, dur: 1.6, hold: true, face: [[0, 'shock']], props: [[0, 'mug']],
    keys: [
      [0, { uarmR: [-30, 0, -8], farmR: [-75, 20, 0], handR: [0, 0, 0] }],
      [0.12, { pos: [0, -0.8, -0.04], spine: [-12, 0, 0], chest: [-8, 0, 0], head: [-14, 0, 0],
        uarmR: [-70, 0, -30], farmR: [-40, 0, 0], handR: [60, 0, 0], ...S({ thighL: [-60, 0, 8], shinL: [40, 0, 0] }), uarmL: [-30, 0, 50], farmL: [-40, 0, 0] }],
      [0.3, { uarmR: [-80, -20, -40], farmR: [-20, 0, 0], handR: [90, 0, 0] }],
      [0.7, { pos: [0, -0.84, -0.06], uarmR: [-50, -10, -30], farmR: [-40, 0, 0], handR: [40, 0, 0], head: [-6, -14, 0] }],
      [1.6, { pos: [0, -0.86, -0.08], spine: [-6, 0, 0], chest: [-4, 0, 0], head: [6, -18, 0], ...S({ thighL: [-72, 0, 6], shinL: [70, 0, 0] }) }],
    ],
    ev: { spill: 0.28 },
  });
  // hot coffee lands on the lap: bolt upright, flap at the trousers
  add('spilled_on', {
    base: SLOUCH_BASE, dur: 1.8, hold: true, face: [[0, 'shock'], [0.3, 'pain']],
    keys: [
      [0, {}],
      [0.15, { pos: [0, -0.78, -0.02], spine: [-14, 0, 0], chest: [-10, 0, 0], head: [-16, 0, 0], ...S({ uarmL: [-20, 0, 60], farmL: [-30, 0, 0], fingL: [0, 0, 20], thighL: [-90, 0, 14], shinL: [50, 0, 0] }) }],
      [0.4, { pos: [0, -0.8, 0.0], spine: [24, 0, 0], chest: [14, 0, 0], head: [22, 0, 0], ...S({ uarmL: [-36, 0, 14], farmL: [-50, 0, 0], handL: [30, 0, 0] }) }],
      [0.55, { ...S({ uarmL: [-28, 0, 22], farmL: [-38, 0, 0], handL: [-20, 0, 0] }) }],
      [0.7, { ...S({ uarmL: [-36, 0, 14], farmL: [-50, 0, 0], handL: [30, 0, 0] }) }],
      [0.85, { ...S({ uarmL: [-28, 0, 22], farmL: [-38, 0, 0], handL: [-20, 0, 0] }) }],
      [1.0, { ...S({ uarmL: [-36, 0, 14], farmL: [-50, 0, 0], handL: [30, 0, 0] }) }],
      [1.8, { pos: [0, -0.82, -0.04], spine: [10, 0, 0], chest: [4, 0, 0], head: [10, 0, 0], ...S({ uarmL: [-24, 0, 24], farmL: [-40, 0, 0], handL: [0, 0, 0], thighL: [-80, 0, 8], shinL: [64, 0, 0] }) }],
    ],
  });

  // ---------------- standing reactions ----------------
  add('eyes_widen', {
    dur: 2.0, face: [[0, 'shock']],
    keys: [
      [0, {}],
      [0.18, { pos: [0, 0.02, -0.04], spine: [-10, 0, 0], chest: [-8, 0, 0], neck: [-6, 0, 0], head: [-10, 0, 0], ...S({ uarmL: [-10, 0, 22], farmL: [-30, 0, 0], fingL: [0, 0, 20], fing2L: [0, 0, 10] }), footL: [6, 0, 0], footR: [6, 0, 0] }],
      [0.4, { pos: [0, 0.0, -0.05], spine: [-12, 0, 0], head: [-6, 0, 0] }],
      [1.5, { pos: [0, 0.0, -0.05], spine: [-11, 0, 0], head: [-5, 0, 0] }],
      [2.0, { ...BACK }],
    ],
  });
  add('poked', {
    dur: 1.6, face: [[0, 'pain']],
    keys: [
      [0, {}],
      [0.08, { pos: [0, 0.01, -0.05], spine: [-14, 0, 0], chest: [-10, 0, 0], neck: [-14, 0, 0], head: [-18, 0, 0], ...S({ uarmL: [-10, 0, 26], farmL: [-30, 0, 0] }) }],
      [0.35, { pos: [0, -0.02, -0.02], spine: [6, 0, 0], chest: [6, 0, 0], neck: [0, 0, 0], head: [6, -10, 0],
        uarmR: [-70, 0, -18], farmR: [-120, 0, 0], handR: [0, 0, -15], fingR: [0, 0, 8], uarmL: [2, 0, 12], farmL: [-20, 0, 0] }],
      [0.6, { head: [4, 10, 6], chest: [6, 4, 0] }],
      [0.85, { head: [6, -8, -4], chest: [6, -4, 0] }],
      [1.6, { ...BACK }],
    ],
  });
  add('frightened', {
    dur: 1.2, loop: true, loopFrom: 0.3, face: [[0, 'shock']],
    keys: [
      [0, {}],
      [0.3, { pos: [0, -0.12, -0.04], spine: [16, 0, 0], chest: [10, 0, 0], neck: [-12, 0, 0], head: [-4, 0, 0],
        ...S({ uarmL: [-80, -20, -6], farmL: [-110, 0, 0], handL: [-20, 0, 0], fingL: [0, 0, 10], thighL: [-20, 0, 6], shinL: [40, 0, 0], footL: [-18, 0, 0] }) }],
      [0.75, { head: [0, 8, 0] }],
      [1.2, { head: [-4, 0, 0] }],
    ],
    post(t, p) { const j = Math.sin(t * 85) * 1.4; p[CI.chest + 2] += j; p[CI.head + 2] += j * 1.4; p[CI.uarmL + 2] += j; p[CI.uarmR + 2] -= j; p[CI.shinL] += j; p[CI.shinR] -= j; },
  });
  // Ch2 L9: cheery wave while walking past (upper-body overlay)
  add('sing_morning', {
    dur: 1.6, loop: true, mask: 'upper', talk: true, face: [[0, 'happy']],
    keys: [
      [0, { uarmR: [-150, 0, -30], farmR: [-30, 0, 0], handR: [0, 0, 0], head: [-8, 0, 8], chest: [-4, 0, 0], fingR: [0, 0, 0], fing2R: [0, 0, 0] }],
      [0.4, { farmR: [-30, 30, 0], handR: [0, 0, -25], head: [-8, 0, -8] }],
      [0.8, { farmR: [-30, -20, 0], handR: [0, 0, 25], head: [-8, 0, 8] }],
      [1.2, { farmR: [-30, 30, 0], handR: [0, 0, -25], head: [-8, 0, -8] }],
      [1.6, { farmR: [-30, 0, 0], handR: [0, 0, 0], head: [-8, 0, 8] }],
    ],
  });
  add('hug', {
    dur: 2.4, loop: true, loopFrom: 1.0, face: [[0, 'happy']],
    keys: [
      [0, {}],
      [0.45, { pos: [0, 0, -0.02], spine: [-6, 0, 0], chest: [-6, 0, 0], head: [-10, 0, 0], ...S({ uarmL: [-60, 0, 60], farmL: [-10, 0, 0], fingL: [0, 0, 0] }) }],
      [1.0, { pos: [0, -0.05, 0.05], spine: [18, 0, 0], chest: [10, 0, 0], neck: [-6, 0, 0], head: [6, 0, 8],
        ...S({ uarmL: [-72, -30, 10], farmL: [-80, -10, 0], handL: [0, 0, -20], thighL: [-8, 0, 2], shinL: [14, 0, 0] }) }],
      [1.7, { hips: [0, 6, 0], chest: [10, 6, 0], head: [6, 0, -8] }],
      [2.4, { hips: [0, -6, 0], chest: [10, -6, 0], head: [6, 0, 8] }],
    ],
  });
  add('catch_mouse', {
    dur: 2.0, face: [[0, 'angry'], [0.62, 'shock'], [1.1, 'sad']],
    keys: [
      [0, {}],
      [0.25, { pos: [0, -0.1, -0.04], spine: [18, 0, 0], chest: [8, 0, 0], ...S({ uarmL: [-40, 0, 30], farmL: [-60, 0, 0], thighL: [-20, 0, 4], shinL: [40, 0, 0], footL: [-16, 0, 0] }) }],
      // pounce down: hands clap at the floor
      [0.55, { pos: [0, -0.5, 0.35], hips: [30, 0, 0], spine: [40, 0, 0], chest: [20, 0, 0], neck: [-30, 0, 0], head: [-10, 0, 0],
        ...S({ uarmL: [-95, 0, -6], farmL: [-10, 0, 0], handL: [-30, 0, 0], fingL: [0, 0, 0] }),
        thighL: [-70, 0, 6], shinL: [100, 0, 0], footL: [-28, 0, 0], thighR: [20, 0, -4], shinR: [60, 0, 0], footR: [10, 0, 0] }],
      [0.68, { pos: [0, -0.52, 0.36] }],
      [1.0, { pos: [0, -0.48, 0.34], head: [-20, 30, 0] }],
      [1.3, { head: [-20, -30, 0] }],
      [2.0, { ...BACK }],
    ],
    ev: { clap: 0.62 },
  });

  // ---------------- brawl (slapstick fight loop pieces; face the opponent) ----------------
  add('brawl_slap', {
    dur: 0.7, face: [[0, 'angry']],
    keys: [
      [0, {}],
      [0.18, { spine: [0, 20, 0], chest: [0, 20, 0], uarmR: [-80, 0, -60], farmR: [-60, 0, 0], handR: [0, 0, 30], fingR: [0, 0, 0], fing2R: [0, 0, 0], head: [0, -10, 0] }],
      [0.3, { spine: [6, -24, 0], chest: [6, -24, 0], uarmR: [-80, 50, -10], farmR: [-10, 0, 0], handR: [0, 0, -20], head: [0, 10, 0], pos: [0, -0.02, 0.05] }],
      [0.7, { ...BACK }],
    ],
    ev: { hit: 0.28 },
  });
  add('brawl_kick', {
    dur: 0.8, face: [[0, 'angry']],
    keys: [
      [0, {}],
      [0.2, { pos: [0, 0, -0.04], spine: [-8, 0, 0], thighR: [-30, 0, -4], shinR: [80, 0, 0], ...S({ uarmL: [-20, 0, 40], farmL: [-40, 0, 0] }) }],
      [0.35, { pos: [0, 0.02, -0.08], spine: [-16, 0, 0], chest: [-6, 0, 0], thighR: [-80, 0, -4], shinR: [6, 0, 0], footR: [20, 0, 0], thighL: [6, 0, 2], shinL: [8, 0, 0] }],
      [0.8, { ...BACK }],
    ],
    ev: { hit: 0.34 },
  });
  add('brawl_dodge', {
    dur: 0.7, face: [[0, 'shock']],
    keys: [
      [0, {}],
      [0.2, { pos: [0.12, -0.12, -0.04], hips: [0, 0, 8], spine: [10, 0, 14], chest: [6, 0, 10], head: [-6, 0, 10],
        ...S({ uarmL: [-60, 0, 20], farmL: [-90, 0, 0] }), thighL: [-20, 0, 8], shinL: [40, 0, 0], thighR: [10, 0, -10], shinR: [20, 0, 0] }],
      [0.45, { pos: [0.1, -0.1, -0.04] }],
      [0.7, { ...BACK }],
    ],
  });
  add('brawl_hit', {
    dur: 0.8, face: [[0, 'pain']],
    keys: [
      [0, {}],
      [0.1, { pos: [0, 0, -0.1], spine: [-16, 10, 0], chest: [-10, 10, 0], head: [-20, 30, 10], ...S({ uarmL: [-30, 0, 50], farmL: [-20, 0, 0] }), footL: [10, 0, 0], footR: [10, 0, 0] }],
      [0.35, { pos: [0, -0.04, -0.06], head: [-6, 18, 6] }],
      [0.8, { ...BACK }],
    ],
  });
  // flailing loop for inside the cartoon dust cloud
  add('brawl_tangle', {
    dur: 0.9, loop: true, face: [[0, 'angry']], talk: true,
    keys: [
      [0, { pos: [0, -0.06, 0], spine: [16, 20, 0], uarmL: [-140, 0, 40], farmL: [-40, 0, 0], uarmR: [-60, 0, -70], farmR: [-80, 0, 0], thighL: [-30, 0, 6], shinL: [40, 0, 0], head: [-10, -20, 0] }],
      [0.225, { pos: [0, 0.04, 0], spine: [-6, -10, 0], uarmL: [-50, 0, 80], farmL: [-90, 0, 0], uarmR: [-150, 0, -30], farmR: [-20, 0, 0], thighL: [0, 0, 2], shinL: [10, 0, 0], thighR: [-50, 0, -6], shinR: [60, 0, 0], head: [-14, 20, 0] }],
      [0.45, { pos: [0, -0.08, 0], spine: [20, -20, 0], uarmL: [-110, 0, 20], farmL: [-60, 0, 0], uarmR: [-30, 0, -50], farmR: [-100, 0, 0], thighR: [0, 0, -2], shinR: [10, 0, 0], thighL: [-40, 0, 8], shinL: [70, 0, 0], head: [6, -10, 10] }],
      [0.675, { pos: [0, 0.03, 0], spine: [0, 14, 0], uarmL: [-170, 0, 50], farmL: [-20, 0, 0], uarmR: [-90, 0, -80], farmR: [-30, 0, 0], thighL: [10, 0, 2], shinL: [20, 0, 0], thighR: [-40, 0, -8], shinR: [50, 0, 0], head: [-6, 10, -10] }],
    ],
  });

  // ---------------- delivery / TV / luggage ----------------
  const CARRY_ARMS = S({ uarmL: [-38, 0, 12], farmL: [-62, 30, 0], handL: [0, 0, 26], fingL: [0, 0, -30], fing2L: [0, 0, -30] });
  add('carry_box', {
    dur: 1, loop: true, mask: 'upper',
    keys: [[0, { ...CARRY_ARMS, spine: [-4, 0, 0], chest: [-4, 0, 0] }], [1, {}]],
  });
  add('carry_tv', {
    dur: 1.2, loop: true, mask: 'upper', face: [[0, 'neutral']],
    keys: [
      [0, { ...CARRY_ARMS, spine: [-10, 0, 0], chest: [-6, 0, 0], neck: [6, 0, 0], head: [-4, 0, 0] }],
      [0.6, { spine: [-11, 0, 2], head: [-4, 0, 3] }],
      [1.2, {}],
    ],
  });
  add('hand_over', {
    dur: 1.8, face: [[0, 'happy']],
    keys: [
      [0, { ...CARRY_ARMS, spine: [-4, 0, 0], chest: [-4, 0, 0] }],
      [0.7, { pos: [0, -0.03, 0.04], spine: [14, 0, 0], chest: [6, 0, 0], ...S({ uarmL: [-70, 0, 12], farmL: [-30, 30, 0], handL: [0, 0, 20] }) }],
      [0.9, { spine: [16, 0, 0] }],
      [1.3, { pos: [0, 0, 0], spine: [4, 0, 0], chest: [0, 0, 0], ...S({ uarmL: [-10, 0, 10], farmL: [-20, 0, 0], handL: [0, 0, 0], fingL: [0, 0, -14], fing2L: [0, 0, -12] }) }],
      [1.8, { ...BACK }],
    ],
    ev: { release: 0.85 },
  });
  // kneel at the box, open the flaps, lift the TV out, stand with it (ev lift: attach the tv via holdProp('tv', obj))
  add('unbox', {
    dur: 3.6, hold: true, face: [[0, 'happy']],
    keys: [
      [0, {}],
      [0.6, { pos: [0, -0.42, -0.1], spine: [36, 0, 0], chest: [16, 0, 0], neck: [-24, 0, 0], head: [10, 0, 0],
        ...S({ thighL: [-90, 0, 14], shinL: [115, 0, 0], footL: [-25, 0, 0], uarmL: [-50, 0, 10], farmL: [-30, 0, 0] }) }],
      [0.9, { ...S({ uarmL: [-70, 0, 30], farmL: [-20, 0, 0], handL: [-20, 0, 0] }) }],
      [1.2, { ...S({ uarmL: [-50, 0, 50], farmL: [-10, 0, 0], handL: [20, 0, 0] }) }],                         // flaps out
      [1.7, { pos: [0, -0.46, -0.1], spine: [48, 0, 0], ...S({ uarmL: [-80, 0, 14], farmL: [-10, 0, 0], handL: [-10, 0, 30] }) }],  // reach in
      [2.0, { pos: [0, -0.46, -0.1] }],
      [2.8, { pos: [0, -0.1, -0.02], spine: [10, 0, 0], chest: [-2, 0, 0], neck: [-4, 0, 0], head: [0, 0, 0],
        ...S({ thighL: [-24, 0, 4], shinL: [36, 0, 0], footL: [-10, 0, 0] }), ...CARRY_ARMS }],
      [3.6, { pos: [0, 0, 0], spine: [-8, 0, 0], chest: [-6, 0, 0], neck: [6, 0, 0], head: [-4, 0, 0], ...LEGS_REST, ...CARRY_ARMS }],
    ],
    ev: { open: 1.1, lift: 2.0 },
  });
  add('carry_suitcase', {
    dur: 1, loop: true, mask: 'upper', props: [[0, 'suitcase']],
    keys: [[0, { uarmR: [0, 0, -4], farmR: [-4, 0, 0], handR: [0, 0, 0], fingR: [0, 0, 60], chest: [0, 0, 5], spine: [0, 0, 3], uarmL: [4, 0, 22], farmL: [-14, 0, 0] }], [1, {}]],
  });

  // ---------------- Lyman's theatre ----------------
  // "I'm cold. I'm hungry. I'm weak. Take me in!" — back of the hand to the brow, other arm flung out
  add('dramatic', {
    dur: 3.4, loop: true, loopFrom: 0.6, face: [[0, 'sad']], talk: true,
    keys: [
      [0, {}],
      [0.6, { pos: [0, 0, -0.03], spine: [-10, 0, 0], chest: [-10, 0, 0], neck: [-10, 0, 0], head: [-14, 0, 10],
        uarmR: [-160, 0, -40], farmR: [-100, 0, 0], handR: [0, 0, -60], fingR: [0, 0, 0], fing2R: [0, 0, 0],
        uarmL: [-60, 0, 80], farmL: [-6, 0, 0], handL: [0, 0, -20], fingL: [0, 0, 0], fing2L: [0, 0, 0], thighL: [-10, 0, 4], footL: [10, 0, 0] }],
      [1.5, { head: [-16, 0, 14], chest: [-12, 0, 2], uarmL: [-70, 0, 84] }],
      [2.2, { head: [-10, 10, 6], uarmL: [-50, 0, 76], chest: [-8, 0, -2] }],
      [3.4, { head: [-14, 0, 10], chest: [-10, 0, 0], uarmL: [-60, 0, 80] }],
    ],
  });
  // jaunty entrance: chest out, free arm sweeping hello (upper-body overlay, walkable)
  add('walk_in', {
    dur: 2.0, loop: true, mask: 'upper', face: [[0, 'happy']],
    keys: [
      [0, { chest: [-8, 0, 0], head: [-6, 0, 0], uarmL: [-100, 0, 50], farmL: [-30, 0, 0], fingL: [0, 0, 0] }],
      [0.5, { uarmL: [-120, 0, 70], farmL: [-20, 20, 0], head: [-6, 10, 4] }],
      [1.0, { uarmL: [-100, 0, 50], farmL: [-30, 0, 0], head: [-6, 0, 0] }],
      [1.5, { uarmL: [-120, 0, 70], farmL: [-20, 20, 0], head: [-6, -10, -4] }],
      [2.0, {}],
    ],
  });
  // cartoon tiptoe (L9 ending). moveOk: setMove() doesn't cancel it; move the root ~0.6 m/s while it plays.
  const tip = (side, o) => ({ ['thigh' + side]: [o[0], 0, 0], ['shin' + side]: [o[1], 0, 0], ['foot' + side]: [o[2], 0, 0], ['toe' + side]: [o[3] ?? 0, 0, 0] });
  const SNEAK_UP = { spine: [22, 0, 0], chest: [8, 0, 0], neck: [-18, 0, 0], head: [-4, 0, 0],
    ...S({ uarmL: [-50, 0, 6], farmL: [-100, 0, 0], handL: [40, 0, 0], fingL: [0, 0, -40], fing2L: [0, 0, -30] }) };
  add('sneak', {
    dur: 1.2, loop: true, moveOk: true, face: [[0, 'happy']],
    keys: [
      [0, { ...SNEAK_UP, pos: [0, -0.06, 0], ...tip('L', [-40, 70, 10, -30]), ...tip('R', [10, 30, 30, -20]) }],
      [0.3, { pos: [0, -0.02, 0], ...tip('L', [-20, 20, 30, -25]), ...tip('R', [-10, 40, 20, -20]), head: [-4, 10, 0] }],
      [0.6, { pos: [0, -0.06, 0], ...tip('R', [-40, 70, 10, -30]), ...tip('L', [10, 30, 30, -20]), head: [-4, 0, 0] }],
      [0.9, { pos: [0, -0.02, 0], ...tip('R', [-20, 20, 30, -25]), ...tip('L', [-10, 40, 20, -20]), head: [-4, -10, 0] }],
    ],
    ev: { step: 0.3 },
  });
  add('jump_out', {
    dur: 1.6, hold: true, face: [[0, 'happy']], talk: true,
    keys: [
      [0, { spine: [20, 0, 0], ...S({ thighL: [-30, 0, 4], shinL: [50, 0, 0], footL: [-20, 0, 0] }), pos: [0, -0.12, 0] }],
      [0.18, { pos: [0, 0.16, 0.05], spine: [-14, 0, 0], chest: [-8, 0, 0], head: [-14, 0, 0],
        ...S({ uarmL: [-150, 0, 50], farmL: [-10, 0, 0], fingL: [0, 0, 10], fing2L: [0, 0, 0], thighL: [6, 0, 6], shinL: [10, 0, 0], footL: [30, 0, 0] }) }],
      [0.4, { pos: [0, -0.04, 0.06], spine: [-8, 0, 0], ...S({ uarmL: [-140, 0, 60], thighL: [-10, 0, 8], shinL: [24, 0, 0], footL: [-6, 0, 0] }) }],
      [1.0, { pos: [0, 0, 0.06], ...S({ uarmL: [-135, 0, 65], farmL: [-15, 0, 0] }), head: [-12, 0, 6] }],
      [1.6, { pos: [0, 0, 0.06], ...S({ uarmL: [-140, 0, 60] }), head: [-12, 0, -6] }],
    ],
  });
  add('wipe', {
    dur: 2.0, face: [[0, 'sad']],
    keys: [
      [0, {}],
      [0.3, { spine: [16, 0, 0], neck: [-6, 0, 0], head: [24, 0, 0], uarmR: [-40, 0, 20], farmR: [-80, 30, 0], handR: [0, 0, 10], uarmL: [-20, 0, 10], farmL: [-60, 0, 0] }],
      [0.5, { uarmR: [-36, 0, 6], farmR: [-80, 50, 0], handR: [0, 0, -15] }],
      [0.7, { uarmR: [-40, 0, 20], farmR: [-80, 30, 0], handR: [0, 0, 10] }],
      [0.9, { uarmR: [-36, 0, 6], farmR: [-80, 50, 0], handR: [0, 0, -15] }],
      [1.1, { uarmR: [-40, 0, 20], farmR: [-80, 30, 0], handR: [0, 0, 10] }],
      [1.4, { head: [18, 0, 0], uarmR: [-30, 0, -40], farmR: [-40, 0, 0], handR: [0, 0, 40] }],   // flick it off
      [2.0, { ...BACK }],
    ],
  });
  return C;
}
