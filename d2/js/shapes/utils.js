// shapes/utils.js - Shared geometry utilities

export function pointToSegmentDistSq(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - x1, ey = py - y1;
    return ex * ex + ey * ey;
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  const ex = px - projX, ey = py - projY;
  return ex * ex + ey * ey;
}

export function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  return Math.sqrt(pointToSegmentDistSq(px, py, x1, y1, x2, y2));
}

// Normalize rect: ensure width/height positive, return {x, y, width, height}
export function normalizeRect(x1, y1, x2, y2) {
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1),
  };
}

// Apply handle-based transform to a bounding-box shape
export function transformBounds(shape, handleId, dx, dy) {
  const s = { ...shape };
  switch (handleId) {
    case 'nw': s.x += dx; s.y += dy; s.width -= dx; s.height -= dy; break;
    case 'n':  s.y += dy; s.height -= dy; break;
    case 'ne': s.y += dy; s.width += dx; s.height -= dy; break;
    case 'e':  s.width += dx; break;
    case 'se': s.width += dx; s.height += dy; break;
    case 's':  s.height += dy; break;
    case 'sw': s.x += dx; s.width -= dx; s.height += dy; break;
    case 'w':  s.x += dx; s.width -= dx; break;
  }
  // Normalize if flipped
  if (s.width < 0) { s.x += s.width; s.width = Math.abs(s.width); }
  if (s.height < 0) { s.y += s.height; s.height = Math.abs(s.height); }
  return s;
}
