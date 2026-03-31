// ─── Game: state machine, round logic, wave generation, main loop ───

import * as THREE from 'three';
import { ARENA, loadSave, writeSave, getUpgradeValue, getBallColor } from './config.js';
import { initMusic, sfxDrop, sfxBounce, sfxMerge, sfxBlockHit, sfxBlockDestroy,
         sfxWaveComplete, sfxGameOver, sfxSuction } from './audio.js';
import { initScene, scene, camera, renderer, clock,
         screenShake, updateShake, initParticles, spawnParticles,
         updateParticles, toScreen, renderScene } from './scene.js';
import { initPhysics, world, stepPhysics } from './physics.js';
import { Ball, Block, Pipe, SuctionTube, BlackHole, WhiteHole, EventOrb } from './entities.js';
import { initUI, showScreen, updateHUD, showWaveBanner, showChainText,
         showGameOver, spawnDamageNumber, showEventBanner,
         showStageClearCountdown, hideStageClearBanner } from './ui.js';

// ─── State ───
let state = 'title'; // title | playing | waveTransition | gameOver
let balls = [];
let blocks = [];
let pipe = null;
let suctionTube = null;
let score = 0;
let wave = 0;
let bestMerge = 2;
let chainCount = 0;
let chainTimer = 0;
let dropCooldown = 0;
let pipeQueue = []; // indices into balls[] for balls currently in pipe
let isDragging = false;
let hasDroppedAny = false; // prevents round-complete before any balls dropped
let waveTransitionTimer = 0;
let allBlocksClearedTimer = 0; // countdown to next wave after all blocks destroyed
let save = null;

// Per-ball hit cooldown (ball index → timestamp)
const ballHitCooldowns = new Map();
const HIT_COOLDOWN = 0.3; // seconds between hits for same ball

// ─── Black hole / White hole system ───
let blackHole = null;      // active black hole entity
let whiteHole = null;       // active white hole entity
let limboBalls = [];        // balls trapped by black hole { ballIdx, captureTime }
let blackHoleTimer = 0;     // countdown to next black hole spawn
let whiteHoleTimer = 0;     // countdown to next white hole spawn
const BLACK_HOLE_INTERVAL_MIN = 12;
const BLACK_HOLE_INTERVAL_MAX = 25;
const BLACK_HOLE_LIFETIME = 4.0;
const WHITE_HOLE_LIFETIME = 3.5;

// ─── Event Orbs ───
let eventOrbs = [];
let orbSpawnTimer = 0;
const ORB_INTERVAL_MIN = 8;
const ORB_INTERVAL_MAX = 18;
const ORB_TYPES = ['clone', 'power', 'curse'];

// Upgrade-derived values
let startBallValue = 2;
let ballCount = 5;
let velocityMult = 1;
let critChance = 0;
let mergeLuckChance = 0;
let magnetStrength = 0;
let scoreMult = 1;
let blockHpReduction = 0;

let gameTime = 0;

// ─── Detect touch device ───
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// ─── Init ───
function init() {
  initScene();
  initPhysics();
  initParticles();

  initUI({ onPlay: startRun });

  // Touch / mouse input on the canvas
  const el = renderer.domElement;
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);

  // Prevent context menu & scroll
  document.addEventListener('contextmenu', e => e.preventDefault());
  document.body.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  initMusic();
  showScreen('title-screen');
  loop();
}

