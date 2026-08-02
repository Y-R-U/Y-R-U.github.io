// Renderer, camera, lights and the sky. One place decides how expensive the
// frame is allowed to be, so a phone and a desktop run the same code path with
// different numbers.

import * as THREE from 'three';
import { LITE_MODE, IS_TOUCH, CAM } from './config.js';
import { profile } from './save.js';
import { clamp, lerp } from './utils.js';
import { emit } from './bus.js';

export let renderer = null;
export let scene = null;
export let camera = null;
export let sunLight = null;
export let hemiLight = null;
export let ambient = null;
export let fillLight = null;

export const quality = {
  shadows: true, pixelRatio: 1.5, scenery: 1, particles: 1,
  post: true, shadowMap: 2048, shadowSpan: 40, tier: 'high', blobs: false,
};

let skyMesh = null;
let skyUniforms = null;
let sunSprite = null;
let starField = null;
let container = null;
let vignetteScene = null;
let vignetteCam = null;
let blobGroup = null;
let blobs = null;

// ---------------------------------------------------------------------------
// The grade. Done inside tone mapping rather than in a post pass, so it costs a
// dozen ALU per pixel and nothing else — no render target, no second draw of the
// frame, which is what a phone actually cares about.
//
// ACES on its own eats exactly the saturation this art style lives on, so the
// curve gets a little chroma on the way in, an S on the way out, and a vibrance
// pass that lifts what is dull without touching what is already vivid.
// ---------------------------------------------------------------------------
// THE SHOULDER WAS EATING THE HERO CAR. ACES asymptotes to white early: a
// sunlit face of a white body arrives at the curve around 1.26 and a sunlit
// UP-face of the same body arrives at 0.95 — a third of a stop apart — and ACES
// handed back 0.879 and 0.793, which after the sRGB encode is 241 and 234.
// Seven levels. Both panels are on the shoulder, where the curve's log-slope is
// about 0.26, so five sixths of the difference between two faces of the same
// object was being thrown away before it reached the screen. That is what "you
// cannot tell where the form turns" means, and no amount of light-rig work
// fixes it, because the light rig was already handing over the right numbers.
//
// So the curve is a STRAIGHT LINE with a soft shoulder bolted on the end. Below
// the knee the log-slope is exactly 1: a third of a stop between two faces
// arrives as a third of a stop. The hero's own paint measures 226 up-face /
// 247 sun-side / 220 at forty-five degrees / 83 on a rear-facing panel / 93 in
// shade, so the terminator is 21 levels wide and the shade side still has
// colour in it.
//
// GAIN is the whole exposure decision and it is set against the tarmac, which
// is the largest surface in the frame and the value everything else is read
// against. 0.70, once noon's own 1.23 trim is on top of it, puts lit asphalt
// near 102 and the hero's brightest plane at 247, so the car has 145 levels of
// daylight between itself and the road it is standing on.
//
// KNEE is where the straight gives up. Above it the curve rolls off
// exponentially to 1.0, so nothing ever clips hard; below it nothing is touched
// at all. It sits at 0.84 rather than 0.72 because the rig underneath got
// brighter: at 0.72 the roll-off started level with a sunlit sheet of concrete,
// which is a surface the game has a great deal of, and compressing it was the
// difference between a wall that looks lit and one that looks painted. The only
// things above 0.84 now are genuinely blown — a white panel square to the sun,
// a cloud top, a road marking — and those are meant to clip. The shipped
// reference clips too: its 99th percentile is 252.
const GRADE_GLSL = `
vec3 CustomToneMapping( vec3 color ) {
  color *= toneMappingExposure;

  // A little chroma before the curve, so highlights keep their hue through it.
  // Walked back from 1.06: at 1.06 a saturated green's blue channel was being
  // pushed negative and clamped to zero before the curve had even run.
  float l = dot( color, vec3( 0.2125, 0.7154, 0.0721 ) );
  color = max( vec3( 0.0 ), mix( vec3( l ), color, 1.035 ) );

  const float GAIN = 0.70;
  const float KNEE = 0.84;
  vec3 y = color * GAIN;
  vec3 shoulder = 1.0 - ( 1.0 - KNEE ) * exp( -( y - KNEE ) / ( 1.0 - KNEE ) );
  color = clamp( mix( y, shoulder, step( vec3( KNEE ), y ) ), 0.0, 1.0 );

  // The S still widens the middle, but it is a fifth of what it was: the curve
  // in front of it no longer compresses, so this is seasoning rather than a
  // rescue, and a strong S on a straight curve only crushes the shadows again.
  color = mix( color, color * color * ( 3.0 - 2.0 * color ), 0.15 );

  // Shadow lift, aimed at NEUTRAL darks only. This has now been walked down
  // twice. It began life four times this strong, to rescue an asphalt that had
  // "an albedo no light rig can save"; the asphalt turned out to be fine and
  // the road was simply receiving no sun at all (see buildRoad in trackmesh.js).
  // The lift was compensating for that bug, and it did it by adding MORE to a
  // shadowed pixel than to a lit one — which is precisely how you flatten a
  // shadow into nothing. What is left is a hair, only so a tyre keeps a hint of
  // form instead of going to a flat 0,0,0 hole.
  float mn = min( color.r, min( color.g, color.b ) );
  float mx = max( color.r, max( color.g, color.b ) );
  float neutral = 1.0 - clamp( ( mx - mn ) * 7.0, 0.0, 1.0 );
  color += vec3( 0.0008 + 0.0018 * neutral ) * ( 1.0 - smoothstep( 0.0, 0.08, mx ) );

  // Vibrance, not saturation, and keyed on RELATIVE chroma. It used to test
  // ( mx - mn ) in absolute terms, which on a dark surface is a small number
  // however saturated the surface is — so the grass, whose channels sit at
  // roughly 0.08/0.14/0.02, was read as "dull, needs help" and got a 28% boost
  // that drove its blue channel straight through zero. A yellow-green smear
  // with no blue in it at all is not a terrain, it is a broken vertex colour,
  // and it was this line making it. Dividing by mx asks the right question:
  // how saturated is this colour FOR ITS OWN BRIGHTNESS.
  l = dot( color, vec3( 0.2125, 0.7154, 0.0721 ) );
  mn = min( color.r, min( color.g, color.b ) );
  mx = max( color.r, max( color.g, color.b ) );
  float sat = ( mx - mn ) / max( mx, 0.02 );
  float vib = 0.36 * ( 1.0 - clamp( sat * 1.7, 0.0, 1.0 ) );
  color = clamp( mix( vec3( l ), color, 1.0 + vib ), 0.0, 1.0 );
  return color;
}`;

