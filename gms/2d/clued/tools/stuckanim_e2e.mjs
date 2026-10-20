#!/usr/bin/env node
// A screen whose fade-in never runs must still appear: freeze page animations (CDP Animation.setPlaybackRate 0, the
// stand-in for Android Chrome's stalled timeline that left the join screen blank) and check a new screen reaches
// opacity 1 by itself.   ~/.claude/bin/cdp start --port 9512; CDP_PORT=9512 node tools/stuckanim_e2e.mjs
import { open } from './a_cdp.mjs';
const b = await open({ port: +process.env.CDP_PORT || 9512, width: 384, height: 854, mobile: true });
let fails = 0;
const ok = (c, m) => { console.log(c ? 'ok  ' : 'FAIL', m); if (!c) fails++; };
await b.goto('http://localhost:8888/gms/2d/clued/?test');
await b.waitFor(`document.body.dataset.screen === 'home'`, 20000);
await b.send('Animation.enable');
await b.send('Animation.setPlaybackRate', { playbackRate: 0 });
await b.click('[data-mode=solo]');
await b.waitFor(`document.body.dataset.screen === 'solo'`);
const op = () => b.eval(`getComputedStyle(document.querySelector('.screen:not(.leaving)')).opacity`);
const early = +(await op());
await b.sleep(1200);
const late = +(await op());
ok(early < 0.5, `frozen fade-in starts invisible (opacity ${early})`);
ok(late === 1, `screen shows anyway after the safety net (opacity ${late})`);
console.log(fails ? `${fails} FAILED` : 'all ok');
process.exit(fails ? 1 : 0);
