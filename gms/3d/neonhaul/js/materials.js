// The three onBeforeCompile patches and the materials that carry them.
//
//   1. patchWindows — §3.4's per-instance tiled window emissive (the atlas-wrap case)
//   2. patchFog     — §4.2's height fog, in §4.2.1's three terminations
//   3. patchGlass   — a grazing-angle sheen so dark glass reads as glass and not as paint
//
// Every one of them goes through `patch()` (§2.3): String.replace on a chunk name that has been
// renamed is a silent no-op, and a silently missing fog patch is a city with no smog band that
// nobody notices for two phases.

import * as THREE from 'three';

// §2.3, verbatim. main.js tags '[neonhaul]' warnings into __state.errors, so a miss fails the
// phase in budget.mjs rather than shipping.
export function patch(src, find, replace, what) {
  if (src.indexOf(find) === -1) { console.warn('[neonhaul] shader patch MISSED:', what, '→', find); return src; }
  return src.replace(find, replace);
}

// Shared uniform objects. `Object.assign(shader.uniforms, …)` installs the same object in every
// program, so sky.js writes one value and the whole city moves.
export const U = {
  uTime: { value: 0 },
  uNeon: { value: 1 },                 // §4.1's per-variant neon multiplier
  uCell: { value: 0.234375 },          // atlas.userData.cell — the SAMPLED cell width
  uGrid: { value: new THREE.Vector2(32, 32) },   // windows per cell; atlas.js owns the numbers
  uSmogTop: { value: 90 },             // §4.2 defaults
  uClearY: { value: 260 },
  uSmogMul: { value: 2.2 },
  uClearMul: { value: 1.0 },
  uGlass: { value: 1.0 },
  // §3.2.2's cross-fade. render_city.js writes uCamXZ once a frame; uR0 is Q.ringNearRadius.
  uCamXZ: { value: new THREE.Vector2(0, 0) },
  uR0: { value: 512 },
  uFadeHard: { value: 0 },
  uFadeNoise: { value: null },
  uFadeNoiseScale: { value: new THREE.Vector2(1 / 64, 1 / 64) },
  // The signage half of §3.2.2's control, and like uFadeHard it is the GATE's, never a runtime
  // option: it collapses §3.2.2 part 2's ramp to a hard cut-off at R0 so tools/gates_p3a.mjs can
  // measure what the ramp is actually buying. A screenshot cannot tell you that.
  uSignHard: { value: 0 },
  // DECISIONS decision 11 — the altitude gate. `uRayMean` ramps 0 → 1 over config.AERIAL's
  // y0 → y1 and swaps the fog's height term from the fragment's own height to the mean height of
  // the camera→fragment segment. Zero below y0, so the street pays one mix() and nothing else.
  uCamY: { value: 60 },
  uRayMean: { value: 0 },
  // ── P11 (ART_PASS) ───────────────────────────────────────────────────────
  // uP11 is a MASTER SWITCH, 1 or 0, and it exists so a gate can measure the pass against itself
  // rather than against a screenshot from yesterday. Every term below is multiplied by it.
  uP11: { value: 1 },
  // §2 — "emissives light nothing" (six of six round-6 critics). The wall between the panes
  // catches the light of the panes; the lower floors catch the street.
  uSpill: { value: 0.030 },
  uStreetCol: { value: new THREE.Color(0xff9440).convertSRGBToLinear() },
  uStreetK: { value: new THREE.Vector2(0.17, 1 / 34) },   // (intensity, 1/falloff-height in m)
  // §3 — close-up detail per PIXEL. Bay width in window columns, and how hard the panel rules cut.
  uBay: { value: new THREE.Vector3(3.0, 0.42, 0.030) },   // (columns per bay, glass-bay fraction, floor-line strength)
  // §4 — the road. `uRoad` is (lot pitch m, road width m, paint brightness, glow intensity) and
  // the first two are §3.1's LOT and ROAD, so the markings land on the streets the city generator
  // actually left between its lots rather than on a texture's own phase.
  uRoad: { value: new THREE.Vector4(51.2, 13.2, 1.0, 0.055) },
  uRoadCol: { value: new THREE.Color(0xffb066).convertSRGBToLinear() },
  // §4 again — the water film's missing view-angle term. See patchFilmFresnel.
  uFilmFres: { value: new THREE.Vector2(2.4, 0.12) },     // (exponent, floor at normal incidence)
  // ── S2-H — street-level shopfronts (js/shops.js) ─────────────────────────
  // (master, interior range near m, interior range far m, venetian half-band in sin(elevation)).
  // The two ranges and the half-band ARE the venetian blind: outside either, the glass is a flat
  // lit face and the interior is never evaluated.
  uShop: { value: new THREE.Vector4(1, 58, 100, 0.20) },
  // The gate's override, and like uFadeHard/uSignHard it is never a runtime option: -1 is the
  // real angle/distance answer, 0 forces every blind SHUT and 1 forces every blind OPEN, so a
  // gate can measure what the gate is actually buying instead of hunting for a lucky camera.
  uShopForce: { value: -1 },
  // ── S2-N — road tunnel portals (js/tunnels.js) ───────────────────────────
  // (master, unused, unused, unused). The gate's override for the doors is uDoorForce: -1 is the
  // live answer the vehicles drive, 0 forces every leaf SHUT and 1 forces every leaf OPEN. Same
  // discipline as uShopForce, and for the same reason — a gate must not have to hunt for a lucky
  // moment to photograph a state.
  uTunnel: { value: new THREE.Vector4(1, 0, 0, 0) },
  uDoorForce: { value: -1 },
};

// onBeforeCompile is a single slot. Chaining lets a material take two patches without either
// knowing about the other, and the cache key keeps three from handing two differently-patched
// materials of the same type the same compiled program — which it will, silently, because
// getProgramCacheKey knows nothing about our edits.
function addPatch(mat, tag, fn) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => { prev?.call(mat, shader, renderer); fn(shader, renderer); };
  mat.userData.patches = (mat.userData.patches || []).concat(tag);
  const key = mat.type + '|' + mat.userData.patches.join(',');
  mat.customProgramCacheKey = () => key;
  mat.needsUpdate = true;
  return mat;
}

// ── 1. windows ─────────────────────────────────────────────────────────────
//
// The whole point of §3.4: `uv * iUvScale + iUvOffset` runs straight off the cell. A 400 m tower
// is 111 window rows, iUvScale.y = 3.47, and a UV that reaches 3.47 crosses the entire 4x4 atlas
// three and a half times. So the wrap is done per fragment with `fract`, and the mip gradients
// are taken from the CONTINUOUS coordinate — `fract` alone puts a derivative discontinuity at
// every seam and the hardware answers it with the 1x1 mip, i.e. a black line.

// iUvScale is a vec3 (W, H, D), not a vec2, and `aFace` picks which of x/z a wall uses. §3.10 #1
// is that the window pitch is 3.6 m per row and 3.2 m per column on EVERY face of EVERY building,
// and a 120 x 80 m mass scales its two wall orientations differently — one column scale cannot
// serve both. aFace: 0 = wall along world X, 1 = wall along world Z, 2 = roof or floor.
// A geometry with no aFace attribute reads 0, which is exactly the old vec2 behaviour.
const WINDOW_VERT_DECL = /* glsl */`
attribute vec2 iUvOffset;
attribute vec3 iUvScale;
attribute vec3 iEmissive;
attribute vec3 iEmissive2;
attribute vec4 iZone;
attribute float iSeed;
attribute float aFace;
varying highp vec2 vTileUv;   // = uv * iUvScale, unbounded; mediump visibly quantises at ~6
varying vec2 vCellUv;
varying vec3 vEmissive;
varying vec3 vEmissive2;
varying vec4 vZone;
varying float vSeed;
varying float vRoof;
varying float vKey;
`;

const WINDOW_FRAG_DECL = /* glsl */`
varying highp vec2 vTileUv;
varying vec2 vCellUv;
varying vec3 vEmissive;
varying vec3 vEmissive2;
varying vec4 vZone;
varying float vSeed;
varying float vRoof;
varying float vKey;
uniform float uTime;
uniform float uNeon;
uniform float uCell;
uniform vec2 uGrid;      // windows per atlas cell — COLS_PER_CELL x ROWS_PER_CELL (§3.4)
uniform float uP11;
uniform float uSpill;
uniform vec3 uStreetCol;
uniform vec2 uStreetK;
uniform vec3 uBay;
`;

// texture2DGradEXT, NOT textureGrad: three compiles GLSL ES 1.00 and prepends
// `#define texture2DGradEXT textureGrad` on WebGL2 (verified, three.module.js:20237). The
// #ifdef is the same guard three's own cube_uv_reflection_fragment uses.
const WINDOW_FRAG_BODY = /* glsl */`
#ifdef USE_EMISSIVEMAP
  vec2 tiled = fract( vTileUv );
  vec2 auv   = vCellUv + tiled * uCell;
  vec2 gdx   = dFdx( vTileUv ) * uCell;
  vec2 gdy   = dFdy( vTileUv ) * uCell;
  #ifdef texture2DGradEXT
    vec3 win = texture2DGradEXT( emissiveMap, auv, gdx, gdy ).rgb;
  #else
    vec3 win = texture2D( emissiveMap, auv ).rgb;
  #endif
  // P3b. §3.4 tiles ONE atlas cell up a 400 m face — a 111-row tower repeats the same 32-row
  // pattern three and a half times — and every blind critic round named that repeat, unprompted
  // and independently, in almost the same words: "reads as a tiling texture, not individual
  // glazed openings". §3.10 #1 makes the PITCH untouchable, so the repeat cannot be hidden by
  // scaling; what CAN vary is the light behind the glass.
  //
  // The hash is PER WINDOW, not per repeat of the cell: vTileUv * uGrid is the window's own index
  // on this facade (uGrid is COLS_PER_CELL x ROWS_PER_CELL), so it changes at every mullion and
  // not every 115 m. Per-repeat variation was tried first and was not enough — within one repeat
  // every pane still carried the same value, which is what the grid actually reads as.
  // Four lines, no texture, no draw call. The window grid stays a ruler; the building stops
  // being wallpaper.
  vec2 wcell = floor( vTileUv * uGrid );
  float rh = fract( sin( dot( wcell, vec2( 12.9898, 78.233 ) ) + vSeed * 3.17 ) * 43758.5453 );
  float rh2 = fract( rh * 197.31 );
  // 8 % go dark and the rest spread over 0.45-1.35: an office block at 2 a.m. is not uniformly
  // lit, and the dark panes are what stop the grid reading as a printed sheet.
  // P11 raised the dark fraction from 8 % to 26 %. Opened side by side, 746850_01 and _03 light
  // roughly a QUARTER of their panes and leave large unlit expanses between the clusters; at 8 %
  // dark the grid is 92 % full, which is what every critic round called "a tiling decal" — a
  // fuller grid reads as printed wallpaper however much its values vary.
  win *= step( 0.26, rh ) * ( 0.45 + 0.90 * rh2 );
  win *= vec3( 1.0 + 0.22 * ( rh - 0.5 ), 1.0, 1.0 - 0.26 * ( rh - 0.5 ) );
  float flick = 1.0 - 0.10 * step( 0.985, fract( uTime * 0.7 + vSeed * 91.7 ) );

  // ── P11 §1 — vertical colour zones with HARD boundaries ──────────────────
  // vWorldPosition comes from patchFog, which every shell material also carries. Buildings are
  // placed with their base at y = 0, so world Y IS height up the facade, and the boundaries in
  // vZone were quantised to §3.4's 3.6 m floor pitch when they were authored — a colour change
  // lands ON a floor line, which is what makes it read as a building and not as a gradient.
  //
  //   vZone.x  split  — below it the lower zone's colour, above it the upper zone's
  //   vZone.y/z       — an unlit band of 2-6 floors (plant rooms). y == z means no band
  //   vZone.w  crown  — unlit above this. >= height means no dark crown
  //
  // Four separable reads up one facade, from seven floats and three steps. 746850_03's towers
  // do exactly this and ours did none of it.
  float wy   = vWorldPosition.y;
  vec3  tnt  = mix( vEmissive, vEmissive2, step( vZone.x, wy ) );
  float band = 1.0 - step( vZone.y, wy ) * ( 1.0 - step( vZone.z, wy ) );
  float lit  = mix( 1.0, band * ( 1.0 - step( vZone.w, wy ) ), uP11 );
  tnt = mix( vEmissive, tnt, uP11 );
  win *= lit;

  // ── P11 §2 — the emissives light something ───────────────────────────────
  // The complaint every round-6 critic led with was "every light source in this image is a
  // sticker": a lit sign or a lit window changed nothing about the surface it was bolted to.
  // Two per-pixel terms, no lights, no shadow map, no draw calls:
  //
  //   spill  — the wall BETWEEN the panes carries the panes' colour at low intensity, so a
  //            building's colour reads across its whole mass instead of in 30 % of its pixels,
  //            and a lit tower is lighter than an unlit one at the silhouette level.
  //   street — the city below. Every plate has a warm wash over the lower floors dying away into
  //            darkness by mid-height; we had one flat blue ambient from pavement to roof, which
  //            is the exact sentence P3b's critics wrote.
  float pane   = max( win.r, max( win.g, win.b ) );
  vec2  pf     = fract( vTileUv * uGrid );
  float faceK  = mix( 1.0, vKey, uP11 * ( 1.0 - vRoof ) );
  vec3  spill  = tnt * ( uSpill * uP11 ) * lit * ( 1.0 - pane ) * faceK;
  vec3  street = uStreetCol * ( uStreetK.x * uP11 * exp( -max( wy, 0.0 ) * uStreetK.y ) ) * faceK;

  // P11 round 7 — THE FLOOR LINE. Three critics read the window field as "rotated squares in no
  // rows and no columns", "randomly scattered, ignoring floor lines", "procedurally random rather
  // than architectural". They are describing a real thing: with 26 % of panes dark and a 50 %
  // inset there is no CONTINUOUS element left on the facade, so a regular grid seen at a steep
  // oblique angle has nothing to tell the eye it is a grid, and every pane reads as an
  // independently-rotated lozenge. The panel rule P11 first added darkens the albedo — on a
  // 0x0a0c11 wall that is invisible by construction, which is why it did not answer this.
  //
  // A spandrel band is LIGHTER than the wall, not darker: it is the strip of façade between one
  // storey's glazing and the next, and it catches both the street below and the windows above it.
  // One continuous horizontal line per floor, at the same 3.6 m pitch §3.10 #1 makes the game's
  // ruler — so it reinforces the scale cue instead of competing with it.
  float floorLine = 1.0 - smoothstep( 0.0, 0.17, min( pf.y, 1.0 - pf.y ) );
  vec3  spandrel  = mix( uStreetCol, tnt, 0.6 ) * ( uBay.z * uP11 * lit * floorLine * ( 1.0 - vRoof ) * faceK );

  // ── P11 §3 — close-up detail, per pixel, no geometry ─────────────────────
  // ART_PASS: "prefer techniques that cost per-pixel rather than per-object … do NOT add geometry
  // per building". The facade is now bays of curtain glass and bays of solid panel on the same
  // 3.2 m column grid the windows use — so it reinforces §3.10 #1's ruler instead of competing
  // with it — plus a floor/mullion rule and grime that gathers low. This is the answer to "one
  // material everywhere": roughness and metalness now vary across a single facade.
  float notRoof = 1.0 - vRoof;
  float bay     = floor( vTileUv.x * uGrid.x / uBay.x );
  float bhash   = fract( sin( bay * 37.719 + vSeed * 5.31 ) * 4517.19 );
  float glassy  = step( uBay.y, bhash ) * notRoof * uP11;
  roughnessFactor = mix( roughnessFactor, mix( 0.55, 0.13, glassy ), notRoof * uP11 );
  metalnessFactor = mix( metalnessFactor, mix( 0.58, 0.94, glassy ), notRoof * uP11 );
  float rule  = min( smoothstep( 0.0, 0.11, pf.y ), smoothstep( 0.0, 0.10, pf.x ) );
  float grime = 1.0 - 0.30 * exp( -max( wy, 0.0 ) * 0.011 );
  diffuseColor.rgb *= mix( 1.0, mix( 0.40, 1.0, rule ) * grime * mix( 1.10, 0.90, glassy ), notRoof * uP11 ) * faceK;

  // A roof is a plant deck, not a wall of windows. Flying over a city whose rooftops are lit
  // window grids is the single loudest tell that the buildings are texture-mapped boxes.
  totalEmissiveRadiance = mix( tnt * win * uNeon * flick + ( spill + spandrel ) * uNeon, tnt * 0.014 * uNeon, vRoof )
                        + street * uNeon;
#endif
`;

