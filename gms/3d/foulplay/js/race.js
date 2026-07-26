// The race: grid, lights, traffic, contact, pickups, positions, eliminations
// and the finish. Everything that needs to know about *all* the cars at once
// lives here; the cars themselves only know about the road.

import * as THREE from 'three';
import { RACE, CRASH, DRIVE, LIVERY, RIVAL_NAMES, TEAM_NAMES, AUTO_MODE, PRIZE_SHARE } from './config.js';
import { scene, setEnvironment, trackShadow, disposeGroup } from './render.js';
import { buildTrack } from './trackgen.js';
import { buildTrackMesh, setStartLights, setStartLightsGreen, updateCrowd } from './trackmesh.js';
import { Car } from './car.js';
import { AIDriver } from './ai.js';
import { input, updateInput, consumeBoost, consumeAttack, clearInput } from './input.js';
import { initAttacks, updateAttacks, fireAttack, tickHazardCooldowns, clearHazards } from './attacks.js';
import { initStewards, updateStewards, addHype, settleRace, averageHype } from './stewards.js';
import { initParticles, updateParticles, clearParticles, explode, ring, smokePuff } from './particles.js';
import { initBubbles, updateBubbles, clearBubbles, showBubble } from './bubbles.js';
import { updateDebris, clearDebris } from './debris.js';
import { updateCamera, resetCamera } from './camera.js';
import { initHighlights, recordFrame, markHighlight, harvestHighlights, clearHighlights } from './highlights.js';
import { state, resetRaceState, addShake } from './state.js';
import { profile, playerStats, playerStyle, playerLivery, addGrudge, pickGrudge } from './save.js';
import { statsFor, partById, trackPickup } from './arsenal.js';
import { emit, on } from './bus.js';
import { clamp, clamp01, lerp, rand, randInt, sign, pick, shuffled, wrap } from './utils.js';

let trackMesh = null;
let event = null;
let finishOrder = 0;
let knockoutTimer = 0;
let endTimer = 0;
let started = false;

const _v1 = new THREE.Vector3();

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
export function startRace(ev) {
  teardownRace();
  event = ev;
  resetRaceState();
  state.event = ev;

  const track = buildTrack(ev.track);
  state.track = track;
  state.laps = ev.laps || track.def.laps || RACE.laps;

  setEnvironment(ev.env || track.env);
  trackMesh = buildTrackMesh(track);
  scene.add(trackMesh);

  initParticles();
  initBubbles();
  initAttacks(track);
  initStewards(track, ev.purseTier || 1);

  // Event twists that change how closely you are being watched. Tracks are
  // cached between races, so always restore the defaults first.
  for (const cam of track.cams) {
    cam.onTime = cam.baseOn;
    cam.period = cam.basePeriod;
    cam.always = cam.baseAlways;
    cam.live = true;
  }
  if (ev.noCams) {
    for (const cam of track.cams) { cam.always = false; cam.onTime = 0; cam.live = false; }
  } else if (ev.allCams) {
    for (const cam of track.cams) { cam.always = true; }
  }

  // Tracks are cached, so anything a previous race consumed has to come back.
  for (const c of track.crates) { c.taken = 0; c.mesh = null; }
  for (const p of track.pads) p.hit = null;

  buildField(ev, track);
  initHighlights(state.cars);

  finishOrder = 0;
  knockoutTimer = RACE.knockoutInterval;
  endTimer = 0;
  started = false;
  state.phase = 'countdown';
  state.countdown = RACE.countdown;
  state.raceTime = 0;
  state.camMode = 'chase';
  clearInput();
  resetCamera(state.player);
  emit('race:start', { event: ev, track });
}

