// Audio manager - procedural SFX + music from files

export class AudioManager {
    constructor() {
        this.ctx = null;
        this.sfxEnabled = true;
        this.musicEnabled = true;
        this.sfxVolume = 0.5;
        this.musicVolume = 0.3;
        this.musicTracks = [];
        this.currentMusic = null;
        this.currentMusicSource = null;
        this.musicGain = null;
        this.sfxGain = null;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.value = this.musicVolume;
        this.musicGain.connect(this.ctx.destination);
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.value = this.sfxVolume;
        this.sfxGain.connect(this.ctx.destination);
        this.initialized = true;
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    async discoverMusic(basePath) {
        this.musicBasePath = basePath;
        this.musicTracks = [];
        for (let i = 1; i <= 9; i++) {
            const url = `${basePath}theme${i}.mp3`;
            try {
                const resp = await fetch(url, { method: 'HEAD' });
                if (resp.ok) {
                    this.musicTracks.push(url);
                }
            } catch (e) {
                // not found
            }
        }
        return this.musicTracks.length;
    }

    async playRandomMusic() {
        if (!this.musicEnabled || this.musicTracks.length === 0 || !this.initialized) return;

        // Pick a random track different from current
        let track;
        if (this.musicTracks.length === 1) {
            track = this.musicTracks[0];
        } else {
            do {
                track = this.musicTracks[Math.floor(Math.random() * this.musicTracks.length)];
            } while (track === this.currentMusic && this.musicTracks.length > 1);
        }

        this.currentMusic = track;
        this.stopMusic();

        try {
            const resp = await fetch(track);
            const buf = await resp.arrayBuffer();
            const audioBuf = await this.ctx.decodeAudioData(buf);

            this.currentMusicSource = this.ctx.createBufferSource();
            this.currentMusicSource.buffer = audioBuf;
            this.currentMusicSource.connect(this.musicGain);
            this.currentMusicSource.onended = () => {
                if (this.musicEnabled) this.playRandomMusic();
            };
            this.currentMusicSource.start();
        } catch (e) {
            // Failed to load, try next
            if (this.musicTracks.length > 1) {
                const idx = this.musicTracks.indexOf(track);
                if (idx !== -1) this.musicTracks.splice(idx, 1);
                this.playRandomMusic();
            }
        }
    }

    stopMusic() {
        if (this.currentMusicSource) {
            try { this.currentMusicSource.stop(); } catch(e) {}
            this.currentMusicSource = null;
        }
    }

    setSfxEnabled(v) {
        this.sfxEnabled = v;
    }

    setMusicEnabled(v) {
        this.musicEnabled = v;
        if (!v) {
            this.stopMusic();
        } else if (this.musicTracks.length > 0) {
            this.playRandomMusic();
        }
    }

    setSfxVolume(v) {
        this.sfxVolume = v;
        if (this.sfxGain) this.sfxGain.gain.value = v;
    }

    setMusicVolume(v) {
        this.musicVolume = v;
        if (this.musicGain) this.musicGain.gain.value = v;
    }

    // Procedural sound effects
    playCannon() {
        if (!this.sfxEnabled || !this.initialized) return;
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const noise = this._createNoise(0.15);

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.15);

        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        noise.connect(this.sfxGain);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);

        setTimeout(() => { try { noise.disconnect(); } catch(e) {} }, 200);
    }

    playHit() {
        if (!this.sfxEnabled || !this.initialized) return;
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.1);

        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
    }

    playExplosion() {
        if (!this.sfxEnabled || !this.initialized) return;
        const ctx = this.ctx;
        const noise = this._createNoise(0.4);
        noise.connect(this.sfxGain);
        setTimeout(() => { try { noise.disconnect(); } catch(e) {} }, 450);
    }

    playCoin() {
        if (!this.sfxEnabled || !this.initialized) return;
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.08);

        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);

        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.2);
    }

    playUpgrade() {
        if (!this.sfxEnabled || !this.initialized) return;
        const ctx = this.ctx;
        const notes = [523, 659, 784, 1047];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.1);
            gain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * 0.1 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.2);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(ctx.currentTime + i * 0.1);
            osc.stop(ctx.currentTime + i * 0.1 + 0.25);
        });
    }

    playPortEnter() {
        if (!this.sfxEnabled || !this.initialized) return;
        const ctx = this.ctx;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(660, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.4);
    }

    playDeath() {
        if (!this.sfxEnabled || !this.initialized) return;
        const ctx = this.ctx;
        const noise = this._createNoise(1.0);
        noise.connect(this.sfxGain);

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + 1.0);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.0);

        setTimeout(() => { try { noise.disconnect(); } catch(e) {} }, 1100);
    }

    _createNoise(duration) {
        const ctx = this.ctx;
        const bufSize = ctx.sampleRate * duration;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
        }
        const source = ctx.createBufferSource();
        source.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.value = 0.25;
        source.connect(gain);
        source.start();
        // Return gain node so caller can connect
        return gain;
    }
}
