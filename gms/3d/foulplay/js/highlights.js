// The highlights reel. Everything on track is sampled into a ring buffer at
// 20Hz; when something worth watching happens we copy the last second out of
// the ring and keep appending for another second (or two and a half, for a
// wreck).
//
// Playback rebuilds fresh cars and drives them from the recording. The samples
// therefore have to carry every bit of car state the clip needs to look right —
// which panels are still on, which are HANGING OFF, and how beaten up the shell
// is. Recording only "present or gone" is what used to make every highlight
// show a factory-clean car with panels popping out of existence.
//
// `STRIDE` is versioned into each saved memory, because a memory in
// localStorage outlives the layout it was written with.

import * as THREE from 'three';
import { scene, setEnvironment, disposeGroup } from './render.js';
import { buildCar, PART_IDS } from './carfactory.js';
import { danglePose } from './car.js';
import { spawnScrap } from './debris.js';
import { setCamera } from './camera.js';
import { setFov } from './render.js';
import { buildTrack } from './trackgen.js';
import { buildTrackMesh } from './trackmesh.js';
import { TRACK_BY_ID } from './trackgen.js';
import { state } from './state.js';
import { profile, saveProfile } from './save.js';
import { on, emit } from './bus.js';
import * as fx from './particles.js';
import { clamp, clamp01, lerp, rand, pick, wrap } from './utils.js';

const HZ = 20;
const DT = 1 / HZ;
// Short. A highlight is the moment and just enough run-up to see it coming —
// these used to be 2.3s of lead-in and, once the slow motion was integrated, a
// wreck clip ran for EIGHTEEN SECONDS of wall clock. A six-clip reel was over
// two minutes, which is why the reel felt like it was showing nothing: it was
// mostly a car driving normally, in slow motion.
const PRE = 1.0;               // seconds of lead-in kept in the ring
const POST = 0.9;              // seconds recorded after the trigger
// A car actually coming apart takes longer than that, and it is the best thing
// in the game to watch, so wrecks get their own, longer tail — long enough to
// cover `CRASH.breakUpSpread`, and no longer.
const POST_WRECK = 2.6;
// floats per car per sample: position(3) quat(4) visible(1) attached(1)
// dangling(1) damage(1)
const STRIDE = 11;
const MAX_CLIPS = 26;
const MAX_MEMORIES = 8;

const isWreck = (kind) => kind === 'WRECKED THEM' || kind === 'WIPEOUT' || kind === 'WRECK';

let cars = [];
let ring = [];                 // Float32Array frames
let ringAt = 0;
let ringLen = 0;
let acc = 0;
let clips = [];
let pending = [];
let unsub = [];
let armed = false;

// ---------------------------------------------------------------------------
export function initHighlights(carList) {
  clearHighlights();
  cars = carList;
  ringLen = Math.ceil(PRE * HZ) + 2;
  ring = [];
  for (let i = 0; i < ringLen; i++) ring.push(new Float32Array(cars.length * STRIDE));
  ringAt = 0;
  acc = 0;
  armed = profile.settings.highlights !== false;

  unsub = [
    on('car:wreck', ({ car, by }) => {
      if (by && by.isPlayer) mark('WRECKED THEM', car, 100, `${car.name} INTO THE WALL`);
      else if (car.isPlayer) mark('WIPEOUT', car, 74, 'THAT IS GOING TO HURT');
      else mark('WRECK', car, 46, `${car.name} LOSES IT`);
    }),
    on('car:partOff', ({ car, by }) => {
      if (by && by.isPlayer) mark('DISMANTLED', car, 42, `${car.name} LOSES A PANEL`);
      else if (car.isPlayer) mark('DAMAGE', car, 26, 'THERE GOES A PANEL');
    }),
    on('attack:hit', ({ attacker, target, skill, dealt }) => {
      if (attacker.isPlayer && dealt > 24) mark('BIG HIT', target, 52 + dealt * 0.2, skill.name);
    }),
    on('car:landed', ({ car, air, peak }) => {
      if (peak > 3.2) mark('BIG AIR', car, 34 + peak * 3.4, `${peak.toFixed(1)}m OF AIR`);
    }),
    on('car:driftEnd', ({ car, time }) => {
      if (car.isPlayer && time > 2.6) mark('DRIFT', car, 24 + time * 4, `${time.toFixed(1)}s SIDEWAYS`);
    }),
    on('race:overtake', ({ car, position }) => {
      if (position <= 3) mark('OVERTAKE', car, 30, `INTO P${position}`);
    }),
    on('steward:verdict', ({ cleared }) => {
      if (cleared && state.player) mark('GOT AWAY WITH IT', state.player, 44, 'NO FURTHER ACTION');
    }),
  ];
}

