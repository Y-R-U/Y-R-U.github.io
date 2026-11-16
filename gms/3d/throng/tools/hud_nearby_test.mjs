// node tools/hud_nearby_test.mjs --port 9281 --base http://127.0.0.1:8761/gms/3d/throng/ [--sizes 384x692,844x390,1440x900]
//   [--modes classic,teams,koth,lcs,infection] [--samples 24] [--shots DIR] [--break avoid|threat|arrows] [--perf] (timing only, runs on builds without the indicators)
// Needs `~/.claude/bin/cdp start --port N -- --use-angle=metal`. Plays practice matches on autopilot and, on sampled
// frames, checks the nearby-crowd indicators against the live state measured independently in the page:
// every crowd within range has a label or an edge arrow (bar the 4-arrow cap), the tint follows the steal rule,
// nothing sits on the HUD, the account badge or another indicator, and arrows point at their crowd.
import fs from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith('--') ? [...a, [v.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : '1']] : a), []));
const port = +(args.port || 9281);
const base = args.base || 'http://127.0.0.1:8761/gms/3d/throng/';
const sizes = (args.sizes || '384x692,844x390,1440x900').split(',').map((s) => s.split('x').map(Number));
const modes = (args.modes || 'classic,teams,koth,lcs,infection').split(',');
const SAMPLES = +(args.samples || 24);
const BREAK = args.break || '';
const shots = args.shots || '';
if (shots) fs.mkdirSync(shots, { recursive: true });

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
let target = list.find((t) => t.type === 'page');
if (!target) target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); } });
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text); return r.result?.result?.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Runtime.enable');
await send('Page.enable');

