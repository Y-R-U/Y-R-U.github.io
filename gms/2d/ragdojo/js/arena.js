// Bakes the sheet for one fight: paper, plus the doodles that make each page feel drawn on.

import { makeSheet } from './paper.js';
import { stroke, circle, line, rnd, splat } from './ink.js';
import { SHEET_W, SHEET_H, GROUND_Y, RULE, RULE_TOP } from './config.js';
import { fk, POSE } from './poses.js';
import { P } from './ragdoll.js';

/** A tiny scribbled spectator, drawn straight from the same rig the fighters use. */
function doodle(ctx, x, y, s, seed, poseName, col) {
  const pts = fk(POSE[poseName], rnd(seed) > 0.5 ? 1 : -1, s);
  const o = { w: 2.2 * s, passes: 1, wob: 1.4, seed, col, a: 0.34, step: 6 };
  const px = (i) => x + pts[i][0], py = (i) => y + pts[i][1];
  stroke(ctx, [[px(P.PELVIS), py(P.PELVIS)], [px(P.NECK), py(P.NECK)]], o);
  stroke(ctx, [[px(P.NECK), py(P.NECK)], [px(P.ELBOW_L), py(P.ELBOW_L)], [px(P.HAND_L), py(P.HAND_L)]], o);
  stroke(ctx, [[px(P.NECK), py(P.NECK)], [px(P.ELBOW_R), py(P.ELBOW_R)], [px(P.HAND_R), py(P.HAND_R)]], o);
  stroke(ctx, [[px(P.PELVIS), py(P.PELVIS)], [px(P.KNEE_L), py(P.KNEE_L)], [px(P.FOOT_L), py(P.FOOT_L)]], o);
  stroke(ctx, [[px(P.PELVIS), py(P.PELVIS)], [px(P.KNEE_R), py(P.KNEE_R)], [px(P.FOOT_R), py(P.FOOT_R)]], o);
  circle(ctx, px(P.HEAD), py(P.HEAD), 13 * s, o);
}

const CHEERS = ['guard', 'victory', 'taunt', 'walkA', 'walkC', 'bow'];

export function buildArena(level, seed = 1) {
  const sheet = makeSheet(SHEET_W, SHEET_H, 7 + level.idx * 13, {
    rule: RULE, ruleTop: RULE_TOP, margin: 132,
  });
  const g = sheet.getContext('2d');
  g.save();
  g.globalCompositeOperation = 'multiply';

  // Hand-written page heading, sitting on the top ruled line.
  g.font = `700 44px "Caveat", "Bradley Hand", cursive`;
  g.fillStyle = 'rgba(48,60,92,0.62)';
  g.textAlign = 'left';
  g.save();
  g.translate(168, RULE_TOP + 34);
  g.rotate(-0.014);
  g.fillText(level.dojo, 0, 0);
  g.restore();
  g.font = `400 24px "Patrick Hand", cursive`;
  g.fillStyle = 'rgba(60,72,100,0.45)';
  g.save();
  g.translate(170, RULE_TOP + 34 + RULE);
  g.rotate(-0.01);
  g.fillText(level.title, 0, 0);
  g.restore();

  // Spectators stand on the ground line but only out at the page edges, so they never
  // clutter the space the fight actually happens in.
  let s = seed * 977 + level.idx * 31;
  const zones = [[150, 340], [SHEET_W - 340, SHEET_W - 150]];
  for (const [x0, x1] of zones) {
    const n = 3 + ((rnd(s) * 3) | 0);
    for (let i = 0; i < n; i++) {
      s += 17;
      const sc = 0.42 + rnd(s + 3) * 0.12;
      doodle(g, x0 + rnd(s) * (x1 - x0), GROUND_Y, sc, (s * 7) | 0,
        CHEERS[(rnd(s + 5) * CHEERS.length) | 0], '#3d4658');
    }
  }
  // A row of small doodles up in the notes, well clear of the action.
  for (let i = 0; i < 9; i++) {
    s += 23;
    doodle(g, 220 + rnd(s) * (SHEET_W - 440), RULE_TOP + RULE * 3.4, 0.26 + rnd(s + 2) * 0.08,
      (s * 11) | 0, CHEERS[(rnd(s + 7) * CHEERS.length) | 0], '#4a5468');
  }

  // Idle margin doodles: boxes, arrows, crossings-out.
  for (let i = 0; i < 5; i++) {
    s += 29;
    const x = 40 + rnd(s) * 70, y = 220 + rnd(s + 1) * (SHEET_H - 420);
    stroke(g, [[x, y], [x + 26, y - 8], [x + 20, y + 18], [x - 4, y + 10], [x, y]],
      { w: 2, passes: 1, wob: 1.8, seed: s, col: '#4a5468', a: 0.18, step: 7 });
  }
  // A few old ink spots the page already had.
  for (let i = 0; i < 4; i++) {
    s += 41;
    splat(g, 200 + rnd(s) * (SHEET_W - 400), 200 + rnd(s + 2) * (SHEET_H - 300),
      3 + rnd(s + 4) * 5, s | 0, '#3a4050', 0.16);
  }
  g.restore();

  // The ground line the fight happens on gets an extra pass, so it reads as the floor.
  g.save();
  g.globalCompositeOperation = 'multiply';
  stroke(g, [[24, GROUND_Y], [SHEET_W - 24, GROUND_Y]],
    { w: 2.6, passes: 2, wob: 0.7, seed: 313, col: 'rgba(96,132,178,0.85)', a: 1, step: 40 });
  g.restore();

  return sheet;
}
