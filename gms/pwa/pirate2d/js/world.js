// Procedural world generation - islands, ports, ocean

import { SeededRandom, dist } from './utils.js';

const TILE_SIZE = 64;
const CHUNK_SIZE = 16; // tiles per chunk
const CHUNK_PX = CHUNK_SIZE * TILE_SIZE;

// Custom island template storage key
const CUSTOM_ISLANDS_KEY = 'pirate2d_custom_islands';

// Tile sprite cache: tileNum -> Image (lazy-loaded)
const _tileCache = new Map();
const _tilePending = new Set();

function getTileSpriteAsync(num) {
    if (_tileCache.has(num)) return _tileCache.get(num);
    if (_tilePending.has(num)) return null;
    _tilePending.add(num);
    const img = new Image();
    const padded = String(num).padStart(2, '0');
    img.onload = () => { _tileCache.set(num, img); _tilePending.delete(num); };
    img.onerror = () => { _tilePending.delete(num); };
    img.src = `assets/tiles/tile_${padded}.png`;
    return null;
}

// Pre-cache the two tiles used by procedural generation
getTileSpriteAsync(1);
getTileSpriteAsync(42);

// Port names
const PORT_NAMES = [
    'Tortuga', 'Nassau', 'Port Royal', 'Havana', 'Santiago',
    'Barbados', 'Trinidad', 'Martinique', 'Curacao', 'Cartagena',
    'Maracaibo', 'Veracruz', 'Portobelo', 'Kingston', 'Bridgetown',
    'Santa Marta', 'Campeche', 'Belize Town', 'Isla de Muerta', 'Devil\'s Cove',
    'Blackwater Bay', 'Skull Harbor', 'Rumrunner\'s Rest', 'Siren\'s Call', 'Deadman\'s Wharf',
    'Coral Haven', 'Windward Port', 'Stormbreak', 'Anchor\'s End', 'Driftwood Landing'
];

const PORT_TYPES = ['trading', 'military', 'pirate', 'fishing'];

export class World {
    constructor(savedState) {
        this.chunks = new Map();
        this.islands = [];
        this.ports = [];
        this._loadCustomTemplates();

        if (savedState) {
            // Restore from saved state
            this.worldSeed = savedState.worldSeed;
            this.portNameIdx = savedState.portNameIdx;
            this.ports = savedState.ports || [];
            this.islands = savedState.islands || [];
        } else {
            this.worldSeed = Math.floor(Math.random() * 999999);
            this.portNameIdx = 0;
            this._generateStartArea();
        }
    }

    _loadCustomTemplates() {
        try {
            this.customTemplates = JSON.parse(localStorage.getItem(CUSTOM_ISLANDS_KEY) || '[]');
        } catch {
            this.customTemplates = [];
        }
        // Pre-cache tile sprites used by custom templates
        for (const tpl of this.customTemplates) {
            if (tpl.tiles) {
                for (const t of tpl.tiles) {
                    if (t > 0) getTileSpriteAsync(t);
                }
            }
        }
    }

    _generateStartArea() {
        // Create a small home island at origin area
        const homeIsland = {
            x: 200, y: 200,
            radius: 180,
            tiles: [],
            hasPort: true
        };
        this.islands.push(homeIsland);

        this.ports.push({
            x: 200, y: 120,
            name: 'Haven\'s Rest',
            type: 'trading',
            radius: 100,
            discovered: true,
            isHome: true,
            prices: this._generatePrices('trading')
        });
    }

    _generatePrices(type) {
        const base = {
            'Rum': 20, 'Spices': 35, 'Silk': 50,
            'Sugar': 15, 'Tobacco': 25, 'Gold Ore': 80,
            'Gunpowder': 40, 'Medicine': 60
        };

        const prices = {};
        const rng = new SeededRandom(this.worldSeed + this.portNameIdx * 137);

        for (const [item, basePrice] of Object.entries(base)) {
            let mult = 0.5 + rng.next() * 1.5;
            // Type modifiers
            if (type === 'pirate' && (item === 'Rum' || item === 'Gunpowder')) mult *= 0.6;
            if (type === 'military' && item === 'Gunpowder') mult *= 0.5;
            if (type === 'trading') mult *= 0.85;
            if (type === 'fishing' && item === 'Sugar') mult *= 0.7;
            prices[item] = Math.round(basePrice * mult);
        }
        return prices;
    }

    getChunkKey(cx, cy) {
        return `${cx},${cy}`;
    }

    getChunkCoord(worldX, worldY) {
        return {
            cx: Math.floor(worldX / CHUNK_PX),
            cy: Math.floor(worldY / CHUNK_PX)
        };
    }

