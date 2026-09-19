import {SEA_STATE,WAVE_SETTINGS} from './config.mjs';
import {TAU,wrap} from './math.mjs';
export const WAVES=Object.freeze(WAVE_SETTINGS.map(w=>{const theta=w.direction*Math.PI/180,k=TAU/w.wavelength;return Object.freeze({...w,amplitude:w.amplitude*SEA_STATE,k,omega:Math.sqrt(9.81*k),x:Math.sin(theta),z:Math.cos(theta)});}));
export const MAX_HEIGHT=WAVES.reduce((n,w)=>n+w.amplitude,0);
export const MAX_SLOPE=WAVES.reduce((n,w)=>n+w.amplitude*w.k,0);
export const MAX_VERTICAL_SPEED=WAVES.reduce((n,w)=>n+w.amplitude*w.omega,0);
export const FOAM_HEIGHT=MAX_HEIGHT*.70;
export function sampleWave(x,z,time,out){
  let h=0,dx=0,dz=0,dt=0;
  for(const w of WAVES){const q=w.k*(w.x*x+w.z*z)-w.omega*time+w.phase,c=w.amplitude*Math.cos(q);h+=w.amplitude*Math.sin(q);dx+=c*w.k*w.x;dz+=c*w.k*w.z;dt-=c*w.omega;}
  const n=1/Math.hypot(dx,1,dz);
  out.height=h;out.dx=dx;out.dz=dz;out.dt=dt;out.nx=-dx*n;out.ny=n;out.nz=-dz*n;return out;
}
export function phaseAtOrigin(x,z,time,out){for(let i=0;i<WAVES.length;i++){const w=WAVES[i];out[i]=wrap(w.k*(w.x*x+w.z*z)-w.omega*time+w.phase,TAU);}return out;}
