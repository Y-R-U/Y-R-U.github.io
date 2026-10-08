/**
 * Net — the room connection: one WebSocket to the room server, plus a direct
 * WebRTC link to every other player in the room.
 *
 * The server only introduces players and keeps the line (first in line hosts).
 * Game traffic goes browser to browser. Every link starts out relayed through
 * the server, so a player can play from the first second, and moves onto the
 * direct connection as soon as one opens. Pairs that can never connect
 * directly (same Wi-Fi without hairpinning, strict mobile NATs) simply stay
 * relayed — slower, but it works.
 *
 * Messages are Uint8Arrays whose first byte says what they are (NET_KIND).
 * Two lanes per link: 'u' (unordered, no retransmits: snapshots and inputs,
 * where only the newest matters) and 'r' (reliable and ordered: everything
 * else). Reliable messages carry a sequence number so the switch from relay to
 * direct can never deliver them out of order.
 */
const NET_KIND = { JSON: 0, SNAP: 1, INPUT: 2, PING: 3, PONG: 4, CHUNK: 5 };
const NET_CHUNK = 15000;          // keeps every message under Safari's SCTP limit
const NET_P2P_TIMEOUT = 8000;     // give up on a direct link after this long
const NET_P2P_RETRY = 15000;
const NET_BEAT_MS = 500;

function netServerUrl() {
    const q = new URLSearchParams(location.search).get('net');
    if (q) return q;
    // The Pages mirror and local copies all use the one server on games.br8t.com.
    return 'wss://games.br8t.com/gms/pwa/snake/net';
}

function netHttpUrl(rest) {
    return netServerUrl().replace(/^ws/, 'http') + rest;
}

const _enc = new TextEncoder();
const _dec = new TextDecoder();

class NetLink {
    constructor(net, peerId) {
        this.net = net;
        this.peer = peerId;
        this.pc = null;
        this.dcU = null;
        this.dcR = null;
        this.direct = false;      // both data channels open
        this.attempts = 0;
        this.failed = false;
        this.rtt = 0;             // ms, smoothed
        this.sendSeq = 0;
        this.recvSeq = 0;
        this.pending = new Map(); // out-of-order reliable messages
        this.chunks = new Map();
        this.chunkId = 0;
        this.queuedIce = [];
        this.timer = null;
        this.lastPing = 0;
        this.offerer = net.id < peerId;
        if (net.p2p) this._start();
    }

