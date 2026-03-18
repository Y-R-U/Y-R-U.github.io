// Combat system - auto-firing cannons and projectiles

import { dist, angle } from './utils.js';

export class CombatSystem {
    constructor() {
        this.projectiles = [];
    }

    update(dt, player, enemies, particles, audio) {
        // Auto-fire at nearest enemy
        if (player.canFire()) {
            const target = this._findNearestEnemy(player, enemies);
            if (target) {
                this._firePlayerCannon(player, target, audio);
            }
        }

        // Enemy auto-fire
        for (const enemy of enemies) {
            if (!enemy.alive || enemy.cannonCooldown > 0) continue;
            enemy.cannonCooldown -= dt;
            if (enemy.cannonCooldown <= 0) {
                const d = dist(enemy.x, enemy.y, player.x, player.y);
                if (d < enemy.cannonRange) {
                    this._fireEnemyCannon(enemy, player, audio);
                }
            }
        }

        // Update projectiles
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life -= dt;

            if (p.life <= 0) {
                particles.addSplash(p.x, p.y, 4);
                this.projectiles.splice(i, 1);
                continue;
            }

            if (p.isPlayer) {
                // Check hits on enemies
                for (const enemy of enemies) {
                    if (!enemy.alive) continue;
                    const d = dist(p.x, p.y, enemy.x, enemy.y);
                    if (d < enemy.hitRadius) {
                        const dmg = enemy.takeDamage(p.damage);
                        particles.addExplosion(p.x, p.y, 8, '#ff6600');
                        particles.addText(enemy.x, enemy.y - 30, `-${dmg}`, '#ff4444');
                        audio.playHit();

                        if (!enemy.alive) {
                            this._onEnemyKill(enemy, player, particles, audio);
                        }
                        this.projectiles.splice(i, 1);
                        break;
                    }
                }
            } else {
                // Check hits on player
                const d = dist(p.x, p.y, player.x, player.y);
                if (d < 25) {
                    const dmg = player.takeDamage(p.damage);
                    if (dmg > 0) {
                        particles.addExplosion(p.x, p.y, 6, '#ff3300');
                        particles.addText(player.x, player.y - 30, `-${dmg}`, '#ff2222', 18);
                        audio.playHit();
                    }
                    this.projectiles.splice(i, 1);
                }
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
        const a = angle(player.x, player.y, target.x, target.y);
        const speed = 350;

        // Fire from both sides of the ship
        const offsets = [Math.PI / 2, -Math.PI / 2];
        for (const off of offsets) {
            const spawnX = player.x + Math.cos(player.angle + off) * 20;
            const spawnY = player.y + Math.sin(player.angle + off) * 20;

            this.projectiles.push({
                x: spawnX, y: spawnY,
                vx: Math.cos(a) * speed,
                vy: Math.sin(a) * speed,
                damage: player.cannonDamage,
                life: 1.5,
                isPlayer: true,
                size: 5
            });
        }
        audio.playCannon();
    }

    _fireEnemyCannon(enemy, player, audio) {
        enemy.cannonCooldown = 1 / enemy.cannonFireRate;
        const a = angle(enemy.x, enemy.y, player.x, player.y);
        const speed = 250;

        // Add some inaccuracy based on distance
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

    _onEnemyKill(enemy, player, particles, audio) {
        // Gold drop
        const goldAmount = player.addGold(enemy.goldReward);
        particles.addText(enemy.x, enemy.y - 50, `+${goldAmount} gold`, '#ffd700', 18);
        particles.addExplosion(enemy.x, enemy.y, 15, '#ff8800');
        particles.addSmoke(enemy.x, enemy.y, 8);
        audio.playExplosion();
        audio.playCoin();

        player.enemiesKilled++;

        // Random cargo drop
        if (Math.random() < 0.3) {
            const items = ['Rum', 'Spices', 'Silk', 'Gunpowder', 'Sugar', 'Gold Ore'];
            const item = items[Math.floor(Math.random() * items.length)];
            const qty = player.addCargo(item, 1 + Math.floor(Math.random() * 3));
            if (qty > 0) {
                particles.addText(enemy.x, enemy.y - 70, `+${qty} ${item}`, '#88ccff', 14);
            }
        }
    }

    draw(ctx, camX, camY, viewW, viewH, assets) {
        for (const p of this.projectiles) {
            const sx = p.x - camX + viewW / 2;
            const sy = p.y - camY + viewH / 2;

            if (sx < -20 || sx > viewW + 20 || sy < -20 || sy > viewH + 20) continue;

            const ballImg = assets.get('cannonBall');
            if (ballImg) {
                ctx.drawImage(ballImg, sx - p.size, sy - p.size, p.size * 2, p.size * 2);
            } else {
                ctx.fillStyle = p.isPlayer ? '#333' : '#cc3333';
                ctx.beginPath();
                ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
                ctx.fill();
            }

            // Trail
            ctx.save();
            ctx.globalAlpha = 0.3;
            ctx.fillStyle = p.isPlayer ? '#888' : '#aa4444';
            ctx.beginPath();
            ctx.arc(sx - p.vx * 0.02, sy - p.vy * 0.02, p.size * 0.7, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    clear() {
        this.projectiles.length = 0;
    }
}
