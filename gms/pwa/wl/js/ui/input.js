// input.js - User input handling (mouse, keyboard, touch)
'use strict';

const Input = {
    isDragging: false,
    dragStartX: 0,
    dragStartY: 0,
    dragStartCamX: 0,
    dragStartCamY: 0,
    hoverCol: -1,
    hoverRow: -1,
    pendingMerge: null, // { source, target }
    _undoState: null, // { armyId, steps: [{col, row, movesLeft}], turnStartCol, turnStartRow, turnStartMoves }
    _longPressTimer: null,
    _isLongPress: false,
    _mouseDownTime: 0,

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

        // Merge panel
        document.getElementById('merge-yes').addEventListener('click', () => this._confirmMerge());
        document.getElementById('merge-no').addEventListener('click', () => this._cancelMerge());

        // Waypoint buttons
        document.getElementById('waypoint-continue').addEventListener('click', () => this._continueWaypoint());
        document.getElementById('waypoint-cancel').addEventListener('click', () => this._cancelWaypoint());
        document.getElementById('waypoint-close').addEventListener('click', () => this._hideWaypointBanner());

        // Undo move
        document.getElementById('btn-undo-move').addEventListener('click', () => this._undoMove());

        // Unit detail
        document.getElementById('unit-detail-ok').addEventListener('click', () => {
            document.getElementById('unit-detail-panel').classList.add('hidden');
        });

        // Split army
        document.getElementById('btn-split-army').addEventListener('click', () => this._showSplitPanel());
        document.getElementById('split-confirm').addEventListener('click', () => this._confirmSplit());
        document.getElementById('split-cancel').addEventListener('click', () => this._cancelSplit());

        // Scout toggle
        document.getElementById('btn-scout-toggle').addEventListener('click', () => this._toggleScout());

        // Save/Load
        document.getElementById('btn-save').addEventListener('click', () => this._showSavePanel());
        document.getElementById('save-close').addEventListener('click', () => {
            document.getElementById('save-panel').classList.add('hidden');
        });

        // Sound toggle
        document.getElementById('btn-sound').addEventListener('click', () => {
            const on = Audio.toggle();
            document.getElementById('btn-sound').textContent = `Sound: ${on ? 'On' : 'Off'}`;
        });

        // Promotion OK
        document.getElementById('promotion-ok').addEventListener('click', () => {
            document.getElementById('promotion-panel').classList.add('hidden');
        });

        // Minimap click + drag
        const minimap = document.getElementById('minimap');
        minimap.addEventListener('mousedown', e => this._onMinimapDown(e));
        minimap.addEventListener('mousemove', e => {
            if (this._minimapDragging) this._onMinimapClick(e);
        });
        minimap.addEventListener('mouseup', () => { this._minimapDragging = false; });
        minimap.addEventListener('mouseleave', () => { this._minimapDragging = false; });
        minimap.addEventListener('click', e => this._onMinimapClick(e));
    },

    _onMouseDown(e) {
        if (e.button === 2 || e.button === 1) {
            this.isDragging = true;
            this.dragStartX = e.clientX;
            this.dragStartY = e.clientY;
            this.dragStartCamX = Renderer.camX;
            this.dragStartCamY = Renderer.camY;
            return;
        }

        this.isDragging = false;
        this._isLongPress = false;
        this._mouseDownTime = Date.now();
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        this.dragStartCamX = Renderer.camX;
        this.dragStartCamY = Renderer.camY;

        // Start long-press timer (300ms)
        clearTimeout(this._longPressTimer);
        this._longPressTimer = setTimeout(() => {
            if (!this.isDragging) {
                this._isLongPress = true;
            }
        }, 300);
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
        clearTimeout(this._longPressTimer);

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

        if (this._isLongPress) {
            // Long press: just show path preview, don't move
            this._handleLongClick(col, row);
        } else {
            // Quick click: select or move
            this._handleClick(col, row);
        }
        this._isLongPress = false;
    },

    _handleClick(col, row) {
        if (!Utils.inBounds(col, row)) return;
        if (GameState.phase !== 'play') return;

        const pid = GameState.currentPlayer;
        const currentPlayer = GameState.players[pid];
        if (!currentPlayer.isHuman) return;

        const army = GameState.getArmyAt(col, row);

        if (GameState.selectedArmy) {
            const selected = GameState.selectedArmy;

            // Clicked on same army - deselect
            if (army && army.id === selected.id) {
                this._deselectArmy();
                return;
            }

            // Clicked on a friendly army
            if (army && army.owner === pid && army.id !== selected.id) {
                // Can we combine? Show popup
                const totalUnits = selected.units.length + army.units.length;
                if (totalUnits <= MAX_STACK_SIZE) {
                    // Check if adjacent or within reach
                    const reachable = Movement.getReachableTiles(selected);
                    const key = `${col},${row}`;
                    if (reachable.has(key) || (selected.col === col && selected.row === row)) {
                        this._showMergePopup(selected, army);
                        return;
                    } else {
                        // Out of reach this turn - set waypoint
                        const path = Movement.findPath(selected, selected.col, selected.row, col, row);
                        if (path) {
                            GameState.setWaypoint(selected.id, col, row, path);
                            const result = Movement.moveArmy(selected, path);
                            if (result) this._saveUndoState(selected, result);
                            this._handleMoveResult(result, selected, col, row);
                            GameState.addMessage(`Waypoint set: army heading to (${col},${row})`);
                            HUD.update();
                            this._showWaypointBanner(selected);
                            return;
                        }
                    }
                }
                // Stack would be full or no path - switch selection
                this._selectArmy(army);
                return;
            }

            // Try to move/attack
            if (selected.movesLeft > 0) {
                const path = Movement.findPath(selected, selected.col, selected.row, col, row);
                if (path) {
                    // Check if destination is beyond reach - set waypoint
                    const reachable = Movement.getReachableTiles(selected);
                    const destKey = `${col},${row}`;
                    const isReachable = reachable.has(destKey);

                    const result = Movement.moveArmy(selected, path);
                    if (result) this._saveUndoState(selected, result);
                    this._handleMoveResult(result, selected, col, row);
                    GameState.movePath = null;

                    if (!isReachable && result && result.type === 'moved') {
                        // Set waypoint for remaining distance
                        GameState.setWaypoint(selected.id, col, row, path);
                        GameState.addMessage(`Waypoint set to (${col},${row})`);
                        this._showWaypointBanner(selected);
                    } else {
                        GameState.clearWaypoint(selected.id);
                    }

                    // Deselect if army ran out of moves (unless combat overlay showing)
                    if (result && result.type === 'moved' && selected.movesLeft <= 0) {
                        GameState.selectedArmy = null;
                        GameState.movePath = null;
                        HUD.showArmyPanel(null);
                        this._hideWaypointBanner();
                    }

                    HUD.update();
                    return;
                }
            }

            // Deselect
            this._deselectArmy();
        }

        // No selection - select own army
        if (army && army.owner === pid) {
            this._selectArmy(army);
        }

        // Show city info
        const city = GameState.getCityAt(col, row);
        if (city) {
            HUD.showCityPanel(city);
        } else {
            HUD.showCityPanel(null);
        }
    },

    _handleLongClick(col, row) {
        // Long press: show path preview without moving
        if (!Utils.inBounds(col, row)) return;
        if (GameState.phase !== 'play') return;
        if (!GameState.selectedArmy) return;

        const army = GameState.selectedArmy;
        const path = Movement.findPath(army, army.col, army.row, col, row);
        GameState.movePath = path;
        // Path stays visible until next click or deselect
    },

    _selectArmy(army) {
        this._hideWaypointBanner();
        Audio.playSelect();
        GameState.selectedArmy = army;
        GameState.movePath = null;
        HUD.showArmyPanel(army);

        // Show waypoint banner only for this army
        const wp = GameState.getWaypoint(army.id);
        if (wp) {
            this._showWaypointBanner(army);
        }
    },

    _deselectArmy() {
        this._hideWaypointBanner();
        GameState.selectedArmy = null;
        GameState.movePath = null;
        HUD.showArmyPanel(null);
    },

    _handleMoveResult(result, army, col, row) {
        if (!result) return;

        switch (result.type) {
            case 'combat': {
                Audio.playCombat();
                const terrain = GameState.tiles[result.defender.row][result.defender.col];
                const combatResult = Combat.resolve(result.attacker, result.defender, terrain);
                Combat.applyCombatResult(combatResult);
                HUD.showCombatResult(combatResult);

                const atkName = GameState.players[result.attacker.owner]?.name || 'Unknown';
                GameState.addMessage(`${atkName} attacks at (${col},${row})`);

                if (combatResult.winner === 'attacker') {
                    GameState.selectedArmy = result.attacker;
                    HUD.showArmyPanel(result.attacker);
                    // Check city capture
                    const capturedCity = GameState.getCityAt(result.defender.col, result.defender.row);
                    if (capturedCity && capturedCity.owner === result.attacker.owner) {
                        Audio.playCapture();
                    }
                } else {
                    GameState.selectedArmy = null;
                    HUD.showArmyPanel(null);
                }

                // Show promotion panel if any units were promoted
                if (combatResult.promotions && combatResult.promotions.length > 0) {
                    this._showPromotions(combatResult.promotions);
                }

                GameState.checkVictory();
                break;
            }
            case 'ruin': {
                Audio.playRuinFind();
                const searchResult = Heroes.searchRuin(result.army, result.ruin);
                HUD.showRuinResult(searchResult);
                GameState.addMessage(searchResult.message);
                break;
            }
            case 'merged':
                Audio.playSelect();
                GameState.selectedArmy = result.army;
                HUD.showArmyPanel(result.army);
                break;
            case 'moved':
                Audio.playMove();
                if (GameState.armies.includes(army)) {
                    HUD.showArmyPanel(army);
                }
                break;
        }
    },

    // ---- Merge popup ----
    _showMergePopup(source, target) {
        this.pendingMerge = { source, target };
        const panel = document.getElementById('merge-panel');
        const details = document.getElementById('merge-details');

        const srcColor = source.owner >= 0 ? GameState.players[source.owner].color.primary : '#888';
        const srcUnits = source.units.map(u => u.name).join(', ');
        const tgtUnits = target.units.map(u => u.name).join(', ');
        const total = source.units.length + target.units.length;

        details.innerHTML = `
            <div class="merge-army-info">
                <div class="army-label" style="color:${srcColor}">Selected Army (${source.units.length} units)</div>
                <div class="army-units-list">${srcUnits}</div>
            </div>
            <div style="text-align:center;color:var(--text-secondary);font-size:0.8rem">+ merge into +</div>
            <div class="merge-army-info">
                <div class="army-label" style="color:${srcColor}">Target Army (${target.units.length} units)</div>
                <div class="army-units-list">${tgtUnits}</div>
            </div>
            <div style="text-align:center;margin-top:0.4rem;color:var(--accent);font-weight:600">
                Combined: ${total}/${MAX_STACK_SIZE} units
            </div>
        `;
        panel.classList.remove('hidden');
    },

    _confirmMerge() {
        const { source, target } = this.pendingMerge;
        if (!source || !target) return;

        // Move source to target location if needed
        if (source.col !== target.col || source.row !== target.row) {
            const path = Movement.findPath(source, source.col, source.row, target.col, target.row);
            if (path) {
                Movement.moveArmy(source, path);
            }
        }

        // If they're now at same location, merge
        if (source.col === target.col && source.row === target.row) {
            for (const unit of source.units) {
                Units.addToArmy(target, unit);
            }
            GameState.removeArmy(source);
            GameState.selectedArmy = target;
            HUD.showArmyPanel(target);
            GameState.addMessage('Armies combined!');
        }

        this.pendingMerge = null;
        document.getElementById('merge-panel').classList.add('hidden');
        HUD.update();
    },

    _cancelMerge() {
        this.pendingMerge = null;
        document.getElementById('merge-panel').classList.add('hidden');
    },

    // ---- Waypoint system ----
    _showWaypointBanner(army) {
        const wp = GameState.getWaypoint(army.id);
        if (!wp) return;
        const banner = document.getElementById('waypoint-banner');
        document.getElementById('waypoint-text').textContent =
            `Waypoint: heading to (${wp.targetCol},${wp.targetRow})`;
        banner.classList.remove('hidden');
    },

    _hideWaypointBanner() {
        document.getElementById('waypoint-banner').classList.add('hidden');
    },

    _continueWaypoint() {
        const army = GameState.selectedArmy;
        if (!army) { this._hideWaypointBanner(); return; }

        const wp = GameState.getWaypoint(army.id);
        if (!wp) { this._hideWaypointBanner(); return; }

        // Recalculate path from current position
        const path = Movement.findPath(army, army.col, army.row, wp.targetCol, wp.targetRow);
        if (!path) {
            GameState.addMessage('Waypoint unreachable - cleared.');
            GameState.clearWaypoint(army.id);
            this._hideWaypointBanner();
            HUD.update();
            return;
        }

        GameState.setWaypoint(army.id, wp.targetCol, wp.targetRow, path);
        const result = Movement.moveArmy(army, path);
        this._handleMoveResult(result, army, wp.targetCol, wp.targetRow);

        // Check if arrived
        if (army.col === wp.targetCol && army.row === wp.targetRow) {
            GameState.clearWaypoint(army.id);
            GameState.addMessage('Arrived at waypoint!');
            this._hideWaypointBanner();
        }

        HUD.update();
    },

    _cancelWaypoint() {
        const army = GameState.selectedArmy;
        if (army) GameState.clearWaypoint(army.id);
        this._hideWaypointBanner();
    },

    _onWheel(e) {
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
            this._isLongPress = false;
            this._mouseDownTime = Date.now();

            clearTimeout(this._longPressTimer);
            this._longPressTimer = setTimeout(() => {
                if (!this.isDragging) {
                    this._isLongPress = true;
                    // Show path preview on long press
                    const rect = Renderer.canvas.getBoundingClientRect();
                    const mx = t.clientX - rect.left;
                    const my = t.clientY - rect.top;
                    const { col, row } = Renderer.screenToTile(mx, my);
                    this._handleLongClick(col, row);
                }
            }, 400);
        } else if (e.touches.length === 2) {
            this.isDragging = true;
            clearTimeout(this._longPressTimer);
        }
    },

    _onTouchMove(e) {
        e.preventDefault();
        if (e.touches.length === 1) {
            const t = e.touches[0];
            const dx = t.clientX - this.touchStartX;
            const dy = t.clientY - this.touchStartY;
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
                this.isDragging = true;
                Renderer.camX = this.dragStartCamX - dx;
                Renderer.camY = this.dragStartCamY - dy;
                Renderer.clampCamera();
            }
        }
    },

    _onTouchEnd(e) {
        clearTimeout(this._longPressTimer);
        if (!this.isDragging && e.changedTouches.length === 1) {
            if (this._isLongPress) {
                // Long press already handled path preview in touchstart timer
                this._isLongPress = false;
            } else {
                const t = e.changedTouches[0];
                const rect = Renderer.canvas.getBoundingClientRect();
                const mx = t.clientX - rect.left;
                const my = t.clientY - rect.top;
                const { col, row } = Renderer.screenToTile(mx, my);
                this._handleClick(col, row);
            }
        }
        this.isDragging = false;
    },

    _onKeyDown(e) {
        const scrollSpeed = TILE_SIZE * 2;
        switch (e.key) {
            case 'ArrowLeft': case 'a':
                Renderer.camX -= scrollSpeed; Renderer.clampCamera(); break;
            case 'ArrowRight': case 'd':
                Renderer.camX += scrollSpeed; Renderer.clampCamera(); break;
            case 'ArrowUp': case 'w':
                Renderer.camY -= scrollSpeed; Renderer.clampCamera(); break;
            case 'ArrowDown': case 's':
                Renderer.camY += scrollSpeed; Renderer.clampCamera(); break;
            case 'Enter': case 'e':
                this._endTurn(); break;
            case 'n': case 'Tab':
                e.preventDefault(); this._nextArmy(); break;
            case 'h':
                this._buyHero(); break;
            case 'Escape':
                this._deselectArmy();
                HUD.closePanels();
                this._cancelMerge();
                document.getElementById('unit-detail-panel').classList.add('hidden');
                break;
            case 'u':
                this._undoMove();
                break;
            case ' ':
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
        this._deselectArmy();
        this._undoState = null;
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
            this._deselectArmy();
            return;
        }

        let idx = 0;
        if (GameState.selectedArmy) {
            const curIdx = armies.findIndex(a => a.id === GameState.selectedArmy.id);
            idx = (curIdx + 1) % armies.length;
        }

        this._selectArmy(armies[idx]);
        Renderer.centerOn(armies[idx].col, armies[idx].row);
    },

    _onMinimapClick(e) {
        const rect = e.target.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const col = Math.floor((mx / e.target.width) * MAP_COLS);
        const row = Math.floor((my / e.target.height) * MAP_ROWS);
        Renderer.centerOn(col, row);
    },

    _minimapDragging: false,
    _onMinimapDown(e) {
        this._minimapDragging = true;
        this._onMinimapClick(e);
    },

    // ---- Undo last move (step-by-step) ----
    // _undoState.steps is a stack of positions: first entry is original start-of-turn pos,
    // last entry is the most recent tile before the army moved to its current tile.
    // Each undo pops one step and teleports the army back there.

    _saveUndoState(army, moveResult) {
        // moveResult.stepsWalked = [{col,row,movesLeft}, ...] from movement.js
        // First entry is where army was before it moved, rest are tiles walked through.
        if (!moveResult || !moveResult.stepsWalked || moveResult.stepsWalked.length < 2) return;

        // If switching to a different army, replace undo history entirely
        if (this._undoState && this._undoState.armyId !== army.id) {
            this._undoState = null;
        }

        const walked = moveResult.stepsWalked;

        if (!this._undoState) {
            // Brand new undo chain: store all steps except the final (current) position
            // stepsWalked[0] is the original position, stepsWalked[last] is where army ended up
            this._undoState = {
                armyId: army.id,
                steps: walked.slice(0, -1), // everything except final position
            };
        } else {
            // Continuing an existing chain: append intermediate steps
            // walked[0] is where army was (already our last known pos), so skip it
            for (let i = 1; i < walked.length - 1; i++) {
                this._undoState.steps.push(walked[i]);
            }
        }
    },

    _undoMove() {
        if (!this._undoState || this._undoState.steps.length === 0) {
            GameState.addMessage('Nothing to undo.');
            HUD.update();
            return;
        }
        const army = GameState.armies.find(a => a.id === this._undoState.armyId);
        if (!army) {
            this._undoState = null;
            GameState.addMessage('Army no longer exists.');
            HUD.update();
            return;
        }

        // Pop the last saved step (go back one square)
        const prevStep = this._undoState.steps.pop();
        army.col = prevStep.col;
        army.row = prevStep.row;
        army.movesLeft = prevStep.movesLeft;
        GameState.clearWaypoint(army.id);

        // If no more steps, undo is fully exhausted (back to start of turn)
        if (this._undoState.steps.length === 0) {
            this._undoState = null;
        }

        GameState.selectedArmy = army;
        GameState.movePath = null;
        HUD.showArmyPanel(army);
        GameState.addMessage('Move undone (1 step back).');
        HUD.update();
        Renderer.centerOn(army.col, army.row);
    },

    // ---- Split army ----
    _splitSelection: [],

    _showSplitPanel() {
        const army = GameState.selectedArmy;
        if (!army || army.owner !== GameState.currentPlayer) return;
        if (army.units.length < 2) {
            GameState.addMessage('Need at least 2 units to split.');
            return;
        }

        this._splitSelection = army.units.map(() => false);
        const panel = document.getElementById('split-panel');
        const container = document.getElementById('split-units');
        const color = GameState.players[army.owner].color.primary;

        container.innerHTML = '<div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.3rem">Select units to split into new army:</div>' +
            army.units.map((u, i) => {
                const str = Units.getEffectiveStr(u);
                const promo = u.promoted ? ' *' : '';
                return `<label class="split-unit-row" data-idx="${i}">
                    <input type="checkbox" data-idx="${i}">
                    <span class="unit-symbol" style="border-left:3px solid ${color}">${u.symbol}</span>
                    <span class="unit-name">${u.name}${promo}</span>
                    <span class="unit-stats">S:${str}</span>
                </label>`;
            }).join('');

        container.querySelectorAll('input[type=checkbox]').forEach(cb => {
            cb.addEventListener('change', () => {
                const idx = parseInt(cb.dataset.idx);
                this._splitSelection[idx] = cb.checked;
            });
        });

        panel.classList.remove('hidden');
    },

    _confirmSplit() {
        const army = GameState.selectedArmy;
        if (!army) { this._cancelSplit(); return; }

        const selectedIndices = [];
        this._splitSelection.forEach((sel, i) => { if (sel) selectedIndices.push(i); });

        if (selectedIndices.length === 0 || selectedIndices.length === army.units.length) {
            GameState.addMessage('Select some (but not all) units to split.');
            return;
        }

        // Find adjacent empty tile
        let splitTarget = null;
        for (const [nc, nr] of Utils.cardinalNeighbors(army.col, army.row)) {
            const t = GameState.tiles[nr][nc];
            if (TERRAIN_BY_ID[t].moveCost >= 50) continue;
            const existing = GameState.getArmyAt(nc, nr);
            if (!existing) {
                splitTarget = { col: nc, row: nr };
                break;
            }
        }

        if (!splitTarget) {
            GameState.addMessage('No adjacent empty tile to split into.');
            return;
        }

        // Create new army with selected units
        const newUnits = [];
        // Remove in reverse order to keep indices valid
        for (let i = selectedIndices.length - 1; i >= 0; i--) {
            const idx = selectedIndices[i];
            newUnits.unshift(army.units.splice(idx, 1)[0]);
        }

        const newArmy = {
            id: Utils.uid(),
            col: splitTarget.col,
            row: splitTarget.row,
            owner: army.owner,
            units: newUnits,
            movesLeft: Math.min(army.movesLeft, Units.armyMoves({ units: newUnits })),
        };
        GameState.armies.push(newArmy);
        GameState.addMessage(`Army split! New army at (${splitTarget.col},${splitTarget.row})`);
        Audio.playSelect();

        this._cancelSplit();
        HUD.showArmyPanel(army);
        HUD.update();
    },

    _cancelSplit() {
        this._splitSelection = [];
        document.getElementById('split-panel').classList.add('hidden');
    },

    // ---- Scout mode ----
    _toggleScout() {
        const army = GameState.selectedArmy;
        if (!army || army.owner !== GameState.currentPlayer) return;

        army.scouting = !army.scouting;
        if (army.scouting) {
            GameState.addMessage('Army set to scout mode - will auto-explore each turn.');
            Audio.playSelect();
        } else {
            GameState.addMessage('Scout mode disabled.');
        }
        HUD.showArmyPanel(army);
        HUD.update();
    },

    // ---- Save panel ----
    _showSavePanel() {
        const panel = document.getElementById('save-panel');
        const container = document.getElementById('save-slots');

        let html = '';
        for (let i = 0; i < SaveGame.MAX_SLOTS; i++) {
            const info = SaveGame.getSlotInfo(i);
            const label = info
                ? `Slot ${i + 1}: ${info.playerName} - Turn ${info.turn} (${info.date})`
                : `Slot ${i + 1}: Empty`;
            html += `<div style="display:flex;gap:0.3rem;margin-bottom:0.3rem">
                <button class="btn btn-sm save-slot-save" data-slot="${i}" style="flex:1;text-align:left">${label}</button>
                ${info ? `<button class="btn btn-sm btn-danger save-slot-del" data-slot="${i}">X</button>` : ''}
            </div>`;
        }
        container.innerHTML = html;

        container.querySelectorAll('.save-slot-save').forEach(btn => {
            btn.addEventListener('click', () => {
                SaveGame.save(parseInt(btn.dataset.slot));
                this._showSavePanel(); // Refresh
                HUD.update();
            });
        });
        container.querySelectorAll('.save-slot-del').forEach(btn => {
            btn.addEventListener('click', () => {
                SaveGame.deleteSave(parseInt(btn.dataset.slot));
                this._showSavePanel();
            });
        });

        panel.classList.remove('hidden');
    },

    // ---- Promotion display ----
    _showPromotions(promotions) {
        Audio.playPromotion();
        const panel = document.getElementById('promotion-panel');
        const msg = document.getElementById('promotion-message');
        msg.innerHTML = promotions.map(p =>
            `<div style="margin-bottom:0.3rem"><strong style="color:var(--gold)">${p.unitName}</strong> has been promoted!</div>`
        ).join('');
        panel.classList.remove('hidden');
    },
};
