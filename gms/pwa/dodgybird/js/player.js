// ── Player Entity ──
const Player = (() => {
    let x, y, vy;
    let health, maxHealth;
    let shootCooldown, shootLockTimer;
    let bullets;
    let shieldActive, shieldTimer;
    let rapidFire, rapidFireTimer;
    let multiplierActive, multiplierTimer;
    let fireRateBonus;
    let invulnTimer;
    let animFrame;
    let thrustAnim;

    function reset(upgrades) {
        x = CONFIG.DESIGN_WIDTH * CONFIG.PLAYER_X_RATIO;
        y = CONFIG.DESIGN_HEIGHT / 2;
        vy = 0;
        maxHealth = CONFIG.PLAYER_MAX_HEALTH + (upgrades.healthLvl || 0);
        health = maxHealth;
        shootCooldown = 0;
        shootLockTimer = 0;
        bullets = [];
        shieldActive = false;
        shieldTimer = 0;
        rapidFire = false;
        rapidFireTimer = 0;
        multiplierActive = false;
        multiplierTimer = 0;
        fireRateBonus = upgrades.fireRateLvl || 0;
        invulnTimer = 0;
        animFrame = 0;
        thrustAnim = 0;
    }

    function update(dt, moveInput) {
        animFrame += dt;
        thrustAnim += dt * 8;

        // Shoot lock prevents movement briefly after shooting
        if (shootLockTimer > 0) {
            shootLockTimer -= dt;
            moveInput = 0;
        }

        // Apply movement
        const targetVy = moveInput * CONFIG.PLAYER_SPEED;
        vy += (targetVy - vy) * (1 - Math.pow(CONFIG.PLAYER_DRAG, dt * 60));

        // Gravity pull (slight)
        vy += CONFIG.PLAYER_GRAVITY * dt * 0.3;

        y += vy * dt;

        // Edge bounce
        const pad = CONFIG.PLAYER_EDGE_PAD;
        if (y < pad) { y = pad; vy = Math.abs(vy) * 0.3; }
        if (y > CONFIG.DESIGN_HEIGHT - pad) {
            y = CONFIG.DESIGN_HEIGHT - pad;
            vy = -Math.abs(vy) * 0.3;
        }

        // Cooldowns
        if (shootCooldown > 0) shootCooldown -= dt;
        if (invulnTimer > 0) invulnTimer -= dt;

        // Power-up timers
        if (shieldActive) {
            shieldTimer -= dt;
            if (shieldTimer <= 0) shieldActive = false;
        }
        if (rapidFire) {
            rapidFireTimer -= dt;
            if (rapidFireTimer <= 0) rapidFire = false;
        }
        if (multiplierActive) {
            multiplierTimer -= dt;
            if (multiplierTimer <= 0) multiplierActive = false;
        }

        // Update bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            bullets[i].x += CONFIG.BULLET_SPEED * dt;
            if (bullets[i].x > CONFIG.DESIGN_WIDTH + 20) {
                bullets.splice(i, 1);
            }
        }

        // Engine trail
        Particles.trail(x - CONFIG.PLAYER_W / 2 - 2, y, '#4488ff');
    }

    function tryShoot() {
        if (shootCooldown > 0) return false;
        const rate = CONFIG.BASE_FIRE_RATE * (1 - fireRateBonus * 0.12);
        const actualRate = rapidFire ? rate * 0.4 : rate;
        shootCooldown = actualRate;
        shootLockTimer = CONFIG.SHOOT_LOCK_TIME;

        bullets.push({
            x: x + CONFIG.PLAYER_W / 2 + 2,
            y: y,
        });
        Audio.playSfx('shoot');
        return true;
    }

    function takeDamage(amount) {
        if (invulnTimer > 0) return false;
        if (shieldActive) {
            shieldActive = false;
            shieldTimer = 0;
            invulnTimer = 0.5;
            Audio.playSfx('hit');
            Particles.explosion(x, y, '#44aaff');
            return false;
        }
        health -= amount;
        invulnTimer = 1.0;
        Audio.playSfx('damage');
        if (health <= 0) {
            health = 0;
            return true; // dead
        }
        return false;
    }

    function heal(amount) {
        health = Math.min(maxHealth, health + amount);
    }

    function activatePowerup(type, upgrades) {
        const dur = CONFIG.POWERUP_DURATION + (upgrades.shieldLvl || 0) * 1.5;
        switch (type) {
            case 'shield':
                shieldActive = true;
                shieldTimer = dur;
                break;
            case 'rapidfire':
                rapidFire = true;
                rapidFireTimer = dur;
                break;
            case 'multiplier':
                multiplierActive = true;
                multiplierTimer = dur;
                break;
            case 'health':
                heal(1);
                break;
        }
    }

    function getScoreMultiplier() {
        return multiplierActive ? 2 : 1;
    }

    function getBBox() {
        return {
            x: x - CONFIG.PLAYER_W / 2 + 4,
            y: y - CONFIG.PLAYER_H / 2 + 3,
            w: CONFIG.PLAYER_W - 8,
            h: CONFIG.PLAYER_H - 6,
        };
    }

    function draw(ctx) {
        const px = x, py = y;
        const w = CONFIG.PLAYER_W, h = CONFIG.PLAYER_H;
        const flash = invulnTimer > 0 && Math.sin(invulnTimer * 20) > 0;

        ctx.save();
        ctx.translate(px, py);
        // Slight tilt based on vertical velocity
        const tilt = Math.max(-0.3, Math.min(0.3, vy / CONFIG.PLAYER_SPEED * 0.3));
        ctx.rotate(tilt);

        if (!flash) {
            // Ship body
            ctx.fillStyle = '#3388ff';
            ctx.beginPath();
            ctx.moveTo(w / 2 + 2, 0);
            ctx.lineTo(-w / 2 + 6, -h / 2);
            ctx.lineTo(-w / 2, -h / 2 + 4);
            ctx.lineTo(-w / 2 - 4, 0);
            ctx.lineTo(-w / 2, h / 2 - 4);
            ctx.lineTo(-w / 2 + 6, h / 2);
            ctx.closePath();
            ctx.fill();

            // Cockpit
            ctx.fillStyle = '#66ccff';
            ctx.beginPath();
            ctx.moveTo(w / 2 - 4, 0);
            ctx.lineTo(w / 2 - 14, -5);
            ctx.lineTo(w / 2 - 14, 5);
            ctx.closePath();
            ctx.fill();

            // Wings
            ctx.fillStyle = '#2266cc';
            ctx.beginPath();
            ctx.moveTo(-4, -h / 2 + 2);
            ctx.lineTo(-12, -h / 2 - 6);
            ctx.lineTo(-w / 2 + 4, -h / 2 + 2);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(-4, h / 2 - 2);
            ctx.lineTo(-12, h / 2 + 6);
            ctx.lineTo(-w / 2 + 4, h / 2 - 2);
            ctx.closePath();
            ctx.fill();

            // Engine glow
            const glowSize = 4 + Math.sin(thrustAnim) * 2;
            ctx.fillStyle = '#ff6633';
            ctx.beginPath();
            ctx.arc(-w / 2 - 4, 0, glowSize, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath();
            ctx.arc(-w / 2 - 4, 0, glowSize * 0.5, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();

        // Shield bubble
        if (shieldActive) {
            ctx.strokeStyle = '#44aaff';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.4 + Math.sin(animFrame * 5) * 0.2;
            ctx.beginPath();
            ctx.arc(px, py, Math.max(w, h) / 2 + 8, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    function drawBullets(ctx) {
        for (const b of bullets) {
            // Bullet glow
            ctx.fillStyle = '#ffdd44';
            ctx.shadowColor = '#ffaa00';
            ctx.shadowBlur = 6;
            ctx.fillRect(b.x - CONFIG.BULLET_W / 2, b.y - CONFIG.BULLET_H / 2,
                CONFIG.BULLET_W, CONFIG.BULLET_H);
            ctx.shadowBlur = 0;
        }
    }

    function getFireCooldownRatio() {
        const rate = CONFIG.BASE_FIRE_RATE * (1 - fireRateBonus * 0.12);
        const actualRate = rapidFire ? rate * 0.4 : rate;
        return Math.max(0, shootCooldown / actualRate);
    }

    function setInvulnerable(duration) {
        invulnTimer = duration;
    }

    return {
        reset, update, tryShoot, takeDamage, heal, activatePowerup, setInvulnerable,
        getScoreMultiplier, getBBox, draw, drawBullets, getFireCooldownRatio,
        get x() { return x; },
        get y() { return y; },
        get health() { return health; },
        get maxHealth() { return maxHealth; },
        get bullets() { return bullets; },
        get shieldActive() { return shieldActive; },
        get rapidFire() { return rapidFire; },
        get multiplierActive() { return multiplierActive; },
    };
})();
