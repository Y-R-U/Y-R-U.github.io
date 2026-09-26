// Contract generator tables (MISSIONS.md). The step builders live in js/sim/missions.js.

// MISSIONS §7 base payout (sim-tuned: see docs/notes/systems.md)
export const PAYOUT_BASE = { credits: 120, xp: 50 }; // sim: xp 70 -> 50

// grades: street pro elite black. pay/xp/combat multipliers, level offset, rep for client.
export const GRADES = {
  street: { id: 'street', name: 'Street', pay: 1, xp: 1, combat: 1, lvlOff: 0, unlock: 1, mods: [0, 1, 0.4], difficulty: 1 },
  pro: { id: 'pro', name: 'Pro', pay: 1.6, xp: 1.3, combat: 1.2, lvlOff: 1, unlock: 5, mods: [1, 1, 1], difficulty: 2 },
  elite: { id: 'elite', name: 'Elite', pay: 2.6, xp: 1.8, combat: 1.4, lvlOff: 2, unlock: 15, mods: [1, 2, 0.5], difficulty: 4, champion: true },
  black: { id: 'black', name: 'Black', pay: 4, xp: 2.2, combat: 1.6, lvlOff: 3, unlock: 1, mods: [2, 2, 1], difficulty: 5, heat: 1 },
  story: { id: 'story', name: 'Story', pay: 2, xp: 1.8, combat: 1.2, lvlOff: 0, unlock: 1, mods: [0, 0, 0], difficulty: 3 },
};
export const ELITE_PACK_BONUS = { pro: 0.05, black: 0.1 };

// DESIGN §11.1 threat
export const THREATS = {
  calm: { id: 'calm', name: 'Calm', unlock: 1, lvlOff: -1, hp: 0.8, dmg: 0.8, credits: 0.8, xp: 0.8, loot: 0 },
  tense: { id: 'tense', name: 'Tense', unlock: 1, lvlOff: 0, hp: 1, dmg: 1, credits: 1, xp: 1, loot: 0 },
  hostile: { id: 'hostile', name: 'Hostile', unlock: 10, lvlOff: 2, hp: 1.6, dmg: 1.3, credits: 1.5, xp: 1.5, loot: 0.1 },
  lethal: { id: 'lethal', name: 'Lethal', unlock: 25, lvlOff: 4, hp: 2.6, dmg: 1.7, credits: 2.3, xp: 2.2, loot: 0.25 },
  nightmare: { id: 'nightmare', name: 'Nightmare', unlock: 40, lvlOff: 6, hp: 4.5, dmg: 2.2, credits: 3.5, xp: 3.2, loot: 0.45 },
};
export function overclockThreat(n) {
  return { id: 'overclock', n, name: `Overclock ${n}`, unlock: 60, lvlOff: 6 + Math.floor(n / 3), fixedLevel: 66 + Math.floor(n / 3),
    hp: 4.5 * 1.12 ** n, dmg: 2.2 * 1.08 ** n, credits: 3.5 * 1.1 ** n, xp: 3.2 * 1.08 ** n, loot: 0.45 + 0.02 * n };
}

