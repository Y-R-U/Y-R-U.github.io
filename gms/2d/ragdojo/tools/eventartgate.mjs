#!/usr/bin/env node
/**
 * Smoke gate for the event-art review tool (tools/eventart/): the list, a REAL regeneration
 * through local Flux (mflux-queue :7867, which queues behind anyone else's work), and approval
 * into a temp dir — the picture into the SERVER-ONLY folder (never the public one), a manifest
 * with choices only, the answer in the server-only answers file, which the real arena server
 * then reads and serves tiles from.
 *
 *   node tools/eventartgate.mjs [--seed <dir>] [--no-flux]   (EVENTART_TEST_PORT, default 9510)
 *   node tools/eventartgate.mjs --falsify                    6 broken copies of the tool must go red
 */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, statSync, readdirSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { ROOT } from './cdp.mjs';

const P0 = +(process.env.EVENTART_TEST_PORT || 9510);
const log = (m) => process.stderr.write(m + '\n');
const args = process.argv.slice(2);
const seedArg = args.includes('--seed') ? args[args.indexOf('--seed') + 1] : null;

function syntheticSeed(dir) {
  mkdirSync(dir, { recursive: true });
  const meta = [];
  for (const theme of ['heroic', 'halloween', 'dojo']) {
    const file = `${theme}_1.png`;
    execFileSync('sips', ['-s', 'format', 'png', '-z', '640', '1024', join(ROOT, '../../../assets/screenshots/ragdojo.jpg'), '--out', join(dir, file)], { stdio: 'ignore' });
    meta.push({ theme, n: 1, seed: 7, file, prompt: `a ${theme} test picture, ink on paper` });
  }
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta));
  // Answers come with the seed, never from the game's code. Test words only.
  writeFileSync(join(dir, 'themes.json'), JSON.stringify(Object.fromEntries(['heroic', 'halloween', 'dojo'].map((t, i) =>
    [t, { answer: `A TESTWORD ${'ABC'[i]}${t.toUpperCase()}`, decoys: ['A KITE', 'A CANOE', 'A TEAPOT'] }]))));
}

