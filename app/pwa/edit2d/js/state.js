/* state.js – central state, layer management, undo/redo history */

import { generateId } from './utils.js';

// ── Default state ──
function createDefaultLayers(w, h) {
  const makeTileData = () => Array.from({ length: h }, () => new Array(w).fill(null));
  const makeCollData = () => Array.from({ length: h }, () => new Array(w).fill(0));
  return [
    { id: 'bg',        name: 'Background', type: 'tile',      visible: true, locked: false, opacity: 1, data: makeTileData() },
    { id: 'main',      name: 'Main',       type: 'tile',      visible: true, locked: false, opacity: 1, data: makeTileData() },
    { id: 'objects',   name: 'Objects',     type: 'object',    visible: true, locked: false, opacity: 1, objects: [] },
    { id: 'fg',        name: 'Foreground',  type: 'tile',      visible: true, locked: false, opacity: 1, data: makeTileData() },
    { id: 'collision', name: 'Collision',   type: 'collision', visible: true, locked: false, opacity: 0.5, data: makeCollData() },
  ];
}

const state = {
  map: { name: 'Untitled', width: 32, height: 24, tileSize: 16, backgroundColor: '#1a1a2e' },
  layers: [],
  activeLayerId: 'main',
  camera: { x: 0, y: 0, zoom: 1 },
  tool: 'brush',
  selectedTileId: null,
  brushSize: 1,
  showGrid: true,
  activePackId: 'placeholder',
  selection: null,
  collisionType: 1,
};

// Init layers
state.layers = createDefaultLayers(state.map.width, state.map.height);

// ── History ──
const history = { undoStack: [], redoStack: [], maxSize: 100 };

let dirtyFlag = true;
let onChangeCallbacks = [];

// ── Public API ──
export function getState() { return state; }

export function setState(partial) {
  Object.assign(state, partial);
  markDirty();
}

export function getActiveLayer() {
  return state.layers.find(l => l.id === state.activeLayerId) || state.layers[0];
}

export function getLayerById(id) {
  return state.layers.find(l => l.id === id);
}

export function markDirty() {
  dirtyFlag = true;
  onChangeCallbacks.forEach(fn => fn());
}

export function consumeDirty() {
  if (!dirtyFlag) return false;
  dirtyFlag = false;
  return true;
}

export function onChange(fn) { onChangeCallbacks.push(fn); }

// ── Map init / resize ──
export function initMap(w, h, tileSize) {
  state.map.width = w;
  state.map.height = h;
  state.map.tileSize = tileSize;
  state.layers = createDefaultLayers(w, h);
  state.activeLayerId = 'main';
  state.camera = { x: 0, y: 0, zoom: 1 };
  state.selection = null;
  history.undoStack.length = 0;
  history.redoStack.length = 0;
  markDirty();
}

export function resizeMap(newW, newH) {
  const oldW = state.map.width;
  const oldH = state.map.height;

  state.layers.forEach(layer => {
    if (layer.type === 'tile' || layer.type === 'collision') {
      const oldData = layer.data;
      const fill = layer.type === 'collision' ? 0 : null;
      const newData = Array.from({ length: newH }, (_, y) =>
        Array.from({ length: newW }, (_, x) =>
          y < oldData.length && x < (oldData[y] ? oldData[y].length : 0) ? oldData[y][x] : fill
        )
      );
      layer.data = newData;
    }
  });

  state.map.width = newW;
  state.map.height = newH;
  markDirty();
}

// ── Layer management ──
export function addLayer(type, name) {
  const id = generateId('layer_');
  const w = state.map.width, h = state.map.height;
  let layer;
  if (type === 'object') {
    layer = { id, name, type, visible: true, locked: false, opacity: 1, objects: [] };
  } else if (type === 'collision') {
    layer = { id, name, type, visible: true, locked: false, opacity: 0.5, data: Array.from({ length: h }, () => new Array(w).fill(0)) };
  } else {
    layer = { id, name, type: 'tile', visible: true, locked: false, opacity: 1, data: Array.from({ length: h }, () => new Array(w).fill(null)) };
  }
  state.layers.push(layer);
  markDirty();
  return layer;
}

