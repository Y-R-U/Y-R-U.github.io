// Every procedurally baked pixel in the game, registered against plates.js.
// Importing this file registers the bakers; nothing here draws.
//
// World-y mapping for the sky plate (SKY_TOP..SKY_BOT) is the contract the sky shader relies on.

import { makeCanvas, ctx2d, rng, noiseAlphaTile, tintMask, radialSprite } from './bake.js';
import { mix, shade, rgbHex, hexRgb } from './palette.js';
import { registerBaker } from './plates.js';

const rgba = (h, a) => { const c = hexRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

// ---------------------------------------------------------------------------- sky
// The plate maps world y linearly: v=0 is SKY_TOP, v=1 is SKY_BOT.
export const SKY_TOP = 3200, SKY_BOT = -900;
// The authored gradient (t=0..1) spans the RESTING viewport: y=730 down to y=-170.
const GRAD_TOP = 730, GRAD_BOT = -170;
const vOf = (wy) => (SKY_TOP - wy) / (SKY_TOP - SKY_BOT);

registerBaker('sky', (pal) => {
  const W = 256, H = 512;
  const c = makeCanvas(W, H), g = ctx2d(c);
  const stops = pal.sky.stops;
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, pal.sky.zenith);
  grd.addColorStop(Math.max(0.001, vOf(1900)), mix(pal.sky.zenith, stops[0][1], 0.72));
  for (const [t, col] of stops) {
    const v = vOf(GRAD_TOP - t * (GRAD_TOP - GRAD_BOT));
    grd.addColorStop(Math.min(0.999, Math.max(0.002, v)), col);
  }
  grd.addColorStop(1, shade(stops[stops.length - 1][1], -0.10));
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);

  // The hot bloom that sits ON the horizon. This is most of the reference's warmth.
  if (pal.sky.glowK > 0.02) {
    const spread = pal.sky.glowSpreadDeg / 26;
    const b = g.createLinearGradient(0, 0, 0, H);
    b.addColorStop(0, rgba(pal.sky.glow, 0));
    b.addColorStop(vOf(1100 * spread), rgba(pal.sky.glow, 0));
    b.addColorStop(vOf(430 * spread), rgba(pal.sky.glow, pal.sky.glowK * 0.13));
    b.addColorStop(vOf(90), rgba(pal.sky.glow, pal.sky.glowK * 0.34));
    b.addColorStop(vOf(-170), rgba(pal.sky.glow, pal.sky.glowK * 0.24));
    b.addColorStop(1, rgba(pal.sky.glow, pal.sky.glowK * 0.10));
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = b;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }
  return c;
});

registerBaker('stars', () => {
  const S = 512;
  const c = makeCanvas(S, S), g = ctx2d(c);
  const R = rng(0x5747);
  g.clearRect(0, 0, S, S);
  for (let i = 0; i < 300; i++) {
    g.globalAlpha = R.range(0.2, 1);
    g.fillStyle = R.f() < 0.12 ? '#ffd9b0' : '#ffffff';
    g.beginPath(); g.arc(R.f() * S, R.f() * S, R.range(0.4, 1.5), 0, 6.2832); g.fill();
  }
  return c;
});

registerBaker('sun', () => radialSprite(256, [
  [0, 'rgba(255,255,255,0.95)'], [0.10, 'rgba(255,246,220,0.72)'],
  [0.30, 'rgba(255,214,150,0.26)'], [0.60, 'rgba(255,190,130,0.07)'], [1, 'rgba(255,180,120,0)'],
]));

// -------------------------------------------------------------------------- clouds
const N_CLOUD = 16, CW = 384, CH = 132;

// Wide, flat, soft-edged, low contrast. Never a fluffy cumulus ball (ART.md §1).
function bakeCloudMask(seed, noise) {
  const c = makeCanvas(CW, CH), g = ctx2d(c);
  const R = rng(seed);
  const blobs = 10 + R.int(7);
  const spread = R.range(0.68, 0.98);
  const baseY = CH * R.range(0.54, 0.62);

  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < blobs; i++) {
    const u = (i + R.range(-0.3, 0.3)) / (blobs - 1);
    const cx = CW * (0.5 + (u - 0.5) * spread);
    const edge = 1 - Math.abs(u - 0.5) * 2;
    const rr = CW * R.range(0.05, 0.115) * (0.4 + edge * 1.0);
    const cy = baseY - rr * R.range(0.1, 0.8) * (0.35 + edge);
    const sq = R.range(0.38, 0.58);
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
    grd.addColorStop(0, 'rgba(255,255,255,0.80)');
    grd.addColorStop(0.45, 'rgba(255,255,255,0.46)');
    grd.addColorStop(0.8, 'rgba(255,255,255,0.11)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();
    g.translate(cx, cy); g.scale(1, sq); g.translate(-cx, -cy);
    g.fillStyle = grd;
    g.fillRect(cx - rr, cy - rr * 1.2, rr * 2, rr * 2.4);
    g.restore();
  }

  g.globalCompositeOperation = 'destination-out';
  const cut = g.createLinearGradient(0, baseY + CH * 0.02, 0, CH);
  cut.addColorStop(0, 'rgba(0,0,0,0)');
  cut.addColorStop(0.32, 'rgba(0,0,0,0.5)');
  cut.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = cut;
  g.fillRect(0, 0, CW, CH);
  // taper the horizontal ends so a wide band never shows a hard edge
  const ends = g.createLinearGradient(0, 0, CW, 0);
  ends.addColorStop(0, 'rgba(0,0,0,1)');
  ends.addColorStop(0.10, 'rgba(0,0,0,0)');
  ends.addColorStop(0.90, 'rgba(0,0,0,0)');
  ends.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = ends;
  g.fillRect(0, 0, CW, CH);

  g.globalAlpha = 0.15;
  g.globalCompositeOperation = 'destination-out';
  const o = R.int(128);
  for (let x = -o; x < CW; x += 128) for (let y = -o; y < CH; y += 128) g.drawImage(noise, x, y);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return c;
}

