import assert from 'node:assert/strict';
import {createFishing,startCast,stepFishing,canCast,reelIn,levelForXp,xpToNext,tensionBand,
  availableSpecies,rollSpecies,rollSize,xpFor,waterKind,SPECIES,LEVEL_XP,MAX_LEVEL,
  CAST_SPEED,BITE_MAX,SNAP_SECONDS,OPEN_WATER,SHORE,REEF} from '../js/core/fishing.mjs';
import {encodeSave,decodeSave,DEFAULT_SETTINGS} from '../js/core/save.mjs';
import {createExploration} from '../js/core/exploration.mjs';

const DT=1/60;
const still={x:0,z:0,vx:0,vz:0};

// Play a whole fight with a given policy and return how it ended.
function fight(state,policy,limit=120){
  const events=[];let t=0;
  while(t<limit&&['waiting','fighting'].includes(state.phase)){
    stepFishing(state,still,DT,policy(state),events);t+=DT;
  }
  return {events,seconds:+t.toFixed(2),phase:state.phase};
}
// The honest player: reel when the line is slack, ease when it is tight.
const skilful=state=>state.tension<.5;

export function fishing(){
  const report={};

  // Levelling curve is monotone and reaches the top.
  assert.equal(levelForXp(0),1);
  assert.equal(levelForXp(-5),1,'negative xp must not underflow the level');
  for(let i=1;i<LEVEL_XP.length;i++)assert.ok(LEVEL_XP[i]>LEVEL_XP[i-1],'level curve must be monotone');
  for(let level=1;level<=MAX_LEVEL;level++)assert.equal(levelForXp(LEVEL_XP[level-1]),level,`level ${level} boundary`);
  assert.equal(levelForXp(LEVEL_XP.at(-1)+1e6),MAX_LEVEL,'level must cap');
  assert.equal(xpToNext(LEVEL_XP.at(-1)),0);
  assert.ok(xpToNext(0)>0);
  // The band widens with skill but never swallows the whole bar.
  assert.ok(tensionBand(1)<tensionBand(MAX_LEVEL));
  assert.ok(tensionBand(MAX_LEVEL)<1,'a full-width band would remove the mechanic');

  // Species gating: low levels genuinely cannot hook the big ones.
  assert.deepEqual(availableSpecies(1,REEF).map(s=>s.id),['sprat','mullet']);
  assert.ok(availableSpecies(15,REEF).some(s=>s.id==='sunfish'));
  for(const s of SPECIES)assert.ok(s.kg[0]<s.kg[1]&&s.kg[0]>0,s.id+' size range');
  for(const s of SPECIES)assert.ok(Object.values(s.weight).some(w=>w>0),s.id+' is unreachable in every water');
  assert.equal(waterKind(10),REEF);assert.equal(waterKind(80),SHORE);
  assert.equal(waterKind(500),OPEN_WATER);assert.equal(waterKind(Infinity),OPEN_WATER);

  // Rolls are pure functions of (spot, cast): the same cast twice is the same fish.
  const spot={cx:5,cz:-9};
  for(let cast=1;cast<=50;cast++){
    const a=rollSpecies(spot,cast,10,REEF),b=rollSpecies(spot,cast,10,REEF);
    assert.equal(a.id,b.id,'species roll is not deterministic');
    assert.equal(rollSize(a,spot,cast),rollSize(b,spot,cast),'size roll is not deterministic');
    assert.ok(rollSize(a,spot,cast)>=a.kg[0]&&rollSize(a,spot,cast)<=a.kg[1],'size out of range');
    assert.ok(a.level<=10,'rolled a species above the skill level');
  }
  // Reef water really is better water: more of the good fish than open sea.
  const sample=(kind,level)=>{const counts={};for(let cast=1;cast<=4000;cast++){const s=rollSpecies({cx:cast%97,cz:(cast*7)%89},cast,level,kind);counts[s.id]=(counts[s.id]||0)+1;}return counts;};
  const reef=sample(REEF,15),open=sample(OPEN_WATER,15);
  const rare=c=>((c.snapper||0)+(c.kingfish||0)+(c.sunfish||0))/4000;
  assert.ok(rare(reef)>rare(open),`reef ${rare(reef).toFixed(3)} should beat open water ${rare(open).toFixed(3)} for good fish`);
  report.rareShare={reef:+rare(reef).toFixed(3),open:+rare(open).toFixed(3)};

  // Casting needs a boat at rest.
  const state=createFishing();
  assert.equal(canCast(state,{vx:9,vz:0}),false,'cast allowed from a boat under way');
  assert.equal(canCast(state,still),true);
  assert.equal(startCast(state,{...still,vx:9},400,[]),false);
  const events=[];
  assert.equal(startCast(state,still,10,events),true);
  assert.equal(state.phase,'waiting');assert.equal(state.kind,REEF);
  assert.equal(events.at(-1).type,'cast');
  assert.equal(startCast(state,still,10,events),false,'cast twice in a row');

  // A skilful fight lands the fish and pays XP.
  const landed=fight(state,skilful);
  assert.equal(landed.phase,'landed',`a skilful fight ended ${landed.phase}`);
  assert.ok(landed.events.some(e=>e.type==='bite'));
  const catchEvent=landed.events.find(e=>e.type==='landed');
  assert.ok(catchEvent&&catchEvent.xp>0,'landing paid no xp');
  assert.equal(state.caught[catchEvent.id],1);
  assert.equal(state.best[catchEvent.id],catchEvent.kg);
  assert.ok(state.xp>0);
  report.firstCatch={id:catchEvent.id,kg:catchEvent.kg,xp:catchEvent.xp,seconds:landed.seconds};
  assert.ok(landed.seconds>3&&landed.seconds<90,`a fight took ${landed.seconds} s`);

  // Holding the reel down the whole time snaps the line — the mechanic exists.
  const greedy=createFishing();startCast(greedy,still,10,[]);
  const snapped=fight(greedy,()=>true);
  assert.equal(snapped.phase,'lost','holding the reel flat out must lose the fish');
  assert.match(snapped.events.at(-1).reason,/snapped|shook/);

  // Never reeling at all also fails, and does it by running out of patience
  // rather than by quietly landing the fish.
  const idle=createFishing();startCast(idle,still,10,[]);
  const lazy=fight(idle,()=>false,40);
  assert.notEqual(lazy.phase,'landed','doing nothing landed a fish');

  // Motoring off mid-fight loses it.
  const runner=createFishing();startCast(runner,still,10,[]);
  const running=[];
  for(let i=0;i<Math.ceil(BITE_MAX*60)+120;i++)stepFishing(runner,still,DT,skilful(runner),running);
  if(runner.phase==='fighting'){
    stepFishing(runner,{vx:9,vz:0},DT,true,running);
    assert.equal(runner.phase,'lost','motoring away kept the fish on');
    assert.equal(running.at(-1).reason,'under way');
  }

  // Skill really gates: at level 1 the big fish never appear, at 15 they do.
  let seenHigh=0;
  for(let cast=1;cast<=2000;cast++)if(rollSpecies({cx:cast,cz:cast*3},cast,1,REEF).level>1)seenHigh++;
  assert.equal(seenHigh,0,'a level-1 angler hooked a gated species');

  // Levelling up fires an event and raises the band.
  const grinder=createFishing();
  const bandBefore=tensionBand(levelForXp(grinder.xp));
  let levels=0,casts=0;
  while(levelForXp(grinder.xp)<3&&casts<400){
    casts++;grinder.phase='idle';
    if(!startCast(grinder,still,10,[]))break;
    const out=fight(grinder,skilful);
    levels+=out.events.filter(e=>e.type==='level').length;
  }
  assert.ok(levelForXp(grinder.xp)>=3,`only reached level ${levelForXp(grinder.xp)} in ${casts} casts`);
  assert.ok(levels>0,'levelling never fired an event');
  assert.ok(tensionBand(levelForXp(grinder.xp))>bandBefore,'levelling did not widen the band');
  report.castsToLevel3=casts;

  // xp scales with size within a species.
  for(const s of SPECIES)assert.ok(xpFor(s,s.kg[1])>xpFor(s,s.kg[0]),s.id+' xp does not scale with size');

  // Save round trip. The version does NOT change and an OLD save still loads.
  const exploration=createExploration();exploration.distanceM=900;
  const text=encodeSave({x:1,z:2,yaw:0},exploration,DEFAULT_SETTINGS,grinder);
  const back=decodeSave(text);
  assert.ok(back,'the save with fishing in it did not validate');
  assert.equal(back.version,1,'the save version changed — old voyages would be thrown away');
  assert.equal(back.fishing.xp,grinder.xp);
  assert.deepEqual(back.fishing.caught,grinder.caught);
  assert.deepEqual(back.fishing.best,grinder.best);
  const resumed=createFishing(back.fishing);
  assert.equal(resumed.xp,grinder.xp);
  assert.equal(levelForXp(resumed.xp),levelForXp(grinder.xp));
  assert.equal(resumed.phase,'idle','a resumed save must not be mid-cast');

  // Aaron's existing save has no `fishing` key at all. It must still load, and
  // come back as a brand-new angler rather than as a rejected save.
  const legacy=JSON.parse(text);delete legacy.fishing;
  const migrated=decodeSave(JSON.stringify(legacy));
  assert.ok(migrated,'a pre-fishing save stopped loading');
  assert.equal(migrated.fishing.xp,0);
  assert.equal(levelForXp(migrated.fishing.xp),1);
  assert.equal(migrated.distanceM,900,'migrating dropped the rest of the voyage');

  // Hostile saves cannot manufacture a level or a species.
  for(const junk of [{xp:'lots'},{xp:NaN},{xp:-9e9},{xp:1e308},{caught:{'<script>':4}},{best:{sprat:'huge'}}]){
    const dirty=JSON.parse(text);dirty.fishing={...dirty.fishing,...junk};
    const clean=decodeSave(JSON.stringify(dirty));
    assert.ok(clean,'a junk fishing block invalidated the whole save: '+JSON.stringify(junk));
    assert.ok(Number.isFinite(clean.fishing.xp)&&clean.fishing.xp>=0,'xp survived as '+clean.fishing.xp);
    assert.ok(levelForXp(clean.fishing.xp)<=MAX_LEVEL);
    for(const id of Object.keys(clean.fishing.caught))assert.ok(SPECIES.some(s=>s.id===id),'unknown species in caught: '+id);
    for(const v of Object.values(clean.fishing.best))assert.ok(Number.isFinite(v)&&v>=0);
  }

  reelIn(state);assert.equal(state.phase,'idle');
  return {...report,species:SPECIES.length,maxLevel:MAX_LEVEL,
    bandAtOne:+tensionBand(1).toFixed(3),bandAtMax:+tensionBand(MAX_LEVEL).toFixed(3),
    castSpeedLimit:CAST_SPEED,snapSeconds:SNAP_SECONDS,
    finalXp:grinder.xp,finalLevel:levelForXp(grinder.xp)};
}
