// ============================================================
// LIFE IDLE - Core Game Engine
// ============================================================

const Game = (() => {

  // ── State ─────────────────────────────────────────────────
  let state = {
    coins: 0,
    totalEarned: 0,
    baseClickPower: 1,
    jobs: {},        // { sweeper: 3, sign_holder: 1, ... }
    businesses: {},  // { food_truck: 2, ... }  value = level
    upgrades: new Set(),
    activeEvents: []
  };

  // Derived (recalculated on every change)
  let derived = {
    clickPower: 1,
    incomePerSec: 0,
    jobMultipliers: {},   // { jobId: multiplier }
    bizMultipliers: {},   // { bizId: multiplier }
    globalMultiplier: 1,
    clickMultiplier: 1
  };

  let lastTick = null;
  let tickTimer = null;
  let milestonesSeen = new Set();

  // ── Helpers ───────────────────────────────────────────────
  function fmt(n) {
    if (n < 0) return '-' + fmt(-n);
    for (const { value, symbol } of SUFFIXES) {
      if (n >= value) return (n / value).toFixed(2) + symbol;
    }
    return n < 100 ? n.toFixed(2) : Math.floor(n).toLocaleString();
  }

  function fmtCurrency(n) { return '$' + fmt(n); }

  // ── Derived recalculation ─────────────────────────────────
  function recalcDerived() {
    // Reset
    derived.jobMultipliers = {};
    derived.bizMultipliers = {};
    derived.globalMultiplier = 1;
    derived.clickMultiplier = 1;

    // Apply upgrades
    for (const uid of state.upgrades) {
      const upg = UPGRADES.find(u => u.id === uid);
      if (!upg) continue;
      switch (upg.type) {
        case 'click':
          derived.clickMultiplier *= upg.multiplier;
          break;
        case 'job':
          derived.jobMultipliers[upg.targetId] =
            (derived.jobMultipliers[upg.targetId] || 1) * upg.multiplier;
          break;
        case 'business':
          derived.bizMultipliers[upg.targetId] =
            (derived.bizMultipliers[upg.targetId] || 1) * upg.multiplier;
          break;
        case 'global':
          derived.globalMultiplier *= upg.multiplier;
          break;
      }
    }

    // Apply active event multipliers
    let eventGlobalMult = 1;
    let eventClickMult = 1;
    for (const ev of state.activeEvents) {
      if (ev.type === 'click') eventClickMult *= ev.multiplier;
      else eventGlobalMult *= ev.multiplier;
    }

    // Click power (global event mult applies here too — e.g. investment boosts taps)
    let cp = state.baseClickPower * derived.clickMultiplier * eventClickMult;
    // Add bonus from hired workers
    for (const job of JOBS) {
      const count = state.jobs[job.id] || 0;
      cp += count * job.clickBonus * (derived.jobMultipliers[job.id] || 1);
    }
    derived.clickPower = cp * eventGlobalMult;

    // Income per second
    let ips = 0;
    for (const job of JOBS) {
      const count = state.jobs[job.id] || 0;
      ips += count * job.incomePerWorker * (derived.jobMultipliers[job.id] || 1);
    }
    for (const biz of BUSINESSES) {
      const level = state.businesses[biz.id] || 0;
      if (level > 0) {
        ips += biz.baseIncome * Math.pow(biz.incomeGrowth, level - 1)
               * (derived.bizMultipliers[biz.id] || 1);
      }
    }
    derived.incomePerSec = ips * derived.globalMultiplier * eventGlobalMult;
  }

  // ── Job cost calculation ───────────────────────────────────
  function jobHireCost(job, count) {
    // cost = baseCost * growthRate^owned  (cookie-clicker formula)
    const owned = state.jobs[job.id] || 0;
    return Math.ceil(job.costHireBase * Math.pow(job.costGrowth, owned + count - 1));
  }

  function jobBulkCost(job, count) {
    let total = 0;
    for (let i = 0; i < count; i++) total += jobHireCost(job, i + 1);
    // Recalculate properly
    const owned = state.jobs[job.id] || 0;
    total = 0;
    for (let i = 0; i < count; i++) {
      total += Math.ceil(job.costHireBase * Math.pow(job.costGrowth, owned + i));
    }
    return total;
  }

  function bizLevelCost(biz) {
    const level = state.businesses[biz.id] || 0;
    if (level === 0) return biz.baseCost;
    return Math.ceil(biz.baseCost * Math.pow(biz.levelCostMultiplier, level));
  }

  // ── Actions ───────────────────────────────────────────────
  function handleClick(x, y) {
    const earned = derived.clickPower;
    state.coins += earned;
    state.totalEarned += earned;
    recalcDerived();
    checkMilestones();
    UI.spawnCoinParticle(x, y, fmtCurrency(earned));
    return earned;
  }

  function hireWorker(jobId, count = 1) {
    const job = JOBS.find(j => j.id === jobId);
    if (!job) return false;
    const cost = jobBulkCost(job, count);
    if (state.coins < cost) return false;
    state.coins -= cost;
    state.jobs[jobId] = (state.jobs[jobId] || 0) + count;
    recalcDerived();
    UI.render();
    return true;
  }

  function levelUpBusiness(bizId) {
    const biz = BUSINESSES.find(b => b.id === bizId);
    if (!biz) return false;
    const level = state.businesses[bizId] || 0;
    if (level >= biz.maxLevel) return false;
    const cost = bizLevelCost(biz);
    if (state.coins < cost) return false;
    state.coins -= cost;
    state.businesses[bizId] = level + 1;
    recalcDerived();
    UI.render();
    return true;
  }

  function purchaseUpgrade(upgradeId) {
    if (state.upgrades.has(upgradeId)) return false;
    const upg = UPGRADES.find(u => u.id === upgradeId);
    if (!upg) return false;
    if (state.totalEarned < upg.unlockAt) return false;
    if (state.coins < upg.cost) return false;
    state.coins -= upg.cost;
    state.upgrades.add(upgradeId);
    recalcDerived();
    UI.render();
    return true;
  }

  function applyEvent(event) {
    if (event.id === 'tax_break') {
      // Instant bonus
      const bonus = derived.incomePerSec * event.bonusMultiplier;
      state.coins += bonus;
      state.totalEarned += bonus;
      UI.showToast(`💸 Tax Break! +${fmtCurrency(bonus)}`, 'gold');
      UI.updateHeader();
      return;
    }
    const active = {
      id: event.id,
      multiplier: event.multiplier,
      type: event.type || 'global',
      expiresAt: Date.now() + event.duration * 1000
    };
    state.activeEvents = state.activeEvents.filter(e => e.id !== event.id);
    state.activeEvents.push(active);
    recalcDerived();
    UI.updateHeader();
    UI.showToast(`${event.label.split('!')[0]}! Active for ${event.duration}s!`, 'gold');
  }

  // ── Milestone checks ──────────────────────────────────────
  function checkMilestones() {
    for (const m of MILESTONES) {
      if (!milestonesSeen.has(m.coins) && state.totalEarned >= m.coins) {
        milestonesSeen.add(m.coins);
        UI.showToast(m.msg, 'milestone');
      }
    }
  }

  // ── Character stage ───────────────────────────────────────
  function getCharacterStage() {
    let stage = CHARACTER_STAGES[0];
    for (const s of CHARACTER_STAGES) {
      if (s.unlockCoins && state.totalEarned >= s.unlockCoins) stage = s;
    }
    return stage;
  }

  // ── Game tick ─────────────────────────────────────────────
  function tick() {
    const now = Date.now();
    const dt = lastTick ? (now - lastTick) / 1000 : 0;
    lastTick = now;

    // Expire events
    const before = state.activeEvents.length;
    state.activeEvents = state.activeEvents.filter(e => e.expiresAt > now);
    if (state.activeEvents.length !== before) recalcDerived();

    // Passive income
    if (dt > 0 && derived.incomePerSec > 0) {
      const earned = derived.incomePerSec * dt;
      state.coins += earned;
      state.totalEarned += earned;
      checkMilestones();
    }

    UI.updateHeader();
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    const saved = Storage.load();

    if (saved) {
      state.coins = saved.coins || 0;
      state.totalEarned = saved.totalEarned || 0;
      state.baseClickPower = 1;
      state.jobs = saved.jobs || {};
      state.businesses = saved.businesses || {};
      state.upgrades = saved.upgrades instanceof Set ? saved.upgrades : new Set(saved.upgrades || []);

      recalcDerived();

      // Offline earnings
      const offline = Storage.calcOfflineEarnings(derived.incomePerSec, saved.lastSave);
      if (offline > 1) {
        state.coins += offline;
        state.totalEarned += offline;
        UI.showOfflineModal(offline, fmtCurrency);
      }
    }

    recalcDerived();

    // Start systems
    lastTick = Date.now();
    tickTimer = setInterval(tick, 100);

    Storage.startAutosave(() => ({
      coins: state.coins,
      totalEarned: state.totalEarned,
      jobs: state.jobs,
      businesses: state.businesses,
      upgrades: [...state.upgrades],
      lastSave: Date.now()
    }));

    Events.start();
    UI.render();
    UI.updateHeader();
  }

  function reset() {
    clearInterval(tickTimer);
    Storage.clear();
    state = {
      coins: 0, totalEarned: 0, baseClickPower: 1,
      jobs: {}, businesses: {}, upgrades: new Set(), activeEvents: []
    };
    milestonesSeen = new Set();
    init();
  }

  // ── Public API ────────────────────────────────────────────
  return {
    get state() { return state; },
    get derived() { return derived; },
    fmt, fmtCurrency,
    jobHireCost, jobBulkCost, bizLevelCost,
    handleClick, hireWorker, levelUpBusiness, purchaseUpgrade,
    applyEvent, getCharacterStage,
    init, reset
  };
})();
