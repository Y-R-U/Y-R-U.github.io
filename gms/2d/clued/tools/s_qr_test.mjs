// Verifies js/vendor/qr.js by decoding its output with jsQR (an independent decoder, fetched to a temp dir).
//   node tools/s_qr_test.mjs
import { createRequire } from 'node:module';
import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const lib = join(tmpdir(), 'jsQR-1.4.0.js');
if (!existsSync(lib)) writeFileSync(lib, await (await fetch('https://unpkg.com/jsqr@1.4.0/dist/jsQR.js')).text());
const jsQR = createRequire(import.meta.url)(lib);
const { qrMatrix } = await import(new URL('../js/vendor/qr.js', import.meta.url));

const texts = ['A', 'https://games.br8t.com/gms/2d/clued/?join=ABCDE', 'https://y-r-u.github.io/gms/2d/clued/?c=abcd2345',
  'héllo wörld ✓ ' + 'x'.repeat(40), 'y'.repeat(120), 'z'.repeat(250),
  'https://games.br8t.com/gms/2d/clued/#lc=z' + 'Ab9_-'.repeat(50)];
let bad = 0;
for (const t of texts) {
  const m = qrMatrix(t), n = m.length, s = 4, b = 4, W = (n + 2 * b) * s;
  const px = new Uint8ClampedArray(W * W * 4).fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x])
    for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) { const i = (((y + b) * s + dy) * W + (x + b) * s + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  const r = jsQR(px, W, W);
  const ok = r && r.data === t;
  if (!ok) bad++;
  console.log(ok ? '  ok  ' : '  FAIL', `v${(n - 17) / 4}`, t.slice(0, 60));
}
console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);
