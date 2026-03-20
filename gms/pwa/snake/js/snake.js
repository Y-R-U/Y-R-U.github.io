/**
 * Snake class - used for both player and AI snakes
 */
class Snake {
    constructor(options = {}) {
        this.id = Utils.uid();
        this.name = options.name || 'Snake';
        this.isPlayer = options.isPlayer || false;

        // Position & movement
        const spawn = options.position || Utils.randInCircle(CONFIG.WORLD_RADIUS * 0.7);
        this.x = spawn.x;
        this.y = spawn.y;
        // Use ?? to allow angle 0 (falsy but valid)
        this.angle = options.angle ?? (Math.random() * Math.PI * 2);
        this.targetAngle = this.angle;
        this.speed = CONFIG.SNAKE_BASE_SPEED;
        this.baseSpeed = CONFIG.SNAKE_BASE_SPEED + (options.speedBonus || 0);

        // Body
        const startLen = (options.startLength || CONFIG.SNAKE_START_LENGTH);
        this.segments = [];
        this.path = [];
        this._initBody(startLen);

        // State
        this.alive = true;
        this.mass = startLen;
        this.kills = 0;
        this.boosting = false;
        this.boostTrailTimer = 0;
        this.boundaryDeath = false; // Flag for main loop to detect boundary deaths

        // Skin
        this.skinId = options.skinId || 'default';
        this.skin = CONFIG.SKINS.find(s => s.id === this.skinId) || CONFIG.SKINS[0];

        // Power-ups active
        this.powerups = {}; // { type: expiresAt }

        // Visual
        this.eyeAngle = this.angle;

        // Upgrade values
        this.magnetRange = options.magnetRange || 0;
        this.boostCostReduction = options.boostCostReduction || 0;
    }

    _initBody(length) {
        this.segments = [];
        this.path = [];
        for (let i = 0; i < length * 3; i++) {
            const px = this.x - Math.cos(this.angle) * i * (CONFIG.SNAKE_SEGMENT_SPACING / 3);
            const py = this.y - Math.sin(this.angle) * i * (CONFIG.SNAKE_SEGMENT_SPACING / 3);
            this.path.push({ x: px, y: py });
        }
        for (let i = 0; i < length; i++) {
            const idx = i * 3;
            this.segments.push({
                x: this.path[idx].x,
                y: this.path[idx].y
            });
        }
    }

    /** Get the effective radius at a given segment index */
    getRadiusAt(index) {
        // Grow with mass for all segments including head
        const massFactor = Math.min(1 + this.mass / 500, 2);
        if (index === 0) return CONFIG.SNAKE_HEAD_RADIUS * massFactor;
        // Slight taper at tail
        const tailFactor = index > this.segments.length - 4
            ? 0.6 + 0.4 * ((this.segments.length - index) / 4)
            : 1;
        return CONFIG.SNAKE_BODY_RADIUS * tailFactor * massFactor;
    }

    /** Get color for a specific segment */
    getColorAt(index) {
        const colors = this.skin.colors;
        if (this.hasPowerup('shield')) {
            return index % 2 === 0 ? '#44aaff' : colors[index % colors.length];
        }
        if (this.hasPowerup('speed')) {
            return index % 3 === 0 ? '#ffff44' : colors[index % colors.length];
        }
        return colors[index % colors.length];
    }

