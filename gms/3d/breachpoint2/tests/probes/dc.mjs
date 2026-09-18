const PORT=9223; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page=list.find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map();
ws.onmessage=ev=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);} };
const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;};
await send('Runtime.enable'); await send('Page.enable');

// original breachpoint, 10 enemies
await send('Page.navigate',{url:'file:///Users/aaronair/cc/yru/site/gms/3d/breachpoint/index.html'});
await sleep(3500);
await ev('__game.start()'); await sleep(1200);
console.log('ORIGINAL breachpoint (10 enemies):', await ev('({calls:__game.drawCalls(),tris:__game.tris(),alive:__game.Enemies.aliveCount()})'));

await send('Page.navigate',{url:'file:///Users/aaronair/cc/yru/site/gms/3d/breachpoint2/index.html'});
await sleep(3500);
for(const n of [0,1,2,4,8]){
  await ev(`__game.loadLevel(${n})`); await sleep(900);
  console.log('BP2 level '+n+':', await ev('({calls:__game.drawCalls(),tris:__game.tris(),alive:__game.Enemies.aliveCount()})'));
}
console.log('shadowmap enabled:', await ev('__game.renderer.shadowMap.enabled'));
await ev('__game.renderer.shadowMap.enabled=false'); await sleep(700);
console.log('BP2 level 8, shadows off:', await ev('({calls:__game.drawCalls()})'));
await ev('__game.renderer.shadowMap.enabled=true');
ws.close(); process.exit(0);
