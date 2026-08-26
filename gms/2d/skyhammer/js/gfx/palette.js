// Every colour and light value in SKYHAMMER, COMPOSED from biome x timeOfDay x weather (D20).
//
// PURE DATA + pure functions. No canvas, no DOM, no imports — loads under plain node.
// It describes the LIGHT, not the drawing, so it survived the Canvas-2D -> Three.js swap.
//
// 6 biomes + 4 times of day + 3 weathers = 72 combinations from 13 authored entries.
// `resolvePalette(biome, tod, weather)` returns the flat object the renderer consumes:
//
//   sky.stops      vertical gradient, t=0 top of the sky band, t=1 at the horizon line
//   sky.glow       the hot bloom sitting on the horizon (glowK 0..1)
//   sun            colour, intensity, elevation, azimuth, screen x of the disc
//   hemi           sky/ground bounce
//   fog            colour + k (strength). near/far are set by the renderer from camera depth.
//   earth          albedo / deep / warm rim / grass for the ground band
//   band.far/mid   distant mountain + hill tints, already hazed toward the fog colour
//   cloud          texture tint top+underside, overall opacity, cover 0..1
//   water          null, or deep/shallow/foam/glint + specular tightness
//   prop           material tints shared by every ground structure
//   fx             fire / accent / tracer chroma. The ONLY high-chroma things allowed.
//   post           exposure + bloom
//
// RULE (ART.md §4): background saturation stays under ~35%. Only fire, the green health bars
// and the player's rim light are high-chroma.
//
// ANGLE CONVENTIONS (side-on 2.5D):
//   sun.elevDeg  degrees above the horizon.
//   sun.azimDeg  0 = sun behind the CAMERA (front-lit), 180 = behind the SUBJECT (backlit).
//   sun.screenX  fraction of viewport width where the disc/glow is composited.

const P = (o) => Object.freeze(o);

// ---------------------------------------------------------------- pure colour helpers
export function hexRgb(h) {
  if (h[0] === '#') h = h.slice(1);
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}
export function mix(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return rgbHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
}
export function shade(h, k) {
  const c = hexRgb(h);
  return k >= 0 ? rgbHex(c[0] + (255 - c[0]) * k, c[1] + (255 - c[1]) * k, c[2] + (255 - c[2]) * k)
                : rgbHex(c[0] * (1 + k), c[1] * (1 + k), c[2] * (1 + k));
}
export function desat(h, k) {
  const c = hexRgb(h);
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return rgbHex(c[0] + (l - c[0]) * k, c[1] + (l - c[1]) * k, c[2] + (l - c[2]) * k);
}
export function lum(h) {
  const c = hexRgb(h);
  return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
}

