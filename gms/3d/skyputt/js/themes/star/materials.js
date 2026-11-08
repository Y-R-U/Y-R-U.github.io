// Star Station theme — shared materials (contract materials + internal ones used by skins / props / backdrop).
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
  const trim = T.trimTextures(S(256), 32);
  const band = T.bandTextures(S(128), 64);
  const mag = T.magnetTextures(S(256));
  const tex = {
    grass: T.grassTexture(S(512)),
    fringe: T.fringeTexture(S(256)),
    wall: wall.map, wallGlow: wall.emissive,
    cap: T.capTexture(S(512), S(128)),
    trim: trim.map, trimGlow: trim.emissive,
    rockData: T.rockDataTexture(S(256)),
    regolith: T.regolithTexture(S(256)),
    magnet: mag.map, magnetGlow: mag.emissive,
    glassDeck: T.glassDeckTexture(S(256)),
    grating: T.gratingTexture(S(256)),
    chevron: T.chevronTexture(),
    band: band.map, bandGlow: band.emissive,
    teeMap: tee.map, teeGlow: tee.emissive,
    glow: T.glowTexture(64),
    flare: T.flareTexture(64),
    flag: T.flagTexture(128, 96),
  };
  tex.grass.repeat.set(0.5, 0.5);       // 2 m tile
  for (const k of ['wall', 'wallGlow']) tex[k].repeat.set(4, 4);   // 0.25 m tile
  tex.cap.repeat.set(2, 1);             // 0.5 m along, v across the cap
  for (const k of ['trim', 'trimGlow']) { tex[k].repeat.set(4, 1); tex[k].wrapT = THREE.ClampToEdgeWrapping; }

  const std = (o) => new THREE.MeshStandardMaterial(o);

  // trim: the glowing teal edge strip along every wall; dashes of light run along it
  const trimMat = std({ map: tex.trim, roughness: 0.35, metalness: 0.6, emissive: 0xffffff, emissiveMap: tex.trimGlow, emissiveIntensity: 1.5 });

  // polished glass deck (ice): dark glossy glass, a view-dependent cyan sheen. vViewPosition is
  // length-guarded before dividing.
  const glassDeck = std({ map: tex.glassDeck, roughness: 0.08, metalness: 0.2, emissive: 0x0a2a3a, emissiveIntensity: 0.6 });
  glassDeck.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float gL = length(vViewPosition);
        vec3 gD = gL > 1e-4 ? vViewPosition / gL : vec3(0.0, 0.0, 1.0);
        float gF = clamp(1.0 - abs(dot(gD, normal)), 0.0, 1.0);
        outgoingLight += vec3(0.25, 0.75, 0.9) * gF * gF * 0.35;
      }
      #include <opaque_fragment>`);
  };
  glassDeck.customProgramCacheKey = () => 'star-glassdeck';

  const materials = {
    grass: std({ map: tex.grass, roughness: 0.9, metalness: 0 }),
    fringe: std({ map: tex.fringe, roughness: 0.75, metalness: 0.3 }),
    wall: std({ map: tex.wall, roughness: 0.5, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex.wallGlow, emissiveIntensity: 0.9 }),
    wallTop: std({ map: tex.cap, roughness: 0.4, metalness: 0.55 }),
    trim: trimMat,
    tee: std({ color: 0xc8d0d8, roughness: 0.5, metalness: 0.3 }),
    cupRim: std({ color: 0x8ab0b8, roughness: 0.3, metalness: 0.8, emissive: 0x20d8d0, emissiveIntensity: 0.6 }),
    flag: std({ map: tex.flag, roughness: 0.6, side: THREE.DoubleSide, alphaTest: 0.5, emissive: 0x0a3a3a, emissiveIntensity: 0.6 }),
    sand: std({ map: tex.regolith, roughness: 0.97 }),
    // magnetic deck plates (sticky patches: js/game/holeview.js looks up `sticky` first, then `sand`)
    sticky: std({ map: tex.magnet, roughness: 0.5, metalness: 0.5, emissive: 0xffffff, emissiveMap: tex.magnetGlow, emissiveIntensity: 0.5 }),
    water: new THREE.MeshBasicMaterial({ color: 0x1a3a6a, transparent: true, opacity: 0.6 }),   // unused by the engine
    ice: glassDeck,
    boost: std({ color: 0x1a1a3a, roughness: 0.35, metalness: 0.4, emissive: 0xffffff, emissiveMap: tex.chevron, emissiveIntensity: 1.6 }),
    bridge: std({ map: tex.grating, roughness: 0.55, metalness: 0.6 }),
    rock: std({ map: tex.rockData, color: 0x8a847a, roughness: 0.95, flatShading: true }),
  };
  for (const [k, m] of Object.entries(materials)) if (!m.name) m.name = 'star.' + k;

  // ---- internal materials ----
  // Airlock glass for the tube: faint cyan tint, fresnel rim (length-guarded).
  const glass = std({ color: 0xc0f4ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.12,
    emissive: 0x2a8ab0, emissiveIntensity: 0.2, side: THREE.DoubleSide, depthWrite: false });
  glass.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 vfV = vViewPosition;
      float vfL = length(vfV);
      vec3 vfD = vfL > 1e-4 ? vfV / vfL : vec3(0.0, 0.0, 1.0);
      float vfFr = pow(clamp(1.0 - abs(dot(vfD, normal)), 0.0, 1.0), 2.0);
      diffuseColor.a = mix(diffuseColor.a, 0.6, vfFr);
      outgoingLight += vec3(0.5, 0.95, 1.0) * vfFr * 0.45;
      #include <opaque_fragment>`);
  };
  glass.customProgramCacheKey = () => 'star-glass';

  // Island: hull + asteroid. Vertex colours paint the hull (white / grey / teal, blue >= red) and the
  // asteroid rock (warm grey-brown, red > blue). Up-facing hull reads the deck-plate channel (G), hull sides
  // the panel channel (R), rock the grain channel (B). Glow strips: strongly teal vertex colours are
  // emissive (they pulse slowly). Flat shaded: the rock reads as low-poly facets.
  const vcRock = std({ vertexColors: true, map: tex.rockData, roughness: 0.85, metalness: 0.15, flatShading: true });
  vcRock.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <map_fragment>', `
      vec4 vfTex = texture2D(map, vMapUv);`)
      .replace('#include <emissivemap_fragment>', `
      // (after normal_fragment_begin: \`normal\` exists here, and the lights read diffuseColor later)
      float vfRock = smoothstep(0.0, 0.05, vColor.r - vColor.b);
      vec3 vfUp = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
      float vfTop = smoothstep(0.6, 0.85, dot(normal, vfUp));
      float vfHull = mix(vfTex.r, vfTex.g, vfTop);
      diffuseColor.rgb *= mix(vfHull * 1.1, vfTex.b * 1.35, vfRock);
      float vfGlow = smoothstep(0.9, 1.3, vColor.g + vColor.b - 2.0 * vColor.r);
      totalEmissiveRadiance += vColor.rgb * vfGlow * (0.9 + 0.25 * sin(uTime * 1.3 + vMapUv.x * 0.7));`);
  };
  vcRock.customProgramCacheKey = () => 'star-vcrock';

  // Drifting asteroids (instanced): each instance tumbles and drifts on a slow circle in the vertex
  // shader (phase from the instance position). Flat-shaded grey-brown rock.
  const asteroid = std({ color: 0xa89e90, roughness: 0.95, flatShading: true, emissive: 0x2a2620, emissiveIntensity: 1 });
  asteroid.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
      uniform float uTime;
      mat3 aRot(float a, float b) { float ca = cos(a), sa = sin(a), cb = cos(b), sb = sin(b);
        return mat3(ca, 0.0, -sa, 0.0, 1.0, 0.0, sa, 0.0, ca) * mat3(1.0, 0.0, 0.0, 0.0, cb, sb, 0.0, -sb, cb); }`)
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      float aPh = 0.0;
      #ifdef USE_INSTANCING
        aPh = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.23 + instanceMatrix[3].y * 0.11;
      #endif
      mat3 aR = aRot(uTime * (0.08 + fract(aPh) * 0.12) + aPh, uTime * 0.05 + aPh * 2.0);
      objectNormal = aR * objectNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      transformed = aR * transformed;
      {
        float aS = 1.0;
        #ifdef USE_INSTANCING
          aS = length(instanceMatrix[0].xyz);
        #endif
        float aT = uTime * 0.02 + aPh * 3.0;
        transformed += vec3(sin(aT), sin(aT * 0.7 + 1.3) * 0.35, cos(aT)) * (1.6 / max(aS, 0.05));
      }`);
  };
  asteroid.customProgramCacheKey = () => 'star-asteroid';

  const internal = {
    vc: std({ vertexColors: true, roughness: 0.55, metalness: 0.1 }),
    // hull plating / station parts (white, satin)
    vcPanel: std({ vertexColors: true, roughness: 0.4, metalness: 0.25, flatShading: true }),
    // glossy parts: dish faces, visors
    vcGloss: std({ vertexColors: true, roughness: 0.2, metalness: 0.3 }),
    // brushed metal: trusses, rails, hubs; also solar cells (dark blue, glossy)
    vcMetal: std({ vertexColors: true, roughness: 0.32, metalness: 0.75 }),
    vcRock,
    asteroid,
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
    band: std({ map: tex.band, roughness: 0.45, metalness: 0.3, emissive: 0xffffff, emissiveMap: tex.bandGlow, emissiveIntensity: 1.2, side: THREE.DoubleSide }),
    windowGlow: new THREE.MeshBasicMaterial({ color: 0xffe0a0, toneMapped: false }),
    gemGlow: new THREE.MeshBasicMaterial({ color: 0x9ffcff, toneMapped: false }),
    glass,
    teePad: std({ map: tex.teeMap, roughness: 0.5, metalness: 0.2, emissive: 0xffffff, emissiveMap: tex.teeGlow, emissiveIntensity: 1.0 }),
  };
  for (const [k, m] of Object.entries(internal)) if (!m.name) m.name = 'star.' + k;

  const animated = {
    tick(dt, t) {
      uniforms.uTime.value = t;
      tex.trimGlow.offset.x = -t * 0.35;
      tex.bandGlow.offset.x = -t * 0.3;
      tex.chevron.offset.y = -t * 1.1;
      trimMat.emissiveIntensity = 1.5 * (0.85 + 0.15 * Math.sin(t * 1.2));
      materials.sticky.emissiveIntensity = 0.5 * (0.7 + 0.3 * Math.sin(t * 2.0));
      internal.teePad.emissiveIntensity = 1.0 * (0.8 + 0.2 * Math.sin(t * 1.4));
    },
  };

  function dispose() {
    for (const t of Object.values(tex)) t?.dispose();
    for (const m of new Set([...Object.values(materials), ...Object.values(internal)])) m.dispose();
  }

  return { materials, internal, tex, uniforms, animated, dispose };
}
