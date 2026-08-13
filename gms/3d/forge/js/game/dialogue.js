// Pure scene walking. A scene is a node id plus a line index; the adapter draws it and nothing
// here knows about the DOM.

import { evalPred } from './predicate.js';

export function open(pack, nodeId, ctx = {}) {
  const node = pack?.[nodeId];
  if (!node) return null;
  if (node.once && ctx.seen?.includes(nodeId)) return null;
  return settle({ id: nodeId, node, i: 0, choosing: false, done: false, goto: null }, ctx);
}

// A node with no lines is a pure branch point, so opening one must land on its choices.
function settle(scene, ctx) {
  if (scene.i < scene.node.lines.length) return scene;
  const choices = visibleChoices(scene.node, ctx);
  if (choices.length) return { ...scene, choosing: true };
  return { ...scene, done: true, goto: scene.node.next || null };
}

export const current = scene => (!scene || scene.done || scene.choosing) ? null : scene.node.lines[scene.i] || null;
export const lineCount = scene => scene?.node.lines.length || 0;

export function advance(scene, ctx = {}) {
  if (!scene || scene.done || scene.choosing) return scene;
  return settle({ ...scene, i: scene.i + 1 }, ctx);
}

export function skip(scene, ctx = {}) {
  if (!scene || scene.done) return scene;
  return settle({ ...scene, i: scene.node.lines.length }, ctx);
}

export function visibleChoices(node, ctx = {}) {
  if (!node?.choices) return [];
  return node.choices
    .map((c, i) => ({ ...c, i }))
    .filter(c => evalPred(c.if, ctx));
}

export function choose(scene, index, ctx = {}) {
  const choices = visibleChoices(scene.node, ctx);
  const pick = choices[index];
  if (!pick) return { scene, goto: null, effects: [] };
  return { scene: { ...scene, choosing: false, done: true, goto: pick.goto }, goto: pick.goto, effects: pick.sets || [] };
}

export const effectsOf = node =>
  [...(node?.sets || []), ...(node?.mark ? [['truth', node.mark]] : [])];

// Walks a whole conversation with a fixed list of choice indices. The transcript and the effect
// list are what the tests and tools/lintText.mjs assert against.
export function run(pack, startId, ctx = {}, picks = []) {
  const lines = [], effects = [], visited = [];
  let id = startId, guard = 0, pick = 0;
  while (id && guard++ < 200) {
    let scene = open(pack, id, { ...ctx, seen: visited });
    if (!scene) break;
    visited.push(id);
    while (!scene.done && !scene.choosing) {
      const l = current(scene);
      if (l) lines.push(l);
      scene = advance(scene, ctx);
    }
    effects.push(...effectsOf(scene.node));
    if (scene.choosing) {
      const r = choose(scene, picks[pick++] ?? 0, ctx);
      effects.push(...r.effects);
      id = r.goto;
    } else {
      id = scene.goto;
    }
  }
  return { lines, effects, visited };
}