// MISSIONS §4. sites: tags usable for the main objective. ambush: chance of an ambush pack between legs.
export const ARCHETYPES = {
  courier: { id: 'courier', name: 'Courier', type: 'transport', unlock: 1, grades: ['street', 'pro', 'elite', 'black'], pay: 1.0, xp: 1.0, combat: 0.6, par: 180, weight: 14, sites: ['locker', 'plaza', 'market', 'rooftop'], twists: ['T1', 'T4', 'T7', 'T9', 'T10'] },
  pest: { id: 'pest', name: 'Pest Control', type: 'bounty', unlock: 1, grades: ['street', 'pro'], pay: 0.9, xp: 1.1, combat: 1.3, par: 150, weight: 10, sites: ['alley', 'warehouse', 'park'], faction: 'scrap', twists: ['T9', 'T10'] },
  retrieve: { id: 'retrieve', name: 'Retrieval', type: 'retrieve', unlock: 1, grades: ['street', 'pro', 'elite'], pay: 1.1, xp: 1.0, combat: 1.0, par: 200, weight: 10, sites: ['warehouse', 'alley', 'rooftop', 'vault'], twists: ['T1', 'T3', 'T9', 'T10'] },
  surveil: { id: 'surveil', name: 'Surveillance', type: 'spy', unlock: 2, grades: ['street', 'pro', 'elite', 'black'], pay: 1.1, xp: 1.0, combat: 0.5, par: 200, weight: 8, sites: ['plaza', 'market', 'fountain', 'lobby'], stealthy: true, twists: ['T2', 'T9', 'T10'] },
  bounty: { id: 'bounty', name: 'Bounty', type: 'bounty', unlock: 3, grades: ['street', 'pro', 'elite', 'black'], pay: 1.4, xp: 1.3, combat: 1.1, par: 300, weight: 9, sites: ['*'], target: true, twists: ['T2', 'T5', 'T8', 'T9', 'T10', 'T12'] },
  escort: { id: 'escort', name: 'Escort', type: 'escort', unlock: 3, grades: ['street', 'pro', 'elite'], pay: 1.3, xp: 1.2, combat: 1.0, par: 240, weight: 7, sites: ['plaza', 'park', 'boulevard', 'dock', 'market', 'fountain'], twists: ['T9', 'T10'] },
  sabotage: { id: 'sabotage', name: 'Sabotage', type: 'sabotage', unlock: 4, grades: ['pro', 'elite', 'black'], pay: 1.2, xp: 1.2, combat: 1.0, par: 240, weight: 7, sites: ['warehouse', 'dock', 'rooftop', 'interior', 'market'], twists: ['T3', 'T6', 'T9', 'T10', 'T11'] },
  hack: { id: 'hack', name: 'Uplink', type: 'hack', unlock: 4, grades: ['street', 'pro', 'elite', 'black'], pay: 1.1, xp: 1.1, combat: 0.8, par: 220, weight: 7, sites: ['lobby', 'interior', 'relay', 'rooftop'], twists: ['T9', 'T10'] },
  tail: { id: 'tail', name: 'Shadow', type: 'spy', unlock: 5, grades: ['pro', 'elite', 'black'], pay: 1.2, xp: 1.1, combat: 0.3, par: 180, weight: 5, sites: ['boulevard', 'market', 'park', 'plaza'], stealthy: true, twists: ['T9', 'T10'] },
  infiltrate: { id: 'infiltrate', name: 'Infiltration', type: 'hack', unlock: 5, grades: ['pro', 'elite', 'black'], pay: 1.3, xp: 1.2, combat: 0.7, par: 260, weight: 6, sites: ['interior', 'warehouse', 'vault'], stealthy: true, twists: ['T6', 'T9', 'T10'] },
  transport: { id: 'transport', name: 'Heavy Haul', type: 'transport', unlock: 6, grades: ['street', 'pro', 'elite'], pay: 1.2, xp: 1.1, combat: 0.9, par: 260, weight: 6, sites: ['warehouse', 'dock', 'market'], twists: ['T1', 'T7', 'T9', 'T10'] },
  defend: { id: 'defend', name: 'Hold the Line', type: 'defend', unlock: 6, grades: ['street', 'pro', 'elite'], pay: 1.2, xp: 1.3, combat: 1.5, par: 150, weight: 6, sites: ['market', 'fountain', 'dock', 'pods', 'plaza'], twists: ['T9', 'T10', 'T11'] },
  repo: { id: 'repo', name: 'Repossession', type: 'bounty', unlock: 6, grades: ['street', 'pro'], pay: 1.0, xp: 1.0, combat: 0.8, par: 200, weight: 4, sites: ['*'], target: true, twists: ['T9', 'T10'] },
  race: { id: 'race', name: 'Street Run', type: 'transport', unlock: 7, grades: ['street', 'pro'], pay: 0.9, xp: 0.9, combat: 0.2, par: 0, weight: 4, sites: ['rooftop', 'plaza', 'boulevard', 'market', 'fountain', 'park', 'locker'], twists: ['T3', 'T9', 'T10'] },
  assassinate: { id: 'assassinate', name: 'Wetwork', type: 'assassinate', unlock: 8, grades: ['pro', 'elite', 'black'], pay: 1.5, xp: 1.4, combat: 1.2, par: 300, weight: 6, sites: ['lobby', 'rooftop', 'dock', 'vault', 'plaza'], target: true, twists: ['T2', 'T5', 'T8', 'T9', 'T10', 'T12'] },
  rescue: { id: 'rescue', name: 'Extraction', type: 'escort', unlock: 9, grades: ['pro', 'elite', 'black'], pay: 1.4, xp: 1.3, combat: 1.2, par: 280, weight: 5, sites: ['warehouse', 'interior', 'pods', 'alley'], twists: ['T1', 'T8', 'T9', 'T10'] },
  heist: { id: 'heist', name: 'Heist', type: 'retrieve', unlock: 12, grades: ['pro', 'elite', 'black'], pay: 2.2, xp: 1.8, combat: 1.4, par: 480, weight: 3, sites: ['vault', 'interior', 'dock', 'warehouse'], checkpoints: true, heat: 2, twists: ['T3', 'T6', 'T9', 'T10'] },
  wetwork: { id: 'wetwork', name: 'Wetwork, with a Twist', type: 'assassinate', unlock: 14, grades: ['elite', 'black'], pay: 1.8, xp: 1.6, combat: 1.2, par: 320, weight: 3, sites: ['*'], target: true, twistAlways: true, twists: ['T5', 'T2', 'T6', 'T12'] },
};

