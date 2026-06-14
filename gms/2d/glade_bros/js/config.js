// Tunables + URL modes for Glade Bros.
const params = new URLSearchParams(location.search);
export const SHOT = params.has('shot');           // stage a thumbnail frame
export const AUTO = params.has('auto');            // both brothers AI (soak test)
export const FAST = params.has('fast');            // shorter timers for testing

export const TILE = 40;                            // world px per tile
export const COLS = 24;
export const ROWS = 16;
export const MAP_W = COLS * TILE;
export const MAP_H = ROWS * TILE;

export const CFG = {
  walkSpeed: 3.1 * TILE,   // px/s — calm walk
  runSpeed:  5.3 * TILE,   // px/s — fleeing / chasing
  coughTime: FAST ? 2.5 : 10.0,    // seconds the seeker is frozen coughing (the head-start)
  seekTime:  FAST ? 14 : 28,       // seconds the seeker has to find the hider
  searchDist: 1.5 * TILE,          // how close a seeker must get to "check" a hiding spot
  exposeDist: 1.7 * TILE,          // a hider not on a spot is caught within this range
  fartReach: 1.6 * TILE,           // how close the prankster must be to fart
  reachEps: 0.18 * TILE,           // waypoint arrival tolerance
};

// Brother identities. older = bigger + darker hair, younger = smaller + lighter hair.
export const BROS = {
  older: {
    key: 'older', label: 'Big Bro', emoji: '🧒',
    hair: '#5a3a22', hairLit: '#714a2c', skin: '#f0c79a',
    shirt: '#3f7bd6', shirtDark: '#2c5aa6', pants: '#34405a',
    scale: 1.0, blurb: 'older · dark hair',
  },
  younger: {
    key: 'younger', label: 'Lil Bro', emoji: '👦',
    hair: '#c8975a', hairLit: '#dcb077', skin: '#f6d2ad',
    shirt: '#f2c14e', shirtDark: '#d99c2b', pants: '#5a6b34',
    scale: 0.82, blurb: 'younger · light hair',
  },
};

// Roles in the prank.
export const ROLES = {
  p1: { key: 'p1', label: 'Player 1 · Prankster', short: 'Prankster',
        emoji: '💨', blurb: 'fart & hide' },
  p2: { key: 'p2', label: 'Player 2 · Avenger', short: 'Avenger',
        emoji: '🤢', blurb: 'cough & seek' },
};

export const other = (k) => (k === 'older' ? 'younger' : k === 'younger' ? 'older'
                          : k === 'p1' ? 'p2' : 'p1');
