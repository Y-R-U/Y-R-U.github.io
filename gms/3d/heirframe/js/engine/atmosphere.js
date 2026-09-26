import * as THREE from 'three';

// Camera looks north (-Z). Low warm sun in the west-north-west; the pale planet hangs north-east,
// high enough (~40°) that the glossy floor reflects it at the default camera pitch.
export const SUN_DIR = new THREE.Vector3(0.74, 0.50, -0.45).normalize();
export const PLANET_DIR = new THREE.Vector3(0.30, 0.62, -0.72).normalize();
export const SUN_COLOR = new THREE.Color(1.0, 0.80, 0.58);
export const HAZE_COLOR = new THREE.Color(0.70, 0.76, 0.85);
export const SUN_HAZE_COLOR = new THREE.Color(1.0, 0.80, 0.56);

const v3 = (v) => `vec3(${v.x.toFixed(4)},${v.y.toFixed(4)},${v.z.toFixed(4)})`;
const c3 = (c) => `vec3(${c.r.toFixed(4)},${c.g.toFixed(4)},${c.b.toFixed(4)})`;

// Height + distance fog with sun in-scattering, patched into every built-in material.
export function installFog() {
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
#endif`;
  C.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorldPos = transpose( mat3( viewMatrix ) ) * ( mvPosition.xyz - viewMatrix[3].xyz );
#endif`;
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif`;
  C.fog_fragment = `#ifdef USE_FOG
  {
    vec3 fr = vFogWorldPos - cameraPosition;
    float fd = max( length( fr ), 1e-3 );
    vec3 fdir = fr / fd;
    const float HB = 0.0085;
    float camH = max( abs( cameraPosition.y ) + 6.0, 0.0 );
    float k = fdir.y * HB * fd;
    float ht = abs( k ) > 1e-3 ? ( 1.0 - exp( -k ) ) / k : 1.0 - 0.5 * k;
    float optical = exp( -camH * HB ) * fd * ht;
    #ifdef FOG_EXP2
      float fogAmt = 1.0 - exp( - fogDensity * max( optical - 30.0, 0.0 ) );
    #else
      float fogAmt = smoothstep( fogNear, fogFar, vFogDepth );
    #endif
    fogAmt = clamp( fogAmt, 0.0, 0.93 );
    float sunAmt = pow( max( dot( fdir, ${v3(SUN_DIR)} ), 0.0 ), 5.0 );
    vec3 fcol = mix( fogColor, ${c3(SUN_HAZE_COLOR)} * 1.25, sunAmt * 0.8 );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fcol, fogAmt );
  }
#endif`;
}

