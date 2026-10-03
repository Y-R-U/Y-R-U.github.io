// Pacing bot for Idle Western 2. Drives the real js/state/game.js with active / typical / idle profiles.
// node tools/sim.mjs [--minutes=75] [--falsify-build] [--gen2=off] [--json]
//   --falsify-build  construction T ×10 — the dead-gap check MUST fail (docs/ECONOMY.md §9).
import { createGame } from '../js/state/game.js';
import { LINES } from '../js/data/lines.js';
import { MANAGER_LEVELS } from '../js/data/managers.js';

const START = Date.parse('2026-09-05T09:00:00');
const TOL = 0.3;
export const DEAD_GAP = 240;

// [mark, label, lo s, hi s] for life 1, active profile (±30% tolerance, as in IL2).
export const TARGETS = [
  ['shine', 'Spit & Shine open', 25, 45],
  ['tubs', 'Tuppenny Tubs open', 60, 105],
  ['livery', 'Livery open', 120, 210],
  ['saloonrow', 'Saloon Row Deed', 270, 420],
  ['garter', 'Velvet Garter open', 540, 780],
  ['bankblock', 'Bank Block Deed', 1200, 1620],
  ['bank', 'Bank open', 1680, 2400],
  ['deathAvail', 'Fake Your Death available', 1200, 1650],
  ['deathRec', 'Fake Your Death recommended', 3300, 4200],
];

export const PROFILES = {
  active: { name: 'active', tapRate: (t) => (t < 600 ? 2.5 : 1.5), mudRate: 1.2, decideEvery: 2, pileEvery: 20, checkIn: 0, events: true, fling: true, hurry: true },
  typical: { name: 'typical', tapRate: (t) => (t < 600 ? 1 : 0.5), mudRate: 1, decideEvery: 5, pileEvery: 60, checkIn: 0, events: false, casual: true },
  idle: { name: 'idle', tapRate: () => 0, mudRate: 1.2, decideEvery: 0, pileEvery: 0, checkIn: 180, early: 60, events: false },
};

export function mk(save, seed, clock, data) {
  return createGame({ data, save, seed, nowWall: () => clock.t, allowCheat: true });
}

function clone(g, clock) {
  return mk(JSON.parse(g.serialize()), g.state.seed, clock, g.__data);
}

