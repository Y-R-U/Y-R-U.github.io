// ~/.claude/bin/cdp start --port 9223 && node js/render/tests/beacon-browser.mjs
//
// Navigation lights. Proves the beacon draw is a single call, that the pinned
// goal's signal survives the haze at the ranges where a player decides whether
// to sail over, that it retires on arrival, and that it is genuinely occluded
// rather than painted over the world. Also measures the lit pixels in the
// captured frames, because "the instance exists" is not "you can see it" —
// this project has shipped five green suites over invisible or inside-out
// geometry already.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from '../../../tools/cdp.mjs';
import {QUALITY} from '../../core/config.mjs';
const p=await connect(),report={frames:[],dense:[]};
// Thresholds on a 40%x26% crop of the real framebuffer, differenced against
// the identical frame with the beacon group hidden. Falsified by forcing the
// on-frame blank too: peak and changed both collapse to 0 at every range.
const PEAK_RISE=Number(process.env.BEACON_PEAK??24),CHANGED=Number(process.env.BEACON_PIXELS??40);
const t0=Date.now(),step=(...a)=>console.log('[step]',((Date.now()-t0)/1000).toFixed(1)+'s',...a);
p.eval=async(expression,timeout=300000)=>{const r=await p.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},timeout);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const evidence=new URL('../../../docs/evidence/',import.meta.url);
p.shot=async path=>{
  for(let attempt=0;;attempt++){
    await p.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    try{const r=await p.send('Page.captureScreenshot',{format:'png'},90000);return writeFile(path,Buffer.from(r.data,'base64'));}
    catch(e){if(attempt>=2)throw e;step('capture retry',e.message);}
  }
};
try{
 await p.goto();await p.wait('window.__SUNWAKE_BOOTED__',60000);step('booted');
 await p.eval(`(async()=>{
   sunwakeTest.setView({time:0});
   const [{createScene},{createWorld,LANDMARKS},{createBoat},{mooringLayout}]=await Promise.all([
    import('./js/render/scene.mjs'),import('./js/core/world.mjs'),import('./js/core/boat.mjs'),import('./js/core/island-shape.mjs')]);
   const canvas=document.createElement('canvas');canvas.style='position:fixed;inset:0;width:100%;height:100%;z-index:100';document.body.append(canvas);
   const world=createWorld(),view=createScene(canvas,world);
   window.lights={view,world,LANDMARKS,
    // Same clear-sightline fixture the settlement captures use: pick a bearing
    // with no other island on the line, so what is measured is this island.
    frame(index,distance,{tier='standard',goal=true,time=5,blank=false}={}){
      const island=LANDMARKS[index],dock=mooringLayout(island),r=island.radius+distance;
      let bearing=dock.angle;
      for(const offset of [0,.25,-.25,.5,-.5,.8,-.8,1,-1]){
        bearing=dock.angle+offset;const x=island.x+Math.cos(bearing)*r,z=island.z+Math.sin(bearing)*r;
        const blocked=world.queryIslands(x,z,island.x,island.z).some(other=>{
          if(other.id===island.id)return false;const dx=island.x-x,dz=island.z-z,u=((other.x-x)*dx+(other.z-z)*dz)/(r*r);
          return u>0&&u<1&&Math.hypot(other.x-x-dx*u,other.z-z-dz*u)<other.radius+4;
        });if(!blocked)break;
      }
      view.setQuality(tier);view.setCourse(goal?{goal:island}:{goal:null});
      const state={...createBoat({x:island.x+Math.cos(bearing)*r,z:island.z+Math.sin(bearing)*r,yaw:Math.atan2(-Math.cos(bearing),-Math.sin(bearing))},world,time),time,reduced:false};
      if(blank)view.beacons.group.visible=false;else view.beacons.group.visible=true;
      view.render(state,1/60);const origin=view.metrics().origin;for(let i=0;i<35;i++)view.islands.update(origin,state.x,state.z);view.render(state,1/60);
      const o=view.metrics().origin;
      view.camera.position.set(state.x-o.x,5.5,state.z-o.z);view.camera.lookAt(island.x-o.x,distance<80?4:10,island.z-o.z);
      view.sky.update(view.camera,time);view.beacons.update(state,o,view.camera,view.renderer.domElement.clientHeight);
      view.renderer.render(view.scene,view.camera);
      const m=view.metrics();
      return {landmark:island.landmark,distance,tier,goal,calls:m.calls,triangles:m.triangles,beacons:m.beacons};
    },
    // Read the centre crop of the real framebuffer.
    band(){
      const gl=this.view.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
      const x=Math.floor(w*.30),y=Math.floor(h*.40),bw=Math.floor(w*.40),bh=Math.floor(h*.26);
      const buf=new Uint8Array(bw*bh*4);gl.readPixels(x,y,bw,bh,gl.RGBA,gl.UNSIGNED_BYTE,buf);
      const lum=new Float32Array(bw*bh);
      for(let i=0,k=0;i<buf.length;i+=4,k++)lum[k]=buf[i]*.299+buf[i+1]*.587+buf[i+2]*.114;
      return {lum,bw,bh};
    },
    // Beacons off, then beacons on, in ONE task on an already-warm island cache,
    // and differenced per pixel. "The instance exists" is not "you can see it";
    // this says how many pixels the light actually put on the glass and by how
    // much. Streaming state is identical between the two reads because the
    // fixture is rendered twice before the first of them.
    compare(index,distance,options={}){
      this.frame(index,distance,{...options,blank:true});
      const off=this.frame(index,distance,{...options,blank:true}),a=this.band();
      const m=this.frame(index,distance,options),b=this.band();
      let peak=0,changed=0,sum=0;
      for(let k=0;k<a.lum.length;k++){const d=b.lum[k]-a.lum[k];if(d>peak)peak=d;if(d>6){changed++;sum+=d;}}
      return {...m,offCalls:off.calls,peak,changed,mean:sum/Math.max(1,changed),crop:a.bw*a.bh};
    }};
 })()`);
 step('fixture ready');
 // A light must be visible where the rock is not: 420 m and 900 m are the range
 // in which the player decides whether the smudge is worth four minutes.
 for(const distance of [200,420,700,900]){
   step('compare',distance,'start');
   const on=await p.eval(`lights.compare(1,${distance})`);
   assert.ok(on.beacons.goal,`goal signal off at ${distance} m`);
   assert.ok(on.beacons.lamps>0,`no harbour lamp at ${distance} m`);
   assert.ok(on.calls-on.offCalls<=1,`beacons cost ${on.calls-on.offCalls} draws`);
   report.frames.push(on);
   await p.shot(new URL(`beacon-${distance}.png`,evidence).pathname);
   step('range',distance,'peak +'+on.peak.toFixed(1),'pixels',on.changed,'mean +'+on.mean.toFixed(1));
 }
 // Negative control: the identical measurement with the beacon group hidden in
 // BOTH frames. If this does not collapse, the crop is measuring frame-to-frame
 // noise and every number above is worthless.
 report.control=await p.eval('lights.compare(1,420,{blank:true})');
 assert.ok(report.control.peak<2,`control peak ${report.control.peak}`);
 assert.equal(report.control.changed,0,`control lit ${report.control.changed} pixels`);
 step('control peak',report.control.peak,'pixels',report.control.changed);
 for(const f of report.frames){
   assert.ok(f.peak>PEAK_RISE,`${f.distance} m: brightest beacon pixel only rose ${f.peak.toFixed(1)}`);
   assert.ok(f.changed>=CHANGED,`${f.distance} m: only ${f.changed} pixels lit`);
 }
 // Arrived: the goal signal retires rather than sitting in the player's face.
 const near=await p.eval('lights.frame(1,40)');
 assert.equal(near.beacons.goal,false,'goal signal still lit alongside the island');
 report.frames.push(near);await p.shot(new URL('beacon-arrived.png',evidence).pathname);
 // No course set at all: harbour lamps still light, goal signal does not.
 const nogoal=await p.eval('lights.frame(1,420,{goal:false})');
 assert.equal(nogoal.beacons.goal,false);assert.ok(nogoal.beacons.lamps>0);
 report.frames.push(nogoal);await p.shot(new URL('beacon-nogoal-420.png',evidence).pathname);
 // Every tier keeps the goal signal; lamp count follows the tier cap.
 report.tiers=[];
 for(const tier of ['high','standard','low','emergency']){
   const m=await p.eval(`lights.frame(1,420,{tier:'${tier}'})`);
   assert.ok(m.beacons.goal,`${tier} lost the goal signal`);
   report.tiers.push({tier,...m.beacons,calls:m.calls});
 }
 step('tiers',JSON.stringify(report.tiers));
 await p.shot(new URL('beacon-emergency-420.png',evidence).pathname);
 // Dense fixture: the extra draw must still fit every tier's caps with the
 // buoys, fish and smoke that are already in that budget.
 await p.goto('http://127.0.0.1:8888/gms/3d/sunwake/?test=1&fixture=dense');await p.wait('window.__SUNWAKE_BOOTED__',60000);step('dense booted');
 for(const pose of [{x:768,z:768},{x:940,z:860}])for(const tier of ['high','standard','low','emergency'])for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
   await p.eval(`sunwakeTest.setPose({x:${pose.x},z:${pose.z},yaw:${yaw}});sunwakeTest.setQuality('${tier}')`);
   let m;for(let i=0;i<40;i++){m=await p.eval('sunwakeTest.advance(1)');if(m.islandStream.pending===0)break;}
   assert.ok(m.calls<=QUALITY[tier].drawCap,`${tier} draws ${m.calls}`);
   assert.ok(m.triangles<=QUALITY[tier].triangleCap,`${tier} triangles ${m.triangles}`);
   assert.ok(m.beacons.lamps<=({high:10,standard:8,low:5,emergency:3})[tier],`${tier} lamps ${m.beacons.lamps}`);
   report.dense.push({pose,tier,yaw,calls:m.calls,triangles:m.triangles,beacons:m.beacons});
 }
 await p.shot(new URL('beacon-dense.png',evidence).pathname);
 // The real voyage, with nothing wired on the gameplay side: the renderer picks
 // up the published pin by itself, so the goal signal is lit from the default
 // spawn without anyone calling setCourse. Remove this once gameplay calls it.
 await p.goto();await p.wait('window.__SUNWAKE_BOOTED__',60000);
 await p.eval("sunwakeTest.reset()");
 let live;for(let i=0;i<180;i++){live=await p.eval('sunwakeTest.advance(1)');if(live.beacons?.goal)break;}
 report.live={pin:live.exploration.pin,beacons:live.beacons,calls:live.calls};
 assert.ok(live.beacons.goal,'published pin did not light the goal signal in the real voyage');
 assert.ok(live.beacons.lamps>0,'no harbour lamp in the real voyage');
 step('live',JSON.stringify(report.live));
 await p.shot(new URL('beacon-voyage.png',evidence).pathname);
 report.errors=p.errors;assert.deepEqual(p.errors,[]);
 console.log('PASS beacons',JSON.stringify({frames:report.frames.map(f=>({d:f.distance,goal:f.beacons.goal,lamps:f.beacons.lamps,calls:f.calls,meanRise:f.meanRise,peakRise:f.peakRise})),tiers:report.tiers,denseMax:report.dense.reduce((n,d)=>Math.max(n,d.calls),0),live:report.live},null,2));
}finally{await writeFile(new URL('beacon-browser.json',evidence),JSON.stringify({...report,errors:p.errors},null,2));await p.close();}
