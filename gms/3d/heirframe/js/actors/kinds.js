import { buildElegant, civMats } from './kinds_civ.js';
import { buildRat, ratMats, RAT_DIMS, buildDrone, droneMats, DRONE_DIMS } from './kinds_enemy.js';
import {
  buildRental, rentalMats, RENTAL_DIMS, buildHeavy, heavyMats, BRAWLER_DIMS, ENFORCER_DIMS,
  buildGunner, buildGhost, buildSecurity, eleganceMats, GUNNER_DIMS, GHOST_DIMS, SECURITY_DIMS,
} from './kinds_frames.js';

const CIV_SLOTS = ['body', 'trim', 'mech', 'glow', 'eye'];

function civ(kind, extra = {}) {
  return {
    slots: CIV_SLOTS, variants: 4, height: 1.9, radius: 0.28, runSpeed: 4.2, scaleVar: 0.04,
    style: { elegance: kind === 'civ_worker' ? 0 : 0.6, arm: 0.8, heavy: kind === 'civ_worker' ? 0.15 : 0 },
    dims: (v) => (v % 2 ? { shoulder: 0.122, clavX: 0.04, hipX: 0.094 } : { shoulder: 0.138 }),
    build: (b, o) => buildElegant(b, {
      bust: o.variant % 2 === 1,
      layered: kind === 'civ_chrome' || o.variant >= 2,
      crest: kind === 'civ_worker' ? 0 : [0, 2, 1, 0][o.variant],
      lines: kind === 'civ_black' || (kind === 'civ_chrome' && o.variant === 1),
      worker: kind === 'civ_worker',
    }),
    mats: (o) => civMats(kind, o.tone),
    ...extra,
  };
}

export const KINDS = {
  civ_gold: civ('civ_gold'),
  civ_chrome: civ('civ_chrome'),
  civ_black: civ('civ_black'),
  civ_worker: civ('civ_worker', { runSpeed: 3.8 }),
  rental: {
    slots: ['body', 'paint', 'odd', 'mech', 'decal', 'glow', 'eye'], height: 1.8, radius: 0.3, runSpeed: 4.2,
    style: { jank: 1, tilt: 0.1, arm: 0.9 },
    dims: () => RENTAL_DIMS, build: buildRental, mats: rentalMats,
    sockets: { head: [0, 0.1, 0.02], back: [0, 0.12, -0.22] },
  },
  brawler: {
    slots: ['body', 'trim', 'mech', 'glow', 'eye'], height: 2.05, radius: 0.42, runSpeed: 3.8,
    style: { heavy: 1, arm: 0.75, dodge: 'dash', stance: 1.1 },
    dims: () => BRAWLER_DIMS, build: (b, o) => buildHeavy(b, o), mats: (o) => heavyMats(o.tier),
    sockets: { head: [0, 0.09, 0.02], back: [0, 0.16, -0.2], muzzle: ['handR', [0, -0.16, 0]] },
  },
  gunner: {
    slots: ['body', 'trim', 'mech', 'glow', 'eye'], height: 2.0, radius: 0.32, runSpeed: 4.0,
    style: { elegance: 0.3, arm: 0.85, carry: true },
    dims: () => GUNNER_DIMS, build: buildGunner, mats: (o) => eleganceMats('gunner', o.tier),
    sockets: { muzzle: ['handR', [-0.012, -0.62, 0.045]] },
  },
  ghost: {
    slots: ['body', 'trim', 'mech', 'glow', 'eye'], height: 1.95, radius: 0.28, runSpeed: 4.8,
    style: { elegance: 0.5, melee: 'slash', arm: 0.9 },
    dims: () => GHOST_DIMS, build: buildGhost, mats: (o) => eleganceMats('ghost', o.tier),
    sockets: { muzzle: ['foreArmR', [-0.042, -0.5, 0.02]] },
  },
  security: {
    slots: ['body', 'trim', 'mech', 'glow', 'eye'], height: 1.95, radius: 0.34, runSpeed: 4.2,
    style: { heavy: 0.2 },
    dims: () => SECURITY_DIMS, build: buildSecurity, mats: (o) => eleganceMats('security', o.tier),
    sockets: { muzzle: ['handR', [0, -0.4, 0]] },
  },
  enforcer: {
    slots: ['body', 'trim', 'mech', 'glow', 'eye'], height: 2.4, radius: 0.5, runSpeed: 3.4,
    style: { heavy: 1.3, arm: 0.6, dodge: 'dash', stance: 1.1, cadence: 0.9 },
    dims: () => ENFORCER_DIMS, build: (b, o) => buildHeavy(b, { ...o, enforcer: true }), mats: (o) => heavyMats(o.tier, true),
    sockets: { head: [0, 0.09, 0.02], back: [0, 0.18, -0.36], muzzle: ['handR', [0, -0.18, 0]] },
  },
  drone_scout: {
    rig: 'hover', slots: ['body', 'trim', 'mech', 'glow', 'eye'], height: 1.75, radius: 0.4, runSpeed: 5,
    style: {}, dims: () => DRONE_DIMS, build: buildDrone, mats: droneMats,
    sockets: { head: [0, 0, 0.09], muzzle: ['foreArmR', [0, 0, 0.17]], back: [0, 0.1, -0.1], handL: [0, 0, 0.1], handR: [0, 0, 0.1] },
  },
  scrap_rat: {
    rig: 'quad', slots: ['body', 'trim', 'mech', 'glow', 'eye'], variants: 1, height: 0.3, radius: 0.22, runSpeed: 3.6, scaleVar: 0.08,
    style: { cadence: 2.6, duty: 0.5 },
    dims: () => RAT_DIMS, build: buildRat, mats: (o) => ratMats(o.tone),
    sockets: { head: [0, 0.02, 0.04], muzzle: ['aux1', [0, -0.02, 0.07]], back: [0, 0.06, 0], handL: [0, -0.09, 0], handR: [0, -0.09, 0] },
  },
};

const FALLBACK = { rental: 'civ_worker', brawler: 'civ_chrome', gunner: 'civ_chrome', ghost: 'civ_black', drone_scout: 'civ_chrome', security: 'civ_chrome', enforcer: 'civ_black' };

export function kindOf(k) {
  if (KINDS[k]) return k;
  if (FALLBACK[k] && KINDS[FALLBACK[k]]) return FALLBACK[k];
  if (typeof k === 'string' && k.startsWith('boss_')) return KINDS.enforcer ? 'enforcer' : 'civ_black';
  return 'civ_chrome';
}
