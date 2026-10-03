import * as THREE from 'three';

// A compact native miniature kit: softened silhouettes and world-scaled
// procedural surfaces, with no downloads or changes to the physical district.
export const PALETTE = {
  '#8a9d61':'#9caf83', '#637e59':'#789076', '#8b856d':'#b29a83',
  '#748579':'#c9c1b0', '#495958':'#58636a', '#69786c':'#8b958e',
  '#61716b':'#b3afa4', '#526866':'#4b6269', '#e1d7b9':'#f4e3c6',
  '#e3d9be':'#f2e2c6', '#3d7073':'#5d9292', '#b76c4a':'#ce8b68',
  '#b9ba99':'#d7dcc0', '#ba976f':'#d6ae80', '#b8ae94':'#c9bfa8',
  '#eab35f':'#f2bd70', '#9cac69':'#a3b78d', '#6f9160':'#819c76',
  '#95a366':'#a6ba8c', '#c0c4ad':'#d3ceb9', '#38555a':'#486570',
};
export function softenedBox(radius=.055) {
  const positions=[],normals=[],uvs=[],inner=.5-radius;
  const append=(poly)=>{
    const center=poly.reduce((sum,p)=>sum.add(new THREE.Vector3(...p)),new THREE.Vector3()).divideScalar(poly.length);
    const normal=new THREE.Vector3(...poly[1]).sub(new THREE.Vector3(...poly[0])).cross(new THREE.Vector3(...poly[2]).sub(new THREE.Vector3(...poly[0])));
    if(normal.dot(center)<0)poly.reverse();
    for(let i=1;i<poly.length-1;i++)for(const p of [poly[0],poly[i],poly[i+1]]){
      positions.push(...p);const n=new THREE.Vector3(...p).sub(new THREE.Vector3(...p.map(v=>THREE.MathUtils.clamp(v,-inner,inner)))).normalize();normals.push(n.x,n.y,n.z);uvs.push(p[0]+.5,p[2]+.5);
    }
  };
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
    const a=(axis+1)%3,b=(axis+2)%3;
    append([[-1,-1],[-1,1],[1,1],[1,-1]].map(([s,t])=>{const p=[0,0,0];p[axis]=sign*.5;p[a]=s*inner;p[b]=t*inner;return p;}));
  }
  for(let axis=0;axis<3;axis++)for(const s of [-1,1])for(const t of [-1,1]){
    const a=(axis+1)%3,b=(axis+2)%3;append([[-1,0],[-1,1],[1,1],[1,0]].map(([u,edge])=>{const p=[0,0,0];p[axis]=u*inner;p[a]=s*(edge?inner:.5);p[b]=t*(edge?.5:inner);return p;}));
  }
  for(const x of [-1,1])for(const y of [-1,1])for(const z of [-1,1])append([[x*.5,y*inner,z*inner],[x*inner,y*.5,z*inner],[x*inner,y*inner,z*.5]]);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));return g;
}
const textureCache=new Map();
function noise(seed){let n=seed;return()=>{n=Math.imul(n^n>>>15,2246822519);n=(n+3266489917)|0;return(n>>>0)/4294967296;};}
function texture(kind){
  if(textureCache.has(kind))return textureCache.get(kind);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const ctx=canvas.getContext('2d'),rng=noise(kind.length*117+kind.charCodeAt(0));
  ctx.fillStyle=kind==='paving'?'#e7e3d9':'#eeeeeb';ctx.fillRect(0,0,256,256);
  if(kind==='paving'){
    for(let y=0;y<256;y+=32)for(let x=-32;x<256;x+=64){const dx=x+(y/32%2)*32;const v=205+Math.floor(rng()*35);ctx.fillStyle=`rgb(${v+5},${v+2},${v-3})`;ctx.fillRect(dx+2,y+2,60,28);ctx.fillStyle='#faf7ed';ctx.fillRect(dx+3,y+3,58,2);ctx.fillStyle='#bdbab1';ctx.fillRect(dx+3,y+28,58,2);}
  }else{
    for(let i=0;i<6500;i++){const x=rng()*256,y=rng()*256,v=kind==='asphalt'?155+rng()*85:190+rng()*60;ctx.fillStyle=`rgba(${v|0},${v|0},${(v*.96)|0},${kind==='grass'?.16:.32})`;ctx.fillRect(x,y,rng()>0.96?5:1,rng()>0.97?3:1);}
    if(kind==='grass')for(let i=0;i<80;i++){const x=rng()*256,y=rng()*256,r=8+rng()*24,grad=ctx.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,rng()>.5?'#b9c3ab20':'#ffffff33');grad.addColorStop(1,'#eeeeeb00');ctx.fillStyle=grad;ctx.fillRect(x-r,y-r,r*2,r*2);}
  }
  const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=4;textureCache.set(kind,tex);return tex;
}
const ROLES=new Map([
  ['#8a9d61','grass'],['#637e59','grass'],['#95a366','grass'],['#9cac69','grass'],['#6f9160','grass'],
  ['#495958','asphalt'],['#69786c','asphalt'],['#61716b','paving'],['#748579','paving'],['#c0c4ad','paving'],['#788679','paving'],['#8f9d88','paving'],
]);
export function craftMaterial(color,emissive=0,metalness=0,roughness=.75){
  const paletteColor=PALETTE[color]||color,role=ROLES.get(color),material=new THREE.MeshStandardMaterial({color:paletteColor,emissive:paletteColor,emissiveIntensity:emissive,metalness,roughness:role==='asphalt'?.88:role==='grass'?.98:Math.min(roughness,.7),envMapIntensity:metalness>.2?.8:.35});
  if(role){
    material.map=texture(role);material.onBeforeCompile=shader=>{
      shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vCraftWorld;').replace('#include <project_vertex>',`#include <project_vertex>
vec4 craftPosition=vec4(transformed,1.0);
#ifdef USE_INSTANCING
craftPosition=instanceMatrix*craftPosition;
#endif
vCraftWorld=(modelMatrix*craftPosition).xyz;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec3 vCraftWorld;').replace('#include <map_fragment>',`diffuseColor*=texture2D(map,vCraftWorld.xz*${role==='paving'?'0.14':role==='asphalt'?'0.55':'0.065'});`);
    };material.customProgramCacheKey=()=>`transport-craft-${role}`;
  }
  return material;
}
let environment=null;
export function miniatureEnvironment(){
  if(environment)return environment;const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;const ctx=canvas.getContext('2d'),g=ctx.createLinearGradient(0,0,0,64);g.addColorStop(0,'#b6d3df');g.addColorStop(.46,'#f4dfc6');g.addColorStop(.52,'#c0b69d');g.addColorStop(1,'#84948a');ctx.fillStyle=g;ctx.fillRect(0,0,128,64);const glow=ctx.createRadialGradient(23,23,0,23,23,17);glow.addColorStop(0,'#fff6da');glow.addColorStop(1,'#fff0d000');ctx.fillStyle=glow;ctx.fillRect(5,5,36,36);environment=new THREE.CanvasTexture(canvas);environment.colorSpace=THREE.SRGBColorSpace;environment.mapping=THREE.EquirectangularReflectionMapping;return environment;
}
let shadowTexture=null;
export function contactTexture(){
  if(shadowTexture)return shadowTexture;const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,4,32,32,32);g.addColorStop(0,'#ffffffff');g.addColorStop(.5,'#ffffff88');g.addColorStop(1,'#ffffff00');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);shadowTexture=new THREE.CanvasTexture(canvas);return shadowTexture;
}
export function streetCraft(b,half,radius,ringPose,length,allowed=()=>true){
  const kerb='#e2d5bf',hedge='#7c9c68';
  for(let d=0;d<length;d+=1.6){if(!allowed(d))continue;const p=ringPose(d,half,radius),nx=-Math.sin(p.angle),nz=Math.cos(p.angle);for(const side of [-1,1]){const offset=side*4.15;b.box(kerb,p.x+nx*offset,.55,p.z+nz*offset,1.5,.18,.36,-p.angle);}}
  for(let d=0;d<length;d+=12){if(!allowed(d))continue;const p=ringPose(d,half,radius),nx=-Math.sin(p.angle),nz=Math.cos(p.angle);b.box('#c8bfa9',p.x+nx*6,.4,p.z+nz*6,4.4,.3,2,-p.angle);for(let i=0;i<4;i++){const x=p.x+nx*6+Math.cos(p.angle)*(i-1.5)*.85,z=p.z+nz*6+Math.sin(p.angle)*(i-1.5)*.85;b.sphere(hedge,x,.95,z,.9,1,.9);b.sphere(i%2?'#e9be90':'#d9d598',x+.12,1.35,z+.15,.16,.16,.16);}}
}
export function plotCraft(b,kind,rng){
  // A finite paved yard, little habitat patches and warm timber fencing give
  // every business a built footprint instead of props scattered on one lawn.
  b.box(kind==='farm'?'#6f9160':kind==='quarry'?'#a68c70':'#ad9c80',20,.275,1,28,.06,27);
  b.box('#788679',16.5,.3,3,9,.17,8);
  for(let i=0;i<5;i++){const x=12.2+i*2.2;b.box('#e2d5bf',x,.43,7.2,2,.18,.25);}
  for(const [x,z] of [[11,0],[25,4],[25,-5]]){
    b.box('#b7a48a',x,.52,z,1.45,.45,1.0);b.sphere('#89a979',x,.95,z,1.3,.75,1);for(let i=0;i<3;i++)b.sphere(['#efc688','#e7a494','#e1d6a9'][i],x-.4+i*.4,1.15,z+.1,.18,.18,.18);
  }
  if(kind!=='harbor'&&kind!=='airport')for(let i=0;i<6;i++){const x=12+i*2.3;b.box('#b49b76',x,.94,-9,.13,1.1,.13);if(i<5){b.box('#ccb68f',x+1.15,1.22,-9,2.3,.11,.1);b.box('#ccb68f',x+1.15,.83,-9,2.3,.11,.1);}}
  // Workshop supply props, pallet slats, tool drums and a staff picnic corner.
  for(let i=0;i<4;i++){b.box('#bd9569',23+i%2*.68,.66,1+Math.floor(i/2)*.72,.58,.54,.58);b.box('#e0c299',23+i%2*.68,.95,1+Math.floor(i/2)*.72,.6,.07,.6);}
  for(const z of [2.5,3.15]){b.cyl('#769e9e',25,.76,z,.45,.65,.45);b.cyl('#d6ded0',25,1.1,z,.48,.04,.48);}
  b.box('#aa8561',24,.9,-7,2.2,.14,.65);for(const x of [23.1,24.9])b.box('#52645e',x,.61,-7,.12,.55,.12);
  b.box('#aa8561',24,.67,-6.3,2,.12,.35);
}
