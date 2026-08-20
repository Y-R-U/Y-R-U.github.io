#!/usr/bin/env node
// §S2-L's gates — the dashboard Aaron asked for twice.
//
//   node tools/gates_s2l.mjs [--headed] [--land] [--w= --h=]
//
// D1  no flight control sits above the control lip, in EITHER flipSides state
// D2  every visible control hit-tests to itself, in either state, with the settings panel closed
// D3  every key in the lip is >= 44 CSS px in its smaller dimension
// D4  the cabin is <= 5 draw calls and `roof` is not in the live part list
// D5  looking straight up shows sky, not cabin
// D6  the dashboard's share of the frame, and the seam between its two surfaces
//
// **Every check is falsified in-suite**, because this phase exists to fix two defects that shipped
// through a fully green board. D1 moves a key back where the shipped build had it; D2 drops a sheet
// over one; D3 shaves a key to 43.4 px; D4 and D5 put the roof back through `testRoof`; D6 grows
// the lip under a layout that has already been computed.
//
// D1 is the one no gate has ever asserted. gates_s2k asked "is this key out of the flying HALF",
// which was the right question for a console on one edge and the wrong one for a lip that runs edge
// to edge: half the lip is in the flying half by construction and that is fine, because the stick
// only ever needs the frame ABOVE it. See the note over `offenders()`.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON } from './shot.mjs';

async function evalAsyncJSON(S, expr) {
  const r = await S('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LAND = !!args.land;
const W = +(args.w || (LAND ? 844 : 390)), H = +(args.h || (LAND ? 390 : 844));
const TAG = LAND ? ' landscape' : ' portrait';
const OUT = resolve(ROOT, 'shots/s2l');
mkdirSync(OUT, { recursive: true });
const FILE = resolve(OUT, `_gates${LAND ? '_land' : ''}.json`);

const ok = [], fail = [], detail = {};
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  detail[name] = det;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(det).replace(/\n/g, '\n      ')}`);
  try {
    writeFileSync(FILE, JSON.stringify({ view: `${W}x${H}`, at: new Date().toISOString(),
      total: ok.length + fail.length, passed: ok.length, failed: fail.length, ok, fail, detail }, null, 1));
  } catch { /* a full disk must not swallow the console above */ }
}

async function shot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/s2l/${name}.png`;
}

// Every control's box, its own centre hit-tested, and where the lip's top edge is. Raw floats: the
// S2-G lesson is that a check comparing `r.height >= 36` while printing `Math.round(r.height)`
// passed a 35.99 px tab and printed "36 px tall". Everything below prints what it compared.
// (No backticks inside the page source: it is inside a template literal. Fifth time on this run.)
const boxes = S => evalJSON(S, `(() => {
  const flip = document.getElementById('controls').classList.contains('flipped');
  const lip = document.getElementById('conspad').getBoundingClientRect();
  const probe = document.getElementById('lipsize').getBoundingClientRect();
  const out = [];
  for (const el of document.querySelectorAll('#controls .ctl-btn')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const hit = document.elementFromPoint(Math.round(cx), Math.round(cy));
    out.push({ id: el.id || el.className,
      x0: +r.x.toFixed(2), x1: +(r.x + r.width).toFixed(2),
      y0: +r.y.toFixed(2), y1: +(r.y + r.height).toFixed(2),
      w: +r.width.toFixed(2), h: +r.height.toFixed(2),
      inLip: !!el.closest('#conspad'),
      self: !!(hit && (hit === el || el.contains(hit))),
      over: hit ? (hit.id || hit.className) : null });
  }
  return { flip, w: innerWidth, h: innerHeight,
    lip: { top: +lip.y.toFixed(2), h: +lip.height.toFixed(2), x0: +lip.x.toFixed(2), x1: +(lip.x + lip.width).toFixed(2) },
    probe: +probe.height.toFixed(2), btns: out };
})()`);

