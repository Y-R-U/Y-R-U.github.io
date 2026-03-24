// Kraken boss - procedurally generated sea monster
// Separate file for easy iteration on appearance

export class Kraken {
    constructor(x, y, level) {
        this.x = x;
        this.y = y;
        this.level = level;
        this.angle = 0;

        const scaling = 1 + (level - 1) * 0.3;
        this.maxHp = Math.round(750 * scaling);
        this.hp = this.maxHp;
        this.cannonDamage = Math.round(35 * scaling);
        this.maxSpeed = 35;
        this.speed = 0;
        this.goldReward = Math.round(1200 * scaling);
        this.cannonFireRate = 0.8;
        this.cannonRange = 350;
        this.hitRadius = 70;
        this.cannonCooldown = 2 + Math.random() * 2;
        this.scale = 2.0;
        this.isBoss = true;
        this.isKraken = true;
        this.glowColor = '#22ffaa';

        // Healing - 3 heals
        this.healsUsed = 0;
        this.maxHeals = 3;
        this.healThresholds = [0.75, 0.5, 0.25];
        this._justHealed = 0;

        // Red eye mode - explosive shots
        this.redEyeMode = false;
        this.redEyeTimer = 8 + Math.random() * 5;
        this.redEyeDuration = 0; // How long red eye lasts

        // Tentacle animation
        this.tentacles = [];
        for (let i = 0; i < 8; i++) {
            this.tentacles.push({
                baseAngle: (Math.PI * 2 / 8) * i,
                phase: Math.random() * Math.PI * 2,
                length: 60 + Math.random() * 20,
                width: 8 + Math.random() * 4,
                segments: 5 + Math.floor(Math.random() * 3)
            });
        }

        // Body pulse
        this.pulsePhase = 0;
        this.eyeGlow = 0;

        // AI
        this.aiState = 'chase';
        this.strafeDir = Math.random() < 0.5 ? 1 : -1;
        this.spawnX = x;
        this.spawnY = y;
        this.aggroRange = 800;
        this.leashRange = 99999; // Never leash
        this.alive = true;

        // Ink attack timer
        this.inkTimer = 5 + Math.random() * 3;

        // Tentacle slam attack
        this.slamTimer = 8 + Math.random() * 4;
        this.slamming = false;
        this.slamProgress = 0;
    }

    takeDamage(amount) {
        const dmg = Math.max(1, amount);
        this.hp -= dmg;

        // Healing: check if HP dropped below a threshold
        if (this.healsUsed < this.maxHeals) {
            const nextThreshold = this.healThresholds[this.healsUsed];
            if (nextThreshold !== undefined && (this.hp / this.maxHp) <= nextThreshold) {
                this.healsUsed++;
                const healAmount = Math.round(this.maxHp * 0.25);
                this.hp = Math.min(this.maxHp, this.hp + healAmount);
                this._justHealed = 2.0;
            }
        }

        if (this.hp <= 0) this.alive = false;
        return dmg;
    }

    update(dt, playerX, playerY) {
        if (!this.alive) return;

        this.pulsePhase += dt * 2;
        this.eyeGlow = 0.6 + 0.4 * Math.sin(this.pulsePhase * 1.5);

        // Heal text decay
        if (this._justHealed > 0) this._justHealed -= dt;

        // Red eye mode timer
        if (this.redEyeMode) {
            this.redEyeDuration -= dt;
            if (this.redEyeDuration <= 0) {
                this.redEyeMode = false;
                this.redEyeTimer = 8 + Math.random() * 5;
            }
        } else {
            this.redEyeTimer -= dt;
            if (this.redEyeTimer <= 0) {
                this.redEyeMode = true;
                this.redEyeDuration = 4 + Math.random() * 2; // Red eye lasts 4-6 seconds
            }
        }

        // Tentacle slam
        if (this.slamming) {
            this.slamProgress += dt * 2;
            if (this.slamProgress >= 1) {
                this.slamming = false;
                this.slamProgress = 0;
            }
        }

        this.slamTimer -= dt;
        if (this.slamTimer <= 0 && !this.slamming) {
            this.slamming = true;
            this.slamProgress = 0;
            this.slamTimer = 6 + Math.random() * 4;
        }

        this.inkTimer -= dt;

        // Simple chase AI
        const dx = playerX - this.x;
        const dy = playerY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const targetAngle = Math.atan2(dy, dx);

        if (dist > this.cannonRange * 0.6) {
            // Move toward player
            let diff = targetAngle - this.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            this.angle += Math.sign(diff) * Math.min(Math.abs(diff), 1.2 * dt);
            this.speed = this.maxSpeed;
        } else {
            // Circle strafe
            const strafeAngle = targetAngle + (Math.PI / 2) * this.strafeDir;
            let diff = strafeAngle - this.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            this.angle += Math.sign(diff) * Math.min(Math.abs(diff), 1.0 * dt);
            this.speed = this.maxSpeed * 0.5;

            if (Math.random() < dt * 0.2) this.strafeDir *= -1;
        }

        this.x += Math.cos(this.angle) * this.speed * dt;
        this.y += Math.sin(this.angle) * this.speed * dt;

        if (this.cannonCooldown > 0) this.cannonCooldown -= dt;
    }