// ---------------------------------------------------------------------------- BIOME (6)
// Ground, props and vegetation. Nothing here knows what time it is.
export const BIOME = {
  farmland: P({
    earth: P({ albedo: '#2b2016', deep: '#180f08', rim: '#7a5a38', grass: '#3c4029' }),
    band:  P({ far: '#6d7284', mid: '#4a4436', treeline: '#312c20' }),
    prop:  P({ body: '#5c5443', dark: '#332e26', roof: '#4a3a30', metal: '#6b6a63', glass: '#2a2f36', lit: '#c9a273' }),
    water: null, skyline: 'hills', veg: 'broadleaf', vegK: 1.0,
  }),
  coast: P({
    earth: P({ albedo: '#22303a', deep: '#101820', rim: '#5d7b84', grass: '#3a4a38' }),
    band:  P({ far: '#7e91a4', mid: '#3c4c50', treeline: '#28353a' }),
    prop:  P({ body: '#586067', dark: '#2a3138', roof: '#495158', metal: '#7c848a', glass: '#26313a', lit: '#bcd0d6' }),
    water: P({ deep: '#1f4c68', shallow: '#3f8aa8', foam: '#e8f2f4', glint: '#ffffff', specK: 0.55, specTight: 90 }),
    skyline: 'cliffs', veg: 'scrub', vegK: 0.5,
  }),
  sea: P({
    earth: P({ albedo: '#22303a', deep: '#0d151c', rim: '#5f7f88', grass: '#3a4a38' }),
    band:  P({ far: '#8497a8', mid: '#3f5157', treeline: '#2a373c' }),
    prop:  P({ body: '#5a636b', dark: '#2b3239', roof: '#4a535a', metal: '#828a90', glass: '#26313a', lit: '#c2d4da' }),
    water: P({ deep: '#1b435e', shallow: '#4380a0', foam: '#e9f4f6', glint: '#ffffff', specK: 0.7, specTight: 120 }),
    skyline: 'flat', veg: 'none', vegK: 0,
  }),
  city: P({
    earth: P({ albedo: '#1a1620', deep: '#0b0810', rim: '#7e4f36', grass: '#2a2830' }),
    band:  P({ far: '#4a4358', mid: '#2a2430', treeline: '#1d1a22' }),
    prop:  P({ body: '#413c46', dark: '#1e1b22', roof: '#332d38', metal: '#5c5766', glass: '#ffc46b', lit: '#c07a4e' }),
    water: null, skyline: 'city', veg: 'poplar', vegK: 0.35,
  }),
  alpine: P({
    earth: P({ albedo: '#2a2f33', deep: '#14181b', rim: '#77808a', grass: '#3f4a46', snow: '#eef2f4' }),
    band:  P({ far: '#9aa5ae', mid: '#4d565c', treeline: '#2d3538' }),
    prop:  P({ body: '#565e64', dark: '#2b3136', roof: '#454d53', metal: '#7d858c', glass: '#2b3339', lit: '#c3ccd2' }),
    water: null, skyline: 'peaks', veg: 'conifer', vegK: 0.9,
  }),
  desert: P({
    earth: P({ albedo: '#4a3421', deep: '#2a1c0c', rim: '#b08a52', grass: '#6a6640' }),
    band:  P({ far: '#a09274', mid: '#6a563a', treeline: '#4f3f28' }),
    prop:  P({ body: '#7a6a4e', dark: '#3d3421', roof: '#6a5738', metal: '#8d8570', glass: '#33301f', lit: '#e0bd80' }),
    water: null, skyline: 'mesa', veg: 'palm', vegK: 0.25,
  }),
};

// ------------------------------------------------------------------------------ TOD (4)
// Light and sky only. Nothing here knows where it is.
export const TOD = {
  dawn: P({
    sky: P({
      stops: P([[0.00, '#42648c'], [0.22, '#5b7fa6'], [0.46, '#8a7d9f'], [0.62, '#b58fa0'],
                [0.78, '#e0a186'], [0.90, '#f0b183'], [1.00, '#ffd9a0']]),
      glow: '#ffcf8e', glowK: 0.85, glowSpreadDeg: 26, zenith: '#2a4468',
    }),
    sun:  P({ col: '#ffe6b8', intensity: 1.35, elevDeg: 5, azimDeg: 152, screenX: 0.70, discK: 0.55 }),
    hemi: P({ sky: '#a9b6cf', ground: '#5a4634', intensity: 0.55 }),
    fx:   P({ fire: '#ffd27a', accent: '#ffd27a', tracer: '#ffe1a0' }),
    post: P({ exposure: 1.00, bloomK: 0.38, bloomThreshold: 0.82 }),
    star: 0, warm: 1.0,
  }),
  day: P({
    sky: P({
      stops: P([[0.00, '#2f6fb0'], [0.30, '#4d86bd'], [0.60, '#8fb6d6'], [0.85, '#c3d7e2'], [1.00, '#dde7e4']]),
      glow: '#f0e5cf', glowK: 0.35, glowSpreadDeg: 18, zenith: '#1f5a99',
    }),
    sun:  P({ col: '#fff6e0', intensity: 1.45, elevDeg: 40, azimDeg: 66, screenX: 0.78, discK: 0.30 }),
    hemi: P({ sky: '#bcd3e2', ground: '#4e4c34', intensity: 0.70 }),
    fx:   P({ fire: '#ffc85e', accent: '#ffd27a', tracer: '#ffeec0' }),
    post: P({ exposure: 1.00, bloomK: 0.28, bloomThreshold: 0.86 }),
    star: 0, warm: 0.35,
  }),
  dusk: P({
    sky: P({
      stops: P([[0.00, '#23304f'], [0.26, '#3c4468'], [0.52, '#6d4a6b'], [0.72, '#a85f5c'],
                [0.88, '#d1734f'], [1.00, '#ffcf9a']]),
      glow: '#ffb478', glowK: 0.92, glowSpreadDeg: 30, zenith: '#151d33',
    }),
    sun:  P({ col: '#ffd7a0', intensity: 1.15, elevDeg: 3, azimDeg: 162, screenX: 0.62, discK: 0.60 }),
    hemi: P({ sky: '#6a5a72', ground: '#3a2c30', intensity: 0.45 }),
    fx:   P({ fire: '#ffd27a', accent: '#ffb478', tracer: '#ffdca8' }),
    post: P({ exposure: 0.98, bloomK: 0.46, bloomThreshold: 0.76 }),
    star: 0.18, warm: 1.0,
  }),
  night: P({
    sky: P({
      stops: P([[0.00, '#070c1c'], [0.30, '#111a33'], [0.60, '#22203c'], [0.82, '#38293a'], [1.00, '#57383c']]),
      glow: '#a05c48', glowK: 0.70, glowSpreadDeg: 34, zenith: '#050912',
    }),
    sun:  P({ col: '#8c9ec0', intensity: 0.40, elevDeg: 26, azimDeg: 140, screenX: 0.50, discK: 0.20 }),
    hemi: P({ sky: '#2a2a44', ground: '#1a1218', intensity: 0.32 }),
    fx:   P({ fire: '#ffd27a', accent: '#ffc46b', tracer: '#ffdca0' }),
    post: P({ exposure: 0.94, bloomK: 0.70, bloomThreshold: 0.58 }),
    star: 1, warm: 0.6,
  }),
};

