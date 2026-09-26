import { h, esc, fmt, clamp, onTap, haptic } from './core.js';
import { icon } from './icons.js';
import { bindFullscreen } from './fullscreen.js';
import { itemTile } from './itemcard.js';

const emblem = (cls = '') => `<div class="hf-emblem ${cls}"><svg viewBox="0 0 120 120" aria-hidden="true">
  <defs><linearGradient id="emg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6d6"/><stop offset=".45" stop-color="#ffcf6a"/><stop offset="1" stop-color="#8a5a14"/></linearGradient></defs>
  <circle class="e1" cx="60" cy="60" r="56" fill="none" stroke="rgba(160,228,255,.55)" stroke-width="1" stroke-dasharray="2 5"/>
  <circle class="e2" cx="60" cy="60" r="47" fill="none" stroke="rgba(160,228,255,.9)" stroke-width="1.4" stroke-dasharray="60 14 6 14"/>
  <circle cx="60" cy="60" r="38" fill="rgba(4,18,36,.55)" stroke="url(#emg)" stroke-width="1.6"/>
  <path d="M43 36v48M77 36v48M43 60h34" stroke="url(#emg)" stroke-width="5" stroke-linecap="square"/>
  <path d="M60 30l7 7-7 7-7-7z" fill="url(#emg)"/><path d="M60 76l7 7-7 7-7-7z" fill="none" stroke="url(#emg)" stroke-width="1.5"/>
</svg></div>`;

const TIPS = [
  'Frames you are not piloting still earn their keep — nothing in the Warehouse rusts.',
  'Heirloom parts carry your family\'s serials. Some doors remember them.',
  'Not every chrome frame on the promenade is hostile. Most just want to get to work.',
  'Heat fades faster in crowds. Blend in with the civilian traffic.',
  'Ion damage melts shields; thermal cooks what is underneath.',
];

