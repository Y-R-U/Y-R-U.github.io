import {connect} from './lib.mjs';
const {ev}=await connect();
for(const n of [1,2,3,5,8]){
  console.log(n, await ev(`(()=>{const t=performance.now();__game.loadLevel(${n});return +(performance.now()-t).toFixed(1);})()`),'ms');
}
process.exit(0);
