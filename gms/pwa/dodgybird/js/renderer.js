// ── Renderer ── Backgrounds, parallax, day/night cycle ──
const Renderer = (() => {
    let canvas, ctx;
    let scaleX = 1, scaleY = 1, scale = 1;
    let timeOfDay = 0; // 0..1 cycle
    let bgLayers = [];
    let stars = [];

    const SKY_COLORS = [
        { t: 0.0, top: '#1a1a3e', bot: '#2d1b4e' },   // night
        { t: 0.2, top: '#2a1a3e', bot: '#6b2c5a' },   // pre-dawn
        { t: 0.3, top: '#ff7b54', bot: '#ffb347' },    // sunrise
        { t: 0.4, top: '#4a90d9', bot: '#87ceeb' },    // morning
        { t: 0.5, top: '#3a7bd5', bot: '#6bb3f0' },    // midday
        { t: 0.7, top: '#4a6fa5', bot: '#e8956d' },    // afternoon
        { t: 0.8, top: '#ff6b35', bot: '#ff9a56' },    // sunset
        { t: 0.9, top: '#2d1b4e', bot: '#4a2040' },    // dusk
        { t: 1.0, top: '#1a1a3e', bot: '#2d1b4e' },    // night again
    ];

    function init(canvasEl) {
        canvas = canvasEl;
        ctx = canvas.getContext('2d');
        generateBgLayers();
        generateStars();
        resize();
    }

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        scaleX = canvas.width / CONFIG.DESIGN_WIDTH;
        scaleY = canvas.height / CONFIG.DESIGN_HEIGHT;
        scale = Math.min(scaleX, scaleY);
    }

    function generateStars() {
        stars = [];
        for (let i = 0; i < 60; i++) {
            stars.push({
                x: Math.random() * CONFIG.DESIGN_WIDTH,
                y: Math.random() * CONFIG.DESIGN_HEIGHT * 0.6,
                size: 0.5 + Math.random() * 1.5,
                twinkle: Math.random() * Math.PI * 2,
            });
        }
    }

    function generateBgLayers() {
        bgLayers = [];
        // Layer 0: far mountains/cityscape
        const mountains = [];
        for (let x = 0; x < CONFIG.DESIGN_WIDTH * 2; x += 40 + Math.random() * 30) {
            mountains.push({
                x, h: 30 + Math.random() * 80,
                w: 30 + Math.random() * 50,
            });
        }
        bgLayers.push({ elements: mountains, offset: 0, type: 'mountains' });

        // Layer 1: mid buildings
        const buildings = [];
        for (let x = 0; x < CONFIG.DESIGN_WIDTH * 2; x += 25 + Math.random() * 20) {
            buildings.push({
                x, h: 20 + Math.random() * 60,
                w: 15 + Math.random() * 25,
                windows: Math.floor(Math.random() * 5) + 1,
            });
        }
        bgLayers.push({ elements: buildings, offset: 0, type: 'buildings' });

        // Layer 2: ground detail
        const ground = [];
        for (let x = 0; x < CONFIG.DESIGN_WIDTH * 2; x += 10 + Math.random() * 15) {
            ground.push({
                x, h: 3 + Math.random() * 8,
                w: 3 + Math.random() * 8,
            });
        }
        bgLayers.push({ elements: ground, offset: 0, type: 'ground' });
    }

    function lerpColor(c1, c2, t) {
        const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
        const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);
        return `rgb(${r},${g},${b})`;
    }

    function getSkyColors(tod) {
        for (let i = 0; i < SKY_COLORS.length - 1; i++) {
            if (tod >= SKY_COLORS[i].t && tod <= SKY_COLORS[i + 1].t) {
                const local = (tod - SKY_COLORS[i].t) / (SKY_COLORS[i + 1].t - SKY_COLORS[i].t);
                return {
                    top: lerpColor(SKY_COLORS[i].top, SKY_COLORS[i + 1].top, local),
                    bot: lerpColor(SKY_COLORS[i].bot, SKY_COLORS[i + 1].bot, local),
                };
            }
        }
        return { top: SKY_COLORS[0].top, bot: SKY_COLORS[0].bot };
    }

    function updateBackground(dt, speedMult) {
        timeOfDay = (timeOfDay + dt / CONFIG.DAY_NIGHT_DURATION) % 1;
        for (let i = 0; i < bgLayers.length; i++) {
            bgLayers[i].offset += CONFIG.PARALLAX_SPEEDS[i] * CONFIG.OBS_BASE_SPEED * speedMult * dt;
        }
    }

    function drawBackground() {
        const W = CONFIG.DESIGN_WIDTH;
        const H = CONFIG.DESIGN_HEIGHT;
        const sky = getSkyColors(timeOfDay);

        // Sky gradient
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, sky.top);
        grad.addColorStop(1, sky.bot);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // Stars (visible at night)
        const isNight = timeOfDay < 0.25 || timeOfDay > 0.85;
        const nightAlpha = isNight ?
            (timeOfDay < 0.25 ? 1 - timeOfDay / 0.25 : (timeOfDay - 0.85) / 0.15) : 0;
        if (nightAlpha > 0) {
            for (const s of stars) {
                s.twinkle += 0.02;
                const alpha = nightAlpha * (0.4 + 0.6 * Math.sin(s.twinkle));
                ctx.globalAlpha = alpha;
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // Layer 0: Mountains
        const mLayer = bgLayers[0];
        const mAlpha = 0.3;
        ctx.globalAlpha = mAlpha;
        for (const m of mLayer.elements) {
            const sx = ((m.x - mLayer.offset) % (W * 2) + W * 2) % (W * 2) - W * 0.5;
            ctx.fillStyle = isNight ? '#1a1a2e' : '#3a4a6e';
            ctx.beginPath();
            ctx.moveTo(sx - m.w / 2, H);
            ctx.lineTo(sx, H - m.h);
            ctx.lineTo(sx + m.w / 2, H);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Layer 1: Buildings
        const bLayer = bgLayers[1];
        ctx.globalAlpha = 0.4;
        for (const b of bLayer.elements) {
            const sx = ((b.x - bLayer.offset) % (W * 2) + W * 2) % (W * 2) - W * 0.5;
            ctx.fillStyle = isNight ? '#151525' : '#2a3a5a';
            ctx.fillRect(sx, H - b.h, b.w, b.h);
            // Windows
            if (isNight) {
                ctx.fillStyle = '#ffdd44';
                for (let wi = 0; wi < b.windows; wi++) {
                    const wy = H - b.h + 5 + wi * 12;
                    if (wy < H - 5) {
                        ctx.fillRect(sx + 3, wy, 3, 3);
                        if (b.w > 15) ctx.fillRect(sx + b.w - 6, wy, 3, 3);
                    }
                }
            }
        }
        ctx.globalAlpha = 1;

        // Ground line
        ctx.fillStyle = isNight ? '#0d0d1a' : '#1a2a40';
        ctx.fillRect(0, H - 3, W, 3);

        // Layer 2: ground details
        const gLayer = bgLayers[2];
        ctx.globalAlpha = 0.25;
        for (const g of gLayer.elements) {
            const sx = ((g.x - gLayer.offset) % (W * 2) + W * 2) % (W * 2) - W * 0.5;
            ctx.fillStyle = isNight ? '#222233' : '#334455';
            ctx.fillRect(sx, H - g.h - 3, g.w, g.h);
        }
        ctx.globalAlpha = 1;
    }

    function beginFrame() {
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Scale to design coordinates
        const offsetX = (canvas.width - CONFIG.DESIGN_WIDTH * scale) / 2;
        const offsetY = (canvas.height - CONFIG.DESIGN_HEIGHT * scale) / 2;
        ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
        // Clip to game area
        ctx.beginPath();
        ctx.rect(0, 0, CONFIG.DESIGN_WIDTH, CONFIG.DESIGN_HEIGHT);
        ctx.clip();
    }

    function endFrame() {
        ctx.restore();
    }

    function getCtx() { return ctx; }
    function getScale() { return scale; }

    function screenToGame(sx, sy) {
        const offsetX = (canvas.width - CONFIG.DESIGN_WIDTH * scale) / 2;
        const offsetY = (canvas.height - CONFIG.DESIGN_HEIGHT * scale) / 2;
        return {
            x: (sx - offsetX) / scale,
            y: (sy - offsetY) / scale,
        };
    }

    return {
        init, resize, updateBackground, drawBackground,
        beginFrame, endFrame, getCtx, getScale, screenToGame,
        get timeOfDay() { return timeOfDay; },
    };
})();