// Runs in the page. Everything is re-derived from the DOM and the state, not from the HUD's own bookkeeping,
// except the HUD's range (a design number) which decides which off-screen crowds must have an arrow.
const PROBE = `(() => {
  const G = window.__game, hud = G.hud, r = G.renderer, st = G.state;
  const W = innerWidth, H = innerHeight, me = 0, dz = 0.06;
  const S = st, mode = S.mode, mc = S.crowds[me];
  const ally = (a, b) => (mode === 'teams' ? a.team === b.team : mode === 'infection' && a.horde && b.horde);
  const want = (o) => { if (ally(mc, o)) return 'ally'; if (!mc.alive || !o.alive || mc.protect > 0 || o.protect > 0 || mc.count === o.count) return 'even';
    const big = Math.max(mc.count, o.count), sm = Math.min(mc.count, o.count); return big / sm < 1 + dz ? 'even' : o.count > mc.count ? 'danger' : 'prey'; };
  const R = (e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
  const un = (a, b) => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) });
  const hit = (a, b) => a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
  const root = document.getElementById('hud');
  const hudEls = [...root.querySelectorAll('.timer, .pause-btn, .kills, .mode-pill, .lb, .mm-wrap, .pu.on, .team-bar, .net-pill, .zone-warn')].filter(vis);
  const hudR = hudEls.map((e) => ({ name: e.className.split(' ')[0], ...R(e) }));
  const acc = document.getElementById('br8t-account'), fab = acc && acc.shadowRoot && acc.shadowRoot.querySelector('.fab');
  if (fab && fab.getClientRects().length) hudR.push({ name: 'account', ...R(fab) });
  const joy = document.querySelector('.joy:not(.hidden) .joy-base'); if (joy) hudR.push({ name: 'joy', ...R(joy) });
  const ind = [];
  const badges = [...root.querySelectorAll('.badges .badge')];
  badges.forEach((b, i) => { if (b.classList.contains('hidden')) return; const n = b.querySelector('.b-n'); let rc = R(n); const f = parseFloat(getComputedStyle(n).fontSize); rc.b += 0.42 * f;
    const th = b.querySelector('.b-th'); if (vis(th)) rc = un(rc, R(th)); ind.push({ kind: 'label', idx: i, th: b.dataset.th || '', rc, txt: b.querySelector('.b-v').textContent }); });
  const D = hud.indicators;
  const arrows = [...root.querySelectorAll('.nb-arrows .edge-arrow:not(.hidden)')];
  arrows.forEach((a) => { const inn = a.querySelector('.ea-in'); let rc = R(inn); rc = un(rc, R(a.querySelector('s'))); const cr = a.querySelector('.ea-crown'); if (vis(cr)) rc = un(rc, R(cr));
    const m = /rotate\\(([-0-9.e]+)rad\\)/.exec(a.querySelector('i').style.transform); const t = /translate3d\\(([-0-9.]+)px, ([-0-9.]+)px/.exec(a.style.transform);
    ind.push({ kind: 'arrow', th: a.dataset.th, rc, txt: a.querySelector('b').textContent, lead: a.classList.contains('lead'), ang: m ? +m[1] : NaN, x: t ? +t[1] : NaN, y: t ? +t[2] : NaN }); });
  const za = root.querySelector('.zone-arrow:not(.hidden)'); if (za && vis(za)) ind.push({ kind: 'zone', rc: un(R(za.querySelector('.ea-in')), R(za.querySelector('s'))) });
  const out = { W, H, t: +(S.duration - S.timeLeft).toFixed(1), phase: S.phase, alive: mc.alive, problems: [], drops: [], under: 0, need: 0, got: 0, capped: 0, dropped: 0, labels: 0, arrows: 0 };
  const P = (s) => out.problems.push(s);
  // geometry: inside the screen, clear of the HUD and of each other
  for (const a of ind) {
    if (a.rc.l < -0.5 || a.rc.t < -0.5 || a.rc.r > W + 0.5 || a.rc.b > H + 0.5) P(a.kind + ' ' + (a.idx ?? a.txt) + ' off screen ' + JSON.stringify(a.rc));
    for (const h of hudR) if (hit(a.rc, h)) P(a.kind + ' ' + (a.idx ?? a.txt) + ' under ' + h.name);
  }
  for (let i = 0; i < ind.length; i++) for (let j = i + 1; j < ind.length; j++) if (hit(ind[i].rc, ind[j].rc)) P('overlap ' + ind[i].kind + ':' + (ind[i].idx ?? ind[i].txt) + ' x ' + ind[j].kind + ':' + (ind[j].idx ?? ind[j].txt));
  const p = { x: 0, y: 0, visible: false };
  const lead = (() => { const L = S.crowds[S.leader]; if (!L || !L.alive || S.phase === 'countdown') return -1;
    const ts = (c) => (S.teams ? S.teams[c.team].score : 0);
    return S.crowds.some((c) => c !== L && c.count === L.count && c.score === L.score && !!c.out === !!L.out && ts(c) === ts(L)) ? -1 : S.leader; })();
  let nonLeadArrows = arrows.filter((a) => !a.classList.contains('lead')).length;
  for (const c of S.crowds) {
    const d = D.list[c.index];
    const myB = ind.filter((a) => a.kind === 'label' && a.idx === c.index);
    if (!c.alive) { if (myB.length) P('label on dead crowd ' + c.index); continue; }
    r.project(c.x, 2, c.z, p);
    const on = p.visible && p.x >= 1 && p.x <= W - 1 && p.y >= 1 && p.y <= H - 1;
    // the HUD draws the interpolated position: within a few px of the edge either answer is right
    if (p.visible && Math.min(Math.abs(p.x), Math.abs(p.x - W), Math.abs(p.y), Math.abs(p.y - H)) < 8 && c.index !== me) continue;
    if (c.index === me) { if (!myB.length && on) P('no label on your own crowd'); continue; }
    const th = mc.alive ? want(c) : '';
    if (on) {
      out.need++;
      const viaArrow = !myB.length && d.kind === 'arrow' && ind.some((a) => a.kind === 'arrow' && a.txt === String(c.count));
      if (viaArrow) { out.got++; out.arrows++; out.under++; }
      else if (myB.length) { out.got++; out.labels++; if (myB[0].th !== th) P('label ' + c.index + ' tint ' + myB[0].th + ' want ' + th + ' (' + mc.count + ' v ' + c.count + ')'); if (myB[0].txt !== String(c.count)) P('label ' + c.index + ' text ' + myB[0].txt + ' want ' + c.count); }
      else if (d.why === 'overlap') { out.dropped++; out.drops.push('label ' + c.index + ' at ' + p.x.toFixed(0) + ',' + p.y.toFixed(0)); }
      else P('on-screen crowd ' + c.index + ' has no label (' + d.kind + '/' + d.why + ')');
      continue;
    }
    if (myB.length) P('off-screen crowd ' + c.index + ' still has a label');
    if (S.phase !== 'play') continue;
    const mustArrow = (mc.alive && d.range) || c.index === lead;
    const mine = ind.filter((a) => a.kind === 'arrow' && a.txt === String(c.count) && (a.th === (th || 'even')));
    if (!mustArrow) continue;
    out.need++;
    if (d.kind === 'arrow') {
      out.got++; out.arrows++;
      if (!mine.length) P('arrow for ' + c.index + ' has wrong tint/count (want ' + (th || 'even') + ' ' + c.count + ')');
      else if (p.visible && !p.behind) {
        const a = mine.find((m) => Number.isFinite(m.ang)); if (a) { const wantA = Math.atan2(p.y - a.y, p.x - a.x); let dd = Math.abs(wantA - a.ang); dd = Math.min(dd, 2 * Math.PI - dd); if (dd > 0.35) P('arrow ' + c.index + ' points ' + (dd * 57.3).toFixed(0) + ' deg off'); }
      }
    } else if (d.why === 'cap') { out.capped++; if (nonLeadArrows < 4) P('crowd ' + c.index + ' capped with only ' + nonLeadArrows + ' arrows'); }
    else if (d.why === 'nospace') { out.dropped++; out.drops.push('arrow ' + c.index); }
    else P('crowd ' + c.index + ' in range, off screen, no arrow (' + d.kind + '/' + d.why + ')');
  }
  if (arrows.filter((a) => a.classList.contains('lead')).length > 1) P('two leader arrows');
  if (lead >= 0 && lead !== me && ind.some((a) => a.kind === 'label' && a.idx === lead) && arrows.some((a) => a.classList.contains('lead'))) P('leader has a label and an arrow');
  return out;
})()`;

