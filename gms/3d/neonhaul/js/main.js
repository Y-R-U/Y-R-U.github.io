// Boot, renderer, composer, the quality guard, the master loop, __state / __game, and the
// platform lifecycle of §2.8. Nothing else imports this file.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { FLAG, preset, CAMERA, BLOOM, FPS_GUARD, VARIANTS, WORLD_SEED, FOG, HAZE, AERIAL, FLIGHT,
  HUD, ZONE_TYPES } from './config.js';
import { clamp, Roll, wrapAngle } from './utils.js';
import { S, save, flush, applyFlagOverrides } from './save.js';
import { buildAtlases, ensureMipSupport } from './atlas.js';
import { U, shellMaterial, groundMaterial } from './materials.js';
import { Sky, fogContrast, srgbLuma } from './sky.js';
import { makeGradeShader, applyGrade } from './grade.js';
import { buildProbeScene, VIEWS } from './probes.js';
import { CityModel, loadCityData, CHUNK } from './city.js';
import { districtAt } from './districts.js';
import { CityRenderer } from './render_city.js';
import { loadSignAtlas } from './signs.js';
import { Signage } from './signage.js';
import { protoBoxes } from './blocks.js';
import { makeProbe } from './probe.js';
import { Weather } from './weather.js';
import { Reflections } from './reflect.js';
import { Silhouettes } from './silhouettes.js';
import { Flight, emptyInput } from './flight.js';
import { Controls } from './controls.js';
import { CameraRig } from './camera.js';
import { Autopilot, Courier } from './autopilot.js';
import { SettingsPanel } from './settings.js';
import { CraftFields, PlayerCraft, CRAFT_DEFS, CRAFT_U, SHOT_CRAFT,
  BODY_TINTS, TRIM_TINTS, TRIM_RUNS, RIM_DIM, LIGHT_RIG, POLICE_RIG } from './craft.js';
import { Traffic } from './traffic.js';
import { Cockpit, ChaseStrip } from './hud.js';
import { Minimap } from './minimap.js';
import { UI, DockUI, holdFor, CHATTER_MULT } from './ui.js';
import { ClientPanel, captureBlur } from './dock.js';
// P7a (§7). zones.js's analytic half is node-clean; createZoneVisuals takes THREE as an argument.
import { ZoneField, createZoneVisuals, KIND, VOLUME } from './zones.js';
import { Missions, BOARD } from './missions.js';
import * as Econ from './economy.js';
// P8 (§10). Constructing these allocates no AudioContext, no nodes and no network requests.
import { GameAudio } from './audio.js';
import { Radio } from './radio.js';

// ── shot scenarios ─────────────────────────────────────────────────────────
// FROZEN AT P3B, per §12.1, and frozen for the project. `shots/<id>.json` is the committed copy
// and tools/shot.mjs hard-fails if the two ever drift — a shot that moves between rounds makes
// score movement meaningless, which is the whole reason the freeze exists.
//
// Every camera sits in or over the Lantern Quarter / Ribs boundary around x = 1300, and that is
// deliberate: the spawn district (The Spine) has the 0xdbe8ff window palette and renders as a wall
// of white, while §12.1's plates are all coloured neon on near-black. Scoring the game's most
// monochrome district against its most colourful plates would measure the district.
//
// `aspect` is the PLATE CROP's aspect (obligation T4), and shot.mjs fits the viewport to it.
// null means 16:9.

const SCENARIOS = [
  // `craft` flipped to true at P5 on DECISIONS decision 14: "both reference plates contain a hero
  // craft and our shots are city-only … re-score fog_city and canyon_dive after P5 with a craft in
  // frame." NOTHING ELSE ABOUT THESE TWO ROWS CHANGED — pos, yaw, pitch, fov, variant and clock are
  // byte-identical to the P3b freeze, so the camera is the same camera and the only new thing in
  // the frame is the subject. That is the whole experiment.
  { id: 'fog_city',    ref: '746850_01', seed: WORLD_SEED, variant: 'stormnight', clock: 23.2,
    pos: [1350, 320, 180],  yaw: 1.90,  pitch: -14, fov: 68, craft: true, hud: false, aspect: null },
  { id: 'canyon_dive', ref: '746850_03', seed: WORLD_SEED, variant: 'stormnight', clock: 1.4,
    pos: [1305.6, 150, 260], yaw: 3.1416, pitch: -32, fov: 64, craft: true, hud: false, aspect: null },
  { id: 'hero_craft',  ref: '1939970_00', seed: WORLD_SEED, variant: 'duskburn', clock: 19.6,
    pos: [1380, 210, 420],  yaw: 3.00,  pitch: -18, fov: 55, craft: true,  hud: false, aspect: null },
  { id: 'wet_street',  ref: '1475810_04', seed: WORLD_SEED, variant: 'stormnight', clock: 0.8,
    pos: [1305.6, 5, 300],  yaw: 3.1416, pitch: -3,  fov: 64, craft: false, hud: false, aspect: 528 / 472 },
  { id: 'cockpit',     ref: '746850_02', seed: WORLD_SEED, variant: 'stormnight', clock: 22.0,
    pos: [1305.6, 60, 340], yaw: 3.1416, pitch: -4,  fov: 60, craft: true,  hud: true,  aspect: null },
  { id: 'day_smog',    ref: '1091500_08', seed: WORLD_SEED, variant: 'daysmog', clock: 12.4,
    pos: [1280, 26, 140],   yaw: 2.60,  pitch: 30,  fov: 62, craft: false, hud: false, aspect: 444 / 526 },
];

// ── errors (§2.8, item 6) ──────────────────────────────────────────────────

const errors = [];
// P8's layer reports MISSING OPTIONAL ASSETS through the same `onError` channel it reports faults
// through: `radio-music-play: storm: unusable` is what a 404 on a track Aaron has not generated yet
// looks like. Those are not §2.8 errors — the game is behaving exactly as §10.3's fall-through
// chain says it should — but they landed in `__state.errors`, which four gate suites assert is
// empty, and `gates_p4` started failing for a missing mp3. They get their own visible bucket
// instead of being swallowed: `__state.audioIssues`, capped, and still counted.
const audioIssues = [];
function reportAudio(kind, msg) {
  audioIssues.push({ t: +(performance.now() / 1000).toFixed(2), kind, msg: String(msg).slice(0, 240) });
  if (audioIssues.length > 40) audioIssues.shift();
}
function reportError(kind, msg) {
  errors.push({ t: +(performance.now() / 1000).toFixed(2), kind, msg: String(msg).slice(0, 400) });
  if (errors.length > 60) errors.shift();
}
window.addEventListener('error', e => reportError('error', e.message + ' @' + (e.filename || '?') + ':' + (e.lineno || 0)));
window.addEventListener('unhandledrejection', e => reportError('rejection', e.reason?.message || e.reason));

// Shader-patch misses (§2.3) arrive as console warnings from materials.js, which must not import
// this module. Tagging them is the whole coupling.
const _warn = console.warn.bind(console);
console.warn = (...a) => {
  if (typeof a[0] === 'string' && a[0].startsWith('[neonhaul]')) reportError('warn', a.join(' '));
  _warn(...a);
};

// P5. A shader that FAILS TO COMPILE was invisible to every tool we have: three reports it through
// console.error, nothing threw, `__state.errors` stayed empty, and `shot.mjs` printed "0 err" over
// a frame whose hull material had no program at all. It cost a round of art tuning against a
// material that was not running. `patch()` catches a missing CHUNK; this catches a broken PROGRAM,
// which is the other half and was the half nobody had.
const _err = console.error.bind(console);
console.error = (...a) => {
  const s0 = typeof a[0] === 'string' ? a[0] : '';
  if (/THREE\.WebGLProgram|THREE\.WebGLShader|shader error|Program Info Log/i.test(s0)) {
    reportError('shader', a.map(v => String(v)).join(' ').slice(0, 600));
  }
  _err(...a);
};

// ── quality selection (§2.5) ───────────────────────────────────────────────

applyFlagOverrides();

function pickLow() {
  if (FLAG.lite) return true;
  const s = S().settings.quality;
  if (s === 'high') return false;
  if (s === 'low') return true;
  return (navigator.hardwareConcurrency || 8) <= 4;
}

let Q = preset(pickLow());
let userPickedHigh = S().settings.quality === 'high' && !FLAG.lite;
let downgraded = false;

// ── renderer (§2.3) ────────────────────────────────────────────────────────

const stage = document.getElementById('stage');

// preserveDrawingBuffer only under ?debug: __game.probe() reads the composited frame back through
// a 2D canvas, and without it the drawing buffer is not guaranteed to survive to the read.
const renderer = new THREE.WebGLRenderer({
  powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: FLAG.debug,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, FLAG.dpr !== null ? FLAG.dpr : Q.pixelRatio));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;   // ACES lives in the grade pass — §2.3, §4.6
renderer.shadowMap.enabled = false;
renderer.info.autoReset = false;              // budget.mjs reads renderer.info
renderer.setSize(innerWidth, innerHeight);
stage.appendChild(renderer.domElement);

// Rule (2) of §2.8: the extension must be taken while the context is alive. Fetching it after a
// loss always yields null.
const loseExt = renderer.getContext().getExtension('WEBGL_lose_context');

// ── scene ──────────────────────────────────────────────────────────────────

const SKY = 0x05070c;
const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
// Distances from config.FOG (§3.2.1, obligation T2); sky.js writes them per variant every frame.
scene.fog = new THREE.Fog(SKY, FOG.variants.deepnight.near, Q.fogFar);

const camera = new THREE.PerspectiveCamera(CAMERA.fov, innerWidth / innerHeight, CAMERA.near, CAMERA.far);
camera.position.set(0, 60, 0);
camera.rotation.order = 'YXZ';

// ── atlases, sky, materials (P1a) ──────────────────────────────────────────
// Order matters: the atlases feed the materials, and the sky's env bake has to exist before the
// first material is built or every shell needs a program recompile the moment it does.

const atlas = buildAtlases(Q, WORLD_SEED);
ensureMipSupport(atlas.windows, renderer);

const sky = new Sky(scene, camera, renderer, Q, atlas);

const mats = { ground: groundMaterial(atlas, sky.env) };

// ── the city (P2, §3.1-§3.3, §3.6) ─────────────────────────────────────────
// `?probes=1` builds P1a's material probe rig INSTEAD, so tools/gates_p1a.mjs keeps measuring a
// controlled sample rather than whatever the seeded field happened to put in front of the camera.

let city = null, cityR = null, probeScene = null, msPrewarm = 0, signage = null, signAtlas = null;
let weather = null, reflect = null, silhouettes = null;
// §7.1's client<->pad assignment reads clients.length. Nothing in js/ contains the literal count
// (obligation T8) — it comes from this file and nowhere else.
let clientData = [];
let clientPaths = null;

if (FLAG.probes) {
  mats.shell = shellMaterial(atlas, sky.env);
  probeScene = buildProbeScene(scene, mats, atlas);
} else {
  // Fetched alongside the city rather than after it: it is 40 KB of JSON on the same connection
  // the city data is already using, and the zone field cannot be built without it.
  const [data, sa, cl] = await Promise.all([
    loadCityData('./data/'),
    loadSignAtlas(renderer, './'),
    fetch('./data/clients.json').then(r => r.json()).catch(e => { reportError('clients', e.message); return { clients: [] }; }),
  ]);
  signAtlas = sa;
  clientData = cl.clients || [];
  clientPaths = cl.paths || null;
  city = new CityModel({ ...data, seed: FLAG.seed !== null ? FLAG.seed : WORLD_SEED });
  cityR = new CityRenderer(scene, Q, atlas, city, sky, mats.ground);
  mats.shell = cityR.matL0;
  // P3a (§3.5.4-§3.5.5). Attached before the pre-warm so the 5x5 near ring boots with its signage
  // already placed — the first flight frame must not be the first generation frame (§3.2.3).
  signage = cityR.attachSignage(new Signage(scene, Q, sa, city, sky, atlas.noise, FLAG.debug));
  // P3b (§3.7, §3.9, §4.4). Order matters: Reflections mirrors the signage fields' own buffers,
  // so signage has to exist first, and it registers itself with signage.attachDerived so
  // setSignVisible hides the reflection and the halos with their source (obligation T7).
  buildP3b();
  // §3.1.1's spawn. The free camera starts on the Spindle's 92 m podium deck facing 118 deg, so
  // the Lantern Quarter's signage is in the opening frame and the Hollow is in the left third.
  // Bearing is a compass bearing (0 = north = -Z, 90 = east = +X); the camera's forward under
  // YXZ is (-sin yaw, 0, -cos yaw), so yaw = -bearing and nothing else.
  const sp = city.spawn;
  camera.position.set(sp.pos[0], sp.pos[1] + 2, sp.pos[2]);
  camera.rotation.set(-0.06, -sp.bearing * Math.PI / 180, 0);
}

// §2.5's rule: a quality change is a REBUILD, not a scatter of `if (low)`. The three P3b fields
// differ between presets in their instance counts (rain 2500/900), their bucket count
// (`Q.reflect`) and their very existence (`Q.halos`, `Q.silhouettes`), so they are torn down and
// rebuilt rather than reconfigured.
function buildP3b() {
  if (!cityR || !signage) return;
  weather?.dispose(); reflect?.dispose(); silhouettes?.dispose();
  weather = new Weather(scene, Q, WORLD_SEED ^ 0x51ee);
  reflect = new Reflections(scene, Q, atlas, sky, signage);
  silhouettes = new Silhouettes(scene, Q, atlas, WORLD_SEED ^ 0x77ee);
  silhouettes.atCx = NaN;
  cityR.onSnap = (x, z) => reflect.snap(x, z);
}

// ── composer (§2.3) ────────────────────────────────────────────────────────

let composer, bloomPass, gradePass;

// EffectComposer multiplies by its own pixel ratio without rounding, so a 1.25 ratio on a 390 px
// viewport asks for a 487.5-tall target. Its ratio is pinned to 1 and every size passed in is
// already an integer buffer size.
const bufW = () => Math.max(1, Math.round(innerWidth * renderer.getPixelRatio()));
const bufH = () => Math.max(1, Math.round(innerHeight * renderer.getPixelRatio()));

