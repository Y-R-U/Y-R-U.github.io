// screens.js - Game screens (title, setup, gameover)
'use strict';

const Screens = {
    _bound: false,

    showTitle() {
        document.getElementById('title-screen').classList.remove('hidden');
        document.getElementById('game-screen').classList.add('hidden');
        document.getElementById('gameover-screen').classList.add('hidden');
        document.getElementById('turn-banner').classList.add('hidden');

        // Show load slots on title
        this._updateLoadSlots();

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

    _updateLoadSlots() {
        const container = document.getElementById('load-slots');
        let html = '';
        for (let i = 0; i < SaveGame.MAX_SLOTS; i++) {
            const info = SaveGame.getSlotInfo(i);
            if (info) {
                html += `<button class="btn btn-sm load-slot-btn" data-slot="${i}" style="width:100%;margin-top:0.3rem;text-align:left">
                    Load: ${info.playerName} - Turn ${info.turn} (${info.date})
                </button>`;
            }
        }
        container.innerHTML = html;
        container.querySelectorAll('.load-slot-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const slot = parseInt(btn.dataset.slot);
                if (SaveGame.load(slot)) {
                    document.getElementById('title-screen').classList.add('hidden');
                    document.getElementById('game-screen').classList.remove('hidden');
                    Renderer.resize();
                    Renderer._buildTileCache();
                    UI.centerOnPlayer(GameState.currentPlayer);
                    HUD.update();
                }
            });
        });
    },

    showSetup() {
        const numPlayers = parseInt(document.getElementById('num-players').value) || 4;
        const humanPlayers = parseInt(document.getElementById('human-players').value) || 1;
        const mapSize = document.getElementById('map-size').value || 'medium';
        const mapType = document.getElementById('map-type').value || 'continents';

        // Apply map size
        const size = MAP_SIZES[mapSize] || MAP_SIZES.medium;
        MAP_COLS = size.cols;
        MAP_ROWS = size.rows;

        this.startGame(
            Math.max(2, numPlayers),
            Utils.clamp(humanPlayers, 1, numPlayers),
            mapType
        );
    },

    startGame(numPlayers, humanPlayers, mapType) {
        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        document.getElementById('gameover-screen').classList.add('hidden');

        Turns.startGame(numPlayers, humanPlayers, mapType);

        // Center camera on first player's army
        const armies = GameState.getPlayerArmies(0);
        if (armies.length > 0) {
            Renderer.centerOn(armies[0].col, armies[0].row);
        }

        Renderer.resize();
        Renderer._buildTileCache();
        Audio.init();
        HUD.update();

        // Show turn banner
        this.showTurnBanner(GameState.players[0]);
    },

    showGameOver() {
        document.getElementById('gameover-screen').classList.remove('hidden');
        const winner = GameState.players[GameState.winner];
        document.getElementById('winner-name').textContent = winner.name;
        document.getElementById('winner-name').style.color = winner.color.primary;
        document.getElementById('final-turn').textContent = GameState.turn;
        Audio.playVictory();
    },

    checkGameOver() {
        if (GameState.phase === 'gameover') {
            this.showGameOver();
            return true;
        }
        return false;
    },

    showTurnBanner(player) {
        const banner = document.getElementById('turn-banner');
        const text = document.getElementById('turn-banner-text');
        const sub = document.getElementById('turn-banner-sub');

        text.textContent = `${player.name}'s Turn`;
        text.style.color = player.color.primary;
        sub.textContent = `Turn ${GameState.turn}`;
        banner.classList.remove('hidden');

        Audio.playTurnStart();

        setTimeout(() => {
            banner.classList.add('hidden');
        }, 1500);

        // Click to dismiss
        banner.onclick = () => banner.classList.add('hidden');
    },
};
