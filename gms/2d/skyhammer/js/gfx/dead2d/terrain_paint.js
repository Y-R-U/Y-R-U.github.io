// ============================================================================
// DEAD CODE — Canvas-2D renderer, superseded by the Three.js 2.5D renderer
// (CONTRACTS §14, DECISIONS D12-D16). NOTHING LIVE IMPORTS THIS FILE.
// Kept only because the procedural CLOUD and SKY bakes transfer to 3D as
// textures on planes at negative z. See docs/ART_NOTES.md before reusing.
// Palettes moved on and were restructured: these modules expect the OLD flat
// palette shape (pal.cloudTop, pal.earth, ...), not the current js/gfx/palette.js.
// ============================================================================
// Ground: far mountain band, mid hills + treeline, the near earth band, and water.
// The earth band is near-silhouette with a warm rim from the horizon side (ART.md §1).
//
// NOTE ON CHUNKING (deviation from ART.md §5, recorded in ART_NOTES.md): the surface is drawn as
// a live path rather than blitted from cached strips, because the screen-space horizon curve
// cannot be baked into a world-space bitmap without stair-stepping. What IS cached per 512-unit
// chunk is the expensive part — the scatter list of surface props — plus a baked earth texture
// pattern and baked detail sprites. Same cost profile, exact curve.

import { makeCanvas, ctx2d, rng, noiseAlphaTile, rgba, mix, shade } from './bake.js';
import { registerBaker, getPlate } from './plates.js';

const CHUNK = 512;
const TILE_W = 1600;

function ridge(x, oct) {
  let v = 0, amp = 1, tot = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    v += Math.sin(x * f * 6.2832 + i * 2.3) * amp;
    tot += amp; amp *= 0.55; f *= 2.13;
  }
  return v / tot;
}

function bakeMountains(pal, seed, h, snow) {
  const c = makeCanvas(TILE_W, h), g = ctx2d(c);
  const R = rng(seed);
  const layers = [
    { k: 0.30, amp: 0.52, base: 0.86, oct: 4 },
    { k: 0.55, amp: 0.72, base: 0.98, oct: 5 },
  ];
  for (const L of layers) {
    const col = mix(pal.far, pal.haze, 1 - L.k);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, h);
    const ph = R.f() * 10;
    for (let x = 0; x <= TILE_W; x += 6) {
      const u = x / TILE_W;
      const n = (ridge(u + ph, L.oct) * 0.5 + 0.5);
      const peak = Math.pow(n, 1.5);
      g.lineTo(x, h * L.base - peak * h * L.amp);
    }
    g.lineTo(TILE_W, h);
    g.closePath();
    g.fill();

    if (snow) {
      g.save();
      g.clip();
      g.fillStyle = rgba(pal.snow || '#eef2f4', 0.5 * L.k + 0.18);
      g.beginPath();
      g.moveTo(0, 0);
      for (let x = 0; x <= TILE_W; x += 6) {
        const u = x / TILE_W;
        const n = (ridge(u + ph, L.oct) * 0.5 + 0.5);
        const peak = Math.pow(n, 1.5);
        g.lineTo(x, h * L.base - peak * h * L.amp + h * 0.055 + Math.sin(x * 0.09) * h * 0.012);
      }
      g.lineTo(TILE_W, 0);
      g.closePath();
      g.fill();
      g.restore();
    }
  }
  // haze toward the sky at the top of the band
  const hz = g.createLinearGradient(0, 0, 0, h);
  hz.addColorStop(0, rgba(pal.haze, pal.hazeK));
  hz.addColorStop(0.55, rgba(pal.haze, pal.hazeK * 0.35));
  hz.addColorStop(1, rgba(pal.haze, 0));
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = hz;
  g.fillRect(0, 0, TILE_W, h);
  g.globalCompositeOperation = 'source-over';
  return c;
}

function bakeHills(pal, seed, h, conifer) {
  const c = makeCanvas(TILE_W, h), g = ctx2d(c);
  const R = rng(seed);
  const ph = R.f() * 10;
  const top = (x) => {
    const u = x / TILE_W;
    return h * 0.55 - (ridge(u + ph, 4) * 0.5 + 0.5) * h * 0.34;
  };
  g.fillStyle = pal.mid;
  g.beginPath();
  g.moveTo(0, h);
  for (let x = 0; x <= TILE_W; x += 6) g.lineTo(x, top(x));
  g.lineTo(TILE_W, h);
  g.closePath();
  g.fill();

  // treeline breaking the crest
  g.fillStyle = pal.treeline;
  for (let x = 0; x < TILE_W; x += 5) {
    const y = top(x);
    const th = (R.f() * 0.55 + 0.45) * h * 0.075;
    const w = th * (conifer ? 0.5 : 0.78);
    g.beginPath();
    if (conifer) {
      g.moveTo(x, y + 2); g.lineTo(x - w, y + th * 0.7); g.lineTo(x + w, y + th * 0.7);
    } else {
      g.moveTo(x - w, y + th * 0.6);
      g.quadraticCurveTo(x - w, y - th * 0.35, x, y - th * 0.45);
      g.quadraticCurveTo(x + w, y - th * 0.35, x + w, y + th * 0.6);
    }
    g.closePath(); g.fill();
  }
  const hz = g.createLinearGradient(0, 0, 0, h);
  hz.addColorStop(0, rgba(pal.haze, pal.hazeK * 0.55));
  hz.addColorStop(0.7, rgba(pal.haze, 0));
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = hz;
  g.fillRect(0, 0, TILE_W, h);
  g.globalCompositeOperation = 'source-over';
  return c;
}