// A control is a FLIGHT control iff its box moves when the movement side is flipped. That is the
// layout's own contract and not a name list — #btn-view and the cog do not move, because they are
// HUD corner furniture, so they exempt themselves by measurement. gates_s2k derived it the same
// way and this reuses the derivation deliberately: the two suites must not disagree about which
// controls belong to a thumb.
//
// The RULE, and it is the new one: a flight control must lie entirely at or below the top of the
// lip. Not "out of the flying half" — the lip spans the whole width, so half of it is in the flying
// half whatever the flip, and that is correct. The stick is FLOATING (js/controls.js: its origin is
// wherever the finger lands), so what has to be empty is the frame ABOVE the lip, all of it, both
// halves. Aaron reported the same defect twice against two different half-rules.
function offenders(st, mirrors) {
  return st.btns.filter(b => mirrors.has(b.id) && b.y0 < st.lip.top - 0.5);
}

const setFlip = async (S, v) => {
  await evalJSON(S, `(() => { __game.applySettings({ flipSides: ${v} }); return 1; })()`);
  await settle(S, 6);
};

async function d1d2d3(S) {
  await setFlip(S, false);
  const st0 = await boxes(S);
  await setFlip(S, true);
  const st1 = await boxes(S);
  const by = st => Object.fromEntries(st.btns.map(b => [b.id, b]));
  const a0 = by(st0), a1 = by(st1);
  const mirrors = new Set(Object.keys(a0).filter(k => a1[k] && a1[k].x0 !== a0[k].x0));

  check(`D1 the controls that belong to a thumb are exactly the ones that mirror with the flip${TAG}`,
    mirrors.has('btn-auto') && mirrors.has('btn-home') && mirrors.has('btn-squelch')
      && mirrors.has('btn-boost') && mirrors.has('btn-up') && mirrors.has('btn-down')
      && !mirrors.has('btn-view') && !mirrors.has('btn-settings'),
    `mirrored (flight controls, must be in the lip): ${[...mirrors].sort().join(', ')}\n`
    + `fixed (HUD corner furniture, exempt by measurement rather than by name): `
    + `${Object.keys(a0).filter(k => !mirrors.has(k)).sort().join(', ')}`);

  for (const [flip, st] of [[false, st0], [true, st1]]) {
    await setFlip(S, flip);
    const png = await shot(S, `lip_flip${flip ? 1 : 0}${LAND ? '_land' : ''}`);
    const bad = offenders(st, mirrors);
    check(`D1 nothing that flies the craft is above the lip — flipSides=${flip}${TAG}`,
      bad.length === 0 && st.btns.length >= 6 && st.flip === flip && st.lip.h > 0
        && st.lip.x0 <= 0.5 && st.lip.x1 >= st.w - 0.5,
      `${st.btns.length} visible controls at ${st.w}x${st.h}; the lip's top edge is y ${st.lip.top} `
      + `and it spans x ${st.lip.x0}-${st.lip.x1} of ${st.w} (edge to edge: `
      + `${st.lip.x0 <= 0.5 && st.lip.x1 >= st.w - 0.5})\n`
      + `offenders (a flight control with any part above the lip): `
      + `${bad.length ? bad.map(b => `${b.id} y${b.y0}-${b.y1}`).join(', ') : 'none'}\n`
      + st.btns.map(b => `  ${b.id.padEnd(13)} y ${String(b.y0).padStart(7)}-${String(b.y1).padStart(7)}  `
        + `${b.inLip ? 'in the lip' : 'corner furniture'}`).join('\n')
      + `\n${png}`);

    const covered = st.btns.filter(b => !b.self);
    const panel = await evalJSON(S, `(() => !document.getElementById('settings').classList.contains('hidden'))()`);
    check(`D2 every visible control hit-tests to itself — flipSides=${flip}${TAG}`,
      covered.length === 0 && panel === false,
      covered.length ? covered.map(b => `${b.id} centre hit-tests to ${b.over}`).join('; ')
        : `all ${st.btns.length} of them, at ${st.w}x${st.h}, with the settings panel closed `
        + `(open: ${panel}) — a box that exists and is covered reports its own rect happily, which is `
        + `why this is elementFromPoint and not getBoundingClientRect`);

    const keys = st.btns.filter(b => b.inLip);
    const small = keys.map(b => ({ id: b.id, min: Math.min(b.w, b.h) }));
    const worst = small.reduce((a, b) => (b.min < a.min ? b : a), { id: '-', min: 1e9 });
    check(`D3 every key in the lip is >= 44 CSS px in its smaller dimension — flipSides=${flip}${TAG}`,
      keys.length >= 6 && worst.min >= 44,
      `${keys.length} keys; smallest dimension per key, RAW — the number compared is the number `
      + `printed, because gates_s2d once passed a 35.99 px tab while printing "36 px tall":\n`
      + small.map(s => `  ${s.id.padEnd(13)} ${s.min.toFixed(2)} px`).join('\n')
      + `\n  worst ${worst.id} at ${worst.min.toFixed(2)} px against the 44 floor`);
  }

  // FALSIFY D1 — put a key back where the shipped build had it: an edge, at mid-height.
  await setFlip(S, false);
  const before = offenders(await boxes(S), mirrors).length;
  await evalJSON(S, `(() => {
    const b = document.querySelector('#btn-home');
    b.dataset.s2lSaved = b.style.cssText;
    b.style.cssText += ';position:fixed;left:14px;bottom:280px;right:auto;';
    return 1;
  })()`);
  await settle(S, 4);
  const after = offenders(await boxes(S), mirrors);
  const pngF = await shot(S, `falsify_above_lip${LAND ? '_land' : ''}`);
  await evalJSON(S, `(() => {
    const b = document.querySelector('#btn-home');
    b.style.cssText = b.dataset.s2lSaved || ''; delete b.dataset.s2lSaved; return 1;
  })()`);
  await settle(S, 4);
  const restored = offenders(await boxes(S), mirrors).length;
  check(`D1 FALSIFY — the check catches a key floating above the lip${TAG}`,
    before === 0 && after.length === 1 && after[0].id === 'btn-home' && restored === 0,
    `clean ${before} offenders → HOME forced to the left edge at mid-height → ${after.length} `
    + `(${after.map(b => `${b.id} y${b.y0}`).join(',') || 'none'}) → restored ${restored}\n${pngF}`);

  // FALSIFY D2 — drop a sheet over one key and require the same hit-test to see it.
  await evalJSON(S, `(() => {
    const b = document.querySelector('#btn-boost').getBoundingClientRect();
    const d = document.createElement('div');
    d.id = 's2l-veil';
    d.style.cssText = 'position:fixed;z-index:99;pointer-events:auto;background:rgba(255,0,0,.3);left:'
      + (b.x - 4) + 'px;top:' + (b.y - 4) + 'px;width:' + (b.width + 8) + 'px;height:' + (b.height + 8) + 'px';
    document.body.appendChild(d);
    return 1;
  })()`);
  await settle(S, 4);
  const veiled = (await boxes(S)).btns.filter(b => !b.self);
  await evalJSON(S, `(() => { document.getElementById('s2l-veil').remove(); return 1; })()`);
  await settle(S, 4);
  const unveiled = (await boxes(S)).btns.filter(b => !b.self);
  check(`D2 FALSIFY — the same hit-test catches a covered key${TAG}`,
    veiled.length === 1 && veiled[0].id === 'btn-boost' && veiled[0].over === 's2l-veil'
      && unveiled.length === 0,
    `a sheet over BOOST → ${veiled.length} covered `
    + `(${veiled.map(b => `${b.id} by ${b.over}`).join(', ') || 'none'}) → removed → ${unveiled.length}`);

  // FALSIFY D3 — shave one key under the floor and require the same comparison to reject it.
  await evalJSON(S, `(() => {
    const b = document.querySelector('#btn-auto');
    b.dataset.s2lSaved = b.style.cssText;
    b.style.height = '43.4px';
    return 1;
  })()`);
  await settle(S, 4);
  const shaved = (await boxes(S)).btns.filter(b => b.inLip).map(b => ({ id: b.id, min: Math.min(b.w, b.h) }));
  const shavedWorst = shaved.reduce((a, b) => (b.min < a.min ? b : a), { id: '-', min: 1e9 });
  await evalJSON(S, `(() => {
    const b = document.querySelector('#btn-auto');
    b.style.cssText = b.dataset.s2lSaved || ''; delete b.dataset.s2lSaved; return 1;
  })()`);
  await settle(S, 4);
  const back = (await boxes(S)).btns.filter(b => b.inLip)
    .reduce((a, b) => Math.min(a, b.w, b.h), 1e9);
  check(`D3 FALSIFY — the same comparison rejects a key shaved to 43.4 px${TAG}`,
    shavedWorst.id === 'btn-auto' && shavedWorst.min < 44 && back >= 44,
    `AUTO forced to 43.4 px → worst key ${shavedWorst.id} ${shavedWorst.min.toFixed(2)} px → `
    + `${shavedWorst.min >= 44 ? 'ACCEPTED, THE CHECK IS BROKEN' : 'REJECTED'} → restored, worst `
    + `${back.toFixed(2)} px`);
}

