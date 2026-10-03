// Pacing bot for Idle Life 2. Drives the real js/state/game.js with an active and an idle profile.
// node tools/sim.mjs [--plant-r1] [--minutes=95] [--gen2] [--season] [--json] [--quiet]
import { createGame } from '../js/state/game.js';
import { ECON, LINES } from '../js/data/lines.js';
import { MANAGER_LEVELS } from '../js/data/managers.js';
import { SEASONS } from '../js/data/seasons.js';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const MINUTES = +(args.minutes || 95);
const START = Date.parse('2026-10-05T09:00:00');
const PLANT = !!args['plant-r1'];
const econ = PLANT ? { ...ECON, pileMult: 1.25, sigmaPrice: 1.0 } : ECON;

export const TARGETS = [
  ['firstStand', 'First stand', 25, 40],
  ['foodtruck', 'Food Truck', 63, 117],
  ['suburbs', 'Suburbs', 210, 390],
  ['harbour', 'Harbour', 900, 1200],
  ['downtown', 'Downtown', 2400, 3000],
  ['retireAvail', 'Retire available', 2700, 3600],
  ['retireRec', 'Retire recommended', 4500, 5400],
];
const TOL = 0.3;

export const PROFILES = {
  active: { name: 'active', tapRate: (t) => (t < 600 ? 2.5 : 1.5), canRate: 1.2, decideEvery: 2, pileEvery: 20, checkIn: 0, events: true },
  idle: { name: 'idle', tapRate: () => 0, canRate: 1.2, decideEvery: 0, pileEvery: 0, checkIn: 180, early: 60, events: false },
  typical: { name: 'typical', tapRate: (t) => (t < 600 ? 1 : 0.5), canRate: 1, decideEvery: 5, pileEvery: 60, checkIn: 0, events: false, casual: true, housingShare: 0.15 },
  slow: { name: 'slow', tapRate: () => 0, canRate: 0.8, decideEvery: 0, pileEvery: 0, checkIn: 300, early: 120, events: false, casual: true, housingShare: 0.15 },
};

export const LIFE_TARGETS = [
  ['partner', 'Partner', 600, 900, ['active', 'typical']],
  ['firstKid', 'First kid', 1500, 2100, ['active', 'typical']],
  ['retireAvail', 'Retire available', 3600, 5400, ['typical']],
];
const SLOW_LIMIT_MIN = 240;

export function mk(save, seed, clock) {
  return createGame({ data: { econ }, save, seed, nowWall: () => clock.t, allowCheat: true });
}

function clone(g, clock) {
  return mk(JSON.parse(g.serialize()), g.state.seed, clock);
}

function lineValue(s, prof, X) {
  if (!s.owned) return 0;
  const P = s.grossPerSec;
  if (s.autoPile) return P;
  const sigma = s.sigma;
  if (prof.name === 'active') return P * (sigma + (1 - sigma) * X.pileMult);
  const capSec = P > 0 ? s.shelfCap / P : 0;
  const f = Math.min(1, capSec / (prof.checkIn || prof.pileEvery || 180));
  return P * (sigma + (1 - sigma) * X.pileMult * f);
}

function tapPerSec(g, prof, t) {
  const r = prof.tapRate(t);
  if (!r || !g.state.bootstrap.done) return 0;
  const X = g.data.econ;
  const combo = r >= 1 / X.comboWindow ? X.comboMax : 1;
  return r * g.totals().tapValue * combo * (1 + X.tapCrit * (X.tapCritMult - 1));
}

export function profileValue(g, prof, t = 0) {
  const X = g.data.econ;
  let v = 0;
  for (const l of LINES) v += lineValue(g.stats(l.id), prof, X);
  return v + tapPerSec(g, prof, t);
}

function decisionValue(g, prof, t) {
  if (prof.name === 'idle') return profileValue(g, prof, t);
  return 0.7 * profileValue(g, prof, t) + 0.3 * profileValue(g, PROFILES.idle, t);
}

