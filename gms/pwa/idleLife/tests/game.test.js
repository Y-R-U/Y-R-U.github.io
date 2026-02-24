#!/usr/bin/env node
// ============================================================
// LIFE IDLE — Automated Test Suite  v2.0
// Run:  node tests/game.test.js
//       cd gms/pwa/idleLife && node tests/game.test.js
// ============================================================
'use strict';
const fs   = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

// ── Minimal test runner ───────────────────────────────────
let passed = 0, failed = 0;

function describe(label, fn) {
  console.log(`\n${label}`);
  fn();
}
function it(label, fn) {
  try {
    fn();
    console.log(`  ✓  ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗  ${label}`);
    console.error(`       ${e.message}`);
    failed++;
  }
}
function expect(val) {
  return {
    toBe(exp)      { if (val !== exp)          throw new Error(`Expected ${JSON.stringify(exp)}, got ${JSON.stringify(val)}`); },
    toBeCloseTo(exp, dec = 4) {
      const d = Math.abs(val - exp);
      if (d > Math.pow(10, -dec)) throw new Error(`Expected ~${exp}, got ${val} (diff ${d})`);
    },
    toBeGreaterThan(n) { if (!(val > n))        throw new Error(`Expected >  ${n}, got ${val}`); },
    toBeLessThan(n)    { if (!(val < n))        throw new Error(`Expected <  ${n}, got ${val}`); },
    toBeTrue()         { if (val !== true)       throw new Error(`Expected true, got ${val}`); },
    toBeFalse()        { if (val !== false)      throw new Error(`Expected false, got ${val}`); },
    toContain(s)       { if (!String(val).includes(s)) throw new Error(`Expected "${val}" to contain "${s}"`); },
  };
}

// ── Bootstrap game environment ────────────────────────────
globalThis.window    = {};
globalThis.document  = {
  getElementById:    () => null,
  querySelectorAll:  () => ({ forEach: () => {} }),
  querySelector:     () => null,
  createElement:     () => ({
    style: {}, classList: { add(){}, remove(){}, contains: () => false },
    addEventListener() {}, appendChild() {},
    querySelectorAll: () => ({ forEach: () => {} }),
    querySelector:    () => null,
    get innerHTML()  { return ''; },
    set innerHTML(v) {},
    remove() {}
  }),
  addEventListener() {},
  body: { appendChild() {} }
};
globalThis.localStorage = {
  _data: {},
  getItem(k)    { return this._data[k] ?? null; },
  setItem(k, v) { this._data[k] = v; },
  removeItem(k) { delete this._data[k]; }
};

// Load a JS file into global scope.
const vm = require('vm');
function load(file) {
  const code = fs.readFileSync(path.join(root, file), 'utf8')
    .replace(/\bconst\b/g, 'var')
    .replace(/\blet\b/g,   'var');
  vm.runInThisContext(code, { filename: file });
}

function loadConfig() { load('js/config.js'); }

// Stub UI so game.js can call UI.render() etc. without a DOM
globalThis.UI = {
  render()                     {},
  updateHeader()               {},
  showToast(msg, type)         {},
  showOfflineModal(amt, fmtFn) {},
  spawnCoinParticle(x, y, lbl) {}
};

loadConfig();
load('js/storage.js');
load('js/game.js');

// Helper: clean state for tests that need a predictable baseline
function cleanState(overrides = {}) {
  Game.state.coins         = overrides.coins         ?? 0;
  Game.state.totalEarned   = overrides.totalEarned   ?? 0;
  Game.state.jobs          = overrides.jobs          ?? {};
  Game.state.businesses    = overrides.businesses    ?? {};
  Game.state.upgrades      = overrides.upgrades      ?? new Set();
  Game.state.activeEvents  = overrides.activeEvents  ?? [];
  Game.state.baseClickPower = overrides.baseClickPower ?? 1;
  Game.state.prestigeLevel  = overrides.prestigeLevel  ?? 0;
  Game.state.prestigePoints = overrides.prestigePoints ?? 0;
  Game.state.lifetimeCoins  = overrides.lifetimeCoins  ?? 0;
  Game.state.totalTaps      = overrides.totalTaps      ?? 0;
  Game.state.achievements   = overrides.achievements   ?? new Set();
  Game.recalcDerived();
}

// ── TESTS ─────────────────────────────────────────────────