let GRADE_OK = false;
(function installGrade() {
  const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
  const stub = /vec3\s+CustomToneMapping\s*\(\s*vec3\s+color\s*\)\s*\{\s*return\s+color;\s*\}/;
  if (typeof chunk === 'string' && stub.test(chunk)) {
    THREE.ShaderChunk.tonemapping_pars_fragment = chunk.replace(stub, GRADE_GLSL.trim());
    GRADE_OK = true;
  }
})();

// ---------------------------------------------------------------------------
// Environments — each track picks one. `grade` values are also read by the HUD
// so the broadcast overlay matches the light.
//
// `cloud` is [coverage, opacity, lit colour, shadow colour, drift, scale] and
// `glow` is [colour, strength] for the halo around the sun. A night or neon
// track gets thin dark cloud lit by whatever is in its own sky, never fluffy
// white cumulus.
//
// THE SUN VECTOR IS THE ART DIRECTION, AND ITS THREE COMPONENTS ARE THE THREE
// VALUES YOU GET. A flat-shaded box hands the key three dot products — one per
// visible face — and those dot products ARE the sun direction's components. So
// the spread between sunPos[0], sunPos[1] and sunPos[2] is, quite literally, the
// spread between the values on the box's side, top and end.
//
// Noon used to run [0.62, 0.50, 0.40]: normalised, 0.70 / 0.56 / 0.45. A ratio
// of 1.55 : 1.25 : 1 across the three faces, which after a tone curve that
// compresses everything above half is 12 levels between an upward face and a
// face pointed at the lens. That is the "recolour it orange and you get a flat
// orange truck" complaint, and no amount of shadow work fixes it because it is
// not about shadows: a surface's value was not tracking its normal.
//
// The vectors below are all reshaped the same way — most of the horizontal
// pushed onto ONE axis, the third component cut to a fifth of the first. Noon is
// now 0.80 / 0.57 / 0.19, a ratio of 4.3 : 3.0 : 1, and the same white body that
// used to span 172-226 across three orientations now spans 83-240. Elevation is
// left exactly where it was (34.6 degrees against 34) so the shadows are as long
// as they were and land in the same places; only the AZIMUTH moved, and it moved
// off the lens axis, which is what opens the third value up.
//
// FILL IS SPENT AGAINST THAT SPREAD, AND WHAT MATTERS IS THE RATIO, NOT THE
// NUMBER. Every unit of hemisphere, ambient and counter-key is a constant added
// to all three faces, so what decides whether an object is faceted or flat is
// fill DIVIDED BY key. An early pass ran 0.42 + 0.05 + 0.24 against a key of
// 3.35 — a floor at 29% of the key, which is a grey undercoat on every surface
// in the game.
//
// Cutting the floor is only half of the answer and on its own it is the wrong
// half: a first attempt here took hemi to 0.17 and the whole circuit came back
// two stops down, with the tarmac measuring 45 against a shipped reference's
// 100 and the buildings on the horizon at 29. Dark is not the same thing as
// contrasty.
//
// THEN THE OPPOSITE MISTAKE. Key 5.2 against hemi 0.34 / amb 0.06 / fill 0.19
// is a floor at 7% of the key, and it measured like this: 0.02% of the frame
// above 200 against the reference's 13%, a peak of 236, and a red flank falling
// from 220 in the sun to 46 in shade — the same value as the black bumper next
// to it, so the bottom two thirds of the car fused into one dark shape. A
// terminator with no ambient fill is not better than no terminator; it is the
// same failure upside down, and a blind read of it came back "nothing in this
// image is sunlit, the whole thing is ambient".
//
// So BOTH ends move. Key 5.2 → 6.3, and the sky fill — hemisphere, which is
// blue and comes from above, not white and from nowhere — 0.34 → 1.25, with the
// cool counter-key doubled to 0.38. That is a floor at 21% of the key: high
// enough that a shaded white panel reads 113 instead of 63 and a shaded red one
// keeps (73,19,17) instead of collapsing to neutral, and low enough that the
// hero still spans 93 in shade to 247 in the sun. Because the fill is SKY
// COLOURED, everything the sun misses goes blue rather than grey, which is what
// a shadow outdoors actually does — the hero's shade side lands on (78,95,115),
// a blue panel, not a grey one.
//
// The last of the lift is noon's `expo`, 1.0 -> 1.23. It is spent there rather
// than on the key because it moves the SKY as well, and the sky is a shader
// colour no light touches; raising only the rig lifts the cars off a backdrop
// that stays where it was.
//
// Props reading as black cut-outs is an ALBEDO problem — see buildProps — and
// it is fixed there, not by pouring counter-key over the whole circuit.
//
// SUN ELEVATION IS A COMPOSITION CONTROL, not a time of day. Noon used to sit
// at 44 degrees, which throws a shadow barely as long as the thing casting it —
// so a tree's shadow stayed on the grass under the tree and the gantry's stayed
// under the gantry, and the road came back empty. At 31 degrees the same tree
// throws 1.6x its own height and the band lands ACROSS the tarmac, which is the
// only place a shadow is worth paying for. The azimuth is pushed off the track
// axis for the same reason: a sun straight down the road puts every shadow
// behind its object where the camera cannot see it.
//
// `horizon` is [colour, strength] and it is the frame's WARM MASS on the tracks
// that have no other source of one. A circuit made of green grass, grey road,
// lavender hills and blue sky is 100% cool, and cool cars sitting on a cool
// ground have nothing to sit AGAINST. The band is mixed in over the bottom of
// the sky dome only, so it warms the horizon the whole way round without
// touching the zenith — and a night or neon track sets its own, so nothing
// turns beige that should not.
//
// Daylight skies are also pulled down off white. Sky, cloud, the player's white
// car, white debris and the speech bubbles were all sitting in one value band,
// so the hero car had no figure-ground separation from its own background.
//
// Fog is set FAR. It was near enough (420m) that the horizon ring — mountains,
// skyline, distant stands — got mixed a fifth of the way to sky colour and the
// whole back of the frame lifted to one milky value. Everything beyond the
// circuit is meant to be a darker silhouette against the sky, not a paler one.
// ---------------------------------------------------------------------------
export const ENVIRONMENTS = {
  // `expo` is a per-environment trim on top of the grade's own GAIN. The grade
  // takes about a fifth off everything compared with the ACES version it
  // replaced — which is what noon wanted — so the environments that were
  // already dark get most of it handed back here rather than by softening the
  // curve, which would put the highlight compression straight back.
  noon: {
    name: 'HIGH NOON', top: 0x2f7ce2, bottom: 0x96c8ee, fog: 0xb5b4a2, fogNear: 640, fogFar: 2500,
    sun: 0xfff3d8, sunPos: [0.86, 0.61, 0.20], sunI: 6.3, hemi: [0x9ec6f0, 0x7a6a46, 1.25], amb: 0.07,
    ground: 0x6ca23e, stars: 0, grade: '#0d1116', expo: 1.23,
    fill: [0x8fb2e8, 0.38], glow: [0xfff0cf, 0.4],
    horizon: [0xe4cb9c, 0.40],
    cloud: [0.40, 1.0, 0xc6d3e2, 0x74899f, 0.0042, 0.95],
  },
  dusk: {
    name: 'GOLDEN HOUR', top: 0x2c46a4, bottom: 0xf2842f, fog: 0xd97b3f, fogNear: 300, fogFar: 1400,
    sun: 0xffae52, sunPos: [-0.90, 0.36, -0.20], sunI: 6.4, hemi: [0xe8a074, 0x5c4c3a, 1.00], amb: 0.07,
    ground: 0x79643a, stars: 0.22, grade: '#1a0f14', expo: 1.12,
    fill: [0x5d78bc, 0.32], glow: [0xffb469, 1.1],
    horizon: [0xffa958, 0.5],
    cloud: [0.55, 1.0, 0xe0b086, 0x54384e, 0.0035, 0.9],
  },
  night: {
    name: 'FLOODLIT NIGHT', top: 0x04061a, bottom: 0x122448, fog: 0x0e1c38, fogNear: 200, fogFar: 900,
    sun: 0x9cb4ff, sunPos: [0.62, 0.76, -0.22], sunI: 4.8, hemi: [0x33487f, 0x161b28, 0.80], amb: 0.07,
    ground: 0x252b38, stars: 1, grade: '#04060c', neon: true, expo: 1.26,
    fill: [0x5f7cd0, 0.34], glow: [0xaebfff, 0.28],
    horizon: [0x22375e, 0.4],
    cloud: [0.44, 0.66, 0x3d4f78, 0x151d33, 0.0022, 0.8],
  },
  storm: {
    name: 'THUNDERHEAD', top: 0x171c25, bottom: 0x475464, fog: 0x495667, fogNear: 180, fogFar: 820,
    sun: 0xc8d4e2, sunPos: [-0.78, 0.56, 0.22], sunI: 5.9, hemi: [0x76869a, 0x424852, 1.00], amb: 0.10,
    ground: 0x4a5744, stars: 0, grade: '#0a0d12', rain: true, expo: 1.16,
    fill: [0x8fa6c4, 0.42], glow: [0xdfe8f2, 0.3],
    horizon: [0x7d7a6e, 0.34],
    cloud: [0.86, 1.0, 0x76859a, 0x1f2430, 0.0075, 0.75],
  },
  dawn: {
    name: 'COLD DAWN', top: 0x3a6fbc, bottom: 0xe2a37c, fog: 0xd4a88f, fogNear: 520, fogFar: 2100,
    sun: 0xffd6b6, sunPos: [0.88, 0.53, 0.22], sunI: 6.2, hemi: [0xa8c4ea, 0x7a7050, 1.22], amb: 0.07,
    ground: 0x829a5e, stars: 0.14, grade: '#0e1219', expo: 1.08,
    fill: [0x7ba0e8, 0.40], glow: [0xffd0a8, 0.8],
    horizon: [0xecb887, 0.42],
    cloud: [0.54, 1.0, 0xdcbaa2, 0x5e5a72, 0.0032, 0.9],
  },
  neon: {
    name: 'NEON STRIP', top: 0x0c0428, bottom: 0x431060, fog: 0x30104c, fogNear: 190, fogFar: 860,
    sun: 0xff7ade, sunPos: [-0.80, 0.62, 0.18], sunI: 5.2, hemi: [0x8a4ed4, 0x1e162c, 0.95], amb: 0.10,
    ground: 0x241839, stars: 0.75, grade: '#0a0418', neon: true, expo: 1.30,
    fill: [0x36d0ff, 0.50], glow: [0xff86e4, 0.8],
    horizon: [0x5e1a86, 0.42],
    cloud: [0.48, 0.78, 0x8f43b8, 0x25113f, 0.0026, 0.85],
  },
  dust: {
    name: 'DUST BOWL', top: 0x8a642c, bottom: 0xdcae64, fog: 0xcda368, fogNear: 150, fogFar: 700,
    sun: 0xffdda0, sunPos: [0.84, 0.57, -0.18], sunI: 6.0, hemi: [0xdcc294, 0x8a7754, 1.28], amb: 0.09,
    ground: 0xa8854c, stars: 0, grade: '#150f08', haze: true, expo: 1.10,
    fill: [0xd8b98a, 0.36], glow: [0xffe0a8, 0.85],
    horizon: [0xe8c489, 0.45],
    cloud: [0.40, 0.72, 0xd8bd90, 0x8c6a3e, 0.0055, 0.8],
  },
};

