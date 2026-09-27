import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addPlanarReflection, REFLECT_LAYER } from '../fx/reflection.js';
import { MAX_CONTACTS } from './groundao.js';
import { canvasTexture } from './textures.js';

// Verdant Terraces floors: one mesh per level (only y = 0 gets the planar mirror), one shader. A painted zone mask over
// the district (R lawn, G gravel, B dark granite; black = pale limestone) picks the surface per pixel.
// levels: [{ rects: [[x0, x1, z0, z1], ...], y, reflect }]; mask: { canvas, x0, z0, w, d } (world rect it covers).
export function createGardenGround(ctx, levels, mask, { interior = false, stone = [0.96, 0.9, 0.8] } = {}) {
  const { M, reflection } = ctx;
  const maskTex = canvasTexture(mask.canvas, false);
  maskTex.anisotropy = 1; maskTex.generateMipmaps = true; maskTex.flipY = false; maskTex.needsUpdate = true;
  maskTex.minFilter = THREE.LinearMipmapLinearFilter;
  const u = {
    tAO: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) }, uAOMat: { value: new THREE.Matrix4() }, uAOOn: { value: 0 },
    uContacts: { value: Array.from({ length: MAX_CONTACTS }, () => new THREE.Vector3(0, 0, 0)) },
    tZone: { value: maskTex }, uZone: { value: new THREE.Vector4(mask.x0, mask.z0, 1 / mask.w, 1 / mask.d) },
  };
  u.tAO.value.needsUpdate = true;
  ctx.groundAO = u;
  const dummy = u.tAO.value;
  (ctx.disposers ||= []).push(() => { maskTex.dispose(); dummy.dispose(); });
  const cream = M.stoneTex.cream;
  const meshes = levels.map((L, li) => {
    const parts = L.rects.map(([x0, x1, z0, z1]) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.max(1, Math.round((x1 - x0) / 8)), Math.max(1, Math.round((z1 - z0) / 8)));
      g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, L.y, (z0 + z1) / 2);
      return g;
    });
    const g = mergeGeometries(parts, false);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, -pos.getZ(i) / 4);
    const mat = new THREE.MeshStandardMaterial({ map: cream.map, normalMap: cream.normalMap, normalScale: new THREE.Vector2(0.35, 0.35),
      color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0.6 });
    mat.name = 'vtGround' + li;
    const refl = L.reflect && reflection?.enabled;
    if (refl) {
      addPlanarReflection(mat, reflection, { strength: 0.9, base: 0.28, blur: 2.6, distort: 0.06, tint: new THREE.Color(1.0, 0.98, 0.95), sky: 1, skySat: 0.35 });
      mat.defines = { REFL_ZONE: '' };
    }
    if (interior) mat.defines = { ...(mat.defines || {}), HF_INTERIOR: '' };
    mat.defines = { ...(mat.defines || {}), HF_STONE: `vec3(${stone.map((v) => v.toFixed(3)).join(',')})` };
    patch(mat, u, !!L.ao);
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = 'ground';
    mesh.matrixAutoUpdate = false;
    if (L.y !== 0) mesh.layers.enable(REFLECT_LAYER);
    ctx.scene.add(mesh);
    return mesh;
  });
  return meshes;
}