export function clearHighlights() {
  for (const u of unsub) u && u();
  unsub = [];
  clips = [];
  pending = [];
  ring = [];
  cars = [];
  stopPlayback();
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------
export function recordFrame(dt, list) {
  if (!armed || !ring.length) return;
  acc += dt;
  if (acc < DT) return;
  acc = 0;

  const f = ring[ringAt];
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    const o = i * STRIDE;
    f[o] = c.worldPos.x; f[o + 1] = c.worldPos.y; f[o + 2] = c.worldPos.z;
    f[o + 3] = c.worldQuat.x; f[o + 4] = c.worldQuat.y;
    f[o + 5] = c.worldQuat.z; f[o + 6] = c.worldQuat.w;
    f[o + 7] = c.mesh.visible && c.alive ? 1 : 0;
    f[o + 8] = partMask(c);
    f[o + 9] = dangleMask(c);
    f[o + 10] = c.maxHp ? clamp01(1 - c.hp / c.maxHp) : 0;
  }
  ringAt = (ringAt + 1) % ringLen;

  for (let i = pending.length - 1; i >= 0; i--) {
    const clip = pending[i];
    clip.frames.push(Float32Array.from(f));
    clip.left -= DT;
    if (clip.left <= 0) {
      pending.splice(i, 1);
      clips.push(clip);
      if (clips.length > MAX_CLIPS) clips.shift();
    }
  }
}

function partMask(car) {
  let m = 0;
  for (let i = 0; i < PART_IDS.length; i++) {
    if (car.parts[PART_IDS[i]]) m |= (1 << i);
  }
  return m;
}

// Which panels are hanging half off. Recording only "present or gone" is why
// the reel never showed any damage: a dangling panel is still present, so the
// replay drew it perfectly bolted on in its home position, and then popped it
// out of existence when it finally let go. All the flapping — the single best
// thing in a crash — happened entirely off camera.
function dangleMask(car) {
  if (!car.danglers.length) return 0;
  let m = 0;
  for (let i = 0; i < PART_IDS.length; i++) {
    const o = car.parts[PART_IDS[i]];
    if (o && o.userData.part.dangling > 0) m |= (1 << i);
  }
  return m;
}

export function markHighlight(kind, car, score, label) { mark(kind, car, score, label); }

function mark(kind, car, score, label) {
  if (!armed || !ring.length || state.phase !== 'racing') return;
  // Do not stack two clips of the same moment.
  const now = state.raceTime;
  if (pending.some((c) => now - c.at < 1.2) || clips.some((c) => now - c.at < 1.0)) {
    const latest = pending[pending.length - 1] || clips[clips.length - 1];
    if (latest && score > latest.score) {
      latest.score = score;
      latest.kind = kind;
      latest.label = label;
      // Promoting a clip has to promote its *presentation* too. Upgrading only
      // the label was leaving wrecks with a chase shot and no slow motion,
      // which is the one thing this whole system exists to show.
      if (isWreck(kind) && !latest.wreck) {
        latest.wreck = true;
        latest.shot = 'showcase';
        latest.focus = cars.indexOf(car);
        if (latest.left != null) latest.left = Math.max(latest.left, POST_WRECK - (now - latest.at));
      }
    }
    return;
  }

  const frames = [];
  for (let k = 0; k < ringLen; k++) {
    const idx = (ringAt + k) % ringLen;
    frames.push(Float32Array.from(ring[idx]));
  }
  const wreck = isWreck(kind);
  pending.push({
    kind, label, score, at: now,
    focus: cars.indexOf(car),
    frames,
    stride: STRIDE,
    left: wreck ? POST_WRECK : POST,
    // A wreck gets the showcase shot: in close, slowed right down, orbiting the
    // car while it sheds panels. Everything else cuts around as before.
    shot: wreck ? 'showcase' : pick(['chase', 'trackside', 'low', 'orbit']),
    wreck,
    trigger: frames.length,
  });
}

