import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createGame } from '../js/state/game.js';
import { parse, createSaveStore, KEYS, SAVE_VERSION, BAK_EVERY_MS } from '../js/state/save.js';
import { bulkCost, levelCost, maxAffordable, windowFraction } from '../js/state/economy.js';
import { LINES, ECON } from '../js/data/lines.js';
import { DISTRICTS } from '../js/data/districts.js';
import { MANAGERS } from '../js/data/managers.js';
import { EVENTS, EVENT_GAP } from '../js/data/events.js';
import { HOUSING } from '../js/data/housing.js';
import { SEASONS } from '../js/data/seasons.js';
import { ACHIEVEMENTS } from '../js/data/achievements.js';
import { runLife, PROFILES } from './sim.mjs';

const fx = (f) => readFileSync(new URL('../tests/fixtures/' + f, import.meta.url), 'utf8');
const T0 = Date.parse('2026-10-05T10:00:00');

function mk(o = {}) {
  const clock = { t: o.t ?? T0 };
  const g = createGame({ seed: o.seed ?? 1, nowWall: () => clock.t, allowCheat: true, ...o, ...(o.save ? { save: o.save } : {}) });
  g.clock = clock;
  g.run = (sec, dt = 0.5) => { for (let s = 0; s < sec; s += dt) { clock.t += dt * 1000; g.tick(dt); } };
  return g;
}

function started(o) {
  const g = mk(o);
  for (let i = 0; i < 25; i++) g.act('tap');
  g.act('cashCans');
  g.act('unlock', { lineId: 'lemonade' });
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
const ageTo = (g, age) => { g.state.life.xp = Math.max(g.state.life.xp, (age - 18) / g.data.life.xpYears); g.run(1, 1); };

test('main.js data shape still boots (scaffold data object)', () => {
  const data = { lines: LINES, districts: DISTRICTS, managers: MANAGERS, events: EVENTS, eventGap: EVENT_GAP, housing: HOUSING };
  const g = createGame({ data, seed: 1, nowWall: () => T0 });
  for (let i = 0; i < 25; i++) g.act('tap');
  assert.equal(g.act('cashCans').ok, true);
  assert.equal(g.act('unlock', { lineId: 'lemonade' }).ok, true);
});

test('bootstrap: the first stand needs ~25 can pickups, no idle income before it', () => {
  const g = mk();
  assert.equal(g.act('unlock', { lineId: 'lemonade' }).code, 'funds');
  g.run(120);
  assert.equal(g.state.cash, 0);
  assert.equal(g.totals().incomePerSec, 0);
  for (let i = 0; i < 24; i++) g.act('tap');
  g.act('cashCans');
  assert.equal(g.act('unlock', { lineId: 'lemonade' }).code, 'funds');
  g.act('tap'); g.act('cashCans');
  assert.equal(g.act('unlock', { lineId: 'lemonade' }).ok, true);
  assert.equal(g.state.bootstrap.done, true);
  const r = g.act('tap');
  assert.ok(r.ok && r.delta.cash > 0 && r.delta.cash < 2, 'hustle tap, not a can');
  assert.equal(g.state.bootstrap.cans, 0);
});

test('cost formulas: x10 equals ten singles, MAX is the largest affordable', () => {
  for (const l of LINES) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += levelCost(l, 7 + i);
    assert.ok(Math.abs(bulkCost(l, 7, 10) / sum - 1) < 1e-9, l.id);
    const cash = bulkCost(l, 7, 23) * 1.0001;
    const n = maxAffordable(l, 7, cash);
    assert.equal(n, 23, l.id);
    assert.ok(bulkCost(l, 7, n + 1) > cash);
  }
  const g = started();
  g.state.cash = 1e6;
  const q = g.quote('level', { lineId: 'lemonade', qty: 'max' });
  const r = g.act('level', { lineId: 'lemonade', qty: 'max' });
  assert.equal(r.qty, q.qty);
  assert.ok(g.state.cash < g.quote('level', { lineId: 'lemonade', qty: 1 }).cost);
});

test('milestones apply exactly at their thresholds; visual tiers at L1/L25/L100', () => {
  const g = started();
  g.state.cash = 1e12;
  g.act('level', { lineId: 'lemonade', qty: 8 });
  const p9 = g.stats('lemonade').grossPerSec;
  const seen = [];
  g.on('milestone', (m) => seen.push(m.level));
  g.act('level', { lineId: 'lemonade', qty: 1 });
  assert.ok(Math.abs(g.stats('lemonade').grossPerSec / p9 - (10 / 9) * ECON.milestoneMult) < 1e-6);
  assert.deepEqual(seen, [10]);
  assert.equal(g.stats('lemonade').visualTier, 0);
  g.act('level', { lineId: 'lemonade', qty: 15 });
  assert.equal(g.stats('lemonade').visualTier, 1);
  g.act('level', { lineId: 'lemonade', qty: 75 });
  assert.equal(g.stats('lemonade').visualTier, 2);
  assert.deepEqual(seen, [10, 25, 50, 100]);
});