// ── D4 ─────────────────────────────────────────────────────────────────────
// The roof is what Aaron saw: *"there is a big black bar if i look up, it doesn't look good, have
// it all glass."* `roof_lip` and `roof_spar` are gone from PARTS and `roof` is out of
// ROLES_ALLOWED — which, found in this phase, NOTHING had ever read, so hud.js's own claim that
// "gates_p6 asserts the set of roles present is exactly ROLES_ALLOWED" was a comment and not a
// check. gates_p6 asserts the MESH roles (frame/rule/glass/dash/holo), which is a different list.
async function d4(S) {
  const before = await evalJSON(S, `(() => ({ roles: __game.cockpit.roles(), draws: __game.hudBreakdown().draws,
    meshes: __game.cockpitParts().map(p => p.name + ':' + p.role) }))()`);
  const setRoof = on => evalJSON(S, `(() => { __game.cockpit.testRoof(${on}); return 1; })()`);
  await setRoof(true);
  await settle(S, 4);
  const dirty = await evalJSON(S, `(() => ({ roles: __game.cockpit.roles(), draws: __game.hudBreakdown().draws,
    meshes: __game.cockpitParts().map(p => p.name + ':' + p.role) }))()`);
  await setRoof(false);
  await settle(S, 4);
  const after = await evalJSON(S, `(() => ({ roles: __game.cockpit.roles(), draws: __game.hudBreakdown().draws,
    meshes: __game.cockpitParts().map(p => p.name + ':' + p.role) }))()`);
  const clean = !before.roles.present.includes('roof') && !before.roles.allowed.includes('roof')
    && !before.meshes.some(m => m.endsWith(':roof'));
  const caught = dirty.meshes.some(m => m.endsWith(':roof'))
    && dirty.meshes.length === before.meshes.length + 1;
  check(`D4 the cabin is <= 5 draw calls and there is no roof in it${TAG}`,
    clean && caught && before.draws <= 5 && after.draws === before.draws
      && after.meshes.length === before.meshes.length,
    `${before.draws} draws (shell · rules · glass · dash · holo); ${before.meshes.length} meshes\n`
    + `PART roles present {${before.roles.present.join(', ')}} against ROLES_ALLOWED `
    + `{${before.roles.allowed.join(', ')}} — deleting the roof took it out of BOTH, and the two `
    + `A-pillars are the only parts with an alpha under 1:\n`
    + before.roles.parts.map(p => `  ${p.id.padEnd(11)} ${p.role.padEnd(8)} alpha ${p.alpha}`).join('\n')
    + `\nFALSIFIED: testRoof(true) put a roof mesh back — ${dirty.meshes.length} meshes `
    + `{${dirty.meshes.join(', ')}} — and the same read caught it (${caught}). Note that `
    + `hudBreakdown() still reports ${dirty.draws}, because it sums the FIVE NAMED meshes and knows `
    + `nothing about a sixth; the thing that catches a new mesh is the part list, which is why both `
    + `are read here. Removing it restored ${after.meshes.length} meshes and ${after.draws} draws`);
  return before.draws;
}

