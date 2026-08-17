// §3.1's eight districts as data, plus the low-frequency field that assigns one to a chunk.
// P2 owns chunk generation; P1a needs this now only for the window/sign palettes that drive
// `iEmissive`. Nothing here imports three.js or the DOM.
//
// §3.1 calls for `data/districts.json`. It lives here as a module instead: there is no build
// step, the table is 8 rows, and a fetch would make every consumer async for no gain. The
// numbers are §3.1's verbatim.

import { hash2i, hashf, lerp, smoothstep } from './utils.js';

// window = the emissive tint of lit panes. sign = the signage tint bias P3a will read.
export const DISTRICTS = [
  { id: 'spine',   name: 'The Spine',       h: [220, 520], density: 0.95, tier: 1, window: 0xdbe8ff, sign: 0x35e6ff },
  { id: 'ribs',    name: 'The Ribs',        h: [90, 260],  density: 1.00, tier: 1, window: 0xffc07a, sign: 0xff8a2b },
  { id: 'vault',   name: 'Vault Row',       h: [260, 620], density: 0.70, tier: 2, window: 0x9fd8e8, sign: 0xd8f2ff },
  { id: 'soot',    name: 'Sootfields',      h: [50, 150],  density: 0.85, tier: 2, window: 0xffa24a, sign: 0xff2d3a },
  { id: 'lantern', name: 'Lantern Quarter', h: [70, 200],  density: 1.00, tier: 3, window: 0xff8ad8, sign: 0xff2a9d },
  { id: 'cradle',  name: 'The Cradle',      h: [120, 300], density: 0.80, tier: 4, window: 0x8dffbe, sign: 0x35e6ff },
  { id: 'pale',    name: 'Pale Terrace',    h: [300, 700], density: 0.55, tier: 5, window: 0xeef6ff, sign: 0xeef6ff },
  { id: 'drown',   name: 'The Drownings',   h: [30, 110],  density: 0.90, tier: 6, window: 0xff5a52, sign: 0x6bff8a },
];

export const byId = Object.fromEntries(DISTRICTS.map(d => [d.id, d]));

// Value noise on the chunk lattice with a 6-chunk wavelength (§3.1). Quantised to 8 ids, so the
// shapes are organic and irregular rather than a partition, and cost one hash per corner.
const WAVE = 6;

function vnoise(x, z, salt) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const fx = smoothstep(x - xi), fz = smoothstep(z - zi);
  const a = hashf(xi, zi, salt), b = hashf(xi + 1, zi, salt);
  const c = hashf(xi, zi + 1, salt), d = hashf(xi + 1, zi + 1, salt);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

// Two octaves at different salts, so the eight ids do not fall into visible stripes the way one
// octave quantised eight ways does.
export function districtAt(cx, cz, seed = 0) {
  const u = vnoise(cx / WAVE, cz / WAVE, seed ^ 0x51ed) * 0.65
          + vnoise(cx / (WAVE * 0.5), cz / (WAVE * 0.5), seed ^ 0x2f9b) * 0.35;
  const i = Math.min(DISTRICTS.length - 1, Math.floor(u * DISTRICTS.length));
  return DISTRICTS[i];
}

// The window tint a single building gets: the district colour, jittered a little so a block is a
// family rather than a swatch. Returns [r,g,b] in 0..1, sRGB — materials.js hands it straight to
// an instanced attribute and the shader multiplies it by the atlas.
//
// Still used by js/probes.js's P1a fixture rig, which wants ONE flat colour per box and no zones.
// The city itself goes through `paint()` below.
export function windowTint(d, rng, out = [0, 0, 0]) {
  const hex = d.window;
  const j = 0.86 + rng() * 0.28;
  out[0] = Math.min(1, ((hex >> 16) & 255) / 255 * j);
  out[1] = Math.min(1, ((hex >> 8) & 255) / 255 * j);
  out[2] = Math.min(1, (hex & 255) / 255 * j);
  return out;
}

