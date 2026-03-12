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

    this.loadSettings();
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

  // Probe which music files actually exist
  async checkAvailableTracks() {
    if (this.tracksChecked) return;
    this.tracksChecked = true;
    this.availableTracks = [];

    const checks = [];
    for (let i = 1; i <= this.totalTracks; i++) {
      checks.push(
        fetch(`./music/theme${i}.mp3`, { method: 'HEAD' })
          .then(res => { if (res.ok) this.availableTracks.push(i); })
          .catch(() => { /* file not available */ })
      );
    }
    await Promise.all(checks);
    this.availableTracks.sort((a, b) => a - b);
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

  // Play a short sound effect
  playSound(name) {
    if (!this.soundEnabled) return;
    // Simple synthesised sounds using Web Audio API
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      switch (name) {
        case 'place':
          osc.frequency.value = 600;
          gain.gain.value = 0.12;
          osc.start();
          osc.stop(ctx.currentTime + 0.08);
          break;
        case 'error':
          osc.frequency.value = 200;
          osc.type = 'sawtooth';
          gain.gain.value = 0.1;
          osc.start();
          osc.stop(ctx.currentTime + 0.25);
          break;
        case 'win':
          osc.frequency.value = 523;
          gain.gain.value = 0.15;
          osc.start();
          setTimeout(() => osc.frequency.value = 659, 150);
          setTimeout(() => osc.frequency.value = 784, 300);
          osc.stop(ctx.currentTime + 0.5);
          break;
        case 'click':
          osc.frequency.value = 800;
          gain.gain.value = 0.06;
          osc.start();
          osc.stop(ctx.currentTime + 0.04);
          break;
        default:
          osc.start();
          osc.stop(ctx.currentTime + 0.05);
      }
    } catch (e) { /* Web Audio not available */ }
  }

  // Try resuming music after a user gesture (for autoplay policy)
  resumeIfNeeded() {
    if (this.musicEnabled && (!this.audio || this.audio.paused)) {
      this.playNextTrack();
    }
  }
}
