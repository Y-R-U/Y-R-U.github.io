// Connection to the THRONG room server + the lifecycle of online matches. DOM-free (browser + node).
import { CONFIG } from '../config.js';
import { PROTO, simVersion, mapVersion, MSG } from './proto.js';
import { buildMeta, createNetMatch } from './netmatch.js';
import { liveEvents } from '../meta/events.js';

// Quick match rotates modes on a shared 10-minute UTC clock, Classic every other slot.
export const QUICK_ROTATION = ['classic', 'teams', 'classic', 'koth', 'classic', 'lcs', 'classic', 'infection'];
export const quickMode = (t = Date.now()) => QUICK_ROTATION[Math.floor(t / 600000) % QUICK_ROTATION.length];
// Match-wide events (not Mode of the Day / Giant Slayer, which are coin rules) travel in the match meta.
export const matchEventIds = (t = Date.now()) => liveEvents(t).map((w) => w.id).filter((id) => id === 'double' || id === 'rush' || id === 'market');

const BACKOFF = [400, 800, 1600, 3200, 6000, 10000];

export function serverUrl(loc = globalThis.location) {
  const q = new URLSearchParams(loc && loc.search || '');
  const net = q.get('net');
  if (net) return /^wss?:\/\//.test(net) ? net : `ws://${net}${CONFIG.NET.path}/ws`;
  const h = loc && loc.hostname || '';
  if (h === 'localhost' || h === '127.0.0.1' || /^192\.168\./.test(h)) return `ws://${h}:${CONFIG.NET.port}${CONFIG.NET.path}/ws`;
  return CONFIG.NET.url;
}
export const httpBase = (ws) => ws.replace(/^ws/, 'http').replace(/\/ws$/, '');

export function onlineVisible(loc = globalThis.location) {
  if (CONFIG.NET.ONLINE_PUBLIC) return true;
  const q = new URLSearchParams(loc && loc.search || '');
  if (q.has('online')) return q.get('online') !== '0';
  if (q.has('net') || q.has('room')) return true;
  const h = loc && loc.hostname || '';
  return h === 'localhost' || h === '127.0.0.1';
}

const rid = (n) => { let s = ''; const a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; for (let i = 0; i < n; i++) s += a[(Math.random() * a.length) | 0]; return s; };
export const newDeviceId = () => Array.from({ length: 32 }, () => ((Math.random() * 16) | 0).toString(16)).join('');
export const newCid = () => rid(22);

