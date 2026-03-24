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

    // Draw board space icons
    drawSpaceIcon(ctx, x, y, size, type) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        switch (type) {
            case 'go':
                ctx.font = `bold ${size * 0.32}px sans-serif`;
                ctx.fillStyle = '#2ecc71';
                ctx.fillText('START', x, y - size * 0.1);
                // Arrow pointing left (←)
                ctx.fillStyle = '#2ecc71';
                ctx.beginPath();
                ctx.moveTo(x + size * 0.25, y + size * 0.2);
                ctx.lineTo(x - size * 0.15, y + size * 0.2);
                ctx.lineTo(x - size * 0.15, y + size * 0.12);
                ctx.lineTo(x - size * 0.3, y + size * 0.25);
                ctx.lineTo(x - size * 0.15, y + size * 0.38);
                ctx.lineTo(x - size * 0.15, y + size * 0.3);
                ctx.lineTo(x + size * 0.25, y + size * 0.3);
                ctx.closePath();
                ctx.fill();
                break;

            case 'jail':
                // Hospital - cross icon
                ctx.font = `${size * 0.4}px sans-serif`;
                ctx.fillText('🏥', x, y - size * 0.08);
                ctx.font = `bold ${size * 0.13}px sans-serif`;
                ctx.fillStyle = '#e74c3c';
                ctx.fillText('HOSPITAL', x, y + size * 0.2);
                break;

            case 'rest':
                // Rest Stop - healing/shield icon
                ctx.font = `${size * 0.4}px sans-serif`;
                ctx.fillText('💚', x, y - size * 0.08);
                ctx.font = `bold ${size * 0.15}px sans-serif`;
                ctx.fillStyle = '#2ecc71';
                ctx.fillText('REST', x, y + size * 0.2);
                break;

            case 'fate':
                // Fate card - crystal ball / question mark
                ctx.font = `bold ${size * 0.5}px sans-serif`;
                ctx.fillStyle = '#9b59b6';
                ctx.fillText('?', x, y - size * 0.05);
                ctx.font = `bold ${size * 0.13}px sans-serif`;
                ctx.fillStyle = '#8e44ad';
                ctx.fillText('FATE', x, y + size * 0.25);
                break;

            case 'tax':
                ctx.font = `${size * 0.4}px sans-serif`;
                ctx.fillText('💰', x, y - size * 0.05);
                ctx.font = `bold ${size * 0.16}px sans-serif`;
                ctx.fillStyle = '#e74c3c';
                ctx.fillText('TAX', x, y + size * 0.25);
                break;

            case 'goToJail':
                ctx.font = `${size * 0.35}px sans-serif`;
                ctx.fillText('🤕', x, y - size * 0.08);
                ctx.font = `bold ${size * 0.17}px sans-serif`;
                ctx.fillStyle = '#e74c3c';
                ctx.fillText('INJURY', x, y + size * 0.22);
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
