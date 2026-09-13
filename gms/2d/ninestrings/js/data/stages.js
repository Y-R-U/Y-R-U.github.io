// js/data/stages.js — twelve stages, four acts. Declarative only, CONTRACTS §8.3.
//
// Timelines are hand-shaped escalation curves, not a flat drip: openers, lulls
// (a lull is an absence of events, which is why the windows do not tile), pack
// rushes, an elite window, and a surge in the last 40-60s. `scale` ramps over
// the window it sits on, so one window can carry a whole difficulty slope.
//
// duration: 8 min in Act I rising to 20 min in Act IV (DESIGN §8 / D8).
// maxAlive: rises across the game and NEVER exceeds 400 (performance contract).
// conductor.every is kept inside the 60-90s band DESIGN §2.3 asks for, except
// stage 1, which is deliberately slower because it is the tutorial.

const ACT1 = {
  ground: [0.048, 0.052, 0.066], fog: [0.085, 0.095, 0.125], accent: [0.95, 0.66, 0.29],
  choir: [[1.00, 0.68, 0.26], [0.55, 0.86, 0.62], [0.42, 0.62, 1.00]]
};
const ACT2 = {
  ground: [0.038, 0.078, 0.072], fog: [0.068, 0.140, 0.130], accent: [0.31, 0.83, 0.77],
  choir: [[0.31, 0.88, 0.80], [0.74, 0.86, 0.32], [0.44, 0.52, 0.96], [0.88, 0.94, 0.90]]
};
const ACT3 = {
  ground: [0.070, 0.050, 0.044], fog: [0.145, 0.090, 0.068], accent: [1.00, 0.36, 0.18],
  choir: [[1.00, 0.40, 0.16], [0.94, 0.80, 0.24], [0.82, 0.16, 0.22], [0.36, 0.78, 0.86]]
};
const ACT4 = {
  ground: [0.058, 0.048, 0.088], fog: [0.100, 0.082, 0.160], accent: [0.69, 0.43, 1.00],
  choir: [[0.70, 0.44, 1.00], [0.94, 0.92, 0.84], [1.00, 0.82, 0.46], [0.72, 0.14, 0.30]]
};

