/**
 * The difficulty director. Data in, encounters out — the level agent tunes pacing
 * by editing a plain object and never touches AI code.
 *
 * Two mechanisms, deliberately separate:
 *   ENCOUNTERS — authored, positional, once-only. The handcrafted spine.
 *   PRESSURE   — a trickle from off-screen that keeps the space between encounters
 *                from going dead, budgeted so it can never bury the player.
 */

import { spawnEnemyById, ENEMIES } from './registry.js';

/** Cost per head, in "threat points". The budget is what stops a wave stacking. */
export const THREAT = {
  husk: 1, sporeling: 0.6, thornhound: 1.8, gloamarcher: 1.6,
  stonewarden: 4.5, wispmaw: 2, oozelord: 7, sunderwraith: 6, theseam: 100,
};

/** The four movements of DESIGN §5, as spawn tables the director draws from. */
export const MOVEMENTS = {
  thornmere: { table: ['husk', 'husk', 'sporeling'], budget: 4, maxAlive: 5, perMinute: 5 },
  sunderwood: { table: ['husk', 'sporeling', 'sporeling', 'thornhound', 'wispmaw'], budget: 9, maxAlive: 9, perMinute: 11 },
  ruinreach: { table: ['husk', 'thornhound', 'gloamarcher', 'stonewarden', 'wispmaw'], budget: 15, maxAlive: 12, perMinute: 14 },
  glyphglade: { table: ['husk', 'thornhound', 'gloamarcher', 'wispmaw', 'sporeling'], budget: 20, maxAlive: 14, perMinute: 16 },
};

const _pt = { x: 0, y: 0 };

