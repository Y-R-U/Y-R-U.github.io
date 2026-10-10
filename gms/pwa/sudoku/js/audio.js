// Audio Manager — handles background music cycling and sound effects
class AudioManager {
  constructor() {
    this.musicEnabled = false;
    this.soundEnabled = false;
    this.currentTrack = 0;
    this.totalTracks = 10;
    this.audio = null;
    this.availableTracks = [];
    this.tracksChecked = false;
    this.sfxCtx = null;

    this.loadSettings();
    localStorage.removeItem('sudokuTracks');   // retired HEAD-probe cache
    this.installUnlock();
  }

  // Browsers only start audio inside a user gesture, and on Android a touch's
  // pointerdown/touchstart doesn't count — touchend and click do. So every
  // gesture type gets a listener for the page's lifetime.
  installUnlock() {
    const unlock = () => {
      if (this.sfxCtx && this.sfxCtx.state !== 'running') this.sfxCtx.resume().catch(() => {});
      else if (!this.sfxCtx && this.soundEnabled) this.getSfxCtx();
      this.resumeIfNeeded();
    };
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) {
      document.addEventListener(type, unlock, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.sfxCtx) return;
      if (document.hidden) this.sfxCtx.suspend().catch(() => {});
      else this.sfxCtx.resume().catch(() => {});
    });
  }

  // Lazy-init a single shared AudioContext. Browsers cap concurrent contexts
  // (~6 in Chrome) and don't reclaim them, so creating one per sound leaks
  // and eventually silently breaks SFX. One context, reused forever.
  getSfxCtx() {
    if (!this.sfxCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      // Without this iOS routes Web Audio through the ringer, which the silent
      // switch mutes.
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* unsupported */ }
      this.sfxCtx = new Ctx();
    }
    if (this.sfxCtx.state !== 'running') this.sfxCtx.resume().catch(() => {});
    return this.sfxCtx;
  }

  loadSettings() {
    const saved = localStorage.getItem('sudokuAudio');
    if (saved) {
      try {
        const s = JSON.parse(saved);
        this.musicEnabled = s.music || false;
        this.soundEnabled = s.sound || false;
        this.currentTrack = s.currentTrack || 0;
      } catch (e) { /* ignore */ }
    }
  }

  saveSettings() {
    localStorage.setItem('sudokuAudio', JSON.stringify({
      music: this.musicEnabled,
      sound: this.soundEnabled,
      currentTrack: this.currentTrack
    }));
  }

  // music/tracks.json lists the theme numbers that exist (theme<n>.mp3). One
  // small request instead of probing ten files that mostly 404.
  async checkAvailableTracks() {
    if (this.tracksChecked) return this.tracksPromise;
    this.tracksChecked = true;
    this.tracksPromise = fetch('./music/tracks.json')
      .then(res => (res.ok ? res.json() : []))
      .then(list => {
        this.availableTracks = Array.isArray(list)
          ? list.filter(n => Number.isInteger(n) && n >= 1 && n <= this.totalTracks) : [];
      })
      .catch(() => { this.availableTracks = []; });
    return this.tracksPromise;
  }

  async setMusic(enabled) {
    this.musicEnabled = enabled;
    this.saveSettings();
    if (enabled) {
      await this.checkAvailableTracks();
      this.playNextTrack();
    } else {
      this.stopMusic();
    }
  }

  setSound(enabled) {
    this.soundEnabled = enabled;
    this.saveSettings();
  }

  async playNextTrack() {
    if (!this.musicEnabled) return;
    await this.checkAvailableTracks();

    if (this.availableTracks.length === 0) return;

    // Find next track in cycle
    if (this.currentTrack >= this.availableTracks.length) {
      this.currentTrack = 0;
    }

    const trackNum = this.availableTracks[this.currentTrack];
    this.currentTrack++;
    this.saveSettings();

    this.stopMusic();
    this.audio = new Audio(`./music/theme${trackNum}.mp3`);
    this.audio.volume = 0.4;
    this.audio.addEventListener('ended', () => this.playNextTrack());
    this.audio.addEventListener('error', () => this.playNextTrack());

    try {
      await this.audio.play();
    } catch (e) {
      // Autoplay blocked — will retry on next user interaction
    }
  }

  stopMusic() {
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }
  }

  // Play a short sound effect. Uses one shared AudioContext (see getSfxCtx)
  // and schedules a small attack/release envelope on the gain node so the
  // oscillator doesn't click on start/stop.
  playSound(name) {
    if (!this.soundEnabled) return;
    try {
      const ctx = this.getSfxCtx();
      if (!ctx) return;
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const t0 = ctx.currentTime;
      const env = (peak, dur, attack = 0.005, release = 0.04) => {
        // Ramp up then hold, then ramp down to zero just before stop.
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(peak, t0 + attack);
        gain.gain.setValueAtTime(peak, t0 + Math.max(attack, dur - release));
        gain.gain.linearRampToValueAtTime(0, t0 + dur);
        osc.start(t0);
        osc.stop(t0 + dur + 0.01);
      };

      switch (name) {
        case 'place':
          osc.frequency.setValueAtTime(600, t0);
          env(0.12, 0.08);
          break;
        case 'error':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(200, t0);
          env(0.10, 0.25);
          break;
        case 'win':
          // Major triad (C5 → E5 → G5) scheduled on the audio clock so the
          // notes fire even if the main thread is busy.
          osc.frequency.setValueAtTime(523, t0);
          osc.frequency.setValueAtTime(659, t0 + 0.15);
          osc.frequency.setValueAtTime(784, t0 + 0.30);
          env(0.15, 0.5, 0.005, 0.08);
          break;
        case 'click':
          osc.frequency.setValueAtTime(800, t0);
          env(0.06, 0.04, 0.003, 0.02);
          break;
        default:
          env(0.05, 0.05);
      }
    } catch (e) { /* Web Audio not available */ }
  }

  // Try resuming music after a user gesture (for autoplay policy)
  resumeIfNeeded() {
    if (!this.musicEnabled || !this.availableTracks.length) return;
    if (!this.audio) this.playNextTrack();
    else if (this.audio.paused) this.audio.play().catch(() => {});
  }
}
