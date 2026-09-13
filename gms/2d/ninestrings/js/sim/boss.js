// The Choirmasters. Each is a normal enemy with `phases` in its aiParams: a
// descending list of hp fractions, each with its own kit.
//
// The data (js/data/enemies.js) is the authority on what a phase does; this file
// is the interpreter. Adding a phase ability means adding a case here ONCE and
// then it is available to every boss as data.

import { DT } from './world.js';
import { spawnEnemy } from './enemy.js';
import { applyDamage, damagePlayer } from './damage.js';
import { attachString } from './strings.js';

const SCR = [];

export function spawnBoss(world, defId, x, y) {
  const b = spawnEnemy(world, defId, x, y, 1);
  if (!b) return null;
  b.boss = true;
  b.elite = true;
  world.bossId = b.id;
  world.boss = b;
  b.phaseIx = -1;
  b.timers = { resing: 0, shout: 0, spawn: 0, restring: 0, weave: 0 };
  enterPhase(world, b, 0);
  return b;
}

function phasesOf(b) {
  return (b.def && b.def.aiParams && b.def.aiParams.phases) || null;
}

function enterPhase(world, b, ix) {
  const ph = phasesOf(b);
  if (!ph || ix === b.phaseIx || ix >= ph.length) return;
  b.phaseIx = ix;
  const p = ph[ix];
  if (p.speed) b.speed = p.speed;
  if (p.move) b.aiKind = p.move;
  for (const k in b.timers) b.timers[k] = 0;

  world.events.push({ t: 'boss', phase: ix + 1, id: b.id, name: p.name || null });
  world.events.push({ t: 'shake', amount: 20 });

  // "The last one has no puppets in it at all" - DESIGN section 7. A phase may
  // declare it clears the field, which is a statement, not an optimisation.
  if (p.clearField) {
    world.enemies.each((e) => { if (!e.boss && e.alive) applyDamage(world, e, 1e9, { quiet: true }); });
  }
  if (p.summonChoir) summonChoir(world, b, p.summonChoir);
}

export function stepBoss(world) {
  const b = world.boss;
  if (!b || !b.alive || b.dying) { if (b && !b.alive) world.boss = null; return; }

  const ph = phasesOf(b);
  if (!ph) return;

  // Phase transitions are driven by hp fraction, descending.
  const frac = b.hp / (b.maxHp || 1);
  for (let i = ph.length - 1; i >= 0; i--) {
    if (frac <= ph[i].at) { if (i > b.phaseIx) enterPhase(world, b, i); break; }
  }

  const p = ph[b.phaseIx] || ph[0];
  const T = b.timers;

  // -- resing: stands its own dead back up. Hollowth's signature.
  if (p.resing) {
    T.resing += DT;
    if (T.resing >= p.resing.every) {
      T.resing = 0;
      for (let i = 0; i < (p.resing.n | 0); i++) {
        const a = world.rng.next() * 6.283, d = 40 + world.rng.next() * 90;
        spawnEnemy(world, p.resing.of, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 1);
      }
      world.events.push({ t: 'say', key: 'boss_resing' });
    }
  }

  // -- spawn: plain adds
  if (p.spawn) {
    T.spawn += DT;
    if (T.spawn >= p.spawn.every) {
      T.spawn = 0;
      for (let i = 0; i < (p.spawn.n | 0); i++) {
        const a = world.rng.next() * 6.283, d = 60 + world.rng.next() * 120;
        spawnEnemy(world, p.spawn.of, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 1);
      }
    }
  }

  // -- shout: a radial slam centred on the boss
  if (p.shout) {
    T.shout += DT;
    if (T.shout >= p.shout.every) {
      T.shout = 0;
      const pl = world.player;
      const dx = pl.x - b.x, dy = pl.y - b.y;
      const d = Math.hypot(dx, dy);
      world.events.push({ t: 'shout', x: b.x, y: b.y, r: p.shout.radius, id: b.id });
      world.events.push({ t: 'shake', amount: 16 });
      if (d < p.shout.radius) {
        damagePlayer(world, p.shout.dmg, b.x, b.y);
        const k = (p.shout.knock || 200) / (d || 1);
        pl.x += dx * k * DT; pl.y += dy * k * DT;
      }
    }
  }

  // -- restring: puts threads BACK on what you have cut. Vellish's signature,
  //    and the single nastiest mechanic in the game.
  if (p.restring) {
    T.restring += DT;
    if (T.restring >= p.restring.every) {
      T.restring = 0;
      let want = p.restring.n | 0;
      const near = world.spatialQuery(b.x, b.y, p.restring.radius || 300, SCR);
      let host = null;
      world.conductors.each((c) => { if (!host && c.alive && !c.dying) host = c; });
      for (let i = 0; i < near.length && want > 0; i++) {
        const e = near[i];
        if (!e.alive || e.stringId || e.boss) continue;
        if (host && attachString(world, host, e)) { e.limpUntil = 0; want--; }
      }
      if (want < (p.restring.n | 0)) world.events.push({ t: 'say', key: 'boss_restring' });
    }
  }

  // -- weave: walls of thread that damage on contact
  if (p.weave) {
    T.weave += DT;
    if (T.weave >= p.weave.every) {
      T.weave = 0;
      const n = p.weave.walls | 0;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 6.283 + world.time * 0.4;
        const h = world.hazards.alloc();
        if (!h) break;
        h.id = world.nextId++;
        h.x = b.x + Math.cos(a) * 120;
        h.y = b.y + Math.sin(a) * 120;
        h.r = 42;
        h.damage = p.weave.dmg || 20;
        h.tickRate = 0.5;
        h.acc = 0;
        h.life = 4.5;
        h.kind = 'weave';
        h.hostile = true;
        h.ownerWeapon = null;
        h.colour = [0.35, 0.9, 0.8];
        h.knock = 0;
      }
    }
  }

  // -- enrage
  const ap = b.def.aiParams;
  if (ap && ap.enrageAt && world.time > ap.enrageAt && !b.enraged) {
    b.enraged = true;
    b.speed *= ap.enrageSpeed || 1.3;
    world.events.push({ t: 'boss', phase: 99, id: b.id, name: 'enrage' });
  }
}

function summonChoir(world, b, n) {
  let host = null;
  world.conductors.each((c) => { if (!host && c.alive && !c.dying) host = c; });
  if (!host) return;
  const near = world.spatialQuery(b.x, b.y, 400, SCR);
  let want = n | 0;
  for (let i = 0; i < near.length && want > 0; i++) {
    const e = near[i];
    if (e.alive && !e.stringId && !e.boss && attachString(world, host, e)) want--;
  }
}