// ─── Start a new run ───
function startRun() {
  save = loadSave();
  startBallValue = getUpgradeValue(save, 'ballPower');
  ballCount = getUpgradeValue(save, 'ballCount');
  velocityMult = 1 + getUpgradeValue(save, 'velocity') / 100;
  critChance = getUpgradeValue(save, 'criticalHit') / 100;
  mergeLuckChance = getUpgradeValue(save, 'mergeLuck') / 100;
  magnetStrength = getUpgradeValue(save, 'magnet');
  scoreMult = getUpgradeValue(save, 'scoreBonus');
  blockHpReduction = getUpgradeValue(save, 'sturdyBlocks') / 100;

  // Clean up old state
  cleanup();

  score = 0;
  wave = 0;
  bestMerge = startBallValue;
  chainCount = 0;
  hasDroppedAny = false;
  gameTime = 0;
  allBlocksClearedTimer = 0;
  ballHitCooldowns.clear();
  limboBalls = [];
  blackHoleTimer = randRange(BLACK_HOLE_INTERVAL_MIN, BLACK_HOLE_INTERVAL_MAX);
  whiteHoleTimer = 0;
  orbSpawnTimer = randRange(ORB_INTERVAL_MIN, ORB_INTERVAL_MAX);
  eventOrbs = [];
  state = 'playing';

  // Create pipe + suction
  pipe = new Pipe();
  suctionTube = new SuctionTube();

  // Create balls
  balls = [];
  pipeQueue = [];
  for (let i = 0; i < ballCount; i++) {
    const ball = new Ball(startBallValue, true);
    balls.push(ball);
    pipeQueue.push(i);
    positionBallInPipe(i, pipeQueue.indexOf(i));
  }

  // Start first wave
  nextWave();
  updateHUD(score, wave);
}

function cleanup() {
  balls.forEach(b => b.destroy());
  balls = [];
  pipeQueue = [];
  limboBalls = [];
  blocks.forEach(b => b.destroy());
  blocks = [];
  if (pipe) { pipe.destroy(); pipe = null; }
  if (suctionTube) { suctionTube.destroy(); suctionTube = null; }
  if (blackHole) { blackHole.destroy(); blackHole = null; }
  if (whiteHole) { whiteHole.destroy(); whiteHole = null; }
  eventOrbs.forEach(o => o.destroy());
  eventOrbs = [];
}

function randRange(min, max) {
  return min + Math.random() * (max - min);
}

// ─── Position ball visually inside pipe ───
function positionBallInPipe(ballIdx, queuePos) {
  const ball = balls[ballIdx];
  if (!ball || ball.merged) return;
  const hw = ARENA.width * 0.4;
  const startX = -hw; // queuePos 0 (next to drop) is on the LEFT
  const spacing = ARENA.ballRadius * 3.0;
  const x = startX + queuePos * spacing; // higher queuePos → further right
  ball.mesh.position.set(x, ARENA.pipeY, 0);
  ball.inPipe = true;
}

// ─── Drop ball from pipe ───
function dropBall() {
  if (pipeQueue.length === 0 || dropCooldown > 0) return;

  const ballIdx = pipeQueue.shift();
  const ball = balls[ballIdx];
  if (!ball || ball.merged) return;

  // Drop at the pipe's CURRENT position (already snapped on click)
  const dropX = pipe.currentX;
  ball.spawn(dropX, ARENA.pipeY - 0.6, 0);
  // Give ball a good initial downward velocity
  ball.body.velocity.set(0, -8 * velocityMult, 0);

  sfxDrop();
  pipe.triggerShake();
  dropCooldown = 0.2;
  hasDroppedAny = true;

  // Reposition remaining pipe balls
  pipeQueue.forEach((bi, qi) => positionBallInPipe(bi, qi));
}

// ─── Wave generation ───
function nextWave() {
  wave++;
  const isBoss = wave % 5 === 0;
  showWaveBanner(wave, isBoss);
  updateHUD(score, wave);

  // Move existing blocks up
  blocks.forEach(b => b.moveUp(ARENA.blockRowSpacing));

  // Spawn new row — waves 1-2 are easy training, then difficulty jumps
  const numBlocks = isBoss ? 1 : wave <= 2 ? 2 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 3);
  const hw = ARENA.width / 2 - 1;

  for (let i = 0; i < numBlocks; i++) {
    const x = -hw + (i / Math.max(1, numBlocks - 1)) * (hw * 2);
    // Training waves: very low HP. Post-training: steep exponential ramp
    const baseHp = wave <= 2 ? 3 * wave : 10 * Math.pow(1.3, wave - 2);
    let hp = isBoss ? baseHp * 8 : baseHp * (0.6 + Math.random() * 0.8);
    hp *= (1 - blockHpReduction);
    hp = Math.max(1, Math.ceil(hp));

    const block = new Block(hp, wave, numBlocks === 1 ? 0 : x, ARENA.spawnY);
    if (isBoss) {
      block.isBoss = true;
      block.mesh.scale.multiplyScalar(1.5);
      block.size *= 1.5;
    }
    blocks.push(block);
  }

  // Check game over — if any block top is past danger line
  checkGameOver();
}

