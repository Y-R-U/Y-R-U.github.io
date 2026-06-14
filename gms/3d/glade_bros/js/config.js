// Tunables + URL modes for Glade Bros 3D.
const params = new URLSearchParams(location.search);
export const SHOT = params.has('shot');   // stage a thumbnail frame
export const AUTO = params.has('auto');   // both brothers AI (soak test)
export const FAST = params.has('fast');   // shorter timers for testing
export const LITE = params.has('lite');   // no shadows (perf)

export const COLS = 24;
export const ROWS = 16;
export const TS = 1.1;                      // world units per tile

export const CFG = {
  walkSpeed: 3.2 * TS,
  runSpeed:  5.3 * TS,
  coughTime: FAST ? 2.5 : 5.0,             // seeker frozen coughing (head-start)
  seekTime:  FAST ? 14 : 28,               // seconds to find the hider
  searchDist: 1.5 * TS,
  exposeDist: 1.7 * TS,
  fartReach: 1.8 * TS,
  reachEps: 0.14 * TS,
  bodyR: 0.30 * TS,
};

// Brother identities — older is bigger w/ dark hair, younger smaller w/ light hair.
export const BROS = {
  older: {
    key: 'older', label: 'Big Bro', emoji: '🧒', blurb: 'older · dark hair',
    hair: 0x4a3122, hairLit: 0x5e3f2b, skin: 0xf0c79a,
    shirt: 0x3f7bd6, shirtDark: 0x2c5aa6, pants: 0x36405a, shoe: 0x3a2c22,
    scale: 1.0,
  },
  younger: {
    key: 'younger', label: 'Lil Bro', emoji: '👦', blurb: 'younger · light hair',
    hair: 0xc8975a, hairLit: 0xddb277, skin: 0xf6d2ad,
    shirt: 0xf2c14e, shirtDark: 0xd99c2b, pants: 0x5a6b34, shoe: 0x6a4a3a,
    scale: 0.82,
  },
};

export const ROLES = {
  p1: { key: 'p1', label: 'Player 1 · Prankster', short: 'Prankster', emoji: '💨', blurb: 'fart & hide' },
  p2: { key: 'p2', label: 'Player 2 · Avenger',   short: 'Avenger',   emoji: '🤢', blurb: 'cough & seek' },
};

export const other = (k) => (k === 'older' ? 'younger' : k === 'younger' ? 'older'
                          : k === 'p1' ? 'p2' : 'p1');
