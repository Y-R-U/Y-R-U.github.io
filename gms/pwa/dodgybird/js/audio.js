// ── Audio System ── SFX via Web Audio API + Music file playback ──
const Audio = (() => {
    let ctx = null;
    let musicTracks = [];
    let currentMusic = null;
    let musicEnabled = true;
    let sfxEnabled = true;
    let musicVolume = 0.4;
    let sfxVolume = 0.5;
    let initialized = false;

    function init() {
        if (initialized) return;
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        initialized = true;
        detectMusicFiles();
    }

    function resume() {
        if (ctx && ctx.state === 'suspended') ctx.resume();
    }

    // ── Music file detection ──
    function detectMusicFiles() {
        musicTracks = [];
        let checked = 0;
        for (let i = 1; i <= CONFIG.MAX_MUSIC_TRACKS; i++) {
            const audio = new window.Audio();
            audio.preload = 'auto';
            const src = `music/theme${i}.mp3`;
            audio.src = src;
            const idx = i;
            audio.addEventListener('canplaythrough', () => {
                musicTracks.push({ index: idx, element: audio });
                musicTracks.sort((a, b) => a.index - b.index);
            }, { once: true });
            audio.addEventListener('error', () => { /* not found, skip */ }, { once: true });
        }
    }

    function playMusic() {
        if (!musicEnabled || musicTracks.length === 0) return;
        stopMusic();
        const track = musicTracks[Math.floor(Math.random() * musicTracks.length)];
        currentMusic = track.element;
        currentMusic.volume = musicVolume;
        currentMusic.loop = false;
        currentMusic.currentTime = 0;
        currentMusic.play().catch(() => {});
        currentMusic.onended = () => {
            if (musicEnabled) playMusic();
        };
    }

    function stopMusic() {
        if (currentMusic) {
            currentMusic.pause();
            currentMusic.currentTime = 0;
            currentMusic.onended = null;
            currentMusic = null;
        }
    }

    function setMusicEnabled(on) {
        musicEnabled = on;
        if (!on) stopMusic();
        else playMusic();
    }

    function setSfxEnabled(on) {
        sfxEnabled = on;
    }

    // ── SFX via Web Audio API synthesis ──
    function playSfx(type) {
        if (!sfxEnabled || !ctx) return;
        resume();
        switch (type) {
            case 'shoot': synthShoot(); break;
            case 'hit': synthHit(); break;
            case 'explode': synthExplode(); break;
            case 'pickup': synthPickup(); break;
            case 'coin': synthCoin(); break;
            case 'damage': synthDamage(); break;
            case 'die': synthDie(); break;
            case 'wallbreak': synthWallBreak(); break;
            case 'boss_warn': synthBossWarn(); break;
            case 'drone_warn': synthDroneWarn(); break;
            case 'click': synthClick(); break;
        }
    }

    function createOsc(freq, type, duration, vol = sfxVolume) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(vol * 0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + duration);
    }

    function createNoise(duration, vol = sfxVolume) {
        const bufSize = ctx.sampleRate * duration;
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const src = ctx.createBufferSource();
        const gain = ctx.createGain();
        src.buffer = buf;
        gain.gain.setValueAtTime(vol * 0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        src.connect(gain);
        gain.connect(ctx.destination);
        src.start(ctx.currentTime);
    }

    function synthShoot() {
        createOsc(880, 'square', 0.08, sfxVolume * 0.6);
        createOsc(440, 'sawtooth', 0.05, sfxVolume * 0.3);
    }

    function synthHit() {
        createOsc(200, 'square', 0.12);
        createNoise(0.08);
    }

    function synthExplode() {
        createNoise(0.35, sfxVolume * 1.2);
        createOsc(80, 'sawtooth', 0.3, sfxVolume * 0.5);
    }

    function synthPickup() {
        const t = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523, t);
        osc.frequency.linearRampToValueAtTime(1047, t + 0.1);
        gain.gain.setValueAtTime(sfxVolume * 0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.2);
    }

    function synthCoin() {
        createOsc(1200, 'sine', 0.06, sfxVolume * 0.4);
        setTimeout(() => createOsc(1600, 'sine', 0.08, sfxVolume * 0.3), 60);
    }

    function synthDamage() {
        createOsc(150, 'sawtooth', 0.2);
        createNoise(0.15, sfxVolume * 0.8);
    }

    function synthDie() {
        createNoise(0.5, sfxVolume * 1.0);
        createOsc(200, 'sawtooth', 0.4, sfxVolume * 0.6);
        setTimeout(() => createOsc(100, 'sawtooth', 0.3, sfxVolume * 0.4), 200);
    }

    function synthWallBreak() {
        createNoise(0.2, sfxVolume * 0.6);
        createOsc(300, 'square', 0.1, sfxVolume * 0.3);
    }

    function synthBossWarn() {
        for (let i = 0; i < 3; i++) {
            setTimeout(() => createOsc(440, 'square', 0.15, sfxVolume * 0.5), i * 200);
        }
    }

    function synthDroneWarn() {
        createOsc(600, 'triangle', 0.3, sfxVolume * 0.3);
    }

    function synthClick() {
        createOsc(800, 'sine', 0.04, sfxVolume * 0.2);
    }

    return {
        init, resume, playSfx, playMusic, stopMusic,
        setMusicEnabled, setSfxEnabled,
        get musicEnabled() { return musicEnabled; },
        get sfxEnabled() { return sfxEnabled; },
        get hasMusicTracks() { return musicTracks.length > 0; },
    };
})();
