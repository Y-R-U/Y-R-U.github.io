// Mission framework (D17): a briefing card with the objectives, ordered steps with one coach line each (plus the
// current goal), triggers on flight/ATC/score/radio state, a target marker, success/fail and a reward card.
// Data: data/story/mission*.js. Wiring: docs/STORY.md.
import { createMarkers } from '../assist/markers.js';
import { createLandButton } from '../assist/landbutton.js';
import { DIFFICULTY } from '../../data/rules.js';
import { RANKS } from '../../data/ranks.js';
import { CONTROLLERS } from '../../data/story.js';
import { BRIEF_LINES } from '../../data/story/lines.js';
import { ensureStoryCss, el, esc, isTouch, loadProgress, saveProgress } from './dom.js';

const TEXT_ONLY = new Set(BRIEF_LINES.filter((l) => l.textOnly).map((l) => l.id)); // no clip yet: never fetched

const COACH_AVOID = ['#krz-hud .krz-hud-strip', '#krz-hud .krz-ap', '#krz-hud .krz-axes', '#krz-hud .krz-flash', '.krz-r-subs', '.krz-score', '.krz-r-tower', '.krz-cer', '.krz-herald'];
const AUDIO_BASE = new URL('../../audio/story/', import.meta.url).href;

/**
 * def: data/story/mission*.js shape. o: { host (js/story/host.js + actors.js), camera, difficulty?, parent?,
 *   setTarget?(t|null)   — host draws the target itself (else the mission owns an ASSIST markers canvas),
 *   hasNext?, volume?, onComplete?(result), onFail?(result), onExit?(result), onNext?(result), log?(type, data) }
 */
