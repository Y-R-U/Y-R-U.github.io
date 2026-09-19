import {BOAT as B} from './config.mjs';
import {clamp} from './math.mjs';
import {sampleWave} from './waves.mjs';
export const targetImmersion=B.mass*B.gravity/(4*B.spring);
export const forwardSpeed=b=>b.vx*Math.sin(b.yaw)+b.vz*Math.cos(b.yaw);
// R_y(yaw) R_x(-pitch) R_z(roll), including exact angle derivatives.
export function hullPoint(b,point,out={}){
  const [x,y,z]=point,cr=Math.cos(b.roll),sr=Math.sin(b.roll),cp=Math.cos(b.pitch),sp=Math.sin(b.pitch),cy=Math.cos(b.yaw),sy=Math.sin(b.yaw);
  const x1=cr*x-sr*y,y1=sr*x+cr*y,y2=cp*y1+sp*z,z2=-sp*y1+cp*z;
  const dx=cy*x1+sy*z2,dz=-sy*x1+cy*z2;
  out.x=b.x+dx;out.y=b.y+y2;out.z=b.z+dz;
  out.dp=z2;out.dr=cp*x1;
  out.vx=b.vx+b.yawRate*dz-b.pitchRate*sy*y2+b.rollRate*(-cy*y1-sy*sp*x1);
  out.vy=b.vy+b.pitchRate*out.dp+b.rollRate*out.dr;
  out.vz=b.vz-b.yawRate*dx-b.pitchRate*cy*y2+b.rollRate*(sy*y1-cy*sp*x1);
  return out;
}
export function createBoat(spawn={},world={},time=0){
  const b={x:0,z:0,y:0,vx:0,vz:0,vy:0,yaw:-Math.PI/2,yawRate:0,pitch:0,pitchRate:0,roll:0,rollRate:0,throttle:0,rudder:0,...spawn};
  const sample=world.sampleWave||sampleWave,w={},p={};
  // Solve the local support plane at the four actual transformed hull points.
  // At spawn there is no damping impulse or artificial velocity.
  if(!('y' in spawn))for(let iteration=0;iteration<16;iteration++){
    let height=0,fore=0,side=0;
    for(const point of B.points){hullPoint(b,point,p);sample(p.x,p.z,time,w);const error=w.height-targetImmersion-p.y;height+=error;fore+=error*p.dp;side+=error*p.dr;}
    b.y+=height/4;b.pitch=clamp(b.pitch+fore/(4*1.55**2),-B.pitchStop,B.pitchStop);b.roll=clamp(b.roll+side/(4*.60**2),-B.rollStop,B.rollStop);
  }
  world.clearSpawn?.(b);
  return b;
}
export function stepBoat(b,input,world,time,dt,scratch={}){
  const sample=world?.sampleWave||sampleWave,w=scratch.wave||(scratch.wave={}),p=scratch.point||(scratch.point={});
  b.throttle+=(clamp(input.throttle||0,-1,1)-b.throttle)*(1-Math.exp(-dt/B.throttleTau));
  b.rudder+=(clamp(input.steer||0,-1,1)-b.rudder)*(1-Math.exp(-dt/B.rudderTau));
  const sy=Math.sin(b.yaw),cy=Math.cos(b.yaw),u=forwardSpeed(b),side=b.vx*cy-b.vz*sy;
  const thrust=B.engineAhead*Math.max(b.throttle,0)+B.engineAstern*Math.min(b.throttle,0);
  const drag=-B.dragLinear*u-(u>=0?B.dragAhead:B.dragAstern)*u*Math.abs(u),lateral=-B.mass*B.lateralDrag*side;
  b.vx+=((thrust+drag)*sy+lateral*cy)/B.mass*dt;b.vz+=((thrust+drag)*cy-lateral*sy)/B.mass*dt;
  const speed=Math.hypot(b.vx,b.vz);if(speed>B.speedCap){b.vx*=B.speedCap/speed;b.vz*=B.speedCap/speed;}
  const yawTarget=b.rudder*Math.sign(u)*B.turnRate*Math.abs(u)/(Math.abs(u)+2);
  b.yawRate+=(yawTarget-b.yawRate)*(1-Math.exp(-dt/B.yawTau));
  let force=-B.mass*B.gravity,pitchTorque=-B.pitchDamping*b.pitchRate+B.enginePitch*b.throttle,rollTorque=-B.rollDamping*b.rollRate-B.mass*B.bankArm*u*b.yawRate,bowImpact=0;
  for(const point of B.points){
    hullPoint(b,point,p);sample(p.x,p.z,time,w);const immersion=w.height-p.y,impact=w.dt+w.dx*p.vx+w.dz*p.vz-p.vy;
    const support=immersion>0?clamp(B.spring*immersion+B.damper*impact,0,B.mass*B.gravity/2):0;
    force+=support;pitchTorque+=support*p.dp;rollTorque+=support*p.dr;
    if(point[2]>0&&immersion>0)bowImpact=Math.max(bowImpact,impact);
  }
  // Progressive righting outside the comfortable operating band. Required by
  // A1 sea state: the literal support-only model hits both emergency stops.
  for(const [angle,rate,start,k,damping]of [['pitch','pitchRate',B.pitchRightingStart,B.pitchRighting,B.pitchRightingDamping],['roll','rollRate',B.rollRightingStart,B.rollRighting,B.rollRightingDamping]]){
    const excess=Math.max(0,Math.abs(b[angle])-start),ramp=clamp(excess/(2*Math.PI/180),0,1);
    const torque=-Math.sign(b[angle])*k*excess-damping*b[rate]*ramp;
    if(angle==='pitch')pitchTorque+=torque;else rollTorque+=torque;
  }
  b.vy+=force/B.mass*dt;b.pitchRate+=pitchTorque/B.pitchInertia*dt;b.rollRate+=rollTorque/B.rollInertia*dt;
  const previousX=b.x,previousZ=b.z;
  b.x+=b.vx*dt;b.z+=b.vz*dt;b.y+=b.vy*dt;b.yaw+=b.yawRate*dt;b.pitch+=b.pitchRate*dt;b.roll+=b.rollRate*dt;
  for(const [angle,rate,limit]of [['pitch','pitchRate',B.pitchStop],['roll','rollRate',B.rollStop]])if(Math.abs(b[angle])>limit){b[angle]=clamp(b[angle],-limit,limit);if(b[angle]*b[rate]>0)b[rate]=0;}
  scratch.bowImpact=bowImpact;
  // Shore collision is injected, never sampled: sweep the step we just took.
  scratch.contact=world?.resolveBoat?.(b,previousX,previousZ,dt)||null;
  return b;
}
