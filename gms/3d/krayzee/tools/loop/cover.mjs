// MSGFIX screen-cover sampler: how much of the flight view is under message UI, sampled ~2×/s (real time) in the page.
// view = the viewport minus the fixed control/HUD zones (CONTROLS); covered = inside a visible message element (MESSAGES).
// Used by tools/test-loop.mjs (every case) and tools/story/test-mission.mjs --cover. Docs: docs/TESTING.md "Screen cover".
import { join } from 'node:path';

export const MESSAGES = {
  radio: ['.krz-r-pill'],                       // transcript cards
  chips: ['.krz-r-panel'],                      // bark/response sheet
  log: ['.krz-r-drawer'],
  prompt: ['.krz-prompt'],
  banner: ['#krz-hud .krz-banner'],
  herald: ['.krz-reel', '.krz-paper-toast'],
  score: ['.krz-pop', '.krz-cer'],
  coach: ['.krz-coach-bub', '.krz-st-coach', '.krz-hint-bub'],
  story: ['.krz-st-brief .krz-st-card', '.krz-st-done .krz-st-card'],
  toast: ['.kz-toast', '.krz-plane-why'],
  tasks: ['.kz-tk-toast', '.kz-tk-cele .kz-tk-cc'],   // TASKS tick toast + set celebration (D34)
  test: ['[data-cover-test]'],                  // falsification layer
};
export const CONTROLS = ['.krz-stick-zone', '.krz-thr-col', '.krz-pad', '.krz-r-btn', '.krz-land', '.krz-finish', '.krz-gbtn', '.krz-top-l', '.krz-top-r',
  '.krz-warp', '.krz-r-tower', '#krz-hud .krz-hud-strip', '.krz-score', '.krz-chips'];

// page side: installs window.__cover (samples every 500 ms real until stop()); re-install after a navigation
export const COVER_INSTALL = `(() => {
  if (window.__cover) window.__cover.stop();
  const MSG = ${JSON.stringify(MESSAGES)}, CTL = ${JSON.stringify(CONTROLS)}, STEP = 10;
  const vis = (e) => { if (e.hidden || e.closest('[hidden]')) return 0; let n = e, op = 1;
    while (n && n.nodeType === 1) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return 0; op *= +cs.opacity; n = n.parentElement; }
    return op; };
  const rectsOf = (sels, minOp) => { const out = []; for (const s of sels) for (const e of document.querySelectorAll(s)) { if (vis(e) < minOp) continue; const b = e.getBoundingClientRect(); if (b.width >= 2 && b.height >= 2) out.push(b); } return out; };
  const inR = (r, x, y) => x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  const C = { samples: [], t0: performance.now(), timer: 0 };
  C.sample = () => {
    const W = innerWidth, H = innerHeight, ctl = rectsOf(CTL, 0.05), cats = {};
    let nEl = 0;
    for (const k in MSG) { const r = rectsOf(MSG[k], 0.15); if (r.length) { cats[k] = r; nEl += r.length; } }
    let view = 0, cov = 0; const by = {};
    for (let y = STEP / 2; y < H; y += STEP) for (let x = STEP / 2; x < W; x += STEP) {
      if (ctl.some((r) => inR(r, x, y))) continue;
      view++;
      let hit = false;
      for (const k in cats) if (cats[k].some((r) => inR(r, x, y))) { by[k] = (by[k] || 0) + 1; hit = true; }
      if (hit) cov++;
    }
    let g = null; try { g = window.__game?.state?.(); } catch (e) { /* */ }
    const p = g?.player;
    const s = { t: +((performance.now() - C.t0) / 1000).toFixed(2), sim: window.__game?.traffic ? +window.__game.traffic.time.toFixed(1) : null,
      play: g?.mode === 'play' && !!p, air: !!p && !p.onGround, paused: !!g?.paused, agl: p ? Math.round(p.agl) : null,
      c: view ? +(cov / view).toFixed(4) : 0, n: nEl, by: {} };
    for (const k in by) s.by[k] = +(by[k] / view).toFixed(4);
    C.samples.push(s);
    if (C.samples.length > 20000) C.samples.shift();
    return s;
  };
  C.stop = () => clearInterval(C.timer);
  C.timer = setInterval(() => { try { C.sample(); } catch (e) { /* */ } }, 500);
  window.__cover = C;
  return 1;
})()`;

// a big message-looking layer for falsification: a radio card pinned over the middle of the screen
export const COVER_FALSIFY = `(() => { const d = document.createElement('div'); d.dataset.coverTest = '1'; d.className = 'krz-r-pill';
  d.style.cssText = 'position:fixed;left:10%;right:10%;top:30%;height:40%;z-index:25;background:rgba(14,18,28,.5);color:#fff;pointer-events:none;opacity:1;transform:none';
  d.textContent = 'MSGFIX falsify: a giant radio card'; document.body.append(d); return 1; })()`;

