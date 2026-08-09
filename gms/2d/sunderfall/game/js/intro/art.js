/* Procedural painted layers.
 *
 * Everything the intro shows is generated here at boot, into 2D canvases, then uploaded once as
 * parallax layer textures. Layers are painted as VALUE + COVERAGE only (rgb = a grey albedo, a =
 * silhouette). All colour, rim light, fog and aerial perspective happen in the shader, so one set
 * of layers can be lit as dusk, as cold forest, or as a white detonation without regenerating.
 */

import { makeRng, fbm2, ridged, clamp, sat, smoothstep } from './util.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = true;
  return { c, g };
}

const TAU = Math.PI * 2;
const grey = (v, a = 1) => `rgba(${(v * 255) | 0},${(v * 255) | 0},${(v * 255) | 0},${a})`;

/* ── brush primitives ─────────────────────────────────────────────────────── */

function softBlob(g, x, y, r, v, a) {
  const grd = g.createRadialGradient(x, y, 0, x, y, r);
  grd.addColorStop(0, grey(v, a));
  grd.addColorStop(0.55, grey(v, a * 0.55));
  grd.addColorStop(1, grey(v, 0));
  g.fillStyle = grd;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

// A closed, noise-perturbed blob — the base unit of every organic mass here.
function organicPath(g, x, y, r, squash, rot, wob, seed, lobes = 9) {
  const n = 26;
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1
      + wob * fbm2(Math.cos(a) * lobes * 0.5 + seed, Math.sin(a) * lobes * 0.5 + seed * 1.7, 3)
      + wob * 0.45 * Math.sin(a * lobes + seed * 3.1);
    const rr = r * k;
    const px = Math.cos(a) * rr, py = Math.sin(a) * rr * squash;
    const cx = x + px * Math.cos(rot) - py * Math.sin(rot);
    const cy = y + px * Math.sin(rot) + py * Math.cos(rot);
    if (i === 0) g.moveTo(cx, cy); else g.lineTo(cx, cy);
  }
  g.closePath();
}

// Tapered, slightly curved limb as a filled polygon. Returns the tip.
function limb(g, x0, y0, ang, len, w0, w1, bend) {
  const steps = 7;
  const L = [], R = [];
  let x = x0, y = y0, a = ang;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const w = (w0 + (w1 - w0) * t) * 0.5;
    L.push([x + Math.cos(a + Math.PI / 2) * w, y + Math.sin(a + Math.PI / 2) * w]);
    R.push([x + Math.cos(a - Math.PI / 2) * w, y + Math.sin(a - Math.PI / 2) * w]);
    a += bend / steps;
    x += Math.cos(a) * (len / steps);
    y += Math.sin(a) * (len / steps);
  }
  g.beginPath();
  g.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < L.length; i++) g.lineTo(L[i][0], L[i][1]);
  for (let i = R.length - 1; i >= 0; i--) g.lineTo(R[i][0], R[i][1]);
  g.closePath();
  g.fill();
  return [x, y, a];
}

/* ── trees ────────────────────────────────────────────────────────────────── */

function foliageMass(g, x, y, r, rng, v, density) {
  // core mass, then edge breakup so the silhouette never reads as a circle
  const clumps = Math.max(3, (density * 7) | 0);
  for (let i = 0; i < clumps; i++) {
    const a = rng() * TAU, d = rng() * r * 0.62;
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d * 0.8;
    const cr = r * (0.42 + rng() * 0.45);
    g.fillStyle = grey(v * (0.86 + rng() * 0.3), 1);
    organicPath(g, cx, cy, cr, 0.72 + rng() * 0.3, rng() * TAU, 0.24, rng() * 40, 7 + ((rng() * 6) | 0));
    g.fill();
  }
  // leaf spatter on the boundary — this is what stops it looking like a vector shape
  const spat = (r * density * 1.5) | 0;
  for (let i = 0; i < spat; i++) {
    const a = rng() * TAU;
    const d = r * (0.7 + rng() * 0.5);
    const cx = x + Math.cos(a) * d, cy = y + Math.sin(a) * d * 0.82;
    const s = r * (0.035 + rng() * 0.085);
    g.fillStyle = grey(v * (0.8 + rng() * 0.4), 0.85 + rng() * 0.15);
    g.save();
    g.translate(cx, cy);
    g.rotate(rng() * TAU);
    g.beginPath();
    g.ellipse(0, 0, s * (1.4 + rng()), s * 0.6, 0, 0, TAU);
    g.fill();
    g.restore();
  }
}

