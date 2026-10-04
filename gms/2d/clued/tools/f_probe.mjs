#!/usr/bin/env node
// Lane F debug probe: start one format and print the stage DOM summary + console. node tools/f_probe.mjs <format> [w h]
import { open } from './a_cdp.mjs';
const [fmt = 'reveal', w = 384, hgt = 854] = process.argv.slice(2);
const b = await open({ port: 9402, width: +w, height: +hgt, mobile: +w < 900 });
await b.goto('http://localhost:8888/gms/2d/clued/?test');
await b.waitFor('window.__cluedReady');
await b.eval(`window.__clued.start({ structure: 'quick', format: '${fmt}', count: 3, timer: 30 }); true`);
await b.sleep(3500);
console.log(await b.eval(`(() => { const s = document.querySelector('.stage'); return s ? s.innerHTML.slice(0, 1500) : 'no stage'; })()`));
console.log(await b.eval(`JSON.stringify(window.__clued.state().q).slice(0, 600)`));
await b.shot(process.env.SHOT || '/tmp/f_probe.png');
console.log(b.logs.join('\n'));
b.close();
