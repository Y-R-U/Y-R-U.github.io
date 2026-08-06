// The three scored cinematic scenarios and the sequences that pose them — C6, cine-private.
//
// `shot.mjs --at=` calls window.__waterline.seek(shotId, t), which is director.seek(), so every
// scored shot here is BOTH a scenario (world staging, camera at the money frame) and a sequence of
// the same id (the pose as a function of t). The scenario runs once at page load and finishes by
// seeking its own sequence, so `--shot=x` and `--shot=x --at=0.5` take the same path.

import * as THREE from 'three';
import { defineScenario } from '../scenarios.js';
import { CINE, VFX } from '../config.js';
import { sea } from '../world/ocean.js';
import { ROOM } from '../world/bridge.js';
import { setShipAmbient } from '../world/materials/hull.js';
import { setMuzzlePhase, resetGunOrder } from '../world/vfx/gun.js';
import { setImpactPhase, resetImpactOrder } from '../world/vfx/impact.js';
import { rain } from '../world/vfx/fire.js';
import { softAdd } from '../world/vfx/field.js';
import { setShellPhase, ballistic } from '../world/shell.js';
import { track } from '../engine/budget.js';
import { EASE, aimFor } from './rig.js';

const v = (x, y, z) => new THREE.Vector3(x, y, z);
const W = () => window.__waterline;
const vfx = () => W().vfx.emit ?? W().vfx;

// Per-page-load staging, written by a scenario's setup and read by its sequence at compile time.
// Fixed for the life of the page, so seek() stays deterministic.
const SHOT = {};

// ── scene helpers ───────────────────────────────────────────────────────────────────────────

// vfxScene()'s shape, with the root whitelist opened up: window_out and match_cut need the bridge
// AND the sea in one frame, which neither sea() nor bridgeScene() will give you on its own.
// Knob order is D15/D17's: sky knobs first, because every one of them re-runs applyGrade and its
// listeners rewrite fog, sea state and sun from the grade.
function scene(app, grade, { roots = [], seaState, sky, fog, fade, shadow = 120, amb = 0.86, sun } = {}) {
  const { lighting, ocean, sky: skyObj } = seaRoots(app, grade, roots);
  const fleet = W().world.fleet;
  fleet.clearStage();
  vfx().clear();
  for (const l of SHOT.lights || []) l.parent?.remove(l);
  SHOT.lights = [];
  for (const g of SHOT.glare || []) g.parent?.remove(g);
  SHOT.glare = [];
  setShipAmbient(amb);
  resetGunOrder();
  resetImpactOrder();
  if (sky) for (const k of Object.keys(sky)) app.quality.set(k, sky[k]);
  if (sun) skyObj.setSun(sun[0], sun[1]);
  app.quality.set('seaState', seaState ?? -1);
  if (fog) lighting.setFog(fog[0], fog[1]);
  if (fade) ocean.setDetailFade(fade);
  lighting.setShadowExtent(shadow);
  return { lighting, ocean, fleet, sky: skyObj };
}

function seaRoots(app, grade, roots) {
  const { sky: skyObj, lighting, ocean } = sea(app, grade, roots);
  return { sky: skyObj, lighting, ocean };
}

// C4's emitters register a `warmSource`, which only tints cards — nothing in the scene is lit by a
// muzzle flash or a fireball, and three separate critics have now measured the result: a 255-white
// burst 80 px from a superstructure left it net BLUE (B−R +23.5). A PointLight is the only thing a
// MeshStandardMaterial reads, and adding one from a scenario needs no edit to a closed file.
//
// Intensity is candela — three r155+ is physically correct by default, so irradiance is
// intensity/d². `power` here is the irradiance wanted at `atMetres`, which is the number you can
// actually reason about.
//
// Wave C: `power` was 4× this. A muzzle sits ON the hull, so at 5 m an inverse-square source set
// for 46 m delivers 85× the irradiance it was authored for — measured on `window_out@1.0`, lit
// paint p95 226.6 with 8.45% of the patch over luma 220, and it dropped to 148.4 / 0.00% with the
// flash lights alone zeroed. Neither the sun, the hemisphere nor the env map moved it more than 5
// luma. Lowering `decay` makes it worse, because midships is near `atMetres` and a shallower
// falloff carries MORE there — the total is the only lever.
function flashLight(pos, { colour = 0xffb066, power = 1.4, atMetres = 26, reach = 220 } = {}) {
  const l = new THREE.PointLight(colour, power * atMetres * atMetres, reach, 2);
  l.position.copy(pos);
  W().app.scene.add(l);
  (SHOT.lights = SHOT.lights || []).push(l);
  return l;
}

// A soft additive card. There is no bloom pass on this project (C3 E4, C4's escalation), so glare
// and haze are geometry: a premultiplied ramp on softAdd() is the same two-line blend a bloom
// composite would end at.
let glareTex = null;
function glareTexture() {
  if (glareTex) return glareTex;
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S * 2 - 1, w = (y + 0.5) / S * 2 - 1;
      // separable, not radial: a window aperture is a rectangle and a round falloff on a wide
      // slot leaves the ends of the slot dark
      const a = Math.max(0, 1 - Math.abs(u) ** 1.9) ** 1.7 * Math.max(0, 1 - Math.abs(w) ** 1.9) ** 1.7;
      const i = (y * S + x) * 4;
      img.data[i] = 255 * a; img.data[i + 1] = 252 * a; img.data[i + 2] = 244 * a; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  glareTex = new THREE.CanvasTexture(cv);
  glareTex.colorSpace = THREE.SRGBColorSpace;
  glareTex.needsUpdate = true;
  track(glareTex, { w: S, h: S, fmt: 'rgba', mips: true, label: 'cine:glare' });
  return glareTex;
}

