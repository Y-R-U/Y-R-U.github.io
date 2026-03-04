// shapes/ellipse.js - Ellipse renderer
import { transformBounds } from './utils.js';

export const EllipseShape = {
  draw(ctx, shape) {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    const rx = Math.abs(shape.width / 2);
    const ry = Math.abs(shape.height / 2);
    if (rx < 0.5 || ry < 0.5) return;

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

    if (shape.fillColor) {
      ctx.fillStyle = shape.fillColor;
      ctx.fill();
    }
    if (shape.strokeColor) {
      ctx.strokeStyle = shape.strokeColor;
      ctx.lineWidth = shape.strokeWidth || 2;
      ctx.stroke();
    }
  },

  hitTest(shape, px, py) {
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    const rx = shape.width / 2;
    const ry = shape.height / 2;
    if (rx === 0 || ry === 0) return false;

    const normalized = ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2;
    const tol = Math.max(shape.strokeWidth || 2, 5);
    const tolFactor = tol / Math.min(Math.abs(rx), Math.abs(ry));

    if (shape.fillColor) {
      return normalized <= (1 + tolFactor) ** 2;
    }
    // Stroke only
    return Math.abs(Math.sqrt(normalized) - 1) < tolFactor;
  },

  getBounds(shape) {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  },

  transformByHandle(shape, handleId, dx, dy) {
    return transformBounds(shape, handleId, dx, dy);
  },
};
