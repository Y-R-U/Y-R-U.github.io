import { PLAYER_NAME_KEY } from './config.js';
import { choose, shuffle } from './utils.js';

export const TANK_NAMES = [
  'Vega', 'Rook', 'Nova', 'Mako', 'Cipher', 'Juno', 'Sable', 'Orion', 'Blitz', 'Echo',
  'Ion', 'Comet', 'Rift', 'Atlas', 'Flint', 'Ghost', 'Viper', 'Kestrel', 'Onyx', 'Pulse',
  'Rivet', 'Torque', 'Vector', 'Halo', 'Switch', 'Fable', 'Ranger', 'Havoc'
];

export function getStoredPlayerName() {
  const stored = window.localStorage.getItem(PLAYER_NAME_KEY);
  return sanitizeName(stored) || choose(TANK_NAMES);
}

export function savePlayerName(name) {
  window.localStorage.setItem(PLAYER_NAME_KEY, sanitizeName(name) || 'Player');
}

export function sanitizeName(name) {
  return String(name || '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 18);
}

export function createBattleNames(playerName, aiCount) {
  const used = new Set([playerName.toLowerCase()]);
  const pool = shuffle(TANK_NAMES).filter((name) => !used.has(name.toLowerCase()));
  const names = [];
  for (let i = 0; i < aiCount; i += 1) {
    names.push(pool[i] || `Tank ${i + 2}`);
  }
  return names;
}
