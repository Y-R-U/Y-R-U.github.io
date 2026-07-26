// One-off races and the special events. Quick races feed the world ladder;
// specials are the weird formats the broadcaster keeps commissioning.

import { TRACK_DEFS, TRACK_BY_ID } from './trackgen.js';
import { profile, rankTier } from './save.js';
import { LADDER } from './config.js';
import { mulberry32, pick, clamp, shuffled } from './utils.js';

// How strong the field is, based on where you sit on the ladder.
function ladderTier() {
  const r = profile.rank;
  if (r <= 100) return 6;
  if (r <= 1000) return 5.2;
  if (r <= 10000) return 4.2;
  if (r <= 60000) return 3.2;
  if (r <= 150000) return 2.2;
  return 1.2;
}

export function quickEvent(opts = {}) {
  const tier = ladderTier();
  const track = opts.track || pick(TRACK_DEFS).id;
  const def = TRACK_BY_ID[track] || TRACK_DEFS[0];
  const cars = opts.cars || 8;
  return {
    mode: 'quick',
    id: 'quick-' + track,
    title: def.name,
    subtitle: 'WORLD SERIES · RANKED',
    track,
    laps: opts.laps || def.laps || 3,
    cars,
    aiSkill: clamp(0.6 + tier * 0.058, 0.5, 0.98),
    aiAggro: clamp(0.28 + tier * 0.055, 0.2, 0.9),
    rubber: 0.35,
    tier,
    purse: Math.round(3000 + tier * 2200),
    purseTier: 0.7 + tier * 0.2,
    playerSlot: opts.playerSlot != null ? opts.playerSlot : Math.floor(cars / 2),
    knockout: opts.mode === 'knockout',
    objective: { kind: 'podium', label: 'FINISH ON THE PODIUM' },
    ranked: true,
  };
}

// ---------------------------------------------------------------------------
export const SPECIAL_EVENTS = [
  {
    id: 'derby', name: 'DEMOLITION DERBY', icon: '💥',
    blurb: 'Ten cars, one narrow circuit, and a purse that only pays for damage.',
    track: 'grinder', laps: 3, cars: 10, aiAggro: 0.92, aiSkill: 0.74,
    objective: { kind: 'wreck', n: 4, pos: 8, label: 'WRECK 4 RIVALS' },
    purse: 9000, chest: 'contra', unlockRank: 200000,
  },
  {
    id: 'gauntlet', name: 'THE GAUNTLET', icon: '☠️',
    blurb: 'Knockout format. Last car on the road every twenty seconds goes home.',
    track: 'circus', laps: 4, cars: 10, knockout: true, aiSkill: 0.88, aiAggro: 0.7,
    objective: { kind: 'survive', label: 'BE THE LAST ONE RUNNING' },
    purse: 16000, chest: 'sponsor', unlockRank: 40000,
  },
  {
    id: 'blackout', name: 'BLACKOUT RUN', icon: '🕶️',
    blurb: 'A transmitter fault took every camera off air. Do whatever you like.',
    track: 'loopyard', laps: 3, cars: 8, noCams: true, aiSkill: 0.84, aiAggro: 0.6,
    objective: { kind: 'win', label: 'WIN WITH THE CAMERAS DOWN' },
    purse: 11000, chest: 'contra', unlockRank: 120000,
  },
  {
    id: 'panopticon', name: 'THE PANOPTICON', icon: '👁️',
    blurb: 'Every camera on the circuit is live for the whole race. Behave.',
    track: 'neonmile', laps: 3, cars: 8, allCams: true, aiSkill: 0.86, aiAggro: 0.55,
    objective: { kind: 'stealth', max: 45, pos: 2, label: 'FINISH TOP 2, SUSPICION UNDER 45' },
    purse: 14000, chest: 'sponsor', unlockRank: 60000,
  },
  {
    id: 'openroad', name: 'NO BARRIERS', icon: '🏜️',
    blurb: 'They took the guardrails away. All of them. Nobody will say who authorised it.',
    track: 'saltflats', laps: 2, cars: 8, aiSkill: 0.82, aiAggro: 0.75,
    objective: { kind: 'podium', label: 'PODIUM WITH NOTHING TO BOUNCE OFF' },
    purse: 10000, chest: 'parts', unlockRank: 180000,
  },
  {
    id: 'ringoffire', name: 'RING OF FIRE', icon: '🎡',
    blurb: 'Four laps of Twin Rings. Eight loops. Lift once and you are a statistic.',
    track: 'twinrings', laps: 4, cars: 8, aiSkill: 0.9, aiAggro: 0.5,
    objective: { kind: 'top', n: 3, label: 'FINISH TOP 3' },
    purse: 15000, chest: 'contra', unlockRank: 30000,
  },
  {
    id: 'hurricane', name: 'HURRICANE', icon: '⛈️',
    blurb: 'The harbour circuit under standing water, because the broadcast was already sold.',
    track: 'stormharbour', laps: 3, cars: 9, aiSkill: 0.8, aiAggro: 0.8,
    objective: { kind: 'finish', label: 'JUST FINISH IT' },
    purse: 8500, chest: 'parts', unlockRank: 220000,
  },
  {
    id: 'showpony', name: 'SHOW PONY', icon: '📣',
    blurb: 'The producers do not care where you finish. They care what the crowd does.',
    track: 'crownpoint', laps: 3, cars: 8, aiSkill: 0.82, aiAggro: 0.45,
    objective: { kind: 'hype', n: 80, pos: 6, label: 'REACH 80 CROWD HYPE' },
    purse: 12000, chest: 'sponsor', unlockRank: 90000,
  },
  {
    id: 'cleanhands', name: 'CLEAN HANDS', icon: '🧤',
    blurb: 'An exhibition race for the sponsors. One investigation and the cheque is void.',
    track: 'cathedral', laps: 3, cars: 8, allCams: true, aiSkill: 0.88, aiAggro: 0.35,
    objective: { kind: 'nofines', pos: 2, label: 'FINISH TOP 2 WITH NO FINE' },
    purse: 13000, chest: 'parts', unlockRank: 50000,
  },
  {
    id: 'championsinvite', name: "CHAMPION'S INVITE", icon: '👑',
    blurb: 'Krieg picks the circuit, the field and the format. You get to say yes.',
    track: 'circus', laps: 4, cars: 8, aiSkill: 0.97, aiAggro: 0.85, tier: 6,
    objective: { kind: 'win', label: 'BEAT THE CHAMPION' },
    purse: 30000, chest: 'sponsor', unlockRank: 5000,
  },
];

