import { MAT, MATERIAL, DAMAGE, dmgType, resistOf, matByName } from './materials.js';

/**
 * Destructible props: the full intact -> cracked -> shattering -> debris ->
 * settled chain, plus the structural support graph.
 *
 * Support is the showpiece, so it is solved properly rather than faked: every
 * prop is stable if it is grounded on terrain or transitively supported by
 * something that is. Any break re-runs a BFS from the grounded set and anything
 * unreachable is scheduled to collapse, with a per-prop delay so an arch comes
 * down as a cascade instead of a single frame.
 */

/** Gameplay config the art manifest does not carry. */
const CONFIG = {
  wall_brick: { solid: true, chunks: 14 },
  arch_stone: { solid: true, chunks: 12, heavy: true },
  pillar_stone: { solid: true, chunks: 9, hinge: true, hingeH: 1 },
  boulder_big: { solid: true, chunks: 10 },
  boulder_small: { solid: true, chunks: 8 },
  rocks_small: { solid: false, chunks: 6 },
  crate: { solid: true, chunks: 9 },
  barrel: { solid: true, chunks: 9, explodes: 0 },
  fence: { solid: false, chunks: 8 },
  stump: { solid: true, chunks: 7 },
  tree_trunk: { solid: false, chunks: 6, hinge: true },
  oak_trunk: { solid: false, chunks: 8, hinge: true },
  deadtree: { solid: false, chunks: 8, hinge: true },
  burnt_trunk: { solid: false, chunks: 8, hinge: true },
  tree_foliage: { solid: false, chunks: 10, airy: true },
  tree_foliage_b: { solid: false, chunks: 9, airy: true },
  tree_small: { solid: false, chunks: 10, hinge: true },
  bush: { solid: false, chunks: 6, airy: true },
  ferns: { solid: false, chunks: 5, airy: true },
  mushrooms: { solid: false, chunks: 6, airy: true },
  lantern: { solid: false, chunks: 12, light: [1, 0.74, 0.42, 340, 1.7] },
  gate_iron: { solid: true, chunks: 6 },
  brazier: { solid: false, chunks: 7, light: [1, 0.66, 0.34, 460, 2.1], fire: true },
  skull_pile: { solid: false, chunks: 9 },
};

const CRACK1 = 0.66, CRACK2 = 0.33;

