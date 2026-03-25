// turns.js - Turn management
'use strict';

const Turns = {
    endTurn() {
        const pid = GameState.currentPlayer;

        // Process production for current player
        Production.processProduction(pid);

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
            if (checks > GameState.players.length) break; // Safety
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
            // Chain to next player after short delay for visual feedback
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
        }
    },

    startGame(numPlayers, humanPlayers) {
        GameState.init(numPlayers, humanPlayers);

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
