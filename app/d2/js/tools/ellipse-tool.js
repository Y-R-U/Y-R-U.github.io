// tools/ellipse-tool.js - Ellipse drawing tool (Shift = circle)
import { generateId, ShapeType } from '../state.js';

export function createEllipseTool() {
  let startPos = null;
  let preview = null;

  function build(state, start, end, shift) {
    let x = Math.min(start.x, end.x);
    let y = Math.min(start.y, end.y);
    let w = Math.abs(end.x - start.x);
    let h = Math.abs(end.y - start.y);

    if (shift) {
      const size = Math.max(w, h);
      x = end.x < start.x ? start.x - size : start.x;
      y = end.y < start.y ? start.y - size : start.y;
      w = size;
      h = size;
    }

    return {
      id: generateId('shape'),
      type: ShapeType.ELLIPSE,
      x, y, width: w, height: h,
      strokeColor: state.strokeColor,
      fillColor: state.fillColor,
      strokeWidth: state.strokeWidth,
      opacity: 1,
    };
  }

  return {
    name: 'ellipse',
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

      if (shape.width < 2 || shape.height < 2) return;

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
