#!/usr/bin/env node
// MAP gate (node): every Kingdom airport's data is flyable and tidy.
//   1. runway length vs each flyable type's need (data/airports/kingdom.js canUse) against the expected table below
//   2. no prop / building / flock / tower / terminal on a runway strip, a taxiway, an apron, a stand or an approach
//   3. the taxi graph: a hold for every departure end, every stand reaches every hold and back
//   4. a native autopilot + ATC soak at each new airport (light traffic; heavies at the air base)
// node tools/airport-check.mjs [--minutes=30] [--only=farm] [--control] [--nosoak] [--quiet]   (--control adds a C-Tower 1 soak)
// node tools/airport-check.mjs --break=short|overlap|graph|approach   breaks the data on purpose: the run must go red
import { KINGDOM, ORDER, canUse } from '../data/airports/kingdom.js';
import * as L from '../js/world/layout.js';
import { AIRCRAFT } from '../data/aircraft.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const FLYABLE = ['c172', 'tiger', 'bathtub', 'jumbo', 'herc', 'f35'];
const EXPECT = {
  royal: FLYABLE,
  farm: ['c172', 'tiger', 'bathtub'],
  airbase: FLYABLE,
};
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; if (!ok || !args.quiet) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`); };

const defs = structuredClone(KINGDOM);
if (args.break === 'short') defs.farm.runways[0].length = 900;
if (args.break === 'overlap') defs.farm.props.push({ kind: 'bales', center: [...defs.farm.runways[0].center], size: [12, 8], heading: 0, h: 2.4 });
if (args.break === 'graph') defs.farm.taxiways = defs.farm.taxiways.filter((t) => t.id !== 'H2');
if (args.break === 'approach') defs.airbase.props.push({ kind: 'shed', center: [1700, 0, 10], size: [20, 12], heading: 0, h: 7 });

// ---------- 1. runway vs aircraft ----------
for (const id of ORDER) {
  const def = defs[id];
  const allowed = FLYABLE.filter((t) => canUse(def, t).ok);
  const row = FLYABLE.map((t) => { const u = canUse(def, t); return `${t} ${u.need}${u.ok ? '' : '✗'}`; }).join(' · ');
  check(`${id}: runway ${Math.max(...def.runways.map((r) => r.length))} m serves exactly ${EXPECT[id].join(', ')}`, allowed.join() === EXPECT[id].join(), row);
  for (const t of FLYABLE) if (!canUse(def, t).ok) check(`${id}: ${t} refused with a quip`, !!canUse(def, t).quip, canUse(def, t).quip);
  // the autopilot only lines up / DEMANDs a takeoff with _minRun() of runway ahead (600 m, jets their roll + 10 %), from ~12 m in
  const ap = allowed.map((t) => { const a = AIRCRAFT[t]; const m = a.flight?.jet ? Math.max(600, (a.performance?.takeoffRollM ?? 600) * 1.1) : 600; return [t, Math.round(m)]; });
  const usable = Math.max(...def.runways.filter((rw) => rw.departures !== false && !rw.closed).map((rw) => rw.length));
  check(`${id}: every allowed type can take off under the autopilot's runway floor (+15 m line-up)`, ap.every(([, m]) => usable >= m + 15), ap.map(([t, m]) => `${t} ${m}`).join(' · '));
}