export function harvestHighlights() {
  const all = clips.concat(pending.map((c) => ({ ...c })));
  all.sort((a, b) => b.score - a.score);
  const out = [];
  for (const c of all) {
    if (out.length >= 6) break;
    if (out.some((o) => Math.abs(o.at - c.at) < 2.6)) continue;
    out.push(c);
  }
  out.sort((a, b) => a.at - b.at);
  return out;
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------
let ghosts = [];
let play = null;
let stageMesh = null;          // a track built purely to replay a saved memory

export function playHighlights(list, onDone) {
  if (!list || !list.length) { onDone && onDone(); return false; }
  buildGhosts(state.cars.map((c) => ({ style: c.style, body: c.livery.body, trim: c.livery.trim })));
  for (const c of state.cars) c.mesh.visible = false;
  play = { list, i: 0, t: 0, onDone, clip: list[0], rate: 1, saved: false };
  state.camMode = 'replay';
  announce();
  return true;
}

function buildGhosts(specs) {
  disposeGhosts();
  for (const s of specs) {
    const g = buildCar({ style: s.style, body: s.body, trim: s.trim, partHp: 1 });
    scene.add(g);
    g.visible = false;
    ghosts.push({ mesh: g, parts: g.userData.parts, lastMask: -1, lastDangle: -1 });
  }
}

function disposeGhosts() {
  for (const g of ghosts) {
    if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
    g.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.__owned) o.material.dispose();
    });
  }
  ghosts = [];
}

function announce() {
  if (!play) return;
  emit('replay:clip', {
    clip: play.clip, index: play.i, total: play.list.length,
    canSave: !play.saved && (profile.memories || []).length < MAX_MEMORIES,
    saved: !!play.clip.savedAlready,
  });
}

export function stopPlayback() {
  if (play) {
    for (const c of state.cars) if (c.mesh) c.mesh.visible = !c.retired;
    play = null;
  }
  disposeGhosts();
  if (stageMesh) { disposeGroup(stageMesh); stageMesh = null; state.track = null; }
  if (state.camMode === 'replay') state.camMode = 'chase';
}

// ---------------------------------------------------------------------------
// Scrubbing between incidents, which is the first thing anybody wants when a
// reel shows them something good and then moves on.
// ---------------------------------------------------------------------------
export function stepClip(dir) {
  if (!play) return;
  const next = clamp(play.i + dir, 0, play.list.length - 1);
  if (next === play.i && dir > 0) { finish(); return; }
  play.i = next;
  play.clip = play.list[next];
  play.t = 0;
  for (const g of ghosts) { g.lastMask = -1; g.lastDangle = -1; }
  announce();
}

function finish() {
  const done = play ? play.onDone : null;
  stopPlayback();
  done && done();
}

// ---------------------------------------------------------------------------
// Memories — a clip kept on purpose
// ---------------------------------------------------------------------------
// Stored as base64 of the raw sample buffer plus just enough about the cars and
// the circuit to build the stage again. Small enough for localStorage, and it
// survives the race it came from being long gone.
export function saveCurrentClip() {
  if (!play || play.saved || play.clip.savedAlready) return false;
  const list = profile.memories || (profile.memories = []);
  if (list.length >= MAX_MEMORIES) list.shift();
  const clip = play.clip;
  const n = clip.frames.length;
  const per = clip.frames[0].length;
  const flat = new Float32Array(n * per);
  for (let i = 0; i < n; i++) flat.set(clip.frames[i], i * per);

  list.push({
    kind: clip.kind,
    label: clip.label,
    shot: clip.shot,
    wreck: !!clip.wreck,
    focus: clip.focus,
    trigger: clip.trigger,
    frames: n,
    stride: STRIDE,
    cars: state.cars.map((c) => ({ style: c.style, body: c.livery.body, trim: c.livery.trim })),
    track: state.track ? state.track.def.id : 'hometown',
    where: state.track ? state.track.def.name : '',
    at: Date.now(),
    data: b64encode(flat.buffer),
  });
  clip.savedAlready = true;
  saveProfile(true);
  announce();
  return true;
}

export function playSaved(mem, onDone) {
  if (!mem) { onDone && onDone(); return false; }
  stopPlayback();
  // Build the circuit purely as a stage. Nothing drives on it.
  const track = buildTrack(mem.track);
  state.track = track;
  setEnvironment(track.env);
  stageMesh = buildTrackMesh(track);
  scene.add(stageMesh);

  const buf = b64decode(mem.data);
  const flat = new Float32Array(buf);
  const per = mem.cars.length * (mem.stride || STRIDE);
  const frames = [];
  for (let i = 0; i < mem.frames; i++) frames.push(flat.subarray(i * per, (i + 1) * per));

  buildGhosts(mem.cars);
  const clip = {
    kind: mem.kind, label: mem.label, shot: mem.shot, wreck: mem.wreck,
    focus: mem.focus, trigger: mem.trigger, frames, at: 0, savedAlready: true,
    // A memory saved before the dangle/damage fields existed is 9 wide. Reading
    // it at the current stride would walk straight into the next car's data.
    stride: mem.stride || 9,
  };
  play = { list: [clip], i: 0, t: 0, onDone, clip, rate: 1, saved: true };
  state.screen = 'replay';
  state.camMode = 'replay';
  announce();
  return true;
}

