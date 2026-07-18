// main.js — the loop: room → connect → flythrough → (wander, drive) → room …
// States: room | entering | connecting | tour | free | drive | descend

import * as THREE from 'three';
import { nextUuid, randomUuid, isUuid, ALPHABET } from './prng.js';
import { decode, readout } from './genome.js';
import { PEOPLE, PERSON_LINES, POSTER_LORE, QUOTE_NOTES, BILLBOARD_LORE } from './tables.js';
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
free.sticks = { move: ui.flyMove, look: ui.flyLook, vert: () => ui.flyVert, prefs: ui.flyPrefs };
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
  ui.showExitCar(false); ui.showJoy(false); ui.showFlyJoys(false); ui.poi('');
  ui.setResumeLabel('resume tour');
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
  G.walk = false;
  ui.showFlyJoys(false); ui.showResume(false); ui.showJoy(false); ui.showExitCar(false);
  ui.setResumeLabel('resume tour');
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
  ui.setResumeLabel('resume tour');
  ui.showResume(true);
  ui.showFlyJoys(true);
  ui.showSpeed(false);
  ui.poi('');
  audio.blip();
}

function resumeTour() {
  if (G.state === 'drive') exitCar(true);
  if (G.state !== 'free') return;
  // after the tour has ended (room exit walkabout) resume = back to the room
  if (G.walk || !G.fly) { returnToRoom(); return; }
  G.state = 'resuming';
  free.enabled = false;
  ui.showResume(false);
  ui.showFlyJoys(false);
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
  ui.showFlyJoys(false);
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
  ui.showFlyJoys(true);
  ui.showExitCar(false);
  if (v) {
    camera.position.set(v.x + Math.cos(v.yaw) * 4, G.world.plateauY + 2.2, v.z - Math.sin(v.yaw) * 4);
  }
  free.enabled = true;
  free.lookOnly = false;
  free.syncFromCamera();
  if (!silent) audio.blip();
}

// ── room taps: the discoverable surface — everything has a story ─────────────
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
    else if (sa === 'person') { audio.blip(); personModal(); }
    else if (sa === 'header') { ui.toast(`session #${G.journey.length} · uuidnet stays up forever`); audio.blip(); }
  } else if (action === 'book') {
    audio.blip();
    ui.modal({ title: G.spec.book.t, body: `${G.spec.book.by}\n\nFirst line:\n${firstLine()}\n\n(the only copy in 2.27×10⁵⁷ worlds)` });
  } else if (action === 'quote') {
    audio.blip();
    quoteModal(false);
  } else if (action === 'poster') {
    audio.blip();
    const style = G.spec.posterSet.fam.style;
    ui.modal({ title: `poster series: ${style}`, body: POSTER_LORE[style] ?? '' });
  } else if (action === 'inspo') {
    audio.blip();
    const [word, sub] = G.room.inspo;
    ui.modal({ title: word, body: `${sub}\n\nMotivational posters exist in all 2.27×10⁵⁷ worlds. Nobody prints them. They are simply always already on the wall.` });
  } else if (action === 'window') {
    audio.blip();
    ui.modal({
      title: 'the window',
      body: `${G.spec.sky.name} over ${G.spec.layout.name.toLowerCase()} — ${G.spec.weather.name.toLowerCase()}, ${G.spec.time.name.toLowerCase()}.\n\nPainted from this world's genome. Same seed, same view, forever.`,
    });
  } else if (action === 'help') {
    audio.blip();
    ui.modal({
      title: 'field notes', mono: true,
      body: '· CONNECT follows the chain — random jumps anywhere\n· tap the code once: copy the NEXT world\n· tap it twice: a sense of scale\n· a third tap copies THIS world\n· the user\'s name has a story · so does the book\n· the posters know their own mathematics\n· the wall quote hangs in exactly one other place\n· the door is not locked\n· out there: tap a car to drive it\n· tap the big animated screens · tap the billboards\n· the glowing doorway always leads home\n· ⚙ tunes how you fly\n\n(some things are not written down)',
    });
  } else if (action === 'door') {
    exitRoom();
  } else if (action === 'mug') {
    audio.blip();
    const shop = G.spec.shops.names[G.spec.rand('mug').int(0, G.spec.shops.names.length - 1)];
    ui.modal({ title: 'the mug', body: `A souvenir from ${shop}, a few streets from here.\n\nYou have never been there. You have always had this mug.` });
  } else if (action === 'plant') {
    audio.blip();
    const kind = { cone: 'pine', round: 'broadleaf', palm: 'palm', dead: 'bare-branch', crystal: 'crystal' }[G.spec.nature.shape] ?? 'small';
    ui.modal({ title: 'the plant', body: `A ${kind} sapling from beyond the ring road. It is doing fine.\n\nIt will always be doing fine. That is what deterministic means.` });
  } else if (action === 'papers') {
    audio.blip();
    const pl = PERSON_LINES[G.spec.personIdx];
    ui.modal({ title: 'a loose page', body: `Personnel file, corner torn:\n\n${G.spec.person} — ${pl.known}\n\nThe rest of the page is a hand-drawn map of somewhere that is probably this city.` });
  } else if (action === 'shelf') {
    audio.blip();
    ui.modal({ title: 'the shelf', body: `Sixty-two spines, none of the titles quite readable. Every world shelves the same books in a different order.\n\nThe one that matters is on the desk: “${G.spec.book.t}”.` });
  }
}

