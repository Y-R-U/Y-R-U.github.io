#!/usr/bin/env node
// BUILD_PLAN §3.5.6 — the offline signage baker.
//
//   node tools/bake_signs.mjs            bake assets/signs.png + data/signs.json
//   node tools/bake_signs.mjs --korean   include the optional Korean set (off by default)
//   node tools/bake_signs.mjs --serve    just serve tools/signbake.html so it can be eyeballed
//   node tools/bake_signs.mjs --headed   bake in a visible browser
//   node tools/bake_signs.mjs --out=/tmp/x  write elsewhere, for a determinism diff
//
// Node only. No imaging library — the sheet is drawn by tools/signbake.html in a real canvas and
// read back over CDP, reusing the `open()` helper from tools/shot.mjs so this adds no dependency.
//
// The bake is deterministic: same signwords.json + same seed → byte-identical PNG. The sha256 of
// both outputs is printed on every run so "re-running reproduces it" is one diff, not a belief.

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, statSync, createReadStream, rmSync } from 'node:fs';
import { dirname, resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import http from 'node:http';
import { open, waitFor, parseArgs, cleanup } from './shot.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const SIZE = +(args.size || 2048);
const SEED = +(args.seed || 0x5164);
const BUDGET = 400 * 1024;                     // §3.5.1 — hard, not a target
const OUT = resolve(ROOT, args.out || '.');

const sha = b => createHash('sha256').update(b).digest('hex');

// ── oxipng is mandatory (§3.5.6 step 5) ────────────────────────────────────────────────────
// A canvas cannot emit a greyscale PNG. `toDataURL('image/png')` is always 8-bit RGBA, whatever
// was drawn into it, so the "8-bit greyscale PNG" §3.5.1 mandates does not exist until something
// reduces the colour type. oxipng does exactly that when all three channels are equal and alpha
// is opaque, which the bake page verifies before we get here. Not an optimisation — the raw RGBA
// sheet is ~2-3x the size and blows the 400 KB budget on its own.
function requireOxipng() {
  try {
    const v = execFileSync('oxipng', ['--version'], { encoding: 'utf8' }).trim();
    return v;
  } catch {
    console.error('✗ oxipng is not on PATH.\n'
      + '  The signage atlas must be an 8-bit GREYSCALE PNG and a canvas cannot produce one;\n'
      + '  oxipng performs the colour-type reduction. Install it and re-run:\n\n'
      + '      brew install oxipng\n\n'
      + '  Do not fall back to pngquant — it is a lossy palette quantiser and would give an\n'
      + '  indexed sheet, not a greyscale one.');
    process.exit(2);
  }
}

// ── a static server, for --serve ───────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function serve(port = 8977) {
  return new Promise((res, rej) => {
    const s = http.createServer((req, rp) => {
      let p = join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!existsSync(p) || statSync(p).isDirectory()) p = join(p, 'index.html');
      if (!existsSync(p)) { rp.writeHead(404); return rp.end('404'); }
      rp.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      createReadStream(p).pipe(rp);
    });
    let tries = 0;
    s.on('error', e => (e.code === 'EADDRINUSE' && ++tries < 60 ? s.listen(port + tries) : rej(e)));
    s.on('listening', () => res(s));
    s.listen(port);
  });
}

// ── the PNG header, read rather than trusted (§3.5.6 step 6) ───────────────────────────────
// signature 8 bytes, then IHDR: length(4) type(4) width(4) height(4) bitDepth(1) colourType(1).
// So bit depth is byte 24 and colour type is byte 25.
const COLOUR_TYPE = { 0: 'greyscale', 2: 'truecolour', 3: 'indexed', 4: 'greyscale+alpha', 6: 'RGBA' };
function ihdr(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), bitDepth: buf[24], colourType: buf[25] };
}

// A 2048² data URL is a few MB of string; pull it back in chunks rather than betting on one
// Runtime.evaluate returning it whole.
async function readPng(S) {
  const len = (await S('Runtime.evaluate', { expression: 'window.__png.length', returnByValue: true })).result.value;
  const CH = 2 * 1024 * 1024;
  let s = '';
  for (let off = 0; off < len; off += CH) {
    const r = await S('Runtime.evaluate', { expression: `window.__png.substr(${off},${CH})`, returnByValue: true });
    s += r.result.value;
  }
  if (s.length !== len) throw new Error(`data URL truncated: ${s.length}/${len}`);
  return Buffer.from(s.slice(s.indexOf(',') + 1), 'base64');
}

