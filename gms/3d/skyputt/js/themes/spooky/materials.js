// Spooky Hollow theme — shared materials (contract materials + internal ones used by skins/backdrop).
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

  const ember = T.emberTrimTextures(S(256), 32);
  const tee = T.teePadTextures(S(512));
  const tex = {
    grass: T.grassTexture(S(512)),
    fringe: T.fringeTexture(S(256)),
    stone: T.stoneBlockTexture(S(512), S(256)),
    slate: T.slateTexture(S(256)),
    emberMap: ember.map, emberGlow: ember.emissive,
    rock: T.rockTexture(S(256)),
    crack: T.crackTexture(S(256)),
    dirt: T.dirtTexture(S(256)),
    wood: T.woodTexture(S(256)),
    waterBump: T.noiseTexture(S(256), 6, 61, 4),
    ice: T.iceTexture(S(256)),
    chevron: T.chevronTexture(),
    teeMap: tee.map, teeGlow: tee.emissive,
    face: T.faceTexture(128),
    glow: T.glowTexture(64),
    flag: T.flagTexture(128, 96),
  };
  tex.stone.repeat.set(1, 2);   // texture spans 1 m × 0.5 m → repeat 2 in v per metre

  const std = (o) => new THREE.MeshStandardMaterial(o);

  // Ember trim: dark iron band with glowing segments; update() flickers the intensity.
  const trim = std({ map: tex.emberMap, color: 0xffffff, roughness: 0.55, metalness: 0.5,
    emissive: 0xffffff, emissiveMap: tex.emberGlow, emissiveIntensity: 2.2 });
  trim.name = 'spooky.emberTrim';

  const materials = {
    grass: std({ map: tex.grass, roughness: 0.92, metalness: 0 }),
    fringe: std({ map: tex.fringe, color: 0xd8d8d8, roughness: 1 }),
    wall: std({ map: tex.stone, color: 0xe6e0ee, roughness: 0.85 }),
    wallTop: std({ map: tex.slate, color: 0xe8e4f0, roughness: 0.55, metalness: 0.05 }),
    trim,
    tee: std({ map: tex.slate, color: 0x6a6476, roughness: 0.5, metalness: 0.1 }),
    cupRim: std({ color: 0xf2ead6, roughness: 0.3, metalness: 0.35, emissive: 0x3a3020, emissiveIntensity: 0.6 }),
    flag: std({ map: tex.flag, alphaTest: 0.5, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x6a0808, emissiveIntensity: 0.55 }),
    sand: std({ map: tex.dirt, roughness: 1 }),
    water: std({ color: 0x36c860, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.9,
      bumpMap: tex.waterBump, bumpScale: 1.6, emissive: 0x18a040, emissiveIntensity: 0.7 }),
    ice: std({ map: tex.ice, roughness: 0.06, metalness: 0.08, transparent: true, opacity: 0.9, emissive: 0x1f6a50, emissiveIntensity: 0.3 }),
    boost: std({ color: 0x1a0c18, roughness: 0.3, metalness: 0.2, emissive: 0xffffff, emissiveMap: tex.chevron, emissiveIntensity: 1.9 }),
    bridge: std({ map: tex.wood, roughness: 0.82 }),
    rock: std({ map: tex.rock, roughness: 0.95 }),
  };
  for (const [k, m] of Object.entries(materials)) if (!m.name) m.name = 'spooky.' + k;

  // ---- internal materials (skins / backdrop) ----
  // Ghostly green glass: fresnel rim, mostly see-through. vViewPosition is never zero for a visible
  // fragment, but guard the normalize anyway (mobile GPU rule).
  const glass = std({ color: 0x9fffc8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14,
    emissive: 0x20c070, emissiveIntensity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  glass.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 spV = vViewPosition;
      float spL = length(spV);
      vec3 spD = spL > 1e-4 ? spV / spL : vec3(0.0, 0.0, 1.0);
      float spFr = pow(clamp(1.0 - abs(dot(spD, normal)), 0.0, 1.0), 2.0);
      diffuseColor.a = mix(diffuseColor.a, 0.85, spFr);
      outgoingLight += vec3(0.45, 1.0, 0.65) * spFr * 0.9;
      #include <opaque_fragment>`);
  };
  glass.customProgramCacheKey = () => 'spooky-glass';

  // Island rock: rock map where the vertex colour is not mossy; lava cracks glow on the rock faces.
  const vcRock = std({ vertexColors: true, map: tex.rock, roughness: 0.95 });
  vcRock.onBeforeCompile = (sh) => {
    sh.uniforms.uCrack = { value: tex.crack };
    sh.uniforms.uTime = uniforms.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uCrack; uniform float uTime;')
      .replace('#include <map_fragment>', `
      vec4 spTex = texture2D(map, vMapUv);
      float spGrass = smoothstep(0.03, 0.14, vColor.g - max(vColor.r, vColor.b));
      float spSpeck = 0.82 + 0.36 * texture2D(map, vMapUv * 5.3).g;
      diffuseColor.rgb *= mix(spTex.rgb * 1.2, vec3(spSpeck), spGrass);`)
      .replace('#include <emissivemap_fragment>', `
      vec4 spCr = texture2D(uCrack, vMapUv * 0.55);
      float spMask = smoothstep(0.35, 0.9, texture2D(uCrack, vMapUv * 0.17 + 0.31).g);
      float spPulse = 0.75 + 0.25 * sin(uTime * 1.3 + vMapUv.x * 2.0 + vMapUv.y * 1.3);
      totalEmissiveRadiance += vec3(1.0, 0.36, 0.06) * spCr.r * spMask * (1.0 - spGrass) * 1.05 * spPulse;`);
  };
  vcRock.customProgramCacheKey = () => 'spooky-vcrock';

  const internal = {
    ember: trim,
    stone: materials.wall,
    slate: materials.wallTop,
    wood: materials.bridge,
    vc: std({ vertexColors: true, roughness: 0.82 }),
    vcCloth: std({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    vcRock,
    vcMetal: std({ vertexColors: true, roughness: 0.45, metalness: 0.75 }),
    // vertex-coloured, slightly glossy (pumpkins, candy, skulls)
    vcGloss: std({ vertexColors: true, roughness: 0.45, metalness: 0.0 }),
    windowGlow: new THREE.MeshBasicMaterial({ color: 0xffb04a, toneMapped: false }),
    emberGlow: new THREE.MeshBasicMaterial({ color: 0xff8a1e, toneMapped: false }),
    faceGlow: new THREE.MeshBasicMaterial({ color: 0xffc04a, toneMapped: false }),
    greenGlow: new THREE.MeshBasicMaterial({ color: 0x7dffa0, toneMapped: false }),
    candle: new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false }),
    glass,
    teePad: std({ map: tex.teeMap, roughness: 0.6, metalness: 0.05, emissive: 0xffffff, emissiveMap: tex.teeGlow, emissiveIntensity: 1.6 }),
    additive: new THREE.MeshBasicMaterial({ map: tex.glow, color: 0xff9a40, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  };
  for (const [k, m] of Object.entries(internal)) if (!m.name) m.name = 'spooky.' + k;

  const animated = {
    tick(dt, t) {
      uniforms.uTime.value = t;
      tex.waterBump.offset.set(t * 0.03, t * 0.05);
      tex.chevron.offset.y = -t * 0.9;
      // candle-like flicker on the ember trim and the tee face
      const f = 0.86 + 0.08 * Math.sin(t * 7.3) * Math.sin(t * 3.1 + 1.3) + 0.06 * Math.sin(t * 13.7);
      trim.emissiveIntensity = 2.2 * f;
      internal.teePad.emissiveIntensity = 1.6 * (0.9 + 0.1 * Math.sin(t * 2.6)) * f;
    },
  };

  function dispose() {
    for (const t of Object.values(tex)) t.dispose();
    for (const m of new Set([...Object.values(materials), ...Object.values(internal)])) m.dispose();
  }

  return { materials, internal, tex, uniforms, animated, dispose };
}
