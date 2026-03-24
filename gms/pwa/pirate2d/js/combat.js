// Combat system - auto-firing cannons and projectiles

import { dist, angle } from './utils.js';

export class CombatSystem {
    constructor() {
        this.projectiles = [];
        this.mines = []; // Mines laid by bosses
    }

    update(dt, player, enemies, particles, audio, game) {
        // Auto-fire at nearest enemy
        if (player.canFire()) {
            const target = this._findNearestEnemy(player, enemies);
            if (target) {
                this._firePlayerCannon(player, target, audio);
            }
        }

        // Enemy auto-fire + mine laying
        for (const enemy of enemies) {
            if (!enemy.alive) continue;

            // Boss mine laying
            if (enemy.shouldLayMine && enemy.shouldLayMine()) {
                this.mines.push({
                    x: enemy.x, y: enemy.y,
                    damage: enemy.cannonDamage * 1.5,
                    life: 30, // Mines last 30 seconds
                    radius: 60, // Detonation radius
                    pulsePhase: Math.random() * Math.PI * 2
                });
            }

            // Boss heal text
            if (enemy._justHealed > 0) {
                const healAmt = Math.round(enemy.maxHp * 0.3);
                if (enemy._justHealed > 1.9) { // Only show text once
                    particles.addText(enemy.x, enemy.y - 50, `HEALED +${healAmt}`, '#44ff44', 20, 2.0);
                }
            }

            if (enemy.cannonCooldown > 0) continue;
            const d = dist(enemy.x, enemy.y, player.x, player.y);
            if (d < enemy.cannonRange) {
                this._fireEnemyCannon(enemy, player, audio);
            }
        }

        // Fire on Kraken if exists
        if (game && game.kraken && game.kraken.alive) {
            const k = game.kraken;
            if (player.canFire()) {
                const d = dist(player.x, player.y, k.x, k.y);
                if (d < player.cannonRange) {
                    this._firePlayerCannonAt(player, k, audio);
                }
            }

            // Kraken heal text
            if (k._justHealed > 0 && k._justHealed > 1.9) {
                const healAmt = Math.round(k.maxHp * 0.25);
                particles.addText(k.x, k.y - 50, `HEALED +${healAmt}`, '#44ff44', 22, 2.0);
            }

            // Kraken fires at player (explosive if red eye mode)
            if (k.cannonCooldown <= 0) {
                const d = dist(k.x, k.y, player.x, player.y);
                if (d < k.cannonRange) {
                    this._fireKrakenCannon(k, player, audio);
                }
            }
        }

        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;

            // Explosive projectile with target: detonate when reaching target area
            if (p.explosive && p.targetX !== undefined) {
                const distToTarget = dist(p.x, p.y, p.targetX, p.targetY);
                if (distToTarget < 30) { // Close enough to target - detonate
                    p.life = 0; // Force expiry to trigger detonation below
                }
            }

            if (p.life <= 0) {
                if (p.explosive) {
                    // Explosive projectile detonates - check blast radius for damage
                    particles.addExplosion(p.x, p.y, 15, '#ff4400');
                    particles.addExplosion(p.x, p.y, 8, '#ff8800');
                    audio.playExplosion();
                    if (game) game.addShake(5);
                    const blastDist = dist(p.x, p.y, player.x, player.y);
                    if (blastDist < p.blastRadius && !p.isPlayer) {
                        // Damage falls off with distance
                        const falloff = 1 - (blastDist / p.blastRadius) * 0.4;
                        const dmg = player.takeDamage(Math.round(p.damage * 0.6 * falloff));
                        if (dmg > 0) {
                            particles.addText(player.x, player.y - 30, `-${dmg}`, '#ff2222', 18);
                            if (game) game.addShake(6);
                        }
                    }
                } else {
                    particles.addSplash(p.x, p.y, 4);
                }
                this.projectiles.splice(i, 1);
                continue;
            }

            if (p.isPlayer) {
                // Check hits on enemies
                let hit = false;
                for (const enemy of enemies) {
                    if (!enemy.alive) continue;
                    const d = dist(p.x, p.y, enemy.x, enemy.y);
                    if (d < enemy.hitRadius) {
                        const dmg = enemy.takeDamage(p.damage);
                        particles.addExplosion(p.x, p.y, 8, '#ff6600');
                        particles.addText(enemy.x, enemy.y - 30, `-${dmg}`, '#ff4444', enemy.isBoss ? 20 : 16, enemy.isBoss ? 2.0 : 1.2);
                        audio.playHit();

                        if (!enemy.alive) {
                            this._onEnemyKill(enemy, player, particles, audio, game);
                        }
                        this.projectiles.splice(i, 1);
                        hit = true;
                        break;
                    }
                }

                // Check hits on Kraken
                if (!hit && game && game.kraken && game.kraken.alive) {
                    const k = game.kraken;
                    const d = dist(p.x, p.y, k.x, k.y);
                    if (d < k.hitRadius) {
                        const dmg = k.takeDamage(p.damage);
                        particles.addExplosion(p.x, p.y, 10, '#44ff88');
                        particles.addText(k.x, k.y - 30, `-${dmg}`, '#ff4444', 22, 2.0);
                        audio.playHit();

                        if (!k.alive) {
                            this._onKrakenKill(k, player, particles, audio, game);
                        }
                        this.projectiles.splice(i, 1);
                    }
                }
            } else {
                // Check hits on player
                const d = dist(p.x, p.y, player.x, player.y);
                if (d < 25) {
                    const dmg = player.takeDamage(p.damage);
                    if (dmg > 0) {
                        if (p.explosive) {
                            particles.addExplosion(p.x, p.y, 14, '#ff4400');
                            audio.playExplosion();
                        } else {
                            particles.addExplosion(p.x, p.y, 6, '#ff3300');
                        }
                        particles.addText(player.x, player.y - 30, `-${dmg}`, '#ff2222', 18);
                        audio.playHit();
                        if (game) game.addShake(p.explosive ? 8 : 3 + dmg * 0.1);
                    }
                    this.projectiles.splice(i, 1);
                }
            }
        }

