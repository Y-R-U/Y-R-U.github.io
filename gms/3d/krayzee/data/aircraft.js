// Aircraft roster. Speeds kt IAS, mass kg, lengths m, climb fpm, rates deg/s.
// status 'ready' = model + flight model exist; 'planned' = roster/filters only.
// handling (0..1): rollAuthority, pitchAuthority, yawAuthority, stability (higher = returns to trim faster), groundHandling.

export const AIRCRAFT = {
  c172: {
    name: 'Royal Runabout', type: 'Cessna 172S Skyhawk', class: 'light', status: 'ready', ppMult: 1.0, unlockRank: 'baron',
    dims: { length: 8.28, span: 11.0, height: 2.72, wingArea: 16.2 },
    mass: { empty: 767, mtow: 1157, typical: 1000 },
    engine: { hp: 180, kind: 'piston', props: 1, maxRpm: 2700, idleRpm: 650 },
    speeds: { vs0: 40, vs1: 48, vr: 55, vx: 62, vy: 74, approach: 65, cruise: 120, vfe: 85, vno: 129, vne: 163, taxi: 15 },
    performance: { climbFpm: 730, ceilingFt: 14000, takeoffRollM: 290, landingRollM: 175, glideRatio: 9 },
    flaps: [0, 10, 20, 30],
    handling: { rollRate: 60, pitchRate: 25, yawRate: 20, rollAuthority: 0.6, pitchAuthority: 0.6, yawAuthority: 0.5, stability: 0.8, groundHandling: 0.85 },
    gear: 'tricycle', water: false,
    cockpit: 'ga_generic',
    patternAltM: 300, circuitScale: 1.0,
  },
  flexwing:  { name: 'Hang-Glider-with-Opinions', type: 'flex-wing microlight', class: 'ultralight', status: 'planned', ppMult: 1.4, unlockRank: 'earl',      speeds: { vr: 35, approach: 45, cruise: 55 }, notes: 'weight-shift; sluggish roll; blown about by wake', cockpit: 'open_trike' },
  cub:       { name: 'Butter Cub', type: 'Piper J-3 Cub', class: 'light', status: 'planned', ppMult: 1.3, unlockRank: 'viscount',                          speeds: { vr: 40, approach: 50, cruise: 75 }, notes: 'tailwheel ground-loops; lands in 100 m; grass-friendly', gear: 'tailwheel', cockpit: 'ga_generic' },
  tiger:     { name: "Grandfather's Moth", type: 'DH.82 Tiger Moth', class: 'vintage', status: 'planned', ppMult: 1.3, unlockRank: 'earl',                   speeds: { vr: 45, approach: 55, cruise: 80 }, notes: 'open-cockpit biplane; draggy; scarf physics', gear: 'tailwheel', cockpit: 'open_biplane' },
  sopwith:   { name: 'Jolly Camel', type: 'Sopwith Camel-ish', class: 'vintage', status: 'planned', ppMult: 1.4, unlockRank: 'archduke',                    speeds: { vr: 45, approach: 55, cruise: 90 }, notes: 'vicious right torque roll; rotary engine', gear: 'tailwheel', cockpit: 'open_biplane' },
  spitfire:  { name: 'Teatime', type: 'Supermarine Spitfire-ish', class: 'vintage', status: 'planned', ppMult: 0.9, unlockRank: 'crownprince',             speeds: { vr: 90, approach: 100, cruise: 260 }, notes: 'fast; no forward view on the ground', gear: 'tailwheel', cockpit: 'ga_generic' },
  pitts:     { name: 'Show-Off', type: 'Pitts Special S-2', class: 'aerobatic', status: 'planned', ppMult: 1.1, unlockRank: 'marquess',                     speeds: { vr: 60, approach: 80, cruise: 140 }, notes: '240 deg/s roll; twitchy; short wings', gear: 'tailwheel', cockpit: 'open_biplane' },
  extra:     { name: 'Extra Extra', type: 'Extra 300', class: 'aerobatic', status: 'planned', ppMult: 1.0, unlockRank: 'archduke',                           speeds: { vr: 65, approach: 85, cruise: 180 }, notes: 'precise; hard to slow down', gear: 'tailwheel', cockpit: 'ga_generic' },
  beaver:    { name: 'Damp Duchess', type: 'DHC-2 Beaver floatplane', class: 'sea', status: 'planned', ppMult: 1.2, unlockRank: 'marquess',                 speeds: { vr: 55, approach: 65, cruise: 115 }, notes: 'lands on water; amphibious float wheels', gear: 'floats', water: true, cockpit: 'ga_generic' },
  catalina:  { name: 'Soggy Monarch', type: 'Catalina-ish flying boat', class: 'sea', status: 'planned', ppMult: 1.3, unlockRank: 'prince',                 speeds: { vr: 70, approach: 80, cruise: 110 }, notes: 'huge; slow roll; water only', gear: 'hull', water: true, cockpit: 'glass_generic' },
  caravan:   { name: 'Royal Removals', type: 'Cessna 208 Caravan', class: 'utility', status: 'planned', ppMult: 0.9, unlockRank: 'duke',                    speeds: { vr: 70, approach: 80, cruise: 170 }, notes: 'heavy; stable; turbine whine', cockpit: 'ga_generic' },
  twinotter: { name: 'Twin Toff', type: 'DHC-6 Twin Otter', class: 'utility', status: 'planned', ppMult: 1.0, unlockRank: 'archduke',                      speeds: { vr: 65, approach: 75, cruise: 160 }, notes: 'STOL; asymmetric thrust if one engine quits', cockpit: 'ga_generic' },
  baron58:   { name: "The Baron's Baron", type: 'Beechcraft Baron 58', class: 'light', status: 'planned', ppMult: 0.9, unlockRank: 'duke',                 speeds: { vr: 85, approach: 95, cruise: 200 }, notes: 'twin piston; fast for the circuit', cockpit: 'ga_generic' },
  bizjet:    { name: 'Monogrammed Lear', type: 'Learjet-ish', class: 'bizjet', status: 'planned', ppMult: 0.8, unlockRank: 'prince',                        speeds: { vr: 120, approach: 130, cruise: 430 }, notes: 'overshoots the pattern; 3x circuit', circuitScale: 3, cockpit: 'glass_generic' },
  gulf:      { name: 'The Gilded Gulf', type: 'Gulfstream-ish', class: 'bizjet', status: 'planned', ppMult: 0.8, unlockRank: 'crownprince',                speeds: { vr: 130, approach: 140, cruise: 470 }, notes: 'long runway; very smooth', circuitScale: 3, cockpit: 'glass_generic' },
  dash8:     { name: 'Commoner Shuttle', type: 'Dash 8 turboprop', class: 'airliner', status: 'planned', ppMult: 0.8, unlockRank: null, aiOnly: true,        speeds: { vr: 110, approach: 120, cruise: 270 }, notes: 'the plane you most often cut in front of', circuitScale: 2.5, cockpit: 'glass_generic' },
  a320:      { name: 'Peasant Express', type: 'Airbus A320-ish', class: 'airliner', status: 'planned', ppMult: 0.8, unlockRank: 'king',                      speeds: { vr: 145, approach: 140, cruise: 450 }, notes: 'heavy wake flips light planes', circuitScale: 3.5, wake: 'heavy', cockpit: 'glass_generic' },
  jumbo:     { name: 'Royal Jumbo', type: 'Boeing 747-ish', class: 'airliner', status: 'planned', ppMult: 0.8, unlockRank: 'king',                          speeds: { vr: 160, approach: 150, cruise: 490 }, notes: 'needs the full 1400 m, barely; catastrophic wake', circuitScale: 4, wake: 'super', cockpit: 'glass_generic' },
  autogyro:  { name: 'Spinning Jenny', type: 'autogyro', class: 'silly', status: 'planned', ppMult: 1.4, unlockRank: 'prince',                             speeds: { vr: 30, approach: 35, cruise: 70 }, notes: 'near-vertical landings; cannot hover', cockpit: 'open_trike' },
  bathtub:   { name: 'Royal Flying Bathtub', type: 'clawfoot tub, propeller on the taps', class: 'silly', status: 'planned', ppMult: 1.6, unlockRank: 'story', speeds: { vr: 40, approach: 45, cruise: 60 }, notes: 'rubber duck co-pilot; wobbles in roll; gold taps at Emperor', cockpit: 'bathtub' },
  throne:    { name: 'Divine Right', type: 'flying throne with jet pack', class: 'silly', status: 'planned', ppMult: 1.5, unlockRank: 'emperor',             speeds: { vr: 50, approach: 55, cruise: 90 }, notes: 'handles like a shopping trolley', cockpit: 'throne' },
  balloon:   { name: 'Hot Air', type: 'hot-air balloon', class: 'silly', status: 'planned', ppMult: 2.0, unlockRank: null, decreeOnly: true,                speeds: { vr: 0, approach: 0, cruise: 15 }, notes: 'altitude only; drifts with wind; landing anywhere counts', cockpit: 'basket' },
};

export const COCKPITS = ['ga_generic', 'glass_generic', 'open_biplane', 'open_trike', 'bathtub', 'throne', 'basket'];
