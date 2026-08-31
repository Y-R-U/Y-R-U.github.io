#!/usr/bin/env node
/** Every id in js/music.js must resolve to a file the page can actually decode. */
import { CDP } from './cdp.mjs';
import { serveWithUpload } from './shot.mjs';
const log = (m) => process.stderr.write(m + '\n');
const srv = await serveWithUpload();
const c = await CDP.launch();
let fail = 0;
try {
  await c.viewport(900, 420, 1, true);
  await c.goto(`${srv.base}/index.html?auto=1&dpr=1`);
  await c.waitFor('window.__state && window.__state.mode === "hub"', 20000);
  const res = await c.eval(`(async () => {
    const { MUSIC } = await import('/js/music.js');
    const out = [];
    for (const [id, src] of Object.entries(MUSIC)) {
      const r = await fetch(src, { method: 'GET' });
      const buf = r.ok ? await r.arrayBuffer() : null;
      let secs = 0, decoded = false;
      if (buf) {
        try {
          const AC = window.AudioContext || window.webkitAudioContext;
          const ac = new AC();
          const b = await ac.decodeAudioData(buf.slice(0));
          secs = Math.round(b.duration); decoded = true;
          ac.close();
        } catch (e) { decoded = false; }
      }
      out.push({ id, status: r.status, kb: buf ? Math.round(buf.byteLength / 1024) : 0, secs, decoded });
    }
    return out;
  })()`);
  for (const r of res) {
    const ok = r.status === 200 && r.decoded && r.secs > 20;
    if (!ok) fail++;
    log(`${ok ? 'PASS' : 'FAIL'}  ${r.id.padEnd(8)} HTTP${r.status} ${String(r.kb).padStart(5)}KB  ${r.secs}s  decoded=${r.decoded}`);
  }
  log(c.errors.length ? '\nERRORS:\n' + c.errors.slice(0, 6).join('\n') : '\nno console errors');
} finally { c.close(); srv.close(); }
log(fail ? `\n${fail} track(s) bad` : '\nall tracks load and decode');
process.exit(fail ? 1 : 0);
