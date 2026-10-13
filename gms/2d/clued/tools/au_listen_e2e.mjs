#!/usr/bin/env node
// Listen rounds play through real Apple clips: one solo round per decade pack in headless Chrome, every clip must
// reach "Pick your answer" and the reveal must name the song from the pack.
//   ~/.claude/bin/cdp start --port 9570 -- --use-angle=metal --autoplay-policy=no-user-gesture-required
//   node tools/au_listen_e2e.mjs [--port 9570] [--packs hits-1960s,hits-1990s,hits-2020s] [--n 5] [--diff 0] [--clip 3] [--wait 20]
// If clips sit at "Listening…", check `ps aux -r`: a busy coreaudiod slows the headless AudioContext clock (raise --wait).
import { connect } from './au_cdp.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = +(process.env.CDP_PORT || arg('--port', 9570)), SITE = arg('--site', 'http://localhost:8888/gms/2d/clued/');
const PACKS = arg('--packs', 'hits-1960s,hits-1990s,hits-2020s').split(','), N = +arg('--n', 5), DIFF = +arg('--diff', 0), CLIP = +arg('--clip', 3), WAIT = +arg('--wait', 20);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? 'ok  ' : 'FAIL'} ${m}`); };

const c = await connect(PORT);
await c.goto(`${SITE}?noauth=1`, 'window.__cluedReady === true', 30000);
for (const pack of PACKS) {
  console.log(pack);
  await c.goto(`${SITE}?noauth=1`, 'window.__cluedReady === true', 30000);
  await c.evaluate(`window.__clued.start({ structure: 'quick', format: 'listen', packs: ['${pack}'], count: ${N}, timer: false, difficulty: ${DIFF}, opts: { clip: ${CLIP}, ask: 'title' } }); true`);
  for (let n = 0; n < N; n++) {
    let rendered = false;
    for (let t = 0; t < 240 && !rendered; t++) { await sleep(250); rendered = await c.evaluate(`window.__clued.state().run?.i === ${n} && !!document.querySelector('.au-listen')`); }
    let status = '';
    for (let t = 0; t < WAIT * 4; t++) { await sleep(250); status = await c.evaluate(`document.querySelector('.au-status')?.textContent || ''`); if (/Pick your answer/.test(status)) break; }
    const q = await c.evaluate(`(() => { const q = window.__clued.state().q; return q ? { ref: q.refs?.[0], answer: q.answerText, track: q.data?.a?.apple?.trackId } : null; })()`);
    ok(rendered && /Pick your answer/.test(status), `Q${n + 1}: clip played (${q?.ref || '?'} "${q?.answer || ''}") status "${status}"`);
    await c.evaluate(`window.__clued.answer('correct'); true`);
    await sleep(700);
    const reveal = await c.evaluate(`document.querySelector('.reveal')?.textContent || ''`);
    ok(!q?.answer || reveal.includes(q.answer), `Q${n + 1}: reveal names the song`);
    await c.evaluate(`document.querySelector('.reveal .next')?.click(); true`);
  }
  await sleep(1500);
}
c.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
