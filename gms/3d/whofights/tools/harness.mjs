// The assertions and the registry a *.test.mjs file imports. Separate from tools/test.mjs because
// the runner has a top-level await: a test file importing the runner back would deadlock the graph.

export const queue = [];
let file = '';

export const setFile = f => { file = f; };

export function test(name, fn) { queue.push({ file, name, fn }); }

export function eq(got, want, why = '') {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) throw new Error(`${why || 'not equal'}\n    got  ${a}\n    want ${b}`);
}

export function ok(v, why = 'expected truthy') {
  if (!v) throw new Error(why);
}

export function near(got, want, tol = 1e-6, why = '') {
  if (Math.abs(got - want) > tol) throw new Error(`${why || 'not near'}: got ${got}, want ${want} ±${tol}`);
}

export function throws(fn, why = 'expected a throw') {
  try { fn(); } catch { return; }
  throw new Error(why);
}
