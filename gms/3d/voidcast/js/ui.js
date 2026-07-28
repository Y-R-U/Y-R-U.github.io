// ui.js — every screen, modal and list. Nothing here touches three.js; it
// talks to the rest of the game through the callbacks in `hooks`.

import { S, save, wipe } from './save.js';
import { PERM, permLevel, permCost, buy, BOONS } from './upgrades.js';
import { LEVELS, ACTS, level, objectiveText, typeLabel, cutsceneBefore } from './story.js';
import { SKINS, skin } from './palettes.js';
import { rankForScore, rankTitle, rankPercent, neighbours, fmtRank, nextMilestone, START_RANK } from './ranking.js';
import { currentEvent, nextEvent, timeLeft, fmtCountdown, milestones, eventRecord } from './events.js';
import { fmt, fmtFull, fmtTime, clamp } from './utils.js';
import * as A from './audio.js';

const $ = (s) => document.querySelector(s);

export class UI {
  constructor(hooks) {
    this.hooks = hooks;
    this.stack = [];
    this.current = null;
    this.screens = ['home', 'story', 'upgrades', 'skins', 'ladder', 'event', 'help', 'settings'];
    this._bind();
  }

  _bind() {
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { A.sfxUi(false); this.back(); }));
    document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { A.sfxUi(); this.go(b.dataset.go); }));
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { A.sfxUi(false); this.closeModal(b.dataset.close); }));

    $('#home-settings').addEventListener('click', () => { A.sfxUi(); this.go('settings'); });
    $('#home-story').addEventListener('click', () => { A.sfxUi(); this.go('story'); });
    $('#home-oneoff').addEventListener('click', () => { A.sfxUi(); this.hooks.startOneOff(); });
    $('#home-event').addEventListener('click', () => { A.sfxUi(); this.go('event'); });
    $('#story-replay').addEventListener('click', () => { A.sfxUi(); this.replayMenu(); });

    $('#set-wipe').addEventListener('click', () => this.confirmWipe());
    document.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.set;
      const s = S();
      s.settings[k] = !s.settings[k];
      save();
      if (k === 'sfx') A.setSfxEnabled(s.settings.sfx);
      if (k === 'music') A.setMusicEnabled(s.settings.music);
      this.renderSettings();
      A.sfxUi();
    }));
    document.querySelectorAll('#set-quality .chip').forEach((b) => b.addEventListener('click', () => {
      S().settings.quality = b.dataset.q; save(); this.renderSettings(); A.sfxUi();
      this.toast('Graphics setting applies to the next broadcast');
    }));

    $('#hud-pause').addEventListener('click', () => this.hooks.pause());
    $('#pause-resume').addEventListener('click', () => { A.sfxUi(); this.closeModal('pause'); this.hooks.resume(); });
    $('#pause-restart').addEventListener('click', () => { A.sfxUi(); this.closeModal('pause'); this.hooks.restart(); });
    $('#pause-quit').addEventListener('click', () => { A.sfxUi(false); this.closeModal('pause'); this.hooks.quit(); });
    $('#cs-skip').addEventListener('click', () => this.hooks.skipCutscene());
    $('#brief-go').addEventListener('click', () => { A.sfxUi(); this.closeModal('brief'); if (this._briefGo) this._briefGo(); });
  }

  // ── navigation ────────────────────────────────────────────────────────────

  go(id, replace) {
    if (this.current && !replace) this.stack.push(this.current);
    this.showOnly(id);
  }

  showOnly(id) {
    for (const s of this.screens) {
      const el = document.getElementById(s);
      if (el) el.classList.toggle('hidden', s !== id);
    }
    this.current = id;
    const r = this['render' + id[0].toUpperCase() + id.slice(1)];
    if (r) r.call(this);
    if (this.hooks.onScreen) this.hooks.onScreen(id);
  }

  back() {
    const prev = this.stack.pop() || 'home';
    this.showOnly(prev);
  }

  hideAll() {
    for (const s of this.screens) {
      const el = document.getElementById(s);
      if (el) el.classList.add('hidden');
    }
    this.current = null;
  }

  openModal(id) { document.getElementById(id).classList.remove('hidden'); }
  closeModal(id) { document.getElementById(id).classList.add('hidden'); }
  modalOpen(id) { return !document.getElementById(id).classList.contains('hidden'); }

  toast(text, cls) {
    const el = document.createElement('div');
    el.className = 'toast ' + (cls || '');
    el.textContent = text;
    $('#toast').appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 260); }, 2300);
  }

  // ── home ──────────────────────────────────────────────────────────────────

  renderHome() {
    const s = S();
    $('#home-subs').querySelector('span').textContent = fmt(s.subs);
    const rank = rankForScore(s.best.score);
    $('#home-rank').textContent = fmtRank(rank);
    const next = s.story.done ? null : level(clamp(s.story.unlocked, 1, 50));
    $('#home-storysub').textContent = s.story.done
      ? 'Complete — replay any contract'
      : `Contract ${next.id} — ${next.name}`;
    const ce = currentEvent();
    $('#home-eventname').textContent = ce.ev.name;
  }

  // ── story ─────────────────────────────────────────────────────────────────

  renderStory() {
    const s = S();
    const body = $('#story-body');
    body.innerHTML = '';
    for (const act of ACTS) {
      const wrap = document.createElement('div');
      wrap.className = 'act';
      const done = LEVELS.filter((l) => l.act === act.n && s.story.stars[l.id]).length;
      wrap.innerHTML = `<div class="act-head"><h3>${act.name}</h3><span>${done}/10 · ${act.sub}</span></div>`;
      const grid = document.createElement('div');
      grid.className = 'lv-grid';
      for (const lv of LEVELS.filter((l) => l.act === act.n)) {
        const stars = s.story.stars[lv.id] || 0;
        const locked = lv.id > s.story.unlocked;
        const b = document.createElement('button');
        b.className = 'lv no-drag' + (locked ? ' locked' : '') + (lv.type === 'boss' ? ' boss' : '') + (stars ? ' done' : '');
        b.innerHTML = `<u></u><div class="n">${locked ? '🔒' : String(lv.id).padStart(2, '0')}</div>
          <div class="nm">${locked ? 'LOCKED' : lv.name}</div>
          <div class="st">${locked ? '' : '★'.repeat(stars) + '☆'.repeat(3 - stars)}</div>`;
        if (!locked) b.addEventListener('click', () => { A.sfxUi(); this.showBrief(lv); });
        grid.appendChild(b);
      }
      wrap.appendChild(grid);
      body.appendChild(wrap);
    }
  }

  showBrief(lv) {
    $('#brief-kicker').textContent = `${typeLabel(lv.type)} · ACT ${'I'.repeat(Math.min(3, lv.act + 1)) + (lv.act === 3 ? 'V' : lv.act === 4 ? 'V' : '')}`;
    $('#brief-title').textContent = `${String(lv.id).padStart(2, '0')} · ${lv.name}`;
    $('#brief-text').textContent = lv.brief;
    $('#brief-obj').textContent = objectiveText(lv);
    const st = S().story.stars[lv.id] || 0;
    $('#brief-stats').innerHTML = `
      <div><b>${lv.time ? fmtTime(lv.time) : '∞'}</b><span>AIRTIME</span></div>
      <div><b>${lv.rivals}</b><span>RIVALS</span></div>
      <div><b>${lv.hazards}</b><span>DEFENCE</span></div>
      <div><b>${'★'.repeat(st) || '—'}</b><span>BEST</span></div>`;
    this._briefGo = () => this.hooks.startStory(lv.id);
    this.openModal('brief');
  }

  replayMenu() {
    const seen = S().story.seen;
    const ids = [['intro', 'Opening'], ['act2', 'Act II — The Colony Belt'], ['act3', 'Act III — The Hive Cities'],
      ['turn', 'Act IV — The Sanctum'], ['act5', 'Act V — The Core Verge'], ['finale', 'The Last Broadcast']];
    const body = $('#story-body');
    body.innerHTML = `<div class="card"><h3>Cutscenes</h3><p class="muted">Replay anything you have already seen.</p></div>`;
    for (const [id, name] of ids) {
      const b = document.createElement('button');
      b.className = 'btn no-drag';
      b.style.cssText = 'width:100%;margin-bottom:8px;text-align:left';
      const ok = !!seen[id];
      b.textContent = ok ? '🎬  ' + name : '🔒  ' + name;
      b.disabled = !ok;
      if (ok) b.addEventListener('click', () => { A.sfxUi(); this.hooks.playCutscene(id); });
      body.appendChild(b);
    }
    const back = document.createElement('button');
    back.className = 'btn ghost no-drag';
    back.style.cssText = 'width:100%;margin-top:10px';
    back.textContent = 'Back to contracts';
    back.addEventListener('click', () => { A.sfxUi(false); this.renderStory(); });
    body.appendChild(back);
  }

  // ── upgrades ──────────────────────────────────────────────────────────────

  renderUpgrades() {
    const s = S();
    $('#up-subs').querySelector('span').textContent = fmt(s.subs);
    const body = $('#up-body');
    body.innerHTML = `<div class="card"><p class="muted">SUBS are the only thing you keep between broadcasts. Everything here is permanent.</p></div>`;
    for (const def of PERM) {
      const l = permLevel(def.id);
      const maxed = l >= def.max;
      const cost = maxed ? 0 : permCost(def, l);
      const poor = !maxed && s.subs < cost;
      const row = document.createElement('div');
      row.className = 'up';
      row.innerHTML = `
        <div class="ic">${def.icon}</div>
        <div class="mid">
          <h4>${def.name}</h4>
          <p>${def.desc}</p>
          <div class="eff">${def.detail(l)}${maxed ? '' : ' → ' + def.detail(l + 1)}</div>
          <div class="pips">${Array.from({ length: def.max }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
        </div>
        <button class="buy no-drag ${maxed ? 'max' : poor ? 'poor' : ''}">${maxed ? 'MAX' : '◈ ' + fmt(cost)}</button>`;
      if (!maxed) {
        row.querySelector('.buy').addEventListener('click', () => {
          if (buy(def)) { save(); A.sfxBoon(); this.renderUpgrades(); this.toast(def.name + ' upgraded', 'good'); }
          else { A.sfxUi(false); this.toast('Not enough SUBS', 'bad'); }
        });
      }
      body.appendChild(row);
    }
  }

  // ── skins ─────────────────────────────────────────────────────────────────

  renderSkins() {
    const s = S();
    $('#sk-subs').querySelector('span').textContent = fmt(s.subs);
    const body = $('#sk-body');
    body.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'sk-grid';
    for (const sk of SKINS) {
      const owned = s.skins.includes(sk.id);
      const on = s.skin === sk.id;
      const b = document.createElement('button');
      b.className = 'sk no-drag' + (on ? ' on' : '') + (owned ? '' : ' locked');
      const a = '#' + sk.a.toString(16).padStart(6, '0');
      b.innerHTML = `<div class="orb" style="box-shadow:0 0 18px ${a}66"><span style="position:absolute;inset:-6px;border-radius:50%;border:3px solid ${a}"></span></div>
        <div class="nm">${sk.name}</div>
        <div class="cost">${owned ? (on ? 'EQUIPPED' : 'tap to equip') : sk.cost ? '◈ ' + fmt(sk.cost) : (sk.note || 'locked')}</div>`;
      b.addEventListener('click', () => {
        if (owned) { s.skin = sk.id; save(); A.sfxUi(); this.renderSkins(); this.hooks.skinChanged && this.hooks.skinChanged(); return; }
        if (!sk.cost) { A.sfxUi(false); this.toast(sk.note || 'Locked', 'bad'); return; }
        if (s.subs < sk.cost) { A.sfxUi(false); this.toast('Not enough SUBS', 'bad'); return; }
        s.subs -= sk.cost; s.skins.push(sk.id); s.skin = sk.id; save();
        A.sfxBoon(); this.renderSkins(); this.toast(sk.name + ' unlocked', 'good');
        this.hooks.skinChanged && this.hooks.skinChanged();
      });
      grid.appendChild(b);
    }
    body.appendChild(grid);
    const note = document.createElement('div');
    note.className = 'card';
    note.style.marginTop = '14px';
    note.innerHTML = `<p class="muted">Skins only change the accretion disc. The Guild has no opinion about your aesthetic choices, which is the nicest thing anyone can say about the Guild.</p>`;
    body.appendChild(note);
  }

  // ── ladder ────────────────────────────────────────────────────────────────

  renderLadder() {
    const s = S();
    const rank = rankForScore(s.best.score);
    const body = $('#ld-body');
    const pct = rankPercent(rank);
    const ms = nextMilestone(rank);
    body.innerHTML = `
      <div class="rankhero">
        <div class="big-rank">${fmtRank(rank)}</div>
        <div class="ttl">${rankTitle(rank)}</div>
        <div class="sub">Best open contract: <b>${fmtFull(Math.round(s.best.score))}</b><br>
          Ahead of ${pct < 0.001 ? pct.toExponential(2) : pct.toFixed(pct < 1 ? 4 : 2)}% of the workforce<br>
          Next milestone: top ${fmtFull(ms)}</div>
      </div>
      <div class="card"><p class="muted">Every clearance worker in the galaxy is on this board. You started at ${fmtFull(START_RANK)} and you are climbing it one broadcast at a time.</p></div>`;
    const box = document.createElement('div');
    box.className = 'card';
    box.style.padding = '6px 10px';
    for (const r of neighbours(rank, 'YOU')) {
      const row = document.createElement('div');
      row.className = 'ld-row' + (r.you ? ' you' : '');
      row.innerHTML = `<s>${fmtRank(r.rank)}</s><b>${r.name}</b><i>${fmtFull(Math.round(r.score))}</i>`;
      box.appendChild(row);
    }
    body.appendChild(box);
    const btn = document.createElement('button');
    btn.className = 'btn prime no-drag';
    btn.style.cssText = 'width:100%;margin-top:12px';
    btn.textContent = 'RUN AN OPEN CONTRACT';
    btn.addEventListener('click', () => { A.sfxUi(); this.hooks.startOneOff(); });
    body.appendChild(btn);
  }

  // ── events ────────────────────────────────────────────────────────────────

  renderEvent() {
    const { ev } = currentEvent();
    const nx = nextEvent();
    const rec = eventRecord(ev.id);
    const body = $('#ev-body');
    body.innerHTML = `
      <div class="ev-hero">
        <div class="ic">${ev.icon}</div>
        <h3>${ev.name}</h3>
        <div class="cd">ENDS IN ${fmtCountdown(timeLeft())}</div>
        <p>${ev.blurb}</p>
        <ul class="rules">${ev.rules.map((r) => `<li>${r}</li>`).join('')}</ul>
      </div>`;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<h3>Rewards</h3><p class="muted">Your best score this event: <b>${fmtFull(Math.round(rec.best))}</b></p>`;
    for (const m of milestones(ev)) {
      const got = rec.best >= m.at;
      const row = document.createElement('div');
      row.className = 'ms' + (got ? ' got' : '');
      row.innerHTML = `<span class="dot"></span><b>${m.reward ? (ev.reward.skin ? 'Exclusive rig skin' : '+' + ev.reward.subs + ' SUBS') : m.label + ' · +' + m.subs + ' SUBS'}</b><i>${fmtFull(m.at)}</i>`;
      card.appendChild(row);
    }
    body.appendChild(card);
    const btn = document.createElement('button');
    btn.className = 'btn prime no-drag';
    btn.style.cssText = 'width:100%;margin-bottom:12px';
    btn.textContent = 'ENTER THE CONTRACT';
    btn.addEventListener('click', () => { A.sfxUi(); this.hooks.startEvent(ev); });
    body.appendChild(btn);
    const nxt = document.createElement('div');
    nxt.className = 'card';
    nxt.innerHTML = `<h3>Up next</h3><p class="muted">${nx.ev.icon} <b>${nx.ev.name}</b> — starts in ${fmtCountdown(timeLeft())}. Events rotate every three days and the schedule is the same for everyone.</p>`;
    body.appendChild(nxt);
  }

  // ── settings ──────────────────────────────────────────────────────────────

  renderSettings() {
    const s = S();
    document.querySelectorAll('[data-set]').forEach((b) => b.classList.toggle('on', !!s.settings[b.dataset.set]));
    document.querySelectorAll('#set-quality .chip').forEach((b) => b.classList.toggle('on', s.settings.quality === b.dataset.q));
    const st = s.stats;
    $('#set-stats').innerHTML = `${st.runs} broadcasts · ${fmt(st.props)} objects swallowed · ${fmt(st.landmarks)} landmarks<br>
      Best combo ×${st.bestCombo} · peak audience ${fmt(st.peakViewers)}<br>
      Story: ${Object.keys(s.story.stars).length}/50 contracts`;
  }

  confirmWipe() {
    const body = $('#settings').querySelector('.pbody');
    if (this._wipeArmed) {
      wipe();
      A.sfxFail();
      this.toast('Progress erased', 'bad');
      this._wipeArmed = false;
      this.renderSettings();
      this.hooks.skinChanged && this.hooks.skinChanged();
      return;
    }
    this._wipeArmed = true;
    $('#set-wipe').textContent = 'Tap again to confirm';
    this.toast('This deletes everything. Tap again to confirm.', 'bad');
    setTimeout(() => { this._wipeArmed = false; const b = $('#set-wipe'); if (b) b.textContent = 'Erase all progress'; }, 4000);
  }

  // ── in-run modals ─────────────────────────────────────────────────────────

  showBoon(choices, pick) {
    const box = $('#boon-cards');
    box.innerHTML = '';
    for (const b of choices) {
      const el = document.createElement('button');
      el.className = 'boon-card no-drag r' + b.rarity;
      el.innerHTML = `<div class="ic">${b.icon}</div><div><h4>${b.name}</h4><p>${b.desc}</p>
        <span class="rar">${['COMMON', 'UNCOMMON', 'RARE'][b.rarity]}</span></div>`;
      el.addEventListener('click', () => { A.sfxBoon(); this.closeModal('boon'); pick(b); });
      box.appendChild(el);
    }
    this.openModal('boon');
  }

  showPause(run) {
    $('#pause-title').textContent = run.spec.name || 'Open Contract';
    $('#pause-stats').innerHTML = `
      <div><b>${fmt(run.viewers)}</b><span>VIEWERS</span></div>
      <div><b>${run.clearPct().toFixed(1)}%</b><span>CLEARED</span></div>
      <div><b>×${run.bestCombo}</b><span>BEST CHAIN</span></div>
      <div><b>${run.timeLimit ? fmtTime(run.timeLeft) : fmtTime(run.elapsed)}</b><span>${run.timeLimit ? 'LEFT' : 'ELAPSED'}</span></div>`;
    const bl = $('#pause-boons');
    bl.innerHTML = run.boons.length
      ? run.boons.map((b) => `<span class="boonchip">${b.icon} ${b.name}</span>`).join('')
      : '<span class="boonchip">no sponsor offers taken yet</span>';
    this.openModal('pause');
  }

  showResults(res, ctx) {
    const win = res.result === 'win';
    $('#res-kicker').textContent = ctx.kicker || (win ? 'CONTRACT COMPLETE' : 'BROADCAST ENDED');
    $('#res-title').textContent = ctx.title || '';
    $('#res-stars').innerHTML = ctx.stars != null
      ? Array.from({ length: 3 }, (_, i) => (i < ctx.stars ? '★' : '<s>★</s>')).join('')
      : '';
    $('#res-viewers').textContent = fmt(res.viewers);
    $('#res-stats').innerHTML = `
      <div><b>${res.pct.toFixed(1)}%</b><span>CLEARED</span></div>
      <div><b>${fmt(res.eaten)}</b><span>OBJECTS</span></div>
      <div><b>×${res.combo}</b><span>BEST CHAIN</span></div>
      <div><b>◈ ${fmt(res.subs)}</b><span>SUBS EARNED</span></div>`;
    const extra = $('#res-extra');
    extra.innerHTML = '';
    if (ctx.rankBefore != null) {
      const d = document.createElement('div');
      d.className = 'rankdelta';
      d.innerHTML = ctx.rankAfter < ctx.rankBefore
        ? `GLOBAL RANK <s>${fmtRank(ctx.rankBefore)}</s> → <b>${fmtRank(ctx.rankAfter)}</b><br><span class="muted">${rankTitle(ctx.rankAfter)}</span>`
        : `GLOBAL RANK <b>${fmtRank(ctx.rankAfter)}</b><br><span class="muted">Score ${fmtFull(Math.round(res.score))} — beat your best to climb</span>`;
      extra.appendChild(d);
    }
    if (ctx.awards && ctx.awards.length) {
      const d = document.createElement('div');
      d.className = 'card';
      d.innerHTML = `<h3>Rewards</h3>` + ctx.awards.map((a) => `<p class="muted">✔ ${a}</p>`).join('');
      extra.appendChild(d);
    }
    if (res.rivals && res.rivals.length) {
      const total = ctx.totalMass || 1;
      const rows = res.rivals.map((r) => ({ name: r.name, m: r.mass })).concat([{ name: 'YOU', m: res.mine, you: true }]);
      rows.sort((a, b) => b.m - a.m);
      const d = document.createElement('div');
      d.className = 'card res-list';
      d.innerHTML = '<h3>Sector share</h3>' + rows.map((r) =>
        `<div class="r${r.you ? ' you' : ''}"><span>${r.name}</span><span>${((r.m / total) * 100).toFixed(1)}%</span></div>`).join('');
      extra.appendChild(d);
    }
    if (res.boons && res.boons.length) {
      const d = document.createElement('div');
      d.className = 'boonlist';
      d.innerHTML = res.boons.map((b) => `<span class="boonchip">${b.icon} ${b.name}</span>`).join('');
      extra.appendChild(d);
    }
    const foot = $('#res-foot');
    foot.innerHTML = '';
    for (const b of ctx.buttons || []) {
      const el = document.createElement('button');
      el.className = 'btn no-drag ' + (b.cls || '');
      el.textContent = b.label;
      el.addEventListener('click', () => { A.sfxUi(); this.closeModal('results'); b.fn(); });
      foot.appendChild(el);
    }
    this.openModal('results');
  }
}
