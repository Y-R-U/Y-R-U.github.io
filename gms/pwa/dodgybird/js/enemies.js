// ── Enemy System ── Drones & Boss ──
const Enemies = (() => {
    let drones = [];
    let boss = null;
    let enemyBullets = [];
    let droneSpawnTimer = 0;
    let bossDefeated = {}; // track which boss milestones have been fought

    function reset() {
        drones = [];
        boss = null;
        enemyBullets = [];
        droneSpawnTimer = 3;
        bossDefeated = {};
    }

    function update(dt, speedMult, score, playerY) {
        const H = CONFIG.DESIGN_HEIGHT;

        // Spawn drones with obstacles
        droneSpawnTimer -= dt;
        if (droneSpawnTimer <= 0) {
            droneSpawnTimer = (3 + Math.random() * 2) / speedMult;
            if (Math.random() < CONFIG.DRONE_SPAWN_CHANCE + score * CONFIG.DRONE_RATE_SCALE) {
                spawnDrone();
            }
        }

        // Boss spawn
        const bossThreshold = Math.floor(score / CONFIG.BOSS_SCORE_INTERVAL) * CONFIG.BOSS_SCORE_INTERVAL;
        if (bossThreshold > 0 && !bossDefeated[bossThreshold] && !boss && score >= bossThreshold) {
            spawnBoss(bossThreshold);
        }

        // Update drones
        for (let i = drones.length - 1; i >= 0; i--) {
            const d = drones[i];
            d.x -= CONFIG.DRONE_SPEED * speedMult * dt;
            // Sine wave movement
            d.waveTimer += dt * 2;
            d.y = d.baseY + Math.sin(d.waveTimer) * 40;
            d.y = Math.max(CONFIG.DRONE_SIZE, Math.min(H - CONFIG.DRONE_SIZE, d.y));

            // Shooting
            d.fireTimer -= dt;
            if (d.fireTimer <= CONFIG.DRONE_WARNING_TIME && !d.warning) {
                d.warning = true;
                Audio.playSfx('drone_warn');
            }
            if (d.fireTimer <= 0) {
                d.fireTimer = CONFIG.DRONE_FIRE_RATE;
                d.warning = false;
                fireDroneBullet(d, playerY);
            }

            d.animTimer += dt;

            if (d.x < -CONFIG.DRONE_SIZE * 2) {
                drones.splice(i, 1);
            }
        }

        // Update boss
        if (boss) {
            // Boss movement pattern
            boss.moveTimer += dt;
            const targetY = H / 2 + Math.sin(boss.moveTimer * 0.8) * (H * 0.3);
            boss.y += (targetY - boss.y) * 2 * dt;
            boss.x += (CONFIG.DESIGN_WIDTH * 0.78 - boss.x) * dt; // Settle to 78% from left

            // Boss shooting
            boss.fireTimer -= dt;
            if (boss.fireTimer <= 0) {
                boss.fireTimer = CONFIG.BOSS_FIRE_RATE;
                fireBossBullets(boss, playerY);
            }

            boss.animTimer += dt;

            // Flash on hit
            if (boss.hitFlash > 0) boss.hitFlash -= dt;
        }

        // Update enemy bullets
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            if (b.x < -20 || b.x > CONFIG.DESIGN_WIDTH + 20 ||
                b.y < -20 || b.y > H + 20) {
                enemyBullets.splice(i, 1);
            }
        }
    }

    function spawnDrone() {
        const H = CONFIG.DESIGN_HEIGHT;
        drones.push({
            x: CONFIG.DESIGN_WIDTH + CONFIG.DRONE_SIZE,
            y: CONFIG.DRONE_SIZE + Math.random() * (H - CONFIG.DRONE_SIZE * 2),
            baseY: CONFIG.DRONE_SIZE + Math.random() * (H - CONFIG.DRONE_SIZE * 2),
            hp: CONFIG.DRONE_HP,
            fireTimer: CONFIG.DRONE_FIRE_RATE,
            waveTimer: Math.random() * Math.PI * 2,
            warning: false,
            animTimer: 0,
        });
    }

    function spawnBoss(milestone) {
        Audio.playSfx('boss_warn');
        boss = {
            x: CONFIG.DESIGN_WIDTH + CONFIG.BOSS_W,
            y: CONFIG.DESIGN_HEIGHT / 2,
            hp: CONFIG.BOSS_HP,
            maxHp: CONFIG.BOSS_HP,
            fireTimer: 2,
            moveTimer: 0,
            animTimer: 0,
            hitFlash: 0,
            milestone,
        };
    }

    function fireDroneBullet(drone, playerY) {
        const angle = Math.atan2(playerY - drone.y, -CONFIG.DESIGN_WIDTH * 0.3);
        enemyBullets.push({
            x: drone.x - CONFIG.DRONE_SIZE / 2,
            y: drone.y,
            vx: Math.cos(angle) * CONFIG.DRONE_BULLET_SPEED,
            vy: Math.sin(angle) * CONFIG.DRONE_BULLET_SPEED,
            size: CONFIG.DRONE_BULLET_SIZE,
            fromBoss: false,
        });
    }

    function fireBossBullets(b, playerY) {
        // Boss fires a spread
        const angles = [-0.3, -0.15, 0, 0.15, 0.3];
        const baseAngle = Math.atan2(playerY - b.y, -(b.x - CONFIG.DESIGN_WIDTH * 0.15));
        for (const offset of angles) {
            const a = baseAngle + offset;
            enemyBullets.push({
                x: b.x - CONFIG.BOSS_W / 2,
                y: b.y,
                vx: Math.cos(a) * CONFIG.BOSS_BULLET_SPEED,
                vy: Math.sin(a) * CONFIG.BOSS_BULLET_SPEED,
                size: CONFIG.BOSS_BULLET_SIZE,
                fromBoss: true,
            });
        }
        Audio.playSfx('shoot');
    }

    function checkPlayerBulletHits(bullets) {
        const results = [];
        for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            // Check drones
            for (let di = drones.length - 1; di >= 0; di--) {
                const d = drones[di];
                const dist = Math.hypot(b.x - d.x, b.y - d.y);
                if (dist < CONFIG.DRONE_SIZE) {
                    d.hp--;
                    Particles.bulletImpact(b.x, b.y, '#ff4444');
                    bullets.splice(bi, 1);
                    if (d.hp <= 0) {
                        Particles.explosion(d.x, d.y, '#ff6633');
                        Audio.playSfx('explode');
                        results.push({
                            type: 'drone_kill',
                            x: d.x, y: d.y,
                        });
                        drones.splice(di, 1);
                    } else {
                        Audio.playSfx('hit');
                    }
                    break;
                }
            }

            // Check boss
            if (boss && bi < bullets.length) {
                const bul = bullets[bi];
                if (bul.x + CONFIG.BULLET_W / 2 > boss.x - CONFIG.BOSS_W / 2 &&
                    bul.x - CONFIG.BULLET_W / 2 < boss.x + CONFIG.BOSS_W / 2 &&
                    bul.y + CONFIG.BULLET_H / 2 > boss.y - CONFIG.BOSS_H / 2 &&
                    bul.y - CONFIG.BULLET_H / 2 < boss.y + CONFIG.BOSS_H / 2) {
                    boss.hp--;
                    boss.hitFlash = 0.1;
                    Particles.bulletImpact(bul.x, bul.y, '#ff2222');
                    bullets.splice(bi, 1);
                    Audio.playSfx('hit');
                    if (boss.hp <= 0) {
                        Particles.explosion(boss.x, boss.y, '#ff4400');
                        Particles.explosion(boss.x - 20, boss.y - 15, '#ffaa00');
                        Particles.explosion(boss.x + 15, boss.y + 20, '#ff6600');
                        Audio.playSfx('explode');
                        results.push({
                            type: 'boss_kill',
                            x: boss.x, y: boss.y,
                            milestone: boss.milestone,
                        });
                        bossDefeated[boss.milestone] = true;
                        boss = null;
                    }
                }
            }
        }
        return results;
    }

    function checkEnemyBulletHit(playerBBox) {
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            if (b.x + b.size > playerBBox.x &&
                b.x - b.size < playerBBox.x + playerBBox.w &&
                b.y + b.size > playerBBox.y &&
                b.y - b.size < playerBBox.y + playerBBox.h) {
                Particles.bulletImpact(b.x, b.y, '#ff4444');
                enemyBullets.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    function draw(ctx) {
        // Draw drones
        for (const d of drones) {
            ctx.save();
            ctx.translate(d.x, d.y);

            // Body
            ctx.fillStyle = '#cc3333';
            ctx.beginPath();
            ctx.arc(0, 0, CONFIG.DRONE_SIZE / 2, 0, Math.PI * 2);
            ctx.fill();

            // Eye
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(-3, -2, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(-3, -2, 2, 0, Math.PI * 2);
            ctx.fill();

            // Propellers
            const propAngle = d.animTimer * 15;
            ctx.strokeStyle = '#888';
            ctx.lineWidth = 2;
            for (let p = 0; p < 4; p++) {
                const a = propAngle + p * Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a) * CONFIG.DRONE_SIZE * 0.7,
                    Math.sin(a) * CONFIG.DRONE_SIZE * 0.7);
                ctx.stroke();
            }

            // Warning indicator
            if (d.warning) {
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 2;
                ctx.globalAlpha = 0.5 + Math.sin(d.animTimer * 20) * 0.5;
                ctx.beginPath();
                ctx.arc(0, 0, CONFIG.DRONE_SIZE, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            ctx.restore();
        }

        // Draw boss
        if (boss) {
            ctx.save();
            ctx.translate(boss.x, boss.y);

            const flash = boss.hitFlash > 0;

            // Main body
            ctx.fillStyle = flash ? '#ffffff' : '#881122';
            ctx.beginPath();
            ctx.moveTo(CONFIG.BOSS_W / 2, 0);
            ctx.lineTo(CONFIG.BOSS_W / 4, -CONFIG.BOSS_H / 2);
            ctx.lineTo(-CONFIG.BOSS_W / 2, -CONFIG.BOSS_H / 3);
            ctx.lineTo(-CONFIG.BOSS_W / 2, CONFIG.BOSS_H / 3);
            ctx.lineTo(CONFIG.BOSS_W / 4, CONFIG.BOSS_H / 2);
            ctx.closePath();
            ctx.fill();

            // Armor plating
            ctx.fillStyle = flash ? '#ffcccc' : '#aa2233';
            ctx.fillRect(-CONFIG.BOSS_W / 3, -CONFIG.BOSS_H / 4,
                CONFIG.BOSS_W / 2, CONFIG.BOSS_H / 2);

            // Eyes
            ctx.fillStyle = '#ff0000';
            ctx.beginPath();
            ctx.arc(-CONFIG.BOSS_W / 6, -8, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(-CONFIG.BOSS_W / 6, 8, 5, 0, Math.PI * 2);
            ctx.fill();

            // HP bar
            const barW = CONFIG.BOSS_W;
            const barH = 6;
            const barY = -CONFIG.BOSS_H / 2 - 12;
            ctx.fillStyle = '#333';
            ctx.fillRect(-barW / 2, barY, barW, barH);
            const hpRatio = boss.hp / boss.maxHp;
            ctx.fillStyle = hpRatio > 0.5 ? '#44cc44' : hpRatio > 0.25 ? '#cccc44' : '#cc4444';
            ctx.fillRect(-barW / 2, barY, barW * hpRatio, barH);
            ctx.strokeStyle = '#666';
            ctx.lineWidth = 1;
            ctx.strokeRect(-barW / 2, barY, barW, barH);

            ctx.restore();
        }

        // Draw enemy bullets
        for (const b of enemyBullets) {
            ctx.fillStyle = b.fromBoss ? '#ff2244' : '#ff6644';
            ctx.shadowColor = b.fromBoss ? '#ff0022' : '#ff4400';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }
    }

    return {
        reset, update, checkPlayerBulletHits, checkEnemyBulletHit, draw,
        get hasBoss() { return boss !== null; },
        get drones() { return drones; },
    };
})();
