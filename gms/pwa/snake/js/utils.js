/**
 * Utility functions
 */
const Utils = {
    /** Distance between two points */
    dist(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    },

    /** Squared distance (faster, avoids sqrt) */
    distSq(x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        return dx * dx + dy * dy;
    },

    /** Angle from p1 to p2 */
    angleTo(x1, y1, x2, y2) {
        return Math.atan2(y2 - y1, x2 - x1);
    },

    /** Shortest angle difference (signed) */
    angleDiff(a, b) {
        let d = b - a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    },

    /** Linear interpolation */
    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    /** Clamp value between min and max */
    clamp(v, min, max) {
        return v < min ? min : v > max ? max : v;
    },

    /** Random float between min and max */
    rand(min, max) {
        return Math.random() * (max - min) + min;
    },

    /** Random integer between min and max (inclusive) */
    randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    /** Random point within circle */
    randInCircle(radius) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * radius;
        return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
    },

    /** Pick random element from array */
    randPick(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    },

    /** Shuffle array in-place */
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },

    /** HSL to hex color */
    hslToHex(h, s, l) {
        s /= 100; l /= 100;
        const a = s * Math.min(l, 1 - l);
        const f = n => {
            const k = (n + h / 30) % 12;
            const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * color).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    },

    /** Hex to rgba */
    hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r},${g},${b},${alpha})`;
    },

    /** Format number with K/M suffix */
    formatNumber(n) {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
        return Math.floor(n).toString();
    },

    /** Generate unique ID */
    uid() {
        return Math.random().toString(36).substr(2, 9);
    }
};
