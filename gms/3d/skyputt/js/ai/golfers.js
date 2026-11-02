// Ghost AI golfers: personalities (PLAN 2.6), skill → rating / rank / noise / search effort,
// generated names and bios for story rivals and tournament fields. Pure data + maths, node-safe.
import { makeRng, hashStr } from './rng.js';

const D2R = Math.PI / 180;
export const BASE_BUDGET = 40000;   // physics steps for a skill-1 plan with budgetK 1 (≈ 300 ms on a mid phone)

// Personality = weighting of the planner's cost terms + risk appetite + how noise behaves.
//   style:  planner terms (see planner.js DEFAULT_STYLE): wOob, wBank, wPower, wHole, risk, pMin/pMax, waits
//   budgetK: search effort multiplier      senseK: how big a noise the robustness check assumes
//   aimK / powerK: execution-noise multipliers     noise: 'normal' | 'power' (grows with power) | 'streaky'
export const PERSONALITIES = {
  carl: {
    id: 'carl', name: 'Careful Carl', color: 0x7fb8ff, budgetK: 1.0, senseK: 1.7, aimK: 0.9, powerK: 0.8, noise: 'normal',
    style: { wOob: 4.0, wHole: 0, wPower: -0.25, layup: 2.5, risk: { worst: 0.7, mean: 0.3, best: 0 }, pMax: 0.92 },
    blurb: 'Lays up, never takes the carry. Rarely spectacular, rarely in the drink.',
  },
  bertha: {
    id: 'bertha', name: 'Big Bertha', color: 0xff7a59, budgetK: 0.9, senseK: 0.5, aimK: 1.0, powerK: 1.15, noise: 'power',
    style: { wOob: 0.1, wHole: 1.5, wPower: 1.6, risk: { worst: 0, mean: 0.5, best: 0.5 } },
    blurb: 'Full power, every time. Takes every carry and every shortcut. Aces and splashes.',
  },
  banks: {
    id: 'banks', name: 'Banks', color: 0xb98cff, budgetK: 1.0, senseK: 1.0, aimK: 1.0, powerK: 1.0, noise: 'normal',
    style: { wOob: 1.0, wBank: 1.4, risk: { worst: 0.25, mean: 0.75, best: 0 } },
    blurb: 'Sees the walls as friends. Would rather bank it twice than go straight.',
  },
  lou: {
    id: 'lou', name: 'Lucky Lou', color: 0x6fe39a, budgetK: 0.7, senseK: 0.7, aimK: 1.25, powerK: 1.25, noise: 'streaky',
    style: { wOob: 0.6, wHole: 0.4, risk: { worst: 0.05, mean: 0.5, best: 0.45 } },
    blurb: 'Erratic. Then sinks a forty-footer off two walls and a windmill. Then misses a tap-in.',
  },
  pro: {
    id: 'pro', name: 'The Pro', color: 0xffd34d, budgetK: 1.25, senseK: 1.0, aimK: 0.8, powerK: 0.8, noise: 'normal',
    style: { wOob: 1.2, risk: { worst: 0.3, mean: 0.7, best: 0 } },
    blurb: 'Reads every hole like a book. Near-optimal and unbothered.',
  },
  professor: {
    id: 'professor', name: 'The Professor', color: 0x4fd6d6, budgetK: 1.5, senseK: 1.3, aimK: 0.6, powerK: 1.25, noise: 'normal',
    style: { wOob: 1.8, wPower: -0.5, risk: { worst: 0.45, mean: 0.55, best: 0 } },
    blurb: 'Calculates everything, trusts nothing. Perfect lines, timid pace: dies it at the cup or leaves it short.',
  },
  zoe: {
    id: 'zoe', name: 'Zippy Zoe', color: 0xff6fc8, budgetK: 0.35, senseK: 0.8, aimK: 1.1, powerK: 1.0, noise: 'normal',
    style: { wOob: 0.8, wPower: 0.3, risk: { worst: 0.15, mean: 0.75, best: 0.1 }, waits: [0] },
    blurb: 'Plays fast, never waits for a windmill. Instinct over analysis.',
  },
  mags: {
    id: 'mags', name: 'Old Mags', color: 0xe8e0c8, budgetK: 1.3, senseK: 1.2, aimK: 0.7, powerK: 0.7, noise: 'normal',
    style: { wOob: 1.6, wBank: 0.3, risk: { worst: 0.4, mean: 0.6, best: 0 } },
    blurb: 'The retired champion who runs the snack hut. Still the best putter on the isles.',
  },
};
export const PERSONALITY_IDS = Object.keys(PERSONALITIES);