// ── P11 §1 — colour variety, within a building and between neighbours ───────
//
// ART_PASS, from the plates: "a building is not one colour" and "adjacent buildings differ HARD —
// a cold blue-white block next to a hot orange one next to an unlit black one". The MECHANISM for
// this already existed (one `iEmissive` per instance); what was wrong was the DISTRIBUTION. Every
// building took its district's single colour with a ±14 % brightness jitter, so a district was one
// swatch and every tower was that swatch from pavement to roof. 746850_03 has none of that: one
// tower there carries a band of cyan, then warm amber, then an unlit section, then a lit crown.
//
// TWO HARD CONSTRAINTS THIS OBEYS:
//
// 1. **No new rng draws.** `city.js`'s determinism hash mixes `cell` and `jitter`, and the whole
//    world is one xorshift stream per chunk — one extra draw would move the golden hash for every
//    building in the city. So every number here is DERIVED from a dedicated hash of the building's
//    quantised world position. Determinism is unchanged and provably so: `hashRegion` never sees
//    any of it.
// 2. **No new geometry and no new draws.** All of this is instance attribute data read by three
//    extra lines of the shell fragment shader.

// The pool every district draws from. These are light sources, not paint: the names are the
// lamp, not the wall.
export const LIGHTS = {
  ice:     0xdbe8ff,
  white:   0xeef6ff,
  cyan:    0x7fe4ff,
  teal:    0x36d9c4,
  green:   0x8dffbe,
  amber:   0xffc07a,
  sodium:  0xffa24a,
  ember:   0xff7326,
  magenta: 0xff8ad8,
  blood:   0xff5a52,
};

// Weighted per district. The district still READS as a district — its own colour is the plurality
// and the minimap still means something — but ~40 % of any block is drawn from elsewhere in the
// pool, including at least one colour that clashes with the home hue. That clash is the whole
// point: a gentle spread around a district mean is a texture, a hard difference is a city.
const MIX = {
  spine:   [['ice', 40], ['white', 12], ['cyan', 16], ['teal', 8], ['amber', 12], ['ember', 7], ['magenta', 5]],
  ribs:    [['amber', 38], ['sodium', 18], ['ember', 12], ['ice', 12], ['cyan', 9], ['blood', 6], ['green', 5]],
  vault:   [['cyan', 36], ['ice', 20], ['teal', 16], ['white', 10], ['sodium', 9], ['magenta', 5], ['ember', 4]],
  soot:    [['sodium', 36], ['ember', 19], ['blood', 15], ['amber', 11], ['ice', 9], ['green', 5], ['cyan', 5]],
  lantern: [['magenta', 34], ['blood', 14], ['ember', 14], ['amber', 12], ['cyan', 12], ['ice', 9], ['green', 5]],
  cradle:  [['green', 34], ['teal', 18], ['cyan', 16], ['ice', 12], ['amber', 11], ['sodium', 5], ['blood', 4]],
  pale:    [['white', 42], ['ice', 26], ['cyan', 12], ['teal', 7], ['amber', 7], ['magenta', 3], ['sodium', 3]],
  drown:   [['blood', 32], ['green', 18], ['sodium', 16], ['ember', 12], ['ice', 10], ['cyan', 7], ['amber', 5]],
};

const TOTALS = Object.fromEntries(Object.entries(MIX).map(([k, v]) => [k, v.reduce((s, e) => s + e[1], 0)]));

function pickLight(id, u) {
  const table = MIX[id] || MIX.spine;
  let a = u * TOTALS[id];
  for (const [key, w] of table) { a -= w; if (a <= 0) return LIGHTS[key]; }
  return LIGHTS[table[0][0]];
}

// LOD2's far towers have no descriptor and no zones — one unlit box with a speckle each — but
// there are ~460 of them and they are most of `fog_city`'s frame. This gives them the same
// between-building spread for the cost of two shifts of a hash `city.js` has already computed.
// 18 % come back near-black, which is what puts holes in the far skyline instead of an even wash.
export function farTint(id, hh) {
  const u = ((hh >>> 5) & 0x3ff) / 1023;
  const c = pickLight(id, u);
  if ((((hh >>> 17) & 0xff) / 255) < 0.18) {
    return ((((c >> 16) & 255) * 0.16) | 0) << 16 | ((((c >> 8) & 255) * 0.16) | 0) << 8 | (((c & 255) * 0.16) | 0);
  }
  return c;
}

