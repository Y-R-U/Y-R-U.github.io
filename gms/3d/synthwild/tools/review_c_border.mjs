// R3 reviewer C: chunk keys alias beyond |chunk| 32768 (x or z >= 524,288 m). node tools/review_c_border.mjs
import { World } from '../js/world/world.js';
import { secKeyNum } from '../js/world/section.js';
const w = new World({ seed: 'border', sync: true });
console.log('secKeyNum(0,4,32768) === secKeyNum(1,4,-32768):', secKeyNum(0, 4, 32768) === secKeyNum(1, 4, -32768));
w.genChunkSync(1, -32768);                         // a real chunk at x=16..31, z=-524288
const a = w.getCell(16 + 3, 20, -524288 + 5);
console.log('chunk (0,32768) loaded?', w.isChunkLoaded(0, 32768), '  cell read at (3,20,524293) aliases chunk (1,-32768):',
  w.getCell(3, 20, 524288 + 5), '=== ', a, ' (a different place 1 km away)');
w.setBox([3 * 4, 60 * 4, (524288 + 5) * 4], [4 * 4, 61 * 4, (524288 + 6) * 4], 3, 'fill', {});
console.log('after an edit at z=+524293, the far chunk at z=-524283 reads:', w.getCell(19, 60, -524288 + 5), '(was', 0, ')');
