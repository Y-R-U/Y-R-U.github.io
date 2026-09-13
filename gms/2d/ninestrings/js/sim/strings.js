// The threads. This is the game's identity: every strung corpse is held up by a
// visible curve running back to its Conductor, and a damaging shape that crosses
// that CURVE severs it — independently of whether it hit the body.
//
// `stringPoints()` is pure and is used by BOTH the renderer and the sever test
// (DECISIONS D10). If the thread you can see is not the thread you can cut, the
// core mechanic is a lie, so there is exactly one function that knows its shape.

import { DT } from './world.js';
import { clearAffixes, applyAffix } from './enemy.js';

export const MAX_POINTS = 12;
export const CUT_LIMP_TICKS = 84;      // 1.4s of collapse
export const CUT_XP_BONUS = 2.2;       // a severed puppet is worth cutting for
const NAPE = 9;                        // the thread leaves the body above the head
const REACH = 46;                      // how far from a body its thread is cuttable
const FREED_LIFE = 6.5;

// Scratch, module-level: the sever test runs hundreds of times a frame and must
// not allocate.
const PTS = new Float32Array(MAX_POINTS * 2);
const QUERY = [];

// A string holds direct refs to its endpoints. Both are only valid while the id
// still matches - the pools hand the same object out again after a free.
const enemyOf = (s) => (s.e && s.e.alive && s.e.id === s.enemyId ? s.e : null);
const condOf  = (s) => (s.c && s.c.alive && s.c.id === s.conductorId ? s.c : null);

export function attachString(world, c, e) {
  if (!c || !e || !e.alive || e.stringId) return null;
  const s = world.strings.alloc();
  if (!s) return null;
  s.id = world.nextId++;
  s.conductorId = c.id;
  s.enemyId = e.id;
  // Direct references, validated by id on every read. Pools reuse objects, so a
  // bare reference can silently point at a DIFFERENT entity later; the id check
  // is what makes this safe. Scanning the pools instead was the first version
  // and it was 160k comparisons a frame at full horde.
  s.e = e; s.c = c;
  s.colour = c.choirColour;
  s.slack = 0.22 + world.rng.next() * 0.2;
  s.taut = 0;
  s.cut = false;
  s.phase = world.rng.next() * 6.283;
  e.stringId = s.id;
  e.str = s;
  e.choir = c.id;
  if (c.affixBits) applyAffix(world, e, c.affixBits);
  c.choirSize++;
  return s;
}

/**
 * The curve, written into `out` as N*2 floats. Pure: same inputs, same points.
 * A catenary sag plus a slow lateral sway, tightening to a straight line as the
 * puppet is pulled (`taut`).
 */
export function stringPoints(s, world, out) {
  const e = enemyOf(s), c = condOf(s);
  if (!e || !c) return 0;

  const x0 = e.x, y0 = e.y - NAPE;
  const x1 = c.x, y1 = c.y;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  // perpendicular, for sag and sway
  const px = -dy / len, py = dx / len;
  const sag = s.slack * (1 - s.taut) * Math.min(len * 0.28, 42);
  const sway = Math.sin(world.time * 1.7 + s.phase) * 5 * (1 - s.taut);

  const n = MAX_POINTS;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    // a parabola is a close enough catenary and far cheaper
    const bow = (sag + sway) * (4 * t * (1 - t));
    out[i * 2]     = x0 + dx * t + px * bow;
    out[i * 2 + 1] = y0 + dy * t + py * bow + Math.sin(t * 3.1 + s.phase) * 1.2;
  }
  return n;
}

/** Distance from point (px,py) to segment (ax,ay)-(bx,by), squared. */
function segDistSq(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const vv = vx * vx + vy * vy;
  let t = vv > 0 ? (wx * vx + wy * vy) / vv : 0;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = ax + vx * t - px, cy = ay + vy * t - py;
  return cx * cx + cy * cy;
}

/** Does the swept segment (x0,y0)-(x1,y1) with radius r cross this thread? */
export function segmentHitsString(world, s, x0, y0, x1, y1, r) {
  const n = stringPoints(s, world, PTS);
  if (n < 2) return false;
  const rr = r * r;
  // Only the portion near the BODY is cuttable. The thread runs off toward a
  // Conductor that may be far away; letting a stray shot sever it from 300
  // units up would make cutting accidental rather than aimed.
  const reach = REACH;
  let travelled = 0;
  for (let i = 0; i < n - 1; i++) {
    const ax = PTS[i * 2], ay = PTS[i * 2 + 1];
    const bx = PTS[i * 2 + 2], by = PTS[i * 2 + 3];
    travelled += Math.hypot(bx - ax, by - ay);
    if (travelled > reach) break;
    // segment-to-segment: sample both endpoints of each against the other.
    if (segDistSq(ax, ay, x0, y0, x1, y1) <= rr) return true;
    if (segDistSq(bx, by, x0, y0, x1, y1) <= rr) return true;
    if (segDistSq(x0, y0, ax, ay, bx, by) <= rr) return true;
    if (segDistSq(x1, y1, ax, ay, bx, by) <= rr) return true;
  }
  return false;
}

/**
 * The entry point every cutting weapon uses. Sweeps a shape across the field and
 * severs whatever threads it crosses.
 *
 * Cheap because it goes through the enemy hash rather than over every string:
 * a thread is only cuttable near its own body, so the bodies near the shape are
 * exactly the candidate set.
 */