const FLOOR = 3.6;                     // §3.4's window row pitch — zone boundaries land ON floors
export const PAINT_SALT = 0x7c11a5;    // dedicated; shares nothing with the chunk stream

// Twelve independent 0..1 values from three hashes of the same quantised position. Quantised to
// 1/8 m exactly as `hashRegion` quantises, so two builders reading the same descriptor agree.
function bits(x, z, out) {
  const xi = Math.round(x * 8), zi = Math.round(z * 8);
  for (let k = 0; k < 3; k++) {
    const h = hash2i(xi, zi, PAINT_SALT + k * 0x9e37);
    out[k * 4 + 0] = (h & 0xff) / 255;
    out[k * 4 + 1] = ((h >>> 8) & 0xff) / 255;
    out[k * 4 + 2] = ((h >>> 16) & 0xff) / 255;
    out[k * 4 + 3] = ((h >>> 24) & 0xff) / 255;
  }
  return out;
}

const _b = new Array(12);

// Writes six fields onto a building descriptor. `render_city.js` turns them into two colour
// attributes and one vec4 of zone heights; nothing else in the game reads them.
//
//   tint   lower zone colour        tint2  upper zone colour
//   split  world Y of the hard boundary between them, quantised to a floor
//   band0/band1  world Y of an unlit band (mechanical floors). band0 === band1 → no band
//   crown  world Y above which the building is unlit. >= h → no dark crown
//
// A building can therefore show up to FOUR reads up its face — lower colour, dark band, upper
// colour, dark crown — from seven floats and three lines of GLSL.
export function paint(b, district) {
  const u = bits(b.x, b.z, _b);
  const id = district.id;
  const h = b.h;

  // 11 % of buildings are unlit masses. The plates are full of them and they are what makes the
  // lit ones read as light rather than as texture. Not pure black — a derelict block still has a
  // few landings on, and a pure-black hole in a dark frame reads as a rendering fault.
  const dead = u[0] < 0.11;
  const dim = dead ? 0.055 + u[1] * 0.05 : 1.0;

  // Two independent draws from the district table, so ~60 % of buildings genuinely change colour
  // partway up and the rest are a single hue by chance rather than by rule.
  const cA = pickLight(id, u[2]);
  const cB = u[3] < 0.34 ? cA : pickLight(id, u[4]);

  // Brightness spread is much wider than the old ±14 %: an office tower at 2 a.m. and a lit hotel
  // are not the same value, and that difference is half of what "hierarchy" means.
  const jA = (0.40 + u[5] * 0.78) * dim;
  const jB = (0.40 + u[6] * 0.78) * dim;

  b.tint = cA; b.tint2 = cB;
  b.tintA = jA; b.tintB = jB;

  // The boundary sits between a quarter and three quarters of the way up, on a floor line.
  b.split = Math.round((h * (0.26 + u[7] * 0.48)) / FLOOR) * FLOOR;

  // 34 % carry a dark band of 2-6 floors — plant rooms, a refuge floor, a shell not fitted out.
  if (u[8] < 0.34) {
    const n = 2 + Math.floor(u[9] * 5);
    const y0 = Math.round((h * (0.15 + u[10] * 0.6)) / FLOOR) * FLOOR;
    b.band0 = y0; b.band1 = y0 + n * FLOOR;
  } else { b.band0 = 0; b.band1 = 0; }

  // 24 % go dark for their top 8-26 %. The unlit crown against fog is one of the strongest
  // silhouette reads in 746850_01 and we had none of it.
  b.crown = u[11] < 0.24 ? Math.round((h * (0.74 + u[0] * 0.18)) / FLOOR) * FLOOR : h + FLOOR;
  return b;
}
