/* editor.js – editor logic: tool dispatch, brush, fill, objects, collision */

import { getState, setState, getActiveLayer, getLayerById, pushAction, undo, redo, markDirty } from './state.js';
import { screenToWorld, worldToTile, setGhostTile, setGhostObject, markDirtyCanvas } from './canvas.js';
import { onPointerDownCB, onPointerMoveCB, onPointerUpCB, onZoomCB, onPanCB, onKeyDownCB } from './input.js';
import { clamp } from './utils.js';
import { generateId } from './utils.js';

let painting = false;
let panning = false;
let panStart = { x: 0, y: 0 };
let lastTile = null;
let currentPatch = null;  // accumulating changes during a stroke
let selectedObjectId = null;
let objectDragging = false;
let objectDragStart = null;

export function init() {
  onPointerDownCB(handlePointerDown);
  onPointerMoveCB(handlePointerMove);
  onPointerUpCB(handlePointerUp);
  onZoomCB(handleZoom);
  onPanCB(handlePan);
  onKeyDownCB(handleKeyDown);
}

// ── Tool switching ──
export function setTool(name) {
  setState({ tool: name });
  clearSelection();
  updateStatus();
}

export function setCollisionType(type) {
  setState({ collisionType: type });
}

function clearSelection() {
  const s = getState();
  s.layers.forEach(l => {
    if (l.type === 'object') l.objects.forEach(o => { o._selected = false; });
  });
  selectedObjectId = null;
  setState({ selection: null });
}

// ── Pointer handlers ──
function handlePointerDown(sx, sy, button) {
  const s = getState();

  // Middle click = pan
  if (button === 1) {
    panning = true;
    panStart = { x: sx, y: sy };
    return;
  }

  // Right click = pick tile (eyedropper)
  if (button === 2) {
    const w = screenToWorld(sx, sy);
    const t = worldToTile(w.x, w.y);
    pickTile(t.col, t.row);
    return;
  }

  const tool = s.tool;

  if (tool === 'pan') {
    panning = true;
    panStart = { x: sx, y: sy };
    return;
  }

  const world = screenToWorld(sx, sy);
  const tile = worldToTile(world.x, world.y);
  const layer = getActiveLayer();

  if (tool === 'brush') {
    if (layer.type !== 'tile' || layer.locked) return;
    painting = true;
    currentPatch = { type: 'tilePaint', layerId: layer.id, changes: [] };
    paintAt(tile.col, tile.row);
    lastTile = tile;
  } else if (tool === 'eraser') {
    if ((layer.type !== 'tile' && layer.type !== 'collision') || layer.locked) return;
    painting = true;
    const patchType = layer.type === 'collision' ? 'collisionPaint' : 'tilePaint';
    currentPatch = { type: patchType, layerId: layer.id, changes: [] };
    eraseAt(tile.col, tile.row);
    lastTile = tile;
  } else if (tool === 'fill') {
    if (layer.type !== 'tile' || layer.locked) return;
    floodFill(tile.col, tile.row, s.selectedTileId);
  } else if (tool === 'collision') {
    if (layer.type !== 'collision' || layer.locked) return;
    painting = true;
    currentPatch = { type: 'collisionPaint', layerId: layer.id, changes: [] };
    paintCollisionAt(tile.col, tile.row);
    lastTile = tile;
  } else if (tool === 'object') {
    if (layer.type !== 'object' || layer.locked) return;
    placeObject(world.x, world.y);
  } else if (tool === 'select') {
    // Try selecting an object
    if (layer.type === 'object') {
      const obj = hitTestObject(layer, world.x, world.y);
      clearSelection();
      if (obj) {
        obj._selected = true;
        selectedObjectId = obj.id;
        objectDragging = true;
        objectDragStart = { x: obj.x, y: obj.y };
      }
      markDirty();
    }
  }
}

