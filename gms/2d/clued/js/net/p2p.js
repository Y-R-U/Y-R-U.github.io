// Device-hosted rooms: the host's tab runs P2PRoom and serves players over WebRTC data channels.
// Signalling goes through the free PeerJS cloud broker (0.peerjs.com); no server of ours is involved.
// Implements the transport interface in transport.js, so room.js / join.js work unchanged. docs/notes/P2P.md.
import { P2PRoom, newCode, MAX_PLAYERS } from './p2p_room.js?v=202610050144';
import { registerTransport, fallback } from './transport.js?v=202610050144';
import { bootParam } from './api.js?v=202610050144';
import { saveSeat } from './util.js?v=202610050144';
import { lobbyNote, hostBackWarning } from './p2p_ui.js?v=202610050144';

export const PEER_PREFIX = 'clued-p2p-';
const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const HOST_SNAP = code => `clued.p2phost.${code}`;
const BROKER_MS = 12000, CONNECT_MS = 15000, REQ_MS = 10000, RECONNECT_GIVEUP_MS = 75000;

export class P2PError extends Error {
  constructor(code, message, status = 400) { super(message || code); this.code = code; this.status = status; }
}
const MSG = {
  broker: 'Couldn’t reach the free connection service that device rooms use. Check your connection and try again.',
  no_direct: 'Couldn’t open a direct link to the host’s device. Some networks (strict mobile carriers, school or office Wi-Fi) block direct links, and device rooms have no relay. Try switching one of you between Wi-Fi and mobile data, or play a server room.',
  host_lost: 'Lost the link to the host’s device.',
  room_not_found: 'No device room with that code is open. The host may have closed it, or the code has a typo.',
  room_full: `That room is full (device rooms take up to ${MAX_PLAYERS} players).`,
  started: 'This game has already started and isn’t taking new players.',
  name_required: 'Type a name first.',
};
const fail = (code, status) => new P2PError(code, MSG[code], status);
const CONFLICT = new Set(['too_late', 'not_open', 'already_answered', 'late_join', 'locked', 'last_stage', 'cannot_vote', 'not_progressive', 'already_started', 'finished', 'in_question']);
const fromRes = e => new P2PError(e?.error || 'error', MSG[e?.error] || e?.message || 'Something went wrong.',
  e?.error === 'bad_key' ? 403 : e?.error === 'kicked' ? 410 : e?.error === 'room_not_found' || e?.error === 'not_yet' ? 404 : CONFLICT.has(e?.error) ? 409 : 400);

let PeerP = null;
const loadPeer = () => PeerP || (PeerP = import('../vendor/peerjs.js?v=202610050144').then(m => m.Peer));

// ?peerhost=host:port[:path] points at a self-run PeerJS server (testing / future self-hosting).
function peerOptions() {
  const o = { debug: 0, config: { iceServers: ICE } };
  const ph = bootParam('peerhost');
  if (ph) {
    const [host, port, path] = ph.split(':');
    Object.assign(o, { host, port: Number(port) || 9000, path: path ? `/${path}` : '/', secure: false, key: 'peerjs' });
  }
  return o;
}

const timeout = (p, ms, err) => Promise.race([p, new Promise((_, j) => setTimeout(() => j(err), ms))]);
const stats = (window.__cluedP2P = { hostConns: 0, clientConnects: 0, clientFails: 0, lastError: '' });

/* ================================================================ host */
let hosting = null; // { code, peer, room, hostId, key, conns: Map<conn, playerId|null>, listeners:Set, timers:[] }

function openHostPeer(Peer, code) {
  return new Promise((res, rej) => {
    const peer = new Peer(PEER_PREFIX + code, peerOptions());
    const t = setTimeout(() => { peer.destroy(); rej(fail('broker', 0)); }, BROKER_MS);
    peer.once('open', () => { clearTimeout(t); res(peer); });
    peer.once('error', e => { clearTimeout(t); peer.destroy(); rej(e?.type === 'unavailable-id' ? new P2PError('id_taken') : fail('broker', 0)); });
  });
}

