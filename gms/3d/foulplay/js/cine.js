// Cutscenes. Staged in-engine on a real circuit: letterbox, a camera that
// moves, cars parked or rolling where the script wants them, and dialogue.
// Nothing pre-rendered, so a cutscene costs a few kilobytes of script.

import * as THREE from 'three';
import { scene, setEnvironment, render, disposeGroup } from './render.js';
import { buildTrack } from './trackgen.js';
import { buildTrackMesh } from './trackmesh.js';
import { buildCar } from './carfactory.js';
import { setCamera, trackShot } from './camera.js';
import { setFov } from './render.js';
import { LIVERY } from './config.js';
import { state } from './state.js';
import { $, clamp, clamp01, lerp, smoothstep } from './utils.js';
import { sfx } from './audio.js';

let active = null;
let stageTrack = null;
let stageMesh = null;
let stageCars = [];
let el = {};

const _p = new THREE.Vector3();
const _l = new THREE.Vector3();

function ui() {
  if (el.root) return el;
  el = {
    root: $('cine'),
    line: $('cine-line'),
    who: $('cine-who'),
    text: $('cine-text'),
    caption: $('cine-caption'),
    skip: $('cine-skip'),
  };
  if (el.skip) el.skip.addEventListener('click', () => skipCine());
  return el;
}

export function cineActive() { return !!active; }

// ---------------------------------------------------------------------------
export function playCutscene(script, onDone) {
  ui();
  stopCine(false);

  // Stage: build the circuit the scene is set on, unless we are already on it.
  const trackId = script.track || 'hometown';
  stageTrack = buildTrack(trackId);
  setEnvironment(script.env || stageTrack.env);
  stageMesh = buildTrackMesh(stageTrack);
  scene.add(stageMesh);

  stageCars = [];
  for (const c of script.cars || []) {
    const mesh = buildCar({
      style: c.style || 'muscle',
      body: (c.livery != null ? LIVERY[c.livery % LIVERY.length] : LIVERY[0]).body,
      trim: (c.livery != null ? LIVERY[c.livery % LIVERY.length] : LIVERY[0]).trim,
      partHp: 1,
    });
    if (c.stripped) {
      for (const id of c.stripped) {
        const part = mesh.userData.parts[id];
        if (part) part.visible = false;
      }
    }
    scene.add(mesh);
    stageCars.push({ mesh, def: c, s: c.s || 0 });
  }

  active = { script, shot: 0, t: 0, onDone, total: script.shots.length };
  el.root.classList.remove('hidden');
  state.cine = true;
  applyShot(0);
  sfx('cine');
}

export function stopCine(fire = true) {
  if (stageMesh) { disposeGroup(stageMesh); stageMesh = null; }
  for (const c of stageCars) {
    if (c.mesh.parent) c.mesh.parent.remove(c.mesh);
    c.mesh.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.__owned) o.material.dispose();
    });
  }
  stageCars = [];
  stageTrack = null;
  if (el.root) el.root.classList.add('hidden');
  state.cine = false;
  const done = active && active.onDone;
  active = null;
  if (fire && done) done();
}

export function skipCine() {
  if (!active) return;
  stopCine(true);
}

// ---------------------------------------------------------------------------
function applyShot(i) {
  const sh = active.script.shots[i];
  if (!sh) return;
  const e = ui();
  if (sh.text) {
    e.line.classList.remove('hidden');
    e.who.textContent = sh.who || '';
    e.text.textContent = sh.text;
  } else {
    e.line.classList.add('hidden');
  }
  if (sh.caption) {
    e.caption.classList.remove('hidden');
    e.caption.textContent = sh.caption;
  } else {
    e.caption.classList.add('hidden');
  }
  // Park the cars for this beat.
  for (let k = 0; k < stageCars.length; k++) {
    const c = stageCars[k];
    const at = (sh.cars && sh.cars[k]) || c.def;
    c.s = at.s != null ? at.s : c.s;
    c.t = at.t != null ? at.t : (c.def.t || 0);
    c.speed = at.speed != null ? at.speed : (c.def.speed || 0);
    c.mesh.visible = at.hidden ? false : true;
  }
}

export function updateCine(dt) {
  if (!active) return;
  const sh = active.script.shots[active.shot];
  if (!sh) { stopCine(true); return; }
  active.t += dt;
  const k = clamp01(active.t / (sh.dur || 3));

  // rolling cars
  for (const c of stageCars) {
    if (c.speed) c.s += c.speed * dt;
    const q = stageTrack.quatAt(c.s, c.def.psi || 0);
    c.mesh.position.copy(stageTrack.worldAt(c.s, c.t || 0, 0.02));
    c.mesh.quaternion.copy(q);
  }

  // camera
  const cam = sh.cam || {};
  const s0 = cam.s != null ? cam.s : 0;
  const s1 = cam.s2 != null ? cam.s2 : s0;
  const across0 = cam.across != null ? cam.across : 16;
  const across1 = cam.across2 != null ? cam.across2 : across0;
  const above0 = cam.above != null ? cam.above : 5;
  const above1 = cam.above2 != null ? cam.above2 : above0;
  const ease = smoothstep(0, 1, k);

  if (cam.orbit) {
    const c = stageCars[cam.orbit.car || 0];
    const target = c ? c.mesh.position : stageTrack.worldAt(s0, 0, 1);
    const a = (cam.orbit.from || 0) + ease * (cam.orbit.sweep != null ? cam.orbit.sweep : 1.2);
    _p.set(
      target.x + Math.cos(a) * (cam.orbit.r || 14),
      target.y + (cam.orbit.h || 5),
      target.z + Math.sin(a) * (cam.orbit.r || 14)
    );
    _l.copy(target).add(new THREE.Vector3(0, cam.orbit.lookUp || 0.8, 0));
    setCamera(_p, _l);
    setFov(cam.fov || 44);
  } else if (cam.followCar != null) {
    const c = stageCars[cam.followCar];
    if (c) {
      const q = new THREE.Vector3();
      stageTrack.worldAt(c.s - (cam.behind || 12), (c.t || 0) + (cam.side || 0), cam.above || 4, q);
      setCamera(q, c.mesh.position);
      setFov(cam.fov || 46);
    }
  } else {
    const s = lerp(s0, s1, ease);
    const across = lerp(across0, across1, ease);
    const above = lerp(above0, above1, ease);
    stageTrack.worldAt(s, across, above, _p);
    const look = cam.lookCar != null && stageCars[cam.lookCar]
      ? stageCars[cam.lookCar].mesh.position
      : stageTrack.worldAt(s + (cam.look != null ? cam.look : 26), 0, 1.4, _l);
    setCamera(_p, look);
    setFov(cam.fov || 44);
  }

  if (active.t >= (sh.dur || 3)) {
    active.shot++;
    active.t = 0;
    if (active.shot >= active.script.shots.length) { stopCine(true); return; }
    applyShot(active.shot);
  }
}
