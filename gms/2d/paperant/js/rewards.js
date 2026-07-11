/* rewards.js - Daily login rewards (7-day streak cycle), date-driven
   weekday events, and the once-per-day seeded Daily Challenge.
   All date logic uses the LOCAL date so "a new day" matches the player's
   own midnight, mirroring the approach used in Prism Break. */
'use strict';

const Rewards = (() => {
    const SAVE_KEY = 'paperant_rewards';

    // 7-day streak cycle; day 7 is the mega bundle, then it wraps around
    const DAILY_CYCLE = [
        { magnet: 1, ink: 1 },
        { freeze: 1, time: 1 },
        { magnet: 1, pencil: 1 },
        { magnet: 2, ink: 2 },
        { freeze: 2, pencil: 1 },
        { magnet: 2, time: 2 },
        { magnet: 3, pencil: 2, freeze: 2, ink: 2, time: 2 },
    ];

    // Weekday events (0 = Sunday). `bonus` adds items to the daily reward,
    // `mult` multiplies the whole reward (also applies to challenge rewards).
    const EVENTS = {
        1: { name: 'Magnet Monday', icon: '\u{1F9F2}', desc: 'Bonus magnets in today\'s daily reward!', bonus: { magnet: 2 } },
        3: { name: 'Ink Wednesday', icon: '\u{1FAD9}', desc: 'Bonus ink flasks in today\'s daily reward!', bonus: { ink: 2 } },
        5: { name: 'Freeze Friday', icon: '\u{2744}\u{FE0F}', desc: 'Bonus freezes in today\'s daily reward!', bonus: { freeze: 2 } },
        6: { name: 'Weekend Rally', icon: '\u{1F389}', desc: 'All rewards are DOUBLED this weekend!', mult: 2 },
        0: { name: 'Weekend Rally', icon: '\u{1F389}', desc: 'All rewards are DOUBLED this weekend!', mult: 2 },
    };

    let state = null; // { lastClaim, streak, lastChallenge }

    function todayStr() {
        const d = new Date();
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function yesterdayStr() {
        const d = new Date();
        d.setDate(d.getDate() - 1);
        return d.getFullYear() + '-' +
            String(d.getMonth() + 1).padStart(2, '0') + '-' +
            String(d.getDate()).padStart(2, '0');
    }

    function init() {
        try {
            const data = JSON.parse(localStorage.getItem(SAVE_KEY));
            if (data && typeof data === 'object') {
                state = {
                    lastClaim: data.lastClaim || null,
                    streak: data.streak | 0,
                    lastChallenge: data.lastChallenge || null,
                };
                return;
            }
        } catch (e) {}
        state = { lastClaim: null, streak: 0, lastChallenge: null };
    }

    function save() {
        try {
            localStorage.setItem(SAVE_KEY, JSON.stringify(state));
        } catch (e) {}
    }

    // === Events ===

    function getTodayEvent() {
        return EVENTS[new Date().getDay()] || null;
    }

    // === Daily reward ===

    function canClaimDaily() {
        return state.lastClaim !== todayStr();
    }

    /** The streak day (1-7) that today's claim would be / was. */
    function currentStreakDay() {
        if (!canClaimDaily()) {
            // Already claimed today: show the day just claimed
            return ((state.streak - 1) % 7) + 1;
        }
        const nextStreak = state.lastClaim === yesterdayStr() ? state.streak + 1 : 1;
        return ((nextStreak - 1) % 7) + 1;
    }

    /** Compute today's reward bundle (with event bonuses) without claiming. */
    function peekDaily() {
        const day = currentStreakDay();
        const items = { ...DAILY_CYCLE[day - 1] };
        const event = getTodayEvent();
        if (event) {
            if (event.bonus) {
                for (const [type, count] of Object.entries(event.bonus)) {
                    items[type] = (items[type] || 0) + count;
                }
            }
            if (event.mult) {
                for (const type of Object.keys(items)) items[type] *= event.mult;
            }
        }
        return { day, items, event, claimable: canClaimDaily() };
    }

    /** Claim today's reward. Returns the granted bundle, or null if already claimed. */
    function claimDaily() {
        if (!canClaimDaily()) return null;
        const reward = peekDaily();
        state.streak = state.lastClaim === yesterdayStr() ? state.streak + 1 : 1;
        state.lastClaim = todayStr();
        save();
        PowerUps.addBundle(reward.items);
        return reward;
    }

    function getStreak() { return state.streak; }

    // === Daily challenge ===

    function isChallengeDone() {
        return state.lastChallenge === todayStr();
    }

    // Deterministic LCG seeded from the date so everyone gets the same
    // challenge on the same day
    function dateSeed() {
        const d = new Date();
        return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    }

    function seededRand(seed) {
        let s = seed;
        return () => {
            s = (s * 1103515245 + 12345) & 0x7fffffff;
            return s / 0x7fffffff;
        };
    }

    /** Build today's challenge: a mid/late level remixed with faster ants
        and a tighter clock. */
    function getChallengeLevel() {
        const rand = seededRand(dateSeed());
        const poolStart = 20; // draw from level 21 onward
        const index = poolStart + Math.floor(rand() * (LEVELS.length - poolStart));
        const base = LEVELS[index];
        return {
            ...base,
            name: 'Daily Challenge',
            description: base.name + ' — remixed! Faster ants, tighter clock.',
            timeLimit: Math.max(20, Math.round(base.timeLimit * 0.9)),
            antSpeed: Math.round(base.antSpeed * 1.2 * 10) / 10,
            ants: base.ants.map(a => ({ ...a })),
            goals: base.goals.map(g => ({ ...g })),
            obstacles: base.obstacles.map(o => ({ ...o })),
        };
    }

    /** Mark today's challenge complete and grant its reward bundle.
        Returns the granted items, or null if already done today. */
    function completeChallenge() {
        if (isChallengeDone()) return null;
        const rand = seededRand(dateSeed() ^ 0x5eed);
        const others = ['pencil', 'freeze', 'ink', 'time'];
        const items = { magnet: 1 };
        const extra = others[Math.floor(rand() * others.length)];
        items[extra] = (items[extra] || 0) + 1;
        const event = getTodayEvent();
        if (event && event.mult) {
            for (const type of Object.keys(items)) items[type] *= event.mult;
        }
        state.lastChallenge = todayStr();
        save();
        PowerUps.addBundle(items);
        return items;
    }

    return {
        init, getTodayEvent,
        canClaimDaily, peekDaily, claimDaily, getStreak, currentStreakDay,
        isChallengeDone, getChallengeLevel, completeChallenge,
    };
})();