// -------------------------------------------------------------------------- WEATHER (3)
// A modifier, never its own palette.
export const WEATHER = {
  clear:    P({ fogK: 1.00, cloudCover: 0.55, cloudAlpha: 1.00, lightK: 1.00, hemiK: 1.00, desat: 0.00, skyFlat: 0.00, precip: 0 }),
  overcast: P({ fogK: 1.55, cloudCover: 1.00, cloudAlpha: 1.15, lightK: 0.48, hemiK: 1.55, desat: 0.34, skyFlat: 0.45, precip: 0 }),
  storm:    P({ fogK: 2.30, cloudCover: 1.00, cloudAlpha: 1.25, lightK: 0.30, hemiK: 1.35, desat: 0.52, skyFlat: 0.68, precip: 1 }),
};

export const BIOME_KEYS = Object.freeze(Object.keys(BIOME));
export const TOD_KEYS = Object.freeze(Object.keys(TOD));
export const WEATHER_KEYS = Object.freeze(Object.keys(WEATHER));

const cache = new Map();

export function paletteKey(biome = 'farmland', tod = 'dawn', weather = 'clear') {
  const b = BIOME[biome] ? biome : 'farmland';
  const t = TOD[tod] ? tod : 'day';
  const w = WEATHER[weather] ? weather : 'clear';
  return `${b}/${t}/${w}`;
}

