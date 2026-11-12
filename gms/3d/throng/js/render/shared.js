import * as THREE from 'three';

export function fogUniforms() {
  return THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
}

export function createShared() {
  const sunDir = new THREE.Vector3(-0.62, 0.52, 0.58).normalize();
  const sxz = new THREE.Vector2(-sunDir.x, -sunDir.z).normalize();
  return {
    uTime: { value: 0 },
    uFigScale: { value: 1 },
    uSunDir: { value: sunDir },
    uSunXZ: { value: sxz },
    uSunCol: { value: new THREE.Color(1.0, 0.66, 0.38).multiplyScalar(1.65) },
    uSkyCol: { value: new THREE.Color(0.26, 0.30, 0.52) },
    uGroundCol: { value: new THREE.Color(0.22, 0.15, 0.14) },
    uRimCol: { value: new THREE.Color(1.0, 0.62, 0.32).multiplyScalar(0.55) },
    uLampCol: { value: new THREE.Color(1.0, 0.62, 0.28).multiplyScalar(1.5) },
    uInfo: { value: null },
    uInfoXf: { value: new THREE.Vector4(-150, -150, 1 / 300, 1 / 300) },
    uFocus: { value: new THREE.Vector4(0, 0, 10, 0) },
    uReflSky: { value: new THREE.Color(0x6e5562) },
  };
}

export const shaderCommon = {
  lightPars: /* glsl */`
uniform sampler2D uInfo;
uniform vec4 uInfoXf;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uSkyCol;
uniform vec3 uGroundCol;
uniform vec3 uRimCol;
uniform vec3 uLampCol;
uniform vec3 uReflSky;
vec3 sampleInfo(vec2 xz) {
  vec2 uv = (xz - uInfoXf.xy) * uInfoXf.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return vec3(1.0, 0.0, 0.0);
  return texture2D(uInfo, uv).rgb;
}
vec3 lightAt(vec3 n, vec3 info) {
  float sun = max(dot(n, uSunDir), 0.0) * (0.25 + 0.75 * info.r);
  vec3 hemi = mix(uGroundCol, uSkyCol, n.y * 0.5 + 0.5);
  return uSunCol * sun + hemi + uLampCol * info.b * (0.55 + 0.45 * max(n.y, 0.0));
}
`,
  bayer: /* glsl */`
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  int i = int(q.x + q.y * 4.0);
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  for (int k = 0; k < 16; k++) if (k == i) return (m[k] + 0.5) / 16.0;
  return 0.5;
}
`,
};

export function linColor(hex) {
  return new THREE.Color(hex);
}
