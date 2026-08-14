// The quest state machine. Pure: it takes definitions, state, one world event and a read-only
// context, and returns new state plus a list of effects for the adapter to carry out.

import { evalPred } from './predicate.js';
import { questById, rewardXp, rewardMk, questXp, QUEST_WEIGHT, BOARD_SIZE, BOARD_ALWAYS } from '../sim/campaign.js';
import { levelFor, grantXp } from '../sim/xp.js';
import { streamFor, roll } from '../sim/rng.js';
import { inWindow } from './predicate.js';
import { FACTIONS } from '../sim/schools.js';

export const blankState = () => ({ quests: {}, tracked: null });

const required = def => def.steps.filter(s => !s.optional);
const optional = def => def.steps.filter(s => s.optional);

const countsFor = (rec, s) => rec.c[s.id] || s.objectives.map(() => 0);
const complete = (s, c) => s.objectives.every((o, i) => (c[i] || 0) >= o.target);

// An event may name where it happened; otherwise it happened wherever the player is standing.
function inArea(want, event, ctx) {
  if (!want) return true;
  const here = event.area ? [event.area, ...(event.areas || [])]
    : (event.areas || ctx.areas || (ctx.area ? [ctx.area] : []));
  return here.includes(want);
}

// A step's own modifiers gate every objective inside it.
const onDayNow = (s, ctx) => !s.onDay || ((ctx.day || 0) % s.onDay + s.onDay) % s.onDay === s.onDay - 1;

function stepOpen(s, ctx) {
  if (s.worn !== undefined && (ctx.worn ?? null) !== (s.worn ?? null)) return false;
  if (!onDayNow(s, ctx)) return false;
  if (s.after !== null || s.before !== null) {
    const lo = s.after ?? 0, hi = s.before ?? 24;
    if (!inWindow(ctx.hour ?? 0, lo, hi)) return false;
  }
  return evalPred(s.require, ctx);
}

function credit(o, s, event, ctx) {
  if (s.via && event.via !== s.via) return 0;
  // A step's `verb` is either a school or a spell id — the linter accepts both and the Neutral
  // pack authors `"verb": "graft"`. The caster raises the school it dialled and the spell it
  // actually cast, so one field matching is enough.
  if (s.verb && event.verb !== s.verb && event.spell !== s.verb) return 0;
  switch (o.k) {
    case 'kill':
      return event.t === 'kill' && event.kind === o.kind && inArea(s.in, event, ctx) ? (event.n || 1) : 0;
    case 'gather':
      return event.t === 'gather' && event.kind === o.kind && inArea(s.in, event, ctx) ? (event.n || 1) : 0;
    case 'deliver':
      return event.t === 'deliver' && event.item === o.item && (!o.to || event.to === o.to)
        && inArea(s.in, event, ctx) ? (event.n || 1) : 0;
    case 'interact':
      return event.t === 'interact' && event.id === o.id && inArea(s.in, event, ctx) ? (event.n || 1) : 0;
    case 'goto':
      return event.t === 'enter' && event.area === o.area ? 1 : 0;
    case 'escort':
      return event.t === 'escort' && event.npc === o.npc && (!o.path || event.path === o.path) ? 1 : 0;
    case 'talk':
      // `nodes` is the whole conversation, not just where it ended: a branching node hands off to
      // whichever branch the player picked, so matching only the last node fails every step that
      // opens a choice.
      return event.t === 'talk' && event.npc === o.npc
        && (!o.node || event.node === o.node || !!event.nodes?.includes(o.node)) ? 1 : 0;
    case 'survive':
      return event.t === 'tick' && inArea(o.area, event, ctx) ? (event.dt || 0) : 0;
    default: return 0;
  }
}

function applyEvent(s, counts, event, ctx) {
  let changed = false;
  const out = counts.slice();
  s.objectives.forEach((o, i) => {
    // Holding an area is continuous: stepping outside puts the count back to zero.
    if (o.k === 'survive' && event.t === 'leave' && event.area === o.area && out[i] > 0) { out[i] = 0; changed = true; return; }
    const gain = credit(o, s, event, ctx);
    if (!gain) return;
    const target = o.target;
    const v = Math.min(target, (out[i] || 0) + gain);
    if (v !== out[i]) { out[i] = v; changed = true; }
  });
  return changed ? out : counts;
}

export function rewardFor(def, ctx = {}) {
  const cq = def.story ? questById(def.story) : null;
  const xp = {};
  let mk = 0;
  if (cq) {
    const r = rewardXp(cq);
    if (r.all !== undefined) {
      for (const [school, v] of Object.entries(ctx.schools || {})) if (v > 0) xp[school] = r.all;
    } else Object.assign(xp, r);
    mk = rewardMk(cq);
  } else if (def.board?.school) {
    const school = def.board.school;
    xp[school] = questXp(levelFor(ctx.schools?.[school] || 0), QUEST_WEIGHT.chore);
  }
  return { xp, mk, items: def.reward.items, truths: def.reward.truths };
}

