import * as THREE from 'three';

// A tinpot soldier. Seen from 16 degrees off vertical he is mostly helmet, so the helmet is the
// team colour and gets the rim — but the brief asks for "a little bit of body/legs" and the old
// helmet-on-a-stick gave neither. He now has shoulders, a torso, webbing, a pack and two boots
// that swing, and three silhouettes you can tell apart from up here: standing (compact, rifle
// down), running (legs fore and aft, leaning), firing (braced stance, rifle level and forward).
//
// Everything rigid is merged into four meshes — body, helmet, each leg, arms+rifle — so a full
// squad plus enemies is about thirty draw calls rather than two hundred.

const V=new THREE.Vector3(),M=new THREE.Matrix4(),Q=new THREE.Quaternion(),E=new THREE.Euler();
function at(x,y,z,rx=0,ry=0,rz=0,sx=1,sy=1,sz=1){
 return M.clone().compose(V.set(x,y,z),Q.setFromEuler(E.set(rx,ry,rz)),new THREE.Vector3(sx,sy,sz));
}
function merge(parts){
 const pos=[],nor=[],col=[];
 for(const {geo,color,m} of parts){
  const g=(geo.index?geo.toNonIndexed():geo.clone());
  g.applyMatrix4(m);
  const gp=g.attributes.position,gn=g.attributes.normal;
  for(let i=0;i<gp.count;i++){
   pos.push(gp.getX(i),gp.getY(i),gp.getZ(i));
   nor.push(gn.getX(i),gn.getY(i),gn.getZ(i));
   col.push(color.r,color.g,color.b);
  }
  g.dispose();
 }
 const out=new THREE.BufferGeometry();
 out.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 out.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
 out.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
 return out;
}

const HUE={cloth:0x6d6c48,clothDark:0x565537,webbing:0x3f4030,boot:0x272b26,
           skin:0xd8ab78,steel:0x3b4038,wood:0x6b4a2c,pack:0x7b7550};
const c=k=>new THREE.Color(HUE[k]);

function buildGeometry(){
 const box=new THREE.BoxGeometry(1,1,1);
 // --- torso, head, shoulders, pack: one mesh ------------------------------------------------
 const body=merge([
  {geo:box,color:c('cloth'),      m:at(0,1.05,0,0,0,0,.52,.60,.36)},           // chest
  {geo:box,color:c('clothDark'),  m:at(0,.76,0,0,0,0,.48,.24,.33)},            // waist
  {geo:box,color:c('webbing'),    m:at(0,.88,.02,0,0,0,.56,.10,.39)},          // belt
  {geo:new THREE.SphereGeometry(.175,7,5),color:c('cloth'),m:at(-.30,1.24,0)}, // shoulder
  {geo:new THREE.SphereGeometry(.175,7,5),color:c('cloth'),m:at(.30,1.24,0)},
  {geo:box,color:c('pack'),       m:at(0,1.10,-.28,.12,0,0,.38,.36,.22)},      // pack
  {geo:box,color:c('webbing'),    m:at(0,1.26,-.32,0,0,0,.32,.11,.13)},        // bedroll strap
  {geo:new THREE.CylinderGeometry(.095,.105,.13,6),color:c('skin'),m:at(0,1.42,0)},
  {geo:new THREE.SphereGeometry(.15,8,6),color:c('skin'),m:at(0,1.54,.02)},    // head
 ]);
 // --- one leg: thigh + boot, pivoted at the hip ---------------------------------------------
 const leg=merge([
  {geo:box,color:c('clothDark'),m:at(0,.48,0,0,0,0,.22,.50,.24)},
  {geo:box,color:c('boot'),     m:at(0,.13,.07,0,0,0,.25,.21,.48)},
 ]);
 leg.translate(0,-.74,0);
 // --- arms and rifle, pivoted at the shoulders -----------------------------------------------
 const arms=merge([
  {geo:box,color:c('cloth'),m:at(.28,1.14,.22,-.5,0,.08,.17,.18,.50)},
  {geo:box,color:c('cloth'),m:at(-.26,1.14,.18,-.4,0,-.08,.17,.18,.46)},
  {geo:box,color:c('skin'), m:at(.25,1.00,.50,0,0,0,.13,.13,.17)},
  {geo:box,color:c('steel'),m:at(.15,1.04,.76,0,0,0,.06,.06,1.14)},   // barrel
  {geo:box,color:c('wood'), m:at(.17,1.03,.28,0,0,0,.10,.12,.46)},    // stock
  {geo:box,color:c('steel'),m:at(.15,1.11,1.24,0,0,0,.022,.065,.11)}, // foresight
 ]);
 arms.translate(0,-1.18,0);
 // --- helmet: dome plus brim. Deliberately smaller than the shoulders — at 16 degrees off
 // vertical a Cannon-Fodder-sized tin hat eclipses the entire man. -----------------------------
 const helmet=merge([
  {geo:new THREE.SphereGeometry(.255,10,5,0,Math.PI*2,0,Math.PI*.55),color:new THREE.Color(0xffffff),m:at(0,0,0)},
  {geo:new THREE.CylinderGeometry(.30,.315,.05,12),color:new THREE.Color(0xe6e6e6),m:at(0,-.015,0)},
 ]);
 return {body,leg,arms,helmet};
}

