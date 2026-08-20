// Roof, wood, road and ground generators. Same output shape as stone(): rgba (a = roughness),
// a height field, and a normal strength.

import { rng, fields, clamp, lerp, smoothstep, hexRgb, mixRgb, voronoi } from './noise.js';

function buffers(S) {
  return { rgba: new Uint8ClampedArray(S * S * 4), height: new Float32Array(S * S) };
}

// Tile footprint in metres, so the courses stay the size of real roof tiles whatever the
// texture tile is set to. A roof read at wall-course scale is what made the gables look
// like brick loaves.
const TILE_M = {
  curved: [0.30, 0.26],
  slate: [0.26, 0.19],
  thatch: [1.4, 0.42],
};

// Rescale a finished buffer so its mean luminance lands on `target`. The tile shading inside
// roof() multiplies the authored colour down by an amount that depends on the tile kind, which
// is why an authored roof colour and the roof you actually see were two different values.
function normalise(rgba, target) {
  if (!target) return;
  let sum = 0;
  for (let i = 0; i < rgba.length; i += 4) sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  const mean = sum / (rgba.length / 4) / 255;
  if (mean < 0.004) return;
  const g = clamp(target / mean, 0.25, 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] *= g; rgba[i + 1] *= g; rgba[i + 2] *= g;
  }
}

export function roof(S, cfg, tileM, seed = 3) {
  const f = fields();
  const rand = rng(seed);
  const base = hexRgb(cfg.color), dark = hexRgb(cfg.dark);
  const { rgba, height } = buffers(S);
  const tileCol = [0, 0, 0];
  const kind = cfg.tile;

  const [tw, th] = TILE_M[kind] || TILE_M.slate;
  const cols = kind === 'thatch' ? 1 : Math.max(2, Math.round(tileM / tw));
  const rows = Math.max(2, Math.round(tileM / th));
  // A roof is a large flat plane, so a glossy value here puts the whole slope inside one
  // specular lobe and it blows out white. Zone roughness is remapped into a safe band.
  const baseRough = 0.54 + cfg.roughness * 0.40;
  const tone = new Float32Array(64);
  for (let i = 0; i < tone.length; i++) tone[i] = rand();

  for (let py = 0; py < S; py++) {
    const v = py / S;
    const rf = v * rows, r = Math.floor(rf), fv = rf - r;
    for (let px = 0; px < S; px++) {
      const u = px / S;
      const gn = f.grain.at(u * 4, v * 4);
      const fn = f.fine.at(u * 2, v * 2);
      const cn = f.coarse.at(u, v);
      let h, shade, rough = baseRough, t;

      if (kind === 'curved') {
        const off = (r % 2) * 0.5;
        let cu = u * cols + off; cu -= Math.floor(cu);
        const dome = Math.pow(Math.sin(Math.PI * clamp(cu, 0, 1)), 0.55);
        const course = smoothstep(0, 0.16, fv);
        h = dome * 0.62 * course + course * 0.28;
        t = tone[(r * cols + Math.floor(u * cols + off)) & 63];
        shade = 0.68 + 0.32 * dome * course;
        rough += (gn - 0.5) * 0.2 - dome * 0.16;
      } else if (kind === 'slate') {
        const off = (r % 2) * 0.5;
        let cu = u * cols + off; cu -= Math.floor(cu);
        const gapU = smoothstep(0, 0.035, Math.min(cu, 1 - cu));
        const course = smoothstep(0, 0.09, fv);
        h = (0.55 + 0.45 * gapU) * course;
        h += (1 - course) * -0.35;
        t = tone[(r * cols + Math.floor(u * cols + off)) & 63];
        shade = (0.6 + 0.4 * course) * (0.82 + 0.18 * gapU);
        rough += (gn - 0.5) * 0.24;
      } else {
        const strand = f.fine.at(u * 9 + cn * 0.4, v);
        const lip = Math.pow(smoothstep(0.55, 1, fv), 1.6);
        h = strand * 0.55 + lip * 0.7 + (gn - 0.5) * 0.25;
        t = strand;
        shade = 0.55 + 0.45 * strand * (0.55 + 0.45 * (1 - lip * 0.6));
        rough += (gn - 0.5) * 0.1;
      }

      mixRgb(dark, base, clamp(0.2 + t * 0.7 + (cn - 0.5) * 0.5, 0, 1), tileCol);
      const k = shade * (0.9 + 0.2 * gn) * (1 - 0.12 * smoothstep(0.6, 1, fn));

      const i = (py * S + px) * 4;
      rgba[i] = tileCol[0] * k;
      rgba[i + 1] = tileCol[1] * k;
      rgba[i + 2] = tileCol[2] * k;
      rgba[i + 3] = clamp(rough, 0.12, 1) * 255;
      height[py * S + px] = h;
    }
  }
  normalise(rgba, cfg.lum);
  return { rgba, height, strength: kind === 'thatch' ? 3.0 : 2.8 };
}

