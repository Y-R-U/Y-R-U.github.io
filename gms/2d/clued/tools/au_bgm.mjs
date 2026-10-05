#!/usr/bin/env node
// Background music in the real shell: starts after a real click, pauses during a listen question and while any
// <audio> plays, resumes ~1 s after, ducks under speech, stops when turned off.   (cdp on port 9405)
import { connect } from './au_cdp.mjs';

const c = await connect(9405);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (cond, m) => { console.log((cond ? 'PASS ' : 'FAIL ') + m); if (!cond) fails++; };
const st = () => c.evaluate(`import('./js/audio/bgm.js?v=' + (window.__clued?.BUILD || window.__cluedCtx?.BUILD || 1)).then(m => m.state())`);
async function until(fn, ms = 8000) { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await st(); if (fn(s)) return s; await sleep(250); } return s; }

await c.goto('http://localhost:8888/gms/2d/clued/?test', 'window.__cluedReady === true');
await c.evaluate(`localStorage.setItem('clued.settings', JSON.stringify({ sound: true, bgm: true })); true`);
await c.goto('http://localhost:8888/gms/2d/clued/?test', 'window.__cluedReady === true');
await c.evaluate(`(async () => { const P = globalThis.__cluedPacks; const { summarize } = await import('./js/core/packs.js?v=' + (window.__clued?.BUILD || window.__cluedCtx?.BUILD || 1));
  const p = await (await fetch('data/music/hits-1990s.json')).json(); P.packs.set(p.id, p); P.index.packs[p.id] = { ...summarize(p), id: p.id }; return true; })()`);
let s = await st();
ok(!s.playing, 'silent before any gesture');
for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: 5, y: 400, button: 'left', clickCount: 1 });
s = await until((x) => x.playing && x.gain > 0.2);
ok(s.playing && s.gain > 0.2, `plays after the first click (${s.piece}, gain ${s.gain})`);

await c.evaluate(`window.__clued.start({ structure: 'quick', format: 'listen', packs: ['hits-1990s'], count: 2, opts: { clip: 5 } }); true`);
s = await until((x) => !x.playing, 6000);
ok(!s.playing && s.busy, `paused during the listen question (busy ${s.busy})`);
await sleep(3000);
s = await st();
ok(!s.playing, 'still paused while the question is up');
await c.evaluate(`window.__clued.run().stop('stop'); true`);
s = await until((x) => x.playing, 8000);
ok(s.playing, `resumed after the question ended (${s.piece})`);

await c.evaluate(`(() => { const a = new Audio('https://upload.wikimedia.org/wikipedia/commons/transcoded/b/b4/United_States_Navy_Band_-_O_Canada.ogg/United_States_Navy_Band_-_O_Canada.ogg.mp3'); window.__a = a; a.play(); return true; })()`);
s = await until((x) => !x.playing, 8000);
ok(!s.playing, 'paused while another <audio> plays');
await c.evaluate(`window.__a.pause(); true`);
s = await until((x) => x.playing, 8000);
ok(s.playing, 'resumed after it paused');

await c.evaluate(`(async () => { const m = await import('./js/audio/bgm.js?v=' + (window.__clued?.BUILD || window.__cluedCtx?.BUILD || 1)); m.duck(true, 'test'); return true; })()`);
await sleep(700);
s = await st();
ok(s.gain < 0.1, `duck() drops the level (gain ${s.gain})`);
await c.evaluate(`import('./js/audio/bgm.js?v=' + (window.__clued?.BUILD || window.__cluedCtx?.BUILD || 1)).then(m => (m.duck(false, 'test'), true))`);
await c.evaluate(`(() => { speechSynthesis.speak(new SpeechSynthesisUtterance('Which country is this anthem from?')); return true; })()`);
await sleep(150);
s = await st();
ok(s.ducked, `speech ducks the music (ducked ${s.ducked})`);
await c.evaluate(`speechSynthesis.cancel(); true`);

await c.evaluate(`import('./js/ui/toggles.js?v=' + (window.__clued?.BUILD || window.__cluedCtx?.BUILD || 1)).then(m => m.setBgm(false)).then(() => true)`);
s = await until((x) => !x.playing, 4000);
ok(!s.playing && !s.wanted, 'turning it off stops it');
console.log(c.logs.filter((l) => /EXC/.test(l)).slice(0, 5).join('\n'));
console.log(fails ? `${fails} FAILED` : 'all passed');
c.close();
process.exit(fails ? 1 : 0);