// operator profile: who is logged in, what they did, what they said
function personModal() {
  const pl = PERSON_LINES[G.spec.personIdx];
  let body = `${pl.known}\n\n${pl.fact}`;
  if (pl.qs.length) body += `\n\n“${G.spec.rand('person-line').pick(pl.qs)}”`;
  body += '\n\n(logged in from this terminal, allegedly)';
  ui.modal({ title: G.spec.person, body });
}

// the wall quote, with a note on its author when we know them
function quoteModal(isTwin) {
  const q = G.spec.quote;
  let body = `“${q.t}”\n${q.by ? '— ' + q.by : '— unattributed; native to this universe'}`;
  const pi = PEOPLE.indexOf(q.by);
  if (pi >= 0) body += `\n\n${PERSON_LINES[pi].known}`;
  else if (QUOTE_NOTES[q.by]) body += `\n\n${QUOTE_NOTES[q.by]}`;
  body += isTwin
    ? '\n\nThe other copy hangs framed in the room.'
    : '\n\nIts twin is painted on a billboard somewhere in this world. The tour sometimes passes it.';
  ui.modal({ title: isTwin ? 'the wall quote — its twin' : 'the wall quote', body });
}

// ── leaving the room on foot ─────────────────────────────────────────────────
async function exitRoom() {
  if (G.state !== 'room') return;
  G.state = 'connecting';
  audio.ensure();
  audio.whoosh();
  await ui.fade(true, FAST ? 100 : 600);
  if (G.room) { G.room.dispose(); G.room = null; }
  await frame();
  G.world = new World(G.spec);          // deterministic: the same world you toured
  await frame();
  G.effects = buildEffects(G.world, G.spec);
  G.fly = null;
  G.worldT = 0;
  const A = G.world.arrival;
  camera.position.copy(A.door).addScaledVector(A.out, 5).setY(G.world.plateauY + 1.7);
  camera.lookAt(A.door.clone().addScaledVector(A.out, 40).setY(G.world.plateauY + 4));
  audio.setWorld(G.spec.sound);
  G.state = 'free';
  G.walk = true;
  free.enabled = true;
  free.lookOnly = false;
  free.syncFromCamera();
  ui.setChip(G.uuid);
  ui.showChip(true);
  ui.setResumeLabel('return to room');
  ui.showResume(true);
  ui.showFlyJoys(true);
  await ui.fade(false, FAST ? 100 : 600);
  ui.toast('outside — the glowing doorway leads back');
}

async function returnToRoom() {
  if (!G.world || G.state === 'descend') return;
  G.state = 'descend';
  G.walk = false;
  free.enabled = false;
  audio.whoosh();
  ui.showFlyJoys(false); ui.showResume(false); ui.showSpeed(false);
  ui.showJoy(false); ui.showExitCar(false); ui.poi('');
  await ui.fade(true, FAST ? 100 : 700);
  disposeWorld();
  enterRoom(true);
  await ui.fade(false, FAST ? 100 : 600);
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

// ── world taps: cars, the glowing door, displays, billboards ─────────────────
function tryDoor(ndc) {
  if (!G.world?.doorMesh) return false;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(G.world.doorMesh, false);
  if (!hits.length || hits[0].distance > 80) return false;
  audio.blip();
  ui.toast('you found the door');
  returnToRoom();
  return true;
}

function tryDisplay(ndc) {
  const ds = G.world?.displays ?? [];
  if (!ds.length) return false;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(ds.map((d) => d.mesh), false);
  if (!hits.length || hits[0].distance > 170) return false;
  const name = G.world.cycleDisplay(hits[0].object);
  if (name) { audio.blip(); ui.toast(`display: ${name}`); }
  return true;
}

function tryBillboard(ndc) {
  const bs = G.world?.billboardMeshes ?? [];
  if (!bs.length) return false;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(bs, false);
  if (!hits.length || hits[0].distance > 150) return false;
  const bb = hits[0].object.userData.bb;
  audio.blip();
  if (bb.quote) quoteModal(true);
  else ui.modal({ title: bb.famName, body: `“${bb.msg.replace(/\n/g, ' — ')}”\n\n${BILLBOARD_LORE[bb.famId] ?? ''}` });
  return true;
}

// ── tap routing ──────────────────────────────────────────────────────────────
free.onTap = (ndc, e) => {
  if (e.target !== renderer.domElement) return;
  if (ui.modalOpen()) { ui.closeModal(); return; }
  if (G.state === 'room') roomTap(ndc);
  else if (G.state === 'tour') interruptTour();
  else if (G.state === 'free') {
    if (tryEnterCar(ndc)) return;
    if (tryDoor(ndc)) return;
    if (tryDisplay(ndc)) return;
    tryBillboard(ndc);
  }
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
      // full look-around from the chair — the room deserves it
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
    ui.showJoy(true); ui.showFlyJoys(false); ui.showExitCar(true); ui.showResume(true);
    return true;
  },
  exitCar,
  exitRoom, returnToRoom,
  camera, free,
  G,
};

boot();