function checkGameOver() {
  for (const block of blocks) {
    const topY = block.body.position.y + block.size / 2;
    if (topY >= ARENA.dangerY) {
      triggerGameOver();
      return;
    }
  }
}

function triggerGameOver() {
  state = 'gameOver';
  sfxGameOver();

  // Calculate crystals
  const crystalsEarned = Math.floor((wave * 5 + score / 100) * scoreMult);
  save.crystals += crystalsEarned;
  if (score > save.bestScore) save.bestScore = score;
  if (wave > save.bestWave) save.bestWave = wave;
  writeSave(save);

  showGameOver(score, wave, bestMerge, crystalsEarned);
}

// ─── Input ───
function screenToWorldX(clientX) {
  const ndc = (clientX / window.innerWidth) * 2 - 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndc, 0), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const target = new THREE.Vector3();
  raycaster.ray.intersectPlane(plane, target);
  return target ? target.x : 0;
}

function onPointerDown(e) {
  if (state !== 'playing') return;
  isDragging = true;
  const wx = screenToWorldX(e.clientX);
  // Snap pipe instantly to click position, THEN drop
  pipe.snapToX(wx);
  dropBall();
}

function onPointerMove(e) {
  if (state !== 'playing') return;
  const wx = screenToWorldX(e.clientX);

  if (isDragging) {
    // While dragging (touch or mouse-down-drag): snap pipe to finger/cursor
    pipe.snapToX(wx);
  } else if (!isTouchDevice) {
    // Desktop only: pipe follows mouse even without clicking (lerp target)
    pipe.setTargetX(wx);
  }
}

function onPointerUp() {
  isDragging = false;
}

// ─── Collision detection ───
function handleCollisions() {
  // Ball vs Block (with per-ball hit cooldown)
  for (let bi = 0; bi < balls.length; bi++) {
    const ball = balls[bi];
    if (ball.inPipe || ball.inSuction || ball.merged || ball.inLimbo || !ball.body) continue;

    // Check hit cooldown for this ball
    const lastHit = ballHitCooldowns.get(bi) || 0;
    if (gameTime - lastHit < HIT_COOLDOWN) continue;

    for (const block of blocks) {
      if (block.dead) continue;
      const dist = ball.body.position.distanceTo(block.body.position);
      const minDist = ARENA.ballRadius + block.size * 0.7;
      if (dist < minDist) {
        // Damage
        let dmg = ball.effectiveValue;
        const isCrit = Math.random() < critChance;
        if (isCrit) dmg *= 2;

        block.takeDamage(dmg);
        score += dmg * scoreMult;
        updateHUD(score, wave);

        // VFX
        const screenPos = toScreen(block.body.position);
        spawnDamageNumber(screenPos.x, screenPos.y, dmg, isCrit);
        spawnParticles(ball.mesh.position, getBallColor(ball.value), 6);
        sfxBlockHit();

        if (block.dead) {
          sfxBlockDestroy();
          screenShake(block.isBoss ? 0.4 : 0.2);
          score += block.maxHp * scoreMult;
          updateHUD(score, wave);
        }

        // Bounce ball away from block
        const dir = ball.body.position.vsub(block.body.position);
        dir.normalize();
        ball.body.velocity.copy(dir.scale(6 * velocityMult));

        // Set cooldown
        ballHitCooldowns.set(bi, gameTime);
        break; // one collision per frame per ball
      }
    }
  }

  // Ball vs Ball merging (max one merge per frame to avoid cascade)
  let didMerge = false;
  for (let i = 0; i < balls.length && !didMerge; i++) {
    const a = balls[i];
    if (a.merged || a.inSuction || a.inLimbo) continue;
    for (let j = i + 1; j < balls.length && !didMerge; j++) {
      const b = balls[j];
      if (b.merged || b.inSuction || b.inLimbo) continue;
      if (a.value !== b.value) continue;

      const aInPipe = a.inPipe;
      const bInPipe = b.inPipe;

      // Both in pipe — only merge adjacent balls in the queue
      if (aInPipe && bInPipe) {
        const aq = pipeQueue.indexOf(i);
        const bq = pipeQueue.indexOf(j);
        if (aq === -1 || bq === -1 || Math.abs(aq - bq) !== 1) continue;
        mergeBalls(i, j);
        didMerge = true;
        continue;
      }

      // Both in play area
      if (!aInPipe && !bInPipe && a.body && b.body) {
        const dist = a.body.position.distanceTo(b.body.position);
        if (dist < ARENA.ballRadius * 2.5) {
          mergeBalls(i, j);
          didMerge = true;
        }
      }
    }
  }
}

