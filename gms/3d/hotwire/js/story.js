// The complete HOTWIRE storyline — data, not code. 14 nodes, two mission
// boards, a hidden exposure meter and three endings. Every node is a
// missions.js def plus offer text, trust/exposure effects and branch logic.
// Extend it in the level editor: hotspots of kind "story" can chain custom
// nodes with the same schema.

// ── key world coordinates (Palm Bay, from tools/gen_map.py) ──
const RICOS = [74, 250], DEALER = [90, 106], HQ = [162, 66], NEST = [298, 218];
const DINER = [210, 254], AIRFIELD = [122, 346], DOCKS = [338, 98], BEACH = [346, 282];
const MARKET = [190, 150], CASINO = [218, 134], PRECINCT_LOT = [156, 58];

export const SPEAKERS = {
  ash:      { name: 'Ash Vega', ava: 'A', color: '#ffb03e' },
  rico:     { name: 'Rico', ava: 'R', color: '#8ef0b2' },
  marlowe:  { name: 'Det. Marlowe', ava: 'M', color: '#9adfff' },
  vex:      { name: 'Vex', ava: 'V', color: '#ff8a9a' },
  knuckles: { name: 'Knuckles', ava: 'K', color: '#ff8a9a' },
  dot:      { name: 'Dot', ava: 'D', color: '#b6e88a' },
  dane:     { name: 'Capt. Dane', ava: 'C', color: '#9adfff' },
  radio:    { name: 'Police Radio', ava: '📻', color: '#9adfff' },
  sign:     { name: 'Palm Bay', ava: '🌴', color: '#ffd76a' },
};

const L = (who, text) => ({ who, text });

