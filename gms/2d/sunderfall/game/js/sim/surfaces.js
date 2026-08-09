import { MAT, MATERIAL } from './materials.js';
import { STATUS } from './status.js';

/**
 * The surface / fluid layer — the thing that makes the world remember.
 *
 * A coarse 32px grid of persistent amounts, one sparse set per kind. Fire needs
 * fuel and spreads through it; acid flows downhill and eats what it sits on;
 * slime oozes and slows. New kinds are data, not code, so the spell agent can
 * add one without touching this file.
 *
 * Cells tick on a staggered slice (a fifth per frame) so a thousand burning
 * cells cost roughly what two hundred would.
 */

export const SCELL = 32;
const SLICES = 5;

export function createSurfaces(world) {
  const T = world.terrain;
  const gcols = Math.ceil((T.cols * T.cell) / SCELL) + 2;
  const grows = Math.ceil((T.rows * T.cell) / SCELL) + 2;
  const gx0 = T.x0, gy0 = T.y0;

  const kinds = new Map();
  const order = [];

  const pool = [];
  function alloc() {
    const c = pool.pop();
    if (c) return c;
    return { k: null, i: 0, cx: 0, cy: 0, x: 0, y: 0, amount: 0, fuel: 0, fuelT: 0, age: 0, seed: 0, frozen: 0 };
  }

  const cx = (wx) => Math.floor((wx - gx0) / SCELL);
  const cy = (wy) => Math.floor((wy - gy0) / SCELL);
  const wx = (c) => gx0 + c * SCELL + SCELL * 0.5;
  const wy = (c) => gy0 + c * SCELL + SCELL * 0.5;

  const scratchProps = [];

  const S = {
    wind: 0,
    kinds,
    cellSize: SCELL,

    define(d) {
      const k = {
        id: d.id,
        color: d.color || [1, 1, 1], color2: d.color2 || [0.2, 0.2, 0.2],
        add: !!d.add, light: d.light || 0, layer: d.layer === undefined ? world.LAYER.FX : d.layer,
        decay: d.decay === undefined ? 0.05 : d.decay,
        spread: d.spread || 0,
        flow: d.flow || 0,
        needsFuel: !!d.needsFuel,
        consumes: d.consumes || 0,
        damage: d.damage || 0,
        damageType: d.damageType || 'impact',
        status: d.status === undefined ? null : d.status,
        /**
         * What a surface does to the PLAYER, as a fraction of what it does to
         * everything else. Almost every burning cell in this game was lit by the
         * player, and at parity the correct play was to set the world on fire and
         * then run away from the best thing in the game — you never got to watch
         * your own destruction. Fire is a hazard he walks around, not one that
         * kills him for standing near it.
         */
        playerScale: d.playerScale === undefined ? 1 : d.playerScale,
        playerStatus: d.playerStatus === undefined ? 1 : d.playerStatus,
        statusTime: d.statusTime || 1.2,
        statusPower: d.statusPower === undefined ? 1 : d.statusPower,
        max: d.max === undefined ? 1 : d.max,
        cap: d.cap === undefined ? 900 : d.cap,
        onCell: d.onCell || null,
        particle: d.particle || null,
        sfx: d.sfx || null,
        // runtime
        map: new Map(), cells: [], slice: 0,
      };
      kinds.set(k.id, k);
      if (order.indexOf(k.id) < 0) order.push(k.id);
      return k;
    },

    get(id) { return kinds.get(id) || null; },
    count(id) { const k = kinds.get(id); return k ? k.cells.length : 0; },
    total() { let n = 0; for (const k of kinds.values()) n += k.cells.length; return n; },

    add(id, x, y, amount) {
      const k = kinds.get(id);
      if (!k) return null;
      const a = cx(x), b = cy(y);
      if (a < 0 || b < 0 || a >= gcols || b >= grows) return null;
      const i = b * gcols + a;
      let c = k.map.get(i);
      if (!c) {
        if (k.cells.length >= k.cap) return null;
        c = alloc();
        c.k = k; c.i = i; c.cx = a; c.cy = b; c.x = wx(a); c.y = wy(b);
        c.amount = 0; c.age = 0; c.fuelT = 0; c.frozen = 0;
        c.seed = world.rng.next() * 100;
        c.fuel = fuelAt(k, c);
        if (k.needsFuel && c.fuel <= 0) { pool.push(c); return null; }
        k.map.set(i, c);
        k.cells.push(c);
      }
      c.amount = Math.min(k.max, c.amount + amount);
      return c;
    },

    pour(id, x, y, amount, radius) {
      const k = kinds.get(id);
      if (!k) return;
      const r = radius || SCELL;
      if (r <= SCELL * 0.6) { S.add(id, x, y, amount); return; }
      const a0 = cx(x - r), a1 = cx(x + r), b0 = cy(y - r), b1 = cy(y + r);
      const r2 = r * r;
      for (let b = b0; b <= b1; b++) for (let a = a0; a <= a1; a++) {
        const dx = wx(a) - x, dy = wy(b) - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        S.add(id, wx(a), wy(b), amount * (1 - Math.sqrt(d2) / r * 0.6));
      }
    },

    ignite(x, y, radius, strength) {
      S.pour('fire', x, y, 0.9 * (strength || 1), radius || 40);
      world.props.query(x, y, (radius || 40) + 30, scratchProps);
      for (const p of scratchProps) world.props.ignite(p, strength || 1);
      world.debris.igniteNear(x, y, (radius || 40) + 20, strength || 1);
    },

    amountAt(id, x, y) {
      const k = kinds.get(id);
      if (!k) return 0;
      const c = k.map.get(cy(y) * gcols + cx(x));
      return c ? c.amount : 0;
    },

    clear(id, x, y, radius) {
      const k = kinds.get(id);
      if (!k) return;
      const r2 = radius * radius;
      for (let i = k.cells.length - 1; i >= 0; i--) {
        const c = k.cells[i];
        const dx = c.x - x, dy = c.y - y;
        if (dx * dx + dy * dy > r2) continue;
        remove(k, i);
      }
    },

    clearAll(x, y, radius) { for (const id of order) S.clear(id, x, y, radius); },

    freeze(x, y, radius, seconds) {
      const r2 = radius * radius;
      for (const k of kinds.values()) {
        for (let i = 0; i < k.cells.length; i++) {
          const c = k.cells[i];
          const dx = c.x - x, dy = c.y - y;
          if (dx * dx + dy * dy <= r2) c.frozen = Math.max(c.frozen, seconds);
        }
      }
    },

    /* ------------------------------------------------------------ */

    update(dt) {
      const slice = world.frame % SLICES;
      const edt = dt * SLICES;
      for (const k of kinds.values()) {
        const cells = k.cells;
        for (let i = cells.length - 1; i >= 0; i--) {
          if ((i % SLICES) !== slice) continue;
          const c = cells[i];
          if (c.frozen > 0) { c.frozen -= edt; continue; }
          c.age += edt;

          if (k.needsFuel) {
            c.fuelT -= edt;
            if (c.fuelT <= 0) { c.fuel = fuelAt(k, c); c.fuelT = 0.5; }
            if (c.fuel <= 0) {
              c.amount -= edt * 1.4;
              if (c.amount <= 0) { remove(k, i); continue; }
            }
          }

          c.amount -= k.decay * edt;
          if (c.amount <= 0.02) { remove(k, i); continue; }

          if (k.consumes > 0 && c.amount > 0.15) consume(k, c, edt);
          if (k.spread > 0 && c.amount > 0.55) spread(k, c, edt);
          if (k.flow > 0 && c.amount > 0.12) flow(k, c, edt);
          if (k.damage > 0 || k.status !== null) hurt(k, c, edt);
          if (k.onCell) k.onCell(S, c.cx, c.cy, c.amount, edt);
        }
      }
      if (S.wind !== 0) S.wind *= 1 - Math.min(1, dt * 1.2);
    },

    render(R, LAYER, time) {
      const camX = world.cam.x, camY = world.cam.y;
      const hw = world.halfW + 80, hh = world.halfH + 80;
      for (const id of order) {
        const k = kinds.get(id);
        for (let i = 0; i < k.cells.length; i++) {
          const c = k.cells[i];
          if (c.x < camX - hw || c.x > camX + hw || c.y < camY - hh || c.y > camY + hh) continue;
          const a = Math.min(1, c.amount);
          if (k.particle) { k.particle(S, c.x, c.y, a); continue; }
          if (id === 'fire') {
            const f = 0.75 + Math.sin(time * 9 + c.seed * 6) * 0.25;
            const g = 0.8 + Math.sin(time * 13.7 + c.seed * 11) * 0.2;
            // jitter off the cell centre or the grid reads as a grid
            const jx = (c.seed % 1) * SCELL - SCELL * 0.5;
            const jy = ((c.seed * 7) % 1) * SCELL * 0.6 - SCELL * 0.3;
            R.spriteRaw(R.blob, 0, 0, 1, 1, c.x + jx + Math.sin(time * 3 + c.seed) * 4, c.y + jy - SCELL * 0.25 * f,
              SCELL * 1.4 * g, SCELL * 1.9 * f, 0, 1, 0.50, 0.15, a * 0.30, LAYER.FX, true, 1);
            R.spriteRaw(R.blob, 0, 0, 1, 1, c.x + jx * 0.5, c.y + jy * 0.5 + SCELL * 0.1,
              SCELL * 1.8, SCELL * 1.0, 0, 1, 0.28, 0.05, a * 0.22, LAYER.FX, true, 1);
          } else {
            const wob = Math.sin(time * 2.2 + c.seed * 4) * 0.08 + 1;
            R.spriteRaw(R.blob, 0, 0, 1, 1, c.x, c.y + SCELL * 0.22,
              SCELL * 1.7 * wob, SCELL * 0.95, 0,
              k.color[0], k.color[1], k.color[2], a * 0.75, k.layer, k.add, 1);
          }
        }
      }
    },

    lights(R) {
      // budgeted: sample evenly across the live set so 600 flames cost 24 lights
      for (const id of order) {
        const k = kinds.get(id);
        if (k.light <= 0 || !k.cells.length) continue;
        const budget = Math.min(k.cells.length, 22);
        const step = k.cells.length / budget;
        // each sampled light stands in for `step` cells, but the stand-in gain is
        // clamped hard: a forest fire must glow, not white out the whole frame
        const gain = Math.min(3.2, Math.max(1, step));
        for (let n = 0; n < budget; n++) {
          const c = k.cells[Math.floor(n * step)];
          if (!c) continue;
          if (Math.abs(c.x - world.cam.x) > world.halfW + 200) continue;
          R.light({
            x: c.x, y: c.y - 10, radius: SCELL * (3.6 + gain * 0.9),
            r: k.color[0], g: k.color[1], b: k.color[2],
            intensity: k.light * Math.min(1, c.amount) * (0.45 + gain * 0.10), flicker: id === 'fire' ? 0.38 : 0.08,
          });
        }
      }
    },

    clearAllCells() {
      for (const k of kinds.values()) {
        for (const c of k.cells) pool.push(c);
        k.cells.length = 0; k.map.clear();
      }
      S.wind = 0;
    },
  };

  function remove(k, i) {
    const c = k.cells[i];
    k.map.delete(c.i);
    k.cells[i] = k.cells[k.cells.length - 1];
    k.cells.pop();
    c.k = null;
    pool.push(c);
  }

  /** How much a fire cell has to eat: terrain, props and debris all count. */
  function fuelAt(k, c) {
    if (!k.needsFuel) return 1;
    let f = 0;
    const half = SCELL * 0.5;
    for (let sy = -1; sy <= 1; sy++) {
      for (let sx = -1; sx <= 1; sx++) {
        const m = T.materialAtWorld(c.x + sx * half * 0.9, c.y + sy * half * 0.9);
        if (m >= 0) f += MAT[m].flammable * 0.22;
      }
    }
    if (S.amountAt('oil', c.x, c.y) > 0.05) f += 1;
    world.props.query(c.x, c.y, SCELL * 0.9, scratchProps);
    for (const p of scratchProps) if (MAT[p.material].flammable > 0 && p.fuel > 0) f += 0.9;
    return f;
  }

  function consume(k, c, dt) {
    const amt = k.consumes * c.amount * dt;
    if (k.id === 'fire') {
      // fire eats the terrain slowly and chars a lot
      T.scorch(c.x, c.y, SCELL * 0.8, dt * 0.35);
      if (world.rng.next() < dt * 0.5) {
        const a = T.toCellX(c.x + world.rng.spread(SCELL * 0.5));
        const b = T.toCellY(c.y + world.rng.spread(SCELL * 0.5));
        T.burnCell(a, b, amt);
      }
      world.props.query(c.x, c.y, SCELL, scratchProps);
      for (const p of scratchProps) if (MAT[p.material].flammable > 0) world.props.ignite(p, c.amount);
      world.debris.igniteNear(c.x, c.y, SCELL, c.amount);
    } else {
      T.damage(c.x, c.y, SCELL * 0.55, amt * 30, k.damageType, { debris: 0, dust: 0, jitter: 1.4 });
      world.props.query(c.x, c.y, SCELL, scratchProps);
      for (const p of scratchProps) {
        if (k.id === 'acid') { p.acid = Math.min(1, p.acid + dt * 0.8); }
      }
    }
  }

  function spread(k, c, dt) {
    if (world.rng.next() > dt * k.spread) return;
    const dirs = SPREAD_DIRS;
    const wind = S.wind;
    for (let i = 0; i < dirs.length; i += 2) {
      const dx = dirs[i], dy = dirs[i + 1];
      let chance = 0.5;
      if (dx !== 0) chance *= 1 + wind * dx * 1.4;
      if (dy < 0) chance *= 1.5;            // fire climbs
      if (dy > 0) chance *= 0.55;
      if (world.rng.next() > chance) continue;
      const nx = c.x + dx * SCELL, ny = c.y + dy * SCELL;
      const kk = kinds.get(k.id);
      const idx = cy(ny) * gcols + cx(nx);
      const ex = kk.map.get(idx);
      if (ex) { ex.amount = Math.min(kk.max, ex.amount + 0.1); continue; }
      S.add(k.id, nx, ny, 0.45);
    }
    c.amount -= dt * 0.05;
  }

  const SPREAD_DIRS = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1];

  /** Downhill ooze: prefer straight down, then whichever side is open and lower. */
  function flow(k, c, dt) {
    const rate = k.flow * dt;
    if (rate <= 0) return;
    const below = c.y + SCELL;
    if (!T.solidAtWorld(c.x, below) && !world.debris.solidAt(c.x, below)) {
      const give = Math.min(c.amount * 0.65, rate * 2.2);
      if (give > 0.01) { S.add(k.id, c.x, below, give); c.amount -= give; }
      return;
    }
    for (let s = -1; s <= 1; s += 2) {
      const nx = c.x + s * SCELL;
      if (T.solidAtWorld(nx, c.y)) continue;
      const kk = kinds.get(k.id);
      const ex = kk.map.get(cy(c.y) * gcols + cx(nx));
      const there = ex ? ex.amount : 0;
      if (there >= c.amount - 0.06) continue;
      const give = Math.min((c.amount - there) * 0.35, rate);
      if (give > 0.01) { S.add(k.id, nx, c.y, give); c.amount -= give; }
    }
  }

  const hitBuf = [];
  function hurt(k, c, dt) {
    world.queryBox(c.x, c.y, SCELL * 1.2, SCELL * 1.4, HURT_OPTS, hitBuf);
    for (let i = 0; i < hitBuf.length; i++) {
      const e = hitBuf[i];
      const mine = e.kind === 'player';
      const amt = Math.min(1, c.amount);
      if (k.damage > 0) world.damage(e, k.damage * dt * amt * (mine ? k.playerScale : 1), k.damageType, NO_FX);
      if (k.status !== null) {
        world.applyStatus(e, k.status, k.statusTime * (mine ? k.playerStatus : 1), k.statusPower * amt);
      }
    }
  }
  const HURT_OPTS = { targetable: true, sort: false, max: 12 };
  const NO_FX = { noFlash: true, quiet: true };

  /* ---------------- built-in kinds ---------------- */

  /**
   * Fire is tuned as a *front*, not a field. At spread 0.42 / decay 0.055 a
   * single lit barrel walked the whole 1200px opening screen in three seconds
   * and nothing behind the front ever went out, so the only outcome was death:
   * 26/s standing in it plus a burn that could not be escaped. Halving the
   * spread and nearly doubling the decay means a cell burns for ~9s and the
   * fire eats along its fuel and dies behind itself, which is both the readable
   * picture and something you can run out of.
   */
  S.define({
    id: 'fire', color: [1, 0.55, 0.2], color2: [0.5, 0.08, 0.02], add: true, light: 1.0,
    decay: 0.105, spread: 0.20, flow: 0, needsFuel: true, consumes: 0.9,
    damage: 16, damageType: 'fire', status: STATUS.BURN, statusTime: 1.6, max: 1.2,
    // 16/s + a re-armed burn killed a 100hp player in four seconds, so the whole
    // fire school played as "light it, then flee the screen". At 0.20 standing in
    // his own fire costs ~3/s: it hurts, it is never the thing that kills him.
    playerScale: 0.20, playerStatus: 0.5,
    light: 1.0, cap: 320,
  });
  S.define({
    id: 'acid', color: [0.45, 0.92, 0.22], color2: [0.1, 0.3, 0.05], add: false, light: 0.35,
    decay: 0.012, spread: 0, flow: 0.9, needsFuel: false, consumes: 0.5,
    damage: 18, damageType: 'acid', status: STATUS.CORRODE, statusTime: 3, max: 1,
    // same argument, less generously: acid pools where you threw it and does not
    // chase you, so wading through your own is more of a choice than fire is
    playerScale: 0.40, playerStatus: 0.6,
  });
  S.define({
    id: 'slime', color: [0.35, 0.55, 0.30], color2: [0.1, 0.2, 0.1], add: false, light: 0.12,
    decay: 0.008, spread: 0.1, flow: 0.5, needsFuel: false, consumes: 0,
    damage: 0, status: STATUS.SLOW, statusTime: 0.5, statusPower: 0.55, max: 1,
  });
  S.define({
    id: 'frost', color: [0.55, 0.8, 1], color2: [0.2, 0.35, 0.6], add: false, light: 0.2,
    decay: 0.06, spread: 0, flow: 0.2, needsFuel: false, consumes: 0,
    damage: 0, status: STATUS.SLOW, statusTime: 0.6, statusPower: 0.4, max: 1,
    onCell(s, a, b, amt, dt) { s.clear('fire', gx0 + a * SCELL, gy0 + b * SCELL, SCELL * 1.2); },
  });
  S.define({
    id: 'oil', color: [0.14, 0.12, 0.16], color2: [0.05, 0.05, 0.07], add: false, light: 0,
    decay: 0.004, spread: 0, flow: 1.1, needsFuel: false, consumes: 0,
    damage: 0, status: STATUS.SLOW, statusTime: 0.4, statusPower: 0.3, max: 1,
  });

  return S;
}
