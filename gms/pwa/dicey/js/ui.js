/* ============================================
   DICEY - UI Manager
   All panels, overlays, toasts (no alerts!)
   ============================================ */

const UI = {
    overlayEl: null,
    panelEl: null,
    overlayBgEl: null,

    init() {
        this.overlayEl = document.getElementById('overlay');
        this.panelEl = document.getElementById('panel-container');
        this.overlayBgEl = document.getElementById('overlay-bg');
    },

    // Show overlay with panel content
    showPanel(html, opts = {}) {
        this.panelEl.innerHTML = html;
        this.overlayEl.classList.remove('hidden');

        // Close button handler
        const closeBtn = this.panelEl.querySelector('.panel-close');
        if (closeBtn && !opts.noClose) {
            closeBtn.addEventListener('click', () => {
                AudioManager.playSfx('click');
                this.hidePanel();
                if (opts.onClose) opts.onClose();
            });
        }

        // Background click to close (unless modal)
        if (!opts.modal) {
            this.overlayBgEl.onclick = () => {
                AudioManager.playSfx('click');
                this.hidePanel();
                if (opts.onClose) opts.onClose();
            };
        } else {
            this.overlayBgEl.onclick = null;
        }

        return this.panelEl;
    },

    hidePanel() {
        this.overlayEl.classList.add('hidden');
        this.panelEl.innerHTML = '';
        this.overlayBgEl.onclick = null;
    },

    // Toast notification
    showToast(message, duration = 2500) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.getElementById('game-container').appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    },

    // Settings panel
    showSettings() {
        const html = `
            <div class="panel">
                <div class="panel-header">
                    <h2>Settings</h2>
                    <button class="panel-close">&times;</button>
                </div>
                <div class="panel-body">
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">Sound Effects</div>
                            <div class="setting-desc">Toggle game sound effects</div>
                        </div>
                        <button class="toggle ${AudioManager.sfxEnabled ? 'on' : ''}" id="toggle-sfx"></button>
                    </div>
                    <div class="setting-row">
                        <div>
                            <div class="setting-label">Music</div>
                            <div class="setting-desc">Toggle background music</div>
                        </div>
                        <button class="toggle ${AudioManager.musicEnabled ? 'on' : ''}" id="toggle-music"></button>
                    </div>
                    <div class="setting-row" style="border-bottom:none;">
                        <div>
                            <div class="setting-label">How to Play</div>
                            <div class="setting-desc">Learn the rules</div>
                        </div>
                        <button class="btn btn-small btn-secondary" id="btn-settings-help">Guide</button>
                    </div>
                </div>
            </div>`;

        const panel = this.showPanel(html);

        panel.querySelector('#toggle-sfx').addEventListener('click', function () {
            const on = AudioManager.toggleSfx();
            this.classList.toggle('on', on);
            AudioManager.playSfx('click');
        });

        panel.querySelector('#toggle-music').addEventListener('click', function () {
            const on = AudioManager.toggleMusic();
            this.classList.toggle('on', on);
        });

        panel.querySelector('#btn-settings-help').addEventListener('click', () => {
            AudioManager.playSfx('click');
            UI.showHowToPlay();
        });
    },

    // How to Play guide
    showHowToPlay(opts = {}) {
        const html = `
            <div class="panel">
                <div class="panel-header">
                    <h2>How to Play</h2>
                    <p class="panel-subtitle">Learn the basics of Dicey</p>
                    ${opts.noClose ? '' : '<button class="panel-close">&times;</button>'}
                </div>
                <div class="panel-body">
                    <div class="panel-section">
                        <h3>🎯 Goal</h3>
                        <p>Be the <strong>richest player</strong> after 30 rounds, or be the <strong>last player standing</strong> as others go bankrupt!</p>
                    </div>

                    <div class="panel-section">
                        <h3>🎲 Your Turn</h3>
                        <div class="guide-step">
                            <div class="guide-num">1</div>
                            <div class="guide-text">Tap <strong>"Roll Dice"</strong> to roll two dice and move your token around the board.</div>
                        </div>
                        <div class="guide-step">
                            <div class="guide-num">2</div>
                            <div class="guide-text">Land on a space and follow its rules - buy properties, pay rent, or draw cards.</div>
                        </div>
                        <div class="guide-step">
                            <div class="guide-num">3</div>
                            <div class="guide-text">Roll <strong>doubles</strong> and you get another turn! But three doubles in a row sends you to jail.</div>
                        </div>
                    </div>

                    <div class="panel-section">
                        <h3>🏠 Properties</h3>
                        <p>Land on an unowned property to <strong>buy it</strong>. Own all properties of a color group to <strong>double the rent</strong>! Then you can build <strong>houses</strong> (up to 4) and a <strong>hotel</strong> for even more rent.</p>
                    </div>

                    <div class="panel-section">
                        <h3>🏗️ Building</h3>
                        <p>When it's your turn, you can upgrade properties you own by tapping the <strong>"Build"</strong> button. Each house costs <strong>half the property price</strong>. A hotel replaces 4 houses.</p>
                    </div>

                    <div class="panel-section">
                        <h3>📋 Space Types</h3>
                        <div class="guide-icon-row">
                            <div class="guide-icon-item"><div class="gi-color" style="background:#2ecc71"></div> GO - Collect $200</div>
                            <div class="guide-icon-item"><div class="gi-color" style="background:#e74c3c"></div> Chance - Random event</div>
                            <div class="guide-icon-item"><div class="gi-color" style="background:#8B4513"></div> Community - Random event</div>
                            <div class="guide-icon-item"><div class="gi-color" style="background:#f39c12"></div> Free Parking - Rest</div>
                            <div class="guide-icon-item"><div class="gi-color" style="background:#95a5a6"></div> Jail - Visit or stuck</div>
                            <div class="guide-icon-item"><div class="gi-color" style="background:#3498db"></div> Tax - Pay up!</div>
                        </div>
                    </div>

                    <div class="panel-section">
                        <h3>🔒 Jail</h3>
                        <p>In jail? Pay <strong>$50</strong> to get out, or try rolling doubles (3 attempts). If you fail, you auto-pay $50.</p>
                    </div>

                    <div class="panel-section">
                        <h3>💡 Tips</h3>
                        <p>• Railroads get more valuable the more you own<br>
                        • Cheaper properties have the best return on investment<br>
                        • Don't overbuild - keep cash for rent payments!</p>
                    </div>
                </div>
                <div class="panel-footer">
                    <button class="btn btn-primary btn-block" id="btn-close-guide">${opts.startGame ? "Let's Play!" : 'Got It!'}</button>
                </div>
            </div>`;

        const panel = this.showPanel(html, { modal: opts.modal, noClose: opts.noClose });

        panel.querySelector('#btn-close-guide').addEventListener('click', () => {
            AudioManager.playSfx('click');
            this.hidePanel();
            if (opts.onDone) opts.onDone();
        });
    },

    // Welcome / How to Play prompt on start
    showWelcomePrompt(onDone) {
        const html = `
            <div class="panel">
                <div class="panel-header">
                    <h2>Welcome to Dicey!</h2>
                    <p class="panel-subtitle">Ready to roll your fortune?</p>
                </div>
                <div class="panel-body" style="text-align:center;">
                    <p style="font-size:48px;margin-bottom:12px;">🎲</p>
                    <p style="color:var(--text-dim);font-size:14px;line-height:1.6;">
                        Roll the dice, buy properties, and outsmart your opponents to become the wealthiest player!
                    </p>
                </div>
                <div class="panel-footer" style="flex-direction:column;gap:10px;">
                    <button class="btn btn-primary btn-block" id="btn-welcome-guide">
                        📖 Read How to Play
                    </button>
                    <button class="btn btn-secondary btn-block" id="btn-welcome-skip">
                        Skip - I Know the Rules
                    </button>
                </div>
            </div>`;

        const panel = this.showPanel(html, { modal: true, noClose: true });

        panel.querySelector('#btn-welcome-guide').addEventListener('click', () => {
            AudioManager.playSfx('click');
            this.showHowToPlay({ modal: true, noClose: true, startGame: true, onDone });
        });

        panel.querySelector('#btn-welcome-skip').addEventListener('click', () => {
            AudioManager.playSfx('click');
            this.hidePanel();
            onDone();
        });
    },

    // Property landing panel - Buy or Auction
    showPropertyPanel(space, index, player, canAfford) {
        return new Promise(resolve => {
            const html = `
                <div class="panel">
                    <div class="panel-header">
                        <h2>Property Available!</h2>
                    </div>
                    <div class="panel-body">
                        <div class="prop-card">
                            <div class="prop-card-header" style="background:${space.color || 'var(--blue)'}"></div>
                            <div class="prop-card-name">${space.name}</div>
                            <div class="prop-card-price">${Utils.formatMoney(space.price)}</div>
                            <div class="prop-card-rent">
                                Base rent: ${Utils.formatMoney(space.rent ? space.rent[0] : 25)}
                            </div>
                        </div>
                        <p style="margin-top:12px;color:var(--text-dim);font-size:13px;text-align:center;">
                            Your balance: <strong style="color:${canAfford ? 'var(--green)' : 'var(--accent)'}">${Utils.formatMoney(player.money)}</strong>
                        </p>
                    </div>
                    <div class="panel-footer">
                        ${canAfford ? `<button class="btn btn-success" id="btn-buy">Buy</button>` : ''}
                        <button class="btn btn-secondary" id="btn-pass">Pass</button>
                    </div>
                </div>`;

            const panel = this.showPanel(html, { modal: true, noClose: true });

            if (canAfford) {
                panel.querySelector('#btn-buy').addEventListener('click', () => {
                    AudioManager.playSfx('buy');
                    this.hidePanel();
                    resolve('buy');
                });
            }
            panel.querySelector('#btn-pass').addEventListener('click', () => {
                AudioManager.playSfx('click');
                this.hidePanel();
                resolve('pass');
            });
        });
    },

    // Pay rent panel
    showRentPanel(space, owner, amount) {
        return new Promise(resolve => {
            const html = `
                <div class="panel">
                    <div class="panel-header">
                        <h2>Pay Rent!</h2>
                    </div>
                    <div class="panel-body" style="text-align:center;">
                        <div class="prop-card">
                            <div class="prop-card-header" style="background:${space.color || 'var(--blue)'}"></div>
                            <div class="prop-card-name">${space.name}</div>
                        </div>
                        <p style="margin-top:16px;font-size:15px;color:var(--text-dim);">
                            Owned by <strong style="color:${Utils.PLAYER_COLORS[owner]}">${Utils.PLAYER_NAMES[owner]}</strong>
                        </p>
                        <p style="font-size:28px;font-weight:800;color:var(--accent);margin-top:8px;">
                            -${Utils.formatMoney(amount)}
                        </p>
                    </div>
                    <div class="panel-footer">
                        <button class="btn btn-primary" id="btn-pay-rent">Pay</button>
                    </div>
                </div>`;

            const panel = this.showPanel(html, { modal: true, noClose: true });
            panel.querySelector('#btn-pay-rent').addEventListener('click', () => {
                AudioManager.playSfx('pay');
                this.hidePanel();
                resolve();
            });
        });
    },

    // Card panel (Chance / Community Chest)
    showCardPanel(cardType, card) {
        return new Promise(resolve => {
            const isChance = cardType === 'chance';
            const html = `
                <div class="panel">
                    <div class="panel-header">
                        <h2>${isChance ? '🃏 Chance!' : '📦 Community Chest'}</h2>
                    </div>
                    <div class="panel-body" style="text-align:center;">
                        <p style="font-size:17px;line-height:1.6;padding:12px 0;color:var(--text);">
                            ${card.text}
                        </p>
                    </div>
                    <div class="panel-footer">
                        <button class="btn btn-primary" id="btn-card-ok">OK</button>
                    </div>
                </div>`;

            const panel = this.showPanel(html, { modal: true, noClose: true });
            panel.querySelector('#btn-card-ok').addEventListener('click', () => {
                AudioManager.playSfx('click');
                this.hidePanel();
                resolve();
            });
        });
    },

    // Jail panel
    showJailPanel(player, canPay) {
        return new Promise(resolve => {
            const html = `
                <div class="panel">
                    <div class="panel-header">
                        <h2>🔒 In Jail!</h2>
                        <p class="panel-subtitle">Attempt ${player.jailTurns + 1} of 3</p>
                    </div>
                    <div class="panel-body" style="text-align:center;">
                        <p style="color:var(--text-dim);font-size:14px;line-height:1.6;">
                            Roll doubles to escape for free, or pay $50 bail.
                        </p>
                    </div>
                    <div class="panel-footer">
                        <button class="btn btn-primary" id="btn-jail-roll">Roll Dice</button>
                        ${canPay ? '<button class="btn btn-gold" id="btn-jail-pay">Pay $50</button>' : ''}
                    </div>
                </div>`;

            const panel = this.showPanel(html, { modal: true, noClose: true });
            panel.querySelector('#btn-jail-roll').addEventListener('click', () => {
                AudioManager.playSfx('roll');
                this.hidePanel();
                resolve('roll');
            });
            if (canPay) {
                panel.querySelector('#btn-jail-pay').addEventListener('click', () => {
                    AudioManager.playSfx('pay');
                    this.hidePanel();
                    resolve('pay');
                });
            }
        });
    },

    // Build panel
    showBuildPanel(player, properties, gameState) {
        return new Promise(resolve => {
            const buildable = properties.filter(idx => {
                const space = Utils.BOARD_SPACES[idx];
                const prop = gameState.properties[idx];
                if (!space || !prop || prop.owner !== player.index) return false;
                if (space.type !== 'property') return false;
                if (prop.houses >= 5) return false;
                // Check if player owns all in group
                const group = space.group;
                const groupSpaces = Utils.BOARD_SPACES.map((s, i) => ({ s, i }))
                    .filter(o => o.s.group === group && o.s.type === 'property');
                const ownsAll = groupSpaces.every(o => gameState.properties[o.i]?.owner === player.index);
                if (!ownsAll) return false;
                const cost = Math.floor(space.price / 2);
                if (player.money < cost) return false;
                return true;
            });

            if (buildable.length === 0) {
                this.showToast('No properties available to build on');
                resolve(null);
                return;
            }

            let listHtml = buildable.map(idx => {
                const space = Utils.BOARD_SPACES[idx];
                const prop = gameState.properties[idx];
                const cost = Math.floor(space.price / 2);
                const level = prop.houses < 5 ? `${prop.houses} houses` : 'Hotel';
                const nextLevel = prop.houses < 4 ? `House ${prop.houses + 1}` : 'Hotel';
                return `
                    <div class="setting-row" style="cursor:pointer;" data-build-idx="${idx}">
                        <div>
                            <div class="setting-label" style="display:flex;align-items:center;gap:6px;">
                                <span style="width:10px;height:10px;border-radius:3px;background:${space.color};display:inline-block;"></span>
                                ${space.name}
                            </div>
                            <div class="setting-desc">${level} → ${nextLevel}</div>
                        </div>
                        <button class="btn btn-small btn-success" data-build-idx="${idx}">${Utils.formatMoney(cost)}</button>
                    </div>`;
            }).join('');

            const html = `
                <div class="panel">
                    <div class="panel-header">
                        <h2>🏗️ Build</h2>
                        <p class="panel-subtitle">Upgrade your properties</p>
                        <button class="panel-close">&times;</button>
                    </div>
                    <div class="panel-body">
                        ${listHtml}
                    </div>
                    <div class="panel-footer">
                        <button class="btn btn-secondary" id="btn-build-done">Done</button>
                    </div>
                </div>`;

            const panel = this.showPanel(html, { modal: false, onClose: () => resolve(null) });

            panel.querySelectorAll('[data-build-idx]').forEach(el => {
                el.addEventListener('click', () => {
                    AudioManager.playSfx('buy');
                    this.hidePanel();
                    resolve(parseInt(el.dataset.buildIdx));
                });
            });

            panel.querySelector('#btn-build-done').addEventListener('click', () => {
                AudioManager.playSfx('click');
                this.hidePanel();
                resolve(null);
            });
        });
    },

    // Game Over panel
    showGameOver(players) {
        const sorted = [...players].sort((a, b) => {
            if (a.bankrupt && !b.bankrupt) return 1;
            if (!a.bankrupt && b.bankrupt) return -1;
            return b.money - a.money;
        });
        const winner = sorted[0];

        let lbHtml = sorted.map((p, i) => `
            <div class="lb-row ${p.bankrupt ? 'bankrupt' : ''}">
                <div class="lb-rank">${i + 1}</div>
                <div class="lb-avatar" style="background:${Utils.PLAYER_COLORS[p.index]}">${Utils.PLAYER_TOKENS[p.index]}</div>
                <div class="lb-name">${Utils.PLAYER_NAMES[p.index]}</div>
                <div class="lb-money">${p.bankrupt ? 'Bankrupt' : Utils.formatMoney(p.money)}</div>
            </div>`).join('');

        const html = `
            <div class="panel">
                <div class="panel-header">
                    <h2>🏆 Game Over!</h2>
                </div>
                <div class="panel-body">
                    <div class="winner-display">
                        <div class="winner-avatar" style="background:${Utils.PLAYER_COLORS[winner.index]}">${Utils.PLAYER_TOKENS[winner.index]}</div>
                        <div class="winner-name">${Utils.PLAYER_NAMES[winner.index]} Wins!</div>
                        <div class="winner-money">${Utils.formatMoney(winner.money)}</div>
                    </div>
                    <div class="leaderboard">
                        ${lbHtml}
                    </div>
                </div>
                <div class="panel-footer">
                    <button class="btn btn-primary btn-large" id="btn-play-again">Play Again</button>
                </div>
            </div>`;

        const panel = this.showPanel(html, { modal: true, noClose: true });
        panel.querySelector('#btn-play-again').addEventListener('click', () => {
            AudioManager.playSfx('click');
            this.hidePanel();
            location.reload();
        });
    },

    // Tax panel
    showTaxPanel(space) {
        return new Promise(resolve => {
            const html = `
                <div class="panel">
                    <div class="panel-header">
                        <h2>💰 ${space.name}</h2>
                    </div>
                    <div class="panel-body" style="text-align:center;">
                        <p style="font-size:28px;font-weight:800;color:var(--accent);">
                            -${Utils.formatMoney(space.amount)}
                        </p>
                        <p style="color:var(--text-dim);margin-top:8px;font-size:14px;">${space.desc}</p>
                    </div>
                    <div class="panel-footer">
                        <button class="btn btn-primary" id="btn-tax-ok">Pay</button>
                    </div>
                </div>`;

            const panel = this.showPanel(html, { modal: true, noClose: true });
            panel.querySelector('#btn-tax-ok').addEventListener('click', () => {
                AudioManager.playSfx('pay');
                this.hidePanel();
                resolve();
            });
        });
    },

    // Update HUD
    updateHUD(gameState) {
        const cp = gameState.players[gameState.currentPlayer];
        if (!cp) return;

        document.getElementById('cp-name').textContent = Utils.PLAYER_NAMES[cp.index];
        document.getElementById('cp-money').textContent = Utils.formatMoney(cp.money);
        document.getElementById('round-num').textContent = gameState.round;

        const avatar = document.getElementById('cp-avatar');
        avatar.style.background = Utils.PLAYER_COLORS[cp.index];
        avatar.textContent = Utils.PLAYER_TOKENS[cp.index];
        avatar.style.fontSize = '18px';
        avatar.style.display = 'flex';
        avatar.style.alignItems = 'center';
        avatar.style.justifyContent = 'center';
        avatar.style.borderColor = Utils.PLAYER_COLORS[cp.index];

        // Player pips
        gameState.players.forEach((p, i) => {
            const pip = document.querySelector(`.player-pip[data-player="${i}"]`);
            if (!pip) return;
            pip.style.background = Utils.PLAYER_COLORS[i];
            pip.textContent = Utils.PLAYER_TOKENS[i];
            pip.style.fontSize = '16px';
            pip.classList.toggle('active', i === gameState.currentPlayer);
            pip.classList.toggle('bankrupt', p.bankrupt);

            let moneyEl = pip.querySelector('.pip-money');
            if (!moneyEl) {
                moneyEl = document.createElement('span');
                moneyEl.className = 'pip-money';
                pip.appendChild(moneyEl);
            }
            moneyEl.textContent = p.bankrupt ? '💀' : Utils.formatMoney(p.money);
        });
    }
};
