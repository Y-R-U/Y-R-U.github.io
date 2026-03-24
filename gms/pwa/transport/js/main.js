// ============================================================
// Transport Empire - Main Entry Point & Game Loop
// ============================================================

let lastFrameTime = Date.now();
let saveTimer = 0;
let renderTimer = 0;
let fullRenderTimer = 0;

function gameLoop() {
    const now = Date.now();
    const dt = Math.min((now - lastFrameTime) / 1000, 0.5);
    lastFrameTime = now;

    // Expire finished bonuses
    game.activeBonuses = game.activeBonuses.filter(b => Date.now() < b.endTime);

    // Tick all businesses
    for (const def of BUSINESS_DEFS) {
        const biz = game.businesses[def.id];
        if (!biz || biz.level === 0) continue;

        const managed = hasManager(def.id);
        const time = getBizTime(def.id);

        if (managed) {
            // Auto-collect: progress continuously
            biz.progress += dt;
            while (biz.progress >= time) {
                biz.progress -= time;
                const earn = getBizEarning(def.id);
                game.money += earn;
                game.totalEarned += earn;
                biz.returning = !biz.returning;
            }
        } else {
            // Manual: progress until full, then wait for collect
            if (!biz.readyToCollect) {
                biz.progress += dt;
                if (biz.progress >= time) {
                    biz.progress = time;
                    biz.readyToCollect = true;
                }
            }
        }
    }

    // Animate 3D vehicles
    SceneManager.updateVehicles(dt);

    // Random events
    checkEvent();

    // Periodic UI & save
    saveTimer += dt;
    renderTimer += dt;

    if (renderTimer >= 0.25) {
        renderTimer = 0;
        UI.updateMoney();
        UI.updateProgressBars();
        UI._updateBonusBar();
    }

    // Re-render active panel every 1s for collect buttons, affordability, etc.
    fullRenderTimer += dt;
    if (fullRenderTimer >= 1) {
        fullRenderTimer = 0;
        UI.render();
    }

    if (saveTimer >= 15) {
        saveTimer = 0;
        game.lastOnline = Date.now();
        saveGame();
    }

    requestAnimationFrame(gameLoop);
}

// ---- PWA Install Prompt ----
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    document.getElementById('install-prompt').classList.add('show');
});

document.getElementById('install-btn').addEventListener('click', () => {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(() => {
            deferredInstallPrompt = null;
            document.getElementById('install-prompt').classList.remove('show');
        });
    }
});

document.getElementById('install-dismiss').addEventListener('click', () => {
    document.getElementById('install-prompt').classList.remove('show');
});

// ---- Bootstrap ----
async function init() {
    const loaderFill = document.getElementById('loader-fill');
    loaderFill.style.width = '20%';

    const hadSave = loadGame();
    loaderFill.style.width = '40%';

    AudioSystem.init();
    loaderFill.style.width = '50%';

    await SceneManager.init();
    loaderFill.style.width = '70%';

    // Preload vehicles for unlocked routes
    const loadPromises = [];
    for (const def of BUSINESS_DEFS) {
        if (game.businesses[def.id] && game.businesses[def.id].level > 0) {
            loadPromises.push(SceneManager.loadVehicle(def.vehicle));
        }
    }
    await Promise.all(loadPromises);
    loaderFill.style.width = '85%';

    // Show first active route
    let firstActive = 0;
    for (let i = 0; i < BUSINESS_DEFS.length; i++) {
        const biz = game.businesses[BUSINESS_DEFS[i].id];
        if (biz && biz.level > 0) { firstActive = i; break; }
    }
    SceneManager.showRoute(firstActive);
    loaderFill.style.width = '95%';

    UI.init();
    UI.fullRender();

    // Offline earnings
    if (hadSave) {
        const offline = calculateOfflineEarnings();
        if (offline > 1) {
            game.money += offline;
            game.totalEarned += offline;
            showToast('Welcome back! +' + formatMoney(offline) + ' earned offline!', 'event');
        }
    }

    // Resume audio on first interaction
    document.addEventListener('click', () => AudioSystem.resume(), { once: true });
    document.addEventListener('touchstart', () => AudioSystem.resume(), { once: true });

    scheduleNextEvent();
    loaderFill.style.width = '100%';

    // Fade out loading screen
    setTimeout(() => {
        const ls = document.getElementById('loading-screen');
        ls.style.transition = 'opacity 0.5s';
        ls.style.opacity = '0';
        setTimeout(() => { ls.style.display = 'none'; }, 500);
    }, 300);

    game.lastOnline = Date.now();
    gameLoop();

    // Register service worker
    if ('serviceWorker' in navigator) {
        try { await navigator.serviceWorker.register('sw.js'); } catch (e) {}
    }
}

init();
