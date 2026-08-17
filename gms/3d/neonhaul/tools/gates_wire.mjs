// tools/gates_wire.mjs — the INTEGRATION gates. Everything here needs a browser, which is exactly
// why none of it had ever run: P7a's economy is verified analytically only, `createZoneVisuals()`
// had never drawn a frame, and P8's audio layer was unreachable from the game.
//
// §13's two browser done-criteria for P7a live here:
//   W3  a CDP-driven script completes THREE deliveries — through the real DOM buttons, the real
//       flight model and the real economy
//   W7  the navigating-autopilot soak reaches licence tier 2 inside 9 minutes of SIM time
//
// Three rules this file obeys, all learned on this project:
//   1. every result is written to disk the moment it completes, never batched (agents here have
//      been killed mid-suite five times);
//   2. a gate that cannot fail is not a gate — `--falsify` breaks what four of these guard;
//   3. no `&&`-guarded setup. Isolation goes through `hook()`, which THROWS when a hook is
//      missing rather than resolving quietly to `undefined` (obligation T10).
//
// usage:  node tools/gates_wire.mjs [--falsify] [--minutes=10] [--headed]

import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, waitFor, settle, evalJSON, hook, quiesce, logs } from './shot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = resolve(ROOT, 'shots/wire');
const OUT = resolve(OUT_DIR, '_gates.json');

const arg = (k, d) => {
  const hit = process.argv.find(a => a.startsWith('--' + k + '='));
  return hit === undefined ? d : hit.split('=').slice(1).join('=');
};
const FALSIFY = process.argv.includes('--falsify');
const HEADED = process.argv.includes('--headed');
const SOAK_MIN = +arg('minutes', 10);

mkdirSync(OUT_DIR, { recursive: true });

const results = [];
const started = new Date().toISOString();

function flush() {
  const ok = results.filter(r => r.pass).map(r => r.name);
  const fail = results.filter(r => !r.pass).map(r => r.name);
  // BOTH gate-file schemas, because MANAGER_STATE records a parser that read one key against a
  // file written in the other and reported 0/0 on a suite that fully passed.
  writeFileSync(OUT, JSON.stringify({
    phase: 'wire', at: started, updated: new Date().toISOString(),
    node: process.version, soakMinutes: SOAK_MIN,
    total: results.length, passed: ok.length, failed: fail.length,
    results, ok, fail,
  }, null, 2));
}

async function gate(name, fn) {
  let rec;
  try {
    const r = await fn();
    rec = { name, pass: !!r.pass, detail: r.detail, data: r.data === undefined ? null : r.data };
  } catch (e) {
    rec = { name, pass: false, detail: 'THREW: ' + (e && e.message), data: null };
  }
  results.push(rec);
  flush();
  console.log((rec.pass ? '  ok   ' : '  FAIL ') + name.padEnd(38) + ' ' + rec.detail);
  return rec;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Declared HERE, not beside flyToPoint() at the bottom: function declarations hoist, `let` does
// not, so a bottom-of-file `let` read from a gate above it hits its temporal dead zone and THROWS.
// That is the third time this exact shape has bitten this project.
let lastTrace = [];

// ── real DOM interaction ───────────────────────────────────────────────────
// A click dispatched at a selector's centre through the input pipeline, not `el.click()`. The
// difference matters: `el.click()` bypasses hit testing entirely, so it would happily "press" a
// button that is covered by the control layer — which is precisely the bug worth catching on a
// game whose whole screen is a touch surface.
// TWO things this had to learn from the first browser run, both of which would have been invisible
// to `el.click()`:
//
//   1. `Input.dispatchMouseEvent` **never returns** once `Emulation.setEmitTouchEventsForMouse` is
//      on, which `shot.mjs --mobile` turns on. The first run of this suite hung for 25 minutes on
//      the very first press with no error and no output. Touch events are also what a thumb sends,
//      so this is the more honest path anyway.
//   2. The panel scrolls, so an element can be REAL, ENABLED and completely unreachable because it
//      is below the fold. That is what a modal with no way out looks like, and it is why the
//      element is scrolled into view and then HIT TESTED at the coordinate actually touched.
async function clickSel(S, sel, nth = 0) {
  const box = await evalJSON(S, `(() => {
    const list = document.querySelectorAll(${JSON.stringify(sel)});
    const el = list[${nth}];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { empty: true };
    if (r.y + r.height / 2 < 0 || r.y + r.height / 2 > innerHeight) return { offscreen: true, y: Math.round(r.y) };
    const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    return { x, y, text: el.textContent.slice(0, 40), disabled: !!el.disabled,
      covered: !(el === hit || el.contains(hit) || (hit && hit.contains(el))),
      hit: hit ? (hit.id || hit.className || hit.tagName) : null };
  })()`);
  if (!box) throw new Error(`no element matched ${sel}[${nth}]`);
  if (box.empty) throw new Error(`${sel}[${nth}] has no box`);
  if (box.offscreen) throw new Error(`${sel}[${nth}] is off screen at y=${box.y} even after scrolling — a thumb cannot reach it`);
  if (box.covered) throw new Error(`${sel}[${nth}] is covered by ${box.hit} — a real thumb could not press it`);
  if (box.disabled) throw new Error(`${sel}[${nth}] is disabled: ${box.text}`);
  await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x, y: box.y }] });
  await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(S, 3);
  return box;
}

// ── the run ────────────────────────────────────────────────────────────────

console.log('\nNEONHAUL — integration gates (P7a + P8 wiring, in a browser)\n');

// Portrait phone metrics. Mobile-first is the brief, and every one of these surfaces is a thing a
// thumb has to reach.
const H = await open({ w: 390, h: 844, dpr: 2, mobile: true, headed: HEADED });
const S = H.S;

