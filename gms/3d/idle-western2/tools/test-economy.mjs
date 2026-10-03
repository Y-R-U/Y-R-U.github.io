// node --test tools/test-economy.mjs — pure economy suite. Business-agnostic: it reads the first/second business from
// data/lines.js, so adding or renaming businesses never breaks it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createGame } from '../js/state/game.js';
import { parse, createSaveStore, KEYS, SAVE_VERSION, BAK_EVERY_MS } from '../js/state/save.js';
import { bulkCost, levelCost, maxAffordable } from '../js/state/economy.js';
import { LINES, ECON, BUSINESSES } from '../js/data/lines.js';
import { DISTRICTS } from '../js/data/districts.js';
import { MANAGERS } from '../js/data/managers.js';
import { EVENTS } from '../js/data/events.js';
import { PLOTS, HUB } from '../js/data/plots.js';
import { runSim, PROFILES } from './sim.mjs';

const fx = (f) => readFileSync(new URL('../tests/fixtures/' + f, import.meta.url), 'utf8');
const T0 = Date.parse('2026-10-05T10:00:00');
const A = LINES[0].id, B = LINES[1].id;
const BOOT_TAPS = Math.ceil(LINES[0].baseCost / ECON.bootTap);

function mk(o = {}) {
  const clock = { t: o.t ?? T0 };
  const g = createGame({ seed: o.seed ?? 1, nowWall: () => clock.t, allowCheat: true, ...o, ...(o.save ? { save: o.save } : {}) });
  g.clock = clock;
  g.run = (sec, dt = 0.5) => { for (let s = 0; s < sec; s += dt) { clock.t += dt * 1000; g.tick(dt); } };
  return g;
}

function started(o) {
  const g = mk(o);
  for (let i = 0; i < BOOT_TAPS; i++) g.act('tap');
  assert.equal(g.act('unlock', { lineId: A }).ok, true);
  return g;
}

function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

const activeRate = (g, id) => { const s = g.stats(id); return s.grossPerSec * (s.sigma + (1 - s.sigma) * ECON.pileMult); };
const idleRate = (g, id) => { const s = g.stats(id); return s.grossPerSec * s.sigma; };

test('data contract: every business row is complete and has a plot slot, a district and a manager', () => {
  assert.ok(LINES.length >= 1);
  const ids = new Set();
  for (const b of BUSINESSES) {
    assert.ok(!ids.has(b.id), 'unique id ' + b.id);
    ids.add(b.id);
    for (const k of ['id', 'name', 'emoji', 'district', 'cycleSec', 'throughput', 'boosts']) assert.ok(b[k] != null, `${b.id}.${k}`);
    assert.ok(DISTRICTS.some((d) => d.id === b.district), `${b.id} district`);
    assert.ok(PLOTS.some((p) => p.id === b.id), `${b.id} plot slot`);
    assert.ok(MANAGERS.some((m) => m.lineId === b.id), `${b.id} manager`);
  }
  assert.ok(PLOTS.some((p) => p.id === HUB));
  assert.equal(DISTRICTS[0].permitCost, 0, 'the first district is open from the start');
});

test('bootstrap: hero taps pay cash until the first business, no idle income before it', () => {
  const g = mk();
  assert.equal(g.act('unlock', { lineId: A }).code, 'funds');
  g.run(120);
  assert.equal(g.state.cash, 0);
  assert.equal(g.totals().incomePerSec, 0);
  for (let i = 0; i < BOOT_TAPS - 1; i++) assert.equal(g.act('tap').delta.cash, ECON.bootTap);
  assert.equal(g.act('unlock', { lineId: A }).code, 'funds');
  g.act('tap');
  assert.equal(g.act('unlock', { lineId: A }).ok, true);
  assert.equal(g.state.bootstrap.done, true);
  const r = g.act('tap');
  assert.ok(r.ok && r.delta.cash > 0 && r.delta.cash < ECON.bootTap, 'hustle tap scales with income now');
});