export function patchWindows(mat, atlas) {
  U.uCell.value = atlas.userData.cell;
  if (atlas.userData.cols) U.uGrid.value.set(atlas.userData.cols, atlas.userData.rows);
  mat.extensions = Object.assign({ derivatives: true }, mat.extensions);
  return addPatch(mat, 'win', shader => {
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uNeon = U.uNeon;
    shader.uniforms.uCell = U.uCell;
    shader.uniforms.uGrid = U.uGrid;
    shader.uniforms.uP11 = U.uP11;
    shader.uniforms.uSpill = U.uSpill;
    shader.uniforms.uStreetCol = U.uStreetCol;
    shader.uniforms.uStreetK = U.uStreetK;
    shader.uniforms.uBay = U.uBay;
    shader.vertexShader = patch(shader.vertexShader, '#include <common>',
      '#include <common>' + WINDOW_VERT_DECL, 'windows/vert-decl');
    shader.vertexShader = patch(shader.vertexShader, '#include <begin_vertex>',
      '#include <begin_vertex>\n'
      + '  float fZ = step( 0.5, aFace ) * ( 1.0 - step( 1.5, aFace ) );\n'
      + '  vRoof = step( 1.5, aFace );\n'
      // P11 round 7. THREE of six blind critics wrote the same sentence: "the two visible faces of
      // the same box read at the same luminance, so the prism has no form — it reads as one flat
      // card with a window texture wrapped over it", and all three asked for 15-30 % of separation.
      // §4.1's night variants have no directional light at all and a HemisphereLight gives two
      // vertical faces of one mass identical radiance by construction — P3b already found this and
      // its dirI 0.10/0.24 fix moves 0.003 of luminance, which is a tenth of what is being asked
      // for. `aFace` cannot answer it either: +X and -X share one code.
      //
      // So a fake key direction, per FACE, from the object normal. The prototypes are axis-aligned
      // boxes placed by a translate-scale matrix with no rotation, so the object normal IS the
      // world normal and this needs no matrix. It is not a light — it never brightens anything,
      // it only decides how much of what is already there each face keeps.
      + '  vKey = 0.66 + 0.34 * dot( objectNormal, normalize( vec3( 0.62, 0.30, -0.72 ) ) );\n'
      + '  vTileUv = vec2( uv.x * mix( iUvScale.x, iUvScale.z, fZ ), uv.y * iUvScale.y );\n'
      + '  vCellUv = iUvOffset;\n'
      + '  vEmissive = iEmissive;\n  vEmissive2 = iEmissive2;\n  vZone = iZone;\n'
      + '  vSeed = iSeed;', 'windows/vert-body');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>' + WINDOW_FRAG_DECL, 'windows/frag-decl');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <emissivemap_fragment>',
      WINDOW_FRAG_BODY, 'windows/frag-body');
  });
}

// ── 2. fog ─────────────────────────────────────────────────────────────────
//
// §4.2. Scales the fog DISTANCE, never the fog FACTOR: the factor is already a saturating
// smoothstep, so multiplying it by k caps opacity at k and above uClearY the fog would never
// reach 1.0 at any range whatsoever.
//
// The distances themselves come from config.FOG (§3.2.1) — sky.js writes scene.fog.near/far and
// budget.mjs re-derives C1 from the same table with no rendering. Only the COLOURS moved (§4.1.1).

// worldpos_vertex already applies instanceMatrix, so this is instancing-correct for free. The
// #else branch exists for materials with no envMap, where three does not declare worldPosition.
const FOG_VERT_BODY = /* glsl */`
#include <worldpos_vertex>
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
  vWorldPosition = worldPosition.xyz;
#else
  #ifdef USE_INSTANCING
    vWorldPosition = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
  #else
    vWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  #endif
#endif
`;

// §4.2.1 — three terminations. Applying the stock `mix` to an additive material adds fogColor on
// top of the framebuffer, so distant neon gets BRIGHTER and greyer as it recedes.
const FOG_TERM = {
  opaque: 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );',
  additive: 'gl_FragColor.rgb *= ( 1.0 - fogFactor );',
  alpha: 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );\n  gl_FragColor.a *= ( 1.0 - fogFactor );',
};

const fogBody = mode => /* glsl */`
#ifdef USE_FOG
  // decision 11's altitude gate: at uRayMean = 0 this is exactly vWorldPosition.y, which is the
  // ground-level model P1a shipped and every P1a/P2 gate measured. At 1 it is the mean height of
  // the camera→fragment segment, which is what makes looking DOWN through the smog band from
  // altitude cost only the part of the ray that is actually in the band.
  float fy = mix( vWorldPosition.y, 0.5 * ( vWorldPosition.y + uCamY ), uRayMean );
  float sm = 1.0 - smoothstep( uSmogTop, uClearY, fy );   // 1 in the murk, 0 in clean air
  float k  = mix( uClearMul, uSmogMul, sm );
  float V  = fogNear + ( fogFar - fogNear ) / k;          // effective visibility, §3.2.1
  float fogFactor = smoothstep( fogNear, V, vFogDepth );
  ${FOG_TERM[mode]}
#endif
`;

export function patchFog(mat, mode = 'opaque') {
  if (!FOG_TERM[mode]) { console.warn('[neonhaul] patchFog: unknown mode', mode); mode = 'opaque'; }
  mat.fog = true;
  return addPatch(mat, 'fog:' + mode, shader => {
    shader.uniforms.uSmogTop = U.uSmogTop;
    shader.uniforms.uClearY = U.uClearY;
    shader.uniforms.uSmogMul = U.uSmogMul;
    shader.uniforms.uClearMul = U.uClearMul;
    shader.uniforms.uCamY = U.uCamY;
    shader.uniforms.uRayMean = U.uRayMean;
    shader.vertexShader = patch(shader.vertexShader, '#include <common>',
      '#include <common>\nvarying vec3 vWorldPosition;', 'fog/vert-decl');
    shader.vertexShader = patch(shader.vertexShader, '#include <worldpos_vertex>',
      FOG_VERT_BODY, 'fog/vert-body');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying vec3 vWorldPosition;\n'
      + 'uniform float uSmogTop;\nuniform float uClearY;\nuniform float uSmogMul;\nuniform float uClearMul;\n'
      + 'uniform float uCamY;\nuniform float uRayMean;',
      'fog/frag-decl');
    // The whole include, not an injection: the chunk declares fogFactor and consumes it in the
    // same three lines, so there is nowhere to inject between them.
    shader.fragmentShader = patch(shader.fragmentShader, '#include <fog_fragment>',
      fogBody(mode), 'fog/frag-body');
  });
}

// ── 3. glass ───────────────────────────────────────────────────────────────
//
// The brief's "reflections matter more than geometry" on a material with almost no albedo: at a
// grazing angle a dark glass facade picks up the sky and the city and stops being a flat black
// card. geometryViewDir (not viewDir — r160 renamed it) and geometryNormal are both in scope by
// opaque_fragment, declared up in lights_fragment_begin.

const GLASS_BODY = /* glsl */`
  float gFres = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), 4.0 );
  outgoingLight += uGlassTint * ( gFres * uGlass );
#include <opaque_fragment>
`;

export function patchGlass(mat, tint = 0x2a3a4c, amount = 1.0) {
  const uTint = { value: new THREE.Color(tint).convertSRGBToLinear().multiplyScalar(0.14) };
  mat.userData.uGlassTint = uTint;
  U.uGlass.value = amount;
  return addPatch(mat, 'glass', shader => {
    shader.uniforms.uGlass = U.uGlass;
    shader.uniforms.uGlassTint = uTint;
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>\nuniform float uGlass;\nuniform vec3 uGlassTint;', 'glass/frag-decl');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <opaque_fragment>',
      GLASS_BODY, 'glass/frag-body');
  });
}

// ── 4. the LOD0 → LOD1 dither cross-fade (§3.2.2) ──────────────────────────
//
// Fog cannot hide the swap: §3.2.1's C1 deliberately leaves 44 % residual visibility at the LOD0
// boundary in the night variants, because buying the rest with fog would break C2 and kill the
// fog_city shot. The revision therefore set `uClearMul = 1.0` and made this cross-fade MANDATORY.
// So the swap is not hidden — it is made invisible, with two `discard`s and zero new draw calls.
//
// `a` is a per-CHUNK quantity, not per-fragment: every instance carries its chunk's centre in
// `iChunk`, the vertex shader measures that centre against the camera, and the whole chunk fades
// as one unit over the outer 15 % of the band (77 m, crossed in 1.24 s at 62 m/s). That costs one
// vec2 attribute and one uniform, and — crucially — nothing is uploaded per frame.
//
// The two tests are COMPLEMENTARY, which is the part that is easy to get wrong: LOD0 keeps
// `noise < 1 - a` and LOD1 keeps `noise >= 1 - a`. Writing both as `noise > a` keeps the same
// pixels in both fields and doubles the city instead of cross-fading it.

const FADE_VERT_DECL = /* glsl */`
attribute vec2 iChunk;
uniform vec2 uCamXZ;
uniform float uR0;
uniform float uFadeHard;
varying float vFade;
`;

