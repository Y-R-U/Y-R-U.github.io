const PORT=9223; const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const URL='file:///Users/aaronair/cc/yru/site/gms/3d/breachpoint2/index.html';
const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page=list.find(t=>t.type==='page');
const ws=new WebSocket(page.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map(); let errs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
  if(m.method==='Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
  if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'&&m.params.entry.source!=='intervention'&&!/vibrate/.test(m.params.entry.text)) errs.push(m.params.entry.source+': '+m.params.entry.text);};
const send=(m,p={})=>new Promise(r=>{const i=++id;pend.set(i,r);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async e=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));return r.result.result.value;};
await send('Runtime.enable');await send('Log.enable');await send('Page.enable');await send('Network.enable');

// --- 1. plain file:// load
await send('Page.navigate',{url:'about:blank'}); await sleep(300); errs=[];
await send('Page.navigate',{url:URL}); await sleep(4000);
console.log('file:// load:', JSON.stringify(await ev(`({
  protocol:location.protocol,
  sheets:document.styleSheets.length,
  sheetHref:(document.styleSheets[0]&&document.styleSheets[0].href||'').split('/').slice(-2).join('/'),
  cssRules:(()=>{try{return document.styleSheets[0].cssRules.length}catch(e){return 'BLOCKED:'+e.name}})(),
  cssApplied:getComputedStyle(document.getElementById('loadWrap')).position,
  bp2:!!window.BP2, profile:!!(window.BP2&&BP2.Profile), game:!!window.__game,
  scripts:[...document.scripts].map(s=>s.src.split('/').pop()||'(inline)'),
  moduleTags:[...document.scripts].filter(s=>s.type==='module').length,
  loadWrapHidden:document.getElementById('loadWrap').classList.contains('hidden')
})`)));
console.log('errors:', errs.length?errs:'(none)');

// --- 2. three.js blocked -> the guard must show
await send('Network.setBlockedURLs',{urls:['*three.min.js']});
await send('Page.navigate',{url:'about:blank'}); await sleep(300); errs=[];
await send('Page.navigate',{url:URL}); await sleep(2500);
console.log('THREE blocked ->', JSON.stringify(await ev(`({
  loadWrap:document.getElementById('loadWrap').textContent.trim(),
  three:!!window.THREE, bp2:!!window.BP2, profileOk:!!(window.BP2&&BP2.Profile), game:!!window.__game})`)));
console.log('errors with THREE blocked:', errs.map(e=>String(e).split('\n')[0]));
await send('Network.setBlockedURLs',{urls:[]});
ws.close();process.exit(0);
