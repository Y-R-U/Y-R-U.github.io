// main.js — the loop: room → connect → flythrough → (wander, drive) → room …
// States: room | entering | connecting | tour | free | drive | descend

import * as THREE from 'three';
import { nextUuid, randomUuid, isUuid, ALPHABET } from './prng.js';
import { decode, readout } from './genome.js';
import { World } from './world.js';
import { buildEffects } from './effects.js';
import { Flythrough } from './flythrough.js';
import { FreeFly, DriveController } from './controls.js';
import { Room, ROOM_SEAT, ROOM_DOOR } from './room.js';
import { ui, copyText } from './ui.js';
import { AudioEngine } from './audio.js';

// The genesis world — every trait hand-picked, chars 27–31 pure entropy.
const GENESIS = [
  '2', // 0  sky: Ember Dusk
  'J', // 1  time: golden hour
  '2', // 2  weather: light haze
  'k', // 3  water: teal
  '5', // 4  layout: The Bay
  'w', // 5  buildings: ~40
  'A', // 6  max floors: ~30
  '4', // 7  palette: Noir & Gold
  '6', // 8  arch: Mixed District
  'B', // 9  vehicles: ~12
  '0', // 10 vehicle palette: Taxi Fleet
  '0', // 11 person: Dario Amodei
  '8', // 12 quote: "Every world fits in thirty-two characters."
  '3', // 13 posters: spiral
  '0', // 14 book
  '0', // 15 fly: Drone Sweep
  '0', // 16 fact
  '2', // 17 billboards: Seed Travel Co.
  '4', // 18 hero: Aurora Emerald
  '7', // 19 ambient: birds
  '0', // 20 signs: tensor streets
  '0', // 21 shops
  '0', // 22 room: Warm Study
  '2', // 23 sound: Warm Pad
  '0', // 24 nature: pine
  'E', // 25 lights: busy windows
  'R', // 26 landmark: Lighthouse
  '5', 'u', 'W', '9', 'x', // 27–31 entropy
].join('');

const params = new URLSearchParams(location.search);
const FAST = params.has('fast') || params.has('shot');
const SHOT = params.has('shot');

// ── renderer / camera ────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('app').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.1, 2000);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ── game state ───────────────────────────────────────────────────────────────
const G = {
  state: 'room',
  uuid: null, spec: null,
  world: null, effects: null, fly: null,
  room: null,
  journey: JSON.parse(localStorage.getItem('uw-journey') || '[]'),
  arrivalMode: 'origin',
  speedIdx: 0,
  entryT: -1,          // room entry glide
  resumeTween: null,
  tapCount: 0, tapTimer: null,
  clock: new THREE.Clock(),
  worldT: 0,
};
const SPEEDS = [1, 2, 3];
const audio = new AudioEngine();
const free = new FreeFly(renderer.domElement, camera);
const drive = new DriveController(camera, ui.joy);
const raycaster = new THREE.Raycaster();

function saveJourney() {
  localStorage.setItem('uw-journey', JSON.stringify(G.journey.slice(-500)));
  localStorage.setItem('uw-current', G.uuid);
}

// ── boot ─────────────────────────────────────────────────────────────────────
function pickStartUuid() {
  const q = params.get('u');
  if (q && isUuid(q)) return q;
  const saved = localStorage.getItem('uw-current');
  if (saved && isUuid(saved)) return saved;
  return GENESIS;
}

function boot() {
  ui.init({
    onResume: resumeTour,
    onSpeed: cycleSpeed,
    onExitCar: exitCar,
    onAudio: () => { audio.ensure(); ui.setAudioIcon(audio.toggleMute()); },
    onChipTap: () => { copyText(G.uuid); audio.copyBlip(); ui.toast('current world copied'); },
  });
  ui.setAudioIcon(audio.muted);
  G.uuid = pickStartUuid();
  G.spec = decode(G.uuid);
  if (G.journey.length === 0) {
    G.journey.push({ u: G.uuid, mode: 'origin', t: Date.now() });
    G.arrivalMode = 'origin';
  } else {
    G.arrivalMode = G.journey[G.journey.length - 1].mode ?? 'origin';
  }
  saveJourney();

  if (SHOT) { shotBoot(); return; }
  enterRoom(true);
  ui.fade(false, FAST ? 80 : 900);
  requestAnimationFrame(loop);
}

