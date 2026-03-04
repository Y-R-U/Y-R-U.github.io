// shapes/path.js - Freehand path renderer
import { pointToSegmentDist } from './utils.js';

export const PathShape = {
  draw(ctx, shape) {
    const pts = shape.points;
    if (!pts || pts.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.strokeStyle = shape.strokeColor || '#000';
    ctx.lineWidth = shape.strokeWidth || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  },

  hitTest(shape, px, py) {
    const pts = shape.points;
    if (!pts || pts.length < 2) return false;
    const tol = Math.max((shape.strokeWidth || 2) / 2 + 3, 6);
    for (let i = 1; i < pts.length; i++) {
      if (pointToSegmentDist(px, py, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= tol) {
        return true;
      }
    }
    return false;
  },

  getBounds(shape) {
    if (shape._bounds) return shape._bounds;
    const pts = shape.points;
    if (!pts || pts.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    shape._bounds = bounds;
    return bounds;
  },

  transformByHandle(shape, handleId, dx, dy) {
    // For paths, resize all points proportionally
    const bounds = this.getBounds(shape);
    const s = { ...shape, points: shape.points.map(p => ({ ...p })) };
    delete s._bounds;

    const newBounds = { ...bounds };
    switch (handleId) {
      case 'nw': newBounds.x += dx; newBounds.y += dy; newBounds.width -= dx; newBounds.height -= dy; break;
      case 'n':  newBounds.y += dy; newBounds.height -= dy; break;
      case 'ne': newBounds.y += dy; newBounds.width += dx; newBounds.height -= dy; break;
      case 'e':  newBounds.width += dx; break;
      case 'se': newBounds.width += dx; newBounds.height += dy; break;
      case 's':  newBounds.height += dy; break;
      case 'sw': newBounds.x += dx; newBounds.width -= dx; newBounds.height += dy; break;
      case 'w':  newBounds.x += dx; newBounds.width -= dx; break;
    }

    if (bounds.width > 0 && bounds.height > 0 && newBounds.width > 0 && newBounds.height > 0) {
      const sx = newBounds.width / bounds.width;
      const sy = newBounds.height / bounds.height;
      for (const p of s.points) {
        p.x = newBounds.x + (p.x - bounds.x) * sx;
        p.y = newBounds.y + (p.y - bounds.y) * sy;
      }
    }
    return s;
  },

  translate(shape, dx, dy) {
    const s = { ...shape, points: shape.points.map(p => ({ x: p.x + dx, y: p.y + dy })) };
    delete s._bounds;
    return s;
  },

  // Simplify path using Ramer-Douglas-Peucker algorithm
  simplify(points, tolerance = 1.5) {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let maxIdx = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const d = pointToSegmentDist(points[i].x, points[i].y, first.x, first.y, last.x, last.y);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }

    if (maxDist > tolerance) {
      const left = this.simplify(points.slice(0, maxIdx + 1), tolerance);
      const right = this.simplify(points.slice(maxIdx), tolerance);
      return left.slice(0, -1).concat(right);
    }
    return [first, last];
  },
};
