/* particles.js - Visual particle effects for goal collection, level complete */
'use strict';

const Particles = (() => {
    let particles = [];

    function init() { particles = []; }

    function spawn(x, y, count, color, spread = 60) {
        for (let i = 0; i < count; i++) {
            if (particles.length >= CONFIG.MAX_PARTICLES) break;
            const angle = Math.random() * Math.PI * 2;
            const speed = 30 + Math.random() * spread;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: CONFIG.PARTICLE_LIFE * (0.5 + Math.random() * 0.5),
                maxLife: CONFIG.PARTICLE_LIFE,
                size: 2 + Math.random() * 4,
                color,
                gravity: 20 + Math.random() * 30,
            });
        }
    }

    function spawnGoalCollect(x, y, goalType) {
        const color = GOAL_TYPES[goalType]?.color || '#d4a017';
        spawn(x, y, 15, color, 80);
        spawn(x, y, 8, '#fff', 40);
    }

    function spawnLevelComplete(cx, cy) {
        const colors = ['#d4a017', '#5c8a4d', '#e8a0a0', '#5a7abf', '#c87533'];
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                const sx = cx + (Math.random() - 0.5) * 200;
                const sy = cy + (Math.random() - 0.5) * 200;
                spawn(sx, sy, 12, colors[i % colors.length], 100);
            }, i * 80);
        }
    }

    function spawnStarBurst(x, y) {
        spawn(x, y, 10, '#d4a017', 50);
    }

    function update(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += p.gravity * dt;
            p.vx *= 0.98;
            p.life -= dt;
            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    function draw(ctx) {
        for (const p of particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    return { init, spawn, spawnGoalCollect, spawnLevelComplete, spawnStarBurst, update, draw };
})();
