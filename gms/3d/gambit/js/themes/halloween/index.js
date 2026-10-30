// Halloween theme — "Harvest" (white: bone + pumpkin orange, amber glow) vs
// "Midnight" (black: violet-black + ghost-green glow). Cast plan in docs/notes/sculpt_halloween.md.
// Built so far: pawn (jack-o'-lantern imp), rook (haunted crypt tower), knight (Nightmare skull
// with a ghost-flame mane), bishop (Witch with a broom across her brim). Missing pieces, the
// board and battle anims fall back to Classic automatically.
import pieces from './pieces.js';
import royals from './royals.js';
import { moveAnims } from './anims.js';

export default {
  id: 'halloween',
  name: 'Halloween',
  tags: ['spooky', 'pumpkins', 'graveyard'],
  pieces: { ...pieces, ...royals },
  // name tags ("Pumpkin Imp · Pawn"); the cast for unbuilt pieces is the plan in the notes
  names: { p: 'Pumpkin Imp', n: 'Nightmare', b: 'Witch', r: 'Crypt Tower', q: 'Vampire Countess', k: 'Pumpkin King' },
  moveAnims,
};
