// ===== Canvas Tile Renderer =====
import { TILE_SIZE, TILE_CHARS, TILE_COLORS } from '../config.js';
import { getState } from '../state.js';

let canvas, ctx, minimapCanvas, minimapCtx;
let camX = 0, camY = 0; // camera top-left in tile coords (float)
let vpW = 0, vpH = 0;   // viewport size in tiles

const LERP_SPEED = 0.12;
let _cameraSnapped = false;   // true after first valid snap

// Destination marker — set by main.js each frame
let _destMarker = null;  // { x, y } in tile coords
let _frameTick  = 0;

export function setDestMarker(m) { _destMarker = m; }

export function initRenderer() {
  canvas = document.getElementById('game-canvas');
  ctx    = canvas.getContext('2d');
  minimapCanvas = document.getElementById('minimap-canvas');
  minimapCtx    = minimapCanvas.getContext('2d');

  // Defer first resize one rAF so the flex layout has settled
  requestAnimationFrame(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  });
}

export function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  const w = wrap.clientWidth  || wrap.offsetWidth  || window.innerWidth;
  const h = wrap.clientHeight || wrap.offsetHeight || Math.floor(window.innerHeight * 0.55);
  if (w < 10 || h < 10) return;
  canvas.width  = w;
  canvas.height = h;
  minimapCanvas.width  = 80;
  minimapCanvas.height = 80;
  vpW = Math.ceil(w / TILE_SIZE) + 2;
  vpH = Math.ceil(h / TILE_SIZE) + 2;
}

export function updateCamera(px, py) {
  const w = canvas.width  || 390;
  const h = canvas.height || 400;
  const targetX = px - (w / TILE_SIZE) / 2;
  const targetY = py - (h / TILE_SIZE) / 2;
  // Snap instantly on the first frame where the canvas is properly sized
  if (!_cameraSnapped && canvas.width > 0) {
    camX = targetX;
    camY = targetY;
    _cameraSnapped = true;
  } else {
    camX += (targetX - camX) * LERP_SPEED;
    camY += (targetY - camY) * LERP_SPEED;
  }
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
export function draw(worldMap, entities, particles) {
  if (!ctx || !canvas.width) return;
  _frameTick++;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawTiles(worldMap);
  drawDestMarker();
  drawEntities(entities);
  drawParticlesOnCanvas(particles);
  drawMinimap(worldMap, entities);
}

// ===== Tile drawing =====
function drawTiles(worldMap) {
  if (!worldMap) return;
  const startX = Math.max(0, Math.floor(camX));
  const startY = Math.max(0, Math.floor(camY));
  const endX   = Math.min(worldMap.width  - 1, startX + vpW);
  const endY   = Math.min(worldMap.height - 1, startY + vpH);

  ctx.font = `${TILE_SIZE - 2}px 'Courier New', monospace`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  for (let ty = startY; ty <= endY; ty++) {
    for (let tx = startX; tx <= endX; tx++) {
      const tileId = worldMap.get(tx, ty);
      const tc  = TILE_COLORS[tileId] || TILE_COLORS[0];
      const ch  = TILE_CHARS[tileId]  || '.';
      const { sx, sy } = worldToScreen(tx, ty);

      ctx.fillStyle = tc.bg;
      ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);

      ctx.fillStyle = tc.fg;
      ctx.fillText(ch, sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 + 1);
    }
  }
}

// ===== Destination marker =====
function drawDestMarker() {
  if (!_destMarker) return;

  // Blink at ~2Hz
  const alpha = 0.4 + 0.5 * Math.abs(Math.sin(_frameTick * 0.08));
  const { sx, sy } = worldToScreen(_destMarker.x, _destMarker.y);
  const ts = TILE_SIZE;

  ctx.save();
  ctx.globalAlpha = alpha;

  // Teal square outline
  ctx.strokeStyle = '#4ecca3';
  ctx.lineWidth   = 2;
  ctx.strokeRect(sx + 2, sy + 2, ts - 4, ts - 4);

  // X cross inside
  ctx.beginPath();
  ctx.moveTo(sx + 5,      sy + 5);
  ctx.lineTo(sx + ts - 5, sy + ts - 5);
  ctx.moveTo(sx + ts - 5, sy + 5);
  ctx.lineTo(sx + 5,      sy + ts - 5);
  ctx.stroke();

  ctx.restore();
}