export function createPropSystem(world) {
  const defs = new Map();
  const props = [];
  let seq = 0;

  const BUCKET = 256;
  const buckets = new Map();      // bucket index -> array of solid props
  let bucketsDirty = true;

  const uvCache = new Map();
  function uv(name) {
    if (!name) return null;
    let u = uvCache.get(name);
    if (u !== undefined) return u;
    const f = world.assets.f(name);
    if (!f) { uvCache.set(name, null); return null; }
    const iw = 1 / f.tex.w, ih = 1 / f.tex.h;
    u = { tex: f.tex, u0: f.sx * iw, v0: f.sy * ih, u1: (f.sx + f.sw) * iw, v1: (f.sy + f.sh) * ih, w: f.sw, h: f.sh };
    uvCache.set(name, u);
    return u;
  }

  function loadDefs() {
    const man = world.assets.manifest;
    if (!man || !man.materials) return;
    for (const id in man.materials) {
      const m = man.materials[id];
      const cfg = CONFIG[id] || {};
      defs.set(id, {
        id,
        material: matByName(m.material),
        hp: m.hp,
        w: m.w, h: m.h,
        states: [uv(m.states[0]), uv(m.states[1]), uv(m.states[2])],
        settled: uv(m.settled),
        debris: m.debris,
        solid: cfg.solid || false,
        chunks: cfg.chunks || 8,
        hinge: cfg.hinge || false,
        airy: cfg.airy || false,
        heavy: cfg.heavy || false,
        light: cfg.light || null,
        fire: cfg.fire || false,
      });
    }
  }

  /** Generous margin: "on camera" means the player could plausibly see it go. */
  const CAM_MARGIN = 260;
  const MAX_HOLD = 8;
  function onCamera(p) {
    const c = world.cam;
    return Math.abs(p.x - c.x) < world.halfW + CAM_MARGIN &&
           Math.abs(p.y - c.y) < world.halfH + CAM_MARGIN;
  }

  function rebuildBuckets() {
    buckets.clear();
    for (let i = 0; i < props.length; i++) {
      const p = props[i];
      if (!p.alive || !p.solid || p.state === 'falling') continue;
      const a = Math.floor(p.left / BUCKET), b = Math.floor(p.right / BUCKET);
      for (let k = a; k <= b; k++) {
        let arr = buckets.get(k);
        if (!arr) { arr = []; buckets.set(k, arr); }
        arr.push(p);
      }
    }
    bucketsDirty = false;
  }

  const S = {
    props, defs,
    loadDefs,
    get count() { return props.length; },

    def(id) { return defs.get(id) || null; },

    add(id, x, yBottom, o) {
      o = o || {};
      const d = defs.get(id);
      if (!d) { console.warn('[sim] unknown prop', id); return null; }
      const sc = o.scale === undefined ? 1 : o.scale;
      const w = d.w * sc, h = d.h * sc;
      const p = {
        alive: true, uid: ++seq, id, def: d,
        x, y: yBottom - h * 0.5, w, h, scale: sc, flip: !!o.flip,
        left: x - w * 0.5, right: x + w * 0.5, top: yBottom - h, bottom: yBottom,
        material: o.material === undefined ? d.material : o.material,
        hp: o.hp === undefined ? d.hp * sc : o.hp,
        maxHp: o.hp === undefined ? d.hp * sc : o.hp,
        state: 'intact',
        solid: o.solid === undefined ? d.solid : o.solid,
        layer: o.layer === undefined ? world.LAYER.TERRAIN : o.layer,
        tint: o.tint || null,
        burn: 0, fuel: 1, charred: 0, acid: 0, wobble: 0, shatterT: 0, holdT: 0,
        rot: 0, rotV: 0, vx: 0, vy: 0, fallT: 0, collapseIn: -1,
        grounded: o.grounded === undefined ? null : o.grounded,
        stable: true,
        supports: [], supportedBy: [],
        needs: o.needs === undefined ? -1 : o.needs,   // -1 = every supporter is load-bearing
        onBreak: o.onBreak || null,
        data: o.data || null,
        litFlicker: world.rng.next() * 10,
      };
      if (p.grounded === null) p.grounded = groundCheck(p);
      if (o.supportedBy) for (const q of o.supportedBy) S.link(q, p);
      if (o.supports) for (const q of o.supports) S.link(p, q);
      props.push(p);
      bucketsDirty = true;
      return p;
    },

    /** `a` holds `b` up. */
    link(a, b) {
      if (!a || !b || a === b) return;
      if (a.supports.indexOf(b) < 0) a.supports.push(b);
      if (b.supportedBy.indexOf(a) < 0) b.supportedBy.push(a);
    },

    addTree(kind, x, yBottom, o) {
      o = o || {};
      const man = world.assets.manifest;
      const c = man && man.composites && man.composites[kind];
      if (!c) return null;
      const sc = o.scale === undefined ? 1 : o.scale;
      let trunk = null;
      const parts = [];
      for (const part of c.parts) {
        const p = S.add(part.id, x + part.dx * sc, yBottom + part.dy * sc, {
          scale: sc, flip: o.flip,
          layer: o.layer,
        });
        if (!p) continue;
        parts.push(p);
        if (part.id === c.topples) trunk = p;
      }
      // the canopy rides the trunk: kill the trunk and the whole thing goes
      for (const p of parts) if (p !== trunk && trunk) { S.link(trunk, p); p.grounded = false; }
      if (trunk) trunk.data = { canopy: parts.filter((p) => p !== trunk) };
      return trunk;
    },

    at(x, y) {
      for (let i = props.length - 1; i >= 0; i--) {
        const p = props[i];
        if (!p.alive || p.state === 'settled' || p.state === 'gone') continue;
        if (x >= p.left && x <= p.right && y >= p.top && y <= p.bottom) return p;
      }
      return null;
    },

    query(x, y, r, out) {
      out = out || [];
      out.length = 0;
      const r2 = r * r;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.alive || p.state === 'settled' || p.state === 'gone') continue;
        const cx = Math.max(p.left, Math.min(x, p.right));
        const cy = Math.max(p.top, Math.min(y, p.bottom));
        const dx = cx - x, dy = cy - y;
        if (dx * dx + dy * dy <= r2) out.push(p);
      }
      return out;
    },

    /** Solid props overlapping a world x-span. Used by the movement solver. */
    near(x0, x1, out) {
      if (bucketsDirty) rebuildBuckets();
      out.length = 0;
      const a = Math.floor(x0 / BUCKET), b = Math.floor(x1 / BUCKET);
      for (let k = a; k <= b; k++) {
        const arr = buckets.get(k);
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) if (out.indexOf(arr[i]) < 0) out.push(arr[i]);
      }
      return out;
    },

    /* ------------------------------------------------------------ *
     * Damage and the break chain
     * ------------------------------------------------------------ */

    damage(p, amount, type, o) {
      if (!p || !p.alive || p.state === 'shattering' || p.state === 'settled' || p.state === 'gone') return 0;
      const t = dmgType(type);
      const m = MAT[p.material];
      if (t === DAMAGE.IMPACT && amount < m.minDamage) {
        // METAL rings instead of breaking — still worth the feedback
        world.sfx(m.sfx.crack, p.x, p.y);
        world.materialFx(p.material, (o && o.hitX) || p.x, (o && o.hitY) || p.y, (o && o.dirX) || 0, (o && o.dirY) || 0, 0.35);
        return 0;
      }
      const res = resistOf(p.material, t);
      if (res <= 0) return 0;
      const applied = amount * res;
      const before = p.hp;
      p.hp -= applied;

      if (t === DAMAGE.FIRE) { S.ignite(p, 0.6 + applied * 0.01); p.charred = Math.min(1, p.charred + applied * 0.004); }
      if (t === DAMAGE.ACID) p.acid = Math.min(1, p.acid + applied * 0.02);

      const hx = (o && o.hitX !== undefined) ? o.hitX : p.x;
      const hy = (o && o.hitY !== undefined) ? o.hitY : p.y;
      world.materialFx(p.material, hx, hy, (o && o.dirX) || 0, (o && o.dirY) || 0, 0.6 + applied * 0.006);
      p.wobble = Math.min(1, p.wobble + applied * 0.01);

      const wasState = p.state;
      updateCrack(p);
      if (p.state !== wasState && p.hp > 0) world.sfx(m.sfx.crack, hx, hy);

      if (p.hp <= 0 && before > 0) {
        S.break(p, o && o.src ? 'attack' : (o && o.cause) || 'attack', o);
      }
      return applied;
    },

    ignite(p, strength) {
      if (!p.alive || !MAT[p.material].flammable) return;
      if (p.burn <= 0) world.sfx(MAT[p.material].sfx.burn, p.x, p.y);
      p.burn = Math.max(p.burn, Math.min(1, 0.35 + (strength || 0) * 0.2));
      // props are their own fuel source for the surface layer
      world.surfaces.pour('fire', p.x, p.bottom - p.h * 0.35, 0.8, Math.max(28, p.w * 0.4));
    },

    /** Structural failure: fall first, break on landing. That delay is the drama. */
    collapse(p, delay) {
      if (!p.alive || p.state === 'falling' || p.state === 'shattering' || p.state === 'settled' || p.state === 'gone') return;
      p.collapseIn = delay === undefined ? 0 : delay;
    },

    startFall(p) {
      p.state = 'falling';
      p.stable = false;
      p.vx = world.rng.range(-40, 40);
      p.vy = 20;
      p.rotV = world.rng.range(-1.1, 1.1) * (p.def.hinge ? 1.6 : 0.8);
      p.fallT = 0;
      bucketsDirty = true;
      world.bus.emit('prop:collapse', { prop: p, id: p.id, x: p.x, y: p.y });
      world.sfx('structure_groan', p.x, p.y);
      const dm = MAT[p.material];
      world.P.emit({
        x: p.x, y: p.bottom - 6, count: 18, speed: 70, speedVar: 90, life: 1.9, lifeVar: 0.8,
        size: 30, sizeEnd: 130, color: [dm.dust[0], dm.dust[1], dm.dust[2], 0.30],
        color2: [0.12, 0.12, 0.14, 0], gravity: -30, drag: 1.4, fadeIn: 0.2,
      });
      // grit shedding off the joint as it lets go — the tell that reads as WEIGHT
      world.P.emit({
        x: p.x, y: p.bottom - p.h * 0.5, count: 22, vx: 0, vy: 1, vSpread: 0.7,
        speed: 40, speedVar: 90, life: 1.1, lifeVar: 0.6, size: 5, sizeEnd: 1,
        color: [dm.chip[0], dm.chip[1], dm.chip[2], 0.9], color2: [dm.dust[0] * 0.4, dm.dust[1] * 0.4, dm.dust[2] * 0.4, 0],
        gravity: 1500, drag: 0.6, collide: true, bounce: 0.25,
      });
      dropSupported(p, 0);
    },

    /** Topple about the base — trees and pillars, which should not just vanish. */
    topple(p, dir) {
      if (!p.alive || p.state === 'falling') return;
      p.state = 'falling';
      p.rotV = (dir || (world.rng.bool(0.5) ? 1 : -1)) * 0.5;
      p.vy = 0; p.vx = 0; p.fallT = 0;
      p.hinged = true;
      bucketsDirty = true;
      world.sfx('tree_creak', p.x, p.y);
      dropSupported(p, p.rotV > 0 ? 1 : -1);
    },

    break(p, cause, o) {
      if (!p.alive || p.state === 'shattering' || p.state === 'settled' || p.state === 'gone') return;
      p.state = 'shattering';
      p.shatterT = 0.09;
      p.hp = 0;
      p.breakCause = cause || 'attack';
      p.breakDir = o && o.dirX !== undefined ? Math.atan2(o.dirY || -0.4, o.dirX) : -Math.PI * 0.5;
      bucketsDirty = true;
    },

    finishBreak(p) {
      const d = p.def;
      const m = MAT[p.material];
      const cx = p.x, cy = p.y;

      const n = Math.min(d.debris.length, Math.max(4, Math.round(d.chunks * (0.6 + p.scale * 0.5))));
      const heavy = m.density > 1.6;
      for (let i = 0; i < n; i++) {
        const fr = d.debris[i % d.debris.length];
        const a = p.breakDir + world.rng.range(-1.5, 1.5);
        const sp = (heavy ? 140 : 240) * world.rng.range(0.4, 1.5) + p.wobble * 60;
        world.debris.spawn({
          x: cx + world.rng.range(-p.w * 0.35, p.w * 0.35),
          y: cy + world.rng.range(-p.h * 0.4, p.h * 0.4),
          vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - world.rng.range(60, 300),
          frame: fr, material: p.material, scale: p.scale,
          spin: world.rng.range(-1, 1) * m.spin,
          burning: p.burn > 0.2 ? 3 + world.rng.next() * 5 : 0,
          layer: p.layer === world.LAYER.TERRAIN_FRONT ? world.LAYER.TERRAIN_FRONT : world.LAYER.ACTORS_BACK,
          tint: 1 - p.charred * 0.6,
        });
      }

      world.materialFx(p.material, cx, cy, 0, -1, 1.4 + p.w * 0.004);
      world.P.emit({
        x: cx, y: cy + p.h * 0.2, count: Math.round(14 + p.w * 0.09), speed: 90, speedVar: 150,
        life: 1.5, lifeVar: 0.9, size: 30 * m.dustScale, sizeEnd: 150 * m.dustScale,
        color: [m.dust[0], m.dust[1], m.dust[2], 0.34], color2: [0.1, 0.1, 0.12, 0],
        gravity: -40, drag: 1.6, fadeIn: 0.14,
      });
      if (p.burn > 0.1) world.surfaces.pour('fire', cx, p.bottom - 8, 0.9, p.w * 0.55);

      world.sfx(m.sfx.break, cx, cy);
      world.bus.emit('prop:break', { prop: p, id: p.id, x: cx, y: p.bottom, material: p.material, cause: p.breakCause });
      if (p.onBreak) p.onBreak(p, p.breakCause);

      p.state = d.settled ? 'settled' : 'gone';
      p.solid = false;
      bucketsDirty = true;
      S.solve();
    },

    /**
     * Remove a prop outright — no break frames, no debris, no event. Gravewake
     * *spends* a bone pile rather than shattering it, and shattering would leave
     * rubble the spell is supposed to have consumed. Still re-solves support, so
     * consuming a load-bearing prop drops what it was holding up.
     */
    despawn(p) {
      if (!p || !p.alive) return;
      p.alive = false;
      p.state = 'gone';
      p.solid = false;
      bucketsDirty = true;
      S.solve();
    },

    /* ------------------------------------------------------------ *
     * Support graph
     * ------------------------------------------------------------ */

    solve() {
      const alive = [];
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.alive || p.state === 'settled' || p.state === 'gone' || p.state === 'falling') continue;
        p.stable = true;
        alive.push(p);
      }
      // Greatest fixpoint: start optimistic and demote. AND semantics — every
      // supporter a prop declares is load-bearing, so pulling ONE buttress out
      // from under an arch brings it down. Pass `needs: 1` for OR behaviour.
      for (let pass = 0; pass < 24; pass++) {
        let changed = false;
        for (let i = 0; i < alive.length; i++) {
          const p = alive[i];
          if (!p.stable) continue;
          if (p.grounded === true) continue;
          if (p.grounded === null && groundCheck(p)) { p.grounded = true; continue; }
          const sup = p.supportedBy;
          if (!sup.length) { p.stable = false; changed = true; continue; }
          let n = 0;
          for (let k = 0; k < sup.length; k++) {
            const q = sup[k];
            if (q.alive && q.stable && q.state !== 'settled' && q.state !== 'gone' && q.state !== 'falling') n++;
          }
          const need = p.needs < 0 ? sup.length : Math.min(p.needs, sup.length);
          if (n < need) { p.stable = false; changed = true; }
        }
        if (!changed) break;
      }
      let n = 0;
      for (const p of alive) {
        if (!p.stable && p.collapseIn < 0) S.collapse(p, 0.12 + (n++) * 0.17 + world.rng.next() * 0.14);
      }
      return n;
    },

    /** Terrain under a prop's base was destroyed — recheck grounding nearby. */
    checkGround(x, y, r) {
      let any = false;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.alive || p.state === 'settled' || p.state === 'gone' || p.state === 'falling') continue;
        if (p.bottom < y - r - 40 || p.bottom > y + r + 40) continue;
        if (p.right < x - r - p.w || p.left > x + r + p.w) continue;
        const g = groundCheck(p);
        if (g !== (p.grounded === true)) { p.grounded = g; any = true; }
      }
      if (any) S.solve();
      return any;
    },

    edges(out) {
      out = out || [];
      out.length = 0;
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.alive) continue;
        for (const c of p.supports) out.push({ ax: p.x, ay: p.y, bx: c.x, by: c.y, stable: c.stable });
      }
      return out;
    },

    /* ------------------------------------------------------------ *
     * Tick
     * ------------------------------------------------------------ */

    update(dt) {
      for (let i = props.length - 1; i >= 0; i--) {
        const p = props[i];
        if (!p.alive) { props.splice(i, 1); bucketsDirty = true; continue; }

        if (p.wobble > 0) p.wobble = Math.max(0, p.wobble - dt * 2.2);

        /**
         * Destruction is the signature mechanic and it was going off where
         * nobody could see it — a cascade runs along a structure faster than a
         * phone-width camera can follow, so the player heard the arch come down
         * and arrived at rubble. A prop that is *about to* go — waiting on its
         * collapse delay, or mid-shatter — holds that timer while it is off
         * camera, so the chain plays when you get there. Only the pre-break
         * states hold: anything already falling keeps its physics, or a
         * half-visible beam would freeze in mid-air.
         */
        const pending = p.collapseIn >= 0 || p.state === 'shattering';
        let hold = false;
        if (pending) {
          if (onCamera(p)) p.holdT = 0;
          else { p.holdT += dt; hold = p.holdT < MAX_HOLD; }
        }

        if (!hold && p.collapseIn >= 0 && p.state !== 'falling') {
          p.collapseIn -= dt;
          p.wobble = Math.min(1, p.wobble + dt * 3);
          if (p.collapseIn <= 0) { p.collapseIn = -1; if (p.def.hinge) S.topple(p); else S.startFall(p); }
        }

        if (p.state === 'shattering') {
          if (!hold) {
            p.shatterT -= dt;
            if (p.shatterT <= 0) S.finishBreak(p);
          }
          continue;
        }

        if (p.state === 'falling') {
          p.fallT += dt;
          if (p.hinged) {
            // hinge about the base: angular gravity, so a tree accelerates over
            p.rotV += Math.sin(p.rot) * 5.4 * dt + Math.sign(p.rotV || 1) * 1.7 * dt;
            p.rot += p.rotV * dt;
            syncBounds(p);
            const tipX = p.x + Math.sin(p.rot) * p.h;
            const tipY = p.bottom - Math.cos(p.rot) * p.h;
            if (Math.abs(p.rot) > 1.15 || world.solidAt(tipX, tipY)) {
              p.breakDir = p.rot > 0 ? 0.2 : Math.PI - 0.2;
              impactBreak(p, tipX, tipY, 700);
            }
          } else {
            p.vy += world.gravity * 0.95 * dt;
            p.rot += p.rotV * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            syncBounds(p);
            if (world.solidAt(p.x, p.bottom) || world.solidAt(p.left + 4, p.bottom) || world.solidAt(p.right - 4, p.bottom)) {
              p.breakDir = -Math.PI * 0.5;
              impactBreak(p, p.x, p.bottom, Math.abs(p.vy));
            } else if (p.fallT > 4) {
              p.breakDir = -Math.PI * 0.5;
              impactBreak(p, p.x, p.bottom, 600);
            }
          }
          continue;
        }

        if (p.state === 'settled' || p.state === 'gone') continue;

        if (p.burn > 0) {
          p.burn = Math.min(1.4, p.burn + dt * 0.06 * MAT[p.material].flammable);
          p.fuel -= dt * 0.055 * p.burn * MAT[p.material].flammable;
          p.charred = Math.min(1, p.charred + dt * 0.10 * p.burn);
          p.hp -= dt * 7 * p.burn * MAT[p.material].flammable;
          if (world.frame % 3 === (p.uid & 3)) {
            world.P.emit({
              x: p.x + world.rng.spread(p.w * 0.4), y: p.bottom - world.rng.next() * p.h * 0.8,
              count: 1, vx: 0, vy: -1, vSpread: 0.5, speed: 70, speedVar: 60,
              life: 0.8, lifeVar: 0.5, size: 22, sizeEnd: 2,
              color: [1, 0.74, 0.32, 0.85], color2: [0.6, 0.09, 0.02, 0],
              gravity: -180, drag: 0.7, add: true, glow: 0.3,
            });
          }
          world.surfaces.pour('fire', p.x, p.bottom - p.h * 0.3, dt * 1.6, p.w * 0.45);
          if (p.fuel <= 0 || p.hp <= 0) {
            p.breakCause = 'fire';
            if (p.def.hinge) S.topple(p); else S.break(p, 'fire');
            continue;
          }
          updateCrack(p);
        }

        if (p.acid > 0) {
          p.acid = Math.max(0, p.acid - dt * 0.05);
          const soluble = MAT[p.material].soluble;
          if (soluble > 0) {
            p.hp -= dt * 9 * p.acid * soluble;
            if (world.frame % 7 === (p.uid & 7)) {
              world.P.emit({
                x: p.x + world.rng.spread(p.w * 0.45), y: p.bottom - world.rng.next() * p.h * 0.7,
                count: 1, speed: 10, life: 1.1, size: 7, sizeEnd: 1,
                color: [0.62, 0.95, 0.30, 0.8], color2: [0.2, 0.45, 0.1, 0], gravity: 220, add: true, glow: 0.15,
              });
            }
            updateCrack(p);
            if (p.hp <= 0) { S.break(p, 'acid'); continue; }
          }
        }
      }
    },

    render(R, LAYER, alpha) {
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.alive) continue;
        let fr = null;
        if (p.state === 'settled') fr = p.def.settled;
        else if (p.state === 'gone') continue;
        else if (p.state === 'cracked2') fr = p.def.states[2] || p.def.states[0];
        else if (p.state === 'cracked1') fr = p.def.states[1] || p.def.states[0];
        else fr = p.def.states[0];
        if (!fr) continue;

        let x = p.x, y = p.y, w = p.w, h = p.h, rot = p.rot;
        if (p.state === 'settled') {
          const sw = fr.w * p.scale, sh = fr.h * p.scale;
          x = p.x; y = p.bottom - sh * 0.5; w = sw; h = sh; rot = 0;
        } else if (p.hinged && p.state === 'falling') {
          // rotate about the foot, not the centre
          const s = Math.sin(p.rot), c = Math.cos(p.rot);
          x = p.x + s * h * 0.5; y = p.bottom - c * h * 0.5;
        } else if (p.wobble > 0) {
          x += Math.sin(world.time * 34 + p.uid) * p.wobble * 3.2;
          rot += Math.sin(world.time * 27 + p.uid * 1.7) * p.wobble * 0.028;
        }
        if (p.state === 'shattering') {
          const k = 1 - p.shatterT / 0.09;
          w *= 1 + k * 0.10; h *= 1 - k * 0.06;
        }

        const ch = 1 - p.charred * 0.68;
        let r = ch, g = ch, b = ch;
        if (p.acid > 0.05) { g = Math.min(1.3, g + p.acid * 0.25); r *= 1 - p.acid * 0.2; b *= 1 - p.acid * 0.3; }
        if (p.tint) { r *= p.tint[0]; g *= p.tint[1]; b *= p.tint[2]; }
        if (p.state === 'shattering') { const k = 1 - p.shatterT / 0.09; r += k * 0.8; g += k * 0.7; b += k * 0.5; }

        const u0 = p.flip ? fr.u1 : fr.u0, u1 = p.flip ? fr.u0 : fr.u1;
        R.spriteRaw(fr.tex, u0, fr.v0, u1, fr.v1, x, y, w, h, rot, r, g, b, 1, p.layer, false, 1);

        if (p.burn > 0 && p.state !== 'settled') {
          const f = 0.7 + Math.sin(world.time * 15 + p.uid) * 0.2;
          R.spriteRaw(R.blob, 0, 0, 1, 1, p.x, p.bottom - p.h * 0.35, p.w * 1.3 * f, p.h * 1.1 * f, 0,
            1, 0.5, 0.18, 0.35 * Math.min(1, p.burn), LAYER.FX, true, 1);
        }
      }
    },

    /** Lights props emit — called during the render pass. */
    lights(R) {
      for (let i = 0; i < props.length; i++) {
        const p = props[i];
        if (!p.alive) continue;
        const L = p.def.light;
        if (L && p.state !== 'settled' && p.state !== 'gone' && p.state !== 'shattering') {
          R.light({ x: p.x, y: p.bottom - p.h * 0.72, radius: L[3] * p.scale, r: L[0], g: L[1], b: L[2], intensity: L[4], flicker: 0.24 });
        }
        if (p.burn > 0.05 && p.state !== 'settled' && p.state !== 'gone') {
          R.light({
            x: p.x, y: p.bottom - p.h * 0.4, radius: (170 + p.w * 1.5) * Math.min(1, p.burn + 0.3),
            r: 1, g: 0.62, b: 0.30, intensity: 1.5 * Math.min(1.2, p.burn), flicker: 0.36,
          });
        }
      }
    },

    clear() { props.length = 0; buckets.clear(); bucketsDirty = true; seq = 0; },
  };

  /**
   * Anything this prop was holding up goes now. A canopy in particular must be
   * flung sideways the instant the trunk starts to go — schedule it on a delay
   * and you get a tree crown hanging in mid-air, which is the single most
   * damning thing a destruction system can put on screen.
   */
  function dropSupported(p, dir) {
    for (const c of p.supports) {
      if (c.state !== 'intact' && c.state !== 'cracked1' && c.state !== 'cracked2') continue;
      if (c.def.airy || MAT[c.material].density < 0.5) {
        S.startFall(c);
        c.vx = (dir || world.rng.sign()) * world.rng.range(120, 260);
        c.vy = -world.rng.range(40, 140);
        c.rotV = (dir || 1) * world.rng.range(1.2, 2.4);
      } else {
        S.collapse(c, 0.05 + world.rng.next() * 0.28);
      }
    }
  }

  function syncBounds(p) {
    p.left = p.x - p.w * 0.5; p.right = p.x + p.w * 0.5;
    p.top = p.y - p.h * 0.5; p.bottom = p.y + p.h * 0.5;
  }

  function updateCrack(p) {
    if (p.state === 'falling' || p.state === 'shattering' || p.state === 'settled' || p.state === 'gone') return;
    const f = p.hp / p.maxHp;
    p.state = f > CRACK1 ? 'intact' : f > CRACK2 ? 'cracked1' : 'cracked2';
  }

  function impactBreak(p, x, y, speed) {
    const k = Math.min(1.6, speed / 700);
    world.R.fx.shake(0.34 * k * (p.def.heavy ? 1.6 : 1), 0.5);
    world.shockwave(x, y, 0.4 * k * (p.def.heavy ? 1.4 : 1));
    const im = MAT[p.material];
    world.P.emit({
      x, y, count: Math.round(18 + p.w * 0.10), vx: 0, vy: -1, vSpread: 1.5,
      speed: 150 * k, speedVar: 220, life: 1.8, lifeVar: 1.0,
      size: 34 * im.dustScale, sizeEnd: 190 * im.dustScale,
      color: [im.dust[0], im.dust[1], im.dust[2], 0.34], color2: [0.10, 0.10, 0.13, 0],
      gravity: -34, drag: 1.7, fadeIn: 0.10,
    });
    if (p.def.heavy || p.w > 180) world.R.fx.timeScale(0.10, 0.045);
    world.debris.shove(x, y, 180, 260 * k);
    world.damageArea(x, y, p.w * 0.55, 26 * k * (MAT[p.material].density), 'impact', {
      terrain: MAT[p.material].density > 1.6, terrainScale: 0.35, props: false, force: 420 * k,
    });
    p.breakCause = 'collapse';
    S.break(p, 'collapse');
    p.shatterT = 0.02;
  }

  function groundCheck(p) {
    const y = p.bottom + 3;
    const n = Math.max(2, Math.min(9, Math.round(p.w / 24)));
    for (let i = 0; i < n; i++) {
      const x = p.left + 3 + (p.w - 6) * (i / (n - 1));
      const cx = world.terrain.toCellX(x);
      if (world.terrain.filled(cx, world.terrain.toCellY(y))) return true;   // one-way ledges count
    }
    return false;
  }

  return S;
}
