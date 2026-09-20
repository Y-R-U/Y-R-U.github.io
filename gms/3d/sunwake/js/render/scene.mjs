import * as THREE from 'three';
import {QUALITY,SUN_DIRECTION,PALETTE,HORIZON_FADE} from '../core/config.mjs';
import {createSky} from './sky.mjs';
import {createBoatView} from './boat-view.mjs';
import {createWater,probeWaves} from './water.mjs';
import {rebaseOrigin} from '../core/math.mjs';
import {createFollowCamera} from './camera.mjs';
import {createEffects} from './effects.mjs';
import {createIslandsView} from './islands.mjs';
import {createSettlementLife} from './settlements.mjs';
import {createBeacons} from './beacon.mjs';
import {createMarineLife} from './marine-life.mjs';
import {forwardSpeed} from '../core/boat.mjs';
export function createScene(canvas,world=null) {
  const gl=canvas.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'high-performance'});
  if(!gl) throw new Error('WebGL2 is unavailable. SUNWAKE needs a browser with WebGL2 enabled.');
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();window.sunwakeFail('The graphics context was lost. Reload to return to the water.');});
  canvas.addEventListener('webglcontextrestored',()=>window.sunwakeFail('Graphics are available again. Reload to restart SUNWAKE.'));
  const renderer=new THREE.WebGLRenderer({canvas,context:gl,antialias:false});
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  renderer.debug.onShaderError=(context,program,vs,fs)=>{const log=[context.getProgramInfoLog(program),context.getShaderInfoLog(vs),context.getShaderInfoLog(fs)].filter(Boolean).join('\n');console.error('SUNWAKE shader compile failure',log);window.sunwakeFail('Shader compilation failed:\n'+log);};
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(58,1,.15,2000),sky=createSky(),boat=createBoatView();scene.add(sky.mesh,boat);
  scene.add(new THREE.HemisphereLight('#ffe1b5','#2a4356',1.25));
  const sun=new THREE.DirectionalLight('#ffc078',3);sun.position.set(...SUN_DIRECTION);scene.add(sun);
  // Sky-bounce fill from the east. The chase camera always looks into the sun,
  // so without it every solid object is seen from its shaded side.
  // Raked low from the east so east-facing rock separates into planes instead of
  // reading as one flat ambient-lit mass.
  const fill=new THREE.DirectionalLight('#a9cbe2',1.9);fill.position.set(.90,.34,.28);scene.add(fill);
  const water=createWater(sky.uniforms);scene.add(water.mesh);
  // Islands fade into the same horizon colour the water shader reaches by 650 m.
  // D2: one shared range. Islands do not use this fog at all — they run the
  // water's own skyColor fade in linear space (render/islands.mjs), because
  // THREE.Fog is a flat colour applied after tone mapping and left a seam.
  scene.fog=new THREE.Fog(new THREE.Color(PALETTE.horizon).lerp(new THREE.Color(PALETTE.haze),.45),HORIZON_FADE[0],HORIZON_FADE[1]);
  const islands=world?createIslandsView(world,sky.uniforms,{waterUniforms:water.uniforms}):null;if(islands)scene.add(islands.group);
  const marine=world?createMarineLife(world,sky.uniforms):null;if(marine)scene.add(marine.group);
  const settlementLife=islands?createSettlementLife(islands):null;if(settlementLife)scene.add(settlementLife.group);
  const beacons=islands?createBeacons(islands,world):null;if(beacons)scene.add(beacons.group);
  const shoreList=[];
  const origin={x:0,z:0},follow=createFollowCamera(camera),effects=createEffects(water.uniforms);scene.add(effects.group);
  let tier='standard',resolutionScale=1,renderFrames=0,gpuMs=null,streamMs=0,viewMs=0,submitMs=0;
  const timer=gl.getExtension('EXT_disjoint_timer_query_webgl2'),queries=[];
  function gpuStart(){
    while(queries.length&&gl.getQueryParameter(queries[0],gl.QUERY_RESULT_AVAILABLE)){const q=queries.shift();if(!gl.getParameter(timer.GPU_DISJOINT_EXT))gpuMs=gl.getQueryParameter(q,gl.QUERY_RESULT)/1e6;gl.deleteQuery(q);}
    if(timer&&queries.length<4&&renderFrames++%30===0){const q=gl.createQuery();gl.beginQuery(timer.TIME_ELAPSED_EXT,q);queries.push(q);return true;}return false;
  }
  function resize(){const w=innerWidth,h=innerHeight,q=QUALITY[tier];renderer.setPixelRatio(Math.min(devicePixelRatio,q.dpr,Math.sqrt(q.pixelCap/(w*h)))*resolutionScale);renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<h?66:58;camera.updateProjectionMatrix();}
  function render(state,dt=0){
    const started=performance.now();
    rebaseOrigin(state.x,state.z,origin);const x=state.x-origin.x,z=state.z-origin.z;
    boat.position.set(x,state.y,z);boat.rotation.order='YXZ';boat.rotation.set(-state.pitch,state.yaw,state.roll);
    boat.userData.update(state.time,forwardSpeed(state),state.yaw);
    let near=null;
    if(world){near=world.nearby(state.x,state.z,260,shoreList);const streamStart=performance.now();islands.update(origin,state.x,state.z);streamMs=performance.now()-streamStart;water.setShores(near,origin,state.x,state.z);}
    follow.update(state,origin,dt,{near:state.near,fixture:state.fixture,reduced:state.reduced,islands:near});
    sky.update(camera,state.time,state.reduced);water.update(state,origin);marine?.update(state,origin);settlementLife?.update(state,origin,camera);beacons?.update(state,origin,camera,renderer.domElement.clientHeight||renderer.domElement.height);effects.render(state,origin,camera);viewMs=performance.now()-started;const query=gpuStart(),submitStart=performance.now();renderer.render(scene,camera);submitMs=performance.now()-submitStart;if(query)gl.endQuery(timer.TIME_ELAPSED_EXT);
  }
  resize();addEventListener('resize',resize);
  return {renderer,scene,camera,sky,boat,water,effects,islands,marine,settlementLife,beacons,setFishingVisuals:data=>marine?.setFishingVisuals(data),setCourse:value=>beacons?.setCourse(value),render,resize,resetCamera:()=>follow.reset(),updateCamera:(state,dt)=>follow.update(state,origin,dt,{reduced:state.reduced,islands:world?world.nearby(state.x,state.z,260,shoreList):null}),probeWaves:(x,z,time)=>probeWaves(renderer,x,z,time),setOrigin(x,z){origin.x=x;origin.z=z;},setQuality(value,scale=1){if(!QUALITY[value])throw new Error('Unknown quality '+value);tier=value;resolutionScale=scale;water.setQuality(value);effects.setQuality(value);islands?.setQuality(value);marine?.setQuality(value);settlementLife?.setQuality(value);beacons?.setQuality(value);sky.uniforms.uCloudEnabled.value=value==='emergency'?0:1;resize();},get tier(){return tier;},metrics(){const owned=new Set();scene.traverse(o=>{if(o.geometry)owned.add(o.geometry);});for(const g of Object.values(water.geometries))owned.add(g);const geometryBytes=[...owned].reduce((n,g)=>n+Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0)+(g.index?.array.byteLength||0),0)+(islands?.stats().geometryBytes||0)-(islands?.meshes||[]).reduce((n,m)=>n+Object.values(m.geometry.attributes).reduce((s,a)=>s+a.array.byteLength,0),0);return {beacons:beacons?.stats(),settlements:settlementLife?.stats(),marine:marine?.stats(),geometryBytes,gpuMs,gpuTimerSupported:!!timer,streamMs,viewMs,submitMs,resolutionScale,...follow.metrics(),...effects.stats,boatTriangles:boat.userData.triangles,boatDraws:boat.userData.draws,islandTriangles:islands?islands.triangles:0,islandMeshes:islands?islands.count:0,islandStream:islands?islands.stats():null,shoreUniforms:water.uniforms.uShoreCount.value,tier,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,waterTriangles:water.mesh.geometry.index.count/3,width:canvas.width,height:canvas.height,origin:{...origin},referenceHeight:boat.position.y,referencePitch:boat.rotation.x,referenceRoll:boat.rotation.z};}};
}