const FADE_VERT_BODY = /* glsl */`
#include <begin_vertex>
  {
    float d = distance( uCamXZ, iChunk );
    float a = clamp( ( d - 0.85 * uR0 ) / ( 0.15 * uR0 ), 0.0, 1.0 );
    // uFadeHard is the GATE's control, not a runtime option: it collapses the fade to a hard
    // swap so tools/gates_p2.mjs can measure what the cross-fade is actually buying.
    vFade = mix( a, step( 0.5, a ), uFadeHard );
  }
`;

const FADE_FRAG_DECL = /* glsl */`
varying float vFade;
uniform sampler2D uFadeNoise;
uniform vec2 uFadeNoiseScale;
`;

const fadeBody = lod0 => /* glsl */`
#include <clipping_planes_fragment>
  {
    float nz = texture2D( uFadeNoise, gl_FragCoord.xy * uFadeNoiseScale ).r;
    if ( ${lod0 ? 'nz >= 1.0 - vFade' : 'nz < 1.0 - vFade'} ) discard;
  }
`;

export function patchFade(mat, lod0, noiseTex) {
  U.uFadeNoise.value = noiseTex;
  U.uFadeNoiseScale.value.set(1 / noiseTex.image.width, 1 / noiseTex.image.height);
  return addPatch(mat, lod0 ? 'fade:0' : 'fade:1', shader => {
    shader.uniforms.uCamXZ = U.uCamXZ;
    shader.uniforms.uR0 = U.uR0;
    shader.uniforms.uFadeHard = U.uFadeHard;
    shader.uniforms.uFadeNoise = U.uFadeNoise;
    shader.uniforms.uFadeNoiseScale = U.uFadeNoiseScale;
    shader.vertexShader = patch(shader.vertexShader, '#include <common>',
      '#include <common>' + FADE_VERT_DECL, 'fade/vert-decl');
    shader.vertexShader = patch(shader.vertexShader, '#include <begin_vertex>',
      FADE_VERT_BODY, 'fade/vert-body');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>' + FADE_FRAG_DECL, 'fade/frag-decl');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <clipping_planes_fragment>',
      fadeBody(lod0), 'fade/frag-body');
  });
}

// ── 5. the LOD2 speckle ────────────────────────────────────────────────────
//
// §3.2's far towers are "one box each, unlit, with a low-frequency emissive speckle". No texture
// and no UVs: the speckle is hashed off the world position the FOG patch already provides, so
// this costs one varying that already exists and about a dozen ALU. At 1,400 m everything is
// fully fogged anyway — what this buys is the near edge of the far field and the daysmog variant,
// where V is 520 m and the band still has some life in it.

const LOD2_BODY = /* glsl */`
#include <color_fragment>
  {
    float band = floor( vWorldPosition.y / 14.4 );          // four window rows
    float col  = floor( ( vWorldPosition.x + vWorldPosition.z * 1.7 ) / 12.8 );
    float hsh  = fract( sin( dot( vec2( col, band ), vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
    diffuseColor.rgb *= vTint * ( 0.055 + 0.62 * step( 0.70, hsh ) );
  }
`;

// A private `iTint` attribute rather than three's `instanceColor`: with only USE_INSTANCING_COLOR
// defined, r160's color_fragment chunk computes vColor and then never multiplies it into
// diffuseColor (that path is guarded on USE_COLOR). One attribute we own is cheaper than a
// material flag whose behaviour is version-dependent.
export function patchLod2(mat) {
  return addPatch(mat, 'lod2', shader => {
    shader.vertexShader = patch(shader.vertexShader, '#include <common>',
      '#include <common>\nattribute vec3 iTint;\nvarying vec3 vTint;', 'lod2/vert-decl');
    shader.vertexShader = patch(shader.vertexShader, '#include <begin_vertex>',
      '#include <begin_vertex>\n  vTint = iTint;', 'lod2/vert-body');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying vec3 vTint;', 'lod2/frag-decl');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <color_fragment>',
      LOD2_BODY, 'lod2/frag-body');
  });
}

// ── 6. signage (§3.5.4) ────────────────────────────────────────────────────
//
// One patch, three terminations, exactly like the fog patch — because `signsNeon`, `signsBox` and
// the hero billboards differ ONLY in how they turn the sampled texel into light:
//
//   tube  the sheet IS the glow.       additive, `sample.r * tint`
//   box   a lit panel with dark art.   `mix( tint, tint * 0.12, sample.r )` — §3.5.4 verbatim
//   hero  a colour CanvasTexture.      `texel.rgb * tint`
//
// Three things in here are load-bearing and none of them is obvious:
//
// 1. THE V FLIP. `signs.json` gives u,v as TOP-LEFT-origin fractions and the sheet is loaded with
//    `flipY = false`, so texture v runs down the image while a quad's `uv.y` runs up it. The
//    region row is therefore `vRegion.y + vRegion.w * ( 1.0 - uv.y )`. Drop the `1.0 -` and every
//    sign in the city is upside down — which is exactly what signs.json.notes.uv warns about.
// 2. §3.2.2 PART 2. `iIntensity *= 1 - smoothstep( 0.85 R0, R0, d )`, with `d` measured from the
//    instance's own chunk centre, so signage RAMPS to nothing over the outer 77 m of the LOD0
//    band instead of vanishing at the boundary. `uCamXZ` / `uR0` are already written once a frame
//    by render_city.js; this costs one attribute and no upload.
// 3. THE TICKER GRADIENT. Only the 10 `wrapU` regions scroll, and `fract()` puts a derivative
//    discontinuity at the wrap. The gradients are therefore taken from the CONTINUOUS coordinate
//    and fed to texture2DGradEXT, the same trick §3.4 needs for the window atlas — without it the
//    hardware answers the seam with the smallest mip, i.e. a grey bar across the ticker.

const SIGN_VERT_DECL = /* glsl */`
attribute vec4 iRegion;      // u, v, w, h — top-left-origin fractions of the sheet
attribute vec3 iEmissive;    // linear tint; the sheet is greyscale (§3.5.1)
attribute float iSeed;
attribute vec2 iChunk;       // the owning chunk's centre, for the §3.2.2 ramp
attribute float iIntensity;
attribute float iAnim;       // 0 = static, else the ticker scroll rate in region-widths/s
uniform vec2 uCamXZ;
uniform float uR0;
uniform float uTime;
uniform float uNeon;
uniform float uSignHard;
varying vec4 vRegion;
varying vec3 vEmissive;
varying float vI;
varying float vFail;
varying float vAnim;
varying vec2 vLocal;
varying float vRamp;
`;

// §3.5.4's animation table, entirely from iSeed, zero CPU: 15 % flicker (a hard 40 ms dropout at
// 0.2-2 Hz), 10 % pulse (a slow sine at +/- 25 %), 3 % failing (one segment dark, the rest at 60 %,
// finished in the fragment shader because it is a band across the tile).
const SIGN_VERT_BODY = /* glsl */`
#include <begin_vertex>
  vRegion = iRegion;
  vEmissive = iEmissive;
  vLocal = uv;
  vAnim = iAnim;
  {
    float d = distance( uCamXZ, iChunk );
    float ramp = mix( 1.0 - smoothstep( 0.85 * uR0, uR0, d ), 1.0 - step( uR0, d ), uSignHard );
    float h1 = fract( iSeed * 0.7351 );
    float h2 = fract( iSeed * 3.1719 );
    float rate = 0.2 + 1.8 * fract( iSeed * 1.3137 );
    float k = 1.0;
    k *= mix( 1.0, 1.0 - step( fract( uTime * rate + h2 ), 0.04 * rate ), step( h1, 0.15 ) );
    k *= mix( 1.0, 1.0 + 0.25 * sin( uTime * ( 0.6 + h2 * 0.9 ) + h2 * 6.2832 ),
              step( 0.15, h1 ) * ( 1.0 - step( 0.25, h1 ) ) );
    vFail = step( 0.97, h1 );
    // The distance ramp is kept SEPARATE from the animation. The two must not do the same thing to
    // a lit panel: a flickering lightbox goes dark and stays opaque, but a lightbox ramping out at
    // the LOD0 boundary has to go TRANSPARENT. Fade a box panel by colour alone and a distant one
    // is a black rectangle glued to the facade -- measured at -0.216 luminance against the windows
    // behind it, which is worse than the pop the ramp exists to prevent.
    vRamp = ramp;
    vI = iIntensity * uNeon * k;
  }
`;

const SIGN_FRAG_DECL = /* glsl */`
varying vec4 vRegion;
varying vec3 vEmissive;
varying float vI;
varying float vFail;
varying float vAnim;
varying vec2 vLocal;
varying float vRamp;
uniform float uTime;
`;

const SIGN_TERM = {
  tube: 'diffuseColor.rgb = vEmissive * texel.r * vI * vRamp * seg;',
  box: 'diffuseColor.rgb = mix( vEmissive, vEmissive * 0.12, texel.r ) * vI * seg;\n  diffuseColor.a *= vRamp;',
  hero: 'diffuseColor.rgb = texel.rgb * vEmissive * vI * seg;\n  diffuseColor.a *= vRamp;',
};

const signBody = mode => /* glsl */`
  float uxC = vLocal.x + uTime * vAnim;
  float ux  = mix( vLocal.x, fract( uxC ), step( 0.0001, vAnim ) );
  // Read the tile mirrored on the back face. These quads are single-pass DoubleSide because a
  // street blade projects perpendicular from the wall and is seen from both sides of a canyon —
  // and a real blade sign is printed on both sides, not run backwards on one of them.
  ux = mix( ux, 1.0 - ux, 1.0 - float( gl_FrontFacing ) );
  vec2 auv  = vec2( vRegion.x + vRegion.z * ux, vRegion.y + vRegion.w * ( 1.0 - vLocal.y ) );
  vec2 gdx  = dFdx( vec2( uxC, vLocal.y ) ) * vRegion.zw;
  vec2 gdy  = dFdy( vec2( uxC, vLocal.y ) ) * vRegion.zw;
  #ifdef texture2DGradEXT
    vec4 texel = texture2DGradEXT( map, auv, gdx, gdy );
  #else
    vec4 texel = texture2D( map, auv );
  #endif
  float seg = mix( 1.0, mix( 0.6, 0.05, step( 0.66, vLocal.y ) ), vFail );
  ${SIGN_TERM[mode]}
`;

export function patchSign(mat, mode = 'tube') {
  if (!SIGN_TERM[mode]) { console.warn('[neonhaul] patchSign: unknown mode', mode); mode = 'tube'; }
  mat.extensions = Object.assign({ derivatives: true }, mat.extensions);
  return addPatch(mat, 'sign:' + mode, shader => {
    shader.uniforms.uCamXZ = U.uCamXZ;
    shader.uniforms.uR0 = U.uR0;
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uNeon = U.uNeon;
    shader.uniforms.uSignHard = U.uSignHard;
    shader.vertexShader = patch(shader.vertexShader, '#include <common>',
      '#include <common>' + SIGN_VERT_DECL, 'sign/vert-decl');
    shader.vertexShader = patch(shader.vertexShader, '#include <begin_vertex>',
      SIGN_VERT_BODY, 'sign/vert-body');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>' + SIGN_FRAG_DECL, 'sign/frag-decl');
    // The whole include: map_fragment multiplies diffuseColor by a sample taken at vMapUv, and
    // what we need is a sample taken inside ONE region of a shared sheet.
    shader.fragmentShader = patch(shader.fragmentShader, '#include <map_fragment>',
      signBody(mode), 'sign/frag-body');
  });
}

// ── 7. strips and strobes (§3.8, §3.10 #3) ─────────────────────────────────
//
// Untextured emissive instances: edge/roof strips (a thin box) and aircraft warning strobes (a
// quad). Both take the same §3.2.2 intensity ramp as signage, because §3.2.2 part 2 names strips
// alongside signs and a strobe that vanishes at 512 m is a height cue that lies.
//
// `blink` turns the strobe rhythm on: 0.85 Hz with a per-building phase out of iSeed (§3.10 #3).
// `billboard` rebuilds the quad in VIEW space so a 2.6 m strobe is never edge-on — a strobe you
// cannot see from three quarters of the compass is not a column of strobes.

const EMIS_VERT_DECL = /* glsl */`
attribute vec3 iEmissive;
attribute float iSeed;
attribute vec2 iChunk;
attribute float iIntensity;
uniform vec2 uCamXZ;
uniform float uR0;
uniform float uTime;
uniform float uNeon;
uniform float uSignHard;
varying vec3 vEmissive;
varying float vI;
`;

const emisVertBody = blink => /* glsl */`
#include <begin_vertex>
  vEmissive = iEmissive;
  {
    float d = distance( uCamXZ, iChunk );
    float ramp = mix( 1.0 - smoothstep( 0.85 * uR0, uR0, d ), 1.0 - step( uR0, d ), uSignHard );
    ${blink
      ? 'float k = step( fract( uTime * 0.85 + fract( iSeed * 0.3137 ) ), 0.13 );'
      : 'float k = 1.0 - 0.06 * sin( uTime * ( 0.4 + fract( iSeed * 0.77 ) ) + iSeed );'}
    vI = iIntensity * ramp * uNeon * k;
  }
`;

