/* ===== BOUNCE MERGE ROGUELITE — RENDERER ===== */
(function(BM) {
    'use strict';

    var canvas, ctx;
    var W, H, dpr;
    var bgGrad = null;

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
    }

    function resize() {
        dpr = window.devicePixelRatio || 1;
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        // Rebuild background gradient
        bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#0a0a2e');
        bgGrad.addColorStop(1, '#050520');
    }

    function getSize() { return { w: W, h: H }; }

    function clear() {
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);
    }

    // ===== DANGER LINE =====
    function drawDangerLine(y) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 68, 68, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    // ===== LAUNCHER =====
    function drawLauncher(x, y, ballValue) {
        var colors = BM.getBallColor(ballValue);
        var r = BM.CFG.BALL_BASE_RADIUS + 2;
        // Glow
        ctx.save();
        ctx.shadowColor = colors.bg;
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = colors.bg;
        ctx.fill();
        ctx.restore();
        // Inner
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = colors.bg;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        // Value text
        ctx.fillStyle = colors.text;
        ctx.font = 'bold ' + (r * 0.85) + 'px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ballValue, x, y + 1);
    }

    // ===== AIM LINE =====
    function drawAimLine(points) {
        if (!points || points.length < 2) return;
        ctx.save();
        for (var i = 0; i < points.length; i++) {
            var alpha = 1 - (i / points.length) * 0.8;
            ctx.globalAlpha = alpha * 0.6;
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            // Only draw every 4th point as a dot
            if (i % 4 === 0) {
                ctx.arc(points[i].x, points[i].y, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    // ===== BALL =====
    function drawBall(ball, time) {
        if (ball.dead) return;
        var colors = BM.getBallColor(ball.value);
        var r = ball.radius;

        ctx.save();
        // Flash effect on merge/hit
        if (ball.flashTimer > 0) {
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 20;
        }
        // Glow for active balls
        if (ball.active) {
            ctx.shadowColor = colors.bg;
            ctx.shadowBlur = 10;
        }
        // Body
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
        ctx.fillStyle = colors.bg;
        ctx.fill();
        // Highlight
        ctx.beginPath();
        ctx.arc(ball.x - r * 0.25, ball.y - r * 0.25, r * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();
        // Value
        ctx.fillStyle = colors.text;
        var fontSize = r * 0.9;
        if (ball.value >= 1000) fontSize = r * 0.6;
        else if (ball.value >= 100) fontSize = r * 0.75;
        ctx.font = 'bold ' + fontSize + 'px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(ball.value, ball.x, ball.y + 1);
        ctx.restore();
    }

    // ===== BLOCK =====
    function drawBlock(block) {
        if (block.dead) return;
        var x = block.x, y = block.y, w = block.w, h = block.h;
        var hpRatio = block.hp / block.maxHp;
        var r = 4;

        ctx.save();
        // Flash
        if (block.flashTimer > 0) {
            ctx.shadowColor = '#fff';
            ctx.shadowBlur = 15;
        }

        // Boss special glow
        if (block.isBoss) {
            ctx.shadowColor = BM.BOSS_COLOR;
            ctx.shadowBlur = 12;
        }

        // Body
        var color = block.isBoss ? BM.BOSS_COLOR : BM.getBlockColor(block.hp, block.maxHp);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();

        // HP bar inside block
        var barH = 3;
        var barY = y + h - barH - 2;
        var barX = x + 3;
        var barW = w - 6;
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = hpRatio > 0.5 ? 'rgba(255,255,255,0.7)' : 'rgba(255,200,100,0.8)';
        ctx.fillRect(barX, barY, barW * hpRatio, barH);

        // HP text
        ctx.fillStyle = '#fff';
        var fontSize = Math.min(h * 0.35, w * 0.3, 14);
        ctx.font = 'bold ' + fontSize + 'px -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        var hpText = block.hp >= 1000 ? (block.hp / 1000).toFixed(1) + 'k' : '' + Math.ceil(block.hp);
        ctx.fillText(hpText, x + w / 2, y + h / 2 - 3);

        if (block.isBoss) {
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.font = 'bold ' + (fontSize * 0.5) + 'px -apple-system, sans-serif';
            ctx.fillText('BOSS', x + w / 2, y + fontSize * 0.4 + 2);
        }
        ctx.restore();
    }

    // ===== PARTICLES =====
    function drawParticles() {
        var parts = BM.Engine.particles;
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i];
            ctx.save();
            ctx.globalAlpha = p.alpha();
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius * p.alpha(), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ===== FLOATING TEXT =====
    function drawFloatingTexts() {
        var texts = BM.Engine.floatingTexts;
        for (var i = 0; i < texts.length; i++) {
            var t = texts[i];
            ctx.save();
            ctx.globalAlpha = t.alpha();
            ctx.fillStyle = t.color;
            ctx.font = 'bold 14px -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(t.text, t.x, t.y);
            ctx.restore();
        }
    }

    // ===== SCREEN SHAKE =====
    var shakeIntensity = 0;
    var shakeDuration = 0;
    var shakeTimer = 0;

    function triggerShake(intensity, duration) {
        shakeIntensity = intensity;
        shakeDuration = duration;
        shakeTimer = duration;
    }

    function applyShake(dt) {
        if (shakeTimer > 0) {
            shakeTimer -= dt;
            var t = shakeTimer / shakeDuration;
            var ox = (Math.random() - 0.5) * shakeIntensity * t * 2;
            var oy = (Math.random() - 0.5) * shakeIntensity * t * 2;
            ctx.translate(ox, oy);
            return true;
        }
        return false;
    }

    function resetTransform() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ===== PUBLIC =====
    BM.Renderer = {
        init: init,
        resize: resize,
        getSize: getSize,
        clear: clear,
        drawDangerLine: drawDangerLine,
        drawLauncher: drawLauncher,
        drawAimLine: drawAimLine,
        drawBall: drawBall,
        drawBlock: drawBlock,
        drawParticles: drawParticles,
        drawFloatingTexts: drawFloatingTexts,
        triggerShake: triggerShake,
        applyShake: applyShake,
        resetTransform: resetTransform,
    };

})(window.BM);
