// Plain 2D theme (theme2d agent): the "boring" chess-site look Aaron asked for —
// flat green/cream board, flat Staunton-style icons (own art, art.js), straight top-down
// camera, quick slides and fade-out captures. Very light: ~13 draw calls, 2 triangles a piece,
// no lights, no shadows, no ambient animation.
import pieces from './pieces.js';
import { build, lightRig, overlayStyle } from './board.js';
import { moveAnims, battleAnims, captureAnim, castleAnim, promoteAnim } from './anims.js';

export default {
  id: 'plain',
  name: 'Plain 2D',
  tags: ['2d', 'flat', 'simple'],
  board: {
    build,
    lightRig,
    overlayStyle,
    view: 'top',          // board hook: the camera is fixed straight overhead (View button / V do nothing)
    pixelRatio: 3,        // board hook: render up to DPR 3 (cheap here) so the icons are crisp on phones
  },
  pieces,                 // p n b r q k + facing:{view:true} + contact:false
  moveAnims,
  battleAnims,
  captureAnim,            // board hook: battles Off -> plain fade (no smoke)
  castleAnim,             // board hook: the castling rook slides (no hop)
  promoteAnim,
  promoteFx: false,       // board hook: no sparkles / flash / spin on promotion
  sounds: () => import('./sounds.js'),
};
