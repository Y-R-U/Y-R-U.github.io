import * as THREE from '../../vendor/three/three.module.js';

const damp = (k, dt) => 1 - Math.exp(-k * dt);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Tuned for a tiny, heavy cat in a full-size house.
export const TUNE = {
  runSpeed: 3.3,          // m/s at full stick / keyboard
  accel: 16, airAccel: 7, decel: 20,
  turnRate: 13,
  gravity: 24, fallMult: 1.35, maxFall: 14,
  jumpApex: 0.98,         // m — table (0.76) and sill (~0.9) reachable, fridge (1.85) not
  jumpCut: 0.45,          // velocity kept when jump is released early
  coyote: 0.13, buffer: 0.16,
  stepUp: 0.27, snapDown: 0.3,
  height: 0.44,
  boredAfter: 9,
};

// AABB character controller against world.colliders. Every collider is a solid box from below and
// the sides; 'surface' colliders flagged oneWay may be jumped through from beneath.
export function createController({ actor, world, events, camera }) {
  const pos = actor.root.position;
  const vel = new THREE.Vector3();
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), wish = new THREE.Vector3();
  const jumpV = Math.sqrt(2 * TUNE.gravity * TUNE.jumpApex);

  const c = {
    pos, vel,
    grounded: true, surfaceId: null, speed: 0,
    locked: false, belly: 0.3,
    radius: actor.radius || 0.22,
    coyoteT: 0, bufferT: 0, jumping: false, knockT: 0,
    idleT: 0, airT: 0, peakY: 0,
    anim: 'loco',
    animHold: false,           // a level owns Garfield's clip (e.g. the L5 vine hang)
    bonkId: null,
    lock(on) { c.locked = !!on; if (on) { c.bufferT = 0; } },
    teleport(p, rotY) {
      pos.set(p.x, p.y ?? 0, p.z);
      if (rotY !== undefined) actor.root.rotation.y = rotY;
      vel.set(0, 0, 0);
      depenetrate();
      settle();
      c.grounded = true; c.anim = 'loco'; actor.setMove?.(0);
    },
    knockback(dir, strength = 4) {
      const d = new THREE.Vector3(dir.x, 0, dir.z);
      if (d.lengthSq() < 1e-6) d.set(-Math.sin(actor.root.rotation.y), 0, -Math.cos(actor.root.rotation.y));
      d.normalize();
      vel.x = d.x * strength; vel.z = d.z * strength; vel.y = Math.min(5, 2 + strength * 0.4);
      c.grounded = false; c.knockT = 0.55;
      actor.root.rotation.y = Math.atan2(-d.x, -d.z);
      setAnim('knockback', { once: true, fade: 0.06 });
      events?.emit('knockback', { dir: d, strength });
    },
    // A little comic leap out of harm's way (Jon toppling onto him): no knockback clip, input off briefly.
    hop(dir, speed = 2.6) {
      const d = new THREE.Vector3(dir.x, 0, dir.z).normalize();
      vel.x = d.x * speed; vel.z = d.z * speed; vel.y = 4.2;
      c.grounded = false; c.knockT = 0.4; c.peakY = pos.y; c.takeoffY = pos.y;
      actor.root.rotation.y = Math.atan2(d.x, d.z);
      setAnim('jump_up', { once: true, fade: 0.06 });
    },
    setBelly(t) { c.belly = THREE.MathUtils.clamp(t, 0, 1); actor.setBelly?.(c.belly); c.radius = (actor.radius || 0.22); },
    update,
  };

  function setAnim(name, opts) {
    if (c.animHold) return;
    if (c.anim === name && !opts?.once) return;
    c.anim = name;
    if (name === 'loco') actor.setMove?.(c.speed);
    else actor.play?.(name, opts);
  }

  const cols = () => world?.colliders || [];
  const H = () => TUNE.height + c.belly * 0.04;

  function overlapsXZ(b, x, z, r) {
    return x + r > b.min.x && x - r < b.max.x && z + r > b.min.z && z - r < b.max.z;
  }
  // Highest top under (x,z) within [lo, hi].
  function groundBetween(x, z, lo, hi, r) {
    let best = -Infinity, id = null;
    for (const b of cols()) {
      if (b.enabled === false || b.noWalk) continue;
      const top = b.max.y;
      if (top < lo || top > hi) continue;
      if (!overlapsXZ(b, x, z, r * 0.7)) continue;
      if (top > best) { best = top; id = b.id; }
    }
    if (lo <= 0 && 0 <= hi && best < 0 && !world?.noGroundPlane) { best = 0; id = 'ground'; }
    return best === -Infinity ? null : { y: best, id };
  }
  function blocked(x, z, feet, r) {
    const h = H();
    for (const b of cols()) {
      if (b.enabled === false) continue;
      if (b.max.y <= feet + 0.001 || b.min.y >= feet + h) continue;
      // Overhead edges (stair openings, table rims) only catch the top of the head: be forgiving.
      if (overlapsXZ(b, x, z, b.min.y > feet + 0.22 ? r * 0.45 : r)) return b;
    }
    return null;
  }
  // Eject from any box we ended up inside (teleports, doors closing on us, props enabling colliders).
  function depenetrate() {
    const r = c.radius;
    for (let k = 0; k < 6; k++) {
      const b = blocked(pos.x, pos.z, pos.y, r);
      if (!b) return;
      const up = b.max.y - pos.y;
      if (up > 0 && up <= 0.45 && overlapsXZ(b, pos.x, pos.z, r * 0.7) && !blocked(pos.x, pos.z, b.max.y + 1e-3, r)) { pos.y = b.max.y; continue; }
      // Smallest push wins (even into another box, resolved next pass) so we never get shoved through a wall.
      const opts = [
        [b.max.x + r + 1e-3 - pos.x, 'x'], [b.min.x - r - 1e-3 - pos.x, 'x'],
        [b.max.z + r + 1e-3 - pos.z, 'z'], [b.min.z - r - 1e-3 - pos.z, 'z'],
      ].sort((a, b2) => Math.abs(a[0]) - Math.abs(b2[0]));
      const [d, ax] = opts[0];
      if (Math.abs(d) > 1.5) return;
      if (ax === 'x') pos.x += d; else pos.z += d;
    }
  }
  c._blocked = (x, z, y, r) => blocked(x, z, y, r ?? c.radius)?.id;
  function settle() {
    const g = groundBetween(pos.x, pos.z, pos.y - 0.6, pos.y + 0.3, c.radius);
    if (g) { pos.y = g.y; c.surfaceId = g.id; }
  }

  // Moves along one horizontal axis, sliding along walls and stepping up small ledges.
  function moveAxis(axis, d) {
    if (d === 0) return;
    const r = c.radius;
    const nx = axis === 'x' ? pos.x + d : pos.x, nz = axis === 'z' ? pos.z + d : pos.z;
    const b = blocked(nx, nz, pos.y, r);
    if (!b) { pos.x = nx; pos.z = nz; return; }
    const rise = b.max.y - pos.y;
    if (rise > 0 && rise <= TUNE.stepUp && (c.grounded || c.airT < 0.15 || vel.y <= 0) && !blocked(nx, nz, b.max.y + 0.001, r)) {
      // Pop far enough onto the step to be supported, or ground-snap would drop us straight back.
      let sx = nx, sz = nz;
      const m = r * 0.7 - 0.01;
      if (axis === 'x') sx = d > 0 ? Math.max(nx, b.min.x - m) : Math.min(nx, b.max.x + m);
      else sz = d > 0 ? Math.max(nz, b.min.z - m) : Math.min(nz, b.max.z + m);
      if (!blocked(sx, sz, b.max.y + 0.001, r)) {
        pos.x = sx; pos.z = sz; pos.y = b.max.y;
        if (vel.y < 0) vel.y = 0;
        return;
      }
    }
    // Push flush against the face we hit.
    // (already overlapping it, e.g. mid-jump through a rim: just stop, never snap back across the box)
    const face = axis === 'x' ? (d > 0 ? b.min.x - r - 1e-4 : b.max.x + r + 1e-4) : (d > 0 ? b.min.z - r - 1e-4 : b.max.z + r + 1e-4);
    const cur = axis === 'x' ? pos.x : pos.z;
    if (d > 0 ? cur <= face : cur >= face) {
      const nf = d > 0 ? Math.min(face, cur + d) : Math.max(face, cur + d);
      if (axis === 'x') { if (!blocked(nf, pos.z, pos.y, r)) pos.x = nf; } else if (!blocked(pos.x, nf, pos.y, r)) pos.z = nf;
    }
    // Clipped a corner (door jambs): slip sideways round it instead of stopping dead.
    const lo = axis === 'x' ? pos.z + r - b.min.z : pos.x + r - b.min.x;
    const hi = axis === 'x' ? b.max.z - (pos.z - r) : b.max.x - (pos.x - r);
    const slip = lo < hi ? -lo : hi;
    if (Math.abs(slip) < 0.1) {
      // (a graze exactly on the edge gives slip 0: still nudge, or he sticks on the jamb corner forever)
      const s = (lo < hi ? -1 : 1) * Math.min(Math.abs(slip) + 2e-3, Math.abs(d) * 0.9);
      if (axis === 'x') { if (!blocked(pos.x, pos.z + s, pos.y, r)) pos.z += s; } else if (!blocked(pos.x + s, pos.z, pos.y, r)) pos.x += s;
    }
    if (axis === 'x') vel.x = 0; else vel.z = 0;
  }

  function moveVertical(dt) {
    const r = c.radius, prev = pos.y;
    let g = TUNE.gravity * (vel.y < 0 ? TUNE.fallMult : 1);
    vel.y = Math.max(-TUNE.maxFall, vel.y - g * dt);
    const ny = prev + vel.y * dt;
    if (vel.y <= 0) {
      const hit = groundBetween(pos.x, pos.z, ny - 1e-4, prev + 0.02, r);
      if (hit) {
        pos.y = hit.y;
        const wasAir = !c.grounded;
        c.grounded = true; c.surfaceId = hit.id; vel.y = 0;
        if (wasAir) land(hit);
        return;
      }
      pos.y = ny; c.grounded = false;
    } else {
      const h = H();
      let escapes = 0;
      for (let i = 0, cs = cols(); i < cs.length; i++) {
        const b = cs[i];
        if (b.enabled === false || b.oneWay) continue;
        if (b.min.y < prev + h - 0.02 || b.min.y > ny + h) continue;
        if (!overlapsXZ(b, pos.x, pos.z, r * 0.8)) continue;
        // Only the rim caught his head (jumping beside a table edge): slip out past it instead of bonking.
        // A thin top (table, bench) he ran in under mid-jump: slide back out from under the rim.
        const thin = b.max.y - b.min.y <= 0.12;
        // (centre at or just past the rim: rise through it; depenetrate() then mantles him onto the top)
        const tol = thin ? 0.08 + Math.min(0.14, Math.hypot(vel.x, vel.z) * 0.05) : 0;
        if (thin && !(pos.x > b.min.x + tol && pos.x < b.max.x - tol && pos.z > b.min.z + tol && pos.z < b.max.z - tol)) continue;
        const rim = thin && Math.hypot(vel.x, vel.z) > 0.3;
        if (escapes < 2 && edgeEscape(b, r * 0.8, rim ? 0.42 : 0.24, rim)) { escapes++; i = -1; continue; }
        pos.y = b.min.y - h; vel.y = Math.min(0, vel.y) - 0.5;
        c.lastBonk = b.id;
        events?.emit('bonk', { surfaceId: b.id, collider: b });
        return;
      }
      pos.y = ny; c.grounded = false;
    }
  }

  // maxPush: how far he may be slid sideways; inside: allow it even when his centre is under the box.
  function edgeEscape(b, rr, maxPush, inside) {
    const inX = pos.x > b.min.x + 0.06 && pos.x < b.max.x - 0.06, inZ = pos.z > b.min.z + 0.06 && pos.z < b.max.z - 0.06;
    if (inX && inZ && !inside) return false;
    const opts = [];
    if (!inZ || inX) opts.push([0, b.min.z - rr - 1e-3 - pos.z], [0, b.max.z + rr + 1e-3 - pos.z]);
    if (!inX || inZ) opts.push([b.min.x - rr - 1e-3 - pos.x, 0], [b.max.x + rr + 1e-3 - pos.x, 0]);
    opts.sort((a, b2) => Math.abs(a[0] + a[1]) - Math.abs(b2[0] + b2[1]));
    for (const [dx, dz] of opts) {
      if (Math.abs(dx + dz) > maxPush) break;
      if (blocked(pos.x + dx, pos.z + dz, pos.y, c.radius)) continue;
      pos.x += dx; pos.z += dz;
      return true;
    }
    return false;
  }

  function land(hit) {
    const fallH = c.peakY - pos.y;
    c.airT = 0; c.jumping = false;
    events?.emit('land', { y: pos.y, surfaceId: hit.id, fallH });
    if (fallH > 0.25 && c.knockT <= 0) {
      setAnim('land', { once: true, fade: 0.05 });
      c.landT = 0.18;
    } else setAnim('loco');
  }

  function doJump() {
    vel.y = jumpV;
    c.grounded = false; c.jumping = true; c.coyoteT = 0; c.bufferT = 0; c.airT = 0;
    c.peakY = pos.y; c.takeoffY = pos.y;
    c.belly = Math.max(0.25, c.belly - 0.004);
    setAnim('jump_up', { once: true, fade: 0.06 });
    events?.emit('jump', { pos: pos.clone(), surfaceId: c.surfaceId });
  }

  function update(dt, input) {
    dt = Math.min(dt, 1 / 20);
    const inp = c.locked || c.knockT > 0 ? null : input;
    const mx = inp?.move.x || 0, my = inp?.move.y || 0;
    let mag = Math.min(1, Math.hypot(mx, my));

    camera.basis(fwd, right);
    wish.set(0, 0, 0).addScaledVector(fwd, my).addScaledVector(right, mx);
    if (wish.lengthSq() > 1e-6) wish.normalize();

    const bellyMul = 1.1 - 0.2 * c.belly;
    const top = TUNE.runSpeed * bellyMul * mag;
    const hv = Math.hypot(vel.x, vel.z);
    const acc = c.grounded ? (mag > 0.05 ? TUNE.accel : TUNE.decel) : TUNE.airAccel;
    if (c.knockT > 0) {
      c.knockT -= dt;
      vel.x *= Math.exp(-2.5 * dt); vel.z *= Math.exp(-2.5 * dt);
    } else {
      const tx = wish.x * top, tz = wish.z * top;
      const k = damp(acc * 0.6, dt);
      vel.x += (tx - vel.x) * k;
      vel.z += (tz - vel.z) * k;
      // Snappy stop so the cat doesn't skate.
      if (mag < 0.05 && c.grounded && hv < 0.25) { vel.x = 0; vel.z = 0; }
    }

    if (mag > 0.05 && c.knockT <= 0) {
      const want = Math.atan2(wish.x, wish.z);
      const cur = actor.root.rotation.y;
      actor.root.rotation.y = wrap(cur + wrap(want - cur) * damp(TUNE.turnRate * (c.grounded ? 1 : 0.6), dt));
    }

    // Jump: buffered press, coyote time, variable height.
    if (inp?.jumpPressed) c.bufferT = TUNE.buffer;
    else c.bufferT = Math.max(0, c.bufferT - dt);
    if (c.grounded) c.coyoteT = TUNE.coyote; else c.coyoteT = Math.max(0, c.coyoteT - dt);
    if (c.bufferT > 0 && c.coyoteT > 0 && !c.locked) doJump();
    if (c.jumping && vel.y > 0 && !(inp?.jumpHeld ?? true)) { vel.y *= TUNE.jumpCut; c.jumping = false; }

    // Landing assist: when dropping onto something higher than where we jumped from, bleed off
    // horizontal speed so a held stick doesn't carry the cat clean over a narrow top (fridge, sill).
    if (!c.grounded && c.jumpedT > 0.06 && c.knockT <= 0) {
      const g = groundBetween(pos.x, pos.z, (c.takeoffY ?? 0) + 0.15, pos.y, c.radius);
      if (g && g.y > (c.takeoffY ?? 0) + 0.15) {
        // ...unless something even higher lies just ahead (bench → counter): then keep going.
        const hs = Math.hypot(vel.x, vel.z) || 1;
        const ax = pos.x + (vel.x / hs) * 0.6, az = pos.z + (vel.z / hs) * 0.6;
        const ahead = groundBetween(ax, az, g.y + 0.1, pos.y + 0.7, c.radius);
        if (!ahead || ahead.y < pos.y - 0.05) { const k = Math.exp(-7 * dt); vel.x *= k; vel.z *= k; }
      }
    }
    depenetrate();
    // Substep so a fast cat can't tunnel thin colliders.
    const travel = Math.hypot(vel.x, vel.z) * dt + Math.abs(vel.y) * dt;
    const n = Math.min(6, Math.max(1, Math.ceil(travel / 0.08)));
    const sdt = dt / n;
    for (let i = 0; i < n; i++) {
      const wasGrounded = c.grounded;
      moveAxis('x', vel.x * sdt);
      moveAxis('z', vel.z * sdt);
      if (wasGrounded && vel.y <= 0) {
        const g = groundBetween(pos.x, pos.z, pos.y - TUNE.snapDown, pos.y + 0.02, c.radius);
        if (g) { pos.y = g.y; c.surfaceId = g.id; vel.y = 0; c.grounded = true; continue; }
        c.grounded = false; c.peakY = pos.y;
      }
      moveVertical(sdt);
    }
    c.jumpedT = c.grounded ? 0 : (c.jumpedT || 0) + dt;
    if (!c.grounded) { c.airT += dt; c.peakY = Math.max(c.peakY, pos.y); }
    if (pos.y < -5) { const s = world?.anchors?.get('playerSpawn'); c.teleport(s?.pos || new THREE.Vector3(2, 0, 2)); }

    c.speed = Math.hypot(vel.x, vel.z);
    if (c.speed > 2 && c.grounded) c.belly = Math.max(0.25, c.belly - 0.0025 * dt);

    // Animation state.
    if (c.landT > 0) c.landT -= dt;
    if (c.knockT > 0) { /* knockback clip playing */ }
    else if (!c.grounded) {
      if (vel.y < -1.2 && c.anim !== 'fall') setAnim('fall', { fade: 0.18 });
    } else if (!(c.landT > 0) || c.speed > 0.6) {
      if (c.anim !== 'loco' && c.anim !== 'idle_bored') setAnim('loco');
      if (c.anim === 'loco' && !c.animHold) actor.setMove?.(c.speed);
    }

    const active = mag > 0.05 || inp?.jumpPressed || inp?.any;
    if (active || c.locked) {
      if (c.anim === 'idle_bored') setAnim('loco');
      c.idleT = 0;
    } else if (c.grounded && c.speed < 0.05) {
      c.idleT += dt;
      if (c.idleT > TUNE.boredAfter && c.anim === 'loco') {
        c.idleT = -6;
        c.anim = 'idle_bored';
        Promise.resolve(actor.play?.('idle_bored', { once: true, loop: false, fade: 0.3 })).then(() => {
          if (c.anim === 'idle_bored') setAnim('loco');
        });
      }
    }
  }

  return c;
}
