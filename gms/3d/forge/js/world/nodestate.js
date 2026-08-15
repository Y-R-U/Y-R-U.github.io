// The state a gather node carries and everything the context button reads off it. Split out of
// nodes.js for the reason propstate.js is split out of props.js: nodes.js imports three, so no
// node test can reach it, and the review proved that — setting every node's range to 0, which
// makes the whole gather verb unreachable, left the suite 430/430 green.

import { KIND } from '../game/gathering.js';

// How close you have to stand. The same reach as a prop, so walking up to a fishing spot and
// walking up to a lamp feel like the same act.
export const NODE_RANGE = 3.6;

// A fire is the only node the cook verb fires; everything else is worked.
export const nodeUi = kind => (kind === 'hearth' ? 'cook' : 'work');

// Only a node that has been picked is spent. `working` is a spot with the line already out, and
// labelling that `spent` relabels the button under the thumb the moment the player uses it.
export const nodeLabel = it => (it.state === 'cooling' ? 'spent' : it.label);

// A fire is never used up and now carries a flame, so a pip over it would be a second tell for a
// state that never changes.
export const pipped = it => it.kind !== 'hearth';

export const findNode = (items, id) => items.find(i => i.id === id) || null;

// The authored entry as the runtime holds it, or null for a kind nothing knows how to work. `y`
// is sampled off the built world, so it is the one field the caller has to supply.
export function nodeItem(e, y, zoneId) {
  const cfg = KIND[e.kind];
  if (!cfg) return null;
  return {
    id: e.id, kind: e.kind, zoneId, x: e.x, y, z: e.z, state: 'ready',
    label: cfg.label, ui: nodeUi(e.kind), range: NODE_RANGE,
  };
}

// What the context button picks from. Rebuilt only when a state changes: a spent patch still
// answers the button, and says so.
export const targetList = items =>
  items.map(i => ({ id: i.id, kind: i.ui, label: nodeLabel(i), x: i.x, z: i.z, range: i.range }));
