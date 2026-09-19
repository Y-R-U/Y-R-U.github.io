import * as THREE from 'three';
// Four material batches, vertex colors keep every fitting inside four draws.
export function createBoatView(){
  const boat=new THREE.Group(),batches=Array.from({length:4},()=>({p:[],n:[],c:[]}));
  const palette={cream:'#f0e6c6',rust:'#b0543a',dark:'#17313a',boot:'#1b4150',wood:'#a06a42',
    edge:'#c99257',brass:'#c99a52',rope:'#d7bb80',motor:'#dfe0d0',steel:'#8e9793',shadow:'#5c3b2a'};
  function add(geometry,mat,color,x=0,y=0,z=0,rx=0,ry=0,rz=0){
    geometry.rotateX(rx);geometry.rotateY(ry);geometry.rotateZ(rz);geometry.translate(x,y,z);
    const g=geometry.index?geometry.toNonIndexed():geometry,c=new THREE.Color(palette[color]||color),data=batches[mat];
    data.p.push(...g.attributes.position.array);data.n.push(...g.attributes.normal.array);for(let i=0;i<g.attributes.position.count;i++)data.c.push(c.r,c.g,c.b);if(g!==geometry)g.dispose();geometry.dispose();
  }
  const box=(w,h,d,x,y,z,mat,color,ry=0,rx=0,rz=0)=>add(new THREE.BoxGeometry(w,h,d),mat,color,x,y,z,rx,ry,rz);
  function face(points,mat,color){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));g.computeVertexNormals();add(g,mat,color);}
  // z, half-beam, sheer height, keel depth. Seven stations, stern to stem.
  const sections=[[-2.3,.64,.46,-.36],[-1.65,.82,.46,-.48],[-.8,.85,.47,-.50],[.2,.82,.49,-.49],[1.15,.64,.54,-.40],[1.9,.32,.63,-.20],[2.3,.012,.70,.05]];
  // Real V bottom, chine, a boot top just above the waterline, topside, thick
  // gunwale, inner liner and a raised dry sole. The boot band is what makes the
  // hull read as cream-over-dark from the chase camera instead of one brown mass.
  const section=(s,side)=>{
    const [z,w,h,k]=s,chine=[side*w*.70,-.13,z],sheer=[side*w,h,z];
    const t=Math.min(.55,(.06+.13)/(h+.13)),boot=[chine[0]+(sheer[0]-chine[0])*t,chine[1]+(sheer[1]-chine[1])*t,z];
    return [[0,k,z],chine,boot,sheer,[side*(w-.065),h-.035,z],[side*w*.67,.16,z]];
  };
  const bandColour=['dark','boot','cream','rust','cream'];
  for(const side of [-1,1])for(let i=0;i<6;i++){
    const a=section(sections[i],side),b=section(sections[i+1],side);
    for(let j=0;j<5;j++)face([a[j],b[j],b[j+1],a[j],b[j+1],a[j+1]],0,bandColour[j]);
    const za=sections[i][0],zb=sections[i+1][0],xa=side*sections[i][1],xb=side*sections[i+1][1];
    const length=Math.hypot(xb-xa,zb-za),angle=Math.atan2(xb-xa,zb-za);
    box(.075,.09,length,(xa+xb)/2,(sections[i][2]+sections[i+1][2])/2-.105,(za+zb)/2,0,'rust',angle);
  }
  // Transom: three varnished planks in a dark frame, not one flat slab.
  const stern=section(sections[0],1),port=section(sections[0],-1);
  face([port[0],port[1],port[2],port[0],port[2],stern[2],port[0],stern[2],stern[1]],0,'boot');
  for(let i=0;i<3;i++){
    const y0=-.02+i*.155,y1=y0+.14,w=.625-i*.004;
    face([[-w,y0,-2.31],[w,y0,-2.31],[w,y1,-2.31],[-w,y0,-2.31],[w,y1,-2.31],[-w,y1,-2.31]],1,'cream');
  }
  box(.56,.10,.03,0,.20,-2.335,1,'edge');box(.44,.028,.028,0,.20,-2.352,1,'rust');
  box(1.30,.055,.05,0,.435,-2.315,1,'rust');
  // Sole: raised dry floor with visible planking.
  for(let i=0;i<6;i++){
    const [za,wa]=sections[i],[zb,wb]=sections[i+1];
    face([[-wa*.7,.17,za],[wa*.7,.17,za],[wb*.7,.17,zb],[-wa*.7,.17,za],[wb*.7,.17,zb],[-wb*.7,.17,zb]],1,'wood');
  }
  for(const z of [-1.38,-.10,1.05]){
    const width=z>1?1.04:1.44;
    box(width,.115,.34,0,.39,z,1,'edge');box(width,.025,.025,0,.455,z,1,'wood');
    for(const x of [-width*.38,width*.38])box(.075,.25,.20,x,.24,z,1,'shadow');
  }
  for(const x of [-.36,-.12,.12,.36])box(.015,.008,2.8,x,.18,-.45,1,'shadow');
  // Two oars stowed along the side decks — the boat should look used.
  for(const side of [-1,1]){
    box(.05,.045,2.05,side*.66,.435,-.35,1,'edge',side*.035);
    box(.015,.13,.42,side*.60,.435,-1.48,1,'wood',side*.035);
  }
  // Pointed foredeck and stern knees make the launch silhouette legible.
  face([[-.52,.52,1.30],[.52,.52,1.30],[.01,.69,2.28]],1,'edge');
  for(const side of [-1,1])face([[side*.61,.45,-2.24],[side*.74,.45,-1.80],[side*.36,.45,-2.24]],1,'edge');
  // Outboard: pale cowling with a rust band, grey leg, brass gearcase and prop.
  // A dark drum here is the single loudest thing in the chase view — keep it light.
  const mz=-2.40;
  box(.44,.10,.17,0,.50,-2.36,2,'steel');
  box(.30,.24,.34,0,.70,mz,0,'motor');
  box(.24,.075,.29,0,.845,mz,0,'motor');
  box(.32,.055,.36,0,.565,mz,0,'rust');
  box(.20,.035,.02,0,.74,mz-.175,0,'steel');
  box(.20,.035,.02,0,.68,mz-.175,0,'steel');
  box(.125,.34,.16,0,.35,mz,2,'steel');
  box(.10,.52,.145,0,-.03,mz,2,'dark');
  add(new THREE.CylinderGeometry(.062,.05,.34,8),2,'dark',0,-.31,mz+.03,Math.PI/2);
  for(let i=0;i<3;i++)box(.028,.20,.055,0,-.31,mz-.10,2,'brass',0,0,i*Math.PI*2/3);
  box(.045,.045,.60,-.17,.60,-2.18,2,'dark',.26);
  box(.05,.09,.13,-.30,.615,-1.90,2,'shadow',.26);
  // Rope coil uses a spiral tube; brass lamp is an actual fitting with warm lens.
  const rope=[];for(let i=0;i<100;i++){const a=i/99*Math.PI*6,r=.10+.15*i/99;rope.push(new THREE.Vector3(Math.cos(a)*r-.15,.54,1.53+Math.sin(a)*r*.7));}
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rope),96,.018,4,false),1,'rope');
  add(new THREE.CylinderGeometry(.028,.034,.34,8),2,'brass',0,.83,1.92);
  add(new THREE.CylinderGeometry(.062,.07,.045,10),2,'brass',0,1.00,1.92);
  add(new THREE.CylinderGeometry(.052,.052,.13,10),3,'#ffe6a2',0,1.07,1.92);
  add(new THREE.ConeGeometry(.075,.075,10),2,'brass',0,1.17,1.92);
  add(new THREE.CylinderGeometry(.014,.019,.66,6),2,'brass',0,.95,2.16);
  const flagStart=batches[0].p.length;
  face([[0,1.27,2.16],[.42,1.15,2.08],[0,1.03,2.16]],0,'rust');
  const materials=[new THREE.MeshStandardMaterial({vertexColors:true,roughness:.62,side:THREE.DoubleSide}),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.78,side:THREE.DoubleSide}),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.42,metalness:.45}),new THREE.MeshStandardMaterial({vertexColors:true,emissive:'#ffc078',emissiveIntensity:1.1,roughness:.3})];
  let triangles=0;for(let i=0;i<4;i++){const b=batches[i],g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.n,3));g.setAttribute('color',new THREE.Float32BufferAttribute(b.c,3));triangles+=b.p.length/9;boat.add(new THREE.Mesh(g,materials[i]));}
  boat.userData={triangles,draws:4,sections:7,update(time,speed){const p=boat.children[0].geometry.attributes.position;p.array[flagStart+5]=2.08+Math.sin(time*5)*.025-Math.min(Math.abs(speed),8)*.013;p.needsUpdate=true;}};
  return boat;
}
