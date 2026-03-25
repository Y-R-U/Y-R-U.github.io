/* ===== TRIAD CLASH - Game Engine ===== */

(function () {
    'use strict';

    // ===== CONSTANTS =====
    const CLASSES = ['warrior', 'archer', 'mage'];
    const CLASS_NAMES = { warrior: 'Warrior', archer: 'Archer', mage: 'Mage' };
    const ADVANTAGE = { warrior: 'archer', archer: 'mage', mage: 'warrior' };
    const CARDS_PER_CLASS = 4;
    const TOTAL_CARDS = CARDS_PER_CLASS * CLASSES.length; // 12
    const MAX_POWER = 10;
    const ADVANTAGE_MULTIPLIER = 3;
    const CRIT_CHANCE = 0.15;
    const SHIELD_CHANCE = 0.10;
    const AI_DELAY = 600;
    const ROUND_RESULT_DELAY = 1800;

    // ===== SVG CARD ART =====
    // Card SVGs use flat colors (no gradient IDs) to avoid conflicts with multiple cards
    const CARD_SVG = {
        warrior: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M32 4L36 28H28L32 4Z" fill="#e05555"/>
            <path d="M28 28h8v6h-8z" fill="#ff6b6b"/>
            <rect x="30" y="34" width="4" height="14" rx="1" fill="#a0392b"/>
            <path d="M24 48h16v3a2 2 0 01-2 2H26a2 2 0 01-2-2v-3z" fill="#ff6b6b"/>
            <circle cx="32" cy="28" r="3" fill="#ffd700" opacity="0.6"/>
            <path d="M26 20l-6-4m18 4l6-4" stroke="#ff6b6b" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
        </svg>`,
        archer: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 10C10 22 10 42 16 54" stroke="#51cf66" stroke-width="2.5" stroke-linecap="round" fill="none"/>
            <line x1="16" y1="32" x2="50" y2="32" stroke="#51cf66" stroke-width="2"/>
            <polygon points="50,32 44,28 44,36" fill="#51cf66"/>
            <line x1="16" y1="10" x2="16" y2="14" stroke="#51cf66" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="16" y1="50" x2="16" y2="54" stroke="#51cf66" stroke-width="1.5" stroke-linecap="round"/>
            <path d="M16 20l-2-2m2 24l-2 2" stroke="#51cf66" stroke-width="1" stroke-linecap="round" opacity="0.5"/>
            <circle cx="52" cy="32" r="2" fill="#ffd700" opacity="0.5"/>
            <path d="M38 30l4-8m-4 12l4 8" stroke="#27ae60" stroke-width="1" stroke-linecap="round" opacity="0.3"/>
        </svg>`,
        mage: `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="32" y1="20" x2="32" y2="56" stroke="#7c5ce0" stroke-width="3" stroke-linecap="round"/>
            <circle cx="32" cy="14" r="8" fill="none" stroke="#7c5ce0" stroke-width="2"/>
            <circle cx="32" cy="14" r="4" fill="#7c5ce0" opacity="0.6"/>
            <circle cx="32" cy="14" r="2" fill="#ffd700" opacity="0.8"/>
            <path d="M24 14c-4-6-2-10 0-12m16 12c4-6 2-10 0-12" stroke="#7c5ce0" stroke-width="1" stroke-linecap="round" opacity="0.4"/>
            <circle cx="26" cy="8" r="1.5" fill="#ffd700" opacity="0.3"/>
            <circle cx="38" cy="8" r="1.5" fill="#ffd700" opacity="0.3"/>
            <circle cx="32" cy="4" r="1" fill="#ffd700" opacity="0.4"/>
            <path d="M29 56h6" stroke="#5b3cc4" stroke-width="2" stroke-linecap="round"/>
        </svg>`
    };

    // ===== GAME STATE =====
    let state = {
        screen: 'start',
        humanCount: 1,
        aiCount: 1,
        players: [],
        round: 0,
        totalRounds: TOTAL_CARDS,
        playedCards: [],
        selectedCard: null,
        isResolving: false,
        isAllAI: false
    };

    // ===== DOM REFS =====
    const $ = id => document.getElementById(id);
    const screens = {
        start: $('start-screen'),
        game: $('game-screen'),
        result: $('result-screen')
    };

    // ===== HELPERS =====
    function shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    function generateDeck() {
        const deck = [];
        for (const cls of CLASSES) {
            for (let i = 0; i < CARDS_PER_CLASS; i++) {
                deck.push({
                    id: `${cls}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                    class: cls,
                    power: Math.floor(Math.random() * MAX_POWER) + 1
                });
            }
        }
        return shuffle(deck);
    }

    function getAdvantage(attacker, defender) {
        return ADVANTAGE[attacker] === defender;
    }

    function calcEffectivePower(card, opponents, effects) {
        let base = card.power;
        if (effects.critical) base *= 2;

        let totalEffective = 0;
        for (const opp of opponents) {
            let eff = base;
            if (getAdvantage(card.class, opp.card.class)) {
                eff *= ADVANTAGE_MULTIPLIER;
                effects.advantage = true;
            }
            // Shield: opponent's shield halves our power against them
            if (opp.effects.shield) {
                eff = Math.ceil(eff / 2);
            }
            totalEffective += eff;
        }
        return totalEffective;
    }

    // ===== UI HELPERS =====
    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
        state.screen = name;
        updatePlayButton();
    }

    function showModal(html) {
        $('modal-body').innerHTML = html;
        $('modal-overlay').classList.add('active');
    }

    function hideModal() {
        $('modal-overlay').classList.remove('active');
    }

    function showRoundResult(html) {
        $('round-result-content').innerHTML = html;
        $('round-result-overlay').classList.add('active');
    }

    function hideRoundResult() {
        $('round-result-overlay').classList.remove('active');
    }

    function showConfirm(title, message, onYes, onNo) {
        const overlay = document.createElement('div');
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-box animate-slide-up">
                <h3>${title}</h3>
                <p>${message}</p>
                <div class="confirm-buttons">
                    <button class="btn btn-secondary" data-action="no">Cancel</button>
                    <button class="btn btn-primary" data-action="yes">Confirm</button>
                </div>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('[data-action="yes"]').onclick = () => { overlay.remove(); onYes && onYes(); };
        overlay.querySelector('[data-action="no"]').onclick = () => { overlay.remove(); onNo && onNo(); };
    }

    function renderCard(card, extraClass = '') {
        return `
        <div class="card card-${card.class} ${extraClass}" data-card-id="${card.id}">
            <div class="card-inner">
                <div class="card-class-label">${CLASS_NAMES[card.class]}</div>
                <div class="card-art">${CARD_SVG[card.class]}</div>
                <div class="card-power">${card.power}</div>
            </div>
        </div>`;
    }

    function renderCardBack(extraClass = '') {
        return `<div class="card ${extraClass}"><div class="card-back"></div></div>`;
    }

    function getPlayerColor(index) {
        const colors = ['#ffd700', '#ff6b6b', '#51cf66', '#7c5ce0'];
        return colors[index % colors.length];
    }

    // ===== SCORES BAR =====
    function updateScoresBar() {
        const bar = $('scores-bar');
        bar.innerHTML = state.players.map((p, i) => `
            <div class="score-item">
                <div class="score-dot" style="background:${getPlayerColor(i)}"></div>
                <span>${p.name}:</span>
                <span class="score-value">${p.score}</span>
            </div>
        `).join('');
    }

    // ===== HAND RENDERING =====
    function renderHand() {
        const handArea = $('hand-area');
        const handCards = $('hand-cards');
        const remaining = $('cards-remaining');

        const humanPlayer = state.players.find(p => !p.isAI);
        if (!humanPlayer || state.isAllAI) {
            handArea.classList.add('hidden');
            return;
        }

        handArea.classList.remove('hidden');
        remaining.textContent = `(${humanPlayer.hand.length} left)`;
        handCards.innerHTML = humanPlayer.hand.map(card =>
            renderCard(card, state.selectedCard === card.id ? 'selected' : '')
        ).join('');

        handCards.querySelectorAll('.card').forEach(el => {
            el.addEventListener('click', () => {
                if (state.isResolving) return;
                const id = el.dataset.cardId;
                state.selectedCard = state.selectedCard === id ? null : id;
                renderHand();
            });
        });

        updatePlayButton();
    }

    // ===== BATTLE AREA =====
    function renderBattleArea(played, revealed) {
        const oppZone = $('opponent-zone');
        const playerZone = $('player-zone');
        const vsInd = $('vs-indicator');

        if (!played || played.length === 0) {
            oppZone.innerHTML = '';
            playerZone.innerHTML = '';
            vsInd.classList.remove('visible');
            return;
        }

        const humanIdx = state.players.findIndex(p => !p.isAI);

        let topCards = [];
        let bottomCards = [];

        played.forEach((p, i) => {
            if (i === humanIdx && !state.isAllAI) {
                bottomCards.push(p);
            } else {
                topCards.push(p);
            }
        });

        // If all AI, split top/bottom
        if (state.isAllAI) {
            topCards = played.slice(0, Math.ceil(played.length / 2));
            bottomCards = played.slice(Math.ceil(played.length / 2));
        }

        function renderBattleSlot(p, isRevealed) {
            const effects = p.effects || {};
            const effectTags = [];
            if (effects.critical) effectTags.push('<span class="battle-effect-tag effect-critical">CRIT x2</span>');
            if (effects.shield) effectTags.push('<span class="battle-effect-tag effect-shield">SHIELD</span>');
            if (effects.advantage) effectTags.push('<span class="battle-effect-tag effect-advantage">x3 ADV</span>');

            const winClass = p.isWinner ? 'card-winner' : (isRevealed && !p.isWinner && p.isWinner !== undefined ? 'card-loser' : '');

            if (isRevealed) {
                return `<div class="battle-card-wrapper">
                    <span class="battle-player-label">${p.playerName}</span>
                    ${renderCard(p.card, `battle-card card-flip ${winClass}`)}
                    <div class="battle-effective">${p.effectivePower !== undefined ? `EP: ${p.effectivePower}` : ''}</div>
                    <div>${effectTags.join('')}</div>
                </div>`;
            } else {
                return `<div class="battle-card-wrapper">
                    <span class="battle-player-label">${p.playerName}</span>
                    ${renderCardBack('battle-card')}
                    <div class="battle-effective"></div>
                </div>`;
            }
        }

        oppZone.innerHTML = topCards.map(p => renderBattleSlot(p, revealed)).join('');
        playerZone.innerHTML = bottomCards.map(p => renderBattleSlot(p, revealed)).join('');
        vsInd.classList.toggle('visible', played.length > 0);
    }

    // ===== AI LOGIC =====
    function aiSelectCard(player, knownPlayed) {
        const hand = player.hand;
        if (hand.length === 0) return null;

        // Simple AI: try to counter most common class if known, else pick strongest card sometimes
        if (Math.random() < 0.6) {
            // Pick strongest card
            return hand.reduce((best, c) => c.power > best.power ? c : best, hand[0]);
        } else {
            // Random pick
            return hand[Math.floor(Math.random() * hand.length)];
        }
    }

    // ===== ROUND RESOLUTION =====
    function resolveRound() {
        state.isResolving = true;
        const played = state.playedCards;

        // Roll effects for each
        played.forEach(p => {
            p.effects = {
                critical: Math.random() < CRIT_CHANCE,
                shield: Math.random() < SHIELD_CHANCE,
                advantage: false
            };
        });

        // Calculate effective power for each against all others
        played.forEach((p, i) => {
            const opponents = played.filter((_, j) => j !== i);
            p.effectivePower = calcEffectivePower(p.card, opponents, p.effects);
        });

        // Determine winner (highest EP)
        const maxEP = Math.max(...played.map(p => p.effectivePower));
        const winners = played.filter(p => p.effectivePower === maxEP);

        if (winners.length === 1) {
            winners[0].isWinner = true;
            state.players[winners[0].playerIndex].score++;
        } else {
            // Tie - all tied players are "winners" visually but no points
            winners.forEach(w => { w.isWinner = true; });
        }
        played.forEach(p => { if (!p.isWinner) p.isWinner = false; });

        // Show cards face up with animation
        renderBattleArea(played, true);
        updateScoresBar();

        // Show round result popup after a beat
        setTimeout(() => {
            const humanPlayer = state.players.find(p => !p.isAI);
            let title, titleClass, detail;

            if (winners.length > 1) {
                title = 'Draw!';
                titleClass = 'draw';
                detail = `Tie between ${winners.map(w => w.playerName).join(' & ')} (EP: ${maxEP})`;
            } else {
                const winner = winners[0];
                if (!state.isAllAI && humanPlayer && winner.playerIndex === state.players.indexOf(humanPlayer)) {
                    title = 'Victory!';
                    titleClass = 'win';
                } else {
                    title = `${winner.playerName} Wins!`;
                    titleClass = state.isAllAI ? 'win' : 'lose';
                }
                detail = `${winner.playerName}'s ${CLASS_NAMES[winner.card.class]} (Power ${winner.card.power}) with EP: ${winner.effectivePower}`;
            }

            const effectsSummary = played.map(p => {
                const tags = [];
                if (p.effects.critical) tags.push('CRIT');
                if (p.effects.shield) tags.push('SHIELD');
                if (p.effects.advantage) tags.push('x3 ADV');
                return tags.length > 0 ? `${p.playerName}: ${tags.join(', ')}` : '';
            }).filter(Boolean).join('<br>');

            showRoundResult(`
                <div class="round-result-title ${titleClass}">${title}</div>
                <div class="round-result-detail">${detail}</div>
                ${effectsSummary ? `<div class="round-result-detail" style="font-size:0.75rem;opacity:0.8">${effectsSummary}</div>` : ''}
                <button class="round-result-btn" id="btn-next-round">${state.round >= state.totalRounds ? 'Final Results' : 'Next Round'}</button>
            `);

            $('btn-next-round').addEventListener('click', () => {
                hideRoundResult();
                state.isResolving = false;
                state.playedCards = [];
                state.selectedCard = null;

                if (state.round >= state.totalRounds) {
                    showResults();
                } else {
                    renderBattleArea([], false);
                    renderHand();
                    if (state.isAllAI) {
                        setTimeout(() => playAIOnlyRound(), AI_DELAY);
                    }
                }
            });
        }, 800);
    }

    // ===== PLAY ROUND =====
    function playRound(humanCard) {
        state.round++;
        $('round-display').textContent = `Round ${state.round} / ${state.totalRounds}`;
        state.playedCards = [];

        state.players.forEach((player, idx) => {
            let card;
            if (!player.isAI && humanCard) {
                card = humanCard;
                player.hand = player.hand.filter(c => c.id !== card.id);
            } else if (player.isAI) {
                card = aiSelectCard(player, []);
                if (card) player.hand = player.hand.filter(c => c.id !== card.id);
            }
            if (card) {
                state.playedCards.push({
                    playerIndex: idx,
                    playerName: player.name,
                    card: card,
                    effects: {},
                    effectivePower: 0,
                    isWinner: undefined
                });
            }
        });

        // Show face-down first
        renderBattleArea(state.playedCards, false);

        // Then reveal
        setTimeout(() => resolveRound(), 700);
    }

    function playAIOnlyRound() {
        if (state.round >= state.totalRounds) {
            showResults();
            return;
        }
        playRound(null);
    }

    // ===== CONFIRM CARD PLAY =====
    function confirmPlay() {
        if (!state.selectedCard || state.isResolving) return;

        const humanPlayer = state.players.find(p => !p.isAI);
        const card = humanPlayer.hand.find(c => c.id === state.selectedCard);
        if (!card) return;

        state.isResolving = true;
        updatePlayButton();
        playRound(card);
    }

    // ===== SHOW RESULTS =====
    function showResults() {
        showScreen('result');

        const sorted = [...state.players].sort((a, b) => b.score - a.score);
        const topScore = sorted[0].score;
        const winners = sorted.filter(p => p.score === topScore);

        let titleText;
        if (winners.length > 1) {
            titleText = "It's a Tie!";
        } else if (!state.isAllAI && !winners[0].isAI) {
            titleText = 'You Win!';
        } else {
            titleText = `${winners[0].name} Wins!`;
        }

        $('result-title').textContent = titleText;
        $('final-scores').innerHTML = sorted.map((p, i) => `
            <div class="final-score-row ${p.score === topScore ? 'winner' : ''} animate-slide-up" style="animation-delay:${i * 0.1}s">
                <span class="final-score-name">
                    ${p.score === topScore ? '<span class="crown">👑</span>' : ''}
                    <span style="color:${getPlayerColor(state.players.indexOf(p))}">${p.name}</span>
                </span>
                <span class="final-score-pts">${p.score}</span>
            </div>
        `).join('');
    }

    // ===== GAME SETUP =====
    function startGame() {
        const totalPlayers = state.humanCount + state.aiCount;
        if (totalPlayers < 2) return;

        state.isAllAI = state.humanCount === 0;
        state.players = [];
        state.round = 0;
        state.totalRounds = TOTAL_CARDS;
        state.playedCards = [];
        state.selectedCard = null;
        state.isResolving = false;

        // Create players
        for (let i = 0; i < state.humanCount; i++) {
            state.players.push({
                name: state.humanCount === 1 ? 'You' : `Player ${i + 1}`,
                isAI: false,
                hand: generateDeck(),
                score: 0
            });
        }
        for (let i = 0; i < state.aiCount; i++) {
            const aiNames = ['Sentinel', 'Shadow', 'Oracle', 'Phantom'];
            state.players.push({
                name: aiNames[i] || `AI ${i + 1}`,
                isAI: true,
                hand: generateDeck(),
                score: 0
            });
        }

        showScreen('game');
        $('round-display').textContent = `Round 0 / ${state.totalRounds}`;
        updateScoresBar();
        renderBattleArea([], false);
        renderHand();

        // If all AI, start auto-play
        if (state.isAllAI) {
            $('hand-area').classList.add('hidden');
            setTimeout(() => playAIOnlyRound(), AI_DELAY);
        }
    }

    // ===== HOW TO PLAY =====
    function showHowToPlay() {
        showModal(`
            <h2>How to Play</h2>
            <h3>Objective</h3>
            <p>Win the most rounds out of 12 by playing cards strategically.</p>

            <h3>Card Classes</h3>
            <div class="triangle-diagram">
                <div class="triangle-row">
                    <span class="tri-warrior">Warrior</span>
                    <span class="tri-arrow">→ x3 →</span>
                    <span class="tri-archer">Archer</span>
                </div>
                <div class="triangle-row">
                    <span class="tri-archer">Archer</span>
                    <span class="tri-arrow">→ x3 →</span>
                    <span class="tri-mage">Mage</span>
                </div>
                <div class="triangle-row">
                    <span class="tri-mage">Mage</span>
                    <span class="tri-arrow">→ x3 →</span>
                    <span class="tri-warrior">Warrior</span>
                </div>
            </div>

            <h3>Power & Effective Power</h3>
            <ul>
                <li>Each card has a base power (1-10)</li>
                <li>Class advantage triples your base power against that opponent</li>
                <li>Your Effective Power (EP) is the sum of power against all opponents</li>
                <li>Highest EP wins the round</li>
            </ul>

            <h3>Special Effects</h3>
            <ul>
                <li><strong style="color:#ff6b6b">Critical Strike</strong> (15% chance) — Doubles base power before multipliers</li>
                <li><strong style="color:#51cf66">Shield</strong> (10% chance) — Halves opponents' effective power against you</li>
            </ul>

            <h3>How to Play</h3>
            <ul>
                <li>Tap a card in your hand to select it</li>
                <li>Tap the "Play Card" button to play your selection</li>
                <li>All players reveal simultaneously</li>
                <li>After 12 rounds, the player with the most wins is the champion!</li>
            </ul>
        `);
    }

    // ===== SETTINGS MODAL =====
    function showSettings() {
        showModal(`
            <h2>Settings</h2>
            <div class="settings-list">
                <div class="settings-item" id="settings-help">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3m.08 4h.01"/>
                    </svg>
                    <span class="settings-item-label">How to Play</span>
                </div>
                <div class="settings-item" id="settings-restart">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 4v6h6m16 10v-6h-6"/>
                        <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15"/>
                    </svg>
                    <span class="settings-item-label">Restart Game</span>
                </div>
                <div class="settings-item" id="settings-quit">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4m7 14l5-5-5-5m5 5H9"/>
                    </svg>
                    <span class="settings-item-label">Quit to Menu</span>
                </div>
            </div>
        `);

        setTimeout(() => {
            const helpBtn = $('settings-help');
            const restartBtn = $('settings-restart');
            const quitBtn = $('settings-quit');

            if (helpBtn) helpBtn.addEventListener('click', () => { hideModal(); setTimeout(showHowToPlay, 350); });
            if (restartBtn) restartBtn.addEventListener('click', () => {
                hideModal();
                showConfirm('Restart Game', 'Are you sure you want to restart?', () => startGame());
            });
            if (quitBtn) quitBtn.addEventListener('click', () => {
                hideModal();
                showConfirm('Quit Game', 'Return to main menu? Current progress will be lost.', () => {
                    hideRoundResult();
                    showScreen('start');
                });
            });
        }, 50);
    }

    // ===== PLAYER CONFIG =====
    function updatePlayerConfig() {
        $('human-count').textContent = state.humanCount;
        $('ai-count').textContent = state.aiCount;
        const total = state.humanCount + state.aiCount;
        let info = `${total} player${total !== 1 ? 's' : ''} total`;
        if (state.humanCount === 0) info += ' (AI spectate mode)';
        $('player-info').textContent = info;
    }

    // ===== PLAY BUTTON =====
    let playBtn = null;

    function updatePlayButton() {
        if (!playBtn) return;
        const show = state.screen === 'game' && state.selectedCard && !state.isResolving && !state.isAllAI;
        playBtn.style.opacity = show ? '1' : '0';
        playBtn.style.pointerEvents = show ? 'auto' : 'none';
    }

    function createPlayButton() {
        if (playBtn) return;
        playBtn = document.createElement('button');
        playBtn.className = 'btn btn-primary play-card-btn';
        playBtn.textContent = 'Play Card';
        playBtn.style.cssText = 'position:fixed;bottom:180px;left:50%;transform:translateX(-50%);z-index:20;padding:10px 32px;font-size:0.9rem;opacity:0;pointer-events:none;transition:all 0.3s ease;';
        document.body.appendChild(playBtn);
        playBtn.addEventListener('click', confirmPlay);
    }

    // ===== EVENT LISTENERS =====
    function init() {
        // Player config buttons
        document.querySelectorAll('.counter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const target = btn.dataset.target;
                const dir = parseInt(btn.dataset.dir);

                if (target === 'humans') {
                    state.humanCount = Math.max(0, Math.min(1, state.humanCount + dir));
                } else {
                    state.aiCount = Math.max(1, Math.min(3, state.aiCount + dir));
                    // Ensure min 2 total if human = 0
                    if (state.humanCount === 0 && state.aiCount < 2) state.aiCount = 2;
                }

                // Ensure at least 2 players
                const total = state.humanCount + state.aiCount;
                if (total < 2) {
                    if (target === 'humans') state.aiCount = Math.max(state.aiCount, 2 - state.humanCount);
                    else state.humanCount = Math.max(state.humanCount, 2 - state.aiCount);
                }

                updatePlayerConfig();
            });
        });

        // Start buttons
        $('btn-play').addEventListener('click', startGame);
        $('btn-how-to-play').addEventListener('click', showHowToPlay);

        // Settings
        $('btn-settings').addEventListener('click', showSettings);

        // Modal close
        $('modal-close').addEventListener('click', hideModal);
        $('modal-overlay').addEventListener('click', e => {
            if (e.target === $('modal-overlay')) hideModal();
        });

        // Result screen buttons
        $('btn-play-again').addEventListener('click', startGame);
        $('btn-main-menu').addEventListener('click', () => showScreen('start'));

        // Play button
        createPlayButton();

        // Initial config
        updatePlayerConfig();

        // Register service worker
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
    }

    // Boot
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
