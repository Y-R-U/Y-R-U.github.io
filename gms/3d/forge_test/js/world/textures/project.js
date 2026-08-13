// World-space texture projection patched into MeshStandardMaterial.
// The building kit uses BoxGeometry, cones and an untextured gable prism, so UVs are either
// stretched or absent — projecting from world space is the only way the material scale is
// consistent across a 56 m wall and a 5 m house. Roughness rides in the albedo alpha channel,
// which keeps this to two texture fetches per plane instead of four.

const HEAD = `
varying vec3 vPPos;
varying vec3 vPNrm;
uniform float pScale;
uniform vec4 pVar;
uniform vec3 pGrunge;
`;

const SKIRT_HEAD = `
uniform sampler2D pGround;
uniform vec4 pGrid;
uniform vec2 pSkirt;
`;

const VERT_NORMAL = `#include <defaultnormal_vertex>
vec3 pN0 = objectNormal;
#ifdef USE_INSTANCING
  pN0 = mat3(instanceMatrix) * pN0;
#endif
vPNrm = normalize(mat3(modelMatrix) * pN0);`;

const VERT_POS = `vec4 pW0 = vec4(transformed, 1.0);
#ifdef USE_INSTANCING
  pW0 = instanceMatrix * pW0;
#endif
vPPos = (modelMatrix * pW0).xyz;
#include <project_vertex>`;

// Districts are merged into one mesh per surface, so a per-mesh tint would colour forty
// buildings at once. Two octaves of world-XZ value noise stand in for per-instance variation:
// pVar = (value amount, hue drift, 1/period in metres, roughness amount).
const VARY = `
float pHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float pNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(pHash(i), pHash(i + vec2(1.0, 0.0)), f.x),
             mix(pHash(i + vec2(0.0, 1.0)), pHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

// pGrunge = (1/period in metres, albedo amount, roughness amount). The tile repeats every few
// metres; this runs at several times that period and climbs the facade as well as crossing it,
// so the repeat has no rhythm left to read at 2 m from a wall.
const VARY_APPLY = `
vec2 pVq = vPPos.xz * pVar.z;
float pVa = pNoise(pVq) - 0.5;
float pVb = pNoise(pVq * 3.1 + 11.3) - 0.5;
float pVv = pVa * 0.74 + pVb * 0.26;
diffuseColor.rgb *= 1.0 + pVv * pVar.x;
diffuseColor.r *= 1.0 + pVb * pVar.y;
diffuseColor.b *= 1.0 - pVb * pVar.y;

