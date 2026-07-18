// palettes.js — 62-entry colour & parameter tables, built deterministically
// from authored archetypes. Three-free (colours are plain ints).

function assert62(name, arr) {
  if (arr.length !== 62) throw new Error(`palette ${name} has ${arr.length} entries, needs 62`);
  return arr;
}

// hsl → 0xRRGGBB  (h in degrees, s/l 0..1)
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const r = Math.round(f(h + 1 / 3) * 255), g = Math.round(f(h) * 255), b = Math.round(f(h - 1 / 3) * 255);
  return (r << 16) | (g << 8) | b;
}

// ── char 0: sky palette — {top, mid, hor(izon), sun, stars 0..1, name} ───────
const SKY_ARCHES = [
  { name: 'Clear Noon',   h: 210, top: [0.65, 0.45], mid: [0.60, 0.62], hor: [0.35, 0.80], sunH: 45,  stars: 0 },
  { name: 'First Light',  h: 25,  top: [0.45, 0.35], mid: [0.70, 0.60], hor: [0.85, 0.72], sunH: 30,  stars: 0.2 },
  { name: 'Ember Dusk',   h: 15,  top: [0.60, 0.18], mid: [0.85, 0.42], hor: [0.95, 0.58], sunH: 20,  stars: 0.3 },
  { name: 'Vapor Haze',   h: 320, top: [0.55, 0.45], mid: [0.65, 0.62], hor: [0.50, 0.78], sunH: 300, stars: 0.1 },
  { name: 'Toxic Bloom',  h: 95,  top: [0.55, 0.22], mid: [0.75, 0.45], hor: [0.90, 0.60], sunH: 70,  stars: 0.2 },
  { name: 'Deep Night',   h: 235, top: [0.60, 0.06], mid: [0.55, 0.12], hor: [0.45, 0.22], sunH: 230, stars: 1 },
  { name: 'Storm Slate',  h: 215, top: [0.20, 0.20], mid: [0.15, 0.32], hor: [0.12, 0.45], sunH: 210, stars: 0 },
  { name: 'Sandveil',     h: 40,  top: [0.45, 0.55], mid: [0.55, 0.65], hor: [0.60, 0.72], sunH: 45,  stars: 0 },
  { name: 'Mint Morning', h: 160, top: [0.40, 0.55], mid: [0.45, 0.68], hor: [0.35, 0.82], sunH: 140, stars: 0 },
  { name: 'Royal Hour',   h: 265, top: [0.60, 0.20], mid: [0.60, 0.38], hor: [0.70, 0.55], sunH: 290, stars: 0.6 },
  { name: 'Blood Sky',    h: 355, top: [0.55, 0.12], mid: [0.75, 0.32], hor: [0.85, 0.48], sunH: 10,  stars: 0.3 },
  { name: 'Whiteout',     h: 210, top: [0.10, 0.80], mid: [0.08, 0.86], hor: [0.05, 0.92], sunH: 210, stars: 0 },
  { name: 'Abyss Teal',   h: 190, top: [0.70, 0.10], mid: [0.65, 0.20], hor: [0.55, 0.32], sunH: 175, stars: 0.8 },
  { name: 'Ink & Gold',   h: 230, top: [0.35, 0.08], mid: [0.30, 0.14], hor: [0.90, 0.45], sunH: 45,  stars: 0.7 },
];
export const SKY_PALETTES = assert62('SKY_PALETTES', (() => {
  const out = [];
  for (let i = 0; i < 62; i++) {
    const a = SKY_ARCHES[i % SKY_ARCHES.length];
    const drift = Math.floor(i / SKY_ARCHES.length) * 16; // repeats drift hue; first pass is canonical
    out.push({
      name: drift === 0 ? a.name : `${a.name} ${['I', 'II', 'III', 'IV', 'V'][Math.floor(i / SKY_ARCHES.length)]}`,
      top: hsl(a.h + drift, a.top[0], a.top[1]),
      mid: hsl(a.h + drift * 0.7, a.mid[0], a.mid[1]),
      hor: hsl(a.h + drift * 0.4, a.hor[0], a.hor[1]),
      sun: hsl(a.sunH + drift * 0.3, 0.85, 0.75),
      stars: a.stars,
    });
  }
  return out;
})());