function drawTree(g, rng, x, baseY, height, o) {
  const v = o.value;
  // width is decoupled from height so a band carries thin saplings and heavy boles, not one gauge
  const gauge = o.gauge ?? (0.55 + rng() * 1.15);
  const trunkW = height * (0.026 + rng() * 0.016) * gauge * (o.trunkScale ?? 1);
  g.fillStyle = grey(v, 1);

  // the trunk continues BELOW the ground line — the soil band is painted over it afterwards, so
  // it disappears into the ground instead of terminating on a line in mid-air
  const bury = height * 0.10 + trunkW * 1.4;

  // a basal flare: the bole widens for the bottom eighth, which is what stops it reading as a
  // parallelogram stuck to the floor
  const flareH = height * 0.11;
  g.beginPath();
  g.moveTo(x - trunkW * 1.95, baseY + bury);
  g.quadraticCurveTo(x - trunkW * 1.05, baseY - flareH * 0.25, x - trunkW * 0.54, baseY - flareH);
  g.lineTo(x + trunkW * 0.54, baseY - flareH);
  g.quadraticCurveTo(x + trunkW * 1.05, baseY - flareH * 0.25, x + trunkW * 1.95, baseY + bury);
  g.closePath(); g.fill();

  // roots flaring out over the soil
  const nRoots = o.roots === false ? 0 : 3 + ((rng() * 3) | 0);
  for (let i = 0; i < nRoots; i++) {
    const s = rng() < 0.5 ? -1 : 1;
    limb(g, x + s * trunkW * 0.5, baseY - flareH * 0.15,
      -Math.PI / 2 + s * (1.16 + rng() * 0.40), height * (0.055 + rng() * 0.075),
      trunkW * (0.62 + rng() * 0.55), trunkW * 0.05, s * 1.15);
  }

  const stack = [];
  const lean = (rng() - 0.5) * 0.34 * (o.lean ?? 1);
  let [tx, ty, ta] = [x, baseY - flareH * 0.9, -Math.PI / 2 + lean];
  const spine = [[tx, ty, trunkW]];
  const segs = 4;
  let segLen = height * 0.24, w = trunkW;
  for (let s = 0; s < segs; s++) {
    const nw = w * (0.70 + rng() * 0.08);
    [tx, ty, ta] = limb(g, tx, ty, ta, segLen, w, nw, (rng() - 0.5) * 0.34);
    spine.push([tx, ty, nw]);
    w = nw; segLen *= 0.84;
    if (s >= 1) stack.push([tx, ty, ta, w, height * 0.26 * Math.pow(0.8, s), 3]);
  }
  stack.push([tx, ty, ta, w, height * 0.26, 3]);

  // Bark: value variation INSIDE the trunk. Without it a flat fill has no gradient except at its
  // two silhouette edges, so the shader's wide rim lights one whole face and the trunk reads as a
  // leaning plank. The dark strips at ±0.8 also give it a cylindrical section under any key.
  if (o.bark !== false) {
    const strips = [[-0.82, 0.46], [0.82, 0.50], [-0.42, 1.24], [0.10, 0.78], [0.48, 1.12], [-0.14, 0.92]];
    for (const [off, vm] of strips) {
      g.strokeStyle = grey(Math.min(1, v * vm), 0.85);
      g.lineWidth = Math.max(0.8, trunkW * (0.16 + rng() * 0.13));
      g.beginPath();
      for (let i = 0; i < spine.length; i++) {
        const [sx, sy, sw] = spine[i];
        const px = sx + off * sw * 0.5 + (fbm2(sy * 0.02, off * 9 + o.seed, 3) - 0.5) * sw * 0.22;
        i === 0 ? g.moveTo(px, sy + bury * 0.4) : g.lineTo(px, sy);
      }
      g.stroke();
    }
  }

  const tips = [];
  let guard = 0;
  while (stack.length && guard++ < 400) {
    const [bx, by, ba, bw, bl, depth] = stack.pop();
    if (depth <= 0 || bl < height * 0.02) { tips.push([bx, by, bl]); continue; }
    const n = rng() < 0.72 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const spread = (o.spread ?? 0.72) * (0.5 + rng());
      const a = ba + (i - (n - 1) / 2) * spread + (rng() - 0.5) * 0.3;
      const l = bl * (0.62 + rng() * 0.3);
      const nw = bw * (0.52 + rng() * 0.18);
      const [ex, ey] = limb(g, bx, by, a, l, bw, nw, (rng() - 0.5) * 0.5);
      stack.push([ex, ey, a, nw, l, depth - 1]);
    }
  }

  if (o.foliage !== false) {
    // the crown first, so the tip clumps break its outline rather than sit inside it
    const fs = o.foliageScale ?? 1;
    const cx = x + lean * height * 0.45, cy = baseY - height * (0.80 + rng() * 0.07);
    foliageMass(g, cx, cy, height * 0.20 * fs, rng, v * 0.92, (o.density ?? 1) * 1.15);
    foliageMass(g, cx - height * 0.15 * fs, cy + height * 0.09, height * 0.135 * fs, rng, v * 0.84, o.density ?? 1);
    foliageMass(g, cx + height * 0.16 * fs, cy + height * 0.07, height * 0.13 * fs, rng, v * 1.0, o.density ?? 1);
    for (const [fx, fy] of tips) {
      if (rng() > (o.foliageChance ?? 0.75)) continue;
      foliageMass(g, fx, fy, height * (0.05 + rng() * 0.055) * fs, rng,
        v * (0.85 + rng() * 0.3), o.density ?? 1);
    }
  }
  return { tips, x, baseY, trunkW, height };
}

/* The soil the band stands in. Painted AFTER the trees so it buries their bases, then re-detailed
 * on top so the join is organic rather than a straight cut. Cast shadows rake to the lower right,
 * because the whole intro now nominates one key in the upper left. */
function groundBank(g, rng, w, h, baseY, o, trees) {
  const v = o.value;
  const lip = (x) => baseY
    + (fbm2(x * 0.0021 + o.seed * 3.1, 7.3, 4) - 0.5) * h * 0.045
    + (fbm2(x * 0.011 + o.seed, 2.1, 3) - 0.5) * h * 0.014;

  const bankPath = () => {
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 5) g.lineTo(x, lip(x));
    g.lineTo(w, h); g.closePath();
  };
  g.fillStyle = grey(v * 0.52, 1);
  bankPath(); g.fill();

  // the top surface catches the key and falls away into the dark — without this the bank is a
  // flat strip and the trunks still read as standing on nothing
  g.save();
  bankPath(); g.clip();
  const lg = g.createLinearGradient(0, baseY - h * 0.05, 0, baseY + h * 0.20);
  lg.addColorStop(0, grey(1, 0.34));
  lg.addColorStop(0.18, grey(1, 0.12));
  lg.addColorStop(0.55, grey(0, 0.22));
  lg.addColorStop(1, grey(0, 0.55));
  g.fillStyle = lg;
  g.fillRect(0, baseY - h * 0.08, w, h);
  g.restore();

  // cast shadows, then contact darkening, both on the soil
  for (const t of trees) {
    if (t.tier === 0) continue;
    const sl = t.trunkW * (5 + t.tier * 3);
    g.fillStyle = grey(v * 0.20, 0.55);
    g.beginPath();
    g.ellipse(t.x + sl * 0.55, lip(t.x) + t.trunkW * 0.9, sl, t.trunkW * 1.35, 0.22, 0, TAU);
    g.fill();
    g.fillStyle = grey(v * 0.10, 0.85);
    g.beginPath();
    g.ellipse(t.x, lip(t.x) + t.trunkW * 0.25, t.trunkW * 2.1, t.trunkW * 0.62, 0, 0, TAU);
    g.fill();
  }

  // roots crawling out over the soil, so the trunk grips instead of being planted in a hole
  for (const t of trees) {
    if (t.tier < 2) continue;
    g.fillStyle = grey(v * 0.72, 1);
    for (let i = 0; i < 3; i++) {
      const s = rng() < 0.5 ? -1 : 1;
      limb(g, t.x + s * t.trunkW * 0.4, lip(t.x) - t.trunkW * 0.2,
        -Math.PI / 2 + s * (1.42 + rng() * 0.20), t.height * (0.03 + rng() * 0.045),
        t.trunkW * (0.5 + rng() * 0.4), t.trunkW * 0.05, s * 0.55);
    }
  }

  // clods and stones along the lip
  for (let i = 0; i < w / 40; i++) {
    const x = rng() * w, y = lip(x);
    g.fillStyle = grey(v * (0.34 + rng() * 0.34), 1);
    organicPath(g, x, y + h * (0.004 + rng() * 0.012), h * (0.006 + rng() * 0.020),
      0.5 + rng() * 0.3, 0, 0.32, rng() * 30, 8);
    g.fill();
  }

  // grass at three scales, thinned toward the back of the band
  const tuft = (x, y, s, val) => {
    g.strokeStyle = grey(val, 0.92);
    g.lineWidth = Math.max(0.7, s * 0.10);
    const n = 3 + ((rng() * 4) | 0);
    for (let k = 0; k < n; k++) {
      const b = (rng() - 0.5) * 1.7;
      const l = s * (0.55 + rng() * 0.8);
      g.beginPath();
      g.moveTo(x + (rng() - 0.5) * s * 0.5, y);
      g.quadraticCurveTo(x + b * l * 0.35, y - l * 0.65, x + b * l, y - l);
      g.stroke();
    }
  };
  const gN = ((w / 34) * (o.grass ?? 1)) | 0;
  for (let i = 0; i < gN; i++) {
    const x = rng() * w, r = rng();
    const s = h * (r < 0.55 ? 0.016 + rng() * 0.018 : r < 0.86 ? 0.036 + rng() * 0.030 : 0.070 + rng() * 0.055);
    tuft(x, lip(x) + h * (0.004 + rng() * 0.05), s, v * (0.35 + rng() * 0.55));
  }
}

