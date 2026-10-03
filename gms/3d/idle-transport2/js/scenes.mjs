import * as THREE from 'three';
import { ROUTES } from './economy.mjs?v=20261003-business3';

// Every site is built from batched primitives. One offscreen renderer feeds
// DOM-owned presentation canvases; hero and cards observe the same world.
const UP = new THREE.Vector3(0, 1, 0);
const geometries = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cylinder: new THREE.CylinderGeometry(.5, .5, 1, 12),
  cone: new THREE.ConeGeometry(.5, 1, 7),
  sphere: new THREE.IcosahedronGeometry(.5, 1),
  rock: new THREE.IcosahedronGeometry(.5, 0),
  plane: new THREE.PlaneGeometry(1, 1),
};
const materials = new Map();
function mat(color, emissive = 0, metalness = 0, roughness = .75) {
  const key = `${color}/${emissive}/${metalness}/${roughness}`;
  if (!materials.has(key)) materials.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive: color, emissiveIntensity: emissive }));
  return materials.get(key);
}
function random(seed) {
  let n = 2166136261;
  for (const char of seed) n = Math.imul(n ^ char.charCodeAt(0), 16777619);
  return () => { n += 0x6D2B79F5; let v = n; v = Math.imul(v ^ v >>> 15, v | 1); v ^= v + Math.imul(v ^ v >>> 7, v | 61); return ((v ^ v >>> 14) >>> 0) / 4294967296; };
}
function makeBuilder(scene) {
  const batches = new Map();
  const dummy = new THREE.Object3D();
  function primitive(shape, color, x, y, z, sx, sy, sz, rotation = 0, emissive = 0, metalness = 0, roughness = .75) {
    const material = mat(color, emissive, metalness, roughness);
    const key = `${shape}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { shape, material, matrices: [] });
    dummy.position.set(x, y, z); dummy.scale.set(sx, sy, sz); dummy.rotation.set(0, rotation, 0); dummy.updateMatrix();
    batches.get(key).matrices.push(dummy.matrix.clone());
  }
  const box = (...args) => primitive('box', ...args);
  const cyl = (...args) => primitive('cylinder', ...args);
  const cone = (...args) => primitive('cone', ...args);
  const sphere = (...args) => primitive('sphere', ...args);
  const rock = (...args) => primitive('rock', ...args);
  function beam(color, a, b, width = .12, depth = width) {
    const material = mat(color); const key = `box:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, {shape:'box',material,matrices:[]});
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    dummy.position.copy(start).add(end).multiplyScalar(.5);
    dummy.quaternion.setFromUnitVectors(UP, end.sub(start).normalize());
    dummy.scale.set(width, new THREE.Vector3(...a).distanceTo(new THREE.Vector3(...b)), depth); dummy.updateMatrix();
    batches.get(key).matrices.push(dummy.matrix.clone());
  }
  function finish() {
    for (const {shape,material,matrices} of batches.values()) {
      const mesh = new THREE.InstancedMesh(geometries[shape], material, matrices.length);
      matrices.forEach((matrix,i) => mesh.setMatrixAt(i,matrix)); mesh.castShadow = true; mesh.receiveShadow = true; scene.add(mesh);
    }
  }
  return {box,cyl,cone,sphere,rock,beam,finish};
}
function dynamicMesh(group, shape, color, x,y,z,sx,sy,sz, emissive=0, metalness=0) {
  const mesh = new THREE.Mesh(geometries[shape], mat(color,emissive,metalness));
  mesh.position.set(x,y,z); mesh.scale.set(sx,sy,sz); mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); return mesh;
}
function sign(scene, text, x,y,z, color='#f9eccb', size=2.5) {
  const canvas = document.createElement('canvas'); canvas.width=512; canvas.height=128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle='#152b32'; ctx.fillRect(0,0,512,128);
  ctx.strokeStyle=color; ctx.lineWidth=5; ctx.strokeRect(7,7,498,114);
  ctx.fillStyle=color; ctx.font='bold 48px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(text.toUpperCase().slice(0,24),256,66,475);
  const texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(size,size/4),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));
  mesh.position.set(x,y,z); scene.add(mesh); return mesh;
}
function tree(b,x,z,scale,rng,kind='pine') {
  const h=scale*(.9+rng()*.25); b.cyl('#625345',x,h*.7,z,h*.16,h*1.4,h*.16);
  if (kind==='pine') {
    b.cone('#234f40',x,h*1.4,z,h*1.2,h*1.55,h*1.2);
    b.cone('#397258',x,h*1.9,z,h*.94,h*1.25,h*.94);
    b.cone('#60916a',x,h*2.35,z,h*.55,h*.85,h*.55);
  } else {
    b.sphere('#4f7b45',x,h*1.7,z,h*1.9,h*1.6,h*1.7);
    b.sphere('#86a554',x+h*.4,h*2,z+h*.2,h*1.2,h*1.2,h*1.2);
    b.sphere('#b2b85e',x-h*.35,h*1.8,z+h*.4,h*1.1,h,h*1.1);
  }
}
function building(b,x,z,w,d,h,color,roof='#294d52') {
  b.box('#8c8a74',x,.25,z,w+.5,.5,d+.5);
  b.box(color,x,h/2+.5,z,w,h,d);
  b.box(roof,x,h+.6,z,w+.45,.23,d+.45);
  b.box('#dfc99f',x,h+.35,z+d/2+.06,w,.22,.15);
  for (let px=x-w/2+.65;px<x+w/2-.2;px+=1.05) {
    b.box('#f8c77a',px,h*.65+.5,z+d/2+.018,.55,.48,.035,0,.8);
    b.box(roof,px,h*.65+.22,z+d/2+.08,.65,.08,.18);
  }
}
function pitchedRoof(scene,x,z,w,d,y,rise,wallColor,roofColor) {
  const triangle=new THREE.Shape();triangle.moveTo(-w/2,0);triangle.lineTo(w/2,0);triangle.lineTo(0,rise);triangle.closePath();
  const geometry=new THREE.ExtrudeGeometry(triangle,{depth:d,bevelEnabled:false,steps:1});
  const mesh=new THREE.Mesh(geometry,[mat(wallColor),mat(roofColor)]);mesh.position.set(x,y,z-d/2);mesh.castShadow=true;mesh.receiveShadow=true;scene.add(mesh);
}
function container(b,x,y,z,color,angle=0) {
  b.box(color,x,y+.65,z,3.1,1.3,1.35,angle);
  for(let i=-1.35;i<1.5;i+=.35) b.box('#243c43',x+i,y+.65,z+.69,.035,1.17,.025,angle);
  b.box('#d7dfbd',x,y+1.32,z,3.13,.05,1.38,angle);
}
function truck(color,kind) {
  const group=new THREE.Group(), wheels=[],cargo=new THREE.Group();group.add(cargo);
  dynamicMesh(group,'box','#182c35',0,.6,0,3.6,.25,1.25);
  dynamicMesh(group,'box',color,1.08,1.1,0,1.16,.98,1.34);
  dynamicMesh(group,'box',color,1.48,.85,0,.5,.48,1.3);
  dynamicMesh(group,'box','#183747',1.1,1.4,.68,.72,.39,.03);
  dynamicMesh(group,'box','#183747',1.1,1.4,-.68,.72,.39,.03);
  dynamicMesh(group,'box','#25495a',1.68,1.35,0,.025,.42,1.12);
  dynamicMesh(group,'box','#f3ecd5',1.8,.75,0,.1,.18,1.35);
  for(const z of [-.46,.46]) dynamicMesh(group,'box','#fff7c9',1.8,.97,z,.055,.15,.22,2);
  for(const z of [-.7,.7]) for(const x of [-1.12,-.5,1.13]) {
    const wheel=dynamicMesh(group,'cylinder','#17272c',x,.48,z,.52,.19,.52); wheel.rotation.x=Math.PI/2; wheels.push(wheel);
    const hub=dynamicMesh(group,'cylinder','#c9c7b2',x,.48,z*1.16,.24,.025,.24); hub.rotation.x=Math.PI/2;
  }
  if(kind==='oil') {
    const tank=dynamicMesh(group,'cylinder','#c7d6ce',-.7,1.16,0,1.25,2.25,1.25,0,.55); tank.rotation.z=Math.PI/2;
    for(const x of [-1.45,-.1]) dynamicMesh(group,'box',color,x,1.19,0,.15,.12,1.3);
  } else if(kind==='timber') {
    for(let i=0;i<5;i++){const log=dynamicMesh(cargo,'cylinder',i%2?'#b48856':'#79583d',-.62,1+i%2*.29,(i-2)*.21,.3,2.3,.3);log.rotation.z=Math.PI/2;}
    for(const x of [-1.4,.22]) dynamicMesh(group,'box','#7b9390',x,1.12,0,.1,.8,1.35);
  } else if(kind==='quarry') {
    dynamicMesh(group,'box','#eab35f',-.62,1.05,0,2.3,.78,1.4);
    for(let i=0;i<5;i++)dynamicMesh(cargo,'rock','#b9b49f',-.6+(i%3-.8)*.5,1.51,(i%2-.5)*.65,.8,.5,.7);
  } else if(kind==='farm') {
    dynamicMesh(group,'box','#b4a56e',-.65,1.0,0,2.3,.55,1.4);
    for(const z of [-.65,.65])dynamicMesh(group,'box','#d1ba76',-.65,1.28,z,2.3,.5,.12);
    dynamicMesh(cargo,'sphere','#edcc70',-.65,1.42,0,2.15,.5,1.2);
  } else {
    dynamicMesh(group,'box','#70857e',-.65,.86,0,2.4,.24,1.4);
    dynamicMesh(cargo,'box','#ecdfbe',-.65,1.3,0,2.28,1.18,1.37);
    dynamicMesh(cargo,'box',color,-.65,1.32,.696,2.12,.35,.025);
    dynamicMesh(cargo,'box',color,-.65,1.32,-.696,2.12,.35,.025);
    for(const x of [-1.4,-.6,.2])dynamicMesh(cargo,'box','#b6b7a1',x,1.32,.717,.025,1.1,.015);
  }
  return {group,wheels,cargo};
}
const ROAD_RADIUS=5, ROAD_STRAIGHT=20, ROAD_LENGTH=40+Math.PI*10;
function journey(progress) {
  let s=((progress%1+1)%1)*ROAD_LENGTH;
  if(s<ROAD_STRAIGHT)return {x:-10+s,z:5,angle:0};
  s-=ROAD_STRAIGHT;
  if(s<Math.PI*ROAD_RADIUS){const a=Math.PI/2-s/ROAD_RADIUS;return{x:10+Math.cos(a)*5,z:Math.sin(a)*5,angle:a-Math.PI/2};}
  s-=Math.PI*ROAD_RADIUS;
  if(s<ROAD_STRAIGHT)return{x:10-s,z:-5,angle:-Math.PI};
  s-=ROAD_STRAIGHT;const a=-Math.PI/2-s/ROAD_RADIUS;
  return{x:-10+Math.cos(a)*5,z:Math.sin(a)*5,angle:a-Math.PI/2};
}
// Business-side loading is part of the same economic journey seen in both
// cameras. The loaded convoy departs screen-left along the front road.
function businessJourney(progress) {
  const p=((progress%1)+1)%1;
  if(p<.18)return{x:12,z:5,angle:Math.PI};
  if(p<.24)return{x:12-(p-.18)/.06*2,z:5,angle:Math.PI};
  if(p>.92)return{x:10+(p-.92)/.08*2,z:5,angle:Math.PI};
  const pose=journey(20/ROAD_LENGTH-(p-.24)/.68);pose.angle+=Math.PI;return pose;
}
function productionSite(scene,route) {
  const b=makeBuilder(scene),bin=new THREE.Group();bin.position.set(18,.6,3);scene.add(bin);
  dynamicMesh(bin,'box','#526d69',0,.08,0,4.2,.18,2.5);
  for(const x of [-2,2])dynamicMesh(bin,'box','#bac2aa',x,.7,0,.13,1.4,2.5);
  dynamicMesh(bin,'box','#bdc1a2',0,.55,1.2,4,.85,.13);
  dynamicMesh(bin,'box','#8ba59a',0,.8,-1.2,4,1.6,.13);
  const binMaterial=new THREE.MeshStandardMaterial({color:'#bac2aa',roughness:.55,metalness:.25});for(const child of bin.children)if(child.position.y>.2)child.material=binMaterial;
  const fillMaterial=new THREE.MeshStandardMaterial({color:route.color,roughness:.9});
  const fill=new THREE.Mesh(geometries.box,fillMaterial);fill.position.set(0,.4,0);fill.scale.set(3.7,.3,2.12);fill.castShadow=true;bin.add(fill);
  // The common business flow has a different source commodity and equipment.
  const source=route.kind==='farm'?new THREE.Vector3(22,.9,11):route.kind==='quarry'?new THREE.Vector3(20,2.5,-4):route.kind==='harbor'?new THREE.Vector3(19,1.1,1):route.kind==='oil'?new THREE.Vector3(21,3,2):new THREE.Vector3(20,1.5,1);
  const end=new THREE.Vector3(18,2.4,3);
  b.beam('#5d7974',source.toArray(),end.toArray(),.72,.22);b.beam('#b8a76f',[source.x-.4,source.y+.1,source.z],[end.x-.4,end.y+.1,end.z],.08);b.beam('#b8a76f',[source.x+.4,source.y+.1,source.z],[end.x+.4,end.y+.1,end.z],.08);
  b.beam('#b5bea1',[18,2.2,3],[12.9,2.7,5],.3,.3);b.beam('#8b9e8c',[12.9,2.7,5],[12.9,1.8,5],.32,.32);
  for(const [x,z] of [[18,3],[20,5]]){b.cyl('#637e70',x,1,z,.12,1.4,.12);}
  b.box('#8f9d88',18,.48,3,4.8,.14,3.1);
  b.finish();
  const pieces=new THREE.InstancedMesh(route.kind==='timber'?geometries.cylinder:route.kind==='quarry'?geometries.rock:route.kind==='oil'?geometries.sphere:geometries.box,mat(route.kind==='farm'?'#e9c55c':route.kind==='timber'?'#b38350':route.color),8);pieces.frustumCulled=false;pieces.castShadow=true;scene.add(pieces);
  const loading=new THREE.InstancedMesh(geometries.sphere,mat(route.kind==='oil'?'#c3d7a1':'#f5d690'),6);loading.frustumCulled=false;scene.add(loading);
  const meter=new THREE.Mesh(geometries.box,new THREE.MeshBasicMaterial({color:'#b9dc79'}));meter.position.set(18,1.2,4.28);meter.scale.set(2.7,.12,.03);scene.add(meter);
  const label=sign(scene,route.kind==='farm'?'Harvest reserve':route.kind==='oil'?'Fuel reserve':'Cargo reserve',18,1.5,4.28,'#f3e4be',3);
  let harvester=null,reel=null;
  if(route.kind==='farm'){
    harvester=new THREE.Group();harvester.position.set(20,.65,11);scene.add(harvester);
    dynamicMesh(harvester,'box','#c3a642',0,.75,0,2.6,1.0,1.5);dynamicMesh(harvester,'box','#35545b',.3,1.5,0,.9,.7,1.2);dynamicMesh(harvester,'box','#e7cb65',-.75,1.6,0,.75,.55,1.35);
    for(const z of [-.85,.85])for(const x of [-.85,.8]){const wheel=dynamicMesh(harvester,'cylinder','#344336',x,.35,z,.75,.2,.75);wheel.rotation.x=Math.PI/2;}
    reel=dynamicMesh(harvester,'cylinder','#987d36',1.8,.4,0,.5,2.25,.5);reel.rotation.x=Math.PI/2;dynamicMesh(harvester,'box','#aa8d3b',1.6,.2,0,.6,.18,2.5);
    dynamicMesh(harvester,'box','#d1b565',-.8,2.1,1.0,.2,.2,2.2);
  }
  return {bin,binMaterial,fill,fillMaterial,pieces,loading,meter,label,source,end,harvester,reel,capacity:1,stockRatio:0,productionRate:0,storageLevel:0};
}
function roadGeometry() {
  const shape=new THREE.Shape();shape.moveTo(-10,6.1);shape.lineTo(10,6.1);shape.absarc(10,0,6.1,Math.PI/2,-Math.PI/2,true);shape.lineTo(-10,-6.1);shape.absarc(-10,0,6.1,-Math.PI/2,Math.PI/2,true);
  const hole=new THREE.Path();hole.moveTo(-10,3.9);hole.absarc(-10,0,3.9,Math.PI/2,Math.PI*1.5,false);hole.lineTo(10,-3.9);hole.absarc(10,0,3.9,-Math.PI/2,Math.PI/2,false);hole.lineTo(-10,3.9);shape.holes.push(hole);
  const geometry=new THREE.ShapeGeometry(shape,48);geometry.rotateX(Math.PI/2);return geometry;
}
const roadGeo=roadGeometry();
const skies=new Map();
function sunsetSky(cold,night) {
  const key=night?'night':cold?'cold':'warm';
  if(skies.has(key))return skies.get(key);
  const canvas=document.createElement('canvas');canvas.width=4;canvas.height=512;
  const ctx=canvas.getContext('2d'),gradient=ctx.createLinearGradient(0,0,0,512);
  const colors=night?['#12223d','#35516b','#778489']:cold?['#789caf','#bbc8c9','#e1d7bd']:['#5c8298','#b5b9ae','#dfbf92'];
  gradient.addColorStop(0,colors[0]);gradient.addColorStop(.55,colors[1]);gradient.addColorStop(1,colors[2]);
  ctx.fillStyle=gradient;ctx.fillRect(0,0,4,512);const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;skies.set(key,texture);return texture;
}
function createWorld(route) {
  const scene=new THREE.Scene(), rng=random(route.id), b=makeBuilder(scene);
  const cold=route.region==='alpine'||route.kind==='space', night=route.kind==='space';
  scene.background=sunsetSky(cold,night);
  scene.fog=new THREE.Fog(night?'#63737f':cold?'#c0cbcc':'#c5c1ac',52,125);
  const ambient=new THREE.HemisphereLight(night?'#88b9fb':'#abc9dc',cold?'#4b5860':'#4a5037',.9);scene.add(ambient);
  const sun=new THREE.DirectionalLight(night?'#bfd5ff':'#ffd59d',night?2.7:4);sun.position.set(-32,23,14);sun.castShadow=true;
  sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-34;sun.shadow.camera.right=34;sun.shadow.camera.top=28;sun.shadow.camera.bottom=-28;sun.shadow.camera.far=100;sun.shadow.bias=-.0003;sun.shadow.normalBias=.06;scene.add(sun);scene.add(sun.target);
  const rim=new THREE.DirectionalLight('#89b7c8',.65);rim.position.set(15,10,-22);scene.add(rim);
  // A gently terraced island creates a tactile tabletop, including exposed geology.
  b.box(cold?'#a5b8bc':'#637e59',0,-.75,0,52,1.8,38);
  b.box('#8b856d',0,-1.9,0,51,1.0,37);
  b.box('#6c6b5c',0,-2.6,0,50,.55,36);
  b.box(cold?'#d5dcda':'#8a9d61',0,.16,0,51,.15,37);
  b.box(cold?'#b8c9c9':'#6f9160',-9,.25,-9,24,.16,10);
  b.box(cold?'#ced5cf':'#95a366',14,.25,-1,15,.2,18);
  // River is cut through the landscape; layered transparent sheets and light streaks.
  b.box('#3a7b89',.3,.28,0,3.8,.16,38,0,0,.35,.25);
  b.box('#73b9ae',.3,.38,0,2.7,.08,38,0,.06,.3,.18);
  for(let i=0;i<24;i++)b.box('#b1d2c2',-.8+rng()*2,.445,-18+rng()*36,.03,.015,.6+rng()*1.6,0,.1);
  for(let i=0;i<23;i++){const z=-18+rng()*36;for(const side of [-1,1])b.rock('#aaa98b',.3+side*(2.2+rng()*.3),.35,z,.7+rng()*.7,.5+rng()*.3,.8+rng()*.8,rng()*6);}
  const road=new THREE.Mesh(roadGeo,mat('#495958'));road.position.y=.5;road.receiveShadow=true;road.material.side=THREE.DoubleSide;scene.add(road);
  // Inset shoulders, clean paint, stone bridge piers, and safety rails.
  for(let i=0;i<64;i++) {const p=journey(i/64);b.box('#e9d5aa',p.x,.525,p.z,.56,.02,.08,-p.angle);}
  for(const z of [-5,5]) {
    b.box('#858e81',.3,.53,z,5,.25,2.45);
    b.box('#d2c7a7',.3,.74,z+1.18,5,.28,.16);b.box('#d2c7a7',.3,.74,z-1.18,5,.28,.16);
    for(const x of [-1.45,2.05])b.box('#818b79',x,.1,z,.65,.75,2.5);
    for(const x of [-1.9,-.8,.3,1.4,2.5])for(const zz of [-1.15,1.15])b.box('#536c66',x,1,z+zz,.08,.65,.08);
    for(const zz of [-1.15,1.15])b.box('#536c66',.3,1.29,z+zz,4.7,.08,.08);
  }
  // Shared logistics terminal on the left side of every site.
  b.box('#788679',-13,.32,0,10,.15,10);
  building(b,-13.5,-.6,5.8,4.2,3.0,'#e3d9be','#3d7073');
  b.box('#294d55',-13.5,1.5,1.56,2.5,2.2,.04);
  b.box('#f1bf66',-13.5,2.63,1.62,2.8,.12,.25,0,.5);
  b.box('#c0c4ad',-13.5,.64,2.7,4.3,.24,2);
  building(b,-19,1.1,2.3,2.5,1.7,'#e7c799');
  sign(scene,'Dispatch',-13.5,3.0,1.6,'#f6cd87',3.2);
  for(let i=0;i<3;i++)container(b,-19,.45,-4+i*1.65,['#ba7153','#688c86','#d5a359'][i]);
  for(let i=0;i<4;i++) {b.box('#bb9060',-10.6+i%2*.7,.7,-1.5+Math.floor(i/2)*.8,.56,.64,.56);b.box('#e1c89e',-10.6+i%2*.7,1.06,-1.5+Math.floor(i/2)*.8,.6,.08,.6);}
  // Street lamps and warm spill pools continue into the main view.
  for(const [x,z] of [[-8,7],[8,7],[-8,-7],[8,-7]]) {
    b.cyl('#38555a',x,2,z,.1,3.5,.1);b.box('#38555a',x+.4,3.75,z,.85,.1,.12);
    b.box('#ffda96',x+.7,3.66,z,.32,.1,.24,0,2);
    if(x===8){const light=new THREE.PointLight('#ffcc83',night?14:3,7,2);light.position.set(x+.7,3.5,z);scene.add(light);}
  }
  // Successive receding silhouettes keep atmospheric depth without giant
  // close boulders swallowing the scene. Low foothills meet the wooded island.
  for(let i=0;i<9;i++) {
    const x=-38+i*10,z=-48-rng()*8,h=(cold?9:5)+rng()*(cold?7:4);
    b.rock(cold?'#849ba8':'#78949a',x,-1,z,16+rng()*6,h,9,rng()*2);
    if(cold)b.rock('#d3dcda',x,h*.57,z,7,3.5,5,rng()*3);
  }
  for(let i=0;i<10;i++) {
    const x=-32+i*7.1,z=-31-rng()*6,h=(cold?5:3)+rng()*3;
    b.rock(cold?'#8b9ca0':'#638177',x,-.7,z,11+rng()*4,h,8,rng()*3);
  }
  for(let i=0;i<11;i++) {
    const x=-27+i*5.4,z=-20-rng()*3,h=1.7+rng()*2;
    b.rock(cold?'#a6b7b5':'#72906b',x,-.3,z,8+rng()*3,h,6,rng()*6);
  }
  for(let i=0;i<54;i++) {
    const x=-24+rng()*47,z=i<36?-9-rng()*7:8+rng()*8;
    if(Math.abs(x)<3||x>10&&z<11)continue;
    tree(b,x,z,.7+rng()*.6,rng,route.kind==='farm'&&i%3===0?'leaf':'pine');
  }
  for(let i=0;i<25;i++){const x=-24+rng()*48,z=-15+rng()*30;if(Math.abs(x)<3||Math.abs(z)<7)continue;b.rock(cold?'#9cacac':'#92977a',x,.45,z,.4+rng(),.3+rng()*.7,.4+rng(),rng()*6);}
  const anim=[];
  // One instanced shimmer pass animates across the river; lit water still
  // receives the landscape's real shadows underneath these fine highlights.
  const glints=new THREE.InstancedMesh(geometries.box,new THREE.MeshBasicMaterial({color:'#f9e9bd',transparent:true,opacity:.3,depthWrite:false}),18);
  glints.frustumCulled=false;scene.add(glints);anim.push({type:'water',obj:glints});
  buildSite(route,scene,b,rng,anim);
  // Clouds are soft low-poly sculptures rather than flat background stickers.
  for(let i=0;i<6;i++) {const cloud=new THREE.Group();cloud.position.set(-30+i*13,13+rng()*5,-28-rng()*12);for(let j=0;j<4;j++)dynamicMesh(cloud,'sphere',cold?'#f0ece1':'#f0dfba',j*1.8,Math.sin(j)*.4,0,4,1.6,2.1);scene.add(cloud);anim.push({type:'cloud',obj:cloud,offset:cloud.position.x});}
  b.finish();
  const vehicles=[];for(let i=0;i<7;i++){const vehicle=truck(route.color||'#f6b56d',route.kind);if(i===0){const lights=new THREE.PointLight('#ffce83',night?7:2,5,2);lights.position.set(1.8,.8,0);vehicle.group.add(lights);}scene.add(vehicle.group);vehicles.push(vehicle);}
  const heroCamera=new THREE.PerspectiveCamera(35,1,.1,220),rowCamera=new THREE.PerspectiveCamera(39,1,.1,160);
  const production=productionSite(scene,route);
  const upgrades=[];
  for(let tier=0;tier<3;tier++) {
    const group=new THREE.Group(),detail=makeBuilder(group);scene.add(group);group.visible=false;
    // New goods in the destination apron are visible from both perspectives.
    for(let i=0;i<3+tier*3;i++){const x=17+(i%3)*.65+tier*2.2,z=2.5+Math.floor(i/3)*.75;detail.box(tier===2?'#b6bd99':'#bd9362',x,.65+tier*.12,z,.55,.7+tier*.24,.55);detail.box('#dfc9a0',x,1.04+tier*.24,z,.58,.07,.58);}
    if(tier===0){building(detail,-20,-8.3,4,3,1.8,'#b9ba99','#517575');sign(group,'Cargo annex',-20,2.1,-6.77,'#ead6a2',2.4);}
    if(tier===1){building(detail,-14,-9.7,7,3.5,2.2,'#d8d0ad','#3a6b72');sign(group,'Fleet operations',-14,2.4,-7.92,'#d4ecb8',3.8);for(let i=0;i<5;i++)detail.box('#8ba293',-17+i*1.3,.5,-6.5,.8,.25,.8);}
    if(tier===2){building(detail,-20,8.8,4.8,3.1,3.5,'#d8ba86','#365c66');sign(group,'Regional HQ',-20,3.2,10.37,'#ffe2a0',3.7);for(const x of [-22,-18]){detail.cyl('#7d9688',x,3,7,.12,5.6,.12);detail.box(route.color,x+.4,5.5,7,.8,.55,.08);}}
    detail.finish();upgrades.push(group);
  }
  const particles=new THREE.InstancedMesh(geometries.sphere,new THREE.MeshBasicMaterial({color:'#ffe6a3',transparent:true,opacity:.86,depthWrite:false}),24);particles.frustumCulled=false;particles.visible=false;scene.add(particles);
  const dust=new THREE.InstancedMesh(geometries.sphere,new THREE.MeshBasicMaterial({color:cold?'#dfe5da':'#dbbd95',transparent:true,opacity:.19,depthWrite:false}),14);dust.frustumCulled=false;scene.add(dust);
  const pulseLight=new THREE.PointLight('#ffe5a3',0,13,2);pulseLight.position.set(-13.5,3,2);scene.add(pulseLight);
  return {scene,sun,heroCamera,rowCamera,vehicles,anim,route,progress:0,rendered:false,upgrades,particles,dust,pulseLight,particlePool:Array.from({length:24},()=>({born:-100,x:0,y:0,z:0,vx:0,vy:0,vz:0})),particleIndex:0,tapUntil:0,loadingCount:0,production};
}
function buildSite(route,scene,b,rng,anim) {
  const kind=route.kind;
  if(kind==='farm') {
    // Copper-roof barn, exposed timber, grain towers, orchard and planted rows.
    building(b,20,-2.2,6,4.6,3.1,'#b76c4a','#755845');
    pitchedRoof(scene,20,-2.2,6.5,5.0,3.66,1.42,'#b76c4a','#765948');
    b.box('#d4b994',20,5.1,-2.2,.16,.12,5.1);
    b.box('#e4caa2',20,1.8,.13,2.6,2.7,.08);
    b.box('#775943',20,1.65,.2,2.3,2.4,.05);
    b.beam('#e7d9b1',[18.9,.5,.26],[21.1,2.8,.26],.09);b.beam('#e7d9b1',[21.1,.5,.26],[18.9,2.8,.26],.09);
    for(const x of [17,23]){b.cyl('#e0cdae',x,2.2,-6.2,2.4,3.9,2.4);b.cone('#687d76',x,4.5,-6.2,2.65,.8,2.65);for(let y=1;y<4;y+=.6)b.cyl('#748779',x,y,-6.2,2.44,.035,2.44);}
    b.box('#7d8658',17,.4,11,15,.1,6.5);
    for(let row=0;row<10;row++) {
      b.box('#bc9c4e',10.9+row*1.38,.49,11,1.06,.08,6.2);
      for(let j=0;j<15;j++) {const x=10.9+row*1.38+rng()*.45,z=8.3+j*.39;b.box('#ddc46d',x,row>6?1.02:.84,z,.08,row>6?1.05:.62,.08);b.cone('#ecdb90',x,row>6?1.55:1.21,z,row>6?.28:.22,.32,.22);if(row>6){b.beam('#91a256',[x,.9,z],[x+.24,1.18,z+.12],.07);b.beam('#91a256',[x,1.1,z],[x-.24,1.36,z-.12],.07);}}
    }
    for(let i=0;i<5;i++)tree(b,18+i%2*3,-11+Math.floor(i/2)*2,1,rng,'leaf');
    for(let i=0;i<5;i++){const x=11+i*3;b.box('#ccb895',x,.98,14.5,.15,1.1,.15);if(i<4){b.box('#ccb895',x+1.5,1.3,14.5,3,.1,.1);b.box('#ccb895',x+1.5,.88,14.5,3,.1,.1);}}
    const windmill=new THREE.Group();windmill.position.set(24,5.8,5);scene.add(windmill);
    b.cyl('#e3d6af',24,2.85,5,1.35,5.1,1.35);b.cone('#6c756a',24,5.4,5,1.6,.9,1.6);
    for(let i=0;i<4;i++){const blade=new THREE.Group();blade.rotation.z=i*Math.PI/2;dynamicMesh(blade,'box','#efe5bc',0,1.1,.05,.2,2.4,.12);dynamicMesh(blade,'box','#b39c6c',.3,1.6,.03,.55,1.2,.08);windmill.add(blade);}dynamicMesh(windmill,'cylinder','#a18f64',0,0,.1,.4,.15,.4).rotation.x=Math.PI/2;
    anim.push({type:'windmill',obj:windmill});
    const tractor=new THREE.Group();tractor.position.set(20,.4,13.1);dynamicMesh(tractor,'box','#617b51',0,.7,0,2,.8,1.1);dynamicMesh(tractor,'box','#e2d9ad',-.5,1.3,0,.7,.8,.85);for(const z of [-.65,.65])for(const x of [-.6,.8]){const w=dynamicMesh(tractor,'cylinder','#333d31',x,.4,z,.7,.22,.7);w.rotation.x=Math.PI/2;}scene.add(tractor);anim.push({type:'tractor',obj:tractor});
    sign(scene,'Golden harvest',20,3.05,.17,'#ffe1a5',4.4);
  } else if(kind==='quarry') {
    // Layered excavation walls, crusher conveyors, moving excavator arm.
    for(let i=0;i<4;i++) {
      b.box(['#b8ae94','#9c9e8a','#888f80','#b2a58c'][i],20,-.15+i*.6,-4,10-i*1.3,.65,12-i*1.3);
      for(let j=0;j<5;j++)b.rock('#aeaa92',16+rng()*8,1+i*.65,-8+rng()*8,1+rng()*2,1.2,1.5,rng()*6);
    }
    building(b,21,5,4.7,3,2.3,'#b9a779','#746f56');
    b.beam('#465c59',[17,1,-5],[19,3.5,3],1.3,.3);b.beam('#d2ac61',[16.4,1,-5],[18.4,3.5,3],.1);b.beam('#d2ac61',[17.6,1,-5],[19.6,3.5,3],.1);
    for(let i=0;i<9;i++)b.box('#59655b',19.5+i*.36,.6,8,1.9,.2,.25);
    const excavator=new THREE.Group();excavator.position.set(18,1.8,-3);dynamicMesh(excavator,'box','#35443e',0,.3,0,2.6,.5,2);dynamicMesh(excavator,'box','#e8b34f',0,.9,0,1.8,.8,1.5);dynamicMesh(excavator,'box','#3e6870',-.3,1.6,0,.8,.8,1.2);
    const arm=new THREE.Group();arm.position.set(.7,1.2,0);dynamicMesh(arm,'box','#d39b42',1,1,0,.35,2.8,.4).rotation.z=-.75;dynamicMesh(arm,'box','#f3c56b',2.1,1.6,0,.27,1.9,.35).rotation.z=.7;dynamicMesh(arm,'box','#445850',2.8,.85,0,.9,.65,1);excavator.add(arm);scene.add(excavator);anim.push({type:'excavator',obj:arm});
    sign(scene,'Stone works',21,2.7,6.55,'#ffcf7b',3.8);
  } else if(kind==='timber') {
    building(b,20,-2,6,4,3,'#ba976f','#365955');
    pitchedRoof(scene,20,-2,6.4,4.4,3.56,1.0,'#ba976f','#365955');
    for(let i=0;i<5;i++)for(let j=0;j<3;j++){const x=18+j*.5,y=.75+i%2*.45,z=4+Math.floor(i/2)*1.8;const log=new THREE.Mesh(geometries.cylinder,mat('#977449'));log.scale.set(.62,4,.62);log.rotation.z=Math.PI/2;log.position.set(x,y,z);log.castShadow=true;scene.add(log);}
    for(let i=0;i<14;i++)tree(b,14+rng()*10,-8-rng()*8,1+rng()*.6,rng);
    const saw=new THREE.Group();saw.position.set(20,1.2,.5);const blade=dynamicMesh(saw,'cylinder','#becdc7',0,0,0,1.25,.1,1.25,0,.5);blade.rotation.x=Math.PI/2;scene.add(saw);anim.push({type:'saw',obj:saw});
    crane(scene,b,18,3.5,'#d4b26a',anim,3.4);
    sign(scene,'Evergreen mill',20,3,.05,'#d2e7b7',4);
  } else if(kind==='factory') {
    building(b,20,-1,7,6,4.7,'#d8bba2','#465d61');
    building(b,20,5.5,5,3.5,2.3,'#a8b6a8','#456367');
    for(const x of [17,20,23]){b.cyl('#bb7862',x,6.5,-4.3,.9,5,.9);b.cyl('#d7bea1',x,8.1,-4.3,.98,.28,.98);for(let j=0;j<3;j++){const puff=new THREE.Mesh(geometries.sphere,mat('#d8d7c8'));puff.scale.set(1+j*.35,1.2+j*.3,1+j*.35);puff.position.set(x+j*.8,9+j*1.6,-4.3);scene.add(puff);anim.push({type:'steam',obj:puff,base:puff.position.clone(),phase:j});}}
    for(let j=0;j<3;j++)container(b,13+j*3.4,.45,10,['#bd7456','#7ca299','#d4ae67'][j]);
    for(let i=0;i<6;i++)b.box('#c4b593',17+i*.9,.5,7.5,.55,.45,.55);
    sign(scene,'Precision works',20,4,2.03,'#ffd69c',4.8);
  } else if(kind==='harbor') {
    b.box('#4a8b96',20,.42,-1,12,.13,18,0,.05,.35,.2);
    for(let i=0;i<12;i++)b.box('#8ebdb4',16+rng()*9,.495,-8+rng()*16,.04,.02,1+rng()*2,0,.08);
    b.box('#b5b09a',16,.62,-1,3,.4,17);b.box('#c5b899',21,.62,7,10,.4,2);
    for(let j=0;j<4;j++)container(b,16.5,.87,-6+j*2,['#b77150','#769c91','#d0a557','#7a8591'][j]);
    const ship=new THREE.Group();ship.position.set(22,.75,-1.5);dynamicMesh(ship,'box','#203c46',0,.7,0,3.6,1.4,10);dynamicMesh(ship,'box','#ae6950',0,.05,0,3.2,.5,9.5);dynamicMesh(ship,'box','#e8d6b1',0,2,3.2,3,2,2);dynamicMesh(ship,'box','#264d58',0,2.45,4.25,2.7,.6,.05);dynamicMesh(ship,'box','#d4af75',0,3.2,3.2,3.25,.15,2.25);for(let i=0;i<4;i++)dynamicMesh(ship,'box',['#af7256','#79998d'][i%2],i%2*1.5-.75,1.8,-2+Math.floor(i/2)*2.8,1.35,1.5,2.5);scene.add(ship);anim.push({type:'ship',obj:ship});
    crane(scene,b,17,5,'#ddb25d',anim,6.8);
    sign(scene,'Port authority',16,1.8,7.99,'#d7ebd9',3.5);
  } else if(kind==='oil') {
    b.box('#c3b18d',20,.45,-1,10,.3,12);
    for(const [x,z] of [[19,-3.5],[23,-3.5],[22,2]]){b.cyl('#dbd6bc',x,2,z,3.2,3.1,3.2);b.cyl('#859d94',x,3.58,z,3.28,.12,3.28);b.cyl('#d2a960',x,.9,z,3.22,.25,3.22);}
    building(b,19,6,4,2.7,1.7,'#b58e64');
    for(let i=0;i<3;i++) {const x=16+i*3.5;b.cyl('#4e6b65',x,1.35,9,.4,2.1,.4);b.box('#d6aa58',x,1.9,9,2.2,.15,.2);const pump=new THREE.Group();pump.position.set(x,2,9);dynamicMesh(pump,'box','#d6aa58',0,.4,0,3,.22,.3);dynamicMesh(pump,'box','#bd9149',1.5,.1,0,.55,.8,.4);scene.add(pump);anim.push({type:'pump',obj:pump,phase:i});}
    for(const z of [-7,5]){b.beam('#697c6b',[16,.9,z],[24,.9,z],.25);for(let x=16;x<=24;x+=2)b.cyl('#82917a',x,.68,z,.18,.6,.18);}
    b.cyl('#a49176',24,4.2,-9,.65,8,.65);b.cone('#efb34d',24,8.5,-9,.55,.8,.55,0,3);
    sign(scene,'Energy terminal',19,1.9,7.39,'#f6d185',3.6);
  } else if(kind==='alpine') {
    for(let i=0;i<6;i++){const x=16+rng()*10,z=-9-rng()*8;b.rock('#82989a',x,4,z,8,11+rng()*8,8);b.cone('#f0e7ce',x,9,z,4.8,5,4.8);}
    building(b,20,-1,5.5,4,3,'#bf916e','#527079');
    pitchedRoof(scene,20,-1,5.9,4.4,3.56,1.5,'#bf916e','#d9e1d8');
    building(b,21,5.5,3,3,1.8,'#bc7659','#527079');b.box('#efead7',21,2.65,5.5,3.4,.16,3.4);
    for(const x of [15,24]){b.box('#53757b',x,5,-6,.2,9,.2);b.beam('#6d8c8e',[15,9,-6],[24,9,-6],.09);}
    const gondola=new THREE.Group();dynamicMesh(gondola,'box','#ddab69',0,0,0,1.25,1.3,1.2);dynamicMesh(gondola,'box','#315762',0,.25,.62,1,.5,.02);dynamicMesh(gondola,'box','#46666a',0,1,0,.1,.8,.1);gondola.position.set(19,7.5,-6);scene.add(gondola);anim.push({type:'gondola',obj:gondola});
    sign(scene,'Summit station',20,2.95,1.03,'#e5f4e4',4);
  } else if(kind==='airport') {
    b.box('#697874',20,.46,-1,10,.22,17);b.box('#374b50',20,.6,-1,3.5,.06,17);
    for(let z=-8;z<8;z+=1.5)b.box('#e8dcc1',20,.645,z,.13,.02,.65);
    building(b,15,-8,4.4,4,2.8,'#ccd0b7','#596e72');building(b,16,8,5.5,3.5,2,'#c5bda3');
    b.cyl('#e2cfae',14,4.7,3,1.2,8,1.2);b.box('#233e4a',14,8.8,3,2.4,1.4,2.4);b.box('#d5bf96',14,9.55,3,2.7,.15,2.7);
    const plane=new THREE.Group();dynamicMesh(plane,'box','#e7e1c9',0,.7,0,1,.9,5.4);dynamicMesh(plane,'box','#dbad6a',0,.72,0,6.5,.14,1.2);dynamicMesh(plane,'box','#688e91',0,1.5,2,.1,1.5,1.2);dynamicMesh(plane,'box','#5b8790',0,.84,1.9,2.5,.12,.7);dynamicMesh(plane,'sphere','#e7e1c9',0,.7,-2.3,1,.9,1.5);for(const x of [-1.6,1.6])dynamicMesh(plane,'cylinder','#536f76',x,.45,-.35,.5,1.3,.5).rotation.x=Math.PI/2;plane.position.set(20,.8,1);scene.add(plane);anim.push({type:'plane',obj:plane});
    for(const z of [-7,-4,-1,2,5,8])for(const x of [18,22])b.box('#9ee4c9',x,.8,z,.13,.17,.13,0,1.5);
    sign(scene,'Air freight',16,2.0,9.79,'#ddeddb',3.8);
  } else if(kind==='space') {
    b.cyl('#6f8386',20,.45,-1,10,.4,10);b.cyl('#abc1b6',20,.7,-1,7.8,.1,7.8);
    const rocket=new THREE.Group();rocket.position.set(20,.85,-1);dynamicMesh(rocket,'cylinder','#e2e5d5',0,3,0,1.7,6,1.7,0,.25);dynamicMesh(rocket,'cone','#d9dccc',0,6.7,0,1.7,1.6,1.7);dynamicMesh(rocket,'cylinder','#527e84',0,3.6,0,1.72,.7,1.72);dynamicMesh(rocket,'cylinder','#415c63',0,.2,0,1.1,.7,1.1);for(const x of [-1,1])dynamicMesh(rocket,'box','#c0d0c7',x,.75,0,.25,1.8,1.5);scene.add(rocket);
    for(const x of [16,23]){b.box('#597778',x,5,-2,.35,9,.35);for(let y=1;y<10;y++)b.box('#759492',x,y,-2,1.1,.08,1.1);}
    b.beam('#789c93',[16,9,-2],[21,9,-2],.3);
    building(b,19,8,7,3,2.2,'#89a8a2','#34535c');
    const dish=new THREE.Group();dish.position.set(14,3,5);dynamicMesh(dish,'sphere','#bbcfc5',0,.5,0,2.4,.5,2.4);dynamicMesh(dish,'cylinder','#a4bbae',0,1,0,.12,1.5,.12);b.cyl('#5e7b78',14,1.7,5,.65,3,.65);scene.add(dish);anim.push({type:'dish',obj:dish});
    for(let i=0;i<35;i++)b.sphere('#d2e3d5',-40+rng()*80,16+rng()*20,-40-rng()*35,.12,.12,.12,0,2);
    sign(scene,'Orbital logistics',19,2.05,9.52,'#adf6cf',4.8);
  } else {
    building(b,20,-1,6,5,3,'#d0b695');for(let i=0;i<3;i++)container(b,17+i*3,.45,6,route.color);
  }
  // Site apron links the delivery endpoint to the adjacent arterial road.
  b.box('#beb395',16.5,.48,1.3,4,.12,2.3);
  for(let i=0;i<4;i++){b.cone('#d99255',15.2+i*.7,.83,2.6,.24,.6,.24);b.box('#f1ddae',15.2+i*.7,.7,2.6,.35,.07,.35);}
}
function crane(scene,b,x,z,color,anim,height) {
  b.box('#657366',x,.7,z,2,.5,2);b.box(color,x,height/2+.7,z,.3,height,.3);
  for(let y=1;y<height;y+=.65){b.box(color,x,y,z,1,.09,1);b.beam('#6f8375',[x-.45,y,z],[x+.45,y+.65,z],.055);}
  const arm=new THREE.Group();arm.position.set(x,height+.6,z);dynamicMesh(arm,'box',color,1.4,0,0,5,.23,.28);dynamicMesh(arm,'box','#526b67',-1.2,-.3,0,.8,.65,.8);dynamicMesh(arm,'box','#344f50',3.3,-1.35,0,.055,2.7,.055);dynamicMesh(arm,'box','#c7b174',3.3,-2.75,0,.42,.35,.4);scene.add(arm);anim.push({type:'crane',obj:arm});
}