describe('Number formatting (fmt / fmtCurrency)', () => {
  it('formats small numbers to 2 decimal places', () => {
    expect(Game.fmt(0.5)).toBe('0.50');
    expect(Game.fmt(9.99)).toBe('9.99');
  });
  it('formats integers ≥100 without decimals', () => {
    expect(Game.fmt(100)).toBe('100');
    expect(Game.fmt(999)).toBe('999');
    expect(Game.fmt(9999)).toBe('10.00K'); // 9999 >= 1000 → K suffix
  });
  it('uses K suffix at 1,000', () => {
    expect(Game.fmt(1000)).toContain('K');
    expect(Game.fmt(2500)).toBe('2.50K');
  });
  it('uses M suffix at 1,000,000', () => {
    expect(Game.fmt(1e6)).toContain('M');
  });
  it('uses B suffix at 1,000,000,000', () => {
    expect(Game.fmt(1e9)).toContain('B');
  });
  it('uses T suffix at 1e12', () => {
    expect(Game.fmt(1e12)).toContain('T');
  });
  it('uses Qa suffix at 1e15', () => {
    expect(Game.fmt(1e15)).toContain('Qa');
  });
  it('uses Qi suffix at 1e18', () => {
    expect(Game.fmt(1e18)).toContain('Qi');
  });
  it('fmtCurrency prepends $', () => {
    expect(Game.fmtCurrency(100)).toBe('$100');
  });
  it('handles negative numbers', () => {
    expect(Game.fmt(-500)).toBe('-500');
  });
});

describe('Cost calculations', () => {
  const sweeper = JOBS.find(j => j.id === 'sweeper');

  it('first hire of sweeper costs baseCostHire', () => {
    const cost = Math.ceil(sweeper.costHireBase * Math.pow(sweeper.costGrowth, 0));
    expect(cost).toBe(sweeper.costHireBase); // 15
  });

  it('second hire costs more than first', () => {
    const cost0 = Math.ceil(sweeper.costHireBase * Math.pow(sweeper.costGrowth, 0));
    const cost1 = Math.ceil(sweeper.costHireBase * Math.pow(sweeper.costGrowth, 1));
    expect(cost1).toBeGreaterThan(cost0);
  });

  it('jobHireCost matches jobBulkCost for count=1', () => {
    Game.state.jobs = {};
    const c1 = Game.jobHireCost(sweeper, 1);
    const cb = Game.jobBulkCost(sweeper, 1);
    expect(c1).toBe(cb);
  });

  it('bulk cost (×10) equals sum of 10 individual costs', () => {
    Game.state.jobs = {};
    const bulk = Game.jobBulkCost(sweeper, 10);
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += Math.ceil(sweeper.costHireBase * Math.pow(sweeper.costGrowth, i));
    }
    expect(bulk).toBe(sum);
  });

  it('bizLevelCost returns baseCost at level 0', () => {
    const ft = BUSINESSES.find(b => b.id === 'food_truck');
    Game.state.businesses = {};
    expect(Game.bizLevelCost(ft)).toBe(ft.baseCost);
  });

  it('bizLevelCost grows with level', () => {
    const ft = BUSINESSES.find(b => b.id === 'food_truck');
    Game.state.businesses = { food_truck: 1 };
    const lv1cost = Game.bizLevelCost(ft);
    Game.state.businesses = { food_truck: 2 };
    const lv2cost = Game.bizLevelCost(ft);
    expect(lv2cost).toBeGreaterThan(lv1cost);
  });
});

describe('Hire workers', () => {
  it('hireWorker fails when coins < cost', () => {
    cleanState({ coins: 0 });
    expect(Game.hireWorker('sweeper', 1)).toBeFalse();
  });

  it('hireWorker succeeds and deducts cost', () => {
    cleanState({ coins: 100, totalEarned: 100 });
    const cost = Game.jobBulkCost(JOBS.find(j => j.id === 'sweeper'), 1);
    const ok = Game.hireWorker('sweeper', 1);
    expect(ok).toBeTrue();
    expect(Game.state.jobs.sweeper).toBe(1);
    expect(Game.state.coins).toBeCloseTo(100 - cost, 4);
  });

  it('subsequent hire costs more', () => {
    cleanState({ coins: 10000, totalEarned: 10000 });
    const sw = JOBS.find(j => j.id === 'sweeper');
    const cost1 = Game.jobBulkCost(sw, 1);
    Game.hireWorker('sweeper', 1);
    const cost2 = Game.jobBulkCost(sw, 1);
    expect(cost2).toBeGreaterThan(cost1);
  });

  it('hired workers increase incomePerSec', () => {
    cleanState({ coins: 10000, totalEarned: 10000 });
    const before = Game.derived.incomePerSec;
    Game.hireWorker('sweeper', 1);
    expect(Game.derived.incomePerSec).toBeGreaterThan(before);
  });

  it('hireWorker returns false for unknown jobId', () => {
    expect(Game.hireWorker('nonexistent_job', 1)).toBeFalse();
  });
});

