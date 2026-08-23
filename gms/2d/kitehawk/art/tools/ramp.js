// ramp.js — builds the 256x1 LUTs from the palette table below.
//
// TWO families, because the renderer has two ramp consumers and they are indexed by
// different quantities (P1_NOTES §2, changes 6 and 8):
//
//   sky   indexed by ALTITUDE. Fed to R.skyRamp(y0, y1, tex) as the sky column itself.
//   tone  indexed by LUMINANCE. Bound with R.setRamp(tex) and applied per layer through
//         rampAmt, so one shared painted cloud/prop serves five acts (ART.md §4).
//
// D49: both are authored as ORDINARY sRGB strips. The shader squares them into linear
// because every other texture here is display-space; author them linear and every ramped
// layer sits visibly brighter than an unramped one.
//
// R-03: the LUT is keyed on (act, sky-state), not on act. Each act has a base palette and
// each sky state it actually uses is lerped from it toward that state's reference. Which
// states each act uses is DESIGN.md §8.4-8.8's `sky` column, counted from the 100 rows:
//   1 {d,k}  2 {o,k,d}  3 {d,o,k}  4 {n,s,k}  5 {h,d,o,k,s}
//
// R-03 also strikes ART.md §3's alt divisor: alt = altitude_m / 1500 (D28), and the seven
// ramp stops are re-placed on R-02's band boundaries so the sky's inflections land exactly
// where the ladder changes. That is what makes a band read as a place rather than as a
// number on a tape.
//
//   node ramp.js [outdir]        writes ramps.png + ramps.json
//   node ramp.js --measure       gate A5: pairwise hue separation of the five act tone LUTs
const path = require('path');
const { Img, writePNG, readPNG } = require('./img.js');

const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// R-02's band boundaries, in metres, over D28's 1500 m playable ceiling.
const STOPS = [0, 105, 255, 450, 750, 1125, 1500].map(m => m / 1500);

