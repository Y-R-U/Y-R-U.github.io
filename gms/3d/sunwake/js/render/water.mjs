import * as THREE from 'three';
import {QUALITY,PALETTE} from '../core/config.mjs';
import {MAX_HEIGHT,phaseAtOrigin,sampleWave} from '../core/waves.mjs';
import {rippleOffsets} from '../core/math.mjs';
import {radialMesh} from '../core/water-mesh.mjs';
import {createRippleTexture} from './textures.mjs';
import {waterVertex,waterFragment,waveGLSL,fullscreenVertex} from './shaders.mjs';
export function createWater(skyUniforms){
  const geometries={};
  for(const tier of Object.keys(QUALITY)){const data=radialMesh(tier),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(data.position,3));g.setIndex(new THREE.BufferAttribute(data.indices,1));g.boundingBox=new THREE.Box3(new THREE.Vector3(-1536,-MAX_HEIGHT,-1536),new THREE.Vector3(1536,MAX_HEIGHT,1536));g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),Math.hypot(1536,MAX_HEIGHT));geometries[tier]=g;}
  const uniforms={...skyUniforms,uPhases:{value:new Float32Array(4)},uCenter:{value:new THREE.Vector2()},uDeep:{value:new THREE.Color(PALETTE.deep)},uLit:{value:new THREE.Color(PALETTE.lit)},uShallow:{value:new THREE.Color(PALETTE.shallow)},uFoam:{value:new THREE.Color(PALETTE.foam)},uRipple:{value:createRippleTexture()},uRippleOffset:{value:new THREE.Vector4()},uRippleLayers:{value:2},uMidDetail:{value:1},uShoreCount:{value:0},uShores:{value:Array.from({length:8},()=>new THREE.Vector3())}};
  const material=new THREE.ShaderMaterial({uniforms,vertexShader:waterVertex,fragmentShader:waterFragment});
  const mesh=new THREE.Mesh(geometries.standard,material);mesh.frustumCulled=false;
  const offset=new Float64Array(4);
  return {mesh,geometries,uniforms,setQuality(tier){mesh.geometry=geometries[tier];uniforms.uRippleLayers.value=QUALITY[tier].ripples;},
    // PLAN §2.4: the nearest eight shores within 180 m, in render-local metres.
    // This is shading only — collision never reads these uniforms.
    setShores(islands,origin,x,z){
      let count=0;
      for(const island of islands){
        if(count>=8)break;
        if(Math.hypot(island.x-x,island.z-z)-island.radius>180)continue;
        uniforms.uShores.value[count].set(island.x-origin.x,island.z-origin.z,island.radius);count++;
      }
      uniforms.uShoreCount.value=count;return count;
    },
    update(state,origin){phaseAtOrigin(origin.x,origin.z,state.time,uniforms.uPhases.value);uniforms.uCenter.value.set(state.x-origin.x,state.z-origin.z);rippleOffsets(origin.x,origin.z,state.time,offset);uniforms.uRippleOffset.value.fromArray(offset);}};
}
// Opt-in one-shot diagnostic. Never invoked by a gameplay RAF.
export function probeWaves(renderer,x,z,time){
  const origin={x:Math.round(x/256)*256,z:Math.round(z/256)*256},samples=[],phases=new Float32Array(4);
  phaseAtOrigin(origin.x,origin.z,time,phases);
  for(let i=0;i<64;i++)samples.push(new THREE.Vector2(x-origin.x+(i%8-3.5)*2.75,z-origin.z+(Math.floor(i/8)-3.5)*2.25));
  const material=new THREE.ShaderMaterial({uniforms:{uPhases:{value:phases},uSamples:{value:samples}},vertexShader:fullscreenVertex,fragmentShader:`${waveGLSL}
    uniform vec2 uSamples[64];void main(){int index=int(gl_FragCoord.x);float h=waveSurface(uSamples[index],vec2(0.),false).x;
    float encoded=floor(clamp((h+${MAX_HEIGHT.toFixed(12)})/${(2*MAX_HEIGHT).toFixed(12)},0.,1.)*65535.+.5);
    gl_FragColor=vec4(floor(encoded/256.)/255.,mod(encoded,256.)/255.,0.,1.);}`,depthTest:false,depthWrite:false,toneMapped:false});
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  const scene=new THREE.Scene();const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;scene.add(mesh);
  const target=new THREE.WebGLRenderTarget(64,1,{depthBuffer:false,stencilBuffer:false,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});
  const old=renderer.getRenderTarget(),pixels=new Uint8Array(64*4),cpu={};let maxError=0;
  try{renderer.setRenderTarget(target);renderer.render(scene,new THREE.Camera());renderer.readRenderTargetPixels(target,0,0,64,1,pixels);
    for(let i=0;i<64;i++){const gpu=(pixels[i*4]*256+pixels[i*4+1])/65535*2*MAX_HEIGHT-MAX_HEIGHT;sampleWave(origin.x+samples[i].x,origin.z+samples[i].y,time,cpu);maxError=Math.max(maxError,Math.abs(cpu.height-gpu));}
  }finally{renderer.setRenderTarget(old);target.dispose();geometry.dispose();material.dispose();}
  return {x,z,time,samples:64,maxError,tolerance:.002,passed:maxError<=.002};
}