// ---------------------------------------------------------------------------
// Device tiers.
//
// The old rule was `!IS_TOUCH && cores >= 8 ? 'high' : 'low'`, which put every
// touch device — an S22 Ultra included — on the same path as a budget handset:
// no shadows, half the scenery, half the particles. A 2022 flagship has an
// Adreno 730 in it and can carry a 1024 shadow map without noticing.
//
//   high    desktop / current flagship — 2048 map, everything on
//   medium  S22-Ultra class — 1024 map over a tighter box, full scenery
//   low     genuinely weak hardware — no shadow map, blob contact shadows
// ---------------------------------------------------------------------------
// The span is the half-width of the shadow box in metres, and it decides two
// things at once: how sharp a shadow is, and WHICH THINGS ARE IN IT AT ALL.
// The second one was being lost. ±25 on the medium tier is a box 50m across,
// and the roadside trees sit 24-58m out from the centreline — so on the tier
// the game actually ships to a phone, not one tree was inside the shadow
// camera and the frame came back with a car shadow and nothing else. A box has
// to be wide enough to contain the things whose shadows are meant to fall into
// frame, and on a 20m road with trees down both sides that is ±40, not ±25.
//
// The cost is texel size, so the medium map goes up to compensate: 1536 over
// ±40 is 5.2cm a texel, near-identical to the 4.9cm the old 1024/±25 gave, and
// a 1536 depth target is nothing to an Adreno 730. A car is 4.5m long, so its
// own shadow is still ~86 texels and holds a corner.
const TIERS = {
  high:   { shadows: true,  shadowMap: 2048, shadowSpan: 40, maxDpr: 2,    scenery: 1,    particles: 1,    post: true,  cloudOct: 4 },
  medium: { shadows: true,  shadowMap: 1536, shadowSpan: 40, maxDpr: 1.5,  scenery: 1,    particles: 0.85, post: true,  cloudOct: 4 },
  low:    { shadows: false, shadowMap: 0,    shadowSpan: 40, maxDpr: 1.35, scenery: 0.55, particles: 0.5,  post: false, cloudOct: 3 },
};

