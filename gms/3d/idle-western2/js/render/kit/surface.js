// Procedural surfaces for the uber shader, picked per vertex by aPbr.w < 0.5 (see build.js SURF):
//   DIRT  (w ≤ −1, −1 − k: k = extra wetness/darkening)  packed street dirt: 256² mottle+pebble texture, wheel ruts from uStreet
//   CLAP  0.10  weathered clapboard: horizontal boards with a shadow lip on walls; grain on tops
//   PLANK 0.18  planks: floor boards running along z (seams across x); vertical boards on walls
//   PLANKX 0.21 floor boards running along x
//   GRASS 0.25  desert scrub ground (terrain), 256² clump map
//   ROOF  0.40  shingle/tin courses on up-facing roof faces
// Everything is world-space planar: no UVs, no lettering, derivative-faded so it never aliases at distance.
import * as THREE from 'three';

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

// Packed dirt: soft mottling, faint dried-mud cells, scattered pebbles with a little height.
function dirt() {
  const N = 256, A = new Uint8Array(N * N * 4), B = new Uint8Array(N * N * 4), H = new Float32Array(N * N), peb = new Float32Array(N * N), tone = new Float32Array(N * N);
  const a = vnoise(N, 8, 31), b = vnoise(N, 24, 32), c = vnoise(N, 80, 33);
  const CC = 12, seeds = [];
  for (let j = 0; j < CC; j++) for (let i = 0; i < CC; i++) seeds.push([(i + hash(j * CC + i) * 0.9 + 0.05) / CC, (j + hash(j * CC + i + 999) * 0.9 + 0.05) / CC]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const px = x / N, py = y / N, ci = Math.floor(px * CC), cj = Math.floor(py * CC);
    let d1 = 9, d2 = 9;
    for (let oj = -1; oj <= 1; oj++) for (let oi = -1; oi <= 1; oi++) {
      const ii = (ci + oi + CC) % CC, jj = (cj + oj + CC) % CC, s = seeds[jj * CC + ii];
      const dx = s[0] + (ci + oi - ii) / CC - px, dy = s[1] + (cj + oj - jj) / CC - py, d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
    const k = y * N + x;
    const crack = 1 - Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) * CC * 6);
    tone[k] = a[k] * 0.5 + b[k] * 0.3 + c[k] * 0.2;
    H[k] = tone[k] * 0.4 - crack * 0.25 * b[k];
  }
  for (let i = 0; i < 190; i++) {
    const cx = hash(i * 3 + 1) * N, cy = hash(i * 3 + 2) * N, r = 1.2 + hash(i * 3 + 3) * (i < 40 ? 3.6 : 1.6), lum = hash(i * 5 + 7);
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d >= 1) continue;
      const k = ((y + N) % N) * N + ((x + N) % N);
      const dome = Math.sqrt(1 - d * d);
      H[k] = Math.max(H[k], 0.3 + dome * 0.6);
      peb[k] = lum < 0.55 ? Math.max(peb[k], 0.4 + 0.6 * dome) : Math.min(peb[k], -(0.3 + 0.4 * dome));
    }
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const k = y * N + x;
    let m = 0.86 + tone[k] * 0.28;
    const p = peb[k];
    let r = m, g = m, bl = m;
    if (p > 0) { r *= 1 + 0.2 * p; g *= 1 + 0.19 * p; bl *= 1 + 0.24 * p; }
    else if (p < 0) { r *= 1 + 0.3 * p; g *= 1 + 0.32 * p; bl *= 1 + 0.26 * p; }
    A[k * 4] = Math.min(255, Math.round(r / 1.4 * 255));
    A[k * 4 + 1] = Math.min(255, Math.round(g / 1.4 * 255));
    A[k * 4 + 2] = Math.min(255, Math.round(bl / 1.4 * 255));
    A[k * 4 + 3] = Math.round((0.9 - Math.abs(p) * 0.25) * 255);
    const xl = (x + N - 1) % N, xr = (x + 1) % N, yu = (y + N - 1) % N, yd = (y + 1) % N;
    const hx = (H[y * N + xr] - H[y * N + xl]) * 1.6, hy = (H[yd * N + x] - H[yu * N + x]) * 1.6;
    B[k * 4] = Math.max(0, Math.min(255, Math.round((0.5 + hx * 0.5) * 255)));
    B[k * 4 + 1] = Math.max(0, Math.min(255, Math.round((0.5 + hy * 0.5) * 255)));
    B[k * 4 + 2] = Math.round(Math.abs(p) * 255);
    B[k * 4 + 3] = Math.round(Math.max(0, Math.min(1, H[k])) * 255);
  }
  return [tex(A, N), tex(B, N)];
}