// ===== Entity drawing =====
function drawEntities(entities) {
  if (!entities) return;
  const ts = TILE_SIZE;

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  for (const e of entities) {
    if (!e.visible) continue;
    const { sx, sy } = worldToScreen(e.x, e.y);

    // Skip off-screen
    if (sx < -ts || sx > canvas.width + ts || sy < -ts || sy > canvas.height + ts) continue;

    // Background tile
    ctx.fillStyle = e.bgColor || '#333';
    ctx.fillRect(sx, sy, ts, ts);

    // Glyph or emoji
    if (e.emoji) {
      // Use system color-emoji font; avoid bold which breaks some platforms
      ctx.font = `${ts - 1}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
      ctx.fillText(e.emoji, sx + ts / 2, sy + ts / 2 + 1);
    } else {
      ctx.fillStyle = e.color || '#fff';
      ctx.font = `bold ${ts - 2}px 'Courier New', monospace`;
      ctx.fillText(e.glyph || '?', sx + ts / 2, sy + ts / 2 + 1);
    }

    // HP bar for enemies and NPCs (not player)
    if (e.hp !== undefined && e.maxHp !== undefined && e.type !== 'player' && e.maxHp < 9999) {
      const pct = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = '#330000';
      ctx.fillRect(sx, sy - 4, ts, 3);
      ctx.fillStyle = pct > 0.5 ? '#00cc00' : pct > 0.25 ? '#ffaa00' : '#ff0000';
      ctx.fillRect(sx, sy - 4, Math.ceil(ts * pct), 3);
    }

    // Target / selection ring
    if (e.targeted) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth   = 1.5;
      ctx.strokeRect(sx + 0.5, sy + 0.5, ts - 1, ts - 1);
    }

    // Boss indicator
    if (e.boss) {
      ctx.fillStyle = '#9C27B0';
      ctx.font = '9px monospace';
      ctx.fillText('★', sx + ts / 2, sy - 4);
    }
  }
}

// ===== Canvas particles =====
function drawParticlesOnCanvas(particles) {
  if (!particles) return;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  for (const p of particles) {
    if (p.dead || p.domOnly) continue;
    const { sx, sy } = worldToScreen(p.wx, p.wy);
    const ax = sx + p.ox;
    const ay = sy + p.oy;
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.fillStyle   = p.color;
    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(ax, ay, p.size, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === 'glyph') {
      ctx.font = `${p.size * 2}px 'Courier New', monospace`;
      ctx.fillText(p.glyph || '*', ax, ay);
    } else {
      ctx.fillRect(ax - p.size / 2, ay - p.size / 2, p.size, p.size);
    }
  }
  ctx.globalAlpha = 1;
}

// ===== Minimap =====
function drawMinimap(worldMap, entities) {
  if (!worldMap || !minimapCtx) return;
  const mc     = minimapCtx;
  const mw     = 80, mh = 80;
  const scaleX = mw / worldMap.width;
  const scaleY = mh / worldMap.height;

  mc.clearRect(0, 0, mw, mh);
  mc.fillStyle = '#000';
  mc.fillRect(0, 0, mw, mh);

  // Tiles (every 2nd for speed)
  for (let ty = 0; ty < worldMap.height; ty += 2) {
    for (let tx = 0; tx < worldMap.width; tx += 2) {
      const tc = TILE_COLORS[worldMap.get(tx, ty)] || TILE_COLORS[0];
      mc.fillStyle = tc.bg;
      mc.fillRect(tx * scaleX, ty * scaleY, scaleX * 2 + 1, scaleY * 2 + 1);
    }
  }

  // Destination marker
  if (_destMarker) {
    mc.fillStyle = '#4ecca3';
    mc.fillRect(_destMarker.x * scaleX - 1, _destMarker.y * scaleY - 1, 3, 3);
  }

  // Enemy dots
  if (entities) {
    mc.fillStyle = '#e94560';
    for (const e of entities) {
      if (e.type === 'player' || e.type === 'npc') continue;
      mc.fillRect(e.x * scaleX - 0.5, e.y * scaleY - 0.5, 2, 2);
    }
  }

  // Player dot (drawn last so it's always on top)
  const st = getState();
  mc.fillStyle = '#ffffff';
  mc.fillRect(st.player.x * scaleX - 1.5, st.player.y * scaleY - 1.5, 4, 4);

  // Viewport outline
  mc.strokeStyle = 'rgba(255,255,255,0.25)';
  mc.lineWidth   = 0.5;
  mc.strokeRect(
    camX * scaleX, camY * scaleY,
    (canvas.width  / TILE_SIZE) * scaleX,
    (canvas.height / TILE_SIZE) * scaleY
  );
}

export function getCamX() { return camX; }
export function getCamY() { return camY; }
export function getCanvas() { return canvas; }

// Stubs kept so any remaining callers don't throw
export function setJoystickHintFn() {}
