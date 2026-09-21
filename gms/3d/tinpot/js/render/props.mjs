import * as THREE from 'three';
export function createProps(scene,w){const root=new THREE.Group(),coverGroups=new Map(),sand=new THREE.MeshStandardMaterial({color:0xaa9c70,roughness:1}),wood=new THREE.MeshStandardMaterial({color:0x755036,roughness:1}),cut=new THREE.MeshStandardMaterial({color:0xbe955d,roughness:1}),stone=new THREE.MeshStandardMaterial({color:0x8a8194,roughness:.85}),dark=new THREE.MeshStandardMaterial({color:0x333e49,roughness:1});
 function mesh(group,geo,mat,x,y,z,sx=1,sy=1,sz=1){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;group.add(m);return m;}
 for(const c of w.cover||[]){const g=new THREE.Group();g.position.set(c.x,0,c.z);g.rotation.y=c.id*1.73;root.add(g);coverGroups.set(c.id,g);
 if(c.type==='rock'){mesh(g,new THREE.IcosahedronGeometry(1,0),stone,0,.62,0,1.2,.95,.86);mesh(g,new THREE.IcosahedronGeometry(.5,0),dark,.7,.23,.5);}
 if(c.type==='log'){const log=mesh(g,new THREE.CylinderGeometry(.28,.34,2.4,7),wood,0,.3,0);log.rotation.z=Math.PI/2;const end=mesh(g,new THREE.CircleGeometry(.27,7),cut,1.21,.3,0);end.rotation.y=Math.PI/2;mesh(g,new THREE.BoxGeometry(.5,.14,.18),wood,-.3,.6,0);}
 if(c.type==='stump'){mesh(g,new THREE.CylinderGeometry(.37,.52,.6,7),wood,0,.3,0);const top=mesh(g,new THREE.CircleGeometry(.35,7),cut,0,.61,0);top.rotation.x=-Math.PI/2;}
 if(c.type==='wall'){for(let i=0;i<4;i++)mesh(g,new THREE.IcosahedronGeometry(.5,0),stone,(i-1.5)*.5,.34,0,.7,.8,.8);mesh(g,new THREE.IcosahedronGeometry(.5,0),stone,-.3,.8,0,.7,.65,.8);}
 if(c.type==='cart'){for(let i=0;i<5;i++)mesh(g,new THREE.BoxGeometry(.2,.12,1.6),cut,(i-2)*.23,.65,0);for(const x of [-.65,.65]){const wheel=mesh(g,new THREE.TorusGeometry(.42,.085,4,9),wood,x,.45,.2);wheel.rotation.y=Math.PI/2;mesh(g,new THREE.BoxGeometry(.1,.65,1.5),wood,x,.95,0);}const axle=mesh(g,new THREE.CylinderGeometry(.055,.055,2,5),dark,0,.43,.2);axle.rotation.z=Math.PI/2;mesh(g,new THREE.BoxGeometry(.1,.12,2.2),wood,0,.5,1.2);g.rotation.z=.14;}}
 // Shell craters: a shallow scorched bowl with a ring of upthrown clods. The first attempt was a
 // flat unlit disc and read as a hole punched in the world, so the bowl has real geometry now.
 const scorch=new THREE.MeshStandardMaterial({color:0x6e5a41,roughness:1}),clod=new THREE.MeshStandardMaterial({color:0x6f5940,roughness:1,flatShading:true});
 for(const [x,z,r] of [[1.7,-1.5,.9],[-1.8,-14,1.1],[2.4,18,.7],[-5.1,6,.75]]){
  const bowl=new THREE.CircleGeometry(r,16);const bp=bowl.attributes.position;
  for(let i=0;i<bp.count;i++){const px=bp.getX(i),py=bp.getY(i),d=Math.hypot(px,py)/r;
   const k=1+.09*Math.sin(i*1.7+x);bp.setXY(i,px*k,py*k);bp.setZ(i,-.05+d*.06);}
  bowl.computeVertexNormals();
  const hole=mesh(root,bowl,scorch,x,.06,z);hole.rotation.x=-Math.PI/2;
  for(let i=0;i<8;i++){const a=i*.79+x,rr=r*(1.0+(i%3)*.08);
   mesh(root,new THREE.IcosahedronGeometry(.15+(i%4)*.04,0),clod,x+Math.cos(a)*rr,.06,z+Math.sin(a)*rr,1,.55,1);}
 }
 // A crooked sign points firmly in both directions.
 mesh(root,new THREE.BoxGeometry(.12,2,.12),wood,-5.5,1,9);const board=mesh(root,new THREE.BoxGeometry(1.25,.32,.12),cut,-5.35,1.6,9);board.rotation.z=.12;const board2=mesh(root,new THREE.BoxGeometry(.85,.24,.12),wood,-5.6,1.1,9);board2.rotation.z=-.2;
 // The emplacement is real cover now, so it is drawn from `w.works` rather than from hard-coded
 // coordinates — the bags you can see are exactly the bags that stop a bullet, and a grenade
 // that flattens one makes it disappear.
 const workGroups=new Map();
 for(const k of w.works||[]){const g=new THREE.Group();g.position.set(k.x,0,k.z);g.rotation.y=k.id*.9;root.add(g);workGroups.set(k.id,g);
  if(k.type==='pit'){const ring=mesh(g,new THREE.TorusGeometry(k.r,.3,5,16),sand,0,.1,0);ring.rotation.x=Math.PI/2;
   const hole=mesh(g,new THREE.CircleGeometry(k.r*.86,14),dark,0,.055,0);hole.rotation.x=-Math.PI/2;
   const tube=mesh(g,new THREE.CylinderGeometry(.09,.11,1.15,6),dark,.12,.55,-.1);tube.rotation.set(-.42,0,.1);
   mesh(g,new THREE.BoxGeometry(.5,.08,.5),wood,.12,.06,-.1);continue;}
  for(let i=0;i<3;i++)mesh(g,new THREE.SphereGeometry(1,8,5),sand,(i-1)*.50,.26,(i%2)*.09-.04,.36,.27,.42);
  for(let i=0;i<2;i++)mesh(g,new THREE.SphereGeometry(1,8,5),sand,(i-.5)*.52,.70,.03,.34,.25,.40);
  mesh(g,new THREE.BoxGeometry(.07,.62,.07),wood,-.72,.31,.12);
 }
 if(w.mission?.type==='reach'||w.mission?.type==='escort'){const goal=w.map.goal,ring=mesh(root,new THREE.RingGeometry(1.5,1.65,40),new THREE.MeshBasicMaterial({color:0xf5d281,side:THREE.DoubleSide}),goal.x,.045,goal.z);ring.rotation.x=-Math.PI/2;mesh(root,new THREE.CylinderGeometry(.035,.035,3,5),sand,goal.x,1.5,goal.z);mesh(root,new THREE.BoxGeometry(.95,.55,.03),new THREE.MeshStandardMaterial({color:0xe9c364}),goal.x+.47,2.7,goal.z);}
 scene.add(root);return {update(){for(const c of w.cover||[])coverGroups.get(c.id).visible=!c.dead;for(const k of w.works||[])workGroups.get(k.id).visible=!k.dead;}};
}
