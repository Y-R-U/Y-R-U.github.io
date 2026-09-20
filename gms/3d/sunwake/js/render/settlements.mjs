import * as THREE from 'three';
import {islandField,mooringLayout} from '../core/island-shape.mjs';
import {SETTLEMENT_LIMITS,VISUAL_WIND} from '../core/visual-config.mjs';

const STYLES={
  'Lantern Key':{wall:'#eee0bf',roof:'#9e4638',trim:'#385c62',count:2},
  'Bell Garden':{wall:'#e4ce9d',roof:'#536f58',trim:'#a8c1a2',count:3},
  'Split Crown':{wall:'#adc3bd',roof:'#3a535b',trim:'#dfab62',count:2},
  'Cinder Steps':{wall:'#c68862',roof:'#563f3b',trim:'#e3b968',count:2},
  'White Needle':{wall:'#eee7d3',roof:'#44677a',trim:'#cf9760',count:1},
  'Last Orchard':{wall:'#d9b779',roof:'#af6241',trim:'#607c50',count:3},
};
const PROFILES={
  mesa:{wall:'#cfbb92',roof:'#9b5540',trim:'#4a6866',count:2},
  garden:{wall:'#e6d3a2',roof:'#648069',trim:'#b47747',count:3},
  split:{wall:'#a9bdb8',roof:'#405966',trim:'#d5a56d',count:2},
};
export function settlementLayout(island){
  const dock=mooringLayout(island),field=islandField(island,{harbour:true}),R=island.radius;
  const style=STYLES[island.landmark]||PROFILES[island.profile];
  const local=(s,t,y)=>({x:dock.nx*s-dock.nz*t,y,z:dock.nz*s+dock.nx*t});
  const ground=(s,t)=>{const p=local(s,t,0);return field.heightAt(p.x,p.z);};
  const huts=[];
  for(let i=0;i<style.count;i++){
    const s=R*(i===0?.40:i===1?.17:.20),t=R*(i===0?-.25:i===1?.36:-.49);
    const w=i===0?7:5.5,d=i===0?8:6,h=island.profile==='split'?5.5:4.3;
    let y=ground(s,t);
    for(const ds of [-d/2,d/2])for(const dt of [-w/2,w/2])y=Math.max(y,ground(s+ds,t+dt));
    huts.push({s,t,w,d,h,y:y+.15,roof:island.profile==='split'?3.4:2.1});
  }
  const h=huts[0],chimney=local(h.s-1.6,h.t-1.5,h.y+h.h+h.roof+1.3);
  return {dock,style,huts,local,ground,chimney};
}

