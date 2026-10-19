// Board geometry (D4), shared by every arena theme (D21). Camera looks down -z; player on the left (x < 0), enemy right.
// slot = col * 3 + lane; col 0 = front (next to the centre line), col 1 = back (outer edge);
// lane 0 = near (closest to the camera), 1 = mid, 2 = far.
export const BOARD = {
  W: 14,                // playable floor rectangle width (x)
  zNear: 5, zFar: -26.66, // battle-4: -24 -> -26.66 (one lattice row) so the far row's heads clear the back barrier  // playable floor rectangle along z (deep on purpose: with fov 40 the camera fit settles at ~39-42 deg)
  // Slots sit on the floor's hex lattice (gridR 1.533: column step 1.5R = 2.3, row step sqrt3 R = 2.656): front column =
  // lattice column 1, back = column 2, lanes 3 rows apart, back column half a lane further away -> even 6-row stagger.
  laneZ: [1.5, -6.467, -14.433],
  colX: [2.3, 4.3],     // back column 0.3 m inside its lattice column: keeps wide attack anims clear of the HUD side buttons (battle-4: 4.5 -> 4.3)
  backShift: -3.983,
  hexR: 1.2,            // node ring radius (apothem-ish, world m)
  gridR: 1.5333,        // floor hex lattice circumradius; lattice column 0 sits on the centre line
  unitScale: 2.0,       // D23 uniform board scale (battle-3: 1.9 -> 2.0 with the roomier lattice layout)
};
function derive() { BOARD.zMid = (BOARD.zNear + BOARD.zFar) / 2; BOARD.L = BOARD.zNear - BOARD.zFar; }
derive();
// test hook (tools/battle_test.html ?bW=..&blaneZ=a,b,c): override board constants before a battle is built
export function configureBoard(over = {}) { Object.assign(BOARD, over); derive(); return BOARD; }

export function slotPos(side, slot) {
  const col = slot >= 3 ? 1 : 0, lane = slot % 3;
  const sx = side === 'enemy' ? 1 : -1;
  return { x: sx * BOARD.colX[col], z: BOARD.laneZ[lane] + (col ? BOARD.backShift : 0), col, lane };
}

export const FACTION_COLORS = {
  corporate: 0x29d6ff,
  rogue: 0xff6a1a,
  experimental: 0xb05cff,
  legendary: 0xffc33a,
  // fantasy NPC factions (D21, ROSTER.md plate colours): order = knights / frost wolves, horde = minotaur / ember wolves / shaman, wild = elves / treant
  order: 0x3b82f6,
  horde: 0xef4444,
  wild: 0x22c55e,
};
export function plateColor(faction, rarity) {
  if (rarity === 'legendary' || faction === 'legendary') return FACTION_COLORS.legendary;
  return FACTION_COLORS[faction] ?? FACTION_COLORS.corporate;
}

// rarity cue on the plates (mirrors js/actors/materials.js RARITY_COLORS: steel / blue / violet / gold)
export const RARITY_INDEX = { common: 0, rare: 1, epic: 2, legendary: 3 };
export const RARITY_COLORS = [0x9aa4b0, 0x3d9bff, 0xb05cff, 0xffb43a];