registerBaker('mountains', (pal, k, biome) =>
  bakeMountains(pal, 0x7e11, 400, biome === 'alpine' || biome === 'coast'));
registerBaker('hills', (pal, k, biome) => bakeHills(pal, 0x7e11 + 7, 260, biome === 'alpine'));

// A tileable surface texture laid over the water gradient at low alpha. Seamless on BOTH axes.
registerBaker('water', (pal) => {
  const S = 512;
  const c = makeCanvas(S, S), g = ctx2d(c);
  const w = pal.water || { foam: '#ffffff', deep: '#204050' };
  g.clearRect(0, 0, S, S);
  const R = rng(0x5ea);
  g.lineCap = 'round';
  for (let i = 0; i < 140; i++) {
    const y = R.f() * S, x = R.f() * S, len = R.range(10, 60);
    g.strokeStyle = rgba(R.f() < 0.5 ? w.foam : w.deep, R.range(0.03, 0.10));
    g.lineWidth = R.range(0.8, 2.2);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + R.range(-1.5, 1.5)); g.stroke();
    if (x + len > S) { g.beginPath(); g.moveTo(x - S, y); g.lineTo(x - S + len, y); g.stroke(); }
  }
  return c;
});

// --- surface detail sprites, baked at 64px reference height ---
const SPR = 64;
function bakeDetail(pal, biome) {
  const dark = pal.treeline, grass = pal.grass, rock = mix(pal.earth, pal.far, 0.22);
  const mk = (fn) => { const c = makeCanvas(SPR, SPR), g = ctx2d(c); fn(g); return c; };
  const conifer = biome === 'alpine';

  const tuft = mk((g) => {
    g.strokeStyle = grass; g.lineWidth = 2.4; g.lineCap = 'round';
    const R = rng(11);
    for (let i = 0; i < 7; i++) {
      const x = SPR * 0.5 + R.range(-13, 13);
      const hh = R.range(14, 30);
      g.beginPath(); g.moveTo(x, SPR);
      g.quadraticCurveTo(x + R.range(-6, 6), SPR - hh * 0.6, x + R.range(-13, 13), SPR - hh);
      g.stroke();
    }
  });
  const rockS = mk((g) => {
    const R = rng(23);
    g.fillStyle = rock;
    g.beginPath(); g.moveTo(6, SPR);
    g.lineTo(R.range(10, 16), SPR - 18); g.lineTo(SPR * 0.5, SPR - 26);
    g.lineTo(SPR - 14, SPR - 15); g.lineTo(SPR - 5, SPR);
    g.closePath(); g.fill();
    g.fillStyle = rgba(pal.earthRim, 0.35);
    g.beginPath(); g.moveTo(SPR * 0.5, SPR - 26); g.lineTo(SPR - 14, SPR - 15); g.lineTo(SPR - 5, SPR);
    g.lineTo(SPR * 0.62, SPR); g.closePath(); g.fill();
  });
  const tree = mk((g) => {
    g.fillStyle = shade(dark, -0.15);
    g.fillRect(SPR * 0.47, SPR - 16, 4, 16);
    g.fillStyle = dark;
    if (conifer) {
      for (let i = 0; i < 3; i++) {
        const y = SPR - 12 - i * 13, w = 19 - i * 5;
        g.beginPath(); g.moveTo(SPR * 0.5, y - 18); g.lineTo(SPR * 0.5 - w, y); g.lineTo(SPR * 0.5 + w, y);
        g.closePath(); g.fill();
      }
    } else {
      g.beginPath(); g.ellipse(SPR * 0.5, SPR - 32, 20, 17, 0, 0, 6.2832); g.fill();
      g.beginPath(); g.ellipse(SPR * 0.36, SPR - 24, 13, 11, 0, 0, 6.2832); g.fill();
      g.beginPath(); g.ellipse(SPR * 0.66, SPR - 25, 12, 10, 0, 0, 6.2832); g.fill();
    }
    g.fillStyle = rgba(pal.earthRim, 0.3);
    g.beginPath(); g.ellipse(SPR * 0.62, SPR - 34, 8, 6, 0, 0, 6.2832); g.fill();
  });
  const bush = mk((g) => {
    g.fillStyle = mix(dark, grass, 0.35);
    g.beginPath(); g.ellipse(SPR * 0.5, SPR - 6, 18, 11, 0, 0, 6.2832); g.fill();
    g.beginPath(); g.ellipse(SPR * 0.38, SPR - 12, 11, 8, 0, 0, 6.2832); g.fill();
    g.beginPath(); g.ellipse(SPR * 0.64, SPR - 11, 10, 7, 0, 0, 6.2832); g.fill();
  });
  const post = mk((g) => {
    g.strokeStyle = shade(dark, 0.12); g.lineWidth = 3;
    g.beginPath(); g.moveTo(SPR * 0.5, SPR); g.lineTo(SPR * 0.5, SPR - 20); g.stroke();
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(0, SPR - 15); g.lineTo(SPR, SPR - 17); g.stroke();
  });
  return [tuft, rockS, tree, bush, post];
}

