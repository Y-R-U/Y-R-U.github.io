#!/usr/bin/env node
// Luma histogram of a render, plus a per-block void map. Answers the one question a dark interior
// keeps failing: is this region dark, or is there nothing in it?
//
//   node tools/exposure.mjs shots/bridge_lamp.png
//   node tools/exposure.mjs shots/*.png --blocks=6x4
//
// A region that is still featureless after a lift is a void. We detect it without grading: inside
// each block, count how much of it sits at luma <= DEAD and how much spread the rest has.
// Measured on plates a critic scored 8+: <= 4% of frame at luma <= 4. Our failing renders: 42-61%.

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const DEAD = 4;          // luma at or below this carries no recoverable structure
const VOID_FRAC = 0.55;  // a block this dead is reported as a void

const args = process.argv.slice(2);
const files = args.filter(a => !a.startsWith('--'));
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => a.replace(/^--/, '').split('=')));
const [BX, BY] = (opt.blocks || '6x4').split('x').map(Number);
if (!files.length) { console.error('usage: exposure.mjs <png…> [--blocks=6x4]'); process.exit(1); }

function raw(file) {
  const meta = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height',
    '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim().split(',');
  const w = +meta[0], h = +meta[1];
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'rawvideo',
    '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 30 });
  return { w, h, buf };
}

const pct = (n, d) => (100 * n / d).toFixed(1).padStart(5) + '%';

for (const f of files) {
  const { w, h, buf } = raw(resolve(f));
  const hist = new Uint32Array(256);
  for (let i = 0; i < buf.length; i++) hist[buf[i]]++;

  const n = buf.length;
  let dead = 0;
  for (let v = 0; v <= DEAD; v++) dead += hist[v];
  let clipped = hist[255];

  const at = q => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * q) return v; } return 255; };
  const p1 = at(0.01), p5 = at(0.05), median = at(0.5), p99 = at(0.99);

  // Two ways to fail a dark shot, and they need opposite fixes. Crushed = no data in the shadows.
  // Lifted = data but no contrast, which reads as a grey wash — plates measure p1 4-15, and a
  // milky render measured p1 19-24 while reporting 0.0% dead, so `dead` alone cannot see it.
  const crushed = dead / n;
  const verdict = crushed > 0.10 ? 'CRUSHED' : crushed > 0.05 ? 'dark' : p1 > 18 ? 'LIFTED' : 'ok';
  console.log(`\n${f}  ${w}x${h}`);
  console.log(`  luma<=${DEAD}: ${pct(dead, n)}   p1 ${String(p1).padStart(3)}   p5 ${String(p5).padStart(3)}   median ${String(median).padStart(3)}   p99 ${String(p99).padStart(3)}   clipped ${pct(clipped, n)}   → ${verdict}`);

  // Where the voids are. A block that is mostly dead is printed as #, one that is merely dark as +.
  const rows = [];
  for (let by = 0; by < BY; by++) {
    let row = '  ';
    for (let bx = 0; bx < BX; bx++) {
      const x0 = Math.floor(bx * w / BX), x1 = Math.floor((bx + 1) * w / BX);
      const y0 = Math.floor(by * h / BY), y1 = Math.floor((by + 1) * h / BY);
      let d = 0, tot = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { if (buf[y * w + x] <= DEAD) d++; tot++; }
      const frac = d / tot;
      row += frac > VOID_FRAC ? ' # ' : frac > 0.25 ? ' + ' : frac > 0.05 ? ' . ' : '   ';
    }
    rows.push(row);
  }
  console.log('  void map (# = >55% dead, + = >25%, . = >5%):');
  for (const r of rows) console.log(r);
}
