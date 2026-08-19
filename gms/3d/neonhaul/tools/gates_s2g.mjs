#!/usr/bin/env node
// S2-G's gates — living posters: cycling stills, short looping clips, distance- and view-gated.
//
//   node tools/gates_s2g.mjs [--lite] [--headed] [--w= --h=]
//
// THE ONE THING THIS SUITE EXISTS TO GET RIGHT. The feature's whole claim is a set of ZEROES —
// zero videos decoding, zero texture uploads, zero bytes fetched, when no poster is in front of
// you. CLAUDE.md records exactly how that kind of gate dies: gates_p7b's D3 counted `.mp4`
// requests on the job board, Chrome served the element from its memory cache, the board made no
// requests at all, and a broken measurement read identically to a passing one. So every zero here
// is paired, in the SAME check, with the same counter measured after the camera is flown in front
// of a poster. A zero that cannot be moved is not allowed to count.
//
// SCHEMA NOTE: writes `{ok:[],fail:[]}` AND `{results:[]}` — a parser reading only one key has
// reported 0/0 on a fully passing suite four times on this project.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, parseArgs, waitFor, settle, evalJSON, hook, quiesce } from './shot.mjs';
import { GATES } from '../js/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs();
const LITE = args.lite ? '&lite=1' : '';
const W = +(args.w || 844), H = +(args.h || 390);
const OUT = resolve(ROOT, 'shots/s2g');
const FILE = resolve(OUT, `_gates${args.lite ? '_lite' : ''}.json`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// B1's comparison window, and it is not arbitrary. A LIVE channel showing a still legitimately
// makes zero uploads for the length of that still's hold — 6-9 s in data/posters.json — so a 4 s
// window measured "0 uploads while looking at a poster" and called the layer dead. The window has
// to span at least one item change for the counter it is proving to be able to move at all, and
// both arms use the same one: an asymmetric comparison is not a comparison.
const WINDOW = 12000;

const ok = [], fail = [], detail = {};
function check(name, pass, det) {
  (pass ? ok : fail).push(name);
  detail[name] = det;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}\n      ${String(det).replace(/\n/g, '\n      ')}`);
  try {
    const results = [...ok.map(n => ({ name: n, pass: true, detail: detail[n] })),
      ...fail.map(n => ({ name: n, pass: false, detail: detail[n] }))];
    writeFileSync(FILE, JSON.stringify({ view: `${W}x${H}`, lite: !!args.lite,
      at: new Date().toISOString(), total: ok.length + fail.length, passed: ok.length,
      failed: fail.length, ok, fail, detail, results }, null, 1));
  } catch { /* a full disk must not swallow the console above */ }
}

async function shot(S, name) {
  const { data } = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(resolve(OUT, `${name}.png`), Buffer.from(data, 'base64'));
  return `shots/s2g/${name}.png`;
}

const board = S => evalJSON(S, 'window.__game.signStats().posterBoard');

// Put the eye `d` metres off a site's own wall, facing it. `flight.js` builds forward as
// (-sin yaw, sin pitch, -cos yaw), so this is that inverted — not a guess about the sign of yaw.
async function faceSite(S, s, d) {
  const px = s.x + s.nx * d, pz = s.z + s.nz * d, py = s.y;
  const yaw = Math.atan2(-(s.x - px), -(s.z - pz));
  await evalJSON(S, `(window.__game.flightReset(${px}, ${py}, ${pz}, ${yaw}, 0), 1)`);
  await settle(S, 10);
  await quiesce(S, { timeout: 60000 });
  await settle(S, 20);
  return { px, py, pz, yaw };
}

// The atlas as pixels, not as a state flag. A channel that reports "live, item noodle" while its
// cell never changes colour is exactly the class of defect this project keeps finding.
const cellHash = (S, i) => evalJSON(S, `(() => {
  const b = window.__game.signage.posters;
  const r = b.rect(${i});
  const d = b.g.getImageData(r.x, r.y, r.w, r.h).data;
  let h = 2166136261, sum = 0;
  for (let p = 0; p < d.length; p += 41) { h = Math.imul(h ^ d[p], 16777619); sum += d[p]; }
  return { h: h >>> 0, mean: +(sum / Math.ceil(d.length / 41)).toFixed(2) };
})()`);

async function main() {
  mkdirSync(OUT, { recursive: true });
  const { S, base, close } = await open({ w: W, h: H, dpr: 1, mobile: true, headed: !!args.headed });
  // `?debug` is load-bearing, not decoration: signage.js keeps its per-sign placement metadata
  // ONLY under that flag (it is one object per sign inside a 1.2 ms work unit), and A1 audits that
  // metadata. Without it A1 reads an empty array and its "0 violations" would be vacuous.
  await S('Page.navigate', { url: `${base}/index.html?nosave=1&nohud&debug${LITE}` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 30);
  await quiesce(S, { timeout: 60000 });
  await evalJSON(S, '(window.__game.undock(), 1)');
  await settle(S, 10);

  // ═══ A — placement ═══════════════════════════════════════════════════════

  // A1. Living posters are the SAME placement as decision 9's baked ones — the same 12-20 m band,
  // the same 1:2 tile, the same "upper facade only" rule — with a different tile behind them. The
  // failure this guards against is a new layer that quietly writes its own size rules and takes
  // §3.10 #4's ruler with it.
  const geom = await evalJSON(S, `(() => {
    const recs = [...window.__game.city.live.values()];
    const all = [];
    for (const r of recs) for (const m of (r.sgMeta || [])) if (m.cls === 'poster') all.push(m);
    const live = all.filter(m => m.live);
    const lo = a => a.length ? Math.min(...a.map(m => m.y - m.h / 2)) : null;
    return {
      posters: all.length, living: live.length,
      wMin: live.length ? +Math.min(...live.map(m => m.w)).toFixed(2) : null,
      wMax: live.length ? +Math.max(...live.map(m => m.w)).toFixed(2) : null,
      arMin: live.length ? +Math.min(...live.map(m => m.w / m.h)).toFixed(4) : null,
      arMax: live.length ? +Math.max(...live.map(m => m.w / m.h)).toFixed(4) : null,
      lowestLive: lo(live), lowestBaked: lo(all.filter(m => !m.live)),
      signs: recs.reduce((a, r) => a + (r.sgMeta || []).length, 0),
    };
  })()`);
  const sites = await evalJSON(S, 'window.__game.signage.posterSites()');
  check('S2-G/A1 — a living poster is decision 9\'s placement with a different tile: same 12-20 m band, same 1:2 aspect, same upper-facade floor',
    geom.living > 0 && geom.posters > geom.living
      && geom.wMin >= 11.5 && geom.wMax <= 20.5
      && geom.arMin >= 0.495 && geom.arMax <= 0.505
      && geom.lowestLive >= 120 && sites.length === geom.living,
    `${geom.living} living of ${geom.posters} poster tiles in the ring (${geom.signs} signs total) — `
    + `both kinds present, which is the point: a still tile beside a live one is what makes the live one read as alive\n`
    + `width ${geom.wMin}-${geom.wMax} m against decision 9's 12-20; aspect ${geom.arMin}-${geom.arMax} against the baked 0.5\n`
    + `lowest living edge ${geom.lowestLive === null ? '-' : geom.lowestLive.toFixed(0)} m, lowest baked `
    + `${geom.lowestBaked === null ? '-' : geom.lowestBaked.toFixed(0)} m — decision 9's floor is 120\n`
    + `${sites.length} sweep sites against ${geom.living} quads: every living quad is visible to the range/view gate`);

  // A2. ONE draw and ONE texture, however many living posters there are. This is the constraint the
  // whole channel design exists to satisfy, so it is asserted rather than assumed.
  const bd = await evalJSON(S, 'window.__game.signBreakdown()');
  const st0 = await evalJSON(S, 'window.__state');
  const row = bd.rows.find(r => r.field === 'posters');
  check('S2-G/A2 — the whole living layer is ONE draw call and ONE texture, and the scene stays inside §3.8',
    !!row && row.draws === 1 && row.overflow === 0 && row.instances > 0
      && st0.draws <= GATES.draws && st0.errors.length === 0,
    `posters field: ${row.instances} instances, ${row.draws} draw, ${row.tris} tris, cap ${row.cap}, overflow ${row.overflow}\n`
    + `signage sub-total ${bd.draws} draws / ${(bd.tris / 1000).toFixed(1)}k tris; scene ${st0.draws} draws `
    + `against the ${GATES.draws} gate, ${st0.errors.length} errors\n`
    + `every living quad indexes one cell of one 2x2 canvas atlas, so the count above could double without adding a draw`);

  if (!sites.length) {
    check('S2-G — a living poster exists to measure', false, 'no living poster sites in the ring; nothing below can mean anything');
    await close();
    process.exit(1);
  }

  // ═══ B — the gate: distance, view, and the zeroes ════════════════════════

  // B1. THE PAIRED ZERO. Not "no channel is live far away" — that is a zero nobody has proved can
  // move. The same counters are read in the same check after flying to a poster.
  const far = sites[0];
  // 900 m up and looking straight down the far side of the site's own wall: outside RANGE and
  // facing away, so both halves of the gate are exercised at once.
  await faceSite(S, { x: far.x, y: far.y, z: far.z, nx: -far.nx, nz: -far.nz }, 800);
  const away = await board(S);
  const u0 = away.uploads;
  await sleep(WINDOW);
  const away2 = await board(S);

  const near = await faceSite(S, far, 150);
  await sleep(1500);
  const at = await board(S);
  const u1 = at.uploads;
  await sleep(WINDOW);
  const at2 = await board(S);

  check('S2-G/B1 FALSIFIED — out of range and facing away: no channel live, no clip decoding, no texture upload; and the same counters MOVE when the camera turns to a poster',
    away.live === 0 && away2.live === 0 && away2.playing === 0
      && away2.uploads - u0 === 0
      && at.live > 0 && at2.uploads - u1 > 0,
    `800 m behind the wall of site 0: ${away.live} channels live, ${away2.playing} clips decoding, `
    + `${away2.uploads - u0} atlas uploads over ${WINDOW / 1000} s (counter reads ${away2.uploads})\n`
    + `flown to 150 m in front of the same wall: ${at.live} channel(s) live, `
    + `${at2.uploads - u1} uploads over the same ${WINDOW / 1000} s, ${at2.playing} clip(s) decoding\n`
    + `THE FALSIFICATION IS THE SECOND LINE. A zero measured on a counter that never moves is what `
    + `gates_p7b D3 measured when Chrome served the board from its memory cache. This one moves `
    + `${away2.uploads - u0} → ${at2.uploads - u1} on the identical counter in the identical run`);

  // B2. The BYTES, same shape. A channel that has never been looked at has no `src` on any element,
  // so nothing is fetched — and that too is proved by making it non-zero.
  check('S2-G/B2 FALSIFIED — nothing is fetched for a poster nobody has looked at, and the fetch counter is proved able to rise',
    away.fetched === 0 && away.videoSrc === 0 && at2.fetched > 0,
    `at distance: ${away.fetched} media elements carry a src, ${away.videoSrc} of them .mp4\n`
    + `after looking: ${at2.fetched} carry a src, ${at2.videoSrc} of them .mp4, over ${at2.channels} channels\n`
    + `only the channel in front of the camera armed — the other ${at2.channels - at2.live} fetched nothing`);

  // B3. The decode cap. `posterVideo` is the one number the frame budget moves on, so it is
  // asserted against the live count rather than trusted from config.
  let peak = 0, samples = 0;
  for (let i = 0; i < 40; i++) {
    const b = await board(S);
    peak = Math.max(peak, b.playing);
    samples++;
    await sleep(400);
  }
  const b3 = await board(S);
  // On HIGH the cap is only a real constraint if the counter it caps has been seen off zero. B1
  // already watched a clip decode in this same run, so that observation is carried in here rather
  // than left as an assumption — "peak 0 <= cap 2" would otherwise pass on a layer that never
  // decoded anything at all.
  const sawDecode = peak > 0 || at2.playing > 0 || at.playing > 0;
  check('S2-G/B3 — no more clips decode at once than the preset\'s cap, and the cap is what the preset says',
    peak <= b3.maxVideo && b3.errors === 0 && (args.lite || sawDecode),
    `peak simultaneous decodes ${peak} over ${samples} samples (16 s) against the cap of ${b3.maxVideo}`
    + `${args.lite ? ' — LOW drops video entirely, so a peak above 0 here would be the bug' : ''}\n`
    + `${b3.channels} channels, ${b3.dead} dead items, ${b3.errors} media errors\n`
    + (args.lite
      ? 'the cap is 0 and the observed peak is 0; B1 in this same run proved the layer is otherwise live'
      : `a clip WAS observed decoding in this run (B1 saw ${at2.playing}) — without that, "peak `
        + `${peak} <= cap ${b3.maxVideo}" would pass on a layer that never decoded anything`));

  // ═══ C — it is actually alive ════════════════════════════════════════════

  // C1. The playlist moves AND the pixels move. Either alone is a gate that passes on a frozen
  // board: a state field can advance while the canvas never changes, and a canvas can change while
  // the same item is showing (a clip playing) — so both are required, and they are different
  // evidence.
  const liveIdx = (await board(S)).items.findIndex(x => x.live);
  const seen = new Set(), hashes = new Set();
  let kinds = new Set();
  for (let i = 0; i < 60; i++) {
    const b = await board(S);
    const it = b.items[liveIdx];
    if (it && it.live) { seen.add(it.item); kinds.add(it.kind); }
    hashes.add((await cellHash(S, liveIdx)).h);
    await sleep(500);
  }
  // THE CONTROL. 30 s of a changing picture proves nothing on its own — the camera is moving air
  // and the whole scene is animated, so a hash that counts 27 values could be counting rain. So the
  // playlist clock is stopped on a STILL item and the same two counters are read again: if they do
  // not both collapse to 1, the numbers above were measuring something other than the cycling.
  let frozenItems = new Set(), frozenHashes = new Set(), froze = false;
  for (let i = 0; i < 60 && !froze; i++) {
    const b = await board(S);
    if (b.items[liveIdx] && b.items[liveIdx].kind === 'still' && b.items[liveIdx].live) {
      await evalJSON(S, `(() => {
        const ch = window.__game.signage.posters.channels[${liveIdx}];
        for (const it of ch.items) { it._hold = it.hold; it.hold = 1e9; }
        return 1;
      })()`);
      froze = true;
      for (let k = 0; k < 12; k++) {
        const f = await board(S);
        if (f.items[liveIdx]) frozenItems.add(f.items[liveIdx].item);
        frozenHashes.add((await cellHash(S, liveIdx)).h);
        await sleep(500);
      }
      await evalJSON(S, `(() => {
        const ch = window.__game.signage.posters.channels[${liveIdx}];
        for (const it of ch.items) { it.hold = it._hold; }
        return 1;
      })()`);
      break;
    }
    await sleep(500);
  }
  check('S2-G/C1 FALSIFIED — the poster in front of the camera cycles, and stopping the playlist clock stops BOTH counters',
    seen.size >= 2 && hashes.size >= 2
      && froze && frozenItems.size === 1 && frozenHashes.size === 1,
    `channel ${liveIdx} showed ${seen.size} distinct items over 30 s: ${[...seen].join(', ')} (kinds: ${[...kinds].join(', ')})\n`
    + `its atlas cell took ${hashes.size} distinct pixel hashes over the same window\n`
    + `both are required. The item id advancing while the cell never changes is a playlist running `
    + `against a texture nobody redrew; the cell changing while the id never does is a clip playing `
    + `and no cycling at all\n`
    + `FALSIFIED: with the hold set to 1e9 on a still, the same 6 s window gives `
    + `${frozenItems.size} item and ${frozenHashes.size} hash (froze: ${froze}) — so neither counter `
    + `is picking up the rain, the camera, or anything else in a scene where everything else moves`);

  // C2. The clip half of the feature, on its own terms. A video item must actually reach the
  // atlas — decoded frames, not the still poster it starts from.
  const vidCh = (await board(S)).items.findIndex(x => x.live && x.kind === 'video');
  let vidHashes = new Set(), sawVideo = vidCh >= 0;
  if (vidCh >= 0) {
    for (let i = 0; i < 14; i++) { vidHashes.add((await cellHash(S, vidCh)).h); await sleep(300); }
  } else {
    // The clip may simply not be the item on screen right now; wait for one on the live channel.
    for (let i = 0; i < 80 && !sawVideo; i++) {
      const b = await board(S);
      if (b.items[liveIdx] && b.items[liveIdx].kind === 'video' && b.playing > 0) {
        sawVideo = true;
        for (let k = 0; k < 14; k++) { vidHashes.add((await cellHash(S, liveIdx)).h); await sleep(300); }
      }
      await sleep(400);
    }
  }
  check('S2-G/C2 — a clip really decodes onto the facade: the cell changes several times inside one item, not just at the switch',
    args.lite ? true : (sawVideo && vidHashes.size >= 4),
    args.lite
      ? 'LOW preset: posterVideo is 0 by design, so there is no clip to decode — the cycling stills are the whole feature here'
      : `${vidHashes.size} distinct pixel hashes over 4.2 s while a video item was on screen — a still `
        + `would give exactly 1, and the crossfade alone would give at most a handful at the boundary`);

  const png = await shot(S, args.lite ? 'poster_lite' : 'poster');
  console.log(`      capture: ${png}`);

  // ═══ D — it survives its assets not being there ══════════════════════════

  // D1. gates_p7b's D4 for the client portraits, applied here. The manifest is fetched with a
  // cache-buster onto a path that does not exist, which is the same failure a deleted directory
  // produces without moving a byte on disk.
  // Two evals with a real wait between them, NOT one async IIFE: `evalJSON` wraps the expression
  // in JSON.stringify, so a promise stringifies to `{}` and every field comes back undefined —
  // which is exactly the shape of a check that measures nothing and says so in fine print.
  const t0 = await evalJSON(S, `(() => {
    const b = window.__game.signage.posters;
    for (const ch of b.channels) { for (const it of ch.items) it.dead = true; ch.allDead = false; }
    return b.uploads;
  })()`);
  await sleep(3000);
  const broke = await evalJSON(S, `(() => {
    const b = window.__game.signage.posters;
    return { deadUploads: b.uploads - ${t0}, errors: window.__state.errors.length,
      channels: b.channels.length,
      allDead: b.channels.filter(c => c.allDead).length,
      live: b.channels.filter(c => c.live).length };
  })()`);
  check('S2-G/D1 — every item 404ing leaves the game running, the placeholder up, and does NOT turn into an upload storm',
    broke.deadUploads <= 4 && broke.errors === 0 && broke.allDead >= 1,
    `all items marked dead on all channels: ${broke.deadUploads} atlas uploads over the next 3 s, `
    + `${broke.errors} page errors, ${broke.allDead} of ${broke.channels} channels parked on the placeholder `
    + `(${broke.live} still inside the range/view gate, which is what makes the zero above meaningful — `
    + `a channel nobody is looking at would park for free)\n`
    + `this is a real regression guard, not a formality: the first build advanced past a dead item every `
    + `frame and every advance repainted — 67 uploads a second on a channel showing nothing`);

  const st1 = await evalJSON(S, 'window.__state');
  check('S2-G/D2 — the run ends clean',
    st1.errors.length === 0 && st1.draws <= GATES.draws,
    `${st1.errors.length} errors, ${st1.draws} draws, ${(st1.tris / 1000).toFixed(1)}k tris, `
    + `frame ${st1.ms.frame} ms (worst ${st1.ms.worst})`);

  await close();
  console.log(`\n${ok.length}/${ok.length + fail.length} passed · shots/s2g/_gates${args.lite ? '_lite' : ''}.json`);
  process.exit(fail.length ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
