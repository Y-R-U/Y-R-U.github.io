import * as THREE from 'three';
import { samplePath } from './tube.js';

// Pooled, instanced VFX primitives (one draw each): additive particles, alpha particles (smoke/debris),
// beams (camera-facing ribbons between two points), and rings (flat on the ground or camera-facing).
// All CPU-simulated; each pool rewrites only its live instances per frame.

const PARTICLE_VS = /* glsl */`
  attribute vec3 aPos; attribute vec3 aVel; attribute vec4 aCol; attribute vec3 aSz;
  varying vec4 vCol; varying vec2 vUv; varying float vKind;
  void main(){
    vCol = aCol; vUv = uv; vKind = aSz.z;
    vec4 mv = viewMatrix * vec4(aPos, 1.0);
    vec2 q = position.xy * aSz.x;
    if (aSz.y > 0.0) {
      // streak: stretch along the screen-space velocity
      vec3 vv = (viewMatrix * vec4(aVel, 0.0)).xyz;
      vec2 d = vv.xy; float L = length(d);
      if (L > 1e-4) {
        d /= L;
        vec2 n = vec2(-d.y, d.x);
        q = d * position.y * aSz.x * (1.0 + aSz.y * L) + n * position.x * aSz.x * 0.35;
      }
    }
    mv.xy += q;
    gl_Position = projectionMatrix * mv;
  }`;
const PARTICLE_FS = /* glsl */`
  varying vec4 vCol; varying vec2 vUv; varying float vKind;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = dot(p, p);
    float a;
    if (vKind < 0.5) a = exp(-r * 3.2) * (1.0 - smoothstep(0.7, 1.0, r));          // soft glow
    else if (vKind < 1.5) a = smoothstep(1.0, 0.0, r) * smoothstep(1.0, 0.4, abs(p.y)); // spark core
    else if (vKind < 2.5) { a = smoothstep(1.0, 0.55, r); a *= 0.6 + 0.4 * smoothstep(0.2, 0.9, r); } // smoke puff
    else if (vKind < 3.5) { float s = max(abs(p.x), abs(p.y)); a = step(s, 0.7); }  // chunk
    else if (vKind > 4.5) { a = 1.0 - smoothstep(0.5, 1.0, sqrt(r)); } // 5: solid disc, soft edge (dark cores)
    else { // 4: star flare (cross streaks + hot core)
      a = exp(-abs(p.y) * 26.0) * exp(-abs(p.x) * 2.2) + exp(-abs(p.x) * 26.0) * exp(-abs(p.y) * 3.2) * 0.7 + exp(-r * 18.0);
      a = min(a, 1.0);
    }
    if (a < 0.003) discard;
    gl_FragColor = vec4(vCol.rgb * a * vCol.a, a * vCol.a);
  }`;

// Bloom mask (battle-7): any material can keep bloom off the pixels it covers (true-black void cores, black-hole billboards).
// Colour blends as before (normal or premultiplied); alpha becomes dst.a * (1 - src.a), and the grade pass scales bloom by it.
// The material's output alpha is its mask strength, so only use it on the dark part of a shader (or accept that a bright rim drawn
// by the same material also loses its bloom halo inside its own footprint).
export function markNoBloom(mat, premultiplied) {
  const pre = premultiplied ?? (mat.blending === THREE.CustomBlending && mat.blendSrc === THREE.OneFactor);
  mat.blending = THREE.CustomBlending;
  mat.blendEquation = THREE.AddEquation;
  mat.blendSrc = pre ? THREE.OneFactor : THREE.SrcAlphaFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  mat.blendEquationAlpha = THREE.AddEquation;
  mat.needsUpdate = true;
  return mat;
}

