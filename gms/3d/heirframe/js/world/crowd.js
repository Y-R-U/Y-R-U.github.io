import * as THREE from 'three';
import { enableReflect } from '../engine/player.js';

// Civilian robots. About half stroll between plaza waypoints; the rest loiter in small groups (talking, sitting on
// benches) and are quietly moved, while off-screen, to gathering spots near the player so the gameplay view stays lively.
const LOOPS = [
  [[-18, 20], [-22, -8], [-9, -24], [8, -26], [22, -10], [20, 16], [2, 26]],
  [[-12, 10], [-14, -4], [-4, -14], [10, -12], [13, 4], [4, 13]],
  [[10, 24], [18, 8], [6, 20], [-8, 22]],
  [[-6, -30], [-7, -50], [-6, -70], [6, -72], [7, -48], [6, -30]],
  [[26, 30], [34, 0], [34, -30], [24, -50], [16, -34], [20, 0]],
  [[-30, 30], [-40, 6], [-38, -24], [-26, -44], [-24, -20], [-26, 14]],
  [[-30, 60], [0, 50], [26, 62], [0, 70]],
];

const D2R = Math.PI / 180;
// Talk spots are group centres. Seats (benches, café stools) come from the world's furniture via ctx.gather.
function gatherSpots(world) {
  const S = [];
  for (const a of [30, 150, 250, 320]) S.push([Math.sin(a * D2R) * 8.2, Math.cos(a * D2R) * 8.2]);
  for (const a of [0, 90, 180, 270]) { const t = (a + 45.3) * D2R; S.push([Math.sin(t) * 15.2, Math.cos(t) * 15.2]); }
  S.push([-11.8, 15.8], [18.8, 11.5], [5, 27.5], [-6, 29], [24.5, 26.5], [-24, 2], [24, -6], [0, -24.5], [-19.5, -35], [-24.5, -42],
    [-8.5, -40], [8.5, -52], [-11, -47], [11, -59.5], [27.5, 19.5], [-30, 50], [4, 50], [24, 58]);
  return [...S.map(([x, z]) => ({ x, z, kind: 'talk' })), ...(world.ctx?.gather || []).map((g) => ({ ...g }))].map((g) => ({ ...g, taken: false }));
}

