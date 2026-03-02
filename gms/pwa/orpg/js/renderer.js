// ============================================================
// renderer.js - All game rendering (tiles, entities, effects, items)
// ============================================================

import {
  TILE, TILE_SIZE, ITEMS, ITEM_TYPE, METAL_COLORS, METAL_TIERS,
  FISH, EQUIP_SLOT,
} from './config.js';

// Pre-render tile cache for performance
const tileCache = {};
const itemIconCache = {};

function createTileCanvas(drawFn) {
  const c = document.createElement('canvas');
  c.width = TILE_SIZE;
  c.height = TILE_SIZE;
  const ctx = c.getContext('2d');
  drawFn(ctx);
  return c;
}

// ---- TILE RENDERING ----
function drawStoneFloor(ctx, seed) {
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = '#2a2a3a';
  ctx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
  // Random cracks
  const rng = mulberry32(seed);
  ctx.strokeStyle = '#2d2d3d';
  ctx.beginPath();
  ctx.moveTo(rng() * 20 + 4, rng() * 10);
  ctx.lineTo(rng() * 20 + 6, rng() * 20 + 8);
  ctx.stroke();
  // Speckles
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = `rgba(50,50,70,${rng() * 0.4 + 0.1})`;
    ctx.fillRect(rng() * 26 + 3, rng() * 26 + 3, 2, 2);
  }
}

function drawWall(ctx, seed) {
  const rng = mulberry32(seed);
  ctx.fillStyle = '#555566';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  // Brick pattern
  ctx.fillStyle = '#4a4a5a';
  ctx.fillRect(1, 1, TILE_SIZE - 2, TILE_SIZE / 2 - 2);
  ctx.fillRect(TILE_SIZE / 2, TILE_SIZE / 2 + 1, TILE_SIZE / 2 - 1, TILE_SIZE / 2 - 2);
  ctx.strokeStyle = '#333344';
  ctx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
  // Mortar
  ctx.strokeStyle = '#3a3a4a';
  ctx.beginPath();
  ctx.moveTo(0, TILE_SIZE / 2);
  ctx.lineTo(TILE_SIZE, TILE_SIZE / 2);
  ctx.moveTo(TILE_SIZE / 2, 0);
  ctx.lineTo(TILE_SIZE / 2, TILE_SIZE / 2);
  ctx.stroke();
  // Moss
  if (rng() > 0.6) {
    ctx.fillStyle = 'rgba(40,80,40,0.3)';
    ctx.fillRect(rng() * 20, TILE_SIZE - 6, rng() * 10 + 4, 6);
  }
}

function drawPillar(ctx) {
  ctx.fillStyle = '#3a3a4a';
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  ctx.strokeStyle = '#2a2a3a';
  ctx.strokeRect(0, 0, TILE_SIZE, TILE_SIZE);
  // Pillar
  ctx.fillStyle = '#606070';
  ctx.fillRect(6, 2, TILE_SIZE - 12, TILE_SIZE - 4);
  ctx.fillStyle = '#707080';
  ctx.fillRect(4, 0, TILE_SIZE - 8, 4);
  ctx.fillRect(4, TILE_SIZE - 4, TILE_SIZE - 8, 4);
  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  ctx.fillRect(7, 4, 4, TILE_SIZE - 8);
}