/* ------------------------------------------------------------------ palettes */
// key/fill/shadow/accent/haze + hazeBase + sat, and the seven-stop sky ramp.
// Acts 1 and 2 carry over from ART.md §6 (act 2's key cooled toward morning, per R-03).
// Acts 3, 4 and 5 are re-authored per R-03 and the changes are listed in P3_NOTES §4.
const ACT = {
  1: { // spring midday, flat, mud. cool-key / cool-shadow (dead). ART.md Act I, unchanged.
    key: '#C9CEC4', fill: '#7E8A8C', shadow: '#2E3639', accent: '#C2582A', haze: '#9EA9A6',
    hazeBase: 0.92, sat: 0.66, gamma: 1.00,
    sky: ['#4E4A40', '#6E6E62', '#8C9086', '#A6AAA0', '#C0C4BA', '#6E92B0', '#3E6C96'],
  },
  2: { // summer morning over a flat grey deck. warm-key / violet-shadow.
    // R-03: "key cooled toward morning". ART.md's #FFE1A8 is a late-afternoon gold; morning
    // is paler and greener, so the key moves to a lemon cream and the fill follows it. The
    // violet shadow is untouched — it is the relationship the act is chosen for.
    // The key also has to clear gate A5, and that turned out to be the binding constraint:
    // R-03 gives THREE of five acts a warm key (2 morning, 3 raking, 5 dusk) and the warm
    // half of the hue circle is only about 60 degrees wide, so the three must sit at roughly
    // 5 / 33 / 58 degrees or no pair can be 25 apart. Act 2 takes the top of that range, and
    // a lemon-straw key against a violet shadow is the textbook complement pair anyway --
    // arguably more so than ART.md's orange-cream. Measured in P3_NOTES §4.
    // D65: the cream, not the green. Clearing gate A5 as written forced act 2 into a lemon
    // key and a green cloud that nobody believed in; the manager looked and ruled that a
    // criterion which forces a colour nobody thinks is right is a broken criterion. A5 is
    // re-specified in §4.4 to measure the key/shadow RELATIONSHIP, which is what ART.md §6's
    // systematic rule actually states, and this palette is R-03's "cooled toward morning"
    // read straight.
    key: '#FFE9C0', fill: '#DCBE84', shadow: '#4A3B57', accent: '#3E6B8C', haze: '#E8D6B4',
    hazeBase: 0.85, sat: 1.00,
    // The SKY ramp stays ART.md §6 Act II's gold. R-03 cools the KEY toward morning, not
    // the sky column, and a lemon-on-lemon frame measured as one pale wash with nothing
    // to separate cloud from air.
    // ART.md §6 Act II's stops, with the blue brought DOWN the column so it arrives at the
    // Deck rather than above it. A cream sky behind a cream cloud separates by nothing, and
    // the Deck is where the fighting is (R-02's -3000..-5000). Warm below, cool above, with
    // the turn at the altitude the player lives at, is also what a summer morning does.
    // Darkened ~15% against ART.md's own values, because the composite reads brighter than
    // the LUT: probed at alt 0.36 the LUT texel is 164,164,154 and the framebuffer is
    // 191,190,177. Authoring to the number on the swatch rather than to the number on the
    // screen is how a sky ends up as white paper.
    sky: ['#7A6446', '#9A8058', '#B0965E', '#A08C74', '#6A88A4', '#44729E', '#264E80'],
  },
  3: { // mountains, autumn, late-afternoon raking. warm-key / black-shadow, COLD accent.
    // Re-authored per R-03: the structure is ART.md Act III's (one accent, near-black
    // shadow) with the hue inverted from moonlight to a low raking sun.
    // Desaturated: at #FFC24E the key measured chroma 0.69 and the clouds came out as flat
    // cartoon yellow with brown rims -- "sticker/emoji-sun rather than painted cloud". A
    // raking autumn sun is warm, not fluorescent.
    key: '#E8B478', fill: '#9E6242', shadow: '#16171B', accent: '#2E8C86', haze: '#7E6650',
    hazeBase: 0.80, sat: 1.05, gamma: 1.04,
    // Same correction as act 2 and for the same measured reason: gold clouds against a gold
    // sky is one flat field. A low raking sun makes the air cool away from it and the clouds
    // hot, which is the whole look of an autumn late afternoon.
    sky: ['#3A2418', '#6E4024', '#9E6238', '#7E7268', '#5A7686', '#3A6084', '#1E3A5C'],
  },
  4: { // winter night, storms, four hard sources and no ambient.
    // ART.md §6 Act III "Night Raid", re-indexed to act 4 per R-03. Hexes unchanged.
    key: '#B9CBE6', fill: '#2C3A55', shadow: '#0A0E18', accent: '#FF8A2B', haze: '#1A2436',
    hazeBase: 0.70, sat: 0.80, gamma: 1.55,
    sky: ['#080B12', '#0E1420', '#162032', '#1E2B42', '#2A3A57', '#38506F', '#4A6688'],
  },
  5: { // late summer high sun, dusk finale. hot-key / black-red-shadow.
    // ART.md §6 Act V, with the key pushed from orange toward red so it does not collide
    // with act 3's raking gold on gate A5 (measured; see P3_NOTES §4).
    // Chroma pulled back: measured at 0.378 against the reference plates' 0.141, which is
    // what "a wall of orange" was. Still the hottest key in the game, and still the only
    // black-red shadow.
    key: '#EE6A४A'.replace('४','4'), fill: '#8E3A32', shadow: '#241419', accent: '#F5E2B0', haze: '#6E4038',
    hazeBase: 1.00, sat: 0.78, gamma: 1.14,
    // Desaturated against ART.md §6's. Measured, the act-5 frame's sky chroma was 0.533
    // against the reference plates' 0.20 -- "a single flat orange fill" in a critic's words.
    // ART.md's own note that this ramp is non-monotonic in warmth is kept and strengthened:
    // hot through the middle, cold grey at the very top where the smoke thins out.
    // Wider stop-to-stop contrast. One 1,000 wu frame shows only about a tenth of a
    // 10,000 wu column, so a ramp whose adjacent stops are close reads as a single flat
    // field however dramatic the ends are -- which is what "a wall of orange" was. The Deck
    // and Lane legs now carry the act's whole swing.
    sky: ['#1A0C0E', '#43181A', '#7C3226', '#C06A34', '#8E5E58', '#4E4A62', '#2A2A44'],
  },
};

