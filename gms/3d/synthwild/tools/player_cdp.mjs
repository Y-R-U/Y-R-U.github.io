// Drives a page in headless Chrome (start it with `~/.claude/bin/cdp start --port 9313 -- --use-angle=metal`).
// node tools/player_cdp.mjs <url> <outdir> [scenario]   scenarios: touch (default), desktop, auto
import fs from 'node:fs';

const [, , rawUrl, out = '/tmp', scenario = 'touch'] = process.argv;
// ?play=1 on a fresh profile would stop at lane 5's first-run intro; tests always skip it.
const url = /[?&]play=1/.test(rawUrl) && !/[?&]nointro/.test(rawUrl) ? rawUrl + '&nointro' : rawUrl;
const PORT = +(process.env.CDP_PORT || 9313);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(tabs.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pend = new Map();
const logs = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[${m.params.type}] ` + m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') logs.push('[exception] ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  if (m.method === 'Log.entryAdded') logs.push(`[log ${m.params.entry.level}] ${m.params.entry.text} ${m.params.entry.url || ''}`);
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${out}/${name}.png`, Buffer.from(r.data, 'base64'));
  console.log('shot', name);
};

const mobile = scenario !== 'desktop';
const W = mobile ? 915 : 1280, H = mobile ? 412 : 720;
await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable');
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: mobile ? 2 : 1, mobile, screenOrientation: mobile ? { type: 'landscapePrimary', angle: 90 } : undefined });
if (mobile) { await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); }
if (scenario === 'gamepad') {
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__pad = { id: 'fake', index: 0, connected: true, mapping: 'standard', axes: [0,0,0,0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.__pad] });` });
}
await send('Page.navigate', { url });
await sleep(+(process.env.WAIT || 3500));
for (let i = 0; i < 60; i++) {
  const ok = await (async () => { try { return (await send('Runtime.evaluate', { expression: '!!(window.__game?.ctx?.player?.ready && window.__game.ctx.session.playing !== false && window.__game.ctx.world && window.__game.ctx.input.enabled && !window.__game.ctx.session.paused)', returnByValue: true })).result.value; } catch { return false; } })();
  if (ok) break;
  await sleep(500);
}
await sleep(1500);

const touch = (type, pts) => send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
const state = () => ev(`(()=>{const g=window.__game.ctx,p=g.player;return {pos:[p.pos.x,p.pos.y,p.pos.z].map(v=>+v.toFixed(3)),yaw:+p.yaw.toFixed(3),pitch:+p.pitch.toFixed(3),ground:p.onGround,fly:p.flying,crouch:p.crouching,scale:g.brush.scale,vol:!!g.brush.vol,device:g.input.device,held:g.game.inv?.held?.()?.n, fx:window.__game.fxLog?.length}})()`);

async function drag(id, x0, y0, x1, y1, steps = 10, ms = 30, hold = 0) {
  await touch('touchStart', [[x0, y0, id]]);
  for (let i = 1; i <= steps; i++) { await touch('touchMove', [[x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, id]]); await sleep(ms); }
  if (hold) await sleep(hold);
  await touch('touchEnd', []);
}

if (scenario === 'touch') {
  await shot('t0_idle');
  console.log('start', await state());
  // Hold the stick forward ~1.2 s
  await touch('touchStart', [[150, 300, 1]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[150, 300 - i * 8, 1]]); await sleep(20); }
  await sleep(600);
  await shot('t1_stick');
  await sleep(600);
  await touch('touchEnd', []);
  console.log('after stick', await state());
  // Look drag on the right half
  await drag(2, 600, 200, 700, 260, 10, 20);
  console.log('after look', await state());
  // Tap place button (right 40, bottom 122, size 68 → centre)
  const pb = await ev(`(()=>{const r=document.querySelector('[data-btn=place]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  const bb = await ev(`(()=>{const r=document.querySelector('[data-btn=break]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  const jb = await ev(`(()=>{const r=document.querySelector('[data-btn=jump]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  await ev(`window.__game.ctx.player.pitch=-0.8`);
  await sleep(100);
  const before = (await state()).held;
  await touch('touchStart', [[pb[0], pb[1], 3]]); await sleep(80); await touch('touchEnd', []);
  await sleep(150);
  console.log('after place tap', await state(), 'held before', before);
  await shot('t2_placed');
  // Hold break ~2.5 s
  await touch('touchStart', [[bb[0], bb[1], 4]]); await sleep(900); await shot('t3_breaking'); await sleep(1800); await touch('touchEnd', []);
  console.log('after break hold', await state());
  // Jump
  await touch('touchStart', [[jb[0], jb[1], 5]]); await sleep(120);
  console.log('mid jump', await state());
  await touch('touchEnd', []); await sleep(600);
  // Pinch out → scale up (survival max 1 so from 1 it stays), pinch in → scale down
  await touch('touchStart', [[560, 200, 6], [700, 200, 7]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[560 + i * 8, 200, 6], [700 - i * 8, 200, 7]]); await sleep(20); }
  await touch('touchEnd', []);
  console.log('after pinch-in', await state());
  // Crouch toggle
  const cb = await ev(`(()=>{const r=document.querySelector('[data-btn=crouch]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  await touch('touchStart', [[cb[0], cb[1], 8]]); await sleep(60); await touch('touchEnd', []); await sleep(200);
  console.log('crouch on', await state());
  await shot('t4_crouch');
  await touch('touchStart', [[cb[0], cb[1], 8]]); await sleep(60); await touch('touchEnd', []);
} else if (scenario === 'build') {
  await ev(`window.__game.ctx.player.pitch=-0.5`);
  await sleep(200);
  // Two-finger parallel drag → volume
  await touch('touchStart', [[560, 200, 1], [640, 200, 2]]);
  for (let i = 1; i <= 14; i++) { await touch('touchMove', [[560 + i * 9, 200 + i * 2, 1], [640 + i * 9, 200 + i * 2, 2]]); await sleep(30); }
  await shot('b1_volume_drag');
  await touch('touchEnd', []);
  await sleep(200);
  console.log('after 2-finger drag', await state());
  await shot('b2_volume_confirm');
  await ev(`document.querySelector('.swp-vol button[data-m=hollow]').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))`);
  await ev(`document.querySelector('.swp-vol button.ok').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}))`);
  await sleep(300);
  console.log('after confirm', await state());
  await shot('b3_after');
  // pinch out → scale up
  await touch('touchStart', [[700, 200, 6], [760, 200, 7]]);
  for (let i = 1; i <= 10; i++) { await touch('touchMove', [[700 - i * 12, 200, 6], [760 + i * 12, 200, 7]]); await sleep(20); }
  await touch('touchEnd', []);
  console.log('after pinch-out', await state());
  // double-tap jump → fly
  const jb = await ev(`(()=>{const r=document.querySelector('[data-btn=jump]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  for (let i = 0; i < 2; i++) { await touch('touchStart', [[jb[0], jb[1], 9]]); await sleep(60); await touch('touchEnd', []); await sleep(90); }
  await touch('touchStart', [[jb[0], jb[1], 9]]); await sleep(500); await touch('touchEnd', []);
  console.log('flying?', await state());
  await ev(`window.__game.ctx.settings.set('view','third')`);
  await sleep(500);
  await shot('b4_third');
} else if (scenario === 'desktop') {
  const key = (type, code, key) => send('Input.dispatchKeyEvent', { type, code, key, windowsVirtualKeyCode: { KeyW: 87, Space: 32, Digit3: 51, KeyV: 86, ShiftLeft: 16 }[code] });
  console.log('start', await state());
  await key('keyDown', 'KeyW', 'w'); await sleep(1200); await key('keyUp', 'KeyW', 'w');
  console.log('after W', await state());
  await key('keyDown', 'Space', ' '); await sleep(100);
  console.log('jump', await state()); await key('keyUp', 'Space', ' ');
  await key('keyDown', 'Digit3', '3'); await key('keyUp', 'Digit3', '3');
  await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 640, y: 360, deltaX: 0, deltaY: 100 });
  await sleep(200);
  console.log('slot3 + wheel down', await state(), await ev('window.__game.ctx.game.inv?.sel'));
  await ev(`window.__game.ctx.player.pitch=-0.6`); await sleep(300);
  await shot('d1_desktop');
  await key('keyDown', 'KeyV', 'v'); await key('keyUp', 'KeyV', 'v'); await sleep(800);
  await shot('d2_desktop_third');
} else if (scenario === 'tools') {
  const G = 'window.__game.ctx';
  const btn = async sel => ev(`(()=>{const e=document.querySelector('${sel}');if(!e||e.offsetParent===null&&getComputedStyle(e).display==='none')return null;const r=e.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  const tap = async (pt, id, hold = 70) => { await touch('touchStart', [[pt[0], pt[1], id]]); await sleep(hold); await touch('touchEnd', []); await sleep(150); };
  const info = () => ev(`(()=>{const b=${G}.brush,t=b.tools,h=t.history;return {undo:h.steps,canRedo:h.canRedo,paste:!!t.paste,clip:t.clip&&t.clip.size,held:${G}.game.inv.held()?.block,tgt:b.target?.mat,vol:!!b.vol}})()`);
  await ev(`window.__h=[];const i=${G}.input;const o=i.setHeld.bind(i);i.setHeld=(a,s,on)=>{if(a==='secondary'&&s.startsWith('touch'))__h.push([s,on,performance.now()|0]);return o(a,s,on)};${G}.bus.on('block:place',e=>__h.push(['PLACE',e.mode,e.changed]));${G}.bus.on('brush:pick',e=>__h.push(['PICK',e.mat,e.found]));['undo','redo','copy'].forEach(k=>${G}.bus.on('brush:'+k,()=>__h.push([k])));1`);
  await ev(`${G}.player.pitch=-0.7; ${G}.player.yaw=-0.6`); await sleep(300);
  const pb = await btn('[data-btn=place]');
  const tgt = await ev(`JSON.stringify(${G}.brush.placeTarget)`);
  await tap(pb, 3);
  const placedMat = await ev(`(()=>{const b=JSON.parse('${tgt}');return ${G}.world.getSub(b.min[0],b.min[1],b.min[2])})()`);
  console.log('placed', placedMat, await info());
  console.log('undo btn', await btn('[data-btn=undo]'), 'redo btn', await btn('[data-btn=redo]'));
  await tap(await btn('[data-btn=undo]'), 4);
  const afterUndo = await ev(`(()=>{const b=JSON.parse('${tgt}');return ${G}.world.getSub(b.min[0],b.min[1],b.min[2])})()`);
  console.log('after undo sub=', afterUndo, await info());
  await tap(await btn('[data-btn=redo]'), 5);
  const afterRedo = await ev(`(()=>{const b=JSON.parse('${tgt}');return ${G}.world.getSub(b.min[0],b.min[1],b.min[2])})()`);
  console.log('after redo sub=', afterRedo, await info());
  // volume → copy → paste mode
  await touch('touchStart', [[560, 200, 1], [640, 200, 2]]);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', [[560 + i * 8, 200 + i * 3, 1], [640 + i * 8, 200 + i * 3, 2]]); await sleep(30); }
  await touch('touchEnd', []); await sleep(250);
  console.log('volume', await info());
  await tap(await btn('.swp-vol button[data-id=copy]'), 6);
  console.log('after copy', await info());
  await ev(`${G}.player.yaw-=1.2`); await sleep(400);
  await shot('x1_paste_preview');
  await tap(await btn('.swp-vol button[data-id=rotate]'), 7);
  console.log('after rotate', await info());
  await sleep(200); await shot('x2_paste_rotated');
  await tap(pb, 8);
  console.log('after stamp', await info());
  await sleep(300); await shot('x3_stamped');
  await tap(await btn('.swp-vol button[data-id=no]'), 9);
  console.log('paste closed', await info());
  // eyedropper: aim at a block and hold place still
  await ev(`${G}.player.pitch=-1.0`); await sleep(300);
  const before = await info();
  await tap(pb, 10, 1000);
  console.log('eyedropper target', before.tgt, 'held before', before.held, '-> after', (await info()).held);
  // hand: block then a tool
  await ev(`${G}.settings.set('view','first')`); await ev(`${G}.player.pitch=0`); await sleep(400);
  await shot('x4_hand_block');
  await ev(`(()=>{const inv=${G}.game.inv;const it=${G}.game.items.list.find(i=>i&&i.kind==='tool'&&i.tool.type==='cutter');inv.setSlot(inv.sel,it.id,1);return it.key})()`);
  await sleep(500); await shot('x5_hand_tool');
  await ev(`(()=>{const inv=${G}.game.inv;const it=${G}.game.items.list.find(i=>i&&i.kind==='food');inv.setSlot(inv.sel,it.id,3);return it.key})()`);
  await sleep(500); await shot('x6_hand_food');
  console.log(JSON.stringify(await ev('__h')));
} else if (scenario === 'dbg') {
  const G = 'window.__game.ctx';
  const pb = await ev(`(()=>{const r=document.querySelector('[data-btn=place]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);
  console.log('pb', pb, await ev(`(()=>{const e=document.elementFromPoint(${pb[0]},${pb[1]});return e.tagName+' '+(e.closest('[data-btn]')?.dataset.btn)})()`));
  await ev(`window.__h=[];const i=${G}.input;const o=i.setHeld.bind(i);i.setHeld=(a,s,on)=>{if(a==='secondary')__h.push([s,on,performance.now()|0]);return o(a,s,on)};${G}.bus.on('block:place',e=>__h.push(['PLACE',e.changed]));1`);
  await ev(`${G}.player.pitch=-0.7`); await sleep(300);
  await touch('touchStart', [[pb[0], pb[1], 3]]); await sleep(70); await touch('touchEnd', []); await sleep(300);
  console.log(JSON.stringify(await ev('__h')));
} else if (scenario === 'gamepad') {
  const G = 'window.__game.ctx';
  const pad = js => ev(`(()=>{const p=window.__pad;${js};return 1})()`);
  const btnSet = (i, on) => pad(`p.buttons[${i}].pressed=${on};p.buttons[${i}].value=${on ? 1 : 0}`);
  const st = () => ev(`(()=>{const c=${G},p=c.player;return {dev:c.input.device,pos:p.pos.toArray().map(v=>+v.toFixed(2)),yaw:+p.yaw.toFixed(2),pitch:+p.pitch.toFixed(2),ground:p.onGround,sel:c.game.inv.sel,scale:c.brush.scale,prog:+c.brush.progress.toFixed(2),undo:c.brush.tools.history.steps,mode:c.session.mode,fly:p.flying}})()`);
  console.log('start', await st());
  await pad('p.axes[1]=-1'); await sleep(1000); await pad('p.axes[1]=0');
  console.log('L stick fwd 1s', await st());
  await pad('p.axes[2]=0.8'); await sleep(500); await pad('p.axes[2]=0;p.axes[3]=0.6'); await sleep(300); await pad('p.axes[3]=0');
  console.log('R stick look', await st());
  await btnSet(0, true); await sleep(150); const mid = await st(); await btnSet(0, false);
  console.log('A jump (mid)', mid);
  await sleep(700);
  await btnSet(5, true); await sleep(120); await btnSet(5, false); await sleep(120);
  await btnSet(5, true); await sleep(120); await btnSet(5, false); await sleep(120);
  await btnSet(4, true); await sleep(120); await btnSet(4, false); await sleep(120);
  console.log('RB RB LB -> sel 1', await st());
  await btnSet(13, true); await sleep(120); await btnSet(13, false); await sleep(150);
  console.log('dpad down scale', await st());
  await btnSet(12, true); await sleep(120); await btnSet(12, false); await sleep(150);
  await ev(`${G}.player.pitch=-1.2`); await sleep(300);
  await btnSet(7, true); await sleep(400); const mining = await st(); await sleep(2500); await btnSet(7, false);
  console.log('RT hold mining', mining, '->', await st());
  await shot('g1_gamepad');
}  else if (scenario === 'auto') {
  for (let i = 0; i < 4; i++) { await sleep(4000); console.log(await state(), await ev('JSON.stringify(window.__game.ctx.input.auto?.stats||{})')); }
  await shot('a_auto');
  await ev(`window.__game.ctx.settings.set('view','third')`);
  await sleep(1500);
  await shot('a_auto_third');
}

console.log('--- console ---\n' + logs.slice(0, 40).join('\n'));
await send('Target.closeTarget', { targetId: tabs.id }).catch(() => {});
ws.close();
process.exit(0);
