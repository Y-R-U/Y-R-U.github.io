// D34 task grid engine. Pure (no DOM, no clock): events in, completions out. Data: data/tasks.js. Docs: docs/TASKS.md.
//   const tasks = getTasks({ career });           // one shared instance (wiring + UI); career = THE live loadCareer()
//   tasks.handle({ type: 'touchdown', fpm: 80, ... })   // normalised events (the live adapter below makes them)
//   tasks.on('task' | 'set' | 'change', fn)
// Live adapter: tasks.attach({ game, atc, radio, mode, difficulty, plane }) per play; tasks.sample(dt, ent, traffic) per frame.
import { SETS, STATS, FSTATS, TIER_PP, SET_BONUS, TASKS_KEY, STORY, placeAt } from '../../data/tasks.js';
import { AIRCRAFT } from '../../data/aircraft.js';
import { INFRACTIONS } from '../../data/rules.js';
import { RUNWAYS } from '../world/layout.js';
import * as LAYOUT from '../world/layout.js';
import { LAWN } from '../../data/airports/palace.js';

export { TASKS_KEY };
export const TASKS_VERSION = 1;
const STORY_KEY = 'krayzee.story';
const KT = 0.514444;
const PAVED = ['runway', 'taxiway', 'apron'];
const HF = new Set(['air', 'inverted', 'stall', 'formation', 'visit']);
// ROSTER rows: the Palace Lawn strip (C-Tower 3, in C-Tower 1's frame) and roll counting
export function onLawn(x, z) {
  const r = LAWN.ROT * Math.PI / 180, dx = x - LAWN.OX, dz = z - LAWN.OZ;
  const lx = dx * Math.cos(r) + dz * Math.sin(r), lz = -dx * Math.sin(r) + dz * Math.cos(r);
  return Math.abs(lx) <= LAWN.length / 2 + 10 && Math.abs(lz) <= LAWN.width / 2 + 6;
}
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // per-frame events: saved on a timer, not each time
const CONTROLLER = { tower_m: 'gerald', tower_f: 'imogen', tower_trainee: 'toby', tower_raf: 'imogen', tower_farm: 'mudge' };
export const INVERTED_RAD = 2.09; // |bank| > 120°

function memoryStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
function defaultStorage() { try { return globalThis.localStorage || memoryStorage(); } catch (e) { return memoryStorage(); } }

export const planeReady = (id) => !id || AIRCRAFT[id]?.status === 'ready';
export const taskPP = (t) => t.pp ?? TIER_PP[t.tier] ?? 100;
export const setBonus = (s) => s.bonus ?? Math.max(SET_BONUS.min, Math.round(s.tasks.reduce((a, t) => a + taskPP(t), 0) * SET_BONUS.share / 100) * 100);

const blank = () => ({ v: TASKS_VERSION, done: {}, sets: {}, stats: {}, uniq: {}, best: {}, worn: null, unseen: [], savedAt: 0 });

