// LONGSHOT — the campaign. You are WREN, an ex-military marksman working off
// a debt to a fixer called HALCYON, one contract at a time, until the jobs
// start pointing at the people giving them. Pure data — missions.js interprets.

export const STORY = [
  // ═══ ACT 1 — THE CONTRACT ═══
  {
    id: 's01', act: 1, name: 'RANGE DAY', pay: 300, par: 1000,
    tagline: 'Zero the rifle. Ring the steel.',
    brief: 'Before I put paying work in front of you, Wren, prove the years off the glass didn\'t soften you. Three steel plates, three distances. Scope in, mind the drop, hold your breath when it matters.',
    intel: ['Tap <b>◎</b> to scope, slider or pinch to zoom', 'The round FALLS — use the dots below the crosshair', 'Hold <b>🫁</b> to steady. Watch the breath bar', 'Steel doesn\'t bleed. Take your time'],
    time: 'dusk', wind: [0, 0], vantage: { dist: 140, height: 34 },
    special: 'range', setup: { civs: 0 },
  },
  {
    id: 's02', act: 1, name: 'FIRST BLOOD', pay: 500, par: 2200,
    tagline: 'A debt collector on the plaza. Close and clean.',
    brief: 'Marco Bellan. Collects debts for the Vireo Group with a claw hammer. He takes a call on the plaza every evening, same spot, like a man who thinks he\'s untouchable. He\'s not. This one\'s short range — treat it as a handshake.',
    intel: ['Target: <b>Marco Bellan</b> — on his phone by the fountain', 'MARK <b>◈</b> him first — the diamond stays on him', 'Short range: drop is barely a dot'],
    time: 'dusk', wind: [0, 0], vantage: { dist: 165, height: 30 },
    setup: { targets: [{ kind: 'plaza', anim: 'phone', file: 'man_business.glb', label: 'MARCO BELLAN' }], civs: 9 },
  },
  {
    id: 's03', act: 1, name: 'WINDOW SEAT', pay: 650, par: 2400,
    tagline: 'An accountant who saw the wrong ledger.',
    brief: 'Vireo\'s accountant works late — corner office, lights on, curtains open. Sloppy. The glass will kick your round a hair off line, so put it somewhere the hair doesn\'t matter.',
    intel: ['Target works a lit corner office', 'Standard rounds deflect off glass — aim centre mass, or buy AP later', 'Rangefinder scopes read the exact distance'],
    time: 'dusk', wind: [0, 0], vantage: { dist: 230, height: 40 },
    setup: { targets: [{ kind: 'room', label: 'THE ACCOUNTANT' }], civs: 8 },
  },
  {
    id: 's04', act: 1, name: 'TWO BIRDS', pay: 800, par: 3600,
    tagline: 'Two brothers. Neither walks away.',
    brief: 'The Sarto brothers run Vireo\'s street money. One likes the plaza, one likes the park bench. The moment the first drops, the second will rabbit — you\'ll have a 25-second window. Chamber fast.',
    intel: ['TWO targets — mark them both before firing', 'After the first kill: <b>25 s</b> window', 'Bolt time is dead time — plan the second shot'],
    time: 'day', wind: [0, 0], vantage: { dist: 200, height: 32 },
    setup: { targets: [{ kind: 'plaza', label: 'REMO SARTO' }, { kind: 'bench', label: 'DINO SARTO' }], civs: 10, window: 25 },
  },
  {
    id: 's05', act: 1, name: 'COLD WIND', pay: 900, par: 2600,
    tagline: 'First lesson the city teaches: the air is never still.',
    brief: 'A juror got bought and a good man is doing thirty years for it. The buyer strolls the same block every day. There\'s a crosswind coming off the bay — watch the arrow at the top, hold into the wind, let it carry the round home.',
    intel: ['Wind <b>2–4 m/s</b> — the HUD arrow shows direction', 'Hold UPWIND: the breeze bends the bullet downwind', 'He\'s walking — lead a half-step at this range'],
    time: 'day', wind: [2, 4], vantage: { dist: 260, height: 36 },
    setup: { targets: [{ kind: 'walk', label: 'THE BAGMAN' }], civs: 10 },
  },

  // ═══ ACT 2 — THE PATTERN ═══
  {
    id: 's06', act: 2, name: 'THE MEETING', pay: 1100, par: 3000,
    tagline: 'Four suits on a plaza. One of them is the mark.',
    brief: 'Vireo is meeting a buyer tonight and my photo of him is ten years stale. What I know: he\'ll be in a suit, he\'ll be working a phone, and he never sits. Glass them all, then MARK the one that fits. Guess wrong and we burn the intel.',
    intel: ['Clue 1: wearing a <b>suit</b>', 'Clue 2: <b>on the phone</b>', 'Clue 3: standing on the <b>plaza</b> — never sits', 'MARK <b>◈</b> to confirm — wrong marks cost 500'],
    time: 'dusk', wind: [1, 2], vantage: { dist: 240, height: 36 },
    setup: { targets: [{ kind: 'plaza', anim: 'phone', label: 'THE BUYER' }], identify: { decoys: 3 }, civs: 10 },
  },
  {
    id: 's07', act: 2, name: 'MOVING TARGET', pay: 1200, par: 3200,
    tagline: 'He never stops walking. Neither does the bullet.',
    brief: 'A Vireo courier does his whole route on foot — smart, no car to bomb, no window to watch. Not smart enough. Time of flight at this range is most of a second: put the round where he\'s GOING to be.',
    intel: ['Target walks a fixed loop — learn it before you fire', 'At 320 m the round flies ~0.5 s — lead him', 'Moving kills pay a +400 bonus'],
    time: 'day', wind: [1, 3], vantage: { dist: 320, height: 42 },
    setup: { targets: [{ kind: 'walk', label: 'THE COURIER', speed: 1.6 }], civs: 9 },
  },
  {
    id: 's08', act: 2, name: 'ROLLING THUNDER', pay: 1400, par: 3400,
    tagline: 'Stop the car. Then stop the man.',
    brief: 'A black sedan is moving Vireo ledgers across town in ninety seconds. You can\'t shoot paper. Shoot the FRONT TYRE, and when the courier bails, finish the job. Two-part contract — don\'t fumble the handoff.',
    intel: ['Part 1: shoot the <b>front tyre</b> of the moving sedan', 'Part 2: the courier runs — drop him', 'Clock\'s at <b>90 s</b> from insert'],
    time: 'day', wind: [0, 2], vantage: { dist: 300, height: 38 },
    timeLimit: 90, special: 'convoy', setup: { civs: 7 },
  },
  {
    id: 's09', act: 2, name: 'NIGHT SHIFT', pay: 1300, par: 3000,
    tagline: 'The city looks different through cold glass at 2 a.m.',
    brief: 'A Vireo chemist cooks the books at night — literally, it\'s a lab. His office glows like an aquarium. The dark hides you, but it hides your landmarks too. Find the lit room. Do it quietly if you can.',
    intel: ['Night op — lit windows are your map', 'The OWL scope\'s night-vision helps, if you own it', 'Ghost bonus: finish before anyone panics'],
    time: 'night', wind: [1, 2], vantage: { dist: 280, height: 44 },
    setup: { targets: [{ kind: 'room', label: 'THE CHEMIST' }], civs: 7 },
  },
  {
    id: 's10', act: 2, name: 'GUARDIAN ANGEL', pay: 1600, par: 3800,
    tagline: 'Tonight the rifle protects.',
    brief: 'My informant inside Vireo is walking to a safehouse across the plaza, and they know. Four killers are closing on foot. She\'s marked green. They\'ll be marked red. Nobody touches her, Wren. Nobody.',
    intel: ['PROTECT the green mark — she must cross alive', 'Killers rush in on foot, marked red', 'They need seconds beside her to do it — you need one'],
    time: 'dusk', wind: [1, 3], vantage: { dist: 220, height: 34 },
    special: 'protect', setup: { civs: 8, protect: { waves: 4 } }, noBcam: true,
  },
  {
    id: 's11', act: 2, name: 'THE DROP', pay: 1700, par: 3600,
    tagline: 'Eight seconds at the window. Twice a cigarette.',
    brief: 'The man who ordered the hit on my informant smokes at his window — eight seconds at a time, then gone. You\'ll get a handful of windows before he turns in. Breathe, hold, and be ready BEFORE he shows.',
    intel: ['Target appears at the window in <b>8 s</b> exposures', 'Pre-aim the lit room and hold your breath early', 'Two minutes on the clock'],
    time: 'night', wind: [0, 2], vantage: { dist: 340, height: 48 },
    timeLimit: 120, special: 'appear', setup: { targets: [{ kind: 'room', label: 'THE SMOKER', anim: 'watch' }], civs: 6, showFor: 8, hideFor: 11 },
  },

  // ═══ ACT 3 — THE HUNT ═══
  {
    id: 's12', act: 3, name: 'LONG WAY DOWN', pay: 2000, par: 3800,
    tagline: 'Half a kilometre of falling air.',
    brief: 'Vireo\'s head of security takes his calls on a rooftop — five hundred metres of wind and drop between you and him. This is the shot that separates marksmen from murderers with rifles. Take your time. Then take him.',
    intel: ['Range ≈ <b>520 m</b> — the drop is real now', 'Wind 3–6 m/s: mils of hold, not clicks', 'Distance bonus pays past 150 m — this one pays plenty'],
    time: 'day', wind: [3, 6], vantage: { dist: 520, height: 52 },
    setup: { targets: [{ kind: 'rooftop', label: 'HEAD OF SECURITY', anim: 'phone' }], civs: 6 },
  },
  {
    id: 's13', act: 3, name: 'GLASS HOUSE', pay: 2200, par: 4000,
    tagline: 'Armour under the suit. Arrogance under the armour.',
    brief: 'A Vireo director in a penthouse office — bulletproof vest under a tailored suit, because he\'s heard about you. The vest stops match rounds. It does not stop tungsten, and it has never once stopped physics arriving at the skull.',
    intel: ['Target wears a <b>vest</b> — body shots bounce', 'Headshot always works. So does AP or the .50', 'Penthouse glass between you and him'],
    time: 'night', wind: [1, 3], vantage: { dist: 420, height: 56 },
    setup: { targets: [{ kind: 'room', label: 'DIRECTOR HALE', armored: true }], civs: 6 },
  },
  {
    id: 's14', act: 3, name: 'DOUBLE CROSS', pay: 2500, par: 5200,
    tagline: 'Three heads of the same snake. Twenty seconds.',
    brief: 'Three Vireo cell leaders, one city, one night — and the second the first one drops, the other two will be smoke inside twenty seconds. Mark all three. Plan your order: nearest last, they hear it latest. Then run the table.',
    intel: ['THREE targets: plaza, street, rooftop', '<b>20 s</b> window once the first falls', 'Fast-cycling rifles earn their money tonight'],
    time: 'dusk', wind: [2, 4], vantage: { dist: 300, height: 40 },
    setup: { targets: [{ kind: 'plaza', label: 'CELL LEADER A' }, { kind: 'walk', label: 'CELL LEADER B' }, { kind: 'rooftop', label: 'CELL LEADER C' }], civs: 9, window: 20 },
  },
  {
    id: 's15', act: 3, name: 'RAT RUN', pay: 2300, par: 4200,
    tagline: 'He knows. He\'s running anyway.',
    brief: 'The Sarto brothers had a cousin. He\'s been hiding in a hole for a month and tonight he\'s making his move — fast, jinking, with two hired guns watching the skyline for exactly you. Every loud shot they triangulate. Make the first one count.',
    intel: ['Target moves FAST between cover', 'Two counter-spotters: loud shots build <b>EXPOSURE</b>', 'Exposure full = compromised = gone', 'A suppressed rifle trivialises this. Just saying.'],
    time: 'day', wind: [1, 3], vantage: { dist: 360, height: 44 },
    setup: { targets: [{ kind: 'walk', label: 'THE COUSIN', speed: 2.3 }], civs: 8, guards: 2 },
  },
  {
    id: 's16', act: 3, name: 'THE AUCTION', pay: 2800, par: 4600,
    tagline: 'Six bidders. One seller. Zero mistakes.',
    brief: 'Vireo is auctioning my name tonight. The seller is on the plaza among the bidders — suits, all of them, guarded, twitchy. He\'ll be the one on his phone, standing apart. Mark carefully; every bidder you kill by mistake is a war you start.',
    intel: ['Clue 1: <b>suit</b>', 'Clue 2: <b>on the phone</b>', 'Clue 3: standing on the <b>plaza</b>', 'THREE armed guards — exposure rules apply', 'Wrong kills = civilian penalties. Identify first'],
    time: 'night', wind: [1, 3], vantage: { dist: 320, height: 42 },
    setup: { targets: [{ kind: 'plaza', anim: 'phone', label: 'THE SELLER' }], identify: { decoys: 5 }, civs: 8, guards: 3 },
  },

  // ═══ ACT 4 — VIREO ═══
  {
    id: 's17', act: 4, name: 'DECAPITATION', pay: 3200, par: 5000,
    tagline: 'Guards first. Then the man they failed.',
    brief: 'Vireo\'s operations chief, penthouse floor, three shooters on overwatch. You can thread the needle past them, or you can clear the nest first and own the skyline. Your call, your rifle, your night.',
    intel: ['Primary in a lit office; <b>3 guards</b> posted', 'Guards are armoured — heads, AP, or the .50', 'Exposure builds fast with three sets of eyes'],
    time: 'dusk', wind: [2, 5], vantage: { dist: 400, height: 50 },
    setup: { targets: [{ kind: 'room', label: 'OPS CHIEF', armored: true }], civs: 7, guards: 3 },
  },
  {
    id: 's18', act: 4, name: 'THE HANDOFF', pay: 3400, par: 4600,
    tagline: 'His bodyguard is very good. Be better.',
    brief: 'Vireo\'s money man walks with a human shield — ex-military, stays glued to the exposed side, reads rooflines for a living. You\'ll get slivers of a shot when they turn corners and split. Patience. The city will give you the angle once.',
    intel: ['Bodyguard blocks the vantage side — he\'s armoured', 'Wait for corners and pauses: the pair separates', 'Killing the bodyguard alerts the mark — bad trade'],
    time: 'day', wind: [1, 3], vantage: { dist: 340, height: 40 },
    setup: { targets: [{ kind: 'pair', label: 'THE TREASURER' }], civs: 9 },
  },
  {
    id: 's19', act: 4, name: 'STORM WARNING', pay: 3600, par: 5000,
    tagline: 'Rain on the glass. Gusts in the lane. Perfect.',
    brief: 'The man who signs Vireo\'s kill orders is moving safehouses tonight, in the worst weather of the year — because who takes a 450-metre shot in a gusting rainstorm? You do. Read the lulls. Fire between the gusts.',
    intel: ['Wind <b>4–8 m/s and GUSTING</b> — it breathes, watch the number', 'Fire in the lulls, not the peaks', 'Rain kills visibility past 600 m — he\'ll be closer'],
    time: 'rain', wind: [4, 8], gusts: true, vantage: { dist: 450, height: 46 },
    setup: { targets: [{ kind: 'walk', label: 'THE SIGNATORY' }], civs: 5 },
  },
  {
    id: 's20', act: 4, name: 'HALCYON DOWN', pay: 4000, par: 5200,
    tagline: 'Someone\'s on a rooftop tonight. It isn\'t you.',
    brief: 'They stopped sending killers after the informant, Wren. They sent one after ME. He\'s on the skyline right now, glassing my window, and the only thing between me and a closed casket is you. Watch for his lens flash. You get maybe two mistakes. He needs one.',
    intel: ['COUNTER-SNIPER: find the <b>glint</b> on the rooftops', 'He fires every few shots — the third one lands on Halcyon', 'Your muzzle flash draws his aim — loud shots hurry him'],
    time: 'night', wind: [1, 3], vantage: { dist: 420, height: 52 },
    special: 'countersniper', setup: { targets: [{ kind: 'sniper', label: 'THE OTHER RIFLE' }], civs: 4 }, noBcam: true,
  },
  {
    id: 's21', act: 4, name: 'THE AVIARY', pay: 6000, par: 6000,
    tagline: 'The man who owns the city\'s shadows. 650 metres. End it.',
    brief: 'Aurelius Vane. Founder of the Vireo Group. Every contract, every body, every debt — his signature, including mine, including yours. He\'s on his tower tonight, behind two guns and six hundred and fifty metres of moving air, believing height is the same thing as safety. Show him the difference. Then come home, Wren. We\'re done after this one.',
    intel: ['<b>AURELIUS VANE</b> — rooftop, vest, phone in hand', 'Range ≈ 650 m, wind 3–7 gusting', 'Two overwatch guards on adjacent roofs', 'Finish it.'],
    time: 'dusk', wind: [3, 7], gusts: true, vantage: { dist: 650, height: 60 },
    setup: { targets: [{ kind: 'rooftop', label: 'AURELIUS VANE', armored: true, anim: 'phone' }], civs: 6, guards: 2 },
  },
];

export const ACT_NAMES = { 1: 'ACT I — THE CONTRACT', 2: 'ACT II — THE PATTERN', 3: 'ACT III — THE HUNT', 4: 'ACT IV — VIREO' };

// free-practice range, reachable from the title screen any time
export const RANGE_DEF = {
  id: 'range', act: 0, name: 'THE RANGE', pay: 0, par: 1000,
  tagline: 'Steel, wind and quiet. Practice.',
  brief: 'No contract, no clock, no witnesses. Ring the steel until the holdover feels like instinct.',
  intel: ['Three plates at three ranges', 'Free retry, no stakes'],
  time: 'day', wind: [0, 3], vantage: { dist: 140, height: 34 },
  special: 'range', setup: { civs: 0 }, practice: true,
};
