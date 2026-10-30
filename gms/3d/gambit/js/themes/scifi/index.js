// Sci-fi theme — "Aegis vs Nova": sleek hard-surface droids and machines.
// White = pearl ceramic + cyan light-lines, black = gunmetal + magenta light-lines.
// Built so far: Pawn (Drone), Rook (Bastion). Missing pieces (n b q k), the board and
// battle anims fall back to Classic (MODEL_GUIDE §1). Concept: docs/notes/sculpt_scifi.md.
import { pawn } from './pawn.js';
import { rook } from './rook.js';
import { knight } from './knight.js';
import { bishop } from './bishop.js';
import { queen, coreSpin } from './queen.js';   // sculptor-scifi-3
import { king, commandJet } from './king.js';   // sculptor-scifi-3
import { build as buildBoard, environment, overlayStyle } from './board.js';   // sculptor-scifi-3
import { moveAnims } from './anims.js';

export default {
  id: 'scifi',
  name: 'Sci-fi',
  tags: ['droids', 'hard-surface', 'neon'],
  board: { build: buildBoard, environment, overlayStyle },   // station deck; space vista when tilted
  pieces: { p: pawn, n: knight, b: bishop, r: rook, q: queen, k: king,
    facing: { byType: { k: 'player' } } },   // the Commander faces its owner
  names: { p: 'Drone', n: 'Strider', b: 'Psi Oracle', r: 'Bastion', q: 'AI Core', k: 'Commander' },
  moveAnims: [...moveAnims, coreSpin, commandJet],   // + AI Core / Commander moves (scifi-3)
  sounds: () => import('./sounds.js'),   // synthy clamp/zap/alert set (scifi-3, audio-agent format)
};
