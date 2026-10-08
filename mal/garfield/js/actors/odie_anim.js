// Odie's procedural clips. Each fn writes additive bone rotations (radians, parent-aligned: x = pitch, + tips a
// forward-pointing bone down / swings a hanging leg backward; y = yaw toward +X; z = roll) into a zeroed Pose.
import { lerp, smooth, keys, clamp } from './shared/pose.js';

export const EXT = ['lidU', 'lidD', 'cross', 'pupil', 'eyeScale', 'mouth', 'tongue', 'pant', 'earsUp', 'earFlap', 'sqY', 'sqX',
  'rootY', 'rootZ', 'rotX', 'rotZ', 'noLook', 'blinkOff', 'dizzy', 'wag', 'happy', 'stars'];

const TAU = Math.PI * 2;

function frontLeg(P, s, ph, A, B, lift, st = 0.6) {
  let th, bend;
  if (ph < st) { th = lerp(-A, A, ph / st); bend = 0; }
  else { const u = (ph - st) / (1 - st); th = lerp(A, -A, smooth(u)); bend = Math.sin(Math.PI * u); }
  P.r('shoulder' + s, th - bend * 0.3);
  P.r('elbow' + s, -bend * B * 0.4 + bend * B);
  P.r('paw' + s, -(th - bend * 0.3) - bend * B * 0.6);
  P.o('shoulder' + s, 0, bend * lift, 0);
}
function hindLeg(P, s, ph, A, B, lift, st = 0.6) {
  let th, bend;
  if (ph < st) { th = lerp(-A, A, ph / st); bend = 0; }
  else { const u = (ph - st) / (1 - st); th = lerp(A, -A, smooth(u)); bend = Math.sin(Math.PI * u); }
  P.r('thigh' + s, th - bend * 0.5);
  P.r('shin' + s, bend * B * 0.6);
  P.r('hock' + s, -bend * B * 0.9);
  P.r('foot' + s, -(th - bend * 0.5) + bend * B * 0.3);
  P.o('thigh' + s, 0, bend * lift, 0);
}
function tail(P, t, amp, freq, lift = 0) {
  for (let i = 0; i < 6; i++) P.r('tail' + i, lift * (i === 0 ? 1 : 0.2), amp * (0.3 + i * 0.12) * Math.sin(TAU * freq * t - i * 0.55));
}
function breathe(P, t, rate = 1 / 3, amt = 1) {
  const b = Math.sin(TAU * t * rate) * amt;
  P.s('chest', 0.015 * b, 0.02 * b, 0.012 * b);
}
function pantFn(P, t, amt = 1) {
  const p = Math.sin(TAU * t * 3.2);
  P.s('chest', 0.025 * p * amt, 0.03 * p * amt, 0.02 * p * amt);
  P.x.mouth += (0.55 + 0.25 * p) * amt; P.x.tongue += 0.7 * amt; P.x.pant += amt;
  P.r('head', 0.03 * p * amt);
}

