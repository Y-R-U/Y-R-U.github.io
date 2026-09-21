import * as THREE from 'three';
export function createVFX(scene){
 const active=[],stains=[],dummy=new THREE.Object3D();let last=0;
 const ball=new THREE.IcosahedronGeometry(1,0),blood=new THREE.MeshBasicMaterial({color:0x9f1744}),flash=new THREE.MeshBasicMaterial({color:new THREE.Color(5,2.6,.5)}),smoke=new THREE.MeshBasicMaterial({color:0xc6ba8d,transparent:true,opacity:.45}),brass=new THREE.MeshStandardMaterial({color:0xe2bb55,metalness:.5});
 function particle(x,y,z,vx,vy,vz,scale,life,mat,gravity=9){if(active.length>160)return;const mesh=new THREE.Mesh(ball,mat);mesh.position.set(x,y,z);mesh.scale.setScalar(scale);scene.add(mesh);active.push({mesh,vx,vy,vz,life,max:life,gravity});}
 function stain(x,z,r){const mesh=new THREE.Mesh(new THREE.CircleGeometry(r,11),blood);mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.025+stains.length*.00002,z);mesh.scale.y=.65;scene.add(mesh);stains.push(mesh);if(stains.length>256)scene.remove(stains.shift());}
 return {update(w,dt){for(const e of w.events){if(e.id<=last)continue;last=e.id;if(e.type==='death'){stain(e.x,e.z,1);for(let i=0;i<12;i++){const a=i*2.4;particle(e.x,1,e.z,Math.cos(a)*3,2+i%4,Math.sin(a)*3,.1+i%3*.04,.8,blood);if(i<6)stain(e.x+Math.cos(a)*(.4+i*.16),e.z+Math.sin(a)*(.4+i*.16),.16+i*.025);}}
 if(w.time-e.time>.4)continue;
 if(e.type==='explosion'){for(let i=0;i<22;i++){const a=i*2.4;particle(e.x,.4,e.z,Math.cos(a)*5,3+i%6,Math.sin(a)*5,.4+i%3*.2,.4+i%4*.14,i%3?flash:smoke,6);}}
 if(e.type==='shot'){const dx=e.tx-e.x,dz=e.tz-e.z,d=Math.hypot(dx,dz),beam=new THREE.Mesh(new THREE.BoxGeometry(.055,.055,d),flash);beam.position.set((e.x+e.tx)/2,1.2,(e.z+e.tz)/2);beam.rotation.y=Math.atan2(dx,dz);scene.add(beam);active.push({mesh:beam,life:.07,max:.07,vx:0,vy:0,vz:0,gravity:0});particle(e.x+dx/d*.9,1.2,e.z+dz/d*.9,0,0,0,.25,.06,flash,0);particle(e.x,1.1,e.z,1.8,2,1,.06,.5,brass);}
 if(e.type==='impact')particle(e.x,.2,e.z,0,.8,0,.18,.3,smoke,0);
 }
 for(let i=active.length-1;i>=0;i--){const p=active[i];p.life-=dt;if(p.life<=0){scene.remove(p.mesh);if(p.mesh.geometry!==ball)p.mesh.geometry.dispose();active.splice(i,1);continue;}p.vy-=p.gravity*dt;p.mesh.position.x+=p.vx*dt;p.mesh.position.y=Math.max(.04,p.mesh.position.y+p.vy*dt);p.mesh.position.z+=p.vz*dt;}
 },counts(){return {particles:active.length,stains:stains.length};}};
}
