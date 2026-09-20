import assert from 'node:assert/strict';
import {writeFile,mkdir,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {connect,BASE,sleep} from './cdp.mjs';
import {sampleWave} from '../js/core/waves.mjs';
import {LANDMARKS,BOAT_RADIUS} from '../js/core/world.mjs';
const evidence=fileURLToPath(new URL('../docs/evidence/',import.meta.url));await mkdir(evidence,{recursive:true});
const suite=process.argv.includes('--suite')?process.argv[process.argv.indexOf('--suite')+1]:'all';
const report={date:new Date().toISOString(),suite,tests:[]};
async function scenario(name,fn){const p=await connect();try{const result=await fn(p);report.tests.push({name,...result});console.log('PASS',name);}finally{await p.close();}}
async function boot(p){await p.goto();await p.wait('window.__SUNWAKE_BOOTED__ || window.__SUNWAKE_FAILED__');assert.equal(await p.eval('window.__SUNWAKE_BOOTED__'),true,await p.eval('window.__SUNWAKE_FAILED__'));report.browser=await p.send('Browser.getVersion');report.graphics=await p.eval(`(()=>{const gl=document.getElementById('sea').getContext('webgl2'),info=gl.getExtension('WEBGL_debug_renderer_info');return {renderer:gl.getParameter(info?info.UNMASKED_RENDERER_WEBGL:gl.RENDERER),vendor:gl.getParameter(info?info.UNMASKED_VENDOR_WEBGL:gl.VENDOR)}})()`);}
async function click(p,id){const rect=await p.eval(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);await p.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...rect});await p.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...rect});}
function clean(p){assert.deepEqual(p.errors,[],'Browser errors');assert.ok(p.requests.filter(r=>r.url.startsWith('http')).every(r=>r.url.startsWith(new URL(BASE).origin)),'External request');}
async function compareImages(p,first,second){return p.eval(`(async()=>{
  const images=await Promise.all([${JSON.stringify(first)},${JSON.stringify(second)}].map(async data=>createImageBitmap(await(await fetch('data:image/png;base64,'+data)).blob())));
  const canvas=document.createElement('canvas');canvas.width=images[0].width;canvas.height=images[0].height;const context=canvas.getContext('2d');
  const pixels=images.map(image=>{context.drawImage(image,0,0);return context.getImageData(0,0,canvas.width,canvas.height).data});
  let sum=0,changed=0,max=0;for(let i=0;i<pixels[0].length;i++){const difference=Math.abs(pixels[0][i]-pixels[1][i]);sum+=difference;max=Math.max(max,difference);if(difference>8)changed++;}
  images.forEach(image=>image.close());return {meanChannelDifference:sum/pixels[0].length,fractionOver8:changed/pixels[0].length,max};})()`);}