export function createScenes({hero,getGame,onFocus=()=>{}}) {
  const query=new URLSearchParams(location.search);
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'default',preserveDrawingBuffer:query.get('preserve')==='1'});
  // WebGL stays offscreen. Each view's DOM-owned 2D canvas follows scrolling,
  // sticky positioning and rounded clipping without a JavaScript positioning step.
  const canvas=renderer.domElement,targets=new Map();
  let sourceWidth=1,sourceHeight=1,pixelRatio=1;
  function presentation(element) {
    if(targets.has(element))return targets.get(element);
    const output=document.createElement('canvas');output.className='transport-scene-canvas';output.dataset.sceneView=element===hero?'hero':'route';output.setAttribute('aria-hidden','true');
    Object.assign(output.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',display:'block'});
    if(getComputedStyle(element).position==='static')element.style.position='relative';
    element.prepend(output);
    const context=output.getContext('2d',{alpha:false});
    const entry={canvas:output,context,width:0,height:0};targets.set(element,entry);return entry;
  }
  presentation(hero);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0,0);
  let quality='high',rows=[],focusId=null,pinned=false,lastTour=performance.now(),lastFrame=0,raf=0,disposed=false,frames=0,draws=0,contextLost=false,suspended=false,recoveries=0,lossExtension=null;
  const worlds=new Map(),routeMap=new Map(ROUTES.map(route=>[route.id,route]));
  const debug={get views(){return rows.length+1;},get worlds(){return worlds.size;},get focus(){return focusId;},get pinned(){return pinned;},get drawCalls(){return draws;},get frames(){return frames;},get dpr(){return renderer.getPixelRatio();},rendererCount:1,get contextLost(){return contextLost||renderer.getContext().isContextLost();},get suspended(){return suspended;},get recoveries(){return recoveries;},suspend:()=>suspend(),resume:()=>recover(),loseContext:()=>{lossExtension=renderer.getContext().getExtension('WEBGL_lose_context');lossExtension?.loseContext();return !!lossExtension;},restoreContext:()=>{lossExtension?.restoreContext();return !!lossExtension;},get presentationCount(){return targets.size;},get sourceSize(){return {width:canvas.width,height:canvas.height};},snapshot(id=focusId){const w=worlds.get(id);return w?{id,progress:w.progress,focused:focusId===id,locked:pinned,vehicles:w.vehicles.filter(v=>v.group.visible).map(v=>({x:v.group.position.x,y:v.group.position.y,z:v.group.position.z,heading:v.group.rotation.y})),drawCalls:draws,visualTier:w.upgrades.filter(group=>group.visible).length,particles:w.particles.visible,tapUntil:w.tapUntil,production:{capacity:w.production.capacity,stockRatio:w.production.stockRatio,storageLevel:w.production.storageLevel,productionRate:w.production.productionRate},loading:w.loadingCount>0,loadingCount:w.loadingCount||0,leaderLoading:w.progress<.18}:null;}};
  function world(id) {if(!worlds.has(id)&&routeMap.has(id))worlds.set(id,createWorld(routeMap.get(id)));return worlds.get(id);}
  function notify(){onFocus(focusId,pinned);}
  function focus(id,locked=false) {
    if(id&&routeMap.has(id)){focusId=id;pinned=locked;world(id);}else pinned=false;
    lastTour=performance.now();notify();
  }
  function setRoutes(next) {
    rows=next.filter(row=>row.element&&routeMap.has(row.id));
    const keep=new Set([hero,...rows.map(row=>row.element)]);
    for(const [element,entry] of targets)if(!keep.has(element)){entry.canvas.remove();targets.delete(element);}
    for(const row of rows)presentation(row.element);
    const game=getGame();const available=rows.filter(row=>game?.state.routes[row.id]?.unlocked);
    const pool=available.length?available:rows;
    if(!focusId||!rows.some(row=>row.id===focusId)){focusId=pool[0]?.id||ROUTES[0]?.id;pinned=false;lastTour=performance.now();notify();}
    if(focusId)world(focusId);
  }
  function setQuality(value) {quality=value;renderer.shadowMap.enabled=value!=='low';resize();}
  function resize() {
    const forced=Number(query.get('dpr'));const max=quality==='low'?1:quality==='medium'?1.25:1.75;
    pixelRatio=forced>0?Math.min(forced,2):Math.min(window.devicePixelRatio||1,max);
    renderer.setPixelRatio(pixelRatio);
    // Reset retained source capacity only on viewport/quality changes. Compact
    // sticky animation never reallocates a WebGL drawing buffer every frame.
    sourceWidth=1;sourceHeight=1;
    for(const element of [hero,...rows.map(row=>row.element)]){
      const rect=element.getBoundingClientRect();sourceWidth=Math.max(sourceWidth,Math.ceil(rect.width));sourceHeight=Math.max(sourceHeight,Math.ceil(rect.height));
    }
    renderer.setSize(sourceWidth,sourceHeight,false);
  }
  const waterDummy=new THREE.Object3D();
  const tapRay=new THREE.Raycaster(),tapPoint=new THREE.Vector3(),tapPlane=new THREE.Plane(UP,-.6);
  function celebrateTap(xNormalized=.5,yNormalized=.5){
    const w=world(focusId);if(!w)return;const time=performance.now()/1000;
    tapRay.setFromCamera(new THREE.Vector2(Math.max(0,Math.min(1,xNormalized))*2-1,1-Math.max(0,Math.min(1,yNormalized))*2),w.heroCamera);
    const hit=tapRay.ray.intersectPlane(tapPlane,tapPoint);
    const x=hit?THREE.MathUtils.clamp(hit.x,-23,23):w.vehicles[0].group.position.x,z=hit?THREE.MathUtils.clamp(hit.z,-16,16):w.vehicles[0].group.position.z;
    for(let i=0;i<8;i++){const p=w.particlePool[w.particleIndex++%24],a=i*Math.PI/4;p.born=time;p.x=x;p.y=.8;p.z=z;p.vx=Math.cos(a)*2.5;p.vz=Math.sin(a)*2.5;p.vy=3.5+Math.random()*1.6;}
    w.tapUntil=time+.75;w.particles.visible=true;
  }
  function updateWorld(w,time) {
    w.sun.shadow.needsUpdate=true;
    const game=getGame(),r=game?.state.routes[w.route.id],stats=game?.stats(w.route.id),unlocked=!!r?.unlocked;
    const progress=Number(stats?.progress??r?.progress??0);w.progress=progress;
    const count=unlocked?Math.min(7,Math.max(1,Number(r?.fleet)||1)):1;
    const production=w.production;
    production.storageLevel=Math.max(0,Number(stats?.storageLevel??r?.storageLevel??r?.storage??0)||0);
    production.capacity=Math.max(1,Number(stats?.capacity)||20*(1+production.storageLevel*.2));
    production.stockRatio=unlocked?THREE.MathUtils.clamp(Number(stats?.stockRatio??(.35+progress*.6)),0,1):0;
    production.productionRate=unlocked?Math.max(0,Number(stats?.productionRate)||1+Number(r?.level||1)*.1):0;
    const storageScale=1+Math.min(30,production.storageLevel)*.006;
    production.bin.scale.set(storageScale,1+Math.min(30,production.storageLevel)*.008,1);
    const fillHeight=.08+production.stockRatio*.95;production.fill.position.y=.2+fillHeight/2;production.fill.scale.y=fillHeight;
    production.binMaterial.color.set(production.storageLevel>=10?'#d0ac64':production.storageLevel>=6?'#71a596':production.storageLevel>=3?'#759ca7':'#bac2aa');
    production.meter.scale.x=Math.max(.03,production.stockRatio*2.7);production.meter.material.color.set(production.stockRatio>.82?'#edc56a':'#b9dc79');
    const productionSpeed=Math.min(.65,.12+production.productionRate*.5+Number(stats?.productionLevel??r?.level??1)*.004);
    for(let i=0;i<8;i++){const u=(time*productionSpeed+i/8)%1;waterDummy.position.copy(production.source).lerp(production.end,u);waterDummy.position.y+=.22;waterDummy.rotation.set(0,0,w.route.kind==='timber'?Math.PI/2:0);waterDummy.scale.set(unlocked?.24:0,unlocked?(w.route.kind==='timber'?.65:.22):0,unlocked?.24:0);waterDummy.updateMatrix();production.pieces.setMatrixAt(i,waterDummy.matrix);}production.pieces.instanceMatrix.needsUpdate=true;
    w.loadingCount=unlocked?Array.from({length:count},(_,i)=>(progress+i/count)%1).filter(p=>p<.18).length:0;
    for(let i=0;i<6;i++){const u=(time*3+i/6)%1;waterDummy.position.set(12.9,2.7-u*.8,5);waterDummy.scale.setScalar(w.loadingCount>0?.11:0);waterDummy.updateMatrix();production.loading.setMatrixAt(i,waterDummy.matrix);}production.loading.instanceMatrix.needsUpdate=true;
    if(production.harvester&&unlocked){production.harvester.position.x=20+Math.sin(time*productionSpeed*.7)*2.4;production.harvester.position.z=10.3;production.harvester.rotation.y=Math.cos(time*productionSpeed*.7)>0?0:Math.PI;production.reel.rotation.y=time*productionSpeed*15;}

    const mastery=Number(stats?.masteryLevel??r?.masteryLevel??r?.mastery??0)||0;
    w.upgrades.forEach((group,tier)=>{group.visible=unlocked&&(Number(r?.level)>= [5,15,30][tier]||Number(r?.fleet)>=[3,6,12][tier]||mastery>=[1,2,4][tier]);});
    let liveParticles=0;
    for(let i=0;i<24;i++){const p=w.particlePool[i],age=time-p.born,live=age>=0&&age<.85;waterDummy.position.set(p.x+p.vx*age,p.y+p.vy*age-3*age*age,p.z+p.vz*age);waterDummy.scale.setScalar(live?.25*(1-age/.85):0);waterDummy.updateMatrix();w.particles.setMatrixAt(i,waterDummy.matrix);if(live)liveParticles++;}
    w.particles.visible=liveParticles>0;w.particles.instanceMatrix.needsUpdate=true;w.pulseLight.intensity=Math.max(0,w.tapUntil-time)*18;
    for(let i=0;i<w.vehicles.length;i++) {
      const vehicle=w.vehicles[i];vehicle.group.visible=i<count;
      if(i>=count)continue;
      // Visual traffic shares the route's real journey. Inactive routes wait at dispatch.
      const p=unlocked?(progress+i/count)%1:.03;
      vehicle.cargo.visible=p<.64;vehicle.cargo.scale.y=p<.18?Math.max(.05,p/.18):1;vehicle.cargo.position.y=0;
      const pose=businessJourney(p);vehicle.group.position.set(pose.x,.48,pose.z);vehicle.group.rotation.y=-pose.angle;vehicle.group.rotation.z=stats?.active&&p>=.18?Math.sin(time*6+i)*.008:0;
      if(stats?.active&&p>=.18)for(const wheel of vehicle.wheels)wheel.rotation.y=-time*5;
    }
    for(let i=0;i<14;i++){const index=Math.floor(i/2),vehicle=w.vehicles[index],live=index<count&&stats?.active&&(progress+index/count)%1>=.18&&(progress+index/count)%1<.92,age=(time*1.5+i*.47)%1,pose=businessJourney((progress+index/count-.014*age+1)%1);waterDummy.position.set(pose.x, .9+age*.45,pose.z);waterDummy.scale.setScalar(live?.16+age*.36:0);waterDummy.updateMatrix();w.dust.setMatrixAt(i,waterDummy.matrix);}w.dust.instanceMatrix.needsUpdate=true;
    for(const animation of w.anim) {
      const obj=animation.obj;
      switch(animation.type) {
        case 'water':
          for(let i=0;i<18;i++){waterDummy.position.set(-.6+(i%5)*.42,.465,((i*2.1+time*.22)%36)-18);waterDummy.scale.set(.024+.018*Math.sin(time*.8+i),.018,.5+(Math.sin(time+i)*.5+.5)*1.8);waterDummy.rotation.set(0,0,0);waterDummy.updateMatrix();obj.setMatrixAt(i,waterDummy.matrix);}obj.instanceMatrix.needsUpdate=true;break;
        case 'windmill':obj.rotation.z=time*.24;break;
        case 'crane':obj.rotation.y=Math.sin(time*.23)*.4;break;
        case 'excavator':obj.rotation.z=Math.sin(time*.65)*.13;break;
        case 'saw':obj.rotation.z=time*1.7;break;
        case 'pump':obj.rotation.z=Math.sin(time*1.3+animation.phase)*.15;break;
        case 'ship':obj.position.y=.75+Math.sin(time*.65)*.05;obj.rotation.z=Math.sin(time*.4)*.012;break;
        case 'gondola':obj.position.x=19.5+Math.sin(time*.17)*4;break;
        case 'dish':obj.rotation.y=time*.13;obj.rotation.z=.35;break;
        case 'tractor':obj.position.x=18+Math.sin(time*.18)*3;obj.rotation.y=Math.cos(time*.18)>0?0:Math.PI;break;
        case 'plane':obj.position.z=Math.sin(time*.12)*4;break;
        case 'cloud':obj.position.x=animation.offset+Math.sin(time*.025)*2;break;
        case 'steam':obj.position.y=animation.base.y+Math.sin(time*.7+animation.phase)*.5;obj.position.x=animation.base.x+Math.sin(time*.4+animation.phase)*.4;break;
      }
    }
  }
  const target=new THREE.Vector3(),look=new THREE.Vector3(),vehicleLook=new THREE.Vector3(),highlightPosition=new THREE.Vector3(31,18,22),highlightLook=new THREE.Vector3(17,1.8,0);
  function renderView(element,rect,w,isHero,time) {
    if(!element||!w)return;
    const camera=isHero?w.heroCamera:w.rowCamera;
    const ratio=rect.width/rect.height;camera.aspect=ratio;
    if(isHero) {
      // Wide scenes frame the whole delivery network. Portrait views orbit closer
      // around the destination so the site remains legible instead of shrinking.
      const phase=(time%72)/72*Math.PI*2;
      const portrait=ratio<1.15;
      const x=portrait?10:2.6;
      const distance=portrait?39:Math.max(39,52/Math.max(1,ratio*.72));
      target.set(x+Math.sin(phase)*5+distance*.6,portrait?25:distance*.55,Math.cos(phase)*3+distance*.76);
      look.set(x,1.8,0);
      // Gentle delivery camera motion links to the physical leading truck.
      const pose=businessJourney(w.progress);vehicleLook.set(pose.x*.065,0,pose.z*.12);look.add(vehicleLook);
      // A smooth infrequent highlight leans toward the working destination,
      // while compact sticky feeds keep the whole arterial network in view.
      const tourSeconds=(time-lastTour/1000+72)%24;
      const beat=Math.max(0,1-Math.abs(tourSeconds-8)/3);
      const highlight=rect.height>=240?(1-Math.cos(beat*Math.PI))*.24:0;
      target.lerp(highlightPosition,highlight);look.lerp(highlightLook,highlight);
      camera.position.copy(target);camera.lookAt(look);
    } else {
      const compact=ratio<1.5;
      camera.position.set(14,compact?17:15,compact?30:28);
      camera.lookAt(14,1.5,8);camera.fov=compact?40:36;
    }
    camera.updateProjectionMatrix();
    const output=presentation(element);
    const width=Math.max(1,Math.floor(rect.width*pixelRatio)),height=Math.max(1,Math.floor(rect.height*pixelRatio));
    if(output.width!==width||output.height!==height){output.canvas.width=width;output.canvas.height=height;output.width=width;output.height=height;}
    renderer.setViewport(0,0,rect.width,rect.height);
    renderer.setScissor(0,0,rect.width,rect.height);renderer.setScissorTest(true);renderer.clear();
    renderer.render(w.scene,camera);draws+=renderer.info.render.calls;
    if(contextLost||renderer.getContext().isContextLost())return;
    // WebGL viewport originates at bottom-left; drawImage reads from top-left.
    // Copy immediately before the shared source is reused by the next camera.
    output.context.drawImage(canvas,0,canvas.height-height,width,height,0,0,width,height);
  }

  function frame(now) {
    raf=0;
    if(disposed||suspended||document.hidden||contextLost||renderer.getContext().isContextLost())return;
    raf=requestAnimationFrame(frame);
    const limit=quality==='low'||innerWidth<600?30:60;
    if(now-lastFrame<1000/limit-1)return;lastFrame=now;
    const game=getGame();
    if(!pinned&&now-lastTour>12000) {
      const unlocked=rows.filter(row=>game?.state.routes[row.id]?.unlocked),pool=unlocked.length?unlocked:rows;
      if(pool.length){const index=pool.findIndex(row=>row.id===focusId);focusId=pool[(index+1)%pool.length].id;notify();}lastTour=now;
    }
    draws=0;
    const views=[];
    function visible(element,id,isHero){
      const rect=element.getBoundingClientRect();
      if(rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth&&rect.width>=4&&rect.height>=4)views.push({element,id,isHero,rect});
    }
    if(focusId)visible(hero,focusId,true);
    for(const row of rows)visible(row.element,row.id,false);
    let requiredWidth=sourceWidth,requiredHeight=sourceHeight;
    for(const view of views){requiredWidth=Math.max(requiredWidth,Math.ceil(view.rect.width));requiredHeight=Math.max(requiredHeight,Math.ceil(view.rect.height));}
    if(requiredWidth!==sourceWidth||requiredHeight!==sourceHeight){sourceWidth=requiredWidth;sourceHeight=requiredHeight;renderer.setSize(sourceWidth,sourceHeight,false);}
    const time=now/1000;
    for(const id of new Set(views.map(view=>view.id))){const w=world(id);if(w)updateWorld(w,time);}
    for(const view of views)renderView(view.element,view.rect,world(view.id),view.isHero,time);
    frames++;
  }
  function suspend(){suspended=true;cancelAnimationFrame(raf);raf=0;}
  function recover(){
    if(disposed)return;
    suspended=false;lastFrame=0;
    if(document.hidden||contextLost||renderer.getContext().isContextLost())return;
    recoveries++;resize();renderer.shadowMap.needsUpdate=true;
    // Explicitly dirty retained GPU-facing data following mobile suspension.
    // 2D views retain their last complete image until this fresh render copies.
    for(const w of worlds.values()){w.sun.shadow.needsUpdate=true;w.scene.traverse(obj=>{if(obj.isInstancedMesh)obj.instanceMatrix.needsUpdate=true;});}
    cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
  }
  function visibility(){if(document.hidden)suspend();else recover();}
  function lost(event){event.preventDefault();contextLost=true;suspend();}
  function restored(){contextLost=false;recover();}
  function destroy(){disposed=true;cancelAnimationFrame(raf);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('freeze',suspend);document.removeEventListener('resume',recover);window.removeEventListener('focus',recover);window.removeEventListener('pagehide',suspend);window.removeEventListener('pageshow',recover);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);renderer.dispose();for(const entry of targets.values())entry.canvas.remove();targets.clear();const sharedMaterials=new Set(materials.values()),ownedMaterials=new Set(),ownedTextures=new Set();for(const w of worlds.values())w.scene.traverse(obj=>{if(obj.geometry&&!Object.values(geometries).includes(obj.geometry)&&obj.geometry!==roadGeo)obj.geometry.dispose();for(const material of Array.isArray(obj.material)?obj.material:[obj.material])if(material&&!sharedMaterials.has(material)){ownedMaterials.add(material);if(material.map)ownedTextures.add(material.map);}});for(const texture of ownedTextures)texture.dispose();for(const material of ownedMaterials)material.dispose();}
  canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
  document.addEventListener('visibilitychange',visibility);document.addEventListener('freeze',suspend);document.addEventListener('resume',recover);window.addEventListener('focus',recover);window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',recover);
  window.addEventListener('resize',resize);resize();raf=requestAnimationFrame(frame);
  return {setRoutes,focus,setQuality,resize,destroy,celebrateTap,debug};
}
