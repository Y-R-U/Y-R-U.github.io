// Royal Privilege economy (DESIGN §1.2–1.4, rules.js). Pure: no DOM, no clock; time only advances through update(dt).
import { INFRACTIONS, BANK, CLEAN, BANTER, MULTIPLIERS as M, OUTRAGE, PROTECTION as P, DIFFICULTY } from '../../data/rules.js';
import { AIRCRAFT } from '../../data/aircraft.js';
import { FREE_FLIGHT, ROOM_TYPES } from '../../data/modes.js';

export const PAVED = ['runway', 'taxiway', 'apron'];
const round10 = (x) => Math.round(x / M.roundTo) * M.roundTo;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fmt = (m) => '×' + (Math.round(m * 100) / 100);

const HEADLINES = [
  '{T} {N} DISGRACES AERODROME', 'TOWER WEEPS AS {T} {N} STRIKES AGAIN', '"DO YOU KNOW WHO I AM?" ASKS {T} {N}, AGAIN',
  'OWL COLLECTION SHAKEN: {T} {N} BUZZES TOWER', 'PALACE "UNAWARE" OF {T} {N}', 'COMMONERS SENT ROUND BY {T} {N}',
];

export function resolveMode(o = {}) {
  const room = ROOM_TYPES[o.mode] || null;
  const diff = o.mode === 'story' ? DIFFICULTY[o.difficulty || 'medium'] : null;
  return {
    room,
    protection: o.protection || room?.protection || diff?.protection || FREE_FLIGHT.protection,
    outrageGain: o.outrageGain ?? room?.outrageGain ?? diff?.outrageGain ?? 1,
    ppRate: o.ppRate ?? (o.mode === 'free' || !o.mode ? FREE_FLIGHT.ppRate : 1),
    crashPenalty: room?.crashPenalty || 0,
    partialStart: o.partialStartPct ?? P.partial.startPct,
  };
}

// Base PP for one infraction event, before multipliers. null = not a scoring infraction.
export function basePP(id, ev = {}, realistic = false) {
  const r = INFRACTIONS[id];
  if (!r || !r.pp) return null;
  const d = ev.data || {};
  let pp = r.pp;
  if (id === 'queue_jump') pp *= Math.max(1, d.jumped ?? ev.jumped ?? 1);
  if (id === 'cut_in_final' && (d.close || (d.gap ?? ev.gap ?? Infinity) < r.closeBonus.gap)) pp *= r.closeBonus.mult;
  if (id === 'tower_buzz' && (d.close || (d.dist ?? ev.dist ?? Infinity) < r.closeBonus.dist)) pp *= r.closeBonus.mult;
  if (id === 'formation') pp = Math.min(r.cap, r.pp + r.perSecond * Math.max(0, Math.floor((d.seconds ?? ev.seconds ?? 3) - 3)));
  if (id === 'near_miss' && realistic) pp *= r.realisticMult;
  return pp;
}

export function audacityMult(playerRank, victimRank) {
  if (victimRank == null || playerRank == null) return 1;
  return clamp(1 + (victimRank - playerRank) * M.audacityPerRank, 1, M.audacityMax);
}
export const heatMult = (outrage) => Math.min(M.outrageMax, 1 + outrage / M.outrageDivisor);
export const comboMult = (step) => M.combo[clamp(step, 0, M.combo.length - 1)];

export function partialLoss(kt) { return clamp(kt * P.partial.lossPerKt, P.partial.lossMin, P.partial.lossMax); }
export function partialRestitution(pct) {
  const a = P.partial.restitutionAt10, b = P.partial.restitutionAt100;
  return pct >= 10 ? a + (b - a) * (pct - 10) / 90 : a * Math.max(0, pct) / 10;
}
export function withinGearLimits({ sinkFpm = 0, bankDeg = 0, pitchDeg = 0 } = {}) {
  const g = P.realistic.gearLimits;
  return sinkFpm <= g.maxSinkFpm && Math.abs(bankDeg) <= g.maxBankDeg && pitchDeg >= g.minPitchDeg && pitchDeg <= g.maxPitchDeg;
}

