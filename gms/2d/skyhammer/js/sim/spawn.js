// Turns level.spawns / level.waves into ents. CONTRACTS §12.

import { ENEMIES } from '../data/enemies.js';
import { makeAi } from './ai.js';

const PAD_W = 170, PAD_H = 80;      // half-extents: a 340x160 green box (CONTRACTS §9)

function flightCfg(row) {
  const cruise = row.cruise || 400;
  return { cruise, stall: cruise * 0.5, vmax: cruise * 1.7, turnRate: row.turnRate || 2 };
}

export function makeEnt(world, rowId, x, y, opts = {}) {
  if (rowId === 'pad') {
    const deckY = (typeof y === 'number') ? y : world.terrain.heightAt(x);
    return {
      id: world.nextId(), kind: 'pad', def: { name: 'Landing Pad' },
      x, y: deckY + PAD_H, deckY, padId: opts.padId || 'pad',
      vx: 0, vy: 0, ang: 0, hp: 1, hpMax: 1, team: 2,
      w: PAD_W, h: PAD_H, r: PAD_W, dead: false, t: 0, ai: null, parts: null,
    };
  }

  const row = ENEMIES[rowId];
  if (!row) return null;
  const e = {
    id: world.nextId(), kind: row.kind, def: row, defId: rowId,
    x, y: 0, vx: 0, vy: 0, ang: 0,
    hp: row.hp, hpMax: row.hp, team: row.kind === 'balloon' ? 2 : 1,
    w: row.w, h: row.h, r: Math.hypot(row.w, row.h),
    dead: false, t: 0, ai: null, parts: null,
    hitFlash: 0, lean: 0, gunCool: 0, facing: -1,
    mainCool: 0, cool: [0, 0, 0, 0], ammo: [0, 0, 0, 0], loadout: [],
  };

  if (row.kind === 'boss') {
    e.parts = (row.parts || []).map((q) => ({
      ...q, hpMax: q.hp, dead: false, wreck: false, x: 0, y: 0, hitFlash: 0, gunCool: 0, w: q.w, h: q.h,
    }));
    e.hp = e.hpMax = e.parts.reduce((acc, q) => acc + q.hp, 0);
    const onSea = row.shape === 'boss_battleship';
    e.y = typeof y === 'number' ? y : (onSea ? world.terrain.heightAt(x) + row.h : 980);
    e.drift = onSea ? 0 : -46;
    e.baseY = e.y;
    for (const q of e.parts) { q.x = e.x + q.dx; q.y = e.y + q.dy; }
  } else if (row.kind === 'ground' || row.kind === 'flak') {
    e.y = world.terrain.heightAt(x) + row.h;
  } else if (row.kind === 'balloon') {
    e.y = typeof y === 'number' ? y : world.terrain.heightAt(x) + 500;
  } else if (row.kind === 'fighter') {
    e.y = typeof y === 'number' ? y : 620;
    e.flight = flightCfg(row);
    e.speed = e.flight.cruise;
    e.ai = makeAi(row.ai, world.rng);
    e.ang = opts.facing === 1 ? 0 : Math.PI;
    e.facing = opts.facing === 1 ? 1 : -1;
    e.vx = Math.cos(e.ang) * e.speed;
    e.stalling = false;
    e.spreadMul = 3.5;
  } else {
    e.y = typeof y === 'number' ? y : world.terrain.heightAt(x) + row.h;
  }
  return e;
}

export function makeSpawner(world) {
  const level = world.level;
  const pending = (level.waves || []).map((w) => ({ ...w, done: false }));

  // Static spawns exist from tick 0: there are few of them and they anchor the mission.
  for (const s of (level.spawns || [])) {
    const rowId = s.def || s.kind;
    const y = s.y === 'ground' ? undefined : s.y;
    const e = makeEnt(world, rowId, s.at, y, { padId: s.padId });
    if (e) { if (s.tag) e.tag = s.tag; world.ents.push(e); }
  }

  return {
    step() {
      const px = world.player ? world.player.x : 0;
      for (const w of pending) {
        if (w.done || px < w.at - world.cam.vw * 0.4) continue;
        w.done = true;
        const rowId = w.def || w.kind;
        const n = w.n || 1;
        const sp = w.spacing || 400;
        for (let i = 0; i < n; i++) {
          const x = px + world.cam.vw * 0.9 + i * sp;
          const y = 480 + world.rng.range(0, 620) + i * 40;
          const e = makeEnt(world, rowId, x, y, { facing: -1 });
          if (e) world.ents.push(e);
        }
        world.push({ e: 'ui', what: 'wave', n, kind: rowId });
      }
    },
    remaining: () => pending.filter((w) => !w.done).length,
    triggered: (wv) => {
      const f = pending.find((x) => x.at === wv.at && (x.def || x.kind) === (wv.def || wv.kind));
      return f ? f.done : true;
    },
  };
}
