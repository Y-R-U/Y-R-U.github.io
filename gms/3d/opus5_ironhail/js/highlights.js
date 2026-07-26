// The post-battle highlight reel.
//
// Nothing is recorded frame by frame — a battle is far too much state to keep,
// and none of it needs keeping. What gets written down is the *shape* of a
// moment: where the shell came from, where it landed, and which hull it took
// with it. The reel then re-stages that from the wreckage still standing on
// the field, which is why a clip can be assembled after the fight is over and
// still look like a replay:
//
//   * the victim is put back on its tracks (Tank.showAsLive) for the flight,
//   * a ghost tracer flies the recorded arc with the camera strapped to it,
//   * on contact the hull is knocked back over and the explosion goes again.
//
// It is a re-enactment, not a recording, and at two and a half seconds a clip
// nobody has ever been able to tell.

import * as THREE from 'three';

import { clamp, rand } from './utils.js';
import { GRAVITY, AUTO_MODE } from './config.js';
import { camera, actorRoot } from './render.js';
import { terrainHeight } from './terrain.js';
import {
  spawnExplosion, spawnDebris, spawnSparks, spawnSmoke, spawnChunks, volAt,
} from './particles.js';
import { playCutscene } from './cine.js';
import { AudioFX } from './audio.js';
import { profile } from './save.js';
import { state, addShake } from './state.js';
import { on } from './bus.js';

const MAX_CLIPS = 3;
const RIDE_MIN = 0.85;      // shortest replayed flight, seconds
const RIDE_MAX = 1.9;

const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _side = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

let clips = [];
let tracer = null;
let liveVictim = null;      // the wreck currently pretending to be alive
let lastFilmT = -99;        // when a story film last handed the camera back

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

export function resetHighlights() {
  restoreField();
  clips = [];
}

export function highlightCount() {
  return pickClips().length;
}

on('cine-end', (id) => { if (id !== 'reel') lastFilmT = state.time; });

on('tank-killed', ({ victim, attacker, fromPos }) => {
  if (!attacker || !attacker.isPlayer || victim.isPlayer) return;
  const at = victim.pos.clone();
  // Splash and mine kills have no arc worth replaying — `fromPos` is the blast
  // itself. Those still make the reel, just without the shell ride.
  const from = fromPos ? fromPos.clone() : at.clone();
  const range = from.distanceTo(at);
  clips.push({
    kind: 'kill', t: state.battleTime, at, from, victim,
    name: victim.name || 'CONTACT', range, boss: !!victim.boss,
    ride: range > 34,
    score: range + (victim.boss ? 600 : 0),
  });
});