// Sky-state references. A state's LUT is lerp(actBase, stateRef, w).
// `s` is ART.md §6 Act IV "The White Front", re-purposed by R-03 as a sky-state rather than
// an act — which finds the alpine palette a home in the blizzard levels DESIGN actually
// schedules (L71, L79) instead of inventing a sixth act for it.
const STATE = {
  d: { w: 0.00, name: 'day' },
  o: {
    w: 0.55, name: 'overcast', hazeBase: 1.15, sat: 0.80, gamma: 1.04,
    key: '#D8DCD6', fill: '#95A0A2', shadow: '#3A4348', accent: '#C2582A', haze: '#AAB4B2',
    sky: ['#7E8078', '#94978E', '#A8ACA4', '#B8BCB4', '#C6CAC2', '#93AEC0', '#5E86A6'],
  },
  k: {
    w: 0.62, name: 'dusk', hazeBase: 1.00, sat: 1.00, gamma: 1.18,
    key: '#FFB070', fill: '#B05A4E', shadow: '#241826', accent: '#8FB8D8', haze: '#8A5448',
    sky: ['#1C1016', '#3E1E24', '#6E3230', '#A45440', '#C9784E', '#78607A', '#2E3050'],
  },
  n: {
    w: 0.78, name: 'night', hazeBase: 0.70, sat: 0.80, gamma: 1.55,
    key: '#B9CBE6', fill: '#2C3A55', shadow: '#080B12', accent: '#FF8A2B', haze: '#141C2C',
    sky: ['#06080E', '#0C1119', '#131B29', '#1A2438', '#25314A', '#324662', '#42597A'],
  },
  s: {
    // white-key / blue-shadow — the only cold key in the game.
    w: 0.72, name: 'storm', hazeBase: 1.25, sat: 0.62, gamma: 0.94,
    key: '#FFFFFF', fill: '#C7D9E8', shadow: '#5A76A0', accent: '#E8452F', haze: '#DCE9F2',
    sky: ['#D3DEE6', '#C8D8E6', '#A9C4DC', '#8AB0D4', '#6A98CC', '#3F73B8', '#12386F'],
  },
  h: {
    w: 0.60, name: 'highsun', hazeBase: 0.45, sat: 1.10, gamma: 0.95,
    key: '#FFFDF0', fill: '#E8C87E', shadow: '#3A3A5C', accent: '#3E6B8C', haze: '#CFE0EC',
    sky: ['#B8A886', '#CFC49E', '#DCD8B8', '#C8D6C8', '#9EC0D8', '#5A90C8', '#12386F'],
  },
};

// Which sky states each act actually uses, counted from DESIGN.md §8.4-8.8's `sky` column.
const USES = { 1: ['d', 'k'], 2: ['o', 'k', 'd'], 3: ['d', 'o', 'k'], 4: ['n', 's', 'k'], 5: ['h', 'd', 'o', 'k', 's'] };

/* ------------------------------------------------------------------ building */
const LUM = c => (c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722) / 255;
const SKY_EXPOSURE = 0.86;
const SKY_CHROMA = 1.55;
const SKY_CHROMA_MAX = 0.26;
const lerp = (a, b, t) => a + (b - a) * t;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Piecewise-linear over 256 samples of an arbitrary stop set. */
function strip(stops, positions) {
  const out = [];
  for (let i = 0; i < 256; i++) {
    const u = i / 255;
    let k = 0;
    while (k < positions.length - 2 && u > positions[k + 1]) k++;
    const span = positions[k + 1] - positions[k] || 1;
    out.push(mix3(stops[k], stops[k + 1], Math.min(1, Math.max(0, (u - positions[k]) / span))));
  }
  return out;
}

/**
 * The tone LUT: shadow -> fill -> key across luminance.
 *
 * **The LUT takes its HUE from the palette and its VALUE from the input**, and getting this
 * wrong is the single worst-looking bug of the phase. The obvious construction -- lay the
 * three palette colours at fixed positions and interpolate -- destroys the value structure
 * the plates exist to carry, because the palette's own luminances are not spread over
 * 0..1. Act 2's are shadow 0.27, fill 0.81, key 0.93 at stops 0.00 / 0.36 / 0.86, so a
 * cloud pixel at L 0.36 comes out at 0.81 and the entire frame is crushed into the top
 * third of the range. The screenshot of that is a flat cream field with pale green blobs on
 * it, from a source plate that had rich cream-and-violet modelling in it.
 *
 * So: interpolate the palette for colour, then rescale each output so its luminance follows
 * `L^gamma`. The hue relationship the act is chosen for survives, the plate's modelling
 * survives, and `gamma` is the one knob that makes an act darker overall -- act 4's night
 * is a night because its gamma crushes, not because its palette is muddy.
 */
