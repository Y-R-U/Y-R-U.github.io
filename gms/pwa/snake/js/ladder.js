/**
 * The global ladder.
 *
 * A quarter of a million players deep, so it is stored as a curve rather than a
 * table: your rating maps to a rank and back again, and only the handful of rows
 * actually on screen are ever built. The curve is deliberately packed at the
 * bottom — most people play a few games and stop — so early progress moves you
 * thousands of places and the last hundred cost more than the first hundred
 * thousand.
 *
 * There is no cross-player table behind this yet: firestore.rules has no public
 * collection, so a real one needs rules written and deployed first. Your rating
 * rides along with the rest of the save, so it already follows you between
 * devices.
 */
const Ladder = {
    /**
     * FNV-1a plus an avalanche.
     *
     * The finalizer is not optional here. Plain FNV ends on a multiply, so two
     * keys differing in the last character come out differing by a fixed small
     * multiple — and _unit reads the TOP bits, which barely move. Keys like
     * "r240001" and "r240002" then pick the same name, and the board fills with
     * near-identical rows. Mixing the bits down first is what stops that.
     */
    _hash(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        h ^= h >>> 15;
        h = Math.imul(h, 2246822507);
        h ^= h >>> 13;
        h = Math.imul(h, 3266489909);
        h ^= h >>> 16;
        return h >>> 0;
    },

    /** 0..1 from a string, stable everywhere. */
    _unit(str) {
        return this._hash(str) / 4294967296;
    },

    _day() {
        return Math.floor(Date.now() / 86400000);
    },

    /** Today's headcount. It wanders a little so the board is visibly alive. */
    population() {
        const drift = (this._unit('pop:' + this._day()) - 0.5) * 2 * CONFIG.LADDER_POP_DRIFT;
        return Math.round(CONFIG.LADDER_POPULATION * (1 + drift));
    },

    size() { return this.population(); },

    /* ------------------------------------------------ the curve, both ways */

    /** Where a rating sits. 1 is the top of the world. */
    rankOf(rating) {
        const pop = this.population();
        const t = Utils.clamp(rating / CONFIG.LADDER_TOP_RATING, 0, 1);
        const share = Math.pow(1 - t, CONFIG.LADDER_RANK_CURVE);
        return Utils.clamp(Math.round(1 + (pop - 1) * share), 1, pop);
    },

    /** And back: what rating a given rank implies. */
    ratingAt(rank) {
        const pop = this.population();
        const share = Utils.clamp((rank - 1) / (pop - 1), 0, 1);
        const t = 1 - Math.pow(share, 1 / CONFIG.LADDER_RANK_CURVE);
        return t * CONFIG.LADDER_TOP_RATING;
    },

    /**
     * The mass a run has to reach to be worth nothing either way.
     *
     * Measured off your RANK, not your rating: down among the two hundred
     * thousand it is LADDER_PAR_MIN and almost anything is progress, and by the
     * top it is nearly a win, which is why the last stretch takes wins rather
     * than good runs. The curve is flat for most of the table and then bites.
     */
    par(rating) {
        const p = Utils.clamp(this.rankOf(rating) / this.population(), 0, 1);
        const strength = Math.pow(1 - p, CONFIG.LADDER_PAR_CURVE);
        return CONFIG.LADDER_PAR_MIN *
            Math.pow(CONFIG.LADDER_PAR_TOP / CONFIG.LADDER_PAR_MIN, strength);
    },

    /* ------------------------------------------------------- your standing */

    state(saveData) {
        const data = saveData || Storage.load();
        const l = data.ladder || {};
        const rating = Math.round(l.rating ?? CONFIG.LADDER_START_RATING);
        return {
            rating,
            peak: Math.round(l.peak ?? rating),
            bestRank: l.bestRank || 0,
            rivals: Array.isArray(l.rivals) ? l.rivals : null
        };
    },

    rank(saveData) {
        return this.rankOf(this.state(saveData).rating);
    },

    /**
     * What a finished run is worth, in rating.
     *
     * Doublings of mass over par, so it is the same shape wherever you are on
     * the ladder: par is nothing, twice par is a step, half par is a step back.
     * Winning adds a flat bonus on top, and near the top that bonus is most of
     * what is left — which is why the last stretch takes wins rather than good
     * runs.
     */
    delta(result, rating) {
        const r = rating ?? this.state().rating;
        const mass = Math.max(1, result.mass || 0);
        const steps = Utils.clamp(
            Math.log2(mass / this.par(r)),
            CONFIG.LADDER_MIN_STEPS, CONFIG.LADDER_MAX_STEPS
        );
        let out = steps * CONFIG.LADDER_STEP + (result.kills || 0) * CONFIG.LADDER_KILL_POINTS;
        if (result.won) out += CONFIG.LADDER_WIN_GAIN;
        return Math.round(out);
    },

    /* --------------------------------------------------------- the regulars */

    /**
     * The names you keep running into. Seeded once and then kept in the save,
     * each with its own rating that moves every game — so they climb roughly
     * alongside you, and can be overtaken or lost to.
     */
    careerRivals(saveData) {
        const data = saveData || Storage.load();
        const st = this.state(data);
        if (st.rivals && st.rivals.length) return st.rivals;

        // Seeded once and then persisted, so it never has to be reproducible —
        // but it does have to differ between players, hence the roll.
        const seed = (data.username || 'player') + ':' + Math.floor(Math.random() * 1e9);
        const names = this._namePool();
        const list = [];
        for (let i = 0; i < CONFIG.LADDER_CAREER_RIVALS; i++) {
            const pick = names[Math.floor(this._unit(seed + ':n' + i) * names.length)];
            if (list.some(r => r.name === pick)) { names.splice(names.indexOf(pick), 1); i--; continue; }
            const offset = (this._unit(seed + ':o' + i) - 0.35) * 2 * CONFIG.LADDER_RIVAL_SPREAD;
            list.push({ name: pick, rating: Math.max(0, Math.round(st.rating + offset)) });
        }
        Storage.update(d => {
            d.ladder = d.ladder || {};
            d.ladder.rivals = list;
        });
        return list;
    },

    /**
     * Move the regulars on by one game. They gain a share of what the player is
     * averaging, so a player who improves finds them improving too — but the
     * swing is wide enough that any given game reshuffles who is above you.
     */
    _advanceRivals(list, playerGain, games) {
        return list.map((r, i) => {
            const roll = this._unit(r.name + ':' + games + ':' + i);
            const swing = 1 + (roll - 0.5) * 2 * CONFIG.LADDER_RIVAL_SWING;
            const gain = playerGain * CONFIG.LADDER_RIVAL_PACE * swing;
            return { name: r.name, rating: Math.max(0, Math.round(r.rating + gain)) };
        });
    },

    /** The bot pool, extended with tags so a big board never repeats a name. */
    _namePool() {
        const tags = ['', ' II', 'X', '_99', ' Prime', ' Jr', '77', ' Sr', 'z', '_v2'];
        const out = [];
        for (const tag of tags) for (const base of CONFIG.BOT_NAMES) out.push(base + tag);
        return out;
    },

    /** A stable name for a given rank, so the board reads the same all day. */
    _nameForRank(rank) {
        const pool = this._namePool();
        const key = 'r' + rank + ':' + this._day();
        return pool[Math.floor(this._unit(key) * pool.length)] + this._suffixFor(key);
    },

    /** Keeps names distinct that far down the table without a huge pool. */
    _suffixFor(key) {
        const n = Math.floor(this._unit(key + ':s') * 999);
        return n < 320 ? '' : String(n);
    },

    /* ------------------------------------------------------------ the board */

    /**
     * `count` rows centred on the player, plus the player's own row. Rows are
     * built from the curve on demand — there is no table in memory anywhere.
     */
    around(count, saveData) {
        const data = saveData || Storage.load();
        const me = this.state(data);
        const pop = this.population();
        const myRank = this.rankOf(me.rating);

        const half = Math.floor(count / 2);
        let from = Math.max(1, myRank - half);
        const to = Math.min(pop, from + count - 1);
        from = Math.max(1, to - count + 1);

        const rivals = this.careerRivals(data).slice()
            .sort((a, b) => b.rating - a.rating);

        const rows = [];
        for (let rank = from; rank <= to; rank++) {
            if (rank === myRank) {
                rows.push({ rank, name: data.username || 'You', rating: me.rating, isPlayer: true });
                continue;
            }
            rows.push({ rank, name: this._nameForRank(rank), rating: Math.round(this.ratingAt(rank)) });
        }

        // Drop the regulars into the rows nearest their own rating, so the
        // people you actually play against are the people you can see.
        for (const r of rivals) {
            const want = this.rankOf(r.rating);
            let best = -1, bestGap = Infinity;
            for (let i = 0; i < rows.length; i++) {
                if (rows[i].isPlayer || rows[i].isRival) continue;
                const gap = Math.abs(rows[i].rank - want);
                if (gap < bestGap) { bestGap = gap; best = i; }
            }
            if (best >= 0) {
                rows[best] = { rank: rows[best].rank, name: r.name, rating: rows[best].rating, isRival: true };
            }
        }
        return rows;
    },

    /** The very top of the world, for the head of the ladder screen. */
    top(count) {
        const rows = [];
        for (let rank = 1; rank <= count; rank++) {
            rows.push({ rank, name: this._nameForRank(rank), rating: Math.round(this.ratingAt(rank)) });
        }
        return rows;
    },

    /** The regulars sitting just above the player — their next few targets. */
    aheadOfMe(count, saveData) {
        const data = saveData || Storage.load();
        const me = this.state(data).rating;
        const rivals = this.careerRivals(data).slice().sort((a, b) => b.rating - a.rating);
        const above = rivals.filter(r => r.rating >= me);
        const below = rivals.filter(r => r.rating < me).reverse();
        return above.concat(below).slice(0, count).map(r => r.name);
    },

    /**
     * Settle a finished run against the ladder and persist it.
     * Returns what moved, for the results screen to show.
     */
    apply(result) {
        const data0 = Storage.load();
        const before = this.state(data0);
        const rankBefore = this.rankOf(before.rating);
        const delta = this.delta(result, before.rating);
        const after = Math.max(CONFIG.LADDER_MIN_RATING,
            Math.min(CONFIG.LADDER_TOP_RATING, before.rating + delta));

        const games = (data0.stats && data0.stats.gamesPlayed) || 0;
        const rivals = this._advanceRivals(this.careerRivals(data0), Math.max(0, delta), games);

        const rankAfter = this.rankOf(after);
        Storage.update(d => {
            d.ladder = d.ladder || {};
            d.ladder.rating = after;
            d.ladder.peak = Math.max(before.peak, after);
            d.ladder.rivals = rivals;
            d.ladder.bestRank = before.bestRank ? Math.min(before.bestRank, rankAfter) : rankAfter;
        });

        return {
            delta,
            ratingBefore: before.rating,
            rating: after,
            rankBefore,
            rank: rankAfter,
            climbed: rankBefore - rankAfter,
            par: Math.round(this.par(before.rating))
        };
    }
};