function particlePool(max, blending) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1);
  geo.index = quad.index; geo.attributes.position = quad.attributes.position; geo.attributes.uv = quad.attributes.uv;
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aSz = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos); geo.setAttribute('aVel', aVel); geo.setAttribute('aCol', aCol); geo.setAttribute('aSz', aSz);
  geo.instanceCount = 0;
  const additive = blending === 'add', dark = blending === 'dark';
  const mat = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  // battle-7 'dark' pool: same premultiplied colour blend, but the scene target's alpha is multiplied by (1 - coverage).
  // The grade pass gates bloom by that alpha (BLOOM_MASK), so void cores stay truly black instead of being washed by nearby glow.
  if (dark) markNoBloom(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = additive ? 20 : dark ? 19.5 : 19;
  const P = [];
  const pool = {
    mesh, max, list: P,
    // o: {pos, vel, color(THREE.Color HDR), alpha, life, size (world m, full quad), size1, drag, grav, kind:0 glow|1 spark|2 smoke|3 chunk|4 star|5 solid disc, streak, fadeIn, hold}
    spawn(o) {
      if (P.length >= max) P.shift();
      const p = { x: o.pos.x, y: o.pos.y, z: o.pos.z, vx: o.vel?.x || 0, vy: o.vel?.y || 0, vz: o.vel?.z || 0,
        r: o.color.r, g: o.color.g, b: o.color.b, a: o.alpha ?? 1, t: 0, life: o.life ?? 0.5, s0: o.size ?? 0.3, s1: o.size1 ?? o.size ?? 0.3,
        drag: o.drag ?? 0, grav: o.grav ?? 0, kind: o.kind ?? 0, streak: o.streak ?? 0, floor: o.floor ?? true, fadeIn: o.fadeIn ?? 0, hold: o.hold ?? 0 };
      P.push(p);
      return p;
    },
    update(dt) {
      let n = 0;
      for (let i = 0; i < P.length; i++) {
        const p = P[i];
        p.t += dt;
        if (p.t >= p.life) continue;
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy = p.vy * d - p.grav * dt; p.vz *= d;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.floor && p.y < 0.02) { p.y = 0.02; p.vy = -p.vy * 0.35; p.vx *= 0.6; p.vz *= 0.6; }
        P[n++] = p;
      }
      P.length = n;
      for (let i = 0; i < n; i++) {
        const p = P[i], k = p.t / p.life;
        const kf = p.hold ? Math.max(0, (k - p.hold) / (1 - p.hold)) : k; // hold: fraction of life at full alpha
        const fade = (1 - kf) * (1 - kf * 0.3) * (p.fadeIn ? Math.min(1, p.t / p.fadeIn) : 1);
        aPos.setXYZ(i, p.x, p.y, p.z);
        aVel.setXYZ(i, p.vx, p.vy, p.vz);
        aCol.setXYZW(i, p.r, p.g, p.b, p.a * fade);
        aSz.setXYZ(i, p.s0 + (p.s1 - p.s0) * k, p.streak, p.kind);
      }
      geo.instanceCount = n;
      mesh.visible = n > 0 || !dark; // the dark pool costs no draw call while empty
      if (n) { aPos.needsUpdate = aVel.needsUpdate = aCol.needsUpdate = aSz.needsUpdate = true; aPos.addUpdateRange(0, n * 3); aVel.addUpdateRange(0, n * 3); aCol.addUpdateRange(0, n * 4); aSz.addUpdateRange(0, n * 3); }
    },
  };
  return pool;
}

const BEAM_VS = /* glsl */`
  attribute vec3 aA; attribute vec3 aB; attribute vec4 aCol; attribute vec4 aW;
  varying vec2 vUv; varying vec4 vCol; varying vec4 vW;
  void main(){
    vUv = uv; vCol = aCol; vW = aW;
    vec4 a = viewMatrix * vec4(aA, 1.0), b = viewMatrix * vec4(aB, 1.0);
    vec4 p = mix(a, b, uv.x);
    vec3 dir = normalize(b.xyz - a.xyz + vec3(1e-5));
    vec3 side = normalize(cross(dir, normalize(-p.xyz)));
    p.xyz += side * (uv.y - 0.5) * aW.x;
    gl_Position = projectionMatrix * p;
  }`;
const BEAM_FS = /* glsl */`
  uniform float uTime;
  varying vec2 vUv; varying vec4 vCol; varying vec4 vW;
  void main(){
    float y = abs(vUv.y - 0.5) * 2.0;
    float core = smoothstep(vW.y, 0.0, y);
    float glow = exp(-y * 3.5) * 0.55;
    float along = smoothstep(0.0, vW.z, vUv.x) * smoothstep(1.0, 1.0 - vW.z, vUv.x);
    float noise = 1.0;
    if (vW.w > 0.5) noise = 0.75 + 0.25 * sin(vUv.x * 60.0 - uTime * 40.0) * sin(vUv.x * 23.0 + uTime * 17.0);
    float a = (core * 1.8 + glow) * along * noise;
    vec3 c = mix(vCol.rgb, vec3(1.0) * max(max(vCol.r, vCol.g), vCol.b), core * 0.6);
    gl_FragColor = vec4(c * a * vCol.a, 1.0);
  }`;

