import * as THREE from 'three';
export function createVFX(scene){
 const active=[],stains=[],dummy=new THREE.Object3D();let last=0;
 const ball=new THREE.IcosahedronGeometry(1,0),blood=new THREE.MeshBasicMaterial({color:0x9f1744}),ash=new THREE.MeshBasicMaterial({color:0x1d1a17}),soot=new THREE.MeshBasicMaterial({color:0x2b2723,transparent:true,opacity:.55}),spark=new THREE.MeshBasicMaterial({color:new THREE.Color(6,2.4,.2)}),flash=new THREE.MeshBasicMaterial({color:new THREE.Color(5,2.6,.5)}),smoke=new THREE.MeshBasicMaterial({color:0xc6ba8d,transparent:true,opacity:.45}),brass=new THREE.MeshStandardMaterial({color:0xe2bb55,metalness:.5});
 function particle(x,y,z,vx,vy,vz,scale,life,mat,gravity=9){if(active.length>160)return;const mesh=new THREE.Mesh(ball,mat);mesh.position.set(x,y,z);mesh.scale.setScalar(scale);scene.add(mesh);active.push({mesh,vx,vy,vz,life,max:life,gravity});}
 function stain(x,z,r,burnt=false){const mesh=new THREE.Mesh(new THREE.CircleGeometry(r,11),burnt?ash:blood);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.025+stains.length*.00002,z);mesh.scale.y=.65;scene.add(mesh);stains.push(mesh);if(stains.length>256)scene.remove(stains.shift());}
 return {update(w,dt){for(const e of w.events){if(e.id<=last)continue;last=e.id;if(e.type==='death'){const burnt=e.cause==='fire'||e.cause==='flame';stain(e.x,e.z,burnt?.8:1,burnt);for(let i=0;i<12;i++){const a=i*2.4;particle(e.x,1,e.z,Math.cos(a)*(burnt?1.6:3),2+i%4,Math.sin(a)*(burnt?1.6:3),.1+i%3*.04,burnt?1.5:.8,burnt?(i%3?soot:spark):blood,burnt?2.2:9);if(i<6)stain(e.x+Math.cos(a)*(.4+i*.16),e.z+Math.sin(a)*(.4+i*.16),.16+i*.025,burnt);}}
 if(e.type==='alight'&&w.time-e.time<.4){for(let i=0;i<9;i++){const a=i*2.7;particle(e.x,.9,e.z,Math.cos(a)*2.2,3.4+i%3,Math.sin(a)*2.2,.09+i%3*.03,.7,spark,4);}}
 if(w.time-e.time>.4)continue;
 if(e.type==='explosion'){for(let i=0;i<22;i++){const a=i*2.4;particle(e.x,.4,e.z,Math.cos(a)*5,3+i%6,Math.sin(a)*5,.4+i%3*.2,.4+i%4*.14,i%3?flash:smoke,6);}}
 if(e.type==='shot'){const dx=e.tx-e.x,dz=e.tz-e.z,d=Math.hypot(dx,dz),beam=new THREE.Mesh(new THREE.BoxGeometry(.055,.055,d),flash);beam.position.set((e.x+e.tx)/2,1.2,(e.z+e.tz)/2);beam.rotation.y=Math.atan2(dx,dz);scene.add(beam);active.push({mesh:beam,life:.07,max:.07,vx:0,vy:0,vz:0,gravity:0});particle(e.x+dx/d*.9,1.2,e.z+dz/d*.9,0,0,0,.25,.06,flash,0);particle(e.x,1.1,e.z,1.8,2,1,.06,.5,brass);}
 if(e.type==='flame'){for(let i=0;i<8;i++){const t=(i+1)/8,a=e.yaw+(((i*5)%7)/6-.5)*1.8*e.cone,sx=Math.sin(a),sz=Math.cos(a),lead=t*e.range*.42;
  particle(e.x+sx*(.5+lead),1+t*.25,e.z+sz*(.5+lead),sx*e.range*1.45,.5+t,sz*e.range*1.45,.17+t*.3,.22+t*.16,i%4?spark:soot,1.1);}}
 if(e.type==='hit'){const n=Math.min(7,2+Math.round(e.amount/14));for(let i=0;i<n;i++){const a=i*2.1+e.unit;particle(e.x,1.15,e.z,Math.cos(a)*1.9,1.7+i%3*.7,Math.sin(a)*1.9,.075+i%2*.03,.42,e.cause==='flame'?spark:blood);}if(e.amount>=18)stain(e.x,e.z,.2+Math.min(.3,e.amount/300));}
 if(e.type==='impact')particle(e.x,.2,e.z,0,.8,0,.18,.3,smoke,0);
 }
 for(let i=active.length-1;i>=0;i--){const p=active[i];p.life-=dt;if(p.life<=0){scene.remove(p.mesh);if(p.mesh.geometry!==ball)p.mesh.geometry.dispose();active.splice(i,1);continue;}p.vy-=p.gravity*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y=Math.max(.04,p.mesh.position.y+p.vy*dt);p.mesh.position.z+=p.vz*dt;}
 },counts(){return {particles:active.length,stains:stains.length};}};
}
