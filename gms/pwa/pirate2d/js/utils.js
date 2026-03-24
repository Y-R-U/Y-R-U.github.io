// Utility functions for Corsair's Fate

export function dist(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

export function angle(x1, y1, x2, y2) {
    return Math.atan2(y2 - y1, x2 - x1);
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

export function randFloat(min, max) {
    return Math.random() * (max - min) + min;
}

export function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randChoice(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function angleDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
}

export function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
}

export function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

export function circlesCollide(x1, y1, r1, x2, y2, r2) {
    return dist(x1, y1, x2, y2) < r1 + r2;
}

// Seeded random for world gen
export class SeededRandom {
    constructor(seed) {
        this.seed = seed;
    }
    next() {
        this.seed = (this.seed * 16807 + 0) % 2147483647;
        return this.seed / 2147483647;
    }
    float(min, max) {
        return this.next() * (max - min) + min;
    }
    int(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
}

// Simple object pool
export class Pool {
    constructor(factory, reset) {
        this.factory = factory;
        this.resetFn = reset;
        this.pool = [];
        this.active = [];
    }
    get() {
        let obj = this.pool.pop() || this.factory();
        this.active.push(obj);
        return obj;
    }
    release(obj) {
        const idx = this.active.indexOf(obj);
        if (idx !== -1) {
            this.active.splice(idx, 1);
            if (this.resetFn) this.resetFn(obj);
            this.pool.push(obj);
        }
    }
    releaseAll() {
        while (this.active.length) {
            const obj = this.active.pop();
            if (this.resetFn) this.resetFn(obj);
            this.pool.push(obj);
        }
    }
}

// Asset loader
export class AssetLoader {
    constructor(basePath) {
        this.basePath = basePath;
        this.images = {};
        this.loaded = 0;
        this.total = 0;
    }

    loadImage(key, path) {
        this.total++;
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                this.images[key] = img;
                this.loaded++;
                resolve(img);
            };
            img.onerror = () => {
                // Create placeholder
                const c = document.createElement('canvas');
                c.width = 64; c.height = 64;
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#ff00ff';
                ctx.fillRect(0, 0, 64, 64);
                ctx.fillStyle = '#000';
                ctx.font = '10px sans-serif';
                ctx.fillText(key, 4, 32);
                this.images[key] = c;
                this.loaded++;
                resolve(c);
            };
            img.src = this.basePath + path;
        });
    }

    get(key) {
        return this.images[key];
    }

    progress() {
        return this.total === 0 ? 1 : this.loaded / this.total;
    }
}

// Simple event emitter
export class EventEmitter {
    constructor() {
        this._events = {};
    }
    on(event, fn) {
        (this._events[event] = this._events[event] || []).push(fn);
    }
    off(event, fn) {
        const list = this._events[event];
        if (list) this._events[event] = list.filter(f => f !== fn);
    }
    emit(event, ...args) {
        const list = this._events[event];
        if (list) list.forEach(fn => fn(...args));
    }
}

// Format numbers
export function formatGold(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return Math.floor(n).toString();
}

// Easing
export function easeOutQuad(t) {
    return t * (2 - t);
}

export function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}