let CLOUD_MASKS = null;
function cloudMasks() {
  if (!CLOUD_MASKS) {
    const noise = noiseAlphaTile(128, 0x51e7 ^ 0x9e3, 3, 1.0);
    CLOUD_MASKS = [];
    for (let i = 0; i < N_CLOUD; i++) CLOUD_MASKS.push(bakeCloudMask(0x51e7 + i * 977, noise));
  }
  return CLOUD_MASKS;
}

registerBaker('cloud', (pal, key, variant, i) =>
  tintMask(cloudMasks()[i % N_CLOUD], pal.cloud.top, mix(pal.cloud.bot, pal.band.haze, 0.3), 0.18 + (i % 3) * 0.05));

/** All 16 tinted cloud sprites packed 4x4 so the three bands are 3 draw calls, not 40. */
export function cloudAtlas(pal) {
  const c = makeCanvas(CW * 4, CH * 4), g = ctx2d(c);
  const masks = cloudMasks();
  for (let i = 0; i < N_CLOUD; i++) {
    const sp = tintMask(masks[i], pal.cloud.top, mix(pal.cloud.bot, pal.band.haze, 0.3), 0.18 + (i % 3) * 0.05);
    g.drawImage(sp, (i % 4) * CW, Math.floor(i / 4) * CH);
  }
  return c;
}
export const CLOUD_TILE = Object.freeze({ w: CW, h: CH, cols: 4, rows: 4, n: N_CLOUD });

// ---------------------------------------------------------------- distant landforms
//
// BIOMES EXPRESS THEMSELVES HERE FIRST. Both background plates dispatch on `pal.skyline`
// (farmland 'hills', coast 'cliffs', sea 'flat', city 'city', alpine 'peaks', desert 'mesa'),
// because the two parallax bands own the full width of the frame and are what the eye reads in
// the first half second. Before this, every level drew the same snow-capped ridge — a sea level
// had mountains and a city had none.
//
// SEAMLESSNESS (D24) has two rules here, one per kind of form:
//   * continuous ridges — every harmonic is an INTEGER multiple of the tile, so value AND slope
//     match at the wrap;
//   * discrete objects (buildings, ships, mesas) — generated in [0, TILE_W) and drawn three
//     times, at x-TILE_W, x and x+TILE_W, so anything overhanging a seam is completed by its
//     own copy. Never rely on "it probably doesn't cross".
const TILE_W = 1600;

const HARM = [1, 2, 3, 5, 8, 13, 21];
function ridge(x, oct, ph = 0) {
  let v = 0, amp = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    v += Math.sin((x * HARM[i] + ph * (i + 1)) * 6.2832 + i * 2.3) * amp;
    tot += amp; amp *= 0.58;
  }
  return v / tot;
}

// Ridged: sharp peaks at the zero crossings. Smooth sine sums give a snow BLANKET, not mountains.
function peaks(x, oct, ph = 0) {
  let v = 0, amp = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    v += (1 - Math.abs(Math.sin((x * HARM[i + 1] + ph * (i + 1)) * 3.1416 + i * 1.7))) * amp;
    tot += amp; amp *= 0.5;
  }
  return v / tot;
}

/** Build (but do not paint) the closed silhouette of a top-edge function. Fill it or clip to it. */
function pathTop(g, h, top, step = 5) {
  g.beginPath();
  g.moveTo(-8, h + 8);
  for (let x = -8; x <= TILE_W + 8; x += step) g.lineTo(x, top(x));
  g.lineTo(TILE_W + 8, h + 8);
  g.closePath();
}
const fillTop = (g, h, col, top, step = 5) => { g.fillStyle = col; pathTop(g, h, top, step); g.fill(); };

/** Draw a discrete object three times so it can never break the horizontal wrap. */
const wrap3 = (fn) => { fn(-TILE_W); fn(0); fn(TILE_W); };

// WORLD Y <-> PLATE PIXELS. Each band's quad is placed by BANDS in backdrop.js: it spans
// `baseY` .. `baseY + tileScreen/aspect` in world units at rest. A skyline that wants its ground
// line ON the horizon (ships, a harbour, a city's base) has to know that mapping, otherwise it
// bakes its ground line 200 units under the sea and the whole band is invisible.
const SPAN = { 400: { base: -231, h: 770 }, 260: { base: -259, h: 529 } };
const fyFor = (h) => { const s = SPAN[h] || SPAN[400]; return (wy) => h * (1 - (wy - s.base) / s.h); };

