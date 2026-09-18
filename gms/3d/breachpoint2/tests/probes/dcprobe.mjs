const PORT=9223; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page=list.find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result.result.value;};
await send('Runtime.enable');await send('Page.enable');
await send('Page.navigate',{url:process.argv[2]||'file:///Users/aaronair/cc/yru/site/gms/3d/breachpoint2/index.html'});
await sleep(4000);
for(const lvl of [1,8]){
  await ev(`__game.loadLevel(${lvl})`);
  const s=[];
  for(const t of [100,300,600,900,1200,1800,2500,4000]){ await sleep(t- (s.length?[100,300,600,900,1200,1800,2500,4000][s.length-1]:0)); s.push(t+'ms='+await ev('__game.drawCalls()')); }
  console.log('L'+lvl, s.join('  '));
}
// repeat L8 fresh
for(let i=0;i<3;i++){ await ev('__game.loadLevel(8)'); await sleep(1200); console.log('L8 repeat', i, await ev('__game.drawCalls()'), 'visibleEnemies', await ev('__game.Enemies.list().filter(e=>e.active&&e.rig.root.visible).length')); }
ws.close();process.exit(0);