on('prop-killed', ({ prop, byPlayer }) => {
  if (!byPlayer || !prop.explosive) return;
  const e = prop.explosive;
  clips.push({
    kind: 'blast', t: state.battleTime,
    at: new THREE.Vector3(prop.x, terrainHeight(prop.x, prop.z), prop.z),
    label: (prop.kind || 'scenery').replace(/_/g, ' ').toUpperCase(),
    radius: e.radius || 8, chunks: prop.chunks || 4,
    colour: prop.chunkColour || 0x8a8078, big: !!e.big,
    score: (e.radius || 8) * 6 + (prop.chunks || 0) * 9 + (e.big ? 140 : 0),
  });
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

// Best kills, and at most one demolition so the reel is not three fireballs in
// a row. Chronological once picked, because the reel should read as the story
// of the battle rather than a leaderboard.
function pickClips(max = MAX_CLIPS) {
  const usable = clips.filter(alive);
  const kills = usable.filter((c) => c.kind === 'kill').sort(byScore);
  const blasts = usable.filter((c) => c.kind === 'blast').sort(byScore);
  const room = blasts.length && max > 1 ? max - 1 : max;
  const picked = kills.slice(0, room);
  if (blasts.length && picked.length < max) picked.push(blasts[0]);
  return picked.sort((a, b) => a.t - b.t);
}

function byScore(a, b) { return b.score - a.score; }

// A wreck that has been disposed of (mission restarted, battle cleared) can no
// longer star in anything.
function alive(c) {
  if (c.kind !== 'kill') return true;
  return !!(c.victim && c.victim.grp && c.victim.grp.parent);
}

// ---------------------------------------------------------------------------
// The reel
// ---------------------------------------------------------------------------

export function playHighlights(onDone) {
  if (AUTO_MODE || profile.settings.highlights === false) return false;
  // Straight off the back of a victory film — the finale runs half a minute —
  // the reel drops its title card and shows one moment. Two long stretches of
  // camera with nothing to do is one too many.
  const brief = state.time - lastFilmT < 6;
  const picked = pickClips(brief ? 1 : MAX_CLIPS);
  if (!picked.length) return false;
  const script = buildReel(picked, brief);
  return playCutscene(script, () => { restoreField(); if (onDone) onDone(); });
}

function buildReel(picked, brief = false) {
  const shots = brief ? [] : [{
    anchor: 'player',
    from: [-30, 24, 30], to: [-19, 16, 19],
    lookAt: 'player', lookOff: [0, 2, 0],
    dur: 1.5, ease: 'out', fov: 58,
    who: 'ACTION REPLAY',
    say: picked.length === 1 ? 'ONE FOR THE BOARD' : picked.length + ' FROM THAT ONE',
    onStart: restoreField,
  }];
  picked.forEach((c, i) => {
    const tag = picked.length === 1
      ? 'ACTION REPLAY'
      : 'REPLAY ' + (i + 1) + '/' + picked.length;
    if (c.kind === 'kill') shots.push(...killClip(c, tag, i));
    else shots.push(blastClip(c, tag));
  });
  return { id: 'reel', freeze: false, shots };
}

// Two shots: ride the shell in, then swing round what is left of them.
function killClip(c, tag, i) {
  const bearing = Math.atan2(c.from.x - c.at.x, c.from.z - c.at.z);
  const caption = c.name + ' · ' + Math.round(c.range) + 'm' +
    (c.boss ? ' · COMMAND HULL' : '');
  const out = [];

  if (c.ride) {
    c.tof = clamp(c.range / 110, RIDE_MIN, RIDE_MAX);
    c.side = i % 2 === 0 ? 1 : -1;      // alternate sides so three clips do not rhyme
    out.push({
      anchor: c.from, lookAt: c.at,
      dur: c.tof, ease: 'linear', fov: 54,
      who: tag, say: caption,
      onStart: () => beginRide(c),
      onTick: (e, dt) => rideTracer(c, e, dt),
    });
  }

  out.push({
    anchor: c.at,
    // wide enough that the fireball is an event in the frame rather than the
    // whole of it — at 16m the blast simply fills the lens
    orbit: [bearing - 0.55, bearing + 0.75, 21 + (c.boss ? 9 : 0), 8.5],
    lookOff: [0, 1.6, 0],
    dur: c.ride ? 1.5 : 2.1, ease: 'out', fov: 46, slowmo: 0.55,
    fxAt: c.ride ? 0.02 : 0.34,
    who: c.ride ? null : tag,
    say: c.ride ? null : caption,
    onStart: c.ride ? null : restoreField,
    fxFn: () => brewUp(c),
  });
  return out;
}

function blastClip(c, tag) {
  const bearing = rand(0, Math.PI * 2);
  return {
    anchor: c.at,
    orbit: [bearing, bearing + 1.3, 19 + c.radius * 0.5, 7.5],
    lookOff: [0, 2.4, 0],
    dur: 2.1, ease: 'out', fov: 52, slowmo: 0.6, fxAt: 0.3,
    who: tag, say: c.label + ' · DEMOLISHED',
    onStart: restoreField,
    fxFn: () => replayBlast(c),
  };
}

// ---------------------------------------------------------------------------
// Staging
// ---------------------------------------------------------------------------

function ensureTracer() {
  if (tracer) return tracer;
  tracer = new THREE.Mesh(
    new THREE.BoxGeometry(0.24, 0.24, 1.9),
    // over 1 so the bloom pass catches it, same trick the real bolts use
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffb060).multiplyScalar(2.4), fog: false,
    }));
  tracer.frustumCulled = false;
  tracer.visible = false;
  actorRoot.add(tracer);
  return tracer;
}

