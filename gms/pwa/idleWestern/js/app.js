/**
 * app.js - Entry point, game loop, initialization
 *
 * Boot flow:
 *   boot() → preload first video → afterSplash() →
 *   showDifficultySelect() (if new) → startGame() → story (if new) → game loop
 *
 * Owns the single bg-video element in scene-area.
 * Story.js and the theme system both funnel through
 * playSceneVideo() / clearStoryVideo() to avoid conflicts.
 */

const App = (() => {
  let lastTime = 0;
  let tickAccumulator = 0;
  const TICK_RATE = 1000 / 30; // 30fps for logic
  const UI_UPDATE_RATE = 250;  // Update header 4x/sec
  let lastUIUpdate = 0;
  let achievementCheckTimer = 0;
  let tabRefreshTimer = 0;
  let bgVideoCheckTimer = 0;
  let lastThemeVideoIndex = -1;

  const SPLASH_TIMEOUT = 5000; // Max 5s wait for first video

  // Track what's currently driving the video: 'story' | 'theme' | null
  let videoOwner = null;
  // Currently loaded video src so we don't reload the same file
  let currentVideoSrc = null;

  // ── Boot (entry point) ─────────────────────────────────────

  function boot() {
    // Init state first so we know if player is new or returning
    GameState.init();

    const state = GameState.getState();

    // Determine which video to preload first
    let firstVideoBase;
    if (!state.storyShown) {
      // New player: preload story0
      firstVideoBase = 'video/story0';
    } else {
      // Existing player: preload correct theme video
      let typesOwned = 0;
      for (const biz of GameData.BUSINESSES) {
        if ((state.businesses[biz.id]?.owned || 0) > 0) typesOwned++;
      }
      firstVideoBase = 'video/theme' + typesOwned;
    }

    // Race: video ready vs timeout
    let resolved = false;
    const done = () => {
      if (resolved) return;
      resolved = true;
      afterSplash();
    };

    // Try to load the first video
    resolveVideoSrc(firstVideoBase).then(src => {
      if (src && !resolved) {
        // Video file exists — wait for it to be playable
        const v = document.createElement('video');
        v.preload = 'auto';
        v.muted = true;
        v.oncanplaythrough = () => done();
        v.onerror = () => done();
        v.src = src;
      } else {
        done();
      }
    });

    // Timeout fallback
    setTimeout(done, SPLASH_TIMEOUT);
  }

  // ── After splash ───────────────────────────────────────────

  function afterSplash() {
    // Fade out splash screen
    const splash = document.getElementById('splash-screen');
    if (splash) {
      splash.classList.add('fade-out');
      setTimeout(() => splash.remove(), 600);
    }

    const state = GameState.getState();

    // If difficulty not chosen yet, show difficulty select
    if (!state.difficulty) {
      showDifficultySelect();
    } else {
      startGame();
    }
  }

  // ── Difficulty selection overlay ───────────────────────────

  function showDifficultySelect() {
    const completions = GameState.getCompletions();

    const overlay = document.createElement('div');
    overlay.className = 'difficulty-overlay';
    overlay.id = 'difficulty-overlay';

    let cardsHtml = '';
    for (const [key, cfg] of Object.entries(GameData.DIFFICULTY_CONFIG)) {
      const unlocked = GameState.isDifficultyUnlocked(key);
      const completed = completions[key] === true;
      const lockedClass = unlocked ? '' : 'locked';
      const completedBadge = completed ? '<span class="diff-completed">\u2705 Completed</span>' : '';
      const warningHtml = cfg.warning ? '<div class="diff-warning">' + cfg.warning + '</div>' : '';
      const lockIcon = unlocked ? '' : '<span class="diff-lock">\uD83D\uDD12</span>';

      cardsHtml += `
        <button class="diff-card ${lockedClass}" data-diff="${key}" ${unlocked ? '' : 'disabled'}>
          <div class="diff-card-icon">${cfg.icon} ${lockIcon}</div>
          <div class="diff-card-label">${cfg.label}</div>
          <div class="diff-card-desc">${cfg.desc}</div>
          ${warningHtml}
          ${completedBadge}
        </button>
      `;
    }

    overlay.innerHTML = `
      <div class="difficulty-box">
        <div class="difficulty-title">Choose Your Path</div>
        <div class="difficulty-cards">${cardsHtml}</div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Bind click handlers
    overlay.querySelectorAll('.diff-card:not(.locked)').forEach(btn => {
      btn.addEventListener('click', () => {
        const diff = btn.dataset.diff;
        const state = GameState.getState();
        state.difficulty = diff;
        GameState.save();

        // Remove overlay with fade
        overlay.classList.add('difficulty-fade-out');
        setTimeout(() => {
          overlay.remove();
          startGame();
        }, 400);
      });
    });
  }

  // ── Reveal game UI ─────────────────────────────────────────

  function revealGameUI() {
    const ids = ['game-header', 'scene-area', 'tab-content', 'bottom-nav'];
    for (const id of ids) {
      document.getElementById(id)?.classList.remove('hidden');
    }
  }

  // ── Start game (formerly init) ─────────────────────────────

  function startGame() {
    // GameState.init() was already called in boot()
    revealGameUI();

    const offlineEarnings = GameState.calcOfflineEarnings();

    Effects.init();
    Events.init();
    UI.init();
    UI.initSettings();
    UI.updateHeader();

    if (offlineEarnings > 0) {
      const state = GameState.getState();
      state.coins += offlineEarnings;
      state.totalEarned += offlineEarnings;
      state.lifetimeEarned += offlineEarnings;
      Effects.showOfflineEarnings(offlineEarnings);
    }

    Effects.startAmbientDust();

    // Create the single bg-video element inside scene-area
    initSceneVideo();

    // Preload video files in the background
    preloadVideos();

    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.log('SW registration failed:', err);
      });
    }

    // Show story intro for new games
    const state = GameState.getState();
    if (!state.storyShown) {
      Story.start();
    } else {
      // No story – go straight to theme video
      updateThemeVideo();
    }

    lastTime = performance.now();
    requestAnimationFrame(gameLoop);
  }

  // ── Scene video element ──────────────────────────────────

  function initSceneVideo() {
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
  }

  // ── Preload videos ───────────────────────────────────────

  function preloadVideos() {
    // Story videos: story0 – story3
    for (let i = 0; i <= 3; i++) {
      preloadOne('video/story' + i + '.mp4');
      preloadOne('video/story' + i + '.webm');
    }
    // Theme videos: theme0 – theme10
    for (let i = 0; i <= 10; i++) {
      preloadOne('video/theme' + i + '.mp4');
      preloadOne('video/theme' + i + '.webm');
    }
  }

  function preloadOne(href) {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'video';
    link.href = href;
    // Silently fail for missing files (404s are expected)
    link.onerror = () => link.remove();
    document.head.appendChild(link);
  }

  // ── Public: play a named video in the scene area (loop) ──

  /**
   * Play video/{name}.mp4 (or .webm) in the scene bg-video.
   * Called by Story.js for story cutscenes.
   * The video loops until replaced by another playSceneVideo
   * call or by clearStoryVideo().
   */
  function playSceneVideo(name) {
    videoOwner = 'story';
    const basePath = 'video/' + name;
    resolveVideoSrc(basePath).then(src => {
      if (src) {
        setSceneVideoSrc(src);
      }
      // If file doesn't exist, leave the current video (or CSS bg) as-is
    });
  }

  /**
   * Called when the story finishes.  Hands control back to the
   * theme-video system so it can show the correct theme video.
   */
  function clearStoryVideo() {
    videoOwner = null;
    lastThemeVideoIndex = -1; // force re-evaluation
    updateThemeVideo();
  }

  // ── Theme video (business-count driven) ──────────────────

  function updateThemeVideo() {
    // Don't override if the story currently owns the video
    if (videoOwner === 'story') return;

    const state = GameState.getState();
    let typesOwned = 0;
    for (const biz of GameData.BUSINESSES) {
      if ((state.businesses[biz.id]?.owned || 0) > 0) typesOwned++;
    }

    const idx = typesOwned;
    if (idx === lastThemeVideoIndex) return;
    lastThemeVideoIndex = idx;

    videoOwner = 'theme';
    const basePath = 'video/theme' + idx;
    resolveVideoSrc(basePath).then(src => {
      // Only apply if we're still the owner (story may have started)
      if (videoOwner !== 'theme') return;
      if (src) {
        setSceneVideoSrc(src);
      } else {
        hideSceneVideo();
      }
    });
  }

  // ── Internal helpers ─────────────────────────────────────

  /**
   * Try basePath.mp4 then basePath.webm.
   * Resolves with a valid src string, or null.
   */
  function resolveVideoSrc(basePath) {
    return tryVideoFile(basePath + '.mp4').then(src => {
      if (src) return src;
      return tryVideoFile(basePath + '.webm');
    });
  }

  function tryVideoFile(src) {
    return new Promise(resolve => {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.onloadedmetadata = () => resolve(src);
      v.onerror = () => resolve(null);
      v.src = src;
    });
  }

  function setSceneVideoSrc(src) {
    const video = document.getElementById('bg-video');
    if (!video) return;
    // Avoid reloading the same file
    if (src === currentVideoSrc) return;
    currentVideoSrc = src;

    video.src = src;
    video.classList.remove('hidden');
    video.play().catch(() => {});

    // Hide CSS background
    document.querySelector('.scene-sky')?.classList.add('hidden');
    document.querySelector('.scene-mountains')?.classList.add('hidden');
    document.querySelector('.scene-ground')?.classList.add('hidden');
  }

  function hideSceneVideo() {
    const video = document.getElementById('bg-video');
    if (!video) return;
    video.pause();
    video.removeAttribute('src');
    video.load(); // reset
    video.classList.add('hidden');
    currentVideoSrc = null;

    // Restore CSS background
    document.querySelector('.scene-sky')?.classList.remove('hidden');
    document.querySelector('.scene-mountains')?.classList.remove('hidden');
    document.querySelector('.scene-ground')?.classList.remove('hidden');
  }

  // ── Game loop ────────────────────────────────────────────

  function gameLoop(timestamp) {
    const delta = timestamp - lastTime;
    lastTime = timestamp;

    tickAccumulator += delta;
    while (tickAccumulator >= TICK_RATE) {
      GameState.doTick(TICK_RATE);
      tickAccumulator -= TICK_RATE;
    }

    Events.update();

    if (timestamp - lastUIUpdate >= UI_UPDATE_RATE) {
      UI.updateHeader();
      lastUIUpdate = timestamp;
    }

    tabRefreshTimer += delta;
    if (tabRefreshTimer >= 2000) {
      UI.renderTab();
      tabRefreshTimer = 0;
    }

    achievementCheckTimer += delta;
    if (achievementCheckTimer >= 2000) {
      const newAchievements = GameState.checkAchievements();
      for (const id of newAchievements) {
        const ach = GameData.ACHIEVEMENTS.find(a => a.id === id);
        if (ach) Effects.showAchievement(ach.name, ach.icon);
      }
      achievementCheckTimer = 0;
    }

    // Check theme video periodically (only when story isn't active)
    bgVideoCheckTimer += delta;
    if (bgVideoCheckTimer >= 5000) {
      updateThemeVideo();
      bgVideoCheckTimer = 0;
    }

    requestAnimationFrame(gameLoop);
  }

  return { boot, playSceneVideo, clearStoryVideo, updateThemeVideo };
})();

// Boot when DOM is ready
document.addEventListener('DOMContentLoaded', App.boot);
