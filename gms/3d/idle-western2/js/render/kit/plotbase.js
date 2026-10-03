// The plot framework every business diorama is built on. See docs/ART.md for the contract.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBuilder, contactMesh } from './build.js?v=20261004b';
import { createCrowd, CLIP, OUTFITS } from './crowd.js?v=20261004b';
import { createPile } from './piles.js?v=20261004b';
import * as props from './props.js?v=20261004b';

export const PLOT_W = 24, PLOT_D = 9;
// world.prepare raises `card` while a card rig fits, so `bounds.w` can answer the card width (spec.cardW) there
// and the hero width everywhere else.
export const FIT = { card: false };
const ease = (t) => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

export function createPlot(kit, { id, line = null, palette, rng = Math.random, colors = null, seed = 1 }) {
  const pal = Object.assign({}, palette, colors || {});
  const group = new THREE.Group();
  group.name = 'plot:' + (line?.id || id);
  const mk = (s) => createBuilder(kit.materials, pal, { seed: seed + s });
  const tiers = [mk(1), mk(2), mk(3)];
  const lot = mk(4);
  const staticHolder = new THREE.Group();
  group.add(staticHolder);
  const tickers = [], crowds = [], piles = [], tierObjs = [[], [], []], ownedObjs = [], lotObjs = [], texts = [];
  let contactObj = null;
  let staticMesh = null, lotMesh = null, geos = null, shownTier = -2, pop = 1, popFrom = 1;
  const anims = { t: 0 };

  const P = {
    id: line?.id || id, line, pal, rng, group, kit, props, CLIP,
    b: tiers[0], t1: tiers[1], t2: tiers[2], lot,
    tier: tiers,
    // A crowd (one draw + one blob draw). Returns the crowd api plus .agents helpers.
    crowd(o = {}) {
      const c = createCrowd(kit.materials, { count: o.count ?? 6, colors: o.colors || OUTFITS, seed: o.seed ?? crowds.length * 13 + seed, radius: o.radius ?? 18, center: o.center ?? [0, 1, 0], scale: o.scale ?? 1.36 });
      group.add(c.mesh);
      crowds.push(c);
      return c;
    },
    pile(o = {}) {
      const p = createPile(kit.materials, { palette: pal, ...o });
      p.mesh.position.set(...(o.at || [0, 0, 0]));
      if (o.ry) p.mesh.rotation.y = o.ry;
      group.add(p.mesh);
      p.range = o.range || [0, 1];
      piles.push(p);
      if (!P.pileAnchor) P.pileAnchor = o.at || [0, 0, 0];
      return p;
    },
    // A moving part: its own mesh (one draw call each, use sparingly). tier: shown from that tier up (-1 = always).
    dynamic(build, { tier = 0, cast = true } = {}) {
      const b = mk(10 + tickers.length);
      build(b);
      const m = b.finish({ cast });
      m.matrixAutoUpdate = true;
      (tier >= 0 ? tierObjs[tier] : ownedObjs).push(m);
      group.add(m);
      return m;
    },
    // Many copies of one small model in one draw: set(i, x, y, z, ry, scale, color?) / hide(i) / commit().
    instances(build, count, { tier = 0, cast = true, radius = 14 } = {}) {
      const b = mk(40 + tickers.length);
      build(b);
      const m = new THREE.InstancedMesh(b.geometry(), kit.materials.uber, count);
      m.castShadow = cast; m.receiveShadow = true;
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), radius);
      const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
      for (let i = 0; i < count; i++) m.setMatrixAt(i, _m.makeScale(0, 0, 0));
      (tier >= 0 ? tierObjs[tier] : ownedObjs).push(m);
      group.add(m);
      return Object.assign(m, {
        place(i, x, y, z, ry = 0, s = 1, rx = 0, rz = 0) { _e.set(rx, ry, rz); _m.compose(_p.set(x, y, z), _q.setFromEuler(_e), Array.isArray(s) ? _s.set(s[0], s[1], s[2]) : _s.setScalar(s)); m.setMatrixAt(i, _m); return m; },
        tint(i, c) { m.setColorAt(i, _c.set(c)); m.instanceColor.needsUpdate = true; return m; },
        hide(i) { m.setMatrixAt(i, _m.makeScale(0, 0, 0)); return m; },
        commit() { m.instanceMatrix.needsUpdate = true; },
      });
    },
    // Soft ground shadows that move: count quads in one draw; place(i, x, z, sx, sz, ry) / hide(i) / commit().
    blobs(count, { tier = -1 } = {}) {
      const g = new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2);
      const m = new THREE.InstancedMesh(g, kit.materials.contactInst, count);
      m.renderOrder = 1; m.castShadow = m.receiveShadow = false; m.raycast = () => {};
      m.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 16);
      const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
      for (let i = 0; i < count; i++) m.setMatrixAt(i, _m.makeScale(0, 0, 0));
      (tier >= 0 ? tierObjs[tier] : ownedObjs).push(m);
      group.add(m);
      return Object.assign(m, {
        place(i, x, z, sx, sz, ry = 0, y = 0) { _q.setFromAxisAngle(_y, ry); m.setMatrixAt(i, _m.compose(_p.set(x, y + 0.095, z), _q, _s.set(sx, 1, sz))); return m; },
        hide(i) { m.setMatrixAt(i, _m.makeScale(0, 0, 0)); return m; },
        commit() { m.instanceMatrix.needsUpdate = true; },
      });
    },
    // Painted sign text (kit/signs.js batch, one draw per plot per tier): tier 'lot' (unowned only), 0|1|2 (from that
    // visual tier up) or 'always'. Use with kit.western builders: western.falseFront(P.b, …, { signs: P.text(0), text }).
    text(tier = 0) {
      let t = texts.find((e) => e.tier === tier);
      if (!t) texts.push((t = { tier, batch: kit.signs.batch() }));
      return t.batch;
    },
    tick(fn) { tickers.push(fn); return P; },
    // Customers loop: spawn → queue toward `counter` → served for `serve` s → leave via `exit` path (carrying).
    queue(crowd, o) { const q = makeQueue(crowd, o); tickers.push(q.update); return q; },
    walkers(crowd, o) { const w = makeWalkers(crowd, o); tickers.push(w.update); return w; },
    done(spec = {}) {
      geos = tiers.map((t) => (t.count ? t.geometry() : null));
      for (const t of texts) {
        const m = t.batch.finish({ name: 'signs:' + P.id + ':' + t.tier });
        if (!m) continue;
        group.add(m);
        if (t.tier === 'lot') lotObjs.push(m);
        else if (t.tier === 'always') m.visible = true;
        else (tierObjs[t.tier] || ownedObjs).push(m);
      }
      if (lot.count) {
        lotMesh = new THREE.Mesh(lot.geometry(), kit.materials.uber);
        lotMesh.castShadow = lotMesh.receiveShadow = true;
        group.add(lotMesh);
      }
      const heroW = spec.w ?? PLOT_W, cardW = spec.cardW ?? heroW;
      const bounds = { get w() { return FIT.card ? cardW : heroW; }, heroW, cardW, d: spec.d ?? PLOT_D, h: spec.h ?? 6 };
      const pileAnchor = spec.pileAnchor || P.pileAnchor || [0, 0, 2];
      const exit = spec.exit || [[pileAnchor[0], pileAnchor[2]], [PLOT_W / 2, PLOT_D / 2 + 1]];
      const lamps = spec.lamps || [...tiers, lot].flatMap((t) => t.lamps);
      return {
        group, bounds, exit, pileAnchor, lamps,
        camera: spec.camera || { pos: [-4.5, 7.5, 15], look: [0, 1.2, 0], fov: 30 },
        tapTargets: [{ id: 'pile', pos: pileAnchor, r: spec.pileR ?? 1.6 }, ...(spec.tapTargets || [])],
        api: P,
        update(dt, stats, time, tier) {
          const owned = !stats || stats.owned !== false;
          const vt = owned ? Math.max(0, Math.min(2, stats?.visualTier ?? 0)) : -1;
          if (vt !== shownTier) {
            if (shownTier !== -2 && vt > shownTier) { pop = 0; popFrom = 0.55; }
            shownTier = vt;
            setTier(vt);
          }
          if (pop < 1) {
            pop = Math.min(1, pop + dt * 2.2);
            const e = ease(pop), k = lerp(popFrom, 1, e) + Math.sin(pop * Math.PI) * 0.1;
            staticHolder.scale.set(1 + (1 - k) * 0.15, k, 1 + (1 - k) * 0.15);
          }
          anims.t = time;
          const ctx = { owned, stats, time, tier, dt, vt, managed: !!stats?.managed, P };
          for (const p of piles) p.set(owned ? ((stats?.stockRatio ?? 0.3) - p.range[0]) / (p.range[1] - p.range[0]) : 0);
          for (const fn of tickers) fn(dt, ctx);
          spec.update?.(dt, stats, time, tier, ctx);
          for (const c of crowds) c.commit();
        },
      };
    },
  };

  function setTier(vt) {
    if (staticMesh) { staticHolder.remove(staticMesh); staticMesh.geometry.dispose(); staticMesh = null; }
    if (vt >= 0) {
      const list = geos.slice(0, vt + 1).filter(Boolean);
      if (list.length) {
        const g = list.length === 1 ? list[0].clone() : mergeGeometries(list, false);
        g.computeBoundingSphere();
        staticMesh = new THREE.Mesh(g, kit.materials.uber);
        staticMesh.castShadow = staticMesh.receiveShadow = true;
        staticHolder.add(staticMesh);
        kit.materials.splitUber?.(staticMesh);
      }
    }
    if (contactObj) { group.remove(contactObj); contactObj.geometry.dispose(); contactObj = null; }
    const rows = vt < 0 ? lot.contacts : tiers.slice(0, vt + 1).flatMap((t) => t.contacts);
    if (rows.length) { contactObj = contactMesh(kit.materials, rows); group.add(contactObj); }
    if (lotMesh) lotMesh.visible = vt < 0;
    lotObjs.forEach((m) => { m.visible = vt < 0; });
    tierObjs.forEach((arr, i) => arr.forEach((m) => { m.visible = vt >= i; }));
    ownedObjs.forEach((m) => { m.visible = vt >= 0; });
  }
  return P;
}

