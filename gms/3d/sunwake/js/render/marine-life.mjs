import * as THREE from 'three';
import {sampleWave} from '../core/waves.mjs';
import {MARINE_LIMITS} from '../core/visual-config.mjs';
import {mooringLayout} from '../core/island-shape.mjs';
import {hullPoint} from '../core/boat.mjs';
import {createIslandMaterial} from './islands.mjs';

// Render-only contract: scene.setFishingVisuals({spots,catch}) or state.fishingVisuals.
// World coordinates and simulation seconds throughout; no XP, catches or save writes.
export function reefSpot(island){
  const angle=(island.seed>>>0)/4294967296*Math.PI*2,reach=island.radius+22;
  return {id:island.id,x:island.x+Math.cos(angle)*reach,z:island.z+Math.sin(angle)*reach,
    radius:7,activity:.65,seed:island.seed,length:.65};
}
function merged(parts){
  const positions=[],normals=[],colours=[];
  for(const [source,colour,x=0,y=0,z=0,rx=0] of parts){
    source.rotateX(rx);source.translate(x,y,z);const g=source.index?source.toNonIndexed():source,c=new THREE.Color(colour);
    positions.push(...g.attributes.position.array);normals.push(...g.attributes.normal.array);
    for(let i=0;i<g.attributes.position.count;i++)colours.push(c.r,c.g,c.b);
    if(g!==source)g.dispose();source.dispose();
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('glow',new THREE.Float32BufferAttribute(new Float32Array(positions.length/3),1));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));g.computeBoundingSphere();return g;
}
function fishGeometry(){
  // Pointed silver body, forked tail and dorsal fin; one merged instance.
  const body=new THREE.SphereGeometry(1,8,5);body.scale(.13,.19,.48);
  const tail=new THREE.BufferGeometry();tail.setAttribute('position',new THREE.Float32BufferAttribute([
    0,0,-.32, 0,.24,-.68, 0,.01,-.54, 0,0,-.32, 0,.01,-.54, 0,-.22,-.68,
    0,.10,-.13, 0,.34,-.18, 0,.13,.20],3));tail.computeVertexNormals();
  return merged([[body,'#c5ded9'],[tail,'#476d68'],
    [new THREE.SphereGeometry(.032,4,2),'#172c30',-.10,.06,.27],
    [new THREE.SphereGeometry(.032,4,2),'#172c30',.10,.06,.27]]);
}
export function createMarineLife(world,skyUniforms){
  const group=new THREE.Group(),dummy=new THREE.Object3D(),up=new THREE.Vector3(0,1,0),normal=new THREE.Vector3(),w={},point={};
  const buoyGeometry=merged([
    [new THREE.CylinderGeometry(.44,.65,.50,10),'#eeeecc',0,.10],
    [new THREE.TorusGeometry(.51,.11,5,12),'#414c45',0,.05,0,Math.PI/2],
    [new THREE.CylinderGeometry(.11,.11,1.75,6),'#b0a991',0,1.12],
    [new THREE.CylinderGeometry(.28,.28,.17,8),'#fff5cf',0,.50],
    [new THREE.ConeGeometry(.34,.52,6),'#faf2cd',0,2.0],
    [new THREE.SphereGeometry(.10,6,4),'#fff5c8',0,2.37],
  ]);
  const buoyMaterial=createIslandMaterial(skyUniforms),buoys=new THREE.InstancedMesh(buoyGeometry,buoyMaterial,24);
  const fishMaterial=createIslandMaterial(skyUniforms);fishMaterial.side=THREE.DoubleSide;fishMaterial.roughness=.48;fishMaterial.metalness=.18;
  const fish=new THREE.InstancedMesh(fishGeometry(),fishMaterial,97);
  buoys.instanceMatrix.setUsage(THREE.DynamicDrawUsage);fish.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  buoys.frustumCulled=fish.frustumCulled=false;buoys.count=fish.count=0;group.add(buoys,fish);
  const list=[],colour=new THREE.Color();let tier='standard',visuals=null,lastPositions=[];
  const cap=()=>MARINE_LIMITS[tier];
  function buoy(x,z,kind,time,origin,index){
    sampleWave(x,z,time,w);dummy.position.set(x-origin.x,w.height,z-origin.z);
    normal.set(-w.dx,1,-w.dz).normalize();dummy.quaternion.setFromUnitVectors(up,normal);dummy.scale.setScalar(1);dummy.updateMatrix();
    buoys.setMatrixAt(index,dummy.matrix);buoys.setColorAt(index,colour.set(kind==='port'?'#ef8a69':kind==='starboard'?'#67c5aa':'#edd277'));
    lastPositions.push({x,z,y:w.height,kind});
  }
  return {group,setQuality(value){tier=value;},setFishingVisuals(data){visuals=data;},
    stats(){return {buoys:buoys.count,fish:fish.count,buoySamples:lastPositions};},
    update(state,origin){
      const limits=cap(),near=world.nearby(state.x,state.z,280,list),spots=[];lastPositions=[];
      let nb=0,nf=0;
      for(const island of near){
        const spot=reefSpot(island);spots.push(spot);
        if(nb<limits.buoys&&world.sampleShoreDistance(spot.x,spot.z)>3)buoy(spot.x,spot.z,'reef',state.time,origin,nb++);
        // An entrance pair aligned with the deterministic timber landing. Red and
        // green are physical references, not quest pins or invisible collisions.
        const angle=mooringLayout(island).angle,reach=island.radius+15;
        for(const side of [-1,1]){
          const x=island.x+Math.cos(angle)*reach-Math.sin(angle)*side*9,z=island.z+Math.sin(angle)*reach+Math.cos(angle)*side*9;
          if(nb<limits.buoys&&world.sampleShoreDistance(x,z)>3)buoy(x,z,side<0?'port':'starboard',state.time,origin,nb++);
        }
      }
      const data=state.fishingVisuals??visuals;
      const active=Array.isArray(data?.spots)?data.spots:spots;
      for(const spot of active.slice(0,limits.spots)){
        if(!Number.isFinite(spot.x)||!Number.isFinite(spot.z)||Math.hypot(spot.x-state.x,spot.z-state.z)>120)continue;
        const seed=(spot.seed>>>0)||17,phase=(seed%1000)*.013,radius=Math.min(12,Math.max(2,spot.radius||7));
        const activity=Math.min(1,Math.max(0,spot.activity??.65));
        for(let j=0;j<Math.ceil(limits.fish*activity)&&nf<96;j++){
          const t=state.time,a=t*.36+phase+j*2.399,ring=radius*(.35+(j%5)*.12);
          const x=spot.x+Math.cos(a)*ring,z=spot.z+Math.sin(a)*ring*.65;
          if(world.sampleShoreDistance(x,z)<2)continue;
          sampleWave(x,z,t,w);
          const cycle=((t+phase+j*1.73)%9+9)%9,leap=activity>0&&j%4===0&&cycle<1.15?Math.sin(cycle/1.15*Math.PI):0;
          if(activity===0)continue;
          const length=Math.min(2.5,Math.max(.25,spot.length||.65));
          // Surface-feeding schools: backs skim the real crest; most of the body
          // is occluded by the opaque sea. Breaches reveal the complete fish.
          dummy.position.set(x-origin.x,w.height-.06+leap*1.45,z-origin.z);
          dummy.rotation.set(leap?-.85*Math.cos(cycle/1.15*Math.PI):0,Math.atan2(-Math.sin(a),.65*Math.cos(a))+Math.sin(t*8+j)*.12,leap*.2);
          dummy.scale.set(length,length,length);dummy.updateMatrix();fish.setMatrixAt(nf,dummy.matrix);
          fish.setColorAt(nf++,colour.set(spot.color||'#e0efe9'));
        }
      }
      const caught=data?.catch;
      if(caught&&Number.isFinite(caught.startedAt)){
        const age=state.time-caught.startedAt;
        if(age>=0&&age<4){
          const length=Math.min(2.5,Math.max(.3,caught.length||.8));
          hullPoint(state,[0,.455+.13*length,-.10],point);dummy.position.set(point.x-origin.x,point.y+Math.sin(age*12)*.025,point.z-origin.z);
          dummy.rotation.set(0,state.yaw+Math.PI/2,Math.PI/2+Math.sin(age*14)*.10);
          dummy.scale.setScalar(length);dummy.updateMatrix();fish.setMatrixAt(nf,dummy.matrix);fish.setColorAt(nf++,colour.set(caught.color||'#d2d8ac'));
        }
      }
      buoys.count=nb;fish.count=nf;buoys.instanceMatrix.needsUpdate=fish.instanceMatrix.needsUpdate=true;
      if(buoys.instanceColor)buoys.instanceColor.needsUpdate=true;if(fish.instanceColor)fish.instanceColor.needsUpdate=true;
    },
    dispose(){buoyGeometry.dispose();fish.geometry.dispose();buoyMaterial.dispose();fishMaterial.dispose();group.clear();}
  };
}