function b64encode(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return btoa(s);
}

function b64decode(str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _look = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function updateHighlightPlayback(dt) {
  if (!play) return false;
  const clip = play.clip;
  const n = clip.frames.length;
  // Slow the moment of impact down; run the lead-in a touch quick.
  const triggerT = (clip.trigger / n);
  const phase = play.t / (n * DT);
  if (clip.wreck) {
    // Held down through the break-up, then eased back out. 0.22 over half the
    // clip made a wreck take eighteen seconds to watch — long enough that you
    // stopped seeing the crash and started waiting for it to end.
    play.rate = phase < triggerT - 0.04 ? 1.0
      : phase < triggerT + 0.38 ? 0.38
      : lerp(0.38, 0.9, clamp01((phase - triggerT - 0.38) / 0.25));
  } else {
    play.rate = phase > triggerT - 0.08 && phase < triggerT + 0.22 ? 0.45 : 1.0;
  }
  play.t += dt * play.rate;

  const fi = clamp(play.t / DT, 0, n - 1.001);
  const i0 = Math.floor(fi);
  const f = fi - i0;
  const a = clip.frames[i0];
  const b = clip.frames[Math.min(n - 1, i0 + 1)];

  const S = clip.stride || STRIDE;
  const rich = S >= 11;            // does this clip carry dangle + damage?
  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    const o = i * S;
    const vis = a[o + 7] > 0.5;
    g.mesh.visible = vis;
    if (!vis) continue;
    _p.set(lerp(a[o], b[o], f), lerp(a[o + 1], b[o + 1], f), lerp(a[o + 2], b[o + 2], f));
    _q.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]);
    _qb.set(b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
    _q.slerp(_qb, f);
    g.mesh.position.copy(_p);
    g.mesh.quaternion.copy(_q);

    const mask = a[o + 8];
    const dang = rich ? a[o + 9] : 0;
    const dmg = rich ? (a[o + 10] || 0) : 0;
    if (mask !== g.lastMask) {
      for (let k = 0; k < PART_IDS.length; k++) {
        const part = g.parts[PART_IDS[k]];
        if (!part) continue;
        const shown = (mask & (1 << k)) !== 0;
        if (part.visible && !shown) {
          // A panel leaving in slow motion deserves more than six sparks, and
          // it should leave from WHERE IT WAS, not from the middle of the car.
          part.getWorldPosition(_p2);
          fx.sparkBurst(_p2, _up, clip.wreck ? 26 : 10, 0xffc470, clip.wreck ? 13 : 7);
          if (clip.wreck) {
            fx.smokePuff(_p2, 3, 0xb8b0a2, 1.6, 1.4);
            // Something has to actually leave. The ring buffer never recorded
            // debris, so a replay wreck used to shed its panels into thin air.
            const tr = state.track;
            const floor = tr && tr.groundProbe ? tr.groundProbe(_p2, null) : _p2.y - 1;
            spawnScrap(_p2, 3, 0xb0b6bd, floor, 9);
          }
        }
        part.visible = shown;
      }
      g.lastMask = mask;
    }

    // Flap whatever was hanging off, and beat up whatever is left. The ghost
    // has the same meshes and the same hinge specs as a real car, so it can
    // run its own swing — it does not need to match the original frame for
    // frame, it needs to LOOK like a car with its bodywork coming off.
    poseGhost(g, dang, dmg, play.t);
  }

  // camera
  const fo = clamp(clip.focus, 0, ghosts.length - 1) * S;
  _look.set(lerp(a[fo], b[fo], f), lerp(a[fo + 1], b[fo + 1], f), lerp(a[fo + 2], b[fo + 2], f));
  aimReplayCamera(clip, _look, phase);

  if (play.t >= n * DT) {
    play.i++;
    if (play.i >= play.list.length) {
      const done = play.onDone;
      stopPlayback();
      done && done();
      return false;
    }
    play.clip = play.list[play.i];
    play.t = 0;
    for (const g of ghosts) { g.lastMask = -1; g.lastDangle = -1; }
    announce();
  }
  return true;
}

