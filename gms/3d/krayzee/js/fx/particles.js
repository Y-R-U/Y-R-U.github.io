import * as THREE from 'three';

// One instanced draw call for every billboard. Premultiplied blending lets smoke (alpha) and fire/sparks (additive,
// alpha written as 0) share the call. Back-to-front order comes from a 256-bucket counting sort on log depth.

const vert = /* glsl */`
attribute vec4 iPos;   // xyz, size
attribute vec4 iStr;   // stretch vector (world), stretch length
attribute vec4 iCol;   // rgb, alpha
attribute vec4 iMisc;  // rot, frame, additive, orient (0 billboard, 1 stretched, 2 flat)
uniform float uNear;
varying vec2 vUv; varying vec4 vCol; varying float vAdd; varying float vShade;
#include <fog_pars_vertex>
void main() {
  vec2 c = position.xy;
  float size = iPos.w, rot = iMisc.x, orient = iMisc.w;
  float s = sin(rot), k = cos(rot);
  vec2 rc = vec2(c.x * k - c.y * s, c.x * s + c.y * k);
  vec4 mvPosition;
  if (orient < 0.5) {
    mvPosition = viewMatrix * vec4(iPos.xyz, 1.0);
    mvPosition.xy += rc * size;
    vShade = 0.78 + 0.42 * rc.y;
  } else if (orient < 1.5) {
    vec4 mc = viewMatrix * vec4(iPos.xyz - iStr.xyz * 0.5, 1.0);
    vec3 sv = (viewMatrix * vec4(iStr.xyz, 0.0)).xyz;
    vec2 d = sv.xy * (-mc.z) + mc.xy * sv.z;
    float L = length(d);
    d = L > 1e-6 ? d / L : vec2(1.0, 0.0);
    vec2 n = vec2(-d.y, d.x);
    mvPosition = mc;
    mvPosition.xy += d * c.x * (length(iStr.xyz) + size) + n * c.y * size;
    vShade = 1.0;
  } else {
    mvPosition = viewMatrix * vec4(iPos.xyz + vec3(rc.x, 0.0, rc.y) * size, 1.0);
    vShade = 1.0;
  }
  gl_Position = projectionMatrix * mvPosition;
  float fade = orient > 1.5 ? 1.0 : smoothstep(uNear, uNear + 0.6 + size * 0.9, -mvPosition.z);
  float fr = iMisc.y;
  vec2 cell = vec2(mod(fr, 4.0), floor(fr / 4.0));
  vUv = vec2((cell.x + c.x + 0.5) * 0.25, 1.0 - (cell.y + 0.5 - c.y) * 0.25);
  vCol = vec4(iCol.rgb, iCol.a * fade);
  vAdd = iMisc.z;
  #include <fog_vertex>
}`;

const frag = /* glsl */`
uniform sampler2D map;
uniform float uLight;
varying vec2 vUv; varying vec4 vCol; varying float vAdd; varying float vShade;
#include <fog_pars_fragment>
void main() {
  vec4 t = texture2D(map, vUv);
  float a = t.a * vCol.a;
  if (a < 0.002) discard;
  vec3 col = vCol.rgb * t.r * mix(vShade * uLight, 1.0, vAdd);
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  vec3 pre = gl_FragColor.rgb;
  #include <fog_fragment>
  #ifdef USE_FOG
    gl_FragColor.rgb = mix(gl_FragColor.rgb, pre * (1.0 - fogFactor), vAdd);
  #endif
  gl_FragColor.rgb *= gl_FragColor.a;
  gl_FragColor.a *= 1.0 - vAdd;
}`;

const FIELDS = ['px', 'py', 'pz', 'vx', 'vy', 'vz', 'age', 'life', 's0', 's1', 'rot', 'rv', 'r0', 'g0', 'b0', 'r1', 'g1', 'b1',
  'a', 'fin', 'fout', 'frame', 'add', 'orient', 'drag', 'buoy', 'grav', 'floor', 'str', 'flick', 'wind'];

