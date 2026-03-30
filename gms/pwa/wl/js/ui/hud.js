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
            factionsList: document.getElementById('factions-list'),
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

        this._updateFactions();
        this._updateMessages();
        this._updateMinimap();
    },

    _updateFactions() {
        const list = document.getElementById('factions-list');
        if (!list) return;
        const pid = GameState.currentPlayer;
        list.innerHTML = GameState.players.map(p => {
            const cities = GameState.getPlayerCities(p.id).length;
            const armies = GameState.getPlayerArmies(p.id).length;
            const deadClass = !p.alive ? ' faction-dead' : '';
            const youClass = p.id === pid ? ' faction-you' : '';
            const youTag = p.id === pid ? ' (You)' : (p.isHuman ? ' (Human)' : '');
            return `<div class="faction-row${deadClass}">
                <div class="faction-dot" style="background:${p.color.primary}"></div>
                <span class="faction-name${youClass}">${p.name}${youTag}</span>
                <span class="faction-stats">${cities}c ${armies}a</span>
            </div>`;
        }).join('');
    },

    showTileInfo(col, row) {
        if (!Utils.inBounds(col, row)) {
            this.elements.tileInfo.innerHTML = '';
            return;
        }
        const terrain = TERRAIN_BY_ID[GameState.tiles[row][col]];
        const city = GameState.getCityAt(col, row);
        const ruin = GameState.getRuinAt(col, row);
        const army = GameState.getArmyAt(col, row);

        let html = `${terrain.name} (${col},${row})`;
        if (terrain.defense > 0) html += ` Def+${terrain.defense}`;

        if (city) {
            const ownerColor = city.owner >= 0 ? GameState.players[city.owner].color.primary : '#888';
            const ownerName = city.owner >= 0 ? GameState.players[city.owner].name : 'Neutral';
            html = `<strong>${city.name}</strong> <span style="color:${ownerColor}">[${ownerName}]</span> Income:${city.income}`;
        }
        if (ruin) {
            html += ruin.searched ? ' <span style="color:var(--text-secondary)">(Explored)</span>' : ' <span style="color:var(--gold)">(Unexplored!)</span>';
        }
        if (army) {
            const armyColor = army.owner >= 0 ? GameState.players[army.owner].color.primary : '#888';
            const armyOwner = army.owner >= 0 ? GameState.players[army.owner].name : 'Neutral';
            html += ` <span style="color:${armyColor}"> | ${armyOwner} army (${army.units.length})</span>`;
        }
        this.elements.tileInfo.innerHTML = html;
    },

    showArmyPanel(army) {
        const actionsDiv = document.getElementById('army-actions');
        if (!army) {
            this.elements.armyPanel.classList.add('hidden');
            if (actionsDiv) actionsDiv.classList.add('hidden');
            return;
        }

        this.elements.armyPanel.classList.remove('hidden');
        const ownerColor = army.owner >= 0 ? GameState.players[army.owner].color.primary : '#888';
        const ownerName = army.owner >= 0 ? GameState.players[army.owner].name : 'Neutral';
        const isOwn = army.owner === GameState.currentPlayer;

        let html = `<div style="color:${ownerColor};font-weight:600;font-size:0.8rem;margin-bottom:0.3rem">${ownerName}'s Army</div>`;
        html += army.units.map(u => {
            const str = Units.getEffectiveStr(u);
            const moves = Units.getEffectiveMoves(u);
            const items = u.items.length > 0 ? ` [${u.items.map(i => i.name).join(', ')}]` : '';
            const lvl = u.level > 1 ? ` Lv${u.level}` : '';
            const promo = u.promoted ? ' *' : '';
            return `<div class="unit-row">
                <span class="unit-symbol" style="border-left:3px solid ${ownerColor}">${u.symbol}</span>
                <span class="unit-name">${u.name}${lvl}${promo}</span>
                <span class="unit-stats">S:${str} M:${moves}${items}</span>
            </div>`;
        }).join('');

        this.elements.armyUnits.innerHTML = html;

        const totalStr = Units.armyStrength(army);
        const movesLeft = army.movesLeft;
        const scoutLabel = army.scouting ? ' | Scouting' : '';
        this.elements.armyUnits.innerHTML += `
            <div class="army-summary">
                Total Str: ${totalStr} | Moves: ${movesLeft.toFixed(1)}${scoutLabel}
            </div>`;

        // Show/hide army action buttons for own armies
        if (actionsDiv) {
            if (isOwn) {
                actionsDiv.classList.remove('hidden');
                actionsDiv.style.display = 'flex';
                const scoutBtn = document.getElementById('btn-scout-toggle');
                if (scoutBtn) {
                    scoutBtn.textContent = army.scouting ? 'Unscout' : 'Scout';
                }
            } else {
                actionsDiv.classList.add('hidden');
            }
        }
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
        const winnerLabel = result.winner === 'attacker' ? 'Attacker wins!' : 'Defender wins!';
        const atkOwner = result.attacker.owner;
        const defOwner = result.defender.owner;
        const atkName = atkOwner >= 0 ? GameState.players[atkOwner].name : 'Neutral';
        const defName = defOwner >= 0 ? GameState.players[defOwner].name : 'Neutral';
        const atkColor = atkOwner >= 0 ? GameState.players[atkOwner].color.primary : '#888';
        const defColor = defOwner >= 0 ? GameState.players[defOwner].color.primary : '#888';

        const atkSurvivors = result.attacker.units.length;
        const defSurvivors = result.defender.units.length;

        this.elements.combatDetails.innerHTML = `
            <div class="combat-header">Battle!</div>
            <div style="display:flex;gap:1rem;margin:0.5rem 0">
                <div style="flex:1;text-align:center">
                    <div style="color:${atkColor};font-weight:700;font-size:0.9rem">${atkName}</div>
                    <div style="font-size:2rem;font-weight:700">${result.atkStrength}</div>
                    <div style="font-size:0.7rem;color:var(--text-secondary)">strength</div>
                    <div style="color:var(--danger);font-size:0.8rem;margin-top:0.3rem">-${result.atkLosses.length} lost</div>
                    <div style="color:var(--success);font-size:0.8rem">${atkSurvivors} survived</div>
                </div>
                <div style="display:flex;align-items:center;color:var(--text-secondary);font-size:1.2rem">vs</div>
                <div style="flex:1;text-align:center">
                    <div style="color:${defColor};font-weight:700;font-size:0.9rem">${defName}</div>
                    <div style="font-size:2rem;font-weight:700">${result.defStrength}</div>
                    <div style="font-size:0.7rem;color:var(--text-secondary)">strength</div>
                    <div style="color:var(--danger);font-size:0.8rem;margin-top:0.3rem">-${result.defLosses.length} lost</div>
                    <div style="color:var(--success);font-size:0.8rem">${defSurvivors} survived</div>
                </div>
            </div>
            <div style="text-align:center;font-size:0.8rem;color:var(--text-secondary)">${result.rounds.length} rounds of combat</div>
            <div class="combat-winner">${winnerLabel}</div>
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
