/* ===== AUDIO SYSTEM ===== */
const AudioManager = (() => {
  let audioCtx = null;
  let soundEnabled = true;
  let musicEnabled = true;
  let musicElement = null;
  let currentThemeIndex = -1;

  function getCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Synthesized sound effects using Web Audio API
  function playHit() {
    if (!soundEnabled) return;
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }

  function playShoot() {
    if (!soundEnabled) return;
    try {
      const ctx = getCtx();
      const bufferSize = ctx.sampleRate * 0.08;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
    } catch (e) {}
  }

  function playExplosion() {
    if (!soundEnabled) return;
    try {
      const ctx = getCtx();
      const bufferSize = ctx.sampleRate * 0.3;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
    } catch (e) {}
  }

  function playDeath() {
    if (!soundEnabled) return;
    try {
      const ctx = getCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain).connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.25);
    } catch (e) {}
  }

  function playVictory() {
    if (!soundEnabled) return;
    try {
      const ctx = getCtx();
      const notes = [523, 659, 784, 1047];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + i * 0.12 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.12);
        osc.stop(ctx.currentTime + i * 0.12 + 0.3);
      });
    } catch (e) {}
  }

  function playDefeat() {
    if (!soundEnabled) return;
    try {
      const ctx = getCtx();
      const notes = [400, 350, 300, 200];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + i * 0.15 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.15);
        osc.stop(ctx.currentTime + i * 0.15 + 0.35);
      });
    } catch (e) {}
  }

  function playSpecial() {
    if (!soundEnabled) return;
    try {
      const ctx = getCtx();
      // Whoosh + explosion
      const bufferSize = ctx.sampleRate * 0.5;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        const t = i / bufferSize;
        data[i] = (Math.random() * 2 - 1) * (t < 0.3 ? t / 0.3 : Math.pow(1 - (t - 0.3) / 0.7, 1.5)) * 0.8;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.3;
      src.connect(gain).connect(ctx.destination);
      src.start();
    } catch (e) {}
  }

  // Music management
  function playThemeMusic(themeIndex) {
    if (!musicEnabled) return;
    if (currentThemeIndex === themeIndex && musicElement && !musicElement.paused) return;
    stopMusic();
    currentThemeIndex = themeIndex;
    const src = `music/theme${themeIndex + 1}.mp3`;
    musicElement = new Audio(src);
    musicElement.loop = true;
    musicElement.volume = 0.3;
    musicElement.play().catch(() => {
      // File doesn't exist, that's fine
      musicElement = null;
    });
  }

  function stopMusic() {
    if (musicElement) {
      musicElement.pause();
      musicElement.src = '';
      musicElement = null;
    }
    currentThemeIndex = -1;
  }

  function setSoundEnabled(v) { soundEnabled = v; }
  function setMusicEnabled(v) {
    musicEnabled = v;
    if (!v) stopMusic();
  }
  function isSoundEnabled() { return soundEnabled; }
  function isMusicEnabled() { return musicEnabled; }

  return {
    playHit, playShoot, playExplosion, playDeath,
    playVictory, playDefeat, playSpecial,
    playThemeMusic, stopMusic,
    setSoundEnabled, setMusicEnabled,
    isSoundEnabled, isMusicEnabled,
  };
})();
