// ============================================================
//  SHARED GAME STATE
// ============================================================

import {
  BASE_TONGUE_LENGTH, BASE_TONGUE_SPEED, BASE_TIMER,
  BASE_SWING_POWER, BASE_MAGNET_RADIUS,
} from './config.js';

export const game = {
  state: 'menu', // menu, playing, shop, gameover, levelcomplete, tutorial
  level: 1,
  coins: 0,
  totalCoins: 0,
  timer: BASE_TIMER,
  lastTime: 0,
  tutorialShown: false,
};

export const camera = { x: 0, y: 0 };

export const mouse = { x: 0, y: 0, down: false };

export const upgrades = {
  tongueLength: 0,
  timerBoost: 0,
  swingPower: 0,
  tongueSpeed: 0,
  magnetRadius: 0,
};

export const world = {
  anchors: [],
  collectibles: [],
  flyTarget: null,
  platforms: [],
  levelWidth: 0,
};

export const shake = { timer: 0, intensity: 0 };
export function tickShake(dt) { if (shake.timer > 0) shake.timer -= dt; }

export function getEffective(stat) {
  switch (stat) {
    case 'tongueLength': return BASE_TONGUE_LENGTH + upgrades.tongueLength * 20;
    case 'timerBoost': return BASE_TIMER + upgrades.timerBoost * 5;
    case 'swingPower': return BASE_SWING_POWER + upgrades.swingPower * 0.1;
    case 'tongueSpeed': return BASE_TONGUE_SPEED + upgrades.tongueSpeed * 1.5;
    case 'magnetRadius': return BASE_MAGNET_RADIUS + upgrades.magnetRadius * 15;
  }
}

export function resetGame() {
  game.level = 1;
  game.coins = 0;
  game.totalCoins = 0;
  Object.keys(upgrades).forEach(k => upgrades[k] = 0);
}
