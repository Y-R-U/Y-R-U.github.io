// ---- baked pitch background (per condition) ----
import {
  WORLD_W, WORLD_H, PX, PY, PITCH_W, PITCH_H, CX, CY,
  GOAL_W, BOX_W, BOX_H, SIX_W, SIX_H, SPOT_DIST,
} from './const.js';
import { mulberry32 } from './util.js';

const PALETTES = {
  grass: { a: '#3f9e4d', b: '#389145', line: 'rgba(255,255,255,0.85)', apron: '#2c6e38' },
  wet:   { a: '#357f42', b: '#2e733b', line: 'rgba(255,255,255,0.75)', apron: '#245a30' },
  mud:   { a: '#6e5a33', b: '#64522e', line: 'rgba(255,255,255,0.6)',  apron: '#4a3d24' },
  ice:   { a: '#b8cfd4', b: '#aac4cb', line: 'rgba(255,255,255,0.95)', apron: '#8fa8ae' },
  dry:   { a: '#8fa04a', b: '#849544', line: 'rgba(255,255,255,0.85)', apron: '#6b7a38' },
};

const ADS = ['Y-R-U', 'KRUD KOLA', 'PIXFOOT 95', "MOO'S PIES", 'TURBO TAXI', 'BIG RON BETS', 'SOCK CITY', 'CHIP VAN'];

