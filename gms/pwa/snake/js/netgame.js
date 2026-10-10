/**
 * NetGame — multiplayer rooms on top of the single-player game.
 *
 * One browser in the room is the HOST and runs the arena exactly as the
 * single-player game does: bots, food, power-ups, deaths. Everyone else is a
 * FOLLOWER: it steers its own snake locally, so steering never waits for the
 * network, and draws everyone else from the host's snapshots, slightly in the
 * past so they move smoothly.
 *
 * Fairness rules, because they are what players notice:
 *  - Your own head is judged by YOUR browser, against what you saw. You only
 *    die running into something that was on your screen. The host never
 *    decides that a follower's head hit a body.
 *  - Everything else (bots' heads, head-on clashes, eating, power-ups) is the
 *    host's call. A follower applies those results at the moment they happened
 *    on its own delayed view, so a bot dies when it visibly reaches you.
 *
 * Every follower holds the whole arena (it has to, to draw it), so when the
 * host goes the next in line converts its copy into a running simulation and
 * carries on. The room server decides who that is.
 */
const NG = {
    SNAP_MS: 50,          // host → followers, 20 a second
    INPUT_MS: 50,         // follower → host
    INTERP_MIN: 80,       // how far behind the host followers draw other snakes
    INTERP_MAX: 400,
    EXTRAP_MS: 250,       // keep a snake moving this long past its last snapshot
    AWAY_MS: 2500,        // no input this long and a player's snake goes on autopilot
    EVENT_STALE_MS: 500,  // apply a queued event regardless after this long
    POS_SCALE: 4,         // positions travel as int16 quarter-pixels (±8191 px)
    MIN_BOTS: 8,
    SHIELD_IGNORE_MS: 1500
};

const NG_PU = Object.values(CONFIG.POWERUP_TYPES);           // index ↔ type on the wire
const NG_PU_INDEX = Object.fromEntries(NG_PU.map((t, i) => [t.id, i]));

function ngWrap(a) {
    a = a % (Math.PI * 2);
    if (a > Math.PI) a -= Math.PI * 2;
    if (a < -Math.PI) a += Math.PI * 2;
    return a;
}

function ngQ(v) { return Utils.clamp(Math.round(v * NG.POS_SCALE), -32767, 32767); }

