// audio.js — Web Audio API minimal SFX
const Audio = (() => {
  let ctx = null;
  let enabled = true;
  let masterGain = null;

  function init() {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 0.3;
      masterGain.connect(ctx.destination);
    } catch (e) {
      console.warn('Web Audio not available:', e);
      enabled = false;
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function playTone(freq, type, duration, gainVal, detune) {
    if (!enabled || !ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      if (detune) osc.detune.value = detune;
      gain.gain.value = gainVal || 0.2;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch (e) {}
  }

  function playNoise(duration, gainVal) {
    if (!enabled || !ctx) return;
    try {
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = gainVal || 0.1;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      source.connect(gain);
      gain.connect(masterGain);
      source.start();
    } catch (e) {}
  }

  const sfx = {
    shoot() {
      playTone(800, 'square', 0.08, 0.15);
    },
    hit() {
      playNoise(0.05, 0.15);
      playTone(300, 'sawtooth', 0.1, 0.1);
    },
    enemyDie() {
      playTone(200, 'sawtooth', 0.15, 0.2);
      playTone(150, 'square', 0.1, 0.1);
    },
    levelUp() {
      // Rising chord
      setTimeout(() => playTone(440, 'sine', 0.2, 0.2), 0);
      setTimeout(() => playTone(550, 'sine', 0.2, 0.2), 80);
      setTimeout(() => playTone(660, 'sine', 0.3, 0.25), 160);
    },
    playerHurt() {
      playNoise(0.1, 0.3);
      playTone(150, 'square', 0.15, 0.2);
    },
    playerDie() {
      playTone(300, 'sawtooth', 0.5, 0.3);
      setTimeout(() => playTone(200, 'sawtooth', 0.5, 0.2), 200);
      setTimeout(() => playTone(100, 'sawtooth', 0.8, 0.15), 400);
    },
    collect() {
      playTone(600, 'sine', 0.08, 0.1);
    },
    waveStart() {
      playTone(220, 'sine', 0.3, 0.2);
      setTimeout(() => playTone(330, 'sine', 0.3, 0.2), 150);
    },
    bossSpawn() {
      for (let i = 0; i < 4; i++) {
        setTimeout(() => playTone(100 + i * 30, 'sawtooth', 0.3, 0.25), i * 100);
      }
    },
    win() {
      [330, 440, 550, 660, 880].forEach((f, i) => {
        setTimeout(() => playTone(f, 'sine', 0.4, 0.2), i * 100);
      });
    },
    upgrade() {
      playTone(500, 'sine', 0.15, 0.15);
      setTimeout(() => playTone(700, 'sine', 0.15, 0.15), 80);
    },
    aoe() {
      playNoise(0.2, 0.2);
      playTone(80, 'square', 0.2, 0.15);
    }
  };

  function setEnabled(val) { enabled = val; }
  function isEnabled() { return enabled; }
  function setVolume(vol) {
    if (masterGain) masterGain.gain.value = MathUtils.clamp(vol, 0, 1);
  }

  return { init, resume, sfx, setEnabled, isEnabled, setVolume };
})();