function toneOf(p) {
  const raw = strip(
    [hex(p.shadow), mix3(hex(p.shadow), hex(p.fill), 0.5), hex(p.fill),
      mix3(hex(p.fill), hex(p.key), 0.6), hex(p.key), mix3(hex(p.key), [255, 255, 255], 0.35)],
    [0.00, 0.14, 0.36, 0.62, 0.86, 1.00]);
  // **The exponent is HALVED, and getting this wrong crushed every cloud in the game.**
  //
  // The ramp is not indexed by display luminance and its output is not read as display.
  // sprite.js does: lin = c.rgb*c.rgb (display -> linear), then indexes the LUT by the
  // LUMINANCE OF THAT LINEAR VALUE, then mixes in `rc * rc` -- squaring the LUT texel too --
  // and the composite finally sqrts back. So for a display input d the index is d^2 and the
  // final display output is the LUT texel's own display luminance.
  //
  // Writing `target = L^gamma` therefore produced final display = d^(2*gamma): an effective
  // 1.88 on the day acts and 3.90 on act 4. Measured, clouds drawn alone came out at a
  // MEDIAN LUMINANCE OF 0.113 against the reference plate's 0.637 -- five times too dark,
  // which is what "crushed to hard black cores" was.
  //
  // `L^(gamma/2)` makes gamma mean what it says: 1.0 is identity end to end.
  // **The ramp bottoms out on the act's SHADOW COLOUR, not on black**, and forgetting that
  // was the other half of the crushed cores. `pow(L, g/2)` is 0 at L = 0, so however warm
  // the shadow hex was, the darkest entry of every LUT came out pure black and the darkest
  // tenth of every cloud went with it. Measured against the reference plate: our cloud p2
  // was 0.171 and p10 0.210, where p03_cloud_deck sits at 0.419 and 0.504.
  //
  // ART.md §4 says it plainly -- "the shadow faces land on the act's shadow colour" -- so
  // the output luminance runs from LUM(shadow) to LUM(key highlight) and the curve only
  // shapes what happens BETWEEN them. Act 4's shadow is #0A0E18, so night is still night;
  // act 2's is a violet at 0.27, so its cloud undersides hold colour instead of going to a
  // hole.
  const g = p.gamma ?? 1.0;
  const loL = LUM(hex(p.shadow));
  const hiL = LUM(mix3(hex(p.key), [255, 255, 255], 0.35));
  return raw.map((c, i) => {
    const L = i / 255;
    const target = loL + (hiL - loL) * Math.pow(L, 0.5 * g);
    const have = LUM(c);
    const k = target / Math.max(0.004, have);
    // clamp the gain so a saturated palette colour cannot blow a channel and shift the hue
    const kk = Math.min(k, 254 / Math.max(1, Math.max(c[0], c[1], c[2])));
    return [c[0] * kk, c[1] * kk, c[2] * kk];
  });
}

/**
 * The sky ramp, with local structure phase-locked to the band edges.
 *
 * The arithmetic that forces this: one portrait frame is 1,000 wu of a 10,000 wu column, so
 * a monotone ramp shows at most a TENTH of its total swing in any one frame however dramatic
 * its ends are. Measured, our frames carried a top-to-bottom luminance difference of
 * 0.058-0.103 against the reference plates' 0.094-0.171, and act 5 read to a critic as "a
 * single flat orange fill, zero vertical gradient". No amount of re-picking the seven stops
 * fixes that; the shape is wrong, not the colours.
 *
 * So the authored stops stay as the centre line -- the journey up the column is unchanged --
 * and a gentle luminance modulation is laid over them, one cycle per band, brightest at the
 * band edges. That doubles the local slope, and because the phase is locked to R-02's band
 * boundaries it also reinforces the ladder rather than fighting it: the edge you cross is
 * the brightest part of the sky either side of it.
 */