const TIER_ARG = (() => {
  try { return new URLSearchParams(location.search).get('tier') || ''; } catch (e) { return ''; }
})();

const DEV_HOOK = (() => {
  try { return new URLSearchParams(location.search).get('dev') === '1'; } catch (e) { return false; }
})();

function detectTier() {
  if (LITE_MODE) return 'low';
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || (IS_TOUCH ? 4 : 8);
  if (!IS_TOUCH) return cores >= 8 ? 'high' : 'medium';
  // Phones. Core count alone says nothing — budget chips ship eight of them —
  // so memory is the tie-breaker, and it is the one signal that tracks the
  // whole SoC rather than just the CPU.
  if (cores >= 6 && mem >= 6) return 'medium';
  if (cores >= 8 && mem >= 4) return 'medium';
  return 'low';
}

export function decideQuality() {
  const setting = profile.settings.quality;
  let tier;
  if (TIER_ARG && TIERS[TIER_ARG]) tier = TIER_ARG;
  else if (setting === 'high' || setting === 'medium' || setting === 'low') tier = setting;
  else tier = detectTier();
  if (LITE_MODE) tier = 'low';

  const t = TIERS[tier] || TIERS.medium;
  quality.tier = tier;
  quality.shadows = t.shadows;
  quality.shadowMap = t.shadowMap;
  quality.shadowSpan = t.shadowSpan;
  quality.pixelRatio = Math.min(devicePixelRatio, t.maxDpr);
  quality.scenery = t.scenery;
  quality.particles = t.particles;
  quality.post = t.post;
  quality.blobs = !t.shadows;
  return quality;
}

const SHADOW_DIST = 150;    // how far up the light sits from the box centre
const SHADOW_LEAD = 16;     // push the box ahead of the eye, along the view

