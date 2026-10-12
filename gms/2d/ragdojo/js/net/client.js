// The arena connection: one WebSocket to the arena server (lobby, matching, signalling, the
// relay of last resort) and one WebRTC link per opponent. Adapted from Snake-eee's js/net.js.
//
// A link starts relayed through the server so play can begin at once, and moves onto the
// direct connection the moment both data channels open. Two lanes: 'u' (unordered, no
// retransmits: snapshots and the stick) and 'r' (reliable, ordered: actions and events).
// Reliable messages carry a sequence number so the relay->direct switch never reorders them.

import { KIND } from './wire.js';

const CHUNK = 15000;
const P2P_TIMEOUT = 8000;
const P2P_RETRY = 6000;
const _enc = new TextEncoder(), _dec = new TextDecoder();
// Dev/test only (localhost or LAN): ?arenalag=<rtt ms> delays everything this browser sends by
// half of it, with jitter on the unreliable lane, to measure feel at a real distance.
const LAG = ['localhost', '127.0.0.1'].includes(location.hostname) || /^192\./.test(location.hostname)
  ? +(new URLSearchParams(location.search).get('arenalag') || 0) : 0;

export class NetLink {
  constructor(net, peer, ice) {
    this.net = net;
    this.peer = peer;
    this.ice = ice || [];
    this.pc = null; this.dcU = null; this.dcR = null;
    this.direct = false;
    this.attempts = 0;
    this.failed = false;
    this.rtt = 0;
    this.rttN = 0;
    this.sendSeq = 0; this.recvSeq = 0;
    this.pending = new Map();
    this.chunks = new Map(); this.chunkId = 0;
    this.queuedIce = [];
    this.timer = null;
    this.lastPing = 0;
    this.closed = false;
    this.offerer = net.id < peer;
    if (net.p2p) this._start();
  }

