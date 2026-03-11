/* ============================================
   DICEY - Board Renderer (Top-Down View)
   Skills-based board game
   ============================================ */

const BoardRenderer = {
    canvas: null,
    ctx: null,
    spaces: Utils.BOARD_SPACES,
    spacePositions: [],
    cellSize: 0,
    boardPx: 0,
    cornerSize: 0,

    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

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
                    if (this.spaces[i]?.type === 'skill') {
                        AudioManager.playSfx('click');
                        UI.showSkillDetailPanel(i, Game.state);
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
        const unitPx = this.boardPx / (7 + 2 * 1.4);
        this.cellSize = unitPx;
        this.cornerSize = unitPx * 1.4;

        this.spacePositions = [];
        const cs = this.cornerSize;
        const ns = unitPx;
        const bpx = this.boardPx;

        // Bottom row: right-to-left (0=GO corner)
        this.spacePositions[0] = { x: bpx - cs, y: bpx - cs, w: cs, h: cs, corner: true };
        for (let i = 1; i < 8; i++) {
            this.spacePositions[i] = { x: bpx - cs - i * ns, y: bpx - cs, w: ns, h: cs, corner: false };
        }
        // Left col: bottom-to-top (8=Jail corner)
        this.spacePositions[8] = { x: 0, y: bpx - cs, w: cs, h: cs, corner: true };
        for (let i = 1; i < 8; i++) {
            this.spacePositions[8 + i] = { x: 0, y: bpx - cs - i * ns, w: cs, h: ns, corner: false };
        }
        // Top row: left-to-right (16=Rest Stop corner)
        this.spacePositions[16] = { x: 0, y: 0, w: cs, h: cs, corner: true };
        for (let i = 1; i < 8; i++) {
            this.spacePositions[16 + i] = { x: cs + (i - 1) * ns, y: 0, w: ns, h: cs, corner: false };
        }
        // Right col: top-to-bottom (24=Go To Jail corner)
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
        bgGrad.addColorStop(0, '#1a2a3a');
        bgGrad.addColorStop(1, '#0d151f');
        ctx.fillStyle = bgGrad;
        Sprites.roundRect(ctx, 0, 0, bpx, bpx, 8);
        ctx.fill();

        this.drawCenter(ctx, bpx);

        for (let i = 0; i < 32; i++) {
            this.drawSpace(ctx, i, gameState);
        }

        if (gameState && gameState.players) {
            this.drawPlayers(ctx, gameState);
        }
    },

    drawCenter(ctx, bpx) {
        ctx.save();
        ctx.globalAlpha = 0.06;
        for (let i = 0; i < 6; i++) {
            ctx.strokeStyle = '#f5c518';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.arc(bpx / 2, bpx / 2, bpx * 0.06 + i * bpx * 0.05, 0, Math.PI * 2);
            ctx.stroke();
        }
        ctx.globalAlpha = 1;

        ctx.font = `bold ${bpx * 0.08}px 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(245, 197, 24, 0.15)';
        ctx.fillText('DICEY', bpx / 2, bpx / 2 - bpx * 0.02);
        ctx.font = `${bpx * 0.022}px sans-serif`;
        ctx.fillStyle = 'rgba(245, 197, 24, 0.1)';
        ctx.fillText('Skills & Strategy', bpx / 2, bpx / 2 + bpx * 0.04);
        ctx.restore();
    },

    drawSpace(ctx, index, gameState) {
        const pos = this.spacePositions[index];
        if (!pos) return;
        const space = this.spaces[index];
        if (!space) return;

        const { x, y, w, h, corner } = pos;
        ctx.save();

        // Background
        ctx.fillStyle = corner ? 'rgba(26, 26, 46, 0.9)' : 'rgba(26, 26, 46, 0.75)';
        Sprites.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, corner ? 6 : 3);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        const cx = x + w / 2;
        const cy = y + h / 2;
        const iconSize = Math.min(w, h);

        if (space.type === 'skill') {
            const skill = Utils.getSkillForSpace(index);
            if (!skill) { ctx.restore(); return; }

            // Color strip
            const stripH = corner ? 6 : 5;
            ctx.fillStyle = skill.color;
            if (index >= 1 && index <= 7) {
                Sprites.roundRect(ctx, x + 1, y + 1, w - 2, stripH, 2); ctx.fill();
            } else if (index >= 9 && index <= 15) {
                Sprites.roundRect(ctx, x + w - stripH - 1, y + 1, stripH, h - 2, 2); ctx.fill();
            } else if (index >= 17 && index <= 23) {
                Sprites.roundRect(ctx, x + 1, y + h - stripH - 1, w - 2, stripH, 2); ctx.fill();
            } else if (index >= 25 && index <= 31) {
                Sprites.roundRect(ctx, x + 1, y + 1, stripH, h - 2, 2); ctx.fill();
            }

            // Icon + name
            const isVertical = (index >= 9 && index <= 15) || (index >= 25 && index <= 31);
            const rotation = index >= 9 && index <= 15 ? -Math.PI / 2 : (index >= 25 && index <= 31 ? Math.PI / 2 : 0);

            if (isVertical && !corner) {
                ctx.save();
                ctx.translate(cx, cy);
                ctx.rotate(rotation);
                ctx.font = `${Math.max(8, iconSize * 0.28)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(skill.icon, 0, -h * 0.1);
                ctx.font = `bold ${Math.max(6, iconSize * 0.14)}px sans-serif`;
                ctx.fillStyle = '#ddd';
                ctx.fillText(skill.name, 0, h * 0.14);
                ctx.restore();
            } else {
                ctx.font = `${Math.max(10, iconSize * 0.3)}px sans-serif`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(skill.icon, cx, cy - iconSize * 0.1);
                ctx.font = `bold ${Math.max(6, iconSize * 0.13)}px sans-serif`;
                ctx.fillStyle = '#ddd';
                ctx.fillText(skill.name, cx, cy + iconSize * 0.16);
            }

            // Ownership dot
            if (gameState) {
                const slot = gameState.skills[index];
                if (slot && slot.owner !== null) {
                    ctx.fillStyle = Utils.PLAYER_COLORS[slot.owner];
                    ctx.globalAlpha = 0.9;
                    ctx.beginPath();
                    ctx.arc(x + w - 6, y + 6, 3.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }
        } else {
            // Non-skill spaces
            Sprites.drawSpaceIcon(ctx, cx, cy, iconSize, space.type);
        }

        ctx.restore();
    },

    drawPlayers(ctx, gameState) {
        const anim = this._animToken;
        const posGroups = {};
        gameState.players.forEach((p, i) => {
            if (p.bankrupt) return;
            // Skip the animating player from normal grouping
            if (anim && anim.playerIndex === i) return;
            if (!posGroups[p.position]) posGroups[p.position] = [];
            posGroups[p.position].push(i);
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
                Sprites.drawToken(ctx, cx + Math.cos(angle) * spread, cy + Math.sin(angle) * spread, tokenR, pi, Utils.PLAYER_TOKENS[pi]);
            });
        }

        // Draw animating player at interpolated position
        if (anim) {
            const refPos = this.spacePositions[0];
            const tokenR = Math.min(refPos.w, refPos.h) * 0.17;
            Sprites.drawToken(ctx, anim.x, anim.y, tokenR, anim.playerIndex, Utils.PLAYER_TOKENS[anim.playerIndex]);
        }
    },

    // Animation state for smooth token movement
    _animToken: null,  // { playerIndex, x, y } when animating

    getSpaceCenter(index) {
        const pos = this.spacePositions[index];
        if (!pos) return { x: 0, y: 0 };
        return { x: pos.x + pos.w / 2, y: pos.y + pos.h / 2 };
    },

    // Smoothly slide a token from one space to the next over `duration` ms
    animateStep(playerIndex, fromIdx, toIdx, duration, gameState) {
        return new Promise(resolve => {
            const from = this.getSpaceCenter(fromIdx);
            const to = this.getSpaceCenter(toIdx);
            const start = performance.now();

            const tick = (now) => {
                const elapsed = now - start;
                const t = Math.min(elapsed / duration, 1);
                const eased = Utils.easeOutCubic(t);

                this._animToken = {
                    playerIndex,
                    x: Utils.lerp(from.x, to.x, eased),
                    y: Utils.lerp(from.y, to.y, eased)
                };

                this.draw(gameState);

                if (t < 1) {
                    requestAnimationFrame(tick);
                } else {
                    this._animToken = null;
                    resolve();
                }
            };
            requestAnimationFrame(tick);
        });
    },

    zoomToSpace(index, scale = 1.35) {
        const center = this.getSpaceCenter(index);
        const canvas = this.canvas;
        const rect = canvas.getBoundingClientRect();
        // Compute percentage offsets for transform-origin
        const pctX = (center.x / this.boardPx) * 100;
        const pctY = (center.y / this.boardPx) * 100;
        canvas.style.transformOrigin = `${pctX}% ${pctY}%`;
        canvas.style.transition = 'transform 0.35s ease-out';
        canvas.style.transform = `scale(${scale})`;
    },

    zoomReset() {
        const canvas = this.canvas;
        canvas.style.transition = 'transform 0.4s ease-in-out';
        canvas.style.transform = 'scale(1)';
    }
};
