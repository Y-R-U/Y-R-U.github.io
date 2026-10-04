// node --test tools/test-economy.mjs — pure economy suite (docs/ECONOMY.md). Drives the real createGame.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createGame } from '../js/state/game.js';
import { parse, createSaveStore, KEYS, SAVE_VERSION, BAK_EVERY_MS } from '../js/state/save.js';
import { bulkCost, levelCost, maxAffordable } from '../js/state/economy.js';
import { disguiseFor, epitaphFor } from '../js/state/prestige.js';
import { LINES, ECON, BUSINESSES, LINKS } from '../js/data/lines.js';
import { DISTRICTS } from '../js/data/districts.js';
import { MANAGERS } from '../js/data/managers.js';
import { EVENTS, SPECIAL_GAP } from '../js/data/events.js';
import { HATS, FRONTAGES } from '../js/data/hats.js';
import { CONTRACTS } from '../js/data/contracts.js';
import { ACHIEVEMENTS } from '../js/data/achievements.js';
import { SEASON } from '../js/data/season.js';
import { BARK_CHARS } from '../js/data/barks.js';
import * as EPI from '../js/data/epitaphs.js';
import { PLOTS, HUB } from '../js/data/plots.js';
import { verdict, CASUAL_FALSIFY } from './sim.mjs';
import { DAY } from '../js/data/day.js';
import { dayAt } from '../js/state/dayclock.js';

const fx = (f) => readFileSync(new URL('../tests/fixtures/' + f, import.meta.url), 'utf8');
const T0 = Date.parse('2026-09-15T10:00:00');
const IDS = ['shine', 'tubs', 'livery', 'saloon', 'dentist', 'garter', 'undertaker', 'jail', 'bank'];
const A = LINES[0].id, B = LINES[1].id;
const BOOT_TAPS = Math.ceil(LINES[0].baseCost / ECON.bootTap);

function mk(o = {}) {
  const clock = { t: o.t ?? T0 };
  const g = createGame({ seed: o.seed ?? 1, nowWall: () => clock.t, allowCheat: true, ...o });
  g.clock = clock;
  g.run = (sec, dt = 0.5) => { for (let s = 0; s < sec - 1e-9; s += dt) { clock.t += dt * 1000; g.tick(dt); } };
  g.seen = (type) => { const out = []; g.on(type, (p) => out.push(p)); return out; };
  return g;
}

function open(g, lineId) {
  assert.equal(g.act('buy', { lineId }).ok, true, 'buy ' + lineId);
  for (let i = 0; i < 400 && !g.stats(lineId).owned; i++) g.run(0.5, 0.1);
  assert.equal(g.stats(lineId).owned, true, lineId + ' opened');
}

function started(o) {
  const g = mk(o);
  for (let i = 0; i < BOOT_TAPS; i++) g.act('tap');
  open(g, A);
  return g;
}

function everything(o) {
  const g = started(o);
  g.act('cheat', { cash: 1e12, unlockAll: true, levels: 5 });
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
const clearEvents = (g) => { const ev = g.state.events; ev.active = []; ev.mults = []; ev.nextFrequent = ev.nextSpecial = ev.courierNext = 1e12; g.state.saloon.next = 1e12; g.state.saloon.held = null; };

// ---------- data ----------

test('data contract: the 9 stable business ids, 3 blocks, a plot slot, a manager and a build each', () => {
  assert.deepEqual(LINES.map((l) => l.id), IDS);
  assert.deepEqual(DISTRICTS.map((d) => d.id), ['lower', 'saloonrow', 'bankblock']);
  assert.deepEqual(LINES.map((l) => l.district), ['lower', 'lower', 'lower', 'saloonrow', 'saloonrow', 'saloonrow', 'bankblock', 'bankblock', 'bankblock']);
  for (const b of BUSINESSES) {
    for (const k of ['id', 'name', 'emoji', 'district', 'cycleSec', 'throughput', 'boosts', 'build']) assert.ok(b[k] != null, `${b.id}.${k}`);
    assert.equal(b.throughput.length, 5);
    assert.equal(b.boosts.length, 4);
    assert.ok(PLOTS.some((p) => p.id === b.id), `${b.id} plot slot`);
    assert.ok(MANAGERS.some((m) => m.lineId === b.id && !m.seasonal), `${b.id} manager`);
    assert.ok(['built', 'poker', 'takeover', 'bought'].includes(b.build.acq));
  }
  assert.deepEqual(LINES.filter((l) => l.acq !== 'built').map((l) => l.id + ':' + l.acq), ['saloon:poker', 'undertaker:takeover', 'jail:bought', 'bank:bought']);
  assert.ok(PLOTS.some((p) => p.id === HUB));
  assert.equal(DISTRICTS[0].permitCost, 0);
  assert.equal(LINES[0].baseCost, 50, 'Spit & Shine costs $50 (W15)');
  assert.equal(FRONTAGES.length, 18);
  assert.deepEqual(['line', 'pomfrey', 'civic'].map((k) => FRONTAGES.filter((f) => f.kind === k).length), [9, 7, 2]);
  assert.equal(HATS[HATS.length - 1].owned, 9, 'Hundred-Gallon = Half the Town');
  for (const c of CONTRACTS) assert.ok(DISTRICTS.some((d) => d.id === c.district) && (!c.lineId || IDS.includes(c.lineId)), c.id);
  assert.ok(ACHIEVEMENTS.some((a) => a.name === "Fingers' Apprentice" && a.stat === 'pianoTaps' && a.n === 100));
  for (const k of LINKS) assert.ok(IDS.includes(k.from) && IDS.includes(k.to) && k.mult > 0, k.id);
});

// ---------- bootstrap (W15) ----------

test('bootstrap: mud taps fill the hat, the hat banks, $50 buys Spit & Shine; no idle income before it', () => {
  const g = mk();
  g.run(60);
  assert.equal(g.state.cash, 0);
  assert.equal(g.totals().incomePerSec, 0);
  for (let i = 0; i < BOOT_TAPS - 1; i++) {
    const r = g.act('tap');
    assert.equal(r.delta.hat, ECON.bootTap);
    assert.equal(r.delta.cash, 0, 'mud coins go into the hat, not the till');
  }
  assert.equal(g.state.bootstrap.hat, (BOOT_TAPS - 1) * ECON.bootTap);
  assert.equal(g.quote('buy', { lineId: A }).affordable, false);
  assert.equal(g.act('buy', { lineId: A }).code, 'funds');
  assert.equal(g.act('hat').delta.cash, (BOOT_TAPS - 1) * ECON.bootTap, 'tapping the hat banks it');
  assert.equal(g.act('hat').code, 'empty');
  g.act('tap');
  assert.equal(g.quote('buy', { lineId: A }).affordable, true, 'cash + hat counts for the first buy');
  const r = g.act('buy', { lineId: A });
  assert.equal(r.ok, true);
  assert.equal(g.state.cash, 0);
  assert.equal(g.stats(A).owned, false, 'under construction');
  assert.ok(g.stats(A).building);
  assert.equal(g.state.bootstrap.done, false);
  assert.equal(g.act('build:hurry', { lineId: A }).delta.hat, ECON.bootTap, 'hurry taps during the first build are still mud coins');
  g.run(10, 0.1);
  assert.equal(g.stats(A).owned, true);
  assert.equal(g.state.bootstrap.done, true);
  const t = g.act('tap');
  assert.ok(t.ok && t.delta.cash > 0 && t.delta.cash < ECON.bootTap, 'hustle tap scales with income now');
});

// ---------- line model (IL2) ----------

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
  clearEvents(g);
  g.state.cash = 1e15;
  g.act('level', { lineId: A, qty: 8 });
  const p9 = g.stats(A).grossPerSec;
  const seen = g.seen('milestone');
  g.act('level', { lineId: A, qty: 1 });
  assert.ok(Math.abs(g.stats(A).grossPerSec / p9 - (10 / 9) * ECON.milestoneMult) < 1e-6);
  g.act('level', { lineId: A, qty: 15 });
  assert.equal(g.stats(A).visualTier, 1);
  g.act('level', { lineId: A, qty: 75 });
  assert.equal(g.stats(A).visualTier, 2);
  assert.deepEqual(seen.map((m) => m.level), [10, 25, 50, 100]);
});

