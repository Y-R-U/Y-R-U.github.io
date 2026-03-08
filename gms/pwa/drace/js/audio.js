/* DRace - Audio Module */
const Audio = (() => {
    const settings = Storage.getSettings();
    let soundOn = settings.soundOn;
    let musicOn = settings.musicOn;
    let currentTrack = null;
    let musicIndex = 0;
    const musicFiles = ['music/theme1.mp3', 'music/theme2.mp3', 'music/theme3.mp3'];
    let audioCtx = null;

    function getCtx() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    function resumeCtx() {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playTone(freq, duration, type = 'sine', volume = 0.15) {
        if (!soundOn) return;
        try {
            const ctx = getCtx();
            resumeCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = type;
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(volume, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration);
        } catch { /* audio not available */ }
    }

    return {
        get soundOn() { return soundOn; },
        get musicOn() { return musicOn; },

        toggleSound() {
            soundOn = !soundOn;
            const s = Storage.getSettings();
            s.soundOn = soundOn;
            Storage.saveSettings(s);
            return soundOn;
        },

        toggleMusic() {
            musicOn = !musicOn;
            const s = Storage.getSettings();
            s.musicOn = musicOn;
            Storage.saveSettings(s);
            if (!musicOn && currentTrack) {
                currentTrack.pause();
                currentTrack.currentTime = 0;
            } else if (musicOn) {
                this.playMusic();
            }
            return musicOn;
        },

        playMusic() {
            if (!musicOn) return;
            if (currentTrack) {
                currentTrack.pause();
                currentTrack.currentTime = 0;
            }
            const file = musicFiles[musicIndex % musicFiles.length];
            const audio = new window.Audio(file);
            audio.volume = 0.3;
            audio.loop = false;
            audio.addEventListener('ended', () => {
                musicIndex++;
                this.playMusic();
            });
            audio.addEventListener('error', () => {
                // File doesn't exist yet, that's fine
                musicIndex++;
                if (musicIndex < musicFiles.length) {
                    this.playMusic();
                }
            });
            audio.play().catch(() => {});
            currentTrack = audio;
        },

        stopMusic() {
            if (currentTrack) {
                currentTrack.pause();
                currentTrack.currentTime = 0;
                currentTrack = null;
            }
        },

        sfxRoll() {
            playTone(300, 0.08, 'square', 0.08);
            setTimeout(() => playTone(400, 0.08, 'square', 0.08), 60);
            setTimeout(() => playTone(500, 0.08, 'square', 0.08), 120);
        },

        sfxLand() {
            playTone(600, 0.15, 'sine', 0.12);
        },

        sfxPositive() {
            playTone(523, 0.12, 'sine', 0.12);
            setTimeout(() => playTone(659, 0.12, 'sine', 0.12), 100);
            setTimeout(() => playTone(784, 0.2, 'sine', 0.12), 200);
        },

        sfxNegative() {
            playTone(400, 0.15, 'sawtooth', 0.08);
            setTimeout(() => playTone(300, 0.2, 'sawtooth', 0.08), 120);
        },

        sfxTreasure() {
            playTone(784, 0.1, 'sine', 0.12);
            setTimeout(() => playTone(988, 0.1, 'sine', 0.12), 80);
            setTimeout(() => playTone(1175, 0.15, 'sine', 0.12), 160);
            setTimeout(() => playTone(1319, 0.3, 'sine', 0.15), 240);
        },

        sfxClick() {
            playTone(800, 0.05, 'sine', 0.06);
        },

        sfxWin() {
            const notes = [523, 659, 784, 1047];
            notes.forEach((n, i) => {
                setTimeout(() => playTone(n, 0.3, 'sine', 0.15), i * 150);
            });
        },

        init() {
            // Resume audio context on first user interaction
            const resume = () => {
                resumeCtx();
                document.removeEventListener('touchstart', resume);
                document.removeEventListener('click', resume);
            };
            document.addEventListener('touchstart', resume, { once: true });
            document.addEventListener('click', resume, { once: true });
        }
    };
})();
