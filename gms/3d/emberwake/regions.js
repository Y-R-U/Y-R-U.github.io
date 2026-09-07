import * as T from 'three';
import {mesh,box,cyl,rock,mergeStatic,makeHuman,ground} from './world.js';

function base(lab=false){
 const scene=new T.Scene();scene.background=new T.Color(lab?'#0a1723':'#577881');scene.fog=new T.FogExp2(lab?'#0a1723':'#77928e',lab?.018:.007);
 scene.add(new T.HemisphereLight(lab?'#b5e9ff':'#b9dedb',lab?'#283044':'#47594b',1.8));
 const sun=new T.DirectionalLight(lab?'#bde9ff':'#ffe2bd',2.3);sun.position.set(-22,35,18);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-40,right:40,top:45,bottom:-45,near:1,far:110});sun.shadow.normalBias=.04;scene.add(sun);
 const player=makeHuman();scene.add(player);const root=new T.Group();scene.add(root);const objects=[],colliders=[],animated=[];
 const height=lab?()=>0:ground;
 function prop(id,name,kind,x,z,build=()=>{}){const group=new T.Group();group.position.set(x,height(x,z),z);root.add(group);build(group);const o={id,name,kind,x,z,y:height(x,z),group};objects.push(o);return o;}
 function npc(id,name,x,z,color){const human=makeHuman(color);human.userData.hand.visible=false;human.position.set(x,height(x,z),z);scene.add(human);objects.push({id,name,kind:id,x,z,y:height(x,z),group:human});return human;}
 const marker=mesh(scene,new T.RingGeometry(.28,.37,32),'#f4dda2');marker.material=new T.MeshBasicMaterial({color:'#f0d99e',transparent:true,opacity:.8,side:T.DoubleSide});marker.rotation.x=-Math.PI/2;marker.visible=false;
 const beam=new T.Group(),beaconLight=new T.Group();scene.add(beam,beaconLight);
 const world={scene,player,objects,colliders,marker,beam,beaconLight,animated,root,prop,npc,height,lab,update(t){for(const a of animated){a.rotation.y=t*.5;}},finish(){scene.remove(root);scene.add(mergeStatic(root));}};
 return world;
}
function ring(p,x,y,z,r,color){const m=mesh(p,new T.TorusGeometry(r,.09,7,48),color,x,y,z,.45);return m;}
export function createLab(){
 const w=base(true),{root,scene,prop,npc,colliders}=w;const portraitLight=new T.DirectionalLight('#ffecd3',2);portraitLight.position.set(5,7,12);portraitLight.visible=false;scene.add(portraitLight);w.portraitLight=portraitLight;
 box(root,'#233d4b',0,-.3,0,25,.6,23);
 for(let x=-12;x<13;x+=2)for(let z=-10;z<11;z+=2){box(root,(x+z)%4?'#405662':'#374d5a',x,-.015,z,1.96,.06,1.96);}
 // Cutaway walls leave the approach and the hiding route visible.
 box(root,'#445d6a',0,2.2,-11,25,4.4,.4);box(root,'#334c5b',-12.3,1.7,0,.4,3.4,22);
 for(let x=-10;x<=10;x+=4){box(root,'#243744',x,2.2,-10.7,3.4,2.6,.2);mesh(root,new T.BoxGeometry(2.9,.06,.1),'#74d7f2',x,3.25,-10.5,2);}
 for(let x of [-11,11])mesh(root,new T.BoxGeometry(.06,.04,20),'#67d4e5',x,.06,0,1.5);
 const gate=new T.Group();gate.position.set(2,0,-5);root.add(gate);cyl(gate,'#1c333e',0,.13,0,2.7,3,.26,48);cyl(gate,'#637b85',0,.31,0,2.4,2.5,.18,48);
 ring(gate,0,2.7,0,2.35,'#a0d9e0');ring(gate,0,2.7,.17,2.08,'#42cbd9');
 const portal=mesh(scene,new T.CircleGeometry(1.95,48),'#5ce4dd',2,2.7,-5,1.4);portal.material=new T.MeshBasicMaterial({color:'#73eae1',transparent:true,opacity:.22,side:T.DoubleSide,depthWrite:false});w.portal=portal;
 for(let x of [-1.2,5.2]){box(root,'#334b5d',x,.8,-3,.75,1.6,.85);let screen=mesh(root,new T.BoxGeometry(.64,.44,.06),'#83e7d9',x,1.65,-2.64,1);screen.rotation.x=-.3;}
 for(let x of [-8,-4]){box(root,'#93a6a7',x,.95,-7,2.8,.2,1.3);for(const side of [-1,1])box(root,'#516777',x+side, .45,-7,.12,1,.8);box(root,'#183949',x,1.55,-7.3,1.2,.8,.12);mesh(root,new T.BoxGeometry(1,.6,.04),'#7dbfce',x,1.55,-7.21,.7);colliders.push({x,z:-7,r:1.3});}
 prop('hide','Storage cabinets','hide',-8,4.5,g=>{for(let x of [-1,0,1]){box(g,'#506670',x,1.35,-2.5,.96,2.7,.85);box(g,'#a9b8b4',x+.25,1.4,-2.04,.06,.4,.04);}box(g,'#aab49c',.8,.35,.9,.65,.7,.65);});colliders.push({x:-8,z:2,r:1.8});
 prop('device','Unstable rift','device',6,5);
 const vale=npc('vale','Dr Vale',0,-.5,'#e0e2d8');vale.userData.appearance('male',true);vale.rotation.y=.6;
 const tech=npc('sato','Dr Sato',-5,-5,'#d5e3df');tech.userData.appearance('female',true);tech.rotation.y=-.4;
 box(root,'#263b49',10,1.7,6,.6,3.4,4);box(root,'#73999f',9.66,1.7,6,.05,2.7,2.8);
 const alarm=new T.PointLight('#ff534a',0,25,2);alarm.position.set(9,3,6);scene.add(alarm);w.alarm=alarm;
 // The alarm sparks gather into the actual escape doorway, at the interaction target.
 const rift=new T.Group();rift.position.set(6,1.6,5);rift.rotation.y=.62;scene.add(rift);w.escapeRift=rift;
 const rim=mesh(rift,new T.TorusGeometry(1.18,.045,6,64),'#ffc985',0,0,0,2);rim.scale.y=1.25;
 const riftTime={value:0};
 const veil=new T.Mesh(new T.CircleGeometry(1.14,56),new T.ShaderMaterial({transparent:true,side:T.DoubleSide,depthWrite:false,uniforms:{time:riftTime},vertexShader:`varying vec2 v;void main(){v=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec2 v;uniform float time;void main(){float r=length(v),a=atan(v.y,v.x);float swirl=sin(a*5.-r*15.+time*3.)*.5+.5;float edge=pow(r,5.);vec3 c=mix(vec3(.05,.27,.3),vec3(1.,.57,.20),edge);c+=swirl*.12*(1.-r);gl_FragColor=vec4(c,(.43+edge*.5)*(1.-smoothstep(.96,1.,r)));}`}));veil.scale.y=1.25;rift.add(veil);
 const riftLight=new T.PointLight('#ffc079',15,9,2);riftLight.position.set(6,1.8,5);scene.add(riftLight);
 const sparks=new T.Group();scene.add(sparks);for(let i=0;i<42;i++)mesh(sparks,new T.IcosahedronGeometry(.025+i%3*.012),'#ffc784',0,0,0,2);
 w.update=t=>{portal.material.opacity=.035;riftTime.value=t;const attack=w.alert,ready=!!w.escapeReady;alarm.intensity=attack?18+Math.sin(t*8)*9:0;rift.visible=ready;riftLight.intensity=ready?12+Math.sin(t*4)*3:0;sparks.visible=!!attack;
 sparks.children.forEach((m,i)=>{const a=t*(.7+i%3*.12)+i*2.399,r=ready?1.2+(i%5)*.055:.5+(i%7)*.16;const xx=Math.cos(a)*r,yy=Math.sin(a)*r*1.25;m.position.set(6+xx*Math.cos(.62),1.6+yy,5-xx*Math.sin(.62));m.scale.setScalar(.65+Math.sin(t*6+i)*.35);});rim.rotation.z=Math.sin(t)*.025;};
 w.finish();return w;
}
export function createMainland(){
 const w=base(),{root,scene,prop,npc,colliders,animated}=w;
 const geo=new T.PlaneGeometry(66,84,66,84);geo.rotateX(-Math.PI/2);const pos=geo.attributes.position;
 for(let i=0;i<pos.count;i++){let x=pos.getX(i),z=pos.getZ(i);pos.setY(i,ground(x,z)-(Math.max(0,Math.abs(x)-27)+Math.max(0,Math.abs(z)-37))*.5);}geo.computeVertexNormals();const land=mesh(root,geo,'#758064');land.receiveShadow=true;
 land.material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 meadowPos;').replace('#include <begin_vertex>','#include <begin_vertex>\nmeadowPos=position;');shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
 varying vec3 meadowPos;
 float meadowHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 float meadowNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(meadowHash(i),meadowHash(i+vec2(1,0)),f.x),mix(meadowHash(i+vec2(0,1)),meadowHash(i+1.),f.x),f.y);}
 `).replace('#include <color_fragment>',`#include <color_fragment>
 float n=meadowNoise(meadowPos.xz*.65);diffuseColor.rgb*=.72+meadowNoise(meadowPos.xz*17.)*.15+n*.29;diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.79,1.06,.95),meadowNoise(meadowPos.xz*.17)*.5);
 `);};
 const sea=mesh(scene,new T.PlaneGeometry(400,400),'#376673',0,-2,0);sea.rotation.x=-Math.PI/2;
 let seed=482;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 function path(ax,az,bx,bz,width=2.5){const n=Math.ceil(Math.hypot(bx-ax,bz-az)*2);for(let i=0;i<=n;i++){const t=i/n,x=ax+(bx-ax)*t,z=az+(bz-az)*t;for(let j=0;j<4;j++){let xx=x+(rand()-.5)*width,zz=z+(rand()-.5)*width;let m=cyl(root,i%2?'#a2a28c':'#8f9981',xx,ground(xx,zz)+.025,zz,.26+rand()*.18,.35,.065,6);m.rotation.y=rand()*6;}}}
 path(0,29,0,-30,3.5);path(-16,13,16,13);path(0,3,13,-9);path(-16,13,-13,-12);path(0,-12,-13,-12);path(0,-12,14,-12);
 function house(x,z,color,rot=0){const g=new T.Group();g.position.set(x,ground(x,z),z);g.rotation.y=rot;root.add(g);box(g,'#777c6b',0,.2,0,4.8,.4,4);box(g,'#cec3a0',0,1.7,0,4.4,3,3.6);for(const xx of[-2.1,0,2.1])box(g,'#685640',xx,1.65,1.84,.17,2.9,.14);box(g,'#554635',.55,1.1,1.86,.9,1.85,.13);for(const xx of[-1.15,1.5]){box(g,'#726548',xx,1.8,1.88,.75,.9,.14);mesh(g,new T.BoxGeometry(.56,.65,.05),'#ffdc90',xx,1.8,1.97,1);}
 for(let side of[-1,1]){const m=box(g,color,side*1.2,3.5,0,2.8,.22,4.3);m.rotation.z=-side*.49;for(let i=0;i<5;i++)for(let j=0;j<9;j++){const tile=box(g,i%2?color:'#70807a',side*(.25+i*.51),4.12-i*.27,-1.85+j*.46,.6,.11,.48);tile.rotation.z=-side*.49;}}box(g,'#8c8d78',-1.2,3.8,-.7,.55,2.1,.55);colliders.push({x,z,r:2.9});}
 house(-8,20,'#566f70');house(8,21,'#947b63');house(-16,6,'#646f75',.15);house(16,5,'#6b7f72',-.2);house(15,-17,'#667984',.05);
 // Market awnings, a shared hearth and supply crates.
 for(const x of[-7,7]){const z=9;for(let side of[-1,1])cyl(root,'#736247',x+side*1.4,ground(x,z)+1.2,z,.065,.08,2.4);box(root,'#8b7853',x,ground(x,z)+.9,z,3,.18,1.3);for(let j=0;j<6;j++){const awn=box(root,j%2?'#d5c38c':'#638d8a',x-1.25+j*.5,ground(x,z)+2.5,z,.51,.07,2.4);awn.rotation.x=.15;}}
 prop('mara','Mara · Wardkeeper','mara',-3,16);const mara=npc('maraModel','',-3,16,'#a38a62');w.objects.pop();mara.rotation.y=.7;
 prop('neri','Neri · Archivist','neri',12,-8);const neri=npc('neriModel','',12,-8,'#787dab');w.objects.pop();neri.userData.appearance('female');w.neri=neri;
 prop('fire','Town hearth','fire',4,15,g=>{cyl(g,'#737d6c',0,.15,0,.8,1,.3,10);for(let i=0;i<4;i++)mesh(g,new T.ConeGeometry(.2,.8,5),'#ffd291',(i%2)*.3-.15,.6,Math.floor(i/2)*.3-.15,2);});
 const fl=new T.PointLight('#ffd293',12,9);fl.position.set(4,2,15);scene.add(fl);
 prop('wood1','Timber pile','wood',-12,15,g=>{for(let i=0;i<5;i++){const log=cyl(g,'#a48b61',(i%3)*.32,.2+Math.floor(i/3)*.3,0,.18,.18,2,8);log.rotation.x=Math.PI/2;}});
 prop('ore1','Copper seam','ore',-17,-1,g=>{rock(g,'#717e7b',0,.5,0,1.1);for(let i=0;i<7;i++)rock(g,'#cb9b70',(rand()-.5)*1.5,.6+rand()*.3,(rand()-.5),.23);});
 prop('fish','Canal silverfin','fish',21,16,g=>{box(g,'#7b7054',0,.05,0,2,.14,3);});
 const canal=mesh(root,new T.PlaneGeometry(5,17),'#53908f',23,ground(23,17)+.01,17);canal.rotation.x=-Math.PI/2;
 w.relayLights=[];
 for(const [i,x,z] of [[1,-12,10],[2,10,10],[3,-12,-10]]){prop('relay'+i,'Ward lamp '+i,'relay',x,z,g=>{cyl(g,'#7d8b7d',0,.2,0,.8,1,.4);cyl(g,'#adb097',0,1.3,0,.27,.4,2.2);ring(g,0,2.9,0,.62,'#a39f76');});const shard=mesh(scene,new T.OctahedronGeometry(.4),'#87ffe0',x,ground(x,z)+2.9,z,2);animated.push(shard);w.relayLights.push(shard);}
 // Old boundary wall and the breached archive garden.
 for(const side of[-1,1])for(let i=0;i<9;i++){const x=side*(4+i*2.4),z=-3;box(root,'#8b9680',x,ground(x,z)+.7,z,2.25,1.4,.65);if(i%3===0)cyl(root,'#9eaa92',x,ground(x,z)+1.1,z,.47,.6,2.2,6);}
 for(const x of[-4,4]){cyl(root,'#a7b59e',x,ground(x,-3)+1.8,-3,.45,.6,3.6,8);mesh(root,new T.OctahedronGeometry(.28),'#94e5c7',x,ground(x,-3)+3.9,-3,1);}
 // Observatory rotunda; the open front frames a brass astrolabe.
 cyl(root,'#899a90',0,ground(0,-27)+.1,-27,6,6.5,.25,48);
 for(let i=0;i<9;i++){const a=Math.PI*.1+i/8*Math.PI*1.8,x=Math.sin(a)*5,z=-27-Math.cos(a)*5;cyl(root,'#aab7a2',x,ground(x,z)+2,z,.36,.53,4,10);cyl(root,'#bdbea4',x,ground(x,z)+4.1,z,.7,.65,.25,10);}
 const astrolabe=new T.Group();astrolabe.position.set(0,ground(0,-28)+3,-28);scene.add(astrolabe);for(let i=0;i<3;i++){const m=ring(astrolabe,0,0,0,1.4+i*.23,'#c6b57c');m.rotation.y=i*1.047;m.rotation.x=i*.5;}mesh(astrolabe,new T.IcosahedronGeometry(.48,1),'#a8e9dc',0,0,0,2);animated.push(astrolabe);
 prop('ledger','Observatory ledger','ledger',0,-29,g=>{box(g,'#7d8979',0,.65,0,1.4,1.3,.85);const book=box(g,'#d4c899',0,1.38,.04,1,.14,.65);book.rotation.x=.2;});
 prop('return','Island crossing','return',0,27,g=>{cyl(g,'#82998b',0,.1,0,2,2.2,.2,32);ring(g,0,2,0,1.65,'#8bc8c0');mesh(g,new T.CircleGeometry(1.5,40),'#81dcca',0,2,.01,1);});
 prop('road','The northern road · sealed','road',0,-35,g=>{for(let x of[-2,2])cyl(g,'#586f6b',x,1.6,0,.35,.4,3.2,6);box(g,'#6bb7b2',0,1.3,0,4,.06,.08);box(g,'#6bb7b2',0,2.2,0,4,.06,.08);});
 // Planted courtyards and the lived-in edges of town.
 for(const [x,z] of [[-20,18],[-20,9],[-21,-6],[-20,-17],[21,-4],[21,-16],[19,-25],[-18,-26],[-12,25],[13,28]]){
  const y=ground(x,z);cyl(root,'#655b43',x,y+1.6,z,.15,.25,3.2,7);for(let i=0;i<7;i++){const a=i*2.4,rr=i?.8:0;const crown=rock(root,['#3e6b58','#557c60','#6b8e69'][i%3],x+Math.cos(a)*rr,y+3+rand()*.8,z+Math.sin(a)*rr,1.3);crown.scale.y=.7;}colliders.push({x,z,r:.45});
 }
 for(const [x,z] of [[-10,22],[10,23],[-18,8],[18,7],[17,-15]]){
  for(let j=0;j<2;j++){cyl(root,'#8d7856',x+j*.7,ground(x,z)+.4,z,.32,.3,.8,10);for(const h of[.13,.66])cyl(root,'#4e635b',x+j*.7,ground(x,z)+h,z,.33,.33,.06,10);}
  box(root,'#78856b',x,ground(x,z)+.1,z+1.3,3,.2,.8);
  for(let i=0;i<18;i++){const xx=x+(rand()-.5)*2.8,zz=z+1.3+(rand()-.5)*.7;rock(root,i%3?'#81935d':'#d3b18a',xx,ground(xx,zz)+.3,zz,.17);}
 }
 for(const [x,z] of [[-3,23],[3,7],[-3,-2],[5,-15],[-4,-22]]){const y=ground(x,z);cyl(root,'#596c5f',x,y+1.5,z,.06,.09,3);box(root,'#566459',x,y+2.85,z,.4,.6,.4);mesh(root,new T.BoxGeometry(.28,.4,.28),'#ffd298',x,y+2.86,z,1.2);cyl(root,'#4b655e',x,y+3.3,z,0,.36,.32,4);}
 for(let i=0;i<360;i++){const x=(rand()-.5)*48,z=(rand()-.5)*65;if(Math.abs(x)<5||Math.abs(z-13)<3||Math.abs(z+3)<2)continue;for(let j=0;j<3;j++){const m=mesh(root,new T.SphereGeometry(.23,5,4),i%3?'#819765':'#a3aa76',x+(rand()-.5)*.5,ground(x,z)+.15,z+(rand()-.5)*.5);m.scale.set(1,.45,1);}}
 // Cypresses, flower banks and distant continental ridges.
 for(let i=0;i<115;i++){const x=(rand()-.5)*59,z=(rand()-.5)*75;if(Math.abs(x)<22&&z> -33)continue;const y=ground(x,z),s=.8+rand()*.7;cyl(root,'#5e6249',x,y+1.4*s,z,.13,.25,2.8*s);cyl(root,i%2?'#486955':'#57745a',x,y+2.7*s,z,.06,1.1*s,3.6*s,7);}
 for(let i=0;i<1800;i++){const x=(rand()-.5)*51,z=(rand()-.5)*68;if(Math.abs(x)<3||Math.abs(z-13)<2)continue;mesh(root,new T.ConeGeometry(.11,.4,3),i%5?'#92a074':'#d2b885',x,ground(x,z)+.18,z);}
 for(let i=0;i<20;i++){const x=-90+i*10,z=-65-rand()*40;const m=rock(root,'#67827c',x,-2,z,10+rand()*12);m.scale.y=1+rand();}
 w.finish();return w;
}
