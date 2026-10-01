// Art-direction layer over lane 1's tile hints: palette/pattern overrides by tile name, and the
// painters for the "not Minecraft" ground (hex solar film, woven loam, mirror sand, engraved basalt, furrows).
// Ids and tile indices are untouched; only the pixels change.

export const STYLE = {
  photomoss_top: { pattern: 'hexfilm', base: '#1c9a86', accent: '#f2c84b', glow: 'night', emissive: 0.5 },
  photomoss_side: { pattern: 'weave', base: '#4a3f52', accent: '#8a7396', lip: { color: '#1c9a86', glow: '#7af7dc', px: 4 } },
  loam_mesh: { pattern: 'weave', base: '#4a3f52', accent: '#8a7396' },
  grow_bed_top: { base: '#33293a', accent: '#8dff6a' },
  mirror_sand: { pattern: 'sand', base: '#aaa3c4', accent: '#ffffff' },
  mirror_sandstone_top: { pattern: 'sand', base: '#a49cbe', accent: '#ffffff' },
  fibre_stone: { base: '#7f86ad', accent: '#cdd2f2' },
  mirror_sandstone_side: { base: '#a99ec4', accent: '#7d7198' },
  basalt_matrix: { pattern: 'grooves', base: '#3d4a60', accent: '#4ad7c8', emissive: 0.25 },
  fractured_matrix: { base: '#465068', accent: '#9fb6d8' },
  crystal_turf_top: { pattern: 'hexfilm', base: '#4fb8a6', accent: '#ff8ad8', alt: '#9284dc', speck: '#ff9ae4', glow: 'night', emissive: 0.4 },
  crystal_turf_side: { pattern: 'weave', base: '#4a3f52', accent: '#8a7396', lip: { color: '#4fb8a6', glow: '#ffb0ec', px: 3 } },
  frost_lattice_side: { lip: { color: '#eef6ff', glow: '#bfe8ff', px: 5 } },
  polymer_clay: { base: '#8f9cc4', accent: '#c4ccec' },
  shard_gravel: { base: '#6f7890', accent: '#c4d4f0' },
};

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const TS = 32;

// tileable hex lattice: rows 8 px apart, odd rows offset by 4 → period 32 in both axes
function hexAt(x, y) {
  let f1 = 1e9, f2 = 1e9, ci = 0, cj = 0;
  const j0 = Math.floor(y / 8);
  for (let j = j0 - 1; j <= j0 + 2; j++) {
    const off = (((j % 2) + 2) % 2) * 4;
    const i0 = Math.floor((x - off) / 8);
    for (let i = i0 - 1; i <= i0 + 2; i++) {
      const cx = i * 8 + off + 4, cy = j * 8 + 4;
      const dx = (x + 0.5 - cx) * 1.0, dy = (y + 0.5 - cy) * 1.12;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < f1) { f2 = f1; f1 = d; ci = i; cj = j; } else if (d < f2) f2 = d;
    }
  }
  const wi = ((ci % 4) + 4) % 4, wj = ((cj % 4) + 4) % 4;
  return { f1, f2, id: wi + wj * 4 };
}