export function createParticles(scene, atlas, max) {
  const P = { n: 0, max, cap: max };
  for (const f of FIELDS) P[f] = new Float32Array(max);
  // stretch direction is the velocity unless a fixed one is set
  P.sx = new Float32Array(max); P.sy = new Float32Array(max); P.sz = new Float32Array(max);
  P.fixed = new Uint8Array(max);
  const arrs = FIELDS.map((f) => P[f]);

  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  // one interleaved buffer = one upload; the range object is persistent so the upload never allocates on our side
  const data = new Float32Array(max * 16);
  const ib = new THREE.InstancedInterleavedBuffer(data, 16, 1);
  ib.setUsage(THREE.DynamicDrawUsage);
  const range = { start: 0, count: 0 };
  ib.updateRanges.push(range);
  ib.clearUpdateRanges = () => ib;
  for (const [name, off] of [['iPos', 0], ['iStr', 4], ['iCol', 8], ['iMisc', 12]]) geo.setAttribute(name, new THREE.InterleavedBufferAttribute(ib, 4, off));
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { map: { value: null }, uLight: { value: 1 }, uNear: { value: 0.25 } }]),
    transparent: true, depthWrite: false, fog: true,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });
  mat.uniforms.map.value = atlas;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  mesh.name = 'fx-particles';
  mesh.visible = false;
  scene.add(mesh);

  const depth = new Float32Array(max), bucket = new Uint8Array(max), order = new Uint16Array(max);
  const counts = new Uint32Array(256);
  P.mesh = mesh; P.material = mat;
  P.spawned = 0; P.dropped = 0;

  // Spec is a caller-owned scratch object; spawn copies it, so the emitters never allocate.
  P.spawn = (s) => {
    if (P.n >= P.cap) { P.dropped++; return -1; }
    const i = P.n++;
    P.px[i] = s.x; P.py[i] = s.y; P.pz[i] = s.z; P.vx[i] = s.vx; P.vy[i] = s.vy; P.vz[i] = s.vz;
    P.age[i] = 0; P.life[i] = s.life; P.s0[i] = s.s0; P.s1[i] = s.s1; P.rot[i] = s.rot; P.rv[i] = s.rv;
    P.r0[i] = s.r0; P.g0[i] = s.g0; P.b0[i] = s.b0; P.r1[i] = s.r1; P.g1[i] = s.g1; P.b1[i] = s.b1;
    P.a[i] = s.a; P.fin[i] = s.fin; P.fout[i] = s.fout; P.frame[i] = s.frame; P.add[i] = s.add; P.orient[i] = s.orient;
    P.drag[i] = s.drag; P.buoy[i] = s.buoy; P.grav[i] = s.grav; P.floor[i] = s.floor; P.str[i] = s.str; P.flick[i] = s.flick;
    P.wind[i] = s.wind;
    P.fixed[i] = s.fixed ? 1 : 0; P.sx[i] = s.sx; P.sy[i] = s.sy; P.sz[i] = s.sz;
    P.spawned++;
    return i;
  };

  const kill = (i) => {
    const j = --P.n;
    if (i === j) return;
    for (let f = 0; f < arrs.length; f++) { const A = arrs[f]; A[i] = A[j]; }
    P.sx[i] = P.sx[j]; P.sy[i] = P.sy[j]; P.sz[i] = P.sz[j]; P.fixed[i] = P.fixed[j];
  };

  P.clear = () => { P.n = 0; };

  // T: Float64Array [time, dt] — passing raw doubles across calls boxes them
  P.update = (T, camPos, wind) => {
    const time = T[0], dt = T[1];
    const wx = wind.x, wz = wind.z;
    for (let i = P.n - 1; i >= 0; i--) {
      const age = (P.age[i] += dt);
      if (age >= P.life[i]) { kill(i); continue; }
      if (age < 0) continue;
      const dr = Math.exp(-P.drag[i] * dt), w = P.wind[i];
      let vx = P.vx[i], vy = P.vy[i], vz = P.vz[i];
      vx = wx * w + (vx - wx * w) * dr;
      vz = wz * w + (vz - wz * w) * dr;
      vy = vy * dr + (P.buoy[i] - P.grav[i]) * dt;
      let y = P.py[i] + vy * dt;
      if (y < P.floor[i]) { y = P.floor[i]; if (vy < 0) { vy = -vy * 0.3; vx *= 0.6; vz *= 0.6; } }
      P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
      P.px[i] += vx * dt; P.py[i] = y; P.pz[i] += vz * dt;
      P.rot[i] += P.rv[i] * dt;
    }
    const n = P.n;
    mesh.visible = n > 0;
    if (!n) return;
    const cx = camPos.x, cy = camPos.y, cz = camPos.z;
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const dx = P.px[i] - cx, dy = P.py[i] - cy, dz = P.pz[i] - cz;
      const d = dx * dx + dy * dy + dz * dz;
      let b = 255 - Math.min(255, Math.floor(Math.log2(d + 1) * 9.5));
      bucket[i] = b; depth[i] = d; counts[b]++;
    }
    let acc = 0;
    for (let b = 0; b < 256; b++) { const c = counts[b]; counts[b] = acc; acc += c; }
    for (let i = 0; i < n; i++) order[counts[bucket[i]]++] = i;

    const D = data;
    for (let o = 0; o < n; o++) {
      const i = order[o], k = o * 16;
      const t = P.age[i] / P.life[i];
      const e = 1 - (1 - t) * (1 - t);
      let al = t < 0 ? 0 : P.a[i];
      if (P.fin[i] > 0 && t < P.fin[i]) al *= t / P.fin[i];
      if (t > P.fout[i]) al *= 1 - (t - P.fout[i]) / (1 - P.fout[i]);
      if (P.flick[i] > 0) al *= 1 - P.flick[i] * (0.5 + 0.5 * Math.sin(time * 37 + i * 2.3));
      D[k] = P.px[i]; D[k + 1] = P.py[i]; D[k + 2] = P.pz[i]; D[k + 3] = P.s0[i] + (P.s1[i] - P.s0[i]) * e;
      const st = P.str[i];
      if (P.fixed[i]) { D[k + 4] = P.sx[i] * st; D[k + 5] = P.sy[i] * st; D[k + 6] = P.sz[i] * st; }
      else { D[k + 4] = P.vx[i] * st; D[k + 5] = P.vy[i] * st; D[k + 6] = P.vz[i] * st; }
      D[k + 7] = st;
      D[k + 8] = P.r0[i] + (P.r1[i] - P.r0[i]) * t; D[k + 9] = P.g0[i] + (P.g1[i] - P.g0[i]) * t; D[k + 10] = P.b0[i] + (P.b1[i] - P.b0[i]) * t; D[k + 11] = al;
      D[k + 12] = P.rot[i]; D[k + 13] = P.frame[i]; D[k + 14] = P.add[i]; D[k + 15] = P.orient[i];
    }
    range.count = n * 16;
    ib.needsUpdate = true;
    geo.instanceCount = n;
  };

  P.dispose = () => { scene.remove(mesh); geo.dispose(); mat.dispose(); };
  return P;
}
