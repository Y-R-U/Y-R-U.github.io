import * as THREE from 'three';

// Four species, deliberately different in silhouette as well as hue:
//   0 broadleaf  — two stacked lobes, taller than wide, yellow-green
//   1 conifer    — narrow stacked cones, dark blue-green (the value anchor)
//   2 scrub/bush — one squat rusty lobe, low enough to see over
//   3 dead       — a bare leaning trunk with two branch stubs
// Canopies sit clear of the top of the trunk so the 16-degree tilt has something to show.
const GEO=[()=>new THREE.DodecahedronGeometry(1,0),()=>new THREE.ConeGeometry(1,1,6),
           ()=>new THREE.IcosahedronGeometry(1,0),()=>new THREE.BoxGeometry(1,1,1)];

export function createForest(scene,trees){
 const dummy=new THREE.Object3D(),colour=new THREE.Color(),meshes=[],groups=[];
 for(let s=0;s<4;s++){
  const group=trees.filter(t=>(t.species||0)===s);
  const mat=new THREE.MeshStandardMaterial({roughness:s===1?.95:.85,flatShading:true});
  const mesh=new THREE.InstancedMesh(GEO[s](),mat,Math.max(1,group.length*2));
  mesh.castShadow=mesh.receiveShadow=true;mesh.count=group.length*2;
  scene.add(mesh);meshes.push(mesh);groups.push(group);
 }
 const trunkMat=new THREE.MeshStandardMaterial({color:0x5e4a39,roughness:1,flatShading:true});
 const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.11,.24,1,5),trunkMat,trees.length);
 trunks.castShadow=trunks.receiveShadow=true;scene.add(trunks);

 function sync(time=0){
  for(let i=0;i<trees.length;i++){
   const t=trees[i],h=t.dead?.36:t.height,lean=(t.shade-.5)*.18;
   dummy.position.set(t.x,h*.44,t.z);
   dummy.scale.set(t.species===1?.8:1,h*.9,t.species===1?.8:1);
   dummy.rotation.set(0,t.shade*5,lean);
   dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
  }
  for(let s=0;s<4;s++){
   const mesh=meshes[s],group=groups[s];
   for(let i=0;i<group.length;i++){
    const t=group[i];
    const interior=Math.min(1,Math.max(0,(Math.abs(t.x)-9)/7));
    for(let j=0;j<2;j++){
     const rad=t.radius*(j?.74:1);
     if(s===0){ // broadleaf: lower wide lobe, upper smaller lobe pushed up and sunward
      dummy.position.set(t.x+(j?-.42:0),t.height*(j?1.12:.86),t.z+(j?-.2:0));
      dummy.scale.set(rad,rad*1.28,rad);
     }else if(s===1){ // conifer: two cones, the upper one narrow
      dummy.position.set(t.x,t.height*(j?.88:.58),t.z);
      dummy.scale.set(rad*(j?.62:.95),t.height*(j?.5:.62),rad*(j?.62:.95));
     }else if(s===2){ // scrub: one squat lobe plus a small shoulder
      dummy.position.set(t.x+(j?rad*.6:0),t.height*(j?.62:.8),t.z+(j?rad*.35:0));
      dummy.scale.set(rad*(j?.6:1.05),rad*(j?.42:.72),rad*(j?.6:1.05));
     }else{ // dead: branch stubs off the bare trunk
      dummy.position.set(t.x+(j?.5:-.45),t.height*(j?.86:.66),t.z+(j?-.2:.2));
      dummy.scale.set(.11,.1,1.3);
     }
     dummy.rotation.set(s===3?(j?.5:-.35):0,t.shade*6+(j?1.1:0),s===1?0:(s===3?(j?.8:-.8):t.shade*.3-.15));
     if(t.dead){
      const fall=Math.min(1,Math.max(0,time-(t.fallTime??-10)));
      dummy.position.x+=fall*t.height*.7;dummy.position.y*=1-fall;
      dummy.scale.multiplyScalar(1-fall);dummy.rotation.z=fall*1.5;
     }
     dummy.updateMatrix();mesh.setMatrixAt(i*2+j,dummy.matrix);
     if(t.burn>0)colour.setHex(0x8a3a15);
     else if(s===1)colour.setHSL(.435+t.shade*.075,.40,.105+t.shade*.065);
     else if(s===2)colour.setHSL(.055+t.shade*.06,.54,.23+t.shade*.11);
     else if(s===3)colour.setHSL(.09,.22,.19+t.shade*.06);
     else colour.setHSL(.155+t.shade*.145,.50,.21+t.shade*.13);
     // Underside darker, crown brighter: cheap self-shading that reads at this camera angle.
     colour.multiplyScalar((1-interior*.42)*(j?1.18:.82));
     mesh.setColorAt(i*2+j,colour);
    }
   }
   mesh.instanceMatrix.needsUpdate=true;
   if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }
  trunks.instanceMatrix.needsUpdate=true;
 }
 let revision=-1,lastSync=-1;sync();
 return {sync,count:trees.length,update(w){
  if(revision!==w.forestRevision||(w.time-lastSync>.08&&trees.some(t=>t.dead&&w.time-t.fallTime<1.2))){
   revision=w.forestRevision;lastSync=w.time;sync(w.time);}
 }};
}
