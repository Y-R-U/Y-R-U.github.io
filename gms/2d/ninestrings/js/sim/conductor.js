// Conductors: the demons actually doing the walking. They never touch the
// ground, they drift AWAY from the player, and each one holds a Choir of
// puppets whose threads carry its affix.
//
// Killing one is the game's 60-90 second payoff (DESIGN 2.3): every thread in
// its Choir snaps at once and the whole crowd goes limp.

import { DT } from './world.js';
import { attachString, snapChoir } from './strings.js';
import { killConductor } from './damage.js';
import { affixBit, AFFIX_NAMES } from './enemy.js';

// `choirColour` is an INDEX into the stage's `palette.choir`, not a packed RGB
// value. That is what lets each act own its own set of Choir colours (Act I
// cold amber, Act II drowned green, and so on) instead of every stage in the
// game sharing one hardcoded six.
const CHOIR_SLOTS = 6;

const HOVER_SPEED = 26;
const FLEE_RANGE = 190;      // it backs off if you get close
const ATTACH_RANGE = 320;    // how far it will reach for a new puppet
const ATTACH_EVERY = 12;     // ticks between recruit attempts

export function spawnConductor(world, opts) {
  const c = world.conductors.alloc();
  if (!c) return null;
  c.id = world.nextId++;
  c.x = opts.x; c.y = opts.y;
  c.choirColour = (opts.index | 0) % CHOIR_SLOTS;
  c.affix = opts.affix || 'speed';
  c.affixBits = affixBit(c.affix) || AFFIX_NAMES.speed || 1;
  c.choirWant = Math.max(2, opts.choir | 0);
  c.choirSize = 0;
  // Scales with stage time so a late Conductor is not a free chest.
  const t = world.time / 60;
  c.maxHp = c.hp = Math.round((70 + t * 34) * (world.player.stats.curse || 1));
  c.hover = world.rng.next() * 6.283;
  c.dying = false;
  c._attach = 0;
  world.events.push({ t: 'say', key: world.conductorsSeen ? null : 'tut_conductor' });
  world.conductorsSeen = (world.conductorsSeen | 0) + 1;
  return c;
}

export function stepConductors(world) {
  const p = world.player;
  const chorus = world.chorus && world.chorus.active;

  world.conductors.each((c) => {
    if (c.dying) return;

    c.hover += DT * 2.2;

    let dx = c.x - p.x, dy = c.y - p.y;
    let d = Math.hypot(dx, dy) || 1;

    if (chorus) {
      // During a Chorus they converge above the player and hold the lattice.
      const tx = p.x, ty = p.y - 150;
      c.vx = (tx - c.x) * 0.6;
      c.vy = (ty - c.y) * 0.6;
    } else if (d < FLEE_RANGE) {
      // Evasive: it wants to be seen and not reached.
      c.vx = (dx / d) * HOVER_SPEED * 1.9;
      c.vy = (dy / d) * HOVER_SPEED * 1.9;
    } else if (d > FLEE_RANGE * 2.6) {
      c.vx = -(dx / d) * HOVER_SPEED;
      c.vy = -(dy / d) * HOVER_SPEED;
    } else {
      // idle drift, perpendicular, so it circles rather than sitting still
      c.vx = (-dy / d) * HOVER_SPEED * 0.8;
      c.vy = (dx / d) * HOVER_SPEED * 0.8;
    }

    c.x += c.vx * DT;
    c.y += c.vy * DT + Math.sin(c.hover) * 6 * DT;

    // Recruit. Not every tick - this is a spatial query and there is no reason
    // for it to run 60 times a second.
    if (--c._attach <= 0) {
      c._attach = ATTACH_EVERY;
      if (c.choirSize < c.choirWant) recruit(world, c);
    }
  });
}

const SCR = [];
function recruit(world, c) {
  const near = world.spatialQuery(c.x, c.y, ATTACH_RANGE, SCR);
  let want = c.choirWant - c.choirSize;
  for (let i = 0; i < near.length && want > 0; i++) {
    const e = near[i];
    if (!e.alive || e.stringId || e.boss || e.dying) continue;
    if (e.def && e.def.strungChance !== undefined &&
        world.rng.next() > e.def.strungChance) continue;
    if (attachString(world, c, e)) want--;
  }
}

/** Called by damage.js routing when a Conductor's hp hits zero. */
export function onConductorKilled(world, c) {
  snapChoir(world, c.id);
}

export function onChorus(world, phase, n) {
  if (phase === 'start') {
    // Everything tightens: every Conductor reaches for a full Choir.
    world.conductors.each((c) => { c.choirWant = Math.round(c.choirWant * 1.6); c._attach = 1; });
  } else {
    world.conductors.each((c) => { c.choirWant = Math.max(2, Math.round(c.choirWant / 1.6)); });
  }
}

export { killConductor };