function options(g, prof = {}) {
  const st = g.state, out = [];
  const X = g.data.econ;
  for (const l of LINES) {
    const s = g.stats(l.id);
    if (!s.owned) {
      if (s.unlockable) out.push({ act: 'unlock', p: { lineId: l.id }, kind: 'unlock', l });
      continue;
    }
    out.push({ act: 'level', p: { lineId: l.id, qty: 1 }, kind: 'level', l, n: 1 });
    const m = s.nextMilestone;
    if (m && m - s.level > 1 && m - s.level <= 60) out.push({ act: 'level', p: { lineId: l.id, qty: m - s.level }, kind: 'level', l, n: m - s.level });
    if (s.nextThroughput) out.push({ act: 'throughput', p: { lineId: l.id }, kind: 'thr', l });
    if (s.nextBoost) out.push({ act: 'boost', p: { lineId: l.id }, kind: 'boost', l });
    if (!s.managed) out.push({ act: 'hire', p: { lineId: l.id }, kind: 'hire', l });
    if (s.storageLevel < l.storage.length) out.push({ act: 'storage', p: { lineId: l.id }, kind: 'storage', l });
    if (s.managed && st.managers[s.managerId]?.level < MANAGER_LEVELS.max) out.push({ act: 'managerLevel', p: { managerId: s.managerId }, kind: 'mgrLevel', l });
  }
  const nextHome = st.life.homeTier + 1;
  if (g.data.housing[nextHome] && !prof.casual) out.push({ act: 'housing', p: { tier: nextHome }, kind: 'housing' });
  for (const d of g.data.districts) if (!st.districts.includes(d.id)) { out.push({ act: 'permit', p: { districtId: d.id }, kind: 'permit', d }); break; }
  if (!st.supply.on && !prof.casual) out.push({ act: 'supplyLink', p: {}, kind: 'supply' });
  return out.filter((o) => {
    if (prof.casual && (o.kind === 'mgrLevel' || o.kind === 'storage')) return false;
    const q = g.quote(o.act, o.p);
    o.q = q;
    o.cost = q.cost;
    return isFinite(q.cost) && !q.blocked && !q.young && (o.kind !== 'supply' || q.ready);
  });
}

function estimate(g, o, prof, t, base) {
  const X = g.data.econ;
  const tot = g.totals();
  const lv = (s) => lineValue(s, prof, X);
  const tr = prof.tapRate(t);
  const tapK = tr ? tr * (tr >= 1 / X.comboWindow ? X.comboMax : 1) * X.tapK * (prof.name === 'active' ? 0.7 : 1) : 0;
  const withP = (s, P, extra = {}) => ({ ...s, grossPerSec: P, shelfCap: s.shelfCap * (P / Math.max(1e-9, s.grossPerSec)), ...extra });
  const dLine = (s, s2) => (lv(s2) - lv(s)) * (prof.name === 'active' ? 0.7 : 1) + (s2.grossPerSec - s.grossPerSec) * tapK;
  if (o.l) {
    const s = g.stats(o.l.id);
    const ms = (n) => X.milestones.filter((x) => n >= x).length;
    switch (o.kind) {
      case 'unlock': {
        const P = o.l.rate * tot.globalMult;
        const mg = g.data.managers.find((m) => m.lineId === o.l.id && !m.seasonal);
        const managed = !!g.state.managers[mg.id];
        const s0 = { owned: true, grossPerSec: 0, sigma: 0, managed: false, shelfCap: 0 };
        return dLine(s0, { owned: true, grossPerSec: P, sigma: managed ? X.sigma0 : 0, managed, shelfCap: P * X.shelfSec });
      }
      case 'level': {
        const l2 = s.level + o.n;
        const P = s.grossPerSec * (l2 / s.level) * Math.pow(X.milestoneMult, ms(l2) - ms(s.level));
        return dLine(s, withP(s, P));
      }
      case 'thr': return dLine(s, withP(s, s.grossPerSec * X.sigmaPrice, { sigma: s.managed ? Math.min(1, s.sigma + X.sigmaStep) : 0 }));
      case 'boost': return dLine(s, withP(s, s.grossPerSec * s.nextBoost.mult));
      case 'storage': return dLine(s, { ...s, shelfCap: s.shelfCap * X.shelfStep });
      case 'hire': return dLine(s, { ...s, managed: true, sigma: Math.min(1, X.sigma0 + X.sigmaStep * s.sigmaUpgrades) }) + 0.05 * base;
      case 'mgrLevel': {
        const lvl = g.state.managers[s.managerId].level;
        return dLine(s, withP(s, s.grossPerSec * MANAGER_LEVELS.mult[lvl] / MANAGER_LEVELS.mult[lvl - 1]));
      }
    }
  }
  if (o.kind === 'housing') {
    const h = g.data.housing;
    return base * (h[o.p.tier].mult / h[o.p.tier - 1].mult - 1);
  }
  if (o.kind === 'permit') {
    const first = LINES.find((l) => l.district === o.d.id);
    o.cost += g.quote('unlock', { lineId: first.id }).cost;
    return Math.max(first.rate * tot.globalMult, base * 0.15);
  }
  if (o.kind === 'supply') {
    const s = g.stats('fishchips');
    return dLine(s, withP(s, s.grossPerSec * g.data.supply.mult));
  }
  return 0;
}

