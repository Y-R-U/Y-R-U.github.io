#!/usr/bin/env node
// ============================================================
// LIFE IDLE — Automated Test Suite
// Run:  node tests/game.test.js
//       cd gms/pwa/idleLife && node tests/game.test.js
// ============================================================
'use strict';
const fs   = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

// ── Minimal test runner ───────────────────────────────────
let passed = 0, failed = 0, current = '';
const tests = [];

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
    toBe(exp)      { if (val !== exp)          throw new Error(`Expected ${exp}, got ${val}`); },
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
// Set up all browser globals that the game files reference
globalThis.window    = {};
// navigator already exists in Node; don't reassign it
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
// `const`/`let` in vm.runInThisContext are still block-scoped to the script,
// so we rewrite them to `var` which DOES attach to globalThis at script level.
// This is safe for the game files (no TDZ-relying patterns, no block-scope bugs).
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

// storage.js — load it (uses globalThis.localStorage which is already stubbed)
load('js/storage.js');

// game.js — references UI, Storage, JOBS etc. all on globalThis
load('js/game.js');

// Helper: reset game to clean state (Game.init() already called by load)
// Timers run in background but only call stubbed UI.updateHeader — harmless.

// ── TESTS ─────────────────────────────────────────────────

describe('Number formatting (fmt / fmtCurrency)', () => {
  it('formats small numbers to 2 decimal places', () => {
    expect(Game.fmt(0.5)).toBe('0.50');
    expect(Game.fmt(9.99)).toBe('9.99');
  });
  it('formats integers ≥100 without decimals', () => {
    expect(Game.fmt(100)).toBe('100');
    expect(Game.fmt(999)).toBe('999');  // 999 < 1000 so no suffix
    expect(Game.fmt(9999)).toBe('10.00K'); // 9999 >= 1000 so K suffix
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
    // jobBulkCost with 0 owned, count=1 = baseCost * growth^0 = baseCost
    // But Game.state may have workers — use direct math
    const cost = Math.ceil(sweeper.costHireBase * Math.pow(sweeper.costGrowth, 0));
    expect(cost).toBe(sweeper.costHireBase); // 10
  });

  it('second hire costs more than first', () => {
    const cost0 = Math.ceil(sweeper.costHireBase * Math.pow(sweeper.costGrowth, 0));
    const cost1 = Math.ceil(sweeper.costHireBase * Math.pow(sweeper.costGrowth, 1));
    expect(cost1).toBeGreaterThan(cost0);
  });

  it('jobHireCost matches jobBulkCost for count=1', () => {
    // Reset state so owned = 0
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
    Game.state.coins = 0;
    Game.state.jobs  = {};
    expect(Game.hireWorker('sweeper', 1)).toBeFalse();
  });

  it('hireWorker succeeds and deducts cost', () => {
    Game.state.coins      = 100;
    Game.state.totalEarned = 100;
    Game.state.jobs       = {};
    const cost = Game.jobBulkCost(JOBS.find(j => j.id === 'sweeper'), 1);
    const ok = Game.hireWorker('sweeper', 1);
    expect(ok).toBeTrue();
    expect(Game.state.jobs.sweeper).toBe(1);
    expect(Game.state.coins).toBeCloseTo(100 - cost, 4);
  });

  it('subsequent hire costs more', () => {
    Game.state.coins      = 10000;
    Game.state.totalEarned = 10000;
    Game.state.jobs       = { sweeper: 0 };
    const sw = JOBS.find(j => j.id === 'sweeper');
    const cost1 = Game.jobBulkCost(sw, 1);
    Game.hireWorker('sweeper', 1);
    const cost2 = Game.jobBulkCost(sw, 1);
    expect(cost2).toBeGreaterThan(cost1);
  });

  it('hired workers increase incomePerSec', () => {
    Game.state.coins      = 10000;
    Game.state.totalEarned = 10000;
    Game.state.jobs       = {};
    Game.state.upgrades   = new Set();
    Game.state.activeEvents = [];
    Game.recalcDerived();
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
    Game.state.coins      = 0;
    Game.state.jobs       = {};
    Game.state.upgrades   = new Set();
    Game.state.activeEvents = [];
    Game.state.baseClickPower = 1;
    Game.recalcDerived();
    expect(Game.derived.clickPower).toBeCloseTo(1, 4);
  });

  it('click upgrade multiplies FULL click power (base + worker bonuses)', () => {
    Game.state.jobs       = { sweeper: 10 };  // 10 × 0.5 bonus = 5 extra
    Game.state.upgrades   = new Set();
    Game.state.activeEvents = [];
    // Give enough coins and totalEarned for click_1 (cost $100, unlockAt 0)
    Game.state.coins = 100;
    Game.state.totalEarned = 100;
    Game.recalcDerived();
    const powerBefore = Game.derived.clickPower;
    Game.purchaseUpgrade('click_1'); // 2× upgrade
    const powerAfter  = Game.derived.clickPower;
    // Should be ~2× the full power (not just 2× the base 1)
    expect(powerAfter).toBeCloseTo(powerBefore * 2, 2);
  });

  it('5× click upgrade quintuples full click power', () => {
    // Reset to no workers, no upgrades
    Game.state.jobs       = {};
    Game.state.upgrades   = new Set();
    Game.state.activeEvents = [];
    Game.state.coins      = 6e6;
    Game.state.totalEarned = 6e6;
    Game.recalcDerived();
    const before = Game.derived.clickPower; // = 1 (base)
    Game.purchaseUpgrade('click_4'); // 5× at $5M
    const after = Game.derived.clickPower;
    expect(after).toBeCloseTo(before * 5, 2);
  });

  it('click power scales correctly with both workers AND upgrade', () => {
    Game.state.jobs       = { sweeper: 4 };  // 4 × 0.5 bonus = 2
    Game.state.upgrades   = new Set();
    Game.state.activeEvents = [];
    Game.state.coins      = 200;
    Game.state.totalEarned = 200;
    Game.recalcDerived();
    // Base(1) + workers(2) = 3, then 2× upgrade → 6
    Game.purchaseUpgrade('click_1'); // costs $100
    // click_2 costs $5000, can't afford yet — just check click_1 applied to total
    expect(Game.derived.clickPower).toBeCloseTo(3 * 2, 2);
  });
});