export function initRenderer(mount) {
  container = mount;
  decideQuality();

  renderer = new THREE.WebGLRenderer({
    antialias: quality.tier !== 'low',
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = GRADE_OK ? THREE.CustomToneMapping : THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  if (quality.shadows) {
    renderer.shadowMap.enabled = true;
    // PCF, not PCFSoft and not Basic. Soft is a wide tent that smears the edge
    // over several texels and turns a shadow into an airbrushed smudge on the
    // road; Basic is a single tap, which on a chase camera three metres off the
    // bumper gives a visible sawtooth along every diagonal. PCF's one texel of
    // bilinear is exactly the amount of give that reads as a hard edge without
    // the stair-stepping.
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }
  mount.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x7fb2d8, 420, 1750);

  camera = new THREE.PerspectiveCamera(CAM.fov, window.innerWidth / window.innerHeight, 0.4, 4000);
  camera.position.set(0, 12, 30);

  // Ambient stays low — flat fill is what makes low-poly read as plastic. The
  // sense of "sky above, bounce below" comes from the hemisphere instead.
  ambient = new THREE.AmbientLight(0xffffff, 0.07);
  scene.add(ambient);

  hemiLight = new THREE.HemisphereLight(0x9ec6f0, 0x7a6a46, 1.25);
  scene.add(hemiLight);

  sunLight = new THREE.DirectionalLight(0xfff3d8, 6.3);
  sunLight.position.set(258, 162, 60);
  if (quality.shadows) {
    const d = quality.shadowSpan;
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(quality.shadowMap, quality.shadowMap);
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    // The light sits SHADOW_DIST above the box centre, so near/far only have to
    // straddle that. Keeping the slab thin is free precision: a 240m range over
    // a packed-depth target leaves the bias room to be tiny.
    sunLight.shadow.camera.near = 30;
    sunLight.shadow.camera.far = 270;
    // Both biases are a compromise between acne and peter-panning, and the one
    // that matters here is peter-panning: a contact shadow that has slid off
    // its own tyres is worse than no shadow, because it reads as a stain on the
    // road rather than as the car touching it. normalBias in particular is a
    // world-space push ALONG THE NORMAL, so 3cm on a road whose normal is
    // straight up is 3cm of daylight under every wheel. 1.2cm is enough to keep
    // the flat road clean and small enough that the tyres stay planted.
    sunLight.shadow.bias = -0.0002;
    sunLight.shadow.normalBias = 0.012;
    sunLight.shadow.camera.updateProjectionMatrix();
  }
  scene.add(sunLight);
  scene.add(sunLight.target);

  // Cool counter-key. One extra dot product per fragment, and it is the whole
  // reason a shadowed flank still reads as a separate surface instead of black.
  fillLight = new THREE.DirectionalLight(0x8fb2e8, 0.38);
  fillLight.position.set(-140, 90, -160);
  scene.add(fillLight);

  // ?dev=1 hands the light rig out so a headless run can prove a shadow is
  // really there — render twice with sunLight.castShadow toggled and diff the
  // two readPixels. Screenshots alone cannot tell a cast shadow from a dark
  // patch of tarmac, and two rounds of critique were spent on exactly that.
  if (DEV_HOOK) window.__rr = () => ({ renderer, scene, camera, sunLight, hemiLight, ambient, fillLight, quality, THREE });
  buildSky();
  buildVignette();
  buildBlobs();
  window.addEventListener('resize', onResize, { passive: true });
  onResize();
  watchContext();
  return renderer;
}

// ---------------------------------------------------------------------------
// Surviving a trip to the home screen
// ---------------------------------------------------------------------------
// A phone browser drops the WebGL context whenever it wants — backgrounding the
// tab is the usual one, and a game holding a shadow map, a sky shader and eight
// cars' worth of geometry is exactly what it drops first.
//
// None of this was handled at all, and the *default* behaviour of the lost
// event is that the context is never restorable. So minimising the game and
// coming back left three.js issuing GL calls into a dead context forever: the
// HUD is DOM so it kept drawing, and everything behind it was black. That is
// the "came back to most of the screen black".
//
// `preventDefault()` is the whole fix for the restore path — three.js
// reinitialises its own GL state on `webglcontextrestored` and re-uploads
// geometries and textures lazily — but the frame loop must not run while the
// context is down, and a couple of phones only ever restore after a resize.
let contextLost = false;
export const isContextLost = () => contextLost;

function watchContext() {
  const canvas = renderer.domElement;
  canvas.addEventListener('webglcontextlost', (e) => {
    // Without this the browser will NOT restore the context, ever.
    e.preventDefault();
    contextLost = true;
    console.warn('[foulplay] WebGL context lost — waiting for restore');
    emit('render:contextLost', {});
  }, false);

  canvas.addEventListener('webglcontextrestored', () => {
    contextLost = false;
    console.warn('[foulplay] WebGL context restored');
    // The drawing buffer comes back at whatever size the browser feels like,
    // and shadow maps have to be told to redraw at least once.
    onResize();
    if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
    emit('render:contextRestored', {});
  }, false);
}

// Called when the tab comes back. iOS in particular hands the canvas back at
// the wrong size after the address bar has been in and out, which on its own
// leaves a black band down the side of an otherwise live picture.
export function refreshAfterResume() {
  if (!renderer) return;
  onResize();
  if (renderer.shadowMap) renderer.shadowMap.needsUpdate = true;
}

function onResize() {
  if (!renderer) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  // Portrait phones need a wider vertical view or the road vanishes.
  camera.fov = h > w ? CAM.fov + 12 : CAM.fov;
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Sky dome: gradient + sun glow + an FBM cloud deck, all in one shader on one
// inverted sphere. No textures, no extra draw calls, and the cloud branch is
// driven by a uniform so a clear track pays nothing for it.
// ---------------------------------------------------------------------------
const SKY_VERT = `
varying vec3 vWorld;
void main() {
  vWorld = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = `
uniform vec3 topColor;
uniform vec3 bottomColor;
uniform vec3 cloudColor;
uniform vec3 cloudShade;
uniform vec3 glowColor;
uniform vec3 horizonColor;
uniform float horizonStrength;
uniform vec3 sunDir;
uniform float offset;
uniform float expo;
uniform float time;
uniform float cloudCover;
uniform float cloudOpacity;
uniform float cloudScale;
uniform float cloudSpeed;
uniform float glowStrength;
varying vec3 vWorld;

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < CLOUD_OCT; i++) {
    s += a * vnoise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec3 dir = normalize(vWorld);
  float h = normalize(vWorld + vec3(0.0, offset, 0.0)).y;
  float t = pow(max(h, 0.0), expo);
  vec3 col = mix(bottomColor, topColor, t);

  // The warm mass. Mixed in against the gradient BEFORE the clouds and the sun
  // glow, so a cloud deck still reads as cloud over it rather than as a stain.
  // The band is squared so it is a horizon, not a wash: at 20 degrees up it is
  // already down to a tenth.
  if (horizonStrength > 0.002) {
    float hz = 1.0 - clamp(abs(dir.y) * 3.2, 0.0, 1.0);
    col = mix(col, horizonColor, hz * hz * horizonStrength);
  }

  float sd = max(dot(dir, sunDir), 0.0);
  col += glowColor * glowStrength * (pow(sd, 9.0) + pow(sd, 2.5) * 0.09);

  if (cloudOpacity > 0.002) {
    float up = max(dir.y, 0.0);
    vec2 uv = dir.xz / (up + 0.10) * cloudScale + vec2(time * cloudSpeed, time * cloudSpeed * 0.32);
    float n = fbm(uv);
    float thr = 1.0 - cloudCover;
    // A tight ramp gives a defined edge. A wide one gives you back the grey
    // smear the plain gradient sky already had.
    float dens = smoothstep(thr, thr + 0.13, n);
    dens *= smoothstep(0.004, 0.075, dir.y);
    float lit = smoothstep(thr + 0.02, thr + 0.30, n);
    vec3 cc = mix(cloudShade, cloudColor, lit);
    cc += glowColor * glowStrength * pow(sd, 4.0) * 0.45;
    col = mix(col, cc, dens * cloudOpacity);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function buildSky() {
  const geo = new THREE.SphereGeometry(1800, 32, 20);
  const oct = (TIERS[quality.tier] || TIERS.medium).cloudOct;
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    defines: { CLOUD_OCT: oct },
    uniforms: {
      topColor: { value: new THREE.Color(0x1a51b4) },
      bottomColor: { value: new THREE.Color(0x6ba6d8) },
      cloudColor: { value: new THREE.Color(0xffffff) },
      cloudShade: { value: new THREE.Color(0xa8bfd6) },
      glowColor: { value: new THREE.Color(0xfff0cf) },
      horizonColor: { value: new THREE.Color(0xdcc49a) },
      horizonStrength: { value: 0.38 },
      sunDir: { value: new THREE.Vector3(0.55, 0.70, 0.45).normalize() },
      offset: { value: 260 },
      expo: { value: 0.8 },
      time: { value: 0 },
      cloudCover: { value: 0.52 },
      cloudOpacity: { value: 1 },
      cloudScale: { value: 0.95 },
      cloudSpeed: { value: 0.0042 },
      glowStrength: { value: 0.45 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  skyUniforms = mat.uniforms;
  skyMesh = new THREE.Mesh(geo, mat);
  // Drawn LAST in the opaque pass, not first. The cloud FBM is the most
  // expensive fragment in the frame, and this way early-z throws away every sky
  // pixel the world is already standing in front of — typically two thirds.
  skyMesh.renderOrder = 900;
  skyMesh.frustumCulled = false;
  scene.add(skyMesh);

  // Sun/moon disc, parked on the light direction.
  const sunMat = new THREE.SpriteMaterial({
    map: discTexture(),
    color: 0xfff2cf,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
  });
  sunSprite = new THREE.Sprite(sunMat);
  sunSprite.scale.set(150, 150, 1);
  sunSprite.renderOrder = -9;
  scene.add(sunSprite);

  // Stars — one buffer, faded in per environment.
  const N = 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const u = Math.random() * Math.PI * 2;
    const v = Math.random() * 0.85 + 0.06;
    const r = 1500;
    pos[i * 3] = Math.cos(u) * Math.sin(v * Math.PI) * r;
    pos[i * 3 + 1] = Math.abs(Math.cos(v * Math.PI)) * r * 0.9 + 60;
    pos[i * 3 + 2] = Math.sin(u) * Math.sin(v * Math.PI) * r;
  }
  const sgeo = new THREE.BufferGeometry();
  sgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  starField = new THREE.Points(sgeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false,
  }));
  starField.renderOrder = -9;
  starField.frustumCulled = false;
  scene.add(starField);
}

function discTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,244,214,0.85)');
  grad.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A multiply quad over the finished frame. One fullscreen blend, no render
// target, no resolve — the cheapest honest vignette there is. Off on low.
function buildVignette() {
  if (!quality.post) return;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  // Softer than it was. A vignette is worth about a stop at the very corner and
  // no more; at 0.55 it was taking a visible bite out of the near tarmac, which
  // is the surface whose value the whole frame is measured against, and it did
  // it strongest exactly where the player's own car sits.
  const grad = g.createRadialGradient(64, 64, 26, 64, 64, 92);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.6, 'rgba(226,229,236,0.10)');
  grad.addColorStop(1, 'rgba(168,176,198,0.28)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;

  const quad = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({
      map: tex,
      blending: THREE.MultiplyBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    })
  );
  quad.frustumCulled = false;
  vignetteScene = new THREE.Scene();
  vignetteScene.add(quad);
  vignetteCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

// ---------------------------------------------------------------------------
// Contact shadows — ONE QUAD PER CAR, AND IT RUNS ON EVERY TIER.
//
// This used to be the low tier's stand-in for the shadow map and nothing else,
// which left the two tiers that DO have a shadow map with the exact defect the
// map cannot fix. A 1536-texel map spread over an 80m box is a 5cm texel, so
// the shadow under a car is correct to about a wheel's width — and a shadow
// that is correct to a wheel's width has no wheel in it. The car reads as
// hovering, and the kerb stripe runs on under the front bumper at full
// saturation because there is nothing tight enough to break it.
//
// So the quad is now an occlusion patch rather than a fake shadow: four small
// hard-edged lobes where the tyres meet the road, plus a weak body core, and
// nothing at all in between. It ADDS to the mapped shadow where they overlap
// (which is what a contact shadow is) and it is the only shadow on the low
// tier, so the strength is set per environment against whether the map is on.
//
// Fourteen alpha quads sharing one 64px texture and one material is about as
// cheap as a feature gets, and they inherit the car's own orientation so they
// stay flat on a banked corner and stay glued through a loop.
// ---------------------------------------------------------------------------
const BLOB_MAX = 14;
const BLOB_DROP = 0.52;     // metres below a car's origin the road sits
let blobRoots = [];
let blobScan = 0;

// Wheel centres as a fraction of the 5.0 x 3.4 quad. A blurred radial blob
// under the whole car is a smudge; four tight ones are a car standing on four
// tyres, and the near pair are the ones that cut the kerb.
// u runs across the car (2.6m of quad), v runs along it (4.8m). A car is about
// 2.0 x 4.5 with its wheels at +-0.85 and +-1.5, which is where these land.
const TYRE_UV = [[0.18, 0.19], [0.18, 0.81], [0.82, 0.19], [0.82, 0.81]];
const BLOB_LEN = 4.8;

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  // Body core: weak and wide, so the car is not a cut-out floating over its own
  // four dots. Deliberately well under the tyre value.
  const body = g.createRadialGradient(32, 32, 2, 32, 32, 21);
  body.addColorStop(0, 'rgba(0,0,0,0.26)');
  body.addColorStop(0.55, 'rgba(0,0,0,0.15)');
  body.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = body;
  g.fillRect(0, 0, 64, 64);
  // Tyres: near-black at the patch, gone within a tyre's width. Kept tight on
  // purpose — a wide soft one is a smudge that has slid off its own wheels, and
  // a shadow that is not exactly where the rubber is reads as a stain.
  for (const [u, v] of TYRE_UV) {
    const x = u * 64, y = v * 64;
    const t = g.createRadialGradient(x, y, 0.5, x, y, 8);
    t.addColorStop(0, 'rgba(0,0,0,1)');
    t.addColorStop(0.34, 'rgba(0,0,0,0.88)');
    t.addColorStop(0.60, 'rgba(0,0,0,0.36)');
    t.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = t;
    g.fillRect(x - 9, y - 9, 18, 18);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

function buildBlobs() {
  const mat = new THREE.MeshBasicMaterial({
    map: blobTexture(),
    color: 0x000000,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    toneMapped: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  // Long axis along the car, not across it. The old quad was 5.0 wide by 3.4
  // long — a car's footprint turned ninety degrees — so its "wheels" would have
  // sat out past the arches on one axis and inside the wheelbase on the other.
  const geo = new THREE.PlaneGeometry(2.6, BLOB_LEN);
  geo.rotateX(-Math.PI / 2);   // bake the lie-flat into the geometry
  blobGroup = new THREE.Group();
  blobs = [];
  for (let i = 0; i < BLOB_MAX; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.visible = false;
    m.frustumCulled = false;
    m.renderOrder = 2;
    blobs.push(m);
    blobGroup.add(m);
  }
  scene.add(blobGroup);
}

// Anything that stands on the road wants grounding, but this file must not need
// to know what a car is. So: descend until a subtree is car-SHAPED — a handful
// of meshes inside a box a few metres long and about a metre and a half tall —
// and take that.
//
// This used to test `castShadow` instead of the shape, which meant the blob
// fallback could never fire: carfactory sets castShadow from quality.shadows,
// so on the one tier that needs blobs there were no casters to find, and every
// car on a low-end phone floated. Measuring the box is both more robust and
// gives the blob its size for free.
const _bb = new THREE.Box3();
const _bq = new THREE.Quaternion();
const _bs = new THREE.Vector3();
const _bsz = new THREE.Vector3();
const _bp = new THREE.Vector3();
const _bu = new THREE.Vector3();

function collectBlobRoots(o, depth) {
  if (blobRoots.length >= BLOB_MAX || depth > 5) return;
  if (o === skyMesh || o === sunSprite || o === starField || o === blobGroup || o.isLight) return;
  if (!o.visible) return;
  let meshes = 0;
  o.traverse((k) => { if (k.isMesh) meshes++; });
  if (meshes < 4) return;
  // The cap was 40, and a car is well over that: twenty-odd painted panels on
  // top of a rollcage, floorpan, seat, engine, lights and brake discs. So every
  // car failed this test, the recursion went past it into individual panels
  // (which fail `meshes < 4`), and NOTHING was ever collected — the contact
  // shadows silently did nothing at all. The box measurement below is the real
  // discriminator; this is only a cheap early-out and it has no business being
  // tight enough to reject the one thing it exists to find.
  if (meshes <= 200) {
    _bp.setFromMatrixPosition(o.matrixWorld);
    if (_bp.distanceToSquared(camera.position) > 170 * 170) return;
    _bb.setFromObject(o);
    _bb.getSize(_bsz);
    const span = Math.max(_bsz.x, _bsz.z);
    if (span > 1.8 && span < 10 && _bsz.y > 0.5 && _bsz.y < 4.5) {
      // How far below its own origin the thing actually ends. Guessing this is
      // how a blob shadow ends up buried in the road or hovering at door height.
      o.__blobDrop = clamp(_bp.y - _bb.min.y - 0.03, 0.05, 3);
      o.__blobScale = span / BLOB_LEN;
      blobRoots.push(o);
      return;
    }
  }
  const kids = o.children;
  for (let i = 0; i < kids.length; i++) collectBlobRoots(kids[i], depth + 1);
}

function scanBlobRoots() {
  blobRoots.length = 0;
  const kids = scene.children;
  for (let i = 0; i < kids.length; i++) collectBlobRoots(kids[i], 0);
}

function updateBlobs() {
  if (!blobs) return;
  if (--blobScan <= 0) { blobScan = 20; scanBlobRoots(); }
  for (let i = 0; i < BLOB_MAX; i++) {
    const b = blobs[i];
    const r = blobRoots[i];
    if (!r || !r.parent || !r.visible) { b.visible = false; continue; }
    r.matrixWorld.decompose(_bp, _bq, _bs);
    _bu.set(0, 1, 0).applyQuaternion(_bq);
    b.visible = true;
    b.quaternion.copy(_bq);
    const k = r.__blobScale || 1;
    b.scale.set(k, 1, k);
    b.position.copy(_bp).addScaledVector(_bu, -(r.__blobDrop || BLOB_DROP));
  }
}

export let activeEnv = ENVIRONMENTS.noon;

// Preallocated scratch — render() and trackShadow() run every frame and must
// not hand the GC anything.
const _sunDir = new THREE.Vector3(0.55, 0.70, 0.45).normalize();
const _shX = new THREE.Vector3(1, 0, 0);
const _shY = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Vector3();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function setEnvironment(id) {
  const env = ENVIRONMENTS[id] || ENVIRONMENTS.noon;
  activeEnv = env;

  const u = skyUniforms;
  u.topColor.value.setHex(env.top);
  u.bottomColor.value.setHex(env.bottom);

  const cl = env.cloud || [0, 0, 0xffffff, 0x888888, 0.003, 1];
  u.cloudCover.value = cl[0];
  u.cloudOpacity.value = cl[1];
  u.cloudColor.value.setHex(cl[2]);
  u.cloudShade.value.setHex(cl[3]);
  u.cloudSpeed.value = cl[4];
  u.cloudScale.value = cl[5];

  const gw = env.glow || [0xffffff, 0.4];
  u.glowColor.value.setHex(gw[0]);
  u.glowStrength.value = gw[1];

  const hz = env.horizon;
  u.horizonColor.value.setHex(hz ? hz[0] : env.bottom);
  u.horizonStrength.value = hz ? hz[1] : 0;

  scene.fog.color.setHex(env.fog);
  scene.fog.near = env.fogNear;
  scene.fog.far = env.fogFar;

  sunLight.color.setHex(env.sun);
  sunLight.intensity = env.sunI;
  const p = env.sunPos;
  _sunDir.set(p[0], p[1], p[2]).normalize();
  u.sunDir.value.copy(_sunDir);
  sunLight.position.copy(_sunDir).multiplyScalar(320);

  // Light-space basis, rebuilt only when the sun moves. Used to snap the shadow
  // box to whole texels so the shadow edges do not crawl as the car drives.
  _shX.copy(_up).cross(_sunDir);
  if (_shX.lengthSq() < 1e-6) _shX.set(1, 0, 0);
  _shX.normalize();
  _shY.copy(_sunDir).cross(_shX).normalize();

  hemiLight.color.setHex(env.hemi[0]);
  hemiLight.groundColor.setHex(env.hemi[1]);
  hemiLight.intensity = env.hemi[2];
  ambient.intensity = env.amb;

  const f = env.fill || [0xffffff, 0.4];
  fillLight.color.setHex(f[0]);
  fillLight.intensity = f[1];
  // Opposite the sun and lower, so it fills the flank the key cannot reach.
  fillLight.position.set(-_sunDir.x * 200, Math.max(60, _sunDir.y * 90), -_sunDir.z * 200);

  renderer.toneMappingExposure = env.expo || 1.0;

  sunSprite.material.color.setHex(env.sun);
  sunSprite.material.opacity = env.stars > 0.6 ? 0.3 : 0.85;
  starField.material.opacity = env.stars;

  if (blobs) {
    // A contact patch is a lie about the sun, so it should be as strong as the
    // sun is — and weaker where a real shadow map is already doing most of the
    // job, because the two multiply.
    const m = blobs[0].material;
    const base = env.stars > 0.6 ? 0.42 : (env.rain || env.haze ? 0.5 : 0.72);
    m.opacity = quality.shadows ? base * 0.62 : base;
  }

  document.documentElement.style.setProperty('--grade', env.grade);
  return env;
}

// Almost nothing in this world was flagged to RECEIVE a shadow — the track, the
// scenery and the cars were all built as casters only, which is why the sun has
// never once put a car on the road. The flag is a uniform, not a compile
// switch, so turning it on costs a sweep and no recompile; new geometry appears
// every time a track loads, so the sweep repeats on a slow timer.
let recvScan = 0;
function enableReceivers() {
  scene.traverse((o) => {
    if (!o.isMesh || o.receiveShadow || o === skyMesh) return;
    const m = Array.isArray(o.material) ? o.material[0] : o.material;
    if (!m || m.transparent || m.depthWrite === false) return;
    o.receiveShadow = true;
  });
}

// The shadow camera rides with the view. It is anchored on the camera rather
// than on `target` because the chase camera is always looking at the player
// anyway, and hanging the box off the eye also covers a wreck cam or a replay
// angle, where the car and the view have parted company.
export function trackShadow(target) {
  if (!quality.shadows || !sunLight.castShadow) return;
  if (--recvScan <= 0) { recvScan = 90; enableReceivers(); }

  const e = camera.matrixWorld.elements;
  let fx = -e[8], fz = -e[10];
  const fl = Math.sqrt(fx * fx + fz * fz);
  if (fl > 1e-4) { fx /= fl; fz /= fl; } else { fx = 0; fz = 1; }

  const cp = camera.position;
  const tx = target ? (cp.x + target.x) * 0.5 : cp.x;
  const tz = target ? (cp.z + target.z) * 0.5 : cp.z;
  const ty = target ? target.y : cp.y - 5;
  _c.set(tx + fx * SHADOW_LEAD, ty, tz + fz * SHADOW_LEAD);

  const texel = (quality.shadowSpan * 2) / (quality.shadowMap || 1024);
  const a = Math.round(_c.dot(_shX) / texel) * texel;
  const b = Math.round(_c.dot(_shY) / texel) * texel;
  const d = _c.dot(_sunDir);
  _c.set(0, 0, 0).addScaledVector(_shX, a).addScaledVector(_shY, b).addScaledVector(_sunDir, d);

  sunLight.position.copy(_c).addScaledVector(_sunDir, SHADOW_DIST);
  sunLight.target.position.copy(_c);
  sunLight.target.updateMatrixWorld();
}

export function render() {
  if (!renderer || contextLost) return;
  const cp = camera.position;
  skyMesh.position.copy(cp);
  starField.position.copy(cp);
  _v.copy(_sunDir).multiplyScalar(1500).add(cp);
  sunSprite.position.copy(_v);
  skyUniforms.time.value = performance.now() * 0.001;
  if (blobs) updateBlobs();

  renderer.render(scene, camera);

  if (vignetteScene) {
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(vignetteScene, vignetteCam);
    renderer.autoClear = auto;
  }
}

export function setFov(f) {
  const base = window.innerHeight > window.innerWidth ? CAM.fov + 12 : CAM.fov;
  const want = clamp(f, base - 6, base + 26);
  if (Math.abs(camera.fov - want) > 0.01) {
    camera.fov = want;
    camera.updateProjectionMatrix();
  }
}

export function baseFov() {
  return window.innerHeight > window.innerWidth ? CAM.fov + 12 : CAM.fov;
}

// Near-black neutrals — asphalt, tyres, dark trim — have so little albedo that
// no amount of light rescues them, and they punch holes in an otherwise bright
// frame. Give them a floor. Doing it in albedo rather than in the grade means a
// night track still renders them dark, which a lifted black point would not.
const _lc = new THREE.Color();
// Cut by more than half from 0.021/0.085. That much lift is a grey veil over
// every dark material in the game and it was a large part of what stopped a
// tyre, a wheelarch or the inside of a shadow ever reaching a real black. What
// is left is aimed at the night and neon circuits, where a genuinely 0x000000
// prop against a 0x04061a sky is a hole rather than a silhouette.
const LIFT_CEIL = 0.062;   // linear: above this a colour is not "near black"
const LIFT_AMT = 0.013;    // linear: what a pure black gains

function liftDark(hex) {
  if (typeof hex !== 'number') return hex;
  _lc.setHex(hex);
  const mx = Math.max(_lc.r, _lc.g, _lc.b);
  if (mx >= LIFT_CEIL) return hex;
  const mn = Math.min(_lc.r, _lc.g, _lc.b);
  if (mx > 1e-4 && (mx - mn) / mx > 0.5) return hex;   // it has real hue — leave it
  const add = LIFT_AMT * (1 - mx / LIFT_CEIL);
  _lc.setRGB(_lc.r + add, _lc.g + add, _lc.b + add);
  return _lc.getHex(THREE.SRGBColorSpace);
}

// Shared materials cache — hundreds of scenery pieces should not each compile
// their own program. Cached on the hex the caller asked for, not the lifted one.
const matCache = new Map();
export function mat(hex, opts = {}) {
  const key = hex + '|' + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshLambertMaterial({ color: liftDark(hex), ...opts });
  matCache.set(key, m);
  return m;
}

export function matPhong(hex, opts = {}) {
  const key = 'p' + hex + '|' + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshPhongMaterial({ color: liftDark(hex), shininess: 40, ...opts });
  matCache.set(key, m);
  return m;
}

export function disposeGroup(g) {
  if (!g) return;
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material && o.material.__owned) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
  if (g.parent) g.parent.remove(g);
}

export const lerpColor = (c, hex, t) => c.lerp(new THREE.Color(hex), t);
export { lerp };
