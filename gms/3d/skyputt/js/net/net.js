// SKYPUTT online client: one websocket to server/ (protocol in server/README.md), modelled on
// GAMBIT's js/app/net.js.
//
//   import { net } from './net.js';
//   net.on('room', ({ room, ev }) => …);  await net.connect({ name });
//   await net.quick(opts) / net.createRoom(opts) / net.joinRoom(code)
//   net.shot({...}) · net.result({...}) · net.mulligan({...}) · net.next()
//
// Auto-reconnects with backoff; the welcome brings back the room you were in. Requests return
// Promises that reject with an Error carrying .code. Works in Node >= 22 too (global WebSocket).

// 2 = ball hits (collide / balls / knocks). The server refuses clients below its minimum with
// `old_client`; a server newer than this build raises the 'update' event (docs/notes/protogate.md).
export const PROTOCOL = 2;
export const OLD_CLIENT_TEXT = 'SKYPUTT has been updated. Reload the page to play online.';
const oldClientErr = (msg = OLD_CLIENT_TEXT) => Object.assign(new Error(msg), { code: 'old_client' });

// D11: shown wherever online play is offered.
export const CHEAT_WARNING = 'Scores are reported by each player’s own game. There is no cheat detection yet, so play with people you trust and try not to stress about odd scores.';

const hasLoc = typeof location !== 'undefined';

// Is the public online server deployed? Not until Aaron okays it (D11). While false, a page served
// from anywhere but localhost / the LAN (GitHub Pages, games.br8t.com) never touches the network
// for online play and the Online screen says "coming soon". Flip to true in the deploy that ships
// server/ (or pass ?server=<base> to test a server).
export const ONLINE_PUBLIC = true;
export const LOCAL_PORT = 8098;   // tools/server_run.sh (8094 is GAMBIT's)

// Local-only hint for the title's "Rejoin" button (no connection at boot).
export const HINT_KEY = 'skyputt.local.online';
export function readHint() {
  try {
    const v = JSON.parse(localStorage.getItem(HINT_KEY) || 'null');
    return v && v.code && Date.now() - (v.at || 0) < 3 * 3600e3 ? v : null;
  } catch { return null; }
}
export function writeHint(room) {
  try {
    if (room && room.state !== 'ended') localStorage.setItem(HINT_KEY, JSON.stringify({ code: room.code, state: room.state, at: Date.now() }));
    else localStorage.removeItem(HINT_KEY);
  } catch { /* storage blocked */ }
}

export function defaultBase() {
  if (!hasLoc) return `http://127.0.0.1:${LOCAL_PORT}/gms/3d/skyputt`;
  const q = new URLSearchParams(location.search).get('server');
  if (q === 'none') return null;                  // test: behave like a host without a server
  if (q) return q.replace(/\/$/, '');
  const h = location.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local') ||
      /^(192\.168|10)\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    return `http://${h}:${LOCAL_PORT}/gms/3d/skyputt`;
  }
  if (!ONLINE_PUBLIC) return null;                // not deployed yet: no network at all
  if (h === 'games.br8t.com') return location.origin + '/gms/3d/skyputt';
  return 'https://games.br8t.com/gms/3d/skyputt';
}

// Dev identity (server must run with SKYPUTT_DEV_AUTH): ?devuid=alice&devname=Alice, or a random
// per-tab uid when no Firebase token is available. sessionStorage, so two tabs are two players.
function devFromURL() {
  if (!hasLoc) return null;
  const p = new URLSearchParams(location.search);
  const uid = p.get('devuid');
  return uid ? { uid, name: p.get('devname') || uid, signed: p.get('devsigned') === '1' } : null;
}
function randomDev() {
  let uid = null;
  try { uid = sessionStorage.getItem('skyputtdev.uid'); } catch { /* */ }
  if (!uid) {
    uid = 'tab' + Math.random().toString(36).slice(2, 8);
    try { sessionStorage.setItem('skyputtdev.uid', uid); } catch { /* */ }
  }
  return { uid, name: '', signed: false };
}
const devToken = d => `dev:${d.uid}:${(d.name || '').replace(/:/g, ' ')}:${d.signed ? 'signed' : 'anon'}`;

