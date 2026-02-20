// test-utils.js — Math/utility unit tests
(function () {
  const suite = TestRunner.suite('Math Utilities');

  suite.test('Vec2 creation', () => {
    const v = new MathUtils.Vec2(3, 4);
    assert(v.x === 3, 'Vec2.x = 3');
    assert(v.y === 4, 'Vec2.y = 4');
  });

  suite.test('Vec2.add', () => {
    const a = new MathUtils.Vec2(1, 2);
    const b = new MathUtils.Vec2(3, 4);
    const c = a.add(b);
    assert(c.x === 4, 'Vec2.add x = 4');
    assert(c.y === 6, 'Vec2.add y = 6');
  });

  suite.test('Vec2.sub', () => {
    const a = new MathUtils.Vec2(5, 7);
    const b = new MathUtils.Vec2(2, 3);
    const c = a.sub(b);
    assert(c.x === 3, 'Vec2.sub x');
    assert(c.y === 4, 'Vec2.sub y');
  });

  suite.test('Vec2.length', () => {
    const v = new MathUtils.Vec2(3, 4);
    assert(Math.abs(v.length() - 5) < 0.001, 'Vec2.length = 5');
  });

  suite.test('Vec2.normalize', () => {
    const v = new MathUtils.Vec2(3, 4);
    const n = v.normalize();
    assert(Math.abs(n.length() - 1) < 0.001, 'normalized length = 1');
  });

  suite.test('Vec2.normalize zero vector', () => {
    const v = new MathUtils.Vec2(0, 0);
    const n = v.normalize();
    assert(n.x === 0 && n.y === 0, 'zero vector normalizes to (0,0)');
  });

  suite.test('Vec2.scale', () => {
    const v = new MathUtils.Vec2(2, 3);
    const s = v.scale(2);
    assert(s.x === 4 && s.y === 6, 'Vec2.scale works');
  });

  suite.test('Vec2.dot', () => {
    const a = new MathUtils.Vec2(1, 0);
    const b = new MathUtils.Vec2(0, 1);
    assert(a.dot(b) === 0, 'perpendicular dot = 0');
    const c = new MathUtils.Vec2(1, 0);
    assert(a.dot(c) === 1, 'parallel dot = 1');
  });

  suite.test('Vec2.distTo', () => {
    const a = new MathUtils.Vec2(0, 0);
    const b = new MathUtils.Vec2(3, 4);
    assert(Math.abs(a.distTo(b) - 5) < 0.001, 'distTo = 5');
  });

  suite.test('Vec2.fromAngle', () => {
    const v = MathUtils.Vec2.fromAngle(0);
    assert(Math.abs(v.x - 1) < 0.001 && Math.abs(v.y) < 0.001, 'fromAngle(0) = (1,0)');
  });

  suite.test('Vec2.lerp', () => {
    const a = new MathUtils.Vec2(0, 0);
    const b = new MathUtils.Vec2(10, 10);
    const c = a.lerp(b, 0.5);
    assert(c.x === 5 && c.y === 5, 'lerp at 0.5');
  });

  suite.test('Vec2.rotate', () => {
    const v = new MathUtils.Vec2(1, 0);
    const r = v.rotate(Math.PI / 2);
    assert(Math.abs(r.x) < 0.001 && Math.abs(r.y - 1) < 0.001, 'rotate 90deg = (0,1)');
  });

  suite.test('circlesOverlap - overlapping', () => {
    assert(MathUtils.circlesOverlap(0, 0, 10, 5, 0, 10), 'circles overlap');
  });

  suite.test('circlesOverlap - not overlapping', () => {
    assert(!MathUtils.circlesOverlap(0, 0, 5, 20, 0, 5), 'circles do not overlap');
  });

  suite.test('circlesOverlap - edge case touching', () => {
    // Exactly touching (distance = sum of radii) should NOT overlap (strict <)
    assert(!MathUtils.circlesOverlap(0, 0, 5, 10, 0, 5), 'touching circles not overlapping (strict)');
  });

  suite.test('clamp', () => {
    assert(MathUtils.clamp(5, 0, 10) === 5, 'clamp within range');
    assert(MathUtils.clamp(-5, 0, 10) === 0, 'clamp below min');
    assert(MathUtils.clamp(15, 0, 10) === 10, 'clamp above max');
  });

  suite.test('lerp', () => {
    assert(MathUtils.lerp(0, 10, 0.5) === 5, 'lerp 0.5');
    assert(MathUtils.lerp(0, 10, 0) === 0, 'lerp at 0');
    assert(MathUtils.lerp(0, 10, 1) === 10, 'lerp at 1');
  });

  suite.test('randomRange', () => {
    for (let i = 0; i < 100; i++) {
      const v = MathUtils.randomRange(5, 10);
      assert(v >= 5 && v <= 10, `randomRange in [5,10]: ${v}`);
    }
  });

  suite.test('randomAngle', () => {
    const a = MathUtils.randomAngle();
    assert(a >= 0 && a < Math.PI * 2, 'randomAngle in [0, 2π)');
  });

  suite.test('shuffle preserves elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = MathUtils.shuffle(arr);
    assert(shuffled.length === arr.length, 'shuffle preserves length');
    assert(arr.every(v => shuffled.includes(v)), 'shuffle preserves all elements');
  });

  suite.test('choose returns element from array', () => {
    const arr = ['a', 'b', 'c'];
    const v = MathUtils.choose(arr);
    assert(arr.includes(v), 'choose returns array element');
  });

  suite.test('dist', () => {
    assert(Math.abs(MathUtils.dist(0, 0, 3, 4) - 5) < 0.001, 'dist(0,0,3,4) = 5');
  });

  suite.test('distSq', () => {
    assert(MathUtils.distSq(0, 0, 3, 4) === 25, 'distSq(0,0,3,4) = 25');
  });

  suite.run();
})();
