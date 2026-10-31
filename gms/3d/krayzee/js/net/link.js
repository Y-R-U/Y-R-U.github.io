// Room connection: one WebSocket to krayzeenet plus a WebRTC link to every other member (full mesh).
// Ported from Snake-eee's js/net.js (gms/pwa/snake): every link starts relayed through the server and moves
// to the direct channel when it opens; pairs that never connect directly stay relayed.
// Messages are Uint8Arrays whose first byte is a KIND. Lanes: 'u' unordered/no retransmit (plane states),
// 'r' reliable+ordered with a sequence number so a relay→direct switch can't reorder.

export const KIND = { JSON: 0, PING: 3, PONG: 4, CHUNK: 5, STATE: 6, TRAFFIC: 7 };
const CHUNK = 15000;           // under Safari's SCTP limit
const P2P_TIMEOUT = 8000;
const P2P_RETRY = 15000;
const BEAT_MS = 500;
const RECONNECT_MS = 9000;
const ICE_WAIT = 1500;           // 'disconnected' this long → ICE restart
const ICE_RESTARTS = 3;

const enc = new TextEncoder();
const dec = new TextDecoder();
const nowMs = () => performance.now();

class Link {
  constructor(net, peer) {
    Object.assign(this, { net, peer, pc: null, dcU: null, dcR: null, direct: false, attempts: 0, failed: false, rtt: 0,
      sendSeq: 0, recvSeq: 0, pending: new Map(), chunks: new Map(), chunkId: 0, queuedIce: [], timer: 0, lastPing: 0,
      pings: 0, offerer: net.id < peer, closed: false, restarting: false, restarts: 0, iceTimer: 0 });
    if (net.p2p) this._start();
  }

