// Sudoku ↔ br8t account glue. The game keeps saving to localStorage exactly as
// before; syncLocalKeys mirrors the durable keys to the player's account.
//
// Nothing here is load-bearing: boot-cloud.js imports it dynamically and
// swallows any failure, so offline / blocked / file:// just plays on locally.

import { syncLocalKeys } from "/lib/auth/localsync.js";

const GAME_ID = "sudoku";

// Durable state only. `sudokuGame3` — the board in play — is deliberately NOT
// here: picking up a half-solved grid on another device hands the player
// someone else's train of thought, and the reload that adopting a save triggers
// would land mid-puzzle. Wins, best times and settings travel; the puzzle
// doesn't.
const KEYS = [
  "sudokuStats",    // per-difficulty wins, best times, hints used
  "sudokuAudio",    // music / sound prefs
  "sudokuHintBtn",  // whether the hint button is shown
];

const LEVELS = [
  ["basic", "Basic"], ["simple", "Simple"], ["easy", "Easy"],
  ["medium", "Medium"], ["hard", "Hard"], ["crazy", "Crazy"],
];

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60), s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// Shown when two devices have genuinely different progress and the player has
// to pick one. Keep it to what actually hurts to lose.
export function describe(s) {
  const stats = s.sudokuStats || {};
  const out = [];

  let wins = 0;
  for (const [level] of LEVELS) {
    const e = stats[level];
    wins += (typeof e === "number" ? e : (e && e.wins) || 0);
  }
  out.push(`${wins} puzzle${wins === 1 ? "" : "s"} solved`);

  const bests = LEVELS
    .filter(([level]) => stats[level] && stats[level].bestMs != null)
    .map(([level, label]) => `${label} ${formatTime(stats[level].bestMs)}`);
  out.push(bests.length ? `Best: ${bests.slice(-2).join(" · ")}` : "No best times yet");

  const hardest = [...LEVELS].reverse().find(([level]) => {
    const e = stats[level];
    return (typeof e === "number" ? e : (e && e.wins) || 0) > 0;
  });
  if (hardest) out.push(`Hardest cleared: ${hardest[1]}`);
  return out;
}

// The layer's veto on the sign-in nudge, checked at the moment of showing.
//
// Sudoku is the exception to "menus and results screens only": it has neither.
// The grid is up from the first frame to the last, so a rule that waited for a
// menu would mean this game never asks at all. A pill in the far corner of a
// still board is not an interruption — the one moment that is, is choosing a
// digit, so that's the only thing we hold off for.
function canPester() {
  const popup = document.getElementById("popup");
  return !popup || !popup.classList.contains("active");
}

export const cloud = syncLocalKeys({
  gameId: GAME_ID, keys: KEYS, describe,
  nudge: "callout",
  canPester,
});

/** Called from the win message — never mid-puzzle. */
export function puzzleFinished() {
  try { cloud.matchCompleted(); } catch (e) { /* never block the win screen */ }
}
