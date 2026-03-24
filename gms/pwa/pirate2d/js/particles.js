// Particle system for explosions, splashes, damage numbers, loot popups, fire

export class ParticleSystem {
    constructor() {
        this.particles = [];
        this.textParticles = [];
    }

    // Cannon impact / explosion
    addExplosion(x, y, count = 12, color = '#ff6600') {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
            const speed = 40 + Math.random() * 80;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.4 + Math.random() * 0.3,
                maxLife: 0.4 + Math.random() * 0.3,
                size: 3 + Math.random() * 5,
                color,
                type: 'circle'
            });
        }
    }

    // Large explosion on death - multiple waves
    addDeathExplosion(x, y) {
        // Primary explosion
        this.addExplosion(x, y, 20, '#ff4400');
        // Secondary fire burst
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const dist = Math.random() * 30;
            const ex = x + Math.cos(angle) * dist;
            const ey = y + Math.sin(angle) * dist;
            this.addFire(ex, ey, 3);
        }
        // Debris
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 120;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.8 + Math.random() * 0.6,
                maxLife: 0.8 + Math.random() * 0.6,
                size: 2 + Math.random() * 3,
                color: '#8B4513',
                type: 'circle'
            });
        }
    }

    // Burning wreck on water (lingers after death)
    addBurningWreck(x, y, duration) {
        const endTime = duration || 3;
        // Create multiple fire sources that last a few seconds
        for (let t = 0; t < endTime; t += 0.15) {
            setTimeout(() => {
                if (this.particles.length > 500) return; // Safety limit
                const ox = (Math.random() - 0.5) * 40;
                const oy = (Math.random() - 0.5) * 30;
                this.addFire(x + ox, y + oy, 2);
                this.addSmoke(x + ox, y + oy, 1);
            }, t * 1000);
        }
    }

    // Fire particles - flickering flames
    addFire(x, y, count = 4) {
        for (let i = 0; i < count; i++) {
            const colors = ['#ff4400', '#ff6600', '#ff8800', '#ffaa00', '#ffcc00'];
            this.particles.push({
                x: x + (Math.random() - 0.5) * 8,
                y: y + (Math.random() - 0.5) * 8,
                vx: (Math.random() - 0.5) * 15,
                vy: -25 - Math.random() * 40,
                life: 0.3 + Math.random() * 0.4,
                maxLife: 0.3 + Math.random() * 0.4,
                size: 3 + Math.random() * 5,
                color: colors[Math.floor(Math.random() * colors.length)],
                type: 'fire'
            });
        }
    }

    // Water splash
    addSplash(x, y, count = 8) {
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5);
            const speed = 20 + Math.random() * 40;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.3 + Math.random() * 0.2,
                maxLife: 0.3 + Math.random() * 0.2,
                size: 2 + Math.random() * 3,
                color: '#7ec8e3',
                type: 'circle'
            });
        }
    }

    // Wake trail behind ship
    addWake(x, y, shipAngle) {
        const spread = (Math.random() - 0.5) * 0.8;
        const backAngle = shipAngle + Math.PI + spread;
        const speed = 10 + Math.random() * 15;
        this.particles.push({
            x: x + (Math.random() - 0.5) * 6,
            y: y + (Math.random() - 0.5) * 6,
            vx: Math.cos(backAngle) * speed,
            vy: Math.sin(backAngle) * speed,
            life: 0.5 + Math.random() * 0.3,
            maxLife: 0.5 + Math.random() * 0.3,
            size: 2 + Math.random() * 2,
            color: '#ffffff',
            type: 'circle'
        });
    }

    // Smoke
    addSmoke(x, y, count = 5) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x + (Math.random() - 0.5) * 10,
                y: y + (Math.random() - 0.5) * 10,
                vx: (Math.random() - 0.5) * 20,
                vy: -20 - Math.random() * 30,
                life: 0.6 + Math.random() * 0.4,
                maxLife: 0.6 + Math.random() * 0.4,
                size: 4 + Math.random() * 6,
                color: '#888888',
                type: 'smoke'
            });
        }
    }

    // Floating text (damage numbers, gold gained, etc)
    addText(x, y, text, color = '#ffd700', size = 16, duration = 1.2) {
        this.textParticles.push({
            x, y,
            text,
            color,
            size,
            life: duration,
            maxLife: duration,
            vy: -40
        });
    }

    update(dt) {
        // Update particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            if (p.type === 'smoke') {
                p.size += dt * 8;
            } else if (p.type === 'fire') {
                p.size *= (1 - dt * 2);
                p.vx *= 0.95;
            }
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update text particles
        for (let i = this.textParticles.length - 1; i >= 0; i--) {
            const t = this.textParticles[i];
            t.y += t.vy * dt;
            t.vy *= 0.95;
            t.life -= dt;
            if (t.life <= 0) {
                this.textParticles.splice(i, 1);
            }
        }
    }

    draw(ctx, camX, camY) {
        // Draw particles
        for (const p of this.particles) {
            const sx = p.x - camX;
            const sy = p.y - camY;
            const alpha = Math.max(0, p.life / p.maxLife);

            ctx.save();
            ctx.globalAlpha = alpha;

            if (p.type === 'smoke') {
                ctx.fillStyle = p.color;
                ctx.globalAlpha = alpha * 0.4;
                ctx.beginPath();
                ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
                ctx.fill();
            } else if (p.type === 'fire') {
                ctx.globalAlpha = alpha * 0.8;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
                ctx.fill();
                // Inner bright core
                ctx.globalAlpha = alpha * 0.5;
                ctx.fillStyle = '#ffffaa';
                ctx.beginPath();
                ctx.arc(sx, sy, p.size * 0.4, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(sx, sy, p.size * alpha, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        // Draw text particles
        for (const t of this.textParticles) {
            const sx = t.x - camX;
            const sy = t.y - camY;
            const alpha = Math.max(0, t.life / t.maxLife);

            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.font = `bold ${t.size}px "Pirata One", Georgia, serif`;
            ctx.fillStyle = t.color;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 3;
            ctx.textAlign = 'center';
            ctx.strokeText(t.text, sx, sy);
            ctx.fillText(t.text, sx, sy);
            ctx.restore();
        }
    }

    clear() {
        this.particles.length = 0;
        this.textParticles.length = 0;
    }
}