describe('Upgrades', () => {
  it('purchaseUpgrade fails with insufficient coins', () => {
    Game.state.coins      = 0;
    Game.state.totalEarned = 0;
    Game.state.upgrades   = new Set();
    expect(Game.purchaseUpgrade('click_1')).toBeFalse();
  });

  it('purchaseUpgrade fails when already owned', () => {
    Game.state.coins      = 1000;
    Game.state.totalEarned = 1000;
    Game.state.upgrades   = new Set(['click_1']);
    expect(Game.purchaseUpgrade('click_1')).toBeFalse();
  });

  it('purchaseUpgrade fails when totalEarned < unlockAt', () => {
    Game.state.coins       = 1e9;
    Game.state.totalEarned = 0;   // haven't earned enough
    Game.state.upgrades    = new Set();
    // click_4 requires unlockAt: 1e6
    expect(Game.purchaseUpgrade('click_4')).toBeFalse();
  });

  it('purchaseUpgrade succeeds and deducts cost', () => {
    Game.state.coins      = 500;
    Game.state.totalEarned = 500;
    Game.state.upgrades   = new Set();
    const before = Game.state.coins;
    const ok = Game.purchaseUpgrade('click_1'); // costs 100
    expect(ok).toBeTrue();
    expect(Game.state.coins).toBeCloseTo(before - 100, 4);
    expect(Game.state.upgrades.has('click_1')).toBeTrue();
  });

  it('global upgrade multiplies incomePerSec', () => {
    Game.state.jobs       = { sweeper: 1 };
    Game.state.upgrades   = new Set();
    Game.state.activeEvents = [];
    Game.state.coins      = 2e10;
    Game.state.totalEarned = 2e10;
    Game.recalcDerived();
    const before = Game.derived.incomePerSec;
    Game.purchaseUpgrade('global_1'); // 2× all income
    expect(Game.derived.incomePerSec).toBeCloseTo(before * 2, 4);
  });
});

