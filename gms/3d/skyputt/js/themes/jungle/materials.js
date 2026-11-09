// Jungle Temple theme — shared materials (contract materials + internal ones used by skins / props / backdrop).
// Mobile GPU rule: every custom shader guards its normalize() / divides and clamps pow() bases.
import * as THREE from 'three';
import * as T from './textures.js';

/**
 * @param {'low'|'high'} quality
 * @returns {{ materials, internal, tex, uniforms, animated, dispose }}
 */
export function createMaterials(quality = 'high') {
  const hi = quality !== 'low';
  const S = (n) => (hi ? n : n >> 1);
  const uniforms = { uTime: { value: 0 } };

  const tee = T.teePadTextures(S(512));
  const wall = T.wallTextures(S(256));
  const cap = T.capTextures(S(512), S(128));
  const trim = T.trimTextures(S(256), 32);
  const band = T.bandTextures(S(128), 64);
  const glyph = T.glyphTextures();
  const tex = {
    grass: T.grassTexture(S(512)),
    fringe: T.fringeTexture(S(256)),
    wall: wall.map,
    cap: cap.map, capGlow: cap.emissive,
    trim: trim.map, trimGlow: trim.emissive,
    rockData: T.rockDataTexture(S(256)),
    dust: T.dustTexture(S(256)),
    mud: T.mudTexture(S(256)),
    jade: T.jadeTexture(S(256)),
    plank: T.plankTexture(S(256)),
    glyph: glyph.map, glyphGlow: glyph.emissive,
    band: band.map, bandGlow: band.emissive,
    bark: T.barkTexture(S(128), S(256)),
    teeMap: tee.map, teeGlow: tee.emissive,
    leaf: T.leafAtlas(S(256)),
    liana: T.lianaTexture(32, S(256)),
    bird: T.birdAtlas(128),
    fall: T.waterfallTexture(S(128), S(256)),
    glow: T.glowTexture(64),
    mist: T.mistTexture(64),
    flag: T.flagTexture(128, 96),
  };
  tex.grass.repeat.set(0.5, 0.5);       // 2 m tile
  tex.wall.repeat.set(4, 4);            // 0.25 m tile
  for (const k of ['cap', 'capGlow']) tex[k].repeat.set(2, 1);   // 0.5 m along, v across the cap
  for (const k of ['trim', 'trimGlow']) { tex[k].repeat.set(4, 1); tex[k].wrapT = THREE.ClampToEdgeWrapping; }

  const std = (o) => new THREE.MeshStandardMaterial(o);

  // wet polished jade (ice): glossy green stone, a view-dependent pale sheen (vViewPosition length-guarded)
  const jade = std({ map: tex.jade, roughness: 0.1, metalness: 0.15, emissive: 0x0a2a1a, emissiveIntensity: 0.5 });
  jade.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float gL = length(vViewPosition);
        vec3 gD = gL > 1e-4 ? vViewPosition / gL : vec3(0.0, 0.0, 1.0);
        float gF = clamp(1.0 - abs(dot(gD, normal)), 0.0, 1.0);
        outgoingLight += vec3(0.55, 0.9, 0.7) * gF * gF * 0.3;
      }
      #include <opaque_fragment>`);
  };
  jade.customProgramCacheKey = () => 'jungle-jade';

  const trimMat = std({ map: tex.trim, roughness: 0.35, metalness: 0.7, emissive: 0xffffff, emissiveMap: tex.trimGlow, emissiveIntensity: 0.6 });
  const capMat = std({ map: tex.cap, roughness: 0.75, metalness: 0.05, emissive: 0xffffff, emissiveMap: tex.capGlow, emissiveIntensity: 0.35 });

  const materials = {
    grass: std({ map: tex.grass, roughness: 0.95, metalness: 0 }),
    fringe: std({ map: tex.fringe, roughness: 0.9 }),
    wall: std({ map: tex.wall, roughness: 0.9, metalness: 0 }),
    wallTop: capMat,
    trim: trimMat,
    tee: std({ color: 0xb8a888, roughness: 0.85 }),
    cupRim: std({ color: 0xd8a840, roughness: 0.3, metalness: 0.85, emissive: 0x3a2400, emissiveIntensity: 0.5 }),
    flag: std({ map: tex.flag, roughness: 0.85, side: THREE.DoubleSide, alphaTest: 0.5 }),
    sand: std({ map: tex.dust, roughness: 0.98 }),
    // mud (sticky patches: js/game/holeview.js looks up `sticky` first, then `sand`): wet, so a low roughness
    sticky: std({ map: tex.mud, roughness: 0.38, metalness: 0.05 }),
    water: new THREE.MeshBasicMaterial({ color: 0x4a8a7a, transparent: true, opacity: 0.6 }),   // unused by the engine
    ice: jade,
    boost: std({ map: tex.glyph, roughness: 0.8, metalness: 0, emissive: 0xffffff, emissiveMap: tex.glyphGlow, emissiveIntensity: 1.5 }),
    bridge: std({ map: tex.plank, roughness: 0.85 }),
    rock: std({ map: tex.rockData, color: 0x8a8474, roughness: 0.95, flatShading: true }),
  };
  for (const [k, m] of Object.entries(materials)) if (!m.name) m.name = 'jungle.' + k;

  // ---- internal materials ----
  // Island: temple terraces. Vertex colours paint carved stone (cool grey-green, blue >= red) and earth /
  // rock / moss (red > blue). Anything facing up reads the paving channel (G); stone sides the block channel
  // (R), earth and moss sides the grain channel (B).
  const vcRock = std({ vertexColors: true, map: tex.rockData, roughness: 0.92, metalness: 0, flatShading: true });
  vcRock.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', `
      vec4 vfTex = texture2D(map, vMapUv);`)
      .replace('#include <emissivemap_fragment>', `
      float vfRock = smoothstep(0.0, 0.05, vColor.r - vColor.b);
      vec3 vfUp = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
      float vfTop = smoothstep(0.6, 0.85, dot(normal, vfUp));
      float vfSide = mix(vfTex.r * 1.1, vfTex.b * 1.3, vfRock);
      diffuseColor.rgb *= mix(vfSide, vfTex.g * 1.12, vfTop);   // anything facing up reads as mossy paving
      #include <emissivemap_fragment>`);
  };
  vcRock.customProgramCacheKey = () => 'jungle-vcrock';

  // Foliage: alpha-tested atlas leaves; a small rustle from the world position (all parts move a little).
  const leaf = std({ map: tex.leaf, vertexColors: true, roughness: 0.75, alphaTest: 0.5, side: THREE.DoubleSide });
  leaf.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 lw = (modelMatrix * vec4(transformed, 1.0)).xyz;
        float la = 0.012 + 0.02 * clamp(lw.y * 0.02, 0.0, 1.0);
        transformed.x += sin(uTime * 1.4 + lw.x * 2.3 + lw.y * 3.1) * la;
        transformed.z += cos(uTime * 1.1 + lw.z * 2.1 + lw.y * 2.7) * la;
      }`);
  };
  leaf.customProgramCacheKey = () => 'jungle-leaf';

  // Lianas (instanced ribbons): pinned at the top (uv.y = 1), swaying more toward the free end.
  const liana = std({ map: tex.liana, roughness: 0.8, alphaTest: 0.5, side: THREE.DoubleSide });
  liana.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float lh = clamp(1.0 - uv.y, 0.0, 1.0);
        float lph = 0.0;
        #ifdef USE_INSTANCING
          lph = instanceMatrix[3].x * 0.61 + instanceMatrix[3].z * 0.47;
        #endif
        float lw = lh * lh;
        transformed.x += (sin(uTime * 0.8 + lph + lh * 1.6) * 0.16 + sin(uTime * 0.31 + lph * 1.9) * 0.08) * lw;
        transformed.z += cos(uTime * 0.6 + lph * 1.3) * 0.1 * lw;
      }`);
  };
  liana.customProgramCacheKey = () => 'jungle-liana';

  const waterfall = new THREE.MeshBasicMaterial({ map: tex.fall, color: 0xe8fff8, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  tex.fall.repeat.set(1, 2);

  const internal = {
    vc: std({ vertexColors: true, roughness: 0.82, metalness: 0 }),
    vcStone: std({ vertexColors: true, roughness: 0.93, metalness: 0, flatShading: true }),
    vcGold: std({ vertexColors: true, roughness: 0.3, metalness: 0.6 }),
    vcRock,
    leaf, liana, waterfall,
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    band: std({ map: tex.band, roughness: 0.6, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex.bandGlow, emissiveIntensity: 0.3, side: THREE.DoubleSide }),
    bark: std({ map: tex.bark, vertexColors: true, roughness: 0.95, side: THREE.DoubleSide }),
    gemGlow: new THREE.MeshBasicMaterial({ color: 0x70ffb0, toneMapped: false }),
    teePad: std({ map: tex.teeMap, roughness: 0.85, metalness: 0.05, emissive: 0xffffff, emissiveMap: tex.teeGlow, emissiveIntensity: 0.9 }),
  };
  for (const [k, m] of Object.entries(internal)) if (!m.name) m.name = 'jungle.' + k;

  const animated = {
    tick(dt, t) {
      uniforms.uTime.value = t;
      tex.glyphGlow.offset.y = -t * 1.0;
      tex.bandGlow.offset.x = -t * 0.2;
      tex.fall.offset.y = t * 0.9;
      materials.boost.emissiveIntensity = 1.5 * (0.8 + 0.2 * Math.sin(t * 2.2));
      trimMat.emissiveIntensity = 0.6 * (0.8 + 0.2 * Math.sin(t * 0.9));
      internal.teePad.emissiveIntensity = 0.9 * (0.8 + 0.2 * Math.sin(t * 1.4));
    },
  };

  function dispose() {
    for (const t of Object.values(tex)) t?.dispose();
    for (const m of new Set([...Object.values(materials), ...Object.values(internal)])) m.dispose();
  }

  return { materials, internal, tex, uniforms, animated, dispose };
}
