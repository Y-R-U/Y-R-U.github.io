// STORY: D16 intro in the real game (devhook shim), real CDP touch/mouse. Shots → docs/shots/story/.
//   ~/.claude/bin/cdp start --port 9531 -- --use-angle=metal ; node tools/story/test-intro.mjs [--only=portrait,landscape,desktop] [--full]
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect } from './cdp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(HERE, '..', '..', 'docs', 'shots', 'story');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const ONLY = arg('only', 'portrait,landscape,desktop').split(',');
const FULL = process.argv.includes('--full');
const BASE = 'http://localhost:8888/gms/3d/krayzee/';
const PROFILE = { name: 'Dirk', gender: 'm', company: 'Dirk Air', primary: '#1d3f8f', secondary: '#f4f1ea', accent: '#d4af37', voice: 'toff', registration: 'K-DIRK' };
const VIEWS = { portrait: [390, 844, true], landscape: [844, 390, true], desktop: [1280, 800, false] };

const C = await connect(+arg('port', 9531));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

for (const v of ONLY) {
  const [w, h, mobile] = VIEWS[v];
  await C.viewport(w, h, mobile);
  await C.send('Page.navigate', { url: 'about:blank' });
  await C.sleep(200);
  await C.load(BASE);
  await C.ev(`localStorage.setItem('krayzee.profile', ${JSON.stringify(JSON.stringify(PROFILE))}); localStorage.removeItem('krayzee.story'); true`);
  check(`${v}: game boots`, await C.load(BASE));
  C.errors.length = 0;
  await C.ev(`(async () => { const d = await (await import('${BASE}js/story/devhook.js')).install(); (await import('${BASE}js/ui/index.js')).enterGameplay(); d.story.playIntro(); return true; })()`);
  await C.sleep(1500);
  const st = () => C.ev('window.__story.story.intro?.state || null');
  const s0 = await st();
  check(`${v}: intro running`, s0?.active && s0.total > 40 && s0.total < 90, `total ${s0?.total}s`);
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
  const audio = await C.ev(`performance.getEntriesByType('resource').filter((e) => /audio\\/story\\/i\\d+\\.mp3/.test(e.name)).length`);
  check(`${v}: narration clips requested`, audio > 0, `${audio} clips`);
  check(`${v}: no console errors`, C.errors.length === 0, C.errors.slice(0, 3).join(' / '));
}
const bad = results.filter((r) => !r.ok);
console.log(`\n${results.length - bad.length}/${results.length} passed`);
process.exit(bad.length ? 1 : 0);
