// Krayzee ATC: pure, renderer-free, deterministic. See docs/ATC.md.
import * as GEO from './geometry.js';
import { T, INFRACTIONS, COOLDOWN, LINE, KT } from './rules.js';
import { newMeter, addOutrage, decayOutrage, tierName } from './outrage.js';

export { GEO as geometry };
export { INFRACTIONS, T as THRESHOLDS } from './rules.js';

const GROUND_CMDS = ['taxi', 'crossRunway', 'lineUpWait', 'clearedTakeoff', 'cancelTakeoff', 'holdPosition', 'vacate'];
const LAND_CMDS = ['clearedLand', 'clearedTouchAndGo'];
const ACTIVE_INTENTS = ['circuits', 'fullStop', 'depart'];
const clone = (o) => JSON.parse(JSON.stringify(o));
const v3 = (v) => (Array.isArray(v) ? [v[0] || 0, v[1] || 0, v[2] || 0] : v ? [v.x || 0, v.y || 0, v.z || 0] : [0, 0, 0]);
const hyp = Math.hypot;

// opts.geo: a geometry.makeGeometry(def) for a specific airport; default = the active airport (js/world/layout.js).
export function createATC(opts = {}) {
  const Gm = opts.geo || GEO;
  let S = freshState(opts, Gm);
  const cfg = {
    authority: opts.authority !== false,
    detectRemote: opts.detectRemote !== false,
    detectCollisions: opts.detectCollisions !== false,
    aiOutrage: !!opts.aiOutrage,
    outragePerPlayer: !!opts.outragePerPlayer,
    outrageGain: opts.outrageGain ?? 1,
    surfaceAt: opts.surfaceAt ? (p) => opts.surfaceAt(p[0], p[1]) : Gm.surfaceAt,
  };
  const listeners = {};
  let D = {};          // derived per-tick facts, rebuilt every step (not serialised)
  let tickEvents = [];
  const circCache = new Map();

  // ---------- helpers ----------
  const circ = (end, ext = 0) => {
    const k = `${end}|${Math.round(ext / 25) * 25}`;
    let c = circCache.get(k);
    if (!c) { c = Gm.circuitFor(end, { extend: Math.round(ext / 25) * 25 }); circCache.set(k, c); if (circCache.size > 400) circCache.clear(); }
    return c;
  };
  const info = (end) => Gm.endInfo(end);
  const rwOfEnd = (end) => Gm.runwayForEnd(end);
  const endsOf = (rwId) => Gm.runwayById(rwId).ends;
  const cmdRw = (c) => (c?.runwayEnd ? rwOfEnd(c.runwayEnd).id : c?.runway);
  const strips = () => Object.values(S.strips);
  const towardHold = () => Gm.departurePoint(S.activeEnd)?.hold ?? null;
  const scoring = (s) => s.isPlayer || cfg.aiOutrage;
  const detecting = (s) => cfg.detectRemote || s.local;

  function emitRaw(type, payload) {
    for (const fn of listeners[type] || []) fn(payload);
    if (type !== '*') for (const fn of listeners['*'] || []) fn(payload);
  }

  // RADIO-lane event shapes (docs/RADIO.md), on the 'radio' channel.
  const RADIO_SKIP = new Set(['hard_landing', 'separation_loss', 'impeccable']);
  const RADIO_PHASE = { taxi: 'taxi', holding: 'hold', circuit: 'pattern', takeoff: 'rotate' };
  const radio = (ev) => emitRaw('radio', ev);

  function meterKey(actorId) { return cfg.outragePerPlayer && actorId ? `tower:${actorId}` : 'tower'; }
  function meter(key) { return (S.meters[key] ||= newMeter()); }

  function emitEvent(type, actor, extra = {}) {
    const rule = INFRACTIONS[type] || {};
    const a = S.strips[actor];
    const victim = extra.victim;
    if (a && a.graceUntil > S.t && !rule.good) return null;   // spawn / respawn / skip-to-runway grace: no crimes
    const coolKey = `${type}|${actor}${rule.cooldownPerVictim || type === 'forced_goaround' || type === 'near_miss' || type === 'separation_loss' || type === 'collision' ? '|' + (victim ?? '') : ''}`;
    const cd = extra.cooldown ?? (rule.good ? 0 : COOLDOWN);
    if (cd && (S.cool[coolKey] ?? -1e9) > S.t) return null;
    if (cd) S.cool[coolKey] = S.t + cd;
    const key = meterKey(actor);
    const m = meter(key);
    const ev = {
      id: ++S.evSeq, type, t: +S.t.toFixed(3), actor, callsign: a?.callsign ?? actor, isPlayer: !!a?.isPlayer,
      victim: victim ?? null, victimCallsign: victim ? S.strips[victim]?.callsign ?? victim : null,
      severity: extra.severity ?? 1, pp: rule.pp ?? 0, name: rule.name ?? type, scold: rule.scold ?? null,
      controller: 'tower', frozen: m.frozenUntil > S.t, data: extra.data || {},
      at: D[actor] ? [Math.round(D[actor].pos[0]), Math.round(D[actor].pos[1]), Math.round(D[actor].pos[2])] : null,
    };
    if (a && scoring(a) && rule.outrage) {
      const changes = addOutrage(m, rule.outrage * (0.8 + 0.2 * ev.severity), S.t, cfg.outrageGain);
      handleMeterChanges(key, changes, actor);
    }
    ev.tier = m.tier; ev.tierName = tierName(m.tier); ev.outrage = Math.round(m.v);
    S.log.push(ev); if (S.log.length > 80) S.log.shift();
    S.counts[type] = (S.counts[type] || 0) + 1;
    tickEvents.push(ev);
    emitRaw(type, ev); emitRaw('event', ev);
    if (type === 'collision') radio({ type: 'collision', actor, victim: ev.victim, outrage: ev.outrage });
    else if (!RADIO_SKIP.has(type)) radio({ type: 'infraction', id: type, actor, victim: ev.victim, outrage: ev.outrage, severity: ev.severity, data: ev.data });
    return ev;
  }

  function handleMeterChanges(key, changes, actor) {
    for (const c of changes) {
      const m = S.meters[key];
      if (c.kind === 'scandal') { emitRaw('scandal', { type: 'scandal', key, actor: actor ?? null, t: S.t, outrage: m.v }); radio({ type: 'scandal', actor: actor ?? null }); }
      else if (c.kind === 'level') radio({ type: 'outrage', value: Math.round(m.v), tier: m.tier, key });
      else emitRaw('composure', { type: 'composure', key, controller: 'tower', tier: c.to, from: c.from, tierName: tierName(c.to), outrage: Math.round(m.v), t: S.t });
    }
  }

  function issue(s, cmd) {
    const prev = s.cmds[cmd.type];
    cmd.seq = ++S.cmdSeq; cmd.t = +S.t.toFixed(3);
    const kill = {
      taxi: ['lineUpWait', 'clearedTakeoff', 'cancelTakeoff', 'holdPosition', 'vacate'],
      lineUpWait: ['holdPosition', 'cancelTakeoff'],
      clearedTakeoff: ['lineUpWait', 'holdPosition', 'cancelTakeoff', 'goAround'],
      cancelTakeoff: ['clearedTakeoff'],
      clearedLand: ['goAround', 'clearedTouchAndGo'], clearedTouchAndGo: ['goAround', 'clearedLand'],
      goAround: ['clearedLand', 'clearedTouchAndGo', 'sequence', 'extendDownwind'],
      vacate: ['clearedLand', 'lineUpWait', 'clearedTakeoff', 'cancelTakeoff'],
    }[cmd.type] || [];
    for (const k of kill) delete s.cmds[k];
    s.cmds[cmd.type] = cmd;
    const m = meter(meterKey(s.isPlayer ? s.id : null));
    const ev = { type: 'instruction', to: s.id, callsign: s.callsign, isPlayer: s.isPlayer, cmd, line: LINE[cmd.type] || cmd.type, controller: 'tower', tier: m.tier, t: cmd.t, replaces: prev?.seq ?? null };
    emitRaw('instruction', ev);
    if (cmd.type === 'goAround') radio({ type: 'goAround', actor: s.id, cause: cmd.cause ?? null, reason: cmd.reason });
    else if (cmd.type !== 'joinCircuit') radio({ type: 'tower', intent: cmd.type === 'sequence' ? `sequence_${Math.min(4, cmd.number)}` : ev.line, actor: s.id, runway: cmd.runwayEnd ?? cmd.runway ?? null });
    return cmd;
  }
  const drop = (s, ...types) => { for (const k of types) delete s.cmds[k]; };

  // ---------- state ingest ----------
  function ingest(list) {
    const seen = new Set();
    for (const raw of list) {
      if (!raw || raw.id == null) continue;
      const id = String(raw.id);
      seen.add(id);
      let s = S.strips[id];
      if (!s) {
        s = S.strips[id] = newStrip(id, raw);
        if (S.pendingGrace?.[id]) { s.graceUntil = S.pendingGrace[id]; delete S.pendingGrace[id]; }
        const st = Gm.STANDS.find((x) => x.id === raw.stand);
        if (st && raw.onGround && hyp(v3(raw.pos)[0] - st.position[0], v3(raw.pos)[2] - st.position[2]) < T.standReached && !S.standOwner[st.id]) S.standOwner[st.id] = id;
      }
      s.lastSeen = S.t;
      s.callsign = raw.callsign ?? s.callsign;
      s.isPlayer = !!raw.isPlayer;
      if (raw.remote != null) s.local = !raw.remote;
      if (raw.intent && raw.intent !== s.intent) { s.intent = raw.intent; s.done = false; }
      s.runwayIntent = raw.runwayIntent ?? null;
      s.spd = raw.speedScale || 1;   // slower types (Tiger, bathtub) fly the same circuit slower
      s.type = raw.type ?? s.type ?? null;
      const pos = v3(raw.pos), vel = v3(raw.vel);
      const g = !!raw.onGround;
      const agl = raw.agl != null ? Math.max(0, raw.agl) : g ? 0 : Math.max(0, pos[1]);
      const gs = hyp(vel[0], vel[2]);
      const heading = raw.heading ?? (Math.atan2(vel[0], -vel[2]) * 180 / Math.PI + 360) % 360;
      const track = gs > 2 ? (Math.atan2(vel[0], -vel[2]) * 180 / Math.PI + 360) % 360 : heading;
      const p2 = [pos[0], pos[2]];
      const d = D[id] = { s, raw, pos, vel, p2, g, agl, gs, vy: vel[1], heading, track, crashed: !!raw.crashed, over: !!raw.apOverridden, vrKt: raw.vrKt || 55 };
      d.surface = cfg.surfaceAt(p2);
      d.paved = Gm.runwayAt(p2, 0);
      d.occ = [];
      for (const rw of Gm.RUNWAYS) {
        if (!Gm.onRunway(rw, p2, T.runwayMargin) || (!g && agl > T.occupyAgl)) continue;
        // On another runway's pavement and aligned with it: only counts on this one near the intersection.
        if (d.paved && d.paved.id !== rw.id && aligned(d.paved, heading)) {
          const X = Gm.INTERSECTIONS.find((x) => x.runways.includes(rw.id) && x.runways.includes(d.paved.id));
          if (!X || Gm.dist2(X.at, p2) > T.intersectionR * 3) continue;
        }
        d.occ.push(rw.id);
      }
      d.alignedEnd = d.paved ? endFor(d.paved, g ? heading : track) : null;
    }
    for (const id of Object.keys(S.strips)) {
      if (seen.has(id)) continue;
      if (S.t - S.strips[id].lastSeen > 5) removeStrip(id);
    }
  }

  function newStrip(id, raw) {
    return {
      id, callsign: raw.callsign ?? id, isPlayer: !!raw.isPlayer, local: raw.remote ? false : true,
      intent: raw.intent || 'park', done: false, runwayIntent: null, state: 'new', cmds: {},
      landEnd: null, opEnd: null, ext: 0, rem: null, leg: null, s: null, seqNo: null, follow: null, issuedSeq: null,
      penaltyUntil: -1e9, holdT: null, stand: raw.stand ?? null, rollRw: null, touchT: null, liftT: null, gaT: null,
      pv: null, lowPass: 0, lowPassDone: false, taxiFast: 0, standStop: 0, still: 0, ignored: {}, lastTaxiFrom: null,
    };
  }

  function removeStrip(id) {
    for (const k of Object.keys(S.seqs)) S.seqs[k] = S.seqs[k].filter((x) => x !== id);
    for (const k of Object.keys(S.deps)) S.deps[k] = S.deps[k].filter((x) => x !== id);
    for (const k of Object.keys(S.mutex)) if (S.mutex[k] === id) S.mutex[k] = null;
    S.mutexWait = S.mutexWait.filter((x) => x !== id);
    for (const k of Object.keys(S.standOwner)) if (S.standOwner[k] === id) delete S.standOwner[k];
    delete S.strips[id];
  }

  function aligned(rw, heading) {
    return rw.ends.some((e) => Math.abs(Gm.angDiff(heading, Gm.endInfo(e).heading)) < 30);
  }
  function endFor(rw, heading) {
    const [a, b] = rw.ends;
    return Math.abs(Gm.angDiff(heading, Gm.endInfo(a).heading)) <= 90 ? a : b;
  }

  function inCone(d, end) {
    if (d.g || d.agl >= T.coneMaxAgl) return false;
    const inf = info(end);
    const loc = Gm.toEnd(inf, d.p2);
    const dist = -loc.a;
    if (dist < -50 || dist > T.coneLength) return false;
    if (Math.abs(Gm.angDiff(d.track, inf.heading)) > T.coneAngle) return false;
    return Math.abs(loc.c) <= 60 + Math.max(0, dist) * 0.21;
  }

  const legitOn = (s, rwId) => {
    for (const k of [...LAND_CMDS, 'clearedTakeoff', 'lineUpWait', 'cancelTakeoff', 'crossRunway', 'vacate']) if (s.cmds[k] && cmdRw(s.cmds[k]) === rwId) return true;
    return s.rollRw === rwId;
  };
  const climbingAway = (d) => !d.g && d.agl > 3 && d.vy > 0.3;

  function occupants(rwId, exceptId) {
    const out = [];
    for (const id in D) if (id !== exceptId && D[id].occ.includes(rwId) && !climbingAway(D[id]) && !D[id].crashed) out.push(id);
    return out;
  }
  function reservations(rwId, exceptId, kinds = [...LAND_CMDS, 'clearedTakeoff', 'lineUpWait', 'crossRunway']) {
    const out = [];
    for (const s of strips()) {
      if (s.id === exceptId) continue;
      for (const k of kinds) if (s.cmds[k] && cmdRw(s.cmds[k]) === rwId) { out.push(s.id); break; }
    }
    return out;
  }

  // ---------- lifecycle ----------
  function transitions(dt) {
    for (const id in D) {
      const d = D[id], s = d.s;
      // Debounced: a taxi bump is not a flight. Touchdown is immediate; liftoff needs 0.4 s clear of the ground.
      if (s.air == null) s.air = !d.g;
      if (!d.g) s.airVy = d.vy;
      d.touchdown = !!(s.pv && s.air && d.g);
      d.liftoff = false;
      if (d.touchdown) { s.air = false; s.flip = 0; }
      else if (!s.air) {
        s.flip = !d.g && d.agl > 0.8 ? (s.flip || 0) + dt : 0;
        if (s.flip >= 0.4) { s.air = true; s.flip = 0; d.liftoff = !!s.pv; }
      }
      if (d.touchdown) {
        s.touchT = S.t;
        removeFromSeqs(id);
        const rw = d.paved;
        const cl = s.cmds.clearedLand || s.cmds.clearedTouchAndGo;
        d.clrAtTouch = cl || null;
        if (rw && cl && cmdRw(cl) === rw.id) s.rollRw = rw.id;
        if (cfg.authority && !s.cmds.clearedTouchAndGo && rw) {
          const ex = Gm.exitFor(d.alignedEnd || cl?.runwayEnd || rw.ends[0], Math.max(Gm.G.EXIT_MIN, Gm.toEnd(info(d.alignedEnd || rw.ends[0]), d.p2).a + 250), towardHold());
          if (ex) issue(s, { type: 'vacate', runway: rw.id, via: ex.via, at: ex.at, route: ex.route, clearAt: ex.clearAt, ...(ex.thenRunway ? { thenRunway: true } : {}) });
        }
        drop(s, 'clearedLand', 'sequence', 'extendDownwind', 'joinCircuit');
        s.ext = 0;
      }
      if (d.liftoff) {
        s.liftT = S.t;
        const wasTG = !!s.cmds.clearedTouchAndGo;
        const to = s.cmds.clearedTakeoff;
        const end = to?.runwayEnd || (wasTG ? s.cmds.clearedTouchAndGo.runwayEnd : d.alignedEnd);
        s.opEnd = end || s.opEnd;
        drop(s, ...GROUND_CMDS, ...LAND_CMDS);
        s.rollRw = null;
        S.deps = Object.fromEntries(Object.entries(S.deps).map(([k, v]) => [k, v.filter((x) => x !== id)]));
        if (cfg.authority && s.intent !== 'depart' && end) {
          issue(s, { type: 'joinCircuit', runwayEnd: S.activeEnd, side: Gm.circuitFor(S.activeEnd).side, alt: Gm.circuitFor(S.activeEnd).alt, leg: 'upwind' });
        }
      }
      // Cleared for a touch-and-go but braking to a stop (a human, or an autopilot doing full stops): it's a full stop.
      if (cfg.authority && d.g && !d.touchdown && s.cmds.clearedTouchAndGo && d.paved && S.t - (s.touchT ?? 1e9) > 2 && d.gs < T.tgFullStopSpeed * (s.spd || 1)) {
        const cl = s.cmds.clearedTouchAndGo;
        drop(s, 'clearedTouchAndGo');
        const end = d.alignedEnd || cl.runwayEnd;
        const ex = Gm.exitFor(end, Math.max(Gm.G.EXIT_MIN, Gm.toEnd(info(end), d.p2).a + 120), towardHold());
        if (ex) issue(s, { type: 'vacate', runway: d.paved.id, via: ex.via, at: ex.at, route: ex.route, clearAt: ex.clearAt, ...(ex.thenRunway ? { thenRunway: true } : {}) });
      }
      if (s.rollRw && !d.occ.includes(s.rollRw)) s.rollRw = null;
    }
  }

  function removeFromSeqs(id) { for (const k of Object.keys(S.seqs)) S.seqs[k] = S.seqs[k].filter((x) => x !== id); }

  function landEndFor(s) {
    if (s.runwayIntent && Gm.ALL_ENDS.includes(s.runwayIntent) && S.open[rwOfEnd(s.runwayIntent).id]) return s.runwayIntent;
    return S.activeEnd;
  }

  // ---------- arrival sequencing (runs on replicas too; issuance only with authority) ----------
  function sequencePass() {
    for (const id in D) {
      const d = D[id], s = d.s;
      d.prog = null;
      if (d.g || d.crashed) { s.leg = null; continue; }
      const end = landEndFor(s);
      if (s.landEnd && s.landEnd !== end) { removeFromSeqs(id); s.ext = 0; }
      s.landEnd = end;
      const c = circ(end, s.ext);
      d.prog = Gm.circuitProgress(c, d.p2, d.track, s.leg, d.agl);
      s.leg = d.prog.leg; s.rem = Math.round(d.prog.remaining); s.s = d.prog.s;
      const fromField = Gm.dist2(d.p2, Gm.CENTER);
      const inRegion = fromField < T.regionRadius && d.agl < T.regionAlt && (d.prog.xte < 700 || d.prog.onFinal);
      if (s.cmds.goAround) {
        const loc = Gm.toEnd(info(end), d.p2);
        if (s.leg === 'crosswind' || s.leg === 'downwind' || S.t - s.gaT > 90 || (loc.a > 300 && d.agl > 120)) drop(s, 'goAround');
      }
      const landingNow = d.agl < 40 && !s.cmds.goAround && Gm.onRunway(rwOfEnd(end), d.p2, 80);
      const ignoringGA = s.cmds.goAround && S.t - s.gaT > 5 && d.vy <= 0.5 && inCone(d, end);
      const wants = inRegion && !landingNow && (!s.cmds.goAround || ignoringGA) && s.intent !== 'depart' && !(d.g);
      const list = (S.seqs[end] ||= []);
      const at = list.indexOf(id);
      if (!wants) { if (at >= 0) list.splice(at, 1); continue; }
      if (at < 0) insertSorted(list, id, end);
    }
    for (const end of Object.keys(S.seqs)) reorder(end);
    for (const id in D) {
      const p = D[id].s.cutPending;
      if (!p) continue;
      const list = S.seqs[p.end] || [];
      if (S.t - p.t > 90 || !list.includes(id) || !list.includes(p.victim) || list.indexOf(id) > list.indexOf(p.victim)) { D[id].s.cutPending = null; continue; }
      checkCut(id, p.victim, p.end);
    }
  }

  function insertSorted(list, id, end) {
    const r = S.strips[id].rem;
    let i = list.findIndex((o) => (S.strips[o]?.rem ?? 1e9) > r);
    if (i < 0) i = list.length;
    list.splice(i, 0, id);
    if (S.strips[id].pv) for (let k = i + 1; k < list.length; k++) checkCut(id, list[k], end);
    if (cfg.authority) {
      const s = S.strips[id];
      if (!s.cmds.joinCircuit || s.cmds.joinCircuit.runwayEnd !== end) {
        const c = circ(end);
        issue(s, { type: 'joinCircuit', runwayEnd: end, side: c.side, alt: c.alt, leg: D[id].prog.onFinal ? 'final' : s.leg });
      }
    }
  }

  // A pass outside the final cone is remembered and becomes a cut-in if both end up in the cone with the order kept.
  function checkCut(actor, victim, end, force = false) {
    const da = D[actor], dv = D[victim];
    if (!da || !dv) return;
    if (!force && (!inCone(da, end) || !inCone(dv, end))) { if (da.over || S.strips[actor].isPlayer) S.strips[actor].cutPending = { victim, end, t: S.t }; return; }
    S.strips[actor].cutPending = null;
    const ck = `${actor}>${victim}`;
    if ((S.cutDone ||= {})[ck] > S.t - 120) return;   // one cut-in per pass, however often the order is re-checked
    S.cutDone[ck] = S.t;
    const gap = S.strips[victim].rem - S.strips[actor].rem;
    S.strips[actor].penaltyUntil = S.t + 60;
    if (detecting(S.strips[actor])) emitEvent('cut_in_final', actor, { victim, severity: gap < 400 ? 3 : gap < 1000 ? 2 : 1, data: { gap: Math.round(gap), runwayEnd: end, close: gap < 400 } });
  }

  function reorder(end) {
    const list = S.seqs[end];
    for (let pass = 0; pass < list.length; pass++) {
      let swapped = false;
      for (let k = 0; k + 1 < list.length; k++) {
        const a = S.strips[list[k]], b = S.strips[list[k + 1]];
        if (b.rem + T.cutMargin < a.rem) {
          list[k] = b.id; list[k + 1] = a.id; swapped = true;
          checkCut(b.id, a.id, end);
          if (a.cmds.clearedLand || a.cmds.clearedTouchAndGo) { revokeLanding(a); }
        }
      }
      if (!swapped) break;
    }
  }

  function revokeLanding(s) {
    drop(s, ...LAND_CMDS);
    releaseMutex(s.id);
  }

  function goAround(s, reason, actor) {
    if (s.cmds.goAround) return;
    issue(s, { type: 'goAround', reason, cause: actor ?? null, runwayEnd: s.landEnd, climbTo: Gm.circuitFor(s.landEnd || S.activeEnd).alt });
    s.gaT = S.t; s.ext = 0;
    removeFromSeqs(s.id);
    S.mutexWait = S.mutexWait.filter((x) => x !== s.id);
    S.counts.goArounds = (S.counts.goArounds || 0) + 1;
    if (actor && actor !== s.id && S.strips[actor] && detecting(S.strips[actor])) emitEvent('forced_goaround', actor, { victim: s.id, severity: 2, data: { reason } });
  }

  const spacingBehind = (lead) => (lead.isPlayer ? T.spacingPlayer : lead.intent === 'circuits' ? T.spacingTG : T.spacingFullType[lead.type] ?? T.spacingFull);
  // Seconds to the threshold: finals are flown slower than the rest of the circuit.
  const eta = (s, rem = s.rem, ext = s.ext) => {
    const fin = Math.min(rem, Gm.G.FINAL_LEN + ext), slow = Math.min(fin, T.finalSlowFrom);
    return (slow / T.finalSpeed + (fin - slow) / T.finalFastSpeed + (rem - fin) / T.circuitSpeed) / (s.spd || 1);
  };
  const EXT_SECS = 1 / T.circuitSpeed + 1 / T.finalFastSpeed; // seconds added per metre of downwind extension
  function stretch(s, d, end, secs, follow, reason) {
    if (secs <= 2 || s.ext >= T.maxExtend) return;
    s.ext = Math.min(T.maxExtend, s.ext + secs / (EXT_SECS / (s.spd || 1)) + 50);
    s.rem = Math.round(Gm.circuitProgress(circ(end, s.ext), d.p2, d.track, s.leg, d.agl).remaining);
    issue(s, { type: 'extendDownwind', metres: Math.round(s.ext / 25) * 25, runwayEnd: end, follow, ...(reason ? { reason } : {}) });
  }

  // A departure that has waited too long gets a slot: the first arrival still before base is stretched.
  function departureSlot(end) {
    const q = S.deps[S.activeEnd] || [];
    const dp = Gm.departurePoint(S.activeEnd);
    // planned as soon as a departure is at the hold or close to it, so the gap arrives about when it is ready
    const w = q.map((id) => S.strips[id]).find((s) => s && D[s.id] && !s.cmds.clearedTakeoff && (s.holdT != null ? S.t - s.holdT >= T.depSlotWait : Gm.dist2(D[s.id].p2, dp.hold) < T.depSlotNear));
    if (!w || rwOfEnd(end).id !== rwOfEnd(S.activeEnd).id) return null;
    const list = S.seqs[end];
    if (list.some((id) => S.strips[id]?.slotFor === w.id)) return null;
    const k = list.findIndex((id) => ['upwind', 'crosswind', 'downwind'].includes(S.strips[id]?.leg) && S.strips[id].ext < T.maxExtend - 600);
    if (k < 0) return null;
    return { k, dep: w.id };
  }

  function arrivals() {
    for (const end of Object.keys(S.seqs)) {
      const list = S.seqs[end];
      const rwId = rwOfEnd(end).id;
      const slot = departureSlot(end);
      list.forEach((id, k) => {
        const s = S.strips[id], d = D[id];
        if (!d) return;
        const follow = k ? list[k - 1] : null;
        const lead = follow ? S.strips[follow] : null;
        const preBase = s.leg === 'upwind' || s.leg === 'crosswind' || s.leg === 'downwind';
        if (slot && slot.k === k && preBase) {
          stretch(s, d, end, (lead ? eta(lead) : 0) + T.depSlot - eta(s), follow, 'departure');
          s.slotFor = slot.dep;
        }
        // the slot only works if the runway is free in time: a lander still rolling out or vacating along it
        // (an exit far down the runway) pushes the slotted arrival out again
        if (s.slotFor && preBase && depWaiting(s.slotFor)) {
          const busy = runwayBusyFor(rwId);
          if (busy > 0) stretch(s, d, end, busy + T.depAfterFree - eta(s), follow, 'departure');
        }
        if (lead) {
          const gap = eta(s) - eta(lead);
          const need = spacingBehind(lead);
          if (preBase && gap < need - 3) stretch(s, d, end, need - gap, follow);
          else if (!preBase && d.prog?.leg === 'final' && gap < T.minFinalGap) {
            if (lead.cutPending?.victim === s.id) checkCut(lead.id, s.id, end, true);
            const culprit = lead.penaltyUntil > S.t ? lead.id : null;
            goAround(s, 'spacing', culprit);
            return;
          }
        }
        const sk = `${k + 1}|${follow}`;
        if (s.issuedSeq !== sk && (s.leg === 'downwind' || s.leg === 'base' || s.leg === 'final')) {
          s.issuedSeq = sk; s.seqNo = k + 1; s.follow = follow;
          issue(s, { type: 'sequence', number: k + 1, follow, followCallsign: lead?.callsign ?? null, runwayEnd: end });
        }
        s.seqNo = k + 1; s.follow = follow;
        if (k === 0) number1(s, d, end, rwId);
        else if (s.cmds.clearedLand || s.cmds.clearedTouchAndGo) revokeLanding(s);
      });
    }
  }

  const depWaiting = (id) => !!D[id]?.g && !S.strips[id].cmds.clearedTakeoff && (S.deps[S.activeEnd] || []).includes(id);
  // Seconds until landers on rwId are off it (by their vacate point), 0 if none.
  function runwayBusyFor(rwId) {
    let busy = 0;
    for (const id in D) {
      const d = D[id], v = d.s.cmds.vacate;
      if (!d.g || !d.occ.includes(rwId) || !v || v.runway !== rwId) continue;
      busy = Math.max(busy, Gm.dist2(d.p2, v.clearAt || v.at) / Math.max(d.gs, 6) + 5);
    }
    return busy;
  }

  function blockersFor(rwId, selfId) {
    return occupants(rwId, selfId);
  }

  function illegitIn(ids, rwId) { return ids.find((x) => !legitOn(S.strips[x], rwId)) || null; }

  // Someone uncleared in the final cone, within 1 km and ahead of selfId.
  function coneIntruder(end, selfId) {
    const me = D[selfId] && !D[selfId].g ? -Gm.toEnd(info(end), D[selfId].p2).a : 1e9;
    for (const id in D) {
      const c = D[id].s.cmds;
      if (id === selfId || !inCone(D[id], end) || c.clearedLand || c.clearedTouchAndGo || c.goAround || S.seqs[end]?.[0] === id) continue;
      const dist = -Gm.toEnd(info(end), D[id].p2).a;
      if (dist < 1000 && dist < me) return id;
    }
    return null;
  }

  function number1(s, d, end, rwId) {
    const cleared = s.cmds.clearedLand || s.cmds.clearedTouchAndGo;
    const blockers = blockersFor(rwId, s.id);
    const intruder = coneIntruder(end, s.id);
    if (cleared) {
      const culprit = illegitIn(blockers, rwId) || intruder;
      if (blockers.length || intruder) {
        if (s.rem < T.revokeDist) goAround(s, intruder && !blockers.length ? 'traffic' : 'runwayOccupied', culprit);
        else revokeLanding(s);
      }
      return;
    }
    const want = s.rem < T.clearLandDist && (s.leg === 'base' || (s.leg === 'final' && d.prog?.onFinal));
    const needM = mutexKeys(rwId);
    // only queue for the intersection when nothing else stops us: a lander blocked by a lined-up departure must not
    // hold the queue head that departure needs to roll (deadlock: both wait, the lander goes around)
    const clear = want && s.penaltyUntil <= S.t && !s.cutPending && !blockers.length && !intruder && !reservations(rwId, s.id).length && S.open[rwId];
    if (clear && needM.length && !S.mutexWait.includes(s.id)) S.mutexWait.push(s.id);
    else if (!clear) S.mutexWait = S.mutexWait.filter((x) => x !== s.id);
    const ok = clear && mutexFree(s.id, needM);
    if (ok) {
      const tg = s.intent === 'circuits';
      issue(s, { type: tg ? 'clearedTouchAndGo' : 'clearedLand', runwayEnd: end, threshold: info(end).T, heading: info(end).heading });
      takeMutex(s.id, needM); s.opEnd = end;
      return;
    }
    if (d.prog?.onFinal && s.rem < T.goAroundDist && cfg.authority) {
      const culprit = illegitIn(blockers, rwId) || intruder;
      goAround(s, blockers.length ? 'runwayOccupied' : intruder ? 'traffic' : !S.open[rwId] ? 'runwayClosed' : 'crossingTraffic', culprit);
    }
  }

  // ---------- intersection mutex ----------
  function mutexKeys(rwId) { return Gm.INTERSECTIONS.map((x, i) => (x.runways.includes(rwId) ? `X${i}` : null)).filter(Boolean); }
  function mutexFree(id, keys) {
    if (!keys.length) return true;
    if (keys.some((k) => S.mutex[k] && S.mutex[k] !== id)) return false;
    const first = S.mutexWait.find((x) => S.strips[x]);
    return !first || first === id;
  }
  function takeMutex(id, keys) {
    for (const k of keys) S.mutex[k] = id;
    S.mutexWait = S.mutexWait.filter((x) => x !== id);
  }
  function releaseMutex(id) { for (const k of Object.keys(S.mutex)) if (S.mutex[k] === id) S.mutex[k] = null; }
  function mutexHousekeeping() {
    Gm.INTERSECTIONS.forEach((X, i) => {
      const k = `X${i}`, id = S.mutex[k];
      if (!id) return;
      const s = S.strips[id], d = D[id];
      if (!s || !d) { S.mutex[k] = null; return; }
      const end = s.opEnd;
      const rwId = end ? rwOfEnd(end).id : null;
      const inf = end ? info(end) : null;
      const a = inf ? Gm.toEnd(inf, d.p2).a : 0;
      const past = inf ? a > Gm.toEnd(inf, X.at).a + T.mutexRelease : true;
      const high = !d.g && d.agl > T.mutexAlt && a > 0;
      const holding = Object.keys(s.cmds).some((c) => [...LAND_CMDS, 'clearedTakeoff', 'goAround'].includes(c));
      const off = !d.occ.includes(rwId) && !holding && d.g;
      if (past || high || off || d.crashed) S.mutex[k] = null;
    });
    S.mutexWait = S.mutexWait.filter((id) => {
      const s = S.strips[id];
      if (!s) return false;
      const d = D[id];
      if (S.seqs[s.landEnd]?.[0] === id && s.rem < T.clearLandDist + 500 && !d?.g) return true;
      return S.deps[S.activeEnd]?.[0] === id && d?.g;
    });
  }

  // ---------- departures & ground ----------
  function departures() {
    const end = S.activeEnd;
    const inf = info(end);
    const rw = inf.rw;
    const dp = Gm.departurePoint(end);
    if (!dp) return;
    const q = (S.deps[end] ||= []);
    for (const id in D) {
      const d = D[id], s = d.s;
      if (!d.g || d.crashed) continue;
      const nearHold = Gm.dist2(d.p2, dp.hold) < T.holdReached;
      const linedUp = d.paved?.id === rw.id && d.alignedEnd === end && Gm.toEnd(inf, d.p2).a < 250 && d.gs < 3 && !s.rollRw;
      const taxiing = s.cmds.taxi?.dest === 'runway' && s.cmds.taxi.runwayEnd === end;
      if ((nearHold || linedUp || taxiing) && !q.includes(id) && !s.cmds.vacate) q.push(id);
      if (nearHold && d.gs < 2 && s.holdT == null) s.holdT = S.t;
      d.linedUp = linedUp;
    }
    for (let i = q.length - 1; i >= 0; i--) {
      const s = S.strips[q[i]], d = D[q[i]];
      const keep = s && d && d.g && (s.cmds.taxi?.dest === 'runway' || s.cmds.lineUpWait || s.cmds.clearedTakeoff || s.cmds.cancelTakeoff || d.linedUp || Gm.dist2(d.p2, dp.hold) < 100);
      if (!keep) { q.splice(i, 1); if (s) s.holdT = null; }
    }
    const rank = (id) => {
      const s = S.strips[id], d = D[id];
      if (s.cmds.clearedTakeoff || s.cmds.lineUpWait || d.linedUp) return [0, 0];
      if (s.holdT != null) return [1, s.holdT];
      return [2, Gm.dist2(d.p2, dp.hold)];
    };
    q.sort((a, b) => { const ra = rank(a), rb = rank(b); return ra[0] - rb[0] || ra[1] - rb[1]; });
    S.depQueue = q.slice();
    if (!cfg.authority) return;

    // cancel a takeoff clearance if someone barged on
    for (const id of q) {
      const s = S.strips[id], d = D[id];
      if (!s.cmds.clearedTakeoff || d.gs > 20) continue;
      const blk = blockersFor(rw.id, id).filter((o) => !(D[o].g && Gm.toEnd(inf, D[o].p2).a < Gm.toEnd(inf, d.p2).a - 30));
      const intr = rw.ends.map((e) => coneIntruder(e, id)).find(Boolean);
      if (blk.length || intr) {
        issue(s, { type: 'cancelTakeoff', runwayEnd: end, reason: blk.length ? 'runwayOccupied' : 'traffic' });
        releaseMutex(id);
      }
    }

    const first = q[0];
    if (!first || S.pendingEnd) return;
    const s = S.strips[first], d = D[first];
    if (s.cmds.clearedTakeoff) return;
    const ready = s.holdT != null || d.linedUp || (d.gs < 1 && Gm.dist2(d.p2, dp.hold) < 150);
    if (!ready) return;
    const blk = blockersFor(rw.id, first);
    const resv = reservations(rw.id, first);
    let minRem = 1e9, minEta = 1e9;
    for (const e of rw.ends) for (const o of S.seqs[e] || []) {
      const so = S.strips[o];
      if (o === first || !so) continue;
      minRem = Math.min(minRem, so.rem ?? 1e9);
      if (so.rem != null) minEta = Math.min(minEta, eta(so));
    }
    const intr = rw.ends.map((e) => coneIntruder(e, first)).find(Boolean);
    let traffic = false;
    for (const id in D) {
      if (id === first || D[id].g) continue;
      const loc = Gm.toEnd(inf, D[id].p2);
      if (loc.a > -300 && loc.a < T.depSpacing && Math.abs(loc.c) < 450 && D[id].agl < 450) traffic = true;
      if (D[id].s.cmds.goAround && loc.a > -2500 && loc.a < info(end).length + 1500 && Math.abs(loc.c) < 600) traffic = true; // going round overhead
    }
    const keys = mutexKeys(rw.id);
    const runwayClear = !blk.length && !resv.length && !intr;
    const goOk = runwayClear && minRem > (d.linedUp ? T.arrivalBlockLinedUp : T.arrivalBlockDep) && !traffic;
    // line up behind a lander that is already rolling away down the runway
    // line up only if it can still roll before the next arrival: once landers rolling/vacating along the runway are
    // off it, that arrival must be outside arrivalBlockLinedUp (else both wait and the arrival is sent round)
    const lineUpOk = () => minRem > T.lineUpArrivalClear && minEta - runwayBusyFor(rw.id) > T.arrivalBlockLinedUp / T.finalSpeed + T.lineUpSlack;
    const behindLander = blk.length && blk.every((o) => D[o].g && Gm.toEnd(inf, D[o].p2).a > T.lineUpBehind && Math.abs(Gm.angDiff(D[o].track, inf.heading)) < 60 && !legitTakeoff(o));
    if (goOk && keys.length && !S.mutexWait.includes(first)) S.mutexWait.push(first);
    if (goOk && mutexFree(first, keys)) {
      issue(s, { type: 'clearedTakeoff', runwayEnd: end, at: dp.lineUp, heading: inf.heading, then: s.intent === 'depart' ? 'depart' : 'circuit', circuit: s.intent === 'depart' ? null : { runwayEnd: end, side: circ(end).side, alt: circ(end).alt } });
      takeMutex(first, keys); s.opEnd = end; s.holdT = null;
    } else if ((runwayClear || (behindLander && !resv.length && !intr)) && !traffic && mutexFree(first, keys) && !s.cmds.lineUpWait && !d.linedUp && lineUpOk()) {
      issue(s, { type: 'lineUpWait', runwayEnd: end, at: dp.lineUp, heading: inf.heading });
    }
  }

  const legitTakeoff = (id) => !!S.strips[id]?.cmds.clearedTakeoff;

  function ground() {
    if (!cfg.authority) return;
    const end = S.activeEnd;
    let outbound = 0;
    for (const s of strips()) if (s.cmds.taxi?.dest === 'runway' || s.cmds.lineUpWait || s.cmds.clearedTakeoff) outbound++;
    for (const id in D) {
      const d = D[id], s = d.s;
      if (!d.g || d.crashed) continue;
      const c = s.cmds;
      // runway crossings along the taxi route
      // Taxiway crossings: the route's hold list, or (taxiing on its own) any taxiway-A crossing it is heading for.
      const holds = [...(c.taxi?.holdShort || []), ...(!d.occ.length ? Gm.TAXI_CROSSINGS.flatMap((k) => [{ runway: k.runway, at: k.sides[0], beyond: k.sides[1] }, { runway: k.runway, at: k.sides[1], beyond: k.sides[0] }])
        .filter((h) => Gm.dist2(d.p2, h.at) < T.crossApproach && Gm.dist2(d.p2, h.beyond) > Gm.dist2(d.p2, h.at) && Math.abs(Gm.angDiff(d.track, Math.atan2(h.beyond[0] - h.at[0], -(h.beyond[1] - h.at[1])) * 180 / Math.PI)) < 60) : [])];
      for (const h of holds) {
        if (h.departure || (c.crossRunway && c.crossRunway.runway === h.runway)) continue;
        if (s.crossed?.includes(crossKey(h.runway, h.at))) continue;
        if (Gm.dist2(d.p2, h.at) > T.crossApproach) continue;
        const free = !occupants(h.runway, id).filter((o) => !S.strips[o].cmds.crossRunway).length && !reservations(h.runway, id, [...LAND_CMDS, 'clearedTakeoff', 'lineUpWait']).length && !Gm.runwayById(h.runway).ends.some((e) => coneIntruder(e, id));
        if (free) issue(s, { type: 'crossRunway', runway: h.runway, at: h.at, beyond: h.beyond });
        break;
      }
      if (c.crossRunway) {
        const b = c.crossRunway.beyond;
        if (b && Gm.dist2(d.p2, b) < 20 && !d.occ.includes(c.crossRunway.runway)) {
          (s.crossed ||= []).push(crossKey(c.crossRunway.runway, c.crossRunway.at));
          drop(s, 'crossRunway');
        }
      }
      // off the runway after vacating: taxi in
      if (c.vacate && !d.occ.length && !d.paved) {
        const v = c.vacate;
        drop(s, 'vacate');
        if (v.thenRunway && Gm.departurePoint(S.activeEnd)) {
          issue(s, { type: 'taxi', ...Gm.taxiToRunway(d.p2, S.activeEnd, d.heading) });
        } else {
          const st = pickStand(s);
          issue(s, { type: 'taxi', ...Gm.taxiToStand(d.p2, st, d.heading) });
        }
      }
      // player stopped on the runway with nothing to do
      if (!c.vacate && !c.taxi && !c.lineUpWait && !c.clearedTakeoff && !c.cancelTakeoff && !c.holdPosition && d.paved && d.gs < 2 && !d.linedUp && S.t - (s.touchT ?? -1e9) > 3) {
        const ex = Gm.exitFor(d.alignedEnd || end, Math.max(0, Gm.toEnd(info(d.alignedEnd || end), d.p2).a + 60), towardHold());
        if (ex) issue(s, { type: 'vacate', runway: d.paved.id, via: ex.via, at: ex.at, route: ex.route, clearAt: ex.clearAt, ...(ex.thenRunway ? { thenRunway: true } : {}) });
      }
      if (c.holdPosition && (S.t - c.holdPosition.t > 20 || (!d.occ.length && d.gs < 1))) drop(s, 'holdPosition');
      // at the stand
      if (c.taxi?.dest === 'stand') {
        const st = Gm.STANDS.find((x) => x.id === c.taxi.stand);
        if (st && Gm.dist2(d.p2, [st.position[0], st.position[2]]) < T.standReached && d.gs < 1) {
          drop(s, 'taxi'); s.stand = st.id; S.standOwner[st.id] = s.id;
          if (s.intent !== 'circuits' && s.intent !== 'depart') s.done = true;
        }
      }
      // taxi out
      if (!c.taxi && !c.lineUpWait && !c.clearedTakeoff && !c.vacate && !d.paved && d.gs < 1 && ACTIVE_INTENTS.includes(s.intent) && !s.done) {
        if (!s.isPlayer && (outbound >= T.maxOutbound || S.t - S.lastTaxiT < T.taxiReleaseGap)) continue;
        const dp = Gm.departurePoint(end);
        if (!dp || Gm.dist2(d.p2, dp.hold) < T.holdReached) continue;
        const r = Gm.taxiToRunway(d.p2, end, d.heading);
        if (!r) continue;
        issue(s, { type: 'taxi', ...r });
        s.crossed = [];
        if (s.stand && S.standOwner[s.stand] === s.id) delete S.standOwner[s.stand];
        if (!s.isPlayer) S.lastTaxiT = S.t;
        outbound++;
      }
    }
  }

  function pickStand(s) {
    const taken = (st) => (S.standOwner[st.id] && S.standOwner[st.id] !== s.id) || Object.values(D).some((o) => o.s.id !== s.id && Gm.dist2(o.p2, [st.position[0], st.position[2]]) < 20);
    const home = Gm.STANDS.find((x) => x.id === s.stand);
    const st = home && !taken(home) ? home : Gm.STANDS.find((x) => !taken(x)) || Gm.STANDS[0];
    S.standOwner[st.id] = s.id;
    return st.id;
  }

  // ---------- detectors ----------
  function detect(dt) {
    const ids = Object.keys(D);
    const activeHdg = info(S.activeEnd).heading;
    for (const id of ids) {
      const d = D[id], s = d.s;
      if (!detecting(s) || d.crashed) continue;
      const pv = s.pv;
      if (!pv) continue;

      if (d.touchdown && d.raw.impact) {
        // a smash/bounce is not a landing: no surface bonus, no landing crimes
        const landed = { type: 'landed', actor: id, impeccable: false, impact: true, fpm: 0, surface: d.surface, runway: Gm.runwayAt(d.p2, 2)?.id ?? null, t: S.t };
        emitRaw('landed', landed);
      } else if (d.touchdown) {
        const fpm = d.raw.touchdownFpm ?? Math.max(0, -(s.airVy ?? pv.vy ?? 0) * 196.85);
        let imp = false;
        const rw = Gm.runwayAt(d.p2, 2);
        if (!rw) {
          const surf = d.surface === 'runway' ? 'grass' : d.surface;
          const type = { taxiway: 'taxiway_landing', grass: 'grass_landing', apron: 'apron_landing' }[surf];
          if (type) emitEvent(type, id, { severity: surf === 'apron' ? 3 : 2, data: { surface: surf } });
        } else {
          const end = endFor(rw, d.heading);
          const clr = d.clrAtTouch;
          if (!S.open[rw.id]) emitEvent('closed_runway', id, { severity: 2, data: { runway: rw.id, runwayEnd: end } });
          if (rw.id === rwOfEnd(S.activeEnd).id && Math.abs(Gm.angDiff(d.heading, activeHdg)) > T.wrongWayDeg) emitEvent('wrong_way', id, { severity: 2, data: { op: 'landing', runwayEnd: end } });
          if (!clr || cmdRw(clr) !== rw.id) emitEvent('unauth_landing', id, { severity: occupants(rw.id, id).length ? 3 : 2, data: { runwayEnd: end } });
          else {
            const loc = Gm.toEnd(info(end), d.p2);
            if (Math.abs(loc.c) <= T.impeccable.centreline && loc.a >= 0 && loc.a <= T.impeccable.zone && fpm < T.impeccable.sinkFpm) imp = !!emitEvent('impeccable', id, { severity: 1, data: { runwayEnd: end } });
          }
        }
        const landed = { type: 'landed', actor: id, impeccable: !!imp, fpm: Math.round(fpm), surface: rw ? 'runway' : d.surface, runway: rw?.id ?? null, t: S.t };
        emitRaw('landed', landed); radio(landed);
        if (fpm > T.hardLandingFpm) emitEvent('hard_landing', id, { severity: fpm > 900 ? 3 : 2, data: { fpm: Math.round(fpm) }, cooldown: 2 });
      }

      // takeoff roll / liftoff
      const thr = T.unauthTakeoffKt * KT;
      if (d.g && d.paved && pv.gs < thr && d.gs >= thr && d.vel[0] * (d.vel[0] - (pv.vx ?? 0)) + d.vel[2] * (d.vel[2] - (pv.vz ?? 0)) >= 0) {
        const rw = d.paved, end = endFor(rw, d.track);
        const tg = (s.cmds.clearedTouchAndGo || s.cmds.clearedLand) && S.t - (s.touchT ?? -1e9) < 40;
        const ok = (s.cmds.clearedTakeoff && cmdRw(s.cmds.clearedTakeoff) === rw.id) || tg;
        if (!ok) {
          const ahead = (S.depQueue || []).filter((x) => x !== id);
          emitEvent('unauth_takeoff', id, { severity: ahead.length ? 3 : 2, victim: ahead[0] ?? null, data: { runwayEnd: end, outOfTurn: ahead.length > 0, jumped: ahead.length } });
        }
        if (rw.id === rwOfEnd(S.activeEnd).id && Math.abs(Gm.angDiff(d.track, activeHdg)) > T.wrongWayDeg) emitEvent('wrong_way', id, { severity: 2, data: { op: 'takeoff', runwayEnd: end } });
      }
      if (d.liftoff && !Gm.runwayAt(d.p2, 3)) emitEvent('unauth_takeoff', id, { severity: 3, data: { surface: d.surface, offRunway: true } });

      // entering a runway
      for (const rwId of d.occ) {
        if (pv.occ.includes(rwId) || (pv.paved && pv.paved !== rwId)) continue;
        if (legitOn(s, rwId) || s.cmds.goAround) continue;
        const others = occupants(rwId, id);
        const rolling = others.filter((o) => D[o].g && D[o].gs > 10);
        const shortFinal = Gm.runwayById(rwId).ends.flatMap((e) => (S.seqs[e] || []).filter((o) => o !== id && D[o] && inCone(D[o], e) && S.strips[o].rem < T.shortFinal));
        let any = false;
        if (rolling.length || shortFinal.length) { any = true; emitEvent('runway_steal', id, { victim: rolling[0] ?? shortFinal[0], severity: 3, data: { runway: rwId } }); }
        if (d.g) {
          const ahead = (S.depQueue || []).filter((x) => x !== id && D[x] && S.strips[x].holdT != null || (D[x]?.linedUp && x !== id));
          if (ahead.length && rwOfEnd(S.activeEnd).id === rwId) { any = true; emitEvent('queue_jump', id, { victim: ahead[0], severity: Math.min(3, ahead.length), data: { jumped: ahead.length, runway: rwId } }); }
          if (!any) emitEvent('runway_incursion', id, { severity: others.length || reservations(rwId, id).length ? 2 : 1, data: { runway: rwId } });
          if (cfg.authority && scoring(s)) issue(s, { type: 'holdPosition', reason: 'incursion', runway: rwId });
        }
      }

      // intersection dash
      Gm.INTERSECTIONS.forEach((X, i) => {
        const inX = Gm.dist2(d.p2, X.at) < T.intersectionR && (d.g || d.agl < 30);
        const wasIn = pv.inX?.[i];
        (s.pv.inXNext ||= {})[i] = inX;
        if (!inX || wasIn || S.mutex[`X${i}`] === id) return;
        // someone on the runway we are crossing (not merely ahead of us on our own runway)
        const mine = d.paved && aligned(d.paved, d.g ? d.heading : d.track) ? d.paved.id : null;
        const other = Object.keys(D).find((o) => o !== id && X.runways.some((r) => r !== mine && D[o].occ.includes(r) && !viaIntersectionOnly(D[o], r, d)));
        if (other) emitEvent('intersection_dash', id, { victim: other, severity: 2 });
      });

      // buzzing
      if (!d.g) {
        const td = Gm.dist2(d.p2, [Gm.TOWER.position[0], Gm.TOWER.position[2]]);
        if (td < T.buzzDist && d.agl < Gm.TOWER.height + T.buzzAbove) emitEvent('tower_buzz', id, { severity: td < T.buzzClose ? 3 : 2, data: { dist: Math.round(td), close: td < T.buzzClose } });
        if (Gm.overTerminal(d.p2) && d.agl < T.terminalAgl) emitEvent('terminal_buzz', id, { severity: 2 });
        const lp = d.paved && d.agl >= T.lowPassAgl[0] && d.agl <= T.lowPassAgl[1] && d.gs > T.lowPassVrMult * d.vrKt * KT;
        if (lp) { s.lowPass += d.gs * dt; if (s.lowPass >= T.lowPassDist && !s.lowPassDone) { s.lowPassDone = true; emitEvent('low_pass', id, { severity: 2, data: { metres: Math.round(s.lowPass) } }); } }
        else if (!d.paved) { s.lowPass = 0; s.lowPassDone = false; }
      } else { s.lowPass = 0; s.lowPassDone = false; }

      // taxi speeding, stand steal
      if (d.g && (d.surface === 'taxiway' || d.surface === 'apron') && d.gs > T.taxiSpeedKt * KT) {
        s.taxiFast += dt;
        if (s.taxiFast >= T.taxiSpeedSecs) emitEvent('taxi_speeding', id, { severity: 1, data: { kt: Math.round(d.gs / KT) } });
      } else s.taxiFast = 0;
      if (d.g && d.gs < 1) {
        s.still += dt;
        if (s.still >= T.standStopSecs) for (const st of Gm.STANDS) {
          const owner = S.standOwner[st.id];
          if (owner && owner !== id && Gm.dist2(d.p2, [st.position[0], st.position[2]]) < 15) emitEvent('stand_steal', id, { victim: owner, severity: 1, data: { stand: st.id } });
        }
      } else s.still = 0;

      // selective hearing
      const ga = s.cmds.goAround;
      if (ga && S.t - ga.t > T.ignoredSecs && !s.ignored[ga.seq] && (d.g || (d.agl < 60 && d.vy <= 0.5))) { s.ignored[ga.seq] = 1; emitEvent('ignored_instruction', id, { severity: 2, data: { instruction: 'goAround' } }); }
      const hp = s.cmds.holdPosition || s.cmds.cancelTakeoff;
      if (hp && S.t - hp.t > T.ignoredSecs && !s.ignored[hp.seq] && d.gs > 2) { s.ignored[hp.seq] = 1; emitEvent('ignored_instruction', id, { severity: 2, data: { instruction: hp.type } }); }
      if (d.touchdown && ga && !s.ignored[ga.seq]) { s.ignored[ga.seq] = 1; emitEvent('ignored_instruction', id, { severity: 3, data: { instruction: 'goAround', landed: true } }); }
    }

    // pairwise
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = D[ids[i]], b = D[ids[j]];
      if (a.crashed || b.crashed) continue;
      const key = `${ids[i]}|${ids[j]}`;
      const h = Gm.dist2(a.p2, b.p2);
      const dv = Math.abs(a.pos[1] - b.pos[1]);
      if (h > 400) { if (S.pairs[key]) delete S.pairs[key]; continue; }
      const P = (S.pairs[key] ||= { form: 0, nmMin: null, nmDone: false });
      const d3 = hyp(h, dv);
      const actors = [ids[i], ids[j]].filter((x) => detecting(S.strips[x]));
      const blame = () => {
        const sc = [ids[i], ids[j]].filter((x) => D[x].over || S.strips[x].isPlayer);
        return sc.length ? sc : [D[ids[i]].gs >= D[ids[j]].gs ? ids[i] : ids[j]];
      };
      const air = !a.g && !b.g && a.agl > 3 && b.agl > 3;
      if (cfg.detectCollisions && d3 < T.contact) for (const x of blame()) if (actors.includes(x)) emitEvent('collision', x, { victim: x === ids[i] ? ids[j] : ids[i], severity: 3, cooldown: 5, data: { dist: +d3.toFixed(1) } });
      if (air) {
        if (h < T.minSeparation && dv < T.sepVertical) for (const x of blame()) if (actors.includes(x)) emitEvent('separation_loss', x, { victim: x === ids[i] ? ids[j] : ids[i], severity: d3 < 50 ? 3 : d3 < 100 ? 2 : 1, cooldown: 20, data: { dist: Math.round(d3) } });
        if (d3 < T.nearMiss) P.nmMin = P.nmMin == null ? d3 : Math.min(P.nmMin, d3);
        if (P.nmMin != null && !P.nmDone && (d3 > P.nmMin + 2 || d3 >= T.nearMiss)) {
          P.nmDone = true;
          if (P.nmMin > T.contact) for (const x of blame()) if (actors.includes(x)) emitEvent('near_miss', x, { victim: x === ids[i] ? ids[j] : ids[i], severity: P.nmMin < 12 ? 3 : 2, cooldown: 10, data: { closest: +P.nmMin.toFixed(1) } });
        }
        if (d3 > 60) { P.nmMin = null; P.nmDone = false; }
        if (d3 < T.formationDist) P.form += dt;
        if ((d3 >= T.formationDist || P.form >= T.formationCap) && P.form >= T.formationSecs) {
          for (const x of blame()) if (actors.includes(x)) emitEvent('formation', x, { victim: x === ids[i] ? ids[j] : ids[i], severity: 1, data: { seconds: +P.form.toFixed(1) } });
          P.form = d3 >= T.formationDist ? 0 : -1e9;
        } else if (d3 >= T.formationDist) P.form = 0;
      } else { P.form = 0; }
      // shared runway
      for (const rwId of a.occ) {
        if (!b.occ.includes(rwId)) continue;
        if (viaIntersectionOnly(a, rwId, b) || viaIntersectionOnly(b, rwId, a)) continue;
        if (linedUpBehind(a, b, rwId) || linedUpBehind(b, a, rwId)) continue;
        if (Math.max(a.gs, b.gs) < T.doubleOccKt * KT) continue;
        if (climbingAway(a) || climbingAway(b)) continue;
        for (const x of blame()) if (actors.includes(x)) emitEvent('double_occupancy', x, { victim: x === ids[i] ? ids[j] : ids[i], severity: 2, data: { runway: rwId } });
      }
    }
  }

  // `x` counts as on rwId only because it is at the intersection on the other runway, and `y` is nowhere near it.
  function viaIntersectionOnly(x, rwId, y) {
    if (!x.paved || x.paved.id === rwId) return false;
    const X = Gm.INTERSECTIONS.find((k) => k.runways.includes(rwId) && k.runways.includes(x.paved.id));
    return !!X && Gm.dist2(y.p2, X.at) > T.intersectionR * 3;
  }

  // `x` is stopped, legitimately lined up, and `y` is well ahead of it rolling away (line up behind landing traffic).
  function linedUpBehind(x, y, rwId) {
    const c = x.s.cmds.lineUpWait || x.s.cmds.clearedTakeoff;
    if (x.gs > 8 || !c || cmdRw(c) !== rwId) return false;
    const h = info(c.runwayEnd).heading * Math.PI / 180, ux = Math.sin(h), uz = -Math.cos(h);
    const ahead = (y.p2[0] - x.p2[0]) * ux + (y.p2[1] - x.p2[1]) * uz;
    return ahead > 150 && y.vel[0] * ux + y.vel[2] * uz > 0;
  }

  function savePrev() {
    for (const id in D) {
      const d = D[id], s = d.s;
      const inX = s.pv?.inXNext || {};
      s.pv = { g: d.g, gs: d.gs, vy: d.vy, vx: d.vel[0], vz: d.vel[2], agl: d.agl, occ: d.occ.slice(), paved: d.paved?.id ?? null, inX };
    }
  }

  function updateStates() {
    for (const id in D) {
      const d = D[id], s = d.s, c = s.cmds;
      let st;
      if (d.crashed) st = 'crashed';
      else if (d.g) {
        if (c.vacate || (s.rollRw && d.gs > 3)) st = d.gs > 15 ? 'rollout' : 'vacating';
        else if (c.clearedTakeoff) st = d.gs > 3 ? 'takeoff' : 'lineup';
        else if (d.linedUp || c.lineUpWait) st = 'lineup';
        else if (s.holdT != null) st = 'holding';
        else if (d.gs > 0.5 || c.taxi) st = 'taxi';
        else st = 'parked';
      } else if (s.intent === 'depart' && !S.seqs[s.landEnd]?.includes(id)) st = 'departing';
      else if (d.paved && d.agl < 40 && !c.goAround) st = c.clearedLand || c.clearedTouchAndGo ? 'landing' : 'climbout';
      else if (c.goAround) st = 'goAround';
      else if (!Object.values(S.seqs).some((l) => l.includes(id))) st = 'away';
      else st = s.leg === 'final' ? (c.clearedLand || c.clearedTouchAndGo ? 'landing' : 'final') : 'circuit';
      if (st !== s.state) {
        const from = s.state; s.state = st;
        emitRaw('strip', { type: 'strip', id, callsign: s.callsign, from, to: st, t: S.t });
        if (RADIO_PHASE[st] && from !== 'new') radio({ type: 'phase', actor: id, phase: RADIO_PHASE[st] });
      }
    }
  }

  function outrageDecay(dt) {
    for (const key of Object.keys(S.meters)) {
      const pid = key.startsWith('tower:') ? key.slice(6) : null;
      const calm = pid ? !D[pid]?.over : !Object.values(D).some((d) => d.s.isPlayer && d.over);
      handleMeterChanges(key, decayOutrage(S.meters[key], dt, S.t, calm), pid);
    }
  }

  function chooseActive() {
    if (opts.activeEnd) return opts.activeEnd;
    const cands = Gm.ALL_ENDS.filter((e) => Gm.departurePoint(e) && S.open[rwOfEnd(e).id]);
    let best = S.activeEnd || cands[0], bh = -1e9;
    for (const e of cands) { const h = Gm.windComponents(e, S.wind).head; if (h > bh + 0.01) { bh = h; best = e; } }
    if (S.activeEnd && best !== S.activeEnd && bh - Gm.windComponents(S.activeEnd, S.wind).head < 3) return S.activeEnd;
    return best;
  }

  function runwayChangePass() {
    const P = S.pendingEnd;
    if (!P) return;
    const rwOld = rwOfEnd(S.activeEnd).id;
    const ops = strips().some((s) => ['clearedLand', 'clearedTouchAndGo', 'clearedTakeoff', 'lineUpWait'].some((k) => s.cmds[k] && cmdRw(s.cmds[k]) === rwOld));
    const short = (S.seqs[S.activeEnd] || []).some((id) => D[id]?.prog?.onFinal && S.strips[id].rem < 1500);
    if ((ops || short || occupants(rwOld).length) && S.t - P.t < T.rwChangeMax) return;
    switchRunway();
  }
  function switchRunway() {
    const prev = S.activeEnd, end = S.pendingEnd.end;
    S.pendingEnd = null; S.activeEnd = end;
    if (cfg.authority) {
      const rwOld = rwOfEnd(prev).id;
      for (const s of strips()) {
        const d = D[s.id];
        if ((s.cmds.clearedLand || s.cmds.clearedTouchAndGo) && cmdRw(s.cmds.clearedLand || s.cmds.clearedTouchAndGo) === rwOld && d && !d.g) goAround(s, 'runwayChange');
        if (!d?.g) continue;
        if ((s.cmds.lineUpWait || s.cmds.clearedTakeoff) && d.gs < 10) issue(s, { type: 'cancelTakeoff', runwayEnd: prev, reason: 'runwayChange' });
        if ((s.cmds.taxi?.dest === 'runway' || s.holdT != null || s.cmds.cancelTakeoff) && Gm.departurePoint(end)) {
          const r = Gm.taxiToRunway(d.p2, end, d.heading);
          if (r) { issue(s, { type: 'taxi', ...r }); s.holdT = null; s.crossed = []; }
        }
      }
      S.deps[prev] = [];
    }
    emitRaw('runwayChange', { type: 'runwayChange', from: prev, to: end, t: S.t });
  }

  // ---------- public API ----------
  function step(dt, roomTime, states) {
    if (Array.isArray(roomTime)) { states = roomTime; roomTime = undefined; }
    S.t = roomTime != null ? roomTime : S.t + dt;
    D = {}; tickEvents = [];
    ingest(states || []);
    transitions(dt);
    detect(dt);
    sequencePass();
    if (cfg.authority) { runwayChangePass(); arrivals(); departures(); ground(); mutexHousekeeping(); }
    else departures();
    for (const id in D) if (D[id].s.pv) D[id].s.pv.inXNext = D[id].s.pv.inXNext || {};
    savePrev();
    updateStates();
    outrageDecay(dt);
    return tickEvents;
  }

  const api = {
    update: (dt, states) => step(dt, undefined, states),
    step,
    on(type, fn) { (listeners[type] ||= []).push(fn); return () => api.off(type, fn); },
    off(type, fn) { listeners[type] = (listeners[type] || []).filter((f) => f !== fn); },
    instructionsFor(id) { const s = S.strips[String(id)]; return s ? Object.values(s.cmds).sort((a, b) => a.seq - b.seq) : []; },
    command(id, type) { return S.strips[String(id)]?.cmds[type] ?? null; },
    strip(id) { const s = S.strips[String(id)]; return s ? { id: s.id, callsign: s.callsign, state: s.state, intent: s.intent, landEnd: s.landEnd, leg: s.leg, remaining: s.rem, number: s.seqNo, follow: s.follow, extend: Math.round(s.ext), stand: s.stand, penalty: s.penaltyUntil > S.t } : null; },
    sequence(end = S.activeEnd) { return (S.seqs[end] || []).slice(); },
    departureQueue() { return (S.depQueue || []).slice(); },
    activeRunway() { return { end: S.activeEnd, runway: rwOfEnd(S.activeEnd).id, open: { ...S.open }, wind: { ...S.wind } }; },
    // A wind shift changes the active runway once the old one is quiet (nobody cleared on it, no one on short final),
    // or after T.rwChangeMax seconds regardless (then finals go around). Until then no new departures are released.
    setWind(from, kt) { S.wind = { from, kt }; const e = chooseActive(); S.pendingEnd = e !== S.activeEnd ? { end: e, t: S.t } : null; if (S.pendingEnd && !cfg.authority) switchRunway(); },
    get pendingRunway() { return S.pendingEnd?.end ?? null; },
    setRunwayOpen(rwId, open) { S.open[rwId] = !!open; },
    composure(key = 'tower') { const m = meter(key); return { outrage: Math.round(m.v), tier: m.tier, tierName: tierName(m.tier), frozen: m.frozenUntil > S.t, scandals: m.scandals }; },
    report(type, actor, extra = {}) { return S.strips[String(actor)] ? emitEvent(type, String(actor), extra) : null; },
    addOutrage(amount, actor = null) { const k = meterKey(actor); handleMeterChanges(k, addOutrage(meter(k), amount, S.t, 1), actor); },
    setLocal(id, local) { const s = S.strips[String(id)]; if (s) s.local = !!local; },
    configure(o) { for (const k of ['authority', 'detectRemote', 'detectCollisions', 'aiOutrage', 'outragePerPlayer', 'outrageGain']) if (o[k] != null) cfg[k] = o[k]; },
    remove(id) { removeStrip(String(id)); },
    // No crimes for this plane for `secs` (spawn, respawn, skip-to-runway). Good events still count.
    grace(id, secs = 8) { const s = S.strips[String(id)]; if (s) s.graceUntil = S.t + secs; else (S.pendingGrace ||= {})[String(id)] = S.t + secs; },
    // The game moved this plane by hand: forget its ground/landing state. lineUp: end → it is legitimately lined up there.
    resetStrip(id, { lineUp = null, grace = 10 } = {}) {
      id = String(id);
      const s = S.strips[id];
      if (!s) { (S.pendingGrace ||= {})[id] = S.t + grace; return; }
      s.cmds = {}; s.rollRw = null; s.holdT = null; s.cutPending = null; s.penaltyUntil = -1e9; s.touchT = null; s.liftT = null;
      s.ext = 0; s.leg = null; s.issuedSeq = null; s.air = null; s.pv = null; s.done = false;
      removeFromSeqs(id); releaseMutex(id);
      S.mutexWait = S.mutexWait.filter((x) => x !== id);
      for (const k of Object.keys(S.deps)) S.deps[k] = S.deps[k].filter((x) => x !== id);
      s.graceUntil = S.t + grace;
      if (lineUp && cfg.authority) { const dp = Gm.departurePoint(lineUp) || { lineUp: info(lineUp).T }; issue(s, { type: 'lineUpWait', runwayEnd: lineUp, at: dp.lineUp, heading: info(lineUp).heading }); (S.deps[lineUp] ||= []).unshift(id); }
    },
    serialize() { return clone(S); },
    restore(json) { S = clone(typeof json === 'string' ? JSON.parse(json) : json); circCache.clear(); },
    get time() { return S.t; },
    get log() { return S.log.slice(); },
    get counts() { return { ...S.counts }; },
    get mutex() { return { ...S.mutex }; },
    _debug: () => ({ S, D }),
    geo: Gm,
  };
  S.activeEnd = chooseActive();
  return api;
}

const crossKey = (rw, at) => `${rw}@${Math.round(at[0])},${Math.round(at[1])}`;

function freshState(opts, Gm) {
  const open = {};
  for (const rw of Gm.RUNWAYS) open[rw.id] = !rw.closed;
  Object.assign(open, opts.open || {});
  return {
    v: 1, t: opts.time ?? 0, cmdSeq: 0, evSeq: 0, wind: opts.wind || { ...Gm.WIND }, activeEnd: null, open,
    strips: {}, seqs: {}, deps: {}, depQueue: [], mutex: {}, mutexWait: [], cool: {}, pairs: {}, meters: { tower: newMeter() },
    standOwner: {}, lastTaxiT: -1e9, log: [], counts: {},
  };
}