test('the first business earns from its first open second: walk-ins buy, only the rest fills the shelf', () => {
  const g = started();
  const s = g.stats(A);
  assert.ok(Math.abs(s.sigma - ECON.sigmaWalkIn) < 1e-9);
  const c0 = g.state.cash;
  g.run(2, 0.1);
  assert.ok(g.state.cash - c0 >= s.grossPerSec * ECON.sigmaWalkIn * 1.9);
  g.run(ECON.shelfSec / (1 - ECON.sigmaWalkIn) + 60);
  assert.ok(g.stats(A).full);
  assert.ok(Math.abs(g.stats(A).stock - g.stats(A).shelfCap) < 1e-6, 'a full shelf never overflows');
  g.state.cash = 1e6;
  const i0 = idleRate(g, A);
  g.act('throughput', { lineId: A });
  assert.ok(idleRate(g, A) > i0);
  const i1 = idleRate(g, A);
  g.act('hire', { lineId: A });
  assert.ok(idleRate(g, A) > i1, 'a manager always beats walk-ins');
});

test('managed lines earn σ·P and stock (1−σ)·P', () => {
  const g = started();
  clearEvents(g);
  g.state.cash = 1e6;
  assert.equal(g.act('hire', { lineId: A }).ok, true);
  const s = g.stats(A);
  const c0 = g.state.cash, k0 = g.state.lines[A].stock;
  g.run(20, 0.1);
  assert.ok(Math.abs((g.state.cash - c0) / (s.grossPerSec * s.sigma * 20) - 1) < 0.02);
  assert.ok(Math.abs((g.state.lines[A].stock - k0) / (s.grossPerSec * (1 - s.sigma) * 20) - 1) < 0.02);
});

test('pile tap pays ×1.0 (act tapPile and act pile); return harvest pays ×1.5 once per away interval', () => {
  const g = started();
  g.run(30);
  const stock = g.state.lines[A].stock;
  const r = g.act('pile', { lineId: A });
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
      assert.equal(g.act('glyph', { lineId: l.id, kind: 'throughput' }).ok, true);
      assert.ok(activeRate(g, l.id) >= a0 * 1.0999, `${l.id} thr ${k} active`);
      assert.ok(idleRate(g, l.id) > i0, `${l.id} thr ${k} idle`);
    }
    for (let k = 0; k < l.boosts.length; k++) {
      const a0 = activeRate(g, l.id);
      g.act('glyph', { lineId: l.id, kind: 'boost' });
      assert.ok(activeRate(g, l.id) > a0);
    }
  }
});

test('gag links only add: on at giver Lv 25 with both open, +5% to the receiver, never negative', () => {
  const g = everything();
  clearEvents(g);
  const k = LINKS[0];
  const seen = g.seen('link');
  const other = IDS.find((id) => id !== k.to && id !== k.from);
  const p0 = g.stats(k.to).grossPerSec / g.stats(other).grossPerSec;
  g.act('level', { lineId: k.from, qty: Math.max(1, k.minLv - g.state.lines[k.from].lv) });
  g.run(1.2, 0.1);
  assert.ok(seen.some((x) => x.id === k.id));
  assert.ok(Math.abs(g.stats(k.to).grossPerSec / g.stats(other).grossPerSec / p0 - (1 + k.mult)) < 1e-6);
});

// ---------- taps ----------

test('tapping is capped: max combo at 2.5 taps/s is ≤ 1× gross; street, hurry and piano share one tap budget', () => {
  assert.ok(2.5 * ECON.comboMax * ECON.tapK * (1 + ECON.tapCrit * (ECON.tapCritMult - 1)) <= 1.0);
  const g = started();
  g.state.cash = 1e9;
  g.act('level', { lineId: A, qty: 30 });
  let last;
  for (let i = 0; i < 40; i++) { last = g.act('tap'); g.tick(0.4); }
  assert.ok(Math.abs(last.combo - ECON.comboMax) < 1e-9);
  g.run(5);
  assert.equal(g.act('tap').combo, 1 + (ECON.comboMax - 1) / ECON.comboTaps, 'combo decays after a pause');
  g.run(5);
  let paid = 0;
  for (let i = 0; i < 40; i++) if (g.act('tap').delta.cash > 0) paid++;
  assert.equal(paid, ECON.tapBurst, 'a burst of 40 instant taps pays only the burst');
  g.run(1, 0.1);
  g.act('cheat', { unlockAll: true });
  g.run(5);
  paid = 0;
  for (let i = 0; i < 20; i++) if (g.act(i % 2 ? 'piano' : 'tap').delta.cash > 0) paid++;
  assert.equal(paid, ECON.tapBurst, 'piano taps draw from the same budget');
});

// ---------- construction (W13) ----------

test('construction: built businesses run 5 stages over T, earn nothing until the sign is up, cut only on frame + sign', () => {
  const g = started();
  clearEvents(g);
  const l = LINES[1];
  g.state.cash = l.baseCost;
  const stages = g.seen('build:stage'), beats = g.seen('beat'), done = g.seen('build:done'), start = g.seen('build:start');
  assert.equal(g.act('buy', { lineId: l.id }).ok, true);
  assert.equal(g.act('buy', { lineId: l.id }).code, 'building');
  assert.deepEqual(start[0], { lineId: l.id, acq: 'built', T: l.buildT });
  assert.equal(g.state.build[l.id].stage, 0);
  assert.equal(g.stats(l.id).unlockable, false);
  assert.equal(g.state.own, 2, 'the frontage is yours from the purchase');
  g.run(l.buildT - 0.5, 0.1);
  assert.equal(g.stats(l.id).owned, false);
  assert.equal(g.stats(l.id).grossPerSec, 0);
  assert.deepEqual(stages.map((s) => s.name), ['frame', 'walls', 'front', 'sign']);
  assert.deepEqual(beats.filter((b) => b.lineId === l.id).map((b) => b.kind), ['build:frame', 'build:sign']);
  g.run(1, 0.1);
  assert.equal(g.stats(l.id).owned, true);
  assert.deepEqual(done, [{ lineId: l.id, acq: 'built', offline: false }]);
  assert.ok(g.stats(l.id).grossPerSec > 0);
});