// Returns { c, a, em, gl, gt } or null when the pattern isn't one of ours.
export function stylePixel(P, t, x, y, h) {
  const { base, acc, n1, n2, n3, rand, cellHash, circuit } = h;
  const nv = n3(x / 8, y / 8) * 0.5 + n1(x / 4, y / 4) * 0.3 + n2(x / 2, y / 2) * 0.2;
  if (P === 'hexfilm') {
    const hx = hexAt(x, y);
    const v = cellHash(hx.id);
    const edge = hx.f2 - hx.f1;
    let c = mix(base, h.alt || mix(base, [64, 214, 196], 0.5), v * 0.6);
    c = scale(c, 0.86 + nv * 0.16 + (hx.f1 < 2.2 ? 0.06 : 0));
    let em = 0, gl = 0.45, gt = 0;
    if (edge < 0.9) {
      // rims: dark, but some edges carry a fine gold conductor
      const gold = cellHash(hx.id * 7 + 3) > 0.78 && ((x + y) & 1) === 0;
      c = gold ? mix(scale(base, 0.7), acc, 0.55) : scale(base, 0.62);
      if (gold) { em = 0.2; gl = 0.7; }
    } else if (rand() < 0.012) { c = mix(c, h.speck || [150, 255, 235], 0.7); em = 1; }
    return { c, a: 255, em, gl, gt };
  }
  if (P === 'weave') {
    // basket-woven fibre: 8×8 blocks alternate horizontal / vertical 2-px strands
    const bx = Math.floor(x / 8), by = Math.floor(y / 8);
    const horiz = (bx + by) % 2 === 0;
    const u = horiz ? y % 8 : x % 8, along = horiz ? x : y;
    const strand = Math.floor(u / 2), inS = u % 2;
    let c = scale(base, 0.85 + (inS ? -0.12 : 0.1) + n2(along / 3, strand * 5 + bx * 3) * 0.2 + nv * 0.1);
    if ((horiz ? x % 8 : y % 8) === 0) c = scale(base, 0.6);
    if (strand === 1 && inS === 0) c = mix(c, acc, 0.35);
    let em = 0;
    if (rand() < 0.012) { c = mix(c, [242, 200, 75], 0.8); em = 0.5; }
    return { c, a: 255, em, gl: 0.2, gt: 0 };
  }
  if (P === 'sand') {
    // pale mirror grains: soft gradient, faint dune ripples, very sparse hard glints
    const rip = Math.sin(y * 0.55 + n1(x / 6, y / 6) * 5.0);
    let c = mix(base, [214, 208, 236], clamp01(0.25 + (32 - y) / 120 + rip * 0.12 + (nv - 0.5) * 0.3));
    if (rip > 0.85) c = mix(c, [240, 236, 255], 0.35);
    else if (rip < -0.85) c = scale(c, 0.9);
    let em = 0, gt = 0.35;
    if (rand() < 0.012) { c = [255, 255, 255]; gt = 1; em = 0.4; }
    else if (rand() < 0.03) c = mix(c, [255, 200, 240], 0.3);
    return { c, a: 255, em, gl: 0.85, gt };
  }
  if (P === 'grooves') {
    // engraved circuit grooves cut into blue-grey stone; a few nodes glow
    let c = scale(base, 0.82 + nv * 0.3);
    const m = circuit[x + y * TS], up = circuit[x + ((y + TS - 1) % TS) * TS];
    let em = 0, gl = 0.3;
    if (m) { c = scale(base, 0.45); if (m === 2) { c = mix(c, acc, 0.9); em = 1; } }
    else if (up) { c = scale(base, 1.25); gl = 0.5; }
    return { c, a: 255, em, gl, gt: 0 };
  }
  if (P === 'furrows') {
    // grow bed: raised rows of dark loam with a seeded glow line in each trough
    const r = y % 8;
    let c = scale(base, r < 2 ? 0.6 : r < 5 ? 1.1 + nv * 0.25 : 0.85);
    let em = 0;
    if (r === 1 && (x + Math.floor(y / 8) * 3) % 4 === 0) { c = acc; em = 1; }
    return { c, a: 255, em, gl: 0.2, gt: 0 };
  }
  return null;
}

// Straight luminous band along the top edge of a side tile (replaces the grass "drip").
export function paintLip(alb, mat, lip, hexToRgb, rand, glowMode) {
  const lc = hexToRgb(lip.color), gc = hexToRgb(lip.glow || lip.color);
  const depth = Math.round(lip.px * (TS / 16));
  for (let x = 0; x < TS; x++) for (let y = 0; y <= depth + 1; y++) {
    const i = (x + y * TS) * 4;
    let c, em = 0;
    if (y < depth) c = scale(lc, 0.85 + rand() * 0.2 + (y === 0 ? 0.15 : 0));
    else if (y === depth) { c = gc; em = 0.8; }
    else c = scale([alb[i], alb[i + 1], alb[i + 2]], 0.6);
    alb[i] = Math.min(255, c[0]); alb[i + 1] = Math.min(255, c[1]); alb[i + 2] = Math.min(255, c[2]); alb[i + 3] = 255;
    mat[i] = em * 255; mat[i + 1] = 110;
    if (em) mat[i + 3] = (Math.max(glowMode, 1) / 3) * 255;
  }
}
