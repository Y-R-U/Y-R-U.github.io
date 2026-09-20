// Owned graphics verification. Managed Chrome must be started in this invocation:
// ~/.claude/bin/cdp start --port 9223 && node js/render/tests/feedback-browser.mjs
import assert from 'node:assert/strict';
import {connect,sleep} from '../../../tools/cdp.mjs';
import {QUALITY} from '../../core/config.mjs';
import {sampleWave} from '../../core/waves.mjs';
import {hullPoint} from '../../core/boat.mjs';
import {writeFile} from 'node:fs/promises';
const p=await connect(),report={frames:[],budgets:[],errors:[]};
const evidence=new URL('../../../docs/evidence/',import.meta.url);
try{
  await p.goto();await p.wait('window.__SUNWAKE_BOOTED__');
  await p.eval('sunwakeTest.setPose({yaw:Math.PI/2});sunwakeTest.resumeTime()');
  await p.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'w',code:'KeyW',windowsVirtualKeyCode:87});
  // Real keyboard and RAF sailing, including steering, with regular visual frames.
  for(let i=0;i<12;i++){
    if(i===6)await p.send('Input.dispatchKeyEvent',{type:'rawKeyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68});
    await sleep(700);const s=await p.eval('sunwake');
    let clearance=Infinity;
    for(const point of [[-.64,.46,-2.3],[.64,.46,-2.3],[-.85,.47,-.8],[.85,.47,-.8],[0,.70,2.3]]){
      const q=hullPoint(s,point),w=sampleWave(q.x,q.z,s.time,{});clearance=Math.min(clearance,q.y-w.height);
    }
    assert.ok(clearance>.08);assert.equal(s.referenceHeight,s.y);
    report.frames.push({time:s.time,x:s.x,z:s.z,clearance,speed:Math.hypot(s.vx,s.vz),yaw:s.yaw});
    if(i%2===0)await p.shot(new URL(`feedback-sailing-${i}.png`,evidence).pathname);
  }
  for(const [key,code,n] of [['w','KeyW',87],['d','KeyD',68]])await p.send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:n});
  assert.ok(report.frames.at(-1).time>report.frames[0].time+2,'RAF sailing actually advanced');
  assert.ok(report.frames.at(-1).yaw>report.frames[0].yaw+.1,'real steering changed the heading');
  // Isolated rendering fixture exercises the public scene data contract without
  // editing main/platform or exposing production mutation hooks.
  await p.eval(`(async()=>{
    sunwakeTest.setView({time:0});
    const [{createScene},{createWorld,LANDMARKS},{createBoat},{reefSpot}]=await Promise.all([
      import('./js/render/scene.mjs'),import('./js/core/world.mjs'),import('./js/core/boat.mjs'),import('./js/render/marine-life.mjs')]);
    const canvas=document.createElement('canvas');canvas.style='position:fixed;inset:0;width:100%;height:100%;z-index:100';document.body.append(canvas);
    const world=createWorld(),view=createScene(canvas,world),island=LANDMARKS[3],spot=reefSpot(island);
    const yaw=Math.atan2(spot.x-island.x,spot.z-island.z)+Math.PI;
    const boat=createBoat({x:spot.x-Math.sin(yaw)*15,z:spot.z-Math.cos(yaw)*15,yaw},world,0);
    const state={...boat,time:0,reduced:false,near:false};
    window.feedback={view,state,spot,world,createBoat};
    for(let i=0;i<25;i++)view.render(state,1/60);
  })()`);
  for(const time of [0,.4,.8,1.2,2,3,4,5]){
    const metrics=await p.eval(`(()=>{const f=feedback;f.state={...f.createBoat({x:f.state.x,z:f.state.z,yaw:f.state.yaw},f.world,${time}),time:${time},reduced:false};f.view.render(f.state,1/60);return f.view.metrics();})()`);
    assert.ok(metrics.marine.fish>0);assert.ok(metrics.marine.buoys>0);
    for(const b of metrics.marine.buoySamples)assert.ok(Math.abs(b.y-sampleWave(b.x,b.z,time,{}).height)<1e-10);
    if([0,.8,2,4].includes(time))await p.shot(new URL(`feedback-reef-${time}.png`,evidence).pathname);
  }
  // Empty payload hides fish, supplied spots override defaults, catch renders once.
  let counts=await p.eval(`(()=>{const f=feedback;f.view.setFishingVisuals({spots:[]});f.view.render(f.state);const hidden=f.view.metrics().marine.fish;f.view.setFishingVisuals({spots:[],catch:{id:'fixture',startedAt:f.state.time,length:1.4,color:'#edce91'}});f.view.render(f.state);return {hidden,caught:f.view.metrics().marine.fish};})()`);
  assert.deepEqual(counts,{hidden:0,caught:1});await p.shot(new URL('feedback-catch.png',evidence).pathname);
  await p.eval(`feedback.view.setFishingVisuals({spots:[{...feedback.spot,x:feedback.state.x,z:feedback.state.z,activity:1}]});feedback.view.render(feedback.state)`);
  for(const tier of ['high','standard','low','emergency']){
    const m=await p.eval(`(()=>{const f=feedback;f.view.setQuality('${tier}');for(let i=0;i<20;i++)f.view.render(f.state,1/60);return f.view.metrics();})()`);
    report.budgets.push({tier,calls:m.calls,triangles:m.triangles,fish:m.marine.fish,buoys:m.marine.buoys});
  }
  await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
  await p.eval("feedback.view.setQuality('low');feedback.view.resize();feedback.view.render(feedback.state)");
  await p.shot(new URL('feedback-reef-portrait.png',evidence).pathname);
  // Actual dense world, all tiers, with production draw/triangle caps.
  await p.goto('http://127.0.0.1:8888/gms/3d/sunwake/?test=1&fixture=dense');await p.wait('window.__SUNWAKE_BOOTED__');
  for(const tier of ['high','standard','low','emergency'])for(const yaw of [0,Math.PI/2]){
    const m=await p.eval(`(()=>{sunwakeTest.setPose({x:768,z:768,yaw:${yaw}});sunwakeTest.setQuality('${tier}');for(let i=0;i<30;i++)sunwakeTest.advance(1);return sunwake;})()`);
    assert.ok(m.calls<=QUALITY[tier].drawCap,`${tier} draw cap ${m.calls}`);
    assert.ok(m.triangles<=QUALITY[tier].triangleCap,`${tier} triangle cap ${m.triangles}`);
    report.budgets.push({dense:true,tier,yaw,calls:m.calls,triangles:m.triangles,fish:m.marine.fish,buoys:m.marine.buoys});
  }
  report.errors=p.errors;assert.deepEqual(p.errors,[]);
  console.log('PASS feedback browser',JSON.stringify(report,null,2));
  await writeFile(new URL('feedback-browser.json',evidence),JSON.stringify(report,null,2));
}finally{await p.close();}
