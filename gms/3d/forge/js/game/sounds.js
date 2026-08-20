// The game's whole sound map: an event name to a bench id and the settings Aaron's listening
// notes asked for. Pure data — `audio.js` fires it, and a node test refuses any id the bench's
// `bad` bucket rejects.
//
// The one hard rule the bench taught: every sound that survived was filtered noise, and every one
// that was rejected leaned on oscillators playing pitched notes. A new effect starts as noise.

export const SOUNDS = {
  // Aaron on whooshFast: "sword swipe or magic effect… slower for magic". So: slower, darker.
  cast: { id: 'whooshFast', p: { speed: 0.52, body: 780, focus: 2.0, level: 0.55 } },
  castCharged: { id: 'whooshHeavy', p: { speed: 1.1, weight: 1.4, level: 0.6 } },
  impact: { id: 'spellHit', p: { size: 0.7, pitch: 110, shimmer: 0.7, level: 0.6 } },
  // "Pitch at the lowest is better — sounds like chopping wood."
  kill: { id: 'impactWood', p: { pitch: 110, decay: 0.22, knock: 0.7, level: 0.7 } },

  footGrass: { id: 'footGrass', p: { soft: 0.85, level: 0.35 } },
  footGravel: { id: 'footGravel', p: { pitch: 3000, level: 0.35 } },
  footStone: { id: 'footStone', p: { hard: 0.55, level: 0.35 } },
  // "Needs pitch right down, hollow right down, reverb up — then ok."
  footWood: { id: 'footWood', p: { pitch: 110, hollow: 0.2, send: 0.45, level: 0.35 } },

  // The Lantern Spire. Aaron: "Kind of a bell, or a tubular bell." The valley's only clock.
  bell: { id: 'impactMetal', p: { pitch: 300, ring: 2.4, hard: 0.5, level: 0.7, send: 0.55 } },
  // Blackstone answers it three times a day: the same voice, dropped and cut short.
  horn: { id: 'impactMetal', p: { pitch: 150, ring: 0.55, hard: 0.35, level: 0.6 } },

  lamp: { id: 'ignite', p: { length: 0.7, thump: 0.5 } },
  lineCast: { id: 'bubble', p: { count: 5, pitch: 620, spread: 0.35, level: 0.4 } },
  bite: { id: 'waterSplash', p: { size: 0.7, drops: 5, level: 0.7 } },
  door: { id: 'doorWood', p: { swing: 0.9, pitch: 200, thud: 0.6, level: 0.5 } },

  uiBlip: { id: 'uiBlip', p: { level: 0.3 } },
  uiConfirm: { id: 'uiConfirm', p: { level: 0.38 } },
  // A level-up is the same confirm four semitones up. Nothing new is synthesised for it.
  levelUp: { id: 'uiConfirm', p: { pitch: 831, level: 0.45 } },
  uiError: { id: 'uiError', p: { level: 0.3 } },
};

// Beds. `every` is the seconds between one-shots; `stream` and `fireCrackle` retrigger close
// enough to their own length to read as continuous.
export const AMBIENCE = {
  water: { id: 'stream', p: { length: 2.6, level: 0.4 }, every: [2.3, 2.5], where: 'creek' },
  day: { id: 'bird', p: { level: 0.3, send: 0.6 }, every: [8, 20], hours: [5.5, 20.5], outdoor: true },
  dusk: { id: 'insect', p: { level: 0.25 }, every: [6, 14], hours: [18, 22], outdoor: true },
  hearth: { id: 'fireCrackle', p: { length: 2.6, level: 0.45 }, every: [2.4, 2.6], where: 'hearth' },
  wind: { id: 'windGust', p: { length: 2.4, howl: 0.35, level: 0.3 }, every: [14, 34], outdoor: true },
};

export const VOICE_CAP = 12;
export const FOOTSTEP_EVERY = 0.42;
export const BELL_GAP = 1.35;          // seconds between strikes when the Spire rings the hour

// §8.1: no PannerNode. Distance is a level curve and nothing else, which is correct enough for a
// third-person camera and costs one multiply.
export const atten = (d, range) => {
  const k = 1 - Math.min(1, Math.max(0, d) / range);
  return k * k;
};

export const RANGE = { world: 40, bell: 900, ambient: 26 };

export const ids = () => [...new Set([
  ...Object.values(SOUNDS).map(s => s.id),
  ...Object.values(AMBIENCE).map(s => s.id),
])];
