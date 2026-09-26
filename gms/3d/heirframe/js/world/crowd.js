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
// [x, z, kind, yaw] — 'talk' spots are group centres; 'sit' spots are bench centres with the facing yaw.
function gatherSpots() {
  const S = [];
  for (const a of [30, 150, 250, 320]) S.push([Math.sin(a * D2R) * 8.2, Math.cos(a * D2R) * 8.2, 'talk']);
  for (const a of [0, 90, 180, 270]) {
    const t = (a + 45) * D2R;
    S.push([Math.sin(t) * 12.5, Math.cos(t) * 12.5, 'sit', t + Math.PI / 2]);
    S.push([Math.sin(t + 0.3) * 15.2, Math.cos(t + 0.3) * 15.2, 'talk']);
  }
  S.push([-11.8, 15.8, 'talk'], [18.8, 11.5, 'talk'], [5, 27.5, 'talk'], [-6, 29, 'talk'], [24.5, 26.5, 'talk'],
    [-24, 2, 'talk'], [24, -6, 'talk'], [0, -24.5, 'talk'], [-19.5, -35, 'talk'], [-24.5, -42, 'talk'],
    [-8.5, -40, 'talk'], [8.5, -52, 'talk'], [-11, -47, 'talk'], [11, -59.5, 'talk'], [27.5, 19.5, 'talk'],
    [-6, -44, 'sit', 0], [6, -56, 'sit', Math.PI], [-30, 50, 'talk'], [4, 50, 'talk'], [24, 58, 'talk'],
    [-32, 55, 'sit', 0], [-15, 55, 'sit', 0], [2, 55, 'sit', 0], [19, 55, 'sit', 0]);
  return S.map(([x, z, kind, yaw = 0]) => ({ x, z, kind, yaw, taken: false }));
}

export function createCrowd(world, createRobot, count, quality) {
  const kinds = ['civ_gold', 'civ_chrome', 'civ_black', 'civ_gold', 'civ_chrome', 'civ_black', 'civ_worker'];
  const members = [];
  const spots = gatherSpots();
  const walkers = Math.max(1, Math.ceil(count * 0.45));
  for (let i = 0; i < count; i++) {
    const loop = LOOPS[i % LOOPS.length];
    let bot;
    try { bot = createRobot({ kind: kinds[i % kinds.length], seed: 100 + i * 17, quality: quality === 'high' ? 'high' : 'med', lod: 'far' }); }
    catch (e) { console.warn('crowd robot failed', e); break; }
    enableReflect(bot.root);
    world.scene.add(bot.root);
    const idx = (i * 3) % loop.length;
    const [x, z] = loop[idx];
    const m = { bot, loop, idx: (idx + 1) % loop.length, pos: new THREE.Vector3(x + (i % 3) - 1, 0, z + ((i * 7) % 3) - 1), yaw: 0,
      speed: 1.1 + ((i * 37) % 10) / 20, pause: 0, dir: i % 2 ? 1 : -1, loiter: i >= walkers, home: null, mode: 'walk', phase: i * 1.7 };
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
      if (spot.kind === 'sit') {
        const off = (k - (n - 1) / 2) * 0.85;
        const c = Math.cos(spot.yaw), s = Math.sin(spot.yaw);
        x = spot.x + off * c; z = spot.z - off * s; yaw = spot.yaw; mode = k < 2 ? 'sit' : 'talk';
        if (mode === 'talk') { x = spot.x + Math.sin(spot.yaw) * 1.3; z = spot.z + Math.cos(spot.yaw) * 1.3; yaw = spot.yaw + Math.PI; }
      } else {
        const a = (k / n) * Math.PI * 2 + spot.x * 0.37;
        const r = n === 2 ? 0.62 : 0.78;
        x = spot.x + Math.sin(a) * r; z = spot.z + Math.cos(a) * r;
        yaw = Math.atan2(spot.x - x, spot.z - z); mode = 'talk';
      }
      m.home = { x, z, yaw, mode };
      m.pos.set(x, world.groundAt(x, z), z); m.yaw = yaw; m.mode = mode;
      m.bot.root.position.copy(m.pos); m.bot.root.rotation.y = yaw;
      m.bot.setMove(0, 0);
      m.bot.play(mode === 'sit' ? 'sit' : (k % 2 ? 'idle' : 'talk'), { loop: true, fade: 0 });
      m.talkT = 2 + ((m.phase * 7) % 4);
    });
  }
  function assign(focus, initial) {
    for (const g of groups) {
      const d = g.spot ? Math.hypot(g.spot.x - focus.x, g.spot.z - focus.z) : Infinity;
      if (d < 30) continue;
      if (!initial && g.members.some((m) => m.flee || m.mode === 'return' || onScreen(m.pos.x, m.pos.z))) continue;
      let best = null, bd = Infinity;
      for (const s of spots) {
        if (s.taken) continue;
        const ds = Math.hypot(s.x - focus.x, s.z - focus.z);
        if (ds < 5 || ds > 26 || (!initial && onScreen(s.x, s.z))) continue;
        const score = ds + ((s.x * 13.1 + s.z * 7.7 + clock) % 6);
        if (score < bd) { bd = score; best = s; }
      }
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
        const close = dist < 18;
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
          const [tx, tz] = m.loop[m.idx];
          tmp.set(tx - m.pos.x, 0, tz - m.pos.z);
          const d = tmp.length();
          if (m.pause > 0) { m.pause -= dt; m.bot.setMove(0, 0); }
          else if (d < 1.2) { m.idx = (m.idx + m.dir + m.loop.length) % m.loop.length; if (Math.random() < 0.3) m.pause = 1 + Math.random() * 3; }
          else {
            tmp.multiplyScalar(1 / d);
            face(m, Math.atan2(tmp.x, tmp.z), dt, 5);
            const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
            const step = m.speed * dt;
            if (!world.blocked(m.pos.x + fx * step, m.pos.z + fz * step, 0.4)) { m.pos.x += fx * step; m.pos.z += fz * step; }
            else { m.yaw += 0.8 * m.dir; }
            m.bot.setMove(m.speed / (m.bot.runSpeed || 4.5), m.speed);
          }
        }
        m.pos.y = world.groundAt(m.pos.x, m.pos.z);
        m.bot.root.position.copy(m.pos);
        m.bot.root.rotation.y = m.yaw;
        if (!far) m.bot.update(dt);
      }
    },
  };
  return crowd;
}