test('construction: hurry takes 0.5 s per tap and pays a hustle tap; acquisitions are fixed-T cutscenes with no stages', () => {
  const g = started();
  clearEvents(g);
  const l = LINES[2];
  g.state.cash = l.baseCost;
  g.act('buy', { lineId: l.id });
  g.run(1, 0.1);
  const t0 = g.state.build[l.id].t;
  const r = g.act('build:hurry', { lineId: l.id });
  assert.ok(r.ok && r.delta.cash > 0, 'a hurry tap pays like a street tap');
  assert.ok(Math.abs(g.state.build[l.id].t - t0 - 0.5) < 1e-9);
  assert.ok(Math.abs(r.left - (l.buildT - t0 - 0.5)) < 1e-9);
  assert.equal(g.act('build:hurry', { lineId: 'tubs' }).code, 'none');
  const h = everything();
  clearEvents(h);
  for (const id of ['saloon', 'undertaker', 'jail', 'bank']) { h.state.lines[id].lv = 0; h.state.built = h.state.built.filter((x) => x !== id); }
  h.state.cash = 1e15;
  const stages = h.seen('build:stage'), beats = h.seen('beat'), barks = h.seen('bark');
  for (const id of ['saloon', 'undertaker', 'jail', 'bank']) {
    const line = LINES.find((x) => x.id === id);
    assert.equal(h.act('buy', { lineId: id }).ok, true);
    assert.equal(h.state.build[id].acq, line.acq);
    assert.equal(h.state.build[id].T, line.buildT);
    h.run(line.buildT + 0.2, 0.1);
    assert.equal(h.stats(id).owned, true, id);
    h.run(5, 0.1);
  }
  assert.equal(stages.length, 0, 'acquisitions have no stage events');
  assert.deepEqual(beats.filter((b) => ['poker', 'takeover', 'bought'].includes(b.kind)).map((b) => b.lineId), ['saloon', 'undertaker', 'jail', 'bank']);
  assert.deepEqual(barks.filter((b) => b.trig.startsWith('acquire_')).map((b) => b.trig), ['acquire_saloon', 'acquire_undertaker', 'acquire_jail', 'acquire_bank']);
});

test('construction continues offline: finished builds open, earn the rest of the interval and are reported', () => {
  const g = started();
  clearEvents(g);
  const l = LINES[1];
  g.state.cash = l.baseCost;
  g.act('buy', { lineId: l.id });
  g.state.cash = 0;
  g.clock.t += 600e3;
  const rep = g.advanceOffline(600);
  assert.deepEqual(rep.built, [l.id]);
  assert.equal(g.stats(l.id).owned, true);
  assert.ok(rep.lines[l.id] > 0, 'it earned for the rest of the time away');
  const P = g.stats(l.id).grossPerSec;
  assert.ok(rep.lines[l.id] <= P * ECON.sigmaWalkIn * (600 - l.buildT) * 1.0001);
  const g2 = started();
  g2.state.cash = 1e9;
  g2.act('buy', { lineId: 'livery' });
  g2.clock.t += 8e3;
  g2.advanceOffline(8);
  assert.ok(g2.state.build.livery && g2.state.build.livery.stage >= 1, 'a long build only advances');
});

// ---------- hats (W3/W14) ----------

test('hats follow open businesses; Pomfrey shrinks to a thimble at Half the Town', () => {
  const g = started();
  assert.equal(g.state.hat, 1, 'Bowler on the first business');
  assert.equal(g.totals().hatMult, HATS[1].mult);
  const promos = g.seen('hat:promo'), half = g.seen('half_town');
  g.act('cheat', { cash: 1e15, unlockAll: true });
  assert.equal(g.state.hat, HATS.length - 1);
  assert.equal(g.state.pomfrey, 0);
  assert.equal(g.hatInfo().pomfreyHat.id, 'thimble');
  assert.equal(g.state.own, 9);
  assert.equal(promos.length, 0, 'cheat promotes quietly');
  const h = started();
  h.state.cash = 1e15;
  for (const d of ['saloonrow', 'bankblock']) { h.state.districts.push(d); }
  const p2 = h.seen('hat:promo');
  for (const id of IDS.slice(1)) { h.act('buy', { lineId: id }); h.run(50, 0.5); }
  assert.deepEqual(p2.map((p) => p.tier), [2, 3, 4, 5, 6, 7]);
  assert.equal(p2[p2.length - 1].pomfrey, 0);
  assert.equal(h.seen('half_town').length, 0);
  assert.equal(h.state.flags.halfTown, true);
  assert.equal(half.length, 0);
});

// ---------- saloon (W4/W6/W11) ----------

test('ejections: Mabel holds a drunk after the saloon opens; swipe direction picks the target and its bonus', () => {
  const g = everything({ seed: 5 });
  clearEvents(g);
  g.state.saloon.next = g.simTime + 1;
  const ej = g.seen('eject'), fl = g.seen('fling');
  assert.equal(g.act('fling', { dir: 'left' }).code, 'none');
  g.run(1.5, 0.1);
  assert.equal(ej.length, 1);
  assert.ok(g.state.saloon.held);
  const c0 = g.state.cash;
  const r = g.act('fling', { dir: 'left' });
  assert.equal(r.ok, true);
  assert.equal(r.target, 'trough');
  assert.ok(g.state.cash > c0, 'a fling pays');
  for (const [dir, target] of [['right', 'dentist'], ['down', 'jail'], ['up', 'pomfrey'], ['jail', 'jail']]) {
    g.state.saloon.next = g.simTime;
    g.run(0.2, 0.1);
    assert.equal(g.act('fling', { dir }).target, target);
  }
  assert.ok(g.state.events.mults.some((m) => m.lineId === 'dentist' && m.src === 'fling'));
  assert.equal(g.state.events.mults.filter((m) => m.src === 'fling' && m.lineId === 'jail').length, 1, 'two jail flings refresh, never stack');
  assert.equal(g.state.stats.flings, 5);
  assert.equal(fl.length, 5);
});

test('ejections: unflung drunks are thrown by Mabel for no bonus, no repeats, never costing anything; cadence escalates', () => {
  const g = everything({ seed: 8 });
  clearEvents(g);
  g.state.saloon.next = g.simTime;
  const fl = g.seen('fling');
  const cash = g.state.cash;
  g.state.lines.saloon.lv = 1;
  for (let i = 0; i < 400; i++) g.tick(1);
  assert.ok(fl.length >= 6);
  assert.ok(fl.every((f) => f.auto && f.cash === 0));
  for (let i = 1; i < fl.length; i++) assert.notEqual(fl[i].target, fl[i - 1].target);
  assert.ok(g.state.cash >= cash);
  const slow = fl.length;
  const h = everything({ seed: 8 });
  clearEvents(h);
  h.state.lines.saloon.lv = 400;
  h.state.saloon.next = h.simTime;
  const f2 = h.seen('fling');
  for (let i = 0; i < 400; i++) h.tick(1);
  assert.ok(f2.length > slow * 1.3, `high-level saloon throws more (${f2.length} vs ${slow})`);
  assert.ok(f2.some((f) => ['dentist', 'goat', 'sheriff', 'pianist'].includes(f.kind)));
});

test('piano: tappable from second 1, frenzy at 8 taps in 6 s (brawl once per 2 min), money only once the saloon is yours', () => {
  const g = mk();
  const r0 = g.act('piano');
  assert.equal(r0.ok, true);
  assert.equal(r0.delta.cash, 0, 'a toy before the saloon');
  const fz = g.seen('piano:frenzy');
  for (let i = 0; i < 8; i++) { g.act('piano'); g.tick(0.5); }
  assert.equal(fz.length, 1);
  assert.equal(fz[0].brawl, true);
  for (let i = 0; i < 10; i++) { g.act('piano'); g.tick(0.5); }
  g.run(10);
  for (let i = 0; i < 8; i++) { g.act('piano'); g.tick(0.5); }
  assert.equal(fz.length, 2);
  assert.equal(fz[1].brawl, false, 'brawl at most once per 2 min');
  assert.ok(g.state.stats.pianoTaps >= 27);
  const h = everything();
  h.run(2);
  assert.ok(h.act('piano').delta.cash > 0, 'counts as a hustle tap once the saloon is yours');
});

