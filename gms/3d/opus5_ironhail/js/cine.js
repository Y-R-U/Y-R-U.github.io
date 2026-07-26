// The cutscene director. A cutscene is a list of shots; each shot is a camera
// move plus optional dialogue and effects. Shots never hold absolute world
// coordinates, because every battlefield is generated — they hang off anchors
// ('player', 'boss', 'enemy', 'objective', 'field') that are resolved to real
// positions the moment the shot starts.
//
// The sim keeps running underneath unless a shot asks to freeze it, so a
// cutscene can play over the top of a real battle.

import * as THREE from 'three';
import { clamp01, lerp, rand } from './utils.js';
import { camera } from './render.js';
import { terrainHeight } from './terrain.js';
import { spawnExplosion, spawnSmoke, spawnDebris } from './particles.js';
import { AudioFX } from './audio.js';
import { state, addShake } from './state.js';
import { emit } from './bus.js';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _look = new THREE.Vector3();
const _lookGoal = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Anchors
// ---------------------------------------------------------------------------

// Resolve an anchor name to a world position. Everything falls back to the
// middle of the field so a script can never point the camera at undefined.
function anchorPos(name, out) {
  out.set(0, 0, 0);
  const p = state.player;
  switch (name) {
    case 'player':
      if (p) out.copy(p.pos);
      break;
    case 'boss':
      if (state.boss && state.boss.alive) out.copy(state.boss.pos);
      else return anchorPos('enemy', out);
      break;
    case 'enemy': {
      // the nearest living hostile, or the middle of the pack
      let best = null, bd = 1e9;
      for (const t of state.tanks) {
        if (!t.alive || t.isPlayer || (p && t.faction === p.faction)) continue;
        const d = p ? t.pos.distanceTo(p.pos) : t.pos.length();
        if (d < bd) { bd = d; best = t; }
      }
      if (best) out.copy(best.pos);
      break;
    }
    case 'far': {
      // the furthest living hostile — good for a "they are already here" reveal
      let best = null, bd = -1;
      for (const t of state.tanks) {
        if (!t.alive || t.isPlayer || (p && t.faction === p.faction)) continue;
        const d = p ? t.pos.distanceTo(p.pos) : t.pos.length();
        if (d > bd) { bd = d; best = t; }
      }
      if (best) out.copy(best.pos);
      break;
    }
    case 'objective':
      if (state.objectiveMark) out.copy(state.objectiveMark);
      else if (state.convoyGoal) out.set(state.convoyGoal.x, 0, state.convoyGoal.z);
      break;
    case 'drone':
      if (state.drone && state.drone.alive) out.copy(state.drone.pos);
      else if (p) out.copy(p.pos).y += 16;
      break;
    case 'field':
    default:
      break;
  }
  out.y = Math.max(out.y, terrainHeight(out.x, out.z));
  return out;
}

// A shot's offsets are in "camera-relative-to-the-field" space: +z is south,
// and the shot can ask to be rotated to sit behind whatever it is looking at.
function place(out, base, off, facing) {
  if (!off) { out.copy(base); return out; }
  const [dx, dy, dz] = off;
  if (facing != null) {
    const s = Math.sin(facing), c = Math.cos(facing);
    out.set(base.x + dx * c - dz * s, base.y + dy, base.z + dx * s + dz * c);
  } else {
    out.set(base.x + dx, base.y + dy, base.z + dz);
  }
  const gh = terrainHeight(out.x, out.z) + 1.2;
  if (out.y < gh) out.y = gh;
  return out;
}

// ---------------------------------------------------------------------------
// Playback
// ---------------------------------------------------------------------------

const cine = {
  active: false,
  shots: [],
  i: -1,
  t: 0,
  shot: null,
  from: new THREE.Vector3(),
  to: new THREE.Vector3(),
  lookFrom: new THREE.Vector3(),
  lookTo: new THREE.Vector3(),
  fovFrom: 62,
  fovTo: 62,
  onDone: null,
  freeze: false,
  fxDone: false,
  id: null,
};

export function cineActive() { return cine.active; }
export function cineFreezes() { return cine.active && cine.freeze; }

export function playCutscene(script, onDone) {
  if (!script || !script.shots || !script.shots.length) {
    if (onDone) onDone();
    return false;
  }
  cine.active = true;
  cine.shots = script.shots;
  cine.id = script.id || null;
  cine.i = -1;
  cine.onDone = onDone || null;
  cine.freeze = script.freeze !== false;
  state.cine = true;
  state.cineLine = null;
  emit('cine-start', script);
  nextShot();
  return true;
}

export function skipCutscene() {
  if (!cine.active) return;
  endCutscene();
}

// Tear-down without running the completion callback — for abandoning a battle
// mid-film, where "what happens next" is not what the script said.
export function cancelCutscene() {
  if (!cine.active) return;
  cine.onDone = null;
  endCutscene();
}

function endCutscene() {
  cine.active = false;
  cine.shots = [];
  cine.shot = null;
  state.cine = false;
  state.cineLine = null;
  state.timeScale = 1;
  emit('cine-end', cine.id);
  const cb = cine.onDone;
  cine.onDone = null;
  if (cb) cb();
}