    _start() {
        if (typeof RTCPeerConnection === 'undefined') { this.failed = true; return; }
        this.attempts++;
        this._closePc();
        const pc = new RTCPeerConnection({ iceServers: this.net.ice || [] });
        this.pc = pc;
        // Negotiated channels: both ends create them with the same ids, so
        // there is no ondatachannel race to handle.
        this.dcU = pc.createDataChannel('u', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
        this.dcR = pc.createDataChannel('r', { negotiated: true, id: 1, ordered: true });
        for (const dc of [this.dcU, this.dcR]) {
            dc.binaryType = 'arraybuffer';
            dc.onopen = () => this._checkOpen();
            dc.onclose = () => this._lostDirect();
            dc.onmessage = e => this._onData(dc === this.dcU ? 'u' : 'r', new Uint8Array(e.data));
        }
        pc.onicecandidate = e => {
            if (e.candidate) this.net._signal(this.peer, { c: e.candidate.toJSON() });
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed') this._lostDirect();
        };
        if (this.offerer) {
            pc.createOffer()
                .then(o => pc.setLocalDescription(o))
                .then(() => this.net._signal(this.peer, { sdp: pc.localDescription.toJSON() }))
                .catch(() => this._lostDirect());
        }
        clearTimeout(this.timer);
        this.timer = setTimeout(() => { if (!this.direct) this._lostDirect(); }, NET_P2P_TIMEOUT);
    }

    async onSignal(d) {
        if (!this.net.p2p || this.closed) return;
        if (d.restart) { if (this.offerer) this._start(); return; }
        // A fresh offer after a failure needs a fresh connection on this end too.
        if (d.sdp && d.sdp.type === 'offer' && (!this.pc || this.pc.remoteDescription)) this._start();
        if (!this.pc) return;
        const pc = this.pc;
        try {
            if (d.sdp) {
                await pc.setRemoteDescription(d.sdp);
                for (const c of this.queuedIce) await pc.addIceCandidate(c).catch(() => {});
                this.queuedIce = [];
                if (d.sdp.type === 'offer') {
                    await pc.setLocalDescription(await pc.createAnswer());
                    this.net._signal(this.peer, { sdp: pc.localDescription.toJSON() });
                }
            } else if (d.c) {
                if (pc.remoteDescription) await pc.addIceCandidate(d.c).catch(() => {});
                else this.queuedIce.push(d.c);
            }
        } catch (e) { /* a broken negotiation just leaves the link on relay */ }
    }

    _checkOpen() {
        if (this.dcU.readyState === 'open' && this.dcR.readyState === 'open' && !this.direct) {
            this.direct = true;
            clearTimeout(this.timer);
            this.net._linkChanged(this);
        }
    }

    _lostDirect() {
        const was = this.direct;
        this.direct = false;
        clearTimeout(this.timer);
        this._closePc();
        if (was) {
            this.net._linkChanged(this);
            // Anything in flight on the dead channel is gone; let the game resync.
            this.net._emit('linkLost', this.peer);
        }
        if (this.attempts < 2 && this.net.p2p && !this.closed) {
            this.timer = setTimeout(() => {
                if (this.closed) return;
                if (this.offerer) this._start();
                else this.net._signal(this.peer, { restart: true });
            }, NET_P2P_RETRY);
        } else {
            this.failed = true;
            this.net._linkChanged(this);
        }
    }

    _closePc() {
        if (!this.pc) return;
        const pc = this.pc;
        this.pc = null;
        for (const dc of [this.dcU, this.dcR]) if (dc) { dc.onclose = null; dc.onmessage = null; try { dc.close(); } catch (e) {} }
        try { pc.close(); } catch (e) {}
    }

    close() {
        this.closed = true;
        clearTimeout(this.timer);
        this._closePc();
    }

    /** lane 'u' or 'r'; payload Uint8Array starting with its NET_KIND byte. */
    send(lane, payload) {
        if (lane === 'r') {
            if (payload.length > NET_CHUNK) { this._sendChunked(payload); return; }
            const framed = new Uint8Array(payload.length + 4);
            new DataView(framed.buffer).setUint32(0, ++this.sendSeq);
            framed.set(payload, 4);
            payload = framed;
        }
        if (this.direct) {
            const dc = lane === 'u' ? this.dcU : this.dcR;
            if (dc.readyState === 'open') {
                // A congested unreliable lane drops rather than queues: an old
                // snapshot is worse than none.
                if (lane === 'u' && dc.bufferedAmount > 64 * 1024) return;
                try { dc.send(payload); return; } catch (e) { /* fall through to relay */ }
            }
        }
        this.net._relay(this.peer, lane, payload);
    }

    _sendChunked(payload) {
        const id = (++this.chunkId) & 0xffff;
        const size = NET_CHUNK - 16;
        const total = Math.ceil(payload.length / size);
        for (let i = 0; i < total; i++) {
            const part = payload.subarray(i * size, (i + 1) * size);
            const m = new Uint8Array(7 + part.length);
            const v = new DataView(m.buffer);
            m[0] = NET_KIND.CHUNK;
            v.setUint16(1, id); v.setUint16(3, i); v.setUint16(5, total);
            m.set(part, 7);
            this.send('r', m);
        }
    }

    _onData(lane, bytes) {
        if (lane === 'u') { this._deliver(bytes); return; }
        const seq = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
        const body = bytes.subarray(4);
        if (seq <= this.recvSeq) return;                 // already seen via the other path
        if (seq !== this.recvSeq + 1) {
            if (!this.pending.size) this.pendingSince = performance.now();
            this.pending.set(seq, body);
            return;
        }
        this.recvSeq = seq;
        this._deliver(body);
        while (this.pending.has(this.recvSeq + 1)) {
            const next = this.pending.get(this.recvSeq + 1);
            this.pending.delete(++this.recvSeq);
            this._deliver(next);
        }
    }

    _deliver(bytes) {
        const kind = bytes[0];
        if (kind === NET_KIND.PING) {
            const out = new Uint8Array(bytes);
            out[0] = NET_KIND.PONG;
            this.send('u', out);
            return;
        }
        if (kind === NET_KIND.PONG) {
            const sent = new DataView(bytes.buffer, bytes.byteOffset).getFloat64(1);
            const rtt = performance.now() - sent;
            this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
            return;
        }
        if (kind === NET_KIND.CHUNK) {
            const v = new DataView(bytes.buffer, bytes.byteOffset);
            const id = v.getUint16(1), idx = v.getUint16(3), total = v.getUint16(5);
            let c = this.chunks.get(id);
            if (!c) { c = { parts: new Array(total), got: 0 }; this.chunks.set(id, c); }
            if (!c.parts[idx]) { c.parts[idx] = bytes.slice(7); c.got++; }
            if (c.got < total) return;
            this.chunks.delete(id);
            let len = 0;
            for (const p of c.parts) len += p.length;
            const whole = new Uint8Array(len);
            let o = 0;
            for (const p of c.parts) { whole.set(p, o); o += p.length; }
            this._deliver(whole);
            return;
        }
        this.net._emit('data', this.peer, bytes);
    }

    /**
     * A gap that never fills means a message was lost when a path died (a
     * relay drop, a channel closing mid-send). Skip past it rather than stall
     * the link for good, and let the game resync what it missed.
     */
    _unstick(now) {
        if (!this.pending.size || now - this.pendingSince < 2000) return;
        this.recvSeq = Math.min(...this.pending.keys()) - 1;
        const first = this.pending.get(this.recvSeq + 1);
        this.pending.delete(++this.recvSeq);
        this._deliver(first);
        while (this.pending.has(this.recvSeq + 1)) {
            const next = this.pending.get(this.recvSeq + 1);
            this.pending.delete(++this.recvSeq);
            this._deliver(next);
        }
        this.pendingSince = now;
        this.net._emit('linkLost', this.peer);
    }

    ping(now) {
        this._unstick(now);
        if (now - this.lastPing < 1000) return;
        this.lastPing = now;
        const m = new Uint8Array(9);
        m[0] = NET_KIND.PING;
        new DataView(m.buffer).setFloat64(1, now);
        this.send('u', m);
    }
}

class Net {
    constructor() {
        this.ws = null;
        this.id = null;
        this.ice = null;
        this.turn = false;
        this.room = null;         // { id, name, priv, region, set }
        this.code = null;
        this.members = [];        // [{id, name}] in line order
        this.hostId = null;
        this.epoch = 0;
        this.links = new Map();
        this.handlers = {};
        this.lastBeat = 0;
        this.p2p = new URLSearchParams(location.search).get('p2p') !== '0';
        this._queue = [];
        this._wantOpen = false;
    }

