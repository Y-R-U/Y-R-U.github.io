// ============================================================
// Transport Empire - Player Actions
// ============================================================

function collectBusiness(bizId) {
    const biz = game.businesses[bizId];
    if (!biz || !biz.readyToCollect) return;
    const earn = getBizEarning(bizId);
    game.money += earn;
    game.totalEarned += earn;
    biz.progress = 0;
    biz.readyToCollect = false;
    biz.returning = !biz.returning;
    AudioSystem.playSfx('earn');
    UI.updateMoney();
    UI.render();
    checkAchievements();
}

function buyBusiness(bizId) {
    const cost = getBizCost(bizId);
    if (game.money < cost) return;
    game.money -= cost;

    if (!game.businesses[bizId]) {
        game.businesses[bizId] = { level: 0, progress: 0, returning: false };
    }
    game.businesses[bizId].level++;
    AudioSystem.playSfx('buy');

    if (game.businesses[bizId].level === 1) {
        const idx = BUSINESS_DEFS.findIndex(b => b.id === bizId);
        viewRoute(idx);
    }

    UI.updateMoney();
    UI.render();
    checkAchievements();
    saveGame();
}

function buyBusinessBulk(bizId, count) {
    const totalCost = getBulkCost(bizId, count);
    if (game.money < totalCost) return;
    game.money -= totalCost;

    if (!game.businesses[bizId]) {
        game.businesses[bizId] = { level: 0, progress: 0, returning: false };
    }
    game.businesses[bizId].level += count;
    AudioSystem.playSfx('buy');

    UI.updateMoney();
    UI.render();
    checkAchievements();
    saveGame();
}

function unlockBusiness(bizId) {
    const def = BUSINESS_DEFS.find(b => b.id === bizId);
    if (game.money < def.unlockCost) return;
    game.money -= def.unlockCost;
    game.businesses[bizId] = { level: 1, progress: 0, returning: false };
    AudioSystem.playSfx('buy');

    const idx = BUSINESS_DEFS.findIndex(b => b.id === bizId);
    viewRoute(idx);

    UI.updateMoney();
    UI.render();
    checkAchievements();
    saveGame();
}

function buyUpgrade(upgradeId) {
    const u = UPGRADE_DEFS.find(x => x.id === upgradeId);
    if (!u || game.upgrades[u.id] || game.money < u.cost) return;
    game.money -= u.cost;
    game.upgrades[u.id] = true;
    AudioSystem.playSfx('buy');
    showToast(u.name + ' purchased!', 'event');

    UI.updateMoney();
    UI.render();
    checkAchievements();
    saveGame();
}

function buyPrestigeUpgrade(puId) {
    const pu = PRESTIGE_UPGRADES.find(x => x.id === puId);
    if (!pu) return;
    const level = getPrestigeLevel(pu.id);
    if (level >= pu.maxLevel) return;
    const cost = pu.cost * (level + 1);
    if (game.prestigePoints < cost) return;

    game.prestigePoints -= cost;
    game.prestigeUpgrades[pu.id] = level + 1;
    AudioSystem.playSfx('buy');
    showToast(pu.name + ' upgraded to Lv.' + (level + 1) + '!', 'event');

    UI.render();
    saveGame();
}

function doPrestige() {
    const earnable = getPrestigePointsEarnable();
    if (earnable <= 0) return;

    UI.showConfirm(
        'Prestige',
        `Reset all progress for +${earnable} Empire Points?`,
        () => {
            game.prestigePoints += earnable;
            game.lifetimePrestigePoints += earnable;
            game.totalPrestiges++;

            const preserved = {
                prestigePoints: game.prestigePoints,
                lifetimePrestigePoints: game.lifetimePrestigePoints,
                totalPrestiges: game.totalPrestiges,
                prestigeUpgrades: { ...game.prestigeUpgrades },
                achievements: { ...game.achievements },
                eventsCaught: game.eventsCaught,
                settings: { ...game.settings }
            };

            game = createDefaultState();
            Object.assign(game, preserved);
            game.money = getPrestigeStartMoney();

            AudioSystem.playSfx('prestige');
            showToast(`Prestige! +${earnable} Empire Points!`, 'achievement');
            SceneManager.showRoute(0);
            UI.fullRender();
            saveGame();
        }
    );
}

function viewRoute(idx) {
    SceneManager.showRoute(idx);
    SceneManager.loadVehicle(BUSINESS_DEFS[idx].vehicle);
    if (UI.activeTab === 'businesses') UI.render();
}

function checkAchievements() {
    const stats = getStats();
    for (const a of ACHIEVEMENT_DEFS) {
        if (game.achievements[a.id]) continue;
        if (a.check(stats)) {
            game.achievements[a.id] = true;
            showToast('\ud83c\udfc6 ' + a.name + '!', 'achievement');
            AudioSystem.playSfx('achievement');
        }
    }
}
