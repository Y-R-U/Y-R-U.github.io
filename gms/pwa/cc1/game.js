/* ===== TRIAD CLASH - Game Engine (Complete Rewrite) ===== */

(function () {
    'use strict';

    // ===== CONSTANTS =====
    const CLASSES = ['warrior', 'archer', 'mage'];
    const CLASS_NAMES = { warrior: 'Warrior', archer: 'Archer', mage: 'Mage' };
    const ADVANTAGE = { warrior: 'archer', archer: 'mage', mage: 'warrior' };
    const CARDS_PER_CLASS = 4;
    const TOTAL_CARDS = CARDS_PER_CLASS * CLASSES.length;
    const MAX_POWER = 10;
    const ADVANTAGE_MULTIPLIER = 3;
    const BASE_CRIT_CHANCE = 0.15;
    const BASE_SHIELD_CHANCE = 0.10;
    const AI_DELAY = 600;

    // ===== CARD IMAGES (external files in images/) =====
    const CARD_IMAGES = {
        warrior: 'images/warrior.jpg',
        archer: 'images/archer.jpg',
        mage: 'images/mage.jpg'
    };

    // ===== CHARACTER POOL =====
    const CHARACTERS = {
        warrior: [
            { name: 'Kael', title: 'Iron Knight', desc: 'Stalwart defender of the realm', ability: { name: 'Iron Will', effect: 'shieldBonus', value: 0.20, desc: '+20% shield chance' } },
            { name: 'Diliah', title: 'Elven Blade', desc: 'Swift strikes, deadly precision', ability: { name: 'Cleave', effect: 'powerVsClass', targetClass: 'archer', value: 2, desc: '+2 power vs Archers' } },
            { name: 'Grimjaw', title: 'Dwarf Berserker', desc: 'Rage fuels his strength', ability: null },
            { name: 'Seraphina', title: 'Holy Paladin', desc: 'Light shields her allies', ability: { name: 'Divine Shield', effect: 'shieldBonus', value: 0.25, desc: '+25% shield chance' } },
            { name: 'Vorn', title: 'Shadow Blade', desc: 'Strikes from darkness', ability: { name: 'Ambush', effect: 'critBonus', value: 0.15, desc: '+15% crit chance' } },
            { name: 'Brynn', title: 'Shield Maiden', desc: 'Unbreakable resolve', ability: null }
        ],
        archer: [
            { name: 'Lyra', title: 'Moon Ranger', desc: 'Her arrows fly true by moonlight', ability: { name: 'Piercing Shot', effect: 'ignoreShield', desc: 'Ignores opponent shield' } },
            { name: 'Thornwick', title: 'Forest Sentinel', desc: 'One with the ancient woods', ability: null },
            { name: 'Zara', title: 'Desert Hawk', desc: 'Strikes like desert wind', ability: { name: 'Quick Draw', effect: 'critBonus', value: 0.20, desc: '+20% crit chance' } },
            { name: 'Fenris', title: 'Wolf Hunter', desc: 'His wolf companion never misses', ability: null },
            { name: 'Aelith', title: 'Wind Archer', desc: 'Arrows guided by the wind', ability: { name: 'Gale Force', effect: 'powerBonus', value: 1, desc: '+1 power always' } },
            { name: 'Rook', title: 'Crossbow Veteran', desc: 'Heavy bolts, heavy damage', ability: { name: 'Heavy Bolt', effect: 'powerVsClass', targetClass: 'mage', value: 2, desc: '+2 power vs Mages' } }
        ],
        mage: [
            { name: 'Azuriel', title: 'Storm Weaver', desc: 'Commands lightning and thunder', ability: { name: 'Overcharge', effect: 'critBonus', value: 0.20, desc: '+20% crit chance' } },
            { name: 'Morgath', title: 'Dark Conjurer', desc: 'Shadows do his bidding', ability: { name: 'Hex', effect: 'opponentPowerLoss', value: 1, desc: 'Opponent loses 1 power' } },
            { name: 'Elara', title: 'Crystal Sage', desc: 'Ancient wisdom flows through her', ability: null },
            { name: 'Ignis', title: 'Flame Sorcerer', desc: 'Fire bends to her will', ability: { name: 'Inferno', effect: 'powerVsClass', targetClass: 'warrior', value: 2, desc: '+2 power vs Warriors' } },
            { name: 'Nyxara', title: 'Void Witch', desc: 'The void answers her call', ability: { name: 'Void Shield', effect: 'shieldBonus', value: 0.25, desc: '+25% shield chance' } },
            { name: 'Thalos', title: 'Frost Mage', desc: 'Freezes foes in their tracks', ability: null }
        ]
    };

    // ===== DETAILED SVG CARD ART (fallback) =====
    const CARD_SVG = {
        warrior: `<svg viewBox="0 0 150 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="wg1" cx="50%" cy="30%"><stop offset="0%" stop-color="#4a1a1a"/><stop offset="100%" stop-color="#1a0a0a"/></radialGradient>
            </defs>
            <rect width="150" height="200" fill="url(#wg1)"/>
            <!-- Ground -->
            <ellipse cx="75" cy="185" rx="50" ry="8" fill="#2a0a0a" opacity="0.5"/>
            <!-- Legs -->
            <path d="M62 145 L58 175 L52 178 L64 178 L66 155 Z" fill="#8b4513"/>
            <path d="M88 145 L92 175 L98 178 L86 178 L84 155 Z" fill="#7a3c11"/>
            <!-- Body armor -->
            <path d="M55 90 L60 145 L90 145 L95 90 Q75 80 55 90Z" fill="#c0392b"/>
            <path d="M60 95 L65 140 L85 140 L90 95 Q75 88 60 95Z" fill="#a93226"/>
            <!-- Armor details -->
            <line x1="75" y1="95" x2="75" y2="140" stroke="#8b1a1a" stroke-width="1" opacity="0.5"/>
            <path d="M63 105 Q75 100 87 105" stroke="#ffd700" stroke-width="0.8" fill="none" opacity="0.6"/>
            <path d="M65 115 Q75 112 85 115" stroke="#ffd700" stroke-width="0.5" fill="none" opacity="0.4"/>
            <!-- Belt -->
            <rect x="58" y="135" width="34" height="5" rx="1" fill="#8b4513"/>
            <rect x="72" y="134" width="6" height="7" rx="1" fill="#ffd700" opacity="0.7"/>
            <!-- Cape -->
            <path d="M55 90 Q40 120 45 175 L35 180 Q30 130 48 85Z" fill="#e74c3c" opacity="0.6"/>
            <path d="M95 90 Q110 120 105 175 L115 180 Q120 130 102 85Z" fill="#c0392b" opacity="0.5"/>
            <!-- Arms -->
            <path d="M55 92 L38 120 L42 122 L58 98Z" fill="#c0392b"/>
            <path d="M95 92 L108 115 L112 108 L98 90Z" fill="#a93226"/>
            <!-- Sword (right hand) -->
            <rect x="109" y="45" width="3" height="65" rx="1" fill="#bdc3c7" transform="rotate(15, 110, 80)"/>
            <rect x="107" y="105" width="7" height="3" rx="1" fill="#ffd700" transform="rotate(15, 110, 80)"/>
            <rect x="108.5" y="108" width="4" height="10" rx="1" fill="#8b4513" transform="rotate(15, 110, 80)"/>
            <path d="M109 45 L110.5 38 L112 45Z" fill="#ecf0f1" transform="rotate(15, 110, 80)"/>
            <!-- Shield (left hand) -->
            <ellipse cx="35" cy="118" rx="14" ry="18" fill="#c0392b" stroke="#ffd700" stroke-width="1.5"/>
            <ellipse cx="35" cy="118" rx="8" ry="11" fill="none" stroke="#ffd700" stroke-width="0.8" opacity="0.5"/>
            <circle cx="35" cy="118" r="3" fill="#ffd700" opacity="0.6"/>
            <!-- Head -->
            <circle cx="75" cy="72" r="16" fill="#e8b89a"/>
            <!-- Helmet -->
            <path d="M59 72 Q60 48 75 44 Q90 48 91 72" fill="#a93226"/>
            <path d="M59 72 L91 72" stroke="#ffd700" stroke-width="2"/>
            <rect x="72" y="44" width="6" height="8" rx="1" fill="#ffd700" opacity="0.7"/>
            <!-- Face -->
            <ellipse cx="68" cy="72" rx="2" ry="2" fill="#2c1810"/>
            <ellipse cx="82" cy="72" rx="2" ry="2" fill="#2c1810"/>
            <path d="M72 78 Q75 80 78 78" stroke="#c0846e" stroke-width="1" fill="none"/>
            <!-- Glow effects -->
            <circle cx="35" cy="118" r="18" fill="#ff6b6b" opacity="0.08"/>
            <circle cx="110" cy="60" r="12" fill="#ffd700" opacity="0.06"/>
        </svg>`,
        archer: `<svg viewBox="0 0 150 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="ag1" cx="50%" cy="30%"><stop offset="0%" stop-color="#0a2a0a"/><stop offset="100%" stop-color="#050f05"/></radialGradient>
            </defs>
            <rect width="150" height="200" fill="url(#ag1)"/>
            <!-- Moon -->
            <circle cx="120" cy="25" r="12" fill="#e8e8c8" opacity="0.3"/>
            <circle cx="123" cy="23" r="10" fill="#0a2a0a" opacity="0.3"/>
            <!-- Trees bg -->
            <path d="M10 190 L15 120 L20 190Z" fill="#0d1f0d" opacity="0.4"/>
            <path d="M130 190 L135 130 L140 190Z" fill="#0d1f0d" opacity="0.3"/>
            <!-- Ground -->
            <ellipse cx="75" cy="188" rx="55" ry="8" fill="#0d1f0d" opacity="0.5"/>
            <!-- Legs -->
            <path d="M65 148 L60 178 L55 180 L67 180 L69 155Z" fill="#3d2817"/>
            <path d="M85 148 L90 175 L95 178 L83 178 L81 155Z" fill="#362212"/>
            <!-- Body -->
            <path d="M58 92 L62 148 L88 148 L92 92 Q75 82 58 92Z" fill="#27ae60"/>
            <path d="M63 97 L66 143 L84 143 L87 97 Q75 90 63 97Z" fill="#1e8449"/>
            <!-- Cloak -->
            <path d="M56 88 Q42 130 48 185 L38 188 Q32 125 50 82Z" fill="#1a6b37" opacity="0.7"/>
            <path d="M94 88 Q108 130 102 185 L112 188 Q118 125 100 82Z" fill="#156b2f" opacity="0.6"/>
            <!-- Hood -->
            <path d="M56 85 Q55 55 75 48 Q95 55 94 85 L75 78Z" fill="#1a6b37"/>
            <!-- Face (shadowed under hood) -->
            <circle cx="75" cy="72" r="13" fill="#d4a574"/>
            <path d="M62 72 Q63 55 75 52 Q87 55 88 72" fill="#1e8449"/>
            <ellipse cx="69" cy="72" rx="2" ry="1.5" fill="#1a3a1a"/>
            <ellipse cx="81" cy="72" rx="2" ry="1.5" fill="#1a3a1a"/>
            <path d="M72 77 Q75 79 78 77" stroke="#b8956a" stroke-width="0.8" fill="none"/>
            <!-- Arms -->
            <path d="M58 95 L35 115 L38 118 L60 100Z" fill="#27ae60"/>
            <path d="M92 95 L115 108 L112 112 L90 100Z" fill="#1e8449"/>
            <!-- Bow (left hand) -->
            <path d="M28 80 Q22 115 28 150" stroke="#8B6914" stroke-width="3" fill="none" stroke-linecap="round"/>
            <line x1="28" y1="80" x2="28" y2="150" stroke="#c8b87a" stroke-width="0.8"/>
            <!-- Arrow -->
            <line x1="28" y1="115" x2="108" y2="108" stroke="#8B6914" stroke-width="2"/>
            <polygon points="108,108 102,104 102,112" fill="#bdc3c7"/>
            <!-- Fletching -->
            <path d="M30 113 L22 108 L30 115 L22 120 L30 117" fill="#51cf66" opacity="0.5"/>
            <!-- Quiver on back -->
            <rect x="82" y="88" width="8" height="35" rx="2" fill="#5a3a1a" transform="rotate(-10,86,105)"/>
            <line x1="84" y1="86" x2="82" y2="80" stroke="#8B6914" stroke-width="1.5" transform="rotate(-10,86,105)"/>
            <line x1="86" y1="86" x2="85" y2="78" stroke="#8B6914" stroke-width="1.5" transform="rotate(-10,86,105)"/>
            <line x1="88" y1="86" x2="88" y2="79" stroke="#8B6914" stroke-width="1.5" transform="rotate(-10,86,105)"/>
            <!-- Glow -->
            <circle cx="108" cy="108" r="5" fill="#51cf66" opacity="0.15"/>
            <circle cx="120" cy="25" r="20" fill="#e8e8c8" opacity="0.04"/>
        </svg>`,
        mage: `<svg viewBox="0 0 150 200" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="mg1" cx="50%" cy="20%"><stop offset="0%" stop-color="#1f0a3a"/><stop offset="100%" stop-color="#0a0515"/></radialGradient>
            </defs>
            <rect width="150" height="200" fill="url(#mg1)"/>
            <!-- Magical particles -->
            <circle cx="30" cy="40" r="1.5" fill="#7c5ce0" opacity="0.4"><animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite"/></circle>
            <circle cx="120" cy="60" r="1" fill="#ffd700" opacity="0.3"><animate attributeName="opacity" values="0.3;0.1;0.3" dur="3s" repeatCount="indefinite"/></circle>
            <circle cx="45" cy="130" r="1" fill="#a78bfa" opacity="0.3"><animate attributeName="opacity" values="0.3;0.05;0.3" dur="2.5s" repeatCount="indefinite"/></circle>
            <circle cx="110" cy="150" r="1.5" fill="#7c5ce0" opacity="0.2"><animate attributeName="opacity" values="0.2;0.05;0.2" dur="1.8s" repeatCount="indefinite"/></circle>
            <!-- Ground -->
            <ellipse cx="75" cy="188" rx="50" ry="8" fill="#15082a" opacity="0.5"/>
            <!-- Robe -->
            <path d="M50 90 L40 185 L110 185 L100 90 Q75 78 50 90Z" fill="#5b3cc4"/>
            <path d="M55 95 L48 180 L102 180 L95 95 Q75 85 55 95Z" fill="#4a2fa8"/>
            <!-- Robe details -->
            <path d="M75 95 L72 180" stroke="#3a1f8a" stroke-width="0.8" opacity="0.5"/>
            <path d="M75 95 L78 180" stroke="#3a1f8a" stroke-width="0.8" opacity="0.5"/>
            <path d="M55 120 Q75 115 95 120" stroke="#ffd700" stroke-width="0.6" fill="none" opacity="0.4"/>
            <path d="M52 145 Q75 140 98 145" stroke="#ffd700" stroke-width="0.5" fill="none" opacity="0.3"/>
            <!-- Belt/sash -->
            <path d="M55 130 Q75 126 95 130" stroke="#ffd700" stroke-width="2" fill="none"/>
            <circle cx="75" cy="128" r="3" fill="#ffd700" opacity="0.6"/>
            <!-- Arms in robe -->
            <path d="M50 95 L25 125 L30 130 L55 105Z" fill="#5b3cc4"/>
            <path d="M100 95 L120 115 L115 120 L95 102Z" fill="#4a2fa8"/>
            <!-- Staff (right hand) -->
            <line x1="118" y1="30" x2="115" y2="185" stroke="#6b4423" stroke-width="3.5" stroke-linecap="round"/>
            <line x1="118" y1="30" x2="115" y2="185" stroke="#8b5a33" stroke-width="2" stroke-linecap="round"/>
            <!-- Crystal on staff -->
            <polygon points="118,30 112,18 118,6 124,18" fill="#7c5ce0" stroke="#a78bfa" stroke-width="1"/>
            <polygon points="118,30 112,18 118,6 124,18" fill="#9b7ae8" opacity="0.5"/>
            <circle cx="118" cy="18" r="4" fill="#ffd700" opacity="0.6"/>
            <!-- Crystal glow -->
            <circle cx="118" cy="18" r="12" fill="#7c5ce0" opacity="0.12"><animate attributeName="r" values="12;16;12" dur="2s" repeatCount="indefinite"/></circle>
            <circle cx="118" cy="18" r="8" fill="#a78bfa" opacity="0.08"><animate attributeName="r" values="8;11;8" dur="1.5s" repeatCount="indefinite"/></circle>
            <!-- Arcane energy swirls -->
            <path d="M118 18 Q100 5 90 20 Q85 35 95 30" stroke="#7c5ce0" stroke-width="1" fill="none" opacity="0.3"><animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite"/></path>
            <path d="M118 18 Q130 0 135 15 Q140 30 130 28" stroke="#a78bfa" stroke-width="0.8" fill="none" opacity="0.25"><animate attributeName="opacity" values="0.25;0.08;0.25" dur="2.5s" repeatCount="indefinite"/></path>
            <!-- Spell hand (left) -->
            <circle cx="28" cy="125" r="6" fill="#7c5ce0" opacity="0.15"><animate attributeName="r" values="6;9;6" dur="1.8s" repeatCount="indefinite"/></circle>
            <circle cx="28" cy="125" r="3" fill="#a78bfa" opacity="0.2"/>
            <!-- Head -->
            <circle cx="75" cy="68" r="14" fill="#d4b8e8"/>
            <!-- Hood/hat -->
            <path d="M58 75 Q55 50 75 30 Q95 50 92 75Z" fill="#5b3cc4"/>
            <path d="M60 75 Q58 52 75 34 Q92 52 90 75Z" fill="#4a2fa8"/>
            <!-- Hat tip -->
            <path d="M75 30 L82 10 Q78 15 75 30Z" fill="#5b3cc4"/>
            <circle cx="82" cy="10" r="2" fill="#ffd700" opacity="0.5"/>
            <!-- Face -->
            <ellipse cx="69" cy="70" rx="2" ry="2" fill="#2a1050"/>
            <ellipse cx="81" cy="70" rx="2" ry="2" fill="#2a1050"/>
            <!-- Glowing eyes -->
            <circle cx="69" cy="70" r="1" fill="#a78bfa" opacity="0.6"/>
            <circle cx="81" cy="70" r="1" fill="#a78bfa" opacity="0.6"/>
            <path d="M72 76 Q75 78 78 76" stroke="#c4a8e8" stroke-width="0.8" fill="none"/>
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
        isAllAI: false,
        lastRoundResult: null
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

    function pickRandom(arr) {
        return arr[Math.floor(Math.random() * arr.length)];
    }

    function generateDeck() {
        const deck = [];
        for (const cls of CLASSES) {
            const pool = [...CHARACTERS[cls]];
            shuffle(pool);
            for (let i = 0; i < CARDS_PER_CLASS; i++) {
                const character = pool[i % pool.length];
                deck.push({
                    id: `${cls}-${i}-${Math.random().toString(36).slice(2, 6)}`,
                    class: cls,
                    power: Math.floor(Math.random() * MAX_POWER) + 1,
                    character: character
                });
            }
        }
        return shuffle(deck);
    }

    function getAdvantage(attacker, defender) {
        return ADVANTAGE[attacker] === defender;
    }

    function getPlayerColor(index) {
        const colors = ['#ffd700', '#ff6b6b', '#51cf66', '#7c5ce0'];
        return colors[index % colors.length];
    }

    // ===== COMBAT RESOLUTION =====
    function resolveCombat(playedCards) {
        // Roll effects for each card, taking abilities into account
        playedCards.forEach(p => {
            const ability = p.card.character.ability;
            let critChance = BASE_CRIT_CHANCE;
            let shieldChance = BASE_SHIELD_CHANCE;

            if (ability) {
                if (ability.effect === 'critBonus') critChance += ability.value;
                if (ability.effect === 'shieldBonus') shieldChance += ability.value;
            }

            p.effects = {
                critical: Math.random() < critChance,
                shield: Math.random() < shieldChance,
                advantage: false,
                abilityActive: false
            };
        });

        // Calculate pairwise wins for each card
        playedCards.forEach((p, i) => {
            let wins = 0;
            const ability = p.card.character.ability;

            playedCards.forEach((opp, j) => {
                if (i === j) return;

                let myPower = p.card.power;
                let oppPower = opp.card.power;

                // Apply power bonuses from abilities
                if (ability) {
                    if (ability.effect === 'powerBonus') {
                        myPower += ability.value;
                        p.effects.abilityActive = true;
                    }
                    if (ability.effect === 'powerVsClass' && opp.card.class === ability.targetClass) {
                        myPower += ability.value;
                        p.effects.abilityActive = true;
                    }
                }

                // Apply opponent's Hex ability (opponent loses 1 power)
                const oppAbility = opp.card.character.ability;
                if (oppAbility && oppAbility.effect === 'opponentPowerLoss') {
                    myPower = Math.max(1, myPower - oppAbility.value);
                }

                // Crit doubles base power
                if (p.effects.critical) myPower *= 2;
                if (opp.effects.critical) oppPower *= 2;

                // Class advantage
                let myEffective = myPower;
                let oppEffective = oppPower;

                if (getAdvantage(p.card.class, opp.card.class)) {
                    myEffective *= ADVANTAGE_MULTIPLIER;
                    p.effects.advantage = true;
                }
                if (getAdvantage(opp.card.class, p.card.class)) {
                    oppEffective *= ADVANTAGE_MULTIPLIER;
                }

                // Shield: halves opponent's effective power against shielded card
                if (p.effects.shield) {
                    // Check if opponent has Piercing Shot (ignores shield)
                    const oppAb = opp.card.character.ability;
                    if (!oppAb || oppAb.effect !== 'ignoreShield') {
                        oppEffective = Math.ceil(oppEffective / 2);
                    }
                }
                if (opp.effects.shield) {
                    // Check if we have Piercing Shot
                    if (ability && ability.effect === 'ignoreShield') {
                        // We ignore their shield
                        p.effects.abilityActive = true;
                    } else {
                        myEffective = Math.ceil(myEffective / 2);
                    }
                }

                if (myEffective > oppEffective) wins++;
            });

            p.pairwiseWins = wins;
        });

        // Determine round winner: most pairwise wins
        const maxWins = Math.max(...playedCards.map(p => p.pairwiseWins));
        const winners = playedCards.filter(p => p.pairwiseWins === maxWins);

        if (winners.length === 1) {
            winners[0].isWinner = true;
            state.players[winners[0].playerIndex].score++;
        } else {
            // Tie - no points awarded
            winners.forEach(w => { w.isWinner = true; });
        }
        playedCards.forEach(p => { if (!p.isWinner) p.isWinner = false; });

        return { maxWins, winners, isTie: winners.length > 1 };
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

    function showConfirm(title, message, onYes) {
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
        overlay.querySelector('[data-action="yes"]').onclick = () => { overlay.remove(); if (onYes) onYes(); };
        overlay.querySelector('[data-action="no"]').onclick = () => { overlay.remove(); };
    }

    function showAbilityPopup(card) {
        const ability = card.character.ability;
        if (!ability) return;

        const classColor = card.class === 'warrior' ? 'var(--warrior-primary)' :
            card.class === 'archer' ? 'var(--archer-primary)' : 'var(--mage-primary)';

        const overlay = document.createElement('div');
        overlay.className = 'ability-popup-overlay';
        overlay.innerHTML = `
            <div class="ability-popup">
                <div class="ability-popup-title" style="color:${classColor}">${ability.name}</div>
                <div class="ability-popup-name">${card.character.name}, ${card.character.title}</div>
                <div class="ability-popup-desc">${ability.desc}</div>
                <button class="ability-popup-close">Got it</button>
            </div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('.ability-popup-close').onclick = () => overlay.remove();
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    }

    // ===== CARD RENDERING =====
    function getCardImageContent(cls) {
        if (CARD_IMAGES[cls]) {
            return `<img src="${CARD_IMAGES[cls]}" alt="${CLASS_NAMES[cls]}" style="width:100%;height:100%;"/>`;
        }
        return CARD_SVG[cls];
    }

    function renderCard(card, extraClass = '', overlay = '') {
        const char = card.character;
        const ability = char.ability;
        const fullName = `${char.name}, ${char.title}`;
        const abilityBadge = ability
            ? `<div class="card-ability-badge" data-ability-card='${JSON.stringify({ class: card.class, character: char }).replace(/'/g, "&#39;")}'>
                   <span class="ability-icon">&#9733;</span> ${ability.name}
               </div>`
            : `<div class="card-no-ability">- - -</div>`;

        return `
        <div class="card card-${card.class} ${extraClass}" data-card-id="${card.id}">
            <div class="card-inner">
                <div class="card-header">
                    <div class="card-power-circle">${card.power}</div>
                    <div class="card-name">${fullName}</div>
                </div>
                <div class="card-image-frame">${getCardImageContent(card.class)}${overlay}</div>
                <div class="card-desc">${char.desc}</div>
                ${abilityBadge}
            </div>
        </div>`;
    }

    function renderCardBack(extraClass = '') {
        return `<div class="card ${extraClass}"><div class="card-back"></div></div>`;
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

        // Card selection
        handCards.querySelectorAll('.card').forEach(el => {
            el.addEventListener('click', (e) => {
                // Don't select if they clicked the ability badge
                if (e.target.closest('.card-ability-badge')) return;
                if (state.isResolving) return;
                const id = el.dataset.cardId;
                state.selectedCard = state.selectedCard === id ? null : id;
                renderHand();
            });
        });

        // Ability badge clicks
        handCards.querySelectorAll('.card-ability-badge').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                try {
                    const data = JSON.parse(el.dataset.abilityCard);
                    showAbilityPopup({ class: data.class, character: data.character });
                } catch (err) { /* ignore */ }
            });
        });

        updatePlayButton();
    }

    // ===== BATTLE AREA =====
    function renderBattleArea(played, revealed, isTie) {
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

        if (state.isAllAI) {
            topCards = played.slice(0, Math.ceil(played.length / 2));
            bottomCards = played.slice(Math.ceil(played.length / 2));
        }

        function renderBattleSlot(p, isRevealed, isTie) {
            const effects = p.effects || {};
            const effectTags = [];
            if (effects.critical) effectTags.push('<span class="battle-effect-tag effect-critical">CRIT x2</span>');
            if (effects.shield) effectTags.push('<span class="battle-effect-tag effect-shield">SHIELD</span>');
            if (effects.advantage) effectTags.push('<span class="battle-effect-tag effect-advantage">x3 ADV</span>');

            const winClass = p.isWinner === true ? 'card-winner' : (isRevealed && p.isWinner === false ? 'card-loser' : '');

            // WIN/TIE overlay on the card image
            let resultOverlay = '';
            if (isRevealed && p.isWinner === true) {
                const label = isTie ? 'TIE' : 'WIN';
                const overlayClass = isTie ? 'card-result-tie' : 'card-result-win';
                resultOverlay = `<div class="card-result-overlay ${overlayClass}">${label}</div>`;
            }

            if (isRevealed) {
                const resultAttr = resultOverlay ? ` data-result="${isTie ? 'TIE' : 'WIN'}"` : '';
                return `<div class="battle-card-wrapper">
                    <span class="battle-player-label">${p.playerName}</span>
                    ${renderCard(p.card, `battle-card card-flip ${winClass}`, resultOverlay)}
                    <div class="battle-effective">${p.pairwiseWins !== undefined ? `Wins: ${p.pairwiseWins}` : ''}</div>
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

        oppZone.innerHTML = topCards.map(p => renderBattleSlot(p, revealed, isTie)).join('');
        playerZone.innerHTML = bottomCards.map(p => renderBattleSlot(p, revealed, isTie)).join('');
        vsInd.classList.toggle('visible', played.length > 0);

        // Attach ability badge listeners in battle area
        if (revealed) {
            document.querySelectorAll('.battle-area .card-ability-badge').forEach(el => {
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    try {
                        const data = JSON.parse(el.dataset.abilityCard);
                        showAbilityPopup({ class: data.class, character: data.character });
                    } catch (err) { /* ignore */ }
                });
            });
        }
    }

    // ===== AI LOGIC =====
    function aiSelectCard(player) {
        const hand = player.hand;
        if (hand.length === 0) return null;

        if (Math.random() < 0.5) {
            // Pick strongest card
            return hand.reduce((best, c) => c.power > best.power ? c : best, hand[0]);
        } else if (Math.random() < 0.5) {
            // Pick a card with an ability if possible
            const withAbility = hand.filter(c => c.character.ability);
            if (withAbility.length > 0) return pickRandom(withAbility);
        }
        return pickRandom(hand);
    }

    // ===== ROUND RESOLUTION =====
    function buildRoundDetailHTML(played, result) {
        const humanPlayer = state.players.find(p => !p.isAI);
        let title, titleClass, detail;

        if (result.isTie) {
            title = 'Draw!';
            titleClass = 'draw';
            detail = `Tie between ${result.winners.map(w => w.playerName).join(' & ')} (${result.maxWins} wins each)`;
        } else {
            const winner = result.winners[0];
            const wChar = winner.card.character;
            if (!state.isAllAI && humanPlayer && winner.playerIndex === state.players.indexOf(humanPlayer)) {
                title = 'Victory!';
                titleClass = 'win';
            } else {
                title = `${winner.playerName} Wins!`;
                titleClass = state.isAllAI ? 'win' : 'lose';
            }
            detail = `${winner.playerName}'s ${wChar.name} the ${CLASS_NAMES[winner.card.class]} (Power ${winner.card.power}) with ${winner.pairwiseWins} pairwise wins`;
        }

        const effectsSummary = played.map(p => {
            const tags = [];
            if (p.effects.critical) tags.push('CRIT');
            if (p.effects.shield) tags.push('SHIELD');
            if (p.effects.advantage) tags.push('x3 ADV');
            if (p.effects.abilityActive && p.card.character.ability) tags.push(p.card.character.ability.name);
            return tags.length > 0 ? `${p.playerName}: ${tags.join(', ')}` : '';
        }).filter(Boolean).join('<br>');

        return `
            <div class="round-result-title ${titleClass}">${title}</div>
            <div class="round-result-detail">${detail}</div>
            ${effectsSummary ? `<div class="round-result-detail" style="font-size:0.75rem;opacity:0.8">${effectsSummary}</div>` : ''}
            <button class="round-result-btn" id="btn-close-details">Close</button>
        `;
    }

    function advanceRound() {
        hideRoundResult();
        state.isResolving = false;
        state.playedCards = [];
        state.selectedCard = null;
        state.lastRoundResult = null;

        // Remove details button if present
        const detailsBtn = document.querySelector('.round-details-btn');
        if (detailsBtn) detailsBtn.remove();

        if (state.round >= state.totalRounds) {
            showResults();
        } else {
            renderBattleArea([], false);
            renderHand();
            if (state.isAllAI) {
                setTimeout(() => playAIOnlyRound(), AI_DELAY);
            }
        }
    }

    function resolveRound() {
        state.isResolving = true;
        const played = state.playedCards;

        const result = resolveCombat(played);

        // Show cards face up with WIN/TIE overlays on the cards themselves
        renderBattleArea(played, true, result.isTie);
        updateScoresBar();

        // Store result for details popup
        state.lastRoundResult = { played, result };

        // After reveal animation, unlock so player can pick next card (or show details)
        setTimeout(() => {
            // Add a "Details" button in the battle area
            const detailsBtn = document.createElement('button');
            detailsBtn.className = 'btn btn-secondary round-details-btn';
            detailsBtn.textContent = 'Details';
            detailsBtn.style.cssText = 'position:absolute;bottom:8px;left:50%;transform:translateX(-50%);z-index:15;padding:6px 20px;font-size:0.75rem;';
            const battleArea = document.querySelector('.battle-area');
            battleArea.style.position = 'relative';
            battleArea.appendChild(detailsBtn);

            detailsBtn.addEventListener('click', () => {
                if (state.lastRoundResult) {
                    const { played: p, result: r } = state.lastRoundResult;
                    showRoundResult(buildRoundDetailHTML(p, r));
                    $('btn-close-details').addEventListener('click', hideRoundResult);
                }
            });

            if (state.round >= state.totalRounds) {
                // Final round: auto-show results after a short pause
                setTimeout(() => advanceRound(), 1500);
            } else if (state.isAllAI) {
                // AI-only: auto-advance after delay
                setTimeout(() => advanceRound(), 1800);
            } else {
                // Human play: unlock so they can select next card
                state.isResolving = false;
                renderHand();
            }
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
                card = aiSelectCard(player);
                if (card) player.hand = player.hand.filter(c => c.id !== card.id);
            }
            if (card) {
                state.playedCards.push({
                    playerIndex: idx,
                    playerName: player.name,
                    card: card,
                    effects: {},
                    pairwiseWins: 0,
                    isWinner: undefined
                });
            }
        });

        // Show face-down first
        renderBattleArea(state.playedCards, false);

        // Reveal after delay
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

        // Clear previous round's details button and battle area
        const detailsBtn = document.querySelector('.round-details-btn');
        if (detailsBtn) detailsBtn.remove();
        state.lastRoundResult = null;

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
                    ${p.score === topScore ? '<span class="crown">&#x1F451;</span>' : ''}
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

        for (let i = 0; i < state.humanCount; i++) {
            state.players.push({
                name: state.humanCount === 1 ? 'You' : `Player ${i + 1}`,
                isAI: false,
                hand: generateDeck(),
                score: 0
            });
        }

        const aiNames = ['Sentinel', 'Shadow', 'Oracle', 'Phantom'];
        for (let i = 0; i < state.aiCount; i++) {
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
                    <span class="tri-arrow">&rarr; &times;3 &rarr;</span>
                    <span class="tri-archer">Archer</span>
                </div>
                <div class="triangle-row">
                    <span class="tri-archer">Archer</span>
                    <span class="tri-arrow">&rarr; &times;3 &rarr;</span>
                    <span class="tri-mage">Mage</span>
                </div>
                <div class="triangle-row">
                    <span class="tri-mage">Mage</span>
                    <span class="tri-arrow">&rarr; &times;3 &rarr;</span>
                    <span class="tri-warrior">Warrior</span>
                </div>
            </div>

            <h3>Combat Resolution</h3>
            <ul>
                <li>Each card has a base power (1-10) and a class</li>
                <li>Class advantage triples your power against that opponent</li>
                <li>Each card is compared against every other card played</li>
                <li>The card with the most pairwise wins takes the round</li>
                <li>Ties award no points</li>
            </ul>

            <h3>Random Effects</h3>
            <ul>
                <li><strong style="color:#ff6b6b">Critical Strike</strong> (15% base) &mdash; Doubles base power</li>
                <li><strong style="color:#51cf66">Shield</strong> (10% base) &mdash; Halves opponent's effective power</li>
            </ul>

            <h3>Character Abilities</h3>
            <ul>
                <li>Some characters have special abilities that modify combat</li>
                <li>Abilities may increase crit/shield chances, add power, or counter opponents</li>
                <li>Tap the ability badge on a card to see details</li>
            </ul>

            <h3>How to Play</h3>
            <ul>
                <li>Tap a card in your hand to select it</li>
                <li>Tap "Play Card" to commit your selection</li>
                <li>All players reveal simultaneously</li>
                <li>After 12 rounds, the player with the most round wins is champion!</li>
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
                showConfirm('Restart Game', 'Are you sure you want to restart?', startGame);
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
        playBtn.style.transform = show ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(10px)';
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
                    const maxAI = state.humanCount === 0 ? 4 : 3;
                    state.aiCount = Math.max(1, Math.min(maxAI, state.aiCount + dir));
                    if (state.humanCount === 0 && state.aiCount < 2) state.aiCount = 2;
                }

                const total = state.humanCount + state.aiCount;
                if (total < 2) {
                    if (target === 'humans') state.aiCount = Math.max(state.aiCount, 2 - state.humanCount);
                    else state.humanCount = Math.max(state.humanCount, 2 - state.aiCount);
                }
                // Cap total at 4
                if (total > 4) {
                    if (target === 'humans') state.aiCount = 4 - state.humanCount;
                    else state.humanCount = Math.max(0, 4 - state.aiCount);
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
