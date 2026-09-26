import { esc, onTap, haptic, store } from './core.js';
import { icon } from './icons.js';

function seg(key, opts, cur) {
  return `<div class="st-seg" data-k="${key}">${opts.map(([v, l]) => `<button class="hf-live ${String(cur) === String(v) ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
}
function tog(key, on) {
  return `<button class="st-tog hf-live ${on ? 'on' : ''}" data-k="${key}" role="switch" aria-checked="${on}"><i></i></button>`;
}
function slider(key, v) {
  return `<div class="st-sl hf-live" data-k="${key}" style="--v:${v}"><div class="tr"><i></i></div><b class="hf-num">${Math.round(v * 100)}</b></div>`;
}

export function settingsPanel(body, data, ctx) {
  const s = store.settings;
  const row = (ic, label, ctl, sub = '') => `<div class="st-row"><span class="st-ic">${icon(ic)}</span><div class="st-l"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div>${ctl}</div>`;
  body.innerHTML = `<div class="hf-settings">
    <section><span class="hf-label">Display &amp; Controls</span>
      ${row('quality', 'Graphics', seg('quality', [['low', 'Low'], ['med', 'Med'], ['high', 'High']], s.quality))}
      ${row('joystick', 'Joystick', seg('joystick', [['left', 'Left'], ['right', 'Right']], s.joystick))}
      ${row('subtitles', 'Subtitles', tog('subtitles', s.subtitles))}
      ${row('vibrate', 'Haptics', tog('haptics', s.haptics))}
    </section>
    <section><span class="hf-label">Audio</span>
      ${row('volume', 'Music', slider('music', s.music))}
      ${row('volume', 'Effects', slider('sfx', s.sfx))}
      ${row('talk', 'Voice', slider('voice', s.voice))}
    </section>
  </div>`;

  const commit = () => ctx.applySettings({ ...s });
  body.querySelectorAll('.st-seg button').forEach(b => onTap(b, () => {
    const k = b.parentElement.dataset.k;
    s[k] = b.dataset.v;
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    haptic(); ctx.bus.emit('sfx', 'click'); commit();
  }));
  body.querySelectorAll('.st-tog').forEach(b => onTap(b, () => {
    const k = b.dataset.k;
    s[k] = !s[k];
    b.classList.toggle('on', s[k]); b.setAttribute('aria-checked', s[k]);
    haptic(); ctx.bus.emit('sfx', 'click'); commit();
  }));
  body.querySelectorAll('.st-sl').forEach(el => {
    const tr = el.querySelector('.tr'), k = el.dataset.k;
    const setFrom = x => {
      const r = tr.getBoundingClientRect();
      const v = Math.round(Math.max(0, Math.min(1, (x - r.left) / r.width)) * 20) / 20;
      if (v === s[k]) return;
      s[k] = v; el.style.setProperty('--v', v); el.querySelector('b').textContent = Math.round(v * 100);
      commit();
    };
    el.addEventListener('pointerdown', e => { e.stopPropagation(); el.setPointerCapture(e.pointerId); el.classList.add('drag'); setFrom(e.clientX); });
    el.addEventListener('pointermove', e => { if (el.hasPointerCapture(e.pointerId)) setFrom(e.clientX); });
    const end = () => { if (el.classList.contains('drag')) { el.classList.remove('drag'); ctx.bus.emit('sfx', 'click'); } };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  });
}

export function pausePanel(body, data, ctx) {
  const m = data.mission;
  body.innerHTML = `<div class="hf-pause">
    <div class="pa-info">
      ${m ? `<span class="hf-label">Active contract</span><h3>${esc(m.title)}</h3><p>${esc(m.objective || '')}</p>` : '<span class="hf-label">Free roam</span><h3>No active contract</h3><p>Browse the board to take on work.</p>'}
      ${data.playtime ? `<div class="pa-pt">${icon('clock')}<span class="hf-num">${esc(data.playtime)}</span></div>` : ''}
    </div>
    <div class="pa-btns">
      <button class="hf-btn primary hf-live" data-a="resume">${icon('play')}Resume</button>
      <button class="hf-btn hf-live" data-a="contracts">${icon('contracts')}Contracts</button>
      <button class="hf-btn hf-live" data-a="warehouse">${icon('warehouse')}Warehouse</button>
      <button class="hf-btn hf-live" data-a="codex">${icon('codex')}Codex</button>
      <button class="hf-btn hf-live" data-a="settings">${icon('settings')}Settings</button>
      <button class="hf-btn danger hf-live" data-a="quit">${icon('exit')}Quit</button>
    </div>
  </div>`;
  body.querySelectorAll('[data-a]').forEach(b => onTap(b, () => {
    const a = b.dataset.a;
    haptic(); ctx.bus.emit('sfx', 'click');
    if (a === 'resume') { ctx.close(); ctx.bus.emit('pause:resume'); }
    else if (a === 'quit') { ctx.close(); ctx.bus.emit('pause:quit'); }
    else if (a === 'settings') ctx.open('settings');
    else ctx.bus.emit(a);
  }));
}
