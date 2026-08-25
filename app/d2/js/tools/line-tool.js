// tools/line-tool.js - Line drawing tool (Shift = 45-degree snap)
import { generateId, ShapeType } from '../state.js';

function snapAngle(start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx);
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const dist = Math.hypot(dx, dy);
  return {
    x: start.x + dist * Math.cos(snapped),
    y: start.y + dist * Math.sin(snapped),
  };
}

export function createLineTool(shapeType = ShapeType.LINE) {
  let startPos = null;
  let preview = null;

  function build(state, start, end, shift) {
    const target = shift ? snapAngle(start, end) : end;
    return {
      id: generateId('shape'),
      type: shapeType,
      x1: start.x, y1: start.y,
      x2: target.x, y2: target.y,
      strokeColor: state.strokeColor,
      strokeWidth: state.strokeWidth,
      opacity: 1,
    };
  }

  return {
    name: shapeType,
    cursor: 'crosshair',
    onActivate() {},
    onDeactivate() { startPos = null; preview = null; },

    onMouseDown(e, state, pos) {
      const layer = state.getActiveLayer();
      if (!layer || !layer.visible) return;
      startPos = pos;
      preview = build(state, pos, pos, false);
    },

    onMouseMove(e, state, pos) {
      if (!startPos) return false;
      preview = build(state, startPos, pos, e.shiftKey);
      return true;
    },

    onMouseUp(e, state, pos, history) {
      if (!startPos) return;
      const shape = build(state, startPos, pos, e.shiftKey);
      startPos = null;
      preview = null;

      const len = Math.hypot(shape.x2 - shape.x1, shape.y2 - shape.y1);
      if (len < 3) return;

      const layer = state.getActiveLayer();
      if (!layer) return;

      history.push();
      layer.shapes.push(shape);
      state.selectedShapeIds = [shape.id];
      state.activeTool = 'select';
      state.emit('shapes-changed');
      state.emit('selection-changed');
      state.emit('tool-changed');
    },

    getPreviewShape() { return preview; },
  };
}
