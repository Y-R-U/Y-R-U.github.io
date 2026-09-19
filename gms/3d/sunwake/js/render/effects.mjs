import * as THREE from 'three';
import {EFFECTS as E} from '../core/config.mjs';
import {forwardSpeed,hullPoint} from '../core/boat.mjs';
import {waveGLSL} from './shaders.mjs';
export function createEffects(waterUniforms){
  const group=new THREE.Group(),stations=Array.from({length:E.stations},()=>({born:-100,x:0,z:0,yaw:0,speed:0}));
  const particles=Array.from({length:E.spray},()=>({born:-100,x:0,y:0,z:0,vx:0,vy:0,vz:0,life:0,size:0}));
  let head=0,count=0,clock=0,particleHead=0,tier='standard',seed=0x51f15e,emissions=0;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const pixels=new Uint8Array(128*128*4);
  for(let y=0;y<128;y++)for(let x=0;x<128;x++){
    const u=(x%64+.5)/64*2-1,v=(y%64+.5)/64*2-1,r=Math.hypot(u,v),noise=.65+.35*Math.sin(x*1.8+Math.sin(y*.7)*3)*Math.sin(y*1.1);
    const i=(y*128+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=255;pixels[i+3]=255*Math.max(0,1-r*r)**2*noise;
  }
  const atlas=new THREE.DataTexture(pixels,128,128);atlas.needsUpdate=true;atlas.minFilter=THREE.LinearMipmapLinearFilter;atlas.magFilter=THREE.LinearFilter;atlas.generateMipmaps=true;
  const vertexCount=E.stations*6,position=new Float32Array(vertexCount*3),uv=new Float32Array(vertexCount*2),alpha=new Float32Array(vertexCount),indices=[];
  for(let station=0;station<E.stations;station++)for(let strip=0;strip<3;strip++)for(let edge=0;edge<2;edge++){const i=station*6+strip*2+edge;uv[i*2]=edge;uv[i*2+1]=station*.37;}
  for(let i=0;i<E.stations-1;i++)for(let strip=0;strip<3;strip++){const a=i*6+strip*2,b=a+6;indices.push(a,b,a+1,a+1,b,b+1);}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(position,3).setUsage(THREE.DynamicDrawUsage));geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.setAttribute('opacity',new THREE.BufferAttribute(alpha,1).setUsage(THREE.DynamicDrawUsage));geometry.setIndex(indices);
  const fragment=`varying vec2 vUv;varying float vOpacity;
float h21(vec2 p){p=fract(p*vec2(127.31,311.7));p+=dot(p,p+41.31);return fract(p.x*p.y);}
float vnoise(vec2 g){vec2 i=floor(g),f=fract(g);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
void main(){float edge=pow(max(sin(vUv.x*3.14159265),0.),.65);
float n=vnoise(vec2(vUv.x*3.,vUv.y*2.4))*.62+vnoise(vec2(vUv.x*9.,vUv.y*7.))*.38;
float a=vOpacity*edge*smoothstep(.26,.78,n);
if(a<.004)discard;
gl_FragColor=vec4(vec3(1.,.93,.80)*a,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`;
  const material=new THREE.ShaderMaterial({uniforms:{uPhases:waterUniforms.uPhases,uCenter:waterUniforms.uCenter,uAtlas:{value:atlas}},vertexShader:`${waveGLSL}\nuniform vec2 uCenter;attribute float opacity;varying vec2 vUv;varying float vOpacity;void main(){vUv=uv;vOpacity=opacity;vec3 p=position;p.y=waveSurface(p.xz,p.xz-uCenter,true).x+.025;gl_Position=projectionMatrix*viewMatrix*vec4(p,1.);}`,fragmentShader:fragment,transparent:true,premultipliedAlpha:true,depthWrite:false,side:THREE.DoubleSide});
  const wake=new THREE.Mesh(geometry,material);wake.frustumCulled=false;group.add(wake);
  const sprayGeometry=new THREE.BufferGeometry(),sprayPosition=new Float32Array(E.spray*4*3),sprayUV=new Float32Array(E.spray*4*2),sprayAlpha=new Float32Array(E.spray*4),sprayIndices=[];
  for(let i=0;i<E.spray;i++){sprayUV.set([0,0,1,0,0,1,1,1],i*8);const j=i*4;sprayIndices.push(j,j+1,j+2,j+2,j+1,j+3);}
  sprayGeometry.setAttribute('position',new THREE.BufferAttribute(sprayPosition,3).setUsage(THREE.DynamicDrawUsage));sprayGeometry.setAttribute('uv',new THREE.BufferAttribute(sprayUV,2));sprayGeometry.setAttribute('opacity',new THREE.BufferAttribute(sprayAlpha,1).setUsage(THREE.DynamicDrawUsage));sprayGeometry.setIndex(sprayIndices);
  const sprayMaterial=new THREE.ShaderMaterial({uniforms:{uAtlas:{value:atlas}},vertexShader:'attribute float opacity;varying vec2 vUv;varying float vOpacity;void main(){vUv=uv;vOpacity=opacity;gl_Position=projectionMatrix*viewMatrix*vec4(position,1.);}',fragmentShader:'uniform sampler2D uAtlas;varying vec2 vUv;varying float vOpacity;void main(){float a=texture2D(uAtlas,vUv*.5+vec2(.5,0.)).a*vOpacity;gl_FragColor=vec4(vec3(1.,.91,.75)*a,a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',transparent:true,premultipliedAlpha:true,depthWrite:false,side:THREE.DoubleSide});
  const spray=new THREE.Mesh(sprayGeometry,sprayMaterial);spray.frustumCulled=false;group.add(spray);const point={};
  function clear(){for(const s of stations)s.born=-100;for(const p of particles)p.born=-100;head=count=clock=particleHead=emissions=0;seed=0x51f15e;}
  return {group,clear,setQuality(value){tier=value;},step(b,time,dt,scratch){
    const u=forwardSpeed(b);clock+=dt;
    if(clock>=E.interval){clock%=E.interval;
      if(u>.8){const s=stations[head];s.x=b.x-Math.sin(b.yaw)*2.15;s.z=b.z-Math.cos(b.yaw)*2.15;s.yaw=b.yaw;s.speed=u;s.born=time;head=(head+1)%E.stations;count=Math.min(count+1,E.stations);emissions++;}
    }
    if(u>2&&scratch.bowImpact>.8){const limit=tier==='low'?E.sprayLow:E.spray;
      for(const side of [-1,1]){hullPoint(b,[side*.60,-.12,1.55],point);const p=particles[particleHead%limit];particleHead++;p.born=time;p.x=point.x;p.y=point.y+.08;p.z=point.z;p.vx=b.vx*.4+Math.cos(b.yaw)*side*(.8+random());p.vz=b.vz*.4-Math.sin(b.yaw)*side*(.8+random());p.vy=1.2+random()*1.4;p.life=.35+random()*.35;p.size=.055+random()*.09;}
    }
  },render(b,origin,camera){
    const t=b.time,u=forwardSpeed(b),reverse=u<-.05;alpha.fill(0);
    let visible=0;
    for(let i=0;i<count;i++){
      const s=stations[(head-count+i+E.stations)%E.stations],age=t-s.born;if(age<0||age>E.lifetime)continue;
      const next=i+1<count?stations[(head-count+i+1+E.stations)%E.stations]:null;
      const opacity=Math.min(1,age/.22)*(1-age/E.lifetime)**2.4*Math.min(1,(s.speed-.8)/4)*.42;
      const rx=Math.cos(s.yaw),rz=-Math.sin(s.yaw);
      for(let strip=0;strip<3;strip++)for(let edge=0;edge<2;edge++){
        const sign=strip===0?-1:1,center=strip===2?0:sign*(.42+age*E.expansion),width=strip===2?.5+age*.5:.09+age*.16,offset=center+(edge?1:-1)*width;
        const index=i*6+strip*2+edge;position[index*3]=s.x+rx*offset-origin.x;position[index*3+2]=s.z+rz*offset-origin.z;
        alpha[index]=next&&next.born-s.born>.2?0:opacity*(strip===2?Math.max(0,1-age/1.6)*.8:1);
      }visible++;
    }
    geometry.setDrawRange(0,Math.max(0,count-1)*18);
    // Reverse is a 1.5 m churn at the current stern, never a backwards V trail.
    if(reverse){const fx=Math.sin(b.yaw),fz=Math.cos(b.yaw),rx=fz,rz=-fx;for(let i=0;i<2;i++)for(let strip=0;strip<3;strip++)for(let e=0;e<2;e++){const j=i*6+strip*2+e,d=2.15+i*1.5,w=(e?1:-1)*(.24+i*.2);position[j*3]=b.x-fx*d+rx*w-origin.x;position[j*3+2]=b.z-fz*d+rz*w-origin.z;alpha[j]=strip===2?.30*Math.min(1,-u):0;}geometry.setDrawRange(0,18);}
    geometry.attributes.position.needsUpdate=true;geometry.attributes.opacity.needsUpdate=true;
    sprayAlpha.fill(0);const right=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),up=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),limit=tier==='low'?E.sprayLow:E.spray;let live=0;
    for(let i=0;i<limit;i++){const p=particles[i],age=t-p.born;if(age<0||age>p.life)continue;live++;
      const x=p.x+p.vx*age-origin.x,y=p.y+p.vy*age-4.905*age*age,z=p.z+p.vz*age-origin.z;
      for(let corner=0;corner<4;corner++){const index=i*4+corner,a=(corner%2?1:-1)*p.size,c=(corner<2?-1:1)*p.size;sprayPosition[index*3]=x+right.x*a+up.x*c;sprayPosition[index*3+1]=y+right.y*a+up.y*c;sprayPosition[index*3+2]=z+right.z*a+up.z*c;sprayAlpha[index]=Math.sin(Math.PI*age/p.life)*.65;}}
    sprayGeometry.setDrawRange(0,limit*6);sprayGeometry.attributes.position.needsUpdate=true;sprayGeometry.attributes.opacity.needsUpdate=true;
    this.stats={wakeStations:visible,sprayParticles:live,wakeEmissions:emissions,sprayCapacity:limit,reverseChurn:reverse};
  },stats:{wakeStations:0,sprayParticles:0,wakeEmissions:0,sprayCapacity:E.spray,reverseChurn:false}};
}
