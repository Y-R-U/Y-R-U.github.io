import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {createCamera,frameCamera} from './cameraRig.mjs';

// The whole grade lives in one pass: haze into the distance, a warm/cool split tone, a midtone
// lift so shadowed forest stays readable, then sRGB and a vignette. This is the treatment the
// title screen used to fake with a CSS overlay; it is now real and the mission view gets it too.
const FINISH=`uniform sampler2D tDiffuse;uniform float uShimmer;varying vec2 vUv;
const float P=.25,K=1.40;
void main(){
 vec2 uv=vUv;
 vec3 c=texture2D(tDiffuse,uv).rgb;
 float haze=smoothstep(.42,1.0,uv.y)*.13;
 c=mix(c,vec3(.27,.36,.40),haze);
 c=clamp((c*(2.51*c+.03))/(c*(2.43*c+.59)+.14),0.,1.);
 c=mix(c,pow(c,vec3(.70)),.46);
 float l=dot(c,vec3(.2126,.7152,.0722));
 c*=mix(vec3(.93,.99,1.06),vec3(1.10,1.02,.86),smoothstep(.10,.62,l));
 // Contrast on LUMINANCE only. A per-channel curve here clipped red and blue to zero across
 // the whole shadow side of the frame and turned the lower half of the picture flat green.
 float L=clamp(dot(c,vec3(.2126,.7152,.0722)),1e-4,1.);
 float Lc=L<=P?P*pow(L/P,K):1.-(1.-P)*pow((1.-L)/(1.-P),K);
 c=clamp(c*(Lc/L),0.,1.);
 c=mix(c*12.92,1.055*pow(max(c,vec3(0.)),vec3(1./2.4))-.055,step(vec3(.0031308),c));
 float vig=1.-.33*smoothstep(.24,.86,length((uv-.5)*vec2(1.,.80)));
 gl_FragColor=vec4(c*vig,1.);
}`;

export function createScene(canvas){
 const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.info.autoReset=false;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.28;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#1d3b36');
 scene.fog=new THREE.Fog(0x40595c,96,190);
 const camera=createCamera();
 // Dawn: cool sky bounce keeps the shadow side readable instead of black.
 scene.add(new THREE.HemisphereLight(0x9ab8cf,0x47543c,1.45));
 const sun=new THREE.DirectionalLight(0xffd6a2,3.5);sun.position.set(-38,20,-15);sun.castShadow=true;
 sun.shadow.mapSize.set(2048,2048);
 Object.assign(sun.shadow.camera,{left:-40,right:40,top:56,bottom:-56,near:1,far:170});
 sun.shadow.bias=-.0003;sun.shadow.normalBias=.14;sun.shadow.radius=3;scene.add(sun);
 // A dim cold counter-light from the far treeline so silhouettes do not go flat black.
 const rim=new THREE.DirectionalLight(0x7fa8c4,.55);rim.position.set(26,14,34);scene.add(rim);

 const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
 const bloom=new UnrealBloomPass(new THREE.Vector2(390,844),.46,.78,.72);composer.addPass(bloom);
 const finish=new ShaderPass({uniforms:{tDiffuse:{value:null},uShimmer:{value:0}},
  vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
  fragmentShader:FINISH});
 finish.material.toneMapped=false;composer.addPass(finish);

 function resize(){renderer.setSize(innerWidth,innerHeight);frameCamera(camera,innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);}
 resize();addEventListener('resize',resize);
 return {renderer,scene,camera,sun,draw(){renderer.info.reset();composer.render();}};
}