// ── char 1: time of day — a 62-step day wheel ────────────────────────────────
// el: sun elevation (-1..1, <0 below horizon). dayness: 0 night → 1 noon.
export const TIMES = assert62('TIMES', (() => {
  const out = [];
  const bucket = (f) => f < 0.04 ? 'Midnight' : f < 0.14 ? 'Small Hours' : f < 0.22 ? 'Pre-Dawn'
    : f < 0.30 ? 'Dawn' : f < 0.42 ? 'Morning' : f < 0.56 ? 'Noon' : f < 0.68 ? 'Afternoon'
    : f < 0.78 ? 'Golden Hour' : f < 0.86 ? 'Dusk' : f < 0.94 ? 'Evening' : 'Night';
  for (let i = 0; i < 62; i++) {
    const f = i / 62; // fraction of the day, 0 = midnight
    const ang = (f - 0.25) * Math.PI * 2; // sun angle; peaks at f=0.5 (noon)
    const el = Math.sin(ang);
    out.push({
      name: bucket(f), f, el,
      az: f * Math.PI * 2,
      dayness: Math.max(0, Math.min(1, el * 1.6 + 0.25)),
    });
  }
  return out;
})());

// ── char 2: weather / fog ────────────────────────────────────────────────────
// fog: 0 none → 1 dense. precip: 0 none, 1 rain, 2 snow. wind: 0..1
export const WEATHERS = assert62('WEATHERS', (() => {
  const out = [];
  const names = ['Crystal Clear', 'Clear', 'Light Haze', 'Haze', 'Mist', 'Fog', 'Dense Fog', 'Pea Soup'];
  for (let i = 0; i < 62; i++) {
    const band = i % 8;
    const fog = [0, 0.06, 0.16, 0.28, 0.42, 0.58, 0.75, 0.92][band];
    const wet = i >= 44 && i < 54; // a rainy stripe of the table
    const snow = i >= 54;          // and a snowy one
    out.push({
      name: snow ? `Snow · ${names[band]}` : wet ? `Rain · ${names[band]}` : names[band],
      fog: snow ? Math.max(fog, 0.3) : fog,
      precip: snow ? 2 : wet ? 1 : 0,
      wind: ((i * 13) % 10) / 10,
    });
  }
  return out;
})());

// ── char 3: water hue — greens & blues, {shallow, deep, foam, name} ──────────
export const WATER_HUES = assert62('WATER_HUES', (() => {
  const out = [];
  const names = ['Glacier', 'Lagoon', 'Jade', 'Kelp', 'Teal', 'Harbour', 'Open Sea', 'Ink Sea', 'Tropic', 'Slate Water'];
  for (let i = 0; i < 62; i++) {
    const h = 120 + (i / 61) * 130 + ((i * 17) % 5) * 3; // 120° green → 250° blue
    const l = 0.28 + ((i * 7) % 9) * 0.03;
    out.push({
      name: names[i % names.length] + (i >= 50 ? ' Dark' : ''),
      shallow: hsl(h, 0.55, Math.min(0.55, l + 0.18)),
      deep: hsl(h + 12, 0.6, Math.max(0.08, l - 0.14)),
      foam: hsl(h - 20, 0.25, 0.85),
    });
  }
  return out;
})());