// screenshot mode: straight into the genesis world, mid-tour, frozen
async function shotBoot() {
  ui.fade(false, 50);
  G.world = new World(G.spec);
  G.effects = buildEffects(G.world, G.spec);
  G.fly = new Flythrough(G.world);
  const { pos, look } = G.fly.poseAt(0.3);
  camera.position.copy(pos);
  camera.lookAt(look);
  G.world.update(8, 0.016);
  G.effects.update(8, 0.016);
  renderer.render(G.world.scene, camera);
  window.__shotReady = true;
  requestAnimationFrame(loop);
}

// ── the room ─────────────────────────────────────────────────────────────────
function enterRoom(instant = false) {
  G.room = new Room(G.spec, nextUuid(G.uuid), {
    visited: G.journey.length,
    mode: G.arrivalMode,
  });
  G.state = instant ? 'room' : 'entering';
  G.entryT = instant ? -1 : 0;
  if (instant) {
    camera.position.copy(ROOM_SEAT.pos);
    camera.lookAt(ROOM_SEAT.look);
    seatLook();
  }
  ui.showChip(false); ui.showResume(false); ui.showSpeed(false);
  ui.showExitCar(false); ui.showJoy(false); ui.poi('');
}

function seatLook() {
  free.enabled = true;
  free.lookOnly = true;
  free.syncFromCamera();
  free.baseYaw = free.yaw;
  free.basePitch = free.pitch;
}

// ── travel ───────────────────────────────────────────────────────────────────
async function travel(uuid, mode) {
  if (G.state === 'connecting') return;
  G.state = 'connecting';
  audio.ensure();
  audio.connectSound();
  free.enabled = false;

  const spec = decode(uuid);
  ui.showConnect(uuid, readout(spec));
  await ui.fade(true, FAST ? 80 : 500);

  // tear down wherever we were
  if (G.room) { G.room.dispose(); G.room = null; }
  if (G.world) { disposeWorld(); }

  G.uuid = uuid;
  G.spec = spec;
  G.arrivalMode = mode;
  G.journey.push({ u: uuid, mode, t: Date.now() });
  saveJourney();
  try { history.replaceState(null, '', '#' + uuid); } catch (e) {}

  await frame(); // let the overlay paint
  G.world = new World(spec);
  await frame();
  G.effects = buildEffects(G.world, spec);
  G.fly = new Flythrough(G.world);
  G.fly.mult = SPEEDS[G.speedIdx];
  G.worldT = 0;

  const { pos, look } = G.fly.poseAt(0);
  camera.position.copy(pos);
  camera.lookAt(look);
  audio.setWorld(spec.sound);

  await wait(FAST ? 150 : 1400); // savour the readout
  ui.hideConnect();
  await ui.fade(false, FAST ? 80 : 700);
  audio.whoosh();
  G.state = 'tour';
  ui.setChip(uuid);
  ui.showChip(true);
  ui.showSpeed(true);
  ui.setSpeed(SPEEDS[G.speedIdx]);
}

function disposeWorld() {
  G.world.dispose();
  G.world = null; G.effects = null; G.fly = null;
}

async function tourDone() {
  G.state = 'descend';
  audio.whoosh();
  await ui.fade(true, FAST ? 100 : 800);
  const world = G.world;
  enterRoom(false);
  camera.position.copy(ROOM_DOOR.pos);
  camera.lookAt(ROOM_DOOR.look);
  if (world) { world.dispose(); G.world = null; G.effects = null; G.fly = null; }
  await ui.fade(false, FAST ? 100 : 700);
}

// ── tour controls ────────────────────────────────────────────────────────────
function interruptTour() {
  if (G.state !== 'tour') return;
  G.state = 'free';
  free.enabled = true;
  free.lookOnly = false;
  free.syncFromCamera();
  ui.showResume(true);
  ui.showSpeed(false);
  ui.poi('');
  audio.blip();
}

