// Scoring, infractions, outrage, protection. Spec: docs/DESIGN.md §1–2. Distances m, speeds kt, times s.

export const AUTOPILOT = { deadZone: 0.08, releaseDelay: 1.5, blendTime: 2.0 };

export const BANK = { stopSpeedKt: 2, stopTime: 2 };

export const GEOMETRY = {
  holdLineFromCentreline: 50,
  runwayMargin: 30,          // runway rect padding for "on the runway"
  finalConeLength: 3000,
  finalConeAngle: 20,
  finalConeMaxAgl: 250,
  shortFinal: 1200,
  minSeparation: 150,
  trafficAdvisory: 600,
};

// detect: a short machine-readable hint for the detector author; the prose spec is in DESIGN.md §1.2.
export const INFRACTIONS = {
  queue_jump:        { name: 'Pushed In',             pp: 150, perVictim: true, outrage: 10, scold: 'scold_queue',   detect: 'enter runway rect while >=1 plane ahead in departure queue' },
  unauth_takeoff:    { name: "Didn't Ask",            pp: 200, outrage: 12, scold: 'scold_takeoff', detect: 'gs > 35kt on runway rect, clearance != takeoff' },
  cut_in_final:      { name: 'Cut In',                pp: 300, closeBonus: { gap: 400, mult: 1.5 }, outrage: 15, scold: 'scold_cut', detect: 'in final cone, now ahead of a plane sequenced before you' },
  forced_goaround:   { name: 'Sent Round',            pp: 250, perVictim: true, outrage: 8, scold: 'scold_cut', detect: 'AI given goaround because of player' },
  runway_steal:      { name: 'Runway Thief',          pp: 350, outrage: 15, scold: 'scold_runway', detect: 'enter runway rect while other on takeoff roll or short final' },
  taxiway_landing:   { name: 'Taxiway Touchdown',     pp: 400, outrage: 20, scold: 'scold_landing', detect: "touchdown surface 'taxiway'" },
  grass_landing:     { name: 'Country Squire',        pp: 250, outrage: 10, scold: 'scold_landing', detect: "touchdown surface 'grass', not destroyed" },
  apron_landing:     { name: 'Valet Parking',         pp: 600, outrage: 25, scold: 'scold_landing', detect: "touchdown surface 'apron'" },
  wrong_way:         { name: 'Wrong Way, Your Grace', pp: 350, outrage: 15, scold: 'scold_landing', detect: 'touchdown/takeoff roll heading > 120deg off active' },
  closed_runway:     { name: 'Private Runway',        pp: 200, outrage: 8, scold: 'scold_landing', detect: 'touchdown on a closed runway' },
  tower_buzz:        { name: 'Tower Buzz',            pp: 300, closeBonus: { dist: 30, mult: 2 }, outrage: 15, scold: 'scold_buzz', detect: 'horiz dist to tower < 80 and alt < tower.height + 40' },
  terminal_buzz:     { name: 'Window Rattler',        pp: 200, outrage: 10, scold: 'scold_buzz', detect: 'over terminal footprint, agl < 40' },
  low_pass:          { name: 'Royal Flypast',         pp: 250, outrage: 8, scold: 'scold_buzz', detect: 'over runway, agl 1..6, speed > 1.2*Vr, no touchdown, >= 400 m' },
  formation:         { name: 'Uninvited Formation',   pp: 100, perSecond: 30, cap: 400, outrage: 5, scold: 'scold_near_miss', cooldownPerVictim: true, detect: 'airborne within 40 m of another plane >= 3 s' },
  near_miss:         { name: 'Near Miss',             pp: 200, realisticMult: 1.5, outrage: 12, scold: 'scold_near_miss', detect: 'closest approach < 25 m, both airborne, no contact' },
  taxi_speeding:     { name: 'Taxi Speeding',         pp: 80, outrage: 4, scold: 'scold_generic', detect: 'gs > 30kt on taxiway/apron >= 2 s' },
  stand_steal:       { name: 'Stand Steal',           pp: 150, outrage: 6, scold: 'scold_generic', detect: "stopped 3 s on another plane's stand" },
  ignored_instruction:{ name: 'Selective Hearing',    pp: 120, outrage: 10, scold: 'scold_generic', refusedWindow: 90, detect: 'still violating goaround/hold 8 s after instruction; or autopilot goaroundrefused (LAND) — scored once per go-around' },
  double_occupancy:  { name: 'Shared Runway',         pp: 300, outrage: 15, scold: 'scold_runway', detect: 'two planes on same runway rect, one > 40kt, player involved' },
  // D28: SCORE-side (from reportImpact), never an ATC detector. Easy/Medium only, and only when protection bounced it.
  light_touch:       { name: 'Love Tap',              pp: 150, outrage: 8, scold: 'scold_bump', maxRelKt: 12, minOwnKt: 5, pairCooldown: 30, detect: 'plane-to-plane contact, relative speed <= 12 kt, own gs >= 5 kt, result bounce; 30 s per pair' },
  intersection_dash: { name: 'Crossroads',            pp: 200, outrage: 10, scold: 'scold_runway', detect: '09/27 x 04/22 intersection crossed while other plane on either runway' },
};
export const INFRACTION_COOLDOWN = 30;

