import {SEED} from './config.mjs';
import {ATLAS} from './content.mjs';
import {MAX_VISITS} from './exploration.mjs';
export const SAVE_KEY='sunwake-v1';
export const DEFAULT_SETTINGS=Object.freeze({sound:false,reduced:false,quality:'auto'});
const coordinate=n=>Number.isFinite(n)&&Math.abs(n)<=1e9;
export function validateSave(v){
 if(!v||v.version!==1||v.seed!==SEED||!v.position||!coordinate(v.position.x)||!coordinate(v.position.z)||!coordinate(v.position.yaw))return null;
 if(!Array.isArray(v.atlasIds)||!Array.isArray(v.ordinaryVisits))return null;
 const atlasIds=[...new Set(v.atlasIds.filter(id=>ATLAS.some(i=>i.id===id)))];
 const seen=new Set(),ordinaryVisits=[];
 for(const i of v.ordinaryVisits.slice(-MAX_VISITS))if(i&&typeof i.id==='string'&&/^-?\d{1,8}:-?\d{1,8}$/.test(i.id)&&!seen.has(i.id)&&!ATLAS.some(a=>a.id===i.id)&&coordinate(i.x)&&coordinate(i.z)){
  seen.add(i.id);ordinaryVisits.push({id:i.id,x:i.x,z:i.z,name:typeof i.name==='string'?i.name.slice(0,64):'Uncharted island'});
 }
 const settings={sound:v.settings?.sound===true,reduced:v.settings?.reduced===true,quality:['auto','high','standard','low'].includes(v.settings?.quality)?v.settings.quality:'auto'};
 return {version:1,seed:SEED,position:{x:v.position.x,z:v.position.z,yaw:Math.atan2(Math.sin(v.position.yaw),Math.cos(v.position.yaw))},atlasIds,ordinaryVisits,
  visitCount:Math.max(ordinaryVisits.length,Number.isSafeInteger(v.visitCount)&&v.visitCount>=0?v.visitCount:0),distanceM:Number.isFinite(v.distanceM)&&v.distanceM>=0?v.distanceM:0,settings};
}
export function decodeSave(text){try{return validateSave(JSON.parse(text));}catch{return null;}}
export function encodeSave(boat,exploration,settings){return JSON.stringify(validateSave({version:1,seed:SEED,position:{x:boat.x,z:boat.z,yaw:boat.yaw},atlasIds:exploration.atlasIds,ordinaryVisits:exploration.ordinaryVisits,visitCount:exploration.visitCount,distanceM:exploration.distanceM,settings}));}
