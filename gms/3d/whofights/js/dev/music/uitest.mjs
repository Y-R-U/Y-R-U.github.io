#!/usr/bin/env node
// Drives the Sound & music tab and the in-game runtime in headless Chrome. Own launcher rather
// than cdp.mjs's, because music needs --autoplay-policy=no-user-gesture-required: without it the
// elements never actually play and the test proves only that the plan changed its mind.
//
//   node tools/devserver.mjs &
//   node js/dev/music/uitest.mjs /tmp/wf-music
//
// It never touches data/music.json: KINDS.music.file is redirected to data/__music.fixture.json
// in the page before the hub loads anything.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { attach, sleep } from '../cdp.mjs';

// A background tab gets no requestAnimationFrame, so the game loop stops and a hotspot never
// fires — which reads exactly like a broken trigger. Every page this drives is brought to front,
// and the ones it is finished with are closed.
async function front(p, port = 9345) {
  await p.send('Page.bringToFront');
  return p;
}
const closeTab = (id, port = 9345) => fetch(`http://127.0.0.1:${port}/json/close/${id}`).catch(() => {});

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);
const OUT = process.argv[2] || '/tmp/wf-music';
const BASE = process.env.WF_BASE || 'http://localhost:8796';
// The engine is another agent's; when it will not boot the tab is still testable over the hub's
// own fake game. WF_PAGE=selftest forces that.
const PAGE = process.env.WF_PAGE === 'selftest' ? '/js/dev/selftest.html' : '/index.html';
const FIXTURE = 'data/__music.fixture.json';

fs.mkdirSync(OUT, { recursive: true });

let pass = 0;
const fails = [];
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fails.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL ${name} ${detail}`); }
};

async function chrome(port) {
  const profile = `/tmp/wf-music-profile-${port}`;
  fs.rmSync(profile, { recursive: true, force: true });
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--window-size=1500,950', '--no-first-run', '--no-default-browser-check',
    '--use-angle=metal', '--use-gl=angle', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 120; i++) {
    try { await fetch(`http://127.0.0.1:${port}/json/version`); break; } catch { await sleep(150); }
  }
  return proc;
}

const proc = await chrome(9345);
try {
  await tabRun();
  await doorwayRun();
  await generateRun();
  if (process.env.WF_REAL_GEN) await realGenerateRun();
} finally {
  proc.kill();
}

console.log(`\n${pass}/${pass + fails.length} passed`);
for (const f of fails) console.error(`FAIL  ${f}`);
process.exit(fails.length ? 1 : 0);

// ---------------------------------------------------------------------------------------------

