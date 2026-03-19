// ── Particle System ── Explosions, impacts, trails ──
const Particles = (() => {
    let particles = [];

    function spawn(x, y, count, color, speed, life, size) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = speed * (0.3 + Math.random() * 0.7);
            particles.push({
                x, y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                life: life * (0.5 + Math.random() * 0.5),
                maxLife: life,
                size: size * (0.5 + Math.random() * 0.5),
                color,
            });
        }
    }

    function explosion(x, y, color = '#ff6633') {
        spawn(x, y, 18, color, 200, 0.5, 4);
        spawn(x, y, 8, '#ffcc00', 150, 0.3, 3);
        spawn(x, y, 5, '#ffffff', 100, 0.2, 2);
    }

    function bulletImpact(x, y, color = '#ffaa00') {
        spawn(x, y, 6, color, 120, 0.25, 2.5);
    }

    function wallBreak(x, y) {
        spawn(x, y, 12, '#cc8844', 180, 0.4, 5);
        spawn(x, y, 6, '#aa6633', 100, 0.3, 3);
    }

    function powerupCollect(x, y, color) {
        spawn(x, y, 15, color, 160, 0.5, 3.5);
        spawn(x, y, 8, '#ffffff', 120, 0.3, 2);
    }

    function coinCollect(x, y) {
        spawn(x, y, 6, '#ffd700', 100, 0.3, 3);
    }

    function trail(x, y, color = '#4488ff') {
        if (Math.random() > 0.3) return;
        particles.push({
            x: x + (Math.random() - 0.5) * 6,
            y: y + (Math.random() - 0.5) * 6,
            vx: -40 - Math.random() * 30,
            vy: (Math.random() - 0.5) * 20,
            life: 0.2 + Math.random() * 0.15,
            maxLife: 0.35,
            size: 2 + Math.random() * 2,
            color,
        });
    }

    function update(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;
            p.vx *= 0.96;
            p.vy *= 0.96;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function draw(ctx) {
        for (const p of particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    function clear() {
        particles = [];
    }

    return { spawn, explosion, bulletImpact, wallBreak, powerupCollect, coinCollect, trail, update, draw, clear };
})();