export function severSweep(world, x0, y0, x1, y1, radius, opts) {
  const s = world.player.stats;
  const r = radius * (s ? s.sever : 1);
  const mx = (x0 + x1) * 0.5, my = (y0 + y1) * 0.5;
  const span = Math.hypot(x1 - x0, y1 - y0) * 0.5 + r + REACH;
  const near = world.spatialQuery(mx, my, span, QUERY);
  let cut = 0;
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    if (!e.alive || !e.stringId || !e.str) continue;
    const str = e.str;
    if (!str.alive || str.cut || str.id !== e.stringId) continue;
    if (segmentHitsString(world, str, x0, y0, x1, y1, r)) {
      severString(world, str, e.x, e.y - NAPE);
      cut++;
      if (opts && opts.max && cut >= opts.max) break;
    }
  }
  return cut;
}

export function severString(world, s, x, y) {
  if (!s || !s.alive || s.cut) return;
  s.cut = true;
  const e = enemyOf(s), c = condOf(s);

  world.cuts++;
  world.events.push({ t: 'cut', x: x !== undefined ? x : (e ? e.x : 0),
                      y: y !== undefined ? y : (e ? e.y : 0),
                      stringId: s.id, colour: s.colour,
                      conductorId: s.conductorId });

  if (e) {
    e.stringId = 0;
    e.str = null;
    e.choir = 0;
    clearAffixes(e);                       // the Choir's buff was the string's
    e.limpUntil = world.tick + CUT_LIMP_TICKS;
    e.cutBonus = CUT_XP_BONUS;
    e.vx = e.vy = 0;
    // A cut puppet occasionally stands back up on your side. Luck-scaled, so
    // the Coward's Charm build has something to do.
    const luck = world.player.stats ? world.player.stats.luck : 1;
    if (world.freedChance > 0 && world.rng.next() < world.freedChance * luck) freeAlly(world, e);
  }
  if (c && c.choirSize > 0) c.choirSize--;
  world.strings.free(s);
}

/** The enemy died normally - drop its thread without paying the cut bonus. */
export function onEnemyDeath(world, e) {
  const s = e.str;
  e.stringId = 0;
  e.str = null;
  if (!s || !s.alive) return;
  const c = condOf(s);
  if (c && c.choirSize > 0) c.choirSize--;
  world.strings.free(s);
}

/** Every thread in a Choir snaps at once. The game's big moment. */
export function snapChoir(world, conductorId) {
  let n = 0;
  world.strings.each((s) => {
    if (s.conductorId === conductorId && !s.cut) { severString(world, s); n++; }
  });
  return n;
}

function freeAlly(world, e) {
  const a = world.allies.alloc();
  if (!a) return;
  a.id = world.nextId++;
  a.x = e.x; a.y = e.y;
  a.hp = 1;
  a.damage = 6 + world.time * 0.35;
  a.life = world.alliesEternal ? 1e9 : FREED_LIFE;
  a.def = e.def;
  a.cd = 0;
}

// ---------------------------------------------------------------------------

export function stepStrings(world) {
  // Tension: a puppet lunging pulls its thread taut, which is the tell that it
  // is about to be dangerous.
  world.strings.each((s) => {
    const e = enemyOf(s);
    if (!e || !e.alive) { onEnemyDeathById(world, s); return; }
    const want = Math.min(1, Math.hypot(e.vx, e.vy) / 90);
    s.taut += (want - s.taut) * 0.12;
  });
}

function onEnemyDeathById(world, s) {
  const c = condOf(s);
  if (c && c.choirSize > 0) c.choirSize--;
  world.strings.free(s);
}

export function stepAllies(world) {
  const SCR = QUERY;
  world.allies.each((a) => {
    a.life -= DT;
    if (a.life <= 0) { world.allies.free(a); return; }

    // Freed puppets hunt the nearest strung enemy - they go for their old choir
    // first, which reads as the strings turning on their owner.
    let best = null, bd = 1e9;
    const near = world.spatialQuery(a.x, a.y, 150, SCR);
    for (let i = 0; i < near.length; i++) {
      const e = near[i];
      if (!e.alive) continue;
      const d = (e.x - a.x) ** 2 + (e.y - a.y) ** 2;
      const bias = e.stringId ? 0.6 : 1;
      if (d * bias < bd) { bd = d * bias; best = e; }
    }
    if (best) {
      const dx = best.x - a.x, dy = best.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      a.vx = (dx / d) * 108; a.vy = (dy / d) * 108;
      a.x += a.vx * DT; a.y += a.vy * DT;
      a.cd -= DT;
      if (d < 14 && a.cd <= 0) {
        a.cd = 0.55;
        world._allyHit(world, best, a.damage);
      }
    } else {
      // drift toward the player so they do not wander off screen
      const p = world.player;
      const dx = p.x - a.x, dy = p.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 40) { a.x += (dx / d) * 70 * DT; a.y += (dy / d) * 70 * DT; }
    }
  });
}

// ---- lookups --------------------------------------------------------------
// O(1). The reference is only trusted when its id still matches, which is what
// makes it safe against pool slot reuse.

export function findEnemy(world, id) {
  return null;   // kept for API compatibility; strings use s.e directly
}
export function findConductor(world, id) {
  return null;
}
export function findString(world, id) {
  return null;
}
