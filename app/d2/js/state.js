// state.js - Central state store with event emitter

let _idCounter = 0;
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${_idCounter++}`;
}

export const ShapeType = {
  RECT: 'rect',
  ELLIPSE: 'ellipse',
  LINE: 'line',
  ARROW: 'arrow',
  PATH: 'path',
  IMAGE: 'image',
  TEXT: 'text',
};

export function createState() {
  const state = {
    // Document
    layers: [],
    activeLayerId: null,

    // Selection
    selectedShapeIds: [],

    // Active tool
    activeTool: 'select',

    // Drawing properties
    strokeColor: '#000000',
    fillColor: null,
    strokeWidth: 2,

    // Transient (not in undo)
    _listeners: {},

    // Event emitter
    on(event, cb) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(cb);
    },

    off(event, cb) {
      if (!this._listeners[event]) return;
      this._listeners[event] = this._listeners[event].filter(fn => fn !== cb);
    },

    emit(event, data) {
      if (!this._listeners[event]) return;
      for (const cb of this._listeners[event]) cb(data);
    },

    // Helpers
    getActiveLayer() {
      return this.layers.find(l => l.id === this.activeLayerId) || null;
    },

    getSelectedShapes() {
      const ids = new Set(this.selectedShapeIds);
      const results = [];
      for (const layer of this.layers) {
        for (const shape of layer.shapes) {
          if (ids.has(shape.id)) results.push(shape);
        }
      }
      return results;
    },

    findShapeById(id) {
      for (const layer of this.layers) {
        const shape = layer.shapes.find(s => s.id === id);
        if (shape) return { shape, layer };
      }
      return null;
    },

    findShapeLayerIndex(id) {
      for (const layer of this.layers) {
        const idx = layer.shapes.findIndex(s => s.id === id);
        if (idx !== -1) return { layer, index: idx };
      }
      return null;
    },

    addLayer(name) {
      const layer = {
        id: generateId('layer'),
        name: name || `Layer ${this.layers.length + 1}`,
        visible: true,
        shapes: [],
      };
      this.layers.push(layer);
      this.activeLayerId = layer.id;
      this.emit('layers-changed');
      return layer;
    },

    deleteLayer(layerId) {
      const idx = this.layers.findIndex(l => l.id === layerId);
      if (idx === -1) return;
      this.layers.splice(idx, 1);
      // Remove selections that belonged to that layer
      // (shapes are gone, so just clear selection)
      this.selectedShapeIds = [];
      if (this.activeLayerId === layerId) {
        this.activeLayerId = this.layers.length > 0
          ? this.layers[Math.min(idx, this.layers.length - 1)].id
          : null;
      }
      this.emit('layers-changed');
      this.emit('selection-changed');
    },

    moveLayer(fromIndex, toIndex) {
      if (fromIndex === toIndex) return;
      const [layer] = this.layers.splice(fromIndex, 1);
      this.layers.splice(toIndex, 0, layer);
      this.emit('layers-changed');
    },

    // Serialize layers for undo/redo (deep clone, images as dataUrl)
    serializeLayers() {
      return JSON.parse(JSON.stringify(this.layers, (key, val) => {
        if (key === '_imageElement') return undefined;
        if (key === '_bounds') return undefined;
        return val;
      }));
    },

    restoreLayers(serialized) {
      this.layers = JSON.parse(JSON.stringify(serialized));
      // Restore _imageElement caches for image shapes
      for (const layer of this.layers) {
        for (const shape of layer.shapes) {
          if (shape.type === ShapeType.IMAGE && shape.dataUrl) {
            const img = new Image();
            img.src = shape.dataUrl;
            shape._imageElement = img;
          }
        }
      }
      // Fix activeLayerId if needed
      if (!this.layers.find(l => l.id === this.activeLayerId)) {
        this.activeLayerId = this.layers.length > 0 ? this.layers[this.layers.length - 1].id : null;
      }
      this.selectedShapeIds = [];
      this.emit('layers-changed');
      this.emit('selection-changed');
      this.emit('shapes-changed');
    },
  };

  return state;
}
