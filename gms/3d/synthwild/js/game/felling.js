// Tree felling: breaking the bottom of a carbon-bark trunk brings the connected logs above it down too.
import { BLOCKS, BLOCK } from '../data/blocks.js';

export const FELL_CAP = 64;
const LEAF_RADIUS = 3, LEAF_CAP = 160, LEAF_DROPS = 40;
// Blocks only players make. A log touching one is part of a build, so we don't fell it.
const BUILT = /planks|brick|neon_|light_panel|clearglass|glowbulb|fabricator|reflow_oven|^cache$|sleep_pod|climb_rail|polymer_clay|mirror_tile/;

const keyOf = (m) => BLOCKS[m]?.key || '';

// Connected natural logs above/beside (x,y,z). Returns cells, or [] if the trunk is part of a build.
export function findTree(getCell, x, y, z, cap = FELL_CAP) {
  const LOG = BLOCK.CARBON_LOG;
  const seen = new Set([`${x},${y},${z}`]);
  const out = [];
  const queue = [[x, y, z]];
  while (queue.length && out.length < cap) {
    const [cx, cy, cz] = queue.shift();
    for (let dy = 0; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dy && !dz) continue;
      const nx = cx + dx, ny = cy + dy, nz = cz + dz, k = `${nx},${ny},${nz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (getCell(nx, ny, nz) !== LOG) continue;
      if (out.length >= cap) break;
      out.push([nx, ny, nz]);
      queue.push([nx, ny, nz]);
    }
  }
  for (const [a, b, c] of out) {
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      if (BUILT.test(keyOf(getCell(a + dx, b + dy, c + dz)))) return [];
    }
  }
  return out;
}

export function nearbyLeaves(getCell, logs, r = LEAF_RADIUS, cap = LEAF_CAP) {
  const LEAF = BLOCK.SOLAR_LEAVES, seen = new Set(), out = [];
  for (const [x, y, z] of logs) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -1; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
      const k = `${x + dx},${y + dy},${z + dz}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (getCell(x + dx, y + dy, z + dz) === LEAF) { out.push([x + dx, y + dy, z + dz]); if (out.length >= cap) return out; }
    }
  }
  return out;
}

// Called after a single full log cell was broken at (x,y,z). Emits block:break (src 'fell') per log so drops,
// tool wear and Charge cost go through the normal path. Returns the number of logs felled.
export function fell(ctx, x, y, z) {
  const w = ctx.world;
  if (!w) return 0;
  const get = (a, b, c) => w.getCell(a, b, c);
  const logs = findTree(get, x, y, z);
  if (!logs.length) return 0;
  const cell = (a, b, c) => [[a * 4, b * 4, c * 4], [a * 4 + 4, b * 4 + 4, c * 4 + 4]];
  const leaves = nearbyLeaves(get, [[x, y, z], ...logs]);
  logs.sort((a, b) => a[1] - b[1]);
  for (const [a, b, c] of logs) {
    const [mn, mx] = cell(a, b, c);
    const r = w.setBox(mn, mx, 0, 'fill', { flow: false });
    if (!r?.changed) continue;
    ctx.bus?.emit?.('block:break', { minSub: mn, maxSub: mx, removed: r.removed, pos: [a, b, c], src: 'fell' });
    ctx.fx?.spark?.({ x: a + 0.5, y: b + 0.5, z: c + 0.5 }, 0x4ad7c8, 4);
  }
  leaves.forEach(([a, b, c], i) => {
    const [mn, mx] = cell(a, b, c);
    const r = w.setBox(mn, mx, 0, 'fill', { flow: false });
    if (r?.changed && i < LEAF_DROPS) ctx.bus?.emit?.('block:break', { minSub: mn, maxSub: mx, removed: r.removed, pos: [a, b, c], src: 'fell', leaf: true });
  });
  if (leaves.length) ctx.fx?.puff?.({ x: x + 0.5, y: y + 3, z: z + 0.5 }, 0x2fa86a);
  ctx.audio?.sfx?.('treeFall', { pos: { x: x + 0.5, y, z: z + 0.5 }, logs: logs.length });
  ctx.bus?.emit?.('tree:fell', { pos: [x, y, z], logs: logs.length, leaves: leaves.length });
  return logs.length;
}