function idlePose(P, c) {
  const t = c.time;
  breathe(P, t);
  P.r('head', 0.05 * Math.sin(t * 0.6), 0.15 * Math.sin(t * 0.35) + 0.06 * Math.sin(t * 1.3), 0.12 * Math.sin(t * 0.45));
  P.r('neck', -0.05);
  tail(P, t, 0.35, 1.6, 0.1);
  P.x.wag += 0.4;
}
function walkPose(P, c, ph) {
  const A = 0.42, B = 0.9;
  hindLeg(P, 'L', ph % 1, A, B, 0.015);
  frontLeg(P, 'L', (ph + 0.25) % 1, A, B, 0.015);
  hindLeg(P, 'R', (ph + 0.5) % 1, A, B, 0.015);
  frontLeg(P, 'R', (ph + 0.75) % 1, A, B, 0.015);
  const w = TAU * ph;
  P.o('hips', 0, -0.008 * Math.cos(2 * w), 0);
  P.r('hips', 0, 0.06 * Math.sin(w), 0.05 * Math.sin(w));
  P.r('chest', 0, -0.06 * Math.sin(w + 1.6), -0.05 * Math.sin(w + 1.6));
  // goofy head bob
  P.r('head', 0.08 * Math.cos(2 * w), 0.06 * Math.sin(w), 0.08 * Math.sin(w));
  P.r('neck', -0.05 + 0.05 * Math.cos(2 * w));
  tail(P, ph, 0.5, 2, 0.15);
  P.x.tongue += 0.3; P.x.mouth += 0.25; P.x.wag += 0.6;
}
function runPose(P, c, ph) {
  // rotary gallop
  const A = 0.75, B = 1.2;
  hindLeg(P, 'L', ph % 1, A, B, 0.03, 0.42);
  hindLeg(P, 'R', (ph + 0.1) % 1, A, B, 0.03, 0.42);
  frontLeg(P, 'L', (ph + 0.5) % 1, A, B, 0.03, 0.42);
  frontLeg(P, 'R', (ph + 0.6) % 1, A, B, 0.03, 0.42);
  const w = TAU * ph;
  P.r('hips', 0.18 * Math.sin(w + 0.6));
  P.r('chest', -0.22 * Math.sin(w + 0.6));
  P.x.rootY += 0.05 * Math.max(0, Math.sin(w + 2.0));
  P.r('neck', -0.1 + 0.12 * Math.sin(w + 0.6));
  P.r('head', 0.12 * Math.sin(w + 0.6));
  P.x.earFlap += 1; P.x.tongue += 0.9; P.x.mouth += 0.5; P.x.pant += 0.5;
  for (let i = 0; i < 6; i++) P.r('tail' + i, -0.1 + 0.1 * Math.sin(w - i * 0.55), 0.07 * Math.sin(w * 0.5 - i * 0.7));
  P.x.sqY += 0.05 * Math.sin(w + 2.4);
}

function loco(P, t, c) {
  const s = c.locoSpeed;
  const wWalk = clamp((s - 0.04) / 0.36, 0, 1), wRun = clamp((s - 1.2) / 0.8, 0, 1);
  const T = c.tmpPose;
  if (wWalk < 1) { idlePose(T.zero(), c); P.addScaled(T, 1 - wWalk); }
  if (wWalk > 0) {
    if (wRun < 1) { walkPose(T.zero(), c, c.phase); P.addScaled(T, wWalk * (1 - wRun)); }
    if (wRun > 0) { runPose(T.zero(), c, c.phase); P.addScaled(T, wWalk * wRun); }
  }
}

export function sitPose(P, a = 1) {
  P.r('hips', -0.75 * a); P.o('hips', 0, -0.12 * a, 0.04 * a);
  P.r('spine', -0.25 * a); P.r('chest', -0.15 * a);
  P.r('neck', 0.5 * a); P.r('head', 0.6 * a);
  P.r('thighL', -0.5 * a, 0, -0.15 * a); P.r('thighR', -0.5 * a, 0, 0.15 * a);
  P.r('shinL', 0.9 * a); P.r('shinR', 0.9 * a);
  P.r('hockL', -1.2 * a); P.r('hockR', -1.2 * a);
  P.r('footL', 1.55 * a); P.r('footR', 1.55 * a);
  P.r('shoulderL', 0.6 * a); P.r('shoulderR', 0.6 * a);
  P.r('pawL', 0.15 * a); P.r('pawR', 0.15 * a);
  P.r('tail0', 1.3 * a);
}

// body splayed flat on the ground (legs out sideways)
function splat(P, a = 1) {
  P.r('shoulderL', -0.4 * a, 0, -1.3 * a); P.r('shoulderR', -0.4 * a, 0, 1.3 * a);
  P.r('thighL', 0.4 * a, 0, -1.3 * a); P.r('thighR', 0.4 * a, 0, 1.3 * a);
  P.r('elbowL', 0, 0, -0.2 * a); P.r('elbowR', 0, 0, 0.2 * a);
  P.r('hockL', -0.3 * a); P.r('hockR', -0.3 * a);
}