// ---- skill (0..1) → rating, rank title, noise
export const RANKS = ['Nobody', 'Amateur', 'Club Player', 'Semi-pro', 'Pro', 'Legend'];
const RANK_AT = [0, 0.15, 0.35, 0.55, 0.72, 0.9];
export function rankOf(skill) { let r = 0; for (let i = 0; i < RANK_AT.length; i++) if (skill >= RANK_AT[i]) r = i; return RANKS[r]; }
export function ratingOf(skill) { return Math.round(600 + 1800 * clamp01(skill)); }
export function skillOfRating(rating) { return clamp01((rating - 600) / 1800); }

// Execution noise at a skill: aim sd (rad), power sd (fraction of power), timing sd (s).
export function noiseOf(skill, pers = PERSONALITIES.pro) {
  const k = Math.pow(1 - clamp01(skill), 1.3);
  return {
    aim: (0.9 + 9 * k) * D2R * pers.aimK,
    power: (0.03 + 0.19 * k) * pers.powerK,
    time: 0.02 + 0.22 * (1 - clamp01(skill)),
  };
}

// An AI golfer. All randomness comes from `seed` (its own RNG stream), so rounds are reproducible.
export class AIGolfer {
  constructor({ personality = 'pro', skill = 0.5, name, nick, bio, home, seed, id, color } = {}) {
    this.pers = PERSONALITIES[personality] || PERSONALITIES.pro;
    this.personality = this.pers.id;
    this.skill = clamp01(skill);
    this.seed = seed ?? hashStr(`${personality}:${skill}:${name || ''}`);
    this.id = id || `${this.personality}-${(this.seed >>> 0).toString(36)}`;
    this.name = name || this.pers.name;
    this.nick = nick || null;
    this.bio = bio || this.pers.blurb;
    this.home = home || null;
    this.color = color ?? this.pers.color;
    this.rating = ratingOf(this.skill);
    this.rank = rankOf(this.skill);
    this.noise = noiseOf(this.skill, this.pers);
    this.rng = makeRng(this.seed);
  }

  // Planner style for this golfer (pass to Planner.plan or the worker).
  style({ budgetScale = 1 } = {}) {
    const p = this.pers, n = this.noise;
    const st = { ...p.style };
    st.budget = Math.round(BASE_BUDGET * (0.25 + 0.75 * this.skill) * p.budgetK * budgetScale);
    // robustness is checked against the golfer's own noise, but novices underrate how wild they are
    const aware = (0.35 + 0.65 * this.skill) * p.senseK;
    st.sense = { aim: Math.max(0.6 * D2R, n.aim * aware), power: Math.max(0.02, n.power * aware), time: Math.max(0.04, n.time * aware) };
    // weaker golfers search a narrower fan of headings (they don't see the clever banks)
    st.span = 45 + 35 * this.skill;
    return st;
  }

  // Draw the random numbers one shot needs, from this golfer's stream. Drawing them up front (on the
  // main thread) keeps a round reproducible whether the plan runs in a worker or inline.
  ticket(rng = this.rng) { return { u: rng(), ga: rng.gauss(), gp: rng.gauss(), gt: rng.gauss() }; }

  // Apply this golfer's execution noise to a plan → the shot actually played.
  execute(plan, t = this.ticket()) {
    const n = this.noise;
    let ka = 1, kp = 1;
    if (this.pers.noise === 'streaky') {   // Lou: hot, wild or just Lou
      if (t.u < 0.22) ka = kp = 0.15; else if (t.u < 0.45) ka = kp = 2.2; else ka = kp = 1.05;
    } else if (this.pers.noise === 'power') {   // Bertha: the harder she hits, the wilder
      kp = 0.6 + 0.6 * plan.power; ka = 0.8 + 0.4 * plan.power;
    }
    const aim = plan.aim + t.ga * n.aim * ka;
    const power = Math.max(0.02, Math.min(1, plan.power * (1 + t.gp * n.power * kp)));
    const wait = Math.max(0, (plan.wait || 0) + t.gt * n.time);
    return { aim, power, wait };
  }

