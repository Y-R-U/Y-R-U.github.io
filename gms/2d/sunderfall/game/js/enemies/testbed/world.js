/**
 * TEST-BED ONLY — a stand-in for `sim/`.
 *
 * B1-sim owns the real world; at the time this module was written `sim/index.js`
 * did not exist yet, and the enemy module still had to be provable on screen. This
 * is a faithful-enough implementation of the surface documented in `sim/API.md`:
 * entities, damage, queries, destructible terrain, props with a support graph,
 * debris, statuses and the surface/fluid layer.
 *
 * NOTHING in `enemies/` outside `testbed/` may import this. `enemy-test.html`
 * prefers the real sim and only falls back here.
 */

import { LAYER } from '../../gfx/renderer.js';
import { MATERIAL, MAT, DAMAGE, dmgType, resistOf, matByName } from '../../sim/materials.js';
import { STATUS, STATUS_COUNT, statusId } from '../../sim/status.js';

const CELL = 16;
const GRAV = 3000;

export function createTestWorld(ctx, opts = {}) {
  const { R, P, bus, rng } = ctx;

  const ox = opts.originX === undefined ? -2048 : opts.originX;
  const oy = opts.originY === undefined ? -2560 : opts.originY;
  const cw = opts.cols || 512;
  const ch = opts.rows || 240;

  const solidG = new Uint8Array(cw * ch);
  const matG = new Uint8Array(cw * ch);
  const hpG = new Float32Array(cw * ch);
  const charG = new Uint8Array(cw * ch);
  const oneWay = new Uint8Array(cw * ch);

  const toCellX = (x) => Math.floor((x - ox) / CELL);
  const toCellY = (y) => Math.floor((y - oy) / CELL);
  const cellWorldX = (cx) => ox + cx * CELL;
  const cellWorldY = (cy) => oy + cy * CELL;
  const inGrid = (cx, cy) => cx >= 0 && cy >= 0 && cx < cw && cy < ch;

  function cellSolid(cx, cy) { return inGrid(cx, cy) ? solidG[cy * cw + cx] === 1 : false; }

  /* ------------------------------------------------------------- entities */

  const CAP = opts.entityCap || 1024;
  const pool = [];
  const entities = [];
  const dead = [];
  let nextId = 1;

  function blank() {
    return {
      id: 0, gen: 0, alive: false, slot: 0,
      kind: 'custom', tag: null, team: 2,
      x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, w: 32, h: 32,
      hp: 1, maxHp: 1, material: MATERIAL.FLESH,
      gravity: 1, drag: 0, bounce: 0, friction: 0, collides: true,
      gridSolid: false, trigger: false, ignoreOneWay: false, maxFall: 1800,
      life: 0, invuln: 0, flammable: 0, faceX: 1,
      onGround: false, wasGround: false, onWall: 0,
      hitFlash: 0, burning: 0, groundMat: MATERIAL.EARTH,
      owner: null, layer: LAYER.ACTORS,
      status: new Float32Array(STATUS_COUNT), power: new Float32Array(STATUS_COUNT),
      data: {},
      onUpdate: null, onHit: null, onDamage: null, onDeath: null,
      onLand: null, onDespawn: null, render: null,
    };
  }
  for (let i = 0; i < CAP; i++) { const e = blank(); e.slot = i; pool.push(e); }

  function spawn(o) {
    const e = pool.pop();
    if (!e) return null;
    e.gen++;
    e.id = nextId++;
    e.alive = true;
    e.kind = o.kind || 'custom'; e.tag = o.tag || null;
    e.team = o.team === undefined ? 1 : o.team;
    e.x = o.x; e.y = o.y; e.px = o.x; e.py = o.y;
    e.vx = o.vx || 0; e.vy = o.vy || 0;
    e.w = o.w === undefined ? 32 : o.w; e.h = o.h === undefined ? 32 : o.h;
    e.hp = o.hp === undefined ? 1 : o.hp;
    e.maxHp = o.maxHp === undefined ? e.hp : o.maxHp;
    e.material = o.material === undefined ? MATERIAL.FLESH : o.material;
    e.gravity = o.gravity === undefined ? 1 : o.gravity;
    e.drag = o.drag || 0; e.bounce = o.bounce || 0; e.friction = o.friction || 0;
    e.collides = o.collides !== false;
    e.gridSolid = !!o.gridSolid; e.trigger = !!o.trigger; e.ignoreOneWay = !!o.ignoreOneWay;
    e.maxFall = o.maxFall || 1800;
    e.life = o.life || 0; e.invuln = o.invuln || 0;
    e.flammable = o.flammable || 0; e.faceX = o.faceX || 1;
    e.onGround = false; e.wasGround = false; e.onWall = 0;
    e.hitFlash = 0; e.burning = 0; e.groundMat = MATERIAL.EARTH;
    e.owner = o.owner || null; e.layer = o.layer === undefined ? LAYER.ACTORS : o.layer;
    e.status.fill(0); e.power.fill(0);
    for (const k in e.data) delete e.data[k];
    if (o.data) Object.assign(e.data, o.data);
    e.onUpdate = o.onUpdate || null; e.onHit = o.onHit || null;
    e.onDamage = o.onDamage || null; e.onDeath = o.onDeath || null;
    e.onLand = o.onLand || null; e.onDespawn = o.onDespawn || null;
    e.render = o.render || null;
    entities.push(e);
    return e;
  }

  function despawn(e) {
    if (!e || !e.alive) return;
    e.alive = false;
    dead.push(e);
  }

  function kill(e, cause) {
    if (!e || !e.alive) return;
    if (e.onDeath) e.onDeath(e, cause);
    if (e.kind === 'enemy') bus.emit('enemy:died', { entity: e, x: e.x, y: e.y, kind: e.kind, tag: e.tag, src: cause });
    despawn(e);
  }

  function flush() {
    for (let i = 0; i < dead.length; i++) {
      const e = dead[i];
      if (e.onDespawn) e.onDespawn(e);
      const idx = entities.indexOf(e);
      if (idx >= 0) entities.splice(idx, 1);
      pool.push(e);
    }
    dead.length = 0;
  }

  function each(kind, fn) {
    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i];
      if (e.alive && (!kind || e.kind === kind)) fn(e);
    }
  }

  /* ------------------------------------------------------------- collision */

  function solidCellAt(x, y) {
    const cx = toCellX(x), cy = toCellY(y);
    return cellSolid(cx, cy);
  }

  function rubbleAt(x, y) {
    const col = Math.floor((x - ox) / CELL);
    const top = rubbleTop[col];
    return top !== undefined && top < 1e8 && y >= top;
  }

  function solidAt(x, y) {
    if (solidCellAt(x, y)) return true;
    if (rubbleAt(x, y)) return true;
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (p.alive && p.solid && x > p.left && x < p.right && y > p.top && y < p.bottom) return true;
    }
    return false;
  }

  function solidBox(x, y, w, h) {
    const x0 = x - w * 0.5 + 1, x1 = x + w * 0.5 - 1;
    const y0 = y - h * 0.5 + 1, y1 = y + h * 0.5 - 1;
    const cx0 = toCellX(x0), cx1 = toCellX(x1), cy0 = toCellY(y0), cy1 = toCellY(y1);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) if (cellSolid(cx, cy)) return true;
    }
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (p.alive && p.solid && x1 > p.left && x0 < p.right && y1 > p.top && y0 < p.bottom) return true;
    }
    const col0 = Math.floor((x0 - ox) / CELL), col1 = Math.floor((x1 - ox) / CELL);
    for (let c = col0; c <= col1; c++) {
      const top = rubbleTop[c];
      if (top !== undefined && top < 1e8 && y1 > top) return true;
    }
    return false;
  }

  function groundY(x, fromY, maxDist) {
    const md = maxDist === undefined ? 400 : maxDist;
    for (let d = 0; d <= md; d += 4) {
      const y = fromY + d;
      if (solidAt(x, y)) return Math.floor(y / 4) * 4;
    }
    return NaN;
  }

  function ceilingY(x, fromY, maxDist) {
    const md = maxDist === undefined ? 400 : maxDist;
    for (let d = 0; d <= md; d += 4) {
      const y = fromY - d;
      if (solidAt(x, y)) return y;
    }
    return NaN;
  }

  function lineOfSight(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(2, Math.ceil(Math.hypot(dx, dy) / 10));
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (solidCellAt(x0 + dx * t, y0 + dy * t)) return false;
    }
    return true;
  }

  const hit = {
    what: '', entity: null, prop: null, debris: null,
    x: 0, y: 0, nx: 0, ny: 0, dist: 0, t: 0, material: 0, cellX: 0, cellY: 0,
  };

  function raycast(x, y, dirX, dirY, maxDist, o) {
    const opt = o || {};
    const step = opt.step || 6;
    const wantE = opt.entities !== false, wantP = opt.props !== false, wantT = opt.terrain !== false;
    const n = Math.ceil(maxDist / step);
    for (let i = 1; i <= n; i++) {
      const d = i * step;
      const px = x + dirX * d, py = y + dirY * d;
      if (wantT && solidCellAt(px, py)) {
        hit.what = 'terrain'; hit.entity = null; hit.prop = null;
        hit.x = px; hit.y = py; hit.nx = -dirX; hit.ny = -dirY; hit.dist = d; hit.t = d / maxDist;
        hit.cellX = toCellX(px); hit.cellY = toCellY(py);
        hit.material = matG[hit.cellY * cw + hit.cellX] || MATERIAL.EARTH;
        return hit;
      }
      if (wantP) {
        const p = propAt(px, py);
        if (p && p.solid) {
          hit.what = 'prop'; hit.prop = p; hit.entity = null;
          hit.x = px; hit.y = py; hit.nx = -dirX; hit.ny = -dirY; hit.dist = d; hit.t = d / maxDist;
          hit.material = p.material;
          return hit;
        }
      }
      if (wantE) {
        for (let k = 0; k < entities.length; k++) {
          const e = entities[k];
          if (!e.alive || e === opt.exclude || e.kind === 'effect' || e.kind === 'corpse') continue;
          if (opt.team !== undefined && opt.team >= 0 && e.team !== opt.team) continue;
          if (Math.abs(px - e.x) < e.w * 0.5 && Math.abs(py - e.y) < e.h * 0.5) {
            hit.what = 'entity'; hit.entity = e; hit.prop = null;
            hit.x = px; hit.y = py; hit.nx = -dirX; hit.ny = -dirY; hit.dist = d; hit.t = d / maxDist;
            hit.material = e.material;
            return hit;
          }
        }
      }
    }
    return null;
  }

  function sweep(x0, y0, x1, y1, o) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-4) return null;
    return raycast(x0, y0, dx / len, dy / len, len, o);
  }

  /* --------------------------------------------------------------- queries */

  const _out = [];
  function queryRadius(x, y, r, o, out) {
    const res = out || _out;
    res.length = 0;
    const opt = o || {};
    const r2 = r * r;
    const kinds = opt.kind;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e.alive || e === opt.exclude) continue;
      if (opt.team !== undefined && opt.team >= 0 && e.team !== opt.team) continue;
      if (kinds) {
        if (typeof kinds === 'string') { if (e.kind !== kinds) continue; }
        else if (kinds.indexOf(e.kind) < 0) continue;
      }
      if (opt.tag && e.tag !== opt.tag) continue;
      if (opt.targetable !== false && !kinds) {
        if (e.kind === 'corpse' || e.kind === 'pickup' || e.kind === 'effect' || e.hp <= 0) continue;
      }
      const ddx = e.x - x, ddy = e.y - y;
      if (ddx * ddx + ddy * ddy > r2) continue;
      if (opt.los && !lineOfSight(x, y, e.x, e.y)) continue;
      res.push(e);
      if (res.length >= (opt.max || 64)) break;
    }
    if (opt.sort !== false) res.sort((a, b) => ((a.x - x) ** 2 + (a.y - y) ** 2) - ((b.x - x) ** 2 + (b.y - y) ** 2));
    return res;
  }

  function queryBox(x, y, w, h, o, out) {
    const res = out || _out;
    res.length = 0;
    const opt = o || {};
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (!e.alive || e === opt.exclude) continue;
      if (opt.team !== undefined && opt.team >= 0 && e.team !== opt.team) continue;
      if (opt.kind && e.kind !== opt.kind) continue;
      if (opt.targetable !== false && !opt.kind &&
        (e.kind === 'corpse' || e.kind === 'pickup' || e.kind === 'effect' || e.hp <= 0)) continue;
      if (Math.abs(e.x - x) > (w + e.w) * 0.5 || Math.abs(e.y - y) > (h + e.h) * 0.5) continue;
      res.push(e);
    }
    return res;
  }

  const _n1 = [];
  function nearest(x, y, r, o) {
    const list = queryRadius(x, y, r, o, _n1);
    return list.length ? list[0] : null;
  }
  function nearestEnemy(x, y, r) { return nearest(x, y, r, { team: 1, targetable: true }); }

  /* ----------------------------------------------------------------- props */

  const props = [];
  const manifest = (ctx.assets && ctx.assets.manifest) || null;
  const propDefs = Object.create(null);
  if (manifest && manifest.materials) {
    for (const id in manifest.materials) {
      const m = manifest.materials[id];
      propDefs[id] = {
        id, material: matByName(m.material), hp: m.hp, w: m.w, h: m.h,
        states: m.states, settled: m.settled, debris: m.debris,
      };
    }
  }

  function defineProp(id, def) { propDefs[id] = { id, ...def }; }

  function addProp(id, x, yBottom, o) {
    const def = propDefs[id];
    if (!def) return null;
    const opt = o || {};
    const s = opt.scale || 1;
    const p = {
      alive: true, id, def, material: def.material,
      w: def.w * s, h: def.h * s, scale: s, flip: !!opt.flip,
      x, y: yBottom - def.h * s * 0.5,
      hp: opt.hp === undefined ? def.hp : opt.hp,
      maxHp: opt.hp === undefined ? def.hp : opt.hp,
      state: 'intact', burn: 0, charred: 0, acid: 0,
      solid: opt.solid === undefined ? (def.material !== MATERIAL.FOLIAGE) : opt.solid,
      layer: opt.layer === undefined ? LAYER.TERRAIN : opt.layer,
      supports: [], supportedBy: [],
      grounded: opt.grounded, stable: true,
      tint: opt.tint || null, onBreak: opt.onBreak || null,
      data: opt.data || {},
      shatterT: 0, fallV: 0, collapsing: false, collapseIn: -1,
    };
    p.left = p.x - p.w * 0.5; p.right = p.x + p.w * 0.5;
    p.top = p.y - p.h * 0.5; p.bottom = p.y + p.h * 0.5;
    if (p.grounded === undefined || p.grounded === null) {
      p.grounded = solidCellAt(p.x, p.bottom + 6) || solidCellAt(p.left + 4, p.bottom + 6) || solidCellAt(p.right - 4, p.bottom + 6);
    }
    if (opt.supportedBy) for (const q of opt.supportedBy) { if (q) { p.supportedBy.push(q); q.supports.push(p); } }
    if (opt.supports) for (const q of opt.supports) { if (q) { p.supports.push(q); q.supportedBy.push(p); } }
    props.push(p);
    return p;
  }

  function addTree(id, x, yBottom) {
    const comp = manifest && manifest.composites && manifest.composites[id];
    if (!comp) return null;
    let trunk = null;
    const made = [];
    for (const part of comp.parts) {
      const p = addProp(part.id, x + (part.dx || 0), yBottom + (part.dy || 0), {
        layer: LAYER.TERRAIN, solid: part.id === comp.topples,
      });
      if (!p) continue;
      made.push(p);
      if (part.id === comp.topples) trunk = p;
    }
    for (const p of made) if (p !== trunk && trunk) { p.supportedBy.push(trunk); trunk.supports.push(p); }
    return trunk;
  }

  function propAt(x, y) {
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (p.alive && x > p.left && x < p.right && y > p.top && y < p.bottom) return p;
    }
    return null;
  }

  function queryProps(x, y, r, out) {
    const res = out || [];
    res.length = 0;
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (!p.alive) continue;
      const dx = Math.max(p.left - x, 0, x - p.right);
      const dy = Math.max(p.top - y, 0, y - p.bottom);
      if (dx * dx + dy * dy <= r * r) res.push(p);
    }
    return res;
  }

  function propState(p) {
    const f = p.hp / p.maxHp;
    if (f <= 0) return;
    p.state = f < 0.33 ? 'cracked2' : f < 0.66 ? 'cracked1' : 'intact';
  }

  function damageProp(p, amount, type, o) {
    if (!p || !p.alive || p.state === 'shattering' || p.state === 'debris') return 0;
    const t = dmgType(type);
    const m = MAT[p.material];
    if (amount < m.minDamage && t === DAMAGE.IMPACT) return 0;
    const applied = amount * resistOf(p.material, t);
    if (applied <= 0) return 0;
    p.hp -= applied;
    const opt = o || {};
    materialFx(p.material, opt.hitX === undefined ? p.x : opt.hitX,
      opt.hitY === undefined ? p.y : opt.hitY, opt.dirX || 0, opt.dirY || 0, Math.min(1, applied / 30));
    if (p.hp <= 0) breakProp(p, opt.src);
    else { propState(p); ctx.audio.sfx(m.sfx.crack, { x: p.x, y: p.y }); }
    return applied;
  }

  function breakProp(p, cause) {
    if (!p.alive || p.state === 'shattering' || p.state === 'debris') return;
    p.state = 'shattering';
    p.shatterT = 0.1;
    p.cause = cause;
  }

  function finishBreak(p) {
    p.state = 'debris';
    p.solid = false;
    const m = MAT[p.material];
    const frames = p.def.debris;
    const n = Math.min(11, 5 + Math.round(p.w * p.h / 4200));
    burstDebris(p.x, p.y, p.material, n, {
      frames, speed: 200, speedVar: 220, spread: Math.PI * 1.1, dir: -Math.PI / 2,
      size: p.scale, sizeVar: 0.3,
    });
    P.emit({
      x: p.x, y: p.y, count: 18 + (m.dustScale * 12) | 0,
      speed: 120, speedVar: 160, life: 1.4, lifeVar: 0.8,
      size: 26 * m.dustScale, sizeEnd: 90 * m.dustScale,
      color: [m.dust[0], m.dust[1], m.dust[2], 0.5], color2: [m.dust[0] * 0.3, m.dust[1] * 0.3, m.dust[2] * 0.35, 0],
      gravity: -60, drag: 1.8, fadeIn: 0.1,
    });
    ctx.audio.sfx(m.sfx.break, { x: p.x, y: p.y });
    bus.emit('prop:break', { prop: p, id: p.id, x: p.x, y: p.y, material: p.material, cause: p.cause });
    if (p.onBreak) p.onBreak(p, p.cause);
    p.alive = false;
    for (const q of p.supports) if (q.alive) q.supportedBy = q.supportedBy.filter(v => v !== p);
    solveSupport();
  }

  function igniteProp(p, strength) {
    if (!p || !p.alive) return;
    p.burn = Math.max(p.burn, strength || 1);
    surfaces.ignite(p.x, p.y, Math.max(p.w, p.h) * 0.4, strength || 1);
  }

  function collapse(p, delay) {
    if (!p || !p.alive || p.collapsing) return;
    p.collapsing = true;
    p.collapseIn = delay || 0;
    bus.emit('prop:collapse', { prop: p, id: p.id, x: p.x, y: p.y });
  }

  function solveSupport() {
    const stack = [];
    for (const p of props) {
      if (!p.alive) continue;
      p.stable = false;
      if (p.grounded) { p.stable = true; stack.push(p); }
    }
    while (stack.length) {
      const p = stack.pop();
      for (const q of p.supports) {
        if (q.alive && !q.stable) { q.stable = true; stack.push(q); }
      }
    }
    let n = 0;
    for (const p of props) {
      if (p.alive && !p.stable && !p.collapsing) collapse(p, 0.05 + (n++) * 0.09);
    }
  }

  function supportEdges(out) {
    const res = out || [];
    res.length = 0;
    for (const p of props) {
      if (!p.alive) continue;
      for (const q of p.supports) if (q.alive) res.push({ ax: p.x, ay: p.y, bx: q.x, by: q.y, stable: q.stable });
    }
    return res;
  }

  /* ---------------------------------------------------------------- debris */

  const DCAP = opts.debrisCap || 500;
  const debris = [];
  function spawnDebris(o) {
    if (debris.length >= DCAP) {
      let oldest = -1;
      for (let i = 0; i < debris.length; i++) if (debris[i].sleep > 0.5) { oldest = i; break; }
      if (oldest < 0) return null;
      debris.splice(oldest, 1);
    }
    const m = MAT[o.material === undefined ? MATERIAL.ROCK : o.material];
    const b = {
      x: o.x, y: o.y, vx: o.vx || 0, vy: o.vy || 0, rot: Math.random() * 6.28,
      spin: o.spin === undefined ? (Math.random() - 0.5) * m.spin * 2 : o.spin,
      w: o.w || 14, h: o.h || 12, frame: o.frame || null, material: o.material,
      life: o.life || 0, sleep: 0, layer: o.layer === undefined ? LAYER.TERRAIN_FRONT : o.layer,
      burning: o.burning || 0, bounce: m.bounce,
    };
    debris.push(b);
    return b;
  }

  function burstDebris(x, y, material, count, o) {
    const opt = o || {};
    const frames = opt.frames;
    const spread = opt.spread === undefined ? Math.PI : opt.spread;
    const dir = opt.dir === undefined ? -Math.PI / 2 : opt.dir;
    for (let i = 0; i < count; i++) {
      const a = dir + (Math.random() - 0.5) * spread;
      const sp = (opt.speed || 300) + (Math.random() - 0.5) * (opt.speedVar || 220);
      const fr = frames && frames.length ? frames[(Math.random() * frames.length) | 0] : null;
      const sz = (opt.size || 1) * (1 + (Math.random() - 0.5) * (opt.sizeVar || 0.4));
      const f = fr && ctx.assets ? ctx.assets.f(fr) : null;
      spawnDebris({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, material, frame: fr,
        w: (f ? f.sw : 16) * sz, h: (f ? f.sh : 14) * sz,
      });
    }
  }

  function shoveDebris(x, y, r, force) {
    for (const b of debris) {
      const dx = b.x - x, dy = b.y - y;
      const dd = Math.hypot(dx, dy);
      if (dd > r || dd < 1e-3) continue;
      const k = (1 - dd / r) * force;
      b.vx += (dx / dd) * k; b.vy += (dy / dd) * k;
      b.sleep = 0;
    }
  }

  const rubbleTop = new Float32Array(cw).fill(1e9);

  /* -------------------------------------------------------------- surfaces */

  const surfKinds = new Map();
  const SCELL = 32;
  function skey(cx, cy) { return cx * 100000 + cy; }

  function defineSurface(def) {
    surfKinds.set(def.id, {
      decay: 0.05, spread: 0, flow: 0, needsFuel: false, consumes: 0,
      damage: 0, damageType: 'impact', status: null, statusTime: 0,
      color: [1, 1, 1], color2: [0.3, 0.3, 0.3], add: false, light: 0,
      layer: LAYER.FX, ...def,
      cells: new Map(), order: [],
    });
  }
  defineSurface({ id: 'fire', color: [1, 0.72, 0.3], color2: [0.9, 0.2, 0.05], add: true, light: 1, decay: 0.13, spread: 0.55, needsFuel: true, consumes: 6, damage: 14, damageType: 'fire', status: 'burn', statusTime: 2 });
  defineSurface({ id: 'acid', color: [0.55, 1, 0.35], color2: [0.15, 0.4, 0.1], decay: 0.02, flow: 0.5, consumes: 4, damage: 10, damageType: 'acid', status: 'acid', statusTime: 2, light: 0.25 });
  defineSurface({ id: 'slime', color: [0.45, 0.85, 0.5], color2: [0.1, 0.25, 0.15], decay: 0.008, flow: 0.35, damage: 0, status: 'slow', statusTime: 0.6, light: 0.12 });
  defineSurface({ id: 'frost', color: [0.65, 0.85, 1], color2: [0.2, 0.35, 0.6], decay: 0.05, status: 'slow', statusTime: 1 });
  defineSurface({ id: 'oil', color: [0.2, 0.18, 0.16], color2: [0.05, 0.05, 0.06], decay: 0.002, flow: 0.6 });

  const surfaces = {
    wind: 0,
    define: defineSurface,
    add(kind, x, y, amount) {
      const s = surfKinds.get(kind);
      if (!s) return;
      const cx = Math.floor(x / SCELL), cy = Math.floor(y / SCELL);
      const k = skey(cx, cy);
      const cur = s.cells.get(k) || 0;
      if (cur === 0) s.order.push(k);
      s.cells.set(k, Math.min(1.6, cur + amount));
    },
    pour(kind, x, y, amount, radius) {
      const r = Math.max(SCELL, radius || SCELL);
      const n = Math.ceil(r / SCELL);
      for (let i = -n; i <= n; i++) {
        for (let j = -n; j <= n; j++) {
          const dx = i * SCELL, dy = j * SCELL;
          if (dx * dx + dy * dy > r * r) continue;
          surfaces.add(kind, x + dx, y + dy, amount * (1 - Math.hypot(dx, dy) / (r * 1.4)));
        }
      }
    },
    amountAt(kind, x, y) {
      const s = surfKinds.get(kind);
      if (!s) return 0;
      return s.cells.get(skey(Math.floor(x / SCELL), Math.floor(y / SCELL))) || 0;
    },
    clear(kind, x, y, radius) {
      const s = surfKinds.get(kind);
      if (!s) return;
      const n = Math.ceil(radius / SCELL);
      const cx = Math.floor(x / SCELL), cy = Math.floor(y / SCELL);
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) s.cells.delete(skey(cx + i, cy + j));
    },
    freeze(x, y, radius, seconds) { surfaces.frozen = { x, y, r: radius, t: seconds }; },
    count(kind) { const s = surfKinds.get(kind); return s ? s.cells.size : 0; },
    ignite(x, y, radius, strength) { surfaces.pour('fire', x, y, strength || 1, radius || SCELL); },
    kinds: surfKinds,
    CELL: SCELL,
  };

  let surfPhase = 0;
  function updateSurfaces(dt) {
    surfPhase = (surfPhase + 1) % 5;
    for (const s of surfKinds.values()) {
      const keys = [...s.cells.keys()];
      for (let i = surfPhase; i < keys.length; i += 5) {
        const k = keys[i];
        let a = s.cells.get(k);
        if (a === undefined) continue;
        const cx = Math.floor(k / 100000), cy = k - cx * 100000;
        const wx = cx * SCELL + SCELL * 0.5, wy = cy * SCELL + SCELL * 0.5;
        const step = dt * 5;

        if (s.needsFuel) {
          const flam = fuelAt(wx, wy);
          if (flam <= 0) a -= step * 0.9;
          else if (s.spread > 0 && a > 0.35 && Math.random() < s.spread * step) {
            const dir = Math.random() < 0.5 ? (surfaces.wind >= 0 ? 1 : -1) : (Math.random() < 0.5 ? -1 : 1);
            const nx = wx + dir * SCELL;
            if (fuelAt(nx, wy) > 0) surfaces.add(s.id, nx, wy, 0.5);
            if (Math.random() < 0.3 && fuelAt(wx, wy - SCELL) > 0) surfaces.add(s.id, wx, wy - SCELL, 0.4);
          }
        }
        if (s.flow > 0 && a > 0.2) {
          const below = wy + SCELL;
          if (!solidAt(wx, below)) { surfaces.add(s.id, wx, below, a * s.flow * step); a -= a * s.flow * step; }
          else {
            const dir = Math.random() < 0.5 ? -1 : 1;
            if (!solidAt(wx + dir * SCELL, wy)) { surfaces.add(s.id, wx + dir * SCELL, wy, a * s.flow * step * 0.5); a -= a * s.flow * step * 0.5; }
          }
        }
        if (s.consumes > 0) {
          terrainDamageCell(wx, wy, s.consumes * a * step, s.id === 'fire' ? 'fire' : 'acid');
          const p = propAt(wx, wy);
          if (p) damageProp(p, s.consumes * a * step, s.id === 'fire' ? 'fire' : 'acid', { hitX: wx, hitY: wy });
        }
        a -= s.decay * step;
        if (a <= 0.01) s.cells.delete(k); else s.cells.set(k, a);

        if (s.onCell) s.onCell(s, cx, cy, a, step);
      }
      // damage anything standing in it — every frame, so it feels immediate
      if (s.damage > 0 || s.status) {
        for (let i = 0; i < entities.length; i++) {
          const e = entities[i];
          if (!e.alive || e.kind === 'effect' || e.kind === 'debris') continue;
          const a = s.cells.get(skey(Math.floor(e.x / SCELL), Math.floor((e.y + e.h * 0.4) / SCELL)));
          if (!a) continue;
          if (s.damage > 0) damage(e, s.damage * a * dt, s.damageType, { noFlash: true });
          if (s.status) applyStatus(e, s.status, s.statusTime, a);
        }
      }
    }
  }

  function fuelAt(x, y) {
    const cx = toCellX(x), cy = toCellY(y);
    if (inGrid(cx, cy) && solidG[cy * cw + cx]) {
      const m = MAT[matG[cy * cw + cx]];
      if (m.flammable > 0 && charG[cy * cw + cx] < 200) return m.flammable;
    }
    const p = propAt(x, y);
    if (p && MAT[p.material].flammable > 0) return MAT[p.material].flammable;
    return 0;
  }

  /* --------------------------------------------------------------- terrain */

  function terrainDamageCell(x, y, amount, type) {
    const cx = toCellX(x), cy = toCellY(y);
    if (!inGrid(cx, cy)) return 0;
    const i = cy * cw + cx;
    if (!solidG[i]) return 0;
    const m = matG[i];
    hpG[i] -= amount * resistOf(m, dmgType(type));
    charG[i] = Math.min(255, charG[i] + amount * 0.5);
    if (hpG[i] <= 0) { solidG[i] = 0; return 1; }
    return 0;
  }

  const terrain = {
    cell: CELL,
    solid: cellSolid,
    matAt(cx, cy) { return inGrid(cx, cy) ? matG[cy * cw + cx] : MATERIAL.ROCK; },
    toCellX, toCellY,

    box(x, y, w, h, material) {
      const m = material === undefined ? MATERIAL.EARTH : material;
      const cx0 = toCellX(x), cx1 = toCellX(x + w - 1);
      const cy0 = toCellY(y), cy1 = toCellY(y + h - 1);
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          if (!inGrid(cx, cy)) continue;
          const i = cy * cw + cx;
          solidG[i] = 1; matG[i] = m; hpG[i] = MAT[m].hardness * 40; charG[i] = 0;
        }
      }
    },
    hill(x0, x1, fn, material) {
      for (let x = x0; x < x1; x += CELL) {
        const top = fn(x);
        terrain.box(x, top, CELL, 1400, material);
      }
    },
    platform(x, y, w, h, material, o) {
      terrain.box(x, y, w, h, material);
      if (o && o.oneWay) {
        const cy = toCellY(y);
        for (let cx = toCellX(x); cx <= toCellX(x + w - 1); cx++) if (inGrid(cx, cy)) oneWay[cy * cw + cx] = 1;
      }
    },
    circle(x, y, r, material) {
      const m = material === undefined ? MATERIAL.ROCK : material;
      const n = Math.ceil(r / CELL);
      const c0 = toCellX(x), r0 = toCellY(y);
      for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
        if (i * i + j * j > n * n) continue;
        const cx = c0 + i, cy = r0 + j;
        if (!inGrid(cx, cy)) continue;
        const k = cy * cw + cx;
        solidG[k] = 1; matG[k] = m; hpG[k] = MAT[m].hardness * 40;
      }
    },
    damage(x, y, radius, amount, type, o) {
      const opt = o || {};
      const n = Math.ceil(radius / CELL);
      const c0 = toCellX(x), r0 = toCellY(y);
      let destroyed = 0;
      let mat = MATERIAL.EARTH;
      for (let j = -n; j <= n; j++) {
        for (let i = -n; i <= n; i++) {
          const dd = Math.hypot(i, j) / n;
          if (dd > 1) continue;
          const cx = c0 + i, cy = r0 + j;
          if (!inGrid(cx, cy)) continue;
          const k = cy * cw + cx;
          if (!solidG[k]) continue;
          mat = matG[k];
          const amt = amount * (opt.softEdge === false ? 1 : (1 - dd * 0.55));
          hpG[k] -= amt * resistOf(mat, dmgType(type));
          if (hpG[k] <= 0) { solidG[k] = 0; destroyed++; }
        }
      }
      if (destroyed) {
        const m = MAT[mat];
        if (opt.debris !== 0) burstDebris(x, y, mat, Math.min(10, 2 + (destroyed / 3) | 0), { speed: 260, speedVar: 200 });
        if (opt.dust !== 0) {
          P.emit({
            x, y, count: 10 + Math.min(24, destroyed), speed: 130, speedVar: 140,
            life: 1.2, lifeVar: 0.7, size: 22 * m.dustScale, sizeEnd: 78 * m.dustScale,
            color: [m.dust[0], m.dust[1], m.dust[2], 0.45], color2: [m.dust[0] * 0.3, m.dust[1] * 0.3, m.dust[2] * 0.35, 0],
            gravity: -50, drag: 1.7, fadeIn: 0.1,
          });
        }
        bus.emit('terrain:break', { x, y, radius, material: mat, cells: destroyed, type });
        ctx.audio.sfx(m.sfx.break, { x, y });
        markUnderminedProps();
      }
      return destroyed;
    },
    carve(x, y, radius) {
      const n = Math.ceil(radius / CELL);
      const c0 = toCellX(x), r0 = toCellY(y);
      for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
        if (i * i + j * j > n * n) continue;
        const cx = c0 + i, cy = r0 + j;
        if (inGrid(cx, cy)) solidG[cy * cw + cx] = 0;
      }
      markUnderminedProps();
    },
    fill(x, y, radius, material) { terrain.circle(x, y, radius, material); },
    scorch(x, y, radius, amount) {
      const n = Math.ceil(radius / CELL);
      const c0 = toCellX(x), r0 = toCellY(y);
      for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
        const cx = c0 + i, cy = r0 + j;
        if (inGrid(cx, cy)) charG[cy * cw + cx] = Math.min(255, charG[cy * cw + cx] + amount * 60);
      }
    },
    _solidG: solidG, _matG: matG, _charG: charG, cols: cw, rows: ch, ox, oy,
  };

  function markUnderminedProps() {
    for (const p of props) {
      if (!p.alive) continue;
      const g = solidCellAt(p.x, p.bottom + 6) || solidCellAt(p.left + 4, p.bottom + 6) || solidCellAt(p.right - 4, p.bottom + 6);
      p.grounded = g;
    }
    solveSupport();
  }

  /* ---------------------------------------------------------------- damage */

  const lastHits = [];

  function applyStatus(e, id, seconds, power) {
    const s = statusId(id);
    if (s < 0 || !e || !e.alive) return;
    e.status[s] = Math.max(e.status[s], seconds);
    e.power[s] = Math.max(e.power[s], power === undefined ? 1 : power);
  }
  function hasStatus(e, id) { const s = statusId(id); return s < 0 ? 0 : e.status[s]; }
  function statusPower(e, id) { const s = statusId(id); return s < 0 ? 0 : e.power[s]; }
  function clearStatus(e, id) { const s = statusId(id); if (s >= 0) { e.status[s] = 0; e.power[s] = 0; } }

  function knockback(e, dx, dy, force) {
    if (!e || !e.alive) return;
    const mass = Math.max(0.4, (e.w * e.h) / 2200);
    e.vx += dx * force / mass;
    e.vy += dy * force / mass;
    if (e.vy < -40) e.onGround = false;
  }

  function damage(target, amount, type, o) {
    if (!target) return 0;
    const opt = o || {};
    if (target.def !== undefined && target.supports !== undefined) return damageProp(target, amount, type, opt);
    const e = target;
    if (!e.alive) return 0;
    if (opt.src && e === opt.src.owner) return 0;
    if (e.owner && opt.src && e.owner === opt.src) return 0;
    if (e.invuln > 0 && !opt.ignoreInvuln) return 0;

    const t = dmgType(type);
    let amt = amount * resistOf(e.material, t);
    if (e.onDamage) {
      const v = e.onDamage(e, amt, t, opt.src);
      if (typeof v === 'number') amt = v;
    }
    if (amt <= 0) return 0;

    if (t === DAMAGE.LIFE) { e.hp = Math.min(e.maxHp, e.hp + amt); return amt; }

    e.hp -= amt;
    if (!opt.noFlash) e.hitFlash = 1;
    if (opt.stagger) applyStatus(e, STATUS.STUN, opt.stagger);
    if (opt.status) applyStatus(e, opt.status, opt.statusTime || 2, opt.statusPower || 1);
    if (opt.force) knockback(e, opt.dirX || 0, opt.dirY || -0.2, opt.force);
    if (e === player) bus.emit('player:damage', { amount: amt, type: t, hp: e.hp, maxHp: e.maxHp, src: opt.src, x: e.x, y: e.y });
    if (e.hp <= 0) {
      if (e === player) bus.emit('player:died', { x: e.x, y: e.y, cause: opt.src });
      kill(e, opt.src);
    }
    return amt;
  }

  function damageArea(x, y, radius, amount, type, o) {
    const opt = o || {};
    lastHits.length = 0;
    let n = 0;
    const team = opt.team === undefined ? -1 : opt.team;
    const falloff = opt.falloff === undefined ? 1 : opt.falloff;
    const max = opt.maxTargets || 64;
    for (let i = 0; i < entities.length && n < max; i++) {
      const e = entities[i];
      if (!e.alive || e === opt.src) continue;
      if (e.kind === 'effect' || e.kind === 'debris' || e.kind === 'corpse') continue;
      if (team >= 0 && e.team !== team) continue;
      const dd = Math.hypot(e.x - x, e.y - y);
      if (dd > radius + Math.max(e.w, e.h) * 0.4) continue;
      if (opt.los && !lineOfSight(x, y, e.x, e.y)) continue;
      const k = falloff === 0 ? 1 : Math.max(0, 1 - Math.pow(dd / radius, falloff === 2 ? 2 : 1));
      const dx = dd < 1e-3 ? 0 : (e.x - x) / dd;
      const dy = dd < 1e-3 ? -1 : (e.y - y) / dd;
      const applied = damage(e, amount * k, type, {
        src: opt.src, hitX: x, hitY: y, dirX: dx, dirY: dy,
        force: (opt.force || 0) * k, stagger: opt.stagger, status: opt.status,
        statusTime: opt.statusTime, statusPower: opt.statusPower, noFlash: opt.noFlash,
      });
      if (applied > 0) { n++; lastHits.push({ what: 'entity', entity: e, x: e.x, y: e.y, material: e.material }); }
    }
    if (opt.props !== false) {
      const list = queryProps(x, y, radius, []);
      for (const p of list) {
        const dd = Math.hypot(p.x - x, p.y - y);
        const k = falloff === 0 ? 1 : Math.max(0.15, 1 - dd / (radius * 1.6));
        damageProp(p, amount * k, type, { src: opt.src, hitX: x, hitY: y });
        lastHits.push({ what: 'prop', prop: p, x: p.x, y: p.y, material: p.material });
      }
    }
    if (opt.terrain) terrain.damage(x, y, radius * (opt.terrainScale === undefined ? 0.7 : opt.terrainScale), amount, type, {});
    if (opt.debris !== false && opt.force) shoveDebris(x, y, radius, opt.force * 0.6);
    return n;
  }

  function explode(x, y, o) {
    const opt = o || {};
    const radius = opt.radius === undefined ? 180 : opt.radius;
    damageArea(x, y, radius, opt.damage === undefined ? 40 : opt.damage, opt.type || 'fire', {
      src: opt.src, force: opt.force === undefined ? 900 : opt.force,
      terrain: opt.terrain, props: opt.props !== false, falloff: 1,
    });
    if (opt.shake !== 0) R.fx.shake(opt.shake === undefined ? 0.5 : opt.shake, 0.45);
    if (opt.hitstop !== 0) R.fx.timeScale(0.05, opt.hitstop === undefined ? 0.05 : opt.hitstop);
    if (opt.flash !== 0) R.fx.flash(1, 0.7, 0.35, opt.flash === undefined ? 0.15 : opt.flash, 0.1);
    R.fx.shockwave(x, y, 0.9);
    P.emit({
      x, y, count: 60, speed: 700, speedVar: 500, life: 0.7, lifeVar: 0.4, size: 22, sizeEnd: 2,
      color: [1, 0.9, 0.6, 1], color2: [1, 0.2, 0.05, 0], gravity: 700, drag: 2.4,
      add: true, glow: 0.5, stretch: 1.5, collide: true, bounce: 0.4,
    });
    P.emit({
      x, y, count: 26, speed: 220, speedVar: 180, life: 1.7, lifeVar: 0.9, size: 44, sizeEnd: 190,
      color: [0.5, 0.42, 0.38, 0.4], color2: [0.14, 0.15, 0.2, 0], gravity: -80, drag: 1.6, fadeIn: 0.12,
    });
    R.light({ x, y, radius: radius * 3, r: 1, g: 0.7, b: 0.35, intensity: 3 });
    if (opt.igniteChance) surfaces.ignite(x, y, radius * 0.6, 1);
  }

  function materialFx(material, x, y, dx, dy, strength) {
    const m = MAT[material === undefined ? MATERIAL.ROCK : material];
    const s = strength === undefined ? 1 : strength;
    P.emit({
      x, y, count: 3 + (s * 6) | 0, vx: dx, vy: dy, speed: 180 * s + 60, speedVar: 140, vSpread: 1.4,
      life: 0.35, lifeVar: 0.2, size: 6 + s * 4, sizeEnd: 1,
      color: [m.chip[0], m.chip[1], m.chip[2], 1], color2: [m.dust[0] * 0.4, m.dust[1] * 0.4, m.dust[2] * 0.4, 0],
      gravity: 900, drag: 1.6, add: m.sparks > 0, collide: true, bounce: 0.3,
    });
  }

  /* ----------------------------------------------------------------- player */

  let player = null;
  let spawnX = 0, spawnY = 0;

  function makePlayer(x, y) {
    spawnX = x; spawnY = y;
    player = spawn({
      kind: 'player', team: 0, x, y, w: 30, h: 58, hp: 120,
      material: MATERIAL.FLESH, friction: 12, collides: true,
      data: { state: 'idle', dashCd: 0, canDash: true, anim: 0, castT: 0 },
      onUpdate: updatePlayer,
      render: renderPlayer,
    });
    return player;
  }

  function updatePlayer(e, dt) {
    const d = e.data;
    const input = ctx.input;
    d.dashCd = Math.max(0, d.dashCd - dt);
    d.castT = Math.max(0, d.castT - dt);
    if (!world.playerControl) { e.vx *= Math.exp(-dt * 8); return; }

    const ax = input.axisX;
    const speed = 320;
    const accel = e.onGround ? 2600 : 1500;
    const want = ax * speed;
    const dv = want - e.vx;
    const st = accel * dt;
    e.vx += dv > st ? st : dv < -st ? -st : dv;
    if (Math.abs(ax) > 0.1) e.faceX = ax < 0 ? -1 : 1;

    if (input.pressed('jump') && e.onGround) { e.vy = -900; e.onGround = false; }
    if (input.pressed('dash') && d.dashCd <= 0) {
      d.dashCd = 0.7; e.vx = e.faceX * 900; e.invuln = 0.18;
      P.emit({
        x: e.x, y: e.y, count: 14, speed: 200, speedVar: 150, life: 0.35, lifeVar: 0.2,
        size: 14, sizeEnd: 1, color: [0.6, 0.8, 1, 0.7], color2: [0.2, 0.3, 0.6, 0], add: true, drag: 3,
      });
    }
    d.state = !e.onGround ? (e.vy < 0 ? 'jump' : 'fall') : Math.abs(e.vx) > 30 ? 'run' : 'idle';
    d.anim += (Math.abs(e.vx) * 0.03 + 2) * dt;
    if (e.y > 1600) { e.x = spawnX; e.y = spawnY; e.vx = 0; e.vy = 0; }
    ctx.input.setAimOrigin(e.x, e.y - 10);
  }

  function renderPlayer(e, alpha, Rr) {
    const x = e.px + (e.x - e.px) * alpha;
    const y = e.py + (e.y - e.py) * alpha;
    const d = e.data;
    const f = e.faceX;
    const bob = Math.sin(d.anim * 2) * 2 * (d.state === 'run' ? 1 : 0.2);
    const c = [0.28, 0.3, 0.38];
    Rr.spriteRaw(Rr.blob, 0, 0, 1, 1, x, y + e.h * 0.5 - 2, e.w * 1.5, 9, 0, 0, 0, 0, 0.45, LAYER.ACTORS, false, 1);
    Rr.spriteRaw(Rr.white, 0, 0, 1, 1, x - f * 4, y + 16 + bob, 9, 22, 0.1, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 1, LAYER.ACTORS, false, 1);
    Rr.spriteRaw(Rr.white, 0, 0, 1, 1, x + f * 5, y + 16 - bob, 9, 22, -0.1, c[0] * 0.7, c[1] * 0.7, c[2] * 0.7, 1, LAYER.ACTORS, false, 1);
    Rr.spriteRaw(Rr.blob, 0, 0, 1, 1, x, y - 2 + bob * 0.4, 24, 34, 0, c[0], c[1], c[2], 1, LAYER.ACTORS, false, 1);
    Rr.spriteRaw(Rr.blob, 0, 0, 1, 1, x + f * 3, y - 22 + bob * 0.4, 18, 18, 0, 0.5, 0.44, 0.4, 1, LAYER.ACTORS, false, 1);
    Rr.spriteRaw(Rr.blob, 0, 0, 1, 1, x + f * 2, y - 4, 12, 12, 0, 0.4, 0.9, 1, 0.9, LAYER.FX, true, 1);
    Rr.light({ x, y: y - 4, radius: 220, r: 0.45, g: 0.75, b: 1, intensity: 0.8, flicker: 0.08 });
  }

  /* ------------------------------------------------------------------ step */

  let time = 0, frame = 0;
  const DT = 1 / 60;

  function moveEntity(e, dt) {
    e.px = e.x; e.py = e.y;
    e.wasGround = e.onGround;
    if (e.gravity) e.vy += GRAV * e.gravity * dt;
    if (e.drag) { const k = 1 / (1 + e.drag * dt); e.vx *= k; e.vy *= k; }
    if (e.vy > e.maxFall) e.vy = e.maxFall;

    if (!e.collides) { e.x += e.vx * dt; e.y += e.vy * dt; e.onGround = false; return; }

    const steps = Math.max(1, Math.ceil((Math.abs(e.vx) + Math.abs(e.vy)) * dt / 8));
    const sdt = dt / steps;
    e.onGround = false; e.onWall = 0;
    for (let s = 0; s < steps; s++) {
      const nx = e.x + e.vx * sdt;
      if (solidBox(nx, e.y, e.w, e.h)) {
        e.onWall = e.vx > 0 ? 1 : -1;
        if (e.onHit) { hit.what = 'terrain'; hit.x = nx; hit.y = e.y; hit.nx = -Math.sign(e.vx); hit.ny = 0; e.onHit(e, hit); }
        e.vx = e.bounce ? -e.vx * e.bounce : 0;
      } else e.x = nx;

      const ny = e.y + e.vy * sdt;
      if (solidBox(e.x, ny, e.w, e.h)) {
        if (e.vy > 0) {
          e.onGround = true;
          if (!e.wasGround && e.onLand) e.onLand(e, e.vy);
          const gy = groundY(e.x, e.y, 200);
          if (Number.isFinite(gy)) e.y = gy - e.h * 0.5;
          e.groundMat = matG[toCellY(e.y + e.h * 0.5 + 4) * cw + toCellX(e.x)] || MATERIAL.EARTH;
        }
        if (e.onHit) { hit.what = 'terrain'; hit.x = e.x; hit.y = ny; hit.nx = 0; hit.ny = -Math.sign(e.vy); e.onHit(e, hit); }
        e.vy = e.bounce ? -e.vy * e.bounce : 0;
        if (Math.abs(e.vy) < 40) e.vy = 0;
      } else e.y = ny;
    }
    if (e.onGround && e.friction) e.vx *= Math.exp(-e.friction * dt);
  }

  function update(dt) {
    time += dt; frame++;

    for (let i = entities.length - 1; i >= 0; i--) {
      const e = entities[i];
      if (!e.alive) continue;
      if (e.invuln > 0) e.invuln -= dt;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
      for (let s = 0; s < STATUS_COUNT; s++) if (e.status[s] > 0) e.status[s] -= dt;
      e.burning = Math.max(0, e.status[STATUS.BURN]);
      if (e.burning > 0) {
        damage(e, 9 * dt, 'fire', { noFlash: true });
        if (Math.random() < 0.5) {
          P.emit({
            x: e.x + (Math.random() - 0.5) * e.w, y: e.y + (Math.random() - 0.5) * e.h, count: 1,
            speed: 40, speedVar: 40, life: 0.5, lifeVar: 0.3, size: 10, sizeEnd: 1,
            color: [1, 0.7, 0.3, 0.9], color2: [0.5, 0.1, 0.03, 0], gravity: -200, add: true, glow: 0.25,
          });
        }
      }
      if (e.status[STATUS.ACID] > 0) damage(e, 7 * dt, 'acid', { noFlash: true });
      if (e.life > 0) { e.life -= dt; if (e.life <= 0) { despawn(e); continue; } }
      moveEntity(e, dt);
      if (e.onUpdate) e.onUpdate(e, dt);
      if (e.y > 2400) despawn(e);
    }

    // props: shatter timers and collapses
    for (let i = props.length - 1; i >= 0; i--) {
      const p = props[i];
      if (!p.alive) { if (p.state === 'debris') props.splice(i, 1); continue; }
      if (p.state === 'shattering') {
        p.shatterT -= dt;
        if (p.shatterT <= 0) finishBreak(p);
        continue;
      }
      if (p.collapsing) {
        if (p.collapseIn > 0) { p.collapseIn -= dt; continue; }
        p.fallV += GRAV * 0.55 * dt;
        p.y += p.fallV * dt;
        p.top = p.y - p.h * 0.5; p.bottom = p.y + p.h * 0.5;
        if (solidCellAt(p.x, p.bottom + 2) || p.fallV > 900) {
          damageArea(p.x, p.bottom, p.w * 0.6, 24, 'impact', { force: 400, props: false, team: -1 });
          breakProp(p, 'collapse');
        }
      }
      if (p.burn > 0) {
        p.burn -= dt * 0.1;
        damageProp(p, 5 * dt, 'fire', { hitX: p.x, hitY: p.y });
      }
    }

    // debris
    for (let i = debris.length - 1; i >= 0; i--) {
      const b = debris[i];
      if (b.sleep > 0.35) continue;
      b.vy += GRAV * dt;
      const nx = b.x + b.vx * dt;
      if (!solidAt(nx, b.y)) b.x = nx; else b.vx *= -b.bounce;
      const ny = b.y + b.vy * dt;
      if (!solidAt(b.x, ny)) b.y = ny;
      else {
        if (b.vy > 120) ctx.audio.sfx(MAT[b.material].sfx.debris, { x: b.x, y: b.y });
        b.vy *= -b.bounce; b.vx *= 0.72; b.spin *= 0.6;
      }
      b.rot += b.spin * dt;
      if (Math.abs(b.vx) + Math.abs(b.vy) < 26) b.sleep += dt; else b.sleep = 0;
      if (b.sleep > 0.35) {
        const col = Math.floor((b.x - ox) / CELL);
        if (col >= 0 && col < cw) rubbleTop[col] = Math.min(rubbleTop[col], b.y - b.h * 0.3);
      }
      if (b.y > 2400) debris.splice(i, 1);
    }

    updateSurfaces(dt);
    flush();
  }

  /* ---------------------------------------------------------------- render */

  const _runCol = { r: 0, g: 0, b: 0, a: 1 };
  function renderTerrain() {
    const cam = R.cam;
    const halfW = R.worldW * 0.55, halfH = R.worldW * 0.36;
    const cx0 = Math.max(0, toCellX(cam.x - halfW)), cx1 = Math.min(cw - 1, toCellX(cam.x + halfW));
    const cy0 = Math.max(0, toCellY(cam.y - halfH)), cy1 = Math.min(ch - 1, toCellY(cam.y + halfH));
    for (let cy = cy0; cy <= cy1; cy++) {
      let run = -1;
      let runMat = 0;
      for (let cx = cx0; cx <= cx1 + 1; cx++) {
        const i = cy * cw + cx;
        const s = cx <= cx1 && solidG[i] === 1;
        const m = s ? matG[i] : -1;
        if (s && run < 0) { run = cx; runMat = m; }
        else if (run >= 0 && (!s || m !== runMat)) {
          drawRun(run, cx - 1, cy, runMat);
          if (s) { run = cx; runMat = m; } else run = -1;
        }
      }
    }
  }

  function drawRun(cx0, cx1, cy, m) {
    const mm = MAT[m];
    const x0 = cellWorldX(cx0), x1 = cellWorldX(cx1 + 1);
    const y0 = cellWorldY(cy);
    const surface = !cellSolid(cx0, cy - 1);
    let char = 0;
    for (let c = cx0; c <= cx1; c++) char += charG[cy * cw + c];
    char = Math.min(1, char / ((cx1 - cx0 + 1) * 255));
    const b = mm.body;
    const k = surface ? 1.25 : 1 - Math.min(0.45, (cy % 7) * 0.02);
    const r = b[0] * k * (1 - char * 0.8), g = b[1] * k * (1 - char * 0.85), bl = b[2] * k * (1 - char * 0.85);
    R.spriteRaw(R.white, 0, 0, 1, 1, (x0 + x1) * 0.5, y0 + CELL * 0.5, x1 - x0, CELL, 0,
      r, g, bl, 1, LAYER.TERRAIN, false, 1);
    if (surface && m === MATERIAL.EARTH) {
      R.spriteRaw(R.white, 0, 0, 1, 1, (x0 + x1) * 0.5, y0 + 2.5, x1 - x0, 5, 0,
        0.20 * (1 - char), 0.30 * (1 - char), 0.16 * (1 - char), 1, LAYER.TERRAIN, false, 1);
    }
    void _runCol;
  }

  function renderProps() {
    const A = ctx.assets;
    for (const p of props) {
      if (!p.alive) continue;
      const f = A && A.f ? A.f(propFrame(p)) : null;
      const shake = p.state === 'shattering' ? (Math.random() - 0.5) * 6 : 0;
      const s = p.state === 'shattering' ? 1 + (0.1 - p.shatterT) * 1.2 : 1;
      const tint = p.charred ? 1 - p.charred * 0.5 : 1;
      const rot = p.collapsing && p.collapseIn <= 0 ? Math.min(0.5, p.fallV * 0.0006) : 0;
      if (f) {
        R.sprite({
          tex: f.tex, sx: f.sx, sy: f.sy, sw: f.sw, sh: f.sh,
          x: p.x + shake, y: p.y, w: p.w * s, h: p.h * s, rot,
          r: tint, g: tint, b: tint, a: 1, layer: p.layer, flipX: p.flip,
        });
      } else {
        const m = MAT[p.material];
        R.quad({ x: p.x + shake, y: p.y, w: p.w * s, h: p.h * s, rot, r: m.body[0], g: m.body[1], b: m.body[2], layer: p.layer });
      }
      if (p.burn > 0) {
        R.light({ x: p.x, y: p.y, radius: p.w * 2.4, r: 1, g: 0.6, b: 0.25, intensity: 1.4, flicker: 0.35 });
      }
    }
  }

  function propFrame(p) {
    const st = p.def.states;
    if (!st) return p.id;
    const f = p.hp / p.maxHp;
    return f < 0.33 ? (st[2] || st[0]) : f < 0.66 ? (st[1] || st[0]) : st[0];
  }

  function renderDebris() {
    const A = ctx.assets;
    for (const b of debris) {
      const f = b.frame && A && A.f ? A.f(b.frame) : null;
      if (f) {
        R.sprite({ tex: f.tex, sx: f.sx, sy: f.sy, sw: f.sw, sh: f.sh, x: b.x, y: b.y, w: b.w, h: b.h, rot: b.rot, layer: b.layer });
      } else {
        const m = MAT[b.material === undefined ? MATERIAL.ROCK : b.material];
        R.quad({ x: b.x, y: b.y, w: b.w, h: b.h, rot: b.rot, r: m.body[0], g: m.body[1], b: m.body[2], layer: b.layer });
      }
    }
  }

  function renderSurfaces() {
    for (const s of surfKinds.values()) {
      for (const [k, a] of s.cells) {
        const cx = Math.floor(k / 100000), cy = k - cx * 100000;
        const x = cx * SCELL + SCELL * 0.5, y = cy * SCELL + SCELL * 0.5;
        const t = Math.min(1, a);
        const c = s.color, c2 = s.color2;
        const r = c2[0] + (c[0] - c2[0]) * t, g = c2[1] + (c[1] - c2[1]) * t, b = c2[2] + (c[2] - c2[2]) * t;
        const wob = s.id === 'fire' ? 1 + Math.sin(time * 9 + cx * 1.7) * 0.22 : 1;
        R.spriteRaw(R.blob, 0, 0, 1, 1, x, y + (s.flow ? 6 : 0), SCELL * 1.7, SCELL * (s.flow ? 1.0 : 1.6) * wob, 0,
          r, g, b, Math.min(0.9, t * (s.add ? 0.85 : 0.7)), s.layer, s.add, 1);
        if (s.light > 0 && t > 0.35 && ((cx + cy + frame) % 3 === 0)) {
          R.light({ x, y, radius: 150 * s.light, r: c[0], g: c[1], b: c[2], intensity: t * s.light * 1.4, flicker: 0.3 });
        }
      }
    }
  }

  function render(alpha) {
    renderTerrain();
    renderProps();
    renderDebris();
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i];
      if (e.alive && e.render) e.render(e, alpha, R);
    }
    renderSurfaces();
    if (world.debug.aabb) {
      for (const e of entities) R.rect(e.x, e.y, e.w, e.h, 1, { r: 0, g: 1, b: 0.4, a: 0.6 }, LAYER.UI_WORLD);
      for (const p of props) if (p.alive) R.rect(p.x, p.y, p.w, p.h, 1, { r: 1, g: 0.6, b: 0.2, a: 0.5 }, LAYER.UI_WORLD);
    }
    if (world.debug.support) {
      for (const ed of supportEdges([])) {
        R.line(ed.ax, ed.ay, ed.bx, ed.by, 2, ed.stable ? { r: 0.2, g: 1, b: 0.4, a: 0.7 } : { r: 1, g: 0.2, b: 0.1, a: 0.9 }, LAYER.UI_WORLD);
      }
    }
  }

  /* ------------------------------------------------------------------ world */

  const _castOut = { x: 0, y: 0 };
  const world = {
    ctx, R, P, bus, rng, input: ctx.input, assets: ctx.assets, LAYER,
    get player() { return player; },
    get time() { return time; },
    get frame() { return frame; },
    dt: DT,
    entityCap: CAP,
    debrisCap: DCAP,
    get count() { return entities.length; },
    entities,
    playerControl: true,
    lastHits,
    hit,
    rubbleTop,
    terrain, surfaces,

    spawn, despawn, kill, each,
    damage, damageArea, explode, materialFx,
    queryRadius, queryBox, nearest, nearestEnemy, queryProps, propAt,
    solidAt, materialAt: (x, y) => terrain.matAt(toCellX(x), toCellY(y)),
    solidBox, groundY, ceilingY, raycast, lineOfSight, sweep,
    addProp, addTree, defineProp, damageProp, breakProp, igniteProp, collapse,
    solveSupport, supportEdges,
    spawnDebris, burstDebris, shoveDebris,
    get debrisCount() { return debris.length; },
    clearDebris() { debris.length = 0; rubbleTop.fill(1e9); },
    applyStatus, hasStatus, statusPower, clearStatus, knockback,
    castOrigin(out) { const o = out || _castOut; o.x = player ? player.x : 0; o.y = player ? player.y - 6 : 0; return o; },
    setPlayerSpawn(x, y) { spawnX = x; spawnY = y; },
    respawn() { if (player) { player.x = spawnX; player.y = spawnY; player.vx = 0; player.vy = 0; player.hp = player.maxHp; } },
    makePlayer,
    update, render,
    debug: { aabb: false, grid: false, support: false, surfaces: false, rubble: false, player: false },
    get stats() {
      return {
        entities: entities.length, props: props.filter(p => p.alive).length,
        debris: debris.length, surfaceCells: [...surfKinds.values()].reduce((a, s) => a + s.cells.size, 0),
      };
    },
    props,
    isTestbed: true,
  };

  P.setTerrainQuery((x, y) => solidCellAt(x, y));
  bus.emit('sim:ready', { world });
  return world;
}