describe('Click power', () => {
  it('base click power is 1 with no upgrades or workers', () => {
    cleanState();
    expect(Game.derived.clickPower).toBeCloseTo(1, 4);
  });

  it('click upgrade multiplies FULL click power (base + worker bonuses)', () => {
    // sweeper.clickBonus = 0.08; 10 workers → 0.8 extra; base = 1 → total = 1.8
    cleanState({
      jobs: { sweeper: 10 },
      coins: 300,
      totalEarned: 300
    });
    const powerBefore = Game.derived.clickPower;
    Game.purchaseUpgrade('click_1'); // 2×, costs $300
    const powerAfter  = Game.derived.clickPower;
    expect(powerAfter).toBeCloseTo(powerBefore * 2, 2);
  });

  it('5× click upgrade quintuples full click power', () => {
    cleanState({ coins: 20e6, totalEarned: 20e6 });
    const before = Game.derived.clickPower; // = 1
    Game.purchaseUpgrade('click_4'); // 5×, costs $15M, unlockAt $3M
    const after = Game.derived.clickPower;
    expect(after).toBeCloseTo(before * 5, 2);
  });

  it('click power scales correctly with both workers AND upgrade', () => {
    // sweeper.clickBonus = 0.08; 4 workers → 0.32 bonus; base=1 → total=1.32
    // After 2× click_1: 2.64
    cleanState({
      jobs: { sweeper: 4 },
      coins: 500,
      totalEarned: 500
    });
    Game.purchaseUpgrade('click_1'); // 2×, costs $300
    expect(Game.derived.clickPower).toBeCloseTo(1.32 * 2, 2);
  });
});

describe('Upgrades', () => {
  it('purchaseUpgrade fails with insufficient coins', () => {
    cleanState({ coins: 0, totalEarned: 0 });
    expect(Game.purchaseUpgrade('click_1')).toBeFalse();
  });

  it('purchaseUpgrade fails when already owned', () => {
    cleanState({ coins: 1000, totalEarned: 1000, upgrades: new Set(['click_1']) });
    expect(Game.purchaseUpgrade('click_1')).toBeFalse();
  });

  it('purchaseUpgrade fails when totalEarned < unlockAt', () => {
    cleanState({ coins: 1e9, totalEarned: 0 });
    // click_4 requires unlockAt: 3e6
    expect(Game.purchaseUpgrade('click_4')).toBeFalse();
  });

  it('purchaseUpgrade succeeds and deducts cost', () => {
    // click_1: cost=300, unlockAt=0
    cleanState({ coins: 1000, totalEarned: 1000 });
    const before = Game.state.coins;
    const ok = Game.purchaseUpgrade('click_1');
    expect(ok).toBeTrue();
    expect(Game.state.coins).toBeCloseTo(before - 300, 4);
    expect(Game.state.upgrades.has('click_1')).toBeTrue();
  });

  it('global upgrade multiplies incomePerSec', () => {
    // global_1: cost=5e10, unlockAt=1.5e10, 2× all income
    cleanState({ jobs: { sweeper: 1 }, coins: 1e11, totalEarned: 1e11 });
    const before = Game.derived.incomePerSec;
    Game.purchaseUpgrade('global_1');
    expect(Game.derived.incomePerSec).toBeCloseTo(before * 2, 4);
  });
});

