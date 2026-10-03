export const SAVE_KEY = 'idle-transport2-v1';
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
const fresh = (timestamp=Date.now()) => ({version:1,cash:0,totalEarned:0,deliveries:0,prestige:0,region:'meadow',unlockedRegions:['meadow'],routes:Object.fromEntries(ROUTES.map((r,i)=>[r.id,{unlocked:false,level:1,fleet:1,manager:false,progress:0,deliveries:0,attended:false}])),research:[],contracts:[],settings:{quality:'high',sound:false},lastSaved:timestamp,event:null,eventTimer:45,eventsServed:0,workCount:0});
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
    out.routes[r.id]={unlocked:s.unlocked===true&&out.unlockedRegions.includes(r.region),level:Math.max(1,Math.floor(number(s.level,1,200))),fleet:Math.max(1,Math.floor(number(s.fleet,1,30))),manager:s.manager===true,progress:number(s.progress,0,.999999),deliveries:Math.floor(number(s.deliveries)),attended:s.attended===true};
  }
  out.settings={quality:['high','medium','low'].includes(raw.settings?.quality)?raw.settings.quality:'high',sound:raw.settings?.sound===true};
  out.lastSaved=number(raw.lastSaved,timestamp,timestamp);
  out.eventTimer=Math.max(1,number(raw.eventTimer,45,140));out.eventsServed=Math.floor(number(raw.eventsServed,0,100000000));out.workCount=Math.floor(number(raw.workCount,0));
  const e=raw.event;if(e&&['rush','backhaul','supply'].includes(e.kind)&&typeof e.id==='string'&&e.id.length<60&&Number.isFinite(e.reward)&&e.reward>=0&&Number.isFinite(e.remaining)&&e.remaining>0)out.event={id:e.id,kind:e.kind,title:{rush:'Rush order',backhaul:'Backhaul opportunity',supply:'Supply bonus'}[e.kind],description:'A partner has a bonus job for your transport company.',reward:number(e.reward,0,MAX),remaining:number(e.remaining,0,25)};
  return out;
}
export function createGame(options={}) {
  let storage=options.storage;
  if(storage===undefined) { try {storage=globalThis.localStorage;} catch {} }
  const now=options.now||(()=>Date.now());
  const random=options.random||Math.random;
  const listeners=new Set(), cooldowns={};
  let state=fresh(now()), saveTimer=0, offlineReport={seconds:0,cash:0,deliveries:0};
  const emit=(type,message,extra={})=>{for(const fn of listeners)fn({type,message,...extra});};
  const has=id=>state.research.includes(id);
  const price=x=>Math.min(MAX,Math.ceil(x));
  const stats=id=>{
    const r=ROUTES.find(r=>r.id===id),s=state.routes[id]; if(!r||!s)return null;
    const duration=r.baseTime*(has('routing')?.85:1)*(has('engines')?.8:1)/(1+Math.min(199,s.level-1)*.018);
    const fullPayout=Math.min(MAX,r.baseEarn*Math.pow(1.12,s.level-1)*s.fleet*(1+state.prestige*.15)*(has('cargo')?1.25:1)*(has('contracts')?1.35:1)*(has('orbital')?1.5:1));
    const automaticRate=s.manager?1:has('automation')?.7:.45;
    return {income:s.unlocked?fullPayout*automaticRate/duration:0,payout:fullPayout*(s.manager||s.attended?1:automaticRate),fullPayout,duration,upgradeCost:price(r.baseCost*Math.pow(1.28,s.level-1)),fleetCost:price(r.baseCost*3*Math.pow(1.7,s.fleet-1)*(has('fleet')?.8:1)),managerCost:price(r.baseCost*5),progress:s.progress,active:s.unlocked,dispatchReady:!cooldowns[id],automaticRate};
  };
  function advance(dt,offline=false) {
    for(const r of ROUTES) {
      const s=state.routes[r.id]; if(!s.unlocked||(offline&&!s.manager))continue;
      const info=stats(r.id), position=s.progress+dt/info.duration, count=Math.floor(position);
      s.progress=position-count;
      if(count>0) {
        const base=info.fullPayout*info.automaticRate;
        const earned=Math.min(MAX,base*count+(s.attended&&!s.manager?info.fullPayout-base:0));
        s.attended=false;s.deliveries=Math.min(MAX,s.deliveries+count);state.deliveries=Math.min(MAX,state.deliveries+count);state.cash=Math.min(MAX,state.cash+earned);state.totalEarned=Math.min(MAX,state.totalEarned+earned);
        if(offline){offlineReport.cash+=earned;offlineReport.deliveries+=count;}
        else emit('delivery',`${r.name}: delivery complete`,{id:r.id,earned,count});
      }
    }
  }
  try {const stored=storage?.getItem(SAVE_KEY);if(stored)state=normalize(JSON.parse(stored),now());}catch {emit('warning','Stored save could not be read. A fresh company is ready.');}
  const cap=has('nightshift')?28800:14400;
  offlineReport.seconds=Math.min(cap,Math.max(0,(now()-state.lastSaved)/1000));
  if(offlineReport.seconds>5)advance(offlineReport.seconds,true);else offlineReport.seconds=0;
  state.lastSaved=now();
  function save() {state.lastSaved=now();try {if(!storage){emit('warning','Browser storage is unavailable. Export your save.');return false;}storage.setItem(SAVE_KEY,JSON.stringify(state));return true;}catch {emit('warning','Browser storage is full or unavailable. Export your save.');return false;}}
  function contractStatus(id) {
    const c=CONTRACTS.find(c=>c.id===id);if(!c)return null;
    const values=Object.values(state.routes);
    const current=c.type==='deliveries'?state.deliveries:c.type==='fleet'?values.filter(s=>s.unlocked).reduce((n,s)=>n+s.fleet,0):c.type==='managers'?values.filter(s=>s.unlocked&&s.manager).length:c.type==='regions'?state.unlockedRegions.length:values.filter(s=>s.unlocked).length;
    return {current,target:c.target,complete:current>=c.target,claimed:state.contracts.includes(id),reward:c.reward};
  }
  const prestigeInfo=()=>({available:state.totalEarned>=2000000&&state.unlockedRegions.length>=4,reward:Math.max(1,Math.floor(Math.sqrt(state.totalEarned/2000000))),requirement:'Earn $2M and unlock 4 regions. Each reputation point permanently adds 15% to fares.',progress:Math.min(1,state.totalEarned/2000000,state.unlockedRegions.length/4)});
  function action(type,id) {
    const r=ROUTES.find(r=>r.id===id),s=state.routes[id];
    const reject=message=>({ok:false,message});
    const purchase=(cost)=>{if(state.cash<cost)return false;state.cash-=cost;return true;};
    let message='';
    if(['upgrade','fleet','manager','dispatch'].includes(type)&&(!r||!s.unlocked))return reject('Open this route first.');
    if(type==='work') {
      const income=ROUTES.reduce((sum,r)=>sum+stats(r.id).income,0),earned=Math.min(MAX,Math.max(5,income*.5));state.cash=Math.min(MAX,state.cash+earned);state.totalEarned=Math.min(MAX,state.totalEarned+earned);state.workCount++;message=`Loading work earned $${Math.round(earned)}.`;
    } else if(type==='claimEvent') {
      const event=state.event;if(!event||event.remaining<=0)return reject('This opportunity has ended.');state.cash=Math.min(MAX,state.cash+event.reward);state.totalEarned=Math.min(MAX,state.totalEarned+event.reward);message=`${event.title}: bonus received.`;state.event=null;
    } else if(type==='unlockRoute') {
      if(!r)return reject('Unknown route.');if(s.unlocked)return reject('Route already open.');if(!state.unlockedRegions.includes(r.region))return reject('Unlock this region first.');if(!purchase(r.unlockCost))return reject('Not enough cash to open this route.');s.unlocked=true;message=`${r.name} is open.`;
    } else if(type==='upgrade') {
      if(s.level>=200)return reject('Maximum route level reached.');if(!purchase(stats(id).upgradeCost))return reject('Not enough cash for this upgrade.');s.level++;message=`${r.name} upgraded to level ${s.level}.`;
    } else if(type==='fleet') {
      if(s.fleet>=30)return reject('Fleet is at capacity.');if(!purchase(stats(id).fleetCost))return reject('Not enough cash for another vehicle.');s.fleet++;message=`${r.name}: ${s.fleet} vehicles in service.`;
    } else if(type==='manager') {
      if(s.manager)return reject('A manager already runs this route.');if(!purchase(stats(id).managerCost))return reject('Not enough cash to hire a manager.');s.manager=true;message=`${r.name} now earns full fares automatically and while away.`;
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
      const info=prestigeInfo();if(!info.available)return reject(info.requirement);const reputation=state.prestige+info.reward,settings=state.settings;state=fresh(now());state.prestige=reputation;state.settings=settings;for(const key of Object.keys(cooldowns))delete cooldowns[key];message=`New company founded with ${reputation} reputation: +${reputation*15}% fares.`;
    } else if(type==='quality') {
      if(!['high','medium','low'].includes(id))return reject('Unknown quality.');state.settings.quality=id;message=`Visual quality: ${id}.`;
    } else if(type==='sound') {state.settings.sound=!state.settings.sound;message=state.settings.sound?'Sound enabled.':'Sound disabled.';
    } else return reject('Unknown action.');
    save();emit(type,message,{id});return {ok:true,message};
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
    if(!Number.isFinite(seconds)||seconds<=5)return {seconds:0,cash:0,deliveries:0};
    seconds=Math.min(seconds,Math.max(0,(now()-state.lastSaved)/1000));if(seconds<=5)return {seconds:0,cash:0,deliveries:0};
    offlineReport={seconds:Math.min(seconds,has('nightshift')?28800:14400),cash:0,deliveries:0};
    advance(offlineReport.seconds,true);save();emit('offline','Managed routes earned income while you were away.',{...offlineReport});return {...offlineReport};
  }
  save();
  return {get state(){return state;},get offlineReport(){return offlineReport;},get persistenceAvailable(){return !!storage;},stats,action,contractStatus,prestigeInfo,save,resumeAway,subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},tick(dt){if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,60);for(const id of Object.keys(cooldowns)){cooldowns[id]=Math.max(0,cooldowns[id]-dt);}advance(dt);tickEvents(dt);saveTimer+=dt;if(saveTimer>=12){saveTimer=0;save();}},exportSave(){save();return JSON.stringify(state,null,2);},importSave(text){try {if(typeof text!=='string'||text.length>100000)return {ok:false,message:'Save file is too large.'};const next=normalize(JSON.parse(text),now());state=next;state.lastSaved=now();offlineReport={seconds:0,cash:0,deliveries:0};for(const key of Object.keys(cooldowns))delete cooldowns[key];save();emit('import','Company save imported.');return {ok:true,message:'Company save imported.'};}catch(error){return {ok:false,message:error.message||'Invalid save file.'};}}};
}