function beginRide(c) {
  restoreField();
  const t = ensureTracer();
  t.visible = true;
  t.position.copy(c.from);
  c.trailT = 0;
  if (c.victim && c.victim.showAsLive) {
    c.victim.showAsLive(true);
    liveVictim = c.victim;
  }
  AudioFX.gun('direct', 0.5);
}

// The recorded arc, re-flown. Only the endpoints and a plausible time of
// flight were kept, so the shape is rebuilt from gravity rather than replayed.
function rideTracer(c, e, dt) {
  const t = tracer;
  if (!t) return;
  const tof = c.tof;
  const time = e * tof;
  const vy = (c.at.y - c.from.y + 0.5 * GRAVITY * tof * tof) / tof;
  t.position.set(
    c.from.x + (c.at.x - c.from.x) * e,
    c.from.y + vy * time - 0.5 * GRAVITY * time * time,
    c.from.z + (c.at.z - c.from.z) * e);

  _dir.set((c.at.x - c.from.x) / tof, vy - GRAVITY * time, (c.at.z - c.from.z) / tof).normalize();
  t.lookAt(_v.copy(t.position).add(_dir));

  c.trailT -= dt || 0.016;
  if (c.trailT <= 0) {
    c.trailT = 0.05;
    spawnSmoke(t.position, {
      scale: 0.4, life: 0.9, colour: 0xa39c96, rise: 0.5, drift: 0.2,
      opacity: 0.32, grow: 2.6,
    });
  }

  // chase camera, strapped behind and to one side of the round
  _side.crossVectors(_dir, UP).normalize().multiplyScalar(3.4 * c.side);
  camera.position.set(
    t.position.x - _dir.x * 11 + _side.x,
    t.position.y - _dir.y * 4.4 + 2.4,
    t.position.z - _dir.z * 11 + _side.z);
  const gh = terrainHeight(camera.position.x, camera.position.z) + 1.5;
  if (camera.position.y < gh) camera.position.y = gh;
  // look past the round rather than at it — the shell is not the point of the
  // clip, the hull it is about to reach is, and a camera staring at the tracer
  // spends the whole flight with the target hidden behind it
  camera.lookAt(_v.copy(t.position).lerp(c.at, 0.4));
}

function brewUp(c) {
  if (tracer) tracer.visible = false;
  if (c.victim && c.victim.showAsLive) c.victim.showAsLive(false);
  liveVictim = null;
  _v.copy(c.at).setY(c.at.y + 1.2);
  spawnExplosion(_v, { scale: c.boss ? 2.6 : 1.8, colour: 0xffa843 });
  spawnDebris(_v, c.boss ? 20 : 12, 1.5);
  spawnSparks(_v, 12, null, 1.4);
  addShake(c.boss ? 0.8 : 0.55);
  AudioFX.boom(true, volAt(_v) * 0.9);
}

function replayBlast(c) {
  _v.copy(c.at).setY(c.at.y + 1.6);
  spawnExplosion(_v, { scale: 1.6 + c.radius * 0.12, colour: c.big ? 0xffc250 : 0xffa030 });
  if (c.big) {
    for (let i = 0; i < 3; i++) {
      spawnExplosion(
        _v.set(c.at.x + rand(-5, 5), c.at.y + rand(1.5, 5), c.at.z + rand(-5, 5)),
        { scale: 2.6, colour: 0xffb040 });
    }
  }
  spawnChunks(_v.copy(c.at).setY(c.at.y + 1.4), c.chunks, {
    colour: c.colour, scale: 1.1, spread: 1.3, up: 1.2,
  });
  spawnDebris(_v, 14, 2);
  addShake(0.75);
  AudioFX.boom(true, volAt(c.at));
}

// Put the field back the way the battle left it: no tracer, no hull pretending
// it survived. Called between clips, when the reel ends and on teardown, so a
// skip can never strand a wreck looking freshly painted.
function restoreField() {
  if (tracer) tracer.visible = false;
  if (liveVictim && liveVictim.showAsLive) liveVictim.showAsLive(false);
  liveVictim = null;
}
