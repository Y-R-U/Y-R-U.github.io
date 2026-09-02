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
  // After dark. Same roles, different world.
  dmenu:    'assets/audio/dmenu.mp3',
  dfight1:  'assets/audio/dfight1.mp3',
  dfight2:  'assets/audio/dfight2.mp3',
  dfight3:  'assets/audio/dfight3.mp3',
  dfight4:  'assets/audio/dfight4.mp3',
  dfight5:  'assets/audio/dfight5.mp3',
  dfight6:  'assets/audio/dfight6.mp3',
  dboss:    'assets/audio/dboss.mp3',
  dfinal:   'assets/audio/dfinal.mp3',
  dvictory: 'assets/audio/dvictory.mp3',
};

/** Which track fills each role, per theme. */
export const ROLE = {
  light: { menu: 'menu', boss: 'boss', final: 'final', victory: 'victory' },
  dark:  { menu: 'dmenu', boss: 'dboss', final: 'dfinal', victory: 'dvictory' },
};
export const roleTrack = (theme, role) => (ROLE[theme] || ROLE.light)[role];

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
  dmenu: 'Waiting on the Corner',
  dfight1: 'Back Alley',
  dfight2: 'Night Streets',
  dfight3: 'Warehouse',
  dfight4: 'Running',
  dfight5: 'Cold Swagger',
  dfight6: 'Riot',
  dboss: 'Something About to Go Off',
  dfinal: 'The Last Night',
  dvictory: 'Walking Away From It',
};

/**
 * The fight roster grows as you get further in. Four to start, then two more at each gate.
 * Menu, boss, final and victory are contextual and always available — gating those would
 * just mean silence in the places they belong.
 *
 * It also spreads the download: tracks are fetched lazily on first play, so a new player
 * pulls four files rather than fourteen.
 */
export const FIGHT_POOLS = {
  light: [
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
  ],
  // Six after dark: four from the street corner, two more once you have a name.
  dark: [
    { id: 'dfight2', unlockAt: 0 },
    { id: 'dfight1', unlockAt: 0 },
    { id: 'dfight5', unlockAt: 0 },
    { id: 'dfight3', unlockAt: 0 },
    { id: 'dfight4', unlockAt: 15 },
    { id: 'dfight6', unlockAt: 15 },
  ],
};
export const poolFor = (theme) => FIGHT_POOLS[theme] || FIGHT_POOLS.light;
export const FIGHT_POOL = FIGHT_POOLS.light;

export const UNLOCK_GATES = { light: [10, 20, 30], dark: [15] };

export function unlockedFightTracks(reached, theme = 'light') {
  return poolFor(theme).filter((t) => t.unlockAt <= reached);
}

/**
 * Pick a fight track, avoiding whatever was heard recently.
 *
 * Rotation used to be a pure function of the level index, which meant level 1 was always
 * the first track in the roster — so replaying or refreshing on an early level played the
 * same song every single time, and the rest of the roster was unreachable from a fresh save.
 * Keeping a short history fixes both the within-run repeats and the across-refresh ones.
 *
 * @param poolIds unlocked track ids
 * @param recent  most-recently-played ids, oldest first
 */
export function pickFightTrack(poolIds, recent = [], rnd = Math.random) {
  if (!poolIds.length) return null;
  if (poolIds.length === 1) return poolIds[0];
  const avoid = Math.min(poolIds.length - 1, Math.ceil(poolIds.length / 2));
  const tail = recent.slice(-avoid);
  const fresh = poolIds.filter((id) => !tail.includes(id));
  const choices = fresh.length ? fresh : poolIds.filter((id) => id !== recent[recent.length - 1]);
  const list = choices.length ? choices : poolIds;
  return list[Math.floor(rnd() * list.length)];
}

export const RECENT_KEEP = 6;
