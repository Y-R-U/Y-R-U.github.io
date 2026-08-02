// The broadcast camera. Chase by default, but it follows the road's own up
// vector rather than world up — which is the only reason a loop reads as a
// loop instead of the picture turning upside down and staying there.

import * as THREE from 'three';
import { camera, setFov, baseFov } from './render.js';
import { CAM, DRIVE, SHOT_MODE } from './config.js';
import { state } from './state.js';
import { profile } from './save.js';
import { clamp, clamp01, damp, lerp, rand } from './utils.js';

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _road = new THREE.Vector3();

const rig = {
  pos: new THREE.Vector3(),
  look: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
  fov: 68,
  ready: false,
  zoom: 1,
  orbit: 0,
};

// ---------------------------------------------------------------------------
// Chase framing. The reference is a bonnet-height broadcast shot: close enough
// that you can read panels and wheels, low enough that the car has a horizon
// behind it instead of a carpet of tarmac.
//
// Everything below is smoothed in CAR-RELATIVE space, never in world space.
// A world-space lerp toward a target that is itself moving at v settles at a
// standing error of v/rate — at 250 km/h that was dragging the camera an extra
// ten metres back and shrinking the car to a dot. Smoothing the *offsets* and
// the *basis* instead gives the same softness with zero distance drift.
// ---------------------------------------------------------------------------
const WIDE = {
  // The speed terms are deliberately small. Distance and field of view both
  // shrink the car, and stacking a generous version of each put it back to the
  // dot in the distance at exactly the moment the shot should be at its most
  // dramatic. Enough to feel, not enough to undo the framing.
  dist: 4.2,          // metres behind the car at a standstill
  distSpeed: 1.5,     // ...plus this much at top speed
  distBoost: 1.1,     // ...plus this while boosting
  distMin: 4.1,       // never closer: the body is 5m long, so this still
                      // leaves ~1.6m of air behind the bumper
  clearUp: 1.25,      // ...and never lower than this over the car's own origin

  // Bonnet height, not helicopter height. Every centimetre up here adds a
  // wedge of empty tarmac between the lens and the car, which is exactly what
  // made the old shot look like a table with a toy on it.
  height: 1.7,
  heightSpeed: 0.55,
  heightAir: 0.3,     // stay above the car when it is off the ground

  // Somebody else's boot filling the bottom third is the one thing that ruins
  // a close chase camera, and at this range a car tucked up behind you is
  // literally inside the lens. Rise and back off just enough to shoot over it.
  // Tuned deliberately shy. In a pack there is nearly always somebody within
  // a few metres, and a guard that fires on all of them just rebuilds the
  // high, distant camera this whole pass exists to get rid of.
  lens: 4.6,          // only look this far for offenders
  lensPerp: 1.8,      // ...this close to the sightline counts as blocking
  lensNear: 2.3,      // ...or this close to the lens at any angle
  lensBody: 2.0,      // half a car length, near end vs centre
  lensLift: 1.3,
  lensBack: 0.8,
  // Stepping sideways to see past somebody beats climbing over them: parallax
  // moves the near car out of the shot far faster than height does, and it
  // costs none of the low framing.
  lensSide: 2.6,
  lensAim: 0.8,       // the aim point rises with the rig, or the frame pitches
                      // down into the tarmac every time somebody drafts you

  // The aim point is deliberately low and near: pitching the lens down is what
  // lifts the car off the bottom edge and drops the horizon to a third of the
  // way up, which is the whole difference between the reference shots and a
  // level view down an empty road.
  look: 5.2,
  lookSpeed: 2.2,
  lookUp: 0.55,

  side: 1.1,          // off-centre, so the shot is a rear three-quarter
  sideShot: 1.6,      // ?shot=1 leans further off-axis for a promo frame
  sideCorner: 0.7,    // and the rig drifts to the outside of a bend, which is
                      // where a broadcast camera would be to see the apex
  minGround: 1.45,    // hard floor above the road surface behind the car
  edge: 1.5,          // keep this far inside the barriers

  // render.js floors the vertical FOV at 62°, so there is no long lens to be
  // had here — the car has to be made bigger by moving in, and the trim only
  // needs to leave headroom for the speed term to be visible at all.
  fovTrim: -8,
  fovSpeed: 9,
  fovBoost: 5,
  fovShot: -1,

  tanLag: 7,          // how fast the rig's forward axis catches the road's
  upLag: 9.5,         // ...and its up axis. Must outrun a loop, see below.
  offLag: 3.6,        // distance/height/lens breathing
  sideLag: 6,
  latSpring: 7,       // lateral give — the car leads the camera through a kink
  vertSpring: 5.5,
  latGain: 0.6, latMax: 1.7,
  vertGain: 0.45, vertMin: -0.6, vertMax: 1.8,
  lensLag: 9, lensFall: 2.4,

  bank: 0.085,        // radians of roll per rad/s the road turns under you
  bankMax: 0.14,
  turnLag: 5,

  shakeDecay: 6.4,    // a hit is a punch, not a wobble
  shakeGain: 1.25,
  shakeMax: 1.5,
  shakeAmp: 0.5,
  shakeFreq: 38,
  shakeFov: 3.2,
};

