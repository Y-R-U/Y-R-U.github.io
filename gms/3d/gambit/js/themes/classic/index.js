// Classic theme — the exemplar. Copy this folder to start a new theme.
import pieces from './pieces.js';
import { build, environment } from './board.js';
import { moveAnims, battleAnims } from './anims.js';

export default {
  id: 'classic',
  name: 'Classic',
  tags: ['staunton', 'gold', 'marble'],
  board: {
    build,                 // (THREE, kit, {orientation, coordinates}) -> Object3D, playing surface at y=0
    environment,           // optional (THREE, kit) -> {object, background?, fog?, lights?, envScene?, minPhi?}
    // lightRig: optional (THREE, kit) -> Group of lights (first castShadow DirectionalLight gets the shadow setup)
  },
  pieces: { ...pieces },   // p n b r q k : (THREE, kit, {color}) -> Object3D
  moveAnims,
  battleAnims,
  sounds: () => import('./sounds.js'),   // audio agent: lazy theme sounds + music (js/audio/)
};
