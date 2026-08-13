// Spell definitions. `shape` is the key js/game/cast.js looks up in world/spell.js SHAPES.
// SYSTEMS.md §4.5–4.6.

import { GCD } from './combat.js';

const deg = d => d * Math.PI / 180;

export const SPELLS = {
  bolt_light: { school: 'kindle', tier: 1, cost: 8, coef: 1.00, cd: 0, shape: 'bolt_light', factionId: 'light',
                cone: deg(45), range: 26, onImpact: { flare: { radius: 2.2, loseTarget: 1.5 } }, killRefund: 0.25 },
  bolt_dark:  { school: 'kindle', tier: 1, cost: 9.2, coef: 1.00, cd: 0, shape: 'bolt_dark', factionId: 'dark',
                cone: deg(25), range: 26, onImpact: { sink: { radius: 1.6, pull: 1.2, over: 0.35 } },
                dot: { fraction: 0.18, seconds: 4, refresh: true }, feed: 0.12 },
  cull_snap:  { school: 'cull', tier: 1, cost: 6, coef: 0.85, cd: 0, shape: 'bolt_light', cone: deg(60), range: 7 },
  brace:      { school: 'ward', tier: 1, cost: 12, coef: 0, cd: 0, shape: 'brace', seconds: 4, incoming: -0.40, blocksKindle: true },
  root:       { school: 'ward', tier: 2, cost: 18, coef: 0, cd: 12, shape: 'brace', seconds: 2.5, radius: 3 },
  line_cast:  { school: 'line', tier: 1, cost: 5, coef: 0, cd: 0, shape: 'line' },
  forage_pulse:{ school: 'forage', tier: 1, cost: 7, coef: 0, cd: 0, shape: 'pulse', radius: 2 },
  hearth_hold:{ school: 'hearth', tier: 1, cost: 9, coef: 0, cd: 0, shape: 'bloom' },
  mend_stitch:{ school: 'mend', tier: 1, cost: 14, coef: 0, cd: 0, shape: 'stitch', reagent: 'thread' },
  barter_read:{ school: 'barter', tier: 1, cost: 6, coef: 0, cd: 0, shape: 'read' },
  set_strike: { school: 'setting', tier: 1, cost: 11, coef: 0, cd: 0, shape: 'strike' },
  dim:        { school: 'glamour', tier: 1, cost: 10, coef: 0, cd: 20, shape: 'veil', loseAt: 12 },
  hush:       { school: 'glamour', tier: 2, cost: 16, coef: 0, cd: 30, shape: 'veil', seconds: 20 },
  mask:       { school: 'glamour', tier: 3, cost: 22, coef: 0, cd: 45, shape: 'veil' },
  graft:      { school: 'glamour', tier: 4, cost: 30, coef: 0, cd: 20, cdAfterBreak: 120, shape: 'veil',
                channel: 3.0, uninterruptibleAfter: 1.0, consumes: 'hearth_ash', quest: 'N07' },

  field_quicken: { school: 'kindle', tier: 1, cost: 20, coef: 0, cd: 8, shape: 'field', factionId: 'neutral',
                   radius: 3, seconds: 6, gcd: 0.30, moveMul: 1.35 },
  field_glut:    { school: 'forage', tier: 1, cost: 20, coef: 0, cd: 8, shape: 'field', factionId: 'neutral',
                   radius: 3, seconds: 6, damageMul: 1.20, respawnInstant: true },
  field_still:   { school: 'ward', tier: 1, cost: 20, coef: 0, cd: 8, shape: 'field', factionId: 'neutral',
                   radius: 3, seconds: 6, focusMul: 3, incomingMul: 0.60 },

  split_bolt: { school: 'kindle', tier: 2, cost: 14, coef: 0.60, targets: 2, cd: 0, shape: 'bolt_light' },
  ember:      { school: 'kindle', tier: 2, cost: 16, coef: 1.00, cd: 0, shape: 'bolt_light', ground: { radius: 2, dps: 6, seconds: 4 } },
  cinderfall: { school: 'kindle', tier: 4, cost: 46, coef: 3.00, cd: 12, shape: 'bolt_light', hold: 1.2, radius: 5 },
  bulwark:    { school: 'ward', tier: 4, cost: 40, coef: 0, cd: 30, shape: 'brace', radius: 3 },
  deep_call:  { school: 'line', tier: 4, cost: 30, coef: 0, cd: 300, shape: 'line', guaranteesRarest: true },
  bloom:      { school: 'forage', tier: 4, cost: 34, coef: 0, cd: 90, shape: 'pulse', radius: 8 },
  bind:       { school: 'cull', tier: 3, cost: 28, coef: 0, cd: 180, shape: 'bolt_light', seconds: 45 },
  scatter:    { school: 'cull', tier: 2, cost: 0, coef: 0, cd: 0, shape: 'bolt_light', onKill: true, radius: 5, seconds: 2 },
  brood_sense:{ school: 'cull', tier: 4, cost: 24, coef: 0, cd: 60, shape: 'pulse', markedDamage: 0.25 },
  feast:      { school: 'hearth', tier: 4, cost: 36, coef: 0, cd: 60, shape: 'bloom', radius: 6 },
  reforge:    { school: 'mend', tier: 4, cost: 40, coef: 0, cd: 0, shape: 'stitch', everyGameDays: 3 },
  shift:      { school: 'setting', tier: 3, cost: 26, coef: 0, cd: 20, shape: 'strike', seconds: 20 },
  quarry:     { school: 'setting', tier: 4, cost: 44, coef: 0, cd: 120, shape: 'strike', radius: 10 },
};

export const TIER_GATES = [
  { tier: 1, school: 1,  grasp: 0 },
  { tier: 2, school: 7,  grasp: 48 },
  { tier: 3, school: 12, grasp: 96 },
  { tier: 4, school: 17, grasp: 128, standing: 'sworn' },
];

export function tierUnlocked(tier, schoolLevel, grasp, standingBand) {
  const g = TIER_GATES.find(t => t.tier === tier);
  if (!g) return false;
  if (schoolLevel < g.school || grasp < g.grasp) return false;
  return !g.standing || standingBand === g.standing;
}

export function canCast(id, { schools, grasp, standingBand, questsDone = [] }) {
  const s = SPELLS[id];
  if (!s) return false;
  if (s.quest && !questsDone.includes(s.quest)) return false;
  return tierUnlocked(s.tier, schools[s.school] || 1, grasp, standingBand);
}

export const factionBolt = faction => faction === 'dark' ? SPELLS.bolt_dark : SPELLS.bolt_light;

export const focusCost = (spell, { charge = 1, guttered = false, factionCostMul = 1 } = {}) =>
  spell.cost * charge * factionCostMul * (guttered ? 1.6 : 1);

export const castsPerSecond = (gcd = GCD) => 1 / gcd;