    // Check if ink attack is ready (game.js will handle spawning ink projectiles)
    shouldInkAttack() {
        if (this.inkTimer <= 0) {
            this.inkTimer = 4 + Math.random() * 3;
            return true;
        }
        return false;
    }

    draw(ctx, camX, camY, viewW, viewH, assets, time) {
        const sx = this.x - camX + viewW / 2;
        const sy = this.y - camY + viewH / 2;

        if (sx < -150 || sx > viewW + 150 || sy < -150 || sy > viewH + 150) return;

        ctx.save();

        // Underwater shadow
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.ellipse(sx + 5, sy + 5, 80, 60, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        // Glow effect
        const glowPulse = 0.3 + 0.2 * Math.sin(time * 2);
        ctx.save();
        ctx.globalAlpha = glowPulse;
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = 40;
        ctx.beginPath();
        ctx.arc(sx, sy, this.hitRadius + 20, 0, Math.PI * 2);
        ctx.fillStyle = this.glowColor;
        ctx.fill();
        ctx.restore();

        // Draw tentacles
        this._drawTentacles(ctx, sx, sy, time);

        // Draw body
        this._drawBody(ctx, sx, sy, time);

        // Draw eyes
        this._drawEyes(ctx, sx, sy, time);

        ctx.restore();

        // HP bar
        if (this.hp < this.maxHp) {
            const barW = 80;
            const barH = 6;
            const bx = sx - barW / 2;
            const by = sy - this.hitRadius - 20;
            const hpRatio = this.hp / this.maxHp;

            ctx.fillStyle = '#333';
            ctx.fillRect(bx, by, barW, barH);
            ctx.fillStyle = hpRatio > 0.5 ? '#44aa22' : hpRatio > 0.25 ? '#ccaa22' : '#cc2222';
            ctx.fillRect(bx, by, barW * hpRatio, barH);
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 1;
            ctx.strokeRect(bx, by, barW, barH);

            // Boss name
            ctx.font = 'bold 14px "Pirata One", Georgia, serif';
            ctx.fillStyle = '#ff4444';
            ctx.textAlign = 'center';
            ctx.fillText('THE KRAKEN', sx, by - 6);
        }
    }

    _drawTentacles(ctx, sx, sy, time) {
        for (const t of this.tentacles) {
            ctx.save();
            ctx.translate(sx, sy);

            const baseAngle = t.baseAngle + this.angle;
            const waveSpeed = 2 + Math.sin(t.phase) * 0.5;

            // Slam effect
            let slamStretch = 1;
            if (this.slamming) {
                const slamWave = Math.sin(this.slamProgress * Math.PI);
                slamStretch = 1 + slamWave * 0.5;
            }

            ctx.beginPath();
            let prevX = Math.cos(baseAngle) * 30;
            let prevY = Math.sin(baseAngle) * 30;
            ctx.moveTo(prevX, prevY);

            for (let s = 1; s <= t.segments; s++) {
                const frac = s / t.segments;
                const wave = Math.sin(time * waveSpeed + t.phase + frac * 3) * 15 * frac;
                const segLen = (t.length * slamStretch / t.segments);
                const perpAngle = baseAngle + Math.PI / 2;

                prevX += Math.cos(baseAngle) * segLen + Math.cos(perpAngle) * wave;
                prevY += Math.sin(baseAngle) * segLen + Math.sin(perpAngle) * wave;

                ctx.lineTo(prevX, prevY);
            }

            ctx.strokeStyle = '#2a5a3a';
            ctx.lineWidth = t.width * (1 - 0.3);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Sucker dots
            ctx.strokeStyle = '#1a4a2a';
            ctx.lineWidth = t.width * 1.2;
            ctx.globalAlpha = 0.3;
            ctx.stroke();
            ctx.globalAlpha = 1;

            ctx.restore();
        }
    }

    _drawBody(ctx, sx, sy, time) {
        const pulse = 1 + 0.05 * Math.sin(time * 2);
        const bodyW = 50 * pulse;
        const bodyH = 38 * pulse;

        ctx.save();
        ctx.translate(sx, sy);

        // Clip to only show top half of head (half-submerged effect)
        // The waterline sits at the eye level, so we show from top down to just below eyes
        ctx.save();
        ctx.beginPath();
        ctx.rect(-bodyW - 10, -bodyH - 10, (bodyW + 10) * 2, bodyH + 14); // Show top portion only
        ctx.clip();

        // Main body dome - top half of head
        const grad = ctx.createRadialGradient(0, -8, 5, 0, -5, bodyW);
        grad.addColorStop(0, '#3a8a4a');
        grad.addColorStop(0.4, '#2a6a3a');
        grad.addColorStop(0.8, '#1a4a2a');
        grad.addColorStop(1, '#0a3a1a');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, bodyW, bodyH, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head ridges / texture bumps (only on top portion)
        for (let i = 0; i < 8; i++) {
            const bx = Math.cos(i * 0.85 + time * 0.2) * bodyW * 0.55;
            const by = Math.sin(i * 1.1 + time * 0.15) * bodyH * 0.35 - 8;
            ctx.fillStyle = '#4a9a5a';
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.arc(bx, by, 4 + Math.sin(time + i) * 1.5, 0, Math.PI * 2);
            ctx.fill();
        }

        // Brow ridge above eyes
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#1a3a1a';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-30, -14);
        ctx.quadraticCurveTo(-18, -20, -8, -16);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(30, -14);
        ctx.quadraticCurveTo(18, -20, 8, -16);
        ctx.stroke();

        ctx.globalAlpha = 1;
        ctx.restore(); // Remove clipping

        // Water line effect - waves at the submerged edge
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = '#4488aa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = -bodyW; i <= bodyW; i += 3) {
            const waveY = 4 + Math.sin(time * 2.5 + i * 0.15) * 2;
            // Only draw waterline where it intersects the body ellipse
            const xRatio = i / bodyW;
            if (Math.abs(xRatio) < 0.95) {
                if (i === -bodyW + 3 || Math.abs(xRatio) >= 0.92) {
                    ctx.moveTo(i, waveY);
                } else {
                    ctx.lineTo(i, waveY);
                }
            }
        }
        ctx.stroke();

        // Foam/splash at waterline
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = '#88ccdd';
        for (let i = 0; i < 6; i++) {
            const fx = Math.cos(i * 1.2 + time * 1.5) * bodyW * 0.7;
            const fy = 3 + Math.sin(time * 3 + i * 2) * 2;
            ctx.beginPath();
            ctx.arc(fx, fy, 3 + Math.sin(time * 2 + i) * 1, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;
        ctx.restore();
    }

    _drawEyes(ctx, sx, sy, time) {
        // Eyes sit just above the waterline - prominent and menacing
        const eyeOffsets = [[-18, -8], [18, -8]];
        const isRed = this.redEyeMode;
        const eyeColor = isRed ? '#ff0000' : '#aaffaa';
        const glowColor = isRed ? '#ff2200' : '#00ff44';

        for (const [ox, oy] of eyeOffsets) {
            ctx.save();
            ctx.translate(sx + ox, sy + oy);

            // Eye white/red
            ctx.fillStyle = eyeColor;
            ctx.beginPath();
            ctx.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            // Pupil - follows a pattern
            const pupilX = Math.sin(time * 0.7) * 3;
            const pupilY = Math.cos(time * 0.5) * 2;
            ctx.fillStyle = isRed ? '#330000' : '#000';
            ctx.beginPath();
            ctx.ellipse(pupilX, pupilY, 5, 6, 0, 0, Math.PI * 2);
            ctx.fill();

            // Eye glow
            ctx.globalAlpha = isRed ? 0.6 + 0.4 * Math.sin(time * 6) : this.eyeGlow * 0.3;
            ctx.shadowColor = glowColor;
            ctx.shadowBlur = isRed ? 25 : 15;
            ctx.fillStyle = glowColor;
            ctx.beginPath();
            ctx.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    // Serialize for save/load
    serialize() {
        return {
            x: this.x, y: this.y, angle: this.angle,
            speed: this.speed, hp: this.hp, level: this.level,
            aiState: this.aiState, spawnX: this.spawnX, spawnY: this.spawnY,
            cannonCooldown: this.cannonCooldown, strafeDir: this.strafeDir,
            slamTimer: this.slamTimer, inkTimer: this.inkTimer,
            healsUsed: this.healsUsed, redEyeMode: this.redEyeMode,
            redEyeTimer: this.redEyeTimer, redEyeDuration: this.redEyeDuration,
            isKraken: true
        };
    }

    static deserialize(data) {
        const k = new Kraken(data.x, data.y, data.level);
        k.angle = data.angle;
        k.speed = data.speed;
        k.hp = data.hp;
        k.aiState = data.aiState;
        k.spawnX = data.spawnX;
        k.spawnY = data.spawnY;
        k.cannonCooldown = data.cannonCooldown;
        k.strafeDir = data.strafeDir;
        k.slamTimer = data.slamTimer || 8;
        k.inkTimer = data.inkTimer || 5;
        k.healsUsed = data.healsUsed || 0;
        k.redEyeMode = data.redEyeMode || false;
        k.redEyeTimer = data.redEyeTimer || 8;
        k.redEyeDuration = data.redEyeDuration || 0;
        return k;
    }

    drawOnMinimap(ctx, playerX, playerY, size) {
        const scale = 0.02;
        const halfSize = size / 2;
        const ex = (this.x - playerX) * scale + halfSize;
        const ey = (this.y - playerY) * scale + halfSize;
        if (ex < 0 || ex > size || ey < 0 || ey > size) return;

        ctx.fillStyle = '#00ff44';
        ctx.beginPath();
        ctx.arc(ex, ey, 5, 0, Math.PI * 2);
        ctx.fill();
    }
}
