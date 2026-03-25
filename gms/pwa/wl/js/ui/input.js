// input.js - User input handling (mouse, keyboard, touch)
'use strict';

const Input = {
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartCamX: 0,
    dragStartCamY: 0,
    lastClickTime: 0,
    hoverCol: -1,
    hoverRow: -1,
    touchStartX: 0,
    touchStartY: 0,
    pinchDist: 0,

    init() {
        const canvas = Renderer.canvas;

        // Mouse events
        canvas.addEventListener('mousedown', e => this._onMouseDown(e));
        canvas.addEventListener('mousemove', e => this._onMouseMove(e));
        canvas.addEventListener('mouseup', e => this._onMouseUp(e));
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        canvas.addEventListener('wheel', e => this._onWheel(e), { passive: false });

        // Touch events
        canvas.addEventListener('touchstart', e => this._onTouchStart(e), { passive: false });
        canvas.addEventListener('touchmove', e => this._onTouchMove(e), { passive: false });
        canvas.addEventListener('touchend', e => this._onTouchEnd(e));

        // Keyboard
        document.addEventListener('keydown', e => this._onKeyDown(e));

        // Buttons
        document.getElementById('btn-end-turn').addEventListener('click', () => this._endTurn());
        document.getElementById('btn-buy-hero').addEventListener('click', () => this._buyHero());
        document.getElementById('btn-next-army').addEventListener('click', () => this._nextArmy());
        document.getElementById('combat-ok').addEventListener('click', () => HUD.hideCombatResult());
        document.getElementById('ruin-ok').addEventListener('click', () => HUD.hideRuinResult());

        // Minimap click
        const minimap = document.getElementById('minimap');
        minimap.addEventListener('click', e => this._onMinimapClick(e));
    },

    _onMouseDown(e) {
        if (e.button === 2 || e.button === 1) {
            // Right/middle click - start drag
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.dragStartCamX = Renderer.camX;
            this.dragStartCamY = Renderer.camY;
            return;
        }

        this.isDragging = false;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragStartCamX = Renderer.camX;
        this.dragStartCamY = Renderer.camY;
    },

    _onMouseMove(e) {
        const rect = Renderer.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (this.isDragging || (e.buttons === 1 && this._hasDragged(e))) {
            this.isDragging = true;
            Renderer.camX = this.dragStartCamX - (e.clientX - this.dragStartX);
            Renderer.camY = this.dragStartCamY - (e.clientY - this.dragStartY);
            Renderer.clampCamera();
            return;
        }

        // Hover - show path preview
        const { col, row } = Renderer.screenToTile(mx, my);
        this.hoverCol = col;
        this.hoverRow = row;

        HUD.showTileInfo(col, row);

        if (GameState.selectedArmy && Utils.inBounds(col, row)) {
            const army = GameState.selectedArmy;
            const path = Movement.findPath(army, army.col, army.row, col, row);
            GameState.movePath = path;
        }
    },

    _hasDragged(e) {
        return Math.abs(e.clientX - this.dragStartX) > 5 ||
               Math.abs(e.clientY - this.dragStartY) > 5;
    },

    _onMouseUp(e) {
        if (this.isDragging) {
            this.isDragging = false;
            return;
        }

        if (this._hasDragged(e)) {
            this.isDragging = false;
            return;
        }

        const rect = Renderer.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const { col, row } = Renderer.screenToTile(mx, my);

        this._handleClick(col, row);
    },

    _handleClick(col, row) {
        if (!Utils.inBounds(col, row)) return;
        if (GameState.phase !== 'play') return;

        const pid = GameState.currentPlayer;
        const currentPlayer = GameState.players[pid];
        if (!currentPlayer.isHuman) return;

        const army = GameState.getArmyAt(col, row);

        // If we have a selected army and clicked somewhere else
        if (GameState.selectedArmy) {
            const selected = GameState.selectedArmy;

            // Clicked on same army - deselect
            if (army && army.id === selected.id) {
                GameState.selectedArmy = null;
                GameState.movePath = null;
                HUD.showArmyPanel(null);
                return;
            }

            // Clicked on a friendly army - switch selection
            if (army && army.owner === pid) {
                GameState.selectedArmy = army;
                GameState.movePath = null;
                HUD.showArmyPanel(army);
                return;
            }

            // Try to move/attack
            if (selected.movesLeft > 0) {
                const path = Movement.findPath(selected, selected.col, selected.row, col, row);
                if (path) {
                    const result = Movement.moveArmy(selected, path);
                    this._handleMoveResult(result, selected, col, row);
                    GameState.movePath = null;
                    HUD.update();
                    return;
                }
            }

            // Deselect
            GameState.selectedArmy = null;
            GameState.movePath = null;
            HUD.showArmyPanel(null);
        }

        // No selection - select own army
        if (army && army.owner === pid) {
            GameState.selectedArmy = army;
            HUD.showArmyPanel(army);
        }

        // Show city info
        const city = GameState.getCityAt(col, row);
        if (city) {
            HUD.showCityPanel(city);
        } else {
            HUD.showCityPanel(null);
        }
    },

    _handleMoveResult(result, army, col, row) {
        if (!result) return;

        switch (result.type) {
            case 'combat': {
                const terrain = GameState.tiles[result.defender.row][result.defender.col];
                const combatResult = Combat.resolve(result.attacker, result.defender, terrain);
                Combat.applyCombatResult(combatResult);
                HUD.showCombatResult(combatResult);

                const atkName = GameState.players[result.attacker.owner]?.name || 'Unknown';
                GameState.addMessage(`${atkName} attacks at (${col},${row})`);

                // Update selection
                if (combatResult.winner === 'attacker') {
                    GameState.selectedArmy = result.attacker;
                    HUD.showArmyPanel(result.attacker);
                } else {
                    GameState.selectedArmy = null;
                    HUD.showArmyPanel(null);
                }

                GameState.checkVictory();
                break;
            }
            case 'ruin': {
                const searchResult = Heroes.searchRuin(result.army, result.ruin);
                HUD.showRuinResult(searchResult);
                GameState.addMessage(searchResult.message);
                break;
            }
            case 'merged':
                GameState.selectedArmy = result.army;
                HUD.showArmyPanel(result.army);
                break;
            case 'moved':
                if (GameState.armies.includes(army)) {
                    HUD.showArmyPanel(army);
                }
                break;
        }
    },

    _onWheel(e) {
        // Scroll to pan
        Renderer.camX += e.deltaX || 0;
        Renderer.camY += e.deltaY || 0;
        Renderer.clampCamera();
        e.preventDefault();
    },

    _onTouchStart(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const t = e.touches[0];
            this.touchStartX = t.clientX;
            this.touchStartY = t.clientY;
            this.dragStartCamX = Renderer.camX;
            this.dragStartCamY = Renderer.camY;
            this.isDragging = false;
        } else if (e.touches.length === 2) {
            this.isDragging = true;
        }
    },

    _onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const t = e.touches[0];
            const dx = t.clientX - this.touchStartX;
            const dy = t.clientY - this.touchStartY;
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
                this.isDragging = true;
                Renderer.camX = this.dragStartCamX - dx;
                Renderer.camY = this.dragStartCamY - dy;
                Renderer.clampCamera();
            }
        }
    },

    _onTouchEnd(e) {
        if (!this.isDragging && e.changedTouches.length === 1) {
            const t = e.changedTouches[0];
            const rect = Renderer.canvas.getBoundingClientRect();
            const mx = t.clientX - rect.left;
            const my = t.clientY - rect.top;
            const { col, row } = Renderer.screenToTile(mx, my);
            this._handleClick(col, row);
        }
        this.isDragging = false;
    },

    _onKeyDown(e) {
        const scrollSpeed = TILE_SIZE * 2;
        switch (e.key) {
            case 'ArrowLeft':
            case 'a':
                Renderer.camX -= scrollSpeed;
                Renderer.clampCamera();
                break;
            case 'ArrowRight':
            case 'd':
                Renderer.camX += scrollSpeed;
                Renderer.clampCamera();
                break;
            case 'ArrowUp':
            case 'w':
                Renderer.camY -= scrollSpeed;
                Renderer.clampCamera();
                break;
            case 'ArrowDown':
            case 's':
                Renderer.camY += scrollSpeed;
                Renderer.clampCamera();
                break;
            case 'Enter':
            case 'e':
                this._endTurn();
                break;
            case 'n':
            case 'Tab':
                e.preventDefault();
                this._nextArmy();
                break;
            case 'h':
                this._buyHero();
                break;
            case 'Escape':
                GameState.selectedArmy = null;
                GameState.movePath = null;
                HUD.closePanels();
                break;
            case ' ':
                // Skip current army movement
                if (GameState.selectedArmy) {
                    GameState.selectedArmy.movesLeft = 0;
                    this._nextArmy();
                }
                e.preventDefault();
                break;
        }
    },

    _endTurn() {
        const p = GameState.players[GameState.currentPlayer];
        if (!p.isHuman) return;
        GameState.selectedArmy = null;
        GameState.movePath = null;
        HUD.closePanels();
        Turns.endTurn();
        HUD.update();
    },

    _buyHero() {
        const p = GameState.players[GameState.currentPlayer];
        if (!p.isHuman) return;
        if (Production.buyHero(GameState.currentPlayer)) {
            HUD.update();
        } else {
            GameState.addMessage('Cannot recruit hero (need 15 gold, max 3 heroes)');
            HUD.update();
        }
    },

    _nextArmy() {
        const pid = GameState.currentPlayer;
        const armies = GameState.getPlayerArmies(pid).filter(a => a.movesLeft > 0);
        if (armies.length === 0) {
            GameState.selectedArmy = null;
            HUD.showArmyPanel(null);
            return;
        }

        let idx = 0;
        if (GameState.selectedArmy) {
            const curIdx = armies.findIndex(a => a.id === GameState.selectedArmy.id);
            idx = (curIdx + 1) % armies.length;
        }

        GameState.selectedArmy = armies[idx];
        GameState.movePath = null;
        Renderer.centerOn(armies[idx].col, armies[idx].row);
        HUD.showArmyPanel(armies[idx]);
    },

    _onMinimapClick(e) {
        const rect = e.target.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const col = Math.floor((mx / e.target.width) * MAP_COLS);
        const row = Math.floor((my / e.target.height) * MAP_ROWS);
        Renderer.centerOn(col, row);
    },
};
