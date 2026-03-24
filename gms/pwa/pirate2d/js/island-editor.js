// Island Editor - Debug tool for creating custom island templates
// Loaded dynamically via debug.js, never included in production

const TILE_COUNT = 96;
const DEFAULT_SIZE = 12;
const CELL_PX = 40;
const STORAGE_KEY = 'pirate2d_custom_islands';

const HOTSPOT_TYPES = ['port', 'treasure_map'];
const HOTSPOT_COLORS = { port: '#44cc44', treasure_map: '#ffd700' };
const HOTSPOT_ICONS = { port: '\u2693', treasure_map: '\uD83D\uDDFA\uFE0F' };

export class IslandEditor {
    constructor(game) {
        this.game = game;
        this.tileImages = new Map();
        this.selectedTile = 42; // beach by default
        this.tool = 'paint'; // paint | erase | hotspot
        this.hotspotType = 'port';
        this.gridW = DEFAULT_SIZE;
        this.gridH = DEFAULT_SIZE;
        this.tiles = new Array(DEFAULT_SIZE * DEFAULT_SIZE).fill(0);
        this.hotspots = []; // { tx, ty, type }
        this.islandId = 1;
        this.islandName = 'Island 1';
        this.overlay = null;
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.painting = false;
    }

    async open() {
        await this._loadAllTiles();
        this._findNextFreeId();
        this._buildUI();
        this._renderGrid();
    }

    async _loadAllTiles() {
        if (this.tileImages.size === TILE_COUNT) return;
        const promises = [];
        for (let i = 1; i <= TILE_COUNT; i++) {
            const img = new Image();
            const num = String(i).padStart(2, '0');
            promises.push(new Promise(resolve => {
                img.onload = resolve;
                img.onerror = resolve;
                img.src = `assets/tiles/tile_${num}.png`;
            }));
            this.tileImages.set(i, img);
        }
        await Promise.all(promises);
    }

    _findNextFreeId() {
        const saved = this._loadAll();
        let maxId = 0;
        for (const isl of saved) {
            if (isl.id > maxId) maxId = isl.id;
        }
        this.islandId = maxId + 1;
        this.islandName = `Island ${this.islandId}`;
    }

