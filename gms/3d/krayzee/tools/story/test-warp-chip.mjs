// STORY: a refused warp tap (traffic nearby) shows why and shakes, real touch at 390x844. node tools/story/test-warp-chip.mjs
import { connect } from './cdp.mjs';
const C = await connect(9632);
await C.viewport(390, 844, true);
await C.load('http://localhost:8790/gms/3d/krayzee/?mission=2');
for (let i = 0; i < 40 && !(await C.ev(`!!document.querySelector('.krz-st-brief button[data-a="go"]')`)); i++) await C.sleep(250);
await C.sleep(800);
await C.tapSel('.krz-st-brief button[data-a="go"]');
await C.sleep(3000);
// park Rupert 150 m off the player's wing: traffic conflict
await C.ev(`(() => { const P = window.__game.S.player.ac, R = window.__krzStory.host.spawned()[0]; R.ac.place({ x: P.pos.x + 60, z: P.pos.z + 120, alt: P.pos.y, heading: P.heading, speed: P.speed, throttle: 0.6 }, window.__game.traffic.env); return 1; })()`);
await C.sleep(600);
const before = await C.ev(`(() => { const w = window.__krzStory.warp; return { level: w.level, reason: w.reason }; })()`);
await C.tapSel('.krz-warp');
await C.sleep(250);
const after = await C.ev(`(() => { const e = document.querySelector('.krz-warp'); return { text: e.innerText.replace(/\\n/g, ' | '), state: e.dataset.state, shake: e.classList.contains('no'), level: window.__krzStory.warp.level }; })()`);
await C.shot(new URL('../../docs/shots/story', import.meta.url).pathname, 'warp_refused');
console.log(JSON.stringify({ before, after }));
const ok = before.reason === 'Traffic nearby' && after.level === 1 && /1×/.test(after.text) && /Not now · traffic/.test(after.text) && after.state === 'refused' && after.shake;
console.log(ok ? 'PASS refused warp tap shows "1×  Not now · traffic" + shake' : 'FAIL refused warp tap feedback');
process.exit(ok ? 0 : 1);
