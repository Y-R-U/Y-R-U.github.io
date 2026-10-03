import { el, btn } from './dom.js?v=20261004d';
import { BUILD } from '../core/version.js?v=20261004d';
import { section, toggle, seg, slider } from './kit.js?v=20261004d';

const KEY = 'iw2.save', BAK = 'iw2.save.bak';
let pending;

function applyPending() {
  if (pending === undefined) return;
  try {
    if (pending === null) { localStorage.removeItem(KEY); localStorage.removeItem(BAK); }
    else { localStorage.setItem(KEY, pending); localStorage.removeItem(BAK); }
  } catch {}
}

let armed = false;
function armLateWrite(lifecycle) {
  if (armed) return;
  armed = true;
  setTimeout(() => {
    lifecycle?.on?.('pagehide', applyPending);
    lifecycle?.on?.('suspend', applyPending);
  }, 0);
  addEventListener('pagehide', applyPending);
  addEventListener('visibilitychange', applyPending);
}

function restart(value) {
  pending = value;
  if (window.__iw2) window.__iw2.persistOff = true;
  applyPending();
  location.replace(location.pathname + (value === null ? '?reset=1' : ''));
}

export function fillSettings(body, ctx) {
  const { game, host, model } = ctx;
  const set = (key, value) => { game.act('setting', { key, value }); ctx.audio.applyVolumes(); ctx.textNow(); };
  const ups = [];

  const s0 = section(body, 'Sound');
  ups.push(toggle(s0, {
    icon: '🔊', label: 'Sound',
    get: () => model.setting('sound', true) !== false,
    set: (v) => { set('sound', v); ctx.audio.set(v); if (v) ctx.audio.sfx.pop(); },
  }));
  for (const [k, icon, label, def] of [['voice', '🗣️', 'Voices', 0.9], ['music', '🎻', 'Music', 0.55], ['sfx', '🔔', 'Effects & piano', 0.8]]) {
    ups.push(slider(s0, {
      icon, label,
      get: () => (model.setting('mute.' + k, false) ? 0 : model.setting('vol.' + k, def)),
      set: (v) => { set('vol.' + k, v); if (v > 0 && model.setting('mute.' + k, false)) set('mute.' + k, false); },
      muted: () => !!model.setting('mute.' + k, false),
      mute: (m) => set('mute.' + k, m),
      preview: () => { if (k === 'sfx') ctx.audio.sfx.kaching(); },
    }));
  }

  const s1 = section(body, 'Saloon rules');
  ups.push(toggle(s1, {
    icon: '⛪', label: 'Sunday School (clean jokes)',
    get: () => model.sunday(),
    set: (v) => { game.act('sunday', { on: v }); ctx.textNow(); ctx.toast(v ? '⛪ Sunday School: hats off, language clean' : '🥃 Back to the saloon'); },
  }));
  if ('vibrate' in navigator) ups.push(toggle(s1, { icon: '📳', label: 'Haptics', get: () => model.setting('haptics', true) !== false, set: (v) => set('haptics', v) }));
  ups.push(seg(s1, {
    icon: '🎨', label: 'Quality',
    options: [['auto', 'Auto'], ['battery', 'Battery'], ['high', 'High']],
    get: () => (model.setting('tier', 'auto') === 'low' ? 'battery' : model.setting('tier', 'auto')),
    set: (v) => { set('tier', v); host.setTier(v); },
  }));
  ups.push(toggle(s1, {
    icon: '📏', label: 'Compact calm cards',
    get: () => model.setting('compact', false) === true,
    set: (v) => set('compact', v),
  }));
  ups.push(toggle(s1, {
    icon: '🫧', label: 'Reduce motion',
    get: () => model.setting('reducedMotion', matchMedia('(prefers-reduced-motion: reduce)').matches),
    set: (v) => { set('reducedMotion', v); document.documentElement.classList.toggle('calm', v); },
  }));

  const s2 = section(body, 'Save');
  const row = el('div', 'btn-row');
  const exp = btn('pill', '⬇️ Export', async () => {
    const text = game.serialize();
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch {}
    const a = el('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = `idle-western-2-save-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    ctx.toast(copied ? '📋 Copied + saved' : '⬇️ Saved');
  });
  const imp = btn('pill', '⬆️ Import', () => { box.hidden = !box.hidden; if (!box.hidden) ta.focus(); });
  row.append(exp, imp);
  s2.appendChild(row);
  const box = el('div', 'import');
  box.hidden = true;
  const ta = el('textarea');
  ta.rows = 3;
  ta.placeholder = 'Paste save…';
  const file = el('input');
  file.type = 'file';
  file.accept = '.txt,.json,text/plain';
  file.addEventListener('change', async () => { if (file.files[0]) ta.value = await file.files[0].text(); });
  const load = btn('pill gold', 'Load', () => {
    const text = ta.value.trim();
    let ok = false;
    try { const env = JSON.parse(text); ok = env && env.game === 'iw2' && typeof env.s === 'object'; } catch {}
    if (!ok) { ctx.toast('⚠️ Not a save'); return; }
    restart(text);
  });
  box.append(ta, file, load);
  s2.appendChild(box);

  const s3 = section(body);
  const reset = btn('pill danger', '🗑️ Reset', () => { confirmRow.hidden = false; reset.hidden = true; });
  const confirmRow = el('div', 'confirm');
  confirmRow.hidden = true;
  confirmRow.append(
    el('span', '', 'Burn the whole town down?'),
    btn('pill', 'Keep', () => { confirmRow.hidden = true; reset.hidden = false; }),
    btn('pill danger', 'Erase', () => restart(null)),
  );
  s3.append(reset, confirmRow);

  body.appendChild(el('p', 'version', `Idle Western 2 · ${BUILD}`));
  armLateWrite(window.__iw2?.lifecycle);
  const update = () => ups.forEach((u) => u());
  return update;
}
