// Procedural ground detail, generated once at boot (~2.4 MB GPU with mips).
// cobA: rgb = albedo multiplier / 1.4, a = roughness. cobB: rg = height slope, b = gap (joint) mask, a = height.
// grass: rgb = albedo multiplier / 1.4, a = height.
import * as THREE from 'three';

const N = 512, CN = 6;

function hash(i) { i = Math.imul(i ^ 0x27d4eb2d, 0x165667b1); i ^= i >>> 15; i = Math.imul(i, 0x85ebca6b); i ^= i >>> 13; return (i >>> 0) / 4294967296; }

function vnoise(n, cells, seed) {
  const g = new Float32Array(cells * cells);
  for (let i = 0; i < g.length; i++) g[i] = hash(i * 7 + seed);
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = x / n * cells, fy = y / n * cells, ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = g[(iy % cells) * cells + ix % cells], b = g[(iy % cells) * cells + (ix + 1) % cells];
    const c = g[((iy + 1) % cells) * cells + ix % cells], d = g[((iy + 1) % cells) * cells + (ix + 1) % cells];
    out[y * n + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
  return out;
}

function tex(data, n) {
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

const TINTS = [[1, 1, 1], [1.024, 0.984, 0.988], [1.0, 0.988, 1.04], [0.98, 1.016, 0.992], [1.024, 1.012, 0.968], [0.992, 0.996, 1.016], [1.012, 1.0, 1.0]];

function cobbles() {
  const seeds = [];
  for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
    const r = j * CN + i;
    seeds.push([(i + 0.5 + (j % 2) * 0.5 + (hash(r * 3 + 1) - 0.5) * 0.42) / CN, (j + 0.5 + (hash(r * 3 + 2) - 0.5) * 0.38) / CN, r]);
  }
  const H = new Float32Array(N * N), A = new Uint8Array(N * N * 4), B = new Uint8Array(N * N * 4);
  const gap = new Float32Array(N * N), cid = new Int32Array(N * N), edge = new Float32Array(N * N);
  const nz = vnoise(N, 32, 5), nz2 = vnoise(N, 96, 9);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x / N, py = y / N;
    let d1 = 9, d2 = 9, id = 0, s1 = null;
    const wx = (nz[y * N + x] - 0.5) * 0.018, wy = (nz[((y + 128) % N) * N + x] - 0.5) * 0.018;
    for (const s of seeds) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const dx = s[0] + ox - px - wx, dy = (s[1] + oy - py - wy) * 1.12;
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; id = s[2]; s1 = s; } else if (d < d2) d2 = d;
    }
    const e = (Math.sqrt(d2) - Math.sqrt(d1)) * CN * 0.5;
    const k = y * N + x;
    edge[k] = e; cid[k] = id;
    const g0 = 0.032 + nz2[k] * 0.025;
    gap[k] = 1 - Math.min(1, Math.max(0, (e - g0 * 0.4) / (g0 * 0.9)));
    const t = Math.min(1, e / 0.34);
    const dome = Math.sqrt(t * (2 - t));
    H[k] = dome * (0.85 + hash(id * 5 + 3) * 0.2) + (nz2[k] - 0.5) * 0.04;
  }
  const crack = new Float32Array(N * N);
  for (let c = 0; c < 9; c++) {
    let x = hash(c * 11 + 1) * N, y = hash(c * 11 + 2) * N, a = hash(c * 11 + 3) * 6.28;
    const L = 30 + hash(c * 11 + 4) * 50;
    for (let s = 0; s < L; s++) {
      a += (hash(c * 999 + s) - 0.5) * 0.7;
      x += Math.cos(a); y += Math.sin(a);
      const k = (((y | 0) % N + N) % N) * N + (((x | 0) % N + N) % N);
      crack[k] = 1;
      crack[(k + 1) % (N * N)] = Math.max(crack[(k + 1) % (N * N)], 0.5);
    }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = y * N + x, id = cid[k];
    const tint = TINTS[Math.floor(hash(id * 13 + 7) * TINTS.length)];
    const lum = 0.935 + hash(id * 17 + 5) * 0.1;
    const wear = Math.min(1, edge[k] / 0.3);
    const cr = crack[k] * (1 - gap[k]);
    let m = lum * (0.95 + 0.05 * wear) * (0.975 + nz2[k] * 0.04) * (1 - 0.18 * cr);
    const g = gap[k];
    const gr = [0.72, 0.68, 0.66];
    for (let ch = 0; ch < 3; ch++) {
      const v = (m * tint[ch]) * (1 - g) + gr[ch] * g;
      A[k * 4 + ch] = Math.min(255, Math.round(v / 1.4 * 255));
    }
    A[k * 4 + 3] = Math.round((0.62 + 0.3 * g + (1 - wear) * 0.06 - (wear > 0.9 ? 0.08 : 0)) * 255);
    const xl = (x + N - 1) % N, xr = (x + 1) % N, yu = (y + N - 1) % N, yd = (y + 1) % N;
    const hx = (H[y * N + xr] - H[y * N + xl]) * 7, hy = (H[yd * N + x] - H[yu * N + x]) * 7;
    B[k * 4] = Math.max(0, Math.min(255, Math.round((0.5 + hx * 0.5) * 255)));
    B[k * 4 + 1] = Math.max(0, Math.min(255, Math.round((0.5 + hy * 0.5) * 255)));
    B[k * 4 + 2] = Math.round(Math.max(g, cr * 0.6) * 255);
    B[k * 4 + 3] = Math.round(Math.max(0, Math.min(1, H[k])) * 255);
  }
  return [tex(A, N), tex(B, N)];
}

