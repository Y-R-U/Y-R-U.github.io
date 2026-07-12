// LONGSHOT — DOM: screens, menus, briefing, results, HUD, popups.
// House rule: styled popups, never alert()/confirm().

import { STORY, ACT_NAMES, RANGE_DEF } from './story.js';
import { SCORE } from './config.js';
import { save, persist, wipe } from './save.js';
import { dailyDef, weeklyDef, endlessDef, dailyState } from './events.js';
import { renderArmory, renderLoadout } from './shop.js';
import { $, el, fmt$, fmtM, fmtTime, weekKey } from './utils.js';
import * as audio from './audio.js';

const SCREENS = ['title', 'campaign', 'contracts', 'armory', 'briefing', 'results'];

export class UI {
  constructor(hooks) {
    this.h = hooks;      // { startMission(def), onMenus(), abortMission(), applyQuality() }
    this.briefDef = null;
    this._bind();
  }

  show(id) {
    for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id);
    if (id) audio.ui();
  }
  hideAll() { this.show(null); }

  _bind() {
    $('bt-campaign').onclick = () => this.renderCampaign();
    $('bt-contracts').onclick = () => this.renderContracts();
    $('bt-armory').onclick = () => this.renderArmoryScreen();
    $('bt-range').onclick = () => this.renderBriefing(RANGE_DEF);
    $('bt-settings').onclick = () => this.settingsPopup(false);
    document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => this.renderTitle());
    $('arm-tabs').querySelectorAll('.tab').forEach(t => t.onclick = () => {
      $('arm-tabs').querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
      renderArmory($('arm-list'), t.dataset.tab, () => this.refreshCash());
      audio.ui();
    });
    $('br-insert').onclick = () => {
      if (this.briefDef) this.h.startMission(this.briefDef);
    };
    $('btn-pause').onclick = () => {};   // wired via controls
  }

  refreshCash() {
    for (const id of ['camp-cash', 'con-cash', 'arm-cash']) $(id).textContent = fmt$(save.cash);
    const tab = $('arm-tabs').querySelector('.tab.on');
    if (!$('armory').classList.contains('hidden') && tab) renderArmory($('arm-list'), tab.dataset.tab, () => this.refreshCash());
  }

  // ── title ──────────────────────────────────────────────────────────────────
  renderTitle() {
    this.show('title');
    const done = Object.values(save.missions).filter(m => m.done).length;
    $('t-stats').innerHTML = `
      <div><b>${fmt$(save.cash)}</b>CASH</div>
      <div><b>${done}/${STORY.length}</b>CONTRACTS</div>
      <div><b>${save.stats.longest ? fmtM(save.stats.longest) : '—'}</b>LONGEST KILL</div>
      <div><b>${save.stats.heads}</b>HEADSHOTS</div>`;
  }

  // ── campaign ───────────────────────────────────────────────────────────────
  renderCampaign() {
    this.show('campaign');
    $('camp-cash').textContent = fmt$(save.cash);
    const list = $('camp-list');
    list.innerHTML = '';
    let act = 0;
    STORY.forEach((def, i) => {
      if (def.act !== act) {
        act = def.act;
        const cleared = STORY.filter(d => d.act === act && save.missions[d.id]?.done).length;
        const total = STORY.filter(d => d.act === act).length;
        list.append(el('div', 'act-h', `${ACT_NAMES[act]}<small>${cleared}/${total}</small>`));
      }
      const rec = save.missions[def.id];
      const locked = i > save.storyAt;
      const card = el('div', 'mcard' + (locked ? ' locked' : '') + (rec?.done ? ' done' : ''));
      card.append(el('div', 'mnum', locked ? '🔒' : String(i + 1).padStart(2, '0')));
      const info = el('div', 'minfo');
      info.append(el('div', 'mname', def.name));
      info.append(el('div', 'mdesc', locked ? 'Complete the previous contract' : def.tagline));
      card.append(info);
      const medal = rec?.medal;
      card.append(el('div', 'mmedal ' + (medal ? 'medal-' + medal : 'medal-none'), medal ? '●' : '○'));
      if (!locked) card.onclick = () => this.renderBriefing(def);
      list.append(card);
    });
  }

  // ── contracts ──────────────────────────────────────────────────────────────
  renderContracts() {
    this.show('contracts');
    $('con-cash').textContent = fmt$(save.cash);
    const list = $('con-list');
    list.innerHTML = '';
    const ds = dailyState();
    const mk = (def, bestTxt, cta) => {
      const c = el('div', 'ccard');
      c.append(el('h3', null, def.name));
      c.append(el('div', 'cdesc', def.tagline + ' — ' + def.brief.slice(0, 90) + '…'));
      c.append(el('div', 'cbest', bestTxt));
      const b = el('button', 'mbtn prime', cta);
      b.onclick = () => this.renderBriefing(def);
      c.append(b);
      list.append(c);
    };
    mk(dailyDef(),
      `Streak <b>${ds.streak}🔥</b> · today ${ds.done ? `done — best <b>${ds.score}</b>` : '<b>open</b>'}`,
      ds.done ? 'IMPROVE SCORE' : 'TAKE THE CONTRACT');
    const wkBest = save.weekly.week === weekKey() ? save.weekly.score : 0;
    mk(weeklyDef(), `This week's best <b>${wkBest}</b>`, 'RUN THE GAUNTLET');
    mk(endlessDef(), `All-time best <b>${save.endless.best}</b>`, 'ENTER THE NEST');
  }

  // ── armory ─────────────────────────────────────────────────────────────────
  renderArmoryScreen() {
    this.show('armory');
    $('arm-cash').textContent = fmt$(save.cash);
    const tab = $('arm-tabs').querySelector('.tab.on') || $('arm-tabs').querySelector('.tab');
    renderArmory($('arm-list'), tab.dataset.tab, () => this.refreshCash());
  }

  // ── briefing ───────────────────────────────────────────────────────────────
  renderBriefing(def) {
    this.briefDef = def;
    this.show('briefing');
    $('br-title').textContent = def.name;
    $('br-pay').textContent = def.pay ? fmt$(def.pay) : 'PRACTICE';
    $('br-fixer').innerHTML = def.brief;
    const intel = $('br-intel');
    intel.innerHTML = '';
    (def.intel || []).forEach(t => intel.append(el('div', 'intel-chip', t)));
    const conds = $('br-conditions');
    conds.innerHTML = '';
    const wind = def.wind || [0, 0];
    const windTxt = wind[1] === 0 ? 'CALM' : `${wind[0]}–${wind[1]} m/s${def.gusts ? ' GUSTS' : ''}`;
    const timeIcon = { day: '☀ DAY', dusk: '🌆 DUSK', night: '🌙 NIGHT', rain: '🌧 RAIN' }[def.time] || def.time;
    const cs = [
      [fmtM(def.vantage?.dist || 250), 'RANGE'],
      [windTxt, 'WIND'],
      [timeIcon, 'LIGHT'],
      [def.timeLimit ? fmtTime(def.timeLimit) : '—', 'CLOCK'],
    ];
    for (const [v, l] of cs) {
      const c = el('div', 'cond');
      c.append(el('div', 'cv', v), el('div', 'cl', l));
      conds.append(c);
    }
    const objs = $('br-objectives');
    objs.innerHTML = '';
    const prim = def.special === 'range' ? 'Ring all three steel plates'
      : def.special === 'protect' ? 'The informant crosses the plaza alive'
      : def.special === 'endless' ? 'Bank score until three marks escape'
      : def.special === 'countersniper' ? 'Kill the enemy marksman before his third shot'
      : def.special === 'convoy' ? 'Stop the sedan, then eliminate the courier'
      : (def.setup?.targets?.length || 1) > 1 ? `Eliminate all ${def.setup.targets.length} targets`
      : 'Eliminate the target';
    objs.append(el('div', 'obj-line', `<span class="od">◆</span> ${prim}`));
    objs.append(el('div', 'obj-line bonus', `<span class="od">◇</span> Bonus: headshots, distance, no misses, ghost (no panic)`));
    const rec = save.missions[def.id];
    if (rec?.score) objs.append(el('div', 'obj-line bonus', `<span class="od">★</span> Best score: ${rec.score} · Gold at ${Math.round((def.par || 3000) * SCORE.medals.gold)}`));
    renderLoadout($('br-loadout'), () => this.renderBriefing(def));
  }

  // ── results ────────────────────────────────────────────────────────────────
  renderResults(result, rewards, onRetry, onContinue) {
    this.show('results');
    const v = $('res-verdict');
    v.textContent = result.won ? 'CONTRACT COMPLETE' : 'CONTRACT FAILED';
    v.className = result.won ? 'ok' : 'fail';
    const medal = $('res-medal');
    if (result.won && rewards.medal) {
      const icon = { gold: '🥇', silver: '🥈', bronze: '🥉' }[rewards.medal];
      medal.innerHTML = `${icon}<small>${rewards.medal.toUpperCase()}</small>`;
    } else if (!result.won) {
      medal.innerHTML = `<small style="color:var(--red)">${result.reason || ''}</small>`;
    } else medal.innerHTML = '';
    const lines = $('res-lines');
    lines.innerHTML = '';
    for (const [label, val] of result.lines) {
      const row = el('div', 'res-line' + (typeof val !== 'number' ? ' dim' : ''));
      row.append(el('span', null, label), el('span', null, String(val)));
      lines.append(row);
    }
    const acc = result.shots ? Math.round(result.hits / result.shots * 100) : 0;
    const r2 = el('div', 'res-line dim');
    r2.append(el('span', null, `Accuracy ${result.hits}/${result.shots}`), el('span', null, acc + '%'));
    lines.append(r2);
    if (rewards.cash) {
      const r3 = el('div', 'res-line');
      r3.append(el('span', null, 'Payout' + (rewards.firstClear ? ' (+first clear)' : '')), el('span', null, fmt$(rewards.cash)));
      lines.append(r3);
    }
    $('res-total').textContent = 'SCORE ' + result.score;
    $('res-retry').onclick = onRetry;
    $('res-next').onclick = onContinue;
    if (result.won) audio.medalSting();
  }

  // ── HUD ────────────────────────────────────────────────────────────────────
  hudShow(on) {
    $('hud').classList.toggle('hidden', !on);
    if (on) {
      for (const id of ['btn-fire', 'btn-breath']) $(id).classList.remove('hidden');
    } else {
      $('fixer').classList.add('hidden');
      $('scope').classList.add('hidden');
      if (this.hud) { this.hud.setTimer(null); this.hud.setDist(null); }
    }
  }

  makeHud() {
    let toastN = 0;
    const hud = {
      setObjective: (t, s) => { $('obj-title').textContent = t; $('obj-sub').textContent = s; },
      toast: (txt, cls = '') => {
        if (toastN > 3) return;
        toastN++;
        const t = el('div', 'toast ' + cls, txt);
        $('toasts').append(t);
        setTimeout(() => { t.remove(); toastN--; }, 2600);
      },
      setWind: (dir, speed, precise) => {
        hud._precise = precise;
        hud.setWindLive(dir, speed);
      },
      setWindLive: (relDir, speed) => {
        // arrow shows where the wind pushes the round, relative to the view
        $('wind-arrow').style.transform = `rotate(${Math.round(-90 + relDir * 180 / Math.PI)}deg)`;
        $('wind-val').textContent = speed < 0.3 ? 'CALM'
          : hud._precise ? speed.toFixed(1) + ' m/s'
          : speed < 2 ? 'LIGHT' : speed < 4.5 ? 'MODERATE' : 'STRONG';
      },
      setTimer: (t) => {
        const e = $('mtimer');
        if (t === null || t === undefined) { e.classList.add('hidden'); return; }
        e.classList.remove('hidden');
        e.textContent = fmtTime(t);
        e.classList.toggle('low', t < 10);
      },
      setAmmo: (n, mag) => {
        const w = $('ammo-wrap');
        w.innerHTML = '';
        for (let i = 0; i < mag; i++) w.append(el('div', 'ammo-pip' + (i < n ? '' : ' spent')));
      },
      setBreath: (f, winded) => {
        $('breath-fill').style.height = Math.round(f * 100) + '%';
        $('breath-wrap').classList.toggle('low', winded || f < 0.25);
      },
      showHitmarker: (head) => {
        const h = $('hitmark');
        h.classList.remove('hidden');
        h.classList.toggle('head', !!head);
        h.style.animation = 'none';
        void h.offsetWidth;
        h.style.animation = '';
        setTimeout(() => h.classList.add('hidden'), 360);
      },
      setDist: (txt) => {
        const e = $('dist-chip');
        if (!txt) { e.classList.add('hidden'); return; }
        e.classList.remove('hidden');
        e.textContent = txt;
      },
      setExposure: (f) => {
        const w = $('exposure-wrap');
        if (f === null || f === undefined) { w.classList.add('hidden'); return; }
        w.classList.remove('hidden');
        $('exposure-fill').style.width = Math.round(f * 100) + '%';
      },
      fixerSay: (txt) => {
        $('fixer-text').textContent = txt;
        $('fixer').classList.remove('hidden');
        clearTimeout(hud._fx);
        hud._fx = setTimeout(() => $('fixer').classList.add('hidden'), 4200);
      },
      setBcam: (on) => {
        for (const id of ['btn-fire', 'btn-scope', 'btn-breath', 'btn-mark', 'zoom-wrap', 'breath-wrap'])
          $(id).classList.toggle('hidden', on);
        $('scope').classList.toggle('hidden', on || !this._scoped);
      },
      flashVignette: () => {
        $('vign').style.opacity = 1;
        setTimeout(() => { $('vign').style.opacity = 0; }, 420);
      },
      setScopedUI: (on) => {
        this._scoped = on;
        $('zoom-wrap').classList.toggle('hidden', !on);
        $('btn-fire').classList.remove('hidden');
      },
      setZoomLabel: (z) => { $('zoom-val').textContent = Math.round(z) + '×'; },
    };
    this.hud = hud;
    return hud;
  }

  // ── popups ─────────────────────────────────────────────────────────────────
  popup(title, bodyHTML, buttons) {
    $('pop-title').textContent = title;
    $('pop-body').innerHTML = bodyHTML;
    const bb = $('pop-btns');
    bb.innerHTML = '';
    for (const b of buttons) {
      const btn = el('button', 'mbtn' + (b.prime ? ' prime' : ''), b.label);
      btn.onclick = () => { $('popup').classList.add('hidden'); b.fn && b.fn(); };
      bb.append(btn);
    }
    $('popup').classList.remove('hidden');
    return $('pop-body');
  }

  settingsPopup(inMission) {
    const s = save.settings;
    const body = this.popup('SETTINGS', `
      <label>Look sensitivity <input id="set-sens" type="range" min="30" max="200" value="${Math.round(s.sens * 100)}"></label>
      <label>Invert Y <input id="set-inv" type="checkbox" ${s.invertY ? 'checked' : ''}></label>
      <label>Target markers <input id="set-mk" type="checkbox" ${s.markers !== false ? 'checked' : ''}></label>
      <label>Quality <select id="set-q"><option value="high" ${s.quality === 'high' ? 'selected' : ''}>High</option><option value="lite" ${s.quality === 'lite' ? 'selected' : ''}>Lite</option></select></label>
      <label>Sound FX <input id="set-sfx" type="checkbox" ${s.sfx ? 'checked' : ''}></label>
      <label>Music <input id="set-mus" type="checkbox" ${s.music ? 'checked' : ''}></label>
      ${inMission ? '' : '<label>Reset save <button id="set-wipe" class="ibtn" style="width:auto;padding:6px 14px;margin:0">WIPE</button></label>'}
    `, inMission ? [
      { label: 'ABANDON', fn: () => this.h.abortMission() },
      { label: 'RESUME', prime: true, fn: () => this.h.resumeMission() },
    ] : [
      { label: 'DONE', prime: true },
    ]);
    body.querySelector('#set-sens').oninput = (e) => { s.sens = e.target.value / 100; persist(); };
    body.querySelector('#set-inv').onchange = (e) => { s.invertY = e.target.checked; persist(); };
    body.querySelector('#set-mk').onchange = (e) => { s.markers = e.target.checked; persist(); };
    body.querySelector('#set-q').onchange = (e) => { s.quality = e.target.value; persist(); this.h.applyQuality(); };
    body.querySelector('#set-sfx').onchange = (e) => { s.sfx = e.target.checked; persist(); audio.applySettings(); };
    body.querySelector('#set-mus').onchange = (e) => { s.music = e.target.checked; persist(); audio.applySettings(); };
    const wipeBtn = body.querySelector('#set-wipe');
    if (wipeBtn) wipeBtn.onclick = () => {
      this.popup('RESET SAVE', 'Wipe all progress, cash and unlocks? This cannot be undone.', [
        { label: 'CANCEL' },
        { label: 'WIPE IT', prime: true, fn: () => wipe() },
      ]);
    };
  }
}