async function tabRun() {
  console.log('\nthe tab, over data/__music.fixture.json');
  // The fixture is checked in, so the run puts it back exactly as it found it. data/music.json is
  // never in play: KINDS.music.file is redirected in the page below.
  const before = fs.readFileSync(path.join(ROOT, FIXTURE), 'utf8');
  const restore = () => fs.writeFileSync(path.join(ROOT, FIXTURE), before);
  const p = await front(await attach(9345, `${BASE}${PAGE}`));
  try {
    check('page boots', await p.waitFor('!!window.__wf && window.__wf.ready', 40000),
      p.logs().filter(l => l.level === 'exception').map(l => l.text.split('\n')[0]).join(' | '));
    // Before the hub imports anything: point the music document at the fixture.
    await p.eval(`(async () => {
      const m = await import('${BASE}/js/dev/data.js');
      m.default.KINDS.music.file = () => '${FIXTURE}';
      window.__redirected = m.default.KINDS.music.file();
    })()`);
    check('music document redirected to the fixture', await p.eval('window.__redirected') === FIXTURE);

    check('DEV button is there', await p.waitFor('!!document.getElementById("wf-dev-btn")'));
    await p.click('#wf-dev-btn');
    check('hub opened', await p.waitFor('!!document.querySelector("#wf-dev:not(.hidden)")'));
    // openHub() paints the nav after it has imported every tab module, so the button arrives late.
    check('the music tab registered itself',
      await p.waitFor('[...document.querySelectorAll("#wf-dev nav button")].some(b => b.textContent.includes("Sound & music"))', 10000));
    await p.clickText('#wf-dev nav button', 'Sound & music');
    check('music tab mounted', await p.waitFor('!!document.querySelector("#wf-dev .mus-sub")'));
    await p.clickText('#wf-dev .mus-sub button', 'Library');

    await p.waitFor('document.querySelectorAll("#wf-dev .mus-list .mus-row").length > 10', 8000);
    const n = await p.eval('document.querySelectorAll("#wf-dev .mus-list .mus-row").length');
    check('library lists the fixture tracks', n > 10,
      `${n} rows — ${await p.eval('(document.querySelector("#wf-dev main")?.textContent || "").slice(0,200)')}`);
    await p.clickText('#wf-dev .mus-row button', 'why');
    await sleep(200);
    check('the prompt a track was made from is one click away',
      (await p.eval('document.querySelector("#wf-dev .mus-why pre")?.textContent || ""')).length > 10);
    await p.shot(`${OUT}/01-library.png`);

    await p.clickText('#wf-dev .mus-sub button', 'Sets');
    await p.waitFor('!!document.querySelector("#wf-dev .split")');
    await p.shot(`${OUT}/02-sets.png`);

    await p.clickText('#wf-dev .side button', '+ New set');
    await sleep(250);
    const setId = await p.eval(`(async () => { const d = (await import('${BASE}/js/dev/data.js')).default.get('music');
      return d.sets[d.sets.length - 1].id; })()`);
    check('a new set appears in the document', /^set_\d+$/.test(setId), setId);

    // One at a time: the list repaints after each tick, so a batch of stale nodes ticks one box.
    for (let i = 0; i < 3; i++) {
      await p.click('#wf-dev .mus-pick input[type=checkbox]', i);
      await sleep(250);
    }
    const picked = await p.eval(`(async () => (await import('${BASE}/js/dev/data.js')).default.get('music').sets.find(s => s.id === '${setId}').tracks.length)()`);
    check('ticking adds tracks to the set', picked === 3, `${picked} tracks`);
    await p.shot(`${OUT}/03-set-edited.png`);

    // Preview drives the real js/game/music.js.
    await p.clickText('#wf-dev .row button', '▶ Preview set');
    await sleep(2500);
    const st = await p.eval('(() => { const t = document.querySelector("#wf-dev pre"); return t ? t.textContent : ""; })()');
    check('preview reports the real runtime state', /gain 0\.\d/.test(st), st.slice(0, 120).replace(/\n/g, ' | '));
    await p.shot(`${OUT}/04-preview.png`);
    await p.clickText('#wf-dev .row button', '■ Stop preview');

    await p.click('#wf-dev header [data-act=save]');
    check('the save landed on disk', await waitForFile(before), 'fixture bytes unchanged');
    check('the header says it saved',
      /saved/.test(await p.eval('document.querySelector("#wf-dev .savestate").textContent')));

    await p.clickText('#wf-dev .mus-sub button', 'Assign');
    await p.waitFor('document.querySelectorAll("#wf-dev table").length > 0', 8000);
    await sleep(400);
    const rows = await p.eval('document.querySelectorAll("#wf-dev table tr").length');
    check('assign lists levels and music hotspots', rows >= 3, `${rows} rows`);
    check('it found the doorway hotspot that changes the music',
      /academy_hall/.test(await p.eval('document.querySelector("#wf-dev main").textContent')));
    await p.shot(`${OUT}/05-assign.png`);

    await p.clickText('#wf-dev .mus-sub button', 'Generate');
    await p.waitFor('!!document.querySelector("#wf-dev textarea")');
    await sleep(300);
    await p.shot(`${OUT}/06-generate.png`);

    // The studio, at the URL the tab itself asks for — window.open is stubbed so the button's own
    // logic is what is under test.
    await p.eval(`(() => { window.__open = null; window.open = u => { window.__open = u; return { closed: false, focus() {} }; }; })()`);
    await p.clickText('#wf-dev button', '🎛 Sound studio');
    await sleep(200);
    const url = await p.eval('window.__open || ""');
    check('the tab opens the studio with a way back', /audio\/studio\/index\.html\?from=/.test(url), url);
    const s = await front(await attach(9345, url));
    check('the studio boots', await s.waitFor('!!window.__lab && window.__lab.ready', 20000));
    check('it knows where it came from', (await s.eval('window.__lab.from || ""')).length > 0);
    check('the back control says so',
      /Back to dev tools/.test(await s.eval('document.getElementById("back").textContent')));
    const cards = await s.eval('document.querySelectorAll("#bench .sfx").length');
    check('every synthesised sound is on the bench', cards > 20, `${cards} cards`);
    await s.eval('document.getElementById("gbtn").click()');
    await sleep(400);
    await s.shot(`${OUT}/07-studio.png`);
    console.log('  studio console:', s.logs().filter(l => l.level === 'error' || l.level === 'exception').map(l => l.text).join(' | ') || 'clean');
    s.close();
    await closeTab(s.targetId);
    await front(p);

    check('no console errors in the tab', noise(p).length === 0, noise(p).map(l => l.text).slice(0, 3).join(' | '));
  } finally { p.close(); await closeTab(p.targetId); restore(); }
}