function beamPool(max) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(1, 1, 8, 1);
  quad.translate(0.5, 0.5, 0);
  geo.index = quad.index; geo.attributes.position = quad.attributes.position; geo.attributes.uv = quad.attributes.uv;
  const aA = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aB = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aW = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aA', aA); geo.setAttribute('aB', aB); geo.setAttribute('aCol', aCol); geo.setAttribute('aW', aW);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: BEAM_VS, fragmentShader: BEAM_FS, uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 21;
  const B = [];
  return {
    mesh, list: B,
    // o: {a, b (Vector3, may be live refs), color, alpha, width, core 0..1, life, taper, jitter, width1, fn(beam,k) per-frame hook}
    spawn(o) {
      if (B.length >= max) B.shift();
      const b = { a: o.a.clone(), b: o.b.clone(), r: o.color.r, g: o.color.g, bl: o.color.b, alpha: o.alpha ?? 1, w0: o.width ?? 0.2, w1: o.width1 ?? o.width ?? 0.2,
        core: o.core ?? 0.25, taper: o.taper ?? 0.08, jitter: o.jitter ? 1 : 0, t: 0, life: o.life ?? 0.25, fn: o.fn || null, hold: o.hold ?? 0 };
      B.push(b);
      return b;
    },
    update(dt, time) {
      mat.uniforms.uTime.value = time;
      let n = 0;
      for (let i = 0; i < B.length; i++) { const b = B[i]; b.t += dt; if (b.t < b.life) B[n++] = b; }
      B.length = n;
      for (let i = 0; i < n; i++) {
        const b = B[i], k = b.t / b.life;
        if (b.fn) b.fn(b, k);
        const fade = k < b.hold ? 1 : 1 - (k - b.hold) / (1 - b.hold || 1);
        aA.setXYZ(i, b.a.x, b.a.y, b.a.z); aB.setXYZ(i, b.b.x, b.b.y, b.b.z);
        aCol.setXYZW(i, b.r, b.g, b.bl, b.alpha * Math.max(0, fade));
        aW.setXYZW(i, b.w0 + (b.w1 - b.w0) * k, b.core, b.taper, b.jitter);
      }
      geo.instanceCount = n;
      if (n) aA.needsUpdate = aB.needsUpdate = aCol.needsUpdate = aW.needsUpdate = true;
    },
  };
}

const RING_VS = /* glsl */`
  attribute vec3 aPos; attribute vec4 aCol; attribute vec4 aR;
  varying vec2 vP; varying vec4 vCol; varying vec4 vR;
  void main(){
    vP = position.xy; vCol = aCol; vR = aR;
    vec3 p;
    if (aR.w > 0.5) { // camera-facing
      vec4 mv = viewMatrix * vec4(aPos, 1.0);
      mv.xy += position.xy * aR.x;
      gl_Position = projectionMatrix * mv;
    } else {
      p = aPos + vec3(position.x, 0.0, -position.y) * aR.x;
      gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
    }
  }`;
const RING_FS = /* glsl */`
  varying vec2 vP; varying vec4 vCol; varying vec4 vR;
  float sdHex(vec2 p, float r){ const vec3 k = vec3(-0.866025404, 0.5, 0.577350269); p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy; p -= vec2(clamp(p.x, -k.z * r, k.z * r), r); return length(p) * sign(p.y); }
  void main(){
    float d = vR.z > 1.5 ? sdHex(vP, 0.86) : length(vP) - 1.0;
    float th = vR.y;
    float ring = smoothstep(th, 0.0, abs(d + th * 0.5));
    float fill = (vR.z > 0.5 && vR.z < 1.5) ? smoothstep(0.0, -1.0, d) * 0.35 + smoothstep(-0.25, 0.0, d) * step(d, 0.0) * 0.4 : 0.0;
    float a = (ring * 1.4 + fill) * vCol.a;
    if (a < 0.003) discard;
    gl_FragColor = vec4(vCol.rgb * a, 1.0);
  }`;

