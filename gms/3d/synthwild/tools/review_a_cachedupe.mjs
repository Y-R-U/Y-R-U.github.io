// Review R1 (client): breaking a cache a 1/4 sub at a time spills a fresh loot roll per sub.
// node tools/review_a_cachedupe.mjs
import { launch, open, stopBrowser, sleep } from './qa_cdp.mjs';

const PORT = 9330;
const BASE = 'http://localhost:8861/gms/3d/synthwild/';
const port = await launch(PORT);
try {
  const pg = await open(port);
  await pg.viewport({ width: 1100, height: 620 });
  await pg.clearOrigin(BASE);
  await pg.goto(BASE + '?nointro');
  await pg.waitFor(`window.__game && window.__game.shell && window.__game.shell.state === 'title'`, { timeout: 30000 });
  await pg.eval(`window.__game.shell.play({ id: null, temp: true, name: 'T', seed: 'dupe', mode: 'survival', difficulty: 'normal', source: 'local', mine: true }, { fresh: true })`, { timeout: 60000 });
  await pg.waitFor(`window.__game.shell.state === 'playing' && window.__game.ctx.player.ready`, { timeout: 30000 });
  await sleep(1000);
  const r = await pg.game(`
    const g=C.game, inv=g.inv, cid=g.items.id('cache'), W=C.world, P=C.player.pos, br=C.brush;
    inv.setSlot(0, cid, 1); inv.select(0);
    const cx=Math.floor(P.x)+3, cz=Math.floor(P.z)+3, cy=Math.ceil(W.surfaceY(cx+0.5,cz+0.5))+2;
    br.setScale(1);
    const placed = br._doPlace({ min:[cx*4,cy*4,cz*4], max:[cx*4+4,cy*4+4,cz*4+4] }, 'fill');
    const k=cx+','+cy+','+cz;
    const registeredEmpty = g.stations.map.get(k)?.inv.slots.filter(Boolean).length;
    const counts=[];
    br.setScale(0.25);
    for (let i=0;i<6;i++) {
      const s=[cx*4+(i&3), cy*4+3, cz*4+(i>>2)];
      const n0=g.drops.list.length;
      br._doBreak({ min:s, max:[s[0]+1,s[1]+1,s[2]+1] });
      counts.push(g.drops.list.length-n0);
    }
    const tally={};
    for (const d of g.drops.list) { const key=g.items.get(d.id).key; tally[key]=+((tally[key]||0)+d.n).toFixed(3); }
    return { placed, cachesLeftInInv: inv.count(cid), registeredEmpty, dropsSpawnedPerQuarterBreak: counts, droppedTotals: tally }`);
  console.log(JSON.stringify(r));
} finally {
  stopBrowser(PORT);
}
