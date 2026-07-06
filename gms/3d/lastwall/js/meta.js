// LASTWALL — the permanent layer: Serum bank, upgrade grid, gate checkpoints,
// bests, save/load. Everything here survives death; that's the roguelite deal.
import { SAVE_KEY, MODES } from './config.js';

export const UPGRADES = [
  { id: 'vitality',  name: 'VITALITY',    desc: '+14 max HP per rank',            max: 5, cost: r => 60 + r * 70 },
  { id: 'muscle',    name: 'MUSCLE',      desc: '+8% damage per rank',            max: 5, cost: r => 80 + r * 90 },
  { id: 'swift',     name: 'SWIFT',       desc: '+5% move speed per rank',        max: 3, cost: r => 90 + r * 110 },
  { id: 'meleeTier', name: 'FORGE MELEE', desc: 'Upgrade starter melee weapon',   max: 2, cost: r => 220 + r * 380 },
  { id: 'gunTier',   name: 'FORGE GUN',   desc: 'Upgrade starter sidearm',        max: 2, cost: r => 220 + r * 380 },
  { id: 'rerolls',   name: 'SECOND LOOK', desc: '+1 draft reroll per rank',       max: 2, cost: r => 150 + r * 250 },
  { id: 'boostDur',  name: 'SLOW BURN',   desc: '+20% boost duration per rank',   max: 3, cost: r => 100 + r * 120 },
  { id: 'capacitor', name: 'CAPACITOR',   desc: 'Supers charge 15% faster per rank', max: 3, cost: r => 130 + r * 150 },
  { id: 'harvest',   name: 'HARVEST',     desc: '+15% serum gained per rank',     max: 3, cost: r => 110 + r * 130 },
  { id: 'secondWind',name: 'SECOND WIND', desc: 'Once per run: survive death at 40 HP', max: 1, cost: () => 900 },
];

const DEFAULT = {
  serum: 0,
  ups: {},           // id → rank
  storyBest: 0,      // highest story level COMPLETED
  endlessBest: 0,    // highest endless level reached
  seenIntro: false,
  version: 1,
};

let S = load();

function load() {
  if (MODES.nosave) return { ...DEFAULT, ups: {} };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch (e) { /* corrupted → fresh */ }
  return { ...DEFAULT, ups: {} };
}

export function save() {
  if (MODES.nosave) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* private mode */ }
}

export const meta = {
  get serum() { return S.serum; },
  get storyBest() { return S.storyBest; },
  get endlessBest() { return S.endlessBest; },
  get seenIntro() { return S.seenIntro; },
  set seenIntro(v) { S.seenIntro = v; save(); },

  up(id) { return S.ups[id] || 0; },
  canBuy(u) { return this.up(u.id) < u.max && S.serum >= u.cost(this.up(u.id)); },
  buy(u) {
    if (!this.canBuy(u)) return false;
    S.serum -= u.cost(this.up(u.id));
    S.ups[u.id] = this.up(u.id) + 1;
    save(); return true;
  },
  addSerum(n) { S.serum += Math.round(n); save(); },
  completeStory(n) { if (n > S.storyBest) { S.storyBest = n; save(); } },
  reachEndless(n) { if (n > S.endlessBest) { S.endlessBest = n; save(); } },

  // gate checkpoints: story → after completing level 10k you may start at 10k+1;
  // endless → x10 below best reached (34 → 30)
  storyGates() {
    const g = [1];
    for (let k = 10; k <= Math.min(90, S.storyBest); k += 10) g.push(k + 1);
    return g;
  },
  endlessGates() {
    const g = [1];
    const top = Math.floor(S.endlessBest / 10) * 10;
    for (let k = 10; k <= top; k += 10) g.push(k);
    return g;
  },

  // starting run stats derived from upgrades
  runMods() {
    return {
      dmg: 1 + this.up('muscle') * .08,
      atk: 1, kb: 1,
      spd: 1 + this.up('swift') * .05,
      hpAdd: this.up('vitality') * 14,
      lifesteal: 0, crit: 0,
      boostDur: 1 + this.up('boostDur') * .2,
      superRate: 1 + this.up('capacitor') * .15,
      serum: 1 + this.up('harvest') * .15,
      rerolls: 3 + this.up('rerolls'),
      secondWind: this.up('secondWind') > 0,
    };
  },
};
