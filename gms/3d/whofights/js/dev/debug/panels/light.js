// Time of day, the sun, and the exposure. Everything is driven through the quality registry that
// js/world/lighting.js and js/engine/app.js already register, so there is no second copy of any
// of these values and a preset change is reflected here.

import { hourOf, isNight, lastBell, DAWN, DUSK } from '../../../game/clock.js';
import { handles } from '../game.js';
import { h, section, table, button, slider, clear, num } from '../ui.js';

const TIMES = [
  ['Dawn', 5.8], ['Morning', 8.5], ['Noon', 12], ['Afternoon', 15.5],
  ['Dusk', 20.2], ['Night', 23], ['Deep night', 2.5],
];

const GROUPS = {
  Light: ['sunPower', 'envPower', 'skyFill', 'moonPower', 'nightLift', 'nightSky', 'windowLights', 'windowPower', 'windowReach', 'windowGlow'],
  World: ['time', 'fogAmount', 'cloudCover', 'viewDist'],
  Renderer: ['exposure', 'shadows', 'shadowMap', 'shadowDist', 'shadowSoft', 'shadowRate'],
};

export const panel = {
  id: 'light',
  label: 'Time & light',

  mount(el, ctx) {
    const q = handles(ctx).quality;
    const readout = h('div');
    const dials = h('div', 'dbg-cols');
    const bar = h('div', 'row');

    if (!q) return void el.append(h('div', 'empty', 'no quality registry — the engine is not up'));

    const timeSlider = slider({
      label: 'Time of day', min: 0, max: 24, step: 0.05,
      get: () => q.get('time') ?? 10.5,
      set: v => { q.set('time', v); paint(); },
      fmt: v => clockOf(v),
    });

    for (const [label, t] of TIMES) {
      bar.append(button(label, '', () => { q.set('time', t); timeSlider.sync(); paint(); }));
    }
    let run = 0;
    bar.append(button('▶ Run the day', '', e => {
      if (run) { clearInterval(run); run = 0; e.target.textContent = '▶ Run the day'; e.target.className = ''; return; }
      e.target.textContent = '■ Stop';
      e.target.className = 'primary';
      run = setInterval(() => {
        q.set('time', (q.get('time') + 0.15) % 24);
        timeSlider.sync();
        paint();
      }, 60);
    }));
    this._stop = () => clearInterval(run);

    el.append(
      section('Time of day', bar, timeSlider, readout,
        h('p', 'dbg-note', 'Who Fights has no running world clock yet — `time` is a lighting knob, '
          + 'and js/game/clock.js is pure arithmetic nothing calls. The derived row below is what a '
          + 'clock wired to this hour would say.')),
      section('Dials', dials));

    for (const [group, keys] of Object.entries(GROUPS)) {
      const card = h('div', 'dbg-card');
      card.append(h('h3', null, group));
      let any = false;
      for (const key of keys) {
        const k = q.knobs.get(key);
        if (!k || key === 'time') continue;
        any = true;
        card.append(dial(q, k.schema));
      }
      if (any) dials.append(card);
    }

    function paint() {
      const g = handles(ctx);
      const t = q.get('time') ?? 10.5;
      const sun = g.w?.app?.scene?.getObjectByProperty?.('isDirectionalLight', true);
      clear(readout).append(table(null, [
        ['hour', clockOf(hourOf(t))],
        ['night', { html: isNight(hourOf(t)) ? 'yes' : 'no', cls: isNight(hourOf(t)) ? 'warnc' : 'good' }],
        ['dawn / dusk', `${clockOf(DAWN)} / ${clockOf(DUSK)}`],
        ['last bell', lastBell(t).id],
        ['sun position', sun ? `${num(sun.position.x, 1)}, ${num(sun.position.y, 1)}, ${num(sun.position.z, 1)}` : '—'],
        ['sun elevation', sun ? `${num(Math.atan2(sun.position.y, Math.hypot(sun.position.x, sun.position.z)) * 180 / Math.PI, 1)}°` : '—'],
        ['sun intensity', sun ? num(sun.intensity, 2) : '—'],
        ['exposure', num(g.renderer?.toneMappingExposure, 2)],
        ['shadow map', `${q.get('shadows')} · ${q.get('shadowMap')}px · ${q.get('shadowDist')}m`],
      ]));
    }

    paint();
    this._t = setInterval(paint, 900);
  },

  unmount() { clearInterval(this._t); this._stop?.(); },
};

const clockOf = t => {
  const hAll = hourOf(t);
  const hh = Math.floor(hAll);
  return `${String(hh).padStart(2, '0')}:${String(Math.floor((hAll - hh) * 60)).padStart(2, '0')}`;
};

function dial(q, s) {
  if (s.type === 'range') {
    return slider({
      label: s.label, min: s.min, max: s.max, step: s.step,
      get: () => q.get(s.key) ?? s.default ?? s.min,
      set: v => q.set(s.key, v),
      fmt: v => num(v, s.step >= 1 ? 0 : 2),
    });
  }
  const row = h('div', 'dbg-knob');
  const head = h('div', 'dbg-knob-head');
  head.append(h('span', null, s.label));
  row.append(head);
  const sel = h('select');
  for (const o of s.options || []) {
    const op = h('option', null, String(o));
    op.value = String(o);
    sel.append(op);
  }
  sel.value = String(q.get(s.key));
  sel.onchange = () => q.set(s.key, isNaN(+sel.value) ? sel.value : +sel.value);
  row.append(sel);
  return row;
}
