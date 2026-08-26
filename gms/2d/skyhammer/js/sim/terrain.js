// Deterministic heightfield: summed sine + value noise. CONTRACTS §11 + §16 (D21).
// Framing is a hard constraint: mean surface ~0, range [TERRAIN.minY, TERRAIN.maxY].
// Tall skylines are a gfx parallax layer, never gameplay terrain.

import { TERRAIN, CAM } from '../data/tuning.js';

// Vertical scale is the LEVEL's declared character (D25); the biome only tilts it
// and supplies roughness, bias and water.
const BIOME = {
  farmland: { amp: 0.95, rough: 0.55, bias: 0.02, water: false },
  coast:    { amp: 1.00, rough: 0.60, bias: -0.18, water: true },
  city:     { amp: 0.55, rough: 0.22, bias: 0.05, water: false },
  sea:      { amp: 0.80, rough: 0.50, bias: -1.60, water: true },
  alpine:   { amp: 1.15, rough: 0.85, bias: 0.10, water: false, peaky: true },
  desert:   { amp: 1.00, rough: 0.70, bias: 0.00, water: false },
};

export function makeTerrain(level, rng) {
  const b = BIOME[level.biome] || BIOME.farmland;
  const N = 512;
  const noise = new Float64Array(N);
  for (let i = 0; i < N; i++) noise[i] = rng.f() * 2 - 1;
  const ph = [rng.f(), rng.f(), rng.f()].map((v) => v * Math.PI * 2);

  const cell = TERRAIN.detailWavelength;
  const k = (Math.PI * 2) / TERRAIN.hillWavelength;
  const prof = TERRAIN.profiles[level.terrainProfile] || TERRAIN.profiles[TERRAIN.defaultProfile];
  const amp = prof.amp * b.amp;
  const up = Math.min(TERRAIN.maxY * amp, TERRAIN.peakY);
  const down = Math.abs(TERRAIN.minY) * Math.min(amp, 1.6);
  // Amplitude alone cannot move the MEAN band: a symmetric signal keeps mean surface at 0
  // whatever its amplitude. The profile's declared band is therefore also what sets how high
  // the ground sits, so `hilly` genuinely fills more of the frame than `rolling` does.
  const lift = ((prof.band[0] + prof.band[1]) / 2) * CAM.vh + CAM.baseY;

  const noiseAt = (x) => {
    const u = x / cell;
    const i = Math.floor(u);
    const f = u - i;
    const a = noise[((i % N) + N) % N];
    const c = noise[(((i + 1) % N) + N) % N];
    const s = f * f * (3 - 2 * f);
    return a + (c - a) * s;
  };

  const bedAt = (x) => {
    let s = 0.62 * Math.sin(x * k + ph[0])
          + 0.26 * Math.sin(x * k * 2.37 + ph[1])
          + 0.12 * Math.sin(x * k * 5.13 + ph[2]);
    s += b.rough * (0.20 * noiseAt(x) + 0.07 * noiseAt(x * 3.7 + 991));
    s += b.bias;

    // Rare, short alpine crests: s^1.5 keeps the top of the range unlikely.
    let y = s >= 0
      ? (b.peaky ? Math.pow(Math.min(s, 1), 1.5) : Math.min(s, 1)) * up
      : Math.max(s, -1.6) * down;

    // flat, safe strips at both ends of the level
    const edge = Math.min(x, level.length - x);
    y += lift;
    if (edge < 900) y *= Math.max(0, edge / 900);
    return y;
  };

  const waterY = b.water ? 0 : null;

  return {
    biome: level.biome,
    profile: level.terrainProfile || TERRAIN.defaultProfile,
    waterY,
    bedAt,
    /** The collision surface. Over water this is the water line (CONTRACTS §2). */
    heightAt: (x) => {
      const h = bedAt(x);
      return waterY !== null && h < waterY ? waterY : h;
    },
    /** Water surface y at x, or null if this x is dry land. */
    waterAt: (x) => (waterY !== null && bedAt(x) < waterY ? waterY : null),
    /** n samples of heightAt across [x0,x1] — gfx builds its strip paths from this. */
    sample: (x0, x1, n) => {
      const out = new Float64Array(n);
      const step = (x1 - x0) / (n - 1);
      for (let i = 0; i < n; i++) {
        const h = bedAt(x0 + step * i);
        out[i] = waterY !== null && h < waterY ? waterY : h;
      }
      return out;
    },
  };
}
