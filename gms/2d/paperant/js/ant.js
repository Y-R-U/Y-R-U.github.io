/* ant.js - Ant entity: reflection-based physics, wall/line collision, rendering */
'use strict';

const AntSystem = (() => {

    // === RENDERING ===

    function drawAnt(ctx, ant, dpr) {
        const s = CONFIG.ANT_SIZE * dpr;
        ctx.save();
        ctx.translate(ant.cx, ant.cy);
        ctx.rotate(ant.angle);

        const bodyColor = '#2c1810';
        const legColor = '#3d2517';
        const headColor = '#1a0e08';

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.ellipse(2, 2, s * 0.95, s * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        // Legs (3 pairs) - animated walk
        const legPhase = ant.walkCycle || 0;
        ctx.strokeStyle = legColor;
        ctx.lineWidth = Math.max(1.5, s * 0.08);
        ctx.lineCap = 'round';

        const legPairs = [
            { bx: -s * 0.25, spread: s * 0.55, swing: 0 },
            { bx: 0, spread: s * 0.6, swing: Math.PI / 3 },
            { bx: s * 0.25, spread: s * 0.5, swing: (2 * Math.PI) / 3 },
        ];

        for (const leg of legPairs) {
            const swingAmt = Math.sin(legPhase + leg.swing) * s * 0.12;
            // Left leg
            ctx.beginPath();
            ctx.moveTo(leg.bx, -s * 0.15);
            ctx.quadraticCurveTo(leg.bx - s * 0.15, -leg.spread * 0.6 + swingAmt, leg.bx + swingAmt * 0.5, -leg.spread + swingAmt);
            ctx.stroke();
            // Right leg
            ctx.beginPath();
            ctx.moveTo(leg.bx, s * 0.15);
            ctx.quadraticCurveTo(leg.bx - s * 0.15, leg.spread * 0.6 - swingAmt, leg.bx - swingAmt * 0.5, leg.spread - swingAmt);
            ctx.stroke();
        }

        // Abdomen (rear segment - largest)
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(-s * 0.38, 0, s * 0.32, s * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        // Abdomen shine
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.ellipse(-s * 0.42, -s * 0.06, s * 0.12, s * 0.08, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Thorax (middle segment)
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.2, s * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();

        // Petiole (thin waist)
        ctx.fillStyle = bodyColor;
        ctx.beginPath();
        ctx.ellipse(-s * 0.15, 0, s * 0.06, s * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.fillStyle = headColor;
        ctx.beginPath();
        ctx.ellipse(s * 0.32, 0, s * 0.2, s * 0.17, 0, 0, Math.PI * 2);
        ctx.fill();
        // Head shine
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.ellipse(s * 0.35, -s * 0.04, s * 0.08, s * 0.06, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Eyes (separate beginPath for each so they don't share a path)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s * 0.42, -s * 0.08, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.42, s * 0.08, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
        // Pupils
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(s * 0.44, -s * 0.08, s * 0.025, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(s * 0.44, s * 0.08, s * 0.025, 0, Math.PI * 2);
        ctx.fill();

        // Antennae
        ctx.strokeStyle = legColor;
        ctx.lineWidth = Math.max(1, s * 0.06);
        const antennaSwing = Math.sin(legPhase * 0.7) * s * 0.08;
        ctx.beginPath();
        ctx.moveTo(s * 0.42, -s * 0.12);
        ctx.quadraticCurveTo(s * 0.6, -s * 0.3 + antennaSwing, s * 0.7, -s * 0.35 + antennaSwing);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 0.42, s * 0.12);
        ctx.quadraticCurveTo(s * 0.6, s * 0.3 - antennaSwing, s * 0.7, s * 0.35 - antennaSwing);
        ctx.stroke();

        // Mandibles
        ctx.lineWidth = Math.max(1, s * 0.05);
        ctx.strokeStyle = '#4a2a15';
        const mandSwing = Math.sin(legPhase * 1.5) * s * 0.03;
        ctx.beginPath();
        ctx.moveTo(s * 0.48, -s * 0.06);
        ctx.lineTo(s * 0.56, -s * 0.02 + mandSwing);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s * 0.48, s * 0.06);
        ctx.lineTo(s * 0.56, s * 0.02 - mandSwing);
        ctx.stroke();

        ctx.restore();
    }

    // === CREATION ===

    function createAnt(def, dpr) {
        const pos = Renderer.toCanvas(def.x, def.y);
        return {
            cx: pos.x,
            cy: pos.y,
            angle: def.angle || 0,
            speed: 0,
            targetSpeed: (def.speed || CONFIG.ANT_SPEED) * dpr,
            baseSpeed: (def.speed || CONFIG.ANT_SPEED) * dpr,
            wanderAngle: 0,
            walkCycle: Math.random() * Math.PI * 2,
            sfxCooldown: 0,
            reachedGoals: [],
            // Anti-stuck tracking
            prevX: pos.x,
            prevY: pos.y,
            stuckFrames: 0,
        };
    }

    // === PHYSICS ===

    /**
     * Reflect angle off a surface normal.
     * Returns the reflected angle with small controlled randomness.
     */
    function reflectAngle(inAngle, normalAngle) {
        // Reflection: out = 2*normal - in + PI
        // Standard reflection formula for angle of incidence = angle of reflection
        const reflected = 2 * normalAngle - inAngle;
        const jitter = (Math.random() - 0.5) * CONFIG.ANT_BOUNCE_RANDOMNESS * 2;
        return reflected + jitter;
    }

    /**
     * Get the normal angle of a line segment (always pointing away from the ant's approach).
     */
    function getSegmentNormal(ax, ay, bx, by, antAngle) {
        const segAngle = Math.atan2(by - ay, bx - ax);
        const normal1 = segAngle + Math.PI / 2;
        const normal2 = segAngle - Math.PI / 2;
        // Pick the normal that faces against the ant's direction
        const dot1 = Math.cos(antAngle - normal1);
        return dot1 < 0 ? normal1 : normal2;
    }

    function pointToSegmentDist(px, py, ax, ay, bx, by) {
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.hypot(px - ax, py - ay);
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    /**
     * Find closest point on segment (ax,ay)-(bx,by) to point (px,py).
     * Returns {x, y, t} where t is parametric position along segment.
     */
    function closestPointOnSegment(px, py, ax, ay, bx, by) {
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return { x: ax, y: ay, t: 0 };
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return { x: ax + t * dx, y: ay + t * dy, t };
    }

    // === UPDATE ===

    function updateAnt(ant, dt, playArea, lines, obstacles, goals, dpr) {
        const area = playArea;
        const size = CONFIG.ANT_SIZE * dpr;
        const margin = size * 0.8;

        // Walk cycle animation
        ant.walkCycle += ant.speed * 0.5;

        // Ramp up speed
        ant.speed += (ant.targetSpeed - ant.speed) * 0.05;

        // Gentle wandering - framerate-independent
        if (Math.random() < CONFIG.ANT_WANDER_CHANGE * dt * 60) {
            ant.wanderAngle += (Math.random() - 0.5) * CONFIG.ANT_WANDER_STRENGTH;
        }
        ant.wanderAngle *= Math.pow(0.97, dt * 60);
        ant.angle += ant.wanderAngle * dt;

        // Move forward
        const vx = Math.cos(ant.angle) * ant.speed;
        const vy = Math.sin(ant.angle) * ant.speed;
        let nx = ant.cx + vx;
        let ny = ant.cy + vy;

        // SFX cooldown (only prevents audio spam, NOT collision detection)
        if (ant.sfxCooldown > 0) ant.sfxCooldown -= dt;

        let bounced = false;
        let bouncedOnLine = false;

        // Wall collision (play area bounds) - proper reflection
        if (nx - margin < area.x) {
            ant.angle = reflectAngle(ant.angle, 0);
            nx = area.x + margin;
            bounced = true;
        } else if (nx + margin > area.x + area.w) {
            ant.angle = reflectAngle(ant.angle, Math.PI);
            nx = area.x + area.w - margin;
            bounced = true;
        }
        if (ny - margin < area.y) {
            ant.angle = reflectAngle(ant.angle, Math.PI / 2);
            ny = area.y + margin;
            bounced = true;
        } else if (ny + margin > area.y + area.h) {
            ant.angle = reflectAngle(ant.angle, -Math.PI / 2);
            ny = area.y + area.h - margin;
            bounced = true;
        }

        // Obstacle collision - reflect off nearest edge
        for (const obs of obstacles) {
            const op = Renderer.toCanvas(obs.x, obs.y);
            const ow = obs.w * area.w;
            const oh = obs.h * area.h;
            if (nx + margin > op.x && nx - margin < op.x + ow &&
                ny + margin > op.y && ny - margin < op.y + oh) {
                const dLeft = Math.abs(nx - op.x);
                const dRight = Math.abs(nx - (op.x + ow));
                const dTop = Math.abs(ny - op.y);
                const dBottom = Math.abs(ny - (op.y + oh));
                const minD = Math.min(dLeft, dRight, dTop, dBottom);

                if (minD === dLeft) {
                    ant.angle = reflectAngle(ant.angle, Math.PI);
                    nx = op.x - margin;
                } else if (minD === dRight) {
                    ant.angle = reflectAngle(ant.angle, 0);
                    nx = op.x + ow + margin;
                } else if (minD === dTop) {
                    ant.angle = reflectAngle(ant.angle, -Math.PI / 2);
                    ny = op.y - margin;
                } else {
                    ant.angle = reflectAngle(ant.angle, Math.PI / 2);
                    ny = op.y + oh + margin;
                }
                bounced = true;
            }
        }

        // === Pencil line collision ===
        // ALWAYS checked (no cooldown skip) - lines are solid barriers.
        // On hit: reflect angle AND push ant out along the normal so it can't tunnel.
        const lineThreshold = margin + CONFIG.PENCIL_WIDTH * dpr;

        let closestDist = Infinity;
        let closestNormalAngle = 0;
        let closestNx = 0;  // normal direction x
        let closestNy = 0;  // normal direction y
        let hitLine = false;

        for (const line of lines) {
            if (line.fading && line.opacity < 0.3) continue;
            for (let i = 1; i < line.points.length; i++) {
                const p1 = line.points[i - 1];
                const p2 = line.points[i];
                const cp = closestPointOnSegment(nx, ny, p1.x, p1.y, p2.x, p2.y);
                const dx = nx - cp.x;
                const dy = ny - cp.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < lineThreshold && dist < closestDist) {
                    closestDist = dist;
                    closestNormalAngle = getSegmentNormal(p1.x, p1.y, p2.x, p2.y, ant.angle);
                    // Compute push-out direction: from closest point on segment toward ant
                    if (dist > 0.01) {
                        closestNx = dx / dist;
                        closestNy = dy / dist;
                    } else {
                        // Ant exactly on the line - use segment normal
                        closestNx = Math.cos(closestNormalAngle);
                        closestNy = Math.sin(closestNormalAngle);
                    }
                    hitLine = true;
                }
            }
        }

        if (hitLine) {
            // Reflect the ant's angle off the line
            ant.angle = reflectAngle(ant.angle, closestNormalAngle);
            // Push ant OUT along the normal so it's fully clear of the line
            const pushDist = lineThreshold - closestDist + 2 * dpr; // extra 2px clearance
            nx += closestNx * pushDist;
            ny += closestNy * pushDist;
            bounced = true;
            bouncedOnLine = true;
            // SFX only if cooldown expired (prevents audio spam, not collision)
            if (ant.sfxCooldown <= 0) {
                GameAudio.SFX.antBounce();
                ant.sfxCooldown = CONFIG.ANT_BOUNCE_COOLDOWN;
            }
        }

        // Clamp to play area after all pushes (safety net)
        nx = Math.max(area.x + margin, Math.min(area.x + area.w - margin, nx));
        ny = Math.max(area.y + margin, Math.min(area.y + area.h - margin, ny));

        ant.cx = nx;
        ant.cy = ny;

        // Anti-stuck detection
        const movedDist = Math.hypot(ant.cx - ant.prevX, ant.cy - ant.prevY);
        if (movedDist < 0.5 * dpr) {
            ant.stuckFrames++;
            if (ant.stuckFrames > CONFIG.ANT_STUCK_THRESHOLD) {
                // Force a random direction change to escape
                ant.angle += Math.PI * (0.5 + Math.random() * 0.5);
                ant.stuckFrames = 0;
            }
        } else {
            ant.stuckFrames = 0;
        }
        ant.prevX = ant.cx;
        ant.prevY = ant.cy;

        if (bounced) {
            ant.wanderAngle = 0;
            GameAudio.vibrate(10);
        }

        // Check goal collection
        let collected = null;
        for (const goal of goals) {
            if (goal.collected) continue;
            // Check order constraint
            if (goal.order) {
                const prevOrder = goal.order - 1;
                if (prevOrder > 0) {
                    const prevGoal = goals.find(g => g.order === prevOrder);
                    if (prevGoal && !prevGoal.collected) continue;
                }
            }
            const gp = Renderer.toCanvas(goal.x, goal.y);
            const dist = Math.hypot(ant.cx - gp.x, ant.cy - gp.y);
            if (dist < (CONFIG.GOAL_SIZE + CONFIG.ANT_SIZE) * dpr) {
                goal.collected = true;
                ant.reachedGoals.push(goal);
                collected = goal;
                break;
            }
        }

        return { bounced, bouncedOnLine, collected };
    }

    return { createAnt, updateAnt, drawAnt };
})();