  _start() {
    if (typeof RTCPeerConnection === 'undefined') { this.failed = true; return; }
    this.attempts++;
    this._closePc();
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    this.pc = pc;
    this.dcU = pc.createDataChannel('u', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
    this.dcR = pc.createDataChannel('r', { negotiated: true, id: 1, ordered: true });
    for (const dc of [this.dcU, this.dcR]) {
      dc.binaryType = 'arraybuffer';
      dc.onopen = () => this._checkOpen();
      dc.onclose = () => this._lostDirect();
      dc.onmessage = (e) => this._onData(dc === this.dcU ? 'u' : 'r', new Uint8Array(e.data));
    }
    pc.onicecandidate = (e) => { if (e.candidate) this.net._signal(this.peer, { c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') this._lostDirect(); };
    if (this.offerer) {
      pc.createOffer()
        .then((o) => pc.setLocalDescription(o))
        .then(() => this.net._signal(this.peer, { sdp: pc.localDescription.toJSON() }))
        .catch(() => this._lostDirect());
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (!this.direct) this._lostDirect(); }, P2P_TIMEOUT);
  }

  async onSignal(d) {
    if (!this.net.p2p || this.closed) return;
    if (d.restart) { if (this.offerer) this._start(); return; }
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
    } catch { /* a broken negotiation leaves the link on the relay */ }
  }

  _checkOpen() {
    if (this.dcU.readyState === 'open' && this.dcR.readyState === 'open' && !this.direct) {
      this.direct = true;
      clearTimeout(this.timer);
      this.net._emit('link', this.peer, true);
    }
  }

  _lostDirect() {
    const was = this.direct;
    this.direct = false;
    clearTimeout(this.timer);
    this._closePc();
    if (was) this.net._emit('link', this.peer, false);
    if (this.attempts < 2 && this.net.p2p && !this.closed) {
      this.timer = setTimeout(() => {
        if (this.closed) return;
        if (this.offerer) this._start();
        else this.net._signal(this.peer, { restart: true });
      }, P2P_RETRY);
    } else {
      this.failed = true;
      this.net._emit('link', this.peer, false);
    }
  }

  _closePc() {
    if (!this.pc) return;
    const pc = this.pc;
    this.pc = null;
    for (const dc of [this.dcU, this.dcR]) if (dc) { dc.onclose = null; dc.onmessage = null; try { dc.close(); } catch {} }
    try { pc.close(); } catch {}
  }

  close() { this.closed = true; clearTimeout(this.timer); this._closePc(); }

  send(lane, payload) {
    if (LAG > 0) {
      const copy = payload.slice();
      setTimeout(() => this._send(lane, copy), LAG / 2 + (lane === 'u' ? Math.random() * LAG * 0.15 : 0));
      return;
    }
    this._send(lane, payload);
  }

  _send(lane, payload) {
    if (lane === 'r') {
      if (payload.length > CHUNK) { this._sendChunked(payload); return; }
      const framed = new Uint8Array(payload.length + 4);
      new DataView(framed.buffer).setUint32(0, ++this.sendSeq);
      framed.set(payload, 4);
      payload = framed;
    }
    if (this.direct) {
      const dc = lane === 'u' ? this.dcU : this.dcR;
      if (dc.readyState === 'open') {
        // A congested unreliable lane drops rather than queues: an old snapshot is worse than none.
        if (lane === 'u' && dc.bufferedAmount > 32 * 1024) return;
        try { dc.send(payload); return; } catch { /* fall through to the relay */ }
      }
    }
    this.net._relay(this.peer, lane, payload);
  }

  _sendChunked(payload) {
    const id = (++this.chunkId) & 0xffff, size = CHUNK - 16, total = Math.ceil(payload.length / size);
    for (let i = 0; i < total; i++) {
      const part = payload.subarray(i * size, (i + 1) * size);
      const m = new Uint8Array(7 + part.length), v = new DataView(m.buffer);
      m[0] = KIND.CHUNK; v.setUint16(1, id); v.setUint16(3, i); v.setUint16(5, total);
      m.set(part, 7);
      this._send('r', m);
    }
  }

  _onData(lane, bytes) {
    if (lane === 'u') { this._deliver(bytes, 'u'); return; }
    const seq = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
    const body = bytes.subarray(4);
    if (seq <= this.recvSeq) return;
    if (seq !== this.recvSeq + 1) {
      if (!this.pending.size) this.pendingSince = performance.now();
      this.pending.set(seq, body);
      return;
    }
    this.recvSeq = seq;
    this._deliver(body, 'r');
    while (this.pending.has(this.recvSeq + 1)) {
      const next = this.pending.get(this.recvSeq + 1);
      this.pending.delete(++this.recvSeq);
      this._deliver(next, 'r');
    }
  }

  _deliver(bytes, lane) {
    const kind = bytes[0];
    if (kind === KIND.PING) {
      const out = new Uint8Array(bytes);
      out[0] = KIND.PONG;
      this.send('u', out);
      return;
    }
    if (kind === KIND.PONG) {
      const rtt = performance.now() - new DataView(bytes.buffer, bytes.byteOffset).getFloat64(1);
      this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
      this.rttN++;
      this.net._emit('rtt', this.peer, this.rtt);
      return;
    }
    if (kind === KIND.CHUNK) {
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
      this._deliver(whole, 'r');
      return;
    }
    this.net._emit('data', this.peer, bytes, lane);
  }

  /** A gap that never fills means a message died with a path; skip it rather than stall. */
  _unstick(now) {
    if (!this.pending.size || now - this.pendingSince < 1500) return;
    this.recvSeq = Math.min(...this.pending.keys()) - 1;
    while (this.pending.has(this.recvSeq + 1)) {
      const next = this.pending.get(this.recvSeq + 1);
      this.pending.delete(++this.recvSeq);
      this._deliver(next, 'r');
    }
    this.pendingSince = now;
  }

  ping(now, every = 1000) {
    this._unstick(now);
    if (now - this.lastPing < every) return;
    this.lastPing = now;
    const m = new Uint8Array(9);
    m[0] = KIND.PING;
    new DataView(m.buffer).setFloat64(1, now);
    this.send('u', m);
  }
}

/**
 * The arena server connection. Events: welcome, me, lobby, friend, offer, accepted, go,
 * result, void, cancel, left, rematch, err, closed, link (peer, direct), rtt, data.
 */
export class ArenaClient {
  constructor(base) {
    this.base = base.replace(/\/$/, '');
    this.ws = null;
    this.id = null;
    this.me = null;
    this.links = new Map();
    this.handlers = {};
    this.queue = [];
    this.p2p = new URLSearchParams(location.search).get('p2p') !== '0';
  }

  on(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); }
  off(ev, fn) { this.handlers[ev] = (this.handlers[ev] || []).filter((f) => f !== fn); }
  _emit(ev, ...a) { for (const fn of this.handlers[ev] || []) { try { fn(...a); } catch (e) { console.error(e); } } }

  get connected() { return !!this.ws && this.ws.readyState === 1 && !!this.id; }

  static async probe(base, ms = 2500) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(base.replace(/\/$/, '') + '/health', { cache: 'no-store', signal: ctl.signal });
      const j = r.ok ? await r.json() : null;
      return !!(j && j.ok);
    } catch { return false; } finally { clearTimeout(t); }
  }

  connect(hello, resume = null) {
    if (this.connected) return Promise.resolve();
    if (this._connecting) return this._connecting;
    this.hello = hello;
    this.wantOpen = true;
    this._connecting = new Promise((resolve, reject) => {
      let ws;
      const q = resume ? `?id=${encodeURIComponent(resume.id)}&tok=${encodeURIComponent(resume.tok)}` : '';
      try { ws = new WebSocket(this.base.replace(/^http/, 'ws') + '/ws' + q); } catch (e) { this._connecting = null; reject(e); return; }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      const fail = setTimeout(() => { try { ws.close(); } catch {} }, 8000);
      let welcomed = false;
      ws.onmessage = (e) => {
        if (ws !== this.ws) return;
        if (typeof e.data !== 'string') { this._onRelay(new Uint8Array(e.data)); return; }
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'welcome') {
          clearTimeout(fail);
          welcomed = true;
          this.id = m.id;
          this.tok = m.tok;
          this.grace = m.grace || 0;
          this._connecting = null;
          if (!m.resumed) this._raw({ t: 'hello', tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '', ...hello });
          else this._emit('resumed');
          for (const q of this.queue) this._raw(q);
          this.queue = [];
          resolve();
          return;
        }
        this._onServer(m);
      };
      ws.onclose = () => {
        clearTimeout(fail);
        if (ws !== this.ws) return;
        this.ws = null;
        if (!welcomed) { this._connecting = null; reject(new Error('no connection')); return; }
        // Mid-match the seat is held for the grace: keep the WebRTC links (the fight may well
        // still be flowing over them) and quietly get the signalling line back.
        if (this.wantOpen && this.inMatch && this.tok && this.grace) { this._resume(); return; }
        this.id = null;
        this._dropLinks();
        this._emit('closed');
      };
    });
    return this._connecting;
  }

  _resume() {
    const until = performance.now() + this.grace - 500;
    const resume = { id: this.id, tok: this.tok };
    this._emit('reconnecting', true);
    const tryOnce = () => {
      if (!this.wantOpen) return;
      if (performance.now() > until) { this.id = null; this._dropLinks(); this._emit('closed'); return; }
      this.connect(this.hello, resume).then(() => this._emit('reconnecting', false))
        .catch(() => setTimeout(tryOnce, 700));
    };
    setTimeout(tryOnce, 250);
  }

  /** Test hook: the socket dies without a goodbye, as a network blip kills it. */
  _dropSocket() { if (this.ws) this.ws.close(4000); }

  close() { this.wantOpen = false; if (this.ws) { try { this.ws.close(1000); } catch {} } }

  _raw(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
    else this.queue.push(m);
  }

  // ── lobby / match commands ───────────────────────────────────────────
  setName(name) { this._raw({ t: 'name', name }); }
  auth(tok) { this._raw({ t: 'auth', tok }); }
  lobby(on) { this._raw({ t: 'lobby', on }); }
  wait(type = 'duel') { this._raw({ t: 'wait', type }); }
  unwait() { this._raw({ t: 'unwait' }); }
  challenge(to) { this._raw({ t: 'challenge', to }); }
  friend(type = 'duel') { this._raw({ t: 'friend', type }); }
  join(code) { this._raw({ t: 'join', code }); }
  accept(match, tok) { this._raw({ t: 'accept', match, tok: tok || '' }); }
  decline(match) { this._raw({ t: 'decline', match }); this._dropLinks(); }
  rematch(match) { this._raw({ t: 'rematch', match }); }
  report(match, round, winner, ko) { this._raw({ t: 'round', match, round, winner, ko }); }
  leave() { this.inMatch = false; this._raw({ t: 'leave' }); this._dropLinks(); }

  _onServer(m) {
    switch (m.t) {
      case 'p': this._raw({ t: 'q', s: m.s }); return;
      case 'me': this.me = m; break;
      case 'sig': { const l = this.links.get(m.from); if (l) l.onSignal(m.d); return; }
      case 'offer': this._syncLinks(m.peers.map((p) => p.id), m.ice); break;
      case 'go': this.inMatch = true; break;
      case 'result': this.inMatch = false; break;
      case 'cancel': case 'void': case 'left': this.inMatch = false; this._dropLinks(); break;
    }
    this._emit(m.t, m);
  }

  _syncLinks(ids, ice) {
    const want = new Set(ids);
    for (const [id, l] of this.links) if (!want.has(id)) { l.close(); this.links.delete(id); }
    for (const id of ids) if (!this.links.has(id)) this.links.set(id, new NetLink(this, id, ice));
  }

  _dropLinks() { for (const l of this.links.values()) l.close(); this.links.clear(); }

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

  send(peer, lane, payload) { const l = this.links.get(peer); if (l) l.send(lane, payload); }
  link(peer) { return this.links.get(peer); }
  pingLinks(now, every) { for (const l of this.links.values()) l.ping(now, every); }
}