function ringPool(max) {
  const geo = new THREE.InstancedBufferGeometry();
  const quad = new THREE.PlaneGeometry(2, 2);
  geo.index = quad.index; geo.attributes.position = quad.attributes.position; geo.attributes.uv = quad.attributes.uv;
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aR = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPos', aPos); geo.setAttribute('aCol', aCol); geo.setAttribute('aR', aR);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 18;
  const R = [];
  return {
    mesh, list: R,
    // o: {pos, color, alpha, r0, r1, thick, life, kind:0 ring|1 filled disc|2 hex, face: bool (camera-facing), ease}
    spawn(o) {
      if (R.length >= max) R.shift();
      const r = { x: o.pos.x, y: o.pos.y ?? 0.04, z: o.pos.z, c: o.color, alpha: o.alpha ?? 1, r0: o.r0 ?? 0.2, r1: o.r1 ?? 2, th: o.thick ?? 0.12,
        life: o.life ?? 0.5, kind: o.kind ?? 0, face: o.face ? 1 : 0, t: 0, hold: o.hold ?? 0, follow: o.follow || null };
      R.push(r);
      return r;
    },
    update(dt) {
      let n = 0;
      for (let i = 0; i < R.length; i++) { const r = R[i]; r.t += dt; if (r.t < r.life) R[n++] = r; }
      R.length = n;
      for (let i = 0; i < n; i++) {
        const r = R[i], k = r.t / r.life, e = 1 - Math.pow(1 - k, 3);
        if (r.follow) { r.x = r.follow.x; r.z = r.follow.z; }
        const fade = k < r.hold ? 1 : 1 - (k - r.hold) / (1 - r.hold || 1);
        aPos.setXYZ(i, r.x, r.y, r.z);
        aCol.setXYZW(i, r.c.r, r.c.g, r.c.b, r.alpha * fade);
        aR.setXYZW(i, r.r0 + (r.r1 - r.r0) * e, r.th, r.kind, r.face);
      }
      geo.instanceCount = n;
      if (n) aPos.needsUpdate = aCol.needsUpdate = aR.needsUpdate = true;
    },
  };
}


