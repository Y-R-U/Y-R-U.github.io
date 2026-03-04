// renderer.js - Two-canvas rendering pipeline
import { getShapeRenderer, isLineType } from './shapes/registry.js';

const HANDLE_SIZE = 8;
const HANDLE_COLOR = '#0066ff';

export function createRenderer(mainCanvas, overlayCanvas) {
  const mainCtx = mainCanvas.getContext('2d');
  const overlayCtx = overlayCanvas.getContext('2d');

  const renderer = {
    mainCtx,
    overlayCtx,
    mainCanvas,
    overlayCanvas,

    resize(width, height) {
      const dpr = window.devicePixelRatio || 1;
      for (const canvas of [mainCanvas, overlayCanvas]) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    },

    // Render all committed shapes on main canvas
    renderMain(state) {
      const ctx = mainCtx;
      const w = mainCanvas.width / (window.devicePixelRatio || 1);
      const h = mainCanvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      // White background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      // Draw layers bottom to top
      for (const layer of state.layers) {
        if (!layer.visible) continue;
        for (const shape of layer.shapes) {
          const sr = getShapeRenderer(shape.type);
          if (sr) {
            ctx.save();
            ctx.globalAlpha = shape.opacity != null ? shape.opacity : 1;
            sr.draw(ctx, shape);
            ctx.restore();
          }
        }
      }
    },

    // Render overlay: preview shape + selection handles
    renderOverlay(state, previewShape) {
      const ctx = overlayCtx;
      const w = overlayCanvas.width / (window.devicePixelRatio || 1);
      const h = overlayCanvas.height / (window.devicePixelRatio || 1);
      ctx.clearRect(0, 0, w, h);

      // Draw preview shape (being actively drawn)
      if (previewShape) {
        const sr = getShapeRenderer(previewShape.type);
        if (sr) {
          ctx.save();
          ctx.globalAlpha = 0.7;
          sr.draw(ctx, previewShape);
          ctx.restore();
        }
      }

      // Draw selection handles
      for (const shapeId of state.selectedShapeIds) {
        const found = state.findShapeById(shapeId);
        if (found) {
          this._drawSelectionHandles(ctx, found.shape);
        }
      }
    },

    _drawSelectionHandles(ctx, shape) {
      const sr = getShapeRenderer(shape.type);
      if (!sr) return;

      // Line-type shapes get endpoint handles
      if (isLineType(shape.type) && sr.getHandlePositions) {
        const handles = sr.getHandlePositions(shape);
        ctx.save();
        // Draw the line connecting handles (dashed)
        ctx.strokeStyle = HANDLE_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(handles[0].x, handles[0].y);
        ctx.lineTo(handles[1].x, handles[1].y);
        ctx.stroke();
        ctx.setLineDash([]);

        for (const h of handles) {
          this._drawHandle(ctx, h.x, h.y);
        }
        ctx.restore();
        return;
      }

      // Bounding-box shapes
      const bounds = sr.getBounds(shape);
      ctx.save();

      // Dashed bounding box
      ctx.strokeStyle = HANDLE_COLOR;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
      ctx.setLineDash([]);

      // 8 handles
      const handles = getHandlePositions(bounds);
      for (const h of handles) {
        this._drawHandle(ctx, h.x, h.y);
      }
      ctx.restore();
    },

    _drawHandle(ctx, x, y) {
      const s = HANDLE_SIZE;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = HANDLE_COLOR;
      ctx.lineWidth = 1.5;
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
      ctx.strokeRect(x - s / 2, y - s / 2, s, s);
    },
  };

  return renderer;
}

// Get 8 handle positions for a bounding box
export function getHandlePositions(bounds) {
  const { x, y, width: w, height: h } = bounds;
  return [
    { id: 'nw', x: x,       y: y,       cursor: 'nwse-resize' },
    { id: 'n',  x: x + w/2, y: y,       cursor: 'ns-resize' },
    { id: 'ne', x: x + w,   y: y,       cursor: 'nesw-resize' },
    { id: 'e',  x: x + w,   y: y + h/2, cursor: 'ew-resize' },
    { id: 'se', x: x + w,   y: y + h,   cursor: 'nwse-resize' },
    { id: 's',  x: x + w/2, y: y + h,   cursor: 'ns-resize' },
    { id: 'sw', x: x,       y: y + h,   cursor: 'nesw-resize' },
    { id: 'w',  x: x,       y: y + h/2, cursor: 'ew-resize' },
  ];
}

export function hitTestHandle(handles, px, py) {
  const tol = HANDLE_SIZE / 2 + 2;
  for (const h of handles) {
    if (Math.abs(px - h.x) <= tol && Math.abs(py - h.y) <= tol) {
      return h;
    }
  }
  return null;
}