// The billboard replaces project_vertex outright. It must still declare `mvPosition`, because
// fog_vertex reads it two chunks later for vFogDepth.
const BILLBOARD = /* glsl */`
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  mvPosition.xy += position.xy * length( instanceMatrix[ 0 ].xyz );
  gl_Position = projectionMatrix * mvPosition;
`;

export function patchEmissive(mat, { blink = false, billboard = false } = {}) {
  return addPatch(mat, 'emis:' + (blink ? 'b' : '-') + (billboard ? 'q' : '-'), shader => {
    shader.uniforms.uCamXZ = U.uCamXZ;
    shader.uniforms.uR0 = U.uR0;
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uNeon = U.uNeon;
    shader.uniforms.uSignHard = U.uSignHard;
    shader.vertexShader = patch(shader.vertexShader, '#include <common>',
      '#include <common>' + EMIS_VERT_DECL, 'emis/vert-decl');
    shader.vertexShader = patch(shader.vertexShader, '#include <begin_vertex>',
      emisVertBody(blink), 'emis/vert-body');
    if (billboard) {
      shader.vertexShader = patch(shader.vertexShader, '#include <project_vertex>',
        BILLBOARD, 'emis/billboard');
    }
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying vec3 vEmissive;\nvarying float vI;', 'emis/frag-decl');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <map_fragment>',
      '  diffuseColor.rgb = vEmissive * vI;', 'emis/frag-body');
  });
}

// ── the materials ──────────────────────────────────────────────────────────

// §3.4's shell, shared by LOD0 and LOD1 (P2). Dark glass over dark metal; every bit of detail in
// frame comes from the emissive atlas, the fog and the envMap, and none from polygons.
// `fade` picks the cross-fade half: null for a material with no fade (the P1a probe scene),
// 'lod0' / 'lod1' for the two city fields. LOD0 and LOD1 are the SAME material recipe — same
// atlas, same UV pitch, same glass sheen — differing only in which half of the dither they keep.
export function shellMaterial(atlas, env, fade = null) {
  const m = new THREE.MeshStandardMaterial({
    color: 0x0a0c11,
    metalness: 0.88,
    roughness: 0.17,
    emissiveMap: atlas.windows,
    emissive: 0xffffff,
    emissiveIntensity: 1.0,
    envMap: env || null,
    envMapIntensity: 1.0,
    fog: true,
  });
  patchWindows(m, atlas.windows);
  patchGlass(m, 0x2a3a4c, 1.0);
  patchFog(m, 'opaque');
  if (fade) patchFade(m, fade === 'lod0', atlas.noise);
  return m;
}

// §3.2's far towers. Unlit, one box each, fog + speckle. Per-instance colour is the district's
// window tint, so the horizon keeps the palette even when it is 97 % fog.
export function farMaterial() {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true, toneMapped: true });
  patchFog(m, 'opaque');
  patchLod2(m);
  return m;
}

// §3.6's ROAD — the opaque half of the ground, and the half that does NOT write depth.
//
// Two changes from P1a's version, both required by §3.7(b):
//
// 1. `depthWrite: false` + `renderOrder: -1`. The mirror group lives at y < 0 and an opaque
//    depth-writing ground occludes it entirely — the reflection simply does not appear. Nothing
//    in the game is ever behind the road, so it loses nothing by not writing. Buildings and craft
//    still write depth normally, which is what makes a tower correctly occlude a sign's
//    reflection.
// 2. Its own roughness canvas. `roughnessMap: atlas.ground` made roughness the green channel of a
//    near-black albedo — 0.047 dry, 0.027 in a puddle — so the whole deck was a mirror and §3.6's
//    "partly wet rather than a uniform mirror" was unreachable. `atlas.groundRough` is the puddle
//    mask at 0.62 / 0.04, generated from the same seed so the puddles land on the dark patches.
// ── P11 §4 — the road, and the water film's missing angle term ──────────────
//
// ART_PASS item 4: "the ground appears semi transparent … check whether this is a bug first."
// It was measured before it was styled (tools/p11_ground.mjs, both controls reported):
//
//   canyon_dive   mirror off  Δ 0.005/255   film off  Δ 0.039     null control 0.000
//   wet_street    mirror off  Δ 0.145       film off  Δ 3.344     positive control 3.270
//
// So the mirror group is NOT what Aaron was looking at — in the one shot built to show it off it
// moves 0.145 of a channel. Two things are:
//
//   1. §3.6 specifies "faint lane markings, drain grates" and `atlas.groundTexture` bakes NEITHER.
//      It is slab joints, grime and 22 puddles on near-black asphalt. There has never been
//      anything on that deck that says "road", so there is nothing for the eye to read as a
//      surface — and a surface you cannot read reads as a sheet of haze.
//   2. The water film is an ADDITIVE env reflection at a FIXED strength. Real specular is
//      Fresnel-weighted: near-total at a grazing angle, a few per cent looking straight down. Ours
//      washed the deck equally hard from every angle, so from a pilot's usual pitched-down view it
//      painted a flat translucent film over the whole street. That IS the semi-transparency, and
//      it is a missing term, not a look choice.
//
// The markings are computed from WORLD XZ, not from the tiling canvas. They have to line up with
// §3.1's grid — a 51.2 m lot with a 13.2 m road between — and the deck is a 1,400 m plane snapping
// in 256 m steps under a texture whose repeat is neither. In world space the alignment is exact by
// construction and costs one fract().
//
// The road is also LIT. It was black, and markings on a black surface are black. §3.11.1's rule is
// about BLENDED layers; this is a term inside an opaque material that was already being shaded.
const ROAD_BODY = /* glsl */`
  vec2 wxz = vWorldPosition.xz;
  float LOT = uRoad.x, HALF = uRoad.y * 0.5;
  vec2 dl = abs( fract( wxz / LOT + 0.5 ) - 0.5 ) * LOT;      // metres to the nearest centreline
  float onX = step( dl.x, HALF );        // inside the carriageway running along Z
  float onZ = step( dl.y, HALF );
  float onRoad = max( onX, onZ );

  // centre dashes, one carriageway each way, suppressed inside the junction
  float dashX = ( 1.0 - smoothstep( 0.10, 0.26, dl.x ) ) * step( 0.42, fract( wxz.y / 9.0 ) ) * ( 1.0 - onZ );
  float dashZ = ( 1.0 - smoothstep( 0.10, 0.26, dl.y ) ) * step( 0.42, fract( wxz.x / 9.0 ) ) * ( 1.0 - onX );
  // solid edge lines a metre inside the kerb
  float edgeX = ( 1.0 - smoothstep( 0.09, 0.22, abs( dl.x - ( HALF - 1.1 ) ) ) ) * ( 1.0 - onZ );
  float edgeZ = ( 1.0 - smoothstep( 0.09, 0.22, abs( dl.y - ( HALF - 1.1 ) ) ) ) * ( 1.0 - onX );
  // junction hatching — 45 deg bars, the thing that makes a crossroads read as a crossroads
  float hatch = onX * onZ * ( 1.0 - smoothstep( 0.18, 0.34, abs( fract( ( wxz.x + wxz.y ) / 4.4 ) - 0.5 ) ) );
  float paint = clamp( dashX + dashZ + edgeX + edgeZ + hatch * 0.30, 0.0, 1.0 ) * onRoad;

  // the kerb: a 0.5 m raised band at the carriageway edge, DARKER than the road, which is what
  // gives the street an edge instead of bleeding into the block
  float kerb = max( ( 1.0 - smoothstep( 0.0, 0.5, abs( dl.x - HALF ) ) ) * ( 1.0 - onZ ),
                    ( 1.0 - smoothstep( 0.0, 0.5, abs( dl.y - HALF ) ) ) * ( 1.0 - onX ) );

  // service deck between the roads: drain grates on a 6.4 m pitch, only off the carriageway
  vec2 gz = abs( fract( wxz / 6.4 ) - 0.5 );
  float grate = ( 1.0 - onRoad ) * step( max( gz.x, gz.y ), 0.09 );

  // Every feature above is a fixed width in METRES, so past the distance where one pixel covers a
  // whole lane line the grid turns into moire — and crawling road markings is exactly what a
  // critic marks under Finish. fwidth() of the world coordinate is the size of a pixel in metres,
  // so this fades the markings out at precisely the distance they stop being resolvable, whatever
  // the resolution or the field of view. The fog takes the rest.
  float mPerPx = fwidth( wxz.x ) + fwidth( wxz.y );
  float sharp = 1.0 - smoothstep( 0.30, 1.30, mPerPx );
  paint *= sharp; kerb *= sharp; grate *= sharp;

  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.26, 0.252, 0.208 ) * uRoad.z, paint * 0.92 );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.030, 0.031, 0.036 ), kerb * 0.85 );
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.018, 0.019, 0.021 ), grate );
  roughnessFactor = mix( roughnessFactor, 0.44, paint );
  roughnessFactor = mix( roughnessFactor, 0.82, kerb * 0.8 );

  // Street lighting: pools along the carriageway on a low-frequency beat, plus the paint catching
  // it. Warm, because every plate's street is sodium and every plate's sky is not.
  float pool = 0.42 + 0.58 * ( 0.5 + 0.5 * sin( wxz.x * 0.0616 ) * sin( wxz.y * 0.0491 ) );
  // The ASPHALT stays nearly black — 1475810_04's wet tarmac is dark and gets its brightness from
  // what it reflects, not from being lit. It is the PAINT and the kerb that catch the street
  // lighting, which is what makes markings read at all on a near-black deck.
  // Paint is white, so the light it returns is only half the lamp's colour; asphalt and kerb are
  // near-black and return the lamp's own hue. Without that split every marking reads as a neon
  // strip laid in the road rather than as paint under a street light.
  vec3 paintLit = mix( uRoadCol, vec3( 1.0 ), 0.45 );
  totalEmissiveRadiance += uRoad.w * pool * ( uRoadCol * ( onRoad * 0.20 + kerb * 0.34 ) + paintLit * paint * 2.0 );
`;

export function patchRoad(mat) {
  return addPatch(mat, 'road', shader => {
    shader.uniforms.uRoad = U.uRoad;
    shader.uniforms.uRoadCol = U.uRoadCol;
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>\nuniform vec4 uRoad;\nuniform vec3 uRoadCol;', 'road/frag-decl');
    // vWorldPosition comes from patchFog, which groundMaterial also carries. Replacing the whole
    // include rather than injecting after it, for the same reason §4.2 gives about fog_fragment:
    // a patch that misses is silent, and patch() is what makes it loud.
    shader.fragmentShader = patch(shader.fragmentShader, '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>' + ROAD_BODY, 'road/frag-body');
  });
}

// The film's missing Fresnel. `geometryNormal` and `geometryViewDir` are both in scope at
// opaque_fragment (declared in lights_fragment_begin) — the same two names §3.7(c)'s rim light
// uses, and the same two the first draft of that snippet got wrong.
export function patchFilmFresnel(mat) {
  return addPatch(mat, 'filmfres', shader => {
    shader.uniforms.uFilmFres = U.uFilmFres;
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>\nuniform vec2 uFilmFres;', 'film/fres-decl');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <opaque_fragment>',
      '  float fFres = pow( 1.0 - saturate( dot( geometryNormal, geometryViewDir ) ), uFilmFres.x );\n'
      + '  outgoingLight *= mix( uFilmFres.y, 1.0, fFres );\n'
      + '#include <opaque_fragment>', 'film/fres-body');
  });
}

export function groundMaterial(atlas, env) {
  atlas.ground.repeat.set(64, 64);
  atlas.groundRough.repeat.set(64, 64);
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: atlas.ground,
    roughnessMap: atlas.groundRough,
    roughness: 1.0,
    metalness: 0.62,
    envMap: env || null,
    envMapIntensity: 1.1,
    fog: true,
    depthWrite: false,
  });
  // ROAD_BODY uses fwidth() to fade the markings at the distance a pixel stops resolving them.
  m.extensions = Object.assign({ derivatives: true }, m.extensions);
  patchFog(m, 'opaque');
  patchRoad(m);
  return m;
}