function resumeTour() {
  if (G.state === 'drive') exitCar(true);
  if (G.state !== 'free') return;
  G.state = 'resuming';
  free.enabled = false;
  ui.showResume(false);
  const from = camera.position.clone();
  const fq = camera.quaternion.clone();
  const { pos, look } = G.fly.poseAt(G.fly.t);
  const m4 = new THREE.Matrix4().lookAt(pos, look, new THREE.Vector3(0, 1, 0));
  const tq = new THREE.Quaternion().setFromRotationMatrix(m4);
  G.resumeTween = { t: 0, from, fq, to: pos, tq, dur: FAST ? 0.2 : 1.1 };
}

function cycleSpeed() {
  G.speedIdx = (G.speedIdx + 1) % SPEEDS.length;
  if (G.fly) G.fly.mult = SPEEDS[G.speedIdx];
  ui.setSpeed(SPEEDS[G.speedIdx]);
  audio.blip();
}

// ── driving ──────────────────────────────────────────────────────────────────
function tryEnterCar(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const v = G.world.vehicleAt(raycaster.ray);
  if (!v) return false;
  const d = camera.position.distanceTo(new THREE.Vector3(v.x, G.world.plateauY, v.z));
  if (d > 90) return false;
  G.state = 'drive';
  free.enabled = false;
  drive.enter(G.world, v);
  ui.showJoy(true);
  ui.showExitCar(true);
  ui.showResume(true);
  audio.carStart();
  ui.toast('you drive now');
  return true;
}

function exitCar(silent = false) {
  if (G.state !== 'drive') return;
  const v = drive.exit();
  G.state = 'free';
  ui.showJoy(false);
  ui.showExitCar(false);
  if (v) {
    camera.position.set(v.x + Math.cos(v.yaw) * 4, G.world.plateauY + 2.2, v.z - Math.sin(v.yaw) * 4);
  }
  free.enabled = true;
  free.lookOnly = false;
  free.syncFromCamera();
  if (!silent) audio.blip();
}

// ── room taps: the discoverable surface ──────────────────────────────────────
function roomTap(ndc) {
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(G.room.clickables, false);
  if (!hits.length) return;
  const hit = hits[0];
  const action = hit.object.userData.action;
  audio.ensure();

  if (action === 'screen') {
    const sa = G.room.screenAction(hit.uv.x, hit.uv.y);
    if (sa === 'connect') travel(nextUuid(G.uuid), 'chained');
    else if (sa === 'random') travel(randomUuid(), 'random');
    else if (sa === 'uuid') uuidTap();
    else if (sa === 'person') { ui.toast(`logged in: ${G.spec.person}`); audio.blip(); }
    else if (sa === 'header') { ui.toast(`session #${G.journey.length} · uuidnet stays up forever`); audio.blip(); }
  } else if (action === 'book') {
    audio.blip();
    ui.modal({ title: G.spec.book.t, body: `${G.spec.book.by}\n\n${firstLine()}\n\n(the only copy in ${62 ** 32 > 0 ? '2.27×10⁵⁷' : ''} worlds)` });
  } else if (action === 'quote') {
    audio.blip();
    ui.toast('this quote hangs somewhere else in this world too');
  } else if (action === 'poster') {
    audio.blip();
    ui.toast(`poster series: ${G.spec.posterSet.fam.style}`);
  } else if (action === 'window') {
    audio.blip();
    ui.toast(`${G.spec.sky.name} over ${G.spec.layout.name.toLowerCase()}`);
  }
}

// single = copy next · double = how-big fact · triple = copy current
function uuidTap() {
  G.tapCount++;
  clearTimeout(G.tapTimer);
  G.tapTimer = setTimeout(() => {
    const n = G.tapCount;
    G.tapCount = 0;
    if (n === 1) {
      copyText(nextUuid(G.uuid));
      audio.copyBlip();
      ui.toast('next world copied');
    } else if (n === 2) {
      audio.blip();
      ui.modal({ title: 'how big is 62³²?', body: G.spec.fact });
    } else if (n >= 3) {
      copyText(G.uuid);
      audio.copyBlip();
      ui.toast('CURRENT world copied — you are here');
    }
  }, 340);
}