    ensureChunksAround(worldX, worldY, viewW, viewH) {
        const margin = CHUNK_PX;
        const x1 = Math.floor((worldX - viewW / 2 - margin) / CHUNK_PX);
        const y1 = Math.floor((worldY - viewH / 2 - margin) / CHUNK_PX);
        const x2 = Math.floor((worldX + viewW / 2 + margin) / CHUNK_PX);
        const y2 = Math.floor((worldY + viewH / 2 + margin) / CHUNK_PX);

        for (let cy = y1; cy <= y2; cy++) {
            for (let cx = x1; cx <= x2; cx++) {
                const key = this.getChunkKey(cx, cy);
                if (!this.chunks.has(key)) {
                    this._generateChunk(cx, cy);
                }
            }
        }
    }

    _generateChunk(cx, cy) {
        const key = this.getChunkKey(cx, cy);
        const rng = new SeededRandom(this.worldSeed + cx * 73856093 + cy * 19349669);
        const chunk = {
            cx, cy,
            tiles: new Array(CHUNK_SIZE * CHUNK_SIZE).fill(0), // 0 = water
            hasIsland: false
        };

        const chunkWorldX = cx * CHUNK_PX + CHUNK_PX / 2;
        const chunkWorldY = cy * CHUNK_PX + CHUNK_PX / 2;
        const distFromOrigin = dist(chunkWorldX, chunkWorldY, 200, 200);

        // Island generation chance increases slightly with distance but stays reasonable
        let islandChance = 0.12;
        if (distFromOrigin < CHUNK_PX * 2) islandChance = 0; // Don't crowd start area

        if (rng.next() < islandChance) {
            this._placeIslandInChunk(chunk, cx, cy, rng, distFromOrigin);
        }

        // Stamp existing islands that overlap this chunk (e.g. home island)
        this._stampExistingIslands(chunk, cx, cy);

        this.chunks.set(key, chunk);
    }

    _placeIslandInChunk(chunk, cx, cy, rng, distFromOrigin) {
        const islandCenterTX = rng.int(3, CHUNK_SIZE - 4);
        const islandCenterTY = rng.int(3, CHUNK_SIZE - 4);
        const radius = rng.int(2, 5);

        const worldCenterX = cx * CHUNK_PX + islandCenterTX * TILE_SIZE + TILE_SIZE / 2;
        const worldCenterY = cy * CHUNK_PX + islandCenterTY * TILE_SIZE + TILE_SIZE / 2;

        // Check if island already exists here (from saved state)
        let alreadyExists = false;
        for (const isl of this.islands) {
            if (dist(worldCenterX, worldCenterY, isl.x, isl.y) < 500) {
                alreadyExists = true;
                break;
            }
        }

        // Pick a custom template if available, otherwise procedural
        const templateIdx = this.customTemplates.length > 0
            ? rng.int(0, this.customTemplates.length - 1) : -1;
        const template = templateIdx >= 0 ? this.customTemplates[templateIdx] : null;

        if (template) {
            // Stamp custom template tiles centered on island position
            const tw = template.width;
            const th = template.height;
            const startTX = islandCenterTX - Math.floor(tw / 2);
            const startTY = islandCenterTY - Math.floor(th / 2);
            for (let y = 0; y < th; y++) {
                for (let x = 0; x < tw; x++) {
                    const cx2 = startTX + x;
                    const cy2 = startTY + y;
                    if (cx2 >= 0 && cx2 < CHUNK_SIZE && cy2 >= 0 && cy2 < CHUNK_SIZE) {
                        const tileVal = template.tiles[y * tw + x];
                        if (tileVal > 0) {
                            chunk.tiles[cy2 * CHUNK_SIZE + cx2] = tileVal;
                        }
                    }
                }
            }
        } else {
            // Procedural island - tile 42 = beach, tile 1 = land
            for (let ty = 0; ty < CHUNK_SIZE; ty++) {
                for (let tx = 0; tx < CHUNK_SIZE; tx++) {
                    const d = dist(tx, ty, islandCenterTX, islandCenterTY);
                    if (d < radius + (rng.next() - 0.5) * 1.5) {
                        if (d < radius - 1) {
                            chunk.tiles[ty * CHUNK_SIZE + tx] = 1; // Land (tile_01)
                        } else {
                            chunk.tiles[ty * CHUNK_SIZE + tx] = 42; // Beach (tile_42)
                        }
                    }
                }
            }
        }

        chunk.hasIsland = true;

        if (alreadyExists) {
            // Consume rng to keep in sync with normal generation path
            const _hasPort = rng.next() < 0.6;
            if (_hasPort) {
                rng.int(0, PORT_TYPES.length - 1);
                rng.float(0, Math.PI * 2);
            }
            return;
        }

        // Calculate effective radius based on template or procedural
        const effectiveRadius = template
            ? Math.max(template.width, template.height) / 2 * TILE_SIZE
            : radius * TILE_SIZE;

        const island = {
            x: worldCenterX,
            y: worldCenterY,
            radius: effectiveRadius,
            hasPort: false,
            templateId: template ? template.id : null,
            name: template ? template.name : null
        };

        // Check for hotspot-based ports from template
        if (template && template.hotspots) {
            const startTX = islandCenterTX - Math.floor(template.width / 2);
            const startTY = islandCenterTY - Math.floor(template.height / 2);
            for (const hs of template.hotspots) {
                const hx = cx * CHUNK_PX + (startTX + hs.tx) * TILE_SIZE + TILE_SIZE / 2;
                const hy = cy * CHUNK_PX + (startTY + hs.ty) * TILE_SIZE + TILE_SIZE / 2;
                if (hs.type === 'port') {
                    island.hasPort = true;
                    const portType = PORT_TYPES[rng.int(0, PORT_TYPES.length - 1)];
                    const name = PORT_NAMES[this.portNameIdx % PORT_NAMES.length];
                    this.portNameIdx++;
                    this.ports.push({
                        x: hx, y: hy, name, type: portType,
                        radius: 80, discovered: false, isHome: false,
                        prices: this._generatePrices(portType)
                    });
                }
                // treasure_map hotspots stored on island for future use
            }
            // Consume rng to stay in sync with procedural path
            if (!island.hasPort) {
                const _hasPort = rng.next() < 0.6;
                if (_hasPort) {
                    rng.int(0, PORT_TYPES.length - 1);
                    rng.float(0, Math.PI * 2);
                }
            }
        } else {
            // Procedural port placement
            island.hasPort = rng.next() < 0.6;
            if (island.hasPort) {
                const portType = PORT_TYPES[rng.int(0, PORT_TYPES.length - 1)];
                const name = PORT_NAMES[this.portNameIdx % PORT_NAMES.length];
                this.portNameIdx++;
                const portAngle = rng.float(0, Math.PI * 2);
                this.ports.push({
                    x: worldCenterX + Math.cos(portAngle) * radius * TILE_SIZE * 0.5,
                    y: worldCenterY + Math.sin(portAngle) * radius * TILE_SIZE * 0.5,
                    name, type: portType,
                    radius: 80, discovered: false, isHome: false,
                    prices: this._generatePrices(portType)
                });
            }
        }

        this.islands.push(island);
    }

