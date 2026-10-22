// Online session (docs/ONLINE.md §2–§7, §15): remote planes in the world, host-authoritative ATC + AI traffic,
// follower ATC replicas, inf/bank reports with host plausibility checks, the Court, radio floor control, podium.
// main.js hands over its objects once (createSession) and calls attach(player) / update(dt) / detach().
// O4: host migration from the replica (AI adopted, ATC + ledger kept, unacked reports resent and de-duplicated),
// the host's autopilot flying silent players' planes, player-vs-player contact with the room's protection rules.
// Ids: the local player is 'player' (ATC/RADIO/SCORE convention); on the wire every human is 'p:<netId>'.
import { RemoteTrack, AUTOPILOT_MS } from './interp.js';
import { KIND } from './link.js';
import { normalise } from './options.js';
import { showPodium } from './podium.js';
import { unpackState } from '../flight/netstate.js';
import { Aircraft } from '../flight/aircraft.js';
import { Autopilot } from '../flight/autopilot.js';
import { aiImpactHandler } from '../flight/traffic.js';
import { circuitRoute, arrivalRoute, departureRoute } from '../flight/routes.js';
import { STANDS } from '../world/layout.js';
import { createCourt } from '../game/court.js';
import { INFRACTIONS } from '../../data/rules.js';
import { RANKS } from '../../data/ranks.js';

const ATC_DELTA_MS = 200, ATC_KEY_MS = 1000, AI_MS = 100, ROSTER_MS = 1000, COURT_MS = 1000, META_MS = 10000;
const BARK_GAP_MS = 3000, FLOOR_QUEUE_MS = 1500, LINE_MS = 2500;
// Host owns these fields of a follower's own ATC strip; the follower keeps its own detector memory for the rest.
const AUTH_FIELDS = ['cmds', 'seqNo', 'follow', 'ext', 'issuedSeq', 'landEnd', 'rem', 'leg', 'stand'];
const ARRIVAL_RULES = new Set(['cut_in_final', 'forced_goaround']);
const GROUND_RULES = new Set(['queue_jump', 'unauth_takeoff', 'runway_steal', 'taxi_speeding', 'stand_steal', 'taxiway_landing', 'grass_landing', 'apron_landing', 'wrong_way', 'closed_runway']);
const AIR_RULES = new Set(['tower_buzz', 'terminal_buzz', 'low_pass', 'formation', 'near_miss']);
const INF_PER_MIN = 8;
const GAP_MS = 2500, BACK_WAIT_MS = 3000, AP_RESEND_MS = 2000, RESEND_DELAY_MS = 400, EARLY_MS = 3000;
const SPAWN_PROTECT_MS = 5000, STAND_R = 18, RAM_N = 3, RAM_MS = 60000, HIT_GAP_MS = 1000;
const HOST_MSGS = new Set(['atk', 'atd', 'ai', 'court', 'crown', 'radio', 'end', 'hinf', 'ap', 'apBack', 'scandal']);
const ROUTE_OF = { circuits: 'circuits', depart: 'departure', fullStop: 'arrival', park: 'park' };
const MINE = /(^|[|>])player($|[|>])/;

// Deep id rewrite for ATC JSON: exact strings, keys, and the composite keys ATC builds ('type|a|b', 'a>b', 'tower:a').
export function remapIds(obj, map) {
  const ids = Object.keys(map);
  if (!ids.length) return obj;
  const alt = ids.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length).join('|');
  const re = new RegExp(`(^tower:|^|[|>])(${alt})(?=$|[|>])`, 'g');
  const str = (s) => (s in map ? map[s] : s.length < 160 ? s.replace(re, (m, a, id) => a + map[id]) : s);
  const walk = (v) => (typeof v === 'string' ? str(v) : Array.isArray(v) ? v.map(walk)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [str(k), walk(x)])) : v);
  return walk(obj);
}

const J = (v) => JSON.stringify(v);
export function diffAtc(a, b) {
  const d = { top: {}, add: {}, mod: {}, del: [] };
  let n = 0;
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (k === 'strips') continue;
    if (J(a[k]) !== J(b[k])) { d.top[k] = b[k] ?? null; n++; }
  }
  const A = a.strips || {}, B = b.strips || {};
  for (const id in B) {
    if (!A[id]) { d.add[id] = B[id]; n++; continue; }
    const m = {};
    for (const f of new Set([...Object.keys(A[id]), ...Object.keys(B[id])])) if (J(A[id][f]) !== J(B[id][f])) m[f] = B[id][f] ?? null;
    if (Object.keys(m).length) { d.mod[id] = m; n++; }
  }
  for (const id in A) if (!B[id]) { d.del.push(id); n++; }
  return n ? d : null;
}
export function applyAtcDiff(s, d) {
  for (const k in d.top) s[k] = d.top[k];
  s.strips ||= {};
  for (const id in d.add) s.strips[id] = d.add[id];
  for (const id in d.mod) Object.assign(s.strips[id] ||= {}, d.mod[id]);
  for (const id of d.del) delete s.strips[id];
  return s;
}

function packTraffic(list) {
  const enc = new TextEncoder();
  const parts = list.map(({ id, bytes }) => ({ id: enc.encode(String(id).slice(0, 40)), bytes }));
  const out = new Uint8Array(2 + parts.reduce((n, p) => n + 1 + p.id.length + 32, 0));
  out[0] = KIND.TRAFFIC; out[1] = parts.length;
  let o = 2;
  for (const p of parts) { out[o++] = p.id.length; out.set(p.id, o); o += p.id.length; out.set(p.bytes, o); o += 32; }
  return out;
}
function unpackTraffic(b) {
  const dec = new TextDecoder(), out = [];
  let o = 2;
  for (let i = 0; i < b[1] && o < b.length; i++) {
    const n = b[o++], id = dec.decode(b.subarray(o, o + n)); o += n;
    out.push({ id, state: unpackState(b.subarray(o, o + 32)) }); o += 32;
  }
  return out;
}

