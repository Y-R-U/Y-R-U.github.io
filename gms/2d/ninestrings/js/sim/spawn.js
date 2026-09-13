// The spawn director. Reads stage.timeline and puts bodies on a ring just
// outside what the player can see.
//
// The hard rule is `stage.maxAlive`. The whole design - 400 enemies at 60fps on
// a 2021 phone - is built on that number, so when the director is at cap it
// converts the bodies it wanted into strength it is allowed to have: elites,
// scaled hp, higher-tier defs. Difficulty keeps rising, the frame budget does not.
// LANE B-core owns this file.

import { spawnEnemy } from './enemy.js';
import { capRoom } from './world.js';
import * as Conductors from './conductor.js';

const DT = 1 / 60;

// D7: 420 world units of width are visible on every device. Height varies with
// aspect (a 20:9 phone sees ~930), so the spawn ellipse is generously tall -
// spawning inside the visible area is worse than spawning slightly too far out.
const RING_X = 260;
const RING_Y = 520;
const RING_JITTER = 0.14;

const MAX_ELITE_FRACTION = 0.12;
const MAX_BOOSTS = 3;

// Scratch: spawn bursts run inside the frame loop, so the point helpers write
// into one shared pair rather than handing out a fresh object per body.
const SP = { x: 0, y: 0 };

// How strongly the ring leans into the player's direction of travel, and how
// much of the ring is reserved for that lean.
const LEAD_BIAS = 0.58;      // fraction of spawns placed ahead of the player
const LEAD_ARC = 1.15;       // +/- radians around the heading counted as "ahead"

/**
 * Spawn ring, biased toward where the player is GOING.
 *
 * A uniform ring makes running away a dominant strategy: the player outruns
 * everything (90 u/s against a 26 u/s shambler), never fights, and still clears
 * the stage on the survival timer. The first balance run did exactly that -
 * 480 seconds, 418 swings, zero kills, victory.
 *
 * Leaning the ring into the heading means fleeing runs you INTO the horde,
 * which is both the correct incentive and the honest fiction: it is a town full
 * of them, not a pursuit.
 */
function ringInto(world, t, spread, out) {
  const p = world.player;
  let a = t * Math.PI * 2;

  const vl = Math.hypot(p.vx, p.vy);
  if (vl > 12 && world.rng.next() < LEAD_BIAS) {
    const heading = Math.atan2(p.vy, p.vx);
    a = heading + (world.rng.next() * 2 - 1) * LEAD_ARC;
  }

  const j = 1 + world.rng.next() * RING_JITTER;
  const s = spread || 1;
  // Push the ring centre forward a little too, so the lead scales with speed
  // rather than being a fixed ambush distance.
  const lead = Math.min(1, vl / 110) * 70;
  const hx = vl > 1 ? p.vx / vl : 0, hy = vl > 1 ? p.vy / vl : 0;
  out.x = p.x + hx * lead + Math.cos(a) * RING_X * j * s;
  out.y = p.y + hy * lead + Math.sin(a) * RING_Y * j * s;
  return out;
}

function edgeInto(world, side, u, out) {
  const p = world.player;
  const uu = Math.min(1, Math.max(0, u));
  if (side === 0)      { out.x = p.x + (uu - 0.5) * RING_X * 2.2; out.y = p.y - RING_Y; }
  else if (side === 1) { out.x = p.x + RING_X; out.y = p.y + (uu - 0.5) * RING_Y * 2; }
  else if (side === 2) { out.x = p.x + (uu - 0.5) * RING_X * 2.2; out.y = p.y + RING_Y; }
  else                 { out.x = p.x - RING_X; out.y = p.y + (uu - 0.5) * RING_Y * 2; }
  return out;
}

export function ringPoint(world, t, spread) {
  return ringInto(world, t, spread, { x: 0, y: 0 });
}

