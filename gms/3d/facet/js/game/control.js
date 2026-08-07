// Tap-to-move, ground pathing, camera follow, and the hand-over that turns the diorama into a game.

import * as THREE from 'three';
import { Mesh, mix, shade } from '../world/shape.js';
import { makeActor, makeActorPool } from './actor.js';

const TAU = Math.PI * 2;
const SPEED = 3.15;
const TURN = 9.0;
const MAX_SLOPE = 0.62;
const RADIUS = 0.26;
const CELL = 4;
const NAMES = ['Rell', 'Wren', 'Corin', 'Maeve', 'Tobin', 'Isolde', 'Brannoc'];

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _sc = new THREE.Vector3();

export function create(game, app, world) {
  const T = () => world.terrain;

  const ctl = {
    actor: null,
    pool: null,
    markPool: null,
    dest: new THREE.Vector3(),
    target: null,
    moving: false,
    reached: false,
    ease: null,
    mark: null,
    markT: 0,
    grid: null,
    gridFor: null,
    path: null,
    repath: 0,
  };

  function centre() {
    return world.village?.centre || { x: 4, z: 2 };
  }

  // ── ground rules ───────────────────────────────────────────────────────────────────────────

  function buildGrid() {
    const claims = world.claims || [];
    const g = new Map();
    for (const c of claims) {
      if (c.tag === 'pool') continue;
      const r = c.r * (c.tag === 'building' ? 0.72 : 0.78);
      if (r < 0.4) continue;
      const o = { x: c.x, z: c.z, r };
      for (let i = Math.floor((c.x - r) / CELL); i <= Math.floor((c.x + r) / CELL); i++) {
        for (let j = Math.floor((c.z - r) / CELL); j <= Math.floor((c.z + r) / CELL); j++) {
          const k = i + ',' + j;
          (g.get(k) || g.set(k, []).get(k)).push(o);
        }
      }
    }
    ctl.grid = g;
    ctl.gridFor = claims;
  }

  function near(x, z) {
    if (ctl.gridFor !== world.claims) buildGrid();
    return ctl.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || [];
  }

  function open(x, z) {
    const t = T();
    if (!t.inBounds(x, z, 2.2)) return false;
    if (t.heightAt(x, z) < t.waterY + 0.18) return false;
    if (t.slopeAt(x, z) > MAX_SLOPE) return false;
    for (const o of near(x, z)) {
      const dx = o.x - x, dz = o.z - z;
      if (dx * dx + dz * dz < (o.r + RADIUS) * (o.r + RADIUS)) return false;
    }
    return true;
  }

  // ── take control ───────────────────────────────────────────────────────────────────────────

  function findSpawn(c) {
    for (let ring = 0; ring < 9; ring++) {
      const r = ring * 1.1;
      const n = ring ? 6 + ring * 4 : 1;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + ring * 0.7;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (open(x, z) && open(x + 0.5, z) && open(x, z + 0.5)) return { x, z };
      }
    }
    return { x: c.x, z: c.z };
  }

  function takeControl() {
    if (game.controlled) return ctl.actor;
    const c = centre();
    const spot = findSpawn(c);
    const t = T();

    ctl.pool = makeActorPool(world.materials, { cls: 'solid', shadow: true });
    ctl.actor = makeActor({ palette: paletteOf(), variant: 'hero', scale: 1, pool: ctl.pool });
    app.scene.add(ctl.pool.object3D);
    ctl.pool.ensure();

    const a = ctl.actor;
    a.pos.set(spot.x, t.heightAt(spot.x, spot.z), spot.z);
    a.yaw = Math.atan2(c.x - spot.x + 0.001, c.z - spot.z);
    a.setPose('idle', 0);

    game.player.pos = a.pos;
    game.player.yaw = a.yaw;
    game.player.actor = a;
    game.player.name = NAMES[Math.floor(Math.random() * NAMES.length)];
    game.player.height = a.height;
    game.controlled = true;
    game.actorPool = ctl.pool;

    // Pulling in is part of the hand-over: a character 14 px tall in the diorama's own framing is
    // not something you can play. Never pushes out, so a close scenario keeps its frame.
    ctl.ease = { t: 0, dur: 0.8, from: null, h0: 0, h1: 0 };
    syncWeapon();
    game.emit('toast', { text: `You are ${game.player.name}. Tap the ground to walk.` });
    game.emit('change');
    return a;
  }

  function paletteOf() {
    // world.p is not published; the palette module is, and the world's id names the same object.
    return world.terrain.p;
  }

  // ── destinations ───────────────────────────────────────────────────────────────────────────

  // A tap on a rooftop, a lake or a cliff walks you to the nearest ground you could actually
  // stand on. Only the destination is validated — getting past whatever is in between is the
  // slide's job, not a reason to refuse the tap.
  function nearestOpen(x, z, maxR = 3.4) {
    if (open(x, z)) return { x, z };
    for (let r = 0.45; r <= maxR; r += 0.45) {
      const n = Math.max(7, Math.round(r * 9));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r * 1.7;
        const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
        if (open(px, pz)) return { x: px, z: pz };
      }
    }
    return null;
  }

  // ── path search ────────────────────────────────────────────────────────────────────────────

  // The slide fan alone is a greedy walker, and a village is full of concave pockets it cannot
  // reason its way out of — it would stall silently against a wall. A* over `open()` finds the
  // route; the fan still handles everything between two waypoints.
  const NAV = 1, NAV_CAP = 6000;
  const NAV_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  function clear(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.45);
    for (let s = 1; s < n; s++) {
      const f = s / n;
      if (!open(ax + (bx - ax) * f, az + (bz - az) * f)) return false;
    }
    return true;
  }

  // Returns [] when the straight line is already clear, a waypoint list when a route was found,
  // and null when there is genuinely no way through. Collapsing the first and last into one value
  // makes an unreachable target look like an easy one, and the walker grinds against the wall.
  function findPath(sx, sz, tx, tz) {
    if (clear(sx, sz, tx, tz)) return [];
    const si = Math.round(sx / NAV), sj = Math.round(sz / NAV);
    const ti = Math.round(tx / NAV), tj = Math.round(tz / NAV);
    const key = (i, j) => (i + 2048) * 4096 + (j + 2048);
    const h = (i, j) => Math.hypot(i - ti, j - tj);

    const q = [{ i: si, j: sj, g: 0, f: h(si, sj) }];
    const best = new Map([[key(si, sj), 0]]);
    const from = new Map();
    let seen = 0, goal = null;

    while (q.length && seen++ < NAV_CAP) {
      let b = 0;
      for (let x = 1; x < q.length; x++) if (q[x].f < q[b].f) b = x;
      const cur = q.splice(b, 1)[0];
      if (cur.i === ti && cur.j === tj) { goal = cur; break; }
      for (const [di, dj] of NAV_DIRS) {
        const ni = cur.i + di, nj = cur.j + dj;
        if (!open(ni * NAV, nj * NAV)) continue;
        // Refuse to squeeze through a diagonal gap whose two orthogonal neighbours are both shut.
        if (di && dj && (!open((cur.i + di) * NAV, cur.j * NAV) || !open(cur.i * NAV, (cur.j + dj) * NAV))) continue;
        const g = cur.g + (di && dj ? 1.414 : 1);
        const k = key(ni, nj);
        if (best.has(k) && best.get(k) <= g) continue;
        best.set(k, g);
        from.set(k, cur);
        q.push({ i: ni, j: nj, g, f: g + h(ni, nj) });
      }
    }
    if (!goal) return null;

    const pts = [];
    for (let n = goal; n; n = from.get(key(n.i, n.j))) pts.unshift({ x: n.i * NAV, z: n.j * NAV });
    pts.push({ x: tx, z: tz });

    // String-pulling: keep only the corners you actually have to turn at, or the walk reads as a
    // grid crawl instead of a line.
    const out = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      for (; j > i + 1; j--) if (clear(pts[i].x, pts[i].z, pts[j].x, pts[j].z)) break;
      out.push(pts[j]);
      i = j;
    }
    return out;
  }

  function repath() {
    const a = ctl.actor;
    ctl.path = findPath(a.pos.x, a.pos.z, ctl.dest.x, ctl.dest.z);
    ctl.pathFor = { x: ctl.dest.x, z: ctl.dest.z };
    ctl.repath = 0;
  }

  // Stop short of what you are walking to, not on top of it. Consumed immediately by both callers,
  // so the scratch vector never outlives the call.
  function standoff(it) {
    const a = ctl.actor;
    const dx = a.pos.x - it.pos.x, dz = a.pos.z - it.pos.z;
    const l = Math.hypot(dx, dz) || 1;
    const k = Math.max(0.35, (it.reach ?? 1.6) * 0.7);
    return _b.set(it.pos.x + (dx / l) * k, 0, it.pos.z + (dz / l) * k);
  }

  function goTo(pos, interactable) {
    if (!game.controlled || !ctl.actor || !game.player.alive) return;
    const it = interactable || null;
    ctl.target = it;
    ctl.reached = false;
    ctl.slide = 1;

    // The stand-off point needs snapping too: a barrel against a wall puts it inside the wall's
    // claim, and then no route to it exists at all.
    const want = it ? standoff(it) : _b.set(pos.x, 0, pos.z);
    const dest = nearestOpen(want.x, want.z) || (it ? { x: want.x, z: want.z } : null);
    if (!dest) {
      game.emit('toast', { text: 'No way through.' });
      ctl.moving = false;
      return;
    }
    ctl.dest.set(dest.x, 0, dest.z);
    repath();
    if (!ctl.path) {
      game.emit('toast', { text: 'No way through.' });
      ctl.moving = false;
      return;
    }
    ctl.moving = true;
    showMark(ctl.dest);
    if (it?.label) game.emit('toast', { text: it.label });
  }

  function stop() {
    ctl.moving = false;
    ctl.target = null;
    ctl.path = null;
    hideMark();
  }

  // ── the tap marker ─────────────────────────────────────────────────────────────────────────

  // A flat ring alone vanishes the moment the camera pulls out, so the marker carries a floating
  // spike as well — the only part of it that is legible at village_day's frame height.
  function markGeo(p) {
    const m = new Mesh();
    const col = mix(p.accent, p.lit.warm, 0.22);
    const n = 11, r0 = 0.34, r1 = 0.52;
    const pt = (r, a, y = 0) => [Math.cos(a) * r, y, Math.sin(a) * r];
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
      m.quad(pt(r0, a0), pt(r0, a1), pt(r1, a1), pt(r1, a0), shade(col, i % 2 ? 0.06 : -0.14));
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.5;
      m.tri(pt(0.11, a), pt(0.30, a + 0.22), pt(0.30, a - 0.22), shade(col, 0.1));
    }
    const tip = [0, 0.30, 0];
    for (let i = 0; i < 5; i++) {
      const a0 = (i / 5) * TAU + 0.3, a1 = ((i + 1) / 5) * TAU + 0.3;
      m.tri(tip, pt(0.17, a0, 0.66), pt(0.17, a1, 0.66), shade(col, -0.02 - (i % 2) * 0.2));
      m.tri([0, 0.72, 0], pt(0.17, a1, 0.66), pt(0.17, a0, 0.66), shade(col, 0.12));
    }
    return m.geo();
  }

  function showMark(at) {
    if (!ctl.markPool) {
      ctl.markPool = makeActorPool(world.materials, { cls: 'glow', shadow: false });
      ctl.mark = ctl.markPool.addPart(markGeo(paletteOf()));
      app.scene.add(ctl.markPool.object3D);
      ctl.markPool.ensure();
    }
    ctl.markPool.object3D.visible = true;
    ctl.markAt = { x: at.x, z: at.z };
    ctl.markT = 0;
  }

  function hideMark() {
    if (ctl.markPool) ctl.markPool.object3D.visible = false;
    ctl.markAt = null;
  }

  function updateMark(dt) {
    if (!ctl.markAt || !ctl.markPool?.pa) return;
    ctl.markT += dt;
    const k = 1 + Math.sin(ctl.markT * 5.2) * 0.09;
    const y = T().heightAt(ctl.markAt.x, ctl.markAt.z) + 0.07;
    _q.setFromAxisAngle(_a.set(0, 1, 0), ctl.markT * 0.9);
    _sc.set(k, 1, k);
    ctl.markPool.write(ctl.mark, _m.compose(_b.set(ctl.markAt.x, y, ctl.markAt.z), _q, _sc));
    ctl.markPool.scaleColor(ctl.mark, 0.82 + 0.3 * (0.5 + 0.5 * Math.sin(ctl.markT * 5.2)));
    ctl.markPool.flush(true);
  }

  // ── walking ────────────────────────────────────────────────────────────────────────────────

  function step(dt) {
    const a = ctl.actor;
    const t = T();

    if (ctl.target) {
      // The reach is re-read every frame on purpose: combat.js widens it to the equipped weapon's
      // range, and an enemy that walks away has to pull the player after it.
      if (!game.interactables.has(ctl.target.id)) stop();
      else {
        const so = standoff(ctl.target);
        const s = nearestOpen(so.x, so.z) || so;
        ctl.dest.set(s.x, 0, s.z);
        if (ctl.markAt) { ctl.markAt.x = s.x; ctl.markAt.z = s.z; }
        const d = Math.hypot(ctl.target.pos.x - a.pos.x, ctl.target.pos.z - a.pos.z);
        if (d <= (ctl.target.reach ?? 1.6)) {
          ctl.moving = false;
          hideMark();
          face(ctl.target.pos, dt, true);
          if (!ctl.reached) {
            ctl.reached = true;
            ctl.target.onReach?.(game);
          }
          return;
        }
        ctl.moving = true;
      }
    }
    if (!ctl.moving) return;

    // A path is built against one destination. An enemy walks, so once it has drifted far enough
    // the route to where it used to be is worse than no route at all.
    if (ctl.path && ctl.pathFor
      && Math.hypot(ctl.dest.x - ctl.pathFor.x, ctl.dest.z - ctl.pathFor.z) > 1.5) repath();

    // Aim at the furthest waypoint still in plain sight rather than the next one. Consuming them
    // by proximity lets the walker orbit a corner it never quite touches; this re-anchors every
    // frame, so a slide that drifts off the route rejoins it further along instead of circling.
    if (ctl.path?.length) {
      let k = ctl.path.length - 1;
      for (; k > 0; k--) if (clear(a.pos.x, a.pos.z, ctl.path[k].x, ctl.path[k].z)) break;
      if (k > 0) ctl.path.splice(0, k);
      if (Math.hypot(ctl.path[0].x - a.pos.x, ctl.path[0].z - a.pos.z) < 0.5) ctl.path.shift();
    }
    const aim = ctl.path?.length ? ctl.path[0] : ctl.dest;

    const far = Math.hypot(ctl.dest.x - a.pos.x, ctl.dest.z - a.pos.z);
    if (far < 0.14) { stop(); return; }

    let dx = aim.x - a.pos.x, dz = aim.z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-4) { stop(); return; }
    dx /= dist; dz /= dist;

    const move = Math.min(SPEED * dt, dist);
    const probe = Math.max(move * 1.6, 0.42);
    const stuck = !open(a.pos.x, a.pos.z);

    let mx = 0, mz = 0, found = false;
    // Steer straight; if the way is shut, fan out to either side and take the first heading that
    // still makes progress. This is the whole of the pathing, deliberately — no navmesh. The side
    // that worked last frame is tried first, or the walker dithers left-right at every corner.
    const sgn = ctl.slide || 1;
    for (const off of [0, 0.42, -0.42, 0.85, -0.85, 1.3, -1.3, 1.78, -1.78, 2.3, -2.3]) {
      const o = off * sgn;
      const c = Math.cos(o), s = Math.sin(o);
      const ux = dx * c - dz * s, uz = dx * s + dz * c;
      const reach = stuck ? probe * 1.7 : probe;
      if (!open(a.pos.x + ux * reach, a.pos.z + uz * reach)) continue;
      mx = ux; mz = uz; found = true;
      ctl.slide = off === 0 ? ctl.slide : Math.sign(o);
      break;
    }
    // The fan gave up. Re-path once before conceding — a moving obstacle, or a route that was
    // never valid, is recoverable; a genuinely walled-in destination is not.
    if (!found) {
      if (ctl.repath < 2) {
        const n = ctl.repath + 1;
        repath();
        ctl.repath = n;
        if (ctl.path) return;
      }
      game.emit('toast', { text: 'No way through.' });
      stop();
      return;
    }

    a.pos.x += mx * move;
    a.pos.z += mz * move;
    a.pos.y = t.heightAt(a.pos.x, a.pos.z);
    face(_a.set(a.pos.x + mx, 0, a.pos.z + mz), dt);
  }

  function face(at, dt, slow = false) {
    const a = ctl.actor;
    const want = Math.atan2(at.x - a.pos.x, at.z - a.pos.z);
    let d = want - a.yaw;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const max = (slow ? TURN * 0.45 : TURN) * dt;
    a.yaw += THREE.MathUtils.clamp(d, -max, max);
  }

  // ── camera ─────────────────────────────────────────────────────────────────────────────────

  function camera(dt) {
    const rig = app.rig;
    const a = ctl.actor;
    const want = _a.set(a.pos.x, a.pos.y + 1.15, a.pos.z);

    if (ctl.ease) {
      const e = ctl.ease;
      if (!e.from) {
        e.from = rig.target.clone();
        e.h0 = rig.height;
        // The ortho frustum sizes on max(R, R/aspect), so `height` alone is not what the player
        // subtends — on a portrait phone the same number frames twice as much world.
        e.h1 = Math.min(rig.height, 26 * Math.min(1, rig.aspect || 1));
      }
      e.t += dt;
      const u = Math.min(1, e.t / e.dur);
      const k = u * u * (3 - 2 * u);
      rig.target.lerpVectors(e.from, want, k);
      rig.height = e.h0 + (e.h1 - e.h0) * k;
      if (u >= 1) ctl.ease = null;
    } else {
      const d = rig.target.distanceTo(want);
      if (d < 0.012) return;
      const rate = d > 7 ? 6 : d > 2.4 ? 3.4 : 2.1;
      rig.target.lerp(want, 1 - Math.exp(-dt * rate));
    }
    rig.apply();
    app.camera = rig.camera;
  }

  // ── glue ───────────────────────────────────────────────────────────────────────────────────

  function syncWeapon() {
    if (!ctl.actor) return;
    const id = game.equip.slots.handR || game.equip.slots.handL;
    ctl.actor.setWeapon(id === 'staff' ? 'staff' : id === 'sword' ? 'sword' : 'none');
  }

  game.on('change', syncWeapon);
  game.on('*', (data, g, evt) => {
    if (!ctl.actor) return;
    if (evt === 'swing' || evt === 'attack') {
      const kind = data?.style || data?.kind || (ctl.actor.weapon === 'staff' ? 'magic' : 'melee');
      ctl.actor.swing(kind === 'magic' ? 'magic' : 'melee', data?.dur || (kind === 'magic' ? 0.6 : 0.45));
    } else if (evt === 'damage' && (data?.to === 'player' || data?.target === game.player)) {
      ctl.actor.flinch();
    }
  });

  function update(dt) {
    if (!game.controlled || !ctl.actor || dt <= 0) return;
    const a = ctl.actor;

    // Anything else may respawn or teleport the player by writing player.pos; keep the alias and
    // treat a jump as a cut, not as a walk.
    if (game.player.pos !== a.pos) {
      a.pos.copy(game.player.pos);
      game.player.pos = a.pos;
      a._prev.copy(a.pos);
      stop();
    }

    a.state = game.player.alive === false ? 'dead' : 'idle';
    if (a.state === 'dead') { ctl.moving = false; hideMark(); }
    else step(dt);

    a.pos.y = T().heightAt(a.pos.x, a.pos.z);
    // Before the write, not after: a pool that grew this frame has fresh buffers, and writing into
    // the old ones costs a frame of everything snapping back to its rest pose.
    ctl.pool.ensure();
    a.update(dt);
    game.player.yaw = a.yaw;
    game.player.moving = ctl.moving;
    ctl.pool.flush();
    updateMark(dt);
    camera(dt);
  }

  return {
    update,
    takeControl,
    goTo,
    stop,
    swing: (kind, dur) => ctl.actor?.swing(kind, dur),
    spawnActor: opts => makeActor({ palette: paletteOf(), materials: world.materials, pool: ctl.pool, ...opts }),
    get player() { return ctl.actor; },
    get actor() { return ctl.actor; },
    get pool() { return ctl.pool; },
    nav: { open, findPath, nearestOpen, get path() { return ctl.path; } },
  };
}
