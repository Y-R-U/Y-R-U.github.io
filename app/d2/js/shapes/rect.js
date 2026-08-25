// shapes/rect.js - Rectangle renderer, hit-test, bounds, transform
import { pointToSegmentDist, transformBounds } from './utils.js';

export const RectShape = {
  draw(ctx, shape) {
    const { x, y, width, height } = shape;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
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
    const { x, y, width, height } = shape;
    const tol = Math.max(shape.strokeWidth || 2, 5);
    if (shape.fillColor) {
      return px >= x - tol && px <= x + width + tol && py >= y - tol && py <= y + height + tol;
    }
    // Stroke only: check proximity to edges
    return (
      pointToSegmentDist(px, py, x, y, x + width, y) <= tol ||
      pointToSegmentDist(px, py, x + width, y, x + width, y + height) <= tol ||
      pointToSegmentDist(px, py, x + width, y + height, x, y + height) <= tol ||
      pointToSegmentDist(px, py, x, y + height, x, y) <= tol
    );
  },

  getBounds(shape) {
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  },

  transformByHandle(shape, handleId, dx, dy) {
    return transformBounds(shape, handleId, dx, dy);
  },
};
