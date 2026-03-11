// ============================================================
// Transport Empire - UI Manager
// ============================================================

const UI = {
    activeTab: 'businesses',
    confirmCallback: null,

    init() {
        this._bindTabs();
        this._bindModals();
        this._bindSettings();
        this._bindClickOverlay();
    },

    // ---- Tab Navigation ----
    _bindTabs() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                this.activeTab = btn.dataset.tab;
                document.getElementById('panel-' + this.activeTab).classList.add('active');
                this.render();
            });
        });
    },

    // ---- Modal Handling ----
    _bindModals() {
        document.getElementById('btn-settings').addEventListener('click', () => this.showModal('settings-modal'));
        document.getElementById('settings-close').addEventListener('click', () => this.hideModal('settings-modal'));
        document.getElementById('btn-stats').addEventListener('click', () => {
            this.renderStats();
            this.showModal('stats-modal');
        });
        document.getElementById('stats-close').addEventListener('click', () => this.hideModal('stats-modal'));
        document.getElementById('confirm-no').addEventListener('click', () => this.hideModal('confirm-modal'));
        document.getElementById('confirm-yes').addEventListener('click', () => {
            this.hideModal('confirm-modal');
            if (this.confirmCallback) this.confirmCallback();
        });
        document.getElementById('import-close').addEventListener('click', () => this.hideModal('import-modal'));

        document.querySelectorAll('.modal-overlay').forEach(ov => {
            ov.addEventListener('click', (e) => {
                if (e.target === ov) this.hideModal(ov.id);
            });
        });
    },

    // ---- Settings Panel ----
    _bindSettings() {
        document.getElementById('toggle-sfx').addEventListener('click', function () {
            game.settings.sfx = !game.settings.sfx;
            this.classList.toggle('on', game.settings.sfx);
            saveGame();
        });

        document.getElementById('toggle-music').addEventListener('click', function () {
            game.settings.music = !game.settings.music;
            this.classList.toggle('on', game.settings.music);
            if (game.settings.music) AudioSystem.playMusic();
            else AudioSystem.stopMusic();
            saveGame();
        });

        document.getElementById('music-volume').addEventListener('input', function () {
            AudioSystem.setMusicVolume(this.value / 100);
            saveGame();
        });

        document.getElementById('sfx-volume').addEventListener('input', function () {
            game.settings.sfxVol = this.value / 100;
            saveGame();
        });

        document.getElementById('btn-export').addEventListener('click', () => {
            const data = exportSave();
            navigator.clipboard.writeText(data).then(
                () => showToast('Save copied to clipboard!', 'event'),
                () => showToast('Copy failed - check permissions', 'achievement')
            );
        });

        document.getElementById('btn-import').addEventListener('click', () => {
            this.hideModal('settings-modal');
            this.showModal('import-modal');
        });

        document.getElementById('btn-do-import').addEventListener('click', () => {
            const data = document.getElementById('import-data').value.trim();
            if (importSave(data)) {
                showToast('Save imported successfully!', 'event');
                this.hideModal('import-modal');
                this.fullRender();
            } else {
                showToast('Invalid save data!', 'achievement');
            }
        });

        document.getElementById('btn-hard-reset').addEventListener('click', () => {
            this.hideModal('settings-modal');
            this.showConfirm(
                'Hard Reset',
                'This will erase ALL progress permanently. Are you sure?',
                () => {
                    hardReset();
                    this.fullRender();
                    showToast('Game reset!', 'event');
                }
            );
        });
    },

    // ---- Click Overlay ----
    _bindClickOverlay() {
        const overlay = document.getElementById('click-overlay');
        overlay.addEventListener('click', (e) => {
            if (!overlay.classList.contains('clickable')) return;
            const value = getClickValue();
            game.money += value;
            game.totalEarned += value;
            game.totalClicks++;
            AudioSystem.playSfx('click');
            this._showFloatingEarn(e.clientX, e.clientY, value);
            this.updateMoney();
            checkAchievements();
        });
    },

    // ---- Modal Helpers ----
    showModal(id) { document.getElementById(id).classList.add('show'); },
    hideModal(id) { document.getElementById(id).classList.remove('show'); },

    showConfirm(title, text, callback) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-text').textContent = text;
        this.confirmCallback = callback;
        this.showModal('confirm-modal');
    },

    // ---- Floating Earn Animation ----
    _showFloatingEarn(x, y, amount) {
        const el = document.createElement('div');
        el.className = 'float-earn';
        el.textContent = '+' + formatMoney(amount);
        el.style.left = x + 'px';
        el.style.top = y + 'px';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    },

    // ---- Money Display ----
    updateMoney() {
        document.getElementById('money-display').textContent = formatMoney(game.money);
        document.getElementById('per-sec-display').textContent = formatMoney(getTotalPerSec()) + '/s';
        if (game.lifetimePrestigePoints > 0 || game.prestigePoints > 0) {
            document.getElementById('prestige-points').innerHTML = '\u2b50 ' + game.prestigePoints;
        }
    },

    // ---- Full Render ----
    fullRender() {
        document.getElementById('toggle-sfx').classList.toggle('on', game.settings.sfx);
        document.getElementById('toggle-music').classList.toggle('on', game.settings.music);
        document.getElementById('music-volume').value = game.settings.musicVol * 100;
        document.getElementById('sfx-volume').value = game.settings.sfxVol * 100;
        this.updateMoney();
        this.render();
    },

    // ---- Tab Render Dispatch ----
    render() {
        switch (this.activeTab) {
            case 'businesses': this.renderBusinesses(); break;
            case 'upgrades': this.renderUpgrades(); break;
            case 'prestige': this.renderPrestige(); break;
            case 'achievements': this.renderAchievements(); break;
        }
        this._updateClickOverlay();
        this._updateBonusBar();
    },

    _updateClickOverlay() {
        const overlay = document.getElementById('click-overlay');
        const prompt = document.getElementById('click-prompt');
        overlay.classList.add('clickable');
        prompt.style.display = 'block';
        prompt.textContent = getTotalPerSec() > 0
            ? 'Tap: +' + formatMoney(getClickValue())
            : 'Tap to Earn ' + formatMoney(getClickValue()) + '!';
    },

    _updateBonusBar() {
        const bonusBar = document.getElementById('bonus-bar');
        const bonusText = document.getElementById('bonus-text');
        if (game.activeBonuses.length > 0) {
            bonusBar.classList.add('show');
            bonusText.textContent = game.activeBonuses.map(b => {
                const rem = Math.max(0, b.endTime - Date.now()) / 1000;
                return `${b.mul}x ${b.effect} (${Math.ceil(rem)}s)`;
            }).join(' | ');
        } else {
            bonusBar.classList.remove('show');
        }
    },

    // ---- Businesses Panel ----
    renderBusinesses() {
        const panel = document.getElementById('panel-businesses');
        let html = '<div class="section-header">Transport Routes</div>';

        for (let i = 0; i < BUSINESS_DEFS.length; i++) {
            const def = BUSINESS_DEFS[i];
            const biz = game.businesses[def.id] || { level: 0, progress: 0, returning: false };
            const cost = getBizCost(def.id);
            const canAfford = game.money >= cost;
            const isUnlocked = biz.level > 0 || def.unlockCost === 0;
            const canUnlock = game.money >= def.unlockCost;
            const isActive = i === SceneManager.activeRouteIdx;

            // Hide locked routes unless previous route is unlocked
            if (!isUnlocked && !canUnlock && i > 0) {
                const prevBiz = game.businesses[BUSINESS_DEFS[i - 1].id];
                if (!prevBiz || prevBiz.level === 0) continue;
            }

            const borderStyle = isActive ? 'style="border-color:var(--accent);"' : '';
            html += `<div class="biz-card ${!isUnlocked ? 'locked' : ''}" ${borderStyle}>`;
            html += `<div class="biz-header">`;
            html += `<div class="biz-name"><span class="biz-icon">${def.icon}</span> ${def.name}</div>`;
            html += `<span class="biz-level">${biz.level > 0 ? 'Lv.' + biz.level : (isUnlocked ? 'Lv.0' : 'Locked')}</span>`;
            html += `</div>`;

            if (!isUnlocked) {
                html += `<div style="font-size:0.75em;color:var(--text-secondary);margin-bottom:6px;">${def.desc}</div>`;
                html += `<button class="btn btn-gold btn-full" ${canUnlock ? '' : 'disabled'} onclick="unlockBusiness('${def.id}')">Unlock ${formatMoney(def.unlockCost)}</button>`;
            } else {
                if (biz.level > 0) {
                    const progressPct = (biz.progress / getBizTime(def.id) * 100).toFixed(1);
                    html += `<div class="biz-earnings">${def.fromLabel} \u2192 ${def.toLabel} &bull; ${formatMoney(getBizEarning(def.id))} / ${getBizTime(def.id).toFixed(1)}s`;
                    if (hasManager(def.id)) html += ' \ud83e\udd16';
                    html += `</div>`;
                    html += `<div class="biz-progress"><div class="biz-progress-fill" id="prog-${def.id}" style="width:${progressPct}%"></div></div>`;
                } else {
                    html += `<div style="font-size:0.75em;color:var(--text-secondary);margin-bottom:6px;">${def.desc}</div>`;
                }

                html += `<div class="biz-actions">`;
                // Show collect button for unmanaged businesses that are ready
                if (biz.level > 0 && !hasManager(def.id) && biz.readyToCollect) {
                    html += `<button class="btn btn-green" onclick="collectBusiness('${def.id}')">Collect ${formatMoney(getBizEarning(def.id))}</button>`;
                }
                html += `<button class="btn btn-primary" ${canAfford ? '' : 'disabled'} onclick="buyBusiness('${def.id}')">${biz.level === 0 ? 'Buy' : '+1'} ${formatMoney(cost)}</button>`;
                if (biz.level > 0) {
                    const cost10 = getBulkCost(def.id, 10);
                    html += `<button class="btn btn-secondary" ${game.money >= cost10 ? '' : 'disabled'} onclick="buyBusinessBulk('${def.id}', 10)">x10 ${formatMoney(cost10)}</button>`;
                }
                if (!isActive && biz.level > 0) {
                    html += `<button class="btn btn-secondary" onclick="viewRoute(${i})">View</button>`;
                }
                html += `</div>`;
            }
            html += `</div>`;
        }
        panel.innerHTML = html;
    },

    // ---- Upgrades Panel ----
    renderUpgrades() {
        const panel = document.getElementById('panel-upgrades');
        let html = '<div class="section-header">Available Upgrades</div>';
        let anyVisible = false;

        for (const u of UPGRADE_DEFS) {
            const purchased = game.upgrades[u.id];
            if (!purchased && u.cost > game.totalEarned * 100 && u.cost > game.money * 20) continue;
            anyVisible = true;

            const clickable = !purchased && game.money >= u.cost;
            html += `<div class="upgrade-card ${purchased ? 'purchased' : ''}" ${clickable ? `onclick="buyUpgrade('${u.id}')" style="cursor:pointer;"` : ''}>`;
            html += `<div class="upgrade-icon">${u.icon}</div>`;
            html += `<div class="upgrade-info">`;
            html += `<div class="upgrade-name">${u.name}${purchased ? ' \u2705' : ''}</div>`;
            html += `<div class="upgrade-desc">${u.desc}</div>`;
            if (!purchased) {
                html += `<div class="upgrade-cost">${formatMoney(u.cost)}${clickable ? ' - Tap to buy!' : ''}</div>`;
            }
            html += `</div></div>`;
        }

        if (!anyVisible) {
            html += '<p style="text-align:center;color:var(--text-muted);padding:20px;">Earn more to unlock upgrades!</p>';
        }
        panel.innerHTML = html;
    },

    // ---- Prestige Panel ----
    renderPrestige() {
        const panel = document.getElementById('panel-prestige');
        const earnable = getPrestigePointsEarnable();
        const pp = game.prestigePoints;

        let html = '<div class="prestige-info">';
        html += '<h2>Prestige</h2>';
        html += `<div class="prestige-current">\u2b50 ${pp}</div>`;
        html += '<p style="font-size:0.75em;color:var(--text-secondary);margin:4px 0;">Empire Points</p>';
        html += `<div class="prestige-earn">Reset for <strong>+${earnable}</strong> Empire Points</div>`;
        html += '<p style="font-size:0.7em;color:var(--text-muted);">Based on total earnings this run. Need $1M+ to earn points.</p>';

        html += earnable > 0
            ? `<button class="btn btn-gold btn-full" onclick="doPrestige()" style="margin:12px 0;">Prestige Now (+${earnable} EP)</button>`
            : `<button class="btn btn-gold btn-full" disabled style="margin:12px 0;">Need more earnings</button>`;
        html += '</div>';

        html += '<div class="section-header">Prestige Upgrades</div>';
        for (const pu of PRESTIGE_UPGRADES) {
            const level = getPrestigeLevel(pu.id);
            const maxed = level >= pu.maxLevel;
            const cost = pu.cost * (level + 1);
            const canBuy = pp >= cost && !maxed;

            html += `<div class="upgrade-card" ${canBuy ? `onclick="buyPrestigeUpgrade('${pu.id}')" style="cursor:pointer;"` : ''}>`;
            html += `<div class="upgrade-icon">${maxed ? '\u2705' : '\u2b50'}</div>`;
            html += `<div class="upgrade-info">`;
            html += `<div class="upgrade-name">${pu.name} ${maxed ? '(MAX)' : 'Lv.' + level + '/' + pu.maxLevel}</div>`;
            html += `<div class="upgrade-desc">${pu.desc}</div>`;
            if (!maxed) {
                html += `<div class="upgrade-cost">\u2b50 ${cost} EP${canBuy ? ' - Tap to buy!' : ''}</div>`;
            }
            html += `</div></div>`;
        }

        html += '<div class="prestige-bonuses"><div class="section-header">Current Bonuses</div>';
        html += `<div class="prestige-bonus-row"><span>Earning Bonus</span><span>+${((getPrestigeEarningMul() - 1) * 100).toFixed(0)}%</span></div>`;
        html += `<div class="prestige-bonus-row"><span>Speed Bonus</span><span>+${((1 - getPrestigeSpeedMul()) * 100).toFixed(0)}%</span></div>`;
        html += `<div class="prestige-bonus-row"><span>Click Bonus</span><span>+${((getPrestigeClickMul() - 1) * 100).toFixed(0)}%</span></div>`;
        html += `<div class="prestige-bonus-row"><span>Start Cash</span><span>${formatMoney(getPrestigeStartMoney())}</span></div>`;
        html += `<div class="prestige-bonus-row"><span>Cost Reduction</span><span>-${((1 - getPrestigeCostMul()) * 100).toFixed(0)}%</span></div>`;
        html += '</div>';

        panel.innerHTML = html;
    },

    // ---- Achievements Panel ----
    renderAchievements() {
        const panel = document.getElementById('panel-achievements');
        let html = '';
        let unlocked = 0;

        for (const a of ACHIEVEMENT_DEFS) {
            if (game.achievements[a.id]) unlocked++;
        }
        html += `<p style="font-size:0.8em;color:var(--text-secondary);margin-bottom:8px;">${unlocked}/${ACHIEVEMENT_DEFS.length} unlocked</p>`;
        html += '<div class="section-header">Achievements</div>';

        for (const a of ACHIEVEMENT_DEFS) {
            const done = game.achievements[a.id];
            html += `<div class="achieve-card ${done ? 'unlocked' : ''}">`;
            html += `<div class="achieve-icon">${a.icon}</div>`;
            html += `<div class="achieve-info">`;
            html += `<div class="achieve-name">${a.name}</div>`;
            html += `<div class="achieve-desc">${a.desc}</div>`;
            html += `<div class="achieve-reward">${done ? 'Unlocked!' : 'Locked'}</div>`;
            html += `</div></div>`;
        }
        panel.innerHTML = html;
    },

    // ---- Stats Modal ----
    renderStats() {
        const stats = getStats();
        document.getElementById('stats-content').innerHTML = `
            <div class="stat-row"><span class="stat-label">Total Earned</span><span class="stat-value">${formatMoney(stats.totalEarned)}</span></div>
            <div class="stat-row"><span class="stat-label">Current Cash</span><span class="stat-value">${formatMoney(game.money)}</span></div>
            <div class="stat-row"><span class="stat-label">Per Second</span><span class="stat-value">${formatMoney(getTotalPerSec())}/s</span></div>
            <div class="stat-row"><span class="stat-label">Click Value</span><span class="stat-value">${formatMoney(getClickValue())}</span></div>
            <div class="stat-row"><span class="stat-label">Total Clicks</span><span class="stat-value">${formatNum(stats.totalClicks)}</span></div>
            <div class="stat-row"><span class="stat-label">Routes Unlocked</span><span class="stat-value">${stats.unlockedCount}/${BUSINESS_DEFS.length}</span></div>
            <div class="stat-row"><span class="stat-label">Highest Level</span><span class="stat-value">${stats.maxLevel}</span></div>
            <div class="stat-row"><span class="stat-label">Upgrades Bought</span><span class="stat-value">${stats.upgradeCount}</span></div>
            <div class="stat-row"><span class="stat-label">Prestiges</span><span class="stat-value">${stats.totalPrestiges}</span></div>
            <div class="stat-row"><span class="stat-label">Empire Points</span><span class="stat-value">\u2b50 ${game.prestigePoints}</span></div>
            <div class="stat-row"><span class="stat-label">Events Caught</span><span class="stat-value">${stats.eventsCaught}</span></div>
            <div class="stat-row"><span class="stat-label">Achievements</span><span class="stat-value">${Object.keys(game.achievements).length}/${ACHIEVEMENT_DEFS.length}</span></div>
        `;
    },

    // ---- Progress Bar Updates (called frequently) ----
    updateProgressBars() {
        for (const def of BUSINESS_DEFS) {
            const biz = game.businesses[def.id];
            if (!biz || biz.level === 0) continue;
            const bar = document.getElementById('prog-' + def.id);
            if (bar) {
                bar.style.width = (biz.progress / getBizTime(def.id) * 100).toFixed(1) + '%';
            }
        }
    }
};
