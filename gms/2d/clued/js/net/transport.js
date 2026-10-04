// Room transports. The lobby, scoreboards and runner wiring (room.js / join.js) only talk to this
// interface, so a device-hosted P2P transport can slot in beside the server one. See docs/notes/S.md.
//
// transport = {
//   id: 'server' | 'p2p',
//   create(opts) -> { code, playerKey, playerId, room }     opts: { hostName, spec, title, questions, answerSec, gapSec, public?, startIn?, lateJoin? }
//   peek(code) -> { code, phase, players, host, title, total, q }
//   join(code, name, key?) -> { playerId, playerKey, room, rejoined? }   (key = rejoin with a saved seat)
//   subscribe(code, key, { onState, onEnd, onLink }) -> { close(), refresh(), push(state), mode }
//   question(code, key, i) -> { i, game, question }
//   answer(code, key, { q, given, correct, points, ms }) -> { score, points, correct, state }
//   host(code, key, action, extra) -> state      actions: start next end kick host settings again
//   leave(code, key)
//   vote(code, key, q) -> state       vote to reveal more on a progressive question (409 locked/last_stage are harmless)
//   now() -> ms on the room's clock;  syncClock(samples?) -> Promise
// }
// Vote to reveal more travels inside room state (no separate messages): for a progressive question the state carries
// { stage, stages, votes, needed, locked, qDeadline, limitMs } and you.voted / you.stage. A 'stage' event = stage went up
// (with the extended qDeadline); 'lock' = locked became true. P2P hosts should emit the same fields.
// Room state shape is the server's (docs/notes/S.md "Room state"). Errors are ApiError-like: { status, code, message }.
import { rooms, subscribe, serverNow, syncClock } from './api.js?v=1';

export const serverTransport = {
  id: 'server',
  create: opts => rooms.create(opts),
  peek: code => rooms.peek(code),
  join: (code, name, key) => rooms.join(code, name, key),
  subscribe: (code, key, handlers) => subscribe(code, key, handlers),
  question: (code, key, i) => rooms.question(code, key, i),
  answer: (code, key, a) => rooms.answer(code, key, a),
  host: (code, key, action, extra) => rooms.host(code, key, action, extra),
  leave: (code, key) => rooms.leave(code, key),
  vote: (code, key, q) => rooms.vote(code, key, q),
  now: () => serverNow(),
  syncClock: n => syncClock(n),
};

const transports = { server: serverTransport };
export const registerTransport = t => { transports[t.id] = t; };
export const getTransport = id => transports[id || 'server'] || serverTransport;
export const hasTransport = id => !!transports[id];

// Offered when the server refuses (cap / level 3). The P2P lane registers a transport with id 'p2p'
// and may set fallbackHost(opts) to host the same game from this device.
export const fallback = { host: null };
export const canHostFromDevice = () => hasTransport('p2p') && typeof fallback.host === 'function';
