// Fantasy theme — figurines in the style of refs/ref_fantasy_island_board.png:
// ivory/gold with blue cloth (white) vs ebony/dark iron with red cloth (black).
// Built so far: Knight (armoured warhorse) and Bishop (wizard). Missing pieces, the board,
// and battle anims fall back to Classic (see MODEL_GUIDE.md §1).
import { knight } from './knight.js';
import { bishop } from './bishop.js';
import { pawn } from './pawn.js';
import { rook } from './rook.js';
import { moveAnims } from './anims.js';

export default {
  id: 'fantasy',
  name: 'Fantasy',
  tags: ['figurines', 'wizards', 'knights'],
  pieces: { p: pawn, n: knight, b: bishop, r: rook },
  // character names for the board's name tags ("Wizard · Bishop"); unbuilt pieces get the
  // names their fantasy models are planned to carry
  names: { p: 'Squire', n: 'Warhorse', b: 'Wizard', r: 'Watchtower', q: 'Sorceress', k: 'High King' },
  moveAnims,
  battleAnims: [],
};
