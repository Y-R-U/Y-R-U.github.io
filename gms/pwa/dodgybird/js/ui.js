// ── UI System ── Menus, HUD, popups, settings, shop, tutorial ──
const UI = (() => {
    let currentPopup = null;

    function init() {
        // Settings cog
        document.getElementById('btn-settings').addEventListener('click', () => {
            Audio.playSfx('click');
            if (currentPopup === 'settings') closePopup();
            else showSettings();
            if (typeof App !== 'undefined' && App.getState() === 'playing') App.pause();
        });
    }

    // ── Popup system ──
    function showPopup(id, html, onClose) {
        closePopup();
        const overlay = document.getElementById('popup-overlay');
        const content = document.getElementById('popup-content');
        content.innerHTML = html;
        overlay.classList.remove('hidden');
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                closePopup();
                if (onClose) onClose();
            }
        };
        currentPopup = id;
    }

    function closePopup() {
        const overlay = document.getElementById('popup-overlay');
        overlay.classList.add('hidden');
        overlay.onclick = null;
        currentPopup = null;
    }

    // ── Start Screen ──
    function showStartScreen() {
        const data = Shop.getData();
        document.getElementById('start-screen').classList.remove('hidden');
        document.getElementById('game-over-screen').classList.add('hidden');
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('start-highscore').textContent = data.highScore;
        document.getElementById('start-coins').textContent = data.coins;
    }

    function hideStartScreen() {
        document.getElementById('start-screen').classList.add('hidden');
    }

    // ── HUD ──
    function showHUD() {
        document.getElementById('hud').classList.remove('hidden');
    }

    function hideHUD() {
        document.getElementById('hud').classList.add('hidden');
    }

    function updateHUD(score, coins, health, maxHealth, cooldownRatio, activeEffects) {
        document.getElementById('hud-score').textContent = score;
        document.getElementById('hud-coins').textContent = coins;

        // Health hearts
        const heartsEl = document.getElementById('hud-hearts');
        let hearts = '';
        for (let i = 0; i < maxHealth; i++) {
            hearts += i < health ?
                '<span class="heart full">&#9829;</span>' :
                '<span class="heart empty">&#9825;</span>';
        }
        heartsEl.innerHTML = hearts;

        // Cooldown bar
        const coolEl = document.getElementById('hud-cooldown-fill');
        coolEl.style.width = ((1 - cooldownRatio) * 100) + '%';

        // Active effects
        const effectsEl = document.getElementById('hud-effects');
        let effects = '';
        if (activeEffects.shield) effects += '<span class="effect shield-effect">SHIELD</span>';
        if (activeEffects.rapidFire) effects += '<span class="effect rapid-effect">RAPID</span>';
        if (activeEffects.multiplier) effects += '<span class="effect multi-effect">x2</span>';
        effectsEl.innerHTML = effects;
    }

    // ── Game Over ──
    function showGameOver(score, highScore, isNew, coins, runCoins, reviveCount) {
        document.getElementById('hud').classList.add('hidden');
        const screen = document.getElementById('game-over-screen');
        screen.classList.remove('hidden');

        document.getElementById('go-score').textContent = score;
        document.getElementById('go-best').textContent = highScore;
        document.getElementById('go-coins-earned').textContent = runCoins;
        document.getElementById('go-new-best').style.display = isNew ? 'block' : 'none';

        // Revive button
        const reviveBtn = document.getElementById('btn-revive');
        if (Shop.canRevive(reviveCount)) {
            const cost = Shop.getReviveCost(reviveCount);
            reviveBtn.style.display = 'block';
            reviveBtn.querySelector('.revive-cost').textContent = cost;
        } else {
            reviveBtn.style.display = 'none';
        }
    }

    function hideGameOver() {
        document.getElementById('game-over-screen').classList.add('hidden');
    }

    // ── Settings Popup ──
    function showSettings() {
        const data = Shop.getData();
        const html = `
            <div class="popup-title">Settings</div>
            <div class="settings-list">
                <div class="setting-row">
                    <span>Music</span>
                    <button class="toggle-btn ${data.musicEnabled ? 'on' : ''}" id="toggle-music">
                        ${data.musicEnabled ? 'ON' : 'OFF'}
                    </button>
                </div>
                <div class="setting-row">
                    <span>Sound FX</span>
                    <button class="toggle-btn ${data.sfxEnabled ? 'on' : ''}" id="toggle-sfx">
                        ${data.sfxEnabled ? 'ON' : 'OFF'}
                    </button>
                </div>
                <div class="setting-row">
                    <span>Colorblind Mode</span>
                    <button class="toggle-btn ${data.colorblindMode ? 'on' : ''}" id="toggle-colorblind">
                        ${data.colorblindMode ? 'ON' : 'OFF'}
                    </button>
                </div>
            </div>
            <button class="popup-btn close-btn" id="settings-close">Close</button>
        `;
        showPopup('settings', html);

        document.getElementById('toggle-music').onclick = () => {
            const on = !Shop.getData().musicEnabled;
            Shop.setMusicPref(on);
            Audio.setMusicEnabled(on);
            const btn = document.getElementById('toggle-music');
            btn.textContent = on ? 'ON' : 'OFF';
            btn.classList.toggle('on', on);
            Audio.playSfx('click');
        };

        document.getElementById('toggle-sfx').onclick = () => {
            const on = !Shop.getData().sfxEnabled;
            Shop.setSfxPref(on);
            Audio.setSfxEnabled(on);
            const btn = document.getElementById('toggle-sfx');
            btn.textContent = on ? 'ON' : 'OFF';
            btn.classList.toggle('on', on);
        };

        document.getElementById('toggle-colorblind').onclick = () => {
            const on = !Shop.getData().colorblindMode;
            Shop.setColorblindMode(on);
            const btn = document.getElementById('toggle-colorblind');
            btn.textContent = on ? 'ON' : 'OFF';
            btn.classList.toggle('on', on);
            document.body.classList.toggle('colorblind', on);
            Audio.playSfx('click');
        };

        document.getElementById('settings-close').onclick = () => {
            closePopup();
            Audio.playSfx('click');
        };
    }

    // ── Shop Popup ──
    function showShop() {
        const data = Shop.getData();
        const upgState = Shop.getUpgradeState();

        let upgradeRows = '';
        for (const upg of Shop.UPGRADES) {
            const lvl = data.upgrades[upg.id] || 0;
            const maxed = lvl >= upg.maxLvl;
            const cost = maxed ? 'MAX' : Shop.getUpgradeCost(upg.id);
            const canBuy = !maxed && data.coins >= cost;
            upgradeRows += `
                <div class="shop-row">
                    <div class="shop-item-info">
                        <span class="shop-icon">${upg.icon}</span>
                        <div>
                            <div class="shop-item-name">${upg.name} <span class="shop-lvl">Lv.${lvl}/${upg.maxLvl}</span></div>
                            <div class="shop-item-desc">${upg.desc}</div>
                        </div>
                    </div>
                    <button class="shop-buy-btn ${canBuy ? '' : 'disabled'} ${maxed ? 'maxed' : ''}"
                        data-upgrade="${upg.id}" ${maxed ? 'disabled' : ''}>
                        ${maxed ? 'MAXED' : cost + ' &#9733;'}
                    </button>
                </div>`;
        }

        let skinRows = '';
        for (const skin of Shop.SKINS) {
            const owned = data.unlockedSkins.includes(skin.id);
            const active = data.activeSkin === skin.id;
            const canBuy = !owned && data.coins >= skin.cost;
            skinRows += `
                <div class="shop-row skin-row">
                    <div class="shop-item-info">
                        <span class="skin-preview" style="background:${skin.colors.body}; border-color:${skin.colors.wing}"></span>
                        <div>
                            <div class="shop-item-name">${skin.name}</div>
                        </div>
                    </div>
                    ${active ? '<span class="skin-active">EQUIPPED</span>' :
                owned ? `<button class="shop-buy-btn equip-btn" data-skin-equip="${skin.id}">EQUIP</button>` :
                    `<button class="shop-buy-btn ${canBuy ? '' : 'disabled'}" data-skin-buy="${skin.id}">${skin.cost} &#9733;</button>`}
                </div>`;
        }

        const html = `
            <div class="popup-title">Shop</div>
            <div class="shop-coins">&#9733; ${data.coins}</div>
            <div class="shop-section-title">Upgrades</div>
            <div class="shop-section">${upgradeRows}</div>
            <div class="shop-section-title">Skins</div>
            <div class="shop-section">${skinRows}</div>
            <button class="popup-btn close-btn" id="shop-close">Close</button>
        `;
        showPopup('shop', html);

        // Upgrade buy handlers
        document.querySelectorAll('[data-upgrade]').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.upgrade;
                if (Shop.buyUpgrade(id)) {
                    Audio.playSfx('coin');
                    showShop(); // refresh
                }
            };
        });

        // Skin buy handlers
        document.querySelectorAll('[data-skin-buy]').forEach(btn => {
            btn.onclick = () => {
                const id = btn.dataset.skinBuy;
                if (Shop.buySkin(id)) {
                    Shop.selectSkin(id);
                    Audio.playSfx('pickup');
                    showShop();
                }
            };
        });

        // Skin equip handlers
        document.querySelectorAll('[data-skin-equip]').forEach(btn => {
            btn.onclick = () => {
                Shop.selectSkin(btn.dataset.skinEquip);
                Audio.playSfx('click');
                showShop();
            };
        });

        document.getElementById('shop-close').onclick = () => {
            closePopup();
            Audio.playSfx('click');
        };
    }

    // ── Tutorial ──
    function showTutorial(onDone) {
        const isMobile = Input.isMobile;
        const html = `
            <div class="popup-title">How to Play</div>
            <div class="tutorial-content">
                <div class="tutorial-story">Escape the Drone Factory!</div>
                <div class="tutorial-section">
                    <div class="tutorial-label">MOVE</div>
                    <div class="tutorial-text">${isMobile ?
                'Drag on the <b>right half</b> of screen to move up/down' :
                '<b>Arrow keys</b> or <b>W/S</b> to move up/down'}</div>
                </div>
                <div class="tutorial-section">
                    <div class="tutorial-label">SHOOT</div>
                    <div class="tutorial-text">${isMobile ?
                'Tap the <b>left half</b> of screen to fire' :
                '<b>Spacebar</b> or <b>left click</b> to fire'}</div>
                </div>
                <div class="tutorial-section">
                    <div class="tutorial-label">WALLS</div>
                    <div class="tutorial-text"><span style="color:#cc8844">Orange walls</span> can be shot! <span style="color:#889">Gray walls</span> must be dodged.</div>
                </div>
                <div class="tutorial-section">
                    <div class="tutorial-label">TIP</div>
                    <div class="tutorial-text">Shooting briefly locks movement — time your shots!</div>
                </div>
            </div>
            <button class="popup-btn" id="tutorial-start">Let's Go!</button>
        `;
        showPopup('tutorial', html, onDone);
        document.getElementById('tutorial-start').onclick = () => {
            closePopup();
            Audio.playSfx('click');
            if (onDone) onDone();
        };
    }

    // ── Pause overlay ──
    function showPause() {
        document.getElementById('pause-overlay').classList.remove('hidden');
    }

    function hidePause() {
        document.getElementById('pause-overlay').classList.add('hidden');
    }

    // ── Boss warning ──
    function showBossWarning() {
        const el = document.getElementById('boss-warning');
        el.classList.remove('hidden');
        el.classList.add('animate');
        setTimeout(() => {
            el.classList.add('hidden');
            el.classList.remove('animate');
        }, 2000);
    }

    return {
        init, showStartScreen, hideStartScreen,
        showHUD, hideHUD, updateHUD,
        showGameOver, hideGameOver,
        showSettings, showShop, showTutorial,
        showPause, hidePause, showBossWarning,
        closePopup,
        get currentPopup() { return currentPopup; },
    };
})();
