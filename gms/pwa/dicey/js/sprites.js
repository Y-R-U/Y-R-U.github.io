/* ============================================
   DICEY - Sprite & Graphics Renderer
   All graphics drawn via Canvas API
   ============================================ */

const Sprites = {
    // Draw a rounded rectangle
    roundRect(ctx, x, y, w, h, r) {
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
    },

    // Draw a single die face
    drawDie(ctx, x, y, size, value, color = '#fff') {
        const r = size * 0.15;
        const pad = size * 0.22;
        const dotR = size * 0.08;

        // Die body
        ctx.save();
        this.roundRect(ctx, x, y, size, size, r);
        const grad = ctx.createLinearGradient(x, y, x + size, y + size);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(1, '#e8e8e8');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Shadow under die
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
        this.roundRect(ctx, x, y, size, size, r);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        // Dots
        ctx.fillStyle = '#1a1a2e';
        const cx = x + size / 2;
        const cy = y + size / 2;
        const positions = {
            1: [[cx, cy]],
            2: [[x + pad, y + pad], [x + size - pad, y + size - pad]],
            3: [[x + pad, y + pad], [cx, cy], [x + size - pad, y + size - pad]],
            4: [[x + pad, y + pad], [x + size - pad, y + pad], [x + pad, y + size - pad], [x + size - pad, y + size - pad]],
            5: [[x + pad, y + pad], [x + size - pad, y + pad], [cx, cy], [x + pad, y + size - pad], [x + size - pad, y + size - pad]],
            6: [[x + pad, y + pad], [x + size - pad, y + pad], [x + pad, cy], [x + size - pad, cy], [x + pad, y + size - pad], [x + size - pad, y + size - pad]],
        };

        (positions[value] || []).forEach(([dx, dy]) => {
            ctx.beginPath();
            ctx.arc(dx, dy, dotR, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
    },

    // Draw dice pair for dice area
    drawDicePair(ctx, w, h, d1, d2, rolling = false) {
        ctx.clearRect(0, 0, w, h);
        const dieSize = Math.min(h - 10, 55);
        const gap = 12;
        const totalW = dieSize * 2 + gap;
        const startX = (w - totalW) / 2;
        const startY = (h - dieSize) / 2;

        if (rolling) {
            this.drawDie(ctx, startX, startY, dieSize, Utils.rand(1, 6));
            this.drawDie(ctx, startX + dieSize + gap, startY, dieSize, Utils.rand(1, 6));
        } else if (d1 && d2) {
            this.drawDie(ctx, startX, startY, dieSize, d1);
            this.drawDie(ctx, startX + dieSize + gap, startY, dieSize, d2);
        } else {
            // Default state - faded dice
            ctx.globalAlpha = 0.3;
            this.drawDie(ctx, startX, startY, dieSize, 1);
            this.drawDie(ctx, startX + dieSize + gap, startY, dieSize, 1);
            ctx.globalAlpha = 1;
        }
    },

    // Draw animated title dice
    drawTitleDice(ctx, w, h, frame) {
        ctx.clearRect(0, 0, w, h);
        const size = 48;
        const wobble = Math.sin(frame * 0.03) * 5;
        const wobble2 = Math.cos(frame * 0.025) * 4;

        ctx.save();
        ctx.translate(w / 2 - size - 6, h / 2 - size / 2 + wobble);
        ctx.rotate(Math.sin(frame * 0.02) * 0.1);
        this.drawDie(ctx, 0, 0, size, ((Math.floor(frame / 40)) % 6) + 1);
        ctx.restore();

        ctx.save();
        ctx.translate(w / 2 + 6, h / 2 - size / 2 + wobble2);
        ctx.rotate(Math.cos(frame * 0.02) * 0.1);
        this.drawDie(ctx, 0, 0, size, ((Math.floor(frame / 50) + 3) % 6) + 1);
        ctx.restore();
    },

    // Draw a player token on the board
    drawToken(ctx, x, y, radius, playerIndex, token) {
        const color = Utils.PLAYER_COLORS[playerIndex];

        // Glow
        ctx.save();
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(x - 2, y - 2, 0, x, y, radius);
        grad.addColorStop(0, color);
        grad.addColorStop(1, shadeColor(color, -30));
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // Token emoji
        ctx.font = `${radius * 1.1}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(token, x, y + 1);
    },

    // Draw a house marker
    drawHouse(ctx, x, y, size) {
        ctx.fillStyle = '#2ecc71';
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.6);
        ctx.lineTo(x + size / 2, y);
        ctx.lineTo(x + size / 3, y);
        ctx.lineTo(x + size / 3, y + size * 0.3);
        ctx.lineTo(x - size / 3, y + size * 0.3);
        ctx.lineTo(x - size / 3, y);
        ctx.lineTo(x - size / 2, y);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#27ae60';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    },

    // Draw a hotel marker
    drawHotel(ctx, x, y, size) {
        ctx.fillStyle = '#e74c3c';
        const w = size * 0.7;
        const h = size * 0.8;
        this.roundRect(ctx, x - w / 2, y - h / 2, w, h, 2);
        ctx.fill();
        ctx.strokeStyle = '#c0392b';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        // H letter
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${size * 0.4}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('H', x, y);
    },

    // Draw board space icons
    drawSpaceIcon(ctx, x, y, size, type) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        switch (type) {
            case 'go':
                ctx.font = `bold ${size * 0.5}px sans-serif`;
                ctx.fillStyle = '#2ecc71';
                ctx.fillText('GO', x, y - size * 0.1);
                // Arrow
                ctx.fillStyle = '#2ecc71';
                ctx.beginPath();
                ctx.moveTo(x - size * 0.25, y + size * 0.2);
                ctx.lineTo(x + size * 0.15, y + size * 0.2);
                ctx.lineTo(x + size * 0.15, y + size * 0.12);
                ctx.lineTo(x + size * 0.3, y + size * 0.25);
                ctx.lineTo(x + size * 0.15, y + size * 0.38);
                ctx.lineTo(x + size * 0.15, y + size * 0.3);
                ctx.lineTo(x - size * 0.25, y + size * 0.3);
                ctx.closePath();
                ctx.fill();
                break;

            case 'jail':
                // Bars
                ctx.strokeStyle = '#95a5a6';
                ctx.lineWidth = 2;
                for (let i = -1; i <= 1; i++) {
                    ctx.beginPath();
                    ctx.moveTo(x + i * size * 0.15, y - size * 0.25);
                    ctx.lineTo(x + i * size * 0.15, y + size * 0.25);
                    ctx.stroke();
                }
                ctx.strokeStyle = '#95a5a6';
                ctx.beginPath();
                ctx.moveTo(x - size * 0.22, y);
                ctx.lineTo(x + size * 0.22, y);
                ctx.stroke();
                break;

            case 'parking':
                ctx.font = `bold ${size * 0.35}px sans-serif`;
                ctx.fillStyle = '#f39c12';
                ctx.fillText('FREE', x, y - size * 0.08);
                ctx.font = `${size * 0.2}px sans-serif`;
                ctx.fillStyle = '#f39c12';
                ctx.fillText('PARKING', x, y + size * 0.18);
                break;

            case 'chance':
                ctx.font = `bold ${size * 0.55}px sans-serif`;
                ctx.fillStyle = '#e74c3c';
                ctx.fillText('?', x, y);
                break;

            case 'chest':
                // Treasure chest
                ctx.fillStyle = '#8B4513';
                this.roundRect(ctx, x - size * 0.2, y - size * 0.1, size * 0.4, size * 0.25, 2);
                ctx.fill();
                ctx.fillStyle = '#D2691E';
                this.roundRect(ctx, x - size * 0.22, y - size * 0.18, size * 0.44, size * 0.12, 2);
                ctx.fill();
                ctx.fillStyle = '#f5c518';
                ctx.beginPath();
                ctx.arc(x, y - size * 0.02, size * 0.04, 0, Math.PI * 2);
                ctx.fill();
                break;

            case 'tax':
                ctx.font = `${size * 0.4}px sans-serif`;
                ctx.fillText('💰', x, y - size * 0.05);
                ctx.font = `bold ${size * 0.16}px sans-serif`;
                ctx.fillStyle = '#e74c3c';
                ctx.fillText('TAX', x, y + size * 0.25);
                break;

            case 'railroad':
                ctx.font = `${size * 0.45}px sans-serif`;
                ctx.fillText('🚂', x, y);
                break;

            case 'utility':
                ctx.font = `${size * 0.45}px sans-serif`;
                ctx.fillText('⚡', x, y);
                break;

            case 'goToJail':
                ctx.font = `bold ${size * 0.22}px sans-serif`;
                ctx.fillStyle = '#e74c3c';
                ctx.fillText('GO TO', x, y - size * 0.12);
                ctx.fillText('JAIL', x, y + size * 0.12);
                // Handcuff icon
                ctx.font = `${size * 0.3}px sans-serif`;
                ctx.fillText('👮', x, y + size * 0.35);
                break;
        }

        ctx.restore();
    },

    // Draw player avatar for HUD
    drawPlayerAvatar(canvas, playerIndex) {
        const ctx = canvas.getContext('2d');
        const s = canvas.width;
        ctx.clearRect(0, 0, s, s);

        const color = Utils.PLAYER_COLORS[playerIndex];
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, s / 2 - 2, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(s / 2 - 3, s / 2 - 3, 0, s / 2, s / 2, s / 2);
        grad.addColorStop(0, lightenColor(color, 20));
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.font = `${s * 0.5}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Utils.PLAYER_TOKENS[playerIndex], s / 2, s / 2 + 1);
    }
};

// Color utility helpers
function shadeColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, Math.min(255, (num >> 16) + amt));
    const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
    const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
    return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function lightenColor(color, percent) {
    return shadeColor(color, percent);
}
