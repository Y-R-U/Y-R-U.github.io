// savegame.js - Save/load game to localStorage
'use strict';

const SaveGame = {
    SAVE_KEY: 'warlords_save_',
    MAX_SLOTS: 3,

    save(slot) {
        if (slot < 0 || slot >= this.MAX_SLOTS) return false;
        const data = {
            version: 2,
            timestamp: Date.now(),
            tiles: GameState.tiles,
            cities: GameState.cities,
            ruins: GameState.ruins,
            armies: GameState.armies,
            players: GameState.players,
            currentPlayer: GameState.currentPlayer,
            turn: GameState.turn,
            phase: GameState.phase,
            fog: GameState.fog,
            waypoints: GameState.waypoints,
            messages: GameState.messages.slice(0, 10),
            mapCols: MAP_COLS,
            mapRows: MAP_ROWS,
        };
        try {
            localStorage.setItem(this.SAVE_KEY + slot, JSON.stringify(data));
            GameState.addMessage(`Game saved to slot ${slot + 1}`);
            return true;
        } catch (e) {
            GameState.addMessage('Save failed: storage full');
            return false;
        }
    },

    load(slot) {
        if (slot < 0 || slot >= this.MAX_SLOTS) return false;
        try {
            const json = localStorage.getItem(this.SAVE_KEY + slot);
            if (!json) return false;
            const data = JSON.parse(json);
            if (!data.version) return false;

            // Restore map size
            MAP_COLS = data.mapCols || 40;
            MAP_ROWS = data.mapRows || 30;

            GameState.tiles = data.tiles;
            GameState.cities = data.cities;
            GameState.ruins = data.ruins;
            GameState.armies = data.armies;
            GameState.players = data.players;
            GameState.currentPlayer = data.currentPlayer;
            GameState.turn = data.turn;
            GameState.phase = data.phase;
            GameState.fog = data.fog;
            GameState.waypoints = data.waypoints || {};
            GameState.messages = data.messages || [];
            GameState.selectedArmy = null;
            GameState.movePath = null;
            GameState.combatResult = null;
            GameState.winner = null;

            GameState.addMessage(`Game loaded from slot ${slot + 1}`);
            return true;
        } catch (e) {
            return false;
        }
    },

    getSlotInfo(slot) {
        try {
            const json = localStorage.getItem(this.SAVE_KEY + slot);
            if (!json) return null;
            const data = JSON.parse(json);
            const player = data.players[data.currentPlayer];
            return {
                turn: data.turn,
                playerName: player?.name || 'Unknown',
                timestamp: data.timestamp,
                date: new Date(data.timestamp).toLocaleDateString(),
                time: new Date(data.timestamp).toLocaleTimeString(),
            };
        } catch (e) {
            return null;
        }
    },

    deleteSave(slot) {
        localStorage.removeItem(this.SAVE_KEY + slot);
    },

    hasSave(slot) {
        return localStorage.getItem(this.SAVE_KEY + slot) !== null;
    },
};
