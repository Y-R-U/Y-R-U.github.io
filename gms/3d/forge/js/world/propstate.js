// The state a prop carries and the rules for changing it. Split out of props.js for the same
// reason roster.js is split out of vermin.js: that file imports three, so nothing in node can
// reach it, and "the wrong school lights the lamp anyway" is invisible from the reducer's side.

// A lamp answers to Kindle and to nothing else, which is the school every step that names one
// asks for. Anything else that lit it would be a press that looks like it worked and pays nothing.
export const LIT_VERB = 'kindle';

// Only the lamp kit carries a state the player can see. The rest — counting a shelf, weighing a
// crate — change nothing on screen, and the button's own confirm is the feedback.
export const hasState = kit => kit === 'lamp';

export const findProp = (items, id) => items.find(i => i.id === id) || null;

// The authored entry as the runtime holds it. `y` is sampled off the built world, so it is the one
// field the caller has to supply.
export function propItem(e, y, zoneId) {
  return {
    id: e.id, kit: e.kit, area: e.area, zoneId, label: e.label || 'use',
    kind: e.kind || 'interact', x: e.x, y, z: e.z, range: e.range || 3.6,
  };
}

// What the context button picks from. Nothing here moves, so it is built once rather than rebuilt
// every frame.
export const targetList = items =>
  items.map(i => ({ id: i.id, kind: i.kind, label: i.label, x: i.x, z: i.z, range: i.range }));

// True when the world changed and the caller has to redraw.
export function useProp(items, lit, id, verb) {
  const it = findProp(items, id);
  if (!it || !hasState(it.kit) || verb !== LIT_VERB || lit.has(id)) return false;
  lit.add(id);
  return true;
}

// §9.4's `recover: arm` — put the object back the way the step found it. Answering true for an
// object that was already out is the point: the reset did happen, there was just nothing to undo.
export function armProp(items, lit, id) {
  if (!findProp(items, id)) return false;
  lit.delete(id);
  return true;
}