function mergeBalls(idxA, idxB) {
  const a = balls[idxA];
  const b = balls[idxB];

  const aWasTemporary = a.isTemporary; // save before modifying

  let newValue = a.value * 2;
  // Merge luck: chance to go one tier higher
  if (Math.random() < mergeLuckChance) {
    newValue *= 2;
  }

  // Keep ball A, destroy B
  a.updateVisual(newValue);
  // Merge result is always permanent — clones that merge stay in play
  a.isTemporary = false;
  if (a.body) {
    a.mat.emissiveIntensity = 0.5;
    setTimeout(() => { if (!a.merged) a.mat.emissiveIntensity = 0.15; }, 300);
  }

  // Particles at merge position
  const pos = a.body ? a.body.position : a.mesh.position;
  spawnParticles(pos, getBallColor(newValue), 15);
  sfxMerge();

  if (newValue > bestMerge) bestMerge = newValue;

  // Remove b from pipe queue if present
  const bQueueIdx = pipeQueue.indexOf(idxB);
  if (bQueueIdx !== -1) pipeQueue.splice(bQueueIdx, 1);

  const bWasTemporary = b.isTemporary;
  b.destroy();

  // Only spawn a replacement ball if both merging balls were primary (not clones)
  // This prevents clone orbs from inflating the ball count
  if (!aWasTemporary && !bWasTemporary) {
    const newBall = new Ball(startBallValue, true);
    balls.push(newBall);
    const newIdx = balls.length - 1;
    pipeQueue.push(newIdx);
    positionBallInPipe(newIdx, pipeQueue.indexOf(newIdx));
  }

  // Reposition remaining pipe balls
  pipeQueue.forEach((bi, qi) => positionBallInPipe(bi, qi));

  // Chain tracking
  chainCount++;
  chainTimer = 1.0;
  if (chainCount >= 2) {
    showChainText(chainCount);
  }

  score += newValue * 2 * scoreMult;
  updateHUD(score, wave);
}

// ─── Suction tube logic ───
function updateSuction(dt) {
  const suctionX = ARENA.width / 2 - 0.5;
  const floorY = -ARENA.height / 2 + 1.5;

  for (const ball of balls) {
    if (ball.merged || ball.inPipe || ball.inSuction || ball.inLimbo || !ball.body) continue;

    const bx = ball.body.position.x;
    const by = ball.body.position.y;
    const bvy = ball.body.velocity.y;

    // Enter suction if near right wall and near/below floor level, and moving slowly
    if (bx > suctionX && by < floorY && Math.abs(bvy) < 3) {
      ball.inSuction = true;
      ball.suctionProgress = 0;
      world.removeBody(ball.body);
      ball.body = null;
      sfxSuction();
    }
  }

  // Animate balls in suction tube
  const suctionTopY = ARENA.pipeY;
  for (const ball of balls) {
    if (!ball.inSuction || ball.merged) continue;

    ball.suctionProgress += dt * 1.5;
    const t = Math.min(ball.suctionProgress, 1);
    const tubeX = ARENA.width / 2 + 0.1;
    const startY = -ARENA.height / 2 + 1;
    if (t < 0.8) {
      const upT = t / 0.8;
      ball.mesh.position.set(tubeX, startY + upT * (suctionTopY - startY), 0);
    } else {
      const arcT = (t - 0.8) / 0.2;
      const pipeEndX = ARENA.width * 0.4;
      ball.mesh.position.set(
        tubeX + (pipeEndX - tubeX) * arcT,
        suctionTopY,
        0
      );
    }

    if (t >= 1) {
      ball.inSuction = false;
      // Temporary clone balls vanish after traversing suction
      if (ball.isTemporary) {
        ball.destroy();
        ball.merged = true; // mark so it's skipped everywhere
      } else {
        ball.inPipe = true;
        const idx = balls.indexOf(ball);
        if (idx !== -1 && !pipeQueue.includes(idx)) {
          pipeQueue.push(idx);
          positionBallInPipe(idx, pipeQueue.indexOf(idx));
        }
      }
    }
  }
}