        // Update mines
        for (let i = this.mines.length - 1; i >= 0; i--) {
            const mine = this.mines[i];
            mine.life -= dt;
            mine.pulsePhase += dt * 4;
            if (mine.life <= 0) {
                this.mines.splice(i, 1);
                continue;
            }
            // Check player proximity
            const d = dist(mine.x, mine.y, player.x, player.y);
            if (d < mine.radius) {
                const dmg = player.takeDamage(mine.damage);
                if (dmg > 0) {
                    particles.addExplosion(mine.x, mine.y, 15, '#ff4400');
                    particles.addText(player.x, player.y - 30, `-${dmg} MINE`, '#ff2222', 18);
                    audio.playExplosion();
                    if (game) game.addShake(6);
                }
                this.mines.splice(i, 1);
            }
        }

        // Spawn fire particles on damaged ships
        this._updateDamageEffects(dt, player, enemies, particles, game);
    }

    _updateDamageEffects(dt, player, enemies, particles, game) {
        // Player fire effects
        if (player.hpRatio < 0.75) {
            player.fireTimer -= dt;
            if (player.fireTimer <= 0) {
                const intensity = player.hpRatio < 0.4 ? 3 : 1;
                particles.addFire(
                    player.x + (Math.random() - 0.5) * 20,
                    player.y + (Math.random() - 0.5) * 20,
                    intensity
                );
                if (player.hpRatio < 0.4) {
                    particles.addSmoke(player.x, player.y, 1);
                }
                player.fireTimer = player.hpRatio < 0.4 ? 0.1 : 0.3;
            }
        }

        // Enemy fire effects
        for (const enemy of enemies) {
            if (!enemy.alive || enemy.hpRatio >= 0.75) continue;
            enemy.fireTimer -= dt;
            if (enemy.fireTimer <= 0) {
                const intensity = enemy.hpRatio < 0.4 ? 2 : 1;
                particles.addFire(
                    enemy.x + (Math.random() - 0.5) * 15 * enemy.scale,
                    enemy.y + (Math.random() - 0.5) * 15 * enemy.scale,
                    intensity
                );
                enemy.fireTimer = enemy.hpRatio < 0.4 ? 0.15 : 0.4;
            }
        }
    }

    _findNearestEnemy(player, enemies) {
        let nearest = null;
        let nearestDist = player.cannonRange;

        for (const enemy of enemies) {
            if (!enemy.alive) continue;
            const d = dist(player.x, player.y, enemy.x, enemy.y);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = enemy;
            }
        }
        return nearest;
    }

    _firePlayerCannon(player, target, audio) {
        player.fire();
        const targetAngle = angle(player.x, player.y, target.x, target.y);
        this._spawnPlayerProjectiles(player, targetAngle, audio);
    }

    _firePlayerCannonAt(player, target, audio) {
        player.fire();
        const targetAngle = angle(player.x, player.y, target.x, target.y);
        this._spawnPlayerProjectiles(player, targetAngle, audio);
    }

    _spawnPlayerProjectiles(player, targetAngle, audio) {
        const speed = 350;
        const cannonCount = player.cannonCount || 1;
        const shipRight = player.angle + Math.PI / 2;
        const shipLeft = player.angle - Math.PI / 2;
        const angleDiffRight = Math.abs(this._angleDiff(shipRight, targetAngle));
        const angleDiffLeft = Math.abs(this._angleDiff(shipLeft, targetAngle));

        const sides = [];
        if (angleDiffRight < Math.PI * 0.6) sides.push(Math.PI / 2);
        if (angleDiffLeft < Math.PI * 0.6) sides.push(-Math.PI / 2);
        if (sides.length === 0) sides.push(angleDiffRight < angleDiffLeft ? Math.PI / 2 : -Math.PI / 2);

        for (const off of sides) {
            // Fire multiple cannons with slight angle spread
            for (let c = 0; c < cannonCount; c++) {
                const spread = cannonCount > 1 ? (c - (cannonCount - 1) / 2) * 0.08 : 0;
                const fireAngle = targetAngle + spread;
                const spawnOffset = cannonCount > 1 ? (c - (cannonCount - 1) / 2) * 8 : 0;
                const perpAngle = player.angle;
                const spawnX = player.x + Math.cos(player.angle + off) * 20 + Math.cos(perpAngle) * spawnOffset;
                const spawnY = player.y + Math.sin(player.angle + off) * 20 + Math.sin(perpAngle) * spawnOffset;

                this.projectiles.push({
                    x: spawnX, y: spawnY,
                    vx: Math.cos(fireAngle) * speed,
                    vy: Math.sin(fireAngle) * speed,
                    damage: player.cannonDamage,
                    life: 1.5,
                    isPlayer: true,
                    size: 5
                });
            }
        }
        audio.playCannon();
    }

    _angleDiff(a, b) {
        let d = b - a;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    _fireEnemyCannon(enemy, player, audio) {
        enemy.cannonCooldown = 1 / enemy.cannonFireRate;
        const a = angle(enemy.x, enemy.y, player.x, player.y);
        const speed = 250;

        const d = dist(enemy.x, enemy.y, player.x, player.y);
        const inaccuracy = (Math.random() - 0.5) * 0.15 * (d / 200);

        this.projectiles.push({
            x: enemy.x, y: enemy.y,
            vx: Math.cos(a + inaccuracy) * speed,
            vy: Math.sin(a + inaccuracy) * speed,
            damage: enemy.cannonDamage,
            life: 1.5,
            isPlayer: false,
            size: 4
        });

        if (d < 400) audio.playCannon();
    }

    _fireKrakenCannon(kraken, player, audio) {
        kraken.cannonCooldown = 1 / kraken.cannonFireRate;
        const a = angle(kraken.x, kraken.y, player.x, player.y);
        const speed = 220;
        const d = dist(kraken.x, kraken.y, player.x, player.y);
        const inaccuracy = (Math.random() - 0.5) * 0.12 * (d / 200);

        if (kraken.redEyeMode) {
            // Explosive shot: targets player's current position
            // Projectile will detonate when it reaches the target area
            const fireAngle = a + inaccuracy;
            const travelTime = d / speed; // Time to reach player's current position
            this.projectiles.push({
                x: kraken.x, y: kraken.y,
                vx: Math.cos(fireAngle) * speed,
                vy: Math.sin(fireAngle) * speed,
                damage: kraken.cannonDamage,
                life: travelTime + 0.3, // Slight buffer past target
                isPlayer: false,
                size: 7,
                explosive: true,
                blastRadius: 80,
                targetX: player.x,
                targetY: player.y
            });
        } else {
            // Normal shot
            this.projectiles.push({
                x: kraken.x, y: kraken.y,
                vx: Math.cos(a + inaccuracy) * speed,
                vy: Math.sin(a + inaccuracy) * speed,
                damage: kraken.cannonDamage,
                life: 1.5,
                isPlayer: false,
                size: 5,
                explosive: false,
                blastRadius: 0
            });
        }

        if (d < 400) audio.playCannon();
    }

    _onEnemyKill(enemy, player, particles, audio, game) {
        const goldAmount = player.addGold(enemy.goldReward);
        const bossDur = 3.0;
        const dur = enemy.isBoss ? bossDur : 1.2;

        // Enhanced death explosion
        if (enemy.isBoss || enemy.isRunBoss) {
            particles.addDeathExplosion(enemy.x, enemy.y);
            particles.addBurningWreck(enemy.x, enemy.y, 4);
            audio.playBossExplosion();
        } else {
            // Regular death - smaller explosion + brief fire
            particles.addExplosion(enemy.x, enemy.y, 15, '#ff8800');
            particles.addSmoke(enemy.x, enemy.y, 8);
            particles.addBurningWreck(enemy.x, enemy.y, 2);
            audio.playExplosion();
        }

        particles.addText(enemy.x, enemy.y - 50, `+${goldAmount} gold`, '#ffd700', enemy.isBoss ? 22 : 18, dur);
        audio.playCoin();

        player.enemiesKilled++;
        if (game) game.addShake(enemy.isRunBoss ? 12 : enemy.isBoss ? 8 : 2);

        // Cargo drop
        const dropChance = enemy.isBoss ? 0.8 : 0.3;
        if (Math.random() < dropChance) {
            const items = ['Rum', 'Spices', 'Silk', 'Gunpowder', 'Sugar', 'Gold Ore'];
            const item = enemy.isBoss
                ? items[3 + Math.floor(Math.random() * 3)]
                : items[Math.floor(Math.random() * items.length)];
            const dropQty = enemy.isBoss ? 3 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 3);
            const qty = player.addCargo(item, dropQty);
            if (qty > 0) {
                particles.addText(enemy.x, enemy.y - 70, `+${qty} ${item}`, '#88ccff', enemy.isBoss ? 18 : 14, dur);
            }
        }

        // Boss bonus gold
        if (enemy.isBoss) {
            const bonus = player.addGold(enemy.goldReward);
            particles.addText(enemy.x, enemy.y - 90, `BOSS BONUS +${bonus}g`, '#ffaa00', 24, bossDur);

            const healAmt = Math.round(player.maxHp * 0.25);
            player.heal(healAmt);
            particles.addText(player.x, player.y - 50, `+${healAmt} HP`, '#44ff44', 20, bossDur);
        }

        // Run boss defeated
        if (enemy.isRunBoss && game) {
            game.onRunBossDefeated(enemy);
        }
    }

    _onKrakenKill(kraken, player, particles, audio, game) {
        const goldAmount = player.addGold(kraken.goldReward);

        // Massive death explosion
        particles.addDeathExplosion(kraken.x, kraken.y);
        particles.addDeathExplosion(kraken.x + 30, kraken.y - 20);
        particles.addDeathExplosion(kraken.x - 30, kraken.y + 20);
        particles.addBurningWreck(kraken.x, kraken.y, 5);
        audio.playBossExplosion();

        particles.addText(kraken.x, kraken.y - 80, `+${goldAmount} gold`, '#ffd700', 24, 4);
        particles.addText(kraken.x, kraken.y - 110, 'KRAKEN SLAIN!', '#00ff44', 28, 5);
        audio.playCoin();

        player.enemiesKilled++;
        if (game) {
            game.addShake(15);
            game.onRunBossDefeated(kraken);
        }

        const bonus = player.addGold(kraken.goldReward * 2);
        particles.addText(kraken.x, kraken.y - 140, `LEGENDARY BONUS +${bonus}g`, '#ffaa00', 26, 4);

        const healAmt = player.maxHp;
        player.heal(healAmt);
        particles.addText(player.x, player.y - 50, `FULL HEAL!`, '#44ff44', 22, 3);
    }

    draw(ctx, camX, camY, viewW, viewH, assets) {
        // Draw mines
        for (const mine of this.mines) {
            const mx = mine.x - camX + viewW / 2;
            const my = mine.y - camY + viewH / 2;
            if (mx < -20 || mx > viewW + 20 || my < -20 || my > viewH + 20) continue;

            const pulse = 0.5 + 0.5 * Math.sin(mine.pulsePhase);
            // Outer spikes
            ctx.save();
            ctx.translate(mx, my);
            ctx.fillStyle = '#333';
            ctx.beginPath();
            for (let i = 0; i < 8; i++) {
                const a = (Math.PI * 2 / 8) * i;
                const r = 8 + Math.sin(mine.pulsePhase + i) * 2;
                if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
                else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            ctx.closePath();
            ctx.fill();
            // Red center
            ctx.fillStyle = `rgba(255, ${Math.round(50 * (1 - pulse))}, 0, ${0.6 + pulse * 0.4})`;
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        // Draw projectiles
        for (const p of this.projectiles) {
            const sx = p.x - camX + viewW / 2;
            const sy = p.y - camY + viewH / 2;

            if (sx < -20 || sx > viewW + 20 || sy < -20 || sy > viewH + 20) continue;

            if (p.explosive) {
                // Glowing red explosive projectile
                ctx.save();
                ctx.shadowColor = '#ff2200';
                ctx.shadowBlur = 12;
                ctx.fillStyle = '#ff4400';
                ctx.beginPath();
                ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else {
                const ballImg = assets.get('cannonBall');
                if (ballImg) {
                    ctx.drawImage(ballImg, sx - p.size, sy - p.size, p.size * 2, p.size * 2);
                } else {
                    ctx.fillStyle = p.isPlayer ? '#333' : '#cc3333';
                    ctx.beginPath();
                    ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Trail
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = p.explosive ? '#ff6600' : p.isPlayer ? '#888' : '#aa4444';
            ctx.beginPath();
            ctx.arc(sx - p.vx * 0.02, sy - p.vy * 0.02, p.size * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    clear() {
        this.projectiles.length = 0;
        this.mines.length = 0;
    }
}