registerBaker('earthtex', (pal) => bakeEarthTex(pal));

function bakeEarthTex(pal) {
  const S = 128;
  const c = makeCanvas(S, S), g = ctx2d(c);
  g.fillStyle = pal.earth;
  g.fillRect(0, 0, S, S);
  const n = noiseAlphaTile(S, 0x77 ^ (pal.earth.charCodeAt(2) * 31), 4, 1);
  g.globalAlpha = 0.20;
  g.drawImage(n, 0, 0);
  g.globalAlpha = 1;
  return c;
}

export function makeTerrainPainter(seed = 0x7e11) {
  let pal = null, key = '', biome = 'farmland';
  const cache = new Map();
  let art = null;
  const chunks = new Map();
  let chunkSalt = 0;

  function chunkScatter(ci) {
    let s = chunks.get(ci);
    if (s) return s;
    const R = rng((seed ^ (ci * 2654435761)) + chunkSalt);
    s = [];
    const n = 7 + R.int(7);
    for (let i = 0; i < n; i++) {
      const t = R.f();
      const type = t < 0.34 ? 0 : t < 0.5 ? 1 : t < 0.7 ? 2 : t < 0.9 ? 3 : 4;
      s.push({
        x: ci * CHUNK + R.f() * CHUNK,
        type,
        s: R.range(0.7, 1.5) * (type === 2 ? 1.5 : 1),
        flip: R.f() < 0.5,
      });
    }
    s.sort((a, b) => a.s - b.s);
    if (chunks.size > 96) chunks.clear();
    chunks.set(ci, s);
    return s;
  }

  const glints = (() => {
    const R = rng(seed ^ 0x1234);
    const g = [];
    for (let i = 0; i < 90; i++) g.push({ x: R.f() * 4000, d: R.f(), ph: R.f() * 6.28, sp: R.range(0.4, 1.3) });
    return g;
  })();

  return {
    setPalette(p, k, bio) {
      biome = bio || 'farmland';
      if (k === key) return;
      key = k; pal = p;
      const ck = k + '|' + biome;
      if (!cache.has(ck)) cache.set(ck, { detail: bakeDetail(p, biome), pattern: null, waterPat: null });
      art = cache.get(ck);
      chunks.clear();
    },

    reset(salt) { chunkSalt = salt | 0; chunks.clear(); },

    drawFar(ctx, view) {
      const dh = view.H * 0.44;
      const dw = dh * (TILE_W / 400);
      const y = view.bgY(-40, 0.14) - dh;
      let x = ((view.bgOff(0.14) % dw) + dw) % dw - dw;
      const plate = getPlate('mountains', pal, key, biome);
      for (; x < view.W; x += dw) ctx.drawImage(plate, x, y, dw, dh);
    },

    drawMid(ctx, view) {
      const dh = view.H * 0.30;
      const dw = dh * (TILE_W / 260);
      const y = view.bgY(-120, 0.35) - dh;
      let x = ((view.bgOff(0.35) % dw) + dw) % dw - dw;
      const plate = getPlate('hills', pal, key, biome);
      for (; x < view.W; x += dw) ctx.drawImage(plate, x, y, dw, dh);
    },

    /** Near earth band: fill, rim light, scattered detail, water. */
    drawNear(ctx, view, world, t) {
      const terr = world.terrain;
      const W = view.W, H = view.H, sc = view.scale;
      const x0 = view.camX - 40 / sc, x1 = view.camX + W / sc + 40 / sc;
      const stepW = Math.max(4, 5 / sc);
      const pts = [];
      for (let wx = x0; wx <= x1 + stepW; wx += stepW) {
        pts.push([view.sx(wx), view.sy(wx, terr.heightAt(wx))]);
      }

      if (!art.pattern) art.pattern = ctx.createPattern(getPlate('earthtex', pal, key, biome), 'repeat');

      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.lineTo(pts[pts.length - 1][0], H + 40);
      ctx.lineTo(pts[0][0], H + 40);
      ctx.closePath();
      ctx.fillStyle = art.pattern;
      ctx.fill();
      const gd = ctx.createLinearGradient(0, view.syFlat(180), 0, H);
      gd.addColorStop(0, rgba(pal.earth, 0));
      gd.addColorStop(1, rgba(pal.earthDeep, 0.85));
      ctx.fillStyle = gd;
      ctx.fill();

      // warm rim along the crest, from the horizon side
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.strokeStyle = rgba(pal.earthRim, 0.55);
      ctx.lineWidth = Math.max(1.2, view.u(3.2));
      ctx.stroke();
      ctx.strokeStyle = rgba(pal.haze, 0.20);
      ctx.lineWidth = Math.max(2.5, view.u(9));
      ctx.globalCompositeOperation = 'lighter';
      ctx.stroke();
      ctx.restore();

      if (pal.water && world.level && (biome === 'sea' || biome === 'coast')) {
        this.drawWater(ctx, view, world, t);
      }

      // scattered surface detail
      const c0 = Math.floor(x0 / CHUNK), c1 = Math.floor(x1 / CHUNK);
      const det = art.detail;
      for (let ci = c0; ci <= c1; ci++) {
        for (const o of chunkScatter(ci)) {
          const gy = terr.heightAt(o.x);
          if (pal.water && gy <= 2 && (biome === 'sea' || biome === 'coast')) continue;
          const sx = view.sx(o.x);
          if (sx < -60 || sx > W + 60) continue;
          const sy = view.sy(o.x, gy);
          const hpx = view.u(28 * o.s);
          const wpx = hpx;
          ctx.drawImage(det[o.type], sx - wpx * 0.5, sy - hpx + view.u(2), wpx, hpx);
        }
      }
    },

    drawWater(ctx, view, world, t) {
      const w = pal.water, W = view.W, H = view.H;
      const y0 = view.syFlat(0);
      if (y0 > H) return;
      const g = ctx.createLinearGradient(0, y0, 0, H);
      g.addColorStop(0, w.shallow);
      g.addColorStop(0.25, mix(w.shallow, w.deep, 0.55));
      g.addColorStop(1, w.deep);
      ctx.fillStyle = g;
      ctx.fillRect(0, y0, W, H - y0 + 1);

      // horizon reflection band: the sky bloom smeared back onto the water
      const rb = ctx.createLinearGradient(0, y0, 0, y0 + view.u(160));
      rb.addColorStop(0, rgba(pal.bloom, 0.42 * pal.bloomK + 0.1));
      rb.addColorStop(1, rgba(pal.bloom, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = rb;
      ctx.fillRect(0, y0, W, view.u(160));
      ctx.globalCompositeOperation = 'source-over';

      if (!art.waterPat) art.waterPat = ctx.createPattern(getPlate('water', pal, key, biome), 'repeat');
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.translate(-((view.camX * 0.25 * view.scale) % 512), 0);
      ctx.fillStyle = art.waterPat;
      ctx.fillRect(0, y0, W + 512, H - y0 + 1);
      ctx.restore();

      // wave bands
      ctx.strokeStyle = rgba(w.foam, 0.10);
      ctx.lineWidth = 1;
      for (let i = 1; i < 9; i++) {
        const yy = y0 + Math.pow(i / 9, 1.8) * (H - y0);
        ctx.beginPath();
        for (let x = 0; x <= W; x += 24) {
          ctx.lineTo(x, yy + Math.sin(x * 0.02 + t * 0.9 + i) * (1 + i * 0.5));
        }
        ctx.stroke();
      }

      // moving specular glints
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = w.glint;
      const sunPx = pal.sunX * W;
      for (const gl of glints) {
        const yy = y0 + Math.pow(gl.d, 2.1) * (H - y0);
        if (yy > H) continue;
        let x = ((gl.x - view.camX * (0.15 + gl.d * 0.85)) * view.scale) % 4000;
        x = ((x % W) + W) % W;
        const near = 1 - Math.min(1, Math.abs(x - sunPx) / (W * 0.42));
        if (near <= 0) continue;
        const a = (0.10 + 0.55 * near) * (0.4 + 0.6 * Math.abs(Math.sin(t * gl.sp * 2.2 + gl.ph)));
        ctx.globalAlpha = a * 0.7;
        const lw = view.u(10 + gl.d * 40);
        ctx.fillRect(x - lw * 0.5, yy, lw, Math.max(1, view.u(1.6)));
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
  };
}
