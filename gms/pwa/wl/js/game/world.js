import { Tile, TERRAIN, TERRAIN_BY_ID } from './tile.js';
import { City }   from './city.js';
import { Player } from './player.js';
import { Army }   from './army.js';
import { Hero }   from './hero.js';
import { FACTIONS } from '../data/factions.js';

// --- Procedural map generation helpers ---

function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { return t * t * (3 - 2 * t); }

/** Multi-octave value noise, returns 2D array [y][x] in 0..1 */
function buildNoise(size, octaves = 4) {
  const grid = Array.from({ length: size }, () => new Float32Array(size));

  for (let oct = 1; oct <= octaves; oct++) {
    const freq = oct;
    const amp  = 1 / oct;
    // Random grid corners
    const pts = Array.from({ length: freq + 1 }, () =>
      Array.from({ length: freq + 1 }, () => Math.random())
    );

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = (x / size) * freq;
        const gy = (y / size) * freq;
        const gxi = Math.floor(gx), gyi = Math.floor(gy);
        const tx = smoothstep(gx - gxi), ty = smoothstep(gy - gyi);
        const gxi1 = Math.min(gxi + 1, freq), gyi1 = Math.min(gyi + 1, freq);
        const v = lerp(
          lerp(pts[gyi][gxi], pts[gyi][gxi1], tx),
          lerp(pts[gyi1][gxi], pts[gyi1][gxi1], tx),
          ty
        );
        grid[y][x] += v * amp;
      }
    }
  }

  // Normalise to 0..1
  let min = Infinity, max = -Infinity;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (grid[y][x] < min) min = grid[y][x];
    if (grid[y][x] > max) max = grid[y][x];
  }
  const range = max - min || 1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    grid[y][x] = (grid[y][x] - min) / range;
  }
  return grid;
}

const CITY_NAMES = {
  prefixes: ['Ash','Black','Dark','Frost','Gold','High','Iron','Moon','Red','Shadow','Silver','Storm','Sun','White'],
  suffixes: ['brook','dale','fall','ford','gate','haven','hold','keep','moor','pass','reach','rock','vale','watch'],
  ruins:    ['Ruins of Var','Lost Shrine','Fallen Tower','Ancient Vault','Sunken Keep','Ghost Hold','Tomb of Erak','Shattered Keep'],
  temples:  ['Temple of Light','Shrine of Power','Sacred Grove','Oracle Peak','Holy Citadel','Altar of Dawn'],
};
function randomCityName(type) {
  if (type === 'ruins')  return CITY_NAMES.ruins[Math.floor(Math.random()  * CITY_NAMES.ruins.length)];
  if (type === 'temple') return CITY_NAMES.temples[Math.floor(Math.random() * CITY_NAMES.temples.length)];
  return CITY_NAMES.prefixes[Math.floor(Math.random() * CITY_NAMES.prefixes.length)] +
         CITY_NAMES.suffixes[Math.floor(Math.random() * CITY_NAMES.suffixes.length)];
}

// --- World ---

export class World {
  /**
   * @param {number} mapSize - tiles per side
   * @param {number} numPlayers - total players (1 human + N AI)
   */
  constructor(mapSize, numPlayers) {
    this.mapSize   = mapSize;
    this.numPlayers = numPlayers;
    this.tiles     = [];
    this.cities    = [];
    this.armies    = [];
    this.players   = [];
    this.turn      = 1;
    this.currentPlayerIdx = 0;
    this.gameOver  = false;
    this.winner    = null;
    this.messageLog = [];
  }

  /** Full world generation entry point */
  generate() {
    this._buildTerrain();
    this._createPlayers();
    this._placeCities();
    this._giveStartingArmies();
  }

  // ---- Terrain ----

