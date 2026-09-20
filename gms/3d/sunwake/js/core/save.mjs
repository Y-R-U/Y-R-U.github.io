import {SEED} from './config.mjs';
import {ATLAS} from './content.mjs';
import {MAX_VISITS} from './exploration.mjs';
import {SPECIES,MAX_LEVEL,LEVEL_XP} from './fishing.mjs';
import {createJobs,encodeJobs} from './jobs.mjs';
export const SAVE_KEY='sunwake-v1';
export const DEFAULT_SETTINGS=Object.freeze({sound:false,reduced:false,quality:'auto',helm:'invisible',helmHintsDone:false});
const coordinate=n=>Number.isFinite(n)&&Math.abs(n)<=1e9;
export function validateSave(v){
 if(!v||v.version!==1||v.seed!==SEED||!v.position||!coordinate(v.position.x)||!coordinate(v.position.z)||!coordinate(v.position.yaw))return null;
 if(!Array.isArray(v.atlasIds)||!Array.isArray(v.ordinaryVisits))return null;
 const atlasIds=[...new Set(v.atlasIds.filter(id=>ATLAS.some(i=>i.id===id)))];
 const seen=new Set(),ordinaryVisits=[];
 for(const i of v.ordinaryVisits.slice(-MAX_VISITS))if(i&&typeof i.id==='string'&&/^-?\d{1,8}:-?\d{1,8}$/.test(i.id)&&!seen.has(i.id)&&!ATLAS.some(a=>a.id===i.id)&&coordinate(i.x)&&coordinate(i.z)){
  seen.add(i.id);ordinaryVisits.push({id:i.id,x:i.x,z:i.z,name:typeof i.name==='string'?i.name.slice(0,64):'Uncharted island'});
 }
 // New keys default rather than invalidating: a save written before the helm
 // setting existed is still a valid save, it just gets the defaults.
 const settings={sound:v.settings?.sound===true,reduced:v.settings?.reduced===true,
  quality:['auto','high','standard','low'].includes(v.settings?.quality)?v.settings.quality:'auto',
  helm:['invisible','visible'].includes(v.settings?.helm)?v.settings.helm:'invisible',
  helmHintsDone:v.settings?.helmHintsDone===true};
 // Fishing arrived after Aaron's voyage was already saved, so a save with no
 // `fishing` block is NOT invalid — it is a save from before there were fish,
 // and it comes back as a brand-new angler. The version deliberately stays at 1
 // so nothing that already exists is thrown away.
 const raw=v.fishing&&typeof v.fishing==='object'?v.fishing:{};
 const cap=LEVEL_XP[MAX_LEVEL-1]*4;
 const caught={},best={};
 for(const species of SPECIES){
  const n=raw.caught?.[species.id];
  if(Number.isSafeInteger(n)&&n>0)caught[species.id]=Math.min(n,1e9);
  const kg=raw.best?.[species.id];
  if(Number.isFinite(kg)&&kg>0)best[species.id]=Math.min(kg,species.kg[1]);
 }
 const fishing={xp:Number.isFinite(raw.xp)&&raw.xp>0?Math.min(Math.floor(raw.xp),cap):0,
  casts:Number.isSafeInteger(raw.casts)&&raw.casts>0?Math.min(raw.casts,1e9):0,caught,best};
 // Jobs and coins arrived after fishing did, and the same rule applies: a save
 // without them is a save from before there was a job board, not a bad save.
 // `createJobs` regenerates every accepted job from the board it came from, so
 // this both defaults a missing block and scrubs a tampered one.
 const jobs=encodeJobs(createJobs(v.jobs&&typeof v.jobs==='object'?v.jobs:null));
 return {version:1,seed:SEED,fishing,jobs,position:{x:v.position.x,z:v.position.z,yaw:Math.atan2(Math.sin(v.position.yaw),Math.cos(v.position.yaw))},atlasIds,ordinaryVisits,
  visitCount:Math.max(ordinaryVisits.length,Number.isSafeInteger(v.visitCount)&&v.visitCount>=0?v.visitCount:0),distanceM:Number.isFinite(v.distanceM)&&v.distanceM>=0?v.distanceM:0,settings};
}
export function decodeSave(text){try{return validateSave(JSON.parse(text));}catch{return null;}}
export function encodeSave(boat,exploration,settings,fishing=null,jobs=null){return JSON.stringify(validateSave({version:1,seed:SEED,position:{x:boat.x,z:boat.z,yaw:boat.yaw},atlasIds:exploration.atlasIds,ordinaryVisits:exploration.ordinaryVisits,visitCount:exploration.visitCount,distanceM:exploration.distanceM,settings,
  fishing:fishing?{xp:fishing.xp,casts:fishing.casts,caught:fishing.caught,best:fishing.best}:null,
  jobs:jobs?encodeJobs(jobs):null}));}
