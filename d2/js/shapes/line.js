// shapes/line.js - Line renderer
import { pointToSegmentDist } from './utils.js';

export const LineShape = {
  draw(ctx, shape) {
    ctx.beginPath();
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
    ctx.strokeStyle = shape.strokeColor || '#000';
    ctx.lineWidth = shape.strokeWidth || 2;
    ctx.lineCap = 'round';
    ctx.stroke();
  },

  hitTest(shape, px, py) {
    const tol = Math.max((shape.strokeWidth || 2) / 2 + 3, 6);
    return pointToSegmentDist(px, py, shape.x1, shape.y1, shape.x2, shape.y2) <= tol;
  },

  getBounds(shape) {
    const x = Math.min(shape.x1, shape.x2);
    const y = Math.min(shape.y1, shape.y2);
    return {
      x, y,
      width: Math.max(Math.abs(shape.x2 - shape.x1), 1),
      height: Math.max(Math.abs(shape.y2 - shape.y1), 1),
    };
  },

  // Lines use endpoint handles instead of bounding-box handles
  getHandlePositions(shape) {
    return [
      { id: 'p1', x: shape.x1, y: shape.y1, cursor: 'crosshair' },
      { id: 'p2', x: shape.x2, y: shape.y2, cursor: 'crosshair' },
    ];
  },

  transformByHandle(shape, handleId, dx, dy) {
    const s = { ...shape };
    if (handleId === 'p1') { s.x1 += dx; s.y1 += dy; }
    else if (handleId === 'p2') { s.x2 += dx; s.y2 += dy; }
    return s;
  },

  // Move entire line
  translate(shape, dx, dy) {
    return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
  },
};