    _buildUI() {
        // Overlay
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:2000;';

        // Main container
        this.container = document.createElement('div');
        this.container.style.cssText = `
            position:fixed;inset:0;z-index:2001;display:flex;flex-direction:column;
            font-family:'Pirata One',Georgia,serif;color:#fff;overflow:hidden;
        `;

        // Top toolbar
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'padding:8px 12px;background:#1a1a2e;display:flex;flex-wrap:wrap;gap:6px;align-items:center;border-bottom:2px solid #ffd700;';
        toolbar.innerHTML = `
            <span style="color:#ffd700;font-size:16px;margin-right:8px;">Island Editor</span>
            <label style="font-size:12px;">Name: <input type="text" id="ie-name" value="${this.islandName}" style="width:120px;background:#222;border:1px solid #555;color:#fff;padding:2px 6px;font-size:12px;border-radius:3px;"></label>
            <label style="font-size:12px;">ID: <input type="number" id="ie-id" value="${this.islandId}" min="1" style="width:50px;background:#222;border:1px solid #555;color:#fff;padding:2px 6px;font-size:12px;border-radius:3px;"></label>
            <label style="font-size:12px;">W: <input type="number" id="ie-w" value="${this.gridW}" min="4" max="20" style="width:40px;background:#222;border:1px solid #555;color:#fff;padding:2px 4px;font-size:12px;border-radius:3px;"></label>
            <label style="font-size:12px;">H: <input type="number" id="ie-h" value="${this.gridH}" min="4" max="20" style="width:40px;background:#222;border:1px solid #555;color:#fff;padding:2px 4px;font-size:12px;border-radius:3px;"></label>
            <button id="ie-resize" style="${this._btnStyle('#444')}" title="Resize grid">Resize</button>
            <button id="ie-save" style="${this._btnStyle('#2a6e2a')}">Save</button>
            <button id="ie-load" style="${this._btnStyle('#2a4a6e')}">Load</button>
            <button id="ie-clear" style="${this._btnStyle('#6e4a2a')}">Clear</button>
            <button id="ie-delete" style="${this._btnStyle('#6e2a2a')}">Delete</button>
            <button id="ie-close" style="${this._btnStyle('#555')}">Close</button>
            <span id="ie-status" style="font-size:11px;color:#aaa;margin-left:8px;"></span>
        `;

        // Tool bar
        const tools = document.createElement('div');
        tools.style.cssText = 'padding:6px 12px;background:#12122a;display:flex;gap:6px;align-items:center;flex-wrap:wrap;';
        tools.innerHTML = `
            <span style="font-size:12px;color:#aaa;">Tool:</span>
            <button id="ie-tool-paint" class="ie-tool-btn" style="${this._toolBtnStyle(true)}">Paint</button>
            <button id="ie-tool-erase" class="ie-tool-btn" style="${this._toolBtnStyle(false)}">Erase</button>
            <button id="ie-tool-hotspot" class="ie-tool-btn" style="${this._toolBtnStyle(false)}">Hotspot</button>
            <span id="ie-hotspot-opts" style="display:none;font-size:12px;margin-left:8px;">
                Type: ${HOTSPOT_TYPES.map(t => `<label style="margin:0 4px;"><input type="radio" name="ie-hs-type" value="${t}" ${t === this.hotspotType ? 'checked' : ''}> ${t}</label>`).join('')}
            </span>
            <span style="margin-left:auto;font-size:12px;color:#aaa;" id="ie-selected-info">Selected: tile_42 (beach)</span>
        `;

        // Middle area: grid + palette side by side
        const middle = document.createElement('div');
        middle.style.cssText = 'flex:1;display:flex;overflow:hidden;min-height:0;';

        // Grid area (scrollable)
        const gridWrap = document.createElement('div');
        gridWrap.style.cssText = 'flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:12px;background:#0a0a18;';

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.gridW * CELL_PX;
        this.canvas.height = this.gridH * CELL_PX;
        this.canvas.style.cssText = 'border:2px solid #ffd700;cursor:crosshair;touch-action:none;image-rendering:pixelated;';
        this.ctx = this.canvas.getContext('2d');
        gridWrap.appendChild(this.canvas);

        // Palette (right side, scrollable)
        const palette = document.createElement('div');
        palette.style.cssText = 'width:200px;min-width:200px;overflow-y:auto;background:#12122a;border-left:2px solid #333;padding:8px;';
        palette.innerHTML = '<div style="font-size:13px;color:#ffd700;margin-bottom:6px;text-align:center;">Tile Palette</div>';

        const paletteGrid = document.createElement('div');
        paletteGrid.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:3px;';

        for (let i = 1; i <= TILE_COUNT; i++) {
            const cell = document.createElement('div');
            cell.dataset.tile = i;
            cell.style.cssText = `
                width:42px;height:42px;border:2px solid ${i === this.selectedTile ? '#ffd700' : '#333'};
                border-radius:3px;cursor:pointer;position:relative;overflow:hidden;
                background:#0a1628;
            `;
            const img = this.tileImages.get(i);
            if (img && img.complete && img.naturalWidth) {
                const c = document.createElement('canvas');
                c.width = 42; c.height = 42;
                c.getContext('2d').drawImage(img, 0, 0, 42, 42);
                c.style.cssText = 'width:100%;height:100%;image-rendering:pixelated;';
                cell.appendChild(c);
            }
            const label = document.createElement('div');
            label.style.cssText = 'position:absolute;bottom:0;right:0;background:rgba(0,0,0,0.7);color:#aaa;font-size:8px;padding:0 2px;';
            label.textContent = i;
            cell.appendChild(label);
            paletteGrid.appendChild(cell);
        }
        palette.appendChild(paletteGrid);

        // Island list at bottom of palette
        const listDiv = document.createElement('div');
        listDiv.id = 'ie-island-list';
        listDiv.style.cssText = 'margin-top:12px;border-top:1px solid #333;padding-top:8px;';
        listDiv.innerHTML = this._buildIslandListHTML();
        palette.appendChild(listDiv);

        middle.appendChild(gridWrap);
        middle.appendChild(palette);

        this.container.appendChild(toolbar);
        this.container.appendChild(tools);
        this.container.appendChild(middle);

        const uiLayer = document.getElementById('ui-layer');
        uiLayer.appendChild(this.overlay);
        uiLayer.appendChild(this.container);

        this._wireEvents(toolbar, tools, paletteGrid);
    }