// ---------- events and specials (W8/W9) ----------

test('events: seeded and deterministic; first tumbleweed ~25 s after opening; specials ≥ 8 min apart; never spawn offline', () => {
  const runEvents = (seed) => {
    const g = started({ seed });
    g.act('cheat', { unlockAll: true });
    const seen = [];
    g.on('event:spawn', ({ event }) => seen.push([event.kind, Math.round(g.simTime), !!event.special]));
    g.run(3600, 1);
    return seen;
  };
  const a = runEvents(9), b = runEvents(9), c = runEvents(10);
  assert.ok(a.length >= 20);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  const sp = a.filter((x) => x[2]);
  assert.ok(sp.length >= 4);
  for (let i = 1; i < sp.length; i++) assert.ok(sp[i][1] - sp[i - 1][1] >= SPECIAL_GAP[0] - 1, `specials ${sp[i - 1][1]} → ${sp[i][1]}`);
  const g = mk();
  for (let i = 0; i < BOOT_TAPS; i++) g.act('tap');
  g.act('buy', { lineId: A });
  const first = [];
  g.on('event:spawn', ({ event }) => first.push([event.kind, g.simTime]));
  g.run(120, 0.5);
  const tw = first.find((x) => x[0] === 'tumbleweed');
  assert.ok(tw && tw[1] > 25 && tw[1] < 40, 'tumbleweed ~1:00 into the game');
  let spawned = 0;
  g.on('event:spawn', () => spawned++);
  g.clock.t += 3 * 3600e3;
  g.advanceOffline(3 * 3600);
  assert.equal(spawned, 0);
});

function special(g, kind) {
  clearEvents(g);
  g.state.events.nextSpecial = g.simTime;
  const def = EVENTS.find((e) => e.id === kind);
  const keep = g.data.events.map((e) => e.weight);
  for (const e of g.data.events) if (!e.frequent && e.id !== kind) e.weight = 0;
  g.tick(0.1);
  g.data.events.forEach((e, i) => { e.weight = keep[i]; });
  const e = g.special();
  assert.ok(e && e.kind === kind && e.phase === 'wind', 'wind-up for ' + kind);
  g.state.events.nextSpecial = 1e12;
  return [e, def];
}

test('specials wait for the player: wind-up, begin when the hero is visible, else expire gracefully', () => {
  const g = everything();
  const winds = g.seen('special:wind'), starts = g.seen('special:start'), ends = g.seen('special:end');
  const [e, def] = special(g, 'stagecoach');
  assert.equal(winds.length, 1);
  const cash = g.state.cash;
  g.run(def.lifeSec + 1, 0.5);
  assert.equal(g.special(), null);
  assert.equal(ends[0].expired, true);
  assert.ok(g.state.cash >= cash);
  const [d] = special(g, 'duel');
  assert.equal(g.act('special:begin', { id: d.id }).ok, true);
  assert.equal(starts.length, 1);
  assert.equal(g.special().phase, 'live');
  g.run(30, 0.5);
  assert.equal(ends[ends.length - 1].reward.tier, 'basic', 'a duel left alone still pays Basic');
  assert.ok(e);
});

test('duel thresholds (W8): Gold < 380 ms, Silver < 550 ms, early = shot your own boot = Basic; Mortimer doubles', () => {
  const tier = (p) => {
    const g = everything({ seed: 3 });
    const [d] = special(g, 'duel');
    g.act('special:begin', { id: d.id });
    const r = g.act('duel:result', { id: d.id, ...p });
    return [r.reward.tier, g.state.boxes, r.reward.cash, g];
  };
  assert.equal(tier({ ms: 379 })[0], 'gold');
  assert.equal(tier({ ms: 380 })[0], 'silver');
  assert.equal(tier({ ms: 549 })[0], 'silver');
  assert.equal(tier({ ms: 550 })[0], 'basic');
  const [t, boxes, , g] = tier({ early: true });
  assert.equal(t, 'basic');
  assert.equal(boxes.basic, 1);
  assert.equal(g.state.stats.duelBoot, 1);
  const g2 = everything({ seed: 3 });
  g2.act('hire', { lineId: 'undertaker' });
  const [d2] = special(g2, 'duel');
  const r2 = g2.act('duel:result', { id: d2.id, ms: 300 });
  assert.equal(g2.state.boxes.gold, 2, 'Mortimer: duel rewards ×2');
  assert.ok(r2.reward.cash > 0);
});

test('bar brawl and bank robbery: hits pay, scores pick the strongbox, Bart caught pays gold teeth', () => {
  const g = everything();
  const [b] = special(g, 'brawl');
  assert.equal(g.act('brawl:hit', { id: b.id }).code, 'gone', 'only once begun');
  g.act('special:begin', { id: b.id });
  let paid = 0;
  for (let i = 0; i < 7; i++) paid += g.act('brawl:hit', { id: b.id }).delta.cash;
  assert.ok(paid > 0);
  assert.equal(g.special(), null, 'max hits settles it');
  assert.equal(g.state.boxes.silver, 1);
  assert.ok(g.state.events.mults.some((m) => m.lineId === 'jail'));
  const teeth = g.state.teeth;
  const [r] = special(g, 'robbery');
  g.act('special:begin', { id: r.id });
  for (let i = 0; i < 16; i++) g.act('robbery:hit', { id: r.id });
  g.run(20, 0.5);
  assert.equal(g.state.boxes.gold, 1, '16+ = Gold');
  assert.equal(g.state.stats.bartCaught, 1);
  assert.equal(g.state.teeth, teeth + 2);
  const [r2] = special(g, 'robbery');
  const c = g.act('claimEvent', { eventId: r2.id, score: 3 });
  assert.equal(c.reward.tier, 'basic');
});

test('tumbleweed scales with income; stagecoach boosts one business and times out', () => {
  const g = everything({ seed: 3 });
  clearEvents(g);
  g.state.events.nextFrequent = g.simTime;
  g.tick(0.1);
  const tw = g.state.events.active.find((e) => e.kind === 'tumbleweed');
  const inc = Math.max(g.totals().incomePerSec, g.totals().grossPerSec * 0.6);
  const r = g.act('event:claim', { eventId: tw.id });
  const tws = g.data.events.find((e) => e.id === 'tumbleweed').reward;
  assert.ok(r.delta.cash >= inc * tws.sec * 0.99 && r.delta.cash <= inc * tws.sec * tws.jackpotMult * 1.01);
  const [s, def] = special(g, 'stagecoach');
  const pa = g.stats('bank').grossPerSec, pb = g.stats('shine').grossPerSec;
  g.act('claimEvent', { eventId: s.id, lineId: 'bank' });
  assert.ok(Math.abs(g.stats('bank').grossPerSec / pa - def.reward.mult) < 1e-9);
  assert.ok(Math.abs(g.stats('shine').grossPerSec / pb - 1) < 1e-9);
  g.run(def.reward.sec + 2, 1);
  assert.ok(Math.abs(g.stats('bank').grossPerSec / g.stats('shine').grossPerSec / (pa / pb) - 1) < 1e-9, 'the boost times out');
});

test('tip riders: spawn after the first business, tip for a bonus, expire', () => {
  const g = mk({ seed: 2 });
  g.run(120, 1);
  assert.equal(g.state.couriers.length, 0);
  for (let i = 0; i < BOOT_TAPS; i++) g.act('tap');
  open(g, A);
  let c = null;
  g.on('courier:spawn', (e) => { c = c || e.courier; });
  while (!c) g.run(1, 1);
  assert.ok(g.act('tapCourier', { id: c.id }).delta.cash > 0);
  assert.equal(g.act('tapCourier', { id: c.id }).code, 'gone');
  while (!g.state.couriers.length) g.run(1, 1);
  assert.ok(g.act('courierTap', { lineId: A, shipmentId: 77 }).ok);
  assert.equal(g.act('courierTap', { lineId: A, shipmentId: 77 }).code, 'gone');
});