  _start() {
    if (typeof RTCPeerConnection === 'undefined') { this.failed = true; return; }
    this.attempts++;
    this._closePc();
    const pc = this.pc = new RTCPeerConnection({ iceServers: this.net.ice || [] });
    // Negotiated channels: same ids on both ends, no ondatachannel race.
    this.dcU = pc.createDataChannel('u', { negotiated: true, id: 0, ordered: false, maxRetransmits: 0 });
    this.dcR = pc.createDataChannel('r', { negotiated: true, id: 1, ordered: true });
    for (const dc of [this.dcU, this.dcR]) {
      dc.binaryType = 'arraybuffer';
      dc.onopen = () => this._checkOpen();
      dc.onclose = () => this._lostDirect();
      dc.onmessage = (e) => this._onData(dc === this.dcU ? 'u' : 'r', new Uint8Array(e.data));
    }
    pc.onicecandidate = (e) => { if (e.candidate) this.net._signal(this.peer, { c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && !this.restarting) this._lostDirect(); };
    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      clearTimeout(this.iceTimer);
      if (s === 'connected' || s === 'completed') this._settle();
      else if (s === 'disconnected') this.iceTimer = setTimeout(() => this.iceRestart('disconnected'), ICE_WAIT);
      else if (s === 'failed') this.iceRestart('failed');
    };
    if (this.offerer) {
      pc.createOffer().then((o) => pc.setLocalDescription(o))
        .then(() => this.net._signal(this.peer, { sdp: pc.localDescription.toJSON() }))
        .catch(() => this._lostDirect());
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (!this.direct) this._lostDirect(); }, P2P_TIMEOUT);
  }

  async onSignal(d) {
    if (!this.net.p2p || this.closed) return;
    if (d.ir) { if (this.offerer) this.iceRestart('peer'); return; }
    if (d.restart) { if (this.offerer) this._start(); return; }
    if (d.sdp && d.sdp.type === 'offer' && d.ir2 && this.pc) this._goRelay();
    else if (d.sdp && d.sdp.type === 'offer' && (!this.pc || this.pc.remoteDescription)) this._start();
    const pc = this.pc;
    if (!pc) return;
    try {
      if (d.sdp) {
        await pc.setRemoteDescription(d.sdp);
        for (const c of this.queuedIce) await pc.addIceCandidate(c).catch(() => {});
        this.queuedIce = [];
        if (d.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          this.net._signal(this.peer, { sdp: pc.localDescription.toJSON() });
        }
        if (this.restarting) this._settleSoon();
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

  // Network change (Wi-Fi → 4G) or a stalled path: keep the peer connection and its channels, renegotiate ICE.
  // Traffic goes through the relay until ICE reconnects. The offerer drives it; the other side asks.
  iceRestart(why) {
    if (!this.pc || this.closed || !this.net.p2p) return false;
    if (this.restarts >= ICE_RESTARTS) { if (this.pc.iceConnectionState === 'failed') this._lostDirect(); return false; }
    this._goRelay();
    if (!this.offerer) { this.net._signal(this.peer, { ir: true }); return true; }
    this.restarts++;
    const pc = this.pc;
    this.net._emit('iceRestart', this.peer, why);
    pc.restartIce?.();
    pc.createOffer({ iceRestart: true }).then((o) => pc.setLocalDescription(o))
      .then(() => this.net._signal(this.peer, { sdp: pc.localDescription.toJSON(), ir2: true }))
      .catch(() => this._lostDirect());
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (this.restarting) this._lostDirect(); }, P2P_TIMEOUT);
    return true;
  }

  _settle() {
    const pc = this.pc;
    if (!this.restarting || !pc || !['connected', 'completed'].includes(pc.iceConnectionState) || !pc.remoteDescription || pc.signalingState !== 'stable') return false;
    if (this.dcU.readyState !== 'open' || this.dcR.readyState !== 'open') return false;
    this.restarting = false;
    clearTimeout(this.timer);
    this.direct = true;
    this.net._linkChanged(this);
    this.net._emit('iceRestarted', this.peer);
    return true;
  }
  // A restart on a healthy path may never leave 'connected', so no state event fires: poll after the answer.
  _settleSoon(n = 0) { setTimeout(() => { if (this.restarting && !this._settle() && n < 30) this._settleSoon(n + 1); }, 250); }

  _goRelay() {
    this.restarting = true;
    if (this.direct) { this.direct = false; this.net._linkChanged(this); }
  }

  _lostDirect() {
    this.restarting = false;
    const was = this.direct;
    this.direct = false;
    clearTimeout(this.timer);
    this._closePc();
    if (was) { this.net._linkChanged(this); this.net._emit('linkLost', this.peer); }
    if (this.attempts < 2 && this.net.p2p && !this.closed) {
      this.timer = setTimeout(() => {
        if (this.closed) return;
        if (this.offerer) this._start(); else this.net._signal(this.peer, { restart: true });
      }, P2P_RETRY);
    } else {
      this.failed = true;
      this.net._linkChanged(this);
    }
  }

  _closePc() {
    if (!this.pc) return;
    const pc = this.pc;
    this.pc = null;
    for (const dc of [this.dcU, this.dcR]) if (dc) { dc.onclose = null; dc.onmessage = null; try { dc.close(); } catch (e) { /* closed */ } }
    try { pc.close(); } catch (e) { /* closed */ }
  }

  close() { this.closed = true; clearTimeout(this.timer); clearTimeout(this.iceTimer); this._closePc(); }

  send(lane, payload) {
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
        if (lane === 'u' && dc.bufferedAmount > 64 * 1024) return; // an old state is worse than none
        try { dc.send(payload); return; } catch (e) { /* fall through to relay */ }
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
      this.send('r', m);
    }
  }

  _onData(lane, bytes) {
    if (lane === 'u') { this._deliver(bytes); return; }
    const seq = new DataView(bytes.buffer, bytes.byteOffset).getUint32(0);
    const body = bytes.subarray(4);
    if (seq <= this.recvSeq) return;
    if (seq !== this.recvSeq + 1) {
      if (!this.pending.size) this.pendingSince = nowMs();
      this.pending.set(seq, body);
      return;
    }
    this.recvSeq = seq;
    this._deliver(body);
    this._flushPending();
  }

  _flushPending() {
    while (this.pending.has(this.recvSeq + 1)) {
      const next = this.pending.get(this.recvSeq + 1);
      this.pending.delete(++this.recvSeq);
      this._deliver(next);
    }
  }

  _deliver(bytes) {
    const kind = bytes[0];
    if (kind === KIND.PING) {
      const out = new Uint8Array(17);
      out[0] = KIND.PONG;
      out.set(bytes.subarray(1, 9), 1);
      new DataView(out.buffer).setFloat64(9, this.net.roomTime());
      this.send('u', out);
      return;
    }
    if (kind === KIND.PONG) {
      const v = new DataView(bytes.buffer, bytes.byteOffset);
      const t = nowMs(), rtt = t - v.getFloat64(1);
      this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
      if (bytes.length >= 17) this.net._clockSample(this.peer, v.getFloat64(9), rtt, t);
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
      const whole = new Uint8Array(c.parts.reduce((n, p) => n + p.length, 0));
      let o = 0;
      for (const p of c.parts) { whole.set(p, o); o += p.length; }
      this._deliver(whole);
      return;
    }
    this.net._data(this.peer, bytes);
  }

  // A gap that never fills (a path died mid-send): skip it rather than stall the link for good.
  _unstick(now) {
    if (!this.pending.size || now - this.pendingSince < 2000) return;
    this.recvSeq = Math.min(...this.pending.keys()) - 1;
    this._flushPending();
    this.pendingSince = now;
    this.net._emit('linkLost', this.peer);
  }

  ping(now, fast) {
    this._unstick(now);
    if (now - this.lastPing < (fast && this.pings < 8 ? 200 : 1000)) return;
    this.lastPing = now;
    this.pings++;
    const m = new Uint8Array(9);
    m[0] = KIND.PING;
    new DataView(m.buffer).setFloat64(1, now);
    this.send('u', m);
  }
}

