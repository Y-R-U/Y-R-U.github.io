// main.js — Bootstrap, screen router, data loading
(async function () {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('./sw.js', { scope: './' });
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  }

  // Prevent default touch behaviors
  document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Init audio (lazy — resumed on first user gesture)
  Audio.init();

  // Load game data
  const BASE = './src/data/';
  let enemiesData, ingameData, metaData;

  try {
    const [eRes, iRes, mRes] = await Promise.all([
      fetch(BASE + 'enemies.json'),
      fetch(BASE + 'ingame-upgrades.json'),
      fetch(BASE + 'meta-upgrades.json')
    ]);
    enemiesData = await eRes.json();
    ingameData = await iRes.json();
    metaData = await mRes.json();
  } catch (e) {
    console.error('Failed to load game data:', e);
    // Use embedded fallback (minimal)
    enemiesData = { enemies: [] };
    ingameData = { upgrades: [] };
    metaData = { branches: [] };
  }

  // Init canvas
  const canvas = document.getElementById('gameCanvas');
  if (!canvas) {
    console.error('Canvas not found!');
    return;
  }

  // Init game
  Game.init(canvas);
  Game.setData(enemiesData, ingameData, metaData);

  // PWA install prompt
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    // Could show a custom install button here
  });

  // iOS Safari full-screen trick
  const iosMeta = document.querySelector('meta[name="apple-mobile-web-app-capable"]');
  if (!iosMeta) {
    const m = document.createElement('meta');
    m.name = 'apple-mobile-web-app-capable';
    m.content = 'yes';
    document.head.appendChild(m);
  }

  console.log('RCELL: Game initialized');
})();