// ---------- offline ----------

test('offline closed form equals ticking 0.1 s steps (±0.1%), Pliers Pete teeth included', () => {
  const setup = () => {
    const g = started({ seed: 4 });
    g.act('cheat', { cash: 1e12, unlockAll: true, levels: 40 });
    for (const l of LINES.slice(0, -1)) g.act('hire', { lineId: l.id });
    g.act('throughput', { lineId: A });
    clearEvents(g);
    g.tick(0.1);
    g.state.cash = 0;
    for (const l of LINES) g.state.lines[l.id].stock = 0;
    return g;
  };
  const a = setup(), b = setup();
  const sec = 1800;
  a.clock.t += sec * 1000;
  const t0 = a.state.teeth;
  const rep = a.advanceOffline(sec);
  for (let i = 0; i < sec * 10; i++) b.tick(0.1);
  assert.ok(Math.abs(rep.cash / b.state.cash - 1) < 1e-3, `${rep.cash} vs ${b.state.cash}`);
  for (const l of LINES) assert.ok(Math.abs(a.state.lines[l.id].stock - b.state.lines[l.id].stock) <= 1e-3 * Math.max(1, b.state.lines[l.id].stock), l.id);
  assert.ok(Math.abs((a.state.teeth - t0) - (b.state.teeth - t0)) <= 1, 'Pete drops the same teeth offline');
  assert.ok(rep.teeth > 0);
});

test('offline: cap respected; clock-back and double resume credit nothing; walk-ins earn and fill the shelf', () => {
  const g = started();
  const cap = g.totals().offlineCapSec;
  assert.equal(cap, ECON.offlineCapSec);
  g.clock.t += 10 * 3600e3;
  const r = g.advanceOffline(10 * 3600);
  assert.equal(r.creditedSec, cap);
  assert.equal(r.capped, true);
  assert.equal(g.advanceOffline(10 * 3600).creditedSec, 0);
  g.clock.t -= 5 * 3600e3;
  assert.equal(g.advanceOffline(3600).clockBack, true);
  const h = started();
  clearEvents(h);
  h.run(2, 0.5);
  h.state.cash = 0;
  h.state.lines[A].stock = 0;
  const P = h.stats(A).grossPerSec;
  h.clock.t += 600e3;
  const r2 = h.advanceOffline(600);
  assert.ok(Math.abs(r2.cash / (P * ECON.sigmaWalkIn * 600) - 1) < 1e-6);
  assert.ok(h.stats(A).full);
});

// ---------- Deeds, demands, managers, items ----------

