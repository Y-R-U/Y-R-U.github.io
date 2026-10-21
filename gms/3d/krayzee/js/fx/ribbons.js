import * as THREE from 'three';

// Camera-facing ribbon trails (wingtip vapour). All trails share one dynamic mesh = one draw call.

const vert = /* glsl */`
attribute vec4 aCol;
attribute vec2 aUv;
varying vec4 vCol; varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = viewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vCol = aCol; vUv = aUv;
  #include <fog_vertex>
}`;
const frag = /* glsl */`
uniform float uLight;
varying vec4 vCol; varying vec2 vUv;
#include <fog_pars_fragment>
float h(float x) { return fract(sin(x * 91.7) * 4375.5); }
void main() {
  float v = vUv.y * 2.0 - 1.0;
  float a = vCol.a * (1.0 - v * v) * (0.82 + 0.18 * sin(vUv.x * 0.9 + v * 2.0));
  if (a < 0.002) discard;
  gl_FragColor = vec4(vCol.rgb * uLight, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
  gl_FragColor.rgb *= gl_FragColor.a;
}`;

export function createRibbons(scene, { trails = 8, points = 64 } = {}) {
  const T = trails, M = points;
  const px = new Float32Array(T * M), py = new Float32Array(T * M), pz = new Float32Array(T * M);
  const pt = new Float32Array(T * M), pa = new Float32Array(T * M), pw = new Float32Array(T * M), brk = new Uint8Array(T * M);
  const head = new Int32Array(T), count = new Int32Array(T), used = new Uint8Array(T), pendingBreak = new Uint8Array(T);
  const cr = new Float32Array(T), cg = new Float32Array(T), cb = new Float32Array(T), life = new Float32Array(T), grow = new Float32Array(T);
  const minSeg = new Float32Array(T);

  const VMAX = T * M * 2;
  const data = new Float32Array(VMAX * 9);
  const ib = new THREE.InterleavedBuffer(data, 9);
  ib.setUsage(THREE.DynamicDrawUsage);
  const vr = { start: 0, count: 0 };
  ib.updateRanges.push(vr); ib.clearUpdateRanges = () => ib;
  const idx = new Uint16Array(T * M * 6);
  const ia = new THREE.BufferAttribute(idx, 1);
  ia.setUsage(THREE.DynamicDrawUsage);
  const ir = { start: 0, count: 0 };
  ia.updateRanges.push(ir); ia.clearUpdateRanges = () => ia;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.InterleavedBufferAttribute(ib, 3, 0));
  geo.setAttribute('aCol', new THREE.InterleavedBufferAttribute(ib, 4, 3));
  geo.setAttribute('aUv', new THREE.InterleavedBufferAttribute(ib, 2, 7));
  geo.setIndex(ia);
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uLight: { value: 1 } }]),
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.name = 'fx-ribbons';
  mesh.visible = false;
  scene.add(mesh);

  const R = { mesh, material: mat, cap: T };
  R.alloc = (r = 1, g = 1, b = 1, lifeS = 1.2, growS = 1.5, seg = 1.5) => {
    for (let t = 0; t < T; t++) if (!used[t]) {
      used[t] = 1; head[t] = 0; count[t] = 0; pendingBreak[t] = 1;
      cr[t] = r; cg[t] = g; cb[t] = b; life[t] = lifeS; grow[t] = growS; minSeg[t] = seg;
      return t;
    }
    return -1;
  };
  R.free = (t) => { if (t >= 0) { used[t] = 0; count[t] = 0; } };
  R.cut = (t) => { if (t >= 0) pendingBreak[t] = 1; };
  // Adds (or drags the newest) point; v = {x,y,z}, aw = Float64Array [alpha, width, time] (no boxed doubles).
  // A ribbon starts a new strip after cut().
  R.push = (t, v, aw) => {
    if (t < 0) return;
    const x = v.x, y = v.y, z = v.z, a = aw[0], w = aw[1], time = aw[2];
    const base = t * M;
    if (count[t] > 0 && !pendingBreak[t]) {
      const k = base + ((head[t] - 1 + M) % M);
      const prev = base + ((head[t] - 2 + M) % M);
      const dx = x - px[prev], dy = y - py[prev], dz = z - pz[prev];
      if (count[t] > 1 && !brk[k] && dx * dx + dy * dy + dz * dz < minSeg[t] * minSeg[t]) {
        px[k] = x; py[k] = y; pz[k] = z; pa[k] = a; pw[k] = w; pt[k] = time;
        return;
      }
    }
    const k = base + head[t];
    px[k] = x; py[k] = y; pz[k] = z; pt[k] = time; pa[k] = a; pw[k] = w; brk[k] = pendingBreak[t];
    pendingBreak[t] = 0;
    head[t] = (head[t] + 1) % M;
    if (count[t] < M) count[t]++;
  };
  R.clear = () => { for (let t = 0; t < T; t++) { count[t] = 0; pendingBreak[t] = 1; } };

  R.update = (clock, cam) => {
    let nv = 0, ni = 0;
    const cx = cam.x, cy = cam.y, cz = cam.z;
    for (let t = 0; t < T; t++) {
      const n = count[t];
      if (n < 2) continue;
      const base = t * M, L = life[t];
      let prevV = -1;
      for (let j = n - 1; j >= 0; j--) {
        const k = base + ((head[t] - 1 - j + M * 2) % M);
        const age = clock[0] - pt[k];
        if (age > L) { prevV = -1; continue; }
        // tangent from neighbours
        const jn = j > 0 ? base + ((head[t] - j + M * 2) % M) : k;
        const jp = j < n - 1 ? base + ((head[t] - 2 - j + M * 2) % M) : k;
        const tx = px[jn] - px[jp], ty = py[jn] - py[jp], tz = pz[jn] - pz[jp];
        const ex = px[k] - cx, ey = py[k] - cy, ez = pz[k] - cz;
        let sx = ty * ez - tz * ey, sy = tz * ex - tx * ez, sz = tx * ey - ty * ex;
        const sl = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
        const f = age / L, w = pw[k] * (1 + f * grow[t]) * 0.5 / sl;
        sx *= w; sy *= w; sz *= w;
        const al = pa[k] * (1 - f) * (1 - f) * Math.min(1, age * 8 + 0.15);
        const o = nv * 9;
        data[o] = px[k] - sx; data[o + 1] = py[k] - sy; data[o + 2] = pz[k] - sz;
        data[o + 3] = cr[t]; data[o + 4] = cg[t]; data[o + 5] = cb[t]; data[o + 6] = al; data[o + 7] = j; data[o + 8] = 0;
        data[o + 9] = px[k] + sx; data[o + 10] = py[k] + sy; data[o + 11] = pz[k] + sz;
        data[o + 12] = cr[t]; data[o + 13] = cg[t]; data[o + 14] = cb[t]; data[o + 15] = al; data[o + 16] = j; data[o + 17] = 1;
        if (prevV >= 0 && !brk[k]) {
          idx[ni++] = prevV; idx[ni++] = prevV + 1; idx[ni++] = nv;
          idx[ni++] = prevV + 1; idx[ni++] = nv + 1; idx[ni++] = nv;
        }
        prevV = nv; nv += 2;
      }
    }
    mesh.visible = ni > 0;
    if (!ni) return;
    vr.count = nv * 9; ib.needsUpdate = true;
    ir.count = ni; ia.needsUpdate = true;
    geo.setDrawRange(0, ni);
  };
  R.dispose = () => { scene.remove(mesh); geo.dispose(); mat.dispose(); };
  return R;
}