export const STORY = [
  // ═══ ACT 1 — HOMECOMING ═══
  {
    id: 'S01', title: 'Homecoming', giver: 'auto', act: 1,
    offer: { text: 'Three years away. One bus ticket back. Rico said he left the old Vega running by the yard — get it to the garage before it grows roots.' },
    brief: [
      L('sign', 'PALM BAY — pop. 41,208. Welcome home, nobody.'),
      L('ash', "Three years clean. One phone call from Rico and I'm right back on this street."),
      L('rico', "Cuz! The Vega's parked by the yard. She still runs! Bring her round the shop — we need to talk."),
    ],
    steps: [
      { type: 'goto', x: 60, z: 274, r: 5, label: "Find Rico's old Vega", onFoot: true },
      { type: 'msg', lines: [L('ash', 'Still smells like french fries and bad decisions.')] },
      { type: 'goto', x: RICOS[0], z: RICOS[1], r: 7, inCar: true, label: "Drive to Rico's Rides" },
      { type: 'msg', lines: [
        L('rico', 'There she is! Listen… I borrowed money. From the Serpents. Twenty-five grand.'),
        L('ash', 'Rico. You borrowed from VEX?'),
        L('rico', "They wanted the shop, Ash. It was the shop or the loan. You're the only driver I trust to dig me out."),
      ] },
    ],
    reward: 100, trust: {}, next: 'S02',
  },
  {
    id: 'S02', title: 'Grease Money', giver: 'rico', act: 1,
    offer: { text: 'Three parts crates need delivering across town before the customers walk. Clock is running.', meta: ['⏱ 3:00', '💵 $150'] },
    brief: [L('rico', "Three deliveries, three paying customers. Don't bend the crates, don't bend the car.")],
    time: 180,
    steps: [
      { type: 'goto', x: 90, z: 106, r: 6, inCar: true, label: 'Drop 1 — Vega Motors lot' },
      { type: 'goto', x: 210, z: 254, r: 6, inCar: true, label: 'Drop 2 — the Blue Palm Diner' },
      { type: 'goto', x: 162, z: 190, r: 6, inCar: true, label: 'Drop 3 — the hospital bay' },
      { type: 'msg', lines: [L('rico', "That's rent covered. The Serpents' bar is called the Nest — east side. Vex wants to meet the famous cousin.")] },
    ],
    reward: 150, trust: {}, next: 'S03',
  },
  {
    id: 'S03', title: 'The Nest', giver: 'gang', act: 1,
    offer: { tag: 'gang', text: "Vex has a job: a casino high-roller owes the Serpents a Viper GT. Repossess it. Quietly or loudly — it's your licence plate.", meta: ['🚗 Steal & deliver', '💵 $250', '🐍 trust +'] },
    brief: [
      L('vex', "So you're the driver. Rico talks you up like a prayer."),
      L('vex', "A gentleman at the casino owes us a very orange car. Bring it to the Nest and we'll shave a point off your cousin's debt."),
      L('knuckles', 'Scratch it and I keep the difference out of your hide.'),
    ],
    spawns: { cars: [{ id: 'viper', type: 'sport', x: CASINO[0], z: CASINO[1], rot: 3.14, locked: false }] },
    steps: [
      { type: 'getincar', carId: 'viper', label: 'Take the Viper GT at the casino' },
      { type: 'deliver', x: NEST[0], z: NEST[1], r: 7, carId: 'viper', minHpFrac: 0.4, label: 'Deliver it to the Nest' },
      { type: 'msg', lines: [L('vex', "Mmm. Barely a scuff. You'll do, Vega. You'll do.")] },
    ],
    reward: 250, trust: { gang: +12 }, next: 'S04',
  },
  {
    id: 'S04', title: 'Flashing Lights', giver: 'auto', act: 1,
    offer: { text: 'Blue lights in the mirror, and they are not for speeding.' },
    brief: [
      L('marlowe', 'Ash Vega. Detective Marlowe, Precinct 9. Nice car. Not yours.'),
      L('ash', 'Is this a shakedown, detective?'),
      L('marlowe', "It's a menu. I still hold the file on the '23 warehouse job — your name reads great in bold. OR: you keep your eyes open inside the Serpents, and that file stays lost."),
      L('ash', '…And if I play both sides?'),
      L('marlowe', "Then be smarter than every other idiot who tried. Precinct 9's board is open to you. Don't make me regret the paperwork."),
    ],
    steps: [
      { type: 'goto', x: HQ[0], z: HQ[1], r: 8, label: 'Report to Precinct 9' },
      { type: 'msg', lines: [L('marlowe', "Good. Both boards are live now — the Serpents' and mine. Every job you take tips a scale somewhere. Try to keep your head attached.")] },
    ],
    reward: 0, trust: { police: +8 }, next: 'S05',
  },

  // ═══ ACT 2 — DOUBLE LIFE ═══
  {
    id: 'S05', title: 'Smash & Dash', giver: 'gang', act: 2,
    offer: { tag: 'gang', text: 'A market crew stopped paying tribute. Vex wants their stalls flattened and their ATMs cracked. Then vanish before the heat sticks.', meta: ['💥 Wreck the market', '⚠ conflict: police', '💵 $300'] },
    conflict: { vs: 'police', penalty: 12, cond: 'stars2', explain: 'Finish it while running 2★+ and Precinct 9 will know exactly who drove away.' },
    brief: [
      L('vex', 'Market crew forgot whose town this is. Remind them. Loud.'),
      L('knuckles', 'Stalls, ATMs, the lot. Then lose the blue-and-whites before you come home.'),
    ],
    steps: [
      { type: 'goto', x: MARKET[0], z: MARKET[1], r: 12, label: 'Hit the market square' },
      { type: 'smash', x: MARKET[0], z: MARKET[1], names: ['stall_pizza', 'stall_soda', 'stall_coffee', 'stall_burger', 'atm'], count: 5, label: 'Wreck stalls & ATMs' },
      { type: 'escape', label: 'Lose the heat, then get clear' },
      { type: 'msg', lines: [L('vex', "The whole street heard that. Beautiful. The debt's shrinking, Vega.")] },
    ],
    reward: 300, trust: { gang: +14 }, next: 'S06',
  },
  {
    id: 'S06', title: 'Eyes On', giver: 'police', act: 2,
    offer: { tag: 'police', text: "Marlowe wants to know where the Serpents' van goes at night. Follow it. Not close enough to spook, not far enough to lose.", meta: ['🚗 Tail the van', '👮 trust +', '💵 $350'] },
    brief: [
      L('marlowe', "Serpents' van leaves the Nest every evening, comes back heavy. Stay in its mirrors, out of its head."),
    ],
    spawns: { cars: [{ id: 'svan', type: 'van', x: 306, z: 214, rot: -1.57, locked: true, ai: true }] },
    steps: [
      { type: 'goto', x: 286, z: 226, r: 9, label: 'Get eyes on the Nest', inCar: true },
      { type: 'tail', carId: 'svan', min: 13, max: 60, speed: 0.55, label: 'Tail the van', route: [[298, 190], [298, 122], [330, 106], [338, 70], [338, 40]] },
      { type: 'msg', lines: [
        L('ash', "They're loading crates off a boat at the docks. Long ones. Not paint thinner."),
        L('marlowe', 'Guns. I knew it. Good work — now roll out of there before someone checks your plates.'),
      ] },
    ],
    reward: 350, trust: { police: +14 }, next: 'S07',
  },
  {
    id: 'S07', title: 'Special Delivery', giver: 'gang', act: 2,
    offer: { tag: 'gang', text: 'Drive a van of "paint thinner" from the docks to the Nest. Fragile cargo. The police somehow know a shipment is moving tonight.', meta: ['📦 Fragile cargo', '⚠ conflict: police', '💵 $400'] },
    conflict: { vs: 'police', penalty: 10, cond: 'always', explain: "You watched them load these crates for Marlowe. Running them anyway WILL cost her trust if word gets out — and it adds exposure." },
    brief: [
      L('knuckles', "Van's at the docks. Cargo is delicate like my grandmother. Cops are sniffing tonight, so drive pretty."),
    ],
    spawns: { cars: [{ id: 'cargo', type: 'van', x: 334, z: 60, rot: 3.14, locked: false }] },
    steps: [
      { type: 'getincar', carId: 'cargo', label: 'Pick up the van at the docks' },
      { type: 'give', run: (c) => c.police.crime(160) },
      { type: 'deliver', x: NEST[0], z: NEST[1], r: 7, carId: 'cargo', minHpFrac: 0.55, label: 'Deliver — keep the van above half health' },
      { type: 'msg', lines: [L('vex', "Every crate intact. Rico's debt just lost a zero, driver.")] },
    ],
    reward: 400, trust: { gang: +15 }, exposure: 10, next: 'S08',
  },
  {
    id: 'S08', title: 'Plant the Bug', giver: 'police', act: 2,
    offer: { tag: 'police', text: "Tech unit built a tracker. It goes inside Knuckles' precious muscle car — which means the car visits the precinct garage. Zero heat, zero witnesses.", meta: ['🚗 Steal quietly', '🚫 max 1★', '💵 $400'] },
    maxStars: 1,
    brief: [
      L('marlowe', "Knuckles parks his pride and joy behind the Nest. Borrow it, bring it to our garage, we'll return it with a present inside."),
      L('marlowe', 'If you light up the sky doing it, the whole play is dead. QUIET.'),
    ],
    spawns: { cars: [{ id: 'muscle', type: 'beater', x: 310, z: 208, rot: 1.57, locked: false, hpMul: 1.2 }] },
    steps: [
      { type: 'getincar', carId: 'muscle', label: "Take Knuckles' car — quietly" },
      { type: 'deliver', x: PRECINCT_LOT[0], z: PRECINCT_LOT[1], r: 7, carId: 'muscle', label: 'Precinct garage — stay under 2★' },
      { type: 'msg', lines: [L('marlowe', "Tech's inside. Now put it back— actually, we'll handle that. Go before the shift change sees your face.")] },
    ],
    reward: 400, trust: { police: +15 }, exposure: 8, next: 'S09',
  },
  {
    id: 'S09', title: 'Yellow Fever', giver: 'diner', act: 2,
    offer: { tag: 'civ', text: "Dot's cab driver quit mid-shift. Four fares are cooling their heels around Palm Bay, and the tips are getting cold too.", meta: ['🚕 4 fares', '⏱ 4:00', '💵 $300'] },
    brief: [
      L('dot', "Sugar, my cabbie walked out and there's a taxi by the kerb doing nothing. Four pickups. Keep the change."),
    ],
    time: 240,
    spawns: { cars: [{ id: 'cab', type: 'taxi', x: 214, z: 262, rot: 0, locked: false }] },
    steps: [
      { type: 'getincar', carId: 'cab', label: 'Grab the cab outside the diner' },
      { type: 'goto', x: 218, z: 134, r: 5, inCar: true, label: 'Fare 1 — casino steps' },
      { type: 'goto', x: 74, z: 118, r: 5, inCar: true, label: 'Fare 2 — westside houses' },
      { type: 'goto', x: 286, z: 130, r: 5, inCar: true, label: 'Fare 3 — the hotel' },
      { type: 'goto', x: 122, z: 346, r: 6, inCar: true, label: 'Fare 4 — the airfield' },
      { type: 'msg', lines: [L('dot', 'Four for four! The Dust Cup crowd tips in crumpled twenties — enjoy.')] },
    ],
    reward: 300, trust: {}, next: 'S10',
  },
  {
    id: 'S10', title: 'Dinner With Snakes', giver: 'gang', act: 2, gate: { gang: 60 },
    offer: { tag: 'conflict', text: "Vex smells a rat in her Nest. Tonight everyone proves themselves: torch the two cruisers parked behind Precinct 9. If Marlowe trusts you enough, maybe there's a smarter way…", meta: ['🔥 Loyalty test', '⚠ conflict: police −25', '🧠 smart play possible'] },
    conflict: { vs: 'police', penalty: 25, cond: 'always', smart: { police: 60, explain: 'Police trust ≥60: Marlowe stages decoy cruisers — burn those and NOBODY loses faith in you.' } },
    brief: [
      L('vex', "Somebody's whispering to Precinct 9. So tonight, everybody's hands get dirty together."),
      L('vex', 'Two cruisers behind the precinct. I want them glowing. Bring me a photo of the flames, rat.'),
    ],
    smartBrief: [
      L('ash', '…Marlowe. Vex wants two cruisers burned tonight. Behind YOUR precinct.'),
      L('marlowe', "Then she'll get two cruisers. Two decommissioned wrecks are parked in the exact spot as of five minutes ago. Make it look angry, Vega."),
    ],
    spawns: { cars: [
      { id: 'cru1', type: 'police', x: 146, z: 58, rot: 3.14, locked: true },
      { id: 'cru2', type: 'police', x: 166, z: 58, rot: 3.14, locked: true },
    ] },
    steps: [
      { type: 'goto', x: 156, z: 62, r: 14, label: 'Get behind Precinct 9' },
      { type: 'destroy', targets: ['cru1', 'cru2'], label: 'Torch both cruisers' },
      { type: 'escape', label: 'Vanish before backup rolls in' },
      { type: 'msg', lines: [L('vex', "Now THAT is commitment. Whoever the rat is… it isn't you. Right, Vega?")] },
    ],
    reward: 500, trust: { gang: +16 }, exposure: 12, next: 'S11',
  },

  // ═══ ACT 3 — THE SQUEEZE ═══
  {
    id: 'S11', title: 'Wire', giver: 'police', act: 3,
    offer: { tag: 'police', text: "Everything points to one shipment, Friday, at the docks. Marlowe needs it on tape. Walk into the Nest wearing a wire and get Vex talking.", meta: ['🎙 On foot', '👮 trust +', '💵 $600'] },
    brief: [
      L('marlowe', "The wire goes under your collar. You walk in, you get her bragging, you walk out. You do NOT improvise."),
    ],
    steps: [
      { type: 'goto', x: NEST[0], z: NEST[1], r: 6, onFoot: true, label: 'Enter the Nest — on foot' },
      { type: 'msg', lines: [
        L('vex', "Friday, Pier 4. The whole cargo ship — enough hardware to arm every crew from here to the border."),
        L('vex', '…and our friend with the badge gets his cut, as always. A CAPTAIN, no less.'),
        L('ash', '(A captain. Marlowe answers to a captain… Dane.)'),
      ] },
      { type: 'goto', x: HQ[0], z: HQ[1], r: 8, label: 'Get the tape back to Marlowe' },
      { type: 'msg', lines: [
        L('marlowe', 'A captain. That word better not mean what I think it means.'),
        L('marlowe', "…Dane signs my overtime, Vega. If this tape is real, Friday isn't a bust anymore. It's a knife fight in the dark."),
      ] },
    ],
    reward: 600, trust: { police: +16 }, next: 'S12',
  },
  {
    id: 'S12', title: 'Burn Notice', giver: 'auto', act: 3,
    offer: { text: 'The Nest went quiet the moment you left. Then your phone started ringing.' },
    brief: [
      L('knuckles', 'Funny thing, Vega. Our scanner guy caught a wire signal last night. Coming from YOUR side of the bar.'),
      L('ash', 'Knuckles, listen—'),
      L('knuckles', 'RUN, rat.'),
    ],
    steps: [
      { type: 'give', run: (c) => { c.traffic.gangHostile = true; } },
      { type: 'goto', x: DINER[0], z: DINER[1], r: 8, label: 'Get clear — reach the diner district' },
      { type: 'survive', seconds: 45, label: 'Survive the Serpents' },
      { type: 'give', run: (c) => { c.traffic.gangHostile = false; } },
      { type: 'msg', lines: [
        L('dot', 'In the back, now. I never saw you, the coffee machine never saw you.'),
        L('ash', "Friday. Everything lands Friday. Time to pick a lane… or drive between them."),
      ] },
    ],
    reward: 700, trust: { gang: -10 }, next: 'S13',
  },

  // ═══ THE THREE LANES ═══
  {
    id: 'S13A', title: 'Harbor Storm', giver: 'police', act: 3, branch: 'A',
    offer: { tag: 'police', text: "Friday. Pier 4. Marlowe leads the raid; you drive the point car. Stop the gun boat, wreck the escort, and run down Vex's armored truck before it reaches the gate.", meta: ['🌊 THE RAID', '🏁 Finale', '💵 $1,500'] },
    map: 'docks',
    brief: [
      L('marlowe', "No wire this time. Lights, badges, the whole sky. You drive, I arrest, and if Captain Dane's boat so much as coughs — we take that too."),
    ],
    spawns: { cars: [
      { id: 'esc1', type: 'pickup', x: 130, z: 122, rot: 1.57, locked: true, ai: true, role: 'gang' },
      { id: 'esc2', type: 'van', x: 150, z: 138, rot: 1.57, locked: true, ai: true, role: 'gang' },
      { id: 'vex', type: 'armored', x: 98, z: 114, rot: 1.57, locked: true, ai: true, hpMul: 1.3 },
    ], guards: [
      { kind: 'gang', x: 210, z: 118, weapon: 'smg' }, { kind: 'gang', x: 214, z: 130, weapon: 'pistol' },
    ] },
    steps: [
      { type: 'goto', x: 218, z: 122, r: 10, label: 'Lead the convoy to Pier 4' },
      { type: 'msg', lines: [L('vex', "MARLOWE?! You brought the DRIVER?! Kill the lights — MOVE THE TRUCK!")] },
      { type: 'destroy', targets: ['esc1', 'esc2'], fleeing: true, label: 'Wreck the escort cars' },
      { type: 'destroy', targets: ['vex'], fleeing: true, label: "Stop Vex's armored truck!" },
      { type: 'msg', lines: [
        L('vex', 'You picked the BADGES? They will spend you like loose change, Vega.'),
        L('marlowe', "Vera Voss, you're under arrest. And Captain Dane — the harbormaster kept your boat's manifest. Pity for you he scans everything."),
      ] },
    ],
    reward: 1500, trust: { police: +20 }, ending: 'A', next: null,
  },
  {
    id: 'S13B', title: 'Evidence Room', giver: 'gang', act: 3, branch: 'B',
    offer: { tag: 'gang', text: "Vex offers absolution: the precinct's evidence van holds every file, every tape, every friend they ever flipped. Walk in the back lot, drive it out, outrun the lockdown to the docks.", meta: ['🚨 5★ lockdown', '🏁 Finale', '💵 $1,500'] },
    brief: [
      L('vex', "You want back in my good graces, driver? Everything they have on us fits in one van behind Precinct 9."),
      L('knuckles', "Guards on the lot. Go in on foot, quiet feet. Then drive like the town's on fire — because it will be."),
    ],
    spawns: {
      cars: [{ id: 'evan', type: 'van', x: 174, z: 54, rot: 3.14, locked: false, hpMul: 1.4 }],
      guards: [
        { kind: 'cop', x: 166, z: 60, weapon: 'pistol', engageR: 14 },
        { kind: 'cop', x: 180, z: 58, weapon: 'pistol', engageR: 14 },
        { kind: 'swat', x: 174, z: 48, weapon: 'smg', engageR: 16 },
      ],
    },
    steps: [
      { type: 'goto', x: 168, z: 74, r: 6, onFoot: true, label: 'Slip into the precinct back lot — on foot' },
      { type: 'getincar', carId: 'evan', label: 'Take the evidence van' },
      { type: 'give', run: (c) => c.police.crime(520) },
      { type: 'deliver', x: 334, z: 100, r: 9, carId: 'evan', label: 'OUTRUN THE LOCKDOWN — reach the docks' },
      { type: 'msg', lines: [
        L('vex', "Every tape. Every file. Rico's debt? What debt. Palm Bay runs through the Nest now — and the Nest likes you again."),
        L('vex', 'The captain sends his regards, by the way. Turns out badges burn just fine.'),
      ] },
    ],
    reward: 1500, trust: { gang: +25 }, ending: 'B', next: null,
  },
  {
    id: 'S13C', title: 'Snake vs. Snake', giver: 'diner', act: 3, branch: 'C',
    offer: { tag: 'civ', text: "Dot slides you two burner phones. Tip BOTH sides to Pier 4 tonight — and while snakes eat snakes, Dane's dirty-money truck sits unguarded. Airfield closes at midnight.", meta: ['🎭 Play both sides', '💰 $250,000 truck', '🏁 Finale'] },
    brief: [
      L('dot', "You didn't hear this from me: Dane keeps his skim in an armored truck at the docks on shipment nights. Both your 'employers' will be VERY busy with each other…"),
      L('ash', '(One call to Marlowe. One call to Knuckles. Then I drive between the raindrops.)'),
    ],
    time: 300,
    spawns: { cars: [
      { id: 'cash', type: 'armored', x: 334, z: 76, rot: 0, locked: false, hpMul: 1.2 },
      { id: 'w1', type: 'police', x: 322, z: 96, rot: 1.2, locked: true, ai: true, role: 'police' },
      { id: 'w2', type: 'van', x: 342, z: 96, rot: -1.2, locked: true, ai: true, role: 'gang' },
    ] },
    steps: [
      { type: 'goto', x: DINER[0], z: DINER[1], r: 6, label: 'Make the calls from the payphone' },
      { type: 'msg', lines: [L('radio', 'All units — armed convoy activity, Pier 4. Repeat: ALL units to the docks.'), L('ash', 'And there goes the neighborhood.')] },
      { type: 'getincar', carId: 'cash', label: "Take Dane's money truck amid the chaos" },
      { type: 'give', run: (c) => c.police.crime(320) },
      { type: 'deliver', x: AIRFIELD[0], z: AIRFIELD[1], r: 9, carId: 'cash', label: 'Reach the airfield before midnight' },
      { type: 'msg', lines: [
        L('ash', "Rico — the debt's paid. All of it. Cash. Don't ask."),
        L('rico', 'Ash… whose truck is that? ASH?'),
        L('ash', "Nobody's. That's the point. Keep the shop, cuz."),
      ] },
    ],
    reward: 2500, trust: {}, ending: 'C', next: null,
  },
];