async function run(toolDir, { flux = true, label = '' } = {}) {
  let pass = 0, fail = 0;
  const ok = (n, c, x = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${label}${n}${x && !c ? '  ' + x : ''}`); };
  const tmp = mkdtempSync(join(tmpdir(), 'eventart-'));
  const DATA = join(tmp, 'data'), OUT = join(tmp, 'out'), ART = join(DATA, 'approved');
  const seed = seedArg || join(tmp, 'seed');
  if (!seedArg) syntheticSeed(seed);
  const proc = spawn('node', [join(toolDir, 'server.mjs'), '--seed', seed], {
    env: { ...process.env, EVENTART_PORT: String(P0), EVENTART_HOST: '127.0.0.1', EVENTART_DATA: DATA, EVENTART_OUT: OUT }, stdio: ['ignore', 'pipe', 'inherit'] });
  let printed = '';
  proc.stdout.on('data', (d) => { printed += d; });
  const base = `http://127.0.0.1:${P0}`;
  let arena = null;
  try {
    for (let i = 0; i < 60 && !/\?k=/.test(printed); i++) await sleep(100);
    const key = (printed.match(/\?k=([\w-]+)/) || [])[1];
    ok('prints a LAN link carrying the access key', !!key, printed);
    const api = async (path, body, k = key) => {
      const r = await fetch(`${base}${path}?k=${k}`, body ? { method: 'POST', body: JSON.stringify(body) } : {});
      return { status: r.status, j: await r.json().catch(() => ({})) };
    };
    ok('the page itself loads', (await fetch(base + '/')).ok);
    ok('the API refuses a request without the key', (await api('/api/state', null, 'nope')).status === 403);
    ok('POSTs refuse without the key too', (await api('/api/approve', { id: 'heroic_1' }, '')).status === 403);
    let st = (await api('/api/state')).j;
    const n0 = st.candidates?.length || 0;
    ok('lists the seeded candidates', n0 >= 3, `${n0}`);
    ok('lists upcoming reveal events', st.events?.filter((e) => e.id.startsWith('reveal-week:')).length === 4 && st.events.some((e) => e.id.startsWith('halloween:')), JSON.stringify(st.events?.map((e) => e.id)));
    if (!seedArg) ok('every seeded theme has its answer and three decoys from the seed', Object.values(st.themes).every((t) => /^A TESTWORD/.test(t.answer) && t.decoys.length === 3));
    else { for (const t of Object.keys(st.themes)) await api('/api/theme', { theme: t, answer: `A TESTWORD ${t.toUpperCase()}`, decoys: ['A KITE', 'A CANOE', 'A TEAPOT'] }); st = (await api('/api/state')).j; }
    ok('nothing is approved to begin with', st.candidates.every((c) => c.status !== 'approved') && !existsSync(join(OUT, 'manifest.json')));
    if (seedArg) ok('the recommended picks are flagged', ['heroic_2', 'halloween_1', 'dojo_2'].every((id) => st.candidates.find((c) => c.id === id)?.recommended));

    // Edit a prompt, reject and un-reject.
    const first = st.candidates[0];
    await api('/api/prompt', { id: first.id, prompt: first.prompt + ', bolder lines' });
    ok('EDIT PROMPT is stored', (await api('/api/state')).j.candidates[0].prompt.endsWith('bolder lines'));
    await api('/api/reject', { id: first.id });
    ok('REJECT marks it', (await api('/api/state')).j.candidates[0].status === 'rejected');
    await api('/api/reject', { id: first.id });

    // A real regeneration through the Flux queue.
    if (flux) {
      const r = await api('/api/regenerate', { id: first.id });
      const nc = r.j.candidate;
      ok('REGENERATE queues a new candidate with the same prompt and a new seed', nc && nc.prompt === first.prompt + ', bolder lines' && nc.seed !== first.seed, JSON.stringify(nc));
      let c = null;
      const until = Date.now() + 15 * 60e3;
      while (Date.now() < until) {
        c = (await api('/api/state')).j.candidates.find((x) => x.id === nc.id);
        if (c.status === 'pending' || c.status === 'failed') break;
        await sleep(3000);
      }
      ok('local Flux produced the image', c?.status === 'pending', JSON.stringify(c));
      const png = join(DATA, 'candidates', nc.file);
      const dims = existsSync(png) ? execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', png]).toString() : '';
      ok('it is a 1024x640 image', /pixelWidth: 1024/.test(dims) && /pixelHeight: 640/.test(dims), dims);
      ok('the regenerated image is served to the page', (await fetch(`${base}/img/${nc.file}?k=${key}`)).headers.get('content-type') === 'image/png');
    }

    // Approve into the temp dir.
    st = (await api('/api/state')).j;
    const theme = st.candidates[0].theme, t = st.themes[theme];
    const pick = st.candidates.find((c) => c.theme === theme && c.status === 'pending');
    const ap = await api('/api/approve', { id: pick.id });
    ok('APPROVE succeeds', ap.status === 200, JSON.stringify(ap.j));
    const slug = t.event.replace(/[^A-Za-z0-9-]+/g, '-');
    const jpg = join(ART, slug + '.jpg');
    ok('writes the picture to the server-only folder, named after the event', existsSync(jpg));
    ok('nothing but manifest.json goes to the public folder', readdirSync(OUT).join() === 'manifest.json', readdirSync(OUT).join());
    const src = statSync(join(DATA, 'candidates', pick.file)).size;
    ok('it is a real jpeg, much smaller than the PNG', existsSync(jpg) && readFileSync(jpg).subarray(0, 3).toString('hex') === 'ffd8ff' && statSync(jpg).size < src / 2, `${src} -> ${existsSync(jpg) && statSync(jpg).size}`);
    const man = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
    const entry = man.pictures?.[t.event];
    ok('the manifest lists the picture with four choices', entry?.choices?.length === 4 && entry.choices.includes(t.answer));
    const manText = readFileSync(join(OUT, 'manifest.json'), 'utf8');
    ok('the manifest names no image and does not say which choice is right', !/answer|webp|jpg/i.test(manText) && Object.keys(entry || {}).sort().join() === 'choices,h,w', JSON.stringify(entry));
    ok('the file names give nothing away', readdirSync(ART).every((f) => !new RegExp(theme, 'i').test(f) && !t.answer.split(' ').some((w) => w.length > 3 && f.toUpperCase().includes(w))), readdirSync(ART).join());
    const answers = JSON.parse(readFileSync(join(DATA, 'answers.json'), 'utf8'));
    ok('the answer is in the server-only answers file', answers.answers?.[t.event] === t.answer);

    // The arena server reads that answers file: the event now reports approved art.
    const bin = join(tmp, 'arena');
    execFileSync('go', ['build', '-o', bin, '.'], { cwd: join(ROOT, 'server'), stdio: 'inherit' });
    arena = spawn(bin, [], { env: { ...process.env, ARENA_ADDR: `127.0.0.1:${P0 + 1}`, ARENA_DB: join(tmp, 'a.db'), ARENA_ICE_URL: 'off', ARENA_ALLOWANCE_URL: 'off',
      ARENA_ENTITLEMENT_URL: 'off', ARENA_DEV_AUTH: '1', ARENA_EVENT_ANSWERS: join(DATA, 'answers.json') }, stdio: 'ignore' });
    // No ARENA_EVENT_ART: the server finds the tool's approved/ folder next to the answers (LAN).
    const ab = `http://127.0.0.1:${P0 + 1}/gms/2d/ragdojo/arena`;
    for (let i = 0; i < 80; i++) { try { if ((await fetch(ab + '/health')).ok) break; } catch {} await sleep(100); }
    const sync = await (await fetch(ab + '/events/sync', { method: 'POST', headers: { Authorization: 'Bearer dev:artcheck' }, body: JSON.stringify({ event: t.event }) })).json();
    ok('the arena server sees the approved art (answer file format matches)', sync.art === true, JSON.stringify(sync));
    const art = (q) => fetch(`${ab}/events/art/${q}`, { headers: { Authorization: 'Bearer dev:artcheck' } }).then((r) => r.status);
    ok('the server refuses a tile for an unopened square', await art(`tile?event=${encodeURIComponent(t.event)}&cell=0`) === 403);
    ok('and the whole picture', await art(`full?event=${encodeURIComponent(t.event)}`) === 403);

    // The name box: saved on the approved picture, written into its manifest entry, never the answer.
    const box = { x: 0.6, y: 0.2, w: 0.2, h: 0.45, rot: 2, text: '{NAME}', layout: 'stack' };
    ok('a name box is accepted', (await api('/api/overlay', { id: pick.id, overlay: box })).status === 200);
    const man3 = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
    ok('the approved picture\'s manifest entry carries the box', JSON.stringify(man3.pictures[t.event].overlay) === JSON.stringify(box), JSON.stringify(man3.pictures[t.event]));
    ok('the box does not change the choices', JSON.stringify(man3.pictures[t.event].choices) === JSON.stringify(entry.choices));
    const word = t.answer.split(' ').find((w) => w.length > 3);
    ok('a box that would write the answer is refused', (await api('/api/overlay', { id: pick.id, overlay: { ...box, text: `{NAME} ${word}` } })).status === 400);
    ok('a box outside the picture is refused', (await api('/api/overlay', { id: pick.id, overlay: { ...box, x: 0.9, w: 0.3 } })).status === 400);
    ok('the page can load the game\'s overlay drawing', /export function drawOverlay/.test(await (await fetch(base + '/game/js/events/overlay.js')).text()) && (await fetch(base + '/game/js/ink.js')).ok);
    await api('/api/overlay', { id: pick.id, overlay: null });
    ok('REMOVE takes the box off the manifest', !JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8')).pictures[t.event].overlay);

    // A second approval for the same event replaces the first; revoking clears everything.
    const other = (await api('/api/state')).j.candidates.find((c) => c.theme === theme && c.status === 'pending');
    if (other) {
      await api('/api/approve', { id: other.id });
      const s2 = (await api('/api/state')).j;
      ok('one approved picture per event', s2.candidates.filter((c) => c.status === 'approved' && s2.themes[c.theme].event === t.event).length === 1);
    }
    const appr = (await api('/api/state')).j.candidates.find((c) => c.status === 'approved');
    await api('/api/revoke', { id: appr.id });
    const man2 = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
    ok('UN-APPROVE removes the files, the manifest entry and the answer', !existsSync(jpg) && !man2.pictures[t.event] && !JSON.parse(readFileSync(join(DATA, 'answers.json'), 'utf8')).answers[t.event]);
  } catch (e) { ok('no exception', false, e.stack); }
  finally { proc.kill('SIGKILL'); arena?.kill('SIGKILL'); rmSync(tmp, { recursive: true, force: true }); }
  return { pass, fail };
}

const MUTANTS = [
  ['the manifest carries the answer', 'man.pictures[ev] = { w: 1024,', 'man.pictures[ev] = { answer, w: 1024,'],
  ['the picture goes into the public folder', "join(ART, name + '.jpg')]", "join(OUT, name + '.jpg')]"],
  ['the manifest names the image', 'man.pictures[ev] = { w: 1024,', "man.pictures[ev] = { img: name + '.jpg', w: 1024,"],
  ['approve forgets the answers file', 'ans.answers[ev] = answer;', ''],
  ['no access key check', 'if (key !== KEY) return', 'if (false) return'],
  ['a name box may spell the answer', "if (words.some((w) => ov.text.toUpperCase().includes(w))) throw", "if (false) throw"],
];
if (args.includes('--falsify')) {
  let red = 0;
  for (const [what, from, to] of MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'eventartmut-'));
    const tool = join(dir, 'tools/eventart');
    mkdirSync(tool, { recursive: true });
    cpSync(join(ROOT, 'tools/eventart'), tool, { recursive: true });
    cpSync(join(ROOT, 'js'), join(dir, 'js'), { recursive: true });
    const src = readFileSync(join(tool, 'server.mjs'), 'utf8');
    if (!src.includes(from)) { log(`MUTANT MISSED (source moved): ${what}`); continue; }
    writeFileSync(join(tool, 'server.mjs'), src.replace(from, to));
    log(`\n── mutant: ${what}`);
    const r = await run(tool, { flux: false, label: '[mut] ' });
    rmSync(dir, { recursive: true, force: true });
    log(r.fail ? `RED   ${what}` : `GREEN ${what} — not noticed`);
    if (r.fail) red++;
  }
  log(`\nfalsify: ${red}/${MUTANTS.length} mutants caught`);
  process.exit(red === MUTANTS.length ? 0 : 1);
} else {
  const r = await run(join(ROOT, 'tools/eventart'), { flux: !args.includes('--no-flux') });
  log(`\n${r.pass} passed, ${r.fail} failed`);
  process.exit(r.fail ? 1 : 0);
}
