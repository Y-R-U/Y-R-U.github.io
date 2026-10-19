// Archetype presets = starting templates for model files (rig + dims + builder + anim style + sockets).
// A model file spreads one of these and overrides what it needs, or brings its own build() entirely.
import { buildTank, TANK_DIMS } from './tank.js';
import { buildArcher, ARCHER_DIMS } from './archer.js';
import { buildWarrior, WARRIOR_DIMS } from './warrior.js';
import { buildMage, MAGE_DIMS } from './mage.js';
import { buildGunner, GUNNER_DIMS } from './gunner.js';
import { buildSpider, SPIDER_DIMS } from './spider.js';
import { buildTracked, TRACKED_DIMS } from './tracked.js';

// rotate p about x by a, then add off (matches PartBuilder.scope(off, [a,0,0])) — for sockets on weapons authored in a hold frame
export function fr(a, off, p) {
  const c = Math.cos(a), s = Math.sin(a);
  return [off[0] + p[0], off[1] + p[1] * c - p[2] * s, off[2] + p[1] * s + p[2] * c];
}

export const ARCH = {
  tank: {
    rig: 'biped', dims: TANK_DIMS, build: buildTank, height: 2.05, radius: 0.75, walkSpeed: 1.1, cadence: 0.75,
    style: { weapon: 'shield', heavy: 1, stance: 1.2 }, sockets: { muzzle: ['handR', [0, -0.25, 0.05]], core: [0, 0.1, 0.33], head: [0, 0.12, 0.2] },
  },
  archer: {
    rig: 'biped', dims: ARCHER_DIMS, build: buildArcher, height: 1.95, radius: 0.5, walkSpeed: 1.4, cadence: 0.95,
    style: { weapon: 'rifle', heavy: 0, stance: 1.35 }, sockets: { muzzle: ['handR', fr(1.55, [0, -0.08, 0], [0, 0.06, 0.38 + 1.3 * 0.66])], core: [0, 0.1, 0.18] },
  },
  warrior: {
    rig: 'biped', dims: WARRIOR_DIMS, build: buildWarrior, height: 1.95, radius: 0.6, walkSpeed: 1.3, cadence: 0.85,
    style: { weapon: 'blade', heavy: 0.5, stance: 1.25 }, sockets: { muzzle: ['handR', fr(0.8, [0, -0.07, 0], [0, 0, 0.95])], core: [0, 0.08, 0.26] },
  },
  brawler: {
    rig: 'biped', dims: WARRIOR_DIMS, build: buildWarrior, height: 1.95, radius: 0.62, walkSpeed: 1.25, cadence: 0.85, opts: { weapon: 'fists' },
    style: { weapon: 'fists', heavy: 0.8, stance: 1.25 }, sockets: { muzzle: ['handR', [0, -0.15, 0.05]], core: [0, 0.08, 0.26] },
  },
  mage: {
    rig: 'hover', dims: MAGE_DIMS, build: buildMage, height: 1.95, radius: 0.55, walkSpeed: 1.2, orbs: true,
    style: { weapon: 'orbs' }, sockets: { muzzle: ['aux3', [0, 0, 0]], core: [0, 0.1, 0.15] },
  },
  gunner: {
    rig: 'biped', dims: GUNNER_DIMS, build: buildGunner, height: 1.85, radius: 0.6, walkSpeed: 1.2, cadence: 0.85,
    style: { weapon: 'cannon', heavy: 0.7, stance: 1.4 }, sockets: { muzzle: ['handR', fr(1.5, [0, -0.06, 0], [0, 0.05, 0.42 + 1.05 * 0.62])], core: [0, 0.08, 0.22] },
  },
  spider: {
    rig: 'quad', dims: SPIDER_DIMS, build: buildSpider, height: 1.25, radius: 1.0, walkSpeed: 1.0, cadence: 1.1,
    style: { weapon: 'cannon' }, sockets: { muzzle: ['head', [0.22, 0.06, 0.88]], muzzleL: ['head', [-0.22, 0.06, 0.88]], core: [0, 0.32, -0.12], head: [0, 0.2, 0.1] },
  },
  tracked: {
    rig: 'tracked', dims: TRACKED_DIMS, build: buildTracked, height: 1.4, radius: 0.6, walkSpeed: 1.0,
    style: { weapon: 'fists', tracked: true }, sockets: { muzzle: ['aux0', [0, 1.02, 0.14]], core: [0, 0.12, 0.18] },
  },
};
export const ARCH_FOR = { biped: { tank: 'tank', archer: 'archer', mage: 'mage' }, hover: { tank: 'mage', archer: 'mage', mage: 'mage' }, quad: { tank: 'spider', archer: 'spider', mage: 'spider' }, tracked: { tank: 'tracked', archer: 'tracked', mage: 'tracked' } };