export function removeLayer(id) {
  const idx = state.layers.findIndex(l => l.id === id);
  if (idx === -1 || state.layers.length <= 1) return;
  state.layers.splice(idx, 1);
  if (state.activeLayerId === id) state.activeLayerId = state.layers[0].id;
  markDirty();
}

export function moveLayer(id, dir) {
  const idx = state.layers.findIndex(l => l.id === id);
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= state.layers.length) return;
  [state.layers[idx], state.layers[newIdx]] = [state.layers[newIdx], state.layers[idx]];
  markDirty();
}

// ── Undo / Redo ──
export function pushAction(patch) {
  history.undoStack.push(patch);
  if (history.undoStack.length > history.maxSize) history.undoStack.shift();
  history.redoStack.length = 0;
}

export function undo() {
  const patch = history.undoStack.pop();
  if (!patch) return;
  applyPatchReverse(patch);
  history.redoStack.push(patch);
  markDirty();
}

export function redo() {
  const patch = history.redoStack.pop();
  if (!patch) return;
  applyPatchForward(patch);
  history.undoStack.push(patch);
  markDirty();
}

export function canUndo() { return history.undoStack.length > 0; }
export function canRedo() { return history.redoStack.length > 0; }

function applyPatchForward(patch) {
  const layer = getLayerById(patch.layerId);
  if (!layer) return;
  if (patch.type === 'tilePaint' || patch.type === 'collisionPaint') {
    patch.changes.forEach(c => { layer.data[c.y][c.x] = c.newValue; });
  } else if (patch.type === 'objectAdd') {
    layer.objects.push(patch.object);
  } else if (patch.type === 'objectRemove') {
    const idx = layer.objects.findIndex(o => o.id === patch.object.id);
    if (idx !== -1) layer.objects.splice(idx, 1);
  } else if (patch.type === 'objectMove') {
    const obj = layer.objects.find(o => o.id === patch.objectId);
    if (obj) { obj.x = patch.newX; obj.y = patch.newY; }
  }
}

function applyPatchReverse(patch) {
  const layer = getLayerById(patch.layerId);
  if (!layer) return;
  if (patch.type === 'tilePaint' || patch.type === 'collisionPaint') {
    patch.changes.forEach(c => { layer.data[c.y][c.x] = c.oldValue; });
  } else if (patch.type === 'objectAdd') {
    const idx = layer.objects.findIndex(o => o.id === patch.object.id);
    if (idx !== -1) layer.objects.splice(idx, 1);
  } else if (patch.type === 'objectRemove') {
    layer.objects.push(patch.object);
  } else if (patch.type === 'objectMove') {
    const obj = layer.objects.find(o => o.id === patch.objectId);
    if (obj) { obj.x = patch.oldX; obj.y = patch.oldY; }
  }
}

// ── Serialization (for io.js) ──
export function serialize() {
  return {
    edit2d: '1.0',
    name: state.map.name,
    width: state.map.width,
    height: state.map.height,
    tileSize: state.map.tileSize,
    backgroundColor: state.map.backgroundColor,
    assetPack: state.activePackId,
    layers: state.layers.map(l => {
      const base = { id: l.id, name: l.name, type: l.type, visible: l.visible, opacity: l.opacity };
      if (l.type === 'object') base.objects = l.objects;
      else base.data = l.data;
      return base;
    }),
    metadata: { createdAt: new Date().toISOString(), editor: 'Edit2D v1.0' },
  };
}

export function deserialize(json) {
  state.map.name = json.name || 'Untitled';
  state.map.width = json.width;
  state.map.height = json.height;
  state.map.tileSize = json.tileSize || 16;
  state.map.backgroundColor = json.backgroundColor || '#1a1a2e';
  state.activePackId = json.assetPack || 'placeholder';
  state.layers = json.layers.map(l => {
    const layer = { id: l.id, name: l.name, type: l.type, visible: l.visible !== false, locked: false, opacity: l.opacity ?? 1 };
    if (l.type === 'object') layer.objects = l.objects || [];
    else layer.data = l.data;
    return layer;
  });
  state.activeLayerId = state.layers[0]?.id || 'main';
  state.camera = { x: 0, y: 0, zoom: 1 };
  state.selection = null;
  history.undoStack.length = 0;
  history.redoStack.length = 0;
  markDirty();
}
