#!/usr/bin/env node
// Measures the lit-to-shadow luminance ratio of a scenario.
// Renders it twice — once normally, once with `shadows=off` — and compares the two on exactly
// the pixels the shadow map darkened, so lit and shadow are read off the same surfaces.
//
//   node tools/ratio.mjs --shot=wall_day
//   node tools/ratio.mjs --shot=street_dusk --set="time=17.6"

import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => {
  const s = a.replace(/^--/, ''); const i = s.indexOf('=');
  return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)];
}));

const shot = args.shot || 'wall_day';
const extra = args.set ? args.set + '&' : '';
const dir = mkdtempSync(join(tmpdir(), 'forge-ratio-'));

function render(sub, set) {
  execFileSync('node', [join(ROOT, 'tools/shot.mjs'), `--shot=${shot}`, `--set=${set}`,
    `--w=${args.w || 640}`, `--h=${args.h || 360}`, '--dpr=1', `--outdir=${join(dir, sub)}`,
    ...(args.preset ? [`--preset=${args.preset}`] : [])], { stdio: ['ignore', 'ignore', 'inherit'] });
  return decode(join(dir, sub, `${shot}.png`));
}

function decode(path) {
  const d = readFileSync(path);
  let i = 8, w = 0, h = 0, ct = 6, idat = [];
  while (i < d.length) {
    const ln = d.readUInt32BE(i), typ = d.toString('latin1', i + 4, i + 8);
    if (typ === 'IHDR') { w = d.readUInt32BE(i + 8); h = d.readUInt32BE(i + 12); ct = d[i + 17]; }
    else if (typ === 'IDAT') idat.push(d.subarray(i + 8, i + 8 + ln));
    i += 12 + ln;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const stride = w * ch, out = Buffer.alloc(h * stride);
  let pos = 0, prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[pos++];
    const line = Buffer.from(raw.subarray(pos, pos + stride)); pos += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? line[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      if (f === 1) line[x] = (line[x] + a) & 255;
      else if (f === 2) line[x] = (line[x] + b) & 255;
      else if (f === 3) line[x] = (line[x] + ((a + b) >> 1)) & 255;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        line[x] = (line[x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * stride); prev = line;
  }
  return { w, h, ch, px: out };
}

// sRGB -> relative luminance, so a "4:1 ratio" means what a light meter would say
const toLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const LIN = new Float64Array(256);
for (let i = 0; i < 256; i++) LIN[i] = toLin(i);
const lum = (p, i) => 0.2126 * LIN[p[i]] + 0.7152 * LIN[p[i + 1]] + 0.0722 * LIN[p[i + 2]];

const on = render('on', `${extra}shadows=soft`);
const off = render('off', `${extra}shadows=off`);

let litSum = 0, shSum = 0, n = 0, sky = 0;
const drop = [];
for (let i = 0; i < on.px.length; i += on.ch) {
  const a = lum(on.px, i), b = lum(off.px, i);
  if (b <= 1e-4) continue;
  const r = a / b;
  if (r > 0.985) { sky++; continue; }   // unshadowed, or sky
  litSum += b; shSum += a; n++;
  drop.push(r);
}
drop.sort((a, b) => a - b);
const pct = q => drop.length ? drop[Math.floor(q * (drop.length - 1))] : 1;

console.log(`${shot}  shadowed pixels ${(100 * n / (on.w * on.h)).toFixed(1)}%`);
if (!n) { console.log('  no pixels darkened by the shadow map'); process.exit(0); }
console.log(`  mean lit  ${(litSum / n).toFixed(4)}   mean shadow ${(shSum / n).toFixed(4)}`);
console.log(`  lit:shadow  ${(litSum / shSum).toFixed(2)} : 1`);
console.log(`  deepest 10% of shadow  ${(1 / pct(0.10)).toFixed(2)} : 1     median ${(1 / pct(0.5)).toFixed(2)} : 1`);
