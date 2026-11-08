// Volcano Forge theme — shared materials (contract materials + internal ones used by skins / props / backdrop).
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

  const tee = T.teePadTextures(S(512));
  const fringe = T.fringeTextures(S(256));
  const basalt = T.basaltTextures(S(256));
  const trim = T.trimTextures(S(256), 32);
  const band = T.bandTextures(S(128), 64);
  const tex = {
    grass: T.grassTexture(S(512)),
    fringe: fringe.map, fringeGlow: fringe.emissive,
    basalt: basalt.map, basaltGlow: basalt.emissive,
    cap: T.capTexture(S(512), S(128)),
    trim: trim.map, trimGlow: trim.emissive,
    rockData: T.rockDataTexture(S(256)),
    ash: T.ashTexture(S(256)),
    obsidian: T.obsidianTexture(S(256)),
    iron: T.ironPlateTexture(S(256)),
    lava: T.lavaTexture(S(256)),
    lavaSlow: null,
    chevron: T.chevronTexture(),
    band: band.map, bandGlow: band.emissive,
    teeMap: tee.map, teeGlow: tee.emissive,
    glow: T.glowTexture(64),
    spark: T.sparkTexture(64),
    flag: T.flagTexture(128, 96),
  };
  tex.lavaSlow = tex.lava.clone(); tex.lavaSlow.needsUpdate = true;
  tex.grass.repeat.set(0.5, 0.5);       // 2 m tile
  for (const k of ['basalt', 'basaltGlow']) tex[k].repeat.set(4, 4);   // 0.25 m tile
  tex.cap.repeat.set(2, 1);             // 0.5 m along, v across the cap
  for (const k of ['trim', 'trimGlow']) { tex[k].repeat.set(4, 1); tex[k].wrapT = THREE.ClampToEdgeWrapping; }
  tex.band.repeat.set(1, 1); tex.bandGlow.repeat.set(1, 1);
  tex.lava.repeat.set(0.6, 0.6);
  tex.lavaSlow.repeat.set(0.25, 0.25);

  const std = (o) => new THREE.MeshStandardMaterial(o);
  // Faint ember rim: a fresnel glow on grazing faces, as if lit by the lava. The view vector is
  // length-guarded and the pow() base clamped (Adreno NaN rule).
  const emberRim = (m, key) => {
    m.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          float vl = length(vViewPosition);
          vec3 rv = vl > 1e-4 ? vViewPosition / vl : vec3(0.0, 0.0, 1.0);
          float rim = pow(clamp(1.0 - abs(dot(normal, rv)), 0.0, 1.0), 3.0);
          totalEmissiveRadiance += vec3(1.0, 0.34, 0.08) * rim * 0.55;
        }`);
    };
    m.customProgramCacheKey = () => 'volcano-rim-' + key;
    return m;
  };

  // trim: brass bands with a molten channel that flows along the wall and pulses gently
  const trimMat = std({ map: tex.trim, roughness: 0.4, metalness: 0.55, emissive: 0xffffff, emissiveMap: tex.trimGlow, emissiveIntensity: 1.6 });

  const materials = {
    grass: std({ map: tex.grass, roughness: 0.92, metalness: 0 }),
    fringe: std({ map: tex.fringe, roughness: 0.95, emissive: 0xffffff, emissiveMap: tex.fringeGlow, emissiveIntensity: 0.9 }),
    wall: std({ map: tex.basalt, roughness: 0.78, metalness: 0.0, emissive: 0xffffff, emissiveMap: tex.basaltGlow, emissiveIntensity: 1.1 }),
    wallTop: std({ map: tex.cap, roughness: 0.42, metalness: 0.55 }),
    trim: trimMat,
    tee: std({ color: 0x4a4440, roughness: 0.55, metalness: 0.4 }),
    cupRim: std({ color: 0xd8a04a, roughness: 0.3, metalness: 0.8, emissive: 0xff6a18, emissiveIntensity: 0.45 }),
    flag: std({ map: tex.flag, roughness: 0.75, side: THREE.DoubleSide, emissive: 0x3a0804, emissiveIntensity: 0.6 }),
    sand: std({ map: tex.ash, roughness: 0.95 }),
    // lava (the engine has no water patches yet; pools and falls use the same look)
    water: new THREE.MeshBasicMaterial({ map: tex.lava, toneMapped: false }),
    ice: std({ map: tex.obsidian, roughness: 0.06, metalness: 0.3, emissive: 0x16181c, emissiveIntensity: 0.4 }),
    boost: std({ color: 0x3a2a24, roughness: 0.35, metalness: 0.5, emissive: 0xffffff, emissiveMap: tex.chevron, emissiveIntensity: 1.8 }),
    bridge: std({ map: tex.iron, roughness: 0.55, metalness: 0.45 }),
    rock: std({ map: tex.rockData, color: 0x5a5452, roughness: 0.9 }),
  };
  for (const [k, m] of Object.entries(materials)) if (!m.name) m.name = 'volcano.' + k;

  // ---- internal materials ----
  // Smoked-amber obsidian glass for the tube: fresnel rim. vViewPosition is length-guarded before dividing.
  const glass = std({ color: 0xffb070, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.16,
    emissive: 0xff6a20, emissiveIntensity: 0.25, side: THREE.DoubleSide, depthWrite: false });
  glass.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 vfV = vViewPosition;
      float vfL = length(vfV);
      vec3 vfD = vfL > 1e-4 ? vfV / vfL : vec3(0.0, 0.0, 1.0);
      float vfFr = pow(clamp(1.0 - abs(dot(vfD, normal)), 0.0, 1.0), 2.0);
      diffuseColor.a = mix(diffuseColor.a, 0.72, vfFr);
      outgoingLight += vec3(1.0, 0.55, 0.25) * vfFr * 0.6;
      #include <opaque_fragment>`);
  };
  glass.customProgramCacheKey = () => 'volcano-glass';

  // Island rock: vertex colours paint basalt, the scorched-moss top and "hot" zones (red > green). The data
  // map gives basalt column seams (R, sides), a plain grain (G, the moss top) and a crack network (B) that
  // glows molten where the vertex colour is hot, flickering slowly.
  const vcRock = std({ vertexColors: true, map: tex.rockData, roughness: 0.88 });
  vcRock.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <map_fragment>', `
      vec4 vfTex = texture2D(map, vMapUv);
      float vfMoss = smoothstep(0.0, 0.03, vColor.g - vColor.r);          // moss / ash top: green > red
      float vfHeat = smoothstep(0.04, 0.16, vColor.r - vColor.g);         // hot zones: red >> green (linear)
      float vfTone = mix(vfTex.r * 1.35, vfTex.g, vfMoss);
      diffuseColor.rgb *= mix(vfTone, 1.0, vfHeat * 0.4);`)
      .replace('#include <emissivemap_fragment>', `
      float vfCr = vfTex.b;
      float vfFl = 0.75 + 0.25 * sin(uTime * 1.3 + vMapUv.x * 7.0 + vMapUv.y * 5.0);
      vec3 vfLava = mix(vec3(1.0, 0.28, 0.04), vec3(1.0, 0.62, 0.15), vfCr * vfCr);
      totalEmissiveRadiance += vfLava * vfCr * vfHeat * vfFl * 1.6;`);
  };
  vcRock.customProgramCacheKey = () => 'volcano-vcrock';

  // Ember glow surfaces (vertex colour, unlit, flicker per-vertex position)
  const ember = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  ember.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vfFlick;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 vfW = modelMatrix * vec4(position, 1.0);
      vfFlick = 0.8 + 0.2 * sin(uTime * 7.0 + vfW.x * 3.1 + vfW.z * 2.3) * sin(uTime * 4.3 + vfW.y * 5.0);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vfFlick;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vfFlick;');
  };
  ember.customProgramCacheKey = () => 'volcano-ember';

  // Lava surfaces (pools, crater, flank streams): scrolling map, unlit
  const lava = new THREE.MeshBasicMaterial({ map: tex.lava, toneMapped: false });
  const lavaFar = new THREE.MeshBasicMaterial({ map: tex.lavaSlow, toneMapped: false, fog: false });   // glows through the haze

  const internal = {
    basalt: materials.wall,
    vc: std({ vertexColors: true, roughness: 0.85 }),
    // basalt / dark stone for props and set pieces
    vcStone: std({ vertexColors: true, roughness: 0.9, flatShading: true }),
    // obsidian crystals: dark glassy black / grey like the obsidian ice, with a faint ember rim (fresnel)
    vcGloss: emberRim(std({ vertexColors: true, roughness: 0.08, metalness: 0.3, emissive: 0x16181c, emissiveIntensity: 0.4 }), 'vg'),
    crystalInst: emberRim(std({ color: 0xffffff, roughness: 0.08, metalness: 0.3, emissive: 0x16181c, emissiveIntensity: 0.4, flatShading: true }), 'ci'),
    stoneInst: std({ color: 0xffffff, roughness: 0.92, flatShading: true }),
    vcCloth: std({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
    // iron / brass / copper (vertex colour picks which)
    vcMetal: std({ vertexColors: true, roughness: 0.38, metalness: 0.8 }),
    vcRock,
    ember,
    lava,
    lavaFar,
    band: std({ map: tex.band, roughness: 0.45, metalness: 0.55, emissive: 0xffffff, emissiveMap: tex.bandGlow, emissiveIntensity: 1.5, side: THREE.DoubleSide }),
    windowGlow: new THREE.MeshBasicMaterial({ color: 0xffa040, toneMapped: false }),
    gemGlow: new THREE.MeshBasicMaterial({ color: 0xff5a1a, toneMapped: false }),
    glass,
    teePad: std({ map: tex.teeMap, roughness: 0.45, metalness: 0.5, emissive: 0xffffff, emissiveMap: tex.teeGlow, emissiveIntensity: 1.2 }),
  };
  for (const [k, m] of Object.entries(internal)) if (!m.name) m.name = 'volcano.' + k;

  const animated = {
    tick(dt, t) {
      uniforms.uTime.value = t;
      tex.lava.offset.set(t * 0.012, t * 0.02);
      tex.lavaSlow.offset.set(t * 0.004, -t * 0.006);
      tex.trimGlow.offset.x = t * 0.05;
      tex.bandGlow.offset.x = -t * 0.2;
      tex.chevron.offset.y = -t * 0.9;
      const p = 0.88 + 0.12 * Math.sin(t * 1.3) * Math.sin(t * 0.71 + 1.0);
      trimMat.emissiveIntensity = 1.6 * p;
      materials.wall.emissiveIntensity = 1.1 * p;
      internal.teePad.emissiveIntensity = 1.2 * (0.85 + 0.15 * Math.sin(t * 1.7));
    },
  };

  function dispose() {
    for (const t of Object.values(tex)) t?.dispose();
    for (const m of new Set([...Object.values(materials), ...Object.values(internal)])) m.dispose();
  }

  return { materials, internal, tex, uniforms, animated, dispose };
}