export function createActors(scene){
 const G=buildGeometry();
 const bodyMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,flatShading:false});
 const teamMat={
  blue:new THREE.MeshStandardMaterial({color:0x6fbfae,vertexColors:true,metalness:.3,roughness:.42}),
  red:new THREE.MeshStandardMaterial({color:0xd96a44,vertexColors:true,metalness:.28,roughness:.42}),
  gold:new THREE.MeshStandardMaterial({color:0xe6bf4c,vertexColors:true,metalness:.45,roughness:.35}),
 };
 const actors=new Map();

 // boot dust — a small pool of expanding puffs, driven off distance walked
 const dustGeo=new THREE.CircleGeometry(1,8);dustGeo.rotateX(-Math.PI/2);
 const dust=new THREE.InstancedMesh(dustGeo,new THREE.MeshBasicMaterial({color:0xa79a78,transparent:true,opacity:.30,depthWrite:false}),64);
 dust.count=64;dust.frustumCulled=false;scene.add(dust);
 const puffs=Array.from({length:64},()=>({x:0,z:0,t:2}));let puffAt=0;
 const dummy=new THREE.Object3D();

 function make(u){
  const g=new THREE.Group();
  // The man leans ~11 degrees toward the camera inside his own group. The camera stays at the
  // 16 degrees the brief asks for; this is a character trick, not a camera one, and it is the
  // difference between seeing a helmet and seeing a man: it nearly doubles how far up-screen
  // the helmet sits from the boots, so shoulders, torso and boots all clear the hat.
  const lean=new THREE.Group();lean.rotation.x=-.19;g.add(lean);
  const yaw=new THREE.Group();lean.add(yaw);
  const legs=[-1,1].map(s=>{const m=new THREE.Mesh(G.leg,bodyMat);m.position.set(s*.20,.74,0);m.castShadow=true;yaw.add(m);return m;});
  const body=new THREE.Group();yaw.add(body);
  const torso=new THREE.Mesh(G.body,bodyMat);torso.castShadow=true;body.add(torso);
  const arms=new THREE.Group();arms.position.y=1.18;body.add(arms);
  const armMesh=new THREE.Mesh(G.arms,bodyMat);armMesh.castShadow=true;arms.add(armMesh);
  const hat=new THREE.Mesh(G.helmet,teamMat[u.escort?'gold':u.team]);
  hat.position.y=1.655;hat.castShadow=true;body.add(hat);
  const ring=new THREE.Mesh(new THREE.RingGeometry(.58,.63,20),new THREE.MeshBasicMaterial({color:0xa9d98a,transparent:true,opacity:.30,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.y=.04;g.add(ring);
  scene.add(g);
  return {g,yaw,body,legs,arms,hat,ring,cool:0,recoil:0,mark:0};
 }

 return {update(w,dt=0){
  for(const u of w.units){
   let a=actors.get(u.id);
   if(!a){a=make(u);actors.set(u.id,a);}
   a.g.position.set(u.x,0,u.z);a.yaw.rotation.y=u.yaw;

   if(u.hp<=0){
    const age=w.time-(u.deathTime??w.time);
    const flop=Math.min(1,age*5);
    a.body.rotation.set(-flop*1.45,0,Math.sin(u.id)*.4*flop);
    a.body.position.set(0,.30*flop,-.18*flop);
    a.legs.forEach((l,i)=>{l.rotation.set(-1.2*flop,0,(i?1:-1)*.5*flop);});
    a.arms.rotation.x=.9*flop;
    // the helmet pings off and rolls, which is the funniest part of the whole game
    a.hat.position.set(Math.min(1.3,age*2.1),1.655+Math.max(0,Math.sin(Math.min(1,age)*Math.PI)*1.9)-flop*.9,Math.min(.7,age*.9));
    a.hat.rotation.set(age*3,0,age<1.6?age*7:11.2);
    a.ring.visible=false;
    continue;
   }

   const firing=u.state==='engage',walking=u.state==='walk';
   // recoil: cooldown jumping back up means he has just let one off
   if(u.cooldown>a.cool+.01)a.recoil=1;
   a.cool=u.cooldown;a.recoil=Math.max(0,a.recoil-dt*7);

   if(walking){
    const ph=u.steps*5.0;
    a.body.position.set(0,Math.abs(Math.sin(ph))*.065,0);
    a.body.rotation.set(.16,0,Math.sin(ph)*.06);
    a.legs.forEach((l,i)=>l.rotation.set(Math.sin(ph+i*Math.PI)*.62,0,0));
    a.arms.rotation.x=.42-Math.sin(ph)*.12;
    a.mark+=u.speed*dt;
    if(a.mark>.85){a.mark=0;const p=puffs[puffAt=(puffAt+1)%64];p.x=u.x;p.z=u.z;p.t=0;}
   }else if(firing){
    a.body.position.set(0,0,0);
    a.body.rotation.set(-.05-a.recoil*.1,0,0);
    a.legs[0].rotation.set(-.34,0,-.16);
    a.legs[1].rotation.set(.30,0,.16);
    a.arms.rotation.x=-.06+a.recoil*.30;
   }else{
    const br=Math.sin(w.time*1.7+u.id)*.014;
    a.body.position.set(0,br,0);
    a.body.rotation.set(.02,0,0);
    a.legs.forEach(l=>l.rotation.set(0,0,0));
    a.arms.rotation.x=.34;
   }
   a.hat.position.set(0,1.655,0);a.hat.rotation.set(0,0,0);
   a.ring.visible=u.team==='blue'&&u.active&&!u.escort;
  }
  for(let i=0;i<64;i++){
   const p=puffs[i];p.t+=dt;
   const life=Math.min(1,p.t/.75);
   if(life>=1){dummy.scale.setScalar(0);}else{dummy.scale.setScalar((.22+life*.42)*(1-life*life));}
   dummy.position.set(p.x,.05+life*.12,p.z);dummy.rotation.set(0,i,0);
   dummy.updateMatrix();dust.setMatrixAt(i,dummy.matrix);
  }
  dust.instanceMatrix.needsUpdate=true;
 }};
}
