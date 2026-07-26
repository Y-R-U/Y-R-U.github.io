// The stewards, the cameras and the crowd — the system the whole game hangs
// off. Hitting people is legal. Being *seen* doing something the rulebook does
// not cover is not.
//
// Two dials pull against each other:
//   SUSPICION rises with every foul, scaled by how far away you did it and
//             whether a broadcast camera was live on that corner.
//   HYPE      rises with everything spectacular. At the verdict, the crowd's
//             enthusiasm is what talks the stewards out of the fine.

import { STEWARD, HYPE } from './config.js';
import { state } from './state.js';
import { emit } from './bus.js';
import { clamp, clamp01, lerp, wrap } from './utils.js';

let track = null;
let fineScale = 1;

export function initStewards(tr, purseTier = 1) {
  track = tr;
  fineScale = purseTier;
  state.suspicion = 0;
  state.suspicionPeak = 0;
  state.hype = 0;
  state.hypePeak = 0;
  state.hypeAccum = 0;
  state.cleanFor = 99;
  state.investigating = 0;
  state.investigations = 0;
  state.finesTotal = 0;
  state.fouls = 0;
  state.cleanFouls = 0;
  state.inCameraCone = false;
  state.nearestCamDist = 999;
  for (const c of tr.cams) c.live = true;
}

// ---------------------------------------------------------------------------
// Cameras
// ---------------------------------------------------------------------------
// Each camera sweeps: it covers its stretch of road only part of the time, so
// there is always a window. Learning the rhythm of a circuit's cameras is the
// skill the game is actually teaching.
export function updateCameras(time) {
  if (!track) return;
  for (const cam of track.cams) {
    cam.live = cam.always ? true : ((time + cam.phase) % cam.period) < cam.onTime;
    if (cam.tally) {
      cam.tally.material.color.setHex(cam.live ? 0xff2a2a : 0x331010);
    }
    if (cam.head && state.player) {
      // Point the lens at the car when it is in shot; idle sweep otherwise.
      const d = track.delta(cam.s, state.player.s);
      if (cam.live && d > -cam.back && d < cam.fwd) {
        cam.head.lookAt(state.player.worldPos);
      } else {
        cam.head.rotation.y = Math.sin(time * 0.35 + cam.phase) * 0.7;
      }
    }
  }
}

// Is this point on the circuit currently on camera? Returns 0..1 coverage.
export function cameraCoverage(s) {
  if (!track) return 0;
  let best = 0;
  for (const cam of track.cams) {
    if (!cam.live) continue;
    const d = track.delta(cam.s, s);
    if (d < -cam.back || d > cam.fwd) continue;
    // Strongest right in front of the lens, weaker at the edges of shot.
    const k = d < 0 ? 1 - (-d / cam.back) * 0.5 : 1 - (d / cam.fwd) * 0.7;
    best = Math.max(best, clamp01(k));
  }
  return best;
}

export function nearestCamera(s) {
  if (!track || !track.cams.length) return null;
  let best = null, bestD = Infinity;
  for (const cam of track.cams) {
    const d = track.delta(s, cam.s);       // positive = camera is ahead
    if (d < -40) continue;
    if (d < bestD) { bestD = d; best = cam; }
  }
  return best ? { cam: best, dist: bestD } : null;
}

// ---------------------------------------------------------------------------
// Fouls
// ---------------------------------------------------------------------------
// Distance is the whole risk curve. Paint-to-paint reads as a racing incident;
// the same move from across the circuit reads as assault.
export function distanceFactor(dist) {
  if (dist <= STEWARD.contactRange) return STEWARD.contactMul;
  if (dist <= STEWARD.closeRange) {
    const k = (dist - STEWARD.contactRange) / (STEWARD.closeRange - STEWARD.contactRange);
    return lerp(STEWARD.contactMul, 1, k);
  }
  const k = clamp01((dist - STEWARD.closeRange) / 26);
  return lerp(1, STEWARD.farMul, k);
}

// What the HUD shows before you press the button.
export function estimateRisk(car, skill, dist) {
  const base = skill ? skill.susp : 30;
  const cover = cameraCoverage(car.s);
  const mul = distanceFactor(dist == null ? 30 : dist) * (1 + cover * (STEWARD.camMul - 1));
  const susp = base * mul * (car.stats.stealth || 1);
  return {
    susp,
    cover,
    tier: susp < 8 ? 'clean' : susp < 22 ? 'low' : susp < 48 ? 'mid' : 'high',
  };
}

