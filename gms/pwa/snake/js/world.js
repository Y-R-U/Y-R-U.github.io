/**
 * World - manages food, power-ups, and arena
 *
 * Food removal is swap-with-last, not splice: at high mass a snake eats dozens
 * of pellets a frame and the array runs into the thousands, so an O(n) memmove
 * per pellet showed up in profiles. Order is meaningless here, so swap-pop is
 * free. Callers must remove indices in DESCENDING order for it to be safe.
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
            glow: CONFIG.FOOD_GLOW_RADIUS,
            owner: null,
            armAt: 0
        };
    }

    /** Add death pellets to the food array */
    addDeathPellets(pellets) {
        for (const p of pellets) {
            if (this.food.length >= CONFIG.FOOD_MAX) break;
            this.food.push({
                x: p.x,
                y: p.y,
                radius: p.radius,
                value: p.value,
                color: p.color,
                glow: p.radius * 2,
                isDeath: true,
                owner: null,
                armAt: 0
            });
        }
    }

    /**
     * Add a boost trail pellet. Tagged with its owner and a short arming delay
     * so a snake cannot turn on the spot and eat its own trail back.
     */
    addBoostPellet(x, y, color, value, ownerId, now) {
        if (this.food.length >= CONFIG.FOOD_MAX) return;
        // Take the value as given — the snake has already decided how much mass
        // this pellet carries, and rounding it up here would mint mass.
        const v = value > 0 ? value : CONFIG.FOOD_VALUE;
        this.food.push({
            x, y,
            radius: CONFIG.FOOD_RADIUS + Utils.clamp(Math.sqrt(v) * 0.6, 1, 6),
            value: v,
            color: color,
            glow: CONFIG.FOOD_GLOW_RADIUS,
            isBoost: true,
            owner: ownerId || null,
            armAt: (now || performance.now()) + CONFIG.OWN_PELLET_ARM_MS
        });
    }

    /**
     * Remove food at index by swapping in the last element.
     * Safe only when called with descending indices within one frame.
     */
    removeFood(index) {
        const last = this.food.length - 1;
        if (index < 0 || index > last) return;
        if (index !== last) this.food[index] = this.food[last];
        this.food.pop();
    }

    /** Replenish ambient food to maintain count */
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
        const last = this.powerups.length - 1;
        if (index < 0 || index > last) return;
        if (index !== last) this.powerups[index] = this.powerups[last];
        this.powerups.pop();
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
