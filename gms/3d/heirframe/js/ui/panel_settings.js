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
  const s = store.settings, st = ctx.state;
  const row = (ic, label, ctl, sub = '') => `<div class="st-row"><span class="st-ic">${icon(ic)}</span><div class="st-l"><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div>${ctl}</div>`;
  const booted = window.__hfTier || 'high';
  const want = s.quality === 'auto' ? null : s.quality;
  const restart = want && want !== booted ? `<button class="hf-btn gold hf-live st-restart" data-a="restart">${icon('reroll')}Restart to apply</button>` : '';
  const save = st.saveView === 'export' ? `<div class="st-save">
      <small>${st.exp?.ok ? esc(`${st.exp.name} · Gen ${st.exp.gen} · level ${st.exp.level} · ${Number(st.exp.credits || 0).toLocaleString('en-US')} cr · ${st.exp.hours} h`) : esc(st.exp?.error || 'Saving…')}</small>
      ${st.exp?.ok ? `<textarea class="st-code" readonly rows="3">${esc(st.exp.text)}</textarea><div class="st-row2"><button class="hf-btn hf-live" data-a="copy">${icon('check')}Copy</button><button class="hf-btn hf-live" data-a="download">${icon('down')}Download file</button><button class="hf-btn ghost hf-live" data-a="back">Close</button></div>` : '<div class="st-row2"><button class="hf-btn ghost hf-live" data-a="back">Close</button></div>'}</div>`
    : st.saveView === 'import' ? `<div class="st-save">
      <textarea class="st-code st-in" rows="3" placeholder="Paste a HEIRFRAME save here">${esc(st.impText || '')}</textarea>
      <small class="${st.imp?.ok === false ? 'bad' : ''}">${st.imp ? (st.imp.ok ? esc(`Found: ${st.imp.name} · Gen ${st.imp.gen} · level ${st.imp.level} · ${st.imp.hours} h. It will replace your current save.`) : esc('Not a valid save: ' + st.imp.error)) : 'Paste the text, or load a .txt file you exported.'}</small>
      <div class="st-row2"><label class="hf-btn hf-live st-file">${icon('up')}Load file<input type="file" accept=".txt,.json,text/plain" hidden></label>
        <button class="hf-btn hf-live" data-a="check">Check</button>
        ${st.imp?.ok ? `<button class="hf-btn ${st.confirmImp ? 'danger' : 'gold'} hf-live" data-a="apply">${st.confirmImp ? 'Confirm: replace my save' : 'Replace my save'}</button>` : ''}
        <button class="hf-btn ghost hf-live" data-a="back">Close</button></div></div>`
    : `<div class="st-row2"><button class="hf-btn hf-live" data-a="export">${icon('down')}Export save</button><button class="hf-btn hf-live" data-a="import">${icon('up')}Import save</button></div>`;
  body.innerHTML = `<div class="hf-settings">
    <section><span class="hf-label">Display &amp; Controls</span>
      ${row('quality', 'Graphics', seg('quality', [['auto', 'Auto'], ['low', 'Low'], ['med', 'Med'], ['high', 'High']], s.quality), `running: ${booted}${want && want !== booted ? ` · ${want} after a restart` : ''}`)}
      ${restart}
      ${row('joystick', 'Layout', seg('joystick', [['left', 'Standard'], ['right', 'Left-handed']], s.joystick), 'left-handed mirrors the stick and the buttons')}
      ${row('joystick', 'Button size', seg('buttons', [['s', 'S'], ['m', 'M'], ['l', 'L']], s.buttons || 'm'))}
      ${row('subtitles', 'Subtitles', tog('subtitles', s.subtitles))}
      ${row('vibrate', 'Haptics', tog('haptics', s.haptics))}
    </section>
    <section><span class="hf-label">Audio</span>
      ${row('volume', 'Master', slider('master', s.master ?? 1))}
      ${row('volume', 'Music', slider('music', s.music))}
      ${row('volume', 'Effects', slider('sfx', s.sfx))}
      ${row('talk', 'Voice', slider('voice', s.voice))}
      ${row('volume', 'Ambience', slider('ambient', s.ambient ?? 0.7))}
      <span class="hf-label">Save</span>${save}
    </section>
  </div>`;

  const commit = () => ctx.applySettings({ ...s });
  body.querySelectorAll('.st-seg button').forEach(b => onTap(b, () => {
    const k = b.parentElement.dataset.k;
    s[k] = b.dataset.v;
    if (k === 'quality') s.qualityPicked = true;
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    haptic(); ctx.bus.emit('sfx', 'click'); commit();
    if (k === 'quality') ctx.rerender();
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
  // save export / import
  const ta = body.querySelector('.st-in');
  if (ta) { ['pointerdown', 'touchstart', 'keydown'].forEach(ev => ta.addEventListener(ev, e => e.stopPropagation(), { passive: ev !== 'keydown' })); ta.addEventListener('input', () => { st.impText = ta.value; st.imp = null; st.confirmImp = false; }); }
  const file = body.querySelector('.st-file input');
  if (file) file.addEventListener('change', async () => { const f = file.files?.[0]; if (!f) return; st.impText = (await f.text()).trim(); check(); });
  const check = () => ctx.bus.emit('save:check', { text: st.impText || '', cb: r => { st.imp = r; st.confirmImp = false; ctx.rerender(); } });
  body.querySelectorAll('[data-a]').forEach(b => onTap(b, () => {
    const a = b.dataset.a;
    haptic(); ctx.bus.emit('sfx', 'click');
    if (a === 'restart') ctx.bus.emit('game:restart');
    else if (a === 'export') { st.saveView = 'export'; st.exp = null; ctx.bus.emit('save:export', { cb: r => { st.exp = r; ctx.rerender(); } }); ctx.rerender(); }
    else if (a === 'import') { st.saveView = 'import'; st.imp = null; ctx.rerender(); }
    else if (a === 'back') { st.saveView = null; st.confirmImp = false; ctx.rerender(); }
    else if (a === 'copy') { const t = body.querySelector('.st-code'); t?.select(); navigator.clipboard?.writeText(st.exp?.text || '').then(() => ctx.toast?.('Save copied', 'good'), () => ctx.toast?.('Select the text and copy it', 'info')); }
    else if (a === 'download') { const url = URL.createObjectURL(new Blob([st.exp?.text || ''], { type: 'text/plain' })); const l = document.createElement('a'); l.href = url; l.download = `heirframe-${(st.exp?.name || 'save').toLowerCase()}-gen${st.exp?.gen || 1}-l${st.exp?.level || 1}.txt`; document.body.append(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
    else if (a === 'check') check();
    else if (a === 'apply') {
      if (!st.confirmImp) { st.confirmImp = true; ctx.rerender(); return; }
      ctx.bus.emit('save:import', { text: st.impText, cb: r => { if (r.ok) ctx.toast?.('Save imported · restarting', 'good'); else { st.imp = r; ctx.rerender(); } } });
    }
  }));
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