export const FRAME_BIAS = { brawler: ['defend', 'pest', 'assassinate'], gunner: ['bounty', 'escort', 'sabotage'], ghost: ['infiltrate', 'tail', 'surveil', 'hack'], rental: [] };

// MISSIONS §6
export const MODIFIERS = {
  timed: { id: 'timed', label: 'Timed', desc: 'Time limit = par x 1.3', pay: 0.15, unlock: 1, kind: 'bad', except: ['defend', 'tail'] },
  noAlarm: { id: 'noAlarm', label: 'Ghost Job', desc: 'Fail if an alarm is raised', pay: 0.3, unlock: 2, kind: 'bad', only: ['courier', 'retrieve', 'surveil', 'infiltrate', 'heist', 'tail', 'hack'] },
  elitePack: { id: 'elitePack', label: 'Hired Muscle', desc: '+1 elite pack', pay: 0.25, unlock: 3, kind: 'bad', minCombat: 0.8 },
  fragile: { id: 'fragile', label: 'Fragile', desc: 'Cargo breaks after 3 hits taken while carrying', pay: 0.15, unlock: 3, kind: 'bad', only: ['courier', 'transport', 'retrieve'] },
  watched: { id: 'watched', label: 'Watched', desc: 'Extra Warden Eyes; being spotted = +1 Heat', pay: 0.15, unlock: 5, kind: 'bad' },
  jammed: { id: 'jammed', label: 'Jammer Field', desc: 'Skills cost +50% energy', pay: 0.2, unlock: 8, kind: 'bad', energyCostMult: 1.5 },
  reinforced: { id: 'reinforced', label: 'Reinforcements', desc: '+1 wave or ambush', pay: 0.2, unlock: 6, kind: 'bad', minCombat: 0.8 },
  collateral: { id: 'collateral', label: 'Glass House', desc: 'Prop damage penalty x2', pay: 0.1, unlock: 4, kind: 'neutral' },
  noSwap: { id: 'noSwap', label: 'Locked Link', desc: 'No frame swap', pay: 0.05, unlock: 10, kind: 'neutral' },
  broadcast: { id: 'broadcast', label: 'Live on Harmony', desc: 'Heat +1 on completion', pay: 0.25, unlock: 12, kind: 'bad', only: ['assassinate', 'sabotage', 'heist', 'bounty'] },
  night: { id: 'night', label: 'After Dark', desc: 'Detection range -35%', pay: 0.1, unlock: 999, kind: 'good', needs: 'daynight' },
  rain: { id: 'rain', label: 'Rain', desc: 'Detection -20%', pay: 0.1, unlock: 999, kind: 'good', needs: 'weather' },
  vip: { id: 'vip', label: 'Crowded', desc: 'More civilians; props everywhere', pay: 0.1, unlock: 3, kind: 'neutral' },
};
export const MODIFIER_CONFLICTS = [['noAlarm', 'defend'], ['noAlarm', 'broadcast'], ['noAlarm', 'reinforced'], ['timed', 'defend']];

