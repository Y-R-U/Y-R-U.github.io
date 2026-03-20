/**
 * Particle effects system
 */
class ParticleSystem {
    constructor() {
        this.particles = [];
        this.maxParticles = 300;
    }

    /** Create a particle with proper maxLife set */
    _emit(x, y, vx, vy, radius, color, alpha, life, type) {
        if (this.particles.length >= this.maxParticles) return;
        this.particles.push({ x, y, vx, vy, radius, color, alpha, life, maxLife: life, type });
    }

    /** Emit death explosion particles */
    emitDeath(x, y, colors) {
        const count = Math.min(20, this.maxParticles - this.particles.length);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Utils.rand(1, 5);
            this._emit(x, y,
                Math.cos(angle) * speed, Math.sin(angle) * speed,
                Utils.rand(3, 8), Utils.randPick(colors), 1,
                Utils.rand(500, 1200), 'death');
        }
    }

    /** Emit eat sparkle */
    emitEat(x, y, color) {
        const count = Math.min(5, this.maxParticles - this.particles.length);
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Utils.rand(0.5, 2);
            this._emit(x, y,
                Math.cos(angle) * speed, Math.sin(angle) * speed,
                Utils.rand(2, 4), color, 1,
                Utils.rand(200, 500), 'eat');
        }
    }

    /** Emit boost trail sparkle */
    emitBoost(x, y, color) {
        const angle = Math.random() * Math.PI * 2;
        this._emit(x, y,
            Math.cos(angle) * 0.5, Math.sin(angle) * 0.5,
            Utils.rand(1, 3), color, 0.8,
            Utils.rand(150, 400), 'boost');
    }

    /** Emit powerup collect effect */
    emitPowerup(x, y, color) {
        const count = Math.min(12, this.maxParticles - this.particles.length);
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const speed = Utils.rand(2, 4);
            this._emit(x, y,
                Math.cos(angle) * speed, Math.sin(angle) * speed,
                Utils.rand(3, 6), color, 1,
                Utils.rand(400, 800), 'powerup');
        }
    }

    /** Update all particles */
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.98;
            p.vy *= 0.98;
            p.life -= dt;
            p.alpha = Math.max(0, p.life / p.maxLife);

            if (p.life <= 0) {
                // Swap-remove for performance (avoids shifting array)
                this.particles[i] = this.particles[this.particles.length - 1];
                this.particles.pop();
            }
        }
    }

    /** Clear all particles */
    clear() {
        this.particles.length = 0;
    }
}
