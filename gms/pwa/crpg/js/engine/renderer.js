// ===== Canvas Tile Renderer =====
import { TILE_SIZE, TILE_CHARS, TILE_COLORS, TILE_WALKABLE, TILES } from '../config.js';
import { getState } from '../state.js';
// joystick hint drawn lazily to avoid circular import
let _drawJoystickHint = null;
export function setJoystickHintFn(fn) { _drawJoystickHint = fn; }

let canvas, ctx, minimapCanvas, minimapCtx;
let camX = 0, camY = 0; // camera top-left in tile coords
let vpW = 0, vpH = 0;   // viewport size in tiles

const LERP_SPEED = 0.12;

export function initRenderer() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  minimapCanvas = document.getElementById('minimap-canvas');
  minimapCtx = minimapCanvas.getContext('2d');

  // Delay first resize by one rAF to ensure the flex layout has settled
  requestAnimationFrame(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  });
}

export function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  // Use offsetWidth/Height as fallback if clientWidth is 0
  const w = wrap.clientWidth  || wrap.offsetWidth  || window.innerWidth;
  const h = wrap.clientHeight || wrap.offsetHeight || Math.floor(window.innerHeight * 0.55);
  if (w < 10 || h < 10) return; // layout not ready yet
  canvas.width  = w;
  canvas.height = h;
  minimapCanvas.width  = 80;
  minimapCanvas.height = 80;
  vpW = Math.ceil(w / TILE_SIZE) + 2;
  vpH = Math.ceil(h / TILE_SIZE) + 2;
}

export function updateCamera(px, py) {
  const wrap = document.getElementById('canvas-wrap');
  const tw = wrap.clientWidth  / TILE_SIZE;
  const th = wrap.clientHeight / TILE_SIZE;
  const targetX = px - tw / 2;
  const targetY = py - th / 2;
  camX += (targetX - camX) * LERP_SPEED;
  camY += (targetY - camY) * LERP_SPEED;
}

export function worldToScreen(tx, ty) {
  return {
    sx: (tx - camX) * TILE_SIZE,
    sy: (ty - camY) * TILE_SIZE,
  };
}

export function screenToWorld(sx, sy) {
  return {
    tx: sx / TILE_SIZE + camX,
    ty: sy / TILE_SIZE + camY,
  };
}

// ===== Main Draw =====
export function draw(worldMap, entities, particles, isDungeon) {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTiles(worldMap, isDungeon);
  drawEntities(entities);
  drawParticlesOnCanvas(particles);
  if (_drawJoystickHint) _drawJoystickHint(ctx);
  drawMinimap(worldMap, entities, isDungeon);
}

// ===== Tile drawing =====
function drawTiles(worldMap, isDungeon) {
  if (!worldMap) return;
  const startX = Math.max(0, Math.floor(camX));
  const startY = Math.max(0, Math.floor(camY));
  const endX   = Math.min(worldMap.width  - 1, startX + vpW);
  const endY   = Math.min(worldMap.height - 1, startY + vpH);

  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      const tileId = worldMap.get(tx, ty);
      const tc = TILE_COLORS[tileId] || TILE_COLORS[0];
      const ch = TILE_CHARS[tileId] || '.';
      const { sx, sy } = worldToScreen(tx, ty);

      // Background
      ctx.fillStyle = tc.bg;
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

      // Glyph
      ctx.fillStyle = tc.fg;
      ctx.font = `${TILE_SIZE - 2}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(ch, sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 + 1);
    }
  }
}

// ===== Entity drawing =====
function drawEntities(entities) {
  if (!entities) return;
  for (const e of entities) {
    if (!e.visible) continue;
    const { sx, sy } = worldToScreen(e.x, e.y);
    const ts = TILE_SIZE;

    // Skip off-screen
    if (sx < -ts || sx > canvas.width + ts || sy < -ts || sy > canvas.height + ts) continue;

    // Entity background circle/square
    ctx.fillStyle = e.bgColor || '#333';
    ctx.fillRect(sx, sy, ts, ts);

    // Glyph
    ctx.fillStyle = e.color || '#fff';
    ctx.font = `bold ${ts - 2}px 'Courier New', monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(e.glyph, sx + ts / 2, sy + ts / 2 + 1);

    // HP bar for enemies
    if (e.hp !== undefined && e.maxHp !== undefined && e.type !== 'player') {
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = '#330000';
      ctx.fillRect(sx, sy - 4, ts, 3);
      ctx.fillStyle = pct > 0.5 ? '#00cc00' : pct > 0.25 ? '#ffaa00' : '#ff0000';
      ctx.fillRect(sx, sy - 4, ts * pct, 3);
    }

    // Target indicator
    if (e.targeted) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
    }

    // Boss crown
    if (e.boss) {
      ctx.fillStyle = '#9C27B0';
      ctx.font = `8px 'Courier New', monospace`;
      ctx.fillText('!', sx + ts / 2, sy - 2);
    }
  }
}

// ===== Particles drawn on canvas =====
function drawParticlesOnCanvas(particles) {
  if (!particles) return;
  for (const p of particles) {
    if (p.dead || p.domOnly) continue;
    const { sx, sy } = worldToScreen(p.wx, p.wy);
    const ax = sx + p.ox;
    const ay = sy + p.oy;
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.fillStyle = p.color;
    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(ax, ay, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'glyph') {
      ctx.font = `${p.size * 2}px 'Courier New', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.glyph || '*', ax, ay);
    } else {
      ctx.fillRect(ax - p.size / 2, ay - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

// ===== Minimap =====
function drawMinimap(worldMap, entities, isDungeon) {
  if (!worldMap || !minimapCtx) return;
  const mc = minimapCtx;
  mc.clearRect(0, 0, 80, 80);
  mc.fillStyle = '#000';
  mc.fillRect(0, 0, 80, 80);

  const scaleX = 80 / worldMap.width;
  const scaleY = 80 / worldMap.height;

  // Sample tiles
  for (let ty = 0; ty < worldMap.height; ty += 2) {
    for (let tx = 0; tx < worldMap.width; tx += 2) {
      const tileId = worldMap.get(tx, ty);
      const tc = TILE_COLORS[tileId] || TILE_COLORS[0];
      mc.fillStyle = tc.bg;
      mc.fillRect(tx * scaleX, ty * scaleY, scaleX * 2 + 1, scaleY * 2 + 1);
    }
  }

  // Player dot
  const state = getState();
  const px = state.player.x * scaleX;
  const py = state.player.y * scaleY;
  mc.fillStyle = '#fff';
  mc.fillRect(px - 1, py - 1, 3, 3);

  // Enemy dots
  if (entities) {
    for (const e of entities) {
      if (e.type === 'player') continue;
      mc.fillStyle = '#e94560';
      mc.fillRect(e.x * scaleX - 0.5, e.y * scaleY - 0.5, 2, 2);
    }
  }

  // Viewport rect
  const wrap = document.getElementById('canvas-wrap');
  mc.strokeStyle = 'rgba(255,255,255,0.3)';
  mc.lineWidth = 0.5;
  mc.strokeRect(
    camX * scaleX, camY * scaleY,
    (wrap.clientWidth / TILE_SIZE) * scaleX,
    (wrap.clientHeight / TILE_SIZE) * scaleY
  );
}

export function getCamX() { return camX; }
export function getCamY() { return camY; }
export function getCanvas() { return canvas; }