const skyOf = (p) => {
  const base = strip(p.sky.map(hex), STOPS);
  // Sized on the median in-frame swing (the references sit at 0.094-0.171) -- but NOT on that
  // alone, which is the mistake 0.70 was. The modulation is zero-mean over a full cycle, so
  // the ACT's palette survives a climb; within a single frame, though, it shifts the absolute
  // level by +/- amp/2, and at 0.70 a frame sitting on a peak came out 35% brighter than the
  // hex the act was authored to. Act 3 rendered as a pale beige field with cartoon yellow
  // clouds on it and a critic called it a placeholder canvas. 0.35 keeps the median swing at
  // 0.094-0.127, inside the reference band, and holds the palette.
  const amp = p.skyAmp ?? 0.35;
  // The period must be LONGER THAN ONE FRAME, and locking it to the bands was wrong for a
  // reason the measurement made obvious: the Belt band is exactly 1,000 wu and a portrait
  // frame is exactly 1,000 wu, so a full cycle fitted inside the frame and cancelled to
  // nothing. The worst-case in-frame swing stayed at 0.001-0.006 from amp 0.16 to 0.90, with
  // a cosine and with a triangle alike -- the amplitude was never the problem, the period
  // was. At 4,500 wu a frame sees at most 22% of a cycle, so there is always a real slope
  // and never a cancellation, and the period is long enough not to read as stripes.
  const PERIOD = 4500 / 10000;
  return base.map((c, i) => {
    const alt = i / 255;
    const t = (alt / PERIOD) % 1;
    const tri = 1 - 4 * Math.abs(((t + 0.75) % 1) - 0.5);      // -1..1, constant slope
    const m = 1 + amp * tri * 0.5;
    // Two global corrections, both measured rather than dialled by eye.
    //
    // EXPOSURE: the composite reads brighter than the LUT. Probed on act 3, the LUT texel at
    // alt 0.32 is [180,164,153] and the framebuffer is [199,186,172] -- a consistent +11%
    // from the ACES round trip. Authoring to the swatch instead of to the screen is how
    // every act ended up as a pale wash, and 0.86 puts the rendered sky back on the value
    // the palette was written for.
    //
    // CHROMA: the rendered sky measured 0.051-0.082 against the reference plates' 0.141-0.204.
    // A gouache sky is a coloured thing; ours were grey with a hint. The lift is applied
    // around each entry's own luminance so it changes saturation without moving value.
    const L = LUM(c);
    const g = L > 1e-4 ? Math.max(0.05, Math.min(1.9, m)) * SKY_EXPOSURE : SKY_EXPOSURE;
    // ...and a ceiling on the result, because a flat multiplier on an already-hot ramp is
    // how act 5 went to chroma 0.545 against the references' 0.141-0.204. The boost lifts a
    // grey sky and leaves a saturated one alone.
    const lit = L * 255 * g;
    const raw = c.map(v => lit + (v * g - lit) * SKY_CHROMA);
    const ch = (Math.max(...raw) - Math.min(...raw)) / 255;
    const k2 = ch > SKY_CHROMA_MAX ? SKY_CHROMA_MAX / ch : 1;
    return raw.map(v => Math.max(0, Math.min(255, lit + (v - lit) * k2)));
  });
};

function resolve(act, st) {
  const base = ACT[act], s = STATE[st];
  if (!s || s.w === 0) return { ...base, state: st };
  const w = s.w;
  const m = (a, b) => '#' + mix3(hex(a), hex(b), w).map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  return {
    key: m(base.key, s.key), fill: m(base.fill, s.fill), shadow: m(base.shadow, s.shadow),
    accent: m(base.accent, s.accent), haze: m(base.haze, s.haze),
    hazeBase: +lerp(base.hazeBase, s.hazeBase, w).toFixed(3),
    sat: +lerp(base.sat, s.sat, w).toFixed(3),
    gamma: +lerp(base.gamma ?? 1, s.gamma ?? (base.gamma ?? 1), w).toFixed(3),
    sky: base.sky.map((c, i) => m(c, s.sky[i])),
    state: st,
  };
}

function build() {
  const rows = [], index = {};
  for (const act of [1, 2, 3, 4, 5])
    for (const st of USES[act]) {
      const p = resolve(act, st);
      index[`${act}${st}`] = {
        act, sky: st, name: STATE[st].name,
        skyRow: rows.length, toneRow: rows.length + 1,
        key: p.key, fill: p.fill, shadow: p.shadow, accent: p.accent, haze: p.haze,
        hazeBase: p.hazeBase, sat: p.sat, gamma: p.gamma ?? 1,
      };
      rows.push(skyOf(p), toneOf(p));
    }
  const img = new Img(256, rows.length);
  rows.forEach((r, y) => r.forEach((c, x) => {
    const i = (y * 256 + x) * 4;
    img.data[i] = Math.round(c[0]); img.data[i + 1] = Math.round(c[1]);
    img.data[i + 2] = Math.round(c[2]); img.data[i + 3] = 255;
  }));
  return { img, index, rows: rows.length };
}

