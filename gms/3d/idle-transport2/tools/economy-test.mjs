import assert from 'node:assert/strict';
import {createGame,ROUTES,REGIONS,SAVE_KEY} from '../js/economy.mjs';
const memory=()=>{const values=new Map();return {getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};};
let timestamp=1800000000000; const storage=memory();const game=createGame({storage,now:()=>timestamp});
assert.equal(REGIONS.length,5);assert.equal(ROUTES.length,15);
assert.equal(game.state.cash,0);assert.equal(game.state.routes.grain.unlocked,false);game.tick(30);assert.equal(game.state.cash,0);assert.equal(game.state.deliveries,0);
for(let i=0;i<12;i++)assert(game.action('work').ok);assert.equal(game.state.cash,60);assert(game.action('unlockRoute','grain').ok);assert.equal(game.state.cash,0);for(let i=0;i<24;i++){timestamp+=1000;game.action('work');}assert.equal(game.state.cash,120);assert.equal(game.stats('grain').progress,0);
assert.equal(game.action('fleet','grain').ok,false);assert.equal(game.state.routes.grain.fleet,1);
game.tick(4);assert.equal(game.stats('grain').progress,.5);game.tick(4);
assert.equal(game.state.deliveries,1);assert.equal(game.state.cash,138);
assert.equal(game.action('dispatch','grain').ok,true);assert.equal(game.action('dispatch','grain').ok,false);
game.tick(6);assert.equal(game.state.cash,178);assert.equal(game.state.deliveries,2);
assert.equal(game.action('unlockRegion','aerospace').ok,false);
assert.equal(game.action('claimContract','first').ok,false);
game.tick(30);assert(game.state.deliveries>=5);
assert.equal(game.action('claimContract','first').ok,true);const claimedBalance=game.state.cash;
assert.equal(game.action('claimContract','first').ok,false);assert.equal(game.state.cash,claimedBalance);
assert.equal(game.action('manager','grain').ok,true);assert.equal(game.stats('grain').automaticRate,1);
assert.equal(game.action('unlockRoute','timber').ok,true);
const snapshot=game.exportSave();const copy=createGame({storage:memory(),now:()=>timestamp});
assert.equal(copy.importSave(snapshot).ok,true);assert.equal(copy.state.cash,game.state.cash);
assert.equal(copy.importSave('{bad').ok,false);assert.equal(copy.state.cash,game.state.cash);
const invalid=JSON.parse(snapshot);invalid.cash=-2;assert.equal(copy.importSave(JSON.stringify(invalid)).ok,false);
invalid.cash=null;assert.equal(copy.importSave(JSON.stringify(invalid)).ok,false);
const malformed=JSON.parse(snapshot);malformed.unlockedRegions=['meadow','aerospace'];malformed.region='aerospace';malformed.routes.grain.fleet=99999;malformed.routes.grain.level=99999;malformed.routes.grain.progress=2;
assert.equal(copy.importSave(JSON.stringify(malformed)).ok,true);assert.deepEqual(copy.state.unlockedRegions,['meadow']);assert.equal(copy.state.region,'meadow');assert.equal(copy.state.routes.grain.fleet,30);assert.equal(copy.state.routes.grain.level,200);assert(copy.stats('grain').progress<1);
// Reload only managed routes advance, cap four hours, and credited time is saved immediately.
const before=game.state.cash,unmanaged=game.state.routes.timber.deliveries,managed=game.state.routes.grain.deliveries;
game.save();timestamp+=24*3600000;
const away=createGame({storage,now:()=>timestamp});assert.equal(away.offlineReport.seconds,14400);assert(away.state.cash>before);assert.equal(away.state.routes.timber.deliveries,unmanaged);assert(away.state.routes.grain.deliveries>managed);assert(away.offlineReport.cash<=game.stats('grain').income*14400*1.5+game.stats('grain').fullPayout);
const secondReload=createGame({storage,now:()=>timestamp});assert.equal(secondReload.state.cash,away.state.cash);assert.equal(secondReload.offlineReport.cash,0);
// Prestige resets company but preserves settings and permanent reputation.
const rich=JSON.parse(snapshot);rich.totalEarned=8000000;rich.cash=8000000;rich.unlockedRegions=['meadow','industrial','coastal','alpine'];rich.settings.quality='low';
assert.equal(copy.importSave(JSON.stringify(rich)).ok,true);assert.equal(copy.prestigeInfo().reward,2);assert.equal(copy.action('prestige').ok,true);assert.equal(copy.state.prestige,2);assert.equal(copy.state.cash,0);assert.equal(copy.state.settings.quality,'low');assert.equal(copy.state.routes.timber.unlocked,false);assert.deepEqual(copy.state.contracts,[]);
assert.equal(copy.action('research','engines').ok,false);
const oldcash=copy.state.cash;copy.tick(NaN);copy.tick(-1);assert.equal(copy.state.cash,oldcash);
assert(JSON.parse(storage.getItem(SAVE_KEY)).lastSaved===timestamp);
console.log('Economy: journeys, purchases, dispatch, contracts, validated saves, capped offline income and prestige passed.');
// Regional gates require both prior land and completed deliveries. Research effects compound.
const progression=createGame({storage:memory(),now:()=>timestamp});for(let i=0;i<12;i++)progression.action('work');assert(progression.action('unlockRoute','grain').ok);
const funded=JSON.parse(progression.exportSave());funded.cash=1e10;funded.deliveries=29;
assert(progression.importSave(JSON.stringify(funded)).ok);assert.equal(progression.action('unlockRegion','industrial').ok,false);
progression.tick(8);assert(progression.action('unlockRegion','industrial').ok);
assert.equal(progression.action('unlockRegion','coastal').ok,false);
const baseline=progression.stats('grain');assert(progression.action('research','routing').ok);assert(progression.stats('grain').duration<baseline.duration);
assert(progression.action('research','cargo').ok);assert(progression.stats('grain').fullPayout>baseline.fullPayout);
assert(progression.action('upgrade','grain').ok);assert(progression.action('fleet','grain').ok);
assert(progression.action('manager','grain').ok);assert(progression.action('research','nightshift').ok);
const longStorage=memory();longStorage.setItem(SAVE_KEY,progression.exportSave());timestamp+=86400000;
const longAway=createGame({storage:longStorage,now:()=>timestamp});assert.equal(longAway.offlineReport.seconds,28800);
console.log('Economy: region gates, compounding research and eight-hour offline research passed.');
const awake=new Map(Object.entries(longAway.state.routes).map(([id,s])=>[id,s.deliveries]));
timestamp+=999999000;const liveReport=longAway.resumeAway(999999);assert.equal(liveReport.seconds,28800);assert(liveReport.cash>0);assert.equal(longAway.state.routes.timber.deliveries,awake.get('timber'));assert.equal(longAway.resumeAway(NaN).cash,0);assert.equal(longAway.resumeAway(999999).cash,0);
const newGame=createGame({storage:memory(),now:()=>timestamp});assert.equal(newGame.action('unlockRoute','steel').ok,false);
const fundedResearch=JSON.parse(newGame.exportSave());fundedResearch.cash=1000000;assert(newGame.importSave(JSON.stringify(fundedResearch)).ok);
assert(newGame.action('research','routing').ok);const beforeEngine=newGame.stats('grain').duration,beforeEngineCash=newGame.state.cash;
assert(newGame.action('research','engines').ok);assert(newGame.stats('grain').duration<beforeEngine);assert.equal(beforeEngineCash-newGame.state.cash,260000);
console.log('Economy: live suspension resume and positive prerequisite research passed.');

