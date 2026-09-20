import {hash32} from './world.mjs';
import {SEED} from './config.mjs';

// Pure fishing model: no window, no DOM, no THREE. Every roll is a pure
// function of (SEED, spot, cast number), so a cast is reproducible and the Node
// harness tests the same code the game runs.

export const CAST_SPEED=1.2;          // m/s — you fish from a boat at rest
export const BITE_MIN=1.4,BITE_MAX=6.5;
export const TENSION_MAX=1;
export const BAND_BASE=.30;           // half-width of the safe band at level 1
export const BAND_PER_LEVEL=.012;     // widens as the skill grows
export const REEL_RATE=.55;           // tension gained per second while reeling
export const SLACK_RATE=.75;          // tension lost per second while not
export const LANDED_PROGRESS=1;
export const SNAP_SECONDS=1.1;        // time outside the band before the line goes

// Better water near a shore or a reef than in the open sea.
export const OPEN_WATER='open',SHORE='shore',REEF='reef';
export function waterKind(shoreDistance){
  if(!Number.isFinite(shoreDistance))return OPEN_WATER;
  if(shoreDistance<=34)return REEF;
  if(shoreDistance<=120)return SHORE;
  return OPEN_WATER;
}

/**
 * Species table. `weight` is the unnormalised chance in the waters listed;
 * `level` is the minimum fishing skill that can hook it at all — below that the
 * fish is simply not in your table, which is what makes levelling legible.
 */
export const SPECIES=Object.freeze([
  {id:'sprat',    name:'Silver sprat',   level:1, weight:{open:34,shore:30,reef:16}, kg:[.08,.5],  fight:.55, xp:6},
  {id:'mullet',   name:'Harbour mullet', level:1, weight:{open:18,shore:34,reef:22}, kg:[.3,1.6],  fight:.7,  xp:10},
  {id:'bream',    name:'Copper bream',   level:3, weight:{open:10,shore:24,reef:28}, kg:[.6,3.2],  fight:.85, xp:18},
  {id:'snapper',  name:'Evening snapper',level:6, weight:{open:8, shore:14,reef:26}, kg:[1.4,6.5], fight:1,   xp:34},
  {id:'kingfish', name:'Amber kingfish', level:10,weight:{open:12,shore:6, reef:14}, kg:[4,18],    fight:1.25,xp:62},
  {id:'sunfish',  name:'Lantern sunfish',level:15,weight:{open:3, shore:2,  reef:7}, kg:[9,34],    fight:1.5, xp:120},
].map(Object.freeze));

// Classic doubling-ish curve. Level 1 starts at 0 XP.
export const MAX_LEVEL=20;
export const LEVEL_XP=Object.freeze(Array.from({length:MAX_LEVEL},(_,i)=>i===0?0:Math.round(42*Math.pow(i,1.65))));
export function levelForXp(xp){
  let level=1;
  for(let i=0;i<LEVEL_XP.length;i++)if(xp>=LEVEL_XP[i])level=i+1;
  return level;
}
export function xpToNext(xp){const level=levelForXp(xp);return level>=MAX_LEVEL?0:LEVEL_XP[level]-xp;}
export function tensionBand(level){return Math.min(.62,BAND_BASE+BAND_PER_LEVEL*(level-1));}

export function availableSpecies(level,kind){
  return SPECIES.filter(s=>s.level<=level&&(s.weight[kind]||0)>0);
}

const unit=(spot,salt)=>hash32(SEED,spot.cx|0,spot.cz|0,salt)/4294967296;

/** Which fish this cast hooks. Pure in (spot, castNumber, level, water). */
export function rollSpecies(spot,castNumber,level,kind){
  const table=availableSpecies(level,kind);
  if(!table.length)return null;
  let total=0;for(const s of table)total+=s.weight[kind];
  // Rarer fish should not get commoner just because you levelled past them, so
  // the roll is over the weights of the fish you can actually catch.
  let roll=unit({cx:spot.cx,cz:spot.cz},1000+castNumber)*total;
  for(const s of table){roll-=s.weight[kind];if(roll<=0)return s;}
  return table[table.length-1];
}

export function rollSize(species,spot,castNumber){
  const t=unit({cx:spot.cx,cz:spot.cz},2000+castNumber);
  // Skewed small: a big one should feel like an event.
  const shaped=Math.pow(t,1.8);
  return +(species.kg[0]+(species.kg[1]-species.kg[0])*shaped).toFixed(2);
}

