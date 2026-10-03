// One manager per business, defined on the business row (data/lines.js BUSINESSES[].manager).
// Trait kinds understood by state/game.js derive(): speed, sigma, shelf, offline, cost, events, autopile, harvest, star.
import { LINES, BUSINESSES } from './lines.js?v=20261004a';

export const MANAGERS = BUSINESSES.filter((b) => b.manager).map((b) => {
  const line = LINES.find((l) => l.id === b.id);
  return { id: 'm_' + b.id, lineId: b.id, ...b.manager, hireCost: line.managerCost };
});
