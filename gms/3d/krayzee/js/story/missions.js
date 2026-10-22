// Mission framework (D17): ordered steps with one coach line each, triggers on flight/ATC/score/radio state,
// a target marker (ASSIST's markers), success/fail and a reward card. Data: data/story/mission*.js. Wiring: docs/STORY.md.
import { createMarkers } from '../assist/markers.js';
import { createLandButton } from '../assist/landbutton.js';
import { DIFFICULTY } from '../../data/rules.js';
import { RANKS } from '../../data/ranks.js';
import { CONTROLLERS } from '../../data/story.js';
import { ensureStoryCss, el, esc, isTouch, loadProgress, saveProgress } from './dom.js';

const COACH_AVOID = ['#krz-hud', '.krz-r-subs', '.krz-score', '.krz-r-tower', '.krz-cer', '.krz-herald'];

/**
 * def: data/story/mission1.js shape. o: { host (js/story/host.js), camera, difficulty?, parent?,
 *   setTarget?(t|null)   — host draws the target itself (else the mission owns an ASSIST markers canvas),
 *   onComplete?(result), onFail?(result), onExit?(result), log?(type, data) }
 */
export function createMission(def, o) {
  ensureStoryCss();
  const host = o.host;
  const diff = o.difficulty || host.difficulty();
  const parent = o.parent || document.body;
  const M = { status: 'idle', i: -1, t: 0, stepT: 0, events: [], flag: {}, route: null, result: null, log: [], pendingNext: -1, crashed: false, laps: 0 };
  const off = [];
  const touch = isTouch();
  const log = (type, d = {}) => { M.log.push({ t: +M.t.toFixed(1), type, ...d }); try { o.log?.('story.' + type, d); } catch (e) { /* */ } };

  const coach = el('div', 'krz-st-coach', '<span class="krz-st-n"></span><span class="krz-st-txt"></span>');
  coach.hidden = true;
  const coachN = coach.querySelector('.krz-st-n'), coachTxt = coach.querySelector('.krz-st-txt');
  const titleCard = el('div', 'krz-st-title', `<small>Mission ${def.id}</small><b>${esc(def.title)}</b><i>${esc(def.subtitle || '')}</i>`);
  let markers = null, landBtn = null, demandBtn = null, fbBox = null;

  const ctx = {
    get s() { return M.s; }, host, diff, touch, flag: M.flag,
    get stepT() { return M.stepT; }, get t() { return M.t; }, get route() { return M.route; },
    since(type, pred) { let n = 0; for (const e of M.events) if (e.step === M.i && e.type === type && (!pred || pred(e.data))) n++; return n; },
    count(type, pred) { return M.events.filter((e) => e.type === type && (!pred || pred(e.data))).length; },
    setCoach: (html) => setCoach(html, true),
    showLandButton, showDemandButton,
  };

  function setCoach(html, nudge) {
    coachTxt.innerHTML = html;
    coachN.textContent = `${M.i + 1}/${def.steps.length}`;
    coach.hidden = false;
    coach.classList.remove('done', 'nudge');
    void coach.offsetWidth;
    coach.classList.add('in');
    if (nudge) coach.classList.add('nudge');
    placeCoach(true);
  }

  // Layout reads are rare (step change, resize, ~1.5 s) and batched before the one write, which only happens on change.
  let placeT = 0, lastTop = -1;
  const onResize = () => { placeT = 0; };
  addEventListener('resize', onResize);
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
    if (!force && --placeT > 0) return;
    placeT = 90;
    if (coach.hidden) { setSubsTop(''); return; }
    const W = innerWidth, H = innerHeight, port = H > W;
    // Landscape: the top-left corner beside the HUD strip when it is wide enough (centre-top sits on the plane's wing).
    const hud = document.querySelector('#krz-hud .krz-hud-strip') || document.getElementById('krz-hud');
    const room = !port && hud ? Math.floor(hud.getBoundingClientRect().left - 20) : 0;
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
    setCoach(typeof st.coach === 'function' ? st.coach(ctx) : st.coach, false);
  }

  function start() {
    const end = host.activeEnd();
    M.route = def.route(end, diff);
    const stand = host.placeAtStand(def.start.stand, def.start.heading);
    host.setRoute(M.route, 0);
    const tw = CONTROLLERS[def.tower]; if (tw) host.setTowerVoice(tw.voice);
    for (const type of ['pp', 'finished', 'banked', 'scandal', 'barked', 'window']) off.push(host.on(type, (data) => onEvent(type, data)));
    parent.append(coach, titleCard);
    requestAnimationFrame(() => titleCard.classList.add('in'));
    setTimeout(() => { titleCard.classList.remove('in'); setTimeout(() => titleCard.remove(), 900); }, 3600);
    addEventListener('resize', onResize);
    M.status = 'running'; M.t = 0;
    log('start', { mission: def.id, diff, end, stand });
    enterStep(0);
  }

  function onEvent(type, data = {}) {
    if (M.status !== 'running') return;
    M.events.push({ step: M.i, type, data, t: M.t });
    log('event', { type, id: data.id, amount: data.amount });
    if (type === 'scandal' && DIFFICULTY[diff]?.scandalFails === 'always') fail('Royal Scandal. The Palace has been informed.');
  }

  function update(dt) {
    if (M.status !== 'running') return;
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
      if (s.onGround && !cur?.noRelaunch) { host.setRoute(M.route, 2); M.resumeLeg = cur?.resumeLeg ? cur.resumeLeg(ctx) : null; }
      setCoach('Bounced. impossiRubber, darling. The autopilot takes you round again.', true);
      M.recoach = 4;
    }
    if (M.resumeLeg != null && !s.onGround && s.agl > 60) { host.setRoute(M.route, M.resumeLeg); M.resumeLeg = null; }
    if (M.recoach > 0 && (M.recoach -= dt) <= 0 && def.steps[M.i]) { const c = def.steps[M.i].coach; setCoach(typeof c === 'function' ? c(ctx) : c, false); }
    const st = def.steps[M.i];
    if (M.pendingNext >= 0) {
      if ((M.pendingT -= dt) <= 0) { const n = M.pendingNext; M.pendingNext = -1; enterStep(n); }
    } else if (st) {
      try { st.update?.(ctx, dt); } catch (e) { console.warn('[story] update', st.id, e); }
      if (st.hint && !M.hinted && M.stepT > st.hint.after) { M.hinted = true; setCoach(st.hint.text(ctx), true); }
      let ok = false;
      try { ok = !!st.done(ctx); } catch (e) { console.warn('[story] done', st.id, e); }
      if (ok && M.status === 'running') {
        log('stepDone', { id: st.id, secs: +M.stepT.toFixed(1) });
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
    const fin = [...M.events].reverse().find((e) => e.type === 'finished');
    const sortie = fin?.data?.amount || 0;
    const mult = DIFFICULTY[diff]?.targetMult || 1;
    const bonus = Math.round((def.reward?.pp || 0) * mult / 10) * 10;
    const c = host.career();
    const before = c ? c.rankIndex : null;
    try { c?.addPP(bonus, {}); } catch (e) { console.warn('[story] reward', e); }
    const crimes = M.events.filter((e) => e.type === 'pp' && e.data.id && !['banter', 'impeccable'].includes(e.data.id)).length;
    const P = loadProgress();
    const prev = P.missions[def.id] || {};
    P.missions[def.id] = { done: true, diff, best: Math.max(prev.best || 0, sortie + bonus), at: Date.now(), plays: (prev.plays || 0) + 1 };
    saveProgress(P);
    const rank = rankInfo();
    M.result = { ok: true, mission: def.id, diff, sortie, bonus, crimes, secs: Math.round(M.t), rank, rankUp: c && before != null && c.rankIndex > before };
    log('complete', M.result);
    teardownHud();
    setTimeout(() => afterHerald(() => card(true)), 700);
    try { o.onComplete?.(M.result); } catch (e) { console.error(e); }
  }

  function fail(reason) {
    if (M.status !== 'running') return;
    M.status = 'failed';
    M.result = { ok: false, mission: def.id, diff, reason, step: def.steps[M.i]?.id };
    log('fail', M.result);
    teardownHud();
    card(false);
    try { o.onFail?.(M.result); } catch (e) { console.error(e); }
  }

  // the HUD's Krayzee Herald headlines play at the finish: let them run (or be skipped) before the reward card
  function afterHerald(fn, waited = 0) {
    const up = [...document.querySelectorAll('.krz-herald')].some((e) => !e.hidden && !e.closest('[hidden]') && e.getClientRects().length);
    if (up && waited < 30000 && M.status === 'complete') { setTimeout(() => afterHerald(fn, waited + 300), 300); return; }
    if (M.status === 'complete') fn();
  }

  let cardEl = null;
  function card(ok) {
    const R = M.result;
    const rk = R.rank;
    const fmt = (n) => Math.round(n).toLocaleString('en-GB');
    const rows = ok ? `
      <div><span>Privilege banked this flight</span><b>${fmt(R.sortie)} PP</b></div>
      <div><span>${esc(def.reward?.label || 'Mission reward')}${R.diff !== 'medium' ? ` (${R.diff})` : ''}</span><b>+${fmt(R.bonus)} PP</b></div>
      <div><span>Rules broken</span><b>${R.crimes}</b></div>
      <div class="tot"><span>Total</span><b>${fmt(R.sortie + R.bonus)} PP</b></div>` : `<div><span>${esc(R.reason)}</span></div>`;
    const rankHtml = ok && rk ? `<div class="krz-st-rank"><div><b>${esc(rk.title)}</b>${rk.next ? ` · ${fmt(rk.need)} PP to ${esc(rk.next)}` : ''}</div><div class="bar"><i></i></div><div>${fmt(rk.lifetime)} PP lifetime</div></div>` : '';
    cardEl = el('div', 'krz-st-done', `<div class="krz-st-card" role="dialog" aria-label="${ok ? 'Mission complete' : 'Mission failed'}">
      <small class="k">Mission ${def.id} · ${ok ? 'Complete' : 'Failed'}</small><h2>${esc(def.title)}</h2>
      <h3>${ok ? (R.rankUp ? 'And a promotion, no less.' : 'The tower will need a lie down.') : 'The tower is quietly relieved.'}</h3>
      <div class="krz-st-rows">${rows}</div>${rankHtml}
      <div class="krz-st-btns">${ok ? '<button type="button" data-a="continue">Continue</button><button type="button" class="alt" data-a="retry">Fly it again</button>' : '<button type="button" data-a="retry">Try again</button><button type="button" class="alt" data-a="exit">Leave</button>'}</div></div>`);
    cardEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    cardEl.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a; if (!a) return;
      e.stopPropagation();
      closeCard();
      log('cardAction', { a });
      if (a === 'retry') restart();
      else try { o.onExit?.({ ...M.result, action: a }); } catch (err) { console.error(err); }
    });
    parent.appendChild(cardEl);
    requestAnimationFrame(() => { cardEl.classList.add('in'); const bar = cardEl.querySelector('.bar i'); if (bar && rk) bar.style.width = `${Math.round(rk.frac * 100)}%`; });
  }
  function closeCard() { if (cardEl) { cardEl.remove(); cardEl = null; } }

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
    teardownHud(); closeCard();
    M.status = 'idle'; M.i = -1; M.events = []; M.pendingNext = -1; M.crashed = false;
    start();
  }

  return {
    start, update, restart,
    event: onEvent,
    abort() { teardownHud(); closeCard(); coach.remove(); titleCard.remove(); M.status = 'aborted'; },
    // D18: a reason string while the current step wants real time (feed it to the warp as `imminent`)
    get warpHold() { const st = def.steps[M.i]; if (M.status !== 'running' || !st?.warpHold) return false; return typeof st.warpHold === 'function' ? st.warpHold(ctx) || false : st.warpHold; },
    get target() { return M.status === 'running' ? target() : null; },
    get status() { return M.status; },
    get step() { return def.steps[M.i]?.id || null; },
    get state() { return { status: M.status, step: def.steps[M.i]?.id || null, index: M.i, t: +M.t.toFixed(1), stepT: +M.stepT.toFixed(1), coach: coachTxt.textContent, coachRect: coach.hidden ? null : coach.getBoundingClientRect().toJSON(), result: M.result, log: M.log.slice(-60), diff }; },
    dispose() { this.abort(); },
  };
}
