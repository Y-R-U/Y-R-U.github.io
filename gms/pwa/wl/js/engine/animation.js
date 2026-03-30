// animation.js - Tweened army movement and effects
'use strict';

const Animation = {
    tweens: [],
    shakes: [],

    addMoveTween(army, fromCol, fromRow, toCol, toRow, duration, onComplete) {
        this.tweens.push({
            army,
            fromCol, fromRow,
            toCol, toRow,
            startTime: performance.now(),
            duration: duration || 150,
            onComplete,
        });
    },

    addShake(col, row, duration) {
        this.shakes.push({
            col, row,
            startTime: performance.now(),
            duration: duration || 300,
        });
    },

    isAnimating() {
        return this.tweens.length > 0;
    },

    update() {
        const now = performance.now();

        // Process move tweens
        for (let i = this.tweens.length - 1; i >= 0; i--) {
            const tw = this.tweens[i];
            const elapsed = now - tw.startTime;
            const t = Math.min(1, elapsed / tw.duration);

            if (t >= 1) {
                this.tweens.splice(i, 1);
                if (tw.onComplete) tw.onComplete();
            }
        }

        // Process shakes
        for (let i = this.shakes.length - 1; i >= 0; i--) {
            const sh = this.shakes[i];
            const elapsed = now - sh.startTime;
            if (elapsed >= sh.duration) {
                this.shakes.splice(i, 1);
            }
        }
    },

    getTweenPos(army) {
        const tw = this.tweens.find(t => t.army === army);
        if (!tw) return null;

        const now = performance.now();
        const elapsed = now - tw.startTime;
        const t = Math.min(1, elapsed / tw.duration);

        // Ease out quad
        const et = 1 - (1 - t) * (1 - t);

        return {
            col: tw.fromCol + (tw.toCol - tw.fromCol) * et,
            row: tw.fromRow + (tw.toRow - tw.fromRow) * et,
        };
    },

    getShakeOffset(col, row) {
        const sh = this.shakes.find(s => s.col === col && s.row === row);
        if (!sh) return { x: 0, y: 0 };

        const now = performance.now();
        const elapsed = now - sh.startTime;
        const t = elapsed / sh.duration;
        const intensity = (1 - t) * 4;

        return {
            x: Math.sin(elapsed * 0.05) * intensity,
            y: Math.cos(elapsed * 0.07) * intensity,
        };
    },

    clear() {
        this.tweens = [];
        this.shakes = [];
    },
};
