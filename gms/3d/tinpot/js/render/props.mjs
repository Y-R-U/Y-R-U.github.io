import * as THREE from 'three';
export function createProps(scene,w){const root=new THREE.Group(),coverGroups=new Map(),sand=new THREE.MeshStandardMaterial({color:0xaa9c70,roughness:1}),wood=new THREE.MeshStandardMaterial({color:0x755036,roughness:1}),cut=new THREE.MeshStandardMaterial({color:0xbe955d,roughness:1}),stone=new THREE.MeshStandardMaterial({color:0x8a8194,roughness:.85}),dark=new THREE.MeshStandardMaterial({color:0x333e49,roughness:1});
 function mesh(group,geo,mat,x,y,z,sx=1,sy=1,sz=1){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.castShadow=m.receiveShadow=true;group.add(m);return m;}
 for(const c of w.cover||[]){const g=new THREE.Group();g.position.set(c.x,0,c.z);g.rotation.y=c.id*1.73;root.add(g);coverGroups.set(c.id,g);
 if(c.type==='landmark'){
 g.rotation.y=0;
 const plaster=new THREE.MeshStandardMaterial({color:w.map.theme==='capital'?0xddd2aa:0xb1aa87,roughness:1}),roof=new THREE.MeshStandardMaterial({color:w.map.theme==='village'?0x8f4031:0x526c63,roughness:.9}),gold=new THREE.MeshStandardMaterial({color:0xd5b45c,roughness:.7});
 const theme=w.map.theme;
 if(['village','ministry','capital'].includes(theme)){
  mesh(g,new THREE.BoxGeometry(3.3,2.8,3),plaster,0,1.4,0);
  const top=mesh(g,new THREE.ConeGeometry(2.7,1.3,4),roof,0,3.4,0);top.rotation.y=Math.PI/4;
  mesh(g,new THREE.BoxGeometry(.7,1.6,.12),wood,0,.8,1.55);
  for(const x of [-1,1])mesh(g,new THREE.BoxGeometry(.55,.7,.13),dark,x,1.8,1.55);
  if(theme!=='village')for(const x of [-1.5,1.5])mesh(g,new THREE.CylinderGeometry(.17,.22,3.6,6),plaster,x,1.8,1.9);
  if(theme==='capital')mesh(g,new THREE.SphereGeometry(.6,10,6),gold,0,4.3,0);
 }else if(theme==='radio'){
  for(const x of [-1,1]){const leg=mesh(g,new THREE.CylinderGeometry(.08,.18,7,5),dark,x,3.5,0);leg.rotation.z=x*.12;}
  for(let i=0;i<5;i++)mesh(g,new THREE.BoxGeometry(2.8-i*.35,.11,.13),dark,0,1.5+i,0);
  mesh(g,new THREE.SphereGeometry(.55,10,6),gold,0,6.8,0);
 }else if(theme==='quarry'){
  for(let i=0;i<5;i++)mesh(g,new THREE.IcosahedronGeometry(1.3,0),plaster,(i%2-.5)*1.4,.7+(i>2?1:0),(i%3-1)*.8,1,.8,1);
  mesh(g,new THREE.BoxGeometry(.18,4,.18),wood,1,2,0);mesh(g,new THREE.BoxGeometry(3.6,.22,.2),wood,0,3.9,0);
 }else if(theme==='rail'){
  for(const x of [-.9,.9])mesh(g,new THREE.BoxGeometry(.12,.13,8),dark,x,.12,0);
  for(let i=0;i<10;i++)mesh(g,new THREE.BoxGeometry(2.5,.12,.25),wood,0,.06,i*.8-4);
  mesh(g,new THREE.BoxGeometry(2.2,1.5,3.6),roof,0,1,0);
  for(const x of [-1.2,1.2])for(const z of [-1.1,1.1]){const wheel=mesh(g,new THREE.CylinderGeometry(.35,.35,.15,8),dark,x,.45,z);wheel.rotation.z=Math.PI/2;}
 }else if(theme==='marsh'){
  const water=mesh(g,new THREE.CircleGeometry(2.6,16),new THREE.MeshStandardMaterial({color:0x52787a,roughness:.15}),0,.035,0);water.rotation.x=-Math.PI/2;
  for(let i=0;i<7;i++)mesh(g,new THREE.BoxGeometry(2,.12,.35),wood,0,.15,i*.48-1.5);
  for(const x of [-1.4,1.4])mesh(g,new THREE.CylinderGeometry(.035,.06,2,5),gold,x,1,0);
 }else{
  for(let i=0;i<5;i++){const box=mesh(g,new THREE.BoxGeometry(1.1,.8,.9),cut,(i%2-.5)*1.3,.4+(i>2?.85:0),(i%3-1)*.8);box.rotation.y=i*.3;}
  mesh(g,new THREE.BoxGeometry(.12,3,.12),wood,0,1.5,0);mesh(g,new THREE.BoxGeometry(2,.55,.1),gold,0,2.7,0);
 }
 }
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
 if(w.map.depot){const d=w.map.depot,white=new THREE.MeshBasicMaterial({color:0xa8ead1,depthTest:false,transparent:true,opacity:.8});
 const ring=mesh(root,new THREE.RingGeometry(1.8,1.95,32),white,d.x,.09,d.z);ring.rotation.x=-Math.PI/2;ring.renderOrder=5;
 mesh(root,new THREE.BoxGeometry(.45,.08,2.1),white,d.x,.12,d.z);mesh(root,new THREE.BoxGeometry(2.1,.08,.45),white,d.x,.12,d.z);
 }
 scene.add(root);return {update(){for(const c of w.cover||[])coverGroups.get(c.id).visible=!c.dead;for(const k of w.works||[])workGroups.get(k.id).visible=!k.dead;}};
}
