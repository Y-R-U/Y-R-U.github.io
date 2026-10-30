// GAMBIT online client (owned by the server agent; protocol in server/README.md).
//
//   import { net, CHEAT_WARNING } from './net.js';
//   net.on('start', ({ game }) => openGame(game));
//   await net.connect();                       // resolves with the welcome
//   await net.quickMatch('5+0', { rated: true });
//   await net.move(gameId, 'e2e4');            // server validates + times it
//
// One shared connection, auto-reconnect with backoff, games resumed from the welcome.
// Every request returns a Promise that rejects with an Error carrying .code (see
// README "Error codes") and .data (the full server reply).
// Works in the browser and in Node >= 22 (global WebSocket) for tools/server_net_test.mjs.

export const PROTOCOL = 1;

// D10 / D11: show this wherever online ratings or online games are offered.
export const CHEAT_WARNING =
  'The server does not try to detect cheating yet — if you think an opponent cheated, try not to stress about it.';
export const FRIENDS_TIP = 'Online is most fun with people you know: make a private room and send them the code.';

const hasLoc = typeof location !== 'undefined';

function defaultBase() {
  if (!hasLoc) return 'http://127.0.0.1:8094/gms/3d/gambit';
  const q = new URLSearchParams(location.search).get('server');
  if (q) return q.replace(/\/$/, '');
  try { const s = localStorage.getItem('gambitdev.server'); if (s) return s.replace(/\/$/, ''); } catch (e) { /* ignore */ }
  const h = location.hostname;
  if (h === 'games.br8t.com') return location.origin + '/gms/3d/gambit';
  if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.local') ||
      /^(192\.168|10)\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) {
    return `http://${h}:8094/gms/3d/gambit`; // tools/server_run.sh
  }
  return 'https://games.br8t.com/gms/3d/gambit'; // GitHub Pages mirror etc.
}

// Dev identity (server must run with GAMBIT_DEV_AUTH): ?devuid=alice&devname=Alice&devsigned=1,
// or a random per-tab uid when no Firebase token is available. sessionStorage, so two tabs
// are two different players.
function devFromURL() {
  if (!hasLoc) return null;
  const p = new URLSearchParams(location.search);
  const uid = p.get('devuid');
  if (!uid) return null;
  return { uid, name: p.get('devname') || uid, signed: p.get('devsigned') === '1' };
}

function randomDev() {
  let uid = null;
  try { uid = sessionStorage.getItem('gambitdev.uid'); } catch (e) { /* ignore */ }
  if (!uid) {
    uid = 'tab' + Math.random().toString(36).slice(2, 8);
    try { sessionStorage.setItem('gambitdev.uid', uid); } catch (e) { /* ignore */ }
  }
  return { uid, name: '', signed: false };
}

const devToken = d => `dev:${d.uid}:${(d.name || '').replace(/:/g, ' ')}:${d.signed ? 'signed' : 'anon'}`;

