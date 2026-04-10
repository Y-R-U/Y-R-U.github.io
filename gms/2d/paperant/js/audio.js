/* audio.js - Sound effects (Web Audio API) and music management */
/* Renamed from Audio to GameAudio to avoid shadowing window.Audio */
'use strict';

const GameAudio = (() => {
    let audioCtx = null;
    let sfxEnabled = true;
    let musicEnabled = true;
    let vibrateEnabled = true;
    let musicElement = null;
    let musicTracks = [];
    let currentTrack = -1;

    function getCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    // Synthesized sound effects
    function playTone(freq, duration, type = 'sine', vol = 0.15, ramp = true) {
        if (!sfxEnabled) return;
        try {
            const ctx = getCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime);
            gain.gain.setValueAtTime(vol, ctx.currentTime);
            if (ramp) gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch (e) { /* silent fail */ }
    }

    function playNoise(duration, vol = 0.08) {
        if (!sfxEnabled) return;
        try {
            const ctx = getCtx();
            const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * duration));
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * vol;
            const src = ctx.createBufferSource();
            const gain = ctx.createGain();
            src.buffer = buffer;
            gain.gain.setValueAtTime(vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            src.connect(gain);
            gain.connect(ctx.destination);
            src.start();
        } catch (e) { /* silent fail */ }
    }

    const SFX = {
        draw() { playNoise(0.05, 0.04); },
        goalCollect() {
            playTone(523, 0.1, 'sine', 0.2);
            setTimeout(() => playTone(659, 0.1, 'sine', 0.2), 80);
            setTimeout(() => playTone(784, 0.15, 'sine', 0.2), 160);
        },
        levelComplete() {
            playTone(523, 0.15, 'sine', 0.2);
            setTimeout(() => playTone(659, 0.15, 'sine', 0.2), 120);
            setTimeout(() => playTone(784, 0.15, 'sine', 0.2), 240);
            setTimeout(() => playTone(1047, 0.3, 'sine', 0.25), 360);
        },
        levelFail() {
            playTone(330, 0.2, 'sawtooth', 0.12);
            setTimeout(() => playTone(262, 0.3, 'sawtooth', 0.12), 200);
        },
        buttonClick() { playTone(800, 0.06, 'sine', 0.1); },
        antBounce() { playTone(200, 0.08, 'triangle', 0.08); },
        starEarn() { playTone(880, 0.2, 'sine', 0.15); },
    };

    function vibrate(pattern) {
        if (vibrateEnabled && navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }

    // Music - check for theme1-9.mp3 in music/ folder
    async function initMusic() {
        musicTracks = [];
        const basePath = 'music/';
        for (let i = 1; i <= 9; i++) {
            try {
                const resp = await fetch(basePath + 'theme' + i + '.mp3', { method: 'HEAD' });
                if (resp.ok) musicTracks.push(basePath + 'theme' + i + '.mp3');
            } catch (e) { /* file doesn't exist */ }
        }
    }

    function playMusic() {
        if (!musicEnabled || musicTracks.length === 0) return;
        if (musicElement) {
            musicElement.play().catch(() => {});
            return;
        }
        // Pick random track (avoid repeating same track)
        let idx;
        do { idx = Math.floor(Math.random() * musicTracks.length); }
        while (idx === currentTrack && musicTracks.length > 1);
        currentTrack = idx;

        musicElement = new window.Audio(musicTracks[currentTrack]);
        musicElement.loop = false;
        musicElement.volume = 0.3;
        musicElement.addEventListener('ended', () => {
            musicElement = null;
            playMusic(); // play next random track
        });
        musicElement.play().catch(() => {});
    }

    function stopMusic() {
        if (musicElement) {
            musicElement.pause();
            musicElement.currentTime = 0;
            musicElement = null;
        }
    }

    function toggleSfx() {
        sfxEnabled = !sfxEnabled;
        savePref();
        return sfxEnabled;
    }

    function toggleMusic() {
        musicEnabled = !musicEnabled;
        if (musicEnabled) playMusic();
        else stopMusic();
        savePref();
        return musicEnabled;
    }

    function toggleVibrate() {
        vibrateEnabled = !vibrateEnabled;
        savePref();
        return vibrateEnabled;
    }

    function savePref() {
        try {
            localStorage.setItem('paperant_audio', JSON.stringify({
                sfx: sfxEnabled, music: musicEnabled, vibrate: vibrateEnabled
            }));
        } catch (e) {}
    }

    function loadPref() {
        try {
            const data = JSON.parse(localStorage.getItem('paperant_audio'));
            if (data) {
                sfxEnabled = data.sfx !== false;
                musicEnabled = data.music !== false;
                vibrateEnabled = data.vibrate !== false;
            }
        } catch (e) {}
    }

    function init() {
        loadPref();
        initMusic();
    }

    return {
        init, SFX, vibrate, playMusic, stopMusic,
        toggleSfx, toggleMusic, toggleVibrate,
        get sfxEnabled() { return sfxEnabled; },
        get musicEnabled() { return musicEnabled; },
        get vibrateEnabled() { return vibrateEnabled; },
    };
})();
