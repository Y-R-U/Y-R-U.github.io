/**
 * The cast-circle system: five circles, one focus pool, XP and spell learning.
 *
 * How it gets its ticks: it spawns one invisible "conductor" entity into the sim
 * on `sim:ready`. The sim calls that entity's onUpdate every fixed step and its
 * render() inside the render pass — which is the only place a spell can draw,
 * because anything drawn after the sim's R.end() is drawn into nothing. So the
 * whole module rides on one pooled entity and needs no cooperation from main.js.
 *
 * Focus is the loadout puzzle: five circles drink from one pool, and auto-cast
 * is deliberately not allowed to drain the last of it, so slot 1 always has a
 * shot left. `circle.blocked` says why a circle is not firing, so the UI can
 * show the player exactly who is eating their focus.
 */

import { LAYER } from '../gfx/renderer.js';
import { windup, feedbackTick, frameReset, updateDecals, drawDecals, SCHOOL, clearDecals } from './fx.js';
import { bindWorld } from './common.js';
import { defineSurfaces } from './surfaces.js';

export const SLOTS = 5;
export const CIRCLE_UNLOCK = [1, 3, 7, 12, 18];    // player level per circle

const MAX_LEVEL = 24;

/** XP to get from `level` to `level+1`. Tuned for level 24 over a 35–50 min run. */
export function xpForLevel(level) {
  return Math.round(34 + 30 * Math.pow(level, 1.32));
}

