// audio.js - Procedural sound effects using Web Audio API
'use strict';

const Audio = {
    ctx: null,
    enabled: true,
    volume: 0.3,

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            this.enabled = false;
        }
    },

    _ensureCtx() {
        if (!this.ctx) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx && this.enabled;
    },

    _playTone(freq, duration, type, attack, decay) {
        if (!this._ensureCtx()) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type || 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(this.volume, this.ctx.currentTime + (attack || 0.01));
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(this.ctx.currentTime);
        osc.stop(this.ctx.currentTime + duration);
    },

    playSelect() {
        this._playTone(600, 0.08, 'square');
    },

    playMove() {
        this._playTone(300, 0.06, 'triangle');
        setTimeout(() => this._playTone(350, 0.06, 'triangle'), 60);
    },

    playCombat() {
        // Metallic clash sound
        if (!this._ensureCtx()) return;
        for (let i = 0; i < 3; i++) {
            setTimeout(() => {
                this._playTone(200 + Math.random() * 400, 0.12, 'sawtooth', 0.005, 0.1);
            }, i * 100);
        }
    },

    playVictory() {
        // Fanfare
        const notes = [523, 659, 784, 1047];
        notes.forEach((n, i) => {
            setTimeout(() => this._playTone(n, 0.25, 'square', 0.02), i * 150);
        });
    },

    playCapture() {
        this._playTone(440, 0.1, 'square');
        setTimeout(() => this._playTone(550, 0.1, 'square'), 100);
        setTimeout(() => this._playTone(660, 0.2, 'square'), 200);
    },

    playTurnStart() {
        this._playTone(440, 0.15, 'triangle', 0.02);
        setTimeout(() => this._playTone(550, 0.15, 'triangle', 0.02), 150);
    },

    playRuinFind() {
        this._playTone(660, 0.1, 'sine');
        setTimeout(() => this._playTone(880, 0.15, 'sine'), 100);
        setTimeout(() => this._playTone(1100, 0.2, 'sine'), 200);
    },

    playError() {
        this._playTone(200, 0.15, 'square');
        setTimeout(() => this._playTone(150, 0.2, 'square'), 150);
    },

    playPromotion() {
        const notes = [440, 554, 659, 880];
        notes.forEach((n, i) => {
            setTimeout(() => this._playTone(n, 0.2, 'sine', 0.01), i * 120);
        });
    },

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    },
};
