export const PORT=9223;
export const URL='file:///Users/aaronair/cc/yru/site/gms/3d/breachpoint2/index.html';
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export async function connect(){
  const list=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page=list.find(t=>t.type==='page');
  const ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r=>ws.onopen=r);
  let id=0; const pend=new Map(); const errors=[];
  ws.onmessage=e=>{const m=JSON.parse(e.data);
   if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);return;}
   if(m.method==='Runtime.exceptionThrown')errors.push('EXC: '+(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text));
   if(m.method==='Runtime.consoleAPICalled'){const t=m.params.args.map(a=>a.value!==undefined?a.value:(a.description||a.type)).join(' ');if(m.params.type==='error')errors.push('CONSOLE: '+t);}
   if(m.method==='Log.entryAdded'&&m.params.entry.level==='error'){const x=m.params.entry;
     if(x.source!=='intervention'&&x.source!=='violation'&&!/vibrate/.test(x.text))errors.push('LOG: '+x.source+' '+x.text);}};
  const send=(method,params={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});
  const ev=async expr=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});
   if(r.result?.exceptionDetails)throw new Error(expr.slice(0,70)+' -> '+(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text));
   return r.result.result.value;};
  return {ws,send,ev,errors};
}
