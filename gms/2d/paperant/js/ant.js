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
            // Anti-stuck tracking (rolling net-displacement window)
            stuckTimer: 0,
            stuckCheckX: pos.x,
            stuckCheckY: pos.y,
        };
    }

    // === PHYSICS ===

    /**
     * Reflect a velocity-direction angle across a surface with the given
     * outward normal. Uses the vector formula v' = v - 2(v·n)n, which is
     * the correct reflection; the previous `2*normal - angle` version
     * reflected across the TANGENT, which leaves the ant heading back
     * into the wall and causes wiggle-stuck behavior.
     */
    function reflectAngle(inAngle, normalAngle) {
        const vx = Math.cos(inAngle);
        const vy = Math.sin(inAngle);
        const nx = Math.cos(normalAngle);
        const ny = Math.sin(normalAngle);
        const dot = vx * nx + vy * ny;
        // Only reflect if actually heading into the surface
        if (dot >= 0) return inAngle;
        const rx = vx - 2 * dot * nx;
        const ry = vy - 2 * dot * ny;
        const jitter = (Math.random() - 0.5) * 0.3;
        return Math.atan2(ry, rx) + jitter;
    }

    /**
     * Bounce angle for pencil lines: random direction in the away-hemisphere.
     * The ant picks a random angle within ±70° of the surface normal,
     * guaranteeing it always moves meaningfully AWAY from the line.
     * This prevents the wiggle-stuck problem of shallow reflections.
     */
    function bounceAwayAngle(normalAngle) {
        // Random angle within ±70° of the normal (140° cone away from line)
        const spread = (Math.random() - 0.5) * (Math.PI * 0.78); // ±70°
        return normalAngle + spread;
    }

    /**
     * Get the normal angle of a line segment pointing away from the ant's approach side.
     */
    function getSegmentNormal(ax, ay, bx, by, antAngle) {
        const segAngle = Math.atan2(by - ay, bx - ax);
        const normal1 = segAngle + Math.PI / 2;
        const normal2 = segAngle - Math.PI / 2;
        // Pick the normal that faces against the ant's travel direction
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

        // Ramp up speed (frame-rate independent)
        ant.speed += (ant.targetSpeed - ant.speed) * (1 - Math.pow(0.95, dt * 60));

        // Gentle wandering - framerate-independent
        if (Math.random() < CONFIG.ANT_WANDER_CHANGE * dt * 60) {
            ant.wanderAngle += (Math.random() - 0.5) * CONFIG.ANT_WANDER_STRENGTH;
        }
        ant.wanderAngle *= Math.pow(0.97, dt * 60);
        ant.angle += ant.wanderAngle * dt;

        // Move forward (dt * 60 keeps speed values tuned for 60 fps while
        // making movement frame-rate independent — fixes ants speeding up on
        // high-refresh-rate displays, e.g. 120 Hz ProMotion when touching)
        const vx = Math.cos(ant.angle) * ant.speed * dt * 60;
        const vy = Math.sin(ant.angle) * ant.speed * dt * 60;
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
            // Random bounce AWAY from the line (not reflection — avoids wiggle-stuck)
            ant.angle = bounceAwayAngle(closestNormalAngle);
            // Push ant well clear of the line along the normal direction
            const pushDist = lineThreshold - closestDist + 4 * dpr;
            nx += closestNx * pushDist;
            ny += closestNy * pushDist;
            // Kill any wander momentum so the bounce direction sticks
            ant.wanderAngle = 0;
            bounced = true;
            bouncedOnLine = true;
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

        // Anti-stuck detection: check net displacement over a rolling window.
        // Per-frame checks miss "wiggle stuck" (jitter moves ant a few px each
        // frame while it's pinned against a wall/line). Instead compare the
        // ant's position every ~0.4s against where it was at the last check.
        ant.stuckTimer += dt;
        if (ant.stuckTimer >= 0.4) {
            const netMoved = Math.hypot(ant.cx - ant.stuckCheckX, ant.cy - ant.stuckCheckY);
            // Expected travel at this speed over 0.4s @ ~60fps is speed*24 px.
            // Anything below ~25% of that is "stuck".
            if (netMoved < ant.speed * 6) {
                // Escape: aim toward center of play area and teleport a bit.
                const centerX = area.x + area.w / 2;
                const centerY = area.y + area.h / 2;
                const toCenter = Math.atan2(centerY - ant.cy, centerX - ant.cx);
                ant.angle = toCenter + (Math.random() - 0.5) * 0.6;
                const jumpDist = size * 1.5;
                ant.cx += Math.cos(toCenter) * jumpDist;
                ant.cy += Math.sin(toCenter) * jumpDist;
                // Re-clamp after teleport
                ant.cx = Math.max(area.x + margin, Math.min(area.x + area.w - margin, ant.cx));
                ant.cy = Math.max(area.y + margin, Math.min(area.y + area.h - margin, ant.cy));
                ant.wanderAngle = 0;
            }
            ant.stuckTimer = 0;
            ant.stuckCheckX = ant.cx;
            ant.stuckCheckY = ant.cy;
        }

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