// opts: url, map, name, dev, cid, WS (constructor), now(), emit(type, data)
// pickMode(quick): the mode the host starts (private rooms: the host's pick; quick: the rotation).
export function createOnline({ url, map, name = 'Player', dev, cid, cos = null, WS = globalThis.WebSocket, now = () => performance.now(), emit = () => {}, pickMode = (quick) => (quick ? quickMode() : 'classic') }) {
  const sim = simVersion(), mv = mapVersion(map);
  let ws = null, status = 'idle', you = null, room = null, match = null, wantOpen = false;
  let attempts = 0, retryT = 0, pingT = 0, rtt = 0, serverOffset = 0, lastPong = 0, giveUpAt = 0;
  let reqId = 1;
  const pending = new Map();
  const preBin = [];
  const net = { sent: 0, recv: 0, sentBin: 0, recvBin: 0, since: now() };

  const set = (s, extra) => { if (status === s && !extra) return; status = s; emit('status', { status, ...extra }); };

  function connect() {
    wantOpen = true;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    clearTimeout(retryT);
    set(attempts ? 'reconnecting' : 'connecting');
    let sock;
    try { sock = new WS(url); } catch (e) { return scheduleRetry(); }
    sock.binaryType = 'arraybuffer';
    ws = sock;
    sock.onopen = () => {
      if (ws !== sock) return;
      sendJson({ t: 'hello', v: PROTO, sim, map: mv, dev, cid, name, cos });
    };
    sock.onmessage = (ev) => { if (ws === sock) onMessage(ev.data); };
    sock.onclose = (ev) => {
      if (ws !== sock) return;
      ws = null;
      clearInterval(pingT);
      for (const [, p] of pending) p.reject(Object.assign(new Error('offline'), { code: 'offline' }));
      pending.clear();
      if (ev && ev.code === 4002) { set('old'); wantOpen = false; return; }
      if (ev && ev.code === 4003) { set('replaced'); wantOpen = false; return; }
      if (wantOpen) scheduleRetry(); else set('idle');
    };
    sock.onerror = () => {};
  }

  function scheduleRetry() {
    const d = BACKOFF[Math.min(attempts, BACKOFF.length - 1)];
    attempts++;
    if (!giveUpAt) giveUpAt = now() + (match ? 25000 : 4500);
    if (now() > giveUpAt) {
      set('unavailable');
      if (match && match.role === 'guest' && !match.offline) { match.promote({ offline: true }); emit('offline', {}); }
      else if (match && match.role === 'host' && !match.offline) emit('offline', {});
      retryT = setTimeout(connect, 15000);
      return;
    }
    set('reconnecting');
    retryT = setTimeout(connect, d);
  }

  function close() {
    wantOpen = false;
    clearTimeout(retryT); clearInterval(pingT);
    if (ws) { try { ws.close(1000); } catch {} }
    ws = null;
    set('idle');
  }

  function sendJson(o) {
    if (!ws || ws.readyState !== 1) return false;
    const s = JSON.stringify(o);
    net.sent += s.length;
    ws.send(s);
    return true;
  }
  function sendBin(b) {
    if (!ws || ws.readyState !== 1) return false;
    net.sentBin += b.byteLength;
    ws.send(b);
    return true;
  }

  function req(t, data = {}, ms = 8000) {
    return new Promise((resolve, reject) => {
      if (!ws || ws.readyState !== 1) return reject(Object.assign(new Error('offline'), { code: 'offline' }));
      const id = reqId++;
      const timer = setTimeout(() => { pending.delete(id); reject(Object.assign(new Error('timeout'), { code: 'timeout' })); }, ms);
      pending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
      sendJson({ t, id, ...data });
    });
  }

  function onMessage(data) {
    if (typeof data !== 'string') {
      const b = new Uint8Array(data);
      net.recvBin += b.byteLength;
      if (b[0] === MSG.INPUT) { if (match) match.onInput(b, now()); return; }
      if (match) match.onSnap(b, now());
      else { if (b[0] === MSG.KEY) preBin.length = 0; preBin.push(b); if (preBin.length > 700) preBin.shift(); }
      return;
    }
    net.recv += data.length;
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (m.id && pending.has(m.id) && (m.t === 'ok' || m.t === 'error')) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      if (m.t === 'ok') p.resolve(m); else p.reject(Object.assign(new Error(m.error || m.code), { code: m.code }));
      if (m.room) setRoom(m.room);
      return;
    }
    switch (m.t) {
      case 'welcome':
        you = m.you; attempts = 0; giveUpAt = 0;
        serverOffset = m.now - Date.now();
        set('online', { you });
        clearInterval(pingT);
        pingT = setInterval(() => sendJson({ t: 'ping', c: now() }), 2000);
        sendJson({ t: 'ping', c: now() });
        break;
      case 'pong': {
        const r = now() - m.c;
        rtt = rtt ? rtt * 0.7 + r * 0.3 : r;
        lastPong = now();
        emit('ping', { rtt });
        break;
      }
      case 'room': setRoom(m.room); break;
      case 'go': onGo(); break;
      case 'begin': onBegin(m); break;
      case 'promote': onPromote(m); break;
      case 'meta': if (match && m.meta) { match.setPlayers(m.meta.players || []); emit('meta', { players: match.players }); } break;
      case 'want': onWant(m); break;
      case 'away': if (match) match.setAway(m.crowd, true); emit('presence', { crowd: m.crowd, away: true }); break;
      case 'back': if (match) match.setAway(m.crowd, false); emit('presence', { crowd: m.crowd, away: false }); break;
      case 'ended': emit('ended', { mid: m.mid, recorded: m.recorded, why: m.why }); if (room && room.quick) room = null; break;
      case 'closed': room = null; emit('closed', { reason: m.reason }); break;
      case 'error':
        if (m.code === 'old_client') { set('old'); wantOpen = false; }
        emit('error', { code: m.code, error: m.error });
        break;
    }
  }

  function setRoom(r) {
    const prevHost = room && room.host;
    room = r;
    emit('room', room);
    if (match && room.state === 'playing' && you && room.host !== you.id && match.role === 'host' && prevHost === you.id) {
      match.demote();
      emit('role', { role: 'guest', why: 'handoff' });
    }
  }

  function onGo() {
    if (!room || !you || room.host !== you.id || room.state !== 'lobby') return;
    const members = room.members.filter((x) => x.online).slice(0, CONFIG.MATCH.crowds);
    const meta = buildMeta({ seed: (Math.random() * 1e9) | 0, members, mode: pickMode(!!room.quick), events: matchEventIds(Date.now() + serverOffset) });
    req('begin', { meta }).catch((e) => emit('error', { code: e.code, error: e.message }));
  }

  function feedPre() {
    for (const b of preBin) match.onSnap(b, now());
    preBin.length = 0;
  }

  function onBegin(m) {
    if (!m.meta || m.crowd < 0) return;
    const asHost = you && m.host === you.id;
    match = createNetMatch({ map, meta: m.meta, me: m.crowd, role: asHost ? 'host' : 'guest', epoch: m.epoch, sendBin });
    match.mid = m.mid;
    feedPre();
    emit('begin', { match, late: !!m.late });
  }

  function onPromote(m) {
    if (!match) {
      if (!m.meta) return;
      match = createNetMatch({ map, meta: m.meta, me: m.crowd, role: 'guest', epoch: m.epoch, sendBin });
      match.mid = m.mid;
      feedPre();
      emit('begin', { match, late: true });
    }
    const was = match.role;
    if (match.promote({ epoch: m.epoch, away: m.away || [] })) emit('role', { role: 'host', why: m.why || 'promote', was });
  }

  function onWant(m) {
    if (!match || match.role !== 'host') return;
    const c = match.pickBotCrowd();
    if (c < 0) return;
    match.assign(c, m.who, m.name, m.cos);
    sendJson({ t: 'meta', meta: match.meta });     // first, so the joiner's begin already carries its look
    sendJson({ t: 'assign', who: m.who, crowd: c });
    emit('meta', { players: match.players });
  }

  function report() {
    if (!match || match.reported) return;
    const rows = match.result();
    if (!rows) return;
    match.reported = true;
    sendJson({ t: 'result', mid: match.mid, rows });
  }

  function endMatch() { match = null; preBin.length = 0; }

  return {
    connect, close, req, sendJson, sendBin, report, endMatch,
    quick: () => req('quick'),
    create: () => req('create'),
    join: (code) => req('join', { code }),
    leave: () => { if (match) match = null; const p = room ? req('leave').catch(() => {}) : Promise.resolve(); room = null; return p; },
    ready: (on) => sendJson({ t: 'ready', on }),
    start: () => req('start'),
    rename: (n) => req('rename', { name: n }),
    handoff: () => sendJson({ t: 'handoff' }),
    setName(n) { name = n; },
    setCos(c) { cos = c; sendJson({ t: 'cos', cos }); },
    get status() { return status; },
    get you() { return you; },
    get room() { return room; },
    get match() { return match; },
    get rtt() { return rtt; },
    get lastPong() { return lastPong; },
    get serverOffset() { return serverOffset; },
    get net() { return net; },
    get url() { return url; },
    versions: { sim, map: mv, proto: PROTO },
  };
}