const skyGLSL = /* glsl */`
uniform float uTime;
uniform float uEnv;
varying vec3 vDir;
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float hash1(float x){ return fract(sin(x*127.1)*43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
vec3 skyColor(vec3 d){
  const vec3 SUN = ${v3(SUN_DIR)};
  const vec3 PL = ${v3(PLANET_DIR)};
  float el = d.y;
  float sd = max(dot(d, SUN), 0.0);
  vec3 zen = vec3(0.13, 0.30, 0.72);
  vec3 mid = vec3(0.40, 0.58, 0.88);
  vec3 hor = vec3(1.0, 0.88, 0.74);
  float e = max(el, 0.0);
  vec3 col = mix(hor, mid, smoothstep(0.0, 0.28, e));
  col = mix(col, zen, smoothstep(0.25, 0.95, e));
  col += vec3(1.0, 0.62, 0.32) * pow(sd, 6.0) * 0.9 * (1.0 - smoothstep(0.0, 0.6, e));
  col += vec3(1.0, 0.80, 0.55) * pow(sd, 48.0) * 2.5;
  col += vec3(1.0, 0.92, 0.80) * smoothstep(0.9993, 0.9997, sd) * 40.0;

  // planet: pale, lit from the sun, softened by atmosphere
  float pc = dot(d, PL);
  float R = 0.13;
  float ang = acos(clamp(pc, -1.0, 1.0));
  if (ang < R * 1.35) {
    vec3 t = normalize(cross(PL, vec3(0.0, 1.0, 0.0)));
    vec3 b = cross(t, PL);
    vec2 q = vec2(dot(d - PL * pc, t), dot(d - PL * pc, b)) / sin(R);
    float r2 = dot(q, q);
    if (r2 < 1.0) {
      vec3 n = normalize(q.x * t + q.y * b + sqrt(1.0 - r2) * PL);
      float lit = smoothstep(-0.15, 0.6, dot(n, SUN));
      float bands = fbm(vec2(q.x * 2.0 + q.y * 0.6, q.y * 11.0) + 3.0) * 0.65 + fbm(q * 9.0) * 0.35;
      vec3 surf = mix(vec3(0.62, 0.60, 0.62), vec3(1.0, 0.93, 0.84), bands);
      float crater = smoothstep(0.62, 0.7, noise(q * 14.0)) * 0.18;
      surf *= 1.0 - crater;
      vec3 pcol = surf * (0.08 + 1.35 * lit) + vec3(0.25, 0.35, 0.5) * 0.12 * (1.0 - lit);
      float rim = pow(1.0 - sqrt(max(1.0 - r2, 0.0)), 3.0);
      pcol += vec3(0.6, 0.75, 1.0) * rim * 0.35;
      float edge = smoothstep(1.0, 0.97, r2);
      col = mix(col, pcol + col * 0.18, edge * 0.93);
    }
    float halo = smoothstep(R * 1.35, R, ang);
    col += vec3(0.9, 0.9, 1.0) * halo * halo * 0.12;
  }

  // clouds on a virtual plane
  if (el > 0.0) {
    vec2 cp = d.xz / (el + 0.08) * 1.4 + vec2(uTime * 0.004, 0.0);
    float c = fbm(cp * 0.9);
    c = smoothstep(0.52, 0.85, c) * smoothstep(0.0, 0.18, el);
    float cl = fbm(cp * 0.9 + SUN.xz * 0.15);
    vec3 ccol = mix(vec3(1.05, 1.0, 0.96), vec3(0.78, 0.8, 0.86), smoothstep(0.35, 0.8, cl));
    ccol += vec3(1.0, 0.7, 0.4) * pow(sd, 4.0) * 0.8;
    col = mix(col, ccol, c * 0.85);
  }

  // far-city silhouette and mountains on the horizon band (gives chrome something to reflect)
  float az = atan(d.x, -d.z);
  float mtn = 0.035 + 0.05 * fbm(vec2(az * 2.2, 1.3)) + 0.02 * noise(vec2(az * 14.0, 0.5));
  vec3 hz = mix(vec3(0.74, 0.73, 0.74), vec3(1.0, 0.82, 0.62), pow(sd, 3.0));
  if (el < mtn) col = mix(col, hz * 0.92, 0.75 * smoothstep(-0.01, 0.02, el));
  float cell = floor(az * 55.0);
  float bh = 0.012 + pow(hash1(cell), 3.0) * 0.08 * (0.5 + 0.5 * sin(az * 3.0 + 1.0));
  bh *= step(0.25, hash1(cell + 7.0));
  if (el < bh) {
    vec3 bc = mix(vec3(0.46, 0.52, 0.62), hz, 0.55 + 0.3 * smoothstep(0.0, bh, el));
    col = mix(col, bc, 0.85);
  }
  // below the horizon: pale haze melting into warm city ground
  if (el < 0.0) {
    vec3 gnd = uEnv > 0.5 ? vec3(0.42, 0.38, 0.33) : hz * 0.95;
    col = mix(hz * 0.95, gnd, smoothstep(0.0, -0.25, el));
  }
  return col;
}
`;

export function createSkyMaterial(forEnv = false) {
  return new THREE.ShaderMaterial({
    name: 'Sky',
    uniforms: { uTime: { value: 0 }, uEnv: { value: forEnv ? 1 : 0 } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize( ( modelMatrix * vec4( position, 0.0 ) ).xyz );
        vec4 p = projectionMatrix * viewMatrix * vec4( ( modelMatrix * vec4( position, 1.0 ) ).xyz, 1.0 );
        gl_Position = p.xyww;
      }`,
    fragmentShader: skyGLSL + /* glsl */`
      void main() { gl_FragColor = vec4( skyColor( normalize( vDir ) ), 1.0 ); }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true, fog: false,
  });
}

// Sky dome that follows the camera. Rendered at the far plane (xyww) so it never clips.
export function createSky() {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), createSkyMaterial(false));
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  mesh.name = 'sky';
  mesh.onBeforeRender = (r, s, cam) => { mesh.position.copy(cam.position); mesh.updateMatrixWorld(); };
  return mesh;
}

export function buildEnvironment(renderer, size = 256) {
  const envScene = new THREE.Scene();
  const m = new THREE.Mesh(new THREE.SphereGeometry(50, 64, 32), createSkyMaterial(true));
  m.material.depthTest = false;
  envScene.add(m);
  // A few warm/cool "architecture" cards so chrome shows structure, not only sky.
  const card = (color, x, y, z, w, h, ry) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    p.position.set(x, y, z); p.rotation.y = ry; envScene.add(p);
  };
  card(new THREE.Color(2.2, 1.9, 1.5), -30, 2, 10, 16, 6, 1.2);
  card(new THREE.Color(0.35, 0.8, 1.6), 28, 1, 14, 10, 4, -1.0);
  card(new THREE.Color(0.1, 0.1, 0.12), 0, -1, 30, 40, 3, 0);
  card(new THREE.Color(1.8, 1.5, 1.1), 20, 6, -28, 12, 10, 0.4);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0, 0.1, 200, { size });
  pmrem.dispose();
  envScene.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return rt.texture;
}
