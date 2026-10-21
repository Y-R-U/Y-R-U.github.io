import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.42, 0.72, 0.55).normalize();
export const FOG_COLOR = new THREE.Color('#bfd2e4');
export const FOG_DENSITY = 0.00026;
const HAZE_H = 1100;

// Aerial perspective for every fogged material: height-falloff exponential haze (thick near the ground, thin aloft),
// warmed toward the sun, and a hard fade to the haze colour before the terrain edge. scene.fog must be FogExp2.
let atmosphereInstalled = false;
function installAtmosphere() {
  if (atmosphereInstalled) return;
  atmosphereInstalled = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = '#ifdef USE_FOG\n varying float vFogDepth; varying vec3 vFogDir;\n#endif';
  C.fog_vertex = '#ifdef USE_FOG\n vFogDepth = - mvPosition.z; vFogDir = (vec4(mvPosition.xyz, 0.0) * viewMatrix).xyz;\n#endif';
  C.fog_pars_fragment = `#ifdef USE_FOG
  uniform vec3 fogColor; varying float vFogDepth; varying vec3 vFogDir;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
  const s = SUN_DIR;
  C.fog_fragment = `#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fDist = length(vFogDir);
    float fa = exp(-max(cameraPosition.y, 0.0) / ${HAZE_H.toFixed(1)}), fb = exp(-max(cameraPosition.y + vFogDir.y, 0.0) / ${HAZE_H.toFixed(1)});
    float fAvg = abs(vFogDir.y) > 1.0 ? ${HAZE_H.toFixed(1)} * (fa - fb) / vFogDir.y : fa;
    float fogFactor = 1.0 - exp(-fogDensity * fDist * fAvg);
    fogFactor = max(fogFactor, smoothstep(9000.0, 13800.0, fDist));
    float fSun = pow(max(dot(vFogDir / max(fDist, 1e-3), vec3(${s.x.toFixed(4)}, ${s.y.toFixed(4)}, ${s.z.toFixed(4)})), 0.0), 5.0);
    vec3 fCol = mix(fogColor, vec3(1.0, 0.93, 0.8), fSun * 0.45);
    gl_FragColor.rgb = mix(gl_FragColor.rgb * mix(vec3(1.0), vec3(0.92, 0.97, 1.04), fogFactor), fCol, fogFactor);
  #else
    float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
#endif`;
}

const skyVert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */`
uniform vec3 uSun, uZenith, uHorizon, uGround, uHaze;
uniform float uTime, uClouds;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a*n(p); p = p*2.07 + 3.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float t = pow(clamp(y, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uZenith, t);
  float sd = max(dot(d, uSun), 0.0);
  col = mix(col, uHaze, (1.0 - smoothstep(0.0, 0.09, abs(y))) * 0.85);
  col += vec3(1.0, 0.85, 0.6) * (pow(sd, 8.0) * 0.16 + pow(sd, 64.0) * 0.3);
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, sd) * 3.0;
  if (y > 0.0 && uClouds > 0.0) {
    vec2 uv = d.xz / (y + 0.08) * 1.4 + vec2(uTime * 0.004, 0.0);
    vec2 toSun = normalize(uSun.xz + 1e-4) * 0.12;
    float c0 = fbm(uv);
    float c = smoothstep(0.5, 0.74, c0);
    float c1 = smoothstep(0.5, 0.74, fbm(uv + toSun));
    float lit = clamp(0.62 + (c - c1) * 1.6, 0.25, 1.0);
    float fine = fbm(uv * 3.1 + 7.0);
    vec3 cc = mix(vec3(0.6, 0.66, 0.76), vec3(1.04, 1.02, 0.98), lit * (0.8 + 0.3 * fine));
    cc += vec3(1.0, 0.88, 0.7) * pow(sd, 10.0) * (1.0 - c) * 0.9;
    float a = c * smoothstep(0.0, 0.18, y) * uClouds;
    col = mix(col, cc, a * 0.95);
  }
  col = mix(col, uGround, smoothstep(0.0, -0.06, y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky(quality) {
  installAtmosphere();
  const mat = new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag,
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uZenith: { value: new THREE.Color('#2a66bd') },
      uHorizon: { value: new THREE.Color('#a9c8e8') },
      uHaze: { value: FOG_COLOR.clone() },
      uGround: { value: FOG_COLOR.clone() },
      uTime: { value: 0 },
      uClouds: { value: 1 },
    },
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, quality === 'low' ? 24 : 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -100;
  sky.name = 'sky';
  return sky;
}

export function createLights(scene, quality) {
  const hemi = new THREE.HemisphereLight('#cfe3ff', '#5d6b45', 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff1dc', 3.0);
  sun.name = 'sun';
  sun.castShadow = true;
  const s = sun.shadow;
  s.mapSize.set(quality === 'low' ? 1024 : 2048, quality === 'low' ? 1024 : 2048);
  s.bias = -0.0004;
  s.normalBias = 0.6;
  s.camera.near = 10;
  s.camera.far = 2400;
  setShadowFocus(sun, -40, -170, 430);
  scene.add(sun, sun.target);
  scene.fog = new THREE.FogExp2(FOG_COLOR.clone(), FOG_DENSITY);
  return { hemi, sun };
}

// Square ortho shadow box of half-size r centred on (x,z), sun along SUN_DIR.
export function setShadowFocus(sun, x, z, r) {
  sun.target.position.set(x, 0, z);
  sun.position.set(x + SUN_DIR.x * 1200, SUN_DIR.y * 1200, z + SUN_DIR.z * 1200);
  const c = sun.shadow.camera;
  c.left = -r; c.right = r; c.top = r; c.bottom = -r;
  c.updateProjectionMatrix();
  sun.target.updateMatrixWorld();
}

export function bakeEnvironment(renderer, sky) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const m = sky.clone();
  m.material = sky.material.clone();
  m.material.uniforms.uClouds.value = 0;
  m.material.uniforms.uGround.value = new THREE.Color('#6b7a5a');
  s.add(m);
  const rt = pm.fromScene(s, 0, 0.1, 2000);
  m.material.dispose();
  pm.dispose();
  return rt.texture;
}