/* ------------------------------------------------ gate A5, measured not asserted */
function hueOf(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return { h: 0, c: 0 };
  let h;
  if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
  return { h: ((h * 60) % 360 + 360) % 360, c: d / 255 };
}

/**
 * Map a real plate through each act's day-or-nearest tone LUT and take the CHROMA-WEIGHTED
 * circular mean hue. Chroma weighting is the point: an unweighted mean over a near-neutral
 * plate returns a hue angle that is numerically confident and physically meaningless — a
 * believable wrong metric. Weighting by chroma makes the number describe the colour the eye
 * actually reads.
 */
function meanHue(plate, lut) {
  let sx = 0, sy = 0, w = 0;
  for (let i = 0; i < plate.w * plate.h; i++) {
    const a = plate.data[i * 4 + 3] / 255;
    if (a < 0.5) continue;
    const L = (plate.data[i * 4] * 0.2126 + plate.data[i * 4 + 1] * 0.7152 + plate.data[i * 4 + 2] * 0.0722) / 255;
    const c = lut[Math.max(0, Math.min(255, Math.round(L * 255)))];
    const { h, c: ch } = hueOf(c[0], c[1], c[2]);
    const wt = ch * a;
    sx += Math.cos(h * Math.PI / 180) * wt; sy += Math.sin(h * Math.PI / 180) * wt; w += wt;
  }
  return { h: ((Math.atan2(sy, sx) * 180 / Math.PI) % 360 + 360) % 360, chroma: w / (plate.w * plate.h) };
}

const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

/**
 * A5, re-specified (D64/D65).
 *
 * The old criterion was "pairwise mean hue difference >= 25 degrees" over a cloud mapped
 * through each act's LUT. It is mis-specified in a way that made it actively harmful:
 * R-03 gives THREE of five acts a warm key, the warm quadrant is about 60 degrees wide, and
 * three acts pairwise 25 degrees apart need 50 of it. Clearing it forced act 2 into a lemon
 * key and a green cloud, and the manager ruled that a criterion which forces a colour nobody
 * believes in is a broken criterion -- the same call as A3 and A6, and the same rule as D48
 * and D61: fix the criterion, not the artwork.
 *
 * What ART.md §6 actually states is the RELATIONSHIP rule: "no two acts share a key/shadow
 * relationship", listed as cool/cool, warm/violet, warm/black, cold/hot, hot/black-red. Two
 * acts with the same key hue and opposite shadow hues look nothing like each other, and the
 * mean hue of a mapped cloud cannot see that at all -- it collapses the whole ramp to one
 * number. So the separation is measured in the space the rule is written in: the key hue,
 * the shadow hue, and the value distance between them.
 *
 * Distance is the max of the three axes, not their sum, so an act pair is "different" if it
 * differs strongly on ANY of them -- which is what "a different relationship" means.
 */
function relationOf(p) {
  const k = hueOf(...hex(p.key)), s = hueOf(...hex(p.shadow));
  const LU = c => (c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722) / 255;
  return { keyHue: k.h, keyChroma: k.c, shadowHue: s.h, shadowChroma: s.c, spread: LU(hex(p.key)) - LU(hex(p.shadow)) };
}

/**
 * 0..1 per axis; the pair's separation is the largest single axis, because "a different
 * relationship" means different in SOME respect, not in all of them.
 *
 * Four axes, and CHROMA had to be one of them. The first version gated the hue axes on a
 * minimum chroma and act 1 fell straight through: its key is #C9CEC4 at chroma 0.04, so
 * every act-1 pair scored zero on hue and the whole criterion collapsed. But act 1's near-
 * absence of chroma IS its relationship -- ART.md §6 calls it "cool-key / cool-shadow
 * (dead)" and rations its one warm accent precisely because the act has no colour in it.
 * A palette that is dead and a palette that is hot are maximally different and the hue angle
 * between them is meaningless. So chroma is an axis, and the hue axes are WEIGHTED by chroma
 * rather than gated by it.
 */
