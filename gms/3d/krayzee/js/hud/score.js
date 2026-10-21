// Royal Privilege HUD: pending/banked widget + combo ring, PP popups, banked toast, rank-up ceremony, Herald card.
// Driven by createGame events (docs/SCORE.md); never touches flight input (pointer-events: none throughout).
import { RANKS } from '../../data/ranks.js';
import { AIRCRAFT } from '../../data/aircraft.js';
import * as sfx from './sound.js';

const safeTitle = (g) => { try { return g.title?.(); } catch (e) { return ''; } };
const fmt = (n) => Math.round(n).toLocaleString('en-GB');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const DIGITS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Niner'];
const CROWN = '<svg viewBox="0 0 64 44" aria-hidden="true"><path class="krz-crown-p" d="M6 38 L2 10 L18 22 L32 4 L46 22 L62 10 L58 38 Z"/><path class="krz-crown-b" d="M6 38 H58"/><circle cx="2" cy="10" r="3"/><circle cx="32" cy="4" r="3.4"/><circle cx="62" cy="10" r="3"/><circle class="krz-crown-gem" cx="32" cy="27" r="3.2"/></svg>';
const COIN = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 15 L2 6 L7 10 L10 4 L13 10 L18 6 L17 15 Z" fill="currentColor"/></svg>';

function unlockLabel(id) {
  if (AIRCRAFT[id]) return `${AIRCRAFT[id].name}${AIRCRAFT[id].status === 'ready' ? '' : ' (soon)'}`;
  if (id.startsWith('livery_')) return `${id.slice(7)[0].toUpperCase()}${id.slice(8)} livery`;
  return { host_ranked: 'Host ranked rooms', host_decree: 'Royal Decrees', bathtub_gold_taps: 'Gold bath taps' }[id] || id.replace(/_/g, ' ');
}