export const ENDINGS = {
  A: { title: 'CLEAN STREETS', sub: "Vex is in county. Dane's badge is in an evidence bag — Marlowe's word held: the '23 file is gone, and so is Rico's debt, burned with the Serpents' books.\nPalm Bay gets quiet. You get a police-auction discount.", unlock: ['police', 'military'] },
  B: { title: 'SERPENT KING', sub: "The evidence burned in a dockside barrel while Vex laughed. Rico's debt is a memory; half the town's keys hang behind the Nest's bar now — and one set is yours.\nMarlowe transferred north. Best not to think about it.", unlock: ['military', 'sport'] },
  C: { title: 'VANISHING ACT', sub: 'The snakes bit each other exactly as hard as you hoped. Dane\'s skim paid Rico\'s debt with room to spare, and a quarter-million dollars fits in two duffel bags — turns out.\nSomewhere over the water, Palm Bay stops being your problem.', unlock: ['armored', 'formula', 'sport'] },
};

// which node comes after `id`, given the profile (handles the S13 branch)
export function nextNodeId(id, profile) {
  const n = STORY.find(s => s.id === id);
  if (!n) return null;
  if (n.next !== 'S13') return n.next;
  const t = profile.story.trust, ex = profile.story.exposure;
  if (t.police >= 55 && t.gang >= 55 && ex < 60) return 'S13C';
  if (t.gang >= t.police && t.gang >= 60) return 'S13B';
  if (t.police >= 60) return 'S13A';
  return t.police >= t.gang ? 'S13A' : 'S13B';   // fallback: stronger side
}
export const nodeById = (id) => STORY.find(s => s.id === id) || null;

