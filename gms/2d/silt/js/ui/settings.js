import { h, tap } from './dom.js';
import { createSheet } from './sheet.js';

const QUALITY = [['auto', 'Auto'], ['high', 'High'], ['low', 'Low']];
const BIOME_FALLBACK = ['dune', 'abyss', 'kiln'];

function row(label, sub, ctl) {
  return h('div', { class: 'row' },
    h('div', {}, h('span', { class: 'row-lab', text: label }), sub ? h('span', { class: 'row-sub', text: sub }) : null),
    h('div', { class: 'row-ctl' }, ctl));
}

function slider(value, onInput) {
  const el = h('input', { type: 'range', min: '0', max: '100', value: String(Math.round(value * 100)) });
  const paint = () => el.style.setProperty('--fill', el.value + '%');
  paint();
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('input', () => { paint(); onInput(+el.value / 100); });
  return el;
}

function seg(options, current, onPick) {
  const el = h('div', { class: 'seg' });
  const btns = options.map(([v, label]) => {
    const b = tap(h('button', { class: v === current ? 'on' : '', text: label }), () => {
      for (const x of btns) x.classList.toggle('on', x === b);
      onPick(v);
    });
    el.append(b);
    return b;
  });
  return el;
}

function toggle(on, onFlip) {
  const el = tap(h('button', { class: 'tog' + (on ? ' on' : ''), 'aria-label': 'toggle' }), () => {
    const now = !el.classList.contains('on');
    el.classList.toggle('on', now);
    onFlip(now);
  });
  return el;
}

export function createSettings(deps) {
  const sheet = createSheet('SETTINGS', 'sound · look · feel', deps.onClose);
  let built = false;

  function save() { return (window.__game && window.__game.save) || null; }

  function set(k, v) {
    const s = save();
    if (s && s.setSetting) s.setSetting(k, v);
  }

  function applyVolume() {
    const s = save();
    const a = window.__game && window.__game.audio;
    if (s && a && a.setVolume) a.setVolume(s.settings.music, s.settings.sfx);
  }

  async function build() {
    built = true;
    const s = save();
    const st = (s && s.settings) || { music: 0.6, sfx: 0.8, biome: 'dune', quality: 'auto', haptics: true };

    let biomes = BIOME_FALLBACK;
    try {
      const m = await import('../gfx/biomes.js');
      if (m && Array.isArray(m.BIOME_NAMES) && m.BIOME_NAMES.length) biomes = m.BIOME_NAMES;
    } catch { /* lane A not landed; the three defaults are right anyway */ }

    // .filter(Boolean): replaceChildren is a DOM call, not h()'s child list —
    // a null argument becomes the literal text "null" on the page.
    sheet.body.replaceChildren(...[
      row('Music', null, slider(st.music, (v) => { set('music', v); applyVolume(); })),
      row('Effects', null, slider(st.sfx, (v) => { set('sfx', v); applyVolume(); deps.blip && deps.blip(); })),
      // AUTO FIRST, and it is not a nicety. 'auto' is the default and it means
      // "follow the mode's own biome" — but it was not one of the options, so
      // the segment opened with nothing lit (reading as broken), and one tap
      // pinned EVERY mode to a single biome with no way back short of clearing
      // localStorage. That silently undid the per-mode biome work: pick Abyss
      // once and ALCHEMY, which declares kiln, renders abyss forever.
      row('Biome', 'palette and light rig',
        seg([['auto', 'Auto'], ...biomes.map((b) => [b, b[0].toUpperCase() + b.slice(1)])], st.biome, (v) => {
          set('biome', v);
          const g = window.__game;
          // 'auto' has no biome of its own to show; ask the host what the mode
          // it is currently running wants, which is the same call startGame makes.
          if (v === 'auto') { g && g.applyBiome && g.applyBiome(); return; }
          if (g && g.renderer && g.renderer.setBiome) g.renderer.setBiome(v);
        })),
      row('Quality', 'lower this if the sand stutters',
        seg(QUALITY, st.quality, (v) => {
          set('quality', v);
          const R = window.__game && window.__game.renderer;
          if (R && R.setQuality) R.setQuality(v);
        })),
      // Only offered where it can actually happen. iOS Safari has no
      // navigator.vibrate, and a switch that cannot do the thing it names is
      // worse than an absent one — this row promised "a tick on landing and on
      // a chain" for a whole release while nothing read the flag at all.
      navigator.vibrate ? row('Haptics', 'a tick on landing and on a chain',
        toggle(st.haptics !== false, (v) => {
          set('haptics', v);
          if (v) navigator.vibrate(8);
        })) : null,
      h('div', { class: 'row row--note', style: { justifyContent: 'center' } },
        h('span', { class: 'row-sub', style: { marginTop: '0', textAlign: 'center' },
          text: 'SILT — a falling-sand puzzle. Best scores live on this device.' })),
    ].filter(Boolean));
  }

  return {
    el: sheet.el,
    async show() { if (!built) await build(); sheet.show(); },
    hide() { sheet.hide(); },
    get open() { return sheet.open; },
  };
}