  toJSON() {
    return { id: this.id, name: this.name, nick: this.nick, bio: this.bio, home: this.home, personality: this.personality, skill: this.skill, seed: this.seed, color: this.color, rating: this.rating, rank: this.rank };
  }
}

// ---- names and bios
const FIRST = ['Ada', 'Basil', 'Cora', 'Dex', 'Edie', 'Fitz', 'Gwen', 'Hugo', 'Ivy', 'Jules', 'Kit', 'Lena', 'Milo', 'Nell', 'Otis', 'Pip',
  'Quinn', 'Rosa', 'Sol', 'Tess', 'Umar', 'Vera', 'Wes', 'Xan', 'Yara', 'Zed', 'Arlo', 'Bea', 'Cass', 'Dot', 'Ezra', 'Flo', 'Gus', 'Hattie',
  'Iggy', 'June', 'Kai', 'Lottie', 'Moss', 'Nico', 'Opal', 'Percy', 'Rhea', 'Stan', 'Tilly', 'Vic', 'Wren', 'Yuki'];
const LAST = ['Puttwell', 'Featherstone', 'Cloudbury', 'Hollis', 'Breeze', 'Marrow', 'Quill', 'Ashdown', 'Tumble', 'Larkspur', 'Vane',
  'Okafor', 'Delacroix', 'Nakamura', 'Brightwater', 'Kestrel', 'Duff', 'Penhallow', 'Sparrow', 'Haverford', 'Gale', 'Moreno', 'Lindqvist',
  'Chalk', 'Bramble', 'Fenwick', 'Rookwood', 'Silva', 'Tanaka', 'Underhill', 'Wicket', 'Ambrose', 'Castellan', 'Dunmore'];
const NICK = {
  carl: ['Steady', 'The Accountant', 'Safe Hands', 'Layup'], bertha: ['Boom', 'The Cannon', 'Full Send', 'Thunder'],
  banks: ['Ricochet', 'Two-Rail', 'The Angle', 'Cushion'], lou: ['Lucky', 'Coinflip', 'Wildcard', 'Fluke'],
  pro: ['Ice', 'The Machine', 'Metronome', 'Scratch'], professor: ['Doc', 'Slide Rule', 'The Thesis', 'Decimal'],
  zoe: ['Zip', 'Quickstep', 'Blink', 'Rush'], mags: ['Mags', 'Old Gold', 'The Legend'],
};
const HOMES = ['Sky Isles Muni', 'Cloudbury Club', 'Windmill Heights', 'Brightwater Links', 'The Floating Nine', 'Gull Rock', 'Lantern Bay',
  'Kestrel Peak', 'Old Harbour Putt', 'Starfall Greens', 'Copperkettle', 'Highwind Commons'];
const BIO = {
  carl: ['Has never once gone out of bounds in a tournament, or so he claims.', 'Measures twice, putts once, lays up anyway.', 'Keeps a notebook of every wall on every hole.'],
  bertha: ['Once cleared the void on hole 7 and kept going.', 'Hits it hard enough to dent the trim.', 'Thinks "lay up" is a nap.'],
  banks: ['Sees angles the rest of us can\'t.', 'Learned to putt on a pool table.', 'Has a favourite wall on every course.'],
  lou: ['Wears the same lucky socks every round, unwashed.', 'Holed out from the tee three times. Four-putted twice as often.', 'Flips a coin when unsure, which is always.'],
  pro: ['Tour card since age fifteen.', 'Never smiles on the course; smiles a lot off it.', 'Reads the green from the clubhouse.'],
  professor: ['Wrote a paper on rolling resistance. Nobody read it.', 'Brings a protractor. Uses it.', 'Lags every putt to within a ball\'s width. Usually short.'],
  zoe: ['Finishes a round before you finish your snack.', 'Waits for nobody, especially windmills.', 'Speed-putting club champion.'],
  mags: ['Three-time Legends champion. Runs the snack hut now.', 'Taught half the tour. Still beats them.'],
};

