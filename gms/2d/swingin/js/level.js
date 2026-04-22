// ============================================================
//  LEVEL GENERATION
// ============================================================

import { H, FROG_H, BASE_TONGUE_LENGTH } from './config.js';
import { game, camera, getEffective, world } from './state.js';
import { resetFrog } from './frog.js';

const GROUND_Y = H - 60;
export { GROUND_Y };

// Cap consecutive-anchor gap a bit under base tongue length so every
// transition is a direct-grab candidate, even without upgrades.
const MAX_ANCHOR_GAP = BASE_TONGUE_LENGTH - 20; // 160

function makePlatform(x, y, w) {
  const dirt = [];
  const count = Math.floor(w / 15);
  for (let i = 0; i < count; i++) {
    dirt.push({ dx: Math.random() * w, dy: 12 + Math.random() * 20, dw: 2 + Math.random() * 3 });
  }
  return { x, y, w, dirt };
}

export function generateLevel(lvl) {
  world.anchors = [];
  world.collectibles = [];
  world.platforms = [];

  const difficulty = Math.min(lvl, 20);
  const numAnchors = 8 + Math.floor(difficulty * 1.5);
  const types = ['twig', 'leaf', 'grass', 'flower', 'branch'];

  // --- Swing anchors (reachable chain) ---
  for (let i = 0; i < numAnchors; i++) {
    let aposX, aposY;
    if (i === 0) {
      // First anchor — pinned so it's reachable from the frog's spawn.
      aposX = 220;
      aposY = GROUND_Y - 140;
    } else {
      const prev = world.anchors[i - 1];
      const spacing = 100 + Math.random() * 60; // 100..160
      const dyLimit = Math.sqrt(Math.max(0, MAX_ANCHOR_GAP * MAX_ANCHOR_GAP - spacing * spacing));
      const dy = (Math.random() * 2 - 1) * dyLimit;
      aposX = prev.x + spacing;
      aposY = Math.max(80, Math.min(GROUND_Y - 80, prev.y + dy));
    }
    const type = types[Math.floor(Math.random() * types.length)];

    world.anchors.push({
      x: aposX, y: aposY, type,
      bobOffset: Math.random() * Math.PI * 2,
      bobSpeed: 0.5 + Math.random() * 1.5,
      bobAmount: type === 'leaf' ? 3 : (type === 'grass' ? 5 : 1),
      swayAngle: 0, used: false,
    });

    // Bugs near some anchors
    if (Math.random() < 0.5) {
      world.collectibles.push({
        x: aposX + (Math.random() - 0.5) * 60,
        y: aposY + 25 + Math.random() * 40,
        collected: false,
        type: 'gnat',
        bobOffset: Math.random() * Math.PI * 2,
        wingAngle: 0,
      });
    }
  }

  const lastAnchor = world.anchors[world.anchors.length - 1];
  world.levelWidth = lastAnchor.x + 240;

  // --- Ground platforms (with occasional gaps) ---
  let gx = 0;
  while (gx < world.levelWidth + 200) {
    const pw = 100 + Math.random() * 200;
    world.platforms.push(makePlatform(gx, GROUND_Y, pw));
    gx += pw + (Math.random() < 0.3 + difficulty * 0.02 ? 80 + Math.random() * 60 : 0);
  }
  world.platforms.unshift(makePlatform(0, GROUND_Y, 200));

  // --- Extra airborne collectibles ---
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

  // --- Fly target: near one of the last 3 anchors, slightly above it ---
  const lastThree = world.anchors.slice(-3);
  const flyAnchor = lastThree[Math.floor(Math.random() * lastThree.length)];
  world.flyTarget = {
    x: flyAnchor.x + (Math.random() * 60 - 30),
    y: Math.max(80, flyAnchor.y - 40 - Math.random() * 40),
    radius: 20, wingAngle: 0,
    bobOffset: 0, caught: false,
  };

  resetFrog(100, GROUND_Y - FROG_H);
  game.timer = getEffective('timerBoost');
  camera.x = 0;
  camera.y = 0;
}
