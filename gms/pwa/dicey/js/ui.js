/* ============================================
   DICEY - UI Manager (Skills-based)
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

    showPanel(html, opts = {}) {
        this.panelEl.innerHTML = html;
        this.overlayEl.classList.remove('hidden');
        const closeBtn = this.panelEl.querySelector('.panel-close');
        if (closeBtn && !opts.noClose) {
            closeBtn.addEventListener('click', () => {
                AudioManager.playSfx('click');
                this.hidePanel();
                if (opts.onClose) opts.onClose();
            });
        }
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

    showToast(message, duration = 2500) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.getElementById('game-container').appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    },

    // ---- SETTINGS ----
    showSettings() {
        const html = `
            <div class="panel">
                <div class="panel-header">
                    <h2>Settings</h2>
                    <button class="panel-close">&times;</button>
                </div>
                <div class="panel-body">
                    <div class="setting-row">
                        <div><div class="setting-label">Sound Effects</div><div class="setting-desc">Toggle game sounds</div></div>
                        <button class="toggle ${AudioManager.sfxEnabled ? 'on' : ''}" id="toggle-sfx"></button>
                    </div>
                    <div class="setting-row">
                        <div><div class="setting-label">Music</div><div class="setting-desc">Toggle background music</div></div>
                        <button class="toggle ${AudioManager.musicEnabled ? 'on' : ''}" id="toggle-music"></button>
                    </div>
                    <div class="setting-row" style="border-bottom:none;">
                        <div><div class="setting-label">How to Play</div><div class="setting-desc">Skills & rules guide</div></div>
                        <button class="btn btn-small btn-secondary" id="btn-settings-help">Guide</button>
                    </div>
                </div>
            </div>`;
        const panel = this.showPanel(html);
        panel.querySelector('#toggle-sfx').addEventListener('click', function() {
            const on = AudioManager.toggleSfx(); this.classList.toggle('on', on); AudioManager.playSfx('click');
        });
        panel.querySelector('#toggle-music').addEventListener('click', function() {
            const on = AudioManager.toggleMusic(); this.classList.toggle('on', on);
        });
        panel.querySelector('#btn-settings-help').addEventListener('click', () => {
            AudioManager.playSfx('click'); UI.showHowToPlay();
        });
    },

    // ---- HOW TO PLAY ----
    showHowToPlay(opts = {}) {
        const skillEntries = Object.values(Utils.SKILLS);
        const attackSkills = skillEntries.filter(s => s.type === 'attack');
        const defenseSkills = skillEntries.filter(s => s.type === 'defense');

        const skillRow = (s) => `
            <div class="guide-skill-row">
                <span class="guide-skill-icon" style="background:${s.color}">${s.icon}</span>
                <div>
                    <strong>${s.name}</strong> — ${Utils.formatMoney(s.price)}<br>
                    <span style="color:var(--text-dim);font-size:12px;">${s.desc}</span>
                </div>
            </div>`;

        const html = `
            <div class="panel">
                <div class="panel-header">
                    <h2>How to Play</h2>
                    <p class="panel-subtitle">Skills, Shields & Strategy</p>
                    ${opts.noClose ? '' : '<button class="panel-close">&times;</button>'}
                </div>
                <div class="panel-body">
                    <div class="panel-section">
                        <h3>🎯 Goal</h3>
                        <p>Be the <strong>richest player</strong> after ${Utils.MAX_ROUNDS} rounds, or the <strong>last one standing</strong>!</p>
                    </div>
                    <div class="panel-section">
                        <h3>🎲 Your Turn</h3>
                        <div class="guide-step"><div class="guide-num">1</div><div class="guide-text">Tap <strong>Roll Dice</strong> to move around the board.</div></div>
                        <div class="guide-step"><div class="guide-num">2</div><div class="guide-text">Land on a skill space to <strong>buy it</strong> or trigger its effect.</div></div>
                        <div class="guide-step"><div class="guide-num">3</div><div class="guide-text"><strong>Doubles</strong> = extra turn. Three doubles in a row = Injury!</div></div>
                    </div>
                    <div class="panel-section">
                        <h3>🛡️ Shield Cards</h3>
                        <p>Each player starts with <strong>4 Shield Cards</strong>. When you land on an opponent's attack skill, you can spend a shield to <strong>block the attack completely</strong>.</p>
                        <p style="margin-top:6px;">If you have <strong>no shields AND no money</strong>, you must <strong>surrender one of your skills</strong> to the attacker!</p>
                        <p style="margin-top:6px;">Earn shields at the <strong>Rest Stop</strong>, via <strong>Shield Forge</strong>, or from Fate cards. Max 6 shields.</p>
                    </div>
                    <div class="panel-section">
                        <h3>⚔️ Attack Skills</h3>
                        <p style="margin-bottom:8px;">When an opponent lands on your attack skill, the effect triggers against them:</p>
                        ${attackSkills.map(skillRow).join('')}
                    </div>
                    <div class="panel-section">
                        <h3>🛡️ Defense Skills</h3>
                        <p style="margin-bottom:8px;">Passive bonuses or protective effects that help you survive:</p>
                        ${defenseSkills.map(skillRow).join('')}
                    </div>
                    <div class="panel-section">
                        <h3>📋 Other Spaces</h3>
                        <div class="guide-icon-row">
                            <div class="guide-icon-item"><div class="gi-color" style="background:#2ecc71"></div> START — Collect $200+</div>
                            <div class="guide-icon-item"><div class="gi-color" style="background:#9b59b6"></div> Fate — Random event</div>
                            <div class="guide-icon-item"><div class="gi-color" style="background:#f39c12"></div> Rest Stop — +1 Shield</div>
                            <div class="guide-icon-item"><div class="gi-color" style="background:#e74c3c"></div> Hospital — Recover here</div>
                            <div class="guide-icon-item"><div class="gi-color" style="background:#e74c3c"></div> Injury — Sent to Hospital</div>
                            <div class="guide-icon-item"><div class="gi-color" style="background:#e67e22"></div> Toll/Market — Pay tax</div>
                        </div>
                    </div>
                    <div class="panel-section">
                        <h3>🔮 Fate Cards</h3>
                        <p style="margin-bottom:8px;">Landing on a Fate space draws a random card from the shuffled deck:</p>
                        ${Utils.FATE_CARDS.map(c => '<div style="font-size:12px;color:var(--text-dim);padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.04);">• ' + c.text + '</div>').join('')}
                    </div>
                    <div class="panel-section">
                        <h3>💡 Tips</h3>
                        <p>• Bodyguard halves all attack damage — great first buy<br>
                        • Gold Mine stacks — 2 mines = +$200 extra at GO<br>
                        • Save shields for devastating attacks like Ambush & Jinx (Injury)<br>
                        • Vault protects your last $100 from any attack</p>
                    </div>
                </div>
                <div class="panel-footer">
                    <button class="btn btn-primary btn-block" id="btn-close-guide">${opts.startGame ? "Let's Play!" : 'Got It!'}</button>
                </div>
            </div>`;
        const panel = this.showPanel(html, { modal: opts.modal, noClose: opts.noClose });
        panel.querySelector('#btn-close-guide').addEventListener('click', () => {
            AudioManager.playSfx('click'); this.hidePanel();
            if (opts.onDone) opts.onDone();
        });
    },

    // ---- WELCOME ----
    showWelcomePrompt(onDone) {
        const html = `
            <div class="panel">
                <div class="panel-header">
                    <h2>Welcome to Dicey!</h2>
                    <p class="panel-subtitle">Skills, Shields & Strategy</p>
                </div>
                <div class="panel-body" style="text-align:center;">
                    <p style="font-size:48px;margin-bottom:12px;">🎲</p>
                    <p style="color:var(--text-dim);font-size:14px;line-height:1.6;">
                        Roll the dice, learn skills, attack opponents and defend yourself to become the wealthiest player!
                    </p>
                </div>
                <div class="panel-footer" style="flex-direction:column;gap:10px;">
                    <button class="btn btn-primary btn-block" id="btn-welcome-guide">📖 Read How to Play</button>
                    <button class="btn btn-secondary btn-block" id="btn-welcome-skip">Skip — I Know the Rules</button>
                </div>
            </div>`;
        const panel = this.showPanel(html, { modal: true, noClose: true });
        panel.querySelector('#btn-welcome-guide').addEventListener('click', () => {
            AudioManager.playSfx('click');
            this.showHowToPlay({ modal: true, noClose: true, startGame: true, onDone });
        });
        panel.querySelector('#btn-welcome-skip').addEventListener('click', () => {
            AudioManager.playSfx('click'); this.hidePanel(); onDone();
        });
    },

    // ---- SKILL BUY PANEL ----
    showSkillBuyPanel(skill, spaceIdx, player, canAfford, price) {
        return new Promise(resolve => {
            const html = `
                <div class="panel">
                    <div class="panel-header"><h2>Skill Available!</h2></div>
                    <div class="panel-body">
                        <div class="detail-card">
                            <div class="detail-card-banner" style="background:${skill.color}"></div>
                            <div class="detail-card-body">
                                <div style="font-size:32px;text-align:center;margin-bottom:4px;">${skill.icon}</div>
                                <div class="detail-card-name" style="text-align:center;">${skill.name}</div>
                                <div class="detail-card-type">${skill.type === 'attack' ? '⚔️ Attack Skill' : '🛡️ Defense Skill'}</div>
                                <div class="detail-card-price" style="text-align:center;">${Utils.formatMoney(price)}${player.discount ? ' (Discounted!)' : ''}</div>
                                <div class="detail-card-divider"></div>
                                <p style="font-size:13px;color:var(--text-dim);line-height:1.5;">${skill.desc}</p>
                            </div>
                        </div>
                        <p style="margin-top:12px;color:var(--text-dim);font-size:13px;text-align:center;">
                            Balance: <strong style="color:${canAfford ? 'var(--green)' : 'var(--accent)'}">${Utils.formatMoney(player.money)}</strong>
                        </p>
                    </div>
                    <div class="panel-footer">
                        ${canAfford ? '<button class="btn btn-success" id="btn-buy">Learn Skill</button>' : ''}
                        <button class="btn btn-secondary" id="btn-pass">Pass</button>
                    </div>
                </div>`;
            const panel = this.showPanel(html, { modal: true, noClose: true });
            if (canAfford) panel.querySelector('#btn-buy').addEventListener('click', () => { this.hidePanel(); resolve('buy'); });
            panel.querySelector('#btn-pass').addEventListener('click', () => { AudioManager.playSfx('click'); this.hidePanel(); resolve('pass'); });
        });
    },

    // ---- SKILL EFFECT PANEL (attack triggered on human) ----
    showSkillEffectPanel(skill, attackerIdx, message, accentColor) {
        return new Promise(resolve => {
            const html = `
                <div class="panel">
                    <div class="panel-header"><h2>${skill.icon} ${skill.name}!</h2></div>
                    <div class="panel-body" style="text-align:center;">
                        <div style="font-size:48px;margin-bottom:12px;">${skill.icon}</div>
                        <p style="font-size:16px;line-height:1.6;color:var(--text);white-space:pre-line;">${message}</p>
                    </div>
                    <div class="panel-footer">
                        <button class="btn btn-primary" id="btn-effect-ok">OK</button>
                    </div>
                </div>`;
            const panel = this.showPanel(html, { modal: true, noClose: true });
            panel.querySelector('#btn-effect-ok').addEventListener('click', () => { AudioManager.playSfx('click'); this.hidePanel(); resolve(); });
        });
    },

    // ---- SHIELD PROMPT ----
    showShieldPrompt(skill, attackerIdx, player) {
        return new Promise(resolve => {
            const html = `
                <div class="panel">
                    <div class="panel-header"><h2>⚔️ Incoming Attack!</h2></div>
                    <div class="panel-body" style="text-align:center;">
                        <div style="font-size:40px;margin-bottom:8px;">${skill.icon}</div>
                        <p style="font-size:16px;font-weight:700;color:var(--text);margin-bottom:6px;">${skill.name}</p>
                        <p style="color:var(--text-dim);font-size:13px;margin-bottom:12px;">
                            Owned by <strong style="color:${Utils.PLAYER_COLORS[attackerIdx]}">${Utils.PLAYER_NAMES[attackerIdx]}</strong>
                        </p>
                        <p style="font-size:13px;color:var(--text-dim);line-height:1.5;margin-bottom:12px;">${skill.desc}</p>
                        <div class="detail-card-divider"></div>
                        <p style="font-size:14px;color:var(--text);margin-top:8px;">
                            Use a Shield Card to block? <br>
                            <span style="font-size:20px;">${'🛡️'.repeat(player.shields)}</span>
                        </p>
                    </div>
                    <div class="panel-footer">
                        <button class="btn btn-success" id="btn-use-shield">🛡️ Use Shield</button>
                        <button class="btn btn-secondary" id="btn-take-hit">Take the Hit</button>
                    </div>
                </div>`;
            const panel = this.showPanel(html, { modal: true, noClose: true });
            panel.querySelector('#btn-use-shield').addEventListener('click', () => { AudioManager.playSfx('click'); this.hidePanel(); resolve(true); });
            panel.querySelector('#btn-take-hit').addEventListener('click', () => { AudioManager.playSfx('click'); this.hidePanel(); resolve(false); });
        });
    },

    // ---- SURRENDER SKILL PANEL ----
    showSurrenderSkillPanel(player, skills, attackerIdx) {
        return new Promise(resolve => {
            let listHtml = skills.map(s => `
                <div class="setting-row" style="cursor:pointer;" data-idx="${s.spaceIdx}">
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="font-size:20px;">${s.skill.icon}</span>
                        <div>
                            <div class="setting-label">${s.skill.name}</div>
                            <div class="setting-desc">${s.skill.type === 'attack' ? '⚔️ Attack' : '🛡️ Defense'}</div>
                        </div>
                    </div>
                    <button class="btn btn-small btn-secondary" data-idx="${s.spaceIdx}">Give</button>
                </div>`).join('');

            const html = `
                <div class="panel">
                    <div class="panel-header">
                        <h2>⚠️ Surrender a Skill!</h2>
                        <p class="panel-subtitle">No shields left! Choose a skill to give to ${Utils.PLAYER_NAMES[attackerIdx]}</p>
                    </div>
                    <div class="panel-body">${listHtml}</div>
                </div>`;
            const panel = this.showPanel(html, { modal: true, noClose: true });
            panel.querySelectorAll('[data-idx]').forEach(el => {
                el.addEventListener('click', () => {
                    AudioManager.playSfx('pay'); this.hidePanel();
                    resolve(parseInt(el.dataset.idx));
                });
            });
        });
    },

    // ---- FATE CARD PANEL ----
    showFatePanel(card) {
        return new Promise(resolve => {
            const html = `
                <div class="panel">
                    <div class="panel-header"><h2>🔮 Fate!</h2></div>
                    <div class="panel-body" style="text-align:center;">
                        <p style="font-size:17px;line-height:1.6;padding:12px 0;color:var(--text);">${card.text}</p>
                    </div>
                    <div class="panel-footer">
                        <button class="btn btn-primary" id="btn-fate-ok">OK</button>
                    </div>
                </div>`;
            const panel = this.showPanel(html, { modal: true, noClose: true });
            panel.querySelector('#btn-fate-ok').addEventListener('click', () => { AudioManager.playSfx('click'); this.hidePanel(); resolve(); });
        });
    },

    // ---- JAIL PANEL ----
    showJailPanel(player, canPay) {
        return new Promise(resolve => {
            const html = `
                <div class="panel">
                    <div class="panel-header"><h2>🏥 In Hospital!</h2><p class="panel-subtitle">Recovery attempt ${player.jailTurns + 1} of 3</p></div>
                    <div class="panel-body" style="text-align:center;">
                        <p style="color:var(--text-dim);font-size:14px;">Roll doubles to recover, or pay $50 for treatment.</p>
                    </div>
                    <div class="panel-footer">
                        <button class="btn btn-primary" id="btn-jail-roll">Roll Dice</button>
                        ${canPay ? '<button class="btn btn-gold" id="btn-jail-pay">Pay $50</button>' : ''}
                    </div>
                </div>`;
            const panel = this.showPanel(html, { modal: true, noClose: true });
            panel.querySelector('#btn-jail-roll').addEventListener('click', () => { AudioManager.playSfx('roll'); this.hidePanel(); resolve('roll'); });
            if (canPay) panel.querySelector('#btn-jail-pay').addEventListener('click', () => { AudioManager.playSfx('pay'); this.hidePanel(); resolve('pay'); });
        });
    },

    // ---- TAX PANEL ----
    showTaxPanel(space) {
        return new Promise(resolve => {
            const html = `
                <div class="panel">
                    <div class="panel-header"><h2>💰 ${space.name}</h2></div>
                    <div class="panel-body" style="text-align:center;">
                        <p style="font-size:28px;font-weight:800;color:var(--accent);">-${Utils.formatMoney(space.amount)}</p>
                        <p style="color:var(--text-dim);margin-top:8px;">${space.desc}</p>
                    </div>
                    <div class="panel-footer">
                        <button class="btn btn-primary" id="btn-tax-ok">Pay</button>
                    </div>
                </div>`;
            const panel = this.showPanel(html, { modal: true, noClose: true });
            panel.querySelector('#btn-tax-ok').addEventListener('click', () => { AudioManager.playSfx('pay'); this.hidePanel(); resolve(); });
        });
    },

    // ---- GAME OVER ----
    showGameOver(players, gameState) {
        const sorted = [...players].sort((a, b) => {
            if (a.bankrupt && !b.bankrupt) return 1;
            if (!a.bankrupt && b.bankrupt) return -1;
            return b.money - a.money;
        });
        const winner = sorted[0];

        const lbHtml = sorted.map((p, i) => {
            const skillCount = gameState ? Game.getPlayerSkillCount(p.index) : 0;
            return `<div class="lb-row ${p.bankrupt ? 'bankrupt' : ''}">
                <div class="lb-rank">${i + 1}</div>
                <div class="lb-avatar" style="background:${Utils.PLAYER_COLORS[p.index]}">${Utils.PLAYER_TOKENS[p.index]}</div>
                <div class="lb-name">${Utils.PLAYER_NAMES[p.index]}</div>
                <div class="lb-money">${p.bankrupt ? 'Bankrupt' : Utils.formatMoney(p.money)}</div>
                <div style="font-size:11px;color:var(--text-dim);width:50px;text-align:right;">${skillCount} skills</div>
            </div>`;
        }).join('');

        const html = `
            <div class="panel">
                <div class="panel-header"><h2>🏆 Game Over!</h2></div>
                <div class="panel-body">
                    <div class="winner-display">
                        <div class="winner-avatar" style="background:${Utils.PLAYER_COLORS[winner.index]}">${Utils.PLAYER_TOKENS[winner.index]}</div>
                        <div class="winner-name">${Utils.PLAYER_NAMES[winner.index]} Wins!</div>
                        <div class="winner-money">${Utils.formatMoney(winner.money)}</div>
                    </div>
                    <div class="leaderboard">${lbHtml}</div>
                </div>
                <div class="panel-footer">
                    <button class="btn btn-primary btn-large" id="btn-play-again">Play Again</button>
                </div>
            </div>`;
        const panel = this.showPanel(html, { modal: true, noClose: true });
        panel.querySelector('#btn-play-again').addEventListener('click', () => { AudioManager.playSfx('click'); this.hidePanel(); location.reload(); });
    },

    // ---- SKILL DETAIL PANEL (click from board or cards strip) ----
    showSkillDetailPanel(spaceIdx, gameState) {
        const space = Utils.BOARD_SPACES[spaceIdx];
        if (!space || space.type !== 'skill') return;
        const skill = Utils.getSkillForSpace(spaceIdx);
        if (!skill) return;

        const slot = gameState.skills[spaceIdx];
        let ownerHtml = '';
        if (slot && slot.owner !== null) {
            ownerHtml = `<div class="detail-card-owner">
                <div class="detail-owner-dot" style="background:${Utils.PLAYER_COLORS[slot.owner]}"></div>
                <span>Owned by <strong style="color:${Utils.PLAYER_COLORS[slot.owner]}">${Utils.PLAYER_NAMES[slot.owner]}</strong></span>
            </div>`;
        } else {
            ownerHtml = `<div class="detail-card-owner" style="opacity:0.5;"><span>Unowned — ${Utils.formatMoney(skill.price)}</span></div>`;
        }

        const html = `
            <div class="panel">
                <div class="panel-header" style="padding:0;">
                    <button class="panel-close" style="top:8px;right:8px;z-index:2;">&times;</button>
                </div>
                <div class="panel-body" style="padding-top:0;">
                    <div class="detail-card">
                        <div class="detail-card-banner" style="background:${skill.color}"></div>
                        <div class="detail-card-body">
                            <div style="font-size:36px;text-align:center;margin-bottom:4px;">${skill.icon}</div>
                            <div class="detail-card-name" style="text-align:center;">${skill.name}</div>
                            <div class="detail-card-type">${skill.type === 'attack' ? '⚔️ Attack Skill' : '🛡️ Defense Skill'}</div>
                            <div class="detail-card-price" style="text-align:center;">Cost: ${Utils.formatMoney(skill.price)}</div>
                            <div class="detail-card-divider"></div>
                            <p style="font-size:14px;color:var(--text-dim);line-height:1.6;">${skill.desc}</p>
                            ${ownerHtml}
                        </div>
                    </div>
                </div>
            </div>`;
        this.showPanel(html);
    },

    // ---- OWNED SKILLS STRIP ----
    updateCardsStrip(gameState, playerIndex) {
        const strip = document.getElementById('cards-strip');
        const scroll = document.getElementById('cards-scroll');
        if (!strip || !scroll) return;

        const owned = [];
        for (const [idx, s] of Object.entries(gameState.skills)) {
            if (s.owner === playerIndex) {
                const skill = Utils.getSkillForSpace(parseInt(idx));
                if (skill) owned.push({ idx: parseInt(idx), skill });
            }
        }

        if (owned.length === 0) {
            strip.classList.remove('has-cards');
            scroll.innerHTML = '';
            return;
        }

        strip.classList.add('has-cards');
        owned.sort((a, b) => {
            if (a.skill.type !== b.skill.type) return a.skill.type === 'attack' ? -1 : 1;
            return a.skill.price - b.skill.price;
        });

        scroll.innerHTML = owned.map(o => `
            <div class="mini-card" data-space-idx="${o.idx}">
                <div class="mini-card-color" style="background:${o.skill.color}"></div>
                <div class="mini-card-name">${o.skill.icon}<br>${o.skill.name}</div>
            </div>`).join('');

        scroll.querySelectorAll('.mini-card').forEach(card => {
            card.addEventListener('click', () => {
                AudioManager.playSfx('click');
                this.showSkillDetailPanel(parseInt(card.dataset.spaceIdx), gameState);
            });
        });
    },

    // ---- HUD ----
    updateHUD(gameState) {
        const cp = gameState.players[gameState.currentPlayer];
        if (!cp) return;

        document.getElementById('cp-name').textContent = Utils.PLAYER_NAMES[cp.index];
        document.getElementById('cp-money').textContent = Utils.formatMoney(cp.money);
        document.getElementById('round-num').textContent = gameState.round;

        // Shields display
        const shieldsEl = document.getElementById('cp-shields');
        if (shieldsEl) shieldsEl.textContent = '🛡️'.repeat(cp.shields);

        const avatar = document.getElementById('cp-avatar');
        avatar.style.background = Utils.PLAYER_COLORS[cp.index];
        avatar.textContent = Utils.PLAYER_TOKENS[cp.index];
        avatar.style.fontSize = '18px';
        avatar.style.display = 'flex';
        avatar.style.alignItems = 'center';
        avatar.style.justifyContent = 'center';
        avatar.style.borderColor = Utils.PLAYER_COLORS[cp.index];

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
