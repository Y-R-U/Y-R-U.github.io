#!/usr/bin/env node
/**
 * Capture dev/gfx.html scenes and the game itself.
 *
 * The sheet canvas is ~1800x1140, and piping a PNG that size back through
 * Runtime.evaluate as a base64 string wedges CDP with no error. The page POSTs
 * the blob to this script's own server instead — no size limit, and it is the
 * same static server the page was loaded from.
 */
import { CDP, CHROME, ROOT } from './cdp.mjs';
import { join, dirname } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] === undefined ? true : m[2]] : [a, true];
}));
const SHOTS = join(ROOT, args.out || 'shots');
mkdirSync(SHOTS, { recursive: true });

const MIME = { '.html': 'text/html;charset=utf-8', '.js': 'text/javascript;charset=utf-8',
  '.css': 'text/css;charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml' };

export async function serveWithUpload(root = ROOT, outDir = SHOTS) {
  const saved = [];
  const srv = createServer(async (req, res) => {
    const [path, qs] = req.url.split('?');
    if (req.method === 'POST' && path === '/__save') {
      const name = new URLSearchParams(qs).get('f') || 'out.png';
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      const file = join(outDir, name.replace(/[^\w.\-]/g, '_'));
      writeFileSync(file, Buffer.concat(chunks));
      saved.push(file);
      res.writeHead(200).end('ok');
      return;
    }
    try {
      let p = decodeURIComponent(path);
      if (p.endsWith('/')) p += 'index.html';
      const f = join(root, p);
      if (!f.startsWith(root)) { res.writeHead(403).end(); return; }
      const st = await stat(f).catch(() => null);
      if (!st?.isFile()) { res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[f.slice(f.lastIndexOf('.'))] || 'application/octet-stream',
        'cache-control': 'no-store' });
      res.end(await readFile(f));
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}`, saved, close: () => srv.close() };
}

/** Ask the page to render itself to a PNG and POST it back. */
export async function grab(c, name, selector = null) {
  const n = await c.eval(`new Promise(res => requestAnimationFrame(() => requestAnimationFrame(async () => {
    const sel = ${JSON.stringify(selector)};
    const list = sel ? [...document.querySelectorAll(sel)]
      : [...document.querySelectorAll('canvas')].filter(c => {
          const st = getComputedStyle(c);
          return c.width && c.height && st.display !== 'none' && st.visibility !== 'hidden';
        });
    if (!list.length) return res(0);
    let src = list[0];
    if (list.length > 1) {
      const w = Math.max(...list.map(c => c.width)), h = Math.max(...list.map(c => c.height));
      src = document.createElement('canvas'); src.width = w; src.height = h;
      const g = src.getContext('2d');
      for (const c of list) g.drawImage(c, 0, 0, w, h);
    }
    const blob = await new Promise(r => src.toBlob(r, 'image/png'));
    await fetch('/__save?f=' + encodeURIComponent(${JSON.stringify(name)}), { method: 'POST', body: blob });
    res(blob.size);
  })))`);
  return n;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const scenes = (args.scene || 'stance,ranks,ragdoll,walk').split(',');
  const srv = await serveWithUpload();
  const c = await CDP.launch();
  const log = (m) => process.stderr.write(m + '\n');
  try {
    for (const s of scenes) {
      await c.viewport(+(args.w || 1400), +(args.h || 900), 1, false);
      await c.goto(`${srv.base}/dev/gfx.html?scene=${s}${args.armed ? '&armed=1' : ''}`);
      const ok = await c.waitFor('window.__ready', 20000);
      await c.frames(2);
      const size = await grab(c, `gfx_${s}.png`);
      log(`${ok ? 'ok  ' : 'TIMEOUT '} ${s}  ${(size / 1024).toFixed(0)} KB`);
    }
    if (c.errors.length) log('\nERRORS:\n' + c.errors.slice(0, 10).join('\n'));
  } finally { c.close(); srv.close(); }
  process.exit(0);
}