export function createSession({ net, scene, traffic, wiring, createPlane, applyEnv = () => {}, env, career = null, ui = null, hud = null,
  attract = null, fx = null, log = () => {}, onExit = null } = {}) {
  const safe = (f, fb) => { try { return f(); } catch (e) { console.warn('[krayzee net]', e); return fb; } };
  let P = null, role = null, attached = false, gen = 0, court = null, podium = null, ended = false, roundEnd = null;
  let hostAtc = null, hostK = 0, hostRT = 0, restorePending = false, firstRestore = true;
  let sentAtc = null, atcK = 0, forceKey = true, courtDirty = true, floorFree = 0, myRank = -1, lastPP = null;
  const humans = new Map();      // peerId → { hi, rig, ac, ent, pending }
  const ais = new Map();         // ai id → { info, rig, ac, ent, track, pending }
  const ledger = new Map();      // 'p:id' → { acc, infs:[{rule,pp,t}], air, landed, banked, lastBark }
  const hiSent = new Set(), voices = new Map();
  // Rule-breaks only the host's authority can see (it does the forced re-sequence / go-around), keyed 'cid|rule|victim'.
  const hostDet = new Map(), scolded = new Map();
  let seenCut = null, seenGA = null;
  const T = { atcD: 0, atcK: 0, ai: 0, roster: 0, court: 0, meta: 0 };
  const dbg = { infs: [], acks: [], banks: [], barks: [], radioIn: [], crowns: [], ends: [], sentInf: [], hostDet: [],
    ap: [], resumed: [], adopted: [], resent: [], hits: [], hitsIn: [], scandals: [] };
  // O4 state. apHeld (host): peers whose plane our autopilot flies. heldPeers (follower): ditto, as the host announced.
  const apHeld = new Map(), heldPeers = new Set(), unacked = new Map(), rams = new Map();
  let hostLed = null, hostDetRep = null, meHeld = false, wantBack = false, heldSince = 0, lastUpd = 0, resendAt = 0, early = [];
  let seqN = 0, spawnRT = -1e9, impactPatch = null;
  // Test switches (tools/net/test-mp4.mjs falsification runs only).
  const debug = { noAdopt: false, noAp: false, noResend: false, noDedupe: false };
  const offs = [];
  let saved = null, atcPatch = null;
  // Other humans are players to ATC (spacing, cut-in memory, per-player outrage); the bridge only marks the local one.
  function patchAtc() {
    const A = atc();
    if (!A || atcPatch) return;
    const update = A.update;
    A.update = (dt, states, ...rest) => update.call(A, dt, states.map((s) => (s.remote && String(s.id).startsWith('p:') ? { ...s, isPlayer: true } : s)), ...rest);
    atcPatch = { atc: A, update };
  }

  const myCanon = () => `p:${net.id}`;
  const toCanon = (o) => remapIds(o, { player: myCanon() });
  const toLocal = (o) => remapIds(o, { [myCanon()]: 'player' });
  const canon = (id) => (id === 'player' ? myCanon() : id);
  const local = (id) => (id === myCanon() ? 'player' : id);
  const atc = () => wiring.atc;
  const radio = () => wiring.radio;
  const push = (arr, v) => { arr.push(v); if (arr.length > 40) arr.shift(); };
  const others = () => net.members.filter((m) => m.id !== net.id);
  const member = (id) => net.members.find((m) => m.id === id);
  const led = (id) => { let L = ledger.get(id); if (!L) ledger.set(id, (L = { acc: 0, infs: [], air: false, landed: false, banked: 0, lastBark: -1e9, ns: new Set(), bns: new Set() })); return L; };
  const mark = (set, n) => { set.add(n); if (set.size > 128) set.delete(set.values().next().value); };
  const ledJSON = () => Object.fromEntries([...ledger].map(([k, v]) => [k, { acc: v.acc, infs: v.infs, air: v.air, landed: v.landed, banked: v.banked, ns: [...v.ns], bns: [...v.bns] }]));
  const prot = () => normalise(net.room?.set || {}).protection;
  const titleOf = (rankIndex, g) => { const r = RANKS[Math.max(0, Math.min(RANKS.length - 1, rankIndex | 0))]; return g === 'f' ? r.f : r.m; };
  const nameOf = (cid) => { if (cid === myCanon()) return 'You'; const m = member(String(cid).slice(2)); return m ? m.name : String(cid); };

  // ---------------------------------------------------------------- roles
  function patchAttract(on) {
    if (!attract) return;
    if (on && !saved) {
      saved = { update: attract.update, seedRivals: attract.seedRivals };
      attract.update = () => { for (const e of [...attract.ai]) attract.despawn(e); };
      attract.seedRivals = async () => [];
      for (const e of [...attract.ai]) attract.despawn(e);
    } else if (!on && saved) {
      attract.update = saved.update; attract.seedRivals = saved.seedRivals; saved = null;
    }
  }
  function setRole(r) {
    if (r === role) return;
    const was = role;
    role = r;
    log('net.role', { role: r, was });
    safe(() => atc()?.configure({ authority: r === 'host', detectRemote: false, outragePerPlayer: true }));
    safe(() => radio()?.setMode(r === 'host' ? 'host' : 'follower'));
    if (r === 'host') {
      if (was === 'follower' && restorePending) safe(() => restoreAtc());
      patchAttract(false);
      if (was === 'follower') { adoptAI(); takeLedger(); }
      for (const id of [...ais.keys()]) { dropAI(id); safe(() => atc()?.remove(id)); }
      for (const id of heldPeers) net.hold(id, false);
      heldPeers.clear(); unacked.clear(); meHeld = false; hostAtc = null; sentAtc = null;
      forceKey = true; courtDirty = true; seenCut = seenGA = null;
      for (const k of Object.keys(T)) T[k] = 0;
      if (roundEnd == null) roundEnd = roundLength() ? net.roomTime() + roundLength() : null;
      for (const m of net.members) addCourtPlayer(m);
      if (was == null) clearStands();
      safe(() => traffic.setAIProtection?.(prot() === 'realistic' ? null : prot()));
    } else {
      for (const id of [...apHeld.keys()]) release(id, false);
      patchAttract(true);
    }
  }

  // ---------------------------------------------------------------- local autopilot for a remote plane
  function routeFor(intent, ac) {
    const end = wiring.activeEnd(), o = { type: ac.type };
    if (intent === 'depart') return departureRoute(end);
    if (intent === 'fullStop' || intent === 'park') return arrivalRoute(end, { ...o, then: departureRoute(end), from: [ac.pos.x, ac.pos.z] });
    return circuitRoute(end, o);
  }
  // A remote entry becomes a locally flown one (ATC sees it as local again and commands its autopilot), from where it is.
  function flyLocal(ent, intent) {
    const ac = ent.ac, ap = new Autopilot(ac);
    ap.traffic = traffic;
    ent.fakeAp = ent.ap; ent.ap = ap; ent.remote = false; ent.remotePose = false; ent.apOff = false;
    for (const k in ent.axis) { ent.axis[k].mode = 'auto'; ent.manual[k] = null; }
    ac.impactHandler = aiImpactHandler(prot());
    // Parked at a stand: sit a moment, then depart (as attract's parked AI). Anywhere else the autopilot rejoins its route.
    if (ac.onGround && ac.gs < 1 && inStand(ac.pos)) { const r = departureRoute(wiring.activeEnd()); ap.setRoute({ ...r, legs: [{ kind: 'park', seconds: 8, label: 'BOARDING' }, ...r.legs] }); }
    else { ap.setRoute(routeFor(intent, ac)); ap.replan(); }
    // A taxi leg that starts where it ends has a one-point path, which the autopilot's pursuit cannot follow.
    if (ap.cur?.path?.length === 1) ap.cur.path.push({ ...ap.cur.path[0] });
  }
  function unfly(ent) {
    traffic.releaseStand(ent.ac);
    ent.ap = ent.fakeAp || fakeAp('circuits'); ent.fakeAp = null;
    ent.remote = true; ent.remotePose = true; ent.ac.impactHandler = null;
  }

  // Host migration: the replica's AI planes keep their ids, strips and clearances and fly on from where they are.
  function adoptAI() {
    const ids = [];
    for (const [id, rec] of [...ais]) {
      if (debug.noAdopt || !attract || !rec.ent || !rec.ac || rec.ac.crashed) continue;
      flyLocal(rec.ent, rec.info?.intent || 'circuits');
      rec.ent.fakeAp = null; rec.ent.kind = rec.info?.intent || 'arrive'; rec.ent.type = rec.ac.type;
      attract.ai.push(rec.ent);
      if (!wiring.pilots?.has(id)) safe(() => wiring.addAI?.(rec.ent));
      ais.delete(id); voices.delete(id);
      ids.push(id);
    }
    // Aircraft ids come from a per-page counter: move ours past the adopted ones so a new AI never reuses an id.
    const top = Math.max(0, ...ids.map((i) => +(/^ac(\d+)$/.exec(i)?.[1] || 0)));
    for (let k = 0; k < 5000 && +(new Aircraft({}).id.slice(2)) <= top; k++);
    push(dbg.adopted, { ids, t: Math.round(net.roomTime()) });
  }
  function takeLedger() {
    if (hostLed) {
      ledger.clear();
      for (const [id, v] of Object.entries(hostLed)) {
        const L = led(id);
        Object.assign(L, { acc: v.acc || 0, infs: v.infs || [], air: !!v.air, landed: !!v.landed, banked: v.banked || 0 });
        if (!debug.noDedupe) { for (const n of v.ns || []) mark(L.ns, n); for (const n of v.bns || []) mark(L.bns, n); }
      }
    }
    for (const [k, t] of hostDetRep || []) hostDet.set(k, t);
  }

  // ---------------------------------------------------------------- host: autopilot for silent players (§9)
  function takeOver(id, rec, rt) {
    const intent = safe(() => atc()?.strip(`p:${id}`)?.intent, null) || 'circuits';
    flyLocal(rec.ent, intent);
    apHeld.set(id, { since: rt, sent: -1e9, back: false });
    net.broadcast({ t: 'ap', id: `p:${id}`, on: true });
    push(dbg.ap, { id: `p:${id}`, on: true, intent, t: Math.round(rt) });
  }
  function release(id, tell = true) {
    const rec = humans.get(id);
    if (rec?.ent) unfly(rec.ent);
    if (rec) rec.backAt = net.roomTime();
    apHeld.delete(id);
    if (tell) net.broadcast({ t: 'ap', id: `p:${id}`, on: false });
    push(dbg.ap, { id: `p:${id}`, on: false, t: Math.round(net.roomTime()) });
  }
  function apTick(rt) {
    for (const [id, rec] of humans) {
      if (!rec.ent || !rec.ac) continue;
      const tr = net.track(id), h = apHeld.get(id);
      if (!h) { if (!debug.noAp && tr?.samples.length && rt - Math.max(tr.lastRT, rec.backAt ?? -1e9) > AUTOPILOT_MS && !rec.ac.crashed) takeOver(id, rec, rt); }
      else if ((h.back || (tr && tr.lastRT > h.since)) && rt - h.sent > AP_RESEND_MS) {
        h.sent = rt;
        net.send(id, { t: 'apBack', s: Array.from(rec.ac.packState({ roomTimeMs: rt, hull: 100 })) });
      }
    }
  }
  // Follower: our plane comes back from the host's autopilot exactly where it flew it.
  function onApBack(m) {
    if (Array.isArray(m.s) && m.s.length === 32 && P) {
      const st = unpackState(Uint8Array.from(m.s));
      st.t = 0;
      safe(() => { P.ac.applyRemote([st], 0); P.ac.crashed = false; P.ap.replan(); atc()?.grace('player', 3); });
      push(dbg.resumed, { x: Math.round(st.pos.x), z: Math.round(st.pos.z), t: Math.round(net.roomTime()) });
    }
    meHeld = false;
    net.toHost({ t: 'apAck' });
  }
  // Only a running game loop asks for the plane back: a hidden page that merely receives messages must not.
  function iAmAway(now) { if (meHeld) return; meHeld = true; heldSince = now; wantBack = true; }

  // ---------------------------------------------------------------- player vs player contact (§2, §8)
  const inStand = (p) => STANDS.some((s) => Math.hypot(p.x - s.position[0], p.z - s.position[2]) < STAND_R);
  // Each victim judges its own contact against what it sees, with the room's protection; the host only keeps score.
  function pvpImpact(ac, orig, kind, reason, o) {
    const rt = net.roomTime(), oth = humans.get(String(o.other).slice(2));
    if (rt - spawnRT < SPAWN_PROTECT_MS || inStand(ac.pos) || (oth?.ac && inStand(oth.ac.pos))) return undefined;
    const t0 = ac._lastImpact;
    const r = orig.call(ac, kind, reason, o);
    if (ac._lastImpact === t0) return r;
    const hit = { t: 'hit', other: o.other, kt: Math.round(o.speedKt || 0), ov: !!P && traffic.modeOf(P) !== 'AUTOPILOT', res: wiring.lastImpact?.result || null };
    push(dbg.hits, { ...hit, at: Math.round(rt) });
    if (role === 'host') onHit(myCanon(), hit); else net.toHost(hit);
    return r;
  }
  // Blame goes to whoever was overriding; nobody when neither was. Realistic: 3 hits on the same player in 60 s = Royal Scandal.
  function onHit(reporter, m) {
    const rt = net.roomTime(), other = String(m.other || '');
    if (!other.startsWith('p:') || other === reporter) return;
    const oid = other.slice(2);
    const otherOv = other === myCanon() ? !!P && traffic.modeOf(P) !== 'AUTOPILOT' : apHeld.has(oid) ? false : !!net.track(oid)?.latest()?.overriding;
    const blame = otherOv ? other : null;
    push(dbg.hitsIn, { from: reporter, other, kt: m.kt, ov: !!m.ov, otherOv, blame, res: m.res, t: Math.round(rt) });
    if (!blame || prot() !== 'realistic') return;
    const key = `${blame}>${reporter}`, list = (rams.get(key) || []).filter((t) => t > rt - RAM_MS);
    if (list.length && rt - list[list.length - 1] < HIT_GAP_MS) return;
    list.push(rt);
    rams.set(key, list);
    if (list.length < RAM_N) return;
    rams.delete(key);
    push(dbg.scandals, { id: blame, victim: reporter, t: Math.round(rt) });
    const L = led(blame);
    L.acc = Math.round(L.acc * 0.75); courtDirty = true;
    net.broadcast({ t: 'radio', at: floor(rt, true) + 600, msg: { tower: true, line: 'scandal', about: blame, target: blame } });
    if (blame === myCanon()) royalScandal(); else net.send(oid, { t: 'scandal', why: 'ramming', victim: reporter });
  }
  function royalScandal() {
    safe(() => wiring.game?.handleEvent({ type: 'scandal', actor: 'player', t: Math.round(net.roomTime()), key: 'ramming' }));
    safe(() => hud?.flash?.('ROYAL SCANDAL · RAMMING', 'warn', 3));
  }
  function patchImpact() {
    const ac = P?.ac;
    if (!ac || impactPatch) return;
    const orig = ac._impact;
    ac._impact = function (kind, reason, o = {}) {
      if (kind === 'aircraft' && typeof o.other === 'string' && o.other.startsWith('p:')) return pvpImpact(this, orig, kind, reason, o);
      return orig.call(this, kind, reason, o);
    };
    impactPatch = { ac };
  }
  // The room's protection mode, not Free Flight's difficulty (wiring creates the game before the session attaches).
  function applyProtection() {
    const s = normalise(net.room?.set || {}), g = wiring.game;
    if (g?.serialize && g.restore) safe(() => {
      const j = g.serialize();
      j.protectionMode = s.protection;
      j.protection = s.protection === 'partial' ? s.partialStart : s.protection === 'rubber' ? 100 : 0;
      g.restore(j);
    });
  }
  const roundLength = () => { const s = normalise(net.room?.set || {}); return s.type === 'coronation' || s.type === 'joust' ? 0 : (s.minutes || 0) * 60000; };

  // ---------------------------------------------------------------- remote planes
  function fakeAp(intent) { return { route: { name: ROUTE_OF[intent] || 'circuits', legs: [] }, events: [], leg: null, sub: null, phase: 'REMOTE', status: () => ({}) }; }

  async function makeRig(rec, { id, type, livery }) {
    const g = gen;
    rec.pending = true;
    const rig = await createPlane({ type: type || 'c172', livery, quality: 'low', cockpit: false });
    rec.pending = false;
    if (g !== gen || rec.gone) { rig.dispose?.(); return; }
    safe(() => rig.setView?.('chase'));
    rig.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    safe(() => applyEnv(rig));
    rig.root.visible = false;
    scene.add(rig.root);
    rec.rig = rig;
    rec.ac = new Aircraft({ id, type: type || 'c172', dims: rig.dims });
  }
  function enter(rec, id, { name, kind, intent, color, label }) {
    const ent = traffic.add({ aircraft: rec.ac, rig: rec.rig, remote: true, name });
    ent.remotePose = true; ent.netKind = kind; ent.ap = fakeAp(intent);
    ent.marker = { id, kind: kind === 'human' ? 'player' : 'traffic', label, color, worldPos: [0, 0, 0] };
    safe(() => fx?.track(id, { rig: rec.rig, ac: rec.ac }));
    rec.ent = ent;
  }
  function drive(rec, tr, rt) {
    if (!rec.ac || !tr || !tr.samples.length) return null;
    const s = rec.ac.applyRemote(tr.samples, tr.renderMs(rt));
    const ac = rec.ac;
    ac.groundY = env.groundHeightAt(ac.pos.x, ac.pos.z);
    ac.agl = ac.pos.y - ac.groundY - ac.aglRef;
    const r = rec.rig.root;
    r.position.set(ac.pos.x, ac.pos.y, ac.pos.z); r.quaternion.set(ac.q.x, ac.q.y, ac.q.z, ac.q.w);
    r.visible = true;
    if (rec.ent) rec.ent.apOff = !!tr.latest()?.overriding;
    rec.st = s;
    return s;
  }
  function removeRec(rec) {
    rec.gone = true;
    if (rec.ent) { safe(() => wiring.removeAI(rec.ent)); safe(() => fx?.untrack(rec.ac.id)); traffic.remove(rec.ent); }
    if (rec.rig) { rec.rig.root.removeFromParent(); safe(() => rec.rig.dispose()); }
    rec.ent = rec.rig = rec.ac = null;
  }

  function registerHuman(id, rec) {
    const m = member(id), cid = `p:${id}`, hi = rec.hi || {};
    const ri = court?.rankIndexOf(cid) ?? 0;
    const title = ri > 0 || court?.holder === cid ? titleOf(ri, m?.g || hi.g) : hi.title || m?.title || '';
    const name = m?.name || hi.name || 'Pilot';
    safe(() => radio()?.registerPilot({ id: cid, name, title, voice: m?.voice || hi.voice || 'toff', color: hi.livery?.primary, registration: hi.livery?.registration, flightNo: m?.call, human: true }));
    safe(() => wiring.pilots?.set(cid, { title, name }));
    if (rec.ent?.marker) rec.ent.marker.label = `${title} ${name}`.trim();
    if (m?.voice && voices.get(cid) !== m.voice) { voices.set(cid, m.voice); safe(() => radio()?.preloadVoice(m.voice)); }
  }
  function ensureHuman(id, hi) {
    let rec = humans.get(id);
    if (rec && rec.hi && rec.hi.type !== hi.type) { removeRec(rec); humans.delete(id); rec = null; }
    if (!rec) { humans.set(id, (rec = { hi })); makeRig(rec, { id: `p:${id}`, type: hi.type, livery: hi.livery }).catch((e) => console.warn('[krayzee net] rig', e)); }
    else { rec.hi = hi; safe(() => rec.rig?.setLivery?.(hi.livery)); }
    registerHuman(id, rec);
  }
  function dropHuman(id) {
    const rec = humans.get(id);
    if (rec) { if (rec.ac) traffic.releaseStand(rec.ac); removeRec(rec); humans.delete(id); }
    apHeld.delete(id); heldPeers.delete(id); hiSent.delete(id); net.hold?.(id, false);
    safe(() => court && role === 'host' && court.removePlayer(`p:${id}`, net.roomTime()));
  }

  function ensureAI(info) {
    let rec = ais.get(info.id);
    if (rec?.info && rec.info.type !== info.type) { removeRec(rec); rec = null; ais.delete(info.id); }
    if (!rec) ais.set(info.id, (rec = { track: new RemoteTrack() }));
    if (!rec.info) {
      rec.info = info;
      makeRig(rec, { id: info.id, type: info.type, livery: info.livery }).catch((e) => console.warn('[krayzee net] ai rig', e));
    }
    rec.info = info;
    if (rec.ent) rec.ent.ap.route.name = ROUTE_OF[info.intent] || 'circuits';
    if (voices.get(info.id) !== info.voice && info.voice) {
      voices.set(info.id, info.voice);
      safe(() => radio()?.registerPilot({ id: info.id, name: info.name, title: info.title, voice: info.voice, color: info.livery?.primary, registration: info.livery?.registration }));
      safe(() => wiring.pilots?.set(info.id, { title: info.title, name: info.name }));
    }
  }
  function dropAI(id) { const rec = ais.get(id); if (rec) { removeRec(rec); ais.delete(id); } voices.delete(id); }

  // ---------------------------------------------------------------- spawn
  const standOf = (id) => STANDS[((Math.max(0, net.members.findIndex((m) => m.id === id)) * 2) + 1) % STANDS.length];
  function clearStands() { for (const m of net.members) { const s = standOf(m.id); safe(() => attract?.clearAround(s.position[0], s.position[2], 30)); } }
  function placeAtStand() {
    const s = standOf(net.id);
    if (!s || !P) return;
    safe(() => attract?.clearAround(s.position[0], s.position[2], 30));
    P.ac.place({ x: s.position[0], z: s.position[2], heading: s.heading }, env);
    spawnRT = net.roomTime();
    safe(() => P.ap.setRoute(circuitRoute(wiring.activeEnd(), { type: P.ac.type || 'c172' })));
    safe(() => wiring.link?.placed(P, 8));
  }

  // ---------------------------------------------------------------- hello
  function myHi() {
    const p = safe(() => ui?.getProfile?.(), {}) || {};
    const livery = safe(() => (ui?.getLivery ? ui.getLivery() : p), p);
    return { t: 'hi', type: P?.ac.type || 'c172', livery, name: p.name, title: p.title, g: p.gender, voice: p.voice };
  }
  function sayHi(to) { if (!P) return; const h = myHi(); if (to) net.send(to, h); else net.broadcast(h); }

  // ---------------------------------------------------------------- court
  function addCourtPlayer(m) {
    if (!court || court.standings().some((p) => p.id === `p:${m.id}`)) return;
    court.addPlayer(`p:${m.id}`, { name: m.name, gender: m.g, emperorEarned: !!m.emp, human: true }, net.roomTime());
  }
  function syncRank() {
    const i = court?.rankIndexOf(myCanon()) ?? 0;
    if (i === myRank) return;
    myRank = i;
    const p = safe(() => ui?.getProfile?.(), {}) || {};
    safe(() => wiring.game?.setRankIndex?.(i));
    if (i > 0 || court?.holder === myCanon()) safe(() => radio()?.setPlayer({ title: titleOf(i, p.gender) }));
    for (const [id, rec] of humans) registerHuman(id, rec);
  }
  function onCrown(cid, emperor) {
    push(dbg.crowns, { id: cid, emperor, t: Math.round(net.roomTime()) });
    const lid = local(cid);
    if (role === 'host') safe(() => radio()?.handleEvent({ type: 'crownChange', actor: lid }));
    if (lid === 'player') {
      safe(() => hud?.flash?.(emperor ? 'YOU HOLD THE IMPERIAL CROWN' : 'YOU HOLD THE CROWN', 'good', 3));
      if (role !== 'host') safe(() => radio()?.openResponse('You have the Crown', ['landing_brag', 'insult'], { target: 'tower', cause: 'crown' }));
    } else safe(() => hud?.flash?.(`${nameOf(cid).toUpperCase()} TAKES THE CROWN`, 'info', 2.5));
    syncRank();
  }

  // ---------------------------------------------------------------- host: reports from followers
  function onInf(from, m) {
    const id = `p:${from}`, rule = INFRACTIONS[m.rule], rt = net.roomTime(), L = led(id);
    if (m.n != null && L.ns.has(m.n)) { push(dbg.infs, { id, rule: m.rule, n: m.n, ok: true, dup: true, pp: 0, t: Math.round(rt) }); net.send(from, { t: 'infAck', n: m.n, ok: true, dup: true, pp: 0 }); return true; }
    const verdict = (ok, why, pp = 0) => {
      if (m.n != null) mark(L.ns, m.n);
      courtDirty = true;
      push(dbg.infs, { id, rule: m.rule, n: m.n, ok, why, pp, t: Math.round(rt) }); net.send(from, { t: 'infAck', n: m.n, ok, why, pp }); return ok;
    };
    if (!rule || !(rule.pp > 0)) return verdict(false, 'rule');
    const strip = safe(() => atc()?.strip(id), null), lat = net.track(from)?.latest();
    if (!strip || !lat) return verdict(false, 'unknown plane');
    const hk = `${id}|${m.rule}|${m.victim ?? ''}`, seenByHost = rt - (hostDet.get(hk) ?? -1e9) < 30000;
    hostDet.delete(hk);
    if (!seenByHost) {
    const seq = safe(() => Object.values(atc()._debug().S.seqs).some((q) => q.includes(id)), false);
    if (ARRIVAL_RULES.has(m.rule) && (lat.onGround || (!seq && !['final', 'landing', 'circuit'].includes(strip.state)))) return verdict(false, 'not in an arrival sequence');
    if (AIR_RULES.has(m.rule) && lat.onGround && !L.air) return verdict(false, 'on the ground');
    if (GROUND_RULES.has(m.rule) && !lat.onGround && !(strip.state || '').match(/takeoff|climbout|rollout|landing|taxi|lineup|holding/)) return verdict(false, 'airborne');
    }
    L.infs = L.infs.filter((x) => x.t > rt - 60000);
    if (L.infs.length >= INF_PER_MIN) return verdict(false, 'rate');
    const cap = rule.pp * 2.5 * 2.5 * 2 + (rule.cap || 0);
    const pp = Math.max(0, Math.min(cap, Math.round(+m.pp || rule.pp)));
    L.acc += pp; L.infs.push({ rule: m.rule, pp, t: rt });
    const victim = m.victim ? local(m.victim) : null;
    if (!seenByHost) safe(() => atc()?.report(m.rule, id, { victim, severity: m.severity || 1, data: m.data || {} }));
    if (victim !== 'player' && rule.scold) safe(() => radio()?.say('tower', rule.scold, { about: id, delay: 0.7 }));
    return verdict(true, '', pp);
  }
  function onBank(from, m) {
    const id = `p:${from}`, L = led(id), rt = net.roomTime();
    const amount = Math.max(0, Math.round(+m.amount || 0));
    if (m.n != null && L.bns.has(m.n)) { push(dbg.banks, { id, ok: true, dup: true, amount }); net.send(from, { t: 'bankAck', n: m.n, ok: true, dup: true }); return; }
    if (m.n != null) mark(L.bns, m.n);
    courtDirty = true;
    if (!L.landed) { push(dbg.banks, { id, ok: false, why: 'no landing', amount }); net.send(from, { t: 'bankAck', n: m.n, ok: false, why: 'no landing' }); return; }
    const ok = Math.min(amount, Math.round(L.acc * 1.1 + 400));
    L.acc = 0; L.landed = false; L.banked += ok;
    push(dbg.banks, { id, ok: true, amount, credited: ok });
    safe(() => court.addPP(id, ok, rt));
    net.send(from, { t: 'bankAck', n: m.n, ok: true, credited: ok });
  }
  // Floor control between humans: one bark at a time, a bark that would wait > 1.5 s is dropped. Tower and AI lines
  // already come out of the host's own radio director one at a time, and the director gives the tower priority.
  function floor(rt, tower = false) {
    if (tower) return rt + 80;
    const at = Math.max(rt + 120, floorFree);
    if (at - rt > FLOOR_QUEUE_MS) return null;
    floorFree = at + LINE_MS;
    return at;
  }
  function onBark(from, m) {
    const id = `p:${from}`, L = led(id), rt = net.roomTime();
    if (rt - L.lastBark < BARK_GAP_MS) { push(dbg.barks, { id, ok: false, why: 'spam' }); return; }
    const at = floor(rt);
    if (at == null) { push(dbg.barks, { id, ok: false, why: 'floor busy' }); return; }
    L.lastBark = rt;
    const msg = { speaker: id, intent: String(m.intent || ''), variant: m.variant, target: m.target ?? null };
    push(dbg.barks, { id, ok: true, intent: msg.intent, at: Math.round(at) });
    safe(() => radio()?.schedule(performance.now() + (at - rt), remapIds(msg, { [myCanon()]: 'player' })));
    for (const o of others()) if (o.id !== from) net.send(o.id, { t: 'radio', at, msg });
  }

  // ---------------------------------------------------------------- follower: host state
  function onAtcMsg(m) {
    if (m.t === 'atk') { hostAtc = m.s; hostK = m.k; }
    else { if (!hostAtc || m.k !== hostK) return; applyAtcDiff(hostAtc, m.d); }
    hostRT = m.rt; restorePending = true;
  }
  function restoreAtc() {
    restorePending = false;
    const A = atc();
    if (!A || !hostAtc) return;
    const prev = A.serialize();
    const s = toLocal(hostAtc);
    const mine = prev.strips?.player, hs = s.strips?.player;
    if (mine && hs && !firstRestore) {
      const keep = { ...mine };
      for (const f of AUTH_FIELDS) keep[f] = hs[f];
      keep.penaltyUntil = Math.max(mine.penaltyUntil ?? -1e9, hs.penaltyUntil ?? -1e9);
      s.strips.player = keep;
    }
    if (s.strips?.player) { s.strips.player.local = true; s.strips.player.isPlayer = true; }
    if (!firstRestore) for (const k of ['cool', 'cutDone', 'pairs']) for (const key in prev[k] || {}) if (MINE.test(key)) (s[k] ||= {})[key] = prev[k][key];
    s.evSeq = Math.max(s.evSeq || 0, prev.evSeq || 0);
    s.log = prev.log || [];
    s.t = (hostAtc.t || 0) + Math.max(0, net.roomTime() - hostRT) / 1000;
    A.restore(s);
    firstRestore = false;
  }
  function onRadioMsg(m) {
    const msg = toLocal(m.msg);
    if (msg.speaker && !msg.tower && msg.voice && voices.get(msg.speaker) !== msg.voice && !String(msg.speaker).startsWith('p:')) {
      voices.set(msg.speaker, msg.voice);
      safe(() => radio()?.registerPilot({ id: msg.speaker, name: msg.name || msg.speaker, title: msg.title || '', voice: msg.voice }));
    }
    push(dbg.radioIn, { ...msg, at: Math.round(m.at) });
    safe(() => radio()?.schedule(performance.now() + (m.at - net.roomTime()), msg));
  }

  // ---------------------------------------------------------------- end of round
  function endRound() {
    if (role !== 'host' || ended || !court) return null;
    const res = court.finish(net.roomTime());
    net.broadcast({ t: 'end', res });
    onEnd(res);
    safe(() => net.setPhase('podium'));
    return res;
  }
  function onEnd(res) {
    if (ended) return;
    ended = true;
    push(dbg.ends, { winner: res.winner, counted: res.countsAsWin });
    const humansIn = (res.standings || []).filter((p) => p.human).length;
    const won = !!res.countsAsWin && res.winner === myCanon();
    safe(() => { if (humansIn >= 2) career?.addOnlineRoom?.(); if (won) career?.addOnlineWin?.(); });
    const p = safe(() => ui?.getProfile?.(), {}) || {};
    podium = showPodium({
      standings: (res.standings || []).map((s) => ({ ...s, you: s.id === myCanon(), name: s.id === myCanon() ? p.name || s.name : s.name, title: titleOf(s.rankIndex, s.gender) })),
      winner: res.winner, counted: !!res.countsAsWin, won,
      onClose: () => { podium = null; onExit?.(); },
    });
  }

  // ---------------------------------------------------------------- messages
  function onMsg(from, m) {
    if (!attached || !m || typeof m.t !== 'string') return;
    if (net.isHost && role !== 'host' && net.room) setRole('host');
    const fromHost = from === net.hostId;
    switch (m.t) {
      case 'hi': if (m.livery && typeof m.livery === 'object') ensureHuman(from, m); if (!hiSent.has(from)) { hiSent.add(from); sayHi(from); } break;
      case 'inf': if (role === 'host') onInf(from, m); break;
      case 'bank': if (role === 'host') onBank(from, m); break;
      case 'bark': if (role === 'host') onBark(from, m); break;
      case 'hit': if (role === 'host') onHit(`p:${from}`, m); break;
      case 'back': if (role === 'host') { const h = apHeld.get(from); if (h) h.back = true; else net.send(from, { t: 'apBack', s: null }); } break;
      case 'apAck': if (role === 'host' && apHeld.has(from)) release(from); break;
      case 'infAck': push(dbg.acks, m); unacked.delete(`i${m.n}`); break;
      case 'bankAck': push(dbg.acks, m); unacked.delete(`b${m.n}`); break;
      default:
        if (role === 'host') return;
        // A new host's first messages can beat the server's room update here: keep them for the 'host' event.
        if (!fromHost) { if (HOST_MSGS.has(m.t)) { early.push({ from, m, at: performance.now() }); if (early.length > 80) early.shift(); } return; }
        if (m.t === 'atk' || m.t === 'atd') onAtcMsg(m);
        else if (m.t === 'ai') { const ids = new Set(m.list.map((a) => a.id)); for (const a of m.list) ensureAI(a); for (const id of [...ais.keys()]) if (!ids.has(id)) dropAI(id); }
        else if (m.t === 'court') { safe(() => court?.restore(m.s)); if (m.end !== undefined) roundEnd = m.end; if (m.led) hostLed = m.led; if (m.hd) hostDetRep = m.hd; syncRank(); }
        else if (m.t === 'ap') {
          if (m.id === myCanon()) { if (m.on) iAmAway(lastUpd || performance.now()); else meHeld = false; }
          else if (typeof m.id === 'string' && m.id.startsWith('p:')) { const id = m.id.slice(2); net.hold(id, !!m.on); if (m.on) heldPeers.add(id); else heldPeers.delete(id); }
        }
        else if (m.t === 'apBack') onApBack(m);
        else if (m.t === 'scandal') royalScandal();
        else if (m.t === 'crown') onCrown(m.id, m.emperor);
        else if (m.t === 'radio') onRadioMsg(m);
        else if (m.t === 'end') onEnd(m.res);
        else if (m.t === 'hinf' && INFRACTIONS[m.rule]) safe(() => atc()?.report(m.rule, 'player', { victim: m.victim ? local(m.victim) : null, severity: m.severity || 1, data: m.data || {} }));
    }
  }
  function onData(peer, bytes) {
    if (!attached || bytes[0] !== KIND.TRAFFIC || peer !== net.hostId || role === 'host') return;
    const rt = net.roomTime();
    for (const { id, state } of unpackTraffic(bytes)) {
      if (id.startsWith('p:')) { const peer = id.slice(2); if (peer !== net.id && net.held(peer)) net.pushState(peer, state); continue; }
      let rec = ais.get(id);
      if (!rec) ais.set(id, (rec = { track: new RemoteTrack() }));
      rec.track.push(state, rt);
    }
  }
  function onRoom() {
    if (!attached) return;
    const ids = new Set(net.members.map((m) => m.id));
    for (const id of [...humans.keys()]) if (!ids.has(id)) dropHuman(id);
    for (const m of others()) if (!hiSent.has(m.id)) { hiSent.add(m.id); sayHi(m.id); }
    if (role === 'host') {
      for (const m of net.members) addCourtPlayer(m);
      for (const id of court.standings().map((p) => p.id)) if (!ids.has(id.slice(2))) court.removePlayer(id, net.roomTime());
      forceKey = true; courtDirty = true; T.roster = 0;
    }
    if (net.me?.call && wiring.flightNo !== net.me.call) { wiring.flightNo = net.me.call; safe(() => wiring.refreshProfile()); }
  }

  // ---------------------------------------------------------------- per frame
  // The host's ATC runs remote planes with detection off (their owners detect their own crimes), but a cut-in forced
  // by a spacing go-around and the go-around itself only happen in the authority's sequencing. Spot those for remote
  // humans, log them on the host and tell the culprit, whose replica then scores and reports them as usual.
  function hostDetect(rt) {
    const S = atc()?._debug?.().S;
    if (!S) return;
    const human = (id) => typeof id === 'string' && id.startsWith('p:') && id !== myCanon() && humans.has(id.slice(2));
    const first = !seenCut;
    seenCut ||= {}; seenGA ||= {};
    const found = [];
    for (const [k, t] of Object.entries(S.cutDone || {})) {
      if (seenCut[k] === t) continue;
      seenCut[k] = t;
      const [actor, victim] = k.split('>');
      if (!first && human(actor)) {
        const gap = (S.strips[victim]?.rem ?? 0) - (S.strips[actor]?.rem ?? 0);
        found.push({ actor, rule: 'cut_in_final', victim, severity: gap < 400 ? 3 : gap < 1000 ? 2 : 1, data: { gap: Math.round(gap), close: gap < 400 } });
      }
    }
    for (const id in S.strips) {
      const ga = S.strips[id].cmds?.goAround;
      if (!ga || seenGA[id] === ga.seq) continue;
      seenGA[id] = ga.seq;
      if (!first && human(ga.cause) && ga.cause !== id) found.push({ actor: ga.cause, rule: 'forced_goaround', victim: id, severity: 2, data: { reason: ga.reason } });
    }
    for (const f of found) {
      const victim = canon(f.victim);
      hostDet.set(`${f.actor}|${f.rule}|${victim}`, rt);
      push(dbg.hostDet, { id: f.actor, rule: f.rule, victim, t: Math.round(rt) });
      safe(() => atc().report(f.rule, f.actor, { victim: f.victim, severity: f.severity, data: f.data }));
      // The host's director treats a remote human like AI traffic and may let the scold go stale; the culprit hears it regardless.
      const scold = INFRACTIONS[f.rule]?.scold;
      if (scold && rt - (scolded.get(f.actor) ?? -1e9) > 8000) {
        scolded.set(f.actor, rt);
        net.broadcast({ t: 'radio', at: floor(rt, true) + 700, msg: { tower: true, line: scold, about: f.actor, target: f.actor, rwy: wiring.activeEnd?.(), respond: { kind: 'Tower is cross', intents: ['apology', 'priority', 'complain'] } } });
      }
      net.send(f.actor.slice(2), { t: 'hinf', rule: f.rule, victim, severity: f.severity, data: f.data });
    }
  }

  function hostTick(now, rt) {
    hostDetect(rt);
    if (now - T.ai >= AI_MS) {
      T.ai = now;
      const list = (attract?.ai || []).filter((e) => e.ac).slice(0, 60).map((e) => ({ id: wiring.idOf(e), bytes: e.ac.packState({ roomTimeMs: rt, hull: 100, overriding: false }) }));
      for (const id of apHeld.keys()) { const ac = humans.get(id)?.ac; if (ac) list.push({ id: `p:${id}`, bytes: ac.packState({ roomTimeMs: rt, hull: 100, overriding: false }) }); }
      if (list.length) { const b = packTraffic(list); for (const o of others()) net.net.sendTo(o.id, 'u', b); }
    }
    if (now - T.roster >= ROSTER_MS) {
      T.roster = now;
      const list = (attract?.ai || []).map((e) => {
        const id = wiring.idOf(e), pl = wiring.pilots?.get(id) || {};
        return { id, type: e.type || e.ac.type, livery: safe(() => e.rig?.livery?.(), null), name: pl.name || e.name, title: pl.title || '', intent: safe(() => atc()?.strip(id)?.intent, null) || 'circuits' };
      });
      net.broadcast({ t: 'ai', list });
    }
    if (atc() && (forceKey || now - T.atcK >= ATC_KEY_MS || now - T.atcD >= ATC_DELTA_MS)) {
      const s = toCanon(atc().serialize());
      delete s.log;
      if (forceKey || now - T.atcK >= ATC_KEY_MS || !sentAtc) {
        forceKey = false; T.atcK = T.atcD = now; atcK++;
        net.broadcast({ t: 'atk', k: atcK, s, rt });
      } else {
        T.atcD = now;
        const d = diffAtc(sentAtc, s);
        if (d) net.broadcast({ t: 'atd', k: atcK, d, rt });
      }
      sentAtc = s;
    }
    if (courtDirty || now - T.court >= COURT_MS) { courtDirty = false; T.court = now; net.broadcast({ t: 'court', s: court.serialize(), end: roundEnd, led: ledJSON(), hd: [...hostDet] }); }
    if (now - T.meta >= META_MS) {
      T.meta = now;
      const h = court.holder;
      safe(() => net.meta(h ? `${titleOf(court.rankIndexOf(h), court.standings().find((p) => p.id === h)?.gender)} ${nameOf(h) === 'You' ? safe(() => ui?.getProfile?.().name, '') : nameOf(h)}` : '', roundEnd ? Math.max(0, (roundEnd - rt) / 1000) : 0));
    }
    apTick(rt);
    for (const [id, rec] of humans) {
      const lat = apHeld.has(id) ? rec.ac : net.track(id)?.latest();
      if (!lat) continue;
      const L = led(`p:${id}`);
      if (!lat.onGround) L.air = true;
      else if (L.air) { L.air = false; L.landed = true; }
    }
    if (roundEnd && rt >= roundEnd && !ended) endRound();
  }

  function update(dt) {
    if (!attached) return;
    const now = performance.now(), rt = net.roomTime();
    const want = net.isHost ? 'host' : 'follower';
    if (net.room && want !== role) setRole(want);
    // A frozen or backgrounded page (iOS) wakes up here: the host may have been flying us. Ask before sending a stale pose.
    if (lastUpd && now - lastUpd > GAP_MS && role === 'follower') iAmAway(now);
    lastUpd = now;
    if (wantBack) { wantBack = false; heldSince = now; net.toHost({ t: 'back' }); }
    if (meHeld && now - heldSince > BACK_WAIT_MS) meHeld = false;
    if (resendAt && now >= resendAt && role === 'follower') {
      resendAt = 0;
      if (!debug.noResend) for (const m of unacked.values()) net.toHost(m);
      push(dbg.resent, { n: unacked.size, to: net.hostId, skipped: debug.noResend });
    }
    if (P && net.room && !meHeld) safe(() => net.sendPlane(P.ac, { hull: P.ac.crashed ? 0 : 100, overriding: traffic.modeOf(P) !== 'AUTOPILOT' }, now));
    for (const [id, rec] of humans) {
      const tr = net.track(id);
      if (!rec.ent && rec.ac && tr?.samples.length) { enter(rec, `p:${id}`, { name: member(id)?.name || rec.hi?.name, kind: 'human', intent: 'circuits', color: rec.hi?.livery?.primary, label: '' }); registerHuman(id, rec); }
      if (!apHeld.has(id)) safe(() => drive(rec, tr, rt));
    }
    if (role === 'follower') {
      for (const [id, rec] of ais) {
        if (!rec.ent && rec.ac && rec.track.samples.length) enter(rec, id, { name: rec.info?.livery?.registration || id, kind: 'ai', intent: rec.info?.intent, color: rec.info?.livery?.primary, label: rec.info ? `${rec.info.title} ${rec.info.name}`.trim() : id });
        safe(() => drive(rec, rec.track, rt));
      }
      if (restorePending) safe(() => restoreAtc());
    } else if (role === 'host') safe(() => hostTick(now, rt));
  }

  // ---------------------------------------------------------------- attach / detach
  function attach(player) {
    if (attached) detach();
    attached = true; gen++; P = player; role = null; ended = false; myRank = -1; firstRestore = true;
    hostAtc = null; sentAtc = null; forceKey = true; courtDirty = true; floorFree = 0;
    hiSent.clear(); ledger.clear(); voices.clear(); hostDet.clear(); scolded.clear();
    apHeld.clear(); heldPeers.clear(); unacked.clear(); rams.clear(); early = [];
    hostLed = hostDetRep = null; meHeld = wantBack = false; lastUpd = 0; resendAt = 0; seqN = Date.now() % 1e9;
    const set = normalise(net.room?.set || {});
    court = createCourt({ roomType: set.type, target: set.target });
    roundEnd = null;
    if (net.me?.call) { wiring.flightNo = net.me.call; safe(() => wiring.refreshProfile()); }
    patchAtc();
    applyProtection();
    patchImpact();
    setRole(net.isHost ? 'host' : 'follower');
    placeAtStand();
    offs.push(net.on('msg', onMsg), net.on('data', onData), net.on('room', onRoom), net.on('peerLeft', dropHuman),
      // Removed from the room (idle in a public room, kicked, or the reconnect ran out): back to the lobby.
      net.on('kicked', (m) => { if (attached) safe(() => hud?.flash?.(String(m.msg || 'Removed from the room').toUpperCase(), 'warn', 3)); }),
      net.on('left', () => { if (attached) setTimeout(() => { if (attached && !net.room) onExit?.(); }, 1500); }),
      net.on('host', (h) => {
        if (!attached) return;
        setRole(h.me ? 'host' : 'follower');
        if (h.me) return;
        resendAt = performance.now() + RESEND_DELAY_MS;
        const now = performance.now(), keep = early.filter((e) => e.from === h.host && now - e.at < EARLY_MS);
        early = [];
        for (const e of keep) onMsg(e.from, e.m);
      }));
    offs.push(court.on('standings', () => { courtDirty = true; syncRank(); }));
    offs.push(court.on('crownChange', (c) => { if (role !== 'host') return; net.broadcast({ t: 'crown', id: c.to, emperor: c.emperor }); onCrown(c.to, c.emperor); }));
    offs.push(court.on('winner', () => { if (role === 'host') endRound(); }));
    const g = wiring.game;
    if (g) {
      offs.push(g.on('pp', (e) => { lastPP = e; }));
      offs.push(g.on('banked', (e) => {
        if (role === 'host') { const L = led(myCanon()); L.banked += e.amount; safe(() => court.addPP(myCanon(), e.amount, net.roomTime())); }
        else { const m = { t: 'bank', n: ++seqN, amount: e.amount }; unacked.set(`b${m.n}`, m); net.toHost(m); }
      }));
    }
    if (atc()) offs.push(atc().on('event', (ev) => {
      if (role === 'host' || ev.actor !== 'player' || !INFRACTIONS[ev.type] || !(ev.pp > 0)) return;
      const pp = lastPP && lastPP.id === ev.type ? lastPP.amount : ev.pp;
      const m = { t: 'inf', n: ++seqN, rule: ev.type, victim: ev.victim ? canon(ev.victim) : null, severity: ev.severity, pp, data: ev.data, rt: Math.round(net.roomTime()) };
      push(dbg.sentInf, m);
      unacked.set(`i${m.n}`, m);
      net.toHost(m);
    }));
    if (radio()) {
      offs.push(radio().on('barked', (b) => {
        const rt = net.roomTime(), target = b.target != null ? canon(b.target) : null;
        if (role === 'host') {
          floorFree = Math.max(floorFree, rt + LINE_MS);
          net.broadcast({ t: 'radio', at: rt, msg: { speaker: myCanon(), intent: b.intent, variant: b.variant, target } });
        } else net.toHost({ t: 'bark', intent: b.intent, variant: b.variant, target });
      }));
      offs.push(radio().on('line', (l) => {
        if (role !== 'host' || l.speaker === 'player' || String(l.speaker).startsWith('p:')) return;
        const rt = net.roomTime(), tower = l.speaker === 'tower';
        if (tower && /^scold/.test(l.intent || '') && rt - (scolded.get(canon(l.target)) ?? -1e9) < 8000) return;
        const at = floor(rt, true);
        const msg = tower
          ? { tower: true, line: l.intent, about: l.target != null ? canon(l.target) : null, target: l.target != null ? canon(l.target) : null, rwy: wiring.activeEnd?.() }
          : { speaker: l.speaker, intent: l.intent, variant: l.variant, target: l.target != null ? canon(l.target) : null, voice: l.voice, ...(wiring.pilots?.get(l.speaker) || {}) };
        if (tower && /^scold/.test(l.intent || '')) msg.respond = { kind: 'Tower is cross', intents: ['apology', 'priority', 'complain'] };
        net.broadcast({ t: 'radio', at, msg });
      }));
    }
    onRoom();
    sayHi();
    log('net.attach', { role, room: net.room?.code });
  }

  function detach({ leave = false } = {}) {
    if (!attached) return;
    attached = false; gen++;
    for (const f of offs.splice(0)) safe(() => f?.());
    if (impactPatch) { delete impactPatch.ac._impact; impactPatch = null; }
    for (const id of heldPeers) net.hold?.(id, false);
    heldPeers.clear(); apHeld.clear(); unacked.clear();
    for (const id of [...humans.keys()]) { const r = humans.get(id); if (r.ac) traffic.releaseStand(r.ac); removeRec(r); humans.delete(id); }
    for (const id of [...ais.keys()]) dropAI(id);
    patchAttract(false);
    safe(() => atc()?.configure({ authority: true, detectRemote: true, outragePerPlayer: false }));
    if (atcPatch) { atcPatch.atc.update = atcPatch.update; atcPatch = null; }
    safe(() => radio()?.setMode('local'));
    podium?.close(); podium = null;
    P = null; role = null;
    if (leave) safe(() => net.leave());
  }

  return {
    attach, detach, update, endRound, debug,
    get role() { return role; },
    get attached() { return attached; },
    get court() { return court; },
    standings: () => court?.standings() || [],
    state: () => ({
      role, attached, me: myCanon(), roundEnd, ended,
      humans: [...humans].map(([id, r]) => ({ id: `p:${id}`, entered: !!r.ent, st: r.st || null, x: r.ac ? +r.ac.pos.x.toFixed(1) : null, z: r.ac ? +r.ac.pos.z.toFixed(1) : null, y: r.ac ? +r.ac.pos.y.toFixed(1) : null, inScene: !!r.rig?.root.parent && r.rig.root.visible })),
      ai: [...ais].map(([id, r]) => ({ id, entered: !!r.ent, st: r.st || null, x: r.ac ? +r.ac.pos.x.toFixed(1) : null, z: r.ac ? +r.ac.pos.z.toFixed(1) : null })),
      ledger: Object.fromEntries([...ledger].map(([k, v]) => [k, { acc: v.acc, banked: v.banked, landed: v.landed, infs: v.infs.length, ns: [...v.ns] }])),
      held: [...apHeld.keys()].map((id) => `p:${id}`), heldPeers: [...heldPeers].map((id) => `p:${id}`), meHeld, unacked: [...unacked.keys()],
      court: court ? court.standings().map((p) => ({ id: p.id, pp: p.roomPP, rank: p.rank?.id, crown: p.crown })) : [], holder: court?.holder ?? null,
      ...JSON.parse(JSON.stringify(dbg)),
    }),
  };
}