// ---------------------------------------------------------------------------
// Portrait is a different shot, and the numbers above are not it. Held upright
// the frame is a third as wide and nearly twice as tall, so the same 4.2m at
// bonnet height puts the player's own bodywork across the bottom half of the
// screen and leaves a corridor of road you could measure in pixels. Back off,
// climb, and lift the aim point — the last one is what does most of the work,
// because raising where the lens points drops the car down the frame without
// shrinking it any further.
//
// Only the chase rig reads this. SHOT_MODE, landscape, and the replay, attract
// and wreck cameras all keep the close one — that is where the beauty shots are.
// ---------------------------------------------------------------------------
const TALL = {
  dist: 7.4,
  distSpeed: 1.6,
  distMin: 7.0,
  clearUp: 2.4,
  height: 3.0,
  heightSpeed: 0.5,
  look: 8.5,
  lookUp: 3.5,
  side: 0.85,
  minGround: 2.1,
  // render.js already opens the portrait lens 12° and setFov will not go more
  // than 6° under that, so this mostly buys back the speed and boost terms:
  // the shot sits at the floor until you are near the top of the gearing.
  fovTrim: -14,
  lensLift: 1.0,
  lensSide: 2.2,
};

const CHASE = Object.assign({}, WIDE);

function fitChase() {
  const tall = !SHOT_MODE && window.innerHeight > window.innerWidth;
  Object.assign(CHASE, WIDE, tall ? TALL : null);
}
fitChase();
window.addEventListener('resize', fitChase, { passive: true });
window.addEventListener('orientationchange', fitChase, { passive: true });

// The rig's own basis, trailing the road frame. Positioning the camera off
// THESE rather than off the live frame is what makes corners feel sprung, and
// tying it to the road's up (not world up) is what keeps loops upright.
const camTan = new THREE.Vector3(0, 0, 1);
const camUp = new THREE.Vector3(0, 1, 0);
const camRight = new THREE.Vector3(1, 0, 0);
const _prevTan = new THREE.Vector3(0, 0, 1);

const chase = { back: 8, up: 2, side: 0, look: 8, turn: 0, tLag: 0, hLag: 0, lens: 0, push: 0 };
const shk = { amp: 0, prev: 0, t: 0, ph1: 0, ph2: 0, fov: 0 };

export function resetCamera(car) {
  rig.ready = false;
  if (car) frameChase(car, 0, true);
}

// ---------------------------------------------------------------------------
export function updateCamera(dt) {
  const car = state.player;
  if (state.camMode === 'cine' || state.camMode === 'replay') return;   // owned elsewhere
  if (state.camMode === 'attract') { frameAttract(dt); return; }

  if (!car) return;
  if (car.mode === 'wreck' || car.respawnTimer > 0) frameWreck(car, dt);
  else frameChase(car, dt, false);

  applyShake(dt);
  camera.up.copy(rig.up);
  camera.position.copy(rig.pos);
  camera.lookAt(rig.look);
  setFov(rig.fov + shk.fov);
}

