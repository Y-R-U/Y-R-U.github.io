import {QUALITY} from './config.mjs';
// Pure topology builder, shared by render and Node topology checks.
export function radialMesh(tier){
  const {segments,bands}=QUALITY[tier],radii=[];let start=0;
  bands.forEach(([count,end],band)=>{for(let i=1;i<=count;i++)radii.push(band===3?start*(end/start)**(i/count):start+(end-start)*i/count);start=end;});
  const position=new Float32Array((1+radii.length*segments)*3),indices=new Uint16Array(segments*(2*radii.length-1)*3);
  for(let ring=0;ring<radii.length;ring++)for(let a=0;a<segments;a++){const p=3*(1+ring*segments+a),angle=a/segments*Math.PI*2;position[p]=Math.cos(angle)*radii[ring];position[p+2]=Math.sin(angle)*radii[ring];}
  let at=0;const tri=(a,b,c)=>{indices[at++]=a;indices[at++]=b;indices[at++]=c;};
  for(let a=0;a<segments;a++)tri(0,1+(a+1)%segments,1+a);
  for(let r=1;r<radii.length;r++)for(let a=0;a<segments;a++){const next=(a+1)%segments,inner=1+(r-1)*segments,outer=1+r*segments;tri(inner+a,inner+next,outer+a);tri(inner+next,outer+next,outer+a);}
  return {position,indices,radii,segments};
}
