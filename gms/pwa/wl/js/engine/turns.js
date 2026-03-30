// turns.js - Turn management
'use strict';

const Turns = {
    endTurn() {
        const pid = GameState.currentPlayer;

        // Process production for current player
        Production.processProduction(pid);

        // Process scout mode armies
        this._processScouts(pid);

        // Move to next player
        this._nextPlayer();
    },

    _nextPlayer() {
        // Check victory before cycling
        if (GameState.checkVictory()) return;

        let next = GameState.currentPlayer;
        let checks = 0;

        do {
            next = (next + 1) % GameState.players.length;
            if (next === 0) {
                GameState.turn++;
            }
            checks++;
            if (checks > GameState.players.length) break;
        } while (!GameState.players[next].alive);

        GameState.currentPlayer = next;

        // Reset movement for new player's armies
        const armies = GameState.getPlayerArmies(next);
        for (const army of armies) {
            army.movesLeft = Units.armyMoves(army);
        }

        const currentPlayer = GameState.players[next];
        GameState.addMessage(`--- ${currentPlayer.name}'s Turn (Turn ${GameState.turn}) ---`);

        // If AI player, take turn automatically
        if (!currentPlayer.isHuman) {
            AI.takeTurn(next);
            if (GameState.phase !== 'gameover') {
                setTimeout(() => this.endTurn(), 200);
            }
        } else {
            // Human player - update UI
            GameState.selectedArmy = null;
            GameState.movePath = null;
            if (typeof UI !== 'undefined') {
                UI.centerOnPlayer(next);
                UI.update();
            }
            if (typeof Screens !== 'undefined') {
                Screens.showTurnBanner(currentPlayer);
            }
        }
    },

    _processScouts(playerId) {
        // Move scout-mode armies toward unexplored territory
        const scouts = GameState.getPlayerArmies(playerId).filter(a => a.scouting);
        for (const army of scouts) {
            if (army.movesLeft <= 0) continue;
            if (!GameState.armies.includes(army)) continue;

            const target = this._findScoutTarget(army, playerId);
            if (!target) {
                army.scouting = false;
                GameState.addMessage('Scout found nothing new to explore.');
                continue;
            }

            const path = Movement.findPath(army, army.col, army.row, target.col, target.row);
            if (path && path.length >= 2) {
                const result = Movement.moveArmy(army, path);
                if (result && result.type === 'combat') {
                    // Auto-fight for scouts
                    const terrain = GameState.tiles[result.defender.row][result.defender.col];
                    const combatResult = Combat.resolve(result.attacker, result.defender, terrain);
                    Combat.applyCombatResult(combatResult);
                }
            }
        }
    },

    _findScoutTarget(army, playerId) {
        // Find nearest unexplored tile
        let bestDist = Infinity;
        let bestTarget = null;

        for (let r = 0; r < MAP_ROWS; r += 2) {
            for (let c = 0; c < MAP_COLS; c += 2) {
                if (GameState.isVisible(playerId, c, r)) continue;
                const terrain = TERRAIN_BY_ID[GameState.tiles[r][c]];
                if (terrain.moveCost >= 50) continue;

                const d = Utils.dist(army.col, army.row, c, r);
                if (d < bestDist) {
                    bestDist = d;
                    bestTarget = { col: c, row: r };
                }
            }
        }

        return bestTarget;
    },

    startGame(numPlayers, humanPlayers, mapType) {
        GameState.init(numPlayers, humanPlayers, mapType);

        // Set initial production for AI players
        for (let i = humanPlayers; i < numPlayers; i++) {
            AI._manageProduction(i);
        }

        // Reset movement for first player
        const armies = GameState.getPlayerArmies(0);
        for (const army of armies) {
            army.movesLeft = Units.armyMoves(army);
        }

        GameState.addMessage(`--- ${GameState.players[0].name}'s Turn (Turn 1) ---`);
        GameState.addMessage('Welcome to Warlords! Conquer all cities to win.');
    },
};