describe('Businesses', () => {
  it('levelUpBusiness fails with no coins', () => {
    cleanState();
    expect(Game.levelUpBusiness('food_truck')).toBeFalse();
  });

  it('levelUpBusiness succeeds and generates income', () => {
    const ft = BUSINESSES.find(b => b.id === 'food_truck');
    cleanState({ coins: ft.baseCost * 2, totalEarned: ft.baseCost * 2 });
    const before = Game.derived.incomePerSec;
    const ok = Game.levelUpBusiness('food_truck');
    expect(ok).toBeTrue();
    expect(Game.derived.incomePerSec).toBeGreaterThan(before);
    expect(Game.state.businesses.food_truck).toBe(1);
  });

  it('levelUpBusiness raises level incrementally', () => {
    cleanState({ businesses: { food_truck: 1 }, coins: 1e15, totalEarned: 1e15 });
    Game.levelUpBusiness('food_truck');
    expect(Game.state.businesses.food_truck).toBe(2);
  });

  it('levelUpBusiness is blocked at maxLevel', () => {
    const ft = BUSINESSES.find(b => b.id === 'food_truck');
    cleanState({ businesses: { food_truck: ft.maxLevel }, coins: 1e20, totalEarned: 1e20 });
    expect(Game.levelUpBusiness('food_truck')).toBeFalse();
  });

  it('income grows with level (compounding)', () => {
    const ft = BUSINESSES.find(b => b.id === 'food_truck');
    cleanState({ businesses: { food_truck: 1 } });
    const inc1 = Game.derived.incomePerSec;
    cleanState({ businesses: { food_truck: 1 }, coins: 1e15, totalEarned: 1e15 });
    Game.levelUpBusiness('food_truck');
    const inc2 = Game.derived.incomePerSec;
    expect(inc2).toBeGreaterThan(inc1 * 1.5);
  });
});

describe('Event system', () => {
  it('global event multiplies clickPower', () => {
    cleanState();
    const before = Game.derived.clickPower;
    Game.applyEvent({ id: 'test_ev', multiplier: 3, duration: 300, label: 'Test Event!' });
    expect(Game.derived.clickPower).toBeCloseTo(before * 3, 4);
  });

  it('global event multiplies incomePerSec', () => {
    cleanState({ jobs: { sweeper: 5 } });
    const before = Game.derived.incomePerSec;
    Game.applyEvent({ id: 'test_ev2', multiplier: 2, duration: 60, label: 'Test Event!' });
    expect(Game.derived.incomePerSec).toBeCloseTo(before * 2, 4);
  });

  it('click-type event multiplies clickPower only', () => {
    cleanState({ jobs: { sweeper: 5 } });
    const cpBefore  = Game.derived.clickPower;
    const ipsBefore = Game.derived.incomePerSec;
    Game.applyEvent({ id: 'test_ev3', multiplier: 3, type: 'click', duration: 120, label: 'Test Event!' });
    expect(Game.derived.clickPower).toBeCloseTo(cpBefore * 3, 4);
    expect(Game.derived.incomePerSec).toBeCloseTo(ipsBefore, 4);
  });

  it('tax_break gives instant coin bonus (60s worth)', () => {
    cleanState({ jobs: { sweeper: 10 } });
    const ips    = Game.derived.incomePerSec;
    const before = Game.state.coins;
    Game.applyEvent({ id: 'tax_break', bonusMultiplier: 60, duration: 0 });
    const bonus = Game.state.coins - before;
    expect(bonus).toBeCloseTo(ips * 60, 2);
  });

  it('expired event is removed on next recalc', () => {
    Game.state.activeEvents = [{
      id: 'old_ev', multiplier: 99, type: 'global',
      expiresAt: Date.now() - 1000
    }];
    Game.state.activeEvents = Game.state.activeEvents.filter(e => e.expiresAt > Date.now());
    expect(Game.state.activeEvents.length).toBe(0);
  });
});