// The window aperture spilling onto its own surround. Measured before: apertures maxed at 175.6
// with nothing clipped and the bulkhead beside them at p99 24.4 — a ~160-luma hole in a ~20-luma
// room with zero bleed.
//
// Every quad is merged into ONE geometry with vertex colours. `window_out@0.0` is the tightest
// shot on the project at 87 of 90 draw calls, so a mesh per pane was never affordable.
function windowGlare(bridge, strength = 1) {
  const glassMat = bridge.glassPlane?.material;
  if (!glassMat) return null;
  const panes = [];
  bridge.room.traverse(o => { if (o.isMesh && o.material === glassMat) panes.push(o); });
  if (!panes.length) return null;

  const pos = [], uv = [], col = [], idx = [];
  const q = new THREE.Vector3();
  const push = (g, sw, sh, out, rgb) => {
    const p = g.geometry.parameters;
    const base = pos.length / 3;
    for (const [sx, sy, u, v] of [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]]) {
      q.set(sx * p.width * sw * 0.5, sy * p.height * sh * 0.5, out).applyQuaternion(g.quaternion).add(g.position);
      pos.push(q.x, q.y, q.z);
      uv.push(u, v);
      col.push(rgb[0] * strength, rgb[1] * strength, rgb[2] * strength);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const g of panes) {
    push(g, 1.10, 1.26, 0.13, [0.13, 0.145, 0.18]);    // the aperture itself, blown past the mullions
    push(g, 1.60, 2.20, 0.30, [0.17, 0.18, 0.22]);    // the spill onto sill, deckhead and mullions
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const mat = softAdd(new THREE.MeshBasicMaterial({
    map: glareTexture(), vertexColors: true, transparent: true,
    // depthTest OFF, because veiling glare IS a lens effect: with it on, the mullions and the
    // console occlude the very cards that are meant to spill onto them and the bulkhead beside the
    // aperture measured DARKER than with no glare at all. The cards are sized to stop above the
    // plot table, which is the one surface in the room that has to stay readable.
    depthWrite: false, depthTest: false, fog: false, toneMapped: true, side: THREE.DoubleSide,
    forceSinglePass: true,
  }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = '_c6_glare';
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  bridge.room.add(mesh);
  (SHOT.glare = SHOT.glare || []).push(mesh);
  return mesh;
}

// A deterministic board for the plotting table: this is set dressing, not a game.
function demoGrid(w = 10, h = 10, seed = 20260806) {
  const g = new Uint8Array(w * h);
  let s = seed >>> 0;
  const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let i = 0; i < 22; i++) g[Math.floor(r() * g.length)] = 1;
  for (let i = 0; i < 7; i++) g[Math.floor(r() * g.length)] = 2;
  for (let i = 0; i < 3; i++) g[Math.floor(r() * g.length)] = 3;
  return { w, h, grid: g };
}

// The plate is a RED room. bridgeLights' 'bridge' rig runs cyan plot/screen practicals as bright as
// its red deckhead ones, so the frame came back blue-grey. Scaling by hue at runtime is a scenario
// decision, not an edit to C2's rig.
function tintRoom(warm, cool) {
  const bl = W().world.bridgeLights;
  bl.object3D.traverse(o => {
    if (!o.isPointLight && !o.isSpotLight) return;
    o.intensity *= o.color.r > o.color.b * 1.15 ? warm : cool;
  });
}

// `bridge.setEnv()` covers the room and nothing covers the table, so the plot table's metal frame
// was still taking the noon sky's IBL at full strength in a room graded to env 0.006. Isolated by
// forcing it to zero: the bezel went RGB(95,58,88) — the blue-dominant lavender a critic called the
// single most out-of-place colour in the frame — to (75,10,14), pure red like everything else.
// C2 should own this as `table.setEnv()`; see the escalation in HANDOFF_CINE §9.
// C2 owns this now (E6 closed by Wave C); kept as a name so the sequences below read the same.
const tableEnv = k => W().world.table.setEnv(k);

function bridgeInterior(app, { rig = 'bridge', look = 'holo', env = 0.06, ripple = 2.6, haze = [0x241a18, 0.05], crew = true } = {}) {
  const { bridge, bridgeLights, table } = W().world;
  bridge.setHeading(0);
  bridge.setEnv(env);
  bridge.setCrew?.(crew);
  bridge.setPlotter?.(crew);
  bridge.setHaze?.(haze[0], haze[1]);
  bridgeLights.useRig(rig);
  table.setLook(look);
  table.setAimMode(null);
  table.setClutter?.(false);
  table.setState(demoGrid());
  app.quality.set('seaRipple', ripple);
  return { bridge, bridgeLights, table };
}

// ── shell_flight ────────────────────────────────────────────────────────────────────────────
// Plate 242050_01: a storm at sea in heavy rain with round shot visibly in the air. It is a
// VFX/atmosphere target, not a framing target — so the brief here is rough water, low grey sky,
// rain, and a round that lights its own vapour.

defineScenario({
  id: 'shell_flight',
  label: 'Following the round downrange through rain',
  ref: '242050_01',
  setup(app) {
    const { fleet } = scene(app, 'noon', {
      roots: ['fleet'],
      seaState: 3,
      // noon's own blue sky and hard sun disc are the wrong film for a storm; cover and haze get
      // the flat grey the plate has, and exposure keeps it off the top of the histogram.
      // The sky also has to come DOWN toward the sea: rain streaks are a fixed additive quantity,
      // so at a sky of 150 against a sea of 66 they were 19x denser over the water than over the
      // sky and the top quarter of the frame read as a calm day.
      sky: { skyCover: 2.0, skyHaze: 1.9, skyCloudSize: 1.7, seaHaze: 1.9, exposure: 0.80 },
      sun: [148, 9],
      fog: [300, 3200],
      fade: { fade: [140, 1500], rip: [160, 1600], lod: 1.05 },
      shadow: 130,
      // the hull's ambient fill IS the blue sky. At 0.92 it swamped the muzzle flash beside it and
      // left the superstructure reading net blue with a 255-white fireball 60 m away.
      amb: 0.58,
    });

    setMuzzlePhase(0.10, 0.03);
    setImpactPhase(0.55, 0.05);

    // The enemy line, downrange. Two hulls broadside-on so their turrets read, plus a third
    // further out that the fog takes — a line of ships all at one range is the lattice again.
    const [foeA, foeB] = fleet.stage([
      { kit: 'battleship', cells: 5, x: 34, z: 452, heading: -1.36, seed: 5501 },
      { kit: 'cruiser', cells: 4, x: -260, z: 830, heading: -1.05, detail: 1, seed: 771 },
      { kit: 'cruiser', cells: 3, x: 560, z: 1850, heading: -0.75, detail: 0, seed: 913 },
    ]);
    foeA.trainGuns(Math.PI / 2 + 0.2);
    foeB.trainGuns(Math.PI / 2);
    fleet.plumes.add(34, foeA.freeboard * 2.2, 452,
      { drift: [-40, 16], puffs: 20, rise: 9, scale: 4.6, tone: 0.34, seed: 61, alpha: 0.16, spread: 1.1 });

    const emit = vfx();
    const flashAt = new THREE.Vector3();
    for (const i of [0, 1]) {
      const a = foeA.fireGun(i);
      emit.muzzle(a, 9);
      a.getWorldPosition(flashAt);
      flashLight(flashAt, { colour: 0xffb45c, power: 1.15, atMetres: 55, reach: 400 });
    }

    // Our own salvo, mid-flight. Two rounds: the plate has several in the air at once, and one
    // lonely projectile reads as a bug rather than as gunnery.
    const from = v(-26, 27, -60), to = v(96, 0, 560);
    SHOT.flight = { from, to, arc: 34 };
    SHOT.rounds = [
      emit.tracer(from, to, 2600, { size: 9, seed: 3301, arc: 34, sea: true }),
      emit.tracer(from.clone().add(v(30, -3, 10)), to.clone().add(v(150, 0, 210)), 2600,
        { size: 9, seed: 5507, arc: 30, sea: true, trail: 0.85 }),
    ];
    setShellPhase(0.52);

    // camera first: the round's streak card and the rain are both laid out against it
    W().cine.director.seek('shell_flight', 0.5);
    for (const r of SHOT.rounds) r.round.poseAt(0.52);

    emit.splash(v(112, 0, 505), { size: 9, seed: 8821, at: 1.5 });
    emit.splash(v(-118, 0, 560), { size: 4, seed: 2207, at: 2.1 });

    // rain last: it borrows the emitter context a tracer stashed and lays streaks out around the
    // camera that is already in place
    // tone is the streak's own brightness. The streaks are a fixed additive quantity laid on AFTER
    // tone mapping, so their contrast against a 145-luma sky is set by `tone` alone — at 0.30 they
    // were invisible above the horizon and obvious over a 65-luma sea, measured at 1:26.
    rain({ count: 520, near: 6, far: 210, seed: 8821, lean: 0.18, tone: 0.52, murk: 20, hits: 46 });
  },
});

// ── window_out ──────────────────────────────────────────────────────────────────────────────
// Scored as a pair: @0.0 against 1272010_02 (red-lit night bridge, bright portholes) and @1.0
// against 236390_14 (open sea, hero battleship under a low sun). One sequence, two plates, so the
// exposure ramp is the shot.

const WIN = {
  eye0: v(0.10, ROOM.deck + 1.54, -1.05),
  aim0: v(0.16, ROOM.deck + 1.14, 4.6),
  eye1: v(18, 12.5, 186),
  aim1: v(84, 11, 246),
  ms: 1700,
  // One sun cannot serve a black interior and a bright sea at once. It ramps with the move, on the
  // same lag as the exposure, so the eye reads one continuous adaptation rather than two cheats.
  sun: [0.30, 2.75],
};

defineScenario({
  id: 'window_out',
  label: 'Out of the bridge window to watch the guns fire',
  ref: '1272010_02',
  setup(app) {
    const { fleet, lighting } = scene(app, 'noon', {
      roots: ['fleet', 'bridge', 'bridgeLights'],
      seaState: 2,
      sky: { skyCover: 1.55, skyCloudSize: 1.9, skyHaze: 1.25, exposure: 1.0 },
      sun: [240, 26],
      fog: [700, 5200],
      fade: { fade: [140, 1600], rip: [170, 1700], lod: 1.0 },
      shadow: 150,
      amb: 0.62,
    });

    // The room is lit by its own red practicals, not by the daylight outside: at env 0.3 the noon
    // IBL fills the interior to a flat grey and the whole exposure problem disappears — along with
    // the shot.
    bridgeInterior(app, { rig: 'bridge', env: 0.006, ripple: 1.2, haze: [0x2a1210, 0.075], crew: false });
    // the sun would otherwise rake straight through the bay and wash the console faces. Set AFTER
    // the sky knobs, because every one of them repaints this from the grade (D15's family).
    // The room must be lit by its own red practicals and nothing else. Measured at capture: the
    // grade's sun (3.1) and bridgeLights' own ambient floor (0.62) were between them putting the
    // whole interior at daylight grey, which is the one thing the plate is not.
    lighting.sun.intensity = WIN.sun[0];
    lighting.ambient.intensity = 0.085;
    lighting.sun.castShadow = false;
    W().world.bridgeLights.hemi.intensity = 0.085;
    // 0.34 on the cool practicals left the plot table's steel bezel at RGB(63,47,72) — a
    // blue-dominant lavender in a room whose only other light is red, which a critic called the
    // single most out-of-place colour in the frame. It is the cyan plot lamps landing on a
    // blue-grey painted frame; nothing red-lit can be blue.
    tintRoom(2.2, 0.05);
    tableEnv(0.05);
    windowGlare(W().world.bridge, 1);

    setMuzzlePhase(0.075, 0.022);

    // The hero: the next ship in your own line, firing. It is what the fly-out flies out to see,
    // and it is in the window band at t = 0 as one of the "ships outside".
    const [hero] = fleet.stage([
      { kit: 'battleship', cells: 5, x: 86, z: 250, heading: -1.16, seed: 4021 },
      { kit: 'cruiser', cells: 4, x: -300, z: 690, heading: -0.30, detail: 1, seed: 6151 },
    ]);
    hero.trainGuns(-1.85);
    fleet.plumes.add(86, hero.freeboard * 2.3, 250,
      { drift: [-46, 22], puffs: 22, rise: 10, scale: 5.0, tone: 0.30, seed: 41, alpha: 0.15, spread: 1.05 });

    const emit = vfx();
    const flashAt = new THREE.Vector3();
    for (const i of [0, 1]) {
      const a = hero.fireGun(i);
      emit.muzzle(a, 1);
      a.getWorldPosition(flashAt);
      flashLight(flashAt, { colour: 0xffc27a, power: 0.85, atMetres: 46, reach: 330 });
    }

    app.camera.near = 0.05;
    app.camera.far = 9000;
    W().cine.director.seek('window_out', 0);
  },
});

// ── match_cut ───────────────────────────────────────────────────────────────────────────────
// BUILD_PLAN §7.3: the targeted peg stretches and goes white, the camera moves, and the cut lands
// on a shell already in flight at the same screen position and the same apparent size.
//
// Round 1 failed four separate ways and every one of them was a discontinuity, so this is built
// out of quantities that are CONTINUOUS by construction rather than tuned to agree at one instant:
//
//   * the anchor is on screen from t = 0, already lit and already elongated
//   * both halves are ONE beat each, driven by one eased curve, with no beat boundary anywhere
//     near the cut except the cut itself
//   * the anchor's screen POSITION is aimFor(NDC) on both sides, so it is the same on both axes
//   * the anchor's screen HEIGHT is solved for a fraction of the frame on both sides, so the
//     camera distance follows the subject rather than the subject following the camera
//   * the exterior camera sits behind and above the round looking down its own flight path, which
//     is what makes a near-horizontal shell project as a near-VERTICAL rod — the same silhouette
//     the peg has. Pass 1 tried to do that with 58 degrees of camera roll and then unwound it
//     inside the last two sampled frames, which reads as a snap.
//   * there is no roll at all.

const CUT = {
  cell: { r: 4, c: 6 },
  stretch: CINE.matchCut.pegStretch,
  stretch0: 3.0,           // the peg is ALREADY elongated and lit at t = 0. Nothing pops in.
  // the round cannot take the peg's 8x on Y: a 0.38 m shell stretched eight times is a needle
  // where the peg is a rod. It takes a smaller stretch and a matching fatten, and the distance is
  // solved from that so the apparent LENGTH still matches.
  shellStretch: 3.4,
  shellFat: 3.0,
  ms: 1000,
  cutAt: CINE.matchCut.cutAt,
  frac: CINE.matchCut.interiorFrac,   // anchor height as a fraction of the frame, start → cut
  orbitDeg: 104,           // how far the camera swings round the peg over the interior half
  size: 4,
  pegH: 0.032,
  ndc: [-0.28, -0.10],
  fov: 46,
  u0: 0.40,                // where the round is on its arc at the cut
  // How far the exterior camera sits above the flight line, as a tangent. It buys the vertical
  // silhouette, and it costs the horizon: above ~0.42 the depression exceeds the half-fov and the
  // frame is nothing but water.
  outLift: 0.33,
  outFar: 2.4,             // the exterior camera opens out to this multiple of the cut distance
  // the paraxial distance solve ignores perspective, and at 7 m from an 8 m rod perspective is
  // most of the projected length. Measured correction, not a guess: it read 0.488 against 0.431.
  shellFit: 1.14,
};

const UPV = new THREE.Vector3(0, 1, 0);

// three's lookAt builds z = normalize(eye − target), x = normalize(up × z), y = z × x. Screen right
// is x and screen up is y, so a world direction's screen angle and its screen extent both fall out
// of two dot products — no camera object and no render needed, which is what lets the exterior
// distance be solved inside a pose function.
function screenBasis(viewDir) {
  const z = viewDir.clone().negate().normalize();
  const x = new THREE.Vector3().crossVectors(UPV, z).normalize();
  const y = new THREE.Vector3().crossVectors(z, x).normalize();
  return { x, y };
}

defineScenario({
  id: 'match_cut',
  label: 'The peg becomes the shell',
  ref: null,
  setup(app) {
    const { fleet } = scene(app, 'noon', {
      roots: ['fleet', 'bridge', 'bridgeLights'],
      seaState: 2,
      sky: { skyCover: 1.15, skyCloudSize: 1.4, skyHaze: 0.9, exposure: 0.92 },
      sun: [46, 22],
      fog: [700, 5200],
      fade: { fade: [120, 1400], rip: [130, 1500], lod: 0.72 },
      shadow: 140,
      amb: 0.8,
    });
    bridgeInterior(app, { rig: 'chart', env: 0.10, ripple: 1.1, haze: [0x241a18, 0.045] });
    // the plot glass's specular hot spot sat exactly under the macro camera and blew the frame
    W().world.table.setSheen(-1.1, -0.9, 0.30);

    setMuzzlePhase(0.05, 0.02);
    const [foe] = fleet.stage([
      { kit: 'battleship', cells: 5, x: 537, z: 602, heading: -1.62, seed: 4021 },
      { kit: 'cruiser', cells: 4, x: 1056, z: 663, heading: -1.35, detail: 1, seed: 771 },
    ]);
    foe.trainGuns(Math.PI / 2 + 0.3);
    fleet.plumes.add(537, foe.freeboard * 2.2, 602,
      { drift: [-38, 14], puffs: 18, rise: 9, scale: 4.4, tone: 0.32, seed: 61, alpha: 0.15, spread: 1.1 });
    for (const i of [0, 1]) vfx().muzzle(foe.fireGun(i), 4);

    const table = W().world.table;
    SHOT.peg = peg(app, table.pegWorld(CUT.cell.r, CUT.cell.c));
    SHOT.streak = streakCard(app);

    const from = v(-8, 26, 40), to = v(455, 0, 668);
    SHOT.cut = { from, to, arc: 44, arcObj: ballistic(from, to, { arc: 44 }) };
    SHOT.cutRound = vfx().tracer(from, to, 2600, { size: CUT.size, seed: 6607, arc: 44, sea: true });
    setShellPhase(0.42);

    app.camera.near = 0.02;
    app.camera.far = 9000;
    W().cine.director.seek('match_cut', 0.8);
  },
});

// The peg the cut starts on. It is NOT table.js's peg — that one is an instanced slot on a shared
// mesh and cannot be stretched on its own. This is a 30-triangle stand-in that sits exactly on top
// of it, which is also why the two can never disagree about where the peg is.
function peg(app, worldPos) {
  const g = new THREE.CylinderGeometry(0.0125, 0.0165, 1, 12, 1, false);
  g.translate(0, 0.5, 0);
  const m = new THREE.MeshStandardMaterial({
    color: 0xff7a3c, emissive: 0xff9a4a, emissiveIntensity: 3.2, roughness: 0.35, metalness: 0.1,
    toneMapped: true,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.name = '_c6_peg';
  mesh.position.copy(worldPos);
  mesh.frustumCulled = false;
  app.scene.add(mesh);
  return { mesh, mat: m, base: worldPos.clone(), height: 0.032 };
}

// A radial smear standing in for motion blur across the cut. One 96² premultiplied ramp on the
// soft-additive path — a hard-additive card here plateaus to white in exactly the way C3's §0P3.3
// describes.
//
// Pass 1 built this from 40 discrete lanes, and 40 lanes magnified to the width of the frame are
// 40 blobs: a critic measured them as a field of clipped white bokeh discs over a luma-38 ladder.
// The angular term here is a sum of smooth harmonics instead, so the field has no countable
// features at any magnification, and the radial term is an annulus so the centre stays clear.
let streakTex = null;
function streakTexture() {
  if (streakTex) return streakTex;
  const S = 96;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  let s = 991;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  // 18 harmonics up to order 46: the lowest sets the broad sweeps, the highest the fine grain
  const harm = Array.from({ length: 18 }, (_, i) => [3 + i * 2.5, rnd() * 6.283, 1 / (1 + i * 0.55)]);
  const norm = harm.reduce((t, h) => t + h[2], 0);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = (x + 0.5) / S - 0.5, w = (y + 0.5) / S - 0.5;
      const rad = Math.hypot(u, w) * 2, th = Math.atan2(w, u);
      let f = 0;
      for (const [k, ph, amp] of harm) f += amp * Math.cos(k * th + ph);
      f = 0.5 + 0.5 * (f / norm) * 2.2;
      const ring = Math.max(0, Math.min(1, (rad - 0.14) / 0.22)) * Math.max(0, 1 - Math.max(0, rad - 0.42) / 0.52);
      const a = Math.max(0, Math.min(1, f)) ** 1.6 * ring * Math.max(0, 1 - rad ** 3.2);
      const i = (y * S + x) * 4;
      // premultiplied: softAdd puts the blend factor on the source colour, so alpha does not modulate
      img.data[i] = 214 * a; img.data[i + 1] = 222 * a; img.data[i + 2] = 238 * a; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  streakTex = new THREE.CanvasTexture(cv);
  streakTex.colorSpace = THREE.SRGBColorSpace;
  streakTex.needsUpdate = true;
  track(streakTex, { w: S, h: S, fmt: 'rgba', mips: true, label: 'cine:streak' });
  return streakTex;
}

function streakCard(app) {
  const mat = softAdd(new THREE.MeshBasicMaterial({
    map: streakTexture(), transparent: true, depthWrite: false, depthTest: false, fog: false, toneMapped: true,
  }));
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.name = '_c6_streak';
  mesh.renderOrder = 40;
  mesh.frustumCulled = false;
  mesh.visible = false;
  app.camera.add(mesh);
  if (!app.scene.children.includes(app.camera)) app.scene.add(app.camera);
  return {
    mesh,
    set(amount, fov) {
      mesh.visible = amount > 0.004;
      if (!mesh.visible) return;
      const z = 0.9;
      const hh = 2 * Math.tan((fov * Math.PI) / 360) * z;
      mesh.position.set(0, 0, -z);
      mesh.scale.set(hh * 2.6, hh * 1.9, 1);
      mesh.material.color.setScalar(amount);
    },
  };
}

// ── the posing sequences ────────────────────────────────────────────────────────────────────

export function registerShotSequences(director) {
  // shell_flight: the chase pose, held. The scored still is t = 0.5.
  director.registerSequence('shell_flight', function* (rig) {
    const f = SHOT.flight || { from: v(-26, 27, -60), to: v(96, 0, 560), arc: 34 };
    const arc = ballistic(f.from, f.to, { arc: f.arc });
    const head = new THREE.Vector3(), ahead = new THREE.Vector3();
    const fov = 40;
    rig.drift(0.26, 0.0, 0.24);
    rig.fov(fov);
    rig.pose(2400, u => {
      const t = 0.30 + 0.40 * u;
      setShellPhase(t);
      if (SHOT.rounds) { SHOT.rounds[0].pose(t); SHOT.rounds[1]?.pose(Math.max(0, t - 0.10)); }
      arc.at(t, head);
      const d = arc.dir(t, ahead).clone();
      const side = v(-d.z, 0, d.x).normalize();
      // trail the round from its port quarter, above the flight line, and hold it at a fixed spot
      // in frame so the eye reads the ships behind it rather than hunting for the shell
      // 45 m back, not 26. The round is 3.5 m long and the target ship 60 m; at the old distance a
      // round drawn just under the horizon was as long on screen as the ship it was aimed at.
      // Backing off shrinks the round and leaves the ships, 200 m further on, essentially unmoved.
      const pos = head.clone()
        .addScaledVector(d, -(40 + 12 * u))
        .addScaledVector(side, 20 + 8 * u)
        .add(v(0, 1 + 7 * u, 0));
      const aspect = W().app.camera.aspect || 1.78;
      return { pos, look: aimFor(pos, head, [-0.36, 0.16], fov, aspect), fov };
    });
    yield { until: 2400 };
  });

  // window_out: interior → exterior, one move, scored at both ends.
  director.registerSequence('window_out', function* (rig, ctx) {
    const e0 = WIN.eye0, a0 = WIN.aim0, e1 = WIN.eye1, a1 = WIN.aim1;
    const ms = ctx.ms || WIN.ms;
    const sill = v(0.6, ROOM.deck - 0.6, 26);
    rig.fov(48);
    rig.drift(0.05, 0.12, 0.16);
    // The whole move as one curve, so t is a real position on it rather than a beat index. The
    // exposure ramp lags the camera by CINE.exposure.lagMs, which is what makes it read as an eye
    // adapting instead of as a cross-fade (BUILD_PLAN §7.1).
    rig.exposure(CINE.exposure.interior, CINE.exposure.exterior, ms, CINE.exposure.lagMs);
    const light = W().world.lighting;
    const glare = SHOT.glare || [];
    rig.tween(ms, u => {
      const k = Math.max(0, Math.min(1, (u * ms - 60) / (ms - 60)));
      light.sun.intensity = WIN.sun[0] + (WIN.sun[1] - WIN.sun[0]) * (k * k * (3 - 2 * k));
      // the window glare belongs to the room, not to the world: once the camera is through the
      // glass there is no aperture left to bloom
      const g = Math.max(0, 1 - Math.max(0, (u - 0.34) / 0.22));
      for (const m of glare) { m.visible = g > 0.02; m.material.color.setScalar(g); }
    });
    rig.pose(ms, u => {
      const e = EASE.inOut(u);
      const pos = new THREE.Vector3();
      const look = new THREE.Vector3();
      if (e < 0.34) {
        const k = e / 0.34;
        pos.lerpVectors(e0, v(0.35, ROOM.deck + 1.42, 4.35), k * k);
        look.lerpVectors(a0, sill, k);
      } else {
        const k = (e - 0.34) / 0.66;
        const s = k * k * (3 - 2 * k);
        pos.lerpVectors(v(0.35, ROOM.deck + 1.42, 4.35), e1, s);
        look.lerpVectors(sill, a1, s);
      }
      // drop the horizon as we leave: inside, the sill is the frame; outside, the sea is
      return { pos, look, fov: 48 + 6 * EASE.out(u) };
    });
    yield { until: ms };
  });

  // match_cut: peg → shell. TWO beats and one cut, because every break round 1 was measured for
  // was a discontinuity at a beat boundary. See the CUT block above for the whole argument.
  director.registerSequence('match_cut', function* (rig) {
    const p = SHOT.peg;
    const round = SHOT.cutRound;
    const streak = SHOT.streak;
    const cut = SHOT.cut || { arcObj: ballistic(v(-8, 26, 40), v(455, 0, 668), { arc: 44 }) };
    const arc = cut.arcObj;
    const S = CUT.stretch, S0 = CUT.stretch0;
    const SS = CUT.shellStretch, SF = CUT.shellFat;
    const U0 = CUT.u0;
    const fov = CUT.fov;
    const frameH = 2 * Math.tan((fov * Math.PI) / 360);
    const NDC = CUT.ndc;
    const aspect = () => W().app.camera.aspect || 1.78;
    const msIn = Math.round(CUT.ms * CUT.cutAt), msOut = CUT.ms - msIn;

    const pegBase = p ? p.base.clone() : v(0, ROOM.deck + 0.95, 0.15);
    const pegMid = st => pegBase.clone().add(v(0, CUT.pegH * st * 0.5, 0));
    // camera distance that makes an object `h` metres tall fill `frac` of the frame
    const distFor = (h, frac) => h / (frameH * frac);

    // Behind, above and slightly to port of the round, looking down its own flight path. That is
    // what projects a near-horizontal shell as a near-VERTICAL rod — the peg's silhouette — with
    // no camera roll at all, and it keeps the enemy line the round is aimed at in frame beyond it.
    const d0 = arc.dir(U0).clone();
    const side = v(-d0.z, 0, d0.x).normalize();
    const outDir = d0.clone().multiplyScalar(-1).addScaledVector(UPV, CUT.outLift).addScaledVector(side, 0.05).normalize();
    // |d·y| is the round's own axis projected onto screen-up: the foreshortening that decides how
    // long it actually looks. Solving the distance without it made the shell 40% short.
    const projY = Math.abs(d0.dot(screenBasis(outDir.clone().negate()).y));
    const shellLen = 1.35 * (VFX[CUT.size]?.scale ?? 1.7);
    const dCut = distFor(shellLen * SS * projY, CUT.frac[1]) * CUT.shellFit;

    const eyeDir0 = v(-0.72, 0.30, -0.62).normalize();   // across the plot, from the port wing

    const setPeg = (glow, stretch, on) => {
      if (!p) return;
      p.mesh.visible = on;
      p.mesh.scale.set(1 + (stretch - 1) * 0.08, CUT.pegH * stretch, 1 + (stretch - 1) * 0.08);
      p.mat.emissiveIntensity = 2.6 + glow * 26;
      p.mat.emissive.setRGB(1, 0.66 + glow * 0.30, 0.36 + glow * 0.56);
      p.mat.color.setRGB(1, 0.58 + glow * 0.38, 0.32 + glow * 0.64);
    };
    const roots = inside => {
      for (const o of W().app.scene.children) {
        if (o.name === 'bridge' || o.name === 'bridgeLights') o.visible = inside;
        if (o.name === 'fleet' || o.name === 'vfx') o.visible = !inside;
      }
    };
    // Peaks at the cut and is symmetric about it, so the same amount of smear sits on the frame
    // either side. Pass 1 ramped it in only on the interior and a critic read the ramp itself as a
    // bloom pass switching on.
    const smear = ms => 0.34 * Math.max(0, 1 - Math.abs(ms - msIn) / 240) ** 1.4;

    rig.fov(fov);
    rig.drift(0.004, 0.01, 0.2);

    // ── interior: the peg. One curve. The peg is lit and elongated at u = 0, it holds one screen
    // position throughout, and it grows from 22% to 44% of frame height while the camera swings
    // 104 degrees round it. Nothing else in the room is doing anything else.
    rig.pose(msIn, u => {
      roots(true);
      const e = EASE.inOut(u);
      const st = S0 + (S - S0) * e;
      const frac = CUT.frac[0] + (CUT.frac[1] - CUT.frac[0]) * e;
      setPeg(e, st, true);
      if (round) { setShellPhase(U0); round.pose(U0, SS, SF); }
      streak?.set(smear(u * msIn), fov);
      const mid = pegMid(st);
      const dir = eyeDir0.clone().applyAxisAngle(UPV, THREE.MathUtils.degToRad(CUT.orbitDeg) * e);
      const pos = mid.clone().addScaledVector(dir, distFor(CUT.pegH * st, frac));
      return { pos, look: aimFor(pos, mid, NDC, fov, aspect()) };
    });
    yield { until: msIn };

    // ── exterior: the round. Same screen position, same 44% of frame height, same near-vertical
    // rod. It relaxes to its real proportions while the camera opens out into a chase.
    rig.pose(msOut, u => {
      roots(false);
      setPeg(1, S, false);
      // the relax starts SLOW: the round has to still be the peg's shape for the frames either
      // side of the cut, or the anchor is gone before the eye has finished making the match
      const e = u * u;
      const uu = U0 + 0.085 * u;
      const st = SS + (1 - SS) * e;
      const fat = SF + (1 - SF) * e;
      if (round) { setShellPhase(uu); round.pose(uu, st, fat); }
      streak?.set(smear(msIn + u * msOut), fov);
      const head = arc.at(uu);
      // hold the anchor at 44% of frame height while it is still stretched, then let the camera
      // keep opening after it has relaxed — the size discontinuity at the cut is zero either way
      const held = distFor(shellLen * st * projY, CUT.frac[1]) * CUT.shellFit;
      const d = held + (dCut * CUT.outFar - held) * EASE.inOut(u);
      const pos = head.clone().addScaledVector(outDir, d);
      return { pos, look: aimFor(pos, head, NDC, fov, aspect()) };
    });
    yield { until: msOut };
  });

  // §7.3's assertion, and D24's requirement that an assertion state what it does not cover.
  //
  // `matchError()` (round 1) checked ONE axis, at ONE instant, for ONE pair of points, and passed
  // with 10x margin while a critic measured the subject jumping 50.6% of frame height across the
  // same cut. `matchReport()` replaces it: every sampled frame, both axes, and the anchor's screen
  // HEIGHT as well as its position — because a subject that holds its position and doubles in size
  // is also a cut that does not hold.
  //
  // What it still does not cover, stated because every assertion has blind spots and the useful
  // information is which: it measures the ANCHOR only, so it says nothing about the background,
  // the exposure, the roll of the horizon or anything a viewer reads as continuity other than
  // where the subject is and how big. It samples 11 frames, so a discontinuity narrower than 100 ms
  // is invisible to it. And it takes the round's mesh ORIGIN, which is the centre of the body, so
  // it does not see the tracer glow that extends behind it.
  const anchorAt = t => {
    const cam = W().app.camera;
    director.seek('match_cut', t);
    W().app.scene.updateMatrixWorld(true);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    const inside = t < CUT.cutAt;
    const o = inside ? SHOT.peg?.mesh : SHOT.cutRound?.round.mesh;
    if (!o) return null;
    const mid = o.getWorldPosition(new THREE.Vector3());
    let top, bot;
    if (inside) {
      // the peg grows from its base, so its world centre is half its scaled height up
      const h = o.scale.y;
      mid.y += h * 0.5;
      top = mid.clone().setY(mid.y + h * 0.5);
      bot = mid.clone().setY(mid.y - h * 0.5);
    } else {
      const half = new THREE.Vector3(0, o.scale.y * 0.5, 0).applyQuaternion(o.quaternion);
      top = mid.clone().add(half);
      bot = mid.clone().sub(half);
    }
    const a = mid.clone().project(cam), b = top.clone().project(cam), c = bot.clone().project(cam);
    return {
      t: +t.toFixed(2), side: inside ? 'peg' : 'shell',
      x: +a.x.toFixed(4), y: +a.y.toFixed(4),
      hFrac: +(Math.abs(b.y - c.y) / 2).toFixed(4),
      angDeg: +(Math.atan2((b.y - c.y), (b.x - c.x) * (cam.aspect || 1.78)) * 180 / Math.PI).toFixed(1),
    };
  };

  Promise.resolve().then(() => Object.assign(W().cine, {
    matchReport(n = 10) {
      const rows = [];
      for (let i = 0; i <= n; i++) rows.push(anchorAt(i / n));
      const steps = [];
      for (let i = 1; i < rows.length; i++) {
        steps.push({
          from: rows[i - 1].t, to: rows[i].t,
          dxFrac: +(Math.abs(rows[i].x - rows[i - 1].x) / 2).toFixed(4),
          dyFrac: +(Math.abs(rows[i].y - rows[i - 1].y) / 2).toFixed(4),
          dhFrac: +(rows[i].hFrac - rows[i - 1].hFrac).toFixed(4),
        });
      }
      const cutStep = steps.find(s => s.from < CUT.cutAt && s.to >= CUT.cutAt);
      const mag = steps.map(s => Math.hypot(s.dxFrac, s.dyFrac));
      const worst = k => steps.reduce((m, s) => (Math.abs(s[k]) > Math.abs(m[k]) ? s : m), steps[0]);
      return {
        frames: rows, steps,
        cut: cutStep,
        worstDx: worst('dxFrac'), worstDy: worst('dyFrac'), worstDh: worst('dhFrac'),
        tolerance: CINE.matchCut.tolerance,
        // A settle SHOULD go to zero, so max/min is meaningless. What a broken interpolator looks
        // like is one step far above the median: round 1 measured −104.5 px then +2.0 px between
        // equal-duration samples.
        maxStep: +Math.max(...mag).toFixed(4),
        medianStep: +[...mag].sort((a, b) => a - b)[Math.floor(mag.length / 2)].toFixed(4),
        maxOverMedian: +(Math.max(...mag)
          / Math.max(1e-4, [...mag].sort((a, b) => a - b)[Math.floor(mag.length / 2)])).toFixed(1),
      };
    },
    // kept so anything written against round 1 still runs; it is the cut instant only
    matchError() {
      const a = anchorAt(CUT.cutAt - 0.002), b = anchorAt(CUT.cutAt + 0.002);
      return {
        peg: [a.x, a.y], shell: [b.x, b.y],
        dxFrac: +(Math.abs(a.x - b.x) / 2).toFixed(4),
        dyFrac: +(Math.abs(a.y - b.y) / 2).toFixed(4),
        dhFrac: +(b.hFrac - a.hFrac).toFixed(4),
      };
    },
    shot: SHOT,
  }));
}
