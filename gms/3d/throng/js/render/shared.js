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
    uAccScale: { value: 1 },
    uSunDir: { value: sunDir },
    uSunXZ: { value: sxz },
    uSunCol: { value: new THREE.Color(1.0, 0.66, 0.38).multiplyScalar(1.65) },
    uSkyCol: { value: new THREE.Color(0.26, 0.30, 0.52) },
    uGroundCol: { value: new THREE.Color(0.22, 0.15, 0.14) },
    uRimCol: { value: new THREE.Color(1.0, 0.62, 0.32).multiplyScalar(0.55) },
    uRimDark: { value: 0 },
    uLampCol: { value: new THREE.Color(1.0, 0.62, 0.28).multiplyScalar(1.5) },
    uInfo: { value: null },
    uInfoXf: { value: new THREE.Vector4(-150, -150, 1 / 300, 1 / 300) },
    uFocus: { value: new THREE.Vector4(0, 0, 10, 0) },
    uReflSky: { value: new THREE.Color(0x6e5562) },
    uWinK: { value: 1 },
    uSnow: { value: 0 },
    uWet: { value: 1 },
    uRain: { value: 0 },
    uWind: { value: 0 },
    // safe circle: x, z, r, on (0..1); everything outside is tinted as dangerous
    uSafe: { value: new THREE.Vector4(0, 0, 1e4, 0) },
    uSafeCol: { value: new THREE.Color(1.0, 0.18, 0.12) },
  };
}

const SAFE = /* glsl */`
uniform vec4 uSafe;
uniform vec3 uSafeCol;
// outside the safe circle: desaturated, darker and red-tinted
float outsideSafe(vec2 xz) {
  if (uSafe.w < 0.001) return 0.0;
  return smoothstep(0.0, 2.5, length(xz - uSafe.xy) - uSafe.z) * uSafe.w;
}
vec3 safeTint(vec3 col, vec2 xz) {
  float o = outsideSafe(xz);
  if (o <= 0.0) return col;
  float l = dot(col, vec3(0.3, 0.55, 0.15));
  vec3 g = mix(col, vec3(l), 0.75) * 0.62;
  return mix(col, g + uSafeCol * (0.06 + l * 0.35), o);
}
`;

export const shaderCommon = {
  safe: SAFE,
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
${SAFE}`,
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

// applies a theme's lighting to the shared uniforms
export function applyThemeLight(shared, T) {
  shared.uSunDir.value.set(T.sun[0], T.sun[1], T.sun[2]).normalize();
  shared.uSunXZ.value.set(-shared.uSunDir.value.x, -shared.uSunDir.value.z).normalize();
  shared.uSunCol.value.setRGB(T.sunCol[0], T.sunCol[1], T.sunCol[2]).multiplyScalar(T.sunCol[3]);
  shared.uSkyCol.value.setRGB(T.sky[0], T.sky[1], T.sky[2]);
  shared.uGroundCol.value.setRGB(T.ground[0], T.ground[1], T.ground[2]);
  shared.uRimCol.value.setRGB(T.rim[0], T.rim[1], T.rim[2]).multiplyScalar(T.rim[3]);
  shared.uRimDark.value = T.rimDark || 0;
  shared.uLampCol.value.setRGB(T.lamp[0], T.lamp[1], T.lamp[2]).multiplyScalar(T.lamp[3]);
  shared.uReflSky.value.setHex(T.reflSky);
  shared.uWinK.value = T.winK;
  shared.uSnow.value = T.snow;
}
