// The player's quarters, as tiers. Buying a tier moves you somewhere better and the view out the
// window changes with it, so `site` matters as much as `room`.
//
// `site.at` is a visual position in the live Tamber Reach (the same frame as REACH in world/scene.js).
// `site.face` is the compass bearing the window looks along, in the same convention as the starAz
// knob — 0 is −Z, 90 is +X. The star sits at 148 in the live system, so a face of 96 puts it
// half a frame off the right edge.
//
// `light` is the room's own key, in ROOM space: az 0 is straight in through the window, el is
// above the sill. It is authored, not derived — the room is dim and cool and the practicals are
// warm, and that contrast is the whole shot. The owner's cabin flips it: the star is in frame
// there, so the aperture goes warm and the interior fill goes cold.

export default Object.freeze([
  Object.freeze({
    id: 'dockbox', name: 'Rented Dock Box', cost: 0, upkeep: 40,
    blurb: 'Three metres of Ledger nobody else wanted. The bunk folds down over the crate you eat off.',
    room: Object.freeze({ w: 3.0, h: 2.35, d: 4.4, wall: 0.16 }),
    win: Object.freeze({ w: 2.0, h: 1.15, sill: 0.85, x: 0, mullions: 2, transom: false }),
    dress: Object.freeze({
      desk: 1, terminal: 1, bunk: 1, seat: 'stool', crates: 3, locker: 0,
      rug: 0, plant: 0, bunklight: 1, pipes: 1.0, greeble: 1.0,
      screen: Object.freeze([0.42, 0.28]),
    }),
    site: Object.freeze({ at: Object.freeze([-130, 40, 196]), face: 76, pitch: 2 }),
    light: Object.freeze({
      az: 46, el: 25, key: '#a8c8e8', sky: '#2c4a66', gain: 7.4, fill: 84,
      warm: '#ff9c33', shaft: 0.9,
    }),
  }),

  Object.freeze({
    id: 'berth', name: 'Company Berth', cost: 45000, upkeep: 180,
    blurb: 'Outboard of the dock row, one deck up. Enough floor for a chair you did not have to fold.',
    room: Object.freeze({ w: 4.2, h: 2.60, d: 5.4, wall: 0.18 }),
    win: Object.freeze({ w: 3.0, h: 1.55, sill: 0.72, x: 0, mullions: 2, transom: true }),
    dress: Object.freeze({
      desk: 1, terminal: 1, bunk: 1, seat: 'chair', crates: 2, locker: 1,
      rug: 1, plant: 0, bunklight: 1, pipes: 0.8, greeble: 1.0,
      screen: Object.freeze([0.50, 0.33]),
    }),
    site: Object.freeze({ at: Object.freeze([40, 74, 250]), face: 56, pitch: 7 }),
    light: Object.freeze({
      az: 48, el: 24, key: '#aecde9', sky: '#2e4c68', gain: 7.6, fill: 90,
      warm: '#ff9c33', shaft: 1.0,
    }),
  }),

  Object.freeze({
    id: 'suite', name: 'Station Suite', cost: 220000, upkeep: 700,
    blurb: 'On the mast crown, above the whole row. Everyone who docks at Ledger looks up at your glass.',
    room: Object.freeze({ w: 5.8, h: 3.10, d: 7.0, wall: 0.20 }),
    win: Object.freeze({ w: 4.6, h: 2.30, sill: 0.35, x: 0, mullions: 3, transom: true }),
    dress: Object.freeze({
      desk: 1, terminal: 1, bunk: 1, seat: 'chair', crates: 1, locker: 1,
      rug: 1, plant: 1, bunklight: 1, pipes: 0.5, greeble: 0.7,
      screen: Object.freeze([0.62, 0.40]),
    }),
    site: Object.freeze({ at: Object.freeze([-180, 130, 330]), face: 62, pitch: 13 }),
    light: Object.freeze({
      az: 44, el: 22, key: '#b6d4ee', sky: '#31506d', gain: 7.8, fill: 94,
      warm: '#ffa63f', shaft: 1.1,
    }),
  }),

  Object.freeze({
    id: 'owner', name: "Owner's Cabin", cost: 900000, upkeep: 2200,
    blurb: 'The nose of your own hull, parked where the Reach can see it. Corvain’s yard is the view.',
    room: Object.freeze({ w: 6.6, h: 3.30, d: 8.4, wall: 0.22 }),
    win: Object.freeze({ w: 5.8, h: 2.55, sill: 0.30, x: 0, mullions: 3, transom: true }),
    dress: Object.freeze({
      desk: 1, terminal: 1, bunk: 1, seat: 'chair', crates: 1, locker: 1,
      rug: 1, plant: 1, bunklight: 1, pipes: 0.4, greeble: 0.5, hull: 1,
      screen: Object.freeze([0.72, 0.46]),
    }),
    site: Object.freeze({ at: Object.freeze([980, 430, 1520]), face: 166, pitch: -29 }),
    light: Object.freeze({
      az: 16, el: 20, key: '#ffd0a0', sky: '#4a4130', gain: 8.2, fill: 74,
      warm: '#5fd0ee', shaft: 1.25,
    }),
  }),
]);
