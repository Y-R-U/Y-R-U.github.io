// What is open to you, and why it is not. Three gates, all readable from one
// place so nothing in the UI has to guess:
//
//   the team    — a facility you buy with cash, which unlocks circuits
//   the season  — story levels cleared
//   the trophy  — a specific event or circuit you have actually won
//
// Every gate returns a *reason* as well as a boolean, because a padlock the
// player cannot interpret is just a wall.

import { profile } from './save.js';
import { TRACK_DEFS, TRACK_BY_ID } from './trackgen.js';
import { fmtMoney } from './utils.js';

// ---------------------------------------------------------------------------
// The team
// ---------------------------------------------------------------------------
// Levels are bought outright. Each one is a bigger building, a bigger prize
// share and a couple more circuits your licence covers.
export const TEAM_LEVELS = [
  {
    n: 1, name: 'BACKSTREET LOCKUP', cost: 0, icon: '🔧',
    blurb: 'One roller door, one socket set and a kettle.',
    prize: 1.0, repair: 1.0, crateLuck: 0,
  },
  {
    n: 2, name: 'RENTED UNIT', cost: 22000, icon: '🏚️',
    blurb: 'A unit on an industrial estate. There is a ramp now.',
    prize: 1.06, repair: 0.94, crateLuck: 0.04,
  },
  {
    n: 3, name: 'PROPER WORKSHOP', cost: 85000, icon: '🏭',
    blurb: 'Two bays, a fabricator and somebody who answers the phone.',
    prize: 1.13, repair: 0.86, crateLuck: 0.09,
  },
  {
    n: 4, name: 'TEAM HQ', cost: 240000, icon: '🏢',
    blurb: 'A building with your name on it and a lawyer on retainer.',
    prize: 1.21, repair: 0.76, crateLuck: 0.15,
  },
  {
    n: 5, name: 'FACTORY OUTFIT', cost: 650000, icon: '🏛️',
    blurb: 'A works team. The series has to pretend to like you now.',
    prize: 1.32, repair: 0.64, crateLuck: 0.22,
  },
];

export const teamLevel = () => Math.max(1, Math.min(TEAM_LEVELS.length, profile.team?.level || 1));
export const team = () => TEAM_LEVELS[teamLevel() - 1];
export const nextTeam = () => TEAM_LEVELS[teamLevel()] || null;

export function buyTeamLevel() {
  const next = nextTeam();
  if (!next || profile.money < next.cost) return false;
  profile.money -= next.cost;
  profile.team.level = next.n;
  return true;
}

// ---------------------------------------------------------------------------
// Circuits
// ---------------------------------------------------------------------------
// Every circuit past the first is behind at least one gate, and most are behind
// two so there is always a way through: grind the season, or pay for a licence.
// `story` is the story level you must have *cleared*.
const TRACK_GATES = {
  hometown:     [],
  dockside:     [{ kind: 'story', level: 8 }, { kind: 'buy', cost: 9000 }],
  speedbowl:    [{ kind: 'team', level: 2 }, { kind: 'buy', cost: 18000 }],
  neonmile:     [{ kind: 'story', level: 20 }, { kind: 'buy', cost: 26000 }],
  grinder:      [{ kind: 'story', level: 28 }, { kind: 'buy', cost: 34000 }],
  stormharbour: [{ kind: 'team', level: 3 }, { kind: 'buy', cost: 44000 }],
  loopyard:     [{ kind: 'story', level: 40 }, { kind: 'buy', cost: 58000 }],
  saltflats:    [{ kind: 'team', level: 3 }, { kind: 'buy', cost: 52000 }],
  quarry:       [{ kind: 'story', level: 50 }, { kind: 'buy', cost: 66000 }],
  carverpass:   [{ kind: 'story', level: 55 }, { kind: 'buy', cost: 78000 }],
  crownpoint:   [{ kind: 'story', level: 60 }, { kind: 'team', level: 4 }],
  cathedral:    [{ kind: 'team', level: 4 }, { kind: 'buy', cost: 120000 }],
  skyline:      [{ kind: 'story', level: 70 }, { kind: 'buy', cost: 150000 }],
  twinrings:    [{ kind: 'story', level: 90 }, { kind: 'team', level: 5 }],
  circus:       [{ kind: 'story', level: 100 }, { kind: 'win', event: 'gauntlet' }],
};

export const trackGates = (id) => TRACK_GATES[id] || [];

// A gate is satisfied if any one of its conditions is met. Cash licences are
// bought, not met — they show as an offer until you take it.
export function trackUnlocked(id) {
  if (!TRACK_GATES[id] || !TRACK_GATES[id].length) return true;
  if (profile.tracks && profile.tracks.includes(id)) return true;
  return TRACK_GATES[id].some((g) => conditionMet(g));
}