function buildComposer() {
  if (composer) composer.dispose?.();
  const rt = new THREE.WebGLRenderTarget(bufW(), bufH(), {
    type: THREE.HalfFloatType,   // EffectComposer's own default; stated so nobody "fixes" it
    samples: Q.msaa,             // HIGH 2, LOW 0 — the default framebuffer's MSAA is never used
  });
  composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(1);
  composer.setSize(bufW(), bufH());

  composer.addPass(new RenderPass(scene, camera));

  bloomPass = null;
  if (Q.bloom) {
    bloomPass = new ClampedBloom(new THREE.Vector2(bufW(), bufH()),
      BLOOM.strength, BLOOM.radius, BLOOM.threshold);
    composer.addPass(bloomPass);
  }

  gradePass = new ShaderPass(makeGradeShader(atlas.noise));
  gradePass.renderToScreen = true;
  gradePass.uniforms.uNoiseScale.value.set(1 / atlas.noise.image.width, 1 / atlas.noise.image.height);
  composer.addPass(gradePass);
  syncGrade();
}

// §4.4. UnrealBloomPass halves unconditionally and then quarters down its own mip chain, so
// there is nothing to configure there — what we choose is to CLAMP THE INPUT. Bloom is
// low-frequency by definition and nobody has ever seen a bloom halo alias; this is where the
// 3.5 ms → 1.3 ms in §3.11 comes from.
class ClampedBloom extends UnrealBloomPass {
  setSize(w, h) { super.setSize(Math.min(w, BLOOM.maxW), Math.min(h, BLOOM.maxH)); }
}

// §4.6's real grade pass lives in js/grade.js. P0's inline placeholder is GONE, not disabled
// (DECISIONS obligation T3) — two grades in one file is how a project ends up tone-mapping twice.

// One place where the blended variant reaches the post chain, so "which uniform is exposure?"
// cannot become a two-place bug. Exposure is a PASS uniform: renderer.toneMappingExposure is
// inert under NoToneMapping (§2.3).
function syncGrade() {
  if (!gradePass || !sky) return;
  applyGrade(gradePass, sky.p);
  gradePass.uniforms.uAces.value = acesOn ? 1 : 0;
  if (bloomPass) bloomPass.strength = sky.bloomStrength();
}

let acesOn = true;
let timeFrozen = false;

buildComposer();

// ── resize (§2.8, item 4) ──────────────────────────────────────────────────

function onResize() {
  const w = Math.max(1, innerWidth), h = Math.max(1, innerHeight);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  const dpr = Math.min(devicePixelRatio, FLAG.dpr !== null ? FLAG.dpr : (downgraded ? FPS_GUARD.pixelRatio : Q.pixelRatio));
  if (Math.abs(dpr - renderer.getPixelRatio()) > 1e-3) renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  // Not just camera.aspect — the composer's targets and UnrealBloomPass's five mip chains are
  // sized independently of the canvas.
  composer.setSize(bufW(), bufH());
  bloomPass?.setSize(bufW(), bufH());
  // §8's cabin geometry is a function of the ASPECT, not of the pixel size: the holo panels and the
  // dash plane are laid out one way for a landscape frame and another for a portrait one, because a
  // panel that fits a 1.6:1 laptop is off screen at 0.46:1 on a phone. Only a change of
  // arrangement rebuilds anything (hud.js applyLayout).
  cockpit?.applyLayout(w / h);
}
addEventListener('resize', onResize);
// iOS reports the old size synchronously on orientationchange.
addEventListener('orientationchange', () => setTimeout(onResize, 120));

// ── the session object (§2.4 bucket 3) ─────────────────────────────────────

const Game = {
  scene, camera, renderer, actx: null, quality: Q, atlas, mats,
  player: { x: 0, y: 60, z: 0, alt: 60, speed: 0, heading: 0, cell: 1, cargo: null },
  city: null, zones: null, missions: null, economy: null, radio: null, sky,
  // P7a fills this; §8.2's task line and §8.3's left holo panel read it and draw a placeholder
  // when it is null, so the "no job" path is the one that ships first and is exercised now.
  job: null,
  // P7a. `dock` is the pad the player is standing on, `towing` the §7.4.3 limp. Both are read by
  // §2.7's snapshot and by P8's radio context.
  dock: null,
  towing: false,
  parkedBy: null,
};

// ── P7a (§7) — zones, missions, economy ────────────────────────────────────
// Constructed here because everything the three modules need (the city, the clients, the profile)
// already exists and nothing above this line reads them. `zoneVis` is the only part that touches
// three.js, and it takes THREE as an argument so zones.js stays node-clean.

let zoneVis = null;
let zoneList = [];                       // zonesNear()'s output, refreshed at the minimap's rate
let zoneAcc = 1e9;                       // forces a build on the first frame
let zonesForced = null;                  // __game.setZones() — outranks the per-frame push

if (cityR) {
  Game.zones = new ZoneField({ city, clients: clientData });
  Game.missions = new Missions({ zones: Game.zones, city, clients: clientData, seed: city.seed });
  Game.economy = Econ.fromSave(S());
  zoneVis = createZoneVisuals(THREE, { Q, scene });
  // `?tier=` lands in the profile, but `fromSave()` DERIVES the tier from lifetime and ignores
  // whatever the file says (gate T19) — so the flag has to move `lifetime`, not `tier`, or it is
  // silently overwritten one line later. That is a hook that looks like it worked and did not.
  if (FLAG.tier !== null) {
    const row = Econ.LADDER[clamp(FLAG.tier | 0, 1, Econ.LADDER.length) - 1];
    if (row && Game.economy.lifetime < row.lifetime) {
      Game.economy.lifetime = row.lifetime;
      Game.economy.tier = Econ.tierFor(Game.economy.lifetime);
    }
  }
  // ?crd= is already in the profile; fromSave copied it. Nothing else to do.
}

// 'cx,cz' -> the pad object. zonesNear() hands out a display record, not the pad, and canDock /
// board / deliver all want the pad. padAt() is memoised, so this is a Map lookup.
// zonesNear() puts `dist` on every row; a list injected through `__game.setZones()` need not.
function zoneDist(z) {
  if (typeof z.dist === 'number' && Number.isFinite(z.dist)) return z.dist;
  return Math.hypot((z.x || 0) - Game.player.x, (z.z || 0) - Game.player.z);
}

function padOf(key) {
  if (!Game.zones || !key) return null;
  const i = key.indexOf(',');
  return Game.zones.padAt(+key.slice(0, i), +key.slice(i + 1));
}

// ── audio unlock (§2.8, item 1) ────────────────────────────────────────────
// P8's audio.js adopts this context; without the gesture-time resume there is no sound on iOS.

let actx = null;
// P8. Declared here rather than beside their construction below, because `resumeAudio` is bound to
// three gesture listeners forty lines above the `new GameAudio(...)` line and a `const` down there
// would put this read in its temporal dead zone. Boot has already died on exactly that once
// (`simTime`), so the pattern is not repeated.
let audio = null, radio = null;
function resumeAudio() {
  try {
    if (!actx) {
      // ADOPT audio.js's context if it already made one. This is not defensive tidiness — it is a
      // measured bug. `audio.installGestureHooks` binds with `capture: true`, so its handler runs
      // BEFORE this bubble-phase listener on the very same event and always creates the context
      // first; `audio.attach(ours)` then correctly refuses to switch, and the game was left with
      // TWO contexts — audio.js's `running` and main.js's permanently `suspended`. `__state.audio`
      // read the suspended one, so the game reported silence while playing sound. Whoever gets
      // there first owns the context; there is only ever one.
      const AC = window.AudioContext || window.webkitAudioContext;
      if (audio && audio.ctx) actx = audio.ctx;
      else if (AC) actx = new AC();
      else return;
      Game.actx = actx;
    }
    if (actx.state !== 'running') actx.resume();
    // Adopting main.js's context beats letting audio.js build a second one: iOS counts contexts
    // against a small per-page budget. Idempotent, so calling it on every gesture is free.
    if (audio) audio.attach(actx);
  } catch (e) { reportError('audio', e.message); }
}
for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
  addEventListener(ev, resumeAudio, { passive: true });
}

// ── context loss (§2.8, item 3) ────────────────────────────────────────────

let contextLost = false;
const ctxlostEl = document.getElementById('ctxlost');

renderer.domElement.addEventListener('webglcontextlost', e => {
  e.preventDefault();               // without this the browser never restores
  contextLost = true;
  ctxlostEl.classList.remove('hidden');
  park('contextlost');
  reportError('gl', 'context lost');
}, false);

renderer.domElement.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  ctxlostEl.classList.add('hidden');
  renderer.info.autoReset = false;
  onResize();
  Game.sky?.bakeEnv?.();
  unpark('contextrestored');
}, false);

// restoreContext() from inside the lost listener is a silent no-op — defer it.
function loseContextForTest(restoreAfter = 400) {
  if (!loseExt) { reportError('gl', 'WEBGL_lose_context unavailable'); return false; }
  loseExt.loseContext();
  if (restoreAfter >= 0) setTimeout(() => loseExt.restoreContext(), restoreAfter);
  return true;
}

// ── visibility (§2.8, item 2) ──────────────────────────────────────────────

let raf = 0, parked = false, resumeClamp = false;

function park(why) {
  if (parked) return;
  parked = true;
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  flush();
  try { actx?.suspend(); } catch {}
  Game.parkedBy = why;
}

function unpark(why) {
  if (!parked) return;
  // stay parked until the context is actually back AND the tab is actually on screen — a restore
  // that lands while backgrounded must not restart the loop.
  if (contextLost || document.hidden) return;
  parked = false;
  resumeClamp = true;              // first frame back gets a clamped dt, not a two-minute one
  last = performance.now();
  try { if (actx && actx.state === 'suspended') actx.resume(); } catch {}
  Game.parkedBy = null;
  if (!raf) raf = requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) park('hidden');
  else { unpark('visible'); resumeAudio(); }
});
addEventListener('pagehide', () => { park('pagehide'); flush(); });

// ── §8.4 toasts and §8.5 the chatter popup ─────────────────────────────────
// P0's four-line placeholder is GONE, not disabled (obligation T3's lesson): js/ui.js owns both
// surfaces now and this is the only handle on it. Never an alert (brief).

// Declared here, not down with the frame counters, because a toast raised during module init reads
// `now()` before the frame loop's own declarations are evaluated — a `let` further down puts this
// in its temporal dead zone and the read THROWS rather than returning 0.
let simTime = 0;

const ui = new UI(
  { toasts: document.getElementById('toasts'), chatter: document.getElementById('chatter') },
  { settings: () => S().settings, now: () => simTime });
// §10.4 suppresses chatter for 4 s after any toast, so the radio hears about every one of them
// from here rather than from each call site — a per-site call would be missed by the next one
// somebody adds.
export const toast = (msg, kind, ms) => { radio?.onToast(); return ui.toast(msg, kind, ms); };

// ── P8 (§10) — audio and radio ─────────────────────────────────────────────
// Constructed after `ui`, because the radio hands foreground lines to `ui.chatter`. Constructing
// these allocates NO AudioContext, no nodes and no network requests — see the header of audio.js.
if (!FLAG.noaudio) {
audio = new GameAudio({
  settings: () => S().settings,
  onError: (k, m) => reportAudio(k, m),
});
radio = new Radio({
  audio,
  base: './',
  chatter: o => ui.chatter(o),
  settings: () => S().settings,
  onError: (k, m) => reportAudio(k, m),
});
Game.audio = audio;
Game.radio = radio;
radio.load();                        // 22 KB of JSON, fire-and-forget, never awaited, cannot throw
// Deliberately redundant with resumeAudio()'s listener list: audio.js must not depend on main.js's
// gesture handler being right, and duplicate unlock calls are free. audio.js also listens for
// `touchend`, which iOS has historically counted as an activation when `touchstart` did not.
audio.installGestureHooks(window);
}

// ── perf overlay (?perf) ───────────────────────────────────────────────────

const perfEl = document.getElementById('perf');
if (FLAG.perf) perfEl.classList.remove('hidden');
let perfAcc = 0;

// ── shot / scenario mode ───────────────────────────────────────────────────

// A pinned variant wins over the clock; otherwise §4.1's bands drive it and `?time=` sweeps the
// whole day through the crossfade. `variant` is a report of what the sky settled on, never an
// input — the one exception being ?var= and a shot scenario, which pin it.
let forcedVariant = FLAG.variant || null;
let variant = forcedVariant || 'stormnight';
let clock = FLAG.time !== null ? FLAG.time : 22.0;
let clockRunning = FLAG.time === null && !FLAG.shot;
let mode = 'free';

function applyScenario(sc) {
  mode = 'shot';
  forcedVariant = sc.variant;
  variant = sc.variant;
  clock = sc.clock;
  clockRunning = false;
  camera.position.set(sc.pos[0], sc.pos[1], sc.pos[2]);
  camera.fov = sc.fov;
  camera.rotation.order = 'YXZ';
  camera.rotation.set(sc.pitch * Math.PI / 180, sc.yaw, 0);
  camera.updateProjectionMatrix();
  if (!sc.hud) document.getElementById('hud').classList.add('hidden');
}

if (FLAG.nohud) document.getElementById('hud').classList.add('hidden');

const scenario = FLAG.shot ? SCENARIOS.find(s => s.id === FLAG.shot) : null;
if (FLAG.shot && !scenario) reportError('shot', `unknown scenario "${FLAG.shot}"`);
if (scenario) applyScenario(scenario);

// ── P4 — flight, controls, camera (§5.2, §6) ───────────────────────────────
// P2's `autocam.js` is GONE, not disabled: `?auto=1` now drives the real flight model through the
// real input struct (js/autopilot.js), so budget.mjs and soak.mjs exercise thrust, damping,
// assists and collision rather than sampling a camera on rails. Its own header said nothing in it
// could survive into P4.
//
// `mode` is the switch every gate depends on: 'fly' and 'auto' run the rig, 'shot' and 'free' do
// not. `__game.setCamera()` drops to 'free', which is what keeps every P1a/P2/P3a/P3b gate
// measuring the camera it placed instead of fighting a flight model for it.

let flight = null, controls = null, rig = null, autopilot = null, settingsUI = null, courier = null;
let ferry = null;                          // __game.flyTo() — see update()
// P6 (§8). Declared up here rather than beside its own build block below, because
// `applyFlightSettings()` and `registerDerived()` both run before that block and a `let` in
// temporal dead zone THROWS — it does not read as undefined. Boot died on exactly this once.
let cockpit = null, minimap = null, chaseStrip = null, hudT = 0, cockpitForced = null;
const msHud = new Roll(90);
const ctlEl = document.getElementById('controls');

