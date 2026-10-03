export const SAVE_KEY = 'idle-transport2-v1';
export const POLICIES = [
  {id:'steady',name:'Steady',description:'Balanced journey time and fare.',speedFactor:1,fareFactor:1},
  {id:'express',name:'Express',description:'20% shorter journeys, 15% lower fares.',speedFactor:.8,fareFactor:.85},
  {id:'heavy',name:'Heavy haul',description:'30% longer journeys, 60% higher fares.',speedFactor:1.3,fareFactor:1.6}
];
const MASTERY = [{deliveries:10,bonus:.1},{deliveries:50,bonus:.2},{deliveries:150,bonus:.3},{deliveries:500,bonus:.5}];
export const ITEMS = [
  {id:'pumpkin-crate',name:'Pumpkin crate',slot:'business',bonus:.08,description:'Assigned business fares +8%.'},
  {id:'lantern-gloves',name:'Lantern gloves',slot:'manager',bonus:.08,description:'Assigned manager fares +8%.'},
  {id:'moon-compass',name:'Moon compass',slot:'character',bonus:.08,description:'All network and seasonal fares +8%.'},
  {id:'candy-pallet',name:'Candy pallet',slot:'business',bonus:.12,description:'Assigned business fares +12%.'},
  {id:'witch-clock',name:'Witch clock',slot:'manager',bonus:.12,description:'Assigned manager fares +12%.'},
  {id:'midnight-badge',name:'Midnight badge',slot:'character',bonus:.12,description:'All network and seasonal fares +12%.'}
];
export const SEASON_BUSINESSES = [
  {id:'pumpkins',name:'Pumpkin patch',cargo:'Pumpkins',unlockCost:0,baseCost:10,baseEarn:3,baseTime:8,color:'#ed963b'},
  {id:'candy',name:'Candy kitchen',cargo:'Treats',unlockCost:25,baseCost:20,baseEarn:7,baseTime:6,color:'#d990e9'},
  {id:'ghost',name:'Ghost freight',cargo:'Spooky parcels',unlockCost:120,baseCost:45,baseEarn:22,baseTime:10,color:'#a6dfc3'}
];
export const SEASON_MILESTONES = [
  {id:'harvest',name:'First harvest',target:30,item:'pumpkin-crate'},
  {id:'lantern',name:'Lantern route',target:100,item:'lantern-gloves'},
  {id:'moon',name:'Moonlit convoy',target:300,item:'moon-compass'},
  {id:'treats',name:'Treat delivery',target:900,item:'candy-pallet'},
  {id:'midnight',name:'Midnight service',target:2200,item:'witch-clock'},
  {id:'festival',name:'Festival operator',target:5000,item:'midnight-badge'}
];
for(const milestone of SEASON_MILESTONES){const item=ITEMS.find(i=>i.id===milestone.item);milestone.description=`Earn ${milestone.target.toLocaleString('en-US')} shift coins for ${item.name}. ${item.description}`;}
const freshSeason=()=>({run:null,claimedRewards:[],runs:0});
const newSeasonRun=()=>({remaining:480,coins:0,totalEarned:0,businesses:Object.fromEntries(SEASON_BUSINESSES.map((b,i)=>[b.id,{unlocked:i===0,level:1,progress:0}])),claimed:[]});
export const REGIONS = [
  {id:'meadow',name:'Meadow County',subtitle:'Farm roads & first deliveries',color:'#b9d674',unlockCost:0,requireDeliveries:0},
  {id:'industrial',name:'Ironworks Basin',subtitle:'Heavy industry, bigger ambitions',color:'#f3a465',unlockCost:3600,requireDeliveries:30},
  {id:'coastal',name:'Sapphire Coast',subtitle:'Container ports & offshore energy',color:'#6dc8df',unlockCost:120000,requireDeliveries:180},
  {id:'alpine',name:'Alpine Frontier',subtitle:'High passes & precision logistics',color:'#b6c9ee',unlockCost:80000000,requireDeliveries:900},
  {id:'aerospace',name:'Orbital Gateway',subtitle:'From express freight to the stars',color:'#c7a1ef',unlockCost:12000000000,requireDeliveries:4000}
];
const route = (id,region,name,cargo,from,to,color,kind,unlockCost,baseCost,baseEarn,baseTime) => ({id,region,name,cargo,from,to,color,kind,unlockCost,baseCost,baseEarn,baseTime});
export const ROUTES = [
  route('grain','meadow','Golden Harvest','Grain','Sunrise Farm','County Mill','#e7c562','farm',60,50,40,8),
  route('timber','meadow','Timber Trail','Timber','Pine Hollow','Lumber Yard','#b9d674','timber',180,120,110,12),
  route('stone','meadow','Stone Run','Aggregate','Redrock Quarry','County Depot','#d6ab81','quarry',650,260,240,15),
  route('steel','industrial','Steel Circuit','Steel','Ironworks','Rail Terminal','#ed975c','factory',2600,650,720,16),
  route('machinery','industrial','Machine Express','Machinery','Assembly Hall','Industrial Park','#f4c25c','factory',7200,1800,1650,19),
  route('fuel','industrial','Refinery Link','Fuel','West Refinery','Tank Farm','#df8d71','oil',16000,4200,3500,23),
  route('containers','coastal','Harbor Shuttle','Containers','Sapphire Port','Inland Hub','#69c6d9','harbor',65000,8000,7000,22),
  route('offshore','coastal','Offshore Supply','Equipment','Dock Nine','Offshore Depot','#72b2ed','oil',190000,19000,16000,28),
  route('ferry','coastal','Island Freight','Island supplies','Bluewater Ferry','Island Market','#83d9c2','harbor',450000,42000,34000,32),
  route('summit','alpine','Summit Supply','Construction','Valley Depot','Summit Works','#b9cdef','alpine',30000000,78000,65000,30),
  route('crystal','alpine','Crystal Pass','Rare minerals','Glacier Mine','Research Campus','#a5d8dd','quarry',60000000,165000,135000,36),
  route('resort','alpine','Aurora Express','Premium freight','Mountain Hub','Aurora Resort','#d7b9e4','alpine',150000000,340000,280000,40),
  route('airfreight','aerospace','Skybridge Cargo','Air freight','Cargo Airport','Global Terminal','#a9c8f5','airport',3000000000,600000,510000,38),
  route('precision','aerospace','Precision Corridor','Flight systems','Aero Campus','Hangar Twelve','#c7b0ed','airport',6000000000,1300000,1100000,44),
  route('orbital','aerospace','Orbital Supply','Rocket components','Launch Assembly','Orbital Pad','#e1b8ef','space',15000000000,2800000,2400000,50)
];
export const RESEARCH = [
  {id:'tap-tools',name:'Loading tools',description:'Manual loading taps earn twice as much.',cost:1200},
  {id:'precision-loaders',name:'Precision loaders',description:'Manual loading taps earn another 2×.',cost:120000,requires:'tap-tools'},
  {id:'routing',name:'Smart routing',description:'All journeys are 15% faster.',cost:900},
  {id:'cargo',name:'Cargo handling',description:'All fares increase by 25%.',cost:3500},
  {id:'fleet',name:'Fleet purchasing',description:'New vehicles cost 20% less.',cost:14000},
  {id:'contracts',name:'Priority logistics',description:'All fares increase by another 35%.',cost:65000,requires:'cargo'},
  {id:'engines',name:'Efficient engines',description:'Journeys are another 20% faster.',cost:260000,requires:'routing'},
  {id:'nightshift',name:'Night shift',description:'Managed offline earnings last 8 hours instead of 4.',cost:650000},
  {id:'automation',name:'Predictive loading',description:'Unmanaged automatic fare rises from 45% to 70%.',cost:1800000},
  {id:'orbital',name:'Orbital scheduling',description:'All fares increase by another 50%.',cost:9000000,requires:'contracts'}
];
export const CONTRACTS = [
  {id:'first',name:'First mile',description:'Complete 5 deliveries.',type:'deliveries',target:5,reward:200},
  {id:'convoy',name:'Build a convoy',description:'Own 4 vehicles across your routes.',type:'fleet',target:4,reward:600},
  {id:'county',name:'County operator',description:'Complete 30 deliveries.',type:'deliveries',target:30,reward:2000},
  {id:'manager',name:'Take the wheel',description:'Hire 3 route managers.',type:'managers',target:3,reward:4500},
  {id:'industry',name:'Industrial arrival',description:'Unlock 2 regions.',type:'regions',target:2,reward:8500},
  {id:'hundred',name:'Century club',description:'Complete 100 deliveries.',type:'deliveries',target:100,reward:16000},
  {id:'coast',name:'Coast to coast',description:'Unlock 3 regions.',type:'regions',target:3,reward:60000},
  {id:'network',name:'Connected network',description:'Open 9 routes.',type:'routes',target:9,reward:180000},
  {id:'thousand',name:'Thousand mile story',description:'Complete 1,000 deliveries.',type:'deliveries',target:1000,reward:650000},
  {id:'world',name:'Beyond the horizon',description:'Unlock all 5 regions.',type:'regions',target:5,reward:2400000},
  {id:'complete',name:'Logistics empire',description:'Open every route.',type:'routes',target:15,reward:10000000}
];
const MAX = 1e100;
const number = (value, fallback=0, max=MAX) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(max,value) : fallback;
const fresh = (timestamp=Date.now()) => ({version:1,cash:0,totalEarned:0,deliveries:0,prestige:0,region:'meadow',unlockedRegions:['meadow'],routes:Object.fromEntries(ROUTES.map((r,i)=>[r.id,{unlocked:false,level:1,fleet:1,manager:false,progress:0,deliveries:0,attended:false,policy:'steady',queuedPolicy:null,storageLevel:0,managerLevel:0}])),research:[],contracts:[],settings:{quality:'high',sound:false},lastSaved:timestamp,event:null,eventTimer:45,eventsServed:0,workCount:0,inventory:[],equipment:{character:[],businesses:{},managers:{}},season:freshSeason()});
function normalize(raw,timestamp=Date.now()) {
  if (!raw || raw.version!==1 || !raw.routes || typeof raw.routes!=='object') throw new Error('This is not an Idle Transport 2 save.');
  const out=fresh(timestamp);
  for(const key of ['cash','totalEarned','deliveries','prestige']) {
    if(!Number.isFinite(raw[key]) || raw[key]<0) throw new Error('Save contains an invalid balance.');
    out[key]=number(raw[key]);
  }
  out.deliveries=Math.floor(out.deliveries); out.prestige=Math.min(1000000,Math.floor(out.prestige));
  out.unlockedRegions=['meadow'];
  for(const region of REGIONS.slice(1)) {if(!Array.isArray(raw.unlockedRegions)||!raw.unlockedRegions.includes(region.id))break;out.unlockedRegions.push(region.id);}
  out.region=out.unlockedRegions.includes(raw.region)?raw.region:'meadow';
  out.research=[];for(const research of RESEARCH)if(Array.isArray(raw.research)&&raw.research.includes(research.id)&&(!research.requires||out.research.includes(research.requires)))out.research.push(research.id);
  out.contracts=CONTRACTS.filter(c=>raw.contracts?.includes(c.id)).map(c=>c.id);
  for(const r of ROUTES) {
    const s=raw.routes[r.id]||{};
    out.routes[r.id]={unlocked:s.unlocked===true&&out.unlockedRegions.includes(r.region),level:Math.max(1,Math.floor(number(s.level,1,200))),fleet:Math.max(1,Math.floor(number(s.fleet,1,30))),manager:s.manager===true,progress:number(s.progress,0,.999999),deliveries:Math.floor(number(s.deliveries)),storageLevel:Math.floor(number(s.storageLevel,0,50)),managerLevel:s.manager===true?Math.max(1,Math.floor(number(s.managerLevel,1,5))):0,attended:s.attended===true,policy:POLICIES.some(p=>p.id===s.policy)?s.policy:'steady',queuedPolicy:POLICIES.some(p=>p.id===s.queuedPolicy)&&s.queuedPolicy!==s.policy?s.queuedPolicy:null};
  }
  out.settings={quality:['high','medium','low'].includes(raw.settings?.quality)?raw.settings.quality:'high',sound:raw.settings?.sound===true};
  out.lastSaved=number(raw.lastSaved,timestamp,timestamp);
  out.eventTimer=Math.max(1,number(raw.eventTimer,45,140));out.eventsServed=Math.floor(number(raw.eventsServed,0,100000000));out.workCount=Math.floor(number(raw.workCount,0));
  const e=raw.event;if(e&&['rush','backhaul','supply'].includes(e.kind)&&typeof e.id==='string'&&e.id.length<60&&Number.isFinite(e.reward)&&e.reward>=0&&Number.isFinite(e.remaining)&&e.remaining>0)out.event={id:e.id,kind:e.kind,title:{rush:'Rush order',backhaul:'Backhaul opportunity',supply:'Supply bonus'}[e.kind],description:'A partner has a bonus job for your transport company.',reward:number(e.reward,0,MAX),remaining:number(e.remaining,0,25)};
  out.inventory=ITEMS.filter(i=>Array.isArray(raw.inventory)&&raw.inventory.includes(i.id)).map(i=>i.id);
  out.season.claimedRewards=SEASON_MILESTONES.filter(m=>raw.season?.claimedRewards?.includes?.(m.id)||out.inventory.includes(m.item)).map(m=>m.id);
  for(const m of SEASON_MILESTONES)if(out.season.claimedRewards.includes(m.id)&&!out.inventory.includes(m.item))out.inventory.push(m.item);
  out.season.runs=Math.floor(number(raw.season?.runs,0,100000000));
  const run=raw.season?.run;
  if(run&&typeof run==='object'){
    out.season.run=newSeasonRun();const target=out.season.run;target.remaining=Math.max(0,number(run.remaining,0,480)-Math.max(0,(timestamp-out.lastSaved)/1000));target.coins=number(run.coins);target.totalEarned=number(run.totalEarned);
    target.claimed=SEASON_MILESTONES.filter(m=>Array.isArray(run.claimed)&&run.claimed.includes(m.id)).map(m=>m.id);
    for(const b of SEASON_BUSINESSES){const value=run.businesses?.[b.id]||{};target.businesses[b.id]={unlocked:b.id==='pumpkins'||value.unlocked===true,level:Math.max(1,Math.floor(number(value.level,1,50))),progress:number(value.progress,0,.999999)};}
    if(!target.businesses.candy.unlocked)target.businesses.ghost.unlocked=false;
  }
  const used=new Set();
  function equipList(values,slot,limit){const result=[];if(!Array.isArray(values))return result;for(const id of values){if(result.length>=limit)break;const item=ITEMS.find(i=>i.id===id);if(!item||item.slot!==slot||!out.inventory.includes(id)||used.has(id))continue;used.add(id);result.push(id);}return result;}
  out.equipment.character=equipList(raw.equipment?.character,'character',2);
  for(const r of ROUTES){if(!out.routes[r.id].unlocked)continue;out.equipment.businesses[r.id]=equipList(raw.equipment?.businesses?.[r.id],'business',2);if(out.routes[r.id].manager)out.equipment.managers[r.id]=equipList(raw.equipment?.managers?.[r.id],'manager',Math.min(3,1+Math.floor((out.routes[r.id].managerLevel-1)/2)));}
  return out;
}
export function createGame(options={}) {
  let storage=options.storage;
  if(storage===undefined) { try {storage=globalThis.localStorage;} catch {} }
  const now=options.now||(()=>Date.now());
  const random=options.random||Math.random;
  let persistenceAvailable=!!storage,persistenceWarned=false;
  const listeners=new Set(), cooldowns={};
  let lastTap=-Infinity,tapCombo=0;
  let state=fresh(now()), saveTimer=0, offlineReport={seconds:0,cash:0,deliveries:0};
  const emit=(type,message,extra={})=>{for(const fn of listeners)fn({type,message,...extra});};
  const has=id=>state.research.includes(id);
  const price=x=>Math.min(MAX,Math.ceil(x));
  const toolBonus=ids=>(ids||[]).reduce((sum,id)=>sum+(ITEMS.find(i=>i.id===id)?.bonus||0),0);
  const stats=id=>{
    const r=ROUTES.find(r=>r.id===id),s=state.routes[id]; if(!r||!s)return null;
    const policy=POLICIES.find(p=>p.id===s.policy)||POLICIES[0],masteryLevel=MASTERY.filter(m=>s.deliveries>=m.deliveries).length,masteryBonus=masteryLevel?MASTERY[masteryLevel-1].bonus:0,nextMastery=MASTERY[masteryLevel]?.deliveries||null,previousMastery=masteryLevel?MASTERY[masteryLevel-1].deliveries:0;
    const duration=policy.speedFactor*r.baseTime*(has('routing')?.85:1)*(has('engines')?.8:1)/(1+Math.min(199,s.level-1)*.018);
    const fullPayout=Math.min(MAX,r.baseEarn*(1+s.storageLevel*.08)*(1+Math.max(0,s.managerLevel-1)*.05)*(1+toolBonus(state.equipment.character)+toolBonus(state.equipment.businesses[id])+toolBonus(state.equipment.managers[id]))*policy.fareFactor*(1+masteryBonus)*Math.pow(1.12,s.level-1)*s.fleet*(1+state.prestige*.15)*(has('cargo')?1.25:1)*(has('contracts')?1.35:1)*(has('orbital')?1.5:1));
    const automaticRate=s.manager?1:has('automation')?.7:.45;
    return {productionLevel:s.level,storageLevel:s.storageLevel,capacity:s.fleet*(2+s.storageLevel*.5),stockRatio:(1+s.storageLevel*.5+(s.progress<.18?1-s.progress/.18:(s.progress-.18)/.82))/(2+s.storageLevel*.5),productionRate:s.fleet/duration,storageCost:price(r.baseCost*2*Math.pow(1.32,s.storageLevel)),managerLevel:s.managerLevel,managerSlots:s.manager?Math.min(3,1+Math.floor((s.managerLevel-1)/2)):0,managerUpgradeCost:price(r.baseCost*5*Math.pow(2.3,s.managerLevel)),income:s.unlocked?fullPayout*automaticRate/duration:0,payout:fullPayout*(s.manager||s.attended?1:automaticRate),fullPayout,duration,upgradeCost:price(r.baseCost*Math.pow(1.28,s.level-1)),fleetCost:price(r.baseCost*3*Math.pow(1.7,s.fleet-1)*(has('fleet')?.8:1)),managerCost:price(r.baseCost*5),progress:s.progress,active:s.unlocked,dispatchReady:!cooldowns[id],automaticRate,policy:policy.id,policyName:policy.name,queuedPolicy:s.queuedPolicy,masteryLevel,masteryBonus,nextMastery,masteryProgress:nextMastery?Math.max(0,Math.min(1,(s.deliveries-previousMastery)/(nextMastery-previousMastery))):1};
  };
  function advance(dt,offline=false) {
    for(const r of ROUTES) {
      const s=state.routes[r.id];if(!s.unlocked||(offline&&!s.manager))continue;
      let remaining=dt;
      while(remaining>1e-9) {
        const info=stats(r.id),position=s.progress+remaining/info.duration,possible=Math.floor(position);
        if(possible<1){s.progress=position;break;}
        const count=Math.min(possible,s.queuedPolicy?1:Infinity,info.nextMastery?info.nextMastery-s.deliveries:Infinity);
        remaining=Math.max(0,remaining-(count-s.progress)*info.duration);s.progress=0;
        const base=info.fullPayout*info.automaticRate,earned=Math.min(MAX,base*count+(s.attended&&!s.manager?info.fullPayout-base:0));
        s.attended=false;s.deliveries=Math.min(MAX,s.deliveries+count);state.deliveries=Math.min(MAX,state.deliveries+count);state.cash=Math.min(MAX,state.cash+earned);state.totalEarned=Math.min(MAX,state.totalEarned+earned);
        if(offline){offlineReport.cash+=earned;offlineReport.deliveries+=count;}else emit('delivery',`${r.name}: delivery complete`,{id:r.id,earned,count});
        if(info.nextMastery&&s.deliveries>=info.nextMastery&&!offline)emit('mastery',`${r.name} mastery: +${Math.round(stats(r.id).masteryBonus*100)}% fares.`,{id:r.id,masteryLevel:stats(r.id).masteryLevel});
        if(s.queuedPolicy){s.policy=s.queuedPolicy;s.queuedPolicy=null;if(!offline)emit('policyApplied',`${r.name}: ${stats(r.id).policyName} policy started.`,{id:r.id});}
      }
    }
  }

  try {const stored=storage?.getItem(SAVE_KEY);if(stored)state=normalize(JSON.parse(stored),now());}catch {emit('warning','Stored save could not be read. A fresh company is ready.');}
  const cap=has('nightshift')?28800:14400;
  offlineReport.seconds=Math.min(cap,Math.max(0,(now()-state.lastSaved)/1000));
  if(offlineReport.seconds>5)advance(offlineReport.seconds,true);else offlineReport.seconds=0;
  state.lastSaved=now();
  function save() {state.lastSaved=now();try {if(!storage)throw new Error('Storage unavailable');storage.setItem(SAVE_KEY,JSON.stringify(state));persistenceAvailable=true;persistenceWarned=false;return true;}catch {persistenceAvailable=false;if(!persistenceWarned){persistenceWarned=true;emit('warning','Browser storage is full or unavailable. Export your save.');}return false;}}

  function contractStatus(id) {
    const c=CONTRACTS.find(c=>c.id===id);if(!c)return null;
    const values=Object.values(state.routes);
    const current=c.type==='deliveries'?state.deliveries:c.type==='fleet'?values.filter(s=>s.unlocked).reduce((n,s)=>n+s.fleet,0):c.type==='managers'?values.filter(s=>s.unlocked&&s.manager).length:c.type==='regions'?state.unlockedRegions.length:values.filter(s=>s.unlocked).length;
    return {current,target:c.target,complete:current>=c.target,claimed:state.contracts.includes(id),reward:c.reward};
  }
  const prestigeInfo=()=>({available:state.totalEarned>=2000000&&state.unlockedRegions.length>=4,reward:Math.max(1,Math.floor(Math.sqrt(state.totalEarned/2000000))),requirement:'Earn $2M and unlock 4 regions. Each reputation point permanently adds 15% to fares.',progress:Math.min(1,state.totalEarned/2000000,state.unlockedRegions.length/4)});
  function quote(type,id,quantity=1) {
    if(type==='production')type='upgrade';const r=ROUTES.find(r=>r.id===id),s=state.routes[id];if(!r||!s?.unlocked||!['upgrade','fleet','storage','manager'].includes(type))return {cost:0,count:0,affordable:false,maxed:false};
    const start=type==='upgrade'?s.level:type==='fleet'?s.fleet:type==='storage'?s.storageLevel:s.managerLevel,cap=type==='upgrade'?200:type==='fleet'?30:type==='storage'?50:5;
    const requested=quantity==='max'?cap:quantity===10?10:1;let cost=0,count=0,nextCost=0;
    for(let n=start;n<cap&&count<requested;n++){const next=type==='upgrade'?price(r.baseCost*Math.pow(1.28,n-1)):type==='fleet'?price(r.baseCost*3*Math.pow(1.7,n-1)*(has('fleet')?.8:1)):type==='storage'?price(r.baseCost*2*Math.pow(1.32,n)):price(r.baseCost*5*Math.pow(2.3,n));if(count===0)nextCost=next;if(cost+next>state.cash)break;cost+=next;count++;}
    return {cost:count?cost:nextCost,count,affordable:count>0,maxed:start>=cap,requested,nextCost};
  }
  function seasonInfo(){const date=new Date(now()),year=date.getUTCFullYear(),start=Date.UTC(year,9,15),end=Date.UTC(year,10,2),active=now()>=start&&now()<end,nextYear=now()>=end?year+1:year;return {active,name:active?'Halloween Haul':'Halloween Haul · Practice',practiceAvailable:true,duration:480,startsAt:Date.UTC(nextYear,9,15),endsAt:Date.UTC(nextYear,10,2)};}
  function seasonStats(id){const b=SEASON_BUSINESSES.find(b=>b.id===id),s=state.season.run?.businesses[id];if(!b||!s)return null;const payout=b.baseEarn*Math.pow(1.35,s.level-1)*(1+toolBonus(state.equipment.character)),duration=b.baseTime/(1+(s.level-1)*.025);return {payout,duration,income:s.unlocked?payout/duration:0,upgradeCost:price(b.baseCost*Math.pow(1.5,s.level-1)),progress:s.progress,active:s.unlocked};}
  function advanceSeason(dt){const run=state.season.run;if(!run||run.remaining<=0)return;const elapsed=Math.min(dt,run.remaining);run.remaining=Math.max(0,run.remaining-elapsed);for(const b of SEASON_BUSINESSES){const s=run.businesses[b.id];if(!s.unlocked)continue;const info=seasonStats(b.id),position=s.progress+elapsed/info.duration,count=Math.floor(position);s.progress=position-count;if(count){const earned=Math.min(MAX,count*info.payout);run.coins=Math.min(MAX,run.coins+earned);run.totalEarned=Math.min(MAX,run.totalEarned+earned);}}if(run.remaining===0)emit('seasonEnd','Halloween run completed. Claim earned keepsakes or start another run.');}
  function action(type,id,quantity=1) {
    const r=ROUTES.find(r=>r.id===id),s=state.routes[id];
    const reject=message=>({ok:false,message});
    const purchase=(cost)=>{if(state.cash<cost)return false;state.cash-=cost;return true;};
    let message='',resultExtra={};
    if(['upgrade','production','storage','fleet','manager','dispatch'].includes(type)&&(!r||!s.unlocked))return reject('Open this route first.');
    if(type==='work') {
      const owned=ROUTES.some(r=>state.routes[r.id].unlocked),timestamp=now();tapCombo=owned?(timestamp-lastTap<=900?Math.min(20,tapCombo+1):1):0;lastTap=timestamp;
      const income=ROUTES.reduce((sum,r)=>sum+stats(r.id).income,0),multiplier=owned?1+Math.max(0,tapCombo-1)/19:1,earned=Math.min(MAX,Math.max(5,income*.5)*(has('tap-tools')?2:1)*(has('precision-loaders')?2:1)*multiplier);resultExtra={earned,combo:tapCombo,multiplier};state.cash=Math.min(MAX,state.cash+earned);state.totalEarned=Math.min(MAX,state.totalEarned+earned);state.workCount++;message=`Loading work earned $${Math.round(earned)}.`;
    } else if(type==='policy') {
      const [routeId,policyId]=String(id).split(':'),routeState=state.routes[routeId],policy=POLICIES.find(p=>p.id===policyId);if(!routeState?.unlocked)return reject('Open this route first.');if(!policy)return reject('Unknown operating policy.');
      if(routeState.policy===policyId){routeState.queuedPolicy=null;message='Queued policy cleared; current policy retained.';}else {routeState.queuedPolicy=policyId;message=`${policy.name} starts after the current delivery.`;}
    } else if(type==='claimEvent') {
      const event=state.event;if(!event||event.remaining<=0)return reject('This opportunity has ended.');state.cash=Math.min(MAX,state.cash+event.reward);state.totalEarned=Math.min(MAX,state.totalEarned+event.reward);message=`${event.title}: bonus received.`;state.event=null;
    } else if(type==='unlockRoute') {
      if(!r)return reject('Unknown route.');if(s.unlocked)return reject('Route already open.');if(!state.unlockedRegions.includes(r.region))return reject('Unlock this region first.');if(!purchase(r.unlockCost))return reject('Not enough cash to open this route.');s.unlocked=true;message=`${r.name} is open.`;
    } else if(['upgrade','production','fleet','storage','manager'].includes(type)) {
      const order=quote(type,id,quantity);if(!order.affordable)return reject(order.maxed?'This track is at maximum level.':'Not enough cash for this purchase.');purchase(order.cost);const field=type==='upgrade'||type==='production'?'level':type==='fleet'?'fleet':type==='storage'?'storageLevel':'managerLevel';s[field]+=order.count;if(type==='manager')s.manager=true;resultExtra={count:order.count,cost:order.cost};message=`${r.name}: purchased ${order.count} ${type==='upgrade'?'production':type} upgrade${order.count===1?'':'s'}.`;
    } else if(type==='dispatch') {
      if(cooldowns[id])return reject('Loading crew is preparing the next shipment.');s.attended=true;s.progress=Math.min(.999999,s.progress+.3);cooldowns[id]=1.5;message='Priority shipment loaded: next delivery earns the full fare.';
    } else if(type==='unlockRegion') {
      const region=REGIONS.find(r=>r.id===id);if(!region)return reject('Unknown region.');if(state.unlockedRegions.includes(id))return reject('Region already open.');const index=REGIONS.indexOf(region);if(!state.unlockedRegions.includes(REGIONS[index-1].id))return reject('Open the previous region first.');if(state.deliveries<region.requireDeliveries)return reject(`Complete ${region.requireDeliveries} deliveries first.`);if(!purchase(region.unlockCost))return reject('Not enough cash for the regional permit.');state.unlockedRegions.push(id);state.region=id;message=`Welcome to ${region.name}. Open a route to start operations.`;
    } else if(type==='selectRegion') {
      if(!state.unlockedRegions.includes(id))return reject('This region is locked.');state.region=id;message='Regional operations selected.';
    } else if(type==='research') {
      const tech=RESEARCH.find(t=>t.id===id);if(!tech)return reject('Unknown research.');if(has(id))return reject('Research already completed.');if(tech.requires&&!has(tech.requires))return reject('Complete the preceding research first.');if(!purchase(tech.cost))return reject('Not enough cash for research.');state.research.push(id);message=`${tech.name} researched.`;
    } else if(type==='claimContract') {
      const status=contractStatus(id);if(!status)return reject('Unknown contract.');if(status.claimed)return reject('Reward already claimed.');if(!status.complete)return reject('This contract is not complete yet.');state.contracts.push(id);state.cash=Math.min(MAX,state.cash+status.reward);message='Contract reward received.';
    } else if(type==='prestige') {
      const info=prestigeInfo();if(!info.available)return reject(info.requirement);const reputation=state.prestige+info.reward,settings=state.settings,inventory=state.inventory,season=state.season,character=state.equipment.character;state=fresh(now());state.inventory=inventory;state.season=season;state.equipment.character=character;tapCombo=0;lastTap=-Infinity;state.prestige=reputation;state.settings=settings;for(const key of Object.keys(cooldowns))delete cooldowns[key];message=`New company founded with ${reputation} reputation: +${reputation*15}% fares.`;
    } else if(type==='equip') {
      const [itemId,target]=String(id).split('|'),item=ITEMS.find(i=>i.id===itemId);if(!item||!state.inventory.includes(itemId))return reject('Earn this keepsake first.');const [slot,routeId]=String(target).split(':');if(slot!==item.slot)return reject('This keepsake belongs in a different slot.');let list,limit;
      if(slot==='character'){list=state.equipment.character;limit=2;}else {const routeState=state.routes[routeId];if(!routeState?.unlocked)return reject('Open this business first.');if(slot==='manager'&&!routeState.manager)return reject('Hire a manager first.');const area=slot==='business'?'businesses':'managers';list=state.equipment[area][routeId]||(state.equipment[area][routeId]=[]);limit=slot==='business'?2:stats(routeId).managerSlots;}
      if(list.includes(itemId))return reject('Keepsake already assigned here.');if(list.length>=limit)return reject('Detach a keepsake or earn another manager slot.');state.equipment.character=state.equipment.character.filter(x=>x!==itemId);for(const area of ['businesses','managers'])for(const key of Object.keys(state.equipment[area]))state.equipment[area][key]=state.equipment[area][key].filter(x=>x!==itemId);if(slot==='character')state.equipment.character.push(itemId);else state.equipment[slot==='business'?'businesses':'managers'][routeId].push(itemId);message=`${item.name} assigned.`;
    } else if(type==='detach') {
      if(!state.inventory.includes(id))return reject('Unknown keepsake.');state.equipment.character=state.equipment.character.filter(x=>x!==id);for(const area of ['businesses','managers'])for(const key of Object.keys(state.equipment[area]))state.equipment[area][key]=state.equipment[area][key].filter(x=>x!==id);message='Keepsake detached and available to move.';
    } else if(type==='seasonStart') {
      if(state.season.run?.remaining>0)return reject('Finish this run before starting another.');state.season.run=newSeasonRun();state.season.runs++;message='Eight-minute Halloween run started. Tap for treats, grow three businesses, earn permanent keepsakes.';
    } else if(type==='seasonTap') {
      const run=state.season.run;if(!run||run.remaining<=0)return reject('Start a Halloween run first.');const earned=Math.max(1,SEASON_BUSINESSES.reduce((n,b)=>n+(seasonStats(b.id)?.income||0),0)*.25);run.coins=Math.min(MAX,run.coins+earned);run.totalEarned=Math.min(MAX,run.totalEarned+earned);resultExtra={earned};message='Treat shipment packed.';
    } else if(type==='seasonUnlock'||type==='seasonUpgrade') {
      const run=state.season.run,b=SEASON_BUSINESSES.find(b=>b.id===id);if(!run||run.remaining<=0||!b)return reject('Start a run and choose a business.');const value=run.businesses[id];if(type==='seasonUnlock'){if(value.unlocked)return reject('Business already open.');if(id==='ghost'&&!run.businesses.candy.unlocked)return reject('Open the candy kitchen first.');if(run.coins<b.unlockCost)return reject('Not enough treats.');run.coins-=b.unlockCost;value.unlocked=true;}else {if(!value.unlocked)return reject('Open this seasonal business first.');if(value.level>=50)return reject('Maximum seasonal production reached.');const cost=seasonStats(id).upgradeCost;if(run.coins<cost)return reject('Not enough treats.');run.coins-=cost;value.level++;}message='Halloween business expanded.';
    } else if(type==='seasonClaim') {
      const run=state.season.run,m=SEASON_MILESTONES.find(m=>m.id===id);if(!run||!m||run.totalEarned<m.target)return reject('Reach this run milestone first.');if(state.season.claimedRewards.includes(id))return reject('This permanent keepsake was already earned.');state.season.claimedRewards.push(id);run.claimed.push(id);if(!state.inventory.includes(m.item))state.inventory.push(m.item);message=`${ITEMS.find(i=>i.id===m.item).name} earned permanently. Assign it in the equipment panel.`;
    } else if(type==='quality') {
      if(!['high','medium','low'].includes(id))return reject('Unknown quality.');state.settings.quality=id;message=`Visual quality: ${id}.`;
    } else if(type==='sound') {state.settings.sound=!state.settings.sound;message=state.settings.sound?'Sound enabled.':'Sound disabled.';
    } else return reject('Unknown action.');
    save();emit(type,message,{id,...resultExtra});return {ok:true,message,...resultExtra};
  }
  function tickEvents(dt) {
    if(!ROUTES.some(r=>state.routes[r.id].unlocked))return;
    if(state.event){state.event.remaining-=dt;if(state.event.remaining<=0){state.event=null;emit('eventExpired','The partner opportunity has passed.');}}
    state.eventTimer-=dt;if(state.eventTimer>0||state.event)return;
    const roll=Math.max(0,Math.min(.999999,Number(random())||0)),kind=['rush','backhaul','supply'][Math.floor(roll*3)];
    const income=ROUTES.reduce((sum,r)=>sum+stats(r.id).income,0);state.eventsServed++;
    state.event={id:`opportunity-${state.eventsServed}`,kind,title:{rush:'Rush order',backhaul:'Backhaul opportunity',supply:'Supply bonus'}[kind],description:{rush:'A partner needs an urgent delivery. Accept the order for a cash bonus.',backhaul:'An empty return trip can carry a bonus shipment. Accept it before the loading window closes.',supply:'A supplier offers a one-time logistics rebate. Collect it while the offer lasts.'}[kind],reward:Math.round(Math.max(80,income*30*(kind==='rush'?1.5:kind==='backhaul'?1.2:1))),remaining:25};
    state.eventTimer=80+Math.max(0,Math.min(1,Number(random())||0))*60;emit('event',state.event.title,{event:state.event});
  }
  function resumeAway(seconds) {
    if(!Number.isFinite(seconds)||seconds<=0)return {seconds:0,cash:0,deliveries:0};
    seconds=Math.min(seconds,Math.max(0,(now()-state.lastSaved)/1000));if(seconds<=0)return {seconds:0,cash:0,deliveries:0};
    if(state.season.run)state.season.run.remaining=Math.max(0,state.season.run.remaining-seconds);
    if(seconds<=5){save();return {seconds:0,cash:0,deliveries:0};}
    offlineReport={seconds:Math.min(seconds,has('nightshift')?28800:14400),cash:0,deliveries:0};
    advance(offlineReport.seconds,true);save();emit('offline','Managed routes earned income while you were away.',{...offlineReport});return {...offlineReport};
  }

  save();
  return {get state(){return state;},get offlineReport(){return offlineReport;},get persistenceAvailable(){return persistenceAvailable;},tapInfo(){const active=now()-lastTap<=900&&tapCombo>0;return {combo:active?tapCombo:0,multiplier:active?1+Math.max(0,tapCombo-1)/19:1,remaining:active?Math.max(0,900-(now()-lastTap)):0};},stats,quote,seasonInfo,seasonStats,action,contractStatus,prestigeInfo,save,resumeAway,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},tick(dt){if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,60);for(const id of Object.keys(cooldowns)){cooldowns[id]=Math.max(0,cooldowns[id]-dt);}advance(dt);tickEvents(dt);advanceSeason(dt);saveTimer+=dt;if(saveTimer>=12){saveTimer=0;save();}},exportSave(){save();return JSON.stringify(state,null,2);},importSave(text){try {if(typeof text!=='string'||text.length>100000)return {ok:false,message:'Save file is too large.'};const next=normalize(JSON.parse(text),now());state=next;tapCombo=0;lastTap=-Infinity;state.lastSaved=now();offlineReport={seconds:0,cash:0,deliveries:0};for(const key of Object.keys(cooldowns))delete cooldowns[key];save();emit('import','Company save imported.');return {ok:true,message:'Company save imported.'};}catch(error){return {ok:false,message:error.message||'Invalid save file.'};}}};
}
