import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { REFLECT_LAYER } from '../fx/reflection.js';

// The y=0 promenade: one mesh, one material. Zones (cream marble / dark slate) and gold inlays are
// chosen per-pixel from world position so the whole floor costs a single draw call.
export function createGround(ctx) {
  const { M, scene } = ctx;
  const parts = [];
  const plane = new THREE.PlaneGeometry(150, 148, 30, 30);
  plane.rotateX(-Math.PI / 2);
  plane.translate(-35, 0, -36);
  parts.push(plane);
  for (const [cz, r] of ctx.layout.balconies) {
    const c = new THREE.CircleGeometry(r, 32, 0, Math.PI);
    c.rotateX(-Math.PI / 2); c.rotateY(-Math.PI / 2);
    c.translate(40, 0, cz);
    parts.push(c);
  }
  const g = mergeGeometries(parts.map((p) => { const q = p.index ? p.toNonIndexed() : p; q.deleteAttribute('uv'); return q; }), false);
  const pos = g.attributes.position, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = pos.getX(i) / 6; uv[i * 2 + 1] = -pos.getZ(i) / 6; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  const mat = M.marble;
  const slate = M.stoneTex.slate;
  const prev = mat.onBeforeCompile;
  const u = { tSlate: { value: slate.map }, tSlateR: { value: slate.roughnessMap }, uTime: ctx.time };
  mat.defines = { ...(mat.defines || {}), REFL_ZONE: '' };
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGW = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tSlate, tSlateR;
varying vec2 vGW;
// sine-free hash (full-rate ALU; the sin() hash was ~80 transcendental ops per floor pixel)
float gH(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gH(i), gH(i + vec2(1, 0)), f.x), mix(gH(i + vec2(0, 1)), gH(i + vec2(1, 1)), f.x), f.y); }
float gLine(float d, float w) { float aa = fwidth(d) * 1.2 + 1e-4; return 1.0 - smoothstep(w * 0.5, w * 0.5 + aa, abs(d)); }
float gBand(float d, float w) { float aa = fwidth(d) + 1e-4; return 1.0 - smoothstep(w * 0.5 - aa, w * 0.5 + aa, abs(d)); }
// x = nero (black marble) weight, y = steel slate weight; edges anti-aliased with fwidth
float aaStep(float d) { float w = fwidth(d) * 0.75 + 1e-4; return smoothstep(-w, w, d); }
// x = nero (black marble) weight, y = steel slate weight, z = honey-travertine wedge weight
vec3 zoneOf(vec2 p) {
  float r = length(p);
  float inRing = 1.0 - aaStep(r - 28.6);
  float slate = aaStep(r - 25.8) * inRing;
  float a = atan(p.y, p.x);
  float seg = 3.14159265 / 12.0;
  float sa = (abs(fract(a / (2.0 * seg)) - 0.5) - 0.25) * 2.0 * seg * r;
  float inBurst = aaStep(r - 8.6) * (1.0 - aaStep(r - 17.0));
  float burst = aaStep(sa) * inBurst;
  float band = 1.0 - aaStep(abs(r - 21.4) - 0.9);
  float hub = 1.0 - aaStep(r - 3.0);
  float nero = max(band, hub) * (1.0 - slate) * inRing;
  float outer = 1.0 - inRing;
  float blvd = max(aaStep(12.0 - abs(p.x)) * aaStep(-27.0 - p.y), aaStep(p.x - 35.5));
  vec2 q = abs(fract(p / 12.0) - 0.5) * 12.0;
  float rib = aaStep(max(q.x, q.y) - 5.75) * (1.0 - blvd);
  return vec3(max(nero, rib * outer), max(slate, blvd * outer), burst * (1.0 - nero));
}
float inlay(vec2 p) {
  float r = length(p);
  // a few bold, deliberate inlays (Round 2: the hairline web read as busy "vinyl")
  float m = gLine(r - 8.6, 0.2) + gLine(r - 17.0, 0.14) + gLine(r - 25.8, 0.26) + gLine(r - 28.6, 0.12) + gLine(r - 3.0, 0.14);
  float a = atan(p.y, p.x);
  float seg = 3.14159265 / 12.0;
  // one gold spoke on every other wedge edge (12 spokes)
  float am4 = mod(a + seg, 2.0 * seg) - seg;
  m += gLine(r * sin(am4), 0.09) * step(8.6, r) * step(r, 17.0);
  float bz = step(p.y, -28.6);
  m += gLine(abs(p.x) - 12.0, 0.24) * bz;
  m += gLine(p.x - 35.5, 0.2) * step(-80.0, p.y);
  if (r > 28.6 && p.x < 35.5 && !(abs(p.x) < 12.0 && p.y < -27.0)) {
    vec2 q = fract(p / 12.0) - 0.5;
    m += (gLine(q.x * 12.0, 0.07) + gLine(q.y * 12.0, 0.07)) * 0.85;
  }
  return clamp(m, 0.0, 1.0);
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 zW3 = zoneOf(vGW);
vec2 zW = zW3.xy;
float zI = inlay(vGW);
vec2 cell3 = floor(vGW / 1.5);
float tone = gH(cell3 + 17.0);
float gn = gN(vGW * 0.07) * 0.6 + gN(vGW * 0.23) * 0.4;
vec3 trav = diffuseColor.rgb * vec3(0.62, 0.545, 0.44) * (0.84 + 0.2 * tone);
// the slow per-zone detail only runs where that zone has weight (coherent branches; derivatives taken outside)
vec2 gdx = dFdx(vMapUv), gdy = dFdy(vMapUv);
vec3 nero = vec3(0.0);
if (zW.x > 0.002) {
  vec3 sl = textureGrad(tSlate, vMapUv * 0.73 + 0.31, gdx * 0.73, gdy * 0.73).rgb;
  nero = sl * sl * vec3(0.16, 0.15, 0.15);
  vec2 rp = mat2(0.82, 0.57, -0.57, 0.82) * vGW;
  vec2 vp = rp * vec2(0.09, 0.42) + vec2(gN(vGW * 0.3) * 0.6, 0.0);
  float vn = gN(vp) * 0.7 + gN(vp * 2.7 + 4.0) * 0.3;
  float vein = (1.0 - smoothstep(0.0, fwidth(vn) * 1.2 + 0.002, abs(vn - 0.5))) * smoothstep(0.35, 0.6, gN(rp * 0.05 + 3.0));
  vec2 vp2 = rp * vec2(0.25, 1.1) + 7.0;
  float vn2 = gN(vp2) * 0.75 + gN(vp2 * 3.0) * 0.25;
  vein += (1.0 - smoothstep(0.0, fwidth(vn2) + 0.002, abs(vn2 - 0.5))) * 0.35 * smoothstep(0.5, 0.7, gN(rp * 0.08 + 11.0));
  nero += vec3(0.16, 0.155, 0.15) * clamp(vein, 0.0, 1.0);
}
if ((1.0 - zW.x) * (1.0 - zW.y) > 0.002) {
  // travertine: soft cloudy veins + a few crisp hairline veins so the stone reads from the gameplay camera
  vec2 rp = mat2(0.6, -0.8, 0.8, 0.6) * vGW;
  vec2 vp = rp * vec2(0.12, 0.5) + vec2(gN(vGW * 0.21) * 0.9, 3.0);
  float vn = gN(vp) * 0.65 + gN(vp * 2.3 + 9.0) * 0.35;
  float hair = (1.0 - smoothstep(0.0, fwidth(vn) * 1.5 + 0.003, abs(vn - 0.5))) * smoothstep(0.3, 0.65, gN(rp * 0.07 + 5.0));
  float cloud = smoothstep(0.35, 0.8, gN(vGW * 0.45 + 2.0) * 0.6 + gN(vGW * 1.3) * 0.4);
  trav *= (1.0 - 0.14 * cloud) * (1.0 - 0.5 * hair);
  trav = mix(trav, trav * vec3(1.06, 1.0, 0.9), gN(cell3 * 0.7 + 3.0));
}
trav = mix(trav, trav * vec3(0.66, 0.54, 0.4), zW3.z);
vec3 steel = zW.y > 0.002 ? textureGrad(tSlate, vMapUv, gdx, gdy).rgb * vec3(0.5, 0.56, 0.66) : vec3(0.0);
diffuseColor.rgb = mix(mix(trav, nero, zW.x), steel, zW.y);
float reflZone = mix(mix(1.15, 1.0, zW.x), 1.25, zW.y);
diffuseColor.rgb *= 0.9 + 0.16 * gn;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.66, 0.26), zI);
reflZone = mix(reflZone, 0.6, zI);
float sheenK = (1.0 - zI) * mix(1.0, 0.6, zW.y);`)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
        'vDirectionalShadowCoord[ i ] ) : 1.0;\n\t\t#endif\n\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
        `vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		{
			// broad warm sun sheen on the polished stone (a second, much rougher specular lobe)
			vec3 sH = normalize( directLight.direction + geometryViewDir );
			float nh = saturate( dot( geometryNormal, sH ) );
			float lobe = pow( nh, 40.0 ) * 0.28 + pow( nh, 8.0 ) * 0.06;
			reflectedLight.directSpecular += directLight.color * vec3( 1.0, 0.8, 0.55 ) * lobe * sheenK * saturate( dot( geometryNormal, directLight.direction ) );
		}`))
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
if (zW.y > 0.002) roughnessFactor = mix(roughnessFactor, max(textureGrad(tSlateR, vMapUv, gdx, gdy).g, 0.14), zW.y);
roughnessFactor *= 0.7 + 0.8 * gN(vGW * 0.11 + 7.0);
roughnessFactor = mix(roughnessFactor, 0.035 + 0.03 * gN(vGW * 0.3), zW.x);
roughnessFactor = mix(roughnessFactor, 0.3, zI);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 1.0, zI);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(0.16, 0.09, 0.02) * zI;
{
  float rr = length(vGW);
  float guide = gLine(rr - 29.15, 0.07) + gLine(rr - 8.25, 0.05);
  guide += gLine(abs(vGW.x) - 11.55, 0.06) * step(vGW.y, -28.6) * step(-80.0, vGW.y);
  totalEmissiveRadiance += vec3(0.25, 0.75, 1.6) * clamp(guide, 0.0, 1.0);
  // inset studs at the travertine tile corners
  vec2 sq = (fract(vGW / 6.0 + 0.5) - 0.5) * 6.0;
  float stud = 1.0 - smoothstep(0.035, 0.035 + fwidth(vGW.x) * 1.5, length(sq));
  totalEmissiveRadiance += vec3(1.6, 1.25, 0.8) * stud * (1.0 - zW.x) * (1.0 - zW.y) * step(8.0, rr);
}`);
  };
  const baseKey = mat.customProgramCacheKey?.() || '';
  mat.customProgramCacheKey = () => baseKey + 'ground';

  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  mesh.matrixAutoUpdate = false;
  scene.add(mesh);
  return mesh;
}
