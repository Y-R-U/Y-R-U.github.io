// Game-facing net API (docs/ONLINE.md §15). createNet() → events + send helpers; GAMEPLAY wires it later.
import { Net, KIND } from './link.js';
import { RemoteTrack } from './interp.js';
import { unpackState } from '../flight/netstate.js';
import { RANKS } from '../../data/ranks.js';

const Q = new URLSearchParams(location.search);
export const DEFAULT_SERVER = Q.get('net') || 'wss://games.br8t.com/gms/3d/krayzee/net';
const STATE_MS = 1000 / 15;

// Profile (ui.getProfile()) → what the server needs. Favourites: profile.favourites (up to 3) else the saved voice.
export function helloFromProfile(p = {}) {
  const r = typeof p.rank === 'number' ? RANKS[Math.max(0, Math.min(RANKS.length - 1, p.rank))] : RANKS.find((x) => x.id === p.rank) || RANKS[0];
  const favs = [...new Set([p.voice, ...(Array.isArray(p.favourites) ? p.favourites : [])].filter(Boolean))].slice(0, 3);
  return { name: p.name || 'Pilot', title: p.title || p.display || (p.gender === 'f' ? r.f : r.m), rank: r.id, g: p.gender === 'f' ? 'f' : 'm',
    emp: r.id === 'emperor', voices: favs };
}

export function createNet({ server = DEFAULT_SERVER, profile = () => ({}), getToken = null, p2p = Q.get('p2p') !== '0' } = {}) {
  const net = new Net({ server, p2p, hello: () => helloFromProfile(profile()), token: getToken });
  const tracks = new Map();
  let lastState = 0;

  net.on('data', (peer, bytes) => {
    if (bytes[0] !== KIND.STATE || bytes.length < 33) return;
    let tr = tracks.get(peer);
    if (!tr) tracks.set(peer, (tr = new RemoteTrack()));
    const st = unpackState(bytes.subarray(1, 33));
    if (tr.push(st, net.roomTime())) net._emit('plane', peer, st, tr);
  });
  net.on('peerLeft', (id) => tracks.delete(id));
  net.on('left', () => tracks.clear());

  // A hidden tab hands the sky over at once (iOS freezes background tabs).
  const onVis = () => { if (document.visibilityState === 'hidden' && net.isHost) api.handoff('hidden'); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVis);

  const others = () => (net.room ? net.room.members.filter((m) => m.id !== net.id) : []);

  const api = {
    net,
    on: (ev, fn) => net.on(ev, fn),
    connect: () => net.connect(),
    close() { document.removeEventListener('visibilitychange', onVis); net.close(); },

    get id() { return net.id; },
    get room() { return net.room; },
    get members() { return net.room?.members || []; },
    get me() { return net.room?.members.find((m) => m.id === net.id) || null; },
    get isHost() { return net.isHost; },
    get hostId() { return net.hostId; },
    get phase() { return net.room?.phase || null; },
    get connected() { return net.connected; },
    get voices() { return net.voices; },
    roomTime: () => net.roomTime(),
    linkSummary: () => net.linkSummary(),
    link: (peer) => net.links.get(peer) || null,

    // lobby / membership (server)
    hello() { net.sendHello(); },
    list() { net._raw({ t: 'list' }); },
    quick() { net._raw({ t: 'quick' }); },
    create({ name = '', priv = false, set = {} } = {}) { net._raw({ t: 'create', name, priv, set }); },
    join(codeOrId) { net._raw(typeof codeOrId === 'object' ? { t: 'join', id: codeOrId.id } : { t: 'join', code: String(codeOrId || '') }); },
    leave() {
      if (net.reconnect) { net._giveUp('left'); return; }
      net._raw({ t: 'leave' });
      net._leftRoom('left');
    },
    claim(voice) { net._raw({ t: 'claim', voice }); },
    setOptions(set) { net._raw({ t: 'set', set }); },
    setPhase(p) { net._raw({ t: 'phase', p }); },
    ready(on) { net._raw({ t: 'rdy', on: !!on }); },
    kick(id) { net._raw({ t: 'kick', id }); },
    vote(id) { net._raw({ t: 'vote', id }); },
    meta(crown, left) { net._raw({ t: 'meta', crown, left: Math.round(left || 0) }); },
    handoff(why) { if (net.isHost) { net._raw({ t: 'handoff' }); net._emit('handoffSent', why); } },

    // Call every frame: heartbeats (ready = holds the shared world and has a stable frame rate), pings, clock.
    tick(now = performance.now(), { ready = true, parked = false } = {}) { net.beat(now, ready, parked); },

    // Own plane → every peer, unreliable, ≤ 15 Hz. opts as Aircraft.packState: {hull, overriding, parachute}.
    sendPlane(ac, opts = {}, now = performance.now()) {
      if (!net.room || now - lastState < STATE_MS * 0.9) return false;
      lastState = now;
      return api.sendPlaneBytes(ac.packState({ ...opts, roomTimeMs: net.roomTime() }));
    },
    sendPlaneBytes(bytes32) {
      const out = new Uint8Array(33);
      out[0] = KIND.STATE;
      out.set(bytes32, 1);
      for (const m of others()) net.sendTo(m.id, 'u', out);
      return true;
    },
    track: (peer) => tracks.get(peer) || null,
    tracks: () => tracks,
    // Interpolates a peer's plane into `ac` (an Aircraft): 'interp' | 'reckon' | 'lost' | 'empty'.
    applyRemote(peer, ac) {
      const tr = tracks.get(peer);
      if (!tr || !tr.samples.length) return 'empty';
      return ac.applyRemote(tr.samples, tr.renderMs(net.roomTime()));
    },

    // Game messages (reliable, JSON). Receive with on('msg', (from, obj) => …).
    send(to, obj) { net.sendJSON(to, obj); },
    broadcast(obj) { for (const m of others()) net.sendJSON(m.id, obj); },
    toHost(obj) { if (net.hostId && !net.isHost) net.sendJSON(net.hostId, obj); },
  };
  return api;
}