export function createTasks({ career = null, storage = defaultStorage(), now = () => Date.now(), sets = SETS, stats = STATS, fstats = FSTATS, ready = planeReady, autosave = true, retro = true } = {}) {
  const ALL = sets.flatMap((s) => s.tasks.map((t) => ({ ...t, set: s.id })));
  const BY_ID = new Map(ALL.map((t) => [t.id, t]));
  const SET_BY = new Map(sets.map((s) => [s.id, s]));
  const byEvent = (defs) => { const m = new Map(); for (const [k, d] of Object.entries(defs)) { for (const ty of [d.on, ...(d.resetOn || [])]) (m.get(ty) || m.set(ty, []).get(ty)).push(k); } return m; };
  const STAT_EV = byEvent(stats), FSTAT_EV = byEvent(fstats);
  const TASK_EV = new Map();
  for (const t of ALL) if (t.on) (TASK_EV.get(t.on) || TASK_EV.set(t.on, []).get(t.on)).push(t);
  const BY_STAT = new Map(), BY_FSTAT = new Map();
  for (const t of ALL) { if (t.stat) (BY_STAT.get(t.stat) || BY_STAT.set(t.stat, []).get(t.stat)).push(t); if (t.fstat) (BY_FSTAT.get(t.fstat) || BY_FSTAT.set(t.fstat, []).get(t.fstat)).push(t); }

  let D = blank();
  try { const raw = JSON.parse(storage.getItem(TASKS_KEY)); if (raw && typeof raw === 'object') D = { ...blank(), ...raw, v: TASKS_VERSION }; } catch (e) { /* fresh */ }
  let F = {}, FU = {};
  let ctx = { plane: 'c172', diff: 'easy', mode: 'free' };
  const listeners = {};
  const emit = (t, p) => { for (const fn of listeners[t] || []) try { fn(p); } catch (e) { console.warn('[tasks]', e); } };
  let dirty = false;

  const avail = (t) => ready(t.plane);
  const statVal = (k) => D.stats[k] ?? 0;
  const fBest = (k) => D.best[k] ?? 0;

  function save() {
    D.savedAt = now();
    try { storage.setItem(TASKS_KEY, JSON.stringify(D)); dirty = false; return true; } catch (e) { return false; }
  }
  const touch = () => { dirty = true; };

  // career.addBonus: lifetime PP only (addPP would count every task as a sortie)
  function pay(pp) { try { if (career?.addBonus) career.addBonus(pp); else career?.addPP(pp, {}); } catch (e) { console.warn('[tasks] pay', e); } }
  function complete(t, ev) {
    if (D.done[t.id] || !avail(t)) return null;
    const pp = taskPP(t);
    D.done[t.id] = now();
    D.unseen.push(t.id);
    pay(pp);
    const info = { id: t.id, name: t.name, icon: t.icon, tier: t.tier, pp, set: t.set, text: `✓ ${t.name} +${pp.toLocaleString('en-GB')} PP` };
    emit('task', info);
    const s = SET_BY.get(t.set);
    if (s && !D.sets[s.id] && s.tasks.every((x) => D.done[x.id])) {
      const bonus = setBonus(s);
      D.sets[s.id] = now();
      pay(bonus);
      if (!D.worn) D.worn = s.id;
      emit('set', { id: s.id, name: s.name, bonus, badge: s.badge, epithet: s.epithet });
    }
    touch();
    return info;
  }

  function bump(defs, keys, ev, vals, uniq) {
    const changed = [];
    for (const k of keys || []) {
      const d = defs[k];
      if (d.resetOn?.includes(ev.type)) { if (vals[k]) { vals[k] = 0; if (uniq[k]) uniq[k] = []; changed.push(k); } continue; }
      if (d.on !== ev.type || (d.when && !d.when(ev))) continue;
      if (d.unique) {
        const key = d.unique(ev); const u = (uniq[k] ||= []);
        if (key == null || u.includes(key)) continue;
        u.push(key); vals[k] = u.length;
      } else if (d.max) { const v = +d.max(ev) || 0; if (v <= (vals[k] ?? 0)) continue; vals[k] = v; }
      else vals[k] = (vals[k] ?? 0) + (d.add ? +d.add(ev) || 0 : 1);
      changed.push(k);
    }
    return changed;
  }

  // ev: { type, ...payload }; ctx (plane, diff, mode) is filled in unless the event carries its own.
  function handle(ev) {
    if (!ev?.type) return [];
    if (ev.type === 'flightStart') { F = {}; FU = {}; return []; }
    const e = { ...ctx, ...ev };
    const out = [];
    const sc = bump(stats, STAT_EV.get(e.type), e, D.stats, D.uniq);
    const fc = bump(fstats, FSTAT_EV.get(e.type), e, F, FU);
    for (const k of fc) if ((F[k] ?? 0) > fBest(k)) D.best[k] = F[k];
    if (sc.length || fc.length) touch();
    for (const t of TASK_EV.get(e.type) || []) if (!D.done[t.id] && (!t.when || t.when(e))) { const r = complete(t, e); if (r) out.push(r); }
    for (const k of sc) for (const t of BY_STAT.get(k) || []) if (!D.done[t.id] && statVal(k) >= t.target) { const r = complete(t, e); if (r) out.push(r); }
    for (const k of fc) for (const t of BY_FSTAT.get(k) || []) if (!D.done[t.id] && (F[k] ?? 0) >= t.target) { const r = complete(t, e); if (r) out.push(r); }
    if (out.length || (dirty && !HF.has(e.type))) { if (autosave) save(); }
    if (out.length) emit('change', out);
    return out;
  }

  // Credit from saves that existed before the task grid: story missions already done (krayzee.story).
  function applyRetro() {
    let P = null;
    try { P = JSON.parse(storage.getItem(STORY_KEY)); } catch (e) { P = null; }
    for (const m of STORY) if (P?.missions?.[m.id]?.done) handle({ type: 'story', ok: true, mission: m.id, diff: P.missions[m.id].diff || 'easy', retro: true });
  }
  if (retro) applyRetro();

  function progressOf(t) {
    if (D.done[t.id]) return { value: t.target ?? 1, target: t.target ?? 1, frac: 1 };
    const target = t.target ?? 1;
    const value = t.stat ? statVal(t.stat) : t.fstat ? Math.max(fBest(t.fstat), F[t.fstat] ?? 0) : 0;
    return { value: Math.min(value, target), target, frac: Math.max(0, Math.min(1, value / target)) };
  }

  // ---------------- live adapter (game facade + ATC + radio + the player's aircraft) ----------------
  const L = { off: [], seen: new WeakSet(), wasGround: null, lastGroundSurface: null, lastTouch: null, inv: 0, stall: 0, towerVoice: 'tower_m', attached: false, parked: true, sampleT: 0, saveT: 0 };
  const controller = () => CONTROLLER[L.towerVoice] || 'gerald';
  function runwayAt(x, z) {
    for (const rw of RUNWAYS || []) {
      const h = (rw.heading * Math.PI) / 180, ax = Math.sin(h), az = -Math.cos(h);
      const dx = x - rw.center[0], dz = z - rw.center[2];
      if (Math.abs(dx * ax + dz * az) <= rw.length / 2 && Math.abs(dx * az - dz * ax) <= rw.width / 2 + 5) return rw.id;
    }
    return null;
  }
  const nearRunway = (x, z, m) => (RUNWAYS || []).some((rw) => {
    const h = (rw.heading * Math.PI) / 180, ax = Math.sin(h), az = -Math.cos(h), dx = x - rw.center[0], dz = z - rw.center[2];
    return Math.hypot(Math.max(0, Math.abs(dx * ax + dz * az) - rw.length / 2), Math.max(0, Math.abs(dx * az - dz * ax) - rw.width / 2)) <= m;
  });

  function attach({ game, atc = null, radio = null, mode = 'free', difficulty = 'easy', plane = 'c172' } = {}) {
    detach();
    ctx = { plane, diff: difficulty || 'easy', mode: mode || 'free' };
    L.attached = true; L.wasGround = null; L.inv = 0; L.stall = 0; L.lastTouch = null;
    handle({ type: 'flightStart' });
    const on = (src, t, fn) => { const u = src?.on?.(t, fn); if (typeof u === 'function') L.off.push(u); };
    if (game) {
      on(game, 'pp', (e) => {
        if (e.id === 'banter') handle({ type: 'banter', name: e.name });
        else if (e.id === 'impeccable') handle({ type: 'impeccable' });
        else if (INFRACTIONS[e.id]) handle({ type: 'infraction', id: e.id, amount: e.amount, frozen: !!e.frozen, combo: e.combo });
      });
      on(game, 'combo', (e) => { if (e.mult > 1) handle({ type: 'combo', mult: e.mult }); });
      on(game, 'banked', (e) => handle({ type: 'banked', amount: e.amount }));
      on(game, 'finished', (e) => { handle({ type: 'finished', amount: e.amount }); handle({ type: 'flightStart' }); });
      on(game, 'destroyed', () => { handle({ type: 'destroyed' }); handle({ type: 'flightStart' }); });
    }
    if (atc) {
      const mine = (e) => e.key == null || e.key === 'tower' || e.key === 'tower:player' || e.actor === 'player';
      on(atc, 'composure', (e) => { if (mine(e) && e.tier > (e.from ?? 0)) handle({ type: 'composure', tier: e.tier, controller: controller() }); });
      on(atc, 'scandal', (e) => { if (mine(e)) handle({ type: 'towerScandal', controller: controller() }); });
    }
    if (radio) {
      on(radio, 'barked', () => handle({ type: 'bark' }));
      // who is in the tower: the story swaps the voice through radio.setTower (js/story/host.js)
      if (typeof radio.setTower === 'function' && !radio.__tasksTower) {
        const orig = radio.setTower;
        radio.setTower = (tw) => { if (tw?.voice) L.towerVoice = tw.voice; return orig.call(radio, tw); };
        radio.__tasksTower = true;
      }
    }
  }
  function detach() {
    for (const f of L.off.splice(0)) try { f(); } catch (e) { /* */ }
    L.attached = false; L.parked = true;
    if (dirty && autosave) save();
  }

  // Per frame. dt = sim time; warp = the sim-time multiplier (time warp × ?timescale), so dt / warp is real play time.
  // Time counters (air, inverted, stall, formation) use real time: warp must not shortcut the hours; distance is as flown.
  // ent = traffic entry ({ ac, ap }); traffic = Traffic (for formation); aircraft events are only READ.
  function sample(dt, ent, traffic = null, warp = 1) {
    const ac = ent?.ac;
    if (!ac || !(dt > 0)) return;
    if (ac.type && ac.type !== ctx.plane) ctx.plane = ac.type;
    for (const ev of ac.events || []) {
      if (L.seen.has(ev)) continue;
      L.seen.add(ev);
      if (ev.type === 'touchdown') {
        const crash = ev.grade === 'crash';
        const airport = LAYOUT.AIRPORT?.id || 'royal';
        const e = { type: 'touchdown', fpm: ev.fpm, grade: ev.grade, bounce: !!ev.bounce, surface: ev.surface, runway: runwayAt(ac.pos.x, ac.pos.z), crash, fuel: ac.fuelFraction ?? 1, vertical: (ac.vtol || 0) > 0.5,
          airport, lawn: ev.surface === 'lawn' || ((airport === 'royal' || airport === 'palace') && onLawn(ac.pos.x, ac.pos.z)) };
        L.td = crash || e.vertical ? null : { x: ac.pos.x, z: ac.pos.z };
        L.lastTouch = { surface: ev.surface, field: !PAVED.includes(ev.surface) && !nearRunway(ac.pos.x, ac.pos.z, 150) };
        handle(e);
      } else if (ev.type === 'crash') { handle({ type: 'crash', reason: ev.reason }); L.lastTouch = null; }
      else if (ev.type === 'tailstrike') handle({ type: 'tailstrike' });
      else if (ev.type === 'fuelempty') handle({ type: 'fuelempty' });
      else if (ev.type === 'impact' && ev.result === 'bounce') handle({ type: 'bounce' });
    }
    if (ac.crashed) { L.wasGround = null; L.parked = false; return; }
    const ground = !!ac.onGround;
    if (ground) L.lastGroundSurface = ac.surface;
    if (L.wasGround === true && !ground) {
      const fromField = !!L.lastTouch?.field && !PAVED.includes(L.lastGroundSurface);
      handle({ type: 'takeoff', surface: L.lastGroundSurface, fromField });
      L.lastTouch = null;
    }
    L.wasGround = ground;
    L.parked = ground && ac.gs < 1;
    // the landing roll, touchdown to stop (short-field tasks)
    if (ground && L.td && ac.gs < 1) { handle({ type: 'stopped', rollM: Math.hypot(ac.pos.x - L.td.x, ac.pos.z - L.td.z) }); L.td = null; }
    if (!ground) L.td = null;
    if (ground) { L.inv = 0; L.stall = 0; L.hov = 0; L.roll = 0; L.rollT = 0; L.bank0 = null; return; }
    const rdt = dt / Math.max(1, +warp || 1);
    const speedKt = ac.speed / KT, vne = AIRCRAFT[ctx.plane]?.speeds?.vne || 0;
    handle({ type: 'air', dt: rdt, dist: (ac.gs || 0) * dt, alt: ac.alt ?? ac.pos.y, speedKt, vne });
    // D35: jet-borne and nearly still (F-35B hover)
    if ((ac.vtol || 0) > 0.5 && ac.speed < 15 * KT) { L.hov = (L.hov || 0) + rdt; handle({ type: 'hover', dt: rdt, run: L.hov }); } else L.hov = 0;
    if (Math.abs(ac.bank) > INVERTED_RAD) { L.inv += rdt; handle({ type: 'inverted', dt: rdt, run: L.inv }); } else L.inv = 0;
    // a full roll: 360° of bank one way (a change of direction starts the count again); secs = how long it took
    if (L.bank0 != null) {
      const d = wrapPi(ac.bank - L.bank0);
      if (d && Math.sign(d) !== Math.sign(L.roll || d)) { L.roll = 0; L.rollT = 0; }
      L.roll = (L.roll || 0) + d; L.rollT = (L.rollT || 0) + rdt;
      if (Math.abs(L.roll) >= 2 * Math.PI) { handle({ type: 'roll', secs: L.rollT }); L.roll = 0; L.rollT = 0; }
    }
    L.bank0 = ac.bank;
    let vs = 0;
    try { vs = ent.ap?._vstall?.() || 0; } catch (e) { vs = 0; }
    if (!vs) vs = (AIRCRAFT[ctx.plane]?.speeds?.vs1 || 48) * KT;
    if (ac.agl > 30 && ac.speed < vs * 1.03 + 3 * KT) { L.stall += rdt; handle({ type: 'stall', dt: rdt, run: L.stall }); } else L.stall = 0;
    if (traffic?.list) for (const o of traffic.list) {
      if (o === ent || o.ac.onGround || o.ac.crashed) continue;
      if (Math.hypot(o.ac.pos.x - ac.pos.x, o.ac.pos.y - ac.pos.y, o.ac.pos.z - ac.pos.z) < 50) { handle({ type: 'formation', dt: rdt }); break; }
    }
    for (const v of placeAt(ac.pos.x, ac.pos.z, ac.agl)) handle({ type: 'visit', ...v });
    if ((L.saveT += dt) > 15) { L.saveT = 0; if (dirty && autosave) save(); }
  }

  // Story result from js/story/missions.js complete() (o.onComplete): { ok, mission, diff, objectives:[ticked ids] }.
  function story(r) { if (r) handle({ type: 'story', ok: r.ok !== false, mission: r.mission, diff: r.diff || ctx.diff, ticks: r.objectives || r.ticks || [] }); }

  const api = {
    handle, attach, detach, sample, story, save,
    on(t, fn) { (listeners[t] ||= []).push(fn); return () => { listeners[t] = listeners[t].filter((x) => x !== fn); }; },
    setContext(c) { ctx = { ...ctx, ...c }; },
    get context() { return { ...ctx }; },
    get attached() { return L.attached; },
    get parked() { return L.parked; },
    get towerController() { return controller(); },
    tasks() { return ALL.map((t) => ({ id: t.id, set: t.set, icon: t.icon, name: t.name, desc: t.desc, tier: t.tier, pp: taskPP(t), plane: t.plane || null, done: !!D.done[t.id], at: D.done[t.id] || 0, avail: avail(t), counted: !!(t.stat || t.fstat), perFlight: !!t.fstat, ...progressOf(t) })); },
    sets() { return sets.map((s) => { const n = s.tasks.filter((t) => D.done[t.id]).length; return { id: s.id, name: s.name, blurb: s.blurb, badge: s.badge, epithet: s.epithet, bonus: setBonus(s), done: !!D.sets[s.id], count: n, total: s.tasks.length, locked: s.tasks.some((t) => !avail(t)) }; }); },
    summary() { const done = ALL.filter((t) => D.done[t.id]).length; const earned = ALL.reduce((a, t) => a + (D.done[t.id] ? taskPP(t) : 0), 0) + sets.reduce((a, s) => a + (D.sets[s.id] ? setBonus(s) : 0), 0); return { done, total: ALL.length, sets: Object.keys(D.sets).length, setTotal: sets.length, earned }; },
    stats() { return { ...D.stats }; },
    best() { return { ...D.best }; },
    flight() { return { ...F }; },
    isDone: (id) => !!D.done[id],
    task: (id) => BY_ID.get(id) || null,
    // cosmetics: a finished set's badge + epithet, worn on the pilot card
    regalia() { return sets.filter((s) => D.sets[s.id]).map((s) => ({ id: s.id, badge: s.badge, epithet: s.epithet, name: s.name, worn: D.worn === s.id })); },
    worn() { const s = D.worn && D.sets[D.worn] ? SET_BY.get(D.worn) : null; return s ? { id: s.id, badge: s.badge, epithet: s.epithet } : null; },
    wear(id) { if (id != null && !D.sets[id]) return false; D.worn = id; save(); emit('change', []); return true; },
    unseen() { return D.unseen.slice(); },
    markSeen() { if (!D.unseen.length) return; D.unseen = []; save(); },
    toJSON() { return JSON.parse(JSON.stringify(D)); },
    reset() { D = blank(); F = {}; FU = {}; save(); emit('change', []); },
  };
  return api;
}

// One instance shared by the wiring (events) and the UI (grid): the first caller's career wins, and it must be main's.
let shared = null;
export function getTasks(opts = {}) { return (shared ||= createTasks(opts)); }
export function peekTasks() { return shared; }