// ── D5 ─────────────────────────────────────────────────────────────────────
// Aaron's actual sentence, made into two numbers: *"there is a big black bar if i look up, it
// doesn't look good, have it all glass."*
//
// The look is pitched up by a REAL thumb drag, and the check asserts the drag worked before it
// asserts anything else — setting `flight.pitch` directly reads back as -0.06 while docked, so a
// version of this that trusted the assignment would have measured a level view and called it a
// clear sky.
//
// Then two independent statements, because either alone is weak:
//
//   GEOMETRY   no vertex of the cabin's solid shell projects into the top quarter of the frame.
//              Exact, deterministic, and immune to what the fog happens to be doing.
//   PIXELS     the top-centre cell of the composed frame is lit like sky rather than like
//              near-black metal.
//
// What this does NOT do is hide the shell and difference the two frames. That was the first
// version and it was wrong in the way this project keeps a list of: `dash_lip` is an OCCLUDER for
// the pad's fog glow, so hiding it floods the whole frame with haze and brightens cells the cabin
// never covered — an "isolation" that changed more than the thing under test. The screenshots are
// at /tmp and the effect is 0.85 of luminance at the bottom of the frame, against the 0.05 the
// check was reading at the top.
async function d5(ctx) {
  const { S, base } = ctx;
  await S('Page.navigate', { url: `${base}/index.html?nosave&debug&seed=7` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 60);
  await evalJSON(S, '(() => { __game.freezeTime(true); return 1; })()');
  await settle(S, 10);
  const pitch0 = await evalJSON(S, '(() => +__game.flight.pitch.toFixed(4))()');
  // A real thumb in the look half, dragged UP the screen, which is what tips the nose of the view
  // toward the sky. In as many strokes as a 390 px landscape frame needs — one stroke cannot cover
  // 60 degrees there — and the pitch it reached is asserted below rather than assumed.
  const pts = (x, y) => S('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] });
  for (let stroke = 0; stroke < 6; stroke++) {
    const y0 = H * 0.80, y1 = H * 0.16;
    await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: W * 0.72, y: y0, id: 1 }] });
    for (let i = 1; i <= 12; i++) { await pts(W * 0.72, y0 + (y1 - y0) * i / 12); await settle(S, 1); }
    await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle(S, 4);
    if (await evalJSON(S, '(() => __game.flight.pitch > 0.9)()')) break;
  }
  await settle(S, 20);
  const look = await evalJSON(S, `(() => ({ pitch: +__game.flight.pitch.toFixed(4),
    cam: +__game.camera.rotation.x.toFixed(4), cabin: __game.cockpit.group.visible,
    alt: +__state.player.alt.toFixed(1), view: __state.rig && __state.rig.mode }))()`);
  const png = await shot(S, `lookup${LAND ? '_land' : ''}`);

  // Every OPAQUE vertex of the shell — and of the roof mesh when the falsifier has put one back —
  // through the live camera. `top` is the highest normalised screen y any of them reaches: +1 is
  // the top of the frame, -1 the bottom.
  //
  // Opaque is read off the geometry's own RGBA vertex colour, which is the attribute that made the
  // A-pillars glass without splitting the mesh. So this is not a name list: a part is exempt from
  // "nothing solid overhead" exactly when it is see-through, and if a future part goes back to
  // alpha 1 it lands in this test automatically. The pillars ARE overhead in landscape and that is
  // the design — the manager kept them as a frame at the corner of the eye — but they are glass,
  // and the check says which is which rather than averaging them together.
  const shellTop = () => evalJSON(S, `(() => {
    const cp = __game.cockpit, cam = __game.camera, grp = cp.group;
    const v = grp.position.clone();
    let top = -9, glass = -9, n = 0, g = 0;
    for (const mesh of [cp.shell, cp._roof]) {
      if (!mesh || !mesh.visible) continue;
      const a = mesh.geometry.attributes.position, c = mesh.geometry.attributes.color;
      for (let i = 0; i < a.count; i++) {
        v.set(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(grp.matrix).project(cam);
        if (!(v.z > -1 && v.z < 1)) continue;
        const opaque = !c || c.getW(i) >= 0.999;
        if (opaque) { if (v.y > top) top = v.y; n++; } else { if (v.y > glass) glass = v.y; g++; }
      }
    }
    return { top: +top.toFixed(4), glassTop: +glass.toFixed(4), verts: n, glassVerts: g };
  })()`);
  const band = async () => {
    const g = await evalAsyncJSON(S, '(async () => JSON.stringify(await __game.probe({ grid: [3, 12] })))()');
    const cells = JSON.parse(g).grid.cells.filter(c => c.cy === 0).sort((a, b) => a.cx - b.cx);
    return { lum: cells.map(c => c.lum), mid: cells[1].lum };
  };

  const geoClean = await shellTop();
  const pixClean = await band();
  await evalJSON(S, '(() => { __game.cockpit.testRoof(true); return 1; })()');
  await settle(S, 10);
  const geoRoof = await shellTop();
  const pixRoof = await band();
  const pngR = await shot(S, `lookup_roofed${LAND ? '_land' : ''}`);
  await evalJSON(S, '(() => { __game.cockpit.testRoof(false); return 1; })()');
  await settle(S, 10);
  const geoBack = await shellTop();
  const pixBack = await band();

  // 0.5 is the top quarter of the frame. FLOOR is a luminance the roof cannot reach and the sky
  // comfortably clears; the falsification below is what makes it a number rather than a taste.
  const TOPQ = 0.5, FLOOR = 0.08, RATIO = 1.5;
  check(`D5 looking straight up shows sky, not cabin${TAG}`,
    look.pitch > 0.8 && look.cabin === true
      && geoClean.top < TOPQ && pixClean.mid >= FLOOR
      && geoRoof.top >= TOPQ && pixClean.mid >= pixRoof.mid * RATIO
      && Math.abs(geoBack.top - geoClean.top) < 1e-3 && Math.abs(pixBack.mid - pixClean.mid) < 0.002,
    `a real thumb dragged up the look half took the pitch ${pitch0} → ${look.pitch} rad `
    + `(${(look.pitch * 180 / Math.PI).toFixed(1)} deg up), camera ${look.cam}; the cabin is `
    + `visible (${look.cabin}) in the ${look.view} view at ${look.alt} m, clock frozen\n`
    + `  GEOMETRY — highest normalised screen y reached by any of ${geoClean.verts} OPAQUE shell `
    + `vertices: ${geoClean.top} against the top-quarter line ${TOPQ}. The ${geoClean.glassVerts} `
    + `see-through ones — the A-pillars, which the design keeps — reach ${geoClean.glassTop}\n`
    + `  PIXELS   — top-centre cell of the composed frame: ${pixClean.mid} `
    + `[row ${pixClean.lum.join(', ')}] against a floor of ${FLOOR}\n`
    + `FALSIFIED, both of them, by putting the roof back: geometry ${geoRoof.top} `
    + `(${geoRoof.verts} opaque vertices), pixels ${pixRoof.mid} [row ${pixRoof.lum.join(', ')}] — `
    + `${(pixClean.mid / Math.max(pixRoof.mid, 1e-4)).toFixed(2)}x darker at the centre, against the `
    + `${RATIO}x this check demands. Removing it returned ${geoBack.top} and ${pixBack.mid}\n`
    + `${png}\n${pngR}`);
}

