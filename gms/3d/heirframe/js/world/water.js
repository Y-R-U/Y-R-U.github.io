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
    vec3 mapN = normalize( vec3( ( n1.xy + n2.xy ) * normalScale, 1.0 ) );
    normal = normalize( tbn * mapN );
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
