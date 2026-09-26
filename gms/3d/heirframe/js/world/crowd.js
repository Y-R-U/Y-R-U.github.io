import * as THREE from 'three';
import { enableReflect } from '../engine/player.js';

// Civilian robots strolling between plaza waypoints. Far ones are hidden and not animated.
const LOOPS = [
  [[-18, 20], [-22, -8], [-9, -24], [8, -26], [22, -10], [20, 16], [2, 26]],
  [[-12, 10], [-14, -4], [-4, -14], [10, -12], [13, 4], [4, 13]],
  [[10, 24], [18, 8], [6, 20], [-8, 22]],
  [[-6, -30], [-7, -50], [-6, -70], [6, -72], [7, -48], [6, -30]],
  [[26, 30], [34, 0], [34, -30], [24, -50], [16, -34], [20, 0]],
  [[-30, 30], [-40, 6], [-38, -24], [-26, -44], [-24, -20], [-26, 14]],
  [[-30, 60], [0, 50], [26, 62], [0, 70]],
];

export function createCrowd(world, createRobot, count, quality) {
  const kinds = ['civ_gold', 'civ_chrome', 'civ_black', 'civ_gold', 'civ_chrome', 'civ_black', 'civ_worker'];
  const members = [];
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
      speed: 1.1 + ((i * 37) % 10) / 20, pause: 0, dir: i % 2 ? 1 : -1 };
    bot.root.position.copy(m.pos);
    members.push(m);
  }
  const tmp = new THREE.Vector3();
  return {
    members,
    scare(x, z, r) {
      for (const m of members) {
        if (m.flee || Math.hypot(m.pos.x - x, m.pos.z - z) > r) continue;
        m.flee = { x, z, t: 3 + Math.random() * 2 };
        m.pause = 0;
      }
    },
    update(dt, focus) {
      for (const m of members) {
        const dist = m.pos.distanceTo(focus);
        const far = dist > 40;
        m.bot.root.visible = !far;
        // shadows and mirror images only up close: each robot costs ~5 draws per pass
        const close = dist < 18;
        if (close !== m.close) { m.close = close; m.bot.root.traverse((o) => { if (o.isMesh) { o.castShadow = close; close ? o.layers.enable(1) : o.layers.disable(1); } }); }
        const [tx, tz] = m.loop[m.idx];
        tmp.set(tx - m.pos.x, 0, tz - m.pos.z);
        const d = tmp.length();
        if (m.flee) {
          // D15: civilians can't be hurt, but they do get out of the way of a fight
          m.flee.t -= dt;
          const fx = m.pos.x - m.flee.x, fz = m.pos.z - m.flee.z, fl = Math.hypot(fx, fz) || 1;
          const want = Math.atan2(fx / fl, fz / fl);
          m.yaw += Math.atan2(Math.sin(want - m.yaw), Math.cos(want - m.yaw)) * (1 - Math.exp(-dt * 8));
          const sx = Math.sin(m.yaw) * 3.6 * dt, sz = Math.cos(m.yaw) * 3.6 * dt;
          if (!world.blocked(m.pos.x + sx, m.pos.z + sz, 0.4)) { m.pos.x += sx; m.pos.z += sz; } else m.yaw += 0.9 * m.dir;
          m.bot.setMove(3.6 / (m.bot.runSpeed || 4.5), 3.6);
          if (m.flee.t <= 0) m.flee = null;
        } else if (m.pause > 0) { m.pause -= dt; m.bot.setMove(0, 0); }
        else if (d < 1.2) { m.idx = (m.idx + m.dir + m.loop.length) % m.loop.length; if (Math.random() < 0.3) m.pause = 1 + Math.random() * 3; }
        else {
          tmp.multiplyScalar(1 / d);
          const want = Math.atan2(tmp.x, tmp.z);
          m.yaw += Math.atan2(Math.sin(want - m.yaw), Math.cos(want - m.yaw)) * (1 - Math.exp(-dt * 5));
          const fx = Math.sin(m.yaw), fz = Math.cos(m.yaw);
          const step = m.speed * dt;
          if (!world.blocked(m.pos.x + fx * step, m.pos.z + fz * step, 0.4)) { m.pos.x += fx * step; m.pos.z += fz * step; }
          else { m.yaw += 0.8 * m.dir; }
          m.bot.setMove(m.speed / (m.bot.runSpeed || 4.5), m.speed);
        }
        m.pos.y = world.groundAt(m.pos.x, m.pos.z);
        m.bot.root.position.copy(m.pos);
        m.bot.root.rotation.y = m.yaw;
        if (!far) m.bot.update(dt);
      }
    },
  };
}