// Pose one ghost's bodywork: hanging panels swing, surviving panels carry a
// dent proportional to how beaten up the car was at that moment.
//
// The ghost is built fresh at full health, so without this a highlight showed a
// factory-clean car — even one that had lost eight panels earlier in the race.
const _gpose = { ax: 0, ay: 0, az: 0, s: 0, clampGround: true, dragY: 0 };
// Bursts per second per hanging panel during a replay. Generous: slow motion
// stretches a clip out, and a shower that reads well at 1x disappears at 0.38x.
const REPLAY_SPARK_RATE = 14;
function poseGhost(g, dangMask, dmg, t) {
  for (let k = 0; k < PART_IDS.length; k++) {
    const obj = g.parts[PART_IDS[k]];
    if (!obj || !obj.visible) continue;
    const p = obj.userData.part;
    if (!p || !p.home) continue;
    const hanging = (dangMask & (1 << k)) !== 0;

    if (hanging && p.flap) {
      if (!p.dangleSeed) p.dangleSeed = (k * 1.7) % 6.28;
      // Replay has no history, so drive `loose` off the clip clock: the panel
      // is visibly tearing further open across the shot.
      danglePose(obj, p, t * 6, 0.8, clamp01(t * 0.5), _gpose);
      // …and let it throw sparks. The live car sparks off its hinges, but none
      // of that is recorded, so the reel — the one place you are watching a
      // crash in slow motion with nothing else to look at — was showing silent
      // bodywork. Sparks are cheap and this is the shot they exist for.
      p.hingeAcc = (p.hingeAcc || 0) + REPLAY_SPARK_RATE * (1 / 60);
      let n = Math.floor(p.hingeAcc);
      if (n > 0) {
        p.hingeAcc -= n;
        n = fx.sparkAllow(Math.min(n, 2));
        for (let j = 0; j < n; j++) {
          obj.getWorldPosition(_p2);
          fx.sparkBurst(_p2, _up, 3 + (j & 1), 0xffc470, 9);
        }
      }
      continue;
    }
    if (p.wheel) continue;                 // a wheel does not dent, it comes off

    // Dents. Deterministic per part, so a panel does not jitter between frames.
    // The rotation is always written: a panel that was flapping a moment ago
    // would otherwise keep the quaternion `danglePose` left on it and sit at a
    // permanent angle after it had been re-seated.
    const d = dmg * 0.85;
    if (d < 0.02) { obj.position.copy(p.home); obj.rotation.set(0, 0, 0); continue; }
    obj.position.set(
      p.home.x + Math.sin(k * 7.7) * d * 0.09,
      p.home.y - d * 0.05,
      p.home.z + Math.cos(k * 5.3) * d * 0.07
    );
    obj.rotation.set(0, 0, Math.sin(k * 3.1) * d * 0.22);
  }
}

function aimReplayCamera(clip, target, phase) {
  const tr = state.track;
  const near = tr ? tr.nearestS(target, clip.hintS == null ? null : clip.hintS, 200) : null;
  if (near) clip.hintS = near.s;

  // The showcase: start wide enough to see who did it, then close in and walk
  // around the car while it comes apart. Slow motion does the rest.
  if (clip.shot === 'showcase') {
    const t = clamp01(phase);
    const a = clip.at * 0.7 + t * 3.1;
    const r = lerp(19, 7.5, clamp01((t - 0.15) / 0.55));
    const up = lerp(6.5, 2.6, clamp01((t - 0.2) / 0.5));
    _p.set(target.x + Math.cos(a) * r, target.y + up, target.z + Math.sin(a) * r);
    setCamera(_p, target);
    setFov(lerp(54, 38, t));
    return;
  }

  if (clip.shot === 'orbit' || !near) {
    const a = phase * 2.4 + clip.at;
    _p.set(target.x + Math.cos(a) * 15, target.y + 7, target.z + Math.sin(a) * 15);
    setCamera(_p, target);
    setFov(52);
    return;
  }
  if (clip.shot === 'chase') {
    tr.worldAt(near.s - 15, near.t * 0.6, 5.4, _p);
    setCamera(_p, target);
    setFov(58);
    return;
  }
  if (clip.shot === 'low') {
    tr.worldAt(near.s + 16, tr.widthAt(near.s) * 0.9, 0.9, _p);
    setCamera(_p, target);
    setFov(40);
    return;
  }
  // trackside
  const side = near.t >= 0 ? 1 : -1;
  tr.worldAt(near.s + 9, side * (tr.widthAt(near.s) + 9), 4.2, _p);
  setCamera(_p, target);
  setFov(44);
}

// Debug accessor: the reel is on screen for a few seconds and nothing else can
// see inside it, so a headless test can check the ghosts are actually posed.
export const __ghosts = () => ghosts;

export const isReplaying = () => !!play;
export const replayInfo = () => (play ? { clip: play.clip, index: play.i, total: play.list.length } : null);