// Net: socket, membership, links, room clock. The game-facing API is in index.js.
export class Net {
  constructor({ server, p2p = true, hello, token }) {
    Object.assign(this, { server, p2p, helloFn: hello, tokenFn: token, ws: null, id: null, tok: null, ice: null, grace: 0,
      room: null, links: new Map(), handlers: {}, lastBeat: 0, queue: [], wantOpen: false, reconnect: null,
      clockOffset: 0, clockBest: [], voices: [] });
    // Page Lifecycle 'freeze' (Chrome backgrounding): drop the socket as "away" (4001) before the browser closes it
    // as "going away", which the server reads as a goodbye. The seat is held for the grace and we resume on wake.
    if (typeof document !== 'undefined') document.addEventListener('freeze', () => { if (this.ws && this.room) try { this.ws.close(4001, 'frozen'); } catch (e) { /* closed */ } });
  }

  on(ev, fn) { (this.handlers[ev] ||= []).push(fn); return () => { this.handlers[ev] = this.handlers[ev].filter((f) => f !== fn); }; }
  _emit(ev, ...a) { for (const fn of this.handlers[ev] || []) { try { fn(...a); } catch (e) { console.error(e); } } }

  get connected() { return !!this.ws && this.ws.readyState === 1 && !!this.id; }
  get hostId() { return this.room?.host || null; }
  get isHost() { return !!this.room && this.room.host === this.id; }

  roomTime() { return nowMs() + this.clockOffset; }

  // Followers keep the host's clock: offset from the lowest-RTT recent sample (Snake's ping/pong clock).
  _clockSample(peer, peerRT, rtt, at) {
    if (peer !== this.hostId || this.isHost) return;
    this.clockBest.push({ rtt, off: peerRT + rtt / 2 - at });
    if (this.clockBest.length > 8) this.clockBest.shift();
    const best = this.clockBest.reduce((a, b) => (b.rtt < a.rtt ? b : a));
    const first = this.clockBest.length === 1;
    this.clockOffset = first || Math.abs(best.off - this.clockOffset) > 250 ? best.off : this.clockOffset + (best.off - this.clockOffset) * 0.2;
    this.clockSynced = true;
  }

  connect() {
    if (this.connected || this.reconnect) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.wantOpen = true;
    return (this.connecting = this._open(null));
  }

