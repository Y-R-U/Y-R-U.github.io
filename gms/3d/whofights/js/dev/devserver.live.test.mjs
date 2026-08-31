// node js/dev/devserver.live.test.mjs
// The GPU slot and the routes that drive it: the wall-clock kill in pump(), cancel, pruning, and
// the one invariant the queue exists for — a flux job must not start while ACE-Step still holds
// VRAM. Driven over real sockets, against fake backends, so nothing here touches the GPU.
//
// Self-running rather than harness-registered: it has to set WF_* before devserver.mjs is imported.

import http from 'node:http';

process.env.WF_JOB_MAX_MIN = String(0.2 / 60);
process.env.WF_VRAM_POLL_MS = '40';

let pass = 0, fail = 0;
const ok = (cond, what) => { if (cond) pass++; else { fail++; console.log('  FAIL', what); } };
const eq = (got, want, what) => ok(JSON.stringify(got) === JSON.stringify(want), `${what} — got ${JSON.stringify(got)}`);

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(cond, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (cond()) return true; await sleep(10); }
  return false;
}

function serve(handler) {
  const s = http.createServer(handler);
  return new Promise(res => s.listen(0, '127.0.0.1', () => res({ s, port: s.address().port })));
}
const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

// ACE-Step holds the GPU and answers 409 to the first two unloads, the way it does mid-job.
const ace = { loaded: true, unloads: 0 };
const aceSrv = await serve((req, res) => {
  if (req.url === '/admin/unload') {
    ace.unloads++;
    if (ace.unloads <= 2) return json(res, 409, { error: 'a task is running' });
    ace.loaded = false;
    return json(res, 200, { ok: true });
  }
  return json(res, 200, { loaded: ace.loaded });
});
const flux = { warm: false, unloads: 0 };
const fluxSrv = await serve((req, res) => {
  if (req.url === '/admin/unload') { flux.unloads++; flux.warm = false; return json(res, 200, { ok: true }); }
  return json(res, 200, { worker_warm: flux.warm, queue_depth: 0 });
});
const ltx = { warm: false };
const ltxSrv = await serve((_, res) => json(res, 200, { worker_warm: ltx.warm }));

process.env.WF_ACE = `http://127.0.0.1:${aceSrv.port}`;
process.env.WF_FLUX = `http://127.0.0.1:${fluxSrv.port}`;
process.env.WF_LTX = `http://127.0.0.1:${ltxSrv.port}`;

const { enqueue, cancelJob, prune, jobs, queueSummary, freeVRAM, server, ROOT } = await import('../../tools/devserver.mjs');

await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
const post = (p, body) => fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}) });
const getJSON = async p => (await fetch(`${BASE}${p}`)).json();
const rawStatus = p => new Promise(res => http.request({ host: '127.0.0.1', port: server.address().port, path: p },
  r => { r.resume(); res(r.statusCode); }).end());

const forever = () => new Promise(() => {});
const notes = [];
const note = n => notes.push(n);

// ── the whole point of the queue ────────────────────────────────────────────
{
  const t0 = Date.now();
  await freeVRAM('flux', note);
  ok(ace.loaded === false, 'freeVRAM must not return while ACE-Step is still resident');
  ok(ace.unloads >= 3, `the 409 was retried, not swallowed (${ace.unloads} unloads)`);
  ok(Date.now() - t0 >= 40, 'it actually waited');
}

{
  ltx.warm = true;
  setTimeout(() => { ltx.warm = false; }, 120);
  const t0 = Date.now();
  await freeVRAM('music', note);
  ok(Date.now() - t0 >= 100, 'a warm LTX is still waited for');
  eq(flux.unloads, 1, 'the music direction unloads mflux');
}

// ── the wall-clock kill ─────────────────────────────────────────────────────
{
  const stuck = enqueue('flux', forever, { out: 'art/stuck.png' });
  const after = enqueue('flux', async () => ({ url: 'art/after.png' }), { out: 'art/after.png' });
  ok(await until(() => after.state === 'done'), 'a job behind a stuck one still runs');
  eq(stuck.state, 'error', 'the stuck job is marked failed');
  ok(/abandoned/.test(stuck.error || ''), `and says why — got ${stuck.error}`);
  eq(queueSummary().running, null, 'the slot is free again');
}

