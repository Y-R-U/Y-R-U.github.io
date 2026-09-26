import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addPlanarReflection } from '../fx/reflection.js';
import { MAX_CONTACTS } from './groundao.js';

// Brightline's y=0 paving, one draw: rain-dark slate slabs in running bond with pale cross bands every 12 m,
// wet patches (mirror-smooth, darker), a warm polished arcade strip on the west and cyan guide lights at the edges.
// rects: [x0, x1, z0, z1] pieces of walkable/visible floor at y = 0.
export function createBoulevardGround(ctx, rects, L) {
  const { M, reflection } = ctx;
  const parts = rects.map(([x0, x1, z0, z1]) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.max(1, Math.round((x1 - x0) / 8)), Math.max(1, Math.round((z1 - z0) / 8)));
    g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    return g;
  });
  const g = mergeGeometries(parts, false);
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, -pos.getZ(i) / 4);

  const slate = M.stoneTex.slate;
  const mat = new THREE.MeshStandardMaterial({ map: slate.map, normalMap: slate.normalMap, normalScale: new THREE.Vector2(0.45, 0.45),
    color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: 0.6 });
  mat.name = 'blGround';
  if (reflection?.enabled) addPlanarReflection(mat, reflection, { strength: 1.0, base: 0.3, blur: 3.2, distort: 0.08, tint: new THREE.Color(0.92, 0.97, 1.05), sky: 1, skySat: 0.5 });
  const u = { tAO: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) }, uAOMat: { value: new THREE.Matrix4() }, uAOOn: { value: 0 },
    uContacts: { value: Array.from({ length: MAX_CONTACTS }, () => new THREE.Vector3(0, 0, 0)) } };
  u.tAO.value.needsUpdate = true;
  ctx.groundAO = u;
  const f = (v) => v.toFixed(2);
  mat.defines = { REFL_ZONE: '' };
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev?.(sh, r);
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGW = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tAO; uniform mat4 uAOMat; uniform float uAOOn; uniform vec3 uContacts[${MAX_CONTACTS}];
varying vec2 vGW;
float groundOcc() {
  float o = 0.0;
  if (uAOOn > 0.5) {
    vec2 q = (uAOMat * vec4(vGW.x, 0.0, vGW.y, 1.0)).xy;
    if (q.x > 0.0 && q.x < 1.0 && q.y > 0.0 && q.y < 1.0) o = texture2D(tAO, q).r;
  }
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
float gLine(float d, float w) { float aa = fwidth(d) * 1.2 + 1e-4; return 1.0 - smoothstep(w * 0.5, w * 0.5 + aa, abs(d)); }
float aaStep(float d) { float w = fwidth(d) * 0.75 + 1e-4; return smoothstep(-w, w, d); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
// zones: arcade (warm polished stone under the canopy) | promenade (wet slate) | balconies (slate, finer)
float arc = 1.0 - aaStep(vGW.x + ${f(L.arcadeEdge)});
vec2 sq = vGW / vec2(2.4, 1.6);
float row = floor(sq.y);
sq.x += mod(row, 2.0) * 0.5;
vec2 cell = floor(sq), fq = fract(sq);
float tone = gH(cell + 7.0);
float joint = max(gLine((fq.x - 0.5) * 2.4 - sign(fq.x - 0.5) * 1.2, 0.022), gLine((fq.y - 0.5) * 1.6 - sign(fq.y - 0.5) * 0.8, 0.022)) * (0.55 + 0.45 * gN(vGW * 0.5));
float bd = (fract(vGW.y / 12.0 + 0.5) - 0.5) * 12.0;
float band = (1.0 - aaStep(abs(bd) - 0.3)) * (1.0 - arc);
float wet = smoothstep(0.52, 0.66, gN(vGW * vec2(0.09, 0.05) + 3.0) * 0.7 + gN(vGW * 0.33) * 0.3) * (1.0 - arc);
vec3 grain = diffuseColor.rgb;
vec3 slateC = grain * vec3(0.36, 0.40, 0.46) * (0.78 + 0.34 * tone);
slateC *= 1.0 - 0.45 * joint;
slateC = mix(slateC, grain * vec3(0.62, 0.64, 0.66), band);
slateC *= 1.0 - 0.3 * wet;
vec2 aq = vGW / vec2(1.2, 1.2);
float atone = gH(floor(aq) + 31.0);
float ajoint = max(gLine((fract(aq.x) - 0.5) * 1.2 - sign(fract(aq.x) - 0.5) * 0.6, 0.02), gLine((fract(aq.y) - 0.5) * 1.2 - sign(fract(aq.y) - 0.5) * 0.6, 0.02));
vec3 arcC = grain * vec3(0.78, 0.74, 0.68) * (0.9 + 0.14 * atone) * (1.0 - 0.3 * ajoint);
diffuseColor.rgb = mix(slateC, arcC, arc);
float reflZone = mix(mix(0.8, 1.15, wet) * (1.0 - 0.75 * joint), 0.75, arc);
float sheenK = mix(1.0, 0.5, arc);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(0.1 + 0.08 * tone + 0.1 * joint, 0.035, wet);
roughnessFactor = mix(roughnessFactor, 0.2, band * 0.6);
roughnessFactor = mix(roughnessFactor, 0.16 + 0.06 * atone, arc);
roughnessFactor *= 0.8 + 0.4 * gN(vGW * 0.21 + 5.0);`)
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
        'vDirectionalShadowCoord[ i ] ) : 1.0;\n\t\t#endif\n\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
        `vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		{
			vec3 sH = normalize( directLight.direction + geometryViewDir );
			float nh = saturate( dot( geometryNormal, sH ) );
			float lobe = pow( nh, 60.0 ) * 0.35 + pow( nh, 10.0 ) * 0.05;
			reflectedLight.directSpecular += directLight.color * vec3( 0.9, 0.95, 1.0 ) * lobe * sheenK * saturate( dot( geometryNormal, directLight.direction ) );
		}`))
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
{
  float gOcc = groundOcc();
  reflectedLight.indirectDiffuse *= 1.0 - 0.75 * gOcc;
  reflectedLight.indirectSpecular *= 1.0 - 0.6 * gOcc;
  reflectedLight.directDiffuse *= 1.0 - 0.3 * gOcc;
  reflectedLight.directSpecular *= 1.0 - 0.5 * gOcc;
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // cyan guide lights: promenade edges, the curb under the east rail, dotted studs on the cross bands
  float gl = gLine(vGW.x - ${f(L.edgeE)}, 0.08) + gLine(vGW.x + ${f(L.arcadeEdge)}, 0.06) * 0.8 + gLine(vGW.x - ${f(L.edgeE - 1.1)}, 0.03) * 0.5;
  float stud = (1.0 - smoothstep(0.05, 0.05 + fwidth(vGW.x) * 1.5, length(vec2(bd, fract(vGW.x / 3.0 + 0.5) * 3.0 - 1.5)))) * (1.0 - arc);
  totalEmissiveRadiance += vec3(0.25, 0.8, 1.7) * clamp(gl, 0.0, 1.0) * step(vGW.x, ${f(L.edgeE + 0.3)}) + vec3(0.5, 0.9, 1.6) * stud;
}`);
  };
  mat.customProgramCacheKey = () => 'blGround';
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  mesh.matrixAutoUpdate = false;
  ctx.scene.add(mesh);
  return mesh;
}
