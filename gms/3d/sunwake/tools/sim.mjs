import assert from 'node:assert/strict';
import {quality} from './quality.mjs';
import {exploration} from './exploration.mjs';
import {route} from './route.mjs';
import {fishing} from './fishing.mjs';
import {jobs} from './jobs.mjs';
import {handling} from './handling.mjs';
import {collision} from './collision.mjs';
import {world} from './world.mjs';
import {QUALITY,SUN_DIRECTION,SEA_STATE,CHOP_SHIFTS} from '../js/core/config.mjs';
import {WAVES,MAX_HEIGHT,MAX_SLOPE,MAX_VERTICAL_SPEED,FOAM_HEIGHT,sampleWave,phaseAtOrigin} from '../js/core/waves.mjs';
import {rebaseOrigin,rippleOffsets} from '../js/core/math.mjs';
import {radialMesh} from '../js/core/water-mesh.mjs';
const suite=process.argv.includes('--suite')?process.argv[process.argv.indexOf('--suite')+1]:'all';
if(!['all','shell','waves','handling','collision','world','exploration','route','fishing','jobs','quality'].includes(suite))throw new Error(`Suite ${suite} is not implemented through M5`);
if(['all','shell'].includes(suite)){
  assert.equal(Object.keys(QUALITY).length,4);assert.ok(SEA_STATE>0);assert.ok(Math.abs(Math.hypot(...SUN_DIRECTION)-1)<1e-12);
  console.log('PASS shell: pure config, four quality tiers, normalized sun direction');
}
if(['all','waves'].includes(suite)){
  const a={},b={},c={},eps=1e-4,tolerance=1e-6,phases=new Float64Array(4);let seed=0x53554e57,maxDerivativeError=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  assert.equal(MAX_HEIGHT,WAVES.reduce((s,w)=>s+w.amplitude,0));assert.ok(FOAM_HEIGHT<MAX_HEIGHT);
  assert.ok(CHOP_SHIFTS.reduce((a,b)=>a+b,0)<=.35+1e-12,'A2 horizontal displacement bound');
  assert.ok(CHOP_SHIFTS.reduce((sum,shift,i)=>sum+shift*WAVES[i].k,0)<1,'no Gerstner foldovers');
  for(let i=0;i<20000;i++){
    const x=(random()-.5)*5000,z=(random()-.5)*5000,t=random()*3600;
    assert.equal(sampleWave(x,z,t,a),a);
    assert.ok(Math.abs(a.height)<=MAX_HEIGHT+1e-12);assert.ok(Math.hypot(a.dx,a.dz)<=MAX_SLOPE+1e-12);assert.ok(Math.abs(a.dt)<=MAX_VERTICAL_SPEED+1e-12);assert.ok(Math.abs(Math.hypot(a.nx,a.ny,a.nz)-1)<1e-12);
    for(const [axis,field] of [[0,'dx'],[1,'dz'],[2,'dt']]){
      const values=[x,z,t];values[axis]+=eps;sampleWave(...values,b);values[axis]-=2*eps;sampleWave(...values,c);const error=Math.abs((b.height-c.height)/(2*eps)-a[field]);maxDerivativeError=Math.max(maxDerivativeError,error);assert.ok(error<tolerance,`${field} derivative error ${error}`);
    }
    const deltaX=(random()-.5)*.01,deltaZ=(random()-.5)*.01,deltaT=random()*.01;
    sampleWave(x+deltaX,z+deltaZ,t+deltaT,b);
    assert.ok(Math.abs(a.height-b.height)<=MAX_SLOPE*Math.hypot(deltaX,deltaZ)+MAX_VERTICAL_SPEED*deltaT+1e-8);
  }
  // Cross each signed chunk/lattice boundary without resetting the field.
  for(const boundary of [-768,-512,-384,-256,0,256,384,512,768,1e7])for(const axis of ['x','z']){
    const x=axis==='x'?boundary:73,z=axis==='z'?boundary:-39;
    sampleWave(x-eps*(axis==='x'),z-eps*(axis==='z'),5,a);sampleWave(x+eps*(axis==='x'),z+eps*(axis==='z'),5,b);
    assert.ok(Math.abs(a.height-b.height)<=MAX_SLOPE*2*eps+1e-8);
  }
  let maxRebaseError=0;
  for(const [x,z]of [[0,0],[256.001,-255],[-257,385],[1e7,-1e7]])for(const time of [0,2,5,10,1e6]){
    const origin={x:0,z:0};rebaseOrigin(x,z,origin);phaseAtOrigin(origin.x,origin.z,time,phases);let gpuReference=0;
    WAVES.forEach((w,i)=>gpuReference+=w.amplitude*Math.sin(w.k*(w.x*(x-origin.x)+w.z*(z-origin.z))+phases[i]));sampleWave(x,z,time,a);
    const error=Math.abs(gpuReference-a.height);maxRebaseError=Math.max(maxRebaseError,error);assert.ok(error<1e-8);
    const offsets=new Float64Array(4);rippleOffsets(origin.x,origin.z,time,offsets);assert.ok([...offsets].every(v=>v>=0&&v<1));
  }
  const meshes={};
  for(const tier of Object.keys(QUALITY)){
    const {position,indices,radii,segments}=radialMesh(tier),vertices=position.length/3;
    assert.ok(vertices<65536);assert.equal(indices.length/3,segments*(2*radii.length-1));assert.equal(radii.at(-1),1536);
    assert.ok(radii.every((r,i)=>i===0||r>radii[i-1]));
    for(const w of WAVES)for(let i=0;i<radii.length;i++){const inner=i?radii[i-1]:0;if(inner>=w.fade[1])continue;assert.ok(radii[i]-inner<=w.wavelength/6+1e-9,'C1 radial sampling');assert.ok(2*radii[i]*Math.sin(Math.PI/segments)<=w.wavelength/6+1e-9,'C1 angular sampling');}
    const edges=new Map();
    for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.subarray(i,i+3);assert.ok(a<vertices&&b<vertices&&c<vertices);
      const ax=position[b*3]-position[a*3],az=position[b*3+2]-position[a*3+2],bx=position[c*3]-position[a*3],bz=position[c*3+2]-position[a*3+2];assert.ok(az*bx-ax*bz>0,'upward nondegenerate triangle');
      for(const [u,v]of [[a,b],[b,c],[c,a]]){const key=Math.min(u,v)*65536+Math.max(u,v);edges.set(key,(edges.get(key)||0)+1);}
    }
    assert.equal([...edges.values()].filter(n=>n===1).length,segments,'only outer rim is open');assert.ok([...edges.values()].every(n=>n===1||n===2),'manifold mesh');meshes[tier]={vertices,triangles:indices.length/3};
  }
  console.log('PASS waves: 20,000 seeded height/slope/velocity/normal/derivative/continuity samples; signed boundaries, large-world phases, ripple wrapping; three crack-free Uint16 meshes');
  console.log(JSON.stringify({bounds:{height:MAX_HEIGHT,slope:MAX_SLOPE,verticalSpeed:MAX_VERTICAL_SPEED,foam:FOAM_HEIGHT},maxDerivativeError,maxRebaseError,meshes},null,2));
}

if(['all','handling'].includes(suite)){console.log('PASS handling',JSON.stringify(handling(),null,2));}
if(['all','world'].includes(suite)){console.log('PASS world',JSON.stringify(world(),null,2));}
if(['all','collision'].includes(suite)){console.log('PASS collision',JSON.stringify(collision(),null,2));}

if(['all','exploration'].includes(suite))console.log('PASS exploration',JSON.stringify(exploration(),null,2));

if(['all','route'].includes(suite))console.log('PASS route',JSON.stringify(route(),null,2));

if(['all','fishing'].includes(suite))console.log('PASS fishing',JSON.stringify(fishing(),null,2));

if(['all','jobs'].includes(suite))console.log('PASS jobs',JSON.stringify(jobs(),null,2));

if(['all','quality'].includes(suite))console.log('PASS quality',JSON.stringify(quality(),null,2));
