// Board-in-the-real-game test (port 9502): view modes + name tags, 360×740 and 1440×900.
// Usage: node tools/board_game_test.mjs <outDir>
import { writeFileSync, mkdirSync } from 'fs';
const out = process.argv[2] || '.'; mkdirSync(out, { recursive: true });
const BASE = 'http://192.168.0.236:8888/gms/3d/gambit/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9502/json/list')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(), errors = [];
ws.addEventListener('message', e => { const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' ')); });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'EXC ' + r.result.exceptionDetails.exception?.description : r.result?.result?.value; };
const until = async (x, ms = 150000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x)) return true; await sleep(300); } return false; };
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(`${out}/${n}.png`, Buffer.from(r.result.data, 'base64')); console.log('shot', `${out}/${n}.png`); };
const click = async (x, y) => { await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }); };
const B = `document.querySelector('.board-host canvas').__board`;
const sp = sq => ev(`(()=>{const b=${B},r=document.querySelector('.board-host canvas').getBoundingClientRect(),p=b.squareToScreen('${sq}',0.3);return [r.left+p.x,r.top+p.y]})()`);
const tag = () => ev(`(()=>{const t=document.querySelector('.gb-tag.on');return t?t.textContent:null})()`);
let pass = 0, fail = 0; const check = (n, ok, i = '') => { console.log(ok ? 'PASS' : 'FAIL', n, i); ok ? pass++ : fail++; };

await send('Runtime.enable'); await send('Page.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
async function openGame(w, h, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send('Page.navigate', { url: BASE + '#/home' }); await sleep(2500);
  await ev(`localStorage.removeItem('gambit.resume'); (async()=>{const g=await import('${BASE}js/app/screens/game.js'); g.startNewGame({botId:'pip',tc:'unlimited',color:'w'}); location.hash='#/game';})()`);
  const ok = await until(`!!document.querySelector('.board-host canvas')?.__board && !document.querySelector('.board-loading')`);
  // swiftshader runs at ~0.1 fps at dpr 2, so CSS fades never advance between checks: disable them
  await ev(`(()=>{const s=document.createElement('style');s.textContent='.gb-tag{transition:none!important}';document.head.append(s)})()`);
  return ok;
}

// ---------- portrait 360×740: view modes + tap tags
check('game loads (portrait)', await openGame(360, 740, true));
await sleep(4000);
check('default view is top+locked', (await ev(`${B}.camera.view+','+${B}.camera.locked`)) === 'top,true');
const vbtn = await ev(`(()=>{const r=document.querySelector('[data-act="camera"]').getBoundingClientRect();return [r.left+r.width/2,r.top+r.height/2]})()`);
for (const want of ['top', 'tilt', 'angle', 'free']) {
  if (want !== 'top') { await click(...vbtn); await sleep(5000); }
  const v = await ev(`${B}.camera.view`), lbl = await ev(`document.querySelector('[data-act="camera"] .lbl').textContent`);
  const saved = await ev(`JSON.parse(localStorage.getItem('gambit.settings')||'{}').view||'(default top)'`);
  check(`View button -> ${want}`, v === want, `label=${lbl} saved=${saved}`);
  await shot(`game_view_${want}_360`);
}
await click(...vbtn); await sleep(4000);   // back to top
// enemy tap with nothing selected -> tag
let [x, y] = await sp('d8'); await click(x, y); await sleep(600);
check('tap enemy queen shows tag', (await tag()) === 'Queen', await tag());
await shot('game_tag_enemy_360');
[x, y] = await sp('e2'); await click(x, y); await sleep(600);
check('select own pawn shows tag + dots', (await tag()) === 'Pawn' && (await ev(`!!${B}`)), await tag());
await shot('game_tag_select_360');
[x, y] = await sp('e2'); await click(x, y); await sleep(500);
check('deselect hides tag', (await tag()) === null);
// fade after LABEL_MS
[x, y] = await sp('g8'); await click(x, y); await sleep(300);
const shown = await tag(); await sleep(4600);
check('tag fades after ~4s', shown === 'Knight' && (await tag()) === null, shown);

// ---------- desktop 1440×900: hover tag
check('game loads (desktop)', await openGame(1440, 900, false));
await sleep(4000);
[x, y] = await sp('d1');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); await sleep(150);
const early = await tag(); await sleep(700);
check('hover shows tag after ~250ms', early === null && (await tag()) === 'Queen', `early=${early} late=${await tag()}`);
await shot('game_tag_hover_1440');
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x, y: y + 300 }); await sleep(600);
check('hover tag fades on leave', (await tag()) === null);
check('no console errors', errors.length === 0, errors.join(' | '));
console.log(`${pass} passed, ${fail} failed`); ws.close(); process.exit(fail ? 1 : 0);