const clip = (dur, loop, fn, extra = {}) => ({ dur, loop, fn, ...extra });

export const CLIPS = {
  idle: clip(1, true, loco, { same: true }),
  walk: clip(1, true, loco, { same: true }),
  run: clip(1, true, loco, { same: true }),

  idle_pant: clip(2, true, (P, t, c) => { idlePose(P, c); pantFn(P, t); P.x.happy += 1; }),

  gallop_goofy: clip(0.5, true, (P, t, c) => {
    // bounding: front pair together, then hind pair; ears flapping, tongue flying. Speed-synced when moving.
    const ph = c.locoSpeed > 0.5 ? c.phase : t / 0.5, w = TAU * ph;
    const front = Math.sin(w), hind = Math.sin(w + Math.PI);
    P.r('shoulderL', -0.8 * front); P.r('shoulderR', -0.75 * front);
    P.r('elbowL', 0.6 * Math.max(0, -front)); P.r('elbowR', 0.6 * Math.max(0, -front));
    P.r('thighL', -0.8 * hind); P.r('thighR', -0.75 * hind);
    P.r('hockL', -0.6 * Math.max(0, hind)); P.r('hockR', -0.6 * Math.max(0, hind));
    P.r('hips', 0.25 * Math.sin(w + 1)); P.r('chest', -0.3 * Math.sin(w + 1));
    P.x.rootY += 0.1 * Math.abs(Math.sin(w / 2 + 0.5)); P.x.sqY += 0.08 * Math.cos(w);
    P.r('head', 0.15 * Math.sin(w), 0, 0.2 * Math.sin(w / 2));
    P.x.earFlap += 1.6; P.x.tongue += 1; P.x.mouth += 0.6; P.x.cross += 0.5; P.x.happy += 1;
    tail(P, t, 0.6, 3);
  }),

  sit: clip(4, true, (P, t, c) => {
    sitPose(P, 1); breathe(P, t);
    P.r('head', 0.04 * Math.sin(t * 0.8), 0.15 * Math.sin(TAU * t / 4), 0.15 * Math.sin(t * 0.7));
    P.r('tail1', 0, 0.4 * Math.sin(TAU * t * 1.5)); P.x.wag += 0.3;
  }),
  sit_pant: clip(2, true, (P, t) => {
    sitPose(P, 1); pantFn(P, t);
    P.r('head', -0.1, 0.1 * Math.sin(t * 0.9), 0.18 * Math.sin(t * 0.7));
    P.r('tail1', 0, 0.5 * Math.sin(TAU * t * 2)); P.x.happy += 1; P.x.cross += 0.4;
  }),

  jump_up: clip(0.32, false, (P, t) => {
    const crouch = keys([[0, 0.6], [0.08, 1], [0.16, 0]], t);
    const ext = keys([[0.08, 0], [0.2, 1], [0.32, 0.8]], t);
    P.x.sqY += -0.18 * crouch + 0.16 * ext;
    P.r('shoulderL', -1.0 * ext); P.r('shoulderR', -1.0 * ext);
    P.r('thighL', 0.9 * ext); P.r('thighR', 0.9 * ext);
    P.r('hips', 0.15 * ext); P.r('chest', -0.2 * ext);
    P.x.earsUp += ext; P.x.eyeScale += 0.1 * ext;
  }, { then: 'fall' }),

  fall: clip(0.8, true, (P, t) => {
    const w = Math.sin(TAU * t / 0.8);
    P.r('shoulderL', -0.6 + 0.3 * w, 0, -0.4); P.r('shoulderR', -0.6 - 0.3 * w, 0, 0.4);
    P.r('thighL', 0.3 - 0.3 * w, 0, -0.4); P.r('thighR', 0.3 + 0.3 * w, 0, 0.4);
    P.x.earsUp += 1.2; P.x.eyeScale += 0.15; P.x.mouth += 0.6; P.x.tongue += 1;
    tail(P, t, 0.4, 2.5);
  }),

  land: clip(0.45, false, (P, t) => {
    const sq = keys([[0, 0.2], [0.06, 1], [0.2, -0.25], [0.32, 0.08], [0.45, 0]], t);
    P.x.sqY -= 0.25 * sq;
    P.r('shoulderL', 0, 0, -0.2 * sq); P.r('shoulderR', 0, 0, 0.2 * sq);
    P.r('thighL', 0, 0, -0.2 * sq); P.r('thighR', 0, 0, 0.2 * sq);
    P.x.earsUp -= 0.6 * sq;
  }),

  // nose-dives into the floor, sticks up like a post, topples over, dazed
  land_head: clip(2.4, false, (P, t) => {
    const dive = keys([[0, 0], [0.12, 1], [0.75, 1], [1.05, 0.25], [1.3, 0]], t);
    const top = keys([[0.75, 0], [1.05, 1], [1.2, 0.85], [1.35, 1], [1.8, 1], [2.3, 0]], t);
    P.x.rotX += 1.45 * dive;                                  // nose straight down
    P.x.rootY += 0.08 * dive; P.x.rootZ -= 0.3 * dive;
    P.x.sqY -= 0.18 * keys([[0.1, 0], [0.16, 1], [0.3, 0.3], [0.75, 0.2], [0.9, 0]], t);
    P.r('neck', -0.2 * dive); P.r('head', -0.3 * dive);
    P.r('shoulderL', -0.5 * dive, 0, -0.4 * dive); P.r('shoulderR', -0.5 * dive, 0, 0.4 * dive);
    P.r('thighL', -0.6 * dive + 0.4 * Math.sin(t * 20) * dive, 0, -0.3 * dive); P.r('thighR', -0.6 * dive - 0.4 * Math.sin(t * 20) * dive, 0, 0.3 * dive);
    P.x.rotZ += 1.4 * top; P.x.rootY -= 0.31 * top; P.x.rootZ -= 0.3 * top * (1 - dive);
    splat(P, top * 0.6);
    P.x.earsUp += 1.4 * dive;
    P.x.dizzy += keys([[0.2, 0], [0.4, 1], [2.1, 1], [2.4, 0]], t); P.x.stars += keys([[0.2, 0], [0.35, 1], [2.1, 1], [2.4, 0]], t);
    P.x.mouth += 0.4; P.x.tongue += 1; P.x.noLook = 1; P.x.blinkOff = 1;
  }),

  // startled hop straight up, then the controller/AI runs him off
  yip_flee: clip(0.7, false, (P, t) => {
    const up = keys([[0, 0], [0.1, 1], [0.35, 1], [0.5, 0]], t);
    P.x.rootY += 0.22 * Math.sin(Math.PI * clamp(t / 0.5, 0, 1));
    P.x.sqY += 0.15 * up;
    P.r('shoulderL', -0.5 * up, 0, -0.5 * up); P.r('shoulderR', -0.5 * up, 0, 0.5 * up);
    P.r('thighL', 0.4 * up, 0, -0.5 * up); P.r('thighR', 0.4 * up, 0, 0.5 * up);
    P.x.earsUp += 1.6 * up; P.x.eyeScale += 0.3 * up; P.x.pupil -= 0.5 * up; P.x.mouth += 0.9 * up; P.x.tongue += 0.8 * up;
    P.x.blinkOff = 1; P.x.lidU -= 0.4 * up;
    tail(P, t, 0.2, 6, -0.4 * up);
  }, { then: 'run' }),

  bark: clip(0.6, false, (P, t) => {
    const b = keys([[0, 0], [0.08, 1], [0.2, 0.2], [0.28, 1], [0.4, 0.1], [0.6, 0]], t);
    P.r('neck', -0.15 * b); P.r('head', -0.25 * b);
    P.r('chest', -0.06 * b); P.o('chest', 0, 0.01 * b, 0);
    P.x.mouth += 1.1 * b; P.x.tongue += 0.3; P.x.earsUp += 0.6 * b; P.x.eyeScale += 0.08 * b;
    P.r('shoulderL', -0.2 * b); P.r('shoulderR', -0.2 * b);
    tail(P, t, 0.5, 4);
  }),

  eat: clip(0.5, true, (P, t) => {
    const ch = Math.max(0, Math.sin(TAU * t / 0.5));
    P.r('chest', 0.3); P.r('neck', 0.75); P.r('head', 0.45 + 0.15 * ch);
    P.r('shoulderL', -0.25); P.r('shoulderR', -0.25); P.r('elbowL', 0.3); P.r('elbowR', 0.3);
    P.o('chest', 0, -0.06, 0);
    P.x.mouth += 0.2 + 0.8 * ch; P.x.tongue += 0.4 * ch; P.x.noLook = 1;
    P.x.happy += 1; P.x.wag += 1;
    tail(P, t, 0.6, 3, 0.2);
  }),

  // arena lunge: crouch, spring forward, snap back
  tackle: clip(0.65, false, (P, t) => {
    const cr = keys([[0, 0], [0.15, 1], [0.22, 0]], t);
    const lunge = keys([[0.18, 0], [0.3, 1], [0.42, 1], [0.65, 0]], t);
    P.x.sqY -= 0.15 * cr; P.x.rootZ += 0.35 * lunge; P.x.rootY += 0.08 * Math.sin(Math.PI * clamp((t - 0.18) / 0.3, 0, 1));
    P.r('hips', 0.2 * cr - 0.1 * lunge); P.r('chest', 0.15 * cr - 0.15 * lunge);
    P.r('shoulderL', -1.1 * lunge); P.r('shoulderR', -1.1 * lunge);
    P.r('thighL', 0.9 * lunge); P.r('thighR', 0.9 * lunge);
    P.r('neck', -0.1 * lunge); P.r('head', -0.15 * lunge);
    P.x.mouth += 0.9 * lunge; P.x.tongue += 0.6; P.x.earFlap += lunge; P.x.cross += 0.6;
  }, { ev: { hit: 0.32 } }),

  hit: clip(0.6, false, (P, t) => {
    const k = keys([[0, 0], [0.06, 1], [0.3, 0.8], [0.6, 0]], t);
    P.x.rootZ -= 0.15 * k; P.x.rootY += 0.05 * k;
    P.r('hips', -0.25 * k); P.r('chest', -0.25 * k); P.r('neck', -0.3 * k); P.r('head', -0.2 * k);
    P.r('shoulderL', -0.8 * k, 0, -0.4 * k); P.r('shoulderR', -0.8 * k, 0, 0.4 * k);
    P.x.eyeScale += 0.3 * k; P.x.pupil -= 0.4 * k; P.x.mouth += 0.8 * k; P.x.earsUp += 1.4 * k; P.x.blinkOff = 1;
    tail(P, t, 0.3, 5);
  }),

  dizzy: clip(2.0, true, (P, t) => {
    const w = TAU * t / 2;
    P.r('hips', 0, 0, 0.12 * Math.sin(w)); P.r('chest', 0, 0, -0.1 * Math.sin(w));
    P.r('head', 0.1, 0.25 * Math.sin(w), 0.3 * Math.sin(w + 1));
    P.r('shoulderL', 0, 0, -0.15); P.r('shoulderR', 0, 0, 0.15);
    P.x.dizzy += 1; P.x.stars += 1; P.x.mouth += 0.4; P.x.tongue += 1; P.x.blinkOff = 1; P.x.noLook = 1; P.x.earsUp -= 0.3;
  }),

  // pancaked under the TV: flat disc, legs out, tongue out, swirly eyes. Holds (then: flattened_hold).
  flattened: clip(0.5, false, (P, t) => {
    const f = keys([[0, 0], [0.06, 1], [0.15, 0.9], [0.22, 1]], t);
    P.x.sqY -= 0.78 * f; P.x.sqX += 0.05 * f;
    splat(P, f); P.x.earsUp += 1.5 * f;
    P.x.dizzy += f; P.x.mouth += 0.5 * f; P.x.tongue += 1.3 * f; P.x.blinkOff = 1; P.x.noLook = 1;
  }, { then: 'flattened_hold' }),
  flattened_hold: clip(1.2, true, (P, t) => {
    P.x.sqY -= 0.78; P.x.sqX += 0.05 + 0.03 * Math.sin(TAU * t / 1.2);
    splat(P, 1); P.x.earsUp += 1.5;
    P.x.dizzy += 1; P.x.mouth += 0.5; P.x.tongue += 1.3; P.x.blinkOff = 1; P.x.noLook = 1;
    P.r('tail3', 0, 0.3 * Math.sin(TAU * t / 0.6));
  }),

  // tumbling flight (the game tweens the root along the arc)
  launched: clip(0.6, true, (P, t) => {
    const w = TAU * t / 0.6;
    P.x.rotX += w;                                           // somersault about the body centre
    P.x.rotZ += 0.4 * Math.sin(w * 0.5);
    P.r('shoulderL', -1.2, 0, -0.9 + 0.3 * Math.sin(w * 3)); P.r('shoulderR', -1.2, 0, 0.9 - 0.3 * Math.sin(w * 3));
    P.r('thighL', 0.9, 0, -0.9 + 0.3 * Math.cos(w * 3)); P.r('thighR', 0.9, 0, 0.9 - 0.3 * Math.cos(w * 3));
    P.x.earFlap += 2; P.x.earsUp += 1; P.x.mouth += 1; P.x.tongue += 1.3; P.x.eyeScale += 0.25; P.x.cross += 0.8;
    P.x.blinkOff = 1; P.x.noLook = 1;
    tail(P, t, 0.6, 4);
  }),

  // trembling at the dog whistle
  shake_scared: clip(1.0, true, (P, t) => {
    const j = Math.sin(t * 95);
    sitPose(P, 0.35);
    P.r('neck', 0.2); P.r('head', 0.25, 0, 0.05 * j);
    P.r('chest', 0, 0, 0.04 * j); P.r('hips', 0, 0, -0.04 * j);
    P.x.sqY -= 0.08;
    P.r('tail0', 1.4); P.r('tail1', 0.6);                    // tail tucked
    P.x.earsUp -= 0.8; P.x.eyeScale += 0.25; P.x.pupil -= 0.4; P.x.lidU -= 0.2; P.x.mouth += 0.15 + 0.1 * j; P.x.blinkOff = 1;
    P.x.sqX += 0.012 * j;
  }),

  lick: clip(1.1, false, (P, t) => {
    const l = keys([[0, 0], [0.2, 1], [0.75, 1], [1.1, 0]], t);
    const sw = Math.sin(TAU * clamp((t - 0.2) / 0.55, 0, 1) * 1.5);
    P.r('neck', -0.3 * l); P.r('head', -0.25 * l - 0.35 * sw * l, 0, 0.2 * l);
    P.x.mouth += 0.9 * l; P.x.tongue += 1.6 * l; P.x.lidU += 0.5 * l; P.x.happy += 1;
    tail(P, t, 0.7, 3);
  }, { ev: { lick: 0.45 } }),

  sniff: clip(1.6, true, (P, t) => {
    const s = Math.max(0, Math.sin(TAU * t * 4));
    P.r('chest', 0.25); P.r('neck', 0.6); P.r('head', 0.3 + 0.04 * s, 0.25 * Math.sin(TAU * t / 1.6));
    P.o('chest', 0, -0.04, 0);
    P.r('shoulderL', -0.2); P.r('shoulderR', -0.2);
    P.x.noLook = 1; P.x.cross += 0.7; P.x.lidU += 0.2;
    tail(P, t, 0.3, 2, 0.2);
  }),

  // L9 group hug: up on his hind legs, front paws wrapped forward
  hug_pile: clip(2.0, true, (P, t) => {
    const w = TAU * t / 2;
    P.r('hips', -1.1); P.o('hips', 0, -0.02, 0.06); P.r('spine', -0.2); P.r('chest', -0.15);
    P.r('neck', 0.9); P.r('head', 0.5, 0, 0.2 * Math.sin(w));
    P.r('thighL', -0.7); P.r('thighR', -0.7); P.r('shinL', 0.6); P.r('shinR', 0.6); P.r('hockL', -0.3); P.r('hockR', -0.3); P.r('footL', 1.2); P.r('footR', 1.2);
    P.r('shoulderL', -0.4, 0, 0.5); P.r('shoulderR', -0.4, 0, -0.5); P.r('elbowL', -0.9); P.r('elbowR', -0.9);
    P.x.happy += 1; P.x.mouth += 0.7; P.x.tongue += 1; P.x.lidU += 0.6;
    tail(P, t, 0.8, 4, 0.4);
  }),

  // wobbly, blinded walk with socks on (ears weighed down, mouth muffled)
  walk_socked: clip(1.3, true, (P, t, c) => {
    const ph = c.locoSpeed > 0.2 ? c.phase : t / 1.3;
    walkPose(P, c, ph);
    const w = TAU * ph;
    P.r('hips', 0, 0, 0.12 * Math.sin(w)); P.r('chest', 0, 0.15 * Math.sin(w), -0.1 * Math.sin(w));
    P.r('neck', 0.2); P.r('head', 0.2, 0.3 * Math.sin(w * 0.5), 0.2 * Math.sin(w));
    P.x.earsUp -= 0.6; P.x.mouth = 0; P.x.tongue = 0; P.x.cross += 0.8; P.x.lidU += 0.3;
  }),

  // flies into a wall, splats spread-eagled, slides down, peels off backwards (root at the wall base, facing it)
  stuck_wall: clip(2.6, false, (P, t) => {
    const stick = keys([[0, 1], [1.7, 1], [2.0, 0]], t);
    const slide = keys([[0.35, 0], [1.6, 1]], t);
    const peel = keys([[1.7, 0], [2.1, 1], [2.25, 0.85], [2.4, 1]], t);
    P.x.rotX -= 1.5 * stick + 3.0 * peel;                   // belly to the wall, then flat on the back
    P.x.rootY += (0.5 - 0.42 * slide) * stick + 0.06 * stick;
    P.x.rootZ += 0.14 * stick - 0.4 * peel; P.x.rootY -= 0.3 * peel;
    P.x.sqY -= 0.45 * keys([[0, 0], [0.05, 1], [0.3, 0.75], [1.7, 0.7], [1.9, 0]], t);
    splat(P, Math.max(stick, peel));
    P.x.earsUp += 1.4 * stick;
    P.x.dizzy += keys([[0.2, 0], [0.4, 1], [2.4, 1], [2.6, 0.6]], t); P.x.stars += keys([[1.9, 0], [2.1, 1]], t);
    P.x.mouth += 0.5; P.x.tongue += 1.2; P.x.blinkOff = 1; P.x.noLook = 1;
  }, { then: 'stuck_wall_hold' }),
  stuck_wall_hold: clip(2.0, true, (P, t) => {
    P.x.rotX -= 3.0; P.x.rootZ -= 0.4; P.x.rootY -= 0.3;
    splat(P, 1); P.x.earsUp += 1.2;
    for (const s of ['L', 'R']) { P.r('shoulder' + s, 0.2 * Math.sin(t * 9)); P.r('thigh' + s, -0.2 * Math.sin(t * 9 + 1)); }
    P.x.dizzy += 1; P.x.stars += 1; P.x.mouth += 0.5; P.x.tongue += 1.2; P.x.blinkOff = 1; P.x.noLook = 1;
  }),
};

export const EXPRESSIONS = {
  dopey: { lidU: 0.12, lidD: 0.05, cross: 0.35, pupil: 0, smile: 2.5, tongue: 0.9 },
  happy: { lidU: 0.3, lidD: 0.35, cross: 0.25, pupil: 0.1, smile: 4, tongue: 1.1 },
  dazed: { lidU: 0.38, lidD: 0.1, cross: 1.0, pupil: -0.1, smile: 2, tongue: 1.2 },
  scared: { lidU: -0.25, lidD: 0, cross: 0, pupil: -0.45, smile: -0.5, tongue: 0, eyeScale: 0.2 },
};