export function createSpellSystem(ctx, SPELLS, opts) {
  const o = opts || {};
  const bus = ctx.bus;
  const byId = new Map();
  for (let i = 0; i < SPELLS.length; i++) byId.set(SPELLS[i].id, SPELLS[i]);

  // stats for all five ranks, computed once — scale() must never run in a cast
  const statCache = new Map();
  for (let i = 0; i < SPELLS.length; i++) {
    const def = SPELLS[i];
    const arr = [];
    for (let r = 1; r <= (def.levels || 5); r++) arr.push(def.scale(r));
    statCache.set(def.id, arr);
  }

  const S = {
    ctx,
    spells: SPELLS,
    byId,
    world: null,

    level: 1,
    xp: 0,
    xpToNext: xpForLevel(1),
    maxLevel: MAX_LEVEL,

    focus: 100,
    focusMax: 100,
    focusRegen: 12,
    regenPause: 0,
    regenPauseTime: 0.8,

    known: new Map(),          // id -> rank
    circles: [],
    offer: null,
    shards: 0,

    autoEnabled: true,
    manualEnabled: o.manualInput !== false,
    starving: false,
    lastBlockedReason: '',

    stats: { casts: 0, hits: 0, damage: 0, xpFromKills: 0, xpFromBreaking: 0 },
  };

  for (let i = 0; i < SLOTS; i++) {
    S.circles.push({
      index: i, spellId: null, rank: 0, def: null,
      cd: 0, cdMax: 0, ready: true, unlocked: i === 0,
      blocked: '', auto: i > 0, lastCast: -99,
    });
  }

  /* ---------------- learning ---------------- */

  S.knownList = function () {
    const out = [];
    S.known.forEach((rank, id) => out.push({ id, rank, def: byId.get(id) }));
    return out;
  };

  S.rankOf = (id) => S.known.get(id) || 0;
  S.statsFor = (id, rank) => statCache.get(id)[Math.max(0, Math.min(4, rank - 1))];

  S.learn = function (id, rank) {
    const def = byId.get(id);
    if (!def) return false;
    const had = S.known.get(id) || 0;
    const r = Math.max(had, rank || 1);
    S.known.set(id, Math.min(def.levels || 5, r));
    if (!had) {
      bus.emit('spell:learn', { id, def, rank: S.known.get(id), isNew: true });
      autoAssign(id);
    } else {
      bus.emit('spell:levelup', { id, def, rank: S.known.get(id), from: had });
    }
    syncCircles();
    return true;
  };

  S.rankUp = function (id) {
    const def = byId.get(id);
    if (!def) return false;
    const had = S.known.get(id) || 0;
    if (had >= (def.levels || 5)) return false;
    S.known.set(id, had + 1);
    if (had === 0) { bus.emit('spell:learn', { id, def, rank: 1, isNew: true }); autoAssign(id); }
    else bus.emit('spell:levelup', { id, def, rank: had + 1, from: had });
    syncCircles();
    return true;
  };

  /** Spell shards from elites: rank up something the player already uses. */
  S.grantShard = function (id) {
    S.shards++;
    if (id) return S.rankUp(id);
    const pool = [];
    S.known.forEach((rank, k) => { if (rank < (byId.get(k).levels || 5)) pool.push(k); });
    if (!pool.length) return false;
    return S.rankUp(pool[(Math.random() * pool.length) | 0]);
  };

  function autoAssign(id) {
    for (let i = 0; i < SLOTS; i++) {
      const c = S.circles[i];
      if (c.unlocked && !c.spellId) { S.setSlot(i, id); return true; }
    }
    // Learned but homeless. Below level 3 there is exactly one circle and it is
    // the manual one, so an auto-cast spell taken from an offer does nothing at
    // all — the player has to be told, or it looks broken.
    let next = 0;
    for (let i = 0; i < SLOTS; i++) if (!S.circles[i].unlocked) { next = CIRCLE_UNLOCK[i]; break; }
    bus.emit('spell:unplaced', { id, def: byId.get(id), nextCircleLevel: next });
    return false;
  }

  S.setSlot = function (i, id) {
    const c = S.circles[i];
    if (!c) return false;
    if (id && !S.known.has(id)) return false;
    // one spell cannot sit in two circles at once
    if (id) for (let k = 0; k < SLOTS; k++) if (k !== i && S.circles[k].spellId === id) S.circles[k].spellId = null;
    c.spellId = id || null;
    syncCircles();
    bus.emit('spell:slots', { circles: S.circles });
    return true;
  };
  S.clearSlot = (i) => S.setSlot(i, null);

  S.swapSlots = function (a, b) {
    const x = S.circles[a].spellId, y = S.circles[b].spellId;
    S.circles[a].spellId = y; S.circles[b].spellId = x;
    syncCircles();
    bus.emit('spell:slots', { circles: S.circles });
  };

  function syncCircles() {
    for (let i = 0; i < SLOTS; i++) {
      const c = S.circles[i];
      c.unlocked = S.level >= CIRCLE_UNLOCK[i];
      c.auto = i > 0;
      if (c.spellId && !S.known.has(c.spellId)) c.spellId = null;
      c.def = c.spellId ? byId.get(c.spellId) : null;
      c.rank = c.spellId ? S.known.get(c.spellId) : 0;
      if (c.def) {
        const st = S.statsFor(c.spellId, c.rank);
        c.cdMax = st.cooldown === undefined ? c.def.cooldown : st.cooldown;
        c.cost = costOf(c.def, st);
      } else { c.cdMax = 0; c.cost = 0; }
    }
    // only on the frame a circle actually opens — otherwise clearing a circle in
    // the loadout would refill itself before the player let go of it
    let open = 0;
    for (let i = 0; i < SLOTS; i++) if (S.circles[i].unlocked) open++;
    if (open > unlockedCount) fillOpenedCircles();
    unlockedCount = open;
  }
  let unlockedCount = 0;

  /**
   * A spell taken from an offer before its circle exists was learned and then
   * forgotten about: `autoAssign` found no free circle, and nothing ever
   * revisited it, so levelling to 3 opened an empty circle while the spell the
   * player had chosen sat unused. Any known spell with no home drops into the
   * first circle that opens.
   */
  function fillOpenedCircles() {
    let free = -1;
    for (let i = 0; i < SLOTS; i++) {
      const c = S.circles[i];
      if (c.unlocked && !c.spellId) { free = i; break; }
    }
    if (free < 0) return;
    const placed = new Set();
    for (const c of S.circles) if (c.spellId) placed.add(c.spellId);
    for (const id of S.known.keys()) {
      if (placed.has(id)) continue;
      const c = S.circles[free];
      c.spellId = id;
      c.def = byId.get(id);
      c.rank = S.known.get(id);
      const st = S.statsFor(id, c.rank);
      c.cdMax = st.cooldown === undefined ? c.def.cooldown : st.cooldown;
      c.cost = costOf(c.def, st);
      bus.emit('spell:slots', { circles: S.circles });
      placed.add(id);
      free = -1;
      for (let i = 0; i < SLOTS; i++) {
        const k = S.circles[i];
        if (k.unlocked && !k.spellId) { free = i; break; }
      }
      if (free < 0) return;
    }
  }

  function costOf(def, st) {
    return st && st.cost !== undefined ? st.cost : def.cost;
  }

  /* ---------------- XP ---------------- */

  S.addXp = function (amount, source) {
    if (S.level >= MAX_LEVEL) return;
    S.xp += amount;
    if (source === 'kill') S.stats.xpFromKills += amount;
    else S.stats.xpFromBreaking += amount;
    while (S.xp >= S.xpToNext && S.level < MAX_LEVEL) {
      S.xp -= S.xpToNext;
      S.level++;
      S.xpToNext = xpForLevel(S.level);
      syncCircles();
      const circle = CIRCLE_UNLOCK.indexOf(S.level);
      bus.emit('player:level', {
        level: S.level, unlockedCircle: circle >= 0 ? circle + 1 : 0,
        xpToNext: S.xpToNext,
      });
      ctx.audio.sfx(circle >= 0 ? 'level_up_circle' : 'level_up');
      if (S.level % 2 === 0) makeOffer();
    }
  };

  /* ---------------- pick 1 of 3 ---------------- */

  function makeOffer() {
    const choices = [];
    const newPool = [];
    const upPool = [];
    for (let i = 0; i < SPELLS.length; i++) {
      const def = SPELLS[i];
      const have = S.known.get(def.id) || 0;
      if (!have) { if (def.unlockLevel <= S.level) newPool.push(def); }
      else if (have < (def.levels || 5)) upPool.push(def);
    }
    shuffle(newPool); shuffle(upPool);

    // early on the player needs breadth; later, depth is the more interesting pick
    const wantNew = S.known.size < 3 ? 3 : (S.known.size < 6 ? 2 : 1);
    const schools = new Set();
    for (let i = 0; i < newPool.length && choices.length < wantNew; i++) {
      if (schools.has(newPool[i].school) && choices.length) continue;
      schools.add(newPool[i].school);
      choices.push(offerCard(newPool[i], 1, true));
    }
    for (let i = 0; i < upPool.length && choices.length < 3; i++) {
      choices.push(offerCard(upPool[i], (S.known.get(upPool[i].id) || 0) + 1, false));
    }
    for (let i = 0; i < newPool.length && choices.length < 3; i++) {
      if (choices.some((c) => c.id === newPool[i].id)) continue;
      choices.push(offerCard(newPool[i], 1, true));
    }
    if (!choices.length) return;
    S.offer = { choices, level: S.level };
    bus.emit('spell:offer', S.offer);
  }

  function offerCard(def, rank, isNew) {
    return {
      id: def.id, def, rank, isNew,
      name: def.name, school: def.school, icon: def.icon,
      text: isNew ? def.desc : (def.rankText ? def.rankText[rank - 1] : ''),
      subtext: isNew ? (def.rankText ? def.rankText[0] : '') : `Rank ${rank}`,
    };
  }

  S.chooseOffer = function (index) {
    if (!S.offer) return false;
    const c = S.offer.choices[index];
    if (!c) return false;
    S.offer = null;
    if (c.isNew) S.learn(c.id, 1); else S.rankUp(c.id);
    bus.emit('spell:offerTaken', { id: c.id, rank: c.rank, isNew: c.isNew });
    return true;
  };
  S.rerollOffer = function () { S.offer = null; makeOffer(); return S.offer; };
  S.forceOffer = function () { makeOffer(); return S.offer; };

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
  }

  /* ---------------- targeting ---------------- */

  const ORIGIN = { x: 0, y: 0 };
  const C = {
    world: null, R: ctx.R, P: ctx.P, bus, rng: ctx.rng, input: ctx.input,
    audio: ctx.audio, view: ctx.view, LAYER, sys: S,
    x: 0, y: 0, tx: 0, ty: 0, dirX: 1, dirY: 0,
    rank: 1, slot: 0, manual: false, target: null, report: null,
  };

  function castOrigin(w, caster) {
    if (w.castOrigin) { const p = w.castOrigin(ORIGIN); ORIGIN.x = p.x; ORIGIN.y = p.y; }
    else { ORIGIN.x = caster.x; ORIGIN.y = caster.y - 10; }
    return ORIGIN;
  }

  /** Resolve where a spell is aimed. Returns false when there is nothing worth hitting. */
  let aimOverride = null;
  function resolveTarget(def, caster, manual, w) {
    const range = def.range || 600;
    let tx, ty, ent = null;

    if (aimOverride) {
      C.tx = aimOverride.x; C.ty = aimOverride.y;
      C.target = def.targeting === 'nearest' || def.targeting === 'aim'
        ? w.nearestEnemy(aimOverride.x, aimOverride.y, 220) : null;
      if (def.targeting === 'ground' || def.targeting === 'area') {
        const g = w.groundY(C.tx, C.ty - 40, 900);
        if (!Number.isNaN(g)) C.ty = g;
      }
      return true;
    }

    if (def.targeting === 'nearest') {
      ent = w.nearestEnemy(caster.x, caster.y, range);
      if (!ent) return false;
      tx = ent.x; ty = ent.y;
    } else if (def.targeting === 'self') {
      tx = caster.x; ty = caster.y;
      if (!manual && !w.nearestEnemy(caster.x, caster.y, Math.max(340, range))) return false;
    } else if (manual && (def.targeting === 'aim' || def.targeting === 'ground' || def.targeting === 'area')) {
      const a = ctx.input.aim;
      tx = a.x; ty = a.y;
      const dx = tx - caster.x, dy = ty - caster.y;
      const L = Math.hypot(dx, dy);
      if (L > range) { tx = caster.x + dx / L * range; ty = caster.y + dy / L * range; }
    } else {
      ent = w.nearestEnemy(caster.x, caster.y, range);
      if (!ent) return false;
      tx = ent.x; ty = ent.y;
    }

    if (def.targeting === 'ground' || def.targeting === 'area') {
      const g = w.groundY(tx, ty - 40, 900);
      if (!Number.isNaN(g)) ty = g;
    }

    C.tx = tx; C.ty = ty; C.target = ent;
    return true;
  }

  /* ---------------- casting ---------------- */

  const PENDING = [];
  for (let i = 0; i < 8; i++) PENDING.push({ live: false, t: 0, wind: 0, def: null, caster: null, rank: 1, slot: 0, manual: false, tx: 0, ty: 0, dirX: 1, dirY: 0, target: null });

  function report(src, target, applied, type, material) {
    if (applied === undefined || applied === null) return;
    S.stats.hits++;
    S.stats.damage += applied;
    if (hitEmits < 24) {
      hitEmits++;
      HIT.id = curCastId; HIT.target = target || null;
      HIT.x = target ? target.x : (src ? src.x : 0);
      HIT.y = target ? target.y : (src ? src.y : 0);
      HIT.damage = applied; HIT.type = type; HIT.material = material === undefined ? -1 : material;
      bus.emit('spell:hit', HIT);
    }
  }
  const HIT = { id: '', target: null, x: 0, y: 0, damage: 0, type: '', material: -1 };
  let hitEmits = 0;
  let curCastId = '';

  /**
   * @param force skip focus and cooldown checks (test harness / scripted casts)
   */
  S.castSlot = function (i, manual, force) {
    const c = S.circles[i];
    if (!c || !c.def) return false;
    return tryCast(c, manual === undefined ? i === 0 : manual, force);
  };

  /** Cast a spell directly, outside the circle system. Used by the test range. */
  S.castSpell = function (id, rank, opts) {
    const def = byId.get(id);
    const w = S.world;
    if (!def || !w || !w.player) return false;
    const fake = { index: -1, def, spellId: id, rank: rank || 1, cd: 0, cdMax: 0, cost: 0, unlocked: true };
    aimOverride = opts && opts.x !== undefined ? opts : null;
    const r = tryCast(fake, opts && opts.manual !== undefined ? opts.manual : true, true);
    aimOverride = null;
    return r;
  };

  function tryCast(c, manual, force) {
    const w = S.world;
    if (!w) return false;
    const caster = w.player;
    if (!caster || !caster.alive) return false;
    const def = c.def;
    const rank = c.rank || 1;
    const st = S.statsFor(def.id, rank);
    const cost = force ? 0 : costOf(def, st);

    if (!force) {
      if (c.cd > 0) { c.blocked = 'cooldown'; return false; }
      if (S.focus < cost) {
        c.blocked = 'focus';
        if (manual) {
          S.starving = true;
          bus.emit('spell:starved', { slot: c.index, id: def.id, need: cost, have: S.focus });
          ctx.audio.sfx('spell_fizzle');
        }
        return false;
      }
      // auto-cast is not allowed to eat the manual circle's next cast
      if (!manual) {
        const reserve = manualReserve();
        if (S.focus - cost < reserve) { c.blocked = 'reserved'; return false; }
        if (autoGap > 0) { c.blocked = 'queue'; return false; }
      }
    }

    if (!resolveTarget(def, caster, manual, w)) { c.blocked = 'notarget'; return false; }
    c.blocked = '';

    const o = castOrigin(w, caster);
    let dx = C.tx - o.x, dy = C.ty - o.y;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;

    S.focus -= cost;
    if (manual) S.regenPause = S.regenPauseTime;
    else autoGap = 0.14;
    c.cd = st.cooldown === undefined ? def.cooldown : st.cooldown;
    c.cdMax = c.cd;
    c.lastCast = time;
    S.stats.casts++;

    if (caster.data && caster.data.castPose) caster.data.castPose(Math.max(0.18, def.windup || 0.12) + 0.12);
    if (caster.faceX !== undefined && def.targeting !== 'self') caster.faceX = dx >= 0 ? 1 : -1;

    bus.emit('spell:cast', {
      id: def.id, rank, slot: c.index, manual, school: def.school,
      x: o.x, y: o.y, tx: C.tx, ty: C.ty, cost, focus: S.focus,
    });
    // the wind-up sound, not the cast: each spell plays its own `_cast` key at
    // the moment of release, which is a different beat
    ctx.audio.sfx('spell_' + def.id + '_windup', { x: o.x, y: o.y });

    const wind = def.windup === undefined ? 0.12 : def.windup;
    const p = freePending();
    if (!p) { fire(def, caster, rank, c.index, manual, C.tx, C.ty, dx, dy, C.target); return true; }
    p.live = true; p.t = 0; p.wind = wind; p.def = def; p.caster = caster;
    p.rank = rank; p.slot = c.index; p.manual = manual;
    p.tx = C.tx; p.ty = C.ty; p.dirX = dx; p.dirY = dy; p.target = C.target;
    if (wind <= 0) { p.live = false; fire(def, caster, rank, c.index, manual, C.tx, C.ty, dx, dy, C.target); }
    return true;
  }

  function freePending() {
    for (let i = 0; i < PENDING.length; i++) if (!PENDING[i].live) return PENDING[i];
    return null;
  }

  function manualReserve() {
    const c = S.circles[0];
    if (!c || !c.def) return 12;
    return Math.min(S.focusMax * 0.5, c.cost * 1.7);
  }

  function fire(def, caster, rank, slot, manual, tx, ty, dx, dy, target) {
    const w = S.world;
    if (!w || !caster.alive) return;
    const o = castOrigin(w, caster);
    C.world = w; C.rank = rank; C.slot = slot; C.manual = manual;
    C.x = o.x; C.y = o.y; C.tx = tx; C.ty = ty; C.dirX = dx; C.dirY = dy;
    C.target = target && target.alive ? target : null;
    C.audio = ctx.audio;
    C.report = report;
    curCastId = def.id;
    hitEmits = 0;
    try {
      def.cast(C, caster, C.target || { x: tx, y: ty }, S.statsFor(def.id, rank));
    } catch (err) {
      console.error('[spells] cast failed:', def.id, err);
    }
  }

  /* ---------------- the tick ---------------- */

  let time = 0;
  let autoGap = 0;

  S.update = function (dt) {
    const w = S.world;
    time += dt;
    feedbackTick(dt);
    updateDecals(dt);
    if (autoGap > 0) autoGap -= dt;

    if (S.regenPause > 0) S.regenPause -= dt;
    else if (S.focus < S.focusMax) S.focus = Math.min(S.focusMax, S.focus + S.focusRegen * dt);

    for (let i = 0; i < SLOTS; i++) {
      const c = S.circles[i];
      if (c.cd > 0) c.cd = Math.max(0, c.cd - dt);
      c.ready = c.cd <= 0 && c.unlocked && !!c.def;
    }

    // wind-ups
    for (let i = 0; i < PENDING.length; i++) {
      const p = PENDING[i];
      if (!p.live) continue;
      p.t += dt;
      if (w && p.caster.alive) {
        const o = castOrigin(w, p.caster);
        windup(w, o.x, o.y, p.def.school, Math.min(1, p.t / p.wind), p.manual ? 1.1 : 0.8);
      }
      if (p.t >= p.wind) {
        p.live = false;
        fire(p.def, p.caster, p.rank, p.slot, p.manual, p.tx, p.ty, p.dirX, p.dirY, p.target);
      }
    }

    if (!w || !w.player || !w.player.alive) return;

    if (S.manualEnabled && ctx.input.pressed('cast')) S.castSlot(0, true, false);

    if (S.autoEnabled) {
      let anyStarved = false;
      for (let i = 1; i < SLOTS; i++) {
        const c = S.circles[i];
        if (!c.unlocked || !c.def) continue;
        if (c.cd > 0) { c.blocked = 'cooldown'; continue; }
        tryCast(c, false, false);
        if (c.blocked === 'reserved' || c.blocked === 'focus') anyStarved = true;
      }
      S.starving = anyStarved && S.focus < S.focusMax * 0.35;
    }
  };

  S.render = function (alpha, R) {
    frameReset();
    drawDecals(R);
    // a ring at Rook's feet whenever the pool is genuinely starved, so the
    // player can see the reason their manual cast is not going off
    const w = S.world;
    if (S.starving && w && w.player) {
      const p = w.player;
      const k = 0.35 + 0.25 * Math.sin(time * 9);
      R.sprite({
        tex: R.disc, x: p.x, y: p.y + p.h * 0.5, w: 90, h: 26,
        r: 0.9, g: 0.4, b: 0.35, a: 0.18 * k, layer: LAYER.FX, add: true,
      });
    }
  };

  /* ---------------- wiring into the world ---------------- */

  const conductorDef = {
    kind: 'effect', x: 0, y: 0, w: 4, h: 4,
    gravity: 0, collides: false, trigger: true, team: 2, tag: 'spellconductor',
    layer: LAYER.FX,
    onUpdate(e, dt) { S.update(dt); },
    render(e, alpha, R) { S.render(alpha, R); },
  };

  S.attachWorld = function (world) {
    if (!world) return;
    S.world = world;
    C.world = world;
    bindWorld(world);
    defineSurfaces(world);
    clearDecals();
    // the conductor rides in the entity pool so the sim drives update+render
    S.conductor = world.spawn(conductorDef);
    if (!S.conductor) console.warn('[spells] no entity slot for the conductor');
    syncCircles();
    bus.emit('spell:ready', { system: S });
  };

  bus.on('sim:ready', (p) => S.attachWorld(p && p.world ? p.world : ctx.world));

  /* XP: kills and destruction both pay, because breaking things is the mechanic */
  bus.on('enemy:died', (p) => {
    const bonus = p && p.elite ? 60 : 0;
    S.addXp(12 + bonus + Math.round(S.level * 1.5), 'kill');
    if (p && p.elite) S.grantShard();
  });
  bus.on('prop:break', (p) => S.addXp(3, 'break'));
  bus.on('terrain:break', (p) => S.addXp(Math.min(4, 0.4 + (p && p.cells ? p.cells * 0.05 : 0)), 'break'));

  /* ---------------- save / restore ---------------- */

  S.serialize = function () {
    const k = [];
    S.known.forEach((rank, id) => k.push([id, rank]));
    return { level: S.level, xp: S.xp, known: k, slots: S.circles.map((c) => c.spellId), shards: S.shards };
  };
  S.restore = function (d) {
    if (!d) return;
    S.level = d.level || 1;
    S.xp = d.xp || 0;
    S.xpToNext = xpForLevel(S.level);
    S.known.clear();
    (d.known || []).forEach(([id, rank]) => { if (byId.has(id)) S.known.set(id, rank); });
    (d.slots || []).forEach((id, i) => { if (i < SLOTS) S.circles[i].spellId = id && S.known.has(id) ? id : null; });
    S.shards = d.shards || 0;
    syncCircles();
  };

  /**
   * The other end of the death screen: everything goes, back to the starting
   * kit. Used to be done by reloading the page, which is why the two death
   * buttons looked identical from the outside — one soft-reset, one reloaded,
   * and nothing on screen said so.
   */
  S.hardReset = function () {
    S.known.clear();
    for (const c of S.circles) c.spellId = null;
    S.level = 1; S.xp = 0; S.xpToNext = xpForLevel(1);
    S.shards = 0;
    S.focus = S.focusMax;
    S.offer = null;
    S.learn(o.startSpell || 'emberbolt', 1);
    syncCircles();
  };

  /** Death keeps knowledge, resets ranks — the roguelite rule from DESIGN §5. */
  S.softReset = function () {
    S.known.forEach((rank, id) => S.known.set(id, 1));
    S.level = 1; S.xp = 0; S.xpToNext = xpForLevel(1);
    S.focus = S.focusMax;
    syncCircles();
  };

  // starting kit
  S.learn(o.startSpell || 'emberbolt', 1);
  syncCircles();
  if (ctx.world) S.attachWorld(ctx.world);

  return S;
}