export const BONUSES = { stealth: 0.25, flawless: 0.15, speed: 0.1, clean: 0.1 };

// MISSIONS §8 twists. at: step type the twist fires on (runner matches first step of that type), or 'start'/'end'/'payout'/'mid'.
export const TWISTS = {
  T1: { id: 'T1', name: 'Double-Cross', at: 'deliver', sting: "The recipient's crew is waiting.", payMult: 1.5, p1: true },
  T2: { id: 'T2', name: 'Wrong Target', at: ['kill', 'photo'], sting: 'That was a decoy. The real target is running.' },
  T3: { id: 'T3', name: 'Rival Crew', at: 'start', sting: 'A rival crew is going for the same job.' },
  T4: { id: 'T4', name: "It's Ticking", at: 'pickup', delay: 30, sting: "The parcel is ticking.", payMult: 1.4, timer: 30, p1: true },
  T5: { id: 'T5', name: 'The Innocent', at: 'kill', sting: 'The target is a pod-rider being framed.' },
  T6: { id: 'T6', name: 'Fall Guy', at: 'end', sting: 'The client tipped off the Wardens.', heat: 2, payMult: 2, clientRep: -5 },
  T7: { id: 'T7', name: 'Stowaway', at: 'pickup', sting: 'The crate is breathing.', payMult: 1.3 },
  T8: { id: 'T8', name: 'Upgraded', at: 'combat', sting: "The target's bodyguard is a champion." },
  T9: { id: 'T9', name: 'Stiffed', at: 'payout', sting: "The client won't pay.", collectPay: 1.6 },
  T10: { id: 'T10', name: 'Harmony Watching', at: 'goto', sting: 'A billboard turns to face you.', p1: true, clue: true, fallbackCreditMult: 3 },
  T11: { id: 'T11', name: 'Double Booking', at: 'mid', sting: 'A second client is calling.' },
  T12: { id: 'T12', name: 'Loose Tongue', at: 'lowHp', threshold: 0.3, sting: 'The target wants to make a deal.', bribePay: 0.8, clientRep: -5 },
};

