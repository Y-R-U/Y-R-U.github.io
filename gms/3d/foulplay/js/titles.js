// TITLES — three single-elimination brackets that open up as the season does.
//
// A round is one race against a named opponent with a supporting field, and
// the only thing that counts is finishing ahead of them. That is what makes it
// a bracket rather than another race meeting: there is a specific person in
// that field whose day you have to ruin, and the tree on the screen shows
// exactly who is waiting if you manage it.
//
// Lose a round and you are out of that title until you enter again, which
// redraws the whole bracket. Titles are meant to sting.

import { profile, saveProfile } from './save.js';
import { RIVAL_NAMES, TEAM_NAMES, LIVERY } from './config.js';
import { TRACK_BY_ID } from './trackgen.js';
import { storyCleared } from './progress.js';
import { mulberry32, clamp, shuffled } from './utils.js';

export const TITLES = [
  {
    id: 'local', name: 'CITY TITLE', icon: '🥉', size: 8,
    blurb: 'Eight cars nobody outside the ring road has heard of, including you.',
    tracks: ['hometown', 'dockside', 'speedbowl'],
    skill: 0.74, aggro: 0.5, tier: 2.4, purse: 14000, field: 6,
    gate: { kind: 'story', level: 25 },
    prize: 'A parts crate for every round, and a sponsor vault for the title.',
  },
  {
    id: 'national', name: 'NATIONAL TITLE', icon: '🥈', size: 16,
    blurb: 'Sixteen names, four rounds and a broadcast slot after the news.',
    tracks: ['grinder', 'crownpoint', 'stormharbour', 'skyline'],
    skill: 0.86, aggro: 0.62, tier: 4.2, purse: 38000, field: 8,
    gate: { kind: 'story', level: 55 }, needs: 'local',
    prize: 'A contraband crate a round, and two sponsor vaults for the title.',
  },
  {
    id: 'world', name: 'WORLD TITLE', icon: '🏆', size: 16,
    blurb: 'The only bracket that matters. Krieg is seeded first and is not pretending otherwise.',
    tracks: ['cathedral', 'twinrings', 'skyline', 'circus'],
    skill: 0.95, aggro: 0.78, tier: 6, purse: 120000, field: 8,
    gate: { kind: 'story', level: 85 }, needs: 'national',
    prize: 'Three sponsor vaults, a world championship, and the last word.',
  },
];

export const TITLE_BY_ID = Object.fromEntries(TITLES.map((t) => [t.id, t]));
export const titleById = (id) => TITLE_BY_ID[id] || null;

export const roundCount = (t) => Math.round(Math.log2(t.size));

export function roundName(t, r) {
  const left = roundCount(t) - r;
  if (left <= 1) return 'THE FINAL';
  if (left === 2) return 'SEMI-FINAL';
  if (left === 3) return 'QUARTER-FINAL';
  return `ROUND OF ${Math.pow(2, left)}`;
}

export function titleUnlocked(t) {
  if (storyCleared() < t.gate.level) return false;
  if (t.needs && !(profile.titles[t.needs] && profile.titles[t.needs].won)) return false;
  return true;
}

export function titleLockText(t) {
  if (storyCleared() < t.gate.level) return `Clear season level ${t.gate.level}`;
  if (t.needs && !(profile.titles[t.needs] && profile.titles[t.needs].won)) {
    return `Win the ${TITLE_BY_ID[t.needs].name} first`;
  }
  return '';
}

export const titleState = (id) => profile.titles[id] || null;

