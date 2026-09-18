// derive per-tier fire cadence from the engine's own fire state machine
const TIERS={
  militia:{accuracy:0.42,reaction:0.85},regular:{accuracy:0.55,reaction:0.65},
  veteran:{accuracy:0.66,reaction:0.52},shock:{accuracy:0.76,reaction:0.42},
  praetor:{accuracy:0.85,reaction:0.34},paint:{accuracy:0.30,reaction:1.10}};
const rand=(a,b)=>a+Math.random()*(b-a);
const randi=(a,b)=>Math.floor(rand(a,b+1));
const lerp=(a,b,t)=>a+(b-a)*t;
function sim(t,far,secs=20000,dt=1/60){
  let fireCD=0,burst=0,burstT=0,shots=0,time=0;
  const n=Math.round(secs/dt);
  for(let i=0;i<n;i++){
    fireCD-=dt;
    if(burst>0){ burstT-=dt; if(burstT<=0){ shots++; burst--; burstT=0.115; } }
    else if(fireCD<=0){ burst=randi(3,5)+(t.accuracy>0.7?1:0); burstT=0;
      fireCD=(rand(0.75,1.6)+(far?0.5:0))*lerp(1,t.reaction,0.5); }
    time+=dt;
  }
  return shots/time;
}
// analytic renewal: E[rounds]/E[period], period = max(fireCD, (n-1)*0.115)
function analytic(t,far){
  const n=t.accuracy>0.7?5:4;                   // E[randi(3,5)] = 4, +1 above 0.7
  const k=lerp(1,t.reaction,0.5);
  const F=(1.175+(far?0.5:0))*k;                // E[rand(0.75,1.6)] = 1.175
  const B=(n-1)*0.115;
  return n/Math.max(F,B);
}
console.log('tier      close(sim) close(an) far(sim) far(an)  flat-model');
for(const k of ['militia','regular','veteran','shock','praetor']){
  const t=TIERS[k];
  console.log(k.padEnd(10)+sim(t,false).toFixed(3).padEnd(11)+analytic(t,false).toFixed(3).padEnd(10)+
    sim(t,true).toFixed(3).padEnd(9)+analytic(t,true).toFixed(3).padEnd(9)+(4/1.6).toFixed(3));
}