/**
 * AERIAL PERSPECTIVE, done against the sky that is actually behind each row.
 *
 * The old version laid a single `hazeFar` tint over the plate, heaviest at the TOP. That is
 * backwards for a band whose base sits on the horizon: the low part of a silhouette stands
 * against the bright hazy horizon and the tall part rises into the much darker sky above it, so
 * hazing the top hardest made every ridge read as a pale wall in front of a darker sky — which is
 * exactly how the coast cliffs and the desert mesas first came out.
 *
 * Instead we sample the authored sky gradient at the WORLD Y of each row and mix toward that.
 * It is correct at every time of day for free: pale-blue mountain tops at midday, dark ones at
 * dusk, without a single per-palette exception.
 */
function skyColAt(pal, wy) {
  const t = (GRAD_TOP - wy) / (GRAD_TOP - GRAD_BOT);
  const st = pal.sky.stops;
  if (t <= st[0][0]) return st[0][1];
  for (let i = 1; i < st.length; i++) {
    if (t <= st[i][0]) return mix(st[i - 1][1], st[i][1], (t - st[i - 1][0]) / Math.max(1e-4, st[i][0] - st[i - 1][0]));
  }
  return st[st.length - 1][1];
}

function hazeOver(g, pal, h, k = 0.40) {
  const wyOf = (px) => { const s = SPAN[h] || SPAN[400]; return s.base + (1 - px / h) * s.h; };
  const hz = g.createLinearGradient(0, 0, 0, h);
  const kk = Math.min(0.80, k * (0.55 + pal.fog.k * 0.9));
  for (let i = 0; i <= 8; i++) {
    const v = i / 8;
    hz.addColorStop(v, rgba(skyColAt(pal, wyOf(v * h)), kk * (0.55 + 0.45 * (1 - v))));
  }
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = hz;
  g.fillRect(0, 0, TILE_W, h);
  g.globalCompositeOperation = 'source-over';
}

/** How lit the windows are. 0 in daylight, a scattering at dusk, most of them at night. */
const litness = (pal) => Math.min(1, pal.star * 0.9 + (pal.tod === 'dusk' ? 0.22 : 0));

/**
 * Value for the two silhouette layers of a band. THE NEAR BAND MUST BE DARKER THAN THE FAR ONE.
 * Both used to be drawn from `band.far`, so the mid band was the same value as the mountains and
 * ART_NOTES §5's "the mid-hills band is invisible" defect survived into 3D.
 */
const bandCols = (pal, far) => (far
  ? [mix(pal.band.far, pal.band.hazeFar, 0.38), mix(pal.band.far, pal.band.hazeFar, 0.10)]
  : [mix(pal.band.mid, pal.band.hazeFar, 0.26), pal.band.mid]);

// ------------------------------------------------------------------ skyline: peaks (alpine)
function skyPeaks(g, pal, h, snow, C) {
  const R = rng(0x7e11);
  const layers = [
    { k: 0.26, amp: 0.42, base: 0.52, oct: 4 },
    { k: 0.62, amp: 0.52, base: 0.62, oct: 5 },
  ];
  for (const L of layers) {
    const col = L.k > 0.5 ? C[1] : C[0];
    const ph = R.f();
    const top = (x) => h * L.base - Math.pow(peaks(x / TILE_W, L.oct, ph), 1.5) * h * L.amp;
    fillTop(g, h, col, top);
    if (snow) {
      g.save(); g.clip();
      g.fillStyle = rgba(snow, 0.55 * L.k + 0.20);
      g.beginPath(); g.moveTo(-8, -8);
      for (let x = -8; x <= TILE_W + 8; x += 5) g.lineTo(x, top(x) + h * 0.085 + Math.sin(x * 0.11) * h * 0.016);
      g.lineTo(TILE_W + 8, -8); g.closePath(); g.fill();
      // a cool shadow on the lee side keeps alpine from reading as one flat grey wall
      g.fillStyle = rgba(mix(pal.band.far, '#3a4d6b', 0.5), 0.22 * L.k);
      g.beginPath(); g.moveTo(-8, h + 8);
      for (let x = -8; x <= TILE_W + 8; x += 5) g.lineTo(x, top(x) + h * 0.16 + ridge(x / TILE_W, 3, 0.3) * h * 0.04);
      g.lineTo(TILE_W + 8, h + 8); g.closePath(); g.fill();
      g.restore();
    }
  }
}