function lineValue(s, prof, X) {
  if (!s.owned) return 0;
  const P = s.grossPerSec;
  if (s.autoPile) return P;
  if (prof.name === 'active') return P * (s.sigma + (1 - s.sigma) * X.pileMult);
  const capSec = P > 0 ? s.shelfCap / P : 0;
  const f = Math.min(1, capSec / (prof.checkIn || prof.pileEvery || 180));
  return P * (s.sigma + (1 - s.sigma) * X.pileMult * f);
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
  for (const l of LINES) {
    const s = g.stats(l.id);
    if (!s.owned) {
      if (s.unlockable) out.push({ act: 'buy', p: { lineId: l.id }, kind: 'unlock', l });
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
  for (const d of g.data.districts) if (!st.districts.includes(d.id)) { out.push({ act: 'permit', p: { districtId: d.id }, kind: 'permit', d }); break; }
  return out.filter((o) => {
    if (prof.casual && (o.kind === 'mgrLevel' || o.kind === 'storage')) return false;
    const q = g.quote(o.act, o.p);
    o.q = q;
    o.cost = q.cost;
    return isFinite(q.cost) && !q.blocked;
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
        return dLine(s0, { owned: true, grossPerSec: P, sigma: managed ? X.sigma0 : X.sigmaWalkIn, managed, shelfCap: P * X.shelfSec }) + base * 0.06;
      }
      case 'level': {
        const l2 = s.level + o.n;
        const P = s.grossPerSec * (l2 / s.level) * Math.pow(X.milestoneMult, ms(l2) - ms(s.level));
        return dLine(s, withP(s, P));
      }
      case 'thr': return dLine(s, withP(s, s.grossPerSec * X.sigmaPrice, { sigma: s.managed ? Math.min(1, s.sigma + X.sigmaStep) : s.sigma }));
      case 'boost': return dLine(s, withP(s, s.grossPerSec * s.nextBoost.mult));
      case 'storage': return dLine(s, { ...s, shelfCap: s.shelfCap * X.shelfStep });
      case 'hire': return dLine(s, { ...s, managed: true, sigma: Math.min(1, X.sigma0 + X.sigmaStep * s.sigmaUpgrades) }) + 0.05 * base;
      case 'mgrLevel': {
        const lvl = g.state.managers[s.managerId].level;
        return dLine(s, withP(s, s.grossPerSec * MANAGER_LEVELS.mult[lvl] / MANAGER_LEVELS.mult[lvl - 1]));
      }
    }
  }
  if (o.kind === 'permit') {
    const first = LINES.find((l) => l.district === o.d.id);
    o.cost += first.baseCost;
    return Math.max(first.rate * tot.globalMult, base * 0.15);
  }
  return 0;
}

const NOVELTY = { unlock: 2, permit: 3, hire: 1.5, thr: 1.3, boost: 1.3 };

function shop(g, prof, t, log, audit) {
  const st = g.state;
  if (!prof.casual) {
    for (const c of g.goals().contracts) if (c.visible && c.done && !c.claimed) { g.act('claimContract', { id: c.id }); log.beat(t, 'contract ' + c.id); }
    for (const k of ['gold', 'silver', 'basic']) while (st.boxes[k] > 0) g.act('openBox', { kind: k });
    if (st.items.some((i) => !i.equipped)) g.act('autoEquip', {});
  }
  for (const l of LINES) {
    const s = g.stats(l.id);
    if (!s.owned && s.unlockable) { const q = g.quote('buy', { lineId: l.id }); if (q.cost <= st.cash * 0.3) g.act('buy', { lineId: l.id }); }
    if (g.stats(l.id).owned && !g.stats(l.id).managed) { const q = g.quote('hire', { lineId: l.id }); if (q.cost <= st.cash * 0.5) { g.act('hire', { lineId: l.id }); log.buy(t, { kind: 'hire', l, p: {}, q }); } }
  }
  for (let k = 0; k < 400; k++) {
    const base = Math.max(1e-9, decisionValue(g, prof, t));
    const rate = Math.max(1e-9, profileValue(g, prof, t));
    let best = null, bestT = Infinity;
    for (const o of options(g, prof)) {
      if (o.kind === 'mgrLevel' && (o.q.teeth > st.teeth || o.cost > st.cash * 0.25)) continue;
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
    if (audit && best.kind !== 'unlock' && best.kind !== 'permit') {
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
      c.act('cheat', { cash: o.cost * 2 + 1, teeth: 99 });
      const before = profileValue(c, prof, t);
      if (!c.act(o.act, o.p).ok) continue;
      const after = profileValue(c, prof, t);
      if (after < before * (1 - 1e-9) - 1e-12) bad.push({ profile: prof.name, act: o.act, line: o.l?.id || o.p.districtId, before, after, pct: (after / before - 1) * 100 });
    }
  }
  return bad;
}

// Gag links only ever add: every link, forced on vs off, on a clone of the real game.
export function auditLinks(g, clock, t) {
  const bad = [];
  for (const k of g.data.links) {
    for (const prof of [PROFILES.active, PROFILES.idle]) {
      const off = clone(g, clock), on = clone(g, clock);
      delete off.state.links[k.id];
      on.state.links[k.id] = true;
      off.act('hint', { id: 'x' }); on.act('hint', { id: 'x' });
      const a = profileValue(off, prof, t), b = profileValue(on, prof, t);
      if (b < a * (1 - 1e-9) - 1e-12) bad.push({ profile: prof.name, act: 'link', line: k.id, before: a, after: b, pct: (b / a - 1) * 100 });
    }
  }
  return bad;
}

function playSpecials(g, prof) {
  const st = g.state;
  for (const e of [...st.events.active]) {
    if (g.simTime - e.born < 2) continue;
    if (!e.special) { g.act('claimEvent', { eventId: e.id }); continue; }
    if (e.kind === 'stagecoach') { g.act('claimEvent', { eventId: e.id }); continue; }
    if (e.phase === 'wind') { g.act('special:begin', { id: e.id }); continue; }
    if (e.kind === 'duel') g.act('duel:result', { id: e.id, ms: 450 });
    else if (e.kind === 'brawl' && e.hits < 6) g.act('brawl:hit', { id: e.id });
    else if (e.kind === 'robbery' && e.hits < 15) { g.act('robbery:hit', { id: e.id }); g.act('robbery:hit', { id: e.id }); }
  }
  for (const c of [...st.couriers]) if (g.simTime - c.t0 > 3) g.act('tapCourier', { id: c.id });
}

const DIRS = ['left', 'right', 'down', 'up'];

export function play(g, prof, sec, t0, clock, ctx = {}) {
  const st = g.state;
  const dt = 0.2;
  let nextDecide = 0, nextPile = 0, nextCheck = prof.checkIn ? t0 + (prof.early && ctx.shop !== false ? prof.early : prof.checkIn) : Infinity, tapAcc = 0, flingN = 0;
  for (let i = 0, n = Math.round(sec / dt); i < n; i++) {
    const t = Math.round((t0 + i * dt) * 10) / 10;
    clock.t = START + t * 1000;
    if (!st.bootstrap.done && !Object.keys(st.build).length) {
      tapAcc += prof.mudRate * dt;
      if (t < 3) tapAcc = 0;
      while (tapAcc >= 1) { tapAcc--; g.act('tap'); }
      if (st.bootstrap.hat + st.cash >= LINES[0].baseCost) { g.act('hat'); g.act('buy', { lineId: LINES[0].id }); }
      g.tick(dt);
      ctx.onTick?.(t, i);
      continue;
    }
    tapAcc += (st.bootstrap.done ? prof.tapRate(t) : prof.hurry ? prof.mudRate : 0) * dt;
    while (tapAcc >= 1) {
      tapAcc--;
      const b = prof.hurry && Object.keys(st.build)[0];
      if (b) g.act('build:hurry', { lineId: b });
      else if (st.bootstrap.done) g.act('tap');
    }
    if (prof.events) playSpecials(g, prof);
    if (prof.fling && st.saloon.held && g.simTime - st.saloon.held.born > 0.6) g.act('fling', { dir: DIRS[flingN++ % 4] });
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

export function makeLog() {
  const marks = {}, beats = [], negatives = [], builds = [];
  let lastNovel = 0, maxGap = 0, gapAt = 0, endAt = Infinity;
  const firsts = new Set();
  const novel = (t, what) => {
    if (t > endAt) return;
    if (t - lastNovel > maxGap) { maxGap = t - lastNovel; gapAt = lastNovel; }
    lastNovel = t;
    beats.push([t, what]);
  };
  return {
    marks, beats, negatives, builds,
    get maxGap() { return maxGap; }, get gapAt() { return gapAt; },
    mark(k, t) { if (marks[k] == null) { marks[k] = t; novel(t, k); if (k === 'deathRec') endAt = t; } },
    beat(t, what) { novel(t, what); },
    buy(t, o) {
      if (o.kind === 'unlock' || o.kind === 'permit' || o.kind === 'level') return;
      const key = o.kind === 'thr' || o.kind === 'boost' ? o.kind + ':' + o.l.id + ':' + (o.q.step ?? '') : o.kind === 'mgrLevel' ? 'mgr:' + o.p.managerId + ':' + o.q.level : o.kind + ':' + (o.l?.id || '');
      if (!firsts.has(key)) { firsts.add(key); novel(t, key); }
    },
    negative(t, p, o, b, a) { negatives.push({ t, profile: p, act: o.act, line: o.l?.id, before: b, after: a }); },
    finish(t) { t = Math.min(t, endAt); if (t - lastNovel > maxGap) { maxGap = t - lastNovel; gapAt = lastNovel; } },
  };
}

// Novelty beats: a business OPENING (sign up, not purchase — so construction time counts), a Deed, a hat promotion,
// a first purchase of each upgrade type/step, a contract. Construction stages are deliberately NOT beats.
function wire(g, log, getT) {
  const started = {};
  g.on('build:start', ({ lineId }) => { started[lineId] = getT(); });
  g.on('build:done', ({ lineId, acq }) => {
    log.builds.push({ lineId, acq, wait: getT() - (started[lineId] ?? getT()) });
    log.mark(lineId, getT());
  });
  g.on('district', ({ districtId }) => log.mark(districtId, getT()));
  g.on('hat:promo', ({ tier }) => log.beat(getT(), 'hat ' + tier));
  g.on('tier', ({ lineId, tier }) => log.beat(getT(), 'tier ' + lineId + ' ' + tier));
  g.on('special:end', ({ kind, expired }) => { if (!expired) log.beat(getT(), 'special ' + kind); });
  g.on('link', ({ id }) => log.beat(getT(), 'link ' + id));
  g.on('contract', ({ id }) => log.beat(getT(), 'contract ' + id));
}

export function runLife(prof, { minutes = 75, save = null, seed = 7, audit = true, probes = true, stopAtRec = false, data } = {}) {
  const clock = { t: START };
  const g = mk(save, seed, clock, data);
  g.__data = data;
  const log = makeLog();
  let T = 0;
  wire(g, log, () => T);
  const probeRows = [], auditBad = [], incomeRows = [];
  const stall = { sec: 0, run: 0, worst: 0, at: null };
  const ctx = {
    log, audit,
    onTick(t, i) {
      T = t;
      const pv = g.deathPreview();
      if (pv.available) log.mark('deathAvail', t);
      if (pv.recommended) { log.mark('deathRec', t); if (stopAtRec && !ctx.snap) ctx.snap = { save: JSON.parse(g.serialize()), t }; }
      if (i % 5 === 0) {
        const d = g.data.districts.find((x) => !g.state.districts.includes(x.id));
        const q = d && g.quote('permit', { districtId: d.id });
        if (q && q.blocked && /demands/.test(q.blocked) && g.state.cash >= q.cost) { stall.sec += 1; stall.worst = Math.max(stall.worst, ++stall.run); stall.at ??= t; } else stall.run = 0;
      }
      if (i % 300 === 0) incomeRows.push([t, g.totals().incomePerSec, LINES.reduce((s, l) => s + g.state.lines[l.id].lv, 0)]);
      if (probes && i > 0 && i % 1500 === 0) {
        probeRows.push(probe(g, clock, t));
        auditBad.push(...auditOptions(g, clock, t).map((x) => ({ ...x, t })), ...auditLinks(g, clock, t).map((x) => ({ ...x, t })));
      }
    },
  };
  play(g, prof, minutes * 60, 0, clock, ctx);
  log.finish(minutes * 60);
  return { g, log, probeRows, auditBad, incomeRows, clock, snap: ctx.snap, stall };
}

export function probe(g, clock, t, window = 300) {
  const out = {};
  for (const prof of [PROFILES.active, PROFILES.idle]) {
    const c2 = { t: clock.t };
    const c = clone(g, c2);
    const stock = () => LINES.reduce((s, l) => s + c.state.lines[l.id].stock, 0) * c.data.econ.pileMult;
    const cash0 = c.state.allTime + stock();
    play(c, prof, window, t, c2, { shop: false });
    out[prof.name] = (c.state.allTime + stock() - cash0) / window;
  }
  return { t, active: out.active, idle: out.idle, ratio: out.active / Math.max(1e-9, out.idle) };
}

export const fmtT = (s) => { if (s == null) return '—'; s = Math.round(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const fmtN = (n) => { if (!isFinite(n)) return '∞'; const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi']; let i = 0; while (Math.abs(n) >= 1000 && i < u.length - 1) { n /= 1000; i++; } return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : n.toFixed(0)) + u[i]; };

export function buildData(mult) {
  return { lines: LINES.map((l) => ({ ...l, buildT: l.buildT * mult })) };
}

// The whole verdict, as data, so test-economy can run it (and the falsification arm) without parsing stdout.
export function verdict({ minutes = 75, buildMult = 1, gen2 = true, profiles = ['active', 'typical', 'idle'], quiet = true } = {}) {
  const data = buildMult !== 1 ? buildData(buildMult) : undefined;
  const res = {};
  for (const p of profiles) res[p] = runLife(PROFILES[p], { minutes, data, probes: p === 'active' && !quiet ? true : p === 'active', audit: true, stopAtRec: p === 'active' });
  const A = res.active;
  const fails = [];
  const rows = TARGETS.map(([k, name, lo, hi]) => {
    const v = {};
    for (const p of profiles) v[p] = res[p].log.marks[k];
    const a = v.active;
    const ok = a != null && a >= lo * (1 - TOL) && a <= hi * (1 + TOL);
    if (!ok) fails.push(`${name} active ${fmtT(a)} outside ${fmtT(lo)}–${fmtT(hi)} ±30%`);
    return { k, name, lo, hi, v, ok };
  });
  const gaps = {};
  for (const p of profiles) {
    const R = res[p];
    const worstBuild = R.log.builds.reduce((m, b) => (b.wait > m.wait ? b : m), { wait: 0 });
    gaps[p] = { novelty: R.log.maxGap, at: R.log.gapAt, build: worstBuild };
    const dead = Math.max(R.log.maxGap, worstBuild.wait);
    if (p === 'active' && R.log.maxGap > DEAD_GAP) fails.push(`dead gap ${fmtT(R.log.maxGap)} at ${fmtT(R.log.gapAt)} (active, no new purchase type / opening / special)`);
    if (worstBuild.wait > DEAD_GAP) fails.push(`dead gap: ${p} waits ${fmtT(worstBuild.wait)} on the ${worstBuild.lineId} build`);
    if (R.stall.worst > 120) fails.push(`${p} stalls ${R.stall.worst} s at a Deed with the cash in hand`);
  }
  let maxRatio = 0;
  for (const r of A.probeRows) maxRatio = Math.max(maxRatio, r.ratio);
  if (maxRatio > 2.5) fails.push(`active/idle ratio ${maxRatio.toFixed(2)} > 2.5`);
  const neg = [...A.log.negatives, ...(res.idle?.log.negatives || []), ...A.auditBad];
  if (neg.length) fails.push(`${neg.length} negative-return checks`);
  let g2 = null;
  if (gen2) {
    if (!A.snap) fails.push('Fake Your Death never recommended in life 1');
    else {
      const g1 = mk(A.snap.save, 7, { t: START + A.snap.t * 1000 }, data);
      const pv = g1.deathPreview();
      g1.act('prestige');
      const r2 = runLife(PROFILES.active, { minutes: Math.min(minutes, 40), save: JSON.parse(g1.serialize()), probes: false, audit: false, data });
      const m = r2.log.marks;
      const lvAt = (R, sec) => (R.incomeRows.find(([t]) => t >= sec) || R.incomeRows[R.incomeRows.length - 1])[2];
      const at = Math.min(A.snap.t, 40 * 60);
      const lv1 = lvAt(A, at), lv2 = lvAt(r2, at);
      g2 = { pv, bank: m.bank, garter: m.garter, lv1, lv2, ratio: lv2 / lv1, at, grave: g1.state.graves[0], disguise: g1.state.disguise };
      if (m.bank == null || m.bank > 15 * 60 * (1 + TOL)) fails.push(`gen 2 Bank open ${fmtT(m.bank)} (target ≤ 15 min)`);
      if (g2.ratio < 1.3) fails.push(`gen 2 only ×${g2.ratio.toFixed(2)} further than gen 1 at the same session time`);
    }
  }
  return { res, rows, gaps, maxRatio, neg, g2, fails };
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
  const minutes = +(args.minutes || 75);
  const buildMult = args['falsify-build'] ? 10 : 1;
  const V = verdict({ minutes, buildMult, gen2: args.gen2 !== 'off' && buildMult === 1, quiet: false });
  if (args.json) { console.log(JSON.stringify({ rows: V.rows, gaps: V.gaps, maxRatio: V.maxRatio, g2: V.g2 && { ...V.g2, pv: undefined }, fails: V.fails }, null, 2)); process.exitCode = V.fails.length ? 1 : 0; return; }
  const { res } = V;
  console.log(`Idle Western 2 sim — life 1, ${minutes} min${buildMult !== 1 ? `  [FALSIFICATION: construction T ×${buildMult}]` : ''}`);
  console.log('\nmilestone                  | target       | active  | typical | idle    | ok');
  for (const r of V.rows) console.log(`${r.name.padEnd(26)} | ${fmtT(r.lo).padStart(5)}–${fmtT(r.hi).padEnd(6)} | ${fmtT(r.v.active).padStart(7)} | ${fmtT(r.v.typical).padStart(7)} | ${fmtT(r.v.idle).padStart(7)} | ${r.ok ? 'yes' : 'NO'}`);
  console.log('\nactive opens: ' + LINES.map((l) => `${l.emoji}${fmtT(res.active.log.marks[l.id])}`).join(' '));
  console.log('typical opens: ' + LINES.map((l) => `${l.emoji}${fmtT(res.typical.log.marks[l.id])}`).join(' '));
  for (const [p, gp] of Object.entries(V.gaps)) console.log(`${p}: longest novelty gap ${fmtT(gp.novelty)} from ${fmtT(gp.at)} · longest build wait ${gp.build.lineId || '—'} ${fmtT(gp.build.wait)} (limit ${fmtT(DEAD_GAP)}: novelty for active, build wait for all)`);
  for (const [p, R] of Object.entries(res)) console.log(`${p}: Deed affordable but blocked by demands for ${R.stall.sec} s (longest ${R.stall.worst} s)`);
  console.log('\nsame-state income probes (5 min, no buying): active vs idle $/s');
  for (const r of res.active.probeRows) console.log(`  t=${fmtT(r.t).padStart(6)}  active ${fmtN(r.active).padStart(7)}  idle ${fmtN(r.idle).padStart(7)}  ratio ${r.ratio.toFixed(2)}`);
  console.log(`  max ratio ${V.maxRatio.toFixed(2)} (limit 2.5)`);
  console.log(`\nnegative-return checks (upgrades + gag links): ${V.neg.length}`);
  for (const n of V.neg.slice(0, 8)) console.log(`  NEGATIVE ${n.profile} ${n.act} ${n.line} at ${fmtT(n.t)}: ${fmtN(n.before)}/s → ${fmtN(n.after)}/s`);
  const A = res.active.g;
  console.log(`\nactive end: hat ${A.data.hats[A.state.hat].name}, Pomfrey ${A.data.pomfreyHats[A.state.pomfrey].name}, 🦷 earned ${A.state.stats.teethEarned}, ejects ${A.state.stats.ejects} (flung ${A.state.stats.flings}), duels ${A.state.stats.duels}, brawls ${A.state.stats.brawls}, robberies ${A.state.stats.robberies}, achievements ${Object.keys(A.state.achievements).length}`);
  if (V.g2) {
    const { pv } = V.g2;
    console.log(`\nfake death at recommended: +${pv.bounty} Bounty, income ×${pv.nextMult.toFixed(2)}${pv.floorApplies ? ' (first-death floor)' : ''}`);
    console.log(`  grave: "${V.g2.grave.epitaph}" · new disguise ${V.g2.disguise.name}, ${V.g2.disguise.moustache}`);
    console.log(`gen 2: Garter ${fmtT(V.g2.garter)} Bank ${fmtT(V.g2.bank)}; at ${fmtT(V.g2.at)} total levels ${V.g2.lv2} vs gen 1 ${V.g2.lv1} (×${V.g2.ratio.toFixed(2)})`);
  }
  console.log(V.fails.length ? '\nFAIL\n  ' + V.fails.join('\n  ') : '\nPASS: pacing, dead gap, active/idle, negative returns, gen 2');
  process.exitCode = V.fails.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