/* Clustered x positions with an irregular gap rhythm. Even spacing plus jitter still reads as a
 * barcode; three clumps with real holes between them reads as a wood. */
function clusterX(rng, w, count, clusters, spread) {
  const xs = [];
  const cn = Math.max(1, clusters);
  const centres = [];
  for (let i = 0; i < cn; i++) centres.push(((i + 0.5) / cn + (rng() - 0.5) * 0.34 / cn) * w);
  for (let i = 0; i < count; i++) {
    const c = centres[(i * 7 + ((rng() * cn) | 0)) % cn];
    const t = rng() - 0.5;
    // cubed so members bunch at the cluster core and a few stray out
    xs.push(c + t * Math.abs(t) * 2 * (w / cn) * spread);
  }
  return xs.map((x) => ((x % w) + w) % w).sort((a, b) => a - b);
}

/* Paints a band of forest. rect maps this canvas onto world space.
 * The band paints its OWN soil, so trunks are grounded by construction rather than by hoping two
 * separately-positioned sheets line up. `groundY` is the fraction of the sheet the ground line
 * sits at; everything below it is bank. */
export function paintTrees(w, h, opt = {}) {
  const o = {
    seed: 1, count: 14, value: 0.5, groundY: 0.74, hMin: 0.45, hMax: 0.95,
    density: 1, foliageScale: 1, jitter: 1, mottle: 1, spread: 0.72,
    clusters: 3, bank: 1, tiers: [0.34, 0.66, 1.0], ...opt,
  };
  const { c, g } = makeCanvas(w, h);
  const rng = makeRng(o.seed);
  const baseY = h * o.groundY;

  const xs = clusterX(rng, w, o.count, o.clusters, 1.05);

  // three contrast tiers inside the band, drawn back to front, so a "far" band has depth of its own
  const trees = [];
  const order = [];
  for (let i = 0; i < xs.length; i++) {
    const r = rng();
    order.push({ x: xs[i], tier: r < 0.38 ? 0 : r < 0.72 ? 1 : 2, k: rng(), gauge: 0.5 + rng() * 1.5 });
  }
  order.sort((a, b) => a.tier - b.tier);

  for (const t of order) {
    const tv = o.tiers[t.tier];
    const hs = [0.62, 0.84, 1.0][t.tier];
    const height = h * (o.hMin + t.k * t.k * (o.hMax - o.hMin)) * hs;
    const bare = rng() < (o.bare ?? 0.13);
    const so = {
      ...o, value: o.value * tv, gauge: t.gauge * [0.72, 0.92, 1.15][t.tier],
      lean: (o.lean ?? 1) * (0.6 + rng() * 1.4),
      roots: t.tier > 0,
      foliageScale: (o.foliageScale ?? 1) * [0.8, 0.95, 1.15][t.tier],
    };
    trees.push({
      tier: t.tier,
      ...drawTree(g, rng, t.x, baseY - t.tier * h * 0.012 + rng() * h * 0.014, height,
        bare ? { ...so, foliage: false, spread: (o.spread ?? 0.72) * 1.5 } : so),
    });
  }

  if (o.bank > 0) groundBank(g, rng, w, h, baseY, o, trees);

  if (o.mottle > 0) {
    g.globalCompositeOperation = 'source-atop';
    // vertical light falloff: canopies catch more sky, trunk bases sink into the dark
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, grey(1, 0.07 * o.mottle));
    grd.addColorStop(0.30, grey(1, 0.02 * o.mottle));
    grd.addColorStop(0.62, grey(0, 0.16 * o.mottle));
    grd.addColorStop(1, grey(0, 0.46 * o.mottle));
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    // broken-brush mottling
    for (let i = 0; i < 420; i++) {
      const x = rng() * w, y = rng() * h * 0.95;
      softBlob(g, x, y, w * (0.006 + rng() * 0.030), rng() < 0.4 ? 1 : 0, 0.06 * o.mottle);
    }
    g.globalCompositeOperation = 'source-over';
  }
  return c;
}

/* ── ground ───────────────────────────────────────────────────────────────── */