export function makeDirector(world) {
  const state = [];        // one cursor per timeline event
  let built = -1;
  let condNext = Infinity;
  let condCount = 0;

  function build() {
    state.length = 0;
    const tl = (world.stage && world.stage.timeline) || [];
    for (let i = 0; i < tl.length; i++) {
      const ev = tl[i];
      state.push({ ev, next: ev.at || 0, fired: 0 });
    }
    const c = world.stage && world.stage.conductor;
    condNext = c ? (c.first === undefined ? 30 : c.first) : Infinity;
    condCount = 0;
    built = world.stage;
  }

  // Anything this far from the player is not in the game any more.
  const RECYCLE_R2 = 1100 * 1100;

  /**
   * Move the stragglers round in front instead of letting them rot.
   *
   * Without this the horde is self-defeating: the player outruns the slow tier
   * (a 26 u/s shambler against 90 u/s), those bodies never catch up, and yet
   * they still occupy `maxAlive`, so the cap is spent on a tail of enemies
   * nobody can see and no new ones can spawn near the fight. The first balance
   * run cleared the whole stage with ZERO kills because of exactly this.
   *
   * Recycling keeps the pressure where the player is, and is invisible: they
   * were off screen going and they are off screen arriving.
   */
  function recycle() {
    const p = world.player;
    let moved = 0;
    world.enemies.each((e) => {
      if (!e.alive || e.boss || e.elite || moved >= 6) return;   // never teleport a boss or an elite
      const dx = e.x - p.x, dy = e.y - p.y;
      if (dx * dx + dy * dy < RECYCLE_R2) return;
      ringInto(world, world.rng.next(), 1, SP);
      e.x = SP.x; e.y = SP.y;
      e.vx = e.vy = 0;
      moved++;                 // a budget, so a huge scattered field costs little
    });
  }

  function step() {
    if (built !== world.stage) build();
    if (world.over) return;
    const t = world.time;

    if ((world.tick & 15) === 0) recycle();

    for (let i = 0; i < state.length; i++) {
      const st = state[i];
      const ev = st.ev;
      const until = ev.until === undefined ? Infinity : ev.until;
      if (t < st.next || t >= until) continue;
      const every = ev.every || 1e9;
      st.next = every >= 1e9 ? Infinity : st.next + every;
      st.fired++;
      // Progress through the window drives the scale ramp: a wave that opens a
      // stage and one that closes it are the same line of data.
      const span = (until === Infinity ? (ev.at || 0) + 60 : until) - (ev.at || 0);
      const prog = span > 0 ? Math.min(1, Math.max(0, (t - (ev.at || 0)) / span)) : 1;
      emit(ev, prog);
    }

    const c = world.stage && world.stage.conductor;
    if (c && t >= condNext) {
      condNext = t + (c.every || 75);
      condCount++;
      spawnConductor(c);
    }
  }

  function spawnConductor(c) {
    if (typeof Conductors.spawnConductor !== 'function') return;
    const p = ringInto(world, world.rng.next(), 0.8, SP);
    const affixes = c.affixes && c.affixes.length ? c.affixes : ['speed'];
    Conductors.spawnConductor(world, {
      x: p.x, y: p.y,
      affix: affixes[(condCount - 1) % affixes.length],
      choir: c.choir || 8,
      index: condCount,
    });
  }

  // ---- patterns ------------------------------------------------------------
  // Every stage opens gently and grows into its own ceiling.
  //
  // Without this, the later stages are unplayable rather than hard: Stage 11
  // opens with eight fast wraiths every three seconds, and a level-1 character
  // with one weapon died at NINE SECONDS having killed nothing. A stage's
  // identity is its ceiling, not its first ten seconds, so the warmup scales
  // burst sizes without touching the shape of the timeline the stage author
  // wrote. Stage 1 is already gentle enough that this barely moves it.
  const WARMUP = 90;          // seconds to reach full spawn pressure
  const WARMUP_FLOOR = 0.22;  // fraction of a burst that lands at t=0
  function warmup(t) {
    if (t >= WARMUP) return 1;
    return WARMUP_FLOOR + (1 - WARMUP_FLOOR) * (t / WARMUP);
  }

  function emit(ev, prog) {
    const raw = Math.max(1, ev.n || 1);
    const want = Math.max(1, Math.round(raw * warmup(world.time)));
    const room = Math.max(0, capRoom(world));

    const hpRamp   = ev.scale && ev.scale.hp    ? 1 + (ev.scale.hp - 1) * prog    : 1;
    const spdRamp  = ev.scale && ev.scale.speed ? 1 + (ev.scale.speed - 1) * prog : 1;

    if (room <= 0) { upgradeInstead(want, hpRamp); return; }

    let n = want;
    let scale = { hp: hpRamp, speed: spdRamp };
    if (want > room) {
      // Not enough room for the bodies: spend the surplus on the ones we can
      // afford, and elite the remainder away.
      n = room;
      const surplus = (want - room) / room;
      scale.hp = hpRamp * (1 + Math.min(2.5, surplus * 0.6));
      scale.elite = surplus > 2;
    }

    const pat = ev.pattern || 'ring';
    const base = world.rng.next();
    for (let i = 0; i < n; i++) {
      const defId = pickDef(ev.enemy);
      let x, y;
      if (pat === 'ring') {
        ringInto(world, base + i / n, 1, SP);
        x = SP.x; y = SP.y;
      } else if (pat === 'edge') {
        const side = Math.floor(base * 4) % 4;
        edgeInto(world, side, (i + 0.5) / n + world.rng.range(-0.05, 0.05), SP);
        x = SP.x; y = SP.y;
      } else if (pat === 'wall') {
        const a = base * Math.PI * 2;
        ringInto(world, base, 1, SP);
        const px = -Math.sin(a), py = Math.cos(a);
        const off = (i - (n - 1) / 2) * 16;
        x = SP.x + px * off; y = SP.y + py * off;
      } else if (pat === 'pack') {
        ringInto(world, base, 1, SP);
        x = SP.x + world.rng.range(-34, 34);
        y = SP.y + world.rng.range(-34, 34);
      } else {                       // rain - down the top edge
        edgeInto(world, 0, (i + 0.5) / n + world.rng.range(-0.08, 0.08), SP);
        x = SP.x; y = SP.y - world.rng.range(0, 60);
      }
      spawnEnemy(world, defId, x, y, scale);
    }
  }

  // At the cap the pressure has to go somewhere that is not a draw call. Most
  // of it becomes hp on bodies that already exist; a minority becomes elites,
  // capped as a FRACTION of the horde, because a screen of nothing but elites
  // reads as a wall rather than as a horde and there is nothing left to promote.
  function upgradeInstead(want, hpRamp) {
    const alive = world.enemies.count;
    if (alive <= 0) return;
    world.upgradedSpawns += want;

    let eliteRoom = Math.floor(alive * MAX_ELITE_FRACTION) - world.eliteAlive;
    const quota = Math.max(1, Math.min(8, Math.ceil(want * 0.3)));
    const boost = 1 + Math.min(0.5, want * 0.02) * hpRamp;
    let done = 0;

    world.enemies.each((e) => {
      if (done >= quota || e.dying || e.boss) return;
      if (!world.rng.chance(0.12)) return;
      if (!e.elite && eliteRoom > 0 && world.rng.chance(0.3)) {
        e.elite = true;
        e.maxHp = Math.round(e.maxHp * 5 * boost);
        e.hp = e.maxHp;
        e.dmg *= 1.6;
        e.radius *= 1.5;
        e.mass = (e.mass || 1) * 4;
        world.eliteAlive++;
        eliteRoom--;
      } else {
        // Bounded: an enemy scaled without limit is not difficulty, it is a
        // body the player's build can never catch up with.
        if (e.boosts >= MAX_BOOSTS) return;
        e.boosts++;
        const add = Math.round(e.maxHp * (boost - 1) + e.maxHp * 0.25);
        e.maxHp += add;
        e.hp += add;
        e.dmg *= 1.08;
      }
      done++;
    });
  }

  function pickDef(e) {
    if (Array.isArray(e)) return e.length ? e[world.rng.int(e.length)] : null;
    return e;
  }

  return { step, get conductorsSpawned() { return condCount; } };
}