function buildField(ev, track) {
  const count = clamp(ev.cars || RACE.gridCars, 2, 12);
  const cars = [];

  const rivalDefs = ev.rivals && ev.rivals.length
    ? ev.rivals.slice(0, count - 1)
    : makeRivals(count - 1, ev);

  // Grid order: two-by-two, player where the event says (default: last).
  const playerSlot = ev.playerSlot != null ? ev.playerSlot : count - 1;

  let ri = 0;
  for (let slot = 0; slot < count; slot++) {
    const isPlayer = slot === playerSlot;
    let car;
    if (isPlayer) {
      car = new Car({
        track, index: slot, isPlayer: true,
        name: profile.name,
        team: 'You',
        style: ev.playerStyle || playerStyle(),
        livery: playerLivery(),
        stats: playerStats(),
        skills: profile.garage.loadout.slice(),
      });
      car.assist = profile.settings.assist !== false;
      state.player = car;
    } else {
      const d = rivalDefs[ri++] || {};
      car = new Car({
        track, index: slot, isPlayer: false,
        name: d.name, team: d.team, style: d.style,
        livery: d.livery, stats: d.stats, skills: d.skills,
      });
      car.ai = new AIDriver(car, {
        skill: d.skill, aggression: d.aggression,
        rubber: ev.rubber != null ? ev.rubber : 0.35,
      });
      if (d.grudge) {
        car.grudgeCount = d.grudge;
        // They start the race already looking for you.
        car.ai.grudge = state.player || null;
        car.ai.grudgeT = 999;
      }
    }

    const row = Math.floor(slot / 2);
    const side = slot % 2 === 0 ? -1 : 1;
    const s = wrap(track.startS - 16 - row * RACE.gridSpacing, track.length);
    car.placeOnGrid(s, side * RACE.gridStagger);
    car.position = slot + 1;
    cars.push(car);
  }

  state.cars = cars;
  state.order = cars.slice();

  // The grudge-holder needs the player object, which does not exist until the
  // whole grid is built — hence the second pass.
  for (const c of cars) {
    if (c.grudgeCount && c.ai) {
      c.ai.grudge = state.player;
      emit('race:grudge', { car: c, wrecks: c.grudgeCount });
    }
  }
}

function makeRivals(n, ev) {
  const names = shuffled(RIVAL_NAMES).slice(0, n);
  const styles = ['muscle', 'wedge', 'stock', 'van', 'buggy'];
  const tier = clamp(ev.tier || 1, 0, 6);
  const out = [];
  for (let i = 0; i < n; i++) {
    const strength = clamp(tier / 6 + rand(-0.12, 0.12), 0, 1);
    out.push({
      name: names[i] || 'RIVAL ' + (i + 1),
      team: pick(TEAM_NAMES),
      style: styles[(i + (ev.styleSeed || 0)) % styles.length],
      livery: LIVERY[(i + 3) % LIVERY.length],
      skill: clamp((ev.aiSkill != null ? ev.aiSkill : 0.82) + rand(-0.07, 0.09), 0.3, 1),
      aggression: clamp((ev.aiAggro != null ? ev.aiAggro : 0.42) + rand(-0.2, 0.25), 0.03, 1),
      stats: rivalStats(strength),
      skills: rivalSkills(strength),
    });
  }

  // Somebody you have wrecked before turns up on most grids, meaner than the
  // rest and with the equipment to prove a point. This is what makes the field
  // feel like a paddock you have to live in rather than a random draw.
  if (!ev.attract && out.length && Math.random() < 0.62) {
    const g = pickGrudge();
    if (g) {
      const slot = out[randInt(0, out.length - 1)];
      slot.name = g.name;
      slot.team = g.team || slot.team;
      if (g.livery) slot.livery = g.livery;
      slot.aggression = clamp(slot.aggression + 0.22 + Math.min(0.2, g.wrecks * 0.05), 0.1, 1);
      slot.skill = clamp(slot.skill + 0.05, 0.3, 1);
      slot.skills = rivalSkills(clamp(tier / 6 + 0.25, 0, 1));
      slot.grudge = g.wrecks;
    }
  }
  return out;
}

function rivalStats(strength) {
  const pickTier = (prefix) => {
    const t = clamp(Math.round(1 + strength * 5 + rand(-0.7, 0.7)), 1, 6);
    return prefix + t;
  };
  return statsFor({
    engine: pickTier('eng'), tyres: pickTier('tyr'), armour: pickTier('arm'),
    nitro: pickTier('nit'), frame: pickTier('frm'), stealth: 'stl1',
  });
}

