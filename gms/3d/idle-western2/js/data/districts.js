// Blocks of Dribble Creek, in unlock order. Each later block is opened by a Deed (the permit): the cost below plus
// `needContracts` finished Town Council Demands from the previous block. Railroad End is v1.1 (append it here).
import { LINES } from './lines.js?v=20261004h';

const first = (d) => LINES.find((l) => l.district === d).baseCost;

export const DISTRICTS = [
  { id: 'lower', name: 'Lower Street', emoji: '🌵', permitCost: 0, needContracts: 0, verb: null, verbText: '' },
  { id: 'saloonrow', name: 'Saloon Row', emoji: '🥃', permitCost: first('saloonrow') * 2, needContracts: 3, verb: 'fling', verbText: 'Drunks get thrown out · swipe to fling them' },
  { id: 'bankblock', name: 'Bank Block', emoji: '🏦', permitCost: first('bankblock') * 4, needContracts: 3, verb: 'fakeDeath', verbText: 'Boot Hill is open · fake your death for a Bounty' },
];

// Tip riders: every gap a random open business sends out a tippable rider (tap it within `life` s).
export const COURIER = { gap: [25, 45], life: 12, rewardSec: 4 };
