// ─── Game: state machine, round logic, wave generation, main loop ───

import * as THREE from 'three';
import { ARENA, loadSave, writeSave, getUpgradeValue, getBallColor } from './config.js';
import { initMusic, sfxDrop, sfxBounce, sfxMerge, sfxBlockHit, sfxBlockDestroy,
         sfxWaveComplete, sfxGameOver, sfxSuction } from './audio.js';
import { initScene, scene, camera, renderer, clock,
         screenShake, updateShake, initParticles, spawnParticles,
         updateParticles, toScreen, renderScene } from './scene.js';
import { initPhysics, world, stepPhysics } from './physics.js';
import { Ball, Block, Pipe, SuctionTube } from './entities.js';
import { initUI, showScreen, updateHUD, showWaveBanner, showChainText,
         showGameOver, spawnDamageNumber } from './ui.js';

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
let save = null;

// Per-ball hit cooldown (ball index → timestamp)
const ballHitCooldowns = new Map();
const HIT_COOLDOWN = 0.3; // seconds between hits for same ball

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
  ballHitCooldowns.clear();
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
  blocks.forEach(b => b.destroy());
  blocks = [];
  if (pipe) { pipe.destroy(); pipe = null; }
  if (suctionTube) { suctionTube.destroy(); suctionTube = null; }
}

// ─── Position ball visually inside pipe ───
function positionBallInPipe(ballIdx, queuePos) {
  const ball = balls[ballIdx];
  if (!ball || ball.merged) return;
  const hw = ARENA.width * 0.4;
  const startX = hw;
  const spacing = ARENA.ballRadius * 3.0;
  const x = startX - queuePos * spacing;
  ball.mesh.position.set(x, ARENA.pipeY, 0);
  ball.inPipe = true;
}

// ─── Drop ball from pipe ───
function dropBall() {
  if (pipeQueue.length === 0 || dropCooldown > 0) return;

  const ballIdx = pipeQueue.shift();
  const ball = balls[ballIdx];
  if (!ball || ball.merged) return;

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

  // Spawn new row
  const numBlocks = isBoss ? 1 : 3 + Math.floor(Math.random() * 3);
  const hw = ARENA.width / 2 - 1;

  for (let i = 0; i < numBlocks; i++) {
    const x = -hw + (i / Math.max(1, numBlocks - 1)) * (hw * 2);
    const baseHp = 10 * Math.pow(1.25, wave);
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
  pipe.setTargetX(wx);
  dropBall();
}

function onPointerMove(e) {
  if (!isDragging || state !== 'playing') return;
  const wx = screenToWorldX(e.clientX);
  pipe.setTargetX(wx);
}

function onPointerUp() {
  isDragging = false;
}

// ─── Collision detection ───
function handleCollisions() {
  // Ball vs Block (with per-ball hit cooldown)
  for (let bi = 0; bi < balls.length; bi++) {
    const ball = balls[bi];
    if (ball.inPipe || ball.inSuction || ball.merged || !ball.body) continue;

    // Check hit cooldown for this ball
    const lastHit = ballHitCooldowns.get(bi) || 0;
    if (gameTime - lastHit < HIT_COOLDOWN) continue;

    for (const block of blocks) {
      if (block.dead) continue;
      const dist = ball.body.position.distanceTo(block.body.position);
      const minDist = ARENA.ballRadius + block.size * 0.7;
      if (dist < minDist) {
        // Damage
        let dmg = ball.value;
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
    if (a.merged || a.inSuction) continue;
    for (let j = i + 1; j < balls.length && !didMerge; j++) {
      const b = balls[j];
      if (b.merged || b.inSuction) continue;
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

  let newValue = a.value * 2;
  // Merge luck: chance to go one tier higher
  if (Math.random() < mergeLuckChance) {
    newValue *= 2;
  }

  // Keep ball A, destroy B
  a.updateVisual(newValue);
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

  b.destroy();

  // Spawn replacement ball (lowest value) to maintain ball count
  const newBall = new Ball(startBallValue, true);
  balls.push(newBall);
  const newIdx = balls.length - 1;
  pipeQueue.push(newIdx);
  positionBallInPipe(newIdx, pipeQueue.indexOf(newIdx));

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
    if (ball.merged || ball.inPipe || ball.inSuction || !ball.body) continue;

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
      ball.inPipe = true;
      const idx = balls.indexOf(ball);
      if (idx !== -1 && !pipeQueue.includes(idx)) {
        pipeQueue.push(idx);
        positionBallInPipe(idx, pipeQueue.indexOf(idx));
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
    if (a.merged || a.inPipe || a.inSuction || !a.body) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.merged || b.inPipe || b.inSuction || !b.body) continue;
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

// ─── Round check ───
function checkRoundComplete() {
  if (state !== 'playing' || !hasDroppedAny) return;

  // All non-merged balls must be back in pipe
  const allInPipe = balls.every(b => b.merged || b.inPipe);
  if (!allInPipe) return;

  // At least some balls in the queue
  if (pipeQueue.length < 1) return;

  // Round complete — advance wave
  hasDroppedAny = false;
  sfxWaveComplete();
  state = 'waveTransition';
  waveTransitionTimer = 0.8;
}

// ─── Clean up dead blocks ───
function cleanupBlocks() {
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (blocks[i].dead) {
      blocks[i].destroy();
      blocks.splice(i, 1);
    }
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

    // Sync meshes
    balls.forEach(b => { if (!b.merged) b.syncMesh(); });

    handleCollisions();
    applyMagnet(dt);
    updateSuction(dt);
    cleanupBlocks();
    checkRoundComplete();

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
  blocks.forEach(b => b.update(dt));
  updateShake();
  updateParticles(dt);
  renderScene();
}

// ─── Boot ───
init();