try {
  await S('Page.navigate', { url: `${H.base}/index.html?nosave=1` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 45);

  // ───────────────────────────────────────────────────────────────────────
  // W1 — the wiring exists at all, and the boot is clean.
  // ───────────────────────────────────────────────────────────────────────
  await gate('W1 boot clean, both wirings live', async () => {
    const st = await evalJSON(S, 'window.__state');
    const hooks = await evalJSON(S, `(() => {
      const g = window.__game, out = {};
      for (const k of ['setZonesVisible','forceDock','board','accept','undock','charge','buyUpgrade',
                       'grantCredits','completeJob','audioState','radioState','radioEvent','flyTo'])
        out[k] = typeof g[k];
      return out;
    })()`);
    const missing = Object.entries(hooks).filter(([, v]) => v !== 'function').map(([k]) => k);
    const pass = st.errors.length === 0 && !missing.length && !!st.zones && st.zones.near > 0
      && !!st.radio && st.radio.ready === true && st.credits === 250 && st.cellUnits > 99;
    return {
      pass,
      detail: `errors ${st.errors.length} · missing hooks [${missing.join(',') || 'none'}] · `
        + `${st.zones ? st.zones.near : 0} zones near, ${st.zones ? st.zones.drawn : 0} drawn · `
        + `radio ready ${st.radio && st.radio.ready} (${st.radio && st.radio.state}) · `
        + `${st.credits} CRD, cell ${st.cellUnits}u · draws ${st.draws} tris ${st.tris}`,
      data: { errors: st.errors, hooks, zones: st.zones, draws: st.draws, tris: st.tris },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // W2 — what the zone layer COSTS, measured by difference, with the isolation proved.
  // `createZoneVisuals()` had never run in a browser before this line. A "0 draws" answer here
  // would mean the layer is not in the scene at all, which is why the gate asserts the difference
  // is non-zero in BOTH directions rather than just reading a count.
  // ───────────────────────────────────────────────────────────────────────
  await gate('W2 zone layer draws, isolation real', async () => {
    const on0 = await evalJSON(S, 'window.__game.setZonesVisible(true)');
    await settle(S, 6);
    const a = await evalJSON(S, '({draws: __state.draws, tris: __state.tris})');
    const off = await hook(S, 'setZonesVisible', false);   // THROWS if the hook is absent (T10)
    await settle(S, 6);
    const b = await evalJSON(S, '({draws: __state.draws, tris: __state.tris})');
    await hook(S, 'setZonesVisible', true);
    await settle(S, 6);
    const c = await evalJSON(S, '({draws: __state.draws, tris: __state.tris})');
    const cost = a.draws - b.draws;
    const pass = on0 === true && off === false && cost > 0 && cost <= 7 && c.draws === a.draws;
    return {
      pass,
      detail: `zones on ${a.draws} draws / ${(a.tris / 1000).toFixed(1)}k · off ${b.draws} / `
        + `${(b.tris / 1000).toFixed(1)}k · restored ${c.draws} · the layer costs ${cost} draws `
        + `(budget: 7 worst case) and ${a.tris - b.tris} tris · hook returned ${on0}/${off}`,
      data: { on: a, off: b, restored: c, cost },
    };
  });

  // NOTE ON ORDER: W5 must run BEFORE anything dispatches an input event. Its whole assertion is
  // that the context goes suspended -> running ON A GESTURE, and the first run of this suite had it
  // after W3 and W4 — by which time thirty presses had already unlocked it and the gate was
  // comparing `running` to `running`. A gate whose "before" state is already the "after" state
  // cannot fail, which is this project's dominant failure mode with a new hat on.
  // ───────────────────────────────────────────────────────────────────────
  // W5 — the audio layer is REACHABLE from the game, and it makes real sound.
  // The trap this project has already fallen into is a silent clip reported OK, so the assertion
  // is on measured RMS, not on "a play() call resolved".
  // ───────────────────────────────────────────────────────────────────────
  await gate('W5 audio unlocks on a real touch', async () => {
    const before = await evalJSON(S, '({ctx: __state.audio, bus: __state.audioBus && __state.audioBus.ready})');
    // A real touch on the control layer — the first thing a player does is drag the flight stick,
    // and `click` never fires on that path at all.
    await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 100, y: 700 }] });
    await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    // `ctx.resume()` is a promise. A fixed wait here measured `suspended` on a context that was a
    // few hundred ms from running, which is the harness being impatient rather than the game being
    // silent — so poll. The `before` state is still asserted as "no context at all", so the gate
    // can still fail if a gesture never unlocks anything.
    let st = null;
    for (let i = 0; i < 40; i++) {
      await settle(S, 10);
      st = await evalJSON(S, '({ctx: __state.audio, bus: __state.audioBus, radio: __state.radio})');
      if (st.ctx === 'running') break;
      await sleep(300);
    }
    // The chatter prefetch is deliberately deferred behind `__ready`, so wait for a buffer to
    // exist before asserting on one. Firing into an empty cache would measure the cache.
    let fired = null;
    for (let i = 0; i < 24 && !(fired && fired.rms > 0); i++) {
      fired = await evalJSON(S, '__game.radioEvent("dispatch_pay") || __game.radioEvent("dispatch_confirm")');
      if (fired && fired.rms > 0) break;
      await sleep(900); await settle(S, 6);
    }
    await settle(S, 20);
    const pass = before.ctx !== 'running' && st.ctx === 'running' && !!st.bus && st.bus.ready === true
      && !!fired && fired.rms > 0;
    return {
      pass,
      detail: `context ${before.ctx} -> ${st.ctx} · bus ready ${st.bus && st.bus.ready} · `
        + `radio ${st.radio.state}, ${st.radio.stats.withAudio} lines with audio / ${st.radio.stats.textOnly} text-only · `
        + `dispatch_pay fired ${fired ? fired.slot : 'null'} rms ${fired ? fired.rms : 'n/a'}`,
      data: { before, after: st, fired },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // W3 — §13's first browser done-criterion: THREE DELIVERIES.
  //
  // Every dock, accept and undock is a real click at the element's centre, through hit testing,
  // in portrait at 390x844. The flying between them is `__game.flyTo()`, which is the same Courier
  // `?courier=1` runs and emits the same input struct a thumb does — so the flight model, the
  // collision response and the assists are all real. The gate asserts the distance actually flown
  // and the sim time actually spent, because a delivery loop that teleported would report three
  // deliveries just as happily.
  // ───────────────────────────────────────────────────────────────────────
  await gate('W3 three deliveries, real clicks', async () => {
    const trip = [];
    let flown = 0;
    // HOW each dock happened, not just that it did. §7.2 has two paths — the 0.6 s hold and the
    // DOCK button — and "3 deliveries" is a very different result depending on which one the
    // approach actually used.
    const how = { hold: 0, button: 0 };

    const st0 = await evalJSON(S, '({credits: __state.credits, t: __state.t, jobs: __state.stats.jobs})');

    for (let n = 0; n < 3; n++) {
      // 1. dock. Three entry states are legitimate here and the loop has to tell them apart: the
      //    previous delivery may have left the craft ALREADY DOCKED at the drop (which is the whole
      //    point of "deliver first, then show that pad's board"); or standing on a pad with the
      //    DOCK button up; or in the air. The first version of this gate assumed the second and
      //    reported "no element matched .dk-prompt" on a loop that was working correctly.
      if (!(await evalJSON(S, '!!__state.dock'))) {
        if (!(await evalJSON(S, '!!document.querySelector(".dk-prompt")'))) {
          const near = await evalJSON(S, `(() => {
            const l = __game.zoneList().filter(z => z.kind === 'PAD' || z.kind === 'HUB');
            return l.length ? { x: l[0].x, y: l[0].y, z: l[0].z, name: l[0].name } : null;
          })()`);
          if (!near) throw new Error('no pad in range to dock at');
          flown += await flyToPoint(near);
          if (await waitUntil('!!__state.dock', 8000)) how.hold++;
          else { await clickSel(S, '.dk-prompt'); how.button++; }
        } else {
          await clickSel(S, '.dk-prompt');
          how.button++;
        }
      }
      const docked = await evalJSON(S, '__state.dock');
      if (!docked) throw new Error(`dock step ${n} did not dock`);

      // 2. accept — the first ACCEPT button that is not disabled
      const board = await evalJSON(S, '__game.board().map(j => ({ name: j.dest.name, x: j.dest.x, y: j.dest.y, z: j.dest.z, km: j.km, base: j.base, limit: j.limit }))');
      const idx = await evalJSON(S, `(() => {
        const bs = [...document.querySelectorAll('.dk-accept')];
        for (let i = 0; i < bs.length; i++) if (!bs[i].disabled) return i;
        return -1;
      })()`);
      if (idx < 0) throw new Error('every ACCEPT on the board is disabled');
      await clickSel(S, '.dk-accept', idx);
      const job = await evalJSON(S, '__state.job');
      if (!job) throw new Error(`ACCEPT press ${n} did not put a parcel in the hold`);

      // 3. undock — the button, pressed
      await clickSel(S, '.dk-undock');
      if (await evalJSON(S, '!!__state.dock')) throw new Error('UNDOCK press did not undock');

      // 4. fly it
      flown += await flyToPoint({ x: job.x, y: job.y, z: job.z, name: job.dest });

      // 5. dock at the drop — the automatic hold-dock this time, which is the other of §7.2's
      //    "both paths run the same code". If it has not fired by the time the ferry has settled,
      //    press the button.
      const auto = await waitUntil(`!!__state.dock`, 12000);
      if (auto) how.hold++;
      else { await clickSel(S, '.dk-prompt'); how.button++; }
      const paid = await evalJSON(S, '({credits: __state.credits, cargo: __state.cargo, delivered: __state.stats.delivered, toasts: __state.ui.toasts})');
      trip.push({ dest: job.dest, km: job.km, credits: paid.credits, delivered: paid.delivered, cargo: paid.cargo });
    }

    const st1 = await evalJSON(S, '({credits: __state.credits, lifetime: __state.lifetime, tier: __state.tier, t: __state.t, delivered: __state.stats.delivered, cellUnits: __state.cellUnits, errors: __state.errors})');
    const simSpent = st1.t - st0.t;
    const pass = st1.delivered >= 3 && st1.credits > st0.credits && flown > 900
      && simSpent > 20 && st1.cellUnits < 100 && st1.errors.length === 0;
    return {
      pass,
      detail: `${st1.delivered} deliveries · ${how.hold} docked on the 0.6 s hold, ${how.button} on the DOCK button · `
        + `${st0.credits} -> ${st1.credits} CRD (lifetime ${st1.lifetime}, tier ${st1.tier}) · `
        + `${Math.round(flown)} m actually flown over ${simSpent.toFixed(1)} s of sim · cell ${st1.cellUnits}u · errors ${st1.errors.length}`,
      data: { trip, how, flown: Math.round(flown), simSpent: +simSpent.toFixed(1), after: st1 },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // W4 — the shop. §13's "buy an upgrade" half of the loop.
  // ───────────────────────────────────────────────────────────────────────
  await gate('W4 shop: charge and buy an upgrade', async () => {
    await evalJSON(S, '__game.grantCredits(4000)');
    // Fly to the nearest charge/workshop pad and dock it.
    // `dist > 40` is load-bearing and it is why the first version of this gate reported
    // "force-docked — the approach missed". `zoneList()` is distance-sorted and the HUB and every
    // WORKSHOP also sell charge (P7a's design note), so `l[0]` was THE PAD THE CRAFT WAS STANDING
    // ON: the gate flew zero metres, never left the cylinder, and automatic docking — which arms on
    // LEAVING one, so that `?auto=1` does not dock at boot — correctly declined to fire. The DOCK
    // button was on screen the whole time. Nothing was wrong with the approach; the gate was
    // pointing at its own feet.
    // TWO filters, and both are load-bearing.
    //
    // `dist > 40`: `zoneList()` is distance-sorted and the HUB and every WORKSHOP also sell charge,
    // so `l[0]` was THE PAD THE CRAFT WAS STANDING ON. The gate flew zero metres, never left the
    // cylinder, and automatic docking — which arms on LEAVING one so that `?auto=1` does not dock at
    // boot — correctly declined to fire.
    //
    // The `!ledge` half of this filter is GONE, and its removal is part of the ledge fix's
    // evidence: it existed only because a ledge pad's centre used to be inside the building, so a
    // shop gate aimed at one was not testing the shop. Ledge CHARGE and WORKSHOP pads are now
    // docked at like any other, and this gate no longer avoids them.
    const c = await evalJSON(S, `(() => {
      const l = __game.zoneList().filter(z => z.charge && z.dist > 40);
      return l.length ? { x: l[0].x, y: l[0].y, z: l[0].z, name: l[0].name, type: l[0].type,
        key: l[0].key, away: Math.round(l[0].dist) } : null;
    })()`);
    if (!c) throw new Error('no reachable CHARGE or WORKSHOP pad more than 40 m away inside the zone radius');
    if (await evalJSON(S, '!!__state.dock')) await clickSel(S, '.dk-undock');
    await flyToPoint(c);
    let arrived = await waitUntil('!!__state.dock', 12000);
    if (!arrived && await evalJSON(S, '!!document.querySelector(".dk-prompt")')) {
      await clickSel(S, '.dk-prompt');
      arrived = await evalJSON(S, '!!__state.dock');
    }
    // Last resort: this gate's subject is the SHOP, not the navigation — W3 already proves the
    // flying. Say so in the result rather than letting a missed approach read as a shop failure.
    // NO FORCE-DOCK RESCUE. A gate that teleports itself onto the pad when the approach fails is
    // the workaround that makes the GATE pass while leaving the GAME broken, which is this
    // project's dominant failure mode. If the approach misses, this gate fails and says so.
    const ferried = !arrived;
    if (ferried) throw new Error(`the approach to ${c.type} ${c.name} (${c.away} m) never docked — `
      + `trace: ${JSON.stringify(lastTrace.slice(-4))}`);

    const before = await evalJSON(S, '({credits: __state.credits, cell: __state.cellUnits, up: __state.stats})');
    // The SHOP tab, then FILL, then the first affordable upgrade — all real presses.
    await clickSel(S, '.dk-tab', 2);
    const tab = await evalJSON(S, '__state.dockUI.tab');
    await clickSel(S, '.dk-fill');                      // FILL — its own class, not ACCEPT
    const charged = await evalJSON(S, '({credits: __state.credits, cell: __state.cellUnits})');
    const upIdx = await evalJSON(S, `(() => {
      const bs = [...document.querySelectorAll('.dk-shop')];
      for (let i = 0; i < bs.length; i++) if (!bs[i].disabled) return i;
      return -1;
    })()`);
    if (upIdx < 0) throw new Error('no affordable shop line with 4,000 CRD in hand');
    await clickSel(S, '.dk-shop', upIdx);
    const after = await evalJSON(S, '({credits: __state.credits, cell: __state.cellUnits, up: __game.economy.upgrades, craft: __game.economy.craft, maxFwd: __state.flight.maxFwd})');
    const bought = Object.values(after.up).some(v => v > 0) || after.craft !== 'wisp';
    const pass = tab === 'shop' && charged.cell > before.cell && charged.credits < before.credits
      && bought && after.credits < charged.credits && !ferried;
    return {
      pass,
      detail: `${c.type} ${c.name} ${c.away} m away — ${ferried ? 'FORCE-DOCKED, the approach missed' : 'flown to and docked under its own power'} · tab ${tab} · charge ${before.cell.toFixed(1)}u/${before.credits} CRD -> `
        + `${charged.cell.toFixed(1)}u/${charged.credits} CRD · bought ${JSON.stringify(after.up)} on a ${after.craft} `
        + `(maxFwd ${after.maxFwd}) leaving ${after.credits} CRD`,
      data: { before, charged, after, target: c, ferried, approach: lastTrace },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // W8 — no pad centre is buried in solid geometry. FIXED IN P7b; KEPT AS THE REGRESSION GUARD.
  //
  // The defect it was written to record: `zones.js:_site()` returned the building CENTRE for both
  // kinds of pad and changed only the height — a roof pad at `h + 1.2` (clear), a ledge pad at
  // `0.42·h`, which is inside the mass, because `render_city.js` gives every building ONE collision
  // AABB covering its full footprint from the ground to `h` and knows nothing about a prototype's
  // setbacks. About a third of every pad in the city, CHARGE and WORKSHOP included, could not be
  // docked at: placed at the centre, §6.3 pushes the craft out through the nearest face and keeps
  // it there. This gate was DELIBERATELY RED so a green suite could not read as "no problem".
  //
  // P7b's fix puts a ledge pad on a cantilevered deck OUTSIDE the tower, `LEDGE.OUT` = 15 m clear
  // of the facade (> `FLIGHT.REPEL_RANGE` = 12, so the parent tower contributes zero repulsion at
  // the pad centre), on the first of four faces with `LEDGE.CLEAR` = 13 m of room against every
  // other mass that reaches the pad's height. The same clearance test also caught a SECOND defect
  // the original 8-pad sample missed — a roof pad buried under a taller neighbour, 1 of 45 — so
  // `_site` now walks outward from its biased index to the first candidate with an open roof.
  //
  // NOTE ON METHOD, and it is the whole reason this gate is trustworthy: `solidAt()` only answers
  // for LIVE chunks and returns null — indistinguishable from "open air" — for one that was never
  // generated. The FIRST version of this measurement probed 242 pads from the spawn and concluded
  // the defect did not exist. Every pad here is streamed in and the world quiesced before it is
  // probed, and `probe()` THROWS on a chunk that did not come live rather than scoring it clear.
  //
  // THE PREDICATE IS A DEPTH, NOT A BOOLEAN. `solidAt` tests `y <= top`, so a pad resting exactly
  // on a roof surface reads "solid" at a burial depth of 0 — which the HUB does, because §3.1.1
  // authors it AT the spindle's 92 m podium deck rather than 1.2 m above it. Burial is therefore
  // `top - y > 0.5 m`, and the raw solid count is reported beside it so nothing is hidden by the
  // threshold.
  await gate('W8 no pad centre is buried in solid geometry (roof control + ledge)', async () => {
    await hook(S, 'setDocking', false);
    const pads = await evalJSON(S, `(() => { const Z = __game.zones, out = [];
      for (let cz = -6; cz <= 6; cz++) for (let cx = -6; cx <= 6; cx++) {
        const p = Z.padAt(cx, cz);
        if (p) out.push({ key: p.key, x: p.x, y: p.y, z: p.z, ledge: !!p.ledge, kind: p.kind });
      }
      return out; })()`);
    const ledge = pads.filter(p => p.ledge), roof = pads.filter(p => !p.ledge);
    const SAMPLE = 12;
    const probe = async list => {
      const buried = [], grazed = [];
      for (const p of list.slice(0, SAMPLE)) {
        await evalJSON(S, `__game.setCamera({pos:[${p.x}, ${p.y + 60}, ${p.z}], yaw:0, pitch:0})`);
        await quiesce(S, { timeout: 60000 });
        const r = await evalJSON(S, `(() => {
          const live = __game.cityChunkLive(${p.x}, ${p.z});
          const s = __game.solidAt(${p.x}, ${p.y}, ${p.z}, 0);
          return { live, solid: !!s, proto: s ? s.proto : null, top: s ? s.top : null }; })()`);
        // A chunk that never came live answers `null` for every point in it, which is exactly the
        // reading a clear pad gives. Fail loudly rather than banking it as a pass.
        if (!r.live) throw new Error(`W8: chunk for pad ${p.key} never came live — solidAt() would `
          + `have returned null for open air and for ungenerated alike, so this sample is void`);
        if (!r.solid) continue;
        const depth = r.top - p.y;
        const line = `${p.key} ${p.kind} y=${Math.round(p.y)} in a ${r.proto} topping ${Math.round(r.top)} m (${depth.toFixed(1)} m deep)`;
        if (depth > 0.5) buried.push(line); else grazed.push(line);
      }
      return { buried, grazed, n: Math.min(SAMPLE, list.length) };
    };
    const L = await probe(ledge);
    const R = await probe(roof);
    await evalJSON(S, '__game.setFlight(true)');
    await hook(S, 'setDocking', true);
    const rate = ledge.length / pads.length;
    return {
      pass: L.buried.length === 0 && R.buried.length === 0 && L.n > 0 && R.n > 0,
      detail: `${pads.length} pads in a 13x13 chunk block, ${ledge.length} of them ledge pads `
        + `(${(rate * 100).toFixed(1)} %). Sampled ${L.n} ledge and ${R.n} roof with each pad's chunks `
        + `STREAMED and asserted live: ledge ${L.buried.length}/${L.n} buried, `
        + `roof ${R.buried.length}/${R.n} buried (the positive control — this must stay 0). `
        + `Resting exactly on a deck (depth <= 0.5 m) is not burial: ledge ${L.grazed.length}, roof ${R.grazed.length}`
        + (R.grazed.length ? ` (the HUB, authored AT the spindle's podium deck)` : '')
        + (L.buried.length ? ` · e.g. ${L.buried[0]}` : ''),
      data: { pads: pads.length, ledgePads: ledge.length, ledgeRate: +rate.toFixed(3),
        ledge: L, roof: R },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // W10 — the half W8 cannot see: a pad you cannot reach is not fixed by being outside a wall.
  // The craft is put at a LEDGE pad and asked to hold station under the real flight model with
  // docking on. If §6.3's repulsion moves it out of the 14 m cylinder, this fails.
  //
  // The positive control is the OLD placement: the same pad's building centre at 0.42·h. That must
  // NOT hold station, or this gate is not measuring the thing it claims to.
  // ───────────────────────────────────────────────────────────────────────
  await gate('W10 a craft can hold station at a ledge pad (old placement is the control)', async () => {
    const p = await evalJSON(S, `(() => { const Z = __game.zones;
      for (let r = 1; r <= 6; r++) for (let cz = -r; cz <= r; cz++) for (let cx = -r; cx <= r; cx++) {
        const q = Z.padAt(cx, cz);
        if (q && q.ledge) return { key: q.key, x: q.x, y: q.y, z: q.z, kind: q.kind, name: q.name,
          mx: q.mass[0], mz: q.mass[1] };
      }
      return null; })()`);
    if (!p) throw new Error('no ledge pad within 6 chunks of the spawn');
    const VOL_R = 14;
    // The control point is `pad.mass` — the tower's own centre at the pad's height, which is
    // exactly where the OLD `_site()` put a ledge pad.
    const run = async (x, z, label) => {
      await hook(S, 'setDocking', false);
      await hook(S, 'releaseControls');           // a touch held by an earlier gate is an input
      await evalJSON(S, '__game.setFlight(false)');
      await evalJSON(S, `__game.teleport(${x}, ${p.y + 40}, ${z})`);
      await quiesce(S, { timeout: 60000 });       // chunks live AROUND THE PAD, not around spawn
      const live = await evalJSON(S, `__game.cityChunkLive(${x}, ${z})`);
      if (!live) throw new Error(`W10: the chunk at ${label} never came live — the flight model `
        + `would see an empty AABB list and every arm would read "no repulsion"`);
      // A real flight frame, from rest, at the point under test. `flightReset` zeroes velocity so
      // the drift measured is the flight model's doing and not the teleport's.
      await evalJSON(S, '__game.setFlight(true)');
      await evalJSON(S, `__game.flightReset(${x}, ${p.y}, ${z}, 0, 0)`);
      await settle(S, 120);                       // ~2.0 s of real integration
      const r = await evalJSON(S, `(() => { const f = __state.flight, pl = __state.player;
        return { dx: pl.x - ${x}, dz: pl.z - ${z}, dy: pl.y - ${p.y}, repel: f.repel,
                 nearest: f.nearest, contacts: f.contacts }; })()`);
      const drift = Math.hypot(r.dx, r.dz);
      return { label, drift: +drift.toFixed(1), repel: r.repel, nearest: r.nearest,
        contacts: r.contacts, held: drift < VOL_R };
    };
    const at = await run(p.x, p.z, 'the fixed ledge pad');
    const ctl = await run(p.mx, p.mz, 'the OLD placement (tower centre)');
    await hook(S, 'setDocking', true);
    return {
      pass: at.held && !ctl.held,
      detail: `${p.kind} "${p.name}" ${p.key} at y=${Math.round(p.y)} — held station, drifting `
        + `${at.drift} m in 2.0 s with repulsion ${at.repel} m/s^2 and the nearest AABB ${at.nearest} m away `
        + `(the docking cylinder is ${VOL_R} m). CONTROL, the old inside-the-mass placement: drifted `
        + `${ctl.drift} m with repulsion ${ctl.repel} — a control that also held would mean this gate `
        + `measures nothing`,
      data: { pad: p, fixed: at, control: ctl },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // W11 — THE QUESTION THE LEDGE DEFECT ACTUALLY ASKS: can a job whose DROP is a ledge pad be
  // completed? W8 says the pad is not inside a wall and W9 says a craft can hold station on it;
  // neither is the same as flying a parcel there and being paid.
  //
  // Nothing here is forced except finding a board that offers such a job — the search walks real
  // courier pads and reads their real boards, and the flight to the drop is `flyTo`, the same
  // navigator `?courier=1` uses. The dock is §7.2's own 0.6 s hold.
  // ───────────────────────────────────────────────────────────────────────
  await gate('W11 a job DROPPING at a ledge pad can be completed', async () => {
    await hook(S, 'setDocking', true);
    if (await evalJSON(S, '!!__state.dock')) await evalJSON(S, '__game.undock()');
    // Walk nearby courier pads, read each board, stop at the first job whose destination is a
    // ledge pad. Every step is a real dock and a real board.
    const found = await evalJSON(S, `(() => {
      const Z = __game.zones, seen = [];
      const pads = [];
      for (let r = 1; r <= 5; r++)
        for (let cz = -r; cz <= r; cz++) for (let cx = -r; cx <= r; cx++) {
          const p = Z.padAt(cx, cz);
          if (p && p.kind === 'PAD') pads.push(p.key);
        }
      for (const key of [...new Set(pads)].slice(0, 24)) {
        __game.forceDock(key);
        const jobs = __game.board();
        seen.push(jobs.length);
        for (let i = 0; i < jobs.length; i++) {
          const d = Z.padAt(...jobs[i].dest.key.split(',').map(Number));
          if (d && d.ledge) return { padKey: key, i, boards: seen.length,
            dest: { key: d.key, name: d.name, x: d.x, y: d.y, z: d.z, kind: d.kind },
            km: jobs[i].km, base: jobs[i].base };
        }
      }
      return { none: true, boards: seen.length, slots: seen.reduce((a, b) => a + b, 0) }; })()`);
    if (found.none) throw new Error(`no job dropping at a ledge pad across ${found.boards} boards / `
      + `${found.slots} slots — either ledge pads have stopped being generated or the search is broken`);
    const before = await evalJSON(S, '({ credits: __state.credits, delivered: __state.stats.delivered })');
    const acc = await evalJSON(S, `__game.accept(${found.i})`);
    await evalJSON(S, '__game.undock()');
    await settle(S, 10);
    // Fly it. No teleport: the distance actually covered is asserted below.
    const from = await evalJSON(S, '({x: __state.player.x, y: __state.player.y, z: __state.player.z})');
    await evalJSON(S, `__game.flyTo(${found.dest.x}, ${found.dest.y}, ${found.dest.z})`);
    const t0 = Date.now();
    let docked = false, trace = [];
    while (Date.now() - t0 < 180000) {
      await settle(S, 30);
      const st = await evalJSON(S, `({ dock: __state.dock && __state.dock.pad, d: __game.flyState(),
        x: __state.player.x, z: __state.player.z })`);
      trace.push({ leg: st.d && st.d.leg, dist: st.d && st.d.dist });
      if (st.dock === found.dest.key) { docked = true; break; }
      if (trace.length > 220) break;
    }
    await evalJSON(S, '__game.flyTo(null)');
    const after = await evalJSON(S, '({ credits: __state.credits, delivered: __state.stats.delivered, errors: __state.errors.length })');
    const to = await evalJSON(S, '({x: __state.player.x, z: __state.player.z})');
    const flown = Math.hypot(to.x - from.x, to.z - from.z);
    return {
      pass: !!acc && docked && after.delivered === before.delivered + 1
        && after.credits > before.credits && after.errors === 0 && flown > 200,
      detail: `searched ${found.boards} real boards for a LEDGE drop and found one at `
        + `"${found.dest.name}" ${found.dest.key} (y=${Math.round(found.dest.y)}, ${found.km} km) · `
        + `flew ${Math.round(flown)} m and docked on §7.2's hold ${docked} · delivered `
        + `${before.delivered} → ${after.delivered} · ${before.credits} → ${after.credits} CRD · `
        + `errors ${after.errors}`,
      data: { found, before, after, flown: Math.round(flown), docked, trace: trace.slice(-6) },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // W6 — the settings rows P8 asked for exist and reach the mix.
  // ───────────────────────────────────────────────────────────────────────
  await gate('W6 settings has music/sfx/radio rows', async () => {
    await evalJSON(S, '__game.openSettings(true)');
    await settle(S, 4);
    const labels = await evalJSON(S, '[...document.querySelectorAll(".set-label")].map(e => e.textContent)');
    await evalJSON(S, '__game.applySettings({ music: false })');
    await settle(S, 30); await sleep(600); await settle(S, 30);
    const off = await evalJSON(S, '({music: __state.audioBus.musicGain, net: __state.audioBus.net})');
    await evalJSON(S, '__game.applySettings({ music: true, radio: true })');
    await settle(S, 30); await sleep(600); await settle(S, 30);
    const on = await evalJSON(S, '({music: __state.audioBus.musicGain, net: __state.audioBus.net})');
    await evalJSON(S, '__game.openSettings(false)');
    const has = ['Music', 'Sound', 'Radio'].filter(l => labels.includes(l));
    // A settings row that reaches nothing is the point of failure here, so the assertion is on the
    // MIX MOVING, not on the row existing.
    const pass = has.length === 3 && off.music < on.music;
    return {
      pass,
      detail: `rows [${has.join(',')}] of 3 · music bus gain ${off.music} with the row Off, ${on.music} with it On`,
      data: { labels, off, on },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // W8 — falsification. Each of these must make one of the gates above fail.
  // ───────────────────────────────────────────────────────────────────────
  if (FALSIFY) {
    console.log('\n  falsification — each of these MUST be caught\n');

    await gate('F1 setZonesVisible missing', async () => {
      // The T10 shape: `hook()` must THROW on an absent hook, where the old `X && X(...)` form
      // resolved quietly to undefined and the gate reported clean numbers over a hidden layer.
      // evalJSON wraps its argument in `JSON.stringify(...)`, so a semicolon-separated statement
      // list is a SYNTAX ERROR, not a script. Every multi-statement probe here is an IIFE.
      await evalJSON(S, '(() => { window.__game.__keepZ = window.__game.setZonesVisible; delete window.__game.setZonesVisible; return 1; })()');
      let threw = '';
      try { await hook(S, 'setZonesVisible', false); } catch (e) { threw = e.message; }
      const quiet = await evalJSON(S, 'window.__game.setZonesVisible && window.__game.setZonesVisible(false)');
      await evalJSON(S, '(() => { window.__game.setZonesVisible = window.__game.__keepZ; return 1; })()');
      const back = await hook(S, 'setZonesVisible', true);
      return {
        pass: /T10|setZonesVisible/.test(threw) && quiet === undefined && back === true,
        detail: `hook() threw "${threw.slice(0, 60)}" · the old && form returned ${JSON.stringify(quiet)} (silently) · restored ${back}`,
      };
    });

    await gate('F2 a hidden zone layer is visible in the numbers', async () => {
      // W2 asserts a NON-ZERO difference. Prove the probe can see it: hide the layer and check the
      // draw count actually moves, so "cost 0" would be a failure and not a pass.
      await hook(S, 'setZonesVisible', true); await settle(S, 6);
      const a = await evalJSON(S, '__state.draws');
      await hook(S, 'setZonesVisible', false); await settle(S, 6);
      const b = await evalJSON(S, '__state.draws');
      await hook(S, 'setZonesVisible', true); await settle(S, 6);
      return { pass: a !== b, detail: `draws ${a} with the layer, ${b} without — a difference of exactly 0 would mean nothing was ever drawn` };
    });

    await gate('F3 accept with a full hold is refused', async () => {
      // The board must not offer what the hull cannot carry. Fill the hold and check ACCEPT greys
      // out with a reason rather than failing silently.
      const r = await evalJSON(S, `(() => {
        const st = __game.economy;
        const slots = __game.econ.cargoSlots(st);
        st.cargo = [{ jobId: 'x', parcel: { slots, name: 'BALLAST', icon: '#' }, slots,
                      destKey: 'nowhere', dest: { key: 'nowhere', name: 'NOWHERE', districtName: 'X' },
                      base: 0, limit: 999, km: 1, acceptedAt: __state.t }];
        return { slots, free: slots - __game.econ.occupiedSlots(st) };
      })()`);
      if (await evalJSON(S, '!!__state.dock')) await clickSel(S, '.dk-undock');
      // A courier pad, explicitly: a CHARGE pad's board is empty and the panel opens on the shop
      // tab, where the only button is FILL. The first version of this gate asserted on that button
      // and reported the shop as a disabled job board.
      const key = await evalJSON(S, `(() => { const l = __game.zoneList().filter(z => z.kind === 'PAD'); return l.length ? l[0].key : null; })()`);
      if (!key) throw new Error('no courier pad in range');
      const pad = await evalJSON(S, '__game.forceDock(' + JSON.stringify(key) + ')');
      const dis = await evalJSON(S, '[...document.querySelectorAll(".dk-accept")].map(b => ({ d: b.disabled, t: b.textContent }))');
      await evalJSON(S, '(() => { __game.economy.cargo.length = 0; return 1; })()');
      await evalJSON(S, '__game.undock()');
      return {
        pass: !!pad && dis.length > 0 && dis.every(b => b.d) && dis.some(b => /NO ROOM/.test(b.t)),
        detail: `hold filled to ${r.slots}/${r.slots} · ${dis.length} ACCEPT buttons, all disabled ${dis.every(b => b.d)} · texts ${JSON.stringify(dis.map(b => b.t))}`,
      };
    });

    await gate('F4 a silent clip is rejected', async () => {
      // The trap that once let silent audio ship as OK. Force a decoded buffer to silence and
      // check playClip refuses it rather than reporting a play.
      const r = await evalJSON(S, `(() => {
        const a = __game.audio;
        if (!a || !a.ctx) return { skip: 'no context' };
        const buf = a.ctx.createBuffer(1, a.ctx.sampleRate * 0.5, a.ctx.sampleRate);
        const loud = a.ctx.createBuffer(1, a.ctx.sampleRate * 0.5, a.ctx.sampleRate);
        const d = loud.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.sin(i * 0.05) * 0.5;
        // Return booleans only — playClip hands back live AudioNodes, which do not serialise, and
        // a JSON.stringify of one is "{}" (the exact trap P8 was bitten by).
        return { silent: !!a.playClip(buf), loud: !!a.playClip(loud) };
      })()`);
      return {
        pass: !r.skip && !r.silent && !!r.loud,
        detail: `silent buffer -> ${JSON.stringify(r.silent)} (must be falsy) · real buffer -> ${JSON.stringify(r.loud)} (must not be)`,
      };
    });
  }

  // ───────────────────────────────────────────────────────────────────────
  // W7 — §13's second browser done-criterion. A FRESH page, because the gates above have been
  // granting credits and stuffing the hold.
  // ───────────────────────────────────────────────────────────────────────
  await gate(`W7 courier soak reaches tier 2 (<9 min sim, ${SOAK_MIN} min budget)`, async () => {
    await S('Page.navigate', { url: `${H.base}/index.html?courier=1&nosave=1` });
    await waitFor(S, 'window.__ready', 60000);
    await settle(S, 20);
    const t0 = Date.now();
    const samples = [];
    let tier2At = null;
    while (Date.now() - t0 < SOAK_MIN * 60000) {
      await sleep(2000);
      const s = await evalJSON(S, `({ t: __state.t, tier: __state.tier, lifetime: __state.lifetime,
        credits: __state.credits, delivered: __state.stats.delivered, jobs: __state.stats.jobs,
        tows: __state.stats.tows, cell: __state.cellUnits, dock: !!__state.dock,
        leg: __state.auto && __state.auto.leg, dist: __state.auto && __state.auto.dist,
        escapes: __state.auto && __state.auto.escapes, x: __state.player.x, z: __state.player.z,
        alt: __state.player.alt, errors: __state.errors.length, fps: __state.fps })`);
      samples.push(s);
      if (tier2At === null && s.tier >= 2) { tier2At = s.t; break; }
      if (s.errors > 0) break;
    }
    const last = samples[samples.length - 1] || {};
    const moved = samples.length > 2
      ? Math.hypot(last.x - samples[0].x, last.z - samples[0].z) : 0;
    const errs = await evalJSON(S, '__state.errors');
    const pass = tier2At !== null && tier2At < 9 * 60 && errs.length === 0;
    return {
      pass,
      detail: tier2At === null
        ? `tier 2 NOT reached in ${last.t ? last.t.toFixed(0) : 0} s of sim — ${last.delivered || 0} deliveries, `
          + `${last.jobs || 0} accepted, leg "${last.leg}" ${last.dist} m out, ${last.escapes} escapes, errors ${errs.length}`
        : `tier 2 at ${(tier2At / 60).toFixed(2)} min of SIM time (gate 9.00) · ${last.delivered} deliveries, `
          + `${last.jobs} jobs, ${last.tows} tows · ${Math.round(moved)} m from the start · `
          + `${last.credits} CRD · ${last.escapes} escapes · ${last.fps} fps · errors ${errs.length}`,
      data: { tier2At, samples, errors: errs },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // W9 — the console. A clean gate suite over a page throwing once a frame is not clean.
  // ───────────────────────────────────────────────────────────────────────
  await gate('W9 console clean over the whole run', async () => {
    const bad = logs.filter(l => !/favicon|Autoplay|net::ERR_/.test(l));
    return { pass: bad.length === 0, detail: `${logs.length} console lines, ${bad.length} that matter${bad.length ? ': ' + bad.slice(0, 3).join(' | ') : ''}`, data: bad.slice(0, 20) };
  });
} finally {
  await H.close();
}

const passed = results.filter(r => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed  ->  shots/wire/_gates.json\n`);
if (passed !== results.length) process.exitCode = 1;

// ── helpers that need S ────────────────────────────────────────────────────

async function waitUntil(expr, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await evalJSON(S, `!!(${expr})`)) return true;
    await sleep(180);
  }
  return false;
}

// Fly to a world point through the real flight model and return the metres actually travelled —
// which is the number that separates "it flew there" from "it was moved there".
async function flyToPoint(p, ms = 70000) {
  const a = await evalJSON(S, '({x: __state.player.x, z: __state.player.z})');
  const started = await evalJSON(S, `JSON.stringify(__game.flyTo(${p.x}, ${p.y}, ${p.z})) !== 'null'`);
  if (!started) throw new Error('flyTo() returned null — there is no flight model to fly');
  let path = 0, prev = a;
  const t0 = Date.now();
  lastTrace = [];
  let why = 'timeout';
  while (Date.now() - t0 < ms) {
    await sleep(400);
    const s = await evalJSON(S, `(() => { const f = __game.flyState(), q = __state.player;
      return { x: q.x, z: q.z, dy: +(q.y - ${p.y}).toFixed(1), sp: +q.speed.toFixed(2),
        d: f ? +f.dist.toFixed(1) : null, leg: f ? f.leg : null, esc: f ? f.escapes : 0,
        dock: !!__state.dock, t: +__state.t.toFixed(1) }; })()`);
    path += Math.hypot(s.x - prev.x, s.z - prev.z);
    prev = s;
    lastTrace.push(s);
    if (s.dock) { why = 'docked in flight'; break; }
    if (s.d !== null && s.d < 9) { why = 'arrived'; break; }
  }
  await evalJSON(S, '__game.flyTo(null)');
  // Keep the last dozen samples — an approach that misses has to say WHY, not just that it did.
  lastTrace = lastTrace.slice(-14).concat([{ why }]);
  return path;
}