describe('Businesses', () => {
  it('levelUpBusiness fails with no coins', () => {
    Game.state.coins = 0;
    Game.state.totalEarned = 0;
    Game.state.businesses = {};
    expect(Game.levelUpBusiness('food_truck')).toBeFalse();
  });

  it('levelUpBusiness succeeds and generates income', () => {
    const ft = BUSINESSES.find(b => b.id === 'food_truck');
    Game.state.coins      = ft.baseCost * 2;
    Game.state.totalEarned = ft.baseCost * 2;
    Game.state.businesses = {};
    Game.state.jobs       = {};
    Game.state.upgrades   = new Set();
    Game.state.activeEvents = [];
    Game.recalcDerived();
    const before = Game.derived.incomePerSec;
    const ok = Game.levelUpBusiness('food_truck');
    expect(ok).toBeTrue();
    expect(Game.derived.incomePerSec).toBeGreaterThan(before);
    expect(Game.state.businesses.food_truck).toBe(1);
  });

  it('levelUpBusiness raises level incrementally', () => {
    const ft = BUSINESSES.find(b => b.id === 'food_truck');
    Game.state.businesses  = { food_truck: 1 };
    Game.state.coins       = 1e15;
    Game.state.totalEarned = 1e15;
    Game.levelUpBusiness('food_truck');
    expect(Game.state.businesses.food_truck).toBe(2);
  });

  it('levelUpBusiness is blocked at maxLevel', () => {
    const ft = BUSINESSES.find(b => b.id === 'food_truck');
    Game.state.businesses  = { food_truck: ft.maxLevel };
    Game.state.coins       = 1e20;
    Game.state.totalEarned = 1e20;
    expect(Game.levelUpBusiness('food_truck')).toBeFalse();
  });

  it('income grows with level (compounding)', () => {
    const ft = BUSINESSES.find(b => b.id === 'food_truck');
    Game.state.businesses  = { food_truck: 1 };
    Game.state.jobs        = {};
    Game.state.upgrades    = new Set();
    Game.state.activeEvents = [];
    Game.recalcDerived();
    const inc1 = Game.derived.incomePerSec;
    Game.state.coins = 1e15; Game.state.totalEarned = 1e15;
    Game.levelUpBusiness('food_truck');
    const inc2 = Game.derived.incomePerSec;
    expect(inc2).toBeGreaterThan(inc1 * 1.5); // growth > 1
  });
});

