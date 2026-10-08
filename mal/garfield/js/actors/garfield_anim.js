// Garfield's procedural clips. Each fn writes additive bone rotations (radians, parent-aligned:
// x = pitch (+ tips forward/down), y = yaw (+ toward +X / his left), z = roll) into a zeroed Pose.
import { lerp, smooth, sstep, keys, clamp } from './shared/pose.js';

export const EXT = ['lidU', 'lidD', 'lidTilt', 'eyeScale', 'pupil', 'mouth', 'smile', 'claw', 'sqY', 'rootY', 'rootZ',
  'noLook', 'cheeks', 'earsBack', 'blinkOff', 'lookDown', 'tongue', 'dizzy', 'puff', 'hearts', 'sqX'];

const TAU = Math.PI * 2;
const S = ['L', 'R'];

// curl = sideways '?' carriage so the tail doesn't stand dead-centre in the behind camera
function tailWave(P, amp, freq, t, phase = 0, lift = 0, curl = 0.18) {
  for (let i = 0; i < 6; i++) {
    const k = (i + 1) / 6;
    P.r('tail' + i, lift * (i < 2 ? 1 : 0.3), amp * k * Math.sin(TAU * freq * t - i * 0.55 + phase) + curl * (i === 0 ? 1.2 : i > 2 ? 0.9 : 0.4), 0);
  }
}

function frontLeg(P, s, ph, A, B, lift, st = 0.6) {
  let th, bend;
  if (ph < st) { th = lerp(-A, A, ph / st); bend = 0; }
  else { const u = (ph - st) / (1 - st); th = lerp(A, -A, smooth(u)); bend = Math.sin(Math.PI * u); }
  P.r('shoulder' + s, th - bend * 0.25);
  P.r('elbow' + s, bend * B);
  P.r('paw' + s, -(th - bend * 0.25) - bend * B + bend * B * 0.8);
  P.o('shoulder' + s, 0, bend * lift, 0);
}
function hindLeg(P, s, ph, A, B, lift, st = 0.6) {
  let th, bend;
  if (ph < st) { th = lerp(-A, A, ph / st); bend = 0; }
  else { const u = (ph - st) / (1 - st); th = lerp(A, -A, smooth(u)); bend = Math.sin(Math.PI * u); }
  P.r('thigh' + s, th - bend * 0.35);
  P.r('shin' + s, bend * B);
  P.r('foot' + s, -(th - bend * 0.35) - bend * B + bend * 0.5);
  P.o('thigh' + s, 0, bend * lift, 0);
}

function breathe(P, t, amt = 1) {
  const b = Math.sin(TAU * t / 3.4) * amt;
  P.s('chest', 0.012 * b, 0.018 * b, 0.01 * b);
  P.s('belly', 0.02 * b, 0.015 * b, 0.02 * b);
}

function idlePose(P, c) {
  const t = c.time;
  breathe(P, t);
  P.r('head', 0.04 * Math.sin(t * 0.37), 0.12 * Math.sin(t * 0.23) + 0.05 * Math.sin(t * 0.71), 0.04 * Math.sin(t * 0.3));
  P.r('neck', -0.05);
  P.r('hips', 0, 0, 0.015 * Math.sin(t * 0.5));
  tailWave(P, 0.18, 0.18, t, 0, 0.1);
  P.r('tail4', -0.2); P.r('tail5', -0.3);
}

function walkPose(P, c, ph) {
  const A = 0.5, B = 1.0;
  hindLeg(P, 'L', ph % 1, A, B, 0.012);
  frontLeg(P, 'L', (ph + 0.25) % 1, A, B, 0.012);
  hindLeg(P, 'R', (ph + 0.5) % 1, A, B, 0.012);
  frontLeg(P, 'R', (ph + 0.75) % 1, A, B, 0.012);
  const w = TAU * ph;
  P.o('hips', 0, -0.006 * Math.cos(2 * w), 0);
  P.r('hips', 0, 0.05 * Math.sin(w), 0.06 * Math.sin(w));
  P.r('chest', 0, -0.06 * Math.sin(w + 1.6), -0.05 * Math.sin(w + 1.6));
  P.r('head', 0.03 * Math.cos(2 * w), 0.04 * Math.sin(w), 0.03 * Math.sin(w));
  P.r('neck', -0.08);
  tailWave(P, 0.3, 1, ph, 0.5, 0.25);
  P.r('tail4', -0.25); P.r('tail5', -0.35);
}