test('cost formulas: x10 equals ten singles, MAX is the largest affordable', () => {
  for (const l of LINES) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += levelCost(l, 7 + i);
    assert.ok(Math.abs(bulkCost(l, 7, 10) / sum - 1) < 1e-9, l.id);
    const cash = bulkCost(l, 7, 23) * 1.0001;
    assert.equal(maxAffordable(l, 7, cash), 23, l.id);
    assert.ok(bulkCost(l, 7, 24) > cash);
  }
  const g = started();
  g.state.cash = 1e6;
  const q = g.quote('level', { lineId: A, qty: 'max' });
  const r = g.act('level', { lineId: A, qty: 'max' });
  assert.equal(r.qty, q.qty);
  assert.ok(g.state.cash < g.quote('level', { lineId: A, qty: 1 }).cost);
});

test('milestones apply exactly at their thresholds; visual tiers at L1/L25/L100', () => {
  const g = started();
  g.state.cash = 1e15;
  g.act('level', { lineId: A, qty: 8 });
  const p9 = g.stats(A).grossPerSec;
  const seen = [];
  g.on('milestone', (m) => seen.push(m.level));
  g.act('level', { lineId: A, qty: 1 });
  assert.ok(Math.abs(g.stats(A).grossPerSec / p9 - (10 / 9) * ECON.milestoneMult) < 1e-6);
  assert.deepEqual(seen, [10]);
  assert.equal(g.stats(A).visualTier, 0);
  g.act('level', { lineId: A, qty: 15 });
  assert.equal(g.stats(A).visualTier, 1);
  g.act('level', { lineId: A, qty: 75 });
  assert.equal(g.stats(A).visualTier, 2);
  assert.deepEqual(seen, [10, 25, 50, 100]);
});

test('the first business earns from its first second: walk-ins buy, only the rest fills the shelf', () => {
  const g = started();
  const s = g.stats(A);
  assert.equal(s.managed, false);
  assert.ok(Math.abs(s.sigma - ECON.sigmaWalkIn) < 1e-9);
  assert.ok(s.perSec > 0 && g.totals().incomePerSec > 0);
  const c0 = g.state.cash;
  g.run(2, 0.1);
  assert.ok(g.state.cash - c0 >= s.grossPerSec * ECON.sigmaWalkIn * 1.9, 'cash moves within 2 s');
  g.run(ECON.shelfSec / (1 - ECON.sigmaWalkIn) + 60);
  const st = g.stats(A);
  assert.ok(st.full);
  assert.ok(Math.abs(st.stock - st.shelfCap) < 1e-6, 'a full shelf never overflows');
  g.state.cash = 1e6;
  const i0 = idleRate(g, A);
  g.act('throughput', { lineId: A });
  assert.ok(idleRate(g, A) > i0, 'throughput pays an unmanaged line');
  const i1 = idleRate(g, A);
  g.act('hire', { lineId: A });
  assert.ok(idleRate(g, A) > i1, 'a manager always beats walk-ins');
});

test('managed lines earn σ·P and stock (1−σ)·P', () => {
  const g = started();
  g.state.cash = 1e6;
  assert.equal(g.act('hire', { lineId: A }).ok, true);
  const s = g.stats(A);
  const c0 = g.state.cash, k0 = g.state.lines[A].stock;
  g.run(20, 0.1);
  const earned = g.state.cash - c0, stocked = g.state.lines[A].stock - k0;
  assert.ok(Math.abs(earned / (s.grossPerSec * s.sigma * 20) - 1) < 0.02, `earned ${earned}`);
  assert.ok(Math.abs(stocked / (s.grossPerSec * (1 - s.sigma) * 20) - 1) < 0.02);
});

test('pile tap pays ×1.0; return harvest pays ×1.5 once per away interval', () => {
  const g = started();
  g.run(30);
  const stock = g.state.lines[A].stock;
  const r = g.act('tapPile', { lineId: A });
  assert.ok(Math.abs(r.delta.cash - stock * ECON.pileMult) < 1e-9);
  assert.equal(r.harvest, false);
  g.clock.t += 600e3;
  assert.deepEqual(g.advanceOffline(600).harvest, [A]);
  const s1 = g.state.lines[A].stock;
  const h = g.act('tapPile', { lineId: A });
  assert.equal(h.harvest, true);
  assert.ok(Math.abs(h.delta.cash - s1 * ECON.returnHarvest) < 1e-6);
  g.run(10);
  assert.equal(g.act('tapPile', { lineId: A }).harvest, false, 'only once');
});

