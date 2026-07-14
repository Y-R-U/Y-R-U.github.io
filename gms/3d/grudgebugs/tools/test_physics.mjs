// node tools/test_physics.mjs — ledge math, ballistics, bounces, rolling dung,
// explosions, ledge bites, ragdolls. Must stay green.
import {
  buildLedges, posAt, nearestS, spanAt, addGap, solidSpans, ledgeHit,
  simulate, explosionEffects, biteLedges, simulateRag, landDamage, muzzleVel,
} from '../js/physics.js';
import { PHYS, WEAPONS } from '../js/config.js';

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  if (!cond) fails++;
};
const W = (id) => WEAPONS.find(w => w.id === id);

// a long flat plank at y=2 along +z, and a lower plank at y=0 offset in x
const mkWorld = () => {
  const ledges = buildLedges([
    { pts: [{ x: 0, y: 2, z: -10 }, { x: 0, y: 2, z: 10 }] },
    { pts: [{ x: 3, y: 0, z: -10 }, { x: 3, y: 0, z: 10 }] },
  ]);
  return { ledges, bugs: [], wind: { x: 0, z: 0 }, killY: PHYS.killY };
};

// 1. ledge parameterisation
{
  const [L] = mkWorld().ledges;
  ok('ledge length', Math.abs(L.len - 20) < 1e-6, `len=${L.len}`);
  const mid = posAt(L, 10);
  ok('posAt midpoint', Math.abs(mid.pos.z) < 1e-6 && mid.pos.y === 2, `z=${mid.pos.z.toFixed(3)}`);
  const n = nearestS(L, { x: 0.4, y: 2, z: 3 });
  ok('nearestS', Math.abs(n.s - 13) < 1e-6 && Math.abs(n.distXZ - 0.4) < 1e-6);
}

// 2. lobbed bazooka comes down onto the plank
{
  const world = mkWorld();
  const res = simulate({
    pos: { x: 0, y: 2.6, z: -8 }, vel: muzzleVel(0, 1.0, 0.7, W('bazooka').speed), w: W('bazooka'), shooterId: 'a',
  }, world);
  ok('bazooka lands on ledge', res.impact.type === 'ledge',
    `type=${res.impact.type} at z=${res.impact.pos.z.toFixed(2)} y=${res.impact.pos.y.toFixed(2)}`);
  ok('bazooka lands forward', res.impact.pos.z > -7.5);
}

// 3. wind bends the acorn
{
  const world = mkWorld();
  const mk = (wx) => simulate({
    pos: { x: 0, y: 2.6, z: -8 }, vel: muzzleVel(0, 1.1, 0.9, W('bazooka').speed), w: W('bazooka'), shooterId: 'a',
  }, { ...world, wind: { x: wx, z: 0 }, ledges: [] });
  const calm = mk(0), gale = mk(3);
  const endCalm = calm.path[calm.path.length - 1], endGale = gale.path[gale.path.length - 1];
  ok('wind drifts downwind', endGale.x - endCalm.x > 1.5, `drift=${(endGale.x - endCalm.x).toFixed(2)}m`);
}

// 4. grenade bounces on the plank then explodes on fuse, still near plank top
{
  const world = mkWorld();
  const res = simulate({
    pos: { x: 0, y: 2.6, z: -8 }, vel: muzzleVel(0, 0.9, 0.55, W('grenade').speed), w: W('grenade'), shooterId: 'a',
  }, world);
  ok('grenade fuses', res.impact.type === 'fuse', `type=${res.impact.type} t=${res.impact.t.toFixed(2)}`);
  ok('grenade stays on plank', Math.abs(res.impact.pos.x) < 1 && res.impact.pos.y > 1.8 && res.impact.pos.y < 3.4,
    `pos=(${res.impact.pos.x.toFixed(2)},${res.impact.pos.y.toFixed(2)},${res.impact.pos.z.toFixed(2)})`);
}

// 5. dung ball rolls along the ledge into a bug
{
  const world = mkWorld();
  world.bugs = [{ id: 'victim', alive: true, pos: { x: 0, y: 2, z: 4 } }];
  const res = simulate({
    pos: { x: 0, y: 2.7, z: -6 }, vel: muzzleVel(0, 0.5, 0.35, 6), w: W('dungball'), shooterId: 'a',
  }, world);
  ok('dung rolls into bug', res.impact.type === 'bug' && res.impact.hitBugId === 'victim',
    `type=${res.impact.type} z=${res.impact.pos.z.toFixed(2)}`);
}

// 6. explosion: nearer bug hurts more, impulse points away & upward
{
  const bugs = [
    { id: 'near', alive: true, pos: { x: 0.6, y: 2, z: 0 } },
    { id: 'far', alive: true, pos: { x: 1.5, y: 2, z: 0 } },
    { id: 'out', alive: true, pos: { x: 9, y: 2, z: 0 } },
  ];
  const fx = explosionEffects({ x: 0, y: 2.3, z: 0 }, W('bazooka'), bugs);
  const near = fx.find(f => f.id === 'near'), far = fx.find(f => f.id === 'far');
  ok('near hurts more', near && far && near.dmg > far.dmg, `near=${near?.dmg} far=${far?.dmg}`);
  ok('out of radius spared', !fx.find(f => f.id === 'out'));
  ok('impulse away+up', near.imp.x > 0 && near.imp.y > 0);
}

// 7. explosions bite the ledge; gap blocks walking and rolling
{
  const world = mkWorld();
  const L = world.ledges[0];
  const bites = biteLedges(world.ledges, { x: 0, y: 2.1, z: 0 }, 1.7);
  ok('bite happens', bites.length === 1 && bites[0].ledge === L, `bites=${bites.length}`);
  ok('gap blocks span', spanAt(L, 10) === null);
  const spans = solidSpans(L);
  ok('two solid pieces remain', spans.length === 2, `pieces=${spans.length}`);
  ok('projectile passes through gap', ledgeHit(world.ledges, { x: 0, y: 2 - 0.2, z: 0 }, 0.1) === null);
}

// 8. ragdoll knocked sideways off the high plank lands on the low plank
{
  const world = mkWorld();
  const rag = simulateRag({ x: 0, y: 2.15, z: 0 }, { x: 3.2, y: 3, z: 0 }, world, world.ledges[0], true);
  ok('rag lands on lower ledge', rag.end.type === 'land' && rag.end.ledge === world.ledges[1],
    `end=${rag.end.type} x=${rag.end.pos.x.toFixed(2)} y=${rag.end.pos.y.toFixed(2)}`);
}

// 9. ragdoll blasted clear of everything splashes
{
  const world = mkWorld();
  const rag = simulateRag({ x: 0, y: 2.15, z: 0 }, { x: -8, y: 2, z: 0 }, world, world.ledges[0], true);
  ok('rag splashes', rag.end.type === 'splash', `end=${rag.end.type}`);
}

// 10. landing damage thresholds
ok('soft landing free', landDamage(4) === 0);
ok('hard landing hurts', landDamage(9) > 10, `dmg=${landDamage(9)}`);

console.log(fails ? `\n${fails} FAILURES` : '\nall green 🐜');
process.exit(fails ? 1 : 0);
