import { el, btn } from './dom.js?v=20261004c';
import { BUILD } from '../core/version.js?v=20261004c';
import { section, toggle, seg } from './kit.js?v=20261004c';

const KEY = 'il2.save', BAK = 'il2.save.bak';
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
  if (window.__il2) window.__il2.persistOff = true;
  applyPending();
  location.replace(location.pathname + (value === null ? '?reset=1' : ''));
}

export function fillSettings(body, ctx) {
  const { game, host, model } = ctx;
  const set = (key, value) => { game.act('setting', { key, value }); ctx.textNow(); };
  const ups = [];

  const s1 = section(body);
  ups.push(toggle(s1, {
    icon: '🔊', label: 'Sound',
    get: () => model.setting('sound', true) !== false,
    set: (v) => { set('sound', v); ctx.audio.set(v); if (v) ctx.audio.sfx.pop(); },
  }));
  if ('vibrate' in navigator) ups.push(toggle(s1, { icon: '📳', label: 'Haptics', get: () => model.setting('haptics', true) !== false, set: (v) => set('haptics', v) }));
  ups.push(seg(s1, {
    icon: '🎨', label: 'Quality',
    options: [['auto', 'Auto'], ['battery', 'Battery'], ['high', 'High']],
    get: () => (model.setting('tier', 'auto') === 'low' ? 'battery' : model.setting('tier', 'auto')),
    set: (v) => { set('tier', v); host.setTier(v); },
  }));
  ups.push(toggle(s1, {
    icon: '📏', label: 'Compact calm lines',
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
    a.download = `idle-life-2-save-${new Date().toISOString().slice(0, 10)}.txt`;
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
    try { const env = JSON.parse(text); ok = env && env.game === 'il2' && typeof env.s === 'object'; } catch {}
    if (!ok) { ctx.toast('⚠️ Not a save'); return; }
    restart(text);
  });
  box.append(ta, file, load);
  s2.appendChild(box);

  const s3 = section(body);
  const reset = btn('pill danger', '🗑️ Reset', () => { confirm.hidden = false; reset.hidden = true; });
  const confirm = el('div', 'confirm');
  confirm.hidden = true;
  confirm.append(
    el('span', '', 'Erase everything?'),
    btn('pill', 'Keep', () => { confirm.hidden = true; reset.hidden = false; }),
    btn('pill danger', 'Erase', () => restart(null)),
  );
  s3.append(reset, confirm);

  body.appendChild(el('p', 'version', `Idle Life 2 · ${BUILD}`));
  armLateWrite(window.__il2?.lifecycle);
  const update = () => ups.forEach((u) => u());
  return update;
}
