// STORY: time-warp rules in node (no browser). node tools/story/test-warp.mjs [--falsify]
// --falsify: a refused tap is allowed to change the level, so the refusal checks must fail.
import { createTimeWarp } from '../../js/story/timewarp.js';
const FALSIFY = process.argv.includes('--falsify');
const results = [];
const check = (n, ok, d = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ' — ' + d : ''}`); };
const w = createTimeWarp();
w.update({ apFlying: true });
w.cycle(); w.update({ apFlying: true }); check('tap cycles 1× → 2× when clear', w.level === 2 && w.scale === 2);
w.update({ apFlying: true, conflict: true });
check('traffic drops the warp to 1× and says why', w.level === 1 && w.dropped === 'Traffic nearby');
if (FALSIFY) w.update({ apFlying: true });
w.cycle();
check('a tap while traffic is near is refused (stays 1×)', w.level === 1, `level ${w.level}`);
check('the refusal is reported for the chip', w.refused?.text === 'traffic', JSON.stringify(w.refused));
w.update({ apFlying: true });
w.cycle(); check('once clear, a tap works again and clears the refusal', w.level === 2 && !w.refused);
w.update({ apFlying: true, radioWindow: true });
check('a radio window holds at 1× without dropping the level', w.scale === 1 && w.level === 2 && w.reason === 'Radio');
const bad = results.filter((x) => !x).length;
console.log(`\n${results.length - bad}/${results.length} passed`);
process.exit(bad ? 1 : 0);