export function createCrowd(world, createRobot, count, quality) {
  const kinds = ['civ_gold', 'civ_chrome', 'civ_black', 'civ_gold', 'civ_chrome', 'civ_black', 'civ_worker'];
  const members = [];
  const spots = gatherSpots(world);
  const walkers = Math.max(1, Math.ceil(count * 0.45));
  for (let i = 0; i < count; i++) {
    const loop = LOOPS[i % LOOPS.length];
    let bot;
    try { bot = createRobot({ kind: kinds[i % kinds.length], seed: 100 + i * 17, quality: quality === 'high' ? 'high' : quality === 'low' ? 'low' : 'med', lod: 'far', merged: true }); }
    catch (e) { console.warn('crowd robot failed', e); break; }
    enableReflect(bot.root);
    world.scene.add(bot.root);
    const idx = (i * 3) % loop.length;
    const [x, z] = loop[idx];
    const m = { bot, loop, idx: (idx + 1) % loop.length, pos: new THREE.Vector3(x + (i % 3) - 1, 0, z + ((i * 7) % 3) - 1), yaw: 0,
      speed: 1.1 + ((i * 37) % 10) / 20, pause: 0, dir: i % 2 ? 1 : -1, loiter: i >= walkers, home: null, mode: 'walk', phase: i * 1.7,
      stroll: i < walkers && i % 4 !== 0, goal: null };
    bot.root.position.copy(m.pos);
    members.push(m);
  }
  // loiterers in groups of 2–3
  const groups = [];
  const L = members.filter((m) => m.loiter);
  for (let i = 0; i < L.length;) {
    const n = Math.min(L.length - i, (groups.length % 2) ? 2 : 3);
    groups.push({ members: L.slice(i, i + n), spot: null });
    i += n;
  }

  const tmp = new THREE.Vector3(), ndc = new THREE.Vector3();
  let clock = 0, reseat = 0;
  const onScreen = (x, z) => {
    ndc.set(x, 1, z).project(world.camera);
    return ndc.z < 1 && Math.abs(ndc.x) < 1.25 && Math.abs(ndc.y) < 1.3;
  };
  function place(g, spot) {
    if (g.spot) g.spot.taken = false;
    g.spot = spot; spot.taken = true;
    const n = g.members.length;
    g.members.forEach((m, k) => {
      let x, z, yaw, mode;
      if (spot.seats && k < spot.seats.length) {
        [x, z, yaw] = spot.seats[k]; mode = 'sit';
      } else if (spot.seats) {
        const S = spot.seats, cx = S.reduce((a, q) => a + q[0], 0) / S.length, cz = S.reduce((a, q) => a + q[1], 0) / S.length;
        let fx = S.reduce((a, q) => a + Math.sin(q[2]), 0) / S.length, fz = S.reduce((a, q) => a + Math.cos(q[2]), 0) / S.length;
        const fl = Math.hypot(fx, fz);
        if (fl > 0.5) { fx /= fl; fz /= fl; } else { const dx = S[1][0] - S[0][0], dz = S[1][1] - S[0][1], dl = Math.hypot(dx, dz) || 1; fx = dz / dl; fz = -dx / dl; }
        x = cx + fx * (fl > 0.5 ? 1.3 : 1.0); z = cz + fz * (fl > 0.5 ? 1.3 : 1.0); yaw = Math.atan2(cx - x, cz - z); mode = 'talk';
      } else {
        const a = (k / n) * Math.PI * 2 + spot.x * 0.37;
        const r = n === 2 ? 0.62 : 0.78;
        x = spot.x + Math.sin(a) * r; z = spot.z + Math.cos(a) * r;
        yaw = Math.atan2(spot.x - x, spot.z - z); mode = 'talk';
      }
      m.home = { x, z, yaw, mode };
      m.dy = mode === 'sit' ? 0.5 - (m.bot.seatHeight || 0.5) : 0;
      m.pos.set(x, world.groundAt(x, z) + m.dy, z); m.yaw = yaw; m.mode = mode;
      m.bot.root.position.copy(m.pos); m.bot.root.rotation.y = yaw;
      m.bot.setMove(0, 0);
      m.bot.play(mode === 'sit' ? 'sit' : (k % 2 ? 'idle' : 'talk'), { loop: true, fade: 0 });
      m.talkT = 2 + ((m.phase * 7) % 4);
    });
  }
  // A free patch of floor 6–13 m from the focus, off-screen, clear of props and other groups.
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  function openSpot(focus, initial, d0 = 5, d1 = 11) {
    for (let t = 0; t < 14; t++) {
      const a = rnd() * Math.PI * 2, d = d0 + rnd() * (d1 - d0);
      const x = focus.x + Math.sin(a) * d, z = focus.z + Math.cos(a) * d;
      if (world.blocked(x, z, 1.3) || Math.abs(world.groundAt(x, z) - focus.y) > 0.3) continue;
      if (!initial && onScreen(x, z)) continue;
      if (groups.some((g) => g.spot && Math.hypot(g.spot.x - x, g.spot.z - z) < 3.5)) continue;
      return { x, z, kind: 'talk', taken: false, temp: true };
    }
    return null;
  }
  // a point roughly across the player from where the stroller is, so walks cross the view
  function strollGoal(m, focus) {
    for (let t = 0; t < 10; t++) {
      const a = Math.atan2(focus.x - m.pos.x, focus.z - m.pos.z) + (rnd() - 0.5) * 1.6, d = 3 + rnd() * 7;
      const x = focus.x + Math.sin(a) * d, z = focus.z + Math.cos(a) * d;
      if (!world.blocked(x, z, 0.8) && Math.abs(world.groundAt(x, z) - focus.y) < 0.3) return [x, z];
    }
    return [m.loop[m.idx][0], m.loop[m.idx][1]];
  }
  function assign(focus, initial) {
    for (const g of groups) {
      const d = g.spot ? Math.hypot(g.spot.x - focus.x, g.spot.z - focus.z) : Infinity;
      if (d < 15) continue;
      if (!initial && g.members.some((m) => m.flee || m.mode === 'return' || onScreen(m.pos.x, m.pos.z))) continue;
      let best = null, bd = Infinity;
      for (const s of spots) {
        if (s.taken) continue;
        const ds = Math.hypot(s.x - focus.x, s.z - focus.z);
        if (ds < 4 || ds > 14 || (!initial && onScreen(s.x, s.z))) continue;
        const score = ds + ((s.x * 13.1 + s.z * 7.7 + clock) % 6);
        if (score < bd) { bd = score; best = s; }
      }
      if (!best || (!best.seats && rnd() < 0.5)) best = openSpot(focus, initial) || best;
      if (best) place(g, best);
    }
  }

  const face = (m, want, dt, k) => { m.yaw += Math.atan2(Math.sin(want - m.yaw), Math.cos(want - m.yaw)) * (1 - Math.exp(-dt * k)); };
  const crowd = {
    members,
    scare(x, z, r) {
      for (const m of members) {
        if (m.flee || Math.hypot(m.pos.x - x, m.pos.z - z) > r) continue;
        m.flee = { x, z, t: 3 + Math.random() * 2 };
        m.pause = 0;
        if (m.mode === 'sit' || m.mode === 'talk') m.bot.play('idle', { fade: 0.2 });
      }
    },
    update(dt, focus) {
      clock += dt;
      if ((reseat -= dt) <= 0) { assign(focus, clock < 1.5); reseat = 1.2; }
      for (const m of members) {
        const dist = m.pos.distanceTo(focus);
        const far = dist > 40;
        m.bot.root.visible = !far;
        // shadows and mirror images only up close: each robot costs ~5 draws per pass
        const close = dist < 13;
        if (close !== m.close) { m.close = close; m.bot.root.traverse((o) => { if (o.isMesh) { o.castShadow = close; close ? o.layers.enable(1) : o.layers.disable(1); } }); }
        if (m.flee) {
          // D15: civilians can't be hurt, but they do get out of the way of a fight
          m.flee.t -= dt;
          const fx = m.pos.x - m.flee.x, fz = m.pos.z - m.flee.z, fl = Math.hypot(fx, fz) || 1;
          face(m, Math.atan2(fx / fl, fz / fl), dt, 8);
          const sx = Math.sin(m.yaw) * 3.6 * dt, sz = Math.cos(m.yaw) * 3.6 * dt;
          if (!world.blocked(m.pos.x + sx, m.pos.z + sz, 0.4)) { m.pos.x += sx; m.pos.z += sz; } else m.yaw += 0.9 * m.dir;
          m.bot.setMove(3.6 / (m.bot.runSpeed || 4.5), 3.6);
          if (m.flee.t <= 0) { m.flee = null; if (m.home) m.mode = 'return'; }
        } else if (m.home && m.mode === 'return') {
          tmp.set(m.home.x - m.pos.x, 0, m.home.z - m.pos.z);
          const d = tmp.length();
          if (d < 0.25) {
            m.mode = m.home.mode; m.bot.setMove(0, 0);
            m.bot.play(m.mode === 'sit' ? 'sit' : 'talk', { loop: true, fade: 0.3 });
          } else {
            face(m, Math.atan2(tmp.x, tmp.z), dt, 6);
            const step = Math.min(d, 1.3 * dt);
            m.pos.x += Math.sin(m.yaw) * step; m.pos.z += Math.cos(m.yaw) * step;
            m.bot.setMove(1.3 / (m.bot.runSpeed || 4.5), 1.3);
          }
        } else if (m.home) {
          face(m, m.home.yaw, dt, 3);
          if (m.mode === 'talk' && !far && (m.talkT -= dt) <= 0) {
            m.talkT = 2.5 + ((m.phase * 13 + clock) % 4);
            m.speaking = !m.speaking;
            m.bot.play(m.speaking ? 'talk' : 'idle', { loop: true, fade: 0.35 });
          }
        } else {
          // strollers wander across the player's neighbourhood; the rest walk the long plaza loops
          if (m.stroll && (!m.goal || (dist > 26 && !onScreen(m.pos.x, m.pos.z)))) {
            if (dist > 26) { const p = openSpot(focus, false, 9, 13); if (p) m.pos.set(p.x, 0, p.z); }
            m.goal = strollGoal(m, focus);
          }
          const [tx, tz] = m.stroll && m.goal ? m.goal : m.loop[m.idx];
          tmp.set(tx - m.pos.x, 0, tz - m.pos.z);
          const d = tmp.length();
          if (m.pause > 0) { m.pause -= dt; m.bot.setMove(0, 0); }
          else if (d < 1.2 && m.stroll) { m.goal = strollGoal(m, focus); if (rnd() < 0.25) m.pause = 1 + rnd() * 3; }
          else if (d < 1.2) { m.idx = (m.idx + m.dir + m.loop.length) % m.loop.length; if (Math.random() < 0.3) m.pause = 1 + Math.random() * 3; }
          else {
            tmp.multiplyScalar(1 / d);
            // step around the player instead of through them
            const px = m.pos.x - focus.x, pz = m.pos.z - focus.z, pd = Math.hypot(px, pz);
            if (pd < 2.2 && pd > 1e-3) { const k = (2.2 - pd) / 2.2 * 2.5; tmp.x += px / pd * k; tmp.z += pz / pd * k; }
            face(m, Math.atan2(tmp.x, tmp.z), dt, 5);
            const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
            const step = m.speed * dt;
            if (!world.blocked(m.pos.x + fx * step, m.pos.z + fz * step, 0.4)) { m.pos.x += fx * step; m.pos.z += fz * step; }
            else { m.yaw += 0.8 * m.dir; }
            m.bot.setMove(m.speed / (m.bot.runSpeed || 4.5), m.speed);
          }
        }
        m.pos.y = world.groundAt(m.pos.x, m.pos.z) + (m.mode === 'sit' ? m.dy || 0 : 0);
        m.bot.root.position.copy(m.pos);
        m.bot.root.rotation.y = m.yaw;
        if (!far) m.bot.update(dt);
      }
    },
  };
  return crowd;
}
