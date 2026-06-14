// The house: tile grid, rooms, hiding spots, and top-down rendering.
import { TILE, COLS, ROWS } from './config.js';

// ── room rectangles (tile coords, inclusive) ──
// Two rows of three rooms with a hallway spine between them.
const R = (name, c0, r0, c1, r1, floor, plank) =>
  ({ name, c0, r0, c1, r1, floor, plank });

export const ROOMS = [
  R('Living Room', 1, 1, 6, 5, '#caa978', '#b8965f'),
  R('Kitchen',     8, 1, 15, 5, '#d8d2c0', '#c5bda6'),
  R('Den',        17, 1, 22, 5, '#b89c86', '#a4866d'),
  R('Hallway',     1, 7, 22, 8, '#c2a98f', '#b09678'),
  R("Big Bro's Room", 1, 10, 6, 14, '#9fb6c9', '#88a3ba'),
  R("Lil Bro's Room", 8, 10, 15, 14, '#c8b0c6', '#b89cb6'),
  R('Bathroom',   17, 10, 22, 14, '#a7cdc9', '#8fbcb7'),
];
export const START_ROOM = 0; // the fart happens here

// doors: single floor tiles punched through wall separators
const DOORS = [
  [3, 6], [11, 6], [19, 6],   // top rooms → hallway
  [3, 9], [11, 9], [19, 9],   // hallway → bottom rooms
];

// ── hiding spots: { tile, name, emoji, type } ──
export const SPOTS = [
  { c: 5, r: 1, name: 'the couch',      emoji: '🛋️', type: 'couch' },
  { c: 1, r: 4, name: 'the curtains',   emoji: '🪟', type: 'curtain' },
  { c: 8, r: 1, name: 'the pantry',     emoji: '🥫', type: 'pantry' },
  { c: 14, r: 1, name: 'the cupboard',  emoji: '🍽️', type: 'cupboard' },
  { c: 22, r: 2, name: 'the bookshelf', emoji: '📚', type: 'shelf' },
  { c: 17, r: 4, name: 'the big plant', emoji: '🪴', type: 'plant' },
  { c: 1, r: 10, name: 'the wardrobe',  emoji: '🚪', type: 'wardrobe' },
  { c: 5, r: 14, name: 'under the bed', emoji: '🛏️', type: 'bed' },
  { c: 8, r: 10, name: 'the bunk bed',  emoji: '🛏️', type: 'bunk' },
  { c: 15, r: 14, name: 'the toy box',  emoji: '🧸', type: 'toybox' },
  { c: 22, r: 10, name: 'the shower',   emoji: '🚿', type: 'shower' },
  { c: 17, r: 14, name: 'the laundry basket', emoji: '🧺', type: 'basket' },
];

// ── build the grid ── 0 = wall, 1 = floor. `room[]` = room index per floor tile.
export const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
export const roomOf = Array.from({ length: ROWS }, () => new Array(COLS).fill(-1));

ROOMS.forEach((rm, i) => {
  for (let r = rm.r0; r <= rm.r1; r++)
    for (let c = rm.c0; c <= rm.c1; c++) { grid[r][c] = 1; roomOf[r][c] = i; }
});
DOORS.forEach(([c, r]) => {
  grid[r][c] = 1;
  if (roomOf[r][c] < 0) roomOf[r][c] = 3; // doors belong to the hallway look
});

export const inBounds = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
export const isFloor = (c, r) => inBounds(c, r) && grid[r][c] === 1;
export const tileCenter = (c, r) => ({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE });
export const worldToTile = (x, y) => ({ c: Math.floor(x / TILE), r: Math.floor(y / TILE) });

// nearest walkable tile (used when a tap lands on/near a wall)
export function nearestFloor(c, r) {
  if (isFloor(c, r)) return { c, r };
  for (let rad = 1; rad < 6; rad++) {
    let best = null, bestD = 1e9;
    for (let dr = -rad; dr <= rad; dr++)
      for (let dc = -rad; dc <= rad; dc++) {
        const nc = c + dc, nr = r + dr;
        if (!isFloor(nc, nr)) continue;
        const d = dc * dc + dr * dr;
        if (d < bestD) { bestD = d; best = { c: nc, r: nr }; }
      }
    if (best) return best;
  }
  return { c: 3, r: 3 };
}

const hash = (c, r) => {
  const h = Math.sin(c * 12.9898 + r * 78.233) * 43758.5453;
  return h - Math.floor(h);
};

// ── rendering ──
function roundRect(ctx, x, y, w, h, rad) {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export function drawHouse(ctx) {
  // floor tiles with per-tile plank shading
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== 1) continue;
      const rm = ROOMS[roomOf[r][c]] || ROOMS[3];
      const x = c * TILE, y = r * TILE;
      ctx.fillStyle = rm.floor;
      ctx.fillRect(x, y, TILE, TILE);
      // subtle per-tile shade + plank seam
      ctx.fillStyle = `rgba(0,0,0,${0.04 + hash(c, r) * 0.05})`;
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = rm.plank;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, y + TILE); ctx.lineTo(x + TILE, y + TILE);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // rugs for warmth
  rug(ctx, 2, 2, 4, 3, '#9c5a4a', '#c47b66');           // living room
  rug(ctx, 1, 7, 22, 2, '#7a6a8c', '#8f7da3', 0.35);    // hallway runner

  // walls — every wall tile that borders the house, with a beveled look
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] !== 0) continue;
      let bordersFloor = false;
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]])
        if (isFloor(c + dc, r + dr)) { bordersFloor = true; break; }
      if (!bordersFloor) continue;
      const x = c * TILE, y = r * TILE;
      ctx.fillStyle = '#4a3b55';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.fillStyle = '#62506f';
      ctx.fillRect(x + 2, y + 2, TILE - 4, TILE - 6);
      ctx.fillStyle = 'rgba(255,255,255,.08)';
      ctx.fillRect(x + 2, y + 2, TILE - 4, 4);
    }
  }

  // room labels (faint)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const rm of ROOMS) {
    if (rm.name === 'Hallway') continue;
    const cx = ((rm.c0 + rm.c1 + 1) / 2) * TILE;
    const cy = (rm.r0 + 0.55) * TILE;
    ctx.font = `600 ${Math.round(TILE * 0.34)}px 'Baloo 2', sans-serif`;
    ctx.fillStyle = 'rgba(40,25,55,.16)';
    ctx.fillText(rm.name.toUpperCase(), cx, cy);
  }

  // furniture for every hiding spot
  for (const s of SPOTS) drawFurniture(ctx, s);
}

