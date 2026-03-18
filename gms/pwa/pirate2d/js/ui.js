// UI System - HUD, menus, settings, trade/upgrade panels

import { TRADE_GOODS } from './trading.js';
import { RUN_UPGRADES, PERMANENT_UPGRADES } from './upgrades.js';
import { formatGold } from './utils.js';

export class UIManager {
    constructor(game) {
        this.game = game;
        this.uiLayer = document.getElementById('ui-layer');
        this.activePanel = null;
        this.toasts = [];

        this._createSettingsButton();
        this._createHUD();
        this._createMinimap();
    }

    _createSettingsButton() {
        const btn = document.createElement('div');
        btn.className = 'settings-btn';
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.53c.04-.32.07-.64.07-.97s-.03-.66-.07-1l2.11-1.63c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64L4.57 11c-.04.34-.07.67-.07 1s.03.65.07.97l-2.11 1.66c-.19.15-.25.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1.01c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1.01c.22.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.66z"/></svg>`;
        btn.addEventListener('click', () => this.showSettings());
        this.uiLayer.appendChild(btn);
        this.settingsBtn = btn;
    }

    _createHUD() {
        this.hud = document.createElement('div');
        this.hud.className = 'hud';
        this.hud.innerHTML = `
            <div class="hud-item"><span class="icon">\u2764\uFE0F</span><div class="health-bar-bg"><div class="health-bar-fill" id="hud-hp"></div></div><span id="hud-hp-text">100</span></div>
            <div class="hud-item"><span class="icon">\uD83D\uDCB0</span><span id="hud-gold">0</span></div>
            <div class="hud-item"><span class="icon">\uD83D\uDCE6</span><span id="hud-cargo">0/20</span></div>
            <div class="hud-item"><span class="icon">\uD83D\uDDE1\uFE0F</span><span id="hud-kills">0</span></div>
            <div class="hud-item"><span class="icon">\uD83C\uDF0A</span><span id="hud-dist">0m</span></div>
            <div class="hud-item" id="hud-medicine-btn" style="cursor:pointer;display:none;pointer-events:auto;"><span class="icon">\uD83D\uDC8A</span><span id="hud-medicine-text">Q</span></div>
        `;
        this.hud.style.display = 'none';
        this.uiLayer.appendChild(this.hud);

        // Cache HUD element references to avoid per-frame DOM lookups
        this._hudHpBar = this.hud.querySelector('#hud-hp');
        this._hudHpText = this.hud.querySelector('#hud-hp-text');
        this._hudGold = this.hud.querySelector('#hud-gold');
        this._hudCargo = this.hud.querySelector('#hud-cargo');
        this._hudKills = this.hud.querySelector('#hud-kills');
        this._hudDist = this.hud.querySelector('#hud-dist');
        this._hudMedicineBtn = this.hud.querySelector('#hud-medicine-btn');
        this._hudMedicineText = this.hud.querySelector('#hud-medicine-text');

        // Medicine button click
        this._hudMedicineBtn.addEventListener('click', () => this._useMedicine());

        // Q key to use medicine
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyQ' && this.game.state === 'playing') {
                this._useMedicine();
            }
        });
    }

    _useMedicine() {
        const player = this.game.player;
        if (player.hp >= player.maxHp) return;
        const have = player.cargo['Medicine'] || 0;
        if (have <= 0) return;
        player.removeCargo('Medicine', 1);
        const healAmt = Math.round(player.maxHp * 0.4);
        player.heal(healAmt);
        this.game.audio.playUpgrade();
        this.game.particles.addText(player.x, player.y - 40, `+${healAmt} HP`, '#44ff44', 16);
        this.showToast(`Used Medicine: +${healAmt} HP`);
    }

    _createMinimap() {
        this.minimapContainer = document.createElement('div');
        this.minimapContainer.className = 'minimap-container';
        this.minimapCanvas = document.createElement('canvas');
        this.minimapCanvas.className = 'minimap-canvas';
        this.minimapCanvas.width = 130;
        this.minimapCanvas.height = 130;
        this.minimapContainer.appendChild(this.minimapCanvas);
        this.minimapContainer.style.display = 'none';
        this.uiLayer.appendChild(this.minimapContainer);
    }

    showHUD() {
        this.hud.style.display = 'flex';
        this.minimapContainer.style.display = 'block';
        this.settingsBtn.style.display = 'flex';
    }

    hideHUD() {
        this.hud.style.display = 'none';
        this.minimapContainer.style.display = 'none';
    }

    updateHUD(player) {
        const hpRatio = player.hp / player.maxHp;
        if (this._hudHpBar) {
            this._hudHpBar.style.width = (hpRatio * 100) + '%';
            this._hudHpBar.style.background = `linear-gradient(90deg, ${hpRatio > 0.5 ? '#44aa22' : hpRatio > 0.25 ? '#ccaa22' : '#cc2222'}, ${hpRatio > 0.5 ? '#66cc44' : hpRatio > 0.25 ? '#ddbb44' : '#dd4444'})`;
        }
        if (this._hudHpText) this._hudHpText.textContent = Math.ceil(player.hp);
        if (this._hudGold) this._hudGold.textContent = formatGold(player.gold);
        if (this._hudCargo) this._hudCargo.textContent = `${player.cargoCount}/${player.cargoCapacity}`;
        if (this._hudKills) this._hudKills.textContent = player.enemiesKilled;
        if (this._hudDist) this._hudDist.textContent = Math.round(player.distFromHome) + 'm';

        // Show medicine button if player has medicine and needs healing
        const hasMed = (player.cargo['Medicine'] || 0) > 0;
        const needsHeal = player.hp < player.maxHp;
        if (this._hudMedicineBtn) {
            this._hudMedicineBtn.style.display = (hasMed && needsHeal) ? 'flex' : 'none';
            if (hasMed && this._hudMedicineText) {
                this._hudMedicineText.textContent = `x${player.cargo['Medicine']} (Q)`;
            }
        }
    }

    updateMinimap(world, enemySpawner, player) {
        const ctx = this.minimapCanvas.getContext('2d');
        ctx.clearRect(0, 0, 130, 130);
        ctx.save();
        world.drawMinimap(ctx, player.x, player.y, 130);
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(65, 65, 65, 0, Math.PI * 2);
        ctx.clip();
        enemySpawner.drawOnMinimap(ctx, player.x, player.y, 130);
        ctx.restore();
    }

    // Title screen
    showTitleScreen(onNewGame, _unused, player) {
        this.closePanel();
        const panel = document.createElement('div');
        panel.className = 'title-screen';

        let permHTML = '';
        if (player.persistentGold > 0 || player.totalRuns > 0) {
            permHTML = `
                <div style="color:#c4a035;font-size:14px;margin-bottom:20px;text-align:center;">
                    Saved Gold: <span style="color:#ffd700;font-weight:bold;">${formatGold(player.persistentGold)}</span>
                    &nbsp;|&nbsp; Runs: ${player.totalRuns}
                    &nbsp;|&nbsp; Best: ${Math.round(player.bestDistance)}m
                </div>
            `;

            // Permanent upgrades
            permHTML += '<div style="margin-bottom:20px;max-width:360px;width:90vw;">';
            permHTML += '<h3 style="color:#ffd700;text-align:center;margin-bottom:10px;font-size:16px;">Permanent Upgrades</h3>';
            for (const [key, upg] of Object.entries(PERMANENT_UPGRADES)) {
                const level = player.permanentUpgrades[key] || 0;
                const cost = this.game.upgradeSystem.getPermanentUpgradeCost(key, player);
                const canBuy = player.persistentGold >= cost && level < upg.maxLevel;
                const maxed = level >= upg.maxLevel;
                permHTML += `
                    <div class="item-row" style="margin:4px 0;">
                        <span style="font-size:18px;margin-right:8px;">${upg.icon}</span>
                        <span class="item-name">${upg.name}<br><small style="color:#aaa;">${upg.desc}</small></span>
                        <span class="item-qty">Lv${level}/${upg.maxLevel}</span>
                        ${maxed
                            ? '<span style="color:#44aa22;font-size:12px;">MAX</span>'
                            : `<button class="btn btn-small ${canBuy ? 'btn-green' : ''}" data-perm-upgrade="${key}" ${canBuy ? '' : 'style="opacity:0.5;"'}>${formatGold(cost)}g</button>`
                        }
                    </div>
                `;
            }
            permHTML += '</div>';
        }

        panel.innerHTML = `
            <h1>CORSAIR'S FATE</h1>
            <div class="subtitle">A Pirate Roguelite</div>
            ${permHTML}
            <button class="btn" id="btn-new-game">Set Sail</button>
            <div class="version">v1.0 - Kenney Assets</div>
        `;

        this.uiLayer.appendChild(panel);
        this.activePanel = panel;
        this.settingsBtn.style.display = 'flex';

        panel.querySelector('#btn-new-game').addEventListener('click', () => {
            this.closePanel();
            onNewGame();
        });

        // Permanent upgrade buttons
        panel.querySelectorAll('[data-perm-upgrade]').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.permUpgrade;
                const result = this.game.upgradeSystem.buyPermanentUpgrade(key, player, this.game.audio);
                if (result.success) {
                    this.showToast(`${PERMANENT_UPGRADES[key].name} upgraded to Lv${result.newLevel}!`);
                    // Refresh
                    this.closePanel();
                    this.showTitleScreen(onNewGame, null, player);
                }
            });
        });
    }

    // Death screen
    showDeathScreen(stats, onRestart) {
        this.closePanel();
        this.hideHUD();
        const panel = document.createElement('div');
        panel.className = 'death-screen';
        panel.innerHTML = `
            <h1>SUNK!</h1>
            <div class="death-stats">
                Enemies defeated: <span class="gold">${stats.enemiesKilled}</span><br>
                Distance sailed: <span class="gold">${stats.distance}m</span><br>
                Ports visited: <span class="gold">${stats.portsVisited}</span><br>
                Gold saved: <span class="gold">${formatGold(stats.goldKept)}</span>
            </div>
            <button class="btn" id="btn-restart">Return to Port</button>
        `;
        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        panel.querySelector('#btn-restart').addEventListener('click', () => {
            this.closePanel();
            onRestart();
        });
    }

    // Trade panel
    showTradePanel(port, player, tradingSystem, audio) {
        this.closePanel();
        const panel = document.createElement('div');
        panel.className = 'game-panel trade-panel';

        const repairCost = tradingSystem.getRepairCost(player);
        const needsRepair = player.hp < player.maxHp;

        let goodsHTML = '';
        for (const [item, info] of Object.entries(TRADE_GOODS)) {
            const buyPrice = tradingSystem.getBuyPrice(item);
            const sellPrice = tradingSystem.getSellPrice(item);
            const have = player.cargo[item] || 0;
            goodsHTML += `
                <div class="item-row">
                    <span style="font-size:18px;margin-right:6px;">${info.icon}</span>
                    <span class="item-name">${item}</span>
                    <span class="item-qty">x${have}</span>
                    <button class="btn btn-small btn-green" data-buy="${item}">Buy ${buyPrice}g</button>
                    <button class="btn btn-small btn-red" data-sell="${item}" ${have > 0 ? '' : 'style="opacity:0.4;"'}>Sell ${sellPrice}g</button>
                </div>
            `;
        }

        panel.innerHTML = `
            <button class="close-btn" id="trade-close">\u2715</button>
            <h2>\u2693 ${port.name}</h2>
            <div style="text-align:center;color:#c4a035;font-size:13px;margin-bottom:10px;">
                ${port.type.toUpperCase()} PORT &nbsp;|&nbsp; Gold: <span style="color:#ffd700;">${formatGold(player.gold)}</span>
                &nbsp;|&nbsp; Cargo: ${player.cargoCount}/${player.cargoCapacity}
            </div>
            ${needsRepair ? `
                <div class="item-row" style="border:1px solid #44aa22;">
                    <span style="font-size:18px;margin-right:6px;">\uD83D\uDD27</span>
                    <span class="item-name">Repair Ship</span>
                    <span class="item-qty">${Math.ceil(player.hp)}/${player.maxHp} HP</span>
                    <button class="btn btn-small btn-green" id="btn-repair">${repairCost}g</button>
                </div>
            ` : '<div class="item-row" style="border:1px solid #44aa22;"><span>\u2705 Ship fully repaired</span></div>'}
            <h3>Trade Goods</h3>
            ${goodsHTML}
        `;

        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        // Close - return to port menu, not exit port
        panel.querySelector('#trade-close').addEventListener('click', () => {
            this.closePanel();
            this.game._enterPort(port, true);
        });

        // Repair
        const repairBtn = panel.querySelector('#btn-repair');
        if (repairBtn) {
            repairBtn.addEventListener('click', () => {
                if (tradingSystem.repair(player)) {
                    audio.playUpgrade();
                    this.showToast('Ship repaired!');
                    this.showTradePanel(port, player, tradingSystem, audio); // Refresh
                } else {
                    this.showToast('Not enough gold!');
                }
            });
        }

        // Buy buttons
        panel.querySelectorAll('[data-buy]').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = btn.dataset.buy;
                const result = tradingSystem.buyItem(item, 1, player);
                if (result.success) {
                    audio.playCoin();
                    this.showTradePanel(port, player, tradingSystem, audio); // Refresh
                } else {
                    this.showToast(result.reason);
                }
            });
        });

        // Sell buttons
        panel.querySelectorAll('[data-sell]').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = btn.dataset.sell;
                const result = tradingSystem.sellItem(item, 1, player);
                if (result.success) {
                    audio.playCoin();
                    this.showTradePanel(port, player, tradingSystem, audio); // Refresh
                } else {
                    this.showToast(result.reason);
                }
            });
        });
    }

    // Upgrade panel (at ports)
    showUpgradePanel(player, upgradeSystem, audio) {
        this.closePanel();
        const panel = document.createElement('div');
        panel.className = 'game-panel upgrade-panel';

        let upgradesHTML = '';
        for (const [key, upg] of Object.entries(RUN_UPGRADES)) {
            const level = player.upgrades[key] || 0;
            const cost = upgradeSystem.getRunUpgradeCost(key, player);
            const canBuy = player.gold >= cost && level < upg.maxLevel;
            const maxed = level >= upg.maxLevel;

            upgradesHTML += `
                <div class="item-row">
                    <span style="font-size:18px;margin-right:6px;">${upg.icon}</span>
                    <span class="item-name">${upg.name}<br><small style="color:#aaa;">${upg.desc}</small></span>
                    <span class="item-qty">Lv${level}/${upg.maxLevel}</span>
                    ${maxed
                        ? '<span style="color:#44aa22;font-size:12px;min-width:60px;text-align:center;">MAX</span>'
                        : `<button class="btn btn-small ${canBuy ? 'btn-green' : ''}" data-run-upgrade="${key}" ${canBuy ? '' : 'style="opacity:0.5;"'}>${formatGold(cost)}g</button>`
                    }
                </div>
            `;
        }

        panel.innerHTML = `
            <button class="close-btn" id="upgrade-close">\u2715</button>
            <h2>\u2699\uFE0F Ship Upgrades</h2>
            <div style="text-align:center;color:#c4a035;font-size:13px;margin-bottom:10px;">
                Gold: <span style="color:#ffd700;">${formatGold(player.gold)}</span>
            </div>
            ${upgradesHTML}
        `;

        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        panel.querySelector('#upgrade-close').addEventListener('click', () => {
            this.closePanel();
            const port = this.game.trading.currentPort;
            if (port) this.game._enterPort(port, true);
        });

        panel.querySelectorAll('[data-run-upgrade]').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.runUpgrade;
                const result = upgradeSystem.buyRunUpgrade(key, player, audio);
                if (result.success) {
                    this.showToast(`${RUN_UPGRADES[key].name} upgraded to Lv${result.newLevel}!`);
                    this.showUpgradePanel(player, upgradeSystem, audio); // Refresh
                } else {
                    this.showToast(result.reason);
                }
            });
        });
    }

    // Dock prompt - shown when near a port (player must tap to enter)
    showDockPrompt(port, onDock) {
        this.closeDockPrompt();
        const prompt = document.createElement('div');
        prompt.className = 'port-prompt';
        prompt.innerHTML = `
            <button class="btn btn-green" id="btn-dock">\u2693 Dock at ${port.name}</button>
        `;
        this.uiLayer.appendChild(prompt);
        this._dockPrompt = prompt;
        prompt.querySelector('#btn-dock').addEventListener('click', () => {
            this.closeDockPrompt();
            onDock();
        });

        // Also allow 'E' key to dock
        this._dockKeyHandler = (e) => {
            if (e.code === 'KeyE') {
                this.closeDockPrompt();
                onDock();
            }
        };
        window.addEventListener('keydown', this._dockKeyHandler);
    }

    closeDockPrompt() {
        if (this._dockPrompt) {
            if (this._dockPrompt.parentNode) this._dockPrompt.parentNode.removeChild(this._dockPrompt);
            this._dockPrompt = null;
        }
        if (this._dockKeyHandler) {
            window.removeEventListener('keydown', this._dockKeyHandler);
            this._dockKeyHandler = null;
        }
    }

    // Port interaction buttons
    showPortPrompt(port, onTrade, onUpgrade, onLeave) {
        this.closePanel();
        const player = this.game.player;
        const hasMedicine = (player.cargo['Medicine'] || 0) > 0;
        const needsHeal = player.hp < player.maxHp;
        const panel = document.createElement('div');
        panel.className = 'port-prompt';
        panel.innerHTML = `
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
                <button class="btn" id="port-trade">\uD83D\uDCB0 Trade</button>
                <button class="btn" id="port-upgrade">\u2699\uFE0F Upgrades</button>
                ${hasMedicine && needsHeal ? '<button class="btn btn-green" id="port-medicine">\uD83D\uDC8A Use Medicine</button>' : ''}
                <button class="btn btn-red" id="port-leave">\u26F5 Set Sail</button>
            </div>
        `;
        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        panel.querySelector('#port-trade').addEventListener('click', onTrade);
        panel.querySelector('#port-upgrade').addEventListener('click', onUpgrade);
        panel.querySelector('#port-leave').addEventListener('click', onLeave);

        const medBtn = panel.querySelector('#port-medicine');
        if (medBtn) {
            medBtn.addEventListener('click', () => {
                const used = player.removeCargo('Medicine', 1);
                if (used > 0) {
                    const healAmt = Math.round(player.maxHp * 0.4);
                    player.heal(healAmt);
                    this.game.audio.playUpgrade();
                    this.game.particles.addText(player.x, player.y - 40, `+${healAmt} HP`, '#44ff44', 16);
                    this.showToast(`Used Medicine: +${healAmt} HP`);
                    // Refresh port prompt
                    this.showPortPrompt(port, onTrade, onUpgrade, onLeave);
                }
            });
        }
    }

    // Story dialogue
    showDialogue(speaker, text, chapterTitle, onAdvance) {
        this.closePanel();
        const panel = document.createElement('div');
        panel.className = 'game-panel story-dialog';

        panel.innerHTML = `
            ${chapterTitle ? `<div style="text-align:center;color:#ffd700;font-size:18px;margin-bottom:12px;letter-spacing:2px;">${chapterTitle}</div>` : ''}
            <div class="speaker">${speaker}</div>
            <div class="text">${text}</div>
            <div class="continue-hint">Tap or press Space to continue...</div>
        `;

        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        const advance = (e) => {
            if (e.type === 'keydown' && e.code !== 'Space' && e.code !== 'Enter') return;
            e.preventDefault();
            panel.removeEventListener('click', advance);
            window.removeEventListener('keydown', advance);
            onAdvance();
        };

        panel.addEventListener('click', advance);
        window.addEventListener('keydown', advance);
    }

    // Settings panel
    showSettings() {
        this.closePanel();
        this.game.pause();
        const audio = this.game.audio;

        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';

        const panel = document.createElement('div');
        panel.className = 'game-panel settings-panel';
        panel.innerHTML = `
            <button class="close-btn" id="settings-close">\u2715</button>
            <h2>\u2699\uFE0F Settings</h2>
            <div class="toggle-row">
                <label>Sound Effects</label>
                <div class="toggle-switch ${audio.sfxEnabled ? 'active' : ''}" id="toggle-sfx"></div>
            </div>
            <div class="volume-row" id="sfx-volume-row">
                <label>SFX Vol</label>
                <input type="range" class="volume-slider" id="sfx-volume" min="0" max="100" value="${Math.round(audio.sfxVolume * 100)}">
            </div>
            <div class="toggle-row">
                <label>Music</label>
                <div class="toggle-switch ${audio.musicEnabled ? 'active' : ''}" id="toggle-music"></div>
            </div>
            <div class="volume-row" id="music-volume-row">
                <label>Music Vol</label>
                <input type="range" class="volume-slider" id="music-volume" min="0" max="100" value="${Math.round(audio.musicVolume * 100)}">
            </div>
            ${audio.musicTracks.length === 0 ? '<div style="font-size:12px;color:#886644;text-align:center;margin-top:4px;">No music files found in assets/music/</div>' : ''}
            <div style="margin-top:20px;text-align:center;">
                <button class="btn btn-red btn-small" id="btn-reset-save" style="font-size:12px;">Reset All Progress</button>
            </div>
        `;

        this.uiLayer.appendChild(overlay);
        this.uiLayer.appendChild(panel);
        this.activePanel = panel;
        this._settingsOverlay = overlay;

        // Close
        const closeSettings = () => {
            this.closePanel();
            this.game.resume();
        };
        panel.querySelector('#settings-close').addEventListener('click', closeSettings);
        overlay.addEventListener('click', closeSettings);

        // SFX toggle
        panel.querySelector('#toggle-sfx').addEventListener('click', function() {
            audio.setSfxEnabled(!audio.sfxEnabled);
            this.classList.toggle('active', audio.sfxEnabled);
        });

        // Music toggle
        panel.querySelector('#toggle-music').addEventListener('click', function() {
            audio.setMusicEnabled(!audio.musicEnabled);
            this.classList.toggle('active', audio.musicEnabled);
        });

        // Volume sliders
        panel.querySelector('#sfx-volume').addEventListener('input', (e) => {
            audio.setSfxVolume(e.target.value / 100);
        });
        panel.querySelector('#music-volume').addEventListener('input', (e) => {
            audio.setMusicVolume(e.target.value / 100);
        });

        // Reset progress
        panel.querySelector('#btn-reset-save').addEventListener('click', () => {
            try { localStorage.removeItem('pirate2d_save'); } catch(e) {}
            this.showToast('Progress reset! Refresh to apply.');
        });
    }

    // Toast notification
    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        this.uiLayer.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3000);
    }

    closePanel() {
        if (this.activePanel) {
            if (this.activePanel.parentNode) this.activePanel.parentNode.removeChild(this.activePanel);
            this.activePanel = null;
        }
        if (this._settingsOverlay) {
            if (this._settingsOverlay.parentNode) this._settingsOverlay.parentNode.removeChild(this._settingsOverlay);
            this._settingsOverlay = null;
        }
    }

    get hasPanel() {
        return this.activePanel !== null;
    }
}