// ── char 7: building palette — {bases[4], accent, glow, name} ────────────────
const BLD_ARCHES = [
  { name: 'Concrete',      h: 220, s: 0.05, l: [0.55, 0.45, 0.62, 0.38], glow: 45 },
  { name: 'Brick Row',     h: 15,  s: 0.35, l: [0.42, 0.35, 0.50, 0.30], glow: 40 },
  { name: 'Glass Blue',    h: 205, s: 0.30, l: [0.55, 0.48, 0.65, 0.40], glow: 190 },
  { name: 'Pastel Town',   h: 340, s: 0.30, l: [0.72, 0.65, 0.78, 0.60], glow: 55 },
  { name: 'Noir & Gold',   h: 230, s: 0.10, l: [0.16, 0.12, 0.22, 0.09], glow: 48 },
  { name: 'Sandstone',     h: 38,  s: 0.30, l: [0.62, 0.55, 0.70, 0.48], glow: 40 },
  { name: 'White City',    h: 210, s: 0.03, l: [0.85, 0.78, 0.90, 0.72], glow: 200 },
  { name: 'Neon Charcoal', h: 250, s: 0.08, l: [0.20, 0.15, 0.26, 0.12], glow: 300 },
  { name: 'Terracotta',    h: 20,  s: 0.42, l: [0.52, 0.45, 0.60, 0.38], glow: 35 },
  { name: 'Sea Slate',     h: 180, s: 0.15, l: [0.40, 0.33, 0.48, 0.27], glow: 165 },
];
export const BUILDING_PALETTES = assert62('BUILDING_PALETTES', (() => {
  const out = [];
  for (let i = 0; i < 62; i++) {
    const a = BLD_ARCHES[i % BLD_ARCHES.length];
    const d = Math.floor(i / BLD_ARCHES.length) * 18;
    out.push({
      name: d === 0 ? a.name : `${a.name} ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][Math.floor(i / BLD_ARCHES.length)]}`,
      bases: a.l.map((l, k) => hsl(a.h + d + k * 4, a.s, l)),
      accent: hsl(a.h + d + 180, Math.min(0.6, a.s + 0.3), 0.55),
      glow: hsl(a.glow + d * 0.5, 0.75, 0.62),
    });
  }
  return out;
})());

// ── char 10: vehicle palette — 6 body colours per world ──────────────────────
export const VEHICLE_PALETTES = assert62('VEHICLE_PALETTES', (() => {
  const out = [];
  const names = ['Taxi Fleet', 'Primaries', 'Pastels', 'Blackout', 'Chrome Age', 'Sunset Fleet', 'Utility', 'Candy'];
  for (let i = 0; i < 62; i++) {
    const base = (i * 137.5) % 360; // golden angle — every set feels distinct
    const kind = i % names.length;
    const colors = [];
    for (let k = 0; k < 6; k++) {
      const h = base + k * [60, 72, 25, 10, 40, 15, 90, 55][kind];
      const s = [0.85, 0.8, 0.45, 0.1, 0.15, 0.75, 0.5, 0.9][kind];
      const l = [0.55, 0.5, 0.72, 0.15, 0.65, 0.5, 0.4, 0.6][kind] + (k % 3) * 0.06;
      colors.push(hsl(h, s, l));
    }
    out.push({ name: names[kind], colors });
  }
  return out;
})());