// -------------------------------------------------------------- skyline: hills (farmland)
// Rolling, low, no snow, with hedged field strips on the near ridge — the patchwork is the
// single cheapest thing that says "farmland" at a glance.
function skyHills(g, pal, h, far, fy, C) {
  const R = rng(0x7e21);
  const layers = far
    ? [{ k: 0.30, base: 0.66, amp: 0.20, oct: 3 }, { k: 0.70, base: 0.80, amp: 0.26, oct: 4 }]
    : [{ k: 0.55, base: 0.52, amp: 0.22, oct: 3 }, { k: 1.00, base: 0.66, amp: 0.30, oct: 4 }];
  for (const L of layers) {
    const col = L.k > 0.5 ? C[1] : C[0];
    const ph = R.f();
    const top = (x) => h * L.base - (ridge(x / TILE_W, L.oct, ph) * 0.5 + 0.5) * h * L.amp;
    fillTop(g, h, col, top);

    if (L.k > 0.5) {
      // field strips: low-contrast slanted bands, seamless because every strip is drawn 3x
      g.save(); pathTop(g, h, top); g.clip();
      const light = shade(col, 0.10), dark = shade(col, -0.12);
      for (let i = 0; i < 26; i++) {
        const x0 = (i / 26) * TILE_W + R.range(-14, 14);
        const w = TILE_W / 26 * R.range(0.5, 1.05);
        const sl = R.range(-0.20, 0.20);
        g.fillStyle = rgba(i % 2 ? light : dark, R.range(0.20, 0.42));
        wrap3((ox) => {
          g.beginPath();
          g.moveTo(x0 + ox, 0); g.lineTo(x0 + w + ox, 0);
          g.lineTo(x0 + w + ox + sl * h, h); g.lineTo(x0 + ox + sl * h, h);
          g.closePath(); g.fill();
        });
        // the hedgerow itself — a dark line on the strip boundary
        g.strokeStyle = rgba(pal.band.treeline, 0.42);
        g.lineWidth = R.range(1, 2.2);
        wrap3((ox) => { g.beginPath(); g.moveTo(x0 + ox, 0); g.lineTo(x0 + ox + sl * h, h); g.stroke(); });
      }
      g.restore();

      // broadleaf clumps breaking the crest
      g.fillStyle = rgba(pal.band.treeline, 0.85);
      for (let x = 0; x < TILE_W; x += 9) {
        if (R.f() > 0.30) continue;
        const y = top(x), th = R.range(0.5, 1) * h * 0.075, w = th * 0.8;
        wrap3((ox) => {
          g.beginPath();
          g.moveTo(x + ox - w, y + th * 0.7);
          g.quadraticCurveTo(x + ox - w, y - th * 0.4, x + ox, y - th * 0.5);
          g.quadraticCurveTo(x + ox + w, y - th * 0.4, x + ox + w, y + th * 0.7);
          g.closePath(); g.fill();
        });
      }
      // the odd barn / windmill on the ridge line
      for (let i = 0; i < (far ? 3 : 5); i++) {
        const x = R.f() * TILE_W, y = top(x), s = h * R.range(0.05, 0.085);
        const kind = R.f();
        g.fillStyle = rgba(pal.band.treeline, 0.95);
        wrap3((ox) => {
          const X = x + ox;
          if (kind < 0.62) {                       // barn: long body, steep gable
            g.fillRect(X - s * 1.1, y - s * 0.8, s * 2.2, s * 0.85);
            g.beginPath();
            g.moveTo(X - s * 1.25, y - s * 0.8); g.lineTo(X, y - s * 1.5); g.lineTo(X + s * 1.25, y - s * 0.8);
            g.closePath(); g.fill();
          } else {                                  // windmill: tower + sails
            g.beginPath();
            g.moveTo(X - s * 0.5, y); g.lineTo(X - s * 0.3, y - s * 1.5);
            g.lineTo(X + s * 0.3, y - s * 1.5); g.lineTo(X + s * 0.5, y);
            g.closePath(); g.fill();
            g.save(); g.translate(X, y - s * 1.6); g.rotate(0.5);
            for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.fillRect(-s * 0.06, 0, s * 0.12, s * 0.95); }
            g.restore();
          }
        });
      }
    }
  }
}

