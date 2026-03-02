// ============================================================
// engine.js - Input handling, camera, particles, procedural audio
// ============================================================

// ---- INPUT SYSTEM ----
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = {};
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.clicked = false;
    this.rightClicked = false;
    this.clickX = 0;
    this.clickY = 0;

    window.addEventListener('keydown', e => {
      this.keys[e.key.toLowerCase()] = true;
      if (['tab', 'i', 'e', ' '].includes(e.key.toLowerCase())) e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      this.keys[e.key.toLowerCase()] = false;
    });
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      this.mouseX = (e.clientX - rect.left) * scaleX;
      this.mouseY = (e.clientY - rect.top) * scaleY;
    });
    canvas.addEventListener('mousedown', e => {
      this.mouseDown = true;
      if (e.button === 0) {
        this.clicked = true;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        this.clickX = (e.clientX - rect.left) * scaleX;
        this.clickY = (e.clientY - rect.top) * scaleY;
      }
      if (e.button === 2) {
        this.rightClicked = true;
        e.preventDefault();
      }
    });
    canvas.addEventListener('mouseup', e => {
      this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  consumeClick() {
    if (this.clicked) {
      this.clicked = false;
      return { x: this.clickX, y: this.clickY };
    }
    return null;
  }

  consumeRightClick() {
    if (this.rightClicked) {
      this.rightClicked = false;
      return true;
    }
    return false;
  }

  isDown(key) {
    return !!this.keys[key];
  }

  clear() {
    this.clicked = false;
    this.rightClicked = false;
  }
}

// ---- CAMERA SYSTEM ----
export class Camera {
  constructor(w, h) {
    this.x = 0;
    this.y = 0;
    this.width = w;
    this.height = h;
    this.shakeX = 0;
    this.shakeY = 0;
    this.shakeTime = 0;
  }

  follow(entity, worldW, worldH) {
    this.x = entity.x + entity.w / 2 - this.width / 2;
    this.y = entity.y + entity.h / 2 - this.height / 2;
    // Clamp to world
    this.x = Math.max(0, Math.min(worldW - this.width, this.x));
    this.y = Math.max(0, Math.min(worldH - this.height, this.y));
  }

  shake(intensity, duration) {
    this.shakeTime = duration;
    this._shakeIntensity = intensity;
  }

  update(dt) {
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      this.shakeX = (Math.random() - 0.5) * this._shakeIntensity;
      this.shakeY = (Math.random() - 0.5) * this._shakeIntensity;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
    }
  }

  screenX(worldX) { return worldX - this.x + this.shakeX; }
  screenY(worldY) { return worldY - this.y + this.shakeY; }
}

// ---- PARTICLE SYSTEM ----
export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emit(x, y, options = {}) {
    const count = options.count || 5;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x, y,
        vx: (options.vx || 0) + (Math.random() - 0.5) * (options.spread || 3),
        vy: (options.vy || -2) + (Math.random() - 0.5) * (options.spread || 3),
        life: 1,
        decay: options.decay || (0.01 + Math.random() * 0.02),
        size: options.size || (2 + Math.random() * 3),
        color: options.color || '#fff',
        gravity: options.gravity ?? 0.05,
      });
    }
  }

  // Floating text (damage numbers, XP drops, etc.)
  emitText(x, y, text, color = '#fff', size = 14) {
    this.particles.push({
      x, y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: -1.5,
      life: 1,
      decay: 0.012,
      text,
      color,
      fontSize: size,
      gravity: 0,
      isText: true,
    });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      if (p.gravity) p.vy += p.gravity;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  draw(ctx, camera) {
    for (const p of this.particles) {
      const sx = camera ? camera.screenX(p.x) : p.x;
      const sy = camera ? camera.screenY(p.y) : p.y;
      ctx.globalAlpha = Math.max(0, p.life);
      if (p.isText) {
        ctx.font = `bold ${p.fontSize}px monospace`;
        ctx.fillStyle = p.color;
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.strokeText(p.text, sx, sy);
        ctx.fillText(p.text, sx, sy);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(sx, sy, p.size * p.life, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
  }
}

// ---- PROCEDURAL AUDIO ----
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.3;
  }

  init() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.enabled = false;
    }
  }

  _ensureCtx() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  playHit() {
    this._ensureCtx();
    if (!this.ctx || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(this.volume * 0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playKill() {
    this._ensureCtx();
    if (!this.ctx || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(this.volume * 0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  playLevelUp() {
    this._ensureCtx();
    if (!this.ctx || !this.enabled) return;
    [0, 0.15, 0.3].forEach((delay, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime([440, 554, 659][i], this.ctx.currentTime + delay);
      gain.gain.setValueAtTime(this.volume * 0.3, this.ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + 0.3);
      osc.start(this.ctx.currentTime + delay);
      osc.stop(this.ctx.currentTime + delay + 0.3);
    });
  }

  playFish() {
    this._ensureCtx();
    if (!this.ctx || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(this.volume * 0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  playCook() {
    this._ensureCtx();
    if (!this.ctx || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, this.ctx.currentTime);
    osc.frequency.setValueAtTime(400, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(this.volume * 0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.25);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.25);
  }

  playEat() {
    this._ensureCtx();
    if (!this.ctx || !this.enabled) return;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(150 + i * 30, this.ctx.currentTime + i * 0.08);
      gain.gain.setValueAtTime(this.volume * 0.15, this.ctx.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + i * 0.08 + 0.1);
      osc.start(this.ctx.currentTime + i * 0.08);
      osc.stop(this.ctx.currentTime + i * 0.08 + 0.1);
    }
  }

  playPickup() {
    this._ensureCtx();
    if (!this.ctx || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(500, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(700, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(this.volume * 0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.12);
  }

  playWaveStart() {
    this._ensureCtx();
    if (!this.ctx || !this.enabled) return;
    [0, 0.1, 0.2, 0.3].forEach((delay, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(150 + i * 40, this.ctx.currentTime + delay);
      gain.gain.setValueAtTime(this.volume * 0.15, this.ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + 0.15);
      osc.start(this.ctx.currentTime + delay);
      osc.stop(this.ctx.currentTime + delay + 0.15);
    });
  }
}
