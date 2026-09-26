import * as THREE from 'three';
import { makeWaterNormal } from './textures.js';
import { REFLECT_LAYER, addPlanarReflection } from '../fx/reflection.js';

export function createWaterMaterial(ctx, { color = 0x2f6f86, reflect = false } = {}) {
  const n = ctx.cache.waterNormal ||= makeWaterNormal(256);
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.04, metalness: 0.0, normalMap: n,
    normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.6, transparent: false });
  const u = { uTime: ctx.time };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <normal_fragment_maps>', `
  {
    vec3 n1 = texture2D( normalMap, vNormalMapUv + vec2( uTime * 0.013, uTime * 0.007 ) ).xyz * 2.0 - 1.0;
    vec3 n2 = texture2D( normalMap, vNormalMapUv * 1.7 + vec2( -uTime * 0.009, uTime * 0.016 ) ).xyz * 2.0 - 1.0;
    vec2 nxy = ( n1.xy + n2.xy ) * normalScale;
    // specular anti-aliasing: where the ripples are sub-pixel (distance, grazing angles) flatten them and widen the
    // highlight, so the sun doesn't resolve as single-pixel sparkles that bloom into squares
    float nvar = length( fwidth( nxy ) );
    float farK = 0.0;
    #ifdef USE_FOG
      farK = smoothstep( 12.0, 70.0, vFogDepth );
    #endif
    nxy *= 1.0 - 0.65 * farK;
    vec3 mapN = normalize( vec3( nxy, 1.0 ) );
    normal = normalize( tbn * mapN );
    roughnessFactor = clamp( max( roughnessFactor, nvar * 1.2 + farK * 0.05 ), 0.0, 0.2 );
  }`);
  };
  m.customProgramCacheKey = () => 'water';
  if (reflect && ctx.reflection?.enabled) addPlanarReflection(m, ctx.reflection, { strength: 1.0, base: 0.5, blur: 1.2, distort: 0.12 });
  return m;
}

// Animated falling-water sheet. `profile` is the fall curve; width along local X.
export function createWaterfall(ctx, { width = 20, height = 20, lip = 2.5, segsX = 24, segsY = 24, bright = 1.0 } = {}) {
  const g = new THREE.PlaneGeometry(width, 1, segsX, segsY);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const t = 1 - uv.getY(i); // 0 at top
    const drop = Math.pow(t, 1.0);
    const out = lip * Math.sqrt(Math.min(1, t * 3)) + t * 1.2;
    p.setY(i, -drop * height);
    p.setZ(i, out + Math.sin(uv.getX(i) * 9.0) * 0.25 * t);
  }
  g.computeVertexNormals();
  const m = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uBright: { value: bright } }]),
    vertexShader: /* glsl */`
      varying vec2 vUv;
      #include <fog_pars_vertex>
      void main() { vUv = uv; vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 ); gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uBright;
      varying vec2 vUv;
      #include <fog_pars_fragment>
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float t = 1.0 - vUv.y;
        vec2 p = vec2( vUv.x * 60.0, t * 6.0 - uTime * 2.2 );
        float s = n( vec2( p.x, p.y ) ) * 0.55 + n( vec2( p.x * 2.3, p.y * 2.0 - uTime ) ) * 0.3 + n( vec2( p.x * 5.0, p.y * 4.0 ) ) * 0.15;
        float streak = smoothstep( 0.35, 0.8, s );
        float foam = smoothstep( 0.75, 1.0, t ) * ( 0.6 + 0.4 * n( vec2( vUv.x * 30.0, uTime * 3.0 ) ) );
        vec3 deep = vec3( 0.55, 0.78, 0.9 );
        vec3 white = vec3( 1.0, 0.98, 0.95 );
        vec3 col = mix( deep, white, clamp( streak + foam, 0.0, 1.0 ) ) * uBright;
        float edge = smoothstep( 0.0, 0.04, vUv.x ) * smoothstep( 1.0, 0.96, vUv.x );
        float a = ( 0.5 + 0.5 * streak + foam ) * edge * smoothstep( 0.0, 0.03, t );
        gl_FragColor = vec4( col, clamp( a, 0.0, 0.95 ) );
        #include <fog_fragment>
      }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
  });
  m.uniforms.uTime = ctx.time;
  const mesh = new THREE.Mesh(g, m);
  mesh.layers.enable(REFLECT_LAYER);
  return mesh;
}

