// Tiny canvas mini-map: shows arena, player, alive tanks, wrecks.

import { CFG } from './config.js';

const SIZE = 140;        // CSS pixels (square)
const PAD = 4;

export class Minimap {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'minimap';
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = SIZE * this.dpr;
    this.canvas.height = SIZE * this.dpr;
    this.canvas.style.width = SIZE + 'px';
    this.canvas.style.height = SIZE + 'px';
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(this.dpr, this.dpr);
    this.battle = null;
    this.hide();
  }

  setBattle(battle) { this.battle = battle; }
  show() { this.canvas.classList.remove('hidden'); }
  hide() { this.canvas.classList.add('hidden'); }

  draw() {
    if (!this.battle) return;
    const ctx = this.ctx;
    const r = CFG.world.arenaRadius;
    const half = SIZE / 2;
    const scale = (half - PAD) / r;

    // Background ring
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = 'rgba(8, 12, 26, 0.55)';
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0, 230, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.stroke();

    // crosshair
    ctx.strokeStyle = 'rgba(0, 230, 255, 0.18)';
    ctx.beginPath();
    ctx.moveTo(half, PAD); ctx.lineTo(half, SIZE - PAD);
    ctx.moveTo(PAD, half); ctx.lineTo(SIZE - PAD, half);
    ctx.stroke();

    const player = this.battle.player;
    // We rotate so player faces "up" on the minimap — north-up otherwise if no player.
    let cx = 0, cz = 0, yaw = 0;
    if (player) {
      cx = player.root.position.x;
      cz = player.root.position.z;
      yaw = player.root.rotation.y;
    }
    const cos = Math.cos(yaw), sin = Math.sin(yaw);

    for (const t of this.battle.tanks) {
      // World pos relative to player.
      const rx = t.root.position.x - cx;
      const rz = t.root.position.z - cz;
      // Rotate by -yaw so player faces up.
      const lx = rx * cos - rz * sin;
      const lz = rx * sin + rz * cos;
      // Map: world +x → screen +x, world +z → screen -y (so forward is up).
      const px = half + lx * scale;
      const py = half - lz * scale;
      if (px < 2 || px > SIZE - 2 || py < 2 || py > SIZE - 2) continue;

      if (!t.alive) {
        ctx.fillStyle = 'rgba(160, 160, 180, 0.5)';
        ctx.fillRect(px - 2, py - 2, 4, 4);
        continue;
      }
      if (t.isPlayer) {
        // arrow pointing up
        ctx.save();
        ctx.translate(px, py);
        ctx.fillStyle = '#ffd35e';
        ctx.shadowColor = '#ffb83b';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(4, 4);
        ctx.lineTo(0, 2);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = t.color.tag;
        ctx.shadowColor = t.color.glow;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }
}