/**
 * The regulars, in the arena.
 *
 * Everything else out there is a stranger with a random name, spawned and
 * forgotten. These few are the same snakes game after game — the names from the
 * player's own career ladder, promoted to the top skill tiers, spawning bigger,
 * and the only snakes that carry any of the speed the player has paid for.
 */
const Rivals = {
    /** How many regulars a player at this stage of their career faces. */
    count(pressure) {
        return Utils.clamp(
            Math.round(CONFIG.RIVAL_MIN + pressure * (CONFIG.RIVAL_MAX - CONFIG.RIVAL_MIN)),
            CONFIG.RIVAL_MIN, CONFIG.RIVAL_MAX
        );
    },

    /**
     * This session's roster. Cached in sessionStorage so a reload mid-session
     * brings back the same faces; the names themselves now come from the career
     * ladder, so they persist across sessions too.
     */
    session(saveData, pressure) {
        const data = saveData || Storage.load();
        const want = this.count(pressure);
        const stored = this._read();
        if (stored && stored.day === Ladder._day() && stored.list.length === want) return stored.list;

        const names = Ladder.aheadOfMe(want, data);
        const list = names.map((name, i) => ({
            name,
            share: CONFIG.RIVAL_SPEED_SHARE[i] || 0,
            tier: Utils.clamp(
                CONFIG.AI_TIERS.length - 1 - i,
                CONFIG.RIVAL_TIER_MIN, CONFIG.AI_TIERS.length - 1
            )
        }));
        this._write({ day: Ladder._day(), list });
        return list;
    },

    /** A share of the player's speed edge — so a regular never has more of it. */
    speedBonus(rival, playerSpeedEdge) {
        return (rival.share || 0) * Math.max(0, playerSpeedEdge);
    },

    forget() {
        try { sessionStorage.removeItem(CONFIG.RIVAL_SESSION_KEY); } catch (e) { /* nothing to do */ }
    },

    _read() {
        try {
            const raw = sessionStorage.getItem(CONFIG.RIVAL_SESSION_KEY);
            const v = raw ? JSON.parse(raw) : null;
            return v && Array.isArray(v.list) ? v : null;
        } catch (e) { return null; }
    },

    _write(v) {
        try { sessionStorage.setItem(CONFIG.RIVAL_SESSION_KEY, JSON.stringify(v)); } catch (e) { /* fine */ }
    }
};