export function createScoreHUD(root, { headlines } = {}) {
  const el = document.createElement('div');
  el.className = 'krz-score';
  el.hidden = true;
  el.innerHTML = `
    <div class="krz-sc-main">
      <span class="krz-sc-ico">${COIN}</span>
      <b class="krz-sc-num">0</b><small class="krz-sc-pp">PP</small>
      <span class="krz-sc-combo" hidden><i>×1</i></span>
    </div>
    <div class="krz-sc-sub"><span class="krz-sc-hint">BREAK A RULE</span></div>
    <div class="krz-sc-bar" title="Progress to the next title"><i></i></div>
    <span class="krz-sc-duck" hidden></span>`;
  const pops = document.createElement('div');
  pops.className = 'krz-pops';
  const stage = document.createElement('div');
  stage.className = 'krz-stage';
  root.append(el, pops, stage);
  const $ = (s) => el.querySelector(s);
  const num = $('.krz-sc-num'), hint = $('.krz-sc-hint'), combo = $('.krz-sc-combo'), comboTxt = combo.querySelector('i');
  const bar = $('.krz-sc-bar i'), duck = $('.krz-sc-duck');

  const S = { game: null, off: [], shown: 0, target: 0, lastHint: '', lastBar: -1, ctx: {}, frozen: 0, cer: null, live: [] };

  function bump(cls = 'krz-bump') { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

  function popup(html, kind, secs = 1.7, fly = true) {
    const max = innerWidth < 520 || innerHeight < 520 ? 1 : 2;
    while (S.live.length >= max) retire(S.live[0], true);
    const p = document.createElement('div');
    p.className = `krz-pop krz-pop-${kind}`;
    p.innerHTML = html;
    pops.append(p);
    const rec = { p, fly, t: setTimeout(() => retire(rec), secs * 1000) };
    S.live.push(rec);
    requestAnimationFrame(() => p.classList.add('in'));
    return rec;
  }
  function retire(rec, fast) {
    const i = S.live.indexOf(rec);
    if (i < 0) return;
    S.live.splice(i, 1);
    clearTimeout(rec.t);
    const p = rec.p;
    if (rec.fly && !el.hidden && !fast) {
      const a = p.getBoundingClientRect(), b = num.getBoundingClientRect();
      p.style.setProperty('--dx', `${b.left + b.width / 2 - (a.left + a.width / 2)}px`);
      p.style.setProperty('--dy', `${b.top + b.height / 2 - (a.top + a.height / 2)}px`);
      p.classList.add('fly');
    } else p.classList.add('out');
    setTimeout(() => { p.remove(); if (rec.fly && !fast) { S.target = S.ctx.pending ?? S.target; bump(); } }, fast ? 200 : 520);
  }

  function multChips(parts = {}) {
    const out = [];
    if (parts.combo > 1) out.push(`COMBO ×${+parts.combo.toFixed(2)}`);
    if (parts.audacity > 1) out.push(`AUDACITY ×${+parts.audacity.toFixed(2)}`);
    if (parts.heat > 1.04) out.push(`HEAT ×${+parts.heat.toFixed(2)}`);
    if (parts.scale > 1) out.push(`DECREE ×${+parts.scale.toFixed(2)}`);
    return out.map((t) => `<span>${t}</span>`).join('');
  }

  function onPP(e) {
    if (e.frozen) { popup(`<b class="krz-pop-name">${esc((e.name || '').toUpperCase())}</b><span class="krz-pop-amt">+0</span><em>The press are watching. Nothing counts.</em>`, 'frozen', 1.8, false); return; }
    if (!(e.amount > 0)) return;
    const name = (e.name || e.id || 'Privilege').toUpperCase();
    const mult = e.mult > 1.001 ? `<span class="krz-pop-mult">×${+e.mult.toFixed(2)}</span>` : '';
    const chips = multChips(e.parts);
    const flat = e.id === 'banter' || e.id === 'impeccable';
    popup(`<b class="krz-pop-name">${esc(name)}${flat ? '' : '!'}</b><span class="krz-pop-amt">+${fmt(e.amount)}</span>${mult}${chips ? `<div class="krz-pop-chips">${chips}</div>` : ''}`, flat ? 'flat' : 'pp', chips ? 2.1 : 1.7);
    sfx.playPP(Math.max(0, (e.combo ?? 1) > 1 ? Math.round((e.combo - 1) * 2) : 0));
  }
  function onLoss(e) {
    if (!(e.amount > 0)) return;
    const why = { bounce: 'DIGNITY LOST', prang: 'PRANG', scandal: 'SCANDAL', destroyed: 'WRITTEN OFF' }[e.reason] || 'LOST';
    popup(`<b class="krz-pop-name">${why}</b><span class="krz-pop-amt">−${fmt(e.amount)}</span>`, 'loss', 1.6, false);
    S.target = S.ctx.pending = e.pending ?? S.target;
    sfx.playLoss();
    bump('krz-shake');
  }
  function onBanked(e) {
    for (const r of [...S.live]) retire(r, true);
    popup(`<span class="krz-pop-k">BANKED</span><span class="krz-pop-amt">+${fmt(e.amount)}<small> PP</small></span><em>${e.atStand ? 'Safely at the stand. The treasury thanks you.' : 'Into the royal coffers.'}</em>`, 'bank', 2.6, false);
    S.target = 0;
    bump('krz-banked');
    sfx.playBanked(e.amount);
  }
  // D24: no full card in flight; the headline goes to the newspaper counter (headlines.js) and the reel after landing.
  function onScandal(e) {
    headlines?.onScandal(e);
    sfx.playScandal();
  }
  function onRankUp(e) {
    const g = S.ctx.gender === 'f' ? 'f' : 'm';
    const rank = e.rank || RANKS[e.to] || RANKS[0];
    const title = e.title || rank[g];
    const n = String(S.ctx.flightNo || 42);
    const callsign = `${title} ${DIGITS[+n[0]]}-${DIGITS[+n[1]]}`;
    const unlocks = (e.unlocks || rank.unlocks || []).map(unlockLabel);
    S.cer?.remove();
    const c = document.createElement('div');
    c.className = 'krz-cer';
    c.innerHTML = `<div class="krz-cer-glow"></div><div class="krz-cer-crown">${CROWN}</div><div class="krz-cer-k">BY ROYAL DECREE</div>
      <div class="krz-cer-title">${esc(title)}${S.ctx.name ? ` <i>${esc(S.ctx.name)}</i>` : ''}</div>
      <div class="krz-cer-cs">The tower now calls you <b>${esc(callsign)}</b></div>
      ${unlocks.length ? `<div class="krz-cer-un">${unlocks.map((u) => `<span>${esc(u)}</span>`).join('')}</div>` : ''}`;
    stage.append(c);
    S.cer = c;
    root.classList.add('has-cer');
    document.documentElement.classList.add('krz-cer-on');
    requestAnimationFrame(() => c.classList.add('in'));
    setTimeout(() => { c.classList.add('out'); setTimeout(() => { c.remove(); if (S.cer === c) { S.cer = null; root.classList.remove('has-cer'); document.documentElement.classList.remove('krz-cer-on'); } }, 700); }, 5200);
    sfx.playFanfare();
    S.lastBar = -1;
  }
  function onFinished(e) {
    for (const r of [...S.live]) retire(r, true);
    popup(`<span class="krz-pop-k">FLIGHT COMPLETE</span><span class="krz-pop-amt">+${fmt(e.amount || 0)}<small> PP BANKED</small></span><em>${e.amount > 0 ? 'Demanded, and duly granted.' : 'A blameless flight. How dull.'}</em>`, 'bank', 3, false);
    S.target = 0;
    bump('krz-banked');
    if (!(e.amount > 0)) sfx.playPP(0);
  }
  function onProtection(e) {
    if (e.mode !== 'partial') return;
    duck.hidden = false;
    duck.textContent = e.effective === 'realistic' ? 'REAL METAL' : `RUBBER ${Math.round(e.pct)}%`;
    duck.dataset.state = e.effective === 'realistic' ? 'gone' : e.pct < 35 ? 'low' : 'ok';
  }
  function onDestroyed(e) {
    popup(`<b class="krz-pop-name">WRITTEN OFF</b><em>${e.pendingLost > 0 ? `${fmt(e.pendingLost)} PP went down with her` : 'Parachute deployed. Dignity did not.'}</em>`, 'loss', 3, false);
  }

  const api = {
    el,
    attach(game, ctx = {}) {
      api.detach();
      S.game = game;
      S.ctx = { ...ctx };
      S.shown = S.target = 0;
      const on = (t, f) => { const u = game.on(t, (e) => { try { f(e || {}); } catch (err) { console.warn('[hud]', err); } }); if (u) S.off.push(u); };
      on('pp', onPP); on('loss', onLoss); on('banked', onBanked); on('scandal', onScandal); on('rankUp', onRankUp);
      on('protection', onProtection); on('finished', onFinished); on('destroyed', onDestroyed);
      if (headlines) { on('pp', (e) => headlines.onPP(e)); headlines.reset(); headlines.setContext({ name: ctx.name, title: safeTitle(game) }); on('rankUp', () => headlines.setContext({ title: safeTitle(game) })); }
      const st = game.state?.() || {};
      duck.hidden = st.protectionMode !== 'partial';
      if (!duck.hidden) onProtection({ mode: 'partial', pct: st.protection, effective: st.effectiveProtection });
    },
    detach() {
      for (const u of S.off.splice(0)) try { u(); } catch (e) { /* */ }
      S.game = null;
      for (const r of [...S.live]) retire(r, true);
      S.cer?.remove(); S.cer = null; root.classList.remove('has-cer'); document.documentElement.classList.remove('krz-cer-on');
    },
    setContext(ctx) { Object.assign(S.ctx, ctx); },
    announce(title, sub) { popup(`<span class="krz-pop-k">${esc(title)}</span>${sub ? `<em>${esc(sub)}</em>` : ''}`, 'bank', 2.2, false); },
    setVisible(v) { el.hidden = !v; pops.hidden = !v; stage.hidden = !v; },
    // flight = { airborne, gsKt } from the player's aircraft
    update(dt, flight = {}) {
      const g = S.game;
      if (!g || el.hidden) return;
      const st = g.state();
      S.ctx.pending = st.pending;
      if (!S.live.some((r) => r.fly)) S.target = st.pending;
      if (S.shown !== S.target) {
        const d = S.target - S.shown;
        S.shown = Math.abs(d) < 1 ? S.target : S.shown + d * Math.min(1, dt * 7) + Math.sign(d) * Math.min(Math.abs(d), dt * 60);
        num.textContent = fmt(S.shown);
      }
      el.dataset.frozen = st.frozen > 0 ? '1' : '';
      el.dataset.pending = st.pending > 0 ? '1' : '';
      let h;
      if (st.frozen > 0) h = `SCANDAL · ${Math.ceil(st.frozen)}s`;
      else if (st.pending > 0) h = flight.airborne ? 'LAND & STOP TO BANK' : st.finishReady ? 'DEMAND IT TO BANK' : st.landed ? 'STOP TO BANK' : 'LAND TO BANK IT';
      else if (st.banked > 0) h = `BANKED ${fmt(st.banked)}`;
      else h = 'BREAK A RULE';
      if (h !== S.lastHint) { S.lastHint = h; hint.textContent = h; }
      const on = st.combo > 1 && st.comboLeft > 0;
      if (combo.hidden === on) combo.hidden = !on;
      if (on) {
        combo.style.setProperty('--f', st.comboFrac.toFixed(3));
        const t = `×${+st.combo.toFixed(2)}`;
        if (comboTxt.textContent !== t) { comboTxt.textContent = t; combo.classList.remove('krz-bump'); void combo.offsetWidth; combo.classList.add('krz-bump'); }
      }
      const goal = st.nextGoal, life = st.lifetimePP ?? 0;
      let frac = 1;
      if (goal?.rank) {
        const cur = RANKS[st.careerRankIndex ?? 0]?.minPP ?? 0;
        frac = Math.max(0, Math.min(1, (life - cur) / Math.max(1, goal.rank.minPP - cur)));
      }
      const fb = Math.round(frac * 200);
      if (fb !== S.lastBar) { S.lastBar = fb; bar.style.width = `${fb / 2}%`; }
    },
    get state() { return { shown: Math.round(S.shown), hint: S.lastHint, popups: S.live.length, ceremony: !!S.cer, attached: !!S.game }; },
  };
  return api;
}
