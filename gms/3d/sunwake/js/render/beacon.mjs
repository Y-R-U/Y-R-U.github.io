import * as THREE from 'three';
import {mooringLayout} from '../core/island-shape.mjs';
import {BEACON_LIMITS} from '../core/visual-config.mjs';

// Navigation lights. One instanced draw for every harbour lamp in sight plus
// the pinned goal's signal, so this costs a single call at any tier.
//
// Why this exists: HORIZON_FADE reaches full haze at 650 m, so from 420 m out
// an island is a pale smudge and the player cannot tell a place worth sailing
// to from a rock. Rock is *meant* to fade — a light is not. These quads keep a
// screen-space floor instead of a world size, so a lamp never shrinks below a
// few pixels however far away it is, while the rock behind it keeps hazing.
//
// They are depth-tested, so an island still occludes its own lamp from the
// blind side and a nearer island still hides a farther one. Nothing here is a
// light source: no point lights, no bloom, no shadow work.

const LAMP_COLOUR=new THREE.Color('#ffae55');
const GOAL_COLOUR=new THREE.Color('#ffdfae');
const SHAFT_COLOUR=new THREE.Color('#ffae5e');
// Pixels of the viewport's short-axis height that each element must keep.
const LAMP_PIXELS=3.4,GOAL_PIXELS=7,SHAFT_WIDTH_PIXELS=4.4,SHAFT_HEIGHT_PIXELS=30;
const LAMP_MIN=1.5,LAMP_MAX=11,GOAL_MIN=3.6,SHAFT_MIN_WIDTH=2.6,SHAFT_MIN_HEIGHT=18;
// A lamp you are moored against does not need a halo; the emissive lamp box in
// the island's own geometry is doing that job from close range.
const NEAR_FADE=[55,240];
// Inside this the goal signal retires: you have arrived, it would only be glare.
const ARRIVED_FADE=[70,150];
// And beyond this it goes out. Islands stop being drawn at 1000 m, so a signal
// that carried further would be a light hanging in an empty sky over nothing.
const GOAL_RANGE=[1000,1200];