// ---------------------------------------------------------------------------
// Drawing a bracket
// ---------------------------------------------------------------------------
// Seeded off the title and how many times you have entered, so a fresh attempt
// is a genuinely fresh draw but reloading the page does not reshuffle it.
export function enterTitle(id) {
  const t = titleById(id);
  if (!t) return null;
  const prev = profile.titles[id] || { attempts: 0, won: false, titles: 0 };
  const attempt = (prev.attempts || 0) + 1;
  let h = 2166136261;
  const key = id + ':' + attempt;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rng = mulberry32(h >>> 0);

  const names = shuffled(RIVAL_NAMES, rng).slice(0, t.size - 1);
  const seeds = [];
  const mySlot = Math.floor(rng() * t.size);
  let ni = 0;
  for (let i = 0; i < t.size; i++) {
    if (i === mySlot) {
      seeds.push({ me: true, name: profile.name, team: 'You', strength: 0.5, out: false });
    } else {
      seeds.push({
        me: false,
        name: names[ni] || 'SEED ' + (i + 1),
        team: TEAM_NAMES[Math.floor(rng() * TEAM_NAMES.length)],
        // Seeding is real: the top of the draw is genuinely harder.
        strength: clamp(1 - i / t.size + (rng() - 0.5) * 0.24, 0.05, 1),
        livery: LIVERY[Math.floor(rng() * LIVERY.length)],
        out: false,
      });
      ni++;
    }
  }
  // The world title has a name at the top of it.
  if (id === 'world') {
    const top = seeds.findIndex((s) => !s.me);
    if (top >= 0) { seeds[top].name = 'VIKTOR KRIEG'; seeds[top].team = 'The Circus'; seeds[top].strength = 1; }
  }

  profile.titles[id] = {
    attempts: attempt,
    won: prev.won || false,
    titles: prev.titles || 0,
    round: 0,
    live: true,
    seeds,
    log: [],
    trackSeed: Math.floor(rng() * 1000),
  };
  saveProfile(true);
  return profile.titles[id];
}

// Who you are up against this round: the surviving seed nearest you in the
// draw, which is exactly how a bracket pairs people.
export function currentPairing(id) {
  const st = titleState(id);
  const t = titleById(id);
  if (!st || !t || !st.live) return null;
  const alive = st.seeds.filter((s) => !s.out);
  const myIdx = alive.findIndex((s) => s.me);
  if (myIdx < 0) return null;
  const pairIdx = myIdx % 2 === 0 ? myIdx + 1 : myIdx - 1;
  return { me: alive[myIdx], them: alive[pairIdx] || null, alive };
}

// The bracket as columns, for drawing. Column r holds everybody who was still
// in the draw when round r started, paired the way the round paired them.
export function bracketFor(id) {
  const st = titleState(id);
  const t = titleById(id);
  if (!st || !t) return [];
  const cols = [];
  let alive = st.seeds.slice();
  for (let r = 0; r < roundCount(t) && alive.length >= 2; r++) {
    const pairs = [];
    for (let i = 0; i < alive.length; i += 2) pairs.push([alive[i], alive[i + 1] || null]);
    cols.push({ round: r, name: roundName(t, r), pairs });
    alive = alive.filter((s) => !(s.out && s.outRound <= r));
  }
  if (alive.length === 1) cols.push({ round: roundCount(t), name: 'CHAMPION', pairs: [[alive[0], null]] });
  return cols;
}

// The race for the round the player is standing in.
export function titleRoundEvent(id) {
  const t = titleById(id);
  const st = titleState(id);
  const pair = currentPairing(id);
  if (!t || !st || !pair || !pair.them) return null;

  const track = t.tracks[(st.round + st.trackSeed) % t.tracks.length];
  const def = TRACK_BY_ID[track];
  const last = st.round >= roundCount(t) - 1;

  return {
    mode: 'title',
    id: `title-${id}-${st.round}`,
    titleId: id,
    round: st.round,
    title: `${t.name} · ${roundName(t, st.round)}`,
    subtitle: `VS ${pair.them.name}`,
    icon: t.icon,
    track,
    laps: def ? def.laps : 3,
    cars: t.field,
    aiSkill: clamp(t.skill + st.round * 0.025, 0.5, 0.99),
    aiAggro: clamp(t.aggro + st.round * 0.04, 0.2, 0.98),
    rubber: 0.2,
    tier: t.tier,
    purse: Math.round(t.purse * (0.5 + st.round * 0.35)),
    purseTier: 1 + t.tier * 0.22,
    playerSlot: Math.floor(t.field / 2),
    knockout: last,
    // The named opponent goes in as the strongest car on the grid.
    rivals: buildRoundField(t, st, pair),
    objective: { kind: 'beat', name: pair.them.name, label: `FINISH AHEAD OF ${pair.them.name}` },
    chestOnClear: last ? 'sponsor' : t.id === 'local' ? 'parts' : 'contra',
  };
}