// ── repeatable side jobs per board ──
export const SIDES = [
  {
    id: 'side_patrol', giver: 'police', title: 'Street Sweep',
    offer: { tag: 'police', text: 'Two stolen cars are joyriding Palm Bay. PIT them off the road — insurance pays either way.', meta: ['💥 Destroy 2', '💵 $250'] },
    spawns: { cars: [
      { id: 'st1', type: 'sedan', x: 190, z: 26, rot: 1.57, locked: true, ai: true },
      { id: 'st2', type: 'pickup', x: 250, z: 174, rot: 0, locked: true, ai: true },
    ] },
    steps: [{ type: 'destroy', targets: ['st1', 'st2'], fleeing: true, label: 'Wreck the stolen cars' }],
    reward: 250, trust: { police: +4 },
  },
  {
    id: 'side_collect', giver: 'gang', title: 'Tribute Run',
    offer: { tag: 'gang', text: 'Three businesses are late on tribute. Visit each — your parked presence is the message.', meta: ['📍 3 stops', '⏱ 2:30', '💵 $250'] },
    time: 150,
    steps: [
      { type: 'goto', x: 210, z: 254, r: 6, inCar: true, label: 'Lean on the diner' },
      { type: 'goto', x: 282, z: 122, r: 6, inCar: true, label: 'Lean on the hotel' },
      { type: 'goto', x: 218, z: 122, r: 7, inCar: true, label: 'Lean on the casino' },
    ],
    reward: 250, trust: { gang: +4 },
  },
  {
    id: 'side_race', giver: 'race', title: 'The Dust Cup',
    offer: { tag: 'civ', text: 'The airfield circuit. Three locals think they can drive. Show them what a getaway artist looks like at full song.', meta: ['🏁 Beat 3 rivals', '💵 $400'] },
    spawns: { cars: [
      { id: 'r1', type: 'sport', x: 116, z: 352, rot: 1.57, locked: true, ai: true },
      { id: 'r2', type: 'sedan', x: 116, z: 358, rot: 1.57, locked: true, ai: true },
      { id: 'r3', type: 'pickup', x: 116, z: 364, rot: 1.57, locked: true, ai: true },
    ] },
    steps: [{
      type: 'race', rivalIds: ['r1', 'r2', 'r3'], rivalSpeed: 0.82, r: 10,
      checkpoints: [[196, 358], [206, 370], [120, 368], [56, 362], [70, 348], [150, 352], [196, 358], [122, 366]],
    }],
    reward: 400, trust: {},
  },
  {
    id: 'side_fares', giver: 'diner', title: 'Rush Hour',
    offer: { tag: 'civ', text: 'Three fares, one borrowed cab, zero patience. Dot swears the meter is honest.', meta: ['🚕 3 fares', '⏱ 3:00', '💵 $220'] },
    time: 180,
    spawns: { cars: [{ id: 'cab', type: 'taxi', x: 214, z: 262, rot: 0, locked: false }] },
    steps: [
      { type: 'getincar', carId: 'cab', label: 'Grab the cab' },
      { type: 'goto', x: 130, z: 106, r: 5, inCar: true, label: 'Fare 1 — the mall' },
      { type: 'goto', x: 86, z: 190, r: 5, inCar: true, label: 'Fare 2 — westside' },
      { type: 'goto', x: 338, z: 282, r: 6, inCar: true, label: 'Fare 3 — the beach' },
    ],
    reward: 220, trust: {},
  },
];