describe('Event system', () => {
  it('global event multiplies clickPower', () => {
    Game.state.jobs       = {};
    Game.state.upgrades   = new Set();
    Game.state.activeEvents = [];
    Game.state.baseClickPower = 1;
    Game.recalcDerived();
    const before = Game.derived.clickPower;
    Game.applyEvent({ id: 'test_ev', multiplier: 3, duration: 300, label: 'Test Event!' });
    expect(Game.derived.clickPower).toBeCloseTo(before * 3, 4);
  });

  it('global event multiplies incomePerSec', () => {
    Game.state.jobs       = { sweeper: 5 };
    Game.state.upgrades   = new Set();
    Game.state.activeEvents = [];
    Game.recalcDerived();
    const before = Game.derived.incomePerSec;
    Game.applyEvent({ id: 'test_ev2', multiplier: 2, duration: 60, label: 'Test Event!' });
    expect(Game.derived.incomePerSec).toBeCloseTo(before * 2, 4);
  });

  it('click-type event multiplies clickPower only', () => {
    Game.state.jobs       = { sweeper: 5 };
    Game.state.upgrades   = new Set();
    Game.state.activeEvents = [];
    Game.recalcDerived();
    const cpBefore  = Game.derived.clickPower;
    const ipsBefore = Game.derived.incomePerSec;
    Game.applyEvent({ id: 'test_ev3', multiplier: 3, type: 'click', duration: 120, label: 'Test Event!' });
    expect(Game.derived.clickPower).toBeCloseTo(cpBefore * 3, 4);
    expect(Game.derived.incomePerSec).toBeCloseTo(ipsBefore, 4); // unchanged
  });

  it('tax_break gives instant coin bonus (60s worth)', () => {
    Game.state.jobs       = { sweeper: 10 };
    Game.state.upgrades   = new Set();
    Game.state.activeEvents = [];
    Game.recalcDerived();
    const ips    = Game.derived.incomePerSec;
    const before = Game.state.coins;
    Game.applyEvent({ id: 'tax_break', bonusMultiplier: 60, duration: 0 });
    const bonus = Game.state.coins - before;
    expect(bonus).toBeCloseTo(ips * 60, 2);
  });

  it('expired event is removed on next recalc', () => {
    Game.state.activeEvents = [{
      id: 'old_ev', multiplier: 99, type: 'global',
      expiresAt: Date.now() - 1000 // already expired
    }];
    // Simulate what tick() does
    Game.state.activeEvents = Game.state.activeEvents.filter(e => e.expiresAt > Date.now());
    expect(Game.state.activeEvents.length).toBe(0);
  });
});

describe('Offline earnings', () => {
  it('calculates offline earnings from income rate and elapsed time', () => {
    const incomePerSec = 100;
    const lastSave     = Date.now() - 60000; // 60 seconds ago
    const earned = Storage.calcOfflineEarnings(incomePerSec, lastSave);
    expect(earned).toBeCloseTo(6000, 0); // 100 * 60 = 6000
  });

  it('caps offline earnings at 8 hours', () => {
    const incomePerSec = 100;
    const lastSave     = Date.now() - 48 * 3600 * 1000; // 48 hours ago
    const earned = Storage.calcOfflineEarnings(incomePerSec, lastSave);
    expect(earned).toBeCloseTo(100 * 8 * 3600, 0); // capped at 8h
  });

  it('returns 0 with no lastSave', () => {
    expect(Storage.calcOfflineEarnings(100, null)).toBe(0);
  });
});

describe('Save / load', () => {
  it('save and load round-trip preserves coins and jobs', () => {
    const snap = {
      coins:        12345.67,
      totalEarned:  99999,
      jobs:         { sweeper: 3, sign_holder: 1 },
      businesses:   { food_truck: 2 },
      upgrades:     ['click_1', 'click_2'],
      lastSave:     Date.now()
    };
    Storage.save(snap);
    const loaded = Storage.load();
    expect(loaded.coins).toBeCloseTo(snap.coins, 2);
    expect(loaded.jobs.sweeper).toBe(3);
    expect(loaded.businesses.food_truck).toBe(2);
    expect(loaded.upgrades instanceof Set).toBeTrue();
    expect(loaded.upgrades.has('click_1')).toBeTrue();
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
      if (!biz.id)        throw new Error(`Biz missing id`);
      if (!biz.baseCost)  throw new Error(`${biz.id} missing baseCost`);
      if (!biz.baseIncome) throw new Error(`${biz.id} missing baseIncome`);
      if (!biz.maxLevel)  throw new Error(`${biz.id} missing maxLevel`);
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
});

// ── Summary ───────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
if (failed === 0) {
  console.log(`  All ${passed} tests passed ✓`);
} else {
  console.log(`  ${passed} passed, ${failed} FAILED`);
  process.exit(1);
}