if (cityR && !scenario) {
  const st = S().settings;
  flight = new Flight({ craft: S().craft });
  applyFlightSettings(st);
  const sp = city.spawn;
  flight.reset(sp.pos[0], sp.pos[1] + 6, sp.pos[2], -sp.bearing * Math.PI / 180, -0.06);
  rig = new CameraRig(camera, flight, { mode: st.camera, fov: st.fov });
  rig.update(0, null);

  if (FLAG.auto || FLAG.courier) {
    mode = 'auto';
    // `?courier=1` swaps the FIXED 120 s programme for a navigator. `?auto=1` alone is untouched,
    // because gates_p2/p4/p5, budget.mjs and soak.mjs all measure against that fixed route.
    if (FLAG.courier) { courier = new Courier(); autopilot = courier; }
    else autopilot = new Autopilot();
  } else {
    mode = 'fly';
    settingsUI = new SettingsPanel(document.getElementById('settings'), applyFlightSettings);
    controls = new Controls(ctlEl, {
      flip: st.flipSides, btnSize: st.altBtn,
      onSettings: () => settingsUI.toggle(),
      onKey: k => { if (k === 'escape') settingsUI.toggle(); },
    });
    if (!FLAG.nohud) {
      ctlEl.classList.remove('hidden');
      // The one thing a player cannot discover by looking: there is no visible split and no
      // on-screen stick until a thumb lands. One line, five seconds, through the toast system
      // that already exists. Suppressed under ?nohud and ?auto so no shot or gate ever sees it.
      setTimeout(() => toast(`${st.flipSides ? 'Right' : 'Left'} thumb flies · `
        + `${st.flipSides ? 'left' : 'right'} thumb looks · ⚙ to swap`, 5200), 900);
    }
  }
}

// ── P5 — vehicles and traffic (§5) ─────────────────────────────────────────
// Five draws for every vehicle in the world: body, glass, lights, cones (craft.js) plus the far
// streak field (traffic.js). Built after the city because the near traffic asks cityR for the
// facade AABBs it must not fly through, and after sky because §5.3's hull is an envMap material.
//
// §5.5's population is ONE set: `traffic` writes its near craft into the same four craft fields
// the player writes into, so a taxi at 180 m and the player's own hull are instances 3 and 0 of
// the same InstancedMesh. That is why the whole vehicle layer is five draws and not five per
// vehicle, and it is the same rule §3.2 imposes on the city.

let craftFields = null, traffic = null, playerCraft = null, vehT = 0;

if (cityR) {
  craftFields = new CraftFields(scene, sky);
  traffic = new Traffic(scene, Q, (city ? city.seed : WORLD_SEED) ^ 0x7a11, cityR);
  playerCraft = new PlayerCraft(S().craft);
  if (scenario && SHOT_CRAFT[scenario.id]) {
    playerCraft.setCraft(SHOT_CRAFT[scenario.id].craft);
    playerCraft.visible = !!scenario.craft && !SHOT_CRAFT[scenario.id].hide;
  }
  registerDerived();
}

// Obligation T7. gates_p2's R0 sweep hides every layer that rides R0 so it measures the dither
// alone. The vehicle layers deliberately do NOT ride R0 — a streak at 700 m is past R0 and must
// still be there — but they are new pixels in a differencing measurement all the same, and an
// occluding layer moves a residue percentage even when it is itself unchanged. So they hide with
// the same switch. Re-registered after every buildP3b(), because Reflections owns the same slot.
//
// P6's cabin joins the list for the same reason and a stronger one: it is 1 m from the lens and
// occludes a third of the frame. It is ALREADY off in every fixed-camera gate (it only shows in
// `fly`/`auto` with the cockpit rig), so this is belt and braces — but "already off" is exactly
// the kind of assumption this project has been bitten by.
function registerDerived() {
  if (!signage || !craftFields) return;
  const d = signage.derived || { signs: [], all: [] };
  const mine = craftFields.fields.map(f => f.mesh).concat(traffic ? [traffic.mesh] : []);
  // P7a's zone volumes join the list for the same reason the vehicle layers did: additive
  // DoubleSide cylinders are new pixels in a differencing measurement even when they are
  // themselves unchanged (obligation T7). `group.visible` is not written by anything in the frame
  // path, so unlike the cabin this one needs no override shim.
  if (zoneVis) mine.push(zoneVis.group);
  // NOT `cockpit.group`. signage.setVisible() writes `m.visible = !!on`, and writing that on the
  // group is undone by updateHud() on the next frame — the isolation would report success and the
  // gate would measure the cabin anyway. This shim routes the same assignment into the cockpit's
  // own `hidden` override, which outranks the game logic and survives until it is restored.
  if (cockpit) {
    mine.push({
      set visible(v) { cockpit.setHidden(!v); },
      get visible() { return !cockpit.hidden; },
    });
  }
  signage.attachDerived({ signs: d.signs, all: d.all.concat(mine) });
}

// ── P6 — cockpit, dash, holo, minimap, toasts, chatter (§8) ────────────────
// Five draw calls for the whole diegetic HUD (js/hud.js explains how), plus a 2D-canvas minimap
// and two DOM surfaces that cost none at all. The cabin is built for every session, including
// shots, because §12.1's `cockpit` scenario is one of the six scored frames; what gates it is
// `hudShown()` below, not its existence.

if (cityR) {
  cockpit = new Cockpit(scene, Q, sky, atlas);
  minimap = new Minimap(document.getElementById('minimap'),
    { hz: Q.name === 'low' ? HUD.MAP_HZ_LOW : HUD.MAP_HZ, low: Q.name === 'low',
      rotate: S().settings.mapRotate !== false });
  chaseStrip = new ChaseStrip(document.getElementById('hud-strip'));
  registerDerived();
}

// The cabin is drawn when the player is INSIDE it: the cockpit rig, in a mode that runs the rig.
// `free` — which is what every fixed-camera pixel gate puts the page into — is off, exactly as
// craftShown() is, so no P1a/P2/P3a/P3b probe can ever be measuring an A-pillar.
function cockpitShown() {
  if (!cockpit) return false;
  if (cockpitForced !== null) return cockpitForced;
  if (mode === 'shot') return !!(scenario && scenario.hud && rigModeForShot() === 'cockpit');
  if (mode === 'fly' || mode === 'auto') return rig ? rig.mode === 'cockpit' : false;
  return false;
}
// §12.1's `cockpit` shot is the one scenario framed from inside the cabin — it is scored against
// `746850_02`, a first-person dash plate. Every other scenario is an exterior camera.
function rigModeForShot() { return scenario && scenario.id === 'cockpit' ? 'cockpit' : 'chase'; }

// ── P7a — the per-frame economy, the zone field and §7.2's docking ─────────
// One function so the order is stated once and cannot drift: the cell burns, the zone list is
// rebuilt at the MINIMAP's rate (zonesNear is 0.83 ms cold / ~0.02 ms warm — the only P7a call in
// the frame path, and it is not worth 60 Hz), and the dock test runs against that list.

const ZONE_RADIUS = 1400;                 // m — comfortably past the minimap's own range
let dockUI = null, dockPad = null, boardJobs = [];
// P7b (§7.3). `#ui` is the BOARD; `#dock` is the DEAL — one client, one job, the portrait loop.
// They are separate layers for a reason §9.1 states outright: the board may fetch the 96 px thumb
// and nothing else, and the video's src is set only when the panel opens for that client.
let clientPanel = null;
// One capture per dock, taken inside the rAF callback right after composer.render().
let wantBlur = false;
let dockHold = 0, dockGrace = 0, dockArmed = false;
// §7.2's docking, as a whole, on or off. `gates_p4` flies the model INTO things and teleports it
// around the spawn — and the spawn is inside the HUB cylinder, so a craft freeing itself from a
// landmark drifts into the pad, docks, and gets eased to the pad centre. That is correct game
// behaviour and a contaminated flight measurement, so the flight suite turns it off explicitly
// through an asserted hook rather than the gate quietly measuring a docked craft.
let dockingOn = true;
let nearCharge = null;                    // the nearest charge zone in `zoneList`, or null
let towTarget = null;
const DOCK_INPUT = Object.freeze(emptyInput());

if (cityR && Game.zones) {
  clientPanel = new ClientPanel(document.getElementById('dock'), {
    paths: clientPaths,
    hooks: {
      canAccept: job => Game.missions.canAccept(job, Game.economy),
      accept: job => {
        const r = doAccept(job);
        // The panel closes on a successful accept and hands the player back to the board, which
        // has already been rebuilt by doAccept().
        const accepted = !r.note;
        if (accepted) dockUI?.refresh(boardJobs, Game.economy, '');
        return { ...r, accepted };
      },
      haggle: job => { const r = doHaggle(job); dockUI?.refresh(boardJobs, Game.economy, ''); return r; },
      decline: () => { dockUI?.refresh(boardJobs, Game.economy, ''); return null; },
    },
  });

  dockUI = new DockUI(document.getElementById('ui'), {
    canAccept: job => Game.missions.canAccept(job, Game.economy),
    accept: job => doAccept(job),
    haggle: job => doHaggle(job),
    // §7.3's panel, for the job the player pressed.
    openClient: job => { clientPanel?.show(job, padForPanel(dockPad), Game.economy); wantBlur = true; return null; },
    charge: units => doCharge(units),
    buyUpgrade: line => doBuy(() => Econ.buyUpgrade(Game.economy, line),
      r => `${Econ.UPGRADES[line].label} L${r.level} fitted — ${r.price} CRD`),
    buyCraft: id => doBuy(() => Econ.buyCraft(Game.economy, id),
      r => `${id.toUpperCase()} in service — ${r.price} CRD. Upgrades were fitted to the old hull.`),
    buyRepair: () => doBuy(() => Econ.buyRepair(Game.economy), r => `Hull cleaned up — ${r.price} CRD`),
    dock: key => { const pad = padOf(key); if (pad) { dockGrace = 0; doDock(pad); } return null; },
    undock: () => { doUndock(); return null; },
  }, { paths: clientPaths });
  // `?courier=1` is a soak, not a gate: it WANTS the boot dock, because §7.4.9's scripted opener
  // only exists on the HUB board and the run starts on the HUB deck.
  if (FLAG.courier) dockArmed = true;
}

// The profile is the MIRROR of the economy object, never the other way round: `Game.economy` is
// the source of truth from construction onward (P7A_WIRING §2).
function persist() {
  if (!Game.economy) return;
  Object.assign(S(), Econ.toSave(Game.economy));
  save();
}

// Every derived flight number the shop can move, in one place. Buying a hull or a thrust level
// that the flight model never hears about is a purchase the player cannot feel.
function syncCraft() {
  if (!Game.economy) return;
  if (flight) {
    flight.setCraft(Game.economy.craft);
    flight.maxFwd = Econ.maxFwd(Game.economy);
    flight.accFwd = 0.74 * flight.maxFwd;
    flight.maxBoost = FLIGHT.MAX_BOOST * (flight.maxFwd / FLIGHT.MAX_FWD);
  }
  playerCraft?.setCraft(Game.economy.craft);
  S().craft = Game.economy.craft;
}

function boardNow() {
  return dockPad ? Game.missions.board(dockPad, Game.economy, simTime) : [];
}

function doAccept(job) {
  const r = Game.missions.accept(job, Game.economy, simTime);
  if (r.ok) {
    toast(`ACCEPTED · ${job.parcel.name} → ${job.dest.name}`, 'info', 3600);
    radio?.event('dispatch_confirm');
    audio?.click(1.2);
    persist();
  }
  boardJobs = boardNow();
  return { jobs: boardJobs, state: Game.economy,
    note: r.ok ? '' : r.why === 'slots' ? `Not enough room — ${r.free} free, needs ${r.need}.`
      : r.why === 'licence' ? 'Your licence does not cover that parcel type.'
        : 'That client is not taking calls right now.' };
}

function doHaggle(job) {
  const r = Game.missions.haggle(job, Game.economy, simTime);
  boardJobs = boardNow();
  persist();
  return { jobs: boardJobs, state: Game.economy,
    note: !r.ok ? 'You have already pushed this client this session.'
      : r.win ? `They blinked — +${Math.round(r.gain * 100)} %.`
        : 'They pulled the job. Five minutes before they take your call again.' };
}

function doCharge(units) {
  const r = Econ.buyCharge(Game.economy, units);
  if (r.units > 0) { audio?.click(0.8); persist(); }
  return { jobs: boardJobs, state: Game.economy,
    note: r.units > 0 ? `+${Math.round(r.units)} units · ${r.cost} CRD` : 'Nothing to buy.' };
}

function doBuy(fn, ok) {
  const r = fn();
  if (r.ok) { syncCraft(); audio?.payment(); persist(); }
  return { jobs: boardJobs, state: Game.economy,
    note: r.ok ? ok(r) : r.why === 'credits' ? `Short by ${r.short} CRD.`
      : r.why === 'licence' ? 'Licence tier too low.'
        : r.why === 'maxed' ? 'Already at L3.' : 'Not available.' };
}

// §7.2 — enter. `zones.canDock()` is the authority on all three conditions; main.js owns only the
// hold timer, the control lock and the 1.2 s re-dock grace.
function tickDock(dt) {
  if (!dockingOn) return;
  if (dockGrace > 0) dockGrace -= dt;
  if (dockPad) { easeToPad(dt); return; }
  const p = Game.player;
  const cand = zoneList.length ? padOf(zoneList[0].key) : null;
  const inside = !!cand
    && (cand.x - p.x) ** 2 + (cand.z - p.z) ** 2 <= VOLUME.radius * VOLUME.radius
    && p.y >= cand.y - 2 && p.y <= cand.y + VOLUME.height;
  // §3.1.1 spawns the craft ON the HUB deck, i.e. already inside a cylinder at zero speed. Without
  // this, the hold timer fires on the first second of every session: `?auto=1` would dock at boot
  // and never fly (taking gates_p2/p4/p5, budget and soak with it), and every `fly`-mode gate
  // would run under a full-screen board. Automatic docking therefore ARMS on leaving a cylinder;
  // the DOCK button covers the case where you are already standing on one.
  if (!inside) dockArmed = true;
  dockHold = dockArmed && inside && flight.speed < 3.5 ? dockHold + dt : 0;
  if (dockGrace <= 0 && Game.zones.canDock(cand, { x: p.x, z: p.z, y: p.y, speed: flight.speed, held: dockHold })) {
    doDock(cand);
  } else if (mode === 'fly' && !FLAG.nohud) {
    dockUI?.setPrompt(inside && flight.speed < 6 ? cand : null);
  }
}

