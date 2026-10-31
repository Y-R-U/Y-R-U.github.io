// FLIGHTFIX6: node tools/loop/freeze-test.mjs — the loop suite's FREEZE detector on recorded sample shapes.
// The two "player static in the air" reports of 2026-10-31 were the instrument: a VTO 0.2 m off the ground compared
// with a sample taken 18 s earlier on the ground, and a wreck (crashes are reported on their own).
import { freezeCheck, sampleOf } from './freeze.mjs';

const AI = (t) => [['ac3', 100 + t * 30, 50, 300, 0, 0, 'FLY']];
const snapAt = (t, p) => ({ simT: t, paused: false, p: p && { crashed: false, vtol: 0, gnd: false, kt: 0, ...p }, ai: AI(t) });
function run(list) {
  const samples = []; let hit = null;
  for (const s of list) {
    samples.push(sampleOf(s));
    while (samples.length > 2 && s.simT - samples[1].t >= 8) samples.shift();
    hit ||= freezeCheck(samples, s);
  }
  return hit;
}
const ticks = (t0, t1, dt, f) => { const out = []; for (let t = t0; t <= t1 + 1e-9; t += dt) out.push(f(+t.toFixed(2))); return out; };

const cases = [];
const it = (name, want, list) => cases.push({ name, want, list });

// f35-medium-landscape DEMAND TAKEOFF (results-2026-10-31T02-41-07): parked on grass, an 18 s sample gap (DEMAND IT's
// failure screenshot), then the VTO lifts 0.2 m with ~0 ground speed
it('VTO lifting 0.2 m after an 18 s gap on the ground is not a freeze', false, [
  snapAt(361.8, { x: -805, z: 0, alt: 2.30, gnd: true, act: 290 }),
  ...ticks(377.0, 380.3, 0.25, (t) => snapAt(t, { x: -805, z: 0, alt: t < 379.5 ? 2.30 : 2.50, gnd: t < 379.5, act: 290 + (t - 361.8), vtol: Math.min(1, (t - 377) / 1.4) })),
]);
it('any plane 0.2 m up now but on the ground in the oldest sample is not a freeze', false, [
  snapAt(361.8, { x: -805, z: 0, alt: 2.30, gnd: true, act: 290 }),
  ...ticks(377.0, 380.3, 0.25, (t) => snapAt(t, { x: -805, z: 0, alt: t < 379.5 ? 2.30 : 2.50, gnd: t < 379.5, act: 290 + (t - 361.8) })),
]);
// tiger-medium-portrait field LAND (results-2026-10-31T05-09-23): crashed at 2.4 m after a bounce series
it('a crashed wreck sitting still is not a freeze (the crash is its own failure)', false,
  ticks(427.3, 440, 0.25, (t) => snapAt(t, { x: -1930, z: 218, alt: 3.9, crashed: true, act: 427.3 })));
it('a jet-borne hover holding its spot is not a freeze', false,
  ticks(100, 115, 0.25, (t) => snapAt(t, { x: 0, z: 0, alt: 30, vtol: 1, act: t })));
// must still catch
it('step() stopped (falsify freeze): the physics clock stands still', true,
  ticks(100, 110, 0.25, (t) => snapAt(t, { x: 10, z: 10, alt: 300, kt: 90, act: 55 })));
it('pinned in the air with its clock running', true,
  ticks(100, 110, 0.25, (t) => snapAt(t, { x: 10, z: 10, alt: 300, kt: 90, act: t })));
it('flying normally is not a freeze', false,
  ticks(100, 115, 0.25, (t) => snapAt(t, { x: 10 + t * 40, z: 10, alt: 300, kt: 90, act: t })));
it('airborne AI all static is a freeze', true,
  ticks(100, 110, 0.25, (t) => ({ ...snapAt(t, { x: 10 + t * 40, z: 10, alt: 300, act: t }), ai: AI(0) })));

let fails = 0;
for (const c of cases) {
  const hit = run(c.list), ok = !!hit === c.want;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}${hit ? '  → ' + JSON.stringify(hit) : ''}`);
}
console.log(`\n${cases.length - fails}/${cases.length} passed`);
process.exit(fails ? 1 : 0);