export function bakePitch(type = 'grass', seed = 7) {
  const pal = PALETTES[type] || PALETTES.grass;
  const rng = mulberry32(seed);
  const c = document.createElement('canvas');
  c.width = WORLD_W; c.height = WORLD_H;
  const g = c.getContext('2d');

  // ---- surround: stands + crowd ----
  g.fillStyle = '#20242c';
  g.fillRect(0, 0, WORLD_W, WORLD_H);
  const crowdCols = ['#5a4a6a', '#6a4a3a', '#3a5a7a', '#7a6a3a', '#4a6a4a', '#8a3a3a', '#d8c8a8', '#b8b8c8'];
  for (let y = 2; y < WORLD_H; y += 5) {
    for (let x = 2; x < WORLD_W; x += 5) {
      // only in the outer band
      if (x > PX - 42 && x < PX + PITCH_W + 42 && y > PY - 42 && y < PY + PITCH_H + 42) continue;
      if (rng() < 0.75) {
        g.fillStyle = crowdCols[(rng() * crowdCols.length) | 0];
        g.fillRect(x + rng() * 2, y + rng() * 2, 3, 3);
      }
    }
  }

  // ---- ad boards ----
  g.fillStyle = '#e8e4da';
  const bd = 14; // board depth
  g.fillRect(PX - 26, PY - 26, PITCH_W + 52, bd);                    // top
  g.fillRect(PX - 26, PY + PITCH_H + 12, PITCH_W + 52, bd);          // bottom
  g.fillRect(PX - 26, PY - 26, bd, PITCH_H + 52);                    // left
  g.fillRect(PX + PITCH_W + 12, PY - 26, bd, PITCH_H + 52);          // right
  g.fillStyle = '#c33';
  g.font = 'bold 10px monospace';
  g.textBaseline = 'middle';
  for (let i = 0; i < 6; i++) {
    const t = ADS[(rng() * ADS.length) | 0];
    g.fillStyle = ['#c33', '#236', '#262', '#333'][(rng() * 4) | 0];
    g.save(); g.textAlign = 'center';
    g.fillText(t, PX + 60 + i * (PITCH_W - 80) / 5, PY - 19);
    g.fillText(t, PX + 60 + ((i + 3) % 6) * (PITCH_W - 80) / 5, PY + PITCH_H + 19);
    g.restore();
  }
  g.save();
  g.textAlign = 'center';
  for (let i = 0; i < 8; i++) {
    const t = ADS[(rng() * ADS.length) | 0];
    g.fillStyle = ['#c33', '#236', '#262', '#333'][(rng() * 4) | 0];
    g.save(); g.translate(PX - 19, PY + 90 + i * (PITCH_H - 160) / 7); g.rotate(-Math.PI / 2); g.fillText(t, 0, 0); g.restore();
    g.save(); g.translate(PX + PITCH_W + 19, PY + 90 + ((i + 4) % 8) * (PITCH_H - 160) / 7); g.rotate(Math.PI / 2); g.fillText(t, 0, 0); g.restore();
  }
  g.restore();

  // ---- apron (grass around lines) ----
  g.fillStyle = pal.apron;
  g.fillRect(PX - 12, PY - 12, PITCH_W + 24, PITCH_H + 24);

  // ---- grass + mow stripes ----
  const stripeH = PITCH_H / 14;
  for (let i = 0; i < 14; i++) {
    g.fillStyle = i % 2 ? pal.a : pal.b;
    g.fillRect(PX, PY + i * stripeH, PITCH_W, stripeH + 1);
  }

  // texture speckle
  for (let i = 0; i < 2600; i++) {
    const x = PX + rng() * PITCH_W, y = PY + rng() * PITCH_H;
    g.fillStyle = rng() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.04)';
    g.fillRect(x, y, 2, 2);
  }

  // condition-specific patches
  if (type === 'mud' || type === 'grass') {
    const mud = type === 'mud' ? 'rgba(80,60,30,0.4)' : 'rgba(70,80,40,0.16)';
    const spots = [
      [CX, CY, 55], [CX, PY + 55, 45], [CX, PY + PITCH_H - 55, 45],
    ];
    for (const [sx, sy, sr] of spots) {
      for (let i = 0; i < 12; i++) {
        g.fillStyle = mud;
        const a = rng() * Math.PI * 2, r = rng() * sr;
        g.beginPath(); g.ellipse(sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.6, 7 + rng() * 8, 4 + rng() * 4, 0, 0, Math.PI * 2); g.fill();
      }
    }
  }
  if (type === 'wet') {
    for (let i = 0; i < 30; i++) {
      g.fillStyle = 'rgba(180,210,255,0.12)';
      g.beginPath(); g.ellipse(PX + rng() * PITCH_W, PY + rng() * PITCH_H, 10 + rng() * 22, 4 + rng() * 8, 0, 0, Math.PI * 2); g.fill();
    }
  }
  if (type === 'ice') {
    for (let i = 0; i < 40; i++) {
      g.fillStyle = 'rgba(255,255,255,0.2)';
      g.beginPath(); g.ellipse(PX + rng() * PITCH_W, PY + rng() * PITCH_H, 8 + rng() * 20, 3 + rng() * 7, 0, 0, Math.PI * 2); g.fill();
    }
  }
  if (type === 'dry') {
    for (let i = 0; i < 36; i++) {
      g.fillStyle = 'rgba(190,170,90,0.25)';
      g.beginPath(); g.ellipse(PX + rng() * PITCH_W, PY + rng() * PITCH_H, 10 + rng() * 18, 5 + rng() * 8, 0, 0, Math.PI * 2); g.fill();
    }
  }

  // ---- markings ----
  g.strokeStyle = pal.line;
  g.fillStyle = pal.line;
  g.lineWidth = 3;
  g.strokeRect(PX, PY, PITCH_W, PITCH_H);
  // halfway + centre
  g.beginPath(); g.moveTo(PX, CY); g.lineTo(PX + PITCH_W, CY); g.stroke();
  g.beginPath(); g.arc(CX, CY, 60, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(CX, CY, 4, 0, Math.PI * 2); g.fill();

  for (const top of [true, false]) {
    const gy = top ? PY : PY + PITCH_H;
    const dir = top ? 1 : -1;
    // penalty box
    g.strokeRect(CX - BOX_W / 2, top ? gy : gy - BOX_H, BOX_W, BOX_H);
    g.strokeRect(CX - SIX_W / 2, top ? gy : gy - SIX_H, SIX_W, SIX_H);
    // spot
    g.beginPath(); g.arc(CX, gy + dir * SPOT_DIST, 3, 0, Math.PI * 2); g.fill();
    // D arc
    g.beginPath();
    g.arc(CX, gy + dir * SPOT_DIST, 58, top ? 0.42 : Math.PI + 0.42, top ? Math.PI - 0.42 : Math.PI * 2 - 0.42);
    g.stroke();
    // corner arcs
    g.beginPath(); g.arc(PX, gy, 10, top ? 0 : -Math.PI / 2, top ? Math.PI / 2 : 0); g.stroke();
    g.beginPath(); g.arc(PX + PITCH_W, gy, 10, top ? Math.PI / 2 : Math.PI, top ? Math.PI : Math.PI * 1.5); g.stroke();
  }

  // corner flags
  for (const [fx, fy] of [[PX, PY], [PX + PITCH_W, PY], [PX, PY + PITCH_H], [PX + PITCH_W, PY + PITCH_H]]) {
    g.strokeStyle = '#ddd'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx, fy - 14); g.stroke();
    g.fillStyle = '#e8b33a';
    g.fillRect(fx, fy - 14, 7, 5);
  }

  return c;
}
