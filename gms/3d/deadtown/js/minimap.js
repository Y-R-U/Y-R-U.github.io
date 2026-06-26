// Top-down minimap: the street grid, buildings (open = green, barricaded =
// grey), zombies as red blips and the player as a facing triangle. North-up,
// whole-town overview. Pure draw — main calls update() with current state.

import { CFG } from './config.js';
import { ROADS } from './world.js';

export function createMinimap(canvas) {
  const g = canvas.getContext('2d');
  const SZ = canvas.width;                 // square
  const H = CFG.townHalf;
  const span = H * 2;
  const mx = (x) => (x + H) / span * SZ;
  const my = (z) => (z + H) / span * SZ;
  const ms = (d) => d / span * SZ;

  return {
    update({ player, zombies, buildings }) {
      g.clearRect(0, 0, SZ, SZ);
      // ground
      g.fillStyle = '#23251f'; g.fillRect(0, 0, SZ, SZ);
      // roads
      g.fillStyle = '#3c3e36';
      for (const x of ROADS.vert) g.fillRect(mx(x) - ms(ROADS.half), 0, ms(ROADS.half * 2), SZ);
      for (const z of ROADS.horiz) g.fillRect(0, my(z) - ms(ROADS.half), SZ, ms(ROADS.half * 2));
      // buildings
      for (const b of (buildings || [])) {
        g.fillStyle = b.locked ? 'rgba(150,150,140,0.55)' : 'rgba(90,200,120,0.6)';
        g.fillRect(mx(b.x - b.hx), my(b.z - b.hz), ms(b.hx * 2), ms(b.hz * 2));
        if (!b.locked) { g.strokeStyle = '#7af0a0'; g.lineWidth = 1; g.strokeRect(mx(b.x - b.hx), my(b.z - b.hz), ms(b.hx * 2), ms(b.hz * 2)); }
      }
      // zombies
      g.fillStyle = '#ff4536';
      for (const z of (zombies || [])) {
        if (!z.alive) continue;
        g.beginPath(); g.arc(mx(z.group.position.x), my(z.group.position.z), 2.2, 0, 7); g.fill();
      }
      // player (triangle pointing along world-forward; map: +x→right, +z→down)
      if (player) {
        const px = mx(player.pos.x), py = my(player.pos.z), r = 5.5;
        const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);   // forward (x,z)
        const ex = fz, ez = -fx;                                       // perp
        const bx = px - fx * r * 0.7, by = py - fz * r * 0.7;          // tail centre
        g.fillStyle = '#ffe24a'; g.strokeStyle = '#1a1a14'; g.lineWidth = 1;
        g.beginPath();
        g.moveTo(px + fx * r, py + fz * r);
        g.lineTo(bx + ex * r * 0.7, by + ez * r * 0.7);
        g.lineTo(bx - ex * r * 0.7, by - ez * r * 0.7);
        g.closePath(); g.fill(); g.stroke();
      }
    },
  };
}