export function createScore(opts = {}) {
  const mode = resolveMode(opts);
  const rng = opts.rng || Math.random;
  const me = opts.playerId ?? 'player';
  const listeners = {};
  const emit = (type, p) => { for (const fn of listeners[type] || []) fn(p); for (const fn of listeners['*'] || []) fn({ type, ...p }); };
  const pilotRanks = new Map();
  const seen = new Set(), seenQ = [];

  const S = {
    pending: 0, banked: 0, outrage: 0, tier: 1, outrageSource: opts.outrageSource || 'auto',
    comboStep: -1, comboLeft: 0, frozen: 0,
    protectionMode: mode.protection, protection: mode.protection === 'partial' ? mode.partialStart : mode.protection === 'rubber' ? 100 : 0,
    rankIndex: opts.rankIndex ?? 0, aircraft: opts.aircraft || 'c172', ppScale: 1,
    airborne: false, landed: false, stopT: 0, impeccableDone: false, gag: 0,
    stats: { infractions: 0, bestCombo: 1, bounces: 0, crashes: 0, scandals: 0, sorties: 0, ripostes: 0 },
  };

  const effective = () => (S.protectionMode === 'partial' && S.protection <= 0 ? 'realistic' : S.protectionMode);
  const mine = (ev) => ev.actor === me || (ev.isPlayer === true);
  const tierOf = (v) => OUTRAGE.tiers.reduce((t, x) => (v >= x.min ? x.tier : t), 1);

  function setOutrage(v, why) {
    v = clamp(v, 0, OUTRAGE.max);
    S.outrage = v;
    const t = tierOf(v);
    if (t !== S.tier) { const from = S.tier; S.tier = t; emit('outrage', { value: Math.round(v), tier: t, from, why }); }
  }
  // forward: FLIGHT-side outrage ATC never sees (bounce, prang, priority) — main may pass it to atc.addOutrage.
  function addOutrage(amount, why, forward = true) {
    if (!amount) return;
    if (forward) emit('outrageDelta', { amount, why });
    if (S.outrageSource === 'events') return;
    const v = S.outrage + amount * (amount > 0 ? mode.outrageGain : 1);
    if (v >= OUTRAGE.max) { setOutrage(OUTRAGE.max, why); scandal({}); } else setOutrage(v, why);
  }

  function lose(frac, reason, label) {
    const amt = Math.round(S.pending * frac);
    S.pending -= amt;
    if (amt > 0 || reason === 'destroyed') emit('loss', { amount: amt, reason, pending: S.pending, text: `${label} −${amt}` });
    return amt;
  }

  function gain(amount, info) {
    S.pending += amount;
    emit('pp', { amount, pending: S.pending, ...info });
  }

  function scandal(ev) {
    const forfeit = lose(OUTRAGE.scandal.pendingForfeit, 'scandal', 'SCANDAL!');
    S.frozen = OUTRAGE.scandal.frozenFor;
    S.comboStep = -1; S.comboLeft = 0;
    S.stats.scandals++;
    setOutrage(OUTRAGE.scandal.resetTo, 'scandal');
    const h = HEADLINES[Math.floor(rng() * HEADLINES.length)].replace('{T}', (opts.title || 'BARON').toUpperCase()).replace('{N}', (opts.name || 'DIRK').toUpperCase());
    emit('scandal', { forfeit, frozenFor: S.frozen, headline: `THE KRAYZEE HERALD: ${h}`, headlineSecs: OUTRAGE.scandal.headlineSecs, pending: S.pending, source: ev.type ? 'atc' : 'score' });
  }

  function infraction(id, ev) {
    const base = basePP(id, ev, effective() === 'realistic');
    if (base == null) return null;
    const frozen = typeof ev.frozen === 'boolean' ? ev.frozen : S.frozen > 0;
    const heatBefore = S.outrage;
    if (typeof ev.outrage !== 'number') addOutrage(INFRACTIONS[id].outrage, id, false);
    if (!frozen) {
      S.comboStep = S.comboLeft > 0 ? Math.min(S.comboStep + 1, M.combo.length - 1) : 0;
      S.comboLeft = M.comboWindow;
    }
    const victimRank = ev.victimRank ?? (ev.victim != null ? pilotRanks.get(ev.victim) : undefined);
    const parts = {
      base,
      combo: comboMult(Math.max(0, S.comboStep)),
      audacity: audacityMult(S.rankIndex, victimRank),
      heat: heatMult(heatBefore),
      aircraft: AIRCRAFT[S.aircraft]?.ppMult ?? 1,
      scale: mode.ppRate * S.ppScale,
    };
    const mult = parts.combo * parts.audacity * parts.heat * parts.aircraft * parts.scale;
    const amount = frozen ? 0 : round10(base * mult);
    const name = INFRACTIONS[id].name;
    S.stats.infractions++;
    S.stats.bestCombo = Math.max(S.stats.bestCombo, parts.combo);
    const text = frozen ? `${name.toUpperCase()} — the press are watching` : `${name.toUpperCase()}! +${amount}${Math.abs(mult - 1) > 0.005 ? ' ' + fmt(mult) : ''}`;
    gain(amount, { id, name, text, mult, parts, frozen, combo: parts.combo, victim: ev.victim ?? null });
    if (!frozen && S.comboStep > 0) emit('combo', { mult: parts.combo, step: S.comboStep, left: S.comboLeft });
    return amount;
  }

  function impeccable() {
    if (S.impeccableDone) return;
    S.impeccableDone = true;
    if (S.frozen > 0) return;
    const amount = Math.round(CLEAN.impeccable.pp * mode.ppRate * S.ppScale);
    gain(amount, { id: 'impeccable', name: 'Impeccable', text: `IMPECCABLE +${amount}`, mult: 1 });
    addOutrage(CLEAN.impeccable.outrage, 'impeccable');
  }

  function banter(b) {
    if (b.source !== 'response' || S.frozen > 0) return;
    let amount = BANTER.riposte, name = 'Riposte';
    if (b.intent === 'priority' && b.target === 'tower') { amount = BANTER.priorityReply.pp; name = 'Do You Know Who I Am'; addOutrage(BANTER.priorityReply.outrage, 'priority'); }
    else if (b.reaction != null && b.reaction <= BANTER.quickRiposte.within) { amount = BANTER.quickRiposte.pp; name = 'Quick Riposte'; }
    amount = Math.round(amount * mode.ppRate * S.ppScale);
    S.stats.ripostes++;
    gain(amount, { id: 'banter', name, text: `${name.toUpperCase()}! +${amount}`, mult: 1, intent: b.intent });
  }

  function bank(atStand) {
    const amount = S.pending;
    S.pending = 0; S.banked += amount; S.landed = false; S.stopT = 0;
    S.stats.sorties++;
    if (S.protectionMode === 'partial') {
      const before = S.protection;
      S.protection = atStand ? P.partial.refillAtStand : Math.min(100, S.protection + P.partial.refillOnBank);
      if (S.protection !== before) emit('protection', { mode: 'partial', pct: S.protection, effective: effective(), refill: S.protection - before });
    }
    if (amount > 0) emit('banked', { amount, sessionBanked: S.banked, atStand: !!atStand, text: `BANKED ${amount}` });
    return amount;
  }

  function handleEvent(ev) {
    if (!ev || !ev.type) return;
    if (typeof ev.id === 'number') {
      const k = `${ev.type}|${ev.id}`;
      if (seen.has(k)) return;
      seen.add(k); seenQ.push(k); if (seenQ.length > 200) seen.delete(seenQ.shift());
    }
    if (ev.type === 'scandal') {
      const k = `scandal|${ev.t ?? ''}|${ev.key ?? ''}`;
      if (ev.t != null && seen.has(k)) return;
      seen.add(k); seenQ.push(k);
      const forMe = ev.key == null || ev.key === 'tower' || ev.key === `tower:${me}` || ev.actor === me;
      if (forMe) { S.outrageSource = S.outrageSource === 'internal' ? 'internal' : 'events'; scandal(ev); }
      return;
    }
    const id = ev.type === 'infraction' ? ev.id : ev.type;
    const outr = typeof ev.outrage === 'number' ? ev.outrage : ev.type === 'outrage' ? ev.value : null;
    const meterIsMine = ev.key != null ? ev.key === (opts.outragePerPlayer ? `tower:${me}` : 'tower') : (mine(ev) || !opts.outragePerPlayer);

    if (ev.type === 'barked') banter(ev);
    else if (id === 'impeccable' && mine(ev)) impeccable();
    else if (ev.type === 'landed' && mine(ev)) { S.landed = true; if (ev.impeccable) impeccable(); }
    else if (typeof id === 'string' && INFRACTIONS[id] && mine(ev)) infraction(id, ev);

    if (outr != null && meterIsMine && S.outrageSource !== 'internal') {
      S.outrageSource = 'events';
      setOutrage(outr, ev.type);
    }
  }

  // FLIGHT collisions. onGear:false = ground contact outside the gear envelope (or water/building touchdown).
  function reportImpact({ speedKt = 0, onGear = true, other = null } = {}) {
    const kt = Math.abs(speedKt);
    const eff = effective();
    if (eff === 'rubber' || eff === 'partial') {
      const before = S.protection;
      let restitution = P.rubber.restitution;
      if (eff === 'partial') { restitution = partialRestitution(before); S.protection = Math.max(0, before - partialLoss(kt)); }
      S.stats.bounces++;
      const pendingLost = lose(P.rubber.pendingLoss, 'bounce', 'DIGNITY LOST');
      addOutrage(P.rubber.outrage, 'bounce');
      const out = { result: 'bounce', protectionLeft: S.protection, restitution, spinDegPerS: (rng() * 2 - 1) * P.rubber.spinMaxDegPerS, apResumeAfter: P.rubber.apResumeAfter, pendingLost, other };
      if (eff === 'partial') emit('protection', { mode: 'partial', pct: S.protection, effective: effective(), hit: before - S.protection });
      return out;
    }
    const R = P.realistic;
    if (!onGear || kt > R.destroyAboveKt) {
      S.stats.crashes++;
      const pendingLost = lose(R.destroyed.pendingLoss, 'destroyed', 'DESTROYED');
      S.comboStep = -1; S.comboLeft = 0; S.landed = false; S.airborne = false; S.gag = R.destroyed.gagSecs;
      if (mode.crashPenalty) S.banked = Math.max(0, S.banked - mode.crashPenalty);
      emit('destroyed', { pendingLost, gagSecs: R.destroyed.gagSecs, crashPenalty: mode.crashPenalty, sessionBanked: S.banked });
      return { result: 'destroyed', protectionLeft: 0, restitution: 0, gagSecs: R.destroyed.gagSecs, pendingLost, crashPenalty: mode.crashPenalty, other };
    }
    const pendingLost = lose(R.prang.pendingLoss, 'prang', 'PRANG');
    addOutrage(R.prang.outrage, 'prang');
    return { result: 'damage', protectionLeft: 0, restitution: 0.1, shake: R.prang.shake, pendingLost, other };
  }

  // f: { gsKt, onGround, surface, atStand, calm } from FLIGHT; all optional.
  function update(dt, f) {
    if (S.comboLeft > 0) { S.comboLeft = Math.max(0, S.comboLeft - dt); if (!S.comboLeft) { S.comboStep = -1; emit('combo', { mult: 1, step: -1, left: 0 }); } }
    if (S.frozen > 0) { S.frozen = Math.max(0, S.frozen - dt); if (!S.frozen) emit('unfrozen', {}); }
    if (S.gag > 0) S.gag = Math.max(0, S.gag - dt);
    if (S.outrageSource !== 'events' && f?.calm && S.outrage > 0) setOutrage(S.outrage - OUTRAGE.decayPer3s / 3 * dt, 'decay');
    if (!f) return;
    if (f.onGround === false) { if (!S.airborne) S.impeccableDone = false; S.airborne = true; S.landed = false; S.stopT = 0; return; }
    if (f.onGround && S.airborne) { S.airborne = false; S.landed = true; }
    const stopped = (f.gsKt ?? 99) < BANK.stopSpeedKt;
    const where = f.atStand || (S.landed && PAVED.includes(f.surface));
    S.stopT = stopped && where ? S.stopT + dt : 0;
    if (S.stopT >= BANK.stopTime) {
      const refill = S.protectionMode === 'partial' && S.protection < 100 && (S.landed || f.atStand);
      if (S.pending > 0 || refill) bank(!!f.atStand);
    }
  }

  return {
    handleEvent, reportImpact, update, bank,
    on(t, fn) { (listeners[t] ||= []).push(fn); return () => { listeners[t] = listeners[t].filter((x) => x !== fn); }; },
    setPilotRank(id, idx) { pilotRanks.set(id, idx); },
    setRankIndex(i) { S.rankIndex = i; },
    setAircraft(id) { S.aircraft = id; },
    setPPScale(x) { S.ppScale = x; },
    respawn() { S.landed = false; S.airborne = false; S.stopT = 0; S.gag = 0; if (S.protectionMode === 'partial') S.protection = mode.partialStart; },
    get mode() { return mode; },
    state() {
      return {
        pending: S.pending, banked: S.banked, outrage: Math.round(S.outrage), tier: S.tier, outrageSource: S.outrageSource,
        combo: S.comboStep >= 0 ? comboMult(S.comboStep) : 1, comboLeft: S.comboLeft, comboFrac: S.comboLeft / M.comboWindow,
        frozen: S.frozen, protectionMode: S.protectionMode, protection: S.protection, effectiveProtection: effective(),
        rankIndex: S.rankIndex, aircraft: S.aircraft, landed: S.landed, airborne: S.airborne, gag: S.gag, stats: { ...S.stats },
      };
    },
    serialize() { return JSON.parse(JSON.stringify({ ...S, pilotRanks: [...pilotRanks] })); },
    restore(j) { const { pilotRanks: pr, ...rest } = j; Object.assign(S, rest); pilotRanks.clear(); for (const [k, v] of pr || []) pilotRanks.set(k, v); },
  };
}
