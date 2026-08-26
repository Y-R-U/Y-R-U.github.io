// The contract between UI and core/input.js: which screen-space rects are buttons, not steering.

const rects = new Map();

/** rect is CSS px, screen space, top-left origin: { x, y, w, h }. Re-registering an id replaces it. */
export function register(id, rect) {
  rects.set(id, { x: rect.x, y: rect.y, w: rect.w, h: rect.h, id });
}

export function unregister(id) {
  rects.delete(id);
}

export function clear() {
  rects.clear();
}

/** → the id of the topmost (last-registered) rect containing the point, else null. */
export function hitTest(x, y) {
  let hit = null;
  for (const r of rects.values()) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) hit = r.id;
  }
  return hit;
}

/** → a live-ish snapshot for audits and debug overlays. Do not call per frame. */
export function all() {
  return [...rects.values()];
}
