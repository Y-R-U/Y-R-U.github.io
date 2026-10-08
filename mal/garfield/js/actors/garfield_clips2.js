// Garfield's Chapter Two clips (merged into CLIPS by garfield.js). Same conventions as garfield_anim.js.
import { lerp, keys, clamp } from './shared/pose.js';
import { sitPose } from './garfield_anim.js';

const TAU = Math.PI * 2;
const clip = (dur, loop, fn, extra = {}) => ({ dur, loop, fn, ...extra });
const tail = (P, amp, freq, t, lift = 0) => { for (let i = 0; i < 6; i++) P.r('tail' + i, lift * (i < 2 ? 1 : 0.3), amp * (i + 1) / 6 * Math.sin(TAU * freq * t - i * 0.55) + 0.15); };
const allLegs = (P, f) => { for (const s of ['L', 'R']) f(s, s === 'L' ? 1 : -1); };

export const CLIPS2 = {
  // big wet-dog shake that sends fur flying (ev puff: spawn hair particles / furPile)
  shed: clip(1.4, false, (P, t) => {
    const sh = keys([[0, 0], [0.15, 1], [1.1, 1], [1.4, 0]], t);
    const w = Math.sin(t * 38) * sh;
    P.r('head', 0, 0.5 * w, 0.35 * w); P.r('neck', 0, 0.25 * w);
    P.r('chest', 0, 0.2 * w, 0.25 * w); P.r('spine', 0, -0.12 * w, -0.15 * w); P.r('hips', 0, -0.2 * w, 0.2 * w);
    P.x.puff += 0.6 * sh; P.x.lidU += 0.7 * sh; P.x.earsBack += 0.4 * sh; P.x.mouth += 0.15 * sh; P.x.blinkOff = 1; P.x.noLook = 1;
    for (let i = 0; i < 6; i++) P.r('tail' + i, 0, 0.6 * Math.sin(t * 38 - i * 0.6) * sh);
  }, { ev: { puff: 0.5 } }),

  // sulk: walks into the corner and presses his face into it
  head_in_corner: clip(3, true, (P, t) => {
    const b = Math.sin(TAU * t / 3);
    P.r('neck', 0.35); P.o('neck', 0, -0.01, 0.04); P.r('head', 0.35);
    P.r('chest', 0.12); P.r('hips', -0.06);
    P.o('chest', 0, -0.02 + 0.006 * b, 0);
    P.x.earsBack += 0.9; P.x.lidU += 0.75; P.x.smile -= 0.8; P.x.noLook = 1;
    for (let i = 0; i < 6; i++) P.r('tail' + i, 0.35 + (i > 3 ? 0.2 : 0), 0.05 * Math.sin(TAU * t / 3 - i * 0.5));
  }),

  // straight up in the air, fur on end (meant to be a shock reaction; root stays put)
  startled_jump: clip(1.0, false, (P, t) => {
    const air = Math.sin(Math.PI * clamp(t / 0.6, 0, 1));
    const puff = keys([[0, 0], [0.08, 1], [0.7, 1], [1.0, 0]], t);
    P.x.rootY += 0.35 * air;
    P.x.sqY += 0.18 * air - 0.12 * keys([[0.6, 0], [0.66, 1], [0.8, 0]], t);
    allLegs(P, (s, k) => { P.r('shoulder' + s, 0.15 * air, 0, -k * 0.5 * air); P.r('thigh' + s, -0.15 * air, 0, -k * 0.5 * air); });
    P.r('spine', -0.3 * air); P.x.puff += puff;
    P.x.eyeScale += 0.35 * puff; P.x.pupil -= 0.45 * puff; P.x.lidU -= 0.45 * puff; P.x.mouth += 0.6 * air; P.x.earsBack += 0.2;
    P.x.blinkOff = 1; P.x.noLook = 1;
    for (let i = 0; i < 6; i++) P.r('tail' + i, -0.35 * puff, 0);
  }),

  meow_loud: clip(1.1, false, (P, t) => {
    const m = keys([[0, 0], [0.2, 1], [0.85, 1], [1.1, 0]], t);
    P.r('neck', -0.25 * m); P.r('head', -0.3 * m); P.r('chest', -0.12 * m);
    P.r('shoulderL', -0.15 * m); P.r('shoulderR', -0.15 * m);
    P.x.mouth += 1.15 * m; P.x.tongue += 0.6 * m; P.x.lidU -= 0.1 * m; P.x.lidTilt -= 0.3 * m; P.x.earsBack += 0.6 * m;
    P.x.sqY += 0.06 * m; P.x.blinkOff = 1;
  }, { ev: { meow: 0.25 } }),

  // seated on the table: paw jabs upward at a face (L9)
  poke: clip(0.7, false, (P, t) => {
    sitPose(P, 1);
    const up = keys([[0, 0], [0.15, 0.6], [0.28, 1], [0.42, 1], [0.7, 0]], t);
    P.r('shoulderR', -1.3 * up, 0, 0.15 * up); P.r('elbowR', 0.4 * up - 0.6 * keys([[0.2, 0], [0.3, 1], [0.45, 0]], t)); P.r('pawR', -0.5 * up);
    P.r('head', -0.25 * up); P.r('chest', -0.1 * up);
    P.x.lidU -= 0.05; P.x.lidTilt -= 0.35 * up; P.x.smile -= 0.6;
  }, { ev: { poke: 0.3 } }),

  // furious glare that builds with setSeethe(0..1) (hold-to-build); sits on the table
  seethe: clip(1, true, (P, t, c) => {
    const s = clamp(c.seethe ?? 0, 0, 1);
    sitPose(P, 1);
    const tr = Math.sin(t * 60) * s * s;
    P.r('head', 0.12 * s, 0, 0.03 * tr); P.r('chest', 0.06 * s, 0, 0.02 * tr);
    P.x.lidU -= 0.12 + 0.05 * s; P.x.lidTilt -= 0.12 + 0.28 * s; P.x.lidD += 0.12 * s; P.x.pupil -= 0.45 * s; P.x.eyeScale += 0.08 * s;
    P.x.smile -= 0.4 + 0.8 * s; P.x.earsBack += 1.2 * s; P.x.puff += 0.55 * s; P.x.sqY += 0.02 * tr;
    P.x.mouth += 0.12 * s; P.x.noLook = 1; P.x.blinkOff = s > 0.3 ? 1 : 0;
    for (let i = 0; i < 6; i++) P.r('tail' + i, -0.1 * s, (0.12 + 0.25 * s) * Math.sin(TAU * t * (1 + 2 * s) - i * 0.6));
  }),

  // group hug melts him: blissful grin, hearts
  loved: clip(2.4, true, (P, t) => {
    sitPose(P, 1);
    const w = Math.sin(TAU * t / 2.4);
    P.x.sqY -= 0.08 + 0.03 * w; P.r('head', -0.15, 0, 0.18 * w); P.r('chest', -0.05, 0, 0.06 * w);
    P.r('shoulderL', 0.3, 0, 0.3); P.r('shoulderR', 0.3, 0, -0.3);
    P.x.lidU += 0.6; P.x.lidD += 0.6; P.x.smile += 1.5; P.x.mouth += 0.25; P.x.hearts += 1; P.x.blinkOff = 1; P.x.noLook = 1;
    tail(P, 0.5, 0.5, t, 0.2);
  }),

  // grip with the teeth/claws and yank backwards (carpet, L5)
  pull: clip(0.9, true, (P, t) => {
    const y = Math.max(0, Math.sin(TAU * t / 0.9));
    P.r('hips', -0.2 - 0.1 * y); P.o('hips', 0, -0.03, -0.03 * y);
    P.r('chest', 0.3); P.o('chest', 0, -0.05, 0);
    P.r('neck', 0.35); P.r('head', 0.3 - 0.1 * y);
    allLegs(P, (s) => { P.r('shoulder' + s, -0.55); P.r('paw' + s, 0.5); P.r('thigh' + s, 0.35 + 0.15 * y); P.r('foot' + s, -0.3); });
    P.x.rootZ -= 0.03 * y; P.x.claw += 1; P.x.mouth += 0.3; P.x.lidU += 0.2; P.x.lidTilt -= 0.4; P.x.smile -= 0.5; P.x.earsBack += 0.8; P.x.noLook = 1;
    for (let i = 0; i < 6; i++) P.r('tail' + i, -0.2, 0.15 * Math.sin(TAU * t / 0.9 * 2 - i));
  }, { ev: { yank: 0.22 } }),

  // rolling on his back among the socks (L10)
  play_socks: clip(2.0, true, (P, t) => {
    const w = TAU * t / 2.0;
    P.x.rootY += 0.0; P.x.sqY -= 0.05;
    P.r('spine', 0, 0, 0.4 * Math.sin(w)); P.r('hips', 0, 0, 2.6 + 0.45 * Math.sin(w)); P.r('chest', 0, 0, 0.3 * Math.sin(w));
    P.o('hips', 0, 0.06, 0);
    allLegs(P, (s, k) => {
      P.r('shoulder' + s, -1.2 + 0.4 * Math.sin(w * 2 + k), 0, 0); P.r('elbow' + s, 0.6 + 0.4 * Math.sin(w * 3 + k));
      P.r('thigh' + s, -0.9 + 0.35 * Math.sin(w * 2 - k), 0, 0); P.r('shin' + s, 0.5);
    });
    P.r('head', -0.2, 0.3 * Math.sin(w), 0);
    P.x.smile += 1.2; P.x.lidU += 0.4; P.x.lidD += 0.45; P.x.mouth += 0.3; P.x.claw += 0.5; P.x.noLook = 1;
    tail(P, 0.6, 1, t);
  }),

  // cheeks puffed, blowing as hard as he can (whistle in the mouth socket)
  blow_whistle: clip(1.8, false, (P, t) => {
    sitPose(P, 1);
    const b = keys([[0, 0], [0.3, 0.6], [0.5, 1], [1.4, 1], [1.8, 0]], t);
    P.x.cheeks += 2.0 * b; P.x.eyeScale += 0.25 * b; P.x.lidU -= 0.2 * b; P.x.mouth += 0.05; P.x.smile -= 0.4 * b;
    P.r('head', -0.15 * b); P.r('chest', -0.1 * b); P.x.sqY += 0.05 * b; P.x.puff += 0.3 * b;
    P.r('shoulderR', -0.9 * b, 0, 0.3 * b); P.r('elbowR', -0.5 * b); P.r('pawR', 0.6 * b);
    P.x.earsBack += 0.4 * b; P.x.blinkOff = 1; P.x.noLook = 1;
  }, { ev: { blow: 0.5 } }),

  // tosses whatever is in the mouth/paw over his shoulder (ev release)
  throw_behind: clip(0.9, false, (P, t) => {
    const wind = keys([[0, 0], [0.2, 1], [0.32, 0]], t);
    const fl = keys([[0.25, 0], [0.38, 1], [0.6, 1], [0.9, 0]], t);
    sitPose(P, 1 - 0.0 * fl);
    P.r('shoulderR', -0.6 * wind - 2.4 * fl, 0, 0.2 * fl); P.r('elbowR', -0.3 * fl);
    P.r('head', -0.3 * fl, 0.4 * fl); P.r('chest', -0.15 * fl, 0.2 * fl);
    P.x.lidU += 0.05; P.x.smile += 0.2 * fl; P.x.noLook = 1;
  }, { ev: { release: 0.36 } }),

  // proud upright sit on the tabletop (paws together, chin up)
  sit_table: clip(4, true, (P, t) => {
    sitPose(P, 1);
    P.r('shoulderL', -0.1); P.r('shoulderR', -0.1);
    P.r('head', -0.1 + 0.03 * Math.sin(t * 0.8), 0.12 * Math.sin(TAU * t / 4));
    P.x.lidU += 0.0; P.x.smile += 0.1;
    P.r('tail5', 0, 0.3 * Math.sin(TAU * t / 2));
  }),

  // squeezed in a group hug: squished, paws pinned, eyes bulging then softening
  hug_squeezed: clip(2.0, true, (P, t) => {
    sitPose(P, 1);
    const q = 0.5 + 0.5 * Math.sin(TAU * t / 2.0);
    P.x.sqY += 0.12 * q; P.x.sqX -= 0.1;
    P.r('shoulderL', 0, 0, 0.5); P.r('shoulderR', 0, 0, -0.5); P.r('elbowL', -0.6); P.r('elbowR', -0.6);
    P.r('head', -0.1, 0, 0.1 * Math.sin(TAU * t / 2));
    P.x.cheeks += 0.8 * q; P.x.eyeScale += 0.2 * q; P.x.lidU += 0.2 * (1 - q); P.x.mouth += 0.15; P.x.smile += 0.3; P.x.noLook = 1;
    for (let i = 0; i < 6; i++) P.r('tail' + i, -0.2, 0.3 * Math.sin(TAU * t - i * 0.5));
  }),
};