function nextShot() {
  cine.i++;
  if (cine.i >= cine.shots.length) { endCutscene(); return; }
  const s = cine.shots[cine.i];
  cine.shot = s;
  cine.t = 0;
  cine.fxDone = false;

  // resolve the anchor once, at the top of the shot, so a moving subject does
  // not drag the camera path around mid-move
  const base = anchorPos(s.anchor || 'player', _a);
  const lookBase = s.lookAt ? anchorPos(s.lookAt, _b) : _b.copy(base);

  // "facing" lets a shot sit behind its subject whichever way the map spawned
  let facing = null;
  if (s.facing === 'player' && state.player) facing = state.player.yaw;
  else if (s.facing === 'inward') facing = Math.atan2(-base.x, -base.z);
  else if (typeof s.facing === 'number') facing = s.facing;

  place(cine.from, base, s.from, facing);
  place(cine.to, base, s.to || s.from, facing);
  place(cine.lookFrom, lookBase, s.lookOff || [0, 1.6, 0], facing);
  place(cine.lookTo, lookBase, s.lookOffTo || s.lookOff || [0, 1.6, 0], facing);
  cine.fovFrom = s.fov || 46;
  cine.fovTo = s.fovTo || cine.fovFrom;
  if (s.freeze != null) cine.freeze = s.freeze;
  if (s.slowmo) state.timeScale = s.slowmo;
  else if (!cine.freeze) state.timeScale = 1;

  state.cineLine = s.say
    ? { who: s.who || '', text: s.say.replace(/\{name\}/g, state.playerName || 'COMMANDER') }
    : null;
  if (s.say) emit('cine-line', state.cineLine);
  if (s.shake) addShake(s.shake);
  if (s.sound === 'boom') AudioFX.boom(true, 0.7);
  if (s.sound === 'horn') AudioFX.horn();
  if (s.sound === 'thunder') AudioFX.thunder();
  if (s.sound === 'lock') AudioFX.lock();
}

export function updateCine(rawDt) {
  if (!cine.active) return;
  const s = cine.shot;
  const dur = s.dur || 3;
  cine.t += rawDt;
  const k = clamp01(cine.t / dur);
  const e = ease(k, s.ease);

  camera.position.set(
    lerp(cine.from.x, cine.to.x, e),
    lerp(cine.from.y, cine.to.y, e),
    lerp(cine.from.z, cine.to.z, e));

  // orbit shots swing round the subject instead of dollying in a line
  if (s.orbit) {
    const a = lerp(s.orbit[0], s.orbit[1], e);
    const r = s.orbit[2] || 26;
    const h = s.orbit[3] || 9;
    const c = _a;
    anchorPos(s.anchor || 'player', c);
    camera.position.set(c.x + Math.sin(a) * r, c.y + h, c.z + Math.cos(a) * r);
    const gh = terrainHeight(camera.position.x, camera.position.z) + 1.6;
    if (camera.position.y < gh) camera.position.y = gh;
  }

  _lookGoal.set(
    lerp(cine.lookFrom.x, cine.lookTo.x, e),
    lerp(cine.lookFrom.y, cine.lookTo.y, e),
    lerp(cine.lookFrom.z, cine.lookTo.z, e));
  // a hair of smoothing so a hard cut still feels like a camera, not a teleport
  _look.lerp(_lookGoal, 1 - Math.pow(0.0008, rawDt));
  if (cine.t <= rawDt * 1.5) _look.copy(_lookGoal);
  camera.lookAt(_look);

  const wantFov = lerp(cine.fovFrom, cine.fovTo, e);
  if (Math.abs(camera.fov - wantFov) > 0.02) {
    camera.fov = wantFov;
    camera.updateProjectionMatrix();
  }

  // one-shot effects fire partway through so they land on a moving camera
  if (!cine.fxDone && k >= (s.fxAt != null ? s.fxAt : 0.5)) {
    cine.fxDone = true;
    fireShotFx(s);
  }

  if (k >= 1) nextShot();
}

function fireShotFx(s) {
  if (!s.fx) return;
  const at = anchorPos(s.fxAnchor || s.lookAt || s.anchor || 'player', _a);
  switch (s.fx) {
    case 'blast':
      spawnExplosion(_b.copy(at).setY(at.y + 1.4), { scale: 2.6, colour: 0xffa030 });
      addShake(0.5);
      break;
    case 'bigblast':
      for (let i = 0; i < 4; i++) {
        spawnExplosion(
          _b.set(at.x + rand(-7, 7), at.y + rand(1, 5), at.z + rand(-7, 7)),
          { scale: 3.4, colour: 0xffb040 });
      }
      spawnDebris(_b.copy(at).setY(at.y + 2), 16, 2.2);
      addShake(0.9);
      break;
    case 'smoke':
      for (let i = 0; i < 5; i++) {
        spawnSmoke(_b.set(at.x + rand(-5, 5), at.y + 1 + i * 1.6, at.z + rand(-5, 5)), {
          scale: 3.2, life: 3.4, colour: 0x6a6460, rise: 2.2, opacity: 0.5, grow: 2.4,
        });
      }
      break;
    default:
      break;
  }
}

function ease(k, kind) {
  switch (kind) {
    case 'linear': return k;
    case 'in': return k * k;
    case 'out': return 1 - Math.pow(1 - k, 2.4);
    case 'hard': return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    default: return k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // inout
  }
}

export function cineProgress() {
  if (!cine.active) return 0;
  return (cine.i + clamp01(cine.t / ((cine.shot && cine.shot.dur) || 3))) / cine.shots.length;
}
