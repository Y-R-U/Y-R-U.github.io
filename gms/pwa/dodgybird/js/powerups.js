// ── Power-up System ──
const Powerups = (() => {
    let items = [];
    let coins = [];

    const COLORS = {
        shield: '#44aaff',
        rapidfire: '#ff8800',
        multiplier: '#ffdd00',
        health: '#44ff44',
    };

    const LABELS = {
        shield: 'S',
        rapidfire: 'R',
        multiplier: 'x2',
        health: '+',
    };

    function reset() {
        items = [];
        coins = [];
    }

    function spawnFromEnemy(x, y, coinCount) {
        // Always drop coins
        for (let i = 0; i < coinCount; i++) {
            coins.push({
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 30,
                vx: -20 + (Math.random() - 0.5) * 60,
                vy: (Math.random() - 0.5) * 80,
                life: 5,
            });
        }

        // Maybe drop power-up
        if (Math.random() < CONFIG.POWERUP_DROP_CHANCE) {
            const types = CONFIG.POWERUP_TYPES;
            const type = types[Math.floor(Math.random() * types.length)];
            items.push({
                x, y, type,
                life: 6,
                bobTimer: Math.random() * Math.PI * 2,
            });
        }
    }

    function spawnFromWall(x, y) {
        if (Math.random() < 0.3) {
            coins.push({
                x, y,
                vx: -30,
                vy: (Math.random() - 0.5) * 40,
                life: 5,
            });
        }
    }

    function update(dt, speedMult, magnetRange) {
        // Update power-up items
        for (let i = items.length - 1; i >= 0; i--) {
            const p = items[i];
            p.x -= CONFIG.POWERUP_SPEED * speedMult * dt;
            p.bobTimer += dt * 3;
            p.life -= dt;
            if (p.x < -CONFIG.POWERUP_SIZE * 2 || p.life <= 0) {
                items.splice(i, 1);
            }
        }

        // Update coins
        for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.vx *= 0.96;
            c.vy *= 0.96;
            c.life -= dt;

            // Magnet effect
            if (magnetRange > 0) {
                const dx = Player.x - c.x;
                const dy = Player.y - c.y;
                const dist = Math.hypot(dx, dy);
                if (dist < magnetRange) {
                    const force = (1 - dist / magnetRange) * 400;
                    c.vx += (dx / dist) * force * dt;
                    c.vy += (dy / dist) * force * dt;
                }
            }

            if (c.life <= 0) {
                coins.splice(i, 1);
            }
        }
    }

    function checkPlayerCollision(playerBBox, upgrades) {
        const results = { powerup: null, coins: 0 };
        const px = playerBBox.x + playerBBox.w / 2;
        const py = playerBBox.y + playerBBox.h / 2;

        // Power-ups
        for (let i = items.length - 1; i >= 0; i--) {
            const p = items[i];
            const dist = Math.hypot(px - p.x, py - p.y);
            if (dist < CONFIG.POWERUP_SIZE + 15) {
                Particles.powerupCollect(p.x, p.y, COLORS[p.type]);
                Audio.playSfx('pickup');
                results.powerup = p.type;
                items.splice(i, 1);
            }
        }

        // Coins
        for (let i = coins.length - 1; i >= 0; i--) {
            const c = coins[i];
            const dist = Math.hypot(px - c.x, py - c.y);
            if (dist < 18) {
                Particles.coinCollect(c.x, c.y);
                Audio.playSfx('coin');
                results.coins += CONFIG.COIN_VALUE;
                coins.splice(i, 1);
            }
        }

        return results;
    }

    function draw(ctx) {
        // Draw power-up items
        for (const p of items) {
            const bobY = Math.sin(p.bobTimer) * 5;
            const px = p.x;
            const py = p.y + bobY;
            const size = CONFIG.POWERUP_SIZE;

            // Glow
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = COLORS[p.type];
            ctx.beginPath();
            ctx.arc(px, py, size + 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // Body
            ctx.fillStyle = COLORS[p.type];
            ctx.beginPath();
            ctx.arc(px, py, size / 2, 0, Math.PI * 2);
            ctx.fill();

            // Border
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(px, py, size / 2, 0, Math.PI * 2);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(LABELS[p.type], px, py);
        }

        // Draw coins
        for (const c of coins) {
            const alpha = Math.min(1, c.life);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#cc9900';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    return { reset, spawnFromEnemy, spawnFromWall, update, checkPlayerCollision, draw };
})();