export const STAGES = Object.freeze({

  // ═══════════════════════════════════════ ACT I — THE TOWN

  s1: {
    id: 's1', act: 1, name: 'Bellfield Lane', subtitle: 'Where it starts, because you were near',
    duration: 480,
    palette: ACT1, backdrop: 'bg_town', maxAlive: 60,
    // TUTORIAL (DESIGN §4). Three shamblers in the first 30s and nothing else.
    timeline: [
      { at: 0, until: 30, every: 11, enemy: 'shambler', n: 1, pattern: 'edge' },
      { at: 34, until: 72, every: 8, enemy: 'shambler', n: 2, pattern: 'edge' },
      { at: 66, until: 140, every: 9, enemy: 'crawler', n: 2, pattern: 'edge' },
      { at: 96, until: 175, every: 7, enemy: 'shambler', n: 3, pattern: 'ring' },
      { at: 150, until: 152, every: 2, enemy: 'lamplost', n: 2, pattern: 'pack' },
      { at: 178, until: 210, every: 9, enemy: ['shambler', 'crawler'], n: 4, pattern: 'edge' },
      // 210-228 lull: the first quiet the player is allowed to notice
      { at: 228, until: 300, every: 6, enemy: ['shambler', 'crawler'], n: 4, pattern: 'edge', scale: { hp: 1.3 } },
      { at: 242, until: 244, every: 2, enemy: 'bloated', n: 2, pattern: 'ring' },
      { at: 272, until: 360, every: 13, enemy: 'bloated', n: 2, pattern: 'edge' },
      { at: 300, until: 302, every: 2, enemy: 'pallbearer', n: 1, pattern: 'pack' },
      { at: 312, until: 402, every: 5, enemy: ['shambler', 'lamplost'], n: 5, pattern: 'edge', scale: { hp: 1.6, speed: 1.1 } },
      { at: 360, until: 362, every: 2, enemy: 'screamer', n: 1, pattern: 'ring' },
      { at: 408, until: 438, every: 9, enemy: 'crawler', n: 6, pattern: 'ring' },
      { at: 440, until: 480, every: 4, enemy: ['shambler', 'crawler', 'lamplost'], n: 6, pattern: 'wall', scale: { hp: 1.8 } }
    ],
    conductor: { first: 180, every: 150, choir: 6, affixes: ['swift'] },
    chorus: [],
    rewards: { souls: 120, unlocks: ['sanctum'] },
    intro: 's1_intro', outro: 's1_outro'
  },

  s2: {
    id: 's2', act: 1, name: 'The Flooded Row', subtitle: 'The water never went back down',
    duration: 480,
    palette: ACT1, backdrop: 'bg_town', maxAlive: 80,
    timeline: [
      { at: 0, until: 60, every: 4, enemy: 'shambler', n: 3, pattern: 'edge' },
      { at: 20, until: 120, every: 6, enemy: 'crawler', n: 3, pattern: 'edge' },
      { at: 55, until: 57, every: 2, enemy: 'bellrunner', n: 2, pattern: 'pack' },
      { at: 70, until: 165, every: 9, enemy: 'bellrunner', n: 2, pattern: 'edge' },
      { at: 90, until: 180, every: 5, enemy: ['shambler', 'lamplost'], n: 5, pattern: 'ring', scale: { hp: 1.25 } },
      { at: 140, until: 142, every: 2, enemy: 'bloated', n: 4, pattern: 'ring' },
      // 182-196 lull
      { at: 196, until: 270, every: 4, enemy: ['shambler', 'crawler'], n: 6, pattern: 'edge', scale: { hp: 1.5, speed: 1.1 } },
      { at: 210, until: 300, every: 12, enemy: 'bloated', n: 3, pattern: 'edge' },
      { at: 240, until: 242, every: 2, enemy: 'pallbearer', n: 2, pattern: 'pack' },
      { at: 258, until: 340, every: 14, enemy: 'screamer', n: 1, pattern: 'edge' },
      { at: 285, until: 380, every: 4, enemy: ['lamplost', 'bellrunner'], n: 5, pattern: 'edge', scale: { hp: 1.7 } },
      { at: 330, until: 332, every: 2, enemy: 'drowned', n: 3, pattern: 'ring', scale: { hp: 0.7 } },
      { at: 360, until: 420, every: 7, enemy: 'drowned', n: 3, pattern: 'edge', scale: { hp: 0.8 } },
      { at: 400, until: 402, every: 2, enemy: 'pallbearer', n: 3, pattern: 'pack' },
      { at: 424, until: 480, every: 3, enemy: ['shambler', 'crawler', 'bellrunner'], n: 7, pattern: 'wall', scale: { hp: 2.0 } }
    ],
    conductor: { first: 75, every: 90, choir: 9, affixes: ['swift', 'armoured'] },
    chorus: [240],
    rewards: { souls: 150, unlocks: ['passives'] },
    intro: 's2_intro', outro: 's2_outro'
  },

  s3: {
    id: 's3', act: 1, name: 'Ossuary Gate', subtitle: 'They stacked them here for tidiness',
    duration: 540,
    palette: ACT1, backdrop: 'bg_ossuary', maxAlive: 100,
    timeline: [
      { at: 0, until: 70, every: 3.5, enemy: ['shambler', 'crawler'], n: 4, pattern: 'edge' },
      { at: 30, until: 150, every: 8, enemy: 'lamplost', n: 3, pattern: 'edge' },
      { at: 60, until: 62, every: 2, enemy: 'pallbearer', n: 2, pattern: 'pack' },
      { at: 76, until: 170, every: 5, enemy: 'bellrunner', n: 3, pattern: 'ring', scale: { speed: 1.15 } },
      { at: 110, until: 200, every: 11, enemy: 'bloated', n: 4, pattern: 'edge' },
      { at: 150, until: 152, every: 2, enemy: 'screamer', n: 2, pattern: 'ring' },
      // 202-218 lull
      { at: 218, until: 300, every: 3.5, enemy: ['shambler', 'lamplost', 'crawler'], n: 7, pattern: 'edge', scale: { hp: 1.5 } },
      { at: 250, until: 330, every: 16, enemy: 'pallbearer', n: 2, pattern: 'edge' },
      { at: 280, until: 282, every: 2, enemy: 'drowned', n: 6, pattern: 'ring' },
      { at: 305, until: 400, every: 5, enemy: ['drowned', 'bellrunner'], n: 5, pattern: 'edge', scale: { hp: 1.4 } },
      { at: 345, until: 347, every: 2, enemy: 'screamer', n: 3, pattern: 'pack' },
      { at: 370, until: 450, every: 4, enemy: ['shambler', 'crawler', 'bloated'], n: 7, pattern: 'ring', scale: { hp: 1.8, speed: 1.1 } },
      { at: 430, until: 432, every: 2, enemy: 'pallbearer', n: 4, pattern: 'pack' },
      // pre-boss surge
      { at: 462, until: 538, every: 3, enemy: ['shambler', 'crawler', 'lamplost', 'bellrunner'], n: 8, pattern: 'wall', scale: { hp: 2.2 } }
    ],
    boss: 'hollowth', bossAt: 540,
    conductor: { first: 70, every: 88, choir: 11, affixes: ['swift', 'armoured', 'burning'] },
    chorus: [200, 420],
    rewards: { souls: 400, unlocks: ['char_vane', 'chests', 'evolutions'] },
    intro: 's3_intro', outro: 's3_outro'
  },

  // ═══════════════════════════════════════ ACT II — THE MARSH

  s4: {
    id: 's4', act: 2, name: "Widow's Marsh", subtitle: 'Soft ground holds a footprint for years',
    duration: 600,
    palette: ACT2, backdrop: 'bg_marsh', maxAlive: 130,
    timeline: [
      { at: 0, until: 80, every: 4, enemy: 'drowned', n: 4, pattern: 'edge' },
      { at: 40, until: 45, every: 5, enemy: 'fenlice', n: 10, pattern: 'rain' },
      { at: 60, until: 180, every: 7, enemy: 'fenlice', n: 10, pattern: 'rain' },
      { at: 85, until: 90, every: 5, enemy: 'spitter', n: 2, pattern: 'ring' },
      { at: 100, until: 210, every: 8, enemy: 'spitter', n: 3, pattern: 'edge' },
      { at: 130, until: 220, every: 5, enemy: ['drowned', 'crawler'], n: 6, pattern: 'edge', scale: { hp: 1.3 } },
      { at: 175, until: 177, every: 2, enemy: 'weeper', n: 1, pattern: 'pack' },
      // 222-240 lull
      { at: 240, until: 330, every: 4, enemy: ['drowned', 'spitter'], n: 6, pattern: 'ring', scale: { hp: 1.4 } },
      { at: 255, until: 400, every: 18, enemy: 'weeper', n: 2, pattern: 'edge' },
      { at: 300, until: 305, every: 5, enemy: 'fenlice', n: 16, pattern: 'rain' },
      { at: 345, until: 440, every: 5, enemy: ['drowned', 'bloated'], n: 7, pattern: 'edge', scale: { hp: 1.6 } },
      { at: 390, until: 392, every: 2, enemy: 'pallbearer', n: 4, pattern: 'pack' },
      { at: 420, until: 500, every: 12, enemy: 'screamer', n: 2, pattern: 'edge' },
      { at: 460, until: 540, every: 4, enemy: ['drowned', 'spitter', 'weeper'], n: 7, pattern: 'ring', scale: { hp: 1.9 } },
      { at: 546, until: 600, every: 3, enemy: ['drowned', 'fenlice', 'crawler'], n: 9, pattern: 'wall', scale: { hp: 2.2 } }
    ],
    conductor: { first: 65, every: 90, choir: 12, affixes: ['swift', 'armoured', 'venom'] },
    chorus: [200, 420],
    rewards: { souls: 260, unlocks: ['relics'] },
    intro: 's4_intro', outro: 's4_outro'
  },

  s5: {
    id: 's5', act: 2, name: 'The Drowned Chapel', subtitle: 'The congregation stayed for the whole service',
    duration: 660,
    palette: ACT2, backdrop: 'bg_chapel', maxAlive: 150,
    timeline: [
      { at: 0, until: 90, every: 3.5, enemy: ['drowned', 'fenlice'], n: 5, pattern: 'edge' },
      { at: 45, until: 160, every: 7, enemy: 'corpselight', n: 2, pattern: 'ring' },
      { at: 70, until: 180, every: 6, enemy: 'spitter', n: 4, pattern: 'edge' },
      { at: 110, until: 220, every: 5, enemy: 'drowned', n: 7, pattern: 'ring', scale: { hp: 1.3 } },
      { at: 150, until: 155, every: 5, enemy: 'weeper', n: 2, pattern: 'pack' },
      { at: 190, until: 300, every: 9, enemy: 'screamer', n: 2, pattern: 'edge' },
      // 222-244 lull
      { at: 244, until: 340, every: 4, enemy: ['drowned', 'spitter', 'corpselight'], n: 7, pattern: 'edge', scale: { hp: 1.45 } },
      { at: 280, until: 285, every: 5, enemy: 'fenlice', n: 20, pattern: 'rain' },
      { at: 320, until: 322, every: 2, enemy: 'pallbearer', n: 5, pattern: 'pack' },
      { at: 350, until: 460, every: 14, enemy: 'weeper', n: 3, pattern: 'edge' },
      { at: 370, until: 480, every: 4, enemy: ['drowned', 'bloated', 'crawler'], n: 8, pattern: 'ring', scale: { hp: 1.7 } },
      { at: 440, until: 445, every: 5, enemy: 'corpselight', n: 6, pattern: 'ring' },
      { at: 500, until: 590, every: 4, enemy: ['drowned', 'spitter', 'weeper'], n: 8, pattern: 'edge', scale: { hp: 2.0, speed: 1.1 } },
      { at: 560, until: 562, every: 2, enemy: 'bellplate', n: 1, pattern: 'pack', scale: { hp: 0.5 } },
      { at: 600, until: 660, every: 2.5, enemy: ['drowned', 'fenlice', 'spitter'], n: 9, pattern: 'wall', scale: { hp: 2.3 } }
    ],
    conductor: { first: 60, every: 85, choir: 13, affixes: ['swift', 'armoured', 'venom', 'regen'] },
    chorus: [210, 430],
    rewards: { souls: 300, unlocks: [] },
    intro: 's5_intro', outro: 's5_outro'
  },

  s6: {
    id: 's6', act: 2, name: 'Threadworks', subtitle: 'Somebody has to make the thread',
    duration: 720,
    palette: ACT2, backdrop: 'bg_threadworks', maxAlive: 170,
    timeline: [
      { at: 0, until: 80, every: 3, enemy: ['drowned', 'crawler'], n: 6, pattern: 'edge' },
      { at: 40, until: 42, every: 2, enemy: 'cantor', n: 1, pattern: 'ring', scale: { hp: 0.6 } },
      { at: 60, until: 200, every: 20, enemy: 'cantor', n: 1, pattern: 'ring' },
      { at: 75, until: 190, every: 6, enemy: 'spitter', n: 5, pattern: 'edge' },
      { at: 100, until: 210, every: 5, enemy: 'weeper', n: 2, pattern: 'edge' },
      { at: 140, until: 145, every: 5, enemy: 'fenlice', n: 24, pattern: 'rain' },
      { at: 165, until: 260, every: 5, enemy: ['drowned', 'corpselight'], n: 8, pattern: 'ring', scale: { hp: 1.4 } },
      // 262-284 lull
      { at: 284, until: 380, every: 4, enemy: ['drowned', 'spitter', 'weeper'], n: 8, pattern: 'edge', scale: { hp: 1.6 } },
      { at: 300, until: 302, every: 2, enemy: 'pallbearer', n: 6, pattern: 'pack' },
      { at: 330, until: 470, every: 16, enemy: 'cantor', n: 2, pattern: 'ring' },
      { at: 400, until: 520, every: 4, enemy: ['drowned', 'bloated', 'corpselight'], n: 9, pattern: 'ring', scale: { hp: 1.8 } },
      { at: 450, until: 455, every: 5, enemy: 'fenlice', n: 30, pattern: 'rain' },
      { at: 490, until: 492, every: 2, enemy: 'bellplate', n: 2, pattern: 'pack', scale: { hp: 0.7 } },
      { at: 540, until: 640, every: 3.5, enemy: ['drowned', 'spitter', 'weeper', 'crawler'], n: 9, pattern: 'edge', scale: { hp: 2.1, speed: 1.15 } },
      { at: 646, until: 718, every: 2, enemy: ['drowned', 'fenlice', 'corpselight'], n: 12, pattern: 'wall', scale: { hp: 2.4 } }
    ],
    boss: 'vellish', bossAt: 720,
    conductor: { first: 55, every: 80, choir: 15, affixes: ['swift', 'armoured', 'venom', 'regen', 'shielded'] },
    chorus: [180, 400, 600],
    rewards: { souls: 700, unlocks: ['sigils'] },
    intro: 's6_intro', outro: 's6_outro'
  },

  // ═══════════════════════════════════════ ACT III — THE CITY

  s7: {
    id: 's7', act: 3, name: 'Ashgate', subtitle: 'The fire was meant to stop it spreading',
    duration: 780,
    palette: ACT3, backdrop: 'bg_ashgate', maxAlive: 200,
    timeline: [
      { at: 0, until: 90, every: 3.5, enemy: 'ashwalker', n: 5, pattern: 'edge' },
      { at: 50, until: 55, every: 5, enemy: 'emberling', n: 8, pattern: 'rain' },
      { at: 70, until: 220, every: 6, enemy: 'emberling', n: 8, pattern: 'rain' },
      { at: 110, until: 230, every: 5, enemy: ['ashwalker', 'bloated'], n: 7, pattern: 'edge', scale: { hp: 1.3 } },
      { at: 160, until: 162, every: 2, enemy: 'bellplate', n: 1, pattern: 'pack' },
      { at: 190, until: 320, every: 22, enemy: 'bellplate', n: 1, pattern: 'edge' },
      // 232-256 lull
      { at: 256, until: 360, every: 4, enemy: ['ashwalker', 'emberling', 'screamer'], n: 9, pattern: 'ring', scale: { hp: 1.5 } },
      { at: 300, until: 420, every: 9, enemy: 'surgeon', n: 3, pattern: 'edge' },
      { at: 380, until: 500, every: 4, enemy: ['ashwalker', 'drowned', 'emberling'], n: 10, pattern: 'edge', scale: { hp: 1.7 } },
      { at: 430, until: 435, every: 5, enemy: 'emberling', n: 22, pattern: 'rain' },
      { at: 470, until: 472, every: 2, enemy: 'cantor', n: 2, pattern: 'ring' },
      { at: 520, until: 640, every: 4, enemy: ['ashwalker', 'surgeon', 'bloated'], n: 10, pattern: 'ring', scale: { hp: 1.9 } },
      { at: 600, until: 602, every: 2, enemy: 'bellplate', n: 3, pattern: 'pack' },
      { at: 660, until: 720, every: 3.5, enemy: ['ashwalker', 'emberling', 'surgeon'], n: 11, pattern: 'edge', scale: { hp: 2.1 } },
      { at: 726, until: 780, every: 2.5, enemy: ['ashwalker', 'emberling', 'crawler'], n: 12, pattern: 'wall', scale: { hp: 2.4, speed: 1.1 } }
    ],
    conductor: { first: 55, every: 78, choir: 16, affixes: ['swift', 'armoured', 'burning', 'frenzy', 'thorned'] },
    chorus: [200, 420, 640],
    rewards: { souls: 420, unlocks: [] },
    intro: 's7_intro', outro: 's7_outro'
  },

  s8: {
    id: 's8', act: 3, name: 'The Long Hospital', subtitle: 'Wards that go further in than the building goes',
    duration: 840,
    palette: ACT3, backdrop: 'bg_hospital', maxAlive: 230,
    timeline: [
      { at: 0, until: 100, every: 3, enemy: ['ashwalker', 'surgeon'], n: 6, pattern: 'edge' },
      { at: 60, until: 200, every: 7, enemy: 'surgeon', n: 4, pattern: 'ring' },
      { at: 90, until: 240, every: 5, enemy: 'emberling', n: 10, pattern: 'rain' },
      { at: 130, until: 250, every: 5, enemy: ['ashwalker', 'drowned'], n: 8, pattern: 'edge', scale: { hp: 1.35 } },
      { at: 180, until: 182, every: 2, enemy: 'cantor', n: 2, pattern: 'ring' },
      { at: 210, until: 360, every: 18, enemy: 'cantor', n: 2, pattern: 'ring' },
      // 252-276 lull
      { at: 276, until: 390, every: 4, enemy: ['ashwalker', 'surgeon', 'bloated'], n: 10, pattern: 'ring', scale: { hp: 1.5 } },
      { at: 320, until: 322, every: 2, enemy: 'bellplate', n: 3, pattern: 'pack' },
      { at: 360, until: 520, every: 20, enemy: 'bellplate', n: 2, pattern: 'edge' },
      { at: 420, until: 550, every: 4, enemy: ['ashwalker', 'emberling', 'weeper'], n: 11, pattern: 'edge', scale: { hp: 1.75 } },
      { at: 500, until: 505, every: 5, enemy: 'emberling', n: 26, pattern: 'rain' },
      { at: 570, until: 700, every: 4, enemy: ['surgeon', 'ashwalker', 'screamer'], n: 11, pattern: 'ring', scale: { hp: 2.0 } },
      { at: 650, until: 652, every: 2, enemy: 'throneguard', n: 1, pattern: 'pack', scale: { hp: 0.35 } },
      { at: 720, until: 790, every: 3.5, enemy: ['ashwalker', 'surgeon', 'bellplate'], n: 12, pattern: 'edge', scale: { hp: 2.2 } },
      { at: 796, until: 840, every: 2.5, enemy: ['ashwalker', 'emberling', 'surgeon'], n: 13, pattern: 'wall', scale: { hp: 2.5 } }
    ],
    conductor: { first: 50, every: 75, choir: 17, affixes: ['swift', 'armoured', 'burning', 'regen', 'venom', 'shielded'] },
    chorus: [210, 430, 660],
    rewards: { souls: 480, unlocks: [] },
    intro: 's8_intro', outro: 's8_outro'
  },

  s9: {
    id: 's9', act: 3, name: 'Choir Hall', subtitle: 'Built for the acoustics, not the people',
    duration: 900,
    palette: ACT3, backdrop: 'bg_choirhall', maxAlive: 260,
    timeline: [
      { at: 0, until: 100, every: 3, enemy: ['ashwalker', 'emberling'], n: 7, pattern: 'edge' },
      { at: 50, until: 220, every: 14, enemy: 'cantor', n: 2, pattern: 'ring' },
      { at: 80, until: 230, every: 6, enemy: 'screamer', n: 4, pattern: 'edge' },
      { at: 120, until: 250, every: 5, enemy: ['ashwalker', 'surgeon'], n: 9, pattern: 'ring', scale: { hp: 1.35 } },
      { at: 170, until: 172, every: 2, enemy: 'bellplate', n: 3, pattern: 'pack' },
      { at: 200, until: 380, every: 16, enemy: 'bellplate', n: 2, pattern: 'edge' },
      // 252-278 lull
      { at: 278, until: 400, every: 3.5, enemy: ['ashwalker', 'emberling', 'weeper'], n: 11, pattern: 'edge', scale: { hp: 1.55 } },
      { at: 340, until: 345, every: 5, enemy: 'emberling', n: 28, pattern: 'rain' },
      { at: 420, until: 560, every: 4, enemy: ['surgeon', 'ashwalker', 'bloated'], n: 12, pattern: 'ring', scale: { hp: 1.8 } },
      { at: 470, until: 620, every: 14, enemy: 'cantor', n: 3, pattern: 'ring' },
      { at: 540, until: 542, every: 2, enemy: 'throneguard', n: 1, pattern: 'pack', scale: { hp: 0.45 } },
      { at: 600, until: 740, every: 4, enemy: ['ashwalker', 'emberling', 'surgeon', 'screamer'], n: 12, pattern: 'edge', scale: { hp: 2.0 } },
      { at: 700, until: 702, every: 2, enemy: 'bellplate', n: 5, pattern: 'pack' },
      { at: 760, until: 850, every: 3, enemy: ['ashwalker', 'surgeon', 'weeper'], n: 13, pattern: 'ring', scale: { hp: 2.3 } },
      { at: 856, until: 898, every: 2.2, enemy: ['ashwalker', 'emberling', 'crawler', 'surgeon'], n: 14, pattern: 'wall', scale: { hp: 2.6, speed: 1.1 } }
    ],
    boss: 'morrow', bossAt: 900,
    conductor: { first: 48, every: 72, choir: 19, affixes: ['swift', 'armoured', 'burning', 'regen', 'venom', 'frenzy', 'warped'] },
    chorus: [200, 420, 640, 820],
    rewards: { souls: 1000, unlocks: ['curse', 'char_ash'] },
    intro: 's9_intro', outro: 's9_outro'
  },

  // ═══════════════════════════════════════ ACT IV — BELOW

  s10: {
    id: 's10', act: 4, name: 'The Descent', subtitle: 'The stairs were cut from the inside',
    duration: 1020,
    palette: ACT4, backdrop: 'bg_descent', maxAlive: 300,
    timeline: [
      { at: 0, until: 110, every: 3, enemy: ['ashwalker', 'drowned'], n: 8, pattern: 'edge', scale: { hp: 1.2 } },
      { at: 60, until: 240, every: 8, enemy: 'namewraith', n: 2, pattern: 'ring' },
      { at: 100, until: 260, every: 5, enemy: 'emberling', n: 12, pattern: 'rain' },
      { at: 150, until: 280, every: 5, enemy: ['ashwalker', 'surgeon'], n: 10, pattern: 'edge', scale: { hp: 1.4 } },
      { at: 200, until: 202, every: 2, enemy: 'throneguard', n: 1, pattern: 'pack' },
      { at: 240, until: 420, every: 26, enemy: 'throneguard', n: 1, pattern: 'edge' },
      // 282-310 lull
      { at: 310, until: 440, every: 3.5, enemy: ['ashwalker', 'emberling', 'bellplate'], n: 12, pattern: 'ring', scale: { hp: 1.6 } },
      { at: 380, until: 540, every: 10, enemy: 'namewraith', n: 4, pattern: 'ring' },
      { at: 460, until: 620, every: 4, enemy: ['ashwalker', 'surgeon', 'weeper'], n: 13, pattern: 'edge', scale: { hp: 1.85 } },
      { at: 540, until: 545, every: 5, enemy: 'fenlice', n: 40, pattern: 'rain' },
      { at: 600, until: 602, every: 2, enemy: 'loomspawn', n: 1, pattern: 'pack', scale: { hp: 0.6 } },
      { at: 650, until: 820, every: 4, enemy: ['ashwalker', 'emberling', 'namewraith'], n: 13, pattern: 'ring', scale: { hp: 2.1 } },
      { at: 760, until: 762, every: 2, enemy: 'throneguard', n: 3, pattern: 'pack' },
      { at: 840, until: 960, every: 3, enemy: ['ashwalker', 'surgeon', 'bellplate', 'namewraith'], n: 14, pattern: 'edge', scale: { hp: 2.4 } },
      { at: 966, until: 1018, every: 2.2, enemy: ['ashwalker', 'emberling', 'crawler'], n: 15, pattern: 'wall', scale: { hp: 2.7, speed: 1.15 } }
    ],
    conductor: { first: 45, every: 70, choir: 21, affixes: ['swift', 'armoured', 'burning', 'regen', 'venom', 'frenzy', 'shielded', 'warped'] },
    chorus: [190, 410, 630, 850],
    rewards: { souls: 640, unlocks: [] },
    intro: 's10_intro', outro: 's10_outro'
  },

  s11: {
    id: 's11', act: 4, name: 'The Loom of Names', subtitle: 'Every thread is labelled. One of them is yours',
    duration: 1080,
    palette: ACT4, backdrop: 'bg_loom', maxAlive: 340,
    timeline: [
      { at: 0, until: 120, every: 3, enemy: ['namewraith', 'ashwalker'], n: 8, pattern: 'edge', scale: { hp: 1.25 } },
      { at: 70, until: 260, every: 12, enemy: 'loomspawn', n: 1, pattern: 'ring' },
      { at: 100, until: 270, every: 12, enemy: 'cantor', n: 3, pattern: 'ring' },
      { at: 140, until: 290, every: 5, enemy: ['emberling', 'surgeon'], n: 12, pattern: 'edge', scale: { hp: 1.45 } },
      { at: 200, until: 202, every: 2, enemy: 'throneguard', n: 2, pattern: 'pack' },
      { at: 240, until: 440, every: 22, enemy: 'throneguard', n: 2, pattern: 'edge' },
      // 292-320 lull
      { at: 320, until: 460, every: 3.5, enemy: ['namewraith', 'ashwalker', 'bellplate'], n: 13, pattern: 'ring', scale: { hp: 1.7 } },
      { at: 400, until: 560, every: 10, enemy: 'loomspawn', n: 2, pattern: 'edge' },
      { at: 480, until: 660, every: 4, enemy: ['ashwalker', 'surgeon', 'weeper'], n: 14, pattern: 'edge', scale: { hp: 1.95 } },
      { at: 580, until: 585, every: 5, enemy: 'emberling', n: 34, pattern: 'rain' },
      { at: 660, until: 840, every: 9, enemy: ['cantor', 'namewraith'], n: 4, pattern: 'ring' },
      { at: 700, until: 880, every: 4, enemy: ['ashwalker', 'emberling', 'loomspawn'], n: 14, pattern: 'ring', scale: { hp: 2.2 } },
      { at: 820, until: 822, every: 2, enemy: 'throneguard', n: 4, pattern: 'pack' },
      { at: 900, until: 1020, every: 3, enemy: ['namewraith', 'surgeon', 'bellplate', 'loomspawn'], n: 15, pattern: 'edge', scale: { hp: 2.5 } },
      { at: 1026, until: 1078, every: 2, enemy: ['ashwalker', 'emberling', 'namewraith'], n: 16, pattern: 'wall', scale: { hp: 2.8, speed: 1.15 } }
    ],
    conductor: { first: 42, every: 66, choir: 23, affixes: ['swift', 'armoured', 'burning', 'regen', 'venom', 'frenzy', 'shielded', 'chill', 'warped'] },
    chorus: [180, 390, 600, 810, 990],
    rewards: { souls: 720, unlocks: [] },
    intro: 's11_intro', outro: 's11_outro'
  },

  s12: {
    id: 's12', act: 4, name: 'The Ninth Throne', subtitle: 'It has been waiting the whole time',
    duration: 1200,
    palette: ACT4, backdrop: 'bg_throne', maxAlive: 380,
    timeline: [
      { at: 0, until: 120, every: 2.8, enemy: ['namewraith', 'ashwalker', 'emberling'], n: 9, pattern: 'edge', scale: { hp: 1.3 } },
      { at: 80, until: 280, every: 10, enemy: 'loomspawn', n: 2, pattern: 'ring' },
      { at: 120, until: 300, every: 10, enemy: 'cantor', n: 4, pattern: 'ring' },
      { at: 160, until: 320, every: 20, enemy: 'throneguard', n: 2, pattern: 'edge' },
      { at: 200, until: 205, every: 5, enemy: 'fenlice', n: 44, pattern: 'rain' },
      { at: 240, until: 360, every: 4, enemy: ['ashwalker', 'surgeon', 'bellplate'], n: 14, pattern: 'edge', scale: { hp: 1.6 } },
      // 362-392 lull: the last quiet in the game
      { at: 392, until: 540, every: 3.5, enemy: ['namewraith', 'ashwalker', 'loomspawn'], n: 15, pattern: 'ring', scale: { hp: 1.85 } },
      { at: 460, until: 640, every: 16, enemy: 'throneguard', n: 3, pattern: 'pack' },
      { at: 560, until: 740, every: 4, enemy: ['emberling', 'surgeon', 'weeper', 'bellplate'], n: 15, pattern: 'edge', scale: { hp: 2.1 } },
      { at: 680, until: 860, every: 8, enemy: ['cantor', 'namewraith'], n: 5, pattern: 'ring' },
      { at: 760, until: 940, every: 3.5, enemy: ['ashwalker', 'loomspawn', 'namewraith'], n: 16, pattern: 'ring', scale: { hp: 2.4 } },
      { at: 880, until: 882, every: 2, enemy: 'throneguard', n: 6, pattern: 'pack' },
      { at: 960, until: 1100, every: 3, enemy: ['namewraith', 'bellplate', 'loomspawn', 'surgeon'], n: 16, pattern: 'edge', scale: { hp: 2.7 } },
      { at: 1080, until: 1085, every: 5, enemy: 'emberling', n: 40, pattern: 'rain' },
      { at: 1110, until: 1198, every: 2, enemy: ['ashwalker', 'emberling', 'namewraith', 'crawler'], n: 18, pattern: 'wall', scale: { hp: 3.0, speed: 1.2 } }
    ],
    boss: 'ninth', bossAt: 1200,
    conductor: { first: 40, every: 62, choir: 26, affixes: ['swift', 'armoured', 'burning', 'regen', 'venom', 'frenzy', 'shielded', 'chill', 'thorned', 'warped'] },
    chorus: [180, 400, 620, 840, 1050],
    rewards: { souls: 2000, unlocks: ['endless', 'choirhunt', 'char_hand'] },
    intro: 's12_intro', outro: 's12_outro'
  }

});

export const list = Object.freeze(Object.keys(STAGES).map(k => STAGES[k]));
