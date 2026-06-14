// A* over the house grid (4-connected). Returns a list of tile {c,r} from→to.
import { isFloor } from './map.js';
import { COLS } from './config.js';

const key = (c, r) => r * COLS + c;

export function findPath(sc, sr, tc, tr) {
  if (!isFloor(tc, tr) || !isFloor(sc, sr)) return [];
  if (sc === tc && sr === tr) return [{ c: sc, r: sr }];

  const open = [{ c: sc, r: sr, g: 0, f: 0 }];
  const came = new Map();
  const gScore = new Map([[key(sc, sr), 0]]);
  const h = (c, r) => Math.abs(c - tc) + Math.abs(r - tr);

  while (open.length) {
    // pop lowest f (small grid → linear scan is fine)
    let bi = 0;
    for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open.splice(bi, 1)[0];
    if (cur.c === tc && cur.r === tr) return rebuild(came, cur);

    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = cur.c + dc, nr = cur.r + dr;
      if (!isFloor(nc, nr)) continue;
      const ng = cur.g + 1;
      const nk = key(nc, nr);
      if (ng < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, ng);
        came.set(nk, cur);
        open.push({ c: nc, r: nr, g: ng, f: ng + h(nc, nr) });
      }
    }
  }
  return [];
}

function rebuild(came, node) {
  const path = [node];
  let k = key(node.c, node.r);
  while (came.has(k)) {
    const p = came.get(k);
    path.push(p);
    k = key(p.c, p.r);
  }
  path.reverse();
  return path.map(n => ({ c: n.c, r: n.r }));
}

// Manhattan tile distance for AI ordering (no diagonal moves in this house).
export function tileDist(ac, ar, bc, br) {
  const p = findPath(ac, ar, bc, br);
  return p.length ? p.length - 1 : Infinity;
}
