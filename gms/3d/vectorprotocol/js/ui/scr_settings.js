import { h } from './dom.js';
import { header, btn, confirmBox } from './components.js';
import { snd } from '../app/sound.js';
import { orient } from '../app/orient.js';

export function mount(root, ctx) {
  const { store, router } = ctx;
  const seg = (key, opts, label, note, reload) => h('div.st-row.vp-panel.dim',
    h('div.grow', h('b', label), note ? h('small.t-muted', note) : null),
    h('div.st-seg', opts.map(([v, t]) => h('button' + (store.settings[key] === v ? '.on' : ''), { type: 'button', onclick: () => {
      store.setSetting(key, v); if (reload) ctx.toast('Applies on next launch'); router.reload(); } }, t))));
  // audio (js/audio): volumes persist inside the audio module itself
  const vol = (key, label) => {
    const v0 = Math.round((snd.getVolumes()?.[key] ?? 0.8) * 100);
    const out = h('b.st-val', v0 + '%');
    const inp = h('input.st-range', { type: 'range', min: 0, max: 100, step: 5, value: v0, 'aria-label': label + ' volume',
      oninput: () => { out.textContent = inp.value + '%'; snd.setVolumes({ [key]: inp.value / 100 }); },
      onchange: () => { if (key === 'sfx') snd.sfx('ui_tap'); } });
    return h('div.st-row.vp-panel.dim.st-vol', h('div.st-vlbl', h('b', label), out), inp);
  };
  const muteSeg = () => h('div.st-row.vp-panel.dim', h('div.grow', h('b', 'Sound'), h('small.t-muted', snd.on ? 'Music and effects' : 'Audio module offline')),
    h('div.st-seg', [[false, 'On'], [true, 'Muted']].map(([m, t]) => h('button' + (snd.muted === m ? '.on' : ''), { type: 'button', onclick: (e) => {
      snd.mute(m); e.currentTarget.parentNode.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); } }, t))));
  const tier = ctx.engine?.quality?.name || ctx.engine?.tier?.name || 'n/a';
  root.append(header('Settings', () => router.go('/hub')),
    h('div.st-list.scroll',
      seg('quality', [['auto', 'Auto'], ['low', 'Low'], ['med', 'Med'], ['high', 'High']], 'Graphics', 'Current: ' + tier, true),
      // D24a: wide windows get the landscape layouts; "Portrait column" brings back the D3 column (not offered on phones)
      orient.form !== 'phone' ? seg('layout', [['auto', 'Auto'], ['portrait', 'Portrait column']], 'Layout', 'Auto = wide layouts when the window is wide') : null,
      seg('speed', [[1, '×1'], [2, '×2'], [4, '×4']], 'Battle speed', 'Default for new battles'),
      seg('auto', [[true, 'On'], [false, 'Off']], 'Auto Overdrive', 'Off = tap glowing portraits to fire'),
      seg('damageNumbers', [[true, 'On'], [false, 'Off']], 'Damage numbers'),
      seg('hints', [[true, 'On'], [false, 'Off']], 'Field manual tips', 'First-contract hints'),
      muteSeg(), vol('music', 'Music'), vol('sfx', 'Effects'),
      h('div.st-row.vp-panel.dim', h('div.grow', h('b', 'Company save'), h('small.t-muted', 'Backend: ' + store.backend + ' · stored on this device')),
        btn('Reset', async () => { if (await confirmBox('Reset company?', 'All units, progress and currencies on this device will be wiped.', 'Wipe', 'Keep')) { store.reset(); ctx.toast('Company reset'); router.go('/hub'); } }, { cls: 'danger sm' })),
      h('div.st-about', h('b', 'VECTOR PROTOCOL'), h('small.t-muted', 'Mercenary Combat League · build ' + document.lastModified))));
  return { topbar: true, bg: 'on' };
}
