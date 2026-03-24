// Debug panel - import this file to enable debug buttons
// Activated when player name contains "abdebugt3st"

import { RUN_UPGRADES } from './upgrades.js';
import { formatGold } from './utils.js';

export class DebugPanel {
    constructor(game) {
        this.game = game;
        this.visible = false;
        this.panel = null;
        this._godPanel = null;
    }

    checkActivation(playerName) {
        if (playerName && playerName.toLowerCase().includes('abdebugt3st')) {
            this.show();
            return true;
        }
        this.hide();
        return false;
    }

    show() {
        if (this.panel) return;
        this.visible = true;

        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            position: fixed;
            top: 50%;
            right: max(8px, env(safe-area-inset-right, 0px));
            transform: translateY(-50%);
            z-index: 999;
            display: flex;
            flex-direction: column;
            gap: 4px;
            pointer-events: auto;
        `;

        const buttons = [
            { label: 'GOD', color: '#8b2020', action: () => this._showGodPanel() },
            { label: 'ISL', color: '#2a6e4a', action: () => this._openIslandEditor() },
            { label: 'B1', color: '#4a2080', action: () => this._spawnBoss(1) },
            { label: 'B2', color: '#204a80', action: () => this._spawnBoss(2) },
            { label: 'KRK', color: '#206040', action: () => this._spawnBoss(3) },
            { label: 'B?', color: '#806020', action: () => this._spawnCustomBoss() },
        ];

        for (const btn of buttons) {
            const el = document.createElement('button');
            el.textContent = btn.label;
            el.style.cssText = `
                width: 40px;
                height: 40px;
                border-radius: 50%;
                border: 2px solid rgba(255,255,255,0.3);
                background: ${btn.color};
                color: #fff;
                font-size: 10px;
                font-weight: bold;
                font-family: 'Pirata One', Georgia, serif;
                cursor: pointer;
                opacity: 0.7;
                pointer-events: auto;
            `;
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.action();
            });
            this.panel.appendChild(el);
        }

        const uiLayer = document.getElementById('ui-layer');
        if (uiLayer) uiLayer.appendChild(this.panel);
    }

    hide() {
        if (this.panel) {
            if (this.panel.parentNode) this.panel.parentNode.removeChild(this.panel);
            this.panel = null;
        }
        this.visible = false;
        this._closeGodPanel();
    }

    _showGodPanel() {
        // Toggle off if already open
        if (this._godPanel) {
            this._closeGodPanel();
            this.game.resume();
            return;
        }

        this.game.pause();

        // Overlay
        this._godOverlay = document.createElement('div');
        this._godOverlay.className = 'settings-overlay';
        this._godOverlay.addEventListener('click', () => {
            this._closeGodPanel();
            this.game.resume();
        });

        // Panel
        this._godPanel = document.createElement('div');
        this._godPanel.className = 'game-panel';
        this._godPanel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(340px,90vw);z-index:1001;text-align:center;max-height:80vh;overflow-y:auto;';

        const btnStyle = `
            display:block;width:100%;padding:12px 16px;margin:6px 0;
            border-radius:6px;border:2px solid rgba(255,255,255,0.2);
            color:#fff;font-size:14px;font-weight:bold;
            font-family:'Pirata One',Georgia,serif;cursor:pointer;
            text-align:left;transition:transform 0.1s;
        `;

        const items = [
            { icon: '💰', label: 'Gold Rush', desc: '+500k gold (works with bury)', color: '#7a6520', action: () => this._giveGold() },
            { icon: '⚔️', label: 'Max Upgrades', desc: 'All ship upgrades to level 10', color: '#4a2080', action: () => this._maxUpgrades() },
            { icon: '❤️', label: 'Max Health', desc: '999k HP (not a valid test!)', color: '#8b2020', action: () => this._maxHealth() },
            { icon: '🌊', label: 'Teleport 7990m', desc: 'Jump to late-game waters', color: '#20506a', action: () => this._teleport(7990) },
            { icon: '🌊', label: 'Teleport 8990m', desc: 'Boss 2 territory', color: '#1a4060', action: () => this._teleport(8990) },
            { icon: '🌊', label: 'Teleport 9990m', desc: 'Kraken territory', color: '#143050', action: () => this._teleport(9990) },
        ];

        let html = `<h2 style="margin-bottom:4px;color:#ff6b6b;">☠️ God Mode</h2>
            <p style="font-size:11px;color:#a08050;margin-bottom:12px;">Debug cheats for testing</p>`;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            html += `<button class="god-btn" data-idx="${i}" style="${btnStyle}background:linear-gradient(180deg,${item.color} 0%,${this._darken(item.color)} 100%);">
                <span style="font-size:18px;margin-right:8px;">${item.icon}</span>
                <span>${item.label}</span>
                <span style="display:block;font-size:11px;font-weight:normal;color:rgba(255,255,255,0.6);margin-top:2px;padding-left:26px;">${item.desc}</span>
            </button>`;
        }

        html += `<button class="god-close-btn" style="${btnStyle}background:linear-gradient(180deg,#555 0%,#333 100%);text-align:center;margin-top:12px;">Close</button>`;

        this._godPanel.innerHTML = html;

        // Wire up buttons
        const btns = this._godPanel.querySelectorAll('.god-btn');
        btns.forEach((btn) => {
            const idx = parseInt(btn.dataset.idx, 10);
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                items[idx].action();
            });
        });

        this._godPanel.querySelector('.god-close-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this._closeGodPanel();
            this.game.resume();
        });

        const uiLayer = document.getElementById('ui-layer');
        uiLayer.appendChild(this._godOverlay);
        uiLayer.appendChild(this._godPanel);
    }

    _closeGodPanel() {
        if (this._godPanel) {
            if (this._godPanel.parentNode) this._godPanel.parentNode.removeChild(this._godPanel);
            this._godPanel = null;
        }
        if (this._godOverlay) {
            if (this._godOverlay.parentNode) this._godOverlay.parentNode.removeChild(this._godOverlay);
            this._godOverlay = null;
        }
    }

    _darken(hex) {
        // Simple darken by reducing each channel
        const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - 30);
        const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - 30);
        const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - 30);
        return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
    }

    _giveGold() {
        const player = this.game.player;
        player.gold += 500000;
        player.totalGoldEarned += 500000;
        this.game.ui.showToast(`+${formatGold(500000)} gold added`);
        this.game.ui.updateHUD(player);
    }

    _maxUpgrades() {
        const player = this.game.player;
        for (const key of Object.keys(RUN_UPGRADES)) {
            player.upgrades[key] = RUN_UPGRADES[key].maxLevel;
        }
        // Heal to new max HP since hull upgrades increased it
        player.hp = player.maxHp;
        this.game.ui.showToast('All ship upgrades maxed!');
        this.game.ui.updateHUD(player);
    }

    _maxHealth() {
        const player = this.game.player;
        player.baseStats.maxHp = 999999;
        player.hp = 999999;
        this.game.ui.showToast('999k HP granted (not a valid test!)');
        this.game.ui.updateHUD(player);
    }

    _teleport(distMeters) {
        const player = this.game.player;
        // Home is at (200, 200-ish). Move player south (positive Y) from home origin
        // distFromHome = sqrt((x-200)^2 + (y-200)^2), so set y = 200 + distMeters
        const homeX = 200;
        const homeY = 200;
        // Move in the direction the player is facing from home
        const angle = player.angle;
        player.x = homeX + Math.cos(angle) * distMeters;
        player.y = homeY + Math.sin(angle) * distMeters;
        player.maxDistFromHome = Math.max(player.maxDistFromHome, distMeters);
        // Update camera immediately
        this.game.camX = player.x;
        this.game.camY = player.y;
        this.game.ui.showToast(`Teleported to ${distMeters}m`);
        this.game.ui.updateHUD(player);
        this._closeGodPanel();
        this.game.resume();
    }

    async _openIslandEditor() {
        this.game.pause();
        try {
            const { IslandEditor } = await import('./island-editor.js');
            if (!this._islandEditor) {
                this._islandEditor = new IslandEditor(this.game);
            }
            await this._islandEditor.open();
        } catch (e) {
            console.error('Failed to load island editor:', e);
            this.game.ui.showToast('Island editor failed to load');
            this.game.resume();
        }
    }

    _spawnCustomBoss() {
        const input = prompt('Enter boss level (e.g. 15):');
        if (!input) return;
        const level = parseInt(input, 10);
        if (isNaN(level) || level < 1) {
            this.game.ui.showToast('Invalid level');
            return;
        }

        const player = this.game.player;
        const spawnDist = 300;
        const spawnX = player.x + Math.cos(player.angle) * spawnDist;
        const spawnY = player.y + Math.sin(player.angle) * spawnDist;

        // Spawn a Ghost Ship (boss type, index 4) at the given level
        const { Enemy, ENEMY_TYPES } = this.game._getEnemyImports();
        const boss = new Enemy(ENEMY_TYPES[4], spawnX, spawnY, level);
        boss._world = this.game.world;
        this.game.enemySpawner.enemies.push(boss);
        this.game.ui.showToast(`DEBUG: Lv${level} ${ENEMY_TYPES[4].name} spawned!`);
    }

    _spawnBoss(runBoss) {
        const player = this.game.player;
        const spawnDist = 300;
        const spawnX = player.x + Math.cos(player.angle) * spawnDist;
        const spawnY = player.y + Math.sin(player.angle) * spawnDist;

        if (runBoss === 3) {
            // Kraken
            this.game.spawnKraken(spawnX, spawnY);
            this.game.ui.showToast('DEBUG: Kraken spawned!');
        } else {
            this.game.spawnRunBoss(runBoss, spawnX, spawnY);
            this.game.ui.showToast(`DEBUG: Boss ${runBoss} spawned!`);
        }
    }
}