function buildRoundField(t, st, pair) {
  const out = [];
  const strong = pair.them;
  out.push({
    name: strong.name, team: strong.team, style: 'wedge',
    livery: strong.livery || LIVERY[0],
    skill: clamp(t.skill + strong.strength * 0.1, 0.5, 0.995),
    aggression: clamp(t.aggro + strong.strength * 0.2, 0.2, 1),
    boss: true,
  });
  const styles = ['muscle', 'stock', 'van', 'buggy', 'wedge'];
  const others = st.seeds.filter((s) => !s.me && s !== strong && !s.out);
  for (let i = 0; out.length < t.field - 1; i++) {
    const s = others[i % Math.max(1, others.length)] || { name: 'RESERVE ' + i, team: 'Reserve', strength: 0.4 };
    out.push({
      name: s.name + (i >= others.length ? ' II' : ''), team: s.team, style: styles[i % styles.length],
      livery: s.livery || LIVERY[(i + 4) % LIVERY.length],
      skill: clamp(t.skill - 0.08 + s.strength * 0.12, 0.4, 0.97),
      aggression: clamp(t.aggro - 0.05 + s.strength * 0.15, 0.15, 0.95),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Resolving a round
// ---------------------------------------------------------------------------
// `round` is the round the race was started for. RACE AGAIN re-runs the same
// event descriptor, and resolving an already-settled round a second time
// eliminates another pair of seeds and skips the player up the tree.
export function resolveRound(id, playerWon, round) {
  const t = titleById(id);
  const st = titleState(id);
  const pair = currentPairing(id);
  if (!t || !st || !pair) return null;
  if (round != null && round !== st.round) return null;

  // Resolve every match in the round from ONE snapshot of who was still in it.
  // Eliminating the player's opponent first and then re-reading the list makes
  // the count odd, which drifts the pairing and leaves a seed with no match —
  // which is how a three-round bracket ends up playing two finals.
  const alive = pair.alive;
  const beaten = pair.them;
  for (let i = 0; i < alive.length; i += 2) {
    const a = alive[i], b = alive[i + 1];
    if (!b) continue;
    let loser;
    if (a.me || b.me) loser = playerWon ? (a.me ? b : a) : (a.me ? a : b);
    // Everybody else's match goes the way seeding says it should, with just
    // enough noise that the tree is not the same every time.
    else loser = a.strength + rand01(st, i) * 0.4 >= b.strength + rand01(st, i + 99) * 0.4 ? b : a;
    loser.out = true;
    loser.outRound = st.round;
  }

  if (!playerWon) {
    st.live = false;
    st.log.push(`${roundName(t, st.round)}: beaten by ${beaten ? beaten.name : 'the field'}`);
    saveProfile(true);
    return { out: true, round: st.round };
  }
  st.log.push(`${roundName(t, st.round)}: beat ${beaten ? beaten.name : 'the field'}`);

  st.round++;
  const left = st.seeds.filter((s) => !s.out).length;
  if (left <= 1) {
    st.live = false;
    st.won = true;
    st.titles = (st.titles || 0) + 1;
    st.log.push(`WON THE ${t.name}`);
    saveProfile(true);
    return { champion: true, round: st.round };
  }
  saveProfile(true);
  return { advanced: true, round: st.round };
}

// Deterministic per bracket + round + slot, so a reload cannot reroll it.
function rand01(st, i) {
  let h = (st.trackSeed * 2654435761) ^ (st.round * 40503) ^ (i * 2246822519);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}
