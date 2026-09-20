import * as THREE from 'three';
import {PALETTE,SUN_DIRECTION} from '../core/config.mjs';
import {createCloudTexture} from './textures.mjs';
import {WEATHER} from '../core/visual-config.mjs';
import {skyGLSL,fullscreenVertex} from './shaders.mjs';
export function createSky() {
  const uniforms={uSun:{value:new THREE.Vector3(...SUN_DIRECTION)},uHorizon:{value:new THREE.Color(PALETTE.horizon)},uZenith:{value:new THREE.Color(PALETTE.zenith)},uHaze:{value:new THREE.Color(PALETTE.haze)},uSunColor:{value:new THREE.Color(PALETTE.glitter)},uCloud:{value:createCloudTexture()},uCloudEnabled:{value:1},uCloudTime:{value:0},uWeather:{value:WEATHER.intensity},uInverseProjection:{value:new THREE.Matrix4()},uCameraWorld:{value:new THREE.Matrix4()}};
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,vertexShader:fullscreenVertex,fragmentShader:/* glsl */`
    varying vec2 vClip;uniform mat4 uInverseProjection,uCameraWorld;
    ${skyGLSL}
    void main(){vec4 view=uInverseProjection*vec4(vClip,1.,1.);vec3 ray=normalize(mat3(uCameraWorld)*view.xyz);gl_FragColor=vec4(skyColor(ray,true),1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    }`});
  const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.renderOrder=-1000;
  return {mesh,uniforms,update(camera,time){uniforms.uInverseProjection.value.copy(camera.projectionMatrixInverse);uniforms.uCameraWorld.value.copy(camera.matrixWorld);uniforms.uCloudTime.value=(time*.003/(2*Math.PI))%1;}};
}
