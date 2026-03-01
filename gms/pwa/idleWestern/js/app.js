/**
 * app.js - Entry point, game loop, initialization
 */

const App = (() => {
  let lastTime = 0;
  let tickAccumulator = 0;
  const TICK_RATE = 1000 / 30; // 30fps for logic
  const UI_UPDATE_RATE = 250; // Update header 4x/sec
  let lastUIUpdate = 0;
  let achievementCheckTimer = 0;
  let tabRefreshTimer = 0;

  function init() {
    // Initialize all systems
    GameState.init();

    // Check for offline earnings before UI shows
    const offlineEarnings = GameState.calcOfflineEarnings();

    Effects.init();
    Events.init();
    UI.init();
    UI.initSettings();
    UI.updateHeader();

    // Show offline earnings if significant
    if (offlineEarnings > 0) {
      const state = GameState.getState();
      state.coins += offlineEarnings;
      state.totalEarned += offlineEarnings;
      state.lifetimeEarned += offlineEarnings;
      Effects.showOfflineEarnings(offlineEarnings);
    }

    // Start ambient effects
    Effects.startAmbientDust();

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Try relative path for non-root deployments
        navigator.serviceWorker.register('./sw.js').catch(err => {
          console.log('SW registration failed:', err);
        });
      });
    }

    // Start game loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  function gameLoop(timestamp) {
    const delta = timestamp - lastTime;
    lastTime = timestamp;

    // Accumulate time for fixed-step logic
    tickAccumulator += delta;
    while (tickAccumulator >= TICK_RATE) {
      GameState.doTick(TICK_RATE);
      tickAccumulator -= TICK_RATE;
    }

    // Update events
    Events.update();

    // Update UI periodically (not every frame)
    if (timestamp - lastUIUpdate >= UI_UPDATE_RATE) {
      UI.updateHeader();
      lastUIUpdate = timestamp;
    }

    // Refresh active tab every 2 seconds to update affordability
    tabRefreshTimer += delta;
    if (tabRefreshTimer >= 2000) {
      UI.renderTab();
      tabRefreshTimer = 0;
    }

    // Check achievements less frequently
    achievementCheckTimer += delta;
    if (achievementCheckTimer >= 2000) {
      const newAchievements = GameState.checkAchievements();
      for (const id of newAchievements) {
        const ach = GameData.ACHIEVEMENTS.find(a => a.id === id);
        if (ach) {
          Effects.showAchievement(ach.name, ach.icon);
        }
      }
      achievementCheckTimer = 0;
    }

    requestAnimationFrame(gameLoop);
  }

  return { init };
})();

// Boot when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
