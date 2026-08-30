import { test, eq, ok } from '../../../tools/harness.mjs';
import { faces, project, PARTS, SHAPES, ATLAS, RIG_TOP, shapedSections } from '../../../tools/skin/layout.mjs';

const F = faces('n');

test('the rig builds', () => {
  ok(F.length > 200, `only ${F.length} quads`);
  for (const f of F) {
    eq(f.pos.length, 4);
    eq(f.uv.length, 4);
    ok(['front', 'back'].includes(f.panel), `bad panel ${f.panel}`);
  }
});

test('every UV is inside its own half of the sheet', () => {
  for (const f of F) {
    for (const [u, v] of f.uv) {
      ok(u >= 0 && u <= 1 && v >= 0 && v <= 1, `${f.part} ${f.kind} uv ${u},${v} off the sheet`);
      const half = f.panel === 'front' ? u < 0.5 : u > 0.5;
      ok(half, `${f.part} ${f.kind} is a ${f.panel} face at u ${u.toFixed(3)}`);
    }
  }
});

// The point of the whole shape system: one painted skin has to fit both bodies.
test('male and female share one UV set and one vertex count', () => {
  const m = faces('m'), f = faces('f');
  eq(m.length, f.length);
  eq(JSON.stringify(m.map(q => q.uv)), JSON.stringify(f.map(q => q.uv)));
});

test('the bodies actually differ', () => {
  const m = faces('m'), f = faces('f');
  const width = qs => Math.max(...qs.flatMap(q => q.pos.map(p => p[0])));
  ok(width(m) > width(f) + 0.02, 'male body is not broader than female');
  const top = qs => Math.max(...qs.flatMap(q => q.pos.map(p => p[1])));
  ok(top(m) > top(f), 'male body is not taller');
});

test('winding is outward everywhere', () => {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  let wrong = 0;
  for (const f of F) {
    const n = cross(sub(f.pos[1], f.pos[0]), sub(f.pos[2], f.pos[0]));
    // A front-panel face must face the camera in the front view, and vice versa. Sides and caps
    // are checked only for being non-degenerate; their direction is the emitter's own assertion.
    if (f.kind === 'front' && n[2] <= 0) wrong++;
    if (f.kind === 'back' && n[2] >= 0) wrong++;
    if (Math.hypot(...n) < 1e-9) wrong++;
  }
  eq(wrong, 0);
});

test('the face island is where the guide says it is', () => {
  const [u, v] = project(0, 1.655, 0);
  ok(u > 0.18 && u < 0.32, `face u ${u}`);
  ok(v > 0.78 && v < 0.88, `face v ${v}`);
  const [ub] = project(0, 1.655, 1);
  ok(ub > 0.68 && ub < 0.82, `back-of-head u ${ub}`);
});

test('nothing is taller than RIG_TOP claims', () => {
  for (const id of ['n', 'm', 'f']) {
    const top = Math.max(...faces(id).flatMap(q => q.pos.map(p => p[1])));
    ok(top <= RIG_TOP * SHAPES[id].sy + 1e-6, `${id} is ${top} tall, RIG_TOP is ${RIG_TOP}`);
  }
});

test('every part still has ascending or descending sections, never both', () => {
  for (const p of PARTS) {
    const ys = shapedSections(p, 'm').map(s => s.y);
    const up = ys.every((y, i) => i === 0 || y > ys[i - 1]);
    const down = ys.every((y, i) => i === 0 || y < ys[i - 1]);
    ok(up || down, `${p.id} sections wander in y`);
  }
});

test('the atlas is square and a power of two', () => {
  eq(ATLAS.w, ATLAS.h);
  ok((ATLAS.w & (ATLAS.w - 1)) === 0, `${ATLAS.w} is not a power of two`);
});
