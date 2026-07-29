// Paper Ant ↔ br8t account glue. The game keeps saving to localStorage exactly
// as before; syncLocalKeys mirrors those keys to the player's account.
//
// Nothing here is load-bearing: main.js imports it dynamically and swallows any
// failure, so an offline/blocked/file:// load just plays on with a local save.

import { syncLocalKeys } from "/lib/auth/localsync.js";

const GAME_ID = "paperant";

// Only durable state. The level currently being played lives in Game's module
// scope and is never written to localStorage, so there is nothing in-progress
// to accidentally carry across devices.
const KEYS = [
  "paperant_progress",   // per-level unlocked/completed/stars/bestTime
  "paperant_powerups",   // consumable inventory
  "paperant_rewards",    // daily streak, last claim, last challenge (local dates)
  "paperant_audio",      // sfx/music/vibrate prefs
];

const POWERUP_LABELS = {
  magnet: "magnet", pencil: "thick pencil", freeze: "freeze",
  ink: "ink flask", time: "extra time",
};

export function describe(s) {
  const progress = Array.isArray(s.paperant_progress) ? s.paperant_progress : [];
  const powerups = s.paperant_powerups || {};
  const rewards = s.paperant_rewards || {};
  const out = [];

  const done = progress.filter(l => l && l.completed).length;
  const stars = progress.reduce((sum, l) => sum + ((l && l.stars) || 0), 0);
  out.push(`${done} of 100 levels`);
  out.push(`${stars} star${stars === 1 ? "" : "s"}`);

  const items = Object.entries(powerups)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${POWERUP_LABELS[k] || k}`);
  out.push(items.length ? items.join(" · ") : "No power-ups");

  if (rewards.streak) out.push(`${rewards.streak}-day reward streak`);
  return out;
}

export const cloud = syncLocalKeys({ gameId: GAME_ID, keys: KEYS, describe });

/** Called from the level-complete screen — never mid-level. */
export function levelFinished() {
  try { cloud.matchCompleted(); } catch (e) { /* never block the results screen */ }
}