  _buildTerrain() {
    const sz = this.mapSize;
    this.tiles = Array.from({ length: sz }, (_, y) =>
      Array.from({ length: sz }, (_, x) => new Tile(x, y, TERRAIN.OCEAN))
    );

    const noise = buildNoise(sz);

    for (let y = 0; y < sz; y++) {
      for (let x = 0; x < sz; x++) {
        const edge = Math.min(x, y, sz - 1 - x, sz - 1 - y);
        if (edge < 2) continue; // keep ocean border

        // Circular island bias: values near centre are more likely land
        const cx = (x - sz/2) / (sz/2);
        const cy = (y - sz/2) / (sz/2);
        const distBias = Math.sqrt(cx*cx + cy*cy) * 0.35;
        const n = noise[y][x] - distBias;

        if      (n > 0.52) this.tiles[y][x].terrain = TERRAIN.MOUNTAINS;
        else if (n > 0.40) this.tiles[y][x].terrain = TERRAIN.HILLS;
        else if (n > 0.28) this.tiles[y][x].terrain = TERRAIN.FOREST;
        else if (n > 0.15) this.tiles[y][x].terrain = TERRAIN.PLAINS;
        else if (n > 0.08) this.tiles[y][x].terrain = TERRAIN.DESERT;
        // else OCEAN
      }
    }

    // One pass of cellular automata smoothing
    this._smoothTerrain();
  }

