/**
 * AI system for bot snakes
 *
 * Bots have a *personality* (what they want) and a *skill tier* (how well they
 * pursue it). Personality is random; the tier mix is driven by how far the
 * player has come, so your first few games are against snakes that will happily
 * circle forever and drive straight into a wall of tail, and a few hundred games
 * later you are up against snakes that look ahead, lead their shots and cut you
 * off. Occasionally one bot is a "ringer" promoted to the top tier — a single
 * genuinely dangerous snake in an otherwise ordinary lobby.
 *
 * Tier 0 keeps its flaws deliberately. Do not "fix" them:
 *   - no look-ahead at all, so obvious collisions are not avoided
 *   - no anti-circling, so it can get stuck orbiting a point
 *   - a slow decision clock and a delayed threat response
 */
class AI {
    constructor(collision) {
        this.bots = new Map();      // snakeId -> bot state
        this.collision = collision; // for ray clearance / food clustering
        this.pressure = 0;          // 0 = brand new player, 1 = veteran
        this.ringerUsed = false;
    }

    /**
     * Set how hard the lobby should be, 0..1. Derived from the player's career
     * so difficulty follows the account rather than the session.
     */
    setPressure(p) {
        this.pressure = Utils.clamp(p, 0, 1);
        this.ringerUsed = false;
    }

    /** Interpolate the tier weight table at the current pressure. */
    _mix() {
        const rows = CONFIG.AI_MIX;
        const p = this.pressure;
        if (p <= rows[0].p) return rows[0].w;
        for (let i = 1; i < rows.length; i++) {
            if (p <= rows[i].p) {
                const a = rows[i - 1], b = rows[i];
                const t = (p - a.p) / Math.max(1e-6, b.p - a.p);
                const out = [];
                for (let k = 0; k < a.w.length; k++) out.push(a.w[k] + (b.w[k] - a.w[k]) * t);
                return out;
            }
        }
        return rows[rows.length - 1].w;
    }

    /** Roll a skill tier from the current mix. */
    pickTier() {
        // One bot per match may be promoted to the very top tier regardless of
        // the mix — Aaron's "occasionally a very smart one".
        if (!this.ringerUsed && Math.random() < CONFIG.AI_RINGER_CHANCE * this.pressure) {
            this.ringerUsed = true;
            return CONFIG.AI_TIERS.length - 1;
        }
        const w = this._mix();
        let total = 0;
        for (const x of w) total += x;
        let roll = Math.random() * total;
        for (let i = 0; i < w.length; i++) {
            roll -= w[i];
            if (roll <= 0) return i;
        }
        return 0;
    }

    /** Register a snake as an AI bot */
    register(snake, personality, tier) {
        const t = Utils.clamp(tier === undefined ? this.pickTier() : tier, 0, CONFIG.AI_TIERS.length - 1);
        this.bots.set(snake.id, {
            snake: snake,
            personality: personality || Utils.randPick(['aggressive', 'passive', 'balanced', 'hunter']),
            tier: t,
            params: CONFIG.AI_TIERS[t],
            state: 'wander',
            stateTimer: 0,
            decisionTimer: Utils.rand(0, CONFIG.AI_TIERS[t].decision), // stagger the clocks
            probeTimer: Utils.rand(0, 120),
            wanderAngle: snake.angle,
            steerAngle: snake.angle,
            avoidOffset: 0,
            targetFood: null,
            targetSnake: null,
            fleeAngle: 0,
            threatSince: 0,
            // anti-circling bookkeeping
            turnAccum: 0,
            lastAngle: snake.angle,
            windowStart: 0,
            anchorX: snake.x,
            anchorY: snake.y,
            escapeUntil: 0
        });
        snake.aiTier = t;
        return t;
    }

    /** Unregister a dead bot */
    unregister(snakeId) {
        this.bots.delete(snakeId);
    }

