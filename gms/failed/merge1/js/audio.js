/* ===== BOUNCE MERGE ROGUELITE — AUDIO ===== */
(function(BM) {
    'use strict';

    var ctx = null;
    var musicAudio = null;
    var musicTracks = [];
    var currentTrack = -1;
    var musicEnabled = true;
    var sfxEnabled = true;

    function getCtx() {
        if (!ctx) {
            try {
                ctx = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) { return null; }
        }
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    // ===== SFX via Web Audio oscillator =====
    function playSfx(type) {
        if (!sfxEnabled) return;
        var c = getCtx();
        if (!c) return;
        var osc = c.createOscillator();
        var gain = c.createGain();
        osc.connect(gain);
        gain.connect(c.destination);
        var now = c.currentTime;

        switch (type) {
            case 'shoot':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.exponentialRampToValueAtTime(200, now + 0.15);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
                break;
            case 'bounce':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(300 + Math.random() * 200, now);
                gain.gain.setValueAtTime(0.06, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                osc.start(now);
                osc.stop(now + 0.06);
                break;
            case 'merge':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(500, now);
                osc.frequency.exponentialRampToValueAtTime(1000, now + 0.2);
                gain.gain.setValueAtTime(0.2, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.25);
                // second harmonic
                var osc2 = c.createOscillator();
                var g2 = c.createGain();
                osc2.connect(g2); g2.connect(c.destination);
                osc2.type = 'triangle';
                osc2.frequency.setValueAtTime(800, now + 0.05);
                osc2.frequency.exponentialRampToValueAtTime(1400, now + 0.2);
                g2.gain.setValueAtTime(0.1, now + 0.05);
                g2.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                osc2.start(now + 0.05);
                osc2.stop(now + 0.25);
                break;
            case 'blockBreak':
                osc.type = 'square';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
                gain.gain.setValueAtTime(0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
                break;
            case 'blockHit':
                osc.type = 'square';
                osc.frequency.setValueAtTime(150 + Math.random() * 100, now);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
                break;
            case 'gameOver':
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(400, now);
                osc.frequency.exponentialRampToValueAtTime(100, now + 0.6);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
                osc.start(now);
                osc.stop(now + 0.6);
                break;
            case 'upgrade':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                osc.frequency.setValueAtTime(800, now + 0.1);
                osc.frequency.setValueAtTime(1000, now + 0.2);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            case 'click':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(600, now);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
                break;
            case 'waveComplete':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(500, now);
                osc.frequency.setValueAtTime(700, now + 0.15);
                osc.frequency.setValueAtTime(900, now + 0.3);
                gain.gain.setValueAtTime(0.15, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                osc.start(now);
                osc.stop(now + 0.4);
                break;
            default:
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, now);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
        }
    }

    // ===== MUSIC =====
    function probeMusic() {
        musicTracks = [];
        var probed = 0;
        var total = 9;
        for (var i = 1; i <= total; i++) {
            (function(idx) {
                var audio = new Audio();
                audio.preload = 'none';
                var src = 'music/theme' + idx + '.mp3';
                audio.src = src;
                // Try to fetch head to check existence
                fetch(src, { method: 'HEAD' }).then(function(resp) {
                    if (resp.ok && resp.headers.get('content-type') &&
                        resp.headers.get('content-type').indexOf('audio') !== -1) {
                        musicTracks.push(src);
                    }
                }).catch(function() {
                    // not found, skip
                }).finally(function() {
                    probed++;
                    if (probed === total && musicTracks.length > 0 && musicEnabled) {
                        playRandomTrack();
                    }
                });
            })(i);
        }
    }

    function playRandomTrack() {
        if (musicTracks.length === 0 || !musicEnabled) return;
        var idx = Math.floor(Math.random() * musicTracks.length);
        if (musicTracks.length > 1) {
            while (idx === currentTrack) idx = Math.floor(Math.random() * musicTracks.length);
        }
        currentTrack = idx;
        if (musicAudio) {
            musicAudio.pause();
            musicAudio.removeEventListener('ended', playRandomTrack);
        }
        musicAudio = new Audio(musicTracks[currentTrack]);
        musicAudio.volume = 0.4;
        musicAudio.addEventListener('ended', playRandomTrack);
        musicAudio.play().catch(function() { /* autoplay blocked, will retry on interaction */ });
    }

    function stopMusic() {
        if (musicAudio) {
            musicAudio.pause();
            musicAudio.currentTime = 0;
        }
    }

    function resumeMusic() {
        if (musicEnabled && musicTracks.length > 0) {
            if (musicAudio && musicAudio.paused) {
                musicAudio.play().catch(function() {});
            } else {
                playRandomTrack();
            }
        }
    }

    // ===== PUBLIC API =====
    BM.Audio = {
        init: function(settings) {
            musicEnabled = settings.music !== false;
            sfxEnabled = settings.sfx !== false;
            probeMusic();
        },
        play: playSfx,
        setMusic: function(on) {
            musicEnabled = on;
            if (on) resumeMusic();
            else stopMusic();
        },
        setSfx: function(on) {
            sfxEnabled = on;
        },
        isMusicOn: function() { return musicEnabled; },
        isSfxOn: function() { return sfxEnabled; },
        tryResumeContext: function() {
            getCtx();
            if (musicEnabled && musicTracks.length > 0 && (!musicAudio || musicAudio.paused)) {
                resumeMusic();
            }
        }
    };

})(window.BM);