// ─── Black Hole / White Hole Events ───
function updateBlackWhiteHoles(dt) {
  // ── Black hole spawning ──
  if (!blackHole && blackHoleTimer > 0) {
    blackHoleTimer -= dt;
    if (blackHoleTimer <= 0 && hasDroppedAny) {
      // Spawn a black hole at a random position in the play area
      const x = randRange(-ARENA.width / 2 + 1.5, ARENA.width / 2 - 1.5);
      const y = randRange(-ARENA.height / 2 + 3, ARENA.height / 2 - 3);
      blackHole = new BlackHole(x, y);
      blackHole.lifetime = BLACK_HOLE_LIFETIME;
      showEventBanner('⚫ BLACK HOLE', '#aa44ff');
    }
  }

  // ── Active black hole ──
  if (blackHole) {
    blackHole.lifetime -= dt;
    blackHole.update(dt);

    // Check balls near the black hole — suck them in
    for (let bi = 0; bi < balls.length; bi++) {
      const ball = balls[bi];
      if (ball.merged || ball.inPipe || ball.inSuction || ball.inLimbo || !ball.body) continue;

      const dx = blackHole.x - ball.body.position.x;
      const dy = blackHole.y - ball.body.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Gravitational pull within range
      if (dist < 3.0 && dist > 0.01) {
        const pullForce = 8 / (dist * dist + 0.5);
        ball.body.velocity.x += (dx / dist) * pullForce * dt;
        ball.body.velocity.y += (dy / dist) * pullForce * dt;
      }

      // Capture ball if very close
      if (dist < 0.6) {
        ball.inLimbo = true;
        ball.mesh.visible = false;
        if (ball.body) {
          world.removeBody(ball.body);
          ball.body = null;
        }
        limboBalls.push({ ballIdx: bi, captureTime: gameTime });
        spawnParticles({ x: blackHole.x, y: blackHole.y, z: 0 }, 0x8800ff, 10);
        screenShake(0.15);
      }
    }

    // Remove black hole when expired
    if (blackHole.lifetime <= 0) {
      blackHole.destroy();
      blackHole = null;
      // Schedule white hole if we have limbo balls
      if (limboBalls.length > 0) {
        whiteHoleTimer = randRange(3, 6);
      }
      // Schedule next black hole
      blackHoleTimer = randRange(BLACK_HOLE_INTERVAL_MIN, BLACK_HOLE_INTERVAL_MAX);
    }
  }

  // ── White hole spawning ──
  if (!whiteHole && whiteHoleTimer > 0 && limboBalls.length > 0) {
    whiteHoleTimer -= dt;
    if (whiteHoleTimer <= 0) {
      const x = randRange(-ARENA.width / 2 + 1.5, ARENA.width / 2 - 1.5);
      const y = randRange(-ARENA.height / 2 + 3, 0);
      whiteHole = new WhiteHole(x, y);
      whiteHole.lifetime = WHITE_HOLE_LIFETIME;
      showEventBanner('⚪ WHITE HOLE', '#88ddff');
    }
  }

  // ── Active white hole — release limbo balls ──
  if (whiteHole) {
    whiteHole.lifetime -= dt;
    whiteHole.update(dt);

    // Spit out one limbo ball per ~0.4s
    if (limboBalls.length > 0) {
      whiteHole._spitTimer = (whiteHole._spitTimer || 0) + dt;
      if (whiteHole._spitTimer > 0.4) {
        whiteHole._spitTimer = 0;
        const entry = limboBalls.shift();
        const ball = balls[entry.ballIdx];
        if (ball && !ball.merged) {
          ball.inLimbo = false;
          ball.mesh.visible = true;
          // Re-spawn with physics at white hole position
          ball.spawn(whiteHole.x, whiteHole.y, 0);
          // Eject in a random upward direction
          ball.body.velocity.set(
            (Math.random() - 0.5) * 6,
            3 + Math.random() * 4,
            0
          );
          spawnParticles({ x: whiteHole.x, y: whiteHole.y, z: 0 }, 0x88ddff, 12);
        }
      }
    }

    // Remove white hole when expired or all balls freed
    if (whiteHole.lifetime <= 0 || (limboBalls.length === 0 && whiteHole._spitTimer > 0.5)) {
      // Any remaining limbo balls get freed at suction entrance
      for (const entry of limboBalls) {
        const ball = balls[entry.ballIdx];
        if (ball && !ball.merged) {
          ball.inLimbo = false;
          ball.mesh.visible = true;
          ball.inSuction = true;
          ball.suctionProgress = 0;
        }
      }
      limboBalls = [];
      whiteHole.destroy();
      whiteHole = null;
    }
  }
}