// §3.6's WATER FILM — a second co-planar quad at y = +0.02, drawn AFTER the mirror group so the
// reflection sits under it and the two read as one wet surface.
//
// It is a mirror-metal with a scrolling ripple normal and no albedo of its own: everything it
// shows is the env bake plus whatever the mirror group already painted under it. Alpha is driven
// by the variant's `rain`, so a dry `daysmog` street has no film at all and the shot costs nothing.
// ADDITIVE, and that is the whole design. A wet film ADDS a specular reflection to the surface
// under it; it does not replace what is there. A normal-blended film at 0.5 opacity multiplies the
// mirror group underneath it by 0.5 — i.e. the layer whose entire job is to make the reflection
// read halves it. Additive also means the night case costs nothing visually where the env bake is
// near-black, and only shows where there is something to reflect, which is exactly right.
export function filmMaterial(atlas, env) {
  atlas.ripple.repeat.set(140, 140);
  const m = new THREE.MeshStandardMaterial({
    color: 0x8fa2bd,
    metalness: 1.0,
    roughness: 0.06,
    normalMap: atlas.ripple,
    normalScale: new THREE.Vector2(0.65, 0.65),
    envMap: env || null,
    // 1.6, and a note about how nearly it became 3.6. A first measurement said the film moved the
    // frame by 0.0004 of luminance — below the dither, i.e. absent — and the obvious response was
    // to turn it up. The measurement was wrong: `setFilm(false)` set `mesh.visible = false` and
    // Reflections.update put it straight back on the next frame, so the "off" probe was the film
    // measured against itself. Isolated properly (the `filmOff` flag), 1.6 already moves the
    // worst cell by 0.095 and the whole grid by 4.54, and 3.6 was making a wet road into a lake.
    // Force the suspect term to a constant and check the output actually changed, before tuning.
    envMapIntensity: 1.6,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  patchFog(m, 'additive');
  patchFilmFresnel(m);
  return m;
}

// §4.5's shaft card. Additive, so it takes the additive fog termination — `fog: false` was the
// first draft's answer and it makes a 400 m shaft ignore the haze everything else obeys.
export function shaftMaterial(atlas) {
  const m = new THREE.MeshBasicMaterial({
    map: atlas.shaft,
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    // r160 renders a transparent DoubleSide material TWICE — back faces then front faces
    // (three.module.js:29319) — which doubled the shaft field's draw calls for nothing:
    // additive blending is order-independent, so the second pass buys no sorting correctness.
    forceSinglePass: true,
    fog: true,
    toneMapped: false,
  });
  patchFog(m, 'additive');
  return m;
}

// §4.4's LOW bloom substitute. P3b builds the field; the material is here so the whole material
// set is in one file.
export function haloMaterial(atlas) {
  const m = new THREE.MeshBasicMaterial({
    map: atlas.halo,
    transparent: true,
    opacity: 0.40,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
    toneMapped: false,
  });
  patchFog(m, 'additive');
  return m;
}

// §3.5.4's two instanced sign meshes plus the hero billboards. Same quad, same sheet, same four
// instanced attributes — the ONLY difference is the blend and the termination, which is why this
// is three draw calls and not three subsystems.
//
//   tube  additive. Order-independent, so it needs no sorting and no depth write.
//   box   normal blend. A lit panel is opaque-ish on a black scene, so it needs none either.
//   hero  normal blend, a colour CanvasTexture instead of the greyscale sheet.
//
// DoubleSide + transparent renders TWICE in r160 (three.module.js:29319) unless forceSinglePass
// is set, and the second pass buys nothing here: additive is order-independent and the box panels
// sit flush on a wall. Blades, though, are seen from both sides of a canyon, so single-pass
// DoubleSide is exactly what we want and it costs one flag.
export function signMaterial(tex, mode = 'tube') {
  const m = new THREE.MeshBasicMaterial({
    map: tex,
    color: 0xffffff,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    blending: mode === 'tube' ? THREE.AdditiveBlending : THREE.NormalBlending,
    fog: true,
    toneMapped: false,
  });
  patchSign(m, mode);
  patchFog(m, mode === 'tube' ? 'additive' : 'alpha');
  return m;
}

// §3.8's edge / roof strips: a thin box, 12 tris, additive, front faces only so a 0.35 m tube
// does not add twice through itself.
export function stripMaterial() {
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 1.0, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: true, toneMapped: false,
  });
  patchEmissive(m, {});
  patchFog(m, 'additive');
  return m;
}

// §3.10 #3's aircraft warning strobes: a billboarded quad, red, 0.85 Hz, per-building phase.
export function strobeMaterial() {
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 1.0, depthWrite: false, depthTest: true,
    blending: THREE.AdditiveBlending, fog: true, toneMapped: false,
  });
  patchEmissive(m, { blink: true, billboard: true });
  patchFog(m, 'additive');
  return m;
}

// §3.8's antennae / masts / sky bridges. Dark metal, no windows, and the LOD0 half of §3.2.2's
// dither so a mast dissolves at the band edge exactly as the tower under it does — these have no
// LOD1 counterpart, so an intensity ramp would have nothing to ramp.
// P3b: envMapIntensity 0.9 → 0.08 and roughness 0.38 → 0.72, verified by rendering the A/B rather
// than by reasoning about it — at 0.28 the bars were still there. §3.7(a)'s city-glow band (added at
// P3b) put a bright horizon into every envMap, and a 0.9 m x 28 m mast that is 90 % metal at
// roughness 0.38 mirrors that band along its whole length — a near mast rendered as a PALE
// VERTICAL BAR brighter than the fog behind it, which the first blind round flagged as "thin
// vertical white lines that don't correspond to any modeled structure ... reads as a stray or
// z-fighting artifact". A mast is a silhouette in every plate we score against.
export function structureMaterial(env, noiseTex) {
  const m = new THREE.MeshStandardMaterial({
    color: 0x0b0d12, metalness: 0.9, roughness: 0.72,
    envMap: env || null, envMapIntensity: 0.08, fog: true,
  });
  patchFog(m, 'opaque');
  if (noiseTex) patchFade(m, true, noiseTex);
  return m;
}

// ── 11. S2-H — the shopfront, and Aaron's venetian blind ───────────────────
//
// Aaron's brief, verbatim: *"windows are just light faces except at certain angles — e.g. like a
// venetian blind where at some angles you only see blind, other angles you can see through … this
// would allow us not to render much other than nice lighting except when at the right distance
// and angle"*. That is the design and this is where it lives.
//
// ONE QUAD IS A WHOLE SHOP. A shopfront instance is a plane W x H metres standing 0.12 m off the
// building's ground-floor face, and everything on it — the fascia, its sign, the mullions, the
// stall riser, the blind and the room behind the blind — is drawn per pixel inside that one quad.
// No geometry, no second draw, no texture but the signage sheet the city already has loaded.
//
// THE BLIND IS THE BUDGET. `open` is the product of three gates and every one of them is zero for
// most of the game:
//
//   angle     the slats are horizontal and tilted per shop; you see between them only when the
//             ray's elevation is inside a narrow band around that tilt. Flying at 60 m over a
//             street looks DOWN at every shopfront, so from the air every blind is shut.
//   distance  the room fades out between uShop.y and uShop.z. A 6 m shopfront at 100 m is ~20 px.
//   facing    a wall seen at a grazing angle is slats, exactly as a real blind behaves.
//
// The interior is inside `if ( open > 0.004 )`, and that branch is COHERENT — openness varies
// smoothly across a quad and identically across every pixel of a shop you are not looking at — so
// the closed case costs a handful of ALU and never touches the room at all. What that is WORTH is
// unmeasured: see the note in js/shops.js. On this Mac it is worth nothing that any instrument here
// can see, and it is shipped for the phone and for the look, not on a measurement.
//
// THE ROOM IS THREE PARALLAX PLANES, not box-mapped and not marched. The view ray is re-expressed
// in the shop's own tangent frame and intersected with planes at 5.2 m, 3.0 m and 1.1 m behind the
// glass; each plane paints its own content and the nearer ones over-paint the further. Three plane
// intersections is nine multiply-adds, and because the three slide against each other at different
// rates as you move it reads as depth rather than as a picture of depth.
//
// THE SLATS FADE BEFORE THEY ALIAS. The slat pitch is 0.11 m; at 40 m on a 390 px phone that is
// well under a pixel, and a sub-pixel stripe pattern with no mip chain crawls. `fwidth` measures
// the pitch in pixels and dissolves the pattern into its own mean before it can — the same
// discipline §3.10 #1 applies to the window grid, applied to a procedural one.

const SHOP_VERT_DECL = /* glsl */`
attribute vec4 iRegion;      // the fascia sign's region in the signage sheet (top-left fractions)
attribute vec3 iEmissive;    // fascia sign tint, linear
attribute vec3 iGlow;        // the light INSIDE this shop, linear — one colour lights the whole room
attribute vec4 iShop;        // (width m, height m, seed, kind)
varying vec4 vRegion;
varying vec3 vEmissive;
varying vec3 vGlow;
varying vec4 vShop;
varying vec2 vLocal;
varying vec3 vTanW;
varying vec3 vNorW;
`;

// The tangent frame comes straight off the instance matrix: the quad is only ever yawed about Y,
// so its local +X is the along-wall axis and its local +Z is the outward wall normal. Taking them
// from the matrix rather than from a per-instance attribute is two normalises and no upload, and
// it cannot disagree with where the quad actually is.
const SHOP_VERT_BODY = /* glsl */`
#include <begin_vertex>
  vRegion = iRegion; vEmissive = iEmissive; vGlow = iGlow; vShop = iShop; vLocal = uv;
  vTanW = normalize( instanceMatrix[0].xyz );
  vNorW = normalize( instanceMatrix[2].xyz );
`;

const SHOP_FRAG_DECL = /* glsl */`
varying vec4 vRegion;
varying vec3 vEmissive;
varying vec3 vGlow;
varying vec4 vShop;
varying vec2 vLocal;
varying vec3 vTanW;
varying vec3 vNorW;
uniform vec4 uShop;
uniform float uShopForce;
uniform float uTime;
uniform float uNeon;

float shopHash( float a, float b ) { return fract( sin( a * 12.9898 + b * 78.233 ) * 43758.5453 ); }

// A soft-edged box in room coordinates. Everything in the room is one of these.
float shopBox( vec2 p, vec2 lo, vec2 hi, float soft ) {
  vec2 a = smoothstep( lo - soft, lo + soft, p );
  vec2 b = smoothstep( hi + soft, hi - soft, p );
  return a.x * a.y * b.x * b.y;
}
`;

