#!/usr/bin/env node
/**
 * A slam started in the air drives you down onto whoever is underneath: the shockwave must
 * go off with your feet on the page, and it must catch the fighter you jumped over towards.
 * Checked for INK SLAM and for the dark set's MOLOTOV, which shares its mechanic.
 *
 *   node tools/slamgate.mjs
 */
const noopCtx = new Proxy({}, {
  get: (t, k) => (k === 'canvas' ? { width: 0, height: 0 }
    : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} })
    : () => {}),
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }),
  fonts: { ready: Promise.resolve() },
};
globalThis.window = globalThis;

const { Match } = await import('../js/match.js');
const { LEVELS } = await import('../js/config.js');
const { DEFAULT } = await import('../js/save.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
const DT = 1 / 120;

function airSlam(id, theme) {
  const save = DEFAULT();
  save.theme = theme;
  save.seen = { punch: true, power: true, move: true, gesture: true, duck: true, jump: true };
  save.moves[id] = { owned: true, power: 0, cd: 0 };
  const m = new Match({ level: LEVELS[2], save, onEnd: () => {} });
  m.introT = 0;
  const p = m.player, e = m.enemies[0];
  // Freeze the enemy where it stands, a short hop in front of the player.
  m.brains.length = 0;
  e.place(p.x + 150, e.y);
  p.jump();
  for (let i = 0; i < 36; i++) m.update(DT, null);
  const airborneAtCast = !p.onGround;
  const heightAtCast = Math.round(p.standY - p.y);
  const hp0 = e.hp;
  m.playerSpecial(id);
  let liveGrounded = null, t = 0;
  while (p.attack && t < 2) {
    const A = p.attack;
    m.update(DT, null);
    t += DT;
    // The first tick the hit frame is reached is where the shockwave fires.
    if (liveGrounded === null && A.t >= 0.17) liveGrounded = p.onGround;
  }
  return { airborneAtCast, heightAtCast, liveGrounded, dealt: hp0 - e.hp };
}

for (const [id, theme, label] of [['slam', 'light', 'INK SLAM'], ['d_molotov', 'dark', 'MOLOTOV'], ['c_quake', 'cyborg', 'SEISMIC SLAM']]) {
  const r = airSlam(id, theme);
  ok(`${label}: cast in the air`, r.airborneAtCast, `${r.heightAtCast}u up`);
  ok(`${label}: the shockwave goes off on the ground`, r.liveGrounded === true);
  ok(`${label}: and hits the fighter below`, r.dealt > 0, `dealt ${r.dealt.toFixed(1)}`);
}

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
