#!/usr/bin/env node
/**
 * P7's own harness: the thirteen HUD criteria, measured.
 *
 * `tools/gates_hud.mjs` is the manager's file (§8.4) and this is not it — this
 * is the instrument the manager's gate can wrap or lift. Every number in the P7
 * report comes out of here.
 *
 *   node tools/hudcheck.mjs              everything
 *   node tools/hudcheck.mjs --node       H1 H3 H6 H7 H8 H9 H10 H13 (no browser)
 *   node tools/hudcheck.mjs --cdp        H2 H4 H5 H11 H12 (headless Chrome)
 *   node tools/hudcheck.mjs --falsify    revert each feature and REQUIRE red
 *   node tools/hudcheck.mjs --dives 200  H7's sample size
 *   node tools/hudcheck.mjs --json out.json
 *
 * The falsification half is the half that makes the other half mean anything.
 * Three phases running, `--falsify` has found holes in the tests themselves
 * (D47, D61, D78, D94), so every switch below is expected to be caught by
 * exactly one criterion and any switch nothing catches is REPORTED, not hidden.
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
/** P8b, additive: H6 and H7 hardcoded portrait. Default unchanged. */
const HMODE = opt('--mode', 'portrait');

/* ------------------------------------------------------------- reporting -- */

export const results = [];
let quiet = false;
function row(id, name, pass, detail) {
  results.push({ id, name, pass: !!pass, detail: String(detail) });
  if (!quiet) console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${id.padEnd(4)} ${name.padEnd(34)} ${detail}`);
  return !!pass;
}
const median = (a) => {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) * 0.5;
};
const pct = (n, d) => d ? (100 * n / d) : 0;
/** Reported, not gated. Used where a criterion is mis-specified rather than unmet. */
function note(id, name, detail) {
  results.push({ id, name, pass: true, info: true, detail: String(detail) });
  if (!quiet) console.log(`  NOTE  ${id.padEnd(4)} ${name.padEnd(34)} ${detail}`);
}

/* ============================================================= H1, H13 === */

const UI_DIR = join(ROOT, 'js/ui');

/** Strip comments, string literals and regex literals: a number in prose or in
 *  a character class is not a pixel offset. */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/(^|[=(,:[!&|?+\s])\/(?![*/])(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*/g, '$1 RE ');
}

/** Files in js/ui/ that are not widgets. Both are asserted to be what they claim. */
const H1_EXEMPT = new Set(['layout.js', 'colour.js']);

/**
 * H1 as WORDED — "grep js/ui/ for numeric px constants outside layout.js's slot
 * table: zero" — is not mechanically checkable: a stroke weight is a px constant
 * and ART §10 specifies two of them by number, so a literal reading fails on the
 * contrast rule itself. See P7_NOTES §H1.
 *
 * Operationalised, strictly and mechanically: outside `layout.js`, NO numeric
 * literal of magnitude >= 3 may appear at all, anywhere, in any context, and no
 * template string may interpolate a value next to `px`. 0, 1, 2 and fractions
 * survive (a half, a sign, a diameter); every px-scale quantity has to be a
 * named import. That is stronger than the intent and it is checkable.
 */
export function scanPx(dir, exempt = H1_EXEMPT) {
  const bad = [];
  let scanned = 0;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js') || exempt.has(f)) continue;
    scanned++;
    const src = strip(readFileSync(join(dir, f), 'utf8'));
    src.split('\n').forEach((line, i) => {
      // `(?<![eE][+-])` keeps the 6 in `1e-6` out: an exponent is not an offset
      for (const m of line.matchAll(/(?<![\w.$])(?<![eE][+-])(\d+(?:\.\d+)?)/g)) {
        if (Math.abs(parseFloat(m[1])) >= 3) bad.push(`${f}:${i + 1} ${m[1]}`);
      }
    });
  }
  return { bad, scanned };
}

export function scanModals(root) {
  const hits = [];
  const walk = (dir) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      if (f.name === 'node_modules' || f.name.startsWith('.')) continue;
      const p = join(dir, f.name);
      if (f.isDirectory()) { if (f.name !== 'docs' && f.name !== 'assets' && f.name !== 'shots') walk(p); continue; }
      if (!/\.(js|mjs|html)$/.test(f.name)) continue;
      const src = strip(readFileSync(p, 'utf8'));
      for (const k of MODAL_CALLS) {
        if (new RegExp(`(?<![\\w.$])${k}\\s*\\(`, 'g').test(src)) hits.push(`${p.slice(root.length + 1)}: ${k}()`);
      }
    }
  };
  walk(root);
  return hits;
}

function h1() {
  const bad = [];
  let scanned = 0;
  // colour.js is exempt only because it is a codec: it must not import the
  // metrics table and must not be able to draw. Asserted, not assumed.
  const codec = readFileSync(join(UI_DIR, 'colour.js'), 'utf8');
  if (/from '\.\/layout\.js'/.test(codec) || /\bg\.(beginPath|fill|stroke|arc|moveTo)/.test(codec)) {
    bad.push('colour.js is exempt from H1 but imports layout.js or draws');
  }
  const r = scanPx(UI_DIR);
  bad.push(...r.bad); scanned = r.scanned;
  return row('H1', 'no pixel literals outside layout.js', bad.length === 0,
             bad.length ? bad.slice(0, 6).join(' ')
                        : `0 numeric literals >= 3 across ${scanned} widget files ` +
                          `(exempt: ${[...H1_EXEMPT].join(', ')})`);
}

/**
 * The three names are ASSEMBLED rather than written, so this file does not
 * itself match the pattern it greps for. The first version of this check failed
 * on its own source, which is funny once and a false positive forever.
 */
const MODAL_CALLS = ['al' + 'ert', 'con' + 'firm', 'pro' + 'mpt'];

function h13() {
  const hits = scanModals(ROOT);
  return row('H13', 'no modals anywhere in the tree', hits.length === 0,
             hits.length ? hits.slice(0, 4).join(' ') : `zero ${MODAL_CALLS.join('/')}`);
}

/* ==================================================================== H3 === */

const WHITE = '#FFFFFF';        // Act IV snow
const NIGHT = '#080B12';        // Act III night

async function h3() {
  const { INK, markContrast, srgb, contrast, composite } = await import('../js/ui/theme.js');
  const inks = ['bright', 'ink', 'brass', 'hostile', 'hostileHot', 'friendly', 'crate',
                'objective', 'warn', 'danger'];
  const rows = [];
  let worstBest = Infinity, worstSep = Infinity, naiveFails = 0;
  for (const k of inks) {
    for (const bg of [WHITE, NIGHT]) {
      const m = markContrast(INK[k], bg);
      rows.push({ ink: k, bg, ...m });
      worstBest = Math.min(worstBest, m.best);
      worstSep = Math.min(worstSep, m.fillVsOutline);
      if (m.fillVsBg < 4.5) naiveFails++;
    }
  }
  // the outline itself must separate from both grounds, or the mark has no edge
  const olW = contrast(composite(srgb(INK.outline), srgb(WHITE), INK.outlineA), srgb(WHITE));
  const olN = contrast(composite(srgb(INK.outline), srgb(NIGHT), INK.outlineA), srgb(NIGHT));

  /**
   * H3 AS WORDED IS ARITHMETICALLY UNSATISFIABLE and no palette choice fixes it.
   * 4.5:1 against #FFFFFF requires relative luminance <= 0.1833; 4.5:1 against
   * #080B12 requires >= 0.1953. There is no colour in between, which is exactly
   * WHY ART §10 specifies that every element is drawn twice. The implementable
   * criterion is therefore about the MARK, not about one of its two tones: on
   * each ground, at least one tone of the mark must clear 4.5:1.
   *
   * `fillVsOutline` is reported and deliberately NOT gated. Requiring a
   * saturated fill to clear 4.5:1 against its own near-black outline is the same
   * impossibility one level down — it would force every warm red to near-white
   * and delete DESIGN §2.7's colour law. The outline's job is to separate the
   * mark from the GROUND, which is what `olW` measures.
   */
  const pass = worstBest >= 4.5;
  row('H3', 'two-tone mark reads on both grounds', pass,
      `worst tone-vs-ground ${worstBest.toFixed(2)}:1 over ${rows.length} ink x ground pairs; ` +
      `outline vs white ${olW.toFixed(2)}:1, outline vs night ${olN.toFixed(2)}:1`);
  note('H3n', 'H3 as worded is unsatisfiable',
      `${naiveFails}/${rows.length} single-colour readings below 4.5. No colour clears 4.5 ` +
      `against BOTH #FFFFFF (needs L<=0.1833) and #080B12 (needs L>=0.1953)`);
  note('H3s', 'fill vs its own outline (not gated)',
      `worst ${worstSep.toFixed(2)}:1 (hostileHot on snow) — saturated ink cannot clear 4.5 ` +
      `against near-black; the outline separates the mark from the ground instead`);
  return { pass, rows, worstBest, worstSep, naiveFails, olW, olN };
}

/* ==================================================================== H6 === */

async function h6(mode = 'portrait') {
  const { tapeModel } = await import('../js/ui/alttape.js');
  const { BANDS, CEILING_WU, CONCORD_LINE_WU } = await import('../js/core/bands.js');
  const { VIEW_PROFILE } = await import('../js/core/viewprofile.js');
  // P8b, additive: the portrait literal is left exactly as shipped so the
  // default reproduces byte-for-byte; any other mode resolves its own tape rect.
  // (Verified: resolveLayout(portrait).tape IS {6, 185.68, 34, 530.16}.)
  let rect = { x: 6, y: 185.68, w: 34, h: 530.16 };
  if (mode !== 'portrait') {
    const { resolveLayout } = await import('../js/ui/layout.js');
    const { makeView } = await import('./p8engage.mjs');
    const t = resolveLayout(makeView(mode)).tape;
    rect = { x: t.x, y: t.y, w: t.w, h: t.h };
  }
  const m = tapeModel(rect, {
    playerY: -3000, playerX: 0, viewTopY: -3500, viewBotY: -2500, contacts: [], energyWu: -3400,
    pipRangeWu: VIEW_PROFILE[mode].zoomLockRange,
  });
  const names = m.bands.map((b) => b.name).join('/');
  const top = m.bands[m.bands.length - 1].top, bot = m.bands[0].bot;
  const spans = Math.abs(top - rect.y) < 0.01 && Math.abs(bot - (rect.y + rect.h)) < 0.01;
  const six = m.bands.length === BANDS.length;
  const named = m.bands.every((b) => b.name && b.name.length);
  const concordAbove = m.concordY < rect.y;
  const pass = spans && six && named && concordAbove;
  row('H6', 'tape shows the whole column', pass,
      `0 -> ${CEILING_WU} wu in ${rect.h.toFixed(0)} px, ${m.bands.length} bands ${names}, ` +
      `Concord (${CONCORD_LINE_WU.toFixed(0)} wu) drawn ${(rect.y - m.concordY).toFixed(0)} px above the top`);
  return { pass, spans, six, named, concordAbove, px_per_wu: rect.h / 10000 };
}

/* ==================================================================== H8 === */

async function h8() {
  const { chevronModel } = await import('../js/ui/overlay.js');
  const screen = { x: 0, y: 0, w: 390, h: 844 };
  const toScreen = (wx, wy, o) => { o.x = 195 + wx; o.y = 422 + wy; return o; };
  // eight contacts, all off screen horizontally, well separated vertically
  const eight = [];
  for (let i = 0; i < 8; i++) {
    eight.push({ id: 'c' + i, x: (i % 2 ? 1 : -1) * (400 + i * 60), y: -300 + i * 80,
                 side: -1, kind: 'aircraft', dist: 400 + i * 60, closing: 20 });
  }
  const drawn = chevronModel(eight, screen, toScreen);
  const a = row('H8', 'chevron merge: 8 contacts -> 3', drawn.length === 3,
                `${drawn.length} drawn, kept the 3 nearest (${drawn.map((c) => c.id).join(',')})`);

  // and the merge half: two of the kept three on the same edge, 4 px apart
  const clumped = [
    { id: 'n0', x: -400, y: 0, side: -1, kind: 'aircraft', dist: 400, closing: 0 },
    { id: 'n1', x: -410, y: 4, side: -1, kind: 'aircraft', dist: 410, closing: 0 },
    { id: 'n2', x: -420, y: 300, side: -1, kind: 'aircraft', dist: 420, closing: 0 },
    { id: 'n3', x: -900, y: -300, side: -1, kind: 'aircraft', dist: 900, closing: 0 },
  ];
  const merged = chevronModel(clumped, screen, toScreen);
  const b = row('H8b', 'two chevrons 4 px apart become one', merged.length === 2 && merged[0].n === 2,
                `${merged.length} marks, counts ${merged.map((c) => c.n).join('+')}`);
  return { pass: a && b, drawn: drawn.length, merged: merged.length };
}

/* =============================================================== H9, H10 === */

async function h9h10() {
  const { createCards, cardDuration, validateScript } = await import('../js/ui/cards.js');
  const long = 'Belt is thick over the whole sector today, climb through it before they see you';
  const errs = validateScript({ lines: {
    ok:   { kind: 'radio', text: "Belt's thick today. Climb through it." },
    bad:  { kind: 'radio', text: long },
    card: { kind: 'card',  text: long },
  } });
  const a = row('H9', 'radio > 44 chars fails the load', errs.length === 1 && errs[0].id === 'bad',
                `${errs.length} error(s); the ${long.length}-char radio line refused, ` +
                `the same text as kind:"card" allowed`);

  // H10: the audio layer is not stubbed, it is ABSENT — this module never sees it
  const cards = createCards({});
  const texts = ['Go.', "Belt's thick today. Climb through it.",
                 'Silk at ten. Take it or they will.', 'x'.repeat(44)];
  const durs = texts.map((t) => cards.push({ id: t.slice(0, 6), kind: 'radio', text: t }).shown);
  const zero = durs.filter((d) => !(d > 0)).length;
  const matches = durs.every((d, i) => Math.abs(d - cardDuration(texts[i])) < 1e-9);
  const b = row('H10', 'card duration is text-derived', zero === 0 && matches,
                `no audio layer present; durations ${durs.map((d) => d.toFixed(2)).join(' ')} s, ` +
                `0 ms cards: ${zero}`);
  // and audio may only EXTEND
  const shortAudio = cards.push({ id: 'sa', kind: 'radio', text: 'Go.', audioLen: 0.2 }).shown;
  const longAudio = cards.push({ id: 'la', kind: 'radio', text: 'Go.', audioLen: 5.0 }).shown;
  const c = row('H10b', 'audio may only extend a card', shortAudio === cardDuration('Go.') && longAudio === 5.0,
                `0.2 s take -> ${shortAudio.toFixed(2)} s (text), 5.0 s take -> ${longAudio.toFixed(2)} s`);
  const bad = cards.push({ id: 'refused', kind: 'radio', text: long });
  const d = row('H9b', 'an over-long radio line does not render', bad === null, 'push() refused it');
  return { pass: a && b && c && d, durs };
}

/* ==================================================================== H7 === */

/**
 * H7 — "over 200 seeded dives, the tape pip appears BEFORE the attacker's
 * silhouette enters the frame, with a median lead of >= 0.6 s".
 *
 * Run in node against the shipping modules: `createWorld` + `createAI` fly a
 * real attacker, `createCamera` chooses the real zoom, and `tapeModel` is the
 * shipping tape. Nothing here re-derives the mapping.
 *
 * TWO EVENTS, BOTH GENUINE TRANSITIONS. The attacker starts OUTSIDE the tape's
 * pip cylinder (|dx| > PIP_RANGE_WU) as well as above the frame, so "pip
 * appears" is a real crossing rather than a fact about the spawn table. A
 * scenario where every attacker starts inside the cylinder would make H7
 * measure how long the AI takes to arrive and report it as warning time — the
 * believable-wrong metric this project has been bitten by twice (D43, D82).
 * Both arrangements are measured and both are reported.
 */
async function h7(n = 200, opts = {}) {
  const { createWorld, ENEMY_BY_ID, playerType, framingContributions } = await import('../js/sim/entities.js');
  const { createCamera } = await import('../js/core/camera.js');
  const { createRNG } = await import('../js/core/rng.js');
  const { VIEW_PROFILE } = await import('../js/core/viewprofile.js');
  const { tapeModel } = await import('../js/ui/alttape.js');
  const { resolveLayout } = await import('../js/ui/layout.js');
  const { M_PER_WU } = await import('../js/core/math.js');

  const DT = 1 / 60;
  // P8b, additive: `opts.mode` defaults to the shipped portrait numbers.
  const mode = opts.mode || 'portrait';
  const W = mode === 'portrait' ? 390 : 844, H = mode === 'portrait' ? 844 : 390;
  const profile = VIEW_PROFILE[mode];
  const scale0 = H / profile.worldH;
  const view = {
    mode, w: W, h: H, dpr: 2, profile,
    worldH: profile.worldH, worldW: W / scale0, scale: scale0,
    safe: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  const L = resolveLayout(view);
  const HULL_WU = 64;

  const st = { playerX: 0, playerY: 0, viewTopY: 0, viewBotY: 0, contacts: [], pipRangeWu: profile.zoomLockRange };
  const tape = { bands: [], pips: [] };
  const box = [];

  /**
   * `framepip`'s window comes from the SHIPPED `alttape.js` (P8c). It used to be
   * computed here; the harness's copy was repaired and `js/ui/hud.js`'s was not,
   * which is a break-switch that goes red in the test and stays green in the
   * browser. One definition, imported — DESIGN §10.8's anti-mock rule.
   */
  const { framePipWindowPx } = await import('../js/ui/layout.js');
  const FRAMEPIP_WIN_PX = framePipWindowPx(view, L.tape);

  /**
   * The attacker is flown by the SHIPPING pilot on a `point` intent at the
   * player, re-aimed every AI period. The full `ai.js` state machine is
   * deliberately NOT used here and it is worth saying why: run with `createAI`,
   * the attacker merges head-on at 3 s, EXTENDs, and never comes back — over
   * twenty seconds it never dives at all, so the run would measure the AI's
   * engagement logic and report it as tape warning time. H7 is a test of the
   * TAPE. A real airframe on a real pursuit curve under the real physics is the
   * right isolation; `ai.js`'s own engagement is P5's gate, not this one.
   */
  const AIM_PERIOD = 0.4;

  function one(seed, far) {
    const rng = createRNG('h7:' + seed);
    const world = createWorld({ rng }, {});
    const py = -450;                                   // m, mid-Floor
    /**
     * Half the seeds fly the player WEST. Every symmetry defect P5 found
     * (D79) surfaced first as a result that depended on which way an aeroplane
     * was pointing, so a warning-time measurement taken only eastbound is not
     * one I would trust.
     */
    const west = (seed & 1) === 1;
    const dir = west ? -1 : 1;
    const player = world.spawn(playerType('kite_b1', 't2'),
      { id: 'player', side: 1, xM: 0, yM: py, speed: 40, theta: west ? Math.PI : 0, k: 0.8 });
    // The `far` arm starts JUST outside the pip cylinder, high: the attacker has
    // to cross into it, so the pip is a real transition, and the dive is steep
    // enough that it actually arrives. Started 2-3 cylinders out it flies a long
    // shallow pursuit and never frames at all — 20 of 30 dives timed out.
    const dAlt = far ? rng.range(220, 520) : rng.range(140, 330);   // m above
    const dxWu = far ? rng.range(1.04, 1.55) * profile.zoomLockRange
                     : rng.range(0.1, 0.85) * profile.zoomLockRange;
    /**
     * The attacker is AHEAD of the player and above, closing. A stern chase is
     * not a dive: started behind, the diver settles 600-850 wu astern and never
     * frames at all — 26 of 40 runs timed out, which would have been reported as
     * "the tape warns 7 s early" on a sample of the 14 that happened to work.
     */
    const foe = world.spawn(ENEMY_BY_ID.shrike, {
      id: 'diver', side: -1, xM: dir * dxWu * M_PER_WU, yM: py - dAlt,
      speed: 52, theta: west ? 0 : Math.PI, k: 0.9,
    });
    const cam = createCamera(view, { bias: 'normal' });
    cam.reset(0, py / M_PER_WU, 1);

    let tPip = -1, tFrame = -1, t = 0, aim = 0, why = 'timeout', minDx = 1e9, minDy = 1e9;
    for (let i = 0; i < 60 * 30 && (tFrame < 0 || tPip < 0); i++) {
      const pf = player.flight, ff = foe.flight;
      aim -= DT;
      if (aim <= 0) {
        aim = AIM_PERIOD;
        // lead the player by one aim period, so the dive is a pursuit curve
        foe.pilot.setIntent('point', { xM: pf.sx + pf.svx * AIM_PERIOD, yM: pf.sy + pf.svy * AIM_PERIOD });
      }
      world.update(DT);
      t += DT;
      if (!player.alive || !foe.alive || foe.dead) { why = foe.dead ? 'diver dead' : !player.alive ? 'player gone' : 'foe gone'; break; }

      cam.clearTracked();
      framingContributions(world, player, box, profile.admitWu);
      for (const m of box) cam.track(m.id, m.x, m.y, m.w, m.h, m.weight);
      cam.update({ x: pf.sx / M_PER_WU, y: pf.sy / M_PER_WU, vx: pf.svx / M_PER_WU,
                   vy: pf.svy / M_PER_WU, angle: pf.theta, hull: HULL_WU }, DT);

      const s = view.scale * cam.zoom;
      const halfH = view.worldH / cam.zoom * 0.5;
      st.playerX = pf.sx / M_PER_WU; st.playerY = pf.sy / M_PER_WU;
      st.viewTopY = cam.y - halfH; st.viewBotY = cam.y + halfH;
      st.contacts.length = 0;
      st.contacts.push({ id: foe.id, x: ff.sx / M_PER_WU, y: ff.sy / M_PER_WU, side: -1, kind: 'aircraft' });
      tapeModel(L.tape, st, tape);
      if (opts.framepip) {
        const keep = tape.pips.filter((p) => Math.abs(p.y - tape.playerY) < FRAMEPIP_WIN_PX);
        tape.pips.length = 0; tape.pips.push(...keep);
      }
      if (opts.notape) tape.pips.length = 0;
      if (tPip < 0 && tape.pips.length) tPip = t;

      // the silhouette is in frame when its screen rect meets the viewport
      const dx = Math.abs(ff.sx / M_PER_WU - cam.x), dy = Math.abs(ff.sy / M_PER_WU - cam.y);
      minDx = Math.min(minDx, dx * s - (W * 0.5 + HULL_WU * s * 0.5));
      minDy = Math.min(minDy, dy * s - (H * 0.5 + HULL_WU * s * 0.5));
      if (tFrame < 0 && dx * s <= W * 0.5 + HULL_WU * s * 0.5 && dy * s <= H * 0.5 + HULL_WU * s * 0.5) tFrame = t;
    }
    return { tPip, tFrame, why, minDx, minDy, lead: (tPip >= 0 && tFrame >= 0) ? tFrame - tPip : NaN, far };
  }

  const arms = {};
  for (const far of [true, false]) {
    const runs = [];
    for (let i = 0; i < n; i++) runs.push(one(i, far));
    const usable = runs.filter((r) => r.tFrame >= 0);
    const warned = usable.filter((r) => r.tPip >= 0 && r.tPip < r.tFrame);
    const leads = warned.map((r) => r.lead);
    const whys = {};
    for (const r of runs) if (r.tFrame < 0) whys[r.why] = (whys[r.why] || 0) + 1;
    if (process.env.H7DEBUG) for (const r of runs.slice(0, 8))
      console.log('   dbg', far ? 'far' : 'near', 'tPip', r.tPip.toFixed(2), 'tFrame', r.tFrame.toFixed(2),
                  'minDx', r.minDx.toFixed(0), 'minDy', r.minDy.toFixed(0));
    arms[far ? 'far' : 'near'] = {
      whys, n: runs.length, usable: usable.length, warned: warned.length,
      median: median(leads), min: Math.min(...leads), max: Math.max(...leads),
      p10: leads.length ? [...leads].sort((a, b) => a - b)[Math.floor(leads.length * 0.1)] : NaN,
    };
  }
  const far = arms.far;
  const pass = far.warned === far.usable && far.median >= 0.6;
  if (!opts.quiet) row('H7', 'tape warns before the frame does', pass,
      `far arm: ${far.warned}/${far.usable} warned first (of ${far.n} dives), median lead ` +
      `${far.median.toFixed(2)} s (p10 ${far.p10.toFixed(2)}, min ${far.min.toFixed(2)}, ` +
      `max ${far.max.toFixed(2)}); unusable: ${JSON.stringify(far.whys)}`);
  if (!opts.quiet) row('H7b', '...attackers starting inside the cylinder', arms.near.warned === arms.near.usable,
      `near arm: ${arms.near.warned}/${arms.near.usable} warned first, median lead ` +
      `${arms.near.median.toFixed(2)} s — a spawn-table artefact, reported not gated`);
  return { pass, arms };
}

/* =================================================================== H14 === */

/**
 * H14 — THE BRIEF HAS NO CRITERION FOR THE THREAT BRACKET.
 *
 * Deliverable 3 is "a converging red bracket 0.5 s before any enemy with a
 * firing solution opens fire", and DESIGN §3.6 rule 1 calls it the single most
 * important readability feature in the game — and none of H1..H13 measures it.
 * A feature with no criterion is a feature nobody has checked, so here is one.
 *
 * Measured against the shipping `gun:fire` event: over N seeded engagements,
 * how long before the first round leaves an enemy's gun did `threatModel` put a
 * bracket on that enemy?
 */
async function h14(n = 60, opts = {}) {
  const { createWorld, ENEMY_BY_ID, playerType } = await import('../js/sim/entities.js');
  const { createAI } = await import('../js/sim/ai.js');
  const { createRNG } = await import('../js/core/rng.js');
  const { createBus } = await import('../js/core/events.js');
  const { threatModel } = await import('../js/ui/overlay.js');
  const DT = 1 / 60;
  const leads = [];
  let engagements = 0, unwarned = 0, duty = 0, frames = 0;

  for (let seed = 0; seed < n; seed++) {
    const rng = createRNG('h14:' + seed);
    const bus = createBus();
    const world = createWorld({ rng, bus }, {});
    const west = (seed & 1) === 1;
    const player = world.spawn(playerType('kite_b1', 't2'),
      { id: 'player', side: 1, xM: 0, yM: -450, speed: 40, theta: west ? Math.PI : 0, k: 0.8 });
    const foe = world.spawn(ENEMY_BY_ID.shrike, {
      id: 'foe', side: -1, xM: (west ? -1 : 1) * rng.range(180, 320), yM: -450 + rng.range(-40, 40),
      speed: 46, theta: west ? 0 : Math.PI, k: 0.85,
    });
    foe.ai = createAI(foe, { k: 0.85, aggro: 1 });
    /**
     * The warning is the length of the CONTINUOUS bracket episode that was up
     * when the gun fired — not the first bracket ever seen. The first version
     * measured the latter and reported a 0.917 s median lead on a 0.9 s
     * lookahead, which is impossible and was the tell: a bracket that flickered
     * once seconds earlier was being scored as seconds of warning.
     */
    let firstFire = -1, since = -1, warned = -1, t = 0;
    let bracketFrames = 0;
    bus.on('gun:fire', (e) => { if (e.id === foe.id && firstFire < 0) firstFire = t; });
    const model = [];
    const tstate = new Map();
    for (let i = 0; i < 60 * 40 && firstFire < 0; i++) {
      world.update(DT);
      t += DT;
      if (!player.alive || !foe.alive || foe.dead || player.dead) break;
      if (!opts.nobracket) {
        threatModel(player, [foe], model, { lead: opts.lead, hold: opts.hold, coneK: opts.coneK, state: tstate, dt: DT });
        if (model.length) { bracketFrames++; if (since < 0) since = t; }
        else since = -1;
        warned = since >= 0 ? t - since : -1;
      }
    }
    frames += Math.round(t * 60); duty += bracketFrames;
    if (firstFire < 0) continue;
    engagements++;
    if (warned < 0) { unwarned++; continue; }
    leads.push(warned);
  }
  const med = median(leads);
  const pass = engagements > 0 && unwarned === 0 && med >= 0.5;
  if (!opts.quiet) row('H14', 'threat bracket precedes the first round', pass,
      `${leads.length}/${engagements} engagements bracketed first, median lead ${med.toFixed(3)} s ` +
      `(target 0.5 s, floor 0.4); bracket up on ${pct(duty, frames).toFixed(1)}% of frames; unwarned ${unwarned}`);
  return { pass, engagements, unwarned, median: med, n: leads.length, duty: pct(duty, frames) };
}

/* ==================================================================== run -- */

export async function runNode(dives) {
  console.log('\n-- node --');
  const out = {};
  out.H1 = h1();
  out.H13 = h13();
  out.H3 = await h3();
  out.H6 = await h6(HMODE);
  out.H8 = await h8();
  out.H9 = await h9h10();
  out.H7 = await h7(dives, { mode: HMODE });
  out.H14 = await h14(60);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dives = parseInt(opt('--dives', '200'), 10);
  quiet = flag('--quiet');
  const doNode = flag('--node') || !flag('--cdp');
  const out = {};
  if (doNode) Object.assign(out, await runNode(dives));
  if (flag('--cdp') || (!flag('--node') && !flag('--falsify'))) {
    const { runCdp } = await import('./hudcdp.mjs');
    // P8c, additive: D101 says H11 has no single value and must be read as a
    // rest-position sweep; `runCdp` has always had the arm and no flag reached it.
    Object.assign(out, await runCdp({ row, note, secs: parseFloat(opt('--secs', '60')),
                                      mode: HMODE, sweep: flag('--thumbsweep') }));
  }
  if (flag('--falsify')) {
    const { falsify } = await import('./hudfalsify.mjs');
    await falsify({ row, h7, mode: HMODE });
  }
  const bad = results.filter((r) => !r.pass);
  console.log(`\n${results.length - bad.length}/${results.length} pass` +
              (bad.length ? `  RED: ${bad.map((r) => r.id).join(' ')}` : ''));
  if (opt('--json')) writeFileSync(opt('--json'), JSON.stringify({ results, out }, null, 1));
  process.exit(bad.length ? 1 : 0);
}

export { h1, h13, h3, h6, h7, h8, h9h10, h14, h3 as _h3, row, note, median, pct, ROOT, UI_DIR, H1_EXEMPT };