// ── cancel ──────────────────────────────────────────────────────────────────
{
  const a = enqueue('flux', forever, { out: 'art/a.png' });
  const b = enqueue('music', forever, { out: 'audio/music/b.mp3' });
  ok(await until(() => a.state === 'running'), 'the first job started');
  eq(b.state, 'queued', 'the second waits');

  ok(cancelJob(b) === true, 'a queued job cancels');
  eq(b.error, 'cancelled', 'and says so');
  ok(cancelJob(a) === true, 'a running job cancels');
  ok(await until(() => a.state === 'error'), 'the running job settles');
  eq(a.error, 'cancelled', 'with the reason');
  ok(cancelJob(a) === false, 'a finished job cannot be cancelled again');
  await sleep(60);
  eq(queueSummary(), { running: null, waiting: 0 }, 'a cancelled queue drains');
}

// ── the map is not a leak ───────────────────────────────────────────────────
{
  for (let i = 0; i < 300; i++) jobs.set(`fake-${i}`, { id: `fake-${i}`, state: 'done' });
  prune();
  ok(jobs.size <= 200, `pruned to ${jobs.size}`);
  const live = { id: 'live', state: 'running' };
  jobs.set('live', live);
  for (let i = 0; i < 300; i++) jobs.set(`more-${i}`, { id: `more-${i}`, state: 'error' });
  prune();
  ok(jobs.get('live') === live, 'an unfinished job is never pruned');
}

// ── over the wire ───────────────────────────────────────────────────────────
{
  // A malformed escape used to throw out of the request handler and take the process with it.
  eq((await fetch(`${BASE}/%zz`)).status, 404, 'a malformed escape is a 404');
  // A traversal to a file that really is above the root. fetch() collapses dot segments itself, so
  // these go out on raw requests; the URL parser then collapses the unescaped ones, and the
  // resolved-root check is what stops the rest.
  eq(await rawStatus('/%2e%2e/forge/CLAUDE.md'), 404, 'an encoded traversal above the root');
  eq(await rawStatus('/../forge/CLAUDE.md'), 404, 'and a plain one');
  eq(await rawStatus('/lib/%2f%2e%2e%2f%2e%2e%2findex.html'), 404, 'and one through the /lib/ mount');
  eq((await getJSON('/api/status')).devserver, true, 'the server is still up afterwards');
}

{
  const fsp = await import('node:fs/promises');
  const path = await import('node:path');
  // Never build these with new URL(): the URL parser resolves %2e%2e to `..`, which is how an
  // earlier draft of this line deleted data/ instead of a junk directory inside it.
  const levels = path.join(ROOT, 'data/levels');
  await fsp.rm(path.join(levels, '%2e%2e'), { recursive: true, force: true });
  const bad = await post('/api/save', { path: 'levels/%2e%2e/%2e%2e/pwned.json', json: { x: 1 } });
  eq(bad.status, 400, 'an undecoded escape in a save path is refused');
  const good = await post('/api/save', { path: 'levels/__livetest.json', json: { x: 1 } });
  const gj = await good.json();
  eq(gj.path, 'data/levels/__livetest.json', 'an ordinary save still works');
  await fsp.rm(path.join(levels, '__livetest.json'), { force: true });

  const files = (await getJSON('/api/ls?dir=data/levels')).files.map(f => f.name);
  ok(!files.some(n => n.includes('%')), 'no junk directory was left behind');
}

{
  process.env.WF_JOB_MAX_MIN = '5';
  const blocker = enqueue('flux', forever, { out: 'art/block.png' });
  const r = await (await post('/api/music', { prompt: 'x', out: 'tavern.v2', seconds: 15 })).json();
  eq(r.out, 'audio/music/tavern.v2.mp3', 'a dotted name is echoed back resolved, not silently truncated');
  const c = await (await post(`/api/job/${r.job}/cancel`)).json();
  eq(c.ok, true, 'the cancel route answers');
  ok(await until(() => jobs.get(r.job).state === 'error'), 'and the job settles');
  eq((await getJSON(`/api/job/${r.job}`)).error, 'cancelled', '/api/job reports why');
  eq((await (await post(`/api/job/${r.job}/cancel`)).json()).ok, false, 'a finished job cannot be cancelled');
  eq((await (await post('/api/job/nope/cancel')).json()).error, 'no such job', 'an unknown id is a 404');
  eq((await fetch(`${BASE}/api/job/${r.job}/cancel`)).status, 405, 'cancel is POST only');
  cancelJob(blocker);
}

{
  const self = await post('/api/encode', { src: 'audio/music/tavern_01.mp3', profile: 'full', out: 'tavern_01' });
  eq(self.status, 400, 'a self-overwriting encode is refused at the door, not 20 minutes later');
  eq((await (await post('/api/encode', { profiles: true })).json()).profiles.length, 8, 'the profile table still answers');
}

for (const { s } of [aceSrv, fluxSrv, ltxSrv]) s.close();
server.close();
console.log(`devserver.live: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