// Leaded lights. Alpha is the glow mask rather than roughness here: the lead cames must stay
// dark when the pane is lit, or a night window is just a bright rectangle stuck on the wall.
export function glass(S, z, tileM, seed = 21) {
  const f = fields();
  const rand = rng(seed);
  const tints = z.window.glass.map(hexRgb);
  const came = hexRgb(z.window.frame);
  const { rgba, height } = buffers(S);
  const out = [0, 0, 0], mid = [0, 0, 0];

  const cols = Math.max(2, Math.round(tileM / 0.23));
  const rows = Math.max(2, Math.round(tileM / 0.19));
  const lead = 0.055;
  const pane = new Float32Array(cols * rows * 2);
  for (let i = 0; i < pane.length; i++) pane[i] = rand();

  for (let py = 0; py < S; py++) {
    const v = py / S, rf = v * rows, r = Math.floor(rf), fv = rf - r;
    for (let px = 0; px < S; px++) {
      const u = px / S, cf = u * cols, c = Math.floor(cf), fu = cf - c;
      const gn = f.grain.at(u * 5, v * 5);

      const edge = Math.min(Math.min(fu, 1 - fu), Math.min(fv, 1 - fv));
      const glassness = smoothstep(lead * 0.6, lead * 1.6, edge);
      const k = pane[(r * cols + c) * 2], k2 = pane[(r * cols + c) * 2 + 1];

      // One glass colour per window with a few panes leaning off it. Picking freely per pane
      // turns a leaded light into a harlequin quilt.
      mixRgb(tints[0], tints[1 + (Math.floor(k * 97) % Math.max(1, tints.length - 1))],
        k > 0.78 ? 0.45 : k * 0.16, mid);
      mixRgb(came, mid, glassness, out);

      // a faint diagonal sheen so daytime panes are not flat colour
      const sheen = smoothstep(0.42, 0.58, ((u + v) * 1.7 + gn * 0.25) % 1) * glassness * 0.22;
      const shade = (0.78 + 0.34 * k2) * (0.94 + 0.12 * gn) + sheen;

      const i = (py * S + px) * 4;
      rgba[i] = out[0] * shade;
      rgba[i + 1] = out[1] * shade;
      rgba[i + 2] = out[2] * shade;
      rgba[i + 3] = glassness * (0.5 + 0.5 * k2) * 255;
      height[py * S + px] = glassness * 0.5 + sheen * 0.2;
    }
  }
  return { rgba, height, strength: 1.4 };
}