// ------------------------------------------------------------------- skyline: city
// A real skyline: blocks of differing height, chimneys, spires, rubble — and lit windows once
// the sun is down. This is the whole "a city level looks like a city" fix.
function skyCity(g, pal, h, far, fy, C) {
  const R = rng(far ? 0x5c17 : 0x5c93);
  const base = fy(far ? 30 : 0);                       // block feet, just behind the crest line
  const lo = h * (far ? 0.16 : 0.12), hi = h * (far ? 0.52 : 0.44);
  const lit = litness(pal);
  const glass = pal.prop.glass;
  const rows = [];

  const drawRow = (depth, col) => {
    let x = R.range(-40, 0);
    const items = [];
    while (x < TILE_W) {
      const w = h * R.range(0.10, 0.30);
      const bh = R.range(lo, hi) * R.range(0.55, 1);
      items.push({ x, w, bh, kind: R.f(), seed: R.f() });
      x += w + h * R.range(0.005, 0.045);
    }
    for (const it of items) {
      const y = base - it.bh;
      wrap3((ox) => {
        const X = it.x + ox;
        g.fillStyle = col;
        if (it.kind < 0.10) {                       // a bombed-out block: stepped, broken top
          const n = 4;
          for (let i = 0; i < n; i++) {
            const cw = it.w / n;
            const cut = it.bh * (0.10 + ((it.seed * 977 * (i + 3)) % 1) * 0.42);
            g.fillRect(X + i * cw, y + cut, cw + 0.6, it.bh - cut);
          }
        } else {
          g.fillRect(X, y, it.w + 0.6, it.bh);
          if (it.kind > 0.90) {                     // church spire / clock tower
            const sw = it.w * 0.30;
            g.fillRect(X + it.w * 0.35, y - it.bh * 0.55, sw, it.bh * 0.55);
            g.beginPath();
            g.moveTo(X + it.w * 0.30, y - it.bh * 0.55);
            g.lineTo(X + it.w * 0.50, y - it.bh * 0.95);
            g.lineTo(X + it.w * 0.70, y - it.bh * 0.55);
            g.closePath(); g.fill();
          } else if (it.kind > 0.74) {              // pitched roof
            g.beginPath();
            g.moveTo(X - 1, y); g.lineTo(X + it.w * 0.5, y - h * 0.045); g.lineTo(X + it.w + 1, y);
            g.closePath(); g.fill();
          } else if (it.kind > 0.58) {              // chimney stack
            g.fillRect(X + it.w * 0.62, y - h * (far ? 0.10 : 0.16), h * 0.016, h * (far ? 0.10 : 0.16));
          }
        }
      });
      it.y = y; it.col = col; it.depth = depth;
      rows.push(it);
    }
  };

  drawRow(0, C[0]);
  drawRow(1, C[1]);

  // a rubble line along the base so the city sits IN something rather than floating
  g.fillStyle = rgba(shade(pal.band.mid, -0.25), 0.85);
  for (let x = 0; x < TILE_W; x += 11) {
    const rh = h * (0.008 + ((x * 0.017) % 1) * 0.022);
    wrap3((ox) => g.fillRect(x + ox, base - rh, 11.4, rh + h));
  }

  hazeOver(g, pal, h, far ? 0.42 : 0.24);

  // Windows go on AFTER the haze so they punch through it — a lit window is a light source,
  // not a surface that distance can wash out.
  if (lit > 0.06) {
    for (const it of rows) {
      if (it.kind < 0.10) continue;
      const cw = Math.max(1.6, it.w * 0.11), gap = cw * 2.7;
      const rowsN = Math.max(1, Math.floor(it.bh / (gap * 1.15)));
      for (let cx = it.x + cw * 0.8; cx < it.x + it.w - cw; cx += gap) {
        for (let r = 0; r < rowsN; r++) {
          const seed = ((cx * 7.31 + r * 13.7 + it.seed * 91) % 1 + 1) % 1;
          if (seed > lit * 0.42 + (it.depth ? 0.05 : 0)) continue;
          const wy = it.y + gap * 0.7 + r * gap * 1.15;
          if (wy > base - cw) continue;
          g.fillStyle = rgba(glass, 0.35 + seed * 0.55);
          wrap3((ox) => g.fillRect(cx + ox, wy, cw * 0.72, cw * 0.72));
        }
      }
    }
  }
  return true;   // haze already applied
}

// ------------------------------------------------------------------ skyline: cliffs (coast)
// FAR band: a headland that meets the water — flat tops, near-vertical faces, sea stacks.
// NEAR band: a harbour — breakwater, lighthouse, jetty pilings, moored hulls, warehouses.
// NO SNOW anywhere: coast used to borrow alpine's snow caps and read as the wrong biome.
function skyCliffs(g, pal, h, far, fy, C) {
  const R = rng(far ? 0x4c11 : 0x4c55);
  const sea = fy(far ? 15 : 0);
  const W = pal.water || { deep: pal.band.mid, shallow: pal.band.far, foam: '#ffffff' };
  if (!far) return skyHarbour(g, pal, h, fy, C, R, sea, W);

  for (const L of [{ k: 0.30, rise: 0.30 }, { k: 0.75, rise: 0.21 }]) {
    const col = L.k > 0.5 ? C[1] : C[0];
    const ph = R.f();
    const top = (x) => {
      const u = x / TILE_W;
      // QUANTISED, not smooth. A smooth ridge gives a rounded dome that reads as a hill; a cliff
      // is flat on top with a near-vertical face, and stepping the height produces both.
      const land = Math.round((ridge(u, 3, ph) * 0.5 + 0.5) * 4) / 4;
      const t = sea - h * L.rise * (0.40 + 0.60 * land);
      return ridge(u, 2, ph + 0.37) + 0.16 > 0 ? t : sea;
    };
    fillTop(g, h, col, top, 3);
    g.save(); pathTop(g, h, top, 3); g.clip();
    for (let i = 1; i < 6; i++) {
      g.fillStyle = rgba(i % 2 ? shade(col, -0.20) : shade(col, 0.08), 0.34);
      g.fillRect(-8, sea - h * L.rise + i * h * L.rise * 0.17, TILE_W + 16, h * 0.012);
    }
    g.restore();
  }
  // sea stacks standing off the headland
  g.fillStyle = shade(C[1], -0.10);
  for (let i = 0; i < 7; i++) {
    const x = R.f() * TILE_W, sh = h * R.range(0.04, 0.11), sw = h * R.range(0.010, 0.024);
    wrap3((ox) => {
      g.beginPath();
      g.moveTo(x + ox - sw, sea); g.lineTo(x + ox - sw * 0.6, sea - sh);
      g.lineTo(x + ox + sw * 0.6, sea - sh); g.lineTo(x + ox + sw, sea);
      g.closePath(); g.fill();
    });
  }
  // the bay below the cliff line; mostly hidden by real terrain, it only has to not be a hole
  g.fillStyle = mix(W.deep, pal.band.hazeFar, 0.42);
  g.fillRect(0, sea, TILE_W, h - sea);
}

