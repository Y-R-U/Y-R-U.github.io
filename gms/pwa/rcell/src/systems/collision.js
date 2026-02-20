// collision.js — Spatial hashing collision detection
const Collision = (() => {
  let cellSize = 80;
  let grid = {};

  function reset(size) {
    cellSize = size || 80;
    grid = {};
  }

  function _key(cx, cy) { return cx + ',' + cy; }

  function _insert(entity) {
    const r = entity.radius || 10;
    const x0 = Math.floor((entity.x - r) / cellSize);
    const x1 = Math.floor((entity.x + r) / cellSize);
    const y0 = Math.floor((entity.y - r) / cellSize);
    const y1 = Math.floor((entity.y + r) / cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const k = _key(cx, cy);
        if (!grid[k]) grid[k] = [];
        grid[k].push(entity);
      }
    }
  }

  function build(entities) {
    grid = {};
    for (const e of entities) _insert(e);
  }

  function query(x, y, radius) {
    const results = new Set();
    const x0 = Math.floor((x - radius) / cellSize);
    const x1 = Math.floor((x + radius) / cellSize);
    const y0 = Math.floor((y - radius) / cellSize);
    const y1 = Math.floor((y + radius) / cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = grid[_key(cx, cy)];
        if (cell) cell.forEach(e => results.add(e));
      }
    }
    return Array.from(results);
  }

  // Circle vs circle collision check
  function circleCircle(ax, ay, ar, bx, by, br) {
    const dx = ax - bx;
    const dy = ay - by;
    const distSq = dx * dx + dy * dy;
    const minDist = ar + br;
    return distSq < minDist * minDist;
  }

  // Get all pairs of overlapping circles from two lists
  function checkPairs(listA, listB) {
    const pairs = [];
    build(listB);
    for (const a of listA) {
      const candidates = query(a.x, a.y, a.radius);
      for (const b of candidates) {
        if (circleCircle(a.x, a.y, a.radius, b.x, b.y, b.radius)) {
          pairs.push([a, b]);
        }
      }
    }
    return pairs;
  }

  // Check single entity against a list
  function checkOne(entity, list) {
    const results = [];
    for (const other of list) {
      if (other === entity) continue;
      if (circleCircle(entity.x, entity.y, entity.radius, other.x, other.y, other.radius)) {
        results.push(other);
      }
    }
    return results;
  }

  // Check if point is in circle
  function pointInCircle(px, py, cx, cy, r) {
    const dx = px - cx, dy = py - cy;
    return dx * dx + dy * dy < r * r;
  }

  return { reset, build, query, circleCircle, checkPairs, checkOne, pointInCircle };
})();
