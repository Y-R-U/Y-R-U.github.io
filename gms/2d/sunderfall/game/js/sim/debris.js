import { MAT, MATERIAL } from './materials.js';

/**
 * Pooled debris bodies.
 *
 * Real rigid bodies would be overkill and would not survive 900 of them. These
 * are boxes with an angle: swept against the terrain grid on each axis, resting
 * on a per-column rubble heightfield so piles stack, and put to sleep the
 * moment they stop moving. A sleeping body costs one draw call slot and nothing
 * else, which is what lets rubble persist for the whole level.
 */

const SLEEP_V = 14;
const SLEEP_W = 0.5;
const SLEEP_T = 0.30;

export function createDebrisSystem(world, cap = 900) {
  const T = world.terrain;
  const bodies = new Array(cap);
  for (let i = 0; i < cap; i++) {
    bodies[i] = {
      alive: false, i, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, ang: 0, pang: 0, spin: 0,
      w: 16, h: 16, hw: 8, hh: 8, mat: MATERIAL.ROCK, frame: null,
      rest: 0, asleep: false, age: 0, life: 0, burning: 0, burnt: 0, alpha: 1, fade: 0,
      layer: 0, tint: 1, order: 0,
    };
  }
  let count = 0;
  const live = [];        // dense list of live bodies
  let orderSeq = 0;

  const rubble = new Float32Array(T.cols).fill(Infinity);
  let rubbleDirty = false;

  const uvCache = new Map();
  function uvOf(name) {
    let u = uvCache.get(name);
    if (u !== undefined) return u;
    const f = world.assets.f(name);
    if (!f) { uvCache.set(name, null); return null; }
    const iw = 1 / f.tex.w, ih = 1 / f.tex.h;
    u = { tex: f.tex, u0: f.sx * iw, v0: f.sy * ih, u1: (f.sx + f.sw) * iw, v1: (f.sy + f.sh) * ih, w: f.sw, h: f.sh };
    uvCache.set(name, u);
    return u;
  }

  function oldestSleeper() {
    let best = null;
    for (let i = 0; i < live.length; i++) {
      const b = live[i];
      if (!b.asleep) continue;
      if (!best || b.order < best.order) best = b;
    }
    return best;
  }

  function free(b) {
    b.alive = false;
    const i = live.indexOf(b);
    if (i >= 0) { live[i] = live[live.length - 1]; live.pop(); }
    count = live.length;
    if (b.asleep) rubbleDirty = true;
  }

  function rebuildRubble() {
    rubble.fill(Infinity);
    for (let i = 0; i < live.length; i++) {
      const b = live[i];
      if (!b.asleep) continue;
      stamp(b);
    }
    rubbleDirty = false;
  }

  function stamp(b) {
    // only wide-enough bodies become standable ground; pebbles should not be ledges
    if (b.w < 18) return;
    const a = T.toCellX(b.x - b.hw * 0.8), c = T.toCellX(b.x + b.hw * 0.8);
    const top = b.y - b.hh * 0.62;
    for (let cx = a; cx <= c; cx++) {
      if (cx < 0 || cx >= T.cols) continue;
      if (top < rubble[cx]) rubble[cx] = top;
    }
  }

  const D = {
    cap, rubble,
    get count() { return live.length; },
    get awake() { let n = 0; for (let i = 0; i < live.length; i++) if (!live[i].asleep) n++; return n; },
    live,

    spawn(o) {
      let b = null;
      for (let i = 0; i < cap; i++) if (!bodies[i].alive) { b = bodies[i]; break; }
      if (!b) { b = oldestSleeper(); if (!b) return null; free(b); }

      const m = o.material === undefined ? MATERIAL.ROCK : o.material;
      let frame = o.frame;
      if (!frame) frame = world.randomDebrisFrame(m);
      const uv = frame ? uvOf(frame) : null;
      const scale = (o.scale === undefined ? 1 : o.scale);
      let w = o.w, h = o.h;
      if (w === undefined || h === undefined) {
        if (uv) { w = uv.w * scale; h = uv.h * scale; }
        else { w = 18 * scale; h = 14 * scale; }
      }
      // debris art is drawn at prop scale; shrink so a wall makes bricks, not boulders
      b.alive = true; b.asleep = false; b.rest = 0; b.age = 0;
      b.x = o.x; b.y = o.y; b.px = o.x; b.py = o.y;
      b.vx = o.vx || 0; b.vy = o.vy || 0;
      b.ang = o.ang || (world.rng.next() * 6.283); b.pang = b.ang;
      b.spin = o.spin === undefined ? world.rng.range(-8, 8) : o.spin;
      b.w = w; b.h = h; b.hw = w * 0.36; b.hh = h * 0.36;
      b.mat = m; b.frame = uv;
      b.life = o.life || 0;
      b.burning = o.burning || 0;
      b.burnt = 0; b.alpha = 1; b.fade = 0;
      b.layer = o.layer === undefined ? world.LAYER.ACTORS_BACK : o.layer;
      b.tint = o.tint === undefined ? 1 : o.tint;
      b.order = orderSeq++;
      live.push(b);
      count = live.length;
      return b;
    },

    burst(x, y, material, n, o) {
      o = o || {};
      const dir = o.dir === undefined ? -Math.PI * 0.5 : o.dir;
      const spread = o.spread === undefined ? Math.PI : o.spread;
      const speed = o.speed === undefined ? 300 : o.speed;
      const speedVar = o.speedVar === undefined ? 220 : o.speedVar;
      const size = o.size === undefined ? 1 : o.size;
      const frames = o.frames || null;
      const rng = world.rng;
      for (let i = 0; i < n; i++) {
        const a = dir + rng.range(-spread, spread);
        const s = speed + rng.range(0, speedVar);
        D.spawn({
          x: x + rng.range(-8, 8), y: y + rng.range(-8, 8),
          vx: Math.cos(a) * s, vy: Math.sin(a) * s,
          material,
          frame: frames ? frames[(rng.next() * frames.length) | 0] : null,
          scale: size * rng.range(1 - (o.sizeVar || 0.4), 1 + (o.sizeVar || 0.4)),
          spin: rng.range(-1, 1) * (o.spin === undefined ? MAT[material].spin : o.spin),
          layer: o.layer, burning: o.burning || 0,
        });
      }
    },

    shove(x, y, r, force) {
      const r2 = r * r;
      for (let i = 0; i < live.length; i++) {
        const b = live[i];
        const dx = b.x - x, dy = b.y - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        const d = Math.sqrt(d2) || 1;
        const k = (1 - d / r) * force / (MAT[b.mat].density * 0.6 + 0.4);
        b.vx += (dx / d) * k;
        b.vy += (dy / d) * k - k * 0.25;
        b.spin += (world.rng.next() - 0.5) * k * 0.05;
        D.wake(b);
      }
    },

    wake(b) {
      if (!b.asleep) return;
      b.asleep = false; b.rest = 0; b.order = orderSeq++;
      rubbleDirty = true;
    },

    /** top of settled rubble at a world x, or +Infinity */
    topAt(wx) {
      const cx = T.toCellX(wx);
      if (cx < 0 || cx >= T.cols) return Infinity;
      return rubble[cx];
    },

    solidAt(wx, wy) {
      const cx = T.toCellX(wx);
      if (cx < 0 || cx >= T.cols) return false;
      const t = rubble[cx];
      return wy >= t && wy < t + 60;
    },

    update(dt) {
      const g = world.gravity;
      for (let i = live.length - 1; i >= 0; i--) {
        const b = live[i];
        b.px = b.x; b.py = b.y; b.pang = b.ang;

        if (b.burning > 0) {
          b.burning -= dt;
          b.burnt = Math.min(1, b.burnt + dt * 0.35);
          if (world.frame % 4 === (b.i & 3) && MAT[b.mat].flammable) {
            world.P.emit({
              x: b.x, y: b.y - b.hh, count: 1, vx: 0, vy: -1, vSpread: 0.7,
              speed: 40, speedVar: 40, life: 0.5, lifeVar: 0.3, size: b.w * 0.4, sizeEnd: 1,
              color: [1, 0.72, 0.30, 0.9], color2: [0.7, 0.12, 0.03, 0], gravity: -90,
              add: true, glow: 0.25,
            });
          }
          if (b.burnt >= 1 && MAT[b.mat].flammable >= 1) { b.fade = 1.6; b.burning = 0; }
        }
        if (b.fade > 0) {
          b.alpha -= dt / b.fade;
          if (b.alpha <= 0) { free(b); continue; }
        }
        if (b.life > 0) { b.age += dt; if (b.age > b.life) { free(b); continue; } }

        if (b.asleep) continue;

        b.vy += g * 0.85 * dt;
        if (b.vy > 2400) b.vy = 2400;
        b.spin *= 1 - Math.min(1, dt * 1.4);

        const bounce = MAT[b.mat].bounce;
        let hitGround = false;

        // X
        let nx = b.x + b.vx * dt;
        if (blocked(nx, b.y, b.hw, b.hh)) {
          const step = b.vx > 0 ? -1 : 1;
          let k = 0;
          while (k < 12 && blocked(nx, b.y, b.hw, b.hh)) { nx += step; k++; }
          b.vx = -b.vx * bounce;
          b.spin += b.vx * 0.004;
        }
        b.x = nx;

        // Y
        let ny = b.y + b.vy * dt;
        const rubTop = D.topAt(b.x);
        const restY = rubTop - b.hh;
        let onRubble = false;
        if (b.vy > 0 && rubTop < Infinity && b.y <= restY + 2 && ny >= restY - 1 && !blocked(b.x, ny, b.hw, b.hh)) {
          ny = restY; onRubble = true;
        }
        if (blocked(b.x, ny, b.hw, b.hh) || onRubble) {
          if (!onRubble) {
            const step = b.vy > 0 ? -1 : 1;
            let k = 0;
            while (k < 20 && blocked(b.x, ny, b.hw, b.hh)) { ny += step; k++; }
          }
          if (b.vy > 0) hitGround = true;
          if (Math.abs(b.vy) > 120) {
            if (Math.abs(b.vy) > 420) world.debrisImpact(b);
            b.vy = -b.vy * bounce;
            b.vx *= 0.72;
            b.spin *= 0.6;
          } else { b.vy = 0; b.vx *= 0.86; b.spin *= 0.7; }
        }
        b.y = ny;

        b.ang += b.spin * dt;

        /**
         * Sleeping has to key off "is there ground under me", not "did I collide
         * this frame". The de-penetration walk-back leaves a body a pixel clear,
         * so it free-falls for two or three frames before touching again — and a
         * collision-only test resets the rest timer every time it does, which
         * means nothing ever sleeps and 600 bodies stay hot forever.
         */
        const supported = hitGround
          || blocked(b.x, b.y + b.hh + 3, b.hw, 1.5)
          || (rubTop < Infinity && b.y + b.hh >= rubTop - 3);
        if (supported) {
          if (Math.abs(b.vy) < 90) b.vy = 0;
          b.vx *= 1 - Math.min(1, dt * 5);
          // lie down flat rather than balancing on a corner
          const q = Math.PI * 0.5;
          const target = Math.round(b.ang / q) * q;
          b.ang += (target - b.ang) * Math.min(1, dt * 8);
        }

        const still = Math.abs(b.vx) < SLEEP_V && Math.abs(b.vy) < SLEEP_V && Math.abs(b.spin) < SLEEP_W;
        if (still && supported) {
          b.rest += dt;
          if (b.rest > SLEEP_T) {
            b.asleep = true; b.vx = 0; b.vy = 0; b.spin = 0;
            stamp(b);
          }
        } else b.rest = 0;
      }
      if (rubbleDirty) rebuildRubble();
    },

    render(R, LAYER, alpha) {
      const white = R.white;
      for (let i = 0; i < live.length; i++) {
        const b = live[i];
        const x = b.px + (b.x - b.px) * alpha;
        const y = b.py + (b.y - b.py) * alpha;
        const a = b.pang + (b.ang - b.pang) * alpha;
        const t = b.tint * (1 - b.burnt * 0.72);
        const m = MAT[b.mat];
        if (b.frame) {
          R.spriteRaw(b.frame.tex, b.frame.u0, b.frame.v0, b.frame.u1, b.frame.v1,
            x, y, b.w, b.h, a, t, t, t, b.alpha, b.layer, false, 1);
        } else {
          R.spriteRaw(white, 0, 0, 1, 1, x, y, b.w, b.h, a,
            m.body[0] * t, m.body[1] * t, m.body[2] * t, b.alpha, b.layer, false, 1);
        }
        if (b.burning > 0) {
          R.spriteRaw(R.blob, 0, 0, 1, 1, x, y - b.hh * 0.5, b.w * 1.5, b.h * 1.8, 0,
            1, 0.55, 0.22, 0.5, LAYER.FX, true, 1);
        }
      }
    },

    igniteNear(x, y, r, strength) {
      const r2 = r * r;
      for (let i = 0; i < live.length; i++) {
        const b = live[i];
        if (!MAT[b.mat].flammable) continue;
        const dx = b.x - x, dy = b.y - y;
        if (dx * dx + dy * dy > r2) continue;
        if (b.burning <= 0) b.burning = 3 + world.rng.next() * 4 * (strength || 1);
      }
    },

    clear() {
      for (let i = 0; i < live.length; i++) live[i].alive = false;
      live.length = 0; count = 0;
      rubble.fill(Infinity);
      rubbleDirty = false;
      orderSeq = 0;
    },

    markRubbleDirty() { rubbleDirty = true; },
  };

  function blocked(x, y, hw, hh) {
    return T.solidBox(x, y, hw * 2, hh * 2);
  }

  return D;
}