// Opportunities require a company, use injected random, expire, and pay once.
const events=createGame({storage:memory(),now:()=>timestamp,random:()=>0});events.tick(60);assert.equal(events.state.event,null);
for(let i=0;i<12;i++)events.action('work');events.action('unlockRoute','grain');events.tick(44);assert.equal(events.state.event,null);events.tick(1);assert.equal(events.state.event.kind,'rush');assert.equal(events.state.event.remaining,25);
const reward=events.state.event.reward,beforeReward=events.state.cash;assert(events.action('claimEvent').ok);assert.equal(events.state.cash,beforeReward+reward);assert.equal(events.action('claimEvent').ok,false);
events.tick(60);events.tick(20);assert(events.state.event);events.tick(25);assert.equal(events.state.event,null);const expireBalance=events.state.cash;assert.equal(events.action('claimEvent').ok,false);assert.equal(events.state.cash,expireBalance);
const stopped=JSON.parse(events.exportSave());stopped.routes.grain.unlocked=false;assert(events.importSave(JSON.stringify(stopped)).ok);assert.equal(events.state.routes.grain.unlocked,false);
const noCompany=createGame({storage:memory(),now:()=>timestamp});assert.equal(noCompany.resumeAway(14400).cash,0);assert.equal(noCompany.state.event,null);
console.log('Economy: zero-cash work bootstrap, persisted closed routes, random opportunities/expiry/single claim and no offline events passed.');
// Operating policy is queued and cannot change the current cargo's fare.
const policies=createGame({storage:memory(),now:()=>timestamp});for(let i=0;i<12;i++)policies.action('work');policies.action('unlockRoute','grain');policies.tick(4);
const oldFare=policies.stats('grain').payout;assert(policies.action('policy','grain:heavy').ok);assert.equal(policies.stats('grain').policy,'steady');assert.equal(policies.stats('grain').queuedPolicy,'heavy');const policyCash=policies.state.cash;policies.tick(4);assert.equal(policies.state.cash-policyCash,oldFare);assert.equal(policies.stats('grain').policy,'heavy');assert.equal(policies.stats('grain').duration,10.4);assert.equal(policies.stats('grain').fullPayout,64);
assert(policies.action('policy','grain:express').ok);assert(policies.action('policy','grain:heavy').ok);assert.equal(policies.stats('grain').queuedPolicy,null);
assert.equal(policies.action('policy','grain:invalid').ok,false);assert.equal(policies.action('policy','steel:heavy').ok,false);
let masteryNotices=0;policies.subscribe(e=>{if(e.type==='mastery')masteryNotices++;});
const nine=JSON.parse(policies.exportSave());nine.routes.grain.deliveries=9;nine.routes.grain.progress=0;nine.deliveries=9;assert(policies.importSave(JSON.stringify(nine)).ok);assert.equal(policies.stats('grain').masteryLevel,0);policies.tick(10.4);assert.equal(policies.stats('grain').masteryLevel,1);assert.equal(policies.stats('grain').masteryBonus,.1);assert.equal(policies.stats('grain').nextMastery,50);assert.equal(masteryNotices,1);policies.tick(1);assert.equal(masteryNotices,1);
const migrated=JSON.parse(policies.exportSave());delete migrated.routes.grain.policy;delete migrated.routes.grain.queuedPolicy;migrated.routes.grain.deliveries=500;assert(policies.importSave(JSON.stringify(migrated)).ok);assert.equal(policies.stats('grain').policy,'steady');assert.equal(policies.stats('grain').masteryBonus,.5);assert.equal(policies.stats('grain').nextMastery,null);assert.equal(policies.stats('grain').masteryProgress,1);
// Combo is transient, capped at 20 / 2x and resets after 900 milliseconds.
const tapping=createGame({storage:memory(),now:()=>timestamp});for(let i=0;i<12;i++){const work=tapping.action('work');assert.equal(work.earned,5);assert.equal(work.combo,0);}assert.equal(tapping.state.cash,60);tapping.action('unlockRoute','grain');
let latest;for(let i=0;i<40;i++){timestamp+=100;latest=tapping.action('work');}assert.equal(latest.combo,20);assert.equal(latest.multiplier,2);assert.equal(latest.earned,10);assert.equal(tapping.tapInfo().combo,20);
timestamp+=901;assert.equal(tapping.tapInfo().combo,0);assert.equal(tapping.action('work').multiplier,1);
const tapSave=JSON.parse(tapping.exportSave());tapSave.cash=1000000;assert(tapping.importSave(JSON.stringify(tapSave)).ok);assert.equal(tapping.tapInfo().combo,0);assert(tapping.action('research','tap-tools').ok);timestamp+=1000;assert.equal(tapping.action('work').earned,10);assert(tapping.action('research','precision-loaders').ok);timestamp+=1000;assert.equal(tapping.action('work').earned,20);
console.log('Economy: queued operating policies, mastery awards/migration, capped transient combos and tap research passed.');
// Production/storage/fleet/manager bulk quotes buy only affordable capped quantities.
const tracks=createGame({storage:memory(),now:()=>timestamp});for(let i=0;i<12;i++)tracks.action('work');tracks.action('unlockRoute','grain');
const trackSave=JSON.parse(tracks.exportSave());trackSave.cash=1e8;assert(tracks.importSave(JSON.stringify(trackSave)).ok);
const bulkQuote=tracks.quote('production','grain',10),beforeBulk=tracks.state.cash;assert.equal(bulkQuote.count,10);const bought=tracks.action('production','grain',10);assert.equal(bought.count,10);assert.equal(beforeBulk-tracks.state.cash,bulkQuote.cost);assert.equal(tracks.stats('grain').productionLevel,11);
const oldCapacity=tracks.stats('grain').capacity,oldPayout=tracks.stats('grain').fullPayout;assert.equal(tracks.action('storage','grain',10).count,10);assert(tracks.stats('grain').capacity>oldCapacity);assert(tracks.stats('grain').fullPayout>oldPayout);assert(tracks.stats('grain').stockRatio<=1);assert(tracks.stats('grain').productionRate>0);
assert.equal(tracks.action('manager','grain','max').count,5);assert.equal(tracks.stats('grain').managerSlots,3);assert.equal(tracks.action('manager','grain').ok,false);assert.equal(tracks.action('fleet','grain',10).count,10);assert.equal(tracks.state.routes.grain.fleet,11);
const expensive=JSON.parse(tracks.exportSave());expensive.cash=10;assert(tracks.importSave(JSON.stringify(expensive)).ok);assert.equal(tracks.quote('production','grain','max').count,0);assert.equal(tracks.action('production','grain','max').ok,false);
// Halloween practice is a real parallel idle challenge; tools pay once across runs.
const halloween=createGame({storage:memory(),now:()=>timestamp});assert(halloween.seasonInfo().practiceAvailable);assert.equal(halloween.action('seasonTap').ok,false);assert(halloween.action('seasonStart').ok);assert.equal(halloween.state.season.run.remaining,480);assert.equal(halloween.action('seasonStart').ok,false);
let seasonalSeconds=0;for(;seasonalSeconds<480;seasonalSeconds++){
  halloween.tick(1);for(let taps=0;taps<2;taps++)halloween.action('seasonTap');
  halloween.action('seasonUnlock','candy');halloween.action('seasonUnlock','ghost');
  for(const id of ['pumpkins','candy','ghost'])halloween.action('seasonUpgrade',id);
  for(const id of ['harvest','lantern','moon','treats','midnight','festival'])halloween.action('seasonClaim',id);
}
assert.equal(halloween.state.season.run.remaining,0);assert(halloween.state.season.run.businesses.candy.unlocked);assert(halloween.state.season.run.businesses.ghost.unlocked);assert.equal(halloween.state.inventory.length,6);assert.equal(halloween.state.cash,0);assert.equal(halloween.action('seasonTap').ok,false);assert.equal(halloween.action('seasonClaim','harvest').ok,false);
assert(halloween.action('seasonStart').ok);assert.equal(halloween.state.inventory.length,6);for(let i=0;i<35;i++)halloween.action('seasonTap');assert.equal(halloween.action('seasonClaim','harvest').ok,false);assert.equal(halloween.state.inventory.length,6);
// Equipment moves between routes and cannot stack duplicate copies; slots enforce category/capacity.
for(let i=0;i<36;i++)halloween.action('work');halloween.action('unlockRoute','grain');const equipSave=JSON.parse(halloween.exportSave());equipSave.cash=1e8;assert(halloween.importSave(JSON.stringify(equipSave)).ok);halloween.action('unlockRoute','timber');halloween.action('manager','grain');halloween.action('manager','timber');
const cleanPayout=halloween.stats('grain').fullPayout;assert(halloween.action('equip','pumpkin-crate|business:grain').ok);assert(halloween.stats('grain').fullPayout>cleanPayout);assert.equal(halloween.action('equip','pumpkin-crate|business:grain').ok,false);assert(halloween.action('equip','pumpkin-crate|business:timber').ok);assert.equal(halloween.state.equipment.businesses.grain.length,0);assert.deepEqual(halloween.state.equipment.businesses.timber,['pumpkin-crate']);assert(halloween.action('detach','pumpkin-crate').ok);assert.equal(halloween.state.equipment.businesses.timber.length,0);
assert.equal(halloween.action('equip','pumpkin-crate|character').ok,false);assert(halloween.action('equip','lantern-gloves|manager:grain').ok);assert.equal(halloween.action('equip','witch-clock|manager:grain').ok,false);halloween.action('manager','grain',10);assert(halloween.action('equip','witch-clock|manager:grain').ok);assert(halloween.action('equip','moon-compass|character').ok);
const preserved=JSON.parse(halloween.exportSave());preserved.totalEarned=2e6;preserved.unlockedRegions=['meadow','industrial','coastal','alpine'];assert(halloween.importSave(JSON.stringify(preserved)).ok);assert(halloween.action('prestige').ok);assert.equal(halloween.state.inventory.length,6);assert.deepEqual(halloween.state.equipment.character,['moon-compass']);assert.deepEqual(halloween.state.equipment.managers,{});assert.equal(halloween.state.season.claimedRewards.length,6);
// Offline time ends season without producing treat coins; save migration sanitizes new tracks/tools.
const seasonalStorage=memory();const seasonalOffline=createGame({storage:seasonalStorage,now:()=>timestamp});seasonalOffline.action('seasonStart');seasonalOffline.save();timestamp+=3600000;const reloadSeason=createGame({storage:seasonalStorage,now:()=>timestamp});assert.equal(reloadSeason.state.season.run.remaining,0);assert.equal(reloadSeason.state.season.run.coins,0);assert.equal(reloadSeason.state.inventory.length,0);
const malformedTracks=JSON.parse(tracks.exportSave());malformedTracks.routes.grain.storageLevel=999;malformedTracks.routes.grain.managerLevel=999;malformedTracks.inventory=['bogus'];malformedTracks.equipment={character:['bogus'],businesses:{grain:['bogus']},managers:{grain:['bogus']}};assert(tracks.importSave(JSON.stringify(malformedTracks)).ok);assert.equal(tracks.stats('grain').storageLevel,50);assert.equal(tracks.stats('grain').managerLevel,5);assert.deepEqual(tracks.state.inventory,[]);assert.deepEqual(tracks.state.equipment.character,[]);
console.log('Economy: capped bulk tracks, eight-minute three-business challenge, permanent unique tools, equipment movement, slots, prestige preservation and offline exclusion passed.');
// Short background intervals expire seasonal clock; each interval is consumed once.
const shortAway=createGame({storage:memory(),now:()=>timestamp});shortAway.action('seasonStart');for(let i=0;i<5;i++){timestamp+=4000;shortAway.resumeAway(4);}assert.equal(shortAway.state.season.run.remaining,460);shortAway.resumeAway(4);assert.equal(shortAway.state.season.run.remaining,460);
// Storage failures update availability, warn once per outage, and recover on success.
let failWrites=false,warnings=0;const flaky={getItem:()=>null,setItem:()=>{if(failWrites)throw new Error('quota');}};const persistence=createGame({storage:flaky,now:()=>timestamp});persistence.subscribe(e=>{if(e.type==='warning')warnings++;});assert(persistence.persistenceAvailable);failWrites=true;assert.equal(persistence.save(),false);assert.equal(persistence.persistenceAvailable,false);persistence.save();persistence.action('work');assert.equal(warnings,1);failWrites=false;assert(persistence.save());assert(persistence.persistenceAvailable);failWrites=true;persistence.save();assert.equal(warnings,2);
// An overflow tool on a level-one manager remains available at another valid manager.
const overflow=JSON.parse(halloween.exportSave());overflow.cash=1e6;overflow.routes.grain.unlocked=true;overflow.routes.grain.manager=true;overflow.routes.grain.managerLevel=1;overflow.routes.timber.unlocked=true;overflow.routes.timber.manager=true;overflow.routes.timber.managerLevel=1;overflow.equipment={character:[],businesses:{},managers:{grain:['lantern-gloves','witch-clock'],timber:['witch-clock']}};assert(halloween.importSave(JSON.stringify(overflow)).ok);assert.deepEqual(halloween.state.equipment.managers.grain,['lantern-gloves']);assert.deepEqual(halloween.state.equipment.managers.timber,['witch-clock']);
console.log('Economy: short-away countdown, idempotence, persistence failure/recovery warnings and overflow item normalization passed.');
// Bin drains during the visible loading phase and fills while that lead truck is away.
const bin=createGame({storage:memory(),now:()=>timestamp});for(let i=0;i<12;i++)bin.action('work');bin.action('unlockRoute','grain');const fullBin=bin.stats('grain').stockRatio;assert.equal(fullBin,1);bin.tick(.18*8);const departedBin=bin.stats('grain').stockRatio;assert(Math.abs(departedBin-.5)<1e-9);bin.tick(.4*8);const harvestingBin=bin.stats('grain').stockRatio;assert(harvestingBin>departedBin);assert(harvestingBin<fullBin);assert.equal(bin.state.cash,0);
const binSave=JSON.parse(bin.exportSave());binSave.cash=100000;assert(bin.importSave(JSON.stringify(binSave)).ok);const smallCapacity=bin.stats('grain').capacity,smallFare=bin.stats('grain').fullPayout;assert(bin.action('storage','grain',10).ok);assert(bin.stats('grain').capacity>smallCapacity);assert(bin.stats('grain').fullPayout>smallFare);assert(bin.stats('grain').stockRatio>harvestingBin);const beforeLevelDuration=bin.stats('grain').duration;assert(bin.action('production','grain').ok);assert(bin.stats('grain').duration<beforeLevelDuration);
console.log('Economy: loading drain, away harvest refill, storage reserve/fare and production duration linkage passed.');
// Character keepsakes benefit both games; scoped business/manager tools do not leak into season.
const shared=JSON.parse(halloween.exportSave());shared.season.run=null;shared.equipment={character:[],businesses:{},managers:{}};shared.routes.grain.unlocked=true;shared.routes.grain.manager=true;shared.routes.grain.managerLevel=1;assert(halloween.importSave(JSON.stringify(shared)).ok);assert(halloween.action('seasonStart').ok);const untooledSeason=halloween.seasonStats('pumpkins').payout;assert(halloween.action('equip','moon-compass|character').ok);assert(Math.abs(halloween.seasonStats('pumpkins').payout-untooledSeason*1.08)<1e-9);assert(halloween.action('equip','midnight-badge|character').ok);assert(Math.abs(halloween.seasonStats('pumpkins').payout-untooledSeason*1.2)<1e-9);assert(halloween.action('equip','pumpkin-crate|business:grain').ok);assert(halloween.action('equip','lantern-gloves|manager:grain').ok);assert(Math.abs(halloween.seasonStats('pumpkins').payout-untooledSeason*1.2)<1e-9);assert(halloween.action('detach','moon-compass').ok);assert(Math.abs(halloween.seasonStats('pumpkins').payout-untooledSeason*1.12)<1e-9);
console.log('Economy: character tools apply across network and seasonal businesses; scoped tools stay on their route.');