function drawRubble(ctx, seed) {
  const rng = mulberry32(seed);
  drawStoneFloor(ctx, seed);
  // Rubble chunks
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = `rgb(${70 + rng() * 30}, ${70 + rng() * 30}, ${80 + rng() * 30})`;
    const rx = rng() * 22 + 3;
    const ry = rng() * 22 + 3;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx + rng() * 6 + 2, ry + rng() * 3);
    ctx.lineTo(rx + rng() * 4, ry + rng() * 6 + 2);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFishingSpot(ctx) {
  drawStoneFloor(ctx, 42);
  // Fishing icon on ground
  ctx.fillStyle = 'rgba(40,120,180,0.4)';
  ctx.beginPath();
  ctx.arc(TILE_SIZE / 2, TILE_SIZE / 2, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#3090c0';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(TILE_SIZE / 2, TILE_SIZE / 2, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 1;
  // Fish icon
  ctx.fillStyle = '#60b0e0';
  ctx.beginPath();
  ctx.ellipse(TILE_SIZE / 2, TILE_SIZE / 2, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
}

// Simple seeded RNG
function mulberry32(a) {
  return function () {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Initialize tile cache
function initTileCache() {
  for (let i = 0; i < 8; i++) {
    tileCache[`floor_${i}`] = createTileCanvas(ctx => drawStoneFloor(ctx, i * 1337));
    tileCache[`wall_${i}`] = createTileCanvas(ctx => drawWall(ctx, i * 2749));
    tileCache[`rubble_${i}`] = createTileCanvas(ctx => drawRubble(ctx, i * 3571));
  }
  tileCache.pillar = createTileCanvas(drawPillar);
  tileCache.fishing_spot = createTileCanvas(drawFishingSpot);
}

// ---- MAIN RENDERER ----
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.time = 0;
    initTileCache();
  }

  clear() {
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  // ---- WORLD DRAWING ----
  drawRoom(room, camera) {
    const ctx = this.ctx;
    const startTileX = Math.max(0, Math.floor(camera.x / TILE_SIZE));
    const startTileY = Math.max(0, Math.floor(camera.y / TILE_SIZE));
    const endTileX = Math.min(room.width - 1, Math.ceil((camera.x + camera.width) / TILE_SIZE));
    const endTileY = Math.min(room.height - 1, Math.ceil((camera.y + camera.height) / TILE_SIZE));

    for (let y = startTileY; y <= endTileY; y++) {
      for (let x = startTileX; x <= endTileX; x++) {
        const tile = room.tiles[y][x];
        const sx = camera.screenX(x * TILE_SIZE);
        const sy = camera.screenY(y * TILE_SIZE);
        const variant = (x * 7 + y * 13) % 8;

        switch (tile) {
          case TILE.FLOOR:
            ctx.drawImage(tileCache[`floor_${variant}`], sx, sy);
            break;
          case TILE.WALL:
            ctx.drawImage(tileCache[`wall_${variant}`], sx, sy);
            break;
          case TILE.PILLAR:
            ctx.drawImage(tileCache.pillar, sx, sy);
            break;
          case TILE.RUBBLE:
            ctx.drawImage(tileCache[`rubble_${variant}`], sx, sy);
            break;
          case TILE.FISHING_SPOT:
            ctx.drawImage(tileCache.fishing_spot, sx, sy);
            break;
          case TILE.WATER:
            this.drawWater(ctx, sx, sy);
            break;
          case TILE.CAMPFIRE:
            ctx.drawImage(tileCache[`floor_${variant}`], sx, sy);
            this.drawCampfire(ctx, sx, sy);
            break;
        }
      }
    }
  }

  drawWater(ctx, x, y) {
    ctx.fillStyle = '#1a3a6a';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 3; i++) {
      const alpha = 0.3 + Math.sin(this.time / 500 + i) * 0.15;
      ctx.strokeStyle = `rgba(80,140,220,${alpha})`;
      ctx.beginPath();
      for (let j = 0; j <= TILE_SIZE; j += 4) {
        const wy = y + 8 + i * 9 + Math.sin(this.time / 300 + j / 8 + i) * 2;
        if (j === 0) ctx.moveTo(x + j, wy);
        else ctx.lineTo(x + j, wy);
      }
      ctx.stroke();
    }
  }

  drawCampfire(ctx, x, y) {
    // Logs
    ctx.fillStyle = '#654321';
    ctx.save();
    ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE - 8);
    ctx.rotate(0.3);
    ctx.fillRect(-10, -2, 20, 5);
    ctx.restore();
    ctx.save();
    ctx.translate(x + TILE_SIZE / 2, y + TILE_SIZE - 8);
    ctx.rotate(-0.3);
    ctx.fillRect(-10, -2, 20, 5);
    ctx.restore();

    // Glow
    const grad = ctx.createRadialGradient(
      x + TILE_SIZE / 2, y + TILE_SIZE / 2, 2,
      x + TILE_SIZE / 2, y + TILE_SIZE / 2, TILE_SIZE * 0.8
    );
    grad.addColorStop(0, 'rgba(255,200,50,0.35)');
    grad.addColorStop(1, 'rgba(255,100,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(x - TILE_SIZE / 2, y - TILE_SIZE / 2, TILE_SIZE * 2, TILE_SIZE * 2);

    // Flames
    for (let i = 0; i < 5; i++) {
      const fx = x + 10 + Math.sin(this.time / 200 + i * 2) * 3 + i * 2.5;
      const fy = y + TILE_SIZE - 10 - i * 2.5;
      const fh = 6 + Math.sin(this.time / 150 + i) * 3;
      ctx.fillStyle = i < 2 ? '#ff4400' : i < 4 ? '#ff8800' : '#ffcc00';
      ctx.beginPath();
      ctx.moveTo(fx - 2, fy);
      ctx.quadraticCurveTo(fx + Math.sin(this.time / 100 + i) * 2, fy - fh, fx + 2, fy);
      ctx.fill();
    }
  }

  // ---- ENTITY DRAWING ----
  drawPlayer(player, camera) {
    const ctx = this.ctx;
    const sx = camera.screenX(player.x);
    const sy = camera.screenY(player.y);
    const t = this.time;
    const tier = player.getEquipmentTier();
    const colors = tier ? METAL_COLORS[tier] : METAL_COLORS.bronze;
    const isMoving = player.targetX !== null;
    const frame = isMoving ? Math.floor(t / 150) % 4 : 0;
    const bob = isMoving ? [0, -1, 0, -1][frame] : Math.sin(t / 500) * 0.5;
    const legAnim = isMoving ? [0, -3, 0, 3][frame] : 0;
    const armAnim = isMoving ? [0, 3, 0, -3][frame] : 0;

    const cx = sx + player.w / 2;
    const cy = sy + player.h / 2;

    // Hit flash
    if (player.hitFlash > 0) {
      ctx.globalAlpha = 0.6 + Math.sin(this.time / 30) * 0.4;
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 14, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Cape
    const bodyDef = player.equipment[EQUIP_SLOT.BODY];
    if (bodyDef) {
      ctx.fillStyle = '#8B0000';
      ctx.beginPath();
      ctx.moveTo(cx - 5, cy - 8 + bob);
      ctx.lineTo(cx + 5, cy - 8 + bob);
      ctx.lineTo(cx + 7, cy + 6 + bob + legAnim / 2);
      ctx.lineTo(cx - 7, cy + 6 + bob - legAnim / 2);
      ctx.closePath();
      ctx.fill();
    }

    // Legs
    ctx.fillStyle = '#4a3a2a';
    ctx.fillRect(cx - 5, cy + 4 + bob, 4, 8 + legAnim);
    ctx.fillRect(cx + 1, cy + 4 + bob, 4, 8 - legAnim);
    // Boots
    const legItem = player.equipment[EQUIP_SLOT.LEGS];
    ctx.fillStyle = legItem ? colors.secondary : '#3a2a1a';
    ctx.fillRect(cx - 6, cy + 10 + bob + legAnim, 5, 3);
    ctx.fillRect(cx, cy + 10 + bob - legAnim, 5, 3);

    // Torso / armor
    if (bodyDef) {
      const bodyColors = METAL_COLORS[ITEMS[bodyDef]?.metalTier] || colors;
      ctx.fillStyle = bodyColors.primary;
      ctx.fillRect(cx - 6, cy - 8 + bob, 12, 13);
      // Chainmail detail
      for (let cy2 = 0; cy2 < 3; cy2++) {
        for (let cx2 = 0; cx2 < 3; cx2++) {
          ctx.fillStyle = (cx2 + cy2) % 2 ? bodyColors.secondary : bodyColors.highlight;
          ctx.fillRect(cx - 5 + cx2 * 3.5, cy - 7 + cy2 * 4 + bob, 3, 3);
        }
      }
    } else {
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(cx - 6, cy - 8 + bob, 12, 13);
    }

    // Belt
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(cx - 6, cy + 2 + bob, 12, 3);
    ctx.fillStyle = '#DAA520';
    ctx.fillRect(cx - 1, cy + 2 + bob, 2, 3);

    // Left arm + shield
    ctx.save();
    ctx.translate(cx - 6 * player.facing, cy - 5 + bob);
    ctx.rotate(armAnim * 0.04 * player.facing);
    if (bodyDef) {
      const bodyColors2 = METAL_COLORS[ITEMS[bodyDef]?.metalTier] || colors;
      ctx.fillStyle = bodyColors2.primary;
    } else {
      ctx.fillStyle = '#DEB887';
    }
    ctx.fillRect(-3, 0, 4, 10);

    const shieldItem = player.equipment[EQUIP_SLOT.SHIELD];
    if (shieldItem) {
      const shieldColors = METAL_COLORS[ITEMS[shieldItem]?.metalTier] || colors;
      ctx.fillStyle = shieldColors.primary;
      ctx.beginPath();
      ctx.moveTo(-7, 1);
      ctx.lineTo(0, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(-3, 12);
      ctx.lineTo(-7, 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = shieldColors.highlight;
      ctx.beginPath();
      ctx.arc(-3.5, 5, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Right arm + weapon
    ctx.save();
    ctx.translate(cx + 6 * player.facing, cy - 5 + bob);
    ctx.rotate(-armAnim * 0.04 * player.facing);
    if (bodyDef) {
      const bodyColors3 = METAL_COLORS[ITEMS[bodyDef]?.metalTier] || colors;
      ctx.fillStyle = bodyColors3.primary;
    } else {
      ctx.fillStyle = '#DEB887';
    }
    ctx.fillRect(-1, 0, 4, 10);

    // Sword
    const weaponItem = player.equipment[EQUIP_SLOT.WEAPON];
    if (weaponItem && ITEMS[weaponItem]?.type === ITEM_TYPE.WEAPON) {
      const weapColors = METAL_COLORS[ITEMS[weaponItem]?.metalTier] || colors;
      ctx.fillStyle = weapColors.primary;
      ctx.fillRect(0, -12, 2, 16);
      ctx.fillStyle = weapColors.highlight;
      ctx.fillRect(0, -12, 1, 16);
      ctx.fillStyle = '#DAA520';
      ctx.fillRect(-2, 3, 6, 2);
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(0, 5, 2, 3);
    }
    ctx.restore();

    // Head
    ctx.fillStyle = player.hitFlash > 0 ? '#ff8888' : '#DEB887';
    ctx.beginPath();
    ctx.arc(cx, cy - 13 + bob, 6, 0, Math.PI * 2);
    ctx.fill();

    // Helmet
    const helmetItem = player.equipment[EQUIP_SLOT.HELMET];
    if (helmetItem) {
      const helmColors = METAL_COLORS[ITEMS[helmetItem]?.metalTier] || colors;
      ctx.fillStyle = helmColors.primary;
      ctx.beginPath();
      ctx.arc(cx, cy - 15 + bob, 7, Math.PI, 0);
      ctx.fill();
      ctx.fillRect(cx - 7, cy - 15 + bob, 14, 3);
      // Nose guard
      ctx.fillStyle = helmColors.secondary;
      ctx.fillRect(cx - 1, cy - 15 + bob, 2, 7);
    }

    // Eyes
    ctx.fillStyle = '#333';
    ctx.fillRect(cx - 3 * player.facing - 1, cy - 14 + bob, 2, 2);
    ctx.fillRect(cx + 1 * player.facing, cy - 14 + bob, 2, 2);

    ctx.globalAlpha = 1;

    // Activity indicator
    if (player.activity) {
      const progress = player.activityProgress / (player.activity === 'fishing' ? 3000 : 2000);
      ctx.fillStyle = '#333';
      ctx.fillRect(cx - 15, cy - 28, 30, 5);
      ctx.fillStyle = player.activity === 'fishing' ? '#30a0c0' : '#c07030';
      ctx.fillRect(cx - 14, cy - 27, 28 * progress, 3);
    }
  }

  drawMonster(monster, camera) {
    const ctx = this.ctx;
    const sx = camera.screenX(monster.x);
    const sy = camera.screenY(monster.y);
    const t = this.time;
    const bob = Math.sin(t / 250 + monster.x) * 2;
    const cx = sx + monster.w / 2;
    const cy = sy + monster.h / 2;

    if (monster.hitFlash > 0) {
      ctx.globalAlpha = 0.6 + Math.sin(this.time / 30) * 0.4;
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 14, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    switch (monster.type) {
      case 'rat':
        this._drawRat(ctx, cx, cy, bob, monster);
        break;
      case 'goblin':
        this._drawGoblin(ctx, cx, cy, bob, monster);
        break;
      case 'skeleton':
        this._drawSkeleton(ctx, cx, cy, bob, monster);
        break;
      case 'zombie':
        this._drawZombie(ctx, cx, cy, bob, monster);
        break;
      case 'dark_wizard':
        this._drawDarkWizard(ctx, cx, cy, bob, monster);
        break;
      case 'dark_knight':
        this._drawDarkKnight(ctx, cx, cy, bob, monster);
        break;
      case 'demon':
      case 'greater_demon':
        this._drawDemon(ctx, cx, cy, bob, monster);
        break;
      default:
        this._drawGoblin(ctx, cx, cy, bob, monster);
    }

    ctx.globalAlpha = 1;

    // Health bar
    const hpRatio = monster.hp / monster.maxHp;
    ctx.fillStyle = '#333';
    ctx.fillRect(cx - 14, cy - 22, 28, 4);
    ctx.fillStyle = hpRatio > 0.5 ? '#2d2' : hpRatio > 0.25 ? '#dd2' : '#d22';
    ctx.fillRect(cx - 13, cy - 21, 26 * hpRatio, 2);

    // Level text
    ctx.font = '8px monospace';
    ctx.fillStyle = '#aaa';
    ctx.textAlign = 'center';
    ctx.fillText(`Lv${monster.level}`, cx, cy - 24);
    ctx.textAlign = 'left';
  }

  _drawRat(ctx, cx, cy, bob, m) {
    // Body
    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 4 + bob, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.fillStyle = '#9B8365';
    ctx.beginPath();
    ctx.ellipse(cx + 6 * m.facing, cy + 2 + bob, 5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    // Eye
    ctx.fillStyle = '#f00';
    ctx.beginPath();
    ctx.arc(cx + 9 * m.facing, cy + 1 + bob, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Tail
    ctx.strokeStyle = '#7a6345';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 6 * m.facing, cy + 4 + bob);
    ctx.quadraticCurveTo(cx - 12 * m.facing, cy - 2 + bob, cx - 14 * m.facing, cy + 6 + bob);
    ctx.stroke();
    ctx.lineWidth = 1;
    // Ears
    ctx.fillStyle = '#a08060';
    ctx.beginPath();
    ctx.arc(cx + 4 * m.facing, cy - 2 + bob, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawGoblin(ctx, cx, cy, bob, m) {
    // Body
    ctx.fillStyle = '#4a8a4a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + bob, 7, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.fillStyle = '#5a9a5a';
    ctx.beginPath();
    ctx.arc(cx, cy - 10 + bob, 6, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#f00';
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 11 + bob, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 3, cy - 11 + bob, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Ears
    ctx.fillStyle = '#4a8a4a';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 10 + bob);
    ctx.lineTo(cx - 12, cy - 18 + bob);
    ctx.lineTo(cx - 3, cy - 12 + bob);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy - 10 + bob);
    ctx.lineTo(cx + 12, cy - 18 + bob);
    ctx.lineTo(cx + 3, cy - 12 + bob);
    ctx.fill();
    // Club
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(cx + 7 * m.facing, cy - 4 + bob, 3, 12);
    ctx.fillStyle = '#654321';
    ctx.beginPath();
    ctx.arc(cx + 8.5 * m.facing, cy - 6 + bob, 4, 0, Math.PI * 2);
    ctx.fill();
    // Legs
    ctx.fillStyle = '#3a7a3a';
    ctx.fillRect(cx - 4, cy + 8 + bob, 3, 5);
    ctx.fillRect(cx + 1, cy + 8 + bob, 3, 5);
  }

  _drawSkeleton(ctx, cx, cy, bob, m) {
    // Body (ribcage)
    ctx.fillStyle = '#e8e0d0';
    ctx.fillRect(cx - 5, cy - 6 + bob, 10, 12);
    ctx.fillStyle = '#333';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(cx - 4, cy - 4 + i * 4 + bob, 8, 1);
    }
    // Skull
    ctx.fillStyle = '#f0e8d8';
    ctx.beginPath();
    ctx.arc(cx, cy - 12 + bob, 6, 0, Math.PI * 2);
    ctx.fill();
    // Eye sockets
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(cx - 2.5, cy - 13 + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 2.5, cy - 13 + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    // Glow in eyes
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.arc(cx - 2.5, cy - 13 + bob, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 2.5, cy - 13 + bob, 1, 0, Math.PI * 2);
    ctx.fill();
    // Arms
    ctx.fillStyle = '#e0d8c8';
    ctx.fillRect(cx - 9, cy - 4 + bob, 4, 2);
    ctx.fillRect(cx + 5, cy - 4 + bob, 4, 2);
    // Sword
    ctx.fillStyle = '#a0a0a0';
    ctx.fillRect(cx + 8 * m.facing, cy - 10 + bob, 2, 14);
    // Legs
    ctx.fillStyle = '#e0d8c8';
    ctx.fillRect(cx - 4, cy + 6 + bob, 3, 7);
    ctx.fillRect(cx + 1, cy + 6 + bob, 3, 7);
  }

  _drawZombie(ctx, cx, cy, bob, m) {
    // Body
    ctx.fillStyle = '#6a8a6a';
    ctx.fillRect(cx - 6, cy - 6 + bob, 12, 14);
    // Tattered clothes
    ctx.fillStyle = '#4a5a3a';
    ctx.fillRect(cx - 6, cy - 6 + bob, 12, 6);
    // Head
    ctx.fillStyle = '#7a9a7a';
    ctx.beginPath();
    ctx.arc(cx, cy - 11 + bob, 6, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 12 + bob, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 3, cy - 12 + bob, 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Arms (outstretched)
    ctx.fillStyle = '#6a8a6a';
    ctx.save();
    ctx.translate(cx + 6 * m.facing, cy - 2 + bob);
    ctx.rotate(-0.3 * m.facing);
    ctx.fillRect(0, 0, 10 * m.facing, 3);
    ctx.restore();
    // Legs
    ctx.fillStyle = '#5a7a5a';
    ctx.fillRect(cx - 4, cy + 8 + bob, 3, 6);
    ctx.fillRect(cx + 1, cy + 8 + bob, 3, 6);
  }

  _drawDarkWizard(ctx, cx, cy, bob, m) {
    // Robe
    ctx.fillStyle = '#2a1a4a';
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 4 + bob);
    ctx.lineTo(cx + 8, cy - 4 + bob);
    ctx.lineTo(cx + 10, cy + 13 + bob);
    ctx.lineTo(cx - 10, cy + 13 + bob);
    ctx.closePath();
    ctx.fill();
    // Hood
    ctx.fillStyle = '#1a0a3a';
    ctx.beginPath();
    ctx.arc(cx, cy - 10 + bob, 7, 0, Math.PI * 2);
    ctx.fill();
    // Glowing eyes
    ctx.fillStyle = '#ff00ff';
    ctx.beginPath();
    ctx.arc(cx - 2.5, cy - 11 + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 2.5, cy - 11 + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    // Staff
    ctx.fillStyle = '#654321';
    ctx.fillRect(cx + 10 * m.facing, cy - 18 + bob, 2, 30);
    // Orb on staff
    ctx.fillStyle = '#ff00ff';
    const orbGlow = 0.4 + Math.sin(this.time / 300) * 0.2;
    ctx.globalAlpha = orbGlow;
    ctx.beginPath();
    ctx.arc(cx + 11 * m.facing, cy - 20 + bob, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#cc00cc';
    ctx.beginPath();
    ctx.arc(cx + 11 * m.facing, cy - 20 + bob, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawDarkKnight(ctx, cx, cy, bob, m) {
    // Body armor
    ctx.fillStyle = '#222';
    ctx.fillRect(cx - 7, cy - 6 + bob, 14, 14);
    ctx.fillStyle = '#333';
    ctx.fillRect(cx - 6, cy - 5 + bob, 12, 5);
    // Head / helmet
    ctx.fillStyle = '#2a2a2a';
    ctx.beginPath();
    ctx.arc(cx, cy - 12 + bob, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(cx - 7, cy - 13 + bob, 14, 4);
    // Red visor
    ctx.fillStyle = '#c00';
    ctx.fillRect(cx - 4, cy - 13 + bob, 8, 2);
    // Sword
    ctx.fillStyle = '#444';
    ctx.fillRect(cx + 8 * m.facing, cy - 16 + bob, 3, 22);
    ctx.fillStyle = '#666';
    ctx.fillRect(cx + 8 * m.facing, cy - 16 + bob, 1, 22);
    ctx.fillStyle = '#c00';
    ctx.fillRect(cx + 6 * m.facing, cy + 4 + bob, 7, 2);
    // Shield
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(cx - 10 * m.facing, cy - 6 + bob);
    ctx.lineTo(cx - 5 * m.facing, cy - 8 + bob);
    ctx.lineTo(cx - 5 * m.facing, cy + 6 + bob);
    ctx.lineTo(cx - 7 * m.facing, cy + 8 + bob);
    ctx.lineTo(cx - 10 * m.facing, cy + 6 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#c00';
    ctx.beginPath();
    ctx.arc(cx - 7.5 * m.facing, cy + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    // Legs
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(cx - 5, cy + 8 + bob, 4, 6);
    ctx.fillRect(cx + 1, cy + 8 + bob, 4, 6);
  }

  _drawDemon(ctx, cx, cy, bob, m) {
    const isGreater = m.type === 'greater_demon';
    const bodyColor = isGreater ? '#8B0000' : '#B22222';
    const scale = isGreater ? 1.2 : 1;

    // Wings
    ctx.fillStyle = `${bodyColor}88`;
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy - 6 + bob);
    ctx.quadraticCurveTo(cx - 20 * scale, cy - 20 * scale + bob, cx - 14 * scale, cy + 2 + bob);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 6, cy - 6 + bob);
    ctx.quadraticCurveTo(cx + 20 * scale, cy - 20 * scale + bob, cx + 14 * scale, cy + 2 + bob);
    ctx.fill();

    // Body
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy + bob, 8 * scale, 10 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.beginPath();
    ctx.arc(cx, cy - 12 * scale + bob, 7 * scale, 0, Math.PI * 2);
    ctx.fill();
    // Horns
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 16 * scale + bob);
    ctx.lineTo(cx - 10, cy - 24 * scale + bob);
    ctx.lineTo(cx - 3, cy - 18 * scale + bob);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + 5, cy - 16 * scale + bob);
    ctx.lineTo(cx + 10, cy - 24 * scale + bob);
    ctx.lineTo(cx + 3, cy - 18 * scale + bob);
    ctx.fill();
    // Eyes
    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 13 * scale + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 3, cy - 13 * scale + bob, 2, 0, Math.PI * 2);
    ctx.fill();
    // Claws
    ctx.fillStyle = '#333';
    ctx.fillRect(cx + 8 * m.facing, cy - 2 + bob, 5 * m.facing, 2);
    ctx.fillRect(cx + 10 * m.facing, cy + bob, 4 * m.facing, 2);
    // Legs
    ctx.fillStyle = isGreater ? '#6B0000' : '#8B1111';
    ctx.fillRect(cx - 4, cy + 9 * scale + bob, 3, 5);
    ctx.fillRect(cx + 1, cy + 9 * scale + bob, 3, 5);
  }

  // ---- GROUND ITEMS ----
  drawGroundItems(room, camera) {
    const ctx = this.ctx;
    for (const groundItem of room.groundItems) {
      const sx = camera.screenX(groundItem.x);
      const sy = camera.screenY(groundItem.y);
      const item = ITEMS[groundItem.id];
      if (!item) continue;

      // Glowing dot on ground
      const pulse = 0.6 + Math.sin(this.time / 400 + groundItem.x) * 0.3;
      ctx.globalAlpha = pulse;

      // Item color based on type
      let color = '#fff';
      if (item.metalTier) color = METAL_COLORS[item.metalTier].primary;
      else if (item.type === ITEM_TYPE.FISH_RAW) color = '#5090c0';
      else if (item.type === ITEM_TYPE.FISHING_ROD) color = '#8B4513';

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, 4, 0, Math.PI * 2);
      ctx.fill();

      // Glow
      ctx.fillStyle = color;
      ctx.globalAlpha = pulse * 0.3;
      ctx.beginPath();
      ctx.arc(sx + TILE_SIZE / 2, sy + TILE_SIZE / 2, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 1;

      // Item name
      ctx.font = '8px monospace';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(item.name, sx + TILE_SIZE / 2, sy + TILE_SIZE / 2 - 8);
      ctx.textAlign = 'left';
    }
  }

  // ---- LIGHTING ----
  drawLighting(player, camera, room) {
    const ctx = this.ctx;
    const px = camera.screenX(player.centerX);
    const py = camera.screenY(player.centerY);

    // Player light
    const radius = 160 + Math.sin(this.time / 500) * 8;
    const grad = ctx.createRadialGradient(px, py, 30, px, py, radius);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0.85)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Campfire light
    if (room.campfirePos) {
      const fx = camera.screenX(room.campfirePos.x * TILE_SIZE + TILE_SIZE / 2);
      const fy = camera.screenY(room.campfirePos.y * TILE_SIZE + TILE_SIZE / 2);
      const fireRadius = 80 + Math.sin(this.time / 300) * 10;
      ctx.globalCompositeOperation = 'destination-out';
      const fireGrad = ctx.createRadialGradient(fx, fy, 5, fx, fy, fireRadius);
      fireGrad.addColorStop(0, 'rgba(0,0,0,0.5)');
      fireGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fireGrad;
      ctx.fillRect(fx - fireRadius, fy - fireRadius, fireRadius * 2, fireRadius * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  update(dt) {
    this.time += dt;
  }
}