function relationGap(a, b) {
  const kw = Math.min(1, Math.min(a.keyChroma, b.keyChroma) / 0.15);
  const sw = Math.min(1, Math.min(a.shadowChroma, b.shadowChroma) / 0.10);
  const key = kw * hueGap(a.keyHue, b.keyHue) / 180;
  const sh = sw * hueGap(a.shadowHue, b.shadowHue) / 180;
  const chroma = Math.abs(a.keyChroma - b.keyChroma) / 0.30;
  const val = Math.abs(a.spread - b.spread) / 0.9;
  return { key, sh, chroma, val, gap: Math.max(key, sh, chroma, val) };
}

module.exports = { build, resolve, toneOf, skyOf, meanHue, hueGap, relationOf, relationGap, ACT, STATE, USES, STOPS };

if (require.main === module) {
  const argv = process.argv.slice(2);
  if (argv[0] === '--measure') {
    const plate = readPNG(argv[1] && !argv[1].startsWith('--') ? argv[1] : path.join(__dirname, '..', 'work', 'clouds', 'cL01.png'));
    const acts = [1, 2, 3, 4, 5];
    // --sameLut is the control: every act gets act 2's LUT. If the measurement cannot see
    // that, it is not measuring whether the ramp does the work.
    const same = argv.includes('--sameLut');
    const hues = acts.map(a => ({ a, ...meanHue(plate, toneOf(resolve(same ? 2 : a, USES[same ? 2 : a].includes('d') ? 'd' : USES[same ? 2 : a][0]))) }));
    hues.forEach(h => console.log(`act ${h.a}  mean hue ${h.h.toFixed(1)}deg  chroma ${h.chroma.toFixed(3)}`));
    // the old single-mean-hue reading, kept and PRINTED so the change is visible rather
    // than quietly dropped
    let oldWorst = 999, oldPair = '';
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const g = hueGap(hues[i].h, hues[j].h);
      if (g < oldWorst) { oldWorst = g; oldPair = `${acts[i]}/${acts[j]}`; }
    }
    console.log(`\n  [superseded] single-mean-hue reading: worst pair ${oldPair} = ${oldWorst.toFixed(1)}deg`);

    const rel = acts.map(a => relationOf(resolve(same ? 2 : a, USES[same ? 2 : a][0])));
    console.log('\n  act  key hue/chroma   shadow hue/chroma   key-shadow value spread');
    rel.forEach((r, i) => console.log(`   ${acts[i]}   ${r.keyHue.toFixed(0).padStart(3)} / ${r.keyChroma.toFixed(2)}` +
      `        ${r.shadowHue.toFixed(0).padStart(3)} / ${r.shadowChroma.toFixed(2)}          ${r.spread.toFixed(2)}`));
    let worst = 9, worstPair = '', worstWhy = null;
    console.log('');
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) {
      const g = relationGap(rel[i], rel[j]);
      console.log(`  act ${acts[i]} vs act ${acts[j]}: keyHue ${g.key.toFixed(2)}  shadowHue ${g.sh.toFixed(2)}  chroma ${g.chroma.toFixed(2)}  value ${g.val.toFixed(2)}  -> ${g.gap.toFixed(2)}`);
      if (g.gap < worst) { worst = g.gap; worstPair = `${acts[i]}/${acts[j]}`; worstWhy = g; }
    }
    console.log(`A5 worst pair ${worstPair} = ${worst.toFixed(2)}  ` + (worst >= 0.25 ? 'PASS' : 'FAIL') + '  (line 0.25)');
    process.exit(worst >= 0.25 ? 0 : 1);
  }
  const out = argv[0] || path.resolve(__dirname, '..', '..', 'assets', 'sky');
  require('fs').mkdirSync(out, { recursive: true });
  const b = build();
  writePNG(path.join(out, 'ramps.png'), b.img, { forceAlpha: false });
  require('fs').writeFileSync(path.join(out, 'ramps.json'), JSON.stringify({
    note: 'sRGB 256x1 rows. The renderer squares them into linear (D49). alt = altitude_m / 1500.',
    width: 256, rows: b.rows, stops: STOPS, luts: b.index,
  }, null, 1));
  console.log(`ramps.png 256x${b.rows}  ${Object.keys(b.index).length} (act,sky) pairs`);
}