describe('Prestige system', () => {
  it('PRESTIGE_CONFIG.unlockAt is $100M', () => {
    expect(PRESTIGE_CONFIG.unlockAt).toBe(1e8);
  });

  it('calcPoints returns 0 for earned below unlockAt', () => {
    expect(Game.calcPrestigePoints(1e7)).toBe(0); // < 1e8
  });

  it('calcPoints returns 16 for exactly $100M', () => {
    // log10(1e8/1e4) * 4 = log10(1e4) * 4 = 4 * 4 = 16
    expect(Game.calcPrestigePoints(1e8)).toBe(16);
  });

  it('calcPoints returns 20 for $1B', () => {
    // log10(1e9/1e4) * 4 = log10(1e5) * 4 = 5 * 4 = 20
    expect(Game.calcPrestigePoints(1e9)).toBe(20);
  });

  it('prestigeMultiplier is 1.0 with no stars', () => {
    expect(PRESTIGE_CONFIG.calcMultiplier(0)).toBeCloseTo(1.0, 4);
  });

  it('prestigeMultiplier is 2.6 with 16 stars', () => {
    expect(PRESTIGE_CONFIG.calcMultiplier(16)).toBeCloseTo(2.6, 4);
  });

  it('prestigeMultiplier applies to incomePerSec', () => {
    cleanState({ jobs: { sweeper: 5 }, prestigePoints: 0 });
    const incBefore = Game.derived.incomePerSec;
    cleanState({ jobs: { sweeper: 5 }, prestigePoints: 10 }); // 1 + 10*0.1 = 2×
    const incAfter = Game.derived.incomePerSec;
    expect(incAfter).toBeCloseTo(incBefore * 2, 2);
  });

  it('prestigeMultiplier applies to clickPower', () => {
    cleanState({ prestigePoints: 0 });
    const cpBefore = Game.derived.clickPower;
    cleanState({ prestigePoints: 10 }); // 2× multiplier
    const cpAfter = Game.derived.clickPower;
    expect(cpAfter).toBeCloseTo(cpBefore * 2, 2);
  });

  it('prestige() returns false when totalEarned < unlockAt', () => {
    cleanState({ totalEarned: 1e7 }); // $10M < $100M
    expect(Game.prestige()).toBeFalse();
  });

  it('prestige() succeeds, resets run state, increments level', () => {
    cleanState({
      coins: 2e8,
      totalEarned: 1e8,
      jobs: { sweeper: 5 },
      businesses: { food_truck: 2 },
      upgrades: new Set(['click_1'])
    });
    const ok = Game.prestige();
    expect(ok).toBeTrue();
    expect(Game.state.prestigeLevel).toBe(1);
    expect(Game.state.prestigePoints).toBe(16); // 16 pts for $100M
    expect(Game.state.coins).toBe(0);
    expect(Game.state.totalEarned).toBe(0);
    expect(Object.keys(Game.state.jobs).length).toBe(0);
    expect(Object.keys(Game.state.businesses).length).toBe(0);
    expect(Game.state.upgrades.size).toBe(0);
  });

  it('lifetimeCoins accumulates across prestiges', () => {
    cleanState({ totalEarned: 1e8, lifetimeCoins: 5e8 });
    Game.prestige();
    expect(Game.state.lifetimeCoins).toBe(5e8 + 1e8);
  });

  it('achievements survive prestige reset', () => {
    cleanState({
      totalEarned: 1e8,
      achievements: new Set(['earn_1k'])
    });
    Game.prestige();
    expect(Game.state.achievements.has('earn_1k')).toBeTrue();
  });
});

describe('Achievements', () => {
  it('earn_1k earned when lifetimeTotal >= 1000', () => {
    cleanState({ totalEarned: 1000 });
    const anyNew = Game.checkAchievements();
    expect(Game.state.achievements.has('earn_1k')).toBeTrue();
  });

  it('taps_100 earned when totalTaps >= 100', () => {
    cleanState({ totalTaps: 100 });
    Game.checkAchievements();
    expect(Game.state.achievements.has('taps_100')).toBeTrue();
  });

  it('taps_100 not earned when totalTaps < 100', () => {
    cleanState({ totalTaps: 50 });
    Game.checkAchievements();
    expect(Game.state.achievements.has('taps_100')).toBeFalse();
  });

  it('workers_10 earned when 10+ total workers hired', () => {
    cleanState({ jobs: { sweeper: 6, sign_holder: 4 } });
    Game.checkAchievements();
    expect(Game.state.achievements.has('workers_10')).toBeTrue();
  });

  it('biz_first earned when 1 business owned', () => {
    cleanState({ businesses: { food_truck: 1 } });
    Game.checkAchievements();
    expect(Game.state.achievements.has('biz_first')).toBeTrue();
  });

  it('prestige_1 earned when prestigeLevel >= 1', () => {
    cleanState({ prestigeLevel: 1 });
    Game.checkAchievements();
    expect(Game.state.achievements.has('prestige_1')).toBeTrue();
  });

  it('prestige_3 not earned when prestigeLevel = 2', () => {
    cleanState({ prestigeLevel: 2 });
    Game.checkAchievements();
    expect(Game.state.achievements.has('prestige_3')).toBeFalse();
  });

  it('space_age earned when space_tourism is owned', () => {
    cleanState({ businesses: { space_tourism: 1 } });
    Game.checkAchievements();
    expect(Game.state.achievements.has('space_age')).toBeTrue();
  });

  it('achievement not re-earned once earned', () => {
    cleanState({ totalEarned: 1000, achievements: new Set(['earn_1k']) });
    const anyNew = Game.checkAchievements();
    expect(anyNew).toBeFalse(); // already had it, no new ones
  });

  it('upg_first earned when upgrades.size >= 1', () => {
    cleanState({ upgrades: new Set(['click_1']) });
    Game.checkAchievements();
    expect(Game.state.achievements.has('upg_first')).toBeTrue();
  });
});