// a seeded first line for the book on the desk
function firstLine() {
  const r = G.spec.rand('book-line');
  const openers = ['The morning the sky changed palette,', 'Nobody in the city remembered arriving, and', 'On the last page of the atlas', 'When the lighthouse finally blinked twice,', 'The number came to me in a dream, and', 'After the third world, honestly,'];
  const mids = ['I stopped counting the windows', 'the water forgot its own colour', 'every street sign pointed home', 'we drove until the render distance', 'the towers leaned in to listen', 'the seed kept its promise'];
  const ends = ['and that was enough.', 'the way seeds do.', 'exactly as computed.', 'like it always had.', 'and no one was surprised.', 'which is how travel works here.'];
  return `“${r.pick(openers)} ${r.pick(mids)}, ${r.pick(ends)}”`;
}

// ── tap routing ──────────────────────────────────────────────────────────────
free.onTap = (ndc, e) => {
  if (e.target !== renderer.domElement) return;
  if (ui.modalOpen()) { ui.closeModal(); return; }
  if (G.state === 'room') roomTap(ndc);
  else if (G.state === 'tour') interruptTour();
  else if (G.state === 'free') tryEnterCar(ndc);
};

// ── main loop ────────────────────────────────────────────────────────────────
const frame = () => new Promise((r) => requestAnimationFrame(r));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, G.clock.getDelta());
  const t = G.clock.elapsedTime;

  if (G.room && (G.state === 'room' || G.state === 'entering')) {
    G.room.update(t, dt);
    if (G.state === 'entering') {
      G.entryT += dt / (FAST ? 0.3 : 2.0);
      const f = Math.min(1, G.entryT);
      const s = f * f * (3 - 2 * f);
      camera.position.lerpVectors(ROOM_DOOR.pos, ROOM_SEAT.pos, s);
      const look = ROOM_DOOR.look.clone().lerp(ROOM_SEAT.look, s);
      camera.lookAt(look);
      if (f >= 1) { G.state = 'room'; seatLook(); }
    } else {
      // clamped seat look-around
      free.yaw = Math.max(free.baseYaw - 0.9, Math.min(free.baseYaw + 0.9, free.yaw));
      free.pitch = Math.max(free.basePitch - 0.5, Math.min(free.basePitch + 0.55, free.pitch));
      free.update(dt);
    }
    renderer.render(G.room.scene, camera);
    return;
  }

  if (G.world) {
    G.worldT += dt;
    G.world.update(G.worldT, dt);
    if (G.effects) G.effects.update(G.worldT, dt);

    if (G.state === 'tour' && G.fly) {
      const done = G.fly.update(camera, dt);
      ui.poi(G.fly.currentLabel());
      if (done) { ui.poi(''); ui.showSpeed(false); tourDone(); }
    } else if (G.state === 'free') {
      free.update(dt);
    } else if (G.state === 'drive') {
      drive.update(dt);
    } else if (G.state === 'resuming' && G.resumeTween) {
      const tw = G.resumeTween;
      tw.t += dt / tw.dur;
      const f = Math.min(1, tw.t);
      const s = f * f * (3 - 2 * f);
      camera.position.lerpVectors(tw.from, tw.to, s);
      camera.quaternion.slerpQuaternions(tw.fq, tw.tq, s);
      if (f >= 1) {
        G.resumeTween = null;
        G.state = 'tour';
        G.fly.lookCur.copy(G.fly.poseAt(G.fly.t).look);
        ui.showSpeed(true);
      }
    }
    renderer.render(G.world.scene, camera);
  }
}

free.getGroundH = (x, z) => (G.world ? G.world.terrainH(x, z) : 0);

// debug / soak-test handle
window.__uw = {
  get state() { return G.state; },
  get uuid() { return G.uuid; },
  travel, interruptTour, resumeTour,
  connect: () => travel(nextUuid(G.uuid), 'chained'),
  random: () => travel(randomUuid(), 'random'),
  driveNearest: () => {   // soak-test hook: hop into the closest vehicle
    if (G.state !== 'free' || !G.world?.vehicles.length) return false;
    let best = null, bd = 1e9;
    for (const v of G.world.vehicles) {
      const d = (v.x - camera.position.x) ** 2 + (v.z - camera.position.z) ** 2;
      if (d < bd) { bd = d; best = v; }
    }
    G.state = 'drive';
    free.enabled = false;
    drive.enter(G.world, best);
    ui.showJoy(true); ui.showExitCar(true); ui.showResume(true);
    return true;
  },
  exitCar,
  camera, free,
  G,
};

boot();
