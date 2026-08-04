// node js/puzzles/test-lock.mjs
// Loads the real puzzles.js in a bare sandbox (it only touches `window` at load
// time) and hammers HubPuzzles.scoreLock, the pure lock_deduce scorer.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const sandbox = { window: {}, console };
vm.createContext(sandbox);
new vm.Script(readFileSync(join(here, "puzzles.js"), "utf8"), { filename: "puzzles.js" }).runInContext(sandbox);
const { scoreLock } = sandbox.window.HubPuzzles;

let checks = 0;
let failures = 0;
const fail = (msg) => { failures += 1; console.error(`FAIL ${msg}`); };
const ok = (cond, msg) => { checks += 1; if (!cond) fail(msg); };

// Reference implementation, written independently of the one under test.
function reference(guess, answer) {
  const n = Math.min(guess.length, answer.length);
  let exact = 0;
  const gRest = [];
  const aRest = [];
  for (let i = 0; i < n; i += 1) {
    if (guess[i] === answer[i]) exact += 1;
    else { gRest.push(guess[i]); aRest.push(answer[i]); }
  }
  let near = 0;
  aRest.forEach(mark => {
    const at = gRest.indexOf(mark);
    if (at >= 0) { gRest.splice(at, 1); near += 1; }
  });
  return { exact, near };
}

const invariants = (guess, answer, label) => {
  const got = scoreLock(guess, answer);
  const want = reference(guess, answer);
  const slots = answer.length;
  ok(got.exact === want.exact && got.near === want.near,
    `${label} [${guess}] vs [${answer}] → ${got.exact}/${got.near}, expected ${want.exact}/${want.near}`);
  ok(got.exact + got.near <= slots, `${label} exact+near ${got.exact + got.near} > slots ${slots}`);
  ok(got.exact >= 0 && got.near >= 0, `${label} negative pip count`);
  // A mark absent from the answer can never earn a pip, so dropping every
  // occurrence of an unused mark must not change the score.
  const unused = ["Z", "Y"].find(m => !answer.includes(m));
  const padded = guess.concat();
  ok(scoreLock(padded, answer).exact === got.exact, `${label} padding changed exact`);
  if (unused) {
    const swapped = guess.map(m => (answer.includes(m) ? m : unused));
    const s = scoreLock(swapped, answer);
    const r = reference(swapped, answer);
    ok(s.exact === r.exact && s.near === r.near, `${label} absent-mark guess scored ${s.exact}/${s.near}`);
  }
};

// 1. Exhaustive over every guess/answer pair for 3 slots / 4 marks, including
//    every duplicate arrangement on both sides.
const alphabet = ["A", "B", "C", "D"];
const words = (len) => {
  let out = [[]];
  for (let i = 0; i < len; i += 1) out = out.flatMap(w => alphabet.map(m => w.concat(m)));
  return out;
};
for (const slots of [3, 4]) {
  const all = words(slots);
  all.forEach(answer => all.forEach(guess => invariants(guess, answer, `exhaustive/${slots}`)));
}

// 2. Named regressions from the shipped bug.
ok(scoreLock(["A", "A", "B"], ["A", "C", "D"]).near === 0, "duplicate guess mark double-counted as misplaced");
ok(scoreLock(["B", "A", "A"], ["A", "C", "D"]).near === 1, "one answer A should give exactly one hollow pip");
ok(scoreLock(["Z", "Z", "Z"], ["A", "B", "C"]).exact === 0, "absent marks scored exact");
ok(scoreLock(["Z", "Z", "Z"], ["A", "B", "C"]).near === 0, "absent marks scored misplaced");
ok(scoreLock(["A", "B", "C"], ["A", "B", "C"]).exact === 3, "perfect guess not all exact");
ok(scoreLock(["A", "B", "C"], ["A", "B", "C"]).near === 0, "perfect guess leaked misplaced pips");
ok(scoreLock(["B", "C", "A"], ["A", "B", "C"]).near === 3, "full rotation should be 3 misplaced");
// The reported symptom: the same guess with one mark swapped out for a mark
// that is not in the answer must lose pips, never keep them.
{
  const answer = ["A", "B", "C", "D"];
  const before = scoreLock(["A", "B", "C", "D"], answer);
  const after = scoreLock(["A", "B", "C", "Z"], answer);
  ok(after.exact + after.near < before.exact + before.near, "swapping in an absent mark did not lose a pip");
}

// 3. Randomised, larger alphabets and lengths, duplicates everywhere.
let seed = 12345;
const rand = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
const bigAlphabet = "ABCDEF".split("");
for (let i = 0; i < 40000; i += 1) {
  const slots = 2 + rand(4);
  const answer = Array.from({ length: slots }, () => bigAlphabet[rand(bigAlphabet.length)]);
  const guess = Array.from({ length: slots }, () => bigAlphabet[rand(bigAlphabet.length)]);
  invariants(guess, answer, "random");
}

// 4. Symmetry: scoring is symmetric in guess/answer for a well-formed scorer.
for (let i = 0; i < 5000; i += 1) {
  const slots = 2 + rand(4);
  const a = Array.from({ length: slots }, () => bigAlphabet[rand(bigAlphabet.length)]);
  const b = Array.from({ length: slots }, () => bigAlphabet[rand(bigAlphabet.length)]);
  const x = scoreLock(a, b);
  const y = scoreLock(b, a);
  ok(x.exact === y.exact && x.near === y.near, `asymmetric: [${a}] [${b}]`);
}

console.log(`${checks} assertions, ${failures} failures`);
process.exit(failures ? 1 : 0);