function skyHarbour(g, pal, h, fy, C, R, sea, W) {
  const dark = shade(C[1], -0.12);
  // water first, so everything else sits on it
  const grd = g.createLinearGradient(0, sea, 0, h);
  grd.addColorStop(0, mix(W.shallow, pal.band.hazeFar, 0.50));
  grd.addColorStop(1, mix(W.deep, pal.band.hazeFar, 0.18));
  g.fillStyle = grd;
  g.fillRect(0, sea, TILE_W, h - sea);

  // low shoreline: warehouses and sheds behind the quay
  for (let i = 0; i < 26; i++) {
    const x = R.f() * TILE_W, w = h * R.range(0.06, 0.22), bh = h * R.range(0.05, 0.16);
    wrap3((ox) => {
      g.fillStyle = C[0];
      g.fillRect(x + ox, sea - bh, w, bh);
      if (R.f() < 0.5) g.fillRect(x + ox + w * 0.7, sea - bh * 1.5, h * 0.012, bh * 0.5);
    });
  }
  // the breakwater arm, with a lighthouse on its head
  const bx = TILE_W * 0.42, bw = TILE_W * 0.34, bh = h * 0.035;
  wrap3((ox) => {
    g.fillStyle = dark;
    g.fillRect(bx + ox, sea - bh, bw, bh * 2.2);
    g.fillRect(bx + bw + ox - h * 0.02, sea - h * 0.13, h * 0.030, h * 0.13);
    g.fillStyle = rgba(pal.fx.accent, 0.75);
    g.fillRect(bx + bw + ox - h * 0.016, sea - h * 0.135, h * 0.018, h * 0.022);
  });
  // jetty pilings marching out into the water
  g.fillStyle = dark;
  for (let i = 0; i < 3; i++) {
    const jx = R.f() * TILE_W, n = 5 + R.int(6), sp = h * 0.028;
    wrap3((ox) => {
      for (let k = 0; k < n; k++) g.fillRect(jx + ox + k * sp, sea - h * 0.030, h * 0.010, h * 0.052);
      g.fillRect(jx + ox, sea - h * 0.040, n * sp, h * 0.014);
    });
  }
  // moored hulls: hull, superstructure, mast
  for (let i = 0; i < 5; i++) {
    const x = R.f() * TILE_W, s = h * R.range(0.045, 0.085);
    wrap3((ox) => {
      const X = x + ox;
      g.fillStyle = dark;
      g.beginPath();
      g.moveTo(X - s * 2.0, sea + s * 0.10); g.lineTo(X + s * 2.2, sea + s * 0.10);
      g.lineTo(X + s * 1.8, sea - s * 0.40); g.lineTo(X - s * 1.7, sea - s * 0.36);
      g.closePath(); g.fill();
      g.fillRect(X - s * 0.6, sea - s * 0.85, s * 1.2, s * 0.48);
      g.fillRect(X - s * 0.2, sea - s * 1.10, s * 0.40, s * 0.28);
      g.fillRect(X + s * 0.9, sea - s * 1.25, s * 0.09, s * 0.90);
    });
  }
  // a foam line along the quay so the water edge is not a ruled line
  g.fillStyle = rgba(W.foam, 0.22);
  for (let i = 0; i < 90; i++) {
    const x = R.f() * TILE_W, len = R.range(8, 40);
    wrap3((ox) => g.fillRect(x + ox, sea + R.range(0, h * 0.04), len, 1.1));
  }
}

// -------------------------------------------------------------------- skyline: mesa (desert)
// Flat tops, vertical sides, stepped strata. A dune sweep at the base.
function skyMesa(g, pal, h, far, fy, C) {
  const R = rng(far ? 0x3d11 : 0x3d77);
  const base = fy(far ? 40 : 10);
  for (const L of far ? [{ k: 0.28, lo: 0.06, hi: 0.17 }, { k: 0.72, lo: 0.08, hi: 0.24 }]
                      : [{ k: 0.28, lo: 0.07, hi: 0.18 }, { k: 0.72, lo: 0.09, hi: 0.26 }]) {
    const col = L.k > 0.5 ? C[1] : C[0];
    let x = R.range(-160, 0);
    while (x < TILE_W) {
      const w = h * R.range(0.30, 1.15);
      const mh = h * R.range(L.lo, L.hi);
      const slope = w * R.range(0.06, 0.16);
      const y = base - mh;
      wrap3((ox) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(x + ox, base);
        g.lineTo(x + ox + slope, y);
        g.lineTo(x + ox + w - slope, y - h * 0.01);
        g.lineTo(x + ox + w, base);
        g.closePath(); g.fill();
        g.save(); g.clip();
        for (let i = 1; i < 6; i++) {
          g.fillStyle = rgba(i % 2 ? shade(col, -0.14) : shade(col, 0.12), 0.34);
          g.fillRect(x + ox - 4, y + i * mh * 0.16, w + 8, mh * 0.05);
        }
        g.restore();
      });
      x += w * R.range(0.55, 1.05);
    }
  }
  // dunes: soft overlapping arcs along the base
  const dune = mix(pal.band.mid, pal.band.hazeFar, 0.12);
  const top = (x) => base + h * 0.03 - (ridge(x / TILE_W, 3, 0.21) * 0.5 + 0.5) * h * 0.07;
  fillTop(g, h, dune, top);
  g.fillStyle = rgba(shade(dune, 0.14), 0.30);
  const top2 = (x) => base + h * 0.055 - (ridge(x / TILE_W, 2, 0.61) * 0.5 + 0.5) * h * 0.05;
  pathTop(g, h, top2); g.fill();
}