// A fixed port is a trap here — five agents are working in this tree and one of them owns 8796.
async function freePort() {
  const net = await import('node:net');
  return new Promise(res => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

// audio/music/*.mp3 is another agent's directory and it is being rewritten while this runs; a 404
// on a track is a fact about the library, not a fault in the tab.
function noise(p) {
  return p.logs().filter(l => (l.level === 'error' || l.level === 'exception') &&
    !/favicon/.test(l.text) && !/audio\/music\/.*\.mp3/.test(l.text));
}

async function waitForFile(before) {
  for (let i = 0; i < 40; i++) {
    if (fs.readFileSync(path.join(ROOT, FIXTURE), 'utf8') !== before) return true;
    await sleep(200);
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// The point of the whole exercise: does walking through the doorway change what is playing?

async function doorwayRun() {
  console.log('\nthe game — the level default, then the doorway');
  const p = await front(await attach(9345, `${BASE}/index.html`));
  try {
    check('game boots', await p.waitFor('!!window.__wf && window.__wf.ready', 40000),
      p.logs().filter(l => l.level === 'exception').map(l => l.text.split('\n')[0]).join(' | '));
    check('the runtime is installed', await p.waitFor('!!window.__wf.music', 10000));
    check('the manifest loaded', await p.waitFor('window.__wf.music.plan.tracksById.size > 0', 10000));

    check('the level default started on its own',
      await p.waitFor('window.__wf.music.state().setId === "outdoors"', 8000),
      JSON.stringify(await p.eval('window.__wf.music.state()')));

    check('and it is actually audible, not just intended',
      await p.waitFor('[...window.__wf.music.els.values()].some(e => !e.paused && e.currentTime > 0.2)', 12000),
      JSON.stringify(await p.eval('[...window.__wf.music.els.values()].map(e => ({ paused: e.paused, t: e.currentTime, v: e.volume, src: e.src.split("/").pop() }))')));

    const outdoorTrack = await p.eval('window.__wf.music.state().playing[0]');

    // Walk to the doorway. The session moves the hotspot runtime, not this script.
    await p.eval(`(() => { const w = window.__wf; w.player.pos.x = 0; w.player.pos.z = 2.5; })()`);
    check('the doorway hotspot fired and swapped the set',
      await p.waitFor('window.__wf.music.state().setId === "academy_hall"', 8000),
      JSON.stringify(await p.eval('window.__wf.music.state()')));
    check('the flag on the same hotspot fired too, so this was the real trigger',
      await p.eval('!!window.__wf.game.doc.flags["academy.doorway.seen"]'));

    const mid = await p.eval('window.__wf.music.state()');
    check('both tracks are live during the cross-fade', mid.voices.length === 2, JSON.stringify(mid.voices));
    check('the outgoing one is on its way down', mid.voices.some(v => v.out && v.trackId === outdoorTrack), JSON.stringify(mid.voices));

    const settled = await p.waitFor('window.__wf.music.state().voices.length === 1', 12000);
    const after = await p.eval('window.__wf.music.state()');
    check('the fade finished and only the new set is playing',
      settled && after.voices[0].gain > 0.3, JSON.stringify(after.voices));
    check('the element volumes followed the plan',
      await p.waitFor('[...window.__wf.music.els.values()].every(e => e.volume > 0.2)', 5000),
      JSON.stringify(await p.eval('[...window.__wf.music.els.values()].map(e => e.volume)')));

    // Walking back in must not restart it.
    const before = after.voices[0].trackId;
    await p.eval('window.__wf.player.pos.z = 40');
    await sleep(400);
    await p.eval('window.__wf.player.pos.z = 2.5');
    await sleep(1200);
    check('walking back through does not restart the track',
      (await p.eval('window.__wf.music.state().playing[0]')) === before);

    // Mute in the save must silence it without stopping it.
    await p.eval('window.__wf.game.setSetting("mute", true)');
    check('the save\'s own mute silences the music',
      await p.waitFor('[...window.__wf.music.els.values()].every(e => e.volume < 0.02)', 5000),
      JSON.stringify(await p.eval('[...window.__wf.music.els.values()].map(e => e.volume)')));
    await p.eval('window.__wf.game.setSetting("mute", false)');

    // A track file that is not there must not stall the set — the runtime treats an element error
    // as an ended track and moves on.
    await p.eval(`(() => { const rt = window.__wf.music;
      rt.plan.tracksById.get(rt.state().playing[0]).file = 'audio/music/__nope.mp3';
      rt.plan.stop(rt.now(), 0); rt.apply(rt.plan.tick(rt.now())); rt.playSet('academy_hall', { restart: true }); })()`);
    check('a missing mp3 does not stall the set',
      await p.waitFor('window.__wf.music.state().voices.length > 0 && window.__wf.music.state().playing.length > 0', 8000),
      JSON.stringify(await p.eval('window.__wf.music.state()')));

    await p.shot(`${OUT}/08-ingame.png`);
    check('no console errors in the game', noise(p).length === 0, noise(p).map(l => l.text).slice(0, 3).join(' | '));
  } finally { p.close(); await closeTab(p.targetId); }
}


// ---------------------------------------------------------------------------------------------
// Generation, against an ACE-Step that is not there. The real backend is another agent's for now,
// and the interesting behaviour is the failure anyway: queue, then a reason, then a usable form.

async function generateRun() {
  console.log('\ngeneration, with the backend unreachable');
  const port = await freePort();
  const srv = spawn(process.execPath, [path.join(ROOT, 'tools/devserver.mjs'), '--port', String(port)],
    { env: { ...process.env, WF_ACE: 'http://127.0.0.1:9' }, stdio: 'ignore', cwd: ROOT });
  // Believe nothing the page says until node has confirmed which server is answering: a leaked
  // devserver on the same port once made a "failed to reach ACE-Step" test report a success.
  let up = null;
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/status`); if (r.ok) { up = await r.json(); break; } } catch { /* not yet */ }
    await sleep(200);
  }
  check('the scratch dev server is up with ACE-Step unreachable', !!up && up.ace === false, JSON.stringify(up));
  const base = `http://localhost:${port}`;
  const p = await front(await attach(9345, `${base}/index.html`));
  try {
    check('second dev server up', await p.waitFor('!!window.__wf && window.__wf.ready', 40000));
    check('the page is talking to that server and no other',
      (await p.eval(`(async () => { const a = (await import('${base}/js/dev/api.js')).default;
        await a.status({ force: true }); return String(a.base); })()`)) === '',
      'api.base should be same-origin');
    await p.eval(`(async () => { const m = await import('${base}/js/dev/data.js');
      m.default.KINDS.music.file = () => '${FIXTURE}'; })()`);
    await p.click('#wf-dev-btn');
    await p.waitFor('[...document.querySelectorAll("#wf-dev nav button")].some(b => b.textContent.includes("Sound & music"))', 10000);
    await p.clickText('#wf-dev nav button', 'Sound & music');
    await p.waitFor('!!document.querySelector("#wf-dev .mus-sub")');
    await p.clickText('#wf-dev .mus-sub button', 'Generate');
    await p.waitFor('!!document.querySelector("#wf-dev textarea")');
    await sleep(300);

    check('it says ACE-Step is not answering',
      /not answering/.test(await p.eval('document.querySelector("#wf-dev .banner").textContent')));

    await p.eval(`(() => {
      const set = (sel, v) => { const e = document.querySelectorAll('#wf-dev main ' + sel); const n = e[0];
        n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); };
      set('input[type=text]', '__uitest_track');
      document.querySelectorAll('#wf-dev main textarea')[0].value = 'a short test prompt, instrumental, no vocals';
      document.querySelectorAll('#wf-dev main textarea')[0].dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await p.click('#wf-dev [data-act=generate]');
    await sleep(400);
    check('the button locks while a job is in flight — one GPU slot',
      await p.eval(`document.querySelector('#wf-dev [data-act=generate]').disabled`));

    const failed = await p.waitFor(`/failed after/.test(document.querySelector('#wf-dev [data-role=progress]')?.textContent || '')`, 90000);
    check('the failure says why and how long it took', failed,
      await p.eval(`document.querySelector('#wf-dev [data-role=progress]')?.textContent || '(no line)'`));
    console.log('    reported:', await p.eval(`document.querySelector('#wf-dev [data-role=progress]')?.textContent || ''`));
    check('and the button comes back',
      !(await p.eval(`document.querySelector('#wf-dev [data-act=generate]').disabled`)));
    await p.shot(`${OUT}/09-generate-failed.png`);
    check('no console errors while it failed', noise(p).length === 0, noise(p).map(l => l.text).slice(0, 3).join(' | '));
  } finally { p.close(); await closeTab(p.targetId); srv.kill(); }
}


// Opt-in: WF_REAL_GEN=1 puts one short job through the real ACE-Step. Only run it when nothing
// else is using the GPU — the queue serialises, but a two-minute wait behind someone else's batch
// is not a test result.
async function realGenerateRun() {
  console.log('\ngeneration, for real');
  const out = '__toolcheck';
  const p = await front(await attach(9345, `${BASE}/index.html`));
  try {
    await p.waitFor('!!window.__wf && window.__wf.ready', 40000);
    await p.eval(`(async () => { const m = await import('${BASE}/js/dev/data.js');
      m.default.KINDS.music.file = () => '${FIXTURE}'; })()`);
    await p.click('#wf-dev-btn');
    await p.waitFor('[...document.querySelectorAll("#wf-dev nav button")].some(b => b.textContent.includes("Sound & music"))', 10000);
    await p.clickText('#wf-dev nav button', 'Sound & music');
    await p.waitFor('!!document.querySelector("#wf-dev .mus-sub")');
    await p.clickText('#wf-dev .mus-sub button', 'Generate');
    await p.waitFor('!!document.querySelector("#wf-dev textarea")');
    await p.eval(`(() => {
      const ins = document.querySelectorAll('#wf-dev main input[type=text]');
      ins[0].value = '${out}'; ins[0].dispatchEvent(new Event('input', { bubbles: true }));
      ins[1].value = 'Tool check'; ins[1].dispatchEvent(new Event('input', { bubbles: true }));
      const sec = document.querySelector('#wf-dev main input[type=number]');
      sec.value = '20'; sec.dispatchEvent(new Event('input', { bubbles: true }));
      const ta = document.querySelectorAll('#wf-dev main textarea')[0];
      ta.value = 'short medieval lute flourish, instrumental, no vocals, 90 bpm, resolves and stops';
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
    await p.click('#wf-dev [data-act=generate]');
    const done = await p.waitFor(`/done in/.test(document.querySelector('#wf-dev [data-role=progress]')?.textContent || '')`, 420000);
    check('a real generation came back', done,
      await p.eval(`document.querySelector('#wf-dev [data-role=progress]')?.textContent || ''`));
    console.log('   ', await p.eval(`document.querySelector('#wf-dev [data-role=progress]')?.textContent || ''`));
    check('and it can be auditioned before keeping it',
      await p.waitFor(`!!document.querySelector('#wf-dev audio') && document.querySelector('#wf-dev audio').src.includes('${out}')`, 8000));
    const r = await fetch(`${BASE}/audio/music/${out}.mp3`, { method: 'HEAD' });
    check('the file is on disk', r.ok, `HTTP ${r.status}`);
    await p.shot(`${OUT}/10-generated.png`);
  } finally { p.close(); await closeTab(p.targetId); }
}
