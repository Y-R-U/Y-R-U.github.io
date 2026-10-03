import {createGame,ROUTES,REGIONS,RESEARCH,CONTRACTS} from '../js/economy.mjs';
const game=createGame({storage:null});
for(let tap=0;tap<12;tap++)game.action('work');game.action('unlockRoute','grain');
const reached=new Set(['meadow']);
let finish=0;
for(let seconds=1;seconds<=86400;seconds++) {
  game.tick(1);
  for(const contract of CONTRACTS) {const status=game.contractStatus(contract.id);if(status.complete&&!status.claimed)game.action('claimContract',contract.id);}
  for(const region of REGIONS) {
    if(!game.state.unlockedRegions.includes(region.id)&&game.action('unlockRegion',region.id).ok) {reached.add(region.id);console.log(`${region.name}: ${(seconds/60).toFixed(1)} minutes, $${Math.round(game.state.cash)}, ${game.state.deliveries} deliveries`);}
  }
  for(const route of ROUTES) {
    const s=game.state.routes[route.id];
    if(!s.unlocked&&game.state.unlockedRegions.includes(route.region))game.action('unlockRoute',route.id);
    if(!s.unlocked)continue;
    if(!s.manager)game.action('manager',route.id);
  }
  for(const tech of RESEARCH)if(!game.state.research.includes(tech.id))game.action('research',tech.id);
  for(const route of ROUTES) {
    const s=game.state.routes[route.id];if(!s.unlocked)continue;
    if(s.level<25)game.action('upgrade',route.id);
    if(s.fleet<5)game.action('fleet',route.id);
  }
  if(ROUTES.every(r=>game.state.routes[r.id].unlocked)){finish=seconds;break;}
}
console.log(`All routes: ${finish?(finish/60).toFixed(1):'>1440'} minutes. Policy: no dispatch, immediate contracts/permits/routes/managers/research, upgrades to 25, fleet to 5; this is an optimistic automated benchmark.`);
