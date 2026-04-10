/* ant.js - Ant entity: AI movement, wall/line collision, rendering */
'use strict';

const AntSystem = (() => {
    // Ant drawing - detailed top-down ant
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

        // Petiole (thin waist between thorax and abdomen)
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

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s * 0.42, -s * 0.08, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.arc(s * 0.42, s * 0.08, s * 0.05, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(s * 0.44, -s * 0.08, s * 0.025, 0, Math.PI * 2);
        ctx.fill();
        ctx.arc(s * 0.44, s * 0.08, s * 0.025, 0, Math.PI * 2);
        ctx.fill();

        // Antennae
        ctx.strokeStyle = legColor;
        ctx.lineWidth = Math.max(1, s * 0.06);
        const antennaSwing = Math.sin(legPhase * 0.7) * s * 0.08;
        // Left antenna
        ctx.beginPath();
        ctx.moveTo(s * 0.42, -s * 0.12);
        ctx.quadraticCurveTo(s * 0.6, -s * 0.3 + antennaSwing, s * 0.7, -s * 0.35 + antennaSwing);
        ctx.stroke();
        // Right antenna
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

    function createAnt(def, playArea, dpr) {
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
            stuckTimer: 0,
            hitCooldown: 0,
            reachedGoals: [],
        };
    }

    function updateAnt(ant, dt, playArea, lines, obstacles, goals, dpr) {
        const area = playArea;
        const size = CONFIG.ANT_SIZE * dpr;

        // Walk cycle animation
        ant.walkCycle += ant.speed * 0.5;

        // Ramp up speed
        ant.speed += (ant.targetSpeed - ant.speed) * 0.05;

        // Wandering behavior
        if (Math.random() < CONFIG.ANT_WANDER_CHANGE) {
            ant.wanderAngle += (Math.random() - 0.5) * 0.8;
        }
        ant.wanderAngle *= 0.98; // dampen
        ant.angle += ant.wanderAngle * dt;

        // Move forward
        const vx = Math.cos(ant.angle) * ant.speed;
        const vy = Math.sin(ant.angle) * ant.speed;
        let nx = ant.cx + vx;
        let ny = ant.cy + vy;

        // Collision cooldown
        if (ant.hitCooldown > 0) ant.hitCooldown -= dt;

        // Wall collision (play area bounds)
        let bounced = false;
        const margin = size * 0.8;
        if (nx - margin < area.x) { ant.angle = Math.PI - ant.angle + (Math.random() - 0.5) * 0.5; bounced = true; nx = area.x + margin; }
        if (nx + margin > area.x + area.w) { ant.angle = Math.PI - ant.angle + (Math.random() - 0.5) * 0.5; bounced = true; nx = area.x + area.w - margin; }
        if (ny - margin < area.y) { ant.angle = -ant.angle + (Math.random() - 0.5) * 0.5; bounced = true; ny = area.y + margin; }
        if (ny + margin > area.y + area.h) { ant.angle = -ant.angle + (Math.random() - 0.5) * 0.5; bounced = true; ny = area.y + area.h - margin; }

        // Obstacle collision
        for (const obs of obstacles) {
            const op = Renderer.toCanvas(obs.x, obs.y);
            const ow = obs.w * area.w;
            const oh = obs.h * area.h;
            if (nx + margin > op.x && nx - margin < op.x + ow &&
                ny + margin > op.y && ny - margin < op.y + oh) {
                // Push out and bounce
                const cx = op.x + ow / 2;
                const cy = op.y + oh / 2;
                const dx = nx - cx;
                const dy = ny - cy;
                ant.angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.5;
                nx = ant.cx;
                ny = ant.cy;
                bounced = true;
            }
        }

        // Pencil line collision
        if (ant.hitCooldown <= 0) {
            for (const line of lines) {
                if (line.fading && line.opacity < 0.3) continue;
                for (let i = 1; i < line.points.length; i++) {
                    const p1 = line.points[i - 1];
                    const p2 = line.points[i];
                    const dist = pointToSegmentDist(nx, ny, p1.x, p1.y, p2.x, p2.y);
                    if (dist < margin + CONFIG.PENCIL_WIDTH * dpr) {
                        // Bounce off the line
                        const segAngle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
                        const normal = segAngle + Math.PI / 2;
                        const dot = Math.cos(ant.angle - normal);
                        if (dot < 0) {
                            ant.angle = 2 * normal - ant.angle + (Math.random() - 0.5) * 0.4;
                        } else {
                            ant.angle = 2 * (normal + Math.PI) - ant.angle + (Math.random() - 0.5) * 0.4;
                        }
                        nx = ant.cx;
                        ny = ant.cy;
                        bounced = true;
                        ant.hitCooldown = 0.15;
                        Audio.SFX.antBounce();
                        break;
                    }
                }
                if (bounced) break;
            }
        }

        ant.cx = nx;
        ant.cy = ny;

        if (bounced) {
            ant.wanderAngle = 0;
            Audio.vibrate(10);
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

        return { bounced, collected };
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

    return { createAnt, updateAnt, drawAnt };
})();
