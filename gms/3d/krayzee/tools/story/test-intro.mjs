// STORY: D16 intro in the real game (devhook shim), real CDP touch/mouse. Shots → docs/shots/story/.
//   ~/.claude/bin/cdp start --port 9531 -- --use-angle=metal ; node tools/story/test-intro.mjs [--only=portrait,landscape,desktop] [--full]
//   Radio silence (Aaron 2026-11-04): while the intro runs no radio line may start (AI chatter, tower, scolds), the
//   narration still plays, and the radio talks again once it ends. Also replays the intro from the menu's "Watch the intro".
//   --falsify=hush turns radio.hush into a no-op (the gate removed): the radio checks must go red.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', '..', 'docs', 'shots', 'story');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const ONLY = arg('only', 'portrait,landscape,desktop').split(',');
const FULL = process.argv.includes('--full');
const FALSIFY = arg('falsify', '');
const BASE = 'http://localhost:8888/gms/3d/krayzee/';
const PROFILE = { name: 'Dirk', gender: 'm', company: 'Dirk Air', primary: '#1d3f8f', secondary: '#f4f1ea', accent: '#d4af37', voice: 'toff', registration: 'K-DIRK' };
const VIEWS = { portrait: [390, 844, true], landscape: [844, 390, true], desktop: [1280, 800, false] };

const C = await connect(+arg('port', 9531));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

