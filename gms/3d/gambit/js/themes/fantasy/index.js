// Fantasy theme — figurines in the style of refs/ref_fantasy_island_board.png:
// ivory/gold with blue cloth (white) vs ebony/dark iron with red cloth (black).
// Pieces: Pawn (squire), Knight (armoured warhorse), Bishop (wizard), Rook (watchtower),
// Queen (sorceress), King (high king). squares.js builds the marble + gold-inlay board (colours
// from kit.boardLooks.marble, D28); board.js adds the floating-island environment (tilted views only).
import { knight } from './knight.js';
import { bishop } from './bishop.js';
import { pawn } from './pawn.js';
import { rook } from './rook.js';
import { queen } from './queen.js';
import { king } from './king.js';
import { environment } from './board.js';
import { build } from './squares.js';
import { moveAnims } from './anims.js';
import { battleAnims } from './battles.js';   // battle-1

export default {
  id: 'fantasy',
  name: 'Fantasy',
  tags: ['figurines', 'wizards', 'knights'],
  // marble squares with gold inlay + ornate frame (D28 colours from kit.boardLooks); island diorama when tilted
  board: { build, environment },
  // the wizard turns 3/4 toward his owner through the board's facing hook (squire/queen/king bake
  // their YAW: the king's cross must stay on the board axes)
  pieces: { p: pawn, n: knight, b: bishop, r: rook, q: queen, k: king, facing: { byType: { b: 0.5 } } },
  // character names for the board's name tags ("Wizard · Bishop"); unbuilt pieces get the
  // names their fantasy models are planned to carry
  names: { p: 'Squire', n: 'Warhorse', b: 'Wizard', r: 'Watchtower', q: 'Sorceress', k: 'High King' },
  moveAnims,
  battleAnims,
  sounds: () => import('./sounds.js'),   // audio agent: lazy theme sounds + music (js/audio/)
};
