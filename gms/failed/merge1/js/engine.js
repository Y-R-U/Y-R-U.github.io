/* ===== BOUNCE MERGE ROGUELITE — ENGINE (Entities, Physics, Particles) ===== */
(function(BM) {
    'use strict';
    var CFG = BM.CFG;

    // ===== BALL =====
    function Ball(x, y, value, vx, vy) {
        this.x = x;
        this.y = y;
        this.value = value || 2;
        this.vx = vx || 0;
        this.vy = vy || 0;
        this.radius = CFG.BALL_BASE_RADIUS;
        this.bounces = 0;
        this.maxBounces = CFG.BALL_MAX_BOUNCES;
        this.active = true;       // still moving
        this.settled = false;     // has come to rest on the field
        this.merging = false;
        this.mergeTimer = 0;
        this.mergeTarget = null;
        this.dead = false;        // flagged for removal
        this.flashTimer = 0;
    }

    Ball.prototype.speed = function() {
        return Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    };

    Ball.prototype.settle = function() {
        this.active = false;
        this.settled = true;
        this.vx = 0;
        this.vy = 0;
    };

    // ===== BLOCK =====
    function Block(col, row, hp, isBoss) {
        this.col = col;
        this.row = row;
        this.hp = hp;
        this.maxHp = hp;
        this.isBoss = isBoss || false;
        this.dead = false;
        this.flashTimer = 0;
        // Pixel positions calculated by layout
        this.x = 0;
        this.y = 0;
        this.w = 0;
        this.h = 0;
    }

    // ===== PARTICLE =====
    function Particle(x, y, color, speed, angle, life) {
        this.x = x;
        this.y = y;
        this.color = color;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = life || 0.6;
        this.maxLife = this.life;
        this.radius = 2 + Math.random() * 3;
    }

    Particle.prototype.update = function(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.96;
        this.vy *= 0.96;
        this.life -= dt;
    };

    Particle.prototype.alpha = function() {
        return Math.max(0, this.life / this.maxLife);
    };

    // ===== FLOATING TEXT =====
    function FloatingText(x, y, text, color) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color || '#FFD700';
        this.life = 1.0;
        this.maxLife = 1.0;
    }

    FloatingText.prototype.update = function(dt) {
        this.y -= 40 * dt;
        this.life -= dt;
    };

    FloatingText.prototype.alpha = function() {
        return Math.max(0, this.life / this.maxLife);
    };

    // ===== PARTICLE SYSTEM =====
    var particles = [];
    var floatingTexts = [];

    function spawnParticles(x, y, color, count) {
        for (var i = 0; i < count; i++) {
            var angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
            var speed = 80 + Math.random() * 160;
            particles.push(new Particle(x, y, color, speed, angle, 0.4 + Math.random() * 0.3));
        }
    }

    function spawnFloatingText(x, y, text, color) {
        floatingTexts.push(new FloatingText(x, y, text, color));
    }

    function updateParticles(dt) {
        for (var i = particles.length - 1; i >= 0; i--) {
            particles[i].update(dt);
            if (particles[i].life <= 0) particles.splice(i, 1);
        }
        for (var j = floatingTexts.length - 1; j >= 0; j--) {
            floatingTexts[j].update(dt);
            if (floatingTexts[j].life <= 0) floatingTexts.splice(j, 1);
        }
    }

    function clearParticles() {
        particles.length = 0;
        floatingTexts.length = 0;
    }

    // ===== PHYSICS =====

    // Circle vs rectangle collision
    function circleRectCollision(cx, cy, cr, rx, ry, rw, rh) {
        var nearestX = Math.max(rx, Math.min(cx, rx + rw));
        var nearestY = Math.max(ry, Math.min(cy, ry + rh));
        var dx = cx - nearestX;
        var dy = cy - nearestY;
        return (dx * dx + dy * dy) < (cr * cr);
    }

    // Get collision normal for circle vs rect
    function circleRectNormal(cx, cy, cr, rx, ry, rw, rh) {
        var nearestX = Math.max(rx, Math.min(cx, rx + rw));
        var nearestY = Math.max(ry, Math.min(cy, ry + rh));
        var dx = cx - nearestX;
        var dy = cy - nearestY;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return { x: 0, y: -1 };
        return { x: dx / dist, y: dy / dist };
    }

    // Circle vs circle collision
    function circleCircleCollision(ax, ay, ar, bx, by, br) {
        var dx = bx - ax;
        var dy = by - ay;
        var dist = Math.sqrt(dx * dx + dy * dy);
        return dist < (ar + br);
    }

    // Resolve ball vs walls (fieldBottom is absolute Y of the bottom boundary)
    function resolveWalls(ball, fieldW, fieldTop, fieldBottom) {
        var bounced = false;
        // Left wall
        if (ball.x - ball.radius < 0) {
            ball.x = ball.radius;
            ball.vx = Math.abs(ball.vx);
            bounced = true;
        }
        // Right wall
        if (ball.x + ball.radius > fieldW) {
            ball.x = fieldW - ball.radius;
            ball.vx = -Math.abs(ball.vx);
            bounced = true;
        }
        // Top wall (ceiling)
        if (ball.y - ball.radius < fieldTop) {
            ball.y = fieldTop + ball.radius;
            ball.vy = Math.abs(ball.vy);
            bounced = true;
        }
        // Bottom - ball settles
        if (ball.y + ball.radius > fieldBottom) {
            ball.y = fieldBottom - ball.radius;
            ball.settle();
            bounced = true;
        }
        return bounced;
    }

    // Resolve ball vs block
    function resolveBallBlock(ball, block, critChance) {
        if (block.dead || !ball.active) return false;
        if (!circleRectCollision(ball.x, ball.y, ball.radius, block.x, block.y, block.w, block.h)) {
            return false;
        }
        // Get normal and reflect
        var n = circleRectNormal(ball.x, ball.y, ball.radius, block.x, block.y, block.w, block.h);
        var dot = ball.vx * n.x + ball.vy * n.y;
        ball.vx -= 2 * dot * n.x;
        ball.vy -= 2 * dot * n.y;
        // Push ball out
        ball.x += n.x * 2;
        ball.y += n.y * 2;

        // Damage block
        var dmg = ball.value;
        var isCrit = Math.random() < critChance;
        if (isCrit) dmg *= 2;
        block.hp -= dmg;
        block.flashTimer = 0.1;

        if (isCrit) {
            spawnFloatingText(block.x + block.w / 2, block.y, 'CRIT! -' + dmg, '#ff4444');
        }

        if (block.hp <= 0) {
            block.dead = true;
            spawnParticles(block.x + block.w / 2, block.y + block.h / 2,
                block.isBoss ? BM.BOSS_COLOR : '#e74c3c', CFG.PARTICLES_PER_BREAK);
            BM.Audio.play('blockBreak');
            return true; // destroyed
        } else {
            BM.Audio.play('blockHit');
        }
        return true; // hit
    }

    // Resolve ball vs settled ball (merge check)
    function resolveBallBall(moving, settled, mergeBonus) {
        if (!moving.active || !settled.settled || settled.dead || moving.dead) return false;
        if (!circleCircleCollision(moving.x, moving.y, moving.radius, settled.x, settled.y, settled.radius)) {
            return false;
        }
        if (moving.value === settled.value) {
            // Merge!
            var superMerge = Math.random() < mergeBonus;
            var newVal = settled.value * 2;
            if (superMerge) newVal *= 2;

            settled.value = newVal;
            settled.flashTimer = 0.2;
            moving.dead = true;

            var color = BM.getBallColor(newVal).bg;
            spawnParticles(settled.x, settled.y, color, CFG.PARTICLES_PER_MERGE);
            spawnFloatingText(settled.x, settled.y - settled.radius - 5,
                superMerge ? '⭐ ' + newVal + '!' : '' + newVal, color);
            BM.Audio.play('merge');
            return newVal;
        } else {
            // Bounce off
            var dx = moving.x - settled.x;
            var dy = moving.y - settled.y;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) { dx = 0; dy = -1; dist = 1; }
            var nx = dx / dist;
            var ny = dy / dist;
            var dot = moving.vx * nx + moving.vy * ny;
            moving.vx -= 2 * dot * nx;
            moving.vy -= 2 * dot * ny;
            // Push out
            var overlap = (moving.radius + settled.radius) - dist;
            if (overlap > 0) {
                moving.x += nx * (overlap + 1);
                moving.y += ny * (overlap + 1);
            }
            BM.Audio.play('bounce');
            return false;
        }
    }

    // Simulate trajectory for aim preview (fieldBottom is absolute Y)
    function simulateTrajectory(startX, startY, vx, vy, fieldW, fieldTop, fieldBottom, blocks, steps) {
        var points = [];
        var x = startX, y = startY;
        var speed = Math.sqrt(vx * vx + vy * vy);
        var bounces = 0;
        var stepSize = 3;
        var maxSteps = steps || 300;

        for (var i = 0; i < maxSteps && bounces <= CFG.AIM_LINE_SIM_BOUNCES; i++) {
            x += (vx / speed) * stepSize;
            y += (vy / speed) * stepSize;
            points.push({ x: x, y: y });

            // Wall bounces
            if (x < 0 || x > fieldW) {
                vx = -vx;
                x = Math.max(0, Math.min(x, fieldW));
                bounces++;
            }
            if (y < fieldTop) {
                vy = -vy;
                y = fieldTop;
                bounces++;
            }

            // Block collision check
            var hitBlock = false;
            for (var b = 0; b < blocks.length; b++) {
                var bl = blocks[b];
                if (!bl.dead && circleRectCollision(x, y, 4, bl.x, bl.y, bl.w, bl.h)) {
                    hitBlock = true;
                    break;
                }
            }
            if (hitBlock) break;
            if (y > fieldBottom) break;
        }
        return points;
    }

    // ===== WAVE GENERATION =====
    function generateWaveRow(wave, cols) {
        var row = [];
        var numBlocks = CFG.BLOCKS_PER_ROW_MIN + Math.floor(Math.random() *
            (Math.min(cols, CFG.BLOCKS_PER_ROW_MAX) - CFG.BLOCKS_PER_ROW_MIN + 1));
        // Pick random columns
        var available = [];
        for (var c = 0; c < cols; c++) available.push(c);
        // Shuffle and pick
        for (var i = available.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = available[i]; available[i] = available[j]; available[j] = tmp;
        }
        var chosen = available.slice(0, numBlocks);
        var hp = Math.ceil(CFG.BASE_BLOCK_HP * Math.pow(CFG.HP_SCALE_PER_WAVE, wave - 1));

        chosen.forEach(function(col) {
            var blockHp = hp + Math.floor(Math.random() * Math.ceil(hp * 0.3));
            row.push(new Block(col, 0, blockHp, false));
        });
        return row;
    }

    function generateBossRow(wave, cols) {
        // Boss spans 2 columns in the center
        var centerCol = Math.floor(cols / 2) - 1;
        var hp = Math.ceil(CFG.BASE_BLOCK_HP * Math.pow(CFG.HP_SCALE_PER_WAVE, wave - 1) * CFG.BOSS_HP_MULT);
        var boss = new Block(centerCol, 0, hp, true);
        boss.colSpan = Math.min(2, cols);
        return [boss];
    }

    // ===== PUBLIC API =====
    BM.Engine = {
        Ball: Ball,
        Block: Block,
        Particle: Particle,
        FloatingText: FloatingText,
        particles: particles,
        floatingTexts: floatingTexts,
        spawnParticles: spawnParticles,
        spawnFloatingText: spawnFloatingText,
        updateParticles: updateParticles,
        clearParticles: clearParticles,
        resolveWalls: resolveWalls,
        resolveBallBlock: resolveBallBlock,
        resolveBallBall: resolveBallBall,
        simulateTrajectory: simulateTrajectory,
        generateWaveRow: generateWaveRow,
        generateBossRow: generateBossRow,
        circleRectCollision: circleRectCollision,
    };

})(window.BM);
