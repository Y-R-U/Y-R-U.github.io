// board-2 feature test over CDP: ambient (idle flicker) frame cap, ambientAnim off, hidden tab,
// resume; env.update hook; gallery ?anim= forcing; per-type facing. Usage: CDP_PORT=9526 node tools/board_ambient_test.mjs
const PORT = +(process.env.CDP_PORT || 9502);
const BASE = 'http://192.168.0.236:8888/gms/3d/gambit/';
const G = BASE + 'tools/board_gallery.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const pend = new Map(), errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); return r.result?.exceptionDetails ? 'EXC ' + r.result.exceptionDetails.exception?.description : r.result?.result?.value; };
const until = async (x, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
let pass = 0, fail = 0;
const check = (n, ok, i = '') => { console.log(ok ? 'PASS' : 'FAIL', n, i); ok ? pass++ : fail++; };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.clearBrowserCache'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 760, deviceScaleFactor: 1, mobile: false });
const open = async q => { await send('Page.navigate', { url: G + q }); await until('window.G && G.boards.length===1 && G.chess && G.theme'); await sleep(1500);
  await ev(`(()=>{const r=G.boards[0].renderer,o=r.render.bind(r);window.__n=0;r.render=(s,c)=>{__n++;o(s,c)};return 1})()`); };
const framesIn = async ms => { await ev('__n=0'); await sleep(ms); return ev('__n'); };

// 1) Halloween at rest renders at the ambient cap (glow flicker), Classic not at all
await open('?theme=halloween&mode=play&view=top');
let n = await framesIn(2000);
check('halloween rest: ambient frames at ~20-24 fps', n >= 30 && n <= 52, `${n} frames / 2 s`);
const t1 = await ev(`(async()=>(await import('${BASE}js/themes/kit.js')).ambient.time.value)()`);
await ev(`G.boards[0].setOptions({ambientAnim:false})`); await sleep(200);
n = await framesIn(1500);
check('ambientAnim off: no idle frames', n <= 1, `${n}`);
await ev(`G.boards[0].setOptions({ambientAnim:true})`);
n = await framesIn(1000);
check('ambientAnim on again: frames resume', n >= 12, `${n}`);
// hidden tab: stub document.hidden and fire visibilitychange
await ev(`Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));1`);
await sleep(200);
n = await framesIn(1500);
check('hidden tab: ambient stops', n <= 1, `${n}`);
await ev(`delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));1`);
n = await framesIn(1000);
check('visible again: ambient resumes', n >= 12, `${n}`);
check('ambient clock advances', typeof t1 === 'number' && t1 > 0, `${t1}`);

// 2) env.update hook: only while the environment is visible (tilted), respecting ambientAnim
await ev(`(()=>{window.__eu=0;const k=G.theme.board;window.__origEnv=k.environment;k.environment=(T,kit,o)=>{const e=__origEnv(T,kit,o);e.update=(dt,t)=>{__eu++;};return e;};return G.boards[0].setTheme('halloween').then(()=>1)})()`);
await sleep(500); await ev('__eu=0');
await sleep(1200);
const euTop = await ev('__eu');
await ev(`G.boards[0].camera.preset('angle')`); await sleep(2500); await ev('__eu=0'); await sleep(1500);
const euAngle = await ev('__eu');
await ev(`G.boards[0].setOptions({ambientAnim:false})`); await sleep(200); await ev('__eu=0'); await sleep(1000);
const euOff = await ev('__eu');
check('env.update: not called in Top view', euTop === 0, `${euTop}`);
check('env.update: called at the frame cap when tilted', euAngle >= 20 && euAngle <= 40, `${euAngle} / 1.5 s`);
check('env.update: stops with ambientAnim off', euOff === 0, `${euOff}`);
await ev(`G.theme.board.environment=__origEnv;G.boards[0].setOptions({ambientAnim:true});1`);

await open('?theme=classic&mode=play&view=top');
n = await framesIn(1500);
check('classic rest: no idle frames (nothing opts in)', n <= 1, `${n}`);

// 3) ?anim= forces a labelled move anim
await open('?theme=classic&mode=play&view=top&anim=spin%20hop');
await ev(`(()=>{window.__used=[];G.theme.moveAnims=G.theme.moveAnims.map(f=>Object.assign(c=>{__used.push(f.label);return f(c)},{only:f.only,weight:f.weight,label:f.label}));return 1})()`);
await ev(`(async()=>{const b=G.boards[0],c=G.chess;for(const m of ['e4','e5','d4','d5','c4']){await b.applyMove(c.move(m),{battle:false});}return 1})()`);
const used = await ev('__used');
check('?anim=spin hop forces it', used.length === 5 && used.every(l => l === 'spin hop'), JSON.stringify(used));

// 4) per-type facing
const fy = await ev(`(async()=>{const {facingYaw}=await import('${BASE}js/board/pieces.js');const f={byType:{p:'player',b:'opponent',q:0.5,k:{w:1,b:2}}};
  return [facingYaw(undefined,'w','n'),facingYaw(f,'w','p'),facingYaw(f,'b','p'),facingYaw(f,'w','b'),facingYaw(f,'b','q'),facingYaw(f,'b','k'),facingYaw({w:0.3},'w','n')].map(x=>+x.toFixed(3))})()`);
check('facingYaw: default/player/opponent/offset/abs/legacy', JSON.stringify(fy) === JSON.stringify([1.571, 3.142, 0, 0, -1.071, 2, 0.3]), JSON.stringify(fy));

check('no console errors', errors.length === 0, errors.join(' | '));
console.log(`${pass} passed, ${fail} failed`);
ws.close(); process.exit(fail ? 1 : 0);