function patch(mat, u, ao) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGW = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tAO, tZone; uniform mat4 uAOMat; uniform float uAOOn; uniform vec4 uZone; uniform vec3 uContacts[${MAX_CONTACTS}];
varying vec2 vGW;
float groundOcc() {
  float o = 0.0;
  ${ao ? `if (uAOOn > 0.5) {
    vec2 q = (uAOMat * vec4(vGW.x, 0.0, vGW.y, 1.0)).xy;
    if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) o = texture2D(tAO, q).r;
  }` : ''}
  for (int i = 0; i < ${MAX_CONTACTS}; i++) {
    vec3 c = uContacts[i];
    if (c.z <= 0.0) continue;
    float d = length(vGW - c.xy) / c.z;
    o = max(o, 0.8 * (1.0 - smoothstep(0.35, 1.0, d)));
  }
  return o;
}
float gH(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gH(i), gH(i + vec2(1, 0)), f.x), mix(gH(i + vec2(0, 1)), gH(i + vec2(1, 1)), f.x), f.y); }
float gLine(float d, float w) { float aa = fwidth(d) * 1.2 + 1e-4; return 1.0 - smoothstep(w * 0.5, w * 0.5 + aa, abs(d)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 zm = texture2D(tZone, (vGW - uZone.xy) * uZone.zw).rgb;
float ed = gN(vGW * 1.7) * 0.5 + gN(vGW * 5.3) * 0.25;
float lawn = smoothstep(0.35, 0.65, zm.r + (ed - 0.37) * 0.5);
float grav = smoothstep(0.3, 0.7, zm.g + (ed - 0.37) * 0.25) * (1.0 - lawn);
float gran = smoothstep(0.4, 0.6, zm.b) * (1.0 - lawn) * (1.0 - grav);
float far = smoothstep(0.02, 0.12, fwidth(vGW.x));
vec3 grain = diffuseColor.rgb;
// limestone: long pale slabs in running bond, soft tone per slab
vec2 sq = vGW / vec2(2.4, 1.2);
sq.x += mod(floor(sq.y), 2.0) * 0.5;
vec2 cell = floor(sq), fq = fract(sq);
float tone = gH(cell + 3.0);
float joint = max(gLine((fq.x - 0.5) * 2.4 - sign(fq.x - 0.5) * 1.2, 0.02), gLine((fq.y - 0.5) * 1.2 - sign(fq.y - 0.5) * 0.6, 0.02)) * (1.0 - far);
vec3 stoneC = grain * HF_STONE * (0.86 + 0.16 * tone) * (1.0 - 0.35 * joint);
stoneC *= 0.93 + 0.1 * gN(vGW * 0.15);
// lawn: mown stripes, patchy tone, blade speckle that fades out with distance, darker at its borders
float stripe = step(0.5, fract(vGW.x / 3.0 + 0.13 * sin(vGW.y * 0.05)));
float fine = smoothstep(0.004, 0.03, fwidth(vGW.x));
float blade = mix(gN(vGW * 11.0) * 0.6 + gN(vGW * 27.0) * 0.4, 0.5, fine);
vec3 lawnC = vec3(0.085, 0.15, 0.04) * (0.78 + 0.4 * gN(vGW * 0.23)) * (0.94 + 0.09 * stripe) * (0.8 + 0.4 * blade);
lawnC = mix(lawnC, vec3(0.16, 0.19, 0.07), 0.3 * smoothstep(0.55, 0.8, gN(vGW * 0.09 + 11.0)));
lawnC *= 0.7 + 0.3 * smoothstep(0.5, 0.9, zm.r);
lawnC *= 0.82 + 0.3 * gN(vGW * 0.6 + 3.0) * gN(vGW * 0.13);
{
  // scattered daisies and clover flowers, only up close
  vec2 dq = vGW / 0.35, dc = floor(dq);
  float dh = gH(dc + 41.0);
  float daisy = step(0.965, dh) * smoothstep(0.16, 0.08, length(fract(dq) - 0.5 - (vec2(gH(dc + 7.0), gH(dc + 9.0)) - 0.5) * 0.5)) * (1.0 - fine);
  lawnC = mix(lawnC, mix(vec3(0.9, 0.88, 0.8), vec3(0.95, 0.75, 0.25), step(0.99, dh)), daisy * 0.8);
}
vec3 gravC = vec3(0.6, 0.54, 0.45) * (0.82 + 0.28 * mix(gN(vGW * 9.0) * 0.5 + gN(vGW * 23.0) * 0.5, 0.5, fine)) * (0.9 + 0.15 * gN(vGW * 0.4));
vec2 gq = vGW / 0.9; float gt = gH(floor(gq) + 17.0);
float gj = max(gLine(fract(gq.x) - 0.5, 0.03), gLine(fract(gq.y) - 0.5, 0.03)) * (1.0 - far);
vec3 granC = vec3(0.045, 0.047, 0.05) * (0.85 + 0.3 * gt) * (1.0 - 0.25 * gj) + vec3(0.9, 0.7, 0.35) * gj * 0.05;
#ifdef HF_INTERIOR
  // interiors: R = carpet tiles, G = steel floor grate
  vec2 cq = vGW / 0.6; float ct = gH(floor(cq) + 5.0);
  lawnC = vec3(0.05, 0.058, 0.07) * (0.94 + 0.1 * ct) * (0.9 + 0.2 * mix(gN(vGW * 14.0), 0.5, fine));
  vec2 rq = fract(vGW / vec2(0.6, 0.15));
  float slot = smoothstep(0.35, 0.3, abs(rq.y - 0.5)) * smoothstep(0.48, 0.44, abs(rq.x - 0.5)) * (1.0 - far);
  gravC = vec3(0.16, 0.17, 0.19) * (1.0 - 0.75 * slot) * (0.85 + 0.2 * gN(vGW * 0.5));
#endif
diffuseColor.rgb = stoneC;
diffuseColor.rgb = mix(diffuseColor.rgb, granC, gran);
diffuseColor.rgb = mix(diffuseColor.rgb, gravC, grav);
diffuseColor.rgb = mix(diffuseColor.rgb, lawnC, lawn);
#ifdef HF_INTERIOR
float reflZone = mix(mix(0.7 * (1.0 - 0.7 * joint), 1.15, gran), 0.0, lawn) * (1.0 - 0.6 * grav);
#else
float reflZone = mix(mix(0.55 * (1.0 - 0.7 * joint), 1.1, gran), 0.0, max(lawn, grav));
#endif
float sheenK = (1.0 - lawn) * (1.0 - grav) * (1.0 - 0.5 * gran);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = 0.24 + 0.1 * tone + 0.2 * joint;
roughnessFactor = mix(roughnessFactor, 0.1 + 0.06 * gt, gran);
#ifdef HF_INTERIOR
roughnessFactor = mix(roughnessFactor, 0.35, grav);
roughnessFactor = mix(roughnessFactor, 0.95, lawn);
#else
roughnessFactor = mix(roughnessFactor, 0.9, grav);
roughnessFactor = mix(roughnessFactor, 0.78, lawn);
#endif
roughnessFactor *= 0.85 + 0.3 * gN(vGW * 0.27 + 5.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(mix(normal, normalize(vNormal), max(lawn, grav)));`)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
        'vDirectionalShadowCoord[ i ] ) : 1.0;\n\t\t#endif\n\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
        `vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		{
			vec3 sH = normalize( directLight.direction + geometryViewDir );
			float nh = saturate( dot( geometryNormal, sH ) );
			float lobe = pow( nh, 40.0 ) * 0.26 + pow( nh, 8.0 ) * 0.05;
			reflectedLight.directSpecular += directLight.color * vec3( 1.0, 0.95, 0.85 ) * lobe * sheenK * saturate( dot( geometryNormal, directLight.direction ) );
		}`))
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  float gOcc = groundOcc();
  reflectedLight.indirectDiffuse *= 1.0 - 0.75 * gOcc;
  reflectedLight.indirectSpecular *= 1.0 - 0.6 * gOcc;
  reflectedLight.directDiffuse *= 1.0 - 0.3 * gOcc;
  reflectedLight.directSpecular *= 1.0 - 0.5 * gOcc;
}`);
  };
  mat.customProgramCacheKey = () => 'vtGround' + (mat.defines?.REFL_ZONE !== undefined ? 'r' : '') + (ao ? 'a' : '') + (mat.defines?.HF_INTERIOR !== undefined ? 'i' : '') + mat.defines.HF_STONE;
}