// ─── Event Orbs (clone, power, curse) ───
function updateEventOrbs(dt) {
  // ── Spawn timer ──
  if (hasDroppedAny) {
    orbSpawnTimer -= dt;
    if (orbSpawnTimer <= 0) {
      const type = ORB_TYPES[Math.floor(Math.random() * ORB_TYPES.length)];
      const x = randRange(-ARENA.width / 2 + 1.5, ARENA.width / 2 - 1.5);
      const y = randRange(-ARENA.height / 2 + 3, ARENA.height / 2 - 3);
      const orb = new EventOrb(x, y, type);
      eventOrbs.push(orb);

      const labelMap = { clone: '×3 CLONE ORB', power: '⬆ POWER ORB', curse: '⬇ CURSE ORB' };
      const colorMap = { clone: '#44ff88', power: '#ffdd00', curse: '#ff4466' };
      showEventBanner(labelMap[type], colorMap[type]);

      orbSpawnTimer = randRange(ORB_INTERVAL_MIN, ORB_INTERVAL_MAX);
    }
  }

  // ── Check ball–orb collisions and apply effects ──
  for (let oi = eventOrbs.length - 1; oi >= 0; oi--) {
    const orb = eventOrbs[oi];
    if (orb.dead) continue;

    orb.update(dt);

    // Check each active ball
    for (let bi = 0; bi < balls.length; bi++) {
      const ball = balls[bi];
      if (ball.merged || ball.inPipe || ball.inSuction || ball.inLimbo || !ball.body) continue;

      const dx = orb.x - ball.body.position.x;
      const dy = orb.mesh.position.y - ball.body.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < orb.radius + ARENA.ballRadius) {
        // Ball hit the orb — apply effect
        applyOrbEffect(orb, ball, bi);
        spawnParticles({ x: orb.x, y: orb.mesh.position.y, z: 0 },
          orb.type === 'clone' ? 0x44ff88 : orb.type === 'power' ? 0xffdd00 : 0xff4466, 15);
        screenShake(0.12);
        orb.destroy();
        eventOrbs.splice(oi, 1);
        break; // orb consumed
      }
    }
  }

  // ── Clean up expired orbs ──
  for (let i = eventOrbs.length - 1; i >= 0; i--) {
    if (eventOrbs[i].dead) {
      eventOrbs[i].destroy();
      eventOrbs.splice(i, 1);
    }
  }
}

