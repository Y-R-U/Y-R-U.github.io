// gamestate.js - Central game state management
'use strict';

const GameState = {
    tiles: [],
    cities: [],
    ruins: [],
    armies: [],
    players: [],
    currentPlayer: 0,
    turn: 1,
    phase: 'setup', // setup, play, combat, gameover
    selectedArmy: null,
    movePath: null,
    fog: [],
    combatResult: null,
    winner: null,
    messages: [],
    waypoints: {}, // armyId -> { targetCol, targetRow, path }

    init(numPlayers, humanPlayers) {
        this.turn = 1;
        this.currentPlayer = 0;
        this.phase = 'play';
        this.selectedArmy = null;
        this.movePath = null;
        this.combatResult = null;
        this.winner = null;
        this.armies = [];
        this.messages = [];
        this.waypoints = {};

        // Generate map
        const map = MapGen.generate(numPlayers);
        this.tiles = map.tiles;
        this.cities = map.cities;
        this.ruins = map.ruins;

        // Init players
        this.players = [];
        for (let i = 0; i < numPlayers; i++) {
            this.players.push({
                id: i,
                name: PLAYER_COLORS[i].name,
                color: PLAYER_COLORS[i],
                gold: 20,
                alive: true,
                isHuman: i < humanPlayers,
                heroCount: 0,
            });
        }

        // Init fog of war
        this.fog = [];
        for (let p = 0; p < numPlayers; p++) {
            this.fog[p] = Array.from({ length: MAP_ROWS }, () => Array(MAP_COLS).fill(false));
        }

        // Place starting armies
        for (const city of this.cities) {
            if (city.owner >= 0) {
                this._placeStartingArmy(city);
            } else {
                this._placeGarrison(city);
            }
        }

        // Reveal around player positions
        for (const army of this.armies) {
            if (army.owner >= 0) {
                this.revealAround(army.owner, army.col, army.row);
            }
        }
        for (const city of this.cities) {
            if (city.owner >= 0) {
                this.revealAround(city.owner, city.col, city.row);
            }
        }
    },

    _placeStartingArmy(city) {
        const hero = Units.create(UNIT_TYPES.HERO.id, city.owner);
        const inf1 = Units.create(UNIT_TYPES.LIGHT_INF.id, city.owner);
        const inf2 = Units.create(UNIT_TYPES.LIGHT_INF.id, city.owner);
        const cav = Units.create(UNIT_TYPES.CAVALRY.id, city.owner);
        const army = {
            id: Utils.uid(),
            col: city.col,
            row: city.row,
            owner: city.owner,
            units: [hero, inf1, inf2, cav],
            movesLeft: 0,
        };
        army.movesLeft = Units.armyMoves(army);
        this.armies.push(army);
        this.players[city.owner].heroCount++;
    },

    _placeGarrison(city) {
        const unit = Units.create(UNIT_TYPES.LIGHT_INF.id, -1);
        const army = {
            id: Utils.uid(),
            col: city.col,
            row: city.row,
            owner: -1,
            units: [unit],
            movesLeft: 0,
        };
        this.armies.push(army);
    },

    getArmyAt(col, row) {
        return this.armies.find(a => a.col === col && a.row === row);
    },

    getArmiesAt(col, row) {
        return this.armies.filter(a => a.col === col && a.row === row);
    },

    getCityAt(col, row) {
        return this.cities.find(c => c.col === col && c.row === row);
    },

    getRuinAt(col, row) {
        return this.ruins.find(r => r.col === col && r.row === row);
    },

    getPlayerArmies(playerId) {
        return this.armies.filter(a => a.owner === playerId);
    },

    getPlayerCities(playerId) {
        return this.cities.filter(c => c.owner === playerId);
    },

    removeArmy(army) {
        const idx = this.armies.indexOf(army);
        if (idx >= 0) this.armies.splice(idx, 1);
    },

    revealAround(playerId, col, row) {
        if (playerId < 0 || !this.fog[playerId]) return;
        for (let dr = -FOG_REVEAL_RADIUS; dr <= FOG_REVEAL_RADIUS; dr++) {
            for (let dc = -FOG_REVEAL_RADIUS; dc <= FOG_REVEAL_RADIUS; dc++) {
                const nc = col + dc;
                const nr = row + dr;
                if (Utils.inBounds(nc, nr)) {
                    this.fog[playerId][nr][nc] = true;
                }
            }
        }
    },

    isVisible(playerId, col, row) {
        if (playerId < 0) return true;
        return this.fog[playerId]?.[row]?.[col] ?? false;
    },

    addMessage(text) {
        this.messages.unshift(text);
        if (this.messages.length > 20) this.messages.pop();
    },

    checkVictory() {
        const alive = this.players.filter(p => p.alive);
        if (alive.length === 1) {
            this.winner = alive[0].id;
            this.phase = 'gameover';
            return true;
        }
        return false;
    },

    eliminatePlayer(playerId) {
        this.players[playerId].alive = false;
        // Remove armies
        this.armies = this.armies.filter(a => a.owner !== playerId);
        // Transfer cities to neutral
        for (const city of this.cities) {
            if (city.owner === playerId) city.owner = -1;
        }
        this.addMessage(`${this.players[playerId].name} has been eliminated!`);
    },

    setWaypoint(armyId, targetCol, targetRow, path) {
        this.waypoints[armyId] = { targetCol, targetRow, path };
    },

    getWaypoint(armyId) {
        return this.waypoints[armyId] || null;
    },

    clearWaypoint(armyId) {
        delete this.waypoints[armyId];
    },

    clearAllWaypoints(playerId) {
        for (const id of Object.keys(this.waypoints)) {
            const army = this.armies.find(a => a.id === parseInt(id));
            if (army && army.owner === playerId) {
                delete this.waypoints[id];
            }
        }
    },
};
