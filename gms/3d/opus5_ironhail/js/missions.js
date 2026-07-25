// The campaign. Twenty missions in four acts, each one a data record the
// battle runner turns into a battlefield. Also the generator for one-off Tank
// Attack contracts and the daily.

import { mulberry32, hashStr, clamp } from './utils.js';
import { ENEMY_NAMES } from './config.js';

const foe = (role, chassis, weapon, skill, count = 1) =>
  ({ role, chassis, weapon, skill, count });

export const ACTS = [
  { id: 1, name: 'THE DUST LINE', biome: 'desert',
    blurb: 'Nine weeks without rain and the pumps run dry. Somebody is buying guns.' },
  { id: 2, name: 'HARVEST COUNTRY', biome: 'farmland',
    blurb: 'The war rolls into the last country still growing food.' },
  { id: 3, name: 'WINTERREACH', biome: 'tundra',
    blurb: 'North, where the Consortium keeps the things it does not talk about.' },
  { id: 4, name: 'THE ASHWORKS', biome: 'industrial',
    blurb: 'Where they build the tanks. Where it ends.' },
];

export const MISSIONS = [
  // ---------------- ACT I ----------------
  {
    id: 'a1m1', act: 1, name: 'DUST AND DEBTS', time: 'dawn', biome: 'desert',
    seed: 11001, weather: 'dust',
    brief: 'Anvil Control found you a buyer for your last favour: two Consortium ' +
      'scouts sitting on a dry well outside Kestrel Flats. Put your drone up first — ' +
      'it is the only reason you will see them before they see you.',
    debrief: 'Two hulls burning at dawn and a well nobody owns. Anvil says there is more work.',
    objective: { kind: 'destroy_all' },
    enemies: [foe('line', 'scout', 'ap76', 0.24, 2)],
    par: 100, bpBase: 180, intel: 'Hold Q (or tap DRONE) for the uplink view. Contacts stay marked for five seconds.',
    density: 0.7,
  },
  {
    id: 'a1m2', act: 1, name: 'THE WELL ROAD', time: 'morning', biome: 'desert',
    seed: 11002,
    brief: 'A Consortium picket is dug in along the well road with a spotter on the ' +
      'high ground. Four hulls. They will hold their range and make you come to them.',
    debrief: 'The road is open. It leads somewhere worse.',
    objective: { kind: 'destroy_all' },
    enemies: [foe('line', 'mainline', 'ap76', 0.3, 3), foe('sniper', 'scout', 'ap76', 0.34, 1)],
    par: 150, bpBase: 240, unlock: { kind: 'weapons', id: 'twin30' },
    intel: 'Shots fired on the move scatter. Stop, let the reticle settle, then fire.',
  },
  {
    id: 'a1m3', act: 1, name: 'TANKER ROW', time: 'noon', biome: 'desert',
    seed: 11003,
    brief: 'Three fuel bowsers under guard in the open at noon. Burn the bowsers. ' +
      'A high-explosive shell near a full drum does most of the arguing for you.',
    debrief: 'Six thousand litres of somebody else\'s diesel, gone up in a column you could see from town.',
    objective: { kind: 'demolish', goal: 3, propKind: 'silo', label: 'BOWSERS' },
    enemies: [foe('guard', 'mainline', 'ap76', 0.32, 3)],
    par: 130, bpBase: 260, extraProps: { drum: 12 },
    intel: 'Fuel drums chain-detonate. Park one shell in the middle of a cluster.',
  },
  {
    id: 'a1m4', act: 1, name: 'GLASS AND WIRE', time: 'golden', biome: 'desert',
    seed: 11004,
    brief: 'Anvil wants a Consortium relay mast left standing but its garrison gone — ' +
      'six hulls, rolling in two waves. Use the ruins. Break their line of sight while you reload.',
    debrief: 'You kept the mast. Anvil never says why they want these things.',
    objective: { kind: 'destroy_count', goal: 6, waves: 2 },
    enemies: [foe('brawler', 'scout', 'twin30', 0.36, 2), foe('line', 'mainline', 'ap76', 0.36, 4)],
    par: 210, bpBase: 320, unlock: { kind: 'weapons', id: 'he120' },
    intel: 'Rear armour takes over half again as much damage. Circle them.',
  },
  {
    id: 'a1m5', act: 1, name: 'THE FLATS AT NIGHT', time: 'night', biome: 'desert',
    seed: 11005,
    brief: 'A Consortium column is crossing the flats after dark and they have a ' +
      'heavy with them. Nothing subtle here. Kill the column.',
    debrief: 'Marshal Voss now knows your callsign. That cuts both ways.',
    objective: { kind: 'destroy_all' },
    enemies: [foe('line', 'mainline', 'ap76', 0.4, 3), foe('sniper', 'mainline', 'he120', 0.42, 1),
      foe('brawler', 'siege', 'he120', 0.44, 1)],
    par: 230, bpBase: 420, unlock: { kind: 'chassis', id: 'scout' },
    intel: 'At night muzzle flashes give away position — theirs and yours.',
  },

  // ---------------- ACT II ----------------
  {
    id: 'a2m1', act: 2, name: 'STUBBLE AND SMOKE', time: 'golden', biome: 'farmland',
    seed: 12001,
    brief: 'The Consortium is requisitioning grain at gunpoint two valleys over. ' +
      'Four hulls in the stubble fields. The hedgerows and bales are cover — until they are not.',
    debrief: 'The farm keeps its harvest. For this season.',
    objective: { kind: 'destroy_all' },
    enemies: [foe('line', 'mainline', 'ap76', 0.44, 2), foe('flanker', 'scout', 'twin30', 0.46, 2)],
    par: 160, bpBase: 380,
    intel: 'Cover is destructible. So is theirs — dig them out with high explosive.',
  },
  {
    id: 'a2m2', act: 2, name: 'HOLD THE CROSSING', time: 'dusk', biome: 'farmland',
    seed: 12002,
    brief: 'Refugee convoys need the river crossing for another two minutes. ' +
      'Stand on it. They will keep coming.',
    debrief: 'Everyone got across. You are still counting the dents.',
    objective: { kind: 'hold', goal: 105, zoneR: 24 },
    enemies: [foe('brawler', 'mainline', 'ap76', 0.46, 3), foe('line', 'mainline', 'he120', 0.48, 3)],
    par: 150, bpBase: 440, unlock: { kind: 'utilities', id: 'emp' },
    intel: 'You must stay inside the marked circle. Repair charges are for exactly this.',
  },
  {
    id: 'a2m3', act: 2, name: 'THE SILO LINE', time: 'storm', biome: 'farmland',
    seed: 12003,
    brief: 'Four grain silos are being used as ammunition stores. Level them in the ' +
      'rain while a full company objects.',
    debrief: 'Lightning, thunder, and four silos coming down like felled trees.',
    objective: { kind: 'demolish', goal: 4, propKind: 'silo', label: 'AMMO SILOS' },
    enemies: [foe('line', 'mainline', 'ap76', 0.5, 4), foe('sniper', 'mainline', 'he120', 0.5, 1)],
    par: 200, bpBase: 480, extraProps: { silo: 3, drum: 8 },
    intel: 'A mortar drops behind cover. Nothing on this field is safe from above.',
  },
  {
    id: 'a2m4', act: 2, name: 'QUIET IN THE TREES', time: 'dawn', biome: 'forest',
    seed: 12004,
    brief: 'Reconnaissance only. Get the drone over six hulls in the Greenbelt and ' +
      'mark them for Anvil. You are not paid to be seen.',
    debrief: 'Six positions logged. Somebody else will use that map.',
    objective: { kind: 'recon', goal: 6 },
    enemies: [foe('guard', 'mainline', 'ap76', 0.5, 3), foe('sniper', 'scout', 'ap76', 0.52, 3)],
    par: 170, bpBase: 460, unlock: { kind: 'weapons', id: 'mortar' },
    intel: 'Fly the drone forward while your hull sits still. Marks count once each.',
  },
  {
    id: 'a2m5', act: 2, name: 'BREAKER OF FIELDS', time: 'dusk', biome: 'farmland',
    seed: 12005,
    brief: 'Voss sent a siege hull called BREAKER to flatten the valley. It is slow, ' +
      'it is enormous, and it has an escort. End it.',
    debrief: 'BREAKER is a crater. Voss will send something worse.',
    objective: { kind: 'boss' },
    enemies: [foe('line', 'mainline', 'he120', 0.52, 3)],
    boss: { name: 'BREAKER', chassis: 'siege', weapon: 'he120', skill: 0.55, hpMul: 3.4 },
    par: 240, bpBase: 700, unlock: { kind: 'chassis', id: 'siege' },
    intel: 'Heavies traverse slowly. Stay on the flank it cannot bring the gun round to.',
  },

  // ---------------- ACT III ----------------
  {
    id: 'a3m1', act: 3, name: 'WINTERREACH', time: 'dawn', biome: 'tundra',
    seed: 13001,
    brief: 'North, onto the ice pans. A Consortium listening post with five hulls ' +
      'and nowhere to hide on either side.',
    debrief: 'The post is silent. Whatever it was listening for, it heard you.',
    objective: { kind: 'destroy_all' },
    enemies: [foe('line', 'mainline', 'ap76', 0.55, 3), foe('sniper', 'mainline', 'rail', 0.56, 2)],
    par: 200, bpBase: 620, unlock: { kind: 'utilities', id: 'mines' },
    intel: 'Snow shows tracks. So does a stationary tank. Keep moving between shots.',
  },
  {
    id: 'a3m2', act: 3, name: 'THE LONG CONVOY', time: 'storm', biome: 'tundra',
    seed: 13002,
    brief: 'A fuel hauler has to reach the far ridge. Keep it alive. It does not ' +
      'shoot back and it does not go faster.',
    debrief: 'The hauler made the ridge with its paint scratched. That counts.',
    objective: { kind: 'escort', hp: 320 },
    enemies: [foe('flanker', 'scout', 'twin30', 0.56, 3), foe('line', 'mainline', 'he120', 0.58, 3)],
    par: 180, bpBase: 680,
    intel: 'Interpose your hull. Front armour is your best plate — face the threat.',
  },
  {
    id: 'a3m3', act: 3, name: 'NIGHT ON THE PANS', time: 'night', biome: 'tundra',
    seed: 13003,
    brief: 'Seven hulls, moonlight, and a company that knows you are coming. ' +
      'Two waves. Survive both.',
    debrief: 'Seven wrecks in the snow, cooling to the same temperature as everything else.',
    objective: { kind: 'destroy_count', goal: 7, waves: 2 },
    enemies: [foe('brawler', 'scout', 'twin30', 0.58, 3), foe('line', 'mainline', 'ap76', 0.6, 3),
      foe('artillery', 'siege', 'mortar', 0.6, 1)],
    par: 250, bpBase: 760, unlock: { kind: 'weapons', id: 'rockets' },
    intel: 'Artillery hulls sit right at the back. Kill them first or keep moving.',
  },
  {
    id: 'a3m4', act: 3, name: 'TWELVE MINUTES', time: 'storm', biome: 'tundra',
    seed: 13004,
    brief: 'Anvil\'s people need two minutes to pull data out of a buried vault. ' +
      'You are the two minutes.',
    debrief: 'They got the files. You got the rest of the war explained to you.',
    objective: { kind: 'survive', goal: 120 },
    enemies: [foe('brawler', 'mainline', 'ap76', 0.6, 3), foe('flanker', 'scout', 'twin30', 0.62, 3),
      foe('line', 'siege', 'he120', 0.62, 2)],
    par: 120, bpBase: 820, unlock: { kind: 'weapons', id: 'rail' },
    intel: 'You do not have to win. You have to be there at the end.',
  },
  {
    id: 'a3m5', act: 3, name: 'HOARFROST', time: 'night', biome: 'tundra',
    seed: 13005,
    brief: 'HOARFROST is a railgun destroyer that has killed four of Anvil\'s crews ' +
      'at over four hundred metres. It is out there in the dark. So are its wingmen.',
    debrief: 'You closed the distance it was built to keep. That was the whole trick.',
    objective: { kind: 'boss' },
    enemies: [foe('sniper', 'mainline', 'rail', 0.62, 2), foe('flanker', 'scout', 'twin30', 0.62, 2)],
    boss: { name: 'HOARFROST', chassis: 'hunter', weapon: 'rail', skill: 0.68, hpMul: 3.0 },
    par: 260, bpBase: 1150, unlock: { kind: 'chassis', id: 'hunter' },
    intel: 'Railguns fire flat and fast. Break the line — put scenery between you.',
  },

  // ---------------- ACT IV ----------------
  {
    id: 'a4m1', act: 4, name: 'THE ASHWORKS GATE', time: 'dusk', biome: 'industrial',
    seed: 14001,
    brief: 'The foundry that builds Consortium armour has one road in, and six hulls ' +
      'on it. Take the gate.',
    debrief: 'You are inside the wire. Nobody has been inside the wire.',
    objective: { kind: 'destroy_all' },
    enemies: [foe('guard', 'siege', 'he120', 0.64, 2), foe('line', 'mainline', 'ap76', 0.66, 3),
      foe('sniper', 'hunter', 'rail', 0.66, 1)],
    par: 240, bpBase: 980, unlock: { kind: 'weapons', id: 'cluster' },
    intel: 'Concrete walls stop shells until they do not. Cluster shells clear a yard fast.',
  },
  {
    id: 'a4m2', act: 4, name: 'FOUNDRY FLOOR', time: 'night', biome: 'industrial',
    seed: 14002,
    brief: 'Six casting furnaces feed the Consortium\'s tank lines. Destroy them ' +
      'while the foundry garrison fights for its livelihood.',
    debrief: 'The furnaces are cold. It will take them a year to pour again.',
    objective: { kind: 'demolish', goal: 6, propKind: 'silo', label: 'FURNACES' },
    enemies: [foe('brawler', 'mainline', 'twin30', 0.66, 4), foe('line', 'siege', 'he120', 0.68, 2)],
    par: 230, bpBase: 1050, extraProps: { silo: 5, drum: 14, container: 8 },
    intel: 'Everything in here is flammable. Mind where you park.',
  },
  {
    id: 'a4m3', act: 4, name: 'CINDER FLATS', time: 'dusk', biome: 'volcanic',
    seed: 14003,
    brief: 'Voss is moving his command element across the cinder flats under ash-fall. ' +
      'Nine hulls in three waves. Break the escort.',
    debrief: 'His escort is gone. He is somewhere ahead, alone, and furious.',
    objective: { kind: 'destroy_count', goal: 9, waves: 3 },
    enemies: [foe('flanker', 'scout', 'twin30', 0.68, 3), foe('line', 'mainline', 'ap76', 0.7, 4),
      foe('artillery', 'siege', 'mortar', 0.7, 2)],
    par: 290, bpBase: 1250,
    intel: 'Ash-fall hides you both. Trust the uplink over your eyes.',
  },
  {
    id: 'a4m4', act: 4, name: 'THE LAST PUMPHOUSE', time: 'storm', biome: 'industrial',
    seed: 14004,
    brief: 'The Consortium is about to blow the aquifer pumps rather than surrender ' +
      'them. Hold the pumphouse yard for three minutes until Anvil\'s engineers land.',
    debrief: 'The water stays. That is the entire war, in one yard.',
    objective: { kind: 'hold', goal: 150, zoneR: 26 },
    enemies: [foe('brawler', 'mainline', 'ap76', 0.7, 4), foe('line', 'hunter', 'rail', 0.72, 2),
      foe('artillery', 'siege', 'mortar', 0.72, 2)],
    par: 190, bpBase: 1400, unlock: { kind: 'utilities', id: 'strike' },
    intel: 'A drone strike does not care what is between you and them. Paint and call.',
  },
  {
    id: 'a4m5', act: 4, name: 'LEVIATHAN', time: 'night', biome: 'volcanic',
    seed: 14005,
    brief: 'Marshal Voss commands LEVIATHAN: a command hull built out of three tanks ' +
      'and every lesson he learned watching you work. He is waiting on the cinder ' +
      'flats with his last guard. End the war.',
    debrief: 'The flats are quiet. Anvil Control has nothing scheduled. For the first ' +
      'time in nine weeks, neither do you.',
    objective: { kind: 'boss' },
    enemies: [foe('line', 'hunter', 'rail', 0.72, 2), foe('brawler', 'siege', 'he120', 0.74, 2),
      foe('artillery', 'siege', 'mortar', 0.74, 1)],
    boss: { name: 'LEVIATHAN', chassis: 'siege', weapon: 'cluster', skill: 0.8, hpMul: 5.5 },
    par: 330, bpBase: 2600,
    intel: 'It changes rhythm. When the barrage starts, stop shooting and start moving.',
    finale: true,
  },
];

