// D34 task grid. Engine: js/game/tasks.js. Docs: docs/TASKS.md. Pure data (node-safe): no three, no DOM.
// A task is one of:
//   { on, when? }            one-shot: the first matching event completes it
//   { stat, target }         lifetime counter (STATS) reaching target
//   { fstat, target }        per-flight counter (FSTATS) reaching target in a single flight
// Event shapes (all carry plane, diff, mode): see docs/TASKS.md "Events".
import { INFRACTIONS } from './rules.js';

export const TASKS_KEY = 'krayzee.tasks';
export const TIER_PP = { bronze: 100, silver: 250, gold: 750 };
export const SET_BONUS = { share: 0.6, min: 1000 };

const ok = (e) => !e.crash;
const plane = (id, f = () => true) => (e) => e.plane === id && f(e);
const rule = (id, f = () => true) => (e) => e.id === id && f(e);
const RULE_IDS = Object.keys(INFRACTIONS);

// Landmarks of C-Tower 1 (data/airports/royal.js scenery + data/story/common.js CHURCH). r = metres, agl = metres.
export const PLACES = {
  castle:   { name: 'the castle',   at: { x: 780, z: -2300, r: 350 },  agl: 150, low: { r: 170, agl: 30 } },
  church:   { name: 'the church',   at: { x: 125, z: -1605, r: 250 },  agl: 100, low: { r: 90, agl: 30 } },
  village:  { name: 'the village',  rect: [-660, -1900, 400, -1170],  agl: 80, low: { agl: 30 } },
  lake:     { name: 'the lake',     ell: { x: -1700, z: -700, rx: 380, rz: 230 }, agl: 40, low: { agl: 5 } },
  terminal: { name: 'the terminal', rect: [-210, -342, 50, -298],     agl: 120, low: { agl: 40 } },
};
export function placeAt(x, z, agl) {
  const out = [];
  for (const [id, p] of Object.entries(PLACES)) {
    let inside = false, near = false;
    if (p.at) { const d = Math.hypot(x - p.at.x, z - p.at.z); inside = d <= p.at.r; near = d <= (p.low.r ?? p.at.r); }
    else if (p.rect) { const [x0, z0, x1, z1] = p.rect; inside = near = x >= x0 && x <= x1 && z >= z0 && z <= z1; }
    else if (p.ell) { const e = p.ell; inside = near = ((x - e.x) / e.rx) ** 2 + ((z - e.z) / e.rz) ** 2 <= 1; }
    if (inside && agl <= p.agl) out.push({ place: id, low: near && agl <= p.low.agl });
  }
  return out;
}

// Mission ids + objective ids (data/story/mission*.js; those modules import three, so they are mirrored here).
export const STORY = [
  { id: 1, title: 'Letters Patent', objectives: ['fly', 'buzz', 'land'] },
  { id: 2, title: 'The Pomfrey-Smythe Welcome', objectives: ['cut', 'land'] },
  { id: 3, title: "Queue Is a Commoner's Word", objectives: ['jump', 'bless', 'land'] },
  { id: 4, title: 'The Castle Cup', objectives: ['steal', 'throttle', 'race', 'land'] },
];