// `gx, gy` are metres across and up the GLAZING; `d` is the view ray in the shop's tangent frame,
// already divided by its own depth component, so travelling `t` metres into the room is a plain
// multiply-add. `W, H` are the room's interior width and height.
const SHOP_ROOM = /* glsl */`
vec3 shopRoom( vec2 g, vec2 d, float W, float H, float seed, float kind, vec3 lamp ) {
  float eatery = 1.0 - step( 2.5, kind );

  // Surfaces are NEUTRAL and the LIGHT is coloured. Painting the walls with the lamp colour makes
  // a room that reads as a coloured filter over a stripe pattern rather than as a room — the first
  // pass did exactly that and every shop in the city was one flat hue from floor to ceiling.
  const vec3 WALL  = vec3( 0.44, 0.42, 0.40 );
  const vec3 FLOOR = vec3( 0.26, 0.25, 0.25 );

  // ── plane 3: the back wall, 5.2 m in ───────────────────────────────────
  vec2 p = g + d * 5.2;
  // Outside the room's width is a side wall; below zero is the floor. Both are much darker than
  // the lit back wall, and that difference is what gives the opening its depth.
  float side = smoothstep( -0.9, 0.15, p.x ) * smoothstep( W + 0.9, W - 0.15, p.x );
  vec3 alb = mix( FLOOR, WALL, smoothstep( -0.04, 0.12, p.y ) ) * mix( 0.34, 1.0, side );
  // one cove light along the top of the back wall, and its wash down the wall
  float cove = smoothstep( H * 0.74, H * 0.93, p.y ) * side;
  float wash = ( 1.0 - smoothstep( 0.0, H * 1.15, p.y ) ) * side;
  vec3 c = alb * lamp * ( 0.42 + 0.72 * wash ) + lamp * 0.70 * cove;
  // an eatery hangs a menu board; a store racks shelves. Same two lines, different pitch.
  float rowPitch = mix( 0.58, 1.02, eatery );
  c *= 1.0 - 0.18 * side * smoothstep( 0.74, 0.88, fract( p.y / rowPitch + seed ) );
  c += lamp * side * eatery * 0.30 * shopBox( p, vec2( W * 0.20, H * 0.55 ), vec2( W * 0.80, H * 0.73 ), 0.05 );
  // the chiller cabinet a food store always has against one wall — colder than the room light
  c += mix( lamp, vec3( 0.45, 0.70, 0.85 ), 0.6 ) * side * ( 1.0 - eatery ) * 0.42
     * shopBox( p, vec2( W * 0.50, 0.18 ), vec2( W * 0.94, H * 0.60 ), 0.06 );

  // ── plane 2: the counter line and the people at it, 3.0 m in ───────────
  p = g + d * 3.0;
  float counter = shopBox( p, vec2( -0.7, -0.5 ), vec2( W + 0.7, 1.00 ), 0.04 );
  c = mix( c, alb * lamp * 0.16, counter );
  // the counter top catches the light above it — the line that says "this is furniture"
  c += lamp * 0.34 * shopBox( p, vec2( -0.7, 0.92 ), vec2( W + 0.7, 1.00 ), 0.02 );
  // Three seeded stations, drawn far to near so painter's order IS depth order. The first stands
  // behind the counter and only its hood clears the top; the other two are on the customer side,
  // which is the only way a whole cloak reads.
  for ( int i = 0; i < 3; i++ ) {
    float fi = float( i );
    float hA = shopHash( seed + fi * 1.9, 5.0 );
    float hB = shopHash( seed + fi * 3.7, 11.0 );
    float hC = shopHash( seed + fi, 21.0 );
    float there = step( 0.36, hA );
    // WHICH WAY THEY ARE STANDING. Every figure used to face the glass, because the cloak is
    // symmetric and the band was always centred — so a room full of people all stared out at the
    // street. Aaron: *"every single person is facing outward in a store. even people who would be
    // facing the other way."* Most of a shop's occupants are turned to the counter or to each
    // other, so FRONT is now the minority: ~32 % away, ~38 % in profile, ~30 % facing out.
    //
    // The visor is what carries it. A cloak from behind and a cloak from the front are the same
    // garment; it is the band that says which way the head is pointed, so the facing is expressed
    // almost entirely in where that band is and whether it is visible at all.
    float fc = fract( hB * 7.3 );
    float away = 1.0 - step( 0.32, fc );                  // turned to the counter — no band
    float prof = step( 0.32, fc ) * ( 1.0 - step( 0.70, fc ) );
    float side = sign( fract( hC * 5.1 ) - 0.5 );         // which shoulder the profile turns over
    vec2 pf = g + d * ( 3.0 - fi * 0.42 );
    float px = ( 0.14 + 0.72 * hB ) * W;
    float ph = 1.52 + 0.26 * hC;

    // STILL MOST OF THE TIME, then a few seconds of something. The first version ran every figure
    // as a permanent sinusoid — a 33.8 s lean, a 9.1 s bob and a 43.6 s cup, all continuous — so
    // nobody in the city was ever motionless. Aaron: *"small movements occasionally, it shouldn't
    // be too frequent."* The envelope is ~5 s of activity in every 30, phase-staggered per figure
    // off its own hash, so across the shops in frame two or three people are doing something and
    // the rest are standing there.
    //
    // idle is the floor and it is not zero on purpose: a figure pinned to exactly one position
    // reads as a prop rather than as a person holding still. 16 % of 7 cm is about a centimetre.
    float t = uTime * 0.6 + hA * 24.0 + fi * 2.1;
    float act = fract( hA * 6.19 );
    vec3 osc = sin( vec3( t * 0.31, t * 1.15, t * 0.24 + 1.5708 ) );
    float cyc = fract( t * 0.0556 + hC );
    float env = smoothstep( 0.0, 0.03, cyc ) * ( 1.0 - smoothstep( 0.14, 0.17, cyc ) );
    float m = 0.16 + 0.84 * env;
    // Three things a person in a shop does: shift their weight, talk, or drink. Talking is the new
    // one and it is the commonest, which is what a bar looks like.
    float talk = step( 0.30, act ) * ( 1.0 - step( 0.70, act ) );
    float drink = step( 0.70, act );
    // Speech cadence, and it only exists while they are actually talking — a nod at 0.7 Hz on a
    // silent figure is a twitch.
    float tk = 0.5 + 0.5 * sin( t * 4.4 );
    float upper = smoothstep( 0.10, 0.92, pf.y / ph );
    vec2 q = pf - vec2( px + 0.070 * osc.x * step( act, 0.62 ) * upper * m,
                              ( 0.026 * osc.y * step( 0.30, act )
                              + 0.019 * ( tk - 0.5 ) * talk * env ) * upper * m );
    float u = q.y / ph;

    // One garment, hem to hood: a flare that tapers past the shoulders and closes over the head,
    // so there is no neck to give the join away. sw shades the folds AND waves the hem, which is
    // what stops the hem reading as the bottom of a cone.
    float sw = sin( q.x * ( 11.0 + 15.0 * ( 1.0 - u ) ) + hC * 6.0 );
    float flare = 1.0 - smoothstep( 0.0, 0.60, u );
    // the shoulder bump is what stops the taper reading as a traffic cone, and the dome is what
    // stops the hood reading as a point
    float shoulder = smoothstep( 0.52, 0.71, u ) * ( 1.0 - smoothstep( 0.71, 0.81, u ) );
    float dt = max( u - 0.885, 0.0 ) / 0.115;
    float w = ( 0.242 + 0.120 * flare * flare + 0.046 * shoulder )
            * ( 1.0 - 0.44 * smoothstep( 0.74, 0.845, u ) )
            * sqrt( clamp( 1.0 - dt * dt, 0.0, 1.0 ) )
            + 0.015 * sw * ( 1.0 - smoothstep( 0.60, 0.80, u ) );
    // Shoulders read narrower turned side-on. Only the profile narrows: a cloak seen from behind
    // is as wide as one seen from the front.
    w *= mix( 1.0, 0.80, prof );
    float ax = abs( q.x );
    float cover = smoothstep( w + 0.026, w - 0.026, ax ) * step( u, 1.0 )
                * smoothstep( 0.030 * sw - 0.028, 0.030 * sw + 0.024, q.y );

    // Cloth, not a hole punched in the room. The near-black fill this replaced is exactly why the
    // figures read as 2D cut-outs: a real albedo under the room's own lamp, hem darker than the
    // shoulders, and a lit outline where the cove light above catches the edge of the drape.
    vec3 cloth = mix( vec3( 0.34, 0.34, 0.38 ), vec3( 0.40, 0.32, 0.26 ), fract( hC * 3.3 ) );
    // Standing at the window, a figure catches the cold street as well as the room. Without that
    // the cloth comes out the lamp's own hue and disappears into the wall behind it.
    vec3 fig = cloth * mix( lamp, vec3( 0.40, 0.45, 0.58 ), 0.20 )
             * ( 0.30 + 0.46 * smoothstep( 0.02, 0.86, u ) ) * ( 0.80 + 0.26 * sw )
             + lamp * ( 0.16 * smoothstep( w * 0.82, w * 0.99, ax ) * smoothstep( 0.30, 0.95, u )
                        + 0.13 * smoothstep( 0.86, 1.00, u ) );

    // One in three raises a cup to the hood and lowers it again, arcing inward as it goes up. It
    // is one lozenge, not a cup and an arm: a disc on its own reads as a dot beside the cloak.
    float ct = smoothstep( 0.2, 0.8, 0.5 - 0.5 * osc.z );
    // ONE lozenge, two jobs, because the arm is the same arm: a drinker's arcs slowly up to the
    // hood and back, a talker's makes small quick moves at chest height. Selecting the PATH rather
    // than adding a second shape keeps this at one length() per figure.
    vec2 cq = q - mix( vec2( 0.232 + 0.048 * tk, ph * ( 0.44 + 0.09 * tk ) ),
                       vec2( mix( 0.265, 0.185, ct ), ph * mix( 0.50, 0.855, ct ) ), drink );
    // Turned away the arm is on the far side of the body, so there is nothing to see.
    float cup = smoothstep( 0.062, 0.028, length( cq * vec2( 0.80, 1.0 ) ) )
              * max( drink, talk ) * env * ( 1.0 - away );
    cover = max( cover, cup );
    // It has to break the OUTLINE to read at all — sleeve-toned and half outside the cloak, with
    // the cup end lit. Tucked inside and bright it is a patch on the garment, not an arm.
    fig = mix( fig, cloth * lamp * 0.95
                  + lamp * 0.30 * smoothstep( 0.01, 0.07, cq.x * mix( 1.0, -1.0, ct ) ), cup );

    // The eye band. Emissive, so it does not take the room's colour, and it is THE read at
    // distance — everything above is what the band is worn by. Colours are the shop signage
    // palette (js/shops.js), not a fourth one nobody else in the city uses.
    float eh = fract( hB * 4.7 );
    vec3 eyeC = mix( vec3( 0.05, 0.79, 1.00 ), vec3( 1.00, 0.06, 0.36 ), step( 0.42, eh ) );
    eyeC = mix( eyeC, vec3( 1.00, 0.44, 0.07 ), step( 0.80, eh ) );
    float ey = abs( q.y - ph * 0.885 );
    // Centred and full width facing out; a short stub carried over one shoulder in profile; gone
    // entirely turned away. bx is signed off the band's own centre rather than off the figure's,
    // which is the whole of the profile shift.
    float bOff = prof * side * 0.052;
    float bHalf = mix( 0.078, 0.030, prof );
    float bx = abs( q.x - bOff );
    float band = smoothstep( bHalf, bHalf - 0.022, bx ) * smoothstep( 0.021, 0.013, ey ) * ( 1.0 - away );
    // Turned away there is no visor to see, and the first attempt at implying one was worse than
    // nothing: a term symmetric in abs(x) draws TWO lobes, which read as a pair of eyes staring
    // straight out — the exact opposite of the facing it was meant to express. So what is left is
    // a single soft spill over the crown, no structure and no lobes: enough that something is lit
    // inside the hood, not enough to be a face.
    float rim = away * smoothstep( 0.855, 1.0, u ) * smoothstep( w + 0.01, w * 0.55, ax );
    fig += eyeC * ( 1.5 * band
                  + 0.30 * smoothstep( bHalf + 0.052, bHalf - 0.018, bx ) * smoothstep( 0.055, 0.016, ey ) * ( 1.0 - away )
                  + 0.13 * rim )
         + vec3( 0.06 ) * band;

    // Only the first figure is behind the counter, so only it is cut off by the counter top.
    c = mix( c, fig, cover * there * mix( smoothstep( 0.96, 1.06, pf.y ), 1.0, step( 0.5, fi ) ) );
  }

  // ── plane 1: what hangs near the glass, 1.1 m in ───────────────────────
  p = g + d * 1.1;
  // hanging lamps over an eatery counter; a lit display case in a store
  float lampX = fract( p.x / 1.55 + seed * 0.7 ) - 0.5;
  float hang = eatery * smoothstep( 0.19, 0.02, length( vec2( lampX * 1.55, p.y - ( H - 0.62 ) ) ) );
  c += lamp * 1.60 * hang;
  c += lamp * 0.46 * ( 1.0 - eatery ) * shopBox( p, vec2( 0.18, 0.12 ), vec2( W - 0.18, 0.82 ), 0.05 );
  return c;
}
`;

