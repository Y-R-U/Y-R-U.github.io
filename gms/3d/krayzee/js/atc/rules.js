// ATC thresholds. Infraction table comes from DESIGN's data/rules.js; ATC-only extras are added here.
import { INFRACTIONS as DESIGN_INFRACTIONS, INFRACTION_COOLDOWN, GEOMETRY, OUTRAGE } from '../../data/rules.js';

export const KT = 0.514444;

export const T = {
  hz: 10,                          // detector rate
  runwayMargin: GEOMETRY.runwayMargin ?? 30,
  occupyAgl: 15,                   // within rect+margin and below this = occupying the runway
  coneLength: GEOMETRY.finalConeLength ?? 3000,
  coneAngle: GEOMETRY.finalConeAngle ?? 20,
  coneMaxAgl: GEOMETRY.finalConeMaxAgl ?? 250,
  shortFinal: GEOMETRY.shortFinal ?? 1200,
  minSeparation: GEOMETRY.minSeparation ?? 150,
  sepVertical: 60,
  cutMargin: 120,                  // must get this much closer to the threshold than the victim to count as passing
  circuitSpeed: 44, finalSpeed: 34, // m/s FLIGHT's autopilot flies (85 kt pattern, 65 kt final); turns distance into time
  finalFastSpeed: 38.6, finalSlowFrom: 2400, // a long final is flown at 75 kt until 2.4 km out
  spacingTG: 45,                   // seconds at the threshold behind a touch-and-go
  spacingFull: 60,                 // behind a full-stop lander (rollout + vacate)
  // slow types float and roll past the first exit: touchdown-to-clear measured 30 s C172, 72 s Tiger, 62 s bathtub
  spacingFullType: { tiger: 85, bathtub: 75, jumbo: 95, herc: 70, f35: 65 },
  // JETCORE: extra seconds behind a heavy's wake for anything of another type (arcade: the jumbo's wake is 'super')
  wakeSpacing: { jumbo: 40, herc: 15 },
  committedGs: { jumbo: 5, herc: 8, f35: 8 },   // m/s: past this on the takeoff roll a cleared jet is not cancelled
  spacingPlayer: 65,               // behind a human (who knows)
  minFinalGap: 22,                 // seconds; on final with less than this behind the leader = go around
  maxExtend: 5000,
  rwChangeMax: 180,                // s a runway change waits for the old runway to go quiet
  clearLandDist: 2600,             // landing clearance offered inside this remaining distance
  goAroundDist: 500,
  tgFullStopSpeed: 18,             // m/s: a touch-and-go slower than this on the runway is treated as a full stop               // no clearance by here = go around
  revokeDist: 1500,                // blocked runway with the lander further out: revoke instead of go-around
  arrivalBlockDep: 2200,           // DESIGN says 3 km; 2.2 km keeps a busy light-aircraft circuit flowing
  arrivalBlockLinedUp: 1800,       // already lined up: it rolls at once
  lineUpArrivalClear: 3000,        // line up and wait only if the next arrival is at least this far out
  lineUpBehind: 250,               // ...or behind a lander already this far down the runway
  lineUpSlack: 20,                 // s spare between the runway projected free and the arrival reaching arrivalBlockLinedUp
  depSlotWait: 0,                  // s at the hold before ATC stretches an arrival to make a gap
  depSlotNear: 450,                // ...or already this close to the hold while taxiing out
  depSlot: 130,                    // seconds opened behind the leader for a waiting departure
  vacateSpeed: 7, vacateTurn: 8,   // m/s and s: how runwayBusyFor projects a lander rolling/taxiing off the runway
  depAfterFree: 85,                // ...and at least this long after the runway is projected free of rolling/vacating landers
  depSpacing: 1500,                // previous departure/touch-and-go this far down the runway before the next roll
  mutexRelease: 60,                // past the intersection by this many metres (or above mutexAlt)
  mutexAlt: 150,
  placeGrace: 60,                  // s after the game places a plane during which it is never the cause of a go-around
  taxiReleaseGap: 25,              // s between taxi clearances
  maxOutbound: 4,
  crossApproach: 150,              // offer the crossing clearance inside this distance of the hold point
  holdReached: 35,
  standReached: 12,
  regionRadius: 8000, regionAlt: 1500,
  // DESIGN §1.2 detector numbers
  unauthTakeoffKt: 35, doubleOccKt: 40, taxiSpeedKt: 30, taxiSpeedSecs: 2,
  buzzDist: 80, buzzAbove: 40, buzzClose: 30,
  terminalAgl: 40,
  lowPassAgl: [1, 6], lowPassVrMult: 1.2, lowPassDist: 400,
  formationDist: 40, formationSecs: 3, formationCap: 13,
  nearMiss: 25, contact: 6,
  standStopSecs: 3,
  ignoredSecs: 8,
  wrongWayDeg: 120,
  intersectionR: 25,
  // ATC extras
  hardLandingFpm: 600,
  impeccable: { centreline: 5, zone: 450, sinkFpm: 300 },
};

const EXTRA = {
  unauth_landing:   { name: 'Uninvited Landing', pp: 0, outrage: 12, scold: 'scold_landing', extra: true },
  runway_incursion: { name: 'Wandered On',       pp: 0, outrage: 6,  scold: 'scold_runway', extra: true },
  hard_landing:     { name: 'Arrived Firmly',    pp: 0, outrage: 0,  scold: null, extra: true },
  collision:        { name: 'Contact',           pp: 0, outrage: 8,  scold: 'scold_bump', extra: true },
  separation_loss:  { name: 'Too Close',         pp: 0, outrage: 4,  scold: 'scold_near_miss', extra: true },
  impeccable:       { name: 'Impeccable',        pp: 50, outrage: -10, scold: null, extra: true, good: true },
};

export const INFRACTIONS = { ...EXTRA, ...DESIGN_INFRACTIONS };
export const COOLDOWN = INFRACTION_COOLDOWN ?? 30;

export const TIERS = (OUTRAGE?.tiers || [{ tier: 1, min: 0 }, { tier: 2, min: 25 }, { tier: 3, min: 50 }, { tier: 4, min: 80 }]);
export const TIER_NAMES = ['calm', 'strained', 'cracking', 'meltdown'];
export const OUTRAGE_CFG = {
  max: OUTRAGE?.max ?? 100,
  decayPerSec: (OUTRAGE?.decayPer3s ?? 1) / 3,
  calmDelay: 6,
  hysteresis: 4,
  scandalReset: OUTRAGE?.scandal?.resetTo ?? 60,
  scandalFrozen: OUTRAGE?.scandal?.frozenFor ?? 60,
};

// Routine tower line ids (DESIGN §5.5) per command type.
export const LINE = {
  taxi: 'taxi', crossRunway: 'taxi', lineUpWait: 'lineup', clearedTakeoff: 'clear_takeoff', holdPosition: 'hold_short',
  cancelTakeoff: 'hold_short', vacate: 'vacate', joinCircuit: 'traffic', sequence: 'sequence', extendDownwind: 'extend',
  clearedLand: 'clear_land', clearedTouchAndGo: 'clear_land', goAround: 'go_around',
};