export function conditionMet(g) {
  switch (g.kind) {
    case 'story':  return storyCleared() >= g.level;
    case 'team':   return teamLevel() >= g.level;
    case 'win':    return !!profile.events.cleared[g.event];
    case 'track':  return !!(profile.wins && profile.wins[g.track]);
    case 'car':    return !!(profile.cars && profile.cars.includes(g.car));
    case 'rank':   return profile.rank <= g.rank;
    case 'buy':    return false;    // an offer, never automatically satisfied
    default:       return true;
  }
}

// How many story levels are actually finished (profile.story.level is the next
// one you may attempt, so it runs one ahead).
export const storyCleared = () => Math.max(0, (profile.story.level || 1) - 1);

export function conditionText(g) {
  switch (g.kind) {
    case 'story': return `Clear season level ${g.level}`;
    case 'team':  return `Upgrade the team to ${TEAM_LEVELS[g.level - 1].name}`;
    case 'win':   return `Win the ${g.eventName || g.event.toUpperCase()} commission`;
    case 'track': return `Win a race at ${TRACK_BY_ID[g.track] ? TRACK_BY_ID[g.track].name : g.track}`;
    case 'car':   return `Own the ${g.carName || g.car.toUpperCase()}`;
    case 'rank':  return `Reach world rank ${g.rank.toLocaleString('en-US')}`;
    case 'buy':   return `Buy the circuit licence for ${fmtMoney(g.cost)}`;
    default:      return 'Keep racing';
  }
}

// The single most useful line to show on a padlock: the condition you are
// closest to satisfying, preferring progress over a chequebook.
export function nearestGate(gates) {
  if (!gates || !gates.length) return null;
  return gates.find((g) => g.kind !== 'buy') || gates[0];
}

export function buyTrack(id) {
  const gate = trackGates(id).find((g) => g.kind === 'buy');
  if (!gate || profile.money < gate.cost) return false;
  profile.money -= gate.cost;
  profile.tracks = profile.tracks || [];
  if (!profile.tracks.includes(id)) profile.tracks.push(id);
  return true;
}

export const unlockedTracks = () => TRACK_DEFS.filter((d) => trackUnlocked(d.id));

// A track you have actually won at — used by event gates and the trophy room.
export function recordWin(trackId, eventId) {
  profile.wins = profile.wins || {};
  if (trackId) {
    profile.wins[trackId] = (profile.wins[trackId] || 0) + 1;
    profile.wins['first:' + trackId] = profile.wins['first:' + trackId] || Date.now();
  }
  if (eventId) {
    profile.wins['ev:' + eventId] = (profile.wins['ev:' + eventId] || 0) + 1;
    profile.wins['first:ev:' + eventId] = profile.wins['first:ev:' + eventId] || Date.now();
  }
}

export const winsAt = (key) => profile.wins ? (profile.wins[key] || 0) : 0;
export const firstWonAt = (key) => (profile.wins || {})['first:' + key] || 0;

