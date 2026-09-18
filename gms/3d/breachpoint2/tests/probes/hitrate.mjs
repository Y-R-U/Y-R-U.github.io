const TIERS={militia:{a:0.42,r:0.85},regular:{a:0.55,r:0.65},veteran:{a:0.66,r:0.52},
             shock:{a:0.76,r:0.42},praetor:{a:0.85,r:0.34}};
const lerp=(a,b,t)=>a+(b-a)*t;
const errMul=a=>1.9-a*1.6;
function cad(t,d){ const n=t.a>0.7?5:4, k=lerp(1,t.r,0.5), F=(1.175+(d>22?0.5:0))*k, B=(n-1)*0.115;
  return n/Math.max(F,B); }
// aim cone: err rad; offset r = (u1+u2)/2*err (triangular); hit if r*d < 0.42 (capsule half width)
function phit(t,d){ const err=(0.020+d*0.0016)*errMul(t.a); const x=(0.42/d)/err;
  return x<=0.5? 2*x*x : (x<=1? 1-2*(1-x)*(1-x) : 1); }
console.log('d     '+Object.keys(TIERS).map(k=>k.padEnd(20)).join(''));
for(const d of [6,8,10,12,15,18,20,22,25,30,35]){
  let line=String(d).padEnd(6);
  for(const k in TIERS){ const t=TIERS[k]; const c=cad(t,d), p=phit(t,d);
    line+=(c.toFixed(2)+'x'+p.toFixed(2)+'='+(c*p).toFixed(2)).padEnd(20); }
  console.log(line);
}
console.log('\nold flat model landing/s per attacker: '+Object.keys(TIERS).map(k=>k+' '+(4*(TIERS[k].a*0.6)/1.6).toFixed(2)).join('  '));