test('no upgrade has a negative return for an active or an idle player (every line, every step)', () => {
  const g = started();
  g.act('cheat', { cash: 1e30, unlockAll: true, managers: true, levels: 30 });
  for (const l of LINES) {
    for (let k = 0; k < l.throughput.length; k++) {
      const a0 = activeRate(g, l.id), i0 = idleRate(g, l.id);
      assert.equal(g.act('throughput', { lineId: l.id }).ok, true);
      assert.ok(activeRate(g, l.id) >= a0 * 1.0999, `${l.id} thr ${k} active`);
      assert.ok(idleRate(g, l.id) > i0, `${l.id} thr ${k} idle`);
    }
    for (let k = 0; k < l.boosts.length; k++) {
      const a0 = activeRate(g, l.id);
      g.act('boost', { lineId: l.id });
      assert.ok(activeRate(g, l.id) > a0);
    }
  }
});

test('tapping is capped: max combo at 2.5 taps/s is ≤ 1× gross income', () => {
  assert.ok(2.5 * ECON.comboMax * ECON.tapK * (1 + ECON.tapCrit * (ECON.tapCritMult - 1)) <= 1.0);
  const g = started();
  g.state.cash = 1e9;
  g.act('level', { lineId: A, qty: 30 });
  let last;
  for (let i = 0; i < 40; i++) { last = g.act('tap'); g.tick(0.4); }
  assert.ok(Math.abs(last.combo - ECON.comboMax) < 1e-9);
  g.run(5);
  assert.equal(g.act('tap').combo, 1 + (ECON.comboMax - 1) / ECON.comboTaps, 'combo decays after a pause');
});

