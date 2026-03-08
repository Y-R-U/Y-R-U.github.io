/* DRace - Board Renderer */
const Board = (() => {
    let canvas, ctx;
    let squares = [];
    let players = [];
    let boardWidth = 0, boardHeight = 0;
    let squareSize = 56;
    let cols = 7;
    let padding = 16;
    let zoom = 1;
    let targetZoom = 1;
    let panX = 0, panY = 0;
    let targetPanX = 0, targetPanY = 0;
    let isDragging = false;
    let dragStartX = 0, dragStartY = 0;
    let dragPanStartX = 0, dragPanStartY = 0;
    let lastPinchDist = 0;
    let highlightSquares = [];
    let animFrame = null;
    let onSquareClick = null;
    let containerEl = null;
    let animTime = 0;
    let playerAnimPositions = [];

    const SQUARE_COLORS = {
        neutral:  { bg: '#1e2555', border: '#2a3377' },
        positive: { bg: '#0d3320', border: '#166b3a' },
        negative: { bg: '#3d1020', border: '#6b1a30' },
        treasure: { bg: '#3d2e05', border: '#6b5010' },
        start:    { bg: '#1a2060', border: '#00d4ff' },
        finish:   { bg: '#1a2060', border: '#ffd700' },
    };

    function init(canvasEl, container) {
        canvas = canvasEl;
        containerEl = container;
        ctx = canvas.getContext('2d');
        setupInputs();
        addZoomControls();
    }

    function addZoomControls() {
        let controls = containerEl.querySelector('.board-zoom-controls');
        if (controls) controls.remove();
        controls = document.createElement('div');
        controls.className = 'board-zoom-controls';
        controls.innerHTML = `
            <button id="zoom-in">+</button>
            <button id="zoom-out">&minus;</button>
            <button id="zoom-fit">&#8859;</button>
        `;
        containerEl.appendChild(controls);
        controls.querySelector('#zoom-in').addEventListener('click', () => setZoom(targetZoom * 1.3));
        controls.querySelector('#zoom-out').addEventListener('click', () => setZoom(targetZoom / 1.3));
        controls.querySelector('#zoom-fit').addEventListener('click', () => fitBoard());
    }

    function setZoom(z) {
        targetZoom = Math.max(0.3, Math.min(3, z));
    }

    function fitBoard() {
        if (!containerEl) return;
        const cw = containerEl.clientWidth;
        const ch = containerEl.clientHeight;
        const zx = cw / boardWidth;
        const zy = ch / boardHeight;
        targetZoom = Math.min(zx, zy) * 0.92;
        targetPanX = (cw - boardWidth * targetZoom) / 2;
        targetPanY = (ch - boardHeight * targetZoom) / 2;
    }

    function focusOnSquare(sqIndex, immediate = false) {
        if (!containerEl) return;
        const pos = getSquareCenter(sqIndex);
        const cw = containerEl.clientWidth;
        const ch = containerEl.clientHeight;
        const focusZoom = Math.min(2.0, cw / (squareSize * 5));
        targetZoom = focusZoom;
        targetPanX = cw / 2 - pos.x * targetZoom;
        targetPanY = ch / 2 - pos.y * targetZoom;
        if (immediate) {
            zoom = targetZoom;
            panX = targetPanX;
            panY = targetPanY;
        }
    }

    function setupInputs() {
        // Touch/Mouse drag
        canvas.addEventListener('pointerdown', (e) => {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragPanStartX = panX;
            dragPanStartY = panY;
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            targetPanX = dragPanStartX + dx;
            targetPanY = dragPanStartY + dy;
        });
        canvas.addEventListener('pointerup', (e) => {
            if (isDragging) {
                const dx = Math.abs(e.clientX - dragStartX);
                const dy = Math.abs(e.clientY - dragStartY);
                if (dx < 8 && dy < 8) {
                    handleClick(e);
                }
            }
            isDragging = false;
        });

        // Pinch zoom
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                lastPinchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        }, { passive: true });
        canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault();
                const dist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
                if (lastPinchDist > 0) {
                    const scale = dist / lastPinchDist;
                    setZoom(targetZoom * scale);
                }
                lastPinchDist = dist;
            }
        }, { passive: false });

        // Mouse wheel zoom
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            setZoom(targetZoom * factor);
        }, { passive: false });
    }

    function handleClick(e) {
        if (highlightSquares.length === 0 || !onSquareClick) return;
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left - panX) / zoom;
        const my = (e.clientY - rect.top - panY) / zoom;

        for (const idx of highlightSquares) {
            const pos = getSquareCenter(idx);
            const half = squareSize / 2;
            if (mx >= pos.x - half && mx <= pos.x + half && my >= pos.y - half && my <= pos.y + half) {
                onSquareClick(idx);
                return;
            }
        }
    }

    function getSquarePos(index) {
        // Serpentine layout: row-based, alternating direction
        const row = Math.floor(index / cols);
        let col = index % cols;
        if (row % 2 === 1) col = cols - 1 - col;
        return { row, col };
    }

    function getSquareCenter(index) {
        const { row, col } = getSquarePos(index);
        return {
            x: padding + col * (squareSize + 6) + squareSize / 2,
            y: padding + row * (squareSize + 6) + squareSize / 2
        };
    }

    function setBoard(boardSquares, gamePlayers) {
        squares = boardSquares;
        players = gamePlayers;
        playerAnimPositions = players.map(p => ({ ...getSquareCenter(p.position) }));

        const rows = Math.ceil(squares.length / cols);
        boardWidth = padding * 2 + cols * (squareSize + 6);
        boardHeight = padding * 2 + rows * (squareSize + 6);

        canvas.width = containerEl.clientWidth * window.devicePixelRatio;
        canvas.height = containerEl.clientHeight * window.devicePixelRatio;
        canvas.style.width = containerEl.clientWidth + 'px';
        canvas.style.height = containerEl.clientHeight + 'px';

        fitBoard();
        zoom = targetZoom;
        panX = targetPanX;
        panY = targetPanY;

        if (!animFrame) startLoop();
    }

    function setHighlightSquares(indices, callback) {
        highlightSquares = indices;
        onSquareClick = callback;
    }

    function clearHighlight() {
        highlightSquares = [];
        onSquareClick = null;
    }

    function startLoop() {
        function loop(time) {
            animTime = time;
            update();
            render();
            animFrame = requestAnimationFrame(loop);
        }
        animFrame = requestAnimationFrame(loop);
    }

    function update() {
        // Smooth zoom & pan
        zoom += (targetZoom - zoom) * 0.12;
        panX += (targetPanX - panX) * 0.12;
        panY += (targetPanY - panY) * 0.12;

        // Smooth player positions
        for (let i = 0; i < players.length; i++) {
            const target = getSquareCenter(players[i].position);
            if (!playerAnimPositions[i]) {
                playerAnimPositions[i] = { ...target };
            }
            playerAnimPositions[i].x += (target.x - playerAnimPositions[i].x) * 0.15;
            playerAnimPositions[i].y += (target.y - playerAnimPositions[i].y) * 0.15;
        }

        // Resize canvas if needed
        const cw = containerEl.clientWidth * window.devicePixelRatio;
        const ch = containerEl.clientHeight * window.devicePixelRatio;
        if (canvas.width !== cw || canvas.height !== ch) {
            canvas.width = cw;
            canvas.height = ch;
            canvas.style.width = containerEl.clientWidth + 'px';
            canvas.style.height = containerEl.clientHeight + 'px';
        }
    }

    function render() {
        const dpr = window.devicePixelRatio;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

        ctx.save();
        ctx.translate(panX, panY);
        ctx.scale(zoom, zoom);

        drawPath();
        drawSquares();
        drawPlayers();

        ctx.restore();
    }

    function drawPath() {
        // Draw connecting lines between squares
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let i = 0; i < squares.length; i++) {
            const c = getSquareCenter(i);
            if (i === 0) ctx.moveTo(c.x, c.y);
            else ctx.lineTo(c.x, c.y);
        }
        ctx.stroke();

        // Draw direction arrows every few squares
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        for (let i = 2; i < squares.length - 1; i += 4) {
            const c1 = getSquareCenter(i);
            const c2 = getSquareCenter(i + 1);
            const angle = Math.atan2(c2.y - c1.y, c2.x - c1.x);
            const mx = (c1.x + c2.x) / 2;
            const my = (c1.y + c2.y) / 2;
            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(angle);
            ctx.beginPath();
            ctx.moveTo(6, 0);
            ctx.lineTo(-4, -4);
            ctx.lineTo(-4, 4);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    function drawSquares() {
        const pulse = Math.sin(animTime * 0.004) * 0.5 + 0.5;

        for (let i = 0; i < squares.length; i++) {
            const sq = squares[i];
            const c = getSquareCenter(i);
            const half = squareSize / 2;
            const x = c.x - half;
            const y = c.y - half;
            const isHighlight = highlightSquares.includes(i);
            const cat = (sq.effect.id === 'start' || sq.effect.id === 'finish') ? sq.effect.id : sq.effect.category;
            const colors = SQUARE_COLORS[cat] || SQUARE_COLORS.neutral;
            const radius = 10;

            // Shadow
            ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
            ctx.shadowBlur = 6;
            ctx.shadowOffsetY = 2;

            // Square background
            ctx.fillStyle = colors.bg;
            drawRoundRect(x, y, squareSize, squareSize, radius);
            ctx.fill();
            ctx.shadowColor = 'transparent';

            // Border
            ctx.strokeStyle = isHighlight
                ? `rgba(0, 212, 255, ${0.6 + pulse * 0.4})`
                : colors.border;
            ctx.lineWidth = isHighlight ? 3 : 1.5;
            drawRoundRect(x, y, squareSize, squareSize, radius);
            ctx.stroke();

            // Highlight glow
            if (isHighlight) {
                ctx.shadowColor = 'rgba(0, 212, 255, 0.5)';
                ctx.shadowBlur = 12 + pulse * 8;
                ctx.strokeStyle = `rgba(0, 212, 255, ${0.3 + pulse * 0.3})`;
                ctx.lineWidth = 2;
                drawRoundRect(x, y, squareSize, squareSize, radius);
                ctx.stroke();
                ctx.shadowColor = 'transparent';
            }

            // Square number
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.font = '9px system-ui, sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.fillText(i, x + 4, y + 3);

            // Effect icon
            if (sq.effect.icon) {
                ctx.font = '22px serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(sq.effect.icon, c.x, c.y + 2);
            }
        }
    }

    function drawPlayers() {
        // Draw each player token
        for (let i = players.length - 1; i >= 0; i--) {
            const p = players[i];
            if (p.finished && p.position >= squares.length - 1) continue;
            const anim = playerAnimPositions[i];
            if (!anim) continue;

            // Offset multiple players on same square
            const sameSquare = players.filter((pp, ii) => ii !== i && pp.position === p.position && !pp.finished);
            const myIdx = players.filter((pp, ii) => ii < i && pp.position === p.position).length;
            const offX = sameSquare.length > 0 ? (myIdx - sameSquare.length / 2) * 14 : 0;
            const offY = sameSquare.length > 0 ? -8 : -6;

            const px = anim.x + offX;
            const py = anim.y + offY;

            // Player circle
            ctx.save();
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;

            // Outer ring
            ctx.beginPath();
            ctx.arc(px, py, 13, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.fill();

            // Inner circle
            ctx.shadowColor = 'transparent';
            ctx.beginPath();
            ctx.arc(px, py, 10, 0, Math.PI * 2);
            ctx.fillStyle = darken(p.color, 0.3);
            ctx.fill();

            // Player initial
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 11px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(p.name.charAt(0).toUpperCase(), px, py + 1);

            ctx.restore();
        }
    }

    function darken(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.max(0, ((num >> 16) & 0xff) * (1 - amount));
        const g = Math.max(0, ((num >> 8) & 0xff) * (1 - amount));
        const b = Math.max(0, (num & 0xff) * (1 - amount));
        return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    }

    function drawRoundRect(x, y, w, h, r) {
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
    }

    function destroy() {
        if (animFrame) {
            cancelAnimationFrame(animFrame);
            animFrame = null;
        }
    }

    return {
        init,
        setBoard,
        setHighlightSquares,
        clearHighlight,
        focusOnSquare,
        fitBoard,
        destroy,
        getSquareCenter
    };
})();