async function startHosting(room, hostKey) {
  const Peer = await loadPeer();
  let peer = null;
  // A refreshed host reclaims its id; the broker may need a few seconds to notice the old socket closed.
  const t0 = Date.now();
  for (let i = 0; !peer; i++) {
    try { peer = await openHostPeer(Peer, room.code); } catch (e) {
      stats.hostRetries = [...(stats.hostRetries || []), `${e.code}@${Date.now() - t0}`];
      if (e.code === 'id_taken' && !hostKey && i < 5) { room.code = newCode(); continue; }
      if (!hostKey || Date.now() - t0 > 45000) throw e.code === 'broker' ? new P2PError('network', MSG.broker, 0) : e;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  stats.hostOpenMs = Date.now() - t0;
  const H = { code: room.code, peer, room, conns: new Map(), listeners: new Set(), timers: [], dirty: false, onlineSig: '' };
  hosting = H;
  room.onChange = () => scheduleBroadcast(H);
  peer.on('connection', conn => hostConn(H, conn));
  peer.on('disconnected', () => { if (hosting === H && !peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 1000); });
  peer.on('error', e => { stats.lastError = e?.type || String(e); });
  H.timers.push(setInterval(() => {
    room.tick();
    const sig = room.players.map(p => room.isOnline(p) ? 1 : 0).join('');
    if (sig !== H.onlineSig) { H.onlineSig = sig; room.changed(); }
  }, 250));
  H.timers.push(setInterval(() => saveHost(H), 1000));
  keepAwake(true);
  window.addEventListener('beforeunload', beforeUnload);
  window.addEventListener('pagehide', onPageHide);
  return H;
}

function stopHosting(H) {
  if (!H) return;
  saveHost(H);
  H.timers.forEach(clearInterval);
  setTimeout(() => { try { H.peer.destroy(); } catch (e) {} }, 400);
  if (hosting === H) hosting = null;
  keepAwake(false);
  window.removeEventListener('beforeunload', beforeUnload);
  window.removeEventListener('pagehide', onPageHide);
}

// A clean socket close lets the broker free our id at once, so a refreshed host can reclaim it.
function onPageHide(e) {
  if (!hosting || e.persisted) return;
  saveHost(hosting);
  try { hosting.peer.destroy(); } catch (err) {}
}

// Only warn while other people depend on this tab.
function beforeUnload(e) {
  const r = hosting?.room;
  if (r && !r.closed && r.phase !== 'final' && r.active().length > 1) { e.preventDefault(); e.returnValue = ''; }
}

function saveHost(H) {
  try {
    if (H.room.closed) sessionStorage.removeItem(HOST_SNAP(H.code));
    else sessionStorage.setItem(HOST_SNAP(H.code), JSON.stringify({ at: Date.now(), snap: H.room.snapshot() }));
  } catch (e) {}
}

function scheduleBroadcast(H) {
  if (H.dirty) return;
  H.dirty = true;
  queueMicrotask(() => { H.dirty = false; broadcast(H); });
}

function broadcast(H) {
  const r = H.room;
  for (const [conn, pid] of H.conns) {
    if (!pid) continue;
    const p = r.player(pid);
    if (!p) continue;
    if (p.kicked) {
      send(conn, { t: 'kicked' });
      H.conns.set(conn, null);
      setTimeout(() => conn.close(), 300);
      continue;
    }
    send(conn, { t: 'state', s: r.stateFor(p) });
  }
  const me = r.player(H.hostId);
  if (me) H.listeners.forEach(fn => fn(r.stateFor(me)));
}

function send(conn, msg) { try { if (conn.open) conn.send(msg); } catch (e) {} }

function hostConn(H, conn) {
  stats.hostConns++;
  H.conns.set(conn, null);
  conn.on('data', msg => {
    if (!msg || msg.t !== 'req') return;
    let out;
    try { out = dispatch(H, msg.op, msg.a || {}, conn); } catch (e) { out = { error: 'error', message: e.message }; }
    send(conn, out && out.error ? { t: 'res', id: msg.id, ok: false, e: out } : { t: 'res', id: msg.id, ok: true, d: out });
  });
  const gone = () => {
    const pid = H.conns.get(conn);
    H.conns.delete(conn);
    const p = pid && H.room.player(pid);
    if (p) H.room.connect(p, -1);
  };
  conn.on('close', gone);
  conn.on('error', gone);
}

function bind(H, conn, p) {
  if (!conn) return;
  const prev = H.conns.get(conn);
  if (prev === p.id) return;
  if (prev) { const o = H.room.player(prev); if (o) o.conns = Math.max(0, o.conns - 1); }
  H.conns.set(conn, p.id);
  H.room.connect(p, +1);
}

// One entry point for the host's own calls (conn = null) and remote requests.
function dispatch(H, op, a, conn) {
  const r = H.room;
  if (op === 'time') return { now: Date.now() };
  if (op === 'peek') return r.peek();
  if (r.closed && op !== 'sub') return { error: 'room_not_found' };
  if (op === 'join') {
    let res = a.key ? r.rejoin(a.key) : null;
    const rejoined = !!res && !res.error;
    if (!rejoined) {
      if (res && (res.error === 'kicked' || !a.name)) return res;
      res = r.addPlayer(a.name);
      if (res.error) return res;
    }
    bind(H, conn, res.player);
    return { playerId: res.player.id, playerKey: res.player.key, room: r.stateFor(res.player), rejoined };
  }
  const p = r.byKey(a.key);
  if (!p) return { error: 'bad_key' };
  if (p.kicked) return { error: 'kicked' };
  p.seen = Date.now();
  switch (op) {
    case 'sub': bind(H, conn, p); return { state: r.stateFor(p) };
    case 'q': return r.question(p, a.i);
    case 'answer': {
      const res = r.answer(p, a);
      if (res.error) return res;
      return { ok: true, correct: res.answer.correct, points: res.answer.points, ms: res.answer.ms, score: p.score, streak: p.streak, state: r.stateFor(p) };
    }
    case 'vote': {
      const res = r.vote(p, a.q);
      return res.error ? res : r.stateFor(p);
    }
    case 'host': {
      const res = r.hostAction(p, a.action, a.extra || {});
      return res.error ? res : r.stateFor(p);
    }
    case 'leave':
      if (p.id === H.hostId) { r.close(); broadcast(H); stopHosting(H); }
      else r.remove(p, false);
      return { ok: true };
    default: return { error: 'not_found' };
  }
}

const isHosting = code => hosting && hosting.code === code;
function local(op, a) {
  const out = dispatch(hosting, op, a, null);
  if (out && out.error) throw fromRes(out);
  return out;
}

// Restores a refreshed host's room from sessionStorage (≤ 2 min old).
async function resumeHost(code, key) {
  if (isHosting(code)) return hosting;
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem(HOST_SNAP(code)) || 'null'); } catch (e) {}
  if (!saved || Date.now() - saved.at > 120000) return null;
  const room = P2PRoom.restore(saved.snap);
  const me = room.byKey(key);
  if (!me || me.id !== room.hostId) return null;
  me.local = true;
  const H = await startHosting(room, key);
  H.hostId = me.id;
  return H;
}

