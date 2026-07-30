/**
 * Collision detection with spatial hashing
 *
 * Two things matter for performance here, both learned the hard way:
 *
 *  - **Integer cell keys, not strings.** `${cx},${cy}` built a fresh string for
 *    every insert and every cell of every query. At a few thousand segments a
 *    frame that is the single biggest source of garbage in the game.
 *  - **No objects per entry.** The old code did `{x, y, ...data}` per segment.
 *    Entries are now packed integers (snake index and segment index in one
 *    number) and positions are read back from the snake's Float32Arrays.
 *
 * Cells are cleared by bumping a generation counter rather than emptying the
 * map, so the backing arrays are reused for the life of the match and clearing
 * is O(1).
 */

const HASH_SNAKE_STRIDE = 1024;   // max segments per snake in a packed entry
const HASH_ORIGIN = 1 << 15;      // shifts negative cell coords positive

class SpatialHash {
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.cells = new Map();
        this.gen = 1;
    }

    /** O(1) clear — existing cell arrays are reused on next touch. */
    clear() {
        this.gen++;
    }

    setCellSize(size) {
        if (size === this.cellSize) return;
        this.cellSize = size;
        this.cells.clear();
        this.gen++;
    }

    _cell(cx, cy) {
        const key = (cx + HASH_ORIGIN) * 65536 + (cy + HASH_ORIGIN);
        let cell = this.cells.get(key);
        if (cell === undefined) {
            cell = { gen: this.gen, items: [] };
            this.cells.set(key, cell);
            return cell;
        }
        if (cell.gen !== this.gen) {
            cell.gen = this.gen;
            cell.items.length = 0;
        }
        return cell;
    }

    /** Insert a packed integer payload at a world position. */
    insert(x, y, payload) {
        const cs = this.cellSize;
        this._cell(Math.floor(x / cs), Math.floor(y / cs)).items.push(payload);
    }

    /**
     * Visit every payload within `radius` of a point. Takes a callback so no
     * result array is allocated; return true from `fn` to stop early.
     */
    forEachNear(x, y, radius, fn) {
        const cs = this.cellSize;
        const minCX = Math.floor((x - radius) / cs);
        const maxCX = Math.floor((x + radius) / cs);
        const minCY = Math.floor((y - radius) / cs);
        const maxCY = Math.floor((y + radius) / cs);

        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cy = minCY; cy <= maxCY; cy++) {
                const key = (cx + HASH_ORIGIN) * 65536 + (cy + HASH_ORIGIN);
                const cell = this.cells.get(key);
                if (cell === undefined || cell.gen !== this.gen) continue;
                const items = cell.items;
                for (let i = 0; i < items.length; i++) {
                    if (fn(items[i]) === true) return;
                }
            }
        }
    }
}

class CollisionSystem {
    constructor() {
        this.bodies = new SpatialHash(80);
        this.foodHash = new SpatialHash(120);
        this.snakes = [];          // frame-local index -> snake
        this._collisions = [];     // reused result buffer
        this._eaten = [];
        this._collected = [];
    }

    clear() {
        this.bodies.clear();
    }

    // ======================== BUILD ========================

    /** Build the body hash from every live snake's segments. */
    buildFromSnakes(snakes) {
        this.snakes = snakes;

        // Size the cells before inserting — setCellSize drops every cell, so
        // doing it afterwards would throw this frame's contents away. Cells stay
        // comfortably larger than the fattest body, which keeps a head query
        // down to a 3x3 neighbourhood.
        let maxRadius = 0;
        for (const snake of snakes) {
            if (snake.alive && snake.bodyRadius > maxRadius) maxRadius = snake.bodyRadius;
        }
        this.bodies.setCellSize(Math.max(80, Math.ceil((maxRadius * 2 + 40) / 40) * 40));
        this.bodies.clear();

        for (let s = 0; s < snakes.length && s < 63; s++) {
            const snake = snakes[s];
            if (!snake.alive) continue;
            const base = s * HASH_SNAKE_STRIDE;
            const n = Math.min(snake.segCount, HASH_SNAKE_STRIDE);
            // Segment 0 is the head and is never a collidable body part.
            for (let i = 1; i < n; i++) {
                this.bodies.insert(snake.segX[i], snake.segY[i], base + i);
            }
        }
    }

    /** Build the food hash. Payload is the food array index. */
    buildFoodHash(food) {
        this.foodHash.clear();
        for (let i = 0; i < food.length; i++) {
            this.foodHash.insert(food[i].x, food[i].y, i);
        }
    }

    // ======================== SNAKE VS SNAKE ========================

    /**
     * Check head-to-body collisions for all snakes.
     * Returns array of { victim, killer } pairs.
     */
    checkSnakeCollisions(snakes) {
        const collisions = this._collisions;
        collisions.length = 0;

        for (let s = 0; s < snakes.length; s++) {
            const snake = snakes[s];
            if (!snake.alive || snake.isInvulnerable()) continue;

            const headX = snake.x, headY = snake.y;
            const headR = snake.getRadiusAt(0);
            let hit = -1;

            this.bodies.forEachNear(headX, headY, headR + 8, payload => {
                const other = this.snakes[(payload / HASH_SNAKE_STRIDE) | 0];
                if (other === undefined || other === snake || !other.alive) return false;
                const i = payload % HASH_SNAKE_STRIDE;
                const dx = other.segX[i] - headX;
                const dy = other.segY[i] - headY;
                const reach = headR + other.getRadiusAt(i);
                if (dx * dx + dy * dy < reach * reach) {
                    hit = payload;
                    return true;
                }
                return false;
            });

            if (hit < 0) continue;
            if (snake.consumeShield()) continue;
            const killer = this.snakes[(hit / HASH_SNAKE_STRIDE) | 0];
            collisions.push({ victim: snake, killer: killer });
        }
        return collisions;
    }

