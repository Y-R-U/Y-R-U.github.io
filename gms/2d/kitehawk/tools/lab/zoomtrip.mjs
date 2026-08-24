/* C9's tripwire, proven able to fail. */
import { createDuel } from '../../js/modes/duel.js';
for (const bug of ['', 'zoom-range']) {
  const at = (z) => {
    let w = 0, l = 0;
    for (let i = 0; i < 24; i++) {
      const d = createDuel({}, { ace: 'A10', airframe: 'kitehawk', gun: 't5', seed: 300 + i });
      d.world.ctx.bug = bug; d.world.ctx.zoom = z;
      const r = d.run();
      if (r.winner === 'player') w++; else if (r.winner === 'ace') l++;
    }
    return `${w}/${l}`;
  };
  const a = at(0.78), b = at(1.22);
  console.log(`  bug="${bug || 'none'}"  zoom 0.78 -> ${a}   zoom 1.22 -> ${b}   ${a === b ? 'IDENTICAL (C9 green)' : 'DIFFERENT (C9 red)'}`);
}
