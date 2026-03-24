/* canvas.js – canvas renderer: grid, tiles, objects, camera transforms */

import { getState, consumeDirty } from './state.js';
import { getTile } from './assets.js';
import { COLLISION_TYPES } from './tools.js';

let cvs, ctx;
let dpr = 1;
let rafId = null;

// Ghost tile preview (set by editor.js)
let ghostTile = null;   // { col, row, tileId }
let ghostObject = null; // { x, y, tileId }

export function init(canvasEl) {
  cvs = canvasEl;
  ctx = cvs.getContext('2d');
  dpr = window.devicePixelRatio || 1;
  handleResize();
  window.addEventListener('resize', handleResize);
  startLoop();
}

function handleResize() {
  const rect = cvs.parentElement.getBoundingClientRect();
  cvs.style.width = rect.width + 'px';
  cvs.style.height = rect.height + 'px';
  cvs.width = rect.width * dpr;
  cvs.height = rect.height * dpr;
  markDirtyCanvas();
}

let canvasDirty = true;
export function markDirtyCanvas() { canvasDirty = true; }

function startLoop() {
  function frame() {
    if (consumeDirty()) canvasDirty = true;
    if (canvasDirty) { render(); canvasDirty = false; }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}

export function setGhostTile(col, row, tileId) {
  ghostTile = (tileId != null) ? { col, row, tileId } : null;
  markDirtyCanvas();
}

export function setGhostObject(x, y, tileId) {
  ghostObject = (tileId != null) ? { x, y, tileId } : null;
  markDirtyCanvas();
}

// ── Coordinate conversion ──
export function screenToWorld(sx, sy) {
  const s = getState();
  const z = s.camera.zoom;
  return {
    x: (sx * dpr - cvs.width / 2) / z + s.camera.x,
    y: (sy * dpr - cvs.height / 2) / z + s.camera.y,
  };
}

export function worldToScreen(wx, wy) {
  const s = getState();
  const z = s.camera.zoom;
  return {
    x: ((wx - s.camera.x) * z + cvs.width / 2) / dpr,
    y: ((wy - s.camera.y) * z + cvs.height / 2) / dpr,
  };
}

export function worldToTile(wx, wy) {
  const ts = getState().map.tileSize;
  return { col: Math.floor(wx / ts), row: Math.floor(wy / ts) };
}

export function getCanvasSize() {
  return { width: cvs.width / dpr, height: cvs.height / dpr };
}

// ── Rendering ──
function render() {
  const s = getState();
  const z = s.camera.zoom;
  const ts = s.map.tileSize;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cvs.width, cvs.height);

  // Background
  ctx.fillStyle = s.map.backgroundColor;
  ctx.fillRect(0, 0, cvs.width, cvs.height);

  // Camera transform
  ctx.setTransform(dpr * z, 0, 0, dpr * z,
    cvs.width / 2 - s.camera.x * dpr * z,
    cvs.height / 2 - s.camera.y * dpr * z);

  // Map bounds background
  ctx.fillStyle = '#252538';
  ctx.fillRect(0, 0, s.map.width * ts, s.map.height * ts);

  // Draw layers back to front
  s.layers.forEach(layer => {
    if (!layer.visible) return;
    ctx.globalAlpha = layer.opacity;

    if (layer.type === 'tile') drawTileLayer(layer, ts);
    else if (layer.type === 'object') drawObjectLayer(layer, ts);
    else if (layer.type === 'collision') drawCollisionLayer(layer, ts);

    ctx.globalAlpha = 1;
  });

  // Ghost preview
  if (ghostTile) {
    ctx.globalAlpha = 0.5;
    drawSingleTile(ghostTile.col, ghostTile.row, ghostTile.tileId, ts);
    ctx.globalAlpha = 1;
  }
  if (ghostObject) {
    ctx.globalAlpha = 0.5;
    drawSingleTileAtPixel(ghostObject.x, ghostObject.y, ghostObject.tileId, ts);
    ctx.globalAlpha = 1;
  }

  // Grid
  if (s.showGrid) drawGrid(s, ts);

  // Selection
  if (s.selection) drawSelection(s.selection, ts);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

function drawTileLayer(layer, ts) {
  const s = getState();
  // Calculate visible range for culling
  const { startCol, startRow, endCol, endRow } = getVisibleRange(s, ts);

  for (let y = startRow; y <= endRow; y++) {
    if (!layer.data[y]) continue;
    for (let x = startCol; x <= endCol; x++) {
      const tileId = layer.data[y][x];
      if (!tileId) continue;
      drawSingleTile(x, y, tileId, ts);
    }
  }
}

function drawSingleTile(col, row, tileId, ts) {
  const tile = getTile(tileId);
  if (!tile) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tile.image, tile.sx, tile.sy, tile.sw, tile.sh, col * ts, row * ts, ts, ts);
}

