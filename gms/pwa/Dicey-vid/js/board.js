/* ============================================
   DICEY-VID - Media Board Renderer
   Canvas tokens over image/video board spaces
   ============================================ */

const BoardRenderer = {
    canvas: null,
    ctx: null,
    wrapper: null,
    stage: null,
    bgLayer: null,
    mediaLayer: null,
    spaces: Utils.BOARD_SPACES,
    spacePositions: [],
    cellSize: 0,
    boardPx: 0,
    cornerSize: 0,
    ZOOM_SCALE: 1.35,
    activeVideoSpaces: new Set(),
    motionTarget: null,
    _animToken: null,
    _lastActiveKey: '',

    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.wrapper = document.getElementById('board-wrapper');
        this.ensureStage();
        this.resize();
        window.addEventListener('resize', () => this.resize());
        document.addEventListener('visibilitychange', () => this.handleVisibility());

        canvas.addEventListener('click', (e) => {
            const rect = this.stage.getBoundingClientRect();
            const scaleX = this.boardPx / rect.width;
            const scaleY = this.boardPx / rect.height;
            const x = (e.clientX - rect.left) * scaleX;
            const y = (e.clientY - rect.top) * scaleY;

            for (let i = 0; i < 32; i++) {
                const pos = this.spacePositions[i];
                if (!pos) continue;
                if (x >= pos.x && x <= pos.x + pos.w && y >= pos.y && y <= pos.y + pos.h) {
                    if (window.DiceyDebugEditor && DiceyDebugEditor.handleSpaceClick(i, Game.state)) {
                        AudioManager.playSfx('click');
                        return;
                    }
                    if (this.spaces[i]?.type === 'skill') {
                        AudioManager.playSfx('click');
                        UI.showSkillDetailPanel(i, Game.state);
                    }
                    return;
                }
            }
        });
    },

    ensureStage() {
        if (this.stage) return;

        this.stage = document.createElement('div');
        this.stage.id = 'board-stage';
        this.bgLayer = document.createElement('div');
        this.bgLayer.id = 'board-bg-layer';
        this.mediaLayer = document.createElement('div');
        this.mediaLayer.id = 'board-media-layer';

        this.wrapper.insertBefore(this.stage, this.canvas);
        this.stage.appendChild(this.bgLayer);
        this.stage.appendChild(this.mediaLayer);
        this.stage.appendChild(this.canvas);
    },

    resize() {
        const maxW = this.wrapper.clientWidth - 12;
        const maxH = this.wrapper.clientHeight - 12;
        const size = Math.max(240, Math.min(maxW, maxH));
        const dpr = window.devicePixelRatio || 1;

        this.stage.style.width = size + 'px';
        this.stage.style.height = size + 'px';
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        this.boardPx = size;
        this.calculateLayout();
        this.renderMediaSpaces(true);
        if (Game.state) this.draw(Game.state);
    },

    calculateLayout() {
        const unitPx = this.boardPx / (7 + 2 * 1.4);
        this.cellSize = unitPx;
        this.cornerSize = unitPx * 1.4;

        this.spacePositions = [];
        const cs = this.cornerSize;
        const ns = unitPx;
        const bpx = this.boardPx;

        this.spacePositions[0] = { x: bpx - cs, y: bpx - cs, w: cs, h: cs, corner: true };
        for (let i = 1; i < 8; i++) {
            this.spacePositions[i] = { x: bpx - cs - i * ns, y: bpx - cs, w: ns, h: cs, corner: false };
        }
        this.spacePositions[8] = { x: 0, y: bpx - cs, w: cs, h: cs, corner: true };
        for (let i = 1; i < 8; i++) {
            this.spacePositions[8 + i] = { x: 0, y: bpx - cs - i * ns, w: cs, h: ns, corner: false };
        }
        this.spacePositions[16] = { x: 0, y: 0, w: cs, h: cs, corner: true };
        for (let i = 1; i < 8; i++) {
            this.spacePositions[16 + i] = { x: cs + (i - 1) * ns, y: 0, w: ns, h: cs, corner: false };
        }
        this.spacePositions[24] = { x: bpx - cs, y: 0, w: cs, h: cs, corner: true };
        for (let i = 1; i < 8; i++) {
            this.spacePositions[24 + i] = { x: bpx - cs, y: cs + (i - 1) * ns, w: cs, h: ns, corner: false };
        }
    },

    renderMediaSpaces(force = false) {
        if (!this.mediaLayer) return;
        if (force) this.mediaLayer.innerHTML = '';

        for (let i = 0; i < 32; i++) {
            const pos = this.spacePositions[i];
            if (!pos) continue;
            let el = this.mediaLayer.querySelector(`[data-space-index="${i}"]`);
            const spot = window.DiceyMedia ? DiceyMedia.getSpot(i) : null;
            const space = this.spaces[i];
            const orientation = spot?.orientation || (pos.corner ? 'square' : pos.w > pos.h ? 'landscape' : 'portrait');

            if (!el) {
                el = document.createElement('div');
                el.className = `board-space-media is-${orientation}`;
                el.dataset.spaceIndex = i;
                el.innerHTML = `
                    <img class="board-space-image" alt="">
                    <video class="board-space-video" muted loop playsinline preload="none"></video>
                    <span class="board-space-glass"></span>
                    <span class="board-space-debug-mark">Edit</span>
                `;
                this.mediaLayer.appendChild(el);
            }

            el.className = `board-space-media is-${orientation} type-${space.type}`;
            if (spot?.category) el.classList.add(`category-${spot.category}`);
            el.style.left = `${pos.x}px`;
            el.style.top = `${pos.y}px`;
            el.style.width = `${pos.w}px`;
            el.style.height = `${pos.h}px`;
            el.style.borderRadius = pos.corner ? '8px' : '5px';
            el.style.setProperty('--space-accent', spot?.accent || Utils.getSpaceColor(i));
            el.style.setProperty('--space-rotate', this.getSpaceRotation(i));

            const img = el.querySelector('.board-space-image');
            const video = el.querySelector('.board-space-video');
            const imageSrc = window.DiceyMedia ? DiceyMedia.getImageSrc(i) : '';
            const videoSrc = window.DiceyMedia ? DiceyMedia.getVideoSrc(i) : '';
            img.alt = spot?.label || Utils.getSpaceName(i);
            if (img.dataset.src !== imageSrc) {
                img.dataset.src = imageSrc;
                img.src = imageSrc;
            }
            video.dataset.src = videoSrc;
            video.poster = imageSrc;
        }
        this.syncActiveVideos();
    },

    getSpaceRotation(index) {
        if (index >= 9 && index <= 15) return '-90deg';
        if (index >= 25 && index <= 31) return '90deg';
        return '0deg';
    },

    refreshSpace(index) {
        const el = this.mediaLayer?.querySelector(`[data-space-index="${index}"]`);
        if (!el || !window.DiceyMedia) return;
        const img = el.querySelector('.board-space-image');
        const video = el.querySelector('.board-space-video');
        const imageSrc = DiceyMedia.getImageSrc(index);
        const videoSrc = DiceyMedia.getVideoSrc(index);
        img.dataset.src = imageSrc;
        img.src = imageSrc;
        video.pause();
        video.removeAttribute('src');
        video.dataset.loaded = '0';
        video.dataset.src = videoSrc;
        video.poster = imageSrc;
        video.load();
        this._lastActiveKey = '';
        this.syncActiveVideos();
    },

    draw(gameState) {
        const ctx = this.ctx;
        const bpx = this.boardPx;
        if (!ctx || !bpx) return;

        ctx.clearRect(0, 0, bpx, bpx);
        this.drawCenter(ctx, bpx);

        for (let i = 0; i < 32; i++) {
            this.drawSpaceOverlay(ctx, i, gameState);
        }

        if (gameState && gameState.players) {
            this.drawPlayers(ctx, gameState);
            this.syncActiveFromState(gameState);
        }
    },

    drawCenter(ctx, bpx) {
        ctx.save();
        const pad = this.cornerSize + this.cellSize * 0.1;
        const w = bpx - pad * 2;
        const h = w;
        const x = pad;
        const y = pad;
        const grad = ctx.createRadialGradient(bpx / 2, bpx / 2, 0, bpx / 2, bpx / 2, w * 0.65);
        grad.addColorStop(0, 'rgba(245,197,24,0.14)');
        grad.addColorStop(0.6, 'rgba(40,70,95,0.16)');
        grad.addColorStop(1, 'rgba(4,8,13,0.24)');
        ctx.fillStyle = grad;
        Sprites.roundRect(ctx, x, y, w, h, 10);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.09)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.font = `bold ${bpx * 0.075}px 'Segoe UI', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(245, 197, 24, 0.18)';
        ctx.fillText('DICEY', bpx / 2, bpx / 2 - bpx * 0.018);
        ctx.font = `${bpx * 0.022}px sans-serif`;
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillText('video board experiment', bpx / 2, bpx / 2 + bpx * 0.04);
        ctx.restore();
    },

    drawSpaceOverlay(ctx, index, gameState) {
        const pos = this.spacePositions[index];
        if (!pos) return;
        const { x, y, w, h, corner } = pos;
        const accent = (window.DiceyMedia && DiceyMedia.getSpot(index)?.accent) || Utils.getSpaceColor(index);

        ctx.save();
        ctx.strokeStyle = this.activeVideoSpaces.has(index) ? 'rgba(255,255,255,0.72)' : 'rgba(255,255,255,0.16)';
        ctx.lineWidth = this.activeVideoSpaces.has(index) ? 2 : 0.75;
        Sprites.roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, corner ? 8 : 5);
        ctx.stroke();

        if (this.spaces[index]?.type === 'skill') {
            const strip = Math.max(3, Math.min(w, h) * 0.07);
            ctx.fillStyle = accent;
            ctx.globalAlpha = 0.78;
            if (index >= 1 && index <= 7) {
                Sprites.roundRect(ctx, x + 2, y + 2, w - 4, strip, 3); ctx.fill();
            } else if (index >= 9 && index <= 15) {
                Sprites.roundRect(ctx, x + w - strip - 2, y + 2, strip, h - 4, 3); ctx.fill();
            } else if (index >= 17 && index <= 23) {
                Sprites.roundRect(ctx, x + 2, y + h - strip - 2, w - 4, strip, 3); ctx.fill();
            } else if (index >= 25 && index <= 31) {
                Sprites.roundRect(ctx, x + 2, y + 2, strip, h - 4, 3); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        if (gameState && gameState.skills[index] && gameState.skills[index].owner !== null) {
            const owner = gameState.skills[index].owner;
            ctx.fillStyle = Utils.PLAYER_COLORS[owner];
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x + w - 7, y + 7, 4.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }
        ctx.restore();
    },

    drawPlayers(ctx, gameState) {
        const anim = this._animToken;
        const posGroups = {};
        gameState.players.forEach((p, i) => {
            if (p.bankrupt) return;
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
            const tokenR = Math.min(pos.w, pos.h) * 0.18;

            pIndices.forEach((pi, offset) => {
                const angle = (offset / count) * Math.PI * 2 - Math.PI / 2;
                const spread = count > 1 ? tokenR * 1.25 : 0;
                Sprites.drawToken(ctx, cx + Math.cos(angle) * spread, cy + Math.sin(angle) * spread, tokenR, pi, Utils.PLAYER_TOKENS[pi]);
            });
        }

        if (anim) {
            const refPos = this.spacePositions[0];
            const tokenR = Math.min(refPos.w, refPos.h) * 0.18;
            Sprites.drawToken(ctx, anim.x, anim.y, tokenR, anim.playerIndex, Utils.PLAYER_TOKENS[anim.playerIndex]);
        }
    },

    getSpaceCenter(index) {
        const pos = this.spacePositions[index];
        if (!pos) return { x: 0, y: 0 };
        return { x: pos.x + pos.w / 2, y: pos.y + pos.h / 2 };
    },

    animateStep(playerIndex, fromIdx, toIdx, duration, gameState) {
        return new Promise(resolve => {
            const from = this.getSpaceCenter(fromIdx);
            const to = this.getSpaceCenter(toIdx);
            const start = performance.now();
            this.setMotionTarget(toIdx);

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

    syncActiveFromState(gameState) {
        const wanted = [];
        if (this.motionTarget !== null && this.motionTarget !== undefined) wanted.push(this.motionTarget);
        if (gameState?.players) {
            const current = gameState.players[gameState.currentPlayer];
            if (current && !current.bankrupt) wanted.push(current.position);
            gameState.players.forEach(player => {
                if (!player.bankrupt) wanted.push(player.position);
            });
        }
        this.setActiveSpaces(wanted);
    },

    setMotionTarget(index) {
        this.motionTarget = index;
        if (Game.state) this.syncActiveFromState(Game.state);
    },

    clearMotionTarget() {
        this.motionTarget = null;
        if (Game.state) this.syncActiveFromState(Game.state);
    },

    setActiveSpaces(indices) {
        const maxVideos = (window.DiceyMedia && DiceyMedia.maxActiveVideos) || 4;
        const unique = [];
        indices.forEach(index => {
            if (index === null || index === undefined) return;
            const value = Number(index);
            if (!Number.isFinite(value) || unique.includes(value)) return;
            unique.push(value);
        });
        const limited = unique.slice(0, maxVideos);
        const key = limited.join(',');
        if (key === this._lastActiveKey) return;
        this._lastActiveKey = key;
        this.activeVideoSpaces = new Set(limited);
        this.syncActiveVideos();
    },

    syncActiveVideos() {
        if (!this.mediaLayer) return;
        this.mediaLayer.querySelectorAll('.board-space-media').forEach(el => {
            const index = Number(el.dataset.spaceIndex);
            const video = el.querySelector('.board-space-video');
            const active = this.activeVideoSpaces.has(index);
            el.classList.toggle('is-animated', active);
            if (!video) return;
            if (active && !document.hidden) {
                const src = video.dataset.src;
                if (src && video.dataset.loaded !== '1') {
                    video.src = src;
                    video.dataset.loaded = '1';
                    video.load();
                }
                const playResult = video.play();
                if (playResult && typeof playResult.catch === 'function') {
                    playResult.catch(() => {});
                }
            } else {
                video.pause();
                if (video.dataset.loaded === '1') {
                    video.removeAttribute('src');
                    video.dataset.loaded = '0';
                    video.load();
                }
            }
        });
    },

    handleVisibility() {
        this._lastActiveKey = '';
        this.syncActiveVideos();
    },

    zoomToSpace(index) {
        const center = this.getSpaceCenter(index);
        const pctX = (center.x / this.boardPx) * 100;
        const pctY = (center.y / this.boardPx) * 100;
        this.stage.style.transformOrigin = `${pctX}% ${pctY}%`;
        this.stage.style.transition = 'transform 0.35s ease-out';
        this.stage.style.transform = `scale(${this.ZOOM_SCALE})`;
    },

    zoomReset() {
        this.stage.style.transition = 'transform 0.4s ease-in-out';
        this.stage.style.transform = 'scale(1)';
    }
};