export function paintGround(w, h, opt = {}) {
  const o = { seed: 7, value: 0.34, topY: 0.42, relief: 0.10, grass: 1, ferns: 1, rocks: 1, scorch: 0, ...opt };
  const { c, g } = makeCanvas(w, h);
  const rng = makeRng(o.seed);

  const yAt = (x) => {
    const u = x / w;
    return h * (o.topY + o.relief * (fbm2(u * 3.1 + o.seed, 4.2, 4) * 0.9 + ridged(u * 7.3, 1.7, 3) * 0.18 - 0.5));
  };

  g.fillStyle = grey(o.value, 1);
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 4) g.lineTo(x, yAt(x));
  g.lineTo(w, h); g.closePath(); g.fill();

  // clods along the lip so the edge is not a clean curve
  for (let i = 0; i < w / 26; i++) {
    const x = rng() * w, y = yAt(x);
    g.fillStyle = grey(o.value * (0.85 + rng() * 0.3), 1);
    organicPath(g, x, y + h * 0.006, h * (0.006 + rng() * 0.016), 0.55, 0, 0.3, rng() * 30, 8);
    g.fill();
  }

  if (o.rocks) {
    for (let i = 0; i < (w / 200) * o.rocks; i++) {
      const x = rng() * w, y = yAt(x) + h * (0.01 + rng() * 0.06);
      const r = h * (0.012 + rng() * 0.035);
      g.fillStyle = grey(o.value * (0.7 + rng() * 0.25), 1);
      g.beginPath();
      const n = 6 + ((rng() * 4) | 0);
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * TAU;
        const rr = r * (0.7 + rng() * 0.55);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.62;
        k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath(); g.fill();
    }
  }

  if (o.grass) {
    const n = ((w / 2.2) * o.grass) | 0;
    for (let i = 0; i < n; i++) {
      // clumped, and at three distinct gauges — one tuft sprite at one scale is the tell
      const x = (rng() * w + Math.sin(rng() * TAU) * w * 0.01) % w;
      const y = yAt(x) + h * 0.004 + rng() * h * 0.05;
      const r = rng();
      const gauge = r < 0.55 ? 0.55 : r < 0.87 ? 1.15 : 2.1;
      const len = h * (0.012 + rng() * 0.045) * gauge * (o.grassScale ?? 1);
      const bend = (rng() - 0.5) * 1.5;
      g.strokeStyle = grey(o.value * (0.5 + rng() * 0.4), 0.9);
      g.lineWidth = Math.max(0.7, h * 0.0016 * (0.6 + rng()));
      g.beginPath();
      g.moveTo(x, y);
      g.quadraticCurveTo(x + bend * len * 0.4, y - len * 0.6, x + bend * len, y - len);
      g.stroke();
    }
  }

  if (o.ferns) {
    // clumped, at three gauges. Evenly-spaced ferns at one size are a hedge, not undergrowth.
    const clumps = ((w / 320) * o.ferns) | 0;
    const spots = [];
    for (let k = 0; k < clumps; k++) {
      const cx = rng() * w;
      const n = 1 + ((rng() * 4) | 0);
      for (let i = 0; i < n; i++) spots.push(cx + (rng() - 0.5) * w * 0.035);
    }
    for (const sx of spots) {
      const x = ((sx % w) + w) % w;
      const y = yAt(x) + h * 0.01 + rng() * h * 0.04;
      const r = rng();
      const s = h * (r < 0.5 ? 0.045 + rng() * 0.035 : r < 0.85 ? 0.09 + rng() * 0.05 : 0.16 + rng() * 0.08);
      const fronds = 3 + ((rng() * 3) | 0);
      g.fillStyle = grey(o.value * (0.42 + rng() * 0.22), 1);
      for (let f = 0; f < fronds; f++) {
        const a = -Math.PI / 2 + (f - (fronds - 1) / 2) * 0.55 + (rng() - 0.5) * 0.16;
        const [ex, ey] = [x, y];
        let px = ex, py = ey, pa = a;
        const segs = 7;
        for (let k = 0; k < segs; k++) {
          const t = k / segs;
          const l = s * 0.18 * (1 - t * 0.4);
          const wdt = s * 0.055 * (1 - t);
          const r = limb(g, px, py, pa, l, wdt * 2, wdt, 0.16 * Math.sign(a + 0.001));
          px = r[0]; py = r[1]; pa = r[2];
          // leaflets
          for (const sgn of [-1, 1]) {
            g.save(); g.translate(px, py); g.rotate(pa + sgn * 1.15);
            g.beginPath(); g.ellipse(s * 0.07, 0, s * 0.10 * (1 - t * 0.55), s * 0.038, 0, 0, TAU); g.fill();
            g.restore();
          }
        }
      }
    }
  }

  if (o.scorch > 0) {
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 260; i++) {
      const x = rng() * w, y = yAt(x) + rng() * h * 0.4;
      softBlob(g, x, y, w * (0.01 + rng() * 0.06), 0, 0.16 * o.scorch);
    }
    g.globalCompositeOperation = 'source-over';
  }

  g.globalCompositeOperation = 'source-atop';
  const grd = g.createLinearGradient(0, h * o.topY - h * 0.05, 0, h);
  grd.addColorStop(0, grey(1, 0.22));
  grd.addColorStop(0.3, grey(0, 0.10));
  grd.addColorStop(1, grey(0, 0.55));
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  return c;
}

/* ── canopy occluder (top of frame) ───────────────────────────────────────── */

export function paintCanopy(w, h, opt = {}) {
  const o = { seed: 21, value: 0.12, drop: 0.30, ...opt };
  const { c, g } = makeCanvas(w, h);
  const rng = makeRng(o.seed);
  g.fillStyle = grey(o.value, 1);
  for (let i = 0; i < w / 40; i++) {
    const x = rng() * w;
    const y = h * (o.drop * (0.25 + rng() * 0.9)) - h * 0.05;
    foliageMass(g, x, y, h * (0.10 + rng() * 0.17), rng, o.value, 0.9);
  }
  g.fillRect(0, 0, w, h * o.drop * 0.22);
  // a few hanging vines
  for (let i = 0; i < w / 150; i++) {
    const x = rng() * w;
    let px = x, py = h * o.drop * 0.2, pa = Math.PI / 2 + (rng() - 0.5) * 0.4;
    for (let k = 0; k < 9; k++) {
      const r = limb(g, px, py, pa, h * 0.05, Math.max(1.2, h * 0.004 * (1 - k / 9)), h * 0.0025, (rng() - 0.5) * 0.4);
      px = r[0]; py = r[1]; pa = r[2];
      if (rng() < 0.5) { g.save(); g.translate(px, py); g.rotate(rng() * TAU); g.beginPath(); g.ellipse(0, 0, h * 0.012, h * 0.005, 0, 0, TAU); g.fill(); g.restore(); }
    }
  }
  return c;
}