const pct = (v) => Math.round(v * 1000) / 10;
// summary over samples (filter: 'air' = airborne in play with no modal story card (briefing / mission complete: the world
// waits behind those), 'play' = any sample in play)
export function summarize(samples, filter = 'air') {
  const S = samples.filter((s) => s.play && !s.paused && (filter !== 'air' || (s.air && !s.by?.story)));
  if (!S.length) return { n: 0 };
  const cs = S.map((s) => s.c).sort((a, b) => a - b);
  const mean = cs.reduce((a, b) => a + b, 0) / cs.length;
  const p90 = cs[Math.min(cs.length - 1, Math.floor(cs.length * 0.9))];
  // longest continuous stretch > 25 % (real seconds; a gap > 1.5 s between samples breaks the run)
  let best = 0, bestAt = null, runStart = null, prev = null;
  for (const s of S) {
    const contiguous = prev && s.t - prev.t <= 1.5;
    if (s.c > 0.25) { if (runStart == null || !contiguous) runStart = s.t; const len = s.t - runStart + 0.5; if (len > best) { best = len; bestAt = runStart; } }
    else runStart = null;
    prev = s;
  }
  const byCat = {};
  for (const s of S) for (const k in s.by) byCat[k] = (byCat[k] || 0) + s.by[k];
  for (const k in byCat) byCat[k] = pct(byCat[k] / S.length);
  const over25 = S.filter((s) => s.c > 0.25).length / S.length;
  return { n: S.length, mean: pct(mean), p90: pct(p90), max: pct(cs[cs.length - 1]), over25: pct(over25), longest25: Math.round(best * 10) / 10, longestAt: bestAt, maxEls: Math.max(...S.map((s) => s.n)), byCat };
}
export const fmtCover = (r) => (r.n ? `mean ${r.mean}% · p90 ${r.p90}% · max ${r.max}% · >25% ${r.over25}% of samples · longest >25% ${r.longest25}s · max ${r.maxEls} els · ${Object.entries(r.byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' ')}` : 'no samples');

// node side: read the page's samples (and clear them, so a re-install after a navigation does not lose them)
export async function coverTake(ev) {
  return (await ev('(() => { const c = window.__cover; if (!c) return []; const s = c.samples; c.samples = []; return s; })()')) || [];
}

// node side: screenshot heavy moments while a run goes (a new peak, or any cover above `min` after 4×gapMs; at most `max`)
// A screenshot taken while a touch is in flight swallows it, and two captures at once can leave headless Chrome's touch
// input at half scale (every later tap lands at x/2, y/2: seen in Mission 1). So the input and screenshot methods named in
// `guard` ([obj, names]) are wrapped: they wait for a cover shot in progress, and no cover shot starts while one of them
// runs, nor for 600 ms after. Include the harness's own screenshot method in `guard`.
export function coverShots(D, dir, tag, { min = 0.18, gapMs = 6000, max = 8, every = 900, guard = null } = {}) {
  let peak = min, lastAt = 0, n = 0, stop = false, busy = false, inputs = 0, quietAt = 0, shooting = null;
  const shot = D.shot;
  if (guard) for (const k of guard[1]) {
    const f = guard[0][k];
    if (typeof f === 'function') guard[0][k] = async (...a) => { inputs++; try { if (shooting) await shooting; return await f(...a); } finally { inputs--; quietAt = Date.now() + 600; } };
  }
  const timer = setInterval(async () => {
    if (stop || busy || n >= max || inputs || Date.now() < quietAt) return;
    busy = true;
    try {
      const s = await D.evSafe('(() => { const c = window.__cover; return c && c.samples.length ? c.samples[c.samples.length - 1] : null; })()');
      if (s && s.play && !s.by.story && s.c > min && (s.c > peak || Date.now() - lastAt > 4 * gapMs) && Date.now() - lastAt > gapMs) {
        if (inputs || Date.now() < quietAt) { busy = false; return; }
        peak = Math.max(peak, s.c); lastAt = Date.now(); n++;
        shooting = shot(dir, `${tag}-cover-${String(n).padStart(2, '0')}-${Math.round(s.c * 100)}pct-${Object.keys(s.by).join('+') || 'none'}`).catch(() => null);
        await shooting; shooting = null;
      }
    } catch (e) { /* */ }
    busy = false;
  }, every);
  return { stop() { stop = true; clearInterval(timer); }, get n() { return n; } };
}
export const coverDir = (here) => join(here, '..', 'docs', 'shots', 'msgfix');