export const CLEAN = {
  impeccable: { pp: 50, centreline: 5, touchdownZone: 450, maxSinkFpm: 300, outrage: -10 },
};

export const BANTER = { riposte: 40, quickRiposte: { within: 2, pp: 80 }, priorityReply: { pp: 60, outrage: 5 } };

export const MULTIPLIERS = {
  comboWindow: 20,
  combo: [1.0, 1.25, 1.5, 2.0, 2.5],
  audacityPerRank: 0.1, audacityMax: 1.8,
  outrageDivisor: 200, outrageMax: 1.5,
  roundTo: 10,
};

export const OUTRAGE = {
  max: 100,
  tiers: [ { tier: 1, min: 0, name: 'Professional' }, { tier: 2, min: 25, name: 'Strained' }, { tier: 3, min: 50, name: 'Cracking' }, { tier: 4, min: 80, name: 'Meltdown' } ],
  decayPer3s: 1,
  scandal: { pendingForfeit: 0.25, frozenFor: 60, resetTo: 60, headlineSecs: 3 },
};

export const PROTECTION = {
  rubber:    { name: 'Rubber',    restitution: 0.55, spinMaxDegPerS: 120, apResumeAfter: 2, pendingLoss: 0.15, outrage: 8 },
  partial:   { name: 'Partial',   startPct: 100, lossPerKt: 0.8, lossMin: 5, lossMax: 60, restitutionAt100: 0.55, restitutionAt10: 0.1, refillAtStand: 100, refillOnBank: 25 },
  realistic: { name: 'Realistic', destroyAboveKt: 15, prang: { shake: 1.5, pendingLoss: 0.1, outrage: 10 },
               gearLimits: { maxSinkFpm: 900, maxBankDeg: 25, minPitchDeg: -5, maxPitchDeg: 18 },
               destroyed: { pendingLoss: 1.0, gagSecs: 4 } },
};

export const DIFFICULTY = {
  easy:   { protection: 'rubber',    outrageGain: 0.75, ai: 'yields',  scandalFails: 'never',      targetMult: 0.7, contact: 'light' },
  medium: { protection: 'partial',   outrageGain: 1.0,  ai: 'holds',   scandalFails: 'flagged',    targetMult: 1.0, contact: 'light' },
  hard:   { protection: 'realistic', outrageGain: 1.25, ai: 'blocks',  scandalFails: 'always',     targetMult: 1.3, contact: 'none' },
};

export const RADIO = {
  priority: { tower: 3, player: 2, human: 2, ai: 1 },
  staleAfter: 3, towerClearanceStaleAfter: 8,
  aiChatterGap: { light: 10, busy: 6, chaos: 6 },
  playerCooldown: 6, sameIntentCooldown: 15,
  responseWindow: 5, inboundWindowGap: 8,
  scoldDelay: [0.6, 1.2], scoldReplaceWithin: 4,
  aiChance: { complain: 0.6, insult: 0.35, rivalInsult: 0.7, routine: 1.0 },
};
