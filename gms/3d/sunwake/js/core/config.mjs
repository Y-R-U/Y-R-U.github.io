export const SEA_STATE = 1;
// TASKS A2, enabled after inspecting the M2 sine baseline. Vertex-only shift.
export const CHOP_SHIFTS = Object.freeze([.24,.11,0,0]);
// C1: stricter than the 300/150/70/40 ceilings: also respect the low tier
// angular edges and radial jumps. Fragment macro normals retain distant texture.
export const WAVE_SETTINGS = Object.freeze([
  {wavelength:36,amplitude:.75,direction:255,phase:0,fade:[64,116]},
  {wavelength:18,amplitude:.34,direction:285,phase:1.7,fade:[32,56]},
  {wavelength:9,amplitude:.13,direction:240,phase:3.1,fade:[16,29]},
  {wavelength:4.5,amplitude:.05,direction:300,phase:4.4,fade:[8,14]},
].map(Object.freeze));
export const PALETTE = Object.freeze({deep:'#082F3D',lit:'#246B70',shallow:'#53A69C',foam:'#FFF0D0',sun:'#FFF2BA',glitter:'#FFC078',horizon:'#F2A487',zenith:'#657B9A',haze:'#877B99'});
// D2: the water shader, the scene fog and the island fade all read these.
export const HORIZON_FADE = Object.freeze([180,650]);
export const SUN_ANGLE = 6 * Math.PI / 180;
export const SUN_DIRECTION = Object.freeze([-Math.cos(SUN_ANGLE), Math.sin(SUN_ANGLE), 0]);
export const QUALITY = Object.freeze({
  high: {segments:256, bands:[[96,48],[48,144],[32,400],[16,1536]], pixelCap:2e6,dpr:1.5,ripples:2},
  standard: {segments:192,bands:[[64,32],[48,128],[32,384],[16,1536]],pixelCap:1.1e6,dpr:1.25,ripples:2},
  low: {segments:128,bands:[[64,32],[32,128],[24,384],[8,1536]],pixelCap:.65e6,dpr:1,ripples:1},
});
export const SEED = 0x53554E57;

export const BOAT = Object.freeze({mass:420,gravity:9.81,pitchInertia:1200,rollInertia:220,
  spring:4682,damper:950,pitchDamping:100,rollDamping:60,
  throttleTau:.35,rudderTau:.18,yawTau:.45,engineAhead:1140,engineAstern:320,
  dragLinear:55,dragAhead:11,dragAstern:45,lateralDrag:3,turnRate:.55,
  pitchRightingStart:5*Math.PI/180,rollRightingStart:7*Math.PI/180,
  pitchRighting:240000,rollRighting:50000,pitchRightingDamping:4000,rollRightingDamping:600,
  bankArm:.30,enginePitch:55,speedCap:12,pitchStop:15*Math.PI/180,rollStop:18*Math.PI/180,
  points:Object.freeze([[-.60,-.25,-1.55],[.60,-.25,-1.55],[-.60,-.25,1.55],[.60,-.25,1.55]].map(Object.freeze))});
export const FIXED_DT=1/60;
export const CAMERA=Object.freeze({yawTau:.45,heaveTau:1,positionTau:.28,targetTau:.20,rollTau:.4,rollFraction:.12});
export const EFFECTS=Object.freeze({stations:96,interval:.08,lifetime:7.5,expansion:.45,spray:64,sprayLow:24});