try{
if(['all','shell'].includes(suite)){
  await scenario('boot, real click, pause, resume',async p=>{await boot(p);await p.shot(evidence+'m3-water-title.png');await click(p,'start');assert.equal(await p.eval('sunwake.mode'),'water');await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await p.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});const t=await p.eval('sunwake.time');assert.ok(t>=0);await sleep(150);assert.equal(await p.eval('sunwake.time'),t);assert.equal(await p.eval('sunwake.mode'),'paused');await click(p,'resume');await p.shot(evidence+'m3-water-shell-regression.png');clean(p);return {snapshot:await p.eval('sunwake'),errors:p.errors};});
  for(const fault of ['module-network','module-parse','stylesheet','webgl2','shader'])await scenario('readable failure: '+fault,async p=>{
    if(fault==='webgl2')await p.send('Page.addScriptToEvaluateOnNewDocument',{source:`const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl2'?null:original.call(this,type,...args)};`});
    else {await p.send('Fetch.enable',{patterns:[{urlPattern:fault==='stylesheet'?'*sunwake/style.css':fault==='shader'?'*sunwake/js/render/shaders.mjs':'*sunwake/js/main.mjs',requestStage:'Request'}]});p.on('Fetch.requestPaused',async e=>{if(fault==='shader'){const source=await readFile(new URL('../js/render/shaders.mjs',import.meta.url),'utf8');await p.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from(source.replace('return result;', 'result.x = SUNWAKE_INTENTIONAL_SHADER_FAILURE; return result;')).toString('base64')});}else if(fault==='module-parse')await p.send('Fetch.fulfillRequest',{requestId:e.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'text/javascript'}],body:Buffer.from('export const = broken syntax;').toString('base64')});else await p.send('Fetch.failRequest',{requestId:e.requestId,errorReason:'Failed'});});}
    await p.goto();await p.wait('window.__SUNWAKE_FAILED__');assert.equal(await p.eval('window.__SUNWAKE_BOOTED__'),false);const message=await p.eval('document.getElementById("boot-detail").textContent');assert.match(message,fault==='webgl2'?/WebGL2/:fault==='shader'?/Shader compilation failed/:fault==='module-parse'?/SyntaxError|Unexpected/:/failed to load/);assert.equal(await p.eval('document.getElementById("reload").hidden'),false);assert.ok(p.errors.length>0,'fault diagnostics collected');const allowed=fault==='webgl2'?/WebGL2/:fault==='shader'?/shader|GL_INVALID|VALIDATE_STATUS/i:fault==='module-parse'?/SyntaxError|Unexpected/:/ERR_FAILED/;assert.ok(p.errors.every(e=>allowed.test(e.message)),JSON.stringify(p.errors));await p.shot(evidence+'m1-failure-'+fault+'.png');return {expectedFailure:true,message,capturedErrors:p.errors};
  });
}
if(suite==='c1')await scenario('C1 far-water visual fixtures',async p=>{await boot(p);const snapshots=[];for(const tier of ['standard','low'])for(const [heading,yaw]of [['east',Math.PI/2],['west',-Math.PI/2]]){await p.eval(`sunwakeTest.setQuality('${tier}');sunwakeTest.setView({time:5,yaw:${yaw},near:false,x:0,z:0})`);await p.shot(evidence+`c1-${tier}-${heading}-t5.png`);snapshots.push(await p.eval('sunwake'));}clean(p);return {snapshots,errors:p.errors};});
if(['all','water','preview'].includes(suite)){
  await scenario('water rendering and CPU/GPU agreement',async p=>{
    await boot(p);const probes=[],snapshots=[],rebases=[];
    for(const [x,z]of [[0,0],[1e7,-1e7]])for(const time of [0,2,5,10]){const result=await p.eval(`sunwakeTest.probeWaves(${x},${z},${time})`);assert.ok(result.passed,JSON.stringify(result));probes.push(result);}
    await p.eval('sunwakeTest.setView({time:5,yaw:-Math.PI/2})');await p.shot(evidence+'m3-water-preview-west.png');
    await p.eval('sunwakeTest.setView({time:5,yaw:Math.PI/2})');await p.shot(evidence+'m3-water-preview-east.png');
    await p.eval('sunwakeTest.setView({time:5,yaw:0,near:false})');await p.shot(evidence+'m3-water-preview-north.png');
    if(suite!=='preview'){
      for(const tier of ['standard','low']){await p.eval(`sunwakeTest.setQuality('${tier}')`);
        for(const [heading,yaw]of [['west',-Math.PI/2],['east',Math.PI/2]])for(const time of [0,2,5,10]){
          const snapshot=await p.eval(`sunwakeTest.setView({time:${time},yaw:${yaw},near:false,x:0,z:0})`);assert.ok(Math.abs(snapshot.referenceHeight-snapshot.y)<1e-10,'Launch uses physics Y');snapshots.push(snapshot);await p.shot(evidence+`m3-water-${tier}-${heading}-t${time}.png`);
        }
        await p.eval('sunwakeTest.setView({time:5,yaw:-Math.PI/2,near:true})');await p.shot(evidence+`m3-water-${tier}-near.png`);
        await p.eval('sunwakeTest.setView({time:5,yaw:0,near:false})');await p.shot(evidence+`m3-water-${tier}-north.png`);
      }
      await p.eval("sunwakeTest.setQuality('high');sunwakeTest.setView({time:5,yaw:-Math.PI/2,near:false})");await p.shot(evidence+'m3-water-high-west.png');assert.equal(await p.eval('sunwake.waterTriangles'),98048);
      await p.eval("sunwakeTest.setQuality('standard');sunwakeTest.setView({time:5,yaw:-Math.PI/2,x:255.9,z:0});sunwakeTest.setOrigin(0,0)");const before=await p.shot(evidence+'m3-water-rebase-before.png');
      await p.eval('sunwakeTest.setOrigin(256,0)');const after=await p.shot(evidence+'m3-water-rebase-after.png');const difference=await compareImages(p,before,after);assert.ok(difference.meanChannelDifference<.3&&difference.fractionOver8<.002,JSON.stringify(difference));rebases.push(difference);const repeated=await p.shot(evidence+'m3-water-rebase-repeat.png');const stability=await compareImages(p,after,repeated);assert.equal(stability.max,0,'Frozen scene must be pixel-stable');rebases.push({frozenStability:stability});
      await p.eval('sunwakeTest.setView({time:5,yaw:-Math.PI/2,x:1e7,z:-1e7})');await p.shot(evidence+'m3-water-distant-origin.png');
      for(const [width,height]of [[390,844],[844,390],[360,800]]){
        await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:3,mobile:true});await p.send('Emulation.setCPUThrottlingRate',{rate:4});
        await p.eval("sunwakeTest.setQuality('low');sunwakeTest.setView({time:5,x:0,z:0,yaw:-Math.PI/2,near:false})");await p.shot(evidence+`m3-water-mobile-${width}x${height}.png`);
        assert.ok(await p.eval('document.documentElement.scrollWidth<=innerWidth'),'no horizontal overflow');
        const point=await p.eval('(()=>{const r=document.getElementById("turn").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
        await p.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,...point}]});await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.wait('sunwake.yaw>0');
        const s=await p.eval('sunwake');snapshots.push({...s,emulation:{width,height,deviceScaleFactor:3,cpuThrottle:4}});
      }
      await p.send('Emulation.setCPUThrottlingRate',{rate:1});
    }
    clean(p);return {probes,rebases,snapshots,snapshot:await p.eval('sunwake'),errors:p.errors};
  });
}

