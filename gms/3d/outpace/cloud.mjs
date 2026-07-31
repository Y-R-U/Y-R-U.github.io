// Outpace ↔ br8t account glue.
//
// The game keeps persisting to localStorage exactly as it always has;
// syncLocalKeys mirrors the durable keys up to users/{uid}/games/outpace and
// pulls a newer save back down. Nothing in here is load-bearing: game.mjs
// imports it dynamically and swallows any failure, so offline / blocked /
// file:// simply plays on with the local save and no avatar.

import { syncLocalKeys } from "/lib/auth/localsync.js";

const GAME_ID = "outpace";

// Durable only.
//
//   outpace-save-v2      career: credits, debt, route number, upgrade levels,
//                        lifetime stats, story/quest board. All between-runs
//                        state — the game clears it of nothing mid-flight and
//                        writes it on dock, purchase and loss.
//   outpace-settings-v1  sound / music / haptics.
//   outpace-best         best score, a bare number.
//
// There is deliberately nothing else. Outpace holds the in-progress run purely
// in memory (state.routeDistance, shield, heat, the live asteroid field) and
// never persists it, so there is no resume slot that could hand another device
// a half-flown route — which is exactly the rule for this repo. `outpace-best`
// is listed separately from the career blob because the game writes it on its
// own, outside saveProgress().
//
// `void-cockpit-best` (the pre-rename best score) is NOT listed: game.mjs folds
// it into `outpace-best` once at boot and deletes it, so only the current key
// ever reaches the account.
const KEYS = [
  "outpace-save-v2",
  "outpace-settings-v1",
  "outpace-best",
];

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const group = (v) => Math.round(num(v)).toLocaleString("en-GB");

// Shown when two devices have genuinely different progress and the player has
// to choose. Lead with what actually hurts to lose.
export function describe(s) {
  const save = s["outpace-save-v2"] || {};
  const stats = save.stats || {};
  const best = num(s["outpace-best"]);
  const out = [];

  const route = Math.max(1, Math.round(num(save.route) || 1));
  const runs = Math.round(num(stats.runs));
  out.push(`Route ${route} · ${runs} run${runs === 1 ? "" : "s"} flown`);

  out.push(`${group(save.credits)} credits, ${group(save.debt)} debt · best score ${group(best)}`);

  const levels = Object.values(save.upgrades || {}).reduce((t, v) => t + Math.max(0, Math.round(num(v))), 0);
  const quests = save.story && save.story.quests ? Object.keys(save.story.quests).length : 4;
  const done = Array.isArray(save.story?.completed) ? save.story.completed.length : 0;
  out.push(`${levels} upgrade level${levels === 1 ? "" : "s"} · ${done}/${quests} leads closed`);

  return out;
}

// The layer's veto on the sign-in nudge, checked at the moment of showing.
// Flying is the only thing we don't interrupt: the title menu, the results card
// and the station lounge are all screens the player is reading.
const SAFE = ["menu", "result", "station"];

function canPester() {
  return SAFE.some((id) => {
    const el = document.getElementById(id);
    return el && !el.classList.contains("hidden");
  });
}

export const cloud = syncLocalKeys({
  gameId: GAME_ID, keys: KEYS, describe,
  nudge: "callout",
  canPester,
});

/** Called once per finished run, from the results screen / dock — never mid-flight. */
export function runFinished() {
  try { cloud.matchCompleted(); } catch { /* never block the results screen */ }
}
