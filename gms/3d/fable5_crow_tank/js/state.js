// Shared mutable game state. Systems read/write here; main.js owns the
// phase transitions.

import { HI_KEY } from './config.js';

export const state = {
  phase: 'title',        // title | playing | over
  time: 0,
  wave: 1,
  score: 0,
  kills: 0,
  best: parseInt(localStorage.getItem(HI_KEY), 10) || 0,
  armor: 100,
  lastHitAt: -99,
  shake: 0,
  waveDelay: 0,          // countdown between waves
  bossAlive: false,
};

export function saveBest() {
  if (state.score > state.best) {
    state.best = state.score;
    localStorage.setItem(HI_KEY, String(state.best));
  }
}
