// ============================================================
// Idle Transport Empire - Economy Engine
// ============================================================

function pLv(id) { return G.pUpgrades[id] || 0; }
function pEarnMul() { return 1 + pLv('pe') * 0.25; }
function pSpeedMul() { return Math.max(0.1, 1 - pLv('ps') * 0.10); }
function pClickMul() { return 1 + pLv('pc') * 0.50; }
function pStartMoney() { return pLv('pm') * 500; }
function pCostMul() { return Math.max(0.5, 1 - pLv('pr') * 0.05); }

function getClickVal() {
    let v = G.clickVal;
    for (const u of UPGRADES) {
        if (u.type === 'click' && G.upgrades[u.id]) v *= u.mul;
    }
    v *= pClickMul();
    for (const b of G.bonuses) {
        if (b.effect === 'click') v *= b.mul;
    }
    return v;
}

function getRouteEarn(rid) {
    const def = ROUTES.find(r => r.id === rid);
    const rt = G.routes[rid];
    if (!rt || rt.level === 0) return 0;
    let e = def.baseEarn * rt.level;
    for (const u of UPGRADES) {
        if (u.type === 'earn' && G.upgrades[u.id]) {
            if (u.target === 'all' || (Array.isArray(u.target) && u.target.includes(rid))) e *= u.mul;
        }
    }
    e *= pEarnMul();
    for (const b of G.bonuses) { if (b.effect === 'earn') e *= b.mul; }
    return e;
}

function getRouteTime(rid) {
    const def = ROUTES.find(r => r.id === rid);
    let t = def.baseTime;
    for (const u of UPGRADES) {
        if (u.type === 'speed' && G.upgrades[u.id]) {
            if (u.target === 'all' || (Array.isArray(u.target) && u.target.includes(rid))) t *= u.mul;
        }
    }
    t *= pSpeedMul();
    for (const b of G.bonuses) { if (b.effect === 'speed') t /= b.mul; }
    return Math.max(0.5, t);
}

function getRouteCost(rid) {
    const def = ROUTES.find(r => r.id === rid);
    const rt = G.routes[rid];
    const lv = rt ? rt.level : 0;
    return Math.ceil(def.baseCost * Math.pow(def.costMul, lv) * pCostMul());
}

function getBulkCost(rid, n) {
    const def = ROUTES.find(r => r.id === rid);
    const rt = G.routes[rid] || { level: 0 };
    let tot = 0;
    const cm = pCostMul();
    for (let i = 0; i < n; i++) {
        tot += Math.ceil(def.baseCost * Math.pow(def.costMul, rt.level + i) * cm);
    }
    return tot;
}

function hasManager(rid) {
    const m = UPGRADES.find(u => u.type === 'manager' && u.target === rid);
    return m && G.upgrades[m.id];
}

function getPerSec() {
    let t = 0;
    for (const def of ROUTES) {
        const rt = G.routes[def.id];
        if (rt && rt.level > 0 && hasManager(def.id)) {
            t += getRouteEarn(def.id) / getRouteTime(def.id);
        }
    }
    return t;
}

function getPrestigeEarnable() {
    return Math.floor(Math.sqrt(G.totalEarned / 1e6));
}

function getStats() {
    let routeCount = 0, maxLevel = 0, upgradeCount = 0;
    for (const def of ROUTES) {
        const rt = G.routes[def.id];
        if (rt && rt.level > 0) {
            routeCount++;
            if (rt.level > maxLevel) maxLevel = rt.level;
        }
    }
    for (const id in G.upgrades) { if (G.upgrades[id]) upgradeCount++; }
    return {
        totalEarned: G.totalEarned, totalClicks: G.totalClicks,
        totalPrestiges: G.totalPrestiges, routeCount, maxLevel,
        upgradeCount, eventsCaught: G.eventsCaught
    };
}

// Get vehicle count for visual display based on level
function getVehicleCount(level) {
    if (level <= 0) return 0;
    if (level < 10) return 1;
    if (level < 25) return 2;
    if (level < 50) return 3;
    return 4;
}
