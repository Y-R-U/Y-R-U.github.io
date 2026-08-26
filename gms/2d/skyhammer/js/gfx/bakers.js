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
const TILE_W = 1600;

// SEAMLESS by construction: every harmonic is an INTEGER multiple of the tile, so ridge(0) ==
// ridge(1) in value AND slope. The old 2.13x ratio produced a hard wedge once per screen width in
// every frame (ART_NOTES §5, D24). Any plate that cannot tile is not usable as a plate.
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

// Two ridge layers with snow caps, already hazed toward the fog colour. Real fog then adds more.
registerBaker('mountains', (pal, key, biome) => {
  const h = 400;
  const snow = pal.earth.snow || (biome === 'alpine' || biome === 'coast' ? '#eef2f4' : null);
  const c = makeCanvas(TILE_W, h), g = ctx2d(c);
  const R = rng(0x7e11);
  g.clearRect(0, 0, TILE_W, h);
  // The ridge must sit near the TOP of the plate and fill solidly below it, otherwise the whole
  // band hides behind the hills band in front of it.
  const layers = [
    { k: 0.26, amp: 0.42, base: 0.52, oct: 4 },
    { k: 0.62, amp: 0.52, base: 0.62, oct: 5 },
  ];
  for (const L of layers) {
    const col = mix(pal.band.far, pal.band.hazeFar, Math.min(0.45, 1 - L.k));
    const ph = R.f();
    const top = (x) => {
      const n = peaks(x / TILE_W, L.oct, ph);
      return h * L.base - Math.pow(n, 1.5) * h * L.amp;
    };
    g.fillStyle = col;
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= TILE_W; x += 5) g.lineTo(x, top(x));
    g.lineTo(TILE_W, h); g.closePath(); g.fill();

    if (snow) {
      g.save(); g.clip();
      g.fillStyle = rgba(snow, 0.55 * L.k + 0.20);
      g.beginPath(); g.moveTo(0, 0);
      for (let x = 0; x <= TILE_W; x += 5) g.lineTo(x, top(x) + h * 0.085 + Math.sin(x * 0.11) * h * 0.016);
      g.lineTo(TILE_W, 0); g.closePath(); g.fill();
      g.restore();
    }
  }
  const hz = g.createLinearGradient(0, 0, 0, h);
  hz.addColorStop(0, rgba(pal.band.hazeFar, pal.fog.k * 0.40));
  hz.addColorStop(0.5, rgba(pal.band.hazeFar, pal.fog.k * 0.16));
  hz.addColorStop(1, rgba(pal.band.hazeFar, 0));
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = hz;
  g.fillRect(0, 0, TILE_W, h);
  g.globalCompositeOperation = 'source-over';
  return c;
});

registerBaker('hills', (pal, key, biome) => {
  const h = 260, conifer = pal.veg === 'conifer';
  const c = makeCanvas(TILE_W, h), g = ctx2d(c);
  const R = rng(0x7e18);
  g.clearRect(0, 0, TILE_W, h);
  const ph = R.f();
  const top = (x) => h * 0.42 - (ridge(x / TILE_W, 4, ph) * 0.5 + 0.5) * h * 0.16;
  g.fillStyle = pal.band.mid;
  g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= TILE_W; x += 5) g.lineTo(x, top(x));
  g.lineTo(TILE_W, h); g.closePath(); g.fill();

  if (pal.vegK > 0.05) {
    g.fillStyle = pal.band.treeline;
    for (let x = 0; x < TILE_W; x += 7) {
      if (R.f() > pal.vegK * 0.62) continue;
      const y = top(x);
      const th = (R.f() * 0.55 + 0.45) * h * 0.08;
      const w = th * (conifer ? 0.48 : 0.76);
      g.beginPath();
      if (conifer) { g.moveTo(x, y + 2); g.lineTo(x - w, y + th * 0.75); g.lineTo(x + w, y + th * 0.75); }
      else {
        g.moveTo(x - w, y + th * 0.6);
        g.quadraticCurveTo(x - w, y - th * 0.35, x, y - th * 0.45);
        g.quadraticCurveTo(x + w, y - th * 0.35, x + w, y + th * 0.6);
      }
      g.closePath(); g.fill();
    }
  }
  const hz = g.createLinearGradient(0, 0, 0, h);
  hz.addColorStop(0, rgba(pal.band.hazeFar, pal.fog.k * 0.30));
  hz.addColorStop(0.75, rgba(pal.band.hazeFar, 0));
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = hz;
  g.fillRect(0, 0, TILE_W, h);
  g.globalCompositeOperation = 'source-over';
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
  const w = pal.water || { foam: '#ffffff', deep: '#204050' };
  g.clearRect(0, 0, S, S);
  const R = rng(0x5ea);
  g.lineCap = 'round';
  for (let i = 0; i < 180; i++) {
    const y = R.f() * S, x = R.f() * S, len = R.range(12, 70);
    g.strokeStyle = rgba(R.f() < 0.5 ? w.foam : w.deep, R.range(0.03, 0.11));
    g.lineWidth = R.range(0.8, 2.2);
    for (const ox of [0, -S]) {
      g.beginPath(); g.moveTo(x + ox, y); g.lineTo(x + ox + len, y + R.range(-1.5, 1.5)); g.stroke();
    }
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
