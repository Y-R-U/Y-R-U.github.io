// ~/.claude/bin/cdp start --port 9223 && node js/render/tests/settlements-browser.mjs
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {connect} from '../../../tools/cdp.mjs';
import {QUALITY} from '../../core/config.mjs';
const p=await connect(),report={views:[],dense:[]};
const t0=Date.now(),step=(...a)=>console.log('[step]',((Date.now()-t0)/1000).toFixed(1)+'s',...a);
p.eval=async(expression,timeout=300000)=>{const r=await p.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true},timeout);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
const evidence=new URL('../../../docs/evidence/',import.meta.url);
// SwiftShader can take more than the generic helper's 20 s to drain a dense frame.
// SwiftShader occasionally leaves a dense frame's capture pending forever; the
// CDP socket stays healthy, so one retry after another two RAFs always lands it.
p.shot=async path=>{
  for(let attempt=0;;attempt++){
    await p.eval('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    try{const r=await p.send('Page.captureScreenshot',{format:'png'},90000);return writeFile(path,Buffer.from(r.data,'base64'));}
    catch(e){if(attempt>=2)throw e;step('capture retry',path.split('/').pop(),e.message);}
  }
};
try{
 await p.goto();await p.wait('window.__SUNWAKE_BOOTED__',60000);step('booted');
 report.containment=await p.eval(`(async()=>{
   const [{createSettlementGeometry,settlementLayout},{createIslandGeometry},{generateIsland,LANDMARKS},{mooringLayout},{VISUAL_WIND}]=await Promise.all([
   import('./js/render/settlements.mjs'),import('./js/render/islands.mjs'),import('./js/core/world.mjs'),import('./js/core/island-shape.mjs'),import('./js/core/visual-config.mjs')]);
   const list=[...LANDMARKS];for(let x=-10;x<=10;x++)for(let z=-10;z<=10;z++){const i=generateIsland(x,z);if(i)list.push(i);}
   let vertices=0,maxRatio=0,maxSmokeRatio=0;const triangles=[0,0,0];
   for(const island of list){
     const dock=mooringLayout(island),layout=settlementLayout(island);
     if(Math.hypot(dock.approach.x-island.x,dock.approach.z-island.z)<island.radius+2.6)throw Error('unsafe handover approach');
     for(let lod=0;lod<3;lod++){
       const g=createSettlementGeometry(island,lod),pos=g.attributes.position;triangles[lod]=Math.max(triangles[lod],g.userData.triangles);
       for(let k=0;k<pos.count;k++){const ratio=Math.hypot(pos.getX(k),pos.getZ(k))/island.radius;maxRatio=Math.max(maxRatio,ratio);vertices++;if(ratio>1)throw Error('vertex outside collision circle');}g.dispose();
     }
     for(let k=0;k<=100;k++){
       const age=k/100,smoke=layout.chimney,extent=Math.SQRT2*(.22+age*1.1)*Math.sin(Math.PI*age);
       const ratio=(Math.hypot(smoke.x+VISUAL_WIND.x*age*5,smoke.z+VISUAL_WIND.z*age*5)+extent)/island.radius;
       maxSmokeRatio=Math.max(maxSmokeRatio,ratio);if(ratio>1)throw Error('smoke outside collider');
     }
   }
   // Full island geometry at every LOD, including the recessed harbour rim.
   let fullVertices=0;for(const island of list.filter((_,i)=>i%12===0).concat(LANDMARKS))for(let lod=0;lod<3;lod++){
     const g=createIslandGeometry(island,lod),pos=g.attributes.position;
     for(let k=0;k<pos.count;k++){fullVertices++;if(pos.getY(k)>-1.45&&Math.hypot(pos.getX(k),pos.getZ(k))>island.radius+1e-5)throw Error('full island outside collider');}g.dispose();
   }
   return {islands:list.length,vertices,fullVertices,maxRatio,maxSmokeRatio,maxTriangles:triangles};
 })()`);
 await p.eval(`(async()=>{
   sunwakeTest.setView({time:0});
   const [{createScene},{createWorld,LANDMARKS},{createBoat},{mooringLayout}]=await Promise.all([
    import('./js/render/scene.mjs'),import('./js/core/world.mjs'),import('./js/core/boat.mjs'),import('./js/core/island-shape.mjs')]);
   const canvas=document.createElement('canvas');canvas.style='position:fixed;inset:0;width:100%;height:100%;z-index:100';document.body.append(canvas);
   const world=createWorld(),view=createScene(canvas,world);
   window.habitat={view,world,LANDMARKS,mooringLayout,createBoat,
    frame(index,distance,tier='standard',time=5){
      const island=LANDMARKS[index],dock=mooringLayout(island),r=island.radius+distance;
      // At 900 m another real island may lie on the spawn-facing sightline.
      // Select a clear sea bearing so the named target, not an intervening island,
      // is what this silhouette fixture actually captures. Keep real scale/FOV.
      let bearing=dock.angle;
      for(const offset of [0,.25,-.25,.5,-.5,.8,-.8,1,-1]){
        bearing=dock.angle+offset;const x=island.x+Math.cos(bearing)*r,z=island.z+Math.sin(bearing)*r;
        const blocked=world.queryIslands(x,z,island.x,island.z).some(other=>{
          if(other.id===island.id)return false;const dx=island.x-x,dz=island.z-z,u=((other.x-x)*dx+(other.z-z)*dz)/(r*r);
          return u>0&&u<1&&Math.hypot(other.x-x-dx*u,other.z-z-dz*u)<other.radius+4;
        });if(!blocked)break;
      }
      view.setQuality(tier);const state={...createBoat({x:island.x+Math.cos(bearing)*r,z:island.z+Math.sin(bearing)*r,yaw:Math.atan2(-Math.cos(bearing),-Math.sin(bearing))},world,time),time,reduced:false};
      view.render(state,1/60);const origin=view.metrics().origin;for(let i=0;i<35;i++)view.islands.update(origin,state.x,state.z);view.render(state,1/60);
      const o=view.metrics().origin;
      view.camera.position.set(state.x-o.x,5.5,state.z-o.z);view.camera.lookAt(island.x-o.x,distance<80?4:10,island.z-o.z);
      // lookAt changes the quaternion after its internal matrix update.
      // Refresh before sky reconstruction and beacon projection, so both read this frame.
      view.camera.updateMatrixWorld();view.sky.update(view.camera,time);view.renderer.render(view.scene,view.camera);
      this.state=state;return {landmark:island.landmark,distance,bearingOffset:bearing-dock.angle,tier,...view.metrics(),islandLOD:view.islands.meshes.find(m=>m.userData.island.id===island.id)?.userData.lod,visible:view.islands.meshes.find(m=>m.userData.island.id===island.id)?.visible};
    }};
 })()`);
 for(let i=0;i<6;i++)for(const distance of [200,900]){
   const m=await p.eval(`habitat.frame(${i},${distance})`);assert.equal(m.visible,true,`${m.landmark} hidden at ${distance}`);assert.equal(m.islandLOD,distance===900?2:1);
   report.views.push(m);await p.shot(new URL(`settlement-${i}-${distance}.png`,evidence).pathname);step('view',i,distance);
 }
 for(const distance of [15,50,420]){
   const m=await p.eval(`habitat.frame(0,${distance})`);report.views.push(m);await p.shot(new URL(`settlement-landing-${distance}.png`,evidence).pathname);
 }
 for(const tier of ['low','emergency'])for(const distance of [200,900]){
   const m=await p.eval(`habitat.frame(1,${distance},'${tier}')`);assert.equal(m.visible,true);report.views.push(m);
   await p.shot(new URL(`settlement-${tier}-${distance}.png`,evidence).pathname);
 }
 await p.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await p.eval("habitat.view.resize();habitat.frame(0,200,'low')");await p.shot(new URL('settlement-portrait-200.png',evidence).pathname);
 // Wind world direction matches the tip of the stationary pennant at all headings.
 report.wind=await p.eval(`(async()=>{const THREE=await import('three'),{VISUAL_WIND}=await import('./js/core/visual-config.mjs');let worst=0;
 const boat=habitat.view.boat,p=boat.children[0].geometry.attributes.position;
 for(let k=0;k<16;k++){const yaw=k*Math.PI/8;boat.rotation.set(0,yaw,0);boat.userData.update(0,0,yaw);
 const v=new THREE.Vector3(p.getX(p.count-2),0,p.getZ(p.count-2)-2.16).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).normalize();worst=Math.max(worst,Math.abs(v.x-VISUAL_WIND.x/Math.hypot(VISUAL_WIND.x,VISUAL_WIND.z)),Math.abs(v.z-VISUAL_WIND.z/Math.hypot(VISUAL_WIND.x,VISUAL_WIND.z)));}return {headings:16,worst};})()`);
 assert.ok(report.wind.worst<1e-5);
 step('wind',JSON.stringify(report.wind));
 await p.goto('http://127.0.0.1:8888/gms/3d/sunwake/?test=1&fixture=dense');await p.wait('window.__SUNWAKE_BOOTED__',60000);step('dense booted');
 for(const pose of [{x:768,z:768},{x:940,z:860}])for(const tier of ['high','standard','low','emergency'])for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2]){
   await p.eval(`sunwakeTest.setPose({x:${pose.x},z:${pose.z},yaw:${yaw}});sunwakeTest.setQuality('${tier}')`);
   let m;for(let i=0;i<40;i++){m=await p.eval('sunwakeTest.advance(1)');if(m.islandStream.pending===0)break;}
   assert.ok(m.calls<=QUALITY[tier].drawCap,`${tier} draws ${m.calls}`);assert.ok(m.triangles<=QUALITY[tier].triangleCap,`${tier} triangles ${m.triangles}`);
   assert.ok(m.geometryBytes<24*1024*1024);assert.ok(m.marine.buoys>0);if(pose.x===940)assert.ok(m.marine.fish>0,'dense fixture includes visible fish');assert.equal(m.islandStream.pending,0);
   report.dense.push({pose,tier,yaw,calls:m.calls,triangles:m.triangles,geometryBytes:m.geometryBytes,settlements:m.settlements,fish:m.marine.fish,buoys:m.marine.buoys});
   if(yaw===0&&pose.x===940)await p.shot(new URL(`settlement-dense-${tier}.png`,evidence).pathname);step('dense',pose.x,tier,yaw,m.calls,m.triangles);
 }
 report.errors=p.errors;assert.deepEqual(p.errors,[]);
 await writeFile(new URL('settlements-browser.json',evidence),JSON.stringify(report,null,2));console.log('PASS settlements',JSON.stringify({containment:report.containment,wind:report.wind,dense:report.dense,errors:report.errors},null,2));
}finally{await writeFile(new URL('settlements-browser.json',evidence),JSON.stringify({...report,errors:p.errors},null,2));await p.close();}
