// tools/draw-tool.js - Freehand drawing tool
import { generateId, ShapeType } from '../state.js';
import { PathShape } from '../shapes/path.js';

export function createDrawTool() {
  let points = [];
  let preview = null;
  let isDrawing = false;

  return {
    name: 'draw',
    cursor: 'crosshair',
    onActivate() {},
    onDeactivate() { points = []; preview = null; isDrawing = false; },

    onMouseDown(e, state, pos) {
      const layer = state.getActiveLayer();
      if (!layer || !layer.visible) return;
      isDrawing = true;
      points = [{ x: pos.x, y: pos.y }];
      preview = {
        id: generateId('shape'),
        type: ShapeType.PATH,
        points: [...points],
        strokeColor: state.strokeColor,
        strokeWidth: state.strokeWidth,
        opacity: 1,
      };
    },

    onMouseMove(e, state, pos) {
      if (!isDrawing) return false;
      points.push({ x: pos.x, y: pos.y });
      preview = {
        ...preview,
        points: [...points],
      };
      return true;
    },

    onMouseUp(e, state, pos, history) {
      if (!isDrawing) return;
      isDrawing = false;
      points.push({ x: pos.x, y: pos.y });

      if (points.length < 2) { preview = null; return; }

      // Simplify path
      const simplified = PathShape.simplify(points, 1.5);

      const shape = {
        id: generateId('shape'),
        type: ShapeType.PATH,
        points: simplified,
        strokeColor: state.strokeColor,
        strokeWidth: state.strokeWidth,
        opacity: 1,
      };

      const layer = state.getActiveLayer();
      if (!layer) { preview = null; return; }

      history.push();
      layer.shapes.push(shape);
      state.emit('shapes-changed');

      points = [];
      preview = null;
    },

    getPreviewShape() { return preview; },
  };
}
