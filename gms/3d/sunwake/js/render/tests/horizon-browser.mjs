// Run through the managed Chrome launcher, as documented in ROADMAP.
// Measurements read the real default framebuffer synchronously, before it clears.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from '../../../tools/cdp.mjs';
import {QUALITY} from '../../core/config.mjs';
const evidence=new URL('../../../docs/evidence/',import.meta.url);
const p=await connect(),report={date:new Date().toISOString(),passed:false,islands:[],weather:[],hiddenIslands:[],wraps:[],dense:[]};
p.eval=async expression=>{const r=await p.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},120000);if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
async function fixture(){
 const [{createScene},{createWorld,LANDMARKS,generateIsland},{createBoat},{mooringLayout},{WEATHER}]=await Promise.all([
  import('./js/render/scene.mjs'),import('./js/core/world.mjs'),import('./js/core/boat.mjs'),import('./js/core/island-shape.mjs'),import('./js/core/visual-config.mjs')]);
 sunwakeTest.setView({time:5});
 const canvas=document.createElement('canvas');canvas.style='position:fixed;inset:0;width:100%;height:100%;z-index:100';document.body.append(canvas);
 const world=createWorld(),view=createScene(canvas,world),subjects=[...LANDMARKS],profiles=new Set();
 for(let x=-5;x<5;x++)for(let z=-5;z<5;z++){const island=generateIsland(x,z);if(island&&!island.landmark&&!profiles.has(island.profile)){profiles.add(island.profile);subjects.push(island);}}

 view.setCourse(null);
 for(const obj of [view.beacons,view.marine,view.settlementLife,view.effects])obj.group.visible=false;
 view.boat.visible=false;
 window.horizon={view,world,LANDMARKS:subjects,WEATHER,
  island(index,distance,tier='standard'){
   const island=this.LANDMARKS[index],dock=mooringLayout(island),r=island.radius+distance;
   const state={...createBoat({x:island.x+Math.cos(dock.angle)*r,z:island.z+Math.sin(dock.angle)*r,yaw:Math.atan2(-Math.cos(dock.angle),-Math.sin(dock.angle))},{clearSpawn(){}},5),time:5,reduced:false};
   view.setQuality(tier);view.render(state,0);
   const origin=view.metrics().origin;for(let i=0;i<40;i++)view.islands.update(origin,state.x,state.z);
   view.render(state,0);for(const m of view.islands.meshes)m.visible=m.userData.island.id===island.id;
   this.target=view.islands.meshes.find(m=>m.userData.island.id===island.id);
   view.camera.position.set(state.x-origin.x,5.5,state.z-origin.z);view.camera.lookAt(island.x-origin.x,distance<80?4:10,island.z-origin.z);view.camera.updateMatrixWorld();view.sky.update(view.camera,5);
   this.draw();return {name:island.landmark||island.profile,distance,tier,lod:this.target.userData.lod};
  },
  draw(){view.renderer.render(view.scene,view.camera);},
  pixels(){const gl=view.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,buf=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,buf);return {buf,w,h};},
  diff(a,b,region=[0,0,1,1]){
   let changed=0,peak=0,sum=0,dark=0,warm=0;
   for(let y=Math.floor(a.h*region[1]);y<Math.floor(a.h*region[3]);y++)for(let x=Math.floor(a.w*region[0]);x<Math.floor(a.w*region[2]);x++){
    const i=(y*a.w+x)*4,delta=Math.max(...[0,1,2].map(k=>Math.abs(a.buf[i+k]-b.buf[i+k])));
    peak=Math.max(peak,delta);if(delta>12){changed++;sum+=delta;const lum=c=>c[i]*.299+c[i+1]*.587+c[i+2]*.114;
     if(lum(a.buf)-lum(b.buf)>12)dark++;if(b.buf[i]-b.buf[i+2]>10)warm++;}
   }return {changed,peak,mean:sum/Math.max(1,changed),dark,warm};
  },
  measureIsland(control=false){
   const m=this.target;m.visible=false;this.draw();const blank=this.pixels();
   m.visible=!control;view.islands.material.userData.aerialStrength.value=0;this.draw();const previous=this.pixels();
   view.islands.material.userData.aerialStrength.value=1;this.draw();const now=this.pixels();
   const g=m.geometry,count=g.attributes.position.count;g.setDrawRange(0,count-g.userData.settlementTriangles*3);this.draw();const noBuildings=this.pixels();g.setDrawRange(0,Infinity);this.draw();
   return {visible:this.diff(blank,now),withoutAerial:this.diff(blank,previous),aerial:this.diff(previous,now),buildings:this.diff(noBuildings,now)};
  },
  weather(yaw,time,intensity=1){
   view.islands.group.visible=false;view.camera.position.set(0,5.5,0);view.camera.lookAt(Math.sin(yaw)*1000,100,Math.cos(yaw)*1000);view.camera.updateMatrixWorld();
   view.sky.update(view.camera,time);view.sky.uniforms.uWeather.value=intensity;this.draw();
  },
  measureWeather(yaw,time,control=false){
   this.weather(yaw,time,0);const off=this.pixels(),offCalls=view.metrics().calls;this.weather(yaw,time,control?0:1);const on=this.pixels();
   return {...this.diff(off,on,[0,.42,1,1]),extraDraws:view.metrics().calls-offCalls};
  },
  png(){this.draw();const {buf,w,h}=this.pixels(),c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d'),im=ctx.createImageData(w,h);
   for(let y=0;y<h;y++)im.data.set(buf.subarray(y*w*4,(y+1)*w*4),(h-y-1)*w*4);ctx.putImageData(im,0,0);return c.toDataURL('image/png').split(',')[1];}
 };
}
const save=async name=>writeFile(new URL(name+'.png',evidence),Buffer.from(await p.eval('horizon.png()'),'base64'));
try{
 await p.goto();await p.wait('window.__SUNWAKE_BOOTED__',60000);await p.eval(`(${fixture.toString()})()`);
 report.renderer=await p.eval(`(()=>{const gl=horizon.view.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER)})()`);
 for(let index=0;index<9;index++)for(const distance of (index===1?[40,200,900]:[900])){
  const pose=await p.eval(`horizon.island(${index},${distance})`),pixels=await p.eval('horizon.measureIsland()');report.islands.push({...pose,...pixels});
  await save(`horizon-island-${index}-${distance}`);console.log('island',JSON.stringify(report.islands.at(-1)));
  assert.ok(pixels.visible.changed>50,'Island needs real framebuffer coverage');
  if(distance===900){
   const hidden=await p.eval('horizon.measureIsland(true)');report.hiddenIslands.push({index,...hidden});
   for(const feature of Object.values(hidden)){assert.equal(feature.changed,0);assert.equal(feature.peak,0,'Hidden island feature contaminated by another draw');}
   assert.ok(pixels.visible.dark>40,'Elevated rock needs contrast');assert.ok(pixels.aerial.changed>20,'Aerial treatment absent');assert.ok(pixels.buildings.changed>3,'Distant structure vanished');}
 }
 for(const tier of ['low','emergency']){
  const pose=await p.eval(`horizon.island(1,900,'${tier}')`),pixels=await p.eval('horizon.measureIsland()');report.islands.push({...pose,...pixels});assert.ok(pixels.visible.changed>50);await save(`horizon-island-1-900-${tier}`);
 }
 // Portrait has its own real framebuffer; do not infer visibility from desktop.
 await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true});
 await p.eval('horizon.view.resize()');
 const portrait=await p.eval('horizon.island(1,900)');report.portrait={...portrait,...await p.eval('horizon.measureIsland()')};assert.ok(report.portrait.visible.changed>50);await save('horizon-island-1-900-portrait');
 await p.send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});await p.eval('horizon.view.resize();horizon.island(1,900)');
 await p.eval('horizon.view.islands.material.userData.aerialStrength.value=0');await save('horizon-island-1-900-without-aerial');await p.eval('horizon.view.islands.material.userData.aerialStrength.value=1');
 report.islandControl=await p.eval('horizon.measureIsland(true)');assert.equal(report.islandControl.visible.changed,0);assert.equal(report.islandControl.visible.peak,0);assert.equal(report.islandControl.aerial.changed,0);assert.equal(report.islandControl.buildings.changed,0);await save('horizon-island-hidden-control');
 for(const yaw of [-Math.PI/2,Math.PI/2,Math.PI,0])for(const time of [5,500]){
  const pixels=await p.eval(`horizon.measureWeather(${yaw},${time})`);report.weather.push({yaw,time,...pixels});await save(`horizon-weather-${yaw.toFixed(2)}-${time}`);console.log('weather',JSON.stringify(report.weather.at(-1)));assert.ok(pixels.changed>100,'Weather absent from framebuffer');assert.equal(pixels.extraDraws,0);
 }
 report.weatherControl=await p.eval('horizon.measureWeather(0,5,true)');assert.equal(report.weatherControl.changed,0);assert.equal(report.weatherControl.peak,0);
 report.weatherMotion=await p.eval(`(()=>{horizon.weather(0,5);const a=horizon.pixels();horizon.weather(0,500);return horizon.diff(a,horizon.pixels(),[0,.42,1,1])})()`);assert.ok(report.weatherMotion.changed>100);
 // Freeze water phases: only the shared sky/weather clock changes. Include the
 // squall centre, the atan seam, and multiple complete laps in both directions.
 report.wrap=[];
 for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2])for(const lap of [-1,1,3]){
  const pixels=await p.eval(`(()=>{const t=horizon.WEATHER.squallPeriod*${lap};horizon.weather(${yaw},t-.001);const a=horizon.pixels();horizon.weather(${yaw},t+.001);return horizon.diff(a,horizon.pixels())})()`);
  report.wrap.push({yaw,lap,...pixels});assert.equal(pixels.changed,0,'Weather jumps at clock wrap');assert.ok(pixels.peak<=2,'Wrap exceeds framebuffer quantisation tolerance');
 }
 report.periodic=await p.eval(`(()=>{horizon.weather(Math.PI/2,500);const a=horizon.pixels();horizon.weather(Math.PI/2,500+3*horizon.WEATHER.squallPeriod);return horizon.diff(a,horizon.pixels())})()`);assert.equal(report.periodic.peak,0,'Weather fails to repeat after complete laps');
 report.hiddenWeatherMotion=await p.eval(`(()=>{horizon.view.sky.uniforms.uCloudEnabled.value=0;horizon.weather(0,5);const a=horizon.pixels();horizon.weather(0,500);const diff=horizon.diff(a,horizon.pixels());horizon.view.sky.uniforms.uCloudEnabled.value=1;return diff})()`);assert.equal(report.hiddenWeatherMotion.peak,0,'Hidden clouds still animate the frame');
 for(const name of ['visible','aerial','buildings'])assert.equal(report.islandControl[name].peak,0,'Hidden island contributes pixels: '+name);
 report.reduced=await p.eval(`(()=>{const {view}=horizon;horizon.weather(0,5);const a=horizon.pixels();view.sky.update(view.camera,500,true);horizon.draw();return horizon.diff(a,horizon.pixels())})()`);assert.equal(report.reduced.peak,0);
 report.sunPixels=await p.eval(`(()=>{const centres=[];for(const t of [5,500]){horizon.weather(-Math.PI/2,t);const {buf,w,h}=horizon.pixels();let xsum=0,ysum=0,n=0;for(let y=Math.floor(h*.48);y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(buf[i]>245&&buf[i+1]>240&&buf[i+2]>220){xsum+=x;ysum+=y;n++;}}centres.push({x:xsum/n,y:ysum/n,n});}return centres;})()`);
 assert.ok(report.sunPixels[0].n>20);assert.ok(Math.hypot(report.sunPixels[0].x-report.sunPixels[1].x,report.sunPixels[0].y-report.sunPixels[1].y)<.2,'Sun moved on screen');
 report.sun=await p.eval(`(()=>{horizon.weather(0,0);const a=horizon.view.sky.uniforms.uSun.value.toArray();horizon.weather(0,900);return {a,b:horizon.view.sky.uniforms.uSun.value.toArray()}})()`);assert.deepEqual(report.sun.a,report.sun.b);
 await p.goto('http://127.0.0.1:8888/gms/3d/sunwake/?test=1&fixture=dense');await p.wait('window.__SUNWAKE_BOOTED__',60000);
 for(const pose of [{x:768,z:768},{x:940,z:860}])for(const tier of Object.keys(QUALITY))for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  await p.eval(`sunwakeTest.setPose(${JSON.stringify({...pose,yaw})});sunwakeTest.setQuality('${tier}')`);
  let m;for(let i=0;i<40;i++){m=await p.eval('sunwakeTest.advance(1)');if(m.islandStream.pending===0)break;}
  assert.ok(m.calls<=QUALITY[tier].drawCap);assert.ok(m.triangles<=QUALITY[tier].triangleCap);assert.ok(m.geometryBytes<24*1024*1024);
  report.dense.push({pose,tier,yaw,calls:m.calls,triangles:m.triangles,geometryBytes:m.geometryBytes});
 }
 assert.deepEqual(p.errors,[]);report.passed=true;console.log('PASS horizon framebuffer, hidden controls, clock wrap, reduced motion and dense budgets');
}catch(e){report.failure=e.stack;throw e;}finally{await writeFile(new URL('horizon-browser.json',evidence),JSON.stringify({...report,errors:p.errors},null,2));await p.close();}