export function createDirector(world, opts) {
  const o = opts || {};
  const cfg = {
    movement: 'sunderwood',
    encounters: [],
    pressure: true,
    budget: null,           // null = take it from the movement
    maxAlive: null,
    perMinute: null,
    table: null,
    spawnRadius: [640, 1180],   // off-screen ring the trickle arrives through
    intensity: 1,
    onSpawn: null,
    ...o,
  };

  let move = MOVEMENTS[cfg.movement] || MOVEMENTS.sunderwood;
  let acc = 0;
  let elapsed = 0;
  const fired = Object.create(null);
  const pending = [];      // scheduled waves: { t, spec }
  const stats = { spawned: 0, alive: 0, threat: 0, encounters: 0 };

  function budget() { return (cfg.budget === null ? move.budget : cfg.budget) * cfg.intensity; }
  function maxAlive() { return Math.round((cfg.maxAlive === null ? move.maxAlive : cfg.maxAlive) * cfg.intensity); }
  function table() { return cfg.table || move.table; }
  function rate() { return (cfg.perMinute === null ? move.perMinute : cfg.perMinute) * cfg.intensity; }

  function census() {
    let n = 0, threat = 0;
    const list = world.entities;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.alive && e.kind === 'enemy' && e.team === 1) { n++; threat += THREAT[e.tag] || 1; }
    }
    stats.alive = n; stats.threat = threat;
    return threat;
  }

  /** Where a new body comes from: off-screen, on the ground, never on top of Rook. */
  function placement(where, ref) {
    const p = world.player;
    const bx = ref ? ref.x : (p ? p.x : 0);
    const by = ref ? ref.y : (p ? p.y : 0);
    if (Array.isArray(where)) { _pt.x = bx + where[0]; _pt.y = by + where[1]; return _pt; }

    const side = where === 'ahead' ? (p && p.vx < -10 ? -1 : 1)
      : where === 'behind' ? (p && p.vx < -10 ? 1 : -1)
        : (Math.random() < 0.5 ? -1 : 1);
    const r = cfg.spawnRadius[0] + Math.random() * (cfg.spawnRadius[1] - cfg.spawnRadius[0]);
    const x = bx + side * r;
    if (where === 'above') { _pt.x = x; _pt.y = by - 260 - Math.random() * 160; return _pt; }
    const gy = world.groundY(x, by - 500, 1400);
    _pt.x = x;
    _pt.y = Number.isFinite(gy) ? gy : by;
    return _pt;
  }

  function spawnOne(id, where, ref, extra) {
    const def = ENEMIES[id];
    if (!def) return null;
    const at = placement(def.gravity === 0 && where === undefined ? 'above' : (where || 'ahead'), ref);
    const e = spawnEnemyById(world, id, at.x, at.y, { spawnIn: true, ...(extra || {}) });
    if (e) {
      stats.spawned++;
      if (cfg.onSpawn) cfg.onSpawn(e, id);
    }
    return e;
  }

  /**
   * spec = { id, n, at, delay, spread, ...spawnOpts }  or an array of those,
   * or a bare id string. `at` is 'ahead' | 'behind' | 'above' | [dx, dy].
   */
  function spawnWave(spec, waveOpts) {
    const wo = waveOpts || {};
    const list = Array.isArray(spec) ? spec : [spec];
    const out = [];
    for (const raw of list) {
      const s = typeof raw === 'string' ? { id: raw, n: 1 } : raw;
      const n = s.n === undefined ? 1 : s.n;
      for (let i = 0; i < n; i++) {
        const e = spawnOne(s.id, s.at, wo.ref, {
          faceX: s.faceX, hpMul: s.hpMul, team: s.team, scale: s.scale,
          cd: 0.3 + Math.random() * (s.stagger === undefined ? 0.9 : s.stagger),
          spawnIn: s.spawnIn !== false,
        });
        if (e && s.spread) { e.x += (Math.random() - 0.5) * s.spread; }
        if (e) out.push(e);
      }
    }
    return out;
  }

  function runEncounter(enc) {
    stats.encounters++;
    fired[enc.id] = 1;
    if (enc.onStart) enc.onStart(world, api);
    const waves = enc.waves || [{ delay: 0, spawn: enc.spawn }];
    for (const w of waves) {
      if (!w.spawn) continue;
      if (!w.delay) spawnWave(w.spawn, { ref: enc.ref });
      else pending.push({ t: w.delay, spec: w.spawn, ref: enc.ref });
    }
  }

  function update(dt) {
    elapsed += dt;
    const p = world.player;

    for (let i = pending.length - 1; i >= 0; i--) {
      pending[i].t -= dt;
      if (pending[i].t <= 0) { spawnWave(pending[i].spec, { ref: pending[i].ref }); pending.splice(i, 1); }
    }

    if (p && p.alive) {
      for (const enc of cfg.encounters) {
        if (fired[enc.id]) continue;
        const hit = enc.trigger ? enc.trigger(world, p)
          : (p.x > enc.x - (enc.w || 200) * 0.5 && p.x < enc.x + (enc.w || 200) * 0.5
            && (enc.y === undefined || Math.abs(p.y - enc.y) < (enc.h || 400)));
        if (hit) runEncounter(enc);
      }
    }

    if (!cfg.pressure || !p || !p.alive) { census(); return; }

    const threat = census();
    if (threat >= budget() || stats.alive >= maxAlive()) { acc = Math.min(acc, 0.5); return; }

    acc += (rate() / 60) * dt;
    while (acc >= 1) {
      acc -= 1;
      const t = table();
      spawnOne(t[(Math.random() * t.length) | 0]);
      if (census() >= budget()) break;
    }
  }

  const api = {
    update,
    spawnWave,
    /** Drop an elite in deliberately — the level agent places these, not the trickle. */
    spawnElite(id, x, y, extra) {
      return spawnEnemyById(world, id, x, y, { spawnIn: true, ...(extra || {}) });
    },
    spawnBoss(x, y, arena) {
      return spawnEnemyById(world, 'theseam', x, y, { arena });
    },
    setMovement(name) { cfg.movement = name; move = MOVEMENTS[name] || move; },
    setIntensity(k) { cfg.intensity = k; },
    set(key, value) { cfg[key] = value; },
    get config() { return cfg; },
    get stats() { return stats; },
    clear() {
      world.each('enemy', (e) => { if (e.team === 1 && e.tag !== 'theseam') world.despawn(e); });
      pending.length = 0;
    },
    reset() {
      acc = 0; elapsed = 0; pending.length = 0;
      for (const k in fired) delete fired[k];
      stats.spawned = 0; stats.encounters = 0;
    },
  };
  return api;
}