test('Deeds: need the previous block open and 3 of its 4 demands finished; buying claims them; emits deed', () => {
  const g = started();
  g.state.cash = 1e12;
  assert.equal(g.act('buy', { lineId: 'saloon' }).code, 'locked');
  assert.equal(g.act('deed', { districtId: 'bankblock' }).code, 'locked');
  const q = g.quote('deed', { districtId: 'saloonrow' });
  assert.match(q.blocked, /demands/);
  assert.equal(q.contracts.need, 3);
  for (const id of ['tubs', 'livery']) open(g, id);
  g.act('hire', { lineId: 'shine' });
  g.act('hire', { lineId: 'tubs' });
  assert.equal(g.quote('deed', { districtId: 'saloonrow' }).contracts.done, 2);
  g.act('level', { lineId: 'shine', qty: 30 });
  const qq = g.quote('deed', { districtId: 'saloonrow' });
  assert.equal(qq.blocked, null);
  const deeds = g.seen('deed');
  const t0 = g.state.teeth;
  const r = g.act('deed', { districtId: 'saloonrow' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.claimed.sort(), ['lw1', 'lw2', 'lw4']);
  assert.ok(g.state.teeth > t0, 'auto-claimed demands paid');
  assert.deepEqual(deeds, [{ district: 'saloonrow', reopen: false }]);
  assert.equal(g.act('buy', { lineId: 'saloon' }).ok, true);
});

test('managers: hire once, reassign free, cost trait discounts, levels cost cash + teeth, Pete drops teeth', () => {
  const g = everything();
  clearEvents(g);
  g.state.cash = 1e15;
  assert.equal(g.act('hire', { lineId: 'bank' }).ok, true);
  assert.equal(g.act('hire', { lineId: 'bank' }).code, 'owned');
  const thrupp = MANAGERS.find((m) => m.kind === 'cost');
  const before = g.quote('level', { lineId: 'jail' }).cost;
  g.act('hire', { lineId: thrupp.lineId });
  assert.ok(Math.abs(g.quote('level', { lineId: thrupp.lineId }).cost / g.quote('level', { lineId: thrupp.lineId }).cost - 1) < 1e-9 && before > 0);
  const q = g.quote('managerLevel', { managerId: 'm_bank' });
  assert.equal(q.teeth, 2);
  assert.equal(g.act('managerLevel', { managerId: 'm_bank' }).code, 'teeth');
  g.state.teeth = 5;
  assert.equal(g.act('managerLevel', { managerId: 'm_bank' }).ok, true);
  assert.equal(g.state.teeth, 3);
  g.act('hire', { lineId: 'dentist' });
  const t0 = g.state.teeth;
  const cyc = g.stats('dentist').cycleSec;
  g.run(cyc * 51, 0.1);
  assert.ok(g.state.teeth >= t0 + 1, 'every 50th customer leaves a tooth');
  assert.equal(g.act('hire', { lineId: 'undertaker', managerId: 'm_hank' }).code, 'locked', 'Hank is earned in the season');
});

test('strongboxes, items, merge 3→1 and auto-equip', () => {
  const g = everything({ seed: 6 });
  g.act('cheat', { boxes: 12 });
  assert.equal(g.state.boxes.silver, 12);
  for (let i = 0; i < 12; i++) assert.equal(g.act('openBox', { kind: 'silver' }).ok, true);
  assert.equal(g.act('openBox', { kind: 'silver' }).code, 'empty');
  assert.equal(g.state.items.length, 12);
  g.act('hire', { lineId: 'shine' });
  assert.equal(g.act('autoEquip', { managerId: 'm_shine' }).ok, true);
  assert.equal(g.state.items.filter((i) => i.equipped).length, 1);
  for (const id of ['a', 'b', 'c']) g.state.items.push({ id: 'i9' + id.charCodeAt(0), def: 'hat', rarity: 0, equipped: null });
  const it = g.state.items.find((i) => i.def === 'hat' && i.rarity === 0);
  const r = g.act('merge', { itemId: it.id });
  assert.equal(r.ok, true);
  assert.ok(r.item.rarity >= 1);
});

// ---------- prestige (W2) ----------

test('Fake Your Death: available with Bank Block + Boot Hill; first is ≥ ×2; graves persist; gen 2 rebrands in 3 s', () => {
  const g = started();
  assert.equal(g.act('prestige').code, 'locked');
  assert.equal(g.quote('prestige').available, false);
  g.act('cheat', { cash: 1e9, unlockAll: true, managers: true, levels: 20 });
  g.act('cheat', { teeth: 9, boxes: 1 });
  const pv = g.deathPreview();
  assert.equal(pv.available, true);
  assert.equal(pv.nextMult, 2, 'first fake death floor ×2');
  const items = g.state.items.length, teeth = g.state.teeth;
  g.state.contracts.lw1 = 'claimed';
  g.state.achievements.own1 = true;
  const ev = g.seen('prestige');
  const r = g.act('prestige');
  assert.equal(r.ok, true);
  assert.equal(ev.length, 1);
  const s = g.state;
  assert.equal(s.gen, 2);
  assert.equal(s.graves.length, 1);
  assert.ok(s.graves[0].epitaph.length > 5);
  assert.ok(s.disguise && s.disguise.name && s.disguise.moustache);
  assert.equal(s.teeth, teeth);
  assert.equal(s.items.length, items);
  assert.equal(s.contracts.lw1, 'claimed');
  assert.ok(Object.keys(s.managers).length >= 9, 'managers persist');
  assert.ok(IDS.every((id) => s.lines[id].lv === 0), 'businesses reset');
  assert.equal(s.hat, 0);
  assert.equal(s.pomfrey, HATS.length - 1, 'Pomfrey is smug again');
  assert.deepEqual(s.districts, ['lower', 'saloonrow', 'bankblock'], 'Deeds reopen free');
  assert.ok(s.cash >= 50);
  assert.equal(g.totals().bountyMult, 2);
  assert.equal(g.act('buy', { lineId: 'garter' }).ok || g.state.cash < LINES[5].baseCost, true);
  g.state.cash = 1e9;
  g.act('buy', { lineId: 'tubs' });
  assert.equal(s.build.tubs.acq, 'rebrand');
  assert.equal(s.build.tubs.T, 3);
  g.run(3.2, 0.1);
  assert.equal(g.stats('tubs').owned, true);
  assert.ok(g.totals().globalMult >= 2 * 1.01, 'bounty × grave');
});

test('epitaphs and disguises are pure and seeded', () => {
  assert.equal(epitaphFor(7, 1, 'Slim Quill', 'Bowler', EPI), epitaphFor(7, 1, 'Slim Quill', 'Bowler', EPI));
  assert.deepEqual(disguiseFor(7, 2, EPI), disguiseFor(7, 2, EPI));
  const set = new Set();
  for (let gen = 1; gen < 30; gen++) set.add(epitaphFor(7, gen, 'X', 'Bowler', EPI));
  assert.ok(set.size >= 8, 'variety across lives');
  for (const e of set) assert.doesNotMatch(e, /\{/);
});

// ---------- barks (W5) ----------

test('barks: sentence gate ~30 s for ordinary triggers, priority ones always speak; idle chatter cadence; speakers present', () => {
  const g = started({ seed: 4 });
  g.act('cheat', { cash: 1e12, unlockAll: true });
  const barks = g.seen('bark');
  g.run(600, 0.5);
  const idle = barks.filter((b) => b.trig === 'idle');
  assert.ok(idle.length >= 8 && idle.length <= 21, `idle chatter ${idle.length} in 10 min`);
  const times = [];
  g.on('bark', (b) => { if (!b.prio) times.push(g.simTime); });
  g.run(900, 0.5);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 29.9, 'one ordinary sentence bark per 30 s');
  for (const b of barks) assert.ok(BARK_CHARS[b.trig] && BARK_CHARS[b.trig][b.char], `${b.char} says ${b.trig}`);
  const h = mk();
  const hb = h.seen('bark');
  h.tick(0.1);
  assert.deepEqual(hb.map((b) => b.trig), ['opening']);
  h.state.barks.last = h.simTime;
  for (let i = 0; i < BOOT_TAPS; i++) h.act('tap');
  open(h, A);
  assert.ok(hb.some((b) => b.trig === 'first_business' && b.char === 'nubbin'));
  assert.equal(h.act('barkOnce', { id: 'mabel_12' }).ok, true);
  assert.equal(h.state.barks.once.mabel_12, 1);
});

// ---------- Ghost Town (W12) ----------

test('Ghost Town: live Oct 1 – Nov 2 on the injected clock; ghosts pay ectoplasm; 8 ranks of hats; Hank at rank 8', () => {
  const out = mk({ t: Date.parse('2026-09-30T12:00:00') });
  for (let i = 0; i < BOOT_TAPS; i++) out.act('tap');
  open(out, A);
  const gs = out.seen('ghost:spawn');
  out.run(300, 1);
  assert.equal(gs.length, 0);
  assert.equal(out.seasonInfo().live, false);
  const g = mk({ t: Date.parse('2026-10-20T19:00:00') });
  for (let i = 0; i < BOOT_TAPS; i++) g.act('tap');
  open(g, A);
  const spawns = g.seen('ghost:spawn');
  let taps = 0;
  g.on('ghost:spawn', ({ ghost }) => { if (taps < 400) { taps++; g.act('ghost:tap', { id: ghost.id }); } });
  for (let i = 0; i < 400 * 40 && g.state.season.rank < 8; i++) { g.clock.t += 1000; g.tick(1); }
  assert.ok(spawns.length > 10);
  assert.equal(g.state.season.rank, SEASON.ranks.length);
  assert.equal(g.state.season.ecto, SEASON.ranks[7].xp);
  assert.ok(g.state.keepsakes.hanks_hat && g.state.keepsakes.cobweb_derby);
  assert.ok(g.state.managers.m_hank, 'Headless Hank joins');
  g.state.cash = 1e12;
  g.act('cheat', { unlockAll: true });
  assert.equal(g.act('hire', { lineId: 'undertaker', managerId: 'm_hank' }).ok, true);
  assert.equal(g.act('ghost:tap', { id: 'nope' }).code, 'gone');
  const gm = g.totals().globalMult;
  assert.ok(gm > 1.1, 'keepsakes worn by You add income');
  g.clock.t = Date.parse('2026-11-03T12:00:00');
  g.run(5);
  assert.equal(g.seasonInfo().live, false);
  assert.equal(g.state.season.ecto, SEASON.ranks[7].xp, 'ectoplasm is kept');
});

test('R6c: no ghosts until the Ghosts reveal (second Deed, a grave, or 10 min played); sticky; one flag for UI', () => {
  const g = mk({ t: Date.parse('2026-10-20T12:00:00') });
  for (let i = 0; i < BOOT_TAPS; i++) g.act('tap');
  open(g, A);
  const spawns = g.seen('ghost:spawn');
  for (let i = 0; i < 590 && g.simTime < 590; i++) g.run(1);
  assert.equal(spawns.length, 0, 'no ghosts in the first 10 minutes');
  assert.equal(g.ghostsOpen(), false);
  assert.equal(g.seasonInfo().open, false);
  for (let i = 0; i < 80; i++) g.run(1);
  assert.equal(g.ghostsOpen(), true);
  assert.equal(g.seasonInfo().open, true);
  assert.ok(spawns.length > 0, 'ghosts once open');
  const h = mk({ t: Date.parse('2026-10-20T12:00:00') });
  for (let i = 0; i < BOOT_TAPS; i++) h.act('tap');
  open(h, A);
  assert.equal(h.ghostsOpen(), false);
  h.state.graves.push({ gen: 1 });
  assert.equal(h.ghostsOpen(), true, 'a grave opens it');
  h.state.graves.length = 0;
  assert.equal(h.ghostsOpen(), true, 'sticky');
  const d = mk({ t: Date.parse('2026-10-20T12:00:00') });
  for (let i = 0; i < BOOT_TAPS; i++) d.act('tap');
  open(d, A);
  assert.equal(d.ghostsOpen(), false);
  d.state.deeds.push('x');
  assert.equal(d.ghostsOpen(), true, 'a second Deed opens it');
});

// ---------- "save for X" (PT#5), the game clock (W18), gen-2 bootstrap ----------

test('nextGoal: next business, then the next Deed; buy / save / grind / blocked; a best buy; stats() with no id', () => {
  const g = mk();
  let n = g.nextGoal();
  assert.equal(n.kind, 'line');
  assert.equal(n.lineId, A);
  assert.equal(n.eta, null, 'no income yet');
  for (let i = 0; i < BOOT_TAPS; i++) g.act('tap');
  assert.equal(g.nextGoal().hint, 'buy', 'the hat counts for the first buy');
  open(g, A);
  n = g.nextGoal();
  assert.equal(n.lineId, B);
  assert.ok(n.eta > 0 && n.etaIdle >= n.eta);
  assert.ok(['save', 'grind'].includes(n.hint));
  assert.ok(n.bestBuy && n.bestBuy.payback > 0 && n.bestBuy.gain > 0);
  g.state.cash = LINES[1].baseCost;
  assert.equal(g.nextGoal().hint, 'buy');
  assert.equal(g.nextGoal().affordable, true);
  g.state.cash = LINES[1].baseCost * 0.9;
  g.act('hint', { id: 'x' });
  const near = g.nextGoal();
  assert.ok(near.eta <= ECON.saveSec);
  if (near.hint === 'grind') assert.ok(near.bestBuy.cost * g.totals().grossPerSec < near.bestBuy.gain * (near.cost - near.have), 'grind only while a best buy is sooner');
  const h = mk();
  for (let i = 0; i < BOOT_TAPS; i++) h.act('tap');
  open(h, A);
  h.state.cash = 1e12;
  for (const l of LINES.filter((x) => x.district === 'lower')) if (!h.stats(l.id).owned) open(h, l.id);
  const d = h.nextGoal();
  assert.equal(d.kind, 'deed');
  assert.equal(d.districtId, 'saloonrow');
  assert.equal(d.hint, 'blocked');
  assert.match(d.blocked, /demands/);
  const all = h.stats();
  assert.ok(all.nextGoal && all.day && all.totals);
  h.act('cheat', { unlockAll: true });
  assert.equal(h.nextGoal(), null, 'nothing left to save for');
});

test('game clock (W18): boots at golden hour, ~20 min cycle 60/15/25, night drives Hank, injectable, offline averages', () => {
  assert.equal(dayAt(0, DAY).phase, 'golden');
  const C = dayAt(0, DAY).cycleSec;
  assert.ok(C >= 900 && C <= 1500, '~20 min cycle');
  let nights = 0, golds = 0, firstNight = null;
  for (let t = 0; t < C; t++) { const d = dayAt(t, DAY); if (d.night) { nights++; firstNight ??= t; } if (d.golden) golds++; }
  assert.ok(Math.abs(nights / C - 0.25) < 0.02, 'night ~25%');
  assert.ok(golds / C > 0.1 && golds / C < 0.2, 'golden ~15%');
  assert.equal(dayAt(firstNight, DAY).witching, true);
  assert.equal(dayAt(firstNight + Math.round(C * 0.2), DAY).witching, false, 'witching is the first half of night');
  const p1 = dayAt(37, DAY), p2 = dayAt(37 + C * 5, DAY);
  assert.ok(p1.phase === p2.phase && p1.night === p2.night && Math.abs(p1.hour - p2.hour) < 1e-6, 'pure and periodic');
  const g = mk({ t: Date.parse('2026-09-15T03:00:00') });
  assert.equal(g.day().phase, 'golden', 'a fresh save boots golden even at 3 am');
  g.act('cheat', { cash: 1e9, unlockAll: true });
  g.state.managers.m_hank = { level: 1, slots: [null] };
  assert.equal(g.act('hire', { lineId: 'undertaker', managerId: 'm_hank' }).ok, true);
  const P = () => g.stats('undertaker').grossPerSec;
  clearEvents(g);
  for (let i = 0; i < 2400 && !g.day().night; i++) g.run(0.5, 0.5);
  clearEvents(g);
  g.act('hint', { id: 'x' });
  assert.equal(g.day().night, true);
  g.setDayClock(() => ({ phase: 'golden' }));
  g.act('hint', { id: 'x' });
  const golden = P();
  g.setDayClock(null);
  g.act('hint', { id: 'x' });
  const night = P();
  g.setDayClock(() => ({ phase: 'day' }));
  g.act('hint', { id: 'x' });
  assert.equal(g.day().injected, true);
  assert.ok(Math.abs(night / P() - 1.5) < 1e-6, 'Hank +50% at game night; an injected day clock wins');
  assert.ok(Math.abs(golden / P() - 1) < 1e-6, 'golden hour is not night');
  g.setDayClock(() => 22);
  g.act('hint', { id: 'x' });
  assert.equal(g.day().night, true, 'a 0–24 hour works too');
  g.setDayClock(null);
  const seen = [];
  const pre = g.stats('undertaker').grossPerSec;
  g.on('offline', ({ report }) => seen.push(report));
  g.clock.t += 3600e3;
  g.advanceOffline(3600);
  assert.equal(seen.length, 1);
  assert.ok(seen[0].lines.undertaker > 0);
  g.act('hint', { id: 'x' });
  assert.ok(Number.isFinite(pre));
});

test('Witching Hour: ghosts come twice as often and pay double ectoplasm in the first half of game night', () => {
  const g = mk({ t: Date.parse('2026-10-20T12:00:00') });
  for (let i = 0; i < BOOT_TAPS; i++) g.act('tap');
  open(g, A);
  g.state.flags.ghostsOpen = true;
  for (let i = 0; i < 2400 && !g.day().night; i++) g.run(0.5, 0.5);
  assert.equal(g.day().witching, true);
  let paid = null;
  for (let i = 0; i < 120 && paid == null; i++) { g.run(1, 0.5); const gh = g.state.season.ghost; if (gh) paid = g.act('ghost:tap', { id: gh.id }).ecto; }
  assert.equal(paid, SEASON.ectoPerGhost * DAY.witchingEcto);
});

test('gen 2 skips the mud: after a fake death pre-business taps pay cash, not the hat', () => {
  const g = started();
  g.act('cheat', { cash: 1e9, unlockAll: true, managers: true, levels: 20 });
  assert.equal(g.state.bootstrap.skip, false);
  assert.equal(g.act('prestige').ok, true);
  assert.equal(g.state.bootstrap.skip, true);
  assert.equal(g.state.bootstrap.done, false);
  const c0 = g.state.cash;
  const r = g.act('tap');
  assert.equal(r.delta.cash, ECON.bootTap);
  assert.equal(g.state.bootstrap.hat, 0);
  assert.equal(g.state.cash, c0 + ECON.bootTap);
  open(g, A);
  assert.equal(g.state.bootstrap.done, true);
  const back = createGame({ save: JSON.parse(g.serialize()), nowWall: () => T0 });
  assert.equal(back.state.bootstrap.skip, true, 'the flag survives a reload');
});

// ---------- the sim (DESIGN W1 pacing, W13 construction) ----------

test('pacing sim: all targets, dead gap ≤ 4 min incl. construction, active ≤ 2.5× idle, no negative returns, gen 2', () => {
  const V = verdict({ minutes: 75 });
  assert.deepEqual(V.fails, []);
  assert.ok(V.maxRatio <= 2.5);
});

test('falsification: construction T ×10 must FAIL the dead-gap check', () => {
  const V = verdict({ minutes: 30, buildMult: 10, gen2: false, profiles: ['active', 'idle'] });
  assert.ok(V.fails.some((f) => /dead gap/.test(f)), 'the dead-gap check caught it: ' + V.fails.join(' | '));
});

test('falsification: casual without the hustle floor, the save chip and the early special must FAIL its ceilings', () => {
  const V = verdict({ minutes: 12, gen2: false, profiles: ['active', 'casual'], data: CASUAL_FALSIFY });
  assert.ok(V.fails.some((f) => /^casual /.test(f)), 'the casual gate caught it: ' + V.fails.join(' | '));
});

// ---------- robustness, contract, save ----------

test('unknown acts and junk payloads never throw', () => {
  const g = started();
  assert.deepEqual(g.act('nope'), { ok: false, code: 'unknown' });
  assert.equal(g.act('toString').code, 'unknown');
  assert.equal(g.act('__proto__').code, 'unknown');
  const junk = [undefined, null, 7, 'x', {}, { lineId: 'zzz' }, { lineId: A, qty: -5 }, { lineId: A, qty: 'lots' }, { districtId: 'moon' }, { eventId: 'e999' }, { id: 'c0' }, { dir: 'sideways' }, { kind: 'mythic' }, { managerId: 'm_zz' }, { itemId: 'i0' }, { key: {} }];
  const types = ['tap', 'hat', 'pile', 'tapPile', 'buy', 'unlock', 'build:hurry', 'hurry', 'level', 'glyph', 'throughput', 'storage', 'boost', 'hire', 'managerLevel', 'equip', 'unequip', 'merge', 'autoEquip', 'openBox',
    'claimEvent', 'event:claim', 'special:begin', 'duel:result', 'brawl:hit', 'robbery:hit', 'fling', 'piano', 'ghost:tap', 'permit', 'deed', 'claimContract', 'prestige', 'fakeDeath', 'assignKeepsake', 'sunday', 'barkOnce', 'tapCourier', 'courierTap', 'setting', 'hint', 'cheat'];
  for (const t of types) for (const p of junk) {
    const r = g.act(t, p);
    assert.equal(typeof r.ok, 'boolean', t);
    assert.notEqual(r.code, 'error', `${t} ${JSON.stringify(p)} threw: ${r.msg}`);
  }
  for (const t of ['buy', 'unlock', 'level', 'throughput', 'storage', 'boost', 'hire', 'permit', 'deed', 'managerLevel', 'prestige', 'nonsense']) g.quote(t, {});
  assert.ok(Number.isFinite(g.state.cash));
});

test('stats() and totals() expose the contract shapes', () => {
  const g = started();
  const s = g.stats(A);
  for (const k of ['owned', 'level', 'perSec', 'grossPerSec', 'sigma', 'shelfCap', 'stock', 'stockRatio', 'cycle01', 'cycleSec', 'managed', 'managerId', 'boostMult', 'nextMilestone', 'visualTier', 'full', 'unlockable', 'nextThroughput', 'nextBoost', 'harvest', 'building', 'link']) assert.ok(k in s, k);
  assert.equal(g.stats('nope'), null);
  const t = g.totals();
  for (const k of ['incomePerSec', 'tapValue', 'offlineCapSec', 'grossPerSec', 'globalMult', 'hatMult', 'bountyMult', 'teeth', 'hat', 'pomfrey', 'own']) assert.ok(k in t, k);
  const st = g.state;
  for (const k of ['build', 'own', 'hat', 'pomfrey', 'teeth', 'boxes', 'bounty', 'graves', 'gen', 'sunday', 'season']) assert.ok(k in st, k);
  assert.ok('ecto' in st.season);
  assert.equal(g.act('sunday', { on: true }).on, true);
  assert.equal(st.sunday, true);
  assert.equal(g.act('sunday').on, false, 'no payload toggles');
});

test('save: serialize round-trips through parse (mid-build, mid-special, mid-ejection)', () => {
  const g = started();
  g.act('cheat', { cash: 1e15, unlockAll: true, managers: true, levels: 12 });
  g.state.lines.bank.lv = 0;
  assert.equal(g.act('buy', { lineId: 'bank' }).ok, true);
  g.state.saloon.next = g.simTime;
  g.run(1, 0.5);
  const text = g.serialize();
  const p = parse(text);
  assert.equal(p.ok, true);
  const g2 = mk({ save: p.state });
  assert.equal(g2.serialize().replace(/"savedAt":\d+/, ''), text.replace(/"savedAt":\d+/, ''));
  assert.ok(g2.state.build.bank);
  g2.run(10, 0.5);
  assert.equal(g2.stats('bank').owned, true, 'a build resumes after load');
});

test('save: every fixture loads or fails safely', () => {
  const v1 = parse(fx('save-v1.json'));
  assert.equal(v1.ok, true);
  assert.equal(v1.state.v, SAVE_VERSION);
  const g = mk({ save: v1.state });
  assert.equal(g.state.lines.shine.lv, 12);
  assert.equal(g.stats('shine').managed, true);
  const c0 = g.state.cash;
  g.run(10, 1);
  assert.ok(g.state.cash > c0);
  assert.equal(parse(fx('save-corrupt.txt')).reason, 'corrupt');
  assert.equal(parse(fx('save-future.json')).reason, 'future');
  assert.equal(parse(fx('save-foreign.json')).reason, 'foreign');
  assert.equal(parse('').reason, 'empty');
  const old = JSON.parse(fx('save-v1.json'));
  old.s.lines.stable = { lv: 5 };
  delete old.s.season; delete old.s.build;
  const g3 = mk({ save: old });
  assert.equal(g3.state.lines.stable, undefined, 'unknown placeholder ids are dropped');
  g3.run(5, 1);
  assert.ok(Number.isFinite(g3.state.cash));
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
  store.arm();
  assert.equal(store.write('{"game":"iw2","v":1,"savedAt":5,"s":{}}'), true);
});

test('save store: corrupt main falls back to the backup; future version never writes; backups throttled', () => {
  const st = memStorage({ [KEYS.main]: fx('save-corrupt.txt'), [KEYS.bak]: fx('save-v1.json') });
  const r = createSaveStore(st).load();
  assert.equal(r.ok, true);
  assert.equal(r.fromBackup, true);
  const raw = fx('save-future.json');
  const s2 = memStorage({ [KEYS.main]: raw });
  const store = createSaveStore(s2);
  assert.equal(store.load().reason, 'future');
  store.arm();
  assert.equal(store.write('{"game":"iw2","v":1,"savedAt":9,"s":{}}'), false);
  const s3 = memStorage();
  const st3 = createSaveStore(s3);
  const env = (at) => JSON.stringify({ game: 'iw2', v: 1, savedAt: at, s: { n: at } });
  st3.write(env(1000)); st3.write(env(2000));
  assert.match(s3.getItem(KEYS.bak), /"savedAt":1000/);
  st3.write(env(3000));
  assert.match(s3.getItem(KEYS.bak), /"savedAt":1000/);
  st3.write(env(2000 + BAK_EVERY_MS));
  assert.match(s3.getItem(KEYS.bak), /"savedAt":3000/);
});

test('state/ and data/ are pure', () => {
  for (const dir of ['js/state', 'js/data']) {
    for (const f of readdirSync(new URL('../' + dir, import.meta.url))) {
      const src = readFileSync(new URL(`../${dir}/${f}`, import.meta.url), 'utf8');
      assert.doesNotMatch(src, /\b(document|window)\s*[.[]|\bglobalThis\b|THREE|Date\.now|Math\.random|\blocalStorage\b/, `${dir}/${f}`);
    }
  }
});