function rivalSkills(strength) {
  const cheap = ['slam', 'bullbar', 'jetwash', 'smoke', 'oilslick'];
  const mid = ['pitspin', 'tacks', 'hooksaw', 'grapple', 'anchor'];
  const big = ['emp', 'shockwave', 'ramjet', 'scattergun'];
  const pool = strength > 0.7 ? [...cheap, ...mid, ...big]
    : strength > 0.4 ? [...cheap, ...mid] : cheap;
  return shuffled(pool).slice(0, 2 + Math.round(strength));
}

export function teardownRace() {
  for (const c of state.cars) c.dispose();
  state.cars = [];
  state.player = null;
  if (trackMesh) { disposeGroup(trackMesh); trackMesh = null; }
  if (crateGroup) {
    if (state.track) for (const c of state.track.crates) c.mesh = null;
    disposeGroup(crateGroup);
    crateGroup = null;
  }
  clearDebris();
  clearParticles();
  clearBubbles();
  clearHazards();
  clearHighlights();
  state.track = null;
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------
export function updateRace(dt) {
  const cars = state.cars;
  if (!cars.length || !state.track) return;

  if (state.phase === 'countdown') {
    state.countdown -= dt;
    const lights = Math.max(0, Math.ceil(state.countdown - 0.6));
    setStartLights(trackMesh, clamp(5 - lights, 0, 5));
    if (state.countdown <= 0) {
      setStartLightsGreen(trackMesh);
      for (const c of cars) c.launch();
      state.phase = 'racing';
      started = true;
      emit('race:go', {});
    }
  } else if (state.phase === 'racing' || state.phase === 'finished') {
    state.raceTime += dt;
  }

  // --- controls -------------------------------------------------------------
  updateInput(dt);
  state.lookBack = input.lookBack;
  const p = state.player;
  if (p && p.alive) {
    if (AUTO_MODE || p.autoDrive) {
      if (!p.ai) p.ai = new AIDriver(p, { skill: 0.92, aggression: 0.55, rubber: 0 });
      p.ai.update(dt, cars);
    } else if (state.phase === 'racing' || state.phase === 'finished') {
      p.controls.steer = input.steer;
      p.controls.brake = input.brake;
      p.controls.throttle = input.throttle;
      if (consumeBoost() && p.useBoost()) state.boostsUsed++;
      if (consumeAttack()) fireAttack(p, cars);
    } else {
      p.controls.steer = 0; p.controls.brake = 0; p.controls.throttle = 0;
      consumeBoost(); consumeAttack();
    }
    if (AUTO_MODE && state.phase === 'racing') {
      if (Math.random() < dt * 0.6) fireAttack(p, cars);
      if (p.boosts > 0 && Math.random() < dt * 0.5) p.useBoost();
    }
  }

  for (const c of cars) {
    if (c.ai && c !== p) c.ai.update(dt, cars);
    else if (c.ai && c === p && !(AUTO_MODE || p.autoDrive)) c.ai = null;
  }

  // --- physics ---------------------------------------------------------------
  for (const c of cars) c.update(dt, state.raceTime);
  if (p) state.topSpeedSeen = Math.max(state.topSpeedSeen, p.forwardSpeed);

  resolveContacts(dt, cars);
  checkPickups(dt, cars);
  tickHazardCooldowns(dt, cars);
  updateAttacks(dt, cars);
  updateStewards(dt, state.raceTime);
  updatePositions(dt, cars);
  if (event && event.knockout && state.phase === 'racing') updateKnockout(dt, cars);

  // --- presentation ----------------------------------------------------------
  updateDebris(dt);
  updateParticles(dt);
  updateBubbles(dt);
  updateCamera(dt);
  if (p) trackShadow(p.worldPos);
  if (trackMesh) updateCrowd(trackMesh, state.raceTime, state.hype);
  recordFrame(dt, cars);

  // --- finishing -------------------------------------------------------------
  if (state.phase === 'finished') {
    endTimer -= dt;
    if (endTimer <= 0) concludeRace();
  }
}

// ---------------------------------------------------------------------------
// Contact between cars — always legal, always expensive
// ---------------------------------------------------------------------------
function resolveContacts(dt, cars) {
  const tr = state.track;
  const LEN = CRASH.carLen, WID = CRASH.carWide;
  for (let i = 0; i < cars.length; i++) {
    const a = cars[i];
    if (!a.alive || a.mode === 'wreck' || a.respawnTimer > 0) continue;
    for (let j = i + 1; j < cars.length; j++) {
      const b = cars[j];
      if (!b.alive || b.mode === 'wreck' || b.respawnTimer > 0) continue;

      const ds = tr.delta(a.s, b.s);
      if (Math.abs(ds) > LEN + 2) continue;
      const dtt = b.t - a.t;
      if (Math.abs((b.h || 0) - (a.h || 0)) > 1.7) continue;

      // Something hanging off one car reaches further than the car does. Run
      // alongside a rival trailing half a door and it will find you.
      if (Math.abs(dtt) < WID + 1.7 && (a.hasDangler() || b.hasDangler())) {
        flailHit(a, b, dtt);
        flailHit(b, a, -dtt);
      }
      if (Math.abs(ds) > LEN || Math.abs(dtt) > WID) continue;

      const overS = LEN - Math.abs(ds);
      const overT = WID - Math.abs(dtt);
      const ma = a.stats.mass || 1, mb = b.stats.mass || 1;
      const tot = ma + mb;

      if (overT < overS) {
        // Side-by-side: the classic lean.
        const dir = sign(dtt) || (Math.random() < 0.5 ? -1 : 1);
        const push = (overT + 0.04) * 0.55;
        a.t -= dir * push * (mb / tot);
        b.t += dir * push * (ma / tot);

        const rel = (b.vl - a.vl) * dir;
        if (rel < 0) {
          const jimp = -(1 + 0.32) * rel / (1 / ma + 1 / mb);
          a.vl -= (jimp / ma) * dir;
          b.vl += (jimp / mb) * dir;
          const closing = Math.abs(rel);
          if (closing > 2.5) contactDamage(a, b, closing, dir, 'side');
          // A real slam — not a rub — leaves both cars liable to go over the
          // next barrier they touch. This is how you put somebody out with the
          // car alone, no equipment and no suspicion.
          if (closing > CRASH.slamSpeed) {
            a.slammed = CRASH.slamWindow;
            b.slammed = CRASH.slamWindow;
          }
        }
      } else {
        // Nose to tail.
        const dir = sign(ds) || 1;
        const push = (overS + 0.05) * 0.5;
        const rel = (b.va - a.va) * dir;
        a.s = wrap(a.s - dir * push * (mb / tot), tr.length);
        b.s = wrap(b.s + dir * push * (ma / tot), tr.length);
        if (rel < 0) {
          const jimp = -(1 + 0.2) * rel / (1 / ma + 1 / mb);
          a.va -= (jimp / ma) * dir;
          b.va += (jimp / mb) * dir;
          const closing = Math.abs(rel);
          if (closing > 3.5) contactDamage(a, b, closing, dir, 'rear');
          // A shunt from behind unsettles the car in front.
          const front = dir > 0 ? b : a;
          front.psi += rand(-0.12, 0.12) * clamp01(Math.abs(rel) / 14);
          front.recover = Math.max(front.recover, 0.4);
        }
      }
    }
  }
}

// `owner` is trailing wreckage; `victim` is alongside. It is not much of a hit,
// but it sparks, it nudges them off line and it can finish the job of tearing
// the panel free — which is exactly what it looks like it should do.
function flailHit(owner, victim, dtt) {
  if (!owner.hasDangler() || owner.flailAt > state.raceTime - 0.35) return;
  owner.flailAt = state.raceTime;
  const dir = sign(dtt) || 1;
  const bite = clamp01(Math.abs(owner.forwardSpeed) / 50);
  victim.shove(dir * (3 + bite * 7), 0, { by: owner });
  victim.damage(2 + bite * 7, dir > 0 ? 'left' : 'right', { by: owner, source: 'debris' });
  _v1.copy(victim.worldPos).lerp(owner.worldPos, 0.5);
  ring(_v1, 0xffb43a, 2.2, 0.24);
  emit('race:flail', { owner, victim });
  // Half the time the impact is what finally rips it off.
  if (Math.random() < 0.5) {
    const id = owner.danglers[0];
    if (id) owner.detachPart(id, { by: victim, dir: _v1.set(dir, 0.6, 0).normalize() });
  }
}

function contactDamage(a, b, closing, dir, kind) {
  const dmg = closing * CRASH.carDamage;
  const regionA = kind === 'side' ? (dir > 0 ? 'right' : 'left') : (dir > 0 ? 'rear' : 'front');
  const regionB = kind === 'side' ? (dir > 0 ? 'left' : 'right') : (dir > 0 ? 'front' : 'rear');
  // Whoever was doing the closing takes a bit less — ramming is rewarded.
  const aAgg = kind === 'rear' ? (dir > 0 ? 0.65 : 1.0) : 1.0;
  a.damage(dmg * aAgg * (1 / (a.stats.ram || 1)), regionA, { by: b, source: 'contact' });
  b.damage(dmg * (2 - aAgg) * 0.6 * (1 / (b.stats.ram || 1)), regionB, { by: a, source: 'contact' });
  a.lastContact = b; a.lastContactAt = performance.now() / 1000;
  b.lastContact = a; b.lastContactAt = performance.now() / 1000;
  if (b.ai) b.ai.remember(a);
  if (a.ai) a.ai.remember(b);
  const p = a.isPlayer ? a : b.isPlayer ? b : null;
  if (p) addShake(clamp01(closing / 24) * 0.5);
  emit('race:contact', { a, b, closing, kind });
}

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------
function checkPickups(dt, cars) {
  const tr = state.track;
  for (const pad of tr.pads) {
    if (pad.mesh) {
      const pulse = 0.6 + 0.4 * Math.sin(state.raceTime * 5 + pad.s);
      pad.mesh.material.opacity = pulse;
    }
  }
  for (const c of cars) {
    if (!c.alive || c.mode === 'wreck' || c.mode === 'grid' || c.respawnTimer > 0) continue;
    const near = tr.nearFeatures(c.s);
    for (const item of near) {
      const f = item.ref;
      if (item.type === 'pad') {
        if (Math.abs(tr.delta(f.s, c.s)) < f.len * 0.5 && Math.abs(c.t - f.t) < f.w && c.h < 1.4) {
          if (!f.hit) f.hit = new WeakMap();
          const last = f.hit.get(c) || -99;
          if (state.raceTime - last > 1.2) {
            f.hit.set(c, state.raceTime);
            c.padBoost();
            ring(c.worldPos, 0x66ddff, 5, 0.35);
          }
        }
      } else if (item.type === 'crate') {
        if (f.taken > state.raceTime) continue;
        if (Math.abs(tr.delta(f.s, c.s)) < 3.4 && Math.abs(c.t - f.t) < 3.0 && c.h < 2.2) {
          f.taken = state.raceTime + 13;
          collectCrate(c, f);
        }
      }
    }
  }
  updateCrateMeshes();
}

let crateGroup = null;
function updateCrateMeshes() {
  const tr = state.track;
  if (!crateGroup) {
    crateGroup = new THREE.Group();
    crateGroup.name = 'crates';
    scene.add(crateGroup);
    const boostGeo = new THREE.OctahedronGeometry(1.15, 0);
    const chestGeo = new THREE.BoxGeometry(1.9, 1.5, 1.5);
    const boostMat = new THREE.MeshLambertMaterial({ color: 0x35d7ff, emissive: 0x0a4a5c });
    const chestMat = new THREE.MeshLambertMaterial({ color: 0xd8a63c, emissive: 0x3a2a08 });
    boostMat.__owned = chestMat.__owned = true;
    for (const c of tr.crates) {
      const m = new THREE.Mesh(c.kind === 'boost' ? boostGeo : chestGeo,
        c.kind === 'boost' ? boostMat : chestMat);
      m.position.copy(tr.worldAt(c.s, c.t, c.kind === 'boost' ? 1.5 : 0.9));
      crateGroup.add(m);
      c.mesh = m;
    }
  }
  const t = state.raceTime;
  for (const c of tr.crates) {
    if (!c.mesh) continue;
    const up = c.taken > t;
    c.mesh.visible = !up;
    if (!up) {
      c.mesh.rotation.y = t * 1.6 + c.s;
      c.mesh.position.copy(tr.worldAt(c.s, c.t, (c.kind === 'boost' ? 1.5 : 0.9) + Math.sin(t * 2 + c.s) * 0.22));
    }
  }
}

// What is in a roadside crate. Crates you take home are earned at the flag now;
// the ones on the circuit are pocket money and nitro, so grabbing one is a
// racing decision rather than a slot machine you drive into.
function collectCrate(car, crate) {
  ring(car.worldPos, crate.kind === 'boost' ? 0x35d7ff : 0xffc44d, 4, 0.4);
  if (crate.kind === 'boost') {
    car.giveBoost(1);
    if (car.isPlayer) emit('pickup:boost', { car });
    return;
  }
  if (!car.isPlayer) { car.giveBoost(1); return; }

  const loot = trackPickup();
  if (loot.kind === 'cash') {
    state.pickupCash = (state.pickupCash || 0) + loot.amount;
    emit('pickup:cash', { car, amount: loot.amount });
  } else if (loot.kind === 'boost') {
    car.giveBoost(1);
    emit('pickup:boost', { car });
  } else {
    state.chestsFound++;
    state.foundChests = state.foundChests || [];
    state.foundChests.push(loot.tier);
    emit('pickup:chest', { car, tier: loot.tier });
  }
}

// ---------------------------------------------------------------------------
// Positions, laps, finishing
// ---------------------------------------------------------------------------
function updatePositions(dt, cars) {
  const laps = state.laps;
  for (const c of cars) {
    if (c.finished || !c.alive) continue;
    if (c.lap >= laps) {
      c.finished = true;
      c.finishTime = state.raceTime;
      c.finishOrder = ++finishOrder;
      state.finishers.push(c);
      emit('car:finish', { car: c, position: c.finishOrder });
      if (c.isPlayer) onPlayerFinish(c);
    }
  }

  const sorted = cars.slice().sort((a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const was = c.position;
    c.position = i + 1;
    if (c.isPlayer && was && c.position < was && state.phase === 'racing') {
      state.overtakes++;
      addHype(6, 'overtake');
      emit('race:overtake', { car: c, position: c.position });
    }
  }
  state.order = sorted;
}

function onPlayerFinish(car) {
  state.phase = 'finished';
  endTimer = RACE.finishHold;
  emit('race:playerFinish', { car, position: car.finishOrder });
}

function updateKnockout(dt, cars) {
  knockoutTimer -= dt;
  if (knockoutTimer > 0) return;
  knockoutTimer = RACE.knockoutInterval;
  const live = state.order.filter((c) => c.alive && !c.finished);
  if (live.length <= 2) return;
  const doomed = live[live.length - 1];
  eliminate(doomed);
}

function eliminate(car) {
  explode(car.worldPos, 30, 0xff7a2a);
  ring(car.worldPos, 0xff4444, 16, 0.7);
  car.retire();
  emit('race:eliminated', { car });
  if (car.isPlayer) {
    state.phase = 'finished';
    endTimer = 1.6;
    car.finishOrder = state.cars.filter((c) => !c.retired || c === car).length;
  }
}

// ---------------------------------------------------------------------------
function concludeRace() {
  if (state.phase === 'results') return;
  state.phase = 'results';
  const fines = settleRace();
  const results = buildResults(fines);
  state.results = results;
  emit('race:done', results);
}

function buildResults(fines) {
  const p = state.player;
  const cars = state.cars;
  const laps = state.laps;

  // Anyone still running is classified by how far they got.
  const classified = cars.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
    if (a.finished) return -1;
    if (b.finished) return 1;
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    return b.progress - a.progress;
  });

  const pos = classified.indexOf(p) + 1;
  const purse = (event && event.purse) || 4000;
  const share = PRIZE_SHARE[Math.min(pos - 1, PRIZE_SHARE.length - 1)] || 0.03;
  const prize = Math.round(purse * share);
  const crowd = Math.max(averageHype(), state.hypePeak * 0.5);
  const hypeBonus = Math.round(purse * 0.3 * (crowd / 100));
  const damageBill = Math.round(clamp(1 - p.hp / p.maxHp, 0, 1) * purse * 0.1);

  return {
    event,
    position: pos,
    fieldSize: classified.length,
    finished: p.finished,
    retired: p.retired,
    time: p.finishTime || state.raceTime,
    bestLap: p.bestLap,
    laps,
    classified: classified.map((c, i) => ({
      pos: i + 1, name: c.name, team: c.team, isPlayer: c.isPlayer,
      time: c.finishTime, retired: c.retired, livery: c.livery,
      parts: c.partsLost.length,
    })),
    prize, hypeBonus, damageBill,
    fines: fines.fines,
    net: prize + hypeBonus - damageBill - fines.fines,
    hype: crowd,
    hypePeak: state.hypePeak,
    suspicionPeak: state.suspicionPeak,
    investigations: state.investigations,
    fouls: state.fouls,
    cleanFouls: state.cleanFouls,
    wrecksCaused: state.wrecksCaused,
    partsKnockedOff: state.partsKnockedOff,
    overtakes: state.overtakes,
    bestAir: state.bestAir,
    driftTime: state.driftTime,
    flips: state.flips,
    chests: state.foundChests || [],
    highlights: harvestHighlights(),
  };
}