    /** Update all bots */
    update(dt, allSnakes, food, powerups) {
        const now = performance.now();
        for (const [id, bot] of this.bots) {
            if (!bot.snake.alive) continue;

            this._trackCircling(bot, dt, now);

            bot.decisionTimer += dt;
            if (bot.decisionTimer >= bot.params.decision) {
                bot.decisionTimer = 0;
                this._decide(bot, allSnakes, food, powerups, now);
            } else if (bot.params.lookAhead > 0) {
                // Cheap imminent-danger poll between full decisions: one short
                // ray forward. A full fan every frame would cost far more than
                // the behaviour is worth.
                bot.probeTimer += dt;
                if (bot.probeTimer >= 120) {
                    bot.probeTimer = 0;
                    const s = bot.snake;
                    const want = s.headRadius + CONFIG.AI_AVOID_MARGIN;
                    const clear = this.collision.rayClearance(
                        s.x, s.y, s.angle, bot.params.lookAhead * 0.6, s, want
                    );
                    if (clear < bot.params.lookAhead * 0.6) {
                        bot.decisionTimer = 0;
                        this._decide(bot, allSnakes, food, powerups, now);
                    }
                }
            }

            this._execute(bot, dt, now);
        }
    }

    /**
     * Notice when a bot is going round in circles: lots of net rotation, very
     * little net displacement. Only tiers that are meant to be competent care.
     */
    _trackCircling(bot, dt, now) {
        const s = bot.snake;
        bot.turnAccum += Utils.angleDiff(bot.lastAngle, s.angle);
        bot.lastAngle = s.angle;

        if (!bot.params.antiCircle) return;
        if (bot.windowStart === 0) { bot.windowStart = now; bot.anchorX = s.x; bot.anchorY = s.y; }

        if (now - bot.windowStart > CONFIG.AI_CIRCLE_WINDOW) {
            bot.windowStart = now;
            bot.anchorX = s.x;
            bot.anchorY = s.y;
            bot.turnAccum = 0;
            return;
        }

        const spun = Math.abs(bot.turnAccum) > CONFIG.AI_CIRCLE_TURNS * Math.PI * 2;
        const stuck = Utils.distSq(bot.anchorX, bot.anchorY, s.x, s.y) < 400 * 400;
        if (spun && stuck && now > bot.escapeUntil) {
            bot.escapeUntil = now + CONFIG.AI_CIRCLE_ESCAPE_MS;
            bot.turnAccum = 0;
            bot.windowStart = now;
            bot.anchorX = s.x;
            bot.anchorY = s.y;
            // Break out along the clearest heading we can find, away from centre
            // of the loop rather than continuing round it.
            bot.state = 'escape';
            bot.steerAngle = this._bestHeading(bot, s.angle + Math.PI * 0.5, Math.PI);
        }
    }

