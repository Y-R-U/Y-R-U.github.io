/* ===== APP ENTRY POINT ===== */
(function () {
  'use strict';

  const loaderFill = document.querySelector('.loader-fill');
  const loaderText = document.querySelector('.loader-text');
  const loadingScreen = document.getElementById('loading-screen');

  let progress = 0;

  function setProgress(pct, msg) {
    progress = pct;
    loaderFill.style.width = pct + '%';
    loaderText.textContent = msg;
  }

  async function boot() {
    setProgress(10, 'Initializing canvas...');

    // Init graphics
    const canvas = document.getElementById('gameCanvas');
    Graphics.init(canvas);

    setProgress(30, 'Loading graphics...');
    await delay(100);

    // Init UI
    setProgress(50, 'Building interface...');
    UI.init();
    await delay(100);

    // Register service worker
    setProgress(70, 'Registering PWA...');
    if ('serviceWorker' in navigator) {
      try {
        await navigator.serviceWorker.register('./sw.js');
      } catch (e) {
        console.warn('SW registration failed:', e);
      }
    }
    await delay(100);

    setProgress(90, 'Preparing battle...');
    await delay(200);

    setProgress(100, 'Ready!');
    await delay(300);

    // Hide loading screen
    loadingScreen.classList.add('fade-out');
    setTimeout(() => {
      loadingScreen.style.display = 'none';
    }, 500);

    // Show intro
    UI.showIntro();
  }

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Prevent default touch behaviors
  document.addEventListener('touchmove', e => {
    if (e.target.closest('.panel')) return; // allow scroll in panels
    e.preventDefault();
  }, { passive: false });

  // Start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
