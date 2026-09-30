#!/usr/bin/env node
// G2: frozen real reflection pixels, reversible controls and PMREM lifecycle.
// Serial Chrome sessions; never relax existing craft/fog/performance gates.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { open, parseArgs, waitFor, quiesce, settle, evalJSON, hook } from './shot.mjs';
const args = parseArgs(), lite = !!args.lite;
const out = resolve('shots/graphics-upgrade/g2-controls');
mkdirSync(out, {recursive:true});
const results = [];
function check(name, pass, detail) {
  results.push({name, pass, detail});
  writeFileSync(resolve(out, `gates${lite?'-low':''}.json`), JSON.stringify({lite, results}, null, 2));
  console.log(`${pass?'PASS':'FAIL'} ${name}: ${JSON.stringify(detail)}`);
}
const ctx = await open({w:1280,h:720,dpr:1,headed:!!args.headed});
const {S,base} = ctx;
async function cells() {
  const r = await S('Runtime.evaluate', {expression:'window.__game.probe({grid:[64,36]})',awaitPromise:true,returnByValue:true});
  const p = r.result?.value;
  if (!p?.grid?.cells?.length || p.error) throw Error('invalid pixel probe '+JSON.stringify(r));
  return p.grid.cells.flatMap(c=>c.rgb);
}
const delta = (a,b) => Math.max(...a.map((x,i)=>Math.abs(x-b[i])));
async function shot(name) {
  const {data}=await S('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  writeFileSync(resolve(out,name+(lite?'-low':'')+'.png'),Buffer.from(data,'base64'));
}
try {
  await S('Page.navigate',{url:`${base}/index.html?shot=hero_craft&nosave&nohud&noaudio&debug=1&dpr=1${lite?'&lite=1':''}`});
  await waitFor(S,'window.__ready',40000);await quiesce(S);
  await hook(S,'freezeTime',true);await hook(S,'stepVehicles',0.5);await settle(S,30);
  await hook(S,'setEnvStructure',1);await hook(S,'bakeEnv');await settle(S,12);
  const on=await cells(), statsOn=await evalJSON(S,'window.__state'), first=await hook(S,'envState');
  await shot('hero-on');
  const nullHook=await hook(S,'setEnvStructure',null), skipped=await hook(S,'envBake',false);
  await settle(S,12);const nul=await cells(), unchanged=await hook(S,'envState');
  check('unchanged signature and null skip bake',skipped===false && first.bakes===unchanged.bakes && nullHook.now===1,{first,unchanged,skipped});
  await hook(S,'setEnvStructure',0);await settle(S,12);const off=await cells();await shot('hero-off');
  const offState=await hook(S,'envState'), statsOff=await evalJSON(S,'window.__state');
  await hook(S,'setEnvStructure',1);await settle(S,12);const restored=await cells(), last=await hook(S,'envState');
  check('authored hero actual environment pixel contribution',delta(on,off)>0.005,{delta:delta(on,off)});
  check('null and restored hero pixels match',delta(on,nul)<0.0001 && delta(on,restored)<0.0001,{null:delta(on,nul),restored:delta(on,restored)});
  check('PMREM texture reused across enabled/off/restored bakes',first.texture===offState.texture && first.texture===last.texture && last.bakes===first.bakes+2,{first,offState,last});
  // Isolate craft against the high sky: no world receivers can account for
  // the next positive. Same exact toggle with fields hidden must move nothing.
  await evalJSON(S,`(()=>{const g=window.__game;g.craftSheetRelease();g.setTraffic(false);g.craftSheet(['kestrel','mammoth','nocturne'],15,1400,3);g.setCamera({pos:[0,1401,34],yaw:0,pitch:-1.4,fov:40});return true})()`);
  await quiesce(S);await settle(S,16);
  const sheetOn=await cells();await shot('craft-on');
  await hook(S,'setEnvStructure',0);await settle(S,12);const sheetOff=await cells();await shot('craft-off');
  await hook(S,'setEnvStructure',1);await settle(S,12);const sheetRestored=await cells();
  check('isolated craft reflect structured environment',delta(sheetOn,sheetOff)>0.005 && delta(sheetOn,sheetRestored)<0.0001,{delta:delta(sheetOn,sheetOff),restored:delta(sheetOn,sheetRestored)});
  await evalJSON(S,'window.__game.craftFields.setVisible(false)');await settle(S,8);const hiddenOn=await cells();
  await hook(S,'setEnvStructure',0);await settle(S,8);const hiddenOff=await cells();
  check('hidden craft null proves reflection subject',delta(hiddenOn,hiddenOff)<0.0001,{delta:delta(hiddenOn,hiddenOff)});
  await hook(S,'setEnvStructure',1);await evalJSON(S,'window.__game.craftFields.setVisible(true)');await settle(S,12);
  const pre=await cells(),preState=await hook(S,'envState');
  await hook(S,'loseContext',400);
  await waitFor(S,'!window.__state.parked && !window.__game.renderer.getContext().isContextLost()',20000);
  await settle(S,30);const post=await cells(),postState=await hook(S,'envState');
  await shot('craft-context-restored');
  check('context restore rebakes and recovers actual reflection pixels',postState.bakes>preState.bakes && delta(pre,post)<0.001,{delta:delta(pre,post),preState,postState});
  const st=await evalJSON(S,'window.__state');
  // Intentional context-loss diagnostics are expected; shader/asset/GL compile
  // failures remain blockers, and screenshots must recover real pixels.
  const errors=st.errors.filter(e=>!String(e.msg||e.message||e).includes('context lost'));
  check('same draws/tris enabled/off and no unexpected errors',statsOn.draws>0 && statsOn.draws===statsOff.draws && statsOn.tris===statsOff.tris && errors.length===0 && ctx.logs.length===0,{heroOn:{draws:statsOn.draws,tris:statsOn.tris},heroOff:{draws:statsOff.draws,tris:statsOff.tris},errors,logs:ctx.logs});
} finally {await ctx.close();}
if(results.some(r=>!r.pass)) process.exitCode=1;
