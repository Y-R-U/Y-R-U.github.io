// Which sounds are keepers, which are still being argued about, and which are out. Seeded from
// Aaron's verdicts on the FORGE bench (2026-08-04) so nothing has to be rediscovered, then
// re-bucketed for a biplane game: everything KITEHAWK actually uses starts in review so it gets
// listened to once in this context, and the FORGE village foley is parked out of the way.
//
// The browser's copy wins after the first edit, because that is the one being worked on.

import { SFX, SFX_IDS } from '../../../js/audio/registry.js';

export const BUCKETS = ['keep', 'review', 'bad'];
export const BUCKET_LABEL = { keep: 'Keep', review: 'Audition', bad: 'Not used' };
const KEY = 'kitehawk.sfx.triage.v1';

// SFX.md's inventory: what carries over, what does not. `n` is the note it arrives with.
const SEED = {
  explosionDistant: { b: 'keep', n: 'FORGE: good, and the dials sound good at different levels too. Here: distant flak, ground targets.' },
  impactMetal: { b: 'keep', as: 'Bell — struck', n: 'FORGE: kind of a bell. Here: rounds into the engine cowling, with pitch up.' },
  impactWood: { b: 'keep', n: 'FORGE: pitch at the lowest sounds like chopping wood. Here: rounds into a spar or a strut.' },
  whooshFast: { b: 'keep', n: 'A plane passing close.' },
  whooshHeavy: { b: 'keep', n: 'A dive.' },
  uiBlip: { b: 'keep', n: '' }, uiConfirm: { b: 'keep', n: '' }, uiError: { b: 'keep', n: '' },
  fireCrackle: { b: 'keep', n: 'Burning aircraft.' },
  ignite: { b: 'keep', n: 'Fuel going up.' },
  clothSwish: { b: 'keep', n: 'Parachute canopy and fabric wings — one of the more load-bearing ports.' },
  creak: { b: 'keep', n: 'Airframe stress in a dive. The sustained wireHum source covers the continuous version.' },
  thunder: { b: 'keep', n: 'Storm act.' },
  rain: { b: 'keep', n: 'Weather.' },
  windGust: { b: 'keep', n: 'Weather.' },
  waterSplash: { b: 'keep', n: 'Ditching in the sea.' },
  bubble: { b: 'keep', n: 'Going under.' },
  alarm: { b: 'keep', n: 'Warnings.' },
  heartbeat: { b: 'keep', n: 'Low health.' },
  glassBreak: { b: 'keep', n: 'Instrument glass.' },
  coinsBag: { b: 'keep', n: 'Cash.' },
  bird: { b: 'keep', n: 'Aerodrome ambience.' },
  owl: { b: 'keep', n: 'Night aerodrome.' },
  leaves: { b: 'keep', n: 'Aerodrome ambience.' },

  explosionBoom: { b: 'review', n: 'Rejected for FORGE. Reconsider here — it is an ammo dump.' },
  explosionCrack: { b: 'review', n: 'Rejected for FORGE. Reconsider here; flakCrump may cover it.' },
  impactThud: { b: 'review', n: 'Rejected for FORGE.' },
  pickupCoin: { b: 'review', n: 'FORGE: too platformer. Probably still is.' },
  powerup: { b: 'review', n: 'FORGE: same platformer problem.' },
  footGrass: { b: 'review', n: 'Aerodrome, on foot.' },
  footWood: { b: 'review', n: 'Duckboards.' },
  doorWood: { b: 'review', n: 'Hangar door.' },

  laser: { b: 'bad', n: 'Wrong period.' },
  zap: { b: 'bad', n: 'Wrong period.' },
  swordClash: { b: 'bad', n: 'FORGE melee set.' },
  bowShot: { b: 'bad', n: 'FORGE melee set.' },
  arrowHit: { b: 'bad', n: 'FORGE melee set.' },
  spellCast: { b: 'bad', n: 'FORGE magic set.' },
  spellHit: { b: 'bad', n: 'FORGE magic set.' },
  anvil: { b: 'bad', n: 'FORGE village foley.' },
  dig: { b: 'bad', n: 'FORGE village foley.' },
  chopWood: { b: 'bad', n: 'FORGE village foley.' },
  stoneGrind: { b: 'bad', n: 'FORGE village foley.' },
  chestLatch: { b: 'bad', n: 'FORGE village foley.' },
  footSnow: { b: 'bad', n: 'FORGE village foley.' },
  wade: { b: 'bad', n: 'FORGE village foley.' },
  growl: { b: 'bad', n: 'FORGE monster set.' },
  insect: { b: 'bad', n: 'FORGE monster set.' },
  frog: { b: 'bad', n: 'FORGE village foley.' },
};

// Anything not named above — every aviation sound — starts in review. That is what review is for.
export function freshState() {
  const out = {};
  for (const id of SFX_IDS) {
    const s = SEED[id];
    out[id] = { bucket: s ? s.b : 'review', note: s ? s.n : '', as: s && s.as ? s.as : '' };
  }
  return out;
}

export function load() {
  const base = freshState();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved) for (const id in base) if (saved[id]) Object.assign(base[id], saved[id]);
  } catch {}
  return base;
}

export function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }
export function reset() { try { localStorage.removeItem(KEY); } catch {} }

// Only the params that were actually moved, so the report says what to change rather than
// restating every default back at you.
export function changed(spec, values) {
  const out = {};
  for (const k in spec.params) {
    if (values[k] !== undefined && Math.abs(values[k] - spec.params[k].def) > 1e-9) out[k] = +values[k].toFixed(4);
  }
  return out;
}
