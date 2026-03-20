/**
 * Collision detection with spatial hashing
 */
class CollisionSystem {
    constructor() {
        this.cellSize = 60;
        this.grid = new Map();
    }

    /** Clear the spatial hash grid */
    clear() {
        this.grid.clear();
    }

    /** Get cell key for a position */
    _key(x, y) {
        const cx = Math.floor(x / this.cellSize);
        const cy = Math.floor(y / this.cellSize);
        return `${cx},${cy}`;
    }

    /** Insert a segment into the grid */
    insert(x, y, data) {
        const key = this._key(x, y);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key).push({ x, y, ...data });
    }

    /** Query all items near a point */
    query(x, y, radius) {
        const results = [];
        const minCX = Math.floor((x - radius) / this.cellSize);
        const maxCX = Math.floor((x + radius) / this.cellSize);
        const minCY = Math.floor((y - radius) / this.cellSize);
        const maxCY = Math.floor((y + radius) / this.cellSize);

        for (let cx = minCX; cx <= maxCX; cx++) {
            for (let cy = minCY; cy <= maxCY; cy++) {
                const key = `${cx},${cy}`;
                const cell = this.grid.get(key);
                if (cell) {
                    for (const item of cell) {
                        results.push(item);
                    }
                }
            }
        }
        return results;
    }

    /**
     * Build spatial hash from all snakes' body segments
     * Skips first N segments (head area) to prevent self-collision issues
     */
    buildFromSnakes(snakes) {
        this.clear();
        for (const snake of snakes) {
            if (!snake.alive) continue;
            // Skip head + a few segments to prevent self-kill
            for (let i = 5; i < snake.segments.length; i++) {
                const seg = snake.segments[i];
                this.insert(seg.x, seg.y, {
                    snakeId: snake.id,
                    segIndex: i,
                    radius: snake.getRadiusAt(i)
                });
            }
        }
    }

    /**
     * Check head-to-body collisions for all snakes
     * Returns array of { victim, killer } pairs
     */
    checkSnakeCollisions(snakes) {
        const collisions = [];

        for (const snake of snakes) {
            if (!snake.alive) continue;

            const headX = snake.x;
            const headY = snake.y;
            const headR = snake.getRadiusAt(0);

            // Query nearby segments
            const nearby = this.query(headX, headY, headR + 20);

            for (const item of nearby) {
                // Skip own segments
                if (item.snakeId === snake.id) continue;

                const dist = Utils.dist(headX, headY, item.x, item.y);
                if (dist < headR + item.radius) {
                    // Check for shield
                    if (snake.hasPowerup('shield')) {
                        delete snake.powerups['shield'];
                        continue;
                    }
                    const killer = snakes.find(s => s.id === item.snakeId);
                    collisions.push({ victim: snake, killer: killer });
                    break;
                }
            }
        }
        return collisions;
    }

    /**
     * Check head-to-head collisions
     */
    checkHeadCollisions(snakes) {
        const collisions = [];
        const alive = snakes.filter(s => s.alive);

        for (let i = 0; i < alive.length; i++) {
            for (let j = i + 1; j < alive.length; j++) {
                const a = alive[i];
                const b = alive[j];
                const dist = Utils.dist(a.x, a.y, b.x, b.y);
                const threshold = a.getRadiusAt(0) + b.getRadiusAt(0);

                if (dist < threshold) {
                    // Smaller snake dies, or both if equal
                    if (a.mass < b.mass) {
                        collisions.push({ victim: a, killer: b });
                    } else if (b.mass < a.mass) {
                        collisions.push({ victim: b, killer: a });
                    } else {
                        collisions.push({ victim: a, killer: b });
                        collisions.push({ victim: b, killer: a });
                    }
                }
            }
        }
        return collisions;
    }

    /**
     * Check snake head vs food collisions
     * Returns array of { snake, foodIndex }
     */
    checkFoodCollisions(snakes, food) {
        const eaten = [];
        for (const snake of snakes) {
            if (!snake.alive) continue;

            const headX = snake.x;
            const headY = snake.y;
            const eatRadius = snake.getRadiusAt(0) + 5;
            const magnetRange = snake.getEffectiveMagnetRange();

            for (let i = food.length - 1; i >= 0; i--) {
                const f = food[i];
                const dist = Utils.dist(headX, headY, f.x, f.y);

                if (dist < eatRadius + f.radius) {
                    eaten.push({ snake, foodIndex: i, food: f });
                } else if (magnetRange > 0 && dist < magnetRange) {
                    // Magnet: pull food toward snake head
                    const angle = Utils.angleTo(f.x, f.y, headX, headY);
                    const pull = 3;
                    f.x += Math.cos(angle) * pull;
                    f.y += Math.sin(angle) * pull;
                }
            }
        }
        return eaten;
    }

    /**
     * Check snake head vs power-up collisions
     */
    checkPowerupCollisions(snakes, powerups) {
        const collected = [];
        for (const snake of snakes) {
            if (!snake.alive) continue;
            for (let i = powerups.length - 1; i >= 0; i--) {
                const pu = powerups[i];
                const dist = Utils.dist(snake.x, snake.y, pu.x, pu.y);
                if (dist < snake.getRadiusAt(0) + pu.radius) {
                    collected.push({ snake, powerupIndex: i, powerup: pu });
                }
            }
        }
        return collected;
    }
}
