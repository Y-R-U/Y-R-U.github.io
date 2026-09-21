import * as THREE from 'three';

// Pitched 16 degrees off straight down, as the brief asks. The *tilt* was already right in the
// first two attempts; what made the frame read as plan view was the 26 deg lens — from 110 m up
// that is near-orthographic, so every tree in frame is seen from the same angle and none of them
// shows a side. Widening the lens and dropping the camera keeps the same 16 deg axis but gives
// the frame a real perspective gradient: a tree at the bottom edge is seen from roughly 35 deg
// off vertical and a tree at the top edge from about 3 deg, so they foreshorten differently.
export const PITCH_DEG=16;
export const FOV_DEG=38;
const VIEW_WIDTH=26, VIEW_DEPTH=52;

export function frameCamera(camera,w,h){
 const halfV=Math.tan(FOV_DEG*Math.PI/360),aspect=w/h,halfH=halfV*aspect;
 const dist=Math.min(96,Math.max(46,Math.max(VIEW_WIDTH/(2*halfH),VIEW_DEPTH/(2*halfV))));
 const pitch=PITCH_DEG*Math.PI/180;
 camera.fov=FOV_DEG;camera.aspect=aspect;
 camera.position.set(0,dist*Math.cos(pitch),dist*Math.sin(pitch));
 camera.lookAt(0,0,0);camera.updateProjectionMatrix();
 return dist;
}

export function createCamera(){
 const camera=new THREE.PerspectiveCamera(FOV_DEG,innerWidth/innerHeight,.5,320);
 frameCamera(camera,innerWidth,innerHeight);
 return camera;
}
