// Rank ladder. Career rank = lifetime banked PP. Online Court rank = position in the room (js/game/court.js).
// splice: the callsign title clip id each tower voice pre-generates (cs_title_<splice>).

export const RANKS = [
  { id: 'baron',       m: 'Baron',        f: 'Baroness',       minPP: 0,      addressM: 'my Lord',  addressF: 'my Lady',  splice: { m: 'baron', f: 'baroness' },             unlocks: ['livery_stripes'] },
  { id: 'viscount',    m: 'Viscount',     f: 'Viscountess',    minPP: 2000,   addressM: 'my Lord',  addressF: 'my Lady',  splice: { m: 'viscount', f: 'viscountess' },       unlocks: ['cub', 'livery_chequer'] },
  { id: 'earl',        m: 'Earl',         f: 'Countess',       minPP: 6000,   addressM: 'my Lord',  addressF: 'my Lady',  splice: { m: 'earl', f: 'countess' },              unlocks: ['tiger', 'flexwing'] },
  { id: 'marquess',    m: 'Marquess',     f: 'Marchioness',    minPP: 14000,  addressM: 'my Lord',  addressF: 'my Lady',  splice: { m: 'marquess', f: 'marchioness' },       unlocks: ['pitts', 'beaver', 'livery_crest'] },
  { id: 'duke',        m: 'Duke',         f: 'Duchess',        minPP: 28000,  addressM: 'Your Grace', addressF: 'Your Grace', splice: { m: 'duke', f: 'duchess' },          unlocks: ['caravan', 'baron58', 'host_ranked'] },
  { id: 'archduke',    m: 'Archduke',     f: 'Archduchess',    minPP: 50000,  addressM: 'Your Imperial Highness', addressF: 'Your Imperial Highness', splice: { m: 'archduke', f: 'archduchess' }, unlocks: ['sopwith', 'extra', 'twinotter'] },
  { id: 'prince',      m: 'Prince',       f: 'Princess',       minPP: 80000,  addressM: 'Your Highness', addressF: 'Your Highness', splice: { m: 'prince', f: 'princess' },  unlocks: ['bizjet', 'catalina', 'autogyro'] },
  { id: 'crownprince', m: 'Crown Prince', f: 'Crown Princess', minPP: 120000, addressM: 'Your Royal Highness', addressF: 'Your Royal Highness', splice: { m: 'crown_prince', f: 'crown_princess' }, unlocks: ['spitfire', 'gulf'] },
  { id: 'king',        m: 'King',         f: 'Queen',          minPP: 180000, addressM: 'Your Majesty', addressF: 'Your Majesty', splice: { m: 'king', f: 'queen' },        unlocks: ['jumbo', 'a320', 'host_decree'] },
  { id: 'emperor',     m: 'Emperor',      f: 'Empress',        minPP: 260000, minOnlineWins: 10, addressM: 'Your Imperial Majesty', addressF: 'Your Imperial Majesty', splice: { m: 'emperor', f: 'empress' }, unlocks: ['throne', 'bathtub_gold_taps'] },
];

export function rankFor(lifetimePP) {
  let r = RANKS[0];
  for (const k of RANKS) if (lifetimePP >= k.minPP) r = k;
  return r;
}

export function titleOf(rank, gender) { return gender === 'f' ? rank.f : rank.m; }

export function nextRank(rank) {
  const i = RANKS.indexOf(rank);
  return i >= 0 && i < RANKS.length - 1 ? RANKS[i + 1] : null;
}

// Online Court lives in js/game/court.js (DECISIONS D4).

// AI traffic ranks (for the Audacity multiplier): weighted draw, index into RANKS.
export const AI_RANK_WEIGHTS = [0.22, 0.2, 0.17, 0.14, 0.11, 0.07, 0.05, 0.02, 0.015, 0.005];
