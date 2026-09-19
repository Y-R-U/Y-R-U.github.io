import * as THREE from 'three';
// Periodic Fourier noise: wrap is intrinsic, including the first derivative.
function texture(size, fill) {
  const data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) fill(x/size,y/size,data,4*(y*size+x));
  const t=new THREE.DataTexture(data,size,size,THREE.RGBAFormat);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;
  t.generateMipmaps=true;t.needsUpdate=true;return t;
}
export function createCloudTexture() {
  const modes=[];let seed=8173;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(let i=0;i<28;i++) modes.push([1+Math.floor(random()*12),Math.floor(random()*10)-5,random()*Math.PI*2,1/(1+i*.35)]);
  return texture(128,(x,y,d,i)=>{let v=0,total=0;for(const [a,b,p,w]of modes){v+=Math.sin(2*Math.PI*(a*x+b*y)+p)*w;total+=w;}const n=Math.round((.5+.5*v/total)*255);d.set([n,n,n,255],i);});
}
export function createRippleTexture(){
  const modes=[];let seed=72941;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  // Integer frequencies make the height and its derivatives exactly periodic.
  for(let i=0;i<38;i++){const a=1+Math.floor(random()*22),b=Math.floor(random()*16)-8; modes.push([a,b,random()*Math.PI*2,1/Math.hypot(a,b)]);}
  return texture(256,(x,y,d,i)=>{let dx=0,dy=0;for(const [a,b,phase,amp]of modes){const c=Math.cos(2*Math.PI*(a*x+b*y)+phase)*amp;dx+=a*c;dy+=b*c;}dx=Math.tanh(dx*.28);dy=Math.tanh(dy*.28);d.set([Math.round((dx*.5+.5)*255),Math.round((dy*.5+.5)*255),255,255],i);});
}