test('the first stand earns from its first second: walk-in customers buy, only the rest fills the shelf', () => {
  const g = started();
  const s = g.stats('lemonade');
  assert.equal(s.managed, false);
  assert.ok(Math.abs(s.sigma - ECON.sigmaWalkIn) < 1e-9);
  assert.ok(s.perSec > 0 && g.totals().incomePerSec > 0);
  const c0 = g.state.cash;
  g.run(2, 0.1);
  assert.ok(g.state.cash - c0 >= s.grossPerSec * ECON.sigmaWalkIn * 1.9, 'cash moves within 2 s');
  g.run(ECON.shelfSec / (1 - ECON.sigmaWalkIn) + 60);
  const st = g.stats('lemonade');
  assert.ok(st.full);
  assert.ok(Math.abs(st.stock - st.shelfCap) < 1e-6, 'a full shelf never overflows');
  assert.ok(Math.abs(st.shelfCap / st.grossPerSec - ECON.shelfSec) < 1e-6, 'shelf is 3 min of output');
  const c1 = g.state.cash;
  g.run(10, 0.1);
  assert.ok(Math.abs((g.state.cash - c1) / (st.grossPerSec * ECON.sigmaWalkIn * 10) - 1) < 0.02, 'still sells at walk-in rate when full');
  g.state.cash = 1e5;
  const i0 = idleRate(g, 'lemonade');
  g.act('throughput', { lineId: 'lemonade' });
  assert.ok(idleRate(g, 'lemonade') > i0, 'throughput pays an unmanaged line');
  const i1 = idleRate(g, 'lemonade');
  g.act('hire', { lineId: 'lemonade' });
  assert.ok(idleRate(g, 'lemonade') > i1, 'a manager always beats walk-ins');
});

test('managed lines earn σ·P and stock (1−σ)·P; σ starts at 60%', () => {
  const g = started();
  g.state.cash = 1e5;
  assert.equal(g.act('hire', { lineId: 'lemonade' }).ok, true);
  const s = g.stats('lemonade');
  assert.ok(Math.abs(s.sigma - 0.6) < 1e-9);
  const c0 = g.state.cash, k0 = g.state.lines.lemonade.stock;
  g.run(20, 0.1);
  const earned = g.state.cash - c0, stocked = g.state.lines.lemonade.stock - k0;
  assert.ok(Math.abs(earned / (s.grossPerSec * 0.6 * 20) - 1) < 0.02, `earned ${earned}`);
  assert.ok(Math.abs(stocked / (s.grossPerSec * 0.4 * 20) - 1) < 0.02);
});

