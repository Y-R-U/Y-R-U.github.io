// Dormant multiplayer — C7 owns this file.
//
// Built as a seam, not as a feature. It only lights up on games.br8t.com, where the shared Firebase
// account layer at /lib/auth/ lives. Everywhere else `available()` is false, the mode is shown but
// not enterable, and NOTHING here touches the network — no import, no fetch, no side effect at
// module load. The page must work with the radio off.
//
// W0's stub said the entry point should be absent rather than disabled. The brief overrides that:
// the mode is visible and explains itself, because a game with a missing mode reads as unfinished
// while a game with an explained one reads as deliberate.
//
// The shape is chosen so a live build is a transport job and never a rules job: the sim is pure and
// deterministic, so a match is fully described by the `newGame` options plus the shot stream. A
// transport that carries the options once and one `{kind,r,c}` per turn is enough, and no board
// ever crosses the wire — which is what keeps fog of war on the sim's side of it.

const HOSTS = ['games.br8t.com'];

export function available() {
  return typeof location !== 'undefined' && HOSTS.includes(location.hostname);
}

// main.js and the debug hook were written against these two names.
export const isAvailable = available;
export const status = () => (available() ? 'dormant' : 'unavailable');

// Player-facing. Not an apology: no "sorry", no "coming soon".
export function reason() {
  return available()
    ? 'Multiplayer is not switched on in this build yet.'
    : 'Multiplayer needs the accounts layer on games.br8t.com. This is the offline build — '
      + 'everything else here runs with no connection at all.';
}

export function describe() {
  return { id: 'multiplayer', label: 'Multiplayer', available: available(), status: status(), reason: reason() };
}

// The one entry point a live build fills in. It must resolve to:
//
//   { side, opts, send(shot), onShot(fn), onLeave(fn), close() }
//
// `opts` is the newGame options both peers agree on — including the layoutSeed, which the host
// draws and the guest never sees. js/ui/flow.js already drives a side that way, so a remote match
// is `startMatch(session.opts)` plus a turn source that is a socket instead of `aiMove`.
export async function connect() {
  throw new Error(reason());
}

export const implemented = false;
