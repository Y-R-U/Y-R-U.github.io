/**
 * Guns. Ruling R-09, and DESIGN §2.6's one sentence:
 *
 *   The assist decides WHEN to pull the trigger. It never decides WHERE the
 *   bullets go.
 *
 * So: no hit-scan, no aim snapping, no soft-lock magnetism, ever. Rounds are
 * real projectiles with a muzzle speed, gravity drop, dispersion, time of flight
 * and a convergence range, and the only thing the assist does is choose a target
 * and decide the nose is pointed close enough to squeeze. Every assist in this
 * game takes that shape: the `Cool Hand` trait makes auto-fire STRICTER.
 *
 * SI throughout. Ranges are world quantities and do not vary with zoom — nothing
 * in this file may read the camera (§4.3.5).
 *
 * Pure: no DOM, no clock, no Math.random.
 */

import { G_SI } from '../data/tables.js';
import { traceHit, applyDamage, bugOf } from './damage.js';

/* ------------------------------------------------------------ constants --- */
/**
 * R-09. `ARCHITECTURE` §4.3.5 wins over DESIGN §2.5 and every gunnery distance
 * rescales by 0.47. The single derivation behind 440 wu: no hostile weapon may
 * outrange the 462 wu the portrait frame shows at `zoomCombat`, and 66 m is
 * squarely inside the 50-100 m at which a Vickers was actually effective.
 *
 * SI is authored; the wu mirrors are derived (D26) and exist only so a reader
 * can check them against the ruling.
 */
export const GUNS = Object.freeze({
  coneHalf: 11 * Math.PI / 180,      // R-09: +-11 deg, and there is NO close-range snap bonus
  rangeEff: 66,                      // m  = 440 wu
  rangeTracer: 105,                  // m  = 700 wu, visual only
  convergence: 40,                   // m  = 267 wu, where the two streams cross
  acquire: 0.08,                     // s  the pilot squeezing; also kills one-frame flickers
  vMuzzle: 420,                      // m/s, plus own forward speed
  dispersion: 0.6 * Math.PI / 180,   // rad, 1 sigma per round
  drop: 0.35 * G_SI,                 // m/s^2 — a token drop, so long shots need elevation
  /**
   * Gun port offsets along the body normal, in metres. The pair is what makes
   * the close-range straddle a real thing in a 2D silhouette: the streams cross
   * at `convergence`, so inside about 8 m they are ~1 m apart on a 1.82 m deep
   * fuselage and the volley stops boring a single hole. DESIGN §2.6 asks for
   * exactly that behaviour; the separation is the number that produces it and it
   * is measured, not asserted — see P5_NOTES §3 and register T11.
   */
  portN: 0.55,
});

export const WU_PER_M = 1 / 0.15;
export const GUN_WU = Object.freeze({
  rangeEff: GUNS.rangeEff * WU_PER_M, rangeTracer: GUNS.rangeTracer * WU_PER_M,
  convergence: GUNS.convergence * WU_PER_M,
});

/** DESIGN §3.1's gun table. `rate` is PER GUN; two guns fire as one synchronised volley. */
export const GUN_TIERS = Object.freeze([
  { id: 't1', name: 'Vickers',            guns: 1, dmg: 4, rate: 7,  range: GUNS.rangeEff, ammo: 500 },
  { id: 't2', name: 'Vickers x2',         guns: 2, dmg: 6, rate: 9,  range: GUNS.rangeEff, ammo: 700 },
  { id: 't3', name: 'Long Vickers x2',    guns: 2, dmg: 6, rate: 9,  range: 90,            ammo: 700 },
  { id: 't4', name: 'Spandau x2',         guns: 2, dmg: 7, rate: 10, range: GUNS.rangeEff, ammo: 800 },
  { id: 't5', name: 'Spandau incendiary', guns: 2, dmg: 7, rate: 10, range: GUNS.rangeEff, ammo: 800, incendiary: 2.6 },
]);
export const GUN_BY_ID = Object.freeze(Object.fromEntries(GUN_TIERS.map(g => [g.id, g])));

