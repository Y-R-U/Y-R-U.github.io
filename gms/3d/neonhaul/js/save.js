// localStorage profile. One object behind S(), written on a 2 s debounce. ?nosave no-ops
// every write. The save stores a seed, never world data (§2.4).

import { FLAG, WORLD_SEED } from './config.js';

const KEY = 'neonhaul.save.v1';
const VERSION = 1;

function defaults() {
  return {
    v: VERSION,
    seed: WORLD_SEED,
    // §3.1.1's spawn state. economy.newState() says 250 and `fromSave()` does NOT override an
    // existing profile, so the starting balance has to be right here or a new player boots broke.
    credits: 250,
    lifetime: 0,
    tier: 1,
    // 'kite' is not a craft. §5.2's family is wisp/kestrel/lance/drayman/nocturne/mammoth and
    // `wisp` is the starter courier; the old id produced an undefined MAX_FWD the moment anything
    // read it. flight.js falls back anyway, but the profile should not be shipping a lie.
    craft: 'wisp',
    // §7.4.9's four lines. `{}` merged against a stored `{thrust:1}` produced a profile whose
    // upgrade keys existed on disk and not in the defaults, and merge() skips keys it has no base
    // for — so a bought upgrade silently vanished on reload.
    upgrades: { thrust: 0, cargo: 0, cell: 0, eff: 0 },
    // UNITS, not a fraction (§7.4.1). economy.fromSave() treats `undefined` as "full", so an old
    // save without this key charges up rather than booting flat.
    cellUnits: 100,
    stats: { jobs: 0, delivered: 0, failed: 0, distance: 0, playtime: 0,
      spentFuel: 0, tows: 0, haggles: 0 },
    settings: {
      quality: 'auto',        // auto | high | low
      flipSides: false,       // left/right control halves — the brief's "settings option to flip"
      music: true,
      sfx: true,
      radio: true,
      invertLook: false,
      // §6.5. P5 flipped this to the plan's `chase`, as P4's own note here instructed: craft.js
      // now puts a hull on the end of the 9.5 m boom, so the collision radius reads as the craft
      // it belongs to instead of as an invisible wall — and §3.10 #6 makes the player craft one
      // of the seven scale cues, which it can only be if it is in frame.
      camera: 'chase',        // chase | cockpit
      lookSens: 1.0,          // §6.2's YAW/PITCH_SENS multiplier, 0.5–2.0
      altBtn: 56,             // §6.5 altitude button size, 48 | 56 | 68 px
      fov: 62,                // §6.5, 58–78
      assists: 'on',          // on | reduced — reduced halves the proximity repulsion
      // §8.5's read-time multiplier and §8.6's map orientation. Both are §6.5 rows that could not
      // exist before the surfaces they govern did.
      chatterHold: 'normal',  // normal 1.0 | long 1.35 | very long 1.75
      mapRotate: true,        // §8.6 — rotate-with-heading (default) or fixed-north
    },
  };
}

let data = load();
let timer = 0;
let dirty = false;

function load() {
  const d = defaults();
  if (FLAG.nosave) return d;
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { return d; }
  if (!raw) return d;
  let parsed;
  // One corrupt entry must not brick the game; an unknown version is discarded, never merged.
  try { parsed = JSON.parse(raw); } catch { return d; }
  if (!parsed || typeof parsed !== 'object' || parsed.v !== VERSION) return d;
  return merge(d, parsed);
}

function merge(base, over) {
  for (const k of Object.keys(over)) {
    if (!(k in base)) continue;
    const b = base[k], o = over[k];
    if (b && typeof b === 'object' && !Array.isArray(b) && o && typeof o === 'object') merge(b, o);
    else if (typeof b === typeof o) base[k] = o;
  }
  return base;
}

export function S() { return data; }

export function save() {
  dirty = true;
  if (FLAG.nosave || timer) return;
  timer = setTimeout(() => { timer = 0; flush(); }, 2000);
}

export function flush() {
  if (FLAG.nosave || !dirty) return;
  dirty = false;
  if (timer) { clearTimeout(timer); timer = 0; }
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* quota or private mode */ }
}

export function reset() {
  data = defaults();
  if (!FLAG.nosave) { try { localStorage.removeItem(KEY); } catch {} }
  return data;
}

// URL overrides apply to the in-memory profile only; they are never persisted.
export function applyFlagOverrides() {
  if (FLAG.seed !== null) data.seed = FLAG.seed | 0;
  if (FLAG.tier !== null) data.tier = Math.max(1, FLAG.tier | 0);
  if (FLAG.credits !== null) data.credits = Math.max(0, FLAG.credits | 0);
}
