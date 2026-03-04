// shapes/arrow.js - Arrow renderer (line with arrowhead)
import { pointToSegmentDist } from './utils.js';

export const ArrowShape = {
  draw(ctx, shape) {
    const { x1, y1, x2, y2 } = shape;
    const headLen = Math.max(shape.strokeWidth * 4, 12);
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = shape.strokeColor || '#000';
    ctx.lineWidth = shape.strokeWidth || 2;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
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

  translate(shape, dx, dy) {
    return { ...shape, x1: shape.x1 + dx, y1: shape.y1 + dy, x2: shape.x2 + dx, y2: shape.y2 + dy };
  },
};