/* -------------------------------------------------------------- wake lock */
let wake = null, wakeWanted = false;
async function keepAwake(on) {
  wakeWanted = on;
  try {
    if (on && !wake && navigator.wakeLock) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    if (!on && wake) { await wake.release(); wake = null; }
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && wakeWanted) keepAwake(true);
  if (!hosting) return;
  if (document.hidden) hosting.hiddenAt = Date.now();
  else if (hosting.hiddenAt) {
    const secs = Math.round((Date.now() - hosting.hiddenAt) / 1000);
    hosting.hiddenAt = 0;
    if (secs >= 3 && hosting.room.active().length > 1 && !hosting.room.closed) hostBackWarning(secs);
  }
});

/* ============================================================== client */
let client = null; // { code, peer, conn, pending: Map, onMsg, offset, rtt }
let reqId = 0;

async function connectClient(code) {
  if (client && client.code === code && client.conn?.open) return client;
  const Peer = await loadPeer();
  if (client && client.code !== code) { try { client.peer.destroy(); } catch (e) {} client = null; }
  if (!client || client.peer.destroyed) {
    const peer = new Peer(peerOptions());
    await timeout(new Promise((res, rej) => { peer.once('open', res); peer.once('error', rej); }), BROKER_MS, fail('broker', 0))
      .catch(e => { peer.destroy(); stats.clientFails++; stats.lastError = e?.type || e?.code || 'broker'; throw fail('broker', 0); });
    client = { code, peer, conn: null, pending: new Map(), onMsg: null, offset: client?.code === code ? client.offset : 0, rtt: Infinity };
    peer.on('disconnected', () => { if (!peer.destroyed) setTimeout(() => { try { peer.reconnect(); } catch (e) {} }, 1000); });
  }
  if (client.peer.disconnected) { try { client.peer.reconnect(); } catch (e) {} await new Promise(r => setTimeout(r, 800)); }
  const C = client;
  const conn = C.peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
  await new Promise((res, rej) => {
    const t = setTimeout(() => done(fail('no_direct', 0)), CONNECT_MS);
    const onErr = e => { if (e?.type === 'peer-unavailable') done(fail('room_not_found', 404)); };
    function done(err) {
      clearTimeout(t);
      C.peer.off('error', onErr);
      if (err) { try { conn.close(); } catch (e) {} stats.clientFails++; stats.lastError = err.code; rej(err); } else { stats.clientConnects++; res(); }
    }
    C.peer.on('error', onErr);
    conn.once('open', () => done());
    conn.once('error', () => done(fail('no_direct', 0)));
  });
  C.conn = conn;
  conn.on('data', msg => {
    if (msg?.t === 'res') {
      const p = C.pending.get(msg.id);
      if (p) { C.pending.delete(msg.id); msg.ok ? p.res(msg.d) : p.rej(fromRes(msg.e)); }
    } else if (C.onMsg) C.onMsg(msg);
  });
  conn.on('close', () => {
    if (C.conn !== conn) return;
    C.conn = null;
    for (const p of C.pending.values()) p.rej(fail('host_lost', 0));
    C.pending.clear();
    C.onClose && C.onClose();
  });
  return C;
}