/** DESIGN §2.5's target-priority weights, verbatim. Register T12. */
export const PRIORITY = Object.freeze({
  align: 1.20, near: 1.00, threat: 0.90, wounded: 0.60, objective: 1.50,
  hysteresis: 0.40,        // s a lock survives outside the cone. Register T13.
  steal: 1.35,             // ...unless something else scores this much better
});

/* ------------------------------------------------------------- the cone --- */

/** Signed bearing of a point off the nose, in radians. */
export function offNose(f, tx, ty) {
  const dx = tx - f.sx, dy = ty - f.sy;
  const c = Math.cos(f.theta), s = Math.sin(f.theta);
  return Math.atan2(-dx * s + dy * c, dx * c + dy * s);
}

/**
 * DESIGN §2.6's lead pip: two iterations of `t = |target + v_t*t - gun| / V_b`.
 * Writes into `out`. This is the geometry the PLAYER is shown and the geometry
 * the AI steers at — the same function, so a good player and a good AI are
 * solving the same problem, which is the only honest way to tune either.
 */
export function leadPoint(f, tgt, out) {
  const vb = GUNS.vMuzzle + Math.max(0, f.svx * Math.cos(f.theta) + f.svy * Math.sin(f.theta));
  const tf = tgt.flight;
  let dx = tf.sx - f.sx, dy = tf.sy - f.sy;
  let t = Math.hypot(dx, dy) / vb;
  for (let i = 0; i < 2; i++) {
    dx = tf.sx + tf.svx * t - f.sx;
    dy = tf.sy + tf.svy * t - f.sy;
    t = Math.hypot(dx, dy) / vb;
  }
  out.x = tf.sx + tf.svx * t;
  out.y = tf.sy + tf.svy * t + 0.5 * GUNS.drop * t * t;   // aim over the drop
  out.t = t;
  out.range = Math.hypot(tf.sx - f.sx, tf.sy - f.sy);
  return out;
}

/* -------------------------------------------------------- target picking -- */

/**
 * §2.5's scoring, unchanged, with R-09's range. The 0.40 s hysteresis is the
 * reason a player can read anything at all: without it the reticle strobes
 * between two crossing aircraft.
 */
export function pickTarget(shooter, candidates, dt, ctx = null) {
  const g = shooter.gun;
  const f = shooter.flight;
  const bug = bugOf(ctx);
  // The forbidden camera coupling, shipped so C9 can be watched going red. P4's
  // F14 could not fail by construction and said so; this is the missing tripwire.
  const range = bug === 'zoom-range' ? g.tier.range * (ctx.zoom || 1) : g.tier.range;
  const cone = bug === 'no-cone' ? 90 * Math.PI / 180 : GUNS.coneHalf;
  let best = null, bestScore = -1e9, lockStill = null, lockScore = -1e9;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (c === shooter || !c.alive || c.dead || c.side === shooter.side) continue;
    const dx = c.flight.sx - f.sx, dy = c.flight.sy - f.sy;
    const d = Math.hypot(dx, dy);
    if (d > range) continue;
    const ang = Math.abs(offNose(f, c.flight.sx, c.flight.sy));
    if (ang > cone) continue;
    let s = PRIORITY.align * (1 - ang / cone)
          + PRIORITY.near * (1 - d / range)
          + (c.shootingAt === shooter.id ? PRIORITY.threat : 0)
          + PRIORITY.wounded * (1 - c.hp.structure / c.hpMax.structure)
          + (c.objective ? PRIORITY.objective : 0);
    // §2.5's tie-break: lowest absolute HP
    s -= c.hp.structure * 1e-6;
    if (c.id === g.lockId) { lockStill = c; lockScore = s; }
    if (s > bestScore) { bestScore = s; best = c; }
  }

  if (lockStill) {
    g.lockT = 0;
    if (best && best !== lockStill && bestScore > lockScore * PRIORITY.steal) { setLock(g, best); return best; }
    return lockStill;
  }
  if (g.lockId) {
    g.lockT += dt;
    let held = null;
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c.id === g.lockId && c.alive && !c.dead) { held = c; break; }
    }
    const hyst = bug === 'no-hysteresis' ? 0 : PRIORITY.hysteresis;
    if (held && g.lockT < hyst) return null;   // hold the lock, do not fire
    setLock(g, best);
    return best;
  }
  setLock(g, best);
  return best;
}