export function createBeacons(islands,world=null){
  const group=new THREE.Group(),geometry=new THREE.PlaneGeometry(1,1);
  const material=new THREE.MeshBasicMaterial({color:'#ffffff',transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  // Soft analytic falloff rather than a sprite texture: a radial lamp halo, or
  // a tapering column when the instance is flagged as the goal's light shaft.
  material.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float aShaft;varying vec2 vLampUv;varying float vShaft;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvLampUv=uv;vShaft=aShaft;');
    // A light column is brightest where it leaves the island and dissolves
    // upward; without that it reads as a laser rather than a loom.
    shader.fragmentShader='varying vec2 vLampUv;varying float vShaft;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',
      `float lampFall=1.0-smoothstep(0.0,0.5,length(vLampUv-0.5));lampFall*=lampFall;
       float column=(1.0-smoothstep(0.30,0.96,abs(vLampUv.x-0.5)*2.0))*(1.0-smoothstep(0.0,0.92,vLampUv.y));
       diffuseColor.a*=mix(lampFall,column,vShaft);
       #include <opaque_fragment>`);
  };
  const max=BEACON_LIMITS.high.lamps+2;
  const mesh=new THREE.InstancedMesh(geometry,material,max);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled=false;mesh.renderOrder=3;
  // setColorAt allocates instanceColor, which is what makes three compile the
  // USE_INSTANCING_COLOR path. Assigning the attribute by hand does not.
  mesh.setColorAt(0,new THREE.Color(0,0,0));mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const shaftFlag=new THREE.InstancedBufferAttribute(new Float32Array(max),1);
  shaftFlag.setUsage(THREE.DynamicDrawUsage);geometry.setAttribute('aShaft',shaftFlag);
  group.add(mesh);

  const dummy=new THREE.Object3D(),tint=new THREE.Color(),lamps=new Map();
  const axis=new THREE.Vector3(0,1,0);
  let tier='standard',course=null,probeAt=-Infinity,probed=null,lit=0,goalLit=false;

  // Lamp head of the harbour signal built in settlements.mjs: mast at
  // reach - 2.3 along the mooring bearing, lens at deck height + 4.7.
  function lampPoint(island){
    let point=lamps.get(island.id);
    if(!point){
      const dock=mooringLayout(island),s=dock.reach-2.3,t=-dock.width*.35;
      point={x:island.x+dock.nx*s-dock.nz*t,y:dock.y+4.7,z:island.z+dock.nz*s+dock.nx*t};
      lamps.set(island.id,point);
    }
    return point;
  }

  // Until the gameplay side calls setCourse(), read the published pin directly.
  // Once per second, off the render path's hot loop, and never fatal.
  function pinnedGoal(){
    if(course!==null)return course?.goal||null;
    if(!world||typeof window==='undefined')return null;
    const now=(typeof performance!=='undefined'?performance.now():Date.now())/1000;
    if(now-probeAt>=1){
      probeAt=now;
      try{
        const id=window.sunwake?.exploration?.pin||null;
        probed=id?(world.landmarks||[]).find(i=>i.id===id)||null:null;
      }catch{probed=null;}
    }
    return probed;
  }

  return {group,mesh,
    setQuality(value){tier=value;},
    // { goal: island | {id,x,z,height} | null } — null means "no goal signal".
    setCourse(value){course=value===undefined?null:(value||{goal:null});},
    stats(){return {lamps:lit,goal:goalLit,instances:mesh.count};},
    update(state,origin,camera,viewHeight){
      const limits=BEACON_LIMITS[tier]||BEACON_LIMITS.standard;
      const height=viewHeight>0?viewHeight:768;
      // World metres per viewport pixel at a given range, from the real FOV.
      const perPixel=d=>d*2*Math.tan(camera.fov*Math.PI/360)/height;
      const meshes=islands.meshes.filter(m=>m.visible);
      meshes.sort((a,b)=>(a.userData.island.x-state.x)**2+(a.userData.island.z-state.z)**2-((b.userData.island.x-state.x)**2+(b.userData.island.z-state.z)**2));
      const ids=new Set(meshes.map(m=>m.userData.island.id));
      for(const id of lamps.keys())if(!ids.has(id))lamps.delete(id);

      const goal=pinnedGoal();
      const pulse=state.reduced?1:.74+.26*Math.sin((state.time||0)*1.9);
      let count=0;lit=0;goalLit=false;
      const put=(x,y,z,w,h,colour,intensity,upright)=>{
        if(count>=max||!(intensity>.01))return;
        shaftFlag.setX(count,upright?1:0);
        dummy.position.set(x-origin.x,y,z-origin.z);
        if(upright){
          // Yaw-only billboard: a light column must stay vertical.
          const dx=camera.position.x-dummy.position.x,dz=camera.position.z-dummy.position.z;
          dummy.quaternion.setFromAxisAngle(axis,Math.atan2(dx,dz));
        }else dummy.quaternion.copy(camera.quaternion);
        dummy.scale.set(w,h,1);dummy.updateMatrix();
        mesh.setMatrixAt(count,dummy.matrix);
        tint.copy(colour).multiplyScalar(intensity);
        mesh.instanceColor.setXYZ(count,tint.r,tint.g,tint.b);
        count++;
      };

      for(const item of meshes){
        if(lit>=limits.lamps)break;
        const island=item.userData.island;
        const gap=Math.hypot(island.x-state.x,island.z-state.z)-island.radius;
        const point=lampPoint(island);
        const range=Math.hypot(point.x-origin.x-camera.position.x,point.z-origin.z-camera.position.z);
        const size=Math.min(LAMP_MAX,Math.max(LAMP_MIN,perPixel(range)*LAMP_PIXELS));
        // Landmarks carry the bigger signal lamp; ordinary landings are dimmer.
        const strength=(island.landmark?.62:.34)*(.30+.70*Math.min(1,Math.max(0,(gap-NEAR_FADE[0])/(NEAR_FADE[1]-NEAR_FADE[0]))));
        put(point.x,point.y,point.z,size,size,LAMP_COLOUR,strength,false);
        lit++;
      }

      if(goal&&limits.goal){
        const gx=goal.x,gz=goal.z,crown=Math.max(goal.height||6,5);
        const gap=Math.hypot(gx-state.x,gz-state.z)-(goal.radius||0);
        const arrive=Math.min(1,Math.max(0,(gap-ARRIVED_FADE[0])/(ARRIVED_FADE[1]-ARRIVED_FADE[0])))
          *(1-Math.min(1,Math.max(0,(gap-GOAL_RANGE[0])/(GOAL_RANGE[1]-GOAL_RANGE[0]))));
        const range=Math.hypot(gx-origin.x-camera.position.x,gz-origin.z-camera.position.z);
        const shaftW=Math.max(SHAFT_MIN_WIDTH,perPixel(range)*SHAFT_WIDTH_PIXELS);
        const shaftH=Math.max(SHAFT_MIN_HEIGHT,perPixel(range)*SHAFT_HEIGHT_PIXELS);
        const halo=Math.max(GOAL_MIN,perPixel(range)*GOAL_PIXELS);
        put(gx,crown+2+shaftH/2,gz,shaftW,shaftH,SHAFT_COLOUR,.52*arrive*pulse,true);
        put(gx,crown+2,gz,halo,halo,GOAL_COLOUR,.85*arrive*pulse,false);
        goalLit=arrive>.01;
      }

      mesh.count=count;mesh.visible=count>0;
      mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;shaftFlag.needsUpdate=true;
    },
    dispose(){geometry.dispose();material.dispose();lamps.clear();}};
}