function runPose(P, c, ph) {
  const A = 0.78, B = 1.25;
  hindLeg(P, 'L', ph % 1, A, B, 0.02, 0.42);
  hindLeg(P, 'R', (ph + 0.08) % 1, A, B, 0.02, 0.42);
  frontLeg(P, 'L', (ph + 0.5) % 1, A, B, 0.02, 0.42);
  frontLeg(P, 'R', (ph + 0.58) % 1, A, B, 0.02, 0.42);
  const w = TAU * ph;
  P.r('hips', 0.16 * Math.sin(w + 0.6));
  P.r('chest', -0.2 * Math.sin(w + 0.6));
  P.x.rootY += 0.03 * Math.max(0, Math.sin(w + 2.0));
  P.r('neck', -0.05 + 0.1 * Math.sin(w + 0.6));
  P.r('head', 0.12 * Math.sin(w + 0.6) + 0.1);
  P.x.earsBack += 0.6;
  P.x.lidU -= 0.15;
  for (let i = 0; i < 6; i++) P.r('tail' + i, (i < 2 ? 0.12 : 0.02) + 0.12 * Math.sin(w - i * 0.7), 0.06 * Math.sin(w * 0.5 - i) + (i === 0 ? 0.2 : 0.08));
  P.x.sqY += 0.05 * Math.sin(w + 2.4);
}

function loco(P, t, c) {
  const s = c.locoSpeed;
  const wWalk = sstep(0.04, 0.4, s), wRun = sstep(1.1, 1.9, s);
  const T = c.tmpPose;
  if (wWalk < 1) { idlePose(T.zero(), c); P.addScaled(T, 1 - wWalk); }
  if (wWalk > 0) {
    if (wRun < 1) { walkPose(T.zero(), c, c.phase); P.addScaled(T, wWalk * (1 - wRun)); }
    if (wRun > 0) { runPose(T.zero(), c, c.phase); P.addScaled(T, wWalk * wRun); }
  }
}

// classic upright sit; a=0..1 blend
export function sitPose(P, a = 1) {
  P.r('hips', -0.8 * a);
  P.o('hips', 0, -0.065 * a, 0.03 * a);
  P.r('spine', -0.32 * a);
  P.r('chest', -0.18 * a);
  P.r('neck', 0.62 * a);
  P.r('head', 0.6 * a);
  P.r('thighL', -0.35 * a, 0, -0.25 * a); P.r('thighR', -0.35 * a, 0, 0.25 * a);
  P.r('shinL', -0.3 * a); P.r('shinR', -0.3 * a);
  P.r('footL', 1.45 * a); P.r('footR', 1.45 * a);
  P.r('shoulderL', 0.75 * a, 0, -0.15 * a); P.r('shoulderR', 0.75 * a, 0, 0.15 * a);
  P.r('elbowL', -1.0 * a); P.r('elbowR', -1.0 * a);
  P.r('pawL', 0.8 * a); P.r('pawR', 0.8 * a);
  P.r('tail0', 0.95 * a, 0.3 * a); P.r('tail1', 0.25 * a, 0.35 * a); P.r('tail2', 0, 0.4 * a);
  P.r('tail3', -0.15 * a, 0.35 * a); P.r('tail4', -0.3 * a, 0.2 * a); P.r('tail5', -0.3 * a);
}

const clip = (dur, loop, fn, extra = {}) => ({ dur, loop, fn, ...extra });