export function frameChase(car, dt, snap) {
  const tr = car.track;
  const f = car.frame.p ? car.frame : tr.frameAt(car.s);
  const top = DRIVE.topSpeed + (car.stats ? car.stats.top : 0);
  const speedFrac = clamp01(car.forwardSpeed / (top || 1));
  const boost = car.boosting ? 1 : 0;
  const first = !rig.ready || snap;
  const z = rig.zoom;

  // dir = +1 normally: sit BEHIND the car (-tan) and look AHEAD of it (+tan).
  // Getting this backwards puts the camera in front looking down the road you
  // have already driven, which reads as "I can only see where I've been".
  const dir = state.lookBack ? -1 : 1;

  // How fast the road frame is rotating under the car, signed toward +right.
  // Read off the frame itself rather than the car's heading, so a spinning or
  // sideways car banks the shot no more than a tidy one does.
  let turnRate = 0;
  if (!first && dt > 1e-4) turnRate = clamp(-_prevTan.dot(f.right) / dt, -2.5, 2.5);
  _prevTan.copy(f.tan);

  // --- the trailing basis -------------------------------------------------
  if (first) {
    camTan.copy(f.tan); camUp.copy(f.up); camRight.copy(f.right);
    chase.turn = 0; chase.tLag = car.t; chase.hLag = car.h;
  } else {
    camTan.lerp(f.tan, damp(CHASE.tanLag, dt)).normalize();
    camUp.lerp(f.up, damp(CHASE.upLag, dt));
    camRight.lerp(f.right, damp(CHASE.upLag, dt));
    // Re-orthonormalise, keeping the road frame's handedness. Cheap, and the
    // only thing standing between a loop and a rig that slowly shears itself
    // inside out on the way round.
    camUp.addScaledVector(camTan, -camUp.dot(camTan)).normalize();
    camRight.addScaledVector(camTan, -camRight.dot(camTan))
            .addScaledVector(camUp, -camRight.dot(camUp)).normalize();
    // If the rig ever comes back to a frame pointing the opposite way — a car
    // that went round a loop while the wreck camera had the shot — the lerp
    // passes through zero and the basis collapses. Resync rather than fly on
    // with a degenerate one.
    if (camUp.lengthSq() < 0.5 || camRight.lengthSq() < 0.5 || camTan.lengthSq() < 0.5) {
      camTan.copy(f.tan); camUp.copy(f.up); camRight.copy(f.right);
    }
    chase.turn = lerp(chase.turn, turnRate, damp(CHASE.turnLag, dt));
    chase.tLag = lerp(chase.tLag, car.t, damp(CHASE.latSpring, dt));
    chase.hLag = lerp(chase.hLag, car.h, damp(CHASE.vertSpring, dt));
  }

  // --- where the rig wants to sit, in car-relative metres -----------------
  let backT = (CHASE.dist + speedFrac * CHASE.distSpeed + boost * CHASE.distBoost) * z;
  backT = Math.max(CHASE.distMin, backT);
  const upT = (CHASE.height + speedFrac * CHASE.heightSpeed) * z + car.h * CHASE.heightAir;
  const lookT = CHASE.look + speedFrac * CHASE.lookSpeed;

  // Off-centre for the three-quarter framing, but never far enough out to put
  // the lens inside a barrier when the car is already scraping one.
  let sideT = (SHOT_MODE ? CHASE.sideShot : CHASE.side) * dir
            - clamp(chase.turn / 1.2, -1, 1) * CHASE.sideCorner;
  const w = tr.widthAt ? tr.widthAt(car.s) : 11;
  const lim = Math.max(0.6, w - CHASE.edge);
  sideT = clamp(car.t + sideT, -lim, lim) - car.t;

  const or = first ? 1 : damp(CHASE.offLag, dt);
  chase.back = first ? backT : lerp(chase.back, backT, or);
  chase.up   = first ? upT   : lerp(chase.up, upT, or);
  chase.look = first ? lookT : lerp(chase.look, lookT, or);
  chase.side = first ? sideT : lerp(chase.side, sideT, damp(CHASE.sideLag, dt));

  // Springs: the car leads the camera sideways through a kink and jumps up in
  // frame over a crest. Both are clamped, so neither can walk the rig into
  // the scenery however violently the car is thrown about.
  const lat = clamp((chase.tLag - car.t) * CHASE.latGain, -CHASE.latMax, CHASE.latMax);
  const vert = clamp((chase.hLag - car.h) * CHASE.vertGain, CHASE.vertMin, CHASE.vertMax);

  _pos.copy(car.worldPos)
    .addScaledVector(camTan, -chase.back * dir)
    .addScaledVector(camUp, chase.up + vert)
    .addScaledVector(camRight, chase.side + lat);

  _look.copy(car.worldPos)
    .addScaledVector(camTan, chase.look * dir)
    .addScaledVector(camUp, CHASE.lookUp);

  // --- keep other cars out of the lens ------------------------------------
  // Two different sins, and only these two. A rival ALONGSIDE the frame is the
  // shot — it is half of what makes the reference look like a race. What ruins
  // it is somebody sitting between the lens and the car, or close enough to
  // the lens to be a slab of paint across the near plane.
  const cars = state.cars;
  _v2.subVectors(car.worldPos, _pos);
  const pd = _v2.length() || 1;
  _v2.multiplyScalar(1 / pd);
  let crowd = 0, blockSide = 0;
  for (let i = 0; i < cars.length; i++) {
    const o = cars[i];
    if (o === car || !o.worldPos) continue;
    const dx = o.worldPos.x - _pos.x, dy = o.worldPos.y - _pos.y, dz = o.worldPos.z - _pos.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > CHASE.lens * CHASE.lens) continue;
    let k = 0;
    const along = dx * _v2.x + dy * _v2.y + dz * _v2.z;
    if (along > 0 && along < pd && d2 - along * along < CHASE.lensPerp * CHASE.lensPerp) {
      // Measure to the offender's near END, not its centre. A car is five
      // metres long, and the half of it that matters is the half pointing at
      // the lens — testing the origin says "four metres away, fine" about a
      // bonnet that is already through the near plane.
      k = 1 - Math.max(0, along - CHASE.lensBody) / pd;
    }
    const near = Math.sqrt(d2);
    if (near < CHASE.lensNear) k = Math.max(k, (1 - near / CHASE.lensNear) * 0.6);
    if (k > crowd) {
      crowd = k;
      blockSide = dx * camRight.x + dy * camRight.y + dz * camRight.z;
    }
  }
  // Rise quickly, settle slowly: stepping out from behind somebody is
  // invisible, snapping back the instant they twitch out of range is not.
  chase.lens = first ? crowd
    : lerp(chase.lens, crowd, damp(crowd > chase.lens ? CHASE.lensLag : CHASE.lensFall, dt));
  // Peel away from whichever side the offender is on, so it slides out of
  // frame rather than the camera climbing over it.
  // Hysteresis: a blocker wandering across the sightline would otherwise flip
  // the chosen side and throw the rig the width of the road in a heartbeat.
  let sgn = blockSide >= 0 ? 1 : -1;
  if (Math.abs(blockSide) < 0.9 && chase.push !== 0) sgn = chase.push > 0 ? -1 : 1;
  const pushT = -sgn * CHASE.lensSide * crowd;
  chase.push = first ? pushT
    : lerp(chase.push, pushT, damp(Math.abs(pushT) > Math.abs(chase.push) ? CHASE.lensLag : CHASE.lensFall, dt));
  let room = 0;
  if (chase.lens > 0.001 || Math.abs(chase.push) > 0.001) {
    // The sideways step still has to respect the barriers.
    room = clamp(car.t + chase.side + lat + chase.push, -lim, lim)
         - (car.t + chase.side + lat);
    _pos.addScaledVector(camUp, chase.lens * CHASE.lensLift)
        .addScaledVector(camTan, -chase.lens * CHASE.lensBack * dir)
        .addScaledVector(camRight, room);
    _look.addScaledVector(camUp, chase.lens * CHASE.lensLift * CHASE.lensAim);
  }

  // --- never inside the car we are filming --------------------------------
  _v.subVectors(_pos, car.worldPos);
  const behind = -_v.dot(camTan) * dir;
  if (behind < CHASE.distMin) _pos.addScaledVector(camTan, -(CHASE.distMin - behind) * dir);
  const above = _v.dot(camUp);
  if (above < CHASE.clearUp) _pos.addScaledVector(camUp, CHASE.clearUp - above);

  // --- keep the lens out of the road --------------------------------------
  // Sample the surface under where the camera is sitting rather than under the
  // car. On a compression the road behind you is higher than the tangent line
  // the rig is strung along, and that is the one place a low chase camera
  // drives itself through the tarmac. Inside a loop the surface curls the
  // other way, so this costs nothing there.
  tr.worldAt(car.s - chase.back * dir, clamp(car.t + chase.side + lat + room, -w, w), 0, _road);
  const gap = _v.subVectors(_pos, _road).dot(camUp);
  if (gap < CHASE.minGround) _pos.addScaledVector(camUp, CHASE.minGround - gap);

  rig.pos.copy(_pos);
  rig.look.copy(_look);

  // Blend the road's up with world up so gentle banking does not roll the
  // whole picture, but a loop still carries the camera over with it. The blend
  // fades out as the road tips past vertical instead of switching at a
  // threshold, which is what used to make the entry to a loop snap.
  const lean = clamp01((camUp.y - 0.05) / 0.4);
  _up.copy(camUp);
  if (lean > 0) _up.lerp(UP_WORLD, lean * (1 - CAM.bankLean));
  _up.addScaledVector(camRight, clamp(chase.turn * CHASE.bank, -CHASE.bankMax, CHASE.bankMax));
  rig.up.copy(_up).normalize();

  const fovT = baseFov() + CHASE.fovTrim + (SHOT_MODE ? CHASE.fovShot : 0)
             + speedFrac * CHASE.fovSpeed + boost * CHASE.fovBoost;
  rig.fov = first ? fovT : lerp(rig.fov, fovT, damp(4, dt || 0.016));
  rig.ready = true;
}