// Static architecture joins the island's existing vertex-colour batch: adding
// a hut, pile, roof or window never allocates a material or a draw call.
export function createSettlementGeometry(island,lod=0){
  const layout=settlementLayout(island),{dock,style,huts,local,ground}=layout;
  const p=[],c=[],e=[],color=new THREE.Color();
  function add(g,s,y,t,colour,glow=0,rotation=0){
    g.rotateY(rotation);g.translate(t,y,s);
    const raw=g.index?g.toNonIndexed():g;color.set(colour);
    const a=raw.attributes.position;
    for(let i=0;i<a.count;i++){
      // (t,s) -> (x,z) reflects handedness; reverse each triangle.
      const j=i%3===1?i+1:i%3===2?i-1:i;
      const v=local(a.getZ(j),a.getX(j),a.getY(j));
      // Fail at construction rather than silently placing an unreachable prop.
      if(Math.hypot(v.x,v.z)>island.radius)throw new Error('Settlement outside collider: '+island.id);
      p.push(v.x,v.y,v.z);c.push(color.r,color.g,color.b);e.push(glow);
    }
    if(raw!==g)raw.dispose();g.dispose();
  }
  const box=(s,t,y,w,h,d,col,glow=0)=>add(new THREE.BoxGeometry(w,h,d),s,y,t,col,glow);
  function beam(s1,t1,y1,s2,t2,y2,width,col){
    const a=new THREE.Vector3(t1,y1,s1),b=new THREE.Vector3(t2,y2,s2),delta=b.clone().sub(a);
    const g=new THREE.BoxGeometry(width,delta.length(),width);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
    const mid=a.add(b).multiplyScalar(.5);add(g,mid.z,mid.y,mid.x,col);
  }
  const wood='#916541',edge='#c49a65',dark='#3b4a43';
  const start=island.radius-dock.inset-3,end=dock.reach,span=end-start;
  box((start+end)/2,0,dock.y,3,.35,span,wood);
  box(end-.9,0,dock.y,dock.width,.4,1.8,edge);
  // Big cream-and-colour harbour signal reads from the approach without text.
  const mast=end-2.3,mt=-dock.width*.35;
  box(mast,mt,dock.y+3.5,.26,7,.26,edge);
  box(mast,mt+1.3,dock.y+6.2,2.8,1.5,.16,style.roof);
  box(mast+.1,mt+1.3,dock.y+6.2,.38,1.5,.2,'#f4dfaf');
  box(mast,mt,dock.y+4.7,.8,1.1,.8,'#ffb748',2.4);
  box(mast,mt,dock.y+5.35,1.05,.2,1.05,dark);
  if(lod<2){
    for(const s of [start+1,end-1.5])for(const t of [-1.3,1.3]){
      box(s,t,1.8,.42,5.5,.42,wood);box(s,t,4.6,.58,.24,.58,edge);
    }
    for(const t of [-dock.width*.39,dock.width*.39]){
      box(end-.9,t,2,.5,5.5,.5,wood);box(end-.9,t,4.9,.7,.18,.7,edge);
    }
    // Ladder faces open water, all rails/rungs behind the outer head edge.
    for(const t of [-.65,.65])box(end-.08,t,1.95,.12,3.8,.14,edge);
    for(let y=.4;y<3.8;y+=.48)box(end-.02,0,y,1.3,.12,.16,edge);
    for(let s=start+.3;s<end-.3;s+=.65)box(s,0,dock.y+.185,2.9,.025,.035,dark);
    // Cargo, handover board and covered drying rack beside the landward end.
    box(start-1,2,ground(start-1,2)+.6,1.2,1.2,1.2,edge);
    const signY=Math.max(dock.y,ground(start-1,-2));
    box(start-1,-2,signY+1,.18,2,.18,wood);
    box(start-1,-2,signY+2,1.6,1,.18,dark);
    box(start-.89,-2,signY+2,1.2,.65,.05,'#eed9a2');
  }
  for(let i=0;i<huts.length;i++){
    const h=huts[i],{s,t,y,w,d}=h;
    // Deep foundation follows the slope; no floating downhill walls at any LOD.
    const bottom=Math.min(ground(s+d/2,t+w/2),ground(s-d/2,t-w/2))-.25;
    box(s,t,(y+bottom)/2,w+.5,y-bottom,d+.5,'#807e6b');
    box(s,t,y+h.h/2,w,h.h,d,style.wall);
    // Gabled roof prism, ridge runs radially; retained in the far silhouette.
    const rw=w/2+.45,rd=d/2+.45,ry=y+h.h;
    const verts=[[-rw,0,-rd],[rw,0,-rd],[0,h.roof,-rd],[-rw,0,rd],[rw,0,rd],[0,h.roof,rd]];
    const faces=[[0,2,1],[3,4,5],[0,3,5],[0,5,2],[2,5,4],[2,4,1]];
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(faces.flatMap(f=>f.flatMap(k=>verts[k])),3));
    add(g,s,ry,t,style.roof);
    // Lit windows on every facade; vertex emission, no point lights/bloom.
    for(const sign of [-1,1]){
      box(s+sign*(d/2+.035),t,y+2,1.55,1.65,.1,'#ffd283',1.7);
      box(s,t+sign*(w/2+.035),y+2,.1,1.65,1.55,'#ffd283',1.7);
    }
    if(lod<2){
      box(s+d/2+.09,t,y+.85,1.1,1.7,.12,style.trim);
      for(const sign of [-1,1]){
        box(s+d/2+.12,t+sign*.98,y+2,.35,1.9,.18,style.trim);
        box(s+d/2+.13,t,y+2,1.6,.09,.15,wood);
        box(s+d/2+.13,t,y+2,.09,1.6,.15,wood);
      }
      box(s+d/2+.5,t,y-.05,w+.8,.2,1.3,wood);
    }
  }
  const h=huts[0],chimneyY=h.y+h.h+h.roof;
  box(h.s-1.6,h.t-1.5,chimneyY-.1,1,2.6,1,'#6b6055');
  box(h.s-1.6,h.t-1.5,chimneyY+1.25,1.35,.3,1.35,'#534f46');
  if(lod<2){
    // A switchback path with individual low steps, from pier to first cottage.
    const nodes=[[start,0],[island.radius*.55,0],[h.s,h.t+h.w/2+1]];
    for(let n=0;n<nodes.length-1;n++){
      const [s0,t0]=nodes[n],[s1,t1]=nodes[n+1],count=lod===0?18:9;
      for(let k=0;k<count;k++){
        const u=k/(count-1),s=s0+(s1-s0)*u,t=t0+(t1-t0)*u;
        box(s,t,ground(s,t)+.17,1.65,.23,1.1,'#c8b590');
      }
    }
    const s=island.radius*.55,t=island.radius*.26,y=ground(s,t)+.2;
    for(const dt of [-2,2])box(s,t+dt,y+1.9,.16,3.8,.16,wood);
    box(s,t,y+3.7,4.4,.18,.18,wood);
    // Mesh net: crossed thin battens in one static batch, no alpha texture.
    const steps=lod===0?8:4;
    for(let k=0;k<=steps;k++){
      const dt=-1.8+3.6*k/steps;
      beam(s,t+dt,y+1,s,t+dt,y+3.5,.035,'#69786a');
      beam(s,t-1.8,y+1+2.5*k/steps,s,t+1.8,y+1+2.5*k/steps,.035,'#69786a');
    }
    if(island.profile==='garden'){
      for(const dt of [-2,0,2])box(s-4,t+dt,ground(s-4,t+dt)+.2,1.6,.45,3.3,'#74824c');
    }else if(island.profile==='mesa'){
      box(s-3,t,ground(s-3,t)+1.1,3,2.2,3,'#787c6c');
      box(s-3,t,ground(s-3,t)+2.3,3.6,.3,3.5,style.roof);
    }else{
      for(const dt of [-2,2])box(s-3,t+dt,ground(s-3,t+dt)+1,.25,2,.25,wood);
      box(s-3,t,ground(s-3,t)+2,4.5,.25,2.5,style.trim);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setAttribute('glow',new THREE.Float32BufferAttribute(e,1));
  g.computeVertexNormals();g.computeBoundingSphere();g.userData={triangles:p.length/9,layout};return g;
}

// One shared instanced draw for every active chimney. No per-island particles,
// lights, textures, or scene nodes. Emitter cache is bounded by streamed meshes.
export function createSettlementLife(islands){
  const group=new THREE.Group(),geometry=new THREE.PlaneGeometry(2,2);
  const material=new THREE.MeshBasicMaterial({color:'#c8c1b2',transparent:true,opacity:.42,depthWrite:false,fog:false});
  // Soft analytic puffs; no particle atlas or extra texture allocation.
  material.onBeforeCompile=shader=>{
    shader.vertexShader='varying vec2 vPuffUv;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvPuffUv=uv;');
    shader.fragmentShader='varying vec2 vPuffUv;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`diffuseColor.a*=1.0-smoothstep(.08,.5,length(vPuffUv-.5));\n#include <opaque_fragment>`);
  };
  const max=SETTLEMENT_LIMITS.high.chimneys*SETTLEMENT_LIMITS.high.puffs;
  const smoke=new THREE.InstancedMesh(geometry,material,max);smoke.instanceMatrix.setUsage(THREE.DynamicDrawUsage);smoke.frustumCulled=false;group.add(smoke);
  const dummy=new THREE.Object3D(),cache=new Map();let tier='standard',emitters=0;
  return {group,setQuality(value){tier=value;},stats(){return {chimneys:emitters,puffs:smoke.count};},
    update(state,origin,camera){
      const limits=SETTLEMENT_LIMITS[tier],meshes=islands.meshes;
      const ids=new Set(meshes.map(m=>m.userData.island.id));for(const id of cache.keys())if(!ids.has(id))cache.delete(id);
      let count=0;emitters=0;
      for(const mesh of meshes.sort((a,b)=>(a.userData.island.x-state.x)**2+(a.userData.island.z-state.z)**2-(b.userData.island.x-state.x)**2-(b.userData.island.z-state.z)**2)){
        if(!mesh.visible||emitters>=limits.chimneys)continue;
        const island=mesh.userData.island;if(Math.hypot(island.x-state.x,island.z-state.z)>500)continue;
        let chimney=cache.get(island.id);if(!chimney){chimney=settlementLayout(island).chimney;cache.set(island.id,chimney);}
        emitters++;
        for(let k=0;k<limits.puffs;k++){
          const age=((state.reduced?0:state.time)*.22+k/limits.puffs+(island.seed%97)/97)%1;
          const drift=age*5,scale=.22+age*1.1;
          dummy.position.set(island.x-origin.x+chimney.x+VISUAL_WIND.x*drift,chimney.y+age*6,island.z-origin.z+chimney.z+VISUAL_WIND.z*drift);
          dummy.quaternion.copy(camera.quaternion);dummy.scale.setScalar(scale*Math.sin(Math.PI*age));dummy.updateMatrix();smoke.setMatrixAt(count++,dummy.matrix);
        }
      }
      smoke.count=count;smoke.visible=count>0;smoke.instanceMatrix.needsUpdate=true;
    },dispose(){geometry.dispose();material.dispose();cache.clear();}};
}