function doDock(pad) {
  dockPad = pad;
  dockHold = 0;
  Game.dock = { pad: pad.key, type: Game.zones.displayType(pad, dispCtx()) };
  Game.missions.lock(pad.key);            // the board must not refresh under the player (§7.4.5)
  controls?.release();
  audio?.dockLock();

  // Deliver FIRST. A pad that is both your drop and the next board is one dock, not two — and
  // `deliver()` evaluates `othersHeld` once, before anything is removed, so two parcels dropping
  // on the same trip each earn a chain step.
  const res = Game.missions.deliver(pad, Game.economy, simTime);
  if (res.ok) {
    for (const r of res.receipts) toast(`+${r.credits} CRD · ${r.client ? r.client.name : 'CLIENT'}`, 'pay', 4200);
    if (res.promoted) toast(`LICENCE TIER ${res.tier}`, 'pay', 5200);
    audio?.payment();
    radio?.event('dispatch_pay');
    persist();
  }
  boardJobs = boardNow();
  dockUI?.show(padForPanel(pad), boardJobs, Game.economy);
  wantBlur = true;                        // §7.3's static blur, captured on the next rendered frame
  return res;
}

function doUndock() {
  if (!dockPad) return false;
  Game.missions.lock(null);
  dockPad = null;
  Game.dock = null;
  boardJobs = [];
  dockGrace = BOARD.REDOCK_GRACE;
  dockArmed = false;                      // re-arms on leaving the cylinder, not on the timer
  clientPanel?.hide();                    // releases the <video> connection, §9.6
  dockUI?.hide();
  persist();
  return true;
}

function dispCtx() {
  return { tier: Game.economy.tier, destKeys: Game.missions.destKeys(Game.economy) };
}
function padForPanel(pad) {
  return { ...pad, displayType: Game.zones.displayType(pad, dispCtx()) };
}

// §7.2 step 2: "the craft is eased to the pad centre and to level attitude over 0.5 s". A LERP,
// not a teleport — P7a's harness learned that the hard way when a teleporting tow made "never
// charge" the best strategy in the game.
function easeToPad(dt) {
  if (!flight || !dockPad) return;
  const k = 1 - Math.exp(-6 * dt);
  flight.px += (dockPad.x - flight.px) * k;
  flight.py += (dockPad.y + 2.4 - flight.py) * k;
  flight.pz += (dockPad.z - flight.pz) * k;
  flight.vx = flight.vy = flight.vz = 0;
  flight.speed = flight.hspeed = 0;
  flight.pitchT += (0 - flight.pitchT) * k;
  const p = Game.player;
  p.x = flight.px; p.y = flight.py; p.z = flight.pz; p.alt = flight.py; p.speed = 0;
}

// §7.4.3's tow. Free, always available, and it LIMPS at 12 m/s — the unflown remainder of the leg
// is flown, never discarded. Nothing here is a fail state (gate T9, falsified by F4).
function startTow() {
  Game.towing = true;
  const near = Game.zones.nearestCharge(Game.player.x, Game.player.z);
  towTarget = near ? near.pad : null;
  if (flight) flight.maxFwd = Econ.CELL.TOW_SPEED;
  toast('CELL FLAT — free tow to the nearest charge pad', 'warn', 5200);
}

function finishTow() {
  Econ.tow(Game.economy);                 // +15 units, 0 CRD
  Game.towing = false;
  towTarget = null;
  syncCraft();
  toast('TOW COMPLETE · 15 units, no charge', 'pay', 4200);
  persist();
}

function updateEconomy(dt, wdt) {
  const st = Game.economy, p = Game.player;
  const flying = (mode === 'fly' || mode === 'auto') && !dockPad;

  if (flying && dt > 0) {
    const r = Econ.tickCell(st, dt, { speed: flight.speed, boosting: !!flight.boostOn });
    if (r === 'flat' && !Game.towing) startTow();
  }
  p.cell = Econ.cellFrac(st);
  p.cargo = st.cargo;

  zoneAcc += dt;
  // `__game.setZones(list)` FORCES the list until it is cleared with `setZones(null)`. Without
  // this, the per-frame push silently overwrote the synthetic list gates_p6 injects to test the
  // minimap's dot-and-glyph drawing — the gate set its fixture, the loop replaced it a frame later,
  // and the gate reported a failure that was not in the code it was testing. This is the exact
  // shape of the cabin-isolation bug P6 found (`setSignVisible` undone by `updateHud`), so it gets
  // the same treatment: the override outranks the game logic.
  if (zonesForced === null && zoneAcc >= 1 / Math.max(1, Q.minimapFps)) {
    zoneAcc = 0;
    zoneList = Game.zones.zonesNear(p.x, p.z, ZONE_RADIUS, dispCtx());
    nearCharge = zoneList.find(z => z.charge) || null;
    minimap?.setZones(zoneList);
    const t = Game.missions.task(st, simTime);
    // The HUD's job shape (hud.js reads `client`/`parcel`/`dest`/`pay`/`timeLeft`/`timeTotal`);
    // `task()` returns the mission shape. Translating here keeps hud.js free of missions.js.
    Game.job = t ? {
      client: t.client ? t.client.name : 'CLIENT', parcel: t.parcel.name, dest: t.name,
      pay: t.base, km: t.km, rush: t.rush, timeLeft: t.timeLeft, timeTotal: t.limit, overdue: t.overdue,
      x: t.x, y: t.y, z: t.z, held: t.held, district: t.district,
    } : null;
    minimap?.setTarget(t ? { x: t.x, z: t.z, type: 'DROP', name: t.name } : null);
  }

  if (Game.towing) {
    const tgt = towTarget || (nearCharge ? { x: nearCharge.x, z: nearCharge.z } : null);
    if (tgt && Math.hypot(tgt.x - p.x, tgt.z - p.z) < VOLUME.radius * 1.5) finishTow();
  }

  zoneVis?.update(wdt, camera, zoneList,
    Game.job ? { x: Game.job.x, y: Game.job.y, z: Game.job.z, color: ZONE_TYPES.DROP.color } : null);

  if (mode === 'fly' || mode === 'auto') tickDock(dt);
  if (courier) tickCourier(dt);
}

// ── the `?courier=1` decision layer ───────────────────────────────────────
// `js/autopilot.js`'s Courier knows only how to fly to a point. This is the half that decides
// which point, and it is deliberately the `hop` policy `tools/sim_p7a.mjs` measures as the natural
// loop: take a job from the pad you landed on, fly it, take the next from wherever that put you.
// Written here rather than in autopilot.js so the flight side stays free of missions.js.

let courierDwell = 0, courierAge = 0, courierBest = Infinity, courierAvoid = null;

function tickCourier(dt) {
  const st = Game.economy;

  if (dockPad) {
    courierDwell += dt;
    if (courierDwell < 1.4) return;             // §7.2's panel read, at a machine's pace
    courierDwell = 0;
    if (dockPad.charge && Econ.cellFrac(st) < 0.5) doCharge(Infinity);
    const fits = boardJobs.filter(j => Game.missions.canAccept(j, st).ok).sort((a, b) => a.km - b.km);
    if (fits.length) doAccept(fits[0]);
    courierAvoid = dockPad.key;
    doUndock();
    courier.setTarget(null);
    return;
  }

  courierDwell = 0;
  if (courier.target) {
    // Watchdog. A target the pilot is not closing on is a wall, not a destination — and "the
    // analytic flight model cannot see a wall the autopilot gets stuck on" is exactly the gap this
    // soak exists to close, so it must be visible rather than silently absorbed.
    courierAge += dt;
    if (courier.dist < courierBest - 5) { courierBest = courier.dist; courierAge = 0; }
    if (courierAge < 30) return;
    courierAvoid = null;
    courier.setTarget(null);
  }
  courierAge = 0; courierBest = Infinity;

  // Charge before it becomes a tow, unless something is already about to expire.
  if (Game.towing || Econ.cellFrac(st) < 0.22) {
    const c = nearCharge || (Game.zones.nearestCharge(Game.player.x, Game.player.z) || {}).pad;
    if (c) { courier.setTarget({ x: c.x, y: c.y, z: c.z }); return; }
  }
  const t = Game.missions.task(st, simTime);
  if (t) { courier.setTarget({ x: t.x, y: t.y, z: t.z }); return; }

  const next = zoneList.find(z => (z.kind === KIND.PAD || z.kind === KIND.HUB)
    && z.dist > 40 && z.key !== courierAvoid);
  if (next) courier.setTarget({ x: next.x, y: next.y, z: next.z });
}

// The one data model both §8.2's dash and the chase strip read, so they can never disagree. P7a
// fills `job`, `nearest` and the real cell curve; every field degrades to a drawn placeholder
// rather than to a blank panel, which is what keeps those code paths exercised before P7a lands.
function hudData() {
  const p = Game.player;
  const f = flight;
  const cell = p.cell === undefined ? 1 : p.cell;
  // zonesNear() already returns the list distance-sorted with `dist` on every row, so this is the
  // nearest zone by construction rather than by a re-sort of the minimap's copy.
  const nearest = zoneList.length ? { ...zoneList[0], km: zoneDist(zoneList[0]) / 1000 } : null;
  const chat = ui.state().chatter;
  return {
    speed: f ? f.speed : p.speed, maxSpeed: f ? f.maxFwd : FLIGHT.MAX_FWD,
    alt: p.alt, cell, cargo: Array.isArray(p.cargo) ? p.cargo.length : 0,
    // §5.2's hull slots plus §7.4.9's cargo line. Was hard-coded 3, which was wrong for the 2-slot
    // starter in both directions.
    cargoMax: Game.economy ? Econ.cargoSlots(Game.economy) : 3,
    heading: f ? f.heading : p.heading,
    boost: !!(f && f.boostOn), altHold: !!(f && f.altHold !== null),
    place: city ? city.districtName(cityR && Number.isFinite(cityR.ccx)
      ? city.districtAt(cityR.ccx, cityR.ccz).id : 'spine') : '',
    job: Game.job || null,
    task: Game.job ? { name: Game.job.dest, km: Game.job.km, eta: Game.job.timeLeft } : null,
    nearest,
    // §7.4.1's readout, from economy.js's real drain curve. `HUD.CELL_PER_MIN` — the placeholder
    // that stood here — is DELETED, not left beside its replacement (obligation T3's lesson): it
    // modelled 28 minutes from full where the cruise curve gives 5.2, so the dash and the holo
    // panel would have given two different answers to the same question.
    cellMinutes: Game.economy ? Econ.secondsLeft(Game.economy, { speed: f ? f.speed : 0 }) / 60 : 0,
    // undefined → "charge pads unmapped". A boolean once the zone field has placed one in range.
    chargeInRange: !zoneList.length ? undefined
      : nearCharge
        ? nearCharge.dist < Econ.secondsLeft(Game.economy, { speed: f ? f.maxFwd : FLIGHT.MAX_FWD })
          * (f ? f.maxFwd : FLIGHT.MAX_FWD)
        : false,
    comms: chat ? { speaker: chat.speaker, level: clamp(chat.left / Math.max(0.001, chat.hold), 0, 1) } : null,
  };
}

const _hudFwd = new THREE.Vector3();
function updateHud(dt) {
  if (!cockpit) return;
  const t0 = performance.now();
  hudT += dt;
  ui.update();

  const show = cockpitShown();
  cockpit.setVisible(show);
  const inFlight = mode === 'fly' || mode === 'auto';
  chaseStrip.setVisible(inFlight && !show && !FLAG.nohud);

  const data = hudData();
  if (show) {
    camera.getWorldDirection(_hudFwd);
    cockpit.update(dt, {
      x: flight ? flight.px : camera.position.x,
      y: (flight ? flight.py : camera.position.y) - (flight ? 0 : FLIGHT.COCKPIT.height),
      z: flight ? flight.pz : camera.position.z,
      // §6.1 has the craft heading chasing the camera yaw at 2.6 rad/s, so a sustained turn holds
      // a steady heading error — and with the cabin anchored to the craft (see hud.js) nothing
      // bounded how far it could swing. The first portrait capture caught it: mid-turn the dash
      // had slid bodily off the left edge of the screen, taking the game's only speed readout
      // with it. The lag is what makes the frame lean into a turn, so it is kept and CLAMPED.
      heading: flight
        ? camera.rotation.y + clamp(wrapAngle(flight.heading - camera.rotation.y),
          -HUD.CABIN_YAW_LAG, HUD.CABIN_YAW_LAG)
        : camera.rotation.y,
      bank: flight ? flight.bank : 0,
      vpitch: flight ? flight.vpitch * FLIGHT.COCKPIT.pitchMul : 0, fwd: _hudFwd,
      speed: data.speed, rain: sky.p.rain, contact: !!(flight && flight.contact > 0),
      eye: camera.position, data,
    });
  }
  chaseStrip.draw(data);

  if (inFlight || mode === 'shot') {
    minimap.update(dt, {
      x: Game.player.x, z: Game.player.z, alt: Game.player.alt,
      // Same convention as flight.lookDir(): forward is (-sin h, ·, -cos h), which is the camera's
      // own YXZ yaw. Negating it here would mirror the whole map and nothing would look wrong.
      heading: flight ? flight.heading : camera.rotation.y,
      cityR, city, traffic, vehT, t: hudT,
    });
  }
  msHud.push(performance.now() - t0);
}

// The player craft is drawn when there is a craft to draw and a viewpoint outside it: the chase
// rig, or a shot scenario that asked for one. In `free` mode — which is what every fixed-camera
// pixel gate puts the page into — it is OFF, so a P1a/P2/P3a/P3b probe can never be measuring a
// hull that happened to be parked in its frame.
function craftShown() {
  if (!playerCraft || !playerCraft.visible) return false;
  // A shot only gets a craft if its scenario asked for one AND craft.js has a pose for it.
  // `canyon_dive` has craft:false and no SHOT_CRAFT row; without both halves of this test it threw
  // once a frame and the shot rendered anyway, which is the P0-through-P4 failure mode exactly.
  if (mode === 'shot') return !!(scenario && scenario.craft && SHOT_CRAFT[scenario.id]);
  if (mode === 'fly' || mode === 'auto') return rig ? rig.mode === 'chase' : false;
  return false;
}

