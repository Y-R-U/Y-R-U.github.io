export const TAU=2*Math.PI;
export const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export const wrap=(v,period)=>((v%period)+period)%period;
// Simulation coordinates stay absolute doubles. Only the render origin moves.
export function rebaseOrigin(x,z,out){
  if(Math.hypot(x-out.x,z-out.z)>256){out.x=Math.round(x/256)*256;out.z=Math.round(z/256)*256;}
  return out;
}
export function rippleOffsets(x,z,time,out){
  const angle=67*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle);
  out[0]=wrap((x+.07*time)/5,1);out[1]=wrap((z+.02*time)/5,1);
  out[2]=wrap((c*x-s*z-.025*time)/2.3,1);out[3]=wrap((s*x+c*z+.045*time)/2.3,1);
  return out;
}
