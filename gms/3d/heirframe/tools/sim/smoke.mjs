import { createRng } from '../../js/sim/rng.js';
import { generateBoard, validateMission } from '../../js/sim/missions.js';
import { rollItem, rollKillLoot, newLootState, itemFR } from '../../js/sim/loot.js';
import { computeStats, resolveHit, makeCombatant } from '../../js/sim/stats.js';
import { createEnemy } from '../../js/sim/enemies.js';
import { FRAMES, SKILLS } from '../../js/data/frames.js';
const rng = createRng(1);
const b = generateBoard({ seed: 1, shiftIndex: 0, riderLevel: 12, threat: 'tense', frameArchetype: 'ghost', districts: [{ id: 'aurum_plaza' }, { id: 'brightline' }], currentDistrict: 'aurum_plaza', contractsDone: 10 });
for (const c of b.cards) { const v = validateMission(c); console.log(c.archetype, c.grade, c.level, c.title, '|', c.payout.credits, c.payout.xp, c.modifiers.join(','), c.twist?.id || '', v.ok ? 'OK' : v.errors); }
console.log(JSON.stringify(b.cards[0], null, 1).slice(0, 1500));
const it = rollItem(rng, { ilvl: 10, rarity: 'relic' }); console.log(it, itemFR(it));
const st = computeStats({ frameDef: FRAMES.brawler, level: 10, items: [it] }); console.log(st);
const e = createEnemy({ defId: 'knuckle', level: 10 }); console.log(e.stats);
const p = makeCombatant({ id: 'p', level: 10, stats: st, kind: 'player', passive: 'momentum' });
console.log(resolveHit(p, e, SKILLS.b_fists, rng, { comboIndex: 2 }), e.hp);
console.log(rollKillLoot(rng, { rank: 'elite', level: 10, riderLevel: 10, lootState: newLootState() }).items.map(i => i.name + ' ' + i.rarity));
