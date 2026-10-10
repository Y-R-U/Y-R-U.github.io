/* audio.js - Synthesized sound effects (Web Audio API) */
/* Renamed from Audio to GameAudio to avoid shadowing window.Audio */
'use strict';

const GameAudio = (() => {
    let audioCtx = null;
    let sfxEnabled = true;
    let vibrateEnabled = true;
    let noiseBuf = null;
    let lastDraw = 0;

    function getCtx() {
        if (!audioCtx) {
            try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state !== 'running' && !document.hidden) audioCtx.resume().catch(() => {});
        return audioCtx;
    }

    function unlock() {
        try { getCtx(); } catch (e) {}
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

    // One shared second of white noise; each play reads a slice of it
    function getNoise(ctx) {
        if (!noiseBuf || noiseBuf.sampleRate !== ctx.sampleRate) {
            noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
            const data = noiseBuf.getChannelData(0);
            for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        }
        return noiseBuf;
    }

    function playNoise(duration, vol = 0.08) {
        if (!sfxEnabled) return;
        try {
            const ctx = getCtx();
            const src = ctx.createBufferSource();
            const gain = ctx.createGain();
            src.buffer = getNoise(ctx);
            // The old per-call buffer baked vol into the samples too, so vol^2 keeps the same level
            gain.gain.setValueAtTime(vol * vol, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
            src.connect(gain);
            gain.connect(ctx.destination);
            src.start(0, Math.random() * (1 - duration), duration);
        } catch (e) { /* silent fail */ }
    }

    const SFX = {
        draw() {
            const t = performance.now();
            if (t - lastDraw < 35) return;
            lastDraw = t;
            playNoise(0.05, 0.04);
        },
        undo() {
            playTone(520, 0.06, 'triangle', 0.1);
            setTimeout(() => playTone(340, 0.08, 'triangle', 0.1), 50);
        },
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
        powerUp() {
            playTone(440, 0.08, 'square', 0.08);
            setTimeout(() => playTone(660, 0.08, 'square', 0.08), 70);
            setTimeout(() => playTone(880, 0.12, 'square', 0.1), 140);
        },
        reward() {
            playTone(587, 0.12, 'sine', 0.18);
            setTimeout(() => playTone(740, 0.12, 'sine', 0.18), 100);
            setTimeout(() => playTone(880, 0.12, 'sine', 0.18), 200);
            setTimeout(() => playTone(1175, 0.25, 'sine', 0.2), 300);
        },
    };

    function vibrate(pattern) {
        if (vibrateEnabled && navigator.vibrate) {
            navigator.vibrate(pattern);
        }
    }

    function toggleSfx() {
        sfxEnabled = !sfxEnabled;
        savePref();
        return sfxEnabled;
    }

    function toggleVibrate() {
        vibrateEnabled = !vibrateEnabled;
        savePref();
        return vibrateEnabled;
    }

    function savePref() {
        try {
            localStorage.setItem('paperant_audio', JSON.stringify({
                sfx: sfxEnabled, vibrate: vibrateEnabled
            }));
        } catch (e) {}
    }

    function loadPref() {
        try {
            const data = JSON.parse(localStorage.getItem('paperant_audio'));
            if (data) {
                sfxEnabled = data.sfx !== false;
                vibrateEnabled = data.vibrate !== false;
            }
        } catch (e) {}
    }

    function init() {
        loadPref();
        for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) {
            window.addEventListener(ev, unlock, { capture: true, passive: true });
        }
        document.addEventListener('visibilitychange', () => {
            if (!audioCtx) return;
            if (document.hidden) audioCtx.suspend().catch(() => {});
            else audioCtx.resume().catch(() => {});
        });
    }

    return {
        init, SFX, vibrate,
        toggleSfx, toggleVibrate,
        get sfxEnabled() { return sfxEnabled; },
        get vibrateEnabled() { return vibrateEnabled; },
    };
})();
