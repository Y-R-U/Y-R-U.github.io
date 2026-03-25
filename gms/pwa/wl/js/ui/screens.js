// screens.js - Game screens (title, setup, gameover)
'use strict';

const Screens = {
    _bound: false,

    showTitle() {
        document.getElementById('title-screen').classList.remove('hidden');
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('gameover-screen').classList.add('hidden');

        if (!this._bound) {
            this._bound = true;
            document.getElementById('btn-start').addEventListener('click', () => {
                this.showSetup();
            });
            document.getElementById('btn-play-again').addEventListener('click', () => {
                this.showTitle();
            });
        }
    },

    showSetup() {
        const numPlayers = parseInt(document.getElementById('num-players').value) || 4;
        const humanPlayers = parseInt(document.getElementById('human-players').value) || 1;
        this.startGame(Math.max(2, numPlayers), Utils.clamp(humanPlayers, 1, numPlayers));
    },

    startGame(numPlayers, humanPlayers) {
        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        document.getElementById('gameover-screen').classList.add('hidden');

        Turns.startGame(numPlayers, humanPlayers);

        // Center camera on first player's army
        const armies = GameState.getPlayerArmies(0);
        if (armies.length > 0) {
            Renderer.centerOn(armies[0].col, armies[0].row);
        }

        Renderer.resize();
        Renderer._buildTileCache();
        HUD.update();
    },

    showGameOver() {
        document.getElementById('gameover-screen').classList.remove('hidden');
        const winner = GameState.players[GameState.winner];
        document.getElementById('winner-name').textContent = winner.name;
        document.getElementById('winner-name').style.color = winner.color.primary;
        document.getElementById('final-turn').textContent = GameState.turn;
    },

    checkGameOver() {
        if (GameState.phase === 'gameover') {
            this.showGameOver();
            return true;
        }
        return false;
    },
};
