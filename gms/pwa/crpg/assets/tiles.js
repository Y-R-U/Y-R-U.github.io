// ===== Canvas Draw Functions for Tile Types =====
// Additional decorative drawing on top of base tile rendering in renderer.js

export function drawGrass(ctx, x, y, ts) {
  // Subtle grass texture
  ctx.fillStyle = 'rgba(0,80,0,0.15)';
  const offsets = [[2,3],[8,6],[12,2],[5,10],[10,12]];
  ctx.font = '6px monospace';
  ctx.fillStyle = '#2a6a2a';
  for (const [ox, oy] of offsets) {
    if (Math.random() > 0.7) ctx.fillText("'", x + ox, y + oy);
  }
}

export function drawWater(ctx, x, y, ts, tick) {
  // Animated water ripples
  const phase = (tick * 0.05 + x * 0.3 + y * 0.2) % (Math.PI * 2);
  const alpha = 0.1 + Math.abs(Math.sin(phase)) * 0.1;
  ctx.fillStyle = `rgba(30,100,180,${alpha})`;
  ctx.fillRect(x, y, ts, ts);
}

export function drawTree(ctx, x, y, ts) {
  // Simple tree crown
  ctx.fillStyle = '#1a4a1a';
  ctx.fillRect(x + 3, y + 2, 10, 8);
  ctx.fillStyle = '#2a6a2a';
  ctx.fillRect(x + 4, y + 3, 8, 6);
}

export function drawBuilding(ctx, x, y, ts) {
  // Building stone texture
  ctx.fillStyle = '#3a2a10';
  ctx.fillRect(x, y, ts, ts);
  // Window glow
  ctx.fillStyle = 'rgba(255,200,100,0.2)';
  ctx.fillRect(x + 3, y + 3, 4, 4);
  ctx.fillRect(x + 9, y + 3, 4, 4);
}

export function drawDungeonEntrance(ctx, x, y, ts) {
  // Dark pit with glowing edge
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(x, y, ts, ts);
  ctx.strokeStyle = '#8B8B00';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
}

export function drawRoad(ctx, x, y, ts) {
  // Dirt road texture
  ctx.fillStyle = '#3a3020';
  ctx.fillRect(x, y, ts, ts);
  // Ruts
  ctx.strokeStyle = '#2a2010';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 4, y); ctx.lineTo(x + 4, y + ts);
  ctx.moveTo(x + 12, y); ctx.lineTo(x + 12, y + ts);
  ctx.stroke();
}
