import {connect} from './lib.mjs';
const {ev}=await connect();
console.log(await ev(`(()=>({lvl:__game.levelInfo().id, state:__game.GAME.state, alive:__game.Enemies.aliveCount(), fps:__game.fps()}))()`));
process.exit(0);
