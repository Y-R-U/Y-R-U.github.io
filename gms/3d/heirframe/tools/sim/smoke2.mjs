import { createGame } from '../../js/sim/game_state.js';
import { memoryStorage, createSaveStore } from '../../js/sim/save.js';
const g = createGame({ seed: 42, store: createSaveStore(memoryStorage()) });
g.on('*', (p, e) => { if (!['credits','xp','board','materials'].includes(e)) console.log('EV', e, JSON.stringify(p).slice(0, 160)); });
const b = g.board();
console.log('story', b.story?.id, b.story?.title, 'cards', b.cards.length);
console.log(g.acceptContract(b.story.id).ok);
while (true) { const r = g.completeStep(); if (r.done) break; }
const e = g.spawnEnemy({ defId: 'scrap_rat', level: 1 });
const p = g.playerCombatant();
let n = 0; while (e.alive && n < 50) { const r = g.hit(p, e, p.skills.attack, { comboIndex: n }); n++; }
console.log('hits to kill rat', n, g.kill(e));
console.log(g.finishContract({ time: 150 }));
console.log(g.hud());
console.log(g.state.stash.map(i => i.name + ' ' + i.rarity + ' up=' + i.upgrade));
