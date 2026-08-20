// Where creatures are, when they come back, and who they have noticed. The plan is read out of
// the quest packs — a step that says `kill grain_rat in wwa.granary` is the only authority on what
// belongs in the granary — so adding a quest still adds no code.
//
// No renderer import: the rig is handed in as `{ add, remove }`, which is what lets this run in
// node against the real data/areas.json.

import { ENEMIES, RESPAWN, SPAWN_RADIUS, DESPAWN_RADIUS, HOSTILE_CAP } from '../sim/tables.js';
import { WATCH_WEIGHT } from '../sim/faction.js';
import { STATE, AI, arm, think, hurt, isLive } from '../sim/foes.js';
import { contains, centreOf, lineage } from './areas.js';

const TAU = Math.PI * 2;
const EMPTY = [];

// The disguise-detecting class (CLAUDE.md: "the Watch"). Anything in here that is live and near
// the player is what `session.watch()` counts against a Graft.
export const WATCHERS = new Set(['watchman']);

// One rig per `geo` in the bestiary, so a new row with an existing rig needs no wiring and a row
// naming a rig nobody handed over is refused here rather than drawn by nothing.
export function rigFor(rigs) {
  const of = enemy => rigs[ENEMIES[enemy]?.geo] || null;
  return {
    add: spec => of(spec.enemy)?.add(spec) ?? null,
    remove: a => of(a.enemy)?.remove(a) ?? false,
  };
}

// A nest is not a crowd. Eight is L01's own number — Bel says "eight of them, at a guess" — and it
// is also under the 16 instances one (kind, zone) InstancedMesh can carry.
export const PER_AREA = 8;

// One quest's steps add up — L01 asks for one rat and then seven, and eight is what Bel says is in
// the grain, so eight is what is there and the player never stands about waiting for a respawn.
// Across quests it is the largest demand, not the sum: two contracts on the same barn is still one
// barn's worth of rats.
export function planFrom(defs = {}, areas = {}) {
  const plan = new Map();
  for (const def of Object.values(defs)) {
    const want = new Map();
    for (const s of def.steps || []) {
      for (const o of s.objectives || []) {
        if (o.k !== 'kill' || !ENEMIES[o.kind]) continue;
        const id = s.in || o.area;
        if (!id || !areas[id]) continue;
        const key = `${id}|${o.kind}`;
        want.set(key, (want.get(key) || 0) + (o.target || 1));
      }
    }
    for (const [key, n] of want) {
      const [id, kind] = key.split('|');
      const row = plan.get(id) || plan.set(id, new Map()).get(id);
      row.set(kind, Math.min(PER_AREA, Math.max(row.get(kind) || 0, n)));
    }
  }
  return plan;
}

function pointIn(shape, rng) {
  if (shape.k === 'circle') {
    const a = rng() * TAU, r = shape.r * 0.9 * Math.sqrt(rng());
    return { x: shape.x + Math.cos(a) * r, z: shape.z + Math.sin(a) * r };
  }
  const x0 = Math.min(shape.x0, shape.x1), x1 = Math.max(shape.x0, shape.x1);
  const z0 = Math.min(shape.z0, shape.z1), z1 = Math.max(shape.z0, shape.z1);
  const mx = (x1 - x0) * 0.06, mz = (z1 - z0) * 0.06;
  return { x: x0 + mx + rng() * (x1 - x0 - 2 * mx), z: z0 + mz + rng() * (z1 - z0 - 2 * mz) };
}

export class Spawner {
  constructor({ rig, player = null, ground = null, blocked = null, rng = Math.random, cap = HOSTILE_CAP } = {}) {
    this.rig = rig;
    this.player = player;
    this.ground = ground;
    this.blocked = blocked;
    this.rng = rng;
    this.cap = cap;
    this.armed = false;
    this.areas = {};
    this.plan = new Map();
    this.live = [];
    this.slots = new Map();
    this.blows = [];
    this.now = 0;
    this.due = 0;
  }

  // `quests` is the save document's quest record, or omitted to plan from every definition given.
  // With it, only the quests the player is actually on populate the world — otherwise accepting
  // one town vermin contract would put its six rats in the streets of a town you left in Act 1.
  arm(areas, defs, quests = null) {
    this.areas = areas || {};
    this.defs = defs || {};
    this.quests = quests;
    this.sig = null;
    this.armed = true;
    this.due = 0;
    this.replan();
    return this;
  }