// ---------------------------------------------------------------- agents

function moveToward(a, tx, tz, step) {
  const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
  if (d <= step || d < 1e-4) { a.x = tx; a.z = tz; return true; }
  a.x += (dx / d) * step; a.z += (dz / d) * step;
  a.h = Math.atan2(dx, dz);
  return false;
}

function restyle(crowd, i, rnd) {
  crowd.look(i, { top: OUTFITS[Math.floor(rnd() * OUTFITS.length)], skin: Math.floor(rnd() * 5), hair: Math.floor(rnd() * 6), style: Math.floor(rnd() * 5) });
  const kid = rnd() < 0.18;
  crowd.body(i, kid ? 1.25 : 1.18, kid ? 0.7 : 0.95, kid ? 0.8 : 0.93 + rnd() * 0.14);
}

// o: { ids:[crowd indices], spawn:[x,z] | [[x,z],...], counter:[x,z], dir:[dx,dz] (queue extends this way),
//      gap, serve (s) | fn(stats), exit: [[x,z],...], speed, onServe(i), carry, faceCounter (radians), y }
function makeQueue(crowd, o) {
  let seed = 17;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const spawns = Array.isArray(o.spawn[0]) ? o.spawn : [o.spawn];
  const y = o.y ?? 0.02;
  const gap = o.gap ?? 0.78;
  const dir = o.dir || [0, 1];
  const agents = o.ids.map((i, k) => {
    const s = spawns[k % spawns.length];
    restyle(crowd, i, rnd);
    return { i, x: s[0], z: s[1], h: 0, st: 'queue', t: 0, wp: 0, ph: rnd() * 6, delay: k * 1.6 };
  });
  const line = [];
  for (const a of agents) line.push(a);
  let serving = null, served = 0;
  const api = {
    agents,
    get served() { return served; },
    serving: () => serving,
    update(dt, ctx) {
      if (!ctx.owned) { for (const a of agents) crowd.hide(a.i); return; }
      const speed = (o.speed ?? 1.25) * (ctx.managed ? 1 : 0.85);
      const serveT = typeof o.serve === 'function' ? o.serve(ctx.stats) : Math.max(1.1, Math.min(4, o.serve ?? (ctx.stats?.cycleSec ?? 2.5)));
      for (let k = 0; k < line.length; k++) {
        const a = line[k];
        const tx = o.counter[0] + dir[0] * gap * k, tz = o.counter[1] + dir[1] * gap * k;
        if (a.delay > 0) { a.delay -= dt; crowd.hide(a.i); continue; }
        const arrived = moveToward(a, tx, tz, speed * dt);
        if (arrived) {
          a.h = o.faceCounter ?? Math.atan2(-dir[0], -dir[1]);
          if (k === 0 && !serving) { serving = a; a.t = 0; }
        }
        crowd.set(a.i, a.x, y, a.z, a.h, arrived ? CLIP.idle : CLIP.walk);
      }
      if (serving) {
        serving.t += dt;
        if (serving.t >= serveT) {
          line.shift();
          serving.st = 'leave'; serving.wp = 0;
          served++;
          o.onServe?.(serving.i);
          serving = null;
        }
      }
      for (const a of agents) {
        if (a.st !== 'leave') continue;
        const p = o.exit[a.wp];
        if (moveToward(a, p[0], p[1], speed * dt)) {
          a.wp++;
          if (a.wp >= o.exit.length) {
            const s = spawns[Math.floor(rnd() * spawns.length)];
            a.x = s[0]; a.z = s[1]; a.st = 'queue';
            restyle(crowd, a.i, rnd);
            line.push(a);
            continue;
          }
        }
        crowd.set(a.i, a.x, y, a.z, a.h, o.carry === false ? CLIP.walk : CLIP.carry);
      }
    },
  };
  return api;
}

