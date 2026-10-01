// The three world materials: opaque, cutout, water. All share the sky uniforms (ctx.sky.uniforms).
const COMMON_VS = /* glsl */`
attribute vec2 aUV;
attribute vec4 aData;
uniform float uTime;
varying vec2 vUV;
varying float vTile;
varying vec3 vN;
varying vec2 vLight;
varying float vAO;
varying vec3 vWorld;
varying float vFlags;
varying float vExtra;
const vec3 NRM[7] = vec3[7](vec3(1.,0.,0.), vec3(-1.,0.,0.), vec3(0.,1.,0.), vec3(0.,-1.,0.), vec3(0.,0.,1.), vec3(0.,0.,-1.), vec3(0.,1.,0.));
void decode() {
  float nf = aData.y;
  float nIdx = mod(nf, 8.0);
  vN = NRM[int(nIdx)];
  vAO = mod(floor(nf / 8.0), 4.0) / 3.0;
  vFlags = floor(nf / 32.0) + (nIdx > 5.5 ? 8.0 : 0.0);
  float l = aData.z;
  vLight = vec2(floor(l / 16.0), mod(l, 16.0)) / 15.0;
  vTile = aData.x;
  vUV = aUV / 64.0;
  vExtra = aData.w;
}
`;

const LIGHT_FS = /* glsl */`
precision highp sampler2DArray;
uniform sampler2DArray tAlb;
uniform sampler2DArray tMat;
uniform float uTime, uDaylight, uNight, uFogNear, uFogFar, uUnderwater;
uniform float uSeaLevel;
uniform vec3 uDeep, uShallow;
uniform vec3 uLightDir, uLightColor, uAmbient, uGround, uFogColor, uFogSunColor, uSunDir, uBlockColor, uRimColor, uWaterTint;
varying vec2 vUV;
varying float vTile;
varying vec3 vN;
varying vec2 vLight;
varying float vAO;
varying vec3 vWorld;
varying float vFlags;
varying float vExtra;

float hash12(vec2 p);
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

vec3 applyFog(vec3 col, vec3 wp) {
  vec3 d = wp - cameraPosition;
  float dist = length(d);
  float f = smoothstep(uFogNear, uFogFar, dist);
  vec3 fc = mix(uFogColor, uFogSunColor, pow(max(dot(d / dist, uSunDir), 0.0), 6.0));
  return mix(col, fc, f);
}

float caustic(vec2 p, float t) {
  vec2 i = p; float c = 1.0; float inten = .005;
  for (int n = 0; n < 3; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 3.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.0);
}

vec3 shadeBlock(vec4 alb, vec4 m, vec3 n, bool plant) {
  float wet = mod(floor(vFlags / 2.0), 2.0);
  float glint = mod(floor(vFlags / 4.0), 2.0);
  float sky = vLight.x, blk = vLight.y;
  float skyL = sky * sky;
  float ao = mix(0.38, 1.0, vAO);
  vec3 amb = mix(uGround, uAmbient, n.y * 0.5 + 0.5) * (0.22 + 0.78 * skyL) * 0.62;
  float ndl = plant ? 0.6 : max(dot(n, uLightDir), 0.0);
  vec3 direct = uLightColor * ndl * smoothstep(0.55, 0.95, sky) * 0.72;
  vec3 bl = uBlockColor * pow(blk, 1.6) * 1.5;
  vec3 light = (amb + direct) * ao + bl * mix(ao, 1.0, 0.6);
  vec3 col = alb.rgb * light;
  vec3 V = normalize(cameraPosition - vWorld);
#ifndef LOW
  vec3 H = normalize(uLightDir + V);
  float spec = pow(max(dot(n, H), 0.0), 48.0) * m.g * skyL;
  col += spec * uLightColor * 0.8 * ao;
  if (glint > 0.5 && m.b > 0.0) {
    vec2 cell = floor(vWorld.xz * 16.0) + floor(vWorld.y * 16.0);
    float h = hash12(cell);
    float tw = pow(max(sin(uTime * (1.5 + h * 3.0) + h * 40.0 + dot(V, vec3(13.0, 7.0, 11.0))), 0.0), 24.0);
    col += m.b * tw * (uLightColor + vec3(0.3)) * 2.2 * skyL;
  }
  float rim = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);
  col += rim * uRimColor * 0.12 * (0.4 + 0.6 * skyL) * ao;
#endif
  float mode = m.a * 3.0;
  float gain = mode < 0.5 ? 0.55 : mode < 1.5 ? mix(0.2, 1.1, uNight)
    : mode < 2.5 ? 0.6 + 0.4 * sin(uTime * 2.2 + vWorld.x * 0.5 + vWorld.y * 0.8 + vWorld.z * 0.3) : 1.0;
  gain *= mix(1.0, mode > 1.5 && mode < 2.5 ? 1.3 : 1.8, uNight);
  vec3 emi = alb.rgb * m.r * gain * 1.7 + m.r * gain * 0.12;
  if (wet > 0.5) {
    col *= uWaterTint;
#ifndef LOW
    float dist = length(vWorld - cameraPosition);
    float cs = caustic(vWorld.xz * 1.6 + vec2(vWorld.y * 0.3), uTime * 0.6) * (1.0 - smoothstep(18.0, 42.0, dist));
    col += cs * uLightColor * 0.55 * skyL * (n.y > 0.5 ? 1.0 : 0.5);
#endif
    float under = clamp(uSeaLevel - vWorld.y, 0.0, 30.0);
    float uf = 1.0 - exp(-under * 0.14);
    col = mix(col, uDeep * (uAmbient * 0.3 + uLightColor * 0.12), uf);
    emi *= 1.0 - uf * 0.5;
  }
  col += emi;
  return col;
}
`;