  replan() {
    if (!this.quests) {
      if (this.sig === 'all') return;
      this.sig = 'all';
      this.plan = planFrom(this.defs, this.areas);
      return;
    }
    const rec = this.quests() || {};
    const ids = Object.keys(rec).filter(id => rec[id].s === 'active' || rec[id].s === 'turnin').sort();
    const sig = ids.join(',');
    if (sig === this.sig) return;
    this.sig = sig;
    const live = {};
    for (const id of ids) if (this.defs[id]) live[id] = this.defs[id];
    this.plan = planFrom(live, this.areas);
  }

  registerKnobs(q) {
    q.register({ key: 'foeNotice', label: 'Creature sight (m)', type: 'range', min: 1, max: 20, step: 0.5, default: AI.notice, group: 'Combat' },
      v => { AI.notice = v; });
    q.register({ key: 'foeCharge', label: 'Charge sight (m)', type: 'range', min: 1, max: AI.leash, step: 0.5, default: AI.charge, group: 'Combat' },
      v => { AI.charge = v; });
    q.register({ key: 'foeRespawn', label: 'Respawn (s)', type: 'range', min: 5, max: 240, step: 5, default: RESPAWN.common, group: 'Combat' },
      v => { this.respawnSeconds = v; });
    q.register({ key: 'foeCap', label: 'Live creatures', type: 'range', min: 0, max: HOSTILE_CAP, step: 1, default: HOSTILE_CAP, group: 'Combat' },
      v => { this.cap = v; });
  }

  get wait() { return this.respawnSeconds ?? RESPAWN.common; }

  // One clock per (area, enemy) nest, and `owed` is how many of it are dead and waiting on it. A
  // count rather than a bare gate: killing one of eight must hold back one rat, not the nest.
  slot(area, enemy) {
    const key = `${area}|${enemy}`;
    let s = this.slots.get(key);
    if (!s) this.slots.set(key, s = { readyAt: 0, owed: 0 });
    return s;
  }

  // A planned area inside this one owns its own ground: the granary is part of the town, so a rat
  // planned for `wwa` could stand in `wwa.granary` and be killed for the granary's quota without
  // ever having been in the grain.
  inNested(area, x, z) {
    for (const [id] of this.plan) {
      if (id === area || !lineage(this.areas, id).includes(area)) continue;
      if (contains(this.areas[id], x, z)) return true;
    }
    return false;
  }

  // The rig has the last word: it answers null for a row it has no body for, or for one whose mesh
  // is full, because an enemy you cannot see is worse than one that is missing.
  place(area, enemy, pos) {
    const shape = this.areas[area]?.shape;
    if (!shape) return null;
    for (let n = 0; n < 16; n++) {
      const p = pointIn(shape, this.rng);
      // A town is a declared area too, and six rats sprinkled over 240 × 200 m would spawn out of
      // sight and be culled again a second later. Whatever the shape, a creature appears near you.
      if (pos && Math.hypot(p.x - pos.x, p.z - pos.z) > SPAWN_RADIUS) continue;
      if (this.inNested(area, p.x, p.z)) continue;
      if (this.ground && !Number.isFinite(this.ground(p.x, p.z))) continue;
      // An area is a rectangle on the map and a building standing in it is not a hole in that
      // rectangle, so a fifth of the granary's rats used to start inside the massing, where
      // `world.sight()` correctly refuses every approach from every distance. The chase ejects
      // them eventually; the first fight in the game should not need it to.
      if (this.blocked && this.blocked(p.x, p.z)) continue;
      const a = this.rig.add({ enemy, x: p.x, z: p.z, home: [p.x, p.z], area });
      if (!a) return null;
      arm(a, enemy);
      a.area = area;
      this.live.push(a);
      return a;
    }
    return null;
  }

  near(pos) {
    const out = [];
    for (const [id, row] of this.plan) {
      const a = this.areas[id];
      const c = a && centreOf(a);
      if (!c) continue;
      const d = Math.hypot(c.x - pos.x, c.z - pos.z);
      if (d > SPAWN_RADIUS && !contains(a, pos.x, pos.z)) continue;
      out.push([id, row]);
    }
    return out;
  }