const SHOP_FRAG_BODY = /* glsl */`
  float shopW = vShop.x, shopH = vShop.y, sSeed = vShop.z;
  float tube  = step( 7.5, vShop.w );          // the tile's bake mode rides in the kind's high bit
  float sKind = vShop.w - 8.0 * tube;
  // A sixth of the units are shut for the night: shutter down, sign on a trickle. A street where
  // every single unit is trading is the wallpaper this layer exists to avoid, and a dark shutter
  // beside a lit window is what makes the lit one read as open.
  float shut  = step( shopHash( sSeed, 13.0 ), 0.17 );

  float mx = vLocal.x * shopW;
  float my = vLocal.y * shopH;

  const float FASCIA = 1.60;      // the sign band above the glass — a fixed physical size (§3.10 #4)
  const float PLINTH = 0.52;      // the stall riser under it
  float winTop = shopH - FASCIA;

  vec3 col;
  if ( my >= winTop ) {
    float fy = ( my - winTop ) / FASCIA;
    // The sign keeps the sheet's baked 4:1 aspect whatever the shop is wide, because §3.10 #4's
    // ruler is the reason a distance read works at all. A wide shop gets a wider fascia BOARD and
    // the same size sign, exactly as a real one does.
    float sw = min( 6.4, shopW - 0.5 );
    float sh = sw * 0.25;
    float sx = ( mx - ( shopW - sw ) * 0.5 ) / sw;
    float sy = ( ( my - winTop ) - ( FASCIA - sh ) * 0.5 ) / sh;
    col = vGlow * 0.04 + vec3( 0.011, 0.012, 0.017 );
    if ( sx > 0.0 && sx < 1.0 && sy > 0.0 && sy < 1.0 ) {
      // §3.5.4's two idioms and the same v flip: the sheet is top-left-origin and uv.y runs up.
      vec2 auv = vec2( vRegion.x + vRegion.z * sx, vRegion.y + vRegion.w * ( 1.0 - sy ) );
      float t = texture2D( map, auv ).r;
      col = mix( mix( vEmissive * 0.70, vEmissive * 0.07, t ),   // box: a lit panel, dark artwork
                 vEmissive * ( 0.05 + 1.10 * t ),                // tube: the marks ARE the light
                 tube );
      col *= mix( 1.0, 0.16, shut );
    }
    // the downlight lip under the fascia — the thing that says a shopfront is lit from above
    col += vGlow * 0.34 * ( 1.0 - shut ) * smoothstep( 0.14, 0.0, fy );
  } else {
    float gy = my - PLINTH;
    float gh = winTop - PLINTH - 0.14;
    if ( gy < 0.0 || gy > gh ) {
      col = vGlow * 0.06 + vec3( 0.009, 0.010, 0.013 );
    } else if ( shut > 0.5 ) {
      // A roller shutter: horizontal corrugation, no light behind it, and the fascia's trickle
      // catching the top few slats.
      float corr = 0.5 + 0.5 * cos( gy * 41.9 );
      float visC = 1.0 - smoothstep( 0.22, 0.55, fwidth( gy ) * 6.67 );
      col = vec3( 0.030, 0.030, 0.034 ) * mix( 1.0, 0.55 + 0.9 * corr, visC )
          + vGlow * 0.045 * smoothstep( gh * 0.55, gh, gy );
    } else {
      vec3 V = normalize( vWorldPosition - cameraPosition );
      float dz = -dot( V, vNorW );
      float dxv = dot( V, vTanW );

      // ── the venetian blind ─────────────────────────────────────────────
      float tilt = -0.30 + 0.34 * shopHash( sSeed, 3.0 );
      float openA = 1.0 - smoothstep( uShop.w, uShop.w + 0.14, abs( V.y - tilt ) );
      float openB = 1.0 - smoothstep( uShop.y, uShop.z, distance( vWorldPosition, cameraPosition ) );
      float openC = smoothstep( 0.16, 0.52, dz );
      float open = openA * openB * openC * uShop.x;
      open = mix( open, uShopForce, step( 0.0, uShopForce ) );

      // The lit face. Slats ramp across their own pitch, and fwidth() dissolves the ramp into its
      // own mean the moment the pitch drops below about two pixels.
      float pitch = 0.11;
      float sl = fract( gy / pitch );
      float vis = 1.0 - smoothstep( 0.22, 0.55, fwidth( gy ) / pitch );
      vec3 blind = vGlow * ( 0.52 + 0.30 * ( gy / gh ) ) * mix( 1.0, 0.72 + 0.34 * sl, vis );

      vec3 glass = blind;
      if ( open > 0.004 ) {
        float k = 1.0 / max( dz, 0.10 );
        glass = mix( blind, shopRoom( vec2( mx, gy ), vec2( dxv * k, V.y * k ),
                                      shopW, gh, sSeed, sKind, vGlow ), open );
      }
      // A grazing sheen so the glazing reads as glass rather than as an opening. Neutral, because
      // what a shop window picks up at a grazing angle is the street, not its own lamps.
      glass += vec3( 0.055, 0.060, 0.075 ) * pow( 1.0 - clamp( dz, 0.0, 1.0 ), 4.0 );

      // The posts are widened by one pixel of fwidth() for the same reason the slats dissolve: a
      // 60 mm mullion at 200 m is a stairstep otherwise, and a stairstep is what a critic reads as
      // an untrimmed primitive.
      float pw = fwidth( mx );
      float bays = max( 1.0, floor( shopW / 1.65 + 0.5 ) );
      float bay = shopW / bays;
      float post = 1.0 - smoothstep( 0.030, 0.075 + pw, abs( fract( mx / bay + 0.5 ) - 0.5 ) * bay );
      float doorBay = floor( shopHash( sSeed, 7.0 ) * bays );
      float onDoor = 1.0 - abs( sign( floor( mx / bay ) - doorBay ) );
      float frame = max( post, 1.0 - smoothstep( 0.05, 0.12 + pw, min( gy, gh - gy ) ) );
      // one bay is the door, marked by its head rail. Without it a shop row is one continuous
      // window; with it the row reads as a row of separate shops you could walk into.
      frame = max( frame, onDoor * ( 1.0 - smoothstep( 0.05, 0.11, abs( gy - gh * 0.86 ) ) ) );
      col = mix( glass, vGlow * 0.035 + vec3( 0.010, 0.011, 0.015 ), frame * 0.90 );
    }
  }
  diffuseColor.rgb = col * uNeon;
`;

export function patchShop(mat) {
  mat.extensions = Object.assign({ derivatives: true }, mat.extensions);
  return addPatch(mat, 'shop', shader => {
    shader.uniforms.uShop = U.uShop;
    shader.uniforms.uShopForce = U.uShopForce;
    shader.uniforms.uTime = U.uTime;
    shader.uniforms.uNeon = U.uNeon;
    shader.vertexShader = patch(shader.vertexShader, '#include <common>',
      '#include <common>' + SHOP_VERT_DECL, 'shop/vert-decl');
    shader.vertexShader = patch(shader.vertexShader, '#include <begin_vertex>',
      SHOP_VERT_BODY, 'shop/vert-body');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>' + SHOP_FRAG_DECL + SHOP_ROOM, 'shop/frag-decl');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <map_fragment>',
      SHOP_FRAG_BODY, 'shop/frag-body');
  });
}

// Opaque, unlit, front faces only, and it WRITES DEPTH: a shopfront is a physical panel 0.12 m off
// the wall, not a decal, so it belongs in the opaque pass where it costs no sort and back-facing
// shops across the street are culled for free.
//
// The distance treatment is the LOD0 dither, not signage's intensity ramp. A shopfront has no LOD1
// counterpart to ramp INTO, and fading a lit panel by colour alone leaves a dark rectangle glued
// to the facade — the failure §3.5.4 already documents for box signs. `structureMaterial` reached
// the same conclusion for masts for the same reason.
export function shopMaterial(tex, noiseTex) {
  const m = new THREE.MeshBasicMaterial({
    map: tex, color: 0xffffff, side: THREE.FrontSide, fog: true, toneMapped: false,
  });
  patchShop(m);
  patchFog(m, 'opaque');
  if (noiseTex) patchFade(m, true, noiseTex);
  return m;
}

// ── S2-N. the road tunnel portal ───────────────────────────────────────────
//
// ONE QUAD IS A WHOLE PORTAL, on exactly the terms js/shops.js sets: an opaque panel standing a
// little off the building's ground-floor face, with the frame, the two sliding leaves and the
// dark shaft behind them all drawn per pixel inside it. One `Field`, one draw, no new texture.
//
// THE SHAFT IS A TUBE INTERSECTION, NOT A PARALLAX STACK. A shopfront's room is three planes
// because a room is a box you look INTO from outside; a tunnel is a box you look ALONG, and the
// thing that sells it is how far the eye gets before it hits a wall. So the view ray is
// re-expressed in the opening's own frame and intersected with the four walls of the bore
// analytically — one divide per axis — and the hit distance drives both the falloff and the lamp
// rings. Nothing is marched and nothing is sampled.
//
// IT IS DELIBERATELY VERY DARK. Aaron asked for "a dark tunnel", and a bore that is merely dim
// reads as a painted rectangle. The brightest thing in the opening is the lamp ring nearest the
// mouth and the two guide lines on the deck; everything else is under 0.05.
//
// THE DOOR IS THE INSTANCE'S OWN NUMBER, not a function of time. `iDoor` is written every frame
// by js/tunnels.js from the distance and direction of the vehicles on that line, so a 32 m
// transport takes as long to clear a doorway as it physically takes. A shader clock could only
// produce a door that opens on a schedule, which is what the brief rules out.

const TUNNEL_VERT_DECL = /* glsl */`
attribute vec4 iTun;         // (quad width m, quad height m, opening width m, opening height m)
attribute vec2 iDoor;        // (openness 0..1, seed)
attribute vec3 iGlow;        // the rim / lamp tint, linear
varying vec4 vTun;
varying vec2 vDoor;
varying vec3 vGlow;
varying vec2 vLocal;
varying vec3 vTanW;
varying vec3 vNorW;
`;

// The tangent frame comes off the instance matrix exactly as the shopfront's does: the quad is
// only ever yawed about Y, so local +X is the across-the-face axis and local +Z is the outward
// normal — which for a portal is the axis the vehicle drives down.
const TUNNEL_VERT_BODY = /* glsl */`
#include <begin_vertex>
  vTun = iTun; vDoor = iDoor; vGlow = iGlow; vLocal = uv;
  vTanW = normalize( instanceMatrix[0].xyz );
  vNorW = normalize( instanceMatrix[2].xyz );
`;

const TUNNEL_FRAG_DECL = /* glsl */`
varying vec4 vTun;
varying vec2 vDoor;
varying vec3 vGlow;
varying vec2 vLocal;
varying vec3 vTanW;
varying vec3 vNorW;
uniform vec4 uTunnel;
uniform float uDoorForce;
uniform float uNeon;

float tunHash( float a, float b ) { return fract( sin( a * 12.9898 + b * 78.233 ) * 43758.5453 ); }
`;

const TUNNEL_FRAG_BODY = /* glsl */`
  float qw = vTun.x, qh = vTun.y, ow = vTun.z, oh = vTun.w;
  float mx = ( vLocal.x - 0.5 ) * qw;     // metres across the face, 0 on the vehicle's own line
  float gy = vLocal.y * qh;               // metres up from the deck
  float sSeed = vDoor.y;
  float open = mix( vDoor.x, uDoorForce, step( 0.0, uDoorForce ) );

  float px = fwidth( mx );
  vec3 col;

  // ── the surround ────────────────────────────────────────────────────────
  // Poured concrete, a lit reveal hugging the bore, and a hazard band on the lintel. The reveal
  // is what stops the opening reading as a black decal glued to a wall: an edge that is LIT is an
  // edge with a thickness.
  float dIn = max( max( abs( mx ) - ow * 0.5, gy - oh ), -1.0 );   // >0 outside the bore
  {
    float grime = 0.5 + 0.5 * sin( gy * 2.1 + sSeed );
    // Cast concrete, a shade under the facade it is set into. It must not out-read the building:
    // the only NEW thing on this wall is meant to be the hole.
    vec3 conc = vec3( 0.062, 0.056, 0.054 ) * ( 0.78 + 0.26 * grime );
    // The reveal is a LINE, not the whole jamb. Lighting the full 0.35 m returns a fluorescent
    // rectangle sitting on the wall, which is precisely the "every light source is a sticker"
    // note six critics keep giving this project.
    float rim = 1.0 - smoothstep( 0.0, 0.09 + px, dIn );
    float band = 1.0 - smoothstep( 0.07, 0.19, abs( gy - ( oh + 0.42 ) ) );
    float chev = step( 0.5, fract( ( mx * 1.6 + gy * 1.1 ) / 0.9 ) );
    col = conc + vGlow * ( rim * 0.20 + band * ( 0.030 + 0.075 * chev ) );
  }

  if ( dIn <= 0.0 ) {
    // ── the bore ─────────────────────────────────────────────────────────
    vec3 V = normalize( vWorldPosition - cameraPosition );
    float dz = -dot( V, vNorW );
    float k = 1.0 / max( dz, 0.08 );
    float rx = dot( V, vTanW ) * k;        // metres across per metre of depth
    float ry = V.y * k;

    float bx = rx > 0.0 ? ( ow * 0.5 - mx ) / rx : ( rx < 0.0 ? ( -ow * 0.5 - mx ) / rx : 1e4 );
    float by = ry > 0.0 ? ( oh - gy ) / ry : ( ry < 0.0 ? -gy / ry : 1e4 );
    float tHit = clamp( min( bx, by ), 0.0, 46.0 );
    float onDeck = step( by, bx ) * step( ry, 0.0 );      // the ray went down and hit the road

    // Depth. Everything in the bore is under 0.06 and falls off hard — the tunnel must read as a
    // hole in a lit wall, not as a grey panel.
    float fall = exp( -tHit * 0.175 );
    vec3 bore = vec3( 0.0075, 0.0075, 0.0095 ) * fall;
    // The deck keeps a trace of the street's own sodium, which is what makes the floor legible.
    bore += vec3( 0.017, 0.012, 0.008 ) * onDeck * fall;
    // Lamp rings every 7 m. fwidth(tHit) dissolves them into their mean once they are closer
    // together than a pixel, the same discipline the window grid and the shop slats keep.
    float ring = 1.0 - smoothstep( 0.10, 0.34 + fwidth( tHit ) * 0.5, abs( fract( tHit / 7.0 + 0.5 ) - 0.5 ) * 7.0 );
    bore += vGlow * ring * fall * 0.105 * ( 1.0 - onDeck );
    // Two guide lines down the deck, at the kerbs of the bore.
    float guide = ( 1.0 - smoothstep( 0.05, 0.16, abs( abs( mx + rx * tHit ) - ow * 0.42 ) ) ) * onDeck;
    bore += vGlow * guide * fall * 0.055;

    // ── the leaves ───────────────────────────────────────────────────────
    // Two panels meeting on the vehicle's line, retracting into the jamb. open is metres of
    // travel expressed as a fraction of the half-opening, so the leading edge IS the animation.
    float lead = open * ow * 0.5;
    float onDoor = step( lead, abs( mx ) );
    if ( onDoor > 0.5 ) {
      float rib = 0.5 + 0.5 * cos( mx * 6.28318 / 0.42 );
      float ribV = 1.0 - smoothstep( 0.22, 0.55, px / 0.42 );
      // Darker at the head than at the sill: a shutter is lit by the street it faces, and a slab
      // of one value is the flat-panel read a critic calls a decal.
      vec3 leaf = vec3( 0.040, 0.042, 0.049 ) * mix( 1.0, 0.70 + 0.55 * rib, ribV )
                * ( 1.20 - 0.55 * clamp( gy / oh, 0.0, 1.0 ) );
      // a lit rail across the leaf, and the hazard flash on the leading edge
      leaf += vGlow * 0.11 * ( 1.0 - smoothstep( 0.05, 0.13, abs( gy - oh * 0.62 ) ) );
      float edge = 1.0 - smoothstep( 0.03, 0.10 + px, abs( abs( mx ) - lead ) );
      leaf += vGlow * edge * ( 0.20 + 0.22 * step( 0.02, open ) );
      // the gap the two leaves leave when shut, so a closed door still has a seam
      leaf *= mix( 1.0, 0.45, 1.0 - smoothstep( 0.0, 0.05 + px, abs( mx ) - lead ) );
      col = leaf;
    } else {
      col = bore;
    }
    // The threshold: a lit sill across the whole opening, in front of both leaves.
    col += vGlow * 0.085 * ( 1.0 - smoothstep( 0.04, 0.14, gy ) );
  }

  diffuseColor.rgb = col * uNeon * uTunnel.x;
`;