// Strollers on looping polylines (pavements). o: { ids, paths: [[[x,z],...]], speed, loop:'pingpong'|'wrap', clip }
function makeWalkers(crowd, o) {
  let seed = 91;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const agents = o.ids.map((i, k) => {
    const path = o.paths[k % o.paths.length];
    restyle(crowd, i, rnd);
    const len = [];
    let L = 0;
    for (let j = 1; j < path.length; j++) { L += Math.hypot(path[j][0] - path[j - 1][0], path[j][1] - path[j - 1][1]); len.push(L); }
    return { i, path, len, L, s: rnd() * L, dir: rnd() < 0.5 ? 1 : -1, sp: (o.speed ?? 1.1) * (0.8 + rnd() * 0.4) };
  });
  return {
    agents,
    update(dt, ctx) {
      if (o.ownedOnly && !ctx.owned) { for (const a of agents) crowd.hide(a.i); return; }
      for (const a of agents) {
        a.s += a.sp * dt * a.dir;
        if (o.loop === 'wrap') { if (a.s > a.L) a.s -= a.L; if (a.s < 0) a.s += a.L; }
        else if (a.s > a.L) { a.s = a.L; a.dir = -1; } else if (a.s < 0) { a.s = 0; a.dir = 1; }
        let j = 0;
        while (j < a.len.length - 1 && a.len[j] < a.s) j++;
        const s0 = j ? a.len[j - 1] : 0, t = (a.s - s0) / Math.max(1e-4, a.len[j] - s0);
        const p0 = a.path[j], p1 = a.path[j + 1];
        const x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t;
        const h = Math.atan2((p1[0] - p0[0]) * a.dir, (p1[1] - p0[1]) * a.dir);
        crowd.set(a.i, x, o.y ?? 0.02, z, h, o.clip ?? CLIP.walk);
      }
    },
  };
}

// Legacy scaffold API: decorate({b, b1, b2, pal, rng, group, kit}) → spec {people, paths, pileAnchor, ...}.
export function basePlot(kit, opts, decorate) {
  const P = createPlot(kit, { id: opts.id, line: opts.line, palette: opts.palette, rng: opts.rng, colors: opts.colors });
  const spec = decorate({ b: P.b, b1: P.t1, b2: P.t2, pal: P.pal, rng: P.rng, group: P.group, kit, workers: [], props: {} }) || {};
  const people = spec.people ?? 4;
  const crowd = P.crowd({ count: people });
  const paths = (spec.paths || []).map((p) => (p.idle ? [[p.from[0], p.from[1]], [p.from[0] + 0.01, p.from[1]]] : [p.from, p.to]));
  if (paths.length) P.walkers(crowd, { ids: paths.map((_, i) => i), paths, ownedOnly: true });
  const anchor = spec.pileAnchor || [7, 0, 2];
  P.pile({ at: anchor, kind: 'box', size: spec.pileSize ?? 0.35, max: spec.pileMax ?? 24 });
  if (spec.extra) for (const o of spec.extra) P.group.add(o);
  return P.done({ ...spec, pileAnchor: anchor, w: 20 });
}