vec2 pGq = vec2(vPPos.x + vPPos.z * 0.62, vPPos.y * 1.7 - vPPos.z * 0.44) * pGrunge.x;
float pGn = pNoise(pGq) * 0.63 + pNoise(pGq * 2.9 + 5.1) * 0.37 - 0.5;
diffuseColor.rgb *= 1.0 + pGn * pGrunge.y;`;

// Contact skirt. Height above the terrain comes from a coarse heightfield lookup rather than
// world y, or a building on a slope darkens along a level line through the middle of its wall.
const SKIRT_APPLY = `
float pGy = texture2D(pGround, (vPPos.xz - pGrid.xy) * pGrid.zw).r;
float pSk = pSkirt.x * exp2(-clamp((vPPos.y - pGy) * pSkirt.y, 0.0, 9.0));
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.30, 0.34, 0.30), pSk);`;

const TRI_SETUP = `
vec3 pN = normalize(vPNrm);
vec3 pWt = pow(abs(pN), vec3(6.0));
pWt /= (pWt.x + pWt.y + pWt.z);
vec2 pUvX = vec2(-vPPos.z * sign(pN.x), -vPPos.y) * pScale;
vec2 pUvY = vec2(vPPos.x, vPPos.z * sign(pN.y)) * pScale;
vec2 pUvZ = vec2(vPPos.x * sign(pN.z), -vPPos.y) * pScale;
vec4 pAlb = texture2D(map, pUvX) * pWt.x + texture2D(map, pUvY) * pWt.y + texture2D(map, pUvZ) * pWt.z;
diffuseColor.rgb *= pAlb.rgb;`;

const TRI_NORMAL = `
vec3 pMx = texture2D(normalMap, pUvX).xyz * 2.0 - 1.0;
vec3 pMy = texture2D(normalMap, pUvY).xyz * 2.0 - 1.0;
vec3 pMz = texture2D(normalMap, pUvZ).xyz * 2.0 - 1.0;
pMx.xy *= normalScale; pMy.xy *= normalScale; pMz.xy *= normalScale;
vec3 pTx = vec3(pMx.xy + pN.zy, abs(pMx.z) * pN.x);
vec3 pTy = vec3(pMy.xy + pN.xz, abs(pMy.z) * pN.y);
vec3 pTz = vec3(pMz.xy + pN.xy, abs(pMz.z) * pN.z);
vec3 pWn = normalize(pTx.zyx * pWt.x + pTy.xzy * pWt.y + pTz.xyz * pWt.z);
normal = normalize((viewMatrix * vec4(pWn, 0.0)).xyz);`;

// Courses have to run horizontally and tiles have to run down the fall line, so V is world
// height divided by the slope of the face. U blends the two vertical planes.
const SLOPE_SETUP = `
vec3 pN = normalize(vPNrm);
float pFall = max(sqrt(max(1.0 - pN.y * pN.y, 0.0)), 0.3);
float pV = -vPPos.y / pFall;
float pWx = pN.x * pN.x;
float pWz = pN.z * pN.z;
pWx /= (pWx + pWz + 1e-4); pWz = 1.0 - pWx;
vec2 pUvA = vec2(vPPos.z * sign(pN.x + 1e-5), pV) * pScale;
vec2 pUvB = vec2(vPPos.x * sign(pN.z + 1e-5), pV) * pScale;
vec4 pAlb = texture2D(map, pUvA) * pWx + texture2D(map, pUvB) * pWz;
diffuseColor.rgb *= pAlb.rgb;`;

const SLOPE_NORMAL = `
vec3 pUp = abs(pN.y) > 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 1.0, 0.0);
vec3 pT = normalize(cross(pUp, pN));
vec3 pB = cross(pT, pN);
vec3 pM = (texture2D(normalMap, pUvA).xyz * pWx + texture2D(normalMap, pUvB).xyz * pWz) * 2.0 - 1.0;
pM.xy *= normalScale;
vec3 pWn = normalize(pT * pM.x + pB * pM.y + pN * pM.z);
normal = normalize((viewMatrix * vec4(pWn, 0.0)).xyz);`;

// Panes carry their glow mask in alpha, so the lead cames stay dark while the glass lights up.
const GLASS_ROUGH = 'float roughnessFactor = mix(0.62, 0.14, pAlb.a);';
const GLASS_EMISSIVE = 'totalEmissiveRadiance *= pAlb.a * pAlb.a;';

// One shared pair of uniform objects: every projected material points at the same two, so the
// heightfield only has to be handed over once and late-built materials pick it up for free.
const pGround = { value: null };
const pGrid = { value: null };

export function setGroundField(tex, grid) {
  pGround.value = tex;
  pGrid.value = grid;
}

export function project(mat, mode, tileMetres, vary = {}) {
  const scale = mat.userData.pScale || { value: 0 };
  scale.value = 1 / tileMetres;
  const v = mat.userData.pVar || { value: [0, 0, 0, 0] };
  v.value = [vary.amount ?? 0, vary.hue ?? 0, 1 / (vary.period ?? 12), vary.rough ?? 0];
  const g = mat.userData.pGrunge || { value: [0, 0, 0] };
  g.value = [1 / (vary.grunge ?? 34), vary.grungeAmount ?? 0, vary.grungeRough ?? 0];
  const sk = mat.userData.pSkirt || { value: [0, 0] };
  sk.value = [vary.skirt ?? 0, 1 / (vary.skirtFall ?? 0.5)];
  mat.userData.pScale = scale;
  mat.userData.pVar = v;
  mat.userData.pGrunge = g;
  mat.userData.pSkirt = sk;
  mat.roughness = 1;

  const glass = mode === 'glass';
  const skirt = !glass && (vary.skirt ?? 0) > 0;
  const setup = (mode === 'slope' ? SLOPE_SETUP : TRI_SETUP) + VARY_APPLY + (skirt ? SKIRT_APPLY : '');
  const norm = mode === 'slope' ? SLOPE_NORMAL : TRI_NORMAL;
  const rough = `float roughnessFactor = clamp(pAlb.a + pVa * pVar.w + pGn * pGrunge.z${skirt ? ' + pSk * 0.3' : ''}, 0.06, 1.0);`;

  mat.onBeforeCompile = shader => {
    shader.uniforms.pScale = scale;
    shader.uniforms.pVar = v;
    shader.uniforms.pGrunge = g;
    if (skirt) { shader.uniforms.pSkirt = sk; shader.uniforms.pGround = pGround; shader.uniforms.pGrid = pGrid; }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${HEAD}`)
      .replace('#include <defaultnormal_vertex>', VERT_NORMAL)
      .replace('#include <project_vertex>', VERT_POS);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${HEAD}${skirt ? SKIRT_HEAD : ''}${VARY}`)
      .replace('#include <map_fragment>', setup)
      .replace('#include <roughnessmap_fragment>', glass ? GLASS_ROUGH : rough)
      .replace('#include <normal_fragment_maps>', norm);
    if (glass) {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <emissivemap_fragment>', GLASS_EMISSIVE);
    }
  };
  mat.customProgramCacheKey = () => `proj:${mode}:${skirt ? 1 : 0}`;
  mat.needsUpdate = true;
  return mat;
}