    /** Make a decision for a bot */
    _decide(bot, allSnakes, food, powerups, now) {
        const snake = bot.snake;
        const p = bot.params;
        const x = snake.x, y = snake.y;
        const detectR = CONFIG.BOT_DETECTION_RADIUS * (0.8 + 0.4 * bot.tier);

        if (now < bot.escapeUntil) return;   // committed to breaking out of a loop

        // Check boundary proximity
        const distToEdge = CONFIG.WORLD_RADIUS - Utils.dist(0, 0, x, y);
        if (distToEdge < CONFIG.BOUNDARY_WARNING) {
            bot.state = 'flee_boundary';
            bot.fleeAngle = Utils.angleTo(x, y, 0, 0);
            return;
        }

        // Find nearby threats and targets
        let nearestThreat = null, threatDist = Infinity;
        let nearestSmaller = null, smallerDist = Infinity;

        for (const other of allSnakes) {
            if (other.id === snake.id || !other.alive) continue;
            const d = Utils.dist(x, y, other.x, other.y);
            if (d > detectR) continue;

            if (other.mass > snake.mass * 0.8) {
                if (d < threatDist) {
                    threatDist = d;
                    nearestThreat = other;
                }
            }
            if (other.mass < snake.mass * 0.6 && other.mass > 5) {
                if (d < smallerDist) {
                    smallerDist = d;
                    nearestSmaller = other;
                }
            }
        }

        // Threat reaction time: a dumb bot keeps doing what it was doing for a
        // beat after danger appears.
        if (nearestThreat) {
            if (bot.threatSince === 0) bot.threatSince = now;
            if (now - bot.threatSince < p.reaction) nearestThreat = null;
        } else {
            bot.threatSince = 0;
        }

        // Find food. Everyone can see the nearest pellet; the better tiers weigh
        // it against how much food is sitting around it.
        const foodDetect = CONFIG.BOT_FOOD_DETECTION + Math.min(Math.sqrt(snake.mass) * 12, 400);
        let bestFood = null, bestFoodScore = Infinity;
        for (let i = 0; i < food.length; i++) {
            const f = food[i];
            const d = Utils.dist(x, y, f.x, f.y);
            if (d > foodDetect) continue;
            let score = d / (f.value || 1);
            if (score < bestFoodScore) { bestFoodScore = score; bestFood = f; }
        }
        if (p.clusterFood && bestFood) {
            // Sample a few candidates and prefer a dense patch over a lone pellet.
            let bestClusterScore = -Infinity, pick = bestFood;
            for (let n = 0; n < 6; n++) {
                const f = food[Utils.randInt(0, food.length - 1)];
                if (!f) continue;
                const d = Utils.dist(x, y, f.x, f.y);
                if (d > foodDetect) continue;
                const cluster = this.collision.foodValueNear(f.x, f.y, 220, food);
                const s = cluster - d * 0.05;
                if (s > bestClusterScore) { bestClusterScore = s; pick = f; }
            }
            const nearCluster = this.collision.foodValueNear(bestFood.x, bestFood.y, 220, food)
                - Utils.dist(x, y, bestFood.x, bestFood.y) * 0.05;
            bestFood = bestClusterScore > nearCluster ? pick : bestFood;
        }

        // Find nearby powerups
        let nearestPowerup = null, puDist = Infinity;
        for (const pu of powerups) {
            const d = Utils.dist(x, y, pu.x, pu.y);
            if (d < foodDetect && d < puDist) {
                puDist = d;
                nearestPowerup = pu;
            }
        }

        // Flee distance widens with skill — a better bot respects danger sooner.
        const fleeAt = {
            aggressive: 100, passive: 200, hunter: 80, balanced: 150
        }[bot.personality] * p.threatMult;

        // State transitions based on personality
        switch (bot.personality) {
            case 'aggressive':
                if (nearestThreat && threatDist < fleeAt) {
                    bot.state = 'flee';
                    bot.fleeAngle = Utils.angleTo(nearestThreat.x, nearestThreat.y, x, y);
                } else if (nearestSmaller && smallerDist < detectR * 0.8) {
                    bot.state = 'attack';
                    bot.targetSnake = nearestSmaller;
                } else if (nearestPowerup) {
                    bot.state = 'seek_powerup';
                    bot.targetFood = nearestPowerup;
                } else if (bestFood) {
                    bot.state = 'seek_food';
                    bot.targetFood = bestFood;
                } else {
                    bot.state = 'wander';
                }
                break;

            case 'passive':
                if (nearestThreat && threatDist < fleeAt) {
                    bot.state = 'flee';
                    bot.fleeAngle = Utils.angleTo(nearestThreat.x, nearestThreat.y, x, y);
                } else if (nearestPowerup) {
                    bot.state = 'seek_powerup';
                    bot.targetFood = nearestPowerup;
                } else if (bestFood) {
                    bot.state = 'seek_food';
                    bot.targetFood = bestFood;
                } else {
                    bot.state = 'wander';
                }
                break;

            case 'hunter':
                if (nearestThreat && threatDist < fleeAt) {
                    bot.state = 'flee';
                    bot.fleeAngle = Utils.angleTo(nearestThreat.x, nearestThreat.y, x, y);
                } else if (nearestSmaller) {
                    bot.state = 'attack';
                    bot.targetSnake = nearestSmaller;
                } else if (bestFood) {
                    bot.state = 'seek_food';
                    bot.targetFood = bestFood;
                } else {
                    bot.state = 'wander';
                }
                break;

            case 'balanced':
            default:
                if (nearestThreat && threatDist < fleeAt) {
                    bot.state = 'flee';
                    bot.fleeAngle = Utils.angleTo(nearestThreat.x, nearestThreat.y, x, y);
                } else if (nearestPowerup && puDist < 150) {
                    bot.state = 'seek_powerup';
                    bot.targetFood = nearestPowerup;
                } else if (nearestSmaller && smallerDist < detectR * 0.5 && snake.mass > 30) {
                    bot.state = 'attack';
                    bot.targetSnake = nearestSmaller;
                } else if (bestFood) {
                    bot.state = 'seek_food';
                    bot.targetFood = bestFood;
                } else {
                    bot.state = 'wander';
                }
                break;
        }

        // Whatever we decided to do, the competent tiers check the way is clear.
        // We store the *offset* avoidance asked for rather than an absolute
        // heading, so a chase can keep recomputing its intercept every frame
        // while the expensive ray fan only runs on the decision clock.
        const desired = this._desiredAngle(bot);
        bot.avoidOffset = Utils.angleDiff(desired, this._steerAvoiding(bot, desired));
    }

