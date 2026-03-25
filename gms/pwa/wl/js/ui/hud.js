// hud.js - HUD and information panels
'use strict';

const HUD = {
    elements: {},

    init() {
        this.elements = {
            playerName: document.getElementById('player-name'),
            turnNum: document.getElementById('turn-num'),
            goldAmount: document.getElementById('gold-amount'),
            cityCount: document.getElementById('city-count'),
            armyCount: document.getElementById('army-count'),
            tileInfo: document.getElementById('tile-info'),
            armyPanel: document.getElementById('army-panel'),
            armyUnits: document.getElementById('army-units'),
            cityPanel: document.getElementById('city-panel'),
            cityName: document.getElementById('city-name-display'),
            cityIncome: document.getElementById('city-income'),
            cityProduction: document.getElementById('city-production'),
            productionList: document.getElementById('production-list'),
            messageLog: document.getElementById('message-log'),
            combatPanel: document.getElementById('combat-panel'),
            combatDetails: document.getElementById('combat-details'),
            ruinPanel: document.getElementById('ruin-panel'),
            ruinMessage: document.getElementById('ruin-message'),
            minimap: document.getElementById('minimap'),
        };
    },

    update() {
        const p = GameState.players[GameState.currentPlayer];
        if (!p) return;

        this.elements.playerName.textContent = p.name;
        this.elements.playerName.style.color = p.color.primary;
        this.elements.turnNum.textContent = GameState.turn;
        this.elements.goldAmount.textContent = p.gold;
        this.elements.cityCount.textContent = GameState.getPlayerCities(p.id).length;
        this.elements.armyCount.textContent = GameState.getPlayerArmies(p.id).length;

        this._updateMessages();
        this._updateMinimap();
    },

    showTileInfo(col, row) {
        if (!Utils.inBounds(col, row)) {
            this.elements.tileInfo.textContent = '';
            return;
        }
        const terrain = TERRAIN_BY_ID[GameState.tiles[row][col]];
        const city = GameState.getCityAt(col, row);
        const ruin = GameState.getRuinAt(col, row);
        let text = `${terrain.name} (${col},${row})`;
        if (city) {
            const owner = city.owner >= 0 ? GameState.players[city.owner].name : 'Neutral';
            text = `${city.name} [${owner}] Income: ${city.income}`;
        }
        if (ruin) {
            text += ruin.searched ? ' (Explored)' : ' (Unexplored)';
        }
        this.elements.tileInfo.textContent = text;
    },

    showArmyPanel(army) {
        if (!army) {
            this.elements.armyPanel.classList.add('hidden');
            return;
        }

        this.elements.armyPanel.classList.remove('hidden');
        const html = army.units.map(u => {
            const type = UNIT_TYPE_BY_ID[u.typeId];
            const str = Units.getEffectiveStr(u);
            const moves = Units.getEffectiveMoves(u);
            const items = u.items.length > 0 ? ` [${u.items.map(i => i.name).join(', ')}]` : '';
            const lvl = u.level > 1 ? ` Lv${u.level}` : '';
            return `<div class="unit-row">
                <span class="unit-symbol">${u.symbol}</span>
                <span class="unit-name">${u.name}${lvl}</span>
                <span class="unit-stats">S:${str} M:${moves}${items}</span>
            </div>`;
        }).join('');

        this.elements.armyUnits.innerHTML = html;

        // Show total strength and moves
        const totalStr = Units.armyStrength(army);
        const movesLeft = army.movesLeft;
        this.elements.armyUnits.innerHTML += `
            <div class="army-summary">
                Total Str: ${totalStr} | Moves: ${movesLeft.toFixed(1)}
            </div>`;
    },

    showCityPanel(city) {
        if (!city) {
            this.elements.cityPanel.classList.add('hidden');
            return;
        }

        this.elements.cityPanel.classList.remove('hidden');
        this.elements.cityName.textContent = city.name;
        this.elements.cityIncome.textContent = city.income;

        const prod = city.production !== null ? UNIT_TYPE_BY_ID[city.production] : null;
        this.elements.cityProduction.textContent = prod
            ? `${prod.name} (${city.turnsLeft} turns)`
            : 'None';

        // Show production options if this city belongs to current player
        if (city.owner === GameState.currentPlayer) {
            const available = Production.getAvailableUnits(city);
            const html = available.map(u => `
                <div class="prod-option" data-type="${u.id}">
                    <span class="prod-name">${u.name}</span>
                    <span class="prod-stats">S:${u.str} M:${u.moves} Cost:${u.cost} T:${u.turns}</span>
                </div>
            `).join('');
            this.elements.productionList.innerHTML = html;

            // Add click handlers
            this.elements.productionList.querySelectorAll('.prod-option').forEach(el => {
                el.addEventListener('click', () => {
                    const typeId = parseInt(el.dataset.type);
                    Production.setProduction(city, typeId);
                    this.showCityPanel(city);
                    this.update();
                });
            });
        } else {
            this.elements.productionList.innerHTML = '<div class="prod-option">Not your city</div>';
        }
    },

    showCombatResult(result) {
        this.elements.combatPanel.classList.remove('hidden');
        const winner = result.winner === 'attacker' ? 'Attacker' : 'Defender';
        const atkName = result.attacker.owner >= 0
            ? GameState.players[result.attacker.owner].name
            : 'Neutral';
        const defName = result.defender.owner >= 0
            ? GameState.players[result.defender.owner].name
            : 'Neutral';

        this.elements.combatDetails.innerHTML = `
            <div class="combat-header">${atkName} vs ${defName}</div>
            <div>Attacker Strength: ${result.atkStrength}</div>
            <div>Defender Strength: ${result.defStrength}</div>
            <div>Rounds: ${result.rounds.length}</div>
            <div>Attacker Losses: ${result.atkLosses.length}</div>
            <div>Defender Losses: ${result.defLosses.length}</div>
            <div class="combat-winner">${winner} wins!</div>
        `;
    },

    hideCombatResult() {
        this.elements.combatPanel.classList.add('hidden');
    },

    showRuinResult(result) {
        this.elements.ruinPanel.classList.remove('hidden');
        this.elements.ruinMessage.textContent = result.message;
    },

    hideRuinResult() {
        this.elements.ruinPanel.classList.add('hidden');
    },

    _updateMessages() {
        this.elements.messageLog.innerHTML = GameState.messages
            .slice(0, 8)
            .map(m => `<div class="msg">${m}</div>`)
            .join('');
    },

    _updateMinimap() {
        const canvas = this.elements.minimap;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const sx = w / MAP_COLS;
        const sy = h / MAP_ROWS;
        const pid = GameState.currentPlayer;

        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, w, h);

        // Draw terrain
        for (let r = 0; r < MAP_ROWS; r++) {
            for (let c = 0; c < MAP_COLS; c++) {
                if (!GameState.isVisible(pid, c, r)) continue;
                const terrain = TERRAIN_BY_ID[GameState.tiles[r][c]];
                ctx.fillStyle = terrain.color;
                ctx.fillRect(c * sx, r * sy, Math.ceil(sx), Math.ceil(sy));
            }
        }

        // Draw cities
        for (const city of GameState.cities) {
            if (!GameState.isVisible(pid, city.col, city.row)) continue;
            ctx.fillStyle = city.owner >= 0
                ? GameState.players[city.owner].color.primary
                : '#fff';
            ctx.fillRect(city.col * sx - 1, city.row * sy - 1, sx + 2, sy + 2);
        }

        // Draw armies
        for (const army of GameState.armies) {
            if (!GameState.isVisible(pid, army.col, army.row)) continue;
            if (army.owner >= 0) {
                ctx.fillStyle = GameState.players[army.owner].color.secondary;
            } else {
                ctx.fillStyle = '#aaa';
            }
            ctx.fillRect(army.col * sx, army.row * sy, Math.ceil(sx), Math.ceil(sy));
        }

        // Camera viewport
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        const vx = (Renderer.camX / (MAP_COLS * TILE_SIZE)) * w;
        const vy = (Renderer.camY / (MAP_ROWS * TILE_SIZE)) * h;
        const vw = (Renderer.canvas.width / (MAP_COLS * TILE_SIZE)) * w;
        const vh = (Renderer.canvas.height / (MAP_ROWS * TILE_SIZE)) * h;
        ctx.strokeRect(vx, vy, vw, vh);
    },

    closePanels() {
        this.elements.armyPanel.classList.add('hidden');
        this.elements.cityPanel.classList.add('hidden');
        this.hideCombatResult();
        this.hideRuinResult();
    },
};