// Soft rising spray at the foot of a fall.
export function createMist(ctx, { x, y, z, w = 20, d = 4, count = 160, size = 6 }) {
  const pos = new Float32Array(count * 3), seed = new Float32Array(count);
  for (let i = 0; i < count; i++) { pos[i * 3] = (Math.random() - 0.5) * w; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = (Math.random() - 0.3) * d; seed[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.time, uSize: { value: size }, uScale: ctx.pxScale },
    vertexShader: /* glsl */`
      attribute float seed; uniform float uTime, uSize, uScale; varying float vA;
      void main() {
        float t = fract( seed + uTime * 0.12 );
        vec3 p = position; p.y += t * 6.0; p.z += t * 3.0; p.x += sin( seed * 40.0 + uTime ) * 0.6;
        vA = sin( t * 3.14159 ) * 0.22;
        vec4 mv = modelViewMatrix * vec4( p, 1.0 );
        gl_PointSize = uSize * uScale * ( 1.0 + t * 1.5 ) / max( -mv.z, 1.0 );
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying float vA;
      void main() { vec2 c = gl_PointCoord - 0.5; float a = smoothstep( 0.5, 0.0, length( c ) ) * vA; gl_FragColor = vec4( vec3( 1.0, 0.98, 0.95 ) * 0.7 * a, a ); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, m);
  pts.position.set(x, y, z);
  pts.frustumCulled = false;
  return pts;
}

// The east basin. Depth colour from a shore distance field (turquoise shallows → deep teal), a foam line at the stone,
// world-space normals (two scrolling ripple scales + a slow analytic swell, so nothing tiles), churn + white water where the
// falls land, cheap caustics in the shallows, and specular anti-aliasing so the sun reads as a glitter streak, not squares.
// `shore`: { walls: [[x0,z0,x1,z1], ...] axis-aligned solid boxes, discs: [[x,z,r], ...], churn: [[x0,z0,x1,z1,k], ...] }
export function createLakeMaterial(ctx, { shore }) {
  const n = ctx.cache.waterNormal ||= makeWaterNormal(256);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.035, metalness: 0.0, envMapIntensity: 1.5 });
  const u = { uTime: ctx.time, tRip: { value: n } };
  const box = (b) => `sdBox(p, vec2(${((b[0] + b[2]) / 2).toFixed(2)}, ${((b[1] + b[3]) / 2).toFixed(2)}), vec2(${((b[2] - b[0]) / 2).toFixed(2)}, ${((b[3] - b[1]) / 2).toFixed(2)}))`;
  const sdf = [...shore.walls.map(box), ...shore.discs.map(([x, z, r]) => `(length(p - vec2(${x.toFixed(2)}, ${z.toFixed(2)})) - ${r.toFixed(2)})`)]
    .reduce((a, b) => `min(${a}, ${b})`);
  const churn = shore.churn.map((c) => `${c[4].toFixed(2)} * (1.0 - smoothstep(0.0, 6.0, ${box(c)}))`).join(' + ') || '0.0';
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform float uTime; uniform sampler2D tRip;
float lkH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float lkN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(lkH(i), lkH(i + vec2(1, 0)), f.x), mix(lkH(i + vec2(0, 1)), lkH(i + vec2(1, 1)), f.x), f.y); }
float sdBox(vec2 p, vec2 c, vec2 h){ vec2 d = abs(p - c) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float lkShore(vec2 p){ return ${sdf}; }
float lkChurn(vec2 p){ return clamp(${churn}, 0.0, 1.0); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 lkP = vec2(0.0); float lkD = 30.0, lkFoam = 0.0, lkC = 0.0, lkFar = 0.0;
#ifdef USE_FOG
  lkP = vFogWorldPos.xz;
  lkFar = smoothstep(15.0, 90.0, vFogDepth);
#endif
{
  lkD = lkShore(lkP);
  lkC = lkChurn(lkP);
  float deep = smoothstep(0.5, 11.0, lkD + (lkN(lkP * 0.06) - 0.5) * 4.0);
  vec3 shallow = vec3(0.12, 0.46, 0.46), mid = vec3(0.04, 0.24, 0.3), abyss = vec3(0.015, 0.085, 0.12);
  vec3 wc = mix(shallow, mid, smoothstep(0.0, 0.45, deep));
  wc = mix(wc, abyss, smoothstep(0.4, 1.0, deep));
  // caustic web on the shallow floor
  vec2 cq = lkP * 0.55;
  float ca = sin(cq.x * 2.1 + uTime * 1.3 + sin(cq.y * 1.7 + uTime)) + sin(cq.y * 2.3 - uTime * 1.1 + sin(cq.x * 1.9 - uTime * 0.7));
  float caus = pow(1.0 - abs(ca) * 0.5, 6.0) * (1.0 - smoothstep(0.0, 6.0, lkD)) * (1.0 - lkFar);
  wc += vec3(0.25, 0.45, 0.4) * caus * 0.5;
  // foam: a soft broken line where water meets stone, plus white water where the falls land
  float fn = lkN(lkP * 1.3 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6 + lkN(lkP * 3.7 - uTime * 0.4) * 0.4;
  float edge = 1.0 - smoothstep(0.0, 0.9 + fn * 0.8, lkD);
  float fall = lkC * smoothstep(0.35, 0.75, fn + lkC * 0.35);
  lkFoam = clamp(edge * smoothstep(0.25, 0.6, fn + edge * 0.3) + fall, 0.0, 1.0);
  diffuseColor.rgb = mix(wc, vec3(0.92, 0.95, 0.96), lkFoam);
}`)
      .replace('#include <normal_fragment_maps>', `
{
  // world-space height gradient: slow swell (analytic) + two scrolling ripple layers (texture)
  vec2 p = lkP;
  vec2 g = vec2(0.0);
  g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.09 + uTime * 0.35) * 0.09 * 0.12;
  g += vec2(-0.5, 0.86) * cos(dot(p, vec2(-0.5, 0.86)) * 0.13 - uTime * 0.28) * 0.13 * 0.08;
  vec2 r1 = texture2D(tRip, p / 11.0 + vec2(uTime * 0.012, uTime * 0.007)).xy * 2.0 - 1.0;
  vec2 r2 = texture2D(tRip, p / 4.3 + vec2(-uTime * 0.02, uTime * 0.026)).xy * 2.0 - 1.0;
  vec2 rip = (r1 * 0.22 + r2 * 0.14) * (0.45 + 1.1 * lkN(p * 0.045 + uTime * 0.02));  // patchy wind: breaks the tiling
  float nv = length(fwidth(rip));
  rip *= (1.0 - 0.6 * lkFar) * (1.0 + lkC * 2.2) * (1.0 - 0.7 * lkFoam);
  g += rip;
  vec3 nW = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
  // specular AA: sub-pixel ripples widen the highlight instead of aliasing into single-pixel sparkles
  roughnessFactor = clamp(max(roughnessFactor, nv * 1.1 + lkFar * 0.04), 0.0, 0.22);
  roughnessFactor = mix(roughnessFactor, 0.75, lkFoam);
}`);
  };
  m.customProgramCacheKey = () => 'lake';
  return m;
}
