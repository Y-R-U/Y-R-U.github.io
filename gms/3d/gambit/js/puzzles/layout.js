// Map graph: rows of 1–3 nodes per region, edges between neighbouring rows, unlock rules.
// Pure (no DOM) so tools/puzzles_test.mjs can check it.
//
// Rows follow a repeating rhythm. A 2-row followed by a 2-row is two parallel lanes (a side
// path you can take when stuck); a row of 1 joins / splits lanes. A node is OPEN when any
// node it hangs from is done; the first row of a region is also open when the previous
// region's last row is done, or when the player's puzzle rating reaches region.unlock.
const PATTERN = [1, 1, 2, 2, 2, 1, 1, 3, 1, 1, 2, 2, 1, 2, 2, 2, 1];

export function buildGraph(index, regions) {
  const nodes = new Map();          // id -> {id, r, classic, region, row, lane, lanes, prev:[ids], next:[ids]}
  const rows = [];                  // global rows: {region, ids}
  const regionRows = new Map();     // region id -> [rowIndex...]
  const order = [];                 // ids in map order
  for (const reg of regions) {
    const ir = index.regions.find(x => x.id === reg.id);
    if (!ir) continue;
    const list = ir.nodes;
    // row sizes: the rhythm, starting and ending on a single gate node
    const sizes = [];
    let left = list.length, k = 0;
    while (left > 0) {
      let n = sizes.length === 0 ? 1 : PATTERN[k++ % PATTERN.length];
      if (n > left - 1) n = 1;                 // keep one node back for the closing gate
      // classic problems get a row of their own (they carry a name label)
      const at = list.length - left;
      const ci = list.slice(at, at + n).findIndex(x => x[2]);
      if (ci === 0) n = 1; else if (ci > 0) n = ci;
      sizes.push(n); left -= n;
    }
    const myRows = [];
    let i = 0;
    for (const n of sizes) {
      const part = list.slice(i, i + n); i += n;
      part.forEach((x, lane) => nodes.set(x[0], { id: x[0], r: x[1], classic: !!x[2], name: x[2] || null, region: reg.id, row: rows.length, lane, lanes: n, prev: [], next: [] }));
      myRows.push(rows.length);
      rows.push({ region: reg.id, ids: part.map(x => x[0]) });
      order.push(...part.map(x => x[0]));
    }
    regionRows.set(reg.id, myRows);
  }
  // edges
  for (let r = 1; r < rows.length; r++) {
    const a = rows[r - 1].ids, b = rows[r].ids;
    const link = (x, y) => { nodes.get(x).next.push(y); nodes.get(y).prev.push(x); };
    if (a.length === b.length && a.length > 1) a.forEach((x, i) => link(x, b[i]));
    else for (const x of a) for (const y of b) link(x, y);
  }
  return { nodes, rows, regionRows, order };
}

/** Per-node state: 'done' | 'open' | 'locked'. done = finished (any stars). */
export function computeState(graph, regions, progress) {
  const done = id => progress.s[id] !== undefined;
  const state = new Map();
  const regionOpen = new Map();
  let prevRegionDone = true;
  for (const reg of regions) {
    const rr = graph.regionRows.get(reg.id);
    if (!rr || !rr.length) continue;
    const lastRow = graph.rows[rr[rr.length - 1]].ids;
    const firstRow = graph.rows[rr[0]].ids;
    const byRating = reg.unlock > 0 && progress.r >= reg.unlock;
    const anyDone = rr.some(ri => graph.rows[ri].ids.some(done));
    const open = prevRegionDone || byRating || anyDone || reg.unlock === 0;
    regionOpen.set(reg.id, { open, byRating: byRating && !prevRegionDone, unlock: reg.unlock });
    for (const ri of rr) {
      for (const id of graph.rows[ri].ids) {
        const n = graph.nodes.get(id);
        let st = 'locked';
        if (done(id)) st = 'done';
        else if (firstRow.includes(id) && open) st = 'open';
        else if (n.prev.some(done)) st = 'open';
        state.set(id, st);
      }
    }
    prevRegionDone = lastRow.some(done);
  }
  return { state, regionOpen };
}

/** Next puzzle to play: first open node in map order after `afterId` (wrapping), else first open. */
export function nextOpen(graph, st, afterId = null) {
  const order = graph.order;
  if (afterId && graph.nodes.has(afterId)) {
    const n = graph.nodes.get(afterId);
    const succ = n.next.find(id => st.state.get(id) === 'open');
    if (succ) return succ;
    const i = order.indexOf(afterId);
    for (let k = i + 1; k < order.length; k++) if (st.state.get(order[k]) === 'open') return order[k];
  }
  return order.find(id => st.state.get(id) === 'open') || null;
}