async function call(code, op, a = {}, ms = REQ_MS) {
  const C = await connectClient(code);
  const id = ++reqId;
  return timeout(new Promise((res, rej) => {
    C.pending.set(id, { res, rej });
    try { C.conn.send({ t: 'req', id, op, a }); } catch (e) { C.pending.delete(id); rej(fail('host_lost', 0)); }
  }), ms, fail('host_lost', 0)).finally(() => C.pending.delete(id));
}

async function clientSync(code, samples = 3) {
  for (let i = 0; i < samples; i++) {
    const t0 = Date.now();
    try {
      const { now } = await call(code, 'time', {}, 5000);
      const t1 = Date.now(), rtt = t1 - t0;
      if (client && (rtt <= client.rtt || !client.synced || Date.now() - client.synced > 60000)) { client.rtt = rtt; client.offset = now - (t0 + t1) / 2; client.synced = Date.now(); }
    } catch (e) { return false; }
  }
  return true;
}

// The host vanished for good: end on the last known scores rather than a dead screen.
function finalFrom(st) {
  const players = [...(st.players || [])].sort((a, b) => b.score - a.score);
  const meScore = players.find(p => p.id === st.you?.id)?.score ?? 0;
  return { ...st, ver: (st.ver || 0) + 1, phase: 'final', closed: true, hostLost: true, players,
    you: { ...st.you, host: false, rank: 1 + players.filter(p => p.score > meScore).length } };
}

function clientSubscribe(code, key, { onState, onEnd, onLink }) {
  let ver = -1, closed = false, last = null, lostAt = 0, retry = null;
  const deliver = st => {
    if (!st || closed) return;
    if (st.you?.kicked) return end('kicked');
    if (st.ver > ver) { ver = st.ver; last = st; onState && onState(st); }
    if (st.closed) { closed = true; clearInterval(ping); }
  };
  const end = why => { if (closed) return; closed = true; clearInterval(ping); clearTimeout(retry); onEnd && onEnd(why); };
  const hook = () => {
    if (!client || client.code !== code) return;
    client.onMsg = msg => {
      if (msg.t === 'state') deliver(msg.s);
      else if (msg.t === 'kicked') end('kicked');
    };
    client.onClose = () => { if (!closed) { onLink && onLink(false); lostAt = lostAt || Date.now(); reconnect(); } };
  };
  async function attach() {
    const r = await call(code, 'sub', { key });
    hook();
    lostAt = 0;
    onLink && onLink(true);
    deliver(r.state);
  }
  async function reconnect() {
    clearTimeout(retry);
    if (closed) return;
    try { await attach(); } catch (e) {
      if (e.code === 'kicked') return end('kicked');
      if (e.code === 'bad_key') return end('bad_key');
      if (Date.now() - lostAt > RECONNECT_GIVEUP_MS || e.code === 'room_not_found' && Date.now() - lostAt > 20000) {
        if (last && last.phase !== 'lobby') { deliver(finalFrom(last)); return; }
        return end('room_not_found');
      }
      retry = setTimeout(reconnect, 2000);
    }
  }
  const ping = setInterval(() => { if (client?.conn?.open) clientSync(code, 1); }, 4000);
  lostAt = Date.now();
  reconnect();
  return {
    close() { closed = true; clearInterval(ping); clearTimeout(retry); if (client) { client.onMsg = null; client.onClose = null; } },
    get mode() { return 'p2p'; },
    async refresh() { if (client?.conn?.open) { try { deliver((await call(code, 'sub', { key })).state); } catch (e) {} } else reconnect(); },
    push: deliver,
  };
}

