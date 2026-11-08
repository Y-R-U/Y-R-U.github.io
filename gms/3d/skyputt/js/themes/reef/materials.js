// Sunken Reef theme — shared materials (contract materials + internal ones used by skins / props / backdrop).
// Caustics: floors, wall caps, the island top and the props get a moving caustic net (two scrolling
// fetches of one texture, min-combined, projected on world XZ, strongest on up-facing surfaces).
// Mobile GPU rule: every custom shader guards its normalize() / divides and clamps pow() bases.
import * as THREE from 'three';
import * as T from './textures.js';

export const CAUSTIC_COLOR = new THREE.Color(0.75, 1.0, 0.95);

/**
 * @param {'low'|'high'} quality
 * @returns {{ materials, internal, tex, uniforms, animated, caustics, dispose }}
 */
export function createMaterials(quality = 'high') {
  const hi = quality !== 'low';
  const S = (n) => (hi ? n : n >> 1);
  const uniforms = { uTime: { value: 0 }, uCaustic: { value: null }, uCauCol: { value: CAUSTIC_COLOR.clone() } };

  const tee = T.teePadTextures(S(512));
  const coral = T.coralWallTextures(S(256));
  const trim = T.trimTextures(S(256), 32);
  const band = T.bandTextures(S(128), 64);
  const tex = {
    grass: T.grassTexture(S(512)),
    fringe: T.fringeTexture(S(256)),
    coral: coral.map, coralGlow: coral.emissive,
    cap: T.capTexture(S(512), S(128)),
    trim: trim.map, trimGlow: trim.emissive,
    rockData: T.rockDataTexture(S(256)),
    sand: T.sandTexture(S(256)),
    seaweed: T.seaweedTexture(S(256)),
    pearl: T.pearlTexture(S(256)),
    deck: T.deckTexture(S(256)),
    caustic: T.causticTexture(hi ? 256 : 128),
    chevron: T.chevronTexture(),
    band: band.map, bandGlow: band.emissive,
    teeMap: tee.map, teeGlow: tee.emissive,
    glow: T.glowTexture(64),
    bubble: T.bubbleTexture(64),
    kelp: T.kelpTexture(32, S(128)),
    flag: T.flagTexture(128, 96),
  };
  uniforms.uCaustic.value = tex.caustic;
  tex.grass.repeat.set(0.5, 0.5);       // 2 m tile
  for (const k of ['coral', 'coralGlow']) tex[k].repeat.set(4, 4);   // 0.25 m tile
  tex.cap.repeat.set(2, 1);             // 0.5 m along, v across the cap
  for (const k of ['trim', 'trimGlow']) { tex[k].repeat.set(4, 1); tex[k].wrapT = THREE.ClampToEdgeWrapping; }

  /**
   * Adds the caustic net to a standard material. k = strength; up = 1 → only up-facing surfaces (floors),
   * 0 → all faces equally. Light added = caustic × surface albedo × k (so a dark surface stays dark).
   */
  function caustics(m, k = 0.6, up = 1, key = '') {
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.uniforms.uTime = uniforms.uTime;
      sh.uniforms.uCaustic = uniforms.uCaustic;
      sh.uniforms.uCauCol = uniforms.uCauCol;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCaW;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 caW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            caW = instanceMatrix * caW;
          #endif
          vCaW = (modelMatrix * caW).xyz;
        }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vCaW;\nuniform float uTime;\nuniform sampler2D uCaustic;\nuniform vec3 uCauCol;')
        .replace('#include <opaque_fragment>', `
        {
          vec2 cq = vCaW.xz + vec2(vCaW.y * 0.35);
          float c1 = texture2D(uCaustic, cq * 0.42 + vec2(uTime * 0.031, uTime * 0.017)).r;
          float c2 = texture2D(uCaustic, cq * 0.57 + vec2(-uTime * 0.022, uTime * 0.027)).r;
          float ca = min(c1, c2);
          ca = ca * ca * 3.2 + ca * 0.25;
          vec3 upV = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
          float facing = mix(1.0, clamp(dot(normal, upV) * 1.4 - 0.2, 0.0, 1.0), ${up.toFixed(2)});
          outgoingLight += diffuseColor.rgb * uCauCol * ca * ${k.toFixed(3)} * facing;
        }
        #include <opaque_fragment>`);
    };
    const prevKey = m.customProgramCacheKey?.bind(m);
    m.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|reef-caustic' + key + k + up;
    return m;
  }

  const std = (o) => new THREE.MeshStandardMaterial(o);

  // trim: verdigris bronze bands with a channel of sea-light that drifts along the wall and pulses
  const trimMat = std({ map: tex.trim, roughness: 0.45, metalness: 0.5, emissive: 0xffffff, emissiveMap: tex.trimGlow, emissiveIntensity: 1.3 });

  // mother-of-pearl: a smooth nacre with an iridescent view-dependent sheen (the hue shifts with the
  // fresnel term). vViewPosition is length-guarded before dividing.
  const pearl = std({ map: tex.pearl, roughness: 0.18, metalness: 0.1, emissive: 0x1a2028, emissiveIntensity: 0.4 });
  pearl.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float pL = length(vViewPosition);
        vec3 pD = pL > 1e-4 ? vViewPosition / pL : vec3(0.0, 0.0, 1.0);
        float pF = clamp(1.0 - abs(dot(pD, normal)), 0.0, 1.0);
        float ph = pF * 5.0 + vMapUv.x * 1.3 + vMapUv.y * 0.9;
        vec3 irid = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + ph));
        outgoingLight += irid * (0.08 + pF * 0.3);
      }
      #include <opaque_fragment>`);
  };
  pearl.customProgramCacheKey = () => 'reef-pearl';

  const materials = {
    grass: caustics(std({ map: tex.grass, roughness: 0.92, metalness: 0 }), 0.32, 1, 'g'),
    fringe: caustics(std({ map: tex.fringe, roughness: 0.95 }), 0.4, 1, 'f'),
    wall: std({ map: tex.coral, roughness: 0.85, emissive: 0xffffff, emissiveMap: tex.coralGlow, emissiveIntensity: 0.7 }),
    wallTop: caustics(std({ map: tex.cap, roughness: 0.8 }), 0.45, 1, 'c'),
    trim: trimMat,
    tee: std({ color: 0xb8a888, roughness: 0.75 }),
    cupRim: std({ color: 0x5aa898, roughness: 0.35, metalness: 0.7, emissive: 0x20c8c0, emissiveIntensity: 0.4 }),
    flag: std({ map: tex.flag, roughness: 0.8, side: THREE.DoubleSide, alphaTest: 0.5, emissive: 0x062a26, emissiveIntensity: 0.5 }),
    sand: caustics(std({ map: tex.sand, roughness: 0.95 }), 0.5, 1, 's'),
    // seaweed mat (sticky patches: js/game/holeview.js looks up `sticky` first, then `sand`)
    sticky: caustics(std({ map: tex.seaweed, roughness: 0.9 }), 0.35, 1, 'w'),
    // open water (the engine has no water patches yet)
    water: new THREE.MeshBasicMaterial({ color: 0x1a7a90, transparent: true, opacity: 0.6 }),
    ice: caustics(pearl, 0.3, 1, 'p'),
    boost: std({ color: 0x163848, roughness: 0.4, metalness: 0.3, emissive: 0xffffff, emissiveMap: tex.chevron, emissiveIntensity: 1.5 }),
    bridge: caustics(std({ map: tex.deck, roughness: 0.85 }), 0.4, 1, 'd'),
    rock: std({ map: tex.rockData, color: 0x7a7266, roughness: 0.9 }),
  };
  for (const [k, m] of Object.entries(materials)) if (!m.name) m.name = 'reef.' + k;

  // ---- internal materials ----
  // Sea glass for the tube: aqua tint, fresnel rim. vViewPosition is length-guarded before dividing.
  const glass = std({ color: 0xa8f0ff, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.14,
    emissive: 0x2a9ab0, emissiveIntensity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  glass.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 vfV = vViewPosition;
      float vfL = length(vfV);
      vec3 vfD = vfL > 1e-4 ? vfV / vfL : vec3(0.0, 0.0, 1.0);
      float vfFr = pow(clamp(1.0 - abs(dot(vfD, normal)), 0.0, 1.0), 2.0);
      diffuseColor.a = mix(diffuseColor.a, 0.66, vfFr);
      outgoingLight += vec3(0.4, 0.9, 1.0) * vfFr * 0.5;
      #include <opaque_fragment>`);
  };
  glass.customProgramCacheKey = () => 'reef-glass';

  // Island rock: vertex colours paint reef rock, the sandy / sea-grass top (green > red, low blue) and
  // coral crust zones (red > green). The data map gives porous rock tone (R, sides), a plain grain (G,
  // the top) and polyp dots (B) that glow faintly cyan / pink on the coral zones, breathing slowly.
  const vcRock = caustics(std({ vertexColors: true, map: tex.rockData, roughness: 0.9 }), 0.45, 1, 'r');
  {
    const prev = vcRock.onBeforeCompile;
    vcRock.onBeforeCompile = (sh, r) => {
      prev(sh, r);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_fragment>', `
        vec4 vfTex = texture2D(map, vMapUv);
        float vfTop = smoothstep(0.0, 0.03, vColor.g - vColor.r);           // sand / grass top: green > red
        float vfCor = smoothstep(0.04, 0.16, vColor.r - vColor.g);          // coral crust: red >> green (linear)
        float vfTone = mix(vfTex.r * 1.35, vfTex.g, vfTop);
        diffuseColor.rgb *= mix(vfTone, 1.0, vfCor * 0.3);`)
        .replace('#include <emissivemap_fragment>', `
        float vfBr = 0.65 + 0.35 * sin(uTime * 0.9 + vMapUv.x * 5.0 + vMapUv.y * 3.0);
        vec3 vfPol = mix(vec3(0.25, 1.0, 0.9), vec3(1.0, 0.45, 0.8), step(0.5, fract(vMapUv.x * 0.37 + vMapUv.y * 0.21)));
        totalEmissiveRadiance += vfPol * vfTex.b * vfCor * vfBr * 0.22;`);
    };
    vcRock.customProgramCacheKey = () => 'reef-vcrock';
  }

  // Glowing anemone / bioluminescent surfaces (vertex colour, unlit, a slow breathing pulse per position)
  const glowVC = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  glowVC.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vfPulse;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 vfW = modelMatrix * vec4(position, 1.0);
      vfPulse = 0.72 + 0.28 * sin(uTime * 1.6 + vfW.x * 2.1 + vfW.z * 1.7);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vfPulse;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= vfPulse;');
  };
  glowVC.customProgramCacheKey = () => 'reef-glow';

  // Kelp (instanced): alpha-tested ribbons that sway in the current; the sway grows with height (uv.y)
  // and its phase comes from the instance position.
  const kelp = std({ map: tex.kelp, roughness: 0.7, alphaTest: 0.5, side: THREE.DoubleSide, emissive: 0x141a06, emissiveIntensity: 0.6 });
  kelp.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        float kh = clamp(uv.y, 0.0, 1.0);
        float kph = 0.0;
        #ifdef USE_INSTANCING
          kph = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.53;
        #endif
        float kw = kh * kh;
        transformed.x += (sin(uTime * 0.9 + kph + kh * 2.6) * 0.32 + sin(uTime * 0.37 + kph * 1.7) * 0.18) * kw;
        transformed.z += cos(uTime * 0.7 + kph * 1.3 + kh * 2.0) * 0.18 * kw;
      }`);
  };
  kelp.customProgramCacheKey = () => 'reef-kelp';

  const internal = {
    coral: materials.wall,
    vc: caustics(std({ vertexColors: true, roughness: 0.85 }), 0.35, 1, 'vc'),
    // weathered stone for the temple / props
    vcStone: caustics(std({ vertexColors: true, roughness: 0.9, flatShading: true }), 0.4, 1, 'st'),
    // shells, pearls, glossy coral
    vcGloss: std({ vertexColors: true, roughness: 0.25, metalness: 0.1 }),
    coralInst: caustics(std({ color: 0xffffff, roughness: 0.75, emissive: 0x1a0a14, emissiveIntensity: 0.4 }), 0.35, 1, 'ci'),
    stoneInst: caustics(std({ color: 0xffffff, roughness: 0.92, flatShading: true }), 0.4, 1, 'si'),
    vcCloth: std({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    // wood (the wreck): vertex coloured, rough
    vcWood: caustics(std({ vertexColors: true, roughness: 0.9 }), 0.35, 1, 'wd'),
    // verdigris bronze / brass fittings
    vcMetal: std({ vertexColors: true, roughness: 0.45, metalness: 0.7 }),
    vcRock,
    glow: glowVC,
    kelp,
    band: std({ map: tex.band, roughness: 0.7, metalness: 0.2, emissive: 0xffffff, emissiveMap: tex.bandGlow, emissiveIntensity: 1.1, side: THREE.DoubleSide }),
    windowGlow: new THREE.MeshBasicMaterial({ color: 0x80f0e0, toneMapped: false }),
    gemGlow: new THREE.MeshBasicMaterial({ color: 0x9ff8ff, toneMapped: false }),
    glass,
    teePad: std({ map: tex.teeMap, roughness: 0.7, emissive: 0xffffff, emissiveMap: tex.teeGlow, emissiveIntensity: 0.9 }),
  };
  for (const [k, m] of Object.entries(internal)) if (!m.name) m.name = 'reef.' + k;

  const animated = {
    tick(dt, t) {
      uniforms.uTime.value = t;
      tex.trimGlow.offset.x = t * 0.04;
      tex.bandGlow.offset.x = -t * 0.15;
      tex.chevron.offset.y = -t * 0.9;
      const p = 0.86 + 0.14 * Math.sin(t * 0.9) * Math.sin(t * 0.53 + 1.0);
      trimMat.emissiveIntensity = 1.3 * p;
      materials.wall.emissiveIntensity = 0.7 * (0.8 + 0.2 * Math.sin(t * 1.1));
      internal.teePad.emissiveIntensity = 0.9 * (0.8 + 0.2 * Math.sin(t * 1.4));
    },
  };

  function dispose() {
    for (const t of Object.values(tex)) t?.dispose();
    for (const m of new Set([...Object.values(materials), ...Object.values(internal)])) m.dispose();
  }

  return { materials, internal, tex, uniforms, animated, caustics, dispose };
}