const BUBBLE_VS = /* glsl */`
  attribute vec4 aPosR; attribute vec4 aCol; attribute vec3 aHit;
  varying vec3 vN; varying vec3 vV; varying vec4 vCol; varying vec3 vHit; varying vec3 vL;
  void main(){
    vCol = aCol; vHit = aHit; vL = position;
    vec3 sc = vec3(aPosR.w, aPosR.w * aHit.y, aPosR.w);
    vec4 w = vec4(aPosR.xyz + position * sc, 1.0);
    vec4 mv = viewMatrix * w;
    vN = normalize(mat3(viewMatrix) * (position / sc)); vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
// Energy shield: a fresnel rim with a faint hex lattice; the middle stays almost clear so the unit reads through it.
// Hits (vHit.x) flare the rim and run a bright ripple of hexes across the shell.
const BUBBLE_FS = /* glsl */`
  uniform float uTime;
  varying vec3 vN; varying vec3 vV; varying vec4 vCol; varying vec3 vHit; varying vec3 vL;
  float hexEdge(vec2 p){
    vec2 r = vec2(1.0, 1.732), h = r * 0.5;
    vec2 a = mod(p, r) - h, b = mod(p - h, r) - h;
    vec2 g = dot(a, a) < dot(b, b) ? a : b;
    g = abs(g);
    return max(dot(g, vec2(0.5, 0.866)), g.x);
  }
  void main(){
    float ndv = abs(dot(normalize(vN), vV));
    float f = 1.0 - ndv;
    float rim = pow(f, 4.0) * 0.45 + pow(f, 14.0) * 0.6;
    vec2 q = vec2(atan(vL.z, vL.x) * (14.0 / 6.2832), asin(clamp(vL.y, -1.0, 1.0)) * (7.0 / 3.1416));
    float e = hexEdge(q * 1.0);
    float line = smoothstep(0.43, 0.5, e);
    float hit = vHit.x;
    float wave = smoothstep(0.25, 0.0, abs(fract(vL.y * 0.5 + 0.5 - uTime * 0.35) - 0.5)) * 0.25;
    float ripple = hit * smoothstep(0.35, 0.0, abs((1.0 - vL.y) * 0.5 - (1.0 - hit) * 1.2));
    float hex = line * (f * f * f * 0.3 + wave * f * 0.2 + ripple * (0.25 + 0.6 * f) + hit * 0.06 * f); // battle-6: the ripple fades toward the shell centre so the unit stays solid
    float foot = smoothstep(-0.75, -0.2, vL.y);           // fade where the shell meets the plate
    float a = (rim * (1.0 + hit * 2.0) + hex + hit * 0.02) * foot * vCol.a;
    gl_FragColor = vec4(vCol.rgb * a, 1.0);
  }`;

function bubblePool(max) {
  const ico = new THREE.IcosahedronGeometry(1, 3);
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = ico.index; geo.attributes.position = ico.attributes.position;
  const aPosR = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aHit = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aPosR', aPosR); geo.setAttribute('aCol', aCol); geo.setAttribute('aHit', aHit);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({ vertexShader: BUBBLE_VS, fragmentShader: BUBBLE_FS, uniforms: { uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 17;
  const L = [];
  const v = new THREE.Vector3();
  return {
    mesh, list: L,
    // o: {pos | follow (Object3D), offsetY, radius, color, alpha, life (Infinity = until .kill()), grow}
    spawn(o) {
      if (L.length >= max) L.shift();
      const b = { pos: o.pos ? o.pos.clone() : new THREE.Vector3(), follow: o.follow || null, oy: o.offsetY ?? 0, r: o.radius ?? 1.2, sy: o.stretch ?? 1,
        c: o.color, alpha: o.alpha ?? 0.8, life: o.life ?? 1, t: 0, hit: 0, grow: o.grow ?? 0.15, dead: false,
        flare(k = 1) { b.hit = Math.max(b.hit, k); }, kill() { b.dead = true; b.life = Math.min(b.life, b.t + 0.25); } };
      L.push(b);
      return b;
    },
    update(dt, time) {
      mat.uniforms.uTime.value = time;
      let n = 0;
      for (let i = 0; i < L.length; i++) { const b = L[i]; b.t += dt; if (b.t < b.life) L[n++] = b; }
      L.length = n;
      for (let i = 0; i < n; i++) {
        const b = L[i];
        if (b.follow) { b.follow.getWorldPosition(v); b.pos.copy(v); }
        const kin = b.grow ? Math.min(1, b.t / b.grow) : 1;
        const out = Math.min(1, (b.life - b.t) / 0.25);
        b.hit = Math.max(0, b.hit - dt * 2.2);
        aPosR.setXYZW(i, b.pos.x, b.pos.y + b.oy, b.pos.z, b.r * (0.6 + 0.4 * kin) * (1 + b.hit * 0.05));
        aCol.setXYZW(i, b.c.r, b.c.g, b.c.b, b.alpha * kin * out);
        aHit.setXYZ(i, b.hit, b.sy, 0);
      }
      geo.instanceCount = n;
      if (n) aPosR.needsUpdate = aCol.needsUpdate = aHit.needsUpdate = true;
    },
  };
}

function dronePool(max) {
  const g = new THREE.OctahedronGeometry(0.16, 0); g.scale(1.6, 0.6, 1.6);
  const mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
  mesh.count = 0; mesh.frustumCulled = false;
  const L = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), c = new THREE.Vector3(), e = new THREE.Euler();
  return {
    mesh, list: L,
    // o: {around: Object3D | Vector3, radius, height, speed (rad/s), phase, color, life}
    spawn(o) {
      if (L.length >= max) L.shift();
      const d = { around: o.around, r: o.radius ?? 0.9, h: o.height ?? 1.8, sp: o.speed ?? 2.2, ph: o.phase ?? Math.random() * 6.28,
        color: o.color, life: o.life ?? 3, t: 0, pos: new THREE.Vector3(), kill() { d.life = Math.min(d.life, d.t + 0.2); } };
      L.push(d);
      return d;
    },
    update(dt, time) {
      let n = 0;
      for (let i = 0; i < L.length; i++) { const d = L[i]; d.t += dt; if (d.t < d.life) L[n++] = d; }
      L.length = n;
      for (let i = 0; i < n; i++) {
        const d = L[i];
        if (d.around?.isObject3D) d.around.getWorldPosition(c); else if (d.around) c.copy(d.around); else c.set(0, 0, 0);
        const a = d.ph + d.t * d.sp;
        const kin = Math.min(1, d.t / 0.3, (d.life - d.t) / 0.2);
        d.pos.set(c.x + Math.cos(a) * d.r * kin, c.y + d.h + Math.sin(time * 3 + d.ph) * 0.08, c.z + Math.sin(a) * d.r * kin);
        m4.compose(d.pos, q.setFromEuler(e.set(0, -a, 0)), s.setScalar(Math.max(0.01, kin)));
        mesh.setMatrixAt(i, m4); mesh.setColorAt(i, d.color);
      }
      mesh.count = n;
      if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    },
  };
}


// Growing solid tubes (battle-7, sculptor-19's request): roots, vines, tendrils. Lit MeshStandardMaterial (scene lights + env), one draw
// for every live tube. Geometry is written once per spawn (world space); growth, tip taper and withering run in the vertex shader from
// per-vertex timing, so a live tube costs no CPU per frame. Bark-ish streaks along the length; emissive k for magic vines.
function tubePool(max = 32, SEG = 24, RAD = 6) {
  const VPT = (SEG + 1) * (RAD + 1), NV = max * VPT;
  const geo = new THREE.BufferGeometry();
  const A = (n) => new THREE.BufferAttribute(new Float32Array(NV * n), n).setUsage(THREE.DynamicDrawUsage);
  const aC = A(3), aN = A(3), aR = A(2), aTime = A(4), aCol = A(4), aE = A(3);
  geo.setAttribute('position', aC); geo.setAttribute('aN', aN); geo.setAttribute('aR', aR); geo.setAttribute('aTime', aTime);
  geo.setAttribute('aCol', aCol); geo.setAttribute('aE', aE);
  const idx = [];
  for (let k = 0; k < max; k++) for (let i = 0; i < SEG; i++) for (let j = 0; j < RAD; j++) {
    const a = k * VPT + i * (RAD + 1) + j, b = a + RAD + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  geo.setIndex(idx);
  const uTime = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, envMapIntensity: 0.6 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTubeTime = uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute vec3 aN; attribute vec2 aR; attribute vec4 aTime; attribute vec4 aCol; attribute vec3 aE;
      uniform float uTubeTime; varying vec4 vTCol; varying vec3 vTE; varying vec2 vTS; varying float vTip;`)
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = aN;')
      .replace('#include <begin_vertex>', `
        // aR = (radius, t along 0..1); aTime = (start, grow, life, wither); aE.z = metres along
        float age = uTubeTime - aTime.x;
        float g = clamp(age / max(aTime.y, 1e-3), 0.0, 1.0); g = 1.0 - (1.0 - g) * (1.0 - g);
        float w = clamp((age - (aTime.z - aTime.w)) / max(aTime.w, 1e-3), 0.0, 1.0);
        float front = g * (1.0 - w);                      // grows from the root end, withers back toward it
        float k = smoothstep(front, front - 0.06, aR.y) * step(0.0, age);
        vec3 transformed = position + aN * aR.x * k * (1.0 - w * 0.35);
        vTCol = aCol; vTE = aE; vTS = vec2(aE.z, 0.0);
        vTip = smoothstep(0.12, 0.0, abs(aR.y - front)) * step(0.001, front) * (1.0 - w);`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec4 vTCol; varying vec3 vTE; varying vec2 vTS; varying float vTip;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float bark = 0.72 + 0.28 * sin(vTS.x * 9.0 + sin(vTS.x * 2.3) * 2.0) * sin(vTS.x * 23.0 + 1.7);
        diffuseColor.rgb *= vTCol.rgb * bark;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vTCol.rgb * (vTCol.a * (0.6 + 0.4 * bark) + vTE.y * vTip); // emissive k + a hot growing tip`);
  };
  mat.customProgramCacheKey = () => 'fx-tube';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.visible = false;
  mesh.castShadow = false; mesh.receiveShadow = true;
  const slots = new Array(max).fill(null);
  let time = 0, rr = 0;
  const pool = {
    mesh, max, get list() { return slots.filter((x) => x && time - x.start < x.life); },
    // o: {path (Vector3[] | THREE.Curve), radius, radius1, color, emissive (k, glow = color * k), tipGlow (k), grow (s), life (s), wither (s),
    //     delay (s), bulge(t) -> radius multiplier}; returns { kill(), alive }
    spawn(o) {
      const P = samplePath(o.path, SEG);
      let k = slots.findIndex((x) => !x || time - x.start >= x.life);
      if (k < 0) { k = rr; rr = (rr + 1) % max; }
      const start = time + (o.delay || 0), grow = o.grow ?? 0.35, life = Math.max(grow + 0.05, o.life ?? 2), wither = Math.min(o.wither ?? 0.4, life - grow);
      const r0 = o.radius ?? 0.12, r1 = o.radius1 ?? r0 * 0.25, c = o.color || new THREE.Color(0.32, 0.22, 0.13), em = o.emissive || 0, tip = o.tipGlow || 0;
      const base = k * VPT;
      for (let i = 0; i <= SEG; i++) {
        const t = i / SEG, r = (r0 + (r1 - r0) * t) * (o.bulge ? o.bulge(t) : 1);
        for (let j = 0; j <= RAD; j++) {
          const a = (j / RAD) * Math.PI * 2, cs = Math.cos(a), sn = Math.sin(a), v = base + i * (RAD + 1) + j;
          aC.setXYZ(v, P.pts[i].x, P.pts[i].y, P.pts[i].z);
          aN.setXYZ(v, P.N[i].x * cs + P.B[i].x * sn, P.N[i].y * cs + P.B[i].y * sn, P.N[i].z * cs + P.B[i].z * sn);
          aR.setXY(v, r, t); aTime.setXYZW(v, start, grow, life, wither);
          aCol.setXYZW(v, c.r, c.g, c.b, em); aE.setXYZ(v, 0, tip, P.S[i]);
        }
      }
      for (const at of [aC, aN, aR, aTime, aCol, aE]) { at.addUpdateRange(base * at.itemSize, VPT * at.itemSize); at.needsUpdate = true; }
      const h = { start, life, wither, k, get alive() { return time - h.start < h.life; },
        kill() { if (slots[k] !== h) return; const nl = Math.max(time - h.start + h.wither, 0.01); h.life = nl;
          for (let v = base; v < base + VPT; v++) { aTime.setZ(v, nl); aTime.setW(v, Math.min(h.wither, nl)); }
          aTime.addUpdateRange(base * 4, VPT * 4); aTime.needsUpdate = true; } };
      slots[k] = h;
      return h;
    },
    update(dt) {
      time += dt; uTime.value = time;
      let any = false;
      for (const x of slots) if (x && time - x.start < x.life) { any = true; break; }
      mesh.visible = any;
    },
    clear() { slots.fill(null); mesh.visible = false; },
  };
  return pool;
}

