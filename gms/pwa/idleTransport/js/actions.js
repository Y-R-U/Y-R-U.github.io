// ============================================================
// Idle Transport Empire - Player Actions
// ============================================================

function collectRoute(rid) {
    const rt = G.routes[rid];
    if (!rt || !rt.readyCollect) return;
    const earn = getRouteEarn(rid);
    G.money += earn;
    G.totalEarned += earn;
    rt.progress = 0;
    rt.readyCollect = false;
    rt.returning = !rt.returning;
    Audio.sfx('earn');
    UI.updateHUD();
    UI.renderPane();
    checkAchievements();
}

function buyRoute(rid) {
    const cost = getRouteCost(rid);
    if (G.money < cost) return;
    G.money -= cost;
    if (!G.routes[rid]) G.routes[rid] = { level: 0, progress: 0, returning: false, readyCollect: false };
    G.routes[rid].level++;
    Audio.sfx('buy');

    // On first buy, rebuild scene and scroll to the room
    const idx = ROUTES.findIndex(r => r.id === rid);
    if (G.routes[rid].level === 1) {
        Scene.rebuildScene();
        Scene.scrollToRoom(idx);
        G.selectedRoute = idx;
    } else {
        // Refresh vehicle count visuals
        const room = Scene.rooms.find(r => r.routeIdx === idx);
        if (room) Scene.spawnVehiclesForRoom(room);
    }

    UI.updateHUD();
    UI.renderPane();
    checkAchievements();
    saveGame();
}

function buyRouteBulk(rid, n) {
    const cost = getBulkCost(rid, n);
    if (G.money < cost) return;
    G.money -= cost;
    if (!G.routes[rid]) G.routes[rid] = { level: 0, progress: 0, returning: false, readyCollect: false };
    G.routes[rid].level += n;
    Audio.sfx('buy');

    const idx = ROUTES.findIndex(r => r.id === rid);
    const room = Scene.rooms.find(r => r.routeIdx === idx);
    if (room) Scene.spawnVehiclesForRoom(room);

    UI.updateHUD();
    UI.renderPane();
    checkAchievements();
    saveGame();
}

function unlockRoute(rid) {
    const def = ROUTES.find(r => r.id === rid);
    if (G.money < def.unlockCost) return;
    G.money -= def.unlockCost;
    G.routes[rid] = { level: 1, progress: 0, returning: false, readyCollect: false };
    Audio.sfx('buy');

    const idx = ROUTES.findIndex(r => r.id === rid);
    Scene.rebuildScene();
    Scene.scrollToRoom(idx);
    G.selectedRoute = idx;

    UI.updateHUD();
    UI.renderPane();
    checkAchievements();
    saveGame();
}

function buyUpgrade(uid) {
    const u = UPGRADES.find(x => x.id === uid);
    if (!u || G.upgrades[u.id] || G.money < u.cost) return;
    G.money -= u.cost;
    G.upgrades[u.id] = true;
    Audio.sfx('buy');
    showToast(u.name + ' purchased!', 'green');
    UI.updateHUD();
    UI.renderPane();
    checkAchievements();
    saveGame();
}

function buyPrestigeUpg(pid) {
    const pu = PRESTIGE_DEFS.find(x => x.id === pid);
    if (!pu) return;
    const lv = pLv(pu.id);
    if (lv >= pu.max) return;
    const cost = pu.cost * (lv + 1);
    if (G.pp < cost) return;
    G.pp -= cost;
    G.pUpgrades[pu.id] = lv + 1;
    Audio.sfx('buy');
    showToast(pu.name + ' Lv.' + (lv + 1) + '!', 'green');
    UI.renderPane();
    UI.updateHUD();
    saveGame();
}

function doPrestige() {
    const earn = getPrestigeEarnable();
    if (earn <= 0) return;
    UI.showConfirm(
        'Prestige',
        'Reset all progress for +' + earn + ' Empire Points? Permanent upgrades and achievements are kept.',
        () => {
            G.pp += earn;
            G.lifetimePP += earn;
            G.totalPrestiges++;
            const keep = {
                pp: G.pp, lifetimePP: G.lifetimePP, totalPrestiges: G.totalPrestiges,
                pUpgrades: { ...G.pUpgrades }, achievements: { ...G.achievements },
                eventsCaught: G.eventsCaught, settings: { ...G.settings }, tutorialDone: true
            };
            G = newState();
            Object.assign(G, keep);
            G.money = pStartMoney();
            Audio.sfx('prestige');
            showToast('Prestige! +' + earn + ' EP!', 'gold');
            Scene.rebuildScene();
            UI.fullRender();
            saveGame();
        }
    );
}

function selectRoute(idx) {
    G.selectedRoute = idx;
    Scene.scrollToRoom(idx);
    UI.renderPane();
}

function checkAchievements() {
    const s = getStats();
    for (const a of ACHIEVEMENTS) {
        if (G.achievements[a.id]) continue;
        if (a.check(s)) {
            G.achievements[a.id] = true;
            showToast('\ud83c\udfc6 ' + a.name + '!', 'gold');
            Audio.sfx('achievement');
        }
    }
}