// ---- names (MISSIONS §5) ------------------------------------------------------------------
export const FIRST_NAMES = ['Oriel', 'Cassia', 'Benedikt', 'Ysolde', 'Marlo', 'Priya', 'Tobiah', 'Vesna', 'Haruto', 'Ludmila', 'Ignatius', 'Soraya', 'Dace', 'Fennimore', 'Imani', 'Octavia', 'Rasmus', 'Juno', 'Hollis', 'Anouk', 'Emeric', 'Zadie', 'Corvin', 'Pell', 'Isadora', 'Kasimir', 'Nia', 'Thaddeus', 'Wilhelmina', 'Bram', 'Selah', 'Ottavio', 'Linnea', 'Mercer', 'Saffi', 'Aurelio', 'Delphine', 'Kip', 'Maren'];
export const SURNAMES = ['Pask', 'Everly', 'Montclair', 'Oduya', 'Strand', 'Kovač', 'Halvorsen', 'Ashdown', 'Merriweather', 'Tanaka-Bell', 'Lucento', 'Brightwater', 'Farrow', 'Iyer', 'Castellane', 'Quint', 'Oyelaran', 'Sorrel', 'Vantongeren', 'Whitlock', 'Delacroix', 'Mbeki', 'Rennick', 'Solberg', 'Varga', 'Lindqvist', 'Achebe', 'Fontaine', 'Greaves', 'Harrow'];
export const RESERVED_NAMES = ['Quill', 'Vael', 'Dray', 'Hale', 'Okafor'];
export const ORGS = [
  ['Pask & Daughters Fine Foods', 'nexus'], ['Lumen Couriers', 'nexus'], ['Brightwater Estates', 'concord'], ['Aurelian Insurance', 'nexus'],
  ['HireFrame Collections', 'nexus'], ['Castellane Gallery', 'concord'], ['Freehaul Local 9', 'freehaul'], ['The Silver Table', 'syndicate'],
  ['Kovač Salvage', 'syndicate'], ['Quint Securities', 'concord'], ['Unity Youth Choir', 'concord'], ['Sorrel Botanicals', 'nexus'],
  ['Pod-Row Mutual Aid', 'unlinked'], ['Lindqvist Robotics', 'nexus'], ['The Gilt Lounge', 'syndicate'], ['Harrow & Achebe Legal', 'concord'],
  ['Mbeki Hydroponics', 'freehaul'], ['No-Name Friend', 'unlinked'], ['"A Concerned Citizen"', 'concord'], ['Merriweather Moving Co.', 'freehaul'],
];
// story-flag gated additions (MISSIONS §5.4)
export const ORGS_BY_FLAG = {
  R2: [['Office of the Chair', 'concord']],
  a3_done: [['No-Name Friend', 'unlinked'], ['Pod-Row Mutual Aid', 'unlinked']],
  finale: [['Landfall Survey Corps', 'freehaul'], ['First Settlers\' Co-op', 'unlinked']],
};
export const NICKNAMES = ['Tinsel', 'Buckle', 'Gristle', 'Lamplight', 'Sprocket', 'Velvet', 'Harpy', 'Doorstop', 'Jubilee', 'Nines', 'Halo', 'Crowbar', 'Gossamer', 'Marrow', 'Pewter', 'Sundae', 'Brass Tacks', 'Mister Polish', 'Whisper', 'Tuesday', 'Kingfisher', 'Rattle', 'Solace', 'Glint', 'Two-Step'];
export const EPITHETS = ['the Smiling', 'Knuckles', 'of the Silver Table', 'Twice-Wrecked', 'the Accountant', 'Slick', 'the Choirboy', 'Gilt-Tooth', 'the Landlord', 'No-Face', 'Seven Pods', 'the Undertaker', 'Glass Jaw', 'the Auditor', 'Uncle', 'the Poet', 'Cold Coffee', 'Last Call'];
export const PARCELS = ['a crate of artisanal moon cheese', "a wedding ring that isn't paid for", '3 kg of vintage vinyl', 'a sealed Concord ballot box', "a cat (it's a robot cat, it's fine)", 'a data slate marked DO NOT READ', 'a replacement heart valve', "a frame's severed hand (still twitching)", 'a box of Renewal Day fireworks', 'an urn', 'a ukulele', '40 counterfeit Harmony plushies', 'a very angry bonsai', "someone's grandmother's recipe cards", 'a prototype optics lens', 'coolant (leaking)', 'a love letter, handwritten (antique)', "Kettle's lunch"];
export const CASE_ITEMS = ['a Nexus prototype core', "a Voice's signet", 'ledger shards', 'a stolen frame licence', 'a memory shard', 'an evidence locker drive'];
export const CASE_ITEMS_BY_FLAG = { a3_m1: ['a crate of Outer Farms seed'] };
export const SABOTAGE_OBJECTS = ['generator', 'relay', 'crane_motor', 'billboard_node', 'turret_array', 'pump'];
export const SABOTAGE_SITES = { generator: ['warehouse', 'interior', 'alley'], relay: ['rooftop', 'relay', 'interior'], crane_motor: ['dock', 'warehouse'], billboard_node: ['plaza', 'rooftop', 'market'], turret_array: ['rooftop', 'lobby', 'vault'], pump: ['warehouse', 'dock', 'pods'] };
export const SITE_NAMES = { plaza: 'Plaza', fountain: 'Fountain Terrace', park: 'Park', market: 'Market', locker: 'Parcel Lockers', alley: 'Service Alley', rooftop: 'Upper Terrace', warehouse: 'Service Yard', lobby: 'Lobby', interior: 'Office Floor', vault: 'Vault', dock: 'Quay', pad: 'Landing Pad', garden: 'Memorial Garden', pods: 'Pod Rows', catwalk: 'Catwalk', hull: 'Hull Plating', relay: 'Transit Relay', boulevard: 'Boulevard' };