export const MISSION_BY_ID = {};
for (const m of MISSIONS) MISSION_BY_ID[m.id] = m;

export function missionsOfAct(act) {
  return MISSIONS.filter((m) => m.act === act);
}

export function missionIndex(id) {
  return MISSIONS.findIndex((m) => m.id === id);
}

// A mission is available once the one before it has a star.
export function missionUnlocked(m, campaign) {
  const i = missionIndex(m.id);
  if (i <= 0) return true;
  const prev = MISSIONS[i - 1];
  return !!(campaign[prev.id] && campaign[prev.id].stars > 0);
}

// ---------------------------------------------------------------------------
// Tank Attack — procedurally generated single contracts, scaled to the player
// ---------------------------------------------------------------------------

const BIOME_KEYS = ['desert', 'farmland', 'tundra', 'forest', 'industrial', 'volcanic'];
const TIME_KEYS = ['dawn', 'morning', 'noon', 'golden', 'dusk', 'night', 'storm'];
const ROLE_KEYS = ['brawler', 'line', 'sniper', 'flanker', 'artillery'];
const ENEMY_GUNS = ['ap76', 'twin30', 'he120', 'mortar', 'rockets', 'rail'];
const ENEMY_HULLS = ['scout', 'mainline', 'siege', 'hunter'];

