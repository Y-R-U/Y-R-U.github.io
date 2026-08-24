import { createDuel } from '../../js/modes/duel.js';
import { ACES } from '../../js/sim/ai.js';
const runs = 60;
for (const ak of [0.30, 0.90]) {
  ACES.A12.k = ak;
  let pw=0, ps=0, ph=0, as=0, ah=0, t=0; const cause={}; const st={};
  for (let i=0;i<runs;i++){
    const d = createDuel({},{ace:'A12',airframe:'kitehawk',gun:'t5',seed:9100+i,k:0.70});
    const r = d.run();
    if (r.winner==='player') pw++;
    ps += r.shots; ph += r.hits; t += r.time;
    const a = d.world.byId('ace'), p = d.world.byId('player');
    if (a) { as += a.shotsFired; ah += a.hits; }
    for (const c of r.causes) cause[c]=(cause[c]||0)+1;
    if (a && a.ai) for (const k in a.ai.stats.states) st[k]=(st[k]||0)+a.ai.stats.states[k];
  }
  console.log(`aceK ${ak}  playerWin ${(100*pw/runs).toFixed(0)}%  playerShots ${(ps/runs).toFixed(0)} acc ${(ph/Math.max(1,ps)).toFixed(3)}  aceShots ${(as/runs).toFixed(0)} acc ${(ah/Math.max(1,as)).toFixed(3)}  meanT ${(t/runs).toFixed(1)}`);
  console.log('   causes', JSON.stringify(cause));
  console.log('   ace states', JSON.stringify(st));
}
ACES.A12.k=0.90;
