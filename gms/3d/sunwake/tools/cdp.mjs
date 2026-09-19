import {mkdir,writeFile} from 'node:fs/promises';
import {dirname} from 'node:path';
export const BASE=process.env.BASE||'http://127.0.0.1:8888/gms/3d/sunwake/';
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function connect(){
  const host=`http://127.0.0.1:${process.env.CDP_PORT||9223}`;
  const target=await(await fetch(host+'/json/new?about:blank',{method:'PUT'})).json();
  const ws=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let id=0;const pending=new Map(),listeners=new Map(),errors=[],requests=[];
  function send(method,params={},timeout=20000){return new Promise((resolve,reject)=>{const key=++id,timer=setTimeout(()=>{pending.delete(key);reject(new Error('CDP timeout: '+method));},timeout);pending.set(key,{resolve,reject,timer});ws.send(JSON.stringify({id:key,method,params}));});}
  ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id){const p=pending.get(message.id);if(p){clearTimeout(p.timer);pending.delete(message.id);message.error?p.reject(new Error(JSON.stringify(message.error))):p.resolve(message.result);}return;}
    for(const fn of listeners.get(message.method)||[])Promise.resolve(fn(message.params)).catch(e=>errors.push({kind:'harness',message:e.message}));
    const p=message.params;
    if(message.method==='Runtime.consoleAPICalled'&&(p.type==='error'||p.args?.some(a=>/shader.*(error|fail)|VALIDATE_STATUS|GL_INVALID/i.test(a.value||''))))errors.push({kind:'console',message:p.args.map(a=>a.value??a.description).join(' ')});
    if(message.method==='Runtime.exceptionThrown')errors.push({kind:'exception',message:p.exceptionDetails.exception?.description||p.exceptionDetails.text});
    if(message.method==='Log.entryAdded'&&(p.entry.level==='error'||/shader.*(error|fail)|GL_INVALID/i.test(p.entry.text)))errors.push({kind:'log',message:p.entry.text});
    if(message.method==='Network.loadingFailed')errors.push({kind:'request',message:p.errorText,url:requests.find(r=>r.id===p.requestId)?.url});
    if(message.method==='Network.responseReceived'&&p.response.status>=400)errors.push({kind:'http',message:String(p.response.status),url:p.response.url});
    if(message.method==='Network.requestWillBeSent')requests.push({id:p.requestId,url:p.request.url});
  };
  const api={send,errors,requests,on(method,fn){const list=listeners.get(method)||[];list.push(fn);listeners.set(method,list);},async eval(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;},
    async goto(url=BASE+'?test=1',metrics={width:1366,height:768,deviceScaleFactor:1,mobile:false}){await send('Page.enable');await send('Runtime.enable');await send('Log.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Emulation.setDeviceMetricsOverride',metrics);await api.eval('window.__SUNWAKE_BOOTED__=false;delete window.__SUNWAKE_FAILED__');return send('Page.navigate',{url});},
    async wait(expression,ms=20000){const start=Date.now();while(Date.now()-start<ms){try{const v=await api.eval(expression);if(v)return v;}catch{}await sleep(100);}throw new Error('Timeout waiting for '+expression);},
    async shot(path){await api.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');const r=await send('Page.captureScreenshot',{format:'png'});await mkdir(dirname(path),{recursive:true});await writeFile(path,Buffer.from(r.data,'base64'));return r.data;},
    async close(){try{await fetch(host+'/json/close/'+target.id);}finally{ws.close();for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error('CDP closed'));}pending.clear();}},
  };return api;
}
