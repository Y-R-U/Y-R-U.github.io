// ============================================================
// Idle Transport Empire - Main Entry & Game Loop
// ============================================================

let lastFrame = Date.now();
let saveTmr = 0, renderTmr = 0, fullTmr = 0;

function gameLoop() {
    const now = Date.now();
    const dt = Math.min((now - lastFrame) / 1000, 0.5);
    lastFrame = now;

    // Expire bonuses
    G.bonuses = G.bonuses.filter(b => Date.now() < b.endTime);

    // Tick routes
    for (const def of ROUTES) {
        const rt = G.routes[def.id];
        if (!rt || rt.level === 0) continue;

        const managed = hasManager(def.id);
        const time = getRouteTime(def.id);

        if (managed) {
            rt.progress += dt;
            while (rt.progress >= time) {
                rt.progress -= time;
                const earn = getRouteEarn(def.id);
                G.money += earn;
                G.totalEarned += earn;
                rt.returning = !rt.returning;
            }
        } else {
            if (!rt.readyCollect) {
                rt.progress += dt;
                if (rt.progress >= time) {
                    rt.progress = time;
                    rt.readyCollect = true;
                }
            }
        }
    }

    // Update 3D scene
    Scene.update(dt);

    // Events
    tickEvents();

    // UI updates
    saveTmr += dt;
    renderTmr += dt;

    if (renderTmr >= 0.25) {
        renderTmr = 0;
        UI.updateHUD();
        UI.updateBars();
        UI.updateBonusBar();
    }

    fullTmr += dt;
    if (fullTmr >= 1) {
        fullTmr = 0;
        UI.renderPane();
    }

    if (saveTmr >= 15) {
        saveTmr = 0;
        G.lastOnline = Date.now();
        saveGame();
    }

    requestAnimationFrame(gameLoop);
}

// ---- PWA Install ----
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    document.getElementById('pwa-prompt').classList.add('show');
});

document.getElementById('pwa-install').addEventListener('click', () => {
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => {
            deferredPrompt = null;
            document.getElementById('pwa-prompt').classList.remove('show');
        });
    }
});

document.getElementById('pwa-dismiss').addEventListener('click', () => {
    document.getElementById('pwa-prompt').classList.remove('show');
});

// ---- Tutorial ----
document.getElementById('tut-ok').addEventListener('click', () => {
    document.getElementById('tutorial').classList.remove('show');
    G.tutorialDone = true;
    saveGame();
});

// ---- Bootstrap ----
async function init() {
    const fill = document.getElementById('load-fill');
    fill.style.width = '15%';

    const hadSave = loadGame();
    fill.style.width = '30%';

    Audio.init();
    fill.style.width = '40%';

    Scene.init();
    fill.style.width = '55%';

    // Load initial vehicle for first route
    await Scene.loadVehicle(ROUTES[0].vehicle);
    fill.style.width = '65%';

    // Build rooms and load all needed vehicles
    Scene.buildAllRooms();
    fill.style.width = '75%';

    await Scene.loadRouteVehicles();
    fill.style.width = '85%';

    Scene.refreshRoomVehicles();
    fill.style.width = '90%';

    // Scroll to first active or selected route
    if (G.selectedRoute >= 0 && G.selectedRoute < ROUTES.length) {
        Scene.scrollToRoom(G.selectedRoute);
    }

    UI.init();
    UI.fullRender();
    fill.style.width = '95%';

    // Offline earnings
    if (hadSave) {
        const offline = calcOfflineEarnings();
        if (offline > 1) {
            G.money += offline;
            G.totalEarned += offline;
            showToast('Welcome back! +' + fmtMoney(offline) + ' offline!', 'green');
        }
    }

    // Show tutorial on first play
    if (!G.tutorialDone) {
        document.getElementById('tutorial').classList.add('show');
    }

    // Audio resume on first touch
    const resumeAudio = () => Audio.resume();
    document.addEventListener('click', resumeAudio, { once: true });
    document.addEventListener('touchstart', resumeAudio, { once: true });

    scheduleEvent();
    fill.style.width = '100%';

    // Fade out loading
    setTimeout(() => {
        const ls = document.getElementById('loading');
        ls.style.transition = 'opacity .5s';
        ls.style.opacity = '0';
        setTimeout(() => ls.style.display = 'none', 500);
    }, 300);

    G.lastOnline = Date.now();
    gameLoop();

    // Service worker
    if ('serviceWorker' in navigator) {
        try { await navigator.serviceWorker.register('sw.js'); } catch (e) {}
    }
}

init();
