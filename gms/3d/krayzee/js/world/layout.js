// Facade over the active airport (data/airports/<id>.js, schema in docs/AIRPORTS.md §3). Every export below is a live
// binding: setAirport()/useAirport() reassign them all and bump LAYOUT_REV, so `import { RUNWAYS }` keeps working.
// Code that copies a value at import time does not follow a switch; subscribe with onLayoutChange(fn) instead.
// World frame: 1 unit = 1 m, +Y up, +X east, -Z north. Heading degrees: 0 = north (-Z), 90 = east (+X).
import royal from '../../data/airports/royal.js';

export const AIRPORT_DEFS = { royal };
export let AIRPORT = null;
export let LAYOUT_REV = 0;

export let ELEV, RUNWAYS, TAXIWAY_WIDTH, TAXIWAYS, APRON, TERMINAL, TOWER, STANDS, PATTERN_ALT, HOLD_OFFSET, CIRCUIT;

const subs = new Set();
export function onLayoutChange(fn) { subs.add(fn); return () => subs.delete(fn); }

export function useAirport(def) {
  AIRPORT = def;
  ELEV = def.elev ?? 0;
  RUNWAYS = def.runways;
  TAXIWAY_WIDTH = def.taxiwayWidth ?? 15;
  TAXIWAYS = def.taxiways;
  APRON = def.aprons?.[0] ?? null;
  TERMINAL = def.terminal;
  TOWER = def.tower;
  STANDS = def.stands;
  PATTERN_ALT = def.patternAlt ?? 300;
  HOLD_OFFSET = def.holdOffset ?? 50;
  CIRCUIT = def.circuits ?? {};
  LAYOUT_REV++;
  for (const fn of subs) fn(def);
  return def;
}

export function registerAirport(def) { AIRPORT_DEFS[def.id] = def; return def; }
export function setAirport(id) {
  const def = AIRPORT_DEFS[id];
  if (!def) throw new Error(`unknown airport ${id}`);
  return def === AIRPORT ? def : useAirport(def);
}

export function headingToVec(deg) {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r), -Math.cos(r)];
}

// World XZ of a runway threshold (the end you land on / start the takeoff roll from).
export function threshold(rw, end) {
  const [dx, dz] = headingToVec(rw.heading);
  const s = end === rw.ends[0] ? -1 : 1;
  return [rw.center[0] + dx * s * rw.length / 2, rw.center[2] + dz * s * rw.length / 2];
}

export function runwayHeadingFor(rw, end) {
  return end === rw.ends[0] ? rw.heading : (rw.heading + 180) % 360;
}

useAirport(royal);
