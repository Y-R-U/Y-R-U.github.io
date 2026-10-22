// Facade over the active airport (data/airports/<id>.js, schema in docs/AIRPORTS.md §3). Every export below is a live
// binding: setAirport()/useAirport() reassign them all and bump LAYOUT_REV, so `import { RUNWAYS }` keeps working.
// Code that copies a value at import time does not follow a switch; subscribe with onLayoutChange(fn) instead.
// World frame: 1 unit = 1 m, +Y up, +X east, -Z north. Heading degrees: 0 = north (-Z), 90 = east (+X).
import royal from '../../data/airports/royal.js';

export const AIRPORT_DEFS = { royal };
export let AIRPORT = null;
export let LAYOUT_REV = 0;

export let ELEV, RUNWAYS, TAXIWAY_WIDTH, TAXIWAYS, APRON, TERMINAL, TOWER, STANDS, PATTERN_ALT, HOLD_OFFSET, CIRCUIT, PARALLEL;

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
  PARALLEL = def.parallel ?? def.taxiways[0]?.id ?? null;   // the main parallel taxiway (C-Tower 1: 'A')
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

// Literal-free defaults for code that used '09' / '27' / 'A' (docs/AIRPORTS.md §7).
const canDepart = (rw, end) => rw.departures !== false && !rw.closed && (!rw.oneWay || rw.oneWay.depart === end);
export function departureEnds(def = AIRPORT) { return def.runways.flatMap((rw) => rw.ends.filter((e) => canDepart(rw, e))); }
// The end the default wind favours (what ATC picks before any setWind), else the first departure end.
export function defaultEnd(def = AIRPORT) {
  const w = def.wind, ends = departureEnds(def);
  if (!w) return ends[0] ?? def.runways[0]?.ends[0] ?? null;
  let best = ends[0], bh = -Infinity;
  for (const rw of def.runways) for (const e of rw.ends) {
    if (!ends.includes(e)) continue;
    const h = Math.cos(((w.from - runwayHeadingFor(rw, e)) * Math.PI) / 180);
    if (h > bh + 1e-6) { bh = h; best = e; }
  }
  return best;
}
// Host runway picker: 'wind' plus every runway end of the airport.
export function runwayOptions(def = AIRPORT) { return ['wind', ...def.runways.flatMap((rw) => rw.ends)]; }
// Inside an apron footprint (rotated by its heading; margin in metres).
export function inApron(x, z, m = 0, def = AIRPORT) {
  return (def.aprons || []).some((a) => {
    const r = ((a.heading || 0) * Math.PI) / 180, dx = x - a.center[0], dz = z - a.center[2];
    const u = dx * Math.cos(r) + dz * Math.sin(r), v = -dx * Math.sin(r) + dz * Math.cos(r);
    return Math.abs(u) <= a.size[0] / 2 + m && Math.abs(v) <= a.size[1] / 2 + m;
  });
}

useAirport(royal);
