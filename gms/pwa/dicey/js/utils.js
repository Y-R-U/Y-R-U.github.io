/* ============================================
   DICEY - Utility Functions & Game Data
   Skills-based board game
   ============================================ */

const Utils = {
    rand(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    rollDie() {
        return this.rand(1, 6);
    },

    rollDice() {
        const d1 = this.rollDie();
        const d2 = this.rollDie();
        return { d1, d2, total: d1 + d2, doubles: d1 === d2 };
    },

    formatMoney(amount) {
        if (amount >= 1000000) return '$' + (amount / 1000000).toFixed(1) + 'M';
        if (amount >= 10000) return '$' + (amount / 1000).toFixed(1) + 'K';
        return '$' + amount.toLocaleString();
    },

    lerp(a, b, t) { return a + (b - a) * t; },
    easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); },

    wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    },

    PLAYER_COLORS: ['#3498db', '#e94560', '#2ecc71', '#f39c12'],
    PLAYER_NAMES: ['You', 'Ruby', 'Jade', 'Amber'],
    PLAYER_TOKENS: ['🎩', '🚗', '🐱', '🌟'],
    STARTING_MONEY: 1500,
    STARTING_SHIELDS: 4,
    MAX_ROUNDS: 30,

    // ---- SKILL DEFINITIONS ----
    // Each skill has: id, name, type (attack/defense), price, icon, color, desc, effectDesc
    SKILLS: {
        pickpocket:   { id: 'pickpocket',   name: 'Pickpocket',    type: 'attack',  price: 100, icon: '🤏', color: '#e74c3c', desc: 'Steal money equal to dice roll × $100 from the victim.' },
        ambush:       { id: 'ambush',       name: 'Ambush',        type: 'attack',  price: 150, icon: '⚔️', color: '#c0392b', desc: 'Steal a random skill from the victim. If they have none, steal $200.' },
        sabotage:     { id: 'sabotage',     name: 'Sabotage',      type: 'attack',  price: 120, icon: '💣', color: '#e67e22', desc: 'Victim loses half their cash (rounded down to nearest $50).' },
        shakedown:    { id: 'shakedown',    name: 'Shakedown',     type: 'attack',  price: 180, icon: '🔪', color: '#d35400', desc: 'Steal a Shield Card from the victim. If none left, steal $300.' },
        jinx:         { id: 'jinx',         name: 'Jinx',          type: 'attack',  price: 80,  icon: '🧿', color: '#8e44ad', desc: 'Injure the victim — sent directly to Hospital. Do not pass START.' },
        taxman:       { id: 'taxman',       name: 'Tax Collector', type: 'attack',  price: 200, icon: '📋', color: '#e74c3c', desc: 'Victim pays tax: $50 for each skill they own.' },
        bodyguard:    { id: 'bodyguard',    name: 'Bodyguard',     type: 'defense', price: 100, icon: '🛡️', color: '#2980b9', desc: 'Passive: When you land on an attack, reduce damage by 50%.' },
        goldmine:     { id: 'goldmine',     name: 'Gold Mine',     type: 'defense', price: 150, icon: '⛏️', color: '#f39c12', desc: 'Each time you pass GO, collect an extra $100 per Gold Mine owned.' },
        healer:       { id: 'healer',       name: 'Healer',        type: 'defense', price: 120, icon: '💊', color: '#27ae60', desc: 'When an opponent lands here, YOU gain $150 instead of attacking.' },
        forge:        { id: 'forge',        name: 'Shield Forge',  type: 'defense', price: 200, icon: '🔨', color: '#2ecc71', desc: 'Each time you pass GO, gain 1 extra Shield Card (max 6).' },
        tollbooth:    { id: 'tollbooth',    name: 'Toll Booth',    type: 'attack',  price: 130, icon: '🚧', color: '#e74c3c', desc: 'Victim pays a flat $200 toll to the skill owner.' },
        mirror:       { id: 'mirror',       name: 'Mirror Shield', type: 'defense', price: 160, icon: '🪞', color: '#3498db', desc: 'Passive: 30% chance to reflect an attack back at the attacker.' },
        vault:        { id: 'vault',        name: 'Vault',         type: 'defense', price: 140, icon: '🏦', color: '#2c3e50', desc: 'Passive: Your money cannot drop below $100 from attacks.' },
        bounty:       { id: 'bounty',       name: 'Bounty Hunter', type: 'attack',  price: 170, icon: '🎯', color: '#c0392b', desc: 'Steal $100 from the victim for each skill they own.' },
    },

    // Board: 32 spaces. Corners at 0, 8, 16, 24
    // Skill spaces reference a skill ID
    BOARD_SPACES: [
        // Bottom row (right to left): 0-7
        { type: 'go', name: 'START', desc: 'Collect $200' },                                   // 0 corner
        { type: 'skill', skillId: 'pickpocket' },                                             // 1
        { type: 'fate', name: 'Fate', desc: 'Draw a fate card' },                             // 2
        { type: 'skill', skillId: 'bodyguard' },                                              // 3
        { type: 'tax', name: 'Toll Gate', desc: 'Pay $150', amount: 150 },                    // 4
        { type: 'skill', skillId: 'goldmine' },                                               // 5
        { type: 'skill', skillId: 'ambush' },                                                 // 6
        { type: 'fate', name: 'Fate', desc: 'Draw a fate card' },                             // 7
        // Left column (bottom to top): 8-15
        { type: 'jail', name: 'Hospital', desc: 'Just Visiting' },                             // 8 corner
        { type: 'skill', skillId: 'sabotage' },                                               // 9
        { type: 'skill', skillId: 'healer' },                                                 // 10
        { type: 'skill', skillId: 'shakedown' },                                              // 11
        { type: 'fate', name: 'Fate', desc: 'Draw a fate card' },                             // 12
        { type: 'skill', skillId: 'forge' },                                                  // 13
        { type: 'skill', skillId: 'jinx' },                                                   // 14
        { type: 'skill', skillId: 'tollbooth' },                                              // 15
        // Top row (left to right): 16-23
        { type: 'rest', name: 'Rest Stop', desc: 'Recover 1 Shield' },                        // 16 corner
        { type: 'skill', skillId: 'taxman' },                                                 // 17
        { type: 'fate', name: 'Fate', desc: 'Draw a fate card' },                             // 18
        { type: 'skill', skillId: 'mirror' },                                                 // 19
        { type: 'tax', name: 'Black Market', desc: 'Pay $200', amount: 200 },                 // 20
        { type: 'skill', skillId: 'vault' },                                                  // 21
        { type: 'skill', skillId: 'bounty' },                                                 // 22
        { type: 'fate', name: 'Fate', desc: 'Draw a fate card' },                             // 23
        // Right column (top to bottom): 24-31
        { type: 'goToJail', name: 'Injury', desc: 'Go directly to Hospital!' },               // 24 corner
        { type: 'skill', skillId: 'pickpocket' },                                             // 25
        { type: 'skill', skillId: 'bodyguard' },                                              // 26
        { type: 'fate', name: 'Fate', desc: 'Draw a fate card' },                             // 27
        { type: 'skill', skillId: 'goldmine' },                                               // 28
        { type: 'skill', skillId: 'ambush' },                                                 // 29
        { type: 'skill', skillId: 'healer' },                                                 // 30
        { type: 'skill', skillId: 'sabotage' },                                               // 31
    ],

    // Fate cards replace chance/community
    FATE_CARDS: [
        { text: 'Advance to START! Collect $200.', action: 'moveTo', value: 0 },
        { text: 'A mysterious benefactor gives you $200!', action: 'gain', value: 200 },
        { text: 'Go back 3 spaces.', action: 'moveBack', value: 3 },
        { text: 'Suffered an injury! Go directly to Hospital.', action: 'goJail' },
        { text: 'Found a lost wallet! Collect $100.', action: 'gain', value: 100 },
        { text: 'Equipment repair costs. Pay $75.', action: 'pay', value: 75 },
        { text: 'Won a tournament! Collect $150.', action: 'gain', value: 150 },
        { text: 'Bribed a guard. Pay $50.', action: 'pay', value: 50 },
        { text: 'Shield reinforcement! Gain 1 Shield Card.', action: 'gainShield', value: 1 },
        { text: 'Ambushed on the road! Lose 1 Shield Card.', action: 'loseShield', value: 1 },
        { text: 'Merchant discount! Your next skill purchase is half price.', action: 'discount' },
        { text: 'Pickpocketed! Lose $100.', action: 'pay', value: 100 },
        { text: 'Tax refund! Collect $50 per skill you own.', action: 'gainPerSkill', value: 50 },
        { text: 'Advance to Rest Stop.', action: 'moveTo', value: 16 },
    ],

    getSkillForSpace(spaceIdx) {
        const space = this.BOARD_SPACES[spaceIdx];
        if (!space || space.type !== 'skill') return null;
        return this.SKILLS[space.skillId] || null;
    },

    getSpaceName(spaceIdx) {
        const space = this.BOARD_SPACES[spaceIdx];
        if (!space) return '???';
        if (space.type === 'skill') {
            const skill = this.SKILLS[space.skillId];
            return skill ? skill.name : '???';
        }
        return space.name;
    },

    getSpaceColor(spaceIdx) {
        const space = this.BOARD_SPACES[spaceIdx];
        if (!space) return '#555';
        if (space.type === 'skill') {
            const skill = this.SKILLS[space.skillId];
            return skill ? skill.color : '#555';
        }
        return '#555';
    },

    getSpaceIcon(spaceIdx) {
        const space = this.BOARD_SPACES[spaceIdx];
        if (!space) return '?';
        if (space.type === 'skill') {
            const skill = this.SKILLS[space.skillId];
            return skill ? skill.icon : '?';
        }
        return '';
    }
};
