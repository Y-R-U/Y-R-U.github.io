// Halloween theme — "Harvest" (white: bone + pumpkin orange, amber glow) vs
// "Midnight" (black: violet-black + ghost-green glow). Cast plan in docs/notes/sculpt_halloween.md.
// All six pieces are built: pawn (jack-o'-lantern imp), rook (haunted crypt tower), knight
// (Nightmare skull with a ghost-flame mane), bishop (Witch with a broom across her brim), queen
// (Vampire Countess, royals.js) and king (Pumpkin King, royals.js). Board: graveyard flagstones
// (board.js). Battle anims still fall back to Classic.
import pieces from './pieces.js';
import royals from './royals.js';
import { moveAnims } from './anims.js';
import { battleAnims } from './battles.js';   // battle-1
import { build, environment, overlayStyle } from './board.js';

export default {
  id: 'halloween',
  name: 'Halloween',
  tags: ['spooky', 'pumpkins', 'graveyard'],
  board: { build, environment, overlayStyle },   // graveyard flagstones + iron railing; hill/moon when tilted
  // faces (imp, witch, countess, king) turn toward their own player; the Nightmare keeps the sideways look (board-2)
  pieces: { ...pieces, ...royals, facing: { byType: { p: 'player', b: 'player', q: 'player', k: 'player' } } },
  // name tags ("Pumpkin Imp · Pawn")
  names: { p: 'Pumpkin Imp', n: 'Nightmare', b: 'Witch', r: 'Crypt Tower', q: 'Vampire Countess', k: 'Pumpkin King' },
  moveAnims, battleAnims,
  sounds: () => import('./sounds.js'),   // audio agent: lazy theme sounds + music (js/audio/)
};
