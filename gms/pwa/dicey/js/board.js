/* ============================================
   DICEY - Board Renderer (Top-Down View)
   ============================================ */

const BoardRenderer = {
    canvas: null,
    ctx: null,
    spaces: Utils.BOARD_SPACES,
    spacePositions: [],
    cellSize: 0,
    boardPx: 0,
    margin: 0,
    sidesCount: { top: 9, right: 7, bottom: 9, left: 7 },
    cornerSize: 0,

    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // Click handler - detect which space was tapped
        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = this.boardPx / rect.width;
            const scaleY = this.boardPx / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            for (let i = 0; i < 32; i++) {
                const pos = this.spacePositions[i];
                if (!pos) continue;
                if (x >= pos.x && x <= pos.x + pos.w && y >= pos.y && y <= pos.y + pos.h) {
                    const space = this.spaces[i];
                    if (space && (space.type === 'property' || space.type === 'railroad' || space.type === 'utility')) {
                        AudioManager.playSfx('click');
                        UI.showPropertyDetailPanel(i, Game.state);
                    }
                    break;
                }
            }
        });
    },

    resize() {
        const wrapper = document.getElementById('board-wrapper');
        const maxW = wrapper.clientWidth - 12;
        const maxH = wrapper.clientHeight - 12;
        const size = Math.min(maxW, maxH);

        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.boardPx = size;
        this.calculateLayout();
    },

    calculateLayout() {
        const total = 32;
        // Board is a rectangle: 9 spaces across top/bottom, 7 on each side
        // Corner spaces are at indices 0, 10, 20, 30 (but we have 32 spaces, 0-indexed)
        // Layout: bottom row (right to left): 0-7 (8 spaces)
        //         left col (bottom to top): 8-15 (8 spaces, corners shared)
        //         top row (left to right): 16-23
        //         right col (top to bottom): 24-31

        const perSide = 8; // 8 spaces per side (32 / 4)
        const cornerFrac = 1.4; // corners are bigger
        const normalCount = (perSide - 1) * 4; // 28 normal cells
        const cornerCount = 4;
        // Total units = normalCount + cornerCount * cornerFrac
        const totalUnits = normalCount + cornerCount * cornerFrac;
        const unitPx = this.boardPx / (perSide - 1 + 2 * cornerFrac);

        this.cellSize = unitPx;
        this.cornerSize = unitPx * cornerFrac;

        // Calculate positions for all 32 spaces going clockwise from GO (bottom-right corner)
        this.spacePositions = [];
        const cs = this.cornerSize;
        const ns = unitPx;
        const bpx = this.boardPx;

        // Bottom row: right to left (spaces 0-8)
        // 0 = GO (bottom-right corner)
        this.spacePositions[0] = { x: bpx - cs, y: bpx - cs, w: cs, h: cs, corner: true };
        for (let i = 1; i <= 7; i++) {
            const xi = bpx - cs - i * ns;
            this.spacePositions[i] = { x: xi, y: bpx - cs, w: ns, h: cs, corner: false };
        }
        // 8 = bottom-left corner (index 8 maps to space 8 which is... let me recalc)

        // Actually let's use a simpler mapping. 32 spaces, 8 per side:
        // Bottom: indices 0(corner) 1 2 3 4 5 6 7
        // Left:   indices 8(corner) 9 10 11 12 13 14 15
        // Top:    indices 16(corner) 17 18 19 20 21 22 23
        // Right:  indices 24(corner) 25 26 27 28 29 30 31

        this.spacePositions = [];

        // Bottom row: right-to-left
        // Index 0 = bottom-right corner (GO)
        this.spacePositions[0] = { x: bpx - cs, y: bpx - cs, w: cs, h: cs, corner: true };
        for (let i = 1; i < 8; i++) {
            this.spacePositions[i] = { x: bpx - cs - i * ns, y: bpx - cs, w: ns, h: cs, corner: false };
        }

        // Left col: bottom-to-top
        // Index 8 = bottom-left corner
        this.spacePositions[8] = { x: 0, y: bpx - cs, w: cs, h: cs, corner: true };
        for (let i = 1; i < 8; i++) {
            this.spacePositions[8 + i] = { x: 0, y: bpx - cs - i * ns, w: cs, h: ns, corner: false };
        }

        // Top row: left-to-right
        // Index 16 = top-left corner
        this.spacePositions[16] = { x: 0, y: 0, w: cs, h: cs, corner: true };
        for (let i = 1; i < 8; i++) {
            this.spacePositions[16 + i] = { x: cs + (i - 1) * ns, y: 0, w: ns, h: cs, corner: false };
        }

        // Right col: top-to-bottom
        // Index 24 = top-right corner
        this.spacePositions[24] = { x: bpx - cs, y: 0, w: cs, h: cs, corner: true };
        for (let i = 1; i < 8; i++) {
            this.spacePositions[24 + i] = { x: bpx - cs, y: cs + (i - 1) * ns, w: cs, h: ns, corner: false };
        }
    },

    draw(gameState) {
        const ctx = this.ctx;
        const bpx = this.boardPx;
        ctx.clearRect(0, 0, bpx, bpx);

        // Board background
        const bgGrad = ctx.createRadialGradient(bpx / 2, bpx / 2, 0, bpx / 2, bpx / 2, bpx * 0.7);
        bgGrad.addColorStop(0, '#1a3a2a');
        bgGrad.addColorStop(1, '#0d1f17');
        ctx.fillStyle = bgGrad;
        Sprites.roundRect(ctx, 0, 0, bpx, bpx, 8);
        ctx.fill();

        // Center decoration
        this.drawCenter(ctx, bpx);

        // Draw all spaces
        for (let i = 0; i < 32; i++) {
            this.drawSpace(ctx, i, gameState);
        }

        // Draw player tokens
        if (gameState && gameState.players) {
            this.drawPlayers(ctx, gameState);
        }
    },

    drawCenter(ctx, bpx) {
        const cs = this.cornerSize;
        const innerX = cs;
        const innerY = cs;
        const innerW = bpx - cs * 2;
        const innerH = bpx - cs * 2;

        // Subtle pattern
        ctx.save();
        ctx.globalAlpha = 0.06;
        for (let i = 0; i < 6; i++) {
            ctx.strokeStyle = '#f5c518';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(bpx / 2, bpx / 2, innerW * 0.1 + i * innerW * 0.07, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        // DICEY logo in center
        ctx.font = `bold ${bpx * 0.08}px 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(245, 197, 24, 0.15)';
        ctx.fillText('DICEY', bpx / 2, bpx / 2 - bpx * 0.02);
        ctx.font = `${bpx * 0.025}px sans-serif`;
        ctx.fillStyle = 'rgba(245, 197, 24, 0.1)';
        ctx.fillText('Roll Your Fortune', bpx / 2, bpx / 2 + bpx * 0.04);
        ctx.restore();
    },

    drawSpace(ctx, index, gameState) {
        const pos = this.spacePositions[index];
        if (!pos) return;
        const space = this.spaces[index];
        if (!space) return;

        const { x, y, w, h, corner } = pos;

        ctx.save();

        // Space background
        if (corner) {
            ctx.fillStyle = 'rgba(26, 26, 46, 0.9)';
        } else {
            ctx.fillStyle = 'rgba(26, 26, 46, 0.75)';
        }
        Sprites.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, corner ? 6 : 3);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Property color strip
        if (space.type === 'property' && space.color) {
            const stripH = corner ? 6 : 5;
            // Determine which side the space is on for strip placement
            if (index >= 1 && index <= 7) {
                // Bottom row: strip on top
                ctx.fillStyle = space.color;
                Sprites.roundRect(ctx, x + 1, y + 1, w - 2, stripH, 2);
                ctx.fill();
            } else if (index >= 9 && index <= 15) {
                // Left column: strip on right
                ctx.fillStyle = space.color;
                Sprites.roundRect(ctx, x + w - stripH - 1, y + 1, stripH, h - 2, 2);
                ctx.fill();
            } else if (index >= 17 && index <= 23) {
                // Top row: strip on bottom
                ctx.fillStyle = space.color;
                Sprites.roundRect(ctx, x + 1, y + h - stripH - 1, w - 2, stripH, 2);
                ctx.fill();
            } else if (index >= 25 && index <= 31) {
                // Right column: strip on left
                ctx.fillStyle = space.color;
                Sprites.roundRect(ctx, x + 1, y + 1, stripH, h - 2, 2);
                ctx.fill();
            }
        }

        // Draw icon/text
        const cx = x + w / 2;
        const cy = y + h / 2;
        const iconSize = Math.min(w, h);

        if (space.type === 'property' || space.type === 'railroad' || space.type === 'utility') {
            // Name
            ctx.font = `bold ${Math.max(7, iconSize * 0.16)}px sans-serif`;
            ctx.fillStyle = '#ddd';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const name = space.name;
            if (corner) {
                ctx.fillText(name, cx, cy - iconSize * 0.08);
                ctx.font = `${Math.max(6, iconSize * 0.13)}px sans-serif`;
                ctx.fillStyle = '#2ecc71';
                ctx.fillText(Utils.formatMoney(space.price), cx, cy + iconSize * 0.12);
            } else {
                // For non-corner properties, text needs to fit in narrow space
                if (index >= 9 && index <= 15) {
                    // Left column - vertical
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(-Math.PI / 2);
                    ctx.fillText(name, 0, -h * 0.08);
                    ctx.font = `${Math.max(6, iconSize * 0.12)}px sans-serif`;
                    ctx.fillStyle = '#2ecc71';
                    ctx.fillText(Utils.formatMoney(space.price), 0, h * 0.12);
                    ctx.restore();
                } else if (index >= 25 && index <= 31) {
                    // Right column - vertical
                    ctx.save();
                    ctx.translate(cx, cy);
                    ctx.rotate(Math.PI / 2);
                    ctx.fillText(name, 0, -h * 0.08);
                    ctx.font = `${Math.max(6, iconSize * 0.12)}px sans-serif`;
                    ctx.fillStyle = '#2ecc71';
                    ctx.fillText(Utils.formatMoney(space.price), 0, h * 0.12);
                    ctx.restore();
                } else {
                    ctx.fillText(name, cx, cy - iconSize * 0.06);
                    ctx.font = `${Math.max(6, iconSize * 0.12)}px sans-serif`;
                    ctx.fillStyle = '#2ecc71';
                    ctx.fillText(Utils.formatMoney(space.price), cx, cy + iconSize * 0.14);
                }
            }

            // Draw ownership indicator and houses
            if (gameState) {
                const prop = gameState.properties[index];
                if (prop && prop.owner !== null) {
                    const ownerColor = Utils.PLAYER_COLORS[prop.owner];
                    ctx.fillStyle = ownerColor;
                    ctx.globalAlpha = 0.8;
                    ctx.beginPath();
                    ctx.arc(x + w - 6, y + 6, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;

                    // Houses
                    if (prop.houses > 0 && prop.houses < 5) {
                        for (let hi = 0; hi < prop.houses; hi++) {
                            Sprites.drawHouse(ctx, x + 5 + hi * 7, y + h - 6, 6);
                        }
                    } else if (prop.houses >= 5) {
                        Sprites.drawHotel(ctx, x + w / 2, y + h - 6, 8);
                    }
                }
            }

            // Railroad / utility icon
            if (space.type === 'railroad') {
                Sprites.drawSpaceIcon(ctx, cx, cy, iconSize, 'railroad');
            } else if (space.type === 'utility') {
                Sprites.drawSpaceIcon(ctx, cx, cy, iconSize, 'utility');
            }
        } else {
            Sprites.drawSpaceIcon(ctx, cx, cy, iconSize, space.type);
        }

        ctx.restore();
    },

    drawPlayers(ctx, gameState) {
        // Group players by position
        const posGroups = {};
        gameState.players.forEach((p, i) => {
            if (p.bankrupt) return;
            const key = p.position;
            if (!posGroups[key]) posGroups[key] = [];
            posGroups[key].push(i);
        });

        for (const [posStr, pIndices] of Object.entries(posGroups)) {
            const pos = this.spacePositions[parseInt(posStr)];
            if (!pos) continue;
            const cx = pos.x + pos.w / 2;
            const cy = pos.y + pos.h / 2;
            const count = pIndices.length;
            const tokenR = Math.min(pos.w, pos.h) * 0.17;

            pIndices.forEach((pi, offset) => {
                const angle = (offset / count) * Math.PI * 2 - Math.PI / 2;
                const spread = count > 1 ? tokenR * 1.2 : 0;
                const tx = cx + Math.cos(angle) * spread;
                const ty = cy + Math.sin(angle) * spread;
                Sprites.drawToken(ctx, tx, ty, tokenR, pi, Utils.PLAYER_TOKENS[pi]);
            });
        }
    },

    // Get center position of a space for animations
    getSpaceCenter(index) {
        const pos = this.spacePositions[index];
        if (!pos) return { x: 0, y: 0 };
        return { x: pos.x + pos.w / 2, y: pos.y + pos.h / 2 };
    }
};
