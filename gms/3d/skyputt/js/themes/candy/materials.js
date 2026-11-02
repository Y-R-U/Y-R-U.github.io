// Candy Land theme — shared materials (contract materials + internal ones used by skins / props / backdrop).
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
  const tex = {
    grass: T.grassTexture(S(512)),
    fringe: T.fringeTexture(S(256)),
    wafer: T.waferTexture(S(256)),
    cap: T.capTexture(S(512), S(128)),
    drip: T.dripTexture(S(256), 32),
    crumb: T.crumbTexture(S(256)),
    sugar: T.sugarTexture(S(256)),
    hardCandy: T.hardCandyTexture(S(256)),
    cracker: T.crackerTexture(S(256)),
    chocoBump: T.noiseTexture(S(256), 6, 61, 4),
    chevron: T.chevronTexture(),
    stripe: T.candyStripeTexture(S(128)),
    rainbow: T.rainbowTexture(16, 128),
    swirl: T.swirlTexture(S(256)),
    teeMap: tee.map, teeGlow: tee.emissive,
    glow: T.glowTexture(64),
    sparkle: T.sparkleTexture(64),
    flag: T.flagTexture(128, 96),
  };
  tex.grass.repeat.set(0.5, 0.5);       // 2 m tile
  tex.wafer.repeat.set(4, 4);           // 0.25 m tile
  tex.cap.repeat.set(2, 1);             // 0.5 m along, v across the cap
  tex.drip.repeat.set(4, 1);            // 0.25 m along
  tex.drip.wrapT = THREE.ClampToEdgeWrapping;

  const std = (o) => new THREE.MeshStandardMaterial(o);

  const materials = {
    grass: std({ map: tex.grass, roughness: 0.78, metalness: 0 }),
    fringe: std({ map: tex.fringe, roughness: 0.85 }),
    wall: std({ map: tex.wafer, roughness: 0.72, metalness: 0.0 }),
    wallTop: std({ map: tex.cap, roughness: 0.38, emissive: 0x302028, emissiveIntensity: 0.25 }),
    // icing drips over the top of both wall faces (alpha cut-out so the wafer shows between drips)
    trim: std({ map: tex.drip, roughness: 0.35, alphaTest: 0.5, emissive: 0x2a2026, emissiveIntensity: 0.4 }),
    tee: std({ color: 0xff7ab4, roughness: 0.45, metalness: 0.0 }),
    cupRim: std({ color: 0xffffff, roughness: 0.25, metalness: 0.1, emissive: 0xff7ab4, emissiveIntensity: 0.35 }),
    flag: std({ map: tex.flag, roughness: 0.7, side: THREE.DoubleSide, emissive: 0x401026, emissiveIntensity: 0.4 }),
    sand: std({ map: tex.sugar, roughness: 0.75 }),
    // chocolate (the engine has no water yet; set pieces use the same look)
    water: std({ color: 0x6a3a22, roughness: 0.18, metalness: 0.05, bumpMap: tex.chocoBump, bumpScale: 1.2 }),
    ice: std({ map: tex.hardCandy, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.93, emissive: 0x1a4a8a, emissiveIntensity: 0.3 }),
    boost: std({ color: 0x5a1440, roughness: 0.3, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex.chevron, emissiveIntensity: 1.8 }),
    bridge: std({ map: tex.cracker, roughness: 0.85 }),
    rock: std({ map: tex.crumb, color: 0xf0c27a, roughness: 0.9 }),
  };
  for (const [k, m] of Object.entries(materials)) if (!m.name) m.name = 'candy.' + k;

  // ---- internal materials ----
  // Hard-candy glass for the tube: pink, fresnel rim. vViewPosition is length-guarded before dividing.
  const glass = std({ color: 0xffc4e2, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.18,
    emissive: 0xff7ab4, emissiveIntensity: 0.22, side: THREE.DoubleSide, depthWrite: false });
  glass.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      vec3 cdV = vViewPosition;
      float cdL = length(cdV);
      vec3 cdD = cdL > 1e-4 ? cdV / cdL : vec3(0.0, 0.0, 1.0);
      float cdFr = pow(clamp(1.0 - abs(dot(cdD, normal)), 0.0, 1.0), 2.0);
      diffuseColor.a = mix(diffuseColor.a, 0.78, cdFr);
      outgoingLight += vec3(1.0, 0.78, 0.9) * cdFr * 0.7;
      #include <opaque_fragment>`);
  };
  glass.customProgramCacheKey = () => 'candy-glass';

  // Island cake: vertex colours paint the layers (frosting top, icing lip, sponge, jam, cream, chocolate);
  // the crumb map adds pores to the sponge only. The frosting top gets tiny glinting sugar sparkles.
  // Every frosting colour has linear blue > ~0.6, every cake / jam / chocolate colour < ~0.35.
  const vcRock = std({ vertexColors: true, map: tex.crumb, roughness: 0.82 });
  vcRock.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <map_fragment>', `
      vec4 cdTex = texture2D(map, vMapUv);
      float cdIce = smoothstep(0.42, 0.58, vColor.b);   // frosting / icing / cream have a high blue (linear) component
      diffuseColor.rgb *= mix(cdTex.rgb, vec3(1.0), cdIce);`)
      .replace('#include <emissivemap_fragment>', `
      // rainbow sprinkles on the upward-facing frosting (world normal from the view-space normal)
      vec3 cdN = inverseTransformDirection(normal, viewMatrix);
      vec2 cdSq = vMapUv * 12.0;
      vec2 cdSc = floor(cdSq);
      float cdH = fract(sin(dot(cdSc, vec2(41.3, 289.1))) * 43758.5453);
      float cdAng = cdH * 31.4;
      vec2 cdP = fract(cdSq) - 0.5;
      cdP = vec2(cdP.x * cos(cdAng) - cdP.y * sin(cdAng), cdP.x * sin(cdAng) + cdP.y * cos(cdAng));
      float cdDash = 1.0 - smoothstep(0.07, 0.09, length(vec2(max(abs(cdP.x) - 0.18, 0.0), cdP.y)));
      float cdK = floor(fract(cdH * 7.13) * 5.0);
      vec3 cdSpr = cdK < 1.0 ? vec3(1.0, 0.95, 0.35) : cdK < 2.0 ? vec3(0.3, 0.75, 1.0) : cdK < 3.0 ? vec3(0.45, 0.9, 0.5) : cdK < 4.0 ? vec3(0.75, 0.55, 1.0) : vec3(1.0, 1.0, 1.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, cdSpr, cdDash * step(0.55, cdH) * cdIce * smoothstep(0.75, 0.9, cdN.y));
      vec2 cdCell = floor(vMapUv * 70.0);
      vec2 cdF = fract(vMapUv * 70.0) - 0.5;
      float cdG = fract(sin(dot(cdCell, vec2(127.1, 311.7))) * 43758.5453);
      float cdTw = clamp(sin(uTime * 2.2 + cdG * 60.0), 0.0, 1.0) * (1.0 - smoothstep(0.05, 0.18, length(cdF)));
      totalEmissiveRadiance += vec3(1.0, 0.95, 1.0) * step(0.975, cdG) * cdTw * cdIce * 0.9;`);
  };
  vcRock.customProgramCacheKey = () => 'candy-vcrock';

  // Lollipop swirl: the map's R channel picks the vertex colour (arm) or white (gap).
  const swirl = std({ vertexColors: true, map: tex.swirl, roughness: 0.22, metalness: 0.0 });
  swirl.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <map_fragment>', `
      float cdArm = texture2D(map, vMapUv).r;`)
      .replace('#include <color_fragment>', `
      diffuseColor.rgb *= mix(vec3(1.0, 0.98, 0.99), vColor.rgb, cdArm);`);
  };
  swirl.customProgramCacheKey = () => 'candy-swirl';

  const internal = {
    wafer: materials.wall,
    vc: std({ vertexColors: true, roughness: 0.75 }),
    // frosting / icing / cream: soft satin
    vcFrost: std({ vertexColors: true, roughness: 0.5, emissive: 0x281820, emissiveIntensity: 0.25 }),
    // hard candy, gumdrops with gloss, chocolate shells
    vcGloss: std({ vertexColors: true, roughness: 0.22, metalness: 0.05 }),
    // sugar-coated (gumdrops): rough, slightly bright
    vcSugar: std({ vertexColors: true, roughness: 0.95, emissive: 0x1a1018, emissiveIntensity: 0.3 }),
    // instanced gumdrops (colour comes from instanceColor only)
    sugarInst: std({ color: 0xffffff, roughness: 0.95, emissive: 0x1a1018, emissiveIntensity: 0.3 }),
    vcCloth: std({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }),
    vcMetal: std({ vertexColors: true, roughness: 0.3, metalness: 0.75 }),
    vcRock,
    candy: std({ map: tex.stripe, roughness: 0.28 }),
    rainbow: std({ map: tex.rainbow, roughness: 0.6, side: THREE.DoubleSide }),
    swirl,
    cracker: materials.bridge,
    windowGlow: new THREE.MeshBasicMaterial({ color: 0xfff0a8, toneMapped: false }),
    cherryGlow: new THREE.MeshBasicMaterial({ color: 0xff4a7a, toneMapped: false }),
    glass,
    teePad: std({ map: tex.teeMap, roughness: 0.5, metalness: 0.0, emissive: 0xffffff, emissiveMap: tex.teeGlow, emissiveIntensity: 0.8 }),
  };
  for (const [k, m] of Object.entries(internal)) if (!m.name) m.name = 'candy.' + k;

  const animated = {
    tick(dt, t) {
      uniforms.uTime.value = t;
      tex.chocoBump.offset.set(t * 0.015, t * 0.03);
      tex.chevron.offset.y = -t * 0.9;
      internal.teePad.emissiveIntensity = 0.8 * (0.85 + 0.15 * Math.sin(t * 1.7));
    },
  };

  function dispose() {
    for (const t of Object.values(tex)) t.dispose();
    for (const m of new Set([...Object.values(materials), ...Object.values(internal)])) m.dispose();
  }

  return { materials, internal, tex, uniforms, animated, dispose };
}