// ---------- 2. overlaps ----------
const vec = (deg) => { const r = deg * Math.PI / 180; return [Math.sin(r), -Math.cos(r)]; };
// oriented box: centre, unit long axis u, half length a, half width b
const box = (cx, cz, u, a, b) => ({ cx, cz, u, a, b });
const fromRect = (r) => box(r.center[0], r.center[2], vec(90 + (r.heading || 0)), r.size[0] / 2, r.size[1] / 2);
function overlap(A, B) {
  for (const [ux, uz] of [A.u, [-A.u[1], A.u[0]], B.u, [-B.u[1], B.u[0]]]) {
    const pa = (o) => Math.abs(o.u[0] * ux + o.u[1] * uz) * o.a + Math.abs(-o.u[1] * ux + o.u[0] * uz) * o.b;
    const d = Math.abs((B.cx - A.cx) * ux + (B.cz - A.cz) * uz);
    if (d > pa(A) + pa(B)) return false;
  }
  return true;
}
const STRIP_SIDE = 25, STRIP_END = 60, TAXI_SIDE = 10, STAND_R = 25, APPROACH = { len: 600, half: 60, maxH: 3 };
function propsOf(def) {
  const out = [];
  for (const p of def.props || []) {
    if (p.kind === 'hedge') for (let i = 1; i < p.pts.length; i++) {
      const [a, b] = [p.pts[i - 1], p.pts[i]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      out.push({ name: 'hedge', h: p.h, B: box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, [(b[0] - a[0]) / len, (b[1] - a[1]) / len], len / 2, 1.6) });
    } else out.push({ name: p.kind + (p.type ? ':' + p.type : ''), h: p.h ?? 3, B: fromRect(p) });
  }
  if (def.terminal) out.push({ name: 'terminal', h: def.terminal.height, B: fromRect(def.terminal) });
  if (def.tower) out.push({ name: 'tower', h: def.tower.height, B: box(def.tower.position[0], def.tower.position[2], [1, 0], 6, 6) });
  for (const [x, z] of def.windsocks || []) out.push({ name: 'windsock', h: 7, B: box(x, z, [1, 0], 1, 1), sock: true });
  return out;
}
for (const id of ORDER) {
  const def = defs[id];
  if (id === 'royal') continue;   // C-Tower 1's scenery is hand-built in js/world (not data); it is the reference
  const bad = [];
  const P = propsOf(def);
  for (const rw of def.runways) {
    const u = vec(rw.heading);
    const strip = box(rw.center[0], rw.center[2], u, rw.length / 2 + STRIP_END, rw.width / 2 + STRIP_SIDE);
    for (const p of P) if (overlap(strip, p.sock ? { ...p.B, a: 0.5, b: 0.5 } : p.B) && !(p.sock && false)) bad.push(`${p.name} on runway ${rw.id} strip`);
    for (const s of [-1, 1]) {
      const c = [rw.center[0] + u[0] * s * (rw.length / 2 + APPROACH.len / 2), rw.center[2] + u[1] * s * (rw.length / 2 + APPROACH.len / 2)];
      const ap = box(c[0], c[1], u, APPROACH.len / 2, APPROACH.half);
      for (const p of P) if (p.h > APPROACH.maxH && overlap(ap, p.B)) bad.push(`${p.name} (${p.h} m) in the ${rw.ends[s < 0 ? 0 : 1]} approach`);
    }
  }
  const tw = def.taxiwayWidth ?? 15;
  for (const t of def.taxiways) for (let i = 1; i < t.points.length; i++) {
    const [a, b] = [t.points[i - 1], t.points[i]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const T = box((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, [(b[0] - a[0]) / len, (b[1] - a[1]) / len], len / 2 + tw / 2, tw / 2 + TAXI_SIDE);
    for (const p of P) if (overlap(T, p.B)) bad.push(`${p.name} on taxiway ${t.id}`);
  }
  for (const a of def.aprons || []) for (const p of P) if (p.name !== 'terminal' && overlap(fromRect(a), p.B)) bad.push(`${p.name} on the apron`);
  for (const s of def.stands) for (const p of P) if (overlap(box(s.position[0], s.position[2], [1, 0], STAND_R, STAND_R), p.B)) bad.push(`${p.name} on stand ${s.id}`);
  check(`${id}: ${P.length} props clear of runway strips, approaches, taxiways, aprons and stands`, !bad.length, bad.slice(0, 6).join('; '));
}

// ---------- 3. taxi graph ----------
const { makeRoutes } = await import('../js/flight/routes.js');
const { makeGeometry } = await import('../js/atc/geometry.js');
for (const id of ORDER) {
  const def = defs[id];
  let R, G, err = '';
  try { R = makeRoutes(def); G = makeGeometry(def, R); } catch (e) { err = String(e); }
  if (!R) { check(`${id}: routes + ATC geometry build`, false, err); continue; }
  const ends = L.departureEnds(def), miss = [];
  for (const e of ends) {
    const h = R.holdPoint(e);
    if (!h || !G.departurePoint(e)) { miss.push(`no hold for ${e}`); continue; }
    const thr = R.runwayEnd(e).thr, ho = def.holdOffset ?? 50, pl = (pts) => pts.slice(1).reduce((d, p, i) => d + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
    const lineUp = R.taxiPath(h[0], h[1], null, { threshold: e });
    if (Math.abs(Math.hypot(h[0] - thr[0], h[1] - thr[1]) - ho) > 2 || !lineUp || pl(lineUp) > ho + 3) miss.push(`hold ${e} is not ${ho} m up a stub from its threshold`);
    for (const s of def.stands) {
      const out = R.taxiPath(s.position[0], s.position[2], s.heading, { hold: e });
      const end = out?.[out.length - 1];
      if (!end || Math.hypot(end[0] - h[0], end[1] - h[1]) > 2 || out.length < 3) miss.push(`${s.id}→hold ${e}`);
      const th = R.runwayEnd(e).thr, back = R.taxiPath(th[0], th[1], null, { stand: s.id });
      if (!back || back.length < 3) miss.push(`${e}→${s.id}`);
    }
  }
  check(`${id}: holds for ${ends.join('/')} and every stand reaches every hold and back`, !miss.length, miss.slice(0, 6).join('; '));
}

// ---------- 4. native soak ----------
if (!args.nosoak) {
  const [{ Aircraft }, { Autopilot }, { Traffic }, R, { createATC }, { linkTraffic }] = await Promise.all([
    import('../js/flight/aircraft.js'), import('../js/flight/autopilot.js'), import('../js/flight/traffic.js'), import('../js/flight/routes.js'), import('../js/atc/index.js'), import('../js/atc/bridge.js')]);
  const AI_BAD = ['cut_in_final', 'forced_goaround', 'runway_steal', 'queue_jump', 'unauth_takeoff', 'unauth_landing', 'runway_incursion', 'taxiway_landing', 'grass_landing', 'apron_landing', 'wrong_way', 'closed_runway', 'near_miss', 'collision', 'separation_loss', 'double_occupancy', 'hard_landing', 'ignored_instruction', 'stand_steal', 'taxi_speeding'];
  const seeded = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
  const SOAKS = [
    ...(args.control ? [{ id: 'royal', types: ['c172', 'c172', 'tiger', 'bathtub'], max: 4, seed: 11 }] : []),
    { id: 'farm', types: ['c172', 'c172', 'tiger', 'bathtub'], max: 4, seed: 11 },
    { id: 'airbase', types: ['c172', 'c172', 'tiger', 'herc', 'f35', 'jumbo'], max: 4, seed: 23, oneJet: true },
  ];
  const mins = +(args.minutes || 30);
  for (const so of SOAKS) {
    if (args.only && args.only !== so.id) continue;
    L.registerAirport(defs[so.id]); L.setAirport(so.id);
    const rnd = seeded(so.seed), real = Math.random; Math.random = rnd;
    const Gm = makeGeometry(defs[so.id]);
    const env = { groundHeightAt: () => 0, surfaceAt: (x, z) => Gm.surfaceAt([x, z]), colliders: [] };
    const tr = new Traffic(env, {});
    const atc = createATC({ wind: defs[so.id].wind, detectCollisions: false });
    const link = linkTraffic(atc, tr, { rnd });
    const evs = []; atc.on('event', (e) => evs.push(e));
    const ai = [], st = { types: {}, arr: 0, dep: 0, crash: 0, stuck: 0, holdMax: 0, spawned: 0 };
    const JETS = ['jumbo', 'herc', 'f35'];
    const spawn = (kind, o = {}) => {
      let type = so.types[Math.floor(rnd() * so.types.length)];
      if (so.oneJet && JETS.includes(type) && ai.some((e) => JETS.includes(e.ac.type))) type = 'c172';
      const ac = new Aircraft({ type, id: `ac${++st.spawned}` });
      const plan = R.aiSpawn(kind, atc.activeRunway().end, { ...o, rnd, type, claimStand: () => tr.claimStand(ac) });
      if (!plan) return null;
      ac.place(plan.place, env);
      if (plan.stand) tr.standOwner.set(plan.stand, ac);
      const e = tr.add({ aircraft: ac, ap: new Autopilot(ac), name: `${kind}-${type}` });
      e.ap.setRoute(plan.route); e.last = { t: 0, x: ac.pos.x, z: ac.pos.z }; ai.push(e);
      return e;
    };
    const despawn = (e) => { atc.remove(link.idOf(e)); tr.remove(e); ai.splice(ai.indexOf(e), 1); };
    ['downwind', 'final', 'parked', 'parked'].slice(0, so.max).forEach((k, i) => spawn(k, { wait: i === 2 ? 3 : 35 }));
    let t = 0, respawn = 0;
    const dt = 1 / 60;
    for (; t < mins * 60; t += dt) {
      tr.update(dt); link.update(dt);
      for (const e of [...ai]) {
        for (const ev of e.ap.events.splice(0)) {
          if (ev.type === 'landed') { st.arr++; st.types[e.ac.type] = (st.types[e.ac.type] || 0) + 1; }
          if (ev.type === 'takeoffroll' && e.holdAt != null) { st.holdMax = Math.max(st.holdMax, t - e.holdAt); e.holdAt = null; }
        }
        for (const ev of e.ac.events.splice(0)) if (ev.type === 'crash') { st.crash++; if (!args.quiet) console.log(`  CRASH ${so.id} t=${t.toFixed(0)} ${e.name} ${ev.reason}`); }
        if (/HOLD/.test(e.ap.phase) && e.ac.onGround && e.holdAt == null) e.holdAt = t;
        const ac = e.ac;
        if (Math.hypot(ac.pos.x - e.last.x, ac.pos.z - e.last.z) > 5 || /PARK|BOARD|HOLD SHORT$|LINED UP/.test(e.ap.phase) || !ac.onGround) e.last = { t, x: ac.pos.x, z: ac.pos.z };
        else if (t - e.last.t > 240) { st.stuck++; e.last = { t, x: ac.pos.x, z: ac.pos.z }; if (!args.quiet) console.log(`  STUCK ${so.id} t=${t.toFixed(0)} ${e.name} ${e.ap.phase} ${ac.pos.x.toFixed(0)},${ac.pos.z.toFixed(0)}`); }
        if (e.ap.done && e.ap.phase === 'GONE') { st.dep++; despawn(e); }
        else if (ac.crashed) { e.deadT = (e.deadT || 0) + dt; if (e.deadT > 5) despawn(e); }
      }
      if (ai.length < so.max && (respawn -= dt) <= 0) { respawn = 12 + rnd() * 15; spawn(rnd() < 0.55 ? 'arrive' : 'depart', { wait: 2 }); }
    }
    Math.random = real;
    const bad = evs.filter((e) => AI_BAD.includes(e.type) && !e.isPlayer);
    const tag = `${so.id} soak ${mins} min (${[...new Set(so.types)].join('/')})`;
    const sum = `landed ${JSON.stringify(st.types)} arr ${st.arr} dep ${st.dep} GA ${atc.counts.goArounds || 0} holdMax ${st.holdMax.toFixed(0)}s stuck ${st.stuck} crash ${st.crash}`;
    check(`${tag}: no AI infractions or separation losses`, !bad.length, bad.slice(0, 4).map((e) => `${e.type}:${e.actor}@${e.t.toFixed(0)}`).join(', ') || sum);
    check(`${tag}: traffic flows (arrivals + departures, nobody stuck, no crash)`, st.arr >= mins * 0.12 && st.dep >= mins * 0.12 && !st.stuck && !st.crash && st.holdMax < 300, sum);
  }
  L.setAirport('royal');
}

console.log(`\n${pass}/${pass + fail} passed${args.break ? ` (broken on purpose: ${args.break})` : ''}`);
process.exit(fail ? 1 : 0);