const UP_WORLD = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------------------
// The menu backdrop camera. Cuts between four shots on a timer, always pointed
// at whatever is happening near the front of the field, so a menu you leave
// open turns into a broadcast rather than a screensaver.
// ---------------------------------------------------------------------------
const attract = { t: 0, shot: 0, subject: 0, hold: 0 };

function frameAttract(dt) {
  const cars = state.cars;
  const tr = state.track;
  if (!cars.length || !tr) return;

  attract.t += dt;
  if (attract.t > attract.hold) {
    attract.t = 0;
    attract.hold = rand(4.2, 7.5);
    attract.shot = (attract.shot + 1 + Math.floor(Math.random() * 3)) % 4;
    // Prefer somebody in a fight: the tightest gap in the top half of the field.
    const front = state.order.filter((c) => c.alive && c.mode !== 'wreck').slice(0, Math.max(2, Math.ceil(cars.length / 2)));
    attract.subject = cars.indexOf(front[Math.floor(Math.random() * front.length)] || cars[0]);
    rig.ready = false;
  }

  const car = cars[clamp(attract.subject, 0, cars.length - 1)] || cars[0];
  if (!car) return;
  const f = car.frame.p ? car.frame : tr.frameAt(car.s);
  const w = tr.widthAt(car.s);

  if (attract.shot === 0) {                       // low chase, wide
    _pos.copy(car.worldPos).addScaledVector(f.tan, -11).addScaledVector(f.up, 2.4);
    _look.copy(car.worldPos).addScaledVector(f.tan, 10).addScaledVector(f.up, 1);
    rig.fov = baseFov() + 6;
  } else if (attract.shot === 1) {                // trackside pan
    const side = car.t >= 0 ? 1 : -1;
    tr.worldAt(car.s + 22, side * (w + 12), 4.5, _pos);
    _look.copy(car.worldPos);
    rig.fov = 40;
  } else if (attract.shot === 2) {                // helicopter
    tr.worldAt(car.s + 34, 0, 26, _pos);
    _look.copy(car.worldPos);
    rig.fov = 52;
  } else {                                        // wheel-height, looking back
    tr.worldAt(car.s + 30, car.t * 0.7, 0.8, _pos);
    _look.copy(car.worldPos);
    rig.fov = 36;
  }

  const rate = rig.ready ? damp(3.2, dt) : 1;
  if (!rig.ready) { rig.pos.copy(_pos); rig.look.copy(_look); rig.ready = true; }
  else { rig.pos.lerp(_pos, rate); rig.look.lerp(_look, damp(5, dt)); }
  rig.up.lerp(UP_WORLD, damp(4, dt)).normalize();

  camera.up.copy(rig.up);
  camera.position.copy(rig.pos);
  camera.lookAt(rig.look);
  setFov(rig.fov);
}