export function xpFor(species,kg){
  const span=Math.max(1e-6,species.kg[1]-species.kg[0]);
  return Math.round(species.xp*(1+.9*((kg-species.kg[0])/span)));
}

export function createFishing(save=null){
  return {xp:Math.max(0,Number.isFinite(save?.xp)?save.xp:0),
    casts:Math.max(0,Number.isSafeInteger(save?.casts)?save.casts:0),
    caught:{...(save?.caught||{})},
    best:{...(save?.best||{})},
    phase:'idle',           // idle | casting | waiting | fighting | landed | lost
    timer:0,tension:0,progress:0,outside:0,
    species:null,kg:0,kind:OPEN_WATER,lastXp:0,lastLevel:0,spot:null};
}

export function canCast(fishing,boat){
  if(fishing.phase!=='idle')return false;
  return Math.hypot(boat.vx||0,boat.vz||0)<=CAST_SPEED;
}

export function startCast(fishing,boat,shoreDistance,events){
  if(!canCast(fishing,boat))return false;
  const spot={cx:Math.round(boat.x/8),cz:Math.round(boat.z/8)};
  fishing.spot=spot;fishing.kind=waterKind(shoreDistance);
  fishing.casts++;
  const level=levelForXp(fishing.xp);
  fishing.species=rollSpecies(spot,fishing.casts,level,fishing.kind);
  fishing.kg=fishing.species?rollSize(fishing.species,spot,fishing.casts):0;
  fishing.phase='waiting';
  fishing.timer=BITE_MIN+(BITE_MAX-BITE_MIN)*unit(spot,3000+fishing.casts);
  fishing.tension=0;fishing.progress=0;fishing.outside=0;
  events?.push({type:'cast',kind:fishing.kind});
  return true;
}

export function reelIn(fishing){if(fishing.phase!=='idle')fishing.phase='idle';}

/**
 * One step of the fight. `reeling` is the player's single held touch.
 * Tension must be kept inside the band: too slack and the fish makes no
 * progress, too tight for too long and the line goes.
 */
export function stepFishing(fishing,boat,dt,reeling,events){
  if(fishing.phase==='idle'||fishing.phase==='landed'||fishing.phase==='lost')return;
  if(Math.hypot(boat.vx||0,boat.vz||0)>CAST_SPEED*2.5){
    fishing.phase='lost';fishing.tension=0;events?.push({type:'lost',reason:'under way'});return;
  }
  if(fishing.phase==='waiting'){
    fishing.timer-=dt;
    if(fishing.timer<=0){
      if(!fishing.species){fishing.phase='lost';events?.push({type:'lost',reason:'nothing here'});return;}
      fishing.phase='fighting';fishing.tension=.5;fishing.progress=0;fishing.outside=0;
      events?.push({type:'bite'});
    }
    return;
  }
  const level=levelForXp(fishing.xp),band=tensionBand(level),fight=fishing.species.fight;
  fishing.tension+=(reeling?REEL_RATE*fight:-SLACK_RATE)*dt;
  fishing.tension=Math.min(TENSION_MAX,Math.max(0,fishing.tension));
  const centre=.5,inside=Math.abs(fishing.tension-centre)<=band/2;
  if(inside){
    fishing.outside=Math.max(0,fishing.outside-dt*1.5);
    fishing.progress+=dt*(.34/Math.max(.4,fight));
  }else{
    fishing.outside+=dt;
    fishing.progress=Math.max(0,fishing.progress-dt*.12);
    if(fishing.tension>=TENSION_MAX-1e-9||fishing.outside>=SNAP_SECONDS){
      fishing.phase='lost';events?.push({type:'lost',reason:fishing.tension>=TENSION_MAX-1e-9?'line snapped':'the fish shook it'});
      return;
    }
  }
  if(fishing.progress>=LANDED_PROGRESS){
    const gained=xpFor(fishing.species,fishing.kg),before=levelForXp(fishing.xp);
    fishing.xp+=gained;
    const after=levelForXp(fishing.xp);
    fishing.caught[fishing.species.id]=(fishing.caught[fishing.species.id]||0)+1;
    if(!(fishing.best[fishing.species.id]>=fishing.kg))fishing.best[fishing.species.id]=fishing.kg;
    fishing.phase='landed';fishing.lastXp=gained;fishing.lastLevel=after;
    events?.push({type:'landed',id:fishing.species.id,name:fishing.species.name,kg:fishing.kg,xp:gained});
    if(after>before)events?.push({type:'level',level:after});
  }
}