    /** Update snake position and body (dt in milliseconds) */
    update(dt) {
        if (!this.alive) return;

        // Delta-time factor normalized to 60fps (16.67ms per frame)
        const dtFactor = dt / 16.67;

        // Smooth turn toward target angle (delta-time dependent)
        const diff = Utils.angleDiff(this.angle, this.targetAngle);
        const maxTurn = (CONFIG.SNAKE_MAX_TURN_RATE / 60) * dtFactor; // Convert per-second to per-frame
        if (Math.abs(diff) > 0.001) {
            this.angle += Utils.clamp(diff, -maxTurn, maxTurn);
        }
        this.eyeAngle = Utils.lerp(this.eyeAngle, this.angle, 0.15 * dtFactor);

        // Speed
        this.speed = this.baseSpeed;
        if (this.boosting && this.segments.length > CONFIG.SNAKE_MIN_LENGTH) {
            this.speed = CONFIG.SNAKE_BOOST_SPEED;
        } else {
            this.boosting = false;
        }
        if (this.hasPowerup('speed')) {
            this.speed = CONFIG.SNAKE_BOOST_SPEED;
        }

        // Move head (delta-time dependent)
        this.x += Math.cos(this.angle) * this.speed * dtFactor;
        this.y += Math.sin(this.angle) * this.speed * dtFactor;

        // Add to path
        this.path.unshift({ x: this.x, y: this.y });

        // Position segments along path
        const spacing = CONFIG.SNAKE_SEGMENT_SPACING;
        let pathDist = 0;
        let pathIdx = 0;
        this.segments[0].x = this.x;
        this.segments[0].y = this.y;

        for (let i = 1; i < this.segments.length; i++) {
            const targetDist = i * spacing;
            while (pathIdx < this.path.length - 1 && pathDist < targetDist) {
                pathIdx++;
                const dx = this.path[pathIdx].x - this.path[pathIdx - 1].x;
                const dy = this.path[pathIdx].y - this.path[pathIdx - 1].y;
                pathDist += Math.sqrt(dx * dx + dy * dy);
            }
            if (pathIdx < this.path.length) {
                this.segments[i].x = this.path[pathIdx].x;
                this.segments[i].y = this.path[pathIdx].y;
            }
        }

        // Trim excess path
        const maxPathLen = Math.max(this.segments.length * 4, 100);
        if (this.path.length > maxPathLen) {
            this.path.length = maxPathLen;
        }

        // Boost mass loss (with boost efficiency upgrade applied)
        if (this.boosting && !this.hasPowerup('speed')) {
            const effectiveInterval = CONFIG.SNAKE_BOOST_TRAIL_INTERVAL / Math.max(0.3, 1 - this.boostCostReduction);
            this.boostTrailTimer += dt;
            if (this.boostTrailTimer >= effectiveInterval) {
                this.boostTrailTimer -= effectiveInterval;
                this._shrink();
            }
        }

        // Expire powerups
        const now = performance.now();
        for (const type in this.powerups) {
            if (now >= this.powerups[type]) {
                delete this.powerups[type];
            }
        }

        // Boundary check - flag for main loop instead of calling die() directly
        const distFromCenter = Utils.dist(0, 0, this.x, this.y);
        if (distFromCenter > CONFIG.WORLD_RADIUS) {
            this.boundaryDeath = true;
        }
    }

    /** Grow the snake by adding segments */
    grow(amount) {
        const multiplier = this.hasPowerup('double') ? 2 : 1;
        const toAdd = Math.ceil(amount * multiplier);
        for (let i = 0; i < toAdd; i++) {
            const last = this.segments[this.segments.length - 1];
            this.segments.push({ x: last.x, y: last.y });
        }
        this.mass += toAdd;
    }

    /** Remove tail segment and return its position for boost pellet */
    _shrink() {
        if (this.segments.length > CONFIG.SNAKE_MIN_LENGTH) {
            const removed = this.segments.pop();
            this.mass = Math.max(this.mass - 1, CONFIG.SNAKE_MIN_LENGTH);
            return removed;
        }
        return null;
    }

    /** Get boost trail pellet position from current tail */
    getBoostPellet() {
        if (this.boosting && !this.hasPowerup('speed') && this.segments.length > CONFIG.SNAKE_MIN_LENGTH) {
            const tail = this.segments[this.segments.length - 1];
            return { x: tail.x, y: tail.y };
        }
        return null;
    }

    /** Apply a power-up */
    applyPowerup(type) {
        const config = CONFIG.POWERUP_TYPES[type.toUpperCase()];
        if (config) {
            this.powerups[config.id] = performance.now() + config.duration;
        }
    }

    /** Check if snake has a specific power-up active */
    hasPowerup(type) {
        return this.powerups[type] && performance.now() < this.powerups[type];
    }

    /** Die - returns array of death pellet positions */
    die(killer) {
        if (!this.alive) return [];
        this.alive = false;

        if (killer && killer.alive) {
            killer.kills++;
        }

        // Generate death pellets from body
        const pellets = [];
        for (let i = 0; i < this.segments.length; i += 2) {
            pellets.push({
                x: this.segments[i].x + Utils.rand(-10, 10),
                y: this.segments[i].y + Utils.rand(-10, 10),
                color: this.getColorAt(i),
                radius: CONFIG.DEATH_PELLET_RADIUS,
                value: CONFIG.DEATH_PELLET_VALUE
            });
        }
        return pellets;
    }

    /** Set target direction (for input) */
    setTarget(angle) {
        this.targetAngle = angle;
    }

    /** Set boosting state */
    setBoost(active) {
        this.boosting = active && this.segments.length > CONFIG.SNAKE_MIN_LENGTH;
    }

    /** Get effective magnet range */
    getEffectiveMagnetRange() {
        let range = this.magnetRange;
        if (this.hasPowerup('magnet')) {
            range += 150;
        }
        return range;
    }

    /** Get bounding box for broad-phase collision */
    getBounds() {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const seg of this.segments) {
            if (seg.x < minX) minX = seg.x;
            if (seg.y < minY) minY = seg.y;
            if (seg.x > maxX) maxX = seg.x;
            if (seg.y > maxY) maxY = seg.y;
        }
        const r = this.getRadiusAt(0);
        return { minX: minX - r, minY: minY - r, maxX: maxX + r, maxY: maxY + r };
    }
}