async function evalJSON(S, expr) {
  const r = await S('Runtime.evaluate', { expression: `JSON.stringify(${expr})`, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return JSON.parse(r.result.value);
}

// ── an independent check on the table ──────────────────────────────────────────────────────
// The page proved its own sheet; this proves the TABLE, from nothing but the numbers written to
// disk. Both have to agree or the atlas and the region list are describing different pictures.
function auditTable(t) {
  const bad = [];
  const rs = t.regions;
  for (const r of rs) {
    const [x, y, w, h] = r.px;
    if (x < 0 || y < 0 || x + w > t.size || y + h > t.size) bad.push(`${r.i} ${r.kind} outside the sheet`);
    if (Math.abs(r.u - x / t.size) > 1e-6 || Math.abs(r.v - y / t.size) > 1e-6
      || Math.abs(r.w - w / t.size) > 1e-6 || Math.abs(r.h - h / t.size) > 1e-6) bad.push(`${r.i} uv does not match px`);
    if (Math.abs(r.aspect - w / h) > 1e-4) bad.push(`${r.i} aspect does not match px`);
  }
  // O(n²) at n=250 is 31k comparisons — free, and it is the check that catches a packer bug.
  for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) {
    const A = rs[a].px, B = rs[b].px;
    const gapX = Math.max(B[0] - (A[0] + A[2]), A[0] - (B[0] + B[2]));
    const gapY = Math.max(B[1] - (A[1] + A[3]), A[1] - (B[1] + B[3]));
    if (Math.max(gapX, gapY) < t.padPx) bad.push(`${rs[a].i} and ${rs[b].i} are ${Math.max(gapX, gapY)}px apart (< ${t.padPx})`);
  }
  return bad;
}

async function main() {
  if (args.serve) {
    const s = await serve();
    console.log(`serving ${ROOT}\n  http://127.0.0.1:${s.address().port}/tools/signbake.html\nCtrl-C to stop`);
    return;
  }

  const ox = requireOxipng();
  const ctx = await open({ w: 1100, h: 900, dpr: 1, headed: !!args.headed });
  const { S, base, close } = ctx;

  const url = `${base}/tools/signbake.html?size=${SIZE}&seed=${SEED}${args.korean ? '&korean=1' : ''}`;
  await S('Page.navigate', { url });
  await waitFor(S, 'window.__signReady', 90000);

  const err = (await S('Runtime.evaluate', { expression: 'window.__signError || ""', returnByValue: true })).result.value;
  if (err) throw new Error(err);

  const meta = await evalJSON(S, 'window.__signbake.table');
  const info = await evalJSON(S,
    '({verify:window.__signbake.verify,coverage:window.__signbake.coverage,pack:window.__signbake.pack,'
    + 'log:window.__signbake.log,fonts:window.__signbake.fonts})');
  const raw = await readPng(S);
  await close();

  for (const l of info.log) console.log('  ' + l);
  console.log(`  fonts: ${Object.entries(info.fonts).map(([k, v]) => `${k}=${v}`).join(' ')}`);

  if (info.verify.nonGrey || info.verify.nonOpaque) {
    throw new Error(`the canvas is not greyscale/opaque (${info.verify.nonGrey} non-grey, `
      + `${info.verify.nonOpaque} non-opaque px) — oxipng cannot reduce it to colour type 0`);
  }
  if (info.verify.ringBad.length) throw new Error(`ink found in the padding ring of `
    + `${info.verify.ringBad.length} regions: ${JSON.stringify(info.verify.ringBad.slice(0, 5))}`);
  if (info.verify.inkBad.length) throw new Error(`${info.verify.inkBad.length} regions are near-empty: `
    + JSON.stringify(info.verify.inkBad.slice(0, 5)));

  const tableBad = auditTable(meta);
  if (tableBad.length) throw new Error(`region table audit failed:\n    ` + tableBad.slice(0, 10).join('\n    '));

  mkdirSync(resolve(OUT, 'assets'), { recursive: true });
  mkdirSync(resolve(OUT, 'data'), { recursive: true });
  const png = resolve(OUT, 'assets/signs.png');

  const pre = ihdr(raw);
  writeFileSync(png, raw);
  execFileSync('oxipng', ['-o4', '--strip', 'all', png], { stdio: 'pipe' });

  const outBuf = readFileSync(png);
  const hdr = ihdr(outBuf);
  console.log(`\n  ${ox}: ${(raw.length / 1024).toFixed(0)} KB ${COLOUR_TYPE[pre.colourType]} `
    + `→ ${(outBuf.length / 1024).toFixed(1)} KB ${COLOUR_TYPE[hdr.colourType]} ${hdr.bitDepth}-bit`);

  if (hdr.w !== SIZE || hdr.h !== SIZE) throw new Error(`IHDR says ${hdr.w}x${hdr.h}, expected ${SIZE}x${SIZE}`);
  if (hdr.colourType !== 0) {
    throw new Error(`IHDR byte 25 is ${hdr.colourType} (${COLOUR_TYPE[hdr.colourType]}), expected 0 (greyscale). `
      + `oxipng did not reduce the colour type — something coloured or translucent got into the sheet.`);
  }
  if (hdr.bitDepth > 8) throw new Error(`IHDR bit depth ${hdr.bitDepth}, expected <= 8`);
  if (outBuf.length > BUDGET) {
    rmSync(png, { force: true });
    throw new Error(`${(outBuf.length / 1024).toFixed(1)} KB exceeds the ${BUDGET / 1024} KB budget (§3.5.1). `
      + `Drop the sheet to 1536²:  node tools/bake_signs.mjs --size=1536`);
  }

  const json = JSON.stringify(meta, null, 2) + '\n';
  writeFileSync(resolve(OUT, 'data/signs.json'), json);

  const c = meta.counts;
  console.log(`  ${hdr.w}x${hdr.h} greyscale, ${outBuf.length} bytes (${(outBuf.length / BUDGET * 100).toFixed(0)}% of budget)`);
  console.log(`  ${c.total} regions — ` + Object.entries(c.byClass).map(([k, v]) => `${k} ${v}`).join(', '));
  console.log(`  real-script: ${info.coverage.jaSurvived}/12 Japanese survived the coverage check`
    + (info.coverage.shipJa ? '' : ' — SET DROPPED, shipping English + abstract only'));
  console.log(`  mip clamp ${meta.mipLevels} levels (smallest region ${meta.minRegionPx}px, ${meta.padPx}px padding)`);
  console.log(`  sha256 png  ${sha(outBuf)}`);
  console.log(`  sha256 json ${sha(json)}`);
  console.log(`→ ${png}\n→ ${resolve(OUT, 'data/signs.json')}`);
}

main().catch(e => { console.error('✗ ' + e.message); cleanup(); process.exit(1); });
