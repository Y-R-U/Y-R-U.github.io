// ---- landscape side stands: pre-baked crowd bands, animated by frame swaps ----
// Each band is two seat rows running the full stand width, baked once per match
// in BOB bob frames + CHEER arms-up frames. Per frame we only pick a frame per
// visible band (~40 drawImage calls), so the crowd costs next to nothing.
import { WORLD_W, WORLD_H, PX } from './const.js';
import { mulberry32 } from './util.js';
import { SKINS, HAIRS } from './sprites.js';

const S = 2;                    // art pixel -> world px, same as the players
const COL = 15, ROW = 20;       // seat pitch (world px)
const BAND_H = ROW * 2;
const FRONT = PX - 42;          // the baked dot crowd ends here; our stand covers it
const DEPTH = 1300;             // stand reaches this far out past the world edge
const BAND_W = DEPTH + FRONT;
const PATTERNS = 3, BOB = 4, CHEER = 2;
const NEUTRAL = ['#5a4a6a', '#6a4a3a', '#3a5a7a', '#7a6a3a', '#4a6a4a', '#8a3a3a', '#d8c8a8', '#b8b8c8', '#2b2b2b'];
const BOBY = [0, 1, 2, 1];
const NBANDS = Math.ceil(WORLD_H / BAND_H);

export const CROWD = {
  excite: [0, 0],         // per stand, 0..1: >band threshold = arms up
  surge(amount, side = -1) {
    for (let i = 0; i < 2; i++) {
      const a = side < 0 || side === i ? amount : amount * 0.15;
      this.excite[i] = Math.min(1, Math.max(this.excite[i], a));
    }
  },
};

let bands = null, key = null, thresh = null, phase = null;
let t = 0, waveY = -1, waveDir = 1, waveCD = 12;

function fan(g, x, y, shirt, skin, hair, arms, bob) {
  const p = (ax, ay, w, h, c) => { g.fillStyle = c; g.fillRect(x + ax * S, y + (ay - bob) * S, w * S, h * S); };
  p(1, 4, 5, 4, shirt);           // body
  p(2, 1, 3, 3, skin);            // head
  p(2, 0, 3, 1, hair);
  if (arms) { p(0, 0, 1, 4, skin); p(6, 0, 1, 4, skin); p(0, 4, 1, 1, shirt); p(6, 4, 1, 1, shirt); }
  else { p(0, 5, 1, 2, skin); p(6, 5, 1, 2, skin); }
}

// side 0 = left stand (home colours), 1 = right stand (away)
function bakeSide(side, kit, seed) {
  const out = [];
  for (let pi = 0; pi < PATTERNS; pi++) {
    const rng = mulberry32(seed + pi * 977 + side * 31);
    const seats = [];
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c * COL < BAND_W - COL; c++) {
        if (c % 16 === 7) continue;                                        // stair aisle
        const x = c * COL + 1, far = (side ? x : BAND_W - x) / BAND_W;   // back rows are emptier
        if (rng() < 0.08 + far * 0.3) continue;
        const r2 = rng();
        seats.push({
          x, y: r * ROW + 1,
          shirt: r2 < 0.55 ? kit.shirt : r2 < 0.7 ? kit.sleeve || kit.shirt : NEUTRAL[(rng() * NEUTRAL.length) | 0],
          skin: SKINS[(rng() * SKINS.length) | 0], hair: HAIRS[(rng() * HAIRS.length) | 0],
          ph: (rng() * BOB) | 0, keen: rng(),
        });
      }
    }
    const frames = [];
    for (let f = 0; f < BOB + CHEER; f++) {
      const c = document.createElement('canvas');
      c.width = BAND_W; c.height = BAND_H;
      const g = c.getContext('2d');
      g.fillStyle = '#2a2f38'; g.fillRect(0, 0, BAND_W, BAND_H);
      g.fillStyle = '#323844';
      for (let r = 0; r < 2; r++) g.fillRect(0, r * ROW + 13, BAND_W, 5);   // bench step
      g.fillStyle = '#1a1e25';
      g.fillRect(side ? 0 : BAND_W - 3, 0, 3, BAND_H);                         // front wall
      g.fillStyle = '#3a404c';
      for (let c = 7; c * COL < BAND_W; c += 16) g.fillRect(c * COL + 2, 0, COL - 4, BAND_H);
      for (const s of seats) {
        const cheer = f >= BOB;
        const bob = cheer ? ((f - BOB + s.ph) % 2) * 2 : BOBY[(f + s.ph) % BOB];
        fan(g, s.x, s.y + 2, s.shirt, s.skin, s.hair, cheer && s.keen > 0.15, bob);
      }
      const shade = g.createLinearGradient(side ? 0 : BAND_W, 0, side ? BAND_W : 0, 0);
      shade.addColorStop(0, 'rgba(10,12,16,0)');
      shade.addColorStop(0.15, 'rgba(10,12,16,0.12)');
      shade.addColorStop(0.6, 'rgba(10,12,16,0.5)');
      shade.addColorStop(1, 'rgba(10,12,16,0.62)');
      g.fillStyle = shade; g.fillRect(0, 0, BAND_W, BAND_H);
      frames.push(c);
    }
    out.push(frames);
  }
  return out;
}

export function crowdForMatch(match) {
  const k0 = match.teams[0].kit, k1 = match.teams[1].kit;
  const k = k0.shirt + k1.shirt;
  if (k === key) return;
  key = k;
  const seed = (Math.random() * 1e6) | 0;
  bands = [bakeSide(0, k0, seed), bakeSide(1, k1, seed + 7)];
  const rng = mulberry32(seed + 3);
  thresh = []; phase = [];
  for (let i = 0; i < NBANDS * 2; i++) { thresh.push(0.25 + rng() * 0.55); phase.push(rng() * 4); }
  CROWD.excite[0] = CROWD.excite[1] = 0;
}

export function updateCrowd(dt) {
  t += dt;
  for (let i = 0; i < 2; i++) CROWD.excite[i] = Math.max(0, CROWD.excite[i] - dt * 0.28);
  if (waveY < 0) {
    waveCD -= dt;
    if (waveCD <= 0 && Math.max(...CROWD.excite) < 0.2) { waveDir = Math.random() < 0.5 ? 1 : -1; waveY = 0; }
  } else {
    waveY += dt * 300;
    if (waveY > WORLD_H + 120) { waveY = -1; waveCD = 16 + Math.random() * 24; }
  }
}

// world transform must be set; draws only the bands inside [top, bot]
export function drawCrowd(ctx, top, bot) {
  if (!bands) return;
  const b0 = Math.max(0, Math.floor(top / BAND_H)), b1 = Math.min(NBANDS - 1, Math.floor(bot / BAND_H));
  const wy = waveY < 0 ? -1e9 : (waveDir > 0 ? waveY : WORLD_H - waveY);
  for (let side = 0; side < 2; side++) {
    const ex = CROWD.excite[side];
    const speed = 5 + ex * 10;
    const x = side ? WORLD_W - FRONT : -DEPTH;
    for (let b = b0; b <= b1; b++) {
      const i = side * NBANDS + b;
      const y = b * BAND_H;
      const pat = bands[side][(b * 7 + side) % PATTERNS];
      let f;
      if (ex > thresh[i] || Math.abs(y + BAND_H / 2 - wy) < 70) f = BOB + (((t * 7 + phase[i]) | 0) % CHEER);
      else f = ((t * speed + phase[i]) | 0) % BOB;
      ctx.drawImage(pat[f], x, y);
    }
  }
}