    _stampExistingIslands(chunk, cx, cy) {
        // Place tiles for pre-existing islands (like home island) that overlap this chunk
        const chunkX = cx * CHUNK_PX;
        const chunkY = cy * CHUNK_PX;

        for (const isl of this.islands) {
            if (!isl.radius) continue;
            const radiusTiles = isl.radius / TILE_SIZE;
            // Quick bounding box check
            if (isl.x + isl.radius < chunkX || isl.x - isl.radius > chunkX + CHUNK_PX) continue;
            if (isl.y + isl.radius < chunkY || isl.y - isl.radius > chunkY + CHUNK_PX) continue;

            for (let ty = 0; ty < CHUNK_SIZE; ty++) {
                for (let tx = 0; tx < CHUNK_SIZE; tx++) {
                    if (chunk.tiles[ty * CHUNK_SIZE + tx] > 0) continue; // already has tile
                    const wx = chunkX + tx * TILE_SIZE + TILE_SIZE / 2;
                    const wy = chunkY + ty * TILE_SIZE + TILE_SIZE / 2;
                    const d = dist(wx, wy, isl.x, isl.y);
                    if (d < isl.radius) {
                        chunk.tiles[ty * CHUNK_SIZE + tx] = d < isl.radius * 0.7 ? 1 : 42;
                        chunk.hasIsland = true;
                    }
                }
            }
        }
    }

    getTile(worldX, worldY) {
        const cx = Math.floor(worldX / CHUNK_PX);
        const cy = Math.floor(worldY / CHUNK_PX);
        const key = this.getChunkKey(cx, cy);
        const chunk = this.chunks.get(key);
        if (!chunk) return 0;

        const localX = Math.floor((worldX - cx * CHUNK_PX) / TILE_SIZE);
        const localY = Math.floor((worldY - cy * CHUNK_PX) / TILE_SIZE);
        if (localX < 0 || localX >= CHUNK_SIZE || localY < 0 || localY >= CHUNK_SIZE) return 0;
        return chunk.tiles[localY * CHUNK_SIZE + localX];
    }

    isLand(worldX, worldY) {
        return this.getTile(worldX, worldY) > 0;
    }