// --------------------------------------------------------------------- skyline: flat (sea)
// Open water. Almost nothing: a low haze bank and a distant convoy. An empty far band is the
// point — it is what makes a sea level read as sea instead of as a field with mountains.
function skyFlat(g, pal, h, far, fy, C) {
  const R = rng(far ? 0x5e11 : 0x5e44);
  const line = fy(far ? 6 : 0);                       // ships sit ON the water line
  const bank = mix(C[0], pal.band.hazeFar, 0.45);
  const grd = g.createLinearGradient(0, line - h * 0.14, 0, line);
  grd.addColorStop(0, rgba(bank, 0));
  grd.addColorStop(1, rgba(bank, far ? 0.55 : 0.30));
  g.fillStyle = grd;
  g.fillRect(0, line - h * 0.14, TILE_W, h * 0.14);
  g.fillStyle = bank;
  g.fillRect(0, line, TILE_W, h - line);

  // a convoy on the horizon — hull, superstructure, funnel, mast
  const ship = far ? C[1] : shade(C[1], -0.18);
  const n = far ? 5 : 3;
  for (let i = 0; i < n; i++) {
    const x = R.f() * TILE_W, s = h * R.range(0.035, 0.075) * (far ? 0.8 : 1.35);
    wrap3((ox) => {
      const X = x + ox;
      g.fillStyle = ship;
      g.beginPath();
      g.moveTo(X - s * 2.2, line); g.lineTo(X + s * 2.4, line);
      g.lineTo(X + s * 1.9, line - s * 0.34); g.lineTo(X - s * 1.8, line - s * 0.30);
      g.closePath(); g.fill();
      g.fillRect(X - s * 0.7, line - s * 0.80, s * 1.3, s * 0.50);
      g.fillRect(X - s * 0.3, line - s * 1.05, s * 0.45, s * 0.28);   // funnel
      g.fillRect(X + s * 0.9, line - s * 1.15, s * 0.10, s * 0.85);   // mast
    });
  }
}

// ------------------------------------------------------------------------ the two plates
const SKYLINES = { peaks: skyPeaks, hills: skyHills, city: skyCity, cliffs: skyCliffs, mesa: skyMesa, flat: skyFlat };

registerBaker('mountains', (pal) => {
  const h = 400;
  const c = makeCanvas(TILE_W, h), g = ctx2d(c);
  g.clearRect(0, 0, TILE_W, h);
  const kind = SKYLINES[pal.skyline] ? pal.skyline : 'hills';
  let hazed = false;
  // Snow belongs to biomes that HAVE a snow line. Coast used to force it and read as alpine.
  if (kind === 'peaks') skyPeaks(g, pal, h, pal.earth.snow || '#eef2f4', bandCols(pal, true));
  else hazed = !!SKYLINES[kind](g, pal, h, true, fyFor(h), bandCols(pal, true));
  if (!hazed) hazeOver(g, pal, h, 0.42);
  return c;
});

registerBaker('hills', (pal) => {
  const h = 260;
  const c = makeCanvas(TILE_W, h), g = ctx2d(c);
  g.clearRect(0, 0, TILE_W, h);
  const kind = SKYLINES[pal.skyline] ? pal.skyline : 'hills';
  let hazed = false;
  if (kind === 'peaks') {
    // alpine's NEAR band is a conifer treeline on a rock shelf, not a second mountain range —
    // two ranges stacked read as one flat grey wall.
    const R = rng(0x7e18);
    const ph = R.f();
    const col = pal.band.mid;
    const top = (x) => h * 0.40 - (ridge(x / TILE_W, 4, ph) * 0.5 + 0.5) * h * 0.20;
    fillTop(g, h, col, top);
    g.fillStyle = rgba(shade(col, 0.16), 0.35);
    pathTop(g, h, (x) => h * 0.40 - (ridge(x / TILE_W, 4, ph) * 0.5 + 0.5) * h * 0.20 + h * 0.05);
    g.fill();
    g.fillStyle = pal.band.treeline;
    for (let x = 0; x < TILE_W; x += 6) {
      if (R.f() > 0.55) continue;
      const y = top(x), th = R.range(0.5, 1) * h * 0.13, w = th * 0.30;
      wrap3((ox) => {
        g.beginPath();
        g.moveTo(x + ox, y - th * 0.35); g.lineTo(x + ox - w, y + th * 0.55); g.lineTo(x + ox + w, y + th * 0.55);
        g.closePath(); g.fill();
      });
    }
  } else {
    hazed = !!SKYLINES[kind](g, pal, h, false, fyFor(h), bandCols(pal, false));
  }
  if (!hazed) hazeOver(g, pal, h, 0.24);
  return c;
});

// ------------------------------------------------------------------- surface detail
registerBaker('earthtex', (pal) => {
  const S = 256;
  const c = makeCanvas(S, S), g = ctx2d(c);
  g.fillStyle = pal.earth.albedo;
  g.fillRect(0, 0, S, S);
  const R = rng(0x3a11);
  for (let i = 0; i < 900; i++) {
    const x = R.f() * S, y = R.f() * S;
    g.fillStyle = rgba(R.f() < 0.5 ? pal.earth.deep : pal.earth.grass, R.range(0.05, 0.22));
    g.fillRect(x, y, R.range(1, 7), R.range(1, 3));
  }
  return c;
});

