// Vibration. Entirely a listener — it subscribes to things that already happen
// and never asks the game to tell it anything, so nothing else in the codebase
// has to know phones exist.
//
// The scale matters more than the numbers: scraping a barrier has to feel
// *smaller* than being rammed, or the feedback stops carrying information.

import { on } from './bus.js';
import { profile } from './save.js';
import { state } from './state.js';

const CAN = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

let lastAt = 0;
let lastWeight = 0;

// One rule for everything: a stronger buzz can interrupt a weaker one, but a
// weaker one never stutters over the top of something big.
function buzz(pattern, weight = 1, minGap = 0.09) {
  if (!CAN || profile.settings.haptics === false) return;
  if (state.screen === 'race' && state.paused) return;
  const now = state.time;
  if (now - lastAt < minGap && weight <= lastWeight) return;
  lastAt = now;
  lastWeight = weight;
  try { navigator.vibrate(pattern); } catch (e) { /* blocked by the browser */ }
}

export function initHaptics() {
  if (!CAN) return;

  // --- driving ------------------------------------------------------------
  on('car:railHit', ({ car, impact }) => {
    if (!car.isPlayer) return;
    buzz(Math.round(8 + Math.min(impact, 28) * 1.4), 1);
  });
  on('car:railScrape', () => buzz(6, 0.4, 0.14));
  on('car:land', ({ car, impact }) => {
    if (car.isPlayer) buzz(Math.round(10 + Math.min(impact, 30)), 1.2);
  });
  on('car:scrape', () => buzz(5, 0.3, 0.2));

  // --- the parts that hurt -------------------------------------------------
  on('race:contact', ({ a, b, closing }) => {
    if (!a.isPlayer && !b.isPlayer) return;
    const heavy = Math.min(1, closing / 22);
    buzz([Math.round(18 + heavy * 46), 24, Math.round(10 + heavy * 34)], 2 + heavy);
  });
  on('attack:hit', ({ attacker, target, skill }) => {
    if (attacker.isPlayer) buzz([26, 30, 44], 2.4);
    else if (target && target.isPlayer) buzz([40, 26, 60, 26, 40], 3);
  });
  on('car:wreck', ({ car, by }) => {
    if (car.isPlayer) buzz([60, 40, 90, 40, 140], 5);
    else if (by && by.isPlayer) buzz([30, 40, 70], 3.4);
  });
  on('car:tumble', ({ car, impact }) => {
    if (car.isPlayer && impact > 5) buzz(Math.round(20 + impact * 2), 2.6, 0.16);
  });

  // --- the game telling you something --------------------------------------
  on('steward:investigating', () => buzz([14, 60, 14, 60, 14], 2));
  on('steward:verdict', ({ cleared }) => buzz(cleared ? [20, 50, 20] : [90, 50, 90], 2.6));
  on('race:playerFinish', () => buzz([40, 60, 40, 60, 120], 4));
  on('boost:denied', () => buzz([8, 40, 8], 0.6, 0.6));
}