export function createScreens(bus, root) {
  const el = h('div.hf-screens');
  const rotate = h('div.hf-rotate', { html: `<div class="rt-phone"><i></i></div><h2 class="hf-title-d">Rotate your device</h2><p>HEIRFRAME is played in landscape.</p>` });
  el.append(rotate);
  let cur = null, curName = null, resolveFn = null;

  function finish(action) {
    const r = resolveFn; resolveFn = null;
    bus.emit(`${curName}:${action}`);
    r && r(action);
  }

  function hide() {
    if (!cur) return;
    const c = cur; cur = null; curName = null;
    c.classList.add('out');
    setTimeout(() => c.remove(), 450);
    root.classList.remove('hf-in-screen');
  }

  const build = {
    title(d) {
      const letters = 'HEIRFRAME'.split('').map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');
      const s = h('div.hf-scr.hf-title', {
        html: `<div class="ti-vig"></div><div class="ti-rays"></div>
        <div class="ti-center">
          ${emblem('ti-em')}
          <h1 class="ti-logo" aria-label="HEIRFRAME"><span class="ti-ghost">HEIRFRAME</span><span class="ti-fill">${letters}</span></h1>
          <div class="ti-tag"><i></i><span>A brighter future, inherited</span><i></i></div>
          <div class="ti-menu">
            ${d.hasSave ? `<button class="hf-btn primary hf-live" data-a="continue">${icon('play')}Continue</button>` : ''}
            <button class="hf-btn ${d.hasSave ? '' : 'primary'} hf-live" data-a="new">${icon('plus')}New Game</button>
            <button class="hf-btn ghost hf-live" data-a="settings">${icon('settings')}Settings</button>
          </div>
        </div>
        <div class="ti-ver">${esc(d.version || 'v0.1')}</div>
        <button class="hf-ibtn hf-live ti-fs" aria-label="Fullscreen"></button>`,
      });
      bindFullscreen(s.querySelector('.ti-fs'), bus);
      s.querySelectorAll('[data-a]').forEach(b => onTap(b, () => {
        haptic(); bus.emit('sfx', 'confirm');
        if (b.dataset.a === 'settings') { api.openSettings && api.openSettings(); return; }
        finish(b.dataset.a); hide();
      }));
      return s;
    },
    loading(d) {
      const s = h('div.hf-scr.hf-loading', {
        html: `${emblem('ld-em spin')}
        <div class="ld-lbl hf-label">${esc(d.label || 'Establishing link')}</div>
        <div class="ld-bar"><i></i><b class="hf-num">0%</b></div>
        <p class="ld-tip"><span>Tip</span>${esc(d.tip || TIPS[Math.floor(Math.random() * TIPS.length)])}</p>`,
      });
      return s;
    },
    rotate() { rotate.classList.add('force'); return null; },
    complete(d) {
      const xpFrom = clamp((d.xpFrom ?? 0) / (d.xpMax || 1), 0, 1);
      const xpTo = d.levelUp ? 1 : clamp(((d.xpFrom ?? 0) + (d.xp || 0)) / (d.xpMax || 1), 0, 1);
      const s = h('div.hf-scr.hf-complete', {
        html: `<div class="cp-bg"></div>
        <div class="cp-l">
          <div class="cp-grade g-${esc(d.grade || 'A')}"><b>${esc(d.grade || 'A')}</b><span>Rating</span></div>
          <div class="cp-head"><span class="hf-label">Contract complete</span><h2>${esc(d.title || 'Contract')}</h2></div>
          <ul class="cp-stats">${(d.stats || []).map(x => `<li><span>${esc(x.label)}</span><b class="hf-num">${esc(x.value)}</b></li>`).join('')}</ul>
        </div>
        <div class="cp-r hf-glass hf-brackets gold">
          <div class="cp-row cr"><span class="ci">${icon('credits')}</span><div><small>Payout</small><b class="hf-num hf-gold-text cp-cr">0</b></div>${d.bonus ? `<em class="hf-num">+${fmt(d.bonus)} bonus</em>` : ''}</div>
          <div class="cp-row xp"><div class="cp-lv hf-num">${d.level ?? ''}</div><div class="cp-xpw"><small>Experience <b class="hf-num">+${fmt(d.xp || 0)}</b></small><div class="cp-xpb" style="--a:${xpFrom};--b:${xpTo}"><i></i></div></div>${d.levelUp ? '<em class="cp-up">Level up!</em>' : ''}</div>
          ${d.items?.length ? `<div class="cp-items">${d.items.map((it, i) => `<div class="cp-it" style="--d:${900 + i * 160}ms">${itemTile(it)}</div>`).join('')}</div>` : ''}
          <button class="hf-btn gold hf-live cp-go" data-a="continue">Continue${icon('chevron')}</button>
        </div>`,
      });
      const crEl = s.querySelector('.cp-cr'), total = (d.credits || 0) + (d.bonus || 0), t0 = performance.now() + 500;
      const tick = now => {
        const k = clamp((now - t0) / 1100, 0, 1);
        crEl.textContent = fmt(total * (1 - (1 - k) ** 3));
        if (k < 1 && s.isConnected) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      if (d.levelUp) setTimeout(() => bus.emit('sfx', 'levelup'), 1700);
      s.querySelectorAll('.cp-it .hf-tile').forEach((t, i) => t.addEventListener('click', () => bus.emit('loot:inspect', d.items[i])));
      onTap(s.querySelector('.cp-go'), () => { haptic(); bus.emit('sfx', 'confirm'); finish('continue'); hide(); });
      return s;
    },
    death(d) {
      const s = h('div.hf-scr.hf-death', {
        html: `<div class="dd-bg"></div><div class="dd-noise"></div>
        <div class="dd-c">
          <div class="dd-ic">${icon('skull')}</div>
          <h2 class="dd-t" data-t="FRAME DISABLED">FRAME DISABLED</h2>
          <p class="dd-cause">${esc(d.cause || 'Critical hull failure')}</p>
          <div class="dd-btns">
            <button class="hf-btn primary hf-live" data-a="redeploy">${icon('reroll')}Redeploy${d.cost ? ` <b class="hf-num dd-cost">${fmt(d.cost)} cr</b>` : ''}</button>
            <button class="hf-btn hf-live" data-a="warehouse">${icon('warehouse')}Warehouse</button>
          </div>
          ${d.tip ? `<p class="dd-tip">${esc(d.tip)}</p>` : ''}
        </div>`,
      });
      s.querySelectorAll('[data-a]').forEach(b => onTap(b, () => { haptic(); bus.emit('sfx', 'confirm'); finish(b.dataset.a); hide(); }));
      return s;
    },
  };

  const api = {
    el,
    get current() { return curName; },
    show(name, data = {}) {
      if (name == null) { hide(); rotate.classList.remove('force'); return Promise.resolve(null); }
      if (resolveFn) { const r = resolveFn; resolveFn = null; r(null); }
      if (name === 'rotate') { build.rotate(); return Promise.resolve(null); }
      if (!build[name]) { console.warn('[ui] unknown screen', name); return Promise.resolve(null); }
      if (cur) { const c = cur; c.classList.add('out'); setTimeout(() => c.remove(), 450); }
      cur = build[name](data); curName = name;
      el.append(cur);
      root.classList.add('hf-in-screen');
      if (name === 'loading') api.loading(data.progress || 0, data.label);
      return new Promise(r => { resolveFn = r; });
    },
    hide,
    loading(p, label) {
      if (curName !== 'loading') return;
      const pct = clamp(p, 0, 1);
      cur.querySelector('.ld-bar').style.setProperty('--p', pct);
      cur.querySelector('.ld-bar b').textContent = `${Math.round(pct * 100)}%`;
      if (label) cur.querySelector('.ld-lbl').textContent = label;
    },
  };
  return api;
}