  countIn(area, enemy) {
    let n = 0;
    for (const f of this.live) if (f.area === area && f.enemy === enemy) n++;
    return n;
  }

  repopulate(pos) {
    for (const [id, row] of this.near(pos)) {
      for (const [enemy, want] of row) {
        const s = this.slot(id, enemy);
        if (this.now >= s.readyAt) s.owed = 0;
        const cap = Math.max(0, want - s.owed);
        let have = this.countIn(id, enemy);
        while (have < cap && this.live.length < this.cap) {
          if (!this.place(id, enemy, pos)) break;
          have++;
        }
      }
    }
  }

  // Out of sight and out of the fight: a creature the player has walked away from goes, and it
  // owes the nest nothing, so walking back finds it still there. Only a body counts against the
  // clock — otherwise walking out past DESPAWN_RADIUS and back is a free respawn.
  cull(pos) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const f = this.live[i];
      if (Math.hypot(f.x - pos.x, f.z - pos.z) < DESPAWN_RADIUS) continue;
      this.drop(i, !isLive(f));
    }
  }

  drop(i, died = false) {
    const f = this.live.splice(i, 1)[0];
    this.rig.remove(f);
    if (!died) return;
    const s = this.slot(f.area, f.enemy);
    s.owed++;
    s.readyAt = this.now + this.wait;
  }

  // Deliberately not an `update` — the session ticks this, not the frame loop, so a creature
  // cannot go on biting behind an open menu and hand over thirty seconds of damage on resume.
  tick(dt, pos = this.player?.pos) {
    if (!this.armed || !pos) return;
    this.now += dt;
    for (const f of this.live) {
      const dealt = think(f, dt, { px: pos.x, pz: pos.z, run: f.run || 1 });
      if (dealt > 0) this.blows.push({ enemy: f.enemy, damage: dealt, x: f.x, z: f.z });
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (this.live[i].state === STATE.dead) this.drop(i, true);
    }
    this.due -= dt;
    if (this.due > 0) return;
    this.due = 1;
    this.replan();
    this.cull(pos);
    this.repopulate(pos);
  }

  foes() { return this.live.filter(isLive); }

  hit(foe, damage) {
    const r = hurt(foe, damage);
    if (r.hit) this.aggro(AI.alarm, foe);
    return r;
  }

  // §8.3's comeback and "the nest heard that" are the same operation: everything alive inside the
  // radius now has a grudge.
  aggro(radius, pos) {
    if (!pos) return 0;
    let n = 0;
    for (const f of this.live) {
      if (!isLive(f) || f.hostile) continue;
      if (Math.hypot(f.x - pos.x, f.z - pos.z) > radius) continue;
      f.hostile = true;
      n++;
    }
    return n;
  }

  // §9.4's `recover` verb. The step is being reset because the player cannot finish it, so the
  // timers go with it: the nest is back before they have turned round.
  respawn(kind, n = 1) {
    if (!ENEMIES[kind]) return false;
    // The bodies go first. A corpse still occupies its slot, so leaving eight of them lying in the
    // granary would make a reset step wait out the full respawn before anything came back.
    for (let i = this.live.length - 1; i >= 0; i--) {
      if (this.live[i].enemy === kind && !isLive(this.live[i])) this.drop(i);
    }
    for (const [key, s] of this.slots) if (key.endsWith(`|${kind}`)) { s.readyAt = 0; s.owed = 0; }
    for (const [id, row] of this.plan) {
      if (!row.has(kind)) continue;
      row.set(kind, Math.min(PER_AREA, Math.max(row.get(kind), n)));
    }
    this.due = 0;
    return true;
  }

  watch() {
    return this.live.filter(f => isLive(f) && WATCHERS.has(f.enemy))
      .map(f => ({ id: 'watch', kind: 'watch', x: f.x, z: f.z, weight: WATCH_WEIGHT.watch }));
  }

  take() {
    if (!this.blows.length) return EMPTY;
    const out = this.blows;
    this.blows = [];
    return out;
  }
}
