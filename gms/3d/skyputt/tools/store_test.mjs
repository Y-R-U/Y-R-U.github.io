#!/usr/bin/env node
// Save-store tests: node tools/store_test.mjs  (no storage, a working fake, a corrupt blob, a throwing one)
import { Store, starsFor } from '../js/app/store.js';
import { COURSES } from '../js/course/holes/index.js';
let fails = 0; const ok = (c, m) => { console.log(c ? '  ok  ' : '  FAIL', m); if (!c) fails++; };
const course = COURSES.sky;

let s = new Store();   // no localStorage at all in node
ok(s.data.helpers.longSight === 3 && s.data.coins === 0, 'no storage → fresh save, nothing throws');
s.recordHole('sky1', 2, 2, false); ok(true, 'saving without storage does not throw');

const mem = {}; globalThis.localStorage = { getItem: k => mem[k] ?? null, setItem: (k, v) => { mem[k] = String(v); } };
s = new Store();
ok(s.unlockedCount(course) === 1, 'only hole 1 open at first');
let r = s.recordHole('sky1', 1, 2, false); s.markFinished('sky1');
ok(r.stars === 3 && r.newBest, 'ace on par 2 → 3 stars, new best');
ok(s.unlockedCount(course) === 2, 'finishing hole 1 unlocks hole 2');
r = s.recordHole('sky1', 4, 2, false);
ok(r.stars === 1 && s.hole('sky1').stars === 3 && s.hole('sky1').best === 1, 'a worse round keeps best + stars');
s.addCoins(15); ok(new Store().data.coins === 15, 'coins persist');
ok(s.useHelper('mulligan') && new Store().helpers().mulligan === 2, 'helpers persist');
ok(starsFor(5, 3, true) === 0 && starsFor(3, 3) === 2 && starsFor(4, 3) === 1, 'star rules');

mem['skyputt.save.v1'] = '{not json';
ok(new Store().data.helpers.longSight === 3, 'corrupt blob → fresh save');
globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
s = new Store(); s.addCoins(5); ok(s.data.coins === 5, 'throwing storage → works in memory');
console.log(fails ? `${fails} failed` : 'all passed'); process.exit(fails ? 1 : 0);
