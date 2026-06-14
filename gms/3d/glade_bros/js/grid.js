// Shared house grid: room rectangles, doorways, hiding spots, and tile↔world
// transforms. Same 24×16 layout as the 2D Glade Bros, centred on the origin.
import { COLS, ROWS, TS } from './config.js';

const R = (name, c0, r0, c1, r1, floor, plank) => ({ name, c0, r0, c1, r1, floor, plank });

export const ROOMS = [
  R('Living Room',     1, 1, 6, 5,  0xcaa978, 0xb8965f),
  R('Kitchen',         8, 1, 15, 5, 0xd8d2c0, 0xc5bda6),
  R('Den',            17, 1, 22, 5, 0xb89c86, 0xa4866d),
  R('Hallway',         1, 7, 22, 8, 0xc2a98f, 0xb09678),
  R("Big Bro's Room",  1, 10, 6, 14, 0x9fb6c9, 0x88a3ba),
  R("Lil Bro's Room",  8, 10, 15, 14, 0xc8b0c6, 0xb89cb6),
  R('Bathroom',       17, 10, 22, 14, 0xa7cdc9, 0x8fbcb7),
];
export const START_ROOM = 0;

const DOORS = [[3, 6], [11, 6], [19, 6], [3, 9], [11, 9], [19, 9]];

export const SPOTS = [
  { c: 5, r: 1, name: 'the couch',      type: 'couch' },
  { c: 1, r: 4, name: 'the curtains',   type: 'curtain' },
  { c: 8, r: 1, name: 'the pantry',     type: 'pantry' },
  { c: 14, r: 1, name: 'the cupboard',  type: 'cupboard' },
  { c: 22, r: 2, name: 'the bookshelf', type: 'shelf' },
  { c: 17, r: 4, name: 'the big plant', type: 'plant' },
  { c: 1, r: 10, name: 'the wardrobe',  type: 'wardrobe' },
  { c: 5, r: 14, name: 'under the bed', type: 'bed' },
  { c: 8, r: 10, name: 'the bunk bed',  type: 'bunk' },
  { c: 15, r: 14, name: 'the toy box',  type: 'toybox' },
  { c: 22, r: 10, name: 'the shower',   type: 'shower' },
  { c: 17, r: 14, name: 'the laundry basket', type: 'basket' },
];

export const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
export const roomOf = Array.from({ length: ROWS }, () => new Array(COLS).fill(-1));

ROOMS.forEach((rm, i) => {
  for (let r = rm.r0; r <= rm.r1; r++)
    for (let c = rm.c0; c <= rm.c1; c++) { grid[r][c] = 1; roomOf[r][c] = i; }
});
DOORS.forEach(([c, r]) => { grid[r][c] = 1; if (roomOf[r][c] < 0) roomOf[r][c] = 3; });

export const inBounds = (c, r) => c >= 0 && c < COLS && r >= 0 && r < ROWS;
export const isFloor = (c, r) => inBounds(c, r) && grid[r][c] === 1;

const HALF_C = (COLS - 1) / 2, HALF_R = (ROWS - 1) / 2;
export const tileToWorld = (c, r) => ({ x: (c - HALF_C) * TS, z: (r - HALF_R) * TS });
export const worldToTile = (x, z) => ({ c: Math.floor(x / TS + COLS / 2), r: Math.floor(z / TS + ROWS / 2) });

export function nearestFloor(c, r) {
  if (isFloor(c, r)) return { c, r };
  for (let rad = 1; rad < 7; rad++) {
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