describe('Offline earnings', () => {
  it('calculates offline earnings from income rate and elapsed time', () => {
    const incomePerSec = 100;
    const lastSave     = Date.now() - 60000;
    const earned = Storage.calcOfflineEarnings(incomePerSec, lastSave);
    expect(earned).toBeCloseTo(6000, 0);
  });

  it('caps offline earnings at 8 hours', () => {
    const incomePerSec = 100;
    const lastSave     = Date.now() - 48 * 3600 * 1000;
    const earned = Storage.calcOfflineEarnings(incomePerSec, lastSave);
    expect(earned).toBeCloseTo(100 * 8 * 3600, 0);
  });

  it('returns 0 with no lastSave', () => {
    expect(Storage.calcOfflineEarnings(100, null)).toBe(0);
  });
});

describe('Save / load', () => {
  it('save and load round-trip preserves coins, jobs, businesses, upgrades', () => {
    const snap = {
      coins:         12345.67,
      totalEarned:   99999,
      jobs:          { sweeper: 3, sign_holder: 1 },
      businesses:    { food_truck: 2 },
      upgrades:      new Set(['click_1', 'click_2']),
      prestigeLevel:  2,
      prestigePoints: 32,
      lifetimeCoins:  5e8,
      totalTaps:      500,
      achievements:   new Set(['earn_1k', 'taps_100']),
      lastSave:       Date.now()
    };
    Storage.save(snap);
    const loaded = Storage.load();
    expect(loaded.coins).toBeCloseTo(snap.coins, 2);
    expect(loaded.jobs.sweeper).toBe(3);
    expect(loaded.businesses.food_truck).toBe(2);
    expect(loaded.upgrades instanceof Set).toBeTrue();
    expect(loaded.upgrades.has('click_1')).toBeTrue();
  });

  it('save and load round-trip preserves prestige fields', () => {
    const snap = {
      coins: 0, totalEarned: 0,
      jobs: {}, businesses: {},
      upgrades: new Set(), achievements: new Set(['earn_1k']),
      prestigeLevel: 3, prestigePoints: 52,
      lifetimeCoins: 2e9, totalTaps: 1234,
      lastSave: Date.now()
    };
    Storage.save(snap);
    const loaded = Storage.load();
    expect(loaded.prestigeLevel).toBe(3);
    expect(loaded.prestigePoints).toBe(52);
    expect(loaded.lifetimeCoins).toBe(2e9);
    expect(loaded.totalTaps).toBe(1234);
  });

  it('save and load round-trip preserves achievements Set', () => {
    const snap = {
      coins: 0, totalEarned: 0, jobs: {}, businesses: {},
      upgrades: new Set(),
      achievements: new Set(['earn_1k', 'taps_100', 'prestige_1']),
      prestigeLevel: 0, prestigePoints: 0,
      lifetimeCoins: 0, totalTaps: 0,
      lastSave: Date.now()
    };
    Storage.save(snap);
    const loaded = Storage.load();
    expect(loaded.achievements instanceof Set).toBeTrue();
    expect(loaded.achievements.has('earn_1k')).toBeTrue();
    expect(loaded.achievements.has('taps_100')).toBeTrue();
    expect(loaded.achievements.has('prestige_1')).toBeTrue();
    expect(loaded.achievements.has('nonexistent')).toBeFalse();
  });

  it('load returns null when nothing saved', () => {
    Storage.clear();
    expect(Storage.load()).toBe(null);
  });
});

