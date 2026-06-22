/**
 * Headless gameplay smoke test — runs the Pixi-free simulation in Node with a
 * synthetic "auto-pilot" player (aim at nearest enemy, kite, fire, special, and
 * auto-pick upgrades). Proves waves/AI/projectiles/collisions/pickups/progression
 * actually work, and that sim has zero render/DOM dependencies (the §15 seam).
 */
import { World } from '../app/src/sim/World';
import { stepWorld, applyUpgrade } from '../app/src/sim/sim';
import { emptyInput } from '../app/src/input/InputState';

const w = new World('cyto', 12345);
const input = emptyInput();
const dt = 1 / 60;
const maxSteps = 60 * 60; // 60s

let sawEnemy = false;
let sawToxin = false;
let sawEnemyProj = false;
let sawPickup = false;
let maxWave = 0;
let picks = 0;
let maxEnemiesAtOnce = 0;
let steps = 0;

for (; steps < maxSteps && w.state !== 'dead'; steps++) {
  if (w.pendingUpgrade) {
    applyUpgrade(w, w.upgradeChoices[0]?.id ?? 'regen');
    picks++;
  }

  let nx = 0;
  let ny = 0;
  let nd = Infinity;
  let alive = 0;
  for (const e of w.enemies.items) {
    if (!e.alive) continue;
    alive++;
    sawEnemy = true;
    const dx = e.pos.x - w.player.pos.x;
    const dy = e.pos.y - w.player.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < nd) {
      nd = d;
      nx = dx;
      ny = dy;
    }
  }
  maxEnemiesAtOnce = Math.max(maxEnemiesAtOnce, alive);

  if (nd < Infinity) {
    const d = Math.hypot(nx, ny) || 1;
    input.aimX = nx / d;
    input.aimY = ny / d;
    input.firing = true;
    if (d < 280) {
      input.thrustX = -nx / d;
      input.thrustY = -ny / d;
      input.throttle = 1;
      input.boost = w.player.atp > 40;
    } else {
      input.thrustX = nx / d;
      input.thrustY = ny / d;
      input.throttle = 0.5;
      input.boost = false;
    }
    input.special = w.player.atp > 60 && d < 200;
  } else {
    input.firing = false;
    input.throttle = 0;
    input.special = false;
    input.boost = false;
  }

  stepWorld(w, input, dt);

  for (const pr of w.projectiles.items) {
    if (!pr.alive) continue;
    if (pr.team === 0) sawToxin = true;
    else sawEnemyProj = true;
  }
  for (const pk of w.pickups.items) if (pk.alive) sawPickup = true;
  maxWave = Math.max(maxWave, w.wave);
}

const ok =
  sawEnemy && sawToxin && sawEnemyProj && sawPickup && maxWave >= 2 && w.kills > 5;

console.log('── cryodrift sim smoke ──');
console.log({
  simSeconds: +(steps * dt).toFixed(1),
  finalState: w.state,
  maxWave,
  kills: w.kills,
  score: w.score,
  bestCombo: w.bestStreak,
  upgradesPicked: picks,
  growth: +w.player.growth.toFixed(1),
  maxEnemiesAtOnce,
  membrane: +w.player.membrane.toFixed(0),
  sawEnemy,
  sawToxin,
  sawEnemyProj,
  sawPickup,
});
console.log(ok ? 'PASS ✅' : 'FAIL ❌');
process.exit(ok ? 0 : 1);