function frameWreck(car, dt) {
  rig.orbit += dt * 0.75;
  const r = CAM.wreckDist;
  _pos.copy(car.worldPos).add(_v.set(Math.cos(rig.orbit) * r, CAM.wreckHeight, Math.sin(rig.orbit) * r));
  _look.copy(car.worldPos);
  rig.pos.lerp(_pos, damp(3.4, dt));
  rig.look.lerp(_look, damp(6, dt));
  rig.up.lerp(UP_WORLD, damp(4, dt)).normalize();
  rig.fov = lerp(rig.fov, baseFov() - 4, damp(3, dt));
}

// A hit should land like a hit: all of the amplitude on the first two frames,
// gone in a third of a second. The old version drove the offset straight off
// state.shake, which decays at 2.6/s — nearly a second of white-noise jitter
// per contact, and white noise on every axis at once is the recipe for making
// somebody put the phone down. This tracks state.shake's *rises* instead, and
// rings two decaying sinusoids along the rig's own axes so the kick has a
// direction you can read.
function applyShake(dt) {
  const s = state.shake || 0;
  if (s > shk.prev + 1e-3) {
    shk.amp = Math.min(CHASE.shakeMax, shk.amp + (s - shk.prev) * CHASE.shakeGain);
    shk.ph1 = rand(0, 6.283);
    shk.ph2 = rand(0, 6.283);
  }
  shk.prev = s;
  if (s > 0) state.shake = shk.prev = Math.max(0, s - CAM.shakeDecay * dt);

  if (shk.amp <= 1e-3) { shk.amp = 0; shk.fov = 0; return; }
  shk.amp = Math.max(0, shk.amp - shk.amp * CHASE.shakeDecay * dt - 0.12 * dt);
  shk.t += dt;
  if (!profile.settings.camShake) { shk.fov = 0; return; }

  const k = shk.amp * shk.amp * CHASE.shakeAmp;
  const a = Math.sin(shk.t * CHASE.shakeFreq + shk.ph1) * k;
  const b = Math.sin(shk.t * CHASE.shakeFreq * 0.71 + shk.ph2) * k * 0.6;
  rig.pos.addScaledVector(camRight, a).addScaledVector(camUp, b);
  rig.look.addScaledVector(camRight, a * 0.4).addScaledVector(camUp, b * 0.4);
  shk.fov = shk.amp * CHASE.shakeFov;
}

