// Enemy system - spawning, AI, scaling with distance

import { dist, angle, angleDiff, normalizeAngle, randFloat, randInt } from './utils.js';

const ENEMY_TYPES = [
    {
        name: 'Sloop',
        baseHp: 30,
        baseDamage: 5,
        baseSpeed: 80,
        baseGold: 15,
        fireRate: 0.5,
        range: 180,
        hitRadius: 20,
        scale: 0.6,
        shipSprite: 'enemy_ship_1',
        color: '#886644'
    },
    {
        name: 'Brigantine',
        baseHp: 60,
        baseDamage: 10,
        baseSpeed: 100,
        baseGold: 35,
        fireRate: 0.7,
        range: 220,
        hitRadius: 25,
        scale: 0.8,
        shipSprite: 'enemy_ship_2',
        color: '#664422'
    },
    {
        name: 'Galleon',
        baseHp: 120,
        baseDamage: 18,
        baseSpeed: 60,
        baseGold: 70,
        fireRate: 1.0,
        range: 280,
        hitRadius: 32,
        scale: 1.1,
        shipSprite: 'enemy_ship_3',
        color: '#442211'
    },
    {
        name: 'Man-o-War',
        baseHp: 200,
        baseDamage: 25,
        baseSpeed: 50,
        baseGold: 120,
        fireRate: 1.2,
        range: 320,
        hitRadius: 38,
        scale: 1.3,
        shipSprite: 'enemy_ship_4',
        color: '#331100'
    },
    {
        name: 'Ghost Ship',
        baseHp: 150,
        baseDamage: 30,
        baseSpeed: 120,
        baseGold: 180,
        fireRate: 1.5,
        range: 300,
        hitRadius: 30,
        scale: 1.0,
        shipSprite: 'enemy_ship_5',
        color: '#445566',
        isBoss: true,
        glowColor: '#66aaff'
    },
    {
        name: 'Kraken',
        baseHp: 400,
        baseDamage: 40,
        baseSpeed: 40,
        baseGold: 300,
        fireRate: 2.0,
        range: 250,
        hitRadius: 50,
        scale: 1.6,
        shipSprite: 'enemy_ship_6',
        color: '#225533',
        isBoss: true,
        glowColor: '#44ff88'
    }
];

export class Enemy {
    constructor(type, x, y, level) {
        this.type = type;
        this.x = x;
        this.y = y;
        this.level = level;
        this.angle = Math.random() * Math.PI * 2;
        this.speed = 0;

        const scaling = 1 + (level - 1) * 0.25;
        this.maxHp = Math.round(type.baseHp * scaling);
        this.hp = this.maxHp;
        this.cannonDamage = Math.round(type.baseDamage * scaling);
        this.maxSpeed = type.baseSpeed * (1 + (level - 1) * 0.1);
        this.goldReward = Math.round(type.baseGold * scaling);
        this.cannonFireRate = type.fireRate;
        this.cannonRange = type.range;
        this.hitRadius = type.hitRadius;
        this.cannonCooldown = 1 + Math.random() * 2;
        this.scale = type.scale;
        this.isBoss = type.isBoss || false;
        this.glowColor = type.glowColor || null;

        // AI state
        this.aiState = 'patrol';
        this.patrolAngle = this.angle;
        this.patrolTimer = randFloat(2, 5);
        this.aggroRange = 400 + level * 20;
        this.leashRange = 800;
        this.spawnX = x;
        this.spawnY = y;
        this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    }

    get alive() {
        return this.hp > 0;
    }

    takeDamage(amount) {
        const dmg = Math.max(1, amount);
        this.hp -= dmg;
        if (this.aiState === 'patrol') this.aiState = 'chase';
        return dmg;
    }

    update(dt, playerX, playerY) {
        const distToPlayer = dist(this.x, this.y, playerX, playerY);
        const distToSpawn = dist(this.x, this.y, this.spawnX, this.spawnY);

        switch (this.aiState) {
            case 'patrol':
                this._patrol(dt, distToPlayer);
                break;
            case 'chase':
                this._chase(dt, playerX, playerY, distToPlayer, distToSpawn);
                break;
            case 'attack':
                this._attack(dt, playerX, playerY, distToPlayer, distToSpawn);
                break;
            case 'return':
                this._returnToSpawn(dt, distToSpawn);
                break;
        }

        // Move
        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;

        // Cooldown
        if (this.cannonCooldown > 0) this.cannonCooldown -= dt;
    }