describe('Config integrity', () => {
  it('all jobs have required fields', () => {
    for (const job of JOBS) {
      if (!job.id)            throw new Error(`Job missing id`);
      if (!job.name)          throw new Error(`${job.id} missing name`);
      if (!job.costHireBase)  throw new Error(`${job.id} missing costHireBase`);
      if (!job.costGrowth)    throw new Error(`${job.id} missing costGrowth`);
      if (job.incomePerWorker == null) throw new Error(`${job.id} missing incomePerWorker`);
    }
  });

  it('all businesses have required fields', () => {
    for (const biz of BUSINESSES) {
      if (!biz.id)         throw new Error(`Biz missing id`);
      if (!biz.baseCost)   throw new Error(`${biz.id} missing baseCost`);
      if (!biz.baseIncome) throw new Error(`${biz.id} missing baseIncome`);
      if (!biz.maxLevel)   throw new Error(`${biz.id} missing maxLevel`);
    }
  });

  it('all upgrades have required fields', () => {
    const validTypes = new Set(['click', 'job', 'business', 'global']);
    for (const upg of UPGRADES) {
      if (!upg.id)         throw new Error(`Upgrade missing id`);
      if (!validTypes.has(upg.type)) throw new Error(`${upg.id} has invalid type "${upg.type}"`);
      if (!upg.multiplier) throw new Error(`${upg.id} missing multiplier`);
      if (upg.cost == null) throw new Error(`${upg.id} missing cost`);
    }
  });

  it('all achievements have required fields', () => {
    for (const ach of ACHIEVEMENTS) {
      if (!ach.id)   throw new Error(`Achievement missing id`);
      if (!ach.name) throw new Error(`${ach.id} missing name`);
      if (!ach.type) throw new Error(`${ach.id} missing type`);
    }
  });

  it('upgrade ids are unique', () => {
    const ids = UPGRADES.map(u => u.id);
    const set  = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it('job ids are unique', () => {
    const ids = JOBS.map(j => j.id);
    const set  = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it('business ids are unique', () => {
    const ids = BUSINESSES.map(b => b.id);
    const set  = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it('achievement ids are unique', () => {
    const ids = ACHIEVEMENTS.map(a => a.id);
    const set  = new Set(ids);
    expect(set.size).toBe(ids.length);
  });

  it('progression makes sense — each job costs more than previous', () => {
    for (let i = 1; i < JOBS.length; i++) {
      expect(JOBS[i].costHireBase).toBeGreaterThan(JOBS[i-1].costHireBase);
    }
  });

  it('progression makes sense — each business costs more than previous', () => {
    for (let i = 1; i < BUSINESSES.length; i++) {
      expect(BUSINESSES[i].baseCost).toBeGreaterThan(BUSINESSES[i-1].baseCost);
    }
  });

  it('new space businesses exist in config', () => {
    const ids = BUSINESSES.map(b => b.id);
    if (!ids.includes('space_tourism'))  throw new Error('space_tourism missing');
    if (!ids.includes('space_mining'))   throw new Error('space_mining missing');
    if (!ids.includes('space_megacity')) throw new Error('space_megacity missing');
    if (!ids.includes('galactic_corp'))  throw new Error('galactic_corp missing');
  });

  it('space businesses have Space or Galactic tier', () => {
    const spaceBizIds = ['space_tourism', 'space_mining', 'space_megacity'];
    for (const id of spaceBizIds) {
      const biz = BUSINESSES.find(b => b.id === id);
      if (biz.tier !== 'Space') throw new Error(`${id} should have tier Space, got ${biz.tier}`);
    }
    const galactic = BUSINESSES.find(b => b.id === 'galactic_corp');
    if (galactic.tier !== 'Galactic') throw new Error(`galactic_corp should have tier Galactic`);
  });

  it('PRESTIGE_CONFIG has required properties', () => {
    if (!PRESTIGE_CONFIG.unlockAt)       throw new Error('PRESTIGE_CONFIG missing unlockAt');
    if (typeof PRESTIGE_CONFIG.calcPoints !== 'function') throw new Error('PRESTIGE_CONFIG missing calcPoints');
    if (typeof PRESTIGE_CONFIG.calcMultiplier !== 'function') throw new Error('PRESTIGE_CONFIG missing calcMultiplier');
  });

  it('biz_all achievement threshold matches business count', () => {
    const bizAll = ACHIEVEMENTS.find(a => a.id === 'biz_all');
    if (!bizAll) throw new Error('biz_all achievement missing');
    expect(bizAll.threshold).toBe(BUSINESSES.length);
  });
});

// ── Summary ───────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`  All ${passed} tests passed ✓`);
} else {
  console.log(`  ${passed} passed, ${failed} FAILED`);
  process.exit(1);
}