// Records every radio 'line' (director) and every transmission the audio chain starts, plus narration plays, tagged
// with whether the intro was running. Then keeps the channel busy: AI phase barks, tower clearances, a scold.
const RADIO_REC = `(async () => {
  const W = window.__game.wiring, R = W.radio, A = await import('${BASE}js/audio/index.js');
  if (${JSON.stringify(FALSIFY)} === 'hush') R.hush = () => {};
  const intro = () => !!window.__krzStory?.intro?.active;
  const rec = window.__radioRec = { lines: [], tx: [], narr: [] };
  R.on('line', (l) => rec.lines.push({ intro: intro(), id: l.id, speaker: l.speaker, hushed: R.hushed }));
  A.onRadio('start', (i) => rec.tx.push({ intro: intro(), speaker: i.speaker, text: i.text }));
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () { rec.narr.push({ intro: intro(), src: this.src }); return play.call(this); };
  return true;
})()`;
const RADIO_POKE = `(() => {
  const W = window.__game.wiring, R = W.radio;
  const ai = window.__game.traffic.list.filter((e) => !e.player).map((e) => W.idOf(e));
  const a = ai[0] ?? 'ai_x', b = ai[1] ?? 'ai_y';
  R.handleEvent({ type: 'phase', actor: a, phase: 'hold' });
  R.handleEvent({ type: 'tower', intent: 'clear_land', actor: b });
  R.handleEvent({ type: 'infraction', id: 'cut_in_final', actor: a, victim: b });
  R.say('tower', 'traffic', { about: a });
  return ai.length;
})()`;
async function radioDuringIntro(v, how) {
  const t0 = Date.now();
  while (Date.now() - t0 < 7000) { await C.ev(RADIO_POKE); await C.sleep(700); }
  const r = await C.ev('window.__radioRec');
  const bad = [...r.lines.filter((l) => l.intro).map((l) => `line ${l.id} (hushed=${l.hushed})`), ...r.tx.filter((x) => x.intro).map((x) => `tx ${x.speaker}: ${x.text}`)];
  check(`${v}: ${how}: no radio line during the intro`, !bad.length, bad.length ? `${bad.length}: ${bad.slice(0, 3).join(' / ')}` : `${r.narr.filter((n) => n.intro).length} narration plays`);
  check(`${v}: ${how}: narration plays during the intro`, r.narr.some((n) => n.intro && /audio\/story\//.test(n.src)));
}
async function radioAfterIntro(v, how) {
  const q = await C.ev('(({ queue, pending }) => ({ queue, pending }))(window.__game.wiring.radio.state)');
  check(`${v}: ${how}: nothing queued up to burst out after the intro`, !q.queue.length && !q.pending, JSON.stringify(q));
  const n0 = (await C.ev('window.__radioRec')).lines.length;
  const t0 = Date.now();
  let r;
  while (Date.now() - t0 < 12000) {
    await C.ev(RADIO_POKE); await C.sleep(800);
    r = await C.ev('window.__radioRec');
    if (r.lines.slice(n0).some((l) => !l.intro)) break;
  }
  const after = r.lines.slice(n0);
  check(`${v}: ${how}: radio talks again after the intro`, after.some((l) => !l.intro) && !(await C.ev('window.__game.wiring.radio.hushed')), `${after.length} lines`);
  check(`${v}: ${how}: no burst of old lines`, after.length <= 6, after.map((l) => l.id).slice(0, 8).join(', '));
}

for (const v of ONLY) {
  const [w, h, mobile] = VIEWS[v];
  await C.viewport(w, h, mobile);
  await C.send('Page.navigate', { url: 'about:blank' });
  await C.sleep(200);
  await C.load(BASE);
  await C.ev(`localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))}); localStorage.removeItem('krayzee.story'); true`);
  check(`${v}: game boots`, await C.load(BASE));
  C.errors.length = 0;
  await C.ev(RADIO_REC);
  await C.ev(RADIO_POKE); // a line in flight at the moment the intro starts must be cut, not leak out
  await C.ev(`(async () => { const d = await (await import('${BASE}js/story/devhook.js')).install(); (await import('${BASE}js/ui/index.js')).enterGameplay(); d.story.playIntro(); return true; })()`);
  await C.sleep(1500);
  const st = () => C.ev('window.__story.story.intro?.state || null');
  const s0 = await st();
  check(`${v}: intro running`, s0?.active && s0.total > 40 && s0.total < 90, `total ${s0?.total}s`);
  await radioDuringIntro(v, 'first run');
  const plan = FULL && v === 'portrait'
    ? null
    : ['i01', 'i03', 'i05', 'i07', 'i08', 'i09', 'i10', 'i11'];
  if (!plan) {
    let lastLine = '';
    while (true) {
      const s = await st();
      if (!s?.active) break;
      if (s.line !== lastLine) { lastLine = s.line; await C.sleep(2200); await C.shot(SHOTS, `intro_${v}_${s.line}`); }
      await C.sleep(400);
    }
    check(`${v}: intro ran to the end`, !(await st()) && await C.ev("JSON.parse(localStorage.getItem('krayzee.story')||'{}').introSeen === true"));
  } else {
    for (const id of plan) {
      await C.ev(`window.__story.story.intro.seek('${id}')`);
      await C.sleep(id === 'i11' ? 1800 : 2400);
      const s = await st();
      await C.shot(SHOTS, `intro_${v}_${id}`);
      if (id === 'i08') check(`${v}: rival shot`, s.shot === 'rivals', `following AI: ${s.rival}`);
      if (id === 'i09') {
        const card = await C.ev(`(() => { const c = document.querySelector('.krz-in-card'); const r = c.getBoundingClientRect(); return { text: c.innerText, vis: !c.hidden, x: r.left, r: r.right }; })()`);
        check(`${v}: name card shows title + name + company`, card.vis && /Dirk/.test(card.text) && /Dirk Air/.test(card.text) && card.x >= 0 && card.r <= w, card.text.replace(/\n/g, ' | '));
        check(`${v}: player plane on a stand`, s.plane);
      }
      const cap = await C.ev(`(() => { const e = document.querySelector('.krz-in-cap'); if (!e) return { l: 0, r: 0, t: 0, b: 0 }; const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; })()`);
      if (cap.l < 0 || cap.r > w || cap.b > h || cap.t < 0) check(`${v}: caption ${id} inside screen`, false, JSON.stringify(cap));
    }
    // skip: first tap reveals the button, second (on the button) skips
    await C.ev(`window.__story.story.intro.seek('i04')`);
    await C.sleep(600);
    await C.tap(w / 2, h * 0.4);
    await C.sleep(400);
    const vis = await C.ev(`!document.querySelector('.krz-in-skip').hidden`);
    await C.shot(SHOTS, `intro_${v}_skip`);
    check(`${v}: tap shows Skip`, vis);
    const r = await C.tapSel('.krz-in-skip');
    await C.sleep(900);
    const after = await C.ev(`({ intro: !!window.__story.story.intro, el: !!document.querySelector('.krz-intro'), seen: JSON.parse(localStorage.getItem('krayzee.story')||'{}').introSeen === true, fov: window.__game.camera.fov })`);
    check(`${v}: Skip ends the intro and marks it seen`, r && !after.intro && !after.el && after.seen, JSON.stringify(after));
  }
  await radioAfterIntro(v, 'first run');
  // replay from the menu: a real tap on "Watch the intro"
  if (v !== 'desktop') {
    await C.ev(`(async () => { (await import('${BASE}js/ui/index.js')).showMenu(); return true; })()`);
    await C.sleep(700);
    await C.ev(RADIO_POKE);
    const link = await C.tapSel('.kz-intro-link');
    await C.sleep(1500);
    const s1 = await st();
    check(`${v}: menu "Watch the intro" replays it`, link && s1?.active, JSON.stringify(s1 && { t: s1.t, line: s1.line }));
    if (s1?.active) {
      await C.ev(`window.__story.story.intro.seek('i05')`);
      await radioDuringIntro(v, 'replay');
      await C.ev(`window.__story.story.intro.seek(window.__story.story.intro.state.total - 0.3)`);
      await C.sleep(1500);
      check(`${v}: replay ran to the end`, !(await st()));
      await radioAfterIntro(v, 'replay');
    }
  }
  const audio = await C.ev(`performance.getEntriesByType('resource').filter((e) => /audio\\/story\\/i\\d+\\.mp3/.test(e.name)).length`);
  check(`${v}: narration clips requested`, audio > 0, `${audio} clips`);
  check(`${v}: no console errors`, C.errors.length === 0, C.errors.slice(0, 3).join(' / '));
}
// the real first-launch path in main.js (?intro=1 = what a new player gets), portrait
if (ONLY.includes('portrait')) {
  await C.viewport(390, 844, true);
  await C.send('Page.navigate', { url: 'about:blank' });
  await C.sleep(200);
  await C.ev(`localStorage.removeItem('krayzee.story'); true`).catch(() => {});
  check('first launch (?intro=1): boots', await C.load(BASE + '?intro=1'));
  await C.ev(RADIO_REC);
  await C.sleep(1500);
  const s = await C.ev('window.__krzStory?.intro?.state || null');
  check('first launch (?intro=1): intro running', s?.active, JSON.stringify(s && { t: s.t, line: s.line }));
  if (s?.active) {
    await radioDuringIntro('portrait', '?intro=1');
    await C.ev(`window.__krzStory.intro.skip()`);
    await C.sleep(900);
    await radioAfterIntro('portrait', '?intro=1');
  }
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
