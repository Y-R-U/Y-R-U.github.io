/**
 * The global ladder.
 *
 * A standing table of rivals you climb by winning and slide down by dying
 * badly. The rivals are generated, not fetched: their ratings come from a hash
 * of their name plus a per-day drift, so everyone sees the same board on the
 * same day, it costs nothing, and it works with no account and no network.
 *
 * There is no cross-player table behind this yet — firestore.rules deliberately
 * has no public collection, so a real one needs rules written and deployed
 * before it can exist. Your own rating rides along with the rest of the save,
 * so it already follows you between devices.
 */
const Ladder = {
    _hash(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    },

    /** 0..1 from a string, stable everywhere. */
    _unit(str) {
        return this._hash(str) / 4294967296;
    },

    _day() {
        return Math.floor(Date.now() / 86400000);
    },

    /** Rival names: the bot pool, extended with tags so 60 of them are distinct. */
    _names() {
        if (this._nameCache) return this._nameCache;
        const tags = ['', ' II', 'X', '_99', 'Prime', ' Jr'];
        const out = [];
        for (let i = 0; out.length < CONFIG.LADDER_RIVALS; i++) {
            const base = CONFIG.BOT_NAMES[i % CONFIG.BOT_NAMES.length];
            const tag = tags[Math.floor(i / CONFIG.BOT_NAMES.length) % tags.length];
            out.push(base + tag);
        }
        this._nameCache = out;
        return out;
    },

    /**
     * Today's rivals. Ratings are spread across a range wide enough that the
     * player's 1000 starts them mid-table with plenty of room in both directions.
     */
    rivals() {
        const day = this._day();
        if (this._rivalCache && this._rivalDay === day) return this._rivalCache;

        const list = this._names().map(name => {
            const base = 380 + this._unit(name) * 2250;
            const drift = (this._unit(name + ':' + day) - 0.5) * 2 * CONFIG.LADDER_DRIFT;
            return { name, rating: Math.round(base + drift), isPlayer: false };
        });

        this._rivalCache = list;
        this._rivalDay = day;
        return list;
    },

    state(saveData) {
        const data = saveData || Storage.load();
        const l = data.ladder || {};
        return {
            rating: Math.round(l.rating ?? CONFIG.LADDER_START_RATING),
            peak: Math.round(l.peak ?? l.rating ?? CONFIG.LADDER_START_RATING),
            bestRank: l.bestRank || 0
        };
    },

    /** The whole table, highest first, with the player in their place. */
    board(saveData) {
        const data = saveData || Storage.load();
        const me = this.state(data);
        const rows = this.rivals().slice();
        rows.push({
            name: data.username || 'You',
            rating: me.rating,
            isPlayer: true
        });
        rows.sort((a, b) => b.rating - a.rating || (a.isPlayer ? -1 : 1));
        return rows;
    },

    rank(saveData) {
        const rows = this.board(saveData);
        return rows.findIndex(r => r.isPlayer) + 1;
    },

    size() {
        return CONFIG.LADDER_RIVALS + 1;
    },

    /**
     * What a finished run is worth. A win is a flat climb; anything else is
     * measured against LADDER_MASS_PAR, so a strong death holds station and a
     * quick one costs you.
     */
    delta(result) {
        if (result.won) {
            return CONFIG.LADDER_WIN_GAIN + result.kills * CONFIG.LADDER_KILL_POINTS;
        }
        const fromPar = (result.mass - CONFIG.LADDER_MASS_PAR) / CONFIG.LADDER_MASS_DIV;
        const raw = fromPar + result.kills * CONFIG.LADDER_KILL_POINTS;
        return Math.round(Utils.clamp(raw, -CONFIG.LADDER_MAX_LOSS, CONFIG.LADDER_MAX_GAIN));
    },

    /** The names sitting just above the player — their next few targets. */
    aheadOfMe(count, saveData) {
        const rows = this.board(saveData);
        const me = rows.findIndex(r => r.isPlayer);
        const out = [];
        for (let i = me - 1; i >= 0 && out.length < count; i--) out.push(rows[i].name);
        for (let i = me + 1; i < rows.length && out.length < count; i++) out.push(rows[i].name);
        return out;
    },

    /**
     * Settle a finished run against the ladder and persist it.
     * Returns what moved, for the results screen to show.
     */
    apply(result) {
        const before = this.state();
        const rankBefore = this.rank();
        const delta = this.delta(result);
        const after = Math.max(CONFIG.LADDER_MIN_RATING, before.rating + delta);

        const data = Storage.update(d => {
            d.ladder = d.ladder || {};
            d.ladder.rating = after;
            d.ladder.peak = Math.max(before.peak, after);
        });
        const rankAfter = this.rank(data);

        Storage.update(d => {
            d.ladder.bestRank = before.bestRank ? Math.min(before.bestRank, rankAfter) : rankAfter;
        });

        return {
            delta,
            ratingBefore: before.rating,
            rating: after,
            rankBefore,
            rank: rankAfter,
            climbed: rankBefore - rankAfter
        };
    }
};

/**
 * The regulars.
 *
 * Everything else in the arena is a stranger with a random name, spawned and
 * forgotten. These few are the same snakes game after game: drawn from the
 * ladder positions immediately above the player, kept in sessionStorage so they
 * survive a reload, promoted to the top skill tiers, and the only snakes that
 * carry any of the speed the player has paid for.
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
     * This session's roster. Held in sessionStorage rather than the save: they
     * should persist across a refresh and a dozen games in a row, and be new
     * people tomorrow.
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