if(['all','handling'].includes(suite)){
  const CODES={KeyW:['w',87],KeyS:['s',83],KeyA:['a',65],KeyD:['d',68],ArrowUp:['ArrowUp',38],ArrowDown:['ArrowDown',40],ArrowLeft:['ArrowLeft',37],ArrowRight:['ArrowRight',39]};
  await scenario('handling: real keyboard, split helm touch, camera comfort',async p=>{
    const held=new Set(),touches=[];
    const key=(type,code)=>p.send('Input.dispatchKeyEvent',{type,code,key:CODES[code][0],windowsVirtualKeyCode:CODES[code][1],nativeVirtualKeyCode:CODES[code][1]});
    const press=async(...codes)=>{for(const c of codes){held.add(c);await key('rawKeyDown',c);}};
    const release=async(...codes)=>{for(const c of codes.length?codes:[...held]){held.delete(c);await key('keyUp',c);}};
    // Pointer moves are coalesced onto rAF, so every dispatch waits two frames
    // before the helm is read. Without this a touchMove silently does nothing.
    const settle=()=>p.eval('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const touch=async type=>{await p.send('Input.dispatchTouchEvent',{type,touchPoints:touches.map(t=>({id:t.id,x:t.x,y:t.y}))});await settle();};
    // CDP touchEnd names the points being lifted, not the ones left behind.
    const lift=async id=>{const i=touches.findIndex(t=>t.id===id),[t]=touches.splice(i,1);await p.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{id:t.id,x:t.x,y:t.y}]});await settle();};
    const rect=id=>p.eval(`(()=>{const r=document.getElementById('${id}').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2}})()`);
    const reset=async()=>{await p.eval('sunwakeTest.setPose({})');};
    const advance=n=>p.eval(`sunwakeTest.advance(${n})`);
    const speed=s=>s.vx*Math.sin(s.yaw)+s.vz*Math.cos(s.yaw);
    const wave={},clearance=s=>{sampleWave(s.cameraAbsolute[0],s.cameraAbsolute[2],s.time,wave);return s.cameraAbsolute[1]-wave.height;};
    const results={};
    await boot(p);await click(p,'start');assert.equal(await p.eval('sunwake.mode'),'water');

    // --- keyboard, landscape ---
    await reset();await press('KeyW');
    assert.deepEqual((await p.eval('sunwake.input')).throttle,1,'W ahead');
    let s=await advance(1800);results.keyboardAhead=speed(s);
    assert.ok(results.keyboardAhead>=7.5&&results.keyboardAhead<=8.5,`ahead ${results.keyboardAhead}`);
    assert.ok(clearance(s)>=2-1e-9,'camera stays 2 m above the local surface');
    await press('KeyD');s=await advance(1800);results.keyboardTurn=s.yawRate;results.turnRoll=s.roll;results.turnCameraRoll=s.cameraRoll;
    assert.ok(s.yawRate>=.38&&s.yawRate<=.48,`turn ${s.yawRate}`);
    assert.ok(Math.abs(s.cameraRoll)<=.12*18*Math.PI/180+1e-9&&Math.abs(s.cameraRoll)>1e-4,`A3 camera roll ${s.cameraRoll}`);
    await press('KeyA');assert.equal((await p.eval('sunwake.input')).steer,0,'opposite steer keys cancel');
    await release('KeyD');s=await advance(600);assert.ok(s.yawRate<-.2,'port rudder turns to port');
    await release();await reset();await press('ArrowUp','ArrowRight');
    let input=await p.eval('sunwake.input');assert.equal(input.throttle,1);assert.equal(input.steer,1);
    await release();await reset();await press('KeyS');s=await advance(1800);results.keyboardAstern=speed(s);
    assert.ok(results.keyboardAstern>=-2.4&&results.keyboardAstern<=-1.8,`astern ${results.keyboardAstern}`);
    await press('KeyD');s=await advance(600);results.reverseSteering=s.yawRate;
    assert.ok(s.yawRate<0,'reverse steering flips with travel direction');
    await release();input=await p.eval('sunwake.input');assert.equal(input.throttle,0);assert.equal(input.steer,0);
    await p.eval("sunwakeTest.setReducedMotion(true)");s=await advance(120);assert.ok(Math.abs(s.cameraRoll)<1e-9,'reduced motion zeroes camera roll');
    await p.eval("sunwakeTest.setReducedMotion(false)");
    await reset();await press('KeyW');await advance(900);await p.shot(evidence+'m3-handling-keyboard.png');await release();

    // --- split helm touch, landscape then portrait ---
    // The VISIBLE helm is no longer the default, so select it: this scenario is
    // the visible split helm's regression and must keep testing that scheme.
    // The invisible dual-zone helm has its own suite in tools/helm.mjs.
    await p.eval(`document.getElementById('helm-mode').value='visible';document.getElementById('helm-mode').dispatchEvent(new Event('change'))`);
    assert.equal(await p.eval('sunwake.helm.scheme'),'visible');
    for(const [width,height,label] of [[844,390,'landscape'],[390,844,'portrait']]){
      await p.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:3,mobile:true});
      await p.send('Emulation.setCPUThrottlingRate',{rate:4});
      await reset();
      assert.equal(await p.eval("document.getElementById('helm').hidden"),false,'helm visible while sailing');
      assert.ok(await p.eval('document.documentElement.scrollWidth<=innerWidth'),'no horizontal overflow');
      const helm=await rect('rudder'),ahead=await rect('ahead'),astern=await rect('astern');
      for(const [name,r] of [['rudder',helm],['ahead',ahead],['astern',astern]]){
        assert.ok(r.width>=48&&r.height>=48,`${name} target ${r.width}x${r.height}`);
        assert.ok(r.x>=0&&r.y>=0&&r.x+r.width<=width+1&&r.y+r.height<=height+1,`${name} inside the ${label} viewport`);
      }
      touches.length=0;touches.push({id:1,x:ahead.cx,y:ahead.cy});await touch('touchStart');
      touches.push({id:2,x:helm.cx+34,y:helm.cy});await touch('touchStart');
      input=await p.eval('sunwake.input');
      assert.equal(input.throttle,1,'AHEAD held');assert.ok(input.steer>.5&&input.steer<=1,`rudder ${input.steer}`);
      assert.equal(await p.eval('sunwake.inputDevice'),'pointer');
      s=await advance(900);assert.ok(speed(s)>5&&s.yawRate>.2,`${label} touch sailing ${speed(s)} ${s.yawRate}`);
      assert.ok(clearance(s)>=2-1e-9,'camera stays 2 m above the local surface');
      results['touch-'+label]={speed:speed(s),yawRate:s.yawRate,cameraRoll:s.cameraRoll,
        followDistance:Math.hypot(s.cameraAbsolute[0]-s.x,s.cameraAbsolute[2]-s.z)};
      await p.shot(evidence+`m3-handling-touch-${label}.png`);
      touches[1].x=helm.cx-34;await touch('touchMove');
      assert.ok((await p.eval('sunwake.input')).steer<-.5,'rudder follows the pointer to port');
      touches[1].x=helm.cx+2;await touch('touchMove');
      assert.equal((await p.eval('sunwake.input')).steer,0,'8% dead zone at the centre');
      touches[1].x=helm.cx+34;touches[1].y=Math.min(height-2,helm.cy+70);await touch('touchMove');
      assert.ok((await p.eval('sunwake.input')).steer>.5,'vertical travel does not steer');
      // Release the rudder well outside its own button.
      touches[1].x=Math.round(width/2);touches[1].y=6;await touch('touchMove');
      await lift(2);
      input=await p.eval('sunwake.input');assert.equal(input.steer,0,'releasing off-button returns to neutral');assert.equal(input.throttle,1,'the other helm pointer survives');
      touches.push({id:3,x:astern.cx,y:astern.cy});await touch('touchStart');
      assert.equal((await p.eval('sunwake.input')).throttle,0,'simultaneous AHEAD and ASTERN cancel');
      await lift(3);await lift(1);
      input=await p.eval('sunwake.input');assert.equal(input.throttle,0);assert.equal(input.steer,0);
      // A lost pointer must not leave the helm stuck on.
      touches.push({id:4,x:ahead.cx,y:ahead.cy});await touch('touchStart');
      assert.equal((await p.eval('sunwake.input')).throttle,1);
      await p.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});touches.length=0;await settle();
      assert.equal((await p.eval('sunwake.input')).throttle,0,'pointercancel clears the helm');
      assert.equal(await p.eval("document.getElementById('ahead').classList.contains('held')"),false,'cancelled pointer releases the button state');
      await p.send('Emulation.setCPUThrottlingRate',{rate:1});
    }
    clean(p);return {results,snapshot:await p.eval('sunwake'),errors:p.errors};
  });
}