function handlePointerMove(sx, sy, buttons) {
  const s = getState();

  // Panning with middle button
  if (panning || (buttons & 4)) {
    const dx = sx - panStart.x;
    const dy = sy - panStart.y;
    s.camera.x -= dx / s.camera.zoom;
    s.camera.y -= dy / s.camera.zoom;
    panStart = { x: sx, y: sy };
    markDirtyCanvas();
    return;
  }

  const world = screenToWorld(sx, sy);
  const tile = worldToTile(world.x, world.y);
  const layer = getActiveLayer();

  if (painting) {
    if (s.tool === 'brush' && layer.type === 'tile') {
      if (lastTile) bresenhamLine(lastTile.col, lastTile.row, tile.col, tile.row, paintAt);
      else paintAt(tile.col, tile.row);
      lastTile = tile;
    } else if (s.tool === 'eraser') {
      if (lastTile) bresenhamLine(lastTile.col, lastTile.row, tile.col, tile.row, eraseAt);
      else eraseAt(tile.col, tile.row);
      lastTile = tile;
    } else if (s.tool === 'collision' && layer.type === 'collision') {
      if (lastTile) bresenhamLine(lastTile.col, lastTile.row, tile.col, tile.row, paintCollisionAt);
      else paintCollisionAt(tile.col, tile.row);
      lastTile = tile;
    }
  } else if (objectDragging && selectedObjectId) {
    const obj = findObject(selectedObjectId);
    if (obj) {
      obj.x = world.x;
      obj.y = world.y;
      markDirty();
    }
  } else {
    // Ghost preview
    if (s.tool === 'brush' && s.selectedTileId && layer.type === 'tile') {
      setGhostTile(tile.col, tile.row, s.selectedTileId);
    } else if (s.tool === 'object' && s.selectedTileId && layer.type === 'object') {
      setGhostObject(world.x, world.y, s.selectedTileId);
    } else if (s.tool === 'collision' && layer.type === 'collision') {
      setGhostTile(tile.col, tile.row, null);
    } else {
      setGhostTile(0, 0, null);
      setGhostObject(0, 0, null);
    }
  }

  updateCursorInfo(tile.col, tile.row);
}

function handlePointerUp(sx, sy) {
  if (panning) { panning = false; return; }

  if (painting && currentPatch && currentPatch.changes.length > 0) {
    pushAction(currentPatch);
  }
  painting = false;
  currentPatch = null;
  lastTile = null;

  if (objectDragging && selectedObjectId) {
    const obj = findObject(selectedObjectId);
    if (obj && objectDragStart) {
      if (obj.x !== objectDragStart.x || obj.y !== objectDragStart.y) {
        const layer = getActiveLayer();
        pushAction({
          type: 'objectMove', layerId: layer.id, objectId: obj.id,
          oldX: objectDragStart.x, oldY: objectDragStart.y,
          newX: obj.x, newY: obj.y,
        });
      }
    }
    objectDragging = false;
    objectDragStart = null;
  }
}

// ── Zoom ──
function handleZoom(factor, cx, cy) {
  const s = getState();
  const oldZoom = s.camera.zoom;
  const newZoom = clamp(oldZoom * factor, 0.25, 8);
  if (newZoom === oldZoom) return;

  // Zoom toward cursor position
  const world = screenToWorld(cx, cy);
  s.camera.zoom = newZoom;
  const worldAfter = screenToWorld(cx, cy);
  s.camera.x += world.x - worldAfter.x;
  s.camera.y += world.y - worldAfter.y;

  markDirtyCanvas();
  updateStatus();
}

function handlePan(dx, dy) {
  const s = getState();
  s.camera.x -= dx / s.camera.zoom;
  s.camera.y -= dy / s.camera.zoom;
  markDirtyCanvas();
}

// ── Keyboard ──
function handleKeyDown(e) {
  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
  if (ctrl && e.key === 'z' && e.shiftKey)  { e.preventDefault(); redo(); return; }
  if (ctrl && e.key === 'y')                 { e.preventDefault(); redo(); return; }

  if (ctrl) return; // don't intercept other ctrl combos

  switch (e.key.toLowerCase()) {
    case 'b': setTool('brush'); break;
    case 'e': setTool('eraser'); break;
    case 'f': setTool('fill'); break;
    case 's': setTool('select'); break;
    case 'o': setTool('object'); break;
    case 'c': setTool('collision'); break;
    case 'h': setTool('pan'); break;
    case 'g': setState({ showGrid: !getState().showGrid }); markDirtyCanvas(); break;
    case 'delete': case 'backspace':
      if (selectedObjectId) deleteSelectedObject();
      break;
  }
  updateToolbar();
}

// ── Paint operations ──
function paintAt(col, row) {
  const s = getState();
  const layer = getActiveLayer();
  if (!s.selectedTileId) return;
  if (col < 0 || col >= s.map.width || row < 0 || row >= s.map.height) return;
  if (layer.data[row][col] === s.selectedTileId) return; // no-op

  const oldVal = layer.data[row][col];
  layer.data[row][col] = s.selectedTileId;
  if (currentPatch) currentPatch.changes.push({ x: col, y: row, oldValue: oldVal, newValue: s.selectedTileId });
  markDirty();
}

function eraseAt(col, row) {
  const s = getState();
  const layer = getActiveLayer();
  if (col < 0 || col >= s.map.width || row < 0 || row >= s.map.height) return;
  const fill = layer.type === 'collision' ? 0 : null;
  if (layer.data[row][col] === fill) return;

  const oldVal = layer.data[row][col];
  layer.data[row][col] = fill;
  if (currentPatch) currentPatch.changes.push({ x: col, y: row, oldValue: oldVal, newValue: fill });
  markDirty();
}