class NetGame {
    constructor(game, net) {
        this.game = game;
        this.net = net;
        this.role = null;              // 'host' | 'follow'
        this.byNid = new Map();
        this.nextNid = 1;

        // host
        this.peers = new Map();        // memberId -> { nid, synced, input, inputAt, seq, boostReadyAt, pressure }
        this.batch = this._emptyBatch();
        this.lastSnap = 0;
        this._snapBuf = new ArrayBuffer(16384);

        // follower
        this.hist = new Map();         // nid -> [{t,x,y,a,m,f,p}]
        this.offs = [];                // recent (hostTime - localTime)
        this.clockOff = null;
        this.delay = NG.INTERP_MIN;
        this.evq = [];
        this.food = new Map();
        this.synced = false;
        this.wantSpawn = false;
        this.myNid = 0;
        this.lastInput = 0;
        this.inputSeq = 0;
        this.shieldSpentAt = -1e9;
        // Back from a hidden tab: send no steering until the host has told us
        // where our snake got to while it was on autopilot.
        this.resumePending = false;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && this.role === 'follow') this.resumePending = true;
        });
        this.helloAt = 0;
        this.lastPus = [];

        net.on('data', (from, bytes) => this._onData(from, bytes));
        net.on('host', () => this._onHostChange());
        net.on('members', () => this._onMembers());
        net.on('linkLost', peer => {
            if (this.role === 'follow' && peer === this.net.hostId) this._hello();
        });
    }

    get settings() { return (this.net.room && this.net.room.set) || null; }
    get roomName() { return this.net.room ? this.net.room.name : ''; }
    allowed(key) { return Upgrades.allowed(this.settings, key); }

    _emptyBatch() { return { add: [], del: [], die: [], spawn: [], pu: [], won: [] }; }

    // ================================================================ start

    /** Called once the room server has put us in a room. */
    begin() {
        if (this.net.isHost) this._startHost();
        else this._startFollow();
    }

    _startHost() {
        const g = this.game;
        this.role = 'host';
        g.world.reset();
        g.world.log = { add: [], del: [] };
        g.particles.clear();
        g.snakes = [];
        g.player = null;
        g.ai = new AI(g.collision);
        g.ai.setPressure(Storage.aiPressure(g.saveData));
        g.rivalRoster = [];
        g.gameStartTime = performance.now();
        g.lastUpdate = performance.now();
        this.byNid.clear();
        this.peers.clear();
        while (this._botCount() < this.botTarget()) g._respawnBot();
        this.spawnLocal();
    }

    _startFollow() {
        this.role = 'follow';
        this.synced = false;
        this.wantSpawn = true;
        const g = this.game;
        g.snakes = [];
        g.player = null;
        g.world.food = [];
        g.world.powerups = [];
        g.world.log = null;
        g.ai = new AI(g.collision);
        this.byNid.clear();
        this.hist.clear();
        this.food.clear();
        this._resetClock();
        g.gameStartTime = performance.now();
        this._hello();
    }

    _resetClock() {
        this.offs = [];
        this.clockOff = null;
        this.evq = [];
    }

    /** What this player brings to the room: name, skin and room-legal upgrades. */
    _myStats() {
        const g = this.game;
        return Upgrades.getPlayerStats(g.saveData, this.settings);
    }

    _hello() {
        if (!this.net.hostId || this.net.hostId === this.net.id) return;
        const g = this.game;
        this.helloAt = performance.now();
        this.net.sendJSON(this.net.hostId, {
            t: 'hello',
            nm: g.saveData.username || 'Player',
            sk: g.saveData.selectedSkin,
            st: this._myStats(),
            pr: Storage.aiPressure(g.saveData),
            nid: g.player && g.player.alive ? g.player.nid : 0,
            want: this.wantSpawn && !(g.player && g.player.alive)
        });
    }

    /** Respawn after a death — or the first spawn on joining. */
    respawn() {
        if (this.role === 'host') { this.spawnLocal(); return; }
        this.wantSpawn = true;
        this.net.sendJSON(this.net.hostId, {
            t: 'spawn', nm: this.game.saveData.username || 'Player',
            sk: this.game.saveData.selectedSkin, st: this._myStats()
        });
    }

    // ================================================================ host

    botTarget() {
        return Math.max(NG.MIN_BOTS, CONFIG.BOT_COUNT - (this.net.members.length - 1));
    }

    _botCount() {
        let n = 0;
        for (const s of this.game.snakes) if (s.alive && !s.isPlayer && !s.owner) n++;
        return n;
    }

    adopt(snake) {
        if (!snake.nid) snake.nid = this.nextNid++;
        this.byNid.set(snake.nid, snake);
        if (this.role === 'host') this.batch.spawn.push(this._info(snake));
        return snake;
    }

    _makePlayerSnake(owner, nm, sk, st) {
        return new Snake({
            name: nm, skinId: sk, isPlayer: owner === this.net.id, owner,
            startLength: st.startLength,
            speedLevels: st.speedLevels, speedPerLevel: st.speedPerLevel, levelSpeed: true,
            boostTimeBonus: st.boostTimeBonus, magnetRange: st.magnetRange,
            boostCostReduction: st.boostCostReduction
        });
    }

    /** The host's own snake. */
    spawnLocal() {
        const g = this.game;
        const s = this._makePlayerSnake(this.net.id, g.saveData.username || 'Player',
            g.saveData.selectedSkin, this._myStats());
        g.snakes.push(s);
        this.adopt(s);
        this.myNid = s.nid;
        g._beginLocalRun(s);
    }

    _spawnFor(memberId, m) {
        const g = this.game;
        const peer = this.peers.get(memberId);
        const old = peer && this.byNid.get(peer.nid);
        if (old && old.alive) return old;
        const st = m.st || {};
        const s = this._makePlayerSnake(memberId, String(m.nm || 'Player').slice(0, 16),
            m.sk, {
                startLength: Utils.clamp(+st.startLength || 10, 6, 200),
                speedLevels: Utils.clamp(+st.speedLevels || 0, 0, 12),
                speedPerLevel: CONFIG.META_UPGRADES.baseSpeed.perLevel,
                boostTimeBonus: Utils.clamp(+st.boostTimeBonus || 0, 0, 60000),
                magnetRange: Utils.clamp(+st.magnetRange || 0, 0, 400),
                boostCostReduction: Utils.clamp(+st.boostCostReduction || 0, 0, 0.7)
            });
        s.remote = true;
        g.snakes.push(s);
        this.adopt(s);
        if (peer) {
            peer.nid = s.nid;
            peer.inputAt = performance.now();
            peer.input = null;
            peer.boostTime = s.boostTimeBonus;
        }
        return s;
    }

    _onHostMessage(from, m) {
        const g = this.game;
        let peer = this.peers.get(from);
        if (!peer && (m.t === 'hello' || m.t === 'spawn')) {
            peer = { nid: 0, synced: false, input: null, inputAt: performance.now(), boostReadyAt: 0, pressure: 0 };
            this.peers.set(from, peer);
        }
        if (!peer) return;
        switch (m.t) {
            case 'hello': {
                peer.pressure = Utils.clamp(+m.pr || 0, 0, 1);
                this._retunePressure();
                // A player arriving from the previous host keeps their snake.
                const mine = m.nid && this.byNid.get(m.nid);
                if (mine && mine.owner === from && mine.alive) {
                    peer.nid = mine.nid;
                    mine.remote = true;
                    g.ai.unregister(mine.id);
                } else if (m.want) {
                    this._spawnFor(from, m);
                }
                this._sendWorld(from);
                peer.synced = true;
                break;
            }
            case 'spawn':
                this._spawnFor(from, m);
                break;
            case 'dead': {
                const s = this.byNid.get(peer.nid);
                if (s && s.alive) this.killSnake(s, this.byNid.get(m.k) || null);
                break;
            }
            case 'shield': {
                const s = this.byNid.get(peer.nid);
                if (s) { delete s.powerups.shield; s.shieldGraceUntil = performance.now() + CONFIG.SHIELD_GRACE_MS; }
                break;
            }
            case 'boost': {
                const s = this.byNid.get(peer.nid);
                const now = performance.now();
                if (!s || !s.alive || !this.allowed('boost') || now < peer.boostReadyAt) break;
                const type = Utils.randPick(NG_PU);
                const ms = s.applyPowerup(type.id, CONFIG.BOOST_ABILITY_MS);
                peer.boostReadyAt = now + CONFIG.BOOST_RECHARGE_MS;
                this.batch.pu.push([s.nid, NG_PU_INDEX[type.id], Math.round(ms), 1]);
                break;
            }
        }
    }

    _retunePressure() {
        let sum = Storage.aiPressure(this.game.saveData), n = 1;
        for (const p of this.peers.values()) { sum += p.pressure; n++; }
        this.game.ai.pressure = Utils.clamp(sum / n, 0, 1);
    }

    _info(s) {
        const pu = {};
        const now = performance.now();
        for (const k in s.powerups) {
            const left = s.powerups[k] - now;
            if (left > 0) pu[k] = Math.round(left);
        }
        const info = {
            n: s.nid, id: s.id, nm: s.name, sk: s.skinId, m: +s.mass.toFixed(2),
            x: Math.round(s.x * 4) / 4, y: Math.round(s.y * 4) / 4, a: +s.angle.toFixed(3),
            o: s.owner, t: s.owner ? -1 : (s.aiTier ?? 0), mg: s.magnetRange, k: s.kills, pu
        };
        if (s.owner) {
            info.sl = s.speedLevels;
            info.bt = s.boostTimeBonus;
        }
        const segs = [];
        for (let i = 0; i < s.segCount; i++) segs.push(Math.round(s.segX[i]), Math.round(s.segY[i]));
        info.s = segs;
        return info;
    }

    _foodRow(f) {
        const now = performance.now();
        return [f.fid, Math.round(f.x * 4) / 4, Math.round(f.y * 4) / 4, +f.radius.toFixed(2), f.color,
            +f.value.toFixed(3), (f.isDeath ? 1 : 0) | (f.isBoost ? 2 : 0),
            f.owner ? (this._nidOfId(f.owner) || 0) : 0, Math.max(0, Math.round(f.armAt - now))];
    }

    _nidOfId(id) {
        for (const s of this.byNid.values()) if (s.id === id) return s.nid;
        return 0;
    }

    _sendWorld(to) {
        const g = this.game;
        this.net.sendJSON(to, {
            t: 'world', ht: performance.now(),
            you: (this.peers.get(to) || {}).nid || 0,
            snakes: g.snakes.filter(s => s.alive).map(s => this._info(s)),
            food: g.world.food.map(f => this._foodRow(f)),
            pus: g.world.powerups.map(p => [p.pid, p.x, p.y, NG_PU_INDEX[p.type.id]]),
            nf: g.world.nextFid, np: g.world.nextPid, nn: this.nextNid
        });
    }

    /** Host: a snake dies for any reason. Pellets, particles, and the room is told. */
    killSnake(s, killer) {
        const g = this.game;
        if (!s.alive) return;
        const pellets = s.die(killer);
        g.world.addDeathPellets(pellets);
        g.particles.emitDeath(s.x, s.y, s.skin.colors);
        g.ai.unregister(s.id);
        if (s.isPlayer) {
            if (!g.resolved) { g.audio.playDeath(); g.camera.shake(15); g._onPlayerDeath(killer); }
        } else if (killer && killer.isPlayer) g.audio.playKill();
        this.noteDeath(s, killer);
    }

    noteDeath(s, killer) {
        if (this.role !== 'host') return;
        this.batch.die.push([s.nid, killer ? killer.nid : 0]);
        this.byNid.delete(s.nid);
    }

    notePowerup(s, typeId, ms) {
        if (this.role === 'host' && s.owner) this.batch.pu.push([s.nid, NG_PU_INDEX[typeId], Math.round(ms), 0]);
    }

    /** Host, before the simulation step: steer each remote snake from its player's input. */
    hostBeforeUpdate(dt, now) {
        const g = this.game;
        for (const [id, peer] of this.peers) {
            const s = this.byNid.get(peer.nid);
            if (!s || !s.alive) continue;
            const away = now - peer.inputAt > NG.AWAY_MS;
            if (away && s.remote) {
                // The player has gone quiet (tab hidden, phone locked). Their
                // snake keeps itself alive rather than driving into a wall.
                s.remote = false;
                g.ai.register(s, 'passive', 1);
            } else if (!away && !s.remote) {
                g.ai.unregister(s.id);
                s.remote = true;
            }
            const inp = peer.input;
            if (!s.remote || !inp) continue;
            // Where the player's head is NOW: what they sent, carried forward by
            // the time it took to get here and the time since.
            const link = this.net.link(id);
            const lead = Math.min((link && link.rtt ? link.rtt / 2 : 40), 300) + (now - inp.at);
            const step = s.speed * lead / 16.67;
            const tx = inp.x + Math.cos(inp.a) * step;
            const ty = inp.y + Math.sin(inp.a) * step;
            const ex = tx - s.x, ey = ty - s.y;
            const err = Math.hypot(ex, ey);
            if (err > 160) { s.x = tx; s.y = ty; }
            else { s.x += ex * 0.3; s.y += ey * 0.3; }
            s.angle = inp.a;
            s.targetAngle = inp.ta;
        }
    }

    /** Host, after the simulation step: wins, top-ups, and telling the room. */
    hostAfterUpdate(now) {
        const g = this.game;
        for (const s of g.snakes) {
            if (s.alive && s.owner && !s.isPlayer && s.mass >= CONFIG.WIN_MASS) {
                this.batch.won.push(s.nid);
                this.killSnake(s, null);
            }
        }
        if (g.player && g.player.alive && g.resolved && g.player.mass >= CONFIG.WIN_MASS) {
            // The host won: its snake bursts into a feast for everyone else.
            this.killSnake(g.player, null);
        }
        if (now - this.lastSnap < NG.SNAP_MS) return;
        this.lastSnap = now;

        const log = g.world.log;
        for (const f of log.add) this.batch.add.push(this._foodRow(f));
        for (const fid of log.del) this.batch.del.push(fid);
        log.add.length = 0;
        log.del.length = 0;

        const b = this.batch;
        const hasEvents = b.add.length || b.del.length || b.die.length || b.spawn.length || b.pu.length || b.won.length;
        const snap = this._encodeSnapshot(now);
        for (const [id, peer] of this.peers) {
            if (!peer.synced) continue;
            if (hasEvents) this.net.sendJSON(id, { t: 'ev', ht: now, ...b });
            this.net.sendTo(id, 'u', snap);
        }
        this.batch = this._emptyBatch();
    }

    _encodeSnapshot(now) {
        const g = this.game;
        let need = 13 + g.snakes.length * 18 + g.world.powerups.length * 7;
        if (this._snapBuf.byteLength < need) this._snapBuf = new ArrayBuffer(need * 2);
        const v = new DataView(this._snapBuf);
        let o = 0;
        v.setUint8(o, NET_KIND.SNAP); o += 1;
        v.setFloat64(o, now); o += 8;
        const countAt = o; o += 2;
        let count = 0;
        for (const s of g.snakes) {
            if (!s.alive || !s.nid) continue;
            count++;
            v.setUint16(o, s.nid); o += 2;
            v.setInt16(o, ngQ(s.x)); o += 2;
            v.setInt16(o, ngQ(s.y)); o += 2;
            v.setInt16(o, Math.round(ngWrap(s.angle) * 10000)); o += 2;
            v.setFloat32(o, s.mass); o += 4;
            let flags = 0;
            const secs = [];
            for (let i = 0; i < NG_PU.length; i++) {
                const left = (s.powerups[NG_PU[i].id] || 0) - now;
                if (left > 0) { flags |= 1 << i; secs.push(Math.min(255, Math.ceil(left / 1000))); }
            }
            if (s.isInvulnerable()) flags |= 16;
            if (s.owner && !s.remote && !s.isPlayer) flags |= 32;   // on autopilot
            v.setUint8(o, flags); o += 1;
            for (const sec of secs) { v.setUint8(o, sec); o += 1; }
        }
        v.setUint16(countAt, count);
        v.setUint8(o, g.world.powerups.length); o += 1;
        for (const p of g.world.powerups) {
            v.setUint16(o, p.pid & 0xffff); o += 2;
            v.setInt16(o, ngQ(p.x)); o += 2;
            v.setInt16(o, ngQ(p.y)); o += 2;
            v.setUint8(o, NG_PU_INDEX[p.type.id]); o += 1;
        }
        return new Uint8Array(this._snapBuf, 0, o).slice();
    }

    _onInput(from, bytes) {
        const peer = this.peers.get(from);
        if (!peer) return;
        const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const seq = v.getUint16(1);
        // Unordered lane: ignore anything older than what we already have.
        if (peer.input && ((seq - peer.seq) & 0xffff) > 0x8000) return;
        peer.seq = seq;
        peer.inputAt = performance.now();
        peer.input = {
            x: v.getInt16(3) / NG.POS_SCALE, y: v.getInt16(5) / NG.POS_SCALE,
            a: v.getInt16(7) / 10000, ta: v.getInt16(9) / 10000, at: performance.now()
        };
    }

    _onMembers() {
        if (this.role !== 'host') return;
        const ids = new Set(this.net.members.map(m => m.id));
        for (const [id, peer] of this.peers) {
            if (ids.has(id)) continue;
            const s = this.byNid.get(peer.nid);
            if (s && s.alive) this.killSnake(s, null);
            this.peers.delete(id);
        }
        // Snakes whose player left while another browser was hosting.
        for (const s of this.game.snakes) {
            if (s.alive && s.owner && s.owner !== this.net.id && !ids.has(s.owner)) this.killSnake(s, null);
        }
        this._retunePressure();
    }

    // ================================================================ follower

    _onData(from, bytes) {
        const kind = bytes[0];
        if (kind === NET_KIND.INPUT) { if (this.role === 'host') this._onInput(from, bytes); return; }
        if (kind === NET_KIND.SNAP) { if (this.role === 'follow' && from === this.net.hostId) this._onSnap(bytes); return; }
        if (kind !== NET_KIND.JSON) return;
        const m = Net.decodeJSON(bytes);
        if (!m) return;
        if (this.role === 'host') { this._onHostMessage(from, m); return; }
        if (this.role !== 'follow' || from !== this.net.hostId) return;
        if (m.t === 'world') this._onWorld(m);
        else if (m.t === 'ev' && this.synced) this.evq.push({ ht: m.ht, at: performance.now(), m });
    }

    _onWorld(m) {
        const g = this.game;
        const local = g.player && g.player.alive ? g.player : null;
        this._resetClock();
        this.byNid.clear();
        this.hist.clear();
        g.snakes = [];
        for (const info of m.snakes) {
            let s;
            if (local && info.n === local.nid) {
                s = local;
                s.setMass(info.m);
            } else {
                s = this._snakeFromInfo(info);
            }
            this.byNid.set(s.nid, s);
            g.snakes.push(s);
        }
        this.food.clear();
        g.world.food = [];
        for (const row of m.food) this._addFood(row);
        this._setPowerups(m.pus);
        g.world.nextFid = m.nf; g.world.nextPid = m.np; this.nextNid = m.nn;
        this.synced = true;

        if (m.you && this.byNid.get(m.you)) this._becomeMine(this.byNid.get(m.you));
        else if (local && !this.byNid.get(local.nid)) {
            // The host never heard of our snake (it joined after we spawned on
            // the old host and left again). Ask for a fresh one.
            g.player = null;
            if (this.wantSpawn) this.respawn();
        }
    }

    _snakeFromInfo(info) {
        const s = new Snake({
            id: info.id, nid: info.n, owner: info.o, name: info.nm, skinId: info.sk,
            startLength: info.m, angle: info.a, position: { x: info.x, y: info.y },
            magnetRange: info.mg || 0, speedLevels: info.sl || 0,
            speedPerLevel: CONFIG.META_UPGRADES.baseSpeed.perLevel,
            levelSpeed: !!info.o, boostTimeBonus: info.bt || 0
        });
        s.setMass(info.m);
        if (info.s && info.s.length >= 4) s.seedFromSegments(info.s);
        s.kills = info.k || 0;
        s.aiTier = info.t >= 0 ? info.t : undefined;
        const now = performance.now();
        for (const k in info.pu || {}) s.powerups[k] = now + info.pu[k];
        return s;
    }

    _becomeMine(s) {
        const g = this.game;
        s.isPlayer = true;
        this.myNid = s.nid;
        const fresh = g.player !== s;
        g.player = s;
        if (fresh && this.wantSpawn) {
            this.wantSpawn = false;
            g._beginLocalRun(s);
        }
    }

    _addFood(r) {
        const g = this.game;
        if (this.food.has(r[0])) return;
        const owner = r[7] ? this.byNid.get(r[7]) : null;
        const f = {
            fid: r[0], x: r[1], y: r[2], radius: r[3], color: r[4], value: r[5],
            isDeath: !!(r[6] & 1), isBoost: !!(r[6] & 2),
            glow: r[6] & 1 ? r[3] * 2 : CONFIG.FOOD_GLOW_RADIUS,
            owner: owner ? owner.id : null, armAt: performance.now() + r[8], _i: g.world.food.length
        };
        this.food.set(f.fid, f);
        g.world.food.push(f);
    }

    _delFood(fid) {
        const f = this.food.get(fid);
        if (!f) return;
        this.food.delete(fid);
        const arr = this.game.world.food;
        const last = arr.pop();
        if (last !== f) { arr[f._i] = last; last._i = f._i; }
    }

    _setPowerups(list) {
        const g = this.game;
        const old = new Map(g.world.powerups.map(p => [p.pid, p]));
        g.world.powerups = list.map(([pid, x, y, ti]) => {
            const p = old.get(pid) || { pid, pulsePhase: Math.random() * Math.PI * 2, spawnTime: performance.now() };
            p.x = x; p.y = y; p.type = NG_PU[ti] || NG_PU[0]; p.radius = CONFIG.POWERUP_RADIUS;
            return p;
        });
        this.lastPus = list;
    }

    _onSnap(bytes) {
        if (!this.synced) return;
        const now = performance.now();
        const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        let o = 1;
        const ht = v.getFloat64(o); o += 8;
        const count = v.getUint16(o); o += 2;

        this.offs.push(ht - now);
        if (this.offs.length > 40) this.offs.shift();
        let hi = -Infinity, lo = Infinity;
        for (const x of this.offs) { if (x > hi) hi = x; if (x < lo) lo = x; }
        this.clockOff = hi;
        // Jittery links (a relay, a busy phone) get a deeper buffer.
        this.delay = Utils.clamp(NG.INTERP_MIN + (hi - lo), NG.INTERP_MIN, NG.INTERP_MAX);

        const g = this.game;
        for (let i = 0; i < count; i++) {
            const nid = v.getUint16(o); o += 2;
            const x = v.getInt16(o) / NG.POS_SCALE; o += 2;
            const y = v.getInt16(o) / NG.POS_SCALE; o += 2;
            const a = v.getInt16(o) / 10000; o += 2;
            const m = v.getFloat32(o); o += 4;
            const f = v.getUint8(o); o += 1;
            const secs = [];
            for (let k = 0; k < NG_PU.length; k++) if (f & (1 << k)) { secs.push(v.getUint8(o)); o += 1; }

            if (nid === this.myNid && g.player && g.player.alive) {
                this._ownFromHost(x, y, a, m, f, secs, now);
                continue;
            }
            let h = this.hist.get(nid);
            if (!h) { h = []; this.hist.set(nid, h); }
            if (h.length && h[h.length - 1].t >= ht) continue;
            h.push({ t: ht, x, y, a, m, f, secs });
            if (h.length > 40) h.shift();
        }
        const np = v.getUint8(o); o += 1;
        const pus = [];
        for (let i = 0; i < np; i++) {
            const pid = v.getUint16(o); o += 2;
            const x = v.getInt16(o) / NG.POS_SCALE; o += 2;
            const y = v.getInt16(o) / NG.POS_SCALE; o += 2;
            pus.push([pid, x, y, v.getUint8(o)]); o += 1;
        }
        this._setPowerups(pus);
    }

    _applyPowerupFlags(s, f, secs, now) {
        let j = 0;
        for (let k = 0; k < NG_PU.length; k++) {
            const id = NG_PU[k].id;
            if (f & (1 << k)) {
                const left = secs[j++] * 1000;
                if (id === 'shield' && now - this.shieldSpentAt < NG.SHIELD_IGNORE_MS) continue;
                s.powerups[id] = now + Math.max(left, 200);
            } else {
                delete s.powerups[id];
            }
        }
    }

    _ownFromHost(x, y, a, m, f, secs, now) {
        const g = this.game;
        const p = g.player;
        const before = p.mass;
        p.setMass(m);
        if (m > before + 0.01 && now - g.lastEatSound > 60) {
            g.lastEatSound = now;
            g.audio.playEat();
            g.particles.emitEat(p.x, p.y, p.getColorAt(0));
        }
        this._applyPowerupFlags(p, f, secs, now);
        // Our own position is ours — except while the host was steering for us
        // (we were hidden and went on autopilot). Then the host's is the truth
        // until we take the wheel back.
        if ((f & 32) || this.resumePending) {
            if (Math.hypot(x - p.x, y - p.y) > 30) {
                p.x = x; p.y = y;
                p.angle = p.targetAngle = a;
                p._initBody();
            }
            if (!(f & 32)) this.resumePending = false;
            else this.resumePending = true;
        }
    }

    _sample(h, rt) {
        const n = h.length;
        if (!n) return null;
        if (rt <= h[0].t) return h[0];
        for (let i = n - 1; i > 0; i--) {
            const b = h[i], a = h[i - 1];
            if (a.t <= rt && rt <= b.t) {
                const t = (rt - a.t) / Math.max(1e-6, b.t - a.t);
                return {
                    x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
                    a: a.a + Utils.angleDiff(a.a, b.a) * t, m: a.m + (b.m - a.m) * t,
                    f: b.f, secs: b.secs
                };
            }
        }
        // Past the newest snapshot: keep going the way it was going, briefly.
        const last = h[n - 1];
        const prev = n > 1 ? h[n - 2] : last;
        const span = Math.max(1, last.t - prev.t);
        const ahead = Math.min(rt - last.t, NG.EXTRAP_MS);
        return {
            x: last.x + (last.x - prev.x) / span * ahead, y: last.y + (last.y - prev.y) / span * ahead,
            a: last.a, m: last.m, f: last.f, secs: last.secs
        };
    }

    /** The follower's whole frame. */
    followUpdate(dt, now) {
        const g = this.game;
        if (this.clockOff === null) {
            // Nothing from the host yet (joining, or between hosts): just steer.
            this._steerOwn(dt, now);
            g.particles.update(dt);
            if (this.synced === false && now - this.helloAt > 3000) this._hello();
            return;
        }
        const rt = now + this.clockOff - this.delay;

        // Events land at the moment they happened on our delayed view of the arena.
        while (this.evq.length && (this.evq[0].ht <= rt || now - this.evq[0].at > NG.EVENT_STALE_MS)) {
            this._applyEvents(this.evq.shift().m);
        }

        for (const [nid, h] of this.hist) {
            const s = this.byNid.get(nid);
            if (!s || !s.alive || s === g.player) continue;
            const smp = this._sample(h, rt);
            if (!smp) continue;
            s.angle = smp.a;
            s.eyeAngle = smp.a;
            s.setMass(smp.m);
            s.placeHead(smp.x, smp.y);
            this._applyPowerupFlags(s, smp.f, smp.secs, now);
            if (smp.f & 16) s.shieldGraceUntil = now + 100;
        }

        this._steerOwn(dt, now);

        // Our own head, judged against exactly what is on our screen.
        const p = g.player;
        if (p && p.alive && g.state === 'playing') {
            if (p.boundaryDeath) { this._ownDeath(null, 'edge'); }
            else {
                g.collision.buildFromSnakes(g.snakes);
                const hits = g.collision.checkSnakeCollisions(g.snakes, p);
                if (hits.length) this._ownDeath(hits[0].killer);
                else if (p.isInvulnerable() && !this._shieldSent) {
                    this._shieldSent = true;
                    this.shieldSpentAt = now;
                    this.net.sendJSON(this.net.hostId, { t: 'shield' });
                }
                if (!p.isInvulnerable()) this._shieldSent = false;
            }
        }

        if (p && p.alive && !this.resumePending && now - this.lastInput >= NG.INPUT_MS) this._sendInput(now);
        g.particles.update(dt);
    }

    _steerOwn(dt, now) {
        const g = this.game;
        const p = g.player;
        if (!p || !p.alive || g.state !== 'playing') return;
        const angle = g.input.update(dt, p.angle);
        p.setTarget(angle);
        if (g.input.consumeBoostPress()) this._pressBoost(now);
        p.update(dt);
        if (p.level > g.playerLevel) { g.playerLevel = p.level; g._onLevelUp(p.level); }
        g.camera.follow(p.x, p.y, p.levelZoom);
        g._updateBoostButton(now);
    }

    _pressBoost(now) {
        const g = this.game;
        if (!this.allowed('boost') || now < g.boostReadyAt) return;
        g.boostReadyAt = now + CONFIG.BOOST_RECHARGE_MS;
        this.net.sendJSON(this.net.hostId, { t: 'boost' });
    }

    _sendInput(now) {
        const p = this.game.player;
        this.lastInput = now;
        const b = new Uint8Array(12);
        const v = new DataView(b.buffer);
        b[0] = NET_KIND.INPUT;
        v.setUint16(1, (++this.inputSeq) & 0xffff);
        v.setInt16(3, ngQ(p.x));
        v.setInt16(5, ngQ(p.y));
        v.setInt16(7, Math.round(ngWrap(p.angle) * 10000));
        v.setInt16(9, Math.round(ngWrap(p.targetAngle) * 10000));
        b[11] = 1;
        this.net.sendTo(this.net.hostId, 'u', b);
    }

    _ownDeath(killer, how) {
        const g = this.game;
        const p = g.player;
        if (!p || !p.alive) return;
        this.net.sendJSON(this.net.hostId, { t: 'dead', k: killer ? killer.nid : 0 });
        p.alive = false;
        g.particles.emitDeath(p.x, p.y, p.skin.colors);
        g.audio.playDeath();
        g.camera.shake(15);
        g._onPlayerDeath(killer, how);
    }

    _applyEvents(m) {
        const g = this.game;
        for (const info of m.spawn) {
            if (this.byNid.has(info.n)) continue;
            const s = this._snakeFromInfo(info);
            this.byNid.set(s.nid, s);
            g.snakes.push(s);
            if (info.o === this.net.id && this.wantSpawn) this._becomeMine(s);
        }
        for (const row of m.add) this._addFood(row);
        for (const fid of m.del) this._delFood(fid);
        for (const [nid, typeIdx, ms, fromBoost] of m.pu) {
            const s = this.byNid.get(nid);
            const type = NG_PU[typeIdx];
            if (!s || !type) continue;
            s.powerups[type.id] = performance.now() + ms;
            if (s === g.player) {
                g.audio.playPowerup();
                g.particles.emitPowerup(s.x, s.y, type.color);
                g._showPowerupNotification(type, Math.round(ms / 1000) + 's');
                if (fromBoost) g.boostReadyAt = performance.now() + CONFIG.BOOST_RECHARGE_MS;
            }
        }
        for (const nid of m.won) {
            if (g.player && nid === g.player.nid && g.player.alive) {
                g._onPlayerWin();
                g.player.alive = false;
            }
        }
        let died = false;
        for (const [nid, kn] of m.die) {
            const s = this.byNid.get(nid);
            if (kn && kn === this.myNid && g.player) {
                g.player.kills++;
                if (s !== g.player) g.audio.playKill();
            }
            if (!s) continue;
            this.byNid.delete(nid);
            this.hist.delete(nid);
            died = true;
            if (s === g.player) {
                if (s.alive && !g.resolved) {
                    // The host's call: a head-on clash we lost.
                    s.alive = false;
                    g.particles.emitDeath(s.x, s.y, s.skin.colors);
                    g.audio.playDeath();
                    g._onPlayerDeath(kn ? this.byNid.get(kn) : null);
                }
                s.alive = false;
                continue;
            }
            if (s.alive) g.particles.emitDeath(s.x, s.y, s.skin.colors);
            s.alive = false;
        }
        if (died) g.snakes = g.snakes.filter(s => s.alive || s === g.player);
    }

    // ================================================================ host changes

    _onHostChange() {
        if (!this.role) return;
        const iAmHost = this.net.isHost;
        if (iAmHost && this.role === 'follow') this._promote();
        else if (!iAmHost && this.role === 'host') this._demote();
        else if (!iAmHost) {
            // A different browser is hosting now. Its clock is not the old one.
            this._resetClock();
            this.synced = false;
            this._hello();
        }
    }

    /** A follower takes over the arena from its own copy of it. */
    _promote() {
        const g = this.game;
        const now = performance.now();
        this.role = 'host';
        this.peers.clear();
        g.ai = new AI(g.collision);
        g.ai.setPressure(Storage.aiPressure(g.saveData));
        g.rivalRoster = [];

        // Settle anything still queued, then put every snake at its newest known spot.
        for (const e of this.evq) this._applyEvents(e.m);
        this.evq = [];
        let maxNid = this.nextNid;
        for (const s of g.snakes) {
            if (!s.alive) continue;
            maxNid = Math.max(maxNid, s.nid + 1);
            const h = this.hist.get(s.nid);
            if (s !== g.player && h && h.length) {
                const last = h[h.length - 1];
                s.angle = s.targetAngle = last.a;
                s.placeHead(last.x, last.y);
            }
            if (s === g.player) continue;
            if (s.owner) {
                s.remote = true;
                this.peers.set(s.owner, { nid: s.nid, synced: false, input: null, inputAt: now, boostReadyAt: 0, pressure: 0 });
            } else {
                g.ai.register(s, undefined, s.aiTier ?? 1);
            }
        }
        this.nextNid = maxNid;
        let maxFid = g.world.nextFid;
        for (const f of g.world.food) maxFid = Math.max(maxFid, f.fid + 1);
        g.world.nextFid = maxFid;
        let maxPid = g.world.nextPid;
        for (const p of g.world.powerups) maxPid = Math.max(maxPid, p.pid + 1);
        g.world.nextPid = maxPid;
        g.world.lastPowerupSpawn = now;
        g.world.log = { add: [], del: [] };
        this.hist.clear();
        this._resetClock();
        this.food.clear();
        g.lastUpdate = now;
        this._onMembers();
        if (this.wantSpawn && !(g.player && g.player.alive)) this.spawnLocal();
    }

    /** The host steps aside (tab hidden, or the server gave the arena to someone else). */
    _demote() {
        const g = this.game;
        this.role = 'follow';
        this.peers.clear();
        g.ai = new AI(g.collision);
        g.world.log = null;
        this.food.clear();
        g.world.food.forEach((f, i) => { f._i = i; this.food.set(f.fid, f); });
        this.hist.clear();
        this._resetClock();
        this.batch = this._emptyBatch();
        for (const s of g.snakes) s.remote = false;
        this.synced = false;
        this._hello();
    }

    destroy() {
        this.role = null;
        this.game.world.log = null;
    }

    /** One line for the HUD pill. */
    status() {
        const sum = this.net.linkSummary();
        const n = this.net.members.length;
        if (!sum) return { text: `${this.roomName} · ${n} player${n === 1 ? '' : 's'}`, slow: false };
        const who = `${n} player${n === 1 ? '' : 's'}`;
        if (sum.alone) return { text: `${this.roomName} · just you · waiting for players`, slow: false };
        const role = this.role === 'host' ? 'you are host' : (sum.relayed ? 'relayed' : 'direct');
        const slow = sum.relayed > 0;
        return { text: `${this.roomName} · ${who} · ${role}${sum.rtt ? ' · ' + sum.rtt + 'ms' : ''}`, slow };
    }
}