// D1/D2 visual fixtures: island silhouette and the island/water horizon fade.
if(suite==='shape')await scenario('D1 island silhouette and D2 horizon fade',async p=>{
  const shots=[],view=async(name,pose)=>{await p.eval(`sunwakeTest.setPose(${JSON.stringify(pose)})`);await p.shot(evidence+'d1-'+name+'.png');shots.push({name,pose,snapshot:await p.eval('sunwake')});};
  await boot(p);await click(p,'start');
  const key=LANDMARKS[0];
  await view('contact',{x:key.x+key.radius+BOAT_RADIUS+.05,z:key.z,yaw:-Math.PI/2});
  await view('near',{x:key.x+70,z:key.z+18,yaw:-Math.PI/2-.2});
  await view('approach',{x:key.x+110,z:key.z+20,yaw:-Math.PI/2-.18});
  await view('far',{x:key.x+430,z:key.z+120,yaw:-Math.PI/2-.26});
  await view('horizon',{x:key.x+900,z:key.z+220,yaw:-Math.PI/2-.23});
  await view('split-crown',{x:LANDMARKS[2].x+150,z:LANDMARKS[2].z+70,yaw:-Math.PI/2-.55});
  await view('needle',{x:LANDMARKS[4].x+120,z:LANDMARKS[4].z+55,yaw:-Math.PI/2-.42});
  await view('orchard',{x:LANDMARKS[5].x+160,z:LANDMARKS[5].z+60,yaw:-Math.PI/2-.45});
  await view('cinder',{x:LANDMARKS[3].x+130,z:LANDMARKS[3].z-60,yaw:-Math.PI/2+.42});
  await view('bells',{x:LANDMARKS[1].x+120,z:LANDMARKS[1].z+40,yaw:-Math.PI/2-.30});
  clean(p);return {shots,errors:p.errors};
});
if(['all','islands'].includes(suite)){
  const CODES={KeyW:['w',87],KeyD:['d',68]};
  await scenario('islands: solid shore, shore foam, camera obstruction',async p=>{
    const key=LANDMARKS[0],hard=key.radius+BOAT_RADIUS,results={};
    const advance=n=>p.eval(`sunwakeTest.advance(${n})`);
    const gap=s=>Math.min(...LANDMARKS.map(i=>Math.hypot(s.x-i.x,s.z-i.z)-i.radius-BOAT_RADIUS));
    const renderGap=()=>p.eval(`(()=>{const s=sunwake,L=${JSON.stringify(LANDMARKS.map(i=>[i.x,i.z,i.radius]))};
      return Math.min(...L.map(([x,z,r])=>Math.hypot(s.x-x,s.z-z)-r-${BOAT_RADIUS}));})()`);
    await boot(p);await click(p,'start');
    // M5: islands stream, so wait for the launch neighbourhood to be built.
    for(let i=0;i<40;i++)await p.eval('sunwakeTest.advance(1)');
    assert.ok((await p.eval('sunwake')).islands>0,'no island meshes were streamed in');
    // Real keyboard, straight at the shore, then held there.
    await p.eval(`sunwakeTest.setPose({x:${key.x+140},z:${key.z},yaw:-Math.PI/2})`);
    await p.send('Input.dispatchKeyEvent',{type:'rawKeyDown',code:'KeyW',key:'w',windowsVirtualKeyCode:87,nativeVirtualKeyCode:87});
    let worst=Infinity;
    for(let i=0;i<24;i++){const s=await advance(120);worst=Math.min(worst,gap(s),await renderGap());}
    const stopped=await p.eval('sunwake');
    results.headOnGap=gap(stopped);results.worstGapDuringApproach=worst;results.shoreDistance=stopped.shoreDistance;
    assert.ok(worst>=-1e-6,`boat entered a shore, worst clearance ${worst}`);
    assert.ok(Math.abs(stopped.shoreDistance-BOAT_RADIUS)<.01,`held off the wall at ${stopped.shoreDistance} m`);
    assert.ok(stopped.shoreUniforms>=1,'shore circles were not uploaded to the water shader');
    await p.shot(evidence+'m4-shore-contact.png');
    // Grind along the wall under full rudder.
    await p.send('Input.dispatchKeyEvent',{type:'rawKeyDown',code:'KeyD',key:'d',windowsVirtualKeyCode:68,nativeVirtualKeyCode:68});
    for(let i=0;i<20;i++){const s=await advance(120);worst=Math.min(worst,gap(s),await renderGap());}
    results.worstGapGrinding=worst;
    assert.ok(worst>=-1e-6,`grinding entered a shore, worst clearance ${worst}`);
    await p.shot(evidence+'m4-shore-grind.png');
    for(const code of ['KeyW','KeyD'])await p.send('Input.dispatchKeyEvent',{type:'keyUp',code,key:CODES[code][0],windowsVirtualKeyCode:CODES[code][1],nativeVirtualKeyCode:CODES[code][1]});
    // Camera obstruction: sit against the shore facing away, so the unblocked
    // chase seat would be 10.5 m inside the stone.
    await p.eval(`sunwakeTest.setPose({x:${key.x+hard+.05},z:${key.z},yaw:Math.PI/2})`);
    const blocked=await advance(90);
    results.cameraReach=blocked.cameraReach;
    results.cameraInsideShore=Math.hypot(blocked.cameraAbsolute[0]-key.x,blocked.cameraAbsolute[2]-key.z)-key.radius;
    assert.ok(blocked.cameraReach<1,`camera obstruction never engaged (reach ${blocked.cameraReach})`);
    assert.ok(results.cameraInsideShore>0,`camera is ${-results.cameraInsideShore} m inside the island wall`);
    await p.shot(evidence+'m4-camera-obstruction.png');
    // …and it eases back out once clear.
    await p.eval(`sunwakeTest.setPose({x:${key.x+200},z:${key.z},yaw:Math.PI/2})`);
    const freed=await advance(240);assert.ok(freed.cameraReach>.99,`camera never eased out (${freed.cameraReach})`);
    // Approach and wide shots for the record.
    await p.eval(`sunwakeTest.setPose({x:${key.x+110},z:${key.z+20},yaw:-Math.PI/2-.18})`);await p.shot(evidence+'m4-approach.png');
    await p.eval(`sunwakeTest.setPose({x:${key.x+120},z:${key.z+95},yaw:-Math.PI/2-.9})`);await p.shot(evidence+'m4-wide.png');
    await p.eval(`sunwakeTest.setPose({x:${LANDMARKS[2].x+150},z:${LANDMARKS[2].z+70},yaw:-Math.PI/2-.55})`);await p.shot(evidence+'m4-split-crown.png');
    await p.eval(`sunwakeTest.setPose({x:${LANDMARKS[5].x+160},z:${LANDMARKS[5].z+60},yaw:-Math.PI/2-.45})`);await p.shot(evidence+'m4-last-orchard.png');
    clean(p);return {results,snapshot:await p.eval('sunwake'),errors:p.errors};
  });
}


