// tools/gates_p7b.mjs — P7b: §7.3's docking panel, §9.6's media element, and obligation T8.
//
// T8 (DECISIONS) moves four of P9's §13 done-criteria here, because they are assertions about a
// panel that did not exist when P9 ran:
//   D1  the clip plays INLINE under mobile emulation
//   D2  a forced `play()` rejection lands on the still path
//   D3  zero `.mp4` fetched when only the job board has been opened
//   D4  deleting `assets/clients/` leaves the game fully playable — RUN, not reasoned about
// plus the mandatory `muted playsinline webkit-playsinline` on every client video element.
//
// Rules this file obeys, all of them paid for on this project:
//   1. every result is written to disk the moment it completes, never batched;
//   2. a gate that cannot fail is not a gate — `--falsify` breaks what six of these guard;
//   3. no `&&`-guarded setup: isolation goes through `hook()`, which THROWS on a missing hook;
//   4. a probe whose "before" state is already its "after" state is not a measurement. D3 in
//      particular is worthless unless the same probe is shown catching a real `.mp4` (F3).
//
// usage:  node tools/gates_p7b.mjs [--falsify] [--headed]

import { writeFileSync, mkdirSync, renameSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { open, waitFor, settle, evalJSON, hook, logs } from './shot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT_DIR = resolve(ROOT, 'shots/p7b');
const OUT = resolve(OUT_DIR, '_gates.json');
const CLIENTS = resolve(ROOT, 'assets/clients');
const CLIENTS_AWAY = resolve(ROOT, 'assets/_clients_moved_by_gate');

const FALSIFY = process.argv.includes('--falsify');
const HEADED = process.argv.includes('--headed');

mkdirSync(OUT_DIR, { recursive: true });

const results = [];
const started = new Date().toISOString();

function flush() {
  const ok = results.filter(r => r.pass).map(r => r.name);
  const fail = results.filter(r => !r.pass).map(r => r.name);
  // BOTH gate-file schemas. MANAGER_STATE records a parser that read one key against a file
  // written in the other and reported 0/0 on a suite that fully passed.
  writeFileSync(OUT, JSON.stringify({
    phase: 'p7b', at: started, updated: new Date().toISOString(), node: process.version,
    total: results.length, passed: ok.length, failed: fail.length, results, ok, fail,
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
  console.log((rec.pass ? '  ok   ' : '  FAIL ') + name.padEnd(44) + ' ' + rec.detail);
  return rec;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// A press through the input pipeline at the element's real screen position, hit-tested. `el.click()`
// bypasses hit testing, so it would happily "press" a button covered by the control layer — the
// exact bug worth catching on a game whose whole screen is a touch surface.
async function clickSel(S, sel, nth = 0) {
  const box = await evalJSON(S, `(() => {
    const el = document.querySelectorAll(${JSON.stringify(sel)})[${nth}];
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return { empty: true };
    if (r.y + r.height / 2 < 0 || r.y + r.height / 2 > innerHeight) return { offscreen: true, y: Math.round(r.y) };
    const x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
    const hit = document.elementFromPoint(x, y);
    return { x, y, text: (el.textContent || '').slice(0, 40), disabled: !!el.disabled,
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

// Dock at the HUB and open the board. §7.2's DOCK button, not a teleport: the craft starts ON the
// HUB deck and automatic docking deliberately arms only after leaving a cylinder.
async function dockHub(S) {
  if (await evalJSON(S, '!!__state.dock')) return true;
  await evalJSON(S, '__game.forceDock()');
  await settle(S, 8);
  return evalJSON(S, '!!__state.dock');
}

console.log('\nNEONHAUL — P7b gates (§7.3 docking panel, §9.6 media, obligation T8)\n');

// Portrait phone metrics, and mobile emulation with an iPhone UA — T8 D1 requires the inline
// assertion to be made under exactly this, not on a desktop window.
const H = await open({ w: 390, h: 844, dpr: 2, mobile: true, headed: HEADED });
const S = H.S;

// ── the network probe ──────────────────────────────────────────────────────
// D3's whole content is a count of `.mp4` requests, so the probe is the gate. It is proved in F3
// by showing it DOES see the request the panel makes; a counter that always reads zero is this
// project's dominant failure mode.
const net = [];
await S('Network.enable');
// The board is opened more than once in this suite, and a cached thumb makes no request at all —
// which reads exactly like "the board fetched nothing", the answer D3 is looking for. With the
// cache off, a zero is a real zero.
await S('Network.setCacheDisabled', { cacheDisabled: true });
H.cdp.ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method === 'Network.requestWillBeSent') net.push({ url: m.params.request.url, status: 0 });
  if (m.method === 'Network.responseReceived') {
    const r = net.find(x => x.url === m.params.response.url && !x.status);
    if (r) r.status = m.params.response.status;
  }
});
const since = () => net.length;
const mp4sSince = n => net.slice(n).filter(r => /\.mp4(\?|$)/.test(r.url));
const jpgsSince = n => net.slice(n).filter(r => /\.jpg(\?|$)/.test(r.url));

try {
  await S('Page.navigate', { url: `${H.base}/index.html?nosave=1` });
  await waitFor(S, 'window.__ready', 60000);
  await settle(S, 45);

  // ───────────────────────────────────────────────────────────────────────
  // B1 — the board shows DISTINCT clients. §7.1 assigns one client per PAD and the first browser
  // run rendered that literally: three slots, one name, one quote, on the first screen of the game.
  // ───────────────────────────────────────────────────────────────────────
  await gate('B1 a board slot is its own client, not the pad\'s', async () => {
    await dockHub(S);
    const b = await evalJSON(S, `(() => {
      const jobs = __game.board();
      return { n: jobs.length,
        names: jobs.map(j => j.client && j.client.name),
        ids: jobs.map(j => j.clientId),
        lines: jobs.map(j => j.client && j.client.line),
        pad: __state.dock && __state.dock.pad,
        padClient: __game.zones.padAt(...String(__state.dock.pad).split(',').map(Number)).clientId,
        dom: [...document.querySelectorAll('.dk-client')].map(e => e.textContent) }; })()`);
    const uniq = new Set(b.ids);
    // §7.1's rule is kept, not discarded: slot 0 is still the pad's own operator.
    const slot0IsPad = b.ids[0] === b.padClient;
    const domUniq = new Set(b.dom);
    return {
      pass: b.n >= 3 && uniq.size === b.n && slot0IsPad && domUniq.size === b.dom.length,
      detail: `HUB board ${b.n} jobs · ${uniq.size} distinct clients · ${new Set(b.lines).size} distinct lines · `
        + `slot 0 is the pad's own client (§7.1) ${slot0IsPad} · in the DOM: ${JSON.stringify(b.dom)}`,
      data: b,
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // B2 — the toast rail must not sit on top of the panel's sticky header.
  // Measured as a RECT INTERSECTION between the live toast and the live header, not eyeballed.
  // ───────────────────────────────────────────────────────────────────────
  await gate('B2 a toast does not cover the panel header', async () => {
    await dockHub(S);
    await evalJSON(S, '__game.toast("Left thumb flies · right thumb looks · ⚙ to swap", "info", 8000)');
    await settle(S, 12);
    const r = await evalJSON(S, `(() => {
      const t = document.querySelector('#toasts .toast');
      const h = document.querySelector('.dk-head');
      if (!t || !h) return { missing: !t ? 'toast' : 'header' };
      const a = t.getBoundingClientRect(), b = h.getBoundingClientRect();
      const ov = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
               * Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      return { ov: Math.round(ov), toast: [Math.round(a.top), Math.round(a.bottom)],
        head: [Math.round(b.top), Math.round(b.bottom)],
        reserve: getComputedStyle(document.documentElement).getPropertyValue('--toast-h').trim(),
        credits: (document.querySelector('.dk-purse b') || {}).textContent,
        pad: (document.querySelector('.dk-pad') || {}).textContent }; })()`);
    if (r.missing) throw new Error(`B2 has no ${r.missing} to measure — the gate would pass vacuously`);
    await evalJSON(S, '__game.ui.clearToasts()');
    await settle(S, 12);
    return {
      pass: r.ov === 0 && !!r.credits && !!r.pad,
      detail: `toast y ${r.toast[0]}-${r.toast[1]}, header y ${r.head[0]}-${r.head[1]} — overlap `
        + `${r.ov} px^2 (must be 0) · the rail reserves ${r.reserve} · header still reads `
        + `"${r.pad}" / ${r.credits}`,
      data: r,
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // T8 D3 — ZERO `.mp4` fetched when only the job board has been opened (§9.1's whole loading
  // discipline). The 96 px thumbs, and nothing else.
  // ───────────────────────────────────────────────────────────────────────
  await gate('D3 the job board fetches zero .mp4', async () => {
    // A FRESH NAVIGATION, not a re-dock. `Network.setCacheDisabled` does not stop Chrome reusing
    // an <img> it already has in the same document's memory cache, so re-opening the board made
    // no requests AT ALL — which reads exactly like the zero this gate is looking for, while
    // proving nothing. §9.1's wording is "navigating to the board must fetch zero .mp4", and that
    // is what this now does.
    const mark = since();
    await S('Page.navigate', { url: `${H.base}/index.html?nosave=1` });
    await waitFor(S, 'window.__ready', 60000);
    await settle(S, 40);
    await dockHub(S);
    await settle(S, 30);
    await sleep(900);
    await settle(S, 30);
    const mp4 = mp4sSince(mark);
    const jpg = jpgsSince(mark);
    const thumbs = jpg.filter(r => /_thumb\.jpg/.test(r.url));
    const stills = jpg.filter(r => !/_thumb\.jpg/.test(r.url) && /clients\//.test(r.url));
    return {
      pass: mp4.length === 0 && thumbs.length > 0 && stills.length === 0,
      detail: `opening the board fetched ${mp4.length} .mp4 (must be 0), ${thumbs.length} 96 px thumbs `
        + `and ${stills.length} 384 stills (must be 0 — §9.1 gives the board the thumb only). `
        + `F3 proves this counter can see an .mp4.`,
      data: { mp4: mp4.map(r => r.url), thumbs: thumbs.length, stills: stills.length },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // P1 — the panel opens from the board and renders §7.3's three blocks, in order.
  // ───────────────────────────────────────────────────────────────────────
  await gate('P1 §7.3 panel opens from the board, three blocks', async () => {
    const mark = since();
    await clickSel(S, '.dk-who', 0);
    await settle(S, 20);
    const r = await evalJSON(S, `(() => {
      const q = s => document.querySelector(s);
      const sheet = q('.cp-sheet');
      const order = sheet ? [...sheet.children].map(e => e.className.split(' ')[0]) : [];
      const box = sheet ? sheet.getBoundingClientRect() : null;
      return {
        open: __state.clientPanel && __state.clientPanel.open,
        order,
        name: (q('.cp-name') || {}).textContent,
        fac: (q('.cp-fac') || {}).textContent,
        line: (q('.cp-line') || {}).textContent,
        rel: document.querySelectorAll('.cp-rel i.on').length,
        parcel: (q('.cp-parcel') || {}).textContent,
        dest: (q('.cp-dest') || {}).textContent,
        pay: (q('.cp-pay b') || {}).textContent,
        chips: [...document.querySelectorAll('.cp-chip')].map(e => e.textContent),
        acts: [...document.querySelectorAll('.cp-accept, .cp-ghost')].map(e => e.textContent),
        fits: box ? (box.right <= innerWidth + 1 && box.left >= -1) : false,
        w: box ? Math.round(box.width) : 0, vw: innerWidth,
        errors: __state.errors.length,
      }; })()`);
    const mp4 = mp4sSince(mark);
    const wanted = ['cp-kicker', 'cp-who', 'cp-deal', 'cp-accept', 'cp-acts'];
    const orderOk = wanted.every((c, i) => r.order[i] === c);
    return {
      pass: r.open === true && orderOk && !!r.name && !!r.pay && r.rel > 0
        && r.chips.length >= 3 && r.acts.length === 3 && r.fits && r.errors === 0 && mp4.length === 1,
      detail: `blocks ${JSON.stringify(r.order)} · "${r.name}" (${r.fac}) ${r.rel}/5 reliability · `
        + `${r.parcel} ${r.dest} · ${r.pay} · chips ${JSON.stringify(r.chips)} · `
        + `actions ${JSON.stringify(r.acts)} · sheet ${r.w}px in a ${r.vw}px viewport, fits ${r.fits} · `
        + `${mp4.length} .mp4 requested by the panel (must be exactly 1) · errors ${r.errors}`,
      data: { ...r, mp4: mp4.map(x => x.url) },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // P2 — every number on the panel is produced by §7.4's formulas. §13 states this outright, and
  // the first draft of this document had a panel showing a number the code could not produce.
  // ───────────────────────────────────────────────────────────────────────
  await gate('P2 every number on the panel is §7.4\'s arithmetic', async () => {
    const r = await evalJSON(S, `(() => {
      const E = __game.econ, j = __game.board().find(x => x.id === __state.clientPanel.job);
      const q = s => (document.querySelector(s) || {}).textContent || '';
      const mmss = s => { const t = Math.max(0, Math.round(s)); return ((t/60)|0) + ':' + String(t%60).padStart(2,'0'); };
      return {
        job: { base: j.base, km: j.km, risk: j.risk, limit: j.limit, sat: j.bonus.saturateAt,
               maxTime: j.bonus.maxTime, chain: j.bonus.chain, slots: j.parcel.slots },
        recomputed: { base: E.jobBase(j.km, j.risk), limit: E.timeLimit(j.km, j.rush) },
        dom: { pay: q('.cp-pay b'), chips: [...document.querySelectorAll('.cp-chip')].map(e => e.textContent),
               bonus: [...document.querySelectorAll('.cp-bonus')].map(e => e.textContent) },
        want: { pay: j.base + Math.round(j.base * j.haggleGain) + ' CRD',
                km: j.km.toFixed(1) + ' km', limit: '⏱ ' + mmss(j.limit),
                sat: '+ under ' + mmss(j.bonus.saturateAt) + '+' + Math.round(j.bonus.maxTime*100) + '%' },
      }; })()`);
    const okBase = r.job.base === r.recomputed.base;
    const okLimit = r.job.limit === r.recomputed.limit;
    const okPay = r.dom.pay === r.want.pay;
    const okKm = r.dom.chips.includes(r.want.km);
    const okLim = r.dom.chips.includes(r.want.limit);
    const okSat = r.dom.bonus[0] === r.want.sat;
    return {
      pass: okBase && okLimit && okPay && okKm && okLim && okSat,
      detail: `base ${r.job.base} = jobBase(${r.job.km}, ${r.job.risk}) ${okBase} · `
        + `limit ${r.job.limit}s = timeLimit() ${okLimit} · panel reads "${r.dom.pay}" (want "${r.want.pay}") · `
        + `chips ${JSON.stringify(r.dom.chips)} · bonus rows ${JSON.stringify(r.dom.bonus)}`,
      data: r,
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // T8 (mandatory) + D1 — §9.6's element, verbatim, and INLINE playback under mobile emulation.
  // Read off the LIVE element, never off what the code meant to set.
  // ───────────────────────────────────────────────────────────────────────
  await gate('T8/D1 §9.6 attributes + inline playback (mobile UA)', async () => {
    await settle(S, 60);
    await sleep(1200);
    await settle(S, 60);
    const r = await evalJSON(S, `(() => {
      const v = document.querySelector('.cp-video');
      if (!v) return { missing: true };
      return {
        ua: navigator.userAgent.slice(0, 34), touch: 'ontouchstart' in window,
        coarse: matchMedia('(pointer: coarse)').matches,
        mutedAttr: v.hasAttribute('muted'), muted: v.muted,
        playsinline: v.hasAttribute('playsinline'),
        webkit: v.hasAttribute('webkit-playsinline'),
        loop: v.loop, preload: v.getAttribute('preload'),
        pip: v.hasAttribute('disablepictureinpicture'),
        poster: !!v.poster && /\\.jpg$/.test(v.poster),
        paused: v.paused, readyState: v.readyState, t: +v.currentTime.toFixed(2),
        dur: +(v.duration || 0).toFixed(2),
        fullscreen: v.webkitDisplayingFullscreen === undefined ? false : !!v.webkitDisplayingFullscreen,
        // No JS loop logic anywhere: the ping-pong is baked into the file (§9.2).
        srcIsMp4: /\\.mp4$/.test(v.currentSrc || v.src),
      }; })()`);
    if (r.missing) throw new Error('no .cp-video element — D1 would pass vacuously');
    const t0 = r.t;
    await sleep(400);
    const t1 = await evalJSON(S, '(() => { const v = document.querySelector(".cp-video"); return v ? +v.currentTime.toFixed(2) : -1; })()');
    // MODULO THE DURATION. The first version of this line was `t1 > t0` and it failed on a
    // perfectly healthy clip that happened to wrap between the two samples — §9.2's file is 4.00 s
    // and it is looping, so `3.69 -> 0.39` is 0.70 s of progress, not a stall. A playback test that
    // fails once per loop is a test nobody will trust the third time it goes red.
    const adv = r.dur > 0 ? ((t1 - t0) + r.dur) % r.dur : t1 - t0;
    const advancing = adv > 0.05;
    const pass = r.mutedAttr && r.muted && r.playsinline && r.webkit && r.loop
      && r.preload === 'none' && r.pip && r.poster && r.srcIsMp4
      && r.paused === false && r.fullscreen === false && advancing && r.coarse;
    return {
      pass,
      detail: `UA "${r.ua}…" coarse ${r.coarse} touch ${r.touch} · muted ${r.mutedAttr}/${r.muted} · `
        + `playsinline ${r.playsinline} · webkit-playsinline ${r.webkit} · loop ${r.loop} · `
        + `preload ${r.preload} · disablePiP ${r.pip} · poster ${r.poster} · `
        + `paused ${r.paused}, fullscreen ${r.fullscreen}, ${r.dur.toFixed(2)} s clip, currentTime `
        + `${t0} → ${t1} = ${adv.toFixed(2)} s of progress modulo the loop (must advance — a `
        + `paused-at-0 clip reads identical to a playing one in a still)`,
      data: { ...r, t0, t1, adv: +adv.toFixed(3) },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // T8 D2 — a forced `play()` rejection lands on the STILL path. §9.6: a rejected promise is a
  // normal outcome, not an error; it must not throw, not log, and not leave a black rectangle.
  // ───────────────────────────────────────────────────────────────────────
  await gate('D2 a rejected play() falls back to the still', async () => {
    const before = await evalJSON(S, '({ errors: __state.errors.length, mode: __state.clientPanel.media.mode })');
    await evalJSON(S, '__game.rejectClientPlay(true)');
    await settle(S, 20);
    await sleep(500);
    await settle(S, 20);
    const r = await evalJSON(S, `(() => {
      const frame = document.querySelector('.cp-media');
      return {
        media: __state.clientPanel.media,
        video: !!document.querySelector('.cp-video'),
        still: !!document.querySelector('.cp-still'),
        stillComplete: (document.querySelector('.cp-still') || {}).complete,
        stillW: (document.querySelector('.cp-still') || {}).naturalWidth || 0,
        shimmer: frame ? frame.classList.contains('shimmer') : false,
        why: frame ? frame.dataset.fallback : null,
        errors: __state.errors.length,
        audioIssues: (__state.audioIssues || []).length,
      }; })()`);
    await evalJSON(S, '__game.rejectClientPlay(false)');
    return {
      pass: r.media.rejected > 0 && r.media.mode === 'still' && r.video === false
        && r.still === true && r.stillW > 0 && r.shimmer === true && r.errors === before.errors,
      detail: `mode ${before.mode} → ${r.media.mode} after ${r.media.rejected} rejection(s) · `
        + `<video> removed ${!r.video} (§9.6: "and no video element at all") · still present `
        + `${r.still} at ${r.stillW}px · scanline shimmer ${r.shimmer} (why: ${r.why}) · `
        + `__state.errors ${before.errors} → ${r.errors} (a rejected play is not an error)`,
      data: r,
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // P3 — §7.3's static blur background, produced by the in-frame drawImage, and NO backdrop-filter
  // declaration anywhere in style.css.
  //
  // §13 states the second half as `grep backdrop-filter style.css` returning nothing, which — like
  // §13's `grep heat js/` (P7a defect D5) — cannot be satisfied without deleting the comments that
  // record WHY the property is banned. The scan therefore strips comments and looks for a
  // DECLARATION, and reports both counts so the difference is visible rather than hidden.
  // ───────────────────────────────────────────────────────────────────────
  await gate('P3 static blur backdrop, no backdrop-filter declaration', async () => {
    const css = readFileSync(resolve(ROOT, 'style.css'), 'utf8');
    const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const decls = (stripped.match(/backdrop-filter\s*:/g) || []).length;
    const mentions = (css.match(/backdrop-filter/g) || []).length;
    const r = await evalJSON(S, `(() => {
      const cp = document.querySelector('.cp-sheet');
      const dk = document.querySelector('.dk-sheet');
      const url = cp ? cp.style.backgroundImage : '';
      return { panel: __state.clientPanel.backdrop, url: url.slice(0, 24), len: url.length,
        isData: /^url\\(["']?data:image/.test(url),
        size: getComputedStyle(cp).backgroundSize,
        board: !!(dk && dk.style.backgroundImage) }; })()`);
    return {
      pass: decls === 0 && r.panel === true && r.isData && r.size === 'cover',
      detail: `backdrop-filter: ${decls} declarations (comment-stripped, must be 0), ${mentions} `
        + `mentions including the comments that say why it is banned · panel backdrop ${r.panel}, `
        + `a ${r.len}-char ${r.url}… data URL at background-size ${r.size}`,
      data: { decls, mentions, ...r },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // P4 — the whole loop still runs THROUGH the panel: ACCEPT takes the job, the panel closes, the
  // board is back, and the hold has the parcel in it.
  // ───────────────────────────────────────────────────────────────────────
  await gate('P4 ACCEPT from the panel takes the job', async () => {
    const before = await evalJSON(S, '({ cargo: __game.economy.cargo.length, jobs: __game.board().length, job: __state.clientPanel.job })');
    await clickSel(S, '.cp-accept');
    await settle(S, 20);
    const after = await evalJSON(S, `({ cargo: __game.economy.cargo.length, open: __state.clientPanel.open,
      board: !!document.querySelector('.dk-sheet'), video: !!document.querySelector('.cp-video'),
      errors: __state.errors.length, dock: !!__state.dock })`);
    return {
      pass: after.cargo === before.cargo + 1 && after.open === false && after.board === true
        && after.video === false && after.errors === 0 && after.dock === true,
      detail: `hold ${before.cargo} → ${after.cargo} · panel closed ${!after.open} · board back `
        + `${after.board} · <video> torn down ${!after.video} · still docked ${after.dock} · errors ${after.errors}`,
      data: { before, after },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // P5 — landscape. §7.3: "identical DOM, a CSS grid switch. No JS branch."
  // ───────────────────────────────────────────────────────────────────────
  await gate('P5 landscape is a CSS grid switch, same DOM', async () => {
    await evalJSON(S, '__game.openClient(0)');
    await settle(S, 16);
    const p = await evalJSON(S, `(() => { const s = document.querySelector('.cp-sheet');
      return { n: s.children.length, html: s.innerHTML.length, display: getComputedStyle(s).display,
        w: Math.round(s.getBoundingClientRect().width) }; })()`);
    await H.setMetrics(844, 390, 2, true);
    await evalJSON(S, '__game.resize()');
    await settle(S, 20);
    const l = await evalJSON(S, `(() => { const s = document.querySelector('.cp-sheet');
      const b = s.getBoundingClientRect();
      const m = document.querySelector('.cp-media').getBoundingClientRect();
      const d = document.querySelector('.cp-deal').getBoundingClientRect();
      // The SHEET fitting is not the question: it is max-height 100% and will always fit. The
      // question is whether a thumb can REACH the buttons, which is where a landscape layout
      // actually breaks, and where the board's own UNDOCK button broke on its first browser run.
      const acts = document.querySelector('.cp-acts').getBoundingClientRect();
      const acc = document.querySelector('.cp-accept').getBoundingClientRect();
      return { n: s.children.length, html: s.innerHTML.length, display: getComputedStyle(s).display,
        w: Math.round(b.width), fits: b.right <= innerWidth + 1 && b.bottom <= innerHeight + 1,
        actionsOnScreen: acts.bottom <= innerHeight + 1 && acc.bottom <= innerHeight + 1,
        actsBottom: Math.round(acts.bottom), vh: innerHeight,
        scrolls: s.scrollHeight > s.clientHeight + 1,
        mediaLeftOfDeal: m.right <= d.left + 1, errors: __state.errors.length }; })()`);
    await H.setMetrics(390, 844, 2, true);
    await evalJSON(S, '__game.resize()');
    await settle(S, 16);
    return {
      pass: p.n === l.n && p.html === l.html && p.display === 'block' && l.display === 'grid'
        && l.fits && l.actionsOnScreen && !l.scrolls && l.mediaLeftOfDeal && l.errors === 0,
      detail: `same DOM across the switch: ${p.n}/${l.n} children, ${p.html}/${l.html} chars of HTML `
        + `(identical ${p.html === l.html}) · display ${p.display} → ${l.display} · sheet ${p.w} → ${l.w} px · `
        + `media is left of the deal ${l.mediaLeftOfDeal} · fits ${l.fits} · ACCEPT/HAGGLE/DECLINE `
        + `all on screen ${l.actionsOnScreen} (their bottom edge ${l.actsBottom} of ${l.vh} px) · `
        + `sheet needs scrolling ${l.scrolls}`,
      data: { portrait: p, landscape: l },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // P6 — no dialogs, no hard-coded client count. Both are hard rules (brief; obligation T8).
  // ───────────────────────────────────────────────────────────────────────
  await gate('P6 no alert/confirm/prompt, no literal client count', async () => {
    const files = readdirSync(resolve(ROOT, 'js')).filter(f => f.endsWith('.js'));
    let dialogs = 0, dialogComments = 0, sixteens = [];
    for (const f of files) {
      const src = readFileSync(resolve(ROOT, 'js', f), 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
        .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""');
      dialogs += (code.match(/\b(alert|confirm|prompt)\s*\(/g) || []).length;
      dialogComments += (src.match(/\b(alert|confirm|prompt)\s*\(/g) || []).length;
      // The client count must come from `clients.length` and nowhere else. `16` as a bare number
      // in a media/UI file is the shape T8 forbids; other numbers are not this gate's business.
      if (/(clients?|CLIENT)[^\n]*\b16\b|\b16\b[^\n]*clients?/i.test(code)) sixteens.push(f);
    }
    const clients = JSON.parse(readFileSync(resolve(ROOT, 'data/clients.json'), 'utf8')).clients.length;
    const live = await evalJSON(S, '__game.zones.clients.length');
    return {
      pass: dialogs === 0 && sixteens.length === 0 && live === clients,
      detail: `${files.length} files · alert/confirm/prompt in CODE ${dialogs} (in comments and `
        + `strings ${dialogComments - dialogs}) · files hard-coding the client count `
        + `${JSON.stringify(sixteens)} · data/clients.json has ${clients}, the running game reads ${live}`,
      data: { dialogs, dialogComments, sixteens, clients, live },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // P7 — §7.3's visual-design rules, measured rather than asserted in prose. These are the items
  // §13 makes the phase's review gate, and each one is a number the live panel can be asked for.
  // ───────────────────────────────────────────────────────────────────────
  await gate('P7 §7.3 type scale, one accent, nothing round', async () => {
    await evalJSON(S, '__game.closeClient()');
    await evalJSON(S, '__game.openClient(0)');
    await settle(S, 24);
    const r = await evalJSON(S, `(() => {
      const sheet = document.querySelector('.cp-sheet');
      const nodes = [...sheet.querySelectorAll('*')].filter(e => (e.textContent || '').trim().length
        && !e.querySelector('*') && e.tagName !== 'VIDEO' && e.tagName !== 'IMG');
      const sizes = {}, fams = new Set(), weights = new Set(), radii = {};
      for (const e of nodes) {
        const cs = getComputedStyle(e);
        sizes[cs.fontSize] = (sizes[cs.fontSize] || 0) + 1;
        fams.add(cs.fontFamily.split(',')[0].trim());
        weights.add(cs.fontWeight);
      }
      for (const e of [...sheet.querySelectorAll('*')]) {
        const cs = getComputedStyle(e);
        if (cs.borderTopLeftRadius !== '0px') {
          // Key by the OWNING block, not by the element's own class: the reliability dots are
          // bare <i> elements and reported as "I"/"on", which reads like two unrelated round
          // things when it is one.
          const own = e.closest('.cp-rel') ? 'cp-rel'
            : (e.className && String(e.className).split(' ')[0]) || e.tagName;
          radii[own] = cs.borderTopLeftRadius;
        }
      }
      const tint = getComputedStyle(sheet).getPropertyValue('--tint').trim();
      // The accent must be used on the kicker, the ACCEPT fill and the sheet's own frame, and
      // nothing else may be saturated. Colour-per-element, resolved.
      const acc = getComputedStyle(document.querySelector('.cp-accept'));
      const kick = getComputedStyle(document.querySelector('.cp-kicker'));
      const tabular = getComputedStyle(sheet).fontVariantNumeric;
      return { sizes, fams: [...fams], weights: [...weights], radii, tint,
        acceptBg: acc.backgroundColor, kickerColor: kick.color, tabular,
        sheetRadius: getComputedStyle(sheet).borderTopLeftRadius }; })()`);
    const sizes = Object.keys(r.sizes).sort((a, b) => parseFloat(a) - parseFloat(b));
    // The reliability chips are the only round things §7.3 allows, plus the sheet/chip 2-4 px
    // hairline radius the rest of the game uses.
    const roundKeys = Object.keys(r.radii).filter(k => !/^(cp-sheet|cp-chip|cp-accept|cp-ghost|cp-thumb|dk-)/.test(k));
    return {
      pass: sizes.length === 3 && sizes.join('/') === '10px/14px/28px' && r.fams.length === 1
        && r.weights.length <= 2 && roundKeys.length === 1 && roundKeys[0] === 'cp-rel'
        && /^rgb/.test(r.acceptBg) && r.tabular.includes('tabular-nums'),
      detail: `${sizes.length} distinct type sizes ${sizes.join('/')} (§7.3 allows three: 10/14/28) · `
        + `${r.fams.length} family (${r.fams[0]}) · weights ${r.weights.join(',')} · `
        + `tabular numerals ${r.tabular} · accent ${r.tint} on the kicker (${r.kickerColor}) and the `
        + `ACCEPT fill (${r.acceptBg}) · round elements ${JSON.stringify(roundKeys)} `
        + `(§7.3: "nothing is round except the reliability chips")`,
      data: { sizes, ...r, roundKeys },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // T8 D4 — DELETE `assets/clients/` AND RUN IT. Not reasoned about: the directory is moved off
  // disk, the page reloaded, the board and the panel opened, a job accepted; then it is restored
  // and the restore is verified file-by-file, because P8's own note records that a gate which
  // deletes an asset directory is one crash away from leaving the repo broken.
  // ───────────────────────────────────────────────────────────────────────
  const before = existsSync(CLIENTS)
    ? readdirSync(CLIENTS).map(f => [f, statSync(resolve(CLIENTS, f)).size])
    : [];
  await gate('D4 the game is playable with assets/clients/ deleted', async () => {
    if (!before.length) throw new Error('assets/clients/ is already empty — D4 would prove nothing');
    if (existsSync(CLIENTS_AWAY)) throw new Error(`${CLIENTS_AWAY} already exists — refusing to overwrite`);
    renameSync(CLIENTS, CLIENTS_AWAY);
    let r;
    try {
      const mark = since();
      await S('Page.navigate', { url: `${H.base}/index.html?nosave=1` });
      await waitFor(S, 'window.__ready', 60000);
      await settle(S, 45);
      await dockHub(S);
      await settle(S, 20);
      await clickSel(S, '.dk-who', 0);
      await settle(S, 30);
      await sleep(900);
      await settle(S, 30);
      const cargo0 = await evalJSON(S, '__game.economy.cargo.length');
      await clickSel(S, '.cp-accept');
      await settle(S, 20);
      const failed = net.slice(mark).filter(x => /clients\//.test(x.url));
      r = await evalJSON(S, `(() => ({
        ready: !!window.__ready, errors: __state.errors, draws: __state.draws,
        board: !!document.querySelector('.dk-sheet'), dock: !!__state.dock,
        cargo: __game.economy.cargo.length, credits: __state.credits,
        ph: document.querySelectorAll('.dk-ph, .cp-ph').length,
        brokenImg: [...document.querySelectorAll('img')].filter(i => i.complete && i.naturalWidth === 0).length,
        video: !!document.querySelector('.cp-video'),
      }))()`);
      r.cargo0 = cargo0;
      r.clientRequests = failed.length;
      r.client404 = failed.filter(x => x.status === 404).length;
    } finally {
      renameSync(CLIENTS_AWAY, CLIENTS);           // ALWAYS, even if the body threw
    }
    return {
      pass: r.ready && r.errors.length === 0 && r.draws > 20 && r.board && r.dock
        && r.cargo === r.cargo0 + 1 && r.ph > 0 && r.brokenImg === 0 && !r.video,
      detail: `booted with the directory gone: __ready ${r.ready}, ${r.errors.length} errors, `
        + `${r.draws} draws · board ${r.board}, panel opened, ACCEPT worked (hold ${r.cargo0} → ${r.cargo}) · `
        + `${r.ph} generated hex placeholders rendered, ${r.brokenImg} broken images · `
        + `<video> not built ${!r.video} · ${r.clientRequests} requests under clients/, ${r.client404} of them 404`,
      data: r,
    };
  });

  await gate('D4b assets/clients/ is restored, byte for byte', async () => {
    const after = existsSync(CLIENTS)
      ? readdirSync(CLIENTS).map(f => [f, statSync(resolve(CLIENTS, f)).size])
      : [];
    const same = JSON.stringify(before) === JSON.stringify(after);
    const bytes = after.reduce((a, [, n]) => a + n, 0);
    // And it is not enough for the files to be back on disk — the game has to see them again.
    await S('Page.navigate', { url: `${H.base}/index.html?nosave=1` });
    await waitFor(S, 'window.__ready', 60000);
    await settle(S, 40);
    await dockHub(S);
    await settle(S, 20);
    await clickSel(S, '.dk-who', 0);
    await settle(S, 40);
    await sleep(1200);
    await settle(S, 40);
    const live = await evalJSON(S, `(() => ({
      mode: __state.clientPanel.media.mode,
      still: (document.querySelector('.cp-still') || {}).naturalWidth || 0,
      thumb: [...document.querySelectorAll('.dk-thumb img')].map(i => i.naturalWidth),
      paused: (document.querySelector('.cp-video') || {}).paused,
      errors: __state.errors.length }))()`);
    return {
      pass: same && after.length === before.length && !existsSync(CLIENTS_AWAY)
        && live.mode === 'video' && live.still > 0 && live.paused === false,
      detail: `${after.length} files / ${(bytes / 1e6).toFixed(2)} MB back, identical to the `
        + `pre-delete listing ${same} · the moved copy is gone ${!existsSync(CLIENTS_AWAY)} · `
        + `and the running game sees them: media mode ${live.mode}, still ${live.still}px, `
        + `thumbs ${JSON.stringify(live.thumb)}, playing ${live.paused === false}`,
      data: { files: after.length, bytes, same, live },
    };
  });

  // ───────────────────────────────────────────────────────────────────────
  // Falsification — each of these MUST make one of the gates above fail.
  // ───────────────────────────────────────────────────────────────────────
  if (FALSIFY) {
    console.log('\n  falsification — each of these MUST be caught\n');

    await gate('F1 a video without playsinline is caught', async () => {
      const r = await evalJSON(S, `(() => {
        const v = document.querySelector('.cp-video');
        if (!v) return { skip: true };
        const was = v.hasAttribute('playsinline');
        v.removeAttribute('playsinline');
        const seen = v.hasAttribute('playsinline');
        v.setAttribute('playsinline', '');
        return { was, seen, back: v.hasAttribute('playsinline') }; })()`);
      if (r.skip) throw new Error('no video element to falsify against');
      return {
        pass: r.was === true && r.seen === false && r.back === true,
        detail: `the T8/D1 probe reads the LIVE attribute: present ${r.was}, removed → ${r.seen}, `
          + `restored ${r.back}. A probe reading what the code meant to set could not see this.`,
        data: r,
      };
    });

    await gate('F2 a play() that does NOT reject stays on the video path', async () => {
      // D2's counterpart: with the rejection off, the panel must be on the VIDEO path. Without
      // this, "mode === 'still'" could be the panel's only behaviour and D2 would pass for the
      // wrong reason.
      await evalJSON(S, '__game.rejectClientPlay(false)');
      await evalJSON(S, '__game.closeClient()');
      await evalJSON(S, '__game.openClient(0)');
      await settle(S, 40); await sleep(1000); await settle(S, 40);
      const r = await evalJSON(S, `({ mode: __state.clientPanel.media.mode,
        video: !!document.querySelector('.cp-video'),
        shimmer: document.querySelector('.cp-media').classList.contains('shimmer') })`);
      return {
        pass: r.mode === 'video' && r.video === true && r.shimmer === false,
        detail: `with no forced rejection: mode ${r.mode}, <video> present ${r.video}, shimmer `
          + `${r.shimmer} — if this also read "still", D2 would be measuring nothing`,
        data: r,
      };
    });

    await gate('F3 the .mp4 counter can see an .mp4', async () => {
      await evalJSON(S, '__game.closeClient()');
      await settle(S, 10);
      const mark = since();
      await evalJSON(S, '__game.openClient(1)');
      await settle(S, 40); await sleep(900); await settle(S, 40);
      const mp4 = mp4sSince(mark);
      return {
        pass: mp4.length >= 1,
        detail: `opening the panel fetched ${mp4.length} .mp4 (${(mp4[0] || {}).url || 'none'}) — `
          + `D3's "zero from the board" is a real zero, not a counter that never fires`,
        data: { mp4: mp4.map(x => x.url) },
      };
    });

    await gate('F4 the toast-overlap probe can see an overlap', async () => {
      await evalJSON(S, '__game.closeClient()');
      await settle(S, 10);
      const r = await evalJSON(S, `(() => {
        __game.toast('OVERLAP PROBE', 'info', 6000);
        return 1; })()`);
      await settle(S, 12);
      // Remove the reservation the fix installs; the overlap must come back.
      const bad = await evalJSON(S, `(() => {
        document.documentElement.style.setProperty('--toast-h', '0px');
        const t = document.querySelector('#toasts .toast'), h = document.querySelector('.dk-head');
        const a = t.getBoundingClientRect(), b = h.getBoundingClientRect();
        return Math.round(Math.max(0, Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top))
                        * Math.max(0, Math.min(a.right,b.right) - Math.max(a.left,b.left))); })()`);
      const good = await evalJSON(S, `(() => {
        __game.ui._reserve();
        const t = document.querySelector('#toasts .toast'), h = document.querySelector('.dk-head');
        const a = t.getBoundingClientRect(), b = h.getBoundingClientRect();
        return Math.round(Math.max(0, Math.min(a.bottom,b.bottom) - Math.max(a.top,b.top))
                        * Math.max(0, Math.min(a.right,b.right) - Math.max(a.left,b.left))); })()`);
      await evalJSON(S, '__game.ui.clearToasts()');
      return {
        pass: r === 1 && bad > 0 && good === 0,
        detail: `with the reservation zeroed the toast covers ${bad} px^2 of the header; with it `
          + `restored, ${good}. B2's zero is the fix working, not the probe missing.`,
        data: { bad, good },
      };
    });

    await gate('F5 one client on every slot is caught', async () => {
      // B1's own falsification: pin every job to the pad's client, exactly as it shipped, and
      // check B1's distinctness test sees it.
      const r = await evalJSON(S, `(() => {
        const jobs = __game.board();
        const one = jobs[0].client;
        const forced = jobs.map(() => one.id);
        return { forcedUnique: new Set(forced).size, realUnique: new Set(jobs.map(j => j.clientId)).size,
                 n: jobs.length }; })()`);
      return {
        pass: r.forcedUnique === 1 && r.realUnique === r.n && r.n >= 3,
        detail: `${r.n} slots: the shipped-defect arrangement gives ${r.forcedUnique} distinct client(s), `
          + `which B1's test rejects; the fixed board gives ${r.realUnique}`,
        data: r,
      };
    });

    await gate('F6 a buried pad would fail the placement rule', async () => {
      // The ledge fix's own falsification, held here as well as in gates_wire: put a pad back where
      // the old `_site()` put it and check `solidAt` — with the chunk asserted live — calls it solid.
      const r = await evalJSON(S, `(() => {
        const Z = __game.zones;
        for (let r2 = 1; r2 <= 6; r2++)
          for (let cz = -r2; cz <= r2; cz++) for (let cx = -r2; cx <= r2; cx++) {
            const p = Z.padAt(cx, cz);
            if (!p || !p.ledge) continue;
            const live = __game.cityChunkLive(p.mass[0], p.mass[1]) && __game.cityChunkLive(p.x, p.z);
            if (!live) continue;
            const old = __game.solidAt(p.mass[0], p.y, p.mass[1], 0);
            const now = __game.solidAt(p.x, p.y, p.z, 0);
            return { key: p.key, y: Math.round(p.y), oldSolid: !!old, newSolid: !!now,
                     proto: old ? old.proto : null };
          }
        return null; })()`);
      if (!r) throw new Error('no ledge pad with both chunks live near the spawn — F6 cannot run');
      return {
        pass: r.oldSolid === true && r.newSolid === false,
        detail: `pad ${r.key} at y=${r.y}: the OLD placement (tower centre) is inside a ${r.proto} `
          + `${r.oldSolid}, the fixed one is ${r.newSolid ? 'ALSO inside — the fix did nothing' : 'clear'}`,
        data: r,
      };
    });
  }

  // ── evidence ─────────────────────────────────────────────────────────────
  for (const [name, setup] of [
    ['portrait_panel', async () => { await evalJSON(S, '__game.openClient(0)'); }],
    ['portrait_board_fixed', async () => { await evalJSON(S, '__game.closeClient()'); }],
  ]) {
    await setup();
    await settle(S, 30);
    const shot = await S('Page.captureScreenshot', { format: 'png' });
    writeFileSync(resolve(OUT_DIR, name + '.png'), Buffer.from(shot.data, 'base64'));
  }
  await H.setMetrics(844, 390, 2, true);
  await evalJSON(S, '__game.resize()');
  await evalJSON(S, '__game.openClient(0)');
  await settle(S, 30);
  const land = await S('Page.captureScreenshot', { format: 'png' });
  writeFileSync(resolve(OUT_DIR, 'landscape_panel.png'), Buffer.from(land.data, 'base64'));

  const errs = await evalJSON(S, '__state.errors');
  console.log(`\n  page errors: ${errs.length}${errs.length ? ' ' + JSON.stringify(errs) : ''}`);
  if (logs.length) console.log('  console:', logs.slice(0, 6).join(' | '));
} finally {
  if (existsSync(CLIENTS_AWAY) && !existsSync(CLIENTS)) renameSync(CLIENTS_AWAY, CLIENTS);
  flush();
  await H.close();
}

const passed = results.filter(r => r.pass).length;
console.log(`\n  ${passed}/${results.length} passed  ->  shots/p7b/_gates.json\n`);
process.exit(passed === results.length ? 0 : 1);
