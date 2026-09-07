import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export const ground=(x,z)=>.45+Math.sin(x*.15+z*.06)*.36+Math.cos(z*.18)*.25;
export const inside=(x,z)=>x*x/(21*21)+z*z/(30*30)<1;
let seed=731;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296};
const materials=new Map();
function mat(color,emissive=0){let k=color+':'+emissive;if(!materials.has(k))materials.set(k,new T.MeshStandardMaterial({color,roughness:.86,metalness:0,emissive:color,emissiveIntensity:emissive}));return materials.get(k)}
function mesh(parent,geo,color,x=0,y=0,z=0,emissive=0){const m=new T.Mesh(geo,mat(color,emissive));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m}
const box=(p,c,x,y,z,w,h,d)=>mesh(p,new T.BoxGeometry(w,h,d),c,x,y,z);
const cyl=(p,c,x,y,z,rt,rb,h,n=8)=>mesh(p,new T.CylinderGeometry(rt,rb,h,n),c,x,y,z);
const rock=(p,c,x,y,z,s=1)=>{let m=mesh(p,new T.DodecahedronGeometry(s,0),c,x,y,z);m.scale.set(1,.7+rand()*.5,.7+rand()*.5);m.rotation.set(rand(),rand()*6,rand());return m};
function mergeStatic(group){group.updateMatrixWorld(true);const bins=new Map();group.traverse(o=>{if(!o.isMesh)return;const g=o.geometry.clone().applyMatrix4(o.matrixWorld);g.deleteAttribute('uv');g.deleteAttribute('color');const geo=g.index?g.toNonIndexed():g;let a=bins.get(o.material)||[];a.push(geo);bins.set(o.material,a)});const merged=new T.Group();for(const[m,gs]of bins){const g=mergeGeometries(gs.map(g=>g.index?g.toNonIndexed():g),false);if(!g)continue;const o=new T.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;merged.add(o);for(const geo of gs)geo.dispose()}return merged}
export function createWorld(renderer){
 const scene=new T.Scene();scene.background=new T.Color('#355961');scene.fog=new T.FogExp2('#456b70',.009);
 const sky=new T.HemisphereLight('#a3dfe3','#304337',1.65);scene.add(sky);
 const sun=new T.DirectionalLight('#ffe0a6',2.7);sun.position.set(-24,32,16);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-37,right:37,top:40,bottom:-40,near:1,far:110});sun.shadow.bias=-.0008;sun.shadow.normalBias=.035;scene.add(sun);
 const fill=new T.DirectionalLight('#5fb6c8',1.0);fill.position.set(18,12,-25);scene.add(fill);
 const staticRoot=new T.Group(), objects=[],animated=[],colliders=[];scene.add(staticRoot);
 // Sculpted radial land: green crown, weathered sandstone rim, dark sea cliffs.
 const seg=144,rings=28,verts=[],colors=[],indices=[];const color=new T.Color();
 for(let r=0;r<=rings;r++)for(let j=0;j<=seg;j++){let a=j/seg*Math.PI*2,q=r/rings,edge=1+.033*Math.sin(a*7)+.018*Math.cos(a*13),x=Math.cos(a)*23*q*edge,z=Math.sin(a)*33*q*edge,y=ground(x,z);if(q>.87)y-=Math.pow((q-.87)/.13,1.4)*3.2;verts.push(x,y,z);color.set(q>.955?'#344747':q>.88?'#9d9975':z<-7?'#42584d':'#617757');color.multiplyScalar(.96+.045*Math.sin(x*.8)*Math.cos(z*.65));colors.push(color.r,color.g,color.b);if(r<rings&&j<seg){let n=r*(seg+1)+j;indices.push(n,n+1,n+seg+1,n+1,n+seg+2,n+seg+1)}}
 const landGeo=new T.BufferGeometry();landGeo.setAttribute('position',new T.Float32BufferAttribute(verts,3));landGeo.setAttribute('color',new T.Float32BufferAttribute(colors,3));landGeo.setIndex(indices);landGeo.computeVertexNormals();const land=new T.Mesh(landGeo,new T.MeshStandardMaterial({vertexColors:true,roughness:1}));land.receiveShadow=true;
 land.material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 landPos;').replace('#include <begin_vertex>','#include <begin_vertex>\nlandPos=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
 varying vec3 landPos;
 float hashLand(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float noiseLand(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hashLand(i),hashLand(i+vec2(1,0)),f.x),mix(hashLand(i+vec2(0,1)),hashLand(i+1.),f.x),f.y);}
 `).replace('#include <color_fragment>',`#include <color_fragment>
 float detail=noiseLand(landPos.xz*15.);float groundPatch=noiseLand(landPos.xz*.75);diffuseColor.rgb*=.79+detail*.17+groundPatch*.21;
 `)};scene.add(land);
 const waterUniform={value:0};const waterMat=new T.ShaderMaterial({uniforms:{time:waterUniform},vertexShader:`varying vec3 p; uniform float time; void main(){p=position; vec3 v=position;v.z+=sin(v.x*.65+time)*.07+cos(v.y*.5+time*.8)*.05;gl_Position=projectionMatrix*modelViewMatrix*vec4(v,1.);}`,fragmentShader:`varying vec3 p;uniform float time;void main(){float r=length(p.xy/vec2(23.,33.));float waves=sin(p.x*.7+p.y*.32+sin(p.y*.8+time)*.8-time)*.5+.5;float fine=pow(max(0.,sin(p.x*2.6+p.y*1.6+sin(p.x*.9-p.y*.7+time)*2.+time*.6)),24.)*pow(max(0.,sin(p.y*1.5-p.x*.8-time*.4)),4.);float shore=(1.-smoothstep(1.0,1.25,r))*smoothstep(.94,1.02,r);vec3 col=mix(vec3(.035,.16,.20),vec3(.15,.39,.41),waves*.09+max(0.,1.-r/2.)*.6);col+=vec3(.38,.63,.57)*shore*(.25+waves*.65);col+=vec3(.42,.60,.53)*fine*.12;gl_FragColor=vec4(col,1.);}`});
 const sea=new T.Mesh(new T.PlaneGeometry(500,500,100,100),waterMat);sea.rotation.x=-Math.PI/2;sea.position.y=-.85;scene.add(sea);
 const pathPoints=[[-1,24],[0,16],[-4,10],[-7,5],[-3,0],[1,-5],[0,-12],[0,-21],[0,-27]];
 for(let j=0;j<pathPoints.length-1;j++){const[a,b]=[pathPoints[j],pathPoints[j+1]];let len=Math.hypot(a[0]-b[0],a[1]-b[1]);for(let k=0;k<len/.38;k++){let t=k/(len/.38),x=a[0]+(b[0]-a[0])*t,z=a[1]+(b[1]-a[1])*t;for(let n=0;n<4;n++){let xx=x+(rand()-.5)*2.9,zz=z+(rand()-.5)*.9;const tile=cyl(staticRoot,['#91917a','#a09a80','#787f6d'][Math.floor(rand()*3)],xx,ground(xx,zz)+.015,zz,.28+rand()*.2,.3,.055,5);tile.rotation.y=rand()*6;}}}
 function prop(id,name,kind,x,z,build,radius=1){const g=new T.Group();g.position.set(x,ground(x,z),z);staticRoot.add(g);build(g);const o={id,name,kind,x,z,y:ground(x,z),group:g,radius};objects.push(o);return o}
 function pine(x,z,s=1){const y=ground(x,z);
 if(rand()<.36){cyl(staticRoot,'#554d3b',x,y+1.8*s,z,.12*s,.28*s,3.6*s,7);for(let j=0;j<7;j++){let a=j*2.4,r=j===0?0:.75*s,bx=x+Math.cos(a)*r,bz=z+Math.sin(a)*r,by=y+(3.1+rand()*.9)*s;let crown=rock(staticRoot,['#345c49','#4b7352','#66885a'][j%3],bx,by,bz,1.1*s);crown.scale.y=.7;let branch=cyl(staticRoot,'#625a40',(x+bx)/2,y+2.5*s,(z+bz)/2,.08,.1,1.5*s,5);branch.rotation.z=Math.cos(a)*.6;}colliders.push({x,z,r:.4*s});return}
 cyl(staticRoot,'#544c37',x,y+1.7*s,z,.13*s,.24*s,3.4*s,7);for(let j=0;j<4;j++){let m=cyl(staticRoot,['#264f45','#32604c','#426b50','#527c5a'][j],x,y+(2+j*.64)*s,z,.05,(1.7-j*.28)*s,2*s,7);m.rotation.y=j*.6;}colliders.push({x,z,r:.45*s})}
 for(let i=0;i<72;i++){let x=(rand()-.5)*39,z=(rand()-.5)*55;if(!inside(x,z)||(x>5&&x<12&&z>19)||Math.abs(x)<5||((z>0&&z<19)&&x>-12&&x<15))continue;pine(x,z,.65+rand()*.7)}
 // Meadow tufts, flowers and ferns are merged by material to keep draw calls low.
 for(let i=0;i<3600;i++){let x=(rand()-.5)*43,z=(rand()-.5)*62;if(!inside(x,z)||(x>6&&x<10&&z>20)||Math.abs(x)<2.7||((x+7)**2+(z-12)**2<18))continue;let y=ground(x,z),s=.11+rand()*.2;const m=mesh(staticRoot,new T.ConeGeometry(.10,s*2.6,3),z<-6?'#567765':['#819365','#809b67','#9ea577'][i%3],x,y+s,z);m.rotation.z=(rand()-.5)*.5;if(i%12===0){for(let k=0;k<3;k++)mesh(staticRoot,new T.IcosahedronGeometry(.065),i%24?'#cfb278':'#a2b8c0',x+(rand()-.5)*.3,y+.3+rand()*.13,z+(rand()-.5)*.3)}}
 for(let i=0;i<70;i++){let a=rand()*6.28,r=.94+rand()*.09,x=Math.cos(a)*23*r,z=Math.sin(a)*33*r;rock(staticRoot,'#62736b',x,ground(x,z)-.8,z,.5+rand()*1.1)}
 function lantern(x,z){let y=ground(x,z);cyl(staticRoot,'#594d35',x,y+1.45,z,.07,.09,2.9);box(staticRoot,'#423d2b',x+.2,y+2.75,z,.5,.08,.08);box(staticRoot,'#443e2e',x+.4,y+2.3,z,.34,.55,.34);mesh(staticRoot,new T.BoxGeometry(.27,.35,.27),'#ffd28a',x+.4,y+2.3,z,2);cyl(staticRoot,'#423d2b',x+.4,y+2.63,z,0,.27,.22,4);const l=new T.PointLight('#ffc174',8,7,2);l.position.set(x+.4,y+2.3,z);scene.add(l)}
 [[-2,17],[-5,7],[2,-3],[-3,-14],[4,-23]].forEach(([x,z])=>lantern(x,z));
 // Keeper's timber and plaster cottage, individual roof courses and lit windows.
 const house=new T.Group();house.position.set(-9,ground(-9,13),13);house.rotation.y=.22;staticRoot.add(house);
 box(house,'#9b977a',0,1.4,0,4.3,2.8,3.5);box(house,'#5b604e',0,.18,0,4.6,.36,3.8);
 for(let x of[-2.12,0,2.12])box(house,'#4a4433',x,1.55,1.79,.16,2.65,.13);for(let y of[.45,2.5])box(house,'#4a4433',0,y,1.8,4.4,.14,.14);
 box(house,'#413d2e',.6,1.1,1.82,.9,1.9,.12);box(house,'#c6a265',.9,1.15,1.9,.06,.06,.05);
 for(let x of[-1.1,1.5]){box(house,'#433d2e',x,1.75,1.85,.73,.85,.14);mesh(house,new T.BoxGeometry(.55,.67,.07),'#ffc77a',x,1.75,1.94,1.3);box(house,'#574b31',x,1.75,2,.055,.75,.06);box(house,'#574b31',x,1.75,2,.6,.06,.06)}
 for(let side of[-1,1]){let roof=box(house,'#414f4b',side*1.15,3.18,0,2.7,.18,4.15);roof.rotation.z=-side*.47;for(let r=0;r<5;r++)for(let c=0;c<10;c++){let tile=box(house,['#4c6661','#54706a','#3a5755'][(r+c)%3],side*(.22+r*.51),3.8-r*.26,-1.9+c*.42,.6,.10,.44);tile.rotation.z=-side*.47;}}
 box(house,'#797b69',-1.2,3.7,-.8,.6,2.2,.6);for(let i=0;i<4;i++)box(house,'#b0a68b',-1.2,3.1+i*.5,-.8,.66,.1,.66);
 colliders.push({x:-9,z:13,r:2.7});

 // Fern rosettes, meadow flowers and clustered shrubs soften the ground line.
 for(let i=0;i<260;i++){let x=(rand()-.5)*38,z=(rand()-.5)*53;if(!inside(x,z)||Math.abs(x)<3||(x>-12&&x<-6&&z>9&&z<16)||(x>6&&x<10&&z>20))continue;let y=ground(x,z);for(let j=0;j<5;j++){let a=j*1.256;let leaf=mesh(staticRoot,new T.SphereGeometry(.25,5,3),i%3?'#6f8959':'#8c9860',x+Math.cos(a)*.22,y+.15,z+Math.sin(a)*.22);leaf.scale.set(.36,.22,1.7);leaf.rotation.y=-a;leaf.rotation.x=.35;}if(i%3===0){for(let j=0;j<3;j++){let xx=x+(rand()-.5)*.5,zz=z+(rand()-.5)*.5;cyl(staticRoot,'#5c7650',xx,y+.23,zz,.015,.018,.46,3);mesh(staticRoot,new T.IcosahedronGeometry(.085,0),i%2?'#ead298':'#a6bacd',xx,y+.5,zz)}}}
 // Split rail fence, barrels, cottage steps and a little herb garden.
 for(let j=0;j<7;j++){const x=-14+j*.8,z=17,y=ground(x,z);box(staticRoot,'#716c4d',x,y+.48,z,.12,.95,.13);if(j<6){for(let h of[.35,.75])box(staticRoot,'#938564',x+.4,y+h,z,.8,.10,.08)}}
 for(let i=0;i<3;i++){let x=-6.4+i*.55,z=14.9;cyl(staticRoot,'#826a45',x,ground(x,z)+.28,z,.27,.22,.5);for(let j=0;j<4;j++)rock(staticRoot,'#82965e',x+(rand()-.5)*.3,ground(x,z)+.6,z+(rand()-.5)*.3,.18)}
 for(let x of[-12,-12.7]){const z=10,y=ground(x,z);cyl(staticRoot,'#877653',x,y+.4,z,.34,.32,.8,10);for(let h of[.13,.64])cyl(staticRoot,'#48514a',x,y+h,z,.35,.35,.07,10);}
 for(let j=0;j<3;j++)box(staticRoot,'#a19b7a',-8,ground(-8,15)+.08-j*.06,15+j*.33,1.7,.15,.4);

 // Pier and small boat.
 for(let i=0;i<18;i++)box(staticRoot,i%2?'#74684c':'#857b5b',8,.93,21+i*.45,2.6,.16,.39);
 for(let z of[21,23,26])for(let x of[6.7,9.3])cyl(staticRoot,'#544f39',x,.3,z,.12,.16,2.7);
 const boat=new T.Group();boat.position.set(11,-.55,25);boat.rotation.y=.2;staticRoot.add(boat);let hull=mesh(boat,new T.SphereGeometry(1,10,5,0,Math.PI*2,0,Math.PI/2),'#655441');hull.rotation.x=Math.PI;hull.scale.set(1,.7,2.2);for(let z of[-1,0,1])box(boat,'#9c8b64',0,.05,z,1.5,.10,.22);
 prop('wood1','Driftwood','wood',10,15,g=>{for(let j=0;j<3;j++){let m=cyl(g,'#998462',j*.24,.2,0,.17,.23,1.9);m.rotation.z=1.5;m.rotation.y=j*.5;}});
 prop('wood2','Driftwood','wood',14,18,g=>{for(let j=0;j<3;j++){let m=cyl(g,'#aa9672',j*.23,.2,0,.16,.21,1.8);m.rotation.z=1.4;m.rotation.y=j*.4;}});
 prop('ore1','Copper outcrop','ore',13,7,g=>{rock(g,'#677473',0,.5,0,1);for(let j=0;j<6;j++)rock(g,'#c59163',(rand()-.5)*1.3,.65+rand()*.4,(rand()-.5)*1.1,.22)});
 prop('ore2','Copper outcrop','ore',16,3,g=>{rock(g,'#727d75',0,.5,0,1);for(let j=0;j<6;j++)rock(g,'#bb875a',(rand()-.5)*1.3,.65+rand()*.4,(rand()-.5)*1.1,.22)});
 prop('forge','Old forge','forge',-9,5,g=>{box(g,'#5a6862',0,.6,0,1.9,1.2,1.6);box(g,'#262f2d',0,.7,.82,1.2,.6,.06);mesh(g,new T.BoxGeometry(.85,.24,.1),'#ffa44d',0,.5,.9,2);box(g,'#59635e',-.6,1.8,-.4,.6,2.1,.6);box(g,'#858c7b',1.65,.9,.2,1.2,.22,.5);box(g,'#424f4c',1.65,.55,.2,.55,.7,.4);cyl(g,'#61634d',1.65,.14,.2,.5,.6,.3);});
 prop('fire','Keeper’s fire','fire',-3,15,g=>{for(let i=0;i<9;i++){let a=i/9*6.28;rock(g,'#798274',Math.cos(a)*.7,.16,Math.sin(a)*.7,.25)}for(let i=0;i<3;i++){let m=cyl(g,'#4f4230',0,.14,0,.13,.13,1.3);m.rotation.z=1.57;m.rotation.y=i*2.1}});
 const flame=new T.Group();flame.position.set(-3,ground(-3,15)+.3,15);for(let i=0;i<5;i++){const f=mesh(flame,new T.ConeGeometry(.22,.9,5),'#ffc374',(rand()-.5)*.45,.3,(rand()-.5)*.45,2);animated.push({type:'flame',mesh:f,seed:i})}scene.add(flame);let firelight=new T.PointLight('#ff9144',15,9,2);firelight.position.copy(flame.position).y+=1;scene.add(firelight);
 prop('fish','Silverfin shoal','fish',8,23,g=>{});
 prop('dummy','Training effigy','dummy',-4,0,g=>{cyl(g,'#66593d',0,1,0,.11,.14,2.0);box(g,'#7b6c45',0,1.5,0,1.4,.14,.15);let torso=mesh(g,new T.SphereGeometry(.42,8,6),'#b2a479',0,1.35,0);torso.scale.set(1,1.3,.6);mesh(g,new T.SphereGeometry(.26,8,6),'#cbb78b',0,2.05,0);box(g,'#756944',0,1.4,.28,.7,.07,.05);});
 prop('well','Rune well','well',4,1,g=>{cyl(g,'#536c69',0,.25,0,1.5,1.6,.5,12);for(let i=0;i<8;i++){let a=i/8*6.28;box(g,'#9baf9e',Math.cos(a)*1.25,.62,Math.sin(a)*1.25,.38,.45,.38)}mesh(g,new T.CylinderGeometry(1.15,1.15,.04,32),'#6be6da',0,.5,0,1.4);const shard=mesh(g,new T.OctahedronGeometry(.48),'#adfff1',0,1.7,0,1);animated.push({type:'crystal',mesh:shard,seed:0})});
 // Ruined garden arcade, broken walls, flagstones and gate columns.
 for(let side of[-1,1]){for(let z of[-6,-13,-20]){let x=side*6,y=ground(x,z);cyl(staticRoot,'#6c7c70',x,y+.2,z,.65,.75,.4);cyl(staticRoot,'#98a58c',x,y+1.6,z,.38,.47,2.6,10);cyl(staticRoot,'#a3ad91',x,y+2.9,z,.6,.55,.28);if(z===-6){box(staticRoot,'#86977e',x,y+3.1,z,1.1,.3,1.1);}}
 for(let i=0;i<18;i++){let x=side*(5.6+rand()*.7),z=-7-i*.85;box(staticRoot,['#6d806e','#8d9a80'][i%2],x,ground(x,z)+.4,z,.8,.4+rand()*.8,.7)}}
 for(let side of[-1,1]){const curve=new T.CatmullRomCurve3(Array.from({length:12},(_,i)=>{let a=i/11*Math.PI/2;return new T.Vector3(side*(6-3*Math.sin(a)),ground(0,-6)+3+2.5*Math.cos(a),-6)}));mesh(staticRoot,new T.TubeGeometry(curve,14,.28,6,false),'#91a189');}
 const arenaY=ground(0,-21);cyl(staticRoot,'#697b70',0,arenaY-.04,-21,5,5.3,.16,48);for(let i=0;i<18;i++){let a=i/18*6.28;box(staticRoot,'#91a48c',Math.sin(a)*4.6,arenaY+.05,-21+Math.cos(a)*4.6,.6,.08,.6)}
 prop('beacon','The dark beacon','beacon',0,-27,g=>{cyl(g,'#68796f',0,.4,0,2,2.3,.8,10);cyl(g,'#8d9c85',0,1.6,0,1.25,1.65,2.4,10);cyl(g,'#b2b79a',0,2.95,0,1.65,1.3,.3,10);for(let i=0;i<6;i++){let a=i/6*6.28;cyl(g,'#687d70',Math.sin(a)*1.3,4.1,Math.cos(a)*1.3,.13,.18,2.1,6)}cyl(g,'#566d65',0,5.4,0,0,1.8,.9,6);cyl(g,'#c7b782',0,5.98,0,0,.17,.45,6)});
 const beaconLight=mesh(scene,new T.SphereGeometry(.8,12,10),'#ffdb86',0,ground(0,-27)+3.9,-27,4);beaconLight.visible=false;
 const beam=mesh(scene,new T.CylinderGeometry(.35,1,55,24,1,true),'#ffdfa3',0,28,-27,2);beam.material=new T.MeshBasicMaterial({color:'#ffe3a4',transparent:true,opacity:.19,depthWrite:false,side:T.DoubleSide});beam.visible=false;
 // Distant silhouettes give the playable island a place in a larger archipelago.
 for(let i=0;i<14;i++){let x=(rand()-.5)*190,z=-70-rand()*70;let m=rock(staticRoot,'#41616a',x,-6,z,10+rand()*15);m.scale.y=.45;}
 scene.remove(staticRoot);scene.add(mergeStatic(staticRoot));
 const edda=makeHuman('#839f85','#aa9270');edda.position.set(-4,ground(-4,11),11);edda.rotation.y=.7;scene.add(edda);objects.push({id:'edda',name:'Edda',kind:'edda',x:-4,z:11,y:ground(-4,11),group:edda,radius:1});
 const player=makeHuman('#436f78','#d8c299');scene.add(player);
 const marker=mesh(scene,new T.RingGeometry(.28,.37,32),'#f4dda2');marker.material=new T.MeshBasicMaterial({color:'#f0d99e',transparent:true,opacity:.8,side:T.DoubleSide});marker.rotation.x=-Math.PI/2;marker.visible=false;
 const dustGeo=new T.BufferGeometry(),pts=[];for(let i=0;i<150;i++)pts.push((rand()-.5)*45,1+rand()*6,(rand()-.5)*58);dustGeo.setAttribute('position',new T.Float32BufferAttribute(pts,3));const dust=new T.Points(dustGeo,new T.PointsMaterial({color:'#e9d8a2',size:.05,transparent:true,opacity:.65}));scene.add(dust);
 return{scene,player,objects,colliders,sun,sky,marker,beaconLight,beam,waterUniform,animated,dust,update(t){waterUniform.value=t;for(const a of animated){if(a.type==='crystal'){a.mesh.rotation.y=t*.7;a.mesh.position.y=1.7+Math.sin(t*2)*.15}else{a.mesh.scale.setScalar(.85+Math.sin(t*8+a.seed)*.18);a.mesh.rotation.y=t+a.seed}}dust.position.y=Math.sin(t*.3)*.3;beam.rotation.y=t*.1}};
}
export function makeHuman(cloak='#436f78',trim='#d8c299'){
 const g=new T.Group();const body=new T.Group();g.add(body);g.userData.body=body;
 cyl(body,'#343d37',0,.88,0,.27,.3,.43,8);box(body,'#806b48',0,.97,0,.59,.10,.37);
 let chest=mesh(body,new T.SphereGeometry(.38,10,8),cloak,0,1.27,0);chest.scale.set(1,1.2,.66);
 const cape=mesh(body,new T.ConeGeometry(.46,1.1,6,1,true),cloak,0,.97,-.18);cape.rotation.x=-.14;cape.scale.z=.5;
 cyl(body,trim,0,1.8,0,.22,.19,.34,8);let hood=mesh(body,new T.SphereGeometry(.255,10,8),'#554b3c',0,1.97,-.025);hood.scale.y=.5;
 box(body,'#393c34',0,1.81,.20,.25,.045,.035);cyl(body,trim,0,1.58,0,.30,.24,.12,8);
 const legs=[];for(let side of[-1,1]){const leg=new T.Group();leg.position.set(side*.15,.8,0);body.add(leg);box(leg,'#4c5145',0,-.2,0,.2,.44,.21);box(leg,'#443c30',0,-.58,.06,.22,.34,.32);legs.push(leg);let arm=box(body,cloak,side*.4,1.21,0,.21,.55,.24);arm.rotation.z=side*.15;mesh(body,new T.SphereGeometry(.12,6,4),trim,side*.46,.96,.03);}
 const hand=new T.Group();hand.position.set(.48,1,.05);body.add(hand);box(hand,'#443c2f',0,0,0,.09,.27,.09);box(hand,'#c4ad6e',0,.13,0,.36,.07,.12);const blade=box(hand,'#d0ded3',0,.64,0,.12,.96,.065);blade.rotation.z=-.05;const tip=mesh(hand,new T.ConeGeometry(.085,.25,4),'#d0ded3',0,1.23,0);tip.rotation.y=.78;
 const braid=new T.Group();body.add(braid);for(let i=0;i<6;i++)mesh(braid,new T.SphereGeometry(.105-i*.008,7,5),'#554b3c',.16,1.92-i*.11,-.19-i*.025);
 for(const side of[-1,1]){const lock=mesh(braid,new T.SphereGeometry(.14,7,5),'#554b3c',side*.21,1.76,-.02);lock.scale.y=2;}const hairSides=[];for(const side of [-1,1])hairSides.push(mesh(braid,new T.SphereGeometry(.12,7,5),'#554b3c',side*.2,1.83,-.03));
 const coat=new T.Group();body.add(coat);cyl(coat,'#d4dfd9',0,.98,0,.30,.4,.7,8);box(coat,'#d4dfd9',0,1.32,.04,.68,.57,.35);for(const side of[-1,1]){const sleeve=box(coat,'#cbd9d5',side*.4,1.21,0,.22,.54,.25);sleeve.rotation.z=side*.15;}box(coat,'#4c8e98',.19,1.4,.225,.14,.19,.025);box(coat,'#354d54',0,1.22,.23,.035,.7,.02);
 g.userData.appearance=(gender,lab=false)=>{const female=gender==='female';braid.visible=female;chest.scale.x=female?.87:1;hood.scale.y=female?.85:.5;cape.visible=!lab;coat.visible=lab;g.userData.gender=gender;};g.userData.appearance('male');
 g.userData.legs=legs;g.userData.hand=hand;g.userData.blade=blade;g.userData.tip=tip;return g;
}
export function makeEnemy(boss=false){const g=new T.Group();cyl(g,boss?'#303c43':'#35464d',0,.85,0,.38,.6,1.5,7);const torso=mesh(g,new T.IcosahedronGeometry(.5,1),boss?'#59625c':'#496263',0,1.4,0);torso.scale.set(1.3,1,.7);mesh(g,new T.IcosahedronGeometry(.27,1),'#9da990',0,1.94,0);for(let x of[-.10,.10])mesh(g,new T.BoxGeometry(.07,.06,.1),'#91f1dc',x,1.97,.22,2);for(let x of[-.58,.58]){let arm=box(g,'#3f514e',x,1.1,0,.21,.85,.27);arm.rotation.z=-x*.6;rock(g,'#84917b',x,1.68,0,.25)}if(boss){g.scale.setScalar(1.65);for(let x of[-.24,0,.24])cyl(g,'#b3a372',x,2.28,0,0,.10,.42,5);box(g,'#8b9283',.82,.94,.1,.13,1.5,.17)}return g}

export {mesh,mat,box,cyl,rock,mergeStatic};