if(['all','stream'].includes(suite)){
  await scenario('M5: streaming archipelago, LOD, bounded memory, shape containment',async p=>{
    const results={samples:[]};
    const settle=async n=>{for(let i=0;i<n;i++)await p.eval('sunwakeTest.advance(1)');};
    await boot(p);await click(p,'start');
    // A long sailed route, sampled every kilometre. Streaming must converge each
    // time and memory must not drift upward over 20 km.
    let peakIslands=0,peakTriangles=0,peakGeometries=0,peakDraws=0,worstBuild=0;
    for(let leg=0;leg<21;leg++){
      const angle=leg*.62,reach=leg*1000;
      const x=Math.cos(angle)*reach,z=Math.sin(angle)*reach;
      await p.eval(`sunwakeTest.setPose({x:${x},z:${z},yaw:${-Math.PI/2+angle}})`);
      await settle(30);
      const snapshot=await p.eval('sunwake'),stream=await p.eval('sunwakeTest.streamStats()');
      const audit=await p.eval('sunwakeTest.islandAudit()');
      for(const island of audit){
        assert.ok(island.aboveWater<=island.radius+1e-3,
          `${island.id}: rock reaches ${island.aboveWater} m, outside its ${island.radius} m collision circle`);
        assert.ok(island.anywhere<=island.radius+4+1e-3,`${island.id}: apron reaches ${island.anywhere} m`);
        assert.ok(island.lowest<=-1.99&&island.highest>=1.6,`${island.id}: wall does not span the sea state`);
      }
      assert.ok(stream.pending===0,`streaming did not converge at leg ${leg} (${stream.pending} pending)`);
      assert.ok(stream.pooled<=40,`geometry pool grew to ${stream.pooled}`);
      assert.ok(snapshot.clearance>=-1e-6,`the sampled pose is inside a shore by ${-snapshot.clearance}`);
      peakIslands=Math.max(peakIslands,stream.islands);peakTriangles=Math.max(peakTriangles,stream.triangles);
      peakGeometries=Math.max(peakGeometries,snapshot.geometries);peakDraws=Math.max(peakDraws,snapshot.calls);
      worstBuild=Math.max(worstBuild,stream.lastBuildMs);
      results.samples.push({leg,x,z,islands:stream.islands,lods:stream.lods,triangles:stream.triangles,
        pooled:stream.pooled,geometries:snapshot.geometries,draws:snapshot.calls,sceneTriangles:snapshot.triangles});
      if(leg===3)await p.shot(evidence+'m5-archipelago.png');
      if(leg===11)await p.shot(evidence+'m5-far-field.png');
    }
    // After a full circuit back to the launch, memory must be where it started.
    await p.eval('sunwakeTest.setPose({x:0,z:0,yaw:-Math.PI/2})');await settle(40);
    const home=await p.eval('sunwakeTest.streamStats()'),homeSnapshot=await p.eval('sunwake');
    Object.assign(results,{peakIslands,peakTriangles,peakGeometries,peakDraws,worstBuildMs:worstBuild,
      home,homeGeometries:homeSnapshot.geometries,worldStats:homeSnapshot.worldStats});
    assert.ok(peakGeometries<=80,`geometry count peaked at ${peakGeometries}`);
    assert.ok(homeSnapshot.geometries<=peakGeometries,'geometry count drifted upward over the route');
    assert.ok(homeSnapshot.worldStats.cacheSize<=256,`descriptor cache grew to ${homeSnapshot.worldStats.cacheSize}`);
    assert.ok(home.evictions>0,'nothing was ever evicted over a 20 km route');
    assert.ok(peakIslands>=6&&peakIslands<=60,`islands in view peaked at ${peakIslands}`);
    assert.ok(results.samples.some(s=>s.lods[1]>0)&&results.samples.some(s=>s.lods[2]>0),'LOD tiers never engaged');
    // No water seam at a render-origin rebase, with islands in the frame.
    const key=LANDMARKS[0];
    await p.eval(`sunwakeTest.setPose({x:${key.x+255.9},z:${key.z},yaw:-Math.PI/2});sunwakeTest.setOrigin(${key.x},${key.z})`);
    await settle(30);
    const beforeShot=await p.shot(evidence+'m5-rebase-before.png');
    await p.eval(`sunwakeTest.setOrigin(${key.x+256},${key.z})`);
    const afterShot=await p.shot(evidence+'m5-rebase-after.png');
    results.rebase=await compareImages(p,beforeShot,afterShot);
    assert.ok(results.rebase.meanChannelDifference<.3&&results.rebase.fractionOver8<.002,JSON.stringify(results.rebase));
    clean(p);return {results,snapshot:await p.eval('sunwake'),errors:p.errors};
  });
}
if(!['all','shell','water','preview','c1','handling','islands','shape','stream'].includes(suite))throw new Error('Unimplemented suite '+suite);
report.passed=true;
}catch(e){report.passed=false;report.failure=e.stack;throw e;}finally{await writeFile(evidence+'browser-'+suite+'.json',JSON.stringify(report,null,2));}