export function wood(S, cfg, seed = 5) {
  const f = fields();
  const rand = rng(seed);
  const base = hexRgb(cfg.base), dark = hexRgb(cfg.dark);
  const { rgba, height } = buffers(S);
  const out = [0, 0, 0];
  const planks = 5;
  const tone = new Float32Array(planks);
  for (let i = 0; i < planks; i++) tone[i] = rand();

  for (let py = 0; py < S; py++) {
    const v = py / S;
    const pf = v * planks, p = Math.floor(pf), fv = pf - p;
    for (let px = 0; px < S; px++) {
      const u = px / S;
      const warp = f.warp.at(u, v * 2);
      // rings: a slowly drifting sawtooth across the plank gives grain that follows the board
      const ring = Math.abs((((fv * 2.2 + warp * 1.8 + f.coarse.at(u, v * 3) * 1.4) * 7) % 1) - 0.5) * 2;
      const gn = f.grain.at(u * 6, v * 2);
      const gap = smoothstep(0, 0.05, Math.min(fv, 1 - fv));

      const grainDark = 0.72 + 0.28 * smoothstep(0.15, 0.8, ring);
      mixRgb(dark, base, clamp(0.25 + tone[p] * 0.6 + (gn - 0.5) * 0.3, 0, 1), out);
      const k = grainDark * (0.35 + 0.65 * gap) * (0.92 + 0.16 * gn);

      const i = (py * S + px) * 4;
      rgba[i] = out[0] * k;
      rgba[i + 1] = out[1] * k;
      rgba[i + 2] = out[2] * k;
      rgba[i + 3] = clamp(cfg.roughness + (1 - ring) * 0.12 + (gn - 0.5) * 0.16, 0.15, 1) * 255;
      height[py * S + px] = gap * 0.6 + ring * 0.12 + (gn - 0.5) * 0.06;
    }
  }
  return { rgba, height, strength: 1.6 };
}

export function road(S, z, tileM, seed = 9) {
  const f = fields();
  const kind = z.road;
  const st = z.stone;
  const tint = hexRgb(z.groundTint);
  const light = hexRgb(kind === 'marbleCobble' ? st.base : st.dark);
  const shadeC = hexRgb(st.mortar);
  const { rgba, height } = buffers(S);
  const out = [0, 0, 0], cell = [0, 0, 0];
  const setts = kind === 'marbleCobble' ? 0.52 : 0.19;
  const cells = kind === 'dirt' ? 6 : Math.max(3, Math.round(tileM / setts));

  for (let py = 0; py < S; py++) {
    const v = py / S;
    for (let px = 0; px < S; px++) {
      const u = px / S;
      const gn = f.grain.at(u * 5, v * 5);
      const cn = f.coarse.at(u, v);
      const fn = f.fine.at(u * 2, v * 2);
      let h, k, col;

      if (kind === 'dirt') {
        const [d1, , did] = voronoi(u + 5.5, v + 2.2, cells * 4, seed + 17, 0.95);
        const stone = smoothstep(0.15, 0.045, d1) * (did > 0.62 ? 1 : 0);
        const gravel = smoothstep(0.66, 0.9, fn);
        const patch = smoothstep(0.3, 0.78, cn);
        h = (cn - 0.5) * 0.6 + (gn - 0.5) * 0.28 + stone * 0.55 - gravel * 0.12;
        mixRgb(tint, light, clamp(patch * 0.95 + gravel * 0.55, 0, 1), out);
        if (stone > 0.01) mixRgb(out, light, stone * 0.5, out);
        col = out;
        k = (0.66 + 0.52 * cn) * (0.88 + 0.24 * gn) * (1 - 0.22 * gravel) * (1 + 0.18 * stone);
      } else {
        const [f1, f2, id] = voronoi(u + (fn - 0.5) * 0.03, v + (gn - 0.5) * 0.03, cells, seed, 0.9);
        const edge = smoothstep(0, kind === 'marbleCobble' ? 0.1 : 0.16, f2 - f1);
        const dome = kind === 'cobble' ? Math.sqrt(clamp(1 - f1 * 1.9, 0, 1)) : 1;
        h = edge * (0.5 + 0.5 * dome) - (1 - edge) * 0.4;
        mixRgb(shadeC, light, clamp(0.15 + id * 0.85 + (cn - 0.5) * 0.4, 0, 1), cell);
        if (kind === 'marbleCobble') {
          const vein = smoothstep(0.46, 0.54, f.warp.at(u * 2 + id, v * 2));
          mixRgb(cell, tint, vein * 0.35, cell);
        }
        mixRgb(tint, cell, edge, out);
        col = out;
        k = (0.5 + 0.5 * edge) * (0.55 + 0.45 * dome) * (0.9 + 0.2 * gn);
      }

      const i = (py * S + px) * 4;
      rgba[i] = col[0] * k;
      rgba[i + 1] = col[1] * k;
      rgba[i + 2] = col[2] * k;
      rgba[i + 3] = clamp(0.82 + (gn - 0.5) * 0.3 - (kind === 'marbleCobble' ? 0.18 : 0), 0.2, 1) * 255;
      height[py * S + px] = h;
    }
  }
  return { rgba, height, strength: kind === 'dirt' ? 1.2 : 2.2 };
}

