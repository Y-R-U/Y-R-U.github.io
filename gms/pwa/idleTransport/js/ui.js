// ============================================================
// Idle Transport Empire - UI Manager
// ============================================================

const UI = {
    activeTab: 'routes',
    cfmCallback: null,

    init() {
        this._bindTabs();
        this._bindModals();
        this._bindSettings();
    },

    _bindTabs() {
        document.querySelectorAll('.tab').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                this.activeTab = btn.dataset.tab;
                document.getElementById('pane-' + this.activeTab).classList.add('active');
                this.renderPane();
            });
        });
    },

    _bindModals() {
        document.getElementById('btn-settings').addEventListener('click', () => openModal('modal-settings'));
        document.getElementById('btn-stats').addEventListener('click', () => { this.renderStats(); openModal('modal-stats'); });
        document.getElementById('cfm-no').addEventListener('click', () => closeModal('modal-confirm'));
        document.getElementById('cfm-yes').addEventListener('click', () => { closeModal('modal-confirm'); if (this.cfmCallback) this.cfmCallback(); });

        document.querySelectorAll('.modal-x').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });
        document.querySelectorAll('.modal-bg').forEach(bg => {
            bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(bg.id); });
        });
    },

    _bindSettings() {
        document.getElementById('tog-sfx').addEventListener('click', function () {
            G.settings.sfx = !G.settings.sfx;
            this.classList.toggle('on', G.settings.sfx);
            saveGame();
        });
        document.getElementById('tog-music').addEventListener('click', function () {
            G.settings.music = !G.settings.music;
            this.classList.toggle('on', G.settings.music);
            if (G.settings.music) Audio.playMusic(); else Audio.stopMusic();
            saveGame();
        });
        document.getElementById('vol-music').addEventListener('input', function () {
            Audio.setMusicVol(this.value / 100);
            saveGame();
        });
        document.getElementById('vol-sfx').addEventListener('input', function () {
            G.settings.sfxVol = this.value / 100;
            saveGame();
        });
        document.getElementById('btn-export').addEventListener('click', () => {
            const data = exportSave();
            navigator.clipboard.writeText(data).then(
                () => showToast('Save copied to clipboard!', 'green'),
                () => showToast('Copy failed', '')
            );
        });
        document.getElementById('btn-import').addEventListener('click', () => {
            closeModal('modal-settings');
            openModal('modal-import');
        });
        document.getElementById('btn-do-import').addEventListener('click', () => {
            const data = document.getElementById('import-data').value.trim();
            if (importSave(data)) {
                showToast('Save imported!', 'green');
                closeModal('modal-import');
                Scene.rebuildScene();
                this.fullRender();
            } else {
                showToast('Invalid save data!', '');
            }
        });
        document.getElementById('btn-reset').addEventListener('click', () => {
            closeModal('modal-settings');
            this.showConfirm('Hard Reset', 'Erase ALL progress permanently?', () => {
                hardReset();
                Scene.rebuildScene();
                this.fullRender();
                showToast('Game reset!', 'green');
            });
        });
    },

    showConfirm(title, text, cb) {
        document.getElementById('cfm-title').textContent = title;
        document.getElementById('cfm-text').textContent = text;
        this.cfmCallback = cb;
        openModal('modal-confirm');
    },

    // ---- HUD ----
    updateHUD() {
        document.getElementById('money-txt').textContent = fmtMoney(G.money);
        document.getElementById('ps-txt').textContent = fmtMoney(getPerSec()) + '/s';
        const ppEl = document.getElementById('pp-txt');
        if (G.lifetimePP > 0 || G.pp > 0) {
            ppEl.style.display = '';
            ppEl.textContent = '\u2b50 ' + G.pp;
        } else {
            ppEl.style.display = 'none';
        }
        // Tap prompt
        const tp = document.getElementById('tap-prompt');
        tp.textContent = 'Tap: +' + fmtMoney(getClickVal());
    },

    // ---- Bonus bar ----
    updateBonusBar() {
        const bar = document.getElementById('bonus-bar');
        const txt = document.getElementById('bonus-txt');
        if (G.bonuses.length > 0) {
            bar.classList.add('show');
            txt.textContent = G.bonuses.map(b => {
                const rem = Math.max(0, (b.endTime - Date.now()) / 1000);
                return b.mul + 'x ' + b.effect + ' (' + Math.ceil(rem) + 's)';
            }).join(' | ');
        } else {
            bar.classList.remove('show');
        }
    },

    // ---- Full render ----
    fullRender() {
        document.getElementById('tog-sfx').classList.toggle('on', G.settings.sfx);
        document.getElementById('tog-music').classList.toggle('on', G.settings.music);
        document.getElementById('vol-music').value = G.settings.musicVol * 100;
        document.getElementById('vol-sfx').value = G.settings.sfxVol * 100;
        this.updateHUD();
        this.renderPane();
    },

    // ---- Pane render dispatch ----
    renderPane() {
        switch (this.activeTab) {
            case 'routes': this.renderRoutes(); break;
            case 'upgrades': this.renderUpgrades(); break;
            case 'prestige': this.renderPrestige(); break;
            case 'achieve': this.renderAchieve(); break;
        }
    },

    // ---- Routes pane ----
    renderRoutes() {
        const el = document.getElementById('pane-routes');
        let h = '<div class="sec-hdr">Transport Routes</div>';

        for (let i = 0; i < ROUTES.length; i++) {
            const def = ROUTES[i];
            const rt = G.routes[def.id] || { level: 0, progress: 0 };
            const unlocked = rt.level > 0 || def.unlockCost === 0;
            const cost = getRouteCost(def.id);
            const canBuy = G.money >= cost;
            const selected = i === G.selectedRoute;

            // Visibility: show if unlocked, or if previous route is unlocked
            if (!unlocked) {
                if (i > 0) {
                    const prev = G.routes[ROUTES[i - 1].id];
                    if (!prev || prev.level === 0) continue;
                }
            }

            h += '<div class="route-card' + (selected ? ' selected' : '') + (unlocked ? '' : ' locked') + '" onclick="selectRoute(' + i + ')">';
            h += '<div class="route-hdr">';
            h += '<div class="route-name"><span class="ico">' + def.icon + '</span>' + def.name + '</div>';
            h += '<span class="route-lv">' + (rt.level > 0 ? 'Lv.' + rt.level : (unlocked ? 'Lv.0' : 'Locked')) + '</span>';
            h += '</div>';

            if (!unlocked) {
                h += '<div style="font-size:.72em;color:var(--text2);margin-bottom:5px;">' + def.desc + '</div>';
                const canUnlock = G.money >= def.unlockCost;
                h += '<button class="btn btn-gold btn-full" ' + (canUnlock ? '' : 'disabled') + ' onclick="event.stopPropagation();unlockRoute(\'' + def.id + '\')">Unlock ' + fmtMoney(def.unlockCost) + '</button>';
            } else {
                if (rt.level > 0) {
                    const pct = ((rt.progress || 0) / getRouteTime(def.id) * 100).toFixed(1);
                    const earnTxt = fmtMoney(getRouteEarn(def.id));
                    const timeTxt = getRouteTime(def.id).toFixed(1) + 's';
                    const mgr = hasManager(def.id);
                    const vc = getVehicleCount(rt.level);
                    h += '<div class="route-info">' + def.from + ' \u2192 ' + def.to + ' &bull; ' + earnTxt + ' / ' + timeTxt;
                    if (mgr) h += ' \ud83e\udd16';
                    h += ' &bull; \ud83d\ude9a\u00d7' + vc;
                    h += '</div>';
                    // Color the progress bar with the route accent
                    const ac = def.accentColor;
                    const barColor = 'rgb(' + Math.round(ac[0] * 255) + ',' + Math.round(ac[1] * 255) + ',' + Math.round(ac[2] * 255) + ')';
                    h += '<div class="route-bar"><div class="route-bar-fill" id="bar-' + def.id + '" style="width:' + pct + '%;background:' + barColor + ';"></div></div>';
                } else {
                    h += '<div style="font-size:.72em;color:var(--text2);margin-bottom:5px;">' + def.desc + '</div>';
                }

                h += '<div class="route-acts">';
                // Collect button for unmanaged ready routes
                if (rt.level > 0 && !hasManager(def.id) && rt.readyCollect) {
                    h += '<button class="btn btn-collect" onclick="event.stopPropagation();collectRoute(\'' + def.id + '\')">Collect ' + fmtMoney(getRouteEarn(def.id)) + '</button>';
                }
                h += '<button class="btn btn-buy" ' + (canBuy ? '' : 'disabled') + ' onclick="event.stopPropagation();buyRoute(\'' + def.id + '\')">' + (rt.level === 0 ? 'Buy' : '+1') + ' ' + fmtMoney(cost) + '</button>';
                if (rt.level > 0) {
                    const c10 = getBulkCost(def.id, 10);
                    h += '<button class="btn btn-sec" ' + (G.money >= c10 ? '' : 'disabled') + ' onclick="event.stopPropagation();buyRouteBulk(\'' + def.id + '\',10)">x10 ' + fmtMoney(c10) + '</button>';
                }
                h += '</div>';
            }
            h += '</div>';
        }
        el.innerHTML = h;
    },

    // ---- Upgrades pane ----
    renderUpgrades() {
        const el = document.getElementById('pane-upgrades');
        let h = '<div class="sec-hdr">Available Upgrades</div>';
        let any = false;

        for (const u of UPGRADES) {
            const bought = G.upgrades[u.id];
            if (!bought && u.cost > G.totalEarned * 100 && u.cost > G.money * 20) continue;
            any = true;
            const canBuy = !bought && G.money >= u.cost;

            h += '<div class="upg-card' + (bought ? ' bought' : '') + '"' + (canBuy ? ' onclick="buyUpgrade(\'' + u.id + '\')"' : '') + '>';
            h += '<div class="upg-ico">' + u.icon + '</div>';
            h += '<div class="upg-info">';
            h += '<div class="upg-name">' + u.name + (bought ? ' \u2705' : '') + '</div>';
            h += '<div class="upg-desc">' + u.desc + '</div>';
            if (!bought) h += '<div class="upg-cost">' + fmtMoney(u.cost) + (canBuy ? ' - Tap!' : '') + '</div>';
            h += '</div></div>';
        }
        if (!any) h += '<p style="text-align:center;color:var(--text3);padding:16px;">Earn more to unlock upgrades!</p>';
        el.innerHTML = h;
    },

    // ---- Prestige pane ----
    renderPrestige() {
        const el = document.getElementById('pane-prestige');
        const earn = getPrestigeEarnable();

        let h = '<div class="prestige-hero">';
        h += '<h2>Prestige</h2>';
        h += '<div class="prestige-pts">\u2b50 ' + G.pp + '</div>';
        h += '<div style="font-size:.72em;color:var(--text2);margin:3px 0;">Empire Points</div>';
        h += '<div class="prestige-earn">Reset for <strong>+' + earn + '</strong> EP</div>';
        h += '<div style="font-size:.68em;color:var(--text3);">Need $1M+ earnings to earn points</div>';
        h += earn > 0
            ? '<button class="btn btn-gold btn-full" onclick="doPrestige()" style="margin:10px 0;">Prestige (+' + earn + ' EP)</button>'
            : '<button class="btn btn-gold btn-full" disabled style="margin:10px 0;">Need more earnings</button>';
        h += '</div>';

        h += '<div class="sec-hdr">Prestige Upgrades</div>';
        for (const pu of PRESTIGE_DEFS) {
            const lv = pLv(pu.id);
            const maxed = lv >= pu.max;
            const cost = pu.cost * (lv + 1);
            const canBuy = G.pp >= cost && !maxed;

            h += '<div class="upg-card"' + (canBuy ? ' onclick="buyPrestigeUpg(\'' + pu.id + '\')" style="cursor:pointer;"' : '') + '>';
            h += '<div class="upg-ico">' + (maxed ? '\u2705' : '\u2b50') + '</div>';
            h += '<div class="upg-info">';
            h += '<div class="upg-name">' + pu.name + ' ' + (maxed ? '(MAX)' : 'Lv.' + lv + '/' + pu.max) + '</div>';
            h += '<div class="upg-desc">' + pu.desc + '</div>';
            if (!maxed) h += '<div class="upg-cost">\u2b50 ' + cost + ' EP' + (canBuy ? ' - Tap!' : '') + '</div>';
            h += '</div></div>';
        }

        h += '<div class="sec-hdr">Current Bonuses</div>';
        h += '<div class="prestige-bonus"><span>Earning Bonus</span><span>+' + ((pEarnMul() - 1) * 100).toFixed(0) + '%</span></div>';
        h += '<div class="prestige-bonus"><span>Speed Bonus</span><span>+' + ((1 - pSpeedMul()) * 100).toFixed(0) + '%</span></div>';
        h += '<div class="prestige-bonus"><span>Click Bonus</span><span>+' + ((pClickMul() - 1) * 100).toFixed(0) + '%</span></div>';
        h += '<div class="prestige-bonus"><span>Start Cash</span><span>' + fmtMoney(pStartMoney()) + '</span></div>';
        h += '<div class="prestige-bonus"><span>Cost Reduction</span><span>-' + ((1 - pCostMul()) * 100).toFixed(0) + '%</span></div>';

        el.innerHTML = h;
    },

    // ---- Achievements pane ----
    renderAchieve() {
        const el = document.getElementById('pane-achieve');
        let done = 0;
        for (const a of ACHIEVEMENTS) { if (G.achievements[a.id]) done++; }

        let h = '<p style="font-size:.78em;color:var(--text2);margin-bottom:6px;">' + done + '/' + ACHIEVEMENTS.length + ' unlocked</p>';
        h += '<div class="sec-hdr">Achievements</div>';

        for (const a of ACHIEVEMENTS) {
            const d = G.achievements[a.id];
            h += '<div class="ach-card' + (d ? ' done' : '') + '">';
            h += '<div class="ach-ico">' + a.icon + '</div>';
            h += '<div class="ach-info">';
            h += '<div class="ach-name">' + a.name + '</div>';
            h += '<div class="ach-desc">' + a.desc + ' ' + (d ? '\u2705' : '\ud83d\udd12') + '</div>';
            h += '</div></div>';
        }
        el.innerHTML = h;
    },

    // ---- Stats modal ----
    renderStats() {
        const s = getStats();
        document.getElementById('stats-body').innerHTML =
            '<div class="stat-row"><span class="stat-lbl">Total Earned</span><span class="stat-val">' + fmtMoney(s.totalEarned) + '</span></div>' +
            '<div class="stat-row"><span class="stat-lbl">Cash</span><span class="stat-val">' + fmtMoney(G.money) + '</span></div>' +
            '<div class="stat-row"><span class="stat-lbl">Per Second</span><span class="stat-val">' + fmtMoney(getPerSec()) + '/s</span></div>' +
            '<div class="stat-row"><span class="stat-lbl">Click Value</span><span class="stat-val">' + fmtMoney(getClickVal()) + '</span></div>' +
            '<div class="stat-row"><span class="stat-lbl">Total Clicks</span><span class="stat-val">' + fmtNum(s.totalClicks) + '</span></div>' +
            '<div class="stat-row"><span class="stat-lbl">Routes</span><span class="stat-val">' + s.routeCount + '/' + ROUTES.length + '</span></div>' +
            '<div class="stat-row"><span class="stat-lbl">Max Level</span><span class="stat-val">' + s.maxLevel + '</span></div>' +
            '<div class="stat-row"><span class="stat-lbl">Upgrades</span><span class="stat-val">' + s.upgradeCount + '</span></div>' +
            '<div class="stat-row"><span class="stat-lbl">Prestiges</span><span class="stat-val">' + s.totalPrestiges + '</span></div>' +
            '<div class="stat-row"><span class="stat-lbl">EP</span><span class="stat-val">\u2b50 ' + G.pp + '</span></div>' +
            '<div class="stat-row"><span class="stat-lbl">Events</span><span class="stat-val">' + s.eventsCaught + '</span></div>' +
            '<div class="stat-row"><span class="stat-lbl">Achievements</span><span class="stat-val">' + Object.keys(G.achievements).length + '/' + ACHIEVEMENTS.length + '</span></div>';
    },

    // ---- Progress bar updates (called from game loop) ----
    updateBars() {
        for (const def of ROUTES) {
            const rt = G.routes[def.id];
            if (!rt || rt.level === 0) continue;
            const bar = document.getElementById('bar-' + def.id);
            if (bar) bar.style.width = ((rt.progress || 0) / getRouteTime(def.id) * 100).toFixed(1) + '%';
        }
    }
};
