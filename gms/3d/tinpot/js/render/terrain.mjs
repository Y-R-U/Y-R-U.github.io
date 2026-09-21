import * as THREE from 'three';
import {rng} from '../core/rng.mjs';
import {centre,corridorWidth,groundNoise,groundNoise2,smooth,track,trackWidth} from '../core/landscape.mjs';

const C=h=>new THREE.Color(h);
const LIGHT_BLADE=C(0xaebe72);
const PAL={
 deep:C(0x15322b),   // forest interior floor — the dark value anchor
 floor:C(0x244637),  // forest floor just inside the treeline
 moss:C(0x3d6448),   // mossy contact band where canopy meets meadow
 damp:C(0x475c3d),   // damp hollows: green-grey, never blue-grey
 mud:C(0x6d563c),    // trampled earth
 grass:C(0x63783f),
 lush:C(0x87a04e),
 straw:C(0xa89e5b),
 path:C(0xaa9468),
 rut:C(0x7c6a4d),
 grit:C(0x95885f),
};

function groundColour(out,x,z,map){
 const d=Math.abs(x-centre(z,map)),width=corridorWidth(z,map);
 const n=groundNoise(x,z),n2=groundNoise2(x,z);
 out.copy(PAL.grass).lerp(PAL.lush,smooth(.34,.62,n));
 out.lerp(PAL.straw,smooth(.63,.84,n)*.9);
 out.lerp(PAL.damp,smooth(.44,.2,n));
 out.lerp(PAL.mud,smooth(.74,.93,n2)*.5);
 out.lerp(PAL.moss,smooth(width-2.4,width+.3,d));
 out.lerp(PAL.floor,smooth(width-.2,width+2.2,d));
 out.lerp(PAL.deep,smooth(width+2,width+7,d));
 return out;
}