// ---------------------------------------------------------------------------
// The cabinet
// ---------------------------------------------------------------------------
// One row per thing worth being smug about. `check` decides whether it is on
// the shelf; `history` is what the player sees when they tap it.
export const TROPHIES = [
  { id: 'first-win',  name: 'FIRST BLOOD',        shape: 'cup',   colour: 0xc0c6cd, key: null,
    blurb: 'Your first win in the series.',      check: () => profile.stats.wins >= 1 },
  { id: 'ten-wins',   name: 'TEN IN THE BOOK',    shape: 'cup',   colour: 0xd8b45a, key: null,
    blurb: 'Ten race wins.',                     check: () => profile.stats.wins >= 10 },
  { id: 'fifty-wins', name: 'THE HABIT',          shape: 'cup',   colour: 0xffd166, key: null,
    blurb: 'Fifty race wins.',                   check: () => profile.stats.wins >= 50 },
  { id: 'hometown',   name: 'HOMETOWN OVAL',      shape: 'plate', colour: 0x9fb0c0, key: 'hometown',
    blurb: 'Won where it started.',              check: () => winsAt('hometown') > 0 },
  { id: 'grinder',    name: 'THE GRINDER',        shape: 'plate', colour: 0xc4482c, key: 'grinder',
    blurb: 'Won on the narrowest circuit in the series.', check: () => winsAt('grinder') > 0 },
  { id: 'loopyard',   name: 'THE LOOP YARD',      shape: 'plate', colour: 0x4aa3ef, key: 'loopyard',
    blurb: 'Won upside down and lived.',         check: () => winsAt('loopyard') > 0 },
  { id: 'twinrings',  name: 'TWIN RINGS',         shape: 'plate', colour: 0xb765f0, key: 'twinrings',
    blurb: 'Eight loops a lap, and you were first out of the last one.', check: () => winsAt('twinrings') > 0 },
  { id: 'circus',     name: 'THE CIRCUS',         shape: 'star',  colour: 0xffb020, key: 'circus',
    blurb: 'Won at the big top.',                check: () => winsAt('circus') > 0 },
  { id: 'ev-derby',   name: 'DEMOLITION DERBY',   shape: 'belt',  colour: 0xc4482c, key: 'ev:derby',
    blurb: 'Four rivals into the wall on purpose.', check: () => winsAt('ev:derby') > 0 },
  { id: 'ev-gauntlet', name: 'THE GAUNTLET',      shape: 'belt',  colour: 0xff5a2b, key: 'ev:gauntlet',
    blurb: 'Last car running.',                  check: () => winsAt('ev:gauntlet') > 0 },
  { id: 'ev-blackout', name: 'BLACKOUT RUN',      shape: 'star',  colour: 0x4de0b0, key: 'ev:blackout',
    blurb: 'Nobody saw a thing.',                check: () => winsAt('ev:blackout') > 0 },
  { id: 'ev-baron',   name: "THE BARON'S DERBY",  shape: 'cup',   colour: 0x8b2fd0, key: 'ev:baron',
    blurb: 'A private invitation, and you took it.', check: () => winsAt('ev:baron') > 0 },
  { id: 'ev-champ',   name: "CHAMPION'S INVITE",  shape: 'cup',   colour: 0xffd166, key: 'ev:championsinvite',
    blurb: 'You beat Krieg at his own meeting.', check: () => winsAt('ev:championsinvite') > 0 },
  { id: 'title-local', name: 'CITY TITLE',        shape: 'belt',  colour: 0xc0c6cd, key: 'title:local',
    blurb: 'City champion.',                     check: () => !!(profile.titles.local && profile.titles.local.won) },
  { id: 'title-national', name: 'NATIONAL TITLE', shape: 'belt',  colour: 0xd8b45a, key: 'title:national',
    blurb: 'National champion.',                 check: () => !!(profile.titles.national && profile.titles.national.won) },
  { id: 'title-world', name: 'WORLD TITLE',       shape: 'belt',  colour: 0xffd166, key: 'title:world',
    blurb: 'World champion. There is nothing above this.', check: () => !!(profile.titles.world && profile.titles.world.won) },
  { id: 'season',     name: 'THE SEASON',         shape: 'star',  colour: 0xff5a2b, key: null,
    blurb: 'One hundred levels, start to finish.', check: () => storyCleared() >= 100 },
  { id: 'clean',      name: 'NEVER PROVEN',       shape: 'plate', colour: 0x37c26a, key: null,
    blurb: 'A hundred fouls that passed as racing incidents.', check: () => profile.stats.cleanFouls >= 100 },
  { id: 'wrecker',    name: 'THE WRECKER',        shape: 'star',  colour: 0xff4242, key: null,
    blurb: 'A hundred rivals put out of races.', check: () => profile.stats.wrecksCaused >= 100 },
  { id: 'airtime',    name: 'FLIGHT TIME',        shape: 'star',  colour: 0x35b6ff, key: null,
    blurb: 'Twenty metres of air in one jump.',  check: () => (profile.stats.bestAir || 0) >= 20 },
  { id: 'collector',  name: 'THE COLLECTOR',      shape: 'cup',   colour: 0xb765f0, key: null,
    blurb: 'Every trick in the game, in your rack.', check: () => profile.garage.skills.length >= 15 },
  { id: 'factory',    name: 'A WORKS TEAM',       shape: 'plate', colour: 0xffb020, key: null,
    blurb: 'Built the team all the way up.',     check: () => teamLevel() >= 5 },
  { id: 'topten',     name: 'TOP TEN IN THE WORLD', shape: 'cup', colour: 0xffd166, key: null,
    blurb: 'Ranked inside the top ten of three million.', check: () => profile.bestRank <= 10 },
  { id: 'champion',   name: 'NUMBER ONE',         shape: 'star',  colour: 0xffffff, key: null,
    blurb: 'World number one.',                  check: () => profile.bestRank <= 1 },
];

export const TROPHY_BY_ID = Object.fromEntries(TROPHIES.map((t) => [t.id, t]));

export function earnedTrophies() {
  const out = [];
  for (const t of TROPHIES) {
    try { if (t.check()) out.push(t.id); } catch (e) { /* a half-migrated save */ }
  }
  return out;
}

