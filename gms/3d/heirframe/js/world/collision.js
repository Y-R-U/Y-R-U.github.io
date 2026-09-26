// 2D collision on the XZ plane: circles, oriented boxes, annular arcs, and a bounds rectangle.
// Ground height comes from a list of height regions (flat pads and linear ramps).
export function createCollision(bounds) {
  const circles = [], boxes = [], arcs = [], heights = [], customs = [];
  const C = {
    bounds, circles, boxes, arcs, heights,
    circle(x, z, r, tag) { const e = { x, z, r, tag }; circles.push(e); return e; },
    box(x, z, hw, hd, rot = 0, tag) { const e = { x, z, hw, hd, c: Math.cos(rot), s: Math.sin(rot), tag }; boxes.push(e); return e; },
    // drop one shape returned by circle()/box() (breakable props)
    remove(e) { for (const L of [circles, boxes, arcs]) { const i = L.indexOf(e); if (i >= 0) { L.splice(i, 1); return true; } } return false; },
    // district swap: same object (callers may hold it), new contents
    reset(nb) { for (const L of [circles, boxes, arcs, heights, customs]) L.length = 0; C.bounds = nb; },
    // blocked ring sector: centre, radii, angle range in theta convention (x = sin θ, z = cos θ)
    arc(x, z, r0, r1, a0, a1, tag) { arcs.push({ x, z, r0, r1, a0, a1, tag }); },
    custom(fn) { customs.push(fn); },
    // walk-around area height; kind 'flat' {y} or 'rampZ' {z0,z1,y0,y1}
    height(region) { heights.push(region); },
    blocked(x, z, r = 0.4) {
      const bounds = C.bounds;
      if (x - r < bounds.x0 || x + r > bounds.x1 || z - r < bounds.z0 || z + r > bounds.z1) return true;
      for (const c of circles) { const dx = x - c.x, dz = z - c.z, rr = c.r + r; if (dx * dx + dz * dz < rr * rr) return true; }
      for (const b of boxes) {
        const dx = x - b.x, dz = z - b.z;
        const lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; // rot matches Object3D.rotation.y
        const qx = Math.max(Math.abs(lx) - b.hw, 0), qz = Math.max(Math.abs(lz) - b.hd, 0);
        if (qx * qx + qz * qz < r * r) return true;
      }
      for (const a of arcs) {
        const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz);
        if (d < a.r0 - r || d > a.r1 + r) continue;
        const ang = Math.atan2(dx, dz);
        const pad = r / Math.max(d, 1);
        if (inArc(ang, a.a0 - pad, a.a1 + pad)) return true;
      }
      for (const f of customs) if (f(x, z, r)) return true;
      return false;
    },
    groundAt(x, z) {
      let y = 0;
      for (const h of heights) {
        if (x < h.x0 || x > h.x1 || z < h.z0 || z > h.z1) continue;
        if (h.kind === 'flat') y = h.y;
        else if (h.kind === 'rampZ') { const t = Math.min(1, Math.max(0, (z - h.z0) / (h.z1 - h.z0))); y = h.y0 + (h.y1 - h.y0) * t; }
      }
      return y;
    },
    // slide movement: try full, then axis-separated
    move(p, dx, dz, r) {
      if (!C.blocked(p.x + dx, p.z + dz, r)) { p.x += dx; p.z += dz; return true; }
      let moved = false;
      if (!C.blocked(p.x + dx, p.z, r)) { p.x += dx; moved = true; }
      else if (!C.blocked(p.x, p.z + dz, r)) { p.z += dz; moved = true; }
      return moved;
    },
  };
  return C;
}

function inArc(a, a0, a1) {
  const TAU = Math.PI * 2;
  const norm = (v) => ((v % TAU) + TAU) % TAU;
  const s = norm(a0), e = norm(a1), t = norm(a);
  return s <= e ? t >= s && t <= e : t >= s || t <= e;
}
