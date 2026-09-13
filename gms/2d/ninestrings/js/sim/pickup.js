// Drops and magnetism. Shards are the game's pacing: how fast they come in is
// how fast the level-up screen opens, so the magnet radius is a real stat.

import { DT } from './world.js';

const MERGE_AT = 140;       // above this many loose shards, new ones merge

export function dropFor(world, e) {
  const def = e.def;
  const base = def && def.xp !== undefined ? def.xp : 1;
  // A severed puppet is worth more - that is the whole incentive to cut.
  const value = Math.max(1, Math.round(base * (e.cutBonus || 1)));

  const luck = world.player.stats ? world.player.stats.luck : 1;
  const greed = world.player.stats ? world.player.stats.greed : 1;

  // Rare extras, luck-scaled.
  const roll = world.rng.next();
  if (roll < 0.006 * luck) return spawn(world, e.x, e.y, 'heart', 1);
  if (roll < 0.010 * luck) return spawn(world, e.x, e.y, 'magnet', 1);
  if (roll < 0.013 * luck) return spawn(world, e.x, e.y, 'bomb', 1);
  if (e.elite) spawn(world, e.x + 8, e.y, 'coin', Math.round(5 * greed));

  // At a big horde the field fills with shards faster than they can be walked
  // over. Merging keeps the pool honest without quietly deleting the player's
  // XP: the value is folded into an existing shard.
  if (world.pickups.count > MERGE_AT) {
    let host = null;
    world.pickups.each((q) => {
      if (host || q.kind !== 'shard') return;
      const dx = q.x - e.x, dy = q.y - e.y;
      if (dx * dx + dy * dy < 60 * 60) host = q;
    });
    if (host) { host.value += value; return host; }
  }
  return spawn(world, e.x, e.y, 'shard', value);
}

export function spawn(world, x, y, kind, value) {
  const k = world.pickups.alloc();
  if (!k) return null;
  k.id = world.nextId++;
  k.x = x + (world.rng.next() - 0.5) * 6;
  k.y = y + (world.rng.next() - 0.5) * 6;
  k.kind = kind;
  k.value = value || 1;
  k.pull = 0;
  return k;
}

export function stepPickups(world) {
  const p = world.player;
  const S = p.stats;
  const magnet = (p.magnet || 40) * (S ? S.magnet : 1);
  const m2 = magnet * magnet;
  const grab = 13;

  world.pickups.each((k) => {
    const dx = p.x - k.x, dy = p.y - k.y;
    const d2 = dx * dx + dy * dy;

    if (k.pull > 0 || d2 < m2) {
      // Accelerating pull - a shard that crawls toward you feels dead, one that
      // snaps in feels like a reward.
      k.pull = Math.min(1, k.pull + DT * 2.6);
      const d = Math.sqrt(d2) || 1;
      const sp = 90 + k.pull * 460;
      k.x += (dx / d) * sp * DT;
      k.y += (dy / d) * sp * DT;
    }

    if (d2 < grab * grab) {
      collect(world, k);
      world.pickups.free(k);
    }
  });
}

// Everything on screen takes a large hit. Deliberately damage, not a delete:
// an instant wipe would skip the XP and feel like the game took the kills away.
function screenClear(world) {
  const p = world.player;
  const hits = world.spatialQuery(p.x, p.y, 340, []);
  for (let i = 0; i < hits.length; i++) {
    const e = hits[i];
    if (e.alive && !e.boss) world.hurt(e, 9999, { source: 'bomb' });
  }
}

function collect(world, k) {
  const p = world.player;
  world.events.push({ t: 'pickup', x: k.x, y: k.y, kind: k.kind, value: k.value });

  switch (k.kind) {
    case 'shard':
      world.addXp(k.value);
      break;
    case 'heart':
      world.heal(Math.max(10, Math.round(p.maxHp * 0.25)));
      break;
    case 'coin':
      world.coins += k.value;
      break;
    case 'magnet':
      // vacuum the field
      world.pickups.each((q) => { if (q !== k && q.kind === 'shard') q.pull = 1; });
      break;
    case 'bomb':
      world.events.push({ t: 'shake', amount: 16 });
      screenClear(world);
      break;
    case 'chest':
      world.events.push({ t: 'chest', x: k.x, y: k.y });
      break;
  }
}
