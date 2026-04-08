'use strict';
/* ── minimap.js ── Mini-map canvas drawn each frame ── */

class MiniMap {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx    = this.canvas.getContext('2d');
    this.SIZE   = 130; // canvas px (styled to same in CSS)
    this.canvas.width  = this.SIZE;
    this.canvas.height = this.SIZE;
  }

  // Convert world coords → canvas px
  _w2c(wx, wz) {
    return {
      x: ((wx + MAP_HALF) / (MAP_HALF * 2)) * this.SIZE,
      y: ((wz + MAP_HALF) / (MAP_HALF * 2)) * this.SIZE,
    };
  }

  draw(player, enemies, collectibles) {
    const ctx  = this.ctx;
    const SIZE = this.SIZE;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // Background
    ctx.fillStyle = 'rgba(10,15,25,0.88)';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    for (let i = 1; i < 4; i++) {
      const p = (SIZE / 4) * i;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, SIZE); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(SIZE, p); ctx.stroke();
    }

    // Collectibles — tiny yellow dots
    ctx.fillStyle = '#FFD54F';
    for (const c of collectibles) {
      if (c.collected) continue;
      const p = this._w2c(c.mesh.position.x, c.mesh.position.z);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Enemies — coloured dots sized by crowd
    for (const e of enemies) {
      const p   = this._w2c(e.mesh.position.x, e.mesh.position.z);
      const hex = '#' + e.color.toString(16).padStart(6, '0');
      const r   = 3 + Math.min(6, e.crowdSize * 0.15);
      ctx.fillStyle = hex;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Player — blue dot with white ring
    const pp = this._w2c(player.mesh.position.x, player.mesh.position.z);
    const pr = 4 + Math.min(8, player.crowdSize * 0.12);
    ctx.fillStyle = '#29b6f6';
    ctx.beginPath();
    ctx.arc(pp.x, pp.y, pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(0.5, 0.5, SIZE - 1, SIZE - 1);
  }

  show() { document.getElementById('minimap-wrap').classList.remove('hidden'); }
  hide() { document.getElementById('minimap-wrap').classList.add('hidden'); }
}
