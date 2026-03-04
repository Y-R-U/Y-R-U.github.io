// tools/select-tool.js - Select, move, resize
import { getShapeRenderer, isLineType } from '../shapes/registry.js';
import { getHandlePositions, hitTestHandle } from '../renderer.js';

export function createSelectTool() {
  let mode = null;         // 'moving' | 'resizing' | null
  let startPos = null;
  let activeHandle = null;
  let originalShape = null;
  let targetShapeId = null;
  let lastCursor = 'default';

  function _hitTestShapeHandles(state, pos) {
    // Check handles of currently selected shape
    if (state.selectedShapeIds.length !== 1) return null;
    const found = state.findShapeById(state.selectedShapeIds[0]);
    if (!found) return null;
    const sr = getShapeRenderer(found.shape.type);
    if (!sr) return null;

    let handles;
    if (isLineType(found.shape.type) && sr.getHandlePositions) {
      handles = sr.getHandlePositions(found.shape);
    } else {
      handles = getHandlePositions(sr.getBounds(found.shape));
    }
    return hitTestHandle(handles, pos.x, pos.y);
  }

  function _hitTestAllShapes(state, pos) {
    // Top-to-bottom: last layer drawn is on top, last shape in layer is on top
    for (let i = state.layers.length - 1; i >= 0; i--) {
      const layer = state.layers[i];
      if (!layer.visible) continue;
      for (let j = layer.shapes.length - 1; j >= 0; j--) {
        const shape = layer.shapes[j];
        const sr = getShapeRenderer(shape.type);
        if (sr && sr.hitTest(shape, pos.x, pos.y)) {
          return { shape, layer };
        }
      }
    }
    return null;
  }

  return {
    name: 'select',
    cursor: 'default',

    onActivate() {},
    onDeactivate() {
      mode = null;
      startPos = null;
      activeHandle = null;
      originalShape = null;
    },

    onMouseDown(e, state, pos, history) {
      // 1. Check resize handles
      const handle = _hitTestShapeHandles(state, pos);
      if (handle) {
        mode = 'resizing';
        activeHandle = handle;
        startPos = pos;
        const found = state.findShapeById(state.selectedShapeIds[0]);
        originalShape = JSON.parse(JSON.stringify(found.shape));
        targetShapeId = found.shape.id;
        history.push();
        return;
      }

      // 2. Check shape hit
      const hit = _hitTestAllShapes(state, pos);
      if (hit) {
        state.selectedShapeIds = [hit.shape.id];
        state.emit('selection-changed');
        mode = 'moving';
        startPos = pos;
        originalShape = JSON.parse(JSON.stringify(hit.shape));
        targetShapeId = hit.shape.id;
        history.push();
        return;
      }

      // 3. Clicked empty space
      if (state.selectedShapeIds.length > 0) {
        state.selectedShapeIds = [];
        state.emit('selection-changed');
      }
      mode = null;
    },

    onMouseMove(e, state, pos) {
      if (!mode || !startPos) {
        // Just update cursor based on handle hover
        const handle = _hitTestShapeHandles(state, pos);
        if (handle) {
          lastCursor = handle.cursor;
          this.cursor = handle.cursor;
        } else {
          const hit = _hitTestAllShapes(state, pos);
          lastCursor = hit ? 'move' : 'default';
          this.cursor = lastCursor;
        }
        return false; // no overlay update needed
      }

      const dx = pos.x - startPos.x;
      const dy = pos.y - startPos.y;
      const found = state.findShapeById(targetShapeId);
      if (!found) return false;

      const sr = getShapeRenderer(found.shape.type);
      if (!sr) return false;

      if (mode === 'moving') {
        // Move shape
        if (sr.translate) {
          Object.assign(found.shape, sr.translate(originalShape, dx, dy));
        } else {
          found.shape.x = originalShape.x + dx;
          found.shape.y = originalShape.y + dy;
        }
        delete found.shape._bounds;
        return true; // needs redraw
      }

      if (mode === 'resizing') {
        const transformed = sr.transformByHandle(originalShape, activeHandle.id, dx, dy);
        Object.assign(found.shape, transformed);
        delete found.shape._bounds;
        return true;
      }

      return false;
    },

    onMouseUp(e, state, pos) {
      if (mode) {
        state.emit('shapes-changed');
      }
      mode = null;
      startPos = null;
      activeHandle = null;
      originalShape = null;
    },

    getPreviewShape() { return null; },
  };
}
