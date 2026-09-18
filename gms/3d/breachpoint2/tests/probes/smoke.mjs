const PORT=9223;
const URL='file:///Users/aaronair/cc/yru/site/gms/3d/breachpoint2/index.html';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page=list.find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map(); const errors=[];
ws.onmessage=ev=>{const m=JSON.parse(ev.data);
 if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
 if(m.method==='Runtime.exceptionThrown')errors.push('EXC: '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));
 if(m.method==='Runtime.consoleAPICalled'){const t=m.params.args.map(a=>a.value!==undefined?a.value:(a.description||a.type)).join(' ');if(m.params.type==='error')errors.push('CONSOLE: '+t);}
 if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'){const e=m.params.entry;if(e.source!=='intervention'&&e.source!=='violation'&&!/vibrate/.test(e.text))errors.push('LOG: '+e.source+' '+e.text);}};
const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});
 if(r.result?.exceptionDetails)throw new Error(e.slice(0,60)+' -> '+(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text));
 return r.result.result.value;};
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');
await send('Network.setCacheDisabled',{cacheDisabled:true});
await send('Page.navigate',{url:'about:blank'});await sleep(300);errors.length=0;
await send('Page.navigate',{url:URL});await sleep(4000);
console.log('errors:',errors);
console.log(await ev(`({intro:!!window.BP2.Tutorial && BP2.Tutorial.introVisible(), state:__game.GAME.state, paint:__game.paintball(), allowed:__game.weaponAllowed(), touchMode:__game.S.touchMode, cards:document.querySelectorAll('.ccard').length})`));
ws.close();