function rug(ctx, c, r, w, h, col, edge, alpha = 0.85) {
  const x = c * TILE + 4, y = r * TILE + 4, pw = w * TILE - 8, ph = h * TILE - 8;
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(ctx, x, y, pw, ph, 10); ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = edge;
  roundRect(ctx, x + 6, y + 6, pw - 12, ph - 12, 8); ctx.stroke();
  ctx.restore();
}

// Furniture drawn top-down. Each sits on its spot tile; the hider tucks on top.
function drawFurniture(ctx, s) {
  const x = s.c * TILE, y = s.r * TILE, T = TILE;
  ctx.save();
  ctx.translate(x, y);
  const shadow = () => { ctx.fillStyle = 'rgba(0,0,0,.16)'; roundRect(ctx, 4, T - 7, T - 8, 7, 4); ctx.fill(); };
  const box = (px, py, pw, ph, col, rad = 5) => { roundRect(ctx, px, py, pw, ph, rad); ctx.fillStyle = col; ctx.fill(); };
  switch (s.type) {
    case 'couch':
      shadow();
      box(2, 6, T - 4, T - 12, '#8a5a4a', 8);
      box(2, 2, T - 4, 12, '#a06a56', 6);
      box(5, 12, 12, T - 18, '#b67e69', 4); box(T - 17, 12, 12, T - 18, '#b67e69', 4);
      break;
    case 'curtain':
      box(1, 1, T - 2, 9, '#7a4a3c', 3);
      for (let i = 0; i < 5; i++) box(2 + i * 7, 9, 6, T - 12, i % 2 ? '#c98a7a' : '#b87060', 3);
      break;
    case 'pantry': case 'wardrobe': case 'cupboard':
      shadow();
      box(4, 2, T - 8, T - 8, s.type === 'pantry' ? '#9a7048' : '#7d5a8c', 5);
      box(7, 6, (T - 16) / 2 - 1, T - 16, 'rgba(0,0,0,.18)', 3);
      box(T / 2 + 1, 6, (T - 16) / 2 - 1, T - 16, 'rgba(0,0,0,.18)', 3);
      ctx.fillStyle = '#ffe39a'; ctx.beginPath();
      ctx.arc(T / 2 - 2, T / 2, 2, 0, 7); ctx.arc(T / 2 + 4, T / 2, 2, 0, 7); ctx.fill();
      break;
    case 'shelf':
      box(3, 2, T - 6, T - 6, '#6e4a30', 4);
      for (let i = 0; i < 3; i++) {
        box(6, 6 + i * 9, T - 12, 7, '#8a623f', 2);
        for (let j = 0; j < 3; j++) box(7 + j * 8, 6 + i * 9, 6, 7, ['#c0556a','#5a86c0','#6aa36a'][(i+j)%3], 1);
      }
      break;
    case 'plant':
      box(T / 2 - 7, T - 16, 14, 12, '#a9683f', 4);
      ctx.fillStyle = '#3f7a44';
      for (const [dx, dy, rr] of [[T/2,8,11],[T/2-9,14,8],[T/2+9,14,8],[T/2,18,8]]) {
        ctx.beginPath(); ctx.arc(dx, dy, rr, 0, 7); ctx.fill();
      }
      break;
    case 'bed': case 'bunk':
      shadow();
      box(3, 3, T - 6, T - 6, '#d9d2e0', 6);
      box(3, 3, T - 6, 13, s.type === 'bunk' ? '#e58aa8' : '#7fa8d6', 6); // pillow end
      box(6, 18, T - 12, T - 22, '#bfe0ef', 4);
      break;
    case 'toybox':
      shadow();
      box(4, 8, T - 8, T - 12, '#e08a3c', 5);
      box(4, 4, T - 8, 8, '#f2a857', 4);
      ctx.fillStyle = '#fff'; ctx.font = `${Math.round(T*0.4)}px serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🧸', T / 2, 9);
      break;
    case 'shower':
      box(2, 2, T - 4, T - 4, 'rgba(180,220,225,.55)', 6);
      ctx.strokeStyle = '#7fb0ac'; ctx.lineWidth = 3;
      roundRect(ctx, 2, 2, T - 4, T - 4, 6); ctx.stroke();
      box(T / 2 - 3, 3, 6, 8, '#cfe6e4', 3);
      ctx.strokeStyle = 'rgba(150,200,210,.6)'; ctx.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(8 + i * 7, 14); ctx.lineTo(6 + i * 7, T - 6); ctx.stroke(); }
      break;
    case 'basket':
      shadow();
      box(6, 8, T - 12, T - 12, '#cdb487', 7);
      ctx.strokeStyle = '#a88f63'; ctx.lineWidth = 1.5;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(6, 8 + i * 6); ctx.lineTo(T - 6, 8 + i * 6); ctx.stroke(); }
      box(8, 4, T - 16, 8, '#e9e2d4', 4); // poking laundry
      break;
  }
  ctx.restore();
}