/** The one door. Returns a frozen flat palette; results are cached per key. */
export function resolvePalette(biome, tod, weather) {
  const key = paletteKey(biome, tod, weather);
  const hit = cache.get(key);
  if (hit) return hit;

  const [bk, tk, wk] = key.split('/');
  const B = BIOME[bk], T = TOD[tk], W = WEATHER[wk];

  // Sky: overcast/storm flatten the gradient toward a grey keyed off the middle stop.
  const midCol = T.sky.stops[Math.floor(T.sky.stops.length / 2)][1];
  const flatCol = desat(shade(midCol, wk === 'storm' ? -0.30 : -0.12), 0.75);
  const stops = T.sky.stops.map(([t, c]) => [t, mix(desat(c, W.desat * 0.7), flatCol, W.skyFlat * (0.35 + t * 0.35))]);
  const horizonCol = stops[stops.length - 1][1];

  // Fog colour is DERIVED from the horizon so haze can never disagree with the sky behind it.
  const fogCol = mix(horizonCol, T.sky.glow, T.sky.glowK * 0.30 * (1 - W.skyFlat));
  const hazeK = 0.55 * W.fogK;

  // Aerial perspective pulls distant land toward the SKY BEHIND IT, not toward the sun glow.
  // Mixing toward the glow is what made the old dusk mountains read as orange sand dunes.
  const skyMid = stops[Math.max(1, Math.floor(stops.length * 0.42))][1];
  const distTint = desat(mix(fogCol, skyMid, 0.80), 0.50);
  const hazeTo = (c, k, cool = 1) => mix(desat(c, W.desat + 0.12 * cool), mix(fogCol, distTint, cool), k);

  const pal = P({
    key, biome: bk, tod: tk, weather: wk,
    sky: P({
      stops: P(stops.map(P)),
      glow: mix(T.sky.glow, fogCol, W.skyFlat * 0.6),
      glowK: T.sky.glowK * (1 - W.skyFlat * 0.55),
      glowSpreadDeg: T.sky.glowSpreadDeg * (1 + W.skyFlat),
      zenith: mix(desat(T.sky.zenith, W.desat * 0.7), flatCol, W.skyFlat * 0.55),
      horizon: horizonCol,
    }),
    sun: P({ ...T.sun, intensity: T.sun.intensity * W.lightK,
      // no disc under a flat sky or a weak sun (ART_NOTES §5: overcast must show none at all)
      discK: T.sun.intensity * W.lightK < 0.7 ? 0 : T.sun.discK * Math.max(0, 1 - W.skyFlat * 2.2) }),
    hemi: P({
      sky: mix(T.hemi.sky, fogCol, W.skyFlat * 0.5),
      ground: mix(T.hemi.ground, B.earth.albedo, 0.35),
      intensity: T.hemi.intensity * W.hemiK,
    }),
    fog: P({ col: fogCol, k: hazeK, exp: 0.000085 * W.fogK }),
    earth: P({
      albedo: desat(B.earth.albedo, W.desat * 0.5),
      deep: B.earth.deep,
      rim: mix(desat(B.earth.rim, W.desat * 0.6), T.sun.col, T.warm * 0.22 * W.lightK),
      grass: desat(B.earth.grass, W.desat * 0.5),
      snow: B.earth.snow || null,
    }),
    band: P({
      far: hazeTo(B.band.far, Math.min(0.70, 0.52 * W.fogK), 1.0),
      mid: hazeTo(B.band.mid, Math.min(0.42, 0.20 * W.fogK), 0.7),
      treeline: hazeTo(B.band.treeline, Math.min(0.34, 0.15 * W.fogK), 0.5),
      haze: fogCol,
      // distant land hazes toward the SKY behind it, which is cooler than the sun glow
      hazeFar: distTint,
    }),
    cloud: P({
      top: mix('#ffffff', mix(T.sky.glow, stops[1][1], 0.35), 0.42 + W.skyFlat * 0.2),
      bot: mix(desat(stops[Math.max(0, stops.length - 3)][1], 0.2), fogCol, 0.25),
      alpha: Math.min(1, 0.80 * W.cloudAlpha),
      cover: W.cloudCover,
    }),
    water: B.water ? P({ ...B.water,
      deep: mix(B.water.deep, fogCol, 0.10 * W.fogK),
      shallow: mix(B.water.shallow, fogCol, 0.16 * W.fogK),
      glint: mix(B.water.glint, T.sun.col, 0.6),
      specK: B.water.specK * W.lightK }) : null,
    prop: P({
      body: desat(B.prop.body, W.desat * 0.5), dark: B.prop.dark,
      roof: desat(B.prop.roof, W.desat * 0.5), metal: desat(B.prop.metal, W.desat * 0.4),
      glass: B.prop.glass, lit: mix(B.prop.lit, T.sun.col, T.warm * 0.25),
    }),
    fx: T.fx,
    post: P({ ...T.post, bloomK: T.post.bloomK * (1 - W.desat * 0.35) }),
    star: T.star * (1 - W.cloudCover * 0.8),
    veg: B.veg, vegK: B.vegK, skyline: B.skyline, precip: W.precip,
  });

  cache.set(key, pal);
  return pal;
}

