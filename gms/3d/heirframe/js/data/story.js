// STORY §4/§7. archetype = step template reused from the contract generator (grade 'story', no random twist).
// boss = BOSSES id placed at the step of type `bossAt`. unlocks = district ids. grants = special rewards.

export const ACTS = [
  { act: 1, title: 'A BRIGHTER FUTURE', levels: [1, 8] },
  { act: 2, title: 'HARMONY THROUGH UNITY', levels: [8, 18] },
  { act: 3, title: 'LITTLE STAR', levels: [18, 26] },
  { act: 4, title: 'THE SKY IS A SCREEN', levels: [26, 34] },
  { act: 5, title: 'HULLSIDE', levels: [34, 42] },
  { act: 6, title: 'HEIRFRAME', levels: [42, 50] },
];

export const STORY_MISSIONS = [
  { id: 'a1_m1', act: 1, title: 'First Shift', gate: 1, archetype: 'courier', district: 'aurum_plaza', clues: ['C01'], fixed: true,
    payout: { credits: 150, xp: 120 }, cacheItem: 'surplus_baton', scriptedAmbush: { at: 0.4, units: [['scrap_rat', 'grunt', 3]], from: 'alley' }, sites: ['locker', 'locker'],
    blurb: 'Mara has a parcel that needs legs. Locker seven to drop-locker twelve.' },
  { id: 'a1_m2', act: 1, title: 'Something Borrowed', gate: 2, archetype: 'retrieve', district: 'aurum_plaza', clues: ['C02'], faction: 'syndicate',
    blurb: 'A pawn-droid called Tinsel says it can read the key. For 200 cr.' },
  { id: 'a1_m3', act: 1, title: 'Brightline', gate: 3, archetype: 'surveil', district: 'brightline', clues: ['C03'], unlocks: ['brightline'], faction: 'syndicate',
    blurb: 'Photograph a Syndicate courier on the boulevard.' },
  { id: 'a1_m4', act: 1, title: 'The Kettle Boils', gate: 5, archetype: 'defend', district: 'aurum_plaza', clues: ['C04'], boss: 'big_kettle', bossAt: 'defend', faction: 'syndicate',
    grants: { firstFrameDiscount: true }, blurb: "Big Kettle's crew is coming for the key. Hold Mara's kiosk." },
  { id: 'a1_m5', act: 1, title: 'Unperson', gate: 7, archetype: 'hack', district: 'aurum_plaza', clues: ['C05'], reveal: 'R1', faction: 'concord', setHeat: 3,
    blurb: 'Break into a civic-records node and match your genome.' },
  { id: 'a2_m1', act: 2, title: 'The Garden of Blank Names', gate: 8, archetype: 'escort', district: 'terraces', clues: ['C06'], unlocks: ['terraces'], faction: 'concord',
    blurb: 'Find Dr. Fenn at the memorial garden and get him away from the sweepers.' },
  { id: 'a2_m2', act: 2, title: 'Sundering Day', gate: 10, archetype: 'infiltrate', district: 'arcology', clues: ['C07'], unlocks: ['arcology'], faction: 'concord',
    blurb: 'Recover a memory shard from the Nexus archive floor.' },
  { id: 'a2_m3', act: 2, title: 'Gilded', gate: 12, archetype: 'tail', district: 'brightline', clues: ['C08'], faction: 'concord',
    blurb: 'Tail the gold frame Fenn calls "a Voice".' },
  { id: 'a2_m4', act: 2, title: 'Halloran', gate: 15, archetype: 'heist', district: 'arcology', clues: ['C09'], boss: 'halloran', bossAt: 'exfil', faction: 'concord',
    blurb: "Steal Fenn's Ascension research core from a Concord evidence vault." },
  { id: 'a2_m5', act: 2, title: "Dead Man's Frame", gate: 17, archetype: 'defend', district: 'terraces', clues: ['C10'], reveal: 'R2', faction: 'concord',
    blurb: 'Defend Fenn while he decrypts the core.' },
  { id: 'a3_m1', act: 3, title: 'Freehaul', gate: 18, archetype: 'transport', district: 'portside', clues: ['C11'], unlocks: ['portside'], faction: 'syndicate',
    blurb: "Jun's test: a cargo run past Syndicate cranes." },
  { id: 'a3_m2', act: 3, title: 'Ward Records', gate: 20, archetype: 'hack', district: 'arcology', clues: ['C12'], faction: 'concord',
    blurb: 'Crack the Wards of Harmony registry.' },
  { id: 'a3_m3', act: 3, title: 'Quill', gate: 22, archetype: 'confront', district: 'aurum_plaza', clues: [], reveal: 'R3', choice: 'maraTone',
    blurb: 'Confront Mara at her kiosk after hours.' },
  { id: 'a3_m4', act: 3, title: 'Signal to Noise', gate: 24, archetype: 'sabotage', district: 'arcology', clues: [], faction: 'concord',
    blurb: 'Sabotage the Choir relay pylons on the Chorus Tower.' },
  { id: 'a3_m5', act: 3, title: 'Harmony', gate: 26, archetype: 'infiltrate', district: 'arcology', clues: ['C13'], reveal: 'R4', boss: 'choir_warden', bossAt: 'hack', faction: 'choir',
    blurb: "Reach Harmony's broadcast core." },
  { id: 'a4_m1', act: 4, title: 'Pod 4471', gate: 26, archetype: 'walk', district: 'stacks', clues: [], unlocks: ['stacks'], grants: { home: 'pod' },
    blurb: 'Go home. Ride down to your own pod.' },
  { id: 'a4_m2', act: 4, title: 'Culling Hour', gate: 28, archetype: 'rescue', district: 'stacks', clues: [], boss: 'rustmother', bossAt: 'defend', faction: 'scrap',
    blurb: 'Stack 9 is losing power. Get the riders out.' },
  { id: 'a4_m3', act: 4, title: 'Stuck Clock', gate: 30, archetype: 'surveil', district: 'brightline', clues: ['C14'], shots: 4, faction: 'concord',
    blurb: 'Photograph the Landfall countdown across the city.' },
  { id: 'a4_m4', act: 4, title: "Waterfall's End", gate: 32, archetype: 'race', district: 'spine', clues: ['C15'], unlocks: ['spine'], faction: 'scrap',
    blurb: 'Follow the waterfall runoff down into the pipes.' },
  { id: 'a4_m5', act: 4, title: 'Breach', gate: 34, archetype: 'walk', district: 'spine', clues: [], reveal: 'R5', unlocks: ['hullside'], boss: 'spine_keeper_boss', bossAt: 'goto', faction: 'scrap',
    blurb: 'Climb the Firmament lattice behind the sky.' },
  { id: 'a5_m1', act: 5, title: 'Vacuum', gate: 34, archetype: 'escort', district: 'hullside', clues: [], faction: 'scrap',
    blurb: "Escort Jun's EVA team across the hull." },
  { id: 'a5_m2', act: 5, title: 'Meridian', gate: 36, archetype: 'retrieve', district: 'meridian', clues: ['C16'], unlocks: ['meridian'], grants: { heirCore: true }, faction: 'scrap',
    blurb: 'Explore the wreck of the Sundering.' },
  { id: 'a5_m3', act: 5, title: 'The Choir', gate: 38, archetype: 'defend', district: 'meridian', clues: [], faction: 'choir',
    blurb: 'Hold the Meridian comms mast.' },
  { id: 'a5_m4', act: 5, title: "Angel's Hum", gate: 40, archetype: 'bounty', district: 'hullside', clues: ['C17'], targets: 3, faction: 'choir',
    blurb: "Hunt Seraph's three Choir lieutenants." },
  { id: 'a5_m5', act: 5, title: 'Seraph', gate: 42, archetype: 'walk', district: 'hullside', clues: [], reveal: 'R6', boss: 'seraph', bossAt: 'goto', faction: 'choir',
    blurb: 'She is waiting on the hull.' },
  { id: 'a6_m1', act: 6, title: 'Renewal', gate: 43, archetype: 'infiltrate', district: 'spine', clues: [], setRenewal: 0, faction: 'concord',
    blurb: 'Renewal Day is here.' },
  { id: 'a6_m2', act: 6, title: 'Seven Voices', gate: 45, archetype: 'assassinate', district: 'helm', clues: [], unlocks: ['helm'], targets: 2, faction: 'voices',
    blurb: 'Take down the Voices guarding the Helm approaches.' },
  { id: 'a6_m3', act: 6, title: 'Landfall', gate: 47, archetype: 'hack', district: 'helm', clues: ['C18'], reveal: 'R7', faction: 'voices',
    blurb: "Reach the Helm's outer ring." },
  { id: 'a6_m4', act: 6, title: 'Walk as Yourself', gate: 49, archetype: 'walk', district: 'helm', clues: [], noCombat: true,
    blurb: 'The Helm requires a living body.' },
  { id: 'a6_m5', act: 6, title: 'The Heir', gate: 50, archetype: 'walk', district: 'helm', clues: [], boss: 'dray', bossAt: 'goto', choice: 'ending', unlocks: ['landfall'], flags: ['finale'], faction: 'voices',
    blurb: 'Archon Dray, the Sovereign Frame.' },
];

export const STORY_CHOICES = {
  maraTone: { options: [{ id: 'cold', label: 'You should have told me.' }, { id: 'warm', label: 'You were all I had.' }] },
  ending: { options: [{ id: 'open', label: 'OPEN THE SKY' }, { id: 'keep', label: 'KEEP THE SKY (for now)' }] },
  irisFate: { options: [{ id: 'fade', label: 'Let her fade, free.' }, { id: 'frame', label: 'Give her a frame.' }] },
};

// flags the contract generator reads (MISSIONS §5.4) set when missions complete
export const STORY_FLAGS = { a1_m5: ['R1'], a2_m5: ['R2'], a3_m1: ['a3_m1'], a3_m5: ['a3_done'], a4_m5: ['R5'], a6_m5: ['finale'] };

export const RENEWAL_START = 100;

// A1-M1 cache: always an upgrade over the rental's empty weapon slot
export const STORY_ITEMS = {
  surplus_baton: { slot: 'weapon', rarity: 'tuned', element: 'shock', name: 'Surplus Shock Baton', forceAffixes: ['dmgPct'] },
};