/* =========================================================== transport */
export const p2pTransport = {
  id: 'p2p',
  async create(opts) {
    if (hosting) { try { hosting.room.close(); broadcast(hosting); } catch (e) {} stopHosting(hosting); }
    const room = new P2PRoom({ spec: opts.spec, title: opts.title, questions: opts.questions, answerSec: opts.answerSec, gapSec: opts.gapSec, lateJoin: opts.lateJoin !== false });
    const H = await startHosting(room, null);
    const res = room.addPlayer(opts.hostName, { local: true });
    if (res.error) { stopHosting(H); throw fromRes(res); }
    H.hostId = res.player.id;
    saveHost(H);
    return { code: room.code, playerKey: res.player.key, hostKey: res.player.key, playerId: res.player.id, room: room.stateFor(res.player) };
  },
  async peek(code) { return isHosting(code) ? hosting.room.peek() : call(code, 'peek'); },
  async join(code, name, key) {
    if (key && !isHosting(code)) await resumeHost(code, key).catch(() => null);
    if (isHosting(code)) return local('join', { name, key });
    return call(code, 'join', { name, key });
  },
  subscribe(code, key, handlers) {
    if (isHosting(code)) {
      const H = hosting, fn = st => handlers.onState && handlers.onState(st);
      H.listeners.add(fn);
      queueMicrotask(() => handlers.onLink && handlers.onLink(true));
      return { close: () => H.listeners.delete(fn), get mode() { return 'host'; }, refresh() { const me = H.room.player(H.hostId); if (me) fn(H.room.stateFor(me)); }, push: st => st && fn(st) };
    }
    return clientSubscribe(code, key, handlers);
  },
  async question(code, key, i) { return isHosting(code) ? local('q', { key, i }) : call(code, 'q', { key, i }); },
  async answer(code, key, a) { return isHosting(code) ? local('answer', { key, ...a }) : call(code, 'answer', { key, ...a }); },
  async vote(code, key, q) { return isHosting(code) ? local('vote', { key, q }) : call(code, 'vote', { key, q }); },
  async host(code, key, action, extra = {}) { return isHosting(code) ? local('host', { key, action, extra }) : call(code, 'host', { key, action, extra }, action === 'again' ? 20000 : REQ_MS); },
  async leave(code, key) {
    if (isHosting(code)) { local('leave', { key }); try { sessionStorage.removeItem(HOST_SNAP(code)); } catch (e) {} return; }
    try { await call(code, 'leave', { key }, 3000); } finally { try { client?.peer.destroy(); } catch (e) {} client = null; }
  },
  now: () => (hosting ? Date.now() : Date.now() + (client?.offset || 0)),
  syncClock: n => (hosting || !client ? Promise.resolve(true) : clientSync(client.code, n || 3)),
  isHost: code => isHosting(code),
  lobbyNote: (code, st) => lobbyNote(isHosting(code), st),
};

registerTransport(p2pTransport);
stats.transport = p2pTransport;   // test hook (tools/p2p_e2e.mjs)

// Server refused (busy / paused): host the same prepared game from this device.
fallback.host = async opts => {
  const { go } = await import('../ui/app.js?v=202610050144');
  const { toast } = await import('../ui/popup.js?v=202610050144');
  try {
    const res = await p2pTransport.create(opts);
    saveSeat(res.code, { key: res.playerKey, id: res.playerId, via: 'p2p' });
    go('room', { code: res.code, key: res.playerKey, st: res.room, via: 'p2p' }, { replace: true, skipGuard: true });
  } catch (e) { toast(e.message || 'Couldn’t start a device room'); }
};