  _smoothTerrain() {
    const sz = this.mapSize;
    const snap = this.tiles.map(row => row.map(t => t.terrain));
    for (let y = 1; y < sz - 1; y++) {
      for (let x = 1; x < sz - 1; x++) {
        if (snap[y][x] === TERRAIN.OCEAN) {
          let land = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (snap[y+dy][x+dx] !== TERRAIN.OCEAN) land++;
          }
          if (land >= 6) this.tiles[y][x].terrain = TERRAIN.PLAINS;
        }
      }
    }
  }

  // ---- Players ----

  _createPlayers() {
    for (let i = 0; i < this.numPlayers; i++) {
      const faction = FACTIONS[i];
      const player  = new Player(i, faction, i === 0);
      this.players.push(player);
    }
  }

  // ---- Starting positions ----

  _startPositions() {
    const sz = this.mapSize;
    const pad = Math.floor(sz * 0.1);
    const mid = Math.floor(sz / 2);
    const all = [
      [pad, pad], [sz-1-pad, pad], [pad, sz-1-pad], [sz-1-pad, sz-1-pad],
      [mid, pad], [mid, sz-1-pad], [pad, mid], [sz-1-pad, mid],
    ];
    return all.slice(0, this.numPlayers);
  }

  _clearArea(cx, cy, radius) {
    const sz = this.mapSize;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = cx + dx, ty = cy + dy;
        if (tx >= 0 && tx < sz && ty >= 0 && ty < sz) {
          this.tiles[ty][tx].terrain = TERRAIN.PLAINS;
        }
      }
    }
  }

  // ---- City placement ----

  _placeCities() {
    const sz = this.mapSize;
    const positions = this._startPositions();

    // Player capitals
    for (let i = 0; i < this.numPlayers; i++) {
      const [cx, cy] = positions[i];
      this._clearArea(cx, cy, 3);
      const player = this.players[i];
      const city = new City(cx, cy, 'capital', `${player.faction.name} Capital`, player);
      this.tiles[cy][cx].city = city;
      this.tiles[cy][cx].terrain = TERRAIN.PLAINS;
      this.cities.push(city);
      player.cities.push(city);
    }

    // Neutral locations
    const density = sz * sz;
    this._placeRandom('city',    Math.floor(density * 0.004));
    this._placeRandom('town',    Math.floor(density * 0.008));
    this._placeRandom('village', Math.floor(density * 0.012));
    this._placeRandom('ruins',   Math.floor(density * 0.006));
    this._placeRandom('temple',  Math.floor(density * 0.003));
  }

  _placeRandom(type, count) {
    const sz = this.mapSize;
    for (let i = 0; i < count; i++) {
      for (let attempt = 0; attempt < 80; attempt++) {
        const x = Math.floor(Math.random() * (sz - 4)) + 2;
        const y = Math.floor(Math.random() * (sz - 4)) + 2;
        const tile = this.tiles[y][x];
        if (tile.city) continue;
        if (!tile.terrain.passable && tile.terrain !== TERRAIN.FOREST) continue;

        // Minimum spacing between cities
        let tooClose = false;
        for (const c of this.cities) {
          if (Math.abs(c.x - x) + Math.abs(c.y - y) < 4) { tooClose = true; break; }
        }
        if (tooClose) continue;

        const name = randomCityName(type);
        const city = new City(x, y, type, name, null);
        tile.city = city;
        tile.terrain = TERRAIN.PLAINS;
        this.cities.push(city);
        break;
      }
    }
  }

  // ---- Starting armies ----

  _giveStartingArmies() {
    for (const player of this.players) {
      const capital = player.cities[0];
      if (!capital) continue;

      const hero = Hero.random(player, capital.x, capital.y);
      const army = new Army(player, capital.x, capital.y);
      army.hero  = hero;
      army.units = [
        { type:'MILITIA', hp:1 },
        { type:'MILITIA', hp:1 },
        { type:'LIGHT_INF', hp:1 },
      ];
      army.movePoints = army.maxMovePoints();

      this.armies.push(army);
      this.tiles[capital.y][capital.x].armies.push(army);
      player.armies.push(army);
      player.gold = 60;
    }
  }

  // ---- Accessors ----

  getTile(x, y) {
    if (x < 0 || x >= this.mapSize || y < 0 || y >= this.mapSize) return null;
    return this.tiles[y][x];
  }

  getCityAt(x, y) { return this.getTile(x, y)?.city ?? null; }

  getArmiesAt(x, y) {
    const tile = this.getTile(x, y);
    return tile ? tile.armies : [];
  }

  getFriendlyArmiesAt(x, y, player) {
    return this.getArmiesAt(x, y).filter(a => a.player === player);
  }

  getEnemyArmiesAt(x, y, player) {
    return this.getArmiesAt(x, y).filter(a => a.player !== player);
  }

  // ---- Mutations ----

  moveArmy(army, toX, toY) {
    this.tiles[army.y][army.x].armies = this.tiles[army.y][army.x].armies.filter(a => a !== army);
    army.x = toX;
    army.y = toY;
    this.tiles[toY][toX].armies.push(army);
  }

  removeArmy(army) {
    const tile = this.tiles[army.y][army.x];
    tile.armies = tile.armies.filter(a => a !== army);
    this.armies  = this.armies.filter(a => a !== army);
    army.player.armies = army.player.armies.filter(a => a !== army);
  }

  captureCity(city, player) {
    if (city.owner) {
      city.owner.cities = city.owner.cities.filter(c => c !== city);
    }
    city.owner = player;
    if (player && !player.cities.includes(city)) {
      player.cities.push(city);
    }
  }

  eliminatePlayer(player) {
    player.eliminated = true;
    // Neutralise cities
    for (const city of [...player.cities]) {
      city.owner = null;
      city.garrison = [];
    }
    player.cities = [];
    // Remove armies
    for (const army of [...player.armies]) {
      this.removeArmy(army);
    }
    this.log(`${player.name} has been eliminated!`);
  }

  checkWinCondition() {
    const alive = this.players.filter(p => !p.eliminated && p.cities.length > 0);
    // Eliminate players who lost all cities
    for (const p of this.players) {
      if (!p.eliminated && p.cities.length === 0) {
        this.eliminatePlayer(p);
      }
    }
    const survivors = this.players.filter(p => !p.eliminated);
    if (survivors.length === 1) {
      this.gameOver = true;
      this.winner   = survivors[0];
      return true;
    }
    return false;
  }

  log(msg) {
    this.messageLog.unshift(msg);
    if (this.messageLog.length > 30) this.messageLog.pop();
  }

  /** @returns {Player} current active player */
  currentPlayer() { return this.players[this.currentPlayerIdx]; }
}