function setLock(g, t) {
  const id = t ? t.id : '';
  if (id !== g.lockId) { g.lockId = id; g.lockChanges++; g.acquireT = 0; }
  g.lockT = 0;
}

/* --------------------------------------------------------------- firing --- */

export function makeGun(tierId = 't1', opts = {}) {
  const tier = GUN_BY_ID[tierId] || GUN_TIERS[0];
  return {
    tier, ammo: opts.ammo ?? tier.ammo, cool: 0, acquireT: 0,
    lockId: '', lockT: 0, lockChanges: 0,
    /**
     * The trigger discipline. `coneHalf` is how close to the true solution the
     * nose must be before the assist squeezes — NOT how far the bullets may
     * wander. `Cool Hand` sets it to 2 deg: 40% less ammo, higher hit rate, and
     * the expert's upgrade is an assist that does less (§2.6).
     */
    coneHalf: GUNS.coneHalf,
    fireCone: opts.coolHand ? 2 * Math.PI / 180 : (opts.fireCone ?? GUNS.coneHalf),
    coolHand: !!opts.coolHand,
    fired: 0, hits: 0,
  };
}

const LEAD = { x: 0, y: 0, t: 0, range: 0 };

/**
 * Decide whether to fire this tick and, if so, put rounds in the pool. Returns
 * the number of rounds fired.
 *
 * `shooter.wantsFire` lets the AI or a story beat hold fire (§5.3's Grelle
 * refuses to shoot first); it never lets anything aim.
 */
export function updateGun(world, shooter, targets, dt) {
  const g = shooter.gun;
  if (!g) return 0;
  g.cool -= dt;
  const ctx = world.ctx;
  const bug = bugOf(ctx);
  const tgt = pickTarget(shooter, targets, dt, ctx);
  shooter.target = tgt;
  shooter.shootingAt = '';
  if (!tgt || shooter.dead || shooter.wantsFire === false) { g.acquireT = 0; return 0; }

  leadPoint(shooter.flight, tgt, LEAD);
  /**
   * §5.2's lead-solution error: what this pilot BELIEVES the solution is. It
   * moves the moment he squeezes, never where the round goes — the round still
   * leaves along the nose, with drop and dispersion, exactly as the player's
   * does. `shooter.aimErrLead` is set by the AI; the player's is zero, because
   * the player IS the lead solution.
   */
  let lx = LEAD.x, ly = LEAD.y;
  const le = shooter.aimErrLead || 0, ae = shooter.aimErrAng || 0;
  if (le || ae) {
    const f = shooter.flight, tf = tgt.flight;
    const tv = Math.max(1e-6, Math.hypot(tf.svx, tf.svy));
    lx += (tf.svx / tv) * le; ly += (tf.svy / tv) * le;
    if (ae) {
      const dx = lx - f.sx, dy = ly - f.sy;
      const c = Math.cos(ae), s = Math.sin(ae);
      lx = f.sx + dx * c - dy * s; ly = f.sy + dx * s + dy * c;
    }
  }
  const err = Math.abs(offNose(shooter.flight, lx, ly));
  const fc = bug === 'no-cone' ? 90 * Math.PI / 180 : g.fireCone;
  if (err > fc) { g.acquireT = 0; return 0; }

  g.acquireT += dt;
  if (g.acquireT < GUNS.acquire) return 0;
  shooter.shootingAt = tgt.id;
  if (g.ammo <= 0 || g.cool > 0) return 0;

  g.cool = 1 / g.tier.rate;
  const n = Math.min(g.tier.guns, g.ammo);
  for (let i = 0; i < n; i++) {
    const side = g.tier.guns === 1 || bug === 'no-convergence' ? 0 : (i === 0 ? -1 : +1);
    spawnRound(world, shooter, side, bug);
  }
  g.ammo -= n;
  g.fired += n;
  shooter.shotsFired += n;
  if (world.ctx && world.ctx.bus) { FEV.id = shooter.id; FEV.n = n; world.ctx.bus.emit('gun:fire', FEV); }
  return n;
}
const FEV = { id: '', n: 0 };