const NOVELTY = { unlock: 2, permit: 3, housing: 2, hire: 1.5, supply: 2, thr: 1.3, boost: 1.3 };

function shop(g, prof, t, log, audit) {
  const st = g.state;
  if (!prof.casual) {
    for (const c of g.goals().contracts) if (c.visible && c.done && !c.claimed) { g.act('claimContract', { id: c.id }); log.beat(t, 'contract ' + c.id); }
    g.goals().daily.forEach((d, i) => { if (d.done && !d.claimed) g.act('claimDaily', { index: i }); });
    if (g.goals().gift.ready) g.act('claimGift');
  }
  if (st.life.partnerOffer) g.act('partner', { choice: 'entrepreneur' });
  if (st.life.dogOffer && !st.life.dog) g.act('adoptDog', { name: 'Biscuit' });
  if (prof.casual) {
    const h = g.quote('housing', { tier: st.life.homeTier + 1 });
    if (isFinite(h.cost) && !h.young && h.cost <= st.cash * prof.housingShare) { g.act('housing', { tier: st.life.homeTier + 1 }); log.beat(t, 'housing ' + st.life.homeTier); }
  }
  if (!prof.casual && st.districts.includes('downtown') && st.nightShift.length < 2) {
    const best = LINES.filter((l) => g.stats(l.id).owned && !st.nightShift.includes(l.id)).sort((a, b) => g.stats(b.id).grossPerSec - g.stats(a.id).grossPerSec);
    for (const l of best.slice(0, 2 - st.nightShift.length)) g.act('nightShift', { lineId: l.id, on: true });
  }
  if (!prof.casual && st.items.some((i) => !i.equipped)) g.act('autoEquip', {});
  for (const l of LINES) {
    const s = g.stats(l.id);
    if (!s.owned && s.unlockable) { const q = g.quote('unlock', { lineId: l.id }); if (q.cost <= st.cash * 0.3) g.act('unlock', { lineId: l.id }); }
    if (g.stats(l.id).owned && !g.stats(l.id).managed) { const q = g.quote('hire', { lineId: l.id }); if (q.cost <= st.cash * 0.5) { g.act('hire', { lineId: l.id }); log.buy(t, { kind: 'hire', l, p: {}, q }); } }
  }
  for (let k = 0; k < 400; k++) {
    const base = Math.max(1e-9, decisionValue(g, prof, t));
    const rate = Math.max(1e-9, profileValue(g, prof, t));
    let best = null, bestT = Infinity;
    for (const o of options(g, prof)) {
      if (o.kind === 'mgrLevel' && (o.q.tickets > st.tickets || o.cost > st.cash * 0.25)) continue;
      const d = estimate(g, o, prof, t, base);
      if (!(d > 0)) continue;
      const wait = Math.max(0, (o.cost - st.cash) / rate);
      const score = (wait + o.cost / d) / (NOVELTY[o.kind] || 1);
      if (score < bestT) { bestT = score; best = o; }
    }
    if (!best || st.cash < best.cost) return;
    const before = audit ? profileValue(g, prof, t) : 0;
    const r = g.act(best.act, best.p);
    if (!r.ok) return;
    log.buy(t, best);
    if (audit) {
      const after = profileValue(g, prof, t);
      if (after < before * (1 - 1e-9) - 1e-9) log.negative(t, prof.name, best, before, after);
    }
  }
}

