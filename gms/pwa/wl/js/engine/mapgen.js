// mapgen.js - Procedural map generation
'use strict';

const MapGen = {
    generate(numPlayers, mapType) {
        const tiles = [];
        for (let r = 0; r < MAP_ROWS; r++) {
            tiles[r] = [];
            for (let c = 0; c < MAP_COLS; c++) {
                tiles[r][c] = TERRAIN.GRASS.id;
            }
        }
        this._generateTerrain(tiles, mapType);
        const cities = this._placeCities(tiles, numPlayers);
        const ruins = this._placeRuins(tiles, cities);
        this._placeRoads(tiles, cities);
        return { tiles, cities, ruins };
    },

    _generateTerrain(tiles, mapType) {
        const mapTypeConfig = MAP_TYPES[mapType] || MAP_TYPES.continents;
        const waterThreshold = mapTypeConfig.waterChance;

        // Scale blobs with map size
        const blobCount = Math.max(6, Math.floor(MAP_COLS * MAP_ROWS / 150));
        const heightMap = this._noiseMap(MAP_COLS, MAP_ROWS, blobCount);
        const moistureMap = this._noiseMap(MAP_COLS, MAP_ROWS, Math.floor(blobCount * 0.8));

        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                const h = heightMap[r][c];
                const m = moistureMap[r][c];
                if (h < waterThreshold) {
                    tiles[r][c] = TERRAIN.WATER.id;
                } else if (h < 0.3) {
                    tiles[r][c] = m > 0.6 ? TERRAIN.SWAMP.id : TERRAIN.GRASS.id;
                } else if (h < 0.6) {
                    tiles[r][c] = m > 0.55 ? TERRAIN.FOREST.id : TERRAIN.GRASS.id;
                } else if (h < 0.75) {
                    tiles[r][c] = TERRAIN.HILLS.id;
                } else {
                    tiles[r][c] = TERRAIN.MOUNTAIN.id;
                }
            }
        }

        // Ensure map edges have some water
        for (let r = 0; r < MAP_ROWS; r++) {
            if (Math.random() < 0.6) tiles[r][0] = TERRAIN.WATER.id;
            if (Math.random() < 0.6) tiles[r][MAP_COLS - 1] = TERRAIN.WATER.id;
        }
        for (let c = 0; c < MAP_COLS; c++) {
            if (Math.random() < 0.6) tiles[0][c] = TERRAIN.WATER.id;
            if (Math.random() < 0.6) tiles[MAP_ROWS - 1][c] = TERRAIN.WATER.id;
        }
    },

    _noiseMap(w, h, numBlobs) {
        const map = Array.from({ length: h }, () => Array(w).fill(0.5));
        for (let b = 0; b < numBlobs; b++) {
            const cx = Utils.rand(0, w - 1);
            const cy = Utils.rand(0, h - 1);
            const radius = Utils.rand(4, 12);
            const sign = Math.random() < 0.5 ? 1 : -1;
            const strength = Utils.randFloat(0.2, 0.4);
            for (let r = 0; r < h; r++) {
                for (let c = 0; c < w; c++) {
                    const d = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2);
                    if (d < radius) {
                        const falloff = 1 - (d / radius);
                        map[r][c] += sign * strength * falloff * falloff;
                    }
                }
            }
        }
        // Add smaller detail blobs
        for (let b = 0; b < numBlobs * 3; b++) {
            const cx = Utils.rand(0, w - 1);
            const cy = Utils.rand(0, h - 1);
            const radius = Utils.rand(2, 5);
            const sign = Math.random() < 0.5 ? 1 : -1;
            const strength = Utils.randFloat(0.1, 0.25);
            for (let r = Math.max(0, cy - radius); r < Math.min(h, cy + radius); r++) {
                for (let c = Math.max(0, cx - radius); c < Math.min(w, cx + radius); c++) {
                    const d = Math.sqrt((c - cx) ** 2 + (r - cy) ** 2);
                    if (d < radius) {
                        const falloff = 1 - (d / radius);
                        map[r][c] += sign * strength * falloff;
                    }
                }
            }
        }
        // Normalize to 0-1
        let min = Infinity, max = -Infinity;
        for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
                min = Math.min(min, map[r][c]);
                max = Math.max(max, map[r][c]);
            }
        }
        const range = max - min || 1;
        for (let r = 0; r < h; r++) {
            for (let c = 0; c < w; c++) {
                map[r][c] = (map[r][c] - min) / range;
            }
        }
        return map;
    },

    _placeCities(tiles, numPlayers) {
        const cities = [];
        const names = Utils.shuffle([...CITY_NAMES]);
        const totalCities = numPlayers * 4; // ~4 cities per player
        const minDist = 4;

        // Place starting cities for each player spread across the map
        const zones = this._getPlayerZones(numPlayers);

        for (let p = 0; p < numPlayers; p++) {
            const zone = zones[p];
            const pos = this._findCitySpot(tiles, cities, zone, minDist);
            if (pos) {
                const city = {
                    id: Utils.uid(),
                    name: names.pop() || `City ${cities.length}`,
                    col: pos[0],
                    row: pos[1],
                    owner: p,
                    production: null,
                    turnsLeft: 0,
                    income: 4 + Utils.rand(0, 2),
                    isCapital: true,
                };
                cities.push(city);
                tiles[pos[1]][pos[0]] = TERRAIN.CITY.id;
            }
        }

        // Place neutral cities
        for (let i = cities.length; i < totalCities; i++) {
            const pos = this._findCitySpotAnywhere(tiles, cities, minDist);
            if (pos) {
                const city = {
                    id: Utils.uid(),
                    name: names.pop() || `City ${cities.length}`,
                    col: pos[0],
                    row: pos[1],
                    owner: -1,
                    production: null,
                    turnsLeft: 0,
                    income: 2 + Utils.rand(0, 3),
                    isCapital: false,
                };
                cities.push(city);
                tiles[pos[1]][pos[0]] = TERRAIN.CITY.id;
            }
        }

        return cities;
    },

    _getPlayerZones(numPlayers) {
        const zones = [];
        const margin = 4;
        const w = MAP_COLS - margin * 2;
        const h = MAP_ROWS - margin * 2;

        if (numPlayers <= 2) {
            zones.push({ x: margin, y: margin, w: w / 2, h });
            zones.push({ x: margin + w / 2, y: margin, w: w / 2, h });
        } else if (numPlayers <= 4) {
            zones.push({ x: margin, y: margin, w: w / 2, h: h / 2 });
            zones.push({ x: margin + w / 2, y: margin, w: w / 2, h: h / 2 });
            zones.push({ x: margin, y: margin + h / 2, w: w / 2, h: h / 2 });
            zones.push({ x: margin + w / 2, y: margin + h / 2, w: w / 2, h: h / 2 });
        } else {
            // 2 rows, spread evenly
            const cols = Math.ceil(numPlayers / 2);
            const zw = w / cols;
            for (let i = 0; i < numPlayers; i++) {
                const row = Math.floor(i / cols);
                const col = i % cols;
                zones.push({ x: margin + col * zw, y: margin + row * (h / 2), w: zw, h: h / 2 });
            }
        }
        return zones;
    },

    _findCitySpot(tiles, existingCities, zone, minDist) {
        for (let attempt = 0; attempt < 200; attempt++) {
            const c = Utils.rand(Math.floor(zone.x), Math.floor(zone.x + zone.w - 1));
            const r = Utils.rand(Math.floor(zone.y), Math.floor(zone.y + zone.h - 1));
            if (!Utils.inBounds(c, r)) continue;
            const t = tiles[r][c];
            if (t === TERRAIN.WATER.id || t === TERRAIN.MOUNTAIN.id || t === TERRAIN.CITY.id) continue;
            const tooClose = existingCities.some(ct => Utils.dist(ct.col, ct.row, c, r) < minDist);
            if (tooClose) continue;
            // Clear surrounding area
            this._clearAroundCity(tiles, c, r);
            return [c, r];
        }
        return null;
    },

    _findCitySpotAnywhere(tiles, existingCities, minDist) {
        return this._findCitySpot(tiles, existingCities, { x: 3, y: 3, w: MAP_COLS - 6, h: MAP_ROWS - 6 }, minDist);
    },

    _clearAroundCity(tiles, col, row) {
        // Ensure the city and adjacent tiles are passable
        for (const [nc, nr] of Utils.cardinalNeighbors(col, row)) {
            if (tiles[nr][nc] === TERRAIN.WATER.id || tiles[nr][nc] === TERRAIN.MOUNTAIN.id) {
                tiles[nr][nc] = TERRAIN.GRASS.id;
            }
        }
    },

    _placeRuins(tiles, cities) {
        const ruins = [];
        const numRuins = Utils.rand(6, 10);
        for (let i = 0; i < numRuins; i++) {
            for (let attempt = 0; attempt < 100; attempt++) {
                const c = Utils.rand(2, MAP_COLS - 3);
                const r = Utils.rand(2, MAP_ROWS - 3);
                const t = tiles[r][c];
                if (t === TERRAIN.WATER.id || t === TERRAIN.MOUNTAIN.id ||
                    t === TERRAIN.CITY.id || t === TERRAIN.RUIN.id) continue;
                const nearCity = cities.some(ct => Utils.dist(ct.col, ct.row, c, r) < 3);
                if (nearCity) continue;
                tiles[r][c] = TERRAIN.RUIN.id;
                ruins.push({
                    id: Utils.uid(),
                    col: c,
                    row: r,
                    searched: false,
                    reward: null, // Rolled dynamically when searched
                });
                break;
            }
        }
        return ruins;
    },

    _placeRoads(tiles, cities) {
        // Connect nearby cities with roads using simple pathfinding
        const connected = new Set();
        const sorted = [...cities].sort((a, b) => a.col - b.col);
        for (let i = 0; i < sorted.length; i++) {
            let bestDist = Infinity;
            let bestJ = -1;
            for (let j = 0; j < sorted.length; j++) {
                if (i === j) continue;
                const key = [Math.min(i, j), Math.max(i, j)].join(',');
                if (connected.has(key)) continue;
                const d = Utils.dist(sorted[i].col, sorted[i].row, sorted[j].col, sorted[j].row);
                if (d < bestDist && d < 15) {
                    bestDist = d;
                    bestJ = j;
                }
            }
            if (bestJ >= 0) {
                const key = [Math.min(i, bestJ), Math.max(i, bestJ)].join(',');
                connected.add(key);
                this._drawRoad(tiles, sorted[i].col, sorted[i].row, sorted[bestJ].col, sorted[bestJ].row);
            }
        }
    },

    _drawRoad(tiles, x1, y1, x2, y2) {
        let cx = x1, cy = y1;
        while (cx !== x2 || cy !== y2) {
            if (tiles[cy][cx] === TERRAIN.GRASS.id) {
                tiles[cy][cx] = TERRAIN.ROAD.id;
            } else if (tiles[cy][cx] === TERRAIN.WATER.id) {
                tiles[cy][cx] = TERRAIN.BRIDGE.id;
            }
            if (cx < x2) cx++;
            else if (cx > x2) cx--;
            if (cy < y2) cy++;
            else if (cy > y2) cy--;
        }
    },
};
