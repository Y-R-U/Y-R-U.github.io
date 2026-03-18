// Player ship

import { clamp, normalizeAngle, angleDiff, lerp } from './utils.js';

export class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.angle = -Math.PI / 2; // Facing up
        this.speed = 0;

        // Base stats
        this.baseStats = {
            maxSpeed: 150,
            acceleration: 120,
            turnSpeed: 2.5,
            maxHp: 100,
            cannonDamage: 15,
            cannonRange: 250,
            cannonFireRate: 1.0, // shots per second
            cargoCapacity: 20,
            armor: 0
        };

        // Upgrade levels
        this.upgrades = {
            hull: 0,      // +20 hp per level
            cannons: 0,   // +5 damage per level
            speed: 0,     // +20 speed per level
            fireRate: 0,  // +0.2 rate per level
            range: 0,     // +40 range per level
            cargo: 0,     // +10 capacity per level
            armor: 0      // +3 armor per level
        };

        // Persistent (survives death) - must be before maxHp access
        this.persistentGold = 0;
        this.totalRuns = 0;
        this.bestDistance = 0;
        this.permanentUpgrades = {
            startGold: 0,
            startHp: 0,
            luck: 0
        };
        this._loadPersistent();

        this.hp = this.maxHp;
        this.gold = 50;
        this.totalGoldEarned = 0;
        this.cargo = {}; // item: quantity
        this.cargoCount = 0;

        // Combat
        this.cannonCooldown = 0;
        this.invulnTimer = 0;

        // Stats tracking
        this.enemiesKilled = 0;
        this.distanceTraveled = 0;
        this.portsVisited = new Set();
        this.maxDistFromHome = 0;
    }

    get maxHp() {
        return this.baseStats.maxHp + this.upgrades.hull * 20 + this.permanentUpgrades.startHp * 10;
    }

    get maxSpeed() {
        return this.baseStats.maxSpeed + this.upgrades.speed * 20;
    }

    get acceleration() {
        return this.baseStats.acceleration + this.upgrades.speed * 10;
    }

    get turnSpeed() {
        return this.baseStats.turnSpeed + this.upgrades.speed * 0.15;
    }

    get cannonDamage() {
        return this.baseStats.cannonDamage + this.upgrades.cannons * 5;
    }

    get cannonRange() {
        return this.baseStats.cannonRange + this.upgrades.range * 40;
    }

    get cannonFireRate() {
        return this.baseStats.cannonFireRate + this.upgrades.fireRate * 0.2;
    }

    get cargoCapacity() {
        return this.baseStats.cargoCapacity + this.upgrades.cargo * 10;
    }

    get armor() {
        return this.baseStats.armor + this.upgrades.armor * 3;
    }

    get distFromHome() {
        const dx = this.x - 200;
        const dy = this.y - 200;
        return Math.sqrt(dx * dx + dy * dy);
    }

    update(dt, input, world) {
        // Timers
        if (this.cannonCooldown > 0) this.cannonCooldown -= dt;
        if (this.invulnTimer > 0) this.invulnTimer -= dt;

        if (!input.moving) {
            // Decelerate
            this.speed *= 0.96;
            if (Math.abs(this.speed) < 1) this.speed = 0;
            return;
        }

        // Turn toward input direction
        const targetAngle = input.angle;
        const diff = angleDiff(this.angle, targetAngle);
        const turnAmount = this.turnSpeed * dt;

        if (Math.abs(diff) < turnAmount) {
            this.angle = targetAngle;
        } else {
            this.angle += Math.sign(diff) * turnAmount;
        }
        this.angle = normalizeAngle(this.angle);

        // Accelerate
        const targetSpeed = this.maxSpeed * input.magnitude;
        this.speed = lerp(this.speed, targetSpeed, this.acceleration * dt / this.maxSpeed);

        // Move
        const nx = this.x + Math.cos(this.angle) * this.speed * dt;
        const ny = this.y + Math.sin(this.angle) * this.speed * dt;

        // Collision with land
        if (!world.isLand(nx, ny)) {
            this.x = nx;
            this.y = ny;
        } else {
            this.speed *= 0.5;
            // Try sliding along the obstacle
            if (!world.isLand(nx, this.y)) {
                this.x = nx;
            } else if (!world.isLand(this.x, ny)) {
                this.y = ny;
            }
        }

        this.distanceTraveled += Math.abs(this.speed) * dt;
        this.maxDistFromHome = Math.max(this.maxDistFromHome, this.distFromHome);
    }

    takeDamage(amount) {
        if (this.invulnTimer > 0) return 0;
        const reduced = Math.max(1, amount - this.armor);
        this.hp -= reduced;
        this.invulnTimer = 0.15;
        return reduced;
    }

    heal(amount) {
        this.hp = Math.min(this.maxHp, this.hp + amount);
    }

    addGold(amount) {
        const bonus = 1 + this.permanentUpgrades.luck * 0.05;
        const gained = Math.round(amount * bonus);
        this.gold += gained;
        this.totalGoldEarned += gained;
        return gained;
    }

    addCargo(item, qty) {
        if (this.cargoCount + qty > this.cargoCapacity) {
            qty = this.cargoCapacity - this.cargoCount;
        }
        if (qty <= 0) return 0;
        this.cargo[item] = (this.cargo[item] || 0) + qty;
        this.cargoCount += qty;
        return qty;
    }

    removeCargo(item, qty) {
        const have = this.cargo[item] || 0;
        const removed = Math.min(have, qty);
        this.cargo[item] = have - removed;
        if (this.cargo[item] <= 0) delete this.cargo[item];
        this.cargoCount -= removed;
        return removed;
    }

    canFire() {
        return this.cannonCooldown <= 0;
    }

    fire() {
        this.cannonCooldown = 1 / this.cannonFireRate;
    }

    get alive() {
        return this.hp > 0;
    }

    // Death - save persistent data
    onDeath() {
        const savedGold = Math.floor(this.gold * 0.3); // Keep 30% gold
        this.persistentGold += savedGold;
        this.totalRuns++;
        this.bestDistance = Math.max(this.bestDistance, this.maxDistFromHome);
        this._savePersistent();
        return {
            goldKept: savedGold,
            enemiesKilled: this.enemiesKilled,
            distance: Math.round(this.maxDistFromHome),
            portsVisited: this.portsVisited.size
        };
    }

    // Start a new run
    reset() {
        this.x = 200;
        this.y = 0;
        this.angle = -Math.PI / 2;
        this.speed = 0;
        this.hp = this.maxHp;
        this.gold = 50 + this.permanentUpgrades.startGold * 25;
        this.cargo = {};
        this.cargoCount = 0;
        this.cannonCooldown = 0;
        this.invulnTimer = 2; // Brief invuln on spawn
        this.enemiesKilled = 0;
        this.distanceTraveled = 0;
        this.portsVisited = new Set();
        this.maxDistFromHome = 0;
        this.totalGoldEarned = 0;

        // Reset run upgrades
        for (const key of Object.keys(this.upgrades)) {
            this.upgrades[key] = 0;
        }
    }

    _savePersistent() {
        try {
            localStorage.setItem('pirate2d_save', JSON.stringify({
                persistentGold: this.persistentGold,
                totalRuns: this.totalRuns,
                bestDistance: this.bestDistance,
                permanentUpgrades: this.permanentUpgrades
            }));
        } catch(e) {}
    }

    _loadPersistent() {
        try {
            const data = JSON.parse(localStorage.getItem('pirate2d_save'));
            if (data) {
                this.persistentGold = data.persistentGold || 0;
                this.totalRuns = data.totalRuns || 0;
                this.bestDistance = data.bestDistance || 0;
                if (data.permanentUpgrades) {
                    Object.assign(this.permanentUpgrades, data.permanentUpgrades);
                }
            }
        } catch(e) {}
    }

    draw(ctx, camX, camY, viewW, viewH, assets, time) {
        const sx = this.x - camX + viewW / 2;
        const sy = this.y - camY + viewH / 2;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.angle + Math.PI / 2); // Sprites face up

        // Flash when hit
        if (this.invulnTimer > 0 && Math.floor(this.invulnTimer * 10) % 2) {
            ctx.globalAlpha = 0.5;
        }

        const shipImg = assets.get('player_ship');
        if (shipImg) {
            ctx.drawImage(shipImg, -32, -40, 64, 80);
        } else {
            // Procedural ship
            this._drawProceduralShip(ctx);
        }

        ctx.restore();

        // Draw cannon range indicator (subtle)
        if (this.cannonCooldown <= 0) {
            ctx.save();
            ctx.globalAlpha = 0.08;
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 8]);
            ctx.beginPath();
            ctx.arc(sx, sy, this.cannonRange, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    _drawProceduralShip(ctx) {
        // Hull
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.moveTo(0, -35);
        ctx.lineTo(18, -10);
        ctx.lineTo(20, 20);
        ctx.lineTo(12, 32);
        ctx.lineTo(-12, 32);
        ctx.lineTo(-20, 20);
        ctx.lineTo(-18, -10);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#5C2E00';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Sail
        ctx.fillStyle = '#f5f0e0';
        ctx.beginPath();
        ctx.moveTo(-15, -15);
        ctx.quadraticCurveTo(-20, 5, -12, 15);
        ctx.lineTo(12, 15);
        ctx.quadraticCurveTo(20, 5, 15, -15);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Mast
        ctx.strokeStyle = '#5C2E00';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(0, -20);
        ctx.lineTo(0, 20);
        ctx.stroke();
    }
}