export function createTerrain(scene,map){
 const random=rng(map.seed),dummy=new THREE.Object3D(),colour=new THREE.Color(),tmp=new THREE.Color();

 // --- ground -------------------------------------------------------------------------------
 const geo=new THREE.PlaneGeometry(map.width,map.depth,170,210);geo.rotateX(-Math.PI/2);
 const p=geo.attributes.position,colors=[];
 for(let i=0;i<p.count;i++){
  const x=p.getX(i),z=p.getZ(i),d=Math.abs(x-centre(z,map)),width=corridorWidth(z,map);
  // Only ever raise the forest floor, never dig it out — trees and props stand at y=0.
  const rise=smooth(width-.5,width+5,d)*(.1+.5*groundNoise2(z*.9+31,x*.8-17));
  if(rise>0)p.setY(i,rise);
  const c=groundColour(tmp,x,z,map);
  const j=.93+random()*.14;colors.push(c.r*j,c.g*j,c.b*j);
 }
 geo.computeVertexNormals();
 geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const ground=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.97}));
 ground.receiveShadow=true;scene.add(ground);

 // --- the track: a real ribbon, so the ruts stay crisp and the edge feathers away -----------
 {
  const cols=[-1,-.78,-.6,-.42,-.2,0,.2,.42,.6,.78,1],rows=[],pos=[],col=[],idx=[];
  for(let z=-map.depth/2;z<=map.depth/2;z+=.65)rows.push(z);
  for(let r=0;r<rows.length;r++){
   const z=rows[r],tw=trackWidth(z),tx=track(z,map);
   const d=Math.abs(tx-centre(z,map)),width=corridorWidth(z,map);
   const buried=smooth(width-1.6,width+1.2,d);
   for(let ci=0;ci<cols.length;ci++){
    const u=cols[ci],wob=Math.sin(z*1.7+ci)*.05;
    const x=tx+u*tw*1.05+wob;
    const a=Math.abs(u);
    groundColour(tmp,x,z,map);
    if(a>=.99)colour.copy(tmp);
    else if(a>=.6)colour.copy(PAL.grit).lerp(tmp,(a-.6)*2.55);
    else if(a>.3&&a<.52)colour.copy(PAL.rut);
    else colour.copy(PAL.path);
    colour.lerp(tmp,buried*.9);
    const cd=Math.abs(x-centre(z,map)),j=.93+random()*.14;
    pos.push(x,.02+smooth(width-.5,width+5,cd)*(.1+.5*groundNoise2(z*.9+31,x*.8-17)),z);
    col.push(colour.r*j,colour.g*j,colour.b*j);
   }
  }
  for(let r=0;r<rows.length-1;r++)for(let ci=0;ci<cols.length-1;ci++){
   const a=r*cols.length+ci,b=a+1,c2=a+cols.length,d2=c2+1;idx.push(a,c2,b,b,c2,d2);
  }
  const pg=new THREE.BufferGeometry();
  pg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
  pg.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  pg.setIndex(idx);pg.computeVertexNormals();
  const pathMesh=new THREE.Mesh(pg,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  pathMesh.receiveShadow=true;scene.add(pathMesh);
 }

 // --- grass: lit, so it goes dark in shadow instead of glowing like confetti ----------------
 const blade=new THREE.BufferGeometry();
 blade.setAttribute('position',new THREE.Float32BufferAttribute([
  -.055,0,0, .055,0,0, .022,.46,.02,
  0,0,-.05, 0,0,.05, .03,.34,-.02],3));
 blade.setAttribute('normal',new THREE.Float32BufferAttribute([0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,1,0],3));
 const grassMat=new THREE.MeshLambertMaterial({side:THREE.DoubleSide});
 const clock={value:0};
 grassMat.onBeforeCompile=sh=>{sh.uniforms.windTime=clock;sh.vertexShader='uniform float windTime;\n'+sh.vertexShader;
  sh.vertexShader=sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed.x += sin(windTime*1.4+instanceMatrix[3].x*.7+instanceMatrix[3].z*.4)*position.y*.30;\ntransformed.z += cos(windTime*1.1+instanceMatrix[3].z*.5)*position.y*.14;');
  // A blade is a vertical sliver: seen from above, roughly half of them are back-facing, and
  // DOUBLE_SIDED then flips the shading normal to point at the ground. That is what turned the
  // grass into black static. Force the normal back to the one we authored (straight up).
  sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_begin>','#include <normal_fragment_begin>\nnormal = normalize( vNormal );\nnonPerturbedNormal = normal;');};
 const MAX_GRASS=9500;
 const grass=new THREE.InstancedMesh(blade,grassMat,MAX_GRASS);grass.receiveShadow=true;
 let count=0;const grassRecords=[];
 for(let i=0;i<60000&&count<MAX_GRASS;i++){
  const x=(random()-.5)*map.width,z=(random()-.5)*map.depth;
  const d=Math.abs(x-centre(z,map)),width=corridorWidth(z,map);
  if(d>width+1.2)continue;
  const tw=trackWidth(z);
  if(Math.abs(x-track(z,map))<tw*1.35)continue;                 // never on the track
  const n=groundNoise(x,z),n2=groundNoise2(x,z);
  if(n2>.78)continue;                                          // bald where the mud is
  if(random()>.07+smooth(.3,.74,n)*.55)continue;                // thinned by the ground mask
  const edge=smooth(width-2.6,width+1,d);
  dummy.position.set(x,.02,z);dummy.rotation.set(0,random()*6.28,0);
  dummy.scale.set(.62+random()*.6,.55+random()*.75+n*.35,.62+random()*.6);
  dummy.updateMatrix();grass.setMatrixAt(count,dummy.matrix);
  groundColour(colour,x,z,map).lerp(LIGHT_BLADE,.5+random()*.24);
  colour.multiplyScalar((.92+random()*.16)*(1-edge*.3));
  grass.setColorAt(count,colour);
  grassRecords.push({x,z,index:count});count++;
 }
 grass.count=count;scene.add(grass);

 // --- loose stone, bracken and saplings loosening out of the treeline ------------------------
 const stones=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x8e8878,roughness:.9,flatShading:true}),620);
 for(let i=0;i<620;i++){
  const z=(random()-.5)*(map.depth-6);
  const trackside=i<380;
  const x=trackside?track(z,map)+(i%2?1:-1)*trackWidth(z)*(1.3+random()*.8)
                   :centre(z,map)+(i%2?1:-1)*(corridorWidth(z,map)-.8+random()*2.4);
  dummy.position.set(x,trackside?.04:.22,z);
  dummy.scale.setScalar(trackside?.05+random()*.11:.18+random()*.5);
  dummy.rotation.set(random()*2,random()*6,random());dummy.updateMatrix();
  stones.setMatrixAt(i,dummy.matrix);
  stones.setColorAt(i,colour.setHSL(.09+random()*.05,.09+random()*.08,.42+random()*.2));
 }
 stones.castShadow=stones.receiveShadow=true;scene.add(stones);

 const scrub=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({roughness:1,flatShading:true}),420);
 for(let i=0;i<420;i++){
  const z=(random()-.5)*(map.depth-4);
  const w=corridorWidth(z,map),reach=random()**1.7*4.2;
  const x=centre(z,map)+(i%2?1:-1)*(w-1.6+reach);
  dummy.position.set(x,.2+random()*.2,z);
  dummy.rotation.set(random()*.6,random()*6,random()*.6);
  dummy.scale.set(.35+random()*.6,.3+random()*.75,.35+random()*.6);
  dummy.updateMatrix();scrub.setMatrixAt(i,dummy.matrix);
  const kind=i%5;
  scrub.setColorAt(i,colour.setHSL(kind===0?.085:kind===1?.13:.26+random()*.07,.34+random()*.2,.17+random()*.16));
 }
 scrub.castShadow=scrub.receiveShadow=true;scene.add(scrub);

 // saplings: thin sticks with a small crown, scattered through the scrub band
 const sapTrunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.04,.07,1,4),new THREE.MeshStandardMaterial({color:0x5d4b3a,roughness:1}),120);
 const sapTop=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({roughness:.95,flatShading:true}),120);
 for(let i=0;i<120;i++){
  const z=(random()-.5)*(map.depth-6),w=corridorWidth(z,map);
  const x=centre(z,map)+(i%2?1:-1)*(w-1.1+random()**1.5*3.4),h=1.2+random()*1.6;
  dummy.position.set(x,h/2,z);dummy.scale.set(1,h,1);dummy.rotation.set(0,0,(random()-.5)*.25);
  dummy.updateMatrix();sapTrunk.setMatrixAt(i,dummy.matrix);
  dummy.position.set(x,h+.2,z);dummy.scale.set(.45+random()*.3,.5+random()*.4,.45+random()*.3);
  dummy.rotation.set(random(),random()*6,random()*.4);dummy.updateMatrix();sapTop.setMatrixAt(i,dummy.matrix);
  sapTop.setColorAt(i,colour.setHSL(.19+random()*.13,.42,.2+random()*.12));
 }
 sapTrunk.castShadow=sapTop.castShadow=true;sapTop.receiveShadow=true;scene.add(sapTrunk,sapTop);

 // --- puddles sit in the wheel ruts ----------------------------------------------------------
 // metalness with no environment map renders as a flat black disc — keep it dielectric and
 // let the sun's specular do the "wet" for us.
 const puddles=new THREE.InstancedMesh(new THREE.CircleGeometry(1,14),new THREE.MeshStandardMaterial({color:0x7c8a72,metalness:0,roughness:.09}),10);
 for(let i=0;i<10;i++){
  const z=-32+i*7.1,tw=trackWidth(z);
  dummy.position.set(track(z,map)+(i%2?1:-1)*tw*.52,.028,z);
  dummy.rotation.set(-Math.PI/2,0,z);dummy.scale.set(.3+random()*.3,.55+random()*.7,1);
  dummy.updateMatrix();puddles.setMatrixAt(i,dummy.matrix);
 }
 scene.add(puddles);

 // --- burn scars -----------------------------------------------------------------------------
 const scars=new THREE.InstancedMesh(new THREE.CircleGeometry(1,10),new THREE.MeshStandardMaterial({color:0x241b15,roughness:1,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3}),3000);
 scars.count=0;scene.add(scars);
 let revision=-1;const hiddenGrass=new Set();

 return {ground,update(t,w){
  clock.value=t;
  if(!w||revision===w.forestRevision)return;
  revision=w.forestRevision;
  let n=0;const dead=w.trees.filter(tree=>tree.dead);
  for(const tree of dead){if(n>=3000)break;
   dummy.position.set(tree.x,.03,tree.z);dummy.rotation.set(-Math.PI/2,0,tree.shade*6);
   dummy.scale.setScalar(tree.radius*1.4);dummy.updateMatrix();scars.setMatrixAt(n++,dummy.matrix);}
  scars.count=n;scars.instanceMatrix.needsUpdate=true;
  for(const b of grassRecords){
   if(hiddenGrass.has(b.index))continue;
   if(dead.some(tree=>Math.abs(tree.x-b.x)<tree.radius*1.3&&Math.abs(tree.z-b.z)<tree.radius*1.3)){
    hiddenGrass.add(b.index);dummy.scale.setScalar(0);dummy.updateMatrix();
    grass.setMatrixAt(b.index,dummy.matrix);grass.instanceMatrix.needsUpdate=true;}
  }
 }};
}
