// In-page controller traversal suite: __game.selfTest() → {pass, total, rows}. Uses the real house colliders.
const PI = Math.PI;
const CASES = [
  ['table from floor', [3.9, 0, 7.5, 0], [{ t: 0.3, y: 1 }, { t: 0.25, y: 1, jump: 1 }, { t: 0.6 }], /table:top/],
  ['table holding forward', [3.9, 0, 7.5, 0], [{ t: 0.2, y: 1 }, { t: 0.5, y: 1, jump: 1 }, { t: 0.1 }], /table:top/],
  ['chair then table', [4.4, 0, 7.2, 0], [{ t: 0.1, y: 1 }, { t: 0.4, y: 0.6, jump: 1 }, { t: 0.4 }, { t: 0.35, y: 1, jump: 1 }, { t: 0.5 }], /table:top/],
  ['counter from bench side', [4.4, 0, 9.95, 0], [{ t: 0.4, y: 1, jump: 1 }, { t: 0.5 }], /counter/],
  ['microwave to fridge', [4.95, 1.27, 10.72, PI / 2], [{ t: 0.45, y: 1, jump: 1 }, { t: 0.5 }], /fridge/],
  ['fridge holding forward', [4.95, 1.27, 10.72, PI / 2], [{ t: 0.6, y: 1, jump: 1 }, { t: 0.1 }], /fridge/],
  ['windowsill', [3.0, 0, 1.4, PI], [{ t: 0.3, y: 1 }, { t: 0.5, y: 1, jump: 1 }, { t: 0.4 }], /windowsill/],
  ['stairs up', [8.65, 0, 0.45, 0], [{ t: 2.6, y: 1 }], /floorUF/],
  ['stairs down', [8.65, 3, 5.4, PI], [{ t: 2.8, y: 1 }], /floorGF/],
  ['under the table', [3.9, 0, 7.4, 0], [{ t: 1.2, y: 1 }], /floorGF/],
  ['sofa', [2.6, 0, 2.75, PI / 2], [{ t: 0.2, y: 1 }, { t: 0.5, y: 1, jump: 1 }, { t: 0.4 }], /sofa/],
];

export function selfTest(g) {
  const c = g.sys.controller, saved = { pos: c.pos.clone(), rot: g.sys.garfield.root.rotation.y, yaw: g.sys.camera.yaw };
  const rows = [];
  for (const [name, [x, y, z, r], steps, want] of CASES) {
    g.teleport(x, y, z, r);
    g.sys.camera.yaw = r + PI;
    const end = g.sim(steps).pop();
    rows.push(`${want.test(end) ? 'PASS' : 'FAIL'} ${name}: ${end}`);
  }
  c.teleport(saved.pos, saved.rot);
  g.sys.camera.yaw = saved.yaw;
  return { pass: rows.filter((r) => r.startsWith('PASS')).length, total: rows.length, rows };
}
