// One manager per business, defined on the business row (data/lines.js BUSINESSES[].manager), plus seasonal ones.
// Trait kinds handled by state/game.js derive(): speed sigma shelf offline cost events autopile harvest star
// teeth (every Nth sale drops 🦷) duel (duel rewards ×(1+v)) quiet (+v while no event runs) night (+v during game night, W18).
import { LINES, BUSINESSES } from './lines.js?v=20261004g';

export const MANAGERS = [
  ...BUSINESSES.filter((b) => b.manager).map((b) => {
    const line = LINES.find((l) => l.id === b.id);
    return { id: 'm_' + b.id, lineId: b.id, ...b.manager, hireCost: line.managerCost };
  }),
  { id: 'm_hank', lineId: 'undertaker', name: 'Headless Hank', emoji: '👻', bark: 'hank', trait: 'Nocturnal', kind: 'night', value: 0.5, offline: 7200, text: '+50% at night · offline +2 h', seasonal: 'ghosttown', hireCost: 0 },
];

// Levels 1–5, paid in cash (× the hire cost) and gold teeth 🦷. Slots hold items.
export const MANAGER_LEVELS = {
  max: 5,
  mult: [1, 1.1, 1.2, 1.3, 1.4],
  cash: [0, 20, 200, 2e3, 2e4],
  teeth: [0, 2, 4, 7, 10],
  slots: [1, 1, 2, 2, 2],
};