// Firebase ID token from the shared account layer (/lib/auth/), anonymous users included, as GAMBIT.
let authMod = null;
async function firebaseToken(force = false) {
  try {
    authMod = authMod || await import('/lib/auth/auth.js');
    const { auth } = authMod;
    await auth.ready();
    if (auth.signedIn && !force) { const t = await auth.getIdToken(); if (t) return t; }
    if (auth.getIdTokenAnyUser) return await auth.getIdTokenAnyUser(force);
    const { SDK } = await import('/lib/auth/config.js');
    const [app, fa] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`)]);
    const user = fa.getAuth(app.getApp()).currentUser;
    return user ? await user.getIdToken(force) : null;
  } catch { return null; }
}
const withTimeout = (p, ms, v = null) => Promise.race([p, new Promise(r => setTimeout(() => r(v), ms))]);

// Messages worth resending after a reconnect (the server answers stale ones with an error).
const RESEND = new Set(['shot', 'result', 'mulligan', 'next']);

export class SkyputtNet {
  constructor() {
    this.base = null;
    this.state = 'idle';     // idle | connecting | open | reconnecting | closed
    this.me = null;          // { pid, name, anon, dev }
    this.room = null;        // last room snapshot (server view)
    this.lobby = null;
    this.offset = 0;         // serverNow - Date.now()
    this.update = null;      // { server, min, blocked } once the server speaks a newer protocol
    this._ws = null; this._ls = new Map(); this._pending = new Map(); this._id = 0;
    this._opts = {}; this._retry = 0; this._timers = []; this._lobbyOn = false; this._bestRtt = Infinity;
    this.timeoutMs = 10000;
  }

  on(type, fn) { if (!this._ls.has(type)) this._ls.set(type, new Set()); this._ls.get(type).add(fn); return () => this.off(type, fn); }
  off(type, fn) { this._ls.get(type)?.delete(fn); }
  _emit(type, data) {
    for (const fn of this._ls.get(type) || []) { try { fn(data); } catch (e) { console.warn('[net] listener', type, e); } }
  }
  _setState(s) { if (this.state !== s) { this.state = s; this._emit('state', s); } }

  /** true when this host has an online server configured (else show "coming soon"). */
  get configured() { return !!(this._opts.base || this.base || defaultBase()); }

  /** One /api/health probe (4 s). */
  async available() {
    const base = this._opts.base || this.base || defaultBase();
    if (!base) return false;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const res = await fetch(base.replace(/\/$/, '') + '/api/health', { cache: 'no-store', signal: ctl.signal });
      clearTimeout(t);
      const j = res.ok ? await res.json().catch(() => null) : null;
      if (j) { this._dev = !!j.devAuth; this.noteProtocol(j.protocol, j.minProtocol); }
      return !!(j && j.ok);
    } catch { return false; }
  }

  connect(opts = {}) {
    this._opts = { ...this._opts, ...opts };
    const base = this._opts.base || this.base || defaultBase();
    if (!base) return Promise.reject(Object.assign(new Error('online play is not available here yet'), { code: 'unavailable' }));
    this.base = base.replace(/\/$/, '');
    if (this.update?.blocked) return Promise.reject(oldClientErr());
    if (this.state === 'open') return Promise.resolve(this._welcome);
    if (this._connecting) return this._connecting;
    this._closedByUser = false;
    this._connecting = new Promise((resolve, reject) => { this._welcomeWaiter = { resolve, reject }; });
    this._open();
    return this._connecting;
  }

  close() {
    this._closedByUser = true;
    clearTimeout(this._reconnectT);
    this._timers.forEach(clearInterval); this._timers = [];
    try { this._ws?.close(1000); } catch { /* */ }
    this._ws = null;
    for (const [, p] of this._pending) { clearTimeout(p.timer); p.reject(Object.assign(new Error('closed'), { code: 'offline' })); }
    this._pending.clear();
    if (this._welcomeWaiter) { this._welcomeWaiter.reject(Object.assign(new Error('closed'), { code: 'offline' })); this._welcomeWaiter = null; }
    this._connecting = null;
    this._setState('closed');
  }

  async _token(fresh = false) {
    const d = this._opts.devUser || devFromURL();
    if (d) return devToken(d);
    const t = (fresh && await withTimeout(firebaseToken(true), 6000)) || await withTimeout(firebaseToken(), 6000);
    if (t) return t;
    if (this._dev === undefined) await this.available();
    return this._dev ? devToken(randomDev()) : null;   // local dev server without Firebase
  }

  async _open() {
    this._setState(this._retry ? 'reconnecting' : 'connecting');
    const token = await this._token(this._retry > 0);
    if (this._closedByUser) return;
    if (!token) {
      this._fail(Object.assign(new Error('could not get a sign-in token'), { code: 'no_token' }));
      return this._scheduleReconnect();
    }
    let ws;
    try { ws = new WebSocket(this.base.replace(/^http/, 'ws') + '/api/ws'); } catch { return this._scheduleReconnect(); }
    this._ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, token, name: this._opts.name || '' }));
    ws.onmessage = e => { if (this._ws !== ws) return; let m; try { m = JSON.parse(e.data); } catch { return; } this._onMessage(m); };
    ws.onclose = e => {
      if (this._ws !== ws) return;
      this._ws = null;
      this._timers.forEach(clearInterval); this._timers = [];
      for (const [id, p] of this._pending) {
        if (p.queued) continue;
        if (RESEND.has(p.msg.t)) { p.queued = true; continue; }
        clearTimeout(p.timer); this._pending.delete(id);
        p.reject(Object.assign(new Error('connection lost'), { code: 'offline' }));
      }
      if (this._closedByUser) return this._setState('closed');
      this._scheduleReconnect();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  _fail(err) {
    if (this._welcomeWaiter && this._retry >= 2) { this._welcomeWaiter.reject(err); this._welcomeWaiter = null; this._connecting = null; }
    this._emit('error', err);
  }

  _scheduleReconnect() {
    if (this._closedByUser) return;
    this._setState('reconnecting');
    const ms = Math.min(12000, 800 * 2 ** Math.min(this._retry, 4)) * (0.8 + Math.random() * 0.4);
    this._retry++;
    if (this._retry === 3) this._fail(Object.assign(new Error('cannot reach the online server'), { code: 'offline' }));
    clearTimeout(this._reconnectT);
    this._reconnectT = setTimeout(() => this._open(), ms);
  }

  _send(m) { if (this._ws && this._ws.readyState === 1) { this._ws.send(JSON.stringify(m)); return true; } return false; }

  /** Low-level request; waits for the connection if it is (re)connecting. */
  request(t, body = {}, timeoutMs = this.timeoutMs) {
    const id = ++this._id;
    const msg = { t, id, ...body };
    return new Promise((resolve, reject) => {
      const p = { resolve, reject, msg, queued: false, timeoutMs };
      this._pending.set(id, p);
      this._arm(id, p);
      if (this.state !== 'open' || !this._send(msg)) p.queued = true;
    });
  }
  _arm(id, p) {
    clearTimeout(p.timer);
    p.timer = setTimeout(() => {
      if (RESEND.has(p.msg.t) && p.queued && !this._closedByUser) return;   // waits for the welcome
      this._pending.delete(id);
      p.reject(Object.assign(new Error('timed out'), { code: 'timeout' }));
    }, p.timeoutMs);
  }
  _flushQueued() {
    for (const [id, p] of this._pending) {
      if (!p.queued) continue;
      p.queued = false;
      this._send(p.msg);
      this._arm(id, p);
    }
  }

  /** The sign-in token the websocket hello uses (Firebase ID token or a dev token); null if none. */
  authToken(fresh = false) { return this._token(fresh); }

  serverNow() { return Date.now() + this.offset; }
  _ping() {
    const sent = Date.now();
    this.request('ping', {}, 5000).then(r => {
      const rtt = Date.now() - sent;
      if (rtt <= this._bestRtt * 1.5 || rtt < 150) { this._bestRtt = Math.min(this._bestRtt, rtt); this.offset = r.now + rtt / 2 - Date.now(); }
    }).catch(() => { /* */ });
  }

  _onMessage(m) {
    if ((m.t === 'ok' || m.t === 'error' || m.t === 'pong') && m.id && this._pending.has(m.id)) {
      const p = this._pending.get(m.id);
      clearTimeout(p.timer);
      this._pending.delete(m.id);
      if (m.room && typeof m.room === 'object' && m.room.seats) this._setRoom(m.room);
      if (m.t === 'error') p.reject(Object.assign(new Error(m.error || m.code), { code: m.code, data: m }));
      else p.resolve(m);
      return;
    }
    switch (m.t) {
      case 'welcome': return this._onWelcome(m);
      case 'error':
        if (m.code === 'old_client') return this._outdated(m);
        if (m.code === 'bad_token') this._emit('error', Object.assign(new Error(m.error), { code: m.code })); return;
      case 'lobby': this.lobby = m.lobby; return this._emit('lobby', m.lobby);
      case 'room': this._setRoom(m.room); return this._emit('room', { room: this.room, ev: m.ev || null });
      case 'roomClosed':
        if (this.room && this.room.code === m.code) { this.room = null; writeHint(null); }
        return this._emit('roomClosed', m);
      case 'shot': case 'result': case 'mulligan': case 'knock':
        return this._emit(m.t, m);
    }
  }

  _setRoom(r) { this.room = r; if (r && Number.isFinite(r.now)) { /* snapshot time is informational */ } writeHint(r); }

  /**
   * A server's protocol (welcome `v`/`min`, health `protocol`/`minProtocol`). Newer than PROTOCOL →
   * this.update + an 'update' event ({ server, min, blocked }; blocked = this build can't play).
   */
  noteProtocol(v, min) {
    v = Number(v) || 0; min = Number(min) || 0;
    const blocked = min > PROTOCOL;
    if (v <= PROTOCOL && !blocked) return;
    if (this.update && (this.update.blocked || !blocked)) return;   // already said so
    this.update = { server: Math.max(v, min), min, blocked };
    this._emit('update', this.update);
  }

  // The server refused this build (`old_client`, before its welcome): stop, don't reconnect.
  _outdated(m) {
    this.noteProtocol(m.v, Math.max(Number(m.min) || 0, PROTOCOL + 1));
    const err = oldClientErr(m.error || OLD_CLIENT_TEXT);
    if (this._welcomeWaiter) { this._welcomeWaiter.reject(err); this._welcomeWaiter = null; }
    this._connecting = null;
    this._emit('error', err);
    this.close();
  }

  _onWelcome(m) {
    this.noteProtocol(m.v, m.min);
    if (this.update?.blocked) return this._outdated(m);
    this._retry = 0;
    this._welcome = m;
    this.offset = m.now - Date.now();
    this.me = m.you;
    this.room = m.room || null;
    writeHint(this.room);
    this._setState('open');
    this._timers.forEach(clearInterval);
    this._timers = [setInterval(() => this._ping(), 15000)];
    this._ping();
    if (this._lobbyOn) this.request('lobby', { on: true }).then(r => { this.lobby = r.lobby; this._emit('lobby', r.lobby); }).catch(() => {});
    this._flushQueued();
    if (this._welcomeWaiter) { this._welcomeWaiter.resolve(m); this._welcomeWaiter = null; }
    this._connecting = null;
    this._emit('welcome', m);
    if (this.room) this._emit('room', { room: this.room, ev: 'resume' });
  }

  // ---- lobby
  async subscribeLobby(on = true) {
    this._lobbyOn = on;
    if (this.state !== 'open') return null;
    const r = await this.request('lobby', { on });
    this.lobby = r.lobby;
    if (on) this._emit('lobby', r.lobby);
    return r.lobby;
  }
  async rename(name) { const r = await this.request('rename', { name }); if (this.me) this.me.name = r.name; this._opts.name = r.name; return r.name; }
  async quick(opts) { return (await this.request('quick', { opts })).room; }
  async createRoom(opts) { return (await this.request('createRoom', { opts })).room; }
  async joinRoom(code) { return (await this.request('joinRoom', { code: String(code).trim().toUpperCase() })).room; }
  async peekRoom(code) { return (await this.request('peekRoom', { code: String(code).trim().toUpperCase() })); }
  async setOpts(opts) { return (await this.request('setOpts', { opts })).room; }
  start() { return this.request('start'); }
  async leaveRoom() { try { await this.request('leaveRoom'); } finally { this.room = null; writeHint(null); } }
  again() { return this.request('again'); }
  resync() { return this.request('room').then(r => r.room); }

  // ---- play (seat: only for AI seats the host drives)
  shot(m) { return this.request('shot', m); }
  result(m) { return this.request('result', m); }
  mulligan(m) { return this.request('mulligan', m); }
  next() { return this.request('next'); }

  async _get(path) {
    const base = this.base || defaultBase();
    if (!base) throw Object.assign(new Error('online play is not available here yet'), { code: 'unavailable' });
    const res = await fetch(base.replace(/\/$/, '') + path);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { code: body.code || 'http_' + res.status });
    return body;
  }
  health() { return this._get('/api/health'); }
  listRooms() { return this._get('/api/rooms'); }
  roundRecord(id) { return this._get('/api/rounds/' + encodeURIComponent(id)); }
}

export const net = new SkyputtNet();
export default net;
