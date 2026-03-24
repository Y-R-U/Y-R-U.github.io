// ============================================================
// Idle Transport Empire - Audio System
// ============================================================

const Audio = {
    ctx: null,
    musicEl: null,
    trackIdx: 0,
    tracks: [],

    init() {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
        this.scanTracks();
    },

    async scanTracks() {
        this.tracks = [];
        for (let i = 1; i <= 10; i++) {
            try {
                const r = await fetch(`music/theme${i}.mp3`, { method: 'HEAD' });
                if (r.ok) this.tracks.push(i);
            } catch (e) {}
        }
        if (this.tracks.length > 0 && G.settings.music) this.playMusic();
    },

    playMusic() {
        if (!G.settings.music || this.tracks.length === 0) return;
        if (this.musicEl) { this.musicEl.pause(); this.musicEl = null; }
        const n = this.tracks[this.trackIdx % this.tracks.length];
        this.musicEl = new window.Audio(`music/theme${n}.mp3`);
        this.musicEl.volume = G.settings.musicVol;
        this.musicEl.addEventListener('ended', () => { this.trackIdx++; this.playMusic(); });
        this.musicEl.play().catch(() => {});
    },

    stopMusic() {
        if (this.musicEl) { this.musicEl.pause(); this.musicEl = null; }
    },

    setMusicVol(v) {
        G.settings.musicVol = v;
        if (this.musicEl) this.musicEl.volume = v;
    },

    sfx(type) {
        if (!G.settings.sfx || !this.ctx) return;
        try {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.connect(g); g.connect(this.ctx.destination);
            g.gain.value = G.settings.sfxVol * 0.12;
            const t = this.ctx.currentTime;
            switch (type) {
                case 'click':
                    o.frequency.setValueAtTime(600, t);
                    o.frequency.exponentialRampToValueAtTime(800, t + 0.05);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                    o.stop(t + 0.1); break;
                case 'buy':
                    o.frequency.setValueAtTime(400, t);
                    o.frequency.exponentialRampToValueAtTime(800, t + 0.15);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
                    o.stop(t + 0.2); break;
                case 'earn':
                    o.frequency.setValueAtTime(500, t);
                    o.frequency.exponentialRampToValueAtTime(700, t + 0.08);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
                    o.stop(t + 0.12); break;
                case 'prestige':
                    o.type = 'triangle';
                    o.frequency.setValueAtTime(300, t);
                    o.frequency.exponentialRampToValueAtTime(1200, t + 0.3);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
                    o.stop(t + 0.4); break;
                case 'achievement':
                    o.type = 'triangle';
                    o.frequency.setValueAtTime(523, t);
                    o.frequency.setValueAtTime(659, t + 0.1);
                    o.frequency.setValueAtTime(784, t + 0.2);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
                    o.stop(t + 0.35); break;
                case 'event':
                    o.type = 'square'; g.gain.value = G.settings.sfxVol * 0.06;
                    o.frequency.setValueAtTime(800, t);
                    o.frequency.exponentialRampToValueAtTime(1200, t + 0.1);
                    o.frequency.exponentialRampToValueAtTime(800, t + 0.2);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
                    o.stop(t + 0.25); break;
                default:
                    o.frequency.setValueAtTime(440, t);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
                    o.stop(t + 0.1);
            }
            o.start(t);
        } catch (e) {}
    },

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        if (G.settings.music && !this.musicEl && this.tracks.length > 0) this.playMusic();
    }
};
