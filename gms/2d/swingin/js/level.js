// ============================================================
//  LEVEL GENERATION
// ============================================================

import { H, FROG_H } from './config.js';
import { game, camera, getEffective, world } from './state.js';
import { resetFrog } from './frog.js';

const GROUND_Y = H - 60;
export { GROUND_Y };

export function generateLevel(lvl) {
  world.anchors = [];
  world.collectibles = [];
  world.platforms = [];

  const difficulty = Math.min(lvl, 20);
  const numAnchors = 8 + Math.floor(difficulty * 1.5);
  world.levelWidth = 400 + numAnchors * 200;

  // Ground platforms with occasional gaps
  let gx = 0;
  while (gx < world.levelWidth + 200) {
    const pw = 100 + Math.random() * 200;
    world.platforms.push({ x: gx, y: GROUND_Y, w: pw });
    gx += pw + (Math.random() < 0.3 + difficulty * 0.02 ? 80 + Math.random() * 60 : 0);
  }
  world.platforms.unshift({ x: 0, y: GROUND_Y, w: 200 });

  // Swing anchors
  let ax = 250;
  const types = ['twig', 'leaf', 'grass', 'flower', 'branch'];

  for (let i = 0; i < numAnchors; i++) {
    const spacing = 120 + Math.random() * 100 - difficulty * 2;
    ax += Math.max(80, spacing);
    const ay = 80 + Math.random() * (GROUND_Y - 200);
    const type = types[Math.floor(Math.random() * types.length)];

    world.anchors.push({
      x: ax, y: ay, type,
      bobOffset: Math.random() * Math.PI * 2,
      bobSpeed: 0.5 + Math.random() * 1.5,
      bobAmount: type === 'leaf' ? 3 : (type === 'grass' ? 5 : 1),
      swayAngle: 0, used: false,
    });

    // Bugs near some anchors
    if (Math.random() < 0.5) {
      world.collectibles.push({
        x: ax + (Math.random() - 0.5) * 80,
        y: ay + 30 + Math.random() * 60,
        collected: false,
        type: 'gnat',
        bobOffset: Math.random() * Math.PI * 2,
        wingAngle: 0,
      });
    }
  }

  // Extra collectibles
  for (let i = 0; i < Math.floor(numAnchors * 0.3); i++) {
    world.collectibles.push({
      x: 300 + Math.random() * (world.levelWidth - 400),
      y: 150 + Math.random() * (GROUND_Y - 250),
      collected: false,
      type: Math.random() < 0.3 ? 'beetle' : 'gnat',
      bobOffset: Math.random() * Math.PI * 2,
      wingAngle: 0,
    });
  }

  // Fly target
  world.flyTarget = {
    x: world.levelWidth - 80,
    y: 120 + Math.random() * (GROUND_Y - 300),
    radius: 20, wingAngle: 0,
    bobOffset: 0, caught: false,
  };

  resetFrog(100, GROUND_Y - FROG_H);
  game.timer = getEffective('timerBoost');
  camera.x = 0;
  camera.y = 0;
}