function scrub() {
  const n = 256, D = new Uint8Array(n * n * 4);
  const a = vnoise(n, 8, 21), b = vnoise(n, 32, 22), c = vnoise(n, 128, 23);
  for (let i = 0; i < n * n; i++) {
    const h = a[i] * 0.4 + b[i] * 0.35 + c[i] * 0.25;
    const k = 0.88 + h * 0.24;
    const warm = (a[i] - 0.5) * 0.1;
    D[i * 4] = Math.round(Math.min(1.39, k * (1 + warm)) / 1.4 * 255);
    D[i * 4 + 1] = Math.round(Math.min(1.39, k) / 1.4 * 255);
    D[i * 4 + 2] = Math.round(Math.min(1.39, k * (1 - warm * 1.4)) / 1.4 * 255);
    D[i * 4 + 3] = Math.round(h * 255);
  }
  return tex(D, n);
}

// uStreet: (centre z, half width, rut offset from centre, on). Set by town.js; ruts fade off the street edge.
export function createSurfaces() {
  const [cobA, cobB] = dirt();
  return { cobA: { value: cobA }, cobB: { value: cobB }, grassT: { value: scrub() }, uStreet: { value: new THREE.Vector4(0, 0, 0, 0) } };
}

export const SURF_HEAD = `uniform sampler2D cobA;
uniform sampler2D cobB;
uniform sampler2D grassT;
uniform vec4 uStreet;
varying float vSurf;
float sfHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sfNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sfHash(i), sfHash(i + vec2(1, 0)), f.x), mix(sfHash(i + vec2(0, 1)), sfHash(i + vec2(1, 1)), f.x), f.y);
}`;