// §5's whole per-frame cost, in one place. `t` is frozen by `freezeTime` exactly as the signage
// clock is, so every differencing gate sees a still city AND still traffic.
let sheetHold = false;
function updateVehicles(dt, t) {
  if (!craftFields || sheetHold) return;
  vehT += dt;
  craftFields.begin();
  if (craftShown()) {
    const p = flight && (mode === 'fly' || mode === 'auto')
      ? playerCraft.fromFlight(flight, vehT)
      : playerCraft.fromCamera(camera, SHOT_CRAFT[scenario ? scenario.id : 'hero_craft'], vehT);
    craftFields.write(p);
  }
  traffic.update(dt, vehT, camera.position, craftFields,
    flight && (mode === 'fly' || mode === 'auto') ? Game.player : null);
  craftFields.flush();
  void t;
}

// The ONE place a settings change takes effect, so "which object owns look sensitivity?" cannot
// become a three-place bug. §6.5's flight-affecting rows all land here.
function applyFlightSettings(st) {
  // P8's three volume rows land in the same settings object and take effect through the same
  // callback, so there is one place a settings change is applied and not two.
  audio?.applySettings();
  if (!flight) return;
  flight.sens = clamp(+st.lookSens || 1, 0.5, 2);
  flight.invert = !!st.invertLook;
  flight.assists = st.assists === 'reduced' ? 'reduced' : 'on';
  rig?.setMode(st.camera);
  rig?.setFov(+st.fov || CAMERA.fov);
  controls?.setFlip(st.flipSides);
  controls?.setButtonSize(+st.altBtn || 56);
  minimap?.setRotate(st.mapRotate !== false);       // §8.6's one setting
  if (st.quality && st.quality !== 'auto' && (st.quality === 'low') !== (Q.name === 'low')) {
    window.__game?.setQuality(st.quality);
  }
}

sky.setVariant(forcedVariant);
sky.setClock(clock);
sky.update(0, clock);
sky.bakeEnv(true);
syncGrade();

// §3.2.3 — the 5x5 near ring is generated at boot behind the loading bar, so the first flight
// frame is never the first generation frame. Runs after the camera has been placed by the spawn,
// a shot scenario or the autopilot, because the ring is centred on wherever that left it.
if (cityR) {
  camera.updateMatrixWorld(true);
  cityR.update(camera.position, performance.now());
  msPrewarm = cityR.prewarm();
  // P5. The four craft programs and the streak program compile on FIRST USE, and first use is the
  // frame a craft first enters the near band — mid-flight, several seconds in. gates_p2 caught it:
  // its worst frame over a 20 s ?auto=1 flight went from 1.4 ms to 39.7 ms with nothing else
  // changed. Drawing one instance of every vehicle field here, behind the loading bar, moves that
  // compile to boot where the city's own pre-warm already lives. `renderer.compile` walks the scene
  // and builds the programs for everything visible in it, which is exactly what is wanted.
  if (craftFields && traffic) {
    craftFields.begin();
    for (const id of Object.keys(CRAFT_DEFS)) {
      craftFields.write({ def: CRAFT_DEFS[id], x: camera.position.x, y: -4000, z: camera.position.z,
        yaw: 0, pitch: 0, roll: 0, throttle: 0.8, t: 0 });
    }
    craftFields.flush();
    traffic.update(0.016, 0, camera.position, null, null);
    camera.updateMatrixWorld(true);
    renderer.compile(scene, camera);
    craftFields.begin();
    craftFields.flush();
  }
  const p = camera.position;
  Game.player.x = p.x; Game.player.y = p.y; Game.player.z = p.z; Game.player.alt = p.y;
  Game.city = { model: city, render: cityR };
}

// Move the debug camera to whichever gate is being run: ?debug=1&view=tiling|depth|band|boxes.
const viewName = new URLSearchParams(location.search).get('view');
if (probeScene && viewName && VIEWS[viewName]) setCamera(VIEWS[viewName]);

let inputOverride = null;

// Placing the camera by hand PARKS the flight rig. Every P1a/P2/P3a/P3b gate positions the camera
// through this and then measures pixels; without the park, the rig would put it back on the next
// frame and each of those gates would silently start measuring the spawn point.
function setCamera(v) {
  if (flight && mode !== 'shot') mode = 'free';
  camera.position.fromArray(v.pos);
  camera.rotation.order = 'YXZ';
  camera.rotation.set((v.pitch || 0) * Math.PI / 180, (v.yaw || 0) * Math.PI / 180, 0);
  if (v.fov) camera.fov = v.fov;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

// ── the master loop ────────────────────────────────────────────────────────

let last = performance.now();
let frames = 0, drawn = 0;
let fpsAcc = 0, fpsFrames = 0, fpsAvg = 60;
const msSim = new Roll(90), msRender = new Roll(90), msFrame = new Roll(90), msGen = new Roll(90);
const msFly = new Roll(90);
let lastDt = 0;

function frame(now) {
  raf = requestAnimationFrame(frame);
  if (contextLost) return;

  let dt = (now - last) / 1000;
  last = now;
  if (resumeClamp) { dt = Math.min(dt, 0.05); resumeClamp = false; }
  dt = clamp(dt, 0, 0.05);
  lastDt = dt;
  simTime += dt;

  const t0 = performance.now();

  if (clockRunning) clock = (clock + dt / 180) % 24;   // 3 real minutes per in-game hour
  update(dt);

  const t1 = performance.now();
  msSim.push(t1 - t0);

  // The generation budget of §3.2.3 is measured against the FRAME's t0, not against the city's
  // own entry point, because the rule is "defer the next unit if the frame is already past 6 ms".
  msGen.push(cityR ? cityR.update(camera.position, t0) : 0);
  const t1b = performance.now();

  // Without this the counters climb forever and every gate reads garbage.
  renderer.info.reset();
  // §4.6's blue-noise dither scrolls on this. It is the last thing in the frame that still moves
  // under freezeTime, and it moves by +/- 1/255 EVERYWHERE — 0.0004 of luminance, which is the
  // same size as the differences P3b's gates measure a layer by. Freezing it removes the noise
  // floor those measurements would otherwise sit on.
  if (!timeFrozen) gradePass.uniforms.uTime.value = now / 1000;
  composer.render(dt);

  // Pixel readback has to happen in the same task as the render, before the browser composites.
  probes.service();

  // §7.3's static-blur panel background. IN this rAF callback and immediately after the render,
  // because reading the WebGL canvas outside it returns an empty buffer unless
  // `preserveDrawingBuffer: true`, which we do not want and do not need. One frame per dock, not
  // one per frame: `wantBlur` is set when a panel opens and cleared here.
  if (wantBlur) {
    wantBlur = false;
    const url = captureBlur(renderer.domElement);
    clientPanel?.setBackdrop(url);
    if (url && dockUI) dockUI.setBackdrop(url);
  }

  const t2 = performance.now();
  msRender.push(t2 - t1b);
  msFrame.push(t2 - t0);

  frames++; drawn++;
  if (drawn === 3 && !window.__ready) {
    window.__ready = true;
    // §10.3's HEAD sweep and the chatter prefetch both hang off this. It is a DEADLINE, not a
    // request: the sweep starts 1.0 s of radio time after the call and the prefetch 1.5 s after,
    // which is what keeps 73 requests and 10 MB off the critical path.
    radio?.scheduleDeferredLoads();
    document.getElementById('boot').classList.add('fade');
    setTimeout(() => document.getElementById('boot').classList.add('hidden'), 520);
  }

  fpsFrames++; fpsAcc += dt;
  if (fpsAcc >= FPS_GUARD.window) {
    fpsAvg = fpsAvg * 0.5 + (fpsFrames / fpsAcc) * 0.5;
    fpsAcc = 0; fpsFrames = 0;
    guardQuality();
  }

  if (FLAG.perf) {
    perfAcc += dt;
    if (perfAcc > 0.25) { perfAcc = 0; drawPerf(); }
  }
}

function update(dt) {
  // P4 (§6). Broken out into its own timer rather than folded into ms.sim, because "what does
  // flight cost per frame" is a question the handoff has to answer with a number and the sky
  // pass is 20x its size.
  if (flight && (mode === 'fly' || mode === 'auto')) {
    const tf = performance.now();
    let inp = autopilot ? autopilot.read(simTime, flight, dt)
      // `__game.flyTo()` — a test-only ferry for the CDP delivery script. It is the SAME Courier
      // `?courier=1` uses, emitting the same `emptyInput()` struct a thumb emits, so what it
      // exercises is the real flight model, the real collision and the real assists. It is not a
      // teleport, and the gate asserts the distance actually flown.
      : ferry ? ferry.read(simTime, flight, dt) : controls.read();
    // §7.2 step 2: "controls lock". A docked craft reads a zeroed stick rather than being skipped,
    // so the model still damps and the alt-hold assist still unwinds — then easeToPad() writes the
    // pose. Skipping flight.update entirely leaves whatever the last frame's velocity was in the
    // model and it fires the instant you undock.
    // Gate hook. A synthetic input is applied ON TOP of the live one so a test can hold a stick
    // for four seconds without a CDP round trip per frame — which is the only way the auto-stop
    // curve can be sampled in the browser at all. It MUTATES `inp` on purpose: §2.7's
    // `__state.input` reads the same object, and a copy here would report the stick the gate is
    // not holding.
    if (inputOverride) inp = Object.assign(inp, inputOverride);
    // …and the dock lock outranks both, on a frozen struct nothing can write through.
    if (dockPad) inp = DOCK_INPUT;
    flight.update(dt, inp, cityR);
    rig.update(dt, cityR);
    const p = Game.player;
    p.x = flight.px; p.y = flight.py; p.z = flight.pz; p.alt = flight.py;
    p.speed = +flight.speed.toFixed(3); p.heading = flight.heading;
    msFly.push(performance.now() - tf);
  }
  // Frozen only by the gate: signage flicker, pulse and the ticker scroll all move on uTime, and
  // a measurement of the LOD ramp taken while they move measures the flicker (`freezeTime`).
  if (!timeFrozen) { U.uTime.value = simTime; signage?.update(dt, simTime); }
  sky.setVariant(forcedVariant);
  sky.update(dt, clock);
  variant = forcedVariant || sky.p.name;
  aerial();
  syncGrade();

  const wdt = timeFrozen ? 0 : dt;
  // P7a (§7). After the flight block, because the cell drain, the dock test and the zone list are
  // all functions of this frame's pose; before updateHud, because the dash reads what it produces.
  if (Game.zones) updateEconomy(dt, wdt);
  updateVehicles(wdt, simTime);
  // P6 (§8). After the rig and the vehicles, because the cabin is anchored to the craft's pose
  // and the minimap's rear arc reads the traffic list. Frozen by `freezeTime` for the same reason
  // everything else is: a differencing gate must see a still frame, and a needle that sweeps or a
  // minimap that repaints is motion in the measurement.
  updateHud(wdt);
  weather?.update(wdt, camera.position, sky.p.rain, camera.getWorldDirection(_fwd));
  reflect?.update(wdt, sky.p.rain);
  silhouettes?.update(wdt, simTime, cityR, camera.position);
  // §4.5's real anchoring: the widest gaps in the near ring, recomputed only when the camera
  // changes chunk and only in a variant that has shafts at all. §3.7(a)'s city glow rides the
  // same trigger — its hue is "the average of the nearby districts' palettes", and the district
  // under the camera cannot change without the chunk changing.
  // `Number.isFinite` is load-bearing: CityRenderer.applyQuality sets ccx/ccz to NaN to force the
  // next retarget, and NaN !== shaftCx is true, so without this the glow and the shaft anchors
  // both ran for one frame on a NaN chunk — districtAt(NaN) indexes DISTRICTS[NaN] and throws,
  // once per frame, forever. It only shows up after a live quality switch, which is the one path
  // no shot or gate had been taking.
  if (cityR && Number.isFinite(cityR.ccx) && (cityR.ccx !== shaftCx || cityR.ccz !== shaftCz)) {
    shaftCx = cityR.ccx; shaftCz = cityR.ccz;
    sky.anchorShafts(cityR, camera.position);
    updateGlow();
  }

  // ── P8 (§10.1, §10.4) ────────────────────────────────────────────────────
  // Last in the frame, so the context object below reads THIS frame's flight and zone state and
  // not the previous one's. Both are total no-ops before the AudioContext is unlocked, so a player
  // who has not touched the screen yet pays nothing for them.
  const cin = controls ? controls.inp : (autopilot ? autopilot.inp : null);
  audio?.update(dt, {
    speed: clamp(Game.player.speed / FLIGHT.MAX_FWD, 0, 1),
    speedMs: Game.player.speed,
    thrust: cin ? Math.min(1, Math.hypot(cin.moveX, cin.moveY)) : 0,
    boost: cin ? !!cin.boost : false,
    rain: weather ? weather.amount : 0,
    // §10.1's zone-proximity pulse. `r` is §7.1's cylinder radius, so the tone rises over the last
    // 14 m of the approach and is silent everywhere else.
    zone: zoneList.length ? { d: zoneList[0].dist, r: VOLUME.radius * 6 } : null,
  });
  radio?.update(dt, {
    docked: !!Game.dock,
    // §10.3 rule 4's `rush`: a rush parcel inside the last 30 s of its limit.
    rush: !!(Game.job && Game.job.rush && Game.job.timeLeft < 30),
    variant,
    night: clock < 6 || clock > 19,
    firstFlight: Game.economy ? Game.economy.stats.jobs === 0 && mode === 'fly' : false,
    nearHub: !!(zoneList.length && zoneList[0].kind === KIND.HUB && zoneList[0].dist < 300),
    district: cityR && Number.isFinite(cityR.ccx) ? city.districtAt(cityR.ccx, cityR.ccz).id : undefined,
  });
}

// ── DECISIONS decision 11 — the altitude gate ──────────────────────────────
// Two ramps, both exactly zero below AERIAL.y0, so the street pays nothing. See config.AERIAL for
// why the fog's height term is the lever and why this needs no extra draws, no second LOD scheme
// and no change to §3.2.1's static table (which budget.mjs still re-derives from config.FOG with
// no rendering).
let shaftCx = NaN, shaftCz = NaN;
let aerialK = 0, aerialForced = null;
const _fwd = new THREE.Vector3();

// §3.7(a) — "a saturated horizon band of city glow whose hue is the AVERAGE OF THE NEARBY
// DISTRICTS' palettes, warm sodium at the bottom". The average is taken over the 3x3 chunks
// around the camera, weighted equally, so crossing a district boundary shifts the reflection
// rather than switching it.
function updateGlow() {
  if (!cityR) return;
  let r = 0, g = 0, b = 0, n = 0;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const d = districtAt(cityR.ccx + dx, cityR.ccz + dz, city ? city.seed : WORLD_SEED);
      // the SIGN palette, not the window palette: what lights the air over a street is its neon.
      r += ((d.sign >> 16) & 255); g += ((d.sign >> 8) & 255); b += (d.sign & 255); n++;
    }
  }
  const hex = (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  // NOT `bakeEnv(true)`. The glow is folded into §3.7(a)'s env SIGNATURE, so sky.update's own
  // 0.25 s check picks the change up on its own — and a forced PMREM here fires on every chunk
  // crossing, which during a fast flight is several a second. Measured: it put a 10.5 ms spike
  // into the frame that crossed the boundary, against §3.2.3's 1.4 ms generation cap, because the
  // driver stalls behind the PMREM render and the chunk pump is the next thing in the frame.
  sky.setGlow(hex, 0xff9a4a, 1);
  // §3.7(c)'s `uRim` is "the local district's neon tint", and this is already the local district's
  // neon tint averaged over the 3x3 — so the hull rim and the sky glow can never disagree about
  // what colour the city is.
  craftFields?.setRim(hex);
}

