/* DRace - UI Module */
const UI = (() => {
    const overlay = document.getElementById('overlay');
    const panel = document.getElementById('panel');
    const toastContainer = document.getElementById('toast-container');

    function showOverlay(content) {
        panel.innerHTML = content;
        overlay.style.display = 'flex';
        // Close on overlay background click
        overlay.onclick = (e) => {
            if (e.target === overlay) hideOverlay();
        };
    }

    function hideOverlay() {
        overlay.style.display = 'none';
        panel.innerHTML = '';
        overlay.onclick = null;
    }

    function showSettings() {
        const settings = Storage.getSettings();
        const html = `
            <div class="panel-header">
                <h2 class="panel-title">Settings</h2>
                <button class="panel-close" id="panel-close">&times;</button>
            </div>
            <div class="settings-row">
                <div>
                    <div class="settings-label">Sound Effects</div>
                    <div class="settings-desc">Toggle game sounds</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="toggle-sound" ${settings.soundOn ? 'checked' : ''}>
                    <span class="toggle-track"></span>
                    <span class="toggle-thumb"></span>
                </label>
            </div>
            <div class="settings-row">
                <div>
                    <div class="settings-label">Music</div>
                    <div class="settings-desc">Toggle background music</div>
                </div>
                <label class="toggle">
                    <input type="checkbox" id="toggle-music" ${settings.musicOn ? 'checked' : ''}>
                    <span class="toggle-track"></span>
                    <span class="toggle-thumb"></span>
                </label>
            </div>
            <div class="settings-row" style="border-bottom: none; padding-top: 20px;">
                <button class="btn btn-secondary" id="btn-how-to-play" style="width: 100%; min-width: auto;">
                    <span>&#128214;</span> How to Play
                </button>
            </div>
        `;
        showOverlay(html);

        document.getElementById('panel-close').addEventListener('click', hideOverlay);
        document.getElementById('toggle-sound').addEventListener('change', (e) => {
            Audio.toggleSound();
            if (Audio.soundOn) Audio.sfxClick();
        });
        document.getElementById('toggle-music').addEventListener('change', (e) => {
            Audio.toggleMusic();
        });
        document.getElementById('btn-how-to-play').addEventListener('click', () => {
            hideOverlay();
            setTimeout(showHowToPlay, 100);
        });
    }

    function showHowToPlay() {
        const html = `
            <div class="panel-header">
                <h2 class="panel-title">How to Play</h2>
                <button class="panel-close" id="panel-close">&times;</button>
            </div>
            <div class="guide-section">
                <h3>&#127922; The Basics</h3>
                <p>Race to the finish line before your opponents! Roll the dice and strategically choose where to land.</p>
            </div>
            <div class="guide-section">
                <h3>&#127919; Your Turn</h3>
                <ul>
                    <li>Tap <strong>ROLL DICE</strong> to roll</li>
                    <li>Choose any square from 1 up to your roll number ahead</li>
                    <li>Each square has an effect &mdash; plan wisely!</li>
                </ul>
            </div>
            <div class="guide-section">
                <h3>&#9889; Bonuses &amp; Modifiers</h3>
                <ul>
                    <li><strong>Permanent bonuses</strong> (&#11088; +1, &#127775; +2) add to every future roll</li>
                    <li><strong>Temporary boosts</strong> (&#9889; +3) apply only to your next roll</li>
                    <li><strong>Double Up</strong> (&#10024;) doubles your next roll value</li>
                    <li><strong>Shield</strong> (&#128737;&#65039;) blocks the next negative effect</li>
                </ul>
            </div>
            <div class="guide-section">
                <h3>&#128176; Treasure &amp; Scoring</h3>
                <ul>
                    <li>Collect treasure along the way for bonus points</li>
                    <li>Finishing 1st: +100 pts, 2nd: +60, 3rd: +30, 4th: +10</li>
                    <li>Final score = finish bonus + treasure collected</li>
                </ul>
            </div>
            <div class="guide-section">
                <h3>&#127912; Square Types</h3>
                <div class="guide-legend">
                    <div class="guide-legend-item">
                        <div class="guide-legend-icon" style="background:#0d3320;">&#9989;</div>
                        <span>Positive</span>
                    </div>
                    <div class="guide-legend-item">
                        <div class="guide-legend-icon" style="background:#3d1020;">&#10060;</div>
                        <span>Negative</span>
                    </div>
                    <div class="guide-legend-item">
                        <div class="guide-legend-icon" style="background:#3d2e05;">&#128176;</div>
                        <span>Treasure</span>
                    </div>
                    <div class="guide-legend-item">
                        <div class="guide-legend-icon" style="background:#1e2555;">&#11036;</div>
                        <span>Empty</span>
                    </div>
                </div>
            </div>
            <div class="guide-section">
                <h3>&#129302; AI Players</h3>
                <p>AI opponents make strategic choices with a dash of unpredictability. They'll try to grab treasures and avoid traps, but sometimes take risks!</p>
            </div>
            <div class="guide-section">
                <h3>&#128161; Tips</h3>
                <ul>
                    <li>Sometimes landing on a closer square is smarter than going far</li>
                    <li>Permanent bonuses are extremely valuable early on</li>
                    <li>Use the Shield to safely cross dangerous territory</li>
                    <li>Pinch or use +/- buttons to zoom the board</li>
                    <li>Tap squares during your choice phase to select</li>
                </ul>
            </div>
        `;
        showOverlay(html);
        document.getElementById('panel-close').addEventListener('click', hideOverlay);
    }

    function showWelcomeGuide(onContinue) {
        const html = `
            <div class="welcome-icon">&#127922;</div>
            <div class="welcome-text">Welcome to DRace!</div>
            <div class="welcome-sub">A strategic dice race battle. Would you like to learn how to play?</div>
            <div class="welcome-buttons">
                <button class="btn btn-primary" id="btn-yes-guide">
                    <span>&#128214;</span> Yes, Show Me!
                </button>
                <button class="btn btn-secondary" id="btn-no-guide">
                    No Thanks, Let's Race!
                </button>
            </div>
        `;
        showOverlay(html);
        // Remove overlay background click close for welcome
        overlay.onclick = null;

        document.getElementById('btn-yes-guide').addEventListener('click', () => {
            hideOverlay();
            Storage.setSeenGuide();
            setTimeout(() => {
                showHowToPlay();
                // After closing guide, continue
                const closeBtn = document.getElementById('panel-close');
                const origClose = closeBtn.onclick;
                closeBtn.onclick = null;
                closeBtn.addEventListener('click', () => {
                    hideOverlay();
                    if (onContinue) onContinue();
                });
            }, 100);
        });
        document.getElementById('btn-no-guide').addEventListener('click', () => {
            hideOverlay();
            Storage.setSeenGuide();
            if (onContinue) onContinue();
        });
    }

    function showEffectPanel(effect, playerName, onDismiss) {
        const catColors = {
            positive: 'var(--green)',
            negative: 'var(--red)',
            treasure: 'var(--gold)',
            neutral: 'var(--accent)',
        };
        const color = catColors[effect.category] || 'var(--accent)';

        const html = `
            <div class="effect-panel-icon">${effect.icon || '?'}</div>
            <div class="effect-panel-name" style="color:${color}">${effect.name}</div>
            <div class="effect-panel-desc">${effect.desc}</div>
            <button class="btn btn-primary effect-panel-btn" id="btn-effect-ok">OK</button>
        `;
        showOverlay(html);
        overlay.onclick = null;

        document.getElementById('btn-effect-ok').addEventListener('click', () => {
            hideOverlay();
            if (onDismiss) onDismiss();
        });
    }

    function showToast(message, type = 'info') {
        if (!message) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        toastContainer.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 2800);
    }

    function updatePlayerStats(players, currentIndex, totalSquares) {
        const bar = document.getElementById('player-stats-bar');
        bar.innerHTML = players.map((p, i) => `
            <div class="player-stat-chip ${i === currentIndex ? 'current' : ''}">
                <div class="player-avatar" style="background:${p.color}">${p.name.charAt(0)}</div>
                <span>${p.name}</span>
                <span class="stat-pos">${p.finished ? '&#127937;' : `${p.position}/${totalSquares - 1}`}</span>
                <span class="stat-treasure">&#128176;${p.treasure}</span>
            </div>
        `).join('');
    }

    function updateHUD(player, turn) {
        const avatar = document.getElementById('hud-avatar');
        const name = document.getElementById('hud-player-name');
        const turnEl = document.getElementById('turn-counter');

        avatar.style.background = player.color;
        avatar.textContent = player.name.charAt(0);
        name.textContent = player.name;
        turnEl.textContent = `Turn ${turn}`;
    }

    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    function setRollEnabled(enabled) {
        const btn = document.getElementById('btn-roll');
        btn.disabled = !enabled;
    }

    function showChoices(choices, squares, callback) {
        const area = document.getElementById('choice-area');
        const btns = document.getElementById('choice-buttons');
        const diceArea = document.getElementById('dice-area');

        diceArea.style.display = 'none';
        area.style.display = 'block';

        btns.innerHTML = choices.map(idx => {
            const sq = squares[idx];
            const eff = sq.effect;
            const cssClass = eff.category || 'neutral';
            const icon = eff.icon || (idx);
            const label = eff.id === 'empty' ? `Sq ${idx}` : eff.name;
            return `<button class="choice-btn ${cssClass}" data-idx="${idx}">
                <span class="sq-icon">${icon}</span>
                <span class="sq-label">${label}</span>
            </button>`;
        }).join('');

        btns.querySelectorAll('.choice-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                hideChoices();
                callback(idx);
            });
        });
    }

    function hideChoices() {
        const area = document.getElementById('choice-area');
        const diceArea = document.getElementById('dice-area');
        area.style.display = 'none';
        diceArea.style.display = 'flex';
    }

    function setupAIPreview(count) {
        const preview = document.getElementById('ai-players-preview');
        const names = AI_NAMES.slice(0, count - 1);
        preview.innerHTML = names.map((name, i) => `
            <div class="ai-preview-card">
                <div class="player-avatar" style="background:${PLAYER_COLORS[i + 1]}">${name.charAt(0)}</div>
                <div>
                    <div class="ai-name">${name}</div>
                    <div class="ai-diff">AI Opponent</div>
                </div>
            </div>
        `).join('');
    }

    return {
        showOverlay,
        hideOverlay,
        showSettings,
        showHowToPlay,
        showWelcomeGuide,
        showEffectPanel,
        showToast,
        updatePlayerStats,
        updateHUD,
        showScreen,
        setRollEnabled,
        showChoices,
        hideChoices,
        setupAIPreview
    };
})();