test('pile tap pays ×1.0; return harvest pays ×1.5 once per away interval', () => {
  const g = started();
  g.run(30);
  const stock = g.state.lines.lemonade.stock;
  const r = g.act('tapPile', { lineId: 'lemonade' });
  assert.ok(Math.abs(r.delta.cash - stock * ECON.pileMult) < 1e-9);
  assert.equal(r.harvest, false);
  g.clock.t += 600e3;
  const rep = g.advanceOffline(600);
  assert.deepEqual(rep.harvest, ['lemonade']);
  const s1 = g.state.lines.lemonade.stock;
  const h = g.act('tapPile', { lineId: 'lemonade' });
  assert.equal(h.harvest, true);
  assert.ok(Math.abs(h.delta.cash - s1 * 1.5) < 1e-6);
  g.run(10);
  assert.equal(g.act('tapPile', { lineId: 'lemonade' }).harvest, false, 'only once');
  g.clock.t += 600e3;
  g.advanceOffline(600);
  assert.equal(g.act('tapPile', { lineId: 'lemonade' }).harvest, true, 're-armed by the next away interval');
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
  g.act('level', { lineId: 'lemonade', qty: 30 });
  let last;
  for (let i = 0; i < 40; i++) { last = g.act('tap'); g.tick(0.4); }
  assert.ok(Math.abs(last.combo - ECON.comboMax) < 1e-9);
  assert.ok(g.state.stats.comboMax >= ECON.comboTaps);
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
  const g = started({ seed: 3 });
  g.state.cash = 1e9;
  g.act('level', { lineId: 'lemonade', qty: 40 });
  g.act('hire', { lineId: 'lemonade' });
  let ev = null;
  g.on('event:spawn', ({ event }) => { if (event.kind === 'pigeon' && !ev) ev = event; });
  while (!ev) g.run(1, 1);
  const inc = Math.max(g.totals().incomePerSec, g.totals().grossPerSec * 0.6);
  const r = g.act('claimEvent', { eventId: ev.id });
  const sec = EVENTS[0].reward.sec;
  assert.ok(r.delta.cash >= inc * sec * 0.99 && r.delta.cash <= inc * sec * EVENTS[0].reward.jackpotMult * 1.01);
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

test('Rush Hour pays a crate by score tier; Lucky Delivery needs 3 hits; bulk orders complete from sales', () => {
  const g = started({ seed: 5 });
  g.act('cheat', { cash: 1e9, unlockAll: true, managers: true, levels: 20 });
  const ev = (kind) => { const e = { id: 'x' + kind, kind, emoji: '', lineId: 'lemonade', born: g.simTime, expires: g.simTime + 30 }; g.state.events.active.push(e); return e; };
  const n0 = g.state.items.length;
  const gold = g.act('claimEvent', { eventId: ev('rush').id, score: 20 });
  assert.equal(gold.reward.tier, 'gold');
  assert.equal(g.state.items.length, n0 + 2);
  assert.equal(g.act('claimEvent', { eventId: ev('rush').id, score: 3 }).reward.tier, 'basic');
  assert.equal(g.act('claimEvent', { eventId: ev('rush').id, score: 9999 }).reward.score, 24, 'score clamped');
  const n1 = g.state.items.length;
  g.act('claimEvent', { eventId: ev('lucky').id, score: 2 });
  assert.equal(g.state.items.length, n1);
  g.act('claimEvent', { eventId: ev('lucky').id, score: 3 });
  assert.equal(g.state.items.length, n1 + 1);
  const ok = g.act('claimEvent', { eventId: ev('bulk').id });
  assert.ok(ok.reward.order);
  let done = null;
  g.on('order:done', (o) => { done = o; });
  for (let i = 0; i < 120 && !done; i++) { g.run(1, 1); g.act('tapPile', { lineId: 'lemonade' }); }
  assert.ok(done && done.cash > 0, 'order completes');
  assert.equal(g.state.events.order, null);
});

test('Suburbs couriers: spawn, tip for a bonus, expire', () => {
  const g = started({ seed: 2 });
  g.run(120, 1);
  assert.equal(g.state.couriers.length, 0, 'no couriers before Suburbs');
  g.act('cheat', { cash: 1e9, unlockAll: true, levels: 5 });
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
  const t = g.act('courierTap', { lineId: 'cafe', shipmentId: 77 });
  assert.ok(t.ok && t.delta.cash > 0, 'a shipment courier claims a waiting tip');
  assert.equal(g.act('courierTap', { lineId: 'cafe', shipmentId: 77 }).code, 'gone', 'never twice');
  g.state.couriers.length = 0;
  assert.equal(g.act('courierTap', { lineId: 'cafe', shipmentId: 78 }).code, 'none', 'no tip waiting, no pay');
});

test('miniStart keeps a mini-game event alive until it finishes', () => {
  const g = started();
  const e = { id: 'r1', kind: 'rush', emoji: '⏰', lineId: 'lemonade', born: g.simTime, expires: g.simTime + 2, game: { sec: 15, max: 24 } };
  g.state.events.active.push(e);
  assert.equal(g.act('miniStart', { eventId: 'r1' }).ok, true);
  g.run(14, 1);
  assert.equal(g.act('claimEvent', { eventId: 'r1', score: 12 }).ok, true);
  assert.equal(g.act('miniStart', { eventId: 'nope' }).code, 'gone');
});

test('offline closed form equals ticking 0.1 s steps (±0.1%)', () => {
  const setup = () => {
    const g = started({ seed: 4 });
    g.act('cheat', { cash: 1e12, unlockAll: true, levels: 40 });
    for (const l of LINES) if (!['appstudio'].includes(l.id)) g.act('hire', { lineId: l.id });
    g.act('throughput', { lineId: 'barber' });
    for (const l of LINES) g.state.lines[l.id].stock = 0;
    g.state.events.active = []; g.state.events.mults = [];
    g.state.events.nextPigeon = g.state.events.nextSpecial = g.state.events.courierNext = 1e12;
    g.state.cash = 0;
    for (const x of ACHIEVEMENTS) g.state.achievements[x.id] = true;
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
  g.state.cash = 1e6;
  g.act('hire', { lineId: 'lemonade' });
  const cap = g.totals().offlineCapSec;
  assert.equal(cap, 3600);
  g.clock.t += 10 * 3600e3;
  const r = g.advanceOffline(10 * 3600);
  assert.equal(r.creditedSec, cap);
  assert.equal(r.capped, true);
  const again = g.advanceOffline(10 * 3600);
  assert.equal(again.creditedSec, 0, 'same away interval credited once');
  g.clock.t -= 5 * 3600e3;
  const back = g.advanceOffline(3600);
  assert.equal(back.creditedSec, 0, 'clock moved back');
  assert.equal(back.clockBack, true);
  const small = g.advanceOffline(3);
  assert.equal(small.creditedSec, 0);
});

test('offline: unmanaged lines earn walk-in sales and fill their shelf', () => {
  const g = started();
  g.state.cash = 0;
  const P = g.stats('lemonade').grossPerSec;
  g.clock.t += 600e3;
  const r = g.advanceOffline(600);
  assert.ok(Math.abs(r.cash / (P * ECON.sigmaWalkIn * 600) - 1) < 1e-6);
  assert.ok(g.stats('lemonade').full);
});

test('Downtown night shift: two lines ×2 from 18:00 to 06:00 local, offline too', () => {
  const day = started({ t: Date.parse('2026-10-05T12:00:00') });
  day.act('cheat', { cash: 1e15, unlockAll: true, managers: true, levels: 30 });
  assert.equal(day.act('nightShift', { lineId: 'lemonade', on: true }).ok, true);
  day.act('nightShift', { lineId: 'foodtruck', on: true });
  assert.equal(day.act('nightShift', { lineId: 'barber', on: true }).code, 'full');
  const rel = () => day.stats('lemonade').grossPerSec / day.stats('barber').grossPerSec;
  day.tick(0.1);
  const p = rel();
  day.clock.t = Date.parse('2026-10-05T21:00:00');
  day.tick(0.1);
  assert.ok(Math.abs(rel() / p - 2) < 1e-6);
  assert.equal(day.stats('lemonade').nightActive, true);
  assert.ok(Math.abs(windowFraction(Date.parse('2026-10-05T12:00:00'), Date.parse('2026-10-06T00:00:00'), 18, 6) - 0.5) < 0.02);
  const fresh = started();
  assert.equal(fresh.act('nightShift', { lineId: 'lemonade', on: true }).code, 'locked');
});

test('Harbour supply link: Fish & Chips ×1.5 while a boat line feeds it', () => {
  const g = started();
  g.act('cheat', { cash: 1e15, unlockAll: true, managers: true, levels: 10 });
  const p = g.stats('fishchips').grossPerSec;
  const q = g.quote('supplyLink', {});
  assert.ok(q.ready && q.affordable);
  assert.equal(g.act('supplyLink', { from: 'ferry' }).ok, true);
  assert.ok(Math.abs(g.stats('fishchips').grossPerSec / p - 1.5) < 1e-6);
  assert.ok(g.stats('fishchips').supply.on && g.stats('ferry').supply);
});

test('districts: permits need cash and 3 contracts of the previous district', () => {
  const g = started();
  g.state.cash = 1e12;
  const r = g.act('permit', { districtId: 'suburbs' });
  assert.equal(r.code, 'locked');
  assert.match(r.msg, /contracts/);
  g.act('unlock', { lineId: 'foodtruck' }); g.act('unlock', { lineId: 'barber' });
  g.act('level', { lineId: 'lemonade', qty: 30 });
  g.act('housing', { tier: 1 });
  for (const id of ['ot1', 'ot2', 'ot4']) assert.equal(g.act('claimContract', { id }).ok, true, id);
  assert.equal(g.act('claimContract', { id: 'ot1' }).code, 'owned');
  assert.equal(g.act('claimContract', { id: 'sb1' }).code, 'bad', 'not visible yet');
  assert.equal(g.act('permit', { districtId: 'suburbs' }).ok, true);
  assert.equal(g.act('unlock', { lineId: 'fishchips' }).code, 'locked');
});

test('districts: finished-but-unclaimed contracts count; buying the permit claims them', () => {
  const g = started();
  g.state.cash = 1e12;
  g.act('unlock', { lineId: 'foodtruck' }); g.act('unlock', { lineId: 'barber' });
  g.act('level', { lineId: 'lemonade', qty: 30 });
  const q0 = g.quote('permit', { districtId: 'suburbs' });
  assert.ok(q0.blocked && !q0.affordable);
  assert.deepEqual([q0.contracts.done, q0.contracts.need], [2, 3]);
  g.act('housing', { tier: 1 });
  const q = g.quote('permit', { districtId: 'suburbs' });
  assert.equal(q.blocked, null);
  assert.equal(q.affordable, true);
  assert.deepEqual(q.contracts.autoClaim.sort(), ['ot1', 'ot2', 'ot4']);
  const t0 = g.state.tickets, got = [];
  g.on('contract', (c) => got.push(c.id));
  const r = g.act('permit', { districtId: 'suburbs' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.claimed.sort(), ['ot1', 'ot2', 'ot4']);
  assert.deepEqual(got.sort(), ['ot1', 'ot2', 'ot4']);
  assert.ok(g.state.tickets > t0, 'auto-claimed rewards are paid');
  assert.equal(g.act('claimContract', { id: 'ot2' }).code, 'owned');
});

test('contracts never need a hidden mechanic: no contract asks for courier tips; the courier daily waits for a first tip', () => {
  const g = started();
  assert.ok(!g.data.contracts.some((c) => c.kind === 'couriers'));
  g.act('cheat', { cash: 1e15, unlockAll: true });
  for (let d = 1; d <= 20; d++) {
    g.clock.t = Date.parse(`2026-11-${String(d).padStart(2, '0')}T10:00:00`);
    g.run(1, 1);
    assert.ok(!g.state.goals.daily.goals.some((x) => x.id === 'couriers'), 'day ' + d);
  }
  g.state.stats.couriers = 1;
  let seen = false;
  for (let d = 1; d <= 28 && !seen; d++) {
    g.clock.t = Date.parse(`2026-12-${String(d).padStart(2, '0')}T10:00:00`);
    g.run(1, 1);
    seen = g.state.goals.daily.goals.some((x) => x.id === 'couriers');
  }
  assert.ok(seen, 'courier daily returns once couriers are known');
});

test('managers: hire, level with cash+tickets, slots, equip, merge, auto-equip, crit cap', () => {
  const g = started();
  g.state.cash = 1e15;
  g.state.tickets = 100;
  g.act('hire', { lineId: 'lemonade' });
  assert.equal(g.managerSlots(1), 1);
  assert.equal(g.managerSlots(3), 2);
  const p1 = g.stats('lemonade').grossPerSec;
  assert.equal(g.act('managerLevel', { managerId: 'm_lemonade' }).ok, true);
  assert.ok(g.stats('lemonade').grossPerSec > p1);
  assert.ok(g.state.tickets < 100);
  g.act('managerLevel', { managerId: 'm_lemonade' });
  assert.equal(g.state.managers.m_lemonade.slots.length, 2);
  for (let i = 0; i < 3; i++) g.state.items.push({ id: 'c' + i, def: 'clover', rarity: 2, equipped: null });
  for (let i = 0; i < 3; i++) g.state.items.push({ id: 'k' + i, def: 'clover', rarity: 2, equipped: null });
  g.act('equip', { itemId: 'c0', target: { kind: 'manager', id: 'm_lemonade' } });
  g.act('equip', { itemId: 'c1', target: { kind: 'manager', id: 'm_lemonade' } });
  assert.equal(g.act('equip', { itemId: 'c2', target: { kind: 'manager', id: 'm_lemonade' } }).code, 'full');
  assert.ok(g.stats('lemonade').crit <= ECON.critCap + 1e-12);
  g.act('unequip', { itemId: 'c1' });
  assert.equal(g.state.items.find((i) => i.id === 'c1').equipped, null);
  for (let i = 0; i < 3; i++) g.state.items.push({ id: 'a' + i, def: 'apron', rarity: 0, equipped: null });
  const m = g.act('merge', { itemId: 'a0' });
  assert.equal(m.ok, true);
  assert.equal(m.item.rarity, 1);
  assert.equal(g.state.items.filter((i) => i.def === 'apron').length, 1);
  assert.equal(g.act('merge', { itemId: m.item.id }).code, 'need3');
  g.act('autoEquip', { managerId: 'm_lemonade' });
  assert.equal(g.state.managers.m_lemonade.slots.filter(Boolean).length, 2);
  assert.notEqual(g.state.items.find((i) => i.id === g.state.managers.m_lemonade.slots[0]).def, g.state.items.find((i) => i.id === g.state.managers.m_lemonade.slots[1]).def, 'auto-equip spreads stats');
});

function toRetirement(seed = 1) {
  const g = started({ seed });
  g.act('cheat', { cash: 1e22, unlockAll: true, managers: true, levels: 60 });
  ageTo(g, 60);
  for (let t = 1; t <= 5; t++) assert.equal(g.act('housing', { tier: t }).ok, true);
  g.run(2, 1);
  g.act('partner', { choice: 'entrepreneur' });
  g.act('adoptDog', { name: 'Rex' });
  for (let i = 0; i < 400 && !g.state.life.kids.some((k) => k.stage === 'teen'); i++) { g.state.life.xp += 0.5; g.run(1, 1); }
  return g;
}

test('life: partner at the Apartment, kids at the Starter House, kids grow and work a line → talent', () => {
  const g = started();
  const beats = [];
  g.on('life:beat', (b) => beats.push(b.kind + (b.stage ? ':' + b.stage : '')));
  g.state.cash = 1e22;
  assert.equal(g.act('partner', { choice: 0 }).code, 'locked');
  g.act('housing', { tier: 1 });
  assert.equal(g.act('housing', { tier: 2 }).code, 'young', 'homes unlock with age');
  assert.equal(g.quote('housing', { tier: 2 }).young, true);
  ageTo(g, HOUSING[2].minAge);
  assert.equal(g.act('housing', { tier: 2 }).ok, true);
  g.run(2, 1);
  assert.equal(g.state.life.partnerOffer.choices.length, 3);
  assert.ok(g.state.life.partnerOffer.choices.every((c) => c.name && c.perk));
  assert.equal(g.act('partner', { choice: 'homebody' }).ok, true);
  assert.equal(g.totals().offlineCapSec, HOUSING[2].offlineCapSec + 3600);
  g.run(30, 1);
  assert.equal(g.state.life.kids.length, 0, 'no kids in the Apartment');
  ageTo(g, HOUSING[3].minAge);
  assert.equal(g.act('housing', { tier: 3 }).ok, true);
  const age0 = g.state.life.age;
  for (let i = 0; i < 400 && !g.state.life.kids.length; i++) { g.state.life.xp += 0.25; g.run(1, 1); }
  assert.ok(g.state.life.age >= age0);
  g.act('cheat', { unlockAll: true, levels: 10 });
  for (let i = 0; i < 400 && g.state.life.kids[0].stage !== 'teen'; i++) { g.state.life.xp += 0.25; g.run(1, 1); }
  const k = g.state.life.kids[0];
  assert.ok(k.workedLine, 'kid works a line');
  assert.ok(k.workSec > 0);
  assert.equal(k.talent, LINES.find((l) => l.id === k.workedLine).talent);
  assert.equal(g.act('kidWork', { kidId: k.id, lineId: 'carwash' }).ok, true);
  g.run(5000, 5);
  assert.equal(g.state.life.kids[0].talent, 'mechanic', 'talent follows the line worked longest');
  assert.ok(beats.includes('move') && beats.includes('partner') && beats.includes('birth') && beats.includes('grow:teen'));
  assert.equal(g.state.life.kids.length, 1, 'one kid in a Starter House');
});

test('age cap never freezes kids: a Starter House bought at the cap still yields a teen', () => {
  const g = started();
  g.state.cash = 1e22;
  ageTo(g, 200);
  assert.equal(g.state.life.age, g.data.life.ageMax);
  for (let t = 1; t <= 3; t++) assert.equal(g.act('housing', { tier: t }).ok, true);
  g.run(2, 1);
  g.act('partner', { choice: 0 });
  g.run(40 * 60, 1);
  const kid = g.state.life.kids[0];
  assert.ok(kid && !kid.apprentice, 'born at the cap');
  assert.equal(kid.stage, 'teen', `kid age ${kid.kidAge} with the parent capped at ${g.state.life.age}`);
  g.act('cheat', { unlockAll: true });
  assert.equal(g.retirePreview().available, true);
});

test('fallback heir: no kids by the heir age with the Harbour open → an apprentice teen, and retiring works', () => {
  const g = started();
  g.act('cheat', { cash: 1e15, unlockAll: true });
  const beats = [];
  g.on('life:beat', (b) => beats.push(b));
  ageTo(g, g.data.life.heirAge - 1);
  assert.equal(g.state.life.kids.length, 0);
  ageTo(g, g.data.life.heirAge);
  const k = g.state.life.kids[0];
  assert.ok(k && k.apprentice && k.stage === 'teen');
  assert.ok(g.data.heirNames.includes(k.name));
  assert.ok(beats.some((b) => b.kind === 'heir' && b.name === k.name));
  g.run(5, 1);
  assert.equal(g.state.life.kids.length, 1, 'only one apprentice');
  const r = g.act('retire', { heirId: k.id });
  assert.equal(r.ok, true);
  assert.equal(g.state.life.name, k.name);
});

test('every player can retire: typical play within 90 min, a slow idle player within 4 h', () => {
  const ty = runLife(PROFILES.typical, { minutes: 90, probes: false, audit: false, quiet: true });
  assert.ok(ty.log.marks.retireAvail != null && ty.log.marks.retireAvail <= 90 * 60, 'typical ' + ty.log.marks.retireAvail);
  assert.ok(ty.log.marks.partner <= 15 * 60 * 1.3 && ty.log.marks.firstKid <= 35 * 60 * 1.3, 'typical life beats');
  const slow = runLife(PROFILES.slow, { minutes: 240, probes: false, audit: false, quiet: true });
  assert.ok(slow.log.marks.retireAvail != null, 'slow player can retire');
});

test('prestige: retire needs a teen + Harbour; ×2 first floor; what resets and what stays; landmarks', () => {
  const fresh = started();
  assert.equal(fresh.act('retire', {}).code, 'locked');
  const g = toRetirement();
  assert.equal(g.act('claimContract', { id: 'ot1' }).ok, true);
  g.state.items.push({ id: 'heir1', def: 'scale', rarity: 2, equipped: null });
  g.state.tickets = 17;
  const pv = g.retirePreview();
  assert.equal(pv.available, true);
  assert.ok(pv.nextMult >= 2);
  const teen = g.state.life.kids.find((k) => k.stage === 'teen');
  const mgrs = JSON.stringify(g.state.managers);
  const ach = Object.keys(g.state.achievements).length;
  const events = [];
  g.on('landmark', (l) => events.push(l.kind));
  g.on('retired', () => events.push('retired'));
  const r = g.act('retire', { heirId: teen.id, heirloomItemId: 'heir1' });
  assert.equal(r.ok, true);
  const s = g.state;
  assert.equal(s.family.gen, 2);
  assert.equal(s.life.name, teen.name);
  assert.equal(s.life.age, 18);
  assert.equal(s.life.homeTier, 0);
  assert.equal(s.life.partner, null);
  assert.equal(s.life.kids.length, 0);
  assert.equal(s.life.dog.name, 'Rex', 'the dog is inherited');
  assert.equal(s.family.talent, teen.talent);
  assert.ok(LINES.every((l) => s.lines[l.id].lv === 0));
  assert.deepEqual([...s.districts].sort(), DISTRICTS.map((d) => d.id).sort(), 'the bridge is already built');
  assert.equal(JSON.stringify(s.managers), mgrs, 'managers persist');
  assert.equal(s.tickets, 17);
  assert.equal(Object.keys(s.achievements).length >= ach, true);
  assert.equal(s.family.portraits.length, 1);
  assert.deepEqual(events, ['plaque', 'statue', 'museum', 'retired']);
  assert.equal(s.family.heirlooms.length, 1);
  assert.ok(!s.items.some((i) => i.id === 'heir1'));
  assert.ok(g.totals().legacyMult >= 2);
  assert.ok(s.cash >= 50);
  assert.equal(g.act('unlock', { lineId: 'lemonade' }).ok, true);
  assert.ok(g.stats('lemonade').managed, 'family managers return to their line');
  assert.equal(g.quote('permit', { districtId: 'harbour' }).cost, Infinity, 'already open');
  assert.equal(g.act('claimContract', { id: 'ot1' }).code, 'owned', 'contracts are once per family');
});

test('goals: three daily goals per local day, a 7-day gift that pauses', () => {
  const g = started();
  g.run(2, 1);
  const d = g.goals().daily;
  assert.equal(d.length, 3);
  const day1 = g.state.goals.daily.day;
  assert.equal(g.act('claimGift').ok, true);
  assert.equal(g.act('claimGift').code, 'owned');
  g.clock.t += 5 * 86400e3;
  g.run(2, 1);
  assert.notEqual(g.state.goals.daily.day, day1);
  assert.equal(g.goals().gift.ready, true);
  assert.equal(g.goals().gift.step, 1, 'missing days pauses, never resets');
  const goal = g.state.goals.daily.goals[0];
  g.state.stats[goal.stat] += goal.n;
  const n0 = g.state.items.length + g.state.tickets;
  assert.equal(g.act('claimDaily', { index: 0 }).ok, true);
  assert.ok(g.state.items.length + g.state.tickets > n0);
});

test('achievements unlock and each adds +1% income', () => {
  const g = started();
  g.run(2, 1);
  const n = Object.keys(g.state.achievements).length;
  assert.ok(n >= 2);
  const m = g.totals().globalMult;
  for (let i = 0; i < 1000; i++) g.act('tap');
  g.run(2, 1);
  assert.ok(g.state.achievements.tap1k);
  assert.ok(g.totals().globalMult > m);
});

test("season: Hollow's Eve is live Oct 1 – Nov 2 local, earns candy, ranks give keepsakes", () => {
  const off = started({ t: Date.parse('2026-11-03T12:00:00') });
  assert.equal(off.seasonInfo().live, false);
  assert.equal(off.act('seasonEnter', {}).code, 'locked');
  const g = started({ t: Date.parse('2026-10-05T12:00:00') });
  const info = g.seasonInfo();
  assert.equal(info.live, true);
  assert.equal(info.id, SEASONS[0].id);
  assert.equal(g.act('seasonEnter', { seasonId: 'hollows-eve' }).ok, true);
  g.run(60, 1);
  const c1 = g.seasonInfo().candy;
  assert.ok(c1 > 0);
  g.act('seasonLeave');
  g.run(60, 1);
  assert.ok(Math.abs((g.seasonInfo().candy - c1) / c1 - 0.5) < 0.05, 'outside the side world: 50%');
  const w = started({ t: Date.parse('2026-10-05T19:00:00') });
  assert.equal(w.seasonInfo().witching, true);
  assert.equal(w.seasonInfo().mult, 2);
  assert.equal(started({ t: Date.parse('2026-10-31T09:00:00') }).seasonInfo().mult, 3);
  assert.equal(started({ t: Date.parse('2026-10-31T09:00:00') }).seasonInfo().trickOrTreat, true);
  const st = g.state.seasons['hollows-eve'];
  st.xp = 1e12;
  const ranks = [];
  g.on('season', (e) => e.kind === 'rank' && ranks.push(e.rank));
  g.run(1, 1);
  assert.equal(st.rank, 12);
  assert.equal(ranks.length, 12);
  assert.ok(g.state.managers.m_cuppula, 'Count Cuppula joins the family');
  assert.ok(g.state.keepsakes.cape && g.state.keepsakes.cape.crossGame);
});

test('keepsakes can be assigned to the character, a line or a manager', () => {
  const g = started({ t: Date.parse('2026-10-05T12:00:00') });
  g.state.cash = 1e9;
  g.act('hire', { lineId: 'lemonade' });
  g.state.keepsakes.cape = { target: null, crossGame: true };
  const base = g.stats('lemonade').grossPerSec;
  g.act('assignKeepsake', { keepsakeId: 'cape', target: { kind: 'character' } });
  const chr = g.stats('lemonade').grossPerSec;
  g.act('assignKeepsake', { keepsakeId: 'cape', target: { kind: 'line', id: 'lemonade' } });
  const line = g.stats('lemonade').grossPerSec;
  g.act('assignKeepsake', { keepsakeId: 'cape', target: { kind: 'manager', id: 'm_lemonade' } });
  const mgr = g.stats('lemonade').grossPerSec;
  assert.ok(chr > base && line > chr && Math.abs(mgr - line) < 1e-9);
  assert.equal(g.act('assignKeepsake', { keepsakeId: 'cape', target: { kind: 'manager', id: 'nobody' } }).code, 'bad');
});

test('season side world: unlock and level variant lines with candy; offline at 50% capped at 4 h', () => {
  const g = started({ t: Date.parse('2026-10-06T01:00:00') });
  g.act('seasonEnter', {});
  g.state.seasons['hollows-eve'].candy = 1e9;
  assert.equal(g.act('seasonUnlock', { lineId: 'pumpkinpie' }).ok, true);
  assert.equal(g.act('seasonLevel', { lineId: 'witchbrew', qty: 10 }).ok, true);
  assert.equal(g.seasonStats('witchbrew').level, 11);
  g.act('seasonLeave');
  const rate = g.seasonInfo().rate;
  g.clock.t += 10 * 3600e3;
  const r = g.advanceOffline(10 * 3600);
  assert.ok(Math.abs(r.candy / (rate * 4 * 3600) - 1) < 0.01);
  const w = started({ t: Date.parse('2026-10-06T17:00:00') });
  const base = w.seasonInfo().rate;
  w.clock.t += 2 * 3600e3;
  const back = w.advanceOffline(2 * 3600);
  assert.equal(w.seasonInfo().witching, true);
  assert.ok(Math.abs(back.candy / (base * 1.5 * 7200) - 1) < 0.02, 'half the away time was Witching Hour; housing cap does not apply');
});

test('unknown acts and junk payloads never throw', () => {
  const g = started();
  assert.deepEqual(g.act('nope'), { ok: false, code: 'unknown' });
  assert.equal(g.act('toString').code, 'unknown');
  const junk = [undefined, null, {}, { lineId: 'zzz' }, { lineId: 'lemonade', qty: -5 }, { lineId: 'lemonade', qty: 'lots' }, { itemId: 'x' }, { tier: 99 }, { districtId: 'moon' }, { eventId: 'e999', score: 'NaN' }];
  const types = ['tap', 'tapPile', 'unlock', 'level', 'throughput', 'storage', 'boost', 'hire', 'managerLevel', 'equip', 'unequip', 'merge', 'autoEquip', 'claimEvent', 'permit', 'housing', 'partner', 'adoptDog', 'kidWork', 'supplyLink', 'nightShift', 'claimContract', 'claimDaily', 'claimGift', 'retire', 'seasonEnter', 'seasonLeave', 'seasonUnlock', 'seasonLevel', 'seasonBoost', 'assignKeepsake', 'tapCourier', 'courierTap', 'miniStart', 'setting', 'postcardTaken', 'pickCan', 'cashCans', 'hint'];
  for (const t of types) for (const p of junk) {
    const r = g.act(t, p);
    assert.equal(typeof r.ok, 'boolean', t);
    assert.notEqual(r.code, 'error', `${t} ${JSON.stringify(p)} threw: ${r.msg}`);
  }
  for (const t of ['unlock', 'level', 'throughput', 'boost', 'hire', 'permit', 'housing', 'retire', 'nonsense']) g.quote(t, {});
  assert.ok(Number.isFinite(g.state.cash));
});

test('stats() exposes the full LineStats contract', () => {
  const g = started();
  const s = g.stats('lemonade');
  for (const k of ['owned', 'level', 'perSec', 'sigma', 'shelfCap', 'stock', 'stockRatio', 'cycle01', 'cycleSec', 'managed', 'managerId', 'boostMult', 'nextMilestone', 'visualTier', 'full', 'unlockable', 'nextThroughput', 'nextBoost', 'harvest', 'supply', 'nightShift', 'kid']) assert.ok(k in s, k);
  assert.equal(g.stats('nope'), null);
  const t = g.totals();
  for (const k of ['incomePerSec', 'tapValue', 'offlineCapSec', 'grossPerSec']) assert.ok(k in t, k);
});

test('save: serialize round-trips through parse', () => {
  const g = toRetirement(3);
  g.run(5, 1);
  const text = g.serialize();
  const p = parse(text);
  assert.equal(p.ok, true);
  const g2 = mk({ save: p.state });
  assert.equal(g2.serialize().replace(/"savedAt":\d+/, ''), text.replace(/"savedAt":\d+/, ''));
});

test('save: every fixture loads or fails safely', () => {
  const v1 = parse(fx('save-v1.json'));
  assert.equal(v1.ok, true);
  assert.equal(v1.migratedFrom, 1);
  assert.equal(v1.state.v, SAVE_VERSION);
  const g = mk({ save: v1.state });
  assert.equal(g.state.lines.lemonade.lv, 12);
  assert.equal(g.state.lines.lemonade.boost, 1);
  assert.equal(g.state.life.homeTier, 1);
  assert.equal(g.stats('lemonade').managed, true);
  g.run(10, 1);
  assert.ok(g.state.cash > 1234.5);
  const v2 = parse(fx('save-v2.json'));
  assert.equal(v2.ok, true);
  assert.equal(v2.migratedFrom, undefined);
  assert.ok(mk({ save: v2.state }).stats('lemonade').level >= 11);
  assert.equal(parse(fx('save-corrupt.txt')).reason, 'corrupt');
  assert.equal(parse(fx('save-future.json')).reason, 'future');
  assert.equal(parse(fx('save-foreign.json')).reason, 'foreign');
  assert.equal(parse('').reason, 'empty');
});

test('save store: corrupt save is quarantined and never overwritten until the player acts', () => {
  const raw = fx('save-corrupt.txt');
  const st = memStorage({ [KEYS.main]: raw });
  const store = createSaveStore(st);
  const r = store.load();
  assert.equal(r.ok, false);
  assert.equal(store.persistence, 'armed');
  const q = [...st.m.keys()].filter((k) => k.startsWith(KEYS.quarantine));
  assert.equal(q.length, 1);
  assert.equal(st.getItem(q[0]), raw);
  assert.equal(store.write('{"game":"il2","v":2,"savedAt":5,"s":{}}'), false);
  assert.equal(st.getItem(KEYS.main), raw, 'storage key untouched');
  store.arm();
  assert.equal(store.write('{"game":"il2","v":2,"savedAt":5,"s":{}}'), true);
});

test('save store: corrupt main falls back to the backup', () => {
  const st = memStorage({ [KEYS.main]: fx('save-corrupt.txt'), [KEYS.bak]: fx('save-v2.json') });
  const store = createSaveStore(st);
  const r = store.load();
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
  assert.equal(store.write('{"game":"il2","v":2,"savedAt":9,"s":{}}'), false);
  assert.equal(st.getItem(KEYS.main), raw);
});

test('save store: backup rotation is throttled to every 5 minutes', () => {
  const st = memStorage();
  const store = createSaveStore(st);
  const env = (at) => JSON.stringify({ game: 'il2', v: 2, savedAt: at, s: { n: at } });
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