/* ── foreground band (bottom of frame) ────────────────────────────────────────
 * A near-black bank of undergrowth cropped by the bottom edge. This is the layer every vertical
 * run in the picture disappears behind, and it is what stops the lower fifth being dead black.
 * `lip` is the fraction of the sheet its top edge sits at. */
export function paintFgBand(w, h, opt = {}) {
  const o = { seed: 41, value: 0.09, lip: 0.30, ...opt };
  const { c, g } = makeCanvas(w, h);
  const rng = makeRng(o.seed);
  const v = o.value;
  // Mounds with real gaps between them, not a continuous fence. Amplitude is deliberately modest:
  // this band crops the bottom of the frame, and a clump that rises 30% of the sheet swallows the
  // character standing behind it. The mounds gather off-centre so the middle stays open.
  const mounds = [];
  for (let i = 0; i < 9; i++) {
    mounds.push([(i + 0.5) / 9 * w + (fbm2(i * 3.7 + o.seed, 1.3, 3) - 0.5) * w * 0.09,
      w * (0.030 + fbm2(i * 1.9, 5.1, 3) * 0.055),
      h * (0.03 + fbm2(i * 2.3 + 9, 2.2, 3) * 0.20)]);
  }
  const lipY = (x) => {
    let d = 0;
    for (const [mx, mw, mh] of mounds) d -= mh * Math.exp(-((x - mx) / mw) * ((x - mx) / mw));
    return h * o.lip + d
      + (fbm2(x * 0.0016 + o.seed, 5.5, 4) - 0.5) * h * 0.055
      + (fbm2(x * 0.008, 2.7, 3) - 0.5) * h * 0.028;
  };

  // the mass
  g.fillStyle = grey(v, 1);
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= w; x += 5) g.lineTo(x, lipY(x));
  g.lineTo(w, h); g.closePath(); g.fill();

  // bramble arcs springing out of it
  g.strokeStyle = grey(v * 1.15, 1);
  for (let i = 0; i < w / 150; i++) {
    const x = rng() * w, y = lipY(x);
    const s = h * (0.05 + rng() * 0.09);
    const dir = rng() < 0.5 ? -1 : 1;
    g.lineWidth = Math.max(1.2, s * 0.045);
    g.beginPath();
    g.moveTo(x, y + h * 0.05);
    g.quadraticCurveTo(x + dir * s * 0.35, y - s * 0.9, x + dir * s * 1.25, y - s * 0.45);
    g.stroke();
    for (let k = 0; k < 5; k++) {
      const t = 0.25 + k * 0.16;
      const px = x + dir * s * (0.35 * 2 * t * (1 - t) + 1.25 * t * t);
      const py = y + h * 0.05 + (-s * 0.9 - h * 0.05) * 2 * t * (1 - t) + (-s * 0.45 - h * 0.05 + h * 0.05) * t * t;
      g.save(); g.translate(px, py); g.rotate(rng() * TAU);
      g.beginPath(); g.ellipse(0, 0, s * 0.10, s * 0.035, 0, 0, TAU); g.fill();
      g.restore();
    }
  }

  // fern clumps at three scales
  for (let i = 0; i < w / 80; i++) {
    const x = rng() * w, r = rng();
    const s = h * (r < 0.5 ? 0.035 + rng() * 0.030 : r < 0.85 ? 0.070 + rng() * 0.035 : 0.115 + rng() * 0.045);
    const y = lipY(x) + h * (0.03 + rng() * 0.16);
    const fronds = 3 + ((rng() * 4) | 0);
    g.fillStyle = grey(v * (0.85 + rng() * 0.5), 1);
    for (let f = 0; f < fronds; f++) {
      const a = -Math.PI / 2 + (f - (fronds - 1) / 2) * 0.48 + (rng() - 0.5) * 0.2;
      let px = x, py = y, pa = a;
      for (let k = 0; k < 7; k++) {
        const t = k / 7;
        const rr = limb(g, px, py, pa, s * 0.17 * (1 - t * 0.35), s * 0.055 * (1 - t) * 2, s * 0.055 * (1 - t), 0.15 * Math.sign(a + 1e-3));
        px = rr[0]; py = rr[1]; pa = rr[2];
        for (const sgn of [-1, 1]) {
          g.save(); g.translate(px, py); g.rotate(pa + sgn * 1.1);
          g.beginPath(); g.ellipse(s * 0.06, 0, s * 0.09 * (1 - t * 0.5), s * 0.033, 0, 0, TAU); g.fill();
          g.restore();
        }
      }
    }
  }

  // blades, three gauges
  for (let i = 0; i < w / 11; i++) {
    const x = rng() * w, r = rng();
    const s = h * (r < 0.55 ? 0.022 + rng() * 0.022 : r < 0.87 ? 0.048 + rng() * 0.032 : 0.085 + rng() * 0.040);
    const y = lipY(x) + h * (0.01 + rng() * 0.22);
    const b = (rng() - 0.5) * 1.6;
    g.strokeStyle = grey(v * (0.8 + rng() * 0.7), 1);
    g.lineWidth = Math.max(1, s * 0.09);
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + b * s * 0.35, y - s * 0.6, x + b * s, y - s);
    g.stroke();
  }

  // two heavy roots entering from the sides and cropping the corners
  g.fillStyle = grey(v * 0.7, 1);
  for (const [sx, sgn] of [[w * 0.06, 1], [w * 0.94, -1]]) {
    let px = sx, py = h * (o.lip + 0.55), pa = sgn > 0 ? 0.42 : Math.PI - 0.42;
    for (let k = 0; k < 8; k++) {
      const rr = limb(g, px, py, pa, w * 0.035, h * 0.11 * (1 - k / 10), h * 0.10 * (1 - (k + 1) / 10), sgn * 0.10);
      px = rr[0]; py = rr[1]; pa = rr[2];
    }
  }
  return c;
}

