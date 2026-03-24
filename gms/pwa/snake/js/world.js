/**
 * World - manages food, power-ups, and arena
 */
class World {
    constructor() {
        this.food = [];
        this.powerups = [];
        this.lastPowerupSpawn = 0;
        this._init();
    }

    _init() {
        // Spawn initial food
        for (let i = 0; i < CONFIG.FOOD_COUNT; i++) {
            this.food.push(this._createFood());
        }
    }

    _createFood() {
        const pos = Utils.randInCircle(CONFIG.WORLD_RADIUS * 0.95);
        return {
            x: pos.x,
            y: pos.y,
            radius: CONFIG.FOOD_RADIUS,
            value: CONFIG.FOOD_VALUE,
            color: Utils.hslToHex(Math.random() * 360, 70, 60),
            glow: CONFIG.FOOD_GLOW_RADIUS
        };
    }

    /** Add death pellets to the food array */
    addDeathPellets(pellets) {
        for (const p of pellets) {
            this.food.push({
                x: p.x,
                y: p.y,
                radius: p.radius,
                value: p.value,
                color: p.color,
                glow: p.radius * 2,
                isDeath: true
            });
        }
    }

    /** Add a boost trail pellet */
    addBoostPellet(x, y, color) {
        this.food.push({
            x, y,
            radius: CONFIG.FOOD_RADIUS + 1,
            value: 1,
            color: color,
            glow: CONFIG.FOOD_GLOW_RADIUS,
            isBoost: true
        });
    }

    /** Remove food at index */
    removeFood(index) {
        this.food.splice(index, 1);
    }

    /** Replenish food to maintain count */
    replenish() {
        while (this.food.length < CONFIG.FOOD_COUNT) {
            this.food.push(this._createFood());
        }
    }

    /** Spawn power-ups periodically */
    updatePowerups(now) {
        if (now - this.lastPowerupSpawn > CONFIG.POWERUP_SPAWN_INTERVAL &&
            this.powerups.length < CONFIG.POWERUP_MAX_COUNT) {
            this.lastPowerupSpawn = now;
            const types = Object.values(CONFIG.POWERUP_TYPES);
            const type = Utils.randPick(types);
            const pos = Utils.randInCircle(CONFIG.WORLD_RADIUS * 0.8);
            this.powerups.push({
                x: pos.x,
                y: pos.y,
                type: type,
                radius: CONFIG.POWERUP_RADIUS,
                spawnTime: now,
                pulsePhase: Math.random() * Math.PI * 2
            });
        }
    }

    /** Remove power-up at index */
    removePowerup(index) {
        this.powerups.splice(index, 1);
    }

    /** Check if a point is outside the boundary */
    isOutOfBounds(x, y) {
        return Utils.dist(0, 0, x, y) > CONFIG.WORLD_RADIUS;
    }

    /** Get distance to boundary from a point */
    distToBoundary(x, y) {
        return CONFIG.WORLD_RADIUS - Utils.dist(0, 0, x, y);
    }

    /** Reset world for new game */
    reset() {
        this.food = [];
        this.powerups = [];
        this.lastPowerupSpawn = 0;
        this._init();
    }
}
