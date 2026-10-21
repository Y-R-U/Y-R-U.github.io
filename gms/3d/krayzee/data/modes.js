// Game modes, online room types and host options. Spec: docs/DESIGN.md §3.

export const TRAFFIC = { none: 0, light: 4, busy: 8, chaos: 14 };

export const AIRCRAFT_CLASSES = ['ultralight', 'light', 'vintage', 'sea', 'aerobatic', 'utility', 'bizjet', 'airliner', 'silly'];

export const FREE_FLIGHT = { protection: 'rubber', traffic: 'light', runway: 'wind', timeOfDay: 'day', ppRate: 1.0 };

// fixed: keys the host cannot change for this type.
export const ROOM_TYPES = {
  court:      { name: 'Court Session', blurb: 'Free-for-all. Most Privilege holds the Crown at the bell.', protection: 'partial', classes: 'any', traffic: 'busy', minutes: 10, win: 'most_pp', fixed: [] },
  rumble:     { name: 'Royal Rumble', blurb: 'impossiRubber only. Maximum chaos, zero consequences.', protection: 'rubber', classes: 'any', traffic: 'chaos', minutes: 8, win: 'most_pp', fixed: ['protection', 'traffic', 'minutes'] },
  coronation: { name: 'Coronation', blurb: 'First royal to the target is crowned.', protection: 'partial', classes: 'any', traffic: 'busy', target: 5000, win: 'first_to_target', fixed: [] },
  strict:     { name: 'Strict Tower', blurb: 'Real metal. Crash and lose 500 Privilege.', protection: 'realistic', classes: ['ultralight', 'light'], traffic: 'light', minutes: 12, crashPenalty: 500, win: 'most_pp', fixed: ['protection'] },
  garden:     { name: 'Garden Party', blurb: 'Small planes, soft landings, tower in a good mood.', protection: 'rubber', classes: ['ultralight', 'light'], traffic: 'light', minutes: 10, outrageGain: 0.5, win: 'most_pp', fixed: ['protection', 'classes'] },
  joust:      { name: 'Joust', blurb: 'One runway, two royals, best of five landings.', protection: 'rubber', aircraft: 'same', traffic: 'none', rounds: 5, maxPlayers: 2, win: 'rounds', fixed: ['traffic', 'maxPlayers'] },
  open:       { name: 'Open Court', blurb: 'Sandbox. No clock, the Crown still counts.', protection: 'partial', classes: 'any', traffic: 'busy', minutes: 0, win: 'none', fixed: [] },
};

export const HOST_OPTIONS = {
  roomName: { maxLen: 24 },
  visibility: ['public', 'private'], privateCodeLen: 6,
  maxPlayers: { min: 2, max: 8, default: 8 },
  classes: AIRCRAFT_CLASSES,              // multi-select, or a single fixed aircraft id
  protection: ['rubber', 'partial', 'realistic'],
  partialStartPct: [50, 75, 100],
  traffic: Object.keys(TRAFFIC),
  runway: ['wind', '27', '09', '04', '22'],
  minutes: [5, 8, 10, 12, 15, 0],
  target: [3000, 5000, 8000, 12000],
  outrageGain: [0.5, 1, 1.5],
  voices: ['first_come', 'duplicates_allowed'],
  decreeMinRank: 'king',
  decrees: {
    all_bathtubs: 'Everyone flies the Royal Bathtub.',
    tower_on_strike: 'No ATC at all. Pure chaos; outrage disabled, infractions still score.',
    crosswind_open: 'Runway 04/22 is open and active alongside 27.',
    double_points_final_minute: 'All Privilege doubled in the last 60 seconds.',
  },
  hostRankedMinRank: 'duke',
};

export const VOICE_ALLOCATION = { mode: 'first_come', favourites: 3, aiNeverUsesHumanVoice: true };
