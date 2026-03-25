// renderer.js - Canvas rendering engine
'use strict';

const Renderer = {
    canvas: null,
    ctx: null,
    camX: 0,
    camY: 0,
    tileCache: null,
    animFrame: 0,

    init(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.resize();
        this._buildTileCache();
    },

    resize() {
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
    },

    _buildTileCache() {
        // Pre-render tiles to offscreen canvas
        this.tileCache = {};
        Object.values(TERRAIN).forEach(t => {
            const c = document.createElement('canvas');
            c.width = TILE_SIZE;
            c.height = TILE_SIZE;
            const ctx = c.getContext('2d');
            this._drawTerrainTile(ctx, t);
            this.tileCache[t.id] = c;
        });
    },

    _drawTerrainTile(ctx, terrain) {
        const s = TILE_SIZE;

        switch (terrain.id) {
            case TERRAIN.GRASS.id:
                ctx.fillStyle = terrain.color;
                ctx.fillRect(0, 0, s, s);
                // Grass detail
                ctx.fillStyle = '#5a9c4f';
                for (let i = 0; i < 6; i++) {
                    const x = Utils.rand(2, s - 4);
                    const y = Utils.rand(2, s - 4);
                    ctx.fillRect(x, y, 2, 3);
                }
                break;

            case TERRAIN.FOREST.id:
                ctx.fillStyle = '#3a6a2f';
                ctx.fillRect(0, 0, s, s);
                // Trees
                for (let i = 0; i < 4; i++) {
                    const x = 6 + i * 10;
                    const y = Utils.rand(4, s - 16);
                    this._drawTree(ctx, x, y);
                }
                break;

            case TERRAIN.HILLS.id:
                ctx.fillStyle = terrain.color;
                ctx.fillRect(0, 0, s, s);
                // Hill bumps
                ctx.fillStyle = '#9a8a5a';
                ctx.beginPath();
                ctx.arc(s * 0.3, s * 0.6, 10, Math.PI, 0);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(s * 0.7, s * 0.5, 8, Math.PI, 0);
                ctx.fill();
                break;

            case TERRAIN.MOUNTAIN.id:
                ctx.fillStyle = '#5a5a5a';
                ctx.fillRect(0, 0, s, s);
                // Mountain peaks
                ctx.fillStyle = '#7a7a7a';
                ctx.beginPath();
                ctx.moveTo(s * 0.1, s * 0.9);
                ctx.lineTo(s * 0.35, s * 0.15);
                ctx.lineTo(s * 0.6, s * 0.9);
                ctx.fill();
                ctx.fillStyle = '#9a9a9a';
                ctx.beginPath();
                ctx.moveTo(s * 0.4, s * 0.9);
                ctx.lineTo(s * 0.7, s * 0.25);
                ctx.lineTo(s * 0.95, s * 0.9);
                ctx.fill();
                // Snow caps
                ctx.fillStyle = '#ddd';
                ctx.beginPath();
                ctx.moveTo(s * 0.28, s * 0.25);
                ctx.lineTo(s * 0.35, s * 0.15);
                ctx.lineTo(s * 0.42, s * 0.25);
                ctx.fill();
                break;

            case TERRAIN.WATER.id:
                ctx.fillStyle = terrain.color;
                ctx.fillRect(0, 0, s, s);
                // Wave lines
                ctx.strokeStyle = '#3a74a6';
                ctx.lineWidth = 1;
                for (let y = 8; y < s; y += 10) {
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    for (let x = 0; x < s; x += 8) {
                        ctx.quadraticCurveTo(x + 4, y - 3, x + 8, y);
                    }
                    ctx.stroke();
                }
                break;

            case TERRAIN.SWAMP.id:
                ctx.fillStyle = terrain.color;
                ctx.fillRect(0, 0, s, s);
                // Murky patches
                ctx.fillStyle = '#4a6a3a';
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath();
                    ctx.arc(Utils.rand(8, s - 8), Utils.rand(8, s - 8), Utils.rand(3, 6), 0, Math.PI * 2);
                    ctx.fill();
                }
                // Reeds
                ctx.strokeStyle = '#6a9a5a';
                for (let i = 0; i < 3; i++) {
                    const x = Utils.rand(8, s - 8);
                    ctx.beginPath();
                    ctx.moveTo(x, s * 0.8);
                    ctx.lineTo(x + 2, s * 0.3);
                    ctx.stroke();
                }
                break;

            case TERRAIN.ROAD.id:
                ctx.fillStyle = '#4a8c3f'; // Grass base
                ctx.fillRect(0, 0, s, s);
                ctx.fillStyle = terrain.color;
                ctx.fillRect(s * 0.25, 0, s * 0.5, s);
                // Road texture
                ctx.fillStyle = '#b49a5a';
                for (let y = 4; y < s; y += 8) {
                    ctx.fillRect(s * 0.35, y, 2, 3);
                }
                break;

            case TERRAIN.BRIDGE.id:
                ctx.fillStyle = '#2a6496'; // Water base
                ctx.fillRect(0, 0, s, s);
                ctx.fillStyle = terrain.color;
                ctx.fillRect(s * 0.2, s * 0.1, s * 0.6, s * 0.8);
                // Bridge planks
                ctx.strokeStyle = '#8a6a3a';
                for (let y = s * 0.15; y < s * 0.85; y += 6) {
                    ctx.beginPath();
                    ctx.moveTo(s * 0.2, y);
                    ctx.lineTo(s * 0.8, y);
                    ctx.stroke();
                }
                break;

            case TERRAIN.CITY.id:
                ctx.fillStyle = '#4a8c3f';
                ctx.fillRect(0, 0, s, s);
                // City walls - drawn dynamically based on owner
                break;

            case TERRAIN.RUIN.id:
                ctx.fillStyle = '#4a8c3f';
                ctx.fillRect(0, 0, s, s);
                // Ruins
                ctx.fillStyle = '#7a6a5a';
                ctx.fillRect(s * 0.15, s * 0.3, 4, s * 0.5);
                ctx.fillRect(s * 0.6, s * 0.2, 4, s * 0.6);
                ctx.fillRect(s * 0.35, s * 0.4, 4, s * 0.4);
                // Broken arch
                ctx.strokeStyle = '#8a7a6a';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(s * 0.4, s * 0.35, 12, Math.PI, 0);
                ctx.stroke();
                // Vegetation
                ctx.fillStyle = '#5a8a4a';
                ctx.fillRect(s * 0.1, s * 0.7, 6, 4);
                ctx.fillRect(s * 0.7, s * 0.6, 5, 5);
                break;
        }

        // Grid line
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
    },

    _drawTree(ctx, x, y) {
        // Trunk
        ctx.fillStyle = '#5a3a1a';
        ctx.fillRect(x + 2, y + 7, 3, 5);
        // Canopy
        ctx.fillStyle = '#2a5a1a';
        ctx.beginPath();
        ctx.moveTo(x, y + 8);
        ctx.lineTo(x + 3.5, y);
        ctx.lineTo(x + 7, y + 8);
        ctx.fill();
        ctx.fillStyle = '#3a6a2a';
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 5);
        ctx.lineTo(x + 3.5, y - 1);
        ctx.lineTo(x + 6, y + 5);
        ctx.fill();
    },

    render() {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, w, h);

        if (GameState.phase === 'setup') return;

        this.animFrame++;

        // Calculate visible tiles
        const startCol = Math.max(0, Math.floor(this.camX / TILE_SIZE));
        const startRow = Math.max(0, Math.floor(this.camY / TILE_SIZE));
        const endCol = Math.min(MAP_COLS - 1, Math.ceil((this.camX + w) / TILE_SIZE));
        const endRow = Math.min(MAP_ROWS - 1, Math.ceil((this.camY + h) / TILE_SIZE));

        const pid = GameState.currentPlayer;
        const isHuman = GameState.players[pid]?.isHuman;

        // Draw terrain
        for (let r = startRow; r <= endRow; r++) {
            for (let c = startCol; c <= endCol; c++) {
                const sx = c * TILE_SIZE - this.camX;
                const sy = r * TILE_SIZE - this.camY;
                const tileId = GameState.tiles[r][c];

                if (isHuman && !GameState.isVisible(pid, c, r)) {
                    ctx.fillStyle = '#111122';
                    ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                    continue;
                }

                // Draw cached tile
                const cached = this.tileCache[tileId];
                if (cached) {
                    ctx.drawImage(cached, sx, sy);
                }

                // Draw city with owner color
                if (tileId === TERRAIN.CITY.id) {
                    this._drawCityOnMap(ctx, sx, sy, c, r);
                }

                // Draw ruin indicator
                if (tileId === TERRAIN.RUIN.id) {
                    const ruin = GameState.getRuinAt(c, r);
                    if (ruin && ruin.searched) {
                        ctx.fillStyle = 'rgba(0,0,0,0.3)';
                        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }

        // Draw reachable tiles highlight
        if (GameState.selectedArmy && isHuman) {
            this._drawReachableTiles(ctx);
        }

        // Draw movement path
        if (GameState.movePath && isHuman) {
            this._drawPath(ctx, GameState.movePath);
        }

        // Draw armies
        for (const army of GameState.armies) {
            if (isHuman && !GameState.isVisible(pid, army.col, army.row)) continue;
            if (army.col < startCol - 1 || army.col > endCol + 1) continue;
            if (army.row < startRow - 1 || army.row > endRow + 1) continue;

            const sx = army.col * TILE_SIZE - this.camX;
            const sy = army.row * TILE_SIZE - this.camY;
            this._drawArmy(ctx, sx, sy, army);
        }

        // Selection highlight
        if (GameState.selectedArmy) {
            const a = GameState.selectedArmy;
            const sx = a.col * TILE_SIZE - this.camX;
            const sy = a.row * TILE_SIZE - this.camY;
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(sx + 1, sy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
            // Pulsing glow
            const pulse = Math.sin(this.animFrame * 0.1) * 0.3 + 0.3;
            ctx.strokeStyle = `rgba(255,255,255,${pulse})`;
            ctx.lineWidth = 3;
            ctx.strokeRect(sx - 1, sy - 1, TILE_SIZE + 2, TILE_SIZE + 2);
        }
    },

    _drawCityOnMap(ctx, sx, sy, col, row) {
        const city = GameState.getCityAt(col, row);
        const s = TILE_SIZE;
        const ownerColor = city && city.owner >= 0
            ? GameState.players[city.owner].color.primary
            : '#888';

        // City walls
        ctx.fillStyle = ownerColor;
        ctx.fillRect(sx + 4, sy + 4, s - 8, s - 8);

        // Inner area
        ctx.fillStyle = this._lighten(ownerColor, 30);
        ctx.fillRect(sx + 8, sy + 8, s - 16, s - 16);

        // Towers at corners
        ctx.fillStyle = ownerColor;
        ctx.fillRect(sx + 2, sy + 2, 6, 6);
        ctx.fillRect(sx + s - 8, sy + 2, 6, 6);
        ctx.fillRect(sx + 2, sy + s - 8, 6, 6);
        ctx.fillRect(sx + s - 8, sy + s - 8, 6, 6);

        // Tower tops
        ctx.fillStyle = this._darken(ownerColor, 20);
        ctx.fillRect(sx + 3, sy + 1, 4, 2);
        ctx.fillRect(sx + s - 7, sy + 1, 4, 2);
        ctx.fillRect(sx + 3, sy + s - 3, 4, 2);
        ctx.fillRect(sx + s - 7, sy + s - 3, 4, 2);

        // Capital marker
        if (city && city.isCapital) {
            ctx.fillStyle = '#ffd700';
            ctx.beginPath();
            ctx.arc(sx + s / 2, sy + s / 2, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Grid line
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(sx + 0.5, sy + 0.5, s - 1, s - 1);
    },

    _drawArmy(ctx, sx, sy, army) {
        const s = TILE_SIZE;
        const color = army.owner >= 0
            ? GameState.players[army.owner].color.primary
            : '#888';
        const bannerColor = army.owner >= 0
            ? GameState.players[army.owner].color.banner
            : '#666';

        // Banner/flag background
        ctx.fillStyle = bannerColor;
        ctx.fillRect(sx + 6, sy + 4, s - 12, s - 8);

        // Unit count indicator
        const count = army.units.length;
        ctx.fillStyle = color;
        ctx.fillRect(sx + 8, sy + 6, s - 16, s - 12);

        // Unit symbol (first unit)
        const mainUnit = army.units[0];
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(mainUnit.symbol, sx + s / 2, sy + s / 2 - 2);

        // Stack size indicator
        if (count > 1) {
            ctx.fillStyle = '#ffd700';
            ctx.font = 'bold 9px monospace';
            ctx.fillText(count.toString(), sx + s - 10, sy + s - 8);
        }

        // Hero star
        if (Units.armyHasHero(army)) {
            ctx.fillStyle = '#ffd700';
            this._drawStar(ctx, sx + 10, sy + 8, 4);
        }

        // Movement dots
        if (army.owner === GameState.currentPlayer && army.movesLeft > 0) {
            ctx.fillStyle = '#0f0';
            const dots = Math.min(3, Math.ceil(army.movesLeft));
            for (let i = 0; i < dots; i++) {
                ctx.beginPath();
                ctx.arc(sx + 12 + i * 6, sy + s - 5, 2, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    },

    _drawStar(ctx, x, y, r) {
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * 4 * Math.PI) / 5 - Math.PI / 2;
            const px = x + r * Math.cos(angle);
            const py = y + r * Math.sin(angle);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
    },

    _drawReachableTiles(ctx) {
        const army = GameState.selectedArmy;
        if (!army) return;
        const reachable = Movement.getReachableTiles(army);

        for (const [key] of reachable) {
            const [c, r] = key.split(',').map(Number);
            if (c === army.col && r === army.row) continue;
            const sx = c * TILE_SIZE - this.camX;
            const sy = r * TILE_SIZE - this.camY;

            // Check if enemy
            const other = GameState.getArmyAt(c, r);
            if (other && other.owner !== army.owner) {
                ctx.fillStyle = 'rgba(255,50,50,0.25)';
            } else {
                ctx.fillStyle = 'rgba(100,200,255,0.2)';
            }
            ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
        }
    },

    _drawPath(ctx, path) {
        if (path.length < 2) return;
        ctx.strokeStyle = 'rgba(255,255,100,0.7)';
        ctx.lineWidth = 3;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        for (let i = 0; i < path.length; i++) {
            const px = path[i].col * TILE_SIZE + TILE_SIZE / 2 - this.camX;
            const py = path[i].row * TILE_SIZE + TILE_SIZE / 2 - this.camY;
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    },

    _lighten(hex, amount) {
        const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
        const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
        const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
        return `rgb(${r},${g},${b})`;
    },

    _darken(hex, amount) {
        const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
        const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
        const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
        return `rgb(${r},${g},${b})`;
    },

    screenToTile(sx, sy) {
        const col = Math.floor((sx + this.camX) / TILE_SIZE);
        const row = Math.floor((sy + this.camY) / TILE_SIZE);
        return { col, row };
    },

    centerOn(col, row) {
        this.camX = col * TILE_SIZE - this.canvas.width / 2;
        this.camY = row * TILE_SIZE - this.canvas.height / 2;
        this.clampCamera();
    },

    clampCamera() {
        const maxX = MAP_COLS * TILE_SIZE - this.canvas.width;
        const maxY = MAP_ROWS * TILE_SIZE - this.canvas.height;
        this.camX = Utils.clamp(this.camX, 0, Math.max(0, maxX));
        this.camY = Utils.clamp(this.camY, 0, Math.max(0, maxY));
    },
};
