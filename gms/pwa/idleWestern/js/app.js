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
  let bgVideoCheckTimer = 0;
  let lastBgVideoIndex = -1;

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

    // Initialize background video system
    initBackgroundVideo();

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.log('SW registration failed:', err);
      });
    }

    // Show story intro for new games (no save data existed)
    const state = GameState.getState();
    if (!state.storyShown) {
      Story.start();
    }

    // Start game loop
    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  function initBackgroundVideo() {
    const scene = document.getElementById('scene-area');
    const video = document.createElement('video');
    video.id = 'bg-video';
    video.className = 'bg-video hidden';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    scene.insertBefore(video, scene.firstChild);
    updateBackgroundVideo();
  }

  function updateBackgroundVideo() {
    const state = GameState.getState();
    // Count how many business types are owned
    let typesOwned = 0;
    for (const biz of GameData.BUSINESSES) {
      if ((state.businesses[biz.id]?.owned || 0) > 0) typesOwned++;
    }
    // theme0.mp4 = no businesses, theme1.mp4 = 1 biz, ... theme10.mp4 = all 10
    const videoIndex = typesOwned;
    if (videoIndex === lastBgVideoIndex) return;
    lastBgVideoIndex = videoIndex;

    const video = document.getElementById('bg-video');
    if (!video) return;

    // Try mp4, then webm
    const basePath = 'video/theme' + videoIndex;
    const tryLoad = (ext) => {
      return new Promise((resolve) => {
        const testVideo = document.createElement('video');
        testVideo.preload = 'metadata';
        testVideo.onloadedmetadata = () => resolve(basePath + '.' + ext);
        testVideo.onerror = () => resolve(null);
        testVideo.src = basePath + '.' + ext;
      });
    };

    tryLoad('mp4').then(src => {
      if (src) return src;
      return tryLoad('webm');
    }).then(src => {
      if (src) {
        video.src = src;
        video.classList.remove('hidden');
        video.play().catch(() => {});
        // Hide CSS background elements when video is active
        document.querySelector('.scene-sky')?.classList.add('hidden');
        document.querySelector('.scene-mountains')?.classList.add('hidden');
        document.querySelector('.scene-ground')?.classList.add('hidden');
      } else {
        video.classList.add('hidden');
        video.removeAttribute('src');
        // Show CSS background when no video
        document.querySelector('.scene-sky')?.classList.remove('hidden');
        document.querySelector('.scene-mountains')?.classList.remove('hidden');
        document.querySelector('.scene-ground')?.classList.remove('hidden');
      }
    });
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

    // Check background video every 5 seconds
    bgVideoCheckTimer += delta;
    if (bgVideoCheckTimer >= 5000) {
      updateBackgroundVideo();
      bgVideoCheckTimer = 0;
    }

    requestAnimationFrame(gameLoop);
  }

  return { init, updateBackgroundVideo };
})();

// Boot when DOM is ready
document.addEventListener('DOMContentLoaded', App.init);