// Lifetime counters. add defaults to 1; unique counts distinct keys; max keeps the largest; resetOn zeroes it.
export const STATS = {
  landings:     { on: 'touchdown', when: ok },
  butters:      { on: 'touchdown', when: (e) => ok(e) && e.fpm < 100 },
  takeoffs:     { on: 'takeoff' },
  impeccables:  { on: 'impeccable' },
  infractions:  { on: 'infraction' },
  rules:        { on: 'infraction', unique: (e) => e.id },
  nearMiss:     { on: 'infraction', when: rule('near_miss') },
  touches:      { on: 'infraction', when: rule('light_touch') },
  closeCalls:   { on: 'infraction', when: (e) => ['near_miss', 'light_touch', 'formation'].includes(e.id) },
  maxCombo:     { on: 'combo', max: (e) => e.mult },
  ripostes:     { on: 'banter' },
  quick:        { on: 'banter', when: (e) => e.name === 'Quick Riposte' },
  dykwia:       { on: 'banter', when: (e) => e.name === 'Do You Know Who I Am' },
  barks:        { on: 'bark' },
  towerQuits:   { on: 'towerScandal' },
  airSecs:      { on: 'air', add: (e) => e.dt },
  distM:        { on: 'air', add: (e) => e.dist },
  maxAlt:       { on: 'air', max: (e) => e.alt },
  formSecs:     { on: 'formation', add: (e) => e.dt },
  destroyed:    { on: 'destroyed' },
  bounces:      { on: 'bounce' },
  bankedPP:     { on: 'banked', add: (e) => e.amount },
  finishes:     { on: 'finished' },
  hardFinishes: { on: 'finished', when: (e) => e.diff === 'hard' },
  hardStreak:   { on: 'finished', when: (e) => e.diff === 'hard', resetOn: ['destroyed'] },
  c172Landings: { on: 'touchdown', when: plane('c172', ok) },
  tubSecs:      { on: 'air', when: plane('bathtub'), add: (e) => e.dt },
  mothSecs:     { on: 'air', when: plane('tiger'), add: (e) => e.dt },
  missions:     { on: 'story', when: (e) => e.ok, unique: (e) => e.mission },
};

// Per-flight counters: zeroed at each flight start (play start, DEMAND IT, respawn); the best flight is kept.
export const FSTATS = {
  landings: { on: 'touchdown', when: ok },
  rules:    { on: 'infraction', unique: (e) => e.id },
  formSecs: { on: 'formation', add: (e) => e.dt },
  invSecs:  { on: 'inverted', add: (e) => e.dt },
  hopSecs:  { on: 'air', add: (e) => e.dt, resetOn: ['touchdown'] },
  visits:   { on: 'visit', unique: (e) => e.place },
};

const T = (id, icon, name, desc, tier, rule) => ({ id, icon, name, desc, tier, ...rule });

const RULE_DESC = {
  queue_jump: ['🚶', 'Enter the runway with somebody still waiting ahead of you.', 'bronze'],
  unauth_takeoff: ['🙊', 'Take off without being cleared. Asking is for commoners.', 'bronze'],
  runway_steal: ['🦹', 'Pinch the runway from someone on their take-off roll or short final.', 'silver'],
  taxiway_landing: ['🛣️', 'Land on a taxiway. It is a runway if you believe in it.', 'silver'],
  grass_landing: ['🌾', 'Land on the grass and live.', 'bronze'],
  apron_landing: ['🅿️', 'Land on the apron, right by the terminal doors.', 'silver'],
  wrong_way: ['🔄', 'Land or take off against the active runway direction.', 'silver'],
  closed_runway: ['🚧', 'Land on a closed runway. Zero-four is "resurfacing".', 'silver'],
  taxi_speeding: ['🏎️', 'Taxi over 30 kt for two seconds. Wheee.', 'bronze'],
  stand_steal: ['🪑', "Park on another aircraft's stand.", 'silver'],
  double_occupancy: ['👯', 'Share a runway with a plane doing over 40 kt.', 'gold'],
  intersection_dash: ['➕', 'Dash through the 09/27 × 04/22 crossing while either runway is busy.', 'gold'],
  cut_in_final: ['✂️', 'Cut in ahead of someone sequenced before you on final.', 'bronze'],
  forced_goaround: ['↩️', 'Make the tower send a commoner round.', 'silver'],
  tower_buzz: ['🗼', 'Buzz the control tower. The owls will cope.', 'bronze'],
  terminal_buzz: ['🪟', 'Rattle the terminal windows from under 40 m.', 'bronze'],
  low_pass: ['🎺', 'A royal flypast: down the runway, 1 to 6 m up, fast, no touching.', 'silver'],
  formation: ['🦆', 'Fly in uninvited formation (within 40 m) for three seconds.', 'silver'],
  near_miss: ['😬', 'Pass within 25 m of another aircraft. Without touching.', 'silver'],
  ignored_instruction: ['🙉', 'Ignore a go-around. Selective hearing is hereditary.', 'bronze'],
  light_touch: ['💋', 'Swap paint gently with another aircraft: a Close Call.', 'silver'],
};
const GROUND = ['queue_jump', 'unauth_takeoff', 'runway_steal', 'taxiway_landing', 'grass_landing', 'apron_landing', 'wrong_way', 'closed_runway', 'taxi_speeding', 'stand_steal', 'double_occupancy', 'intersection_dash'];
const SKY = ['cut_in_final', 'forced_goaround', 'tower_buzz', 'terminal_buzz', 'low_pass', 'formation', 'near_miss', 'ignored_instruction', 'light_touch'];
const ruleTask = (id) => T(`rule_${id}`, RULE_DESC[id][0], INFRACTIONS[id].name, RULE_DESC[id][1], RULE_DESC[id][2], { on: 'infraction', when: rule(id) });