// ---------------------------------------------------------------------------
// Scoring hooks. Registered once at module load — every one of them checks the
// phase, so they are inert outside a live race.
// ---------------------------------------------------------------------------
on('car:wreck', ({ car, by }) => {
  if (state.phase !== 'racing') return;
  if (by && by.isPlayer && car !== by) {
    state.wrecksCaused++;
    addHype(26, 'wreck');
    // They will remember this next season, and the season after.
    if (!(state.event && state.event.attract)) addGrudge(car.name, car.team, car.livery);
  }
  if (car.isPlayer) addHype(8, 'spectacle');
});

on('car:partOff', ({ car, by }) => {
  if (state.phase !== 'racing') return;
  if (by && by.isPlayer && car !== by) {
    state.partsKnockedOff++;
    addHype(4, 'panel');
  }
});

on('car:landed', ({ car, air, peak }) => {
  if (state.phase !== 'racing' || !car.isPlayer) return;
  state.airTime += air;
  state.bestAir = Math.max(state.bestAir, peak);
  if (peak > 1.2) addHype(peak * 0.9, 'air');
});

on('car:tumble', ({ car, impact }) => {
  if (state.phase !== 'racing') return;
  if (impact > 7) {
    state.flips++;
    if (car.isPlayer || (car.recentContact() && car.recentContact().isPlayer)) addHype(9, 'flip');
  }
});

on('car:driftEnd', ({ car, time }) => {
  if (state.phase !== 'racing' || !car.isPlayer) return;
  state.driftTime += time;
  addHype(Math.min(time, 5) * 5.5, 'drift');
});

on('attack:hit', ({ attacker, target }) => {
  if (state.phase !== 'racing') return;
  if (target && target.ai) target.ai.remember(attacker);
});

// Lap timing lives here because only the race knows when the clock started.
on('car:lap', ({ car }) => {
  const t = state.raceTime;
  if (car.lapStart != null && car.lap > 0) {
    const lap = t - car.lapStart;
    if (lap > 4) {
      car.lastLap = lap;
      if (lap < car.bestLap) {
        car.bestLap = lap;
        if (car.isPlayer && car.lap > 1) emit('race:bestLap', { car, lap });
      }
      if (!state.lapRecord || lap < state.lapRecord.time) state.lapRecord = { time: lap, car };
    }
  }
  car.lapStart = t;
});

on('race:go', () => {
  for (const c of state.cars) c.lapStart = 0;
});

export function forceEnd() {
  if (state.phase !== 'results') {
    state.phase = 'finished';
    endTimer = 0.1;
  }
}

export const currentEvent = () => event;