test('events: seeded, deterministic, scale with income, expire for free, never spawn offline', () => {
  const runEvents = (seed) => {
    const g = started({ seed });
    const seen = [];
    g.on('event:spawn', ({ event }) => seen.push(event.kind + '@' + Math.round(g.simTime)));
    g.run(1500, 1);
    return seen;
  };
  const a = runEvents(9), b = runEvents(9), c = runEvents(10);
  assert.ok(a.length >= 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const freq = EVENTS.find((e) => e.frequent);
  const g = started({ seed: 3 });
  g.state.cash = 1e9;
  g.act('level', { lineId: A, qty: 40 });
  g.act('hire', { lineId: A });
  let ev = null;
  g.on('event:spawn', ({ event }) => { if (event.kind === freq.id && !ev) ev = event; });
  while (!ev) g.run(1, 1);
  assert.equal(ev.art, freq.art, 'events carry their art key');
  const inc = Math.max(g.totals().incomePerSec, g.totals().grossPerSec * 0.6);
  const r = g.act('claimEvent', { eventId: ev.id });
  const sec = freq.reward.sec;
  assert.ok(r.delta.cash >= inc * sec * 0.99 && r.delta.cash <= inc * sec * freq.reward.jackpotMult * 1.01);
  const cash = g.state.cash;
  let expired = 0;
  g.on('event:expire', () => expired++);
  g.run(400, 1);
  assert.ok(expired > 0 && g.state.cash >= cash, 'expiry never costs anything');
  let spawned = 0;
  g.on('event:spawn', () => spawned++);
  g.clock.t += 3 * 3600e3;
  g.advanceOffline(3 * 3600);
  assert.equal(spawned, 0, 'no events while away');
});

test('event rewards: lineMult boosts one business, allMult all, both time out', () => {
  const g = started();
  g.act('cheat', { cash: 1e9, unlockAll: true, levels: 5 });
  const push = (kind, lineId) => { const e = { id: 'x' + kind, kind, lineId, born: g.simTime, expires: g.simTime + 30 }; g.state.events.active.push(e); return e; };
  const lm = EVENTS.find((e) => e.reward.kind === 'lineMult'), am = EVENTS.find((e) => e.reward.kind === 'allMult');
  const pa = g.stats(A).grossPerSec, pb = g.stats(B).grossPerSec;
  g.act('claimEvent', { eventId: push(lm.id, A).id });
  assert.ok(Math.abs(g.stats(A).grossPerSec / pa - lm.reward.mult) < 1e-9);
  assert.ok(Math.abs(g.stats(B).grossPerSec / pb - 1) < 1e-9);
  g.act('claimEvent', { eventId: push(am.id, null).id });
  assert.ok(Math.abs(g.stats(B).grossPerSec / pb - am.reward.mult) < 1e-9);
  g.run(Math.max(lm.reward.sec, am.reward.sec) + 2, 1);
  assert.ok(Math.abs(g.stats(A).grossPerSec / pa - 1) < 1e-9, 'multipliers expire');
});

test('tip couriers: spawn after the first business, tip for a bonus, expire', () => {
  const g = mk({ seed: 2 });
  g.run(120, 1);
  assert.equal(g.state.couriers.length, 0, 'no couriers before the first business');
  for (let i = 0; i < BOOT_TAPS; i++) g.act('tap');
  g.act('unlock', { lineId: A });
  let c = null, gone = 0;
  g.on('courier:spawn', (e) => { c = c || e.courier; });
  g.on('courier:gone', () => gone++);
  while (!c) g.run(1, 1);
  const r = g.act('tapCourier', { id: c.id });
  assert.ok(r.ok && r.delta.cash > 0);
  assert.equal(g.act('tapCourier', { id: c.id }).code, 'gone');
  g.run(200, 1);
  assert.ok(gone > 0);
  while (!g.state.couriers.length) g.run(1, 1);
  const t = g.act('courierTap', { lineId: A, shipmentId: 77 });
  assert.ok(t.ok && t.delta.cash > 0, 'a shipment courier claims a waiting tip');
  assert.equal(g.act('courierTap', { lineId: A, shipmentId: 77 }).code, 'gone', 'never twice');
  g.state.couriers.length = 0;
  assert.equal(g.act('courierTap', { lineId: A, shipmentId: 78 }).code, 'none', 'no tip waiting, no pay');
});

test('offline closed form equals ticking 0.1 s steps (±0.1%)', () => {
  const setup = () => {
    const g = started({ seed: 4 });
    g.act('cheat', { cash: 1e12, unlockAll: true, levels: 40 });
    for (const l of LINES.slice(0, -1)) g.act('hire', { lineId: l.id });
    g.act('throughput', { lineId: A });
    g.state.events.active = []; g.state.events.mults = [];
    g.state.events.nextFrequent = g.state.events.nextSpecial = g.state.events.courierNext = 1e12;
    g.tick(0.1);
    g.state.cash = 0;
    for (const l of LINES) g.state.lines[l.id].stock = 0;
    return g;
  };
  const a = setup(), b = setup();
  const sec = 1800;
  a.clock.t += sec * 1000;
  const rep = a.advanceOffline(sec);
  for (let i = 0; i < sec * 10; i++) b.tick(0.1);
  assert.ok(Math.abs(rep.cash / b.state.cash - 1) < 1e-3, `${rep.cash} vs ${b.state.cash}`);
  for (const l of LINES) assert.ok(Math.abs(a.state.lines[l.id].stock - b.state.lines[l.id].stock) <= 1e-3 * Math.max(1, b.state.lines[l.id].stock), l.id);
});

test('offline: cap respected, clock-back and double resume credit nothing extra', () => {
  const g = started();
  const cap = g.totals().offlineCapSec;
  assert.equal(cap, ECON.offlineCapSec);
  g.clock.t += 10 * 3600e3;
  const r = g.advanceOffline(10 * 3600);
  assert.equal(r.creditedSec, cap);
  assert.equal(r.capped, true);
  assert.equal(g.advanceOffline(10 * 3600).creditedSec, 0, 'same away interval credited once');
  g.clock.t -= 5 * 3600e3;
  const back = g.advanceOffline(3600);
  assert.equal(back.creditedSec, 0, 'clock moved back');
  assert.equal(back.clockBack, true);
  assert.equal(g.advanceOffline(3).creditedSec, 0);
});

test('offline: unmanaged lines earn walk-in sales and fill their shelf', () => {
  const g = started();
  g.state.cash = 0;
  const P = g.stats(A).grossPerSec;
  g.clock.t += 600e3;
  const r = g.advanceOffline(600);
  assert.ok(Math.abs(r.cash / (P * ECON.sigmaWalkIn * 600) - 1) < 1e-6);
  assert.ok(g.stats(A).full);
});

test('districts: later districts need a permit and the previous district; businesses there stay locked', () => {
  const lines = [...LINES, { ...LINES[1], id: 'far', district: 'far', order: LINES.length }];
  const districts = [...DISTRICTS, { id: 'far', name: 'Far', emoji: '🏜️', permitCost: 500 }, { id: 'farther', name: 'Farther', emoji: '⛰️', permitCost: 9 }];
  const g = createGame({ data: { lines, districts }, seed: 1, nowWall: () => T0 });
  g.state.cash = 1e9;
  assert.equal(g.act('unlock', { lineId: 'far' }).code, 'locked');
  assert.equal(g.act('permit', { districtId: 'farther' }).code, 'locked');
  assert.equal(g.quote('permit', { districtId: 'far' }).cost, 500);
  assert.equal(g.act('permit', { districtId: 'far' }).ok, true);
  assert.equal(g.act('unlock', { lineId: 'far' }).ok, true);
});

test('managers: hire once, reassigning an owned manager is free, cost trait discounts levels', () => {
  const g = started();
  g.state.cash = 1e9;
  const q = g.quote('hire', { lineId: A });
  assert.equal(q.owned, false);
  assert.equal(g.act('hire', { lineId: A }).ok, true);
  assert.equal(g.act('hire', { lineId: A }).code, 'owned');
  assert.equal(g.stats(A).managed, true);
  const cost = MANAGERS.find((m) => m.kind === 'cost');
  if (cost) {
    g.act('cheat', { unlockAll: true });
    const l = LINES.find((x) => x.id === cost.lineId);
    const before = g.quote('level', { lineId: l.id }).cost;
    g.act('hire', { lineId: l.id });
    assert.ok(Math.abs(g.quote('level', { lineId: l.id }).cost / before - (1 - cost.value)) < 1e-9);
  }
});

test('pacing bot: both profiles buy the first business and open every business', () => {
  for (const p of Object.keys(PROFILES)) {
    const r = runSim({ profile: p, minutes: 240 });
    assert.ok(r.firstBuy != null && r.firstBuy < 180, `${p} first business at ${r.firstBuy}s`);
    assert.equal(r.owned, LINES.length, `${p} owns ${r.owned}/${LINES.length}`);
  }
});

test('unknown acts and junk payloads never throw', () => {
  const g = started();
  assert.deepEqual(g.act('nope'), { ok: false, code: 'unknown' });
  assert.equal(g.act('toString').code, 'unknown');
  const junk = [undefined, null, {}, { lineId: 'zzz' }, { lineId: A, qty: -5 }, { lineId: A, qty: 'lots' }, { districtId: 'moon' }, { eventId: 'e999' }, { id: 'c0' }];
  const types = ['tap', 'tapPile', 'unlock', 'level', 'throughput', 'storage', 'boost', 'hire', 'claimEvent', 'permit', 'tapCourier', 'courierTap', 'setting', 'hint', 'cheat'];
  for (const t of types) for (const p of junk) {
    const r = g.act(t, p);
    assert.equal(typeof r.ok, 'boolean', t);
    assert.notEqual(r.code, 'error', `${t} ${JSON.stringify(p)} threw: ${r.msg}`);
  }
  for (const t of ['unlock', 'level', 'throughput', 'storage', 'boost', 'hire', 'permit', 'nonsense']) g.quote(t, {});
  assert.ok(Number.isFinite(g.state.cash));
});

test('stats() exposes the LineStats contract', () => {
  const g = started();
  const s = g.stats(A);
  for (const k of ['owned', 'level', 'perSec', 'grossPerSec', 'sigma', 'shelfCap', 'stock', 'stockRatio', 'cycle01', 'cycleSec', 'managed', 'managerId', 'boostMult', 'nextMilestone', 'visualTier', 'full', 'unlockable', 'nextThroughput', 'nextBoost', 'harvest']) assert.ok(k in s, k);
  assert.equal(g.stats('nope'), null);
  const t = g.totals();
  for (const k of ['incomePerSec', 'tapValue', 'offlineCapSec', 'grossPerSec']) assert.ok(k in t, k);
});

test('save: serialize round-trips through parse', () => {
  const g = started();
  g.act('cheat', { cash: 1e9, unlockAll: true, managers: true, levels: 12 });
  g.run(60, 1);
  const text = g.serialize();
  const p = parse(text);
  assert.equal(p.ok, true);
  const g2 = mk({ save: p.state });
  assert.equal(g2.serialize().replace(/"savedAt":\d+/, ''), text.replace(/"savedAt":\d+/, ''));
});

test('save: every fixture loads or fails safely', () => {
  const v1 = parse(fx('save-v1.json'));
  assert.equal(v1.ok, true);
  assert.equal(v1.state.v, SAVE_VERSION);
  const g = mk({ save: v1.state });
  assert.equal(g.state.lines.stable.lv, 12);
  assert.equal(g.stats('stable').managed, true);
  const c0 = g.state.cash;
  g.run(10, 1);
  assert.ok(g.state.cash > c0);
  assert.equal(parse(fx('save-corrupt.txt')).reason, 'corrupt');
  assert.equal(parse(fx('save-future.json')).reason, 'future');
  assert.equal(parse(fx('save-foreign.json')).reason, 'foreign');
  assert.equal(parse('').reason, 'empty');
});

test('save store: corrupt save is quarantined and never overwritten until the player acts', () => {
  const raw = fx('save-corrupt.txt');
  const st = memStorage({ [KEYS.main]: raw });
  const store = createSaveStore(st);
  assert.equal(store.load().ok, false);
  assert.equal(store.persistence, 'armed');
  const q = [...st.m.keys()].filter((k) => k.startsWith(KEYS.quarantine));
  assert.equal(q.length, 1);
  assert.equal(st.getItem(q[0]), raw);
  assert.equal(store.write('{"game":"iw2","v":1,"savedAt":5,"s":{}}'), false);
  assert.equal(st.getItem(KEYS.main), raw, 'storage key untouched');
  store.arm();
  assert.equal(store.write('{"game":"iw2","v":1,"savedAt":5,"s":{}}'), true);
});

test('save store: corrupt main falls back to the backup', () => {
  const st = memStorage({ [KEYS.main]: fx('save-corrupt.txt'), [KEYS.bak]: fx('save-v1.json') });
  const r = createSaveStore(st).load();
  assert.equal(r.ok, true);
  assert.equal(r.fromBackup, true);
});

test('save store: a future version turns persistence off and never writes', () => {
  const raw = fx('save-future.json');
  const st = memStorage({ [KEYS.main]: raw });
  const store = createSaveStore(st);
  assert.equal(store.load().reason, 'future');
  assert.equal(store.persistence, 'off');
  store.arm();
  assert.equal(store.write('{"game":"iw2","v":1,"savedAt":9,"s":{}}'), false);
  assert.equal(st.getItem(KEYS.main), raw);
});

test('save store: backup rotation is throttled to every 5 minutes', () => {
  const st = memStorage();
  const store = createSaveStore(st);
  const env = (at) => JSON.stringify({ game: 'iw2', v: 1, savedAt: at, s: { n: at } });
  store.write(env(1000));
  store.write(env(2000));
  assert.match(st.getItem(KEYS.bak), /"savedAt":1000/);
  store.write(env(3000));
  assert.match(st.getItem(KEYS.bak), /"savedAt":1000/, 'not rotated within 5 min');
  store.write(env(2000 + BAK_EVERY_MS));
  assert.match(st.getItem(KEYS.bak), /"savedAt":3000/);
});

test('state/ and data/ are pure', () => {
  for (const dir of ['js/state', 'js/data']) {
    for (const f of readdirSync(new URL('../' + dir, import.meta.url))) {
      const src = readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8');
      assert.doesNotMatch(src, /\b(document|window)\s*[.[]|\bglobalThis\b|THREE|Date\.now|Math\.random|\blocalStorage\b/, `${dir}/${f}`);
    }
  }
});
