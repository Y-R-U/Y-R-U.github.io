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
} finally {
  proc.kill();
}

console.log(`\n${pass}/${pass + fails.length} passed`);
for (const f of fails) console.error(`FAIL  ${f}`);
process.exit(fails.length ? 1 : 0);

// ---------------------------------------------------------------------------------------------

async function tabRun() {
  console.log('\nthe tab, over data/__music.fixture.json');
  const before = fs.readFileSync(path.join(ROOT, FIXTURE), 'utf8');
  const p = await attach(9345, `${BASE}${PAGE}`);
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
    check('a new set appears in the document',
      await p.eval(`(async () => (await import('${BASE}/js/dev/data.js')).default.get('music').sets.some(s => s.id === 'set_1'))()`));

    // One at a time: the list repaints after each tick, so a batch of stale nodes ticks one box.
    for (let i = 0; i < 3; i++) {
      await p.click('#wf-dev .mus-pick input[type=checkbox]', i);
      await sleep(250);
      console.log('    after tick', i, await p.eval(`(async () => JSON.stringify((await import('${BASE}/js/dev/data.js')).default.get('music').sets.find(s => s.id === 'set_1').tracks))()`),
        'checked:', await p.eval('[...document.querySelectorAll("#wf-dev .mus-pick input[type=checkbox]")].slice(0,4).map(c=>c.checked).join(",")'));
    }
    const picked = await p.eval(`(async () => (await import('${BASE}/js/dev/data.js')).default.get('music').sets.find(s => s.id === 'set_1').tracks.length)()`);
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
    const s = await attach(9345, url);
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

    const bad = p.logs().filter(l => (l.level === 'error' || l.level === 'exception') && !/favicon/.test(l.text));
    check('no console errors in the tab', bad.length === 0, bad.map(l => l.text).slice(0, 3).join(' | '));
  } finally { p.close(); }
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
  const p = await attach(9345, `${BASE}/index.html`);
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

    await sleep(2200);
    const after = await p.eval('window.__wf.music.state()');
    check('the fade finished and only the new set is playing',
      after.voices.length === 1 && after.voices[0].gain > 0.3, JSON.stringify(after.voices));
    check('the element volumes followed the plan',
      await p.eval('[...window.__wf.music.els.values()].every(e => e.volume > 0.2)'),
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
    await sleep(600);
    check('the save\'s own mute silences the music',
      await p.eval('[...window.__wf.music.els.values()].every(e => e.volume < 0.02)'),
      JSON.stringify(await p.eval('[...window.__wf.music.els.values()].map(e => e.volume)')));
    await p.eval('window.__wf.game.setSetting("mute", false)');

    await p.eval('document.body.classList.add("nohud")');
    await p.shot(`${OUT}/08-ingame.png`);
    const bad = p.logs().filter(l => (l.level === 'error' || l.level === 'exception') && !/favicon/.test(l.text));
    check('no console errors in the game', bad.length === 0, bad.map(l => l.text).slice(0, 3).join(' | '));
  } finally { p.close(); }
}
