import * as THREE from 'three';
import { ROUTES } from './economy.mjs?v=20261003-district4';

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
function createBusiness(route) {
  const root=new THREE.Group(),art=new THREE.Group();art.position.x=-20;root.add(art);
  root.name='BusinessPlot:'+route.id;
  const rng=random(route.id),b=makeBuilder(art),anim=[];
  buildSite(route,art,b,rng,anim);b.finish();
  const production=productionSite(art,route),upgrades=[];
  for(let tier=0;tier<3;tier++){
    const group=new THREE.Group(),detail=makeBuilder(group);art.add(group);group.visible=false;
    for(let i=0;i<3+tier*3;i++)detail.box(tier===2?'#b6bd99':'#bd9362',22.5+i%3*.65,.8,4.5+Math.floor(i/3)*.7+tier*2.3,.55,1,.55);
    if(tier===0)building(detail,24,3,2.7,2,1.4,'#b9ba99','#517575');
    if(tier===1)sign(group,'Production II',20,3.8,1.4,'#d4ecb8',3);
    if(tier===2)sign(group,'Mastered',20,4.4,1.4,'#ffe2a0',2.7);
    detail.finish();upgrades.push(group);
  }
  const vehicles=Array.from({length:7},()=>truck(route.color,route.kind));
  const particles=new THREE.InstancedMesh(geometries.sphere,new THREE.MeshBasicMaterial({color:'#ffe6a3',transparent:true,opacity:.86,depthWrite:false}),24);particles.frustumCulled=false;particles.visible=false;
  const dust=new THREE.InstancedMesh(geometries.sphere,new THREE.MeshBasicMaterial({color:'#dbbd95',transparent:true,opacity:.16,depthWrite:false}),14);dust.frustumCulled=false;
  return {root,art,route,anim,production,upgrades,vehicles,particles,dust,rowCamera:new THREE.PerspectiveCamera(36,1,.1,800),particlePool:Array.from({length:24},()=>({born:-100,x:0,y:0,z:0,vx:0,vy:0,vz:0})),particleIndex:0,tapUntil:0,loadingCount:0,progress:0,paths:[],siteOrigin:new THREE.Vector3()};
}
function ringPose(d,half,radius){
  const length=half*4+radius*Math.PI*2;let s=((d%length)+length)%length;
  if(s<half*2)return{x:-half+s,z:radius,angle:0};s-=half*2;
  if(s<Math.PI*radius){const a=Math.PI/2-s/radius;return{x:half+Math.cos(a)*radius,z:Math.sin(a)*radius,angle:a-Math.PI/2};}s-=Math.PI*radius;
  if(s<half*2)return{x:half-s,z:-radius,angle:-Math.PI};s-=half*2;const a=-Math.PI/2-s/radius;return{x:-half+Math.cos(a)*radius,z:Math.sin(a)*radius,angle:a-Math.PI/2};
}
function arterialGeometry(half,radius,width=3.2){
  const outer=radius+width/2,inner=radius-width/2,shape=new THREE.Shape();
  shape.moveTo(-half,outer);shape.lineTo(half,outer);shape.absarc(half,0,outer,Math.PI/2,-Math.PI/2,true);shape.lineTo(-half,-outer);shape.absarc(-half,0,outer,-Math.PI/2,Math.PI/2,true);
  const hole=new THREE.Path();hole.moveTo(-half,inner);hole.absarc(-half,0,inner,Math.PI/2,Math.PI*1.5,false);hole.lineTo(half,-inner);hole.absarc(half,0,inner,-Math.PI/2,Math.PI/2,false);hole.lineTo(-half,inner);shape.holes.push(hole);
  const geometry=new THREE.ShapeGeometry(shape,64);geometry.rotateX(Math.PI/2);return geometry;
}
function flatLane(scene,points,width,color,owned){
  const positions=[],indices=[];
  for(let i=0;i<points.length;i++){const prev=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)],dx=next.x-prev.x,dz=next.z-prev.z,len=Math.hypot(dx,dz)||1,nx=-dz/len*width/2,nz=dx/len*width/2;positions.push(points[i].x+nx,.54,points[i].z+nz,points[i].x-nx,.54,points[i].z-nz);if(i<points.length-1){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();owned.push(geometry);const material=mat(color);material.side=THREE.DoubleSide;const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;scene.add(mesh);return mesh;
}
function curve(points){const c=new THREE.CatmullRomCurve3(points,false,'centripetal');c.arcLengthDivisions=Math.max(180,points.length*8);return c;}
function createDistrict(ids,businesses){
  const scene=new THREE.Scene(),count=ids.length,half=Math.max(24,count*5),radius=13,length=half*4+radius*Math.PI*2;
  const cold=ids.every(id=>businesses.get(id).route.region==='alpine'),region=new Set(ids.map(id=>businesses.get(id).route.region)).size===1?businesses.get(ids[0]).route.region:'network';
  scene.name='TransportDistrict';scene.background=sunsetSky(cold,false);scene.fog=new THREE.Fog('#c7c5af',170,450);
  scene.add(new THREE.HemisphereLight('#abc9dc','#4a5037',.9));const sun=new THREE.DirectionalLight('#ffd59d',4);sun.position.set(-65,90,55);sun.castShadow=true;sun.shadow.autoUpdate=false;sun.shadow.needsUpdate=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-half-45;sun.shadow.camera.right=half+45;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;sun.shadow.camera.far=300;sun.shadow.bias=-.0003;sun.shadow.normalBias=.06;scene.add(sun,sun.target);const rim=new THREE.DirectionalLight('#89b7c8',.65);rim.position.set(60,30,-60);scene.add(rim);
  const pulseLight=new THREE.PointLight('#ffe5a3',0,25,2);pulseLight.position.set(0,4,4);scene.add(pulseLight);
  const staticRoot=new THREE.Group();scene.add(staticRoot);const b=makeBuilder(staticRoot),rng=random(ids.join(':'));
  const groundWidth=(half+radius+38)*2,groundDepth=102;
  b.box('#637e59',0,-.7,0,groundWidth,1.5,groundDepth);b.box('#8b856d',0,-1.75,0,groundWidth-1,.75,groundDepth-1);b.box(cold?'#c2d2c8':'#8a9d61',0,.18,0,groundWidth,.13,groundDepth);
  b.box('#748579',0,.34,0,Math.min(half*1.3,75),.14,21);
  // A single headquarters serves every route in this physically shared suburb.
  const depot=new THREE.Group();depot.name='CentralDepot';scene.add(depot);const db=makeBuilder(depot);
  const columns=count<=3?7:count,depotWidth=Math.max(13,Math.min(46,columns*3.8));
  building(db,0,-5,depotWidth,6,4.4,'#e1d7b9','#3d7073');db.box('#294d55',0,2,-1.97,6,3,.05);db.box('#f1bf66',0,3.65,-1.9,6.3,.13,.2,0,.5);sign(depot,'Central Depot',0,4,-1.85,'#ffe1a3',Math.min(9,depotWidth*.7));
  for(let i=0;i<Math.min(8,count+2);i++)container(db,-depotWidth/2+2+i*3.4,.45,-10,['#ba7153','#688c86','#d5a359'][i%3]);
  db.finish();
  const ownedGeometries=[],roadGeometry=arterialGeometry(half,radius,7.2);ownedGeometries.push(roadGeometry);const arterial=new THREE.Mesh(roadGeometry,mat('#495958'));arterial.material.side=THREE.DoubleSide;arterial.position.y=.5;arterial.receiveShadow=true;scene.add(arterial);
  for(let d=0;d<length;d+=3.5){const p=ringPose(d,half,radius);for(const offset of [-.9,.9])b.box('#dfd7b5',p.x-Math.sin(p.angle)*offset,.53,p.z+Math.cos(p.angle)*offset,.75,.02,.07,-p.angle);}
  for(let d=9;d<length;d+=25){const p=ringPose(d,half,radius),tx=Math.cos(p.angle),tz=Math.sin(p.angle),nx=-tz,nz=tx;for(const lane of [-1.8,0,1.8]){const x=p.x+nx*lane,z=p.z+nz*lane;for(const side of [-1,1])b.beam('#dfd7b5',[x-tx*.45+nx*.35*side,.56,z-tz*.45+nz*.35*side],[x+tx*.45,.56,z+tz*.45],.075,.03);}}
  for(let d=0;d<length;d+=18){const p=ringPose(d,half,radius),out=new THREE.Vector3(-Math.sin(p.angle),0,Math.cos(p.angle));const x=p.x+out.x*4.4,z=p.z+out.z*4.4;b.cyl('#526866',x,1.85,z,.11,3.3,.11);b.box('#526866',x+.35,3.53,z,.7,.1,.12);b.box('#ffda96',x+.6,3.47,z,.25,.08,.22,0,2);}
  // The river and its bridges belong to the district, rather than each site.
  const riverX=-Math.max(depotWidth/2+5,half*.35);b.box('#377989',riverX,.25,0,3.5,.11,groundDepth,0,0,.25,.25);b.box('#71b4ac',riverX,.34,0,2.5,.08,groundDepth,0,.07,.25,.18);
  for(const z of [-radius,radius]){b.box('#858e81',riverX,.56,z,5,.27,7.6);for(const side of [-1,1])b.box('#c9c3a5',riverX,.9,z+side*3.72,5,.28,.15);}
  const depotEntryD=half-3,depotExitD=half+3,depotEntry=ringPose(depotEntryD,half,radius),depotExit=ringPose(depotExitD,half,radius);
  const active=[];
  ids.forEach((id,index)=>{
    const w=businesses.get(id),anchorD=count===3?[half*2+Math.PI*radius+half+18,half*2+Math.PI*radius+half-18,half][index]:(index+.16)/count*length,anchor=ringPose(anchorD,half,radius),outward=new THREE.Vector3(-Math.sin(anchor.angle),0,Math.cos(anchor.angle));
    w.root.position.set(anchor.x+outward.x*17,0,anchor.z+outward.z*17);w.root.rotation.y=Math.PI-anchor.angle;w.root.updateMatrixWorld(true);w.siteOrigin.copy(w.root.position);w.index=index;w.scene=scene;w.sun=sun;w.heroCamera=null;scene.add(w.root,w.particles,w.dust);for(const vehicle of w.vehicles)scene.add(vehicle.group);
    const siteExitD=anchorD-12,siteJoinD=anchorD+12,siteExit=ringPose(siteExitD,half,radius),siteJoin=ringPose(siteJoinD,half,radius);
    w.paths=[];
    const local=new THREE.Vector3();
    for(let i=0;i<7;i++){
      const bay=local.set(-8-(i%4)*3.9,.48,5+Math.floor(i/4)*2.4).applyMatrix4(w.root.matrixWorld).clone();
      const depotSlot=index*7+i,depotBay=new THREE.Vector3((depotSlot%columns-(columns-1)/2)*3.8,.48,-1+Math.floor(depotSlot/columns)*1.7);
      const tangent=new THREE.Vector3(Math.cos(anchor.angle),0,Math.sin(anchor.angle)),lane=(index%3-1)*1.8;
      const lanePoint=(d)=>{const p=ringPose(d,half,radius);return new THREE.Vector3(p.x-Math.sin(p.angle)*lane,.48,p.z+Math.cos(p.angle)*lane);};
      const join=lanePoint(siteJoinD),exit=lanePoint(siteExitD),entry=lanePoint(depotEntryD),depart=lanePoint(depotExitD);
      const joinPose=ringPose(siteJoinD,half,radius),exitPose=ringPose(siteExitD,half,radius),jt=new THREE.Vector3(Math.cos(joinPose.angle),0,Math.sin(joinPose.angle)),jo=new THREE.Vector3(-jt.z,0,jt.x),et=new THREE.Vector3(Math.cos(exitPose.angle),0,Math.sin(exitPose.angle)),eo=new THREE.Vector3(-et.z,0,et.x);
      const outboundConnector=curve([bay.clone(),bay.clone().addScaledVector(tangent,2.2),join.clone().addScaledVector(jt,-6).addScaledVector(jo,8),join.clone().addScaledVector(jt,-2),join.clone()]);
      const depotIn=curve([entry.clone(),entry.clone().add(new THREE.Vector3(2,0,0)),new THREE.Vector3(entry.x+4,.48,radius-4),new THREE.Vector3(depotBay.x-2.5,.48,depotBay.z),depotBay.clone()]);
      const depotOut=curve([depotBay.clone(),depotBay.clone().add(new THREE.Vector3(2.5,0,0)),new THREE.Vector3(depart.x-4,.48,radius-4),depart.clone().add(new THREE.Vector3(-2,0,0)),depart.clone()]);
      const inboundConnector=curve([exit.clone(),exit.clone().addScaledVector(et,2),exit.clone().addScaledVector(et,4).addScaledVector(eo,7),bay.clone().addScaledVector(tangent,-2.2),bay.clone()]);
      const outDistance=((depotEntryD-siteJoinD)%length+length)%length,returnDistance=((siteExitD-depotExitD)%length+length)%length;
      const outA=outboundConnector.getLength(),outB=depotIn.getLength(),returnA=depotOut.getLength(),returnB=inboundConnector.getLength();
      w.paths.push({bay,depotBay,outboundConnector,depotIn,depotOut,inboundConnector,outA,outB,returnA,returnB,outTotal:outA+outDistance+outB,returnTotal:returnA+returnDistance+returnB,siteJoinD,siteExitD,outDistance,returnDistance,angle:anchor.angle,lane,roadLength:length,depotEntryD,depotExitD});
      if(i===0){flatLane(scene,outboundConnector.getPoints(24),2.5,'#69786c',ownedGeometries);flatLane(scene,inboundConnector.getPoints(24),2.5,'#69786c',ownedGeometries);flatLane(scene,depotIn.getPoints(24),2.4,'#61716b',ownedGeometries);flatLane(scene,depotOut.getPoints(24),2.4,'#61716b',ownedGeometries);}

    }
    active.push(w);
    // Small fences and planted verges stitch the plots into a common suburb.
    for(let i=0;i<9;i++){const p=ringPose(anchorD-14+i*3.5,half,radius);tree(b,p.x+outward.x*(22+rng()*7),p.z+outward.z*(22+rng()*7),.85+rng()*.5,rng,'pine');}
  });
  flatLane(scene,[new THREE.Vector3(depotEntry.x,0,radius),new THREE.Vector3(depotEntry.x,0,radius-3),new THREE.Vector3(-8,0,3)],3.0,'#61716b',ownedGeometries);
  flatLane(scene,[new THREE.Vector3(8,0,3),new THREE.Vector3(depotExit.x,0,radius-3),new THREE.Vector3(depotExit.x,0,radius)],3.0,'#61716b',ownedGeometries);
  for(let i=0;i<35;i++){const x=-half-25+rng()*(half*2+50),z=(rng()>.5?1:-1)*(39+rng()*10);tree(b,x,z,.8+rng(),rng,i%4===0?'leaf':'pine');}
  for(let i=0;i<12;i++)b.rock('#78949a',-half-35+i*(half*2+70)/11,-1,-groundDepth/2+2-rng(),16,5+rng()*5,9,rng()*3);
  b.finish();
  const vehicleBatches=new Map();
  for(const w of active)for(const vehicle of w.vehicles)vehicle.group.traverse(mesh=>{
    if(!mesh.isMesh||mesh.isInstancedMesh)return;const key=mesh.geometry.uuid+mesh.material.uuid;if(!vehicleBatches.has(key))vehicleBatches.set(key,{geometry:mesh.geometry,material:mesh.material,parts:[]});vehicleBatches.get(key).parts.push({mesh,vehicle,w});mesh.visible=false;
  });
  for(const batch of vehicleBatches.values()){batch.mesh=new THREE.InstancedMesh(batch.geometry,batch.material,batch.parts.length);batch.mesh.castShadow=true;batch.mesh.receiveShadow=true;batch.mesh.frustumCulled=false;scene.add(batch.mesh);}
  const heroCamera=new THREE.PerspectiveCamera(38,1,.1,1000);
  return {scene,sun,pulseLight,depot,ids,active,region,half,radius,length,groundWidth,groundDepth,heroCamera,vehicleBatches,ownedGeometries,staticRoot,cameraReady:false,disposed:false};
}
const posePoint=new THREE.Vector3(),poseTangent=new THREE.Vector3();
function districtPose(w,phase,index=0){
  const p=((phase%1)+1)%1,path=w.paths[index%w.paths.length];if(!path)return null;
  let point,angle,onRoad=false,roadDistance=null,stage;
  function sampleCurve(c,u){point=c.getPointAt(THREE.MathUtils.clamp(u,0,1),posePoint);poseTangent.copy(c.getTangentAt(THREE.MathUtils.clamp(u,0,1)));angle=Math.atan2(poseTangent.z,poseTangent.x);}
  function sampleRoad(d){const r=ringPose(d,w.district.half,w.district.radius);posePoint.set(r.x-Math.sin(r.angle)*path.lane,.48,r.z+Math.cos(r.angle)*path.lane);point=posePoint;angle=r.angle;onRoad=true;roadDistance=d;}
  if(p<.18){point=path.bay;angle=path.angle;stage='loading';}
  else if(p<.55){const distance=(p-.18)/.37*path.outTotal;stage='outbound';if(distance<path.outA)sampleCurve(path.outboundConnector,distance/path.outA);else if(distance<path.outA+path.outDistance)sampleRoad(path.siteJoinD+distance-path.outA);else sampleCurve(path.depotIn,(distance-path.outA-path.outDistance)/path.outB);}
  else if(p<.64){point=path.depotBay;angle=0;stage='unloading';}
  else {const distance=(p-.64)/.36*path.returnTotal;stage=p<.92?'returning':'approach';if(distance<path.returnA)sampleCurve(path.depotOut,distance/path.returnA);else if(distance<path.returnA+path.returnDistance)sampleRoad(path.depotExitD+distance-path.returnA);else sampleCurve(path.inboundConnector,(distance-path.returnA-path.returnDistance)/path.returnB);}
  return {x:point.x,y:point.y,z:point.z,angle,phase:p,stage,onRoad,lane:path.lane,roadDistance,roadPhase:roadDistance===null?null:((roadDistance%path.roadLength)+path.roadLength)%path.roadLength/path.roadLength};
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
  let quality='high',rows=[],focusId=null,pinned=false,lastTour=performance.now(),lastFrame=0,raf=0,disposed=false,frames=0,draws=0,contextLost=false,suspended=false,recoveries=0,lossExtension=null,district=null,mode='overview';
  const worlds=new Map(),routeMap=new Map(ROUTES.map(route=>[route.id,route]));
  function snapshot(id=focusId||district?.ids[0]){
    const w=worlds.get(id);if(!w||!district?.ids.includes(id))return null;
    const bounds=new THREE.Box3().setFromObject(w.root);
    return {id,progress:w.progress,focused:focusId===id,locked:pinned,sceneUuid:district.scene.uuid,rowSceneUuid:w.scene.uuid,siteUuid:w.root.uuid,siteOrigin:w.siteOrigin.toArray(),siteBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},loadingBay:w.paths[0].bay.toArray(),depotBay:w.paths[0].depotBay.toArray(),vehicles:w.vehicles.filter(v=>v.group.visible).map(v=>({uuid:v.group.uuid,x:v.group.position.x,y:v.group.position.y,z:v.group.position.z,worldPosition:v.group.position.toArray(),heading:v.group.rotation.y,...v.pose})),drawCalls:draws,visualTier:w.upgrades.filter(group=>group.visible).length,particles:w.particles.visible,tapUntil:w.tapUntil,production:{capacity:w.production.capacity,stockRatio:w.production.stockRatio,storageLevel:w.production.storageLevel,productionRate:w.production.productionRate},loading:w.loadingCount>0,loadingCount:w.loadingCount||0,leaderLoading:w.progress<.18};
  }
  const debug={get views(){return rows.length+1;},get worlds(){return district?1:0;},get focus(){return focusId;},get mode(){return mode;},get pinned(){return pinned;},get drawCalls(){return draws;},get frames(){return frames;},get dpr(){return renderer.getPixelRatio();},rendererCount:1,get contextLost(){return contextLost||renderer.getContext().isContextLost();},get suspended(){return suspended;},get recoveries(){return recoveries;},suspend:()=>suspend(),resume:()=>recover(),loseContext:()=>{lossExtension=renderer.getContext().getExtension('WEBGL_lose_context');lossExtension?.loseContext();return !!lossExtension;},restoreContext:()=>{lossExtension?.restoreContext();return !!lossExtension;},get presentationCount(){return targets.size;},get sourceSize(){return {width:canvas.width,height:canvas.height};},get district(){return district?{region:district.region,siteIds:[...district.ids],sceneUuid:district.scene.uuid,sceneCount:1,centralDepotCount:district.scene.children.filter(obj=>obj.name==='CentralDepot').length,centralDepotUuid:district.depot.uuid,depotPosition:district.depot.position.toArray(),road:{length:district.length,oneWay:true,half:district.half,radius:district.radius,width:7.2,lanes:3,laneOffsets:[-1.8,0,1.8]},overview:mode==='overview',mode,heroSceneUuid:district.scene.uuid}:null;},snapshot,pose(id,phase,index=0){const w=worlds.get(id);return w&&district?.ids.includes(id)?districtPose(w,phase,index):null;},audit(){return district?{...debug.district,heroCameraPosition:district.heroCamera.position.toArray(),rows:rows.map(row=>({id:row.id,sceneUuid:district.scene.uuid,siteUuid:worlds.get(row.id).root.uuid,vehicleUuids:worlds.get(row.id).vehicles.filter(v=>v.group.visible).map(v=>v.group.uuid)}))}:null;}};
  function world(id) {if(!id)return null;if(!worlds.has(id)&&routeMap.has(id))worlds.set(id,createBusiness(routeMap.get(id)));return worlds.get(id);}
  function notify(){onFocus(focusId,pinned,mode);}
  function overview(){focusId=null;pinned=false;mode='overview';lastTour=performance.now();notify();}
  function focus(id,locked=false) {
    if(id&&district?.ids.includes(id)){focusId=id;pinned=locked;mode=locked?'focus':'tour';}else{focusId=null;pinned=false;mode='tour';}
    lastTour=performance.now();notify();
  }
  function releaseDistrict(previous){if(!previous)return;for(const batch of previous.vehicleBatches.values())batch.mesh.dispose();previous.staticRoot.traverse(obj=>{if(obj.isInstancedMesh)obj.dispose();});previous.depot.traverse(obj=>{if(obj.isInstancedMesh)obj.dispose();if(obj.material?.map){obj.material.map.dispose();obj.material.dispose();}if(obj.geometry&&!Object.values(geometries).includes(obj.geometry))obj.geometry.dispose();});for(const geometry of previous.ownedGeometries)geometry.dispose();previous.sun.shadow.dispose();for(const w of previous.active)if(w.district===previous){w.scene=null;w.district=null;w.sun=null;}previous.scene.clear();previous.disposed=true;}
  function setRoutes(next) {
    rows=next.filter(row=>row.element&&routeMap.has(row.id));
    const keep=new Set([hero,...rows.map(row=>row.element)]);
    for(const [element,entry] of targets)if(!keep.has(element)){entry.canvas.remove();targets.delete(element);}
    for(const row of rows)presentation(row.element);
    const ids=[...new Set(rows.map(row=>row.id))];if(!ids.length)return;
    if(!district||ids.join('|')!==district.ids.join('|')){
      for(const id of ids)world(id);const previous=district;district=createDistrict(ids,worlds);for(const w of district.active)w.district=district;releaseDistrict(previous);
      if(!focusId||!ids.includes(focusId)){focusId=null;pinned=false;mode='overview';}
      lastTour=performance.now();notify();
    }
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
    const w=world(focusId||district?.ids.find(id=>getGame()?.state.routes[id]?.unlocked)||district?.ids[0]);if(!w||!district)return;const time=performance.now()/1000;
    tapRay.setFromCamera(new THREE.Vector2(Math.max(0,Math.min(1,xNormalized))*2-1,1-Math.max(0,Math.min(1,yNormalized))*2),district.heroCamera);
    const hit=tapRay.ray.intersectPlane(tapPlane,tapPoint);
    const x=hit?THREE.MathUtils.clamp(hit.x,-district.groundWidth/2,district.groundWidth/2):w.vehicles[0].group.position.x,z=hit?THREE.MathUtils.clamp(hit.z,-district.groundDepth/2,district.groundDepth/2):w.vehicles[0].group.position.z;
    for(let i=0;i<8;i++){const p=w.particlePool[w.particleIndex++%24],a=i*Math.PI/4;p.born=time;p.x=x;p.y=.8;p.z=z;p.vx=Math.cos(a)*2.5;p.vz=Math.sin(a)*2.5;p.vy=3.5+Math.random()*1.6;}
    w.tapUntil=time+.75;w.particles.visible=true;
  }
  function updateWorld(w,time) {
    w.sun.shadow.needsUpdate=true;
    const game=getGame(),r=game?.state.routes[w.route.id],stats=game?.stats(w.route.id),unlocked=!!r?.unlocked;
    const progress=Number(stats?.progress??r?.progress??0);w.progress=progress;
    const count=unlocked?Math.min(7,Math.max(1,Number(r?.fleet)||1)):0;
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
    for(let i=0;i<8;i++){const u=(time*productionSpeed+i/8)%1;waterDummy.position.copy(production.source).lerp(production.end,u);waterDummy.position.y+=.22;waterDummy.rotation.set(0,0,w.route.kind==='timber'?Math.PI/2:0);waterDummy.scale.set(unlocked?.24:0,unlocked?(w.route.kind==='timber'?.65:.22):0,unlocked?.24:0);waterDummy.updateMatrix();production.pieces.setMatrixAt(i,waterDummy.matrix);}production.pieces.visible=unlocked;production.pieces.instanceMatrix.needsUpdate=true;production.pieces.computeBoundingBox();production.pieces.computeBoundingSphere();production.pieces.frustumCulled=true;
    w.loadingCount=unlocked?Array.from({length:count},(_,i)=>(progress+i/count)%1).filter(p=>p<.18).length:0;
    for(let i=0;i<6;i++){const u=(time*3+i/6)%1;waterDummy.position.set(12.9,2.7-u*.8,5);waterDummy.scale.setScalar(w.loadingCount>0?.11:0);waterDummy.updateMatrix();production.loading.setMatrixAt(i,waterDummy.matrix);}production.loading.visible=w.loadingCount>0;production.loading.instanceMatrix.needsUpdate=true;production.loading.computeBoundingBox();production.loading.computeBoundingSphere();production.loading.frustumCulled=true;
    if(production.harvester&&unlocked){production.harvester.position.x=20+Math.sin(time*productionSpeed*.7)*2.4;production.harvester.position.z=10.3;production.harvester.rotation.y=Math.cos(time*productionSpeed*.7)>0?0:Math.PI;production.reel.rotation.y=time*productionSpeed*15;}

    const mastery=Number(stats?.masteryLevel??r?.masteryLevel??r?.mastery??0)||0;
    w.upgrades.forEach((group,tier)=>{group.visible=unlocked&&(Number(r?.level)>= [5,15,30][tier]||Number(r?.fleet)>=[3,6,12][tier]||mastery>=[1,2,4][tier]);});
    let liveParticles=0;
    for(let i=0;i<24;i++){const p=w.particlePool[i],age=time-p.born,live=age>=0&&age<.85;waterDummy.position.set(p.x+p.vx*age,p.y+p.vy*age-3*age*age,p.z+p.vz*age);waterDummy.scale.setScalar(live?.25*(1-age/.85):0);waterDummy.updateMatrix();w.particles.setMatrixAt(i,waterDummy.matrix);if(live)liveParticles++;}
    w.particles.visible=liveParticles>0;w.particles.instanceMatrix.needsUpdate=true;if(w.tapUntil>time)district.pulseLight.intensity=Math.max(district.pulseLight.intensity,(w.tapUntil-time)*18);
    for(let i=0;i<w.vehicles.length;i++) {
      const vehicle=w.vehicles[i];vehicle.group.visible=i<count;
      if(i>=count)continue;
      // Visual traffic shares the route's real journey. Inactive routes wait at dispatch.
      const p=unlocked?(progress+i/count)%1:.03;
      vehicle.cargo.visible=p<.64;vehicle.cargo.scale.y=p<.18?Math.max(.05,p/.18):p>=.55?Math.max(.01,1-(p-.55)/.09):1;vehicle.cargo.position.y=0;
      const pose=districtPose(w,p,i);vehicle.pose=pose;vehicle.group.position.set(pose.x,.48,pose.z);vehicle.group.rotation.y=-pose.angle;
      const moving=pose.stage!=='loading'&&pose.stage!=='unloading';vehicle.group.rotation.z=stats?.active&&moving?Math.sin(time*6+i)*.008:0;
      if(stats?.active&&moving)for(const wheel of vehicle.wheels)wheel.rotation.y=-time*5;
    }
    for(let i=0;i<14;i++){const index=Math.floor(i/2),phase=count?(progress+index/count)%1:0,pose=count?districtPose(w,phase,index):null,live=pose&&index<count&&stats?.active&&pose.stage!=='loading'&&pose.stage!=='unloading',age=(time*1.5+i*.47)%1;waterDummy.position.set(pose?.x||0,.9+age*.45,pose?.z||0);waterDummy.scale.setScalar(live?.16+age*.26:0);waterDummy.rotation.set(0,0,0);waterDummy.updateMatrix();w.dust.setMatrixAt(i,waterDummy.matrix);}w.dust.visible=count>0;w.dust.instanceMatrix.needsUpdate=true;
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
  const target=new THREE.Vector3(),look=new THREE.Vector3(),rowOffset=new THREE.Vector3(),batchMatrix=new THREE.Matrix4(),zeroMatrix=new THREE.Matrix4().makeScale(0,0,0);
  function updateVehicleBatches(){
    for(const w of district.active)for(const vehicle of w.vehicles)vehicle.group.updateMatrixWorld(true);
    for(const batch of district.vehicleBatches.values()){
      batch.parts.forEach(({mesh,vehicle},i)=>{
        let visible=vehicle.group.visible;for(let parent=mesh.parent;parent&&parent!==vehicle.group;parent=parent.parent)if(!parent.visible)visible=false;
        batch.mesh.setMatrixAt(i,visible?mesh.matrixWorld:zeroMatrix);
      });batch.mesh.instanceMatrix.needsUpdate=true;
    }
  }
  function renderView(element,rect,w,isHero,time) {
    if(!element||!w||!district)return;
    const camera=isHero?district.heroCamera:w.rowCamera,ratio=rect.width/rect.height;camera.aspect=ratio;
    if(isHero){
      const extent=Math.max(district.groundDepth*.73,(district.half*2+district.radius*2+34)/(Math.max(1,ratio)*.96));
      target.set(district.half*.23,extent*.8,extent*1.03);look.set(0,1,0);
      if(focusId&&mode!=='overview'){
        const selected=worlds.get(focusId);
        if(pinned){rowOffset.set(0,35,49).applyAxisAngle(UP,selected.root.rotation.y);target.copy(selected.siteOrigin).add(rowOffset);look.copy(selected.siteOrigin);rowOffset.set(0,0,8).applyAxisAngle(UP,selected.root.rotation.y);look.add(rowOffset);}
        else {look.lerp(selected.siteOrigin,.22);target.addScaledVector(selected.siteOrigin,.14);}
      }
      if(!district.cameraReady){camera.position.copy(target);district.cameraReady=true;}else camera.position.lerp(target,.06);
      camera.userData.look ||= new THREE.Vector3();camera.userData.look.lerp(look,.06);camera.lookAt(camera.userData.look);
    }else{
      const compact=ratio<1.5;rowOffset.set(0,compact?17:15,compact?30:28).applyAxisAngle(UP,w.root.rotation.y);camera.position.copy(w.siteOrigin).add(rowOffset);
      rowOffset.set(0,1.5,8).applyAxisAngle(UP,w.root.rotation.y);camera.lookAt(w.siteOrigin.clone().add(rowOffset));camera.fov=compact?40:36;
    }
    camera.updateProjectionMatrix();
    const output=presentation(element);
    const width=Math.max(1,Math.floor(rect.width*pixelRatio)),height=Math.max(1,Math.floor(rect.height*pixelRatio));
    if(output.width!==width||output.height!==height){output.canvas.width=width;output.canvas.height=height;output.width=width;output.height=height;}
    renderer.setViewport(0,0,rect.width,rect.height);
    renderer.setScissor(0,0,rect.width,rect.height);renderer.setScissorTest(true);renderer.clear();
    renderer.render(district.scene,camera);draws+=renderer.info.render.calls;
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
    if(mode==='tour'&&!pinned&&now-lastTour>12000) {
      const unlocked=rows.filter(row=>game?.state.routes[row.id]?.unlocked),pool=unlocked.length?unlocked:rows;
      if(pool.length){const index=pool.findIndex(row=>row.id===focusId);focusId=pool[(index+1)%pool.length].id;notify();}lastTour=now;
    }
    draws=0;
    const views=[];
    function visible(element,id,isHero){
      const rect=element.getBoundingClientRect();
      if(rect.bottom>0&&rect.top<innerHeight&&rect.right>0&&rect.left<innerWidth&&rect.width>=4&&rect.height>=4)views.push({element,id,isHero,rect});
    }
    if(district)visible(hero,focusId||district.ids[0],true);
    for(const row of rows)visible(row.element,row.id,false);
    let requiredWidth=sourceWidth,requiredHeight=sourceHeight;
    for(const view of views){requiredWidth=Math.max(requiredWidth,Math.ceil(view.rect.width));requiredHeight=Math.max(requiredHeight,Math.ceil(view.rect.height));}
    if(requiredWidth!==sourceWidth||requiredHeight!==sourceHeight){sourceWidth=requiredWidth;sourceHeight=requiredHeight;renderer.setSize(sourceWidth,sourceHeight,false);}
    const time=now/1000;
    if(district){district.pulseLight.intensity=0;for(const w of district.active)updateWorld(w,time);updateVehicleBatches();}
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
    for(const w of worlds.values()){if(w.sun)w.sun.shadow.needsUpdate=true;w.root.traverse(obj=>{if(obj.isInstancedMesh)obj.instanceMatrix.needsUpdate=true;});}
    cancelAnimationFrame(raf);raf=requestAnimationFrame(frame);
  }
  function visibility(){if(document.hidden)suspend();else recover();}
  function lost(event){event.preventDefault();contextLost=true;suspend();}
  function restored(){contextLost=false;recover();}
  function destroy(){disposed=true;cancelAnimationFrame(raf);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('freeze',suspend);document.removeEventListener('resume',recover);window.removeEventListener('focus',recover);window.removeEventListener('pagehide',suspend);window.removeEventListener('pageshow',recover);canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);releaseDistrict(district);renderer.dispose();for(const entry of targets.values())entry.canvas.remove();targets.clear();const sharedMaterials=new Set(materials.values()),ownedMaterials=new Set(),ownedTextures=new Set();for(const w of worlds.values())[w.root,w.particles,w.dust].forEach(root=>root.traverse(obj=>{if(obj.isInstancedMesh)obj.dispose();if(obj.geometry&&!Object.values(geometries).includes(obj.geometry)&&obj.geometry!==roadGeo)obj.geometry.dispose();for(const material of Array.isArray(obj.material)?obj.material:[obj.material])if(material&&!sharedMaterials.has(material)){ownedMaterials.add(material);if(material.map)ownedTextures.add(material.map);}}));for(const texture of ownedTextures)texture.dispose();for(const material of ownedMaterials)material.dispose();}
  canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);
  document.addEventListener('visibilitychange',visibility);document.addEventListener('freeze',suspend);document.addEventListener('resume',recover);window.addEventListener('focus',recover);window.addEventListener('pagehide',suspend);window.addEventListener('pageshow',recover);
  window.addEventListener('resize',resize);resize();raf=requestAnimationFrame(frame);
  return {setRoutes,focus,overview,setQuality,resize,destroy,celebrateTap,debug};
}
