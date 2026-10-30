// Board perf pass (board-2): CPU-throttled (CDP Emulation.setCPUThrottlingRate) frame timings at a
// phone viewport for each theme and view: at rest (ambient frames only), animating (plain moves),
// battle (captures at 1x). Wraps renderer.render to time every frame (JS + GL submit on the CPU).
// Usage: CDP_PORT=9526 node tools/board_perf.mjs [themes=classic,fantasy,halloween] [views=top,angle] [rate=4] [w=360] [h=740]
const PORT = +(process.env.CDP_PORT || 9502);
const [, , themesArg = 'classic,fantasy,halloween', viewsArg = 'top,angle', rate = '4', W = '360', H = '740'] = process.argv;
const BASE = 'http://192.168.0.236:8888/gms/3d/gambit/tools/board_gallery.html';
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
const until = async (x, ms = 120000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await ev(x)) return true; await sleep(250); } return false; };
await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable'); await send('Network.clearBrowserCache'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: +W, height: +H, deviceScaleFactor: 2, mobile: true });

// instrumentation installed in the page
const INSTR = `(()=>{const b=G.boards[0],r=b.renderer,orig=r.render.bind(r);const P=window.__perf={frames:[],t:[]};
r.render=(s,c)=>{const t0=performance.now();orig(s,c);P.frames.push(performance.now()-t0);P.t.push(t0);};return 1})()`;
const window_ = async (label, body) => {
  await ev(`__perf.frames.length=0;__perf.t.length=0;window.__dc=[];1`);
  const t0 = Date.now(); await body(); const secs = (Date.now() - t0) / 1000;
  return ev(`(()=>{const f=__perf.frames.slice().sort((a,b)=>a-b),t=__perf.t;const n=f.length;const gaps=[];for(let i=1;i<t.length;i++)gaps.push(t[i]-t[i-1]);gaps.sort((a,b)=>a-b);
    const s=G.boards[0].stats();return {label:'${label}',secs:${secs.toFixed(1)},frames:n,fps:+(n/${secs}).toFixed(1),renderAvg:n?+(f.reduce((a,b)=>a+b,0)/n).toFixed(2):0,renderP95:n?+f[Math.floor(n*0.95)].toFixed(2):0,
      gapP50:gaps.length?+gaps[gaps.length>>1].toFixed(1):0,gapP95:gaps.length?+gaps[Math.floor(gaps.length*0.95)].toFixed(1):0,drawCalls:s.drawCalls,tris:s.triangles}})()`);
};
const out = [];
for (const theme of themesArg.split(',')) for (const view of viewsArg.split(',')) {
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await send('Page.navigate', { url: `${BASE}?theme=${theme}&mode=play&view=${view}` });
  await until('window.G && G.boards.length===1 && G.chess');
  await sleep(2500);
  await ev(INSTR);
  await send('Emulation.setCPUThrottlingRate', { rate: +rate });
  await sleep(500);
  const rest = await window_('rest', () => sleep(3000));
  const moves = await window_('animating', async () => {
    await ev(`(async()=>{const b=G.boards[0],c=G.chess;for(const m of ['e4','e5','Nf3','Nc6','Bb5','a6']){const v=c.move(m);await b.applyMove(v,{battle:false});}return 1})()`);
  });
  const battle = await window_('battle', async () => {
    await ev(`(async()=>{const b=G.boards[0],c=G.chess;for(const m of ['Bxc6','dxc6']){const v=c.move(m);await b.applyMove(v,{battle:true});}return 1})()`);
  });
  for (const r of [rest, moves, battle]) { const row = { theme, view, ...r }; out.push(row); console.log(JSON.stringify(row)); }
}
await send('Emulation.setCPUThrottlingRate', { rate: 1 });
console.log(errors.length ? 'CONSOLE:\n' + errors.join('\n') : 'console clean');
ws.close(); process.exit(0);