const HEAVY = ['jumbo', 'herc', 'f35'];

export const SETS = [
  { id: 'wheels', name: 'Wheels, Mostly Down', blurb: 'Arrivals of every quality', badge: '🛬', epithet: 'the Well-Landed', tasks: [
    T('touch_down', '🛬', 'Touch Down', 'Land anywhere. The ground was expecting you.', 'bronze', { on: 'touchdown', when: ok }),
    T('gentle', '🪶', 'Gentle Giant', 'Touch down under 250 fpm.', 'bronze', { on: 'touchdown', when: (e) => ok(e) && e.fpm < 250 }),
    T('butter', '🧈', 'Butter Fingers', 'Touch down under 100 fpm. The runway barely noticed.', 'silver', { on: 'touchdown', when: (e) => ok(e) && e.fpm < 100 }),
    T('firm', '🔨', 'Arrive With Conviction', 'A firm 500–800 fpm arrival, and walk away from it.', 'bronze', { on: 'touchdown', when: (e) => ok(e) && e.fpm >= 500 && e.fpm < 800 }),
    T('boing', '🏀', 'Boing!', 'Bounce off something. ImpossiRubber forgives everything.', 'bronze', { on: 'bounce' }),
    T('hat_trick', '🎩', 'Hat-Trick', 'Three landings in one flight. Touch-and-goes count.', 'silver', { fstat: 'landings', target: 3 }),
    T('crosswind', '🌬️', 'Crosswind Cad', 'Touch down on the crosswind runway, 04/22.', 'silver', { on: 'touchdown', when: (e) => ok(e) && e.runway === '04/22' }),
    T('deadstick', '🪂', 'Glide of Shame', 'Land with the tank bone dry. Gliding counts as flying.', 'gold', { on: 'touchdown', when: (e) => ok(e) && e.fuel <= 0.001 }),
    T('textbook', '📏', 'Textbook, Somehow', 'An Impeccable landing: cleared, on the centreline, early and gentle.', 'silver', { on: 'impeccable' }),
  ] },
  { id: 'ledger', name: 'The Landing Ledger', blurb: 'Arrivals, counted by a clerk', badge: '🧈', epithet: 'the Buttery', tasks: [
    T('land_10', '📒', 'Frequent Lander', 'Land 10 times.', 'bronze', { stat: 'landings', target: 10 }),
    T('land_50', '🎫', 'Season Ticket', 'Land 50 times.', 'silver', { stat: 'landings', target: 50 }),
    T('land_200', '🏠', 'Runway Resident', 'Land 200 times. The grass knows your name.', 'gold', { stat: 'landings', target: 200 }),
    T('takeoff_25', '🛫', 'Up, Up and Away', 'Take off 25 times.', 'bronze', { stat: 'takeoffs', target: 25 }),
    T('takeoff_250', '🚀', 'Perpetual Departure', 'Take off 250 times.', 'gold', { stat: 'takeoffs', target: 250 }),
    T('butter_10', '🐄', 'Dairy Monarch', 'Ten landings under 100 fpm.', 'gold', { stat: 'butters', target: 10 }),
    T('impeccable_10', '📐', 'By the Book, Ten Times', 'Ten Impeccable landings. Gerald may weep.', 'gold', { stat: 'impeccables', target: 10 }),
    T('five_in_one', '🍽️', 'Touch-and-Go Gourmand', 'Five landings in a single flight.', 'silver', { fstat: 'landings', target: 5 }),
  ] },
  { id: 'ground', name: 'Rule-Breaker: The Ground', blurb: 'Every rule on the tarmac, once', badge: '🚧', epithet: 'the Unqueued', tasks: GROUND.map(ruleTask) },
  { id: 'sky', name: 'Rule-Breaker: The Sky', blurb: 'Every rule aloft, once', badge: '📜', epithet: 'the Unruly', tasks: SKY.map(ruleTask) },
  { id: 'offender', name: 'Habitual Offender', blurb: 'Crime, as a hobby', badge: '⛓️', epithet: 'the Incorrigible', tasks: [
    T('inf_10', '😈', 'Bad Influence', 'Break 10 rules.', 'bronze', { stat: 'infractions', target: 10 }),
    T('inf_100', '📇', 'Known to the Tower', 'Break 100 rules.', 'silver', { stat: 'infractions', target: 100 }),
    T('inf_500', '🖼️', 'Wanted Poster', 'Break 500 rules.', 'gold', { stat: 'infractions', target: 500 }),
    T('inf_2000', '☠️', 'Menace to Aviation', 'Break 2,000 rules. Questions are asked in Parliament.', 'gold', { stat: 'infractions', target: 2000 }),
    T('combo_2', '🔥', 'Spree', 'Chain rule-breaks to a ×2 combo.', 'silver', { stat: 'maxCombo', target: 2 }),
    T('combo_25', '🌋', 'Crime Wave', 'Reach the ×2.5 combo cap.', 'gold', { stat: 'maxCombo', target: 2.5 }),
    T('variety', '🎭', 'Variety Act', 'Five different rules broken in one flight.', 'silver', { fstat: 'rules', target: 5 }),
    T('rap_sheet', '📜', 'Full Rap Sheet', `Break all ${RULE_IDS.length} rules at least once.`, 'gold', { stat: 'rules', target: RULE_IDS.length }),
    T('frozen', '📸', 'Nothing Counts', 'Break a rule while the press are watching (after a scandal).', 'bronze', { on: 'infraction', when: (e) => !!e.frozen }),
  ] },
  { id: 'tower', name: 'Tower Torment', blurb: 'Composure is a finite resource', badge: '☕', epithet: 'Bane of Towers', tasks: [
    T('strained', '😐', 'Mildly Strained', 'Push the tower to Strained.', 'bronze', { on: 'composure', when: (e) => e.tier >= 2 }),
    T('cracking', '😖', 'Cracking Up', 'Push the tower to Cracking.', 'silver', { on: 'composure', when: (e) => e.tier >= 3 }),
    T('meltdown', '🤯', 'Meltdown', 'Push the tower to full Meltdown.', 'gold', { on: 'composure', when: (e) => e.tier >= 4 }),
    T('lie_down', '🛌', 'Gone for a Lie-Down', 'Max out the tower: a Royal Scandal. They need a moment.', 'gold', { on: 'towerScandal' }),
    T('resign_5', '📨', 'Serial Resignations', 'Five Royal Scandals. HR has a folder with your name on.', 'gold', { stat: 'towerQuits', target: 5 }),
    T('crack_gerald', '🦉', 'The Owls Are Shaking', 'Crack Gerald Calloway (Cracking or worse).', 'silver', { on: 'composure', when: (e) => e.tier >= 3 && e.controller === 'gerald' }),
    T('crack_imogen', '🧊', 'Frost Thaws', 'Crack Imogen Frost, who has never raised her voice.', 'silver', { on: 'composure', when: (e) => e.tier >= 3 && e.controller === 'imogen' }),
    T('crack_toby', '🗂️', 'Laminated Card, Torn', 'Crack young Toby Wren. He thought you were wonderful.', 'silver', { on: 'composure', when: (e) => e.tier >= 3 && e.controller === 'toby' }),
  ] },
  { id: 'backchat', name: 'Back-Chat', blurb: 'The radio is a stage', badge: '🗯️', epithet: 'the Unanswerable', tasks: [
    T('riposte', '💬', 'Riposte', 'Answer back on the radio inside the reply window.', 'bronze', { on: 'banter' }),
    T('quick', '⚡', 'Quick Riposte', 'Answer back within two seconds.', 'bronze', { on: 'banter', when: (e) => e.name === 'Quick Riposte' }),
    T('quick_10', '🤺', 'Rapier Wit', 'Ten Quick Ripostes.', 'silver', { stat: 'quick', target: 10 }),
    T('dykwia', '👑', 'Do You Know Who I Am', 'Pull rank on the tower: the priority reply.', 'bronze', { on: 'banter', when: (e) => e.name === 'Do You Know Who I Am' }),
    T('dykwia_10', '📣', 'They Know Now', 'Ask the tower who you are, ten times.', 'silver', { stat: 'dykwia', target: 10 }),
    T('riposte_25', '🎙️', 'Last Word', '25 ripostes of any kind.', 'silver', { stat: 'ripostes', target: 25 }),
    T('riposte_100', '📻', 'Never Off Air', '100 ripostes. You have a radio show now.', 'gold', { stat: 'ripostes', target: 100 }),
    T('barks_50', '🦜', 'Chatterbox', 'Say 50 things on the radio.', 'bronze', { stat: 'barks', target: 50 }),
  ] },
  { id: 'close', name: 'Close Calls', blurb: 'Personal space is for commoners', badge: '🎯', epithet: 'the Uncomfortably Close', tasks: [
    T('nm_10', '😅', 'Near Miss Collector', '10 near misses.', 'silver', { stat: 'nearMiss', target: 10 }),
    T('nm_50', '🫣', 'Statistically Improbable', '50 near misses.', 'gold', { stat: 'nearMiss', target: 50 }),
    T('touch_10', '🎨', 'Paint Swapper', '10 contact Close Calls.', 'silver', { stat: 'touches', target: 10 }),
    T('cc_25', '🍀', 'Lucky Charm', '25 close calls of any kind: misses, touches, formation.', 'silver', { stat: 'closeCalls', target: 25 }),
    T('form_30', '🪿', 'Wingman Nobody Asked For', '30 seconds within 50 m of another aircraft, in one flight.', 'silver', { fstat: 'formSecs', target: 30 }),
    T('form_300', '🦢', 'Close Company', 'Five minutes of uninvited formation, all told.', 'gold', { stat: 'formSecs', target: 300 }),
    T('hard_nm', '🎲', 'Real Nerve', 'A near miss on Hard.', 'silver', { on: 'infraction', when: rule('near_miss', (e) => e.diff === 'hard') }),
    T('hard_touch', '🔩', 'Real Metal, Real Nerve', 'Touch another aircraft on Hard and survive it.', 'gold', { on: 'infraction', when: rule('light_touch', (e) => e.diff === 'hard') }),
  ] },
  { id: 'tourist', name: 'Royal Tourist', blurb: 'See the kingdom from very close', badge: '🏰', epithet: 'the Sightseer', tasks: [
    T('castle', '🏰', 'Castle Call', 'Fly over the castle, under 150 m.', 'bronze', { on: 'visit', when: (e) => e.place === 'castle' }),
    T('church', '⛪', 'Church Bells', 'Fly over the village church, under 100 m.', 'bronze', { on: 'visit', when: (e) => e.place === 'church' }),
    T('village', '🏘️', 'Village Fête', 'Fly over the village, under 80 m.', 'bronze', { on: 'visit', when: (e) => e.place === 'village' }),
    T('lake', '🦆', 'Duck Pond', 'Fly over the lake, under 40 m.', 'bronze', { on: 'visit', when: (e) => e.place === 'lake' }),
    T('castle_low', '⚔️', 'Battlements', 'Over the castle, under 30 m. Mind the flag.', 'silver', { on: 'visit', when: (e) => e.place === 'castle' && e.low }),
    T('church_low', '🔔', 'Steeple Chase', 'Over the church, under 30 m. The Bishop ducks.', 'silver', { on: 'visit', when: (e) => e.place === 'church' && e.low }),
    T('village_low', '🧹', 'Chimney Sweep', 'Over the village rooftops, under 30 m.', 'silver', { on: 'visit', when: (e) => e.place === 'village' && e.low }),
    T('terminal_low', '🧽', 'Window Cleaner', 'Over the terminal, under 40 m. Mind the roof.', 'silver', { on: 'visit', when: (e) => e.place === 'terminal' && e.low }),
    T('lake_low', '🌊', 'Wet Wheels', 'Over the lake, under 5 m.', 'silver', { on: 'visit', when: (e) => e.place === 'lake' && e.low }),
    T('grand_tour', '🗺️', 'Grand Tour', 'Castle, church, village, lake and terminal in one flight.', 'gold', { fstat: 'visits', target: 5 }),
  ] },
  { id: 'reign', name: 'The Long Reign', blurb: 'Hours aloft. Lots of them.', badge: '⏳', epithet: 'the Long-Reigning', tasks: [
    T('air_30m', '⏱️', 'Elevenses Aloft', '30 minutes airborne in all.', 'bronze', { stat: 'airSecs', target: 1800 }),
    T('air_2h', '🕰️', 'Afternoon Off', '2 hours airborne in all.', 'silver', { stat: 'airSecs', target: 7200 }),
    T('air_5h', '🌅', 'Weekend Warrior', '5 hours airborne in all.', 'silver', { stat: 'airSecs', target: 18000 }),
    T('air_10h', '🌙', 'Never Lands', '10 hours airborne in all.', 'gold', { stat: 'airSecs', target: 36000 }),
    T('air_50h', '♾️', 'The Long Reign', '50 hours airborne. Long may you reign.', 'gold', { stat: 'airSecs', target: 180000 }),
    T('dist_100', '🧭', 'Grand Constitutional', 'Fly 100 km in all.', 'bronze', { stat: 'distM', target: 100e3 }),
    T('dist_1000', '🌍', 'Royal Progress', 'Fly 1,000 km in all.', 'silver', { stat: 'distM', target: 1000e3 }),
    T('dist_10000', '🛰️', 'Circumnavigator (Allegedly)', 'Fly 10,000 km in all. Round and round C-Tower 1.', 'gold', { stat: 'distM', target: 10000e3 }),
    T('endurance', '🫖', 'Endurance Peer', '20 minutes airborne without touching the ground.', 'silver', { fstat: 'hopSecs', target: 1200 }),
    T('lofty', '☁️', 'Above the Riff-Raff', 'Climb to 5,000 ft.', 'silver', { stat: 'maxAlt', target: 1524 }),
  ] },
  { id: 'classics', name: 'Hangar: The Classics', blurb: 'One of each, flown properly', badge: '🛁', epithet: 'of the Bathtub', tasks: [
    T('fly_c172', '🛩️', 'Royal Runabout', 'Take off in the Royal Runabout.', 'bronze', { on: 'takeoff', when: plane('c172') }),
    T('fly_tiger', '🦋', "Grandfather's Moth", "Take off in Grandfather's Moth.", 'bronze', { on: 'takeoff', when: plane('tiger') }),
    T('fly_bathtub', '🛁', 'Royal Flying Bathtub', 'Take off in the Royal Flying Bathtub.', 'bronze', { on: 'takeoff', when: plane('bathtub') }),
    T('tiger_grass', '🌿', 'Proper Aviator', 'Land the Moth on grass, as God intended.', 'silver', { on: 'touchdown', when: plane('tiger', (e) => ok(e) && e.surface === 'grass') }),
    T('tub_butter', '🫧', 'Bubble Bath', 'Land the Bathtub under 100 fpm.', 'silver', { on: 'touchdown', when: plane('bathtub', (e) => ok(e) && e.fpm < 100) }),
    T('tub_hour', '🦆', 'Bath Time', 'One hour airborne in the Bathtub.', 'gold', { stat: 'tubSecs', target: 3600 }),
    T('moth_30', '🧣', 'Grandfather Approves', '30 minutes airborne in the Moth.', 'silver', { stat: 'mothSecs', target: 1800 }),
    T('c172_25', '🔑', 'Runabout Regular', 'Land the Runabout 25 times.', 'silver', { stat: 'c172Landings', target: 25 }),
  ] },
  { id: 'heavy', name: 'Hangar: Heavy Metal', blurb: 'Big jets, big noise', badge: '✈️', epithet: 'the Heavy', tasks: [
    T('fly_jumbo', '✈️', 'Royal Jumbo', 'Take off in the Royal Jumbo.', 'silver', { on: 'takeoff', when: plane('jumbo'), plane: 'jumbo' }),
    T('land_jumbo', '🛬', 'Jumbo, Down', 'Land the Jumbo in one piece.', 'silver', { on: 'touchdown', when: plane('jumbo', ok), plane: 'jumbo' }),
    T('butter_jumbo', '🧁', 'Four Hundred Tonnes of Butter', 'Land the Jumbo under 200 fpm.', 'gold', { on: 'touchdown', when: plane('jumbo', (e) => ok(e) && e.fpm < 200), plane: 'jumbo' }),
    T('buzz_jumbo', '🦉', 'The Owls Evacuate', 'Buzz the tower in the Jumbo.', 'gold', { on: 'infraction', when: rule('tower_buzz', plane('jumbo')), plane: 'jumbo' }),
    T('fly_herc', '🪖', 'The Royal Wardrobe', 'Take off in the Royal Wardrobe, the Hercules.', 'silver', { on: 'takeoff', when: plane('herc'), plane: 'herc' }),
    T('herc_grass', '🥔', 'Tactical Turnip', 'Land the Wardrobe on grass.', 'gold', { on: 'touchdown', when: plane('herc', (e) => ok(e) && e.surface === 'grass'), plane: 'herc' }),
    T('fly_f35', '⚡', 'Royal Tantrum', 'Take off in the Royal Tantrum, the F-35.', 'silver', { on: 'takeoff', when: plane('f35'), plane: 'f35' }),
    T('f35_fast', '💨', 'Sound Barrier-ish', 'Exceed 450 kt in the Tantrum.', 'gold', { on: 'air', when: plane('f35', (e) => e.speedKt > 450), plane: 'f35' }),
    T('f35_flypast', '🎆', 'Afterburner Flypast', 'A royal flypast down the runway in the Tantrum.', 'gold', { on: 'infraction', when: rule('low_pass', plane('f35')), plane: 'f35' }),
  ] },
  { id: 'trial', name: 'Trial by Difficulty', blurb: 'Rubber, partial, real metal', badge: '🛡️', epithet: 'the Hardened', tasks: [
    T('finish_easy', '🐣', 'Easy Does It', 'DEMAND IT to finish a flight on Easy.', 'bronze', { on: 'finished', when: (e) => e.diff === 'easy' }),
    T('finish_medium', '🍳', 'Medium Rare', 'Finish a flight on Medium.', 'bronze', { on: 'finished', when: (e) => e.diff === 'medium' }),
    T('finish_hard', '🔩', 'Real Metal', 'Finish a flight on Hard.', 'silver', { on: 'finished', when: (e) => e.diff === 'hard' }),
    T('medium_2000', '🥩', 'Well Done', 'Bank 2,000 PP in one flight on Medium.', 'silver', { on: 'banked', when: (e) => e.diff === 'medium' && e.amount >= 2000 }),
    T('hard_1000', '💎', 'Hard Currency', 'Bank 1,000 PP in one flight on Hard.', 'gold', { on: 'banked', when: (e) => e.diff === 'hard' && e.amount >= 1000 }),
    T('hard_5000', '🏦', 'Hard Cash', 'Bank 5,000 PP in one flight on Hard.', 'gold', { on: 'banked', when: (e) => e.diff === 'hard' && e.amount >= 5000 }),
    T('hard_10', '⚙️', 'Ten Real Ones', 'Finish 10 flights on Hard.', 'gold', { stat: 'hardFinishes', target: 10 }),
    T('iron_peer', '🗡️', 'Iron Peer', 'Five Hard finishes in a row without being destroyed.', 'gold', { stat: 'hardStreak', target: 5 }),
  ] },
  { id: 'peerage', name: 'The Peerage', blurb: 'The story, finished with flair', badge: '👑', epithet: 'of the Peerage', tasks: [
    ...STORY.map((m) => T(`story_${m.id}`, '📖', m.title, `Complete Mission ${m.id}, "${m.title}".`, 'silver', { on: 'story', when: (e) => e.ok && e.mission === m.id })),
    ...STORY.map((m) => T(`story_${m.id}_all`, '🏅', `${m.title}: Full Marks`, `Tick every objective in Mission ${m.id}.`, 'silver', { on: 'story', when: (e) => e.ok && e.mission === m.id && m.objectives.every((o) => e.ticks?.includes(o)) })),
    T('story_hard', '🎖️', 'Peer of the Realm', 'Complete any mission on Hard.', 'gold', { on: 'story', when: (e) => e.ok && e.diff === 'hard' }),
  ] },
  { id: 'silly', name: 'Royal Eccentricities', blurb: 'Things no sane pilot would try', badge: '🥕', epithet: 'the Eccentric', tasks: [
    T('turnip_hop', '🥕', 'Turnip Hop', 'Land in a field, then DEMAND TAKEOFF straight out of it.', 'gold', { on: 'takeoff', when: (e) => e.fromField }),
    T('topsy', '🙃', 'Topsy-Turvy', 'Five seconds upside down, in one go.', 'silver', { on: 'inverted', when: (e) => e.run >= 5 }),
    T('upside_60', '🌀', 'Antipodean Monarch', 'A full minute upside down in a single flight.', 'gold', { fstat: 'invSecs', target: 60 }),
    T('hum_along', '🎵', 'Hum Along', 'Ride the edge of the stall for ten seconds straight.', 'gold', { on: 'stall', when: (e) => e.run >= 10 }),
    T('parachute', '🪂', 'It Was Like That When I Found It', 'Get yourself destroyed. Real metal is real.', 'bronze', { on: 'destroyed' }),
    T('insurance', '🧾', 'Insurance Nightmare', 'Be destroyed 10 times.', 'silver', { stat: 'destroyed', target: 10 }),
    T('fumes', '⛽', 'Running on Fumes', 'Run the tank dry in the air.', 'bronze', { on: 'fuelempty' }),
    T('rubber_baron', '🎈', 'Rubber Baron', 'Bounce 20 times.', 'silver', { stat: 'bounces', target: 20 }),
    T('tailstrike', '🐕', 'Tail Between Your Legs', 'Scrape the tail on the runway.', 'bronze', { on: 'tailstrike' }),
    T('vne', '🏁', 'Never Exceed? Never Heard of It', "Go faster than your aircraft's never-exceed speed.", 'gold', { on: 'air', when: (e) => e.vne > 0 && e.speedKt > e.vne }),
  ] },
  { id: 'plunder', name: 'Points & Plunder', blurb: 'Privilege, banked', badge: '💰', epithet: 'the Loaded', tasks: [
    T('bank_500', '🪙', 'Pocket Money', 'Bank 500 PP in one flight.', 'bronze', { on: 'banked', when: (e) => e.amount >= 500 }),
    T('bank_2000', '💷', 'Lucrative Afternoon', 'Bank 2,000 PP in one flight.', 'silver', { on: 'banked', when: (e) => e.amount >= 2000 }),
    T('bank_10000', '💰', 'Royal Haul', 'Bank 10,000 PP in one flight.', 'gold', { on: 'banked', when: (e) => e.amount >= 10000 }),
    T('life_25k', '🏛️', 'Comfortably Off', 'Bank 25,000 PP from flights in all.', 'silver', { stat: 'bankedPP', target: 25000 }),
    T('life_100k', '🏰', 'Landed Gentry', 'Bank 100,000 PP from flights in all.', 'gold', { stat: 'bankedPP', target: 100000 }),
    T('life_500k', '🐉', 'Hoard', 'Bank 500,000 PP from flights in all. A dragon would blush.', 'gold', { stat: 'bankedPP', target: 500000 }),
    T('finish_10', '✋', 'Demanded It', 'Finish 10 flights with DEMAND IT.', 'bronze', { stat: 'finishes', target: 10 }),
    T('finish_100', '🫅', 'Demanded It, Habitually', 'Finish 100 flights with DEMAND IT.', 'silver', { stat: 'finishes', target: 100 }),
  ] },
];

// Planes still waiting for their flight model: tasks naming them show "coming soon" until data/aircraft.js says 'ready'.
export const HEAVY_PLANES = HEAVY;
