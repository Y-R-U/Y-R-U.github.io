// Sky Isles theme — shared materials (contract materials + internal ones used by skins/backdrop).
import * as THREE from 'three';
import * as T from './textures.js';

/**
 * @param {'low'|'high'} quality
 * @returns {{ materials, internal, uniforms, animated, dispose }}
 */
export function createMaterials(quality = 'high') {
  const hi = quality !== 'low';
  const S = (n) => (hi ? n : n >> 1);
  const uniforms = { uTime: { value: 0 } };

  const tex = {
    grass: T.grassTexture(S(512)),
    fringe: T.fringeTexture(S(256)),
    stone: T.stoneBlockTexture(S(512), S(256)),
    marble: T.marbleTexture(S(256)),
    rock: T.rockTexture(S(256)),
    sand: T.sandTexture(S(256)),
    wood: T.woodTexture(S(256)),
    waterBump: T.noiseTexture(S(256), 6, 61, 4),
    ice: T.iceTexture(S(256)),
    chevron: T.chevronTexture(),
    teePad: T.teePadTexture(S(512)),
    glow: T.glowTexture(64),
  };
  tex.stone.repeat.set(1, 2);   // texture spans 1 m × 0.5 m → repeat 2 in v per metre

  const std = (o) => new THREE.MeshStandardMaterial(o);

  const trim = std({ color: 0xffc356, metalness: 1, roughness: 0.26, emissive: 0x5a3400, emissiveIntensity: 0.45 });
  trim.name = 'sky.gold';

  const materials = {
    grass: std({ map: tex.grass, roughness: 0.9, metalness: 0 }),
    fringe: std({ map: tex.fringe, color: 0xd8e6c8, roughness: 1 }),
    wall: std({ map: tex.stone, color: 0xf2e6d6, roughness: 0.82 }),
    wallTop: std({ map: tex.marble, color: 0xfff6ea, roughness: 0.3, metalness: 0.05 }),
    trim,
    tee: std({ map: tex.marble, color: 0x5d6884, roughness: 0.32, metalness: 0.1 }),
    cupRim: std({ color: 0xf6f3ea, roughness: 0.25, metalness: 0.55 }),
    flag: std({ color: 0xe4232d, roughness: 0.65, side: THREE.DoubleSide, emissive: 0x400000, emissiveIntensity: 0.4 }),
    sand: std({ map: tex.sand, roughness: 1 }),
    water: std({ color: 0x2aa3d8, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.86,
      bumpMap: tex.waterBump, bumpScale: 1.6, emissive: 0x0a4a6a, emissiveIntensity: 0.6 }),
    ice: std({ map: tex.ice, roughness: 0.06, metalness: 0.08, transparent: true, opacity: 0.92, emissive: 0x2a5a70, emissiveIntensity: 0.25 }),
    boost: std({ color: 0x0c2240, roughness: 0.28, metalness: 0.2, emissive: 0xffffff, emissiveMap: tex.chevron, emissiveIntensity: 1.9 }),
    bridge: std({ map: tex.wood, roughness: 0.78 }),
    rock: std({ map: tex.rock, roughness: 0.95 }),
  };
  for (const [k, m] of Object.entries(materials)) if (!m.name) m.name = 'sky.' + k;

  // ---- internal materials (skins / backdrop) ----
  const glass = std({ color: 0x9fe4ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16,
    emissive: 0x2a9fe0, emissiveIntensity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  glass.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      float skyFr = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.2);
      diffuseColor.a = mix(diffuseColor.a, 0.9, skyFr);
      outgoingLight += vec3(0.45, 0.85, 1.0) * skyFr * 0.9;
      #include <opaque_fragment>`);
  };
  glass.customProgramCacheKey = () => 'sky-glass';

  // Island rock: the rock map only applies where the vertex colour is not grassy; grass gets a fine speckle.
  const vcRock = std({ vertexColors: true, map: tex.rock, roughness: 0.95 });
  vcRock.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `
      vec4 skyTex = texture2D(map, vMapUv);
      float skyGrass = smoothstep(0.04, 0.2, vColor.g - max(vColor.r, vColor.b));
      float skySpeck = 0.82 + 0.36 * texture2D(map, vMapUv * 5.3).g;
      diffuseColor.rgb *= mix(skyTex.rgb * 1.15, vec3(skySpeck), skyGrass);`);
  };
  vcRock.customProgramCacheKey = () => 'sky-vcrock';

  const internal = {
    gold: trim,
    stone: materials.wall,
    marble: materials.wallTop,
    wood: materials.bridge,
    vc: std({ vertexColors: true, roughness: 0.82 }),
    vcCloth: std({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    vcRock,
    vcMetal: std({ vertexColors: true, roughness: 0.4, metalness: 0.7 }),
    windowGlow: new THREE.MeshBasicMaterial({ color: 0xffcf7a, toneMapped: false }),
    blueGlow: new THREE.MeshBasicMaterial({ color: 0x66e0ff, toneMapped: false }),
    crystal: std({ color: 0x3f8cff, emissive: 0x1a5cff, emissiveIntensity: 0.85, roughness: 0.1, metalness: 0.35, flatShading: true }),
    glass,
    teePad: std({ map: tex.teePad, roughness: 0.3, metalness: 0.15 }),
    additive: new THREE.MeshBasicMaterial({ map: tex.glow, color: 0x7fe0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  for (const [k, m] of Object.entries(internal)) if (!m.name) m.name = 'sky.' + k;

  // Textures the environment's update() scrolls (only if the engine calls update).
  const animated = {
    tick(dt, t) {
      uniforms.uTime.value = t;
      tex.waterBump.offset.set(t * 0.03, t * 0.05);
      tex.chevron.offset.y = -t * 0.9;
    },
  };

  function dispose() {
    for (const t of Object.values(tex)) t.dispose();
    for (const m of new Set([...Object.values(materials), ...Object.values(internal)])) m.dispose();
  }

  return { materials, internal, tex, uniforms, animated, dispose };
}
