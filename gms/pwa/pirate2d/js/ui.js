// UI System - HUD, menus, settings, trade/upgrade panels

import { TRADE_GOODS } from './trading.js';
import { RUN_UPGRADES, PERMANENT_UPGRADES, EXTRA_CANNON_COSTS } from './upgrades.js';
import { formatGold } from './utils.js';
import { NAME_PREFIXES } from './player.js';
import { RUN_NAMES } from './story.js';

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
            <div class="hud-item" id="hud-buried-item" style="display:none;"><span class="icon">\uD83D\uDDC3\uFE0F</span><span id="hud-buried">0</span></div>
            <div class="hud-item" id="hud-bury-btn" style="cursor:pointer;display:none;pointer-events:auto;"><span class="icon">\u2693</span><span id="hud-bury-text">Bury</span></div>
            <div class="hud-item"><span class="icon">\uD83D\uDCE6</span><span id="hud-cargo">0/20</span></div>
            <div class="hud-item"><span class="icon">\uD83D\uDDE1\uFE0F</span><span id="hud-kills">0</span></div>
            <div class="hud-item"><span class="icon">\uD83C\uDF0A</span><span id="hud-dist">0m</span></div>
            <div class="hud-item" id="hud-repair-indicator" style="display:none;"><span class="icon">\uD83D\uDD27</span><span id="hud-repair-text">1.0/s</span></div>
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
        this._hudRepairIndicator = this.hud.querySelector('#hud-repair-indicator');
        this._hudRepairText = this.hud.querySelector('#hud-repair-text');
        this._hudBuriedItem = this.hud.querySelector('#hud-buried-item');
        this._hudBuried = this.hud.querySelector('#hud-buried');
        this._hudBuryBtn = this.hud.querySelector('#hud-bury-btn');
        this._hudBuryText = this.hud.querySelector('#hud-bury-text');
        this._buryFirstTime = true; // Track if first time burying

        // Medicine button click
        this._hudMedicineBtn.addEventListener('click', () => this._useMedicine());

        // Bury treasure button click
        this._hudBuryBtn.addEventListener('click', () => this._buryTreasure());

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

    _buryTreasure() {
        const player = this.game.player;
        if (player.gold < 10) {
            this.showToast('Not enough gold to bury!');
            return;
        }

        // First time: show explanatory message
        if (this._buryFirstTime && player.buriedGold === 0) {
            this._buryFirstTime = false;
            this._showBuryConfirm(player);
            return;
        }

        this._doBury(player);
    }

    _showBuryConfirm(player) {
        this.closePanel();
        this.game.pause();
        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        this.uiLayer.appendChild(overlay);
        this._settingsOverlay = overlay;

        const panel = document.createElement('div');
        panel.className = 'game-panel';
        panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(380px,90vw);z-index:300;text-align:center;';
        panel.innerHTML = `
            <div style="font-size:40px;margin-bottom:12px;">\uD83D\uDDC3\uFE0F</div>
            <h2 style="margin-bottom:12px;">Bury Treasure</h2>
            <p style="font-size:14px;line-height:1.6;color:#f0d9a0;margin-bottom:16px;">
                Send some pirates off to bury 50% of yer loot. Ye'll lose around 20% of it
                \u2014 pirates aren't the most honest lot, and they do like their rum \u2014
                but it can be recovered later if ye lose yer ship.
            </p>
            <p style="font-size:13px;color:#c4a035;margin-bottom:16px;">
                Burying: <span style="color:#ffd700;font-weight:bold;">${formatGold(Math.floor(player.gold * 0.5))}</span> gold
            </p>
            <div style="display:flex;gap:10px;justify-content:center;">
                <button class="btn btn-green" id="btn-bury-confirm">Bury It!</button>
                <button class="btn btn-red" id="btn-bury-cancel">Cancel</button>
            </div>
        `;

        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        panel.querySelector('#btn-bury-confirm').addEventListener('click', () => {
            this.closePanel();
            this.game.resume();
            this._doBury(player);
        });

        panel.querySelector('#btn-bury-cancel').addEventListener('click', () => {
            this.closePanel();
            this.game.resume();
        });

        overlay.addEventListener('click', () => {
            this.closePanel();
            this.game.resume();
        });
    }

    _doBury(player) {
        const result = player.buryTreasure();
        if (result.success) {
            this.game.audio.playCoin();
            this.game.particles.addText(player.x, player.y - 40, `Buried ${formatGold(result.buried)}g`, '#ffd700', 16);
            this.showToast(`Sent ${formatGold(result.sent)}g \u2022 Pirates took ${formatGold(result.piratesCut)}g \u2022 Buried ${formatGold(result.buried)}g`);
            this.updateHUD(player);
        } else {
            this.showToast(result.reason);
        }
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

        // Show buried gold chest icon
        if (this._hudBuriedItem) {
            if (player.buriedGold > 0) {
                this._hudBuriedItem.style.display = 'flex';
                this._hudBuried.textContent = formatGold(player.buriedGold);
            } else {
                this._hudBuriedItem.style.display = 'none';
            }
        }

        // Show bury treasure button when player has enough gold
        if (this._hudBuryBtn) {
            this._hudBuryBtn.style.display = player.gold >= 10 ? 'flex' : 'none';
        }

        // Show medicine button if player has medicine and needs healing
        const hasMed = (player.cargo['Medicine'] || 0) > 0;
        const needsHeal = player.hp < player.maxHp;
        if (this._hudMedicineBtn) {
            this._hudMedicineBtn.style.display = (hasMed && needsHeal) ? 'flex' : 'none';
            if (hasMed && this._hudMedicineText) {
                this._hudMedicineText.textContent = `x${player.cargo['Medicine']} (Q)`;
            }
        }

        // Show repair indicator
        if (this._hudRepairIndicator) {
            if (player.hasRepairSkill && player.repairRate > 0) {
                this._hudRepairIndicator.style.display = 'flex';
                this._hudRepairText.textContent = `${player.repairRate.toFixed(1)}/s`;
            } else {
                this._hudRepairIndicator.style.display = 'none';
            }
        }
    }

    updateMinimap(world, enemySpawner, player, kraken) {
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
        if (kraken && kraken.alive) {
            kraken.drawOnMinimap(ctx, player.x, player.y, 130);
        }
        ctx.restore();
    }

    // Title screen
    showTitleScreen(onNewGame, _unused, player) {
        this.closePanel();
        const panel = document.createElement('div');
        panel.className = 'title-screen';

        const hasPlayed = player.totalRuns > 0 || player.persistentGold > 0;

        let permHTML = '';
        if (hasPlayed) {
            permHTML = `
                <div style="color:#c4a035;font-size:14px;margin-bottom:20px;text-align:center;">
                    ${player.fullName ? `<div style="color:#ffd700;font-size:16px;margin-bottom:6px;">${player.fullName}</div>` : ''}
                    Saved Gold: <span style="color:#ffd700;font-weight:bold;">${formatGold(player.persistentGold)}</span>
                    &nbsp;|&nbsp; Runs: ${player.totalRuns}
                    &nbsp;|&nbsp; Best: ${Math.round(player.bestDistance)}m
                </div>
            `;
        }

        // Check for saved game state
        let hasSavedGame = false;
        try { hasSavedGame = !!localStorage.getItem('pirate2d_state'); } catch(e) {}

        // Build run selection buttons
        let runSelectHTML = '';
        if (hasPlayed) {
            runSelectHTML = '<div style="margin-bottom:16px;text-align:center;">';
            runSelectHTML += '<div style="color:#c4a035;font-size:13px;margin-bottom:8px;">Choose Your Voyage:</div>';
            runSelectHTML += '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;">';
            for (let i = 0; i < 3; i++) {
                const runNum = i + 1;
                const completed = player.completedRuns.includes(runNum);
                const unlocked = runNum === 1 || player.completedRuns.includes(runNum - 1);
                const isCurrent = runNum === player.currentRun;
                const checkmark = completed ? ' \u2713' : '';
                const btnClass = isCurrent ? 'btn btn-green' : (unlocked ? 'btn' : 'btn');
                const disabled = !unlocked ? 'style="opacity:0.4;pointer-events:none;"' : '';
                runSelectHTML += `<button class="${btnClass} btn-small" data-run="${runNum}" ${disabled} style="font-size:11px;padding:6px 10px;min-width:auto;${!unlocked ? 'opacity:0.4;pointer-events:none;' : ''}">${runNum}. ${RUN_NAMES[i]}${checkmark}</button>`;
            }
            runSelectHTML += '</div></div>';
        }

        // Extra cannon upgrade (available after completing stories)
        let extraCannonHTML = '';
        const canBuyCannon = this.game.upgradeSystem.canBuyExtraCannon(player);
        if (canBuyCannon) {
            const cost = this.game.upgradeSystem.getExtraCannonCost(player);
            const canAfford = player.persistentGold >= cost;
            extraCannonHTML = `
                <div style="margin:12px auto;padding:12px 16px;max-width:320px;background:linear-gradient(180deg,rgba(80,50,20,0.9) 0%,rgba(50,30,10,0.9) 100%);border:2px solid rgba(255,215,0,0.4);border-radius:8px;text-align:center;">
                    <div style="font-size:16px;color:#ffd700;margin-bottom:6px;">💣 Extra Cannon Available!</div>
                    <div style="font-size:13px;color:#c4a035;margin-bottom:8px;">+1 cannon (${player.cannonCount} → ${player.cannonCount + 1})</div>
                    <button class="btn ${canAfford ? 'btn-green' : ''}" id="btn-extra-cannon" ${canAfford ? '' : 'style="opacity:0.5;"'}>${formatGold(cost)} saved gold</button>
                </div>
            `;
        }

        panel.innerHTML = `
            <h1>CORSAIR'S FATE</h1>
            <div class="subtitle">A Pirate Roguelite</div>
            ${permHTML}
            ${extraCannonHTML}
            ${hasSavedGame ? '<button class="btn btn-green" id="btn-continue" style="margin:8px;min-width:200px;font-size:18px;padding:14px 30px;">\u26F5 Continue Voyage</button>' : ''}
            ${runSelectHTML}
            <button class="btn" id="btn-new-game">${hasPlayed ? '\u2693 New Voyage' : 'Set Sail'}</button>
            ${hasPlayed ? '<button class="btn" id="btn-perm-upgrades" style="margin:8px;min-width:200px;font-size:16px;padding:10px 24px;">\u2693 Upgrades</button>' : ''}
            <div class="version">v1.0 Corsair</div>
        `;

        this.uiLayer.appendChild(panel);
        this.activePanel = panel;
        this.settingsBtn.style.display = 'flex';

        panel.querySelector('#btn-new-game').addEventListener('click', () => {
            // Clear any saved game state when starting fresh
            try { localStorage.removeItem('pirate2d_state'); } catch(e) {}
            this.closePanel();
            onNewGame(player.currentRun || 1);
        });

        // Run selection buttons
        panel.querySelectorAll('[data-run]').forEach(btn => {
            btn.addEventListener('click', () => {
                const runNum = parseInt(btn.dataset.run);
                try { localStorage.removeItem('pirate2d_state'); } catch(e) {}
                this.closePanel();
                onNewGame(runNum);
            });
        });

        // Continue button
        const continueBtn = panel.querySelector('#btn-continue');
        if (continueBtn) {
            continueBtn.addEventListener('click', () => {
                this.closePanel();
                this.game._continueGame();
            });
        }

        // Permanent upgrades button (only shown if player has played before)
        const permUpgradesBtn = panel.querySelector('#btn-perm-upgrades');
        if (permUpgradesBtn) {
            permUpgradesBtn.addEventListener('click', () => {
                this.showPermanentUpgradesPopup(player, () => {
                    this.showTitleScreen(onNewGame, null, player);
                });
            });
        }

        // Extra cannon button (title screen)
        const extraCannonBtn = panel.querySelector('#btn-extra-cannon');
        if (extraCannonBtn) {
            extraCannonBtn.addEventListener('click', () => {
                const result = this.game.upgradeSystem.buyExtraCannon(player, this.game.audio);
                if (result.success) {
                    this.showToast(`Extra cannon installed! Total: ${result.totalCannons} cannons`);
                    this.showTitleScreen(onNewGame, null, player);
                } else {
                    this.showToast(result.reason);
                }
            });
        }
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
                Gold rescued from ship: <span class="gold">${formatGold(stats.goldKept)}</span><br>
                ${stats.buriedGold > 0 ? `Buried treasure recovered: <span class="gold">${formatGold(stats.buriedGold)}</span><br>` : ''}
                Total gold saved: <span class="gold">${formatGold(stats.totalSaved)}</span>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;">
                <button class="btn" id="btn-death-upgrades">\u2693 Upgrades (${formatGold(this.game.player.persistentGold)}g)</button>
                <button class="btn btn-green" id="btn-restart">Return to Port</button>
            </div>
        `;
        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        panel.querySelector('#btn-death-upgrades').addEventListener('click', () => {
            this.showPermanentUpgradesPopup(this.game.player, () => {
                this.showDeathScreen(stats, onRestart);
            });
        });

        panel.querySelector('#btn-restart').addEventListener('click', () => {
            this.closePanel();
            onRestart();
        });
    }

    // Permanent upgrades popup (used on title + death screens)
    showPermanentUpgradesPopup(player, returnCallback, scrollTop) {
        this.closePanel();

        // Create overlay
        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        this.uiLayer.appendChild(overlay);
        this._settingsOverlay = overlay;

        const panel = document.createElement('div');
        panel.className = 'game-panel upgrade-panel';

        let upgradesHTML = '';
        for (const [key, upg] of Object.entries(PERMANENT_UPGRADES)) {
            // Hide repair-dependent upgrades if repair not unlocked
            if (upg.requiresRepair && !player.hasRepairSkill) continue;
            // Hide repairUnlock if already purchased
            if (key === 'repairUnlock' && player.hasRepairSkill) continue;

            const level = player.permanentUpgrades[key] || 0;
            const cost = this.game.upgradeSystem.getPermanentUpgradeCost(key, player);
            const canBuy = player.persistentGold >= cost && level < upg.maxLevel;
            const maxed = level >= upg.maxLevel;

            upgradesHTML += `
                <div class="item-row">
                    <span style="font-size:18px;margin-right:6px;">${upg.icon}</span>
                    <span class="item-name">${upg.name}<br><small style="color:#aaa;">${upg.desc}</small></span>
                    <span class="item-qty">${maxed ? '' : `Lv${level}/${upg.maxLevel}`}</span>
                    <div class="item-actions">
                        ${maxed
                            ? '<span style="color:#44aa22;font-size:12px;min-width:60px;text-align:center;">MAX</span>'
                            : `<button class="btn btn-small ${canBuy ? 'btn-green' : ''}" data-perm-upgrade="${key}" ${canBuy ? '' : 'style="opacity:0.5;"'}>${formatGold(cost)}g</button>`
                        }
                    </div>
                </div>
            `;
        }

        panel.innerHTML = `
            <div class="panel-header">
                <button class="close-btn" id="perm-upgrade-close">\u2715</button>
                <h2>\u2693 Permanent Upgrades</h2>
                <div style="text-align:center;color:#c4a035;font-size:13px;margin-bottom:10px;">
                    Saved Gold: <span style="color:#ffd700;">${formatGold(player.persistentGold)}</span>
                </div>
            </div>
            <div class="panel-items" id="perm-upgrade-items">
                ${upgradesHTML}
            </div>
        `;

        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        // Restore scroll position
        const itemsContainer = panel.querySelector('#perm-upgrade-items');
        if (scrollTop > 0) itemsContainer.scrollTop = scrollTop;

        const close = () => {
            this.closePanel();
            if (returnCallback) returnCallback();
        };

        panel.querySelector('#perm-upgrade-close').addEventListener('click', close);
        overlay.addEventListener('click', close);

        panel.querySelectorAll('[data-perm-upgrade]').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.permUpgrade;
                const result = this.game.upgradeSystem.buyPermanentUpgrade(key, player, this.game.audio);
                if (result.success) {
                    this.showToast(`${PERMANENT_UPGRADES[key].name} upgraded!`);
                    const st = itemsContainer.scrollTop;
                    this.showPermanentUpgradesPopup(player, returnCallback, st);
                }
            });
        });
    }

    // Trade panel
    showTradePanel(port, player, tradingSystem, audio, scrollTop) {
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
                    <div class="item-actions">
                        <button class="btn btn-small btn-green" data-buy="${item}">Buy ${buyPrice}g</button>
                        <button class="btn btn-small btn-red" data-sell="${item}" ${have > 0 ? '' : 'style="opacity:0.4;"'}>Sell ${sellPrice}g</button>
                    </div>
                </div>
            `;
        }

        const portType = (port.type || 'trading').toUpperCase();

        panel.innerHTML = `
            <div class="panel-header">
                <button class="close-btn" id="trade-close">\u2715</button>
                <h2>\u2693 ${port.name}</h2>
                <div style="text-align:center;color:#c4a035;font-size:13px;margin-bottom:10px;">
                    ${portType} PORT &nbsp;|&nbsp; Gold: <span style="color:#ffd700;" id="trade-gold">${formatGold(player.gold)}</span>
                    &nbsp;|&nbsp; Cargo: <span id="trade-cargo">${player.cargoCount}/${player.cargoCapacity}</span>
                </div>
                ${needsRepair ? `
                    <div class="item-row" style="border:1px solid #44aa22;">
                        <span style="font-size:18px;margin-right:6px;">\uD83D\uDD27</span>
                        <span class="item-name">Repair Ship</span>
                        <span class="item-qty">${Math.ceil(player.hp)}/${player.maxHp} HP</span>
                        <div class="item-actions"><button class="btn btn-small btn-green" id="btn-repair">${repairCost}g</button></div>
                    </div>
                ` : '<div class="item-row" style="border:1px solid #44aa22;"><span>\u2705 Ship fully repaired</span></div>'}
                <h3>Trade Goods</h3>
            </div>
            <div class="panel-items" id="trade-items">
                ${goodsHTML}
            </div>
        `;

        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        // Restore scroll position
        const itemsContainer = panel.querySelector('#trade-items');
        if (scrollTop > 0) itemsContainer.scrollTop = scrollTop;

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
                    this.updateHUD(player);
                    const st = itemsContainer.scrollTop;
                    this.showTradePanel(port, player, tradingSystem, audio, st);
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
                    this.updateHUD(player);
                    const st = itemsContainer.scrollTop;
                    this.showTradePanel(port, player, tradingSystem, audio, st);
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
                    this.updateHUD(player);
                    const st = itemsContainer.scrollTop;
                    this.showTradePanel(port, player, tradingSystem, audio, st);
                } else {
                    this.showToast(result.reason);
                }
            });
        });
    }

    // Upgrade panel (at ports)
    showUpgradePanel(player, upgradeSystem, audio, scrollTop) {
        this.closePanel();
        const panel = document.createElement('div');
        panel.className = 'game-panel upgrade-panel';

        let upgradesHTML = '';
        for (const [key, upg] of Object.entries(RUN_UPGRADES)) {
            // Hide repair-dependent upgrades if repair not unlocked
            if (upg.requiresRepair && !player.hasRepairSkill) continue;

            const level = player.upgrades[key] || 0;
            const cost = upgradeSystem.getRunUpgradeCost(key, player);
            const canBuy = player.gold >= cost && level < upg.maxLevel;
            const maxed = level >= upg.maxLevel;

            upgradesHTML += `
                <div class="item-row">
                    <span style="font-size:18px;margin-right:6px;">${upg.icon}</span>
                    <span class="item-name">${upg.name}<br><small style="color:#aaa;">${upg.desc}</small></span>
                    <span class="item-qty">Lv${level}/${upg.maxLevel}</span>
                    <div class="item-actions">
                        ${maxed
                            ? '<span style="color:#44aa22;font-size:12px;min-width:60px;text-align:center;">MAX</span>'
                            : `<button class="btn btn-small ${canBuy ? 'btn-green' : ''}" data-run-upgrade="${key}" ${canBuy ? '' : 'style="opacity:0.5;"'}>${formatGold(cost)}g</button>`
                        }
                    </div>
                </div>
            `;
        }

        const extraCannonHTML = '';

        panel.innerHTML = `
            <div class="panel-header">
                <button class="close-btn" id="upgrade-close">\u2715</button>
                <h2>\u2699\uFE0F Ship Upgrades</h2>
                <div style="text-align:center;color:#c4a035;font-size:13px;margin-bottom:10px;">
                    Gold: <span style="color:#ffd700;" id="upgrade-gold">${formatGold(player.gold)}</span>
                </div>
            </div>
            <div class="panel-items" id="upgrade-items">
                ${upgradesHTML}
                ${extraCannonHTML}
            </div>
        `;

        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        // Restore scroll position
        const itemsContainer = panel.querySelector('#upgrade-items');
        if (scrollTop > 0) itemsContainer.scrollTop = scrollTop;

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
                    this.updateHUD(player);
                    const st = itemsContainer.scrollTop;
                    this.showUpgradePanel(player, upgradeSystem, audio, st);
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
                    this.updateHUD(player);
                    // Refresh port prompt
                    this.showPortPrompt(port, onTrade, onUpgrade, onLeave);
                }
            });
        }
    }

    // Story dialogue
    showDialogue(speaker, text, chapterTitle, onAdvance, minDisplayTime = 0) {
        this.closePanel();
        const panel = document.createElement('div');
        panel.className = 'game-panel story-dialog';

        // Check if there are more dialogues after this one
        const story = this.game.story;
        const hasMore = story.isShowingDialogue && story.currentDialogue &&
            story.dialogueIndex < story.currentDialogue.dialogues.length - 1;

        panel.innerHTML = `
            ${chapterTitle ? `<div style="text-align:center;color:#ffd700;font-size:18px;margin-bottom:12px;letter-spacing:2px;">${chapterTitle}</div>` : ''}
            <div class="speaker">${speaker}</div>
            <div class="text">${text}</div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
                ${hasMore ? '<button class="btn btn-small skip-story-btn" id="btn-skip-story" style="font-size:11px;padding:4px 12px;min-height:30px;opacity:0.7;">Skip</button>' : '<span></span>'}
                <div class="continue-hint" id="dialogue-hint" style="margin-top:0;${minDisplayTime > 0 ? 'display:none;' : ''}">Tap or press Space to continue...</div>
            </div>
        `;

        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        let canAdvance = minDisplayTime <= 0;

        const cleanup = () => {
            panel.removeEventListener('click', advance);
            window.removeEventListener('keydown', advance);
        };

        const advance = (e) => {
            if (!canAdvance) return;
            if (e.type === 'keydown' && e.code !== 'Space' && e.code !== 'Enter') return;
            e.preventDefault();
            cleanup();
            onAdvance();
        };

        panel.addEventListener('click', advance);
        window.addEventListener('keydown', advance);

        // Delay before allowing advance (for boss dialogues)
        if (minDisplayTime > 0) {
            setTimeout(() => {
                canAdvance = true;
                const hint = panel.querySelector('#dialogue-hint');
                if (hint) hint.style.display = '';
            }, minDisplayTime);
        }

        // Skip button - skip all remaining dialogues in this chapter
        const skipBtn = panel.querySelector('#btn-skip-story');
        if (skipBtn) {
            skipBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                cleanup();
                // Skip to end of chapter
                while (story.isShowingDialogue) {
                    story.advance();
                }
                this.closePanel();
                this.game.state = 'playing';
            });
        }
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
        const game = this.game;
        const zoomLabels = ['Close (100%)', 'Default (90%)', 'Medium (75%)', 'Far (60%)'];

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
            <h3 style="margin-top:14px;">Zoom</h3>
            <div class="toggle-row">
                <label>Zoom Level</label>
                <div style="display:flex;gap:4px;" id="zoom-buttons">
                    ${game.zoomLevels.map((_, i) => `<button class="btn btn-small ${i === game.zoomIndex ? 'btn-green' : ''}" data-zoom="${i}" style="padding:4px 8px;font-size:11px;min-width:auto;min-height:36px;">${zoomLabels[i]}</button>`).join('')}
                </div>
            </div>
            <div class="toggle-row">
                <label>Pinch Zoom</label>
                <div class="toggle-switch ${game.pinchZoomEnabled ? 'active' : ''}" id="toggle-pinch"></div>
            </div>
            <div style="margin-top:20px;text-align:center;">
                <button class="btn btn-small" id="btn-credits" style="font-size:12px;">Credits</button>
            </div>
            <div style="margin-top:10px;text-align:center;">
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

        // Zoom level buttons
        panel.querySelectorAll('[data-zoom]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.zoom);
                game.setZoomLevel(idx);
                // Refresh settings to update button highlights
                this.showSettings();
            });
        });

        // Pinch zoom toggle
        panel.querySelector('#toggle-pinch').addEventListener('click', function() {
            game.pinchZoomEnabled = !game.pinchZoomEnabled;
            this.classList.toggle('active', game.pinchZoomEnabled);
            game._saveZoomSettings();
        });

        // Credits
        panel.querySelector('#btn-credits').addEventListener('click', () => {
            this._showCreditsPopup();
        });

        // Reset progress
        panel.querySelector('#btn-reset-save').addEventListener('click', () => {
            try { localStorage.removeItem('pirate2d_save'); } catch(e) {}
            try { localStorage.removeItem('pirate2d_state'); } catch(e) {}
            this.showToast('Progress reset! Refresh to apply.');
        });
    }

    _showCreditsPopup() {
        // Remove any existing credits popup
        const existing = this.uiLayer.querySelector('.credits-overlay');
        if (existing) existing.remove();
        const existingPanel = this.uiLayer.querySelector('.credits-panel');
        if (existingPanel) existingPanel.remove();

        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay credits-overlay';

        const panel = document.createElement('div');
        panel.className = 'game-panel credits-panel';
        panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:10001;padding:20px;min-width:260px;max-width:320px;text-align:center;';
        panel.innerHTML = `
            <h2 style="margin:0 0 16px 0;font-size:20px;color:#f0c040;">Credits</h2>
            <div style="font-size:14px;color:#d4b896;line-height:2;">
                <div><strong>Aaron Burke</strong></div>
                <div>Kenney Assets</div>
                <div>Claude 4.6</div>
                <div>Suno (Music)</div>
            </div>
            <button class="btn btn-small" id="btn-credits-close" style="margin-top:16px;font-size:12px;">Close</button>
        `;

        this.uiLayer.appendChild(overlay);
        this.uiLayer.appendChild(panel);

        const closeCredits = () => {
            overlay.remove();
            panel.remove();
        };
        panel.querySelector('#btn-credits-close').addEventListener('click', closeCredits);
        overlay.addEventListener('click', closeCredits);
    }

    // Name input popup
    showNameInput(onComplete) {
        this.closePanel();
        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        this.uiLayer.appendChild(overlay);
        this._settingsOverlay = overlay;

        const panel = document.createElement('div');
        panel.className = 'game-panel';
        panel.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:min(400px,92vw);z-index:300;text-align:center;';

        let prefixOptions = NAME_PREFIXES.map((p, i) =>
            `<option value="${p}" ${i === 0 ? 'selected' : ''}>${p}</option>`
        ).join('');

        panel.innerHTML = `
            <h2 style="margin-bottom:16px;">Name Yer Captain</h2>
            <div style="margin-bottom:12px;">
                <select id="name-prefix" style="padding:8px;font-size:15px;background:#3d2510;color:#f0d9a0;border:2px solid #8b6914;border-radius:6px;font-family:'Pirata One',Georgia,serif;width:100%;margin-bottom:8px;">
                    ${prefixOptions}
                </select>
                <input type="text" id="name-input" placeholder="Enter yer name..." maxlength="20"
                    style="padding:10px;font-size:16px;background:#3d2510;color:#f0d9a0;border:2px solid #8b6914;border-radius:6px;width:100%;font-family:'Pirata One',Georgia,serif;text-align:center;">
            </div>
            <div id="name-preview" style="color:#ffd700;font-size:18px;margin-bottom:16px;min-height:24px;"></div>
            <button class="btn btn-green" id="btn-name-confirm" style="opacity:0.5;pointer-events:none;">Confirm</button>
        `;

        this.uiLayer.appendChild(panel);
        this.activePanel = panel;

        const input = panel.querySelector('#name-input');
        const prefix = panel.querySelector('#name-prefix');
        const preview = panel.querySelector('#name-preview');
        const confirm = panel.querySelector('#btn-name-confirm');

        const updatePreview = () => {
            const name = input.value.trim();
            if (name.length > 0) {
                preview.textContent = `${prefix.value} ${name}`;
                confirm.style.opacity = '1';
                confirm.style.pointerEvents = 'auto';
            } else {
                preview.textContent = '';
                confirm.style.opacity = '0.5';
                confirm.style.pointerEvents = 'none';
            }
        };

        input.addEventListener('input', updatePreview);
        prefix.addEventListener('change', updatePreview);

        confirm.addEventListener('click', () => {
            const name = input.value.trim();
            if (name.length > 0) {
                this.closePanel();
                onComplete(prefix.value, name);
            }
        });

        // Focus the input
        setTimeout(() => input.focus(), 100);
    }

    // Boss victory announcement
    showBossVictory(runName, bossName) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
            z-index:350;text-align:center;pointer-events:none;
            animation: toastIn 0.5s ease-out;
        `;
        toast.innerHTML = `
            <div style="font-size:clamp(24px,6vw,42px);color:#ffd700;font-family:'Pirata One',Georgia,serif;text-shadow:3px 3px 8px rgba(0,0,0,0.9);margin-bottom:12px;">VICTORY!</div>
            <div style="font-size:clamp(14px,3vw,20px);color:#44ff44;font-family:'Pirata One',Georgia,serif;text-shadow:2px 2px 4px rgba(0,0,0,0.8);">${bossName} defeated!</div>
            <div style="font-size:clamp(12px,2.5vw,16px);color:#c4a035;font-family:'Pirata One',Georgia,serif;margin-top:8px;">${runName} complete</div>
        `;
        this.uiLayer.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 5000);
    }

    // Finish run button (bottom left)
    showFinishRunButton(onFinish) {
        this.hideFinishRunButton();
        const btn = document.createElement('button');
        btn.className = 'btn btn-green';
        btn.id = 'finish-run-btn';
        btn.textContent = '\u2693 Finish Voyage';
        btn.style.cssText = `
            position:fixed;bottom:max(20px,env(safe-area-inset-bottom,0px));
            left:max(10px,env(safe-area-inset-left,0px));
            z-index:60;pointer-events:auto;font-size:14px;padding:10px 16px;
        `;
        btn.addEventListener('click', () => onFinish());
        this.uiLayer.appendChild(btn);
        this._finishRunBtn = btn;
    }

    hideFinishRunButton() {
        if (this._finishRunBtn) {
            if (this._finishRunBtn.parentNode) this._finishRunBtn.parentNode.removeChild(this._finishRunBtn);
            this._finishRunBtn = null;
        }
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
