// ============================================================
// Transport Empire - Economy & Computation Engine
// ============================================================

function getPrestigeLevel(id) {
    return game.prestigeUpgrades[id] || 0;
}

function getPrestigeEarningMul() {
    return 1 + getPrestigeLevel('p_earn') * 0.25;
}

function getPrestigeSpeedMul() {
    return 1 - getPrestigeLevel('p_speed') * 0.10;
}

function getPrestigeClickMul() {
    return 1 + getPrestigeLevel('p_click') * 0.50;
}

function getPrestigeStartMoney() {
    return getPrestigeLevel('p_start') * 500;
}

function getPrestigeCostMul() {
    return 1 - getPrestigeLevel('p_cost') * 0.05;
}

function getClickValue() {
    let v = game.clickValue;
    for (const u of UPGRADE_DEFS) {
        if (u.type === 'click' && game.upgrades[u.id]) v *= u.mul;
    }
    v *= getPrestigeClickMul();
    for (const b of game.activeBonuses) {
        if (b.effect === 'click') v *= b.mul;
    }
    return v;
}

function getBizEarning(bizId) {
    const def = BUSINESS_DEFS.find(b => b.id === bizId);
    const biz = game.businesses[bizId];
    if (!biz || biz.level === 0) return 0;
    let earn = def.baseEarning * biz.level;
    for (const u of UPGRADE_DEFS) {
        if (u.type === 'earning' && game.upgrades[u.id]) {
            if (u.target === 'all' || (Array.isArray(u.target) && u.target.includes(bizId))) {
                earn *= u.mul;
            }
        }
    }
    earn *= getPrestigeEarningMul();
    for (const b of game.activeBonuses) {
        if (b.effect === 'earning') earn *= b.mul;
    }
    return earn;
}

function getBizTime(bizId) {
    const def = BUSINESS_DEFS.find(b => b.id === bizId);
    let t = def.baseTime;
    for (const u of UPGRADE_DEFS) {
        if (u.type === 'speed' && game.upgrades[u.id]) {
            if (u.target === 'all' || (Array.isArray(u.target) && u.target.includes(bizId))) {
                t *= u.mul;
            }
        }
    }
    t *= Math.max(0.1, getPrestigeSpeedMul());
    for (const b of game.activeBonuses) {
        if (b.effect === 'speed') t /= b.mul;
    }
    return Math.max(0.5, t);
}

function getBizCost(bizId) {
    const def = BUSINESS_DEFS.find(b => b.id === bizId);
    const biz = game.businesses[bizId];
    const level = biz ? biz.level : 0;
    let cost = def.baseCost * Math.pow(def.costMul, level);
    cost *= Math.max(0.5, getPrestigeCostMul());
    return Math.ceil(cost);
}

function getBulkCost(bizId, count) {
    const def = BUSINESS_DEFS.find(b => b.id === bizId);
    const biz = game.businesses[bizId] || { level: 0 };
    let total = 0;
    const costMul = Math.max(0.5, getPrestigeCostMul());
    for (let i = 0; i < count; i++) {
        total += Math.ceil(def.baseCost * Math.pow(def.costMul, biz.level + i) * costMul);
    }
    return total;
}

function hasManager(bizId) {
    const mgr = UPGRADE_DEFS.find(u => u.type === 'manager' && u.target === bizId);
    return mgr && game.upgrades[mgr.id];
}

function getTotalPerSec() {
    let total = 0;
    for (const def of BUSINESS_DEFS) {
        const biz = game.businesses[def.id];
        if (biz && biz.level > 0 && hasManager(def.id)) {
            total += getBizEarning(def.id) / getBizTime(def.id);
        }
    }
    return total;
}

function getPrestigePointsEarnable() {
    return Math.floor(Math.sqrt(game.totalEarned / 1e6));
}

function getStats() {
    let unlockedCount = 0;
    let maxLevel = 0;
    let upgradeCount = 0;
    for (const def of BUSINESS_DEFS) {
        const biz = game.businesses[def.id];
        if (biz && biz.level > 0) {
            unlockedCount++;
            if (biz.level > maxLevel) maxLevel = biz.level;
        }
    }
    for (const id in game.upgrades) {
        if (game.upgrades[id]) upgradeCount++;
    }
    return {
        totalEarned: game.totalEarned,
        totalClicks: game.totalClicks,
        totalPrestiges: game.totalPrestiges,
        unlockedCount,
        maxLevel,
        upgradeCount,
        eventsCaught: game.eventsCaught
    };
}