    _wireEvents(toolbar, tools, paletteGrid) {
        // Toolbar buttons
        toolbar.querySelector('#ie-save').addEventListener('click', () => this._save());
        toolbar.querySelector('#ie-load').addEventListener('click', () => this._loadCurrent());
        toolbar.querySelector('#ie-clear').addEventListener('click', () => this._clearGrid());
        toolbar.querySelector('#ie-delete').addEventListener('click', () => this._deleteCurrent());
        toolbar.querySelector('#ie-close').addEventListener('click', () => this.close());
        toolbar.querySelector('#ie-resize').addEventListener('click', () => this._resizeGrid());

        toolbar.querySelector('#ie-name').addEventListener('input', (e) => {
            this.islandName = e.target.value;
        });
        toolbar.querySelector('#ie-id').addEventListener('change', (e) => {
            this.islandId = Math.max(1, parseInt(e.target.value) || 1);
        });

        // Tool buttons
        const toolBtns = tools.querySelectorAll('.ie-tool-btn');
        const hsOpts = tools.querySelector('#ie-hotspot-opts');

        const selectTool = (t) => {
            this.tool = t;
            toolBtns.forEach(b => b.style.borderColor = '#555');
            tools.querySelector(`#ie-tool-${t}`).style.borderColor = '#ffd700';
            hsOpts.style.display = t === 'hotspot' ? 'inline' : 'none';
        };

        tools.querySelector('#ie-tool-paint').addEventListener('click', () => selectTool('paint'));
        tools.querySelector('#ie-tool-erase').addEventListener('click', () => selectTool('erase'));
        tools.querySelector('#ie-tool-hotspot').addEventListener('click', () => selectTool('hotspot'));

        tools.querySelectorAll('input[name="ie-hs-type"]').forEach(r => {
            r.addEventListener('change', (e) => { this.hotspotType = e.target.value; });
        });

        // Palette selection
        paletteGrid.addEventListener('click', (e) => {
            const cell = e.target.closest('[data-tile]');
            if (!cell) return;
            const tileNum = parseInt(cell.dataset.tile);
            this.selectedTile = tileNum;
            // Update border highlights
            paletteGrid.querySelectorAll('[data-tile]').forEach(c => {
                c.style.borderColor = parseInt(c.dataset.tile) === tileNum ? '#ffd700' : '#333';
            });
            const num = String(tileNum).padStart(2, '0');
            this.container.querySelector('#ie-selected-info').textContent = `Selected: tile_${num}`;
            this.tool = 'paint';
            selectTool('paint');
        });

        // Canvas drawing events
        const getCell = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            let clientX, clientY;
            if (e.touches) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }
            const tx = Math.floor((clientX - rect.left) * scaleX / CELL_PX);
            const ty = Math.floor((clientY - rect.top) * scaleY / CELL_PX);
            if (tx < 0 || tx >= this.gridW || ty < 0 || ty >= this.gridH) return null;
            return { tx, ty };
        };

        const applyTool = (cell) => {
            if (!cell) return;
            const idx = cell.ty * this.gridW + cell.tx;
            if (this.tool === 'paint') {
                this.tiles[idx] = this.selectedTile;
                this._renderGrid();
            } else if (this.tool === 'erase') {
                this.tiles[idx] = 0;
                // Also remove hotspot at this cell
                this.hotspots = this.hotspots.filter(h => !(h.tx === cell.tx && h.ty === cell.ty));
                this._renderGrid();
            } else if (this.tool === 'hotspot') {
                // Toggle hotspot
                const existing = this.hotspots.findIndex(h => h.tx === cell.tx && h.ty === cell.ty);
                if (existing >= 0) {
                    this.hotspots.splice(existing, 1);
                } else {
                    this.hotspots.push({ tx: cell.tx, ty: cell.ty, type: this.hotspotType });
                }
                this._renderGrid();
            }
        };

        this.canvas.addEventListener('mousedown', (e) => {
            e.preventDefault();
            this.painting = true;
            applyTool(getCell(e));
        });
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.painting && this.tool !== 'hotspot') applyTool(getCell(e));
        });
        this.canvas.addEventListener('mouseup', () => { this.painting = false; });
        this.canvas.addEventListener('mouseleave', () => { this.painting = false; });

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.painting = true;
            applyTool(getCell(e));
        }, { passive: false });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.painting && this.tool !== 'hotspot') applyTool(getCell(e));
        }, { passive: false });
        this.canvas.addEventListener('touchend', () => { this.painting = false; });
    }

    _renderGrid() {
        const ctx = this.ctx;
        const w = this.gridW;
        const h = this.gridH;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (let ty = 0; ty < h; ty++) {
            for (let tx = 0; tx < w; tx++) {
                const tileNum = this.tiles[ty * w + tx];
                const px = tx * CELL_PX;
                const py = ty * CELL_PX;

                if (tileNum === 0) {
                    // Water
                    ctx.fillStyle = '#1a3c6e';
                    ctx.fillRect(px, py, CELL_PX, CELL_PX);
                } else {
                    const img = this.tileImages.get(tileNum);
                    if (img && img.complete && img.naturalWidth) {
                        ctx.drawImage(img, px, py, CELL_PX, CELL_PX);
                    } else {
                        ctx.fillStyle = '#3a7a3a';
                        ctx.fillRect(px, py, CELL_PX, CELL_PX);
                    }
                }

                // Grid lines
                ctx.strokeStyle = 'rgba(255,255,255,0.15)';
                ctx.strokeRect(px, py, CELL_PX, CELL_PX);
            }
        }

        // Draw hotspots
        for (const hs of this.hotspots) {
            const px = hs.tx * CELL_PX + CELL_PX / 2;
            const py = hs.ty * CELL_PX + CELL_PX / 2;
            const color = HOTSPOT_COLORS[hs.type] || '#ff0000';

            ctx.beginPath();
            ctx.arc(px, py, CELL_PX * 0.35, 0, Math.PI * 2);
            ctx.fillStyle = color + '66';
            ctx.fill();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px Georgia';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(HOTSPOT_ICONS[hs.type] || '?', px, py);
        }
    }

    _resizeGrid() {
        const newW = Math.min(20, Math.max(4, parseInt(this.container.querySelector('#ie-w').value) || DEFAULT_SIZE));
        const newH = Math.min(20, Math.max(4, parseInt(this.container.querySelector('#ie-h').value) || DEFAULT_SIZE));

        // Copy existing tiles to new grid
        const newTiles = new Array(newW * newH).fill(0);
        const copyW = Math.min(this.gridW, newW);
        const copyH = Math.min(this.gridH, newH);
        for (let y = 0; y < copyH; y++) {
            for (let x = 0; x < copyW; x++) {
                newTiles[y * newW + x] = this.tiles[y * this.gridW + x];
            }
        }

        // Filter hotspots that are out of bounds
        this.hotspots = this.hotspots.filter(h => h.tx < newW && h.ty < newH);

        this.gridW = newW;
        this.gridH = newH;
        this.tiles = newTiles;
        this.canvas.width = newW * CELL_PX;
        this.canvas.height = newH * CELL_PX;
        this._renderGrid();
        this._setStatus(`Resized to ${newW}x${newH}`);
    }

    _save() {
        const saved = this._loadAll();
        const existing = saved.findIndex(i => i.id === this.islandId);
        const data = {
            id: this.islandId,
            name: this.islandName,
            width: this.gridW,
            height: this.gridH,
            tiles: [...this.tiles],
            hotspots: this.hotspots.map(h => ({ ...h }))
        };

        if (existing >= 0) {
            saved[existing] = data;
        } else {
            saved.push(data);
        }

        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
            this._setStatus(`Saved island #${this.islandId} "${this.islandName}"`);
            this._refreshList();
        } catch (e) {
            this._setStatus('Save failed: ' + e.message);
        }
    }

    _loadCurrent() {
        const id = parseInt(this.container.querySelector('#ie-id').value) || 1;
        this._loadById(id);
    }

    _loadById(id) {
        const saved = this._loadAll();
        const isl = saved.find(i => i.id === id);
        if (!isl) {
            this._setStatus(`No island #${id} found`);
            return;
        }

        this.islandId = isl.id;
        this.islandName = isl.name || `Island ${isl.id}`;
        this.gridW = isl.width;
        this.gridH = isl.height;
        this.tiles = [...isl.tiles];
        this.hotspots = (isl.hotspots || []).map(h => ({ ...h }));

        this.container.querySelector('#ie-id').value = this.islandId;
        this.container.querySelector('#ie-name').value = this.islandName;
        this.container.querySelector('#ie-w').value = this.gridW;
        this.container.querySelector('#ie-h').value = this.gridH;
        this.canvas.width = this.gridW * CELL_PX;
        this.canvas.height = this.gridH * CELL_PX;
        this._renderGrid();
        this._setStatus(`Loaded island #${id} "${this.islandName}"`);
    }

    _deleteCurrent() {
        const saved = this._loadAll();
        const idx = saved.findIndex(i => i.id === this.islandId);
        if (idx < 0) {
            this._setStatus(`No island #${this.islandId} to delete`);
            return;
        }
        saved.splice(idx, 1);
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
            this._setStatus(`Deleted island #${this.islandId}`);
            this._refreshList();
        } catch (e) {
            this._setStatus('Delete failed: ' + e.message);
        }
    }

    _clearGrid() {
        this.tiles.fill(0);
        this.hotspots.length = 0;
        this._renderGrid();
        this._setStatus('Grid cleared');
    }

    _loadAll() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch {
            return [];
        }
    }

    _buildIslandListHTML() {
        const saved = this._loadAll();
        if (saved.length === 0) return '<div style="font-size:11px;color:#666;">No saved islands</div>';
        let html = '<div style="font-size:12px;color:#ffd700;margin-bottom:4px;">Saved Islands:</div>';
        for (const isl of saved) {
            html += `<div class="ie-list-item" data-load-id="${isl.id}" style="cursor:pointer;padding:3px 6px;font-size:11px;color:#ccc;border-bottom:1px solid #222;">#${isl.id} ${isl.name} (${isl.width}x${isl.height})</div>`;
        }
        return html;
    }

    _refreshList() {
        const listDiv = this.container.querySelector('#ie-island-list');
        if (listDiv) {
            listDiv.innerHTML = this._buildIslandListHTML();
            listDiv.querySelectorAll('.ie-list-item').forEach(el => {
                el.addEventListener('click', () => {
                    this._loadById(parseInt(el.dataset.loadId));
                });
            });
        }
    }

    _setStatus(msg) {
        const el = this.container.querySelector('#ie-status');
        if (el) el.textContent = msg;
    }

    _btnStyle(bg) {
        return `background:${bg};color:#fff;border:1px solid #666;border-radius:4px;padding:4px 10px;font-size:11px;cursor:pointer;font-family:'Pirata One',Georgia,serif;`;
    }

    _toolBtnStyle(active) {
        return `background:#222;color:#fff;border:2px solid ${active ? '#ffd700' : '#555'};border-radius:4px;padding:4px 12px;font-size:12px;cursor:pointer;font-family:'Pirata One',Georgia,serif;`;
    }

    close() {
        if (this.container && this.container.parentNode) this.container.parentNode.removeChild(this.container);
        if (this.overlay && this.overlay.parentNode) this.overlay.parentNode.removeChild(this.overlay);
        this.container = null;
        this.overlay = null;
        if (this.game) this.game.resume();
    }
}

// Static helper to load custom island templates (used by world.js)
export function loadCustomIslands() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}