function paintCollisionAt(col, row) {
  const s = getState();
  const layer = getActiveLayer();
  if (col < 0 || col >= s.map.width || row < 0 || row >= s.map.height) return;
  if (layer.data[row][col] === s.collisionType) return;

  const oldVal = layer.data[row][col];
  layer.data[row][col] = s.collisionType;
  if (currentPatch) currentPatch.changes.push({ x: col, y: row, oldValue: oldVal, newValue: s.collisionType });
  markDirty();
}

// ── Flood fill ──
function floodFill(startCol, startRow, tileId) {
  const s = getState();
  const layer = getActiveLayer();
  if (!tileId || layer.type !== 'tile') return;
  if (startCol < 0 || startCol >= s.map.width || startRow < 0 || startRow >= s.map.height) return;

  const target = layer.data[startRow][startCol];
  if (target === tileId) return;

  const changes = [];
  const visited = new Set();
  const queue = [[startCol, startRow]];

  while (queue.length > 0) {
    const [cx, cy] = queue.shift();
    const key = `${cx},${cy}`;
    if (visited.has(key)) continue;
    if (cx < 0 || cx >= s.map.width || cy < 0 || cy >= s.map.height) continue;
    if (layer.data[cy][cx] !== target) continue;

    visited.add(key);
    changes.push({ x: cx, y: cy, oldValue: layer.data[cy][cx], newValue: tileId });
    layer.data[cy][cx] = tileId;

    queue.push([cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]);
  }

  if (changes.length > 0) {
    pushAction({ type: 'tilePaint', layerId: layer.id, changes });
  }
  markDirty();
}

// ── Object operations ──
function placeObject(worldX, worldY) {
  const s = getState();
  const layer = getActiveLayer();
  if (!s.selectedTileId || layer.type !== 'object') return;

  const obj = {
    id: generateId('obj_'),
    tileId: s.selectedTileId,
    x: worldX,
    y: worldY,
    width: s.map.tileSize,
    height: s.map.tileSize,
    rotation: 0,
    props: {},
  };
  layer.objects.push(obj);
  pushAction({ type: 'objectAdd', layerId: layer.id, object: { ...obj } });
  markDirty();
}

function hitTestObject(layer, wx, wy) {
  const ts = getState().map.tileSize;
  // Iterate in reverse for top-most first
  for (let i = layer.objects.length - 1; i >= 0; i--) {
    const obj = layer.objects[i];
    const w = obj.width || ts;
    const h = obj.height || ts;
    if (wx >= obj.x - w / 2 && wx <= obj.x + w / 2 &&
        wy >= obj.y - h / 2 && wy <= obj.y + h / 2) {
      return obj;
    }
  }
  return null;
}

function findObject(id) {
  for (const layer of getState().layers) {
    if (layer.type === 'object') {
      const obj = layer.objects.find(o => o.id === id);
      if (obj) return obj;
    }
  }
  return null;
}

export function deleteSelectedObject() {
  if (!selectedObjectId) return;
  const layer = getActiveLayer();
  if (layer.type !== 'object') return;
  const idx = layer.objects.findIndex(o => o.id === selectedObjectId);
  if (idx === -1) return;
  const obj = layer.objects[idx];
  layer.objects.splice(idx, 1);
  pushAction({ type: 'objectRemove', layerId: layer.id, object: { ...obj } });
  selectedObjectId = null;
  markDirty();
}

// ── Eyedropper ──
function pickTile(col, row) {
  const s = getState();
  if (col < 0 || col >= s.map.width || row < 0 || row >= s.map.height) return;
  const layer = getActiveLayer();
  if (layer.type !== 'tile') return;
  const tileId = layer.data[row][col];
  if (tileId) {
    setState({ selectedTileId: tileId });
    // Update palette highlight
    document.querySelectorAll('.palette-tile').forEach(el => {
      el.classList.toggle('selected', el.dataset.tileId === tileId);
    });
  }
}

// ── Bresenham line for smooth brush strokes ──
function bresenhamLine(x0, y0, x1, y1, callback) {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  while (true) {
    callback(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx)  { err += dx; y0 += sy; }
  }
}

// ── Status bar helpers ──
let statusEl = null;
export function setStatusEl(el) { statusEl = el; }

function updateCursorInfo(col, row) {
  const s = getState();
  if (statusEl) {
    statusEl.textContent = `${s.map.width}x${s.map.height} | Tile: ${col},${row} | Zoom: ${Math.round(s.camera.zoom * 100)}%`;
  }
}

export function updateStatus() {
  const s = getState();
  if (statusEl) {
    statusEl.textContent = `${s.map.width}x${s.map.height} | Zoom: ${Math.round(s.camera.zoom * 100)}%`;
  }
  updateToolbar();
}

function updateToolbar() {
  const s = getState();
  document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === s.tool);
  });
}