export function createVFX(scene, tier = {}) {
  const max = tier.particles || 1200;
  const add = particlePool(max, 'add');
  const alpha = particlePool(Math.round(max * 0.35), 'alpha');
  const dark = particlePool(96, 'dark');
  const tubes = tubePool(tier.name === 'low' ? 16 : 32);
  const beams = beamPool(160);
  const rings = ringPool(96);
  const bubbles = bubblePool(24);
  const drones = dronePool(24);
  scene.add(tubes.mesh, alpha.mesh, dark.mesh, add.mesh, beams.mesh, rings.mesh, bubbles.mesh, drones.mesh);
  // two pooled flash lights; kept in the scene at 0 so the light count (and shader programs) never change
  const lights = [0, 1].map(() => { const l = new THREE.PointLight(0xffffff, 0, 9, 2); l.position.set(0, -50, 0); l.layers.enableAll(); scene.add(l); return { l, t: 1, life: 1, i0: 0 }; });
  let li = 0;
  return {
    add, alpha, dark, tubes, beams, rings, bubbles, drones,
    flash(pos, color, intensity = 30, life = 0.25) {
      if (!pos || !Number.isFinite(pos.x + pos.y + pos.z)) return; // a NaN light poisons every lit pixel
      const L = lights[li++ % lights.length];
      L.l.position.copy(pos); L.l.color.copy(color); L.i0 = intensity; L.t = 0; L.life = life;
    },
    update(dt, time) {
      add.update(dt); alpha.update(dt); dark.update(dt); tubes.update(dt); beams.update(dt, time); rings.update(dt); bubbles.update(dt, time); drones.update(dt, time);
      for (const L of lights) { L.t += dt; const k = Math.min(1, L.t / L.life); L.l.intensity = L.i0 * (1 - k) * (1 - k); }
    },
    count() { return add.list.length + alpha.list.length + dark.list.length + tubes.list.length + beams.list.length + rings.list.length + bubbles.list.length + drones.list.length; },
    clear() { tubes.clear(); add.list.length = alpha.list.length = dark.list.length = beams.list.length = rings.list.length = bubbles.list.length = drones.list.length = 0; },
  };
}
