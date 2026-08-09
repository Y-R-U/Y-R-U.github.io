/* SUNDERFALL UI — the model the HUD renders.
 *
 * The sim owns the truth. This is a MIRROR: the sim pushes into it (`ui.setStats`, bus events) and
 * the HUD reads it. When nothing is driving it — the test harness, or before sim/ lands — the
 * mirror simulates itself (focus regen, cooldowns ticking down) so the HUD is never dead.
 *
 * Nothing here allocates once it is built. The slot array and the settings object are stable
 * references that other modules may hold.
 */

const SLOT_UNLOCK = [1, 3, 7, 12, 18];   // DESIGN.md §2

export const DEFAULT_SETTINGS = {
  master: 0.8,
  music: 0.7,
  sfx: 0.9,
  shake: 1.0,          // 0..1.5 multiplier on R.fx.shake
  damageNumbers: true,
  flashes: true,       // reduce full-screen flashes / chroma
  showFps: false,
  leftHanded: false,   // mirror the portrait control layout
};

const KEY = 'sunderfall.settings.v1';

export function loadSettings() {
  const s = Object.assign({}, DEFAULT_SETTINGS);
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw);
      for (const k in DEFAULT_SETTINGS) if (j[k] !== undefined) s[k] = j[k];
    }
  } catch { /* private mode, or a corrupt blob — defaults are fine */ }
  return s;
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* nothing to do */ }
}

export function createState() {
  const slots = [];
  for (let i = 0; i < 5; i++) {
    slots.push({
      i,
      spellId: null,
      spell: null,
      rank: 1,
      cd: 0,            // seconds remaining
      cdMax: 0,
      unlockLevel: SLOT_UNLOCK[i],
      manual: i === 0,
      // presentation-only, driven by the HUD
      readyAt: -99,     // real-time stamp of the moment it became ready
      castAt: -99,
      denyAt: -99,
      pressed: false,
      hot: 0,           // 0..1 hover/press glow
    });
  }

  return {
    // resources
    hp: 100, maxHp: 100, hpGhost: 100,
    focus: 100, maxFocus: 100,
    focusRegen: 12,        // per second, DESIGN.md §2
    focusHoldUntil: 0,     // sim time at which regen resumes after a manual cast
    focusDrain: 0,         // measured per-second spend from auto-casts, for the readout

    // progression
    level: 1, xp: 0, xpNext: 40,
    shards: 0,

    // run stats, shown on death
    kills: 0, broken: 0, runTime: 0,

    // combat context
    inCombat: false,
    boss: null,            // {name, subtitle, hp, maxHp, ghost, phases:[0.66,0.33], hitAt}

    slots,
    known: [],             // spell ids the player has learned
    ranks: Object.create(null),

    // ownership: true once anything external has pushed real numbers in
    driven: false,
    simTime: 0,

    unlockLevelFor(i) { return SLOT_UNLOCK[i]; },
    slotUnlocked(i) { return this.level >= SLOT_UNLOCK[i]; },
  };
}

/** XP required to go from `level` to the next. Fast early, long tail; ~24 levels in one run. */
export function xpForLevel(level) {
  return Math.round(34 + level * level * 3.1 + level * 14);
}

export { SLOT_UNLOCK };
