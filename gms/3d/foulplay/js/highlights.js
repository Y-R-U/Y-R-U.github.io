// The highlights reel. Everything on track is sampled into a ring buffer at
// 20Hz; when something worth watching happens we copy the last two seconds out
// of the ring and keep appending for another second and a half.
//
// Playback rebuilds fresh cars and drives them from the recording, so a clip
// can show a roof still attached that came off thirty seconds ago.

import * as THREE from 'three';
import { scene } from './render.js';
import { buildCar, PART_IDS } from './carfactory.js';
import { setCamera } from './camera.js';
import { setFov } from './render.js';
import { state } from './state.js';
import { profile } from './save.js';
import { on, emit } from './bus.js';
import * as fx from './particles.js';
import { clamp, clamp01, lerp, rand, pick, wrap } from './utils.js';

const HZ = 20;
const DT = 1 / HZ;
const PRE = 2.3;               // seconds of lead-in kept in the ring
const POST = 1.6;              // seconds recorded after the trigger
const STRIDE = 9;              // floats per car per sample
const MAX_CLIPS = 26;

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

export function markHighlight(kind, car, score, label) { mark(kind, car, score, label); }

function mark(kind, car, score, label) {
  if (!armed || !ring.length || state.phase !== 'racing') return;
  // Do not stack two clips of the same moment.
  const now = state.raceTime;
  if (pending.some((c) => now - c.at < 1.2) || clips.some((c) => now - c.at < 1.0)) {
    const latest = pending[pending.length - 1] || clips[clips.length - 1];
    if (latest && score > latest.score) { latest.score = score; latest.kind = kind; latest.label = label; }
    return;
  }

  const frames = [];
  for (let k = 0; k < ringLen; k++) {
    const idx = (ringAt + k) % ringLen;
    frames.push(Float32Array.from(ring[idx]));
  }
  pending.push({
    kind, label, score, at: now,
    focus: cars.indexOf(car),
    frames,
    left: POST,
    shot: pick(['chase', 'trackside', 'low', 'orbit']),
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

export function playHighlights(list, onDone) {
  if (!list || !list.length) { onDone && onDone(); return false; }
  buildGhosts();
  for (const c of state.cars) c.mesh.visible = false;
  play = { list, i: 0, t: 0, onDone, clip: list[0], rate: 1 };
  state.camMode = 'replay';
  emit('replay:clip', { clip: play.clip, index: 0, total: list.length });
  return true;
}

function buildGhosts() {
  disposeGhosts();
  for (const c of state.cars) {
    const g = buildCar({ style: c.style, body: c.livery.body, trim: c.livery.trim, partHp: 1 });
    scene.add(g);
    g.visible = false;
    ghosts.push({ mesh: g, parts: g.userData.parts, lastMask: -1 });
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

export function stopPlayback() {
  if (play) {
    for (const c of state.cars) if (c.mesh) c.mesh.visible = !c.retired;
    play = null;
  }
  disposeGhosts();
  if (state.camMode === 'replay') state.camMode = 'chase';
}

const _p = new THREE.Vector3();
const _p2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _look = new THREE.Vector3();

export function updateHighlightPlayback(dt) {
  if (!play) return false;
  const clip = play.clip;
  const n = clip.frames.length;
  // Slow the moment of impact down; run the lead-in a touch quick.
  const triggerT = (clip.trigger / n);
  const phase = play.t / (n * DT);
  play.rate = phase > triggerT - 0.08 && phase < triggerT + 0.22 ? 0.34 : 1.0;
  play.t += dt * play.rate;

  const fi = clamp(play.t / DT, 0, n - 1.001);
  const i0 = Math.floor(fi);
  const f = fi - i0;
  const a = clip.frames[i0];
  const b = clip.frames[Math.min(n - 1, i0 + 1)];

  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    const o = i * STRIDE;
    const vis = a[o + 7] > 0.5;
    g.mesh.visible = vis;
    if (!vis) continue;
    _p.set(lerp(a[o], b[o], f), lerp(a[o + 1], b[o + 1], f), lerp(a[o + 2], b[o + 2], f));
    _q.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]);
    const qb = new THREE.Quaternion(b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
    _q.slerp(qb, f);
    g.mesh.position.copy(_p);
    g.mesh.quaternion.copy(_q);

    const mask = a[o + 8];
    if (mask !== g.lastMask) {
      for (let k = 0; k < PART_IDS.length; k++) {
        const part = g.parts[PART_IDS[k]];
        if (!part) continue;
        const shown = (mask & (1 << k)) !== 0;
        if (part.visible && !shown) fx.sparkBurst(_p, new THREE.Vector3(0, 1, 0), 6, 0xffc470, 7);
        part.visible = shown;
      }
      g.lastMask = mask;
    }
  }

  // camera
  const fo = clamp(clip.focus, 0, ghosts.length - 1) * STRIDE;
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
    emit('replay:clip', { clip: play.clip, index: play.i, total: play.list.length });
  }
  return true;
}

function aimReplayCamera(clip, target, phase) {
  const tr = state.track;
  const near = tr ? tr.nearestS(target, clip.hintS == null ? null : clip.hintS, 200) : null;
  if (near) clip.hintS = near.s;

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

export const isReplaying = () => !!play;
export const replayInfo = () => (play ? { clip: play.clip, index: play.i, total: play.list.length } : null);