// ---------------------------------------------------------------------------
// Cinematic helpers — used by cutscenes, the grid intro and the replay reel.
// ---------------------------------------------------------------------------
export function setCamera(pos, look, up) {
  camera.up.copy(up || UP_WORLD);
  camera.position.copy(pos);
  camera.lookAt(look);
  rig.pos.copy(pos);
  rig.look.copy(look);
  rig.ready = true;
}

// A slow dolly around a point, used for grid shots and cutscene beats.
export function orbitShot(target, radius, height, angle, fov) {
  _pos.set(
    target.x + Math.cos(angle) * radius,
    target.y + height,
    target.z + Math.sin(angle) * radius
  );
  setCamera(_pos, target, UP_WORLD);
  if (fov) setFov(fov);
}

// Track-relative shot: `along` metres up the road from s, `across` metres
// sideways, `above` metres up. Used for cutscenes that need to frame a corner.
export function trackShot(track, s, across, above, lookAhead = 30, fov = 46) {
  const p = track.worldAt(s, across, above, _v);
  const l = track.worldAt(s + lookAhead, 0, 1.2, _v2);
  setCamera(p, l, UP_WORLD);
  setFov(fov);
}

export function cameraZoom(z) { rig.zoom = clamp(z, 0.6, 2.2); }
export function getRig() { return rig; }