export function eventById(id) {
  const e = SPECIAL_EVENTS.find((x) => x.id === id);
  if (!e) return null;
  const def = TRACK_BY_ID[e.track];
  return {
    mode: 'event',
    id: e.id,
    title: e.name,
    subtitle: def ? def.name : '',
    icon: e.icon,
    blurb: e.blurb,
    track: e.track,
    laps: e.laps,
    cars: e.cars,
    aiSkill: e.aiSkill,
    aiAggro: e.aiAggro,
    rubber: 0.25,
    tier: e.tier != null ? e.tier : clamp(ladderTier() + 0.6, 1, 6),
    purse: e.purse,
    purseTier: 1 + (e.tier || ladderTier()) * 0.2,
    playerSlot: e.cars - 1,
    objective: e.objective,
    knockout: !!e.knockout,
    noCams: !!e.noCams,
    allCams: !!e.allCams,
    chestOnClear: e.chest,
  };
}

export function eventUnlocked(e) {
  return profile.rank <= (e.unlockRank || LADDER.startRank + 1);
}

// ---------------------------------------------------------------------------
// A different race every day, seeded off the date so everybody gets the same
// one and it cannot be rerolled by refreshing.
export function dailyEvent(dateStr) {
  const key = dateStr || new Date().toISOString().slice(0, 10);
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rng = mulberry32(h >>> 0);
  const track = TRACK_DEFS[Math.floor(rng() * TRACK_DEFS.length)];
  const twists = [
    { k: 'allCams', name: 'FULL COVERAGE', icon: '👁️' },
    { k: 'noCams', name: 'TRANSMITTER FAULT', icon: '🕶️' },
    { k: 'knockout', name: 'ELIMINATION', icon: '☠️' },
    { k: null, name: 'STRAIGHT FIGHT', icon: '🏁' },
  ];
  const twist = twists[Math.floor(rng() * twists.length)];
  const tier = clamp(ladderTier() + 0.5, 1, 6);
  return {
    mode: 'event',
    id: 'daily-' + key,
    dailyKey: key,
    title: 'DAILY: ' + twist.name,
    subtitle: track.name,
    icon: twist.icon,
    blurb: `${track.flavour} Today only.`,
    track: track.id,
    laps: track.laps || 3,
    cars: 8,
    aiSkill: clamp(0.66 + tier * 0.05, 0.5, 0.97),
    aiAggro: clamp(0.35 + tier * 0.06, 0.2, 0.95),
    rubber: 0.3,
    tier,
    purse: Math.round(6000 + tier * 2000),
    purseTier: 1 + tier * 0.18,
    playerSlot: 5,
    objective: { kind: 'podium', label: 'FINISH ON THE PODIUM' },
    knockout: twist.k === 'knockout',
    noCams: twist.k === 'noCams',
    allCams: twist.k === 'allCams',
    chestOnClear: 'contra',
    daily: true,
  };
}
