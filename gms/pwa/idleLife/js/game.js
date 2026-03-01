// ============================================================
// LIFE IDLE - Core Game Engine  v2.0
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
    activeEvents: [],
    // Prestige & meta (persist through prestige resets)
    prestigeLevel: 0,
    prestigePoints: 0,  // cumulative stars
    lifetimeCoins: 0,   // sum of totalEarned across all past runs
    totalTaps: 0,       // lifetime tap count
    achievements: new Set()
  };

  // Derived (recalculated on every change)
  let derived = {
    clickPower: 1,
    incomePerSec: 0,
    jobMultipliers: {},
    bizMultipliers: {},
    globalMultiplier: 1,
    clickMultiplier: 1,
    prestigeMultiplier: 1
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

    // Active event multipliers
    let eventGlobalMult = 1;
    let eventClickMult = 1;
    for (const ev of state.activeEvents) {
      if (ev.type === 'click') eventClickMult *= ev.multiplier;
      else eventGlobalMult *= ev.multiplier;
    }

    // Prestige multiplier — each star adds +10% to everything
    const prestigeMult = PRESTIGE_CONFIG.calcMultiplier(state.prestigePoints || 0);
    derived.prestigeMultiplier = prestigeMult;

    // Click power: multiplier applies to full sum (base + worker bonuses)
    let cpWorkers = 0;
    for (const job of JOBS) {
      const count = state.jobs[job.id] || 0;
      cpWorkers += count * job.clickBonus * (derived.jobMultipliers[job.id] || 1);
    }
    derived.clickPower =
      (state.baseClickPower + cpWorkers)
      * derived.clickMultiplier
      * eventClickMult
      * eventGlobalMult
      * prestigeMult;

    // Income per second
    let ips = 0;
    for (const job of JOBS) {
      const count = state.jobs[job.id] || 0;
      ips += count * job.incomePerWorker * (derived.jobMultipliers[job.id] || 1);
    }
    for (const biz of BUSINESSES) {
      const level = state.businesses[biz.id] || 0;
      if (level > 0) {
        ips += biz.baseIncome
          * Math.pow(biz.incomeGrowth, level - 1)
          * (derived.bizMultipliers[biz.id] || 1);
      }
    }
    derived.incomePerSec =
      ips * derived.globalMultiplier * eventGlobalMult * prestigeMult;
  }

  // ── Job cost calculation ───────────────────────────────────
  function jobHireCost(job, count) {
    const owned = state.jobs[job.id] || 0;
    return Math.ceil(job.costHireBase * Math.pow(job.costGrowth, owned + count - 1));
  }

  function jobBulkCost(job, count) {
    const owned = state.jobs[job.id] || 0;
    let total = 0;
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

  // ── Prestige ──────────────────────────────────────────────
  function calcPrestigePoints(earnedThisRun) {
    const base = (earnedThisRun !== undefined) ? earnedThisRun : state.totalEarned;
    if (base < PRESTIGE_CONFIG.unlockAt) return 0;
    return PRESTIGE_CONFIG.calcPoints(base);
  }

  function prestige() {
    if (state.totalEarned < PRESTIGE_CONFIG.unlockAt) return false;
    const points = calcPrestigePoints();
    state.prestigePoints += points;
    state.prestigeLevel  += 1;
    state.lifetimeCoins  += state.totalEarned;

    // Reset run-specific state
    state.coins = 0;
    state.totalEarned = 0;
    state.jobs = {};
    state.businesses = {};
    state.upgrades = new Set();
    state.activeEvents = [];
    state.baseClickPower = 1;
    milestonesSeen = new Set();

    recalcDerived();
    checkAchievements();
    UI.render();
    UI.showToast(
      `✨ Prestige ${state.prestigeLevel}! +${points} Stars — now ${state.prestigePoints} total!`,
      'prestige'
    );
    return true;
  }

  // ── Achievements ──────────────────────────────────────────
  function checkAchievements() {
    const lifetimeTotal = (state.lifetimeCoins || 0) + state.totalEarned;
    const totalWorkers  = Object.values(state.jobs).reduce((s, v) => s + v, 0);
    const totalBizOwned = BUSINESSES.filter(b => (state.businesses[b.id] || 0) > 0).length;
    const hasMaxedBiz   = BUSINESSES.some(b => (state.businesses[b.id] || 0) >= b.maxLevel);

    let anyNew = false;
    for (const ach of ACHIEVEMENTS) {
      if (state.achievements.has(ach.id)) continue;
      let earned = false;
      switch (ach.type) {
        case 'lifetimeEarned': earned = lifetimeTotal >= ach.threshold;                break;
        case 'totalWorkers':   earned = totalWorkers  >= ach.threshold;                break;
        case 'totalTaps':      earned = (state.totalTaps || 0) >= ach.threshold;       break;
        case 'bizOwned':       earned = totalBizOwned >= ach.threshold;                break;
        case 'upgradeCount':   earned = state.upgrades.size >= ach.threshold;          break;
        case 'prestigeLevel':  earned = (state.prestigeLevel || 0) >= ach.threshold;  break;
        case 'ownSpecificBiz': earned = (state.businesses[ach.targetId] || 0) > 0;    break;
        case 'maxBiz':         earned = hasMaxedBiz;                                   break;
      }
      if (earned) {
        state.achievements.add(ach.id);
        UI.showToast(`🏆 Achievement: ${ach.name}! ${ach.emoji}`, 'achievement');
        anyNew = true;
      }
    }
    return anyNew;
  }

  // ── Actions ───────────────────────────────────────────────
  function handleClick(x, y) {
    state.totalTaps = (state.totalTaps || 0) + 1;
    const earned = derived.clickPower;
    state.coins += earned;
    state.totalEarned += earned;
    recalcDerived();
    checkMilestones();
    checkAchievements();
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
    checkAchievements();
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
    checkAchievements();
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
    checkAchievements();
    UI.render();
    return true;
  }

  function applyEvent(event) {
    if (event.id === 'tax_break') {
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
      if (s.unlockCoins != null && state.totalEarned >= s.unlockCoins) stage = s;
    }
    return stage;
  }

  // ── Game tick ─────────────────────────────────────────────
  function tick() {
    const now = Date.now();
    const dt = lastTick ? (now - lastTick) / 1000 : 0;
    lastTick = now;

    const before = state.activeEvents.length;
    state.activeEvents = state.activeEvents.filter(e => e.expiresAt > now);
    if (state.activeEvents.length !== before) recalcDerived();

    if (dt > 0 && derived.incomePerSec > 0) {
      const earned = derived.incomePerSec * dt;
      state.coins += earned;
      state.totalEarned += earned;
      checkMilestones();
    }

    UI.updateHeader();
  }

  // ── Save helper ───────────────────────────────────────────
  function getStateForSave() {
    return {
      coins: state.coins,
      totalEarned: state.totalEarned,
      jobs: state.jobs,
      businesses: state.businesses,
      upgrades: [...state.upgrades],
      prestigeLevel: state.prestigeLevel,
      prestigePoints: state.prestigePoints,
      lifetimeCoins: state.lifetimeCoins,
      totalTaps: state.totalTaps,
      achievements: [...state.achievements],
      lastSave: Date.now()
    };
  }

  // ── Init ──────────────────────────────────────────────────
  function init() {
    const saved = Storage.load();

    if (saved) {
      state.coins        = saved.coins        || 0;
      state.totalEarned  = saved.totalEarned  || 0;
      state.baseClickPower = 1;
      state.jobs         = saved.jobs         || {};
      state.businesses   = saved.businesses   || {};
      state.upgrades     = saved.upgrades instanceof Set
        ? saved.upgrades : new Set(saved.upgrades || []);
      state.prestigeLevel  = saved.prestigeLevel  || 0;
      state.prestigePoints = saved.prestigePoints || 0;
      state.lifetimeCoins  = saved.lifetimeCoins  || 0;
      state.totalTaps      = saved.totalTaps      || 0;
      state.achievements   = saved.achievements instanceof Set
        ? saved.achievements : new Set(saved.achievements || []);

      recalcDerived();

      const offline = Storage.calcOfflineEarnings(derived.incomePerSec, saved.lastSave);
      if (offline > 1) {
        state.coins += offline;
        state.totalEarned += offline;
        UI.showOfflineModal(offline, fmtCurrency);
      }
    }

    recalcDerived();
    checkAchievements();

    lastTick = Date.now();
    tickTimer = setInterval(tick, 100);

    Storage.startAutosave(getStateForSave);

    Events.start();
    UI.render();
    UI.updateHeader();
  }

  function reset() {
    clearInterval(tickTimer);
    Storage.clear();
    state = {
      coins: 0, totalEarned: 0, baseClickPower: 1,
      jobs: {}, businesses: {}, upgrades: new Set(), activeEvents: [],
      prestigeLevel: 0, prestigePoints: 0, lifetimeCoins: 0,
      totalTaps: 0, achievements: new Set()
    };
    milestonesSeen = new Set();
    init();
  }

  // ── Public API ────────────────────────────────────────────
  return {
    get state()   { return state; },
    get derived() { return derived; },
    recalcDerived,
    fmt, fmtCurrency,
    jobHireCost, jobBulkCost, bizLevelCost,
    calcPrestigePoints, prestige,
    checkAchievements,
    handleClick, hireWorker, levelUpBusiness, purchaseUpgrade,
    applyEvent, getCharacterStage,
    init, reset
  };
})();