// A generated golfer with a name, nickname, home course and bio.
export function makeGolfer({ personality, skill, seed = 1, name } = {}) {
  const rng = makeRng(seed);
  const pid = personality || rng.pick(PERSONALITY_IDS.filter(p => p !== 'mags'));
  const first = rng.pick(FIRST), last = rng.pick(LAST);
  const nick = rng.pick(NICK[pid]);
  const home = rng.pick(HOMES);
  const sk = skill ?? rng();
  return new AIGolfer({
    personality: pid, skill: sk, seed: hashStr(`${seed}:${first}${last}`),
    name: name || `${first} "${nick}" ${last}`, nick, home,
    bio: `${PERSONALITIES[pid].name} type. ${rng.pick(BIO[pid])} Home course: ${home}. ${rankOf(sk)}, rated ${ratingOf(sk)}.`,
  });
}

// Tournament field: `size` golfers around a skill level, mixed personalities, unique names.
export function makeField({ size = 12, skill = 0.5, spread = 0.15, seed = 1, personalities } = {}) {
  const rng = makeRng(seed);
  const out = [], names = new Set();
  let tries = 0;
  while (out.length < size && tries++ < size * 20) {
    const pid = personalities ? personalities[out.length % personalities.length] : rng.pick(PERSONALITY_IDS.filter(p => p !== 'mags'));
    const sk = clamp01(skill + (rng() * 2 - 1) * spread);
    const g = makeGolfer({ personality: pid, skill: sk, seed: rng.int(1, 2 ** 30) });
    if (names.has(g.name)) continue;
    names.add(g.name); out.push(g);
  }
  return out.sort((a, b) => b.skill - a.skill);
}

// Story mode ("Nobody to Pro", PLAN 2.5): one named rival per tour, plus the field's skill band.
export const STORY = [
  { tour: 'muni', name: 'Muni', field: [0.08, 0.3], rival: { personality: 'carl', skill: 0.32, name: 'Carl Pettigrew', nick: 'Careful Carl', bio: 'Muni club secretary. Has laid up on every hole since 1998. Thinks you are reckless.' } },
  { tour: 'club', name: 'Club', field: [0.25, 0.48], rival: { personality: 'lou', skill: 0.48, name: 'Lou Marlow', nick: 'Lucky Lou', bio: 'Charming, chaotic, and somehow always on the leaderboard. Owes Mags for six sandwiches.' } },
  { tour: 'regional', name: 'Regional Cup', field: [0.42, 0.62], rival: { personality: 'banks', skill: 0.62, name: 'Remy Banks', nick: 'Banks', bio: 'A former billiards prodigy. Plays every wall like a cushion and grins when you can\'t follow.' } },
  { tour: 'national', name: 'National Tour', field: [0.55, 0.76], rival: { personality: 'bertha', skill: 0.76, name: 'Bertha Okafor', nick: 'Big Bertha', bio: 'Longest hitter on tour. Holds the record for holes-in-one and for balls lost to the void.' } },
  { tour: 'world', name: 'World Tour', field: [0.7, 0.9], rival: { personality: 'pro', skill: 0.9, name: 'Sterling Vance', nick: 'The Pro', bio: 'World number one. Ice in the veins. Has never looked at a scoreboard.' } },
  { tour: 'legends', name: 'Legends', field: [0.85, 1.0], rival: { personality: 'mags', skill: 1.0, name: 'Margaret "Mags" Moreno', nick: 'Old Mags', bio: 'Your coach. The final exam. She has been waiting for this match for years.' } },
];
export function storyRival(tour) {
  const ch = STORY.find(c => c.tour === tour) || STORY[0];
  return new AIGolfer({ ...ch.rival, seed: hashStr('rival:' + ch.tour), id: 'rival-' + ch.tour });
}
export function storyField(tour, { size = 11, seed } = {}) {
  const ch = STORY.find(c => c.tour === tour) || STORY[0];
  const [lo, hi] = ch.field;
  return makeField({ size, skill: (lo + hi) / 2, spread: (hi - lo) / 2, seed: seed ?? hashStr('field:' + ch.tour) });
}

// Online room fill (PLAN 2.9): personality + rank chosen by the host ("any" = random).
export function roomFill({ count = 3, personality = 'any', rank = 'Club Player', seed = 1 } = {}) {
  const i = Math.max(0, RANKS.indexOf(rank));
  const lo = RANK_AT[i], hi = i + 1 < RANK_AT.length ? RANK_AT[i + 1] : 1;
  const rng = makeRng(seed);
  return Array.from({ length: count }, (_, k) => makeGolfer({
    personality: personality === 'any' ? undefined : personality,
    skill: lo + (hi - lo) * rng(), seed: rng.int(1, 2 ** 30) + k,
  }));
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }
