// Pure radio scheduling. Never consumes the simulation RNG or changes the world.
export const SQUAD_VOICES=['crumb','spud','peas','titch'];
export const voiceFor=u=>u?.escort?'biscuit':SQUAD_VOICES[((u?.rosterId??u?.id??0)%4+4)%4];
const cooldown={move:3.2,blocked:7,hold:2,join:2,rifle:5,grenade:5,flamer:5,arm:2.5,cancel:2.5,kill:10,hurt:12,fire:12,friendly:10,idle:20,loss:12,wave:12,last:999,forest:30,time:999,lost:24,upgrade:5};
export function createChatter(clips,random=Math.random){
 const byKey=new Map();for(const clip of clips){const key=clip.voice+':'+clip.event;if(!byKey.has(key))byKey.set(key,[]);byKey.get(key).push(clip);}
 let queue=[],nextAt=0;const played=new Map(),categories=new Map();let recent=[];
 function alive(w,id){return id==null||w.units.some(u=>u.id===id&&u.team==='blue'&&u.hp>0);}
 function valid(q,w,now){const u=w.units.find(u=>u.id===q.unit);return q.expires>now&&alive(w,q.unit)&&(q.active==null||u?.active===q.active);}
 return {
  clear(){queue=[];nextAt=0;},
  offer(event,w,now,{unit=null,voice=null,priority=40,ttl=3,delay=0,active=null}={}){
   if((categories.get(event)??-Infinity)+(cooldown[event]??8)>now)return false;
   let who=unit==null?null:w.units.find(u=>u.id===unit);
   if(unit!=null&&!alive(w,unit))return false;
   if(!voice&&!who){const live=w.units.filter(u=>u.team==='blue'&&!u.escort&&u.hp>0&&u.active);if(!live.length)return false;who=live[Math.floor(random()*live.length)];unit=who.id;}
   voice=voice||voiceFor(who);
   const choices=(byKey.get(voice+':'+event)||[]).filter(c=>now-(played.get(c.id)??-Infinity)>45);
   if(!choices.length)return false;
   const fresh=choices.filter(c=>!recent.includes(c.id)),pool=fresh.length?fresh:choices;
   const clip=pool[Math.floor(random()*pool.length)];
   // Replace obsolete same-category orders; never grow a backlog of chatter.
   queue=queue.filter(q=>q.event!==event&&valid(q,w,now)&&!(priority>=60&&q.priority<60));
   queue.push({clip,event,voice,unit,priority,active,expires:now+ttl,ready:now+delay});
   queue.sort((a,b)=>b.priority-a.priority);queue=queue.slice(0,3);return true;
  },
  take(w,now,current=null){
   queue=queue.filter(q=>valid(q,w,now));
   if(now<nextAt)return null;
   const index=queue.findIndex(q=>q.ready<=now&&(!current||(q.priority>=90&&current.priority<80)||(q.priority>=60&&q.priority<80&&current.priority<60)));
   if(index<0)return null;const q=queue.splice(index,1)[0];
   if((categories.get(q.event)??-Infinity)+(cooldown[q.event]??8)>now)return null;
   categories.set(q.event,now);played.set(q.clip.id,now);recent=[...recent.slice(-7),q.clip.id];nextAt=now+.8;
   return q;
  },
  ended(now){nextAt=Math.max(nextAt,now+.65);},
  snapshot(){return {queued:queue.map(q=>({id:q.clip.id,event:q.event,unit:q.unit,priority:q.priority})),recent:[...recent]};}
 };
}