export function auditOptions(g, clock, t) {
  const bad = [];
  for (const prof of [PROFILES.active, PROFILES.idle]) {
    for (const o of options(g)) {
      if (o.kind === 'permit' || o.kind === 'unlock') continue;
      const c = clone(g, clock);
      c.act('cheat', { cash: o.cost * 2 + 1, tickets: 99 });
      const before = profileValue(c, prof, t);
      const r = c.act(o.act, o.p);
      if (!r.ok) continue;
      const after = profileValue(c, prof, t);
      if (after < before * (1 - 1e-9) - 1e-12) bad.push({ profile: prof.name, act: o.act, line: o.l?.id || o.p.districtId || o.p.tier, before, after, pct: (after / before - 1) * 100 });
    }
  }
  return bad;
}

export function play(g, prof, sec, t0, clock, ctx = {}) {
  const st = g.state;
  const dt = 0.2;
  let nextDecide = 0, nextPile = 0, nextCheck = prof.checkIn ? t0 + (prof.early && ctx.shop !== false ? prof.early : prof.checkIn) : Infinity, tapAcc = 0;
  for (let i = 0, n = Math.round(sec / dt); i < n; i++) {
    const t = Math.round((t0 + i * dt) * 10) / 10;
    clock.t = START + t * 1000;
    if (!st.bootstrap.done) {
      tapAcc += prof.canRate * dt;
      if (t < 3) tapAcc = 0;
      while (tapAcc >= 1) { tapAcc--; g.act('tap'); }
      if (st.bootstrap.cans * g.data.econ.canValue >= 50 || (st.bootstrap.cans >= 8 && st.cash + st.bootstrap.cans * 2 >= 50)) g.act('cashCans');
      if (st.cash >= 50) { g.act('unlock', { lineId: 'lemonade' }); ctx.log?.mark('firstStand', t); }
      g.tick(dt);
      continue;
    }
    tapAcc += prof.tapRate(t) * dt;
    while (tapAcc >= 1) { tapAcc--; g.act('tap'); }
    if (prof.events) {
      for (const e of [...st.events.active]) {
        if (g.simTime - e.born < 2) continue;
        const score = e.kind === 'rush' ? 15 : e.kind === 'lucky' ? 3 : 0;
        g.act('claimEvent', { eventId: e.id, score });
      }
      for (const c of [...st.couriers]) if (g.simTime - c.t0 > 3) g.act('tapCourier', { id: c.id });
    }
    if (prof.pileEvery && t >= nextPile) {
      nextPile = t + prof.pileEvery;
      for (const l of LINES) { const s = g.stats(l.id); if (s.owned && s.stockRatio > 0.05) g.act('tapPile', { lineId: l.id }); }
    }
    if (prof.decideEvery && t >= nextDecide && ctx.shop !== false) { nextDecide = t + prof.decideEvery; shop(g, prof, t, ctx.log, ctx.audit); }
    if (t >= nextCheck) {
      nextCheck = t + (prof.early && t < 900 && ctx.shop !== false ? prof.early : prof.checkIn);
      for (const l of LINES) { const s = g.stats(l.id); if (s.owned && s.stock > 0) g.act('tapPile', { lineId: l.id }); }
      if (ctx.shop !== false) shop(g, prof, t, ctx.log, ctx.audit);
    }
    g.tick(dt);
    ctx.onTick?.(t, i);
  }
}

