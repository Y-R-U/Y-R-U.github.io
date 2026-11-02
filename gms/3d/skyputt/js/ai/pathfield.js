// Distance-to-cup along the course (not straight-line), for the ghost AI planner.
// A graph of track nodes (the builder's frames + branch tracks such as hole 7's plank), with
// Dijkstra from the cup. `dist(x, y, z)` finds the track cross-sections the point lies in and
// returns the shortest along-track distance, so a ball behind a bend is "far" even when the cup is
// close as the crow flies. Node-safe, no THREE.

const STEP = 0.2;

export function buildPathField(hole) {
  const nodes = [];
  const add = (p, f, l, u, w, extra = {}) => { const n = { i: nodes.length, p, f, l, u, w, nb: [], D: Infinity, next: -1, ...extra }; nodes.push(n); return n; };
  const link = (a, b) => { const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]); a.nb.push([b.i, d]); b.nb.push([a.i, d]); };

  // main track
  let prev = null;
  for (const fr of hole.frames) {
    const n = add(fr.p, fr.f, fr.l, fr.u, fr.w, { loop: !!fr.loop, tube: fr.tube || 0, s: fr.s });
    if (prev) link(prev, n);
    prev = n;
  }
  const mainCount = nodes.length;

  // branch tracks (straight segments between their points), joined to the nearest main node at each end
  for (const br of hole.branches || []) {
    let last = null;
    const widths = []; let w = 0.4;
    for (let k = 0; k < br.length; k++) widths.push(w);
    for (let k = 0; k < br.length - 1; k++) {
      const a = br[k], b = br[k + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      const f = [(b[0] - a[0]) / len, (b[1] - a[1]) / len, (b[2] - a[2]) / len];
      const h = Math.hypot(f[0], f[2]) || 1;
      const l = [f[2] / h, 0, -f[0] / h];             // Y x f
      const steps = Math.max(1, Math.round(len / STEP));
      for (let j = k ? 1 : 0; j <= steps; j++) {
        const t = j / steps;
        const n = add([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], f, l, [0, 1, 0], w, { branch: true });
        if (last) link(last, n);
        last = n;
        if (j === 0 || (k === br.length - 2 && j === steps)) joinMain(n);
      }
    }
  }
  function joinMain(n) {
    let best = null, bd = Infinity;
    for (let i = 0; i < mainCount; i++) {
      const m = nodes[i]; if (m.loop) continue;
      const dy = Math.abs(m.p[1] - n.p[1]); if (dy > 0.3) continue;
      const d = Math.hypot(m.p[0] - n.p[0], m.p[2] - n.p[2]);
      if (d < bd) { bd = d; best = m; }
    }
    if (best && bd < 1.0) link(best, n);
  }

  // Dijkstra from the cup (tiny graph: O(n^2) is fine)
  const cup = hole.cup;
  for (const n of nodes) {
    const d = Math.hypot(n.p[0] - cup.x, n.p[2] - cup.z);
    if (d < 0.3 && Math.abs(n.p[1] - cup.y) < 0.1 && !n.loop) n.D = d;
  }
  const done = new Uint8Array(nodes.length);
  for (;;) {
    let u = null;
    for (const n of nodes) if (!done[n.i] && n.D < Infinity && (!u || n.D < u.D)) u = n;
    if (!u) break;
    done[u.i] = 1;
    for (const [j, d] of u.nb) if (u.D + d < nodes[j].D) { nodes[j].D = u.D + d; nodes[j].next = u.i; }
  }
  for (const n of nodes) {
    const nx = n.next >= 0 ? nodes[n.next] : null;
    if (nx) { const dx = nx.p[0] - n.p[0], dy = nx.p[1] - n.p[1], dz = nx.p[2] - n.p[2], L = Math.hypot(dx, dy, dz) || 1; n.tc = [dx / L, dy / L, dz / L]; }
    else n.tc = [0, 0, 0];
  }

  // nodes whose cross-section contains the point
  function members(x, y, z, out) {
    out.length = 0;
    for (const n of nodes) {
      const dx = x - n.p[0], dy = y - n.p[1], dz = z - n.p[2];
      const al = dx * n.f[0] + dy * n.f[1] + dz * n.f[2];
      if (al > 0.16 || al < -0.16) continue;
      const lat = dx * n.l[0] + dy * n.l[1] + dz * n.l[2];
      if (Math.abs(lat) > n.w / 2 + 0.07) continue;
      const up = dx * n.u[0] + dy * n.u[1] + dz * n.u[2];
      if (up < -0.12 || up > 0.36) continue;
      out.push(n, lat);
    }
    return out;
  }
  const tmp = [];

  // along-track distance to the cup from (x, y, z)
  function dist(x, y, z) {
    let best = Infinity;
    members(x, y, z, tmp);
    for (let k = 0; k < tmp.length; k += 2) {
      const n = tmp[k], lat = tmp[k + 1];
      const dx = x - n.p[0], dy = y - n.p[1], dz = z - n.p[2];
      const d = n.D - (dx * n.tc[0] + dy * n.tc[1] + dz * n.tc[2]) + 0.15 * Math.abs(lat);
      if (d < best) best = d;
    }
    if (best === Infinity) {   // off every cross-section (on a wall top, in the windmill...): nearest node + penalty
      let bd = Infinity;
      for (const n of nodes) {
        const d = Math.hypot(x - n.p[0], (y - n.p[1]) * 2, z - n.p[2]);
        if (d < bd) { bd = d; best = n.D + d + 0.5; }
      }
    }
    const dc = Math.hypot(x - cup.x, z - cup.z);
    if (dc < 1.0 && Math.abs(y - cup.y) < 0.08) best = Math.min(best, dc);
    return Math.max(0, best);
  }

  // node the point is in (closest to the cup), or the nearest
  function nodeAt(x, y, z) {
    members(x, y, z, tmp);
    let best = null;
    for (let k = 0; k < tmp.length; k += 2) if (!best || tmp[k].D < best.D) best = tmp[k];
    if (best) return best;
    let bd = Infinity;
    for (const n of nodes) { const d = Math.hypot(x - n.p[0], (y - n.p[1]) * 2, z - n.p[2]); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  // Aim points: walk the shortest route toward the cup and return points `ahead` metres on,
  // skipping loop / tube interiors (you aim at their mouth).
  function aheadPoint(x, y, z, ahead) {
    let n = nodeAt(x, y, z);
    const D0 = dist(x, y, z);
    if (n.loop) return [n.p[0] + n.f[0] * ahead, n.p[1], n.p[2] + n.f[2] * ahead];   // resting in a loop's foot: aim up it
    const inside = !!n.tube;
    while (n.next >= 0 && D0 - n.D < ahead) {
      const nx = nodes[n.next];
      if (!inside && (nx.loop || nx.tube) && D0 - n.D > 0.3) break;   // aim at the mouth
      n = nx;
    }
    return n.p;
  }

  return { nodes, dist, nodeAt, aheadPoint, cup };
}
