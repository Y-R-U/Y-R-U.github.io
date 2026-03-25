// Player ship

import { clamp, normalizeAngle, angleDiff, lerp } from './utils.js';

export const NAME_PREFIXES = [
    'The Dread Pirate',
    'Captain',
    'Admiral',
    'Scallywag',
    'Buccaneer',
    'Commodore'
];

export class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.angle = -Math.PI / 2; // Facing up
        this.speed = 0;

        // Player identity
        this.playerName = '';
        this.namePrefix = '';
        this.fullName = '';

        // Base stats
        this.baseStats = {
            maxSpeed: 150,
            acceleration: 120,
            turnSpeed: 2.5,
            maxHp: 100,
            cannonDamage: 15,
            cannonRange: 250,
            cannonFireRate: 1.0,
            cargoCapacity: 20,
            armor: 0
        };

        // Upgrade levels
        this.upgrades = {
            hull: 0,
            cannons: 0,
            speed: 0,
            fireRate: 0,
            range: 0,
            cargo: 0,
            armor: 0,
            repairSpeed: 0
        };

        // Persistent (survives death) - must be before maxHp access
        this.persistentGold = 0;
        this.totalRuns = 0;
        this.bestDistance = 0;
        this.hasRepairSkill = false;
        this.currentRun = 1; // Which story run (1, 2, or 3)
        this.completedRuns = []; // Array of completed run numbers
        this.bossDefeated = false; // Whether current run's boss is defeated
        this.extraCannons = 0; // Extra cannons purchased (persistent)
        this.permanentUpgrades = {
            startGold: 0,
            startHp: 0,
            luck: 0,
            repairUnlock: 0,
            permDamage: 0,
            permHealth: 0,
            permSpeed: 0,
            permFireRate: 0,
            permCargo: 0,
            permArmor: 0,
            permRepairSpeed: 0
        };
        this._loadPersistent();

        this.hp = this.maxHp;
        this.gold = 50;
        this.totalGoldEarned = 0;
        this.cargo = {};
        this.cargoCount = 0;
        this.buriedGold = 0;
        this.bossesDefeatedThisRun = 0;

        // Combat
        this.cannonCooldown = 0;
        this.invulnTimer = 0;

        // Repair
        this.repairTimer = 0;

        // Stats tracking
        this.enemiesKilled = 0;
        this.distanceTraveled = 0;
        this.portsVisited = new Set();
        this.maxDistFromHome = 0;

        // Fire effect timer for damage visuals
        this.fireTimer = 0;
    }

    get maxHp() {
        return this.baseStats.maxHp
            + this.upgrades.hull * 20
            + (this.permanentUpgrades.startHp || 0) * 10
            + (this.permanentUpgrades.permHealth || 0) * 2;
    }

    get maxSpeed() {
        return this.baseStats.maxSpeed
            + this.upgrades.speed * 20
            + (this.permanentUpgrades.permSpeed || 0) * 5;
    }

    get acceleration() {
        return this.baseStats.acceleration + this.upgrades.speed * 10;
    }

    get turnSpeed() {
        return this.baseStats.turnSpeed + this.upgrades.speed * 0.15;
    }

    get cannonDamage() {
        return this.baseStats.cannonDamage
            + this.upgrades.cannons * 5
            + (this.permanentUpgrades.permDamage || 0) * 1;
    }

    get cannonRange() {
        return this.baseStats.cannonRange + this.upgrades.range * 40;
    }

    get cannonFireRate() {
        return this.baseStats.cannonFireRate
            + this.upgrades.fireRate * 0.2
            + (this.permanentUpgrades.permFireRate || 0) * 0.05;
    }

    get cargoCapacity() {
        return this.baseStats.cargoCapacity
            + this.upgrades.cargo * 10
            + (this.permanentUpgrades.permCargo || 0) * 2;
    }

    get armor() {
        return this.baseStats.armor
            + this.upgrades.armor * 3
            + (this.permanentUpgrades.permArmor || 0) * 1;
    }

    get cannonCount() {
        return 1 + (this.extraCannons || 0);
    }

    get repairRate() {
        if (!this.hasRepairSkill) return 0;
        const base = 1;
        const runBonus = (this.upgrades.repairSpeed || 0) * 0.5;
        const permBonus = (this.permanentUpgrades.permRepairSpeed || 0) * 0.3;
        return base + runBonus + permBonus;
    }

    get distFromHome() {
        const dx = this.x - 200;
        const dy = this.y - 200;
        return Math.sqrt(dx * dx + dy * dy);
    }

    get hpRatio() {
        return this.hp / this.maxHp;
    }

    setName(prefix, name) {
        this.namePrefix = prefix;
        this.playerName = name;
        this.fullName = `${prefix} ${name}`;
        this._savePersistent();
    }

    // Complete current run's boss
    onBossDefeated() {
        this.bossDefeated = true;
        this.bossesDefeatedThisRun++;
    }

    // Finish the current run - advance to next
    finishRun() {
        if (!this.completedRuns.includes(this.currentRun)) {
            this.completedRuns.push(this.currentRun);
        }
        if (this.currentRun < 3) {
            this.currentRun++;
        }
        this.bossDefeated = false;
        this._savePersistent();
    }

    update(dt, input, world) {
        // Timers
        if (this.cannonCooldown > 0) this.cannonCooldown -= dt;
        if (this.invulnTimer > 0) this.invulnTimer -= dt;

        // Fire effect timer
        if (this.hpRatio < 0.75) {
            this.fireTimer -= dt;
        }

        // Auto-repair
        if (this.hasRepairSkill && this.hp < this.maxHp && this.repairRate > 0) {
            this.repairTimer += dt;
            if (this.repairTimer >= 1.0) {
                this.repairTimer -= 1.0;
                const healAmt = this.repairRate;
                this.hp = Math.min(this.maxHp, this.hp + healAmt);
            }
        }

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
        const bonus = 1 + (this.permanentUpgrades.luck || 0) * 0.05;
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

    buryTreasure() {
        if (this.gold < 10) return { success: false, reason: 'Not enough gold to bury!' };
        const halfGold = Math.floor(this.gold * 0.5);
        const piratesCut = Math.floor(halfGold * (0.15 + Math.random() * 0.1));
        const buried = halfGold - piratesCut;
        this.gold -= halfGold;
        this.buriedGold += buried;
        return { success: true, sent: halfGold, piratesCut, buried };
    }

    onDeath() {
        const savedFromShip = Math.floor(this.gold * 0.3);
        const totalSaved = savedFromShip + this.buriedGold;
        this.persistentGold += totalSaved;
        this.totalRuns++;
        this.bestDistance = Math.max(this.bestDistance, this.maxDistFromHome);
        this.bossDefeated = false;
        this._savePersistent();
        try { localStorage.removeItem('pirate2d_state'); } catch(e) {}
        return {
            goldKept: savedFromShip,
            buriedGold: this.buriedGold,
            totalSaved,
            enemiesKilled: this.enemiesKilled,
            distance: Math.round(this.maxDistFromHome),
            portsVisited: this.portsVisited.size
        };
    }

    reset() {
        this.x = 200;
        this.y = 0;
        this.angle = -Math.PI / 2;
        this.speed = 0;
        this.baseStats.maxHp = 100; // Reset in case debug modified it
        this.hp = this.maxHp;
        this.gold = 50 + (this.permanentUpgrades.startGold || 0) * 25;
        this.cargo = {};
        this.cargoCount = 0;
        this.buriedGold = 0;
        this.cannonCooldown = 0;
        this.invulnTimer = 2;
        this.enemiesKilled = 0;
        this.distanceTraveled = 0;
        this.portsVisited = new Set();
        this.maxDistFromHome = 0;
        this.totalGoldEarned = 0;
        this.repairTimer = 0;
        this.bossDefeated = false;
        this.bossesDefeatedThisRun = 0;

        for (const key of Object.keys(this.upgrades)) {
            this.upgrades[key] = 0;
        }

        try { localStorage.removeItem('pirate2d_state'); } catch(e) {}
    }

    _savePersistent() {
        try {
            localStorage.setItem('pirate2d_save', JSON.stringify({
                persistentGold: this.persistentGold,
                totalRuns: this.totalRuns,
                bestDistance: this.bestDistance,
                permanentUpgrades: this.permanentUpgrades,
                hasRepairSkill: this.hasRepairSkill,
                currentRun: this.currentRun,
                completedRuns: this.completedRuns,
                playerName: this.playerName,
                namePrefix: this.namePrefix,
                extraCannons: this.extraCannons
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
                this.hasRepairSkill = data.hasRepairSkill || false;
                this.currentRun = data.currentRun || 1;
                this.completedRuns = data.completedRuns || [];
                this.extraCannons = data.extraCannons || 0;
                this.playerName = data.playerName || '';
                this.namePrefix = data.namePrefix || '';
                if (this.playerName) {
                    this.fullName = `${this.namePrefix} ${this.playerName}`;
                }
                if (data.permanentUpgrades) {
                    Object.assign(this.permanentUpgrades, data.permanentUpgrades);
                }
                if (this.permanentUpgrades.repairUnlock > 0) {
                    this.hasRepairSkill = true;
                }
            }
        } catch(e) {}
    }

    serializeState() {
        return {
            x: this.x, y: this.y, angle: this.angle, speed: this.speed,
            hp: this.hp, gold: this.gold, buriedGold: this.buriedGold,
            cargo: { ...this.cargo }, cargoCount: this.cargoCount,
            upgrades: { ...this.upgrades },
            enemiesKilled: this.enemiesKilled,
            distanceTraveled: this.distanceTraveled,
            portsVisited: [...this.portsVisited],
            maxDistFromHome: this.maxDistFromHome,
            totalGoldEarned: this.totalGoldEarned,
            cannonCooldown: this.cannonCooldown,
            invulnTimer: this.invulnTimer,
            repairTimer: this.repairTimer,
            bossDefeated: this.bossDefeated,
            bossesDefeatedThisRun: this.bossesDefeatedThisRun,
            baseMaxHp: this.baseStats.maxHp
        };
    }

    deserializeState(data) {
        this.x = data.x; this.y = data.y;
        this.angle = data.angle; this.speed = data.speed;
        this.hp = data.hp; this.gold = data.gold; this.buriedGold = data.buriedGold || 0;
        this.cargo = data.cargo || {}; this.cargoCount = data.cargoCount || 0;
        this.upgrades = { hull: 0, cannons: 0, speed: 0, fireRate: 0, range: 0, cargo: 0, armor: 0, repairSpeed: 0, ...data.upgrades };
        this.enemiesKilled = data.enemiesKilled || 0;
        this.distanceTraveled = data.distanceTraveled || 0;
        this.portsVisited = new Set(data.portsVisited || []);
        this.maxDistFromHome = data.maxDistFromHome || 0;
        this.totalGoldEarned = data.totalGoldEarned || 0;
        this.cannonCooldown = data.cannonCooldown || 0;
        this.invulnTimer = data.invulnTimer || 0;
        this.repairTimer = data.repairTimer || 0;
        this.bossDefeated = data.bossDefeated || false;
        this.bossesDefeatedThisRun = data.bossesDefeatedThisRun || 0;
        if (data.baseMaxHp) this.baseStats.maxHp = data.baseMaxHp;
    }

    draw(ctx, camX, camY, viewW, viewH, assets, time) {
        const sx = this.x - camX + viewW / 2;
        const sy = this.y - camY + viewH / 2;

        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.angle + Math.PI / 2);

        // Flash when hit
        if (this.invulnTimer > 0 && Math.floor(this.invulnTimer * 10) % 2) {
            ctx.globalAlpha = 0.5;
        }

        // Choose sprite based on HP
        let spriteKey = 'player_ship';
        if (this.hpRatio < 0.4) {
            spriteKey = 'player_ship_heavy_dmg';
        } else if (this.hpRatio < 0.75) {
            spriteKey = 'player_ship_dmg';
        }

        const shipImg = assets.get(spriteKey);
        if (shipImg) {
            ctx.drawImage(shipImg, -32, -40, 64, 80);
        } else {
            // Fall back to normal ship or procedural
            const fallback = assets.get('player_ship');
            if (fallback) {
                ctx.drawImage(fallback, -32, -40, 64, 80);
            } else {
                this._drawProceduralShip(ctx);
            }
        }

        ctx.restore();

        // Cannon range indicator (subtle)
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