function applyOrbEffect(orb, ball, ballIdx) {
  switch (orb.type) {
    case 'clone': {
      // Original continues straight down at good speed
      const downSpeed = Math.max(Math.abs(ball.body.velocity.y), 5) * velocityMult;
      ball.body.velocity.set(0, -downSpeed, 0);

      // Clone 1: shoot left-downward diagonal
      const clone1 = new Ball(ball.value, false);
      clone1.isTemporary = true;
      clone1.spawn(ball.body.position.x, ball.body.position.y, 0);
      clone1.body.velocity.set(-4 * velocityMult, -downSpeed * 0.7, 0);
      clone1.updateVisual();
      balls.push(clone1);

      // Clone 2: shoot right-downward diagonal
      const clone2 = new Ball(ball.value, false);
      clone2.isTemporary = true;
      clone2.spawn(ball.body.position.x, ball.body.position.y, 0);
      clone2.body.velocity.set(4 * velocityMult, -downSpeed * 0.7, 0);
      clone2.updateVisual();
      balls.push(clone2);

      showEventBanner('×3 CLONED!', '#44ff88');
      break;
    }
    case 'power': {
      // Double the ball's effective value temporarily
      ball.tempBuff = 2;
      ball.updateVisual();
      showEventBanner('POWER ×2!', '#ffdd00');
      break;
    }
    case 'curse': {
      // Halve the ball's effective value temporarily
      ball.tempBuff = 0.5;
      ball.updateVisual();
      showEventBanner('CURSED ½!', '#ff4466');
      break;
    }
  }
}

// ─── Round-end cleanup for temporary effects ───
function cleanupTemporaryEffects() {
  // Remove temporary clone balls
  for (let i = balls.length - 1; i >= 0; i--) {
    const ball = balls[i];
    if (ball.isTemporary && !ball.inPipe) {
      // Remove from pipe queue if somehow there
      const qi = pipeQueue.indexOf(i);
      if (qi !== -1) pipeQueue.splice(qi, 1);
      ball.destroy();
      balls.splice(i, 1);
      // Fix up pipeQueue indices that shifted
      for (let q = 0; q < pipeQueue.length; q++) {
        if (pipeQueue[q] > i) pipeQueue[q]--;
      }
    }
  }

  // Reset temp buffs on all remaining balls
  for (const ball of balls) {
    if (ball.tempBuff !== 1) {
      ball.tempBuff = 1;
      ball.updateVisual();
    }
  }
}

// ─── Recover balls that escape the arena ───
let escapeCheckTimer = 0;
function recoverEscapedBalls(dt) {
  escapeCheckTimer += dt;
  if (escapeCheckTimer < 1.0) return; // only check once per second
  escapeCheckTimer = 0;

  const limitLeft = -(ARENA.width / 2 + 2);
  const limitRight = ARENA.width / 2 + 2;
  const limitBottom = -(ARENA.height / 2 + 3);
  const floorY = -ARENA.height / 2 + 1.5;

  for (const ball of balls) {
    if (ball.merged || ball.inPipe || ball.inSuction || ball.inLimbo || !ball.body) continue;

    const pos = ball.body.position;

    if (pos.x < limitLeft || pos.y < limitBottom) {
      // Escaped left or fell below — put on left side with rightward momentum
      pos.set(-ARENA.width / 2 + 1, floorY, 0);
      ball.body.velocity.set(5, 2, 0);
    } else if (pos.x > limitRight) {
      // Escaped right — put bottom-right with no momentum so suction grabs it
      pos.set(ARENA.width / 2 - 0.5, floorY, 0);
      ball.body.velocity.set(0, 0, 0);
    } else {
      // Check if stuck (nearly stationary in the play area — e.g. wedged against a block)
      const v = ball.body.velocity;
      const speed = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
      if (speed < 0.8) {
        ball.body.velocity.set((Math.random() - 0.5) * 3, -5 * velocityMult, 0);
      }
    }
  }
}