const OPAQUE_VS = COMMON_VS + /* glsl */`
void main() {
  decode();
  vec4 wp = modelMatrix * vec4(position, 1.0);
  if (mod(vFlags, 2.0) >= 1.0) {
    float w = vFlags >= 8.0 ? vExtra / 255.0 : 0.25;
    wp.xz += w * 0.07 * vec2(sin(uTime * 1.7 + wp.x * 0.7 + wp.y * 0.3), cos(uTime * 1.3 + wp.z * 0.6 + wp.y * 0.2));
  }
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const OPAQUE_FS = LIGHT_FS + /* glsl */`
void main() {
  vec2 uv = vUV;
  if (mod(floor(vFlags / 2.0), 2.0) > 0.5) {
    uv += 0.025 * vec2(sin(uTime * 1.8 + vWorld.z * 2.3 + vWorld.y), cos(uTime * 1.5 + vWorld.x * 2.1));
  }
  vec2 f = fract(uv);
  vec3 tc = vec3(f.x, 1.0 - f.y, vTile);
#ifdef LOW
  vec4 alb = texture(tAlb, tc);
  vec4 m = texture(tMat, tc);
#else
  vec2 gx = dFdx(uv), gy = dFdy(uv);
  vec4 alb = textureGrad(tAlb, tc, gx, gy);
  vec4 m = textureGrad(tMat, tc, gx, gy);
#endif
#ifdef CUTOUT
#ifdef LOW
  if (alb.a < 0.4) discard;
#else
  // keep foliage from eroding into wire at a distance: lower the cut as the mip level rises
  float lod = log2(max(max(length(gx), length(gy)) * 32.0, 1e-4));
  if (alb.a < mix(0.5, 0.12, clamp(lod / 3.0, 0.0, 1.0))) discard;
#endif
#endif
  bool plant = vFlags >= 8.0;
  vec3 n = vN;
  vec3 col = shadeBlock(alb, m, n, plant);
  gl_FragColor = vec4(applyFog(col, vWorld), 1.0);
  #include <colorspace_fragment>
}
`;

const WATER_VS = COMMON_VS + /* glsl */`
varying float vTop;
void main() {
  decode();
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vTop = vN.y > 0.5 ? 1.0 : 0.0;
  vWorld = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const WATER_FS = LIGHT_FS + /* glsl */`
uniform vec3 uZenith, uHorizon;
varying float vTop;
void main() {
  vec3 toCam = cameraPosition - vWorld;
  float dist = length(toCam);
  vec3 V = toCam / dist;
  float near = 1.0 - smoothstep(30.0, 60.0, dist);
  vec3 n = vN;
  if (vTop > 0.5) {
    vec2 p = vWorld.xz;
    float t = uTime;
    vec2 g = vec2(0.0);
    g += vec2(0.9, 0.6) * cos(t * 1.4 + p.x * 0.9 + p.y * 0.6) * 0.06;
    g += vec2(0.0, -1.3) * cos(t * 2.1 - p.y * 1.3) * 0.04;
#ifndef LOW
    g += vec2(2.7, 1.9) * cos(t * 3.3 + p.x * 2.7 + p.y * 1.9) * 0.018;
    g += vec2(-1.7, 3.1) * cos(t * 2.7 - p.x * 1.7 + p.y * 3.1) * 0.014;
    vec2 q = p * 1.7 + vec2(t * 0.35, -t * 0.25);
    g += (vec2(vnoise(q + 3.1), vnoise(q * 1.3 - 7.7)) - 0.5) * 0.22;
#endif
    n = normalize(vec3(-g.x * near, 1.0, -g.y * near));
    if (!gl_FrontFacing) n = -n;
  }
  float ndv = clamp(dot(n, V), 0.0, 1.0);
  float fres = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
  vec3 r = reflect(-V, n);
  vec3 refl = mix(uHorizon, uZenith, clamp(r.y * 1.6, 0.0, 1.0));
  float depth = vTop > 0.5 ? vExtra : 3.0;
  float sky = vLight.x;
  vec3 lightCol = uAmbient * (0.35 + 0.65 * sky * sky) + uBlockColor * pow(vLight.y, 1.6);
  vec3 body = mix(uShallow, uDeep, clamp(depth / 7.0, 0.0, 1.0)) * (lightCol * 0.6 + uLightColor * 0.3 * sky);
  float spec = pow(max(dot(r, uLightDir), 0.0), 220.0) * 4.0 + pow(max(dot(r, uLightDir), 0.0), 24.0) * 0.25;
  vec3 col = mix(body, refl * (0.4 + 0.6 * sky), fres * 0.85);
  col += uLightColor * spec * sky * near;
#ifndef LOW
  // shimmering cell glints on the surface, futuristic touch
  if (vTop > 0.5) {
    vec2 c = vWorld.xz * 6.0 + n.xz * 4.0;
    float h = hash12(floor(c));
    float dot2 = smoothstep(0.22, 0.0, length(fract(c) - 0.5));
    float sp = step(0.965, h) * dot2 * smoothstep(0.9, 1.0, sin(uTime * (1.0 + h * 2.0) + h * 30.0) * 0.5 + 0.5) * near;
    col += sp * vec3(0.4, 1.0, 0.95) * (0.35 + uNight * 0.35);
  }
#endif
  float shallow = clamp(0.28 + depth * 0.1, 0.3, 0.86);
  float a = mix(shallow, 1.0, fres);
  a = mix(0.92, a, near);
  if (!gl_FrontFacing && vTop > 0.5) {
    // seen from below: a bright Snell's window overhead, total internal reflection outside it
    float up = clamp(-V.y, 0.0, 1.0);
    float win = smoothstep(0.62, 0.75, up);
    vec3 deepC = uDeep * (uAmbient * 0.35 + uLightColor * 0.15);
    col = mix(deepC * 1.4, mix(uHorizon, uZenith, up) * (0.5 + 0.5 * sky) + uLightColor * pow(max(dot(-V, uLightDir), 0.0), 64.0), win);
    a = mix(0.95, 0.55, win);
  }
  gl_FragColor = vec4(applyFog(col, vWorld), a);
  #include <colorspace_fragment>
}
`;

export function createMaterials(THREE, atlas, skyUniforms, quality = 'med') {
  const defines = quality === 'low' ? { LOW: '' } : {};
  const uniforms = { ...skyUniforms, tAlb: { value: atlas.albedo }, tMat: { value: atlas.mat } };
  const opaque = new THREE.ShaderMaterial({ uniforms, defines: { ...defines }, vertexShader: OPAQUE_VS, fragmentShader: OPAQUE_FS });
  const cutout = new THREE.ShaderMaterial({ uniforms, defines: { ...defines, CUTOUT: '' }, vertexShader: OPAQUE_VS, fragmentShader: OPAQUE_FS });
  const water = new THREE.ShaderMaterial({
    uniforms, defines: { ...defines }, vertexShader: WATER_VS, fragmentShader: WATER_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const all = [opaque, cutout, water];
  return {
    opaque, cutout, water,
    setQuality(q) {
      for (const m of all) {
        if (q === 'low') m.defines.LOW = ''; else delete m.defines.LOW;
        m.needsUpdate = true;
      }
    },
  };
}