function aerial() {
  const y = camera.position.y;
  const k = aerialForced !== null ? aerialForced
    : clamp((y - AERIAL.y0) / (AERIAL.y1 - AERIAL.y0), 0, 1);
  const s = k * k * (3 - 2 * k);            // smoothstep: no crease at either end of the climb
  aerialK = s;
  U.uCamY.value = y;
  U.uRayMean.value = s * AERIAL.rayMean;
  // sky.js has just written the variant's own fog.far; scale it after, so the two never fight.
  scene.fog.far *= 1 + (AERIAL.farMul - 1) * s;
}

// §2.5. Disabled under ?shot or every thumbnail is a lite render.
function guardQuality() {
  if (downgraded || FLAG.shot || userPickedHigh) return;
  if (fpsAvg > FPS_GUARD.floor) return;
  downgraded = true;
  Q.bloom = false;
  Q.ringFar = 0;
  cityR?.applyQuality(Q);
  Q.pixelRatio = FPS_GUARD.pixelRatio;
  renderer.setPixelRatio(FPS_GUARD.pixelRatio);
  buildComposer();
  onResize();
  toast('Graphics lowered to keep it smooth');
}

function drawPerf() {
  const info = renderer.info.render;
  perfEl.textContent =
    `${fpsAvg.toFixed(0)} fps   ${Q.name}${downgraded ? '↓' : ''}   dpr ${renderer.getPixelRatio().toFixed(2)}\n` +
    `draws ${info.calls}   tris ${(info.triangles / 1000).toFixed(1)}k\n` +
    `sim ${msSim.mean.toFixed(2)}  gen ${msGen.mean.toFixed(2)}  rnd ${msRender.mean.toFixed(2)}  fly ${msFly.mean.toFixed(3)}\n` +
    `frame ${msFrame.mean.toFixed(2)} / worst ${msFrame.worst.toFixed(2)}\n` +
    (flight ? `${flight.speed.toFixed(0)} m/s  alt ${flight.py.toFixed(0)} m  `
      + `${flight.altHold !== null ? 'HOLD' : flight.boostOn ? 'BOOST' : mode}`
      + `${flight.contact > 0 ? '  CONTACT' : ''}\n` : '') +
    `${variant}  t${clock.toFixed(1)}  ` +
    (cityR ? `ch ${cityR.live.size}/${cityR.queue.length}q  L0 ${cityR.state().lod0}` : 'no city') +
    `  err ${errors.length}`;
}

// ── pixel probes ───────────────────────────────────────────────────────────
// js/probe.js. Screenshots alone miss this whole class of bug: "is the fog band at 90-260 m",
// "is there blue in the daysmog frame", "did the LOD cross-fade spread the swap" are all
// questions about NUMBERS in the composed frame.

const probes = makeProbe(renderer, camera, THREE);
const probe = probes.probe;


// ── test hooks (§2.7) ──────────────────────────────────────────────────────

Object.defineProperty(window, '__state', {
  get() {
    const info = renderer.info.render;
    const p = Game.player;
    return {
      fps: +fpsAvg.toFixed(1),
      // The sim's own clock. soak.mjs reads this and never wall-clock elapsed — the software
      // renderer runs the sim slower than wall time and every derived rate would be wrong.
      t: +simTime.toFixed(3),
      dt: +lastDt.toFixed(4),
      ms: {
        sim: +msSim.mean.toFixed(3),
        gen: +msGen.mean.toFixed(3),
        // §3.2.3's cap is on the WORST generating frame, not on the rolling mean — a 1.2 ms cap
        // averaged over 90 frames of which four generate is 0.05 ms and passes anything.
        genWorst: +msGen.worst.toFixed(3),
        // §6's own cost: input read + flight integration + collision + the camera rig.
        fly: +msFly.mean.toFixed(4),
        flyWorst: +msFly.worst.toFixed(4),
        // §8's own cost: the cabin matrix, the dash and holo canvases at their own rates, the
        // look-away fade, the minimap and both DOM surfaces. Broken out for the same reason
        // ms.fly is — "what does the HUD cost" is a question the handoff answers with a number.
        hud: +msHud.mean.toFixed(4),
        hudWorst: +msHud.worst.toFixed(4),
        render: +msRender.mean.toFixed(3),
        post: 0,
        frame: +msFrame.mean.toFixed(3),
        worst: +msFrame.worst.toFixed(3),
      },
      draws: info.calls,
      tris: info.triangles,
      quality: Q.name,
      downgraded,
      mode,
      audio: actx ? actx.state : null,
      // P8 (§10). `audioBus` is the master/mix side, `radio` the director, the pools and the
      // per-slot absence report.
      audioBus: audio ? audio.state() : null,
      radio: radio ? radio.state() : null,
      // Missing OPTIONAL audio, kept out of `errors` on purpose — see reportAudio().
      audioIssues,
      parked: parked,
      variant,
      clock: +clock.toFixed(3),
      frames,
      player: { x: p.x, y: p.y, z: p.z, alt: p.alt, speed: p.speed, heading: p.heading, cell: p.cell, cargo: p.cargo },
      city: cityR ? cityR.state() : { chunks: 0, queued: 0, lod0: 0, lod1: 0, lod2: 0 },
      // P7a (§2.7). `Game.economy` is the source of truth from construction onward and the profile
      // is its mirror — reading S() here would report the last flushed save, not the live state.
      // `dist` is derived rather than read: `__game.setZones()` takes a caller's list, and a
      // synthetic fixture legitimately carries only x/z. Reading `.dist.toFixed()` off one threw,
      // and because `__state` is a single getter that took the WHOLE debug surface down with it.
      zone: zoneList.length
        ? { key: zoneList[0].key, type: zoneList[0].type, name: zoneList[0].name,
          dist: +zoneDist(zoneList[0]).toFixed(1) }
        : null,
      dock: Game.dock,
      job: Game.job,
      board: boardJobs.length,
      credits: Game.economy ? Game.economy.credits : S().credits,
      tier: Game.economy ? Game.economy.tier : S().tier,
      lifetime: Game.economy ? Game.economy.lifetime : S().lifetime,
      cargo: Game.economy ? Game.economy.cargo.length : 0,
      cell: Game.economy ? +Econ.cellFrac(Game.economy).toFixed(4) : null,
      cellUnits: Game.economy ? +Game.economy.cellUnits.toFixed(2) : null,
      towing: Game.towing,
      stats: Game.economy ? { ...Game.economy.stats } : null,
      zones: Game.zones ? { ...Game.zones.stats(), drawn: zoneVis ? zoneVis.cyl.count : 0,
        near: zoneList.length } : null,
      missions: Game.missions ? Game.missions.stats() : null,
      dockUI: dockUI ? dockUI.stateOf() : null,
      clientPanel: clientPanel ? clientPanel.stateOf() : null,
      rt: { w: composer.renderTarget1.width, h: composer.renderTarget1.height, samples: composer.renderTarget1.samples },
      sky: sky.probe(),
      // P3b (§3.7, §3.9, §4.4, decision 11)
      weather: weather ? weather.state() : null,
      reflect: reflect ? reflect.breakdown() : null,
      silhouettes: silhouettes ? silhouettes.state() : null,
      aerial: { k: +aerialK.toFixed(4), rayMean: +U.uRayMean.value.toFixed(4),
        fogFar: +scene.fog.far.toFixed(1), y0: AERIAL.y0, y1: AERIAL.y1 },
      haze: { gamma: gradePass ? +gradePass.uniforms.uGamma.value.x.toFixed(4) : HAZE.gamma },
      // P4 (§6). `flight` is the model's own view; `input` is what the last frame was told to do.
      flight: flight ? flight.state() : null,
      rig: rig ? rig.state() : null,
      // P5 (§5). `craft` is the shared vehicle fields — the player and every promoted traffic
      // craft are instances of the same four meshes — and `traffic` is §5.5's population.
      craft: craftFields ? { ...craftFields.breakdown(), shown: craftShown(),
        id: playerCraft ? playerCraft.id : null, t: +vehT.toFixed(3) } : null,
      traffic: traffic ? traffic.state() : null,
      // P6 (§8). `hud` is the cabin, `map` the minimap, `ui` the two DOM surfaces.
      hud: cockpit ? { ...cockpit.state(), shown: cockpitShown(),
        strip: chaseStrip ? chaseStrip.shown : null, ...cockpit.breakdown() } : null,
      map: minimap ? minimap.state() : null,
      ui: ui.state(),
      input: flight ? { ...(autopilot ? autopilot.inp : controls.inp) } : null,
      auto: autopilot ? autopilot.state() : null,
      aces: acesOn,
      atlas: { ms: atlas.msBuild, size: atlas.windows.image.width, cell: atlas.windows.userData.cell,
        gutter: atlas.windows.userData.gutter, mips: atlas.windows.userData.levels,
        noise: atlas.noise.image.width },
      bloom: bloomPass ? { strength: +bloomPass.strength.toFixed(3), threshold: bloomPass.threshold } : null,
      debugScene: probeScene ? probeScene.count : 0,
      errors,
    };
  },
});