function drawSingleTileAtPixel(px, py, tileId, ts) {
  const tile = getTile(tileId);
  if (!tile) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tile.image, tile.sx, tile.sy, tile.sw, tile.sh, px - ts / 2, py - ts / 2, ts, ts);
}

function drawObjectLayer(layer, ts) {
  layer.objects.forEach(obj => {
    const tile = getTile(obj.tileId);
    if (!tile) return;
    ctx.imageSmoothingEnabled = false;
    const w = obj.width || ts;
    const h = obj.height || ts;
    ctx.drawImage(tile.image, tile.sx, tile.sy, tile.sw, tile.sh, obj.x - w / 2, obj.y - h / 2, w, h);

    // Selection highlight for objects
    if (obj._selected) {
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 1 / getState().camera.zoom;
      ctx.strokeRect(obj.x - w / 2 - 1, obj.y - h / 2 - 1, w + 2, h + 2);
    }
  });
}

function drawCollisionLayer(layer, ts) {
  const s = getState();
  const { startCol, startRow, endCol, endRow } = getVisibleRange(s, ts);

  for (let y = startRow; y <= endRow; y++) {
    if (!layer.data[y]) continue;
    for (let x = startCol; x <= endCol; x++) {
      const val = layer.data[y][x];
      if (!val) continue;
      const ct = COLLISION_TYPES[val];
      if (ct) {
        ctx.fillStyle = ct.color;
        ctx.fillRect(x * ts, y * ts, ts, ts);
        // Small type indicator
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = `${Math.max(8, ts / 2)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(val.toString(), x * ts + ts / 2, y * ts + ts / 2);
      }
    }
  }
}

function drawGrid(s, ts) {
  const { startCol, startRow, endCol, endRow } = getVisibleRange(s, ts);
  const mapW = s.map.width * ts;
  const mapH = s.map.height * ts;

  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.5 / s.camera.zoom;

  ctx.beginPath();
  for (let x = startCol; x <= endCol + 1; x++) {
    const px = x * ts;
    if (px < 0 || px > mapW) continue;
    ctx.moveTo(px, Math.max(0, startRow * ts));
    ctx.lineTo(px, Math.min(mapH, (endRow + 1) * ts));
  }
  for (let y = startRow; y <= endRow + 1; y++) {
    const py = y * ts;
    if (py < 0 || py > mapH) continue;
    ctx.moveTo(Math.max(0, startCol * ts), py);
    ctx.lineTo(Math.min(mapW, (endCol + 1) * ts), py);
  }
  ctx.stroke();

  // Map border
  ctx.strokeStyle = 'rgba(74,158,255,0.4)';
  ctx.lineWidth = 1.5 / s.camera.zoom;
  ctx.strokeRect(0, 0, mapW, mapH);
}

function drawSelection(sel, ts) {
  ctx.strokeStyle = '#4a9eff';
  ctx.lineWidth = 1.5 / getState().camera.zoom;
  ctx.setLineDash([4 / getState().camera.zoom, 4 / getState().camera.zoom]);
  ctx.strokeRect(sel.x * ts, sel.y * ts, sel.width * ts, sel.height * ts);
  ctx.setLineDash([]);
}

function getVisibleRange(s, ts) {
  const z = s.camera.zoom;
  const halfW = (cvs.width / dpr) / (2 * z);
  const halfH = (cvs.height / dpr) / (2 * z);
  return {
    startCol: Math.max(0, Math.floor((s.camera.x - halfW) / ts) - 1),
    startRow: Math.max(0, Math.floor((s.camera.y - halfH) / ts) - 1),
    endCol: Math.min(s.map.width - 1, Math.ceil((s.camera.x + halfW) / ts) + 1),
    endRow: Math.min(s.map.height - 1, Math.ceil((s.camera.y + halfH) / ts) + 1),
  };
}