/**
 * One round. It leaves the gun port, not the centre of the aeroplane, and it is
 * angled to cross the boresight at `convergence`. Dispersion is applied to the
 * round, which is the ONLY randomness in gunnery — the shooter's skill changes
 * where the nose is, never where a round goes once it has left.
 */
function spawnRound(world, shooter, portSide, bug = '') {
  const b = world.takeBullet();
  if (!b) return null;
  const f = shooter.flight;
  if (bug === 'hitscan' && shooter.target) {
    // The thing this project promises never to build, built once so the promise
    // can be checked: the round arrives, wherever the target is.
    const t = shooter.target;
    b.x = t.flight.sx; b.y = t.flight.sy - 0.2;
    b.vx = 1e-3; b.vy = 1e-3; b.t = 0; b.life = 0.02;
    b.dmg = shooter.gun.tier.dmg; b.inc = shooter.gun.tier.incendiary || 1;
    b.side = shooter.side; b.owner = shooter.id; b.alive = true;
    return b;
  }
  const s = f.roll >= 0 ? 1 : -1;
  const cf = Math.cos(f.theta), sf = Math.sin(f.theta);
  const pxn = -sf * s, pyn = cf * s;              // body normal, positive = belly
  const off = portSide * GUNS.portN;
  // Converge: a port `off` metres off the axis is angled by off/convergence
  // TOWARD the axis. Which way that is in world angle depends on which side the
  // canopy is on — the body normal lies at `theta + s*pi/2` — so the sign must
  // carry `s`. Without it the two streams DIVERGE on every left-flying aeroplane,
  // which is every hostile in the game, and the bug is invisible in any test
  // where only the player shoots.
  const conv = -off / GUNS.convergence * s;
  const disp = shooter.rng ? shooter.rng.gauss(0, GUNS.dispersion) : 0;
  const th = f.theta + conv + disp;
  const vb = GUNS.vMuzzle + Math.max(0, f.svx * cf + f.svy * sf);
  b.x = f.sx + cf * 2.6 + pxn * off;
  b.y = f.sy + sf * 2.6 + pyn * off;
  b.vx = Math.cos(th) * vb;
  b.vy = Math.sin(th) * vb;
  b.t = 0;
  b.life = g_life(shooter.gun);
  b.dmg = shooter.gun.tier.dmg;
  b.inc = shooter.gun.tier.incendiary || 1;
  b.side = shooter.side;
  b.owner = shooter.id;
  b.alive = true;
  return b;
}
const g_life = (g) => GUNS.rangeTracer / GUNS.vMuzzle * (g.tier.range / GUNS.rangeEff);

/* ------------------------------------------------------------- ballistics -- */

export const BULLET_SUBSTEPS = 3;

/**
 * Advance every live round and resolve hits. A round covers 7 m in a 1/60 s tick
 * and the target is 3.25 m tall, so the step is traced as a SEGMENT against the
 * colliders (damage.js) rather than tested as a point — a point test at tick
 * resolution silently loses most of the hits and would have made every number in
 * the duel matrix a fiction.
 */
export function updateBullets(world, dt) {
  const bullets = world.bullets, acs = world.aircraft;
  const h = dt / BULLET_SUBSTEPS;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (!b.alive) continue;
    for (let k = 0; k < BULLET_SUBSTEPS && b.alive; k++) {
      const x0 = b.x, y0 = b.y;
      b.vy += GUNS.drop * h;
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.t += h;
      if (b.t > b.life || b.y > 0) { b.alive = false; break; }
      let bestS = 2, victim = null, comp = '';
      for (let j = 0; j < acs.length; j++) {
        const a = acs[j];
        if (!a.alive || a.id === b.owner || a.side === b.side) continue;
        const hit = traceHit(a, x0, y0, b.x, b.y);
        if (hit && hit.s < bestS) { bestS = hit.s; victim = a; comp = hit.comp; }
      }
      if (victim) {
        b.alive = false;
        const inc = (comp === 'fuel' || victim.gasbag) ? b.inc : 1;
        applyDamage(victim, comp, b.dmg * inc, world.ctx, b.owner);
        const sh = world.byId(b.owner);
        // the shooter can be gone: a round outlives the aeroplane that fired it
        if (sh) { if (sh.gun) sh.gun.hits++; sh.hits++; }
      }
    }
  }
}
