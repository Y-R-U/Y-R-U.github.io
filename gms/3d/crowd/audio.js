'use strict';
/* ── audio.js ── AudioManager: Web Audio SFX + mp3 music loader ── */

class AudioManager {
  constructor() {
    this._ctx      = null;
    this.sfxOn     = true;
    this.musicOn   = true;
    this.vibrOn    = true;
    this.themes    = [];
    this._themeIdx = 0;
    this._current  = null; // currently playing Audio element
  }

  init(settings) {
    this.sfxOn   = settings.sfx    !== false;
    this.musicOn = settings.music  !== false;
    this.vibrOn  = settings.vibrate !== false;
    this._loadThemes();
  }

  // Lazy-create AudioContext (must be triggered by user gesture first)
  _getCtx() {
    if (!this._ctx) {
      try { this._ctx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (_) { return null; }
    }
    if (this._ctx.state === 'suspended') this._ctx.resume().catch(() => {});
    return this._ctx;
  }

  // ── Music ────────────────────────────────────────────────────────────
  async _loadThemes() {
    const found = [];
    for (let i = 1; i <= 9; i++) {
      const url = `music/theme${i}.mp3`;
      const a   = new Audio(url);
      a.preload  = 'none';
      const ok  = await new Promise(res => {
        a.addEventListener('canplaythrough', () => res(true),  { once: true });
        a.addEventListener('error',          () => res(false), { once: true });
        a.load();
        setTimeout(() => res(false), 3000);
      });
      if (ok) found.push(a);
    }
    // Shuffle
    for (let i = found.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [found[i], found[j]] = [found[j], found[i]];
    }
    this.themes    = found;
    this._themeIdx = 0;
  }

  playRandomTheme() {
    if (!this.musicOn || this.themes.length === 0) return;
    this._getCtx(); // ensure context is resumed
    this._playNext(Math.floor(Math.random() * this.themes.length));
  }

  _playNext(idx) {
    if (!this.musicOn || this.themes.length === 0) return;
    const a = this.themes[idx % this.themes.length];
    a.volume      = 0.45;
    a.currentTime = 0;
    a.play().catch(() => {});
    this._current  = a;
    this._themeIdx = idx;
    a.onended = () => this._playNext(idx + 1);
  }

  stopMusic() {
    if (this._current) {
      this._current.pause();
      this._current.currentTime = 0;
      this._current.onended = null;
      this._current = null;
    }
  }

  toggleMusic(on) {
    this.musicOn = on;
    if (on) { this.playRandomTheme(); } else { this.stopMusic(); }
  }

  toggleSfx(on)     { this.sfxOn  = on; }
  toggleVibrate(on) { this.vibrOn = on; }

  // ── SFX helpers ──────────────────────────────────────────────────────
  _tone(f1, f2, dur, type = 'sine', vol = 0.25) {
    if (!this.sfxOn) return;
    const ctx = this._getCtx();
    if (!ctx) return;
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(f1, t);
    if (f2 !== f1) osc.frequency.exponentialRampToValueAtTime(Math.max(f2, 10), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  playCollect()  { this._tone(700, 1400, 0.10, 'sine',     0.22); }
  playAbsorb()   { this._tone(400,   80, 0.35, 'sawtooth', 0.24); }
  playHit()      { this._tone(200,   80, 0.18, 'square',   0.24); }

  playLevelUp() {
    [523, 659, 784, 1047].forEach((f, i) =>
      setTimeout(() => this._tone(f, f, 0.14, 'sine', 0.28), i * 100)
    );
  }

  playGameOver() {
    [523, 415, 349, 262].forEach((f, i) =>
      setTimeout(() => this._tone(f, f, 0.2, 'sine', 0.28), i * 140)
    );
  }

  playVictory() {
    [523, 659, 784, 1047, 1319].forEach((f, i) =>
      setTimeout(() => this._tone(f, f, 0.15, 'sine', 0.30), i * 100)
    );
  }

  vibrate(pattern) {
    if (this.vibrOn && navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch (_) {}
    }
  }
}