// ── D6 ─────────────────────────────────────────────────────────────────────
// The two numbers the manager set: the dashboard's share of the frame, and whether the instrument
// top and the control lip are actually touching. The seam is the whole claim of the design — a
// laid-back 3D quad and a flat DOM strip only read as one moulding if the quad's bottom edge lands
// ON the lip's top edge.
async function d6(ctx) {
  const { S, base } = ctx;
  await S('Page.navigate', { url: `${base}/index.html?nosave&seed=7` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  const m = await evalJSON(S, `(() => {
    const ext = __game.cabinExtent(), lay = __game.hudLayout();
    const lip = document.getElementById('conspad').getBoundingClientRect();
    return { ext, dash: lay.dash, wide: lay.wide, H: innerHeight, W: innerWidth,
      lipTop: +lip.y.toFixed(2), lipH: +lip.height.toFixed(2) };
  })()`);
  // The quad's bottom edge, in CSS pixels from the top of the frame, through the same perspective
  // divide the camera uses. `planeBottom` is that edge in normalised screen y.
  const quadBottom = (1 - (m.ext.planeBottom + 1) / 2) * m.H;
  const seam = Math.abs(quadBottom - m.lipTop);
  const total = m.ext.totalPx;
  const CAP = LAND ? 96 : 150;
  check(`D6 the dashboard's share of the frame, measured${TAG}`,
    total <= CAP && Math.abs(m.ext.plane - m.ext.frac) <= 0.001,
    `at ${m.W}x${m.H} the whole dashboard — instrument quad seated on the control lip — is `
    + `${total.toFixed(2)} CSS px, ${(m.ext.frac * 100).toFixed(2)} % of the frame, against a cap of `
    + `${CAP}\n  control lip   ${m.ext.lipPx.toFixed(2)} px (${(m.ext.lipFrac * 100).toFixed(2)} %)\n`
    + `  instrument top ${(total - m.ext.lipPx).toFixed(2)} px, canvas ${m.dash.cw}x${m.dash.ch} at `
    + `pitch ${m.dash.pitch}\n`
    + `nothing in the 3D cabin reaches higher than the quad does (${m.ext.plane} vs ${m.ext.frac}), `
    + `so this one number is the whole of what the player reads as dashboard`);

  check(`D6 the instrument top is SEATED on the lip — the seam is an edge, not a gap${TAG}`,
    seam <= 1.0,
    `the quad's bottom edge projects to y ${quadBottom.toFixed(2)}; the lip's top edge is at `
    + `y ${m.lipTop.toFixed(2)}; seam ${seam.toFixed(2)} px\n`
    + `the quad is placed from the lip and not the other way round — the lip's height is the CSS `
    + `constant (a 44 px touch target is a CSS-pixel requirement, and a quad fitted first would `
    + `hand the lip whatever was left over), and layoutFor solves for the quad that sits on it`);

  // FALSIFY — grow the lip under a layout that has already been computed and require the same
  // measurement to see the seam open. This is also the real failure mode: anything that changes the
  // lip's height without re-running applyLayout leaves the two surfaces apart.
  const broke = await evalJSON(S, `(() => {
    document.documentElement.style.setProperty('--lip-h', '128px');
    const lip = document.getElementById('conspad').getBoundingClientRect();
    return { lipTop: +lip.y.toFixed(2) };
  })()`);
  const seamBroken = Math.abs(quadBottom - broke.lipTop);
  // …and require the game's own resize path to close it again.
  const fixed = await evalJSON(S, `(() => {
    document.documentElement.style.removeProperty('--lip-h');
    __game.cockpit.applyLayout();
    const ext = __game.cabinExtent();
    const lip = document.getElementById('conspad').getBoundingClientRect();
    return { lipTop: +lip.y.toFixed(2), planeBottom: ext.planeBottom, H: innerHeight };
  })()`);
  const seamFixed = Math.abs((1 - (fixed.planeBottom + 1) / 2) * fixed.H - fixed.lipTop);
  check(`D6 FALSIFY — the same measurement sees the seam open, and sees it close again${TAG}`,
    seamBroken > 40 && seamFixed <= 1.0,
    `--lip-h forced to 128 px with the layout left stale → the lip's top edge moved to `
    + `y ${broke.lipTop.toFixed(2)} and the seam opened to ${seamBroken.toFixed(2)} px `
    + `→ restored and applyLayout() re-run → ${seamFixed.toFixed(2)} px`);
}

(async () => {
  const ctx = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  const { S, base } = ctx;
  try {
    await S('Page.navigate', { url: `${base}/index.html?nosave=1&seed=7` });
    await waitFor(S, 'window.__ready', 60000);
    await settle(S, 30);
    await d1d2d3(S);
    await d4(S);
    await d6(ctx);        // navigates
    await d5(ctx);        // navigates, and needs ?debug for the pixel readback
  } catch (e) {
    console.error('\nSUITE THREW:', e && e.stack || e);
    fail.push('suite threw: ' + (e && e.message));
  } finally {
    console.log(`\n${ok.length}/${ok.length + fail.length} passed`
      + (fail.length ? `\nFAILED: ${fail.join(', ')}` : ''));
    writeFileSync(FILE, JSON.stringify({ view: `${W}x${H}`, at: new Date().toISOString(),
      total: ok.length + fail.length, passed: ok.length, failed: fail.length, ok, fail, detail }, null, 1));
    await ctx.close();
    process.exit(fail.length ? 1 : 0);
  }
})();