// Firebase ID token from the shared account layer, anonymous users included.
// /lib/auth/auth.js getIdToken() returns null for anonymous users, so for them we read the
// same Firebase Auth instance (ES modules are shared by URL) — see notes "Requests".
let authMod = null;
async function firebaseToken(force = false) {
  try {
    authMod = authMod || await import('/lib/auth/auth.js');
    const { auth } = authMod;
    await auth.ready();
    if (auth.signedIn) {
      const t = await auth.getIdToken();
      if (t) return t;
    }
    if (auth.getIdTokenAnyUser) return await auth.getIdTokenAnyUser(force); // if /lib/auth/ adds it
    const { SDK } = await import('/lib/auth/config.js');
    const [app, fa] = await Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-auth.js`)]);
    const user = fa.getAuth(app.getApp()).currentUser;
    return user ? await user.getIdToken(force) : null;
  } catch (e) {
    return null;
  }
}

const withTimeout = (p, ms, v = null) => Promise.race([p, new Promise(r => setTimeout(() => r(v), ms))]);

class GambitNet {
  constructor() {
    this.base = null;
    this.state = 'idle';          // idle | connecting | open | reconnecting | closed
    this.me = null;               // {pid, name, anon, admin, dev}
    this.ratings = null;          // {bullet:{r,rd,prov,games}, blitz…, daily}
    this.allowance = null;        // see README "Allowance"
    this.tcs = [];                // [{id, base, inc, name, cat}]
    this.games = new Map();       // id -> game snapshot, kept current from events
    this.rooms = new Map();       // my open rooms, code -> room
    this.seek = null;             // my quick-match seek {tc, rated, at} or null
    this.lobby = null;            // last lobby payload
    this.offset = 0;              // serverNow - Date.now()
    this._ws = null;
    this._ls = new Map();
    this._pending = new Map();
    this._id = 0;
    this._opts = {};
    this._retry = 0;
    this._timers = [];
    this._openWaiters = [];
    this._lobbyOn = false;
    this._bestRtt = Infinity;
  }

  // ------------------------------------------------------------- events
  on(type, fn) {
    if (!this._ls.has(type)) this._ls.set(type, new Set());
    this._ls.get(type).add(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) { this._ls.get(type)?.delete(fn); }
  _emit(type, data) {
    for (const fn of this._ls.get(type) || []) { try { fn(data); } catch (e) { console.warn('[net] listener', type, e); } }
    for (const fn of this._ls.get('*') || []) { try { fn(type, data); } catch (e) { /* ignore */ } }
  }
  _setState(s) { if (this.state !== s) { this.state = s; this._emit('state', s); } }

  // ------------------------------------------------------------- connection
  /** connect({base?, name?, devUser?: {uid, name, signed}}) -> Promise<welcome> */
  connect(opts = {}) {
    this._opts = { ...this._opts, ...opts };
    this.base = (this._opts.base || this.base || defaultBase()).replace(/\/$/, '');
    if (this.state === 'open') return Promise.resolve(this._welcome);
    if (this._connecting) return this._connecting;
    this._closedByUser = false;
    this._connecting = new Promise((resolve, reject) => { this._welcomeWaiter = { resolve, reject }; });
    this._open();
    if (!this._authWatch && !this._opts.devUser) this._watchAuth();
    return this._connecting;
  }

  close() {
    this._closedByUser = true;
    this._timers.forEach(clearInterval); this._timers = [];
    try { this._ws?.close(1000); } catch (e) { /* ignore */ }
    this._setState('closed');
  }

  async _token() {
    const d = this._opts.devUser || devFromURL();
    if (d) return devToken(d);
    const t = await withTimeout(firebaseToken(), 6000);
    if (t) return t;
    if (await this._devAllowed()) return devToken(randomDev());
    return null;
  }

  async _devAllowed() {
    if (this._dev !== undefined) return this._dev;
    try { this._dev = !!(await this.health()).devAuth; } catch (e) { this._dev = false; }
    return this._dev;
  }

  async _open() {
    this._setState(this._retry ? 'reconnecting' : 'connecting');
    const token = await this._token();
    if (this._closedByUser) return;
    if (!token) {
      this._fail(Object.assign(new Error('could not get a sign-in token (is /lib/auth/ loaded?)'), { code: 'no_token' }));
      return this._scheduleReconnect();
    }
    let ws;
    try { ws = new WebSocket(this.base.replace(/^http/, 'ws') + '/api/ws'); }
    catch (e) { return this._scheduleReconnect(); }
    this._ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL, token, name: this._opts.name || '' }));
    };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } this._onMessage(m); };
    ws.onclose = e => {
      if (this._ws !== ws) return;
      this._ws = null;
      this._timers.forEach(clearInterval); this._timers = [];
      // Moves carry their ply, so resending one after the reconnect is safe (the server
      // answers dup / stale_ply). Anything else in flight is rejected with code 'offline'.
      for (const [id, p] of this._pending) {
        if (p.queued) continue;
        if (p.msg.t === 'move') { p.queued = true; continue; }
        clearTimeout(p.timer); this._pending.delete(id);
        p.reject(Object.assign(new Error('connection lost'), { code: 'offline' }));
      }
      if (this._closedByUser) return this._setState('closed');
      if (e.code === 4001) this._retry = Math.max(this._retry, 1); // token refused / identity changed: fresh token next try
      this._scheduleReconnect();
    };
    ws.onerror = () => { /* onclose follows */ };
  }

  _fail(err) {
    if (this._welcomeWaiter && this._retry >= 3) { this._welcomeWaiter.reject(err); this._welcomeWaiter = null; this._connecting = null; }
    this._emit('error', err);
  }

  _scheduleReconnect() {
    if (this._closedByUser) return;
    this._setState('reconnecting');
    const ms = Math.min(15000, 1000 * 2 ** Math.min(this._retry, 4)) * (0.8 + Math.random() * 0.4);
    this._retry++;
    clearTimeout(this._reconnectT);
    this._reconnectT = setTimeout(() => this._open(), ms);
  }

  _watchAuth() {
    this._authWatch = true;
    import('/lib/auth/auth.js').then(m => {
      let uid = m.auth.user?.uid;
      m.auth.onChange(u => {
        if (u && uid && u.uid !== uid && this._ws) { try { this._ws.close(4000); } catch (e) { /* ignore */ } }
        if (u) uid = u.uid;
      });
    }).catch(() => { /* no account layer: dev or Node */ });
  }

  _send(m) { if (this._ws && this._ws.readyState === 1) { this._ws.send(JSON.stringify(m)); return true; } return false; }

  /** Low-level request. Waits up to 10 s for the connection if it is (re)connecting. */
  request(t, body = {}, timeoutMs = 10000) {
    const id = ++this._id;
    const msg = { t, id, ...body };
    return new Promise((resolve, reject) => {
      const p = { resolve, reject, msg, queued: false };
      p.timer = setTimeout(() => { this._pending.delete(id); reject(Object.assign(new Error('timed out'), { code: 'timeout' })); }, timeoutMs);
      this._pending.set(id, p);
      if (this.state !== 'open' || !this._send(msg)) p.queued = true; // flushed after the next welcome
    });
  }

  _flushQueued() {
    for (const [, p] of this._pending) {
      if (p.queued) { p.queued = false; this._send(p.msg); }
    }
  }

  serverNow() { return Date.now() + this.offset; }

  _ping() {
    const sent = Date.now();
    this.request('ping', {}, 5000).then(r => {
      const rtt = Date.now() - sent;
      if (rtt <= this._bestRtt * 1.5 || rtt < 150) {
        this._bestRtt = Math.min(this._bestRtt, rtt);
        this.offset = r.now + rtt / 2 - Date.now();
      }
    }).catch(() => { /* ignore */ });
  }

  // ------------------------------------------------------------- inbound
  _onMessage(m) {
    if ((m.t === 'ok' || m.t === 'error' || m.t === 'pong') && m.id && this._pending.has(m.id)) {
      const p = this._pending.get(m.id);
      this._pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.game && typeof m.game === 'object' && m.game.id) this._storeGame(m.game, 'sync');
      if (m.allowance) this._setAllowance(m.allowance);
      if (m.t === 'error') {
        if (m.code === 'bad_token' && p.msg.t === 'hello') return;
        p.reject(Object.assign(new Error(m.error || m.code), { code: m.code, data: m }));
      } else p.resolve(m);
      return;
    }
    switch (m.t) {
      case 'welcome': return this._onWelcome(m);
      case 'error':
        if (m.code === 'bad_token') this._emit('error', Object.assign(new Error(m.error), { code: m.code }));
        return;
      case 'lobby': this.lobby = m.lobby; return this._emit('lobby', m.lobby);
      case 'allowance': return this._setAllowance(m.allowance);
      case 'seek': this.seek = m.seek || null; return this._emit('seek', { seek: this.seek, reason: m.reason || null });
      case 'roomClosed': this.rooms.delete(m.code); return this._emit('roomClosed', m);
      case 'start': {
        const g = this._storeGame(m.game);
        this.seek = null;
        return this._emit('start', { game: g });
      }
      case 'move': {
        const g = this.games.get(m.game);
        if (g && m.ply === g.moves.length) {
          g.moves.push(m.uci); g.sans.push(m.san);
          g.fen = m.fen; g.clock = m.clock; g.drawOffer = m.drawOffer || '';
        } else if (g && m.ply < g.moves.length) {
          return; // already have it (our own resend)
        } else if (g) {
          this.request('game', { game: m.game }).catch(() => {}); // gap: resync (reply stores + emits 'sync')
          return;
        }
        const mine = !!g && (m.ply % 2 === 0 ? 'w' : 'b') === g.you; // echo of our own move
        return this._emit('move', { gameId: m.game, ply: m.ply, uci: m.uci, san: m.san, fen: m.fen, clock: m.clock, mine, game: g });
      }
      case 'end': {
        const g = this.games.get(m.game);
        if (g) Object.assign(g, { status: 'ended', result: m.result, reason: m.reason, pgn: m.pgn, ratings: m.ratings || null, clock: m.clock, drawOffer: '', opponentGone: null });
        if (m.ratings && g && this.ratings?.[g.cat]) {
          const mine = m.ratings[g.you];
          if (mine) this.ratings[g.cat] = { ...this.ratings[g.cat], r: mine.after, games: (this.ratings[g.cat].games || 0) + 1 };
        }
        return this._emit('end', { gameId: m.game, result: m.result, reason: m.reason, pgn: m.pgn, ratings: m.ratings || null, game: g });
      }
      case 'draw': {
        const g = this.games.get(m.game);
        if (g) g.drawOffer = m.action === 'offer' ? m.by : '';
        return this._emit('draw', { gameId: m.game, by: m.by, action: m.action, mine: g ? m.by === g.you : false, game: g });
      }
      case 'rematch': {
        const g = this.games.get(m.game);
        if (g) {
          g.rematch = g.rematch || { you: false, them: false };
          const mine = m.by === g.you;
          if (m.action === 'offer') g.rematch[mine ? 'you' : 'them'] = true; else g.rematch = { you: false, them: false };
        }
        return this._emit('rematch', { gameId: m.game, by: m.by, action: m.action, mine: g ? m.by === g.you : false, game: g });
      }
      case 'opponent': {
        const g = this.games.get(m.game);
        if (g) g.opponentGone = m.status === 'gone' ? { since: this.serverNow(), claimAt: m.claimAt } : null;
        return this._emit('opponent', { gameId: m.game, status: m.status, claimAt: m.claimAt || 0, game: g });
      }
    }
  }

  _onWelcome(m) {
    this._retry = 0;
    this._welcome = m;
    this.offset = m.now - Date.now();
    this.me = m.you; this.ratings = m.ratings; this.tcs = m.tcs || [];
    this.seek = m.seek || null;
    this.rooms = new Map((m.rooms || []).map(r => [r.code, r]));
    const live = new Set();
    for (const g of m.games || []) { this._storeGame(g); live.add(g.id); }
    for (const [id, g] of this.games) if (!live.has(id) && g.status === 'playing') { g.status = 'unknown'; }
    this._setAllowance(m.allowance);
    this._setState('open');
    this._timers.forEach(clearInterval);
    this._timers = [
      setInterval(() => this._ping(), 20000),
      setInterval(() => this._refreshToken(), 45 * 60000),
    ];
    this._ping();
    if (this._lobbyOn) this.request('lobby', { on: true }).then(r => { this.lobby = r.lobby; this._emit('lobby', r.lobby); }).catch(() => {});
    this._flushQueued();
    if (this._welcomeWaiter) { this._welcomeWaiter.resolve(m); this._welcomeWaiter = null; }
    this._connecting = null;
    this._emit('welcome', m);
    if ((m.games || []).length) this._emit('resume', { games: m.games.map(g => this.games.get(g.id)) });
  }

  async _refreshToken() {
    if (this._opts.devUser || devFromURL()) return;
    const t = await withTimeout(firebaseToken(true), 6000);
    if (t) this.request('auth', { token: t }).catch(() => {});
  }

  _storeGame(g, why) {
    g.moves = g.moves || []; g.sans = g.sans || [];
    const cur = this.games.get(g.id);
    if (cur) Object.assign(cur, g); else this.games.set(g.id, g);
    const out = this.games.get(g.id);
    if (why === 'sync') this._emit('sync', { game: out });
    return out;
  }

  _setAllowance(a) { if (a) { this.allowance = a; this._emit('allowance', a); } }

  // ------------------------------------------------------------- lobby
  /** Live lobby feed: {rooms:[room], seeking:{tc:n}, playing, online}. Emits 'lobby'. */
  async subscribeLobby(on = true) {
    this._lobbyOn = on;
    const r = await this.request('lobby', { on });
    this.lobby = r.lobby;
    if (on) this._emit('lobby', r.lobby);
    return r.lobby;
  }
  /** HTTP, no connection needed. */
  listRooms() { return this._get('/api/rooms'); }
  /** Quick match. Resolves once queued; the game arrives as a 'start' event. */
  async quickMatch(tc, { rated = true } = {}) { const r = await this.request('seek', { tc, rated }); this.seek = r.seek; this._emit('seek', { seek: this.seek }); return r.seek; }
  async cancelQuickMatch() { await this.request('unseek'); this.seek = null; this._emit('seek', { seek: null }); }
  /** createRoom({tc, rated=true, public=false, name?, color='random'|'w'|'b'}) -> room {code,…} */
  async createRoom({ tc, rated = true, public: pub = false, name = '', color = 'random' } = {}) {
    const r = await this.request('createRoom', { tc, rated, public: pub, name, color });
    this.rooms.set(r.room.code, r.room);
    return r.room;
  }
  async closeRoom(code) { await this.request('closeRoom', { code }); this.rooms.delete(code); }
  /** Join a public or private room by code. Resolves with the game id; 'start' also fires. */
  async joinRoom(code) { return (await this.request('joinRoom', { code: String(code).trim().toUpperCase() })).game; }
  async peekRoom(code) { return (await this.request('peekRoom', { code: String(code).trim().toUpperCase() })).room; }

  // ------------------------------------------------------------- in game
  game(id) { return this.games.get(id) || null; }
  /** Live clock {w, b, turn, running} in ms, extrapolated to now. w/b null for Unlimited. */
  clock(id) {
    const g = this.games.get(id);
    if (!g || !g.clock) return null;
    const c = g.clock;
    const out = { w: c.w, b: c.b, turn: c.turn, running: c.running, deadline: c.deadline || 0, deadlineAborts: !!c.deadlineAborts };
    if (c.running && c.w != null) {
      const el = Math.max(0, this.serverNow() - c.at); // offset jitter must never add time
      out[c.turn] = Math.max(0, Math.round(c[c.turn] - el));
    }
    return out;
  }
  /** Play a move ('e2e4', 'e7e8q'). Resolves {san}. Rejects (code illegal_move | not_your_turn |
   *  stale_ply | game_over); on stale_ply/game_over the game is resynced and 'sync' fires. */
  async move(id, uci) {
    const g = this.games.get(id);
    if (!g) throw Object.assign(new Error('no such game'), { code: 'no_game' });
    const ply = g.moves.length;
    return this.request('move', { game: id, uci, ply });
  }
  resign(id) { return this.request('resign', { game: id }); }
  abort(id) { return this.request('abort', { game: id }); }
  offerDraw(id) { return this.request('draw', { game: id, action: 'offer' }); }
  acceptDraw(id) { return this.request('draw', { game: id, action: 'accept' }); }
  declineDraw(id) { return this.request('draw', { game: id, action: 'decline' }); }
  /** Opponent disconnected past claimAt (timed games): claim the win or a draw. */
  claim(id, kind = 'win') { return this.request('claim', { game: id, kind }); }
  offerRematch(id) { return this.request('rematch', { game: id, action: 'offer' }); }
  acceptRematch(id) { return this.request('rematch', { game: id, action: 'accept' }); }
  declineRematch(id) { return this.request('rematch', { game: id, action: 'decline' }); }
  resync(id) { return this.request('game', { game: id }).then(r => this.games.get(r.game.id)); }

  // ------------------------------------------------------------- account
  async getAllowance() { return (await this.request('allowance')).allowance; }
  async rename(name) { const r = await this.request('rename', { name }); if (this.me) this.me.name = r.name; this._opts.name = r.name; return r.name; }
  async myRatings() { const r = await this.request('ratings'); this.ratings = r.ratings; return r.ratings; }

  // ------------------------------------------------------------- HTTP (no connection needed)
  async _get(path) {
    this.base = this.base || (this._opts.base || defaultBase()).replace(/\/$/, '');
    const res = await fetch(this.base + path);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(body.error || res.statusText), { code: body.code || 'http_' + res.status, data: body });
    return body;
  }
  health() { return this._get('/api/health'); }
  status() { return this._get('/api/status'); }
  /** -> {cat, rows:[{rank, pid, name, rating, rd, games, wins, losses, draws}]} (signed-in, non-provisional only) */
  leaderboard(cat = 'blitz', limit = 50) { return this._get(`/api/leaderboard?cat=${encodeURIComponent(cat)}&limit=${limit}`); }
  player(pid) { return this._get('/api/players/' + encodeURIComponent(pid)); }
  /** Finished game record incl. PGN. */
  gameRecord(id) { return this._get('/api/games/' + encodeURIComponent(id)); }
}

export { GambitNet };
export const net = new GambitNet();
export default net;