export const CLIPS = {
  idle: clip(1, true, loco, { same: true }),
  walk: clip(1, true, loco, { same: true }),
  run: clip(1, true, loco, { same: true }),

  idle_bored: clip(5.2, false, (P, t, c) => {
    // sit back, huge yawn, then a long cat stretch, then settle
    const sit = keys([[0, 0], [0.5, 1], [2.4, 1], [2.9, 0.15], [4.3, 0.15], [5.0, 0]], t);
    sitPose(P, sit);
    breathe(P, t);
    const yawn = keys([[0.5, 0], [0.9, 0.3], [1.3, 1], [2.0, 1], [2.3, 0]], t);
    P.x.mouth += yawn; P.x.lidU += yawn * 0.6; P.r('head', -0.45 * yawn); P.r('neck', -0.15 * yawn);
    P.x.earsBack += yawn * 0.5; P.x.tongue += yawn;
    const str = keys([[2.6, 0], [3.1, 1], [4.0, 1], [4.6, 0]], t);
    P.r('shoulderL', -1.0 * str); P.r('shoulderR', -1.0 * str);
    P.r('pawL', 0.9 * str); P.r('pawR', 0.9 * str);
    P.r('chest', 0.32 * str); P.r('spine', -0.12 * str); P.r('hips', -0.08 * str);
    P.o('chest', 0, -0.06 * str, 0); P.r('head', -0.3 * str);
    P.x.lidU += 0.5 * str; P.x.sqY -= 0.05 * str;
    tailWave(P, 0.3, 0.3, t, 0, 0.2 + str * 0.6);
  }),

  jump_up: clip(0.32, false, (P, t) => {
    const crouch = keys([[0, 0.6], [0.08, 1], [0.16, 0]], t);
    const ext = keys([[0.08, 0], [0.2, 1], [0.32, 0.8]], t);
    P.x.sqY += -0.18 * crouch + 0.16 * ext;
    P.r('shoulderL', -0.9 * ext); P.r('shoulderR', -0.9 * ext);
    P.r('elbowL', 0.4 * ext); P.r('elbowR', 0.4 * ext);
    P.r('thighL', 0.9 * ext); P.r('thighR', 0.9 * ext);
    P.r('footL', 0.6 * ext); P.r('footR', 0.6 * ext);
    P.r('hips', 0.15 * ext - 0.1 * crouch); P.r('chest', -0.2 * ext);
    P.r('head', 0.1 * ext);
    P.x.eyeScale += 0.05 * ext; P.x.lidU -= 0.25 * ext;
    for (let i = 0; i < 6; i++) P.r('tail' + i, -0.15 * ext);
  }, { then: 'fall' }),

  fall: clip(0.8, true, (P, t) => {
    const w = Math.sin(TAU * t / 0.8);
    P.r('shoulderL', -0.5 + 0.2 * w, 0, -0.35); P.r('shoulderR', -0.5 - 0.2 * w, 0, 0.35);
    P.r('elbowL', 0.3); P.r('elbowR', 0.3);
    P.r('thighL', -0.2 - 0.15 * w, 0, -0.3); P.r('thighR', -0.2 + 0.15 * w, 0, 0.3);
    P.r('footL', 0.3); P.r('footR', 0.3);
    P.r('head', -0.15);
    P.x.eyeScale += 0.12; P.x.lidU -= 0.35; P.x.mouth += 0.25; P.x.earsBack += 0.4;
    for (let i = 0; i < 6; i++) P.r('tail' + i, -0.3 + 0.1 * Math.sin(TAU * t / 0.8 - i), 0.1 * Math.sin(TAU * t / 0.5 - i * 0.6));
    P.x.sqY += 0.06;
  }),

  // L5 vine: front paws gripping overhead, body hanging nose-up, hind legs + belly dangling
  hang: clip(1.6, true, (P, t) => {
    const w = TAU * t / 1.6, sw = Math.sin(w), sw2 = Math.sin(w - 0.9);
    P.r('hips', -1.0 + 0.05 * sw, 0, 0.06 * sw);
    P.r('spine', -0.12); P.r('chest', -0.08 + 0.04 * sw2);
    P.r('neck', 0.35); P.r('head', -0.05 + 0.05 * sw2, 0.08 * Math.sin(w * 0.5));
    P.r('shoulderL', -2.15, 0, 0.12); P.r('shoulderR', -2.15, 0, -0.12);
    P.o('shoulderL', 0.02, 0.01, 0.07); P.o('shoulderR', -0.02, 0.01, 0.07);
    P.s('shoulderL', 0, 0.25, 0); P.s('shoulderR', 0, 0.25, 0);
    P.r('elbowL', 0.1); P.r('elbowR', 0.1);
    P.r('pawL', 0.9); P.r('pawR', 0.9);
    P.r('thighL', 0.9 + 0.18 * sw2, 0, -0.12 - 0.05 * sw); P.r('thighR', 0.9 - 0.18 * sw2, 0, 0.12 - 0.05 * sw);
    P.r('shinL', 0.25 + 0.12 * sw); P.r('shinR', 0.25 - 0.12 * sw);
    P.r('footL', 0.35); P.r('footR', 0.35);
    P.o('belly', 0, -0.012 + 0.008 * sw2, 0.01 * sw);
    P.s('belly', 0.03, 0.05 + 0.02 * sw2, 0.03);
    P.x.claw += 0.6; P.x.eyeScale += 0.1; P.x.lidU -= 0.25; P.x.mouth += 0.3 + 0.05 * sw; P.x.smile += 0.6; P.x.noLook = 1; P.x.blinkOff = 1;
    P.x.earsBack += 0.25;
    for (let i = 0; i < 6; i++) P.r('tail' + i, 0.25 + 0.12 * Math.sin(w - i * 0.6), 0.25 * Math.sin(w * 0.5 - i * 0.5));
  }),

  land: clip(0.45, false, (P, t) => {
    const sq = keys([[0, 0.2], [0.06, 1], [0.2, -0.25], [0.32, 0.08], [0.45, 0]], t);
    P.x.sqY -= 0.25 * sq;
    P.r('neck', 0.25 * sq); P.r('head', -0.1 * sq);
    P.r('shoulderL', 0, 0, -0.2 * sq); P.r('shoulderR', 0, 0, 0.2 * sq);
    P.r('thighL', 0, 0, -0.2 * sq); P.r('thighR', 0, 0, 0.2 * sq);
    P.x.lidU += 0.3 * Math.max(0, sq);
    for (let i = 0; i < 6; i++) P.r('tail' + i, 0.12 * sq);
  }),

  scratch: clip(0.5, false, (P, t) => {
    const wind = keys([[0, 0], [0.1, 1], [0.16, 1], [0.24, 0], [0.5, 0]], t);
    const sw = keys([[0.13, 0], [0.22, 1], [0.32, 1], [0.5, 0]], t);
    const claw = keys([[0, 0], [0.08, 1], [0.38, 1], [0.5, 0]], t);
    // rear up on the hind legs a bit and swipe the right paw across
    P.r('hips', -0.3 * wind - 0.15 * sw); P.r('chest', -0.2 * wind);
    P.o('hips', 0, 0.02 * wind, 0);
    P.r('neck', 0.25 * wind + 0.1 * sw);
    P.r('shoulderR', lerp(-2.4 * wind, -1.0, sw), 0, lerp(-0.65 * wind, 0.4, sw));
    P.r('elbowR', -0.3 * wind + 0.3 * sw);
    P.r('pawR', 0.4 * wind - 0.2 * sw);
    P.r('chest', 0, 0.25 * wind - 0.35 * sw, 0.1 * wind - 0.15 * sw);
    P.r('head', 0.08 * sw, -0.15 * wind + 0.2 * sw);
    P.x.claw += claw; P.x.lidU -= 0.08; P.x.lidD += 0.25; P.x.lidTilt -= 0.18 * (wind + sw); P.x.blinkOff = 1; P.x.smile -= 0.4 * sw; P.x.mouth += 0.35 * sw;
    P.x.earsBack += 0.6 * (wind + sw);
    P.x.sqY += 0.05 * wind - 0.04 * sw;
  }),

  eat: clip(0.55, true, (P, t, c) => {
    const ch = Math.max(0, Math.sin(TAU * t / 0.55));
    P.r('chest', 0.3); P.r('neck', 0.3); P.o('neck', 0, 0.01, 0.035); P.r('head', 0.3 + 0.15 * ch);
    P.r('hips', -0.05);
    P.r('shoulderL', -0.2); P.r('shoulderR', -0.2);
    P.r('elbowL', 0.35); P.r('elbowR', 0.35);
    P.o('chest', 0, -0.03, 0);
    P.x.mouth += 0.2 + 0.95 * ch; P.x.tongue += 0.5 * ch; P.x.lidU += 0.3; P.x.lidD += 0.3; P.x.smile += 0.3; P.x.noLook = 1;
    P.x.cheeks += 0.5 + 0.3 * ch;
    tailWave(P, 0.4, 1.0, t, 0, 0.3);
  }),

  spit: clip(0.85, false, (P, t) => {
    const reel = keys([[0, 0], [0.18, 1], [0.32, 1], [0.42, 0]], t);
    const pt = keys([[0.32, 0], [0.42, 1], [0.6, 1], [0.85, 0]], t);
    P.r('neck', -0.3 * reel + 0.15 * pt); P.o('neck', 0, 0, 0.03 * pt); P.r('head', -0.25 * reel - 0.12 * pt);
    P.r('chest', -0.1 * reel + 0.12 * pt);
    P.x.cheeks += 1.2 * reel; P.x.mouth += 0.85 * pt; P.x.tongue += pt;
    P.x.lidU += 0.4 * reel + 0.15 * pt; P.x.lidD += 0.5 * reel + 0.3 * pt; P.x.lidTilt -= 0.3 * (reel + pt); P.x.blinkOff = 1;
    P.x.smile -= 0.8; P.x.eyeScale += 0.05 * pt; P.x.noLook = 1;
    P.x.sqY += 0.06 * reel - 0.05 * pt;
    P.x.earsBack += 0.6 * reel;
  }),

  pounce: clip(0.75, false, (P, t) => {
    const crouch = keys([[0, 0], [0.15, 1], [0.38, 1], [0.48, 0]], t);
    const wig = crouch * Math.sin(TAU * t * 9) * 0.06;
    const fly = keys([[0.4, 0], [0.5, 1], [0.66, 1], [0.75, 0.3]], t);
    P.r('hips', 0.18 * crouch, wig * 1.5, 0); P.o('hips', 0, 0.02 * crouch, 0);
    P.r('chest', 0.15 * crouch); P.o('chest', 0, -0.05 * crouch, 0);
    P.r('neck', -0.05 * crouch); P.r('head', -0.2 * crouch);
    P.r('shoulderL', -1.3 * fly); P.r('shoulderR', -1.3 * fly);
    P.r('pawL', -0.4 * fly); P.r('pawR', -0.4 * fly);
    P.r('thighL', 1.1 * fly); P.r('thighR', 1.1 * fly);
    P.x.claw += fly; P.x.lidU -= 0.2 * fly; P.x.eyeScale += 0.1 * fly; P.x.mouth += 0.4 * fly;
    P.x.sqY += 0.15 * fly - 0.1 * crouch;
    for (let i = 0; i < 6; i++) P.r('tail' + i, -0.2 * crouch - 0.2 * fly, wig * 3 * (i + 1) / 6);
  }),

  knockback: clip(0.65, false, (P, t) => {
    const k = keys([[0, 0], [0.08, 1], [0.35, 0.8], [0.65, 0]], t);
    P.r('hips', -0.3 * k); P.r('chest', -0.25 * k); P.r('neck', -0.25 * k); P.r('head', -0.1 * k);
    P.r('shoulderL', -1.0 * k, 0, -0.3 * k); P.r('shoulderR', -1.0 * k, 0, 0.3 * k);
    P.x.rootZ -= 0.04 * k;
    P.x.eyeScale += 0.2 * k; P.x.lidU -= 0.5 * k; P.x.mouth += 0.5 * k; P.x.pupil -= 0.4 * k;
    P.x.earsBack += k;
    for (let i = 0; i < 6; i++) P.r('tail' + i, -0.3 * k);
  }),

  whacked: clip(1.5, false, (P, t) => {
    const flat = keys([[0, 0], [0.06, 1], [0.95, 1], [1.08, -0.35], [1.22, 0.15], [1.36, -0.05], [1.5, 0]], t);
    P.x.sqY -= 0.55 * flat;
    P.r('shoulderL', 0, 0, -0.8 * Math.max(0, flat)); P.r('shoulderR', 0, 0, 0.8 * Math.max(0, flat));
    P.r('thighL', 0, 0, -0.7 * Math.max(0, flat)); P.r('thighR', 0, 0, 0.7 * Math.max(0, flat));
    P.x.lidU += 0.3 * Math.max(0, flat); P.x.mouth += 0.25 * Math.max(0, flat); P.x.tongue += 0.6 * Math.max(0, flat);
    P.x.dizzy += keys([[0, 0], [0.15, 1], [1.35, 1], [1.5, 0]], t);
    P.x.earsBack += Math.max(0, flat);
    P.x.blinkOff = 1; P.x.noLook = 1;
    for (let i = 0; i < 6; i++) P.r('tail' + i, 0.25 * Math.max(0, flat));
  }),

  sit: clip(4, true, (P, t) => {
    sitPose(P, 1); breathe(P, t);
    P.r('head', 0.03 * Math.sin(t * 0.8), 0.15 * Math.sin(TAU * t / 4), 0.04 * Math.sin(t));
    P.r('tail5', 0, 0.3 * Math.sin(TAU * t / 2));
  }),

  sleep: clip(4, true, (P, t) => {
    // loaf, chin on paws, slow deep breaths
    const b = Math.sin(TAU * t / 4);
    P.o('hips', 0, -0.07, 0); P.o('chest', 0, -0.03, 0);
    P.r('thighL', -0.9, 0, -0.5); P.r('thighR', -0.9, 0, 0.5); P.r('shinL', -0.8); P.r('shinR', -0.8); P.r('footL', 1.6); P.r('footR', 1.6);
    P.r('shoulderL', -1.35, 0, -0.05); P.r('shoulderR', -1.35, 0, 0.05); P.r('pawL', 1.3); P.r('pawR', 1.3);
    P.r('chest', 0.12); P.r('neck', 0.12); P.o('neck', 0, -0.01, 0.03); P.r('head', 0.12, 0.3, 0.3);
    P.o('chest', 0, -0.02, 0);
    P.s('belly', 0.04 * b, 0.03 * b, 0.03 * b); P.s('chest', 0.02 * b, 0.03 * b, 0);
    P.x.lidU = 1.5; P.x.lidD += 0.4; P.x.blinkOff = 1; P.x.noLook = 1; P.x.smile += 0.3;
    P.x.mouth += 0.04 * Math.max(0, b);
    P.r('tail0', 0.6, 0.6); P.r('tail1', 0.2, 0.5); P.r('tail2', 0, 0.5); P.r('tail3', 0, 0.5); P.r('tail4', 0, 0.4); P.r('tail5', 0, 0.3);
  }),

  interact: clip(0.55, false, (P, t) => {
    const up = keys([[0, 0], [0.15, 1], [0.25, 1], [0.32, 0], [0.55, 0]], t);
    const tap = keys([[0.25, 0], [0.32, 1], [0.42, 1], [0.55, 0]], t);
    P.r('shoulderR', -1.2 * up - 0.5 * tap, 0, 0.1 * up);
    P.r('elbowR', 0.6 * up); P.r('pawR', 0.4 * up - 0.3 * tap);
    P.r('chest', -0.08 * up + 0.08 * tap, 0.1 * up); P.r('head', 0.15 * tap);
    P.x.sqY -= 0.04 * tap;
  }),

  push: clip(0.9, true, (P, t) => {
    const ph = t / 0.9;
    hindLeg(P, 'L', ph % 1, 0.28, 0.6, 0.008); hindLeg(P, 'R', (ph + 0.5) % 1, 0.28, 0.6, 0.008);
    P.r('hips', 0.12); P.r('chest', 0.12); P.o('chest', 0, -0.02, 0.02);
    P.r('neck', 0.05); P.o('neck', 0, 0, 0.02); P.r('head', 0.1);
    P.r('shoulderL', -0.6 + 0.1 * Math.sin(TAU * ph)); P.r('shoulderR', -0.6 - 0.1 * Math.sin(TAU * ph));
    P.r('pawL', 0.5); P.r('pawR', 0.5);
    P.x.lidU += 0.15; P.x.lidD += 0.35; P.x.lidTilt -= 0.3; P.x.mouth += 0.15; P.x.smile -= 0.5; P.x.earsBack += 0.6;
    P.x.sqY -= 0.04 + 0.02 * Math.sin(TAU * ph * 2);
  }),

  belly_bounce: clip(0.7, false, (P, t) => {
    const crouch = keys([[0, 0], [0.12, 1], [0.2, 0]], t);
    const up = keys([[0.15, 0], [0.28, 1], [0.45, 1], [0.7, 0]], t);
    P.x.sqY -= 0.2 * crouch; P.x.sqY += 0.12 * up;
    P.r('spine', -0.25 * up); P.r('hips', 0.15 * up); P.r('chest', 0.15 * up);
    P.o('belly', 0, 0.03 * up, 0);
    P.r('neck', 0.3 * up); P.r('head', 0.2 * up);
    P.x.lidU += 0.5 * up; P.x.mouth += 0.3 * up; P.x.cheeks += 0.6 * up;
    P.r('shoulderL', 0.3 * up, 0, -0.3 * up); P.r('shoulderR', 0.3 * up, 0, 0.3 * up);
  }),

  smug: clip(4, true, (P, t) => {
    sitPose(P, 1); breathe(P, t);
    // paws folded on the belly, head tilted, tail tip flicking
    P.r('shoulderL', 0.25, 0, 0.35); P.r('shoulderR', 0.25, 0, -0.35);
    P.r('elbowL', -0.45, -0.6); P.r('elbowR', -0.45, 0.6);
    P.r('head', -0.08, 0.1, 0.15 + 0.03 * Math.sin(t)); P.x.smile += 0.8; P.x.lidU += 0.15; P.x.lidTilt += 0.15;
    P.r('tail5', 0, 0.4 * Math.sin(TAU * t / 1.6)); P.r('tail4', 0, 0.2 * Math.sin(TAU * t / 1.6 - 0.6));
  }),

  chew: clip(0.5, true, (P, t) => {
    const ch = Math.max(0, Math.sin(TAU * t / 0.5));
    breathe(P, t);
    P.x.mouth += 0.05 + 0.5 * ch; P.x.cheeks += 0.6 + 0.4 * ch; P.x.smile += 0.5;
    P.x.lidU += 0.35; P.x.lidD += 0.35;
    P.r('head', -0.06 * ch, 0.08 * Math.sin(TAU * t / 1.0), 0.05 * Math.sin(TAU * t / 1.0));
    tailWave(P, 0.3, 0.8, t, 0, 0.3);
  }),

  celebrate: clip(1.2, true, (P, t) => {
    // happy belly-drum: sitting, bouncing, patting the full tummy
    sitPose(P, 1);
    const w = TAU * t / 1.2;
    const b = Math.abs(Math.sin(w));
    P.x.rootY += 0.03 * b; P.x.sqY += 0.07 * b - 0.03;
    const pl = Math.max(0, Math.sin(w * 2)), pr = Math.max(0, -Math.sin(w * 2));
    P.r('shoulderL', 0.35 - 0.35 * pl, 0, 0.12); P.r('shoulderR', 0.35 - 0.35 * pr, 0, -0.12);
    P.r('elbowL', 0.45 - 0.2 * pl); P.r('elbowR', 0.45 - 0.2 * pr);
    P.s('belly', 0.03 * (pl + pr), -0.02 * (pl + pr), 0.03 * (pl + pr));
    P.r('chest', 0, 0, 0.1 * Math.sin(w)); P.r('head', -0.12, 0.1 * Math.sin(w), -0.2 * Math.sin(w));
    P.x.lidU += 0.6; P.x.lidD += 0.55; P.x.smile += 1; P.x.mouth += 0.3; P.x.blinkOff = 1;
    P.r('tail5', 0, 0.5 * Math.sin(w * 2)); P.r('tail4', 0, 0.4 * Math.sin(w * 2 - 0.6));
  }),
};

export const EXPRESSIONS = {
  smug: { lidU: 0.4, lidD: 0.1, lidTilt: 0.12, smile: 0.35, pupil: 0 },
  happy: { lidU: 0.3, lidD: 0.55, lidTilt: 0, smile: 1, pupil: 0.1 },
  disgust: { lidU: 0.42, lidD: 0.35, lidTilt: -0.3, smile: -0.8, pupil: -0.1 },
  shock: { lidU: -0.25, lidD: 0, lidTilt: 0, smile: -0.4, pupil: -0.35, eyeScale: 0.15, mouth: 0.35 },
  sleepy: { lidU: 0.62, lidD: 0.15, lidTilt: 0.2, smile: 0.1, pupil: 0 },
  chew: { lidU: 0.38, lidD: 0.45, lidTilt: 0.05, smile: 0.5, pupil: 0 },
};
