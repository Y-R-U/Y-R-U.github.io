// Procedural world generation - islands, ports, ocean

import { SeededRandom, dist } from './utils.js';

const TILE_SIZE = 64;
const CHUNK_SIZE = 16; // tiles per chunk
const CHUNK_PX = CHUNK_SIZE * TILE_SIZE;

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
    constructor() {
        this.chunks = new Map();
        this.islands = [];
        this.ports = [];
        this.worldSeed = Math.floor(Math.random() * 999999);
        this.portNameIdx = 0;

        // Start area island with home port
        this._generateStartArea();
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

        this.chunks.set(key, chunk);
    }

    _placeIslandInChunk(chunk, cx, cy, rng, distFromOrigin) {
        const islandCenterTX = rng.int(3, CHUNK_SIZE - 4);
        const islandCenterTY = rng.int(3, CHUNK_SIZE - 4);
        const radius = rng.int(2, 5);

        const worldCenterX = cx * CHUNK_PX + islandCenterTX * TILE_SIZE + TILE_SIZE / 2;
        const worldCenterY = cy * CHUNK_PX + islandCenterTY * TILE_SIZE + TILE_SIZE / 2;

        // Check not too close to existing islands
        for (const isl of this.islands) {
            if (dist(worldCenterX, worldCenterY, isl.x, isl.y) < 500) return;
        }

        // Place tiles
        for (let ty = 0; ty < CHUNK_SIZE; ty++) {
            for (let tx = 0; tx < CHUNK_SIZE; tx++) {
                const d = dist(tx, ty, islandCenterTX, islandCenterTY);
                if (d < radius + (rng.next() - 0.5) * 1.5) {
                    if (d < radius - 1) {
                        chunk.tiles[ty * CHUNK_SIZE + tx] = 2; // Inner land
                    } else {
                        chunk.tiles[ty * CHUNK_SIZE + tx] = 1; // Beach/shore
                    }
                }
            }
        }

        chunk.hasIsland = true;

        const island = {
            x: worldCenterX,
            y: worldCenterY,
            radius: radius * TILE_SIZE,
            hasPort: rng.next() < 0.6
        };
        this.islands.push(island);

        // Maybe add a port
        if (island.hasPort) {
            const portType = PORT_TYPES[rng.int(0, PORT_TYPES.length - 1)];
            const name = PORT_NAMES[this.portNameIdx % PORT_NAMES.length];
            this.portNameIdx++;
            const portAngle = rng.float(0, Math.PI * 2);
            this.ports.push({
                x: worldCenterX + Math.cos(portAngle) * radius * TILE_SIZE * 0.5,
                y: worldCenterY + Math.sin(portAngle) * radius * TILE_SIZE * 0.5,
                name,
                type: portType,
                radius: 80,
                discovered: false,
                isHome: false,
                prices: this._generatePrices(portType)
            });
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
                    // Water - use tile sprites or procedural
                    const waterImg = assets.get('tile_water');
                    if (waterImg) {
                        ctx.drawImage(waterImg, sx, sy, TILE_SIZE, TILE_SIZE);
                    } else {
                        // Animated water color
                        const wave = Math.sin((tx + ty) * 0.3 + performance.now() * 0.001) * 10;
                        ctx.fillStyle = `rgb(${20 + wave}, ${60 + wave}, ${120 + wave})`;
                        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                    }
                } else if (tile === 1) {
                    // Beach
                    const beachImg = assets.get('tile_beach');
                    if (beachImg) {
                        ctx.drawImage(beachImg, sx, sy, TILE_SIZE, TILE_SIZE);
                    } else {
                        ctx.fillStyle = '#d4b86a';
                        ctx.fillRect(sx, sy, TILE_SIZE, TILE_SIZE);
                    }
                } else if (tile === 2) {
                    // Land
                    const landImg = assets.get('tile_land');
                    if (landImg) {
                        ctx.drawImage(landImg, sx, sy, TILE_SIZE, TILE_SIZE);
                    } else {
                        ctx.fillStyle = '#3a7a3a';
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