    _patrol(dt, distToPlayer) {
        this.patrolTimer -= dt;
        if (this.patrolTimer <= 0) {
            this.patrolAngle = this.angle + randFloat(-1, 1);
            this.patrolTimer = randFloat(2, 5);
        }

        const diff = angleDiff(this.angle, this.patrolAngle);
        this.angle += Math.sign(diff) * Math.min(Math.abs(diff), 1.5 * dt);
        this.speed = this.maxSpeed * 0.3;

        if (distToPlayer < this.aggroRange) {
            this.aiState = 'chase';
        }
    }

    _chase(dt, playerX, playerY, distToPlayer, distToSpawn) {
        const targetAngle = angle(this.x, this.y, playerX, playerY);
        const diff = angleDiff(this.angle, targetAngle);
        this.angle += Math.sign(diff) * Math.min(Math.abs(diff), 2.5 * dt);
        this.angle = normalizeAngle(this.angle);
        this.speed = this.maxSpeed * 0.8;

        if (distToPlayer < this.cannonRange * 0.9) {
            this.aiState = 'attack';
        }
        if (distToSpawn > this.leashRange && !this.isBoss) {
            this.aiState = 'return';
        }
        if (distToPlayer > this.aggroRange * 1.5 && !this.isBoss) {
            this.aiState = 'patrol';
        }
    }

    _attack(dt, playerX, playerY, distToPlayer, distToSpawn) {
        // Circle-strafe the player
        const targetAngle = angle(this.x, this.y, playerX, playerY);
        const strafeAngle = targetAngle + (Math.PI / 2) * this.strafeDir;

        const diff = angleDiff(this.angle, strafeAngle);
        this.angle += Math.sign(diff) * Math.min(Math.abs(diff), 2.0 * dt);
        this.angle = normalizeAngle(this.angle);

        // Maintain distance
        if (distToPlayer < this.cannonRange * 0.5) {
            this.speed = this.maxSpeed * 0.4; // Slow down if too close
        } else if (distToPlayer > this.cannonRange * 0.8) {
            this.speed = this.maxSpeed * 0.9; // Speed up to close distance
        } else {
            this.speed = this.maxSpeed * 0.6;
        }

        // Switch strafe direction occasionally
        if (Math.random() < dt * 0.3) {
            this.strafeDir *= -1;
        }

        if (distToPlayer > this.cannonRange * 1.3) {
            this.aiState = 'chase';
        }
        if (distToSpawn > this.leashRange && !this.isBoss) {
            this.aiState = 'return';
        }
    }

