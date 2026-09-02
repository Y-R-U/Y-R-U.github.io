#!/usr/bin/env node
/**
 * The crossing rule, as a test: standing fighters are solid and cannot walk through each
 * other; jumping over someone is the only way to swap sides.
 *
 *   node tools/crossgate.mjs
 *   node tools/crossgate.mjs --falsify   # disable separate() and watch it go red
 */
const noopCtx = new Proxy({}, { get: (t, k) => {
  if (k === 'canvas') return { width: 0, height: 0 };
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
  return () => {};
}, set: () => true });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noopCtx }), fonts: { ready: Promise.resolve() } };
globalThis.window = globalThis;
globalThis.requestAnimationFrame = (fn) => setTimeout(() => fn(Date.now()), 0);

const { Match } = await import('../js/match.js');
const { LEVELS, moveStats } = await import('../js/config.js');
const { DEFAULT } = await import('../js/save.js');
const falsify = process.argv.includes('--falsify');

const DT = 1 / 120;
let pass = 0, fail = 0;
const ok = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };

function scenario({ jump, seconds = 3.0 }) {
  const m = new Match({ level: LEVELS[0], save: DEFAULT(), onEnd: () => {} });
  if (falsify) m.separate = () => {};
  m.brains.length = 0;                       // enemy stands still
  const e = m.enemies[0];
  e.hp = 1e9; m.player.hp = 1e9;             // nobody dies, nobody gets knocked down
  m.player.x = e.x - 200;
  m.player.place(m.player.x, m.world.groundY);
  const startLeft = m.player.x < e.x;
  let crossed = false, jumped = false, minGap = 1e9;
  for (let t = 0; t < seconds; t += DT) {
    e.vx = 0; e.x = e.x;                     // pin the target
    m.player.move(1, DT);                    // hold "forward" the whole time
    // Jump from right up against them, which is what a player actually does.
    if (jump && !jumped && Math.abs(m.player.x - e.x) < 60) { m.player.jump(); jumped = true; }
    m.update(DT, null);
    minGap = Math.min(minGap, Math.abs(m.player.x - e.x));
    if ((m.player.x < e.x) !== startLeft) crossed = true;
  }
  return { crossed, minGap: Math.round(minGap), jumped };
}

const walk = scenario({ jump: false });
ok('walking into someone does NOT cross sides', !walk.crossed, `closest gap ${walk.minGap}u`);
ok('walking stops at a solid body', walk.minGap >= 30 && walk.minGap < 55, `gap ${walk.minGap}u`);

const hop = scenario({ jump: true });
ok('jumping over them DOES cross sides', hop.crossed, `jumped=${hop.jumped}`);

/**
 * Specials that carry you forward must not deposit you on the far side. Only the move
 * itself is measured: walking over the body afterwards is the separate, deliberate rule
 * below, and the target is floored by the hit either way.
 */
function chargeScenario(id, gap) {
  const save = DEFAULT();
  save.moves[id] = { owned: true, power: 0, cd: 0 };
  const m = new Match({ level: LEVELS[0], save, onEnd: () => {} });
  if (falsify) {
    m.separate = () => {};
    const land = m.land.bind(m);         // undo the stop-on-impact brake too
    m.land = (a, t, d, f) => { const v = a.vx; land(a, t, d, f); a.vx = v; };
  }
  m.brains.length = 0;
  const e = m.enemies[0];
  e.hp = 1e9; m.player.hp = 1e9;
  m.player.x = e.x - gap;
  m.player.place(m.player.x, m.world.groundY);
  const startLeft = m.player.x < e.x;
  const fired = m.player.special(moveStats(save, id));
  let crossed = false, hit = false, airborne = false;
  for (let t = 0; t < 2 && m.player.attack; t += DT) {
    m.update(DT, null);
    if (e.mode === 'down' || e.mode === 'dead' || e.mode === 'stagger') hit = true;
    if (!m.player.onGround) airborne = true;
    if ((m.player.x < e.x) !== startLeft) crossed = true;
  }
  return { fired, hit, crossed, airborne };
}

const dash = chargeScenario('dash', 150);
ok('PENCIL DASH connects', dash.fired && dash.hit, `fired=${dash.fired} hit=${dash.hit}`);
ok('PENCIL DASH does not carry you through the body', !dash.crossed);

const flip = chargeScenario('flipF', 70);
ok('FLIP KICK connects', flip.fired && flip.hit, `fired=${flip.fired} hit=${flip.hit}`);
ok('FLIP KICK only crosses by leaving the ground', !flip.crossed || flip.airborne,
  `crossed=${flip.crossed} airborne=${flip.airborne}`);

/**
 * A body on the floor. A CORPSE must never block: it lies there for the rest of the fight
 * and would wall you off from the other half of a gauntlet. Someone merely knocked down is
 * a different matter — walking over them while they got up was measured as the single
 * biggest source of accidental side swaps, so they stay solid until they are on their feet.
 */
function flooredScenario(dying) {
  const m = new Match({ level: LEVELS[0], save: DEFAULT(), onEnd: () => {} });
  if (falsify) m.separate = () => {};
  m.brains.length = 0;
  const e = m.enemies[0];
  m.player.hp = 1e9;
  e.hp = dying ? 0 : 1e9;
  m.player.x = e.x - 200; m.player.place(m.player.x, m.world.groundY);
  e.goDown(0, 0, dying);
  const startLeft = m.player.x < m.bodyX(e);
  let crossed = false;
  for (let t = 0; t < 4; t += DT) {
    m.player.move(1, DT);
    m.update(DT, null);
    if ((m.player.x < m.bodyX(e)) !== startLeft) crossed = true;
  }
  return crossed;
}
ok('a CORPSE never blocks you', flooredScenario(true));
ok('a knocked-down fighter DOES block you', !flooredScenario(false));

console.log(`\n${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
