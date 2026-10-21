import * as THREE from 'three';

export const SUN_DIR = new THREE.Vector3(-0.42, 0.72, 0.55).normalize();
export const FOG_COLOR = new THREE.Color('#c9d9e6');

const skyVert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const skyFrag = /* glsl */`
uniform vec3 uSun, uZenith, uHorizon, uGround;
uniform float uTime, uClouds;
varying vec3 vDir;
float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a*n(p); p = p*2.07 + 3.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float t = pow(clamp(y, 0.0, 1.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  float sd = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.85, 0.6) * (pow(sd, 8.0) * 0.18 + pow(sd, 64.0) * 0.35);
  col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, sd) * 3.0;
  if (y > 0.0 && uClouds > 0.0) {
    vec2 uv = d.xz / (y + 0.06) * 1.6 + vec2(uTime * 0.004, 0.0);
    float c = fbm(uv);
    c = smoothstep(0.52, 0.78, c) * smoothstep(0.0, 0.12, y);
    float shade = 0.82 + 0.18 * fbm(uv * 1.7 + 4.0);
    vec3 cc = mix(vec3(0.78, 0.82, 0.88), vec3(1.0), shade) + vec3(1.0, 0.9, 0.75) * pow(sd, 6.0) * 0.25;
    col = mix(col, cc, c * 0.9 * uClouds);
  }
  col = mix(col, uGround, smoothstep(0.0, -0.08, y));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function createSky(quality) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag,
    uniforms: {
      uSun: { value: SUN_DIR.clone() },
      uZenith: { value: new THREE.Color('#2f6fc2') },
      uHorizon: { value: new THREE.Color('#c6dcef') },
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
  scene.fog = new THREE.Fog(FOG_COLOR.clone(), 1500, 14000);
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