export const TITLES = {
  courier: ['{Parcel}, Handle With Care', 'Special Delivery for {Surname}', 'No Questions, Just Legs', 'Before the Ice Melts'],
  pest: ["Something's Chewing the Cables", 'Rats in the {Site}', 'Nest Eviction'],
  retrieve: ['Lost & Found: {CaseItem}', 'Borrowed Without Asking', 'Get It Back'],
  surveil: ['Smile for the Camera', "Who's {Surname} Meeting?", 'Candid Shots'],
  bounty: ['{Nickname} {Epithet}', 'Wanted: {Name}', 'Dead or (Preferably) Alive'],
  escort: ['Walk {First} Home', 'A Very Important Stroll', 'Bodyguard for Hire'],
  sabotage: ['Lights Out at the {Site}', 'Accidents Happen', 'Industrial Relations'],
  hack: ['Plug In, Plug Out', 'Signal Boost', 'Borrowed Bandwidth'],
  tail: ['Where Does {First} Go?', 'Two Steps Behind', 'Footnotes'],
  infiltrate: ['Floor {Num}, After Hours', 'Leave No Fingerprints', 'A Bug in the System'],
  transport: ['Heavy Is the Crate', 'Lift With Your Legs', 'Freehaul Overflow'],
  defend: ['Hold the {Site}', 'Nobody Touches the {Object}', 'Last Stand at the Kiosk'],
  repo: ['HireFrame Wants Its Frame Back', 'Overdue Rental', 'Late Fees Apply'],
  race: ['Rooftop Sprint', 'Beat the Tram', 'Checkpoint Charlie'],
  assassinate: ['Retire {Nickname}', 'An Early Retirement', 'Quiet Exit'],
  rescue: ['Get {First} Out', 'Extraction at the {Site}', 'Ransom Declined'],
  heist: ['The {Surname} Job', 'Vault of the {Org}', 'Thirteen Minutes'],
  wetwork: ['Simple Job', 'Nothing Personal', 'Easy Money'],
};
export const TAGLINES = ['Quietly.', 'No questions.', "Don't be a hero.", 'Try not to break the fountain again.', "Harmony isn't watching. Probably.", 'Paid on delivery.', 'Tip included (maybe).', 'Mind the Wardens.', 'Discretion is the whole job.', 'Bring it back in one piece.', "It's not what it looks like.", 'Tell no one. Especially Mara.', 'Time is money; you are both.', 'Rain or shine.', 'Keep it clean.', 'Do not open the box.', 'The client insists.', "You didn't hear this from me.", "Smile, you're on a job.", 'For a brighter future!'];
// "{client} {verb} {object} {place}. {tagline}"
export const BLURBS = {
  courier: ['needs', '{parcel} taken', 'to the {siteB}'],
  pest: ['wants', 'the Scrap nest cleared', 'out of the {siteA}'],
  retrieve: ['wants', '{caseItem} back', 'from the {siteA}'],
  surveil: ['needs', 'clean photos of {target}', 'around the {siteA}'],
  bounty: ['is paying for', '{target}', 'somewhere in {district}'],
  escort: ['needs', '{escortee} walked safely', 'to the {siteB}'],
  sabotage: ['wants', 'the {object}s knocked out', 'at the {siteA}'],
  hack: ['needs', 'a few terminals borrowed', 'around the {siteA}'],
  tail: ['wants to know', 'where {target} goes', 'from the {siteA}'],
  infiltrate: ['needs', 'a bug planted', 'inside the {siteA}'],
  transport: ['needs', 'a heavy crate hauled', 'to the {siteB}'],
  defend: ['needs', 'the {object} protected', 'at the {siteA}'],
  repo: ['wants', 'an overdue rental frame recovered', 'from {target}'],
  race: ['bets', 'you cannot run the route', 'across {district}'],
  assassinate: ['wants', '{target} retired', 'near the {siteA}'],
  rescue: ['needs', '{escortee} extracted', 'from the {siteA}'],
  heist: ['has', 'a plan for the {siteA}', 'and needs a rider'],
  wetwork: ['has', 'a simple job', 'near the {siteA}'],
};
export const DEFEND_OBJECTS = ['kiosk', 'pylon', 'fountain pump', 'cargo stack', 'relay mast', 'shuttle clamp'];
