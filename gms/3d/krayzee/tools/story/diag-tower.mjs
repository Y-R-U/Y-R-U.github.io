// Diagnostic: Mission 1 tower-pass geometry. Jumps to the tower legs, samples distance/AGL and ATC/score events.
import { connect } from './cdp.mjs';
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=')[1] || d;
const DIFF = arg('diff', 'easy');
const BASE = 'http://localhost:8888/gms/3d/krayzee/';
const C = await connect(9531);
await C.viewport(390, 844, true);
await C.load(BASE);
await C.ev(`localStorage.setItem('krayzee.story', JSON.stringify({ introSeen: true, missions: {} })); true`);
await C.load(BASE);
await C.ev(`(async () => { await window.__game.start('story'); return true; })()`);
await C.sleep(1500);
await C.ev(`(async () => { const d = await (await import('${BASE}js/story/devhook.js')).install(); d.story.startMission(1, { difficulty: '${DIFF}' }); window.__ev = []; d.story.host.on('pp', (e) => __ev.push(['pp', e.id, e.amount])); window.__game.wiring.game.on('scandal', (e) => __ev.push(['scandal', e.id])); return true; })()`);
const r = await C.ev(`(() => { const st = window.__story.story.mission; const R = window.__story.story.mission; const m = window.__story; const route = m.story.mission.target; return true; })()`);
await C.ev(`(() => { const S = window.__story.story; const P = window.__game.S.player; const route = P.ap.route || null; window.__game.teleport({ x: 1000, z: -1950, alt: 200, heading: 250, speedKt: 90, throttle: 0.7 }); S.host.setRoute(window.__route = (window.__story.story.mission, null), 0); return true; })()`).catch(() => {});
await C.ev(`(async () => { const { mission1Route } = await import('${BASE}data/story/mission1.js'); const rt = mission1Route(window.__story.story.host.activeEnd(), '${DIFF}'); window.__rt = rt; window.__story.story.host.setRoute(rt, rt.marks.towerIn); return rt.legs.slice(7, 11).map((l) => l.to); })()`).then((x) => console.log('legs', JSON.stringify(x)));
let min = 1e9, minAgl = 0;
for (let i = 0; i < 400; i++) {
  const s = await C.ev(`(() => { const p = window.__game.state().player; const A = window.__game.S.player.ap; return { x: p.x, z: p.z, agl: p.agl, li: p.legIndex, tgt: A.t?.target?.alt && Math.round(A.t.target.alt), vs: A.t?.vs && +A.t.vs.toFixed(1), sep: A.sep && Math.round(A.sep.alt), fl: A._floor && Math.round(A._floor) }; })()`);
  const d = Math.hypot(s.x - 190, s.z + 260);
  if (d < min) { min = d; minAgl = s.agl; }
  if (i % 8 === 0) console.log(JSON.stringify({ ...s, d: Math.round(d) }));
  if (s.li >= 11) break;
  await C.sleep(250);
}
console.log('closest', Math.round(min), 'agl', Math.round(minAgl), 'events', JSON.stringify(await C.ev('window.__ev')));
console.log('atc log', JSON.stringify((await C.ev(`window.__game.log().filter((l) => /buzz|pp|atc/.test(l.type + (l.id||''))).slice(-10)`))));
process.exit(0);