    _returnToSpawn(dt, distToSpawn) {
        const targetAngle = angle(this.x, this.y, this.spawnX, this.spawnY);
        const diff = angleDiff(this.angle, targetAngle);
        this.angle += Math.sign(diff) * Math.min(Math.abs(diff), 2.0 * dt);
        this.speed = this.maxSpeed * 0.7;

        if (distToSpawn < 100) {
            this.aiState = 'patrol';
            this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.1); // Heal a bit
        }
    }

    draw(ctx, camX, camY, viewW, viewH, assets, time) {
        const sx = this.x - camX + viewW / 2;
        const sy = this.y - camY + viewH / 2;

        if (sx < -80 || sx > viewW + 80 || sy < -80 || sy > viewH + 80) return;

        ctx.save();

        // Boss glow
        if (this.isBoss && this.glowColor) {
            ctx.save();
            const glowPulse = 0.5 + 0.3 * Math.sin(time * 3);
            ctx.globalAlpha = glowPulse;
            ctx.shadowColor = this.glowColor;
            ctx.shadowBlur = 25;
            ctx.beginPath();
            ctx.arc(sx, sy, this.hitRadius + 10, 0, Math.PI * 2);
            ctx.fillStyle = this.glowColor;
            ctx.fill();
            ctx.restore();
        }

        ctx.translate(sx, sy);
        ctx.rotate(this.angle + Math.PI / 2);

        const s = this.scale;
        const shipImg = assets.get(this.type.shipSprite);
        if (shipImg) {
            ctx.drawImage(shipImg, -32 * s, -40 * s, 64 * s, 80 * s);
        } else {
            this._drawProceduralShip(ctx, s);
        }

        ctx.restore();

        // HP bar
        if (this.hp < this.maxHp) {
            const barW = 40 * this.scale;
            const barH = 4;
            const bx = sx - barW / 2;
            const by = sy - this.hitRadius - 12;
            const hpRatio = this.hp / this.maxHp;

            ctx.fillStyle = '#333';
            ctx.fillRect(bx, by, barW, barH);
            ctx.fillStyle = hpRatio > 0.5 ? '#44aa22' : hpRatio > 0.25 ? '#ccaa22' : '#cc2222';
            ctx.fillRect(bx, by, barW * hpRatio, barH);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, barW, barH);
        }

        // Level indicator for higher level enemies
        if (this.level > 1) {
            ctx.font = 'bold 10px Georgia';
            ctx.fillStyle = '#ffd700';
            ctx.textAlign = 'center';
            ctx.fillText(`Lv${this.level}`, sx, sy - this.hitRadius - 16);
        }
    }

    _drawProceduralShip(ctx, s) {
        ctx.fillStyle = this.type.color;
        ctx.beginPath();
        ctx.moveTo(0, -30 * s);
        ctx.lineTo(15 * s, -5 * s);
        ctx.lineTo(16 * s, 18 * s);
        ctx.lineTo(10 * s, 28 * s);
        ctx.lineTo(-10 * s, 28 * s);
        ctx.lineTo(-16 * s, 18 * s);
        ctx.lineTo(-15 * s, -5 * s);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Sail
        ctx.fillStyle = this.isBoss ? '#444466' : '#cc3333';
        ctx.beginPath();
        ctx.moveTo(-12 * s, -10 * s);
        ctx.quadraticCurveTo(-16 * s, 5 * s, -10 * s, 12 * s);
        ctx.lineTo(10 * s, 12 * s);
        ctx.quadraticCurveTo(16 * s, 5 * s, 12 * s, -10 * s);
        ctx.closePath();
        ctx.fill();

        // Skull on boss
        if (this.isBoss) {
            ctx.fillStyle = '#fff';
            ctx.font = `${14 * s}px serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('\u2620', 0, 2 * s);
        }
    }
}

export class EnemySpawner {
    constructor() {
        this.enemies = [];
        this.spawnTimer = 0;
        this.maxEnemies = 25;
        this.bossSpawnDistance = 2000;
    }

    update(dt, playerX, playerY) {
        this.spawnTimer -= dt;

        // Remove dead enemies far from player
        for (let i = this.enemies.length - 1; i >= 0; i--) {
            const e = this.enemies[i];
            if (!e.alive) {
                this.enemies.splice(i, 1);
                continue;
            }
            // Despawn enemies very far from player
            const d = dist(e.x, e.y, playerX, playerY);
            if (d > 2500) {
                this.enemies.splice(i, 1);
            }
        }

        if (this.spawnTimer <= 0 && this.enemies.length < this.maxEnemies) {
            this._spawn(playerX, playerY);
            this.spawnTimer = 1.5 + Math.random() * 2;
        }
    }

    _spawn(playerX, playerY) {
        const distFromOrigin = dist(playerX, playerY, 200, 200);
        const level = Math.max(1, Math.floor(distFromOrigin / 600) + 1);

        // Choose enemy type based on distance/level
        let typeIdx;
        if (level <= 2) {
            typeIdx = 0; // Sloop
        } else if (level <= 4) {
            typeIdx = Math.random() < 0.6 ? 0 : 1;
        } else if (level <= 6) {
            typeIdx = Math.random() < 0.3 ? 0 : Math.random() < 0.6 ? 1 : 2;
        } else if (level <= 8) {
            typeIdx = randInt(1, 3);
        } else {
            typeIdx = randInt(1, 3);
        }

        // Boss spawn
        if (distFromOrigin > this.bossSpawnDistance && Math.random() < 0.08) {
            typeIdx = distFromOrigin > 4000 ? 5 : 4;
        }

        const type = ENEMY_TYPES[typeIdx];

        // Spawn at edge of view, ahead of player
        const spawnAngle = Math.random() * Math.PI * 2;
        const spawnDist = 600 + Math.random() * 300;
        const spawnX = playerX + Math.cos(spawnAngle) * spawnDist;
        const spawnY = playerY + Math.sin(spawnAngle) * spawnDist;

        // Don't spawn too close to origin (safe zone)
        const spawnDistFromOrigin = dist(spawnX, spawnY, 200, 200);
        if (spawnDistFromOrigin < 400) return;

        this.enemies.push(new Enemy(type, spawnX, spawnY, level));
    }

    clear() {
        this.enemies.length = 0;
    }

    draw(ctx, camX, camY, viewW, viewH, assets, time) {
        for (const enemy of this.enemies) {
            if (enemy.alive) {
                enemy.draw(ctx, camX, camY, viewW, viewH, assets, time);
            }
        }
    }

    drawOnMinimap(ctx, playerX, playerY, size) {
        const scale = 0.02;
        const halfSize = size / 2;
        for (const enemy of this.enemies) {
            if (!enemy.alive) continue;
            const ex = (enemy.x - playerX) * scale + halfSize;
            const ey = (enemy.y - playerY) * scale + halfSize;
            if (ex < 0 || ex > size || ey < 0 || ey > size) continue;

            ctx.fillStyle = enemy.isBoss ? '#ff4444' : '#cc3333';
            const dotSize = enemy.isBoss ? 3 : 2;
            ctx.beginPath();
            ctx.arc(ex, ey, dotSize, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
