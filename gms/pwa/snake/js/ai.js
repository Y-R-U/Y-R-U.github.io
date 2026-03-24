/**
 * AI system for bot snakes
 */
class AI {
    constructor() {
        this.bots = new Map(); // snakeId -> bot state
    }

    /** Register a snake as an AI bot */
    register(snake, personality) {
        this.bots.set(snake.id, {
            snake: snake,
            personality: personality || Utils.randPick(['aggressive', 'passive', 'balanced', 'hunter']),
            state: 'wander',
            stateTimer: 0,
            decisionTimer: 0,
            wanderAngle: snake.angle,
            targetFood: null,
            targetSnake: null,
            fleeAngle: 0
        });
    }

    /** Unregister a dead bot */
    unregister(snakeId) {
        this.bots.delete(snakeId);
    }

    /** Update all bots */
    update(dt, allSnakes, food, powerups) {
        for (const [id, bot] of this.bots) {
            if (!bot.snake.alive) continue;
            bot.decisionTimer += dt;

            if (bot.decisionTimer >= CONFIG.BOT_DECISION_INTERVAL) {
                bot.decisionTimer = 0;
                this._decide(bot, allSnakes, food, powerups);
            }

            this._execute(bot, dt);
        }
    }

    /** Make a decision for a bot */
    _decide(bot, allSnakes, food, powerups) {
        const snake = bot.snake;
        const x = snake.x, y = snake.y;
        const detectR = CONFIG.BOT_DETECTION_RADIUS;

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

        // Find nearest food (detection range scales with mass)
        let bestFood = null, bestFoodDist = Infinity;
        const foodDetect = CONFIG.BOT_FOOD_DETECTION + Math.min(snake.mass * 2, 300);
        for (let i = 0; i < food.length; i++) {
            const f = food[i];
            const d = Utils.dist(x, y, f.x, f.y);
            // Prefer death pellets (higher value)
            const score = d / (f.value || 1);
            if (d < foodDetect && score < bestFoodDist) {
                bestFoodDist = score;
                bestFood = f;
            }
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

        // State transitions based on personality
        switch (bot.personality) {
            case 'aggressive':
                if (nearestThreat && threatDist < 100) {
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
                if (nearestThreat && threatDist < 200) {
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
                if (nearestThreat && threatDist < 80) {
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
                if (nearestThreat && threatDist < 150) {
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
    }

    /** Execute current state behavior */
    _execute(bot, dt) {
        const snake = bot.snake;

        switch (bot.state) {
            case 'wander':
                bot.stateTimer += dt;
                if (bot.stateTimer > 2000) {
                    bot.stateTimer = 0;
                    bot.wanderAngle += Utils.rand(-0.8, 0.8);
                }
                snake.setTarget(bot.wanderAngle);
                snake.setBoost(false);
                break;

            case 'seek_food':
                if (bot.targetFood) {
                    const angle = Utils.angleTo(snake.x, snake.y, bot.targetFood.x, bot.targetFood.y);
                    snake.setTarget(angle);
                    snake.setBoost(false);
                }
                break;

            case 'seek_powerup':
                if (bot.targetFood) {
                    const angle = Utils.angleTo(snake.x, snake.y, bot.targetFood.x, bot.targetFood.y);
                    snake.setTarget(angle);
                    // Boost toward powerups if nearby
                    const d = Utils.dist(snake.x, snake.y, bot.targetFood.x, bot.targetFood.y);
                    snake.setBoost(d < 100 && snake.segments.length > 15);
                }
                break;

            case 'attack':
                if (bot.targetSnake && bot.targetSnake.alive) {
                    // Try to cut off: aim ahead of target
                    const target = bot.targetSnake;
                    const predictX = target.x + Math.cos(target.angle) * target.speed * 20;
                    const predictY = target.y + Math.sin(target.angle) * target.speed * 20;
                    const angle = Utils.angleTo(snake.x, snake.y, predictX, predictY);
                    snake.setTarget(angle);
                    // Boost when close enough to cut off
                    const dist = Utils.dist(snake.x, snake.y, target.x, target.y);
                    snake.setBoost(dist < 150 && snake.segments.length > 15);
                } else {
                    bot.state = 'wander';
                }
                break;

            case 'flee':
                snake.setTarget(bot.fleeAngle);
                snake.setBoost(snake.segments.length > 10);
                break;

            case 'flee_boundary':
                snake.setTarget(bot.fleeAngle);
                snake.setBoost(false);
                break;
        }
    }

    /** Create a new bot snake */
    static createBot(userData) {
        const skinIndex = Utils.randInt(0, CONFIG.SKINS.length - 1);
        const skin = CONFIG.SKINS[skinIndex];
        const name = Utils.randPick(CONFIG.BOT_NAMES) + Utils.randInt(1, 99);

        const snake = new Snake({
            name: name,
            skinId: skin.id,
            isPlayer: false,
            startLength: Utils.randInt(8, 25)
        });

        return snake;
    }
}