/* ── Thornmere ────────────────────────────────────────────────────────────── */

// Returns {canvas, emissive, windows:[{x,y,r,warm}]} in canvas pixel coords.
export function paintVillage(w, h, opt = {}) {
  const o = { seed: 3, value: 0.30, groundY: 0.80, ...opt };
  const { c, g } = makeCanvas(w, h);
  const em = makeCanvas(w, h);
  const rng = makeRng(o.seed);
  const gy = h * o.groundY;
  const windows = [];

  const house = (x, wd, ht, v, smith) => {
    const hgt = ht;
    const wallTop = gy - hgt * 0.52;      // low walls, tall steep roof: this is what says "medieval"
    const peak = gy - hgt * 1.45;
    const eave = wd * 0.62;

    // walls
    g.fillStyle = grey(v, 1);
    g.beginPath();
    g.moveTo(x - wd / 2 + rng() * 3, gy);
    g.lineTo(x - wd / 2 - wd * 0.03, wallTop);
    g.lineTo(x + wd / 2 + wd * 0.03, wallTop);
    g.lineTo(x + wd / 2 - rng() * 3, gy);
    g.closePath(); g.fill();

    // timber frame: uprights and a cross brace, in a darker value
    g.fillStyle = grey(v * 0.55, 1);
    for (let i = 0; i <= 3; i++) {
      const px = x - wd * 0.42 + (i / 3) * wd * 0.84;
      g.fillRect(px - wd * 0.016, wallTop, wd * 0.032, gy - wallTop);
    }
    g.fillRect(x - wd / 2, wallTop + (gy - wallTop) * 0.45, wd, wd * 0.026);
    g.save();
    g.translate(x, wallTop + (gy - wallTop) * 0.5);
    g.rotate(0.62);
    g.fillRect(-wd * 0.012, -(gy - wallTop) * 0.42, wd * 0.024, (gy - wallTop) * 0.84);
    g.restore();

    // thatch: a steep sagging roof with a heavy overhang and a ridge
    g.fillStyle = grey(v * 0.72, 1);
    g.beginPath();
    g.moveTo(x - eave, wallTop + hgt * 0.06);
    g.quadraticCurveTo(x - eave * 0.42, wallTop - hgt * 0.42, x - wd * 0.03, peak);
    g.lineTo(x + wd * 0.03, peak);
    g.quadraticCurveTo(x + eave * 0.42, wallTop - hgt * 0.42, x + eave, wallTop + hgt * 0.06);
    g.quadraticCurveTo(x, wallTop + hgt * 0.20, x - eave, wallTop + hgt * 0.06);
    g.closePath(); g.fill();
    // ridge cap
    g.fillStyle = grey(v * 0.52, 1);
    g.beginPath();
    g.ellipse(x, peak + hgt * 0.03, wd * 0.10, hgt * 0.045, 0, 0, TAU);
    g.fill();
    // thatch combing
    g.strokeStyle = grey(v * 0.42, 0.55);
    g.lineWidth = Math.max(0.9, h * 0.002);
    for (let i = 0; i < wd / 6; i++) {
      const t = rng();
      const sx = x - eave * 0.96 + t * eave * 1.92;
      const k = 1 - Math.abs(t - 0.5) * 2;
      const ty = wallTop + hgt * 0.06 - k * hgt * 0.55 + rng() * hgt * 0.10;
      g.beginPath();
      g.moveTo(sx, ty);
      g.lineTo(sx + (x - sx) * 0.10, ty + hgt * 0.16);
      g.stroke();
    }

    // chimney, tall and slightly crooked
    const cx = x + wd * (rng() < 0.5 ? -0.24 : 0.26);
    g.fillStyle = grey(v * 0.62, 1);
    g.save();
    g.translate(cx, gy);
    g.rotate((rng() - 0.5) * 0.05);
    g.fillRect(-wd * 0.05, -(hgt * 1.72), wd * 0.10, hgt * 1.72);
    g.fillRect(-wd * 0.068, -(hgt * 1.75), wd * 0.136, hgt * 0.09);
    g.restore();

    // a door, punched black
    if (!smith) {
      g.fillStyle = grey(v * 0.30, 1);
      const dw = wd * 0.16;
      g.beginPath();
      g.moveTo(x - dw / 2, gy);
      g.lineTo(x - dw / 2, wallTop + (gy - wallTop) * 0.30);
      g.quadraticCurveTo(x, wallTop + (gy - wallTop) * 0.08, x + dw / 2, wallTop + (gy - wallTop) * 0.30);
      g.lineTo(x + dw / 2, gy);
      g.closePath(); g.fill();
    }

    // windows — emissive
    const nW = smith ? 1 : 1 + ((rng() * 2) | 0);
    for (let i = 0; i < nW; i++) {
      const wx = x + (i - (nW - 1) / 2) * wd * 0.36 + (rng() - 0.5) * wd * 0.05
        + (nW === 1 ? wd * 0.24 * (rng() < 0.5 ? -1 : 1) : 0);
      const wy = wallTop + (gy - wallTop) * (smith ? 0.28 : 0.22);
      const ww = wd * (smith ? 0.40 : 0.13);
      const wh = (gy - wallTop) * (smith ? 0.55 : 0.34);
      const eg = em.g;
      const hr = ww * 1.7;
      const grd = eg.createRadialGradient(wx, wy + wh / 2, 0, wx, wy + wh / 2, hr);
      grd.addColorStop(0, 'rgba(255,255,255,0.55)');
      grd.addColorStop(0.35, 'rgba(255,255,255,0.16)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      eg.fillStyle = grd;
      eg.fillRect(wx - hr, wy + wh / 2 - hr, hr * 2, hr * 2);
      eg.fillStyle = 'rgba(255,255,255,1)';
      if (smith) {
        // the forge mouth: an arch, brighter and lower
        eg.beginPath();
        eg.moveTo(wx - ww / 2, wy + wh);
        eg.lineTo(wx - ww / 2, wy + wh * 0.4);
        eg.quadraticCurveTo(wx, wy - wh * 0.1, wx + ww / 2, wy + wh * 0.4);
        eg.lineTo(wx + ww / 2, wy + wh);
        eg.closePath(); eg.fill();
      } else {
        eg.fillRect(wx - ww / 2, wy, ww, wh);
        eg.globalCompositeOperation = 'destination-out';
        eg.fillStyle = 'rgba(0,0,0,1)';
        eg.fillRect(wx - ww * 0.04, wy, ww * 0.08, wh);
        eg.fillRect(wx - ww / 2, wy + wh * 0.46, ww, wh * 0.08);
        eg.globalCompositeOperation = 'source-over';
      }
      windows.push({ x: wx, y: wy + wh / 2, r: ww * 3.5, warm: smith ? 1.35 : 1 });
      g.save();
      g.globalCompositeOperation = 'destination-out';
      if (smith) {
        g.beginPath();
        g.moveTo(wx - ww / 2, wy + wh);
        g.lineTo(wx - ww / 2, wy + wh * 0.4);
        g.quadraticCurveTo(wx, wy - wh * 0.1, wx + ww / 2, wy + wh * 0.4);
        g.lineTo(wx + ww / 2, wy + wh);
        g.closePath(); g.fill();
      } else g.fillRect(wx - ww / 2, wy, ww, wh);
      g.restore();
    }
    return { cx, top: gy - hgt * 1.72 };
  };

  // a back row up the slope, then the smithy and the near cottages
  const back = [];
  for (let i = 0; i < 4; i++) {
    back.push(house(w * (0.08 + i * 0.115) + (rng() - 0.5) * w * 0.02, w * 0.052, h * 0.30, o.value * 0.72));
  }
  const smithy = house(w * 0.60, w * 0.115, h * 0.50, o.value, true);
  const chimneys = [smithy, ...back];
  for (const [cxr, wr, hr] of [[0.34, 0.085, 0.40], [0.46, 0.070, 0.34], [0.78, 0.090, 0.42], [0.90, 0.072, 0.36]]) {
    chimneys.push(house(w * cxr, w * wr, h * hr, o.value * (0.88 + rng() * 0.2)));
  }

  // a dry-stone boundary wall with gaps, and two gateposts
  g.fillStyle = grey(o.value * 0.55, 1);
  for (let x = 0; x < w; x += w * 0.004) {
    if (fbm2(x * 0.0016, 11, 3) < 0.42) continue;
    const ph = h * (0.035 + fbm2(x * 0.006, 3, 3) * 0.030);
    g.beginPath();
    g.ellipse(x, gy + h * 0.055 - ph * 0.5, w * 0.0045, ph * 0.55, 0, 0, TAU);
    g.fill();
  }
  for (const px of [w * 0.20, w * 0.245]) {
    g.fillStyle = grey(o.value * 0.42, 1);
    g.fillRect(px - w * 0.006, gy + h * 0.055 - h * 0.115, w * 0.012, h * 0.115);
    g.beginPath(); g.ellipse(px, gy + h * 0.055 - h * 0.118, w * 0.011, h * 0.012, 0, 0, TAU); g.fill();
  }

  // a well, because a village silhouette needs one thing that is not a roof
  {
    const wx = w * 0.705, wy = gy + h * 0.05;
    g.fillStyle = grey(o.value * 0.60, 1);
    g.beginPath(); g.ellipse(wx, wy, w * 0.020, h * 0.030, 0, Math.PI, 0); g.fill();
    g.fillRect(wx - w * 0.020, wy - h * 0.030, w * 0.040, h * 0.030);
    g.fillStyle = grey(o.value * 0.45, 1);
    g.fillRect(wx - w * 0.022, wy - h * 0.055, w * 0.005, h * 0.055);
    g.fillRect(wx + w * 0.017, wy - h * 0.055, w * 0.005, h * 0.055);
    g.beginPath();
    g.moveTo(wx - w * 0.032, wy - h * 0.052);
    g.lineTo(wx, wy - h * 0.085);
    g.lineTo(wx + w * 0.032, wy - h * 0.052);
    g.lineTo(wx, wy - h * 0.066);
    g.closePath(); g.fill();
  }

  return { canvas: c, emissive: em.c, windows, chimneys: chimneys.map((k) => ({ x: k.cx, y: k.top })) };
}

/* ── the scorched clearing ────────────────────────────────────────────────── */

export function paintClearingFloor(w, h, opt = {}) {
  const o = { seed: 11, value: 0.22, ...opt };
  const { c, g } = makeCanvas(w, h);
  const rng = makeRng(o.seed);
  const gy = h * 0.34;

  g.fillStyle = grey(o.value, 1);
  g.beginPath(); g.moveTo(0, h);
  for (let x = 0; x <= w; x += 5) g.lineTo(x, gy + Math.sin(x * 0.004 + 1) * h * 0.012 + fbm2(x * 0.003, 9, 3) * h * 0.03);
  g.lineTo(w, h); g.closePath(); g.fill();

  // blast radiating out from centre: ash streaks
  g.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 700; i++) {
    const a = (rng() - 0.5) * 0.9;
    const d = rng() * w * 0.5;
    const x = w * 0.5 + Math.sin(a) * d * 2.2;
    const y = gy + h * 0.03 + Math.abs(Math.cos(a)) * d * 0.35 * (0.4 + rng());
    g.strokeStyle = grey(rng() < 0.6 ? 0 : 1, 0.10 + rng() * 0.12);
    g.lineWidth = 1 + rng() * 3.5;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (x - w * 0.5) * 0.06, y + (y - gy) * 0.05);
    g.stroke();
  }
  g.globalCompositeOperation = 'source-over';

  // burnt stumps and fallen, snapped trunks pointing away from the centre
  for (let i = 0; i < 12; i++) {
    const side = i % 2 ? 1 : -1;
    const x = w * 0.5 + side * (w * 0.1 + rng() * w * 0.42);
    const y = gy + h * (0.03 + rng() * 0.22);
    const hh = h * (0.06 + rng() * 0.14);
    g.fillStyle = grey(o.value * (0.5 + rng() * 0.3), 1);
    limb(g, x, y, -Math.PI / 2 + side * (0.15 + rng() * 0.5), hh, hh * 0.24, hh * 0.10, side * 0.3);
    // splintered break
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const px = x + (rng() - 0.5) * hh * 0.3;
      g.moveTo(px, y - hh * 0.9);
      g.lineTo(px + (rng() - 0.5) * hh * 0.1, y - hh * (1.0 + rng() * 0.25));
      g.lineTo(px + hh * 0.03, y - hh * 0.9);
    }
    g.closePath(); g.fill();
  }

  g.globalCompositeOperation = 'source-atop';
  const grd = g.createLinearGradient(0, gy, 0, h);
  grd.addColorStop(0, grey(1, 0.14));
  grd.addColorStop(1, grey(0, 0.6));
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'source-over';
  return c;
}