window.__game = {
  scene, camera, renderer, three: THREE,
  get quality() { return Q; },
  scenarios: SCENARIOS,
  variants: VARIANTS,
  frames: () => frames,

  teleport(x, y, z) {
    camera.position.set(x, y, z);
    Game.player.x = x; Game.player.y = y; Game.player.z = z; Game.player.alt = y;
    // Moves the CRAFT, not just the eye — otherwise the rig drags the camera back next frame and
    // gates_p2's spawn check would be asking about a point the player is not at.
    if (flight) { flight.px = x; flight.py = y; flight.pz = z; flight.vx = flight.vy = flight.vz = 0; }
  },

  // ── P4 gates (§5.2, §6) ──────────────────────────────────────────────────
  get flight() { return flight; },
  get controls() { return controls; },
  get rig() { return rig; },
  settings: () => S().settings,
  applySettings(patch) { Object.assign(S().settings, patch); applyFlightSettings(S().settings); settingsUI?.refresh(); return S().settings; },
  openSettings: on => (settingsUI ? (on === false ? settingsUI.hide() : settingsUI.show(), settingsUI.open) : null),
  // Park / unpark the rig without a reload, so one page can run the fixed-camera pixel gates and
  // the flight gates in either order.
  setFlight(on) { if (!flight) return null; mode = on === false ? 'free' : (autopilot ? 'auto' : 'fly'); return mode; },
  setInput(o) { inputOverride = o || null; return inputOverride; },
  flightReset: (x, y, z, yaw = 0, pitch = 0) => (flight ? (flight.reset(x, y, z, yaw, pitch), flight.state()) : null),
  // §6.3 item 1's proof. Pinning the visual bank to its extreme must move the CAMERA and must not
  // move the VELOCITY. A control that changes nothing at either end is a broken experiment.
  forceBank(v) { if (!flight) return null; flight.bankForce = (v === null || v === undefined) ? null : +v; return flight.bankForce; },
  // §6.3's tangential slide term, as a live multiplier. gates_p4 runs the wall test twice — once
  // at 1 and once at 0 — because "the craft slid clear" is only evidence if the same craft with
  // the assist removed demonstrably does NOT. Restore to 1 after use.
  setSlide(k) { FLIGHT.SLIDE = k === null || k === undefined ? 1 : +k; return FLIGHT.SLIDE; },
  controlsProbe: () => (controls ? controls.probe() : null),
  // Clears the INPUT LAYER — every held key, button and touch. Returns `true` when it actually
  // ran and `null` when there is no controls object (?auto=1), so a caller can tell "released"
  // from "there was nothing to release". A hook whose success and its absence look identical is
  // the defect obligation T10 was raised about.
  releaseControls: () => (controls ? (controls.release(), true) : null),
  flyCost: () => ({ mean: +msFly.mean.toFixed(4), worst: +msFly.worst.toFixed(4) }),
  setVariant(n) {
    forcedVariant = n === null ? null : (typeof n === 'number' ? VARIANTS[n % VARIANTS.length] : n);
    sky.setVariant(forcedVariant);
    if (forcedVariant) { variant = forcedVariant; clockRunning = false; }
    sky.update(0, clock); syncGrade(); sky.bakeEnv(true);
    return variant;
  },
  setQuality(q) {
    Q = preset(q === 'low');
    Game.quality = Q;
    downgraded = false;
    renderer.setPixelRatio(Math.min(devicePixelRatio, FLAG.dpr !== null ? FLAG.dpr : Q.pixelRatio));
    scene.fog.far = Q.fogFar;
    cityR?.applyQuality(Q);
    buildP3b();
    // §2.5's rule is "a quality change is a REBUILD" — but the vehicle fields are sized from HIGH
    // unconditionally (~30 KB of typed array), so for these it is a count change and the meshes,
    // materials and compiled programs survive untouched. Re-registering is not optional:
    // buildP3b() has just replaced signage.derived with the new Reflections' own list.
    traffic?.applyQuality(Q);
    // §2.5 again: the dash and holo canvases are half-size on LOW and redraw at half the rate, so
    // the cabin is genuinely rebuilt rather than reconfigured. It is ~200 triangles and two small
    // canvases — the cheapest rebuild in the project.
    if (cockpit) {
      const wasVisible = cockpit.visible;
      cockpit.dispose();
      cockpit = new Cockpit(scene, Q, sky, atlas);
      cockpit.setVisible(wasVisible);
    }
    minimap?.setHz(Q.name === 'low' ? HUD.MAP_HZ_LOW : HUD.MAP_HZ);
    registerDerived();
    buildComposer();
    onResize();
  },

  // ── P7a hooks (§7) ───────────────────────────────────────────────────────
  // Every one returns `null` when the thing it drives does not exist, and never a value that
  // could be mistaken for "it worked" (obligation T10).
  get zones() { return Game.zones; },
  get missions() { return Game.missions; },
  get economy() { return Game.economy; },
  econ: Econ,
  // T7's isolation. NOT optional and NOT `&&`-guarded at the call site: additive DoubleSide
  // cylinders ride the same frame §3.2.2's dither gate measures. Returns null when there is no
  // zone layer at all, which is distinguishable from `false`.
  setZonesVisible(v) {
    if (!zoneVis) return null;
    zoneVis.setVisible(v !== false);
    return zoneVis.group.visible;
  },
  zonesNear: (r = ZONE_RADIUS) => (Game.zones
    ? Game.zones.zonesNear(Game.player.x, Game.player.z, r, dispCtx()) : null),
  zoneList: () => zoneList,
  // Teleport to a pad and dock it, without flying there. `id` is a pad key ('cx,cz'), or omitted
  // for the nearest pad in range.
  forceDock(id) {
    if (!Game.zones || !flight) return null;
    const pad = id ? padOf(id) : (zoneList.length ? padOf(zoneList[0].key) : null);
    if (!pad) return null;
    window.__game.teleport(pad.x, pad.y + 2.4, pad.z);
    zoneList = Game.zones.zonesNear(pad.x, pad.z, ZONE_RADIUS, dispCtx());
    dockGrace = 0;
    const res = doDock(pad);
    return { pad: pad.key, delivered: res && res.ok ? res.receipts.length : 0, board: boardJobs.length };
  },
  undock: () => doUndock(),
  // Returns the new state, or null when there is no zone field at all — "there was nothing to
  // switch off" must never look like "it is off" (T10).
  setDocking(on) {
    if (!Game.zones) return null;
    dockingOn = on !== false;
    if (!dockingOn && dockPad) doUndock();
    return dockingOn;
  },
  board: () => boardJobs,
  accept: i => (boardJobs[i] ? doAccept(boardJobs[i]) : null),
  haggle: i => (boardJobs[i] ? doHaggle(boardJobs[i]) : null),
  charge: (u = Infinity) => (Game.economy ? doCharge(u) : null),
  buyUpgrade: line => (Game.economy ? doBuy(() => Econ.buyUpgrade(Game.economy, line), r => `L${r.level}`) : null),
  buyCraft: id => (Game.economy ? doBuy(() => Econ.buyCraft(Game.economy, id), r => `${r.price}`) : null),
  grantCredits(n) {
    if (!Game.economy) { S().credits += n | 0; S().lifetime += Math.max(0, n | 0); save(); return null; }
    const r = Econ.earn(Game.economy, n | 0);
    persist();
    return r;
  },
  // Deliver whatever is held at whichever pad it is destined for, by teleporting to it. This is
  // the soak's "finish the job" button, not a cheat: it runs the same `deliver()` the dock does.
  completeJob() {
    if (!Game.economy || !Game.economy.cargo.length) return null;
    const t = Game.missions.task(Game.economy, simTime);
    const dest = Game.economy.cargo.find(p => p.dest.name === t.name) || Game.economy.cargo[0];
    if (dockPad) doUndock();
    return window.__game.forceDock(dest.destKey);
  },
  setCell: u => (Game.economy
    ? (Game.economy.cellUnits = clamp(+u, 0, Econ.cellMax(Game.economy)), Game.economy.cellUnits) : null),
  dockUI: () => (dockUI ? dockUI.stateOf() : null),
  // ── P7b (§7.3, §9.6) ─────────────────────────────────────────────────────
  get clientPanel() { return clientPanel; },
  // Open §7.3's panel for a board slot. Returns null when there is no panel at all, which is
  // distinguishable from "it did not open" (T10).
  openClient(i = 0) {
    if (!clientPanel || !boardJobs[i]) return null;
    clientPanel.show(boardJobs[i], dockPad ? padForPanel(dockPad) : null, Game.economy);
    wantBlur = true;
    return clientPanel.stateOf();
  },
  closeClient: () => (clientPanel ? clientPanel.hide() : null),
  clientState: () => (clientPanel ? clientPanel.stateOf() : null),
  // Force the §9.6 play()-rejection path without waiting for a browser policy to produce one.
  // Asserted, never `&&`-guarded: if there is no video element the caller must hear about it.
  rejectClientPlay(on = true) {
    if (!clientPanel) return null;
    clientPanel.forcePlayReject = on !== false;
    if (clientPanel.open) clientPanel.paint();   // rebuilds the media block, which calls play()
    return clientPanel.forcePlayReject;
  },
  // The autopilot's courier programme (?courier=1). See js/autopilot.js.
  courier: () => (courier ? courier.state() : null),
  // Fly to a world point through the real input struct. Returns null when there is no flight model
  // at all, so "there was nothing to fly" is distinguishable from "it is flying" (T10).
  flyTo(x, y, z) {
    if (!flight || mode === 'shot') return null;
    if (!ferry) ferry = new Courier();
    if (x === null || x === undefined) { ferry = null; return false; }
    ferry.setTarget({ x: +x, y: +y, z: +z });
    return ferry.state();
  },
  flyState: () => (ferry ? ferry.state() : null),

  // ── P8 hooks (§10) ───────────────────────────────────────────────────────
  get audio() { return audio; },
  get radio() { return radio; },
  audioState: () => (audio ? audio.state() : null),
  radioState: () => (radio ? radio.state() : null),
  radioEvent: k => (radio ? radio.event(k) : null),
  radioFire: slot => {
    if (!radio || !radio.manifest) return null;
    const r = radio.manifest.chatter.find(c => c.slot === slot);
    return r ? radio.fire(r) : null;
  },
  setMusicState: s => (radio ? radio.setState(s) : null),

  // harness helpers
  throwTestError(msg = 'neonhaul test error') { setTimeout(() => { throw new Error(msg); }, 0); return true; },
  // Boot and navigation hitches sit in the rolling window for 90 frames and would be reported as
  // the worst frame of a run that had settled long before.
  resetPerf() { msSim.clear(); msRender.clear(); msFrame.clear(); msGen.clear(); msFly.clear(); msHud.clear(); cockpit?.resetPerf(); minimap?.resetPerf(); return true; },
  testGuard() { fpsAvg = 10; guardQuality(); return { downgraded, dpr: renderer.getPixelRatio(), bloom: Q.bloom }; },
  loseContext: loseContextForTest,
  resize: onResize,
  toast,
  flushSave: flush,

  // ── P2 gates ─────────────────────────────────────────────────────────────
  city: cityR,
  cityModel: city,
  cityBreakdown: () => (cityR ? cityR.breakdown() : null),
  msPrewarm: () => msPrewarm,
  landmarks: () => (city ? city.landmarks : []),
  // §3.2.2's control. Collapsing the dither to a hard swap is how gates_p2.mjs measures what the
  // cross-fade is actually buying — a screenshot cannot tell you that.
  setFadeHard: on => (cityR ? cityR.setFadeHard(on) : false),
  solidAt: (x, y, z, pad) => (cityR ? cityR.solidAt(x, y, z, pad) : null),
  // `solidAt` answers ONLY for chunks that are live with collision AABBs, and it returns `null`
  // both for open air and for a chunk that was never generated. That ambiguity produced the exact
  // opposite conclusion once already on this project — a 242-pad sweep from the spawn that read
  // "no defect" over a city that was almost entirely unstreamed. Any gate probing `solidAt` at a
  // remote point must assert THIS first, so an unstreamed chunk fails loudly instead of scoring
  // as clear air.
  cityChunkLive(x, z) {
    if (!cityR) return null;
    const rec = cityR.live.get(Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK));
    return !!(rec && rec.aabbs && rec.aabbs.length !== undefined);
  },
  spawn: () => (city ? city.spawn : null),
  // §3.2.3 diagnostics. A wholesale cache clear hands the renderer a cold cache on its next
  // stream-in, which is the only mechanism by which a NON-renderer caller of generateChunk
  // (zones.js:_clearance, added by P7b) could move `ms.gen`. Reported so the question is
  // answered with a count rather than an argument.
  cityCache: () => (city ? { gens: city.cacheGens, hits: city.cacheHits,
    clears: city.cacheClears, high: city.cacheHigh, size: city._chunkCache.size } : null),

  // ── P3a gates (§3.5.4-§3.5.5, §3.10) ─────────────────────────────────────
  signage,
  // blocks.js' OWN unit-space box list, so gates_p3a can re-derive every facade independently of
  // whatever signage.js thought it was placing against.
  protoBoxes: () => protoBoxes(),
  setSignHard: on => { U.uSignHard.value = on ? 1 : 0; return U.uSignHard.value; },
  freezeTime: on => { timeFrozen = !!on; return timeFrozen; },
  // Hiding just the sign quads is how gates_p3a ISOLATES the signage layer: the same probe with
  // and without them differences the buildings out exactly, and what is left is the thing under
  // test. Measuring signage against a frame that is 95 % building measures the building.
  setSignVisible: (on, all) => (signage ? signage.setVisible(on, all) : false),
  strobeColumns: () => (signage && cityR ? signage.strobeColumns(cityR.live.values()) : []),
  signAtlas: () => (signAtlas ? { size: signAtlas.size, levels: signAtlas.levels,
    regions: signAtlas.regions.length, counts: signAtlas.data.counts,
    flipY: signAtlas.tex.flipY, mips: signAtlas.tex.mipmaps.length,
    anisotropy: signAtlas.tex.anisotropy, colorSpace: signAtlas.tex.colorSpace } : null),
  signStats: () => (signage ? Object.assign({}, signage.stats, signage.state()) : null),
  signBreakdown: () => (signage ? signage.breakdown() : null),

  // Every live sign, with the wall it was placed against. gates_p3a re-derives the wall from
  // blocks.js' own box list and proves the sign is ON it — a screenshot cannot tell you whether a
  // sign is 0.4 m proud of a facade or 8 m off the front of a `taper` setback.
  signMeta(limit = 0) {
    if (!cityR) return [];
    const out = [];
    for (const rec of cityR.live.values()) {
      if (!rec.sgMeta) continue;
      for (const m of rec.sgMeta) { out.push(m); if (limit && out.length >= limit) return out; }
    }
    return out;
  },

  // §3.5.4's A/B. Mipmaps are not optional on this sheet — a 512x128 sign seen at 30 px across
  // without them aliases into crawling noise, which is exactly what a critic marks under Finish.
  // Turning the chain off and re-measuring is the only way to show the chain is doing work.
  setSignMips(on) {
    if (!signAtlas) return null;
    const t = signAtlas.tex, THREEns = THREE;
    t.minFilter = on ? THREEns.LinearMipmapLinearFilter : THREEns.LinearFilter;
    t.anisotropy = on ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;
    t.needsUpdate = true;
    return { minFilter: t.minFilter, anisotropy: t.anisotropy, mips: t.mipmaps.length };
  },

  // An order-independent hash of every live sign instance, straight out of the GPU buffers.
  // Order-independent because slot indices depend on the order chunks happened to stream in, and
  // "same seed, same signs" is a claim about the SIGNS, not about the streaming.
  signHash() {
    if (!signage) return null;
    const parts = [];
    for (const f of [signage.neon, signage.box, signage.heroF, signage.strip, signage.strobe, signage.struct]) {
      const m = f.mesh.instanceMatrix.array;
      const keys = [];
      for (let i = 0; i < f.n; i++) {
        let s = f.name + ':';
        for (let k = 0; k < 16; k++) s += Math.round(m[i * 16 + k] * 64) + ',';
        for (const a of f.attrSpec) {
          const b = f.attr[a.name].array;
          for (let k = 0; k < a.size; k++) s += Math.round(b[i * a.size + k] * 4096) + ',';
        }
        keys.push(s);
      }
      keys.sort();
      let h = 0x811c9dc5 >>> 0;
      for (const s of keys) for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
      parts.push({ field: f.name, n: f.n, hash: ('00000000' + h.toString(16)).slice(-8) });
    }
    return parts;
  },

  // ── P3b gates (§3.7, §3.9, §4.4, §4.5, decisions 10 and 11) ──────────────
  get weather() { return weather; },
  get reflect() { return reflect; },
  get silhouettes() { return silhouettes; },
  // The isolation controls, in the same spirit as setSignVisible: measuring the mirror against a
  // frame that is 90 % building measures the building. Every P3b number is a difference.
  setReflect: on => (reflect ? reflect.setEnabled(on) : false),
  setFilm: on => (reflect ? reflect.setFilmVisible(on) : false),
  setHalos: on => (reflect ? reflect.setHalosVisible(on) : false),
  setRain: on => { if (weather) { weather.forceOff = !on; weather.mesh.visible = !!on; } return !!on; },
  setSilhouettes: on => (silhouettes ? silhouettes.setVisible(on) : false),
  setShafts: on => { for (const s of sky.shafts) s.visible = !!on && s.userData.anchored !== false; return !!on; },
  // decision 10's one number, live, so a sweep is 26 page-loads and not 26 edits.
  setHaze(g) {
    if (!gradePass) return null;
    gradePass.uniforms.uGamma.value.set(g, g, g);
    return g;
  },
  // decision 11's ramp, forced, so a gate can prove the vista is what changed and not the altitude.
  setAerial(k) {
    if (k === null || k === undefined) { aerialForced = null; return null; }
    aerialForced = clamp(+k, 0, 1);
    return aerialForced;
  },
  anchorShafts: () => (cityR ? sky.anchorShafts(cityR, camera.position) : 0),
  // §4.4's threshold is in PRE-tone-map linear scene light, which is a quantity nothing in the
  // game reports and no screenshot shows. Being able to move it live is how you find out whether
  // anything in frame is actually above it — "the neon has no glow" and "the threshold is above
  // every source we have" look identical from the outside.
  setBloom(strength, threshold) {
    if (!bloomPass) return null;
    if (strength !== null && strength !== undefined) bloomPass.strength = strength;
    if (threshold !== null && threshold !== undefined) bloomPass.threshold = threshold;
    return { strength: bloomPass.strength, threshold: bloomPass.threshold };
  },

  // ── P11 gates (ART_PASS) ─────────────────────────────────────────────────
  //
  // Isolation for the art pass, and every one of these is a plain function that THROWS if the
  // renderer is absent rather than resolving quietly — obligation T10's rule, applied to the hooks
  // a P11 gate needs. `setP11(0)` disables the SHADER half of the pass (colour zones, spill,
  // street glow, facade bays, road markings and road light) and leaves the instance data alone,
  // so an A/B against it measures the shader and says so.
  setP11(on) { U.uP11.value = on ? 1 : 0; return U.uP11.value; },
  setRoadGlow(v) { const p = U.uRoad.value.w; U.uRoad.value.w = +v; return p; },
  setSpill(spill, street) {
    const prev = { spill: U.uSpill.value, street: U.uStreetK.value.x };
    if (spill !== null && spill !== undefined) U.uSpill.value = +spill;
    if (street !== null && street !== undefined) U.uStreetK.value.x = +street;
    return prev;
  },
  // The live instance data behind the colour pass, straight off the buffers the GPU reads — not a
  // recomputation of what it ought to be. A gate that re-derives the distribution from
  // districts.js would pass with the attribute never written.
  cityTints(max = 20000) {
    if (!cityR) return null;
    const out = { n: 0, tints: [], zones: [] };
    out.h = [];
    for (const f of cityR.lod0) {
      const e1 = f.attr.iEmissive.array, e2 = f.attr.iEmissive2.array, z = f.attr.iZone.array;
      const m = f.mesh.instanceMatrix.array;
      for (let i = 0; i < f.n && out.n < max; i++, out.n++) {
        out.tints.push([e1[i * 3], e1[i * 3 + 1], e1[i * 3 + 2], e2[i * 3], e2[i * 3 + 1], e2[i * 3 + 2]]);
        out.zones.push([z[i * 4], z[i * 4 + 1], z[i * 4 + 2], z[i * 4 + 3]]);
        out.h.push(m[i * 16 + 5]);          // the instance's Y scale IS the building's height
      }
    }
    return out;
  },

  // ── P5 gates (§5) ────────────────────────────────────────────────────────
  get craftFields() { return craftFields; },
  get traffic() { return traffic; },
  get playerCraft() { return playerCraft; },
  craftDefs: () => CRAFT_DEFS,
  // The palettes and the shared rig as data, so a gate asserts against the same table the renderer
  // reads rather than against a copy of it.
  craftPalette: () => ({ body: BODY_TINTS, trim: TRIM_TINTS, runs: TRIM_RUNS, dim: RIM_DIM,
    rig: LIGHT_RIG, policeRig: POLICE_RIG }),
  // The contact sheet §13 asks for: one craft per def, laid out in a line in front of a fixed
  // camera, all nine from the ONE generator so "only L/W/H and the three integer options differ"
  // is a thing a tool can look at rather than a claim in a handoff.
  craftSheet(ids = null, gap = 14, y = 60, cols = 3) {
    if (!craftFields) return null;
    const list = ids || Object.keys(CRAFT_DEFS);
    craftFields.begin();
    const out = [];
    const rows = Math.ceil(list.length / cols);
    list.forEach((id, i) => {
      const def = CRAFT_DEFS[id];
      if (!def) return;
      const cx = i % cols, cy = (i / cols) | 0;
      const x = (cx - (cols - 1) / 2) * gap;
      const yy = y + ((rows - 1) / 2 - cy) * gap * 0.52;
      craftFields.write({ def, x, y: yy, z: 0, yaw: -0.62, pitch: -0.06, roll: 0.10,
        throttle: 0.8, t: 3.1, tint: undefined });
      out.push({ id, x, y: yy, L: def.L, W: def.W, H: def.H, nac: def.nac, fin: def.fin, police: !!def.police });
    });
    craftFields.flush();
    sheetHold = true;                 // updateVehicles must not overwrite it on the next frame
    traffic?.setEnabled(false);
    return { craft: out, body: craftFields.body.n, glass: craftFields.glass.n,
      lights: craftFields.light.n, cones: craftFields.cone.n };
  },
  craftSheetRelease() { sheetHold = false; traffic?.setEnabled(true); return true; },
  // The falsification hook for the instance-scale normals (craft.js header note 1). ON re-introduces
  // an S⁻² double-correction on top of the S⁻¹ three already applies; if the frame does not change,
  // nothing in it is reading these normals and every claim about the hull's shading is empty.
  craftNormalBreak(on) { CRAFT_U.uNormBreak.value = on ? 1 : 0; return CRAFT_U.uNormBreak.value; },
  craftRim(a, c, p) {
    if (a !== null && a !== undefined) CRAFT_U.uRimAmt.value = +a;
    if (c !== null && c !== undefined) CRAFT_U.uChineAmt.value = +c;
    if (p !== null && p !== undefined) CRAFT_U.uPanels.value = +p;
    return { rim: CRAFT_U.uRimAmt.value, chine: CRAFT_U.uChineAmt.value, panels: CRAFT_U.uPanels.value };
  },
  setCraft(id) { const r = playerCraft ? playerCraft.setCraft(id) : null; if (r) { S().craft = r; save(); } return r; },
  setCraftVisible(on) { if (playerCraft) playerCraft.visible = on !== false; return craftShown(); },
  setTraffic(on) { return traffic ? traffic.setEnabled(on !== false) : false; },
  setTrafficYield(on) { if (traffic) traffic.yieldOn = on !== false; return traffic ? traffic.yieldOn : null; },
  setTrafficAvoid(on) { if (traffic) traffic.avoid = on !== false; return traffic ? traffic.avoid : null; },
  // decision 6's falsification switch. Nothing in the game sets it; gates_p5 sets it to show the
  // "no patrol ever steers toward the player" assertion CAN fail, which is the only thing that
  // makes the passing run mean anything.
  setTrafficPursue(on) { if (traffic) traffic.pursue = !!on; return traffic ? traffic.pursue : null; },
  trafficList: (limit = 0) => (traffic ? traffic.list(vehT, camera.position, limit) : []),
  // `t` is optional and PINNED by the determinism gate: freezing the clock stops it at whatever
  // boot left it at, which differs between page loads, so a hash taken at "the frozen time" compares
  // two different moments. Passing a literal makes the comparison a comparison.
  trafficHash: t => (traffic ? traffic.hash(t === undefined ? vehT : +t, camera.position.x, camera.position.z) : null),
  vehicleBreakdown: () => (craftFields && traffic
    ? { rows: craftFields.breakdown().rows.concat(traffic.breakdown().rows),
      draws: craftFields.breakdown().draws + traffic.breakdown().draws,
      tris: craftFields.breakdown().tris + traffic.breakdown().tris }
    : null),

  // ── P6 gates (§8) ────────────────────────────────────────────────────────
  // Every hook here returns `null` when the thing it controls does not exist, and never a value
  // that could be mistaken for "it worked" (obligation T10: an isolation call that cannot run
  // must be distinguishable from one that ran). `setRain`-style booleans that read the same
  // whether the subsystem is present or absent are the bug this phase was sent to remove.
  get cockpit() { return cockpit; },
  get minimap() { return minimap; },
  get ui() { return ui; },
  hudData: () => (cockpit ? hudData() : null),
  hudBreakdown: () => (cockpit ? cockpit.breakdown() : null),
  // The live cabin arrangement, so a gate can derive its own test angles from the geometry it is
  // testing rather than hard-coding numbers that are only true in landscape.
  hudLayout: () => (cockpit ? cockpit.lay : null),
  cockpitParts: () => (cockpit ? cockpit.parts() : null),
  // The falsification hook for "no occupant, no hands, no seat". Nothing in the game calls it.
  testOccupant: on => (cockpit ? cockpit.testOccupant(!!on) : null),
  // Force the cabin on or off independently of the camera rig, so the gate can difference the
  // frame with and without it and price it in draws, triangles and pixels.
  setCockpit(on) {
    if (!cockpit) return null;
    if (on === null || on === undefined) { cockpitForced = null; return null; }
    cockpitForced = !!on;
    cockpit.setVisible(cockpitForced);
    return cockpitForced;
  },
  // The camera rig, live — `cockpit` puts the player inside the cabin, `chase` behind the hull.
  setRig(m) { if (!rig) return null; const r = rig.setMode(m); S().settings.camera = r; return r; },
  // Per-layer minimap isolation. Returns null on an unknown layer name rather than silently
  // toggling nothing.
  setMapLayer: (name, on) => (minimap ? minimap.setLayer(name, on) : null),
  setMapRotate: on => (minimap ? minimap.setRotate(on) : null),
  setMapHz: hz => (minimap ? minimap.setHz(hz) : null),
  // P6's injection point for the minimap's dot-and-glyph drawing. Passing a list PINS it: the
  // per-frame zone push is suspended until `setZones(null)` releases it, because a fixture the game
  // loop overwrites one frame later is not a fixture (see updateEconomy).
  setZones(list) {
    if (!minimap) return null;
    zonesForced = Array.isArray(list) ? list : null;
    if (zonesForced) { zoneList = zonesForced; zoneVis?.update(0, camera, zoneList, null); }
    else zoneAcc = 1e9;
    return minimap.setZones(zonesForced === null ? zoneList : zonesForced);
  },
  setTarget: t => (minimap ? minimap.setTarget(t) : null),
  mapProject: (x, z) => (minimap ? minimap.project(x, z) : null),
  // The minimap canvas as raw pixels, so a gate can difference two states of it.
  mapPixels(step = 4) {
    if (!minimap) return null;
    const d = minimap.g.getImageData(0, 0, minimap.size, minimap.size).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4 * step) out.push(d[i], d[i + 1], d[i + 2], d[i + 3]);
    return out;
  },
  dashPixels(step = 8) {
    if (!cockpit) return null;
    const g = cockpit.dashCanvas.getContext('2d');
    const d = g.getImageData(0, 0, cockpit.dashCanvas.width, cockpit.dashCanvas.height).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4 * step) out.push(d[i], d[i + 1], d[i + 2]);
    return out;
  },
  holoPixels(step = 8) {
    if (!cockpit) return null;
    const g = cockpit.holoCanvas.getContext('2d');
    const d = g.getImageData(0, 0, cockpit.holoCanvas.width, cockpit.holoCanvas.height).data;
    const out = [];
    for (let i = 0; i < d.length; i += 4 * step) out.push(d[i], d[i + 1], d[i + 2], d[i + 3]);
    return out;
  },
  // Force the dash and holo to redraw with an arbitrary data model, so "the needle moves with the
  // speed" is a two-call experiment instead of a four-second flight.
  drawHud(data) {
    if (!cockpit) return null;
    cockpit.drawDash(data || {});
    cockpit.drawHolo(data || {});
    return { dash: cockpit.dashDraws, holo: cockpit.holoDraws };
  },
  // §8.3's fade, forced to a look direction, so it can be measured without flying a turn.
  forceFade(x, y, z) {
    if (!cockpit) return null;
    return cockpit.applyFade(new THREE.Vector3(x, y, z).normalize(), hudData());
  },
  cockpitHit: () => (cockpit ? cockpit.hit() : null),
  // §8.4 / §8.5.
  chatter: o => ui.chatter(o || {}),
  clearToasts: () => ui.clearToasts(),
  holdFor,                                   // the §8.5 arithmetic, as a pure function
  chatterMult: () => CHATTER_MULT,
  uiState: () => ui.state(),
  get ui() { return ui; },
  zoneTypes: () => ZONE_TYPES,
  hudCost: () => ({ mean: +msHud.mean.toFixed(4), worst: +msHud.worst.toFixed(4) }),

  // ── P1a gates ────────────────────────────────────────────────────────────
  probe,                                     // pixel readback of the composed frame
  sky,
  debug: probeScene,
  views: VIEWS,
  setCamera,
  setClock(h) { clock = ((h % 24) + 24) % 24; clockRunning = false; sky.setVariant(null); forcedVariant = null; sky.update(0, clock); syncGrade(); return clock; },
  // §4.6's A/B. If the two frames come back identical, ACES never ran and the pipeline order is
  // wrong — which is invisible without exactly this test.
  setAces(on) { acesOn = !!on; syncGrade(); return acesOn; },
  // §3.4's A/B. uCell is the SAMPLED width of an atlas cell; widening it to the whole atlas is
  // exactly the bug §3.4 exists to prevent — the tiled UV runs across every other window pattern
  // instead of wrapping inside its own cell. Pass null to restore.
  setUCell(v) { U.uCell.value = (v === null || v === undefined) ? atlas.windows.userData.cell : +v; return U.uCell.value; },
  // §4.1.1's rule as a number: fog luminance over shell luminance, per variant.
  fogContrast: () => ({ shell: +srgbLuma(0x0a0c11).toFixed(4), ratio: fogContrast() }),
  // The blend, sampled without disturbing the live clock — the ?time= sweep gate reads this.
  skySweep(step = 0.05) {
    const out = [];
    for (let t = 0; t < 24; t += step) out.push(sky.sampleAt(t));
    out.push(sky.sampleAt(24));
    return out;
  },
  bakeEnv: () => sky.bakeEnv(true),
};

window.__ready = false;

// ── go ─────────────────────────────────────────────────────────────────────

document.getElementById('boot-fill').style.width = '100%';
document.getElementById('boot-status').textContent = FLAG.shot ? 'framing shot…' : 'going live';
raf = requestAnimationFrame(frame);
