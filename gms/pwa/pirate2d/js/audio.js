// Audio manager - procedural SFX + music from files + creepy music unlock

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

        // Creepy music tracks - locked until unlocked by story
        this.creepyTracks = {}; // { 'theme_creepy1.mp3': url, ... }
        this.unlockedCreepy = new Set(); // Set of unlocked creepy track keys
        this._loadCreepyState();
    }

    init() {
        if (this.initialized) return;
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.musicGain = this.ctx.createGain();
            this.musicGain.gain.value = this.musicVolume;
            this.musicGain.connect(this.ctx.destination);
            this.sfxGain = this.ctx.createGain();
            this.sfxGain.gain.value = this.sfxVolume;
            this.sfxGain.connect(this.ctx.destination);
            this.initialized = true;
        } catch (e) {
            this.initialized = false;
        }
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    async discoverMusic(basePath) {
        this.musicBasePath = basePath;
        this.musicTracks = [];
        this.creepyTracks = {};

        // Discover regular themes
        for (let i = 1; i <= 9; i++) {
            const url = `${basePath}theme${i}.mp3`;
            try {
                const resp = await fetch(url, { method: 'HEAD' });
                if (resp.ok) {
                    this.musicTracks.push(url);
                }
            } catch (e) {}
        }

        // Discover creepy themes (locked by default)
        for (let i = 1; i <= 4; i++) {
            const filename = `theme_creepy${i}.mp3`;
            const url = `${basePath}${filename}`;
            try {
                const resp = await fetch(url, { method: 'HEAD' });
                if (resp.ok) {
                    this.creepyTracks[filename] = url;
                }
            } catch (e) {}
        }

        return this.musicTracks.length;
    }

    // Unlock a creepy track and immediately play it
    unlockCreepyTrack(number) {
        const filename = `theme_creepy${number}.mp3`;
        const url = this.creepyTracks[filename];

        if (!url) return false; // Track doesn't exist, silently continue

        if (this.unlockedCreepy.has(filename)) return false; // Already unlocked

        this.unlockedCreepy.add(filename);
        // Add to regular rotation
        if (!this.musicTracks.includes(url)) {
            this.musicTracks.push(url);
        }
        this._saveCreepyState();

        // Stop current music and play the newly unlocked track
        if (this.musicEnabled && this.initialized) {
            this.stopMusic();
            this._playSpecificTrack(url);
        }

        return true;
    }

    // Get list of available tracks for rotation (regular + unlocked creepy)
    _getAvailableTracks() {
        return this.musicTracks;
    }

    async _playSpecificTrack(trackUrl) {
        if (!this.musicEnabled || !this.initialized) return;
        if (this._musicLoading) return;
        this._musicLoading = true;

        this.currentMusic = trackUrl;
        this.stopMusic();

        try {
            const resp = await fetch(trackUrl);
            const buf = await resp.arrayBuffer();
            const audioBuf = await this.ctx.decodeAudioData(buf);

            if (!this.musicEnabled) {
                this._musicLoading = false;
                return;
            }

            this.currentMusicSource = this.ctx.createBufferSource();
            this.currentMusicSource.buffer = audioBuf;
            this.currentMusicSource.connect(this.musicGain);
            this.currentMusicSource.onended = () => {
                this.currentMusicSource = null;
                if (this.musicEnabled) this.playRandomMusic();
            };
            this.currentMusicSource.start();
        } catch (e) {}
        this._musicLoading = false;
    }

    async playRandomMusic() {
        if (!this.musicEnabled || this.musicTracks.length === 0 || !this.initialized) return;

        if (this._musicLoading) return;
        this._musicLoading = true;

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

            if (!this.musicEnabled) {
                this._musicLoading = false;
                return;
            }

            this.currentMusicSource = this.ctx.createBufferSource();
            this.currentMusicSource.buffer = audioBuf;
            this.currentMusicSource.connect(this.musicGain);
            this.currentMusicSource.onended = () => {
                this.currentMusicSource = null;
                if (this.musicEnabled) this.playRandomMusic();
            };
            this.currentMusicSource.start();
        } catch (e) {
            if (this.musicTracks.length > 1) {
                const idx = this.musicTracks.indexOf(track);
                if (idx !== -1) this.musicTracks.splice(idx, 1);
                this._musicLoading = false;
                this.playRandomMusic();
                return;
            }
        }
        this._musicLoading = false;
    }

    stopMusic() {
        if (this.currentMusicSource) {
            try { this.currentMusicSource.onended = null; } catch(e) {}
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

    _saveCreepyState() {
        try {
            localStorage.setItem('pirate2d_creepy', JSON.stringify([...this.unlockedCreepy]));
        } catch(e) {}
    }

    _loadCreepyState() {
        try {
            const data = JSON.parse(localStorage.getItem('pirate2d_creepy'));
            if (data) this.unlockedCreepy = new Set(data);
        } catch(e) {}
    }

    // Re-add previously unlocked creepy tracks to rotation after music discovery
    restoreUnlockedCreepy() {
        for (const filename of this.unlockedCreepy) {
            const url = this.creepyTracks[filename];
            if (url && !this.musicTracks.includes(url)) {
                this.musicTracks.push(url);
            }
        }
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

    playBossExplosion() {
        if (!this.sfxEnabled || !this.initialized) return;
        const ctx = this.ctx;
        // Big boom
        const noise = this._createNoise(1.2);
        noise.connect(this.sfxGain);
        // Low rumble
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(15, ctx.currentTime + 1.5);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.5);
        setTimeout(() => { try { noise.disconnect(); } catch(e) {} }, 1300);
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

    playVictoryFanfare() {
        if (!this.sfxEnabled || !this.initialized) return;
        const ctx = this.ctx;
        const notes = [523, 659, 784, 784, 1047, 1047, 1319];
        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.15);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + i * 0.15 + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.4);
            osc.connect(gain);
            gain.connect(this.sfxGain);
            osc.start(ctx.currentTime + i * 0.15);
            osc.stop(ctx.currentTime + i * 0.15 + 0.45);
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
        return gain;
    }
}