/* The burnt glyph Vayne is dying inside. Painted flat, projected in the shader. */
export function paintGlyph(size) {
  const { c, g } = makeCanvas(size, size);
  const rng = makeRng(99);
  const R = size * 0.46;
  const cx = size / 2, cy = size / 2;

  g.lineCap = 'round';
  const ring = (r, lw, a) => {
    g.strokeStyle = `rgba(255,255,255,${a})`;
    g.lineWidth = lw;
    g.beginPath();
    for (let i = 0; i <= 160; i++) {
      const t = (i / 160) * TAU;
      const rr = r * (1 + fbm2(Math.cos(t) * 3 + r * 0.01, Math.sin(t) * 3, 3) * 0.035);
      const x = cx + Math.cos(t) * rr, y = cy + Math.sin(t) * rr;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath(); g.stroke();
  };
  ring(R, size * 0.010, 0.95);
  ring(R * 0.93, size * 0.004, 0.6);
  ring(R * 0.60, size * 0.006, 0.8);
  ring(R * 0.24, size * 0.005, 0.7);

  // spokes and runic ticks
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU + 0.13;
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = size * 0.004;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R * 0.60, cy + Math.sin(a) * R * 0.60);
    g.lineTo(cx + Math.cos(a) * R * 0.93, cy + Math.sin(a) * R * 0.93);
    g.stroke();
    // glyph marks between the rings
    const gx = cx + Math.cos(a) * R * 0.76, gy2 = cy + Math.sin(a) * R * 0.76;
    g.save(); g.translate(gx, gy2); g.rotate(a + Math.PI / 2);
    g.lineWidth = size * 0.0055;
    g.beginPath();
    const marks = 3 + ((rng() * 3) | 0);
    for (let k = 0; k < marks; k++) {
      const px = (k - (marks - 1) / 2) * size * 0.016;
      g.moveTo(px, -size * 0.020 * (0.5 + rng()));
      g.lineTo(px + (rng() - 0.5) * size * 0.012, size * 0.020 * (0.5 + rng()));
    }
    g.stroke();
    g.restore();
  }

  // inner sigil — two counter-rotated triangles, broken where the ward failed
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = size * 0.007;
  for (const off of [0, Math.PI / 3]) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = off + (i / 3) * TAU - Math.PI / 2;
      const x = cx + Math.cos(a) * R * 0.46, y = cy + Math.sin(a) * R * 0.46;
      i === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = size * 0.004;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * R * 0.24, cy + Math.sin(a) * R * 0.24);
    g.lineTo(cx + Math.cos(a) * R * (0.30 + rng() * 0.07), cy + Math.sin(a) * R * (0.30 + rng() * 0.07));
    g.stroke();
  }

  // burn it: erase chunks so it reads as scorched and failing
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 90; i++) {
    const a = rng() * TAU, d = rng() * R;
    softBlob(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, size * (0.006 + rng() * 0.03), 1, 0.5 + rng() * 0.5);
  }
  g.globalCompositeOperation = 'source-over';
  return c;
}