// After color_fragment: tints diffuseColor and leaves sfN (world normal tilt), sfR (roughness) for later chunks.
export const SURF_COLOR = `vec3 sfN = vec3(0.0, 1.0, 0.0); float sfR = -1.0; float sfAO = 1.0;
vec3 sfWN = normalize(vWN);
if (vSurf > 0.04 && vSurf < 0.235) {
  float vert = 1.0 - smoothstep(0.45, 0.7, abs(sfWN.y));
  vec2 tg = normalize(vec2(-sfWN.z, sfWN.x) + 1e-5);
  float along = dot(vWP.xz, tg);
  if (vSurf < 0.14 && vert > 0.5) {
    float cy = vWP.y / 0.21, course = floor(cy), fy = fract(cy);
    float seg = floor(along / 2.6 + sfHash(vec2(course, 1.7)) * 3.0);
    float jit = sfHash(vec2(course, seg));
    float fade = 1.0 - smoothstep(0.3, 0.8, fwidth(cy));
    float lip = mix(0.7, 1.0, smoothstep(0.0, 0.22, fy)) * (1.0 - 0.06 * smoothstep(0.8, 1.0, fy));
    float grain = 0.96 + 0.08 * sfNoise(vec2(along * 1.3, vWP.y * 22.0));
    float sh = mix(0.93, lip * (0.86 + 0.24 * jit) * grain, fade);
    float wv = sfHash(vec2(seg, course) + 5.1);
    vec3 dc = diffuseColor.rgb;
    float bleach = step(0.84, wv) * fade * 0.32, repl = step(wv, 0.07) * fade;
    dc = mix(dc, vec3(dot(dc, vec3(0.33))) * vec3(1.08, 1.04, 1.0), bleach);
    dc *= mix(1.0, 0.78, repl);
    // worn paint: chipped to raw wood along board edges, and grime creeping up from the ground
    float wear = smoothstep(0.66, 0.84, sfNoise(vec2(along * 1.7, vWP.y * 7.0))) * fade * (1.0 - smoothstep(0.1, 0.3, fy) * (1.0 - smoothstep(0.75, 0.95, fy)));
    dc = mix(dc, vec3(0.36, 0.22, 0.13), wear * 0.75);
    diffuseColor.rgb = dc * sh;
    sfAO = sh;
  } else {
    vec2 p = vSurf > 0.195 ? vWP.zx : vWP.xz;
    if (vert > 0.5) p = vec2(along, vWP.y);
    float bw = vert > 0.5 ? 0.3 : 0.24;
    float u = p.x / bw, iu = floor(u), fu = fract(u);
    float off = sfHash(vec2(iu, 3.3)) * 2.4;
    float iv = floor((p.y + off) / 2.4);
    float jit = sfHash(vec2(iu, iv));
    float fade = 1.0 - smoothstep(0.3, 0.8, fwidth(u));
    float seam = smoothstep(0.0, 0.07, fu) * smoothstep(0.0, 0.07, 1.0 - fu);
    float butt = smoothstep(0.0, 0.02, fract((p.y + off) / 2.4)) ;
    float grain = 0.95 + 0.1 * sfNoise(vec2(u * 2.0, p.y * 3.0));
    float sh = mix(0.92, (0.62 + 0.38 * seam * butt) * (0.9 + 0.18 * jit) * grain, fade);
    float wv = sfHash(vec2(iv, iu) + 9.7);
    vec3 dc = diffuseColor.rgb * mix(vec3(1.0), vec3(1.06, 0.99, 0.92), (jit - 0.5) * 2.0 * fade);
    dc = mix(dc, vec3(dot(dc, vec3(0.33))) * vec3(1.04, 1.02, 1.0), step(0.82, wv) * fade * 0.4);
    dc *= mix(1.0, 0.8, step(wv, 0.1) * fade);
    diffuseColor.rgb = dc * sh;
    sfAO = sh;
  }
} else if (vSurf > 0.265 && vSurf < 0.295) {
  // R5 wood: grain streaks along the part's long axis, board seams across it, the odd knot; end grain stays plain
  vec3 ax = vSurf < 0.275 ? vec3(1.0, 0.0, 0.0) : vSurf < 0.285 ? vec3(0.0, 1.0, 0.0) : vec3(0.0, 0.0, 1.0);
  float endg = abs(dot(sfWN, ax));
  vec3 cr = cross(sfWN, ax);
  cr = dot(cr, cr) > 1e-4 ? normalize(cr) : vec3(0.0, 0.0, 1.0);
  float along = dot(vWP, ax), across = dot(vWP, cr);
  float fade = (1.0 - smoothstep(0.35, 1.0, fwidth(across * 18.0))) * (1.0 - smoothstep(0.7, 0.9, endg));
  float bu = across / 0.23, fb = fract(bu), jit = sfHash(vec2(floor(bu), floor(along / 1.9 + sfHash(vec2(floor(bu), 2.0)) * 3.0)));
  float seam = smoothstep(0.0, 0.07, fb) * smoothstep(0.0, 0.07, 1.0 - fb);
  float w = sfNoise(vec2(along * 0.9, across * 4.0)) * 1.6;
  float streak = 0.5 + 0.5 * sin(across * 95.0 + w * 5.0 + jit * 9.0);
  float fine = sfNoise(vec2(along * 2.2, across * 140.0));
  float knot = smoothstep(0.86, 0.94, sfNoise(vec2(along * 1.7, across * 7.0) + jit * 13.0));
  float sh = (0.8 + 0.2 * seam) * (0.88 + 0.22 * jit) * (0.9 + 0.08 * streak + 0.1 * fine) * (1.0 - 0.3 * knot);
  sh = mix(0.96, sh, fade);
  diffuseColor.rgb *= sh * mix(vec3(1.0), vec3(1.05, 0.98, 0.9), (jit - 0.5) * fade);
  sfAO = sh;
} else if (vSurf > 0.32 && vSurf < 0.48 && sfWN.y > 0.2) {
  vec2 tg = normalize(vec2(-sfWN.z, sfWN.x) + 1e-5);
  float cy = vWP.y / 0.24, along = dot(vWP.xz, tg) / 0.3;
  float course = floor(cy), fy = fract(cy);
  float u = along + course * 0.5, fu = fract(u);
  float fade = 1.0 - smoothstep(0.35, 0.9, fwidth(cy) + fwidth(along));
  float jit = sfHash(vec2(course, floor(u)) + 3.1);
  float tile = mix(0.7, 1.0, smoothstep(0.0, 0.32, fy)) * (1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.07, min(fu, 1.0 - fu)))) * (0.92 + 0.14 * jit);
  float sh = mix(0.9, tile, fade);
  diffuseColor.rgb *= sh * mix(vec3(1.0), vec3(1.04, 0.98, 0.95), (jit - 0.5) * fade);
  sfAO = sh;
} else if (vSurf < 0.5 && sfWN.y > 0.6) {
  vec2 wp = vWP.xz;
  float big = sfNoise(wp * 0.07) * 0.55 + sfNoise(wp * 0.23 + 7.0) * 0.3 + sfNoise(wp * 0.9 + 3.0) * 0.15;
  if (vSurf < -0.5) {
    float wet = clamp(-vSurf - 1.0, 0.0, 1.0);
    vec2 uv = wp / 7.5;
    vec4 a = texture2D(cobA, uv), b = texture2D(cobB, uv);
    vec3 alb = a.rgb * 1.4;
    float dusty = smoothstep(0.45, 0.85, big), packed = 1.0 - smoothstep(0.15, 0.5, big);
    alb *= mix(vec3(1.0), vec3(1.1, 1.07, 1.02), dusty) * mix(vec3(1.0), vec3(0.86, 0.8, 0.8), packed * 0.8);
    float rut = 0.0, tread = 0.0;
    if (uStreet.w > 0.5) {
      float wob = sin(wp.x * 0.071) * 0.22 + sin(wp.x * 0.23 + 1.3) * 0.08;
      float dz = wp.y - uStreet.x - wob;
      float d1 = abs(abs(dz) - uStreet.z);
      float on = 1.0 - smoothstep(uStreet.y - 0.4, uStreet.y + 0.8, abs(dz));
      rut = (1.0 - smoothstep(0.16, 0.5, d1)) * on * (0.7 + 0.3 * sfNoise(wp * vec2(0.4, 2.0)));
      tread = (1.0 - smoothstep(0.0, uStreet.z * 0.8, abs(dz))) * on;
      float hoof = step(0.83, sfNoise(wp * 3.1)) * tread * 0.5;
      alb *= 1.0 - 0.07 * hoof;
      sfN = normalize(vec3(0.0, 1.0, -sign(abs(dz) - uStreet.z) * sign(dz) * rut * 0.35));
    }
    // boot prints and hoof prints scattered over the street (hashed 0.6 m cells), sunbaked red patches
    {
      vec2 cell = floor(wp / 0.6), f = fract(wp / 0.6) - 0.5;
      float hp = sfHash(cell + 17.0);
      vec2 o = vec2(sfHash(cell + 3.0), sfHash(cell + 5.0)) - 0.5;
      vec2 q = f - o * 0.5;
      float ang = (sfHash(cell + 9.0) - 0.5) * 0.8;
      q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * q;
      float prt = (1.0 - smoothstep(0.7, 1.0, length(q * vec2(5.0, 9.5)))) * step(0.72, hp) * (0.55 + 0.45 * tread);
      float dfade = 1.0 - smoothstep(0.04, 0.12, fwidth(wp.x));
      alb *= 1.0 - 0.16 * prt * dfade;
      sfN = normalize(sfN + vec3(-q.x, 0.0, -q.y) * prt * 0.9 * dfade);
    }
    alb *= mix(vec3(1.0), vec3(1.06, 0.92, 0.84), smoothstep(0.55, 0.85, sfNoise(wp * 0.031 + 11.0)) * 0.8);
    alb *= mix(vec3(1.0), vec3(0.8, 0.74, 0.76), rut * 0.9);
    alb *= mix(vec3(1.0), vec3(1.035, 1.03, 1.02), tread * 0.6);
    alb *= mix(vec3(1.0), vec3(0.78, 0.74, 0.76), wet);
    diffuseColor.rgb *= alb;
    sfAO = (0.94 + 0.06 * b.a) * (1.0 - 0.12 * rut);
    diffuseColor.rgb *= sfAO;
    vec3 pn = normalize(vec3(-(b.r - 0.5) * 0.9, 1.0, -(b.g - 0.5) * 0.9));
    sfN = normalize(sfN + pn - vec3(0.0, 1.0, 0.0));
    sfR = a.a;
  } else {
    vec4 g = texture2D(grassT, wp / 5.0);
    vec4 g2 = texture2D(grassT, wp / 27.0 + 0.3);
    diffuseColor.rgb *= g.rgb * 1.4 * mix(0.9, 1.08, g2.a) * mix(vec3(1.0), vec3(1.04, 1.0, 0.93), smoothstep(0.6, 0.9, big) * 0.6);
    sfAO = 0.88 + 0.12 * g.a;
    diffuseColor.rgb *= sfAO;
    sfR = 0.95;
  }
}
if (abs(sfWN.y) < 0.55 && vWP.y < 1.0) diffuseColor.rgb *= mix(0.66, 1.0, smoothstep(0.0, 0.85, vWP.y));`;
export const SURF_NORMAL = `if (sfR >= 0.0) normal = normalize(mix(normal, normalize((viewMatrix * vec4(sfN, 0.0)).xyz), 0.85));`;