    /** The heading the current state wants, ignoring obstacles. */
    _desiredAngle(bot) {
        const snake = bot.snake;
        switch (bot.state) {
            case 'seek_food':
            case 'seek_powerup':
                if (bot.targetFood) {
                    return Utils.angleTo(snake.x, snake.y, bot.targetFood.x, bot.targetFood.y);
                }
                return bot.wanderAngle;

            case 'attack': {
                const target = bot.targetSnake;
                if (!target || !target.alive) return bot.wanderAngle;
                // First-order intercept: aim where the target will be when we
                // arrive, not where it is. `lead` blunts this for weaker tiers.
                const d = Utils.dist(snake.x, snake.y, target.x, target.y);
                const frames = Math.min(d / Math.max(0.5, snake.speed), 90) * bot.params.lead;
                const px = target.x + Math.cos(target.angle) * target.speed * frames;
                const py = target.y + Math.sin(target.angle) * target.speed * frames;
                return Utils.angleTo(snake.x, snake.y, px, py);
            }

            case 'flee':
            case 'flee_boundary':
            case 'escape':
                return bot.state === 'escape' ? bot.steerAngle : bot.fleeAngle;

            case 'wander':
            default:
                return bot.wanderAngle;
        }
    }

    /**
     * Steer around bodies and walls. Probes a fan of headings and takes the one
     * with the most room that is still closest to where it wanted to go.
     * Tier 0 has fanRays 0 and therefore does none of this — it will drive
     * straight into things, which is the point.
     */
    _steerAvoiding(bot, desired) {
        const p = bot.params;
        if (!p.fanRays || p.lookAhead <= 0) return desired;
        const s = bot.snake;
        const want = s.headRadius + CONFIG.AI_AVOID_MARGIN;

        const straight = this.collision.rayClearance(s.x, s.y, desired, p.lookAhead, s, want);
        if (straight >= p.lookAhead) return desired;
        return this._bestHeading(bot, desired, Math.PI * 0.85);
    }