// Called when the player actually commits a foul.
export function reportFoul(car, opts = {}) {
  const skill = opts.skill;
  const base = opts.susp != null ? opts.susp : (skill ? skill.susp : 25);
  const dist = opts.dist == null ? 30 : opts.dist;
  const cover = cameraCoverage(car.s);
  const dMul = distanceFactor(dist);
  const camMul = 1 + cover * (STEWARD.camMul - 1);
  const susp = base * dMul * camMul * (car.stats.stealth || 1);

  state.fouls++;
  state.cleanFor = 0;
  const clean = susp < 6;
  if (clean) state.cleanFouls++;

  state.suspicion = clamp(state.suspicion + susp, 0, STEWARD.max * 1.4);
  state.suspicionPeak = Math.max(state.suspicionPeak, state.suspicion);

  emit('steward:foul', {
    car, skill, susp, dist, cover, clean,
    verdictHint: clean ? 'RACING INCIDENT' : cover > 0.3 ? 'ON CAMERA' : 'UNSEEN',
  });

  if (state.suspicion >= STEWARD.max && state.investigating <= 0) openInvestigation();
  return { susp, clean, cover };
}

function openInvestigation() {
  state.investigating = STEWARD.investigateHold;
  state.investigations++;
  emit('steward:investigating', { n: state.investigations });
}

// ---------------------------------------------------------------------------
// Hype
// ---------------------------------------------------------------------------
export function addHype(amount, why) {
  const mul = state.player ? (state.player.stats.hypeGain || 1) : 1;
  const before = state.hype;
  state.hype = clamp(state.hype + amount * mul, 0, HYPE.max);
  state.hypePeak = Math.max(state.hypePeak || 0, state.hype);
  if (state.hype > before + 0.5) emit('hype:gain', { amount, why, total: state.hype });
  return state.hype;
}

// The crowd bonus is paid on how excited they were across the whole race, not
// on whatever is left on the meter when the flag drops.
export function averageHype() {
  return state.raceTime > 1 ? (state.hypeAccum || 0) / state.raceTime : state.hype;
}

export function hypeTier() {
  const h = state.hype;
  if (h >= 85) return { name: 'THE CROWD IS FERAL', css: '#ffb020', k: 4 };
  if (h >= 60) return { name: 'CROWD FAVOURITE', css: '#ff7a3d', k: 3 };
  if (h >= 35) return { name: 'THEY LIKE YOU', css: '#4aa3ef', k: 2 };
  if (h >= 12) return { name: 'MILD INTEREST', css: '#9fb0c0', k: 1 };
  return { name: 'NOBODY IS WATCHING', css: '#6a7480', k: 0 };
}

// ---------------------------------------------------------------------------
export function updateStewards(dt, time) {
  if (!track) return;
  updateCameras(time);

  state.cleanFor += dt;
  state.hypeAccum = (state.hypeAccum || 0) + state.hype * dt;
  const decay = state.cleanFor > STEWARD.calmAfter ? STEWARD.decayIdle : STEWARD.decay;
  if (state.investigating <= 0) {
    state.suspicion = Math.max(0, state.suspicion - decay * dt);
  }
  state.hype = Math.max(0, state.hype - HYPE.decay * dt);

  if (state.player) {
    const cover = cameraCoverage(state.player.s);
    state.inCameraCone = cover > 0.05;
    const near = nearestCamera(state.player.s);
    state.nearestCamDist = near ? near.dist : 999;
    state.nearestCam = near ? near.cam : null;
  }

  if (state.investigating > 0) {
    state.investigating -= dt;
    if (state.investigating <= 0) resolveInvestigation();
  }
}

function resolveInvestigation() {
  const crowd = clamp01(state.hype / HYPE.max);
  const letOff = 0.1 + STEWARD.hypeShield * crowd;
  const cleared = Math.random() < letOff;

  if (cleared) {
    state.suspicion = STEWARD.clearedReset;
    emit('steward:verdict', {
      cleared: true, fine: 0,
      text: crowd > 0.5 ? 'NO FURTHER ACTION — THE CROWD LOVED IT' : 'NO FURTHER ACTION',
    });
  } else {
    const fine = Math.round(
      STEWARD.fineBase * fineScale * Math.pow(STEWARD.fineRamp, state.investigations - 1) * (1 - crowd * 0.35)
    );
    state.finesTotal += fine;
    state.suspicion = STEWARD.finedReset;
    emit('steward:verdict', { cleared: false, fine, text: 'PENALTY — FINED' });
  }
}

// Suspicion left on the table at the end of a race still costs you, but less.
export function settleRace() {
  let extra = 0;
  if (state.investigating > 0) {
    resolveInvestigation();
  }
  if (state.suspicion > STEWARD.max * 0.7) {
    const crowd = clamp01(state.hype / HYPE.max);
    extra = Math.round(STEWARD.fineBase * fineScale * 0.5 * (1 - crowd * 0.5));
    state.finesTotal += extra;
    emit('steward:postRace', { fine: extra, reason: 'POST-RACE REVIEW' });
  }
  return { fines: state.finesTotal, extra };
}
