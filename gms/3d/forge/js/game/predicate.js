// One array-based predicate evaluator, shared by quest prereqs, step require/fail and dialogue
// choices. Nothing is ever eval'd, so every predicate the linter reads is the one that runs.

import { levelFor, grasp } from '../sim/xp.js';
import { SCHOOLS, FACTIONS } from '../sim/schools.js';

export const OPS = ['>', '>=', '<', '<=', '=', '!=', '%'];

function cmp(a, op, b) {
  switch (op) {
    case '>': return a > b;
    case '>=': return a >= b;
    case '<': return a < b;
    case '<=': return a <= b;
    case '=': return a === b;
    case '!=': return a !== b;
    // `["day", "%", 8]` is the eighth-day test: the last day of every n-day cycle.
    case '%': return b > 0 && ((a % b) + b) % b === b - 1;
    default: return false;
  }
}

const levelOf = (ctx, school) => levelFor(ctx.schools?.[school] || 0);
const countOf = (ctx, id) => ctx.items?.[id] || 0;
const stateOf = (ctx, id) => ctx.quests?.[id]?.s || 'hidden';

export const QUEST_STATES = ['hidden', 'offered', 'active', 'turnin', 'done', 'failed', 'cooling'];

export const TERMS = {
  all: { arity: [0, Infinity], preds: true, fn: (a, ctx) => a.every(p => evalPred(p, ctx)) },
  any: { arity: [0, Infinity], preds: true, fn: (a, ctx) => a.some(p => evalPred(p, ctx)) },
  not: { arity: [1, 1], preds: true, fn: (a, ctx) => !evalPred(a[0], ctx) },

  quest: { arity: [2, 2], enums: [null, QUEST_STATES], fn: ([id, s], ctx) => stateOf(ctx, id) === s },
  flag: { arity: [1, 2], fn: ([k, v], ctx) => (ctx.flags?.[k] ?? false) === (v === undefined ? true : v) },
  truth: { arity: [1, 1], fn: ([id], ctx) => !!ctx.truths?.includes(id) },
  level: { arity: [2, 2], enums: [SCHOOLS], level: true, fn: ([s, n], ctx) => levelOf(ctx, s) >= n },
  attunement: { arity: [1, 1], level: true, fn: ([n], ctx) => grasp(ctx.schools || {}) >= n },
  standing: { arity: [2, 2], enums: [FACTIONS], fn: ([f, n], ctx) => (ctx.standing?.[f] || 0) >= n },
  item: { arity: [2, 2], fn: ([id, n], ctx) => countOf(ctx, id) >= n },
  mk: { arity: [1, 1], fn: ([n], ctx) => (ctx.marks || 0) >= n },
  campaign: { arity: [2, 2], enums: [FACTIONS, ['done', 'current']],
    fn: ([id, s], ctx) => s === 'current' ? ctx.campaign?.current === id : !!ctx.campaign?.done?.includes(id) },
  act: { arity: [1, 1], fn: ([n], ctx) => (ctx.campaign?.act || 0) >= n },
  worn: { arity: [1, 1], enums: [[...FACTIONS, null]], fn: ([f], ctx) => (ctx.worn ?? null) === (f ?? null) },
  day: { arity: [2, 2], enums: [OPS], fn: ([op, n], ctx) => cmp(ctx.day || 0, op, n) },
  hour: { arity: [2, 2], fn: ([lo, hi], ctx) => inWindow(ctx.hour || 0, lo, hi) },
  damageDealt: { arity: [2, 2], enums: [OPS], fn: ([op, n], ctx) => cmp(ctx.damageDealt || 0, op, n) },
};

// A window may wrap midnight — `[21, 5]` is the night watch.
export const inWindow = (h, lo, hi) => lo <= hi ? h >= lo && h < hi : h >= lo || h < hi;

export function evalPred(pred, ctx = {}) {
  if (pred === undefined || pred === null) return true;
  if (typeof pred === 'boolean') return pred;
  if (!Array.isArray(pred) || typeof pred[0] !== 'string') return false;
  const term = TERMS[pred[0]];
  if (!term) return false;
  return !!term.fn(pred.slice(1), ctx);
}

// Shared by the linter and by normalise, so a predicate that lints is a predicate that runs.
export function validatePred(pred, path = 'predicate') {
  const out = [];
  if (pred === undefined || pred === null) return out;
  if (!Array.isArray(pred)) return [`${path}: must be an array, got ${typeof pred}`];
  const [name, ...args] = pred;
  const term = TERMS[name];
  if (typeof name !== 'string' || !term) return [`${path}: unknown term ${JSON.stringify(name)}`];
  const [min, max] = term.arity;
  if (args.length < min || args.length > max) {
    out.push(`${path}: ${name} takes ${min === max ? min : `${min}–${max === Infinity ? 'n' : max}`} args, got ${args.length}`);
    return out;
  }
  if (term.preds) {
    args.forEach((a, i) => out.push(...validatePred(a, `${path}.${name}[${i}]`)));
    return out;
  }
  (term.enums || []).forEach((allowed, i) => {
    if (allowed && i < args.length && !allowed.includes(args[i])) {
      out.push(`${path}: ${name} arg ${i} must be one of ${allowed.join(' | ')}, got ${JSON.stringify(args[i])}`);
    }
  });
  return out;
}

// SYSTEMS.md §10.2: a quest's availability may never depend on how strong the player is.
export function findLevelTerms(pred, path = 'prereq') {
  if (!Array.isArray(pred)) return [];
  const [name, ...args] = pred;
  const term = TERMS[name];
  if (!term) return [];
  if (term.level) return [`${path}: ${name} may not appear in a quest prereq`];
  if (!term.preds) return [];
  return args.flatMap((a, i) => findLevelTerms(a, `${path}.${name}[${i}]`));
}