export function patchTunnel(mat) {
  mat.extensions = Object.assign({ derivatives: true }, mat.extensions);
  return addPatch(mat, 'tunnel', shader => {
    shader.uniforms.uTunnel = U.uTunnel;
    shader.uniforms.uDoorForce = U.uDoorForce;
    shader.uniforms.uNeon = U.uNeon;
    shader.vertexShader = patch(shader.vertexShader, '#include <common>',
      '#include <common>' + TUNNEL_VERT_DECL, 'tunnel/vert-decl');
    shader.vertexShader = patch(shader.vertexShader, '#include <begin_vertex>',
      TUNNEL_VERT_BODY, 'tunnel/vert-body');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>' + TUNNEL_FRAG_DECL, 'tunnel/frag-decl');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <map_fragment>',
      TUNNEL_FRAG_BODY, 'tunnel/frag-body');
  });
}

// Opaque, unlit, front faces only, DEPTH-WRITING — and the depth write is the point, not an
// incidental. The portal panel is what OCCLUDES a transport that has driven past it: the bore is
// painted, not modelled, so without a depth write you would see a bus through the back of the
// tunnel it just entered.
export function tunnelMaterial(noiseTex) {
  const m = new THREE.MeshBasicMaterial({
    color: 0xffffff, side: THREE.FrontSide, fog: true, toneMapped: false,
  });
  patchTunnel(m);
  patchFog(m, 'opaque');
  if (noiseTex) patchFade(m, true, noiseTex);
  return m;
}

// ── 8. the mirror term (§3.7b) ─────────────────────────────────────────────
//
// The mirrored buckets are the SOURCE materials' recipes with three changes: opacity 0.42, no
// depth write, and this — a fade with distance below the surface so the reflection does not run
// forever down into the floor. `vWorldPosition` is already a varying (the fog patch declares it)
// and the mirror group's own matrix carries the scale(1,-1,1), so for a mirrored instance
// vWorldPosition.y is exactly minus the source's height. No new varying, no new attribute.
//
// It is injected AFTER `#include <opaque_fragment>`, which is the one slot the sign, emissive and
// fog patches all leave alone — and it is before `<fog_fragment>`, so the fade and the haze
// compose the right way round.
export function patchMirror(mat, depth = 26, amount = 0.42) {
  const uD = { value: depth }, uA = { value: amount };
  mat.userData.uMirrorDepth = uD;
  mat.userData.uMirrorAmount = uA;
  mat.depthWrite = false;
  mat.depthTest = true;
  mat.transparent = true;
  return addPatch(mat, 'mirror', shader => {
    shader.uniforms.uMirrorDepth = uD;
    shader.uniforms.uMirrorAmount = uA;
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>\nuniform float uMirrorDepth;\nuniform float uMirrorAmount;', 'mirror/frag-decl');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <opaque_fragment>',
      '#include <opaque_fragment>\n'
      + '  gl_FragColor *= uMirrorAmount * ( 1.0 - smoothstep( 0.0, uMirrorDepth, -vWorldPosition.y ) );',
      'mirror/frag-body');
  });
}

// ── 9. the halo sprite (§4.4's LOW bloom substitute) ───────────────────────
//
// A second instanced draw of the sign / strip / strobe buffers as view-space quads carrying a 64²
// radial gradient. On a black frame this genuinely reads as bloom, because bloom on a black frame
// IS a halo around a point source.
//
// Three things it must get right:
//  - the SIZE comes from the source instance matrix, not from the geometry: the sprite quads share
//    the sign field's buffers but their own 1x1 plane, so the halo is `1.8 x the instance's
//    largest axis` (§4.4's 1.8, not the first draft's 2.5 — 3.24x area rather than 6.25x).
//  - it takes §3.2.2's SAME distance ramp as the source field. Without it the halo field outlives
//    the sign it is haloing by 77 m and you get glows around nothing.
//  - A STRIP IS NOT A POINT. §4.4 asks for one halo field per source field, but a 40 m edge strip
//    haloed as a 72 m radial sprite is not a bloom, it is a fog bank — measured: it washed the
//    whole LOW frame cyan. So the strips take the `tube` mode instead: the SOURCE box, fattened
//    only on its two thin axes, with the radial gradient stretched along the run. That is what a
//    bloomed tube actually looks like, and it costs the same one draw.
const HALO_SPRITE = /* glsl */`
  vec3 sc = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
  float sz = max( sc.x, max( sc.y, sc.z ) ) * uHaloScale;
  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );
  mvPosition.xy += position.xy * sz;
  gl_Position = projectionMatrix * mvPosition;
`;

// Grow every axis EXCEPT the longest, so the glow fattens the tube and does not lengthen it.
const HALO_TUBE = /* glsl */`
#include <begin_vertex>
  {
    vec3 sc = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
    float mx = max( sc.x, max( sc.y, sc.z ) );
    vec3 grow = mix( vec3( uHaloScale * 2.2 ), vec3( 1.0 ), step( mx * 0.999, sc ) );
    transformed *= grow;
  }
`;

export function patchHalo(mat, scale = 1.8, mode = 'sprite') {
  const uS = { value: scale };
  mat.userData.uHaloScale = uS;
  return addPatch(mat, 'halo:' + mode, shader => {
    shader.uniforms.uCamXZ = U.uCamXZ;
    shader.uniforms.uR0 = U.uR0;
    shader.uniforms.uNeon = U.uNeon;
    shader.uniforms.uHaloScale = uS;
    shader.vertexShader = patch(shader.vertexShader, '#include <common>',
      '#include <common>\nattribute vec3 iEmissive;\nattribute vec2 iChunk;\nattribute float iIntensity;\n'
      + 'uniform vec2 uCamXZ;\nuniform float uR0;\nuniform float uNeon;\nuniform float uHaloScale;\n'
      + 'varying vec3 vEmissive;\nvarying float vI;', 'halo/vert-decl');
    shader.vertexShader = patch(shader.vertexShader, '#include <begin_vertex>',
      '#include <begin_vertex>\n'
      + '  vEmissive = iEmissive;\n'
      + '  vI = iIntensity * uNeon * ( 1.0 - smoothstep( 0.85 * uR0, uR0, distance( uCamXZ, iChunk ) ) );',
      'halo/vert-body');
    if (mode === 'tube') {
      shader.vertexShader = patch(shader.vertexShader, '#include <begin_vertex>', HALO_TUBE, 'halo/tube');
    } else {
      shader.vertexShader = patch(shader.vertexShader, '#include <project_vertex>', HALO_SPRITE, 'halo/billboard');
    }
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying vec3 vEmissive;\nvarying float vI;', 'halo/frag-decl');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <map_fragment>',
      '  diffuseColor.rgb = vEmissive * vI;\n  diffuseColor.a *= texture2D( map, vMapUv ).a;',
      'halo/frag-body');
  });
}

// ── 10. rain (§2.2 weather.js, §3.8's 1 draw / 5,000 tris) ─────────────────
//
// Every drop is a view-space streak whose whole animation is one `fract()` in the vertex shader:
// no CPU particle loop, no per-frame buffer upload, no sort. The field is a unit cube of instance
// seeds that weather.js parks on the camera; `uRainBox` scales it and `uRainOrigin` moves it.
//
// The streak leans along the wind and stretches with fall speed, which is what stops rain reading
// as a screen-door of identical dashes.
const RAIN_VERT = /* glsl */`
  vec3 seed = iRnd;
  float speed = 26.0 + 14.0 * seed.z;
  // the cell coordinate, wrapped: one fract() is the entire simulation
  vec3 cell = vec3( seed.x, fract( seed.y - uTime * speed / uRainBox.y ), seed.z );
  vec3 wpos = uRainOrigin + ( cell - 0.5 ) * uRainBox + vec3( uWind.x, 0.0, uWind.y ) * cell.y * 3.0;
  vec4 mv = viewMatrix * vec4( wpos, 1.0 );
  // the streak: a thin quad, long in view-space Y, sheared by the wind in view space
  float len = uRainLen * ( 0.6 + 0.8 * seed.z );
  mv.xy += vec2( position.x * 0.024, position.y * len );
  // per-drop lean as well as the shared wind shear: a field in which every streak is parallel and
  // the same length is the single most obvious "rain overlay" tell there is.
  mv.x += position.y * len * ( uShear + ( seed.x - 0.5 ) * 0.16 );
  vec4 mvPosition = mv;
  gl_Position = projectionMatrix * mvPosition;
  // near drops are brighter than far ones purely by their seed, so the field has depth of its own
  // before the fog gets to it.
  vFade = 0.45 + 0.55 * seed.z;
`;

export function rainMaterial() {
  const u = {
    uRainOrigin: { value: new THREE.Vector3() },
    uRainBox: { value: new THREE.Vector3(160, 90, 160) },
    uWind: { value: new THREE.Vector2(0, 0) },
    uRainLen: { value: 1.5 },
    uShear: { value: 0.12 },
    uRainAmt: { value: 1 },
  };
  const m = new THREE.MeshBasicMaterial({
    color: 0x9fb0c8, transparent: true, opacity: 0.20, depthWrite: false,
    blending: THREE.NormalBlending, fog: true, toneMapped: false, side: THREE.DoubleSide,
    forceSinglePass: true,
  });
  m.userData.u = u;
  addPatch(m, 'rain', shader => {
    for (const k in u) shader.uniforms[k] = u[k];
    shader.uniforms.uTime = U.uTime;
    shader.vertexShader = patch(shader.vertexShader, '#include <common>',
      '#include <common>\nattribute vec3 iRnd;\nuniform vec3 uRainOrigin;\nuniform vec3 uRainBox;\n'
      + 'uniform vec2 uWind;\nuniform float uRainLen;\nuniform float uShear;\nuniform float uTime;\n'
      + 'varying float vFade;', 'rain/vert-decl');
    shader.vertexShader = patch(shader.vertexShader, '#include <project_vertex>', RAIN_VERT, 'rain/vert-body');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <common>',
      '#include <common>\nvarying float vFade;\nuniform float uRainAmt;', 'rain/frag-decl');
    shader.fragmentShader = patch(shader.fragmentShader, '#include <map_fragment>',
      '  diffuseColor.a *= vFade * uRainAmt;', 'rain/frag-body');
  });
  // §4.2.1: rain is an alpha material, so it takes the alpha termination — a drop 300 m away must
  // fade out, and `mix` toward the fog colour on a near-transparent quad would tint the haze.
  patchFog(m, 'alpha');
  return m;
}

// ── 11. distant fabric silhouettes (§3.9) ──────────────────────────────────
// Unlit near-black with fog on. Nothing else: they are shapes in the haze and the module's own
// kill criterion is that a critic calling them flat or cardboard deletes the file.
export function silhouetteMaterial(tex) {
  const m = new THREE.MeshBasicMaterial({
    map: tex, color: 0x070910, transparent: true, opacity: 1.0,
    depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    alphaTest: 0.35, fog: true, toneMapped: false,
  });
  patchFog(m, 'alpha');
  return m;
}

// §3.4's pitch rule. One window row is 3.6 m of world height and one column 3.2 m of world
// width, in EVERY LOD — this is the primary scale cue in the game (§3.10) and it costs nothing.
// Never scale the texture to fit the building.
export const ROW_M = 3.6, COL_M = 3.2;

export function uvScaleFor(worldW, worldH, cols, rows, out = [0, 0, 0]) {
  out[0] = worldW / COL_M / cols;
  out[1] = worldH / ROW_M / rows;
  out[2] = out[0];
  return out;
}

// The three-axis form the city uses: x and z get their OWN column scale, so a 120 x 80 m mass
// shows 3.2 m columns on both wall orientations rather than 3.2 on one and 4.8 on the other.
export function uvScale3(w, h, d, cols, rows, out = [0, 0, 0]) {
  out[0] = w / COL_M / cols;
  out[1] = h / ROW_M / rows;
  out[2] = d / COL_M / cols;
  return out;
}