    on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); }
    _emit(ev, ...a) { for (const fn of this.handlers[ev] || []) { try { fn(...a); } catch (e) { console.error(e); } } }

    get connected() { return !!this.ws && this.ws.readyState === 1 && !!this.id; }
    get isHost() { return !!this.room && this.hostId === this.id; }

    /** Open the socket (idempotent). Resolves once the server has said hello. */
    connect(name) {
        this.name = name || this.name || 'Player';
        if (this.connected) return Promise.resolve();
        if (this._connecting) return this._connecting;
        this._wantOpen = true;
        this._connecting = new Promise((resolve, reject) => {
            let ws;
            try { ws = new WebSocket(netServerUrl() + '/ws'); }
            catch (e) { this._connecting = null; reject(e); return; }
            ws.binaryType = 'arraybuffer';
            this.ws = ws;
            const fail = setTimeout(() => { try { ws.close(); } catch (e) {} }, 8000);
            ws.onmessage = e => {
                if (typeof e.data === 'string') {
                    let m;
                    try { m = JSON.parse(e.data); } catch (err) { return; }
                    if (m.t === 'welcome') {
                        clearTimeout(fail);
                        this.id = m.id;
                        this.ice = m.ice;
                        this.turn = !!m.turn;
                        this._raw({ t: 'hello', name: this.name, tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '' });
                        for (const q of this._queue) this._raw(q);
                        this._queue = [];
                        this._connecting = null;
                        resolve();
                        return;
                    }
                    this._onServer(m);
                } else {
                    this._onRelay(new Uint8Array(e.data));
                }
            };
            ws.onclose = () => {
                clearTimeout(fail);
                const had = !!this.id;
                this.ws = null;
                this.id = null;
                this._connecting = null;
                this._dropLinks();
                const wasRoom = this.room;
                this.room = null;
                this.members = [];
                this.hostId = null;
                if (!had) reject(new Error('no connection'));
                if (wasRoom) this._emit('closed');
            };
        });
        return this._connecting;
    }

    close() {
        this._wantOpen = false;
        if (this.ws) try { this.ws.close(); } catch (e) {}
    }

    _raw(m) {
        if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
        else this._queue.push(m);
    }

    list() { this._raw({ t: 'list' }); }
    quick() { this._raw({ t: 'quick' }); }
    create(name, settings) { this._raw({ t: 'create', name, set: settings }); }
    join(opts) { this._raw({ t: 'join', code: opts.code || '', id: opts.id || '' }); }
    leave() { this._raw({ t: 'leave' }); this._leftRoom(); }
    handoff(why) {
        if (!this.isHost) return;
        (window.__netlog = window.__netlog || []).push('handoff:' + (why || '?') + '@' + Math.round(performance.now()));
        this._raw({ t: 'handoff' });
    }

    /**
     * Called from the game loop, so a hidden tab (no loop) stops beating.
     * `ready` = this browser holds the whole arena and could take it over.
     */
    beat(now, ready) {
        if (!this.connected || now - this.lastBeat < NET_BEAT_MS) return;
        this.lastBeat = now;
        this.ws.send(ready ? '{"t":"b","r":1}' : '{"t":"b"}');
        for (const l of this.links.values()) l.ping(now);
    }

    _leftRoom() {
        this._dropLinks();
        this.room = null;
        this.members = [];
        this.hostId = null;
        this.code = null;
    }

    _dropLinks() {
        for (const l of this.links.values()) l.close();
        this.links.clear();
    }

    _onServer(m) {
        switch (m.t) {
            case 'rooms':
                this._emit('rooms', m);
                break;
            case 'err':
                this._emit('error', m);
                break;
            case 'room': {
                const prevHost = this.hostId, prevEpoch = this.epoch, wasIn = !!this.room;
                this.room = m.room;
                this.code = m.code || null;
                if (m.ice) this.ice = m.ice;   // TURN arrives only once someone else is in the room
                this.members = m.members;
                this.hostId = m.host;
                this.epoch = m.epoch;
                this._syncLinks();
                const fresh = !wasIn || m.joined;
                if (fresh) this._emit('joined', m);
                this._emit('members', m);
                if (!fresh && (prevHost !== m.host || prevEpoch !== m.epoch)) this._emit('host', m.host, prevHost);
                break;
            }
            case 'sig': {
                const l = this.links.get(m.from);
                if (l) l.onSignal(m.d);
                break;
            }
        }
    }

    /** Full mesh: links to everyone, so a new host already has its wires up. */
    _syncLinks() {
        const ids = new Set(this.members.map(m => m.id));
        for (const [id, l] of this.links) {
            if (!ids.has(id)) { l.close(); this.links.delete(id); }
        }
        for (const m of this.members) {
            if (m.id !== this.id && !this.links.has(m.id)) this.links.set(m.id, new NetLink(this, m.id));
        }
    }

    _signal(to, d) { this._raw({ t: 'sig', to, d }); }

    _relay(to, lane, payload) {
        if (!this.ws || this.ws.readyState !== 1) return;
        const idb = _enc.encode(to);
        const out = new Uint8Array(2 + idb.length + payload.length);
        out[0] = idb.length;
        out.set(idb, 1);
        out[1 + idb.length] = lane === 'u' ? 117 : 114;
        out.set(payload, 2 + idb.length);
        this.ws.send(out);
    }

    _onRelay(b) {
        const n = b[0];
        const from = _dec.decode(b.subarray(1, 1 + n));
        const lane = b[1 + n] === 117 ? 'u' : 'r';
        const l = this.links.get(from);
        if (l) l._onData(lane, b.subarray(2 + n));
    }

    _linkChanged(l) { this._emit('link', l.peer, l.direct); }

    // ------------------------------------------------------------- game I/O

    sendTo(peer, lane, payload) {
        const l = this.links.get(peer);
        if (l) l.send(lane, payload);
    }

    sendJSON(peer, obj) {
        const s = _enc.encode(JSON.stringify(obj));
        const out = new Uint8Array(s.length + 1);
        out[0] = NET_KIND.JSON;
        out.set(s, 1);
        this.sendTo(peer, 'r', out);
    }

    static decodeJSON(bytes) {
        try { return JSON.parse(_dec.decode(bytes.subarray(1))); } catch (e) { return null; }
    }

    link(peer) { return this.links.get(peer); }

    /** For the HUD: how the host link (or, hosting, the worst link) is doing. */
    linkSummary() {
        if (!this.room) return null;
        const others = [...this.links.values()];
        if (!others.length) return { alone: true };
        const pick = this.isHost ? others : others.filter(l => l.peer === this.hostId);
        if (!pick.length) return null;
        let relayed = 0, rtt = 0;
        for (const l of pick) { if (!l.direct) relayed++; rtt = Math.max(rtt, l.rtt); }
        return { relayed, total: pick.length, rtt: Math.round(rtt) };
    }
}