// SYSTEMS §3.3: nothing in the game pays raw XP. A turn-in has no source to out-level and no
// streak — the level pair is deliberately equal, so `tierMul` is 1 — which leaves the affinity row,
// the ±15% that is the whole mechanical payoff of wearing another town's face.
function xpFx(school, base, ctx) {
  const level = levelFor(ctx.schools?.[school] || 0);
  return ['xp', school, grantXp({
    base, school, playerLevel: level, sourceLevel: level, streak: 0,
    faction: ctx.campaign?.current, worn: ctx.worn ?? null,
  })];
}

function payout(def, rec, ctx, fx) {
  const r = rewardFor(def, ctx);
  for (const [school, n] of Object.entries(r.xp)) fx.push(xpFx(school, n, ctx));
  if (r.mk) fx.push(['mk', r.mk]);
  for (const [id, n] of r.items) fx.push(['item', id, n]);
  for (const id of r.truths) fx.push(['truth', id]);
  const opt = optional(def);
  if (opt.length && opt.every(s => complete(s, countsFor(rec, s))) && def.reward.bonus) {
    for (const [school, n] of Object.entries(def.reward.bonus.xp || {})) fx.push(xpFx(school, n, ctx));
    if (def.reward.bonus.mk) fx.push(['mk', def.reward.bonus.mk]);
  }
  for (const e of def.onDone) fx.push(e);
}

function enterStep(def, rec, ctx, fx) {
  const reqs = required(def);
  const s = reqs[rec.i];
  if (!s) return;
  rec.t = ctx.hour ?? 0;
  rec.e = 0;
  // §1.5 / STORY §4: a gated step is never a wait — the adapter fades the clock to the window.
  const late = s.after !== null && !inWindow(ctx.hour ?? 0, s.after, s.before ?? 24);
  if (late || !onDayNow(s, ctx)) fx.push(['wait', s.after ?? 0, s.onDay || null]);
}

function finish(def, rec, ctx, fx) {
  payout(def, rec, ctx, fx);
  if (def.repeat) {
    rec.s = 'cooling';
    rec.readyOn = (ctx.day || 0) + def.repeat.every;
    fx.push(['quest', def.id, 'cooling']);
  } else {
    rec.s = 'done';
    fx.push(['quest', def.id, 'done']);
  }
}

function advance(def, rec, event, ctx, fx) {
  const reqs = required(def);

  if (rec.s === 'turnin') {
    if (event.t === 'talk' && event.npc === def.turnin) finish(def, rec, ctx, fx);
    return;
  }
  if (rec.s !== 'active') return;

  const cur = reqs[rec.i];
  if (cur) {
    if (cur.fail && evalPred(cur.fail, ctx)) { fail(def, rec, fx, 'condition'); return; }
    if (cur.unseen && event.t === 'seen') { fail(def, rec, fx, 'seen'); return; }
    if (event.t === 'tick') {
      rec.e = (rec.e || 0) + (event.dt || 0);
      if (cur.within !== null && rec.e > cur.within) { fail(def, rec, fx, 'expired'); return; }
    }
  }

  const live = [...(cur ? [cur] : []), ...optional(def)];
  for (const s of live) {
    if (!stepOpen(s, ctx)) continue;
    const before = countsFor(rec, s);
    const after = applyEvent(s, before, event, ctx);
    if (after === before) continue;
    rec.c = { ...rec.c, [s.id]: after };
    if (s === cur && complete(s, after)) {
      for (const e of s.onDone || []) fx.push(e);
      rec.i++;
      if (rec.i >= reqs.length) {
        if (def.turnin) { rec.s = 'turnin'; fx.push(['quest', def.id, 'turnin']); }
        else finish(def, rec, ctx, fx);
        return;
      }
      enterStep(def, rec, ctx, fx);
    }
  }
}

function fail(def, rec, fx, why) {
  rec.s = 'failed';
  rec.why = why;
  fx.push(['quest', def.id, 'failed']);
}

