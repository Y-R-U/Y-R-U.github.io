// Track manifest. Missing files are tolerated: audio.js stays silent for any id whose
// mp3 is absent, so the game still runs with an incomplete set.

export const MUSIC = {
  menu:    'assets/audio/menu.mp3',
  fight1:  'assets/audio/fight1.mp3',
  fight2:  'assets/audio/fight2.mp3',
  fight3:  'assets/audio/fight3.mp3',
  fight4:  'assets/audio/fight4.mp3',
  fight5:  'assets/audio/fight5.mp3',
  fight6:  'assets/audio/fight6.mp3',
  fight7:  'assets/audio/fight7.mp3',
  fight8:  'assets/audio/fight8.mp3',
  fight9:  'assets/audio/fight9.mp3',
  fight10: 'assets/audio/fight10.mp3',
  boss:    'assets/audio/boss.mp3',
  final:   'assets/audio/final.mp3',
  victory: 'assets/audio/victory.mp3',
};

export const TRACK_NAME = {
  menu: 'Sharpened Pencils',
  fight1: 'Scrap Yard Scrap',
  fight2: 'Biro Surf',
  fight3: 'Heavy Hand',
  fight4: 'Desk Percussion',
  fight5: 'Shuffle and Swing',
  fight6: 'Standoff at the Margin',
  fight7: 'Breakbeat Brawl',
  fight8: 'Held Breath',
  fight9: 'Dojo Riot',
  fight10: 'Brass and Thunder',
  boss: "Champion's Coil",
  final: 'The Last Page',
  victory: 'Champion of the Dojo',
};

/**
 * The fight roster grows as you get further in. Four to start, then two more at each gate.
 * Menu, boss, final and victory are contextual and always available — gating those would
 * just mean silence in the places they belong.
 *
 * It also spreads the download: tracks are fetched lazily on first play, so a new player
 * pulls four files rather than fourteen.
 */
export const FIGHT_POOL = [
  { id: 'fight1',  unlockAt: 0 },
  { id: 'fight4',  unlockAt: 0 },
  { id: 'fight5',  unlockAt: 0 },
  { id: 'fight2',  unlockAt: 0 },
  { id: 'fight6',  unlockAt: 10 },
  { id: 'fight7',  unlockAt: 10 },
  { id: 'fight8',  unlockAt: 20 },
  { id: 'fight3',  unlockAt: 20 },
  { id: 'fight9',  unlockAt: 30 },
  { id: 'fight10', unlockAt: 30 },
];

export const UNLOCK_GATES = [10, 20, 30];

export function unlockedFightTracks(reached) {
  return FIGHT_POOL.filter((t) => t.unlockAt <= reached);
}