    /**
     * Check head-to-head collisions. Only ever a handful of snakes, so the
     * pairwise loop is fine.
     */
    checkHeadCollisions(snakes) {
        const collisions = [];
        const alive = [];
        for (const s of snakes) if (s.alive) alive.push(s);

        for (let i = 0; i < alive.length; i++) {
            for (let j = i + 1; j < alive.length; j++) {
                const a = alive[i];
                const b = alive[j];
                const threshold = a.getRadiusAt(0) + b.getRadiusAt(0);
                if (Utils.distSq(a.x, a.y, b.x, b.y) >= threshold * threshold) continue;

                // Smaller snake dies; equal mass takes both. A shield is only
                // spent by a snake that would otherwise have died here.
                const kill = victim => {
                    if (victim.isInvulnerable() || victim.consumeShield()) return;
                    collisions.push({ victim, killer: victim === a ? b : a });
                };
                if (a.mass < b.mass) kill(a);
                else if (b.mass < a.mass) kill(b);
                else { kill(a); kill(b); }
            }
        }
        return collisions;
    }

    // ======================== SNAKE VS PICKUPS ========================

    /**
     * Check snake head vs food, and apply magnet pull.
     * Returns array of { snake, foodIndex, food }.
     * Assumes buildFoodHash(food) was called for this exact array this frame.
     */
    checkFoodCollisions(snakes, food) {
        const eaten = this._eaten;
        eaten.length = 0;
        const now = performance.now();

        for (const snake of snakes) {
            if (!snake.alive) continue;

            const headX = snake.x, headY = snake.y;
            const eatRadius = snake.getRadiusAt(0) + 5;
            const magnetRange = snake.getEffectiveMagnetRange();
            const queryR = Math.max(eatRadius + 8, magnetRange);

            this.foodHash.forEachNear(headX, headY, queryR, idx => {
                const f = food[idx];
                if (f === undefined) return false;
                // Your own fresh boost trail is inert — neither edible nor
                // magnetisable — so boosting cannot be recycled into free mass.
                if (f.owner === snake.id && now < f.armAt) return false;
                const dx = headX - f.x, dy = headY - f.y;
                const d2 = dx * dx + dy * dy;
                const reach = eatRadius + f.radius;

                if (d2 < reach * reach) {
                    eaten.push({ snake, foodIndex: idx, food: f });
                } else if (magnetRange > 0 && d2 < magnetRange * magnetRange) {
                    // Magnet: pull food toward the head. Pull scales down with
                    // distance so the edge of the field is a gentle drift.
                    const d = Math.sqrt(d2) || 1;
                    const pull = 3 * (1 - d / magnetRange) + 0.6;
                    f.x += (dx / d) * pull;
                    f.y += (dy / d) * pull;
                }
                return false;
            });
        }
        return eaten;
    }

    /** Check snake head vs power-up collisions. Only a handful of power-ups exist. */
    checkPowerupCollisions(snakes, powerups) {
        const collected = this._collected;
        collected.length = 0;
        for (const snake of snakes) {
            if (!snake.alive) continue;
            for (let i = powerups.length - 1; i >= 0; i--) {
                const pu = powerups[i];
                const reach = snake.getRadiusAt(0) + pu.radius;
                if (Utils.distSq(snake.x, snake.y, pu.x, pu.y) < reach * reach) {
                    collected.push({ snake, powerupIndex: i, powerup: pu });
                }
            }
        }
        return collected;
    }

    // ======================== AI QUERIES ========================

    /**
     * How far a ray from (x, y) along `angle` travels before it meets another
     * snake's body, up to `maxDist`. Used by the smarter AI tiers to notice the
     * wall of snake in front of them. Sampled rather than swept — cheap, and a
     * bot only needs to know "is this direction roughly clear".
     */
    rayClearance(x, y, angle, maxDist, selfSnake, clearance) {
        const step = Math.max(18, clearance);
        const cos = Math.cos(angle), sin = Math.sin(angle);
        for (let d = step; d <= maxDist; d += step) {
            const px = x + cos * d, py = y + sin * d;

            // The arena wall counts as an obstacle.
            if (Utils.distSq(0, 0, px, py) > CONFIG.WORLD_RADIUS * CONFIG.WORLD_RADIUS) return d;

            let blocked = false;
            this.bodies.forEachNear(px, py, clearance, payload => {
                const other = this.snakes[(payload / HASH_SNAKE_STRIDE) | 0];
                if (other === undefined || other === selfSnake || !other.alive) return false;
                const i = payload % HASH_SNAKE_STRIDE;
                const dx = other.segX[i] - px, dy = other.segY[i] - py;
                const reach = clearance + other.getRadiusAt(i);
                if (dx * dx + dy * dy < reach * reach) { blocked = true; return true; }
                return false;
            });
            if (blocked) return d;
        }
        return maxDist;
    }

    /**
     * Total food value within `radius` of a point — lets the smarter tiers head
     * for a cluster instead of the single nearest pellet.
     */
    foodValueNear(x, y, radius, food) {
        let total = 0;
        this.foodHash.forEachNear(x, y, radius, idx => {
            const f = food[idx];
            if (f !== undefined && Utils.distSq(x, y, f.x, f.y) < radius * radius) {
                total += f.value || 1;
            }
            return false;
        });
        return total;
    }
}
