// DOM layer: HUD, dialogue cards (popups, NEVER alerts), mission offers,
// big result cards, the title menu, settings modal, toasts. Pure view — all
// game state comes in through calls; player intent leaves through handlers.

import { SPEAKERS } from './story.js';
import { P, saveProfile } from './save.js';
import { fmtCash, fmtTime, clamp } from './utils.js';
import * as audio from './audio.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor() {
    this.handlers = {};        // onEnterTap, onSettingsChanged, onCineFocus, menu handlers…
    this.fireHeld = false;
    this.nitroHeld = false;
    this._dlgResolve = null;
    this._dlgQueue = [];
    this._cashShown = 0; this._cashTarget = 0;

    $('btn-enter').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.handlers.onEnterTap?.(); });
    const fire = $('btn-fire');
    fire.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.fireHeld = true; });
    addEventListener('pointerup', () => { this.fireHeld = false; this.nitroHeld = false; });
    fire.addEventListener('pointercancel', () => this.fireHeld = false);
    const nitro = $('btn-nitro');
    nitro.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.nitroHeld = true; });
    $('btn-cog').addEventListener('click', () => this.settingsModal());
    $('modal-x').addEventListener('click', () => this.closeModal());
    $('dlg').addEventListener('pointerdown', (e) => { e.stopPropagation(); this._dlgNext(); });
    $('btn-skip').addEventListener('click', () => { this._dlgQueue = []; this._dlgNext(true); });

    // menu buttons
    $('m-continue').addEventListener('click', () => this.handlers.onContinue?.());
    $('m-story').addEventListener('click', () => this.handlers.onStory?.());
    $('m-missions').addEventListener('click', () => this.handlers.onMissions?.());
    $('m-endless').addEventListener('click', () => this.handlers.onEndless?.());
    $('m-garage').addEventListener('click', () => this.handlers.onGarage?.());
    $('m-editor').addEventListener('click', () => location.href = 'editor.html');
    $('m-settings').addEventListener('click', () => this.settingsModal());
  }

  applySettings() {
    const s = P().settings;
    const btns = $('btns');
    btns.classList.toggle('left', s.side === 'left');
    document.body.classList.remove('sz-s', 'sz-m', 'sz-l');
    document.body.classList.add('sz-' + s.btnSize);
    // fire above/below enter
    const fire = $('btn-fire'), enter = $('btn-enter'), nitroB = $('btn-nitro');
    btns.innerHTML = '';
    if (s.firePos === 'above') btns.append(nitroB, fire, enter);
    else btns.append(nitroB, enter, fire);
    audio.applySettings();
  }

  // ── HUD ──
  showHud(on) { $('hud').classList.toggle('hidden', !on); }
  setCash(v) { this._cashTarget = v; }
  tick(dt) {
    if (this._cashShown !== this._cashTarget) {
      const d = this._cashTarget - this._cashShown;
      this._cashShown += Math.abs(d) < 2 ? d : d * Math.min(1, dt * 8);
      $('cash').textContent = fmtCash(this._cashShown);
    }
  }
  setStars(n, active) {
    const el = $('stars');
    let h = '';
    for (let i = 0; i < 5; i++) h += `<span class="${i < n ? 'on' : 'off'}">★</span>`;
    el.innerHTML = h;
    el.classList.toggle('pulse', active && n > 0);
  }
  setHp(frac) { $('hp-fill').style.width = `${clamp(frac, 0, 1) * 100}%`; }
  setCar(frac, name) {
    $('car-wrap').classList.toggle('hidden', frac == null);
    if (frac != null) {
      $('car-fill').style.width = `${clamp(frac, 0, 1) * 100}%`;
      $('car-name').textContent = name || '';
    }
  }
  setWeapon(name) {
    $('weapon-chip').classList.toggle('hidden', !name);
    if (name) $('weapon-chip').textContent = `⌖ ${name} · ∞`;
  }
  updateButtons({ enter, exit, fire, nitro }) {
    const be = $('btn-enter');
    be.classList.toggle('hidden', !enter && !exit);
    be.textContent = exit ? '🚪' : '🚗';
    $('btn-fire').classList.toggle('hidden', !fire);
    const bn = $('btn-nitro');
    bn.classList.toggle('hidden', !nitro?.show);
    if (nitro?.show) bn.classList.toggle('cd', nitro.cd > 0);
  }
  banner(title, obj = '') {
    const b = $('banner');
    if (!title) { b.classList.add('hidden'); return; }
    b.classList.remove('hidden');
    $('banner-title').textContent = title;
    $('banner-obj').textContent = obj;
  }
  timer(sec) {
    const t = $('banner-timer');
    if (sec == null) { t.classList.add('hidden'); return; }
    t.classList.remove('hidden');
    t.textContent = fmtTime(Math.max(0, sec));
    t.classList.toggle('low', sec < 20);
  }
  setEndless(time, score) {
    $('endless-hud').classList.remove('hidden');
    $('endless-time').textContent = fmtTime(time);
    $('endless-score').textContent = Math.floor(score).toLocaleString();
  }
  hideEndless() { $('endless-hud').classList.add('hidden'); }

  toast(text, cls = '') {
    const t = document.createElement('div');
    t.className = 'toast ' + cls;
    t.textContent = text;
    $('toasts').append(t);
    setTimeout(() => t.remove(), 2100);
  }

  // ── dialogue (tap-through card, cinema bars, optional camera focus) ──
  dialogue(lines, { skippable = true } = {}) {
    return new Promise(res => {
      this._dlgQueue = [...lines];
      this._dlgResolve = res;
      document.body.classList.add('cine');
      $('btn-skip').classList.toggle('hidden', !skippable);
      this._dlgNext();
    });
  }
  _dlgNext(force = false) {
    const line = this._dlgQueue.shift();
    if (!line || force) {
      $('dlg').classList.add('hidden');
      $('btn-skip').classList.add('hidden');
      document.body.classList.remove('cine');
      this.handlers.onCineFocus?.(null);
      const r = this._dlgResolve; this._dlgResolve = null;
      r?.();
      return;
    }
    const sp = SPEAKERS[line.who] || { name: line.who, ava: '?', color: '#fff' };
    $('dlg').classList.remove('hidden');
    $('dlg-ava').textContent = sp.ava;
    $('dlg-ava').style.borderColor = sp.color;
    $('dlg-name').textContent = sp.name;
    $('dlg-name').style.color = sp.color;
    $('dlg-text').textContent = line.text;
    if (line.focus) this.handlers.onCineFocus?.(line.focus);
    audio.blip();
  }
  get inDialogue() { return !!this._dlgResolve; }

  // ── mission offer / yes-no choice ──
  choice({ tag, title, text, meta = [], accept = 'ACCEPT', decline = 'NOT NOW' }) {
    return new Promise(res => {
      $('choice').classList.remove('hidden');
      const tagEl = $('choice-tag');
      tagEl.className = tag || 'civ';
      tagEl.textContent = tag === 'police' ? 'PRECINCT 9' : tag === 'gang' ? 'CHROME SERPENTS' : tag === 'conflict' ? '⚠ LOYALTY TEST' : 'PALM BAY';
      $('choice-title').textContent = title;
      $('choice-text').textContent = text;
      $('choice-meta').innerHTML = meta.map(m =>
        `<span class="meta-chip ${m.startsWith('⚠') ? 'risk' : ''}">${m}</span>`).join('');
      const btns = $('choice-btns');
      btns.innerHTML = '';
      const mk = (label, cls, val) => {
        const b = document.createElement('button');
        b.className = cls; b.textContent = label;
        b.addEventListener('click', () => { $('choice').classList.add('hidden'); res(val); });
        btns.append(b);
      };
      mk(decline, 'cbtn-no', false);
      mk(accept, 'cbtn-go', true);
    });
  }

  // ── big card (wasted / passed / endings) ──
  bigCard({ title, sub = '', btns = ['CONTINUE'], bad = false }) {
    return new Promise(res => {
      const c = $('bigcard');
      c.classList.remove('hidden');
      c.classList.toggle('bad', bad);
      $('big-title').textContent = title;
      $('big-sub').textContent = sub;
      const bb = $('big-btns');
      bb.innerHTML = '';
      btns.forEach((label, i) => {
        const b = document.createElement('button');
        if (i > 0) b.className = 'alt';
        b.textContent = label;
        b.addEventListener('click', () => { c.classList.add('hidden'); res(label); });
        bb.append(b);
      });
    });
  }

  // ── menus & modals ──
  showMenu(on, canContinue = false) {
    $('menu').classList.toggle('hidden', !on);
    if (on) {
      $('m-continue').classList.toggle('hidden', !canContinue);
      const p = P();
      const done = p.story.done.length;
      $('menu-foot').innerHTML =
        `story ${Math.min(done, 13)}/13 · $${Math.round(p.cash).toLocaleString()} · ${p.ownedCars.length} car${p.ownedCars.length === 1 ? '' : 's'}` +
        (p.story.ending ? ` · ending ${p.story.ending} ✓` : '');
    }
  }
  modal(title, build) {
    $('modal').classList.remove('hidden');
    $('modal-title').textContent = title;
    const body = $('modal-body');
    body.innerHTML = '';
    build(body);
  }
  closeModal() { $('modal').classList.add('hidden'); this.handlers.onModalClose?.(); }
  get modalOpen() { return !$('modal').classList.contains('hidden'); }

  // ── settings ──
  settingsModal() {
    const s = P().settings;
    this.modal('Settings', (body) => {
      const row = (label, ctrl) => {
        const d = document.createElement('div');
        d.className = 'set-row';
        const l = document.createElement('label'); l.textContent = label;
        d.append(l, ctrl);
        body.append(d);
      };
      const seg = (opts, cur, onSet) => {
        const w = document.createElement('div'); w.className = 'seg';
        for (const [val, label] of opts) {
          const b = document.createElement('button');
          b.textContent = label;
          b.classList.toggle('on', val === cur);
          b.addEventListener('click', () => {
            onSet(val); saveProfile(); this.applySettings();
            [...w.children].forEach(c => c.classList.toggle('on', c === b));
            this.handlers.onSettingsChanged?.();
          });
          w.append(b);
        }
        return w;
      };
      row('Buttons side', seg([['left', 'Left'], ['right', 'Right']], s.side, v => s.side = v));
      row('Fire button', seg([['above', 'Above'], ['below', 'Below']], s.firePos, v => s.firePos = v));
      row('Button size', seg([['s', 'S'], ['m', 'M'], ['l', 'L']], s.btnSize, v => s.btnSize = v));
      row('Camera shake', seg([[true, 'On'], [false, 'Off']], s.shake, v => s.shake = v));
      row('Quality', seg([['high', 'High'], ['med', 'Med'], ['low', 'Low']], s.quality, v => s.quality = v));
      row('Sound FX', seg([[true, 'On'], [false, 'Off']], s.sfx, v => s.sfx = v));
      row('Music', seg([[true, 'On'], [false, 'Off']], s.music, v => s.music = v));
      const zoomCtl = document.createElement('input');
      zoomCtl.type = 'range'; zoomCtl.min = '0.6'; zoomCtl.max = '2.0'; zoomCtl.step = '0.05';
      zoomCtl.value = s.zoom;
      zoomCtl.addEventListener('input', () => { s.zoom = parseFloat(zoomCtl.value); saveProfile(); this.handlers.onSettingsChanged?.(); });
      row('Zoom out', zoomCtl);
      const danger = document.createElement('button');
      danger.className = 'danger-btn';
      danger.textContent = 'Reset save data';
      let armed = false;
      danger.addEventListener('click', () => {
        if (!armed) { armed = true; danger.textContent = 'Tap again to ERASE EVERYTHING'; return; }
        this.handlers.onResetSave?.();
        this.closeModal();
      });
      body.append(danger);
    });
  }
}
