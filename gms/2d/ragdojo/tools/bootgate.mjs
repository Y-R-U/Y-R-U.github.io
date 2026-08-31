#!/usr/bin/env node
/**
 * A stale module set (new main.js, cached old music.js after a deploy) must SAY so. It used
 * to sit on "sharpening pencils..." forever with no START button, which is indistinguishable
 * from a hang and is what got reported as "broken on refresh".
 */
import { CDP } from './cdp.mjs';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
let fail=0; const ok=(n,v,x='')=>{v?0:fail++;console.log(`${v?'PASS':'FAIL'}  ${n}${x?'  '+x:''}`)};

// Serve everything normally EXCEPT music.js, which we serve as a stale version missing the
// new export — exactly the half-cached module set a deploy can leave behind.
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp3':'audio/mpeg'};
let breakIt = true;
const srv=createServer(async(req,res)=>{ let p=decodeURIComponent(req.url.split('?')[0]); if(p.endsWith('/'))p+='index.html';
  if(breakIt && p.endsWith('/js/music.js')){
    res.writeHead(200,{'content-type':'text/javascript'});
    res.end('export const MUSIC={}; export const TRACK_NAME={}; export const FIGHT_POOL=[];');  // no pickFightTrack
    return;
  }
  const f=join(ROOT,p); const st=await stat(f).catch(()=>null);
  if(!st||!st.isFile()){res.writeHead(404).end('nf');return;}
  res.writeHead(200,{'content-type':MIME[f.slice(f.lastIndexOf('.'))]||'application/octet-stream'});
  res.end(await readFile(f)); });
await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+srv.address().port;
const c=await CDP.launch();
try{
  await c.viewport(844,390,1,true);
  await c.goto(base+'/index.html');
  await c.frames(30);
  await new Promise(r=>setTimeout(r,1500));
  const st1=await c.eval(`(()=>{const b=document.getElementById('bootfail');
    return {shown:!b.classList.contains('hidden'), msg:document.getElementById('bootfailmsg').textContent,
            hasReload:!!document.getElementById('btnReload')};})()`);
  ok('a broken module set is reported, not silently hung', st1.shown, JSON.stringify(st1).slice(0,150));
  ok('a reload button is offered', st1.hasReload);

  // Healthy build must NOT show it.
  breakIt = false;
  await c.goto(base+'/index.html?x=1');
  await c.waitFor(`!document.getElementById('startBtn').classList.contains('hidden')`, 20000);
  await c.frames(10);
  const st2=await c.eval(`!document.getElementById('bootfail').classList.contains('hidden')`);
  ok('a healthy build shows no error', st2 === false);
  const started=await c.eval(`(()=>{document.getElementById('startBtn').click(); return true})()`);
  await c.frames(30);
  ok('and still boots into the game', (await c.eval('window.__state.mode')) === 'hub');
} finally { c.close(); srv.close(); }
console.log(fail?`\n${fail} fail`:'\nall pass');
process.exit(fail?1:0);
