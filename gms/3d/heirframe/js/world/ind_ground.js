import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addPlanarReflection, REFLECT_LAYER } from '../fx/reflection.js';
import { MAX_CONTACTS } from './groundao.js';
import { canvasTexture, makeCanvas } from './textures.js';

// Industrial floors (Portside quays, the Stacks): one shader, zones from a painted mask.
// Mask: black = poured concrete slabs, R = steel tread plate, G = yellow paint (G + B together = hazard stripes),
// B alone = floor grating. o: { slab, tint, wet (puddle amount 0..1), rust 0..1, rain (ripples in puddles), interior }.
// levels: [{ rects: [[x0, x1, z0, z1], ...], y, reflect, ao }].
export function createIndustrialGround(ctx, levels, mask, o = {}) {
  const { M, reflection, time } = ctx;
  const { slab = 6, tint = [0.62, 0.6, 0.57], wet = 0.3, rust = 0, rain = false, interior = false, key = 'ind' } = o;
  const maskTex = canvasTexture(mask.canvas, false);
  maskTex.anisotropy = 1; maskTex.generateMipmaps = true; maskTex.flipY = false; maskTex.needsUpdate = true;
  maskTex.minFilter = THREE.LinearMipmapLinearFilter;
  const u = {
    tAO: { value: new THREE.DataTexture(new Uint8Array(4), 1, 1) }, uAOMat: { value: new THREE.Matrix4() }, uAOOn: { value: 0 },
    uContacts: { value: Array.from({ length: MAX_CONTACTS }, () => new THREE.Vector3(0, 0, 0)) },
    tZone: { value: maskTex }, uZone: { value: new THREE.Vector4(mask.x0, mask.z0, 1 / mask.w, 1 / mask.d) }, uTime: time,
  };
  u.tAO.value.needsUpdate = true;
  ctx.groundAO = u;
  const dummy = u.tAO.value;
  (ctx.disposers ||= []).push(() => { maskTex.dispose(); dummy.dispose(); });
  const f = (v) => v.toFixed(3);
  return levels.map((L, li) => {
    const parts = L.rects.map(([x0, x1, z0, z1]) => {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.max(1, Math.round((x1 - x0) / 8)), Math.max(1, Math.round((z1 - z0) / 8)));
      g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, L.y, (z0 + z1) / 2);
      return g;
    });
    const g = mergeGeometries(parts, false);
    const pos = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / 4, -pos.getZ(i) / 4);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, metalness: 0, envMapIntensity: interior ? 1.0 : 0.6 });
    mat.name = 'indGround' + li;
    const refl = L.reflect && reflection?.enabled;
    if (refl) addPlanarReflection(mat, reflection, { strength: 1.0, base: 0.3, blur: 2.8, distort: 0.08, tint: new THREE.Color(1, 1, 1), sky: 1, skySat: 0.5 });
    mat.defines = { ...(refl ? { REFL_ZONE: '' } : {}), ...(rain ? { HF_RAIN: '' } : {}) };
    const ao = !!L.ao;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      prev?.(sh, r);
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vGW;')
        .replace('#include <fog_vertex>', '#include <fog_vertex>\nvGW = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
uniform sampler2D tAO, tZone; uniform mat4 uAOMat; uniform float uAOOn, uTime; uniform vec4 uZone; uniform vec3 uContacts[${MAX_CONTACTS}];
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
float gLine(float d, float w) { float aa = fwidth(d) * 1.2 + 1e-4; return 1.0 - smoothstep(w * 0.5, w * 0.5 + aa, abs(d)); }
float igWet = 0.0, igSteel = 0.0, igGrate = 0.0, igPaint = 0.0;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
vec3 zm = texture2D(tZone, (vGW - uZone.xy) * uZone.zw).rgb;
float far = smoothstep(0.02, 0.12, fwidth(vGW.x));
igSteel = smoothstep(0.35, 0.65, zm.r);
igPaint = smoothstep(0.3, 0.45, zm.g);
float stripeZ = igPaint * smoothstep(0.3, 0.5, zm.b);
igGrate = smoothstep(0.35, 0.65, zm.b) * (1.0 - igSteel) * (1.0 - igPaint);
vec3 grain = diffuseColor.rgb;
// poured concrete: big slabs, per-slab tone, saw-cut joints, oil and tyre scuffs
vec2 sq = vGW / ${f(slab)};
vec2 cell = floor(sq), fq = fract(sq);
float tone = gH(cell + 11.0);
float joint = max(gLine((fq.x - 0.5) * ${f(slab)} - sign(fq.x - 0.5) * ${f(slab / 2)}, 0.03), gLine((fq.y - 0.5) * ${f(slab)} - sign(fq.y - 0.5) * ${f(slab / 2)}, 0.03)) * (1.0 - far);
float blot = smoothstep(0.62, 0.8, gN(vGW * 0.35 + 7.0) * 0.7 + gN(vGW * 1.3) * 0.3);
float fineG = mix(gN(vGW * 3.1) * 0.5 + gN(vGW * 11.0) * 0.5, 0.5, far);
vec3 conC = grain * vec3(${tint.map(f).join(', ')}) * (0.82 + 0.24 * tone) * (0.9 + 0.16 * gN(vGW * 0.08)) * (0.9 + 0.2 * fineG);
conC *= (1.0 - 0.4 * joint) * (1.0 - 0.35 * blot);
// steel tread plate: diamond lugs on a 0.1 m grid, bolted panels every 1.5 m
vec2 pq = vGW / 1.5; vec2 pf = fract(pq);
float seam = max(gLine(pf.x - 0.5, 0.012 / 1.5 * 4.0), gLine(pf.y - 0.5, 0.012 / 1.5 * 4.0)) * (1.0 - far);
vec2 lq = vGW / 0.1; lq.x += mod(floor(lq.y), 2.0) * 0.5; vec2 lf = fract(lq) - 0.5;
float lug = smoothstep(0.2, 0.12, abs(lf.x * 0.7 + lf.y) * 0.8 + abs(lf.x - lf.y) * 0.25) * (1.0 - smoothstep(0.004, 0.02, fwidth(vGW.x)));
vec3 steelC = vec3(0.3, 0.31, 0.33) * (0.9 + 0.1 * gH(floor(pq) + 3.0)) * (1.0 + 0.25 * lug) * (1.0 - 0.45 * seam);
// grating: slots over a dark void
vec2 rq = fract(vGW / vec2(0.5, 0.12));
float slot = smoothstep(0.34, 0.28, abs(rq.y - 0.5)) * smoothstep(0.47, 0.43, abs(rq.x - 0.5)) * (1.0 - far);
vec3 grateC = vec3(0.2, 0.2, 0.21) * (1.0 - 0.85 * slot) * (0.85 + 0.2 * gN(vGW * 0.5));
// paint: yellow, worn; hazard = 45° yellow/black bands
float wear = smoothstep(0.35, 0.75, gN(vGW * 2.3) * 0.6 + gN(vGW * 9.0) * 0.4);
float hz = step(0.5, fract((vGW.x + vGW.y) / 0.9));
vec3 paintC = mix(vec3(0.85, 0.62, 0.08), vec3(0.03), hz * stripeZ) * (0.75 + 0.25 * tone);
diffuseColor.rgb = conC;
diffuseColor.rgb = mix(diffuseColor.rgb, steelC, igSteel);
diffuseColor.rgb = mix(diffuseColor.rgb, grateC, igGrate);
diffuseColor.rgb = mix(diffuseColor.rgb, paintC, igPaint * (1.0 - 0.55 * wear));
// rust bleeding from joints and seams, and in blotches
float rs = ${f(rust)} * smoothstep(0.45, 0.8, gN(vGW * 0.6 + 21.0) * 0.6 + gN(vGW * 3.1) * 0.4 + (joint + seam * igSteel) * 0.3);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.14, 0.05) * (0.7 + 0.5 * gN(vGW * 6.0)), rs * (1.0 - igPaint * 0.5));
// puddles sit in low spots: along joints and in broad dips
igWet = ${f(wet)} > 0.0 ? smoothstep(0.58, 0.7, gN(vGW * vec2(0.11, 0.07) + 3.0) * 0.72 + gN(vGW * 0.45) * 0.28 + joint * 0.15 + (${f(wet)} - 0.5) * 0.4) * (1.0 - igGrate) : 0.0;
diffuseColor.rgb *= 1.0 - 0.45 * igWet;
float reflZone = mix(0.3 * (1.0 - 0.6 * joint) * (1.0 - 0.7 * igSteel), 1.1, igWet) * (1.0 - 0.8 * igGrate);
float sheenK = mix(0.6, 1.2, igWet) * (1.0 - igGrate);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = 0.62 + 0.15 * tone + 0.1 * blot;
roughnessFactor = mix(roughnessFactor, 0.52 - 0.1 * lug, igSteel);
roughnessFactor = mix(roughnessFactor, 0.5, igGrate);
roughnessFactor = mix(roughnessFactor, 0.45, igPaint);
roughnessFactor = mix(roughnessFactor, 0.04, igWet);`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = 0.55 * igSteel * (1.0 - igPaint) + 0.5 * igGrate;`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(mix(normal, normalize(vNormal), igWet * 0.85));
#ifdef HF_RAIN
if (igWet > 0.05) {
  // rain rings: each 0.4 m cell drops a small ring now and then (only ~1 in 3 cells per cycle)
  vec2 rg = vec2(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 o = vec2(float(k) * 0.5);
    vec2 c2 = floor(vGW / 0.4 + o), f2 = fract(vGW / 0.4 + o) - 0.5 - (vec2(gH(c2 + 1.3), gH(c2 + 7.1)) - 0.5) * 0.5;
    float cyc = uTime * 0.8 + gH(c2);
    float ph = fract(cyc), on = step(0.66, gH(c2 + floor(cyc) * 0.37));
    float d = length(f2), rr = ph * 0.35;
    float w = sin((d - rr) * 60.0) * smoothstep(0.05, 0.0, abs(d - rr)) * (1.0 - ph) * on;
    rg += f2 / max(d, 1e-3) * w;
  }
  normal = normalize(normal + (viewMatrix * vec4(rg.x, 0.0, rg.y, 0.0)).xyz * 0.12 * igWet * (1.0 - far));
}
#endif`)
        .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
          'vDirectionalShadowCoord[ i ] ) : 1.0;\n\t\t#endif\n\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
          `vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		{
			vec3 sH = normalize( directLight.direction + geometryViewDir );
			float nh = saturate( dot( geometryNormal, sH ) );
			float lobe = pow( nh, 50.0 ) * 0.3 + pow( nh, 8.0 ) * 0.05;
			reflectedLight.directSpecular += directLight.color * lobe * sheenK * saturate( dot( geometryNormal, directLight.direction ) );
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
    const ck = key + li + (refl ? 'r' : '') + (ao ? 'a' : '') + (rain ? 'w' : '') + [slab, ...tint, wet, rust].map(f).join(',');
    mat.customProgramCacheKey = () => 'indGround' + ck;
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    mesh.name = li === 0 ? 'ground' : 'ground' + li;
    mesh.matrixAutoUpdate = false;
    if (L.y !== 0) mesh.layers.enable(REFLECT_LAYER);
    ctx.scene.add(mesh);
    return mesh;
  });
}

// Paint the zone mask in world metres (4 px per m).
export function zoneMask(bounds, paint) {
  const px = 4, W = Math.ceil((bounds.x1 - bounds.x0) * px), H = Math.ceil((bounds.z1 - bounds.z0) * px);
  const c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const X = (x) => (x - bounds.x0) * px, Z = (z) => (z - bounds.z0) * px;
  const P = {
    rect(x0, z0, x1, z1, col) { g.fillStyle = col; g.fillRect(X(x0), Z(z0), (x1 - x0) * px, (z1 - z0) * px); },
    disc(x, z, r, col) { g.fillStyle = col; g.beginPath(); g.arc(X(x), Z(z), r * px, 0, 7); g.fill(); },
    ring(x, z, r0, r1, col) { g.fillStyle = col; g.beginPath(); g.arc(X(x), Z(z), r1 * px, 0, 7); g.arc(X(x), Z(z), r0 * px, 0, 7, true); g.fill(); },
    line(x0, z0, x1, z1, w, col) { g.strokeStyle = col; g.lineWidth = w * px; g.beginPath(); g.moveTo(X(x0), Z(z0)); g.lineTo(X(x1), Z(z1)); g.stroke(); },
    frame(x0, z0, x1, z1, w, col) { g.strokeStyle = col; g.lineWidth = w * px; g.strokeRect(X(x0), Z(z0), (x1 - x0) * px, (z1 - z0) * px); },
  };
  g.globalCompositeOperation = 'lighter';
  paint(P);
  return { canvas: c, x0: bounds.x0, z0: bounds.z0, w: bounds.x1 - bounds.x0, d: bounds.z1 - bounds.z0 };
}
