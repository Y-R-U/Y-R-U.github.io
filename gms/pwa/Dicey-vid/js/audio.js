/* ============================================
   DICEY - Audio Manager
   Gracefully handles missing audio files
   ============================================ */

const AudioManager = {
    sfxEnabled: true,
    musicEnabled: true,
    currentTrack: null,
    musicTracks: [],
    initialized: false,

    init() {
        this.sfxEnabled = localStorage.getItem('dicey_sfx') !== 'false';
        this.musicEnabled = localStorage.getItem('dicey_music') !== 'false';
        this.discoverMusic();
        this.initialized = true;
    },

    async discoverMusic() {
        this.musicTracks = [];
        for (let i = 1; i <= 10; i++) {
            const path = `music/theme${i}.mp3`;
            try {
                const resp = await fetch(path, { method: 'HEAD' });
                if (resp.ok) {
                    this.musicTracks.push(path);
                }
            } catch (e) {
                // File doesn't exist, skip
            }
        }
    },

    playMusic() {
        if (!this.musicEnabled || this.musicTracks.length === 0) return;
        if (this.currentTrack) {
            this.currentTrack.play().catch(() => {});
            return;
        }
        const idx = Utils.rand(0, this.musicTracks.length - 1);
        const audio = new Audio(this.musicTracks[idx]);
        audio.loop = true;
        audio.volume = 0.3;
        audio.play().catch(() => {});
        this.currentTrack = audio;
    },

    stopMusic() {
        if (this.currentTrack) {
            this.currentTrack.pause();
        }
    },

    toggleMusic() {
        this.musicEnabled = !this.musicEnabled;
        localStorage.setItem('dicey_music', this.musicEnabled);
        if (this.musicEnabled) {
            this.playMusic();
        } else {
            this.stopMusic();
        }
        return this.musicEnabled;
    },

    toggleSfx() {
        this.sfxEnabled = !this.sfxEnabled;
        localStorage.setItem('dicey_sfx', this.sfxEnabled);
        return this.sfxEnabled;
    },

    // Simple synthesized sounds using Web Audio API
    _ctx: null,
    _getCtx() {
        if (!this._ctx) {
            this._ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return this._ctx;
    },

    playSfx(type) {
        if (!this.sfxEnabled) return;
        try {
            const ctx = this._getCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            switch (type) {
                case 'roll':
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(200, ctx.currentTime);
                    osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.15);
                    gain.gain.setValueAtTime(0.15, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
                    osc.start(); osc.stop(ctx.currentTime + 0.2);
                    break;
                case 'coin':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(800, ctx.currentTime);
                    osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.08);
                    gain.gain.setValueAtTime(0.12, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
                    osc.start(); osc.stop(ctx.currentTime + 0.2);
                    break;
                case 'buy':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(400, ctx.currentTime);
                    osc.frequency.linearRampToValueAtTime(800, ctx.currentTime + 0.1);
                    osc.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.2);
                    gain.gain.setValueAtTime(0.1, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
                    osc.start(); osc.stop(ctx.currentTime + 0.25);
                    break;
                case 'pay':
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(400, ctx.currentTime);
                    osc.frequency.linearRampToValueAtTime(150, ctx.currentTime + 0.2);
                    gain.gain.setValueAtTime(0.1, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
                    osc.start(); osc.stop(ctx.currentTime + 0.25);
                    break;
                case 'jail':
                    osc.type = 'square';
                    osc.frequency.setValueAtTime(300, ctx.currentTime);
                    osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3);
                    gain.gain.setValueAtTime(0.12, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.35);
                    osc.start(); osc.stop(ctx.currentTime + 0.35);
                    break;
                case 'win':
                    osc.type = 'sine';
                    [523, 659, 784, 1047].forEach((f, i) => {
                        osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.15);
                    });
                    gain.gain.setValueAtTime(0.12, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.7);
                    osc.start(); osc.stop(ctx.currentTime + 0.7);
                    break;
                case 'click':
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(600, ctx.currentTime);
                    gain.gain.setValueAtTime(0.08, ctx.currentTime);
                    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
                    osc.start(); osc.stop(ctx.currentTime + 0.05);
                    break;
                default:
                    osc.disconnect();
                    gain.disconnect();
            }
        } catch (e) {
            // Audio not available
        }
    }
};
