import { MAT, MATERIAL, DAMAGE, dmgType, resistOf } from './materials.js';
import { STATUS, STATUS_COUNT, statusId } from './status.js';
import { createTerrain, CELL } from './terrain.js';
import { createDebrisSystem } from './debris.js';
import { createPropSystem } from './props.js';
import { createSurfaces } from './surfaces.js';
import { createEntityPool } from './entities.js';
import { moveBody } from './physics.js';
import { createPlayer, updatePlayer, renderPlayer } from './player.js';

export const GRAVITY = 3000;

export function createWorld(ctx, opts = {}) {
  const { R, P, input, view, bus, rng, assets, LAYER } = ctx;

  const world = {
    ctx, R, P, input, view, bus, rng, assets, LAYER,
    gravity: GRAVITY,
    wind: 0,
    dt: 1 / 60,
    time: 0, frame: 0,
    player: null,
    playerControl: true,
    spawnX: 0, spawnY: -200,
    cam: { x: 0, y: 0, zoom: 1 },
    halfW: 960, halfH: 540,
    bounds: { x0: -400, x1: 9000, y0: -2200, y1: 900 },
    lastHits: [],
    debug: { aabb: false, grid: false, support: false, surfaces: false, rubble: false, player: false },
    stats: { entities: 0, props: 0, debris: 0, awake: 0, surfaceCells: 0, chunksDrawn: 0 },
    entityCap: opts.entityCap || 1024,
    debrisCap: opts.debrisCap || 900,
  };

  world.terrain = createTerrain(world, opts.terrain);
  world.debris = createDebrisSystem(world, world.debrisCap);
  world.props = createPropSystem(world);
  world.surfaces = createSurfaces(world);
  world.ents = createEntityPool(world, world.entityCap);

  /* ------------------------------------------------------------------ *
   * Debris frame catalogue, keyed by material, built from the manifest
   * ------------------------------------------------------------------ */
  const debrisByMat = [];
  for (let i = 0; i < 9; i++) debrisByMat.push([]);
  world.buildCatalogue = () => {
    const man = assets.manifest;
    if (!man || !man.materials) return;
    for (const id in man.materials) {
      const m = man.materials[id];
      const mi = MATERIAL[m.material] === undefined ? MATERIAL.ROCK : MATERIAL[m.material];
      for (const f of m.debris) debrisByMat[mi].push(f);
    }
  };
  world.randomDebrisFrame = (mat) => {
    const arr = debrisByMat[mat];
    if (!arr || !arr.length) return null;
    return arr[(rng.next() * arr.length) | 0];
  };

  /* ------------------------------------------------------------------ *
   * Audio + material feedback
   * ------------------------------------------------------------------ */
  /**
   * R.fx.shockwave THROWS when all four ring slots are busy (postfx.js:84 —
   * it dereferences a null slot). Anything that can fire twice in a frame must
   * go through this, or one enthusiastic spell takes the whole frame down.
   */
  let waveFrame = -1;
  world.shockwave = (x, y, strength, o) => {
    if (waveFrame === world.frame) return;
    waveFrame = world.frame;
    try { R.fx.shockwave(x, y, strength, o); } catch (e) { /* rings saturated */ }
  };

  world.sfx = (key, x, y) => {
    if (!key) return;
    const a = ctx.audio;
    if (a && a.sfx) a.sfx(key, { x, y });
  };

  world.materialFx = (mat, x, y, dirX, dirY, strength) => {
    if (mat < 0 || mat === undefined) return;
    const m = MAT[mat];
    const s = strength === undefined ? 1 : strength;
    const nx = dirX || 0, ny = dirY === undefined ? -1 : dirY;
    P.emit({
      x, y, count: Math.max(2, Math.round(5 * s)),
      vx: -nx, vy: -ny, vSpread: 1.1, speed: 180 * s + 60, speedVar: 200 * s,
      life: 0.55, lifeVar: 0.4, size: 7 * s, sizeEnd: 1,
      color: [m.chip[0], m.chip[1], m.chip[2], 1], color2: [m.chip[0] * 0.4, m.chip[1] * 0.3, m.chip[2] * 0.3, 0],
      gravity: 1400, drag: 1.2, collide: true, bounce: 0.3, stretch: m.sparks ? 1.6 : 0,
      add: m.sparks > 0, glow: m.glow * 0.4,
    });
    if (m.dustScale > 0.2) {
      P.emit({
        x, y, count: Math.max(1, Math.round(3 * s * m.dustScale)),
        vx: -nx, vy: -ny, vSpread: 1.4, speed: 60 * s, speedVar: 90,
        life: 0.9 * s, lifeVar: 0.5, size: 14 * s * m.dustScale, sizeEnd: 60 * s * m.dustScale,
        color: [m.dust[0], m.dust[1], m.dust[2], 0.30], color2: [m.dust[0] * 0.3, m.dust[1] * 0.3, m.dust[2] * 0.35, 0],
        gravity: -20, drag: 2.4, fadeIn: 0.15,
      });
    }
    if (m.sparks > 0.5) {
      P.emit({
        x, y, count: Math.round(4 * s * m.sparks), vx: -nx, vy: -ny, vSpread: 0.9,
        speed: 420 * s, speedVar: 300, life: 0.3, lifeVar: 0.2, size: 4, sizeEnd: 0.5,
        color: [1, 0.86, 0.5, 1], color2: [1, 0.3, 0.05, 0], gravity: 900, drag: 1.6,
        add: true, stretch: 2.2, collide: true, killOnHit: true, glow: 0.3,
      });
    }
  };

  world.debrisImpact = (b) => {
    const m = MAT[b.mat];
    P.emit({
      x: b.x, y: b.y + b.hh, count: 2, vx: 0, vy: -1, vSpread: 1.4, speed: 60, speedVar: 60,
      life: 0.5, lifeVar: 0.3, size: 8, sizeEnd: 28,
      color: [m.dust[0], m.dust[1], m.dust[2], 0.28], color2: [0, 0, 0, 0], gravity: 100, drag: 3,
    });
    world.sfx(m.sfx.debris, b.x, b.y);
  };

  /* ------------------------------------------------------------------ *
   * Terrain queries
   * ------------------------------------------------------------------ */
  world.solidAt = (x, y) => world.terrain.solidAtWorld(x, y) || world.debris.solidAt(x, y);
  world.materialAt = (x, y) => world.terrain.materialAtWorld(x, y);
  world.solidBox = (x, y, w, h) => world.terrain.solidBox(x, y, w, h);
  world.groundY = (x, fromY, maxDist) => world.terrain.groundY(x, fromY, maxDist);
  world.ceilingY = (x, fromY, maxDist) => world.terrain.ceilingY(x, fromY, maxDist);
  world.lineOfSight = (x0, y0, x1, y1) => world.terrain.ray(x0, y0, x1, y1, 10) < 0;

  world.onTerrainChanged = (x, y, r) => {
    world.props.checkGround(x, y, r);
    world.debris.markRubbleDirty();
  };

  /* ------------------------------------------------------------------ *
   * Flat aliases. Other modules should not have to know which subsystem
   * owns a thing — `world.addProp` reads better than `world.props.add`.
   * ------------------------------------------------------------------ */
  world.addProp = (id, x, yBottom, o) => world.props.add(id, x, yBottom, o);
  world.addTree = (kind, x, yBottom, o) => world.props.addTree(kind, x, yBottom, o);
  world.damageProp = (p, amount, type, o) => world.props.damage(p, amount, type, o);
  world.breakProp = (p, cause) => world.props.break(p, cause);
  world.despawnProp = (p) => world.props.despawn(p);
  world.igniteProp = (p, strength) => world.props.ignite(p, strength);
  world.collapse = (p, delay) => world.props.collapse(p, delay);
  world.topple = (p, dir) => world.props.topple(p, dir);
  world.linkSupport = (a, b) => world.props.link(a, b);
  world.solveSupport = () => world.props.solve();
  world.supportEdges = (out) => world.props.edges(out);
  world.defineProp = (id, def) => world.props.defs.set(id, def);
  world.spawnDebris = (o) => world.debris.spawn(o);
  world.burstDebris = (x, y, mat, n, o) => world.debris.burst(x, y, mat, n, o);
  world.shoveDebris = (x, y, r, force) => world.debris.shove(x, y, r, force);
  world.clearDebris = () => world.debris.clear();
  Object.defineProperty(world, 'rubbleTop', { get() { return world.debris.rubble; } });

  /* ------------------------------------------------------------------ *
   * Entities
   * ------------------------------------------------------------------ */
  world.spawn = (o) => world.ents.spawn(o);
  world.despawn = (e) => world.ents.despawn(e);
  world.each = (kind, fn) => world.ents.each(kind, fn);
  Object.defineProperty(world, 'entities', { get() { return world.ents.live; } });
  Object.defineProperty(world, 'count', { get() { return world.ents.live.length; } });
  Object.defineProperty(world, 'debrisCount', { get() { return world.debris.count; } });

  world.kill = (e, cause) => {
    if (!e || !e.alive || e.dead || e.killed) return;
    // The player is not despawned, so `dead` never latches for him and every
    // subsequent damage tick — a burn, a fire cell — killed him again: another
    // `player:died`, another death overlay, another flash, another death sfx,
    // forever. `killed` is the latch that says onDeath has already run.
    e.killed = true;
    e.hp = 0;
    if (e.onDeath) { try { e.onDeath(e, cause || 'killed'); } catch (err) { console.error(err); } }
    if (e.kind === 'enemy') {
      bus.emit('enemy:died', { entity: e, x: e.x, y: e.y, kind: e.kind, tag: e.tag, src: cause });
      world.materialFx(e.material, e.x, e.y, 0, -1, 1.2);
    }
    if (e.kind !== 'player') world.ents.despawn(e);
  };

  /* ------------------------------------------------------------------ *
   * Damage
   * ------------------------------------------------------------------ */
  const NO_OPTS = {};

  world.damage = (target, amount, type, o) => {
    if (!target || amount <= 0) return 0;
    o = o || NO_OPTS;
    if (target.def) return world.props.damage(target, amount, type, o);   // a prop
    const e = target;
    if (!e.alive || e.dead || e.killed) return 0;
    if (o.src && o.src === e) return 0;
    if (o.src && o.src.owner === e) return 0;

    const t = dmgType(type);
    if (t === DAMAGE.LIFE) {
      const heal = Math.min(amount, e.maxHp - e.hp);
      e.hp += heal;
      if (heal > 0) P.emit({
        x: e.x, y: e.y, count: 4, speed: 60, life: 0.7, size: 8, sizeEnd: 1,
        color: [0.6, 1, 0.7, 1], color2: [0.1, 0.4, 0.2, 0], gravity: -140, add: true,
      });
      return heal;
    }

    if (e.invuln > 0 && !o.ignoreInvuln) return 0;
    let applied = amount * resistOf(e.material, t);
    if (e.status[STATUS.SHIELD] > 0) applied *= 1 - Math.min(0.9, e.power[STATUS.SHIELD]);
    if (t === DAMAGE.LIGHTNING && e.status[STATUS.WET] > 0) applied *= 2;
    if (t === DAMAGE.FIRE && e.status[STATUS.WET] > 0) applied *= 0.4;
    if (e.onDamage) {
      const r = e.onDamage(e, applied, t, o.src);
      if (typeof r === 'number') applied = r;
    }
    if (applied <= 0) return 0;

    e.hp -= applied;
    if (!o.noFlash) e.hitFlash = 1;
    if (o.stagger) world.applyStatus(e, STATUS.STUN, o.stagger, 1);
    if (o.status !== undefined && o.status !== null) {
      world.applyStatus(e, o.status, o.statusTime || 2, o.statusPower === undefined ? 1 : o.statusPower);
    }
    // `noIgnite` is what stops burn from feeding itself: the burn tick IS fire
    // damage, so without it every tick re-armed the 2.5s timer and nothing
    // flammable — the player included — could ever stop burning.
    if (t === DAMAGE.FIRE && e.flammable > 0 && !o.noIgnite) world.applyStatus(e, STATUS.BURN, 2.5, 1);

    const hx = o.hitX === undefined ? e.x : o.hitX;
    const hy = o.hitY === undefined ? e.y : o.hitY;
    if (o.force) world.knockback(e, o.dirX || 0, o.dirY || 0, o.force);
    if (!o.quiet) world.materialFx(e.material, hx, hy, o.dirX || 0, o.dirY === undefined ? -1 : o.dirY, 0.5 + Math.min(1.4, applied * 0.02));

    if (e.kind === 'player') {
      bus.emit('player:damage', { amount: applied, type: t, hp: e.hp, maxHp: e.maxHp, src: o.src, x: e.x, y: e.y });
      // A damage-over-time tick must not hand out i-frames, or standing in fire
      // made Rook immune to everything else on screen.
      if (!o.noIframe) e.invuln = Math.max(e.invuln, 0.55);
    }
    if (e.hp <= 0) world.kill(e, o.src ? 'attack' : 'damage');
    return applied;
  };

  const areaBuf = [];
  const areaProps = [];
  world.damageArea = (x, y, radius, amount, type, o) => {
    o = o || NO_OPTS;
    const t = dmgType(type);
    const falloff = o.falloff === undefined ? 1 : o.falloff;
    const hits = world.lastHits;
    hits.length = 0;

    world.queryRadius(x, y, radius, {
      team: o.team === undefined ? -1 : o.team,
      exclude: o.exclude, targetable: true, max: o.maxTargets || 64, los: !!o.los, sort: false,
    }, areaBuf);
    for (let i = 0; i < areaBuf.length; i++) {
      const e = areaBuf[i];
      const dx = e.x - x, dy = e.y - y;
      const d = Math.hypot(dx, dy) || 1;
      const k = falloff === 0 ? 1 : Math.max(0, 1 - Math.pow(d / radius, falloff));
      const applied = world.damage(e, amount * k, t, {
        src: o.src, hitX: x + dx * 0.4, hitY: y + dy * 0.4, dirX: dx / d, dirY: dy / d,
        force: (o.force || 0) * k, status: o.status, statusTime: o.statusTime, statusPower: o.statusPower,
        stagger: o.stagger, ignoreInvuln: o.ignoreInvuln,
      });
      if (applied > 0) hits.push({ what: 'entity', entity: e, x: e.x, y: e.y, material: e.material, amount: applied });
    }

    if (o.props !== false) {
      world.props.query(x, y, radius, areaProps);
      for (let i = 0; i < areaProps.length; i++) {
        const p = areaProps[i];
        const dx = p.x - x, dy = p.y - y;
        const d = Math.hypot(dx, dy) || 1;
        const k = falloff === 0 ? 1 : Math.max(0.15, 1 - Math.pow(Math.min(1, d / radius), falloff));
        const applied = world.props.damage(p, amount * k, t, { hitX: x, hitY: y, dirX: dx / d, dirY: dy / d, src: o.src });
        if (applied > 0) hits.push({ what: 'prop', prop: p, x: p.x, y: p.y, material: p.material, amount: applied });
      }
    }

    if (o.terrain) {
      const tr = radius * (o.terrainScale === undefined ? 0.7 : o.terrainScale);
      const cells = world.terrain.damage(x, y, tr, amount * 0.9, t, { debris: 1, dust: 1 });
      if (cells) hits.push({ what: 'terrain', x, y, cells, material: world.materialAt(x, y) });
    }

    if (o.debris !== false && o.force) world.debris.shove(x, y, radius, o.force * 0.5);
    if (t === DAMAGE.FIRE && o.igniteChance !== 0) world.surfaces.ignite(x, y, radius * 0.7, o.igniteChance || 0.8);

    return hits.length;
  };

  world.explode = (x, y, o) => {
    o = o || NO_OPTS;
    const radius = o.radius === undefined ? 180 : o.radius;
    const dmg = o.damage === undefined ? 40 : o.damage;
    const type = o.type === undefined ? 'impact' : o.type;
    const t = dmgType(type);
    const k = Math.min(2, radius / 180);

    world.damageArea(x, y, radius, dmg, t, {
      src: o.src, force: o.force === undefined ? 900 : o.force,
      terrain: o.terrain !== false, terrainScale: o.terrainScale === undefined ? 0.55 : o.terrainScale,
      props: o.props !== false, falloff: 1, team: o.team, exclude: o.exclude,
      igniteChance: o.igniteChance,
    });

    const hot = t === DAMAGE.FIRE;
    const col = hot ? [1, 0.82, 0.42, 1] : t === DAMAGE.ACID ? [0.7, 1, 0.35, 1]
      : t === DAMAGE.LIGHTNING ? [0.75, 0.88, 1, 1] : t === DAMAGE.VOID ? [0.75, 0.45, 1, 1] : [0.9, 0.85, 0.78, 1];

    if (o.sparks !== 0) P.emit({
      x, y, count: Math.round(60 * k), speed: 700 * k, speedVar: 500, life: 0.55, lifeVar: 0.4,
      size: 18, sizeEnd: 1, color: col, color2: [col[0] * 0.5, col[1] * 0.15, col[2] * 0.08, 0],
      gravity: 1100, drag: 2.4, add: true, glow: 0.5, stretch: 1.5, collide: true, bounce: 0.3,
    });
    if (o.dust !== 0) P.emit({
      x, y, count: Math.round(26 * k), speed: 200 * k, speedVar: 180, life: 1.6, lifeVar: 0.9,
      size: 42, sizeEnd: 200 * k, color: [0.45, 0.42, 0.40, 0.32], color2: [0.14, 0.14, 0.17, 0],
      gravity: -60, drag: 1.5, fadeIn: 0.12,
    });
    if (o.light !== 0) R.light({ x, y, radius: radius * 4, r: col[0], g: col[1], b: col[2], intensity: 3 * k });
    world.shockwave(x, y, 0.7 * k);
    if (o.shake !== 0) R.fx.shake((o.shake === undefined ? 0.5 : o.shake) * k, 0.5);
    if (o.hitstop !== 0) R.fx.timeScale(0.06, o.hitstop === undefined ? 0.05 : o.hitstop);
    if (o.flash !== 0) R.fx.flash(col[0], col[1], col[2], (o.flash === undefined ? 0.14 : o.flash) * k, 0.12);
    R.fx.chroma(0.5 * k, 0.25);
    world.debris.shove(x, y, radius * 1.6, 500 * k);
    world.sfx(hot ? 'explode_fire' : 'explode', x, y);
  };

  /* ------------------------------------------------------------------ *
   * Statuses
   * ------------------------------------------------------------------ */
  world.applyStatus = (e, id, seconds, power) => {
    const i = statusId(id);
    if (i < 0 || !e || !e.alive) return;
    if (i === STATUS.BURN && e.status[STATUS.WET] > 0) return;
    e.status[i] = Math.max(e.status[i], seconds);
    e.power[i] = Math.max(e.power[i], power === undefined ? 1 : power);
    if (i === STATUS.BURN) e.burning = e.status[i];
    if (i === STATUS.WET) { e.status[STATUS.BURN] = 0; e.burning = 0; }
  };
  world.hasStatus = (e, id) => { const i = statusId(id); return i < 0 ? 0 : e.status[i]; };
  world.statusPower = (e, id) => { const i = statusId(id); return i < 0 ? 0 : e.power[i]; };
  world.clearStatus = (e, id) => { const i = statusId(id); if (i >= 0) { e.status[i] = 0; e.power[i] = 0; if (i === STATUS.BURN) e.burning = 0; } };

  world.knockback = (e, dx, dy, force) => {
    if (!e || !e.alive) return;
    const l = Math.hypot(dx, dy) || 1;
    const k = force / Math.max(0.25, e.mass);
    e.vx += (dx / l) * k;
    e.vy += (dy / l) * k - k * 0.15;
  };

  /* ------------------------------------------------------------------ *
   * Queries
   * ------------------------------------------------------------------ */
  const Q_DEFAULT = {};
  function pass(e, o, x, y) {
    if (!e.alive || e.dead) return false;
    if (o.exclude && e === o.exclude) return false;
    if (o.targetable !== false) {
      if (e.kind === 'corpse' || e.kind === 'effect' || e.kind === 'pickup') return false;
      if (e.hp <= 0) return false;
    }
    if (o.team !== undefined && o.team >= 0 && e.team !== o.team) return false;
    if (o.kind) {
      if (typeof o.kind === 'string') { if (e.kind !== o.kind) return false; }
      else if (o.kind.indexOf(e.kind) < 0) return false;
    }
    if (o.tag && e.tag !== o.tag) return false;
    if (o.los && !world.lineOfSight(x, y, e.x, e.y)) return false;
    return true;
  }

  const distBuf = [];
  function sortByDist(out, x, y) {
    distBuf.length = out.length;
    for (let i = 0; i < out.length; i++) distBuf[i] = (out[i].x - x) * (out[i].x - x) + (out[i].y - y) * (out[i].y - y);
    for (let i = 1; i < out.length; i++) {
      const e = out[i], dd = distBuf[i];
      let j = i - 1;
      while (j >= 0 && distBuf[j] > dd) { out[j + 1] = out[j]; distBuf[j + 1] = distBuf[j]; j--; }
      out[j + 1] = e; distBuf[j + 1] = dd;
    }
  }

  world.queryRadius = (x, y, r, o, out) => {
    o = o || Q_DEFAULT;
    out = out || [];
    out.length = 0;
    const r2 = r * r;
    const live = world.ents.live;
    const max = o.max || 64;
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      const cx = Math.max(e.x - e.w * 0.5, Math.min(x, e.x + e.w * 0.5));
      const cy = Math.max(e.y - e.h * 0.5, Math.min(y, e.y + e.h * 0.5));
      const dx = cx - x, dy = cy - y;
      if (dx * dx + dy * dy > r2) continue;
      if (!pass(e, o, x, y)) continue;
      out.push(e);
      if (out.length >= max) break;
    }
    if (o.sort !== false) sortByDist(out, x, y);
    return out;
  };

  world.queryBox = (x, y, w, h, o, out) => {
    o = o || Q_DEFAULT;
    out = out || [];
    out.length = 0;
    const l = x - w * 0.5, r = x + w * 0.5, t = y - h * 0.5, b = y + h * 0.5;
    const live = world.ents.live;
    const max = o.max || 64;
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      if (e.x + e.w * 0.5 < l || e.x - e.w * 0.5 > r || e.y + e.h * 0.5 < t || e.y - e.h * 0.5 > b) continue;
      if (!pass(e, o, x, y)) continue;
      out.push(e);
      if (out.length >= max) break;
    }
    if (o.sort === true) sortByDist(out, x, y);
    return out;
  };

  const nearBuf = [];
  world.nearest = (x, y, r, o) => {
    world.queryRadius(x, y, r, o, nearBuf);
    return nearBuf.length ? nearBuf[0] : null;
  };
  const ENEMY_Q = { team: 1, targetable: true, max: 32 };
  world.nearestEnemy = (x, y, r) => world.nearest(x, y, r, ENEMY_Q);

  world.queryProps = (x, y, r, out) => world.props.query(x, y, r, out);
  world.propAt = (x, y) => world.props.at(x, y);

  /* ---- raycast / sweep, sharing one hit record ---- */
  const hit = {
    what: '', entity: null, prop: null, debris: null,
    x: 0, y: 0, nx: 0, ny: 0, dist: 0, t: 0, material: -1, cellX: 0, cellY: 0,
  };
  world.hit = hit;

  const RAY_DEFAULT = { entities: true, props: true, terrain: true, step: 6, team: -1 };

  world.raycast = (x, y, dx, dy, maxDist, o) => {
    o = o || RAY_DEFAULT;
    const l = Math.hypot(dx, dy) || 1;
    return world.sweep(x, y, x + dx / l * maxDist, y + dy / l * maxDist, o);
  };

  world.sweep = (x0, y0, x1, y1, o) => {
    o = o || RAY_DEFAULT;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const step = o.step || 6;
    const rad = o.radius || 0;
    const n = Math.max(1, Math.ceil(len / step));
    const live = world.ents.live;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const px = x0 + dx * t, py = y0 + dy * t;

      if (o.terrain !== false && world.terrain.solidAtWorld(px, py)) {
        hit.what = 'terrain';
        hit.entity = null; hit.prop = null; hit.debris = null;
        hit.x = px; hit.y = py;
        hit.cellX = world.terrain.toCellX(px); hit.cellY = world.terrain.toCellY(py);
        hit.material = world.terrain.matAt(hit.cellX, hit.cellY);
        normalFromTerrain(px, py, dx, dy);
        hit.dist = len * t; hit.t = t;
        return hit;
      }
      if (o.props !== false) {
        const p = world.props.at(px, py);
        if (p && p.state !== 'settled' && p.state !== 'gone') {
          hit.what = 'prop'; hit.prop = p; hit.entity = null; hit.debris = null;
          hit.x = px; hit.y = py; hit.material = p.material;
          hit.nx = -dx / (len || 1); hit.ny = -dy / (len || 1);
          hit.dist = len * t; hit.t = t;
          return hit;
        }
      }
      if (o.entities !== false) {
        for (let k = 0; k < live.length; k++) {
          const e = live[k];
          if (!e.alive || e.dead) continue;
          if (o.exclude && e === o.exclude) continue;
          if (e.kind === 'projectile' || e.kind === 'effect' || e.kind === 'corpse') continue;
          if (o.team !== undefined && o.team >= 0 && e.team !== o.team) continue;
          if (Math.abs(px - e.x) > e.w * 0.5 + rad || Math.abs(py - e.y) > e.h * 0.5 + rad) continue;
          hit.what = 'entity'; hit.entity = e; hit.prop = null; hit.debris = null;
          hit.x = px; hit.y = py; hit.material = e.material;
          hit.nx = -dx / (len || 1); hit.ny = -dy / (len || 1);
          hit.dist = len * t; hit.t = t;
          return hit;
        }
      }
    }
    return null;
  };

  function normalFromTerrain(px, py, dx, dy) {
    const T = world.terrain;
    const s = T.cell;
    const l = T.solidAtWorld(px - s, py) ? 1 : 0;
    const r = T.solidAtWorld(px + s, py) ? 1 : 0;
    const u = T.solidAtWorld(px, py - s) ? 1 : 0;
    const dn = T.solidAtWorld(px, py + s) ? 1 : 0;
    let nx = l - r, ny = u - dn;
    if (nx === 0 && ny === 0) { const m = Math.hypot(dx, dy) || 1; nx = -dx / m; ny = -dy / m; }
    const m = Math.hypot(nx, ny) || 1;
    hit.nx = nx / m; hit.ny = ny / m;
  }

  /* ------------------------------------------------------------------ *
   * Player helpers
   * ------------------------------------------------------------------ */
  const castOut = { x: 0, y: 0 };
  world.castOrigin = (out) => {
    const o = out || castOut;
    const p = world.player;
    o.x = p ? p.x : 0;
    o.y = p ? p.y - 26 : 0;
    return o;
  };
  world.setPlayerSpawn = (x, y) => { world.spawnX = x; world.spawnY = y; };
  world.respawn = () => {
    const p = world.player;
    if (!p) return;
    p.hp = p.maxHp; p.x = world.spawnX; p.y = world.spawnY;
    p.px = p.x; p.py = p.y; p.vx = 0; p.vy = 0;
    p.status.fill(0); p.power.fill(0); p.burning = 0;
    p.killed = false;
    p.data.state = 'idle';
    p.invuln = Math.max(p.invuln, 1.2);
    world.playerControl = true;
  };

  /* ------------------------------------------------------------------ *
   * Tick
   * ------------------------------------------------------------------ */
  world.update = (dt) => {
    world.time += dt;
    world.frame++;

    const pl = world.player;
    if (pl && pl.alive) {
      pl.age += dt;
      if (pl.hitFlash > 0) pl.hitFlash = Math.max(0, pl.hitFlash - dt * 5);
      if (pl.invuln > 0) pl.invuln -= dt;
      updatePlayer(world, pl, dt);
    }

    const live = world.ents.live;
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      if (!e.alive || e.dead || e === world.player) continue;
      e.px = e.x; e.py = e.y;
      e.age += dt;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
      if (e.invuln > 0) e.invuln -= dt;

      tickStatus(e, dt);

      if (e.onUpdate) { try { e.onUpdate(e, dt); } catch (err) { console.error(err); } }
      if (!e.alive || e.dead) continue;

      if (e.collides || e.gravity) {
        if (e.gravity) { e.vy += world.gravity * e.gravity * dt; if (e.vy > e.maxFall) e.vy = e.maxFall; }
        if (e.drag) { const k = 1 / (1 + e.drag * dt); e.vx *= k; e.vy *= k; }
        const wasG = e.onGround;
        const preVy = e.vy;
        if (e.collides && !e.trigger) {
          moveBody(world, e, dt);
          if (e.onGround && !wasG && e.onLand) e.onLand(e, preVy);
          if ((e.hitX || e.hitY) && e.onHit) e.onHit(e, hit);
        } else {
          e.x += e.vx * dt; e.y += e.vy * dt;
        }
        if (e.onGround && e.friction) {
          e.vx = e.vx > 0 ? Math.max(0, e.vx - e.friction * dt) : Math.min(0, e.vx + e.friction * dt);
        }
        e.wasGround = wasG;
      }

      if (e.life > 0 && e.age > e.life) world.ents.despawn(e);
      if (e.y > world.bounds.y1 + 600) {
        if (e.kind === 'player') { world.damage(e, 40, DAMAGE.IMPACT, { ignoreInvuln: true }); world.respawn(); }
        else world.ents.despawn(e);
      }
    }

    if (world.player && world.player.alive) tickStatus(world.player, dt);

    world.props.update(dt);
    world.debris.update(dt);
    world.surfaces.update(dt);
    // world.render() draws the particles but nothing ticked them: every spark,
    // every bolt trail and every ember hung in the air exactly where it was
    // emitted, forever, until the pool filled. Only the demo scene ever called
    // this, which is why it was never seen in the harnesses.
    P.update(dt);
    world.ents.flush();

    world.stats.entities = world.ents.live.length;
    world.stats.props = world.props.count;
    world.stats.debris = world.debris.count;
    world.stats.awake = world.debris.awake;
    world.stats.surfaceCells = world.surfaces.total();
  };

  function tickStatus(e, dt) {
    const s = e.status;
    if (s[STATUS.BURN] > 0) {
      s[STATUS.BURN] -= dt;
      e.burning = s[STATUS.BURN];
      // Asymmetric on purpose: burn is a damage source the player *builds around*
      // (emberbolt is the starting spell), so it has to stay lethal on enemies
      // while a brush with your own fire costs a slice of health, not the run.
      world.damage(e, (e.kind === 'player' ? 9 : 14) * e.power[STATUS.BURN] * dt, DAMAGE.FIRE, BURN_OPTS);
      if (world.frame % 3 === (e.slot & 3)) {
        P.emit({
          x: e.x + rng.spread(e.w * 0.4), y: e.y + rng.spread(e.h * 0.4), count: 1,
          vx: 0, vy: -1, vSpread: 0.4, speed: 90, speedVar: 60, life: 0.5, lifeVar: 0.3,
          size: 14, sizeEnd: 1, color: [1, 0.7, 0.3, 0.9], color2: [0.6, 0.1, 0.02, 0],
          gravity: -200, add: true, glow: 0.25,
        });
      }
      if (s[STATUS.BURN] <= 0) e.burning = 0;
    }
    for (let i = 1; i < STATUS_COUNT; i++) if (s[i] > 0) { s[i] -= dt; if (s[i] <= 0) e.power[i] = 0; }
  }
  const BURN_OPTS = { quiet: true, noFlash: true, ignoreInvuln: true, noIgnite: true, noIframe: true };

  /* ------------------------------------------------------------------ *
   * Render
   * ------------------------------------------------------------------ */
  world.render = (alpha) => {
    world.stats.chunksDrawn = world.terrain.render(R, LAYER, world.cam.x, world.cam.y, world.halfW + 64, world.halfH + 64);
    world.props.render(R, LAYER, alpha);
    world.debris.render(R, LAYER, alpha);

    const live = world.ents.live;
    for (let i = 0; i < live.length; i++) {
      const e = live[i];
      if (!e.alive || e === world.player) continue;
      if (e.render) { try { e.render(e, alpha, R); } catch (err) { console.error(err); } }
    }
    if (world.player && world.player.alive) renderPlayer(world, world.player, alpha);

    world.surfaces.render(R, LAYER, world.time);
    P.render();

    world.props.lights(R);
    world.surfaces.lights(R);
  };

  /* ------------------------------------------------------------------ *
   * Reset
   * ------------------------------------------------------------------ */
  world.reset = () => {
    world.ents.clear();
    world.props.clear();
    world.debris.clear();
    world.surfaces.clearAllCells();
    world.terrain.clear();
    world.player = null;
    world.time = 0; world.frame = 0;
    world.playerControl = true;
  };

  world.createPlayer = (x, y) => {
    world.player = createPlayer(world, x, y);
    world.setPlayerSpawn(x, y);
    return world.player;
  };

  return world;
}
