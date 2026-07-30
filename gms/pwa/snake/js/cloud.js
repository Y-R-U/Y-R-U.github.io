// Snake-eee ↔ br8t account glue. The game keeps saving to localStorage exactly
// as before; syncLocalKeys mirrors the durable key to the player's account so
// coins, upgrades, skins and stats follow the player between devices.
//
// Nothing here is load-bearing: main.js imports it dynamically and swallows any
// failure, so offline / blocked / file:// just plays on locally.

import { syncLocalKeys } from "/lib/auth/localsync.js";

const GAME_ID = "snakeeee";

// One key holds everything, and all of it is durable: coins, upgrade levels,
// unlocked skins, career stats and settings. Snake-eee has no resume slot — a
// run is a single arena match and is never persisted — so there is nothing here
// that would drop a player into somebody else's half-played game.
const KEYS = ["snakeio_save"];

function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
}

/** Shown when two devices have genuinely different progress. Keep it to what hurts to lose. */
export function describe(s) {
    const save = s.snakeio_save || {};
    const stats = save.stats || {};
    const upgrades = save.upgrades || {};

    const out = [];
    const wins = stats.victories || 0;
    out.push(
        `${stats.gamesPlayed || 0} games · ${wins} win${wins === 1 ? "" : "s"}` +
        (stats.highScore ? ` · best ${Math.round(stats.highScore)} mass` : "")
    );

    const levels = Object.values(upgrades).reduce((a, b) => a + (b || 0), 0);
    out.push(`${save.coins || 0} coins · ${levels} upgrade level${levels === 1 ? "" : "s"}`);

    const skins = (save.unlockedSkins || []).length;
    out.push(
        `${skins} skin${skins === 1 ? "" : "s"} unlocked` +
        (stats.bestWinTime ? ` · fastest win ${formatTime(stats.bestWinTime)}` : "")
    );
    return out;
}

/** The layer's veto on the sign-in nudge, checked at the moment of showing. */
function canPester() {
    const active = document.querySelector(".screen.active");
    if (!active) return false;
    return active.id !== "game-screen";
}

export const cloud = syncLocalKeys({
    gameId: GAME_ID, keys: KEYS, describe,
    nudge: "callout",
    canPester,
});

/** Called from the death and victory screens — never mid-run. */
export function runFinished() {
    try { cloud.matchCompleted(); } catch (e) { /* never block the results screen */ }
}

/** Called when a menu screen comes up; the layer decides if a nudge is due. */
export function checkpoint() {
    try { cloud.checkpoint(); } catch (e) { /* a nudge is never worth an error */ }
}
