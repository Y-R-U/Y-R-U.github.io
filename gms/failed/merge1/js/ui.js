/* ===== BOUNCE MERGE ROGUELITE — UI ===== */
(function(BM) {
    'use strict';

    var toastTimer = null;

    // ===== SCREEN MANAGEMENT =====
    function showScreen(id) {
        var screens = document.querySelectorAll('.screen');
        for (var i = 0; i < screens.length; i++) {
            screens[i].classList.remove('active');
            screens[i].classList.add('hidden');
        }
        var target = document.getElementById(id);
        if (target) {
            target.classList.remove('hidden');
            // Force reflow before adding active for transition
            void target.offsetWidth;
            target.classList.add('active');
        }
    }

    function showHud(show) {
        var hud = document.getElementById('hud');
        if (show) hud.classList.remove('hidden');
        else hud.classList.add('hidden');
    }

    // ===== TOAST =====
    function showToast(msg, duration) {
        duration = duration || 2000;
        var el = document.getElementById('toast');
        el.textContent = msg;
        el.classList.remove('hidden');
        // Force reflow
        void el.offsetWidth;
        el.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function() {
            el.classList.remove('show');
            setTimeout(function() { el.classList.add('hidden'); }, 300);
        }, duration);
    }

    // ===== POPUP =====
    function showPopup(id) {
        var el = document.getElementById(id);
        if (el) el.classList.remove('hidden');
    }

    function hidePopup(id) {
        var el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    }

    // ===== CONFIRM (replaces JS confirm) =====
    var confirmResolve = null;

    function showConfirm(title, message) {
        return new Promise(function(resolve) {
            confirmResolve = resolve;
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;
            showPopup('confirmPopup');
        });
    }

    function setupConfirmButtons() {
        document.getElementById('confirmYes').addEventListener('click', function() {
            hidePopup('confirmPopup');
            if (confirmResolve) confirmResolve(true);
            confirmResolve = null;
            BM.Audio.play('click');
        });
        document.getElementById('confirmNo').addEventListener('click', function() {
            hidePopup('confirmPopup');
            if (confirmResolve) confirmResolve(false);
            confirmResolve = null;
            BM.Audio.play('click');
        });
    }

    // ===== WAVE BANNER =====
    function showWaveBanner(text, duration) {
        duration = duration || 1500;
        var el = document.getElementById('waveBanner');
        var txt = document.getElementById('waveBannerText');
        txt.textContent = text;
        el.classList.remove('hidden');
        void el.offsetWidth;
        el.classList.add('show');
        setTimeout(function() {
            el.classList.remove('show');
            setTimeout(function() { el.classList.add('hidden'); }, 300);
        }, duration);
    }

    function showBossWarning() {
        var el = document.getElementById('bossWarning');
        el.classList.remove('hidden');
        void el.offsetWidth;
        el.classList.add('show');
        setTimeout(function() {
            el.classList.remove('show');
            setTimeout(function() { el.classList.add('hidden'); }, 300);
        }, 1200);
    }

    // ===== SETTINGS POPUP =====
    function setupSettings(save) {
        var musicBtn = document.getElementById('musicToggle');
        var sfxBtn = document.getElementById('sfxToggle');

        function updateToggle(btn, on) {
            if (on) {
                btn.classList.add('on');
                btn.textContent = 'ON';
            } else {
                btn.classList.remove('on');
                btn.textContent = 'OFF';
            }
        }

        updateToggle(musicBtn, save.settings.music !== false);
        updateToggle(sfxBtn, save.settings.sfx !== false);

        musicBtn.addEventListener('click', function() {
            var on = !BM.Audio.isMusicOn();
            BM.Audio.setMusic(on);
            updateToggle(musicBtn, on);
            save.settings.music = on;
            BM.saveSave(save);
            BM.Audio.play('click');
        });

        sfxBtn.addEventListener('click', function() {
            var on = !BM.Audio.isSfxOn();
            BM.Audio.setSfx(on);
            updateToggle(sfxBtn, on);
            save.settings.sfx = on;
            BM.saveSave(save);
            BM.Audio.play('click');
        });

        // Open settings from multiple buttons
        var openBtns = [document.getElementById('settingsBtn'), document.getElementById('settingsBtnTitle')];
        openBtns.forEach(function(btn) {
            if (btn) btn.addEventListener('click', function() {
                showPopup('settingsPopup');
                BM.Audio.play('click');
            });
        });

        // Close buttons
        var closeBtns = document.querySelectorAll('[data-close]');
        for (var i = 0; i < closeBtns.length; i++) {
            closeBtns[i].addEventListener('click', function() {
                hidePopup(this.getAttribute('data-close'));
                BM.Audio.play('click');
            });
        }

        // Close on backdrop click
        var backdrops = document.querySelectorAll('.popup-backdrop');
        for (var j = 0; j < backdrops.length; j++) {
            backdrops[j].addEventListener('click', function() {
                this.parentElement.classList.add('hidden');
            });
        }
    }

    // ===== HUD UPDATES =====
    function updateScore(score) {
        document.getElementById('scoreDisplay').textContent = Math.floor(score).toLocaleString();
    }

    function updateWave(wave) {
        document.getElementById('waveDisplay').textContent = 'WAVE ' + wave;
    }

    function updateNextBall(value) {
        var el = document.getElementById('nextBallCircle');
        var colors = BM.getBallColor(value);
        el.style.background = colors.bg;
        el.style.color = colors.text;
        el.textContent = value;
    }

    function updateCrystals(save) {
        var els = [
            document.getElementById('crystalCountTitle'),
            document.getElementById('crystalCount')
        ];
        els.forEach(function(el) {
            if (el) el.textContent = save.crystals;
        });
    }

    // ===== SHOP =====
    function renderShop(save, onBuy) {
        var list = document.getElementById('upgradeList');
        list.innerHTML = '';
        BM.UPGRADES.forEach(function(def) {
            var lvl = BM.getUpgradeLevel(save, def.id);
            var maxed = lvl >= def.maxLevel - 1;
            var cost = maxed ? 0 : def.costs[lvl + 1];
            var canAfford = save.crystals >= cost;

            var card = document.createElement('div');
            card.className = 'upgrade-card' + (maxed ? ' maxed' : '');

            var icon = document.createElement('div');
            icon.className = 'upgrade-icon';
            icon.textContent = def.icon;

            var info = document.createElement('div');
            info.className = 'upgrade-info';

            var name = document.createElement('div');
            name.className = 'upgrade-name';
            name.textContent = def.name;

            var desc = document.createElement('div');
            desc.className = 'upgrade-desc';
            desc.textContent = def.display(lvl);

            var level = document.createElement('div');
            level.className = 'upgrade-level';
            level.textContent = maxed ? 'MAX LEVEL' : 'LV ' + (lvl + 1) + ' / ' + def.maxLevel;

            info.appendChild(name);
            info.appendChild(desc);
            info.appendChild(level);

            card.appendChild(icon);
            card.appendChild(info);

            if (!maxed) {
                var btn = document.createElement('button');
                btn.className = 'upgrade-buy';
                btn.disabled = !canAfford;
                btn.innerHTML = '💎 ' + cost;
                btn.addEventListener('click', function() {
                    if (save.crystals >= cost) {
                        save.crystals -= cost;
                        if (!save.upgradeLevels) save.upgradeLevels = {};
                        save.upgradeLevels[def.id] = lvl + 1;
                        BM.saveSave(save);
                        BM.Audio.play('upgrade');
                        renderShop(save, onBuy);
                        updateCrystals(save);
                        if (onBuy) onBuy();
                    }
                });
                card.appendChild(btn);
            }

            list.appendChild(card);
        });
    }

    // ===== GAME OVER STATS =====
    function showGameOver(score, waves, bestMerge, crystalsEarned) {
        document.getElementById('finalScore').textContent = Math.floor(score).toLocaleString();
        document.getElementById('finalWaves').textContent = waves;
        document.getElementById('finalMerge').textContent = bestMerge;
        document.getElementById('crystalsEarned').textContent = crystalsEarned;
        showScreen('gameOverScreen');
        showHud(false);
    }

    // ===== PUBLIC API =====
    BM.UI = {
        showScreen: showScreen,
        showHud: showHud,
        showToast: showToast,
        showPopup: showPopup,
        hidePopup: hidePopup,
        showConfirm: showConfirm,
        showWaveBanner: showWaveBanner,
        showBossWarning: showBossWarning,
        showGameOver: showGameOver,
        setupSettings: setupSettings,
        setupConfirmButtons: setupConfirmButtons,
        updateScore: updateScore,
        updateWave: updateWave,
        updateNextBall: updateNextBall,
        updateCrystals: updateCrystals,
        renderShop: renderShop,
    };

})(window.BM);
