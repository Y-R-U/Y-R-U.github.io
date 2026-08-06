// Naval surface generators. Each returns bake.surface()'s contract:
//   { rgba: Uint8ClampedArray (alpha carries roughness), height: Float32Array, strength }
//
// W0 ships two honest generators — painted steel and a rust overlay — so the material kits have
// something real to call. C2/C3 add theirs here; the noise/bake kit underneath is FORGE's, ported.

import { fields, clamp, lerp, smoothstep, hexRgb, mixRgb } from './noise.js';

// Painted steel: large flat plates, a faint weld seam lattice, roughness varying across a plate
// so the surface reads as painted metal rather than as a flat colour.
export function paintedSteel({ colour = '#5a6470', plate = 0.25, wear = 0.35, rough = 0.55 } = {}) {
  return S => {
    const f = fields();
    const rgba = new Uint8ClampedArray(S * S * 4);
    const height = new Float32Array(S * S);
    const base = hexRgb(colour);
    const dark = base.map(c => c * 0.72);
    const out = [0, 0, 0];

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        const grain = f.grain.at(u, v);
        const coarse = f.coarse.at(u, v);
        // weld seams: a soft dark line wherever we cross a plate boundary
        const seam = Math.max(seamLine(u, plate), seamLine(v, plate));

        mixRgb(base, dark, clamp(coarse * 0.5 + grain * 0.3 - 0.15, 0, 1) * wear, out);
        const shade = 1 - seam * 0.45;
        const i = (y * S + x) * 4;
        rgba[i] = out[0] * shade;
        rgba[i + 1] = out[1] * shade;
        rgba[i + 2] = out[2] * shade;
        rgba[i + 3] = clamp(rough + (grain - 0.5) * 0.35 + seam * 0.2, 0.05, 1) * 255;
        height[y * S + x] = grain * 0.25 + coarse * 0.15 - seam * 0.9;
      }
    }
    return { rgba, height, strength: 1.4 };
  };
}

// Rust: patchy, high roughness, warm. Meant to be layered over paintedSteel via a mask, not used
// as a whole hull.
export function rust({ colour = '#7a4326', coverage = 0.4 } = {}) {
  return S => {
    const f = fields();
    const rgba = new Uint8ClampedArray(S * S * 4);
    const height = new Float32Array(S * S);
    const hot = hexRgb(colour);
    const cold = hot.map(c => c * 0.55);
    const out = [0, 0, 0];

    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const u = x / S, v = y / S;
        // domain warp before sampling, or the patches tile visibly as soft blobs on a grid
        const w = f.warp.at(u, v) - 0.5;
        const patch = smoothstep(1 - coverage, 1 - coverage + 0.25, f.coarse.at(u + w * 0.08, v + w * 0.08));
        const fine = f.fine.at(u, v);

        mixRgb(cold, hot, fine, out);
        const i = (y * S + x) * 4;
        rgba[i] = out[0];
        rgba[i + 1] = out[1];
        rgba[i + 2] = out[2];
        rgba[i + 3] = lerp(0.6, 0.95, fine) * 255;
        height[y * S + x] = patch * (0.5 + fine * 0.5);
      }
    }
    return { rgba, height, strength: 2.2 };
  };
}

// distance to the nearest plate boundary, as a 0..1 darkness
function seamLine(t, pitch) {
  const p = (t % pitch) / pitch;
  const d = Math.min(p, 1 - p);
  return 1 - smoothstep(0, 0.035, d);
}