function grass() {
  const n = 256, D = new Uint8Array(n * n * 4);
  const a = vnoise(n, 8, 21), b = vnoise(n, 32, 22), c = vnoise(n, 128, 23);
  for (let i = 0; i < n * n; i++) {
    const h = a[i] * 0.35 + b[i] * 0.35 + c[i] * 0.3;
    const k = 0.82 + h * 0.36;
    const yel = (a[i] - 0.5) * 0.12;
    D[i * 4] = Math.round(Math.min(1.39, k * (1 + yel)) / 1.4 * 255);
    D[i * 4 + 1] = Math.round(Math.min(1.39, k) / 1.4 * 255);
    D[i * 4 + 2] = Math.round(Math.min(1.39, k * (1 - yel * 1.5)) / 1.4 * 255);
    D[i * 4 + 3] = Math.round(h * 255);
  }
  return tex(D, n);
}

export function createSurfaces() {
  const [cobA, cobB] = cobbles();
  return { cobA: { value: cobA }, cobB: { value: cobB }, grassT: { value: grass() } };
}

export const SURF_HEAD = `uniform sampler2D cobA;
uniform sampler2D cobB;
uniform sampler2D grassT;
varying float vSurf;
float sfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sfNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sfHash(i), sfHash(i + vec2(1, 0)), f.x), mix(sfHash(i + vec2(0, 1)), sfHash(i + vec2(1, 1)), f.x), f.y);
}`;

// After color_fragment: tints diffuseColor and leaves sfN (world normal tilt), sfR (roughness) for later chunks.
export const SURF_COLOR = `vec3 sfN = vec3(0.0, 1.0, 0.0); float sfR = -1.0; float sfAO = 1.0;
if (vSurf > 0.32 && vSurf < 0.48 && normalize(vWN).y > 0.2) {
  vec3 wn = normalize(vWN);
  vec2 tg = normalize(vec2(-wn.z, wn.x) + 1e-5);
  float cy = vWP.y / 0.24, along = dot(vWP.xz, tg) / 0.3;
  float course = floor(cy), fy = fract(cy);
  float u = along + course * 0.5, fu = fract(u);
  float fade = 1.0 - smoothstep(0.35, 0.9, fwidth(cy) + fwidth(along));
  float jit = sfHash(vec2(course, floor(u)) + 3.1);
  float tile = mix(0.66, 1.0, smoothstep(0.0, 0.32, fy)) * (1.0 - 0.22 * (1.0 - smoothstep(0.0, 0.07, min(fu, 1.0 - fu)))) * (0.92 + 0.14 * jit);
  float sh = mix(0.9, tile, fade);
  diffuseColor.rgb *= sh * mix(vec3(1.0), vec3(1.04, 0.98, 0.95), (jit - 0.5) * fade);
  sfAO = sh;
} else if (vSurf < 0.5 && normalize(vWN).y > 0.6) {
  vec2 wp = vWP.xz;
  float big = sfNoise(wp * 0.11) * 0.6 + sfNoise(wp * 0.37 + 7.0) * 0.4;
  if (vSurf < -0.5) {
    float moss = clamp(-vSurf - 1.0, 0.0, 1.0);
    vec2 uv = wp / 3.9;
    vec4 a = texture2D(cobA, uv), b = texture2D(cobB, uv);
    vec3 alb = a.rgb * 1.4;
    float dirt = smoothstep(0.55, 0.85, big);
    alb *= mix(vec3(1.0), vec3(0.9, 0.88, 0.85), dirt * 0.6);
    float soft = sfNoise(wp * 0.07 + 3.0) * 0.65 + sfNoise(wp * 0.19) * 0.35;
    alb *= mix(vec3(0.9, 0.91, 0.93), vec3(1.05, 1.03, 1.0), soft);
    float mz = clamp(moss * 1.5 + (sfNoise(wp * 0.9) - 0.5) * 0.9 * moss + smoothstep(0.72, 0.95, big) * 0.45, 0.0, 1.0);
    vec3 mossC = vec3(0.3, 0.46, 0.16);
    vec3 cb = diffuseColor.rgb * alb;
    cb = mix(vec3(dot(cb, vec3(0.3, 0.55, 0.15))), cb, 0.62);
    diffuseColor.rgb = mix(cb, mossC * (0.7 + 0.4 * b.a), clamp(b.b * mz * 1.4 + mz * mz * 0.35 * (1.0 - b.a), 0.0, 1.0));
    sfAO = mix(1.0, 0.84, b.b) * (0.96 + 0.04 * b.a);
    diffuseColor.rgb *= sfAO;
    sfN = normalize(vec3(-(b.r - 0.5) * 1.1, 1.0, -(b.g - 0.5) * 1.1));
    sfR = a.a;
  } else {
    vec4 g = texture2D(grassT, wp / 4.5);
    vec4 g2 = texture2D(grassT, wp / 23.0 + 0.3);
    diffuseColor.rgb *= g.rgb * 1.4 * mix(0.88, 1.12, g2.a) * mix(vec3(1.0), vec3(1.06, 1.04, 0.86), smoothstep(0.6, 0.9, big) * 0.6);
    sfAO = 0.82 + 0.18 * g.a;
    diffuseColor.rgb *= sfAO;
    sfR = 0.95;
  }
}`;
export const SURF_NORMAL = `if (sfR >= 0.0) normal = normalize(mix(normal, normalize((viewMatrix * vec4(sfN, 0.0)).xyz), 0.85));`;
