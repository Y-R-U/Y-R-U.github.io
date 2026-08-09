import { MATERIAL } from './materials.js';
import { STATUS_COUNT } from './status.js';

/**
 * Fixed-size entity pool. Slots are recycled, never allocated, and every field
 * exists on every slot from the start so the shape stays monomorphic. `data` is
 * a persistent per-slot object that is wiped on spawn — cheaper than making a
 * new one and it keeps the hidden class stable.
 */

function blank(i) {
  return {
    slot: i, id: 0, gen: 0, alive: false, dead: false,
    kind: 'custom', tag: null, team: 2,
    x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, w: 32, h: 32,
    hp: 1, maxHp: 1, material: MATERIAL.FLESH,
    gravity: 1, drag: 0, bounce: 0, friction: 0, maxFall: 1800,
    collides: true, trigger: false, ignoreOneWay: false, ignoreProps: false, stepUp: 0,
    onGround: false, wasGround: false, onWall: 0, hitX: 0, hitY: 0,
    groundMat: MATERIAL.EARTH,
    faceX: 1, invuln: 0, hitFlash: 0, flammable: 0, burning: 0,
    life: 0, age: 0, mass: 1,
    owner: null, layer: 7,
    status: new Float32Array(STATUS_COUNT),
    power: new Float32Array(STATUS_COUNT),
    onUpdate: null, onHit: null, onDamage: null, onDeath: null, onLand: null, onDespawn: null, render: null,
    data: {},
  };
}

export function createEntityPool(world, cap = 2048) {
  const pool = new Array(cap);
  for (let i = 0; i < cap; i++) pool[i] = blank(i);
  const live = [];
  const freeList = [];
  for (let i = cap - 1; i >= 0; i--) freeList.push(i);
  let nextId = 1;
  const dying = [];

  function reset(e) {
    e.kind = 'custom'; e.tag = null; e.team = 2;
    e.vx = 0; e.vy = 0; e.w = 32; e.h = 32;
    e.hp = 1; e.maxHp = 1; e.material = MATERIAL.FLESH;
    e.gravity = 1; e.drag = 0; e.bounce = 0; e.friction = 0; e.maxFall = 1800;
    e.collides = true; e.trigger = false; e.ignoreOneWay = false; e.ignoreProps = false; e.stepUp = 0;
    e.onGround = false; e.wasGround = false; e.onWall = 0; e.hitX = 0; e.hitY = 0;
    e.groundMat = MATERIAL.EARTH;
    e.faceX = 1; e.invuln = 0; e.hitFlash = 0; e.flammable = 0; e.burning = 0;
    e.life = 0; e.age = 0; e.mass = 1; e.dead = false; e.killed = false;
    e.owner = null; e.layer = world.LAYER.ACTORS;
    e.status.fill(0); e.power.fill(0);
    e.onUpdate = null; e.onHit = null; e.onDamage = null; e.onDeath = null;
    e.onLand = null; e.onDespawn = null; e.render = null;
    for (const k in e.data) delete e.data[k];
  }

  const E = {
    cap, live,
    get count() { return live.length; },

    spawn(o) {
      const slot = freeList.pop();
      if (slot === undefined) return null;
      const e = pool[slot];
      reset(e);
      e.alive = true;
      e.gen++;
      e.id = nextId++;
      e.x = o.x || 0; e.y = o.y || 0; e.px = e.x; e.py = e.y;

      if (o.kind !== undefined) e.kind = o.kind;
      if (o.tag !== undefined) e.tag = o.tag;
      if (o.team !== undefined) e.team = o.team;
      if (o.w !== undefined) e.w = o.w;
      if (o.h !== undefined) e.h = o.h;
      if (o.vx !== undefined) e.vx = o.vx;
      if (o.vy !== undefined) e.vy = o.vy;
      if (o.hp !== undefined) { e.hp = o.hp; e.maxHp = o.maxHp === undefined ? o.hp : o.maxHp; }
      if (o.material !== undefined) e.material = o.material;
      if (o.gravity !== undefined) e.gravity = o.gravity;
      if (o.drag !== undefined) e.drag = o.drag;
      if (o.bounce !== undefined) e.bounce = o.bounce;
      if (o.friction !== undefined) e.friction = o.friction;
      if (o.maxFall !== undefined) e.maxFall = o.maxFall;
      if (o.collides !== undefined) e.collides = o.collides;
      if (o.trigger !== undefined) e.trigger = o.trigger;
      if (o.ignoreOneWay !== undefined) e.ignoreOneWay = o.ignoreOneWay;
      if (o.ignoreProps !== undefined) e.ignoreProps = o.ignoreProps;
      if (o.stepUp !== undefined) e.stepUp = o.stepUp;
      if (o.life !== undefined) e.life = o.life;
      if (o.invuln !== undefined) e.invuln = o.invuln;
      if (o.flammable !== undefined) e.flammable = o.flammable;
      if (o.faceX !== undefined) e.faceX = o.faceX;
      if (o.mass !== undefined) e.mass = o.mass;
      if (o.owner !== undefined) e.owner = o.owner;
      if (o.layer !== undefined) e.layer = o.layer;
      if (o.onUpdate) e.onUpdate = o.onUpdate;
      if (o.onHit) e.onHit = o.onHit;
      if (o.onDamage) e.onDamage = o.onDamage;
      if (o.onDeath) e.onDeath = o.onDeath;
      if (o.onLand) e.onLand = o.onLand;
      if (o.onDespawn) e.onDespawn = o.onDespawn;
      if (o.render) e.render = o.render;
      if (o.data) for (const k in o.data) e.data[k] = o.data[k];

      live.push(e);
      return e;
    },

    despawn(e) {
      if (!e || !e.alive || e.dead) return;
      e.dead = true;
      dying.push(e);
    },

    /** Deferred removal so callbacks can despawn freely mid-iteration. */
    flush() {
      for (let i = 0; i < dying.length; i++) {
        const e = dying[i];
        if (!e.alive) continue;
        if (e.onDespawn) { try { e.onDespawn(e); } catch (err) { console.error(err); } }
        e.alive = false;
        const k = live.indexOf(e);
        if (k >= 0) { live[k] = live[live.length - 1]; live.pop(); }
        freeList.push(e.slot);
      }
      dying.length = 0;
    },

    each(kind, fn) {
      for (let i = live.length - 1; i >= 0; i--) {
        const e = live[i];
        if (e.alive && !e.dead && (kind === null || e.kind === kind)) fn(e);
      }
    },

    clear() {
      for (let i = 0; i < live.length; i++) {
        const e = live[i];
        e.alive = false; e.dead = false;
        freeList.push(e.slot);
      }
      live.length = 0;
      dying.length = 0;
    },
  };

  return E;
}
