// D29 Kingdom Map: every airport placed in kingdom km (+x east, +z south, C-Tower 1 at 0,0). One is loaded at a time;
// any airport can be flown to through a magic-cloud swap. A future "one world" only has to add map × 1000 as an offset.
import royal from './royal.js';
import farm from './farm.js';
import airbase from './airbase.js';
import { AIRCRAFT } from '../aircraft.js';

export const KINGDOM = { royal, farm, airbase };
export const ORDER = ['royal', 'farm', 'airbase'];
// On the map as "coming soon" pins only (docs/AIRPORTS.md §1). The Palace Lawn (C-Tower 3, D27) lives inside C-Tower 1.
export const SOON = [
  { id: 'sands', name: 'Saltwhistle Sands', map: [-30, 22] },
  { id: 'krumpet', name: 'Mount Krumpet Altiport', map: [12, -30] },
  { id: 'krz', name: 'Krayzee International', map: [34, 12] },
];
export const LOOKS = {
  royal: { blurb: 'The royal aerodrome. Crossing runways, a castle (Palace Lawn coming soon) and a very tired tower.', controller: 'Gerald, Imogen & Toby' },
  farm: { blurb: 'A grass strip between the hedges. Mind the sheep. Farmer Mudge runs the radio between milkings.', controller: 'Farmer Mudge' },
  airbase: { blurb: 'Miles of concrete for the heavies. Squadron Leader Imogen has seen it all and filed it.', controller: 'Sqn Ldr Imogen' },
};

// Runway a type needs: its take-off roll + 10 % or its landing roll + 50 %, whichever is longer (the Jumbo needs 1375 m
// and just fits C-Tower 1's 1400 m; the Hercules needs 630 m, ten more than Muckle Bottom has).
export const RUNWAY_MARGIN = { takeoff: 1.1, landing: 1.5 };
export function runwayNeed(type) {
  const p = AIRCRAFT[type]?.performance;
  return p ? Math.round(Math.max((p.takeoffRollM || 0) * RUNWAY_MARGIN.takeoff, (p.landingRollM || 0) * RUNWAY_MARGIN.landing)) : 0;
}
export function usableLength(def) {
  return Math.max(0, ...def.runways.filter((rw) => rw.departures !== false && !rw.closed).map((rw) => rw.length));
}

const QUIPS = {
  farm: {
    jumbo: "Farmer Mudge: \"You'll not land that great tin barn on my turnips.\"",
    herc: "Farmer Mudge: \"The Wardrobe? On my grass? It'd flatten Doreen.\"",
    f35: "Farmer Mudge: \"Not till that jet learns to hover, Your Highness.\"",
  },
};
export function canUse(def, type) {
  const need = runwayNeed(type), have = usableLength(def);
  if (have >= need) return { ok: true, need, have };
  const plane = AIRCRAFT[type]?.name || type;
  const surf = def.runways[0]?.surface === 'grass' ? 'grass' : 'runway';
  return { ok: false, need, have, short: `TOO SHORT FOR THE ${plane.toUpperCase()}`,
    quip: QUIPS[def.id]?.[type] || `${def.short} has ${have} m of ${surf}. The ${plane} wants ${need} m.` };
}

// Kingdom-km offset between two airports, in metres in the world frame.
export function offsetM(fromId, toId) {
  const a = KINGDOM[fromId].map, b = KINGDOM[toId].map;
  return [(b[0] - a[0]) * 1000, (b[1] - a[1]) * 1000];
}
