// tools/text-tool.js - Text box creation tool
import { generateId, ShapeType } from '../state.js';

export function createTextTool() {
  let startPos = null;
  let preview = null;

  function build(state, start, end) {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);

    return {
      id: generateId('shape'),
      type: ShapeType.TEXT,
      x, y, width: w, height: h,
      text: '',
      fontSize: 20,
      strokeColor: state.strokeColor,
      fillColor: state.fillColor,
      strokeWidth: state.strokeWidth,
      opacity: 1,
    };
  }

  return {
    name: 'text',
    cursor: 'text',
    onActivate() {},
    onDeactivate() { startPos = null; preview = null; },

    onMouseDown(e, state, pos) {
      const layer = state.getActiveLayer();
      if (!layer || !layer.visible) return;
      startPos = pos;
      preview = build(state, pos, pos);
    },

    onMouseMove(e, state, pos) {
      if (!startPos) return false;
      preview = build(state, startPos, pos);
      return true;
    },

    onMouseUp(e, state, pos, history) {
      if (!startPos) return;
      const shape = build(state, startPos, pos);
      startPos = null;
      preview = null;

      // If too small (click without drag), create default-sized text box
      if (shape.width < 20 || shape.height < 20) {
        shape.x = pos.x;
        shape.y = pos.y;
        shape.width = 200;
        shape.height = 60;
      }

      // Set font size based on box height
      shape.fontSize = Math.max(12, Math.min(48, Math.round(shape.height * 0.4)));

      const layer = state.getActiveLayer();
      if (!layer) return;

      history.push();
      layer.shapes.push(shape);
      state.selectedShapeIds = [shape.id];
      state.activeTool = 'select';
      state.emit('shapes-changed');
      state.emit('selection-changed');
      state.emit('tool-changed');

      // Trigger text editing after a microtask so DOM settles
      Promise.resolve().then(() => {
        state.emit('start-text-edit', shape.id);
      });
    },

    getPreviewShape() { return preview; },
  };
}
