// ui.js - Main UI controller
'use strict';

const UI = {
    init() {
        HUD.init();
        Input.init();
    },

    update() {
        HUD.update();
        if (Screens.checkGameOver()) return;
    },

    centerOnPlayer(playerId) {
        const armies = GameState.getPlayerArmies(playerId);
        if (armies.length > 0) {
            Renderer.centerOn(armies[0].col, armies[0].row);
        } else {
            const cities = GameState.getPlayerCities(playerId);
            if (cities.length > 0) {
                Renderer.centerOn(cities[0].col, cities[0].row);
            }
        }
    },
};
