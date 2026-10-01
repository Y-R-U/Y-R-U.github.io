// Pure brush maths: box snapping and survival cost. Boxes are in sub coords, max exclusive.

export const SCALES = [0.25, 0.5, 1, 2, 4, 8];
export const MODES = ['fill', 'hollow', 'shell', 'replace'];
export const SUBS_PER_BLOCK = 64;
export const subsOf = scale => Math.round(scale * 4);

const axisOf = n => (n[0] ? 0 : n[1] ? 1 : 2);
const fl = (v, n) => Math.floor(v / n) * n;

// Box placed against the hit face: flush on the normal axis, scale-aligned on the in-plane axes
// (centred on the hit cell when dims > 1). dims = [W,H,D] in scale cells.
export function placeBox(hit, normal, scale, dims = [1, 1, 1]) {
  const n = subsOf(scale), a = axisOf(normal), dir = normal[a] || 1;
  const min = [0, 0, 0], max = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const d = dims[i] | 0 || 1;
    if (i === a) {
      const face = hit[i] + (dir > 0 ? 1 : 0);
      if (dir > 0) { min[i] = face; max[i] = face + n * d; } else { max[i] = face; min[i] = face - n * d; }
    } else {
      min[i] = fl(hit[i], n) - Math.floor((d - 1) / 2) * n;
      max[i] = min[i] + n * d;
    }
  }
  return { min, max };
}

// Scale-aligned box containing the hit sub; extra dims go into the surface and centre in-plane.
export function breakBox(hit, normal, scale, dims = [1, 1, 1]) {
  const n = subsOf(scale), a = axisOf(normal), dir = normal[a] || 1;
  const min = [0, 0, 0], max = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const d = dims[i] | 0 || 1;
    const base = fl(hit[i], n);
    if (i === a) {
      if (dir > 0) { max[i] = base + n; min[i] = max[i] - n * d; } else { min[i] = base; max[i] = base + n * d; }
    } else {
      min[i] = base - Math.floor((d - 1) / 2) * n;
      max[i] = min[i] + n * d;
    }
  }
  return { min, max };
}

export function unionBox(a, b) {
  return {
    min: a.min.map((v, i) => Math.min(v, b.min[i])),
    max: a.max.map((v, i) => Math.max(v, b.max[i])),
  };
}

// Clamp a volume so no side exceeds `cap` subs, keeping the anchor box's corner fixed.
export function clampVolume(box, anchor, cap) {
  const min = box.min.slice(), max = box.max.slice();
  for (let i = 0; i < 3; i++) {
    if (max[i] - min[i] <= cap) continue;
    if (min[i] < anchor.min[i]) min[i] = anchor.max[i] - cap; else max[i] = anchor.min[i] + cap;
  }
  return { min, max };
}

export const boxSize = b => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
export const boxVolume = b => { const s = boxSize(b); return s[0] * s[1] * s[2]; };

export function boxesOverlap(aMin, aMax, bMin, bMax) {
  return aMin[0] < bMax[0] && aMax[0] > bMin[0] && aMin[1] < bMax[1] && aMax[1] > bMin[1] &&
    aMin[2] < bMax[2] && aMax[2] > bMin[2];
}

// World-unit AABB [x0,y0,z0,x1,y1,z1] vs sub box.
export function aabbOverlapsSubBox(bx, box) {
  const e = 1e-4;
  return boxesOverlap([bx[0] + e, bx[1] + e, bx[2] + e], [bx[3] - e, bx[4] - e, bx[5] - e],
    box.min.map(v => v / 4), box.max.map(v => v / 4));
}

// Subs written by a mode (cost in 1/64 block units). replace is estimated as the full box.
export function costUnits(box, mode = 'fill', wall = 1) {
  const [x, y, z] = boxSize(box);
  const all = x * y * z;
  if (mode === 'hollow' || mode === 'shell') {
    const ix = Math.max(0, x - 2 * wall), iy = Math.max(0, y - 2 * wall), iz = Math.max(0, z - 2 * wall);
    return all - ix * iy * iz;
  }
  return all;
}

// Fractional-block accounting. credit = units (1/64 block) already paid for but not yet used.
// Returns { ok, blocks: whole blocks to take from the stack, credit: new credit }.
export function payUnits(credit, units, have) {
  if (credit >= units) return { ok: true, blocks: 0, credit: credit - units };
  const blocks = Math.ceil((units - credit) / SUBS_PER_BLOCK);
  if (blocks > have) return { ok: false, blocks: 0, credit };
  return { ok: true, blocks, credit: credit + blocks * SUBS_PER_BLOCK - units };
}

export function fmtScale(s) { return String(s); }
