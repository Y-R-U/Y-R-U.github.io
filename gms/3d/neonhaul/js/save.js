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
    //
    // §S2-E — the player does NOT start in `wisp`. They start in their parents' borrowed
    // `kestrel`, which is a TIER 2 hull on a tier 1 licence. The addendum's reasoning, and it is
    // load-bearing rather than colour: *"A free tier-1 craft is not worth $50k, an arm, or a
    // shakedown."* The mob's interest is only credible against a vehicle worth taking, and the
    // player's own scripted line — *"I shouldn't even be flying this"* — is only true if it is
    // above their licence. `kestrel` and not `nocturne`: S2-D measured the early-economy effect at
    // +3.9 % vs +13.0 % median gross, and tools/sim_s2e.mjs measured the arc effect — on a
    // `nocturne` a pilot who spends on upgrades NEVER holds the debt at any window, because
    // upgrades are priced off a 20,000 list.
    craft: 'kestrel',
    // It is not theirs. ranks.assetValue() returns 0 for a borrowed hull, which is what stops a
    // brand-new player being booted several standing rungs up the ladder before the story starts.
    // It stays true through act two, where every hull is a hire.
    borrowed: true,
    // Story flags. ranks.js reads them off the economy state; economy.fromSave/toSave do not carry
    // them because they are not economy, so save.js is where they persist.
    flags: [],
    // §S2-E's arc. Shape and defaults live in js/story.js — this is only the persisted half, and
    // `null` means "a profile written before the story existed", which fromSave() treats as a
    // brand-new arc rather than as a corrupt one.
    story: null,
    // §7.4.9's four lines. `{}` merged against a stored `{thrust:1}` produced a profile whose
    // upgrade keys existed on disk and not in the defaults, and merge() skips keys it has no base
    // for — so a bought upgrade silently vanished on reload.
    // S2-F added `auto`. Level 0 is not "no autopilot" — it is the DRONE, the very slow
    // lane-following pilot every craft ships with; the three paid rungs are speed and route sense.
    upgrades: { thrust: 0, cargo: 0, cell: 0, eff: 0, auto: 0 },
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
      // §S2 — COCKPIT is the default view. It shipped as `chase`, and the consequence was that
      // the whole instrument panel §8 exists to build was behind a settings row nobody opened:
      // Aaron played the shipped build without ever seeing the dashboard. The switch is now an
      // on-screen button (`#btn-view`), not a cog row.
      camera: 'cockpit',      // cockpit | chase
      lookSens: 1.0,          // §6.2's YAW/PITCH_SENS multiplier, 0.5–2.0
      altBtn: 56,             // §6.5 altitude button size, 48 | 56 | 68 px
      fov: 62,                // §6.5, 58–78
      assists: 'on',          // on | reduced — reduced halves the proximity repulsion
      // §8.5's read-time multiplier and §8.6's map orientation. Both are §6.5 rows that could not
      // exist before the surfaces they govern did.
      chatterHold: 'normal',  // normal 1.0 | long 1.35 | very long 1.75
      mapRotate: true,        // §8.6 — rotate-with-heading (default) or fixed-north
      // §S2 — the FPS / simple-stats row in the cog. It turns the EXISTING ?perf overlay on; it
      // is not a second overlay, because two surfaces answering the same question is how they
      // start giving two answers.
      stats: false,
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

// §S2-E — two keys do not merge, they REPLACE: `story` has a `null` base (so `typeof b === typeof o`
// is true for any object and merge would then walk a null) and `flags` is an array, which the
// object branch would recurse into by index. Both are owned end-to-end by one module that already
// validates what it reads back, so a whole-value copy is both correct and the honest description
// of what is happening.
const REPLACE = new Set(['story', 'flags']);

function merge(base, over) {
  for (const k of Object.keys(over)) {
    if (!(k in base)) continue;
    const b = base[k], o = over[k];
    if (REPLACE.has(k)) { if (o !== undefined) base[k] = o; continue; }
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
