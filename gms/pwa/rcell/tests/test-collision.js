// test-collision.js — Collision system tests
(function () {
  const suite = TestRunner.suite('Collision System');

  suite.test('circle-circle: clear overlap', () => {
    assert(Collision.circleCircle(0, 0, 10, 5, 0, 10), 'circles overlap when dist < r1+r2');
  });

  suite.test('circle-circle: no overlap', () => {
    assert(!Collision.circleCircle(0, 0, 5, 20, 0, 5), 'circles do not overlap when dist > r1+r2');
  });

  suite.test('circle-circle: edge case touching exactly', () => {
    // Distance = 10, r1+r2 = 10: strictly < so should be false
    assert(!Collision.circleCircle(0, 0, 5, 10, 0, 5), 'touching exactly is not overlapping (strict <)');
  });

  suite.test('circle-circle: inside each other', () => {
    assert(Collision.circleCircle(0, 0, 20, 1, 0, 5), 'one circle inside other');
  });

  suite.test('circle-circle: same center', () => {
    assert(Collision.circleCircle(5, 5, 10, 5, 5, 10), 'same center always overlaps');
  });

  suite.test('circle-circle: zero radius', () => {
    assert(!Collision.circleCircle(0, 0, 0, 10, 0, 0), 'zero radius circles at distance: no overlap');
    assert(Collision.circleCircle(0, 0, 0, 0, 0, 5), 'point inside circle');
  });

  suite.test('point in circle: inside', () => {
    assert(Collision.pointInCircle(5, 5, 5, 5, 10), 'point at center is inside');
    assert(Collision.pointInCircle(5, 5, 0, 0, 10), 'point at (5,5) in circle (0,0,10)');
  });

  suite.test('point in circle: outside', () => {
    assert(!Collision.pointInCircle(15, 0, 0, 0, 10), 'point outside circle');
  });

  suite.test('spatial hash query finds nearby entities', () => {
    Collision.reset(50);
    const entities = [
      { x: 25, y: 25, radius: 10 },
      { x: 100, y: 100, radius: 10 },
      { x: 200, y: 200, radius: 10 }
    ];
    Collision.build(entities);
    const results = Collision.query(25, 25, 20);
    assert(results.includes(entities[0]), 'nearby entity found in hash');
    assert(!results.includes(entities[2]), 'far entity not in query results');
  });

  suite.test('checkOne finds overlapping entity', () => {
    const a = { x: 0, y: 0, radius: 10 };
    const b = { x: 5, y: 0, radius: 10 };
    const c = { x: 100, y: 0, radius: 10 };
    const results = Collision.checkOne(a, [b, c]);
    assert(results.includes(b), 'overlapping entity b found');
    assert(!results.includes(c), 'far entity c not found');
  });

  suite.test('checkOne excludes self', () => {
    const a = { x: 0, y: 0, radius: 10 };
    const results = Collision.checkOne(a, [a]);
    assert(results.length === 0, 'self is excluded from checkOne');
  });

  suite.test('AABB collision via circle-circle for 45deg overlap', () => {
    // Two circles at 45 degrees
    const r1 = 10, r2 = 10;
    const dx = 10, dy = 10;
    const dist = Math.sqrt(dx*dx + dy*dy); // ~14.14
    const overlaps = dist < r1 + r2; // 14.14 < 20 → true
    assert(overlaps, '45-degree overlap detected');
    assert(Collision.circleCircle(0, 0, r1, dx, dy, r2), 'circleCircle matches manual check');
  });

  suite.run();
})();
