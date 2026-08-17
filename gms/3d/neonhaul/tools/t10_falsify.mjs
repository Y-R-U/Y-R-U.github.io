#!/usr/bin/env node
// Obligation T10's falsification test. The point of the `hook()` helper is that a MISSING isolation
// hook aborts the gate instead of silently no-opping and letting it report a clean number. That
// claim is worthless unless we watch it fail, so this asserts both directions:
//
//   1. a hook that exists      → returns normally, and the scene actually changed
//   2. a hook that does NOT    → throws, with T10 named in the message
//   3. the OLD `X && X(...)`   → resolves quietly to undefined, proving the bug was real
//
//   node tools/t10_falsify.mjs

import { open, parseArgs, waitFor, settle, evalJSON, hook, cleanup } from './shot.mjs';

const args = parseArgs();
const out = [];
function t(name, pass, detail) {
  out.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${detail}`);
}

const ctx = await open({ w: 800, h: 500, dpr: 1, headed: !!args.headed });
const { S, base, close } = ctx;
try {
  await S('Page.navigate', { url: `${base}/index.html?debug=1&var=deepnight&nosave&nohud` });
  await waitFor(S, 'window.__ready', 40000);
  await settle(S, 20);

  // 1 — the real hook works AND has an observable effect, so we know we are testing a live path.
  //     The observable is the LIVE MESH FLAG the isolation actually flips, plus the count of
  //     derived layers it carries with it (obligation T7). `__state.city.signsVisible` does not
  //     exist, and a test whose "before" and "after" are both `null` proves nothing — that is the
  //     project's dominant failure mode wearing the costume of a T10 test.
  const seen = () => evalJSON(S, `(() => {
    const s = window.__game.signage;
    const d = s.derived ? s.derived.all : [];
    return { neon: s.neon.mesh.visible, box: s.box.mesh.visible, hero: s.heroF.mesh.visible,
      derived: d.length, derivedVisible: d.filter(m => m.visible).length };
  })()`);
  const before = await seen();
  await hook(S, 'setSignVisible', false, true);
  const after = await seen();
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  t('an EXISTING hook is called and its effect is observable',
    changed && before.neon === true && after.neon === false && after.derivedVisible === 0,
    `sign meshes neon/box/hero ${before.neon}/${before.box}/${before.hero} → `
    + `${after.neon}/${after.box}/${after.hero}; derived layers carried with them `
    + `${before.derivedVisible}/${before.derived} → ${after.derivedVisible}/${after.derived} visible`);
  await hook(S, 'setSignVisible', true, true);
  const restored = await seen();
  t('…and the isolation is RESTORED, so a later gate on the same page is not measuring a hidden city',
    restored.neon === true && restored.derivedVisible === restored.derived,
    `neon ${restored.neon}, derived ${restored.derivedVisible}/${restored.derived} visible again`);

  // 2 — the whole point. A missing hook must ABORT, not soften.
  let threw = null;
  try {
    await hook(S, 'setRainAbsolutelyNotAHook', false);
  } catch (e) { threw = e.message; }
  t('a MISSING hook THROWS instead of silently no-opping',
    !!threw && /T10/.test(threw) && /MISSING/.test(threw),
    threw ? threw.slice(0, 220) : 'NO THROW — the assertion does not fire, T10 is not fixed');

  // 3 — demonstrate the original bug on the very same missing name, so the fix is measured against
  //     the defect rather than against nothing.
  const old = await evalJSON(S,
    'window.__game.setRainAbsolutelyNotAHook && window.__game.setRainAbsolutelyNotAHook(false)');
  t('the OLD `X && X(...)` form resolves QUIETLY to undefined (the bug being fixed)',
    old === undefined || old === null || old === false,
    `old form returned ${JSON.stringify(old)} with no error — a gate using this would have gone on ` +
    `to report a clean number on an un-isolated scene`);
} finally {
  await close?.();
  cleanup(ctx.proc);
}

const bad = out.filter(o => !o.pass);
console.log(`\n${out.length - bad.length}/${out.length} passed`);
process.exit(bad.length ? 1 : 0);