// `tileM` sets how many tufts and pebbles fit in the tile, so the grass stays the same
// physical size whatever the texture tile is.
export function ground(S, z, tileM, seed = 13) {
  const f = fields();
  const rand = rng(seed);
  const g0 = hexRgb(z.foliage.grass[0]), g1 = hexRgb(z.foliage.grass[1]), g2 = hexRgb(z.foliage.grass[2]);
  const soil = hexRgb(z.groundTint);
  const flower = hexRgb(z.id === 'light' ? '#e8d9e8' : z.id === 'neutral' ? '#e0d69a' : '#8d6a7e');
  const flowerDensity = z.id === 'light' ? 0.972 : z.id === 'neutral' ? 0.984 : 0.991;
  const { rgba, height } = buffers(S);
  const out = [0, 0, 0], mid = [0, 0, 0];
  const spark = new Float32Array(S * S);
  for (let i = 0; i < spark.length; i++) spark[i] = rand();

  const tufts = Math.max(3, Math.round(tileM / 0.34));
  const stones = Math.max(3, Math.round(tileM / 0.5));

  for (let py = 0; py < S; py++) {
    const v = py / S;
    for (let px = 0; px < S; px++) {
      const u = px / S;
      const cn = f.coarse.at(u, v);
      const fn = f.fine.at(u * 2, v * 2);
      const gn = f.grain.at(u * 8, v * 8);

      // clumps: voronoi cells are the tufts, f2-f1 is the parting between them
      const [t1, t2, tid] = voronoi(u + (fn - 0.5) * 0.09, v + (gn - 0.5) * 0.09, tufts, seed, 0.95);
      const tuft = smoothstep(0.02, 0.30, t2 - t1);
      const blade = f.fine.at(u * 11 + tid, v * 11 + gn * 0.4);

      const wear = smoothstep(0.62, 0.9, 1 - cn);
      mixRgb(g2, g0, clamp(cn * 1.25 + (tid - 0.5) * 0.5, 0, 1), mid);
      mixRgb(mid, g1, clamp(fn * 0.75 + tuft * 0.35, 0, 1), out);
      mixRgb(out, soil, wear * 0.8, out);

      let h = tuft * 0.5 + blade * 0.3 + cn * 0.3 + (gn - 0.5) * 0.2;
      let rough = 0.94 + (gn - 0.5) * 0.12;
      let k = (0.66 + 0.34 * tuft) * (0.78 + 0.44 * blade) * (0.93 + 0.14 * gn);

      // pebbles only where the turf has worn back to soil
      if (wear > 0.35) {
        const [s1, s2, sid] = voronoi(u + 3.1, v + 7.7, Math.round(stones * 1.7), seed + 71, 0.9);
        const pebble = smoothstep(0.16, 0.05, s1) * smoothstep(0.35, 0.6, wear) * (sid > 0.55 ? 1 : 0);
        if (pebble > 0.01) {
          mixRgb(out, soil, pebble * 0.6, out);
          k = lerp(k, 1.02 + (sid - 0.5) * 0.2, pebble);
          h = lerp(h, 0.62 + sid * 0.2, pebble);
          rough = lerp(rough, 0.62, pebble);
        }
      }

      const s = spark[py * S + px];
      if (s > flowerDensity && tuft > 0.5) { mixRgb(out, flower, 0.7, out); k = 1.06; }

      const i = (py * S + px) * 4;
      rgba[i] = out[0] * k;
      rgba[i + 1] = out[1] * k;
      rgba[i + 2] = out[2] * k;
      rgba[i + 3] = clamp(rough, 0.4, 1) * 255;
      height[py * S + px] = h;
    }
  }
  return { rgba, height, strength: 1.9 };
}