export const SKIRMISH_TIERS = [
  { id: 0, name: 'PATROL',   count: 3, skill: 0.32, bp: 150,  scrap: 220 },
  { id: 1, name: 'RAID',     count: 4, skill: 0.44, bp: 260,  scrap: 340 },
  { id: 2, name: 'ASSAULT',  count: 5, skill: 0.55, bp: 420,  scrap: 520 },
  { id: 3, name: 'ONSLAUGHT',count: 7, skill: 0.66, bp: 680,  scrap: 780 },
  { id: 4, name: 'GAUNTLET', count: 9, skill: 0.78, bp: 1080, scrap: 1150 },
  { id: 5, name: 'LEGEND',   count: 11, skill: 0.9, bp: 1750, scrap: 1700 },
];

export function makeSkirmish(tierId, seed, { daily = false } = {}) {
  const tier = SKIRMISH_TIERS[clamp(tierId, 0, SKIRMISH_TIERS.length - 1)];
  const rng = mulberry32(seed);
  const biome = BIOME_KEYS[Math.floor(rng() * BIOME_KEYS.length)];
  const time = TIME_KEYS[Math.floor(rng() * TIME_KEYS.length)];

  const enemies = [];
  let left = tier.count;
  while (left > 0) {
    const n = Math.min(left, 1 + Math.floor(rng() * 3));
    const role = ROLE_KEYS[Math.floor(rng() * ROLE_KEYS.length)];
    const hull = ENEMY_HULLS[Math.floor(rng() * ENEMY_HULLS.length)];
    const gun = ENEMY_GUNS[Math.floor(rng() * ENEMY_GUNS.length)];
    enemies.push(foe(role, hull, gun, tier.skill + (rng() - 0.5) * 0.08, n));
    left -= n;
  }
  const nameA = ENEMY_NAMES[Math.floor(rng() * ENEMY_NAMES.length)];

  return {
    id: (daily ? 'daily-' : 'skirmish-') + seed,
    skirmish: true, daily, tier: tier.id,
    name: daily ? 'DAILY CONTRACT' : tier.name + ' · ' + nameA + ' SECTOR',
    time, biome, weather: null, seed,
    brief: daily
      ? 'Today\'s contract from Anvil Control. One run, double battle points.'
      : `A Consortium ${tier.name.toLowerCase()} force is holding this sector. Clear it.`,
    objective: { kind: 'destroy_all' },
    enemies,
    par: 60 + tier.count * 28,
    bpBase: Math.round(tier.bp * (daily ? 2 : 1)),
    scrapBase: tier.scrap,
    density: 1,
    intel: null,
  };
}

// Recommend a tier from the commander's level so the menu is not a guess.
export function suggestedTier(level) {
  return clamp(Math.floor((level - 1) / 3), 0, SKIRMISH_TIERS.length - 1);
}

export function dailySeed(dayKey) {
  return hashStr('ironhail-daily-' + dayKey) % 1000000;
}
