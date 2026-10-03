import { LINES } from './lines.js?v=20261004a';

const first = (d) => LINES.find((l) => l.district === d).baseCost;

export const DISTRICTS = [
  { id: 'oldtown', name: 'Old Town', emoji: '🏘️', permitCost: 0, needContracts: 0, verb: null, verbText: '' },
  { id: 'suburbs', name: 'Suburbs', emoji: '🏡', permitCost: first('suburbs') * 1.5, needContracts: 3, verb: 'deliveries', verbText: 'Couriers cross town · tap one for a tip' },
  { id: 'harbour', name: 'Harbour', emoji: '⚓', permitCost: first('harbour') * 1.5, needContracts: 3, verb: 'supplyLinks', verbText: 'Link a boat line to Fish & Chips · ×1.5' },
  { id: 'downtown', name: 'Downtown', emoji: '🏙️', permitCost: first('downtown') * 1.5, needContracts: 3, verb: 'nightShift', verbText: 'Two lines earn ×2 from 18:00 to 06:00' },
];

export const COURIER = { gap: [25, 45], life: 12, rewardSec: 6 };
export const SUPPLY = { to: 'fishchips', from: ['ferry', 'boatyard'], mult: 1.5, costMult: 2, loopSec: 24 };
export const NIGHT = { from: 18, to: 6, mult: 2, slots: 2 };