/** Back-compat shim: the renderer and the lab both call this. */
export function getPalette(biome, tod, weather = 'clear') { return resolvePalette(biome, tod, weather); }

/** Every key the lab cycles through. 72 combinations, listed lazily. */
export function allKeys() {
  const out = [];
  for (const b of BIOME_KEYS) for (const t of TOD_KEYS) for (const w of WEATHER_KEYS) out.push(`${b}/${t}/${w}`);
  return out;
}

// ---------------------------------------------------------------------------------------
// Player liveries. `dark` core + `rim` warm edge is ART.md §2's readability law as material
// values: the aeroplane is always darker than the sky AND carries a high-value warm edge, so it
// separates against a bright sky and a dark ground alike.
export const LIVERY = Object.freeze({
  olive:         P({ body: '#3f4530', dark: '#1e2116', trim: '#8a7a45', rim: '#ffd9a0', canopy: '#9fd3e0' }),
  grey:          P({ body: '#454b52', dark: '#1f2328', trim: '#8b8f95', rim: '#ffe0ad', canopy: '#a7d7e4' }),
  navy:          P({ body: '#2c3a4c', dark: '#151d27', trim: '#7d94a8', rim: '#ffdda2', canopy: '#a9dbe8' }),
  'raf-grey':    P({ body: '#4c565e', dark: '#212a31', trim: '#93a0a8', rim: '#ffe6bb', canopy: '#a3d6e6' }),
  silver:        P({ body: '#727d86', dark: '#333a41', trim: '#c3cbd2', rim: '#fff0c8', canopy: '#9fd8ea' }),
  slate:         P({ body: '#3c464e', dark: '#1a2026', trim: '#7d8a93', rim: '#ffe2ae', canopy: '#a0d4e6' }),
  charcoal:      P({ body: '#33363b', dark: '#16181b', trim: '#787d85', rim: '#ffe4b0', canopy: '#9ad3e6' }),
  'matte-black': P({ body: '#232629', dark: '#0f1113', trim: '#5c6167', rim: '#ffdca4', canopy: '#7fc0d6' }),
  white:         P({ body: '#a8b0b6', dark: '#4a5057', trim: '#e6ecef', rim: '#fff4d8', canopy: '#a5e0f0' }),
  // enemies are deliberately LOWER contrast than any player livery — the player wins the frame.
  enemy:  P({ body: '#4a3a30', dark: '#241c17', trim: '#8a6a4a', rim: '#e0a878', canopy: '#8fb6bd' }),
  enemy2: P({ body: '#3a4038', dark: '#1b1f1a', trim: '#77806f', rim: '#dcae7c', canopy: '#8fb6bd' }),
  enemy3: P({ body: '#3b3540', dark: '#1a171e', trim: '#6f6a7c', rim: '#d8a0c0', canopy: '#8fb6bd' }),
});
export function livery(id) { return LIVERY[id] || LIVERY.enemy; }

// The only saturated greens in the game.
export const HP_GREEN = '#5ee06a';
export const HP_GREEN_LOW = '#e0a83a';
export const HP_BACK = 'rgba(10,12,10,0.55)';

// Collectibles keep fixed colours across every biome so they always read as "pick me up".
export const PICKUP = Object.freeze({
  balloon: '#d0644e', balloonStripe: '#e8d9b0', basket: '#4a3a28', money: '#ffd257',
});

/** Cheap structural check. Throws with the offending key so a bad edit fails loudly. */
export function validatePalettes() {
  const need = ['sky', 'sun', 'hemi', 'fog', 'earth', 'band', 'cloud', 'prop', 'fx', 'post'];
  for (const b of BIOME_KEYS) for (const t of TOD_KEYS) for (const w of WEATHER_KEYS) {
    const p = resolvePalette(b, t, w);
    for (const f of need) if (!p[f]) throw new Error(`palette ${p.key} missing ${f}`);
    if (!Array.isArray(p.sky.stops) || p.sky.stops.length < 3) throw new Error(`palette ${p.key} bad sky.stops`);
    if (!('water' in p)) throw new Error(`palette ${p.key} must declare water`);
  }
  return cache.size;
}