// ── char 22: room palette — {wall, wall2, floor, rug, desk, name} ────────────
const ROOM_ARCHES = [
  { name: 'Warm Study',   wall: [35, 0.25, 0.72], floor: [25, 0.35, 0.35], rug: [15, 0.45, 0.45] },
  { name: 'Cool Loft',    wall: [210, 0.10, 0.65], floor: [220, 0.05, 0.30], rug: [200, 0.35, 0.40] },
  { name: 'Forest Den',   wall: [140, 0.18, 0.55], floor: [30, 0.30, 0.28], rug: [90, 0.30, 0.35] },
  { name: 'Midnight',     wall: [240, 0.20, 0.25], floor: [240, 0.10, 0.15], rug: [280, 0.35, 0.35] },
  { name: 'Paper White',  wall: [50, 0.06, 0.88], floor: [40, 0.15, 0.55], rug: [210, 0.25, 0.55] },
  { name: 'Terra Room',   wall: [18, 0.35, 0.60], floor: [15, 0.30, 0.30], rug: [40, 0.50, 0.50] },
  { name: 'Mint Office',  wall: [160, 0.22, 0.70], floor: [170, 0.10, 0.35], rug: [340, 0.30, 0.55] },
  { name: 'Rose Quartz',  wall: [340, 0.20, 0.75], floor: [350, 0.12, 0.40], rug: [320, 0.35, 0.50] },
];
export const ROOM_PALETTES = assert62('ROOM_PALETTES', (() => {
  const out = [];
  for (let i = 0; i < 62; i++) {
    const a = ROOM_ARCHES[i % ROOM_ARCHES.length];
    const d = Math.floor(i / ROOM_ARCHES.length) * 22;
    out.push({
      name: a.name,
      wall: hsl(a.wall[0] + d, a.wall[1], a.wall[2]),
      wall2: hsl(a.wall[0] + d + 15, a.wall[1] + 0.08, a.wall[2] - 0.12),
      floor: hsl(a.floor[0] + d, a.floor[1], a.floor[2]),
      rug: hsl(a.rug[0] + d, a.rug[1], a.rug[2]),
      desk: hsl(a.floor[0] + d + 8, a.floor[1] + 0.1, a.floor[2] + 0.12),
    });
  }
  return out;
})());

// ── char 24: nature / props theme ────────────────────────────────────────────
export const NATURE_THEMES = assert62('NATURE_THEMES', (() => {
  const out = [];
  const shapes = ['cone', 'round', 'palm', 'dead', 'crystal'];
  const names = { cone: 'Pine Belt', round: 'Broadleaf', palm: 'Palm Line', dead: 'Bare Grove', crystal: 'Crystal Flora' };
  for (let i = 0; i < 62; i++) {
    const shape = shapes[i % shapes.length];
    const h = shape === 'crystal' ? (i * 67) % 360 : 80 + ((i * 23) % 70); // greens unless crystal
    out.push({
      name: names[shape], shape,
      foliage: [hsl(h, 0.45, 0.35), hsl(h + 14, 0.5, 0.42), hsl(h - 10, 0.4, 0.28)],
      trunk: shape === 'crystal' ? hsl(h, 0.3, 0.6) : hsl(25, 0.35, 0.25),
      grass: hsl(shape === 'crystal' ? h : 90 + ((i * 31) % 50), 0.30, 0.32),
    });
  }
  return out;
})());

// ── char 25: window-light pattern — {density, warmth, flicker, name} ─────────
export const LIGHT_PATTERNS = assert62('LIGHT_PATTERNS', (() => {
  const out = [];
  const names = ['Dark Town', 'Sparse Lights', 'Scattered', 'Half Lit', 'Busy Windows', 'Full Blaze'];
  for (let i = 0; i < 62; i++) {
    const band = i % 6;
    out.push({
      name: names[band],
      density: [0.04, 0.12, 0.24, 0.42, 0.62, 0.85][band],
      warmth: ((i * 11) % 10) / 10,       // 0 cool white → 1 sodium warm
      flicker: i % 7 === 3,
    });
  }
  return out;
})());

// ── char 23: soundscape — seeded ambient pad parameters ──────────────────────
export const SOUNDSCAPES = assert62('SOUNDSCAPES', (() => {
  const out = [];
  const roots = [55, 61.7, 65.4, 73.4, 82.4, 98, 110]; // A1 B1 C2 D2 E2 G2 A2
  const names = ['Low Drift', 'Hollow Wind', 'Warm Pad', 'Glass Air', 'Deep Hum', 'Night Choir', 'Thin Ice'];
  for (let i = 0; i < 62; i++) {
    out.push({
      name: names[i % names.length],
      root: roots[i % roots.length] * (i >= 31 ? 2 : 1),
      detune: 0.3 + ((i * 7) % 10) * 0.25,     // Hz beat between the two oscs
      cutoff: 240 + ((i * 37) % 12) * 90,
      lfo: 0.05 + ((i * 13) % 8) * 0.02,
      wind: 0.2 + ((i * 5) % 7) * 0.1,
    });
  }
  return out;
})());