registerBaker('water', (pal) => {
  const S = 512;
  const c = makeCanvas(S, S), g = ctx2d(c);
  const w = pal.water || { foam: '#ffffff', deep: '#204050', shallow: '#3f8aa8' };
  g.clearRect(0, 0, S, S);
  const R = rng(0x5ea);

  // Long swell bands first: wide, soft, low contrast — they give the sea a FORM, which is what a
  // field of sparkle dashes on its own never did (ART_NOTES §5 recorded the old ruled-line defect).
  for (let i = 0; i < 26; i++) {
    const y = R.f() * S, hgt = R.range(6, 26);
    const grd = g.createLinearGradient(0, y, 0, y + hgt);
    grd.addColorStop(0, rgba(w.foam, 0));
    grd.addColorStop(0.5, rgba(w.foam, R.range(0.04, 0.10)));
    grd.addColorStop(1, rgba(w.foam, 0));
    g.fillStyle = grd;
    g.fillRect(0, y, S, hgt);
  }

  // Crest streaks: randomised length, soft round ends, wrapped so the tile is seamless in x.
  g.lineCap = 'round';
  for (let i = 0; i < 320; i++) {
    const y = R.f() * S, x = R.f() * S, len = R.range(8, 64);
    g.strokeStyle = rgba(R.f() < 0.62 ? w.foam : w.deep, R.range(0.04, 0.16));
    g.lineWidth = R.range(0.7, 2.4);
    for (const ox of [0, -S]) {
      g.beginPath(); g.moveTo(x + ox, y); g.lineTo(x + ox + len, y + R.range(-1.5, 1.5)); g.stroke();
    }
  }
  // A scattering of hot points for the sun path. Additive at draw time, so these are the sparkle.
  for (let i = 0; i < 130; i++) {
    const x = R.f() * S, y = R.f() * S, rr = R.range(1.2, 3.4);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, rgba(w.glint || '#ffffff', R.range(0.25, 0.7)));
    grd.addColorStop(1, rgba(w.glint || '#ffffff', 0));
    g.fillStyle = grd;
    for (const ox of [0, -S]) g.fillRect(x + ox - rr, y - rr, rr * 2, rr * 2);
  }
  return c;
});

// ------------------------------------------------------------------------- FX sprites
registerBaker('fire', () => radialSprite(128, [
  [0, 'rgba(255,255,255,1)'], [0.16, 'rgba(255,248,210,0.95)'], [0.36, 'rgba(255,186,86,0.62)'],
  [0.62, 'rgba(226,96,32,0.22)'], [1, 'rgba(120,30,10,0)'],
]));

registerBaker('smoke', () => {
  const S = 128;
  const c = makeCanvas(S, S), g = ctx2d(c);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,0.85)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.42)');
  grd.addColorStop(0.8, 'rgba(255,255,255,0.08)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'destination-out';
  g.globalAlpha = 0.5;
  const n = noiseAlphaTile(128, 0x3313, 3, 1.4);
  g.drawImage(n, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  return c;
});

registerBaker('spark', () => radialSprite(64, [
  [0, 'rgba(255,255,255,1)'], [0.30, 'rgba(255,226,150,0.7)'], [1, 'rgba(255,150,60,0)'],
]));

registerBaker('ring', () => {
  const S = 256;
  const c = makeCanvas(S, S), g = ctx2d(c);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0.00, 'rgba(255,255,255,0)');
  grd.addColorStop(0.74, 'rgba(255,255,255,0)');
  grd.addColorStop(0.87, 'rgba(255,244,214,0.85)');
  grd.addColorStop(0.95, 'rgba(255,190,110,0.35)');
  grd.addColorStop(1.00, 'rgba(255,160,80,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  return c;
});

registerBaker('scorch', () => {
  const S = 128;
  const c = makeCanvas(S, S), g = ctx2d(c);
  const R = rng(0x9c0);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const rr = S * R.range(0.2, 0.46);
    const x = S / 2 + R.range(-S * 0.12, S * 0.12), y = S / 2 + R.range(-S * 0.08, S * 0.08);
    const grd = g.createRadialGradient(x, y, 0, x, y, rr);
    grd.addColorStop(0, 'rgba(255,255,255,0.5)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.2)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  return c;
});

registerBaker('streak', () => {
  const W = 128, H = 32;
  const c = makeCanvas(W, H), g = ctx2d(c);
  const grd = g.createLinearGradient(0, 0, W, 0);
  grd.addColorStop(0.00, 'rgba(255,255,255,0)');
  grd.addColorStop(0.55, 'rgba(255,240,200,0.35)');
  grd.addColorStop(0.90, 'rgba(255,255,255,1)');
  grd.addColorStop(1.00, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  const soft = g.createLinearGradient(0, 0, 0, H);
  soft.addColorStop(0, 'rgba(0,0,0,1)'); soft.addColorStop(0.5, 'rgba(0,0,0,0)'); soft.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = soft; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  return c;
});

// The readability-law halo: a barely-visible lift behind the player (ART.md §2).
registerBaker('halo', () => radialSprite(256, [
  [0, 'rgba(255,236,200,0.34)'], [0.28, 'rgba(255,226,180,0.18)'],
  [0.62, 'rgba(255,214,160,0.05)'], [1, 'rgba(255,200,140,0)'],
]));