  _open(resume) {
    return new Promise((resolve, reject) => {
      let url = this.server + '/ws';
      if (resume) url += `?id=${encodeURIComponent(resume.id)}&tok=${encodeURIComponent(resume.tok)}`;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { this.connecting = null; reject(e); return; }
      ws.binaryType = 'arraybuffer';
      this.ws = ws;
      let welcomed = false;
      const fail = setTimeout(() => { try { ws.close(); } catch (e) { /* closed */ } }, resume ? 4000 : 8000);
      ws.onmessage = (e) => {
        if (ws !== this.ws) return;
        if (typeof e.data !== 'string') { this._onRelay(new Uint8Array(e.data)); return; }
        let m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.t !== 'welcome') { this._onServer(m); return; }
        clearTimeout(fail);
        welcomed = true;
        Object.assign(this, { id: m.id, tok: m.tok, grace: m.grace || 0, voices: m.voices || this.voices, access: m.access || null, connecting: null }); // ACCESS: {signin, allowance, counting}
        if (!this.room) this.ice = m.ice;
        this.sendHello();
        if (resume) {
          if (m.id !== resume.id || !this.room) this._giveUp('lost-id');
          else this._raw({ t: 'rejoin', rj: this._rejoinInfo() });
        }
        for (const q of this.queue) this._raw(q);
        this.queue = [];
        this._emit('connected', m);
        resolve();
      };
      ws.onclose = () => {
        clearTimeout(fail);
        if (ws !== this.ws) return;
        this.ws = null;
        if (!welcomed) { this.connecting = null; reject(new Error('no connection')); return; }
        this._lost();
      };
    });
  }

  async sendHello() {
    const h = { t: 'hello', tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '', ...(this.helloFn?.() || {}) };
    this._raw(h);
    try {
      const tok = await this.tokenFn?.();
      if (tok) this._raw({ t: 'auth', tok });
    } catch (e) { /* signed-out players still fly */ }
  }

  _lost() {
    this.connecting = null;
    if (this.reconnect) { this._retry(); return; }
    if (this.wantOpen && this.room && this.grace > 0 && this.tok) { this._startReconnect(); return; }
    this.id = null;
    this._leftRoom('closed');
    this._emit('disconnected');
  }

  // The socket dropped mid-room. The WebRTC links carry the game, so keep them and quietly get the
  // signalling line back; only if that fails inside the grace do we leave.
  _startReconnect() {
    const rc = { id: this.id, tok: this.tok, tries: 0, timer: 0 }, wait = Math.min(this.grace, RECONNECT_MS), due = Date.now() + wait;
    // A frozen page's timers all fire late at once: give the overdue retry one more chance before giving up.
    const end = (late) => { if (this.reconnect !== rc) return; if (late && Date.now() - due > 1000) { rc.deadline = setTimeout(() => end(false), 4000); return; } this._giveUp('timeout'); };
    rc.deadline = setTimeout(() => end(true), wait);
    this.reconnect = rc;
    this._emit('reconnecting', true);
    this._retry();
  }

  _retry() {
    const rc = this.reconnect;
    if (!rc) return;
    clearTimeout(rc.timer);
    const wait = Math.min(2000, 250 * 2 ** rc.tries++) + Math.random() * 150;
    rc.timer = setTimeout(() => { if (this.reconnect === rc) this._open(rc).catch(() => this._retry()); }, wait);
  }

  _reconnected() {
    const rc = this.reconnect;
    if (!rc) return;
    clearTimeout(rc.timer); clearTimeout(rc.deadline);
    this.reconnect = null;
    this._emit('reconnecting', false);
  }

  _giveUp(why) {
    const rc = this.reconnect;
    if (rc) { clearTimeout(rc.timer); clearTimeout(rc.deadline); }
    this.reconnect = null;
    this._emit('reconnecting', false);
    if (!this.connected) {
      this.id = null;
      if (this.ws) { const ws = this.ws; this.ws = null; try { ws.close(); } catch (e) { /* closed */ } }
    }
    this.queue = [];
    this._leftRoom(why);
  }

  _rejoinInfo() {
    const r = this.room;
    return { id: r.id, code: r.code || '', name: r.name, priv: !!r.priv, region: r.region, set: r.set, phase: r.phase,
      owner: r.owner, members: r.members, epoch: r.epoch };
  }

  _dropSocket() { if (this.ws) this.ws.close(4000); } // test hook: a network blip, no goodbye

  close() {
    this.wantOpen = false;
    if (this.reconnect) this._giveUp('closed');
    if (this.ws) try { this.ws.close(1000); } catch (e) { /* closed */ }
  }

  _raw(m) {
    if (this.ws && this.ws.readyState === 1 && this.id) this.ws.send(JSON.stringify(m));
    else if (m.t !== 'hello' && m.t !== 'auth') this.queue.push(m);
  }

  // Called from the game loop, so a hidden tab (no loop) stops beating and loses the host role.
  beat(now, ready, parked) {
    if (!this.connected) return;
    if (now - this.lastBeat >= BEAT_MS) {
      this.lastBeat = now;
      this.ws.send(JSON.stringify({ t: 'b', r: ready ? 1 : 0, pk: parked ? 1 : 0, i: this.input ? 1 : 0 }));
      this.input = false;
    }
    const fast = !this.clockSynced;
    for (const l of this.links.values()) l.ping(now, fast && l.peer === this.hostId);
  }

  _leftRoom(why) {
    for (const l of this.links.values()) l.close();
    this.links.clear();
    const was = this.room;
    this.room = null;
    this.clockBest = [];
    this.clockSynced = false;
    if (was) this._emit('left', { why });
  }

  _onServer(m) {
    switch (m.t) {
      case 'rooms': this._emit('rooms', m); break;
      case 'auth': this._emit('auth', m); break;
      case 'allowance': this._emit('allowance', m.allowance); break; // ACCESS: spent one free online game
      case 'claim': this._emit('claim', m); break;
      case 'err':
        if (this.reconnect) { this._giveUp(m.code || 'err'); break; }
        this._emit('error', m);
        break;
      case 'kicked':
        this._leftRoom(m.code);
        this._emit('kicked', m);
        break;
      case 'room': {
        this._reconnected();
        const prev = this.room, r = m.room;
        if (m.ice) this.ice = m.ice;
        this.room = r;
        this._syncLinks();
        const fresh = !prev || prev.id !== r.id || m.joined;
        if (fresh) {
          this.clockBest = [];
          this.clockSynced = r.host === this.id;
          if (r.host === this.id && r.members.length === 1) this.clockOffset = 0;
          this._emit('joined', r);
        }
        this._emit('room', r, prev);
        if (!fresh && (prev.host !== r.host || prev.epoch !== r.epoch)) {
          this.clockBest = [];
          this.clockSynced = r.host === this.id;
          this._emit('host', { host: r.host, prev: prev.host, epoch: r.epoch, me: r.host === this.id });
        }
        if (!fresh && prev.phase !== r.phase) this._emit('phase', r.phase, prev.phase);
        if (prev && !fresh) for (const x of prev.members) if (!r.members.some((y) => y.id === x.id)) this._emit('peerLeft', x.id);
        break;
      }
      case 'sig': this.links.get(m.from)?.onSignal(m.d); break;
      case 'rl': this._emit('msg', m.from, m.d); break;
    }
  }

  _syncLinks() {
    const ids = new Set(this.room.members.map((x) => x.id));
    for (const [id, l] of this.links) if (!ids.has(id)) { l.close(); this.links.delete(id); }
    for (const x of this.room.members) if (x.id !== this.id && !this.links.has(x.id)) this.links.set(x.id, new Link(this, x.id));
  }

  _signal(to, d) { this._raw({ t: 'sig', to, d }); }

  restartIce(why = 'network') { let n = 0; for (const l of this.links.values()) if (l.iceRestart(why)) n++; return n; }

  _relay(to, lane, payload) {
    if (!this.ws || this.ws.readyState !== 1) return;
    const idb = enc.encode(to);
    const out = new Uint8Array(2 + idb.length + payload.length);
    out[0] = idb.length;
    out.set(idb, 1);
    out[1 + idb.length] = lane === 'u' ? 117 : 114;
    out.set(payload, 2 + idb.length);
    this.ws.send(out);
  }

  _onRelay(b) {
    const n = b[0];
    const from = dec.decode(b.subarray(1, 1 + n));
    this.links.get(from)?._onData(b[1 + n] === 117 ? 'u' : 'r', b.subarray(2 + n));
  }

  _linkChanged(l) { this._emit('link', l.peer, l.direct); }

  _data(peer, bytes) {
    if (bytes[0] === KIND.JSON) {
      let obj = null;
      try { obj = JSON.parse(dec.decode(bytes.subarray(1))); } catch (e) { return; }
      this._emit('msg', peer, obj);
    } else this._emit('data', peer, bytes);
  }

  sendTo(peer, lane, payload) { this.links.get(peer)?.send(lane, payload); }

  sendJSON(peer, obj, lane = 'r') {
    const s = enc.encode(JSON.stringify(obj));
    const out = new Uint8Array(s.length + 1);
    out[0] = KIND.JSON;
    out.set(s, 1);
    this.sendTo(peer, lane, out);
  }

  linkSummary() {
    if (!this.room) return null;
    const all = [...this.links.values()];
    if (!all.length) return { alone: true };
    const pick = this.isHost ? all : all.filter((l) => l.peer === this.hostId);
    let relayed = 0, rtt = 0;
    for (const l of pick) { if (!l.direct) relayed++; rtt = Math.max(rtt, l.rtt); }
    return { relayed, total: pick.length, rtt: Math.round(rtt) };
  }
}
