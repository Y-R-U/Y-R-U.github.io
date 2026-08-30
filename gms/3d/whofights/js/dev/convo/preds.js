// Only the terms js/game/predicate.js actually evaluates. Offering one it does not understand is
// how a choice ends up silently invisible in the game.

import { OPS, QUEST_STATES } from '../../game/predicate.js';

export const TERM_SPECS = {
  all: { label: 'all of…', nest: 'many' },
  any: { label: 'any of…', nest: 'many' },
  not: { label: 'not…', nest: 'one' },
  flag: { label: 'flag', args: [{ name: 'name', type: 'text' }, { name: 'is', type: 'bool' }] },
  quest: { label: 'quest', args: [{ name: 'id', type: 'text' }, { name: 'state', type: 'enum', options: QUEST_STATES }] },
  item: { label: 'item count ≥', args: [{ name: 'id', type: 'text' }, { name: 'n', type: 'number' }] },
  day: { label: 'day', args: [{ name: 'op', type: 'enum', options: OPS }, { name: 'n', type: 'number' }] },
  hour: { label: 'hour in', args: [{ name: 'from', type: 'number' }, { name: 'to', type: 'number' }] },
};

export const TERMS = Object.keys(TERM_SPECS);

export function blankPred(term) {
  switch (term) {
    case 'all': case 'any': return [term];
    case 'not': return ['not', ['flag', '']];
    case 'flag': return ['flag', '', true];
    case 'quest': return ['quest', '', 'done'];
    case 'item': return ['item', '', 1];
    case 'day': return ['day', '>=', 1];
    case 'hour': return ['hour', 8, 18];
    default: return null;
  }
}

export function describePred(p) {
  if (p === null || p === undefined) return 'always';
  if (!Array.isArray(p)) return String(p);
  const [t, ...a] = p;
  if (t === 'all' || t === 'any') return `${t === 'all' ? 'all' : 'any'}(${a.map(describePred).join(', ')})`;
  if (t === 'not') return `not ${describePred(a[0])}`;
  if (t === 'flag') return `flag ${a[0]}${a[1] === false ? ' is off' : ''}`;
  if (t === 'quest') return `quest ${a[0]} = ${a[1]}`;
  if (t === 'item') return `item ${a[0]} ≥ ${a[1]}`;
  if (t === 'day') return `day ${a[0]} ${a[1]}`;
  if (t === 'hour') return `hour ${a[0]}–${a[1]}`;
  return JSON.stringify(p);
}
