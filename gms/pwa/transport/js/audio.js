// ============================================================
// Transport Empire - Audio System
// ============================================================

const AudioSystem = {
    ctx: null,
    musicEl: null,
    currentTrack: 0,
    availableTracks: [],

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('AudioContext not available');
        }
        this.scanTracks();
    },

    async scanTracks() {
        this.availableTracks = [];
        for (let i = 1; i <= 10; i++) {
            try {
                const resp = await fetch(`music/theme${i}.mp3`, { method: 'HEAD' });
                if (resp.ok) this.availableTracks.push(i);
            } catch (e) {
                // Track not found, skip
            }
        }
        if (this.availableTracks.length > 0 && game.settings.music) {
            this.playMusic();
        }
    },

    playMusic() {
        if (!game.settings.music || this.availableTracks.length === 0) return;
        if (this.musicEl) {
            this.musicEl.pause();
            this.musicEl = null;
        }
        const trackNum = this.availableTracks[this.currentTrack % this.availableTracks.length];
        this.musicEl = new Audio(`music/theme${trackNum}.mp3`);
        this.musicEl.volume = game.settings.musicVol;
        this.musicEl.addEventListener('ended', () => {
            this.currentTrack++;
            this.playMusic();
        });
        this.musicEl.play().catch(() => {});
    },

    stopMusic() {
        if (this.musicEl) {
            this.musicEl.pause();
            this.musicEl = null;
        }
    },

    setMusicVolume(v) {
        game.settings.musicVol = v;
        if (this.musicEl) this.musicEl.volume = v;
    },

    playSfx(type) {
        if (!game.settings.sfx || !this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            gain.gain.value = game.settings.sfxVol * 0.15;
            const t = this.ctx.currentTime;

            switch (type) {
                case 'click':
                    osc.frequency.setValueAtTime(600, t);
                    osc.frequency.exponentialRampToValueAtTime(800, t + 0.05);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                    osc.stop(t + 0.1);
                    break;
                case 'buy':
                    osc.frequency.setValueAtTime(400, t);
                    osc.frequency.exponentialRampToValueAtTime(600, t + 0.1);
                    osc.frequency.exponentialRampToValueAtTime(800, t + 0.15);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                    osc.stop(t + 0.2);
                    break;
                case 'earn':
                    osc.frequency.setValueAtTime(500, t);
                    osc.frequency.exponentialRampToValueAtTime(700, t + 0.08);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                    osc.stop(t + 0.12);
                    break;
                case 'prestige':
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(300, t);
                    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                    osc.stop(t + 0.4);
                    break;
                case 'achievement':
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(523, t);
                    osc.frequency.setValueAtTime(659, t + 0.1);
                    osc.frequency.setValueAtTime(784, t + 0.2);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                    osc.stop(t + 0.35);
                    break;
                case 'event':
                    osc.type = 'square';
                    gain.gain.value = game.settings.sfxVol * 0.08;
                    osc.frequency.setValueAtTime(800, t);
                    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
                    osc.frequency.exponentialRampToValueAtTime(800, t + 0.2);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    osc.stop(t + 0.25);
                    break;
                default:
                    osc.frequency.setValueAtTime(440, t);
                    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                    osc.stop(t + 0.1);
            }
            osc.start(t);
        } catch (e) {
            // Audio play failed silently
        }
    },

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        if (game.settings.music && !this.musicEl && this.availableTracks.length > 0) {
            this.playMusic();
        }
    }
};
