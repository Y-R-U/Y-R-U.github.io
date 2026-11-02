// Frost Fair theme — shared materials (contract materials + internal ones used by skins / props / backdrop).
// Mobile GPU rule: every custom shader guards its normalize() and clamps pow() bases.
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

  const lights = T.lightsTrimTextures(S(256), 32);
  const tee = T.teePadTextures(S(512));
  const tex = {
    grass: T.grassTexture(S(512)),
    fringe: T.fringeTexture(S(256)),
    candy: T.candyTexture(S(256)),
    snow: T.snowTexture(S(256)),
    drift: T.driftTexture(S(256)),
    lightsMap: lights.map, lightsGlow: lights.emissive,
    rock: T.rockTexture(S(256)),
    ice: T.iceTexture(S(256)),
    planks: T.plankTexture(S(256)),
    waterBump: T.noiseTexture(S(256), 6, 61, 4),
    chevron: T.chevronTexture(),
    teeMap: tee.map, teeGlow: tee.emissive,
    glow: T.glowTexture(64),
    flake: T.flakeTexture(32),
    flag: T.flagTexture(128, 96),
  };
  tex.grass.repeat.set(0.5, 0.5);      // 2 m tile
  tex.candy.repeat.set(3, 3);          // walls: one red/white pair every ~0.17 m, diagonal

  const std = (o) => new THREE.MeshStandardMaterial(o);

  // Fairy-light garland trim: each bulb (8 per metre along u) twinkles on its own phase.
  const trim = std({ map: tex.lightsMap, color: 0xffffff, roughness: 0.7, metalness: 0.0,
    emissive: 0xffffff, emissiveMap: tex.lightsGlow, emissiveIntensity: 2.6 });
  trim.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <emissivemap_fragment>', `
      vec4 fzE = texture2D(emissiveMap, vEmissiveMapUv);
      float fzI = floor(vEmissiveMapUv.x * 8.0);
      float fzH = fract(sin(fzI * 12.9898) * 43758.5453);
      float fzTw = 0.45 + 0.55 * clamp(sin(uTime * (1.3 + fzH * 2.2) + fzH * 40.0) * 0.5 + 0.5, 0.0, 1.0);
      totalEmissiveRadiance *= fzE.rgb * fzTw;`);
  };
  trim.customProgramCacheKey = () => 'frost-trim';
  trim.name = 'frost.lightsTrim';

  const materials = {
    grass: std({ map: tex.grass, roughness: 0.88, metalness: 0 }),
    fringe: std({ map: tex.fringe, roughness: 0.95 }),
    // candy-cane walls: glossy sugar
    wall: std({ map: tex.candy, roughness: 0.32, metalness: 0.0 }),
    // snowy cap
    wallTop: std({ map: tex.snow, color: 0xe6eefc, roughness: 0.75, emissive: 0x1a2440, emissiveIntensity: 0.35 }),
    trim,
    tee: std({ color: 0xb4141f, roughness: 0.45, metalness: 0.1 }),
    cupRim: std({ color: 0xffd26a, roughness: 0.25, metalness: 0.85, emissive: 0x6a4a10, emissiveIntensity: 0.7 }),
    flag: std({ map: tex.flag, roughness: 0.75, side: THREE.DoubleSide, emissive: 0x500808, emissiveIntensity: 0.5 }),
    sand: std({ map: tex.drift, roughness: 0.95 }),
    water: std({ color: 0x2a64b8, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.9,
      bumpMap: tex.waterBump, bumpScale: 1.4, emissive: 0x103a7a, emissiveIntensity: 0.6 }),
    ice: std({ map: tex.ice, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.92, emissive: 0x2a5a8a, emissiveIntensity: 0.35 }),
    boost: std({ color: 0x0c1a3a, roughness: 0.3, metalness: 0.2, emissive: 0xffffff, emissiveMap: tex.chevron, emissiveIntensity: 1.9 }),
    bridge: std({ map: tex.planks, roughness: 0.82 }),
    rock: std({ map: tex.rock, roughness: 0.95 }),
  };
  for (const [k, m] of Object.entries(materials)) if (!m.name) m.name = 'frost.' + k;

  // ---- internal materials ----
  // Frosted ice glass for the tube: pale blue, fresnel rim. vViewPosition is guarded before dividing.
  const glass = std({ color: 0xcfe8ff, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.16,
    emissive: 0x6ab0ff, emissiveIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false });
  glass.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 fzV = vViewPosition;
      float fzL = length(fzV);
      vec3 fzD = fzL > 1e-4 ? fzV / fzL : vec3(0.0, 0.0, 1.0);
      float fzFr = pow(clamp(1.0 - abs(dot(fzD, normal)), 0.0, 1.0), 2.0);
      diffuseColor.a = mix(diffuseColor.a, 0.8, fzFr);
      outgoingLight += vec3(0.75, 0.9, 1.0) * fzFr * 0.8;
      #include <opaque_fragment>`);
  };
  glass.customProgramCacheKey = () => 'frost-glass';

  // Island rock: slate map where the vertex colour is rock; snow (bright, low-saturation vertex colour)
  // gets a fine speckle and glinting crystals that twinkle.
  const vcRock = std({ vertexColors: true, map: tex.rock, roughness: 0.92 });
  vcRock.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <map_fragment>', `
      vec4 fzTex = texture2D(map, vMapUv);
      float fzSnow = smoothstep(0.42, 0.56, min(vColor.r, min(vColor.g, vColor.b)));
      float fzSpeck = 0.9 + 0.2 * texture2D(map, vMapUv * 4.7).g;
      diffuseColor.rgb *= mix(fzTex.rgb * 1.25, vec3(fzSpeck), fzSnow);`)
      .replace('#include <emissivemap_fragment>', `
      vec2 fzCell = floor(vMapUv * 90.0);
      vec2 fzF = fract(vMapUv * 90.0) - 0.5;
      float fzG = fract(sin(dot(fzCell, vec2(127.1, 311.7))) * 43758.5453);
      float fzTw = clamp(sin(uTime * 2.0 + fzG * 60.0), 0.0, 1.0) * (1.0 - smoothstep(0.04, 0.16, length(fzF)));
      totalEmissiveRadiance += vec3(0.8, 0.9, 1.0) * step(0.97, fzG) * fzTw * fzSnow * 1.2;`);
  };
  vcRock.customProgramCacheKey = () => 'frost-vcrock';

  // Candy (keeps uv; u = metres × 8 along, v around): the same stripe map, its own repeat-free copy.
  const candyMap = T.candyTexture(S(128));
  tex.candyMap = candyMap;

  // Frozen icicles / ice set pieces: vertex coloured, glossy, slight cold glow.
  const vcIce = std({ vertexColors: true, roughness: 0.12, metalness: 0.05, emissive: 0x3a6aa0, emissiveIntensity: 0.35, transparent: true, opacity: 0.88 });

  const internal = {
    candyWall: materials.wall,
    snow: materials.wallTop,
    wood: materials.bridge,
    trim,
    vc: std({ vertexColors: true, roughness: 0.8 }),
    vcSnow: std({ vertexColors: true, roughness: 0.7, emissive: 0x1a2440, emissiveIntensity: 0.35 }),
    vcCloth: std({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    vcRock,
    vcIce,
    vcMetal: std({ vertexColors: true, roughness: 0.3, metalness: 0.8 }),
    // glossy (ornaments, presents, sleigh paint)
    vcGloss: std({ vertexColors: true, roughness: 0.3, metalness: 0.15 }),
    candy: std({ map: candyMap, roughness: 0.3 }),
    windowGlow: new THREE.MeshBasicMaterial({ color: 0xffc66a, toneMapped: false }),
    starGlow: new THREE.MeshBasicMaterial({ color: 0xffe58a, toneMapped: false }),
    noseGlow: new THREE.MeshBasicMaterial({ color: 0xff3a2a, toneMapped: false }),
    // fairy-light bulbs: two sets that twinkle in antiphase (vertex coloured)
    bulbA: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    bulbB: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    glass,
    teePad: std({ map: tex.teeMap, roughness: 0.4, metalness: 0.15, emissive: 0xffffff, emissiveMap: tex.teeGlow, emissiveIntensity: 1.2 }),
  };
  for (const [k, m] of Object.entries(internal)) if (!m.name) m.name = 'frost.' + k;

  const animated = {
    tick(dt, t) {
      uniforms.uTime.value = t;
      tex.waterBump.offset.set(t * 0.02, t * 0.035);
      tex.chevron.offset.y = -t * 0.9;
      const a = 0.65 + 0.5 * Math.max(0, Math.sin(t * 2.1)), b = 0.65 + 0.5 * Math.max(0, Math.sin(t * 2.1 + Math.PI));
      internal.bulbA.color.setScalar(a);
      internal.bulbB.color.setScalar(b);
      internal.teePad.emissiveIntensity = 1.2 * (0.85 + 0.15 * Math.sin(t * 1.7));
    },
  };

  function dispose() {
    for (const t of Object.values(tex)) t.dispose();
    for (const m of new Set([...Object.values(materials), ...Object.values(internal)])) m.dispose();
  }

  return { materials, internal, tex, uniforms, animated, dispose };
}