    /** Pick the clearest heading within `spread` radians either side of `desired`. */
    _bestHeading(bot, desired, spread) {
        const p = bot.params;
        const s = bot.snake;
        const want = s.headRadius + CONFIG.AI_AVOID_MARGIN;
        const rays = Math.max(3, p.fanRays || 3);
        const look = p.lookAhead > 0 ? p.lookAhead : 200;

        let best = desired, bestScore = -Infinity;
        for (let i = 0; i < rays; i++) {
            const t = rays === 1 ? 0 : (i / (rays - 1)) * 2 - 1;   // -1 .. 1
            const a = desired + t * spread;
            const clear = this.collision.rayClearance(s.x, s.y, a, look, s, want);
            // Prefer room, but break ties toward the heading we actually wanted.
            const score = clear - Math.abs(t) * look * 0.22;
            if (score > bestScore) { bestScore = score; best = a; }
        }
        return best;
    }

    /**
     * Execute current state behavior. The heading is recomputed from scratch
     * every frame (cheap trigonometry, and it keeps a chase tracking a moving
     * target) plus whatever avoidance offset the last decision asked for.
     */
    _execute(bot, dt, now) {
        const snake = bot.snake;
        const p = bot.params;

        if (bot.state === 'escape') {
            if (now < bot.escapeUntil) {
                snake.setTarget(bot.steerAngle);
                snake.setBoost(p.boostSmart && snake.mass > 40);
                return;
            }
            bot.state = 'wander';
            bot.wanderAngle = snake.angle;
        }

        if (bot.state === 'wander') {
            bot.stateTimer += dt;
            if (bot.stateTimer > 2000) {
                bot.stateTimer = 0;
                bot.wanderAngle += Utils.rand(-0.8, 0.8);
            }
        }

        if (bot.state === 'attack' && (!bot.targetSnake || !bot.targetSnake.alive)) {
            bot.state = 'wander';
        }

        snake.setTarget(this._desiredAngle(bot) + (bot.avoidOffset || 0));

        // Boost decisions
        switch (bot.state) {
            case 'seek_powerup': {
                const t = bot.targetFood;
                const d = t ? Utils.dist(snake.x, snake.y, t.x, t.y) : Infinity;
                snake.setBoost(p.boostSmart && d < 220 && snake.mass > 40);
                break;
            }
            case 'attack': {
                const target = bot.targetSnake;
                const dist = Utils.dist(snake.x, snake.y, target.x, target.y);
                // Only spend mass on a chase that is actually worth winning.
                const worthIt = snake.mass > target.mass * 1.4;
                snake.setBoost(dist < (p.boostSmart ? 260 : 150) && snake.mass > 40 && worthIt);
                break;
            }
            case 'flee':
                snake.setBoost(snake.mass > 30 && (p.boostSmart || Math.random() < 0.3));
                break;
            default:
                snake.setBoost(false);
                break;
        }
    }

    /**
     * Create a new bot snake, sized against whoever is currently leading so the
     * lobby always contains a credible rival. Fixed 8-25 mass bots made the late
     * game an empty grind with nothing worth eating.
     */
    static createBot(userData, leaderMass) {
        const skinIndex = Utils.randInt(0, CONFIG.SKINS.length - 1);
        const skin = CONFIG.SKINS[skinIndex];
        const name = Utils.randPick(CONFIG.BOT_NAMES) + Utils.randInt(1, 99);

        const base = Utils.randInt(CONFIG.BOT_SPAWN_BASE_MIN, CONFIG.BOT_SPAWN_BASE_MAX);
        const lead = Math.max(0, leaderMass || 0);
        const share = lead * Utils.rand(CONFIG.BOT_RIVAL_FRACTION_MIN, CONFIG.BOT_RIVAL_FRACTION_MAX);
        const startLength = Utils.clamp(
            Math.round(base + share),
            CONFIG.BOT_SPAWN_BASE_MIN,
            Math.max(CONFIG.BOT_SPAWN_BASE_MAX, Math.round(lead * CONFIG.BOT_RIVAL_CAP))
        );

        return new Snake({
            name: name,
            skinId: skin.id,
            isPlayer: false,
            startLength: startLength
        });
    }
}