const results = [];
let failN = 0;
for (const [w, h] of sizes) {
  for (const mode of modes) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: w < 1000 ? 2 : 1, mobile: w < 1000 });
    if (w < 1000) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 }); else await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    const url = `${base}?seed=7&mode=${mode}${BREAK ? '&hudbreak=' + BREAK : ''}`;
    await send('Page.navigate', { url });
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) { if (await ev('!!(window.__game && window.__game.ready)').catch(() => false)) break; await sleep(200); }
    await ev(`(async () => { const G = __game; G.start({ kind: 'practice' }); G.setAuto(true); })()`);
    for (let k = 0; k < 60 && (await ev(`__game.state && __game.state.phase`)) !== 'play'; k++) await sleep(200);
    await sleep(300);
    await ev(`(() => { const G = __game, h = G.hud, f = h.update; G.__hudT = []; h.update = function (...a) { const t = performance.now(); const r = f.apply(this, a); G.__hudT.push(performance.now() - t); return r; }; })()`);
    const agg = { size: `${w}x${h}`, mode, samples: 0, need: 0, got: 0, capped: 0, dropped: 0, under: 0, labels: 0, arrows: 0, problems: [], drops: [] };
    for (let s = 0; s < SAMPLES; s++) {
      await ev(`(() => { const G = __game; if (G.state && G.state.phase === 'play' && G.state.timeLeft > 8) G.stepSeconds(${s < 3 ? 0.5 : 3.6}); })()`);
      await sleep(260);
      const res = args.perf ? { need: 0, got: 0, capped: 0, dropped: 0, labels: 0, arrows: 1, under: 0, problems: [], drops: [], t: 0 } : await ev(PROBE);
      agg.samples++;
      for (const k of ['need', 'got', 'capped', 'dropped', 'labels', 'arrows', 'under']) agg[k] += res[k];
      for (const pr of res.problems) agg.problems.push(`t=${res.t} ${pr}`);
      for (const pr of res.drops) agg.drops.push(`t=${res.t} ${pr}`);
      if (shots && (s === 6 || s === 14)) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${shots}/nb_${w}x${h}_${mode}_${s}.png`, Buffer.from(shot.result.data, 'base64'));
      }
    }
    const t = await ev(`(() => { const a = __game.__hudT.slice().sort((x, y) => x - y); return { n: a.length, mean: a.reduce((x, y) => x + y, 0) / a.length, p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1] }; })()`);
    agg.hudMs = { mean: +t.mean.toFixed(3), p95: +t.p95.toFixed(3), max: +t.max.toFixed(2), n: t.n };
    agg.errors = await ev('__game.errors.slice(0, 5)');
    const bad = agg.problems.length > 0 || agg.errors.length > 0 || agg.dropped > Math.max(1, agg.need * 0.03) || agg.arrows === 0;
    if (bad) failN++;
    results.push(agg);
    console.log(`${bad ? 'FAIL' : 'ok  '} ${agg.size} ${mode.padEnd(9)} samples ${agg.samples} need ${agg.need} got ${agg.got} (labels ${agg.labels}, arrows ${agg.arrows}) capped ${agg.capped} dropped ${agg.dropped} under-hud ${agg.under} · hud ${agg.hudMs.mean}ms mean ${agg.hudMs.p95} p95${agg.errors.length ? ' · errors ' + agg.errors.join(' | ') : ''}`);
    for (const pr of agg.problems.slice(0, 6)) console.log('     ' + pr);
    if (agg.drops.length) console.log('     drops: ' + agg.drops.join('; '));
    if (agg.problems.length > 6) console.log(`     … ${agg.problems.length - 6} more`);
  }
}
if (args.json) fs.writeFileSync(args.json, JSON.stringify(results, null, 1));
console.log(failN ? `FAIL (${failN} runs)` : 'PASS');
ws.close();
process.exit(failN ? 1 : 0);
