// Music catalogue. start/end are loop points in seconds (skip quiet intros, crossfade before
// abrupt or silent tails). gain evens out loudness between sources.
export const TRACKS = {
  title_chrome: { file: 'title_chrome.mp3', start: 0, end: 117.9, gain: 1.15 },
  menu: { file: 'menu.mp3', start: 1.3, end: 209.3, gain: 0.8 },
  cruise_a: { file: 'cruise_a.mp3', start: 0.9, end: 211.5, gain: 0.85 },
  cruise_day: { file: 'cruise_day.mp3', start: 0.5, end: 212.8, gain: 0.85 },
  cruise_b: { file: 'cruise_b.mp3', start: 0, end: 251.2, gain: 0.75 },
  docked: { file: 'docked.mp3', start: 0, end: 163.4, gain: 0.8 },
  combat_chrome: { file: 'combat_chrome.mp3', start: 0, end: 116.5, gain: 1.05 },
  combat_drift: { file: 'combat_drift.mp3', start: 0, end: 117.8, gain: 1.05 },
  boss_chrome: { file: 'boss_chrome.mp3', start: 0.7, end: 117.5, gain: 1.05 },
  boss_final: { file: 'boss_final.mp3', start: 0, end: 117.5, gain: 1.0 },
  comms: { file: 'net.mp3', start: 0, end: 24.4, gain: 0.6 }, // radio murmur bed, not music
};

export const STINGS = {
  win: 'sting_win.mp3',
  lose: 'sting_lose.mp3',
};

// Game state -> playlist. Consecutive loops rotate through the list.
export const STATES = {
  menu: ['title_chrome', 'menu'],
  explore: ['cruise_a', 'cruise_day'],
  stealth: ['cruise_b'],
  combat: ['combat_chrome', 'combat_drift'],
  warehouse: ['docked'],
  boss: ['boss_chrome'],
  boss_final: ['boss_final'],
  story: ['menu'],
  undercity: ['cruise_b', 'cruise_day'],
  comms: ['comms'],
};