    getNearestPort(x, y, maxDist = 150) {
        let nearest = null;
        let nearestDist = maxDist;
        for (const port of this.ports) {
            const d = dist(x, y, port.x, port.y);
            if (d < nearestDist) {
                nearestDist = d;
                nearest = port;
            }
        }
        return nearest;
    }

    // Serialize for localStorage
    serializeState() {
        return {
            worldSeed: this.worldSeed,
            portNameIdx: this.portNameIdx,
            ports: this.ports.map(p => ({
                x: p.x, y: p.y, name: p.name, type: p.type,
                radius: p.radius, discovered: p.discovered,
                isHome: p.isHome, prices: p.prices
            })),
            islands: this.islands.map(i => ({
                x: i.x, y: i.y, radius: i.radius, hasPort: i.hasPort
            }))
        };
    }

    draw(ctx, camX, camY, viewW, viewH, assets) {
        const startX = Math.floor((camX - viewW / 2) / TILE_SIZE) - 1;
        const startY = Math.floor((camY - viewH / 2) / TILE_SIZE) - 1;
        const endX = Math.ceil((camX + viewW / 2) / TILE_SIZE) + 1;
        const endY = Math.ceil((camY + viewH / 2) / TILE_SIZE) + 1;

        // Draw water background
        for (let ty = startY; ty <= endY; ty++) {
            for (let tx = startX; tx <= endX; tx++) {
                const wx = tx * TILE_SIZE;
                const wy = ty * TILE_SIZE;
                const sx = wx - camX + viewW / 2;
                const sy = wy - camY + viewH / 2;

                const tile = this.getTile(wx + TILE_SIZE / 2, wy + TILE_SIZE / 2);

                if (tile === 0) {
                    // Water - procedural animated water
                    const wave = Math.sin((tx + ty) * 0.3 + performance.now() * 0.001) * 10;
                    ctx.fillStyle = `rgb(${20 + wave}, ${60 + wave}, ${120 + wave})`;
                    ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                } else {
                    // Land tile - look up sprite by tile number
                    const tileImg = getTileSpriteAsync(tile);
                    if (tileImg) {
                        ctx.drawImage(tileImg, sx, sy, TILE_SIZE, TILE_SIZE);
                    } else {
                        // Fallback color while loading
                        ctx.fillStyle = tile === 42 ? '#d4b86a' : '#3a7a3a';
                        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }

        // Draw port markers
        for (const port of this.ports) {
            const sx = port.x - camX + viewW / 2;
            const sy = port.y - camY + viewH / 2;

            // Only draw if on screen
            if (sx < -100 || sx > viewW + 100 || sy < -100 || sy > viewH + 100) continue;

            // Port circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(sx, sy, 12, 0, Math.PI * 2);
            ctx.fillStyle = port.isHome ? '#44cc44' : (port.discovered ? '#cc9933' : '#666666');
            ctx.fill();
            ctx.strokeStyle = '#ffd700';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Anchor icon
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Georgia';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('\u2693', sx, sy);

            // Port name (if discovered)
            if (port.discovered) {
                ctx.font = 'bold 11px Georgia';
                ctx.fillStyle = '#ffd700';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.strokeText(port.name, sx, sy - 20);
                ctx.fillText(port.name, sx, sy - 20);
            }
            ctx.restore();
        }
    }

    drawMinimap(ctx, playerX, playerY, size) {
        const scale = 0.02;
        const halfSize = size / 2;

        // Background
        ctx.fillStyle = '#0a1628';
        ctx.beginPath();
        ctx.arc(halfSize, halfSize, halfSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.clip();

        // Draw islands
        for (const island of this.islands) {
            const ix = (island.x - playerX) * scale + halfSize;
            const iy = (island.y - playerY) * scale + halfSize;
            const ir = Math.max(3, island.radius * scale);

            if (ix < -ir || ix > size + ir || iy < -ir || iy > size + ir) continue;

            ctx.fillStyle = '#3a7a3a';
            ctx.beginPath();
            ctx.arc(ix, iy, ir, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw ports
        for (const port of this.ports) {
            if (!port.discovered) continue;
            const px = (port.x - playerX) * scale + halfSize;
            const py = (port.y - playerY) * scale + halfSize;
            if (px < 0 || px > size || py < 0 || py > size) continue;

            ctx.fillStyle = port.isHome ? '#44cc44' : '#cc9933';
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
        }

        // Player dot (center)
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(halfSize, halfSize, 3, 0, Math.PI * 2);
        ctx.fill();

        // Border
        ctx.strokeStyle = '#8b6914';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(halfSize, halfSize, halfSize - 1, 0, Math.PI * 2);
        ctx.stroke();
    }
}

export { TILE_SIZE, CHUNK_SIZE, CHUNK_PX };