export function makeLog(prof, quiet) {
  const marks = {}, beats = [], negatives = [];
  let lastNovel = 0, maxGap = 0, gapAt = 0;
  const firsts = new Set();
  let endAt = Infinity;
  const novel = (t, what) => {
    if (t > endAt) return;
    if (t - lastNovel > maxGap) { maxGap = t - lastNovel; gapAt = lastNovel; }
    lastNovel = t;
    beats.push([t, what]);
  };
  return {
    marks, beats, negatives,
    get maxGap() { return maxGap; }, get gapAt() { return gapAt; },
    mark(k, t) { if (marks[k] == null) { marks[k] = t; novel(t, k); if (k === 'retireRec') endAt = t; } },
    beat(t, what) { novel(t, what); },
    buy(t, o) {
      const key = o.kind === 'thr' || o.kind === 'boost' ? o.kind + ':' + o.l.id + ':' + (o.q.step ?? '') : o.kind === 'mgrLevel' ? 'mgr:' + o.p.managerId + ':' + o.q.level : o.kind === 'level' ? null : o.kind + ':' + (o.l?.id || o.p.tier || o.p.districtId || '');
      if (key && !firsts.has(key)) { firsts.add(key); novel(t, key); }
    },
    negative(t, p, o, b, a) { negatives.push({ t, profile: p, act: o.act, line: o.l?.id, before: b, after: a }); },
    finish(t) { t = Math.min(t, endAt); if (t - lastNovel > maxGap) { maxGap = t - lastNovel; gapAt = lastNovel; } },
  };
}

function wire(g, log, getT) {
  g.on('unlocked', ({ lineId }) => {
    log.mark(lineId, getT());
    log.beat(getT(), 'unlock ' + lineId);
    const d = LINES.find((l) => l.id === lineId).district;
    if (d !== 'oldtown') log.mark(d, getT());
  });
  g.on('district', ({ districtId }) => log.mark(districtId, getT()));
  g.on('life:beat', (b) => {
    log.beat(getT(), 'life ' + b.kind + (b.stage ? ':' + b.stage : ''));
    if (b.kind === 'partner') log.mark('partner', getT());
    if (b.kind === 'birth') log.mark('firstKid', getT());
    if (b.kind === 'heir') log.mark('heir', getT());
    if (b.kind === 'grow' && b.stage === 'teen') log.mark('teen', getT());
    if (b.kind === 'move') log.mark('home' + b.tier, getT());
  });
  g.on('tier', ({ lineId, tier }) => log.beat(getT(), 'tier ' + lineId + ' ' + tier));
}

export function runLife(prof, { minutes = MINUTES, save = null, seed = 7, audit = true, probes = true, quiet = false, stopAtRec = false } = {}) {
  const clock = { t: START };
  const g = mk(save, seed, clock);
  const log = makeLog(prof, quiet);
  let T = 0;
  wire(g, log, () => T);
  const probeRows = [], auditBad = [];
  const ages = [], ageLv = [], cashRows = [];
  let peak = 0;
  const stall = { sec: 0, run: 0, worst: 0, at: null };
  const ctx = {
    log, audit,
    onTick(t, i) {
      T = t;
      const pv = g.retirePreview();
      if (pv.available) log.mark('retireAvail', t);
      if (pv.recommended) { log.mark('retireRec', t); if (stopAtRec && !ctx.snap) ctx.snap = { save: JSON.parse(g.serialize()), t, lv: LINES.reduce((s, l) => s + g.state.lines[l.id].lv, 0), lifetime: g.state.lifetime }; }
      peak = Math.max(peak, g.state.cash);
      if (i % 5 === 0) {
        const d = g.data.districts.find((x) => !g.state.districts.includes(x.id));
        const q = d && g.quote('permit', { districtId: d.id });
        if (q && q.blocked && /contracts/.test(q.blocked) && g.state.cash >= q.cost) { stall.sec += 1; stall.worst = Math.max(stall.worst, ++stall.run); stall.at ??= t; } else stall.run = 0;
      }
      if (i % 300 === 0) { cashRows.push([t, peak, g.totals().incomePerSec, g.state.life.age]); peak = 0; ages.push([t, g.state.life.age, g.totals().incomePerSec, g.state.family.allTime]); ageLv.push([t, LINES.reduce((s, l) => s + g.state.lines[l.id].lv, 0)]); }
      if (probes && i > 0 && i % 1500 === 0) {
        probeRows.push(probe(g, clock, t));
        auditBad.push(...auditOptions(g, clock, t).map((x) => ({ ...x, t })));
      }
    },
  };
  play(g, prof, minutes * 60, 0, clock, ctx);
  log.finish(minutes * 60);
  return { g, log, probeRows, auditBad, ages, ageLv, cashRows, clock, snap: ctx.snap, stall };
}

