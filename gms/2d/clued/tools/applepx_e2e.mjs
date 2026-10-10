#!/usr/bin/env node
// Apple proxy e2e (docs/notes/APPLEPROXY.md): a solo 6-question music round in headless Chrome against a LOCAL
// server with debug logging on. --mode blocked: Apple hosts unreachable → every clip, lookup and artwork via the
// proxy, render → audio start < 3 s after the first question. --mode direct: nothing blocked → direct path only.
// Both modes also check the `probe` rows.
//   (cd server && go build -o /tmp/cluedpx .) && CLUED_DATA=/tmp/pxdata /tmp/cluedpx debuglog on
//   CLUED_ADDR=127.0.0.1:8099 CLUED_DATA=/tmp/pxdata /tmp/cluedpx &
//   B='MAP audio-ssl.itunes.apple.com 127.0.0.1:1, MAP itunes.apple.com 127.0.0.1:1, MAP is1-ssl.mzstatic.com 127.0.0.1:1, …is5'
//   ~/.claude/bin/cdp start --port 9530 -- --autoplay-policy=no-user-gesture-required "--host-resolver-rules=$B"
//   node tools/applepx_e2e.mjs --mode blocked --cli /tmp/cluedpx --data /tmp/pxdata [--port 9530] [--api …] [--site …]
import { connect } from './au_cdp.mjs';
import { execFileSync } from 'node:child_process';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +arg('--port', 9530), API = arg('--api', 'http://127.0.0.1:8099/gms/2d/clued/api'), SITE = arg('--site', 'http://localhost:8888/gms/2d/clued/');
const CLI = arg('--cli', ''), DATA = arg('--data', ''), MODE = arg('--mode', 'blocked'), N = +arg('--n', 6);
const BLOCKED = MODE !== 'direct';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); };
const cli = (...a) => execFileSync(CLI, ['debuglog', ...a], { env: { ...process.env, CLUED_DATA: DATA }, maxBuffer: 64 << 20 }).toString();
const rows = (q = '') => { const out = cli('dump', '--since', '1h', '--json', '--limit', '20000', ...q.split(' ').filter(Boolean)); return out.trim() ? out.trim().split('\n').map((l) => JSON.parse(l)) : []; };
if (!CLI || !DATA) { console.error('need --cli and --data'); process.exit(2); }

console.log(`mode ${MODE}`);
cli('on');
await sleep(5500);
const c = await connect(PORT);
// a fresh tab session: the "Apple is broken" memory lives in sessionStorage
await c.goto('about:blank');
await c.goto(`${SITE}?noauth=1&api=${encodeURIComponent(API)}`, 'window.__cluedReady === true', 30000);
await c.evaluate('sessionStorage.removeItem("clued.appleDirect"); true');
await c.goto(`${SITE}?noauth=1&api=${encodeURIComponent(API)}`, 'window.__cluedReady === true', 30000);   // reload so applenet starts clean
ok(await c.evaluate('!window.__cluedAppleNet.broken'), 'fresh session: direct not yet marked broken');
let on = false;
for (let i = 0; i < 20 && !on; i++) { await sleep(250); on = await c.evaluate('!!window.__cluedDbg?.on'); }
ok(on, 'debug logging on');
const device = await c.evaluate('localStorage.getItem("clued.dbg.dev")'), session = await c.evaluate('window.__cluedDbg.session');

const t0 = Date.now();
await c.evaluate(`window.__clued.start({ structure: 'quick', format: 'listen', packs: ['hits-1980s', 'hits-1990s', 'hits-2000s'], count: ${N}, timer: false, opts: { clip: 3, art: 'blur', ask: 'title' } }); true`);
const qs = [];
for (let n = 0; n < N; n++) {
  let rendered = false;
  for (let t = 0; t < 240 && !rendered; t++) { await sleep(250); rendered = await c.evaluate(`window.__clued.state().run?.i === ${n} && !!document.querySelector('.au-listen')`); }
  if (n === 0) qs.prepMs = Date.now() - t0;
  let status = '';
  for (let t = 0; t < 60; t++) { await sleep(250); status = await c.evaluate(`document.querySelector('.au-status')?.textContent || ''`); if (/Pick your answer/.test(status)) break; }
  const cover = await c.evaluate(`(() => { const i = document.querySelector('.au-cover'); return i ? { src: i.currentSrc || i.src, w: i.naturalWidth } : null; })()`);
  await c.evaluate(`window.__clued.answer('correct'); true`);
  await sleep(900);
  const art = await c.evaluate(`(async () => { const i = document.querySelector('.au-art'); if (!i) return null; for (let k = 0; k < 40 && !i.naturalWidth; k++) await new Promise(r => setTimeout(r, 100)); return { src: i.currentSrc || i.src, w: i.naturalWidth }; })()`);
  let keep = null;
  if (n === N - 1) {   // "Keep listening" streams the whole preview through <audio>
    keep = await c.evaluate(`(async () => { const b = document.querySelector('.au-keep'); if (!b) return null;
      const seen = new Set(), P = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { seen.add(this); return P.call(this); };
      b.click();
      for (let k = 0; k < 120; k++) { await new Promise(r => setTimeout(r, 100)); const a = [...seen].find(x => x.dataset.clued === '1' && !x.paused && x.currentTime > 0.3);
        if (a) { const r = { src: a.currentSrc, t: a.currentTime }; b.click(); return r; } } return { none: true, label: b.textContent }; })()`, 30000);
  }
  qs.push({ n, rendered, status, cover, art, keep });
  await c.evaluate(`document.querySelector('.reveal .next')?.click(); true`);
}
await sleep(4500);
console.log(`  (prepare → first question ${qs.prepMs} ms)`);

