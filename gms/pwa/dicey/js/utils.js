/* ============================================
   DICEY - Utility Functions
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

    lerp(a, b, t) {
        return a + (b - a) * t;
    },

    easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    },

    easeInOutQuad(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    },

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

    BOARD_SPACES: [
        // Bottom row right-to-left: indices 0-7 (0=GO corner)
        { type: 'go', name: 'GO', desc: 'Collect $200' },                                                              // 0 corner
        { type: 'property', name: 'Elm Street', color: '#8B4513', group: 0, price: 60, rent: [4, 20, 60, 180, 320, 450] },  // 1
        { type: 'chest', name: 'Community', desc: 'Draw a card' },                                                      // 2
        { type: 'property', name: 'Oak Avenue', color: '#8B4513', group: 0, price: 80, rent: [6, 30, 90, 270, 400, 550] },  // 3
        { type: 'tax', name: 'Income Tax', desc: 'Pay $200', amount: 200 },                                             // 4
        { type: 'railroad', name: 'North Rail', price: 200, rent: [25, 50, 100, 200] },                                 // 5
        { type: 'property', name: 'Pine Road', color: '#00CED1', group: 1, price: 100, rent: [8, 40, 100, 300, 450, 600] },// 6
        { type: 'chance', name: 'Chance', desc: 'Draw a card' },                                                        // 7
        // Left column bottom-to-top: indices 8-15 (8=Jail corner)
        { type: 'jail', name: 'Jail', desc: 'Just Visiting' },                                                          // 8 corner
        { type: 'property', name: 'Maple Lane', color: '#00CED1', group: 1, price: 120, rent: [10, 50, 150, 450, 625, 750] },// 9
        { type: 'property', name: 'Cedar Drive', color: '#00CED1', group: 1, price: 140, rent: [12, 60, 180, 500, 700, 900] },//10
        { type: 'property', name: 'Rose Way', color: '#FF69B4', group: 2, price: 160, rent: [14, 70, 200, 550, 750, 950] },// 11
        { type: 'utility', name: 'Power Co.', price: 150 },                                                             // 12
        { type: 'property', name: 'Lily Path', color: '#FF69B4', group: 2, price: 180, rent: [16, 80, 220, 600, 800, 1000] },//13
        { type: 'property', name: 'Daisy Court', color: '#FF69B4', group: 2, price: 200, rent: [18, 90, 250, 700, 875, 1050] },//14
        { type: 'railroad', name: 'East Rail', price: 200, rent: [25, 50, 100, 200] },                                 // 15
        // Top row left-to-right: indices 16-23 (16=Free Parking corner)
        { type: 'parking', name: 'Free Parking', desc: 'Take a break' },                                               // 16 corner
        { type: 'property', name: 'King Blvd', color: '#FF8C00', group: 3, price: 220, rent: [20, 100, 300, 750, 925, 1100] },//17
        { type: 'chest', name: 'Community', desc: 'Draw a card' },                                                      // 18
        { type: 'property', name: 'Queen Ave', color: '#FF8C00', group: 3, price: 240, rent: [22, 110, 330, 800, 975, 1150] },//19
        { type: 'property', name: 'Duke Street', color: '#FF8C00', group: 3, price: 260, rent: [24, 120, 360, 850, 1025, 1200] },//20
        { type: 'chance', name: 'Chance', desc: 'Draw a card' },                                                        // 21
        { type: 'property', name: 'Grand Pl.', color: '#E74C3C', group: 4, price: 280, rent: [26, 130, 390, 900, 1100, 1275] },//22
        { type: 'railroad', name: 'South Rail', price: 200, rent: [25, 50, 100, 200] },                                // 23
        // Right column top-to-bottom: indices 24-31 (24=Go To Jail corner)
        { type: 'goToJail', name: 'Go To Jail', desc: 'Go directly to Jail!' },                                        // 24 corner
        { type: 'property', name: 'Royal Rd', color: '#E74C3C', group: 4, price: 300, rent: [28, 150, 450, 1000, 1200, 1400] },//25
        { type: 'property', name: 'Crown Hill', color: '#E74C3C', group: 4, price: 320, rent: [30, 160, 480, 1050, 1250, 1450] },//26
        { type: 'chest', name: 'Community', desc: 'Draw a card' },                                                      // 27
        { type: 'property', name: 'Pearl Lane', color: '#9B59B6', group: 5, price: 350, rent: [35, 175, 500, 1100, 1300, 1500] },//28
        { type: 'property', name: 'Diamond St', color: '#9B59B6', group: 5, price: 380, rent: [40, 200, 600, 1400, 1700, 2000] },//29
        { type: 'tax', name: 'Luxury Tax', desc: 'Pay $150', amount: 150 },                                            // 30
        { type: 'property', name: 'Gold Blvd', color: '#F5C518', group: 6, price: 400, rent: [50, 200, 600, 1400, 1700, 2000] },//31
    ],

    CHANCE_CARDS: [
        { text: 'Advance to GO! Collect $200.', action: 'moveTo', value: 0 },
        { text: 'Bank pays you a dividend of $50.', action: 'gain', value: 50 },
        { text: 'Go back 3 spaces.', action: 'moveBack', value: 3 },
        { text: 'Go directly to Jail!', action: 'goJail' },
        { text: 'Pay poor tax of $15.', action: 'pay', value: 15 },
        { text: 'Your investment matured! Collect $150.', action: 'gain', value: 150 },
        { text: 'You won a crossword competition! Collect $100.', action: 'gain', value: 100 },
        { text: 'Speeding fine! Pay $50.', action: 'pay', value: 50 },
        { text: 'Advance to nearest Railroad.', action: 'nearestRail' },
        { text: 'Building repairs: Pay $25 per house.', action: 'payPerHouse', value: 25 },
    ],

    CHEST_CARDS: [
        { text: 'Bank error in your favor! Collect $200.', action: 'gain', value: 200 },
        { text: 'Doctor\'s fees. Pay $50.', action: 'pay', value: 50 },
        { text: 'From sale of stock, you get $45.', action: 'gain', value: 45 },
        { text: 'Go directly to Jail!', action: 'goJail' },
        { text: 'Holiday fund matures! Collect $100.', action: 'gain', value: 100 },
        { text: 'Income tax refund. Collect $20.', action: 'gain', value: 20 },
        { text: 'Life insurance matures. Collect $100.', action: 'gain', value: 100 },
        { text: 'Hospital fees. Pay $100.', action: 'pay', value: 100 },
        { text: 'School fees. Pay $50.', action: 'pay', value: 50 },
        { text: 'You inherit $100!', action: 'gain', value: 100 },
    ],

    GROUP_SIZES: { 0: 2, 1: 3, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
};
