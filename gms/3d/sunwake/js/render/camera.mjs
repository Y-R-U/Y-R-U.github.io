import * as THREE from 'three';
import {CAMERA as C} from '../core/config.mjs';
import {clamp} from '../core/math.mjs';
import {sampleWave} from '../core/waves.mjs';
import {sweepIsland} from '../core/collision.mjs';
export function createFollowCamera(camera){
  const position=new THREE.Vector3(),target=new THREE.Vector3(),desired=new THREE.Vector3(),look=new THREE.Vector3(),wave={};
  let initialized=false,yaw=0,heave=0,roll=0,reach=1;
  const CAMERA_RADIUS=.4,TARGET_MARGIN=.5;
  const damp=(tau,dt)=>1-Math.exp(-dt/tau);
  return {reset(){initialized=false;reach=1;},update(b,origin,dt,{reduced=false,near=false,fixture=false,islands=null}={}){
    const first=!initialized;initialized=true;
    if(first)yaw=b.yaw;else yaw+=Math.atan2(Math.sin(b.yaw-yaw),Math.cos(b.yaw-yaw))*damp(C.yawTau,dt);
    const h=reduced?0:clamp(b.y,-.35,.35),r=reduced?0:C.rollFraction*b.roll;
    heave=first?h:heave+(h-heave)*damp(reduced?1.5:C.heaveTau,dt);roll=reduced?0:first?r:roll+(r-roll)*damp(C.rollTau,dt);
    const portrait=camera.aspect<1,behind=portrait?12.5:10.5;
    desired.set(b.x-Math.sin(yaw)*behind,(near?2.05:portrait?6:5.2)+(fixture?0:heave),b.z-Math.cos(yaw)*behind);
    look.set(b.x+Math.sin(yaw)*3,(near?1.2:.8)+(fixture?0:heave),b.z+Math.cos(yaw)*3);
    if(islands&&islands.length){
      // Keep the look target out of the stone, then sweep a 0.4 m camera sphere
      // from it toward the desired seat and stop short of the first wall.
      for(const island of islands){
        const dx=look.x-island.x,dz=look.z-island.z,distance=Math.hypot(dx,dz),clear=island.radius+TARGET_MARGIN;
        if(distance<clear){const nx=distance>1e-6?dx/distance:1,nz=distance>1e-6?dz/distance:0;look.x=island.x+nx*clear;look.z=island.z+nz*clear;}
      }
      let limit=1;
      const sweepX=desired.x-look.x,sweepZ=desired.z-look.z;
      for(const island of islands){const t=sweepIsland(look.x,look.z,sweepX,sweepZ,island,CAMERA_RADIUS);if(t!==null)limit=Math.min(limit,t);}
      // Shorten immediately when blocked, ease back out with tau 0.6 s.
      reach=limit<reach?limit:reach+(limit-reach)*damp(.6,dt);
      if(reach<1){desired.set(look.x+sweepX*reach,Math.max(desired.y,look.y+2),look.z+sweepZ*reach);}
    }else reach=1;
    if(first){position.copy(desired);target.copy(look);}else {position.lerp(desired,damp(C.positionTau,dt));target.lerp(look,damp(C.targetTau,dt));}
    sampleWave(position.x,position.z,b.time,wave);position.y=Math.max(position.y,wave.height+2,look.y+1);
    camera.position.set(position.x-origin.x,position.y,position.z-origin.z);camera.up.set(0,1,0);camera.lookAt(target.x-origin.x,target.y,target.z-origin.z);
    camera.rotateZ(fixture?0:roll);camera.updateMatrixWorld();
  },metrics(){return {cameraYaw:yaw,cameraRoll:roll,cameraHeave:heave,cameraReach:reach,cameraAbsolute:position.toArray(),cameraTarget:target.toArray()};}};
}