export function step(defs, state, event, ctx = {}) {
  const fx = [];
  const quests = { ...state.quests };
  let tracked = state.tracked;

  if (event.t === 'accept') {
    const def = defs[event.id];
    if (!def) return { state, effects: fx };
    if (!event.force && !offered(defs, state, ctx).includes(event.id)) return { state, effects: fx };
    quests[event.id] = { s: 'active', i: 0, c: {}, t: ctx.hour ?? 0, e: 0 };
    fx.push(['quest', event.id, 'active']);
    enterStep(def, quests[event.id], ctx, fx);
    if (!tracked || quests[tracked]?.s === 'done') { tracked = event.id; fx.push(['track', event.id]); }
  } else if (event.t === 'retry') {
    const def = defs[event.id];
    const rec = quests[event.id];
    if (def && rec?.s === 'failed') {
      quests[event.id] = { s: 'active', i: 0, c: {}, t: ctx.hour ?? 0, e: 0 };
      fx.push(['quest', event.id, 'active']);
      // Going back to step 0 means every step the player got through has to be put back, not only
      // the first: they may have spent, moved or broken what steps 1–n needed. Deepest first, so
      // step 0's own `moveTo` is the one that lands last and the player restarts where it says.
      const walked = required(def).slice(0, (rec.i || 0) + 1).reverse();
      for (const s of walked) if (s.recover) fx.push(['recover', s.recover]);
      enterStep(def, quests[event.id], ctx, fx);
    }
  } else if (event.t === 'reset') {
    const def = defs[event.id], r = quests[event.id];
    const cur = def && r?.s === 'active' ? required(def)[r.i] : null;
    if (cur) {
      quests[event.id] = { ...r, e: 0, c: { ...r.c, [cur.id]: cur.objectives.map(() => 0) } };
      if (cur.recover) fx.push(['recover', cur.recover]);
    }
  } else if (event.t === 'abandon') {
    if (quests[event.id]) { delete quests[event.id]; if (tracked === event.id) tracked = null; }
  } else if (event.t === 'track') {
    if (quests[event.id]) { tracked = event.id; fx.push(['track', event.id]); }
  } else {
    for (const [id, r] of Object.entries(quests)) {
      if (r.s !== 'active' && r.s !== 'turnin') continue;
      const def = defs[id];
      if (!def) continue;
      const next = { ...r, c: { ...r.c } };
      advance(def, next, event, ctx, fx);
      quests[id] = next;
    }
  }

  if (tracked && ['done', 'failed', 'cooling'].includes(quests[tracked]?.s)) {
    const nextTracked = Object.keys(quests).find(id => quests[id].s === 'active' || quests[id].s === 'turnin') || null;
    tracked = nextTracked;
    if (tracked) fx.push(['track', tracked]);
  }
  return { state: { quests, tracked }, effects: fx };
}

// STORY §11's ladder, read off the effects the packs already author. Which campaign an effect
// finishes, or null. `<faction>.done` is the canonical signal because it is the only one all three
// carry — Neutral ends on a flag and unlocks nothing. `unlock <faction>` says the same thing from
// the other side: the campaign you are in has just handed over the next one.
export function finishes(effect, current = null) {
  if (effect[0] === 'flag' && effect[2] !== false) {
    const f = String(effect[1]).replace(/\.done$/, '');
    if (f !== effect[1] && FACTIONS.includes(f)) return f;
  }
  if (effect[0] === 'unlock' && FACTIONS.includes(effect[1])) return current;
  return null;
}

export function offered(defs, state, ctx = {}) {
  const out = [];
  for (const def of Object.values(defs)) {
    const rec = state.quests[def.id];
    if (rec && rec.s !== 'cooling') continue;
    if (rec && (ctx.day || 0) < rec.readyOn) continue;
    if (!evalPred(def.prereq, ctx)) continue;
    out.push(def.id);
  }
  return out;
}

// What the tracker draws: title plus one objective line with its count.
export function progress(defs, state, id) {
  const def = defs[id], rec = state.quests[id];
  if (!def || !rec) return null;
  const reqs = required(def);
  const s = reqs[rec.i];
  if (!s) return { id, title: def.title, text: rec.s === 'turnin' ? `Speak to ${def.turnin}` : def.title, have: 0, need: 0, state: rec.s, index: reqs.length, total: reqs.length };
  const c = countsFor(rec, s);
  const oi = s.objectives.findIndex((o, i) => (c[i] || 0) < o.target);
  const i = oi < 0 ? 0 : oi;
  return {
    id, title: def.title, text: s.text, hint: s.hint, state: rec.s,
    have: Math.floor(c[i] || 0), need: s.objectives[i].target,
    parts: s.objectives.length, index: rec.i, total: reqs.length,
    area: s.in || s.objectives[i].area || null,
  };
}

export function boardRoll(defs, seed, day, town, size = BOARD_SIZE) {
  const pool = Object.values(defs).filter(d => d.board && (!d.town || d.town === town));
  const always = pool.filter(d => BOARD_ALWAYS.includes(d.story));
  const rng = streamFor(seed, `board.${town}.${day}`);
  const out = always.slice(0, size).map(d => d.id);
  const left = pool.filter(d => !always.includes(d));
  const weights = left.map(d => d.board.weight ?? 1);
  while (out.length < size && left.length) {
    const i = roll(rng, weights);
    if (i < 0) break;
    out.push(left[i].id);
    left.splice(i, 1);
    weights.splice(i, 1);
  }
  return out;
}
