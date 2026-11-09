// Ghost AI worker. One file, two roles:
//  * loaded as a module Worker (new Worker(url, { type: 'module' })) it serves planning requests;
//  * imported normally it exports createAIClient(), which talks to that worker, or runs the same
//    handlers inline (sync fallback: node tests, browsers without module workers, worker errors).
// Hole defs are plain data: the worker rebuilds the colliders itself with the node-safe builder.
import { buildHole } from '../course/builder.js';
import { Planner } from './planner.js';
import { AIGolfer } from './golfers.js';
import { takeShot, playHoleSync, ballFrom, ballState } from './round.js';

const IS_WORKER = typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof WorkerGlobalScope;

// ---- request handlers (pure; same code in the worker and inline)
const planners = new Map();   // hole key → Planner (kept for the session; a hole is ~1 MB of colliders)
function plannerFor(def) {
  const key = def.id + ':' + (def.rev ?? '') + ':' + JSON.stringify(def).length;
  let p = planners.get(key);
  if (!p) {
    if (planners.size > 12) planners.delete(planners.keys().next().value);
    p = new Planner(buildHole(def));
    planners.set(key, p);
  }
  return p;
}
const strip = s => { const { ball, ...rest } = s; return rest; };

export function handle(msg) {
  switch (msg.type) {
    case 'plan': {   // { def, ball: {x,y,z,...}, t0, style } → plan
      return plannerFor(msg.def).plan(ballFrom(msg.ball), { t0: msg.t0 || 0, ...msg.style });
    }
    case 'shot': {   // { def, golfer, ball, t0, ticket, trace } → one stroke with a 30 Hz path + the rest ball state
      const p = plannerFor(msg.def);
      const s = takeShot(p, new AIGolfer(msg.golfer), ballFrom(msg.ball), msg.t0 || 0, msg.ticket, { trace: msg.trace !== false, budgetScale: msg.budgetScale ?? 1, budgetMs: msg.budgetMs || 0 });
      return { ...strip(s), rest: ballState(s.ball) };
    }
    case 'hole': {   // { def, golfer, t0, trace, budgetScale } → ghost record of a whole hole
      return playHoleSync({ planner: plannerFor(msg.def), golfer: new AIGolfer(msg.golfer), t0: msg.t0 || 0, trace: msg.trace !== false, budgetScale: msg.budgetScale ?? 1 });
    }
    case 'round': {  // { defs, golfer, trace, budgetScale, t0?, firstThink? } → [record per hole]; one golfer RNG stream across the round
      // t0 = obstacle clock each hole starts at, firstThink = [min, spread] s before the tee shot (default: as every shot)
      const g = new AIGolfer(msg.golfer);
      return msg.defs.map(def => playHoleSync({ planner: plannerFor(def), golfer: g, t0: msg.t0 || 0, firstThink: msg.firstThink || null, trace: msg.trace !== false, budgetScale: msg.budgetScale ?? 1 }));
    }
    case 'ping': return 'pong';
    default: throw new Error('unknown ai request ' + msg.type);
  }
}

// typed arrays in the result go back as transferables
function transferables(v, out = []) {
  if (v && typeof v === 'object') {
    if (ArrayBuffer.isView(v)) out.push(v.buffer);
    else for (const k in v) transferables(v[k], out);
  }
  return out;
}

if (IS_WORKER) {
  self.onmessage = ev => {
    const { id, msg } = ev.data;
    try { const result = handle(msg); self.postMessage({ id, result }, transferables(result)); }
    catch (e) { self.postMessage({ id, error: String(e && e.stack || e) }); }
  };
}

// ---- client
// createAIClient({ worker: true }) → { plan, shot, hole, round, request, mode, dispose }
// Every call returns a Promise. With worker: false (or no Worker support) handlers run inline,
// deferred by a macrotask so the caller's frame still renders first.
export function createAIClient({ worker = true, url } = {}) {
  let w = null, mode = 'inline', seq = 0;
  const pending = new Map();
  if (worker && typeof Worker !== 'undefined' && !IS_WORKER) {
    try {
      w = new Worker(url || new URL('./worker.js', import.meta.url), { type: 'module' });
      mode = 'worker';
      w.onmessage = ev => {
        const { id, result, error } = ev.data, p = pending.get(id);
        if (!p) return;
        pending.delete(id);
        error ? p.rej(new Error(error)) : p.res(result);
      };
      w.onerror = ev => {   // module workers unsupported / load failure: rerun everything inline
        ev.preventDefault?.();
        console.warn('[skyputt] ai worker failed, planning inline', ev.message || ev);
        try { w.terminate(); } catch { /* already gone */ }
        w = null; mode = 'inline';
        for (const [, p] of pending) runInline(p.msg).then(p.res, p.rej);
        pending.clear();
      };
    } catch (e) { w = null; mode = 'inline'; }
  }
  function runInline(msg) {
    return new Promise((res, rej) => setTimeout(() => { try { res(handle(msg)); } catch (e) { rej(e); } }, 0));
  }
  function request(msg) {
    if (!w) return runInline(msg);
    const id = ++seq;
    return new Promise((res, rej) => { pending.set(id, { res, rej, msg }); w.postMessage({ id, msg }); });
  }
  const gj = g => (g && typeof g.toJSON === 'function' ? g.toJSON() : g);
  return {
    get mode() { return mode; },
    request,
    plan: (def, ball, { t0 = 0, style = {} } = {}) => request({ type: 'plan', def, ball, t0, style }),
    // golfer: AIGolfer (its RNG draws the noise ticket here, on the caller's side) or plain data + ticket
    shot: (def, golfer, ball, { t0 = 0, ticket, trace = true, budgetScale = 1, budgetMs = 0 } = {}) =>
      request({ type: 'shot', def, golfer: gj(golfer), ball, t0, ticket: ticket || golfer.ticket(), trace, budgetScale, budgetMs }),
    hole: (def, golfer, { t0 = 0, trace = true, budgetScale = 1 } = {}) => request({ type: 'hole', def, golfer: gj(golfer), t0, trace, budgetScale }),
    round: (defs, golfer, { trace = true, budgetScale = 1, t0 = 0, firstThink = null } = {}) => request({ type: 'round', defs, golfer: gj(golfer), trace, budgetScale, t0, firstThink }),
    dispose() { w?.terminate(); w = null; for (const [, p] of pending) p.rej(new Error('ai client disposed')); pending.clear(); },
  };
}