const isPx = (u) => /\/api\/preview\?u=/.test(u || '');
for (const q of qs) {
  ok(q.rendered && /Pick your answer/.test(q.status), `Q${q.n + 1}: clip played to the end ("${q.status}")`);
  ok(q.cover && q.cover.w > 0 && isPx(q.cover.src) === BLOCKED, `Q${q.n + 1}: blurred artwork loaded ${BLOCKED ? 'via the proxy' : 'directly'} (w=${q.cover?.w})`);
  ok(q.art && q.art.w > 0 && isPx(q.art.src) === BLOCKED, `Q${q.n + 1}: reveal artwork loaded ${BLOCKED ? 'via the proxy' : 'directly'}`);
}
const keep = qs.at(-1).keep;
ok(keep && !keep.none && isPx(keep.src) === BLOCKED, `Keep listening streamed ${BLOCKED ? 'via the proxy' : 'directly'} (${JSON.stringify(keep)})`);

const all = rows(`--device ${device} --session ${session}`);
const tag = (t, m) => all.filter((r) => r.tag === t && (!m || r.msg === m));
const fetches = tag('clip', 'fetch.ok');
ok(fetches.length >= N, `${fetches.length} clip fetches`);
ok(fetches.every((r) => r.data.via === (BLOCKED ? 'proxy' : 'direct')), `every clip came ${BLOCKED ? 'through the proxy' : 'directly'}: ${[...new Set(fetches.map((r) => r.data.via))]}`);
const net = tag('applenet');
const msgs = {};
for (const r of net) msgs[r.msg] = (msgs[r.msg] || 0) + 1;
console.log('  applenet:', JSON.stringify(msgs));
if (BLOCKED) {
  ok(tag('applenet', 'broken').length === 1, 'marked broken exactly once');
  ok(tag('applenet', 'direct.ok').length === 0, 'no direct success while blocked');
  ok(net.filter((r) => /^direct\.|^head\.direct/.test(r.msg)).length <= N + 2, `direct attempts stop after the first failure (${net.filter((r) => /^direct\.|^head\.direct/.test(r.msg)).length})`);
  ok(net.filter((r) => /^proxy\.ok/.test(r.msg)).length >= N, 'proxy.ok logged for every clip');
} else {
  ok(tag('applenet', 'broken').length === 0 && tag('applenet', 'direct.ok').length >= N, 'direct path only, never broken');
  ok(net.every((r) => !/^proxy/.test(r.msg)), 'proxy never used');
}
// question render → clip start, from the client's performance clock
const ev = all.filter((r) => (r.tag === 'listen' && r.msg === 'render') || (r.tag === 'clip' && r.msg === 'start')).sort((a, b) => a.id - b.id);
const lat = [];
for (let i = 0; i < ev.length; i++) if (ev[i].msg === 'render') { const s = ev.slice(i + 1).find((r) => r.msg === 'start'); if (s) lat.push(Math.round(s.perf - ev[i].perf)); }
console.log('  render → audio start (ms):', lat.join(', '));
ok(lat.length >= N, `${lat.length} clip starts timed`);
ok(lat.slice(1).every((x) => x < 3000), `questions 2–${N}: audio within 3 s of render (max ${Math.max(...lat.slice(1))} ms)`);

// probe
const pr = tag('probe');
const sum = pr.find((r) => r.msg === 'summary');
ok(pr.some((r) => r.msg === 'start' && 'onLine' in r.data && 'ua' in r.data && 'hasStorageAccess' in r.data), 'probe start logs onLine, UA, connection, storage-access');
ok(!!sum, 'probe summary logged');
console.log('  probe:', JSON.stringify(sum?.data));
const P = Object.fromEntries(pr.filter((r) => r.msg !== 'start' && r.msg !== 'summary').map((r) => [r.msg, r.data]));
const names = ['lookup.cors', 'lookup.jsonp', 'preview.cors.range', 'preview.audio', 'artwork.img', 'proxy.preview', 'proxy.lookup', 'proxy.artwork', 'control.wikimedia'];
ok(names.every((k) => P[k] && typeof P[k].ms === 'number'), `all ${names.length} probe results logged with ms`);
ok(P['proxy.preview']?.ok && P['proxy.preview'].status === 206 && P['proxy.lookup']?.ok && P['proxy.artwork']?.ok, 'proxy probes ok');
ok(P['control.wikimedia']?.ok, 'Wikimedia control ok');
const appleOk = ['lookup.cors', 'lookup.jsonp', 'preview.cors.range', 'preview.audio', 'artwork.img'].map((k) => P[k]?.ok);
ok(BLOCKED ? appleOk.every((x) => !x) : appleOk.every((x) => x), `direct Apple probes all ${BLOCKED ? 'fail' : 'pass'}: ${appleOk}`);
ok(pr.filter((r) => r.msg === 'start').length === 1, 'one probe for the round');

cli('off');
c.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