export function createMission(def, o) {
  ensureStoryCss();
  const host = o.host;
  const diff = o.difficulty || host.difficulty();
  const parent = o.parent || document.body;
  const M = { status: 'idle', i: -1, t: 0, stepT: 0, events: [], flag: {}, mflag: {}, route: null, result: null, log: [], pendingNext: -1, crashed: false, ticks: new Set(), briefing: false };
  const off = [];
  const touch = isTouch();
  const log = (type, d = {}) => { M.log.push({ t: +M.t.toFixed(1), type, ...d }); try { o.log?.('story.' + type, d); } catch (e) { /* */ } };
  const objectives = def.objectives || [];

  const coach = el('div', 'krz-st-coach', '<span class="krz-st-n"></span><span class="krz-st-body"><span class="krz-st-goal"></span><span class="krz-st-txt"></span></span>');
  coach.hidden = true;
  const coachN = coach.querySelector('.krz-st-n'), coachTxt = coach.querySelector('.krz-st-txt'), coachGoal = coach.querySelector('.krz-st-goal');
  let markers = null, landBtn = null, demandBtn = null, fbBox = null, brief = null, voice = null;

  const ctx = {
    get s() { return M.s; }, host, diff, touch, flag: M.flag, mflag: M.mflag, def,
    get stepT() { return M.stepT; }, get t() { return M.t; }, get route() { return M.route; }, get step() { return def.steps[M.i]?.id; },
    since(type, pred) { let n = 0; for (const e of M.events) if (e.step === M.i && e.type === type && (!pred || pred(e.data))) n++; return n; },
    count(type, pred) { return M.events.filter((e) => e.type === type && (!pred || pred(e.data))).length; },
    setCoach: (html) => setCoach(html, true),
    tick: (id) => tick(id), ticked: (id) => M.ticks.has(id),
    fail: (reason) => fail(reason),
    goto: (id) => { const n = def.steps.findIndex((s) => s.id === id); if (n >= 0) { M.pendingNext = n; M.pendingT = 0.3; } },
    log: (type, d) => log(type, d),
    showLandButton, showDemandButton,
    // STORY3: a Kingdom Map trip (magic clouds); the route is rebuilt for the new airport on arrival (def.route sees it)
    trip: (to, agl) => { M.mflag.tripTo = to; return host.trip(to, { agl, beforeSwap: () => host.despawnAll?.(), onArrive: (id) => arrived(id) }); },
    reroute: (route, start = 0) => { M.route = route; host.setRoute(route, start); },
  };

  function arrived(to) {
    if (M.status !== 'running') return;
    const end = host.activeEnd(), from = M.at;
    M.at = to;
    M.route = def.route(end, diff, { from, at: to }); M.end = end;
    host.setRoute(M.route, M.route.marks?.arrive ?? 0);
    M.mflag.arrived = to;
    log('arrived', { to, end });
    if (def.arriveTower?.[to]) host.setTowerVoice(CONTROLLERS[def.arriveTower[to]]?.voice);
    try { def.onArrive?.(ctx, to); } catch (e) { console.warn('[story] arrive', e); }
  }

  function goalText() {
    const g = objectives.find((x) => !M.ticks.has(x.id));
    return g ? g.text : '';
  }
  function paintGoal() {
    const g = goalText();
    coachGoal.textContent = g ? `Goal · ${g}` : '';
    coachGoal.hidden = !g;
  }
  function tick(id) {
    if (M.ticks.has(id) || !objectives.some((x) => x.id === id)) return;
    M.ticks.add(id);
    log('objective', { id });
    paintGoal();
    coach.classList.remove('goal'); void coach.offsetWidth; coach.classList.add('goal');
  }

  function setCoach(html, nudge) {
    coachTxt.innerHTML = html;
    coachN.textContent = `${M.i + 1}/${def.steps.length}`;
    paintGoal();
    coach.hidden = false;
    coach.classList.remove('done', 'nudge', 'brief');
    coachAt = performance.now();
    void coach.offsetWidth;
    coach.classList.add('in');
    if (nudge) coach.classList.add('nudge');
    placeCoach(true);
  }

  // Layout reads are rare (step change, resize, ~1.5 s) and batched before the one write, which only happens on change.
  let placeT = 0, lastTop = -1, coachAt = 0;
  // MSGFIX: after COACH_FULL ms (real time, so the 5× warp does not rush it) the card folds to one line with no goal row;
  // a tap on the folded card opens it again for another COACH_FULL
  const COACH_FULL = 6000;
  coach.addEventListener('pointerdown', (e) => e.stopPropagation());
  coach.addEventListener('click', (e) => { e.stopPropagation(); if (coach.classList.contains('brief')) { coach.classList.remove('brief'); coachAt = performance.now(); placeCoach(true); } });
  const onResize = () => { placeT = 0; };
  try { new ResizeObserver(() => { if (!coach.hidden) placeCoach(true); }).observe(coach); } catch (e) { /* */ }
  // Portrait: the coach takes the band right under the HUD strip (left of the tower column) and the radio subtitles
  // drop below it (--krz-subs-top), so the chase-framed plane further down stays clear.
  let lastSubs = '';
  function setSubsTop(v) {
    if (v === lastSubs) return;
    lastSubs = v;
    const r = document.documentElement;
    if (v) { r.style.setProperty('--krz-subs-top', v); r.classList.add('krz-coach-on'); }
    else { r.style.removeProperty('--krz-subs-top'); r.classList.remove('krz-coach-on'); }
  }
  function placeCoach(force) {
    if (!coach.hidden && !coach.classList.contains('brief') && coachAt && performance.now() - coachAt > COACH_FULL) { coach.classList.add('brief'); force = true; }
    if (!force && --placeT > 0) return;
    placeT = 90;
    if (coach.hidden) { setSubsTop(''); return; }
    const W = innerWidth, H = innerHeight, port = H > W;
    // Landscape: the top-left corner beside the HUD strip when it is wide enough (centre-top sits on the plane's wing).
    // the band below the strip is free left of the AP pill: use it (a narrower coach grows down into the stick zone)
    const lefts = ['.krz-ap', '.krz-axes', '.krz-hud-strip'].map((k) => document.querySelector('#krz-hud ' + k)?.getBoundingClientRect()).filter((r) => r?.width).map((r) => r.left);
    const room = !port && lefts.length ? Math.floor(Math.min(...lefts) - 20) : 0;
    const side = room >= 220;
    coach.classList.toggle('port', port);
    coach.classList.toggle('side', side);
    const mw = side ? `${Math.min(room, 360)}px` : '';
    if (coach.style.maxWidth !== mw) coach.style.maxWidth = mw;
    const cw = coach.offsetWidth || Math.min(W * 0.86, 520);
    const x0 = port || side ? coach.getBoundingClientRect().left : W / 2 - cw / 2, x1 = x0 + cw;
    let top = 12;
    for (const sel of port ? COACH_AVOID.filter((s) => s !== '.krz-r-subs') : COACH_AVOID) for (const e of document.querySelectorAll(sel)) {
      if (e.hidden || e.closest('[hidden]')) continue;
      const r = e.getBoundingClientRect();
      if (!r.height || r.right < x0 || r.left > x1 || r.top > H * 0.45) continue;
      top = Math.max(top, r.bottom + (port ? 6 : 8));
    }
    top = Math.round(top);
    if (top !== lastTop) { lastTop = top; coach.style.top = `${top}px`; }
    // landscape: the coach must end above the stick zone; drop the goal line (it is on the briefing), then shrink
    if (side) {
      const sz = document.querySelector('.krz-stick-zone')?.getBoundingClientRect();
      coach.classList.remove('tight', 'tighter');
      if (sz?.height && top + coach.offsetHeight > sz.top - 2) {
        coach.classList.add('tight');
        if (top + coach.offsetHeight > sz.top - 2) coach.classList.add('tighter');
      }
    } else coach.classList.remove('tight', 'tighter');
    setSubsTop(port ? `${top + coach.offsetHeight + 6}px` : '');
  }

  // ---- fallback buttons, only when the host has none of its own ----
  function box() { if (!fbBox) { fbBox = el('div', 'krz-st-fallback'); parent.appendChild(fbBox); } return fbBox; }
  function showLandButton(want) {
    const hostHas = !!document.querySelector('.krz-land:not([data-story])');
    if (!want || hostHas) { if (landBtn) landBtn.setVisible(false); return; }
    if (!landBtn) {
      landBtn = createLandButton({ container: box(), onPress: () => { const r = host.requestLand(); log('land', { ok: !r?.fail, fail: r?.fail }); if (r?.fail) landBtn.setState('unavailable', r.hint || 'Not here'); } });
      landBtn.el.dataset.story = '1';
    }
    landBtn.setVisible(true);
    landBtn.setState(M.s?.landing ? 'active' : 'idle');
  }
  function showDemandButton(want) {
    if (!want) { if (demandBtn) demandBtn.hidden = true; return; }
    if (!demandBtn) {
      demandBtn = el('button', 'krz-finish', '<span class="krz-fin-txt"><b>LANDED — DEMAND IT</b><small>Bank and finish</small></span>');
      demandBtn.type = 'button'; demandBtn.dataset.story = '1'; demandBtn.dataset.state = 'ready';
      demandBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
      demandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const g = host.game(); if (!g) return;
        const r = g.demand({ ok: true }, { atStand: false });
        log('demand', r);
      });
      box().appendChild(demandBtn);
    }
    demandBtn.hidden = false;
  }

  function target() {
    const st = def.steps[M.i];
    return st?.target ? st.target(ctx) : null;
  }
  function paintTarget() {
    const t = target();
    if (o.setTarget) { o.setTarget(t); return; }
    if (!markers) {
      if (!o.camera) return;
      markers = createMarkers({ container: parent, camera: o.camera, traffic: false });
      markers.el.classList.add('krz-st-mk');
    }
    markers.set(t ? [{ id: 'story', kind: 'target', label: t.label, worldPos: t.pos }] : []);
    markers.update();
  }

  function enterStep(i) {
    M.i = i; M.stepT = 0; M.hinted = false;
    const st = def.steps[i];
    if (!st) return complete();
    for (const k of Object.keys(M.flag)) delete M.flag[k];
    M.s = host.snap() || M.s || {};
    log('step', { id: st.id });
    try { st.enter?.(ctx); } catch (e) { console.warn('[story] enter', st.id, e); }
    if (M.status !== 'running') return;
    setCoach(typeof st.coach === 'function' ? st.coach(ctx) : st.coach, false);
  }

  function place() {
    const p = typeof def.start === 'function' ? def.start(ctx) : def.start;
    if (p?.air) return host.placeAir(p.air) && 'air';
    if (p?.ground) return host.placeGround(p.ground) && 'ground';
    return host.placeAtStand(p?.stand || 'S6', p?.heading ?? 180);
  }

  // ---- briefing card: the objectives, read before the sim runs (the world waits while it is up) ----
  function narrate(ids) {
    stopVoice();
    const vol = Math.max(0, Math.min(1, o.volume ?? 1));
    if (!ids?.length || !vol) return;
    const q = ids.filter((id) => !TEXT_ONLY.has(id));
    const next = () => {
      const id = q.shift(); if (!id) return;
      const a = new Audio(AUDIO_BASE + id + '.mp3');
      a.volume = vol;
      a.onended = () => { if (voice === a) setTimeout(() => { if (voice === a) next(); }, 350); };
      voice = a;
      a.play().catch(() => {});
    };
    next();
  }
  function stopVoice() { if (voice) { const a = voice; voice = null; try { a.pause(); } catch (e) { /* */ } } }
  function showBrief(onGo) {
    const tw = CONTROLLERS[def.tower];
    const items = objectives.map((x) => `<li>${esc(x.text)}</li>`).join('');
    brief = el('div', 'krz-st-brief', `<div class="krz-st-card krz-st-bcard" role="dialog" aria-label="Mission ${def.id} briefing">
      <small class="k">Mission ${def.id}${def.towerLabel ? ` · ${esc(def.towerLabel)}` : tw ? ` · Tower: ${esc(tw.name.split(' ')[0])}` : ''}</small><h2>${esc(def.title)}</h2>
      ${def.subtitle ? `<h3>${esc(def.subtitle)}</h3>` : ''}${def.brief ? `<p class="krz-st-bp">${esc(def.brief)}</p>` : ''}
      ${items ? `<div class="krz-st-obj"><b>Your orders</b><ol>${items}</ol></div>` : ''}
      ${def.diffNote?.[diff] ? `<p class="krz-st-dn"><b>${esc(diff[0].toUpperCase() + diff.slice(1))}:</b> ${esc(def.diffNote[diff])}</p>` : ''}
      <div class="krz-st-btns"><button type="button" data-a="go">Fly <span aria-hidden="true">›</span></button></div></div>`);
    brief.addEventListener('pointerdown', (e) => e.stopPropagation());
    brief.addEventListener('click', (e) => {
      if (!e.target.closest('button[data-a="go"]')) return;
      e.stopPropagation();
      closeBrief();
      onGo();
    });
    parent.appendChild(brief);
    requestAnimationFrame(() => brief?.classList.add('in'));
    narrate(def.narration);
  }
  function closeBrief() {
    M.briefing = false;
    stopVoice();
    if (brief) { const b = brief; brief = null; b.classList.remove('in'); setTimeout(() => b.remove(), 300); }
  }

  async function start() {
    const end = host.activeEnd();
    M.at = host.airport?.() || 'royal';
    M.route = def.route(end, diff, { from: null, at: M.at });
    M.end = end;
    const where = place();
    host.setRoute(M.route, def.routeStart ?? 0);
    const tw = CONTROLLERS[def.tower]; if (tw) host.setTowerVoice(tw.voice);
    for (const type of ['pp', 'finished', 'banked', 'scandal', 'barked', 'window', 'line']) off.push(host.on(type, (data) => onEvent(type, data)));
    parent.append(coach);
    addEventListener('resize', onResize);
    M.status = 'running'; M.t = 0; M.briefing = true;
    log('start', { mission: def.id, diff, end, where });
    const gen = (M.gen = (M.gen || 0) + 1);
    let ready = !def.setup;
    if (def.setup) Promise.resolve().then(() => def.setup(ctx)).catch((e) => console.warn('[story] setup', e)).then(() => { ready = true; });
    showBrief(() => {
      const go = () => { if (M.gen !== gen || M.status !== 'running') return; if (!ready) { setTimeout(go, 100); return; } log('go', {}); try { def.onGo?.(ctx); } catch (e) { console.warn('[story] go', e); } enterStep(0); };
      go();
    });
  }

  function onEvent(type, data = {}) {
    if (M.status !== 'running') return;
    if (type === 'line') { if (data.speaker !== 'tower' && !String(data.speaker).startsWith('player')) M.events.push({ step: M.i, type, data, t: M.t }); return; }
    M.events.push({ step: M.i, type, data, t: M.t });
    log('event', { type, id: data.id, amount: data.amount });
    try { def.onEvent?.(ctx, type, data); } catch (e) { console.warn('[story] onEvent', e); }
    if (type === 'scandal' && DIFFICULTY[diff]?.scandalFails === 'always') fail('Royal Scandal. The Palace has been informed.');
  }

  function update(dt) {
    if (M.status !== 'running' || M.briefing || M.i < 0) return;
    M.t += dt; M.stepT += dt;
    const s = (M.s = host.snap());
    if (!s) return;
    if (s.crashed && !M.crashed) {
      M.crashed = true; log('crash', {});
      if (diff === 'hard') return fail('Crashed. Real metal, Hard rules: that is the end of that.');
    } else if (!s.crashed && M.crashed) {
      M.crashed = false;
      const cur = def.steps[M.i];
      // respawned on the runway: take off again, then rejoin the leg this step needs
      if (s.onGround && !cur?.noRelaunch) { host.setRoute(M.route, M.route.marks?.relaunch ?? 2); M.resumeLeg = cur?.resumeLeg ? cur.resumeLeg(ctx) : null; }
      setCoach('Bounced. impossiRubber, darling. The autopilot takes you round again.', true);
      M.recoach = 4;
    }
    if (M.resumeLeg != null && !s.onGround && s.agl > 60) { host.setRoute(M.route, M.resumeLeg); M.resumeLeg = null; }
    if (M.recoach > 0 && (M.recoach -= dt) <= 0 && def.steps[M.i]) { const c = def.steps[M.i].coach; setCoach(typeof c === 'function' ? c(ctx) : c, false); }
    try { def.update?.(ctx, dt); } catch (e) { console.warn('[story] mission update', e); }
    if (M.status !== 'running') return;
    const st = def.steps[M.i];
    if (M.pendingNext >= 0) {
      if ((M.pendingT -= dt) <= 0) { const n = M.pendingNext; M.pendingNext = -1; enterStep(n); }
    } else if (st) {
      try { st.update?.(ctx, dt); } catch (e) { console.warn('[story] update', st.id, e); }
      if (M.status !== 'running') return;
      if (st.hint && !M.hinted && M.stepT > st.hint.after) { M.hinted = true; setCoach(st.hint.text(ctx), true); }
      let ok = false;
      try { ok = M.pendingNext < 0 && !!st.done(ctx); } catch (e) { console.warn('[story] done', st.id, e); }
      if (ok && M.status === 'running') {
        log('stepDone', { id: st.id, secs: +M.stepT.toFixed(1) });
        if (st.tick) tick(st.tick);
        coach.classList.add('done');
        M.pendingNext = M.i + 1; M.pendingT = 0.7;
        if (landBtn && st.id === 'land') landBtn.setVisible(false);
      }
    }
    if (M.status !== 'running') return;
    placeCoach(false);
    paintTarget();
  }

  function rankInfo() {
    const c = host.career();
    if (!c) return null;
    const gender = o.gender || 'm';
    const i = c.rankIndex ?? 0, r = RANKS[i], next = c.nextGoal?.();
    const lp = c.lifetimePP ?? 0;
    const frac = next ? Math.max(0, Math.min(1, (lp - r.minPP) / (next.rank.minPP - r.minPP))) : 1;
    return { title: gender === 'f' ? r.f : r.m, next: next ? (gender === 'f' ? next.rank.f : next.rank.m) : null, need: next?.ppNeeded ?? 0, lifetime: lp, frac };
  }

  function complete() {
    if (M.status !== 'running') return;
    M.status = 'complete';
    // objectives are only ever ticked when earned: the reward card shows the missed ones as –
    const fin = [...M.events].reverse().find((e) => e.type === 'finished');
    const sortie = fin?.data?.amount || 0;
    const mult = DIFFICULTY[diff]?.targetMult || 1;
    const bonus = Math.round((def.reward?.pp || 0) * mult / 10) * 10;
    const c = host.career();
    const before = c ? c.rankIndex : null;
    try { if (c?.addBonus) c.addBonus(bonus); else c?.addPP(bonus, {}); } catch (e) { console.warn('[story] reward', e); }
    const crimes = M.events.filter((e) => e.type === 'pp' && e.data.id && !['banter', 'impeccable'].includes(e.data.id)).length;
    const P = loadProgress();
    const prev = P.missions[def.id] || {};
    P.missions[def.id] = { done: true, diff, best: Math.max(prev.best || 0, sortie + bonus), at: Date.now(), plays: (prev.plays || 0) + 1 };
    if (def.ending && !P.complete) P.complete = { at: Date.now(), diff };
    saveProgress(P);
    const rank = rankInfo();
    M.result = { ok: true, mission: def.id, diff, sortie, bonus, crimes, secs: Math.round(M.t), rank, rankUp: c && before != null && c.rankIndex > before, objectives: [...M.ticks] };
    log('complete', M.result);
    try { def.onComplete?.(ctx, M.result); } catch (e) { console.warn('[story] onComplete', e); }
    cleanup();
    teardownHud();
    setTimeout(() => afterHerald(() => (def.ending ? ending(() => card(true)) : card(true))), 700);
    try { o.onComplete?.(M.result); } catch (e) { console.error(e); }
  }

  function fail(reason) {
    if (M.status !== 'running') return;
    M.status = 'failed';
    M.result = { ok: false, mission: def.id, diff, reason, step: def.steps[M.i]?.id };
    log('fail', M.result);
    cleanup();
    teardownHud();
    card(false);
    try { o.onFail?.(M.result); } catch (e) { console.error(e); }
  }

  function cleanup() {
    closeBrief();
    try { def.cleanup?.(ctx); } catch (e) { console.warn('[story] cleanup', e); }
    try { host.despawnAll?.(); } catch (e) { /* */ }
  }

  // the HUD's Krayzee Herald headlines play at the finish: let them run (or be skipped) before the reward card
  // PLAYTEST_3 #10: the reel opens ~1.6 s after the finish (later after a rank-up ceremony), so wait while headlines are
  // still queued for it, not only while it is on screen
  function afterHerald(fn, waited = 0) {
    const up = [...document.querySelectorAll('.krz-herald, .krz-reel, .krz-cer')].some((e) => !e.hidden && !e.closest('[hidden]') && e.getClientRects().length);
    const queued = (host.G?.ghud?.headlines?.state?.count || 0) > 0 && waited < 9000;
    if ((up || queued) && waited < 30000 && M.status === 'complete') { setTimeout(() => afterHerald(fn, waited + 300), 300); return; }
    if (M.status === 'complete') fn();
  }

  let cardEl = null;
  function card(ok) {
    const R = M.result;
    const rk = R.rank;
    const fmt = (n) => Math.round(n).toLocaleString('en-GB');
    const objRows = objectives.length && ok ? `<div class="krz-st-objs">${objectives.map((x) => `<span class="${M.ticks.has(x.id) ? 'y' : 'n'}">${esc(x.done || x.text)}</span>`).join('')}</div>` : '';
    const rows = ok ? `
      <div><span>Privilege banked this flight</span><b>${fmt(R.sortie)} PP</b></div>
      <div><span>${esc(def.reward?.label || 'Mission reward')}${R.diff !== 'medium' ? ` (${R.diff})` : ''}</span><b>+${fmt(R.bonus)} PP</b></div>
      <div><span>Rules broken</span><b>${R.crimes}</b></div>
      <div class="tot"><span>Total</span><b>${fmt(R.sortie + R.bonus)} PP</b></div>` : `<div><span>${esc(R.reason)}</span></div>`;
    const rankHtml = ok && rk ? `<div class="krz-st-rank"><div><b>${esc(rk.title)}</b>${rk.next ? ` · ${fmt(rk.need)} PP to ${esc(rk.next)}` : ''}</div><div class="bar"><i></i></div><div>${fmt(rk.lifetime)} PP lifetime</div></div>` : '';
    const btns = ok
      ? (o.hasNext ? '<button type="button" data-a="next">Next mission <span aria-hidden="true">›</span></button><button type="button" class="alt" data-a="continue">Menu</button><button type="button" class="alt" data-a="retry">Fly it again</button>'
        : '<button type="button" data-a="continue">Continue</button><button type="button" class="alt" data-a="retry">Fly it again</button>')
      : '<button type="button" data-a="retry">Try again</button><button type="button" class="alt" data-a="exit">Leave</button>';
    const head = ok ? (def.outro || (R.rankUp ? 'And a promotion, no less.' : 'The tower will need a lie down.')) : (def.failLine || 'The tower is quietly relieved.');
    cardEl = el('div', 'krz-st-done', `<div class="krz-st-card" role="dialog" aria-label="${ok ? 'Mission complete' : 'Mission failed'}">
      <small class="k">Mission ${def.id} · ${ok ? 'Complete' : 'Failed'}</small><h2>${esc(def.title)}</h2>
      <h3>${esc(head)}</h3>${objRows}
      <div class="krz-st-rows">${rows}</div>${rankHtml}
      <div class="krz-st-btns">${btns}</div></div>`);
    cardEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    cardEl.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      e.stopPropagation();
      closeCard();
      log('cardAction', { a });
      if (a === 'retry') restart();
      else if (a === 'next' && o.onNext) try { o.onNext({ ...M.result, action: a }); } catch (err) { console.error(err); }
      else try { o.onExit?.({ ...M.result, action: a }); } catch (err) { console.error(err); }
    });
    parent.appendChild(cardEl);
    // a late Herald reel (a bank after the finish, a rank-up ceremony first) never stacks on the card: the card steps aside
    const me = cardEl;
    const dodge = () => {
      if (cardEl !== me) return;
      const reel = [...document.querySelectorAll('.krz-reel, .krz-cer')].some((e) => !e.hidden && e.getClientRects().length);
      const v = reel ? 'hidden' : '';
      if (me.style.visibility !== v) me.style.visibility = v;
      setTimeout(dodge, 250);
    };
    dodge();
    requestAnimationFrame(() => { cardEl.classList.add('in'); const bar = cardEl.querySelector('.bar i'); if (bar && rk) bar.style.width = `${Math.round(rk.frac * 100)}%`; });
  }
  function closeCard() { if (cardEl) { cardEl.remove(); cardEl = null; } }

  // STORY3 finale: the coronation, after the Herald and before the reward card. Lines arrive one by one; any tap shows the rest.
  let endEl = null;
  function ending(next) {
    const E = def.ending, prof = o.profile?.() || {};
    const who = esc(`${rankInfo()?.title || 'Your Grace'} ${prof.name || ''}`.trim());
    const lines = E.lines.map((l, i) => `<p style="--d:${(0.9 + i * E.step).toFixed(2)}s">${l.who ? `<b>${esc(l.who)}</b> ` : ''}${esc(l.text)}</p>`).join('');
    endEl = el('div', 'krz-st-end', `<div class="krz-st-card krz-st-ecard" role="dialog" aria-label="${esc(E.title)}">
      <div class="krz-st-crown" aria-hidden="true">♛</div><small class="k">${esc(E.kicker)}</small><h2>${esc(E.title)}</h2>
      <h3>${E.crowned.replace('{who}', who)}</h3><div class="krz-st-elines">${lines}</div>
      <p class="krz-st-fin" style="--d:${(1.2 + E.lines.length * E.step).toFixed(2)}s">${esc(E.fin)}</p>
      <div class="krz-st-btns"><button type="button" data-a="on">${esc(E.button)} <span aria-hidden="true">›</span></button></div></div>`);
    endEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    endEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!e.target.closest('button[data-a="on"]')) { endEl.classList.add('all'); return; }
      const x = endEl; endEl = null; x.remove();
      log('ending', { seen: true });
      next();
    });
    parent.appendChild(endEl);
    log('ending', { shown: true });
    requestAnimationFrame(() => endEl?.classList.add('in'));
  }

  function teardownHud() {
    removeEventListener('resize', onResize);
    for (const f of off.splice(0)) { try { f(); } catch (e) { /* */ } }
    coach.classList.remove('in'); coach.hidden = true; setSubsTop('');
    if (markers) { markers.dispose(); markers = null; }
    if (o.setTarget) o.setTarget(null);
    if (landBtn) { landBtn.dispose(); landBtn = null; }
    if (demandBtn) { demandBtn.remove(); demandBtn = null; }
    if (fbBox) { fbBox.remove(); fbBox = null; }
  }

  function restart() {
    // a mission flown elsewhere (another airport, or after a trip): main sets the plane and airport up again
    if (o.relaunch && (host.airport?.() !== (def.airport || 'royal') || (def.aircraft && host.type?.() !== def.aircraft))) { cleanup(); teardownHud(); closeCard(); M.status = 'aborted'; coach.remove(); o.relaunch(def.id); return; }
    cleanup(); teardownHud(); closeCard();
    M.status = 'idle'; M.i = -1; M.events = []; M.pendingNext = -1; M.crashed = false; M.ticks.clear(); M.resumeLeg = null;
    for (const k of Object.keys(M.mflag)) delete M.mflag[k];
    start();
  }

  return {
    start, update, restart,
    event: onEvent,
    abort() { if (M.status === 'running') cleanup(); else closeBrief(); teardownHud(); closeCard(); endEl?.remove(); endEl = null; coach.remove(); M.status = 'aborted'; },
    // D18: a reason string while the current step wants real time (feed it to the warp as `imminent`)
    get warpHold() { const st = def.steps[M.i]; if (M.status !== 'running' || !st?.warpHold) return false; return typeof st.warpHold === 'function' ? st.warpHold(ctx) || false : st.warpHold; },
    // the briefing card freezes the world until "Fly" is pressed
    get holdSim() { return M.status === 'running' && M.briefing; },
    get target() { return M.status === 'running' ? target() : null; },
    get status() { return M.status; },
    get step() { return def.steps[M.i]?.id || null; },
    get id() { return def.id; },
    get state() { return { mission: def.id, status: M.status, briefing: M.briefing, marks: M.route?.marks || null, step: def.steps[M.i]?.id || null, index: M.i, t: +M.t.toFixed(1), stepT: +M.stepT.toFixed(1), coach: coachTxt.textContent, goal: goalText(), ticks: [...M.ticks], coachRect: coach.hidden ? null : coach.getBoundingClientRect().toJSON(), result: M.result, log: M.log.slice(-60), stepsSeen: M.log.filter((l) => l.type === 'step').map((l) => l.id), diff, flag: Object.fromEntries(Object.entries(M.mflag).filter(([, v]) => v == null || typeof v !== 'object')), race: M.mflag.race ? { ...M.mflag.race } : null }; },
    dispose() { this.abort(); },
  };
}