export function probe(g, clock, t, window = 300) {
  const out = {};
  for (const prof of [PROFILES.active, PROFILES.idle]) {
    const c2 = { t: clock.t };
    const c = clone(g, c2);
    const stock = () => LINES.reduce((s, l) => s + c.state.lines[l.id].stock, 0) * c.data.econ.pileMult;
    const cash0 = c.state.family.allTime + stock();
    play(c, prof, window, t, c2, { shop: false });
    out[prof.name] = (c.state.family.allTime + stock() - cash0) / window;
  }
  return { t, active: out.active, idle: out.idle, ratio: out.active / Math.max(1e-9, out.idle) };
}

const fmtT = (s) => { if (s == null) return '—'; s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtN = (n) => { if (!isFinite(n)) return '∞'; const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi']; let i = 0; while (Math.abs(n) >= 1000 && i < u.length - 1) { n /= 1000; i++; } return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0)) + u[i]; };

function retireAndRun(g1, prof, minutes) {
  const st = g1.state;
  const pv = g1.retirePreview();
  if (!pv.available) return null;
  const heir = st.life.kids.find((k) => k.stage === 'teen');
  const best = [...st.items].sort((a, b) => b.rarity - a.rarity)[0];
  g1.act('retire', { heirId: heir.id, heirloomItemId: best?.id });
  return { pv, heir: heir.name, talent: heir.talent, r: runLife(prof, { minutes, save: JSON.parse(g1.serialize()), probes: false, audit: false }) };
}

function seasonSim() {
  const def = SEASONS[0];
  const rows = [];
  const clock = { t: Date.parse('2026-10-03T19:00:00') };
  const g = createGame({ seed: 5, nowWall: () => clock.t });
  for (let day = 1; day <= 12; day++) {
    clock.t = Date.parse(`2026-10-${String(2 + day).padStart(2, '0')}T${day % 2 ? '19' : '12'}:00:00`);
    g.advanceOffline(20 * 3600);
    g.act('seasonEnter', { seasonId: def.id });
    for (let t = 0; t < 25 * 60; t += 1) {
      clock.t += 1000;
      g.tick(1);
      if (t % 5) continue;
      for (const l of def.lines) {
        const q = g.quote('seasonUnlock', { lineId: l.id });
        if (q.affordable) g.act('seasonUnlock', { lineId: l.id });
        const b = g.quote('seasonBoost', { lineId: l.id });
        if (b.affordable) g.act('seasonBoost', { lineId: l.id });
      }
      for (let k = 0; k < 20; k++) {
        const opts = def.lines.map((l) => ({ l, q: g.quote('seasonLevel', { lineId: l.id, qty: 1 }) })).filter((o) => o.q.affordable).sort((a, b) => a.q.cost / a.l.rate - b.q.cost / b.l.rate);
        if (!opts.length) break;
        g.act('seasonLevel', { lineId: opts[0].l.id, qty: 1 });
      }
    }
    g.act('seasonLeave');
    const si = g.seasonInfo();
    rows.push({ day, rank: si.rank, xp: si.xp, rate: si.rate });
  }
  return rows;
}

function main() {
  if (args.season) {
    const rows = seasonSim();
    console.log('Hollow\'s Eve: 25 min/day inside (odd days at 19:00 Witching Hour), offline between at 50%/4 h');
    console.log('day | rank | candy earned (xp)');
    for (const r of rows) console.log(`${String(r.day).padStart(3)} | ${String(r.rank).padStart(4)} | ${fmtN(r.xp)}`);
    return;
  }
  const res = {};
  for (const p of ['active', 'idle', 'typical']) res[p] = runLife(PROFILES[p], { probes: p === 'active', audit: true, stopAtRec: p === 'active' });
  const slow = runLife(PROFILES.slow, { minutes: SLOW_LIMIT_MIN, probes: false, audit: false });
  const A = res.active, I = res.idle, Ty = res.typical;
  const fails = [];
  console.log(`Idle Life 2 sim — life 1, ${MINUTES} min${PLANT ? '  [PLANTED R1 BUG: pile ×1.25, σ price ×1.0]' : ''}`);
  console.log('\nmilestone           | target      | active  | idle    | ok');
  for (const [k, name, lo, hi] of TARGETS) {
    const a = A.log.marks[k], i = I.log.marks[k];
    const ok = a != null && a >= lo * (1 - TOL) && a <= hi * (1 + TOL);
    if (!ok) fails.push(`${name} active ${fmtT(a)} outside ${fmtT(lo)}–${fmtT(hi)} ±30%`);
    console.log(`${name.padEnd(19)} | ${fmtT(lo).padStart(5)}–${fmtT(hi).padEnd(5)} | ${fmtT(a).padStart(7)} | ${fmtT(i).padStart(7)} | ${ok ? 'yes' : 'NO'}`);
  }
  for (const k of ['partner', 'firstKid', 'teen']) console.log(`${('(' + k + ')').padEnd(19)} |             | ${fmtT(A.log.marks[k]).padStart(7)} | ${fmtT(I.log.marks[k]).padStart(7)} |`);
  console.log('\nlife beats          | target      | active  | typical | idle    | slow    | ok');
  for (const [k, name, lo, hi, who] of LIFE_TARGETS) {
    const v = { active: A.log.marks[k], typical: Ty.log.marks[k], idle: I.log.marks[k], slow: slow.log.marks[k] };
    const bad = who.filter((p) => v[p] == null || v[p] < lo * (1 - TOL) || v[p] > hi * (1 + TOL));
    for (const p of bad) fails.push(`${name} ${p} ${fmtT(v[p])} outside ${fmtT(lo)}–${fmtT(hi)} ±30%`);
    console.log(`${name.padEnd(19)} | ${fmtT(lo).padStart(5)}–${fmtT(hi).padEnd(5)} | ${fmtT(v.active).padStart(7)} | ${fmtT(v.typical).padStart(7)} | ${fmtT(v.idle).padStart(7)} | ${fmtT(v.slow).padStart(7)} | ${bad.length ? 'NO' : 'yes'}`);
  }
  const homes = (R) => [1, 2, 3, 4, 5].map((n) => fmtT(R.log.marks['home' + n])).join(' ');
  console.log(`homes (Bedsit→Mansion): active ${homes(A)} · typical ${homes(Ty)} · slow ${homes(slow)}`);
  console.log(`typical: Suburbs ${fmtT(Ty.log.marks.suburbs)} Harbour ${fmtT(Ty.log.marks.harbour)} Downtown ${fmtT(Ty.log.marks.downtown)} teen ${fmtT(Ty.log.marks.teen)} recommended ${fmtT(Ty.log.marks.retireRec)}`);
  console.log(`slow (idle check-ins every 5 min, housing only when ≤15% of cash, ${SLOW_LIMIT_MIN} min): Harbour ${fmtT(slow.log.marks.harbour)} first kid ${fmtT(slow.log.marks.firstKid)} heir ${fmtT(slow.log.marks.heir)} retire available ${fmtT(slow.log.marks.retireAvail)} (age ${slow.g.state.life.age})`);
  if (slow.log.marks.retireAvail == null) fails.push(`slow player cannot retire within ${SLOW_LIMIT_MIN} min`);
  for (const [p, R] of [...Object.entries(res), ['slow', slow]]) {
    console.log(`${p}: permit affordable but blocked by contracts for ${R.stall.sec} s in total (longest ${R.stall.worst} s${R.stall.at != null ? ', first at ' + fmtT(R.stall.at) : ''})`);
    if (R.stall.worst > 120) fails.push(`${p} stalls ${R.stall.worst} s at a contract gate with the permit affordable`);
  }
  const ln = LINES.map((l) => `${l.emoji}${fmtT(A.log.marks[l.id])}`).join(' ');
  console.log('\nactive line unlocks: ' + ln);
  console.log('\nsame-state income probes (5 min windows, no buying): active $/s vs idle $/s');
  let maxRatio = 0;
  for (const r of A.probeRows) { maxRatio = Math.max(maxRatio, r.ratio); console.log(`  t=${fmtT(r.t).padStart(6)}  active ${fmtN(r.active).padStart(7)}  idle ${fmtN(r.idle).padStart(7)}  ratio ${r.ratio.toFixed(2)}`); }
  if (maxRatio > 2.5) fails.push(`active/idle ratio ${maxRatio.toFixed(2)} > 2.5`);
  console.log(`  max ratio ${maxRatio.toFixed(2)} (limit 2.5)`);
  for (const [p, R] of Object.entries(res)) {
    if (p === 'typical') continue;
    console.log(`\n${p}: max gap without a new purchase type or beat (until retire recommended): ${fmtT(R.log.maxGap)} starting ${fmtT(R.log.gapAt)}`);
    if (p === 'active' && R.log.maxGap > 4 * 60 * (1 + TOL / 2)) fails.push(`dead gap ${fmtT(R.log.maxGap)} at ${fmtT(R.log.gapAt)} (active)`);
  }
  console.log('\nage / income every 5 min (active): ' + A.ages.filter((_, i) => i % 2 === 1).map(([t, a, inc]) => `${fmtT(t)} age ${Math.floor(a)} ${fmtN(inc)}/s`).join(' · '));
  const neg = [...A.log.negatives, ...I.log.negatives, ...A.auditBad];
  console.log(`\nnegative-return upgrades: ${neg.length}`);
  const seen = new Set();
  for (const n of neg) {
    const k = n.profile + n.act + n.line;
    if (seen.has(k)) continue;
    seen.add(k);
    console.log(`  NEGATIVE ${n.profile} ${n.act} ${n.line} at ${fmtT(n.t)}: ${fmtN(n.before)}/s → ${fmtN(n.after)}/s (${(n.pct ?? (n.after / n.before - 1) * 100).toFixed(1)}%)`);
  }
  if (neg.length) fails.push(`${neg.length} negative-return upgrade checks`);
  if (args.gen2 !== 'off') {
    const snap = A.snap;
    if (!snap) fails.push('retire never recommended in life 1');
    else {
      const g1 = mk(snap.save, 7, { t: START + snap.t * 1000 });
      const pv = g1.retirePreview();
      console.log(`\nretire at recommended (${fmtT(snap.t)}): +${pv.legacy} legacy, income ×${pv.nextMult.toFixed(2)}${pv.floorApplies ? ' (first-retire floor)' : ''}, age ${g1.state.life.age}, kids ${g1.state.life.kids.map((k) => k.name + ':' + k.stage + ':' + k.talent).join(' ')}`);
      const r2 = retireAndRun(g1, PROFILES.active, MINUTES);
      const m = r2.r.log.marks;
      console.log(`gen 2 (heir ${r2.heir}, ${r2.talent}): Suburbs ${fmtT(m.suburbs)} Harbour ${fmtT(m.harbour)} Downtown ${fmtT(m.downtown)} retire avail ${fmtT(m.retireAvail)} rec ${fmtT(m.retireRec)}`);
      const lvAt = (R, sec) => R.ageLv.find(([t]) => t >= sec)?.[1] ?? R.ageLv[R.ageLv.length - 1][1];
      const lv1 = lvAt(A, snap.t), lv2 = lvAt(r2.r, snap.t), ratio = lv2 / lv1;
      console.log(`same session length (${fmtT(snap.t)}): gen 2 total line levels ${lv2} vs gen 1 ${lv1} (×${ratio.toFixed(2)} further)`);
      if (m.downtown == null || m.downtown > 15 * 60 * (1 + TOL) || m.downtown < 15 * 60 * (1 - TOL)) fails.push(`gen 2 Downtown ${fmtT(m.downtown)} (target ~15 min)`);
      if (ratio < 1.5 * (1 - TOL) || ratio > 1.5 * (1 + TOL)) fails.push(`gen 2 goes ×${ratio.toFixed(2)} further (target ~1.5)`);
    }
  }
  console.log(fails.length ? '\nFAIL\n  ' + fails.join('\n  ') : '\nPASS: all DESIGN §3 targets hold');
  process.exitCode = fails.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
