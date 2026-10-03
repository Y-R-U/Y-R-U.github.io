// Pure freight challenge helpers. Economy owns live deliveries and atomic rewards.
export const FREIGHT_TOOLS = [
  {id:'dispatch-pennant',name:'Dispatch pennant',slot:'business',bonus:.08,description:'Assigned business fares +8%. Earned on your first freight job.'},
  {id:'crew-whistle',name:'Crew whistle',slot:'manager',bonus:.06,description:'Assigned manager fares +6%. Earned on your second freight job.'},
  {id:'freight-compass',name:'Freight compass',slot:'character',bonus:.06,description:'All network and seasonal fares +6%. Earned on your third freight job.'}
];
const finite=(value,fallback=0,max=1e100)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(max,value):fallback;
export const freshFreight=()=>({version:1,completed:0,nextId:1,claimedJobIds:[],job:null,lastClock:0});
export function normalizeFreight(raw,now,routeIds){
  const state=freshFreight();if(!raw||raw.version!==1)return state;
  state.completed=Math.floor(finite(raw.completed,0,1e9));state.nextId=Math.max(state.completed+1,Math.floor(finite(raw.nextId,1,1e9)));
  state.claimedJobIds=Array.isArray(raw.claimedJobIds)?[...new Set(raw.claimedJobIds.filter(id=>typeof id==='string'&&/^freight-\d{1,10}$/.test(id)))].slice(-2000):[];
  const clockBack=finite(raw.lastClock,now)>now+1000;state.lastClock=Math.min(now,finite(raw.lastClock,now));
  state.nextId=Math.max(state.nextId,...state.claimedJobIds.map(id=>Number(id.slice(8))+1));
  const job=raw.job;
  if(job&&typeof job==='object'&&routeIds.includes(job.routeId)&&typeof job.id==='string'&&/^freight-\d{1,10}$/.test(job.id)&&!state.claimedJobIds.includes(job.id)){
    const duration=Math.max(45,finite(job.duration,45,180)),startedAt=Math.min(now,finite(job.startedAt,now)),expiresAt=Math.min(clockBack?Math.max(0,now-1):Infinity,startedAt+duration*1000,finite(job.expiresAt,startedAt));
    const delivered=Math.floor(finite(job.delivered,0,3)),priorityLoads=Math.floor(finite(job.priorityLoads,0,1));
    const completedAt=delivered===3&&priorityLoads===1&&typeof job.completedAt==='number'&&Number.isFinite(job.completedAt)&&job.completedAt>=startedAt&&job.completedAt<=expiresAt?finite(job.completedAt,0,Math.max(now,state.lastClock)):null;
    state.job={id:job.id,routeId:job.routeId,target:3,duration,startedAt,expiresAt,delivered,priorityLoads,reward:finite(job.reward,0,1e12),completedAt};
    state.nextId=Math.max(state.nextId,Number(job.id.slice(8))+1);
  }
  return state;
}
export function freightClock(state,now){state.lastClock=Math.max(state.lastClock||0,now);return state.lastClock;}
export function freightStatus(job,now){if(!job)return 'idle';if(typeof job.completedAt==='number'&&Number.isFinite(job.completedAt)&&job.delivered===3&&job.priorityLoads===1)return 'ready';return now>=job.expiresAt?'expired':'active';}
export function freightOffer(route,stats,networkIncome){
  return {id:route.id,routeId:route.id,name:route.name,target:3,duration:Math.min(180,Math.max(45,Math.ceil(stats.duration*5+10))),reward:Math.min(1e12,Math.max(80,Math.min(networkIncome*30,stats.fullPayout*6)))};
}
export function beginFreight(state,offer,now){
  const clock=freightClock(state,now);if(['active','ready'].includes(freightStatus(state.job,clock)))return {ok:false,message:'Finish or claim your current freight assignment first.'};
  state.job={id:`freight-${state.nextId++}`,routeId:offer.routeId,target:3,duration:offer.duration,startedAt:clock,expiresAt:clock+offer.duration*1000,delivered:0,priorityLoads:0,reward:offer.reward,completedAt:null};
  return {ok:true,message:'Freight assignment accepted. Complete three journeys and load one priority shipment.'};
}
export function recordFreight(state,routeId,count,now,kind='delivery'){
  const clock=freightClock(state,now),job=state.job;if(!job||job.routeId!==routeId||freightStatus(job,clock)!=='active')return false;
  if(kind==='delivery')job.delivered=Math.min(3,job.delivered+Math.floor(finite(count,0,3)));else if(kind==='load')job.priorityLoads=1;
  if(job.delivered===3&&job.priorityLoads===1){job.completedAt=clock;return true;}return false;
}
export function claimFreight(state,now){
  const job=state.job;if(freightStatus(job,freightClock(state,now))!=='ready'||state.claimedJobIds.includes(job?.id))return {ok:false,message:'Complete three live journeys and a priority load before the deadline.'};
  state.claimedJobIds.push(job.id);state.claimedJobIds=state.claimedJobIds.slice(-2000);const tool=FREIGHT_TOOLS[state.completed]||null;state.completed++;const result={ok:true,reward:job.reward,tool,jobId:job.id};state.job=null;return result;
}
