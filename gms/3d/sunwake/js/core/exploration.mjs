import {ATLAS,islandName} from './content.mjs';
import {BOAT_RADIUS} from './world.mjs';
export const DISCOVERY_SECONDS=2,DISCOVERY_MARGIN=32,DISCOVERY_SPEED=3,MAX_VISITS=256;
// How far off a shore a course is allowed to graze before it counts as blocked.
// Wider than the contact skin on purpose: a bearing that only just clears a rock
// is not a bearing a human can hold in a seaway.
export const COURSE_CLEARANCE=14;
export function nearestGoal(state,boat){return ATLAS.filter(i=>!state.atlasIds.includes(i.id)).sort((a,b)=>Math.hypot(a.x-boat.x,a.z-boat.z)-Math.hypot(b.x-boat.x,b.z-boat.z))[0]||null;}
export function createExploration(save=null){return {atlasIds:[...(save?.atlasIds||[])],ordinaryVisits:[...(save?.ordinaryVisits||[])],visitCount:save?.visitCount||0,distanceM:save?.distanceM||0,pin:null,pinnedByHand:false,dwellId:null,dwell:0,complete:(save?.atlasIds.length||0)===6};}
export function pinGoal(state,id){if(ATLAS.some(i=>i.id===id)){state.pin=id;state.pinnedByHand=true;return true;}return false;}

/**
 * The bearing the compass should actually show.
 *
 * The straight line to the pin is only followable if it does not run through an
 * island. Standing beside Lantern Key with Bell Garden pinned, the direct line
 * clips Lantern Key itself, so a player who holds the arrow drives into the rock
 * they just discovered — which is exactly how the second leg became unsailable.
 * When the direct line is blocked, aim at the tangent of the blocking shore on
 * whichever side the goal lies, which is a bearing a human can hold and which
 * releases onto the true course as soon as the island is abeam.
 *
 * Pure: takes plain island descriptors, returns a plain object.
 */
export function courseTo(boat,goal,islands,margin=COURSE_CLEARANCE,out={}){
  out.goal=goal?.id??null;out.blocked=null;out.detour=0;
  if(!goal){out.aimX=out.aimZ=out.bearing=out.distance=null;return out;}
  const gx=goal.x-boat.x,gz=goal.z-boat.z,span=Math.hypot(gx,gz);
  out.distance=Math.max(0,span-(goal.radius||0));
  out.aimX=goal.x;out.aimZ=goal.z;out.bearing=Math.atan2(gx,gz);
  if(!(span>1e-6))return out;
  // Nearest island whose avoidance ring the direct line actually enters.
  let blocking=null,nearest=Infinity;
  for(const island of islands||[]){
    if(!island||island.id===goal.id)continue;
    const R=island.radius+BOAT_RADIUS+margin;
    const t=Math.max(0,Math.min(1,((island.x-boat.x)*gx+(island.z-boat.z)*gz)/(span*span)));
    if(Math.hypot(boat.x+gx*t-island.x,boat.z+gz*t-island.z)>=R)continue;
    const centre=Math.hypot(island.x-boat.x,island.z-boat.z);
    if(centre<nearest){nearest=centre;blocking=island;}
  }
  if(!blocking)return out;
  out.blocked=blocking.id;
  const R=blocking.radius+BOAT_RADIUS+margin,cx=blocking.x-boat.x,cz=blocking.z-boat.z,centre=Math.hypot(cx,cz);
  if(centre<=R+1e-9){
    // Already inside the ring, which is where a player ends up the moment they
    // discover a landmark: they are moored against it. Pointing straight out to
    // sea would send them back the way they came, so run along the shore on
    // whichever side the goal lies, biased 30 degrees outward so the boat
    // actually leaves the rock instead of scraping along it.
    const nx=centre>1e-9?-cx/centre:0,nz=centre>1e-9?-cz/centre:1;
    const outward=Math.atan2(nx,nz),goalAngle=Math.atan2(gx,gz),lean=Math.PI/2-Math.PI/6;
    // Both tangents are legal; take whichever points nearer the goal. Deriving
    // the side from a cross-product sign is easy to get backwards — and did be.
    let best=null,bestOff=Infinity,side=0;
    for(const sign of [1,-1]){
      const angle=outward+sign*lean;
      const off=Math.abs(Math.atan2(Math.sin(angle-goalAngle),Math.cos(angle-goalAngle)));
      if(off<bestOff){bestOff=off;best=angle;side=sign;}
    }
    out.detour=side;out.bearing=Math.atan2(Math.sin(best),Math.cos(best));
    out.aimX=boat.x+Math.sin(best)*Math.max(span,R);out.aimZ=boat.z+Math.cos(best)*Math.max(span,R);
    return out;
  }
  const half=Math.asin(Math.min(1,R/centre)),reach=Math.sqrt(Math.max(0,centre*centre-R*R));
  const base=Math.atan2(cx,cz),goalAngle=Math.atan2(gx,gz);
  const side=Math.atan2(Math.sin(goalAngle-base),Math.cos(goalAngle-base))>=0?1:-1;
  const angle=base+side*half;
  out.detour=side;out.bearing=angle;
  out.aimX=boat.x+Math.sin(angle)*reach;out.aimZ=boat.z+Math.cos(angle)*reach;
  return out;
}

export function stepExploration(state,boat,nearby,dt,events){
 if(!state.pin)state.pin=nearestGoal(state,boat)?.id||null;
 let candidate=null;
 if(Math.hypot(boat.vx,boat.vz)<DISCOVERY_SPEED){
  // `nearby` is nearest-shore-first, but a landmark always outranks an ordinary
  // island: the old `break` handed the dwell to whichever was marginally closer,
  // so an unnamed rock beside a landmark could swallow the two seconds that were
  // meant to turn a page of the atlas.
  for(const i of nearby){
   if(state.atlasIds.includes(i.id)||state.ordinaryVisits.some(v=>v.id===i.id))continue;
   const d=Math.hypot(boat.x-i.x,boat.z-i.z);
   if(d<i.radius+BOAT_RADIUS-1e-6||d>i.radius+DISCOVERY_MARGIN)continue;
   if(!candidate)candidate=i;
   if(i.landmark){candidate=i;break;}
  }
 }
 if(!candidate){state.dwellId=null;state.dwell=0;return;}
 if(state.dwellId!==candidate.id){state.dwellId=candidate.id;state.dwell=0;}
 state.dwell+=dt;if(state.dwell+1e-9<DISCOVERY_SECONDS)return;
 state.dwell=0;state.dwellId=null;
 if(candidate.landmark){
  state.atlasIds.push(candidate.id);
  // Only advance the pin if the player was steering at the thing just found, or
  // at something already in the atlas. A hand-set course is never stolen.
  if(!state.pin||state.pin===candidate.id||state.atlasIds.includes(state.pin)){state.pin=nearestGoal(state,boat)?.id||null;state.pinnedByHand=false;}
  events.push({type:'landmark',id:candidate.id});
  if(state.atlasIds.length===6&&!state.complete){state.complete=true;events.push({type:'complete'});}
 }else{
  state.ordinaryVisits.push({id:candidate.id,x:candidate.x,z:candidate.z,name:islandName(candidate)});
  if(state.ordinaryVisits.length>MAX_VISITS)state.ordinaryVisits.shift();
  state.visitCount++;events.push({type:'island',id:candidate.id,name:islandName(candidate)});
 }
}
