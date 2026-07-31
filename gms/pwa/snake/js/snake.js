/**
 * Snake class - used for both player and AI snakes
 *
 * Body representation
 * -------------------
 * `mass` is the score. Everything visible about the body is *derived* from it:
 *
 *   radiusFactor = 1 + sqrt(mass) / SNAKE_RADIUS_MASS_DIV   (capped)
 *   bodyRadius   = SNAKE_BODY_RADIUS * radiusFactor
 *   spacing      = bodyRadius * SEGMENT_SPACING_RATIO
 *   segCount     = BODY_LENGTH_BASE + BODY_LENGTH_SCALE * sqrt(mass)   (capped)
 *
 * so you grow mostly thicker rather than endlessly longer. That is what makes a
 * 10,000-mass snake affordable: 206 segments instead of 10,000.
 *
 * The travelled path is a distance-gated sample list held in flat Float32Arrays
 * with a cumulative arc-length channel, appended at the end and compacted
 * occasionally. Segment positions are solved in one backwards sweep per frame,
 * writing into preallocated Float32Arrays. Nothing here allocates per frame.
 *
 * The previous implementation did `path.unshift({x, y})` — an O(path) memmove
 * plus an object allocation every frame per snake, against a 40,000-entry array
 * at 10k mass. That, and inserting all 10,000 segments into a string-keyed
 * spatial hash, is where the phone was going.
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

        // Bought speed, in upgrade levels. Only SPEED_START_LEVEL_CAP of them
        // apply at level 1; the rest are released one per level-up.
        this.speedLevels = options.speedLevels || 0;
        this.speedPerLevel = options.speedPerLevel || 0;
        this.bonusSpeed = options.bonusSpeed || 0;           // flat, for named rivals
        this.levelSpeed = !!options.levelSpeed;              // per-level step: the player's
        this.boostTimeBonus = options.boostTimeBonus || 0;   // ms added to every power-up
        this.level = 1;
        this.baseSpeed = CONFIG.SNAKE_BASE_SPEED;

        // State
        this.alive = true;
        this.mass = Math.max(options.startLength || CONFIG.SNAKE_START_LENGTH, CONFIG.SNAKE_MIN_MASS);
        this.kills = 0;
        this.boosting = false;
        this.boostTrailTimer = 0;
        this.boostMassPending = 0;   // mass burnt by boost, waiting to be dropped as a pellet
        this.boundaryDeath = false;  // Flag for main loop to detect boundary deaths

        // Derived size (recomputed whenever mass changes)
        this.radiusFactor = 1;
        this.bodyRadius = CONFIG.SNAKE_BODY_RADIUS;
        this.headRadius = CONFIG.SNAKE_HEAD_RADIUS;
        this.spacing = CONFIG.SNAKE_BODY_RADIUS * CONFIG.SEGMENT_SPACING_RATIO;
        this.turnRate = CONFIG.SNAKE_MAX_TURN_RATE;
        this.segCount = 1;

        // Body storage — flat, preallocated, never reallocated per frame
        this.segX = new Float32Array(64);
        this.segY = new Float32Array(64);
        this.pathX = new Float32Array(512);
        this.pathY = new Float32Array(512);
        this.pathS = new Float32Array(512);   // cumulative arc length
        this.pathLen = 0;

        // Skin
        this.skinId = options.skinId || 'default';
        this.skin = CONFIG.SKINS.find(s => s.id === this.skinId) || CONFIG.SKINS[0];

        // Power-ups active
        this.powerups = {}; // { type: expiresAt }
        this.shieldGraceUntil = 0;

        // Visual
        this.eyeAngle = this.angle;

        // Upgrade values
        this.magnetRange = options.magnetRange || 0;
        this.boostCostReduction = options.boostCostReduction || 0;

        this._recomputeSize();
        this._initBody();
    }

    // ======================== SIZE CURVE ========================

    /** Recompute everything derived from mass. Cheap; called on any mass change. */
    _recomputeSize() {
        const m = Math.max(this.mass, CONFIG.SNAKE_MIN_MASS);
        this.radiusFactor = Math.min(
            1 + Math.sqrt(m) / CONFIG.SNAKE_RADIUS_MASS_DIV,
            CONFIG.SNAKE_RADIUS_MAX_FACTOR
        );
        this.bodyRadius = CONFIG.SNAKE_BODY_RADIUS * this.radiusFactor;
        this.headRadius = this.bodyRadius * CONFIG.SNAKE_HEAD_RADIUS_BONUS;
        this.spacing = this.bodyRadius * CONFIG.SEGMENT_SPACING_RATIO;

        // Bigger snakes turn wider, so small ones can still out-manoeuvre them.
        const penalty = 1 - CONFIG.TURN_SIZE_PENALTY * (this.radiusFactor - 1);
        this.turnRate = CONFIG.SNAKE_MAX_TURN_RATE *
            Utils.clamp(penalty, CONFIG.TURN_RATE_MIN_MULT, 1);

        const count = Math.min(
            Math.round(CONFIG.BODY_LENGTH_BASE + CONFIG.BODY_LENGTH_SCALE * Math.sqrt(m)),
            CONFIG.BODY_LENGTH_MAX
        );
        this.segCount = Math.max(count, 2);
        if (this.segX.length < this.segCount) {
            this.segX = new Float32Array(this.segCount + 32);
            this.segY = new Float32Array(this.segCount + 32);
        }

        const levels = CONFIG.LEVELS;
        let lvl = 1;
        for (let i = levels.length - 1; i >= 0; i--) {
            if (m >= levels[i].mass) { lvl = i + 1; break; }
        }
        this.level = lvl;
        this._recomputeSpeed();
    }

    /**
     * Speed. Levels and bought upgrades belong to the player — an upgrade that
     * quietly speeds up all fifteen bots buys a harder game and no advantage.
     * Ordinary bots stay at base speed; regulars get a share via bonusSpeed.
     */
    _recomputeSpeed() {
        const released = Math.min(
            this.speedLevels,
            CONFIG.SPEED_START_LEVEL_CAP + (this.level - 1)
        );
        const fromLevels = this.levelSpeed ? (this.level - 1) * CONFIG.LEVEL_SPEED_STEP : 0;
        this.baseSpeed = Math.min(
            CONFIG.SNAKE_BASE_SPEED + released * this.speedPerLevel + fromLevels + this.bonusSpeed,
            CONFIG.SNAKE_MAX_SPEED
        );
    }

    /** Camera zoom this snake's level asks for. */
    get levelZoom() {
        const row = CONFIG.LEVELS[Math.min(this.level, CONFIG.LEVELS.length) - 1];
        return row ? row.zoom : CONFIG.CAMERA_ZOOM_MAX;
    }

    /** Arc length of the whole body, in world pixels. */
    get bodyDistance() {
        return (this.segCount - 1) * this.spacing;
    }

    _initBody() {
        // Seed the path with a straight tail behind the head so the body exists on
        // frame one rather than piling up at the spawn point.
        this.pathLen = 0;
        const need = this.bodyDistance + this.spacing * 2;
        const step = CONFIG.PATH_SAMPLE_DIST;
        const samples = Math.ceil(need / step) + 2;
        this._ensurePath(samples);
        // Oldest sample first: walk backwards from the head, then fill forwards.
        for (let i = samples - 1; i >= 0; i--) {
            const d = i * step;
            const idx = samples - 1 - i;
            this.pathX[idx] = this.x - Math.cos(this.angle) * d;
            this.pathY[idx] = this.y - Math.sin(this.angle) * d;
            this.pathS[idx] = idx * step;
        }
        this.pathLen = samples;
        this._solveSegments();
    }

    _ensurePath(capacity) {
        if (this.pathX.length >= capacity) return;
        const size = Math.max(capacity, this.pathX.length * 2);
        const nx = new Float32Array(size), ny = new Float32Array(size), ns = new Float32Array(size);
        nx.set(this.pathX.subarray(0, this.pathLen));
        ny.set(this.pathY.subarray(0, this.pathLen));
        ns.set(this.pathS.subarray(0, this.pathLen));
        this.pathX = nx; this.pathY = ny; this.pathS = ns;
    }

    /** Record the head position, but only every PATH_SAMPLE_DIST pixels travelled. */
    _appendPath() {
        const n = this.pathLen;
        if (n > 0) {
            const dx = this.x - this.pathX[n - 1];
            const dy = this.y - this.pathY[n - 1];
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < CONFIG.PATH_SAMPLE_DIST) return;
            this._ensurePath(n + 1);
            this.pathX[n] = this.x;
            this.pathY[n] = this.y;
            this.pathS[n] = this.pathS[n - 1] + d;
            this.pathLen = n + 1;
        } else {
            this._ensurePath(1);
            this.pathX[0] = this.x;
            this.pathY[0] = this.y;
            this.pathS[0] = 0;
            this.pathLen = 1;
        }
        this._trimPath();
    }

    /**
     * Bound the path buffer. Capacity is kept at roughly twice what the tail
     * needs, and we only slide samples down to the front once the buffer is
     * three-quarters full — so the memmove costs O(kept) once every ~kept
     * appends, i.e. amortised constant. Appending itself always has room
     * because _appendPath grows the buffer if it must.
     */
    _trimPath() {
        const n = this.pathLen;
        const cap = this.pathX.length;
        if (n < 8) return;

        const need = Math.ceil(
            (this.bodyDistance + this.spacing * 2) / CONFIG.PATH_SAMPLE_DIST
        ) + 8;
        if (cap < need * 2) { this._ensurePath(need * 2); return; }
        if (n < cap * 0.75) return;

        // Binary search for the oldest sample the tail still needs.
        const keepFrom = this.pathS[n - 1] - this.bodyDistance - this.spacing * 2;
        let lo = 0, hi = n - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (this.pathS[mid] < keepFrom) lo = mid + 1; else hi = mid;
        }
        const drop = Math.max(lo - 1, 0);
        if (drop === 0) return;

        this.pathX.copyWithin(0, drop, n);
        this.pathY.copyWithin(0, drop, n);
        this.pathS.copyWithin(0, drop, n);
        this.pathLen = n - drop;
    }

    /**
     * Solve every segment position from the path in one backwards sweep.
     * Segment k sits k*spacing of arc length behind the head.
     */
    _solveSegments() {
        const n = this.segCount;
        this.segX[0] = this.x;
        this.segY[0] = this.y;
        if (n < 2) return;

        const pl = this.pathLen;
        if (pl === 0) {
            for (let k = 1; k < n; k++) { this.segX[k] = this.x; this.segY[k] = this.y; }
            return;
        }

        const lastDx = this.x - this.pathX[pl - 1];
        const lastDy = this.y - this.pathY[pl - 1];
        const headS = this.pathS[pl - 1] + Math.sqrt(lastDx * lastDx + lastDy * lastDy);
        const sp = this.spacing;
        const oldestS = this.pathS[0];

        let idx = pl - 1;
        for (let k = 1; k < n; k++) {
            const targetS = headS - k * sp;
            if (targetS <= oldestS) {
                // Tail runs past everything we remember — pile up at the oldest point.
                const ox = this.pathX[0], oy = this.pathY[0];
                for (; k < n; k++) { this.segX[k] = ox; this.segY[k] = oy; }
                return;
            }
            while (idx > 0 && this.pathS[idx] > targetS) idx--;
            const s0 = this.pathS[idx];
            let s1, x1, y1;
            if (idx + 1 < pl) {
                s1 = this.pathS[idx + 1]; x1 = this.pathX[idx + 1]; y1 = this.pathY[idx + 1];
            } else {
                s1 = headS; x1 = this.x; y1 = this.y;
            }
            const span = s1 - s0;
            const t = span > 1e-6 ? (targetS - s0) / span : 0;
            const x0 = this.pathX[idx], y0 = this.pathY[idx];
            this.segX[k] = x0 + (x1 - x0) * t;
            this.segY[k] = y0 + (y1 - y0) * t;
        }
    }

    // ======================== QUERIES ========================

    /** Get the effective radius at a given segment index */
    getRadiusAt(index) {
        if (index === 0) return this.headRadius;
        // Slight taper over the last few segments
        const fromTail = this.segCount - index;
        if (fromTail < 4) return this.bodyRadius * (0.55 + 0.45 * (fromTail / 4));
        return this.bodyRadius;
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

    // ======================== SIMULATION ========================

    /** Update snake position and body (dt in milliseconds) */
    update(dt) {
        if (!this.alive) return;

        // Delta-time factor normalized to 60fps (16.67ms per frame)
        const dtFactor = dt / 16.67;

        // Smooth turn toward target angle (delta-time dependent)
        const diff = Utils.angleDiff(this.angle, this.targetAngle);
        const maxTurn = (this.turnRate / 60) * dtFactor; // per-second rate to per-frame
        if (Math.abs(diff) > 0.001) {
            this.angle += Utils.clamp(diff, -maxTurn, maxTurn);
        }
        this.eyeAngle = Utils.lerp(this.eyeAngle, this.angle, 0.15 * dtFactor);

        // Speed
        this.speed = this.baseSpeed;
        if (this.boosting && this.mass > CONFIG.SNAKE_MIN_MASS) {
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

        this._appendPath();

        // Boost mass loss, proportional to size so it costs something at every scale
        if (this.boosting && !this.hasPowerup('speed')) {
            const perSec = Math.max(
                this.mass * CONFIG.SNAKE_BOOST_COST_FRAC,
                CONFIG.SNAKE_BOOST_COST_MIN
            ) * Math.max(0.3, 1 - this.boostCostReduction);
            const burn = perSec * (dt / 1000);
            const spent = this._shrinkMass(burn);
            // Bank only the recoverable share. The rest is simply gone — that is
            // what makes boosting cost something you cannot earn back.
            this.boostMassPending += spent * CONFIG.BOOST_PELLET_RECOVERY;
            this.boostTrailTimer += dt;
        } else {
            this.boostTrailTimer = 0;
        }

        this._solveSegments();

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

    /**
     * Grow the snake by adding mass.
     * `ownTrail` marks mass being reclaimed from this snake's own boost trail —
     * 2x Growth deliberately does not apply to it, otherwise doubling turns a
     * half-value pellet back into a full refund and boosting becomes free.
     */
    grow(amount, ownTrail) {
        const multiplier = (!ownTrail && this.hasPowerup('double')) ? 2 : 1;
        const added = amount * multiplier;
        this.mass += added;
        this._recomputeSize();
        return added;
    }

    /** Remove mass, returning how much was actually removed. */
    _shrinkMass(amount) {
        const before = this.mass;
        this.mass = Math.max(this.mass - amount, CONFIG.SNAKE_MIN_MASS);
        const removed = before - this.mass;
        if (removed > 0) this._recomputeSize();
        return removed;
    }

    /**
     * Boost trail pellet, on a timer, carrying part of the mass boost has burnt
     * since the last drop. A 10k snake burning 120 mass/second must not emit
     * 120 pellets/second, and the pellet is worth less than what it cost so that
     * boosting can never pay for itself.
     */
    getBoostPellet() {
        if (!this.boosting || this.hasPowerup('speed')) return null;
        if (this.boostTrailTimer < CONFIG.SNAKE_BOOST_TRAIL_INTERVAL) return null;
        // Not worth a pellet yet — keep the timer running and keep accruing. Do
        // NOT round a fraction up to a whole pellet: that creates mass out of
        // nothing, and a small snake can then boost in a circle and get richer.
        if (this.boostMassPending < CONFIG.BOOST_PELLET_MIN_VALUE) return null;
        this.boostTrailTimer = 0;
        const value = this.boostMassPending;
        this.boostMassPending = 0;
        const tail = this.segCount - 1;
        return {
            x: this.segX[tail],
            y: this.segY[tail],
            value: value,
            owner: this.id
        };
    }

    /**
     * Apply a power-up. `duration` overrides the collected length — that is how
     * the BOOST ability grants a shorter version of the same thing. The Boost
     * Duration upgrade adds to both.
     */
    applyPowerup(type, duration) {
        const config = CONFIG.POWERUP_TYPES[type.toUpperCase()];
        if (!config) return 0;
        const ms = (duration || config.duration) + this.boostTimeBonus;
        this.powerups[config.id] = performance.now() + ms;
        return ms;
    }

    /** Check if snake has a specific power-up active */
    hasPowerup(type) {
        return this.powerups[type] && performance.now() < this.powerups[type];
    }

    /** True while a just-spent shield is still protecting the snake. */
    isInvulnerable() {
        return performance.now() < this.shieldGraceUntil;
    }

    /** Consume a shield, granting a short grace period. Returns true if one was spent. */
    consumeShield() {
        if (this.isInvulnerable()) return true;
        if (!this.hasPowerup('shield')) return false;
        delete this.powerups['shield'];
        this.shieldGraceUntil = performance.now() + CONFIG.SHIELD_GRACE_MS;
        return true;
    }

    /**
     * Die - returns an array of death pellets.
     * The pellet count is capped and the victim's mass is concentrated into
     * however many pellets that leaves, so killing a big snake is a big meal
     * without flooding the world with thousands of objects.
     */
    die(killer) {
        if (!this.alive) return [];
        this.alive = false;

        if (killer && killer.alive) {
            killer.kills++;
        }

        const recovered = this.mass * CONFIG.DEATH_MASS_RECOVERY;
        // Pick the pellet COUNT so each one clears the minimum value, rather than
        // clamping the value upward — clamping would hand out more mass than the
        // victim ever had.
        const count = Utils.clamp(
            Math.round(Math.min(this.segCount / 2, recovered / CONFIG.DEATH_PELLET_MIN_VALUE)),
            2, CONFIG.DEATH_PELLET_MAX
        );
        const perPellet = recovered / count;
        // Bigger meals are visibly bigger pellets.
        const radius = CONFIG.DEATH_PELLET_RADIUS *
            Utils.clamp(1 + Math.sqrt(perPellet) / 12, 1, 3);

        const pellets = [];
        const stride = (this.segCount - 1) / count;
        for (let i = 0; i < count; i++) {
            const idx = Math.min(this.segCount - 1, Math.round(i * stride));
            pellets.push({
                x: this.segX[idx] + Utils.rand(-this.bodyRadius, this.bodyRadius),
                y: this.segY[idx] + Utils.rand(-this.bodyRadius, this.bodyRadius),
                color: this.getColorAt(idx),
                radius: radius,
                value: perPellet
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
        this.boosting = active && this.mass > CONFIG.SNAKE_MIN_MASS;
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
        for (let i = 0; i < this.segCount; i++) {
            const x = this.segX[i], y = this.segY[i];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
        const r = this.headRadius;
        return { minX: minX - r, minY: minY - r, maxX: maxX + r, maxY: maxY + r };
    }
}