// ─── Magnet ───
function applyMagnet(dt) {
  if (magnetStrength === 0) return;
  const force = [0, 0.5, 1.2, 2.5][magnetStrength] || 0;

  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.merged || a.inPipe || a.inSuction || a.inLimbo || !a.body) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.merged || b.inPipe || b.inSuction || b.inLimbo || !b.body) continue;
      if (a.value !== b.value) continue;

      const diff = b.body.position.vsub(a.body.position);
      const dist = diff.length();
      if (dist < 4 && dist > 0.1) {
        const dir = diff.scale(force * dt / dist);
        a.body.velocity.vadd(dir, a.body.velocity);
        b.body.velocity.vsub(dir, b.body.velocity);
      }
    }
  }
}

// ─── Wave transition ───
function triggerWaveTransition() {
  if (state !== 'playing') return;
  allBlocksClearedTimer = 0;
  hideStageClearBanner();
  cleanupTemporaryEffects();
  hasDroppedAny = false;
  sfxWaveComplete();
  state = 'waveTransition';
  waveTransitionTimer = 0.8;
}

// ─── Round check ───
function checkRoundComplete() {
  if (state !== 'playing' || !hasDroppedAny) return;

  // Can't complete round while balls are in limbo
  if (limboBalls.length > 0) return;

  // If all-blocks-cleared countdown is running, let it finish (fixed 3s wait)
  if (allBlocksClearedTimer > 0) return;

  // All non-merged, non-temporary balls must be back in pipe
  // (temporary clone balls get cleaned up on round end)
  const allInPipe = balls.every(b => b.merged || b.inPipe || b.isTemporary);
  if (!allInPipe) return;

  // At least some balls in the queue
  if (pipeQueue.length < 1) return;

  triggerWaveTransition();
}

// ─── Clean up dead blocks ───
function cleanupBlocks() {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].dead) {
      blocks[i].destroy();
      blocks.splice(i, 1);
    }
  }

  // When all blocks are destroyed, start a 3s countdown to next wave
  // instead of waiting for balls to return to the pipe
  if (blocks.length === 0 && state === 'playing' && hasDroppedAny && allBlocksClearedTimer === 0) {
    allBlocksClearedTimer = 3.0;
    showStageClearCountdown(3);
  }
}

// ─── Main Loop ───
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  gameTime += dt;

  if (state === 'playing') {
    dropCooldown = Math.max(0, dropCooldown - dt);

    // Continuous drop while dragging
    if (isDragging && dropCooldown <= 0 && pipeQueue.length > 0) {
      dropBall();
    }

    stepPhysics(dt);
    recoverEscapedBalls(dt);

    // Sync meshes
    balls.forEach(b => { if (!b.merged) b.syncMesh(); });

    handleCollisions();
    applyMagnet(dt);
    updateSuction(dt);
    updateBlackWhiteHoles(dt);
    updateEventOrbs(dt);
    cleanupBlocks();
    checkRoundComplete();

    // All-blocks-cleared countdown
    if (allBlocksClearedTimer > 0) {
      allBlocksClearedTimer -= dt;
      if (allBlocksClearedTimer <= 0) {
        triggerWaveTransition();
      } else {
        showStageClearCountdown(Math.ceil(allBlocksClearedTimer));
      }
    }

    // Chain timer
    if (chainTimer > 0) {
      chainTimer -= dt;
      if (chainTimer <= 0) chainCount = 0;
    }
  }

  if (state === 'waveTransition') {
    waveTransitionTimer -= dt;
    if (waveTransitionTimer <= 0) {
      state = 'playing';
      nextWave();
    }
  }

  // Update visuals regardless of state
  if (pipe) pipe.update(dt);
  if (suctionTube) suctionTube.update(dt);
  // Note: blackHole/whiteHole/eventOrbs are already updated in their
  // respective update functions during 'playing' state, but we still
  // need visual updates when paused or transitioning
  if (state !== 'playing') {
    if (blackHole) blackHole.update(dt);
    if (whiteHole) whiteHole.update(dt);
    eventOrbs.forEach(o => { if (!o.dead) o.update(dt); });
  }
  blocks.forEach(b => b.update(dt));
  updateShake();
  updateParticles(dt);
  renderScene();
}

// ─── Boot ───
init();