/* ── one soft round particle sprite ───────────────────────────────────────── */

export function paintSpark(size = 64) {
  const { c, g } = makeCanvas(size, size);
  const r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0.0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.18, 'rgba(255,255,255,0.72)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.20)');
  grd.addColorStop(1.0, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

/* ── title lettering, sampled by the particle system ──────────────────────── */

export const TITLE_FONT = `'Cinzel','Trajan Pro','Optima','Palatino Linotype','Book Antiqua',Georgia,'Times New Roman',serif`;

export function paintTitle(w, h, text = 'SUNDERFALL', opt = {}) {
  const { c, g } = makeCanvas(w, h);
  const chars = [...text];
  const trackK = opt.track ?? 0.14;
  const measure = (px) => {
    g.font = `700 ${px}px ${TITLE_FONT}`;
    let total = 0;
    for (const ch of chars) total += g.measureText(ch).width + px * trackK;
    return total - px * trackK;
  };
  // fit to the canvas rather than guessing — an overflowing glyph gets sliced off
  let px = opt.size ?? h * 0.62;
  const target = w * 0.90;
  for (let i = 0; i < 6; i++) {
    const t = measure(px);
    if (Math.abs(t - target) < 2) break;
    px *= target / t;
  }
  px = Math.min(px, h * 0.78);
  const total = measure(px);

  g.textAlign = 'left';
  g.textBaseline = 'middle';
  const grd = g.createLinearGradient(0, h / 2 - px * 0.55, 0, h / 2 + px * 0.55);
  grd.addColorStop(0, '#ffffff');
  grd.addColorStop(0.45, '#fff0d2');
  grd.addColorStop(1, '#ffb063');
  g.fillStyle = grd;

  let x = w / 2 - total / 2;
  const track = px * trackK;
  for (const ch of chars) {
    const cw = g.measureText(ch).width;
    g.fillText(ch, x, h / 2);
    x += cw + track;
  }
  return c;
}

// Pick N points inside the opaque parts of a mask canvas. Returns Float32Array [x,y,...] in 0..1.
export function samplePoints(canvas, n, rngSeed = 5) {
  const g = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const data = g.getImageData(0, 0, w, h).data;
  const rng = makeRng(rngSeed);
  const out = new Float32Array(n * 2);
  let got = 0, guard = 0;
  while (got < n && guard++ < n * 200) {
    const x = (rng() * w) | 0, y = (rng() * h) | 0;
    if (data[(y * w + x) * 4 + 3] > 140) {
      out[got * 2] = x / w; out[got * 2 + 1] = y / h; got++;
    }
  }
  for (let i = got; i < n; i++) { out[i * 2] = out[(i % Math.max(1, got)) * 2]; out[i * 2 + 1] = out[(i % Math.max(1, got)) * 2 + 1]; }
  return out;
}

export { softBlob, organicPath, limb, foliageMass, grey };
