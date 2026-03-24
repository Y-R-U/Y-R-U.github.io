// ── Obstacle System ── Destructible and indestructible walls ──
const Obstacles = (() => {
    let walls = [];
    let spawnTimer = 0;
    let passed = new Set(); // track which wall pairs player has passed

    function reset() {
        walls = [];
        spawnTimer = 1.5; // delay before first wall
        passed.clear();
    }

    function update(dt, speedMult, score) {
        const speed = CONFIG.OBS_BASE_SPEED * speedMult;

        // Move walls
        for (let i = walls.length - 1; i >= 0; i--) {
            walls[i].x -= speed * dt;
            if (walls[i].x + CONFIG.OBS_WIDTH < -10) {
                walls.splice(i, 1);
            }
        }

        // Spawn new walls
        spawnTimer -= dt;
        if (spawnTimer <= 0) {
            spawnTimer = CONFIG.OBS_SPAWN_INTERVAL / Math.sqrt(speedMult);
            spawnWallPair(score);
        }
    }

    function spawnWallPair(score) {
        const W = CONFIG.DESIGN_WIDTH;
        const H = CONFIG.DESIGN_HEIGHT;
        const gap = CONFIG.OBS_GAP - Math.min(30, score * 0.3); // gap shrinks slightly
        const actualGap = Math.max(100, gap);

        const minY = H * CONFIG.OBS_MIN_GAP_Y;
        const maxY = H * CONFIG.OBS_MAX_GAP_Y;
        const gapCenter = minY + Math.random() * (maxY - minY);

        const pairId = Date.now() + Math.random();
        const destructible = Math.random() < CONFIG.DESTRUCTIBLE_CHANCE;
        const hp = destructible ?
            CONFIG.WALL_HP_MIN + Math.floor(Math.random() * (CONFIG.WALL_HP_MAX - CONFIG.WALL_HP_MIN + 1)) : -1;

        // Top wall
        walls.push({
            x: W + 10,
            y: 0,
            w: CONFIG.OBS_WIDTH,
            h: gapCenter - actualGap / 2,
            destructible,
            hp: destructible ? hp : -1,
            maxHp: hp,
            pairId,
            isTop: true,
        });

        // Bottom wall
        walls.push({
            x: W + 10,
            y: gapCenter + actualGap / 2,
            w: CONFIG.OBS_WIDTH,
            h: H - (gapCenter + actualGap / 2),
            destructible,
            hp: destructible ? hp : -1,
            maxHp: hp,
            pairId,
            isTop: false,
        });
    }

    function checkBulletHit(bullet) {
        for (let i = walls.length - 1; i >= 0; i--) {
            const w = walls[i];
            if (!w.destructible) continue;
            if (bullet.x + CONFIG.BULLET_W / 2 > w.x &&
                bullet.x - CONFIG.BULLET_W / 2 < w.x + w.w &&
                bullet.y + CONFIG.BULLET_H / 2 > w.y &&
                bullet.y - CONFIG.BULLET_H / 2 < w.y + w.h) {
                w.hp--;
                Particles.bulletImpact(bullet.x, bullet.y, '#cc8844');
                Audio.playSfx('hit');
                if (w.hp <= 0) {
                    Particles.wallBreak(w.x + w.w / 2, w.y + w.h / 2);
                    Audio.playSfx('wallbreak');
                    walls.splice(i, 1);
                    return 'destroyed';
                }
                return 'hit';
            }
        }
        return null;
    }

    function checkPlayerCollision(bbox) {
        for (const w of walls) {
            if (bbox.x + bbox.w > w.x &&
                bbox.x < w.x + w.w &&
                bbox.y + bbox.h > w.y &&
                bbox.y < w.y + w.h) {
                return w;
            }
        }
        return null;
    }

    function checkPassed(playerX) {
        let scoreGain = 0;
        for (const w of walls) {
            if (!passed.has(w.pairId) && w.x + w.w < playerX) {
                passed.add(w.pairId);
                scoreGain = CONFIG.PASS_SCORE;
            }
        }
        return scoreGain;
    }

    function draw(ctx) {
        for (const w of walls) {
            if (w.destructible) {
                // Destructible wall - orange/brown with cracks based on damage
                const dmgRatio = w.maxHp > 0 ? w.hp / w.maxHp : 1;
                const r = Math.floor(180 + (1 - dmgRatio) * 50);
                const g = Math.floor(100 + (1 - dmgRatio) * 20);
                ctx.fillStyle = `rgb(${r},${g},60)`;
                ctx.fillRect(w.x, w.y, w.w, w.h);

                // Brick pattern
                ctx.strokeStyle = 'rgba(0,0,0,0.3)';
                ctx.lineWidth = 1;
                const brickH = 12;
                for (let by = w.y; by < w.y + w.h; by += brickH) {
                    ctx.beginPath();
                    ctx.moveTo(w.x, by);
                    ctx.lineTo(w.x + w.w, by);
                    ctx.stroke();
                    const offset = (Math.floor((by - w.y) / brickH) % 2) * (w.w / 2);
                    ctx.beginPath();
                    ctx.moveTo(w.x + offset, by);
                    ctx.lineTo(w.x + offset, by + brickH);
                    ctx.stroke();
                }

                // Damage cracks
                if (dmgRatio < 1) {
                    ctx.strokeStyle = 'rgba(50,30,10,0.6)';
                    ctx.lineWidth = 1.5;
                    const cx = w.x + w.w / 2;
                    const cy = w.y + w.h / 2;
                    for (let c = 0; c < (1 - dmgRatio) * 4 + 1; c++) {
                        ctx.beginPath();
                        ctx.moveTo(cx + (Math.random() - 0.5) * w.w * 0.6,
                            cy + (Math.random() - 0.5) * w.h * 0.3);
                        ctx.lineTo(cx + (Math.random() - 0.5) * w.w * 0.8,
                            cy + (Math.random() - 0.5) * w.h * 0.5);
                        ctx.stroke();
                    }
                }

                // Glow indicator that it's destructible
                ctx.strokeStyle = '#ffaa44';
                ctx.lineWidth = 2;
                ctx.strokeRect(w.x, w.y, w.w, w.h);
            } else {
                // Indestructible wall - metallic gray
                const grad = ctx.createLinearGradient(w.x, 0, w.x + w.w, 0);
                grad.addColorStop(0, '#556677');
                grad.addColorStop(0.5, '#778899');
                grad.addColorStop(1, '#556677');
                ctx.fillStyle = grad;
                ctx.fillRect(w.x, w.y, w.w, w.h);

                // Metal rivets pattern
                ctx.fillStyle = '#445566';
                for (let ry = w.y + 10; ry < w.y + w.h - 5; ry += 20) {
                    ctx.beginPath();
                    ctx.arc(w.x + 8, ry, 3, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.arc(w.x + w.w - 8, ry, 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Metallic border
                ctx.strokeStyle = '#8899aa';
                ctx.lineWidth = 2;
                ctx.strokeRect(w.x, w.y, w.w, w.h);
                ctx.strokeStyle = '#334455';
                ctx.lineWidth = 1;
                ctx.strokeRect(w.x + 3, w.y + 3, w.w - 6, w.h - 6);
            }
        }
    }

    return {
        reset, update, checkBulletHit, checkPlayerCollision, checkPassed, draw,
        get walls() { return walls; },
    };
})();
