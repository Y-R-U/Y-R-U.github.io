// Sci-fi theme — "Aegis vs Nova": sleek hard-surface droids and machines.
// White = pearl ceramic + cyan light-lines, black = gunmetal + magenta light-lines.
// Built so far: Pawn (Drone), Rook (Bastion). Missing pieces (n b q k), the board and
// battle anims fall back to Classic (MODEL_GUIDE §1). Concept: docs/notes/sculpt_scifi.md.
import { pawn } from './pawn.js';
import { rook } from './rook.js';
import { moveAnims } from './anims.js';

export default {
  id: 'scifi',
  name: 'Sci-fi',
  tags: ['droids', 'hard-surface', 'neon'],
  pieces: { p: pawn, r: rook },
  names: { p: 'Drone', n: 'Strider', b: 'Psi Oracle', r: 'Bastion', q: 'AI Core', k: 'Commander' },
  moveAnims,
};
